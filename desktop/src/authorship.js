// Who wrote which words. A span marks characters of the body that came from the writer's model and that the writer
// chose with Use this: {start, end, pass_id, kind, model} (the fields the backend stores, docs/SUGGEST-API.md
// section 11), plus any extra fields the room keeps (an id, the quote). Spans follow every edit character by
// character, iA Writer's rule: an edit before a span moves it, typing inside a span splits it (the typed characters
// are the writer's, the untouched model characters stay the model's), deleting across a span trims it, pasting over
// a span makes the pasted text the writer's, and a span left with no characters is gone. Pure functions, no state
// except the small undo memory at the bottom, so node can test every rule.

const WS = /\s/

function isSpan(s) {
  return !!s && Number.isInteger(s.start) && Number.isInteger(s.end) && s.end > s.start && s.start >= 0
}

// A copy of the span on a new range, keeping every other field; the quote (when the room keeps one) is re-read.
function moved(s, start, end, body, part) {
  const out = { ...s, start, end }
  if (typeof s.quote === 'string' && typeof body === 'string') out.quote = body.slice(start, end)
  if (part && s.id != null) out.id = `${s.id}.${part}`
  return out
}

const byStart = (a, b) => a.start - b.start || a.end - b.end

// The one edit that turns `before` into `after`: the shortest changed run, found from both ends. When the room
// knows the real edit (the cursor, or what was pasted) it passes {start, end, text} and that wins, so typing a
// letter that matches its neighbor, or pasting the same words over themselves, is still credited correctly.
export function editOf(before, after, hint) {
  if (hint && Number.isInteger(hint.start) && Number.isInteger(hint.end) && typeof hint.text === 'string'
    && hint.start >= 0 && hint.end >= hint.start && hint.end <= before.length
    && before.slice(0, hint.start) + hint.text + before.slice(hint.end) === after) {
    return { start: hint.start, end: hint.end, inserted: hint.text.length }
  }
  const max = Math.min(before.length, after.length)
  let p = 0
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++
  let s = 0
  while (s < max - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++
  return { start: p, end: before.length - s, inserted: after.length - s - p }
}

// Carry spans through one edit. `edit` is optional ({start, end, text} in `before`'s offsets).
export function followSpans(spans, before, after, edit) {
  if (!Array.isArray(spans) || !spans.length) return []
  if (before === after && !edit) return spans.filter(isSpan).map(s => ({ ...s }))
  const e = editOf(before, after, edit)
  const delta = e.inserted - (e.end - e.start)
  const out = []
  for (const s of spans) {
    if (!isSpan(s)) continue
    if (s.end <= e.start) { out.push(moved(s, s.start, s.end, after)); continue } // wholly before the edit
    // Wholly after (typing right at a span's first character puts the new letters before it, as the writer's).
    if (s.start >= e.end) { out.push(moved(s, s.start + delta, s.end + delta, after)); continue }
    // The edit touches the span: keep the model's characters on either side of it, and only those.
    const left = s.start < e.start ? [s.start, Math.min(s.end, e.start)] : null
    const right = s.end > e.end ? [Math.max(s.start, e.end) + delta, s.end + delta] : null
    if (left && left[1] > left[0]) out.push(moved(s, left[0], left[1], after))
    if (right && right[1] > right[0]) out.push(moved(s, right[0], right[1], after, left ? 2 : 0))
  }
  return out.sort(byStart)
}

// After Use this: the new model span owns its characters (any older span over them gives them up), and spans from
// the same pass that touch or overlap it become one.
export function addSpan(spans, span) {
  const list = Array.isArray(spans) ? spans.filter(isSpan) : []
  if (!isSpan(span)) return list.map(s => ({ ...s })).sort(byStart)
  const out = []
  for (const s of list) {
    if (s.end <= span.start || s.start >= span.end) { out.push({ ...s }); continue }
    if (s.start < span.start) out.push(trim(s, s.start, span.start))
    if (s.end > span.end) out.push(trim(s, span.end, s.end, 2))
  }
  out.push({ ...span })
  out.sort(byStart)
  const merged = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && s.start <= last.end && last.pass_id != null && last.pass_id === s.pass_id) {
      const end = Math.max(last.end, s.end)
      if (typeof last.quote === 'string' && typeof s.quote === 'string') {
        last.quote = last.quote + s.quote.slice(last.end - s.start)
      }
      last.end = end
    } else merged.push(s)
  }
  return merged
}

