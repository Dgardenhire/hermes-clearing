"""Lane B, Nov 8: the new kinds (ask, refine, explain, start, read), the three-call Rewrite with partial results,
real progress, the plugin-wide limit of three calls, name flags, Suggested text off, authorship spans, counts for
History, the stored sample read and GET /capabilities. Shapes: docs/SUGGEST-API.md."""
import asyncio
import json
import re
import unittest
from pathlib import Path

from _load import HTTPException, ROOT, Result, Usage, api, callwatch, fake_model, gateway, library, reset, run, sample, store

BODY = sample()["body"]
LAST = BODY[BODY.index("If the council wants"):]
BADGE = "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her"


class StaggeredLlm:
    """A fake model whose answer and delay depend on the call: ``plan(kw) -> (seconds, answer)``. Counts calls in flight."""

    def __init__(self, plan):
        self.plan, self.calls, self.inflight, self.peak = plan, [], 0, 0

    async def acomplete_structured(self, **kw):
        self.calls.append(kw)
        self.inflight += 1
        self.peak = max(self.peak, self.inflight)
        try:
            delay, answer = self.plan(kw)
            await asyncio.sleep(delay)
            if isinstance(answer, BaseException):
                raise answer
            callwatch.on_post_auxiliary_call(aux_task=kw.get("task") or "", finish_reason="stop", usage={"output_tokens": 50})
            return Result(json.dumps(answer), answer, Usage(o=50))
        finally:
            self.inflight -= 1


def use(llm):
    api.EDITOR = gateway.Editor(llm)
    return llm


