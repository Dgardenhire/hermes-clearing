# The Clearing for Hermes: status

Updated Nov 8, 2026: Damon's notes, on branch `damon-notes` (from `main` at `5a9210c`), not pushed, not merged. Before that: persona fixes, after stage 5 (the whole library). Stage 4 was polish and package. Packet: the build packet's SPEC.md and DESIGN.md (kept outside this repository). Spikes: `docs/SPIKES.md`. Tuesday's checklist: `docs/LIVE-TEST.md` (section 9 is this branch). Filming: `docs/DEMO-NOTES.md`.

## Room lane, premium plan 5.2 (Nov 8, late)

After the checkpoint (`3b2cc3e`), this worktree is the room lane: it owns `desktop/` and `harness/` and no longer edits Python (the editor lane owns `.py`, `library/`, `dashboard/`, `tests/*.py`). Items 1 to 11 of PREMIUM-PLAN.md 5.2 are done against harness fakes, each rendered light and dark at 1440 x 900 (`docs/shots/item*-{light,dark}.png`, listed in the lane file `premium-plan/clearing/lanes/room.md`): Show me leads with a proof mark; every insert through the textarea's own editing (undo and redo work); every model span kept with a wash, a gutter tick and "N% your words"; never an empty card; links under one source line; plain labels; Cmd E as the one shortcut with selection rows; the selection bar with tiles that fill as rewrites land; Ask the editor first; Change it; "Suggested by your model". The room expects the editor lane's kinds `ask`, `refine`, `explain`, `rewrite` with `move`, partial `result.options` while running, and `source_url` on POST /pieces (contracts in the lane file). Open: `tests/test_audit.py` needs the one-line fix written in the lane file (1 of 133 Python tests errors until then); spans live in desktop plugin storage until the editor lane saves them with the piece; the real Cmd Z keys are for Monday's QA in Hermes's own window (the harness checks the same undo stack with execCommand).

## Damon's notes (Nov 8)

Damon used the room and wrote eight notes. Each is fixed, with tests; the security notes for the new surfaces are in `docs/SECURITY-AUDIT.md`, "Third review".

