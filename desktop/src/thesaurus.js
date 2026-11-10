// Better words: the instant thesaurus from the web app (src/thesaurus.js), unchanged except that shards come
// from The Clearing's backend (GET /thesaurus/{key}) instead of public/. Open English WordNet 2025 (CC BY 4.0) and
// WordNet 3.1 (Princeton license); notice in library/thesaurus/NOTICE.txt. No model call. Pure: node tests load it.
const POS_LABEL = { n: "noun", v: "verb", a: "adjective", r: "adverb" };
function normalizeSelection(selection) {
  const trimmed = selection.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > 40) return null;
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(trimmed)) return null;
  return trimmed;
}
function shardKey(word) {
  const head = word.toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(head) ? head : /^[a-z]/.test(head) ? `${head[0]}_` : "__";
}
const VOWEL = /[aeiou]/;
const SAME_PAST = Object.fromEntries(
  "bend:bent bind:bound bleed:bled breed:bred bring:brought build:built burn:burnt buy:bought catch:caught cling:clung creep:crept deal:dealt dig:dug dream:dreamt feed:fed feel:felt fight:fought find:found flee:fled fling:flung get:got grind:ground hang:hung have:had hear:heard hold:held keep:kept kneel:knelt lay:laid lead:led lean:leant leap:leapt learn:learnt leave:left lend:lent light:lit lose:lost make:made mean:meant meet:met pay:paid say:said seek:sought sell:sold send:sent shine:shone shoot:shot sit:sat sleep:slept slide:slid spend:spent spin:spun stand:stood stick:stuck sting:stung strike:struck sweep:swept swing:swung teach:taught tell:told think:thought understand:understood weep:wept win:won wind:wound wring:wrung bet:bet burst:burst cast:cast cost:cost cut:cut fit:fit hit:hit hurt:hurt let:let put:put quit:quit read:read rid:rid set:set shed:shed shut:shut slit:slit split:split spread:spread thrust:thrust upset:upset".split(" ").map((pair) => pair.split(":"))
);
const SPLIT_PAST = new Set(
  "arise awake be bear beat become begin bite blow break choose come do draw drink drive eat fall fly forbid forget forgive freeze give go grow hide know lie ride ring rise run see shake show shrink sing sink speak steal stink strive swear swim take tear throw tread wake wear weave write".split(" ")
);
function pastForm(word) {
  const space = word.indexOf(" ");
  const head = space > 0 ? word.slice(0, space) : word;
  const rest = space > 0 ? word.slice(space) : "";
  if (SAME_PAST[head]) return `${SAME_PAST[head]}${rest}`;
  if (SPLIT_PAST.has(head)) return null;
  return applySuffix(word, "ed");
}
function lemmaCandidates(word) {
  const w = word.toLowerCase().replace(/[’]/g, "'");
  const out = [{ lemma: w, suffix: "" }];
  const add = (lemma, suffix) => {
    if (lemma.length >= 2 && !out.some((c) => c.lemma === lemma)) out.push({ lemma, suffix });
  };
  if (w.endsWith("ies") && w.length > 4) add(`${w.slice(0, -3)}y`, "s");
  if (w.endsWith("es") && w.length > 3) add(w.slice(0, -2), "s");
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) add(w.slice(0, -1), "s");
  if (w.endsWith("ied") && w.length > 4) add(`${w.slice(0, -3)}y`, "ed");
  if (w.endsWith("ed") && w.length > 3) {
    const stem = w.slice(0, -2);
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) add(stem.slice(0, -1), "ed");
    add(stem, "ed");
    add(`${stem}e`, "ed");
  }
  if (w.endsWith("ing") && w.length > 4) {
    const stem = w.slice(0, -3);
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) add(stem.slice(0, -1), "ing");
    add(stem, "ing");
    add(`${stem}e`, "ing");
  }
  if (w.endsWith("ier") && w.length > 4) add(`${w.slice(0, -3)}y`, "er");
  if (w.endsWith("iest") && w.length > 5) add(`${w.slice(0, -4)}y`, "est");
  if (w.endsWith("er") && w.length > 4) add(w.slice(0, -2), "er");
  if (w.endsWith("est") && w.length > 5) add(w.slice(0, -3), "est");
  if (w.endsWith("ly") && w.length > 4) add(w.slice(0, -2), "ly");
  return out;
}
function applySuffix(word, suffix) {
  if (!suffix) return word;
  const space = word.indexOf(" ");
  if (space > 0) return `${applySuffix(word.slice(0, space), suffix)}${word.slice(space)}`;
  const last = word[word.length - 1];
  const beforeLast = word[word.length - 2] || "";
  const oneSyllable = (word.match(/[aeiouy]+/g) || []).length === 1;
  if (["ed", "ing", "er", "est"].includes(suffix) && oneSyllable && /[^aeiou][aeiou][bdglmnprt]$/.test(word) && word.length <= 5) {
    return `${word}${last}${suffix}`;
  }
  if (suffix === "s") {
    if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
    if (last === "y" && !VOWEL.test(beforeLast)) return `${word.slice(0, -1)}ies`;
    return `${word}s`;
  }
  if (suffix === "ed" || suffix === "er" || suffix === "est") {
    const tail = suffix.slice(1);
    if (last === "e") return `${word}${tail}`;
    if (last === "y" && !VOWEL.test(beforeLast)) return `${word.slice(0, -1)}i${suffix}`;
    return `${word}${suffix}`;
  }
  if (suffix === "ing") {
    if (word.endsWith("ie")) return `${word.slice(0, -2)}ying`;
    if (last === "e" && word.length > 2 && !word.endsWith("ee")) return `${word.slice(0, -1)}ing`;
    return `${word}ing`;
  }
  if (suffix === "ly") {
    if (last === "y") return `${word.slice(0, -1)}ily`;
    return `${word}ly`;
  }
  return `${word}${suffix}`;
}
function matchCase(original, replacement) {
  if (original.length > 1 && original === original.toUpperCase() && /\p{L}/u.test(original)) {
    return replacement.toUpperCase();
  }
  if (original[0] && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
const SUFFIX_POS = {
  "": ["n", "v", "a", "r"],
  s: ["n", "v"],
  ed: ["v", "a"],
  ing: ["v", "n", "a"],
  er: ["a"],
  est: ["a"],
  ly: ["r"]
};
function lookupInShards(selection, getShard) {
  const query = normalizeSelection(selection);
  if (!query) return { query: selection.trim(), lemma: null, groups: [] };
  const lower = query.toLowerCase();
  const candidates = lemmaCandidates(lower);
  const irregular = getShard(shardKey(lower))?.f?.[lower];
  if (irregular) candidates.splice(1, 0, { lemma: irregular, suffix: "" });
  for (const { lemma, suffix } of candidates) {
    const entry = getShard(shardKey(lemma))?.w[lemma];
    if (!entry) continue;
    const allowed = SUFFIX_POS[suffix] || SUFFIX_POS[""];
    const groups = [];
    for (const [pos, gloss, words] of entry) {
      if (!allowed.includes(pos)) continue;
      const shown = words.filter((w) => !(pos === "v" && w.includes(" "))).map((w) => irregular === lemma ? w : suffix === "ed" && pos === "v" ? pastForm(w) : applySuffix(w, suffix)).filter((w) => !!w).map((w) => matchCase(query, w)).filter((w) => w.toLowerCase() !== lower);
      if (shown.length) groups.push({ pos, gloss, words: shown });
    }
    if (groups.length) return { query, lemma, groups };
  }
  return { query, lemma: null, groups: [] };
}
function createThesaurus(fetchShard) {
  const shards = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  function load(key) {
    if (shards.has(key)) return Promise.resolve();
    const pending = inflight.get(key);
    if (pending) return pending;
    const next = fetchShard(key).then((shard) => {
      shards.set(key, shard && typeof shard === "object" && shard.w ? shard : { w: {} });
    }).catch(() => {
    }).finally(() => inflight.delete(key));
    inflight.set(key, next);
    return next;
  }
  function keysFor(selection) {
    const query = normalizeSelection(selection);
    if (!query) return [];
    const keys = /* @__PURE__ */ new Set();
    for (const { lemma } of lemmaCandidates(query)) keys.add(shardKey(lemma));
    return [...keys];
  }
  function peek(selection) {
    const keys = keysFor(selection);
    if (!keys.every((key) => shards.has(key))) return null;
    const result = lookupInShards(selection, (key) => shards.get(key));
    if (result.lemma && !shards.has(shardKey(result.lemma))) return null;
    return result;
  }
  return {
    peek,
    async lookup(selection) {
      const now = peek(selection);
      if (now) return now;
      await Promise.all(keysFor(selection).map(load));
      const lower = normalizeSelection(selection)?.toLowerCase();
      const irregular = lower ? shards.get(shardKey(lower))?.f?.[lower] : void 0;
      if (irregular) await load(shardKey(irregular));
      return lookupInShards(selection, (key) => shards.get(key));
    },
    async prefetch(words) {
      const keys = /* @__PURE__ */ new Set();
      for (const word of words) {
        const q = normalizeSelection(word);
        if (q) keys.add(shardKey(q));
        if (keys.size >= 40) break;
      }
      await Promise.all([...keys].map(load));
    },
    loadedShards: () => shards.size
  };
}
export {
  POS_LABEL,
  applySuffix,
  createThesaurus,
  lemmaCandidates,
  lookupInShards,
  matchCase,
  normalizeSelection,
  pastForm,
  shardKey
};
