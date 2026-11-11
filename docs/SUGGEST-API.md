# The Clearing: the suggestion API (lane B contract)

Sunday Nov 8, 2026, lane B (editor). Branch `loop1-editor`, from `damon-notes` at `a5669cb`. This is the contract
lanes A (room) and C (surfaces) build against tonight. Field names are the product owner's (`lanes/editor-brief.md`)
unless a line under "Changes" says otherwise.

**Changes after this file was first committed** (dated, newest first; never a silent change):

- Nov 9, 1:35 AM CT, Loop 2 round 3: Read my piece gains `keep` and `kind`, shows up to 5 changes, and drops
  `query` (section 7, rules). Shape for the room: `premium-plan/clearing/loop2/bench/SHAPE.md`.
- Nov 9, 12:40 AM CT, Loop 2 follow-up (additions only): **Read my piece** results carry `query`, one
  fact-checker's question pinned to the writer's words, `{quote, start, end, question}` or `null`, beside the three
  changes and never in place of one (whole-piece reads; sectioned reads and the stored sample read have none).
  A change whose headline brings words to the top ("Open with ...", "Move ... to the top") must quote the opening
  (through the first paragraph of 12 words or more); pinned anywhere else it keeps its headline and why but its
  `try` is `""` (`counts.misplaced`), so its card offers Go to these words, not a Show me that contradicts it.
  `cut_first` of a clause includes its leading `", "`.
