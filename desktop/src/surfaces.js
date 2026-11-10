// The screens a stranger meets first (surfaces lane, Nov 8, 2026): the welcome card, the desk at rest, the blank
// page and Start from an idea, and Read my piece. Every word these screens show is here, in COPY, so a test can read
// all of it; the pure helpers behind welcome.jsx, desk.jsx, start.jsx and read.jsx live here too, because node can't
// import JSX. Field names follow docs/SUGGEST-API.md (lane B).

export const LIMIT = 600 // each Start from an idea answer
export const NEAR = 500 // the counter shows from here
export const LONG_PIECE = 1500 // words; a read this long is split into sections

export const COPY = {
  welcome: {
    title: 'Your writing room.',
    line: 'An AI editor reads your piece and shows its changes in your page. You pick which ones to use.',
    privacy: 'Your pieces stay in Hermes. When you ask the editor, the piece goes to the model you picked: a local model keeps it on your machine, and a cloud model sends it to that provider.',
    sample: 'Try it on the sample',
    fresh: 'Start a new piece',
    bring: 'Bring in a draft',
    models: 'Pick any model for your editor',
  },
  desk: {
    label: 'Your editor',
    read: 'Read my piece',
    figures: 'Spot the figures',
    opps: 'Find opportunities',
    reading: 'Your editor is reading',
    panel: "Get three editors' reads",
    ask: 'Ask the editor',
    rewrite: 'Rewrite a sentence',
    bring: 'Bring in',
    talk: 'Talk it through',
    quick: 'Quick check',
  },
  blank: {
    title: 'Start writing, or pick a way in',
    idea: 'Start from an idea',
    bring: 'Bring in a draft',
    talk: 'Talk it through',
    type: 'Just type',
  },
  start: {
    title: 'Start from an idea',
    who: 'Who is it for?',
    what: 'What should they do or feel when they finish?',
    know: "What do you know that they don't?",
    submit: 'Show me an outline',
    working: 'Making your outline',
    cancel: 'Cancel',
    empty: 'Answer at least one question first.',
    tooLong: `Keep each answer to ${LIMIT} characters.`,
    beats: 'Your outline',
    openings: 'Three ways to open',
    outline: 'Put the outline in my page',
    use: 'Use this opening',
    close: 'Close',
    blank: 'A blank to fill in',
  },
  read: {
    sending: 'Sending',
    reading: 'Your model is reading',
    checking: 'Checking every change against your words',
    starting: 'Your editor is reading',
    long: 'Long piece: about a minute',
    allSections: 'Every section read',
    stop: 'Stop',
    sample: 'Sample read, made ahead of time.',
    runOwn: 'Read my own piece',
    show: 'Show me',
    goTo: 'Go to these words',
    cut: 'Cut this first',
    query: 'A question to answer before you publish',
    panel: "Get three editors' reads",
    adds: "Adds something your piece doesn't say:",
    holds2: 'Only two changes worth making.',
    holds1: 'Only one change worth making.',
    holds0: 'Nothing here your editor would change.',
    thin: "Your editor didn't find changes worth making. Try a harder read, or pick a different model in Settings.",
    changes: 'Changes, most important first',
    keep: 'Your strongest line',
    firstNotes: 'First notes, while the rest are read',
    reporting: 'Reporting',
    reportingTip: 'A question of fact or sourcing, not of wording',
    cutTag: 'Cut',
  },
}

// Lucide-style 24 px paths, drawn at 15 px with a 1.5 px stroke.
export const ICON = {
  read: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  ask: 'M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12z',
  bring: 'M12 3v12 M7 10l5 5 5-5 M5 21h14',
  talk: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3',
  quick: 'M3 6l2 2 4-4 M3 16l2 2 4-4 M13 6h8 M13 12h8 M13 18h8',
  idea: 'M9 18h6 M10 22h4 M12 2a6 6 0 0 0-4 10.5c.8.8 1.4 1.7 1.6 2.5h4.8c.2-.8.8-1.7 1.6-2.5A6 6 0 0 0 12 2z',
  type: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  sample: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  fresh: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15h6',
  stop: 'M7 7h10v10H7z',
  check: 'M4 12.5l5 5L20 6.5',
  alert: 'M12 3l10 18H2z M12 10v4.5 M12 17.5v.5',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  cut: 'M6 6a3 3 0 1 0 0 .01 M6 18a3 3 0 1 0 0 .01 M8.1 8.1L20 20 M8.1 15.9L20 4',
  figures: 'M9 11l-6 6v3h9l3-3 M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  opps: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M16.2 7.8l-2.1 6.4-6.4 2.1 2.1-6.4z',
}

