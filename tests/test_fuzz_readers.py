"""The hand-written PDF and Word readers, fed thousands of damaged files: every one is read or refused with a plain
reason (``PdfError`` or ``DocxError``), never a crash, and none takes longer than the reader's own time limit.

The damage is seeded, so a failure here repeats exactly: flipped bytes, cut-off files, inserted junk, repeated
chunks, PDF keywords dropped in at random, deleted stretches, and, for Word files, the same damage done to the
document XML inside an otherwise good zip. Seeds that broke the Word reader before 0.1.1 (a negative seek, a zip
version Python refuses, a file name that isn't text, an XML encoding Python doesn't know) are among those run."""
import io
import random
import time
import unittest
import zipfile

from _load import api
from test_intake import FONT, make_pdf, stream, text_pdf

pdf, docx = api.pdf, api.docx

KEYWORDS = (b"obj", b"endobj", b"stream", b"endstream", b"<<", b">>", b"[", b"]", b"R", b"/Filter", b"/FlateDecode",
            b"/ObjStm", b"/Kids", b"/Contents", b"Do", b"Tj", b"TJ", b"BT", b"ET", b"cm", b"(", b")", b"\\",
            b"/Length 999999", b"xref", b"trailer", b"/Prev 0", b"-1", b"99999999999999999999", b"<?xml", b"<!DOCTYPE",
            b"encoding=\"UTF-9\"", b"<w:p>", b"</w:p>", b"PK\x03\x04", b"PK\x01\x02")


def damage(b, r):
    b = bytearray(b)
    kind = r.randrange(6)
    if kind == 0:
        for _ in range(r.randint(1, 20)):
            if b:
                b[r.randrange(len(b))] = r.randrange(256)
    elif kind == 1:
        b = b[:r.randrange(len(b) + 1)]
    elif kind == 2:
        i = r.randrange(len(b) + 1)
        b[i:i] = bytes(r.randrange(256) for _ in range(r.randint(1, 64)))
    elif kind == 3 and b:
        i = r.randrange(len(b))
        b[i:i] = b[i:min(len(b), i + r.randint(1, 4096))] * r.randint(1, 8)
    elif kind == 4:
        for _ in range(r.randint(1, 8)):
            i = r.randrange(len(b) + 1)
            b[i:i] = r.choice(KEYWORDS)
    elif b:
        i = r.randrange(len(b))
        del b[i:min(len(b), i + r.randint(1, 256))]
    return bytes(b)


def damage_inside(b, r):
    """Half the time the zip bytes themselves; otherwise only word/document.xml, re-zipped cleanly."""
    if r.random() < 0.5:
        return damage(b, r)
    z, out = zipfile.ZipFile(io.BytesIO(b)), io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as w:
        for name in z.namelist():
            data = z.read(name)
            w.writestr(name, damage(data, r) if name == "word/document.xml" else data)
    return out.getvalue()


def pdf_seeds():
    cmap = (b"/CIDInit /ProcSet findresource begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange "
            b"2 beginbfchar <0001> <0048> <0002> <00E9> endbfchar 1 beginbfrange <0010> <0012> <0061> endbfrange endcmap")
    two_byte = make_pdf([b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                         b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
                         b"<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 6 0 R "
                         b"/DescendantFonts [7 0 R] >>",
                         stream(b"BT /F1 12 Tf 72 720 Td <0001000200100011001200100011> Tj ET"), stream(cmap),
                         b"<< /Type /Font /Subtype /CIDFontType2 /DW 500 >>"])
    form = make_pdf([b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                     b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> /XObject << /X1 6 0 R >> >> "
                     b"/Contents 5 0 R >>", FONT, stream(b"q /X1 Do Q BT /F1 12 Tf 72 700 Td (After the form.) Tj ET"),
                     stream(b"BT /F1 12 Tf 72 720 Td (Inside a form, read once.) Tj ET",
                            extra=b"/Type /XObject /Subtype /Form /Resources << /Font << /F1 4 0 R >> >> ")])
    plain = text_pdf(b"BT /F1 12 Tf 72 720 Td (The room nobody counts) Tj 0 -40 Td (On a cold afternoon in November,) Tj "
                     b"0 -14 Td (eleven people were waiting.) Tj 0 -40 Td [(That num) -20 (ber is real.)] TJ ET")
    return [plain, two_byte, form]


def docx_seed():
    return docx.write_docx("A title", "First paragraph, with a few words in it.\n\nSecond one, a little longer than the first.")


class Readers(unittest.TestCase):
    def _run(self, read, refusal, seeds, mutate, seed, count, limit):
        r = random.Random(seed)
        for i in range(count):
            data = mutate(r.choice(seeds), r)
            started = time.monotonic()
            try:
                read(data)
            except refusal:
                pass
            except Exception as e:  # what a crash would be: say which seed and round repeat it
                self.fail(f"seed {seed}, round {i}: {type(e).__name__}: {e}")
            self.assertLess(time.monotonic() - started, limit, f"seed {seed}, round {i} took too long")

    def test_the_seeds_themselves_read(self):
        for data in pdf_seeds():
            self.assertTrue(pdf.read_pdf(data)[1])
        self.assertEqual(docx.read_docx(docx_seed())[0], "A title")

    def test_damaged_pdfs_are_read_or_refused(self):
        for seed in (1, 7, 11):
            self._run(pdf.read_pdf, pdf.PdfError, pdf_seeds(), damage, seed, 500, pdf.SECONDS + 5)

    def test_damaged_word_files_are_read_or_refused(self):
        for seed in (1, 2, 3, 7, 11):  # 1, 2 and 3 each broke the reader before 0.1.1
            self._run(docx.read_docx, docx.DocxError, [docx_seed()], damage_inside, seed, 1000, 10)

    def test_the_damage_reaches_the_reader(self):
        """The mutations are not all refused at the door: some damaged files still read."""
        r, read = random.Random(5), 0
        for _ in range(300):
            try:
                docx.read_docx(damage_inside(docx_seed(), r))
                read += 1
            except docx.DocxError:
                pass
        self.assertGreater(read, 10)


if __name__ == "__main__":
    unittest.main()
