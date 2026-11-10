#!/usr/bin/env python3
"""Contiguous-overlap check: does any run of N words in The Clearing's shipped text also appear in a source?

    /usr/bin/python3 scripts/overlap_check.py --source <folder> [--source <folder> ...] [--words 12]

Sources are read only (for example the upstream Compound Writing files). The Clearing's shipped text is
the library (library/*.json), the page source (desktop/src, without the embedded assets), the Python half
and the README. Text is compared after lowercasing and keeping only letters and digits, the same
normalization the web app's release check used. Exit code 1 if any run matches. This is engineering
evidence for the release-rights boundary (Clearing-authored text only), not legal advice.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SUFFIXES = {".md", ".markdown", ".txt", ".json", ".yaml", ".yml", ".js", ".mjs", ".ts", ".py", ".html"}


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def grams(ws: list[str], n: int):
    for i in range(len(ws) - n + 1):
        yield " ".join(ws[i:i + n])


def shipped() -> list[Path]:
    files = sorted((ROOT / "library").glob("*.json"))
    files += [p for p in sorted((ROOT / "desktop" / "src").glob("*.js*")) if p.name != "assets.gen.js"]
    files += sorted(ROOT.glob("*.py")) + sorted((ROOT / "dashboard").glob("*.py"))
    files += [p for p in (ROOT / "README.md",) if p.exists()]
    return files


def check(sources: list[Path], n: int = 12, targets: list[Path] | None = None) -> list[tuple[str, str]]:
    seen: dict[str, str] = {}
    for src in sources:
        for f in sorted(src.rglob("*")) if src.is_dir() else [src]:
            if f.is_file() and f.suffix.lower() in SOURCE_SUFFIXES and "node_modules" not in f.parts:
                for g in grams(words(f.read_text(encoding="utf-8", errors="ignore")), n):
                    seen.setdefault(g, str(f))
    hits = []
    for f in targets or shipped():
        for g in set(grams(words(f.read_text(encoding="utf-8", errors="ignore")), n)):
            if g in seen:
                hits.append((str(f.relative_to(ROOT) if f.is_relative_to(ROOT) else f), g))
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", action="append", required=True, type=Path)
    ap.add_argument("--words", type=int, default=12)
    a = ap.parse_args()
    missing = [s for s in a.source if not s.exists()]
    if missing:
        print("missing source:", ", ".join(map(str, missing)))
        return 2
    hits = check(a.source, a.words)
    files = shipped()
    print(f"{len(files)} shipped files checked against {len(a.source)} source folder(s), {a.words}-word runs: {len(hits)} match(es)")
    for f, g in hits[:50]:
        print(f"  {f}: {g}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
