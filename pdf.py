"""PDF files for The Clearing, with the standard library only (Hermes's Python has no PDF library).

``read_pdf(data)`` returns a title and the text of a PDF the writer brought in, in plain paragraphs. It reads
the words only: images, forms, links, fonts and layout stay in the original, and the original file is never
changed. A scan with no text layer, a locked PDF, or one that isn't a PDF at all is refused with a plain reason.

Every step is bounded, because a PDF is a program-like format and a small file can ask for a great deal of work
(the "tiny PDF" attacks: a form painted thousands of times, forms nested inside forms, a stream that inflates a
thousandfold, an object stream that claims a million objects):

- the file: 12 MB at most, and it must start like a PDF
- objects: 40,000 at most; an object stream may hold 10,000
- inflating: 16 MB for one stream and 96 MB in all, counted as it inflates, never after
- pages: 1,500; text kept: 400,000 characters (what a piece holds); operators run: 3 million in all
- forms: nested 3 deep at most and painted 2,000 times in all; a form is never painted inside itself
- time: 20 seconds for the whole read; what was read before a stop is kept, and the writer is told
"""

from __future__ import annotations

import re
import time
import unicodedata
import zlib

MAX_FILE = 12 * 1024 * 1024
MAX_OBJECTS = 40_000
MAX_OBJSTM = 10_000
MAX_STREAM = 16 * 1024 * 1024
MAX_INFLATED = 96 * 1024 * 1024
MAX_PAGES = 1500
MAX_CHARS = 400_000
MAX_OPS = 3_000_000
MAX_FORM_DEPTH = 3
MAX_FORM_USES = 2000
MAX_CMAP = 100_000
SECONDS = 20.0


class PdfError(ValueError):
    """A plain-English reason the file could not be read."""


class _Stop(Exception):
    """A budget ran out. What was read before it stays."""


class Name(str):
    pass


class Ref(tuple):
    pass


class Stream:
    __slots__ = ("dict", "raw")

    def __init__(self, d, raw):
        self.dict, self.raw = d, raw


_WS = b"\x00\t\n\x0c\r "
_DELIM = b"()<>[]{}/%"
_TOKEN_END = re.compile(rb"[\x00\t\n\x0c\r ()<>\[\]{}/%]")
_NUM = re.compile(rb"[+-]?(?:\d+\.?\d*|\.\d+)$")


