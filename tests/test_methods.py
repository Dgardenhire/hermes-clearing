"""The eight methods with their own surface in the room, and the main point and the promise three ways.

Each test runs the method the way the page does (POST /passes, then the job), with a fake model, and
checks what the writer would see: the result, or the plain message that says what to do."""
import unittest
from pathlib import Path

from _load import HTTPException, PluginLlmTrustError, api, fake_model, gateway, library, reset, run, sample, store

NOTE = "Every Saturday morning the branch library on Ninth Street opens at ten, and every Saturday there is a line."
LAST = "If the council wants to save money, it should count who uses the room before it decides who can do without it."


def plain(text):
    """A message the writer can act on: a sentence, no error names, no codes."""
    return bool(text) and text[0].isupper() and text[-1] in ".?!" and "Error" not in text and "{" not in text


class MethodTest(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        self.piece = run(api.get_state())["current"]

    def go(self, target, **extra):
        async def scenario():
            started = await api.post_pass({"piece_id": self.piece["id"], "target": target, **extra})
            await api._jobs[started["id"]]
            return await api.get_pass(started["id"])
        return run(scenario())

    def refused(self, target, **extra):
        with self.assertRaises(HTTPException) as cm:
            run(api.post_pass({"piece_id": self.piece["id"], "target": target, **extra}))
        self.assertTrue(plain(cm.exception.detail), cm.exception.detail)
        self.assertEqual(self.llm.calls, [])
        return cm.exception

    def other(self, title, body, voice=False):
        p = store.create_piece(title, body)
        if voice:
            store.set_voice(p["id"], True)
        return p

    def tearDown(self):
        self.assertEqual(store.get_piece(self.piece["id"])["body"], self.piece["body"])  # the manuscript never changes


class FlipTest(MethodTest):
    def test_main_point_three_ways_replaces_the_sentence_that_has_it(self):
        self.llm.queue = [{"current": LAST, "options": [
            {"text": "The council should count who uses the branch before cutting it.", "how": "Narrower: a request about method."},
            {"text": "Cutting the branch to four days would close the only free room within two miles.", "how": "Bolder: names the loss."},
            {"text": "A budget that counts only checkouts will cut what 1,200 people rely on.", "how": "Names the stakes."},
        ]}]
        done = self.go("flip:thesis")
        r = done["result"]
        self.assertEqual((done["status"], done["kind"]), ("done", "flip"))
        self.assertFalse(r["insert"])
        self.assertEqual(r["replaces"]["text"], LAST)
        self.assertEqual(self.piece["body"][r["replaces"]["start"]:r["replaces"]["end"]], LAST)
        self.assertEqual(len(r["options"]), 3)
        self.assertEqual(r["options"][2]["unsupported"], ["'1,200'"])  # a number the piece never gave is flagged
        self.assertEqual(r["options"][1]["unsupported"], [])
        self.assertIn("nothing reaches the page unless the writer keeps it", self.llm.calls[0]["system_prompt"])

    def test_promise_with_no_sentence_goes_after_the_first_paragraph(self):
        self.llm.queue = [{"current": "", "options": [{"text": "This is about what a budget cannot see.", "how": "Learn"},
                                                       {"text": "The vote is close.", "how": "Stakes"}]}]
        r = self.go("flip:promise", selection={"start": 0, "end": 40})["result"]
        self.assertTrue(r["insert"])
        end = self.piece["body"].index("\n\n")
        self.assertEqual((r["replaces"]["start"], r["replaces"]["end"]), (end, end))
        self.assertEqual(len(r["options"]), 2)

    def test_options_that_repeat_the_sentence_or_run_long_are_dropped(self):
        self.llm.queue = [{"current": LAST, "options": [{"text": LAST, "how": "same"}, {"text": "x " * 500, "how": "long"}]}]
        done = self.go("flip:thesis")
        self.assertEqual((done["status"], done["code"]), ("failed", "unreadable"))
        self.assertTrue(plain(done["message"]))


class DraftTest(MethodTest):
    def test_three_drafts_from_the_selected_notes_with_gaps_and_new_facts_flagged(self):
        notes = self.piece["body"].index("I spent three Saturdays")
        sel = {"start": notes, "end": notes + 200}
        self.llm.queue = [{"options": [
            {"text": "For three Saturdays I sat in the branch and watched Arturo print his résumé.", "how": "Starts with one person.", "gaps": ["Arturo's last name"]},
            {"text": "The shelter's address kept changing, so Arturo printed the same résumé four times.", "how": "Cause first.", "gaps": []},
            {"text": "In 2019 the branch had “a waiting list for the printer”.", "how": "Adds a fact", "gaps": "not a list"},
        ]}]
        done = self.go("method:draft", selection=sel)
        r = done["result"]
        self.assertEqual(done["kind"], "draft")
        self.assertEqual((r["replaces"]["start"], r["replaces"]["end"]), (sel["start"], sel["end"]))
        self.assertEqual(r["options"][0]["gaps"], ["Arturo's last name"])
        self.assertEqual(r["options"][2]["gaps"], [])
        self.assertEqual(r["options"][2]["unsupported"], ["'2019'", "'a waiting list for the printer'"])
        self.assertIn("<notes>", self.llm.calls[0]["input"][0]["text"])

    def test_the_whole_page_is_the_notes_when_nothing_is_selected(self):
        self.llm.queue = [{"options": [{"text": "A draft.", "how": "Short", "gaps": []}]}]
        r = self.go("method:draft")["result"]
        self.assertEqual((r["replaces"]["start"], r["replaces"]["end"]), (0, len(self.piece["body"])))


class VoiceTest(MethodTest):
    def test_needs_a_voice_sample_and_says_how_to_add_one(self):
        e = self.refused("method:voice-check")
        self.assertEqual(e.status_code, 400)
        self.assertIn("Use as a voice sample", e.detail)
        store.set_voice(self.piece["id"], True)  # the piece itself is not evidence of its own voice
        self.refused("method:voice-check")

    def test_judgments_cite_a_sample_or_become_unclear(self):
        self.other("Letter to my sister", "I found the photograph of the lake house. You were nine and furious about the canoe.", voice=True)
        self.llm.queue = [{"summary": "Mostly yours.", "question": "Is the hedge yours?", "notes": [
            {"quote": "I think that might perhaps understate", "judgment": "drift", "sample": "You were nine and furious about the canoe.", "note": "Your samples say things flat. Is this hedge yours?"},
            {"quote": "That number is real.", "judgment": "aligned", "sample": "a sentence no sample has", "note": "Short and plain."},
        ]}]
        done = self.go("method:voice-check")
        notes = done["result"]["notes"]
        self.assertEqual([(n["judgment"], n["sample_title"]) for n in notes], [("drift", "Letter to my sister"), ("unclear", "")])
        sent = self.llm.calls[0]["input"][0]["text"]
        self.assertIn('<sample n="1" title="Letter to my sister">', sent)
        self.assertIn("<piece>", sent)


class PanelTest(MethodTest):
    def answer(self, by):
        def route(kw):
            for name, item in by.items():
                if name in kw["instructions"]:
                    return item(kw) if callable(item) else item
            raise AssertionError(kw["instructions"])
        return route

    def test_three_separate_reviewers_and_where_they_agree(self):
        route = self.answer({
            "The newcomer": {"summary": "Lost once.", "findings": [{"quote": "a modest efficiency", "issue": "Whose phrase is this?"}]},
            "The skeptic": {"summary": "One claim outruns its evidence.", "findings": [
                {"quote": "The budget memo calls it a modest efficiency", "issue": "Does the memo say this?"},
                {"quote": "That number is real.", "issue": "Why concede?"}]},
            "The line editor": PluginLlmTrustError("denied"),
        })
        self.llm.queue = [route, route, route]
        done = self.go("method:panel")
        r = done["result"]
        self.assertEqual(done["status"], "done")
        self.assertEqual(len(self.llm.calls), 3)  # three separate calls, never one answer playing three parts
        self.assertEqual([(x["id"], x["status"]) for x in r["reviewers"]], [("newcomer", "done"), ("skeptic", "done"), ("editor", "failed")])
        self.assertEqual(r["reviewers"][2]["message"], gateway.MESSAGES["no_model"])  # an unfinished review keeps its place
        self.assertEqual(len(r["agreements"]), 1)
        self.assertEqual(r["agreements"][0]["reviewers"], ["newcomer", "skeptic"])
        self.assertEqual(done["tokens_in"], 240)  # tokens from both answers
        self.assertIn("Your point of view, the skeptic", next(c["system_prompt"] for c in self.llm.calls if "skeptic" in c["instructions"]))

    def test_the_panel_fails_plainly_only_when_every_reviewer_does(self):
        self.llm.queue = [RuntimeError("429 rate limit")] * 3
        done = self.go("method:panel")
        self.assertEqual((done["status"], done["code"], done["message"]), ("failed", "busy", gateway.MESSAGES["busy"]))


class DebateTest(PanelTest):
    REVIEWS = {
        "The newcomer": {"summary": "The church comparison loses me.", "findings": [{"quote": "counting the pews", "issue": "Do I need a church?"}]},
        "The skeptic": {"summary": "The comparison is the best proof.", "findings": [{"quote": "a food pantry in its basement", "issue": "Keep it?"}]},
        "The line editor": {"summary": "Fine.", "findings": []},
    }
    STEPS = {
        "frame": {"question": "Does the church comparison stay?", "sides": [
            {"reviewer": "newcomer", "position": "Cut it; it changes subject.", "quote": "counting the pews"},
            {"reviewer": "skeptic", "position": "Keep it; it shows what counting misses.", "quote": "a food pantry in its basement"}]},
        "argue": {"argument": "The memo is the subject; a second institution splits attention.", "concedes": "It is vivid.", "quotes": ["counting the pews", "not in the piece"]},
        "close": {"moved": "Both agree it is vivid.", "unresolved": "Whether a reader needs it.", "decision": "Is the piece about the memo or about counting?"},
    }

    def debate_route(self):
        return self.answer({**self.REVIEWS, **{f"step: {k}": v for k, v in self.STEPS.items()}})

    def test_runs_the_panel_first_then_argues_in_separate_calls(self):
        route = self.debate_route()
        self.llm.queue = [route] * 7
        done = self.go("method:debate")
        r = done["result"]
        self.assertEqual(done["status"], "done", done["message"])
        self.assertEqual(len(self.llm.calls), 7)  # three reviews, the frame, side A, side B, the close
        self.assertEqual([s["reviewer"] for s in r["sides"]], ["newcomer", "skeptic"])
        self.assertEqual(r["sides"][0]["passage"]["quote"], "counting the pews")
        self.assertEqual([q["quote"] for q in r["sides"][0]["quotes"]], ["counting the pews"])  # an unmatched quote is dropped
        self.assertEqual(r["close"]["decision"], "Is the piece about the memo or about counting?")
        self.assertIn("Side A (The newcomer) said:", self.llm.calls[5]["input"][0]["text"])  # B answers A
        self.assertIn("You speak for side B.", self.llm.calls[5]["input"][0]["text"])

    def test_starts_from_a_saved_panel(self):
        route = self.answer(self.REVIEWS)
        self.llm.queue = [route] * 3
        self.go("method:panel")
        self.llm.calls.clear()
        route = self.debate_route()
        self.llm.queue = [route] * 4
        done = self.go("method:debate")
        self.assertEqual(len(self.llm.calls), 4)
        self.assertIn('<review reviewer="skeptic"', self.llm.calls[0]["input"][0]["text"])
        self.assertEqual(done["status"], "done")

    def test_a_frame_that_names_no_real_reviewer_fails_plainly(self):
        route = self.answer({**self.REVIEWS, "step: frame": {"question": "?", "sides": [{"reviewer": "ghost", "position": "x", "quote": ""}] * 2}})
        self.llm.queue = [route] * 4
        done = self.go("method:debate")
        self.assertEqual((done["status"], done["code"]), ("failed", "unreadable"))
        self.assertTrue(plain(done["message"]))


class LessonsTest(MethodTest):
    def test_nothing_to_learn_until_the_writer_has_revised(self):
        e = self.refused("method:save")
        self.assertIn("own revisions", e.detail)

    def test_lessons_rest_on_the_writers_own_words_and_guidance_then_governs(self):
        body = self.piece["body"].replace("I think that might perhaps understate", "That understates")
        store.save_piece(self.piece["id"], body=body)
        self.piece["body"] = body
        run(api.post_decisions(self.piece["id"], {"items": [
            {"kind": "change", "original": "at close", "chosen": "at closing", "choice": "skipped"},
            {"kind": "nonsense", "original": "x", "chosen": "y", "choice": "kept"}]}))
        self.llm.queue = [{"summary": "You cut hedges by hand.", "lessons": [
            {"rule": "State the claim without stacked hedges.", "scope": "lasting", "section": "style", "evidence": "That understates", "why": "You cut three hedges."},
            {"rule": "Keep regional idiom.", "scope": "piece", "section": "voice", "evidence": "at close", "why": "You skipped the fix."},
            {"rule": "Invented.", "scope": "lasting", "section": "style", "evidence": "words the writer never wrote", "why": "?"}]}]
        r = self.go("method:save")["result"]
        self.assertEqual([(x["rule"], x["scope"]) for x in r["lessons"]],
                         [("State the claim without stacked hedges.", "lasting"), ("Keep regional idiom.", "piece")])
        self.assertEqual(r["counts"]["dropped"], 1)
        sent = self.llm.calls[0]["input"][0]["text"]
        self.assertIn("<earlier>", sent)
        self.assertIn('"at close" -> "at closing" (skipped)', sent)
        self.assertNotIn("nonsense", sent)
        rule = run(api.post_guidance({"section": "style", "text": r["lessons"][0]["rule"], "evidence": "That understates", "source": "lesson"}))
        with self.assertRaises(HTTPException):
            run(api.post_guidance({"section": "style", "text": rule["text"]}))  # kept once
        self.llm.queue = [{"summary": "ok", "findings": []}]
        self.go("pass:hedges")
        self.assertIn("State the claim without stacked hedges.", self.llm.calls[-1]["system_prompt"])  # the writer's guidance governs
        run(api.post_rule(rule["id"], {"status": "retired"}))
        self.assertEqual(run(api.get_guidance())["rules"], [])  # removed, never erased
        self.assertEqual(len(store.list_guidance(include_retired=True)), 1)


class GuidanceTest(MethodTest):
    def test_proposals_are_backed_by_quotes_from_the_samples(self):
        self.refused("method:onboarding")
        self.other("Letter", "You were nine and furious about the canoe. I still have the paddle.", voice=True)
        self.llm.queue = [{"summary": "Plain and dry.", "gaps": ["Nothing about audience."], "questions": ["Who reads you?", "a", "b", "c"], "proposals": [
            {"section": "voice", "rule": "Say the feeling plainly.", "quote": "furious about the canoe", "why": "Flat statement."},
            {"section": "made up", "rule": "End on an object.", "quote": "I still have the paddle.", "why": "Object."},
            {"section": "style", "rule": "Use semicolons.", "quote": "no sample says this", "why": "?"}]}]
        r = self.go("method:onboarding")["result"]
        self.assertEqual([(p["section"], p["sample_title"]) for p in r["proposals"]], [("voice", "Letter"), ("style", "Letter")])
        self.assertEqual(len(r["questions"]), 3)
        self.assertEqual(r["gaps"], ["Nothing about audience."])


class AcrossTest(MethodTest):
    def test_reads_two_to_five_pieces_and_pins_notes_in_each(self):
        e = self.refused("method:emergent")
        self.assertIn("two to five", e.detail)
        other = self.other("Notes on the zoning hearing", "The planning commission met on Tuesday. Nobody counted the people in the hall.")
        self.llm.queue = [{"summary": "Both are about counting.", "possibility": "A piece about what cities fail to count.", "gaps": ["A number"],
                           "decisions": ["Library or hearing first?"], "notes": [
                               {"piece": "P1", "quote": "None of them shows up in the memo.", "note": "The core."},
                               {"piece": "p2", "quote": "Nobody counted the people in the hall.", "note": "The same idea."},
                               {"piece": "P3", "quote": "anything", "note": "No such piece."}]}]
        r = self.go("method:emergent", pieces=[other["id"]])["result"]
        self.assertEqual([(n["label"], n["here"]) for n in r["notes"]], [("P1", True), ("P2", False)])
        self.assertEqual(r["notes"][1]["title"], "Notes on the zoning hearing")
        self.assertEqual([c["sent"] == c["total"] for c in r["coverage"]], [True, True])
        self.assertIn('<piece label="P2" title="Notes on the zoning hearing">', self.llm.calls[0]["input"][0]["text"])

    def test_a_long_piece_is_cut_short_and_says_so(self):
        big = self.other("Long", "word " * 30000)
        self.llm.queue = [{"summary": "s", "possibility": "p", "notes": [], "gaps": [], "decisions": []}]
        r = self.go("method:emergent", pieces=[big["id"]])["result"]
        long = next(c for c in r["coverage"] if c["title"] == "Long")
        self.assertLess(long["sent"], long["total"])
        self.assertIn("(cut short for length)", self.llm.calls[0]["input"][0]["text"])

    def test_too_many_or_trashed_pieces_are_refused(self):
        ids = [self.other(f"P{i}", "Words here.")["id"] for i in range(5)]
        self.assertIn("two to five", self.refused("method:emergent", pieces=ids).detail)
        store.trash_piece(ids[0])
        self.assertIn("trash", self.refused("method:emergent", pieces=ids[:1]).detail)


class HomeTest(MethodTest):
    def test_plan_then_exclusive_setup_that_never_changes_a_file(self):
        store.add_rule("voice", "Say the feeling plainly.", "furious about the canoe", "onboarding")
        self.other("Letter", "You were nine.", voice=True)
        plan = run(api.get_home_plan())
        paths = [f["path"] for f in plan["files"]]
        self.assertEqual(paths[:3], ["README.md", "VOICE.md", "STYLE.md"])
        self.assertIn("examples/Letter.md", paths)
        self.assertIn("drafts/The room nobody counts.md", paths)
        self.assertTrue(all(f["status"] == "create" for f in plan["files"]))
        done = run(api.post_home_setup({"fingerprint": plan["fingerprint"]}))
        self.assertEqual((sorted(done["created"]), done["kept"], done["failed"]), (sorted(paths), [], []))
        root = Path(done["folder"])
        self.assertIn("Say the feeling plainly.", (root / "VOICE.md").read_text())
        (root / "VOICE.md").write_text("my own edits")
        store.add_rule("style", "Short paragraphs.")
        with self.assertRaises(HTTPException) as cm:
            run(api.post_home_setup({"fingerprint": plan["fingerprint"]}))  # the plan the writer saw is stale
        self.assertEqual(cm.exception.status_code, 409)
        self.assertTrue(plain(cm.exception.detail))
        again = run(api.get_home_plan())
        self.assertEqual(again["create"], 0)  # STYLE.md is already there, so it is kept, not rewritten
        done = run(api.post_home_setup({"fingerprint": again["fingerprint"]}))
        self.assertEqual(done["created"], [])
        self.assertEqual((root / "VOICE.md").read_text(), "my own edits")

    def test_titles_never_escape_the_folder(self):
        self.other("../../etc/passwd", "x")
        self.other("../../etc/passwd", "y")
        paths = [f["path"] for f in run(api.get_home_plan())["files"]]
        self.assertIn("drafts/etc passwd.md", paths)
        self.assertIn("drafts/etc passwd (2).md", paths)
        self.assertFalse(any(".." in p for p in paths))


class MessagesTest(unittest.TestCase):
    def test_every_new_failure_message_is_plain(self):
        for text in library.NEEDS.values():
            self.assertTrue(plain(text), text)
            self.assertEqual(api._plain(ValueError(text)), text)  # reaches the writer as written


if __name__ == "__main__":
    unittest.main()
