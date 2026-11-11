"""Dictation: the page records the writer's voice; this backend turns it into text for the cursor.

The page records with the browser's own microphone access (``getUserMedia`` and ``MediaRecorder``) and sends
the recording here once, as base64. Two engines, in this order, the way Debate Workbench does it:

1. Hermes's own speech-to-text, ``tools.voice_mode.transcribe_recording``: the function behind Hermes's own
   dictation, following Settings, Voice (local faster-whisper, a local whisper command, or a cloud provider).
   It is not in Hermes's public plugin API, so the import is guarded and a Hermes that moves it falls back to 2.
2. faster-whisper, when Hermes's Python has it and a speech model is already in the shared Hugging Face
   cache (read only). The Clearing never downloads a model.

Press first for anything that may leave the computer. When Hermes's speech-to-text is a cloud service, or
Hermes decides at run time (auto-detect, or a service from another plugin), a recording is never sent until the
page has said where it goes and the writer pressed Send. The request must name the same service the plan names
now (``send_to``); a press for one service is not consent for another. A local engine needs no press.

Bounds: 25 MB of audio, 10 minutes, the audio types MediaRecorder makes (WebM, Ogg, MP4, WAV), checked by their
bytes. The recording is written to the plugin's data folder only while it is transcribed, then deleted. Nothing
is kept: not the audio, and not the text, which goes to the page and nowhere else.
"""

from __future__ import annotations

import base64
import binascii
import importlib.util
import logging
import os
import re
import secrets
import wave
from pathlib import Path

_log = logging.getLogger("hermes.plugins.clearing")

MAX_AUDIO = 25 * 1024 * 1024
MAX_SECONDS = 10 * 60
TIMEOUT = 180
WAV_RATE = 16000
CLOUD = ("openai", "groq", "mistral", "xai", "elevenlabs", "deepinfra")
LABELS = {"openai": "OpenAI", "groq": "Groq", "mistral": "Mistral", "xai": "xAI", "elevenlabs": "ElevenLabs",
          "deepinfra": "DeepInfra", "local": "Hermes's own speech-to-text, run locally",
          "local_command": "Hermes's whisper command, run locally", "whisper": "faster-whisper, run locally"}
HERMES_LOCAL_DEFAULT = "base"
OWN_MODELS = ("base.en", "small.en", "base", "small", "tiny.en", "tiny")
MODEL_FILES = ("model.bin", "config.json", "tokenizer.json")

NOT_READY = "Dictation needs speech-to-text. Turn it on in Hermes Settings, Voice, then try again."
NEEDS_MODEL = ("Dictation needs Hermes's speech model, which hasn't been downloaded yet. Use dictation once in a Hermes "
               "chat so Hermes downloads it, then try again here.")
NO_SPEECH = "No words were heard. Check the microphone, then try again."
FAILED = "Your recording couldn't be turned into text just now. Nothing was added. Try again."
# Hermes has no public speech-to-text call for plugins (no ctx.* verb, nothing in hermes_cli/data/plugin_api.json),
# so engine 1 uses tools.voice_mode.transcribe_recording. When a Hermes release moves or reshapes it, the writer is
# told that plainly, not sent to Settings to turn on something that is already on.
HERMES_CHANGED = ("This version of Hermes doesn't let The Clearing use its speech-to-text, so dictation is off for now. "
                  "Typing works as always. An update to The Clearing will bring dictation back.")


class DictationError(ValueError):
    """A plain-English reason, safe to show the writer."""


class NeedsPress(Exception):
    """The recording would leave the computer and the writer hasn't pressed Send for that service."""

    def __init__(self, plan):
        super().__init__(plan.get("provider") or "")
        self.plan = plan


# ---------- what Hermes would do ----------
def _hermes_fn():
    try:
        from tools.voice_mode import transcribe_recording  # private Hermes import; see the module notes
    except Exception:
        return None
    return transcribe_recording if callable(transcribe_recording) else None


def _inside_hermes():
    """True when Hermes's public config module is importable, so a missing engine 1 means Hermes moved it."""
    try:
        import hermes_cli.config  # noqa: F401  (public plugin API)
    except Exception:
        return False
    return True


def _not_ready():
    return HERMES_CHANGED if _hermes_fn() is None and _inside_hermes() else NOT_READY


def _stt_config():
    try:
        from hermes_cli.config import load_config_readonly
        cfg = load_config_readonly()
    except Exception:
        return {}
    stt = cfg.get("stt") if isinstance(cfg, dict) else None
    return stt if isinstance(stt, dict) else {}


def whisper_installed():
    try:
        return importlib.util.find_spec("faster_whisper") is not None
    except (ImportError, ValueError):
        return False


