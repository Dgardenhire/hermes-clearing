// Pure text helpers for the room: counts, marks that follow the writer's edits, change records,
// file names and exports. No imports, so node tests load this file directly.

export function wordCount(text) {
  const t = String(text || '').trim()
  return t ? t.split(/\s+/).length : 0
}

export function plural(n, one, many) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

// The span that changed between two versions of the body: a shared prefix and suffix around it.
export function editSpan(before, after) {
  let p = 0
  const max = Math.min(before.length, after.length)
  while (p < max && before[p] === after[p]) p++
  let s = 0
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++
  return { start: p, oldEnd: before.length - s, newEnd: after.length - s, delta: after.length - before.length }
}

// Move marks through an edit. A mark untouched by the edit shifts with the text; a mark the edit reached
// is found again by its quote near where it was, or set aside as changed. Nothing is ever misapplied.
export function followEdit(marks, before, after) {
  if (before === after) return marks
  const span = editSpan(before, after)
  return marks.map(m => {
    if (m.changed) return m
    if (m.end <= span.start) return m
    if (m.start >= span.oldEnd) return { ...m, start: m.start + span.delta, end: m.end + span.delta }
    const at = findNear(after, m.quote, m.start)
    return at < 0 ? { ...m, changed: true } : { ...m, start: at, end: at + m.quote.length }
  })
}

// The quote's position in text when it occurs once within a window around `near`, else -1.
export function findNear(text, quote, near, radius = 400) {
  if (!quote) return -1
  const lo = Math.max(0, near - radius), hi = Math.min(text.length, near + quote.length + radius)
  const first = text.indexOf(quote, lo)
  if (first < 0 || first + quote.length > hi) return -1
  const second = text.indexOf(quote, first + 1)
  return second >= 0 && second + quote.length <= hi ? -1 : first
}

// Apply the change records the writer kept. Each must still match the body exactly where it sits.
export function applyChanges(body, changes) {
  const live = changes.filter(c => !c.changed && body.slice(c.start, c.end) === c.quote)
    .sort((a, b) => b.start - a.start)
  let out = body
  let last = Infinity
  let applied = 0
  for (const c of live) {
    if (c.end > last) continue // overlapping: the later one already went in
    out = out.slice(0, c.start) + c.replacement + out.slice(c.end)
    last = c.start
    applied++
  }
  return { body: out, applied }
}

// Replace a span (an opening the writer kept). Returns the new body and the kept passage's span.
export function replaceSpan(body, start, end, text) {
  return { body: body.slice(0, start) + text + body.slice(end), span: { start, end: start + text.length } }
}

// The body cut into runs for the mark layer: plain text and marked spans, in order, never overlapping.
export function runs(body, marks, active) {
  const list = marks.filter(m => !m.changed && m.start < m.end && m.end <= body.length)
    .sort((a, b) => a.start - b.start)
  const out = []
  let at = 0
  for (const m of list) {
    if (m.start < at) continue
    if (m.start > at) out.push({ text: body.slice(at, m.start) })
    out.push({ text: body.slice(m.start, m.end), mark: m, active: m.id === active })
    at = m.end
  }
  out.push({ text: body.slice(at) })
  return out
}

export function markAt(marks, offset) {
  return marks.find(m => !m.changed && offset >= m.start && offset <= m.end) || null
}

// A file name from a title, by the backend's rules (home.safe_name): no separators or control characters, no
// hidden ".name", no bidi or other invisible format characters, no trailing dots, never a Windows device name.
const FORMAT_CHARS = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/g
const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
export function fileName(title, ext) {
  const base = String(title || '').replace(FORMAT_CHARS, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+|\.{2,}/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim().slice(0, 80).replace(/[. ]+$/, '') || 'Untitled'
  return `${DEVICE.test(base) ? '_' + base : base}.${ext}`
}

export function asMarkdown(title, body) {
  const t = String(title || '').trim()
  return (t ? `# ${t}\n\n` : '') + String(body || '').trim() + '\n'
}

export function asPlainText(title, body) {
  const t = String(title || '').trim()
  return (t ? `${t}\n\n` : '') + String(body || '').trim() + '\n'
}

// A file the writer opened: a Markdown title line becomes the title.
export function fromFile(name, text) {
  const clean = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  const m = clean.match(/^\s*#\s+(.+)\n+/)
  if (m) return { title: m[1].trim(), body: clean.slice(m[0].length) }
  return { title: String(name || '').replace(/\.(md|markdown|txt)$/i, ''), body: clean }
}

export function timeAgo(seconds, now = Date.now() / 1000) {
  const d = Math.max(0, now - seconds)
  if (d < 60) return 'just now'
  if (d < 3600) return plural(Math.floor(d / 60), 'minute ago', 'minutes ago')
  if (d < 86400) return plural(Math.floor(d / 3600), 'hour ago', 'hours ago')
  return new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Accept proposed cuts the writer did not keep. Each cut must still match where it sits. A cut takes one
// neighboring space with it, so no double space or space before punctuation is left behind, and when a cut
// removes the start of a sentence, the word that now starts it gets its capital letter.
export function applyCuts(body, cuts) {
  const live = cuts.filter(c => !c.kept && !c.changed && body.slice(c.start, c.end) === c.quote).sort((a, b) => b.start - a.start)
  let out = body, last = Infinity, applied = 0
  for (const c of live) {
    if (c.end > last) continue
    let s = c.start, e = c.end
    if (out[e] === ' ' && (s === 0 || /[\s(“"']/.test(out[s - 1]))) e++
    else if (out[s - 1] === ' ' && (e === out.length || /[\s.,;:!?)”"']/.test(out[e]))) s--
    out = out.slice(0, s) + out.slice(e)
    if (/^\s*$|[.!?]["”')]?\s+$|\n\s*$/.test(out.slice(Math.max(0, s - 4), s)) || s === 0) {
      const m = /^[a-z]/.exec(out.slice(s))
      if (m) out = out.slice(0, s) + m[0].toUpperCase() + out.slice(s + 1)
    }
    last = c.start
    applied++
  }
  return { body: out.replace(/\n{3,}/g, '\n\n'), applied }
}

// The piece's paragraphs with where each starts and how many words it has, for the shape strip. A paragraph
// starts at a line with words and runs until a blank line; one pass over the lines, so a long run of spaces
// costs no more than its length (a regex here took time that grew with its square: security audit A-02).
export function paragraphs(body) {
  const text = String(body || ''), out = []
  const lines = []
  for (let at = 0; ;) {
    const nl = text.indexOf('\n', at)
    const end = nl < 0 ? text.length : nl
    lines.push({ start: at, end, blank: !/\S/.test(text.slice(at, end)), last: nl < 0 })
    if (nl < 0) break
    at = nl + 1
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].blank) continue
    let j = i
    // the next line joins unless it is blank and followed by a newline (a blank last line still joins)
    while (j + 1 < lines.length && !(lines[j + 1].blank && !lines[j + 1].last)) j++
    const start = lines[i].start, end = lines[j].end
    out.push({ start, end, words: wordCount(text.slice(start, end)) })
    i = j
  }
  return out
}
