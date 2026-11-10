"""The writer's pieces, versions and editor passes, in one SQLite file.

File: ``<hermes home>/plugin-data/clearing/clearing.db`` through ``plugins.plugin_storage.plugin_db``, which
follows the active Hermes profile and opens the file in WAL mode. Tests and the harness set
``CLEARING_DATA_DIR`` to a temporary folder, so they never touch a real profile.

Tables:
- ``pieces``   title, body, created, updated, trashed (null unless in the trash), finished version, sample flag
- ``versions`` a saved copy of a piece with the reason it was kept (idle, accepted changes, finished, restore)
- ``passes``   one row per editor pass: what was asked, the checked result, model, tokens, finish reason, status
- ``guidance`` the writer's own rules (voice, style, audience, guardrails, workflow), kept across pieces; a
               removed rule is retired, never erased
- ``decisions`` what the writer did with the editor's suggestions (kept, skipped, chose), evidence for lessons
- ``meta``     small settings (whether the sample piece was added, the last piece opened)

Authorship spans (``pieces.spans``, ``versions.spans``) say which characters came from the writer's model: a JSON
list of ``{start, end, pass_id, kind, model}``. The page (``authorship.js``) moves them as the writer edits; this
store only keeps them, per piece and per version, and drops any that fall outside the body.

A piece can be marked as a voice sample (``pieces.voice``): the writer's own words that sound like them.

Nothing is ever deleted outright. "Move to trash" sets ``trashed``; Restore clears it.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path

PLUGIN_ID = "clearing"
DB_NAME = "clearing.db"
MAX_BODY = 400_000  # characters a piece may hold (the editor works on 100,000 at most)
MAX_TITLE = 300
VERSION_CAP = 200  # versions kept per piece; the oldest idle ones go first

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_conn_key: str | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS pieces (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  created REAL NOT NULL, updated REAL NOT NULL, trashed REAL, finished_version TEXT, sample INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY, piece_id TEXT NOT NULL REFERENCES pieces(id), title TEXT NOT NULL, body TEXT NOT NULL,
  reason TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS versions_piece ON versions(piece_id, created);
CREATE TABLE IF NOT EXISTS passes (
  id TEXT PRIMARY KEY, piece_id TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
  request TEXT NOT NULL, result TEXT, model TEXT, provider TEXT, tokens_in INTEGER, tokens_out INTEGER,
  finish_reason TEXT, error_code TEXT, error TEXT, created REAL NOT NULL, finished REAL);
CREATE INDEX IF NOT EXISTS passes_piece ON passes(piece_id, created);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS guidance (
  id TEXT PRIMARY KEY, section TEXT NOT NULL, text TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '', source TEXT NOT NULL,
  piece_id TEXT, status TEXT NOT NULL DEFAULT 'kept', created REAL NOT NULL, updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY, piece_id TEXT NOT NULL, kind TEXT NOT NULL, original TEXT NOT NULL, chosen TEXT NOT NULL,
  choice TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS decisions_piece ON decisions(piece_id, created);
"""
COLUMNS = (("pieces", "voice", "INTEGER NOT NULL DEFAULT 0"), ("passes", "step", "TEXT"),
           ("decisions", "model", "TEXT NOT NULL DEFAULT ''"),  # added after 0.1.0
           # Nov 8, lane B: authorship spans per piece and per version; progress, partial results and counts per pass
           ("pieces", "spans", "TEXT NOT NULL DEFAULT '[]'"), ("versions", "spans", "TEXT NOT NULL DEFAULT '[]'"),
           ("passes", "phase", "TEXT"), ("passes", "progress", "TEXT"), ("passes", "counts", "TEXT"),
           ("passes", "sample", "INTEGER NOT NULL DEFAULT 0"))
SECTIONS = ("voice", "style", "audience", "guardrails", "workflow")
MAX_RULE = 600
MAX_RULES = 200
DECISION_KINDS = ("change", "opening", "flip", "draft", "word", "cut", "wording", "rewrite", "next", "ending", "title", "note")
# Decisions that put the writer's model's words into the piece: History lists them as "Suggested text you used".
MODEL_TEXT = {"change": "Typo fix", "opening": "Opening", "flip": "Main point or promise", "draft": "Draft from your notes",
              "wording": "Other wording", "rewrite": "Rewrite", "next": "Next sentence", "ending": "Ending", "title": "Title",
              "note": "From an editor's note"}
