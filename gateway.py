"""The one door to the writer's model: Hermes's plugin LLM access, on The Clearing's own auxiliary task.

``Editor.ask()`` runs one structured call and returns the parsed answer with who answered and what it
cost in tokens. Everything that can go wrong becomes an ``EditorError`` with a short code the page maps
to its message and next step:

- ``no_model``   Hermes has no model ready for this plugin, or refused the call (R1, R12)
- ``busy``       rate limit, provider down or overloaded (R2)
- ``unreachable`` no connection to the model's provider (offline, DNS, refused)
- ``slow``       the call ran past its time limit (R3)
- ``cut_off``    the answer stopped early: finish reason "length", the token ceiling, or JSON that does
                 not parse or fit the format (R4, R11)
- ``failed``     anything else, without detail the writer can't act on

What is sent: the system prompt built in library.py and the piece (or the selected passage), with
secrets scrubbed by Hermes's own redaction first. Nothing is sent anywhere else.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid

try:
    from . import callwatch
except ImportError:  # loaded as loose modules (tests)
    import callwatch  # type: ignore

PLUGIN_ID = "clearing"
TASK = "clearing_editor"
TIMEOUT = 150  # seconds for one call (R3)
CEILING = 0.98  # output tokens at or above this share of max_tokens count as cut off (when no clean finish was seen)
CUT_REASONS = ("length", "max_tokens", "max_output_tokens", "model_length")
CLEAN_REASONS = ("stop", "end_turn", "stop_sequence")

_log = logging.getLogger("hermes.plugins.clearing")

MESSAGES = {
    "no_model": "Hermes doesn't have a model ready for The Clearing. Choose one in Settings, then try again.",
    "busy": "Your model is busy. Try again in a minute.",
    "unreachable": "Hermes couldn't reach your model. Check your connection, then try again. Your words are unchanged.",
    "slow": "Your model took too long to answer. Try again, or run the pass on one section.",
    "cut_off": "The editor stopped before finishing. Try a shorter piece or one section.",
    "unmatched": "The editor's notes didn't match your words. Nothing changed.",
    "unreadable": "The editor's answer came back in a form The Clearing can't read. Nothing changed. Try again.",
    "failed": "The editor couldn't answer just now. Nothing changed. Try again.",
    "interrupted": "Hermes restarted before the editor finished. Try again.",
    "stopped": "Stopped. Nothing changed.",
}


# A few messages read better for a passage the writer selected for other wording.
FOR_WORDING = {
    "cut_off": "The editor stopped before finishing. Try again, or select fewer words.",
    "slow": "Your model took too long to answer. Try again, or select fewer words.",
}


def message(code: str, kind: str = "") -> str:
    if kind == "wording" and code in FOR_WORDING:
        return FOR_WORDING[code]
    return MESSAGES.get(code, MESSAGES["failed"])


class EditorError(RuntimeError):
    def __init__(self, code: str, detail: str = "", rate_limited: bool = False):
        super().__init__(MESSAGES.get(code, MESSAGES["failed"]))
        self.code, self.detail, self.rate_limited = code, detail, rate_limited


def rate_limited(e: BaseException) -> bool:
    """A 429 (or the provider's words for one). Rewrite's three calls fall back to one call on it."""
    if isinstance(e, EditorError):
        return e.rate_limited
    msg = f"{type(e).__name__} {e}".lower()
    return "429" in msg or "rate limit" in msg or "rate_limit" in msg or "ratelimit" in msg or "too many requests" in msg


class Slots:
    """At most ``limit`` model calls in flight across the whole plugin, whatever event loop they run on.

    A plain counter under a thread lock, waited on with short sleeps: an asyncio.Semaphore belongs to one event
    loop, and a waiter that is cancelled here simply stops waiting (it never holds a slot it didn't get)."""

    def __init__(self, limit: int = 3):
        import threading
        self.limit, self.busy, self.peak = limit, 0, 0
        self._lock = threading.Lock()

    def _take(self) -> bool:
        with self._lock:
            if self.busy < self.limit:
                self.busy += 1
                self.peak = max(self.peak, self.busy)
                return True
            return False

    async def acquire(self):
        while not self._take():
            await asyncio.sleep(0.02)

    def release(self):
        with self._lock:
            self.busy = max(0, self.busy - 1)


SLOTS = Slots(3)  # E12: never more than three calls to the writer's model at once


def _inside_hermes() -> bool:
    try:
        import agent.plugin_llm  # noqa: F401
    except ImportError:
        return False
    return True


def scrub(text: str) -> str:
    """Hermes's secret redaction, forced on (a key pasted into a draft never reaches the model).
    Fails closed: inside Hermes, a redactor that can't be imported refuses the call instead of sending raw text."""
    try:
        from agent.redact import redact_sensitive_text
    except ImportError:
        if _inside_hermes():
            _log.warning("clearing: Hermes's redaction is unavailable; the editor call is refused")
            raise EditorError("failed", "redaction unavailable")
        return text  # outside Hermes (tests): nothing to scrub with
    try:
        return redact_sensitive_text(text, force=True)
    except Exception:  # redaction must never block the writer
        _log.warning("clearing: redaction failed; sending unredacted is refused", exc_info=True)
        raise EditorError("failed", "redaction failed")


def classify(e: BaseException) -> str:
    if isinstance(e, EditorError):
        return e.code
    if isinstance(e, (asyncio.TimeoutError, TimeoutError)):
        return "slow"
    name = type(e).__name__
    msg = f"{name} {e}".lower()
    # Hermes raises AuxiliaryClientUnavailable ("No LLM provider configured ... Run: hermes setup") when no
    # model is ready; it must read as "choose a model", never as "busy" (its name contains "unavailable").
    if name in ("PluginLlmTrustError", "AuxiliaryClientUnavailable") or any(k in msg for k in (
            "no provider", "no llm provider", "provider configured", "not configured", "no api key", "credential",
            "no model", "unauthorized", "401", "403", "not logged in", "hermes setup", "hermes auth")):
        return "no_model"
    if any(k in msg for k in ("apiconnectionerror", "connecterror", "connection error", "connection refused",
                              "name resolution", "nodename nor servname", "network is unreachable", "offline")):
        return "unreachable"
    if any(k in msg for k in ("429", "rate limit", "rate_limit", "overloaded", "529", "503", "502", "500 ", "unavailable",
                              "connection", "temporarily")):
        return "busy"
    if "timeout" in msg or "timed out" in msg:
        return "slow"
    if isinstance(e, ValueError) and "schema" in msg:
        return "unreadable"
    return "failed"


def parse_json(text: str):
    """The first JSON object in a reply, fenced or bare."""
    text = text or ""
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S | re.I)
    for candidate in ([fence.group(1)] if fence else []) + [text]:
        m = re.search(r"\{.*\}", candidate, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                continue
    return None


class Editor:
    """Model calls over ``agent.plugin_llm.PluginLlm``. ``llm`` is injectable for tests."""

    def __init__(self, llm=None):
        self._llm = llm
        self.task = TASK  # dropped to the main model if Hermes never registered the editor's own setting

    @property
    def llm(self):
        if self._llm is None:
            from agent.plugin_llm import PluginLlm  # inside Hermes only
            self._llm = PluginLlm(plugin_id=PLUGIN_ID)
        return self._llm

    async def ask(self, request: dict, on_phase=None) -> dict:
        """Run one pass call. Returns {data, model, provider, tokens_in, tokens_out, finish_reason}.
        ``on_phase("reading")`` is called when the call is actually sent (after a free slot is found)."""
        call_id, started = uuid.uuid4().hex, time.time()
        system, body = scrub(request["system"]), scrub(request["input"])  # the system prompt carries the writer's rules
        max_tokens = int(request["max_tokens"])
        result, seen = None, None
        attempts = [request.get("schema"), None]  # R11: a reply that misses the schema is retried once as plain JSON
        while attempts:
            schema = attempts[0]
            await SLOTS.acquire()
            token = callwatch.begin(call_id)
            try:
                try:
                    if on_phase:
                        try:
                            on_phase("reading")
                        except Exception:  # a progress note must never cost the call (or hold its slot)
                            _log.debug("clearing: phase note failed", exc_info=True)
                    result = await asyncio.wait_for(self.llm.acomplete_structured(
                        instructions=request["instructions"], input=[{"type": "text", "text": body}], system_prompt=system,
                        json_schema=schema, json_mode=schema is None, max_tokens=max_tokens, timeout=TIMEOUT, task=self.task,
                        purpose="clearing editor pass"), timeout=TIMEOUT + 10)
                finally:
                    seen = callwatch.end(token, call_id, started)
                    SLOTS.release()
                break
            except asyncio.CancelledError:
                raise
            except ValueError as e:
                if schema is not None and "schema" in str(e).lower() and len(attempts) > 1:
                    _log.info("clearing: reply missed the schema; asking again for plain JSON")
                    attempts.pop(0)
                    continue
                raise EditorError(classify(e), type(e).__name__, rate_limited(e)) from e
            except Exception as e:  # every model failure reaches the page as a plain message
                if type(e).__name__ == "PluginLlmTrustError" and self.task and "auxiliary task" in str(e):
                    _log.warning("clearing: the clearing_editor setting is not registered; using the main model")
                    self.task = None
                    continue
                code = classify(e)
                # the class name only: a provider's message can echo the writer's words into Hermes's log
                _log.info("clearing: editor call failed (%s): %s", code, type(e).__name__)
                raise EditorError(code, type(e).__name__, rate_limited(e)) from e
        if result is None:
            raise EditorError("unreadable", "schema twice")

        usage = getattr(result, "usage", None)
        tokens_in = getattr(usage, "input_tokens", None) or (seen or {}).get("input_tokens")
        tokens_out = getattr(usage, "output_tokens", None) or (seen or {}).get("output_tokens")
        finish = (seen or {}).get("finish_reason")
        meta = {"model": getattr(result, "model", "") or (seen or {}).get("model") or "",
                "provider": getattr(result, "provider", "") or (seen or {}).get("provider") or "",
                "tokens_in": tokens_in, "tokens_out": tokens_out, "finish_reason": finish}
        # Cut-off, three ways: the hook's finish reason, the token ceiling, then the parse. A clean finish
        # reported by the hook wins over the ceiling: a reasoning model counts its thinking as output, so a
        # complete answer can land near max_tokens and must not be thrown away.
        reason = str(finish or "").lower()
        if reason in CUT_REASONS:
            raise EditorError("cut_off", f"finish_reason={finish}")
        if reason not in CLEAN_REASONS and isinstance(tokens_out, int) and tokens_out >= CEILING * max_tokens:
            raise EditorError("cut_off", f"tokens_out={tokens_out}")
        data = getattr(result, "parsed", None)
        if not isinstance(data, dict):
            data = parse_json(getattr(result, "text", "") or "")
        if not isinstance(data, dict):
            text = (getattr(result, "text", "") or "").rstrip()
            raise EditorError("cut_off" if text.count("{") > text.count("}") else "unreadable", "no JSON object")
        return {"data": data, **meta}
