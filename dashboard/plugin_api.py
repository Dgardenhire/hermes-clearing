"""Backend routes for The Clearing. Hermes mounts them at /api/plugins/clearing/.

The page (desktop/plugin.js) reaches these through ctx.rest. They keep the writer's pieces and versions
(store.py) and run editor passes on the writer's own Hermes model (gateway.py, library.py).

An editor pass never waits on one request: POST /passes starts it and returns its id at once, and the page
polls GET /passes/{id} about once a second until it is done, failed or stopped. When a pass ends the
backend also pushes ``plugin.clearing.pass.ended`` to the desktop, so the page can stop polling early.

The model's answer never touches the manuscript. A pass result holds notes, change records or proposed
openings, each pinned to the writer's exact words; the writer decides what, if anything, changes.

Hermes wraps each request in the requesting profile's settings scope, so the store and the model both
follow the profile the writer is in.
"""

from __future__ import annotations

import asyncio
import importlib.util
import re
import logging
import sys
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException


def _load_package():
    """Load the plugin folder as a package; Hermes imports dashboard APIs as loose files."""
    name = "clearing_dashboard_package"
    if name not in sys.modules:
        root = Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location(name, root / "__init__.py", submodule_search_locations=[str(root)])
        if spec is None or spec.loader is None:
            raise RuntimeError("Could not load The Clearing")
        package = importlib.util.module_from_spec(spec)
        sys.modules[name] = package
        spec.loader.exec_module(package)
    from importlib import import_module
    return tuple(import_module(f"{name}.{m}") for m in ("store", "library", "gateway", "docx", "home", "workflows", "pdf",
                                                        "intake", "dictation", "runtime"))


store, library, gateway, docx, home, workflows, pdf, intake, dictation, runtime = _load_package()
_log = logging.getLogger("hermes.plugins.clearing")
VERSION = "0.1.0"

EDITOR = gateway.Editor()  # PluginLlm is created on first use, inside Hermes
router = APIRouter()
_jobs: dict[str, asyncio.Task] = {}


_RETRY = "The Clearing couldn't do that. Try again."


def _plain(e, fallback=_RETRY) -> str:
    """The error's own words when they are a sentence The Clearing wrote; otherwise a plain fallback.
    A KeyError's quoted key or a JSON parser's "Expecting value: line 1" never reaches the writer."""
    text = "" if isinstance(e, (KeyError, UnicodeError)) else str(e).strip()
    if text[:1].isupper() and text[-1:] in ".?!":
        return text
    return fallback


def _fail(e):
    if isinstance(e, HTTPException):
        raise e
    if isinstance(e, LookupError):
        raise HTTPException(status_code=404, detail=_plain(e, "That piece or version is no longer here."))
    if isinstance(e, ValueError):
        raise HTTPException(status_code=400, detail=_plain(e))
    if isinstance(e, store.StoreError):
        raise HTTPException(status_code=503, detail=_plain(e, "Couldn't save. Your words are kept here until saving works."))
    _log.exception("clearing: unexpected error")
    raise HTTPException(status_code=500, detail="Something went wrong on The Clearing's side. Your words are unchanged.")


def _body(body) -> dict:
    if not isinstance(body, dict):
        raise ValueError(_RETRY)
    return body


def _seed():
    """A sample piece on first run, once. Never again after the writer deletes or changes it."""
    if store.meta_get("seeded"):
        return
    import json
    data = json.loads((library.ROOT / "sample.json").read_text(encoding="utf-8"))
    p = store.create_piece(data["title"], data["body"], sample=True)
    store.meta_set("seeded", True)
    store.meta_set("last", p["id"])
    _seed_read(p, data)


def _seed_read(piece: dict, data: dict):
    """The stored sample read (library/sample.json ``sample_read``): real model output from the bench run, with its
    model and date. Re-checked here as a live read is; stored as a finished pass with ``sample`` only if it passes."""
    saved = data.get("sample_read")
    if not isinstance(saved, dict) or not saved.get("made_by") or not saved.get("made_on"):
        return None
    try:
        result = sample_read_check(saved, piece["body"])
    except ValueError:
        _log.warning("clearing: the stored sample read no longer passes its checks; the sample opens without it")
        return None
    return store.add_sample_pass(piece["id"], "read", "read", result, saved["made_by"])


def sample_read_check(saved: dict, body: str) -> dict:
    """The checks a live read passes: every change and the cut pinned to these exact words, three changes, the
    verdict at most three sentences and not opening with praise."""
    counts = {"returned": 0, "matched": 0, "dropped": 0, "praise": 0}
    data = {"genre": saved.get("genre"), "verdict": saved.get("verdict"), "keep": saved.get("keep"), "changes": saved.get("changes"), "cut_first": saved.get("cut_first"),
            "holds": saved.get("holds", "")}
    cands = library.read_candidates(data, body, 0, len(body), True, counts)
    if counts["dropped"] or len(cands["changes"]) < library.READ_MIN or not cands["cut"]:
        raise ValueError("unreadable")
    out = library.finish_read(cands["verdict"], cands["changes"], cands["cut"], cands["holds"], counts,
                              {"made_by": str(saved["made_by"])[:120], "made_on": str(saved["made_on"])[:40]}, keep=cands["keep"],
                              genre=cands["genre"])
    if counts.get("keep_overlap"):
        raise ValueError("unreadable")
    if out["verdict"] != " ".join(str(saved.get("verdict") or "").split()):
        raise ValueError("unreadable")  # the cleaning changed it: it opened with praise or ran past three sentences
    return out