- Nov 9, Loop 2, branch `loop2-editor` (additions, one budget change, no field renamed or removed):
  - **Findings passes (`findings` kind, run alone: Find weak sentences and every editor pass) carry `rank`** on every
    finding, 1 = most important (the model's own order). The result's `findings` is now **the walk: the three
    best-ranked, in page order**; the rest are in a new `more` list (page order, ranks 4 and up) for a "More notes"
    fold the room may show later. The panel's reviewers are not capped (they don't run through this path).
    Read my piece already ranked (`changes[].rank`, at most three shown).
  - **`change` (the headline) is a complete phrase of at most 60 characters and 12 words.** A longer one is cut where
    a phrase ends (before "with", "and", "then", a comma), never mid-phrase, and never ends on "with", "the" or a
    possessive. The model is asked for at most 9 words.
  - **`how` stays, permanently,** on every `rewrite`, `ask` and `refine` option, equal to `move`. The room reads
    `how`; new code may read either.
  - **Distinct options.** A Rewrite or Ask option that is nearly the selection or a sibling is dropped
    (`library.too_close`: at most one of the original's words touched and at most two added, or 95% of characters
    shared). Each Rewrite slot that lands too close is asked once more ("change the shape of the sentence"), so a
    Rewrite can make four to six calls. `refine` (Change it) is exempt: a "Shorter" or "Keep my rhythm" version is
    close by design. Move labels are sentence case ("Ends on the key word").
  - **`unsupported`** no longer flags a possessive of a name the piece has ("Arturo's"), nor a quoted blank left for
    the writer ("[the line from the head librarian]").
  - **Read my piece:** `cut_first` is required, and when the model's cut overlaps a kept change, the cut stays and the
    next standby change takes that change's place (on Loop 1's real reads `cut_first` was always `null`). The prompt
    starts with structure (where the news is, how far down), names hedges and soft endings, and ties every problem
    the verdict names to a change. The verdict keeps a describing sentence whole ("The letter recounts a good year,
    then asks ..." used to lose its subject). Answer budget 9,000 tokens (a real 1,300-word read was cut off at 6,000).
  - **`sample_read` ships** (section 12): a real `claude-sonnet-5-5` read of the sample through the plugin's routes,
    Nov 8, 2026. `GET /state` returns it on a fresh profile; a profile seeded before Loop 2 keeps its sample without it.
- Nov 8, 9:15 PM CT (additions only, no field renamed or removed): every `rewrite` option also carries `how`, equal to
  `move`, so the page built before tonight keeps its labels; read `move`. Each Rewrite option also passed the same
  `unsupported` check as before. A 429 during the three Rewrite calls means four calls in all (three sent at once, the
  ones still out stopped, then the one-call fallback); `fallback: true` says so. `GET /state` carries `sample_read`
  (section 12) as a full pass view (`null` at that time; Loop 2 ships one).

**Names that differ from the brief, and why:**

- The brief's branch name is `clearing-editor`; the workflow that started this lane named it `loop1-editor`. Same
  lane, same files. The room lane merges `loop1-editor`.
- Each entry of `unsupported` is the exact string the card shows after `Adds something your piece doesn't say: `,
  already in quotes: `'1,400'`, not `1,400`. Join several with `, `.
- Every option and note carries `unsupported` (the brief's minimum). `start` openings carry it too.

Nothing here is a new route for a kind. Every kind runs through the pass flow the page already uses.

---

## 1. The pass flow (unchanged, with new fields)

`POST /api/plugins/clearing/passes` starts a pass and returns at once. The page polls `GET /passes/{id}` about once
a second until `status` is not `running`. `POST /passes/{id}/stop` stops it.

**Request body (every kind):**

```json
{
  "piece_id": "string",
  "target": "string",
  "title": "string, optional (defaults to the stored title)",
  "body": "string, optional (defaults to the stored body); the text the offsets below count in",
  "selection": {"start": 0, "end": 0},
  "note": "string, Show me only",
  "pieces": ["piece ids, Read across only"],

  "instruction": "string, ask (500 chars) and refine (300 chars or a chip id)",
  "current": "string, refine and explain: the option on screen",
  "answers": {"who": "string", "what": "string", "know": "string"},
  "move": "tighten | concrete, rewrite only"
}
```

Offsets are JavaScript string indexes (UTF-16 code units) into `body`. Python counts code points, so they agree for
the sample and any text without emoji or other characters outside the Basic Multilingual Plane. Characters outside it
are rare in prose; the page should not send a selection that splits one.

**`GET /passes/{id}`** returns:

```json
{
  "id": "string", "piece_id": "string", "target": "string", "title": "string", "kind": "string",
  "status": "running | done | failed | stopped",
  "result": "object or null (see each kind; while running it may hold partial results)",
  "code": "null, or an error code (section 9)",
  "message": "null, or the sentence to show (section 9)",
  "model": "string", "provider": "string",
  "tokens_in": 0, "tokens_out": 0, "finish_reason": "string or null",
  "elapsed": 0.0,
  "selection": {"start": 0, "end": 0},
  "body_length": 0,
  "step": "string or null (the panel and debate's named step, as before)",

  "phase": "sending | reading | checking | null",
  "words": 0,
  "sections": {"done": 0, "total": 0},
  "fallback": false,
  "sample": false,
  "counts": {"returned": 0, "matched": 0, "dropped": 0, "praise": 0, "cut_off": 0}
}
```

New fields:

| Field | Meaning |
|---|---|
| `phase` | Set by the server when that step actually starts. `sending`: the pass is built and waiting for a free model slot (at most three calls run at once in the whole plugin). `reading`: a model call is in flight. `checking`: the answer is back and is being pinned to the writer's words. `null` once the pass ends. |
| `words` | Words sent to the model: the selection's words, or the whole piece's (for `start`, the three answers'). |
| `sections` | Only for a sectioned `read` (over 1,500 words). `done` sections out of `total`. Absent otherwise. |
| `fallback` | `true` when a three-call Rewrite fell back to one call after a 429. |
| `sample` | `true` only on the stored sample read (section 7). The page labels it; the backend sends no label text. |
| `counts` | The same counts as `result.counts`, kept with the pass for History, plus `cut_off` (calls in this pass that stopped early). |

Lane C's progress view shows only `phase`, `words`, `sections` and `elapsed`. It never invents a step or a percentage.

**Suggested text: Off** (`POST /settings {"suggestions": false}`). The backend enforces it whatever the page does:

| Kind | With Suggested text off |
|---|---|
| `rewrite` (any `move`), `refine`, `start`, `apply`, `wording`, `openings`, `flip`, `draft`, `next`, `endings`, `titles` | Refused: HTTP 400 with the Suggested-text-off message (section 9). No model call. |
| `ask` with a `selection` | Refused the same way. |
| `ask` without a selection | Runs. Every note's `try` is `""` and its `unsupported` is `[]`. |
| `read` | Runs. Every change's `try` is `""` and its `unsupported` is `[]`. |
| `explain` | Runs (it explains; it adds no text). |
| every note and findings pass | Runs. Every `try` is `""`. |

---

## 2. `ask`: Ask the editor (target `ask`)

Only the writer's typed `instruction` is an instruction. The piece goes to the model as material inside tags.

**Request, with a selection** (the last paragraph selected):

```json
{"piece_id": "p1", "target": "ask", "instruction": "make the ending land harder",
 "selection": {"start": 1714, "end": 1824}}
```

One model call. **Done:**

```json
{
  "status": "done", "kind": "ask", "phase": null, "words": 22,
  "result": {
    "instruction": "make the ending land harder",
    "selection": {"start": 1714, "end": 1824, "text": "If the council wants to save money, it should count who uses the room before it decides who can do without it."},
    "options": [
      {"text": "Before the council cuts a day, it should count who sits in the room on that day.", "move": "ends on the day itself", "unsupported": []},
      {"text": "If the council wants to save money, let it count the room first: the printer queue, the corner table, the chair by the window.", "move": "ends on the room's own details", "unsupported": []},
      {"text": "Count who uses the room. Then decide who can do without it.", "move": "two short orders", "unsupported": []}
    ],
    "counts": {"returned": 3, "matched": 3, "dropped": 0}
  }
}
```

**Request, without a selection:**

```json
{"piece_id": "p1", "target": "ask", "instruction": "Is the middle too slow?"}
```

**Done.** `answer` is present only when the instruction is a question, and is at most three sentences:

```json
{
  "status": "done", "kind": "ask",
  "result": {
    "instruction": "Is the middle too slow?",
    "answer": "Yes, in one place. The third paragraph's last sentence carries the whole argument in one breath and buries the nurse.",
    "notes": [
      {"quote": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her",
       "start": 874, "end": 981,
       "change": "End the sentence on the nurse asleep",
       "note": "Stop at 'nobody woke her.' The librarian's reasoning can be its own sentence; the image lands first.",
       "try": "A woman in a hospital badge slept for forty minutes in the reading chair by the window. Nobody woke her.",
       "unsupported": []}
    ],
    "counts": {"returned": 1, "matched": 1, "dropped": 0, "praise": 0}
  }
}
```

**While running** (both forms): `{"status": "running", "phase": "reading", "words": 343, "result": null}`.

Rules: `instruction` is required, trimmed, at most 500 characters. The selection's options are checked like
Rewrite's (section 6): never the selection itself, never two the same, at most twice the selection's length plus
200 characters.

---

## 3. `refine`: Change it (target `refine`)

Three new versions of the option on screen. Never touches the page.

**Request** (`instruction` is a chip id `shorter`, `plainer` or `rhythm`, or the writer's own words, at most 300 characters):

```json
{"piece_id": "p1", "target": "refine", "selection": {"start": 874, "end": 981},
 "current": "A woman in a hospital badge slept for forty minutes by the window. Nobody woke her.",
 "instruction": "rhythm"}
```

Chips: `shorter` = fewer words, every fact kept. `plainer` = everyday words, a simpler sentence shape. `rhythm` = keep
the writer's rhythm: the sentence length and cadence of the writer's own words around the passage.

**Done:**

```json
{
  "status": "done", "kind": "refine",
  "result": {
    "instruction": "rhythm",
    "current": "A woman in a hospital badge slept for forty minutes by the window. Nobody woke her.",
    "selection": {"start": 874, "end": 981, "text": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her"},
    "options": [
      {"text": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her.", "move": "one long breath, as you wrote it", "unsupported": []},
      {"text": "A woman in a hospital badge slept in the reading chair for forty minutes, and nobody woke her.", "move": "keeps the long line, moves the time", "unsupported": []},
      {"text": "A woman in a hospital badge slept for forty minutes in the chair by the window; nobody woke her.", "move": "a semicolon holds the pause", "unsupported": []}
    ],
    "counts": {"returned": 3, "matched": 3, "dropped": 0}
  }
}
```

Options are never `current`, never the selection, never two the same.

---

## 4. `explain`: Why? (target `explain`)

**Request:**

```json
{"piece_id": "p1", "target": "explain", "selection": {"start": 874, "end": 981},
 "current": "A woman in a hospital badge slept for forty minutes in the reading chair by the window. Nobody woke her."}
```

**Done.** `why` is two or three plain sentences, with no headings and no list marks (the server strips them and
keeps at most three sentences):

```json
{
  "status": "done", "kind": "explain",
  "result": {
    "current": "A woman in a hospital badge slept for forty minutes in the reading chair by the window. Nobody woke her.",
    "selection": {"start": 874, "end": 981, "text": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her"},
    "why": "Ending on 'Nobody woke her' gives the reader the image before the reason for it. The short second sentence also slows the paragraph at the moment the room matters most."
  }
}
```

---

## 5. `start`: Start from an idea (target `start`)

One call, no interview call before it. `body` may be empty.

**Request** (each answer at most 600 characters; at least one must have words):

```json
{"piece_id": "p2", "target": "start", "body": "",
 "answers": {"who": "Neighbors who use the branch and the council members voting on its hours",
             "what": "Why our library should stay open on Saturdays",
             "know": "The council votes next month. Saturday is the busiest day. People come for printers and Wi-Fi."}}
```

**Done.** 5 to 7 beats and exactly 3 openings. Any fact the answers don't give is a bracketed blank, such as
`[the date of the vote]`:

```json
{
  "status": "done", "kind": "start", "words": 37,
  "result": {
    "beats": [
      "Open on a Saturday morning at the branch: the line before the doors open.",
      "Say what the council is deciding, and when: [the date of the vote].",
      "Show who comes on Saturdays and what for: printers, Wi-Fi, a quiet place.",
      "Name what a Saturday closure would cost those people.",
      "Answer the budget argument with [the savings the city expects].",
      "Close on what you want the council to do."
    ],
    "openings": [
      {"text": "On Saturday mornings the line outside our branch starts before the doors open.", "how": "opens on the scene", "unsupported": []},
      {"text": "Next month the council votes on whether our library closes on Saturdays, its busiest day.", "how": "opens on the decision", "unsupported": []},
      {"text": "Ask the people at the printers on a Saturday why they came, and you will hear [a reason a patron gave you].", "how": "opens on a person, with a blank to fill", "unsupported": []}
    ]
  }
}
```

---

## 6. `rewrite` (changed): Rewrite, Tighten, Make it concrete (target `rewrite`)

**Request.** No `move` is the selection bar's Rewrite (three moves). `move: "tighten"` or `move: "concrete"` is a
single-move button: one call, three versions of that move.

```json
{"piece_id": "p1", "target": "rewrite", "selection": {"start": 874, "end": 981}}
{"piece_id": "p1", "target": "rewrite", "selection": {"start": 874, "end": 981}, "move": "tighten"}
```

**Rewrite without `move`: three calls at once, one per move** (tighter; more concrete; one named craft move), each
about 1,200 output tokens. Each option is published to the pass as it lands, so the page fills tile A while B and C
are still coming. On a 429 from any call, the calls still out are stopped and one call asks for the missing options;
the pass then carries `"fallback": true`.

**Partial (running), one option in:**

```json
{
  "status": "running", "kind": "rewrite", "phase": "reading", "words": 21,
  "result": {
    "selection": {"start": 874, "end": 981, "text": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her"},
    "options": [
      {"text": "A woman in a hospital badge slept forty minutes in the window chair, and nobody woke her", "move": "tighter", "unsupported": []}
    ],
    "pending": 2
  }
}
```

**Done:**

```json
{
  "status": "done", "kind": "rewrite", "phase": null, "fallback": false,
  "result": {
    "selection": {"start": 874, "end": 981, "text": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her"},
    "options": [
      {"text": "A woman in a hospital badge slept forty minutes in the window chair, and nobody woke her", "move": "tighter", "unsupported": []},
      {"text": "A nurse, still in her hospital badge, slept for forty minutes in the reading chair by the window, and nobody woke her", "move": "more concrete", "unsupported": []},
      {"text": "In the reading chair by the window, a woman in a hospital badge slept for forty minutes, and nobody woke her", "move": "ends on the key words", "unsupported": []}
    ],
    "pending": 0,
    "counts": {"returned": 3, "matched": 3, "dropped": 0}
  }
}
```

Every option has `move` (a short plain label) and `unsupported`. Options keep the order their move has (tighter,
concrete, craft), not the order they landed in, so a tile never jumps; while running, `options` holds the ones in so
far in that order and `pending` the number still coming. If one call fails (not a 429) the pass is `done` with the
options that came back and `pending: 0`; if every call fails the pass fails with the first call's code.

---

## 7. `read`: Read my piece (target `read`)

A mode of the note pass: the same pinning, the same praise filter. No new route.

**Request:** `{"piece_id": "p1", "target": "read"}` (a `selection` reads that passage only).

**Done** (the sample piece):

```json
{
  "status": "done", "kind": "read", "phase": null, "words": 343,
  "result": {
    "verdict": "The piece makes its case with real people, then hands the memo the last word on numbers. Name what the memo's number counts and what it misses, and the argument closes. The second paragraph hedges where it should claim.",
    "changes": [
      {"rank": 1, "kind": "line", "quote": "That number is real.", "start": 1310, "end": 1330,
       "change": "Say what the number counts",
       "why": "'Real' concedes the memo's ground without saying what the number measures, so the turn that follows has nothing to push against.",
       "try": "That number counts checkouts, and only checkouts.", "unsupported": []},
      {"rank": 2, "quote": "I think that might perhaps understate what the building actually does", "start": 428, "end": 497,
       "change": "Cut the three hedges and claim it",
       "why": "'I think', 'might' and 'perhaps' stack three doubts on the piece's main claim.",
       "try": "That understates what the building does", "unsupported": []},
      {"rank": 3, "quote": "basically leverage", "start": 575, "end": 593,
       "change": "Trade the business verb for the plain one",
       "why": "'Leverage' is memo language in a piece arguing against the memo.",
       "try": "turn", "unsupported": []}
    ],
    "cut_first": {"quote": "It is important to note that", "start": 108, "end": 136,
                  "why": "The sentence starts sooner without it."},
    "counts": {"returned": 5, "matched": 4, "dropped": 1, "praise": 0}
  }
}
```

**Fewer than three changes** (only when fewer survive pinning, or the model found fewer worth making). `holds` is
then required and says why the rest of the piece holds:

```json
{"changes": [{"rank": 1, "...": "..."}, {"rank": 2, "...": "..."}],
 "holds": "The scenes in the third paragraph already carry the argument; changing them would trade a person for a summary."}
```

Rules, enforced in code (`library.check_read`):
- `verdict` is at most three sentences and never opens with praise. Praise is held to one clause: a sentence that only
  praises is cut to its first clause and moved last; a first sentence that opens on a praising clause loses that clause.
- `change` is the headline, a complete phrase of at most 60 characters (cut where a phrase ends; section 8).
- A change whose quote can't be pinned to the writer's words exactly once is dropped and counted in `counts.dropped`.
  So is a `cut_first` that can't be pinned (then `cut_first` is `null`).
- **Up to 5 changes shown** (Loop 2 round 3; was 3), ranked 1 to N by how much each changes the piece, in the model's
  order after drops. The model is asked for up to seven so a dropped one is replaced by the next (`READ_KEEP = 5`).
- Fewer than three changes and no `holds` line from the model: the pass fails as `unreadable` (`READ_MIN = 3`).
- **`kind`** on every change: `"reporting"` (no source, no date or origin, a quote with no speaker, a charge never put
  to the person accused, facts that contradict each other, an ask with no way to act), `"structure"` (order, buried
  news, the ending, a paragraph doing two jobs) or `"line"` (hedges, jargon, a grammar error, a stock phrase). A value
  outside the three is read from the change's words (`library.change_kind`), default `"line"`.
- **`keep`** `{quote, start, end, why}`: the strongest line, pinned like a change; `null` only when the model gave
  none or its quote can't be pinned. No shown change and no `cut_first` overlaps it: an overlapping change is dropped
  and the next standby takes its place, an overlapping cut is dropped; both are counted in `counts.keep_overlap` (and
  `counts.dropped`).
- Every change carries a `try`, a reporting one with a bracketed blank for the missing source, date or speaker
  (`unsupported` never flags text inside brackets). The exception is a change that brings words to the top but is
  pinned outside the opening: its `try` is `""` (`counts.misplaced`). The model is asked to pair such a change with a
  second one, pinned where the news sat before, that trims it so the piece does not say it twice; that trim is always ranked right after the move (`library.companion_next`), so Next change after Use this reaches it. A charge a named source makes that the accused never answers is a top-ranked `reporting` change whose try carries a blank for the response.
- `query` (added and removed on Nov 9): a reporting question is now a `kind: "reporting"` change with a try.
- **`genre`**: `"news"`, `"opinion"`, `"letter"`, `"essay"`, `"fiction"` or `null` (`library.genre_of` maps the model's
  word). The read weighs by it: an essay on voice, the turn, its heart, the ending and borrowed authority (cut, not
  sourced), with no reporting change unless a factual claim about another person needs checking; a letter's missing
  way to act outranks sourcing a figure; fiction is never asked for sources.
- **The ending keeps a place**: when the model marked a change on the last paragraph but ranked it past five, code
  gives it the last line note's place (`counts.ending_kept`).
- **`cut`** (round 6) on every change: `true` means Use this deletes the quoted words (a whole paragraph takes its
  blank line with it), and `try` is `""`. At most two cuts per read, or four when `genre` is `"essay"`, besides
  Cut this first. A cut over 32 words is allowed only for a passage with two or more hedges, borrowed authority (a
  study, figure, expert, magazine) or a moral (the plain prompt's winning essay cuts were exactly these). A cut never
  touches the keep or the keep's sentence. Outside an essay (round 7), a paragraph-sized cut is allowed only for a
  paragraph of fog (four or more hedges, one word in ten). In a letter, code puts the change that brings the news up
  first, and the way to act is asked for as one change. A change with `try: ""` and `cut: false` stays Go to these words.
- **Guards in code** (round 5, `library.READ_GUARDS`). Every try passes `library.guard_try`:
  - a number, name or quote the piece doesn't have becomes a blank (`[the figure]`, `[the name]`, `[the exact words]`);
  - an accusation the piece never makes removes the try;
  - outside news, a "response / declined to comment" blank with no named source in that paragraph comes out;
  - a source blank on the writer's own observation (no number, quote or claim word) comes out;
  - a carried "is serve" error removes the try.

  A blank comes out with the commas that set it off, or the whole try goes. A change whose whole point a guard
  removed is dropped. The keep is protected by its words (a shared run of four content words, or 30% of its words)
  as well as its offsets, and a cut in the keep's own sentence goes. A cut over 32 words goes, and so does a cut inside
  an opening a move rewrites. A move whose news is still said further down, with no trim, gets a trim made in code:
  the repeating sentence, right after the move, with `try: ""`. A trim with no move goes. Counts: `added`,
  `allegation`, `invented_charge`, `firsthand_blank`, `grammar_carried`, `cut_long`, `keep_sentence`, `paired_trim`,
  `unpaired`.
- **Quiet retry**: `counts.problems` lists what `library.read_problems` still finds after the guards (`[]` when
  clean). A read with problems whose first answer took under 35 s (`plugin_api.RETRY_UNDER`) is asked once more
  before anything shows; the result with fewer problems ships.
- **One call, with a twin**: a read of 1,500 words or fewer is one call. Still out at 45 s (`plugin_api.HEDGE_AFTER`),
  the same request goes out again, and the first answer back wins (`HEDGES` counts how often). No partial result
  while it runs; long pieces keep the sectioned partials above.
- No change survives pinning: the pass fails as `unmatched`.

**Pieces over 1,500 words** are read in sections of about 900 words (whole paragraphs), at most three sections at
once (the plugin-wide limit). Each section's changes appear in `result.sections` as they land. Then one short call
ranks the candidates and writes the verdict (`phase: "reading"` again, `sections.done == sections.total`).

**Partial (running), a 2,400-word piece, one of three sections in:**

```json
{
  "status": "running", "kind": "read", "phase": "reading", "words": 2400, "sections": {"done": 1, "total": 3},
  "result": {
    "sections": [
      {"n": 1, "start": 0, "end": 5210, "status": "done",
       "changes": [{"rank": 1, "quote": "...", "start": 120, "end": 168, "change": "...", "why": "...", "try": "...", "unsupported": []}]},
      {"n": 2, "start": 5212, "end": 10480, "status": "reading", "changes": []},
      {"n": 3, "start": 10482, "end": 15020, "status": "reading", "changes": []}
    ],
    "pending": 2
  }
}
```

**Done** (sectioned): the same shape as the short read, plus `"sections": [...]` with every section `done` (or
`failed`, with its `code`), and `"ranked": true` (`false` when the ranking call failed and the server ranked the
candidates itself: each section's first change in piece order, then each section's second, and so on; the verdict is
then the first section's verdict, cleaned the same way).

---

## 8. Every note and findings pass: the headline

Every pinned note (`note` kind: methods, craft techniques) and every finding (`findings` kind: editor passes,
composition checks, panel reviewers) now carries `change` as well as `note` / `issue`, so the card can lead with the
change:

```json
{"quote": "That number is real.", "start": 1310, "end": 1330,
 "change": "Say what the number counts",
 "note": "Real concedes the memo's ground. Say what it counts.",
 "try": "That number counts checkouts, and only checkouts.", "unsupported": []}
```

A model that leaves `change` out gets one from the server: the note's first sentence, cut at 12 words. Findings
passes return at most 12 findings with tries on (30 with Suggested text off). `wording` is unchanged in shape and runs
with a smaller answer budget.

---

## 9. Error codes and messages

**Refused before any model call** (HTTP 400, `detail` is the sentence to show):

| When | `detail` |
|---|---|
| Suggested text is off (section 1) | `Suggested text is off for this room. Turn it on in The room, in the title menu, to see suggestions.` |
| `ask` with no instruction | `Type what you want from the editor, then ask.` |
| `ask` instruction over 500 characters | `Keep your request under 500 characters.` |
| `refine` or `explain` with no `current` | `Choose a version first, then ask.` |
| `refine` instruction over 300 characters, or missing | `Say how to change it in under 300 characters.` |
| `refine`, `explain`, `rewrite`, `ask` with a selection that no longer fits the body | `The selected passage changed. Select it again.` |
| `refine` or `explain` with no selection | `Select the passage first, then ask.` |
| `rewrite` with no selection | `Select the sentence or paragraph you want rewritten, then ask.` |
| `rewrite` selection over 2,000 characters | `Select a paragraph or less to rewrite.` |
| `rewrite` with an unknown `move` | `Choose Rewrite, Tighten or Make it concrete.` |
| `start` with no answer that has words | `Answer at least one of the three questions, then start.` |
| `start` answer over 600 characters | `Keep each answer under 600 characters.` |
| `read` (or any pass) on an empty page | `The page is empty. Write a little first, then ask.` |
| any pass over 100,000 characters | `This piece is long. Select a section and run the pass on that.` |

HTTP 409, `One pass at a time. The editor is still working on this piece.`, while another pass on the piece runs.

**When a pass fails** (`status: "failed"` or `"stopped"`, with `code` and `message`):

| `code` | `message` |
|---|---|
| `no_model` | `Hermes doesn't have a model ready for The Clearing. Choose one in Settings, then try again.` |
| `busy` | `Your model is busy. Try again in a minute.` |
| `unreachable` | `Hermes couldn't reach your model. Check your connection, then try again. Your words are unchanged.` |
| `slow` | `Your model took too long to answer. Try again, or run the pass on one section.` |
| `cut_off` | `The editor stopped before finishing. Try a shorter piece or one section.` |
| `unmatched` | `The editor's notes didn't match your words. Nothing changed.` |
| `unreadable` | `The editor's answer came back in a form The Clearing can't read. Nothing changed. Try again.` |
| `failed` | `The editor couldn't answer just now. Nothing changed. Try again.` |
| `interrupted` | `Hermes restarted before the editor finished. Try again.` |
| `stopped` | `Stopped. Nothing changed.` |

For `wording`, `cut_off` and `slow` read `... Try again, or select fewer words.` (unchanged).

---

## 10. `GET /capabilities`

What this process can do now. The page hides what is false.

```json
{"web_reader": true,
 "dictation": {"available": true, "service": "OpenAI", "local": false},
 "pdf": true, "docx": true, "suggestions": true}
```

- `web_reader`: Hermes's `web_extract` tool is reachable (through the context `register(ctx)` received in this
  process, or the public tool registry). `false` when neither has it.
- `dictation.available`: a speech-to-text path is ready (`dictation.plan()["ready"]`). `service` is the name the page
  shows before Send, present only when the recording would leave the computer or Hermes decides at run time.
  `local` is `true` only when the recording stays on the computer.
- `suggestions`: the room's Suggested text switch.

No speech-to-text: `{"dictation": {"available": false, "local": false}}`.

---

## 11. Authorship spans

`POST /pieces/{id}/save` accepts `spans` beside `title` and `body`:

```json
{"title": "The room nobody counts",
 "body": "... the body after Use this ...",
 "spans": [{"start": 1310, "end": 1359, "pass_id": "8f2c...", "kind": "read", "model": "claude-sonnet-4-5"}]}
```

- Each span: `start` and `end` whole numbers with `0 <= start < end <= len(body)`; `pass_id`, `kind`, `model` strings
  (cut at 64, 32 and 120 characters). A span outside the body, or malformed, is dropped. At most 2,000 are kept.
- `spans` absent: the stored spans stay as they are. `spans: []`: cleared.
- `GET /pieces/{id}` (and `GET /state`'s `current`) returns `"spans": [...]`, the same objects.
- Every version saved keeps the spans that were current when it was saved; `GET /versions/{id}` returns them.
  `POST /pieces/{id}/versions` accepts `spans` with `title` and `body`. Restoring a version restores its spans.
- The rules for moving spans on an edit live in lane C's `authorship.js`. The backend stores and returns them; it
  never recomputes them.

**Counts in History.** `GET /pieces/{id}/versions` adds `passes`: the piece's finished passes, newest first, each
`{id, target, title, kind, status, model, created, counts}`, where `counts` is the pass's `{returned, matched,
dropped, praise, cut_off}`.

---

## 12. The stored sample read

`library/sample.json` may hold `sample_read`: one `read` result written by a real model on the sample piece during
the bench run, with `made_by` (the model) and `made_on` (the date). On first run `_seed()` stores it as a finished
`read` pass on the sample piece with `sample: true`. `GET /state` then carries it:

```json
{"current": {"...": "the sample piece"},
 "sample_read": {"id": "string", "kind": "read", "status": "done", "sample": true, "model": "the bench model",
                 "result": {"verdict": "...", "changes": ["... 3 ..."], "cut_first": {"...": "..."}, "counts": {"...": "..."}}}}
```

`sample_read` is `null` when there is none, or when the sample piece's text has changed since (its offsets would no
longer match). It must pass the same checks as a live read; the server re-checks it on seed and stores nothing if it
fails. It is never hand-written and never a fixture. If the bench produces none by 5 AM Monday, The Clearing ships
without it and the page opens the sample on Read my piece.

---

## 13. Fakes for the harness

One complete `GET /passes/{id}` per new kind, for lane A's `harness.js`. They use the sample piece's real text and
offsets; lane A pastes them as they are.

**`rewrite-filling`** (Rewrite, tile A in):

```json
{"id": "fake-rw", "piece_id": "sample", "target": "rewrite", "title": "Rewrite a passage", "kind": "rewrite", "status": "running",
 "result": {"selection": {"start": 874, "end": 981, "text": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her"},
            "options": [{"text": "A woman in a hospital badge slept forty minutes in the window chair, and nobody woke her", "move": "tighter", "unsupported": []}],
            "pending": 2},
 "code": null, "message": null, "model": "", "provider": "", "tokens_in": null, "tokens_out": null, "finish_reason": null,
 "elapsed": 3.2, "selection": {"start": 874, "end": 981}, "body_length": 1824, "step": null,
 "phase": "reading", "words": 21, "fallback": false, "sample": false, "counts": null}
```

**`rewrite-done`**:

```json
{"id": "fake-rw", "piece_id": "sample", "target": "rewrite", "title": "Rewrite a passage", "kind": "rewrite", "status": "done",
 "result": {"selection": {"start": 874, "end": 981, "text": "A woman in a hospital badge slept for forty minutes in the reading chair by the window, and nobody woke her"},
            "options": [{"text": "A woman in a hospital badge slept forty minutes in the window chair, and nobody woke her", "move": "tighter", "unsupported": []},
                        {"text": "A nurse, still in her hospital badge, slept for forty minutes in the reading chair by the window, and nobody woke her", "move": "more concrete", "unsupported": []},
                        {"text": "In the reading chair by the window, a woman in a hospital badge slept for forty minutes, and nobody woke her", "move": "ends on the key words", "unsupported": []}],
            "pending": 0, "counts": {"returned": 3, "matched": 3, "dropped": 0}},
 "code": null, "message": null, "model": "fake-model", "provider": "fake", "tokens_in": 410, "tokens_out": 150, "finish_reason": "stop",
 "elapsed": 6.8, "selection": {"start": 874, "end": 981}, "body_length": 1824, "step": null,
 "phase": null, "words": 21, "fallback": false, "sample": false, "counts": {"returned": 3, "matched": 3, "dropped": 0, "praise": 0, "cut_off": 0}}
```

**`ask-result`** (last paragraph selected, "make the ending land harder"):

```json
{"id": "fake-ask", "piece_id": "sample", "target": "ask", "title": "Ask the editor", "kind": "ask", "status": "done",
 "result": {"instruction": "make the ending land harder",
            "selection": {"start": 1714, "end": 1824, "text": "If the council wants to save money, it should count who uses the room before it decides who can do without it."},
            "options": [{"text": "Before the council cuts a day, it should count who sits in the room on that day.", "move": "ends on the day itself", "unsupported": []},
                        {"text": "If the council wants to save money, let it count the room first: the printer queue, the corner table, the chair by the window.", "move": "ends on the room's own details", "unsupported": []},
                        {"text": "Count who uses the room. Then decide who can do without it.", "move": "two short orders", "unsupported": []}],
            "counts": {"returned": 3, "matched": 3, "dropped": 0}},
 "code": null, "message": null, "model": "fake-model", "provider": "fake", "tokens_in": 520, "tokens_out": 140, "finish_reason": "stop",
 "elapsed": 7.1, "selection": {"start": 1714, "end": 1824}, "body_length": 1824, "step": null,
 "phase": null, "words": 22, "fallback": false, "sample": false, "counts": {"returned": 3, "matched": 3, "dropped": 0, "praise": 0, "cut_off": 0}}
```

**`fact-flag`** (Ask, "add a statistic to make this stronger", on "That number is real."):

```json
{"id": "fake-flag", "piece_id": "sample", "target": "ask", "title": "Ask the editor", "kind": "ask", "status": "done",
 "result": {"instruction": "add a statistic to make this stronger",
            "selection": {"start": 1310, "end": 1330, "text": "That number is real."},
            "options": [{"text": "That number is real: 1,400 fewer checkouts a year.", "move": "adds a figure", "unsupported": ["'1,400'"]},
                        {"text": "That number is real, and it counts only checkouts.", "move": "says what it counts", "unsupported": []},
                        {"text": "That number is real. It counts books, not people.", "move": "two short sentences", "unsupported": []}],
            "counts": {"returned": 3, "matched": 3, "dropped": 0}},
 "code": null, "message": null, "model": "fake-model", "provider": "fake", "tokens_in": 500, "tokens_out": 120, "finish_reason": "stop",
 "elapsed": 6.0, "selection": {"start": 1310, "end": 1330}, "body_length": 1824, "step": null,
 "phase": null, "words": 4, "fallback": false, "sample": false, "counts": {"returned": 3, "matched": 3, "dropped": 0, "praise": 0, "cut_off": 0}}
```

**`refine`** and **`explain`**: the `result` objects in sections 3 and 4, wrapped like the others with `kind` and
`target` `refine` / `explain`, `"status": "done"`, `"phase": null`.

**`reading`** (Read my piece at 4 s):

```json
{"id": "fake-read", "piece_id": "sample", "target": "read", "title": "Read my piece", "kind": "read", "status": "running",
 "result": null, "code": null, "message": null, "model": "", "provider": "", "tokens_in": null, "tokens_out": null, "finish_reason": null,
 "elapsed": 4.0, "selection": null, "body_length": 1824, "step": null,
 "phase": "reading", "words": 343, "fallback": false, "sample": false, "counts": null}
```

**`read-result`**: the done JSON in section 7, wrapped the same way (`"id": "fake-read"`, `"target": "read"`,
`"title": "Read my piece"`, `"model": "fake-model"`, `"elapsed": 31.4`, `"words": 343`, `"phase": null`).

**`sample-read`**: the same as `read-result` with `"sample": true` (in the harness only; the shipped sample read
is real model output from the bench, section 12).

**`start-result`**: the done JSON in section 5, wrapped the same way (`"target": "start"`, `"title": "Start from an
idea"`, `"words": 37`).

**`off`**: `POST /passes` for `rewrite` with Suggested text off answers HTTP 400 with the Suggested-text-off detail;
a `read` returns the section 7 JSON with every `try` `""` and every `unsupported` `[]`.

**Capabilities, three fakes:** all on (section 10); no dictation `{"web_reader": true, "dictation": {"available":
false, "local": false}, "pdf": true, "docx": true, "suggestions": true}`; local dictation `{"web_reader": false,
"dictation": {"available": true, "local": true}, "pdf": true, "docx": true, "suggestions": true}`.

---

## 14. `figures` and `opps`: Find figures of speech and Where to add a technique (targets `figures`, `opportunities`)

Both read the whole piece (a selection is ignored) and sit beside Read my piece in the room. The model proposes only
three things: where (a quote of the writer's exact words), which library item (an id) and why. Everything the page
shows about the item itself, its name and its definition, comes from the library files, looked up by id: in Python by
`library.library_item(id)`, in the page by `libraryItem(LIB, id)` (`desktop/src/spots.js`). A test checks that both
lookups give the same name, definition and group for every id.

**Ids.** `figure:<name>` for the 44 figures (`additions.json` `figures`), `method:<id>` for the thirteen methods that
work on one passage (`library.OPP_METHODS`), `craft:<focus id>` for craft-path steps, the story arc included
(`craft:human-story:arc-2`), leaving out the whole-piece diagnoses (group "Start here") and the figure families and
chooser (the figures are listed one by one). Find figures of speech takes figure ids only; a bare figure name
(`"anaphora"`) counts as that figure, and nothing else is guessed at.

**Checks, in code.** An unknown id, a quote that is not in the piece exactly once, a quote that overlaps an earlier
mark, or an empty why is dropped and counted. For Find figures of speech, a why that denies the figure ("so there is no
unexpected arrangement") and a repetition figure whose quoted words repeat nothing are dropped as `not_there`. For
Where to add a technique, the answer names the strongest line in `keep`; an opportunity on or touching it is dropped
(`keep_overlap`), and so is a figure that Find figures of speech already found on the same words of the same version
(`already_used`). At most 12 figures and 8 opportunities.

**Result, `figures`:**

```json
{"figures": [{"id": "figure:anaphora", "name": "Anaphora", "definition": "Successive clauses that open on identical words.",
              "group": "Repetition & return", "start": 0, "end": 107, "quote": "Every Saturday morning ...", "works": true,
              "why": "The repeated \"every Saturday\" sets up the ritual ..."}],
 "counts": {"returned": 10, "matched": 8, "dropped": 2, "unknown_id": 0, "unmatched": 1, "not_there": 1}}
```

`works` is false for a figure that is there and doesn't land; the card then says "Why it doesn't land yet".

**Result, `opps`:** ranked as the model ranked them, `rank` 1 first.

```json
{"opportunities": [{"id": "craft:true-nonfiction:8", "type": "craft", "name": "Reveal individual life",
                    "definition": "Use observation and a revealing slice of life to make one person particular.",
                    "group": "Shape true nonfiction", "start": 469, "end": 567, "quote": "A man named Arturo ...",
                    "why": "Arturo is the strongest human proof and gets one sentence ...", "rank": 1}],
 "keep": {"start": 1201, "end": 1309, "quote": "a library that cannot hold a tired nurse ..."},
 "counts": {"returned": 6, "matched": 6, "dropped": 0, "unknown_id": 0, "unmatched": 0, "keep_overlap": 0, "already_used": 0}}
```

**One result per piece version.** The pass request stores `version`, a hash of the piece's exact words. `POST /passes`
for either target on words it has already read returns that finished pass at once, with `"cached": true`, and no
model call. Any change to the words is a new version.

**Show me on an opportunity** is the existing `apply` flow, with `item` and `why` in place of `note`:
`POST /passes {"target": "apply", "selection": {...}, "item": "craft:true-nonfiction:8", "why": "..."}`. The server
builds the note from the library item and the why (`library.apply_note`), with the rule that anything only the writer
knows becomes a bracketed blank. The result is the usual apply result (Use this, Undo, the flags for anything the piece
doesn't say). For an opportunity only, an empty `text` is a cut: `{"text": "", "cut": true, ...}`, shown struck in the
page until Use this.

**Try it: `POST /coach`.** The writer's own version of the line, and the coach's reply:

```json
{"piece_id": "...", "item": "figure:anaphora", "quote": "the words in the piece", "why": "...", "line": "the writer's try",
 "body": "optional: the piece as the page has it", "title": "optional"}
```

Returns `{"text": "...", "model": "..."}`. The item must be in the library, the quote must still be in the piece, and
the line must be three words or more and at most 1,200 characters (HTTP 400 otherwise, with a plain message). The reply
says whether the try does what the item asks and names one thing that works, then asks questions; `library.coach_guard`
drops any sentence that puts four or more words in quotation marks that are not the writer's own, and ends the reply on
a question. The writer's version goes into the page only with **Use mine**, one step that Undo takes out.