export const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

export function quickLabel(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0))
  return count === 0 ? `${COPY.desk.quick}: nothing to look at` : `${COPY.desk.quick}: ${plural(count, 'thing', 'things')} to look at`
}

// The desk at rest, top to bottom (and left to right in the narrow bar). A row whose action can't run here is left
// out rather than shown dead; Read my piece is never left out while it runs.
export function deskRows({ quickCount = 0, canRead = true, canAsk = true, canRewrite = false, canTalk = false, canBringIn = true, busy = false, modKey = 'Ctrl E' } = {}) {
  const rows = []
  // Spot the figures and Find opportunities sit beside Read my piece, in its lead; they run only when it can.
  if (canRead || busy) rows.push({ id: 'read', label: COPY.desk.read, short: COPY.desk.read, tight: COPY.desk.read, icon: 'read', primary: true, busy: !!busy, sub: { id: 'panel', label: COPY.desk.panel },
    beside: canRead && !busy ? [{ id: 'figures', label: COPY.desk.figures, icon: 'figures' }, { id: 'opps', label: COPY.desk.opps, icon: 'opps' }] : [] })
  if (canAsk) rows.push({ id: 'ask', label: COPY.desk.ask, short: COPY.desk.ask, tight: COPY.desk.ask, icon: 'ask', key: modKey })
  if (canRewrite) rows.push({ id: 'rewrite', label: COPY.desk.rewrite, short: COPY.desk.rewrite, tight: 'Rewrite', icon: 'type' })
  if (canBringIn) rows.push({ id: 'bring', label: COPY.desk.bring, short: COPY.desk.bring, tight: COPY.desk.bring, icon: 'bring' })
  if (canTalk) rows.push({ id: 'talk', label: COPY.desk.talk, short: COPY.desk.talk, tight: COPY.desk.talk, icon: 'talk' })
  const count = Math.max(0, Math.floor(Number(quickCount) || 0))
  rows.push({ id: 'quick', label: quickLabel(count), short: COPY.desk.quick, tight: count ? `${COPY.desk.quick}: ${count.toLocaleString('en-US')}` : COPY.desk.quick, icon: 'quick', count })
  return rows
}

export function clock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const PHASES = ['sending', 'reading', 'checking']

// What Read my piece is doing, in the server's own steps only (docs/SUGGEST-API.md section 1): never a guessed step
// and never a percentage. Returns the steps reached so far (earlier ones done), plus the extra lines.
export function progressLine({ phase, words, elapsed, sections } = {}) {
  const n = Math.max(0, Math.floor(Number(words) || 0))
  const label = p => p === 'sending' ? `${COPY.read.sending} ${plural(n, 'word', 'words')}`
    : p === 'reading' ? `${COPY.read.reading} ${clock(elapsed)}`
      : COPY.read.checking
  const at = PHASES.indexOf(phase)
  const steps = at < 0 ? [{ phase: null, text: COPY.read.starting, done: false }]
    : PHASES.slice(0, at + 1).map((p, i) => ({ phase: p, text: i < at ? doneLabel(p, n) : label(p), done: i < at }))
  const extra = []
  if (n > LONG_PIECE) extra.push(COPY.read.long)
  if (sections && Number(sections.total) > 1) {
    const total = Math.floor(sections.total), done = Math.max(0, Math.floor(Number(sections.done) || 0))
    extra.push(done >= total ? COPY.read.allSections : `Section ${done + 1} of ${total}`)
  }
  return { steps, current: steps[steps.length - 1].text, extra }
}