def _current():
    last = store.meta_get("last")
    if last:
        try:
            p = store.get_piece(last)
            if not p["trashed"]:
                return p
        except LookupError:
            pass
    pieces = store.list_pieces()
    if pieces:
        return store.get_piece(pieces[0]["id"])
    return store.create_piece()


def _startup():
    try:
        n = store.interrupt_stale_passes()
        if n:
            _log.info("clearing: %d editor pass(es) were cut short by a restart", n)
    except Exception:  # the store may not be reachable yet; the first request will say so
        _log.debug("clearing: startup check skipped", exc_info=True)


_startup()


# ---------- pieces ----------
@router.get("/health")
async def health():
    return {"ok": True, "version": VERSION, "task": gateway.TASK}


@router.get("/state")
async def get_state():
    try:
        _seed()
        current = _current()
        store.meta_set("last", current["id"])
        sample = store.sample_pass(current["id"]) if current.get("sample") else None
        return {"pieces": store.list_pieces(), "trash": len(store.list_pieces(trashed=True)), "current": current,
                "running": _view(store.running_pass(current["id"])), "version": VERSION, "settings": store.settings(),
                "sample_read": _view(sample) if sample else None}
    except Exception as e:
        _fail(e)


@router.get("/pieces")
async def get_pieces():
    try:
        return {"pieces": store.list_pieces(), "trash": store.list_pieces(trashed=True)}
    except Exception as e:
        _fail(e)


@router.post("/pieces")
async def post_piece(body: dict):
    try:
        b = _body(body)
        p = store.create_piece(b.get("title") or "", b.get("body") or "", reason="import" if b.get("imported") else "start")
        store.meta_set("last", p["id"])
        return p
    except Exception as e:
        _fail(e)


@router.get("/pieces/{piece_id}")
async def get_piece(piece_id: str):
    try:
        p = store.get_piece(piece_id)
        if not p["trashed"]:
            store.meta_set("last", p["id"])
        return p
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/save")
async def post_save(piece_id: str, body: dict):
    try:
        b = _body(body)
        return store.save_piece(piece_id, b.get("title"), b.get("body"), b.get("spans") if isinstance(b.get("spans"), list) else None)
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/trash")
async def post_trash(piece_id: str):
    try:
        store.trash_piece(piece_id)
        return {"pieces": store.list_pieces(), "current": _current()}
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/restore")
async def post_restore(piece_id: str):
    try:
        store.restore_piece(piece_id)
        store.meta_set("last", piece_id)
        return store.get_piece(piece_id)
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/delete")
async def post_delete(piece_id: str):
    """Delete forever: only a piece already in the trash, with its versions, passes and suggestions."""
    try:
        store.delete_piece(piece_id)
        return {"pieces": store.list_pieces(), "trash": store.list_pieces(trashed=True)}
    except Exception as e:
        _fail(e)


@router.post("/trash/empty")
async def post_empty_trash():
    try:
        n = store.empty_trash()
        return {"deleted": n, "pieces": store.list_pieces(), "trash": store.list_pieces(trashed=True)}
    except Exception as e:
        _fail(e)


@router.get("/pieces/{piece_id}/versions")
async def get_versions(piece_id: str):
    try:
        p = store.get_piece(piece_id)
        passes = []
        for x in store.list_passes(piece_id):
            try:
                x["title"] = library.target(x["target"])["title"]
            except ValueError:
                x["title"] = x["target"]
            passes.append(x)
        return {"versions": store.list_versions(piece_id), "finished": p["finished_version"], "usage": store.usage_for_piece(piece_id),
                "suggested": store.suggestions_used(piece_id), "passes": passes}
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/versions")
async def post_version(piece_id: str, body: dict):
    try:
        b = _body(body)
        spans = b.get("spans") if isinstance(b.get("spans"), list) else None
        if b.get("title") is not None or b.get("body") is not None or spans is not None:
            store.save_piece(piece_id, b.get("title"), b.get("body"), spans)
        return {"version": store.add_version(piece_id, b.get("reason") or "idle")}
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/versions/{version_id}/restore")
async def post_version_restore(piece_id: str, version_id: str):
    try:
        return store.restore_version(piece_id, version_id)
    except Exception as e:
        _fail(e)


@router.get("/versions/{version_id}")
async def get_version(version_id: str):
    try:
        return store.get_version(version_id)
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/finish")
async def post_finish(piece_id: str, body: dict):
    try:
        b = _body(body)
        return store.finish_piece(piece_id, b.get("title"), b.get("body"))
    except Exception as e:
        _fail(e)


# ---------- editor passes ----------
def _view(p: dict | None) -> dict | None:
    if p is None:
        return None
    t = None
    try:
        t = library.target(p["target"])
    except ValueError:
        pass
    end = p["finished"] or time.time()
    prog = p.get("progress") or {}
    return {"id": p["id"], "piece_id": p["piece_id"], "target": p["target"], "title": t["title"] if t else p["target"],
            "kind": p["kind"], "status": p["status"], "result": p["result"], "code": p["error_code"], "message": p["error"],
            "model": p["model"], "provider": p["provider"], "tokens_in": p["tokens_in"], "tokens_out": p["tokens_out"],
            "finish_reason": p["finish_reason"], "elapsed": round(end - p["created"], 1),
            "selection": p["request"].get("selection"), "body_length": p["request"].get("body_length"), "step": p.get("step"),
            "phase": p.get("phase") if p["status"] == "running" else None, "words": prog.get("words"),
            **({"sections": prog["sections"]} if isinstance(prog.get("sections"), dict) else {}),
            "fallback": bool(prog.get("fallback")), "sample": bool(p.get("sample")), "counts": p.get("counts")}


