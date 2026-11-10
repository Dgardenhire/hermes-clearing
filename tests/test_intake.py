"""Bringing things in: PDFs (with the caps against small files that ask for huge work), links (public pages
only), the writer's own scene picture, and dictation that never leaves the computer without a press."""
import base64
import json
import struct
import time
import unittest
import zlib
from pathlib import Path

from _load import HTTPException, api, reset, run

pdf, intake, dictation, store = api.pdf, api.intake, api.dictation, api.store


def make_pdf(objects, trailer_extra=b"", header=b"%PDF-1.7\n"):
    """A PDF from numbered object bodies (bytes), with an xref table and a trailer naming object 1 as the catalog."""
    out = bytearray(header)
    offsets = []
    for n, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    x = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for o in offsets:
        out += b"%010d 00000 n \n" % o
    out += b"trailer\n<< /Size %d /Root 1 0 R " % (len(objects) + 1) + trailer_extra + b">>\nstartxref\n%d\n%%%%EOF\n" % x
    return bytes(out)


def stream(data, extra=b"", compress=True):
    d = zlib.compress(data) if compress else data
    return b"<< " + extra + (b"/Filter /FlateDecode " if compress else b"") + b"/Length %d >>\nstream\n" % len(d) + d + b"\nendstream"


FONT = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"


def text_pdf(content, resources=b"<< /Font << /F1 4 0 R >> >>", extra=()):
    return make_pdf([b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                     b"<< /Type /Page /Parent 2 0 R /Resources " + resources + b" /Contents 5 0 R >>", FONT, stream(content), *extra])


