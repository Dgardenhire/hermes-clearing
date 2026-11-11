// Find figures of speech and Where to add a technique: the page side. The model proposes only where (a quote), which library item
// (an id) and why; the name and definition shown come from the library itself (LIB, the same JSON the backend reads),
// looked up here by id. An id the library doesn't have shows nothing.

export const TYPE_LABEL = { figure: 'Figure', method: 'Method', craft: 'Craft step' }

// The methods Where to add a technique may name (library.py OPP_METHODS): the ones that work on one passage.
export const OPP_METHODS = new Set(['bluf', 'hook', 'transition', 'analogy', 'simplify', 'tracks', 'reader', 'objections', 'economy', 'tension', 'mom', 'specificity', 'momentum'])

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s)

// One method, figure or craft step by its id, exactly as the library holds it: { id, type, name, definition, group }.
export function libraryItem(lib, id) {
  const s = String(id || '')
  const add = lib && lib.add
  if (!add) return null
  if (s.startsWith('figure:')) {
    const name = s.slice(7)
    for (const g of add.figures.groups) {
      const f = g.figures.find(x => x[0] === name)
      if (f) return { id: s, type: 'figure', name: cap(f[0]), definition: f[1], example: f[2], group: g.focus }
    }
    return null
  }
  if (s.startsWith('method:')) {
    const m = lib.methods.methods.find(x => `method:${x.id}` === s)
    return m && OPP_METHODS.has(m.id) ? { id: s, type: 'method', name: m.title, definition: m.description, group: 'Methods' } : null
  }
  if (s.startsWith('craft:')) {
    const fid = s.slice(6)
    for (const p of lib.paths.paths) {
      const f = p.focuses.find(x => x.id === fid)
      if (f) return { id: s, type: 'craft', name: f.title, definition: f.detail, group: p.title }
      const story = add.story
      if (story && p.id === story.path) {
        const i = story.focuses.findIndex((x, k) => `${p.id}:arc-${k + 1}` === fid)
        if (i >= 0) return { id: s, type: 'craft', name: story.focuses[i].title, definition: story.focuses[i].detail, group: p.title }
      }
    }
  }
  return null
}

// The marks a Find figures of speech result draws in the page, one per figure, in page order. Only figures the library
// knows are kept, with the library's name and definition.
export function figureMarks(lib, result, stamp = Date.now()) {
  return ((result && result.figures) || []).map((f, i) => {
    const it = libraryItem(lib, f.id)
    return it && it.type === 'figure' ? { id: `fg${stamp}-${i}`, kind: 'figure', status: 'open', start: f.start, end: f.end, quote: f.quote, item: f.id,
      name: it.name, definition: it.definition, group: it.group, works: f.works !== false, text: f.why || '' } : null
  }).filter(Boolean)
}

// The marks a Where to add a technique result draws, numbered by rank in the page and the margin.
export function oppMarks(lib, result, stamp = Date.now()) {
  return ((result && result.opportunities) || []).map((o, i) => {
    const it = libraryItem(lib, o.id)
    return it ? { id: `op${stamp}-${i}`, kind: 'opp', status: 'open', start: o.start, end: o.end, quote: o.quote, item: o.id, type: it.type,
      name: it.name, definition: it.definition, group: it.group, text: o.why || '', rank: i + 1, n: i + 1 } : null
  }).filter(Boolean).map((m, i) => ({ ...m, rank: i + 1, n: i + 1 }))
}

export const whyLabel = m => (m.kind === 'figure' ? (m.works ? 'Why it works here' : "Why it doesn't land yet") : 'Why here')

export const typeLine = m => (m.type === 'craft' ? `${TYPE_LABEL.craft} · ${m.group}` : m.kind === 'figure' || m.type === 'figure' ? `${TYPE_LABEL.figure} · ${m.group}` : TYPE_LABEL[m.type] || '')

const squash = s => String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').split(/\s+/).filter(Boolean).join(' ')

// Ask the coach only once the writer's try is a real line and not the words they started from.
export function canAskCoach(line, quote) {
  const l = squash(line)
  return l.split(' ').length >= 3 && l.length <= 1200 && l !== squash(quote)
}

// Use mine: the writer's own version goes into the page only when it differs from the words it replaces.
export const canUseMine = (line, quote) => !!squash(line) && squash(line) !== squash(quote)