class _Parser:
    """Reads PDF objects (numbers, names, strings, arrays, dictionaries, references, streams) from bytes."""

    def __init__(self, data: bytes, budget):
        self.d, self.budget = data, budget

    def skip(self, i):
        d, n = self.d, len(self.d)
        while i < n:
            c = d[i]
            if c in _WS:
                i += 1
            elif c == 0x25:  # % comment
                j = d.find(b"\n", i)
                k = d.find(b"\r", i)
                ends = [x for x in (j, k) if x >= 0]
                i = min(ends) if ends else n
            else:
                break
        return i

    def token(self, i):
        """The next bare token (a keyword or a number) and where it ends."""
        m = _TOKEN_END.search(self.d, i)
        j = m.start() if m else len(self.d)
        return self.d[i:j], j

    def value(self, i, depth=0):
        if depth > 40:
            raise PdfError("That PDF is built in a way The Clearing can't read. Save it again as a PDF, then try again.")
        self.budget.tick()
        d = self.d
        i = self.skip(i)
        if i >= len(d):
            return None, i
        c = d[i]
        if c == 0x2F:  # /Name
            m = _TOKEN_END.search(d, i + 1)
            j = m.start() if m else len(d)
            raw = d[i + 1:j]
            name = re.sub(rb"#([0-9A-Fa-f]{2})", lambda x: bytes([int(x.group(1), 16)]), raw)
            return Name(name.decode("latin-1")), j
        if c == 0x28:  # (literal string)
            return self.literal(i)
        if c == 0x3C:
            if d[i + 1:i + 2] == b"<":  # << dict >>
                out, i = {}, i + 2
                while True:
                    i = self.skip(i)
                    if d[i:i + 2] == b">>" or i >= len(d):
                        i += 2
                        break
                    key, i = self.value(i, depth + 1)
                    val, i = self.value(i, depth + 1)
                    if isinstance(key, Name):
                        out[str(key)] = val
                    if len(out) > 5000:
                        raise PdfError("That PDF is built in a way The Clearing can't read. Save it again as a PDF, then try again.")
                return out, i
            j = d.find(b">", i)  # <hex string>
            j = len(d) if j < 0 else j
            hexd = re.sub(rb"[^0-9A-Fa-f]", b"", d[i + 1:j])
            if len(hexd) % 2:
                hexd += b"0"
            return bytes.fromhex(hexd.decode("ascii")), j + 1
        if c == 0x5B:  # [array]
            out, i = [], i + 1
            while True:
                i = self.skip(i)
                if i >= len(d) or d[i] == 0x5D:
                    return out, i + 1
                v, i = self.value(i, depth + 1)
                out.append(v)
                if len(out) > 200_000:
                    raise PdfError("That PDF is built in a way The Clearing can't read. Save it again as a PDF, then try again.")
        tok, j = self.token(i)
        if not tok:
            return None, i + 1
        if _NUM.match(tok):
            num = float(tok) if b"." in tok else int(tok)
            if isinstance(num, int) and num >= 0:  # maybe "n g R"
                k = self.skip(j)
                tok2, j2 = self.token(k)
                if tok2.isdigit():
                    k2 = self.skip(j2)
                    if d[k2:k2 + 1] == b"R" and (k2 + 1 >= len(d) or d[k2 + 1] in _WS or d[k2 + 1] in _DELIM):
                        return Ref((num, int(tok2))), k2 + 1
            return num, j
        if tok == b"true":
            return True, j
        if tok == b"false":
            return False, j
        if tok == b"null":
            return None, j
        return Name("@" + tok.decode("latin-1")), j  # a keyword where a value was expected

    def literal(self, i):
        d, out, depth, i = self.d, bytearray(), 1, i + 1
        esc = {ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}
        while i < len(d):
            c = d[i]
            if c == 0x5C:  # backslash
                i += 1
                if i >= len(d):
                    break
                c = d[i]
                if c in esc:
                    out.append(esc[c])
                elif 0x30 <= c <= 0x37:
                    m = re.match(rb"[0-7]{1,3}", d[i:i + 3])
                    out.append(int(m.group(0), 8) & 0xFF)
                    i += len(m.group(0)) - 1
                elif c in (0x0A, 0x0D):
                    if c == 0x0D and d[i + 1:i + 2] == b"\n":
                        i += 1
                else:
                    out.append(c)
            elif c == 0x28:
                depth += 1
                out.append(c)
            elif c == 0x29:
                depth -= 1
                if depth == 0:
                    return bytes(out), i + 1
                out.append(c)
            else:
                out.append(c)
            i += 1
        return bytes(out), i


class _Budget:
    def __init__(self):
        self.deadline = time.monotonic() + SECONDS
        self.inflated = 0
        self.ops = 0
        self.ticks = 0
        self.form_uses = 0
        self.stopped = False

    def tick(self, n=1):
        self.ticks += n
        if self.ticks & 0x3FF == 0 and time.monotonic() > self.deadline:
            raise _Stop()


def _inflate(data: bytes, budget: _Budget) -> bytes:
    d = zlib.decompressobj()
    out = bytearray()
    try:
        chunk = d.decompress(data, MAX_STREAM + 1)
        out += chunk
        while d.unconsumed_tail and len(out) <= MAX_STREAM:
            out += d.decompress(d.unconsumed_tail, MAX_STREAM + 1 - len(out))
    except zlib.error:
        pass  # a damaged stream gives what it had before the damage
    if len(out) > MAX_STREAM:
        raise PdfError("That PDF unpacks to far more than its size, so The Clearing won't open it. Save it again as a PDF, then try again.")
    budget.inflated += len(out)
    if budget.inflated > MAX_INFLATED:
        raise PdfError("That PDF unpacks to more than The Clearing reads at once. Open a shorter PDF, or the pages you need.")
    return bytes(out)