function doneLabel(p, n) {
  return p === 'sending' ? `Sent ${plural(n, 'word', 'words')}` : 'Your model has read it'
}

// A suggested opening can hold a blank the writer fills in: "[the date of the vote]". Split it so the blank is drawn
// as a blank, never as plain text with brackets.
export function blanks(text) {
  const s = String(text || '')
  const out = []
  const re = /\[([^\[\]\n]{1,120})\]/g
  let at = 0, m
  while ((m = re.exec(s))) {
    if (m.index > at) out.push({ blank: false, text: s.slice(at, m.index) })
    out.push({ blank: true, text: m[1].trim() })
    at = m.index + m[0].length
  }
  if (at < s.length) out.push({ blank: false, text: s.slice(at) })
  return out
}

const FLAG = list => (Array.isArray(list) ? list.filter(x => typeof x === 'string' && x.trim()) : [])

// Read my piece's result, ready to draw: the changes in rank order (at most three, numbered from 1), the line that
// says why there are fewer, Cut this first, and the thin case, which is never an empty card.
export function readView(result) {
  const r = result && typeof result === 'object' ? result : {}
  const changes = (Array.isArray(r.changes) ? r.changes : [])
    .filter(c => c && typeof c === 'object' && (c.change || c.quote))
    .map((c, i) => ({ ...c, rank: Number.isFinite(c.rank) ? c.rank : i + 1 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5)
    .map((c, i) => ({ ...c, n: i + 1, kind: typeof c.kind === 'string' ? c.kind : '', headline: String(c.change || c.quote || '').trim(), try: typeof c.try === 'string' ? c.try : '', flags: FLAG(c.unsupported) }))
  pairMoves(changes)
  const holdsReason = typeof r.holds === 'string' ? r.holds.trim() : ''
  const cut = r.cut_first && typeof r.cut_first === 'object' && r.cut_first.quote ? r.cut_first : null
  const verdict = typeof r.verdict === 'string' ? r.verdict.trim() : ''
  const thin = !changes.length && !holdsReason
  let holds = null
  if (!thin && changes.length < 3) {
    holds = { line: changes.length === 2 ? COPY.read.holds2 : changes.length === 1 ? COPY.read.holds1 : COPY.read.holds0, reason: holdsReason }
  }
  const keep = r.keep && typeof r.keep === 'object' && typeof r.keep.quote === 'string' && r.keep.quote.trim() ? r.keep : null
  const query = r.query && typeof r.query === 'object' && typeof r.query.question === 'string' && r.query.question.trim() ? r.query : null
  return { verdict, genre: genreLine(r.genre), changes, holds, cut, query, keep, thin, message: thin ? COPY.read.thin : '' }
}

// A change that brings the news to the top and the trim right after it that takes out the repeat go in together:
// using the move alone left the news in the piece twice (Loop 2 critics, all three). The pairing mirrors the
// backend's companion rule (library.companion_next): a moves-up headline with a try, then a trim or repeat headline.
const MOVES_UP = /^(?:open|start|begin|lead)\b(?!\s+(?:\w+\s+){0,2}?(?:sentence|paragraph|line|clause|ask|request|list)\b)(?:\s+\w+){0,3}?\s+(?:with|on|by)\b|\b(?:move|put|bring|pull|lift)\b.{0,60}\b(?:to the top|top|first|front|opening|lede|up)\b/i
const TRIM = /\b(?:trim|repeat\w*|twice|again|already|duplicat\w*|now (?:said|stated|up top|at the top)|said up top)\b/i
export function movesUp(headline) {
  const h = String(headline || '')
  return MOVES_UP.test(h) && !/\b(?:in|within) (?:the|this|that) (?:sentence|line|clause|paragraph)\b/i.test(h)
}
function pairMoves(changes) {
  for (let i = 0; i + 1 < changes.length; i++) {
    const a = changes[i], b = changes[i + 1]
    if (a.try && movesUp(a.headline) && TRIM.test(b.headline) && (b.try || b.cut === true) && b.quote && a.quote && b.quote !== a.quote) {
      a.pairNext = b.n
      b.pairedWith = a.n
      break
    }
  }
  return changes
}

// The kind of piece the editor read it as, in plain words ("Read as an op-ed"), or '' when the read didn't say.
const GENRE = { news: 'a news story', opinion: 'an opinion piece', 'op-ed': 'an op-ed', oped: 'an op-ed', argument: 'an argument', letter: 'a letter', appeal: 'an appeal letter', essay: 'a personal essay', memoir: 'a memoir', fiction: 'fiction' }
export function genreLine(genre) {
  const g = String(genre || '').toLowerCase().trim()
  const key = Object.keys(GENRE).find(k => g === k || g.startsWith(`${k} `) || g.startsWith(`${k}/`) || g.includes(k))
  return key ? `Read as ${GENRE[key]}` : ''
}

// Changes that have landed while a read is still running: from result.changes, or from each finished section.
export function partialChanges(result) {
  const r = result && typeof result === 'object' ? result : {}
  const list = Array.isArray(r.changes) ? r.changes : Array.isArray(r.sections) ? r.sections.flatMap(s => (s && Array.isArray(s.changes) ? s.changes : [])) : []
  return list.filter(c => c && typeof c === 'object' && (c.change || c.quote)).slice(0, 5).map(c => ({ headline: String(c.change || c.quote || '').trim(), kind: typeof c.kind === 'string' ? c.kind : '' }))
}

export function addsLine(flags) {
  const list = FLAG(flags)
  return list.length ? `${COPY.read.adds} ${list.join(', ')}` : ''
}

// Start from an idea: who it's for, what they should do or feel, what the writer knows. The backend needs words in at
// least one answer and at most 600 characters in each (docs/SUGGEST-API.md section 5).
export function validateStart(answers) {
  const a = answers && typeof answers === 'object' ? answers : {}
  const values = {}
  const errors = {}
  for (const k of ['who', 'what', 'know']) {
    values[k] = typeof a[k] === 'string' ? a[k].trim() : ''
    if (values[k].length > LIMIT) errors[k] = COPY.start.tooLong
  }
  const any = Object.values(values).some(v => /\S/.test(v))
  const ok = any && !Object.keys(errors).length
  return { ok, values, errors, message: !any ? COPY.start.empty : Object.keys(errors).length ? COPY.start.tooLong : '' }
}

export function counter(text) {
  const n = String(text || '').length
  return n >= NEAR ? `${(LIMIT - n).toLocaleString('en-US')} left` : ''
}

// Every string COPY holds, for the copy audit.
export function allCopy(node = COPY, out = []) {
  if (typeof node === 'string') out.push(node)
  else if (node && typeof node === 'object') for (const v of Object.values(node)) allCopy(v, out)
  return out
}

// The sentence around a caret (the desk's Rewrite a sentence with nothing selected): from the end of the sentence before
// to the end of this one, trimmed. Null on a blank line.
export function sentenceAt(body, at) {
  const b = String(body || ''), n = b.length
  let i = Math.max(0, Math.min(n, Number(at) || 0))
  if (i === n || /\s/.test(b[i] || '')) { let j = i; while (j > 0 && /\s/.test(b[j - 1]) && b[j - 1] !== '\n') j--; if (j > 0 && !/[\n]/.test(b[j - 1])) i = j - 1 }
  let s = i
  while (s > 0 && !/[.!?]["”’')]?\s$/.test(b.slice(Math.max(0, s - 3), s)) && b[s - 1] !== '\n') s--
  let e = i
  while (e < n && b[e] !== '\n' && !(/[.!?]/.test(b[e]) && (e + 1 === n || /["”’')\s]/.test(b[e + 1])))) e++
  if (e < n && /[.!?]/.test(b[e])) { e++; while (e < n && /["”’')]/.test(b[e])) e++ }
  while (s < e && /\s/.test(b[s])) s++
  return e > s ? { start: s, end: e } : null
}
