"""Bringing things into The Clearing from outside the page: a web link and the writer's own scene picture.

**A link.** ``check_url`` refuses anything but a public http or https address before any fetch: no other
scheme, no user name or password in the address, no localhost, no ``.local`` or ``.internal`` name, and no host
that resolves to a private, loopback, link-local, shared, multicast or reserved address (every address it
resolves to is checked, IPv4 and IPv6, including IPv4 written inside IPv6). ``fetch_link`` then asks Hermes's
own ``web_extract`` tool, on the writer's configured web backend, for the page (Hermes applies its own
private-network block too), keeps the readable text only and caps it. The Clearing holds no key and runs no
scraper of its own.

**A picture.** ``check_picture`` takes JPEG, PNG or WebP only (never SVG, which can carry script), 6 MB at most,
with its type read from the bytes rather than the name, and its width and height read from the header: 12,000
pixels a side and 60 million pixels at most, so a small file can't ask the page to decode a huge image.
"""

from __future__ import annotations

import ipaddress
import json
import re
import socket
import struct
from urllib.parse import urlsplit

MAX_URL = 2000
MAX_LINK_CHARS = 200_000
LINK_TIMEOUT = 45
MAX_PICTURE = 6 * 1024 * 1024
MAX_SIDE = 12_000
MAX_PIXELS = 60_000_000

NOT_PUBLIC = "The Clearing only brings in public web pages. That address points inside your own computer or network."
BAD_LINK = "That doesn't look like a web address. Paste a link that starts with https:// or http://."


class LinkError(ValueError):
    """A plain-English reason a link can't be brought in."""


