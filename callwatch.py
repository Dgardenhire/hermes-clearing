"""Catch editor answers that were cut off, from Hermes's ``post_auxiliary_call`` event.

``ctx.llm`` results carry no finish reason, but every call on a plugin's own auxiliary task goes through
Hermes's auxiliary client, which fires ``post_auxiliary_call`` with ``aux_task``, ``finish_reason`` and
``usage`` (agent/auxiliary_hooks.py). The event fires synchronously inside the call, in the caller's
context, so a context variable set around one call names that call in the hook.

Hermes loads the plugin package (``__init__.py``, which registers the hook) and the dashboard routes
(``dashboard/plugin_api.py``) as two separate module copies. Both reach the same state through one
entry in ``sys.modules``, so the hook and the routes agree on which call is which.

The hook is observe-only. It ignores every task but The Clearing's own, reads only the finish reason,
the model name and the token counts, keeps them in memory for the call that is waiting on them, and
never changes a call.
"""

from __future__ import annotations

import contextvars
import sys
import threading
import time
import types

TASKS = ("clearing_editor",)
_SHARED = "hermes_plugin_clearing_callwatch_state"
_KEEP = 200  # records kept at most (oldest dropped); a waiting call reads its own at once


def _state():
    mod = sys.modules.get(_SHARED)
    if mod is None:
        mod = types.ModuleType(_SHARED)
        mod.current = contextvars.ContextVar("clearing_call", default=None)
        mod.records = {}
        mod.lock = threading.Lock()
        sys.modules[_SHARED] = mod
    return mod


def begin(call_id: str):
    """Mark the calls made from here on as ``call_id``. Returns the token for :func:`end`."""
    return _state().current.set(call_id)


def end(token, call_id: str, started: float = 0.0) -> dict | None:
    """Stop marking calls and return what the hook saw for ``call_id`` (the last attempt), if anything.

    If the context variable did not reach the hook (a host that runs the call in a fresh context), a
    record filed under the task name since ``started`` is taken instead. The page runs one editor call
    per piece at a time, so on a single-writer desktop that record is this call's."""
    st = _state()
    try:
        st.current.reset(token)
    except (ValueError, RuntimeError):
        pass
    with st.lock:
        record = st.records.pop(call_id, None)
        if record is None:
            for task in TASKS:
                fallback = st.records.get(f"task:{task}")
                if fallback and fallback["at"] >= started:
                    record = st.records.pop(f"task:{task}")
                    break
        return record


def on_post_auxiliary_call(**event) -> None:
    """The ``post_auxiliary_call`` callback. Never raises; never returns anything."""
    try:
        task = str(event.get("aux_task") or "")
        if task not in TASKS:
            return
        st = _state()
        call_id = st.current.get() or f"task:{task}"
        usage = event.get("usage") if isinstance(event.get("usage"), dict) else {}
        record = {
            "task": task,
            "finish_reason": event.get("finish_reason"),
            "model": event.get("response_model") or event.get("model"),
            "provider": event.get("provider"),
            "output_tokens": usage.get("output_tokens", usage.get("completion_tokens")),
            "input_tokens": usage.get("input_tokens", usage.get("prompt_tokens")),
            "error_type": event.get("error_type"),
            "at": time.time(),
        }
        with st.lock:
            st.records[call_id] = record  # a retry or fallback replaces the earlier attempt
            if len(st.records) > _KEEP:
                for key in sorted(st.records, key=lambda k: st.records[k]["at"])[: len(st.records) - _KEEP]:
                    st.records.pop(key, None)
    except Exception:  # an observer must never break the call it watches
        return
