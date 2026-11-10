"""The methods that take more than one model call: the panel and the debate.

Each call is a separate run on the writer's model, so no answer pretends to be several reviewers at once.

- ``panel``   three reviewers (the newcomer, the skeptic, the line editor) read the piece in three calls at
              the same time. Each one's findings are pinned to the writer's words on their own. A reviewer
              whose call fails keeps its place with a plain message; the panel fails only if all three do.
              Where two reviewers mark overlapping passages is worked out here, not by the model.
- ``debate``  starts from the panel's saved reviews (and runs the panel first when the piece has none).
              One call picks the disagreement that matters; side A argues, side B answers A, and a last
              call says what moved, what is still open, and the question the writer has to decide.

``ask(request)`` is ``Editor.ask``; ``step(text)`` records what the pass is doing for the page.
"""

from __future__ import annotations

import asyncio

try:
    from . import gateway, library
except ImportError:  # loaded as loose modules (tests)
    import gateway  # type: ignore
    import library  # type: ignore


class Tally:
    """Tokens and who answered, across every call of one pass."""

    def __init__(self):
        self.tokens_in = self.tokens_out = 0
        self.model = self.provider = self.finish_reason = None

    def add(self, answer: dict):
        self.tokens_in += answer.get("tokens_in") or 0
        self.tokens_out += answer.get("tokens_out") or 0
        self.model = self.model or answer.get("model")
        self.provider = self.provider or answer.get("provider")
        self.finish_reason = answer.get("finish_reason") or self.finish_reason

    def meta(self) -> dict:
        return {"model": self.model or "", "provider": self.provider or "", "tokens_in": self.tokens_in,
                "tokens_out": self.tokens_out, "finish_reason": self.finish_reason}


async def panel(ask, steps: list[dict], body: str, selection, tally: Tally, step) -> dict:
    done = 0
    step(f"Three reviewers are reading (0 of {len(steps)} done)")

    async def one(req):
        nonlocal done
        try:
            answer = await ask(req)
            tally.add(answer)
            try:
                result = library.check("findings", answer["data"], body, selection)
            except ValueError as e:
                raise gateway.EditorError(str(e) if str(e) in gateway.MESSAGES else "unreadable")
            return {"id": req["reviewer"], "name": req["name"], "status": "done", "summary": result["summary"],
                    "findings": result["findings"], "counts": result["counts"]}
        except gateway.EditorError as e:
            return {"id": req["reviewer"], "name": req["name"], "status": "failed", "code": e.code, "message": gateway.message(e.code),
                    "summary": "", "findings": []}
        finally:
            done += 1
            step(f"Three reviewers are reading ({done} of {len(steps)} done)")

    reviewers = await asyncio.gather(*(one(r) for r in steps))
    ok = [r for r in reviewers if r["status"] == "done"]
    if not ok:
        raise gateway.EditorError(reviewers[0].get("code") or "failed")
    return {"reviewers": reviewers, "agreements": agreements(ok)}


def agreements(reviewers: list[dict]) -> list[dict]:
    """Passages that two or more reviewers marked, merged where their marks overlap."""
    marks = sorted(((f["start"], f["end"], r["id"], r["name"], f["issue"]) for r in reviewers for f in r["findings"]), key=lambda m: m[0])
    groups = []
    for s, e, rid, name, issue in marks:
        g = groups[-1] if groups else None
        if g and s < g["end"]:
            g["end"] = max(g["end"], e)
            g["notes"].append({"reviewer": rid, "name": name, "issue": issue})
        else:
            groups.append({"start": s, "end": e, "notes": [{"reviewer": rid, "name": name, "issue": issue}]})
    out = []
    for g in groups:
        if len({n["reviewer"] for n in g["notes"]}) > 1:
            out.append({**g, "reviewers": sorted({n["reviewer"] for n in g["notes"]})})
    return out


def _pin(body, quote):
    span = library.anchor(body, quote or "")
    return {"start": span[0], "end": span[1], "quote": body[span[0]:span[1]]} if span else None


async def debate(ask, title: str, body: str, panel_result: dict, ctx: dict, tally: Tally, step) -> dict:
    names = {r["id"]: r["name"] for r in panel_result["reviewers"]}
    ready = [r["id"] for r in panel_result["reviewers"] if r["status"] == "done"]
    if len(ready) < 2:
        raise gateway.EditorError("unreadable", "fewer than two reviews")

    async def call(kind, **kw):
        answer = await ask(library.debate_request(kind, title, body, panel_result, ctx=ctx, **kw))
        tally.add(answer)
        if not isinstance(answer["data"], dict):
            raise gateway.EditorError("unreadable")
        return answer["data"]

    step("Choosing the disagreement that matters")
    data = await call("frame")
    sides = [s for s in data.get("sides") or [] if isinstance(s, dict) and s.get("reviewer") in ready]
    question = library._text(data.get("question"), 600)
    if len(sides) < 2 or sides[0]["reviewer"] == sides[1]["reviewer"] or not question:
        raise gateway.EditorError("unreadable", "frame")
    frame = {"question": question, "sides": [{"reviewer": s["reviewer"], "position": library._text(s.get("position"), 800),
                                              "quote": s.get("quote", "")} for s in sides[:2]]}
    said, out_sides = [], []
    for k, s in zip("AB", frame["sides"]):
        step(f"{names[s['reviewer']]} {'makes the case' if k == 'A' else 'answers'}")
        arg = await call("argue", frame=frame, said=said)
        argument = library._text(arg.get("argument"), 3000)
        if not argument:
            raise gateway.EditorError("unreadable", "argue")
        said.append((f"Side {k} ({names[s['reviewer']]})", argument))
        quotes = [q for q in (_pin(body, x) for x in (arg.get("quotes") or [])[:3] if isinstance(x, str)) if q]
        out_sides.append({"side": k, "reviewer": s["reviewer"], "name": names[s["reviewer"]], "position": s["position"],
                          "passage": _pin(body, s["quote"]), "argument": argument, "concedes": library._text(arg.get("concedes"), 600),
                          "quotes": quotes})
    step("Summing up where it stands")
    close = await call("close", frame=frame, said=said)
    end = {k: library._text(close.get(k), 800) for k in ("moved", "unresolved", "decision")}
    if not end["decision"]:
        raise gateway.EditorError("unreadable", "close")
    return {"question": question, "sides": out_sides, "close": end}
