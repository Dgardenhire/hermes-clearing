// The Ask line: plain words in, the right pass out. It matches over the whole library the backend runs
// (library/*.json, bundled into the page at build time so it works with the backend off).
// buildTargets() mirrors library.py targets(); tests/js/ask.test.mjs checks the two agree.

export function buildTargets(lib) {
  const { methods, paths, passes, add } = lib
  const out = []
  for (const p of passes.passes) {
    out.push({ id: `pass:${p.id}`, kind: p.kind, title: p.title, detail: p.detail, group: 'Editor passes', aliases: '' })
  }
  const o = add.openings
  out.push({ id: 'openings', kind: 'openings', title: o.title, detail: o.detail, group: 'Editor passes', aliases: o.aliases })
  for (const f of add.flips) out.push({ id: `flip:${f.id}`, kind: 'flip', title: f.title, detail: f.detail, group: 'Editor passes', aliases: f.aliases })
  const c = add.cuts
  out.push({ id: c.id, kind: 'cuts', title: c.title, detail: c.detail, group: 'Editor passes', aliases: c.aliases })
  const w = add.wording
  out.push({ id: w.id, kind: 'wording', title: w.title, detail: w.detail, group: 'Editor passes', aliases: w.aliases })
  const sug = add.suggest
  for (const x of sug.items) out.push({ id: x.id, kind: x.kind, title: x.title, detail: x.detail, group: sug.title, aliases: x.aliases, ...(x.hidden ? { hidden: true } : {}) })
  for (const c of add.composition.checks) {
    out.push({ id: `check:${c.id}`, kind: 'findings', title: c.title, detail: add.composition.detail, group: add.composition.title, aliases: c.aliases })
  }
  for (const m of methods.methods) {
    const room = add.rooms[m.id] || {}
    out.push({ id: `method:${m.id}`, kind: ROOM_KINDS[m.room], title: m.title, detail: room.detail || m.help, group: 'Methods', aliases: m.aliases || '' })
  }
  for (const p of allPaths(paths, add)) {
    const forLine = (add.ask && add.ask.paths[p.id]) || ''
    for (const f of p.focuses) {
      out.push({ id: `craft:${f.id}`, kind: 'note', title: f.title, detail: f.detail, group: p.title, subgroup: f.group || '', aliases: f.aliases || '', for: forLine })
    }
  }
  setPhrases(add.ask && add.ask.phrases)
  return out.map(t => ({ ...t, aliases: askAliases(t.id, t.aliases, add) }))
}

// The words writers actually type (additions.json `ask`): extra aliases per target, and words a target should
// stop answering to. library.py targets() applies the same rule.
export function askAliases(id, aliases, add) {
  const ask = add.ask || { aliases: {}, drop: {} }
  const drop = new Set(String(ask.drop[id] || '').split(' ').filter(Boolean))
  const base = String(aliases || '').split(' ').filter(w => w && !drop.has(w))
  return [...base, ...String(ask.aliases[id] || '').split(' ').filter(Boolean)].join(' ')
}

// How each method runs in the room (library.py ROOM_KINDS).
export const ROOM_KINDS = { note: 'note', draft: 'draft', voice: 'voice', panel: 'panel', debate: 'debate', lessons: 'lessons', guidance: 'guidance', home: 'home', across: 'across' }

export function allPaths(paths, add) {
  const story = add.story
  return paths.paths.map(p => p.id !== story.path ? p : {
    ...p,
    focuses: [...p.focuses, ...story.focuses.map((f, i) => ({ id: `${p.id}:arc-${i + 1}`, group: story.group, ...f, added: true }))],
  })
}

const STOP = new Set('i my me it is this that the a an to of for and am can do how with what some has have does get need want help make use please could would should be its im feel feels so too very really check'.split(' '))
const WEAK = new Set(['check'])
let PHRASES = {}
// The Ask line's whole-phrase matches come from the library (additions.json ask.phrases); buildTargets sets them.
export function setPhrases(phrases) { PHRASES = phrases || {} }
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const words = s => new Set(norm(s).split(' ').filter(Boolean))

// A craft path's for line, short enough for an Ask line row: "For fiction, memoir and personal essays" is
// "fiction, memoir". All methods shows the whole line.
export function shortFor(line) {
  return String(line || '').replace(/^For /, '').split(/, | and /).slice(0, 2).join(', ')
}

// The kinds that put model text in front of the writer (library.py SUGGEST_KINDS). "Suggested text: Off" in The
// room takes them out of the Ask line and All methods; the backend refuses them too.
export const SUGGEST_KINDS = new Set(['wording', 'openings', 'flip', 'draft', 'rewrite', 'next', 'endings', 'titles', 'apply'])
export function forRoom(targets, suggestions = true) {
  return targets.filter(t => !t.hidden && (suggestions || !SUGGEST_KINDS.has(t.kind)))
}

// What the built-in tools are. The old label read to Damon (Nov 8) as "available to any user": the label now says
// they come with The Clearing, run without a model, and send nothing anywhere (Loop 2: the banned-phrase grep).
export const BUILT_IN = 'Built in, no AI needed'
export const BUILT_IN_DETAIL = "Built into The Clearing. They work without your model."

