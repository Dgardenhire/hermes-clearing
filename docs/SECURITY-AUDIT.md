# Security audit: The Clearing for Hermes

- **Auditor:** Claude (independent audit agent; did not build The Clearing), Nov 8, 2026.
- **Scope:** branch `main` from `3a97a48` (stage 5) through the fixes listed below. Measured against every item of the
  hackathon security bar (`SECURITY-BAR.md` in the build packet, outside this repository).
- **Rules kept:** no `hermes` command was run, nothing was installed into `~/.hermes`, and `~/.hermes/.env`, `auth.json`
  and the Keychain were not read. Hermes source was read from a separate checkout, never from a live install.
- **Verdict:** passes items 1 to 8 and 10 after the fixes below. Item 9 (fresh-machine install on clean macOS, Windows
  and Linux) was not run here and is still open.

## Tools run

| Tool | Command (summary) | Result |
|---|---|---|
| gitleaks 8.30.1 | `gitleaks git . --redact` and `gitleaks dir . --redact` | 28 commits (about 9.9 MB) and the working tree: **no leaks**, before and after the fixes. |
| bandit 1.9.4 | `uvx bandit -r . -x ./tests` | 0 high, 3 medium, 7 low. All explained in "Static analysis findings, explained" below. Same counts after the fixes. |
| semgrep | `uvx semgrep scan --metrics=off` with `p/python`, `p/javascript`, `p/security-audit`, `p/secrets`, `p/owasp-top-ten`, `p/react` (356 rules, 48 tracked files; the thesaurus data, the built bundle and the embedded assets excluded) | 3 results, all `use-defused-xml` on `docx.py` imports. Explained below. |
| pip-audit | `uvx pip-audit -r <empty requirements>` | No third-party Python requirement exists: the plugin imports only the standard library and FastAPI, which Hermes provides. Nothing to audit; "No known vulnerabilities found". |
| npm audit / OSV | no `package.json` or lockfile in the repository; the bundle is built by hermes-ui-kit with esbuild 0.28.2 (build time only). OSV query for `esbuild@0.28.2`: **no advisories**. `npm audit` in hermes-ui-kit: no lockfile (it declares no dependencies). | Clean. |
| Overlap check | `scripts/overlap_check.py` against the Compound Writing source (both local copies: the git clone and the guide's source folder) and the breakdown folder; then every tracked text file (docs, tests, harness included, 55 files) at 12 words, and the shipped set at 8 words | **0 matches** at 12 words and at 8. |
| Catalog validator | Hermes's `scripts/validate_plugin_catalog.py` on `docs/catalog/clearing.yaml` (isolated `HOME`, ruamel.yaml through uvx) | **valid**; one pre-existing warning, `known_issues` is not a catalog key. |
| Tests | `cd tests && /usr/bin/python3 -m unittest` (runs the node suite too) | 97 Python tests pass (1 skipped: the upstream overlap test, which now needs `CLEARING_UPSTREAM`; run with it set: passes). 27 node tests pass. |

## Findings

Severity is for a single writer on their own computer, which is how The Clearing runs. Every fix has a test that failed
before it (`tests/test_audit.py`, `tests/js/audit.test.mjs`).

| ID | Severity | Where | Scenario | Fix | Status |
|---|---|---|---|---|---|
| A-01 | Medium | `desktop/src/quick-check.js:8` | The "not X, it's Y" pattern began and ended with unbounded runs, so Quick check took time that grew with the square of a passage with no sentence ending. Pasted text (a table, a transcript, hostile text) froze Hermes's window: 13 s at 40,000 characters, about 30 s at 60,000, and far longer at the 400,000 a piece may hold. | Both open runs capped at 300 characters. An ordinary sentence still matches from its start. | Fixed, `8a08b38`. Test: 60,000 characters in well under 4 s (was 30 s). |
| A-02 | Medium | `desktop/src/text.js:149` | `paragraphs()` feeds the shape strip on every keystroke. Its regex took time that grew with the square of a long run of spaces: 4.3 s per keystroke at 100,000 spaces. | Rewritten as one pass over the lines. | Fixed, `8a08b38`. Tests: 100,000 spaces under 400 ms; a 3,000-case fuzz check that it splits exactly as the old regex did. |
| A-03 | Medium | `gateway.py:83`, `gateway.py:157` | (a) Only the input was scrubbed. The writer's kept rules ride in the system prompt, so a key pasted into a rule went to the model, though the README says secrets are removed first. (b) Inside Hermes, if `agent.redact` ever failed to import, `scrub()` silently sent raw text. `PluginLlm` does not redact on its own, so this was the only gate, and it failed open. | Scrub the system prompt as well. If `agent.plugin_llm` imports but `agent.redact` does not, refuse the call (`failed`). Outside Hermes (tests) nothing changes. | Fixed, `78d83d2`. Two tests. |
| A-04 | Low | `home.py:57`, `home.py:130` | Set up a writing home followed a symlinked subfolder: with `home/drafts` linked to another folder, the pieces were written there. Exclusive create stopped a symlinked file, not a symlinked folder. | Each target's resolved folder must sit inside the resolved home folder, or the file is reported as could not be written. | Fixed, `78d83d2`. Test: nothing lands in the outside folder. |
| A-05 | Low | `dashboard/plugin_api.py:532` | The Word export looked for a free name, then wrote with a plain `write_bytes`. After 499 files with the same title it overwrote `Title (499).docx`, and the check-then-write could race. | Exclusive create (`"xb"`) for each candidate name. After 499 it refuses with a plain message. | Fixed, `78d83d2`. Test: the existing file keeps its bytes. |
| A-06 | Low | `home.py:44`, `desktop/src/text.js:92` | File names from titles. The page's `fileName()` kept a leading dot, so a title like `.bashrc` saved a hidden file into the writer's folder (the backend already refused that). Neither side removed bidi and other invisible format characters, so a title could make `gpj.exe` display as `exe.jpg`. Neither handled trailing dots or Windows device names (`CON`, `NUL`, `LPT1`). | One rule set: `home.safe_name()` (used by the writing home and the Word export) and the same rules in `fileName()`. | Fixed, `78d83d2` and `8a08b38`. Python and node tests. |
| A-07 | Low | `gateway.py:188` | A failed model call was logged with the exception's `repr`. Provider errors can echo the request, so the writer's words could land in Hermes's log. | Log the error class only. The page still gets its plain message. | Fixed, `78d83d2`. Test: the piece text is not in the log. |
| A-08 | Info | `dashboard/plugin_api.py:480` | The thesaurus key check used `match` with `$`, which accepts a trailing newline. It was harmless, since `is_file()` and the fixed folder kept it in place. | `fullmatch`. | Fixed, `78d83d2`. Test. |
| A-09 | Info | `docx.py:72` | A Word file nested past Python's recursion limit raised `RecursionError` and returned a generic 500. Nothing was written and the DTD and size guards held. | Refused with the plain hostile-file message. | Fixed, `78d83d2`. Test with 5,000 nested elements. |
| A-10 | Low | `desktop/src/room.jsx:591`, `:626` | Keep the changes and Keep an opening save a version after the change, not before it. The writer chose each change, so this is consent, not an overwrite, but text typed since the last pause-save and then changed is not in History. Cuts, flips, drafts and words do save the text before. | Recommendation: post a version with the text before the change, as cuts already do. | Fixed Nov 8: both now save the page as it was first, before the change lands (History: "Before applying the editor's changes", "Before keeping a new opening"). `tests/test_audit.py` `KeepSavesTheTextBeforeTest` checks every keep (changes, opening, flips and drafts, cuts) and failed on the old code. |
| A-11 | Info | `library/thesaurus/NOTICE.txt` | The notice says the shards were built by `scripts/build-thesaurus.mjs`, which is not in the repository. Licenses and credit are correct. | Add the script, or say where the shards came from. | Fixed Nov 8: `scripts/build-thesaurus.mjs` restored from Byline's history (commit `4c000b5`, where the shards were first built); all 360 shards here are byte-identical to that commit's output, and only the header and default output folder changed. `test_release.py` runs it on a small fixture and checks it writes the notice the shipped shards carry. WordNet's notice unchanged. |
| A-12 | Info | `desktop/plugin.js` | The bundle includes hermes-ui-kit code, and that package says `UNLICENSED`. Damon owns both, so this is his call, but the published bundle now carries it under the plugin's license. | Damon confirms, or the kit gets a license line. | Fixed Nov 8 at Damon's direction: the new top-level `NOTICE` says the kit is the author's own code, included under the same PolyForm Shield license, and names each kit file the bundle carries (a test keeps that list honest). The kit's own repository is unchanged. |

## The bar, item by item

1. **Secrets.** gitleaks is clean over all history and the tree. There are no keys in code, demo data or screenshots; I
   looked at the screenshots and the sample piece. The plugin asks for no credentials. What goes to the model passes
   Hermes's forced redaction, now including the system prompt, and fails closed (A-03).
2. **Dependencies.** No third-party runtime dependency. The harness's CDN imports are pinned to exact versions and
   used only for screenshots (they carry no integrity hashes, which is acceptable for a dev page). esbuild is build time only.
3. **Static analysis.** bandit and semgrep have no high findings. Each medium is explained below.
4. **Inputs.**
   - Path traversal: every file write is inside its folder. That covers the writing home (A-04), Word exports (A-05),
     and text exports, which go through Hermes's granted-folder API with `exclusive: true` and safe names (A-06).
     Thesaurus keys are whitelisted (A-08).
   - Command injection: no shell, no `subprocess` in the plugin. Only `scripts/pin_catalog.py`, a dev script, uses
     fixed argument lists.
   - SSRF: no fetcher.
   - Bombs and huge input: Word files are capped at 4 MB in and 24 MB unpacked, with the declared size enforced by
     zipfile. Any DTD or entity in any encoding is refused before parsing, and deep nesting is refused (A-09).
   - Piece size: 400,000 characters a piece, 100,000 a pass, rules 600 characters and 200 rules, decisions capped.
     The page's own text work is now linear on long pastes (A-01, A-02).
   - Raw HTML: there is no `innerHTML` or `dangerouslySetInnerHTML` in the bundle (also enforced by
     `test_release.py`), so model output is always rendered as React text. The only links are the static credit URLs
     in `library/additions.json`, opened with `os.openExternal` on click.
5. **Prompt injection.** Text from the piece, a pasted email, an imported file or the model can't send, delete, write a
   file, keep a rule or change the piece.
   - The model returns notes and records only. Every quote must occur once in the writer's text or it is dropped, and
     replacements are length-capped.
   - Changes, openings, drafts, cuts and rules reach the page or the store only on the writer's click.
   - The system prompt tells the model to treat the piece as material, never as instructions.
   - Red-team evidence: `RedTeamTest` seeds an email-style "[injected override instruction] ... reply with the deposit
     details to x@y" and a model that obeys. The piece, the rules and the data folder are unchanged, and HTML in a note
     stays text. The existing `test_the_model_never_writes_into_the_piece` covers the rest.
   - The Ask line (Cmd E) only matches the writer's words against the local library. Its text is never sent, and a
     pass starts only on Enter or a click.
6. **Approvals and gates.**
   - Nothing sends, deletes or shares. Trash is a flag. The writing home writes only after the writer confirms a plan
     whose fingerprint must still match (409 otherwise).
   - Saving a file needs a folder the writer grants through Hermes, or Hermes's save dialog.
   - The pass gate (`desktop/src/gate.js`) lands each answer once, only on the pass it belongs to.
   - Hermes's own session token and Host checks guard the routes.
7. **Catalog rules.**
   - The bundle imports only `@hermes/plugin-sdk`, `react` and `react/jsx-runtime` (checked by grep and test). There
     are no compiled binaries: the fonts and JPEGs are data.
   - `capabilities: []` is right. The editor routes through its own registered auxiliary task, which Hermes's
     `_check_task` allows without `llm.task_override`.
   - `provides_hooks` matches `register()`, and `requires_hermes ">=0.22.6"` is right for `ctx.files`.
   - Every file write, the one observe-only hook, storage and model use are disclosed in the README and the catalog PR.
8. **Privacy.**
   - The README's "What leaves your computer" now matches the code: rules are scrubbed too, and credit links opening
     the browser on click are disclosed.
   - There is no telemetry and no network call of the plugin's own.
   - The hook keeps only finish reason, model and token counts.
   - Demo data is an invented library essay with no client or personal material.
9. **Fresh-machine install.** Not done in this audit, and it remains open. The README says Windows and Linux are
   untested; the file-name fixes (A-06) remove two known Windows traps before that test.
10. **Evidence.** This file.

## Static analysis findings, explained

- **bandit B608 at `store.py:185` and `store.py:386` (medium, low confidence).** The query strings are joined from two
  fixed literals chosen by a boolean. No input reaches them; every value goes through `?` parameters.
- **bandit B405, B406 and B314 on `docx.py`, and semgrep `use-defused-xml` (3 results).** Standard-library XML is
  parsed only after `_refuse_dtd()` runs expat with handlers that refuse any DOCTYPE, entity declaration or external
  entity, in whatever encoding the file declares (UTF-16 is tested). `defusedxml` would be a new dependency for the same
  guarantee. Accepted.
- **bandit B110 at `dashboard/plugin_api.py:301` (low).** The pass-ended broadcast is best effort, and polling covers it.
- **bandit B404, B603 and B607 in `scripts/pin_catalog.py` (low).** This is a developer script, not shipped behavior. It
  uses fixed argument lists (`git rev-parse HEAD` and Hermes's validator) with no shell.

## Release rights

- **Overlap.** No 12-word run, and none of 8 words in the shipped set, of The Clearing's text appears in the Compound
  Writing sources on this computer. The craft books (Cheney, Forsyth and the others in About) are not on this computer,
  so they were not machine-checked. The README says none of their text is reproduced.
- **Third-party notices.** Libre Caslon Text (OFL 1.1, notice included) and Open English WordNet 2025 with WordNet 3.1
  (CC BY 4.0 and the Princeton license, `library/thesaurus/NOTICE.txt`) are credited in About and the README.
- **License.** Changed at Damon's direction from MIT to the PolyForm Shield License 1.0.0 (`60f9557`). `LICENSE` holds
  the official text from the polyform-licenses 1.0.0 tag with `Required Notice: Copyright (c) 2026 Damon Gardenhire`.
  - `plugin.yaml` says `license: PolyForm-Shield-1.0.0` (Hermes reads it as free text).
  - The README, changelog, catalog draft and PR draft say so. The catalog schema has no license key, so the entry
    carries a comment and a sentence in its description.
  - Third-party notices are unchanged.
- **Personal paths.** No home-folder paths remain in tracked docs or tests (`307ab8e`). The upstream overlap test now
  reads `CLEARING_UPSTREAM`. The harness's `/Users/you` is a placeholder, and `~/.hermes` paths name Hermes's own
  defaults.

## What remains

- Item 9: a fresh install on clean macOS, plus Windows and Linux virtual machines if support is claimed.
- Before each release, `scripts/release-check.sh` with `CLEARING_UPSTREAM` set (`docs/RELEASE.md`). The ordinary test run skips the overlap test; the script fails if the variable is missing or the test does not pass.

## Second review

- **Reviewer:** Claude (independent review agent; built neither the fixes nor the persona changes), Nov 8, 2026.
- **Scope:** every change after the first audit's report commit `f8f11f5`: `0722112` (versions saved before a keep,
  the thesaurus build script, `scripts/release-check.sh`, `NOTICE`) and `6ad3917` (note walk placement, notes
  following text typed during a pass, Quick check's quote skipping and sentence splitting, Ask line aliases and
  phrases, the ligature CSS, the Escape and Cmd E race, palette detail functions, the rebuilt bundle).
- **Rules kept:** no `hermes` command was run, nothing was installed into `~/.hermes`, and `~/.hermes/.env`,
  `auth.json` and the Keychain were not read. hermes-ui-kit was read from a clean `git archive` of its HEAD in a
  scratch folder; its own checkout (which has uncommitted edits) was not touched.
- **Verdict:** one new medium finding (B-01), fixed here with tests that fail without it. Two info items. Everything
  else in scope holds. Item 9 (fresh-machine install) is still open.

### Tools run

| Tool | Result |
|---|---|
| gitleaks 8.30.1, `git . --redact` and `dir . --redact` | 31 commits (10.1 MB) and the tree: **no leaks**. |
| bandit 1.9.4, `uvx bandit -r . -x ./tests` | 0 high, 3 medium, 7 low: the same ten as the first audit (the `store.py` B608 lines moved to 186 and 387). `uvx bandit -r .` adds only test-file items (`subprocess` calls to node and `sh`, XML parsing of the test's own Word output): 0 high, 5 medium, 17 low. |
| semgrep, `uvx semgrep scan --metrics=off` with `p/python`, `p/javascript`, `p/security-audit`, `p/secrets`, `p/owasp-top-ten`, `p/react` | 56 files (thesaurus data, bundle, embedded assets and screenshots excluded): 3 results, the known `use-defused-xml` on `docx.py`. The built bundle scanned on its own with `p/javascript`, `p/security-audit`, `p/react`, `p/secrets`: 0. |
| pip-audit, `uvx pip-audit -r <empty requirements>` | No third-party Python requirement exists. "No known vulnerabilities found". |
| npm audit | Not runnable: no `package.json` or lockfile here, and hermes-ui-kit has none either (it declares no dependencies). OSV for `esbuild@0.28.2`, the build-time bundler: no advisories. |
| Bundle currency | `node <clean hermes-ui-kit e3fccf9>/scripts/build.mjs . --check` from a copy of this repo placed so the kit sits at the same relative path the bundle's comments name: the committed `6ad3917` bundle is **up to date**. Rebuilt the same way after B-01: the only change is the one regex line. |
| Release check | `scripts/release-check.sh` with `CLEARING_UPSTREAM` set to each local copy of Compound Writing (`outputs/compound-writing-source` from the guide, and the `work/compound-writing` git clone): **passed** against both, overlap test run, not skipped. The `writing-bench/upstream` path in the review brief does not exist on this computer. |
| Overlap at 8 and 12 words | `scripts/overlap_check.py` against both copies: 25 shipped files, **0 matches** at 8 words and at 12. |
| Tests | 103 Python (1 skipped without `CLEARING_UPSTREAM`, 0 with it), 56 node (53 before this review), 143 browser checks in `harness/check-walk.mjs` against the rebuilt bundle: all pass. |

### Findings

| ID | Severity | Where | Scenario | Fix | Status |
|---|---|---|---|---|---|
| B-01 | Medium | `desktop/src/quick-check.js:33` (`END`), new in `6ad3917` | The new sentence splitter's end-of-sentence pattern, `[.!?…]+[”"’')\]]*(?=\s|$)`, is retried from every mark in a run of marks that has no space after it, and each try walks the rest of the run. A pasted run of periods, `!!!`, `…` or mixed marks followed by a letter (ASCII art, a scraped page, hostile text) made Quick check take time that grew with the square of the run: 11.0 s (periods), 10.5 s (`!`), 14.3 s (`…`) and 13.0 s (mixed) at 60,000 characters, and minutes at the 400,000 a piece may hold, with Hermes's window frozen. The old splitter (`[^.!?\n]+[.!?]?`) was linear, so this was a regression; A-01's 60,000-character test did not cover it. | A lookbehind, `(?<![.!?…])`, so a run is tried only from its first mark. A match can never start inside a run that failed from its start, so the sentence ends are identical. | Fixed in this review. `tests/js/audit.test.mjs`: three 60,000-character runs each under 1 s (now 1 to 8 ms; failed at 11 to 14 s), a 4,000-case fuzz check that the new pattern finds exactly the ends the old one did, and a check that `desktop/plugin.js` carries the fixed pattern (failed on the old bundle). Bundle rebuilt from clean kit HEAD `e3fccf9`. |
| B-02 | Info | `desktop/src/room.jsx:445`, `:465` | Notes now follow text typed during a pass by mapping from `live.current.sent`, which `6ad3917` made survive renders. It is one field for the page, not tied to a pass id, and opening another piece does not clear it. A pass resumed by `load()` after the backend reconnects could map from the last pass's body instead of its own. Reaching it takes a pass running on the current piece that this page did not start in this session, and a backend restart interrupts running passes. The worst result is an underline on the wrong words or a note set aside: `followEdit` relocates only by exact quote, and change records still apply only where `body.slice(start, end)` equals the quote. | Recommendation: keep the sent body with the pass id (`{ id, body }`), use it in `land()` only when the ids match, and clear it in `open()`. | Open, recommended; not a data or write risk. |
| B-03 | Info | `store.py:276` (pre-existing) | Only pause-saves roll off past 200 versions; versions saved for keeps, cuts, flips, drafts, words and restores are never pruned, and each may hold up to 400,000 characters. Each one takes a writer's click, so growth is bounded by their own use. `0722112`'s new `before_changes` and `before_opening` versions replace the old after-the-change ones one for one, so the count did not grow. | None needed now. If it matters later, cap non-idle versions per piece, oldest first. | Accepted. |

### What I checked and found sound

- **Every new Quick check pattern, timed at 60,000 characters with adversarial inputs** (28 shapes) and at 100,000 and
  400,000 for 33 repeated units: the stock-opening pattern (`in today's ...`, `in an ever-changing ...`, `we live
  in a ...`), the contrast window and its sticky `AFTER_SEP` scan, `RESTATE`, the `kind of` type-of check, title and
  abbreviation handling (`Dr.`, `a.m.`, `J.`, `No.`, `e.g.`), the quote counter and the sentence trimmer. After B-01
  the slowest 400,000-character input takes 46 ms. Every new pattern runs on a bounded window or a single pass.
- **The Ask line:** phrase patterns come only from the shipped `additions.json`, never from what the writer types.
  `findTargets` on a 60,000-character query takes 0.3 to 96 ms. `ask_aliases` in `library.py` reads library data
  only. The Ask line's text is still never sent anywhere.
- **Versions before a keep (A-10):** both keeps post the page as it was, before `changeBody`, and only for a saved
  piece. The new reasons are in the `REASONS` whitelist, and `add_version` refuses any other reason.
- **The note walk, the Escape and Cmd E race, the ligature CSS and the palette details:** layout and focus only. No
  new network call, external URL, HTML injection or storage. `placeNote`, `reopen`, `caretFor` and `usageLine` are
  pure functions. The bundle still has no `innerHTML`, `eval` or dynamic `import()`, and imports only the SDK and
  React.
- **`scripts/build-thesaurus.mjs`** imports only `node:fs`, `node:path` and `node:url`, reads the folder it is given
  and writes the shards. It fetches nothing. Nothing in the plugin runs or imports it: not `__init__.py`, not the
  routes, and not the bundle, whose entry is `desktop/src/plugin.js` (no `build-thesaurus`, `node:fs` or
  `readdirSync` in it). It is in the repository, and so in the catalog's pinned checkout, as an inert developer file.
  The claim that the 360 shards are byte-identical to Byline commit `4c000b5` was not re-verified: that commit is not
  in any repository I found on this computer. The test proves the script writes the notice the shipped shards carry.
- **`scripts/release-check.sh`** fails when `CLEARING_UPSTREAM` is unset or missing (tested), treats a skip as a
  failure, quotes its variables, and runs only `/usr/bin/python3 -m unittest`.
- **License and notices:** `LICENSE` matches the official PolyForm Shield 1.0.0 text from the polyform-licenses
  1.0.0 tag byte for byte, plus the line `Required Notice: Copyright (c) 2026 Damon Gardenhire`. It has not changed
  since `60f9557`. `NOTICE` carries the same Required Notice, names every hermes-ui-kit file the bundle includes (a
  test keeps that list honest), and points to the OFL and WordNet notices. `library/thesaurus/NOTICE.txt` still
  carries the WordNet notice.
- **Harness changes** (`check-walk.mjs`, `long.json`, `shoot.sh`): developer-only, run against a local server bound to
  127.0.0.1, and not part of the plugin's runtime.

## Third review: Damon's notes (Nov 8, 2026)

Scope: the `damon-notes` branch, which adds links, PDFs, dictation, the writer's own scene picture and suggested
text. Reviewed by the builder, with tests for each surface; it has not had an independent review yet (see "Still
open" below). Rules kept: no `hermes` command; `~/.hermes/.env`, `auth.json` and the Keychain not read; Hermes source
read from its checkout only.

### Tools run

| Tool | Result |
|---|---|
| gitleaks 8.30.1 (`gitleaks dir . --redact`) | no leaks |
| bandit 1.9.4 on `pdf.py`, `intake.py`, `dictation.py`, `dashboard/plugin_api.py`, `store.py`, `library.py` | 0 high. New: three `try`/`except`/`continue` in `pdf.py` (a damaged object is skipped, the rest of the file still reads), one `try`/`except`/`pass`-style return in `dictation.py` (PyAV can't decode: the original recording goes as it is), and one `B608` on `store.suggestions_used`, whose placeholders are built from the constant `MODEL_TEXT` keys and every value is bound. An early `ffmpeg` fallback in `dictation.py` was removed, so the plugin still runs no other program. |
| Tests | `tests/test_intake.py`, `tests/test_notes.py`, `tests/js/suggest.test.mjs`, and 47 browser checks in `harness/check-notes.mjs`, listed per surface below. |

### Each new surface

- **A link (SSRF).** `intake.check_url` is a first gate, before any fetch: http and https only, no user name or
  password, the usual web ports only, no `localhost`, `.local`, `.internal`, `.lan`, `.home.arpa` or bare single-label
  name, and every address the host resolves to must be global: loopback, private, link-local (including
  `169.254.169.254`), shared `100.64/10`, multicast, reserved, unspecified and ULA are refused, and IPv4 written inside
  IPv6 (`::ffff:`, 6to4, Teredo) is checked as IPv4. A host that resolves to one public and one private address is
  refused. The plugin never fetches the page itself: nothing in `intake.py` opens a connection
  (`test_the_plugin_never_fetches_the_page_itself` blocks sockets and scans the module). The fetch is always Hermes's
  own `web_extract`, dispatched through the public tool registry. **Connect-time and redirect checks are Hermes's,
  not the plugin's:** `web_extract` runs `async_is_safe_url` on every URL before any backend, and Hermes's own
  httpx paths re-validate at TCP connect, dial the checked address, and re-validate each redirect target
  (`tools/url_safety.py`, `create_ssrf_safe_client` and `create_ssrf_safe_async_client`). That closes DNS rebinding
  between the plugin's check and the fetch for Hermes-owned fetchers. A third-party extract provider (Damon's is the
  Nous gateway; Firecrawl, Tavily and the others) fetches from its own network, never the writer's, so a private
  address there is the provider's network, not the writer's. Page text is kept as plain text (no HTML, images or link
  targets), capped at 200,000 characters, and failures come back in plain words (tested: missing web tool, blocked,
  sign-in walls, almost no text, unreadable replies).
- **PDF.** Hermes's Python has no PDF library (pypdf, pdfminer, PyMuPDF and pypdfium2 are all absent), so `pdf.py`
  reads PDFs with the standard library, with the caps Imprint's review asked for: 12 MB in, 40,000 objects, 10,000 per
  object stream, inflation counted while it inflates (16 MB a stream, 96 MB in all), 1,500 pages, 400,000 characters,
  3 million operators, forms nested 3 deep and painted 2,000 times in all (never inside themselves), and 20 seconds.
  Tested with built PDFs: a 60 KB stream that inflates past 16 MB is refused in under a second; Imprint's "tiny PDF"
  (one form painted 100,000 times, under 20 KB) stops and keeps the text read before it; a self-painting form; an
  object stream claiming 9 million objects; 5,000 nested arrays; a locked PDF; a scan. The read runs off the event
  loop (`asyncio.to_thread`). Checked by hand on real PDFs from Chrome, CUPS and two government documents (not
  committed).
- **The scene picture.** JPEG, PNG or WebP only, recognized by their bytes, never by name or the page's word (SVG,
  GIF and anything else refused, so no script can arrive as a picture); 6 MB; width and height read from the header,
  12,000 pixels a side and 60 million in all, so a small file can't ask the page to decode a huge image. Kept as
  `plugin-data/clearing/scene/picture.<ext>` (one at a time, written to a `.part` file first), checked again before
  it is served, and served to the page as a `data:` URL inside the room's own style. Removable.
- **Dictation.** Press first, enforced on the backend: when Hermes's speech-to-text is a cloud service, or Hermes
  decides at run time, a recording is refused (`needs_press`) unless the request names the same service the plan names
  now (`send_to`), and the page asks only after naming it. A press for one service is not consent for another (tested).
  Audio is 25 MB at most, recognized by its bytes (WebM, Ogg, MP4, WAV), converted with PyAV only, written to
  `plugin-data/clearing/tmp/` only while it is transcribed and deleted after (tested), and nothing is kept. The
  `tools.voice_mode` import is off Hermes's public plugin API list; it is guarded, so a Hermes that moves it falls
  back to faster-whisper already on the computer (read-only, never downloaded) or says dictation needs speech-to-text.
- **Suggested text.** The model's words reach the page only through `useSuggested` (and the existing keeps), each
  called only from a button (`tests/js/suggest.test.mjs` scans `room.jsx`; `harness/check-notes.mjs` checks the
  page is unchanged after every landing). Each insertion saves the page first (A-10, extended to `useSuggested` in
  `test_audit.py`) and records what it replaced, what went in and the model. The off switch is stored by the backend
  and enforced there (`library.SUGGESTIONS_OFF` for every kind in `SUGGEST_KINDS`; passes lose their "try"), so a
  stale or hostile page can't get suggestions from a room set to off. Model text is bounded (a rewrite at most twice
  its selection plus 200 characters, a next sentence 500, a title 140) and shown as text, never as HTML.

### Still open

- No independent review of this branch yet; ask for one before release (the earlier reviews were by a separate agent).
- No live run: links through the Nous gateway, dictation through Damon's speech-to-text, and real PDFs from Word and
  Google Docs are on `docs/LIVE-TEST.md` section 9.
