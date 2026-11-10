// Who wrote which words (surfaces lane, Nov 8, 2026): spans follow every edit character by character (iA Writer's
// rule), the count never claims more than is true, and undo and redo bring back each state's spans exactly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addSpan, clamp, createMemory, editOf, finishLine, followSpans, forget, recall, remember, share, topLine } from '../../desktop/src/authorship.js'

const sample = JSON.parse(readFileSync(new URL('../../library/sample.json', import.meta.url)))
const OLD = 'That number is real.'
const NEW = 'That number counts checkouts, and only checkouts.'
const at = sample.body.indexOf(OLD)
const used = sample.body.slice(0, at) + NEW + sample.body.slice(at + OLD.length)
const span = (start, end, extra = {}) => ({ start, end, pass_id: 'p1', kind: 'read', model: 'claude-sonnet-4-5', ...extra })
const text = (body, spans) => spans.map(s => body.slice(s.start, s.end))
// The room's edit path: one replacement at a place, and the spans carried through it.
const edit = (body, spans, start, end, typed, hint = true) => {
  const after = body.slice(0, start) + typed + body.slice(end)
  return { body: after, spans: followSpans(spans, body, after, hint ? { start, end, text: typed } : undefined) }
}

test('an edit before a span moves it and keeps its words', () => {
  const spans = [span(at, at + NEW.length, { quote: NEW })]
  const r = edit(used, spans, 0, 0, 'Saturday. ')
  assert.equal(r.spans.length, 1)
  assert.equal(r.spans[0].start, at + 10)
  assert.deepEqual(text(r.body, r.spans), [NEW])
  assert.equal(r.spans[0].quote, NEW)
  // Deleting before it moves it back; the fields the backend stores come through untouched.
  const back = edit(r.body, r.spans, 0, 10, '')
  assert.deepEqual(back.spans[0], { ...spans[0] })
  // Typing right after it, or right before it, leaves the typed letters the writer's.
  const after = edit(used, spans, at + NEW.length, at + NEW.length, ' Yes.')
  assert.deepEqual(text(after.body, after.spans), [NEW])
  const before = edit(used, spans, at, at, 'Yes. ')
  assert.deepEqual(text(before.body, before.spans), [NEW])
})

test('typing inside a span splits it: the typed letters are yours, the untouched model letters stay the model\'s', () => {
  const spans = [span(at, at + NEW.length, { id: 's1', quote: NEW })]
  const mid = at + NEW.indexOf('checkouts,') // "That number counts |checkouts, ..."
  const r = edit(used, spans, mid, mid, 'library ')
  assert.deepEqual(text(r.body, r.spans), ['That number counts ', 'checkouts, and only checkouts.'])
  assert.deepEqual(r.spans.map(s => s.id), ['s1', 's1.2'])
  for (const s of r.spans) assert.equal(r.body.slice(s.start, s.end), s.quote)
  // The share counts the eight typed letters as the writer's.
  const before = share(used, spans), after = share(r.body, r.spans)
  assert.ok(after.model <= before.model)
  // With no hint, the shortest-diff guess gives the same split here.
  const guess = edit(used, spans, mid, mid, 'library ', false)
  assert.deepEqual(text(guess.body, guess.spans), text(r.body, r.spans))
})

test('deleting across a span trims it to the letters that are left', () => {
  const spans = [span(at, at + NEW.length)]
  // Delete from the sentence before into the middle of the span.
  const from = at - 12, to = at + 'That number '.length
  const r = edit(used, spans, from, to, '')
  assert.deepEqual(text(r.body, r.spans), ['counts checkouts, and only checkouts.'])
  assert.equal(r.spans[0].start, from)
  // Delete the span's tail and a little after it.
  const tail = at + NEW.indexOf(', and only')
  const t = edit(used, spans, tail, at + NEW.length + 3, '')
  assert.deepEqual(text(t.body, t.spans), ['That number counts checkouts'])
})