// The few passes shown before the writer types anything.
export const STARTERS = ['local:quick', 'local:words', 'pass:weakest', 'pass:hedges', 'pass:long', 'pass:convoluted', 'pass:tone', 'pass:typos', 'openings', 'cut',
  'method:thesis', 'method:reader', 'method:objections', 'method:bluf', 'method:momentum']

export const QUICK = { id: 'local:quick', kind: 'local', title: 'Quick check', detail: "Throat-clearing, stacked hedges, filler, stock phrases and long sentences in your piece. Built into The Clearing; it works without your model.", group: BUILT_IN, aliases: 'quick check fast instant offline local habits filler hedges cliches' }

export const WORDS = { id: 'local:words', kind: 'words', title: 'Other words', detail: "Other words for the word you selected, from the built-in dictionary. Works without your model.", group: BUILT_IN, aliases: 'thesaurus synonym synonyms another word better word dictionary alternative alternatives' }

export function figureIndex(figures) {
  const map = new Map()
  for (const g of figures.groups) for (const [name] of g.figures) map.set(norm(name), g.focus)
  return map
}

// Score every runnable target against the writer's words. Returns the best `limit`, best first.
export function findTargets(query, targets, { limit = 7, figures = null } = {}) {
  const runnable = [QUICK, WORDS, ...targets.filter(t => !t.hidden)]
  const q = norm(query)
  if (!q) return STARTERS.map(id => runnable.find(t => t.id === id)).filter(Boolean).slice(0, limit)
  // A lone "check" still means something; next to other words it says nothing about what to check.
  const strong = q.split(' ').filter(t => !STOP.has(t))
  const tokens = [...new Set(strong.length ? strong : q.split(' ').filter(t => WEAK.has(t)))]
  const phrased = new Map() // whole phrases a writer types, like "what does she want" (additions.json ask.phrases)
  for (const [source, ids] of Object.entries(PHRASES)) if (new RegExp(`(?:^| )(?:${source})(?: |$)`).test(q)) for (const id of ids) phrased.set(id, 40)
  const figureFocus = new Set()
  if (figures) {
    const idx = figureIndex(figures)
    for (const [name, focus] of idx) if (` ${q} `.includes(` ${name} `)) figureFocus.add(focus)
  }
  const scored = runnable.map(t => {
    const title = words(t.title), alias = words(t.aliases), group = words(`${t.group} ${t.subgroup || ''}`), detail = words(t.detail)
    const first = norm(t.aliases).split(' ')[0] // a target's first alias names its main subject
    let score = (norm(t.title) === q ? 100 : 0) + (phrased.get(t.id) || 0)
    for (const tok of tokens) {
      score += alias.has(tok) ? (tok === first ? 23 : 20) : title.has(tok) ? 12 : group.has(tok) ? 5 : detail.has(tok) ? 3 : stemHit(tok, title, alias) ? 6 : 0
    }
    if (figureFocus.has(t.title)) score += 60
    if (t.group === 'Editor passes' || t.kind === 'local') score += score ? 2 : 0 // ties go to the plain passes
    return { t, score }
  }).filter(x => x.score > 0)
  scored.sort((a, b) => b.score - a.score || a.t.title.localeCompare(b.t.title))
  return scored.slice(0, limit).map(x => x.t)
}

function stemHit(tok, ...sets) {
  if (tok.length < 5) return false
  const stem = tok.replace(/(ings|ing|ers|er|ed|es|s|ly)$/, '')
  if (stem.length < 4) return false
  for (const set of sets) for (const w of set) if (w.startsWith(stem)) return true
  return false
}

// The methods menu: everything the Ask line can run, in the library's own order and groups. Each section is
// { title, detail, items: [target] } or, for a craft path, items grouped by its subgroups. The figures by
// effect follow, each figure pointing at the technique that works with it.
export function libraryMenu(targets, add) {
  const sections = [{ title: BUILT_IN, detail: BUILT_IN_DETAIL, items: [QUICK, WORDS] }]
  const byGroup = new Map()
  for (const t of targets.filter(x => !x.hidden)) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, [])
    byGroup.get(t.group).push(t)
  }
  for (const [title, items] of byGroup) {
    const detail = title === add.composition.title ? add.composition.detail : title === add.suggest.title ? add.suggest.detail : (items[0] && items[0].for) || ''
    const subs = [...new Set(items.map(t => t.subgroup || ''))]
    const parts = subs.length > 1 ? subs.map(s => ({ title: s, items: items.filter(t => (t.subgroup || '') === s) })) : null
    sections.push({ title, detail, items, parts })
  }
  const figures = add.figures.groups.map(g => ({
    focus: g.focus, target: targets.find(t => t.title === g.focus) || null,
    figures: g.figures.map(([name, definition, example]) => ({ name, definition, example })),
  }))
  return { sections, figures: { title: add.figures.title, detail: add.figures.detail, groups: figures } }
}
