"""Set up a writing home: the writer's guidance, voice samples and pieces as a folder of plain files.

No model. The folder is ``<hermes home>/plugin-data/clearing/home/``; the page can show it in the Finder or
Explorer. ``plan()`` lists every file and whether it will be created or is already there, with a short
fingerprint of what would be written. ``setup(fingerprint)`` writes only if the plan is still the one the
writer saw, and creates each file exclusively: a file that is already there is never opened for writing,
so anything the writer edited in the folder stays as they left it. The report says what was created,
what was already there, and what could not be written.

    home/
      README.md            what the folder is
      VOICE.md             the voice rules the writer kept, and the list of voice samples
      STYLE.md             style, audience, guardrails and workflow rules
      examples/<title>.md  each piece marked as a voice sample
      drafts/<title>.md    each piece (not in the trash), as it is today
"""

from __future__ import annotations

import hashlib
import re

try:
    from . import library, store
except ImportError:  # loaded as loose modules (tests)
    import library  # type: ignore
    import store  # type: ignore

MAX_FILES = 400


class PlanChanged(RuntimeError):
    """The guidance or the pieces changed after the writer saw the plan."""


def folder():
    return store.data_dir() / "home"


_FORMAT = re.compile("[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]")
_DEVICE = re.compile(r"(?i)^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$")


def safe_name(title: str) -> str:
    """A file name from a title: no separators or control characters, no hidden ".name", no bidi or other
    invisible format characters (a title can't make "gpj.exe" read as "exe.jpg"), no trailing dots or spaces,
    and never a Windows device name. Shared by the writing home and the Word export."""
    base = _FORMAT.sub("", title or "")
    base = re.sub(r"[\\/:*?\"<>|\x00-\x1f\x7f]+|\.{2,}", " ", base)
    base = re.sub(r"\s+", " ", base).strip().lstrip(".").strip()[:80].rstrip(". ") or "Untitled"
    return "_" + base if _DEVICE.match(base) else base


_slug = safe_name


def _inside(root, target) -> bool:
    """True when ``target`` resolves inside ``root`` (a planted symlink can't carry a write elsewhere)."""
    try:
        target.parent.resolve().relative_to(root.resolve())
    except (ValueError, OSError):
        return False
    return True


def _rules_md(heading: str, rules: list[dict]) -> str:
    if not rules:
        return f"## {heading}\n\nNo rules kept yet.\n"
    lines = [f"## {heading}", ""]
    for r in rules:
        lines.append(f"- {r['text']}")
        if r.get("evidence"):
            lines.append(f"  From your words: “{' '.join(r['evidence'].split())}”")
    return "\n".join(lines) + "\n"


def _files() -> list[tuple[str, str]]:
    add = library._raw()["add"]["home"]
    names = add["sections"]
    rules = store.list_guidance()
    by = {s: [r for r in rules if r["section"] == s] for s in store.SECTIONS}
    samples = store.voice_samples()
    pieces = [store.get_piece(p["id"]) for p in store.list_pieces()][:MAX_FILES // 2]
    out = [("README.md", f"# Writing home\n\n{add['readme']}\n")]

    used: dict[str, set] = {"examples": set(), "drafts": set()}

    def name(folder_name, title):
        base, n = _slug(title), 2
        cand = base
        while cand.lower() in used[folder_name]:
            cand, n = f"{base} ({n})", n + 1
        used[folder_name].add(cand.lower())
        return f"{folder_name}/{cand}.md"

    sample_files = [(name("examples", p["title"]), p) for p in samples]
    voice = ["# Voice", "", _rules_md(names["voice"], by["voice"]), "## Voice samples", ""]
    voice += [f"- {p['title'] or 'Untitled'} ({path})" for path, p in sample_files] or ["No pieces marked as voice samples yet."]
    out.append(("VOICE.md", "\n".join(voice) + "\n"))
    out.append(("STYLE.md", "# Style\n\n" + "\n".join(_rules_md(names[s], by[s]) for s in ("style", "audience", "guardrails", "workflow"))))
    for path, p in sample_files:
        out.append((path, f"# {p['title'] or 'Untitled'}\n\n{p['body'].rstrip()}\n"))
    for p in pieces:
        if p["body"].strip():
            out.append((name("drafts", p["title"]), f"# {p['title'] or 'Untitled'}\n\n{p['body'].rstrip()}\n"))
    return out[:MAX_FILES]


def plan() -> dict:
    root = folder()
    files, digest = [], hashlib.sha256()
    for path, text in _files():
        exists = (root / path).exists()
        files.append({"path": path, "status": "keep" if exists else "create", "bytes": len(text.encode("utf-8"))})
        if not exists:
            digest.update(path.encode("utf-8") + b"\0" + text.encode("utf-8") + b"\0")
    return {"folder": str(root), "files": files, "fingerprint": digest.hexdigest()[:12],
            "create": sum(f["status"] == "create" for f in files), "keep": sum(f["status"] == "keep" for f in files)}


def setup(fingerprint: str) -> dict:
    if plan()["fingerprint"] != str(fingerprint or ""):
        raise PlanChanged("Your guidance or pieces changed since you saw the plan. Look at the new plan, then set it up.")
    root = folder()
    created, kept, failed = [], [], []
    for path, text in _files():
        target = root / path
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            if not _inside(root, target):
                failed.append(path)
                continue
            with open(target, "x", encoding="utf-8", newline="\n") as f:  # exclusive: never replaces a file
                f.write(text)
            created.append(path)
        except FileExistsError:
            kept.append(path)
        except OSError:
            failed.append(path)
    return {"folder": str(root), "created": created, "kept": kept, "failed": failed}
