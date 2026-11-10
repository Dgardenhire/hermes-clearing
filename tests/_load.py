"""Load the plugin for tests: a temporary data folder, the routes loaded the way Hermes's dashboard loads
them, a stand-in for fastapi when it is not installed (system Python), and a fake model."""
import asyncio
import json
import os
import shutil
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["CLEARING_DATA_DIR"] = tempfile.mkdtemp(prefix="clearing-test-")

try:
    import fastapi  # noqa: F401
except ImportError:
    fa = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code, detail=None):
            super().__init__(detail)
            self.status_code, self.detail = status_code, detail

    class APIRouter:
        def __init__(self):
            self.routes = []

        def _add(self, method, path):
            def deco(fn):
                self.routes.append((method, path, fn))
                return fn
            return deco

        def get(self, path):
            return self._add("GET", path)

        def post(self, path):
            return self._add("POST", path)

    fa.APIRouter, fa.HTTPException = APIRouter, HTTPException
    sys.modules["fastapi"] = fa

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("clearing_api_under_test", ROOT / "dashboard" / "plugin_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
store, library, gateway = api.store, api.library, api.gateway
callwatch = sys.modules[gateway.__name__.rsplit(".", 1)[0] + ".callwatch"]
HTTPException = sys.modules["fastapi"].HTTPException


class Usage:
    def __init__(self, i=120, o=300):
        self.input_tokens, self.output_tokens = i, o


class Result:
    def __init__(self, text, parsed=None, usage=None):
        self.text, self.parsed = text, parsed
        self.model, self.provider = "test-model-1", "test-provider"
        self.usage = usage or Usage()


class PluginLlmTrustError(Exception):
    pass


class FakeLlm:
    """Stands in for PluginLlm. Answers from a queue: a dict (parsed JSON), a string (raw text), an exception,
    or a callable taking the call's keyword arguments. ``finish`` simulates Hermes's post_auxiliary_call."""

    def __init__(self):
        self.calls, self.queue, self.finish, self.delay = [], [], "stop", 0.0

    async def acomplete_structured(self, **kw):
        self.calls.append(kw)
        if self.delay:
            await asyncio.sleep(self.delay)
        item = self.queue.pop(0) if self.queue else {"summary": "Fine.", "findings": []}
        if callable(item) and not isinstance(item, type):
            item = item(kw)
        if isinstance(item, BaseException):
            raise item
        usage = Usage()
        if isinstance(item, tuple):  # (answer, Usage)
            item, usage = item
        callwatch.on_post_auxiliary_call(aux_task=kw.get("task") or "", finish_reason=self.finish, model="test-model-1",
                                         provider="test-provider", usage={"output_tokens": usage.output_tokens})
        if isinstance(item, dict):
            return Result(json.dumps(item), item, usage)
        return Result(item, None, usage)


def fake_model():
    llm = FakeLlm()
    api.EDITOR = gateway.Editor(llm)
    return llm


def run(coro):
    return asyncio.run(coro)


def reset():
    store.reset_for_tests()
    d = Path(os.environ["CLEARING_DATA_DIR"])
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True)
    api._jobs.clear()


def sample():
    return json.loads((ROOT / "library" / "sample.json").read_text(encoding="utf-8"))