async def _run(pass_id: str, t: dict, request: dict, body: str, selection, ctx=None, title=""):
    step = lambda text: store.set_step(pass_id, text)
    phase = lambda name: store.set_phase(pass_id, name)
    try:
        if t["kind"] == "rewrite" and request.get("calls"):
            await _rewrite_three(pass_id, t, request, body, selection, ctx, title)
            return
        if t["kind"] == "read" and request.get("sections"):
            await _read_sections(pass_id, t, request, body, ctx, title)
            return
        if t["kind"] in ("panel", "debate"):
            tally = workflows.Tally()
            if t["kind"] == "panel":
                result = await workflows.panel(EDITOR.ask, request["steps"], body, selection, tally, step)
            else:
                saved = ctx.get("panel")
                if saved is None:
                    steps = library.panel_requests(library.target("method:panel"), title, body, None, ctx)
                    saved = await workflows.panel(EDITOR.ask, steps, body, None, tally, step)
                result = await workflows.debate(EDITOR.ask, title, body, saved, ctx, tally, step)
                result["panel"] = saved
            store.finish_pass(pass_id, status="done", result=result, **tally.meta())
            return
        t0 = time.monotonic()
        try:
            answer = await (_hedged(request, phase) if t["kind"] == "read" else EDITOR.ask(request, on_phase=phase))
        except gateway.EditorError as e:
            if e.code == "cut_off":
                store.finish_pass(pass_id, status="failed", error_code=e.code, error=gateway.message(e.code, t["kind"]), counts={"cut_off": 1})
                return
            raise
        phase("checking")
        try:
            result = library.check(t["kind"], answer["data"], body, selection, ctx)
            if t["kind"] == "read" and not selection and library.READ_GUARDS:
                result, answer = await _quiet_retry(result, answer, request, phase, body, ctx, time.monotonic() - t0)
            if t["kind"] == "findings":
                result = library.queue(result)  # the room walks the three best-ranked; the rest wait in "more"
            if t["kind"] == "opps" and len(result["opportunities"]) < OPPS_FEW:
                # Bench, Nov 9: one essay's answer named a single cut. A thin list is asked for once more; the longer one ships.
                try:
                    again = await EDITOR.ask(request, on_phase=phase)
                    other = library.check("opps", again["data"], body, selection, ctx)
                    if len(other["opportunities"]) > len(result["opportunities"]):
                        result, answer = other, again
                except (gateway.EditorError, ValueError):
                    pass
        except ValueError as e:
            raise gateway.EditorError(str(e) if str(e) in gateway.MESSAGES else "unreadable")
        store.finish_pass(pass_id, status="done", result=result, model=answer["model"], provider=answer["provider"],
                          tokens_in=answer["tokens_in"], tokens_out=answer["tokens_out"], finish_reason=answer["finish_reason"])
    except asyncio.CancelledError:
        store.finish_pass(pass_id, status="stopped", error_code="stopped", error=gateway.MESSAGES["stopped"])
        raise
    except gateway.EditorError as e:
        store.finish_pass(pass_id, status="failed", error_code=e.code, error=gateway.message(e.code, t["kind"]))
    except Exception:
        _log.exception("clearing: editor pass failed")
        store.finish_pass(pass_id, status="failed", error_code="failed", error=gateway.MESSAGES["failed"])
    finally:
        _jobs.pop(pass_id, None)
        _announce(pass_id)


HEDGE_AFTER = 45.0  # seconds: a read still out this long gets a twin call, and the first answer back wins
HEDGES = {"reads": 0, "fired": 0, "twin_won": 0}  # since start: how often the twin is sent, and how often it wins


async def _hedged(request: dict, phase, after: float | None = None) -> dict:
    """Read my piece's one call, deadline-aware (Loop 2 round 4). The bench's slow read was the model itself: one call
    took 158 s of model time for an answer the same prompt returns in 30 to 45 s, with no retry. So a read still out
    at HEDGE_AFTER sends the same request once more, takes whichever answer lands first and stops the other. A failure
    of one call waits for the other; only if both fail does the read fail."""
    after = HEDGE_AFTER if after is None else after
    HEDGES["reads"] += 1
    first = asyncio.ensure_future(EDITOR.ask(request, on_phase=phase))
    done, _ = await asyncio.wait({first}, timeout=after)
    if done:
        return first.result()
    HEDGES["fired"] += 1
    _log.info("clearing: a read is still out at %.0f s; sending its twin", after)
    second = asyncio.ensure_future(EDITOR.ask(request))
    pending = {first, second}
    error = None
    try:
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for d in done:
                if d.exception() is None:
                    HEDGES["twin_won"] += d is second
                    return d.result()
                error = error or d.exception()
        raise error
    finally:
        for k in pending:
            k.cancel()


RETRY_UNDER = 35.0  # seconds: a read that took longer ships its guarded result instead of trying again
RETRIES = {"reads": 0, "fired": 0, "better": 0}


async def _quiet_retry(result, answer, request, phase, body, ctx, took):
    """Round 5: a read that still fails a by-eye check after the guards (``library.read_problems``) is asked once more
    before anything is shown, when the first answer came back fast enough; the result with fewer problems ships."""
    RETRIES["reads"] += 1
    probs = library.read_problems(result, body)
    if probs and took < RETRY_UNDER:
        RETRIES["fired"] += 1
        try:
            again = await _hedged(request, phase)
            other = library.check("read", again["data"], body, None, ctx)
            if len(library.read_problems(other, body)) < len(probs):
                RETRIES["better"] += 1
                result, answer, probs = other, again, library.read_problems(other, body)
        except (gateway.EditorError, ValueError):
            pass
    result.setdefault("counts", {})["problems"] = probs
    return result, answer