def _a85(data: bytes) -> bytes:
    import base64
    data = re.sub(rb"\s", b"", data)
    if data.startswith(b"<~"):
        data = data[2:]
    end = data.find(b"~>")
    return base64.a85decode(data[:end] if end >= 0 else data)


class _Doc:
    def __init__(self, data: bytes):
        self.data = data
        self.budget = _Budget()
        self.p = _Parser(data, self.budget)
        self.objs: dict[int, object] = {}
        self.trailers: list[dict] = []

    # ---- objects
    def scan(self):
        direct = {}
        for m in re.finditer(rb"(?<![0-9])(\d{1,10})\s+(\d{1,5})\s+obj\b", self.data):
            self.budget.tick(8)
            if len(direct) >= MAX_OBJECTS:
                raise PdfError("That PDF is larger than The Clearing reads at once. Open a shorter PDF, or the pages you need.")
            try:
                val, end = self.p.value(m.end())
                end = self.p.skip(end)
                if isinstance(val, dict) and self.data[end:end + 6] == b"stream":
                    val = self._stream(val, end + 6)
                direct[int(m.group(1))] = val
            except PdfError:
                raise
            except _Stop:
                raise
            except Exception:
                continue  # one damaged object; the rest may still read
        self.objs = direct
        for m in re.finditer(rb"trailer\s*<<", self.data):
            try:
                t, _ = self.p.value(m.end() - 2)
                if isinstance(t, dict):
                    self.trailers.append(t)
            except (PdfError, _Stop):
                raise
            except Exception:
                continue
        for num, v in list(direct.items()):
            if isinstance(v, Stream) and v.dict.get("Type") == "XRef":
                self.trailers.append(v.dict)
        for v in list(direct.values()):
            if isinstance(v, Stream) and v.dict.get("Type") == "ObjStm":
                self._objstm(v)

    def _stream(self, d, i):
        data = self.data
        if data[i:i + 2] == b"\r\n":
            i += 2
        elif data[i:i + 1] in (b"\n", b"\r"):
            i += 1
        length = d.get("Length")
        if isinstance(length, int) and 0 <= length <= len(data) - i:
            after = self.p.skip(i + length)
            if data[after:after + 9] == b"endstream":
                return Stream(d, data[i:i + length])
        j = data.find(b"endstream", i)
        j = len(data) if j < 0 else j
        raw = data[i:j]
        if raw.endswith(b"\r\n"):
            raw = raw[:-2]
        elif raw.endswith((b"\n", b"\r")):
            raw = raw[:-1]
        return Stream(d, raw)

    def _objstm(self, s: Stream):
        n, first = self.get(s.dict.get("N")), self.get(s.dict.get("First"))
        if not isinstance(n, int) or not isinstance(first, int) or n < 0 or n > MAX_OBJSTM or first < 0:
            return
        data = self.decode(s)
        if data is None:
            return
        head = re.findall(rb"\d+", data[:first])[: 2 * n]
        sub = _Parser(data, self.budget)
        for k in range(0, len(head) - 1, 2):
            if len(self.objs) >= MAX_OBJECTS:
                raise PdfError("That PDF is larger than The Clearing reads at once. Open a shorter PDF, or the pages you need.")
            num, off = int(head[k]), int(head[k + 1])
            if num in self.objs or first + off >= len(data):
                continue
            try:
                self.objs[num], _ = sub.value(first + off)
            except (PdfError, _Stop):
                raise
            except Exception:
                continue

    def get(self, v, hops=0):
        while isinstance(v, Ref) and hops < 32:
            v = self.objs.get(v[0])
            hops += 1
        return None if isinstance(v, Ref) else v

    def decode(self, s: Stream):
        """A stream's bytes through its filters, or None when a filter isn't one The Clearing reads (images)."""
        filters = self.get(s.dict.get("Filter"))
        filters = [filters] if isinstance(filters, Name) else [self.get(f) for f in filters] if isinstance(filters, list) else []
        data = s.raw
        for f in filters[:4]:
            if f in ("FlateDecode", "Fl"):
                data = _inflate(data, self.budget)
            elif f in ("ASCIIHexDecode", "AHx"):
                hexd = re.sub(rb"[^0-9A-Fa-f]", b"", data.split(b">")[0])
                data = bytes.fromhex((hexd + b"0" * (len(hexd) % 2)).decode("ascii"))
            elif f in ("ASCII85Decode", "A85"):
                try:
                    data = _a85(data)
                except ValueError:
                    return None
            else:
                return None
        return data

    # ---- pages
    def root(self):
        for t in reversed(self.trailers):
            r = self.get(t.get("Root"))
            if isinstance(r, dict):
                return r
        for v in self.objs.values():
            if isinstance(v, dict) and v.get("Type") == "Catalog":
                return v
        return None

    def encrypted(self):
        return any(t.get("Encrypt") is not None for t in self.trailers)

    def info_title(self):
        for t in reversed(self.trailers):
            info = self.get(t.get("Info"))
            if isinstance(info, dict) and isinstance(self.get(info.get("Title")), bytes):
                return _text_string(self.get(info["Title"]))
        return ""

    def pages(self):
        out, seen = [], set()
        root = self.root()
        top = self.get(root.get("Pages")) if root else None

        def walk(node, inherited, depth):
            if len(out) >= MAX_PAGES or depth > 64 or not isinstance(node, dict) or id(node) in seen:
                return
            seen.add(id(node))
            res = self.get(node.get("Resources"))
            res = res if isinstance(res, dict) else inherited
            kids = self.get(node.get("Kids"))
            if isinstance(kids, list):
                for k in kids:
                    walk(self.get(k), res, depth + 1)
            elif node.get("Type") == "Page" or "Contents" in node:
                out.append((node, res or {}))
        if isinstance(top, dict):
            walk(top, {}, 0)
        if not out:  # a damaged page tree: the pages in the order they were written
            for num in sorted(self.objs):
                v = self.objs[num]
                if isinstance(v, dict) and v.get("Type") == "Page":
                    out.append((v, self.get(v.get("Resources")) or {}))
                    if len(out) >= MAX_PAGES:
                        break
        return out

    def contents(self, page):
        c = self.get(page.get("Contents"))
        parts = c if isinstance(c, list) else [c]
        out = []
        for x in parts:
            s = self.get(x)
            if isinstance(s, Stream):
                d = self.decode(s)
                if d:
                    out.append(d)
        return b"\n".join(out)


