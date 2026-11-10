import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyChanges, asMarkdown, editSpan, fileName, findNear, followEdit, fromFile, markAt, runs, wordCount } from '../../desktop/src/text.js'
import { instantFindings } from '../../desktop/src/quick-check.js'

const sample = JSON.parse(readFileSync(new URL('../../library/sample.json', import.meta.url)))

test('quick check finds the sample piece habits with no model', () => {
  const found = instantFindings(sample.body)
  const quotes = found.map(f => f.quote)
  assert.ok(quotes.includes('It is important to note that'))
  assert.ok(quotes.includes('I think that might'))
  assert.ok(quotes.includes('basically'))
  assert.ok(quotes.includes('leverage'))
  assert.ok(found.some(f => f.issue.startsWith('This sentence runs')))
  for (const f of found) assert.equal(sample.body.slice(f.start, f.end), f.quote)
})

test('marks follow edits and are set aside when their words change', () => {
  const before = 'One two three. Four five six.'
  const marks = [{ id: 'a', start: 0, end: 3, quote: 'One' }, { id: 'b', start: 15, end: 19, quote: 'Four' }]
  const inserted = followEdit(marks, before, 'Zero. ' + before)
  assert.deepEqual(inserted.map(m => [m.start, m.end]), [[6, 9], [21, 25]])
  const rewritten = followEdit(marks, before, 'One two three. Many five six.')
  assert.equal(rewritten[1].changed, true)
  assert.equal(rewritten[0].changed, undefined)
  const deleted = followEdit(marks, before, ' two three. Four five six.')
  assert.equal(deleted[0].changed, true)
  assert.deepEqual([deleted[1].start, deleted[1].end], [12, 16])
})

test('edit span and find near', () => {
  assert.deepEqual(editSpan('abcdef', 'abXdef'), { start: 2, oldEnd: 3, newEnd: 3, delta: 0 })
  assert.equal(findNear('the cat and the cat', 'cat', 0, 4), 4)
  assert.equal(findNear('the cat and the cat', 'cat', 0, 400), -1)
})

test('kept changes apply only where the words still match', () => {
  const body = 'Teh cat sat. It sat their.'
  const changes = [
    { start: 0, end: 3, quote: 'Teh', replacement: 'The' },
    { start: 17, end: 25, quote: 'at their', replacement: 'at there' },
    { start: 4, end: 7, quote: 'dog', replacement: 'cow' },
  ]
  const { body: out, applied } = applyChanges(body, changes)
  assert.equal(out, 'The cat sat. It sat there.')
  assert.equal(applied, 2)
})

test('runs, marks and files', () => {
  const r = runs('abc def ghi', [{ id: 'x', start: 4, end: 7, quote: 'def' }], 'x')
  assert.deepEqual(r.map(x => x.text), ['abc ', 'def', ' ghi'])
  assert.equal(r[1].active, true)
  assert.equal(markAt([{ start: 4, end: 7 }], 5).start, 4)
  assert.equal(fileName('A/B: "c"?', 'md'), 'A B c.md')
  assert.equal(fileName('', 'txt'), 'Untitled.txt')
  assert.equal(asMarkdown('T', 'Body\n'), '# T\n\nBody\n')
  assert.deepEqual(fromFile('x.md', '# Title\n\nBody'), { title: 'Title', body: 'Body' })
  assert.deepEqual(fromFile('notes.txt', 'Just words'), { title: 'notes', body: 'Just words' })
  assert.equal(wordCount(sample.body), sample.body.trim().split(/\s+/).length)
})

test('accepting cuts leaves clean sentences and skips kept or moved ones', async () => {
  const { applyCuts } = await import('../../desktop/src/text.js')
  const b = 'There is a line. It is important to note that most people come for the Wi-Fi. That number is real. It is also wrong.'
  const at = q => ({ start: b.indexOf(q), end: b.indexOf(q) + q.length, quote: q })
  const r = applyCuts(b, [at('It is important to note that '), at('That number is real.'), { ...at('It is also wrong.'), kept: true }])
  assert.equal(r.body, 'There is a line. Most people come for the Wi-Fi. It is also wrong.')
  assert.equal(r.applied, 2)
  const moved = applyCuts(b, [{ ...at('That number is real.'), quote: 'Something else.' }])
  assert.equal(moved.applied, 0)
  assert.equal(moved.body, b)
  const tail = applyCuts('One. Two, which matters.', [{ start: 8, end: 23, quote: ', which matters' }])
  assert.equal(tail.body, 'One. Two.')
})

test('paragraphs for the shape strip', async () => {
  const { paragraphs } = await import('../../desktop/src/text.js')
  const b = 'One two three.\nStill one.\n\n\nFour five.\n\n  \nSix.'
  const ps = paragraphs(b)
  assert.deepEqual(ps.map(p => p.words), [5, 2, 1])
  assert.equal(b.slice(ps[1].start, ps[1].end), 'Four five.')
  assert.deepEqual(paragraphs(''), [])
})

test('a pass lands once, and only while the margin waits on it', async () => {
  const { createPassGate } = await import('../../desktop/src/gate.js')
  const gate = createPassGate()
  const waiting = { type: 'working', pass: { id: 'p1' } }
  assert.equal(gate.claim(waiting, 'p1'), true)
  assert.equal(gate.claim(waiting, 'p1'), false) // the event and the poll both answered
  assert.equal(gate.claim(null, 'p2'), false) // the writer opened another piece
  assert.equal(gate.claim({ type: 'words' }, 'p2'), false)
  assert.equal(gate.claim({ type: 'working', pass: { id: 'p3' } }, 'p2'), false) // a newer pass is running
  gate.drop('p4') // stopped
  assert.equal(gate.claim({ type: 'working', pass: { id: 'p4' } }, 'p4'), false)
  assert.equal(gate.claim(waiting, ''), false)
})

test('an opened file loses its byte-order mark', () => {
  assert.deepEqual(fromFile('a.txt', '﻿Hello'), { title: 'a', body: 'Hello' })
})
