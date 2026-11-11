# Changelog

Nothing here has been published yet. Every entry below, including the 0.1.0 section, ships together as version 0.1.0, The Clearing's first public release, once the repository is public and the catalog entry is pinned to a commit.

## Unreleased: release fixes, November 10-11, 2026

- **Read my piece works on Claude models.** On the Claude route, Claude's strict mode rejected the answer format with a 400, and the fallback asked Hermes for json_mode, which Hermes refuses on that route, so a pass failed after about 99 seconds. The Clearing now falls back to a plain request that carries the format in the instructions and reads the JSON out of the reply. Checked live on Haiku: notes in 26 seconds.
- **debug.log.** When a pass fails, one line goes to `<HERMES_HOME>/plugin-data/clearing/debug.log`: the time, the kind of error and an excerpt of the message with anything quoted removed, never your words. It keeps the last 200 lines.
- **Runs on Hermes 0.21.6 and later** (`requires_hermes ">=0.21.6"`, down from 0.22.6). The one newer feature it uses, Hermes's desktop file store (0.22.6), is checked before use. On 0.21.6 to 0.22.5, Save as .md and .txt say Hermes cannot save files for plugins and offer Copy instead, and the scene photographs are fetched again on each open; everything else is the same. Not yet run on a real 0.21.6.
- **Delete forever.** In the Trash, each piece has **Delete forever**, and **Empty the trash** clears them all. Both ask first. Deleting removes the piece, its versions, its pass records and the suggestions you kept or skipped, with SQLite's secure delete on, so the words don't stay in the file. Rules you kept from the piece stay in Your guidance. Only a piece already in the trash can go, and not while the editor is reading it.
- **Readable buttons in every theme.** In dark mode, Use this, Open Settings, Close and every other main button measured 3.58:1, below the 4.5:1 that WCAG AA asks for. A main button's text is now white or black, whichever its color needs, so every accent in light and dark clears 4.5:1. In light mode the button keeps its deeper ink, now mixed from the theme's own text color instead of a fixed navy. Struck-through words and proposed cuts, the editor's words in the page, the change numbers in the margin and the method labels on the opportunities list were also too faint over some scenes or accents; measured again over all four scenes, both themes and four accents, every one now clears 4.5:1. (The page behind the welcome card stays faded on purpose: it is inactive until the card closes.)
- **Focus you can see in the page.** The title and the page show a thin accent rule in the left margin while they have the keyboard, and the Ask line underlines in the accent.
- **A finished answer is kept.** On a model that thinks before it answers (Haiku), Find figures of speech on the 343-word sample came back finished but was refused as "cut off, try a shorter piece", because the thinking counted toward the length limit. An answer that reads as a whole is now kept. Test added.
- **Praise kept whole.** When Read my piece names what already works, it keeps the whole sentence. It used to cut at the first comma, so a live read on Haiku showed "The piece has a strong." Test added.
- **The whole library, in sight.** The desk shows **All methods** right under Read my piece, with the number of items the library holds (159, or 150 with Suggested text Off), counted from the library itself. It opens the same list as the title menu.
- **Plainer labels beside Read my piece.** The two readings there are now **Find figures of speech** and **Where to add a technique**.
- **The manual, one click away.** The title menu ends with **The manual**, which opens the manual on linchpin.studio in your browser.

## Unreleased: opens faster, November 10, 2026

- **The room opens at once.** The page used to show an empty room until its backend answered (a few seconds on a cold open, while Hermes starts it). Now it draws the piece you had open last time straight away, from a small copy it keeps in Hermes's plugin storage, and swaps in the fresh one when the backend answers. Until then the page is read-only and Finish waits, so nothing is typed onto or exported from words that may be out of date. The copy holds only what the first screen needs (the piece's title and words, the piece list's titles, the trash count and the room settings), and a piece longer than about 200 KB is not kept.
- The page asks for dictation and your own scene picture at the same time as the piece, instead of after it.
- **A smaller bundle.** desktop/plugin.js is about 650 KB instead of 1.6 MB. The three scene photographs come from The Clearing's backend through its own route (`GET /scene/builtin/{name}`) and are kept in the page's data folder after the first open; the typeface stays in the bundle, as WOFF2 (the same glyphs, less than half the size), so your words never wait on it.

## Unreleased: Find figures of speech and Where to add a technique (opps1), November 9, 2026

Beside **Read my piece**, two new readings of your own draft. Both mark your words in the page; neither changes them.

- **Find figures of speech** marks the ones your piece already uses. Open any mark: the figure's name and plain definition from The Clearing's library, the words it is in, and why it works in that line, or why it doesn't land yet. **Try it** lets you write your own version of the line; the coach answers with what works and a few questions, never with wording. **Use mine** puts your version in the page, and **Undo** takes it out.
- **Where to add a technique** lists, ranked, the places where one method, figure or craft step from the library would lift the piece: a person where the piece only asserts, a list that could build into a litany, a paragraph that wants a concrete example. Each names the item, says why here, and offers **Show me** (a draft in your words, with a bracketed blank for anything only you know, and the usual **Use this** and **Undo**) or **Try it myself**.
- Your model proposes only where, which item and why. Names and definitions always come from the library; an item the library doesn't have, or words that aren't in your piece, are dropped before you see anything. Nothing touches the strongest line.
- Each result is kept for that version of your piece: run either again on the same words and it opens at once.
- The figures now include **simile** and **metaphor** (44 in all), each with a definition and example written for The Clearing.

