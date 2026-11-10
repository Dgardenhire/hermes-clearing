"""Write the current commit, its card image and its screenshot URLs into docs/catalog/clearing.yaml (the draft for
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
CARD = "docs/catalog/card.png"
REPO = "Dgardenhire/hermes-clearing"
SHOTS = ["quick-light", "openings-light", "words2-dark", "pass-dark-green", "ask-light", "nomodel-dark"]  # at most 6


def main() -> int:
    sha = sys.argv[1] if len(sys.argv) > 1 else subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        print("A full 40-character commit sha is needed.")
        return 1
    missing = [s for s in SHOTS if not (ROOT / "docs" / "shots" / f"{s}.png").is_file()]
    missing += [CARD] if not (ROOT / CARD).is_file() else []
    if missing:
        print("Missing screenshots:", ", ".join(missing))
        return 1
    text = ENTRY.read_text(encoding="utf-8")
    text = re.sub(r"^sha: .*$", f"sha: {sha}", text, flags=re.M)
    text = re.sub(r"^image: .*$", f"image: https://raw.githubusercontent.com/{REPO}/{sha}/{CARD}", text, flags=re.M)
    shots = "screenshots:\n" + "".join(f"  - https://raw.githubusercontent.com/{REPO}/{sha}/docs/shots/{s}.png\n" for s in SHOTS)
    text = re.sub(r"^screenshots:(?:\s*\[\]\n|\n(?:  - .*\n)+)", shots, text, flags=re.M)
    ENTRY.write_text(text, encoding="utf-8")
    print(f"Pinned {sha[:10]} with the card and {len(SHOTS)} screenshots.")
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
