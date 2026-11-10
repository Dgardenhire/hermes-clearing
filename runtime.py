"""The plugin context ``register(ctx)`` received, shared with the page's routes when they run in the same process.

Hermes imports the plugin once for ``register(ctx)`` and the dashboard loads ``dashboard/plugin_api.py`` on its own.
Both reach this module through one package name (``SHARED_PACKAGE``), so the routes can use ``ctx.dispatch_tool``
when it is there. When it is not (the routes run in another process, or an older Hermes), tool calls go through
Hermes's public tool registry instead. The Clearing calls exactly one tool, ``web_extract``, by a name fixed in code.
"""

from __future__ import annotations

import json
import logging
import threading

SHARED_PACKAGE = "clearing_dashboard_package"
WEB_TOOL = "web_extract"  # the only tool The Clearing calls; never chosen by a model or a page

_log = logging.getLogger("hermes.plugins.clearing")
_ctx = None
_lock = threading.Lock()
last_path = None  # "context" or "registry": which way the last tool call went (tests and the log)


def set_context(ctx) -> None:
    global _ctx
    with _lock:
        _ctx = ctx


def context():
    return _ctx


def _registry():
    from tools.registry import registry  # public module, inside Hermes
    if registry.get_entry(WEB_TOOL) is None:
        from tools.registry import discover_builtin_tools
        discover_builtin_tools()
    return registry


def web_tool_available() -> bool:
    """Whether ``web_extract`` can run here: through the context, or listed in the public registry."""
    ctx = context()
    try:
        if _registry().get_entry(WEB_TOOL) is not None:
            return True
    except Exception:
        pass
    return ctx is not None and callable(getattr(ctx, "dispatch_tool", None))


def dispatch_web(args: dict):
    """Run ``web_extract`` with The Clearing's own arguments. ``ctx.dispatch_tool`` when ``register(ctx)`` ran in this
    process, else the public registry. Logs which path ran, never the page's text or the address."""
    global last_path
    ctx = context()
    if ctx is not None and callable(getattr(ctx, "dispatch_tool", None)):
        last_path = "context"
        _log.info("clearing: web_extract through the plugin context")
        return ctx.dispatch_tool(WEB_TOOL, args)
    try:
        reg = _registry()
    except Exception:
        last_path = "none"
        _log.info("clearing: web_extract is not available (no context, no registry)")
        return json.dumps({"error": f"Unknown tool: {WEB_TOOL}"})
    last_path = "registry"
    _log.info("clearing: web_extract through the tool registry")
    return reg.dispatch(WEB_TOOL, args)