def _repo(name):
    name = str(name or "").strip()
    if re.fullmatch(r"[\w.-]+/[\w.-]+", name):
        return name
    if re.fullmatch(r"(tiny|base|small|medium)(\.en)?|large-v[123]", name):
        return f"Systran/faster-whisper-{name}"
    return None


def _complete(d: Path) -> bool:
    try:
        return d.is_dir() and any(v.is_file() for v in d.glob("vocabulary.*")) and all((d / f).is_file() and (d / f).stat().st_size > 0 for f in MODEL_FILES)
    except OSError:
        return False


def _hub_dirs():
    out = []
    if os.environ.get("HF_HUB_CACHE"):
        out.append(Path(os.environ["HF_HUB_CACHE"]))
    if os.environ.get("HF_HOME"):
        out.append(Path(os.environ["HF_HOME"]) / "hub")
    xdg = os.environ.get("XDG_CACHE_HOME")
    out.append(Path(xdg) / "huggingface" / "hub" if xdg else Path.home() / ".cache" / "huggingface" / "hub")
    return out


def cached_model(name):
    """A complete copy of a speech model in the shared Hugging Face cache, read only, or None."""
    p = Path(str(name)).expanduser()
    if p.is_absolute():
        return p if _complete(p) else None
    repo = _repo(name)
    if not repo:
        return None
    for hub in _hub_dirs():
        try:
            snaps = sorted((hub / ("models--" + repo.replace("/", "--")) / "snapshots").iterdir())
        except OSError:
            continue
        for d in snaps:
            if _complete(d):
                return d
    return None


def own_model():
    """faster-whisper and a model already on this computer, or None. The Clearing never downloads one."""
    if not whisper_installed():
        return None
    for name in OWN_MODELS:
        where = cached_model(name)
        if where is not None:
            return where
    return None


def _off(v):
    return v is False or (isinstance(v, (int, str)) and str(v).strip().lower() in ("0", "false", "no", "off"))


def plan() -> dict:
    """Where a recording would go, decided without sending anything.

    {ready, engine ("hermes" | "whisper" | None), provider, local (True, False, or None when Hermes decides at
    run time), label, message}. ``local`` False or None means press first."""
    out = {"ready": False, "engine": None, "provider": None, "local": None, "label": "", "message": NOT_READY}
    own = own_model()
    fn = _hermes_fn()
    stt = _stt_config() if fn else {}
    if fn is not None and not _off(stt.get("enabled", True)):
        provider = str(stt.get("provider") or "").strip().lower()
        if provider == "nous":  # the managed subscription is the OpenAI backend
            provider = "openai"
        if provider in CLOUD:
            return dict(out, ready=True, engine="hermes", provider=provider, local=False, label=LABELS[provider], message="")
        if provider in ("", "local", "local_command"):
            if whisper_installed():
                local = stt.get("local") if isinstance(stt.get("local"), dict) else {}
                if cached_model(local.get("model") or HERMES_LOCAL_DEFAULT) is not None:
                    return dict(out, ready=True, engine="hermes", provider="local", local=True, label=LABELS["local"], message="")
            if provider == "local_command":
                return dict(out, ready=True, engine="hermes", provider="local_command", local=True, label=LABELS["local_command"], message="")
            if own is not None:
                return dict(out, ready=True, engine="whisper", provider="whisper", local=True, label=LABELS["whisper"], message="")
            if provider == "local":
                return dict(out, message=NEEDS_MODEL)
            # auto: Hermes picks a local whisper command or a cloud key at run time, so the writer presses first
            return dict(out, ready=True, engine="hermes", provider="", local=None,
                        label="the speech-to-text set up in Hermes", message="")
        return dict(out, ready=True, engine="hermes", provider=provider, local=None, label=provider, message="")
    if own is not None:
        return dict(out, ready=True, engine="whisper", provider="whisper", local=True, label=LABELS["whisper"], message="")
    if fn is None and _inside_hermes():
        return dict(out, message=HERMES_CHANGED)
    return out


def press_first(p: dict) -> bool:
    return bool(p.get("ready")) and p.get("local") is not True


def ask_line(p: dict) -> str:
    """What the page says before the first send, naming where the recording goes."""
    if p.get("local") is False:
        return (f"Your recording goes to {p['label']}, the speech-to-text chosen in Hermes Settings, Voice, to be turned "
                "into text. Send it?")
    return (f"Your recording goes to {p.get('label') or 'the speech-to-text set up in Hermes'}, which may be a service on "
            "the internet, to be turned into text. Send it?")


def status() -> dict:
    p = plan()
    return {**p, "press_first": press_first(p), "ask": ask_line(p) if press_first(p) else ""}


