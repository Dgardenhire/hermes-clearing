# Live test in Hermes, Tuesday

The Clearing 0.1.0, branch `main`, in Damon's Hermes Desktop 0.23 on macOS. Ordered by risk: the checks most likely to fail, and most costly if they do, come first. Stop at the first failure in sections 1 to 3 and send back the message text and a screenshot; after section 3, note failures and carry on.

Mark each line **Pass**, **Fail** (with the exact words on screen) or **Skip**.

Everything below was built and tested in the harness and with Hermes's own code, never inside a running Hermes. Lines marked **(never run live)** are the ones the harness cannot prove.

## 0. Before installing (5 minutes)

- [ ] Back up as planned. The Clearing keeps its data in `~/.hermes/plugin-data/clearing/`; it does not exist before the first install.
- [ ] Note the Hermes version (Settings, About). Expect 0.23.x. The floor is 0.22.6.
- [ ] Install from the local folder (this repository's folder) (or Install from Git with the repo and branch `main`). Keep both halves: the backend plugin and the desktop plugin. Switch it on.
- [ ] Have one real draft of about 1,500 words ready as a .docx and as pasted text. No client material if you plan to film it.

## 1. It opens (nothing else matters if this fails)

- [ ] **The Clearing** is in the sidebar with a pencil icon (codicon `edit`). **(never run live)** If the icon is blank, note it; it is cosmetic.
- [ ] Click it. **Pass:** the Snow Light scene, the sample piece "The room nobody counts" in Caslon, and a note in the margin: "Want a quick check of this piece? It runs on this computer, with no model." with **Quick check** and **Not now**.
- [ ] Switch Hermes to dark mode. **Pass:** the scene turns to Night Tide at once; text stays readable.
- [ ] Change the accent color (Settings, Appearance) to red, then green. **Pass:** the caret, the underlines and the primary button follow.
- [ ] Type a few words, wait 2 seconds. **Pass:** "Saved" in the top line. Quit Hermes, reopen, open The Clearing. **Pass:** the words are there, cursor in the piece.

## 2. No model ready (the stage 3 fix, based on Hermes source, never seen live)

Do this in a Hermes profile with no model configured, or with the provider signed out.

- [ ] Press Cmd E, type "where do readers get lost", press Enter. **Pass:** "Hermes doesn't have a model ready for The Clearing. Choose one in Settings, then try again." with **Open Settings**, **Try again** and **Done**. The draft is unchanged. **Fail if** it says "Your model is busy".
- [ ] Click **Open Settings**. **Pass:** Hermes's settings open on the model page. Note where it actually lands: ______ .
- [ ] Quick check and Better words (double-click "modest") still work in the same profile.

## 3. The first real editor pass (the model path, never run live)

Back in your normal profile with a model set.

- [ ] Cmd E, "where do readers get lost", Enter. Time from Enter to the note: ______ . **Pass:** "Reading your piece" with a seconds counter and **Stop**, then a note whose top line names the pass and your model, like "See where readers get lost · <your model>".
- [ ] Cmd E, "weak sentences", Enter. **Pass:** notes underline exact phrases in your text; **1 of N** in the corner. Note any line that says notes were dropped because they didn't match your words: ______ .
- [ ] Walk them with **Leave it**. **Pass:** the page scrolls to each passage; the note sits beside it; the end says "That's every note from this pass."
- [ ] **Stop a pass.** Start "Find sentences that run long", press **Stop** at once. **Pass:** "Stopped. Nothing changed." and no notes arrive later.
- [ ] **Switch pieces mid-pass.** Start a pass, then open another piece from the title menu before it lands. **Pass:** no notes appear on the second piece. Go back to the first; it is unchanged.
- [ ] **A long piece.** Paste the 1,500-word draft as a new piece. Run **Fix punctuation and typos**. Time: ______ . **Pass:** change records with **Keep** and **Skip**; **Apply** changes only what you kept, and History has "Before applying the editor's changes" with the text as it was. If it says "The editor stopped before finishing", note your model; that is the cut-off check catching a half answer (with a reasoning model this should now be rare).
- [ ] **Walk a long piece.** On the 1,500-word draft, run **Find the shape** and walk every note with **Leave it**, including a jump back up the page. **Pass:** each card sits beside its underlined passage, never over the Ask line, with its buttons on screen. At the end, **Read the summary**, then **Walk the notes**: note 1 is underlined again and the page scrolls to it.
- [ ] **Fix it myself** on a long sentence. **Pass:** the cursor sits at the start of the sentence with nothing selected; one key adds one letter.
- [ ] **Type while a pass runs.** Start **Find weak sentences** and type a line at the very top before it lands. **Pass:** each note still underlines its own words, not words shifted by your new line.
- [ ] Model use: title menu, **History**. **Pass:** the line "Editor passes on this piece: N. Your model read about X words for them and wrote about Y." counts the passes you just ran, in words, not tokens. Press Escape: History closes.

## 4. Shortcuts and the palette

- [ ] Click into the page text and press Cmd E. **Pass:** the Ask line opens (Hermes does not take Cmd E). Press Cmd E again or Escape; it closes and the cursor is back in the text. Press Escape and then Cmd E at once: the Ask line opens and stays open, with the cursor in it.
- [ ] Press Cmd K. **Pass:** "Open The Clearing", "Quick check this piece" and "Ask the editor" are listed and each one works.
- [ ] Settings, Keybinds: "The Clearing: ask the editor" is listed, unbound. Bind it to something free and try it.

## 5. Files

- [ ] Title menu, **Open a file**, pick the .docx draft. **Pass:** its words come in as a new piece; a line says comments, images and formatting stay in the original.
- [ ] **Finish**, **Save as Word**. **Pass:** Hermes's save dialog opens with "<title>.docx"; save it; open it in Word; the text is there. **(never run live:** this is the `/api/fs/download` route with a file under `plugin-data`; Imprint relies on the same route.)
- [ ] **Save as Word**, then cancel the dialog. Note what the sheet says: ______ . (Known: it still says the file is ready, because Hermes's helper doesn't report a cancel.)
- [ ] **Finish**, **Save as .md**. **Pass:** Hermes asks for a folder the first time; the file lands there; "Saved <title>.md in <folder>." Do it again: no second folder prompt.
- [ ] **Copy as Markdown**, paste into Notes. **Pass:** the title as a heading, then the text.

## 6. The rest of the editor

- [ ] **Better words:** double-click "modest". Click "small", then "moderate". **Pass:** each swaps in place with a wash; your word and the two you tried stay in the card. **Suggest wording** returns four options from your model, each with what it changes.
- [ ] **Propose openings:** A, B and C in sans in the page one at a time; **Yours** brings yours back; **Keep B** keeps it, and History has a version "Before keeping a new opening" holding your old opening.
- [ ] **Try a shorter draft:** struck-through passages; click one to keep it; **Accept the cuts**; History has "Before accepting cuts".
- [ ] **Sample of the library** (SPEC M6: hide any Ask target that fails live). Run each on the sample and mark Pass or Fail: Find the main point ___ ; Anticipate counterarguments ___ ; Build earned tension ___ ; Keep it moving ___ ; Weight at the end (composition check) ___ ; Land the ending (Find the human story) ___ ; Choose whose story it is ___ ; one technique from Make the language memorable ___ . A failure here means the target goes on a `verified` list in `library/additions.json`, not a code change.
- [ ] **The methods with their own card** (new in this build; each is a few model calls, so run them on the sample, not a long piece). Mark Pass or Fail and the seconds each took:
  - Three ways to state the main point: the options replace the last sentence; **Keep** puts one in; History has "Before keeping a new sentence". ___
  - Three ways to make the promise. ___
  - Turn material into a draft, on a new piece of notes: three drafts, gaps listed, any new number flagged; **Keep** saves the notes in History first. ___
  - Title menu, **Use as a voice sample** on "Letter to my sister" (or any piece you wrote), then Check whether it sounds like you on the sample: each note says Sounds like you, Drifts or Not enough to tell, and quotes your sample. ___
  - Get several editorial perspectives: three reviewers (note whether all three answer on your provider's rate limit); **Where they agree**. ___
  - Let reviewers argue it through, from that panel: four steps; it never names a winner. ___
  - Edit a sentence by hand, Keep a lesson for next time: lessons quote your own words; **Keep this rule**; Your guidance lists it. Run any pass: nothing breaks. ___
  - Build your writing guidance (needs a voice sample). ___
  - Find the piece across drafts with one other piece. ___
  - Your guidance, **Set up a writing home**, **Set it up**, **Show the folder**: README, VOICE, STYLE, examples, drafts. Edit VOICE.md in the folder, set it up again: your edit stays. ___

## 7. Failure paths

- [ ] **Offline.** Turn Wi-Fi off (if your model is in the cloud) and run a pass. **Pass:** "Hermes couldn't reach your model. Check your connection, then try again. Your words are unchanged." Wi-Fi back on.
- [ ] **Plugin backend off.** Settings, Plugins: turn The Clearing's backend off with the page open, type a few words. **Pass:** a banner "The Clearing's saving and editor are off. Your words are kept here." Turn it back on. **Pass:** "Your words from while saving was off are in a new piece."
- [ ] **Huge input.** Paste 100,000+ characters and run a pass. **Pass:** "This piece is long. Select a section and run the pass on that."
- [ ] **Profile switch during a pass** (known risk 3). Start a pass, switch profiles before it lands. Note what happens: ______ . A lost result is acceptable; notes on the wrong profile's piece are not.
- [ ] **Two windows** (known risk 2). If Hermes allows two windows, run a pass on a different piece in each at once. Note whether each note names the right pass: ______ .

## 8. Install scanner (for the catalog PR)

- [ ] Run `hermes plugins validate` on the installed plugin. **Pass:** every check passes. Expect one caution, `role_pretend`, from the dictionary's definition of "impersonate" in two WordNet shards. That is third-party data, already explained in `docs/catalog/PR.md`.

## After the run

- Send back the timings, every Fail with its exact message, and where Open Settings landed.
- Then: re-pin the catalog draft on the final commit (`/usr/bin/python3 scripts/pin_catalog.py`) once the public repo exists.

## 9. Damon's notes (Nov 8 branch `damon-notes`)

- [ ] **Scenes.** Dark mode. The room: choose Quiet Marsh, then Snow Light, then Night Tide. **Pass:** each one changes the picture at once and stays after closing the sheet; the words stay easy to read.
- [ ] **Your own picture.** Choose a JPEG from Photos. **Pass:** it becomes the scene; Change the picture and Remove it work; a 20 MB photo is refused with the 6 MB line.
- [ ] **Built in labels.** The Ask line with nothing typed, All methods, About, the Cmd K palette. **Pass:** "Built in, no AI needed"; no "On this computer".
- [ ] **An editor that proposes.** Run Find weak sentences, then Choose the right rhetorical figure, on a real draft with the real model. **Pass:** every note names a change; most carry a Try; no note only praises; the figures pass names figures the draft does not use and drafts the sentence. Show me, Use this, then History lists it.
- [ ] **The pop-up.** Double-click a word; Cmd Shift E in a word; select a sentence with the mouse. **Pass:** the card sits beside the words, never over them; Escape closes it.
- [ ] **Suggested text.** Rewrite a paragraph; Cmd Shift E at the end of a paragraph; Propose endings; Title ideas. **Pass:** nothing goes in until Use this; the used words are dotted; History, Suggested text you used, names the model. Then The room, Suggested text: Off. **Pass:** none of these appear, and notes show no Try.
- [ ] **Bring in a link** (Damon's web backend is the Nous gateway). A public article. **Pass:** its words come in; Add it as a quoted source quotes it at the cursor. `http://127.0.0.1:8770` and `http://router.local` are refused in plain words.
- [ ] **PDF.** One exported from Word, one from Google Docs, one scanned. **Pass:** the first two read in paragraphs; the scan says it has no text.
- [ ] **Dictation.** Click the microphone. **Pass:** macOS asks for the microphone once; if Hermes's speech-to-text is a cloud service, the card names it before recording; the words land at the cursor; deny the microphone and the card says where to allow it.
- [ ] **Hermes's log.** **Pass:** no "unknown manifest field(s) ignored: provides_middleware" warning on start.

## 10. The suggestion API (lane B, Nov 8 branch `loop1-editor`; QA round 1, Monday 6 AM, QA profile)

Every line here was built and tested with fake models only. All are **(never run live)**. Shapes and messages: `docs/SUGGEST-API.md`. Time each pass from the press to the result and write the seconds down.

- [ ] **Capabilities (never run live).** In the QA profile, open the page and read `GET /api/plugins/clearing/capabilities` (the page's network log, or the harness's capture). **Pass:** `web_reader` is true when a Hermes web backend is set up and false when it isn't; `dictation.available` matches Settings, Voice; with a cloud speech-to-text, `service` names it and `local` is false. Hermes's log says which path the link reader used (`web_extract through the plugin context` or `through the tool registry`), with no address and no page text in the line.
- [ ] **Read my piece on the sample (never run live).** Open the sample, press Read my piece. **Pass:** `phase` goes `sending`, `reading`, `checking` in that order; a verdict of at most three sentences that doesn't open with praise; three changes, each underlined, each headed by an imperative of 12 words or fewer; one Cut this first; done in 45 seconds or less. Write down `counts`.
- [ ] **Read my piece on Theo's draft and a 1,600-word draft (never run live).** **Pass:** Theo's as above. The long one shows `sections` counting up (`1 of 2`, `2 of 2`), changes from the first section appear before the second is done, and the final result has `ranked: true`. No more than three model calls at once in Hermes's log.
- [ ] **Ask the editor (never run live).** Select the last paragraph; Cmd E; type "make the ending land harder". **Pass:** one model call; three endings drawn as text, each with a move label. Then with nothing selected, "Is the middle too slow?" **Pass:** a direct answer of at most three sentences plus pinned notes, each with a change headline.
- [ ] **The honest flag (never run live).** Select "That number is real."; Ask "add a statistic to make this stronger". **Pass:** any option with a number the piece doesn't have carries it in `unsupported` (for example `'1,400'`), and the card reads "Adds something your piece doesn't say: '1,400'". An invented name (for example a council member) is flagged the same way; a capital that only starts a sentence is not.
- [ ] **Rewrite fills tile by tile (never run live).** Select the hospital-badge sentence; Rewrite. **Pass:** the first option arrives on its own (`pending: 2`) within 8 seconds, then the other two; labels in move order tighter, more concrete, a craft move. Tighten and Make it concrete each make one call with three versions. If the provider answers 429 during the three calls, the pass still ends with three options and `fallback: true`.
- [ ] **Change it and Why? (never run live).** On tile B: Change it, Keep my rhythm. **Pass:** three new versions, none equal to B or the original; the page is unchanged. Why?: two or three sentences, no list, no heading.
- [ ] **Start from an idea (never run live).** New piece; Start from an idea; "Why our library should stay open on Saturdays", with the three answers. **Pass:** one model call; five to seven beats; three openings; every fact you didn't give is a bracketed blank.
- [ ] **Suggested text off (never run live).** The room, Suggested text: Off. **Pass:** Rewrite, Tighten, Change it, Start from an idea, Ask with a selection and Show me are refused with "Suggested text is off for this room. ..." and make no model call; Read my piece and Ask without a selection still run, with no Try anywhere; Why? still runs.
- [ ] **Authorship spans (never run live).** Use three suggestions; note "N% your words"; quit Hermes; reopen. **Pass:** the same percentage; History restores a version from before the second suggestion and the percentage changes to that version's; History lists each pass with its dropped and cut-off counts.
- [ ] **Strings (never run live).** Read every message the backend sends during the run (errors, refusals, the Talk it through line). **Pass:** none says "on this computer", "No model." or "tokens".