async def _rewrite_three(pass_id, t, request, body, selection, ctx, title):
    """Rewrite with no move: three calls at once, one per move. Each option is published as it lands, in its move's
    order (tile A, B, C). On a 429 from any call the others are stopped and one call asks for the missing options."""
    calls = request["calls"]
    sel = body[selection["start"]:selection["end"]]
    slots: list = [None] * len(calls)
    tally = workflows.Tally()
    errors: list = []

    def publish():
        got = [o for o in slots if o]
        store.set_progress(pass_id, {"selection": {"start": selection["start"], "end": selection["end"], "text": sel},
                                     "options": got, "pending": sum(1 for o in slots if o is None)})

    def distinct(opt):
        return opt and not any(o and library.too_close(opt["text"], o["text"]) for o in slots)

    async def one(i, req):
        tries = 0
        while True:
            try:
                answer = await EDITOR.ask(req, on_phase=lambda n: store.set_phase(pass_id, n))
            except gateway.EditorError as e:
                errors.append(e)
                slots[i] = False
                if e.rate_limited:
                    raise
                return
            tally.add(answer)
            opt = library.one_option(answer["data"], body, sel, req.get("move") or "")
            if distinct(opt):
                slots[i] = opt
                publish()
                return
            tries += 1
            if tries > 1:  # one retry per slot (Loop 2): B and C only dropped a word on a real run
                slots[i] = False
                return
            near = (answer["data"] or {}).get("text") if isinstance(answer.get("data"), dict) else ""
            req = {**req, "instructions": req["instructions"] + " Your last try was too close to the selection or to "
                   "another version" + (f' ("{library._one(near, 300)}")' if near else "") + ". Make the move boldly: "
                   "change the shape of the sentence, not one word."}

    tasks = [asyncio.ensure_future(one(i, r)) for i, r in enumerate(calls)]
    fallback = False
    try:
        await asyncio.gather(*tasks)
    except gateway.EditorError as e:
        if not e.rate_limited:
            raise
        fallback = True
        for k in tasks:
            k.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    except asyncio.CancelledError:
        for k in tasks:
            k.cancel()
        raise
    cut = sum(1 for e in errors if e.code == "cut_off")
    if fallback:
        store.set_progress(pass_id, None, fallback=True)
        answer = await EDITOR.ask(request["single"], on_phase=lambda n: store.set_phase(pass_id, n))
        tally.add(answer)
        store.set_phase(pass_id, "checking")
        try:
            more = library.check("rewrite", answer["data"], body, selection, ctx)["options"]
        except ValueError:
            more = []
        have = [o for o in slots if o]
        seen = {library._normalize(o["text"])[0].strip().lower() for o in have}
        for o in more:
            k = library._normalize(o["text"])[0].strip().lower()
            if len(have) < 3 and k not in seen:
                seen.add(k)
                have.append({"text": o["text"], "move": o.get("move") or "", "how": o.get("move") or "", "unsupported": o["unsupported"]})
        options = have
    else:
        store.set_phase(pass_id, "checking")
        options = [o for o in slots if o]
    if not options:
        code = errors[0].code if errors else "unreadable"
        store.finish_pass(pass_id, status="failed", error_code=code, error=gateway.message(code, "rewrite"),
                          counts={"cut_off": cut}, progress={"fallback": fallback})
        return
    n = len(calls) if not fallback else 3
    result = {"selection": {"start": selection["start"], "end": selection["end"], "text": sel}, "options": options, "pending": 0,
              "counts": {"returned": n, "matched": len(options), "dropped": max(0, n - len(options))}}
    store.finish_pass(pass_id, status="done", result=result, counts={"cut_off": cut}, progress={"fallback": fallback}, **tally.meta())