# ---------- the recording ----------
def audio_kind(b: bytes):
    if b[:4] == b"\x1a\x45\xdf\xa3":
        return ".webm"
    if b[:4] == b"OggS":
        return ".ogg"
    if b[4:8] == b"ftyp":
        return ".m4a"
    if b[:4] == b"RIFF" and b[8:12] == b"WAVE":
        return ".wav"
    return None


def decode(data) -> tuple[bytes, str]:
    if not isinstance(data, str) or not data or len(data) > MAX_AUDIO * 4 // 3 + 16:
        raise DictationError("That recording is longer than The Clearing takes at once. Record ten minutes or less.")
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise DictationError(FAILED)
    ext = audio_kind(raw)
    if not ext:
        raise DictationError(FAILED)
    return raw, ext


def _wav(src: Path, dest: Path):
    """16 kHz mono WAV, the file Hermes's own recorder hands transcribe_recording, made with PyAV (it ships with
    faster-whisper in Hermes's Python). None when PyAV is missing or can't read it: the recording then goes as it
    is, the way Hermes's own route passes the desktop's WebM. No other program is run."""
    try:
        import av
        with av.open(str(src)) as box:
            stream = next((s for s in box.streams if s.type == "audio"), None)
            if stream is None:
                return None
            rs = av.AudioResampler(format="s16", layout="mono", rate=WAV_RATE)
            limit, written = MAX_SECONDS * WAV_RATE, 0
            with wave.open(str(dest), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(WAV_RATE)
                for frame in box.decode(stream):
                    for f in rs.resample(frame) or []:
                        n = min(f.samples, limit - written)
                        if n > 0:
                            w.writeframes(bytes(f.planes[0])[: n * 2])
                            written += n
                    if written >= limit:
                        break
        return dest if written else None
    except Exception:  # not decodable here; Hermes's speech-to-text reads the original
        return None


def _hermes(path: Path) -> str:
    fn = _hermes_fn()
    if fn is None:
        raise DictationError(_not_ready())
    try:
        result = fn(str(path))
    except Exception as e:  # a Hermes release that changed the function's arguments, or its own error
        _log.info("clearing: Hermes's speech-to-text raised %s", type(e).__name__)
        raise DictationError(FAILED) from e
    if not isinstance(result, dict):  # a Hermes release that changed what it returns
        _log.info("clearing: Hermes's speech-to-text returned %s, not a dict", type(result).__name__)
        raise DictationError(FAILED)
    if result.get("success"):
        return str(result.get("transcript") or "").strip()
    _log.info("clearing: Hermes's speech-to-text failed: %s", str(result.get("error") or "")[:200])
    raise DictationError(FAILED)


def _whisper(path: Path) -> str:
    where = own_model()
    if where is None:
        raise DictationError(NOT_READY)
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
    from faster_whisper import WhisperModel
    model = WhisperModel(str(where), device="cpu", compute_type="int8", local_files_only=True)
    segments, _ = model.transcribe(str(path), vad_filter=True, condition_on_previous_text=False, beam_size=5)
    return " ".join(s.text.strip() for s in segments).strip()


ENGINES = {"hermes": _hermes, "whisper": _whisper}  # tests replace these; they never record or send


def transcribe(data, send_to=None, folder: Path | None = None) -> dict:
    """{text, label, local}. Raises NeedsPress when the recording would leave the computer and ``send_to`` does
    not name the service the plan names now; DictationError for everything the writer can act on."""
    raw, ext = decode(data)
    p = plan()
    if not p["ready"]:
        raise DictationError(p["message"])
    if press_first(p) and (send_to is None or str(send_to) != (p.get("provider") or "")):
        raise NeedsPress(p)
    tmp = Path(folder) / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    src = tmp / f"dictation-{secrets.token_hex(6)}{ext}"
    wav = None
    try:
        src.write_bytes(raw)
        target = src
        if ext != ".wav":
            wav = tmp / f"{src.stem}.wav"
            target = _wav(src, wav) or src
        try:
            text = ENGINES[p["engine"]](target)
        except Exception as e:  # Hermes's engine failed or moved: faster-whisper on this computer, when it is here
            if p["engine"] != "hermes" or own_model() is None:
                raise e if isinstance(e, DictationError) else DictationError(FAILED)
            _log.info("clearing: Hermes's speech-to-text failed (%s); using faster-whisper", type(e).__name__)
            text = ENGINES["whisper"](target)
            p = dict(p, label=LABELS["whisper"], local=True)
    finally:
        for f in (src, wav):
            if f is not None:
                try:
                    Path(f).unlink()
                except OSError:
                    pass
    text = re.sub(r"\s+", " ", str(text or "")).strip()[:40000]
    if not text:
        raise DictationError(NO_SPEECH)
    return {"text": text, "label": p["label"], "local": p["local"]}
