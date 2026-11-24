"""The Clearing starts no outside programs: nothing in the plugin's own code can launch one, so none can inherit
Hermes's environment and keys. A static read of the files; a future launch has to come with its own allowlisted
environment and a change to this test."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAUNCH = re.compile(r"\bimport\s+subprocess\b|\bfrom\s+subprocess\s+import\b|\bsubprocess\.|\bos\.(system|popen|exec\w*|spawn\w*|fork)\("
                    r"|\bpty\.spawn\(|\basyncio\.create_subprocess_\w+\(|\bmultiprocessing\b")


class NoLaunches(unittest.TestCase):
    def test_the_plugin_code_starts_no_program(self):
        files = sorted(ROOT.glob("*.py")) + sorted(ROOT.glob("dashboard/*.py"))
        self.assertGreater(len(files), 8, "the scan found the plugin's modules")
        hits = []
        for path in files:
            for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                code = line.split("#", 1)[0]
                if LAUNCH.search(code):
                    hits.append(f"{path.relative_to(ROOT)}:{n}")
        self.assertEqual(hits, [], "a program launch in the plugin's code")

    def test_the_scan_sees_a_launch(self):
        for line in ("import subprocess", "subprocess.run(['x'])", "os.system('x')", "asyncio.create_subprocess_exec('x')"):
            self.assertTrue(LAUNCH.search(line), line)
        self.assertFalse(LAUNCH.search("raise ValueError('The page is empty.')"))


if __name__ == "__main__":
    unittest.main()