async def _read_sections(pass_id, t, request, body, ctx, title):
    """Read my piece on a long piece: sections at once (the plugin-wide slots hold it to three calls), each section's
    changes published as they land, then one short call ranks them and writes the verdict."""
    spans = request["sections"]
    total = len(spans)
    tally = workflows.Tally()
    counts = {"returned": 0, "matched": 0, "dropped": 0, "praise": 0}
    secs = [{"n": i + 1, "start": a, "end": b, "status": "reading", "changes": []} for i, (a, b) in enumerate(spans)]
    found: list = [None] * total
    errors: list = []
    norm = library._normalize(body)
    on = library.suggestions_on(ctx)

    def publish():
        done = sum(1 for x in secs if x["status"] != "reading")
        store.set_progress(pass_id, {"sections": secs, "pending": total - done}, sections={"done": done, "total": total})

    async def one(i):
        a, b = spans[i]
        req = library.read_request(t, title, body, None, ctx, section=(i + 1, total, a, b))
        try:
            answer = await EDITOR.ask(req, on_phase=lambda n: store.set_phase(pass_id, n))
            tally.add(answer)
            got = library.read_candidates(answer["data"], body, a, b, on, counts, norm)
        except gateway.EditorError as e:
            errors.append(e)
            secs[i].update(status="failed", code=e.code)
            publish()
            return
        except ValueError:
            errors.append(gateway.EditorError("unreadable"))
            secs[i].update(status="failed", code="unreadable")
            publish()
            return
        for c in got["changes"]:
            c["_ending"] = c.get("_ending") and i == total - 1  # only the last section holds the piece's ending
        found[i] = got
        secs[i].update(status="done", changes=[{**{k: v for k, v in c.items() if k != "_ending"}, "rank": r}
                                               for r, c in enumerate(got["changes"][:library.READ_KEEP], 1)])
        publish()

    publish()
    await asyncio.gather(*(one(i) for i in range(total)))
    ok = [f for f in found if f]
    if not ok:
        code = errors[0].code if errors else "unreadable"
        store.finish_pass(pass_id, status="failed", error_code=code, error=gateway.message(code, "read"),
                          counts={"cut_off": sum(1 for e in errors if e.code == "cut_off")})
        return
    candidates = [c for f in ok for c in f["changes"][:library.READ_KEEP]]
    cuts = [f["cut"] for f in ok if f["cut"]]
    ranked, verdict, holds, cut = False, "", "", (cuts[0] if cuts else None)
    try:
        answer = await EDITOR.ask(library.rank_request(title, candidates, cuts, [f["verdict"] for f in ok], ctx),
                                  on_phase=lambda n: store.set_phase(pass_id, n))
        tally.add(answer)
        data = answer["data"]
        order = []
        for x in data.get("order") or []:
            m = re.fullmatch(r"\s*C?(\d+)\s*", str(x))
            k = int(m.group(1)) - 1 if m else -1
            if 0 <= k < len(candidates) and k not in order:
                order.append(k)
        if order:
            candidates = [candidates[k] for k in order] + [c for k, c in enumerate(candidates) if k not in order]
            ranked = True
        verdict, holds = library._text(data.get("verdict"), 3000), library._text(data.get("holds"), 800)
        m = re.fullmatch(r"\s*X?(\d+)\s*", str(data.get("cut_first") or ""))
        if m and 0 <= int(m.group(1)) - 1 < len(cuts):
            cut = cuts[int(m.group(1)) - 1]
    except gateway.EditorError:
        pass
    if not ranked or not library.clean_verdict(verdict):
        ranked = ranked and bool(library.clean_verdict(verdict))
        if not ranked:  # each section's first change in piece order, then each section's second, and so on
            candidates = [f["changes"][k] for k in range(library.READ_KEEP) for f in ok if len(f["changes"]) > k]
        verdict = verdict if library.clean_verdict(verdict) else ok[0]["verdict"]
        holds = holds or ok[0]["holds"]
    store.set_phase(pass_id, "checking")
    try:
        keep = next((f["keep"] for f in ok if f.get("keep")), None)  # the first section's strongest line
        genre = next((f["genre"] for f in ok if f.get("genre")), None)
        result = library.finish_read(verdict, candidates, cut, holds, counts, {"sections": secs, "ranked": ranked}, keep=keep, genre=genre)
    except ValueError as e:
        raise gateway.EditorError(str(e) if str(e) in gateway.MESSAGES else "unreadable")
    store.finish_pass(pass_id, status="done", result=result, counts={"cut_off": sum(1 for e in errors if e.code == "cut_off")},
                      progress={"sections": {"done": total, "total": total}}, **tally.meta())


def _announce(pass_id: str):
    try:
        from hermes_cli.plugin_events import broadcast_plugin_event
        broadcast_plugin_event("clearing", "pass.ended", {"id": pass_id})
    except Exception:  # polling covers it
        pass


@router.post("/passes")
async def post_pass(body: dict):
    try:
        b = _body(body)
        piece = store.get_piece(b.get("piece_id"))
        running = store.running_pass(piece["id"])
        if running:
            if running["id"] in _jobs:
                raise HTTPException(status_code=409, detail="One pass at a time. The editor is still working on this piece.")
            store.finish_pass(running["id"], status="failed", error_code="interrupted", error=gateway.MESSAGES["interrupted"])
        t = library.target(str(b.get("target") or ""))
        text = b.get("body") if isinstance(b.get("body"), str) else piece["body"]
        title = b.get("title") if isinstance(b.get("title"), str) else piece["title"]
        selection = b.get("selection") if isinstance(b.get("selection"), dict) else None
        if t["kind"] in ("openings", "flip", "voice", "lessons", "guidance", "across", "debate", "endings", "titles", "start", "figures", "opps"):
            selection = None  # these read the whole piece (openings and flips replace a sentence or paragraph in it)
        version = library.version_key(text) if t["kind"] in SPOT_KINDS else None
        if version:  # Find figures of speech and Where to add a technique: one result per piece version, kept and shown again
            cached = store.cached_pass(piece["id"], t["id"], version)
            if cached:
                return _view(cached) | {"cached": True}
        if t["kind"] == "next" and selection is not None:
            selection = {"start": selection.get("end"), "end": selection.get("end")}  # the cursor, not a passage
        ctx = _context(t, piece, text, title, b.get("pieces"))
        if t["kind"] == "opps":
            spotted = store.cached_pass(piece["id"], "figures", version)
            ctx["spotted"] = (spotted["result"] or {}).get("figures") if spotted else None
        if t["kind"] == "apply":
            ctx["note"] = b.get("note") if isinstance(b.get("note"), str) else ""
            if b.get("item"):  # Show me on an opportunity: the note is built here, from the library item and its why
                ctx["note"] = library.apply_note(b.get("item"), b.get("why") if isinstance(b.get("why"), str) else "")
                ctx["cut_ok"] = True
        for key in ("instruction", "current", "answers", "move"):
            if b.get(key) is not None:
                ctx[key] = b.get(key)
        request = library.build_request(t, title, text, selection, ctx)
        if t["kind"] == "rewrite" and not ctx.get("move"):
            request = {"calls": library.rewrite_requests(t, title, text, selection, ctx), "single": request}
        if t["kind"] == "read" and not selection:
            parts = library.read_sections(text)
            if len(parts) > 1:
                request = {"sections": parts}
        if t["kind"] == "start":
            words = request.get("words", 0)
        elif selection and selection.get("end") is not None and selection.get("start") is not None and t["kind"] != "next":
            words = len(text[selection["start"]:selection["end"]].split())
        else:
            words = len(text.split())
        progress = {"words": words}
        if request.get("sections"):
            progress["sections"] = {"done": 0, "total": len(request["sections"])}
        record = store.add_pass(piece["id"], t["id"], t["kind"], {"selection": selection, "body_length": len(text),
                                                                  **({"version": version} if version else {})}, progress)
        _jobs[record["id"]] = asyncio.get_running_loop().create_task(_run(record["id"], t, request, text, selection, ctx, title))
        return _view(record)
    except Exception as e:
        _fail(e)