def _resolve(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    return [i[4][0] for i in infos]


RESOLVE = _resolve  # tests replace this; they never touch the network


def public_address(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        mapped = ip.ipv4_mapped or ip.sixtofour or (ip.teredo[1] if ip.teredo else None)
        if mapped is not None and not public_address(str(mapped)):
            return False
    return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_loopback or ip.is_link_local or ip.is_private)


def check_url(url) -> str:
    """The link, cleaned, when it is a public http or https page. Raises LinkError with what to do otherwise."""
    if not isinstance(url, str):
        raise LinkError(BAD_LINK)
    url = url.strip()
    if not re.match(r"^[a-z][a-z0-9+.-]*://", url, re.I) and re.match(r"^[\w-]+(\.[\w-]+)+(/|$)", url):
        url = "https://" + url  # "example.com/essay" is a web address too
    if len(url) > MAX_URL or re.search(r"[\s\x00-\x1f\x7f]", url):
        raise LinkError(BAD_LINK)
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise LinkError(BAD_LINK)
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise LinkError(BAD_LINK)
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise LinkError("Links with a user name or password in them aren't brought in. Paste the page's plain address.")
    if port is not None and port not in (80, 443, 8080, 8443):
        raise LinkError("The Clearing brings in web pages on the usual web ports only. Paste the page's plain address.")
    host = parts.hostname.rstrip(".").lower()
    if host in ("localhost", "localhost.localdomain") or host.endswith((".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet")):
        raise LinkError(NOT_PUBLIC)
    try:
        literal = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        literal = None
    if literal is not None:
        if not public_address(str(literal)):
            raise LinkError(NOT_PUBLIC)
    else:
        try:
            ascii_host = host if host.isascii() else host.encode("idna").decode("ascii")
        except UnicodeError:
            raise LinkError(BAD_LINK)
        if "." not in ascii_host:
            raise LinkError(NOT_PUBLIC)  # a bare name ("intranet", "router") is a machine on the writer's network
        if not re.fullmatch(r"[a-z0-9.-]+", ascii_host):
            raise LinkError(BAD_LINK)
        host = ascii_host
        try:
            addrs = RESOLVE(host)
        except (OSError, UnicodeError):
            raise LinkError("The Clearing couldn't find that site. Check the address, then try again.")
        if not addrs or not all(public_address(a) for a in addrs):
            raise LinkError(NOT_PUBLIC)
    return url


def _hermes_extract(url: str):
    """Hermes's own web_extract tool: through ``ctx.dispatch_tool`` when ``register(ctx)`` ran in this process,
    else the public tool registry (runtime.dispatch_web). Only after ``check_url``."""
    try:
        from . import runtime
    except ImportError:  # loaded as loose modules (tests)
        import runtime  # type: ignore
    return runtime.dispatch_web({"urls": [url], "char_limit": MAX_LINK_CHARS})


EXTRACT = _hermes_extract  # tests replace this


def readable(markdown: str) -> str:
    """Page text as plain paragraphs: no images, link targets, heading marks, emphasis marks, tags or tables'
    rules; at most one blank line between paragraphs."""
    t = str(markdown or "").replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<(script|style)\b.*?</\1>", "", t, flags=re.S | re.I)
    t = re.sub(r"<[^>\n]{1,400}>", "", t)
    t = re.sub(r"!\[[^\]\n]{0,400}\]\([^)\n]{0,2000}\)", "", t)
    t = re.sub(r"\[IMAGE:[^\]\n]{0,400}\]", "", t)
    t = re.sub(r"\[([^\]\n]{0,400})\]\([^)\n]{0,2000}\)", r"\1", t)
    t = re.sub(r"^\s{0,3}#{1,6}\s+", "", t, flags=re.M)
    t = re.sub(r"^\s{0,3}(?:[-*_]\s*){3,}$", "", t, flags=re.M)
    t = re.sub(r"^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$", "", t, flags=re.M)
    t = re.sub(r"(\*\*|__)(?=\S)(.+?)(?<=\S)\1", r"\2", t)
    t = re.sub(r"(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])", r"\1", t)
    t = re.sub(r"^\s*```[^\n]*$", "", t, flags=re.M)
    t = re.sub(r"^\s*>\s?", "", t, flags=re.M)
    t = re.sub("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]", "", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def fetch_link(url) -> dict:
    """{title, body, url} for a public page, through the writer's Hermes web tool. Raises LinkError."""
    url = check_url(url)
    try:
        raw = EXTRACT(url)
        data = json.loads(raw) if isinstance(raw, str) else raw
    except LinkError:
        raise
    except Exception:
        raise LinkError("The Clearing couldn't bring in that page just now. Try again, or copy the text and paste it.")
    if not isinstance(data, dict):
        raise LinkError("The Clearing couldn't bring in that page just now. Try again, or copy the text and paste it.")
    error = str(data.get("error") or "")
    if error and not data.get("results"):
        if "Unknown tool" in error or "provider" in error.lower() or "hermes tools" in error.lower() or "not configured" in error.lower():
            raise LinkError("Bringing in links needs a web tool turned on in Hermes. Set one up in Settings, Tools, Web, then try again.")
        raise LinkError("That page couldn't be read. It may need a sign-in, or block readers. Copy the text and paste it instead.")
    results = data.get("results") if isinstance(data.get("results"), list) else []
    first = next((r for r in results if isinstance(r, dict)), None)
    if not first or first.get("error"):
        if first and "private" in str(first.get("error")).lower():
            raise LinkError(NOT_PUBLIC)
        raise LinkError("That page couldn't be read. It may need a sign-in, or block readers. Copy the text and paste it instead.")
    body = readable(first.get("content") or "")[:MAX_LINK_CHARS]
    if len(re.findall(r"\w+", body)) < 20:
        raise LinkError("That page has almost no text to bring in. Copy the part you want and paste it instead.")
    title = " ".join(str(first.get("title") or "").split())[:300]
    return {"title": title, "body": body, "url": url}


# ---------- the writer's own scene picture ----------
def _jpeg_size(b: bytes):
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF:
            return None
        marker = b[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = struct.unpack(">H", b[i + 2:i + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", b[i + 5:i + 9])
            return w, h
        if length < 2:
            return None
        i += 2 + length
    return None


def picture_type(b: bytes):
    """("image/jpeg" | "image/png" | "image/webp", width, height) read from the bytes, or None."""
    if b[:3] == b"\xff\xd8\xff":
        size = _jpeg_size(b)
        return ("image/jpeg", *size) if size else None
    if b[:8] == b"\x89PNG\r\n\x1a\n" and b[12:16] == b"IHDR":
        w, h = struct.unpack(">II", b[16:24])
        return "image/png", w, h
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        kind = b[12:16]
        if kind == b"VP8X" and len(b) >= 30:
            return "image/webp", 1 + int.from_bytes(b[24:27], "little"), 1 + int.from_bytes(b[27:30], "little")
        if kind == b"VP8 " and len(b) >= 30:
            w, h = struct.unpack("<HH", b[26:30])
            return "image/webp", w & 0x3FFF, h & 0x3FFF
        if kind == b"VP8L" and len(b) >= 25:
            v = int.from_bytes(b[21:25], "little")
            return "image/webp", (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
    return None


def check_picture(b: bytes) -> tuple[str, int, int]:
    if not b:
        raise ValueError("That picture is empty. Choose another.")
    if len(b) > MAX_PICTURE:
        raise ValueError("That picture is larger than 6 MB. Choose a smaller one, or save it smaller first.")
    t = picture_type(b)
    if not t:
        raise ValueError("Choose a JPEG, PNG or WebP picture.")
    mime, w, h = t
    if not (0 < w <= MAX_SIDE and 0 < h <= MAX_SIDE) or w * h > MAX_PIXELS:
        raise ValueError("That picture is too large to use as a scene. Choose one under 12,000 pixels a side.")
    return mime, w, h
