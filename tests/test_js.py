"""Run the page's pure-JavaScript tests (tests/js) under node, with the backend's target list passed in
so the page and the backend are checked to offer the same passes."""
import json
import shutil
import subprocess
import unittest

from _load import ROOT, library


@unittest.skipUnless(shutil.which("node"), "node is not installed")
class JsTest(unittest.TestCase):
    def test_node_suite(self):
        ids = json.dumps([f"{t['id']}|{t['kind']}" for t in library.targets()])
        aliases = json.dumps({t["id"]: [t["aliases"], t.get("for", "")] for t in library.targets()})
        items = json.dumps({x["id"]: [x["type"], x["name"], x["definition"], x["group"]] for x in library.opportunity_items()})
        files = sorted(str(p) for p in (ROOT / "tests" / "js").glob("*.test.mjs"))
        proc = subprocess.run(["node", "--test", *files], cwd=ROOT, capture_output=True, text=True, timeout=60,
                              env={"PATH": __import__("os").environ.get("PATH", ""), "CLEARING_PY_TARGETS": ids,
                                   "CLEARING_PY_ALIASES": aliases, "CLEARING_PY_ITEMS": items})
        self.assertEqual(proc.returncode, 0, proc.stdout[-4000:] + proc.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