class Base(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        self.piece = store.create_piece(sample()["title"], BODY)

    def start(self, target, **extra):
        return run(api.post_pass({"piece_id": self.piece["id"], "target": target, **extra}))

    def done(self, target, **extra):
        async def go():
            started = await api.post_pass({"piece_id": self.piece["id"], "target": target, **extra})
            if started["id"] in api._jobs:
                await api._jobs[started["id"]]
            return await api.get_pass(started["id"])
        return run(go())

    def refused(self, target, **extra):
        with self.assertRaises(HTTPException) as cm:
            self.start(target, **extra)
        return cm.exception.status_code, cm.exception.detail

    def sel(self, text):
        i = BODY.index(text)
        return {"start": i, "end": i + len(text)}


class AskTest(Base):
    def test_with_a_selection_three_options_and_only_the_writers_words_instruct(self):
        self.llm.queue = [{"options": [{"text": "Count who uses the room. Then decide who can do without it.", "move": "two orders"},
                                       {"text": LAST, "move": "same"},
                                       {"text": "Before the council cuts a day, it should count who sits in the room that day.", "move": "ends on the day"},
                                       {"text": "Let the council count the room first.", "move": "shorter"}]}]
        p = self.done("ask", instruction="make the ending land harder", selection=self.sel(LAST))
        self.assertEqual(p["status"], "done")
        r = p["result"]
        self.assertEqual(r["instruction"], "make the ending land harder")
        self.assertEqual(len(r["options"]), 3)
        self.assertTrue(all(o["how"] == o["move"] and o["how"] for o in r["options"]), "the room labels tiles from how")
        self.assertNotIn(LAST, [o["text"] for o in r["options"]])  # never the selection itself
        self.assertEqual(r["counts"]["dropped"], 1)
        sent = self.llm.calls[0]["input"][0]["text"]
        self.assertIn("<request>make the ending land harder</request>", sent)
        self.assertIn("[[" + LAST + "]]", sent)
        self.assertIn("only instruction", self.llm.calls[0]["system_prompt"])
        self.assertEqual(len(self.llm.calls), 1)  # exactly one call

    def test_without_a_selection_pinned_notes_and_an_answer_only_for_a_question(self):
        note = {"quote": BADGE, "change": "End the sentence on the nurse asleep, then let the reason follow on its own",
                "note": "Stop at nobody woke her.", "try": BADGE + "."}
        self.llm.queue = [{"answer": "Yes. One sentence buries the nurse. Split it. A fourth sentence.", "notes": [note]}]
        p = self.done("ask", instruction="Is the middle too slow?")
        r = p["result"]
        self.assertEqual(r["answer"], "Yes. One sentence buries the nurse. Split it.")  # at most three sentences
        self.assertEqual(r["notes"][0]["start"], BODY.index(BADGE))
        self.assertEqual(r["notes"][0]["change"], "End the sentence on the nurse asleep")  # cut where a phrase ends
        self.llm.queue = [{"answer": "Here is an answer nobody asked for.", "notes": [note]}]
        r = self.done("ask", instruction="make the middle move faster")["result"]
        self.assertNotIn("answer", r)

    def test_refused_inputs(self):
        self.assertEqual(self.refused("ask")[1], "Type what you want from the editor, then ask.")
        self.assertEqual(self.refused("ask", instruction="x" * 501)[1], "Keep your request under 500 characters.")
        self.assertEqual(self.llm.calls, [])


class RefineExplainTest(Base):
    def test_refine_with_a_chip_three_new_versions_never_the_current_one(self):
        cur = "A woman in a hospital badge slept for forty minutes by the window. Nobody woke her."
        self.llm.queue = [{"options": [{"text": cur, "move": "same"}, {"text": BADGE + ".", "move": "as you wrote it"},
                                       {"text": "A woman in a hospital badge slept in the reading chair for forty minutes, and nobody woke her.", "move": "moves the time"},
                                       {"text": "A woman in a hospital badge slept for forty minutes in the chair by the window; nobody woke her.", "move": "semicolon"}]}]
        p = self.done("refine", selection=self.sel(BADGE), current=cur, instruction="rhythm")
        r = p["result"]
        self.assertEqual(len(r["options"]), 3)
        self.assertNotIn(cur, [o["text"] for o in r["options"]])
        self.assertIn("Keep the writer's rhythm", self.llm.calls[0]["input"][0]["text"])
        self.assertEqual(store.get_piece(self.piece["id"])["body"], BODY)  # never touches the page

    def test_refine_and_explain_refusals(self):
        self.assertEqual(self.refused("refine", selection=self.sel(BADGE), instruction="shorter")[1], "Choose a version first, then ask.")
        self.assertEqual(self.refused("refine", selection=self.sel(BADGE), current="x", instruction="y" * 301)[1],
                         "Say how to change it in under 300 characters.")
        self.assertEqual(self.refused("explain", current="x")[1], "Select the passage first, then ask.")

    def test_explain_two_or_three_plain_sentences(self):
        self.llm.queue = [{"why": "## Why\n- Ending on Nobody woke her gives the image first.\n- The short sentence slows the paragraph. "
                                  "It lands. A fourth sentence that should go."}]
        r = self.done("explain", selection=self.sel(BADGE), current="x y z")["result"]
        self.assertEqual(r["why"], "Ending on Nobody woke her gives the image first. The short sentence slows the paragraph. It lands.")
        self.assertNotIn("#", r["why"])


class StartTest(Base):
    ANSWERS = {"who": "Neighbors and the council", "what": "Why our library should stay open on Saturdays",
               "know": "The council votes next month. Saturday is the busiest day."}

    def test_beats_and_openings_from_one_call_with_an_empty_page(self):
        blank = store.create_piece()
        self.piece = blank
        self.llm.queue = [{"beats": ["Open on the line.", "Say what the council decides, [the date of the vote].", "Who comes.", "What it costs.",
                                     "Answer the budget with [the savings].", "Close on the ask."],
                           "openings": [{"text": "On Saturday mornings the line starts before the doors open.", "how": "scene"},
                                        {"text": "Next month the council votes, says Mayor Holt.", "how": "decision"},
                                        {"text": "Ask the people at the printers why they came: [a reason].", "how": "a person"}]}]
        p = self.done("start", body="", answers=self.ANSWERS)
        self.assertEqual(p["status"], "done")
        r = p["result"]
        self.assertTrue(5 <= len(r["beats"]) <= 7)
        self.assertEqual(len(r["openings"]), 3)
        self.assertIn("[the date of the vote]", " ".join(r["beats"]))
        self.assertEqual(r["openings"][1]["unsupported"], ["'Mayor Holt'"])  # a name the answers never gave
        self.assertEqual(len(self.llm.calls), 1)
        self.assertEqual(p["words"], len(self.llm.calls[0]["input"][0]["text"].split()))

    def test_refusals(self):
        self.assertEqual(self.refused("start", answers={"who": "", "what": " ", "know": ""})[1],
                         "Answer at least one of the three questions, then start.")
        self.assertEqual(self.refused("start", answers={"who": "x" * 601})[1], "Keep each answer under 600 characters.")


def read_answer(**over):
    data = {"verdict": "Strong piece. The memo gets the last word on numbers. Name what the number counts.",
            "changes": [{"quote": "That number is real.", "change": "Say what the number counts", "why": "Real concedes.",
                         "try": "That number counts checkouts, and only checkouts."},
                        {"quote": "a line nobody wrote", "change": "Dropped", "why": "Not in the piece."},
                        {"quote": "I think that might perhaps understate what the building actually does", "change": "Cut the hedges",
                         "why": "Three doubts.", "try": "That understates what the building does"},
                        {"quote": "basically leverage", "change": "Use the plain verb", "why": "Memo language.", "try": "turn"},
                        {"quote": "The memo counts checkouts", "change": "A spare", "why": "Spare.", "try": "The memo counts only checkouts"}],
            "cut_first": {"quote": "It is important to note that", "why": "Starts sooner."},
            "holds": "The scenes hold."}
    data.update(over)
    return data


class ReadTest(Base):
    def test_verdict_three_pinned_changes_cut_first_and_counts(self):
        self.llm.queue = [read_answer()]
        p = self.done("read")
        r = p["result"]
        self.assertEqual(p["status"], "done")
        self.assertEqual([c["rank"] for c in r["changes"]], [1, 2, 3, 4])  # up to five shown (Loop 2 round 3)
        self.assertEqual(r["changes"][0]["change"], "Say what the number counts")
        self.assertEqual((r["changes"][0]["start"], r["changes"][0]["end"]), (1310, 1330))
        self.assertEqual(r["cut_first"]["quote"], "It is important to note that")
        self.assertNotIn("holds", r)
        self.assertFalse(r["verdict"].startswith("Strong"))  # never opens with praise
        self.assertLessEqual(len(re.findall(r"[.!?](?:\s|$)", r["verdict"])), 3)
        self.assertEqual(r["counts"]["dropped"], 1)
        self.assertEqual(p["counts"]["dropped"], 1)  # kept with the pass for History
        self.assertEqual(p["words"], len(BODY.split()))

    def test_a_cut_on_a_kept_change_keeps_the_cut_and_takes_a_standby(self):
        # Loop 1: cut_first was null on every real read; it quoted the words of a kept change
        self.llm.queue = [read_answer(cut_first={"quote": "basically leverage", "why": "Memo words."})]
        r = self.done("read")["result"]
        self.assertEqual(r["cut_first"]["quote"], "basically leverage")
        self.assertEqual([c["change"] for c in r["changes"]], ["Say what the number counts", "Cut the hedges", "A spare"])
        self.assertEqual([c["rank"] for c in r["changes"]], [1, 2, 3])
        self.assertIn("cut_first and keep are required", library.build_request(library.target("read"), "t", BODY)["system"])
        self.assertIn("how far down", library.build_request(library.target("read"), "t", BODY)["system"])

    def test_a_change_that_moves_words_to_the_top_never_rewrites_them_in_place(self):
        # Loop 2, the stored sample read as first made: the headline said open with the cut, the quote was the
        # paragraph-two sentence, and the try rewrote it where it stood, so Use this did the opposite of the headline
        para2 = "The city is now deciding whether to cut the branch to four days a week. The budget memo calls it a modest efficiency."
        moved = {"quote": para2, "change": "Open with the proposed cut", "why": "The news is buried in paragraph two.",
                 "try": "The city is now deciding whether to cut the Ninth Street branch library to four days a week. The budget memo calls it a modest efficiency."}
        first = BODY[:BODY.index(".") + 1]
        opening = {"quote": first, "change": "Open with the proposed cut", "why": "The news is buried in paragraph two.",
                   "try": "The city may cut the Ninth Street branch to four days a week. " + first}
        rest = [c for c in read_answer()["changes"] if c["quote"] != "a line nobody wrote"][:3]
        self.llm.queue = [read_answer(changes=[moved] + rest)]
        r = self.done("read")["result"]
        self.assertEqual(r["changes"][0]["change"], "Open with the proposed cut")
        self.assertEqual(r["changes"][0]["try"], "")  # no Show me that contradicts its own headline
        self.assertEqual(r["counts"]["misplaced"], 1)
        trim = {"quote": para2, "change": "Trim the news now stated up top", "why": "Said twice.", "try": "The budget memo calls the cut a modest efficiency."}
        self.llm.queue = [read_answer(changes=[opening, trim] + rest)]
        r = self.done("read")["result"]
        self.assertEqual(r["changes"][0]["start"], 0)
        self.assertTrue(r["changes"][0]["try"].startswith("The city may cut"))  # pinned at the opening, with its trim: kept
        self.assertEqual(r["changes"][1]["change"], "Trim the news now stated up top")
        # Round 5: a move whose news is still said further down, with no trim, gets one made in code, right after it
        self.llm.queue = [read_answer(changes=[opening] + rest)]
        r = self.done("read")["result"]
        self.assertEqual([c["change"] for c in r["changes"][:2]], ["Open with the proposed cut", "Trim what the new opening now says"])
        self.assertEqual(r["changes"][1]["quote"], "The city is now deciding whether to cut the branch to four days a week.")
        self.assertEqual(r["changes"][1]["try"], "")
        self.assertEqual(r["counts"]["paired_trim"], 1)
        self.assertNotIn("_made", r["changes"][1])
        self.llm.queue = [read_answer(changes=[trim] + rest)]
        r = self.done("read")["result"]
        self.assertNotIn("Trim the news now stated up top", [c["change"] for c in r["changes"]])
        letter = "Dear friends,\n\nIt has been quite a year at the pantry, and as the days get shorter I find myself counting.\n\nWe are moving."
        self.assertEqual(library.lead_zone(letter), (0, letter.index("\n\nWe are")))  # a salutation is not the opening
        self.assertFalse(library.moves_up("Lead the ask with the date and number"))
        self.assertFalse(library.moves_up("Put the date first in the sentence"))
        self.assertTrue(library.moves_up("Move the vote and the ask to the top"))
        self.assertIn("never the place it now sits", library.build_request(library.target("read"), "t", BODY)["system"])

    def test_guards_make_the_by_eye_failures_impossible(self):
        g = library.guard_try
        para = BODY.index("I think that might perhaps")
        # the sample's carried grammar error: the try goes
        q = "which is serve as the only public place within two miles"
        self.assertEqual(g("which is serve as the only public place nearby", q, BODY, "opinion", para), ("", ["grammar_carried"]))
        # an invented charge in an op-ed with no named source in the paragraph: the blank goes
        t, p = g("The budget memo calls it a modest efficiency. [The city's response to this charge, or that it declined to comment.]",
                 "The budget memo calls it a modest efficiency.", BODY, "opinion", BODY.index("The budget memo"))
        self.assertEqual((t, p), ("", ["invented_charge"]))
        # a source blank on the writer's own observation goes; one on a figure stays
        t, p = g("Most of the people in it, [by the writer's count], are not there for books.",
                 "It is important to note that most of the people in it are not there for books.", BODY, "opinion", 108)
        self.assertEqual(t, "Most of the people in it are not there for books.")
        self.assertEqual(p, ["firsthand_blank"])
        # a blank that stands for a word the sentence needs can't come out cleanly: the try goes
        self.assertIsNone(library.remove_blanks("it should [by your count] the people who use the room", library._SOURCE_BLANK))
        t, p = g("checkouts have fallen by a third in five years, [according to the source and years of this figure]",
                 "checkouts have fallen by a third in five years", BODY, "opinion", BODY.index("checkouts have fallen"))
        self.assertIn("[according to", t)
        # an added number becomes a blank; an allegation the piece never makes removes the try
        t, p = g("That number is real: 1,400 fewer checkouts a year.", "That number is real.", BODY, "opinion", 1310)
        self.assertEqual((t, p), ("That number is real: [the number] fewer checkouts a year.", ["added"]))
        self.assertEqual(g("The city failed to count the room.", "That number is real.", BODY, "opinion", 1310), ("", ["allegation"]))
        # the keep guard catches a paraphrased or partial quote, not only overlapping offsets
        keep = "a library that cannot hold a tired nurse for forty minutes has forgotten what it is supposed to hold"
        self.assertTrue(library.touches_keep("cannot hold a tired nurse for forty minutes", keep))
        self.assertFalse(library.touches_keep("It is important to note that", keep))
        self.assertEqual(library.read_problems({"genre": "opinion", "keep": None, "changes": [], "cut_first": None}, BODY), ["no_keep"])
        # the round 5 diagnosis: a cut in the keep's own sentence goes, though the offsets never touch
        self.llm.queue = [read_answer(keep={"quote": "A woman in a hospital badge slept for forty minutes in the reading chair by the window", "why": "x"},
                                      cut_first={"quote": "because the librarian on duty had decided long ago that sleep was one of the things the room was for", "why": "x"})]
        r = self.done("read")["result"]
        self.assertIsNone(r["cut_first"])
        self.assertEqual(r["counts"]["keep_sentence"], 1)

    def test_an_essay_change_can_be_a_cut_and_cuts_are_guarded(self):
        hedges = "I think that might perhaps understate what the building actually does"
        ch = [{"kind": "line", "cut": True, "quote": hedges, "change": "Cut the hedged claim", "why": "Fog.", "try": "ignored"},
              {"kind": "structure", "cut": True, "quote": "That number is real.", "change": "Cut the concession", "why": "x", "try": ""},
              {"kind": "structure", "cut": True, "quote": "basically leverage", "change": "Cut the jargon", "why": "x", "try": ""}]
        rest = [c for c in read_answer()["changes"] if c["quote"] not in ("a line nobody wrote", "That number is real.", "basically leverage")
                and not c["quote"].startswith("I think")]
        self.llm.queue = [read_answer(genre="opinion", changes=ch + rest)]
        r = self.done("read")["result"]
        cuts = [c for c in r["changes"] if c["cut"]]
        self.assertEqual([c["change"] for c in cuts], ["Cut the hedged claim", "Cut the concession"])  # at most two
        self.assertTrue(all(c["try"] == "" for c in cuts))
        self.assertTrue(all(c["cut"] is False for c in r["changes"] if not c in cuts))
        self.assertEqual(r["counts"]["cut_refused"], 1)
        self.llm.queue = [read_answer(genre="essay", changes=ch + rest)]  # an essay takes up to four
        self.assertEqual(len([c for c in self.done("read")["result"]["changes"] if c["cut"]]), 3)
        # a paragraph-sized cut needs hedges, borrowed authority or a moral; plain narrative over 32 words is refused
        self.assertTrue(library.big_cut_ok("I suppose it is possible that, in some ways, I may have been perhaps a little slow"))
        self.assertTrue(library.big_cut_ok("In conclusion, losing running taught me a lot about myself."))
        self.assertFalse(library.big_cut_ok("The chips came off the steel in blue curls, warm as pennies left on a dashboard, and I swept them up."))

    def test_a_letter_opens_on_its_move_and_takes_no_paragraph_cuts(self):
        first = BODY[:BODY.index(".") + 1]
        para2 = "The city is now deciding whether to cut the branch to four days a week. The budget memo calls it a modest efficiency."
        opening = {"kind": "structure", "quote": first, "change": "Open with the proposed cut", "why": "Buried.",
                   "try": "The city may cut the Ninth Street branch to four days a week. " + first}
        trim = {"kind": "structure", "quote": para2, "change": "Trim the news now stated up top", "why": "Twice.", "try": "The budget memo calls the cut a modest efficiency."}
        rest = [c for c in read_answer()["changes"] if c["quote"] != "a line nobody wrote"][:2]
        para = BODY[BODY.index("I think that might perhaps"):BODY.index("application.") + len("application.")]
        big = {"kind": "line", "cut": True, "quote": para, "change": "Cut the hedged claim", "why": "Fog, perhaps, might.", "try": ""}
        self.llm.queue = [read_answer(genre="letter", changes=rest + [big, opening, trim])]
        r = self.done("read")["result"]
        self.assertEqual([c["change"] for c in r["changes"][:2]], ["Open with the proposed cut", "Trim the news now stated up top"])
        self.assertNotIn("Cut the hedged claim", [c["change"] for c in r["changes"]])  # a paragraph cut is an essay's only...
        fog = "It seems possible that we might, in some sense, perhaps need to think about whether our current arrangement could potentially be somewhat less workable."
        self.assertTrue(library.hedge_paragraph(fog))  # ...or a paragraph of fog
        self.assertFalse(library.hedge_paragraph(para))
        self.assertEqual(r["counts"]["letter_move_first"], 1)

    def test_the_strongest_line_is_kept_and_nothing_touches_it(self):
        keep = {"quote": "I think that might perhaps understate what the building actually does", "why": "Holds the claim."}
        cut_on_keep = {"quote": "I think that might perhaps", "why": "Hedges."}
        self.llm.queue = [read_answer(keep=keep, cut_first=cut_on_keep)]
        r = self.done("read")["result"]
        self.assertEqual((r["keep"]["start"], r["keep"]["quote"]), (BODY.index(keep["quote"]), keep["quote"]))
        self.assertNotIn("Cut the hedges", [c["change"] for c in r["changes"]])  # the change on the keep is dropped
        self.assertEqual([c["change"] for c in r["changes"]], ["Say what the number counts", "Use the plain verb", "A spare"])
        self.assertIsNone(r["cut_first"])  # a cut on the keep goes too
        self.assertEqual(r["counts"].get("keep_overlap", 0) + r["counts"].get("keep_sentence", 0), 2)  # the change and the cut
        for c in r["changes"]:
            self.assertFalse(c["start"] < r["keep"]["end"] and c["end"] > r["keep"]["start"])
        self.llm.queue = [read_answer(keep={"quote": "a line nobody wrote", "why": "x"})]
        self.assertIsNone(self.done("read")["result"]["keep"])  # unpinnable: null

    def test_genre_is_one_word_from_the_list(self):
        self.llm.queue = [read_answer(genre="Personal essay")]
        self.assertEqual(self.done("read")["result"]["genre"], "essay")
        self.llm.queue = [read_answer(genre="op-ed")]
        self.assertEqual(self.done("read")["result"]["genre"], "opinion")
        self.llm.queue = [read_answer(genre="limerick")]
        self.assertIsNone(self.done("read")["result"]["genre"])
        self.assertEqual(library.genre_of("news"), "news")
        self.assertIn("genre", library.SCHEMAS["read"]["required"])

    def test_the_ending_always_gets_a_place_when_the_model_marked_it(self):
        sents = [m.group(0) for m in re.finditer(r"[A-Z][^.]{15,}\.", BODY)][:6]
        five = [{"kind": "line", "quote": q, "change": f"Change {i}", "why": "Because.", "try": q[:-1] + "!"} for i, q in enumerate(sents)]
        ending = {"kind": "structure", "quote": LAST, "change": "End on the ask", "why": "The ending trails off.", "try": "Count the room first."}
        self.llm.queue = [read_answer(changes=five[:5] + [ending], cut_first={"quote": "basically leverage", "why": "x"})]
        r = self.done("read")["result"]
        self.assertEqual(len(r["changes"]), 5)
        self.assertEqual(r["changes"][-1]["change"], "End on the ask")  # took the last line note's place
        self.assertEqual([c["rank"] for c in r["changes"]], [1, 2, 3, 4, 5])
        self.assertNotIn("_ending", r["changes"][0])
        self.assertEqual(r["counts"]["ending_kept"], 1)

    def test_a_slow_read_gets_one_twin_call_and_the_first_answer_wins(self):
        calls = []

        def plan(kw):
            calls.append(1)
            good = dict(genre="opinion", keep={"quote": "nobody woke her", "why": "x"})
            return (0.6, read_answer(**good)) if len(calls) == 1 else (0.02, read_answer(verdict="The twin answered. Name the count.", **good))
        use(StaggeredLlm(plan))
        old, api.HEDGE_AFTER = api.HEDGE_AFTER, 0.05
        try:
            p = self.done("read")
        finally:
            api.HEDGE_AFTER = old
        self.assertEqual(p["status"], "done")
        self.assertEqual(len(calls), 2)
        self.assertTrue(p["result"]["verdict"].startswith("The twin answered"))
        self.assertEqual(gateway.SLOTS.busy, 0)  # the slow call was stopped and gave its slot back

    def test_a_read_that_fails_its_checks_is_asked_once_more_before_it_shows(self):
        good = dict(genre="opinion", keep={"quote": "nobody woke her", "why": "Holds the scene."})
        self.llm.queue = [read_answer(), read_answer(**good)]  # the first has no genre and no keep
        old = dict(api.RETRIES)
        r = self.done("read")["result"]
        self.assertEqual(r["genre"], "opinion")
        self.assertEqual(r["counts"]["problems"], [])
        self.assertEqual(api.RETRIES["fired"] - old["fired"], 1)
        self.assertEqual(api.RETRIES["better"] - old["better"], 1)
        old = dict(api.RETRIES)
        self.llm.queue = [read_answer(**good)]
        self.done("read")
        self.assertEqual(api.RETRIES["fired"], old["fired"])  # a clean read is never asked twice

    def test_the_companion_trim_comes_right_after_the_move(self):
        first = BODY[:BODY.index(".") + 1]
        para2 = "The city is now deciding whether to cut the branch to four days a week."
        move = {"kind": "structure", "quote": first, "change": "Open with the proposed cut", "why": "The news is buried.",
                "try": "The city is now deciding whether to cut the branch to four days a week. " + first}
        trim = {"kind": "structure", "quote": para2, "change": "Trim the repeated news", "why": "Said twice now.", "try": "The cut is up for a vote."}
        rest = [c for c in read_answer()["changes"] if c["quote"] != "a line nobody wrote"][:3]
        self.llm.queue = [read_answer(changes=[move] + rest + [trim])]
        r = self.done("read")["result"]
        self.assertEqual([c["change"] for c in r["changes"][:2]], ["Open with the proposed cut", "Trim the repeated news"])
        self.assertEqual([c["rank"] for c in r["changes"]], [1, 2, 3, 4, 5])
        self.assertIn("ranked right after it", library.build_request(library.target("read"), "t", BODY)["system"])
        self.assertIn("declined to comment", library.build_request(library.target("read"), "t", BODY)["system"])

    def test_every_change_is_tagged_reporting_structure_or_line(self):
        ch = read_answer()["changes"]
        ch[0]["kind"] = "reporting"
        ch[2]["kind"] = "Structure"
        ch[3]["kind"] = "grammar"  # not one of the three: read from the change
        self.llm.queue = [read_answer(changes=ch)]
        r = self.done("read")["result"]
        self.assertEqual([c["kind"] for c in r["changes"]], ["reporting", "structure", "line", "line"])
        self.assertEqual(library.change_kind("", "Say where the figure comes from. No source the reader can check."), "reporting")
        self.assertEqual(library.change_kind(None, "Open with the vote. The news is buried."), "structure")
        self.assertEqual(library.change_kind("x", "Drop the hedges."), "line")
        self.assertIn("kind", library.SCHEMAS["read"]["properties"]["changes"]["items"]["required"])
        self.assertNotIn("query", library.SCHEMAS["read"]["properties"])

    def test_a_cut_clause_takes_its_leading_comma(self):
        clause = "in the same way that counting the pews would be the wrong way to measure a church that runs a food pantry in its basement"
        self.llm.queue = [read_answer(cut_first={"quote": clause, "why": "Restates the point."})]
        cut = self.done("read")["result"]["cut_first"]
        self.assertEqual(cut["quote"], ", " + clause)
        left = BODY[:cut["start"]] + BODY[cut["end"]:]
        self.assertIn("It is also the wrong number.", left)

    def test_fewer_than_three_needs_holds(self):
        two = read_answer()["changes"][:3]
        self.llm.queue = [read_answer(changes=two)]
        r = self.done("read")["result"]
        self.assertEqual(len(r["changes"]), 2)
        self.assertEqual(r["holds"], "The scenes hold.")
        self.llm.queue = [read_answer(changes=two, holds="")]
        p = self.done("read")
        self.assertEqual((p["status"], p["code"]), ("failed", "unreadable"))

    def test_praise_is_held_to_one_clause(self):
        # Loop 2 bench, a real verdict: a praise word inside a describing sentence keeps the sentence whole
        real = "The letter recounts a good year, then asks for moving-weekend volunteers and money on January 17 and 18."
        self.assertEqual(library.clean_verdict(real), real)
        self.assertEqual(library.clean_verdict("Great work, but the ending hedges. Cut the last line."),
                         "The ending hedges. Cut the last line. Great work.")
        self.assertEqual(library.clean_verdict("This is a vivid, compelling piece. It buries its claim. Move it up. Then cut."),
                         "It buries its claim. Move it up. Then cut.")
        self.assertEqual(library.clean_verdict("Lovely piece."), "")
        # Nov 11 live check: a praise sentence with a comma was cut to "The piece has a strong."
        self.assertEqual(library.clean_verdict("The piece has a strong, concrete closing line. It buries its claim."),
                         "It buries its claim. The piece has a strong, concrete closing line.")

    def test_tries_stripped_with_suggested_text_off(self):
        store.set_settings({"suggestions": False})
        self.llm.queue = [read_answer()]
        r = self.done("read")["result"]
        self.assertEqual([c["try"] for c in r["changes"]], ["", "", "", ""])
        self.assertEqual([c["unsupported"] for c in r["changes"]], [[], [], [], []])
        self.assertNotIn('"try": "', self.llm.calls[0]["system_prompt"])  # the answer format asks for no try

    def test_a_long_piece_reads_in_sections_three_at_a_time_with_partial_results(self):
        paras = [f"Paragraph {i} tells of the branch and Saturday number {i}. " + ("Words in the room keep going here. " * 20) for i in range(30)]
        body = "\n\n".join(paras)
        self.piece = store.create_piece("Long", body)
        parts = library.read_sections(body)
        self.assertGreater(len(parts), 3)
        self.assertTrue(all(body[a:b].strip() for a, b in parts))

        def plan(kw):
            text = kw["input"][0]["text"]
            m = re.search(r'section n="(\d+)"', text)
            if m:
                n = int(m.group(1))
                first = re.search(r"Paragraph \d+ tells", text).group(0)  # the section's own first paragraph
                return 0.05 * n, {"verdict": f"Section {n} hedges.", "changes": [
                    {"quote": first, "change": f"Fix paragraph {n}", "why": "It hedges.", "try": first + "!"}],
                    "cut_first": {"quote": "", "why": ""}, "holds": f"Section {n} holds."}
            return 0, {"verdict": "The piece circles. Name the claim.", "order": ["C2", "C1"], "cut_first": "", "holds": "The rest holds."}
        llm = use(StaggeredLlm(plan))
        seen = []

        async def go():
            started = await api.post_pass({"piece_id": self.piece["id"], "target": "read"})
            while started["id"] in api._jobs:
                v = await api.get_pass(started["id"])
                if v["status"] == "running" and v["result"]:
                    seen.append(v["sections"]["done"])
                await asyncio.sleep(0.02)
            return await api.get_pass(started["id"])
        p = run(go())
        self.assertEqual(p["status"], "done", p["message"])
        self.assertLessEqual(llm.peak, 3)  # never more than three calls at once
        self.assertTrue(seen and min(seen) < len(parts))  # partial results while sections were still out
        r = p["result"]
        self.assertTrue(r["ranked"])
        self.assertEqual(r["changes"][0]["change"], "Fix paragraph 2")  # the ranking call's order
        self.assertEqual(r["verdict"], "The piece circles. Name the claim.")
        self.assertEqual(len(r["sections"]), len(parts))
        self.assertEqual(p["sections"], {"done": len(parts), "total": len(parts)})


class RewriteTest(Base):
    def plan_for(self, delays, fail=None):
        def plan(kw):
            m = re.search(r"Rewrite a passage: ([a-z ]+)\.", kw["instructions"])
            move = m.group(1) if m else ""
            if fail and move in fail:
                return 0.01, fail[move]
            text = {"tighter": "A woman in a hospital badge slept forty minutes in the window chair, and nobody woke her",
                    "more concrete": "A nurse still in her hospital badge slept forty minutes in the window chair. Nobody woke her",
                    "a craft move": "In the reading chair by the window, a woman in a hospital badge slept for forty minutes, and nobody woke her"}.get(move)
            if text is None:  # the one-call fallback
                return 0.01, {"options": [{"text": "A woman slept forty minutes by the window, unwoken.", "move": "shorter"},
                                          {"text": "Nobody woke the woman in the hospital badge.", "move": "ends on her"},
                                          {"text": "She slept. Nobody woke her.", "move": "two beats"}]}
            return delays[move], {"text": text, "move": move}
        return plan

    def test_three_calls_publish_the_first_option_before_the_others(self):
        llm = use(StaggeredLlm(self.plan_for({"tighter": 0.02, "more concrete": 0.4, "a craft move": 0.4})))
        views = []

        async def go():
            started = await api.post_pass({"piece_id": self.piece["id"], "target": "rewrite", "selection": self.sel(BADGE)})
            while started["id"] in api._jobs:
                views.append(await api.get_pass(started["id"]))
                await asyncio.sleep(0.03)
            return await api.get_pass(started["id"])
        p = run(go())
        partial = [v for v in views if v["status"] == "running" and v["result"] and len(v["result"]["options"]) == 1]
        self.assertTrue(partial, "no view with one option in and two coming")
        self.assertEqual(partial[0]["result"]["pending"], 2)
        self.assertEqual(partial[0]["result"]["options"][0]["move"], "Tighter")
        self.assertEqual(partial[0]["phase"], "reading")
        self.assertEqual(p["status"], "done")
        self.assertEqual([o["move"] for o in p["result"]["options"]], ["Tighter", "More concrete", "A craft move"])
        self.assertEqual(len(llm.calls), 3)
        self.assertTrue(all(c["max_tokens"] == 1200 for c in llm.calls))
        self.assertFalse(p["fallback"])
        self.assertIsNone(p["phase"])

    def test_an_option_too_close_to_the_selection_or_a_sibling_is_retried_once(self):
        # Loop 1, real run on "The budget memo calls it a modest efficiency.": C only swapped one word
        self.assertTrue(library.too_close("The budget memo calls the cut a modest efficiency.", "The budget memo calls it a modest efficiency."))
        self.assertFalse(library.too_close("The budget memo: a modest efficiency.", "The budget memo calls it a modest efficiency."))
        self.assertFalse(library.too_close("The budget memo calls the cut to four days a week a modest efficiency.", "The budget memo calls it a modest efficiency."))
        seen = {"a craft move": 0}

        def plan(kw):
            m = re.search(r"Rewrite a passage: ([a-z ]+)\.", kw["instructions"])
            move = m.group(1) if m else ""
            if move == "a craft move":
                seen[move] += 1
                if seen[move] == 1:  # first answer: one word dropped from the selection
                    return 0.01, {"text": BADGE.replace(" for forty", " forty"), "move": "trims a word"}
                return 0.01, {"text": "Nobody woke the woman in the hospital badge, asleep forty minutes in the reading chair", "move": "ends on the chair"}
            return 0.01, {"text": {"tighter": "A woman in a hospital badge slept forty minutes in the window chair, and nobody woke her",
                                   "more concrete": "A nurse still in her hospital badge slept forty minutes in the window chair. Nobody woke her"}[move],
                          "move": move}
        llm = use(StaggeredLlm(plan))
        p = self.done("rewrite", selection=self.sel(BADGE))
        self.assertEqual(len(llm.calls), 4)  # three moves and one retry
        self.assertIn("too close", llm.calls[3]["instructions"])
        self.assertEqual([o["move"] for o in p["result"]["options"]], ["Tighter", "More concrete", "Ends on the chair"])

    def test_a_429_falls_back_to_one_call(self):
        llm = use(StaggeredLlm(self.plan_for({"tighter": 0.01, "more concrete": 0.3, "a craft move": 0.3},
                                             fail={"more concrete": RuntimeError("Error code: 429 - rate limit")})))
        p = self.done("rewrite", selection=self.sel(BADGE))
        self.assertEqual(p["status"], "done")
        self.assertTrue(p["fallback"])
        self.assertEqual(len(p["result"]["options"]), 3)
        self.assertEqual(len(llm.calls), 4)  # three sent at once (one stopped after the 429), then the one-call fallback

    def test_an_unknown_move_is_refused(self):
        self.assertEqual(self.refused("rewrite", selection=self.sel(BADGE), move="sparkle")[1], "Choose Rewrite, Tighten or Make it concrete.")


class SlotsTest(Base):
    def test_never_more_than_three_calls_in_flight(self):
        llm = use(StaggeredLlm(lambda kw: (0.05, {"summary": "Fine.", "findings": []})))
        reqs = [library.build_request(library.target("pass:weakest"), "t", BODY) for _ in range(8)]

        async def go():
            await asyncio.gather(*(api.EDITOR.ask(r) for r in reqs))
        run(go())
        self.assertEqual(llm.peak, 3)
        self.assertEqual(gateway.SLOTS.busy, 0)


class FlagsTest(unittest.TestCase):
    def test_numbers_names_and_quotes_are_flagged_and_sentence_capitals_are_not(self):
        f = library.unsupported
        self.assertEqual(f("That number is real: 1,400 fewer checkouts a year.", BODY), ["'1,400'"])
        self.assertEqual(f("The memo, said Mayor Holt, was \"a lifeline for the budget\".", BODY), ["'a lifeline for the budget'", "'Mayor Holt'"])
        self.assertEqual(f("Then the council voted. Every Saturday counts.", BODY), [])  # sentence-initial capitals
        self.assertEqual(f("Arturo printed it again on Ninth Street.", BODY), [])  # names the piece already has
        self.assertEqual(f("Arturo came back. Then Maria came.", BODY), ["'Maria'"])
        self.assertEqual(f("I think so.", BODY), [])


class OffTest(Base):
    def test_suggested_text_off_refuses_every_text_kind_and_allows_explain(self):
        store.set_settings({"suggestions": False})
        off = library.SUGGESTIONS_OFF
        self.assertEqual(self.refused("ask", instruction="harder", selection=self.sel(LAST)), (400, off))
        self.assertEqual(self.refused("refine", selection=self.sel(BADGE), current="x", instruction="shorter"), (400, off))
        self.assertEqual(self.refused("start", answers={"who": "a"}), (400, off))
        self.assertEqual(self.refused("rewrite", selection=self.sel(BADGE)), (400, off))
        self.assertEqual(self.refused("apply", selection=self.sel(BADGE), note="Cut it."), (400, off))
        self.assertEqual(self.llm.calls, [])
        self.llm.queue = [{"why": "It ends on the image. The reader sees her first."}]
        self.assertEqual(self.done("explain", selection=self.sel(BADGE), current="x")["status"], "done")
        self.llm.queue = [{"notes": [{"quote": BADGE, "change": "Split it", "note": "Split it.", "try": "Split. It."}]}]
        r = self.done("ask", instruction="split the long sentence")["result"]
        self.assertEqual(r["notes"][0]["try"], "")


class HeadlineTest(Base):
    def test_every_note_and_finding_carries_the_change(self):
        self.llm.queue = [{"summary": "One.", "findings": [{"quote": "That number is real.", "issue": "Say what it counts. It concedes."}]}]
        f = self.done("pass:weakest")["result"]["findings"][0]
        self.assertEqual(f["change"], "Say what it counts")
        self.llm.queue = [{"summary": "Read.", "question": "?", "notes": [{"quote": "That number is real.", "change": "Name the count.", "note": "x"}]}]
        n = self.done("method:reader")["result"]["notes"][0]
        self.assertEqual(n["change"], "Name the count")

    def test_findings_capped_at_twelve_with_tries(self):
        sents = [m.group(0) for m in re.finditer(r"[A-Z][^.]{15,}\.", BODY)][:15]
        self.llm.queue = [{"summary": "Many.", "findings": [{"quote": q, "issue": f"Cut {i}.", "try": q[:-1] + "!"} for i, q in enumerate(sents)]}]
        r = self.done("pass:weakest")["result"]
        self.assertEqual(len(r["findings"]) + len(r["more"]), 12)  # 12 kept with tries, 3 of them walked
        req = library.build_request(library.target("pass:weakest"), "t", BODY)
        self.assertEqual(req["max_tokens"], 9000)
        self.assertIn("At most 12 findings", req["system"])
        self.assertEqual(library.MAX_TOKENS["wording"], 600)


class Loop2ChecksTest(Base):
    """Loop 2, from the real Loop 1 strings (premium-plan/clearing/loop1/real/real-answers.json)."""

    def test_a_possessive_of_a_name_the_piece_has_is_not_flagged(self):
        t = "The branch has no counter for Arturo's fourth r\u00e9sum\u00e9, or the sisters' corner table, or the chair by the window."
        self.assertEqual(library.unsupported(t, BODY), [])
        self.assertEqual(library.unsupported("The branch has no counter for Arturo\u2019s r\u00e9sum\u00e9.", BODY), [])
        self.assertEqual(library.unsupported("Then Maria's chair stayed empty.", BODY), ["'Maria'"])  # a new name still is
        # Loop 2 real ask: a quoted blank is the writer's to fill, not an invented quote
        t = 'That number is real. But last year [the figure you have] people visited, and the head librarian, [name], put it this way: "[the line from the head librarian]."'
        self.assertEqual(library.unsupported(t, BODY), [])
        # a blank is the writer's to fill: nothing inside brackets is flagged, even a hint with years
        self.assertEqual(library.unsupported("checkouts have fallen by a third, [according to the source, 2019 to 2024]", BODY), [])
        self.assertEqual(library.unsupported('She said "we count every visitor" and 1,400 came.', BODY), ["'we count every visitor'", "'1,400'"])

    def test_headline_is_a_complete_phrase_of_sixty_characters_or_fewer(self):
        h = library.headline
        cut = h("Move this sentence to open the paragraph with the memo's phrase in")  # Loop 1, cut mid-phrase at 12 words
        self.assertEqual(cut, "Move this sentence to open the paragraph")
        for raw in ["Move this sentence to open the paragraph with the memo's phrase in quotation marks",
                    "Replace the abstract phrase about the community with the specific people the piece already names",
                    "State the claim plainly and drop the hedges and jargon", "Say what the number counts."]:
            out = h(raw)
            self.assertLessEqual(len(out), 60)
            self.assertTrue(raw.startswith(out))
            self.assertNotIn(out.split()[-1].lower(), {"with", "the", "a", "and", "to", "of", "in", "memo's"})
        self.assertEqual(h("Say what the number counts."), "Say what the number counts")

    def test_the_walk_is_the_three_best_ranked_and_the_rest_wait(self):
        sents = [m.group(0) for m in re.finditer(r"[A-Z][^.]{15,}\.", BODY)][:7]
        self.llm.queue = [{"summary": "Seven.", "findings": [{"quote": q, "issue": f"Cut {i}.", "try": q[:-1] + "!"} for i, q in enumerate(reversed(sents))]}]
        r = self.done("pass:weakest")["result"]
        self.assertEqual(len(r["findings"]), 3)
        self.assertEqual(sorted(f["rank"] for f in r["findings"]), [1, 2, 3])
        self.assertEqual([f["quote"] for f in sorted(r["findings"], key=lambda f: f["rank"])], list(reversed(sents))[:3])
        self.assertEqual([f["start"] for f in r["findings"]], sorted(f["start"] for f in r["findings"]))  # page order
        self.assertEqual(sorted(f["rank"] for f in r["more"]), [4, 5, 6, 7])


class SpansTest(Base):
    def test_spans_saved_returned_kept_per_version_and_restored(self):
        pid = self.piece["id"]
        new = BODY.replace("That number is real.", "That number counts checkouts, and only checkouts.")
        at = new.index("That number counts")
        span = {"start": at, "end": at + 49, "pass_id": "p1", "kind": "read", "model": "m"}
        run(api.post_save(pid, {"body": new, "spans": [span, {"start": 5, "end": 99999, "pass_id": "x"}, "junk"]}))
        self.assertEqual(run(api.get_piece(pid))["spans"], [span])  # the one outside the body is dropped
        v = run(api.post_version(pid, {"reason": "suggestion"}))["version"]
        self.assertEqual(run(api.get_version(v["id"]))["spans"], [span])
        run(api.post_save(pid, {"body": new + " More.", "spans": []}))
        self.assertEqual(run(api.get_piece(pid))["spans"], [])
        restored = run(api.post_version_restore(pid, v["id"]))
        self.assertEqual((restored["body"], restored["spans"]), (new, [span]))
        run(api.post_save(pid, {"body": "Short."}))  # spans absent: kept, but only those the body still holds
        self.assertEqual(run(api.get_piece(pid))["spans"], [])

    def test_at_most_two_thousand(self):
        body = "x" * 5000
        spans = [{"start": i, "end": i + 1, "pass_id": "p", "kind": "k", "model": "m"} for i in range(2500)]
        self.assertEqual(len(store.clean_spans(spans, body)), 2000)

    def test_history_lists_passes_with_counts(self):
        self.llm.queue = [read_answer()]
        self.done("read")
        h = run(api.get_versions(self.piece["id"]))["passes"]
        self.assertEqual((h[0]["kind"], h[0]["title"], h[0]["counts"]["dropped"]), ("read", "Read my piece", 1))


class SampleReadTest(unittest.TestCase):
    def setUp(self):
        reset()
        fake_model()

    def test_a_stored_read_is_seeded_only_when_it_passes_the_live_checks(self):
        data = sample()
        changes = [c for c in read_answer()["changes"] if c["quote"] != "a line nobody wrote"]
        good = dict(read_answer(verdict="The memo gets the last word on numbers. Name what the number counts.", changes=changes),
                    made_by="bench-model", made_on="2026-11-09")
        p = store.create_piece(data["title"], data["body"], sample=True)
        stored = api._seed_read(p, dict(data, sample_read=good))
        self.assertTrue(stored["sample"])
        self.assertEqual(len(stored["result"]["changes"]), 4)
        bad = dict(good, verdict="Wonderful piece. Name the count.")  # opens with praise
        self.assertIsNone(api._seed_read(p, dict(data, sample_read=bad)))
        self.assertIsNone(api._seed_read(p, dict(data, sample_read=dict(good, made_by=""))))  # no model named: not real output

    def test_state_carries_the_sample_read(self):
        state = run(api.get_state())
        self.assertIn("sample_read", state)
        shipped = json.loads((ROOT / "library" / "sample.json").read_text(encoding="utf-8")).get("sample_read")
        self.assertIsNotNone(shipped, "Loop 2 ships a real sample read (premium-plan/clearing/loop2/bench)")
        sr = state["sample_read"]
        self.assertIsNotNone(sr, "the shipped sample read failed its own seed checks")
        self.assertTrue(sr["sample"])
        self.assertEqual(sr["status"], "done")
        ranks = [c["rank"] for c in sr["result"]["changes"]]
        self.assertEqual(ranks, list(range(1, len(ranks) + 1)))
        self.assertTrue(library.READ_MIN <= len(ranks) <= library.READ_KEEP)
        self.assertTrue(all(c["kind"] in library.KINDS for c in sr["result"]["changes"]))
        k = sr["result"]["keep"]
        self.assertTrue(k and k["quote"])
        for c in sr["result"]["changes"] + [sr["result"]["cut_first"]]:
            self.assertFalse(c["start"] < k["end"] and c["end"] > k["start"])  # nothing touches the keep
        self.assertTrue(sr["result"]["cut_first"] and sr["result"]["cut_first"]["quote"])
        self.assertTrue(sr["model"])
        self.assertRegex(sr["result"]["made_on"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(sr["result"]["made_by"], shipped["made_by"])


class CapabilitiesTest(Base):
    def test_matches_what_this_process_can_do(self):
        saved = (api.dictation.plan, api.runtime.web_tool_available)
        try:
            api.dictation.plan = lambda: {"ready": False}
            api.runtime.web_tool_available = lambda: False
            c = run(api.get_capabilities())
            self.assertEqual(c, {"web_reader": False, "dictation": {"available": False, "local": False}, "pdf": True, "docx": True,
                                 "suggestions": True})
            api.dictation.plan = lambda: {"ready": True, "local": False, "label": "OpenAI"}
            api.runtime.web_tool_available = lambda: True
            store.set_settings({"suggestions": False})
            c = run(api.get_capabilities())
            self.assertEqual(c["dictation"], {"available": True, "local": False, "service": "OpenAI"})
            self.assertTrue(c["web_reader"])
            self.assertFalse(c["suggestions"])
        finally:
            api.dictation.plan, api.runtime.web_tool_available = saved

    def test_web_tool_absent_here(self):
        api.runtime.set_context(None)
        self.assertFalse(api.runtime.web_tool_available())  # no Hermes registry in tests, no context

    def test_dispatch_prefers_the_context(self):
        class Ctx:
            def __init__(self):
                self.calls = []

            def dispatch_tool(self, name, args):
                self.calls.append((name, args))
                return json.dumps({"results": []})
        ctx = Ctx()
        api.runtime.set_context(ctx)
        try:
            api.runtime.dispatch_web({"urls": ["https://example.com"]})
            self.assertEqual((ctx.calls[0][0], api.runtime.last_path), ("web_extract", "context"))
        finally:
            api.runtime.set_context(None)


class PageStringsTest(unittest.TestCase):
    """E10: strings Python sends to the page say what happens, not where; no "tokens"."""

    def test_no_where_words_in_page_strings(self):
        bad = re.compile(r"on this computer|No model\.|runs on this computer|\btokens?\b", re.I)
        texts = list(gateway.MESSAGES.values()) + list(library.NEEDS.values()) + [library.SUGGESTIONS_OFF]
        add = json.loads((ROOT / "library" / "additions.json").read_text(encoding="utf-8"))

        def walk(v):
            if isinstance(v, str):
                yield v
            elif isinstance(v, dict):
                for k, x in v.items():
                    if k != "prompt":  # prompts go to the model, not the page
                        yield from walk(x)
            elif isinstance(v, list):
                for x in v:
                    yield from walk(x)
        texts += list(walk(add))
        for mod in ("dictation", "home", "intake", "store", "docx", "pdf", "library", "gateway"):
            src = (ROOT / f"{mod}.py").read_text(encoding="utf-8")
            # the sentences raised to the page and the message constants (docstrings and comments are not sent)
            texts += re.findall(r'Error\(\s*\(?\s*f?"([^"\n]{12,})"', src)
            texts += re.findall(r'^[A-Z_]+ = \(?\s*"([^"\n]{12,})"', src, re.M)
        hits = [t for t in texts if bad.search(t)]
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()
