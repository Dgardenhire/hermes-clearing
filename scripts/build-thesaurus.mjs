#!/usr/bin/env node
// Builds The Clearing's bundled thesaurus (library/thesaurus/) from the Open English WordNet JSON release.
//
//   node scripts/build-thesaurus.mjs <path-to-unzipped-oewn-json> [outDir]
//
// Source: https://github.com/globalwordnet/english-wordnet/releases
// (english-wordnet-2025-json.zip). The output is one small JSON shard per
// two-letter prefix in library/thesaurus/, which the backend serves (GET /thesaurus/{key})
// to the page's Better words (desktop/src/thesaurus.js). No model call, no third-party
// lookup: the writer's selected word never leaves the computer.
//
// Provenance: this script was written for Byline and carried into the web app with its shards; the 360
// shards in library/thesaurus/ are byte-for-byte that output (128,009 entries, the count NOTICE.txt
// records). Only these header lines and the default outDir changed when it came here, so a rebuild from
// the same release should reproduce them (not re-run here: the release zip is not part of this repository).
//
// Each shard carries the WordNet notice, because the Princeton terms ask that
// it "appear on ALL copies" of the database, modifications included.
//
// Shard shape:
//   { "notice": "...", "w": { "word": [[pos, gloss, [synonym, ...]], ...] },
//     "f": { "ran": "run" } }       // irregular forms -> lemma
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , srcDir, outArg] = process.argv;
if (!srcDir) {
  console.error("Usage: node scripts/build-thesaurus.mjs <oewn-json-dir> [outDir]");
  process.exit(1);
}
const outDir = outArg || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "library", "thesaurus");

const NOTICE = [
  "Synonyms derived from Open English WordNet 2025 (https://en-word.net), CC BY 4.0, by the Open English Wordnet team,",
  "and from WordNet 3.1, Copyright 2011 by Princeton University. All rights reserved.",
  "Permission to use, copy, modify and distribute this software and database and its documentation for any purpose and",
  "without fee or royalty is hereby granted, provided that you agree to comply with the following copyright notice and",
  "statements, including the disclaimer, and that the same appear on ALL copies of the software, database and",
  "documentation, including modifications that you make for internal use or for distribution.",
  'THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES,',
  "EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR",
  "WARRANTIES OF MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE LICENSED SOFTWARE,",
  "DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.",
  "The name of Princeton University or Princeton may not be used in advertising or publicity pertaining to distribution",
  "of the software and/or database. Title to copyright in this software, database and any associated documentation",
  "shall at all times remain with Princeton University and LICENSEE agrees to preserve same.",
].join(" ");

// Limits keep the shards small and the popover readable.
const MAX_SENSES = 4; // sense groups per word
const MAX_PER_SENSE = 7; // synonyms per sense group
const MAX_TOTAL = 20; // synonyms per word, all senses
const MAX_WORDS_IN_PHRASE = 3; // for synonyms; looked-up words are single words
const GLOSS_CHARS = 56;
// Taxonomy files: tens of thousands of species names nobody reaches for a
// thesaurus to replace. Leaving them out halves the bundle.
const SKIP_LEXFILES = new Set(["noun.plant.json", "noun.animal.json"]);

