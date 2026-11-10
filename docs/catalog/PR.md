<!-- DRAFT. Not opened. Title: feat(plugin-catalog): add clearing (The Clearing, a writing room)
     Before opening: run scripts/pin_catalog.py on the release commit, copy docs/catalog/clearing.yaml to
     plugin-catalog/clearing.yaml in a hermes-agent branch, and replace SHA below with the pinned commit. -->

## What does this PR do?

Adds `plugin-catalog/clearing.yaml`: **The Clearing**, a writing room for Hermes Desktop.

You write in one quiet page, set in Libre Caslon Text, inside a scene that follows your Hermes theme. When you want a second pair of eyes, the editor gives you one note at a time, pinned to the exact words it is about, and runs on your own Hermes model. Suggestions show in your page and go in when you click Use this: corrections come as change records you keep or skip, proposed openings preview in place with yours one click away, and proposed cuts are struck through in place.

It is more than a prompt: a local Quick check and a local thesaurus (Open English WordNet) work without a model; every quote the model returns is checked against the text before it is shown; pieces have versions, a trash you can undo, and .docx in and out through Hermes's save dialog; and a cut-off answer is caught with `post_auxiliary_call`'s finish reason plus a token ceiling and a parse check, so a half answer never lands.

## Type of change

New catalog entry (community tier).

## Changes made

- `plugin-catalog/clearing.yaml` (one new file), pinned to `Dgardenhire/hermes-clearing@SHA`, `requires_hermes: ">=0.22.6"` (it uses `ctx.files`), the same floor as its `plugin.yaml`.

## Disclosures

- **Network:** no calls of its own. Editor passes and suggested text go through Hermes's plugin LLM access to the user's configured model, on the plugin's own auxiliary task `clearing_editor` (Settings, Models, Auxiliary), only when the user starts one. The piece or selected passage and its title are sent, with secrets removed by Hermes's redaction first. **Bring in a link** dispatches Hermes's own `web_extract` (public tool registry, as `ctx.dispatch_tool` does) after the plugin refuses non-public addresses; Hermes re-checks at connect time and on redirects (`tools/url_safety.py`). **Dictate** calls `tools.voice_mode.transcribe_recording` (off the public plugin API list, imported with a guard; precedent: Debate Workbench), and sends to a cloud speech-to-text only after the user pressed Send for that named service.
- **Microphone:** in-page `getUserMedia` only after the user clicks the microphone or Dictate; the recording is sent once and deleted after transcription.
- **Hook:** one observe-only `post_auxiliary_call` hook. It ignores every task but `clearing_editor` and reads only the finish reason, model name and token counts, kept in memory to catch cut-off answers. It never reads prompt or reply text and never changes a call.
- **Storage:** pieces, versions and pass results in `<HERMES_HOME>/plugin-data/clearing/clearing.db`; preferences and an unsaved-text buffer in desktop plugin storage.
- **Files:** reads only files the user picks; writes text exports only into a folder the user grants; builds Word exports in `<HERMES_HOME>/plugin-data/clearing/exports/` for Hermes's save dialog.
- **Suggested text:** opt-in, inserted only on a click, recorded with the model's name; a room setting turns it off and the backend refuses it then.
- **Not used:** tools of its own, middleware, env vars, credentials, shell commands, background work, camera, telemetry, self-updates.
- **Deleting:** nothing is deleted outright. Past 200 versions of one piece, the oldest pause-saves roll off.
- **License:** The Clearing's own code is under the PolyForm Shield License 1.0.0 (`PolyForm-Shield-1.0.0`): free to use, including for paid writing work; not for offering a competing product. Source-available, not OSI open source.
- **Bundled code:** `desktop/plugin.js` includes hermes-ui-kit, the author's own code, under the same PolyForm Shield license (`NOTICE`).
- **Third-party data bundled:** Libre Caslon Text (SIL OFL 1.1); Open English WordNet 2025 (CC BY 4.0) and WordNet 3.1 (Princeton license), notice in `library/thesaurus/NOTICE.txt`.
- **Install scanner:** one caution-level `role_pretend` hit in two WordNet shards. It is the dictionary's own definition of "impersonate" (an impersonation glosse you are not"), third-party data, not an instruction.
- **Credits:** the named editorial methods come from Compound Writing by Every (Katie Parrott). The Clearing's instructions are written independently, no Compound Writing file is included, and a 12-word overlap check runs on every release. Not affiliated with or endorsed by Every.

## How to test

1. `hermes plugins install clearing` and turn it on. The Clearing appears in the sidebar with a sample piece.
2. In the sample's offer, click **Quick check**: five notes, without a model call.
3. Double-click "modest": senses and other words from the local dictionary. Click one; it swaps in, and the original stays one click away.
4. Press Cmd E (Ctrl E), type "where do readers get lost", press Enter. A note from your model appears, naming the model.
5. Before any model is set up, run any pass: "Hermes doesn't have a model ready" with **Open Settings**, and the draft unchanged.

Hermes's own admission checks (`hermes_cli.plugin_validate`, the code behind `hermes plugins validate`) pass on the plugin, including the capability probe, declared hooks and desktop surface. The plugin's own suite: 64 Python tests and 18 JavaScript tests.

## Checklist

- [x] One file, only this entry
- [x] `requires_hermes` matches `plugin.yaml` and is not newer than the current release
- [x] Pinned 40-character sha; `version` matches the pinned code
- [x] Images on `raw.githubusercontent.com`, pinned to the same sha
- [x] Disclosures above and in the plugin's README
- [x] Tested on macOS. Windows and Linux are untested (listed in `known_issues`)
- [x] `tier: community`

## Screenshots

![The catalog card](https://raw.githubusercontent.com/Dgardenhire/hermes-clearing/SHA/docs/catalog/card.png)

| | |
|---|---|
| ![Quick check](https://raw.githubusercontent.com/Dgardenhire/hermes-clearing/SHA/docs/shots/quick-light.png) | ![An editor pass, green accent, dark](https://raw.githubusercontent.com/Dgardenhire/hermes-clearing/SHA/docs/shots/pass-dark-green.png) |
| ![Proposed openings](https://raw.githubusercontent.com/Dgardenhire/hermes-clearing/SHA/docs/shots/openings-light.png) | ![Better words](https://raw.githubusercontent.com/Dgardenhire/hermes-clearing/SHA/docs/shots/words2-dark.png) |
| ![Try a shorter draft](https://raw.githubusercontent.com/Dgardenhire/hermes-clearing/SHA/docs/shots/cuts-light.png) | ![Before a model is set up](https://raw.githubusercontent.com/Dgardenhire/hermes-clearing/SHA/docs/shots/nomodel-dark.png) |
