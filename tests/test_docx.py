"""Word files: a round trip keeps the title and paragraphs, damaged or hostile files are refused with a plain
reason, and the routes never store anything until the page makes a piece."""
import base64
import io
import unittest
import zipfile

from _load import HTTPException, api, reset, run, store

import importlib
docx = importlib.import_module(api.docx.__name__)


def package(document_xml: bytes) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", document_xml)
    return buf.getvalue()


class DocxTest(unittest.TestCase):
    def setUp(self):
        reset()

    def test_round_trip(self):
        body = "First paragraph, with a tab\there.\n\nSecond paragraph\nwith a line break & an ampersand <b>."
        data = docx.write_docx("The room nobody counts", body)
        title, text = docx.read_docx(data)
        self.assertEqual(title, "The room nobody counts")
        self.assertEqual(text, body)
        names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        self.assertIn("word/styles.xml", names)

    def test_refuses_damaged_and_hostile_files(self):
        for data, word in [(b"not a zip", "Word document"),
                           (package(b"<w:document"), "damaged"),
                           (package(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'), "won't open"),
                           (b"x" * (docx.MAX_FILE + 1), "4 MB")]:
            with self.assertRaises(docx.DocxError) as cm:
                docx.read_docx(data)
            self.assertIn(word, str(cm.exception))

    def test_routes(self):
        data = base64.b64encode(docx.write_docx("", "Just words.")).decode()
        r = run(api.post_import_docx({"name": "Draft four.docx", "data": data}))
        self.assertEqual(r, {"title": "Draft four", "body": "Just words."})
        with self.assertRaises(HTTPException) as cm:
            run(api.post_import_docx({"name": "x.docx", "data": "%%%"}))
        self.assertEqual(cm.exception.status_code, 400)
        out = run(api.post_export_docx({"title": "A/B: notes", "body": "One.\n\nTwo."}))
        self.assertEqual(out["name"], "A B notes.docx")
        again = run(api.post_export_docx({"title": "A/B: notes", "body": "One."}))
        self.assertEqual(again["name"], "A B notes (2).docx")
        self.assertTrue(str(store.data_dir()) in out["path"])
        with self.assertRaises(HTTPException):
            run(api.post_export_docx({"title": "", "body": "  "}))


if __name__ == "__main__":
    unittest.main()