SPOT_KINDS = ("figures", "opps")
OPPS_FEW = 4  # fewer opportunities than this: ask once more


@router.post("/coach")
async def post_coach(body: dict):
    """Try it: the writer's own version of a line, and the coach's reply (what works, then questions; never wording).
    The item comes from the library by id; the passage must still be in the piece."""
    try:
        b = _body(body)
        piece = store.get_piece(b.get("piece_id"))
        text = b.get("body") if isinstance(b.get("body"), str) else piece["body"]
        quote = b.get("quote") if isinstance(b.get("quote"), str) else ""
        if not quote.strip() or library.anchor(text, quote) is None:
            raise ValueError("That passage changed. Run it again to see where it is now.")
        req = library.coach_request(b.get("item"), quote, b.get("why") if isinstance(b.get("why"), str) else "", b.get("line"),
                                    b.get("title") if isinstance(b.get("title"), str) else piece["title"],
                                    {"guidance": store.list_guidance()})
        try:
            answer = await EDITOR.ask(req)
        except gateway.EditorError as e:
            raise ValueError(gateway.message(e.code))
        data = answer["data"] if isinstance(answer.get("data"), dict) else {}
        reply = library.coach_guard(data.get("reply"), req["line"], req["quote"])
        return {"text": reply, "model": answer.get("model") or ""}
    except Exception as e:
        _fail(e)


def _context(t: dict, piece: dict, text: str, title: str, chosen) -> dict:
    """What a method needs besides the piece: the writer's kept rules always; voice samples, revisions and
    decisions, other pieces or the saved panel only for the methods that read them."""
    kind = t["kind"]
    ctx = {"guidance": store.list_guidance(), "suggestions": store.settings()["suggestions"], "title": title}
    if kind == "next":
        ctx["samples"] = [{"id": p["id"], "title": p["title"], "body": p["body"]} for p in store.voice_samples(exclude=piece["id"])]
    if kind in ("voice", "guidance"):
        ctx["samples"] = [{"id": p["id"], "title": p["title"], "body": p["body"]} for p in store.voice_samples(exclude=piece["id"] if kind == "voice" else None)]
    if kind == "guidance":
        ctx["decisions"] = store.list_decisions(limit=40)
    if kind == "lessons":
        first = store.first_version(piece["id"])
        ctx["earlier"] = first["body"] if first else ""
        ctx["decisions"] = store.list_decisions(piece["id"])
    if kind == "across":
        ids = [str(x) for x in chosen] if isinstance(chosen, list) else []
        if piece["id"] not in ids:
            ids.insert(0, piece["id"])
        ids = list(dict.fromkeys(ids))
        if len(ids) > library.ACROSS_MAX:
            raise ValueError(library.NEEDS["pieces"])
        ctx["pieces"] = []
        for pid in ids:
            p = store.get_piece(pid)
            if p["trashed"]:
                raise LookupError("One of those pieces is in the trash. Restore it, or choose another.")
            body = text if pid == piece["id"] else p["body"]
            ctx["pieces"].append({"id": pid, "title": title if pid == piece["id"] else p["title"], "body": body, "here": pid == piece["id"]})
    if kind == "debate":
        saved = store.latest_pass(piece["id"], "panel")
        ctx["panel"] = saved["result"] if saved and saved.get("result") else None
    return ctx


@router.get("/passes/{pass_id}")
async def get_pass(pass_id: str):
    try:
        p = store.get_pass(pass_id)
        if p["status"] == "running" and pass_id not in _jobs and time.time() - p["created"] > 5:
            p = store.finish_pass(pass_id, status="failed", error_code="interrupted", error=gateway.MESSAGES["interrupted"])
        return _view(p)
    except Exception as e:
        _fail(e)


@router.post("/passes/{pass_id}/stop")
async def post_stop(pass_id: str):
    try:
        job = _jobs.get(pass_id)
        if job is not None:
            job.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(job), timeout=2)
            except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                pass
        p = store.get_pass(pass_id)
        if p["status"] == "running":
            p = store.finish_pass(pass_id, status="stopped", error_code="stopped", error=gateway.MESSAGES["stopped"])
        return _view(p)
    except Exception as e:
        _fail(e)


@router.get("/capabilities")
async def get_capabilities():
    """What this process can do now; the page hides what is false."""
    try:
        try:
            plan = await asyncio.to_thread(dictation.plan)
        except Exception:
            plan = {"ready": False}
        speech = {"available": bool(plan.get("ready")), "local": plan.get("local") is True}
        if speech["available"] and plan.get("local") is not True and plan.get("label"):
            speech["service"] = str(plan["label"])
        try:
            web = bool(await asyncio.to_thread(runtime.web_tool_available))
        except Exception:
            web = False
        try:
            on = bool(store.settings()["suggestions"])
        except Exception:
            on = True
        return {"web_reader": web, "dictation": speech, "pdf": True, "docx": True, "suggestions": on}
    except Exception as e:
        _fail(e)


