"""opps1, Nov 9: Find figures of speech and Where to add a technique. The model proposes only the anchors (quotes), the library ids
and the why; names and definitions come from the library; ids and anchors are checked in code and anything that
doesn't match is dropped. Results are kept per piece version. Show me runs the existing apply flow, Try it the coach."""
import json
import unittest

from _load import HTTPException, api, fake_model, library, reset, run, sample, store

BODY = sample()["body"]
ANAPHORA = "Every Saturday morning the branch library on Ninth Street opens at ten, and every Saturday there is a line."
TRICOLON = "the printers, the Wi-Fi and the one quiet room in the neighborhood that does not charge anyone to sit down"
ARTURO = "A man named Arturo printed the same résumé four times because the shelter's address kept changing."
HEDGE = "It is important to note that most of the people in it are not there for books."
KEEP = "It is also the wrong number, in the same way that counting the pews would be the wrong way to measure a church that runs a food pantry in its basement."
ADDITIONS = json.loads((library.ROOT / "additions.json").read_text(encoding="utf-8"))


def figure_def(name):
    return next(f[1] for g in ADDITIONS["figures"]["groups"] for f in g["figures"] if f[0] == name)


class Base(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        self.piece = store.create_piece(sample()["title"], BODY)

    def done(self, target, piece=None, **extra):
        p = piece or self.piece

        async def go():
            started = await api.post_pass({"piece_id": p["id"], "target": target, **extra})
            if started["id"] in api._jobs:
                await api._jobs[started["id"]]
            return started, await api.get_pass(started["id"])
        return run(go())

    def sel(self, text):
        i = BODY.index(text)
        return {"start": i, "end": i + len(text)}


class LibraryTest(unittest.TestCase):
    def test_both_build_short_prompts_that_carry_the_library(self):
        s = sample()
        ctx = {"guidance": [{"section": "voice", "text": "Short sentences when the news is bad."}]}
        figs = library.build_request(library.target("figures"), s["title"], s["body"], None, dict(ctx))
        opps = library.build_request(library.target("opportunities"), s["title"], s["body"], None, dict(ctx))
        for r in (figs, opps):
            self.assertIn("never hand back a revised version", r["system"])
            self.assertIn("Short sentences when the news is bad.", r["system"])
            self.assertLess(len(r["system"]) // 4, 4000)
            self.assertIn(s["body"], r["input"])
        self.assertIn("- anaphora: Successive clauses that open on identical words.", figs["system"])
        self.assertIn("- method:specificity: Find the specific and surprising", opps["system"])
        self.assertIn("- craft:true-nonfiction:17: Build a litany or paired accumulation (Shape true nonfiction)", opps["system"])
        self.assertIn("- figure:tricolon:", opps["system"])
        self.assertNotIn("method:panel", opps["system"])  # whole-piece methods are not opportunities on one passage
        self.assertNotIn("craft:true-nonfiction:1:", opps["system"])  # nor whole-piece diagnoses

    def test_items_come_from_the_library_files(self):
        items = {x["id"]: x for x in library.opportunity_items()}
        self.assertEqual(sum(x["type"] == "figure" for x in items.values()), 44)
        self.assertEqual(items["figure:tricolon"]["definition"], figure_def("tricolon"))
        self.assertEqual(items["figure:tricolon"]["name"], "Tricolon")
        methods = {m["id"]: m for m in json.loads((library.ROOT / "methods.json").read_text())["methods"]}
        self.assertEqual(items["method:hook"]["name"], methods["hook"]["title"])
        self.assertEqual(items["method:hook"]["definition"], methods["hook"]["description"])
        self.assertEqual(items["craft:human-story:arc-2"]["name"], ADDITIONS["story"]["focuses"][1]["title"])
        self.assertIsNone(library.library_item("method:panel"))
        self.assertIsNone(library.library_item("figure:zeugmatic"))

    def test_simile_and_metaphor_are_in_the_library(self):
        self.assertEqual(library.library_item("figure:simile")["group"], "Image, sense & substitution")
        self.assertEqual(library.library_item("figure:metaphor")["definition"], figure_def("metaphor"))


class FiguresCheckTest(unittest.TestCase):
    def test_pins_real_figures_and_drops_what_does_not_match(self):
        data = {"figures": [
            {"figure": "anaphora", "quote": ANAPHORA, "works": True, "why": "The repeated opening sets a ritual."},
            {"figure": "Tricolon", "quote": TRICOLON, "works": True, "why": "The third part is longest and carries the point."},
            {"figure": "simile", "quote": "counting the pews would be the wrong way to measure a church", "works": True, "why": "The church makes the count look wrong."},
            {"figure": "figure:litotes", "quote": "does not charge anyone to sit down", "works": True, "why": "Overlaps the tricolon."},  # overlap
            {"figure": "zeugmatic", "quote": "The budget memo calls it a modest efficiency.", "works": True, "why": "x"},  # not in the library
            {"figure": "antithesis", "quote": "the words are not in the piece at all", "works": True, "why": "x"},  # no anchor
            {"figure": "hyperbaton", "quote": "None of them shows up in the memo.", "works": False, "why": "The word order is ordinary, so there is no unexpected arrangement."},
            {"figure": "epistrophe", "quote": "The budget memo calls it a modest efficiency.", "works": True, "why": "It ends on its key word."},  # no repeat
            {"figure": "paradox", "quote": "That number is real.", "works": True, "why": ""},  # no why
        ]}
        out = library.check("figures", data, BODY)
        self.assertEqual([f["id"] for f in out["figures"]], ["figure:anaphora", "figure:tricolon", "figure:simile"])
        for f in out["figures"]:
            self.assertEqual(BODY[f["start"]:f["end"]], f["quote"])
            self.assertEqual(f["definition"], library.library_item(f["id"])["definition"])
        self.assertEqual(out["figures"][0]["name"], "Anaphora")
        c = out["counts"]
        self.assertEqual((c["returned"], c["matched"], c["dropped"], c["unknown_id"], c["unmatched"], c["not_there"]), (9, 3, 6, 1, 2, 2))

    def test_a_figure_that_does_not_land_is_kept_with_works_false(self):
        out = library.check("figures", {"figures": [{"figure": "pleonasm", "quote": "It is important to note that", "works": False,
                                                    "why": "The phrase adds length without weight and slows the opening."}]}, BODY)
        self.assertFalse(out["figures"][0]["works"])

    def test_nothing_matching_fails_and_an_empty_list_is_fine(self):
        with self.assertRaisesRegex(ValueError, "unmatched"):
            library.check("figures", {"figures": [{"figure": "anaphora", "quote": "not in the piece", "works": True, "why": "x"}]}, BODY)
        self.assertEqual(library.check("figures", {"figures": []}, BODY)["figures"], [])
        with self.assertRaisesRegex(ValueError, "unreadable"):
            library.check("figures", {"notes": []}, BODY)

    def test_the_repetition_family_needs_a_repeat_in_the_words(self):
        self.assertTrue(library.repeats("We came for the books. We came for the heat.", "figure:anaphora"))
        self.assertFalse(library.repeats("Every Thursday for twenty-two years, someone had leaned an inch toward me", "figure:epistrophe"))
        self.assertTrue(library.repeats("The people who decide what counts are rarely counted.", "figure:polyptoton"))
        self.assertFalse(library.repeats("who uses the room before it decides who can do without it", "figure:polyptoton"))


class OppsCheckTest(unittest.TestCase):
    def data(self, *opps, keep=KEEP):
        return {"keep": {"quote": keep}, "opportunities": list(opps)}

    def test_ranked_pinned_and_named_from_the_library(self):
        out = library.check("opps", self.data(
            {"id": "method:economy", "quote": HEDGE, "why": "The throat-clearing delays the claim."},
            {"id": "craft:true-nonfiction:17", "quote": ARTURO, "why": "The Saturday portraits could build as a litany."},
            {"id": "tricolon", "quote": "None of them shows up in the memo.", "why": "Could rise in three beats."},  # a bare figure name counts
            {"id": "method:panel", "quote": "The budget memo calls it a modest efficiency.", "why": "x"},  # not an opportunity item
            {"id": "craft:made-up:9", "quote": "That number is real.", "why": "x"},  # no such id
            {"id": "method:specificity", "quote": "It is also the wrong number", "why": "Touches the strongest line."},  # keep
            {"id": "method:hook", "quote": "nowhere in the piece", "why": "x"},  # no anchor
        ), BODY)
        ops = out["opportunities"]
        self.assertEqual([o["id"] for o in ops], ["method:economy", "craft:true-nonfiction:17", "figure:tricolon"])
        self.assertEqual([o["rank"] for o in ops], [1, 2, 3])
        self.assertEqual(ops[1]["name"], "Build a litany or paired accumulation")
        self.assertEqual(ops[1]["group"], "Shape true nonfiction")
        self.assertEqual(ops[2]["definition"], figure_def("tricolon"))
        self.assertEqual(out["keep"]["quote"], KEEP)
        c = out["counts"]
        self.assertEqual((c["unknown_id"], c["keep_overlap"], c["unmatched"], c["dropped"]), (2, 1, 1, 4))

    def test_no_item_twice_and_one_cut_at_most(self):
        out = library.check("opps", self.data(
            {"id": "method:economy", "quote": HEDGE, "why": "The throat-clearing delays the claim."},
            {"id": "method:economy", "quote": "I think that might perhaps understate what the building actually does", "why": "Hedges."},
            {"id": "method:tracks", "quote": "None of them shows up in the memo.", "why": "Scaffolding."},
            {"id": "craft:true-nonfiction:8", "quote": ARTURO, "why": "Arturo gets one sentence."}), BODY)
        self.assertEqual([o["id"] for o in out["opportunities"]], ["method:economy", "craft:true-nonfiction:8"])
        self.assertEqual((out["counts"]["repeat"], out["counts"]["cut_cap"]), (1, 1))
        self.assertEqual([o["family"] for o in out["opportunities"]], ["cut", "story"])

    def test_the_list_spans_figure_story_and_structure_when_the_model_offers_them(self):
        quotes = [s.strip() + "." for s in BODY.replace("\n", " ").split(".") if len(s.split()) > 4][:12]
        detail = ["method:specificity", "method:analogy", "method:objections", "method:simplify", "method:mom", "method:reader",
                  "craft:true-nonfiction:5", "craft:true-nonfiction:20", "craft:true-nonfiction:17"]
        ops = [{"id": i, "quote": q, "why": "Here."} for i, q in zip(detail + ["figure:tricolon", "craft:human-story:arc-2", "method:bluf"], quotes)]
        out = library.check("opps", self.data(*ops, keep=""), BODY)
        got = out["opportunities"]
        self.assertEqual(len(got), library.OPPS_MAX)
        self.assertTrue({"figure", "story", "structure"} <= {o["family"] for o in got})
        self.assertEqual([o["rank"] for o in got], list(range(1, 9)))
        self.assertEqual(got[0]["id"], "method:specificity")

    def test_a_figure_spot_found_on_the_same_words_is_not_proposed_again(self):
        spotted = library.check("figures", {"figures": [{"figure": "anaphora", "quote": ANAPHORA, "works": True, "why": "A ritual."}]}, BODY)["figures"]
        out = library.check("opps", self.data({"id": "figure:anaphora", "quote": ANAPHORA, "why": "Repeat the opening."},
                                              {"id": "figure:tricolon", "quote": ANAPHORA, "why": "Make it three."}), BODY, None, {"spotted": spotted})
        self.assertEqual([o["id"] for o in out["opportunities"]], ["figure:tricolon"])
        self.assertEqual(out["counts"]["already_used"], 1)

    def test_only_unknown_ids_is_an_empty_result_not_a_failure(self):
        out = library.check("opps", self.data({"id": "method:nonesuch", "quote": HEDGE, "why": "x"}), BODY)
        self.assertEqual(out["opportunities"], [])
        with self.assertRaisesRegex(ValueError, "unmatched"):
            library.check("opps", self.data({"id": "method:economy", "quote": "not here", "why": "x"}), BODY)


class RoutesTest(Base):
    FIGS = {"figures": [{"figure": "anaphora", "quote": ANAPHORA, "works": True, "why": "The repeated opening sets a ritual."}]}

    def test_one_result_per_piece_version(self):
        self.llm.queue = [self.FIGS, self.FIGS]
        s1, p1 = self.done("figures")
        self.assertEqual(p1["status"], "done")
        self.assertEqual(len(self.llm.calls), 1)
        s2, p2 = self.done("figures")
        self.assertTrue(s2["cached"])
        self.assertEqual(s2["id"], p1["id"])
        self.assertEqual(len(self.llm.calls), 1)  # the same words: no second call
        _, p3 = self.done("figures", body=BODY + "\n\nOne more line.")
        self.assertNotEqual(p3["id"], p1["id"])
        self.assertEqual(len(self.llm.calls), 2)  # new words: a new read
        self.assertIsNone(store.cached_pass(self.piece["id"], "figures", library.version_key("other words")))

    def test_selection_is_ignored_and_the_whole_piece_is_read(self):
        self.llm.queue = [self.FIGS]
        _, p = self.done("figures", selection=self.sel(HEDGE))
        self.assertIsNone(p["selection"])
        self.assertIn(BODY, self.llm.calls[0]["input"][0]["text"])

    def test_opportunities_know_what_spot_found_on_this_version(self):
        self.llm.queue = [self.FIGS, {"keep": {"quote": KEEP}, "opportunities": [
            {"id": "figure:anaphora", "quote": ANAPHORA, "why": "Repeat the opening."},
            {"id": "method:economy", "quote": HEDGE, "why": "The throat-clearing delays the claim."}]}]
        self.done("figures")
        _, p = self.done("opportunities")
        self.assertEqual([o["id"] for o in p["result"]["opportunities"]], ["method:economy"])
        self.assertEqual(p["counts"]["dropped"], 1)

    def test_a_thin_list_is_asked_for_once_more(self):
        thin = {"keep": {"quote": KEEP}, "opportunities": [{"id": "method:economy", "quote": HEDGE, "why": "Cut the windup."}]}
        full = {"keep": {"quote": KEEP}, "opportunities": [
            {"id": "craft:true-nonfiction:8", "quote": ARTURO, "why": "Arturo gets one sentence."},
            {"id": "figure:tricolon", "quote": "None of them shows up in the memo.", "why": "Could rise in three."},
            {"id": "method:hook", "quote": ANAPHORA, "why": "The opening could start with the line."},
            {"id": "method:economy", "quote": HEDGE, "why": "Cut the windup."}]}
        self.llm.queue = [thin, full]
        _, p = self.done("opportunities")
        self.assertEqual(len(self.llm.calls), 2)
        self.assertEqual(len(p["result"]["opportunities"]), 4)

    def test_show_me_builds_the_note_from_the_library_and_keeps_the_guards(self):
        self.llm.queue = [{"text": "A man named Arturo printed the same résumé four times. He [what he said as the last copy came out].", "how": "a detail"}]
        _, p = self.done("apply", selection=self.sel(ARTURO), item="craft:true-nonfiction:8", why="Arturo gets one sentence.", note="ignored")
        sent = self.llm.calls[0]["input"][0]["text"]
        item = library.library_item("craft:true-nonfiction:8")
        self.assertIn(item["name"], sent)
        self.assertIn(item["definition"].rstrip("."), sent)
        self.assertIn("Arturo gets one sentence.", sent)
        self.assertIn("bracketed blank", sent)
        self.assertNotIn("ignored", sent)
        self.assertEqual(p["status"], "done")
        self.assertIn("[what he said", p["result"]["text"])
        # A name the piece doesn't have is flagged, as for every suggestion.
        self.llm.queue = [{"text": "A man named Arturo Diaz printed the same résumé four times.", "how": "a name"}]
        _, p = self.done("apply", selection=self.sel(ARTURO), item="craft:true-nonfiction:8", why="x")
        self.assertTrue(p["result"]["unsupported"])

    def test_show_me_may_cut_for_an_opportunity_and_only_then(self):
        self.llm.queue = [{"text": "", "how": "Cut the throat-clearing sentence."}]
        _, p = self.done("apply", selection=self.sel(HEDGE), item="method:economy", why="It delays the claim.")
        self.assertEqual(p["status"], "done")
        self.assertTrue(p["result"]["cut"])
        self.assertEqual(p["result"]["text"], "")
        self.llm.queue = [{"text": "", "how": "Cut it."}]
        _, p = self.done("apply", selection=self.sel(HEDGE), note="Cut the windup.")
        self.assertEqual(p["status"], "failed")

    def test_show_me_refuses_an_item_the_library_does_not_have(self):
        with self.assertRaises(HTTPException) as cm:
            run(api.post_pass({"piece_id": self.piece["id"], "target": "apply", "selection": self.sel(HEDGE), "item": "method:nonesuch", "why": "x"}))
        self.assertEqual(cm.exception.status_code, 400)


class CoachTest(Base):
    def coach(self, **extra):
        b = {"piece_id": self.piece["id"], "item": "figure:anaphora", "quote": ANAPHORA, "why": "A ritual.",
             "line": "Every Saturday the doors open, every Saturday the line forms, every Saturday the room fills.", **extra}
        return run(api.post_coach(b))

    def test_questions_never_wording(self):
        self.llm.queue = [{"reply": 'Partly: "every Saturday the line forms" builds the ritual. Try "every Saturday the chairs fill by noon" instead. '
                                    "What should the reader feel by the third clause? Which word carries the weight?"}]
        r = self.coach()
        self.assertNotIn("chairs fill by noon", r["text"])  # a rewrite in quotation marks goes
        self.assertIn('"every Saturday the line forms"', r["text"])  # the writer's own words stay
        self.assertTrue(r["text"].endswith("?"))
        sent = self.llm.calls[0]
        self.assertIn("never write, rewrite, complete or suggest wording", sent["system_prompt"])
        self.assertIn(library.library_item("figure:anaphora")["definition"], sent["input"][0]["text"])

    def test_a_reply_that_does_not_end_on_a_question_gets_one(self):
        self.llm.queue = [{"reply": "Yes, the repeat holds."}]
        self.assertTrue(self.coach()["text"].endswith("?"))

    def test_refusals(self):
        for extra, code in (({"item": "method:nonesuch"}, 400), ({"quote": "not in the piece"}, 400), ({"line": "Two words"}, 400),
                            ({"line": "x " * 700}, 400)):
            with self.assertRaises(HTTPException) as cm:
                self.coach(**extra)
            self.assertEqual(cm.exception.status_code, code, extra)
        self.assertEqual(len(self.llm.calls), 0)

    def test_guard_unit(self):
        g = library.coach_guard
        self.assertEqual(g('Not yet. Write "the room fills with people by noon" next. What is the weight?', "my own line here", "q"),
                         "Not yet. What is the weight?")
        self.assertTrue(g("", "a b c", "q").endswith("?"))


if __name__ == "__main__":
    unittest.main()
