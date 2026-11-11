"""Pin the current commit into the sha, the card image and every screenshot URL already listed in docs/catalog/clearing.yaml (the draft for
plugin-catalog/clearing.yaml), then check the entry with
Hermes's own catalog validator if it is on this computer (run with a scratch HOME, never the real one).

    /usr/bin/python3 scripts/pin_catalog.py            # pin HEAD
    /usr/bin/python3 scripts/pin_catalog.py <sha>      # pin a given commit
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "docs" / "catalog" / "clearing.yaml"
REPO = "Dgardenhire/hermes-clearing"
# Every raw.githubusercontent.com URL in the entry (the card and the screenshots, whatever they are), with its sha slot.
URL = re.compile(r"https://raw\.githubusercontent\.com/" + re.escape(REPO) + r"/([^/\s\"]+)/([^\s\"]+)")


def main() -> int:
    sha = sys.argv[1] if len(sys.argv) > 1 else subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        print("A full 40-character commit sha is needed.")
        return 1
    text = ENTRY.read_text(encoding="utf-8")
    paths = [m.group(2) for m in URL.finditer(text)]
    shots = [p for p in paths if p.startswith("docs/shots/")]
    if not any(p.startswith("docs/catalog/") for p in paths) or not shots or len(shots) > 6:
        print("The entry needs a card image and one to six screenshots on raw.githubusercontent.com.")
        return 1
    missing = [p for p in paths if subprocess.run(["git", "cat-file", "-e", f"{sha}:{p}"], cwd=ROOT, capture_output=True).returncode]
    if missing:
        print(f"Not in commit {sha[:10]}:", ", ".join(missing))
        return 1
    text = re.sub(r"^sha: .*$", f"sha: {sha}", text, flags=re.M)
    text = URL.sub(lambda m: f"https://raw.githubusercontent.com/{REPO}/{sha}/{m.group(2)}", text)
    ENTRY.write_text(text, encoding="utf-8")
    print(f"Pinned {sha[:10]} with the card and {len(shots)} screenshots.")
    agent = Path.home() / ".hermes" / "hermes-agent"
    validator = agent / "scripts" / "validate_plugin_catalog.py"
    python = agent / "venv" / "bin" / "python"
    if validator.is_file() and python.is_file():
        scratch = tempfile.mkdtemp(prefix="clearing-catalog-")
        env = {"HOME": scratch, "HERMES_HOME": scratch, "PYTHONPATH": str(agent), "PATH": os.environ.get("PATH", "")}
        proc = subprocess.run([str(python), str(validator), str(ENTRY)], env=env, capture_output=True, text=True, timeout=60)
        print((proc.stdout + proc.stderr).strip())
        return proc.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