test('pasting over a span makes the pasted words yours', () => {
  const spans = [span(at, at + NEW.length)]
  const words = 'That number counts the wrong thing.'
  const r = edit(used, spans, at, at + NEW.length, words)
  assert.deepEqual(r.spans, [])
  assert.equal(topLine(r.body, r.spans), '')
  // Pasting over part of it keeps the rest of the model's letters on both sides.
  const part = edit(used, spans, at + 5, at + 11, 'figure')
  assert.deepEqual(text(part.body, part.spans), ['That ', ' counts checkouts, and only checkouts.'])
  // Pasting the very same words over them is still the writer's choice, when the room passes the edit.
  const same = edit(used, spans, at, at + NEW.length, NEW)
  assert.deepEqual(same.spans, [])
})

test('a span deleted entirely is removed', () => {
  const spans = [span(at, at + NEW.length), span(10, 20, { pass_id: 'p2' })]
  const r = edit(used, spans, at - 1, at + NEW.length, '')
  assert.deepEqual(text(r.body, r.spans), [used.slice(10, 20)])
  // Select-all and type: nothing of the model's is left.
  const all = edit(used, spans, 0, used.length, 'A new start.')
  assert.deepEqual(all.spans, [])
  assert.equal(finishLine(all.body, all.spans), 'Every word here is yours.')
})

test('restoring a version restores that version\'s spans exactly', () => {
  // The backend keeps the spans current when a version was saved; restoring hands them back with its body.
  const version = { body: used, spans: [span(at, at + NEW.length, { quote: NEW })] }
  const later = edit(used, version.spans, 0, used.length, 'Rewritten by hand.')
  assert.deepEqual(later.spans, [])
  const restored = clamp(JSON.parse(JSON.stringify(version.spans)), version.body)
  assert.deepEqual(restored, version.spans)
  assert.equal(topLine(version.body, restored), topLine(used, version.spans))
})

test('save and reopen: spans round-trip through JSON and clamp, with the same percentage', () => {
  let spans = addSpan([], span(at, at + NEW.length, { quote: NEW }))
  const second = 'turn'
  const lev = used.indexOf('basically leverage')
  const body2 = used.slice(0, lev) + second + used.slice(lev + 'basically leverage'.length)
  spans = addSpan(followSpans(spans, used, body2), span(lev, lev + second.length, { pass_id: 'p9', kind: 'read', quote: second }))
  const saved = JSON.stringify({ title: sample.title, body: body2, spans })
  const open = JSON.parse(saved)
  const back = clamp(open.spans, open.body)
  assert.deepEqual(back, spans)
  assert.equal(finishLine(open.body, back), finishLine(body2, spans))
  assert.match(finishLine(open.body, back), /^\d{1,2}% of these words are yours\. \d{1,2}% came from your editor, and you chose each one\.$/)
  // A stored span that runs past the body (a cut-off save) is trimmed; one outside it, or malformed, is dropped.
  const odd = clamp([span(body2.length - 3, body2.length + 40), span(body2.length + 5, body2.length + 9), { start: 'x', end: 2 }, null], body2)
  assert.deepEqual(odd.map(s => [s.start, s.end]), [[body2.length - 3, body2.length]])
  // A span whose quote moved (the body changed outside the plugin) is found again nearby, or dropped.
  const shifted = 'Hello. ' + body2
  const found = clamp([{ ...spans.find(s => s.quote === NEW) }], shifted)
  assert.deepEqual(text(shifted, found), [NEW])
  assert.deepEqual(clamp([span(0, 4, { quote: 'Gone' })], body2), [])
  // Two spans never claim the same letters.
  const over = clamp([span(10, 30), span(20, 40, { pass_id: 'p2' })], body2)
  assert.deepEqual(over.map(s => [s.start, s.end]), [[10, 30], [30, 40]])
})