# ---------- text strings and fonts ----------
def _text_string(b: bytes) -> str:
    if b[:2] == b"\xfe\xff":
        return b[2:].decode("utf-16-be", "replace")
    if b[:3] == b"\xef\xbb\xbf":
        return b[3:].decode("utf-8", "replace")
    return b.decode("latin-1")


_GLYPHS = {"space": " ", "quotesingle": "'", "quoteright": "’", "quoteleft": "‘", "quotedblleft": "“",
           "quotedblright": "”", "quotedbl": '"', "endash": "–", "emdash": "—", "bullet": "•",
           "ellipsis": "…", "fi": "fi", "fl": "fl", "ff": "ff", "ffi": "ffi", "ffl": "ffl", "hyphen": "-",
           "minus": "-", "period": ".", "comma": ",", "colon": ":", "semicolon": ";", "exclam": "!", "question": "?",
           "parenleft": "(", "parenright": ")", "bracketleft": "[", "bracketright": "]", "braceleft": "{", "braceright": "}",
           "slash": "/", "backslash": "\\", "ampersand": "&", "at": "@", "numbersign": "#", "dollar": "$", "percent": "%",
           "plus": "+", "equal": "=", "less": "<", "greater": ">", "underscore": "_", "asterisk": "*", "grave": "`",
           "asciitilde": "~", "asciicircum": "^", "bar": "|", "nbspace": " ", "degree": "°", "copyright": "©",
           "registered": "®", "trademark": "™", "section": "§", "paragraph": "¶", "dagger": "†",
           "germandbls": "ß", "ae": "æ", "AE": "Æ", "oe": "œ", "OE": "Œ", "oslash": "ø",
           "Oslash": "Ø", "sterling": "£", "euro": "€", "yen": "¥", "cent": "¢",
           "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7",
           "eight": "8", "nine": "9"}
