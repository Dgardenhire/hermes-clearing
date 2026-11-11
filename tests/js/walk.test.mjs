// The note walk (persona test, Nov 8, 2026). The page's geometry is checked in the browser by
// harness/check-walk.mjs; these test the rules it runs on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aboutWords, caretFor, marginMax, placeNote, reopen, usageLine } from '../../desktop/src/walk.js'

const view = { viewTop: 54, viewBottom: 900, marginTop: -2000, noteHeight: 300, askRoom: 104 }

test('the note sits beside its passage once the passage is in view', () => {
  // A passage centered in an 846 px window, the margin scrolled 2,000 px: the card's top is 18 px above it.
  assert.equal(placeNote({ ...view, passageTop: 470 }), 2000 + 470 - 18)
})

test('the whole note stays on screen: never over the Ask line, never above the top fade', () => {
  const low = placeNote({ ...view, passageTop: 860 }) // a passage at the bottom edge
  assert.equal(low + view.marginTop + view.noteHeight, view.viewBottom - view.askRoom) // its buttons end above the Ask line
  const high = placeNote({ ...view, passageTop: 10 })
  assert.equal(high + view.marginTop, view.viewTop + 18)
  assert.equal(placeNote({ ...view, marginTop: 100, passageTop: 20 }), 0) // never above the margin's own top
})

test('the placement uses the passage where it is, so measuring after the scroll is what keeps it close', () => {
  // Measured before the scroll the passage was 1,400 px below the window, so the card was clamped to the bottom;
  // after the scroll the same passage is at 470 and the card follows it.
  const before = placeNote({ ...view, passageTop: 2300 })
  const after = placeNote({ ...view, marginTop: view.marginTop - 1830, passageTop: 470 })
  assert.ok(Math.abs((after + view.marginTop - 1830) - 470) <= 18)
  assert.ok(Math.abs((before + view.marginTop - 1830) - 470) > 300)
})

test('walking the notes again after the summary reopens every note the writer left, not the ones set aside', () => {
  const marks = [
    { id: 'a', status: 'left' }, { id: 'b', status: 'open' }, { id: 'c', status: 'changed' },
    { id: 'd', status: 'left', changed: true }, { id: 'e', status: 'left' }, { id: 'kept', kind: 'kept', status: 'kept' },
  ]
  const out = reopen(marks, ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(out.map(m => m.status), ['open', 'open', 'changed', 'left', 'open', 'kept'])
  assert.equal(out[1], marks[1]) // unchanged marks are the same objects
})

test('Fix it myself puts the cursor at the passage with nothing selected', () => {
  const at = caretFor({ start: 120, end: 509 })
  assert.deepEqual(at, { start: 120, end: 120 })
})

test('History says how much the model read in words, not tokens', () => {
  assert.equal(usageLine({ passes: 6, tokens_in: 41820, tokens_out: 5310 }), 'Editor passes on this piece: 6. Your model read about 31,000 words for them and wrote about 4,000.')
  assert.equal(usageLine({ passes: 1, tokens_in: 1200, tokens_out: 90 }), 'Editor passes on this piece: 1. Your model read about 900 words for it and wrote about 70.')
  assert.equal(usageLine({ passes: 2, tokens_in: 0, tokens_out: 0 }), 'Editor passes on this piece: 2.')
  assert.equal(usageLine({ passes: 0 }), '')
  assert.equal(aboutWords(undefined), '0')
  assert.ok(!/token/i.test(usageLine({ passes: 3, tokens_in: 9000, tokens_out: 800 })))
})

test('the margin lists end above the Ask line, measured from the pane the room has, not the whole window', () => {
  // A 760 px page area, the margin's first card 50 px down: the list may be 606 px tall, ending 104 px above the
  // bottom, where the Ask line and the room under it sit.
  assert.equal(marginMax({ viewHeight: 760, marginOffset: 50, askRoom: 104 }), 606)
  // A pane too short to be useful still gets a list that scrolls, never a negative height.
  assert.equal(marginMax({ viewHeight: 200, marginOffset: 50, askRoom: 104 }), 160)
  // Read my piece's list, the figures and the techniques, and a long note all take the measured limit.
  const css = readFileSync(new URL('../../desktop/src/styles.js', import.meta.url), 'utf8') + readFileSync(new URL('../../desktop/src/spots.jsx', import.meta.url), 'utf8')
  for (const sel of ['.cl-roomread{', '.cl-margin .cl-spot{', '.cl-note[data-long]{']) {
    const rule = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)))
    assert.match(rule, /max-height:var\(--cl-margin-max,/, sel)
  }
})
