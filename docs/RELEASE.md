# Releasing The Clearing

Run these on the commit you are about to release, in this order. Each one must pass. Publishing (the public repo, the push, the catalog PR) waits for Damon.

1. **Release check: `scripts/release-check.sh`.** Runs the upstream overlap test, which the ordinary test run skips, and then the whole suite. Set `CLEARING_UPSTREAM` to the folder with the upstream Compound Writing files:

   ```
   CLEARING_UPSTREAM=/path/to/compound-writing-source scripts/release-check.sh
   ```

   It fails loudly if the variable is missing, if the folder isn't there, or if the overlap test is skipped or finds a 12-word run of shipped text in the upstream files.
2. **Secrets: `gitleaks git . --redact`** over all history, and `gitleaks dir . --redact` over the tree. Both clean.
3. **Bundle is current:** `node <hermes-ui-kit>/scripts/build.mjs . --check` from this folder, with a checkout of hermes-ui-kit.
4. **Pin the catalog entry:** `/usr/bin/python3 scripts/pin_catalog.py` on the release commit, then replace SHA in `docs/catalog/PR.md`.

The thesaurus data in `library/thesaurus/` is rebuilt only when the WordNet release changes: `node scripts/build-thesaurus.mjs <unzipped english-wordnet json folder>` writes the shards and `NOTICE.txt` in place. Check the WordNet notice is still in `NOTICE.txt` and in every shard afterwards.