_ACCENTS = {"acute": "́", "grave": "̀", "circumflex": "̂", "dieresis": "̈", "tilde": "̃",
            "cedilla": "̧", "ring": "̊", "caron": "̌"}


def _glyph(name: str) -> str:
    if name in _GLYPHS:
        return _GLYPHS[name]
    if len(name) == 1:
        return name
    m = re.fullmatch(r"uni([0-9A-Fa-f]{4})+", name) or re.fullmatch(r"u([0-9A-Fa-f]{4,6})", name)
    if m:
        try:
            if name.startswith("uni"):
                return "".join(chr(int(name[i:i + 4], 16)) for i in range(3, len(name), 4))
            return chr(int(m.group(1), 16))
        except ValueError:
            return ""
    for acc, mark in _ACCENTS.items():
        if name.endswith(acc) and len(name) == len(acc) + 1:
            return unicodedata.normalize("NFC", name[0] + mark)
    return ""


class _Font:
    def __init__(self, doc: _Doc, d):
        self.two = False
        self.map: dict[int, str] = {}
        self.base = "cp1252"
        self.widths: dict[int, float] = {}
        self.dw = 500.0
        d = d if isinstance(d, dict) else {}
        self.simple_space = True
        sub = d.get("Subtype")
        tu = doc.get(d.get("ToUnicode"))
        if sub == "Type0":
            self.two = True
            desc = doc.get(d.get("DescendantFonts"))
            desc = doc.get(desc[0]) if isinstance(desc, list) and desc else None
            if isinstance(desc, dict):
                dw = doc.get(desc.get("DW"))
                self.dw = float(dw) if isinstance(dw, (int, float)) else 1000.0
                self._cid_widths(doc, doc.get(desc.get("W")))
        else:
            enc = doc.get(d.get("Encoding"))
            if enc == "MacRomanEncoding" or (isinstance(enc, dict) and enc.get("BaseEncoding") == "MacRomanEncoding"):
                self.base = "mac_roman"
            if isinstance(enc, dict) and isinstance(doc.get(enc.get("Differences")), list):
                code = 0
                for x in doc.get(enc["Differences"])[:2000]:
                    x = doc.get(x)
                    if isinstance(x, int):
                        code = x
                    elif isinstance(x, Name):
                        g = _glyph(str(x))
                        if g:
                            self.map[code] = g
                        code += 1
            first, ws = doc.get(d.get("FirstChar")), doc.get(d.get("Widths"))
            if isinstance(first, int) and isinstance(ws, list):
                for k, w in enumerate(ws[:256]):
                    w = doc.get(w)
                    if isinstance(w, (int, float)):
                        self.widths[first + k] = float(w)
        if isinstance(tu, Stream):
            data = doc.decode(tu)
            if data:
                self._cmap(data)

    def _cid_widths(self, doc, w):
        if not isinstance(w, list):
            return
        i, n = 0, 0
        while i < len(w) and n < MAX_CMAP:
            a = doc.get(w[i])
            b = doc.get(w[i + 1]) if i + 1 < len(w) else None
            if isinstance(a, int) and isinstance(b, list):
                for k, x in enumerate(b[:MAX_CMAP]):
                    x = doc.get(x)
                    if isinstance(x, (int, float)):
                        self.widths[a + k] = float(x)
                        n += 1
                i += 2
            elif isinstance(a, int) and isinstance(b, int) and i + 2 < len(w):
                x = doc.get(w[i + 2])
                if isinstance(x, (int, float)) and 0 <= b - a <= 65536:
                    for c in range(a, b + 1):
                        self.widths[c] = float(x)
                    n += b - a + 1
                i += 3
            else:
                i += 1

    def _cmap(self, data: bytes):
        def hexes(s):
            return re.findall(rb"<([0-9A-Fa-f\s]*)>", s)

        def uni(h):
            h = re.sub(rb"\s", b"", h)
            try:
                return bytes.fromhex(h.decode()).decode("utf-16-be", "replace")
            except ValueError:
                return ""
        cs = re.search(rb"begincodespacerange(.*?)endcodespacerange", data, re.S)
        if cs:
            lens = {len(re.sub(rb"\s", b"", h)) // 2 for h in hexes(cs.group(1))}
            self.two = 2 in lens and 1 not in lens or (self.two and 1 not in lens)
        n = 0
        for block in re.findall(rb"beginbfchar(.*?)endbfchar", data, re.S):
            hs = hexes(block)
            for k in range(0, len(hs) - 1, 2):
                src = re.sub(rb"\s", b"", hs[k])
                if src:
                    self.map[int(src, 16)] = uni(hs[k + 1])
                    n += 1
                    if n > MAX_CMAP:
                        return
        for block in re.findall(rb"beginbfrange(.*?)endbfrange", data, re.S):
            for m in re.finditer(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f\s]*>|\[[^\]]*\])", block):
                lo, hi = int(m.group(1), 16), int(m.group(2), 16)
                if hi < lo or hi - lo > 65535:
                    continue
                dst = m.group(3)
                if dst.startswith(b"["):
                    for k, h in enumerate(hexes(dst)[: hi - lo + 1]):
                        self.map[lo + k] = uni(h)
                else:
                    base = uni(dst[1:-1])
                    if not base:
                        continue
                    for k in range(hi - lo + 1):
                        self.map[lo + k] = base[:-1] + chr(min(0x10FFFF, ord(base[-1]) + k))
                n += hi - lo + 1
                if n > MAX_CMAP:
                    return

    def codes(self, s: bytes):
        if self.two:
            return [(s[i] << 8) | s[i + 1] for i in range(0, len(s) - 1, 2)]
        return list(s)

    def text(self, code: int) -> str:
        if code in self.map:
            return self.map[code]
        if self.two:
            return ""  # a CID font with no map to Unicode: its glyph numbers mean nothing as text
        return bytes([code]).decode(self.base, "replace").replace("�", "")

    def width(self, code: int) -> float:
        return self.widths.get(code, self.dw if self.two else 500.0)


