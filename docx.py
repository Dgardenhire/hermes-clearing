"""Word files for The Clearing, with the standard library only (zipfile and xml.etree).

``read_docx`` turns a .docx the writer opened into a title and plain paragraphs. ``write_docx`` turns a piece
into a small, clean .docx: the title as a Title paragraph, then one paragraph per paragraph of the piece,
set in Libre Caslon Text when Word has it and Georgia when it doesn't.

Only the words travel. Comments, tracked deletions, headers, footers and images in an opened file are left
behind; the writer is told the piece came from a Word file, and the original file is never changed.
"""

from __future__ import annotations

import io
import re
import zipfile
import zlib
from xml.etree import ElementTree as ET
from xml.parsers import expat
from xml.sax.saxutils import escape

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"
# Text Word keeps twice or never shows: the old-format copy of a text box (mc:Fallback), the "moved from"
# side of a tracked move, and deleted runs (their text is w:delText, which is never read anyway).
_SKIP = {f"{MC}Fallback", f"{W}moveFrom", f"{W}del"}
# Characters XML 1.0 does not allow; a pasted form feed or control code would make Word call the file corrupt.
_BAD_XML = re.compile("[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\U00010000-\U0010ffff]")
MAX_FILE = 4 * 1024 * 1024        # what the page sends
MAX_XML = 24 * 1024 * 1024         # the unpacked document part; refuses zip bombs
_TITLE_STYLES = {"title", "heading1", "heading 1"}


class DocxError(ValueError):
    """A plain-English reason the file could not be read."""


def read_docx(data: bytes) -> tuple[str, str]:
    if len(data) > MAX_FILE:
        raise DocxError("That file is larger than 4 MB. Open a shorter file, or paste a section.")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        info = z.getinfo("word/document.xml")
    except (zipfile.BadZipFile, KeyError):
        raise DocxError("That file isn't a Word document The Clearing can read. Try a .docx, .md or .txt file.")
    if info.file_size > MAX_XML:
        raise DocxError("That Word file is too large to open. Open a shorter file, or paste a section.")
    try:
        raw = z.read(info)
    except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError, RuntimeError, OSError, ValueError):
        # a bad checksum, a truncated or encrypted part, or a compression Python can't unpack
        raise DocxError("That Word file is damaged. Open it in Word, save it again, then try once more.")
    if len(raw) > MAX_XML:
        raise DocxError("That Word file is too large to open. Open a shorter file, or paste a section.")
    _refuse_dtd(raw)
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        raise DocxError("That Word file is damaged. Open it in Word, save it again, then try once more.")
    body = root.find(f"{W}body")
    if body is None:
        raise DocxError("That Word file has no text in it.")
    title, paras = "", []
    try:
        for p in _paragraphs(body):
            text = _para_text(p)
            style = p.find(f"{W}pPr/{W}pStyle")
            style_name = (style.get(f"{W}val") or "").lower() if style is not None else ""
            if not title and not paras and text.strip() and style_name in _TITLE_STYLES:
                title = text.strip()
                continue
            paras.append(text.rstrip())
    except RecursionError:  # nesting no real Word file has; refused plainly instead of a 500
        raise DocxError(_HOSTILE)
    out = "\n\n".join(p for p in _collapse(paras))
    if not out.strip() and not title:
        raise DocxError("That Word file has no text in it.")
    return title[:300], out


_HOSTILE = "That Word file has content The Clearing won't open. Copy the text into a new piece instead."


def _refuse_dtd(raw: bytes) -> None:
    """Refuse any DTD, in any encoding the file declares: no DTD means no entity expansion and no external
    entities. A byte search alone would miss a document saved as UTF-16."""
    def refuse(*_args):
        raise DocxError(_HOSTILE)
    parser = expat.ParserCreate()
    parser.StartDoctypeDeclHandler = refuse
    parser.EntityDeclHandler = refuse
    parser.ExternalEntityRefHandler = refuse
    try:
        parser.Parse(raw, True)
    except expat.ExpatError:
        raise DocxError("That Word file is damaged. Open it in Word, save it again, then try once more.")


def _paragraphs(el):
    """Every paragraph in reading order, text boxes included, each once."""
    for child in el:
        if child.tag in _SKIP:
            continue
        if child.tag == f"{W}p":
            yield child
        yield from _paragraphs(child)


def _para_text(p) -> str:
    """The paragraph's own words: not a text box inside it (read as its own paragraph), nor text Word keeps twice."""
    parts = []
    for el in _own(p):
        tag = el.tag
        if tag == f"{W}t":
            parts.append(el.text or "")
        elif tag == f"{W}tab":
            parts.append("\t")
        elif tag in (f"{W}br", f"{W}cr"):
            parts.append("\n")
        elif tag == f"{W}noBreakHyphen":
            parts.append("-")
    return "".join(parts)


def _own(p):
    for child in p:
        if child.tag in _SKIP or child.tag == f"{W}txbxContent" or child.tag == f"{W}p":
            continue
        yield child
        yield from _own(child)


def _collapse(paras):
    """Drop empty paragraphs Word uses for spacing, keep the writer's paragraphs."""
    for p in paras:
        if p.strip():
            yield p


def write_docx(title: str, body: str) -> bytes:
    title = _BAD_XML.sub("", (title or "")).strip()
    body = _BAD_XML.sub("", (body or "").replace("\r\n", "\n").replace("\r", "\n"))
    paras = [p for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]
    xml_paras = []
    if title:
        xml_paras.append(f'<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>{_runs(title)}</w:p>')
    for p in paras:
        xml_paras.append(f"<w:p>{_runs(p)}</w:p>")
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        + "".join(xml_paras)
        + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
          'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _CONTENT_TYPES)
        z.writestr("_rels/.rels", _RELS)
        z.writestr("word/_rels/document.xml.rels", _DOC_RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", _STYLES)
        z.writestr("docProps/core.xml", _core(title))
    return buf.getvalue()


def _runs(text: str) -> str:
    lines = text.split("\n")
    out = []
    for i, line in enumerate(lines):
        if i:
            out.append("<w:r><w:br/></w:r>")
        segs = line.split("\t")
        for j, seg in enumerate(segs):
            if j:
                out.append("<w:r><w:tab/></w:r>")
            if seg:
                out.append(f'<w:r><w:t xml:space="preserve">{escape(seg)}</w:t></w:r>')
    return "".join(out)


def _core(title: str) -> str:
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f"<dc:title>{escape(title)}</dc:title></cp:coreProperties>")


_CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    "</Types>")
_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    "</Relationships>")
_DOC_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    "</Relationships>")
_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Libre Caslon Text" w:hAnsi="Libre Caslon Text" w:cs="Georgia"/>'
    '<w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="360" w:lineRule="auto"/>'
    "</w:pPr></w:pPrDefault></w:docDefaults>"
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'
    '<w:pPr><w:spacing w:after="360"/></w:pPr><w:rPr><w:sz w:val="48"/></w:rPr></w:style>'
    "</w:styles>")
