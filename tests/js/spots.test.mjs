// opps1, Nov 9: Find figures of speech and Where to add a technique on the page side. Names and definitions come from the library
// (the same JSON files the backend reads), looked up by id; an id the library doesn't have draws nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canAskCoach, canUseMine, figureMarks, libraryItem, oppMarks, typeLine, whyLabel } from '../../desktop/src/spots.js'

const read = f => JSON.parse(readFileSync(new URL(`../../library/${f}`, import.meta.url), 'utf8'))
const LIB = { methods: read('methods.json'), paths: read('craft-paths.json'), passes: read('passes.json'), add: read('additions.json') }

test('library items by id: figures, passage methods, craft steps and the story arc; nothing else', () => {
  const t = libraryItem(LIB, 'figure:tricolon')
  assert.deepEqual([t.type, t.name, t.group], ['figure', 'Tricolon', 'Balance, contrast & threes'])
  assert.equal(t.definition, LIB.add.figures.groups[2].figures.find(f => f[0] === 'tricolon')[1])
  assert.equal(libraryItem(LIB, 'method:specificity').name, 'Find the specific and surprising')
  assert.equal(libraryItem(LIB, 'method:panel'), null) // a whole-piece method is not an opportunity
  assert.equal(libraryItem(LIB, 'craft:true-nonfiction:17').name, 'Build a litany or paired accumulation')
  assert.equal(libraryItem(LIB, 'craft:human-story:arc-2').name, LIB.add.story.focuses[1].title)
  assert.equal(libraryItem(LIB, 'figure:made-up'), null)
  assert.equal(libraryItem(LIB, 'craft:nope:1'), null)
  assert.equal(libraryItem(LIB, ''), null)
})

test('the page and the backend name every item the same way', { skip: !process.env.CLEARING_PY_ITEMS }, () => {
  const py = JSON.parse(process.env.CLEARING_PY_ITEMS)
  assert.ok(Object.keys(py).length > 90)
  for (const [id, [type, name, definition, group]] of Object.entries(py)) {
    const it = libraryItem(LIB, id)
    assert.ok(it, id)
    assert.deepEqual([it.type, it.name, it.definition, it.group], [type, name, definition, group], id)
  }
})

test('figure marks use the library name and definition, never the answer\'s, and drop unknown ids', () => {
  const r = { figures: [
    { id: 'figure:anaphora', name: 'Made-up name', definition: 'made up', start: 0, end: 10, quote: 'Every Satu', works: true, why: 'A ritual.' },
    { id: 'figure:nonesuch', start: 20, end: 30, quote: 'x', works: true, why: 'x' },
    { id: 'figure:pleonasm', start: 40, end: 50, quote: 'y', works: false, why: 'Adds length.' },
  ] }
  const ms = figureMarks(LIB, r, 1)
  assert.deepEqual(ms.map(m => [m.item, m.name, m.works]), [['figure:anaphora', 'Anaphora', true], ['figure:pleonasm', 'Pleonasm', false]])
  assert.equal(ms[0].definition, libraryItem(LIB, 'figure:anaphora').definition)
  assert.equal(ms[0].kind, 'figure')
  assert.equal(whyLabel(ms[0]), 'Why it works here')
  assert.equal(whyLabel(ms[1]), "Why it doesn't land yet")
  assert.equal(typeLine(ms[0]), 'Figure · Repetition & return')
})

test('opportunity marks are numbered by rank after unknown ids drop out', () => {
  const r = { opportunities: [
    { id: 'method:economy', start: 0, end: 5, quote: 'a', why: 'Cut it.' },
    { id: 'method:panel', start: 6, end: 9, quote: 'b', why: 'x' },
    { id: 'craft:true-nonfiction:17', start: 10, end: 20, quote: 'c', why: 'A litany.' },
  ] }
  const ms = oppMarks(LIB, r, 1)
  assert.deepEqual(ms.map(m => [m.item, m.n, m.rank]), [['method:economy', 1, 1], ['craft:true-nonfiction:17', 2, 2]])
  assert.equal(typeLine(ms[1]), 'Craft step · Shape true nonfiction')
  assert.equal(typeLine(ms[0]), 'Method')
  assert.equal(whyLabel(ms[0]), 'Why here')
})

test('Try it: the coach is asked only about a real line that differs from the words it started from', () => {
  const q = 'Every Saturday there is a line.'
  assert.equal(canAskCoach(q, q), false)
  assert.equal(canAskCoach('Every  Saturday there is a line.', q), false) // spacing alone is not a try
  assert.equal(canAskCoach('Two words', q), false)
  assert.equal(canAskCoach('Every Saturday there is a line, and every Saturday it grows.', q), true)
  assert.equal(canAskCoach('word '.repeat(300), q), false)
  assert.equal(canUseMine(q, q), false)
  assert.equal(canUseMine('', q), false)
  assert.equal(canUseMine('Every Saturday, a line.', q), true)
})