@router.get("/library")
async def get_library():
    """Every target the Ask line can run, for a page built before the library changed."""
    return {"targets": [{k: v for k, v in t.items() if k != "task"} for t in library.targets()]}


# ---------- the room's settings ----------
@router.get("/settings")
async def get_settings():
    try:
        return store.settings()
    except Exception as e:
        _fail(e)


@router.post("/settings")
async def post_settings(body: dict):
    """``suggestions``: False turns suggested text off for the whole room (a no-AI-text room for a class)."""
    try:
        return store.set_settings(_body(body))
    except Exception as e:
        _fail(e)


# ---------- the writer's guidance, voice samples and decisions ----------
@router.post("/pieces/{piece_id}/voice")
async def post_voice(piece_id: str, body: dict):
    try:
        return store.set_voice(piece_id, bool(_body(body).get("on")))
    except Exception as e:
        _fail(e)


@router.get("/guidance")
async def get_guidance():
    try:
        return {"rules": store.list_guidance(), "samples": [{k: v for k, v in p.items() if k != "body"} for p in store.voice_samples()],
                "sections": list(store.SECTIONS)}
    except Exception as e:
        _fail(e)


@router.post("/guidance")
async def post_guidance(body: dict):
    try:
        b = _body(body)
        return store.add_rule(b.get("section"), b.get("text"), b.get("evidence") or "", b.get("source") or "writer", b.get("piece_id"))
    except Exception as e:
        _fail(e)


@router.post("/guidance/{rule_id}")
async def post_rule(rule_id: str, body: dict):
    try:
        b = _body(body)
        return store.update_rule(rule_id, b.get("text"), b.get("section"), b.get("status"))
    except Exception as e:
        _fail(e)


@router.post("/pieces/{piece_id}/decisions")
async def post_decisions(piece_id: str, body: dict):
    try:
        items = _body(body).get("items")
        return {"saved": store.add_decisions(piece_id, items if isinstance(items, list) else [])}
    except Exception as e:
        _fail(e)


# ---------- the writing home (no model) ----------
@router.get("/home/plan")
async def get_home_plan():
    try:
        return home.plan()
    except Exception as e:
        _fail(e)


@router.post("/home/setup")
async def post_home_setup(body: dict):
    try:
        return home.setup(_body(body).get("fingerprint"))
    except home.PlanChanged as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        _fail(e)


# ---------- Better words: the thesaurus ----------
# Open English WordNet 2025 and WordNet 3.1, split into 361 shards by the first two letters of a word
# (library/thesaurus, notice in NOTICE.txt). The page asks for the shards a word needs; no model call.
_SHARD = __import__("re").compile(r"^(?:[a-z]{2}|[a-z]_|__)$")