# ---------- the content interpreter (text only) ----------
_OPS = re.compile(rb"[A-Za-z'\"*][A-Za-z0-9*'\"]*")


def _mul(a, b):
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


class _Text:
    """Collects (y, x, text, size) runs from a page's content, forms included, within the budget."""

    def __init__(self, doc: _Doc):
        self.doc, self.runs, self.chars = doc, [], 0
        self.fonts: dict[int, _Font] = {}

    def font(self, d):
        key = id(d)
        if key not in self.fonts:
            self.fonts[key] = _Font(self.doc, d)
        return self.fonts[key]

    def run(self, data: bytes, res, ctm=(1, 0, 0, 1, 0, 0), depth=0, active=()):
        doc, b = self.doc, self.doc.budget
        p = _Parser(data, b)
        fonts = doc.get((res or {}).get("Font")) if isinstance(res, dict) else None
        xobjs = doc.get((res or {}).get("XObject")) if isinstance(res, dict) else None
        stack, i, n = [], 0, len(data)
        tm = tlm = [1, 0, 0, 1, 0, 0]
        font, size, tc, tw, th, tl = None, 0.0, 0.0, 0.0, 1.0, 0.0
        ctm = list(ctm)
        saved = []
        while i < n:
            i = p.skip(i)
            if i >= n:
                break
            b.ops += 1
            if b.ops > MAX_OPS:
                raise _Stop()
            if b.ops & 0x3FF == 0:
                b.tick(0x400)
            c = data[i]
            if c in b"/([<+-.0123456789":
                v, i = p.value(i)
                stack.append(v)
                if len(stack) > 10000:
                    stack = stack[-100:]
                continue
            m = _OPS.match(data, i)
            if not m:
                i += 1
                continue
            op = m.group(0)
            i = m.end()
            args, stack = stack, []
            if op in (b"true", b"false", b"null"):
                stack = args + [op == b"true"]
                continue
            if op == b"BI":  # an inline image: skip its bytes
                k = re.compile(rb"\sID\s").search(data, i)
                e = re.compile(rb"\sEI(?=[\x00\t\n\x0c\r ]|$)").search(data, k.end() if k else i)
                i = e.end() if e else n
                continue
            if op == b"q":
                saved.append(list(ctm))
            elif op == b"Q":
                ctm = saved.pop() if saved else ctm
            elif op == b"cm" and len(args) >= 6 and all(isinstance(x, (int, float)) for x in args[-6:]):
                ctm = _mul([float(x) for x in args[-6:]], ctm)
            elif op == b"BT":
                tm, tlm = [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]
            elif op == b"Tf" and len(args) >= 2:
                fd = doc.get(fonts.get(str(args[-2]))) if isinstance(fonts, dict) and isinstance(args[-2], Name) else None
                font = self.font(fd)
                size = float(args[-1]) if isinstance(args[-1], (int, float)) else 0.0
            elif op == b"Tc" and args and isinstance(args[-1], (int, float)):
                tc = float(args[-1])
            elif op == b"Tw" and args and isinstance(args[-1], (int, float)):
                tw = float(args[-1])
            elif op == b"Tz" and args and isinstance(args[-1], (int, float)):
                th = float(args[-1]) / 100
            elif op == b"TL" and args and isinstance(args[-1], (int, float)):
                tl = float(args[-1])
            elif op in (b"Td", b"TD") and len(args) >= 2 and all(isinstance(x, (int, float)) for x in args[-2:]):
                tx, ty = float(args[-2]), float(args[-1])
                if op == b"TD":
                    tl = -ty
                tlm = _mul([1, 0, 0, 1, tx, ty], tlm)
                tm = list(tlm)
            elif op == b"Tm" and len(args) >= 6 and all(isinstance(x, (int, float)) for x in args[-6:]):
                tlm = [float(x) for x in args[-6:]]
                tm = list(tlm)
            elif op in (b"T*", b"'", b'"'):
                tlm = _mul([1, 0, 0, 1, 0, -tl], tlm)
                tm = list(tlm)
            if op in (b"Tj", b"'", b'"', b"TJ") and font is not None and args:
                parts = args[-1] if op == b"TJ" and isinstance(args[-1], list) else [args[-1]]
                if op == b'"' and len(args) >= 3:
                    tw = float(args[-3]) if isinstance(args[-3], (int, float)) else tw
                    tc = float(args[-2]) if isinstance(args[-2], (int, float)) else tc
                full = _mul(tm, ctm)
                x0, y0 = full[4], full[5]
                scale = (abs(full[0]) + abs(full[1])) or 1.0
                out = []
                for part in parts:
                    if isinstance(part, (int, float)):
                        if part < -180:
                            out.append(" ")
                        tm = _mul([1, 0, 0, 1, -float(part) / 1000 * size * th, 0], tm)
                        continue
                    if not isinstance(part, bytes):
                        continue
                    adv = 0.0
                    for code in font.codes(part):
                        ch = font.text(code)
                        out.append(ch)
                        adv += (font.width(code) / 1000 * size + tc + (tw if code == 32 and not font.two else 0)) * th
                    tm = _mul([1, 0, 0, 1, adv, 0], tm)
                text = "".join(out)
                if text:
                    self.runs.append((round(y0, 1), x0, _mul(tm, ctm)[4], text, size * scale))
                    self.chars += len(text)
                    if self.chars > MAX_CHARS:
                        raise _Stop()
            elif op == b"Do" and args and isinstance(args[-1], Name) and isinstance(xobjs, dict):
                ref = xobjs.get(str(args[-1]))
                x = doc.get(ref)
                key = ref[0] if isinstance(ref, Ref) else id(x)
                if isinstance(x, Stream) and x.dict.get("Subtype") == "Form" and depth < MAX_FORM_DEPTH and key not in active:
                    b.form_uses += 1
                    if b.form_uses > MAX_FORM_USES:
                        raise _Stop()
                    body = doc.decode(x)
                    if body:
                        mtx = doc.get(x.dict.get("Matrix"))
                        fm = [float(v) for v in mtx] if isinstance(mtx, list) and len(mtx) == 6 and all(isinstance(v, (int, float)) for v in mtx) else [1, 0, 0, 1, 0, 0]
                        fres = doc.get(x.dict.get("Resources"))
                        self.run(body, fres if isinstance(fres, dict) else res, _mul(fm, ctm), depth + 1, active + (key,))


