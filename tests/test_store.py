import unittest

from _load import reset, store


class StoreTest(unittest.TestCase):
    def setUp(self):
        reset()

    def test_create_save_and_reopen_after_a_crash(self):
        p = store.create_piece("Draft", "First line.")
        store.save_piece(p["id"], body="First line. Second line, mid-sente")
        store.reset_for_tests()  # Hermes killed: the connection is gone
        again = store.get_piece(p["id"])
        self.assertEqual(again["body"], "First line. Second line, mid-sente")
        self.assertEqual(again["words"], 5)

    def test_only_given_fields_change(self):
        p = store.create_piece("Title", "Body")
        store.save_piece(p["id"], title="  New   title ")
        q = store.get_piece(p["id"])
        self.assertEqual((q["title"], q["body"]), ("New title", "Body"))

    def test_trash_is_restorable_and_never_deletes(self):
        p = store.create_piece("Gone", "words")
        store.trash_piece(p["id"])
        self.assertEqual([x["id"] for x in store.list_pieces()], [])
        self.assertEqual([x["id"] for x in store.list_pieces(trashed=True)], [p["id"]])
        with self.assertRaises(ValueError):
            store.save_piece(p["id"], body="typing into the trash")
        store.restore_piece(p["id"])
        self.assertEqual(store.get_piece(p["id"])["body"], "words")

    def test_versions_skip_duplicates_and_restore_keeps_the_current_text(self):
        p = store.create_piece("T", "one")
        self.assertIsNone(store.add_version(p["id"], "idle"))  # same as the first version
        store.save_piece(p["id"], body="two")
        self.assertIsNotNone(store.add_version(p["id"], "idle"))
        store.save_piece(p["id"], body="three")
        first = store.list_versions(p["id"])[-1]
        restored = store.restore_version(p["id"], first["id"])
        self.assertEqual(restored["body"], "one")
        reasons = [v["reason"] for v in store.list_versions(p["id"])]
        self.assertEqual(reasons[0], "restore")  # "three" was kept before going back
        self.assertIn("three", [store.get_version(v["id"])["body"] for v in store.list_versions(p["id"])])

    def test_history_rows_show_what_each_version_changed(self):
        self.assertEqual(store.changed_phrase("Hello there.", "It is important to note that Hello there."),
                         {"kind": "cut", "text": "It is important to note that"})
        self.assertEqual(store.changed_phrase("One. Two more words here.", "One."), {"kind": "added", "text": "Two more words here."})
        self.assertIsNone(store.changed_phrase("Same.", "Same."))
        self.assertIsNone(store.changed_phrase("First.", None))

    def test_finish_marks_a_finished_version(self):
        p = store.create_piece("T", "draft")
        done = store.finish_piece(p["id"], body="final words")
        v = store.get_version(done["finished_version"])
        self.assertEqual((v["reason"], v["body"]), ("finished", "final words"))

    def test_version_cap_drops_oldest_idle(self):
        p = store.create_piece("T", "v0")
        old = store.VERSION_CAP
        store.VERSION_CAP = 5
        try:
            for i in range(1, 10):
                store.save_piece(p["id"], body=f"v{i}")
                store.add_version(p["id"], "idle")
            self.assertLessEqual(len(store.list_versions(p["id"])), 5)
        finally:
            store.VERSION_CAP = old

    def test_too_long_and_missing(self):
        with self.assertRaises(ValueError):
            store.create_piece("T", "x" * (store.MAX_BODY + 1))
        with self.assertRaises(LookupError):
            store.get_piece("nope")

    def test_passes_and_stale_recovery(self):
        p = store.create_piece("T", "words here")
        rec = store.add_pass(p["id"], "pass:weakest", "findings", {"selection": None})
        self.assertEqual(store.running_pass(p["id"])["id"], rec["id"])
        self.assertEqual(store.interrupt_stale_passes(), 1)
        self.assertEqual(store.get_pass(rec["id"])["error_code"], "interrupted")
        self.assertIsNone(store.running_pass(p["id"]))


if __name__ == "__main__":
    unittest.main()
