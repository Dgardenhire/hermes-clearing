import json
import unittest

from _load import ROOT, library, sample


class LibraryTest(unittest.TestCase):
    def test_the_whole_library_came_over(self):
        methods = json.loads((ROOT / "library" / "methods.json").read_text())["methods"]
        self.assertEqual(len(methods), 33)
        self.assertEqual(sum(m["room"] == "note" for m in methods), 25)
        self.assertEqual({m["id"]: m["room"] for m in methods if m["room"] != "note"},
                         {"draft": "draft", "voice-check": "voice", "panel": "panel", "debate": "debate", "save": "lessons",
                          "onboarding": "guidance", "setup-project": "home", "emergent": "across"})
        ported = json.loads((ROOT / "library" / "craft-paths.json").read_text())["paths"]
        self.assertEqual([p["id"] for p in ported], ["true-nonfiction", "human-story", "memorable-language", "sharp-message", "spoken-piece"])
        self.assertEqual(sum(len(p["focuses"]) for p in ported), 49)
        self.assertEqual(sum(len(p["focuses"]) for p in library.paths()), 56)  # plus seven for the arc and the ending
        self.assertEqual(len(library._raw()["add"]["composition"]["checks"]), 9)
        self.assertEqual(sum(len(g["figures"]) for g in library.figures()["groups"]), 44)  # 42, plus simile and metaphor (opps1)

    def test_targets_are_unique_and_every_one_builds(self):
        s = sample()
        ids = [t["id"] for t in library.targets()]
        self.assertEqual(len(ids), len(set(ids)))
        ctx = {"guidance": [{"section": "voice", "text": "Short sentences when the news is bad."}],
               "samples": [{"id": "s1", "title": "Letter", "body": "I found the photograph of the lake house."}],
               "earlier": s["body"].replace("Saturday", "Sunday"), "decisions": [],
               "pieces": [{"id": "a", "title": "A", "body": s["body"]}, {"id": "b", "title": "B", "body": "Other notes."}],
               "note": "Cut the windup.", "instruction": "make it shorter", "current": "Every Saturday the branch opens.",
               "answers": {"who": "neighbors", "what": "keep Saturdays", "know": "the vote is soon"}}
        for t in library.targets():
            if t["kind"] in library.MODEL_FREE:
                with self.assertRaisesRegex(ValueError, "without an AI model"):
                    library.build_request(library.target(t["id"]), s["title"], s["body"], None, ctx)
                continue
            sel = {"start": 0, "end": 5} if t["kind"] in ("wording", "rewrite", "apply", "next", "refine", "explain") else None
            req = library.build_request(library.target(t["id"]), s["title"], s["body"], sel, json.loads(json.dumps(ctx)))
            for r in req.get("steps") or [req] if t["kind"] != "debate" else []:
                self.assertTrue("never hand back a revised version" in r["system"] or "nothing reaches the page unless the writer keeps it" in r["system"], t["id"])
                self.assertLess(len(r["system"]) // 4, 4000, t["id"])  # a short system prompt (SPEC: under 4K tokens)
                self.assertIn("Short sentences when the news is bad.", r["system"])  # the writer's guidance governs every pass
            self.assertIn(t["kind"], library.SCHEMAS)
        self.assertEqual(len([t for t in library.targets() if t["group"] == "Methods"]), 33)  # every method runs in the room

    def test_the_ask_words_writers_type(self):
        # Persona test, Nov 8, 2026: the backend's targets carry the same added and dropped Ask words as the page.
        t = {x["id"]: x for x in library.targets()}
        self.assertIn("spelling", t["pass:typos"]["aliases"].split())
        self.assertIn("grammar", t["pass:typos"]["aliases"].split())
        self.assertNotIn("remember", t["method:save"]["aliases"].split())
        self.assertIn("lesson", t["method:save"]["aliases"].split())
        self.assertNotIn("stakes", t["flip:promise"]["aliases"].split())
        self.assertEqual(library.ask_aliases("pass:typos", "a b"), "a b " + library._raw()["add"]["ask"]["aliases"]["pass:typos"])
        self.assertEqual(library.ask_aliases("method:save", "save remember lesson"), "save lesson")
        human = [x for x in t.values() if x["group"] == "Find the human story"]
        self.assertTrue(human and all("fiction" in x["for"] for x in human))
        for path_id in ("true-nonfiction", "human-story", "memorable-language", "sharp-message", "spoken-piece"):
            self.assertTrue(library._raw()["add"]["ask"]["paths"][path_id].startswith("For "), path_id)

    def test_room_never_asks_the_model_for_the_page(self):
        for t in library.targets():
            self.assertNotIn("Apply the available editorial methods", t["task"])

    def test_size_and_empty_checks(self):
        t = library.target("pass:weakest")
        with self.assertRaisesRegex(ValueError, "Select a section"):
            library.build_request(t, "T", "word " * 30000)
        with self.assertRaisesRegex(ValueError, "empty"):
            library.build_request(t, "T", "   \n")
        req = library.build_request(t, "T", "word " * 30000, {"start": 0, "end": 500})
        self.assertIn("selected one passage", req["input"])
        with self.assertRaises(ValueError):
            library.build_request(t, "T", "short", {"start": 0, "end": 99})


class AnchorTest(unittest.TestCase):
    body = "She said “it’s fine” — then  left.\nIt is fine. It is fine."

    def test_curly_quotes_dashes_and_spaces(self):
        s, e = library.anchor(self.body, '"it\'s fine" - then left.')
        self.assertEqual(self.body[s:e], "“it’s fine” — then  left.")

    def test_repeats_and_misses_are_refused(self):
        self.assertIsNone(library.anchor(self.body, "It is fine."))
        self.assertIsNone(library.anchor(self.body, "not in the piece"))
        self.assertIsNotNone(library.anchor(self.body, "It is fine. It is fine."))

    def test_wrapping_quote_marks_are_ignored(self):
        s, e = library.anchor(self.body, "“then left.”")
        self.assertEqual(self.body[s:e], "then  left.")

    def test_selection_bounds(self):
        body = "alpha beta. alpha beta."
        self.assertIsNone(library.anchor(body, "alpha beta."))
        s, e = library.anchor(body, "alpha beta.", 12, len(body))
        self.assertEqual((s, e), (12, 23))


class CheckTest(unittest.TestCase):
    body = sample()["body"]

    def test_findings_drop_one_bad_note_and_keep_the_rest(self):
        data = {"summary": "Two things.", "findings": [
            {"quote": "It is important to note that", "issue": "Throat-clearing?"},
            {"quote": "words the writer never wrote", "issue": "Invented."},
            {"quote": "It is important to note", "issue": "Overlaps the first."},
            {"quote": "basically leverage", "issue": "Two habits at once?"}]}
        r = library.check("findings", data, self.body)
        self.assertEqual([f["quote"] for f in r["findings"]], ["It is important to note that", "basically leverage"])
        self.assertEqual(r["counts"], {"returned": 4, "matched": 2, "dropped": 2})
        for f in r["findings"]:
            self.assertEqual(self.body[f["start"]:f["end"]], f["quote"])

    def test_none_matching_fails_the_pass(self):
        with self.assertRaisesRegex(ValueError, "unmatched"):
            library.check("findings", {"summary": "x", "findings": [{"quote": "nope nope", "issue": "?"}]}, self.body)
        self.assertEqual(library.check("findings", {"summary": "Clean.", "findings": []}, self.body)["findings"], [])
        with self.assertRaisesRegex(ValueError, "unreadable"):
            library.check("findings", {"summary": "x"}, self.body)

    def test_changes_need_a_real_difference(self):
        data = {"summary": "s", "changes": [
            {"original": "did their chemistry homework", "replacement": "did their chemistry homework", "reason": "same"},
            {"original": "lights flickered at close", "replacement": "lights flickered at closing", "reason": "word"}]}
        r = library.check("changes", data, self.body)
        self.assertEqual([c["replacement"] for c in r["changes"]], ["lights flickered at closing"])

    def test_note_keeps_general_notes_and_pins_the_rest(self):
        data = {"summary": "The piece argues well.", "question": "Who is the reader?", "notes": [
            {"quote": "", "note": "The ending repeats the title."},
            {"quote": "That number is real.", "note": "Strong. Is the next sentence needed?"},
            {"quote": "invented line", "note": "dropped"}]}
        r = library.check("note", data, self.body)
        self.assertEqual(len(r["general"]), 1)
        self.assertEqual([n["quote"] for n in r["notes"]], ["That number is real."])
        self.assertEqual(r["counts"]["dropped"], 1)

    def test_openings_replace_the_first_paragraph(self):
        r = library.check("openings", {"options": [{"opening": "A.", "how": "x"}, {"opening": "B.", "how": "y"}, {"opening": "C.", "how": "z"}]}, self.body)
        self.assertEqual(len(r["options"]), 3)
        self.assertTrue(r["replaces"]["text"].startswith("Every Saturday morning"))
        self.assertTrue(r["replaces"]["text"].endswith("sit down."))
        self.assertEqual(library.first_paragraph("\n\n  Hello there.\nStill one.\n\nTwo."), (4, 27))

    def test_cuts_pin_each_passage_and_drop_the_rest(self):
        data = {"summary": "Two cuts.", "cuts": [
            {"quote": "It is important to note that most", "reason": "Windup."},
            {"quote": "a sentence the writer never wrote", "reason": "dropped"},
            {"quote": "That number is real.", "reason": "Concedes too early."}]}
        r = library.check("cuts", data, self.body)
        self.assertEqual([c["quote"] for c in r["cuts"]], ["It is important to note that most", "That number is real."])
        self.assertEqual(r["counts"], {"returned": 3, "matched": 2, "dropped": 1})
        with self.assertRaises(ValueError):
            library.check("cuts", {"summary": "x", "cuts": [{"quote": "nowhere in the piece", "reason": "x"}]}, self.body)
        self.assertEqual(library.check("cuts", {"summary": "Tight already.", "cuts": []}, self.body)["cuts"], [])
        t = library.target("cut")
        self.assertEqual(t["kind"], "cuts")
        req = library.build_request(t, "T", self.body)
        self.assertIn("deletions only", req["system"])
        self.assertEqual(req["schema"], library.CUTS_SCHEMA)

    def test_wording_needs_a_selection_and_returns_distinct_options(self):
        t = library.target("wording")
        with self.assertRaises(ValueError):
            library.build_request(t, "T", self.body)
        at = self.body.index("modest")
        sel = {"start": at, "end": at + 6}
        req = library.build_request(t, "T", self.body, sel)
        self.assertIn("[[modest]]", req["input"])
        self.assertNotIn("Ninth Street opens", req["input"])  # only the paragraph around the selection
        data = {"options": [{"text": "small", "why": "plainer"}, {"text": "modest", "why": "same"}, {"text": "small", "why": "dup"},
                            {"text": "[[slight]]", "why": "brackets stripped"}, {"text": "x" * 200, "why": "too long"}]}
        r = library.check("wording", data, self.body, sel)
        self.assertEqual([o["text"] for o in r["options"]], ["small", "slight"])
        self.assertEqual(r["selection"]["text"], "modest")
        with self.assertRaises(ValueError):
            library.check("wording", {"options": [{"text": "modest", "why": "same"}]}, self.body, sel)


if __name__ == "__main__":
    unittest.main()