1. **"It would not change from the one picture."** `styles.js` mapped every scene but Plain to Night Tide in dark mode. Now Snow Light, Quiet Marsh, Night Tide, Plain page and **Your own picture** are each their own choice in both modes (`suggest.js SCENES`, `sceneShown`); dark mode deepens the veil over a light picture (74% over Snow Light and Quiet Marsh, 66% over your own) and light mode over Night Tide (70%), and never swaps the picture. Your own picture: JPEG, PNG or WebP by its bytes, 6 MB, 12,000 px a side (`intake.check_picture`), kept in `plugin-data/clearing/scene/`, served as a data URL, removable (`/scene/picture`).
2. **"On this computer" read as "available to any user."** Now **Built in, no AI needed** everywhere (`ask.js BUILT_IN`, the Ask line, All methods, About, the invite, the quick-check provenance line, Hermes's palette), with the detail "Built into The Clearing for everyone. Works without an AI model, and your words don't leave your computer." A test keeps "on this computer" out of the page's source.
3. **"It accepts the piece mostly as it is."** `library.py` `ROOM_RULES` now asks for new moves; `MOVES_RULE` makes every note name one change to its quoted words and why, holds praise to one short line, and forbids a note that only praises; `EXAMPLE_RULE` asks for a "try" (the quoted words rewritten in the writer's register). `praise_only()` drops praise-only notes from the model's structured reply and counts them (`counts.praise`). The figures passes (`memorable-language:28` to `34`) get `additions.json figure_moves` and their family's figures by name, so they recommend figures the piece does not use, where, and draft the sentence. Tests: `tests/test_notes.py` (prompt text, praise filter, examples bounded).
4. **A thesaurus pop-up.** Double-click a word, or Cmd Shift E with the cursor in it: **Other words** opens beside the word in the page (`.cl-pop`, placed under the words, or above when there is no room, and scrolled into view once), with in-place swap. A pointer selection gets the passage tools beside it: Rewrite, Quick check on the selection only, Ask. Cmd Shift E picks the tool from what is under the cursor (`suggest.toolAt`): a word, a passage, or a gap (a next sentence).
5. **Links.** **Bring in, A link**: `intake.check_url` (public http/https only; every resolved address checked) then Hermes's own `web_extract` through the public tool registry, kept as plain text (`intake.readable`), capped at 200,000 characters. New piece (with its source line) or a quoted source at the cursor (`suggest.quotedSource`).
6. **Dictation.** The microphone beside the Ask line (and Bring in, Dictate) records with `getUserMedia`; `dictation.py` turns it into text with Hermes's `tools.voice_mode.transcribe_recording`, or faster-whisper with a model already on the computer (never downloaded). Press first: a cloud or auto-detected service is named before the first recording, and the backend refuses a recording whose `send_to` doesn't name the service the plan names now. Microphone denied, missing, or no speech-to-text: plain messages.
7. **Word files and PDFs.** `pdf.py` reads PDFs with the standard library (Hermes's Python has no PDF library), with Imprint's caps and its tiny-PDF case. **Bring in** in the top line offers a Word file, a PDF, a text or Markdown file, a link, dictation and paste in one menu.
8. **Suggested text, the writer in control** (the coordinator's addition). Rewrite a passage (three options labeled by move, Edit first, Use this), Suggest a next sentence (at the cursor, in the writer's voice and voice samples, brackets where a fact is missing), Propose endings, Title ideas, and **Show me** on every editor's note (the note's "try", or a draft asked for on the press, kind `apply`). Nothing is inserted without a click; tried text is washed and dash-underlined in the page; used text is dotted until edited, a version is saved first, and the decision is recorded with the model's name (`decisions.model`) and listed in History as **Suggested text you used**. Quick check's rules screen every suggestion (`suggest.screen`): one that brings in a stock phrase, filler, hedge or throat-clearing the writer's words didn't have is left out and counted. **Suggested text: Off** in The room is stored by the backend (`/settings`) and enforced there (`library.SUGGEST_KINDS`); notes then carry no "try".

Also: `provides_middleware: []` is gone from `plugin.yaml` (Hermes's loader lists it as unknown; nothing registers middleware; its validator treats a missing list as empty). `docs/catalog/clearing.yaml` keeps it, because the catalog schema does know it.

Found while building, and fixed: the page treated any error whose words contained "network" as "the backend is off", so the link refusal ("inside your own computer or network") read as "turn The Clearing on". `errorOf` now trusts the backend's own words whenever it answered with a status.

### Design review (subject-led-design step 7) on the changed screens

Rendered with `harness/shoot-notes.mjs` (Playwright at real time, because the floating card and in-page previews are placed after layout, which headless Chrome's virtual time can skip) and `harness/shoot.sh` for the rest, light and dark, 1,420 px and 800 px.

Problems found, with the exact value and place, and what changed:
1. **The rewrite card's buttons didn't fit.** At 344 px "Done" wrapped under Use this, Edit first and Back to mine (`rewrite-light`). The card is 384 px (`.cl-pop`), and the helper line above the options ("Choose one to see it in your page ...") is cut: the wash on the passage says it.
2. **The tried text was marked only up to the old passage's length.** Show me washed "That number is real," and left "but it counts only checkouts." plain, because the preview's end was the original quote's end. The preview now ends where the suggestion ends (`showMe`, `tryOption`).
3. **The note drifted to the top while Show me was on.** The mirror layer (and so the mark the note hangs from) is gone while the page shows a preview; `place()` now hangs the note from `.cl-proposed-page`. Measured in `check-notes.mjs`: 18 px from its passage.
4. **A card taller than the room under its words ran off the window** (`rewrite-light`, 6 px; `words2-dark`, about 120 px once its senses arrived). When the card changes and runs past the window, the page now scrolls just enough, never so far that its words leave the top.
5. **Hovering options made the page jump.** The preview's scroll-into-view (centred, for openings and flips) ran on every hover. A suggestion tried from a floating card now scrolls only as far as it must (`block: 'nearest'`).
6. **Narrow top line overflowed.** At a 580 px pane "Bring in" wrapped to two lines and Finish was cut. Buttons don't wrap; under 700 px the word count goes, under 560 px the saved label keeps only its icon.
7. **The Ask line wrapped while recording.** The elapsed time widened the microphone and "Ask for help with this piece" broke onto two lines (`dictating-dark`). The Ask text now ellipsizes.
8. **Button row tight against the last suggestion** (0 px, `next-dark`): 12 px now.
9. **The Room sheet's suggested-text line ran three lines.** Cut to one sentence each way.

Recurring elements added, each with its reason:
- **The floating card** (`.cl-pop`): the same solid card as the margin note, so it reads as the editor's voice, but beside the words it is about, because a thesaurus or a rewrite is about a word or a sentence, not the piece. Under the words, never over them.
- **The wash with a dashed underline** on text tried in the page: says "not yet yours". The dotted underline after Use this says "came from the model" until you edit it. Two states, two marks, both in the writer's accent.
- **"Suggestions" in the card's corner and the model's name in its provenance line**: who wrote the words.
- **The microphone beside the Ask line**: speaking is another way in, so it sits by the other way in. An icon only, with a label for screen readers, an accent color and a running time while recording.
- **Bring in** beside Finish: the way in sits next to the way out, in the same quiet bordered style.
- **"Built in, no AI needed"** where "On this computer" was: what it is, for whom, and what it doesn't need.

Kept on purpose: the sans for anything the model wrote, even inline in the Caslon page (the cross-set rule from stage 4); the solid card over the photograph; one primary button per card. Removed: The room sheet's line "In dark mode every scene but the plain page becomes Night Tide", since that is no longer true.

Floors, checked on the renders: no text under 12.5 px; body text at the theme's text color; corners at 2 px; no emoji; every scene legible in both modes (Snow Light and Quiet Marsh in dark, Night Tide in light, your own picture in both looked at). Not recorded in the look ledger; Damon's verdict is pending.

## Persona fixes (Nov 8)

From the persona test (three stand-in writers through the harness; report kept outside this repository), all twelve ranked fixes, highest first. Each has a test that failed on the code before it: node tests in `tests/js/quick.test.mjs`, `walk.test.mjs`, `palette.test.mjs` and `ask.test.mjs`, a Python test in `test_library.py`, and browser checks in `harness/check-walk.mjs`.

1. **The card holds to its passage.** `noteTop` was measured before `reveal()` scrolled the passage into view, so on any piece longer than a screen the card sat 300 to 570 px away (the persona's "card top 72, passage top 501") or over the Ask line with its buttons off screen. Placement (`walk.js placeNote`) now runs in the frame after the scroll, writes the card's offset before that frame paints, and looks again for a few frames when a pass lands outside a click.
2. **Walk the notes after Read the summary** reopens the pass's notes (`walk.js reopen`), so they are underlined and the page scrolls to the first. Notes on passages the writer changed stay set aside.
3. **Fix it myself** puts the cursor at the start of the passage with nothing selected (`caretFor`), as the manual always said.
4. **Quick check on real prose** (`quick-check.js`): words inside quotation marks (curly or straight, a quote that runs on to the next paragraph) are skipped and counted; a sentence splitter that keeps Dr., Mr., St., Sen., initials, a.m./p.m., e.g., U.S. and "she asked" inside their sentences, used by the long-sentence and contrast rules; the contrast rule needs "it is"/"it's"/"they're" after the comma or a second sentence that opens that way, and no longer counts "thing" or a stray "about"; "what kind of", "the same sort of" are not filler; stock openings are a new rule; marks are trimmed. On the reporter's draft Quick check went from 10 notes (1 useful) to 4 (all his own words, including the stock lede and the 48-word sentence it used to split at "a.m."). Still one pass over the text; 400,000 characters of quotes and abbreviations in well under a second.
5. **"Questions, not rules"** opens the first Quick check note with what was found; the same line closes the walk and is the summary.
6. **The Ask line speaks writers' words** (`additions.json ask`, Clearing's own words): aliases per target, words a target stops answering to (a bare "remember" on Keep a lesson; "stakes" and "check" on the promise), whole phrases ("what does she want", "kill my darlings", "the middle sags"), and a for line per craft path. A lone "check" reaches Quick check; a target's first alias breaks ties. `library.py ask_aliases` applies the same rule; the node test now checks aliases and for lines against the backend, not only ids.
7. **Fiction is findable**: "Find the human story · fiction, memoir" on every Ask row from that path, and "For fiction, memoir and personal essays" under its heading in All methods. Six figure examples are narrative now (alliteration, diacope, antithesis, aposiopesis, litotes, periodic sentence); the no-shared-wording test still passes.
8. **Escape then Cmd E**: opening the Ask line clears the close its last blur scheduled, and focus lands in a layout effect, so nothing typed reaches the page.
9. **Long-s ligature**: Libre Caslon's italic draws "st" through its common ligatures (`liga`, GSUB lookup 2), not `dlig`, so the persona's suggested `no-discretionary-ligatures` would not have fixed it (rendered and checked). Common ligatures are off on italic quotes and samples; fi and ffi still join.
10. **History** says "Your model read about 31,000 words for them and wrote about 4,000" (`usageLine`, about three quarters of a word per token).
11. **Escape closes History** and every sheet: the sheet takes focus when it opens, and the page gets it back when it closes.
12. **Narrow dock**: the page fades out behind the dock and the Ask line (like the 40 px top fade), and the dock lines up with the Ask line's edges.

Found while fixing, and fixed:
- **A pass's notes never followed text typed while it ran.** `live.current` was rebuilt every render, so `live.current.sent` (the body the pass was sent with) was always gone by the time the pass landed; a line typed at the top during a pass shifted every note by its length (the browser check saw "rd in five years. Th" underlined). `live.current` now keeps fields set between renders.
- **The committed bundle depended on someone else's uncommitted kit edit.** It had been built with hermes-ui-kit's uncommitted `register.js` change, which wraps palette `detail` strings in functions. Hermes's palette calls `item.detail?.()`, so with the kit's committed HEAD a string would throw when the palette opens. The Clearing's own `plugin.js` now passes functions, so it is right with either kit, and the bundle is rebuilt from a clean copy of the kit's committed HEAD (`e3fccf9`) laid out like a normal checkout, so path comments match and `--check` against a clean checkout of that commit passes. The local kit folder still has the other edit and reports the bundle out of date until that edit is committed or dropped; its working tree was not touched.

Harness: `harness/long.json` (an 842-word reported piece written for the harness, with quotes, titles, times and a stock lede) and states `longwalk`, `longshape`, `longquick`, `rewalk`, `fixmyself`, `escask`, `askfiction`, `libfiction`, plus `step=<n>`; `harness/shoot.sh` renders them light and dark (`walk-long-*`, `rewalk-*`, `quick-long-*`, `fixmyself-light`, `ask-fiction-*`, `library-fiction-dark`, `history-dark`). Looked at: cards beside their passages on upward and downward jumps, buttons above the Ask line, the rewalk underlines, the narrow dock with no text between it and the Ask line, italic quotes without the ligature, the fiction rows on one line each. `harness/check-walk.mjs` (Playwright with system Chrome) measures it: 143 checks pass on this bundle; the same checks on the previous bundle fail 30.

Not changed: no live model run (the walk checks are added to `docs/LIVE-TEST.md` section 3). The catalog entry text still lists Quick check's rules without stock openings; update it at re-pin.

## Audit follow-ups (Nov 8)

From `docs/SECURITY-AUDIT.md`, all three open findings closed:
- **A-10:** Keep the changes and Keep an opening now save the page as it was before the change, as a version, the way the three-option main point, drafts and cuts do. A writer can always go back. New History labels "Before applying the editor's changes" and "Before keeping a new opening"; the old reasons keep their labels for copies already saved.
- **A-11:** `scripts/build-thesaurus.mjs` is back (from Byline, where the shards were first built; the 360 shards are byte-identical to that build). Rebuilding needs the english-wordnet 2025 JSON release, which is not in the repository.
- **A-12:** `NOTICE` (new, top level) says the bundled hermes-ui-kit code is Damon's own, included under the same PolyForm Shield license.
- **Release check:** `scripts/release-check.sh` runs the upstream overlap test with `CLEARING_UPSTREAM` set and fails loudly without it; `docs/RELEASE.md` lists it with the other release steps.

## Stage 5: the whole library (Nov 8)

Damon's requirement: the plugin carries The Clearing's whole method and storytelling library, not a subset. Before this stage 8 of the 33 methods were listed in About as "not in this version" and the three-option main point and promise were missing. Now every target the library defines runs in the room: 109 targets plus Quick check and Better words (111), all reachable from the Cmd E Ask line by their own name (a test runs every title through the matcher and requires it to come back first) and from **All methods** (title menu, and the foot of the Ask line), which lists every pass, method, composition check, all five craft paths by subgroup, and the 42 figures by effect.

What each of the eight runs as (`library.py` ROOM_KINDS; prompts in `library/additions.json` `rooms`, all Clearing's own words):

| Method | Kind | What the writer sees | The honest part |
|---|---|---|---|
| Turn material into a draft | `draft` | Three drafts from the selected notes (or the page), A/B/C/Yours flipped in place like openings | Gaps listed beside the draft, never in it; numbers and quotations not in the notes are flagged on the card (`library.unsupported`); keeping saves the notes as a version first |
| Check whether it sounds like you | `voice` | Notes pinned to the piece, each tagged Sounds like you / Drifts from your samples / Not enough to tell, quoting the sample | A judgment whose sample quote isn't found in a sample becomes "Not enough to tell"; the piece itself never counts as its own sample |
| Get several editorial perspectives | `panel` | The newcomer, the skeptic and the line editor, each walkable, plus Where they agree | Three separate concurrent calls (`workflows.panel`); agreement is computed from overlapping spans, not by the model; a failed reviewer keeps its place with its plain message; fails only if all three fail |
| Let reviewers argue it through | `debate` | Four steps: the decision and both positions, side A, side B answering A, what moved / still open / the question | Starts from the saved panel or runs one; frame, A, B, close are separate calls; a frame naming a reviewer that didn't report fails plainly; never names a winner |
| Keep a lesson for next time | `lessons` | Proposed rules one at a time, editable, Keep or Skip, marked lasting or this piece only | Evidence must be found in the first version, the current text or a recorded decision; decisions are now logged when the writer applies or skips changes, accepts cuts, keeps an opening, a flip or a draft, or swaps a word |
| Build your writing guidance | `guidance` | Rules by area with a quote from a voice sample, then gaps and up to three questions | A proposal whose quote isn't in a sample is dropped |
| Set up a writing home | `home` | A plan (files to create, files already there), then a report | No model; `home.py` writes plain files under `plugin-data/clearing/home/` with exclusive creation, so nothing already there is ever changed; a stale plan (fingerprint) is refused with 409 |
| Find the piece across drafts | `across` | Choose one to four other pieces; the shared possibility, notes here (walkable) and in the other pieces, gaps, decisions, and how much of each piece was read | Pieces share a 90,000-character budget and a cut piece says so to the model and the writer; trashed pieces refused |

Also new:
- **Three ways to state the main point** and **Three ways to make the promise** (`flip:thesis`, `flip:promise`, kind `flip`): the model quotes the sentence that carries the point or promise and the options replace it in the preview; with no such sentence they are tried after the first paragraph. New facts flagged as for drafts. Version "Before keeping a new sentence".
- **Your guidance** (title menu): the rules the writer kept, by area; edit, remove (retired, never erased), add your own; voice samples; Build your writing guidance; Set up a writing home. Kept rules go into every pass's system prompt (capped at 3,000 characters) as guidance that governs.
- **Use as a voice sample** (title menu) marks a piece.
- **Figures:** all 42 now carry a definition and an example written for The Clearing. Zeugma, syllepsis, merism and synecdoche have distinct definitions (and alliteration/assonance, anaphora/epistrophe, anadiplosis/epanalepsis, periodic sentence, parataxis were reworded so no two definitions or examples share a three-word run; a test enforces it). The two craft-path prompts that described them with one phrase now name each figure's own effect (`scripts/port_library.mjs` applies the same wording on re-port).
- About lists the whole library with counts; "Not in this version yet" is gone.

The four figure definitions Debate Workbench asked for (in `library/additions.json`, `figures.groups`; the craft-path prompts in `library/craft-paths.json` were reworded to match):
- syllepsis: "A single word read two ways at once, literally with one partner and figuratively with the other." Example: "He lost his keys and, by noon, his patience."
- zeugma: "A verb or adjective said once and left to serve every clause in a list, in the same sense each time." Example: "Maria chose the red door, her brother the green, and their father neither."
- merism: "A short list of parts, often a pair of opposites, that stands for the entire range between them." Example: "Day shift and night shift, every nurse signed the letter."
- synecdoche: "One piece of something, or one member of a group, named in place of the whole it belongs to." Example: "The diner fed every hungry mouth on Main Street."

Rendered through the harness in light and dark and looked at (`docs/shots/<state>-light.png` and `-dark.png` for flip, promise, draft, voice, panel, panelwalk, debate, debate3, debating, lessons, guidance, choose, across, library, figures, yourguidance, home, homedone; about-dark; panel-narrow-dark; flip-narrow-light). Fixed from the renders: a flip on the last sentence was out of view (a proposal now scrolls into view), the narrow layout couldn't scroll the last passage above the docked note (46vh bottom room), the choose card clipped word counts, the evidence and the reason ran together on the lesson card, two plural sentences on the home sheet. Floors held: nothing under 12.5px, body text at the theme's text color, no emoji.

Not done in this stage: no live model run of any of the new methods (they are on `docs/LIVE-TEST.md` section 6); the catalog entry is still pinned to the stage 4 commit and was not re-pinned (re-pin at release).

## Stage 4: polish and package

### Design review (subject-led-design step 7) on the rendered screens

Rendered with `harness/shoot.sh` (now 45 screens plus the card): light, dark, orange, red and green accents, the plain page, Quiet Marsh, larger text with stronger contrast, a 780 px and a 580 px pane, and a new 1,700 px pane (`wide-light`).

Problems found, with the exact value and place, and what changed:
1. **Wide pane lopsided.** At 1,700 px the column started at 146 px and the margin ended at 1,135 px, leaving 565 px of empty scene on the right (`styles.js`, `--cl-cols` first track `minmax(28px,146px)`). Now a `@container (min-width:1400px)` rule gives both outer tracks `minmax(146px,1fr)`, so the page and its margin sit together in the middle.
2. **Model name broke at its hyphen.** "Find weak sentences · hermes-4-" / "405b" in every note's top line (`.cl-meta span:first-child{overflow-wrap:anywhere}`). Each " · " part is now its own inline-block (`.cl-part`), so a model name moves to the next line whole.
3. **Narrow pane hid the passage under the note.** At 780 px the note docks over the lower page, and a pass that landed while the layout switched left the page at the top with the marked sentence out of view (`medium-light`). `reveal()` now scrolls the passage near the top in the narrow layout (`block:'start'`, `scroll-margin-top:72px`), and crossing the narrow line re-reveals the current passage.
4. **A line sliced at the top edge.** The page's top fade was 22 px against a 34 px line, so a scrolled line looked cut through its letters. The fade is 40 px.
5. Checked and not a bug: two screens (`narrow-dark`, `words-light`) first rendered mid-animation or before the dictionary answered under machine load; re-rendered alone they are correct.

Recurring elements, each with its reason:
- **The scene photograph, full bleed, under a theme veil:** the room is the product's identity and the owner's accepted direction; the veil keeps body text at 8:1 or better.
- **Libre Caslon Text for the title and body:** the writer's words, always.
- **Hermes's sans for every note, label and button:** the editor's words and the app's, always; proposed openings stay sans until kept (the cross-set fix).
- **Accent underlines on exact phrases, with a wash on the active one:** they show which words a note is about, in the user's own accent.
- **One solid note card at the host's 2 px radius with the host's shadow:** one voice at a time, legible over the photograph.
- **The provenance line ("Quick check, on this computer" or "pass · model"):** says who is talking and whether a model was used.
- **"1 of N" in the note's corner:** the only progress a walk needs.
- **One primary accent button per card:** the likely next step; the rest are plain.
- **The top line (title menu, word count, Saved, Finish) that fades while typing:** the file menu and the way out, gone while you write.
- **The Ask line with its Cmd E key cap:** the door to the library; the cap teaches the shortcut.
- **The accent caret:** the user's color inside the writing.

Kept on purpose, so a later reviewer doesn't strip them: the scene; the Caslon and sans split; "Quick check, on this computer"; History's line "Restoring keeps what is on the page now as a version first." (a promise that matters at the moment of restoring); the cuts card's "Click a struck passage to keep it." (the interaction is new and has no other cue); The room sheet's "In dark mode every scene but the plain page becomes Night Tide." (otherwise choosing Quiet Marsh in dark mode looks broken).

Floors, checked on the renders: no text under 12.5 px (the key cap is 12.5 px); body text at the theme's text color, never dimmed; corners at the host's `--radius-md` (2 px); no emoji; no heading ends in a period; accent tested with blue, orange, red and green in both themes.

Recorded in the look ledger (kept outside this repository, project "the-clearing hermes plugin (writing room)"), with no verdict yet. Add Damon's words with `design_ledger.py` when he gives one.

### Copy audit

Every string the room, the Ask line, Quick check and the backend can show was read. Changed:
- "Apply kept" is now **Apply**.
- "The dictionary is part of The Clearing's backend, which is off." is now "Better words needs The Clearing turned on. Turn it on in Settings, Plugins." ("backend" is not a reader's word).
- Raw error text could reach the screen: a KeyError's quoted id, a JSON parser's "Expecting value: line 1 column 1", "Bad request.", "Forbidden", a JavaScript TypeError, or "Something went wrong." with no way forward. The backend's `_plain()` now passes on only a sentence The Clearing wrote (starts with a capital, ends in . ? or !; never a KeyError or UnicodeError) and otherwise says "The Clearing couldn't do that. Try again." (404: "That piece or version is no longer here."). The page applies the same rule to whatever reaches it. Tested in `tests/test_gateway_api.py` (`PlainErrorTest`).
- Left as is: every failure message in `gateway.py` (each says what happened and what to do), the Quick check questions, the empty states.

### Package

- `README.md`: what it does, screens (now light and dark, both accents, narrow), the library, what leaves the computer, a **Disclosures** section, install, credits, development. The README's gallery images were not committed before this stage (`.gitignore` kept only six); the gallery, the catalog's screenshots and the PR's now are.
- `docs/MANUAL.md` (short, plain English), `CHANGELOG.md` (0.1.0), `LICENSE` (PolyForm Shield 1.0.0 since Nov 8; D1 decided by Damon).
- `docs/catalog/card.png`, 1,200 x 600, rendered from `harness/card.html` (`harness/shoot.sh card`): the room itself, the writer's sentence with one mark and the note pinned to it.
- `docs/catalog/clearing.yaml` (moved from `docs/catalog-entry.yaml`): adds `title`, `image` and two `known_issues`. `scripts/pin_catalog.py` pins the card too. **Draft, not submitted.**
- Checked at the end of stage 4: `docs/catalog/clearing.yaml` pinned to 992a748 and Hermes's `validate_plugin_catalog.py` says "OK: 1 file(s) valid"; Hermes's admission checks (`validate_plugin_dir`, scratch HOME, clean clone) pass 16 of 16.
- `docs/catalog/PR.md`: the draft PR description with disclosures, test steps and screenshots. **Not opened.**
- `docs/LIVE-TEST.md`: Tuesday's checklist, ordered by risk. `docs/DEMO-NOTES.md`: an 85-second shot list on the sample piece, backups and captions.

## Stage 3: what the review found and fixed (kept for reference)

Every item below has a test (`tests/test_adversarial.py`, `tests/test_gateway_api.py`, `tests/test_release.py`, `tests/js/text.test.mjs`).

1. **No model read as "busy".** Hermes raises `AuxiliaryClientUnavailable("No LLM provider configured ... Run: hermes setup")`; the word "unavailable" sent it to `busy`, so a judge with no model saw "Your model is busy" and no Open Settings button. Now `no_model`. Connection failures get their own `unreachable` message.
2. **A pass could land twice, or on the wrong piece.** The poll interval and the `pass.ended` event both answer; a second landing rebuilt the word card and lost the words tried. A stopped pass, or one started before opening another piece, could land late (notes pinned to the wrong text). `desktop/src/gate.js` lets a result land once, only while the margin waits on that pass; opening a piece stops the old poll.
3. **Word files.** A DTD saved as UTF-16 slipped past the byte check (now refused through expat handlers in any encoding). A bad checksum or unpackable part was a 500 (now a plain message). Text boxes (`mc:Fallback`) and tracked moves were read twice. A pasted form feed or control character made Word call the saved file corrupt (now stripped). Exports never start with a dot.
4. **Cut-off check.** A clean finish reason from `post_auxiliary_call` (`stop`, `end_turn`) now wins over the 98% token ceiling, because reasoning models count thinking as output and a whole answer was being thrown away. The ceiling still applies when the hook did not fire; the parse check is unchanged. Wording passes get 3,000 output tokens, and a cut-off wording pass asks for fewer words.
5. **Bad selections** (text, null, bool, float, reversed, out of range) are a 400 with "Select it again", never a 500 or a model call.
6. **Hostile model answers** (rewrite attempts, quotes not in the piece, injected `</piece>` text, 500 findings, 50,000-character summaries, wrong types) are bounded or refused, and the stored piece never changes. Covered by tests.
7. **Install scanner.** The bundle had a literal zero-width space and byte-order mark (Hermes's `invisible_unicode` caution); both are built from escapes now, with a regression test. Credit links in About open outside the app.

Admission, run in-process with a scratch HOME on a clean copy (`hermes_cli.plugin_validate.validate_plugin_dir`, no hermes CLI): every check passes, including capability probe, declared hooks, desktop surface and core override. Isolation verdict: host-ready. One caution remains: `role_pretend` in two WordNet shards (`im.json`, `pe.json`), the dictionary gloss for "impersonate" (an impersonation gloss, "you are not"). It is third-party data, caution level only; say so if a reviewer asks.

Checked and sound: secrets only through Hermes (redaction forced on the input, confirmed against Hermes's own `redact_sensitive_text`; no keys, no env); declared capabilities match registrations; `requires_hermes ">=0.22.6"` is right for `ctx.files`; desktop imports only the SDK and React; thesaurus keys are whitelisted (no path traversal); export names are sanitized into the plugin's own folder; nothing sends, and nothing deletes outright (trash is a flag; only pause-saves past 200 per piece roll off, now stated in the catalog text); the overlap check finds 0 twelve-word runs against Compound Writing; no contest, client or LINCHPIN content in sample data.

## Tests

- Nov 8, `damon-notes`: 133 Python tests (30 new: `test_notes.py`, `test_intake.py`, the A-10 audit extended to suggestions), 64 node tests (11 new in `tests/js/suggest.test.mjs`), 143 browser checks in `harness/check-walk.mjs` (its dock check now measures the Ask row with the microphone), 47 in the new `harness/check-notes.mjs`, and `build.mjs --check` current against a clean copy of hermes-ui-kit `e3fccf9` (bundle 1.44 MB). New screens: `harness/shoot-notes.mjs` (Playwright, real time).
- Before Nov 8: 103 Python tests (`cd tests && /usr/bin/python3 -m unittest`, about 1 s; 1 skipped, the upstream overlap test, which needs `CLEARING_UPSTREAM`), one of which runs the 53 node tests in `tests/js/` (quick check on real prose, marks following edits, change records, cuts, paragraphs, files, the pass gate, the note walk's rules; Ask matching, the words writers type, every target reachable by its own name, the methods menu covering everything, no two figures sharing wording; the thesaurus against the shipped shards; the page and the backend list the same targets with the same Ask words; the palette's detail functions).
- Browser checks: `harness/check-walk.mjs` (see Persona fixes above). `tests/test_methods.py` (23 tests) covers each new method end to end with a fake model: its result, its plain failure message, and that the manuscript never changes.
- `node <hermes-ui-kit>/scripts/build.mjs . --check`: the committed `desktop/plugin.js` is current (1.30 MB: typeface, three scenes).
- Catalog entry: `/usr/bin/python3 scripts/pin_catalog.py` pins HEAD into `docs/catalog/clearing.yaml` with the card and six screenshot URLs and runs Hermes's own `validate_plugin_catalog.py` under a scratch HOME: "OK: 1 file(s) valid".
- Release-rights overlap check and gitleaks: clean on every commit. `tests/test_release.py` also refuses invisible characters in the bundle, library and Python. The WordNet shards are third-party data under their own licenses (CC BY 4.0 and the Princeton license, `library/thesaurus/NOTICE.txt`), credited in About and the README; they are not Compound Writing files.
- Harness: `harness/shoot.sh` renders 45 screens into `docs/shots/` (light, dark, orange, red and green accents, 1000 px medium, 800 px narrow, 1920 px wide); `harness/shoot.sh card` renders `docs/catalog/card.png`. Under machine load a screen can catch an animation or a slow answer; re-render it alone. Serve the repo on a free port and set `PORT` (8794 is taken by another plugin's harness on this Mac).

## What works (end to end in the harness, unit-tested)

Everything from stage 1 (M1 room, M2 pieces and versions, M3 Quick check, M4 editor passes, M6 Ask line and openings, M7 Finish, M8 honest failure), plus:

- **M5 Better words.** Double-click a word (or select one and ask for "Better words"): senses and other words from Open English WordNet in the margin, in the writer's case and form. Click one to swap it in place; the word gets a wash mark; the original and every word tried stay one click away; a version "Before trying another word" is kept on the first swap. Shards (361, 7.1 MB) are served by `GET /thesaurus/{key}` and cached. No model. Backend off: a plain message. No entry: "No dictionary entry for ..." with Suggest wording.
- **M9 package.** See stage 4 above: README with disclosures, manual, changelog, card, catalog draft and PR draft, live-test checklist, demo notes.
- **SHOULD, in SPEC order:**
  1. **Try a shorter draft** (`cut`, kind `cuts`): proposed cuts struck through in place with a fade; click or Enter on any passage to keep it; the card shows each cut's reason and the word count before and after; Accept keeps the longer draft as a version "Before accepting cuts". Cuts take one neighboring space, and a sentence whose start was cut gets its capital back.
  2. **Suggest wording** (`wording`, kind `wording`): four model options for a selected word, phrase or sentence (600 characters at most), each with what it changes, landing in the word card; phrases open the card directly. Failures offer Try again and Back to the word; Stop returns to the card.
  3. **Word (.docx):** Open a file takes .docx (words only; comments, images and formatting stay in the original; DTDs, zip bombs and damaged files refused with a plain reason). Finish, Save as Word builds the file in `plugin-data/clearing/exports/` and hands it to Hermes's save dialog (`captureGatewayFileDownload`).
  4. **The shape strip** (title menu, Show the shape): one bar per paragraph, a tick where notes are, click a bar to go there.
  5. Find my main point and Check the promise as three-option flips: **built in stage 5** (Three ways to state the main point, Three ways to make the promise).
  6. **The room sheet** (title menu, The room): Quiet Marsh scene (light; dark stays Night Tide), larger text, stronger contrast, plain page. Focus mode not built.
  7. Model use for this piece: in History since stage 1.
- **Fixed after the render review:** the narrow layout's Ask line now has its own surface instead of sitting on page text; the word card scrolls its word into view; dictionary senses fold behind a link once suggestions arrive.
- **Stage 1 polish done:** title menu keyboard (focus on open, arrows, Home, End, Escape returns to the title); passes on a selection say so ("your selection", "Reading the passage you selected"); the margin note now stays fully on screen above the Ask line for marks near the bottom.

## What is left, in priority order

1. **Live run on Damon's Hermes (Tuesday): `docs/LIVE-TEST.md`.** Its first three sections are the real risk: it opens, no model reads as "Hermes doesn't have a model ready" with Open Settings (from Hermes source, never seen live), and the first real pass (timing, quote matches, Stop, switching pieces mid-pass, a 1,500-word draft). Library targets that fail live go on a `verified` list in `library/additions.json` (SPEC M6), not a code change.
2. **Film the demo: `docs/DEMO-NOTES.md`.** 85 seconds on the sample piece in a fresh profile.
3. **Release:** create the public repo, push, run `/usr/bin/python3 scripts/pin_catalog.py` on the final commit, replace SHA in `docs/catalog/PR.md`, open the catalog PR. All of this waits for Damon.
4. **Damon's decisions:** D1 license (decided Nov 8: PolyForm Shield 1.0.0); D2 Every attribution wording; D3 redistribution terms for the three generated scene images; D4 name and id. His verdict on the look, for the ledger.
5. Not built: focus mode.

## Known risks

- **Plugin host mode.** Under `plugins.isolation: host` (not the default; default is `in_process`) the editor's model call runs in the host process, where the `post_auxiliary_call` hook is probably not dispatched. Then the cut-off check falls back to the token ceiling and the parse, which still catch a truncated answer. Not tested live.
- **Two passes at once across windows.** If Hermes's async model call does not carry the context variable into its worker thread, the hook's record is matched by task and time, so two overlapping passes on two pieces could swap finish reasons. Single-window use is unaffected.
- **Profile switch during a pass.** If Hermes's profile scope is not a context variable, a pass that finishes after a profile switch is written to no row (harmless, the result is lost).
- **History on a very large piece** loads every version's text to count words (200 versions of a 400,000-character piece is about 80 MB for one request). Store a word count per version if this ever shows up.
- **Word exports accumulate** in `plugin-data/clearing/exports/` (one file per save). They are not pruned on purpose: on a Hermes without the save dialog that folder is the writer's copy.
- **Save as Word after a cancelled dialog** still says the file is ready; Hermes's download helper does not report a cancel.
- **The panel and the debate cost more.** The panel is three concurrent calls; a provider with a low rate limit may fail one or two (each shows its own message, the rest still land). The debate is four sequential calls, seven when the piece has no panel yet, so a slow model can take minutes; the working note names each step and Stop works throughout.
- **Kept rules grow every prompt.** Guidance is capped at 3,000 characters in the system prompt; past that, later rules are left out silently. Show a count in Your guidance if writers keep many.
- **Lessons need evidence that only starts now.** Decisions are logged from this build on; older pieces have only their first version to compare against.
- **The writing home lives in Hermes's data folder**, not a folder the writer picks; Show the folder reveals it. Moving it to a granted folder is a later step.
- **Drafts and flips put model text in the page on Keep**, the same as openings: shown in sans beside the writer's words, kept only on a click, with the original in History.

- **No live model run yet.** Model-side code is tested with a fake `PluginLlm` and Hermes's own hook code (`docs/SPIKES.md`). Cuts and wording are new kinds with their own schemas; a model that misses them is retried once as plain JSON, then fails with a plain message, never a changed draft.
- **Decisions still with Damon:** D1 license (decided Nov 8: PolyForm Shield 1.0.0); D2 Every attribution; D3 redistribution terms for the scene images, now three (`snow-light`, `night-tide`, `quiet-marsh`, all generated during the web app project); D4 name and id.
- **Bundle size** grew to 1.30 MB with Quiet Marsh (recompressed to 157 KB). Still a few large string literals.
- **Thesaurus quirk** carried from the web app unchanged: an irregular past form ("ran") can show noun senses of its base word.
- **The web app's ⌘K habit.** Cmd+K opens Hermes's palette, which lists Ask the editor.
