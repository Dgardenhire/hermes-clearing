"""Release checks: what register() adds matches plugin.yaml, the bundle keeps the desktop rules, the shipped
text has no emoji, the overlap checker works, and (when the upstream folder is on this computer) no
12-word run of the shipped text appears in the upstream Compound Writing files."""
import importlib.util
import os
import re
import sys
import unittest
from pathlib import Path

from _load import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
import overlap_check  # noqa: E402

# The upstream Compound Writing files, wherever they are on this computer (never shipped): CLEARING_UPSTREAM=<folder>
UPSTREAM = Path(os.environ.get("CLEARING_UPSTREAM") or "/nonexistent/compound-writing")
EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF]")


def manifest():
    data = {}
    for line in (ROOT / "plugin.yaml").read_text().splitlines():
        m = re.match(r"^(\w+):\s*(.*)$", line)
        if m:
            data[m.group(1)] = m.group(2).strip()
    return data


class FakeCtx:
    def __init__(self):
        self.tasks, self.hooks = [], []

    def register_auxiliary_task(self, key, **kw):
        self.tasks.append(key)

    def register_hook(self, name, fn):
        self.hooks.append(name)


class ReleaseTest(unittest.TestCase):
    def test_register_matches_the_manifest(self):
        spec = importlib.util.spec_from_file_location("clearing_pkg_release", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
        pkg = importlib.util.module_from_spec(spec)
        sys.modules["clearing_pkg_release"] = pkg
        spec.loader.exec_module(pkg)
        ctx = FakeCtx()
        pkg.register(ctx)
        m = manifest()
        self.assertEqual(m["name"], "clearing")
        self.assertEqual(m["manifest_version"], "2")
        self.assertEqual(m["requires_hermes"], '">=0.21.6"')  # the page feature-detects ctx.files (0.22.6); see HERMES-FLOORS.md
        self.assertEqual(m["provides_tools"], "[]")
        self.assertEqual(m["provides_hooks"], "[" + ", ".join(ctx.hooks) + "]")
        self.assertEqual(ctx.tasks, ["clearing_editor"])
        from _load import api
        self.assertEqual(m["version"], api.VERSION)
        self.assertEqual(__import__("json").loads((ROOT / "dashboard" / "manifest.json").read_text())["name"], m["name"])

    def test_bundle_keeps_the_desktop_rules(self):
        code = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
        imports = set(re.findall(r'^\s*import\s[\s\S]*?\sfrom\s*["\']([^"\']+)["\']', code, re.M))
        self.assertLessEqual(imports, {"@hermes/plugin-sdk", "react", "react/jsx-runtime"})
        for banned in ("innerHTML", "new Function(", "import("):
            self.assertNotIn(banned, code)
        self.assertLess(len(code.encode()), 16 * 1024 * 1024)
        self.assertNotIn("mod+k", code.lower())
        # Hermes's install scanner flags these as invisible_unicode; build them from escapes instead
        invisible = set("\u200b\u200c\u200d\u2060\u2062\u2063\u2064\ufeff\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069")
        for f in [ROOT / "desktop" / "plugin.js", *(ROOT / "desktop" / "src").glob("*.js*"), *(ROOT / "library").glob("*.json"), *ROOT.glob("*.py")]:
            self.assertFalse(set(f.read_text(encoding="utf-8")) & invisible, f)

    def test_no_emoji_in_anything_shipped(self):
        files = list((ROOT / "library").glob("*.json")) + [p for p in (ROOT / "desktop" / "src").glob("*.js*") if p.name != "assets.gen.js"]
        files += [ROOT / "plugin.yaml", ROOT / "README.md"]
        for f in files:
            if f.exists():
                self.assertIsNone(EMOJI.search(f.read_text(encoding="utf-8")), f)

    def test_overlap_checker_catches_a_copied_run(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "src.md"
            src.write_text("one two three four five six seven eight nine ten eleven twelve thirteen")
            target = Path(d) / "target.json"
            target.write_text('{"x": "One, two three four five six seven eight nine ten eleven twelve!"}')
            self.assertEqual(len(overlap_check.check([src], 12, [target])), 1)
            target.write_text('{"x": "one two three four five six seven eight nine ten eleven"}')
            self.assertEqual(overlap_check.check([src], 12, [target]), [])

    @unittest.skipUnless(__import__("shutil").which("node"), "node is not installed")
    def test_thesaurus_build_script_is_the_one_that_built_the_shards(self):
        """A-11: the script NOTICE.txt names is here, runs, and writes the notice the shipped shards carry."""
        import json
        import subprocess
        import tempfile
        shipped = ROOT / "library" / "thesaurus"
        with tempfile.TemporaryDirectory() as d:
            src, out = Path(d) / "oewn", Path(d) / "out"
            src.mkdir()
            (src / "verb.motion.json").write_text(json.dumps({
                "run-v": {"members": ["run", "go", "move"], "definition": ["move fast by using one's feet"]}}))
            (src / "entries-r.json").write_text(json.dumps({
                "run": {"v": {"sense": [{"synset": "run-v"}], "form": ["ran"]}}}))
            proc = subprocess.run(["node", str(ROOT / "scripts" / "build-thesaurus.mjs"), str(src), str(out)],
                                  capture_output=True, text=True, timeout=60)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            shard = json.loads((out / "ru.json").read_text())
            self.assertEqual(shard["w"]["run"], [["v", "move fast by using one's feet", ["go", "move"]]])
            self.assertEqual(json.loads((out / "ra.json").read_text())["f"], {"ran": "run"})
            built = (out / "NOTICE.txt").read_text().split("\n\nBuilt by")[0]
        self.assertEqual(built, (shipped / "NOTICE.txt").read_text().split("\n\nBuilt by")[0])
        self.assertEqual(shard["notice"], json.loads((shipped / "ab.json").read_text())["notice"])
        self.assertIn("Built by scripts/build-thesaurus.mjs from 128009", (shipped / "NOTICE.txt").read_text())

    def test_notice_covers_the_bundled_kit(self):
        """A-12: the bundle carries hermes-ui-kit; NOTICE says whose it is and under what license it ships."""
        notice = (ROOT / "NOTICE").read_text(encoding="utf-8")
        self.assertIn("Required Notice: Copyright (c) 2026 Damon Gardenhire", notice)
        self.assertIn("Required Notice: Copyright (c) 2026 Damon Gardenhire", (ROOT / "LICENSE").read_text(encoding="utf-8"))
        self.assertIn("hermes-ui-kit", notice)
        self.assertIn("also by\nDamon Gardenhire", notice)
        self.assertIn("same PolyForm Shield License 1.0.0", notice)
        parts = re.findall(r"hermes-ui-kit/src/(\w+)\.js", (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8"))
        self.assertTrue(parts)
        for part in parts:  # every kit file the bundle carries is named
            self.assertIn(part, notice)
        self.assertIn("library/thesaurus/NOTICE.txt", notice)

    def test_release_check_refuses_to_run_without_the_upstream_folder(self):
        import subprocess
        env = {k: v for k, v in os.environ.items() if k != "CLEARING_UPSTREAM"}
        proc = subprocess.run(["/bin/sh", str(ROOT / "scripts" / "release-check.sh")], env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("RELEASE CHECK FAILED: CLEARING_UPSTREAM is not set", proc.stderr)
        proc = subprocess.run(["/bin/sh", str(ROOT / "scripts" / "release-check.sh")], env={**env, "CLEARING_UPSTREAM": "/nonexistent/compound-writing"},
                              capture_output=True, text=True, timeout=60)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("not a folder on this computer", proc.stderr)

    @unittest.skipUnless((ROOT / "docs" / "RELEASE.md").exists(), "docs/RELEASE.md is a working note the public package leaves out")
    def test_release_notes_name_the_release_check(self):
        self.assertIn("scripts/release-check.sh", (ROOT / "docs" / "RELEASE.md").read_text(encoding="utf-8"))

    @unittest.skipUnless(UPSTREAM.exists(), "upstream Compound Writing files are not on this computer")
    def test_no_upstream_text_is_shipped(self):
        self.assertEqual(overlap_check.check([UPSTREAM], 12), [])


if __name__ == "__main__":
    unittest.main()