@__import__("functools").lru_cache(maxsize=48)
def _shard(key: str) -> dict:
    import json
    path = library.ROOT / "thesaurus" / f"{key}.json"
    if not path.is_file():
        return {"w": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {"w": data.get("w", {}), "f": data.get("f", {})}


@router.get("/thesaurus/{key}")
async def get_thesaurus(key: str):
    if not _SHARD.fullmatch(key or ""):  # fullmatch: "$" alone would accept a trailing newline
        raise HTTPException(status_code=404, detail="No dictionary entry for this word.")
    try:
        return _shard(key)
    except Exception:
        _log.exception("clearing: thesaurus shard %s unreadable", key)
        raise HTTPException(status_code=503, detail="The dictionary couldn't be read. Your words are unchanged.")


# ---------- Word files ----------
@router.post("/import/docx")
async def post_import_docx(body: dict):
    """A .docx the writer opened, sent as base64. Returns its title and paragraphs; nothing is stored here."""
    import base64
    import binascii
    try:
        b = _body(body)
        data = b.get("data")
        if not isinstance(data, str) or len(data) > docx.MAX_FILE * 4 // 3 + 16:
            raise ValueError("That file is larger than 4 MB. Open a shorter file, or paste a section.")
        try:
            raw = base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("That file couldn't be read. Try again.")
        title, text = docx.read_docx(raw)
        name = str(b.get("name") or "")
        if not title:
            title = re.sub(r"\.docx$", "", name, flags=re.I).strip()[:300]
        return {"title": title, "body": text}
    except Exception as e:
        _fail(e)


# ---------- PDFs ----------
@router.post("/import/pdf")
async def post_import_pdf(body: dict):
    """A PDF the writer brought in, as base64. Returns its title and text; nothing is stored here."""
    import base64
    import binascii
    try:
        b = _body(body)
        data = b.get("data")
        if not isinstance(data, str) or len(data) > pdf.MAX_FILE * 4 // 3 + 16:
            raise ValueError("That PDF is larger than 12 MB. Open a shorter PDF, or the pages you need.")
        try:
            raw = base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("That file couldn't be read. Try again.")
        title, text, stopped = await asyncio.to_thread(pdf.read_pdf, raw)
        if not title:
            title = re.sub(r"\.pdf$", "", str(b.get("name") or ""), flags=re.I).strip()[:300]
        return {"title": title, "body": text, "stopped": stopped}
    except Exception as e:
        _fail(e)


# ---------- a link, through the writer's own Hermes web tool ----------
@router.post("/link")
async def post_link(body: dict):
    try:
        url = intake.check_url(_body(body).get("url"))
        try:
            return await asyncio.wait_for(asyncio.to_thread(intake.fetch_link, url), timeout=intake.LINK_TIMEOUT)
        except asyncio.TimeoutError:
            raise ValueError("That page took too long to bring in. Try again, or copy the text and paste it.")
    except Exception as e:
        _fail(e)


# ---------- dictation ----------
@router.get("/dictation")
async def get_dictation():
    """Where a recording would go. The page shows ``ask`` and waits for Send when ``press_first`` is true."""
    try:
        return await asyncio.to_thread(dictation.status)
    except Exception as e:
        _fail(e)


@router.post("/dictation")
async def post_dictation(body: dict):
    try:
        b = _body(body)
        try:
            return await asyncio.wait_for(asyncio.to_thread(dictation.transcribe, b.get("data"), b.get("send_to"), store.data_dir()),
                                          timeout=dictation.TIMEOUT)
        except dictation.NeedsPress as e:
            return {"needs_press": True, "ask": dictation.ask_line(e.plan), "send_to": e.plan.get("provider") or "",
                    "label": e.plan.get("label") or ""}
        except asyncio.TimeoutError:
            raise ValueError("Turning your recording into text took too long. Nothing was added. Try a shorter recording.")
        except dictation.DictationError:
            raise
        except Exception:
            _log.warning("clearing: dictation failed", exc_info=True)
            raise ValueError(dictation.FAILED)
    except Exception as e:
        _fail(e)


# ---------- the built-in scenes ----------
# The three photographs ship in desktop/assets/ and reach the page here instead of inside plugin.js, which keeps
# the bundle small. Kept in step with scripts/embed_assets.py::SCENES; the page checks the hash against its own.
SCENES = {"snow": ("snow-light.jpg", "image/jpeg"), "marsh": ("quiet-marsh.jpg", "image/jpeg"),
          "tide": ("night-tide.jpg", "image/jpeg")}
_SCENE_DIR = Path(__file__).resolve().parents[1] / "desktop" / "assets"


@router.get("/scene/builtin/{name}")
async def get_builtin_scene(name: str):
    import base64
    import hashlib
    try:
        if name not in SCENES:
            raise LookupError("That scene is not part of The Clearing.")
        file, mime = SCENES[name]
        raw = (_SCENE_DIR / file).read_bytes()
        return {"name": name, "mime": mime, "hash": hashlib.sha256(raw).hexdigest()[:12],
                "data": base64.b64encode(raw).decode("ascii")}
    except OSError:
        _fail(LookupError("That scene's picture is missing from The Clearing's folder."))
    except Exception as e:
        _fail(e)


# ---------- the writer's own scene picture ----------
def _picture_dir():
    return store.data_dir() / "scene"


def _picture_url():
    import base64
    folder = _picture_dir()
    for ext, mime in ((".jpg", "image/jpeg"), (".png", "image/png"), (".webp", "image/webp")):
        f = folder / f"picture{ext}"
        if f.is_file():
            data = f.read_bytes()
            if intake.picture_type(data):  # a file changed on disk since is checked again before the page sees it
                return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
    return None


@router.get("/scene/picture")
async def get_picture():
    try:
        return {"data": _picture_url()}
    except Exception as e:
        _fail(e)


@router.post("/scene/picture")
async def post_picture(body: dict):
    """The writer's own picture for the scene: JPEG, PNG or WebP, checked by its bytes, kept in the plugin's folder."""
    import base64
    import binascii
    try:
        data = _body(body).get("data")
        if not isinstance(data, str) or len(data) > intake.MAX_PICTURE * 4 // 3 + 16:
            raise ValueError("That picture is larger than 6 MB. Choose a smaller one, or save it smaller first.")
        try:
            raw = base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("That picture couldn't be read. Choose another.")
        mime, _w, _h = intake.check_picture(raw)
        ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
        folder = _picture_dir()
        try:
            folder.mkdir(parents=True, exist_ok=True)
            part = folder / f".picture{ext}.part"
            part.write_bytes(raw)
            for old in folder.glob("picture.*"):
                old.unlink()
            part.replace(folder / f"picture{ext}")
        except OSError:
            raise store.StoreError("Couldn't keep the picture. Check that the disk has room, then try again.")
        return {"data": _picture_url()}
    except Exception as e:
        _fail(e)


@router.post("/scene/picture/remove")
async def post_picture_remove():
    try:
        for old in _picture_dir().glob("picture.*"):
            old.unlink()
        return {"data": None}
    except FileNotFoundError:
        return {"data": None}
    except Exception as e:
        _fail(e)


@router.post("/export/docx")
async def post_export_docx(body: dict):
    """Write the piece as a .docx in The Clearing's exports folder. The page hands the path to Hermes's save dialog."""
    try:
        b = _body(body)
        title = b.get("title") if isinstance(b.get("title"), str) else ""
        text = b.get("body") if isinstance(b.get("body"), str) else ""
        if not text.strip() and not title.strip():
            raise ValueError("The page is empty. Write a little first, then save.")
        if len(text) > 2_000_000:
            raise ValueError("This piece is too long to save as a Word file.")
        folder = store.data_dir() / "exports"
        data = docx.write_docx(title, text)
        base = home.safe_name(title)  # no separators, hidden ".name" files, bidi tricks or Windows device names
        try:
            folder.mkdir(parents=True, exist_ok=True)
            for n in range(1, 500):
                path = folder / (f"{base}.docx" if n == 1 else f"{base} ({n}).docx")
                try:
                    with open(path, "xb") as f:  # exclusive: an export never replaces a file already there
                        f.write(data)
                    return {"path": str(path), "name": path.name}
                except FileExistsError:
                    continue
        except OSError:
            raise store.StoreError("Couldn't write the Word file. Check that the disk has room, then try again.")
        raise ValueError("There are too many Word files with this title. Rename the piece, then save.")
    except Exception as e:
        _fail(e)