// Usage labels whose synsets we never offer as synonyms.
const OFFENSIVE_LABELS = new Set([
  "ethnic slur",
  "slur",
  "obscenity",
  "vulgarism",
  "profanity",
  "disparagement",
  "derogation",
  "dirty word",
]);

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".json"));
const synsets = {};
for (const f of files) {
  if (f.startsWith("entries-") || f === "frames.json" || SKIP_LEXFILES.has(f)) continue;
  Object.assign(synsets, JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8")));
}

const offensiveLabelIds = new Set(
  Object.entries(synsets)
    .filter(([, s]) => (s.members || []).some((m) => OFFENSIVE_LABELS.has(m.toLowerCase())))
    .map(([id]) => id)
);
const offensiveSynsets = new Set(
  Object.entries(synsets)
    .filter(([, s]) => (s.exemplifies || []).some((id) => offensiveLabelIds.has(id)))
    .map(([id]) => id)
);

const usable = (word) =>
  word &&
  word === word.toLowerCase() &&
  !/[0-9_]/.test(word) &&
  word.split(/[\s-]+/).length <= MAX_WORDS_IN_PHRASE;

const shortGloss = (synset) => {
  const def = (synset.definition || [""])[0].replace(/\s+/g, " ").trim();
  if (def.length <= GLOSS_CHARS) return def;
  const cut = def.slice(0, GLOSS_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : GLOSS_CHARS)}...`;
};

const words = {};
const forms = {};
let entryCount = 0;
for (const f of files.filter((name) => name.startsWith("entries-"))) {
  const entries = JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"));
  for (const [lemma, byPos] of Object.entries(entries)) {
    entryCount += 1;
    if (!usable(lemma) || /\s/.test(lemma)) continue;
    const groups = [];
    const seen = new Set([lemma]);
    let total = 0;
    for (const [posKey, info] of Object.entries(byPos)) {
      for (const form of info.form || []) {
        const lower = form.toLowerCase();
        if (lower !== lemma && usable(lower) && !forms[lower]) forms[lower] = lemma;
      }
      for (const sense of info.sense || []) {
        if (groups.length >= MAX_SENSES || total >= MAX_TOTAL) break;
        const synset = synsets[sense.synset];
        if (!synset || offensiveSynsets.has(sense.synset)) continue;
        const pos = posKey === "s" ? "a" : posKey; // satellite adjectives read as adjectives
        const pool = [...(synset.members || [])];
        if (pos === "a") {
          for (const id of (synset.similar || []).slice(0, 2)) {
            if (!offensiveSynsets.has(id)) pool.push(...(synsets[id]?.members || []));
          }
        }
        const list = [];
        for (const member of pool) {
          const m = member.toLowerCase() === member ? member : null;
          if (!m || seen.has(m) || !usable(m)) continue;
          seen.add(m);
          list.push(m);
          total += 1;
          if (list.length >= MAX_PER_SENSE || total >= MAX_TOTAL) break;
        }
        if (list.length) groups.push([pos, shortGloss(synset), list]);
      }
    }
    if (groups.length) words[lemma] = groups;
  }
}

// Two-letter shards ("th", "st", ...) keep each cold fetch small. A word
// that starts with one letter and a non-letter uses "t_"; anything else "__".
const shardOf = (word) => {
  const head = word.slice(0, 2);
  return /^[a-z]{2}$/.test(head) ? head : /^[a-z]/.test(head) ? `${head[0]}_` : "__";
};
const shards = {};
for (const [word, groups] of Object.entries(words)) {
  const key = shardOf(word);
  (shards[key] ||= { notice: NOTICE, w: {}, f: {} }).w[word] = groups;
}
for (const [form, lemma] of Object.entries(forms)) {
  if (!words[lemma]) continue;
  const key = shardOf(form);
  (shards[key] ||= { notice: NOTICE, w: {}, f: {} }).f[form] = lemma;
}

fs.mkdirSync(outDir, { recursive: true });
let bytes = 0;
for (const [key, shard] of Object.entries(shards)) {
  const json = JSON.stringify(shard);
  bytes += json.length;
  fs.writeFileSync(path.join(outDir, `${key}.json`), json);
}
fs.writeFileSync(
  path.join(outDir, "NOTICE.txt"),
  `${NOTICE}\n\nBuilt by scripts/build-thesaurus.mjs from ${entryCount} Open English WordNet entries.\n`
);
console.log(
  `thesaurus: ${Object.keys(words).length} words, ${Object.keys(forms).length} forms, ${Object.keys(shards).length} shards, ${(bytes / 1024).toFixed(0)} KB raw -> ${outDir}`
);