## Unreleased: Damon's notes, November 8, 2026

Damon used the room and wrote down what got in his way. Each note, fixed:

### "When I tried to change the background, it would not change from the one picture"
- In dark mode every scene but the plain page used to become Night Tide, so choosing one changed nothing. Now Snow Light, Quiet Marsh, Night Tide and the plain page are each their own choice in light and dark. Dark mode deepens the veil over a light picture so your words stay easy to read; it never swaps the picture.
- New: **Your own picture.** Choose a JPEG, PNG or WebP (6 MB at most) in The room. It is kept in The Clearing's data folder; **Remove it** takes it away.

### "On this computer" read as "available to any user"
- Quick check and Better words are now labeled **Built in, no AI needed**: they come with The Clearing for everyone, need no AI model, and your words don't leave your computer. The same words appear in the Ask line, All methods, About and Hermes's palette.

### The editor accepted the piece as it was
- Every pass that marks passages now leads with changes. Each note names one change to the words it quotes and says why, and (unless suggested text is off) carries a **Try**: those words rewritten, in your own register, for you to use or ignore. Praise gets one short line at most; a note that only praises is dropped from the model's answer.
- The figures passes recommend figures your piece does not use yet, say where each would go, and draft the sentence with it.

### A thesaurus pop-up, and the other writing tools beside your words
- Double-click a word and **Other words** opens beside the word. Click one to swap it in.
- Select a sentence or a paragraph with the pointer and its tools appear beside it: **Rewrite**, **Quick check** (on the selection only) and **Ask**.