test('Use this, Cmd Z, Cmd Shift Z: the same spans come back each way', () => {
  forget()
  // The room's order on every body change: recall the state if it has been seen, else follow the edit; remember.
  let body = sample.body, spans = []
  const change = next => {
    spans = recall(next) ?? followSpans(spans, body, next)
    body = next
    remember(body, spans)
  }
  remember(body, spans)
  // Use this: the text goes in through the page's own edit path, then the span is added.
  change(used)
  spans = addSpan(spans, span(at, at + NEW.length, { quote: NEW }))
  remember(body, spans)
  const usedSpans = JSON.parse(JSON.stringify(spans))
  assert.match(topLine(body, spans), /^\d{1,2}% your words$/)
  change(sample.body) // Cmd Z
  assert.deepEqual(spans, [])
  assert.equal(topLine(body, spans), '')
  change(used) // Cmd Shift Z: without the memory the returning words would count as the writer's
  assert.deepEqual(spans, usedSpans)
  assert.deepEqual(followSpans([], sample.body, used), [], 'following alone would lose them')
  // The memory holds about fifty states, oldest out first.
  const m = createMemory(50)
  for (let i = 0; i < 60; i++) m.remember(`body ${i}`, [span(0, 4)])
  assert.equal(m.size, 50)
  assert.equal(m.recall('body 0'), null)
  assert.deepEqual(m.recall('body 59'), [span(0, 4)])
  // Recall hands back a copy, so the room can't change the memory by accident.
  const got = m.recall('body 59'); got[0].start = 3
  assert.equal(m.recall('body 59')[0].start, 0)
})

test('the count is capped: never 100% yours, never 0% the model\'s, while any model letter remains', () => {
  const big = 'x'.repeat(10000)
  const one = [span(5000, 5001)]
  assert.deepEqual(share(big, one), { yours: 99, model: 1 })
  assert.equal(topLine(big, one), '99% your words')
  assert.equal(finishLine(big, one), '99% of these words are yours. 1% came from your editor, and you chose each one.')
  // And the other way: one letter of the writer's in a page of the model's.
  const most = [span(0, 9999)]
  assert.deepEqual(share(big, most), { yours: 1, model: 99 })
  // Everything from the model: 0% yours is true, so it says so.
  assert.deepEqual(share(big, [span(0, 10000)]), { yours: 0, model: 100 })
  // Spaces never count, and overlapping spans count once.
  assert.deepEqual(share('ab    cd', [span(2, 6)]), { yours: 100, model: 0 })
  assert.deepEqual(share('abcd', [span(0, 2), span(1, 2, { pass_id: 'p2' })]), { yours: 50, model: 50 })
})

test('an empty piece: nothing to count, nothing claimed', () => {
  assert.deepEqual(share('', []), { yours: 100, model: 0 })
  assert.deepEqual(share('', [span(0, 4)]), { yours: 100, model: 0 })
  assert.equal(topLine('', []), '')
  assert.equal(finishLine('', []), 'Every word here is yours.')
  assert.deepEqual(clamp([span(0, 4)], ''), [])
  assert.deepEqual(followSpans([], '', 'Hello'), [])
  assert.deepEqual(followSpans(null, '', 'Hello'), [])
  assert.deepEqual(addSpan([], { start: 3, end: 3 }), [])
})

test('Use this adds a span; touching spans from one pass merge, other passes give up the letters they lose', () => {
  const body = 'abcdefghij'
  let spans = addSpan([], span(0, 3, { quote: 'abc' }))
  spans = addSpan(spans, span(3, 5, { quote: 'de' }))
  assert.deepEqual(spans.map(s => [s.start, s.end, s.quote]), [[0, 5, 'abcde']])
  spans = addSpan(spans, span(2, 7, { pass_id: 'p2', quote: 'cdefg' }))
  assert.deepEqual(spans.map(s => [s.start, s.end, s.pass_id]), [[0, 2, 'p1'], [2, 7, 'p2']])
  assert.equal(body.slice(spans[0].start, spans[0].end), spans[0].quote)
  // The shortest-diff guess on its own.
  assert.deepEqual(editOf('abc', 'abXc'), { start: 2, end: 2, inserted: 1 })
  assert.deepEqual(editOf('abc', 'abc'), { start: 3, end: 3, inserted: 0 })
  // A hint that doesn't describe the edit is ignored.
  assert.deepEqual(editOf('abc', 'abXc', { start: 0, end: 0, text: 'Q' }), { start: 2, end: 2, inserted: 1 })
})
