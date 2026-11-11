// Pure helpers for the note walk: where the note card sits, walking a pass's notes again, where "Fix it myself"
// puts the cursor, and History's model-use line. No imports, so node tests load this file directly.

// The note card's offset inside the margin, so it sits beside its passage. Measured after the page has scrolled
// the passage into view: measured before, the card was placed against the old scroll position and drifted
// 300 to 570 px from its passage, or sat over the Ask line with its buttons below the window (persona test,
// Nov 8, 2026). The whole card stays on screen: below the top fade, and above the Ask line and the room under it.
export function placeNote({ passageTop, viewTop, viewBottom, marginTop, noteHeight, askRoom, gap = 18 }) {
  let top = passageTop - gap
  top = Math.min(top, viewBottom - askRoom - noteHeight)
  top = Math.max(top, viewTop + gap)
  return Math.max(0, Math.round(top - marginTop))
}

// The tallest a list in the margin (Read my piece's changes, the figures, the techniques) may grow and still end
// above the Ask line. Measured from the pane the room really has: the old 100vh rule counted Hermes's own window
// chrome as room, so with four or five notes the list ran under the Ask line (live shot, Nov 11, 2026).
// viewHeight: the page's scrolling area; marginOffset: where the margin's first card starts inside it, unscrolled.
export function marginMax({ viewHeight, marginOffset, askRoom, floor = 160 }) {
  return Math.max(floor, Math.round((Number(viewHeight) || 0) - (Number(marginOffset) || 0) - (Number(askRoom) || 0)))
}

// Walking a pass's notes again after its summary: every note the writer left or kept goes back to open, so it is
// underlined and the page can scroll to it. A note on a passage the writer changed stays set aside.
export function reopen(marks, ids) {
  const set = new Set(ids)
  return marks.map(m => (set.has(m.id) && !m.changed && m.status !== 'changed' && m.status !== 'open' ? { ...m, status: 'open' } : m))
}

// "Fix it myself" puts the cursor at the start of the passage, with nothing selected, so the first key the writer
// presses adds to the sentence instead of replacing all of it. The underline still shows the whole passage.
export function caretFor(mark) {
  return { start: mark.start, end: mark.start }
}

// History's line on model use, in words instead of tokens. A token is about three quarters of an English word.
export function aboutWords(tokens) {
  const w = Math.max(0, Number(tokens) || 0) * 0.75
  const step = w >= 10000 ? 1000 : w >= 1000 ? 100 : 10
  return (Math.round(w / step) * step).toLocaleString('en-US')
}

export function usageLine(usage) {
  if (!usage || !usage.passes) return ''
  const n = usage.passes
  const head = `Editor passes on this piece: ${n.toLocaleString('en-US')}.`
  if (!usage.tokens_in && !usage.tokens_out) return head
  return `${head} Your model read about ${aboutWords(usage.tokens_in)} words for ${n === 1 ? 'it' : 'them'} and wrote about ${aboutWords(usage.tokens_out)}.`
}
