// Suggested text and the other pure rules the room's new tools follow. No DOM, so node tests load it directly.
//
// Suggestions are the writer's model's words. They are shown beside the writer's own, marked as suggestions,
// and go into the page only on a click; anything used is recorded for History. Before any is shown, Quick
// check's rules read it: a suggestion that brings in a stock phrase, filler, a stacked hedge, throat-clearing, a
// "not X, it's Y" setup or a run-on the writer's own words didn't have is left out.
import { instantRead } from './quick-check.js'

const key = m => `${m.kind}:${m.quote.toLowerCase().replace(/\s+/g, ' ').trim()}`

// What a dropped suggestion would have added, in the words a writer reads ("Adds a stock phrase").
export const ADDS = { throat: 'Adds throat-clearing', 'stock-open': 'Adds a stock opening', 'stacked-hedge': 'Adds a stacked hedge', filler: 'Adds filler',
  stock: 'Adds a stock phrase', pileup: 'Adds a pile of near-synonyms', contrast: 'Adds a “not X, it’s Y” setup', long: 'Adds a very long sentence' }

// The options that pass Quick check against the words they would replace. Returns { kept, dropped }; each dropped
// option carries `flag`, the rule it broke and the words that broke it, so the room can still show it folded.
export function screen(options, original = '', field = 'text') {
  const had = new Set(instantRead(String(original || '')).findings.map(key))
  const kept = [], dropped = []
  for (const o of options || []) {
    const text = typeof o === 'string' ? o : o && o[field]
    if (typeof text !== 'string' || !text.trim()) continue
    const added = instantRead(text).findings.filter(m => !had.has(key(m)))
    if (!added.length) { kept.push(o); continue }
    const m = added[0], words = m.quote.length > 60 ? `${m.quote.slice(0, 57).trimEnd()}…` : m.quote
    dropped.push({ ...(typeof o === 'string' ? { [field]: o } : o), flag: `${ADDS[m.kind] || 'Adds a habit Quick check flags'}: “${words}”` })
  }
  return { kept, dropped }
}

// What the room shows: the clean options, or, when every one broke a rule, all of them folded under the rule each
// broke. Never an empty card. `retry` asks once more first; it returns true when it did.
export function shown(options, original, field, retry) {
  const { kept, dropped } = screen(options, original, field)
  if (kept.length) return { list: kept, dropped: dropped.length, folded: false }
  if (dropped.length && retry && retry()) return null
  return { list: dropped, dropped: 0, folded: dropped.length > 0 }
}

// A note's rewritten example, or '' when it fails the same screen.
export function screenTry(example, quote) {
  if (!example) return ''
  return screen([{ text: example }], quote).kept.length ? example : ''
}

// Put text at a cursor with the spacing a sentence needs: a space after the word before it, a space before the
// word after it, nothing doubled. Returns the new body and where the inserted words sit.
export function joinAt(body, at, text) {
  const b = String(body || ''), t = String(text || '').trim()
  const pos = Math.max(0, Math.min(b.length, at | 0))
  const before = b.slice(0, pos), after = b.slice(pos)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const tail = after && !/^\s/.test(after) && !/^[.,;:!?)\]”’]/.test(after) ? ' ' : ''
  const start = pos + lead.length
  return { body: before + lead + t + tail + after, span: { start, end: start + t.length } }
}

// A page brought in from a link reads as clean paragraphs under one source line: its title, its site and the day it
// was read (or the page's own date when the web tool gives one). The address itself is kept in the piece record.
export function sourceLine(title, url, date, now = new Date()) {
  let site = ''
  try { site = new URL(url).hostname.replace(/^www\./, '') } catch (e) { site = String(url || '') }
  const day = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const when = date && !Number.isNaN(new Date(date).getTime()) ? day(new Date(date)) : `read ${day(now)}`
  return `From ${title ? `“${String(title).trim()}”, ` : ''}${site}, ${when}.`
}
export function quotedSource(title, url, text, limit = 20000, date = null, now = new Date()) {
  let body = String(text || '').trim()
  let cut = false
  if (body.length > limit) { body = body.slice(0, limit).replace(/\s+\S*$/, ''); cut = true }
  return `${sourceLine(title, url, date, now)}\n\n${body}${cut ? '\n\n(The page goes on; the rest is at the link.)' : ''}`
}

// What the room's one shortcut (mod+shift+E) opens, from the selection or the cursor:
//   'word'    a single word selected, or the cursor inside a word: other words for it
//   'passage' a phrase, a sentence or a paragraph selected: the passage tools (Rewrite, Quick check)
//   'next'    the cursor in a gap or at the end of a paragraph: a next sentence
const LETTER = /[\p{L}\p{N}'’-]/u
export function toolAt(body, start, end) {
  const b = String(body || '')
  if (end > start) return /\s/.test(b.slice(start, end).trim()) ? 'passage' : 'word'
  const left = b[start - 1] || '', right = b[start] || ''
  return LETTER.test(left) || LETTER.test(right) ? 'word' : 'next'
}

// The word around a cursor, as offsets, or null.
export function wordAround(body, at) {
  const b = String(body || '')
  let s = at, e = at
  while (s > 0 && LETTER.test(b[s - 1])) s--
  while (e < b.length && LETTER.test(b[e])) e++
  while (s < e && /['’-]/.test(b[s])) s++
  while (e > s && /['’-]/.test(b[e - 1])) e--
  return e > s ? { start: s, end: e } : null
}

// The scenes. Each is its own choice in light and dark: dark mode deepens the veil over a light picture so the
// writer's words stay legible, and never swaps the picture (Damon, Nov 8: "it would not change from the one
// picture"). "theme" is the default before the writer chooses: Snow Light in light mode, Night Tide in dark.
export const SCENES = [['snow', 'Snow Light'], ['marsh', 'Quiet Marsh'], ['tide', 'Night Tide'], ['plain', 'Plain page'], ['own', 'Your own picture']]
export function sceneShown(scene, dark) {
  if (scene === 'theme' || !SCENES.some(([v]) => v === scene)) return dark ? 'tide' : 'snow'
  return scene
}

// Labels for the model text the writer used, by decision kind (store.py MODEL_TEXT).
export const USED = { change: 'Typo fix', opening: 'Opening', flip: 'Main point or promise', draft: 'Draft from your notes', wording: 'Other wording', rewrite: 'Rewrite', next: 'Next sentence', ending: 'Ending', title: 'Title', note: "From an editor's note" }