class PdfTest(unittest.TestCase):
    def test_a_plain_pdf_reads_as_paragraphs(self):
        data = text_pdf(b"BT /F1 12 Tf 72 720 Td (The room nobody counts) Tj 0 -40 Td (On a cold afternoon in November, eleven people) Tj "
                        b"0 -14 Td (were waiting, and four of them had walked.) Tj 0 -40 Td [(That num) -20 (ber is real.)] TJ ET")
        title, text, stopped = pdf.read_pdf(data)
        self.assertEqual(text, "The room nobody counts\n\nOn a cold afternoon in November, eleven people were waiting, and four of them had "
                               "walked.\n\nThat number is real.")
        self.assertFalse(stopped)

    def test_a_two_byte_font_reads_through_its_unicode_map(self):
        cmap = (b"/CIDInit /ProcSet findresource begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange "
                b"2 beginbfchar <0001> <0048> <0002> <00E9> endbfchar 1 beginbfrange <0010> <0012> <0061> endbfrange endcmap")
        font = b"<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 6 0 R /DescendantFonts [7 0 R] >>"
        desc = b"<< /Type /Font /Subtype /CIDFontType2 /DW 500 >>"
        data = make_pdf([b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                         b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", font,
                         stream(b"BT /F1 12 Tf 72 720 Td <0001000200100011001200100011> Tj ET"), stream(cmap), desc])
        self.assertEqual(pdf.read_pdf(data)[1], "Héabcab")

    def test_refusals_say_what_to_do(self):
        cases = [
            (b"not a pdf at all", "isn't a PDF"),
            (text_pdf(b"BT /F1 12 Tf (Hidden words here.) Tj ET", extra=()) .replace(b"/Root 1 0 R", b"/Root 1 0 R /Encrypt 9 0 R"), "locked with a password"),
            (text_pdf(b"q 100 0 0 100 0 0 cm /Im0 Do Q", resources=b"<< >>"), "no text to read"),
        ]
        for data, words in cases:
            with self.assertRaises(pdf.PdfError) as cm:
                pdf.read_pdf(data)
            self.assertIn(words, str(cm.exception))
        with self.assertRaisesRegex(pdf.PdfError, "larger than 12 MB"):
            pdf.read_pdf(b"%PDF-1.7\n" + b" " * (pdf.MAX_FILE + 1))

    def test_a_stream_that_inflates_a_thousandfold_is_refused_while_it_inflates(self):
        bomb = zlib.compress(b"\0" * (pdf.MAX_STREAM + 4 * 1024 * 1024), 9)
        self.assertLess(len(bomb), 60_000)
        data = make_pdf([b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                         b"<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
                         b"<< /Filter /FlateDecode /Length %d >>\nstream\n" % len(bomb) + bomb + b"\nendstream"])
        t0 = time.monotonic()
        with self.assertRaisesRegex(pdf.PdfError, "unpacks to far more"):
            pdf.read_pdf(data)
        self.assertLess(time.monotonic() - t0, 5)

    def test_the_tiny_pdf_that_paints_one_form_a_hundred_thousand_times_stops_and_keeps_what_it_read(self):
        form = stream(b"BT /F1 12 Tf 72 700 Td (again) Tj ET", b"/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /Font << /F1 4 0 R >> >> ")
        content = b"BT /F1 12 Tf 72 720 Td (Real words come first.) Tj ET\n" + b"/X0 Do\n" * 100_000
        data = text_pdf(content, resources=b"<< /Font << /F1 4 0 R >> /XObject << /X0 6 0 R >> >>", extra=(form,))
        self.assertLess(len(data), 20_000)
        t0 = time.monotonic()
        title, text, stopped = pdf.read_pdf(data)
        self.assertLess(time.monotonic() - t0, 10)
        self.assertTrue(stopped)
        self.assertTrue(text.startswith("Real words come first."))

    def test_a_form_that_paints_itself_is_not_followed_into_itself(self):
        form = stream(b"BT /F1 12 Tf 72 700 Td (inside) Tj ET /X0 Do",
                      b"/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /Font << /F1 4 0 R >> /XObject << /X0 6 0 R >> >> ")
        data = text_pdf(b"/X0 Do", resources=b"<< /Font << /F1 4 0 R >> /XObject << /X0 6 0 R >> >>", extra=(form,))
        self.assertEqual(pdf.read_pdf(data)[1], "inside")

    def test_an_object_stream_that_claims_millions_of_objects_and_deep_nesting_are_bounded(self):
        objstm = stream(b"1 0 2 5 " + b"(x) " * 10, b"/Type /ObjStm /N 9000000 /First 8 ")
        data = text_pdf(b"BT /F1 12 Tf 72 720 Td (Still readable text.) Tj ET", extra=(objstm,))
        self.assertEqual(pdf.read_pdf(data)[1], "Still readable text.")
        deep = make_pdf([b"<< /Type /Catalog /Pages 2 0 R /X " + b"[" * 5000 + b" >>"])
        with self.assertRaises(pdf.PdfError):
            pdf.read_pdf(deep)

    def test_the_route_reads_a_pdf_and_refuses_one_too_large_before_decoding(self):
        reset()
        data = text_pdf(b"BT /F1 12 Tf 72 720 Td (Words from a PDF file.) Tj ET")
        r = run(api.post_import_pdf({"name": "Report.pdf", "data": base64.b64encode(data).decode()}))
        self.assertEqual(r, {"title": "Report", "body": "Words from a PDF file.", "stopped": False})
        with self.assertRaises(HTTPException) as cm:
            run(api.post_import_pdf({"name": "x.pdf", "data": "A" * (pdf.MAX_FILE * 4 // 3 + 100)}))
        self.assertEqual(cm.exception.status_code, 400)
        with self.assertRaises(HTTPException) as cm:
            run(api.post_import_pdf({"name": "x.pdf", "data": "not base64!"}))
        self.assertEqual(cm.exception.status_code, 400)


class LinkTest(unittest.TestCase):
    """Note 5, and the security bar: a link never reaches inside the writer's computer or network."""

    def setUp(self):
        self.calls = []
        self._resolve, self._extract = intake.RESOLVE, intake.EXTRACT
        names = {"example.com": ["93.184.216.34"], "rebind.example": ["93.184.216.34", "127.0.0.1"], "inside.example": ["10.1.2.3"],
                 "v6.example": ["::ffff:192.168.0.10"], "meta.example": ["169.254.169.254"], "ula.example": ["fd12::1"],
                 "cgnat.example": ["100.64.0.9"], "short.example": ["127.1"]}
        intake.RESOLVE = lambda h: names.get(h) or (_ for _ in ()).throw(OSError("no such host"))
        intake.EXTRACT = lambda url: self.calls.append(url) or json.dumps({"results": [
            {"url": url, "title": "The Essay", "content": "# The Essay\n\n![a photo](https://x/y.jpg)\n\nA **bold** first paragraph with [a link](https://e.com) "
                                                       "and enough words to count as a page worth bringing in for the writer today.\n\n\n\nSecond paragraph.",
             "error": None}]})

    def tearDown(self):
        intake.RESOLVE, intake.EXTRACT = self._resolve, self._extract

    def test_only_public_http_and_https_pages_get_past_the_door(self):
        ok = ["https://example.com/a", "http://example.com/a?b=1", "example.com/essay"]
        for u in ok:
            self.assertTrue(intake.check_url(u).startswith(("https://example.com", "http://example.com")), u)
        refused = ["ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "http://localhost/",
                   "http://127.0.0.1/", "http://[::1]/", "http://0.0.0.0/", "http://10.0.0.1/", "http://192.168.1.1/", "http://172.16.0.1/",
                   "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/", "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/",
                   "http://rebind.example/", "http://inside.example/", "http://v6.example/", "http://meta.example/", "http://ula.example/",
                   "http://cgnat.example/", "http://short.example/", "http://printer.local/", "http://db.internal/", "http://intranet/",
                   "http://2130706433/", "http://0x7f000001/", "http://user:pw@example.com/", "http://example.com@10.0.0.1/",
                   "http://example.com:22/", "http://nowhere.example/", "https://exa mple.com/", "http://example.com/\x00", "", None, 42,
                   "https://" + "a" * 3000 + ".com/"]
        for u in refused:
            with self.assertRaises(intake.LinkError, msg=repr(u)):
                intake.check_url(u)
        self.assertEqual(self.calls, [])  # nothing was fetched for any of them

    def test_a_page_comes_back_as_plain_readable_text(self):
        r = intake.fetch_link("https://example.com/essay")
        self.assertEqual(r["title"], "The Essay")
        self.assertEqual(r["body"], "The Essay\n\nA bold first paragraph with a link and enough words to count as a page worth bringing in "
                                    "for the writer today.\n\nSecond paragraph.")
        self.assertEqual(self.calls, ["https://example.com/essay"])

    def test_failures_come_back_in_plain_words(self):
        for reply, words in ((json.dumps({"error": "Unknown tool: web_extract"}), "needs a web tool"),
                             (json.dumps({"success": False, "error": "No web extract provider configured. Run `hermes tools`."}), "needs a web tool"),
                             (json.dumps({"results": [{"url": "u", "error": "Blocked: URL targets a private or internal network address"}]}), "public web pages"),
                             (json.dumps({"results": [{"url": "u", "content": "Sign in", "error": None}]}), "almost no text"),
                             ("not json", "couldn't bring in"), (json.dumps([1, 2]), "couldn't bring in")):
            intake.EXTRACT = lambda url, r=reply: r
            with self.assertRaises(intake.LinkError) as cm:
                intake.fetch_link("https://example.com/")
            self.assertIn(words, str(cm.exception), reply)
            self.assertNotIn("Traceback", str(cm.exception))

    def test_the_plugin_never_fetches_the_page_itself(self):
        """The check here is a first gate; the fetch is always Hermes's web_extract, which checks the address again at
        connect time and on every redirect (tools/url_safety.py). Nothing in intake.py opens a connection."""
        import re as _re
        import socket as _socket
        src = (Path(intake.__file__)).read_text(encoding="utf-8")
        for pattern in (r"urllib\.request", r"http\.client", r"\bimport requests\b", r"\bhttpx\b", r"aiohttp", r"create_connection",
                        r"\.connect\(", r"urlopen", r"subprocess", r"curl"):
            self.assertIsNone(_re.search(pattern, src), pattern)
        saved = (_socket.socket.connect, _socket.create_connection)

        def refuse(*a, **k):
            raise AssertionError("intake opened a connection")
        _socket.socket.connect, _socket.create_connection = refuse, refuse
        try:
            r = intake.fetch_link("https://example.com/essay")
        finally:
            _socket.socket.connect, _socket.create_connection = saved
        self.assertEqual(self.calls, ["https://example.com/essay"])  # only Hermes's web_extract was asked
        self.assertEqual(r["url"], "https://example.com/essay")
        self.assertIn("runtime.dispatch_web(", src)  # the tool name is fixed in runtime.py
        rt = (Path(__file__).resolve().parents[1] / "runtime.py").read_text(encoding="utf-8")
        self.assertIn('WEB_TOOL = "web_extract"', rt)

    def test_the_route(self):
        r = run(api.post_link({"url": "https://example.com/essay"}))
        self.assertEqual(r["url"], "https://example.com/essay")
        with self.assertRaises(HTTPException) as cm:
            run(api.post_link({"url": "http://127.0.0.1/api"}))
        self.assertEqual(cm.exception.status_code, 400)
        self.assertEqual(cm.exception.detail, intake.NOT_PUBLIC)


def png(w, h):
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", w, h) + b"\x08\x02\x00\x00\x00" + b"\0" * 20


class UsedLabelsTest(unittest.TestCase):
    def test_history_labels_match_on_both_sides(self):
        import re as _re
        js = (Path(api.__file__).resolve().parents[1] / "desktop" / "src" / "suggest.js").read_text(encoding="utf-8")
        used = dict(_re.findall(r"(\w+): '([^']+)'", js.split("export const USED = {", 1)[1].split("}", 1)[0]))
        used.update(dict(_re.findall(r'(\w+): "([^"]+)"', js.split("export const USED = {", 1)[1].split("}", 1)[0])))
        self.assertEqual(used, store.MODEL_TEXT)


class PictureTest(unittest.TestCase):
    """Note 1: the writer's own picture for the scene, capped by size, type and dimensions, and removable."""

    def setUp(self):
        reset()

    def test_the_picture_is_kept_shown_and_removed(self):
        self.assertEqual(run(api.get_picture()), {"data": None})
        r = run(api.post_picture({"data": base64.b64encode(png(1600, 900)).decode()}))
        self.assertTrue(r["data"].startswith("data:image/png;base64,"))
        self.assertEqual(run(api.get_picture()), r)
        jpg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xc0\x00\x11\x08\x03\x84\x06\x40" + b"\0" * 40
        r = run(api.post_picture({"data": base64.b64encode(jpg).decode()}))
        self.assertTrue(r["data"].startswith("data:image/jpeg;base64,"))
        self.assertEqual([p.name for p in (store.data_dir() / "scene").glob("picture.*")], ["picture.jpg"])  # one picture at a time
        self.assertEqual(run(api.post_picture_remove()), {"data": None})
        self.assertEqual(run(api.get_picture()), {"data": None})

    def test_only_small_real_pictures_are_taken(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        gif = b"GIF89a" + b"\0" * 20
        cases = [(svg, "JPEG, PNG or WebP"), (gif, "JPEG, PNG or WebP"), (b"", "empty"), (png(20000, 400), "too large"),
                 (png(9000, 9000), "too large"), (png(0, 10), "too large"), (b"\x89PNG\r\n\x1a\n" + b"\0" * (intake.MAX_PICTURE), "larger than 6 MB")]
        for data, words in cases:
            with self.assertRaises(HTTPException, msg=words) as cm:
                run(api.post_picture({"data": base64.b64encode(data).decode()}))
            self.assertIn(words, cm.exception.detail)
        with self.assertRaises(HTTPException):
            run(api.post_picture({"data": "A" * (intake.MAX_PICTURE * 2)}))
        self.assertEqual(run(api.get_picture()), {"data": None})


class DictationTest(unittest.TestCase):
    """Note 6: a recording goes to a cloud service only after the writer pressed Send for that service."""

    WEBM = base64.b64encode(b"\x1a\x45\xdf\xa3" + b"\0" * 400).decode()

    def setUp(self):
        reset()
        self.sent = []
        self._saved = (dictation._hermes_fn, dictation._stt_config, dictation.own_model, dict(dictation.ENGINES), dictation._wav)
        dictation._hermes_fn = lambda: (lambda path: {"success": True, "transcript": "x"})
        dictation._wav = lambda src, dest: None
        dictation.ENGINES["hermes"] = lambda path: self.sent.append(("hermes", Path(path).exists())) or "words from the cloud"
        dictation.ENGINES["whisper"] = lambda path: self.sent.append(("whisper", Path(path).exists())) or "words on this computer"
        dictation.own_model = lambda: None

    def tearDown(self):
        dictation._hermes_fn, dictation._stt_config, dictation.own_model, engines, dictation._wav = self._saved
        dictation.ENGINES.clear()
        dictation.ENGINES.update(engines)

    def post(self, **b):
        return run(api.post_dictation({"data": self.WEBM, **b}))

    def test_a_cloud_service_waits_for_the_press_and_the_press_names_the_service(self):
        dictation._stt_config = lambda: {"provider": "openai"}
        s = run(api.get_dictation())
        self.assertTrue(s["press_first"])
        self.assertIn("OpenAI", s["ask"])
        r = self.post()
        self.assertTrue(r["needs_press"])
        self.assertEqual(r["send_to"], "openai")
        self.assertEqual(self.post(send_to="groq")["needs_press"], True)  # a press for another service is not this one
        self.assertEqual(self.sent, [])
        r = self.post(send_to="openai")
        self.assertEqual(r["text"], "words from the cloud")
        self.assertEqual(r["local"], False)
        self.assertEqual(self.sent, [("hermes", True)])
        self.assertEqual(list((store.data_dir() / "tmp").iterdir()), [])  # the recording is gone after

    def test_auto_detect_asks_too_and_a_local_engine_needs_no_press(self):
        dictation._stt_config = lambda: {}
        self.assertTrue(run(api.get_dictation())["press_first"])
        self.assertTrue(self.post()["needs_press"])
        dictation._stt_config = lambda: {"provider": "local_command"}
        self.assertFalse(run(api.get_dictation())["press_first"])
        self.assertEqual(self.post()["text"], "words from the cloud")
        dictation._hermes_fn = lambda: None
        dictation.own_model = lambda: Path("/models/base.en")
        self.assertEqual(self.post()["text"], "words on this computer")

    def test_plain_failures_and_caps(self):
        dictation._hermes_fn = lambda: None
        with self.assertRaises(HTTPException) as cm:
            self.post()
        self.assertEqual(cm.exception.detail, dictation.NOT_READY)
        dictation._stt_config = lambda: {"provider": "local_command"}
        dictation._hermes_fn = lambda: (lambda p: {})
        for data, words in (("not base64!", "couldn't be turned"), (base64.b64encode(b"MZ\x90\0 not audio").decode(), "couldn't be turned"),
                            ("A" * (dictation.MAX_AUDIO * 2), "ten minutes or less")):
            with self.assertRaises(HTTPException) as cm:
                run(api.post_dictation({"data": data}))
            self.assertIn(words, cm.exception.detail)
        self.assertEqual(self.sent, [])
        dictation.ENGINES["hermes"] = lambda path: ""
        with self.assertRaises(HTTPException) as cm:
            self.post()
        self.assertEqual(cm.exception.detail, dictation.NO_SPEECH)
        dictation.ENGINES["hermes"] = lambda path: (_ for _ in ()).throw(RuntimeError("provider said: secret detail"))
        with self.assertRaises(HTTPException) as cm:
            self.post()
        self.assertEqual(cm.exception.detail, dictation.FAILED)


if __name__ == "__main__":
    unittest.main()