# ---------- runs to paragraphs ----------
def _lines(runs):
    """Runs into lines, top to bottom, with a space where a gap between runs on one line is wider than a space."""
    lines = []
    for y, x0, x1, text, size in runs:
        if lines and abs(lines[-1]["y"] - y) <= max(1.0, 0.35 * (size or 10)):
            ln = lines[-1]
            gap = x0 - ln["x1"]
            if gap > 0.18 * (size or 10) and not ln["text"].endswith(" ") and not text.startswith(" "):
                ln["text"] += " "
            ln["text"] += text
            ln["x1"] = x1
        else:
            lines.append({"y": y, "x1": x1, "text": text, "size": size})
    return lines


def _paragraphs(lines) -> list[str]:
    page_no = re.compile(r"\s*(?:page\s*)?\d{1,4}\s*", re.I)
    kept, blank_before = [], False
    for ln in lines:
        if not ln["text"].strip():
            blank_before = True  # a line of spaces is a blank line between paragraphs
            continue
        if page_no.fullmatch(ln["text"]):
            continue
        kept.append(dict(ln, brk=blank_before))
        blank_before = False
    if not kept:
        return []
    gaps = sorted(kept[k - 1]["y"] - kept[k]["y"] for k in range(1, len(kept)) if kept[k - 1]["y"] > kept[k]["y"])
    usual = gaps[len(gaps) // 4] if gaps else 0  # the line spacing: most gaps are lines, the wider ones paragraphs
    paras, cur = [], ""
    for k, ln in enumerate(kept):
        text = " ".join(ln["text"].split())
        if k:
            gap = kept[k - 1]["y"] - ln["y"]
            if ln["brk"] or gap <= 0 or (usual and gap > 1.45 * usual):
                paras.append(cur)
                cur = ""
        if not cur:
            cur = text
        elif cur.endswith("-") and text[:1].islower():
            cur = cur[:-1] + text
        else:
            cur = f"{cur} {text}"
    paras.append(cur)
    return [p for p in paras if p.strip()]


def read_pdf(data: bytes) -> tuple[str, str, bool]:
    """(title, text, stopped). ``stopped`` is True when a budget ended the read early; what was read is kept."""
    if not isinstance(data, (bytes, bytearray)) or len(data) > MAX_FILE:
        raise PdfError("That PDF is larger than 12 MB. Open a shorter PDF, or the pages you need.")
    if b"%PDF-" not in data[:1024]:
        raise PdfError("That file isn't a PDF The Clearing can read. Open a .pdf, .docx, .md or .txt file.")
    doc = _Doc(bytes(data))
    stopped = False
    try:
        doc.scan()
    except _Stop:
        raise PdfError("That PDF took too long to read. Open a shorter PDF, or the pages you need.")
    if doc.encrypted():
        raise PdfError("That PDF is locked with a password. Save an unlocked copy, then bring it in.")
    paras: list[str] = []
    collector = _Text(doc)
    try:
        for page, res in doc.pages():
            start = len(collector.runs)
            collector.run(doc.contents(page), res)
            page_paras = _paragraphs(_lines(collector.runs[start:]))
            if paras and page_paras and page_paras[0][:1].islower():  # a paragraph that runs on to the next page
                paras[-1] = f"{paras[-1]} {page_paras.pop(0)}"
            paras.extend(page_paras)
    except _Stop:
        stopped = True
        page_paras = _paragraphs(_lines(collector.runs[start:])) if "start" in locals() else []
        paras.extend(page_paras)
    text = "\n\n".join(p.replace(" ", " ") for p in paras)
    text = re.sub("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]", "", text)[:MAX_CHARS].strip()
    if not re.search(r"\w{2}", text):
        raise PdfError("That PDF has no text to read. It is probably a scan or a picture of pages. Bring in a version with selectable text.")
    title = doc.info_title().strip()
    title = re.sub(r"^Microsoft (?:Word|PowerPoint) - ", "", title)
    title = re.sub(r"\.(?:docx?|pages|pdf|txt|md)$", "", title, flags=re.I).strip()
    if not title or len(title) > 200 or title.lower() in ("untitled", "untitled document"):
        title = ""
    return title[:300], text, stopped
