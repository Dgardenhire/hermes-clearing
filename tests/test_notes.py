"""Damon's hands-on notes, Nov 8, 2026: an editor that leads with changes, suggested text the writer controls,
and the off switch. Every test here failed on the code before the fix."""
import json
import unittest

from _load import HTTPException, api, fake_model, library, reset, run, sample, store


def _req(target, body, selection=None, **ctx):
    return library.build_request(library.target(target), "T", body, selection, {"guidance": [], **ctx})


class EditorLeadsWithChangesTest(unittest.TestCase):
    """Note 3: "it accepts the piece mostly as it is ... it didn't offer any new advice"."""

    def test_passes_that_mark_passages_lead_with_changes_and_show_an_example(self):
        body = sample()["body"]
        for target in ("pass:weakest", "check:active-passive", "method:dev-edit", "craft:human-story:21"):
            system = _req(target, body)["system"]
            self.assertIn("Lead with concrete new moves", system, target)
            self.assertIn("no note may only praise", system, target)
            self.assertIn('Give each note a "try"', system, target)
            self.assertNotIn("provide no replacement prose", system, target)
            self.assertNotIn("never supply finished replacement text", system, target)
        steps = _req("method:panel", body)["steps"]
        self.assertTrue(all("Lead with concrete new moves" in s["system"] for s in steps))

    def test_the_figures_passes_recommend_figures_the_piece_does_not_use(self):
        body = sample()["body"]
        system = _req("craft:memorable-language:30", body)["system"]  # Repetition & return
        self.assertIn("Lead with figures the piece does not use yet", system)
        self.assertIn("Never recommend a figure the quoted sentence already uses", system)
        self.assertIn("Figures to choose from:", system)
        for name in ("polyptoton", "anadiplosis", "epistrophe"):
            self.assertIn(name, system)
        self.assertNotIn("zeugma", system)  # another family's figure
        chooser = _req("craft:memorable-language:28", body)["system"]
        self.assertIn("zeugma", chooser)
        self.assertIn("alliteration", chooser)
        self.assertLess(len(chooser) // 4, 4000)

    def test_praise_only_notes_are_dropped_from_the_models_reply(self):
        body = sample()["body"]
        q1 = "The budget memo calls it a modest efficiency."
        q2 = "That number is real."
        data = {"summary": "Two things to change.", "findings": [
            {"quote": q1, "issue": "Good job with repetition here."},
            {"quote": q2, "issue": "Strong line. Would it carry more as the last line of its paragraph?"}]}
        r = library.check("findings", data, body)
        self.assertEqual([f["quote"] for f in r["findings"]], [q2])
        self.assertEqual(r["counts"]["praise"], 1)
        notes = {"summary": "Read.", "question": "Q?", "notes": [
            {"quote": q1, "note": "This works well and is very effective."},
            {"quote": "", "note": "A powerful, vivid piece."},
            {"quote": q2, "note": "Cut it, and start the paragraph on the turn."}]}
        r = library.check("note", notes, body)
        self.assertEqual([n["quote"] for n in r["notes"]], [q2])
        self.assertEqual(r["general"], [])

    def test_a_reply_that_only_praises_is_not_mistaken_for_one_that_missed_the_words(self):
        body = sample()["body"]
        data = {"summary": "Fine.", "findings": [{"quote": "That number is real.", "issue": "Nice."}]}
        r = library.check("findings", data, body)
        self.assertEqual(r["findings"], [])
        self.assertEqual(r["counts"]["praise"], 1)

    def test_each_note_carries_its_rewritten_example_bounded_and_never_the_passage_itself(self):
        body = sample()["body"]
        q = "That number is real."
        data = {"summary": "S.", "findings": [{"quote": q, "issue": "Fold it into the next sentence.", "try": "The number is real, and it counts checkouts."},
                                              {"quote": "The budget memo calls it a modest efficiency.", "issue": "Name the memo.", "try": "The budget memo calls it a modest efficiency."}]}
        r = library.check("findings", data, body)
        by = {f["quote"]: f for f in r["findings"]}
        self.assertEqual(by[q]["try"], "The number is real, and it counts checkouts.")
        self.assertEqual(by["The budget memo calls it a modest efficiency."]["try"], "")  # the passage itself is no example
        data["findings"][0]["try"] = "x" * 5000
        self.assertEqual(library.check("findings", data, body)["findings"][1]["try"], "")


class SuggestedTextTest(unittest.TestCase):
    """Note 8: suggestions from the writer's model, never inserted on their own."""

    def setUp(self):
        reset()
        self.llm = fake_model()
        self.piece = api.store.create_piece(sample()["title"], sample()["body"])

    def _pass(self, target, selection=None, **extra):
        async def scenario():
            started = await api.post_pass({"piece_id": self.piece["id"], "target": target, "selection": selection, **extra})
            if started["id"] in api._jobs:
                await api._jobs[started["id"]]
            return await api.get_pass(started["id"])
        return run(scenario())

    def test_rewrite_gives_three_labeled_options_for_the_selection_only(self):
        body = self.piece["body"]
        q = "The budget memo calls it a modest efficiency."
        s = body.index(q)
        self.llm.queue.append({"options": [{"text": "The memo calls it an efficiency.", "move": "tighter"},
                                           {"text": q, "move": "same"},
                                           {"text": "The county's budget memo calls the cut a modest efficiency.", "move": "more concrete"},
                                           {"text": "A modest efficiency, the memo calls it.", "move": "ends on the key word"}]})
        p = self._pass("rewrite", {"start": s, "end": s + len(q)}, move="tighten")  # a single-move button: one call
        self.assertEqual(p["status"], "done")
        self.assertEqual(len(self.llm.calls), 1)
        self.assertEqual([o["move"] for o in p["result"]["options"]], ["Tighter", "More concrete", "Ends on the key word"])
        self.assertEqual(p["result"]["selection"], {"start": s, "end": s + len(q), "text": q})
        self.assertIn("[[" + q + "]]", self.llm.calls[0]["input"][0]["text"])
        self.assertEqual(store.get_piece(self.piece["id"])["body"], body)  # nothing is inserted on its own

    def test_next_sentence_works_from_the_cursor_and_never_repeats_the_page(self):
        body = self.piece["body"]
        at = body.index("That number is real.") + len("That number is real.")
        self.llm.queue.append({"options": [{"text": "But a checkout is not a visit.", "how": "turns"},
                                           {"text": "That number is real.", "how": "repeats"},
                                           {"text": "Ask the man at the corner table how often he comes.", "how": "a detail"}]})
        p = self._pass("next", {"start": 0, "end": at})
        self.assertEqual(p["status"], "done")
        self.assertEqual(p["result"]["at"], at)
        self.assertEqual([o["text"] for o in p["result"]["options"]], ["But a checkout is not a visit.", "Ask the man at the corner table how often he comes."])
        self.assertIn("[[here]]", self.llm.calls[0]["input"][0]["text"])

    def test_endings_titles_and_show_me(self):
        body = self.piece["body"]
        self.llm.queue.append({"options": [{"text": "Count the room.", "how": "a demand"}, {"text": "The room is full on Saturdays.", "how": "a fact"}]})
        p = self._pass("endings")
        last = library.last_paragraph(body)
        self.assertEqual(p["result"]["replaces"]["start"], last[0])
        self.llm.queue.append({"options": [{"text": sample()["title"], "how": "same"}, {"text": "Eleven people, four on foot", "how": "an image"}]})
        p = self._pass("titles")
        self.assertEqual([o["text"] for o in p["result"]["options"]], ["Eleven people, four on foot"])
        q = "That number is real."
        s = body.index(q)
        self.llm.queue.append({"text": "That number, [the checkout count], is real.", "how": "named the number"})
        p = self._pass("apply", {"start": s, "end": s + len(q)}, note="Say which number.")
        self.assertEqual(p["result"]["text"], "That number, [the checkout count], is real.")
        self.assertIn("Say which number.", self.llm.calls[-1]["input"][0]["text"])
        self.assertEqual(store.get_piece(self.piece["id"])["body"], body)

    def test_a_model_error_or_a_reply_out_of_shape_fails_plainly_and_changes_nothing(self):
        body = self.piece["body"]
        s = body.index("That number is real.")
        sel = {"start": s, "end": s + 20}
        self.llm.queue.append(RuntimeError("upstream exploded with a traceback"))
        p = self._pass("rewrite", sel)
        self.assertEqual(p["status"], "failed")
        self.assertEqual(p["message"], api.gateway.MESSAGES["failed"])
        for reply in ("Here are some rewrites: one, two, three.", {"rewrites": ["a"]}, {"options": "tighter"}, {"options": [{"move": "x"}]}):
            self.llm.queue.append(reply)
            if isinstance(reply, str):
                self.llm.queue.append(reply)  # asked again as plain JSON
            p = self._pass("rewrite", sel)
            self.assertEqual(p["status"], "failed", reply)
            self.assertIn(p["code"], ("unreadable", "cut_off"), reply)
        self.llm.queue.append({"summary": "No."})  # apply with no text
        p = self._pass("apply", sel, note="Cut it.")
        self.assertEqual(p["status"], "failed")
        self.assertEqual(store.get_piece(self.piece["id"])["body"], body)

    def test_the_off_switch_refuses_suggestions_and_strips_examples(self):
        self.assertTrue(run(api.get_settings())["suggestions"])
        self.assertEqual(run(api.post_settings({"suggestions": False})), {"suggestions": False})
        self.assertFalse(run(api.get_state())["settings"]["suggestions"])
        body = self.piece["body"]
        for target, sel in (("rewrite", {"start": 0, "end": 30}), ("next", {"start": 30, "end": 30}), ("openings", None),
                            ("endings", None), ("titles", None), ("wording", {"start": 0, "end": 3}), ("flip:thesis", None)):
            with self.assertRaises(HTTPException) as cm:
                run(api.post_pass({"piece_id": self.piece["id"], "target": target, "selection": sel}))
            self.assertEqual(cm.exception.status_code, 400)
            self.assertEqual(cm.exception.detail, library.SUGGESTIONS_OFF)
        self.assertEqual(self.llm.calls, [])
        q = "That number is real."
        self.llm.queue.append({"summary": "S.", "findings": [{"quote": q, "issue": "Fold it in.", "try": "Folded."}]})
        p = self._pass("pass:weakest")
        system = self.llm.calls[0]["system_prompt"]
        self.assertIn("Suggested text is off", system)
        self.assertNotIn('"try"', system.split("Suggested text is off")[0].split("Return JSON")[-1])
        self.assertEqual(p["result"]["findings"][0]["try"], "")
        run(api.post_settings({"suggestions": True, "junk": 1}))
        self.assertEqual(store.settings(), {"suggestions": True})
        store.meta_set("settings", "garbage")
        self.assertEqual(store.settings(), {"suggestions": True})

    def test_model_text_the_writer_used_is_recorded_and_shown_in_history(self):
        pid = self.piece["id"]
        run(api.post_decisions(pid, {"items": [
            {"kind": "rewrite", "original": "That number is real.", "chosen": "The number is real.", "choice": "chose", "model": "hermes-4-405b"},
            {"kind": "word", "original": "modest", "chosen": "small", "choice": "chose"},
            {"kind": "next", "original": "", "chosen": "But a checkout is not a visit.", "choice": "chose", "model": "hermes-4-405b"},
            {"kind": "rewrite", "original": "x", "chosen": "y", "choice": "skipped"},
            {"kind": "bogus", "original": "x", "chosen": "y", "choice": "chose"}]}))
        used = run(api.get_versions(pid))["suggested"]
        self.assertEqual([u["kind"] for u in used], ["rewrite", "next"][::-1] if used[0]["kind"] == "next" else ["rewrite", "next"])
        self.assertEqual({u["label"] for u in used}, {"Rewrite", "Next sentence"})
        self.assertTrue(all(u["model"] == "hermes-4-405b" for u in used))
        self.assertEqual(store.REASONS["suggestion"], "Before using a suggestion")


if __name__ == "__main__":
    unittest.main()