DECISION_CHOICES = ("kept", "skipped", "chose", "protected", "cut")

REASONS = {"idle": "Saved while you paused", "changes": "Kept the editor's changes", "opening": "Kept a new opening",
           "finished": "Marked finished", "restore": "Before restoring an older version", "start": "First words",
           "import": "Opened from a file", "rename": "Renamed",
           "word": "Before trying another word", "cut": "Before accepting cuts", "draft": "Your notes, before keeping a draft",
           "flip": "Before keeping a new sentence", "before_changes": "Before applying the editor's changes",
           "before_opening": "Before keeping a new opening", "suggestion": "Before using a suggestion"}  # "changes" and "opening": older copies, saved after the change


class StoreError(RuntimeError):
    """A plain-English failure the page can show as it is."""


def data_dir() -> Path:
    override = os.environ.get("CLEARING_DATA_DIR")
    if override:
        path = Path(override)
        path.mkdir(parents=True, exist_ok=True)
        return path
    from plugins.plugin_storage import plugin_data_dir  # inside Hermes
    return plugin_data_dir(PLUGIN_ID)


def _open() -> sqlite3.Connection:
    if os.environ.get("CLEARING_DATA_DIR"):
        conn = sqlite3.connect(str(data_dir() / DB_NAME), check_same_thread=False, timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
    else:
        from plugins.plugin_storage import plugin_db  # WAL, follows the active profile
        conn = plugin_db(PLUGIN_ID, DB_NAME)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    for table, col, decl in COLUMNS:
        if col not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    conn.commit()
    return conn


def db() -> sqlite3.Connection:
    """One connection per data folder; reopened when the profile (and so the folder) changes."""
    global _conn, _conn_key
    key = str(data_dir())
    with _lock:
        if _conn is None or _conn_key != key:
            if _conn is not None:
                try:
                    _conn.close()
                except sqlite3.Error:
                    pass
            _conn, _conn_key = _open(), key
        return _conn


def reset_for_tests() -> None:
    global _conn, _conn_key
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn, _conn_key = None, None


def _write(fn):
    """Run ``fn(conn)`` in one transaction. A full disk or a locked file becomes a plain message."""
    with _lock:
        conn = db()
        try:
            with conn:
                return fn(conn)
        except sqlite3.OperationalError as e:
            raise StoreError("Couldn't save. Your words are kept here until saving works.") from e


def now() -> float:
    return round(time.time(), 3)


def new_id() -> str:
    return uuid.uuid4().hex


def _clean_title(title) -> str:
    title = " ".join(str(title or "").split())
    return title[:MAX_TITLE]


def _clean_body(body) -> str:
    if not isinstance(body, str):
        raise ValueError("The piece's text is missing.")
    if len(body) > MAX_BODY:
        raise ValueError(f"This piece is longer than The Clearing holds ({MAX_BODY:,} characters). Split it into two pieces.")
    return body.replace("\r\n", "\n")


MAX_SPANS = 2000


def clean_spans(spans, body: str) -> list[dict]:
    """The authorship spans the page sent, kept only when they fit the body. At most MAX_SPANS."""
    out = []
    if not isinstance(spans, list):
        return out
    n = len(body)
    for sp in spans:
        if len(out) >= MAX_SPANS:
            break
        if not isinstance(sp, dict):
            continue
        a, b = sp.get("start"), sp.get("end")
        if not (isinstance(a, int) and isinstance(b, int)) or isinstance(a, bool) or isinstance(b, bool) or not 0 <= a < b <= n:
            continue
        out.append({"start": a, "end": b, "pass_id": " ".join(str(sp.get("pass_id") or "").split())[:64],
                    "kind": " ".join(str(sp.get("kind") or "").split())[:32], "model": " ".join(str(sp.get("model") or "").split())[:120]})
    return out


def _spans(raw) -> list:
    try:
        v = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    return v if isinstance(v, list) else []


def _piece(row, full=True) -> dict:
    d = {k: row[k] for k in row.keys()}
    d["spans"] = _spans(d.get("spans"))
    d["sample"] = bool(d.get("sample"))
    d["voice"] = bool(d.get("voice"))
    d["words"] = len(d["body"].split())
    if not full:
        d.pop("body")
    return d


# ---------- meta ----------
def meta_get(key, default=None):
    row = db().execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def meta_set(key, value) -> None:
    _write(lambda c: c.execute("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                               (key, json.dumps(value))))


# ---------- pieces ----------
def list_pieces(trashed=False) -> list[dict]:
    q = "SELECT * FROM pieces WHERE trashed IS " + ("NOT NULL ORDER BY trashed DESC" if trashed else "NULL ORDER BY updated DESC")
    return [_piece(r, full=False) for r in db().execute(q)]


def get_piece(piece_id) -> dict:
    row = db().execute("SELECT * FROM pieces WHERE id=?", (str(piece_id),)).fetchone()
    if row is None:
        raise LookupError("That piece is no longer here.")
    return _piece(row)


def create_piece(title="", body="", sample=False, reason="start") -> dict:
    pid, t = new_id(), now()
    title, body = _clean_title(title), _clean_body(body)

    def go(c):
        c.execute("INSERT INTO pieces(id,title,body,created,updated,sample) VALUES(?,?,?,?,?,?)",
                  (pid, title, body, t, t, int(bool(sample))))
        if body.strip():
            c.execute("INSERT INTO versions(id,piece_id,title,body,reason,created) VALUES(?,?,?,?,?,?)",
                      (new_id(), pid, title, body, reason, t))
    _write(go)
    return get_piece(pid)


def save_piece(piece_id, title=None, body=None, spans=None) -> dict:
    """Autosave. Only the fields given change. Returns the saved piece (without its body).
    ``spans`` None keeps the stored authorship spans (dropping any the new body no longer holds); a list replaces them."""
    p = get_piece(piece_id)
    if p["trashed"]:
        raise ValueError("This piece is in the trash. Restore it to keep writing.")
    title = p["title"] if title is None else _clean_title(title)
    body = p["body"] if body is None else _clean_body(body)
    kept = clean_spans(p["spans"] if spans is None else spans, body)
    if title == p["title"] and body == p["body"] and kept == p["spans"]:
        return _piece_meta(p)
    t = now()
    if title == p["title"] and body == p["body"]:  # only the spans changed: the piece was not edited
        _write(lambda c: c.execute("UPDATE pieces SET spans=? WHERE id=?", (json.dumps(kept), p["id"])))
    else:
        _write(lambda c: c.execute("UPDATE pieces SET title=?, body=?, spans=?, updated=?, sample=0 WHERE id=?",
                                   (title, body, json.dumps(kept), t, p["id"])))
    return _piece_meta(get_piece(p["id"]))


def _piece_meta(p) -> dict:
    return {k: v for k, v in p.items() if k != "body"}


def trash_piece(piece_id) -> dict:
    p = get_piece(piece_id)
    _write(lambda c: c.execute("UPDATE pieces SET trashed=? WHERE id=?", (now(), p["id"])))
    return _piece_meta(get_piece(p["id"]))


def restore_piece(piece_id) -> dict:
    p = get_piece(piece_id)
    _write(lambda c: c.execute("UPDATE pieces SET trashed=NULL, updated=? WHERE id=?", (now(), p["id"])))
    return _piece_meta(get_piece(p["id"]))


# ---------- versions ----------
def list_versions(piece_id) -> list[dict]:
    get_piece(piece_id)
    rows = db().execute("SELECT id,piece_id,title,reason,created,length(body) AS chars, body FROM versions WHERE piece_id=? ORDER BY created DESC",
                        (str(piece_id),)).fetchall()
    out = []
    for i, r in enumerate(rows):
        older = rows[i + 1]["body"] if i + 1 < len(rows) else None
        out.append({"id": r["id"], "title": r["title"], "reason": r["reason"], "label": REASONS.get(r["reason"], r["reason"]),
                    "created": r["created"], "words": len(r["body"].split()), "start": r["body"][:140],
                    "changed": changed_phrase(r["body"], older)})
    return out


def changed_phrase(new: str, old, limit: int = 70) -> dict | None:
    """What a version changed from the one before it, for telling History's rows apart: the first words that differ,
    as {"kind": "added" | "cut", "text"}, whole words, at most ``limit`` characters. None for the first version or no
    change."""
    if old is None or new == old:
        return None
    a = 0
    while a < min(len(new), len(old)) and new[a] == old[a]:
        a += 1
    b = 0
    while b < min(len(new), len(old)) - a and new[-1 - b] == old[-1 - b]:
        b += 1
    kind, text = ("added", new[a:len(new) - b]) if len(new) - b > a else ("cut", old[a:len(old) - b])
    while a > 0 and not text[:1].isspace() and (new if kind == "added" else old)[a - 1:a].strip():
        a -= 1  # back to the start of the word
        text = (new if kind == "added" else old)[a] + text
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "…"
    return {"kind": kind, "text": text} if text else None


def get_version(version_id) -> dict:
    row = db().execute("SELECT * FROM versions WHERE id=?", (str(version_id),)).fetchone()
    if row is None:
        raise LookupError("That version is no longer here.")
    d = {k: row[k] for k in row.keys()}
    d["spans"] = _spans(d.get("spans"))
    return d


def add_version(piece_id, reason="idle", title=None, body=None, spans=None) -> dict | None:
    """Keep a copy of the piece as it is now (or as given), with the authorship spans current then.
    Skips a copy identical to the latest one."""
    if reason not in REASONS:
        raise ValueError("Unknown reason for a version.")
    p = get_piece(piece_id)
    title = p["title"] if title is None else _clean_title(title)
    body = p["body"] if body is None else _clean_body(body)
    kept = clean_spans(p["spans"] if spans is None else spans, body)
    last = db().execute("SELECT * FROM versions WHERE piece_id=? ORDER BY created DESC LIMIT 1", (p["id"],)).fetchone()
    if last is not None and last["body"] == body and last["title"] == title and reason in ("idle", "restore", "rename"):
        return None
    if not body.strip() and reason == "idle":
        return None
    vid, t = new_id(), now()

    def go(c):
        c.execute("INSERT INTO versions(id,piece_id,title,body,reason,created,spans) VALUES(?,?,?,?,?,?,?)",
                  (vid, p["id"], title, body, reason, t, json.dumps(kept)))
        extra = c.execute("SELECT COUNT(*) FROM versions WHERE piece_id=?", (p["id"],)).fetchone()[0] - VERSION_CAP
        if extra > 0:
            c.execute("DELETE FROM versions WHERE id IN (SELECT id FROM versions WHERE piece_id=? AND reason='idle' ORDER BY created LIMIT ?)",
                      (p["id"], extra))
    _write(go)
    return {"id": vid, "reason": reason, "label": REASONS[reason], "created": t}


def restore_version(piece_id, version_id) -> dict:
    """Put an older version back in the page. The current text is kept as a version first."""
    p, v = get_piece(piece_id), get_version(version_id)
    if v["piece_id"] != p["id"]:
        raise LookupError("That version belongs to another piece.")
    add_version(p["id"], "restore")
    t = now()
    spans = json.dumps(clean_spans(v["spans"], v["body"]))
    _write(lambda c: c.execute("UPDATE pieces SET title=?, body=?, spans=?, updated=? WHERE id=?", (v["title"], v["body"], spans, t, p["id"])))
    return get_piece(p["id"])


def finish_piece(piece_id, title=None, body=None) -> dict:
    """Save, keep a 'finished' version and point the piece at it."""
    if title is not None or body is not None:
        save_piece(piece_id, title, body)
    v = add_version(piece_id, "finished")
    _write(lambda c: c.execute("UPDATE pieces SET finished_version=? WHERE id=?", (v["id"], str(piece_id))))
    return get_piece(piece_id)


# ---------- passes ----------
def add_pass(piece_id, target, kind, request, progress=None) -> dict:
    get_piece(piece_id)
    pid, t = new_id(), now()
    _write(lambda c: c.execute("INSERT INTO passes(id,piece_id,target,kind,status,request,created,phase,progress) VALUES(?,?,?,?,?,?,?,?,?)",
                               (pid, str(piece_id), target, kind, "running", json.dumps(request), t, "sending",
                                json.dumps(progress or {}))))
    return get_pass(pid)


COUNT_KEYS = ("returned", "matched", "dropped", "praise", "cut_off")


def _counts(result, extra=None) -> dict | None:
    """The counts kept with a pass for History: what the model returned, what matched, what was dropped (and how
    many only praised), and how many of the pass's calls were cut off."""
    src = result.get("counts") if isinstance(result, dict) and isinstance(result.get("counts"), dict) else None
    if src is None and not extra:
        return None
    out = {k: int((src or {}).get(k) or 0) for k in COUNT_KEYS}
    for k, v in (extra or {}).items():
        if k in COUNT_KEYS:
            out[k] = int(v or 0)
    return out


def finish_pass(pass_id, *, status, result=None, model=None, provider=None, tokens_in=None, tokens_out=None,
                finish_reason=None, error_code=None, error=None, counts=None, progress=None) -> dict:
    kept = _counts(result, counts)

    def go(c):
        c.execute(
            "UPDATE passes SET status=?, result=?, model=?, provider=?, tokens_in=?, tokens_out=?, finish_reason=?, error_code=?, error=?, "
            "finished=?, phase=NULL, counts=? WHERE id=? AND status='running'",
            (status, None if result is None else json.dumps(result), model, provider, tokens_in, tokens_out, finish_reason,
             error_code, error, now(), None if kept is None else json.dumps(kept), str(pass_id)))
        if progress:
            row = c.execute("SELECT progress FROM passes WHERE id=?", (str(pass_id),)).fetchone()
            cur = _json_dict(row["progress"] if row else None)
            cur.update(progress)
            c.execute("UPDATE passes SET progress=? WHERE id=?", (json.dumps(cur), str(pass_id)))
    _write(go)
    return get_pass(pass_id)


def _json_dict(raw) -> dict:
    try:
        v = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return v if isinstance(v, dict) else {}


def set_phase(pass_id, phase: str) -> None:
    """What a running pass is doing now, set when that step starts: sending, reading or checking."""
    if phase not in ("sending", "reading", "checking"):
        return
    _write(lambda c: c.execute("UPDATE passes SET phase=? WHERE id=? AND status='running'", (phase, str(pass_id))))


def set_progress(pass_id, partial=None, **progress) -> None:
    """Partial results while a pass runs (the options or sections that have landed), and progress fields
    (``sections``, ``fallback``). Only a running pass changes; a finished one keeps its final result."""
    def go(c):
        row = c.execute("SELECT progress, status FROM passes WHERE id=?", (str(pass_id),)).fetchone()
        if row is None or row["status"] != "running":
            return
        cur = _json_dict(row["progress"])
        cur.update(progress)
        if partial is None:
            c.execute("UPDATE passes SET progress=? WHERE id=?", (json.dumps(cur), str(pass_id)))
        else:
            c.execute("UPDATE passes SET progress=?, result=? WHERE id=?", (json.dumps(cur), json.dumps(partial), str(pass_id)))
    _write(go)


def add_sample_pass(piece_id, target, kind, result, model) -> dict:
    """A finished pass stored with the sample piece (the sample read a real model made during the bench run)."""
    get_piece(piece_id)
    pid, t = new_id(), now()
    words = len(get_piece(piece_id)["body"].split())
    _write(lambda c: c.execute(
        "INSERT INTO passes(id,piece_id,target,kind,status,request,result,model,provider,created,finished,progress,counts,sample) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
        (pid, str(piece_id), target, kind, "done", json.dumps({"selection": None, "body_length": len(get_piece(piece_id)["body"])}),
         json.dumps(result), str(model or ""), "", t, t, json.dumps({"words": words}), json.dumps(_counts(result)))))
    return get_pass(pid)


def sample_pass(piece_id) -> dict | None:
    row = db().execute("SELECT id FROM passes WHERE piece_id=? AND sample=1 AND status='done' ORDER BY created DESC LIMIT 1",
                       (str(piece_id),)).fetchone()
    return get_pass(row["id"]) if row else None


def list_passes(piece_id, limit=60) -> list[dict]:
    """The piece's finished passes, newest first, with their counts, for History."""
    rows = db().execute("SELECT id,target,kind,status,model,created,counts FROM passes WHERE piece_id=? AND status!='running' "
                        "ORDER BY created DESC LIMIT ?", (str(piece_id), limit)).fetchall()
    return [{"id": r["id"], "target": r["target"], "kind": r["kind"], "status": r["status"], "model": r["model"] or "",
             "created": r["created"], "counts": _json_dict(r["counts"]) if r["counts"] else None} for r in rows]


def get_pass(pass_id) -> dict:
    row = db().execute("SELECT * FROM passes WHERE id=?", (str(pass_id),)).fetchone()
    if row is None:
        raise LookupError("That editor pass is no longer here.")
    d = {k: row[k] for k in row.keys()}
    d["request"] = json.loads(d["request"])
    d["result"] = json.loads(d["result"]) if d["result"] else None
    d["progress"] = _json_dict(d.get("progress"))
    d["counts"] = _json_dict(d["counts"]) if d.get("counts") else None
    d["sample"] = bool(d.get("sample"))
    return d


def running_pass(piece_id) -> dict | None:
    row = db().execute("SELECT id FROM passes WHERE piece_id=? AND status='running' ORDER BY created DESC LIMIT 1", (str(piece_id),)).fetchone()
    return get_pass(row["id"]) if row else None


def interrupt_stale_passes() -> int:
    """Passes still 'running' when the backend starts were cut short by a restart."""
    def go(c):
        return c.execute("UPDATE passes SET status='failed', error_code='interrupted', phase=NULL, "
                         "error='Hermes restarted before the editor finished. Try again.', finished=? WHERE status='running'",
                         (now(),)).rowcount
    return _write(go)


def usage_for_piece(piece_id) -> dict:
    row = db().execute("SELECT COUNT(*) n, COALESCE(SUM(tokens_in),0) i, COALESCE(SUM(tokens_out),0) o FROM passes WHERE piece_id=? AND status='done'",
                       (str(piece_id),)).fetchone()
    return {"passes": row["n"], "tokens_in": row["i"], "tokens_out": row["o"]}


def set_step(pass_id, step: str) -> None:
    """What a pass with several calls is doing now ("The skeptic is reading"), for the page's working note."""
    _write(lambda c: c.execute("UPDATE passes SET step=? WHERE id=? AND status='running'", (str(step)[:200], str(pass_id))))


def cached_pass(piece_id, target, version) -> dict | None:
    """The newest finished pass of this target on this exact piece version (``request.version``), or None."""
    if not version:
        return None
    rows = db().execute("SELECT id, request FROM passes WHERE piece_id=? AND target=? AND status='done' ORDER BY created DESC LIMIT 30",
                        (str(piece_id), str(target))).fetchall()
    for r in rows:
        if _json_dict(r["request"]).get("version") == version:
            return get_pass(r["id"])
    return None


def latest_pass(piece_id, kind) -> dict | None:
    row = db().execute("SELECT id FROM passes WHERE piece_id=? AND kind=? AND status='done' ORDER BY created DESC LIMIT 1",
                       (str(piece_id), kind)).fetchone()
    return get_pass(row["id"]) if row else None


# ---------- voice samples ----------
def set_voice(piece_id, on: bool) -> dict:
    p = get_piece(piece_id)
    _write(lambda c: c.execute("UPDATE pieces SET voice=? WHERE id=?", (int(bool(on)), p["id"])))
    return _piece_meta(get_piece(p["id"]))


def voice_samples(exclude=None) -> list[dict]:
    rows = db().execute("SELECT * FROM pieces WHERE voice=1 AND trashed IS NULL ORDER BY updated DESC").fetchall()
    return [_piece(r) for r in rows if r["id"] != exclude and r["body"].strip()]


def first_version(piece_id) -> dict | None:
    row = db().execute("SELECT * FROM versions WHERE piece_id=? ORDER BY created LIMIT 1", (str(piece_id),)).fetchone()
    return {k: row[k] for k in row.keys()} if row else None


# ---------- the writer's guidance ----------
def _rule(row) -> dict:
    return {k: row[k] for k in row.keys()}


def list_guidance(include_retired=False) -> list[dict]:
    q = "SELECT * FROM guidance" + ("" if include_retired else " WHERE status='kept'") + " ORDER BY created"
    return [_rule(r) for r in db().execute(q)]


def add_rule(section, text, evidence="", source="writer", piece_id=None) -> dict:
    section = section if section in SECTIONS else "style"
    text = " ".join(str(text or "").split())[:MAX_RULE]
    if not text:
        raise ValueError("Write the rule first, then keep it.")
    if source not in ("writer", "lesson", "onboarding"):
        source = "writer"
    kept = list_guidance()
    if any(r["text"].lower() == text.lower() for r in kept):
        raise ValueError("You already keep that rule.")
    if len(kept) >= MAX_RULES:
        raise ValueError(f"You keep {MAX_RULES} rules already. Remove one, then add this.")
    rid, t = new_id(), now()
    _write(lambda c: c.execute("INSERT INTO guidance(id,section,text,evidence,source,piece_id,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?)",
                               (rid, section, text, str(evidence or "")[:MAX_RULE], source, piece_id, "kept", t, t)))
    return get_rule(rid)


def get_rule(rule_id) -> dict:
    row = db().execute("SELECT * FROM guidance WHERE id=?", (str(rule_id),)).fetchone()
    if row is None:
        raise LookupError("That rule is no longer here.")
    return _rule(row)


def update_rule(rule_id, text=None, section=None, status=None) -> dict:
    r = get_rule(rule_id)
    text = r["text"] if text is None else " ".join(str(text).split())[:MAX_RULE]
    if not text:
        raise ValueError("A rule needs words. Remove it instead.")
    section = r["section"] if section not in SECTIONS else section
    status = r["status"] if status not in ("kept", "retired") else status
    _write(lambda c: c.execute("UPDATE guidance SET text=?, section=?, status=?, updated=? WHERE id=?", (text, section, status, now(), r["id"])))
    return get_rule(r["id"])


# ---------- decisions ----------
def add_decisions(piece_id, items) -> int:
    get_piece(piece_id)
    rows = []
    for it in (items or [])[:100]:
        if not isinstance(it, dict) or it.get("kind") not in DECISION_KINDS or it.get("choice") not in DECISION_CHOICES:
            continue
        original, chosen = str(it.get("original") or "")[:2000], str(it.get("chosen") or "")[:2000]
        model = " ".join(str(it.get("model") or "").split())[:120] if it["kind"] in MODEL_TEXT else ""
        if original.strip() or chosen.strip():
            rows.append((new_id(), str(piece_id), it["kind"], original, chosen, it["choice"], now(), model))
    if rows:
        _write(lambda c: c.executemany("INSERT INTO decisions(id,piece_id,kind,original,chosen,choice,created,model) VALUES(?,?,?,?,?,?,?,?)", rows))
    return len(rows)


def suggestions_used(piece_id, limit=40) -> list[dict]:
    """The model's words the writer put into this piece, newest first: what it replaced, what went in, and which
    model wrote it. A word swapped from the dictionary is the writer's choice, not model text, and is not listed."""
    kinds = tuple(MODEL_TEXT)
    rows = db().execute(
        f"SELECT * FROM decisions WHERE piece_id=? AND choice IN ('chose','kept') AND kind IN ({','.join('?' * len(kinds))}) "
        "ORDER BY created DESC LIMIT ?", (str(piece_id), *kinds, limit))
    return [{"kind": r["kind"], "label": MODEL_TEXT[r["kind"]], "original": r["original"], "chosen": r["chosen"],
             "model": r["model"], "created": r["created"]} for r in rows]


# ---------- the room's settings ----------
SETTINGS = {"suggestions": True}


def settings() -> dict:
    """The writer's room settings, kept with the pieces so every window and the backend agree."""
    saved = meta_get("settings")
    saved = saved if isinstance(saved, dict) else {}
    return {k: (saved.get(k) if isinstance(saved.get(k), type(v)) else v) for k, v in SETTINGS.items()}


def set_settings(changes) -> dict:
    cur = settings()
    for k, v in (changes or {}).items():
        if k in SETTINGS and isinstance(v, type(SETTINGS[k])):
            cur[k] = v
    meta_set("settings", cur)
    return cur


def list_decisions(piece_id=None, limit=60) -> list[dict]:
    if piece_id:
        rows = db().execute("SELECT * FROM decisions WHERE piece_id=? ORDER BY created DESC LIMIT ?", (str(piece_id), limit))
    else:
        rows = db().execute("SELECT * FROM decisions ORDER BY created DESC LIMIT ?", (limit,))
    return [{k: r[k] for k in r.keys()} for r in rows]