### Suggested text, with you in control
- **Rewrite a passage**: three rewrites of the selection, each labeled with the move it makes. Choose one to see it in the page, **Edit first** if you like, then **Use this**.
- **Suggest a next sentence**: with the cursor in a gap, Cmd Shift E (or "stuck" in the Ask line) offers three ways the next sentence could go, in your voice.
- **Propose endings** and **Title ideas**, alongside Propose openings.
- **Show me** on any editor's note shows its change in your sentence; **Use this** keeps it, **Back to mine** doesn't.
- Nothing goes into the page without a click. Suggested words are washed and underlined while you try them, and dotted after you use them until you edit them. A version of the page is kept first, and History lists **Suggested text you used**, with the model that wrote it.
- Suggestions that bring in a stock phrase, filler, a stacked hedge or throat-clearing are left out before you see them (Quick check's own rules).
- **Suggested text: Off** in The room turns all of it off, for a room with no AI-written words. The backend refuses suggestions too, so a stale window can't ask for one.

### Bringing words in
- One **Bring in** button in the top line: a Word file, a PDF, a text or Markdown file, a link, dictation, or pasted text.
- **PDF**: the words of a PDF become a new piece (12 MB at most). A scan with no text, or a locked PDF, says so.
- **A link**: your Hermes web tool reads a public page; make it a new piece or add it as a quoted source at the cursor. Addresses inside your computer or network are refused.
- **Dictate**: the microphone button beside the Ask line records; Hermes's own speech-to-text turns it into words at your cursor. When that service is on the internet, The Clearing names it and waits for **Send** before anything leaves.

### After the product owner's pass (room lane, same night)
- **Show me leads** when a note carries its change, drawn as a proofreader's mark: your words struck, the suggestion beside them. **Edit it myself** is the last link.
- **Cmd Z works.** Every suggestion goes in through the page's own editing, so Cmd Z takes it out and Cmd Shift Z puts it back. A version is still saved first.
- **Authorship you can see.** Every stretch of your model's words keeps a faint wash and a margin tick until you type inside it; the top line says "N% your words".
- **Never an empty card.** If every suggestion breaks a Quick check rule, The Clearing asks once more, then shows them with the habit each adds.
- **Links read clean**: one source line (title, site, date), then plain paragraphs. The address is kept with the piece.
- **Plain labels**: "Waiting to save"; talk it through says "Typed out privately. Nothing is sent." or "Sent to OpenAI to type out", with Send; the button is hidden when Hermes has no speech-to-text.
- **One shortcut, Cmd E.** With a selection its first rows are Rewrite, Tighten, Make it concrete; on a word, Other words; in a gap, a next sentence. The first row is always **Ask the editor** with your own words. Cmd Shift E is gone.
- **The selection bar**: Rewrite, Tighten, Make it concrete, Ask, just above what you selected. Rewrites arrive as A, B, C and Yours, filling as each lands.
- **Change it**: Shorter, Plainer, Keep my rhythm, Why? and your own words under every option and Try.
- **"Suggested by your model"** closes every card the model wrote; the model's name is on hover and in History, no longer in the header.

### Also
- `plugin.yaml` no longer carries `provides_middleware`, a field Hermes's loader doesn't know and warned about on every start.

## Unreleased: fixes from the persona test, November 8, 2026

Three stand-in writers (a retired teacher writing memoir, a reporter on deadline, a novelist) used the room through the harness. What they hit, fixed:

### The note walk
- Each note now sits beside its passage on a piece longer than a screen. It used to be placed before the page scrolled to the passage, so it drifted away from its words, and once sat over the Ask line with its buttons below the window.
- **Walk the notes** after **Read the summary** works again: the notes are underlined and the page scrolls to the first.
- **Fix it myself** puts the cursor at the start of the passage with nothing selected. It used to select the whole passage, so one key could replace a 78-word sentence.
- A pass's notes land on their own words even when you type while it runs. They used to shift by whatever you had typed.

### Quick check
- Words inside quotation marks are left alone, since a quote isn't yours to edit; the first note says how many spots it skipped.
- Sentences split the way a reader splits them: "Dr.", "Mr.", "St.", "Sen.", initials, "a.m.", "p.m.", "e.g.", "U.S." and dialogue tags after a question no longer end a sentence. Long sentences are counted whole.
- The "not X, it's Y" note no longer fires across two separate sentences or on a bare "thing"; "what kind of hospital" is no longer filler; marks never start with a space.
- New: stock openings ("In today's rapidly changing ... landscape", "now more than ever").
- The first note opens with what was found and "These are questions, not rules. Keep anything that sounds like you."

### The Ask line
- It answers to the words writers type: spelling, grammar, commas, proofread, lede, nut graf, headline, kicker, deadline, kill my darlings, fiction, novel, story, scene, subtext, conflict, stakes, character, dialogue, simile, metaphor, voice, "the middle sags", "what does she want". A bare "remember" no longer means Keep a lesson, and the promise no longer answers to "check" or "stakes".
- Each craft path says who it is for. **Find the human story** is for fiction, memoir and personal essays, in All methods and on every Ask line row.
- Six figures have a narrative example beside the civic ones.
- Escape and then Cmd E at once no longer opens the Ask line and shuts it again.

### Smaller things
- Italic quotes no longer draw "st" as a long-s ligature ("easieſt").
- History says how many words your model read and wrote, not tokens.
- Escape closes History and every other sheet.
- In a narrow pane the page fades out behind the docked note and the Ask line, so no text peeks between them.
- The Hermes palette entries hand Hermes a detail function, which its palette calls on every open.

## 0.1.0, November 2026

The first version of The Clearing for Hermes Desktop, ported from The Clearing web app. Licensed under the PolyForm Shield License 1.0.0.

### The room
- One page set in Libre Caslon Text inside a scene that follows Hermes's light and dark themes: Snow Light, Quiet Marsh or a plain page by day, Night Tide at night. Larger text and stronger contrast are one click away.
- Your words are always in Caslon; everything the editor says is in Hermes's own sans.
- The page and its margin sit together in the middle of a wide pane, and the note docks over the lower page in a narrow one, with the passage it is about moved into view.
- The Ask line on Cmd E (Ctrl E), because Hermes owns Cmd K. Three commands in Hermes's Cmd K palette, and one unbound, rebindable keybind.

### The editor
- Quick check on this computer, with no model.
- Better words from Open English WordNet on this computer, with every word you tried one click away.
- The whole library in The Clearing's own words: editor passes, Propose openings, the main point and the promise three ways, Try a shorter draft and Suggest wording; 9 composition checks after Strunk; all 33 editorial methods; 56 craft techniques in five paths; 42 rhetorical figures by effect, each with its own definition and example.
- Drafting from your notes, tried in the page with gaps listed apart and new numbers or quotations flagged. The voice check against pieces you mark as voice samples. A panel of three reviewers in separate calls, and a debate between them. Lessons and guidance you keep, read by the editor on every pass. A writing home of plain files. Several pieces read together.
- All methods: the whole library by group in the title menu and at the foot of the Ask line.
- One note at a time, pinned to your exact words. Quotes are checked against your text before you see them; a note whose passage you changed is set aside, never misplaced.
- Change records you keep or skip. Openings previewed in place. Cuts struck through in place.
- Passes run on your own Hermes model on The Clearing's own model setting. A cut-off answer is caught by Hermes's finish reason, a token ceiling and a parse check, and never lands half-done.

### Pieces
- Autosave on every pause; a version every two idle minutes, before every change you keep from the editor (applied changes, a new opening, a sentence, a draft, cuts, another word) and on Finish. Restore any version.
- Trash you can undo.
- Open .md, .txt and .docx files. Save as .md, .txt or Word.

### Honest failure
- No model, a busy or slow model, a lost connection, a cut-off answer, a plugin turned off: each shows a plain message and a way forward, and the draft never changes.
- Error text from the backend reaches the screen only when it is a sentence The Clearing wrote; anything else becomes "The Clearing couldn't do that. Try again."

### Not in this version
- Focus mode.