function trim(s, start, end, part) {
  const out = { ...s, start, end }
  if (typeof s.quote === 'string') out.quote = s.quote.slice(start - s.start, end - s.start)
  if (part && s.id != null) out.id = `${s.id}.${part}`
  return out
}

// How many non-space characters of the body sit inside any span (overlaps counted once).
function modelChars(body, spans) {
  if (!body || !Array.isArray(spans)) return 0
  const ranges = spans.filter(isSpan).map(s => [Math.max(0, s.start), Math.min(body.length, s.end)]).filter(r => r[1] > r[0]).sort((a, b) => a[0] - b[0])
  let n = 0, at = 0
  for (const [a, b] of ranges) {
    for (let i = Math.max(a, at); i < b; i++) if (!WS.test(body[i])) n++
    at = Math.max(at, b)
  }
  return n
}

function letters(body) {
  let n = 0
  for (let i = 0; i < (body || '').length; i++) if (!WS.test(body[i])) n++
  return n
}

// Whole percents of non-space characters. While any model character remains, "yours" never reads 100 and "model"
// never reads 0, so the count never claims more than is true.
export function share(body, spans) {
  const total = letters(body)
  const m = Math.min(total, modelChars(body, spans))
  if (!total || !m) return { yours: 100, model: 0 }
  let model = Math.round((100 * m) / total)
  if (m < total) model = Math.min(99, Math.max(1, model))
  return { yours: 100 - model, model }
}

export function topLine(body, spans) {
  const s = share(body, spans)
  return s.model ? `${s.yours}% your words` : ''
}

export function finishLine(body, spans) {
  const s = share(body, spans)
  if (!s.model) return 'Every word here is yours.'
  return `${s.yours}% of these words are yours. ${s.model}% came from your editor, and you chose each one.`
}

// Opening a saved piece (or restoring a version): keep only spans that fit the body. A span that carries its quote
// and no longer matches is looked for nearby (the nearest place the same words appear) and dropped if they are gone.
export function clamp(spans, body) {
  if (!Array.isArray(spans) || typeof body !== 'string') return []
  const out = []
  for (const raw of spans) {
    if (!raw || typeof raw.start !== 'number' || typeof raw.end !== 'number') continue
    let s = { ...raw, start: Math.round(raw.start), end: Math.round(raw.end) }
    if (typeof s.quote === 'string' && s.quote && body.slice(s.start, s.end) !== s.quote) {
      const at = nearest(body, s.quote, s.start)
      if (at < 0) continue
      s = { ...s, start: at, end: at + s.quote.length }
    }
    const start = Math.max(0, s.start), end = Math.min(body.length, s.end)
    if (end <= start) continue
    out.push(start === s.start && end === s.end ? s : moved(s, start, end, body))
  }
  out.sort(byStart)
  // Two spans never claim the same character: a later one starts where the earlier one ends.
  const fixed = []
  for (const s of out) {
    const last = fixed[fixed.length - 1]
    if (last && s.start < last.end) {
      if (s.end <= last.end) continue
      fixed.push(moved(s, last.end, s.end, body))
    } else fixed.push(s)
  }
  return fixed
}

function nearest(body, quote, near) {
  let best = -1, at = body.indexOf(quote)
  while (at >= 0) {
    if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at
    at = body.indexOf(quote, at + 1)
  }
  return best
}

// Undo and redo. Cmd Z and Cmd Shift Z return the page to text it has had before; following the edit alone would
// then count the model's returning words as the writer's. The room remembers the spans of each state it passes
// through, and when the body comes back to one of them it takes that state's spans exactly.
export function createMemory(limit = 50) {
  const states = new Map()
  return {
    remember(body, spans) {
      if (typeof body !== 'string') return
      states.delete(body)
      states.set(body, JSON.stringify(Array.isArray(spans) ? spans.filter(isSpan) : []))
      while (states.size > limit) states.delete(states.keys().next().value)
    },
    recall(body) {
      if (!states.has(body)) return null
      return JSON.parse(states.get(body))
    },
    forget() { states.clear() },
    get size() { return states.size },
  }
}

const MEMORY = createMemory(50)
export const remember = (body, spans) => MEMORY.remember(body, spans)
export const recall = body => MEMORY.recall(body)
export const forget = () => MEMORY.forget() // switching pieces
