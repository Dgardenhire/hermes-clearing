# Security

## Reporting a problem

Open an issue at https://github.com/Dgardenhire/hermes-clearing/issues. If the problem should not be public first,
the issue should say only that you have a security problem, with no details, and a private way to send them will be
arranged. Expect a first reply within a week.

## What The Clearing does

- **Backend** (`__init__.py`, `dashboard/plugin_api.py` and the modules they call): the page's routes inside Hermes's
  plugin host, one model setting (`clearing_editor`) and one observe-only `post_auxiliary_call` hook that reads only
  the finish reason, model name and token counts of its own calls, never prompt or reply text. No tools, no
  middleware.
- **Desktop page** (`desktop/plugin.js`): one built ES module that imports only `@hermes/plugin-sdk`, `react` and
  `react/jsx-runtime`. Its source is `desktop/src/`, `library/` and `vendor/hermes-ui-kit/`;
  `node scripts/verify-bundle.mjs` rebuilds it and exits 0 only if the result is byte-identical.

## Boundaries it holds itself to

- **No outside programs.** It starts none; `tests/test_no_launches.py` fails if a launch appears in the plugin's code.
- **No credentials, telemetry, schedules or self-updates.**
- **The internet only through Hermes**, and only when the writer starts something: editor passes to the writer's
  model, Bring in a link through Hermes's web tool after a public-address check, Talk it through to Hermes's
  speech-to-text (a cloud service waits for a press on Send).
- **Word files and PDFs are read here, with the standard library only**, and every step is bounded: file size, object
  count, inflated bytes, pages, characters, operators, nested forms and time (see the top of `pdf.py`; `docx.py`
  refuses any DTD). `tests/test_fuzz_readers.py` feeds both readers thousands of damaged files and fails on anything
  but a read or a plain refusal.

## Data

Everything it keeps is in `plugin-data/clearing` inside the Hermes folder. Deleting that folder erases it.

## What a reviewer can check

- `hermes plugins validate .`
- `/usr/bin/python3 -m unittest discover -s tests`
- `npm ci --ignore-scripts --prefix vendor/hermes-ui-kit && node scripts/verify-bundle.mjs`
