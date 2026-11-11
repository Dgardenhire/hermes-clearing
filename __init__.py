"""The Clearing for Hermes (``clearing``): a writing room where your model suggests changes and the writer decides what goes in.

The modules:

- ``store``      pieces, versions and editor passes in ``<hermes home>/plugin-data/clearing/clearing.db``
- ``library``    the method library (``library/*.json``), the prompts built from it, and the checks that pin
                 every editor note to the writer's exact words
- ``gateway``    the one door to the model: ``PluginLlm`` on The Clearing's own auxiliary task
- ``callwatch``  the observe-only ``post_auxiliary_call`` hook that catches answers cut off at the token limit

The routes live in ``dashboard/plugin_api.py`` and the page in ``desktop/plugin.js``.

``register(ctx)`` adds one auxiliary task (``clearing_editor``, listed in Settings, Model, Auxiliary models, so the
writer can point the editor at any model) and one observe-only hook, matching ``plugin.yaml``. No tools,
no middleware, no background work. It also hands ``ctx`` to ``runtime.py``, so the page's link reader can
use ``ctx.dispatch_tool`` when the routes run in this process. (``plugin.yaml`` no longer lists ``provides_middleware: []``: Hermes's loader
does not know that field and warned about it on every start; its validator reads a missing list as empty.)

Other modules: ``docx`` and ``pdf`` read Word files and PDFs with the standard library; ``intake`` checks links
(public http and https only) and the writer's scene picture; ``dictation`` turns a recording into text through
Hermes's own speech-to-text, or faster-whisper already on the computer.
"""

from __future__ import annotations

import importlib.util
import logging
import sys
from pathlib import Path

try:
    from . import callwatch
except ImportError:  # loaded as a loose module (tests)
    import callwatch  # type: ignore

PLUGIN_ID = "clearing"
TOOLS: tuple[str, ...] = ()
HOOKS: tuple[str, ...] = ("post_auxiliary_call",)

_log = logging.getLogger("hermes.plugins.clearing")


def register(ctx) -> None:
    try:
        ctx.register_auxiliary_task(
            "clearing_editor", display_name="The Clearing editor",
            description="Reads your piece in The Clearing and suggests changes pinned to your words. The writer chooses which changes to use.",
            inherit_from=None)
    except Exception:  # an older host or a reload; the editor then uses your main model
        _log.warning("clearing: could not register the clearing_editor model setting", exc_info=True)
    ctx.register_hook("post_auxiliary_call", callwatch.on_post_auxiliary_call)
    try:  # the page's routes reach the context through the shared package (runtime.py), for ctx.dispatch_tool
        from importlib import import_module
        import_module(f"{_shared_package().__name__}.runtime").set_context(ctx)
    except Exception:
        _log.warning("clearing: could not share the plugin context with the page's routes; links use the tool registry",
                     exc_info=True)


SHARED_PACKAGE = "clearing_dashboard_package"  # the name dashboard/plugin_api.py loads the plugin under


def _shared_package():
    pkg = sys.modules.get(SHARED_PACKAGE)
    if pkg is None:
        root = Path(__file__).resolve().parent
        spec = importlib.util.spec_from_file_location(SHARED_PACKAGE, root / "__init__.py", submodule_search_locations=[str(root)])
        if spec is None or spec.loader is None:
            raise RuntimeError("Could not load The Clearing")
        pkg = importlib.util.module_from_spec(spec)
        sys.modules[SHARED_PACKAGE] = pkg
        spec.loader.exec_module(pkg)
    return pkg
