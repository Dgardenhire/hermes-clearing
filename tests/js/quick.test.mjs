// Quick check on real prose (persona test, Nov 8, 2026): a reporter's quotes, abbreviations, a two-sentence
// line that only looked like "not X, it's Y", "kind of" meaning "type of", and the stock opening it used to miss.
// Each test here failed on the Quick check before these fixes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUESTIONS, instantFindings, instantRead, quotedCounts, sentences, summarize } from '../../desktop/src/quick-check.js'

const kinds = body => instantFindings(body).map(f => f.kind)
const split = body => sentences(body).map(s => body.slice(s.start, s.end))

test('words inside quotation marks are left alone, curly or straight, and counted', () => {
  const body = '“At the end of the day, we leverage world-class care moving forward,” the director said. ' +
    '"It is very generous," she added. It is worth noting that nobody asked the nurses.'
  const r = instantRead(body)
  assert.deepEqual(r.findings.map(f => f.quote), ['It is worth noting that'])
  assert.equal(r.quoted, 5) // at the end of the day, leverage, world-class, moving forward, very
  assert.match(summarize(r.findings, r.quoted), /Words inside quotation marks are left alone \(5 spots here\)/)
})

test('a quote that runs on into the next paragraph is still a quote; a paragraph break closes it', () => {
  const body = '“We will leverage the new wing.\n\n“And moving forward, the clinic is basically fine.\n\nHe was very tired.'
  assert.deepEqual(instantFindings(body).map(f => f.quote), ['very'])
})

test('a not-X-its-Y setup inside a quote is left alone', () => {
  const body = '"This is not a story about closing a unit, it\'s a story about building a network," Pryor said.'
  assert.deepEqual(kinds(body), [])
})

test('sentences do not end at Dr., Mr., St., Sen. or an initial', () => {
  const body = 'Dr. Ellen J. Okafor met Mr. Pruitt at St. Agnes. Then State Sen. Martha Beaulieu spoke.'
  assert.deepEqual(split(body), ['Dr. Ellen J. Okafor met Mr. Pruitt at St. Agnes.', 'Then State Sen. Martha Beaulieu spoke.'])
})

test('a.m., p.m., e.g., i.e. and U.S. stay inside a sentence unless a new one plainly starts', () => {
  const body = 'She was born at 1:52 a.m., with a deputy on the phone. They were five minutes apart at 11:40 p.m. Her husband was away. ' +
    'The U.S. Senate voted, e.g. on rural care, i.e. on births. It passed.'
  assert.deepEqual(split(body), [
    'She was born at 1:52 a.m., with a deputy on the phone.',
    'They were five minutes apart at 11:40 p.m.',
    'Her husband was away.',
    'The U.S. Senate voted, e.g. on rural care, i.e. on births.',
    'It passed.',
  ])
})

test('a dialogue tag after a question stays in its sentence; a line break always ends one', () => {
  assert.deepEqual(split('"Where are you going?" she asked. Nobody answered\nThe end'), ['"Where are you going?" she asked.', 'Nobody answered', 'The end'])
})

test('a long sentence split by a.m. is now counted whole', () => {
  const body = 'Ruiz delivered her daughter in the back seat of an old sedan in the parking lot of a discount store at 1:52 a.m., ' +
    'with a sheriff\'s deputy on the phone with a dispatcher who was reading instructions off a laminated card that somebody had taped to the dash years ago.'
  const found = instantFindings(body)
  assert.equal(found.length, 1)
  assert.equal(found[0].kind, 'long')
  assert.equal(found[0].quote, body)
})

test('two separate sentences are not a not-X-its-Y setup, and a bare "thing" never triggers it', () => {
  assert.deepEqual(kinds('She did not speak. She held the baby, who slept through the whole thing.'), [])
  assert.deepEqual(kinds('He was not happy, and he said so about the whole thing.'), [])
})

test('the real setups are still found, in one sentence or two', () => {
  const one = 'The budget is not the problem, it is the plan that is the problem.'
  assert.deepEqual(instantFindings(one).map(f => [f.kind, f.quote]), [['contrast', one]])
  const two = 'This isn\'t a story about money. It\'s a story about trust. We left.'
  assert.deepEqual(instantFindings(two).map(f => [f.kind, f.quote]), [['contrast', 'This isn\'t a story about money. It\'s a story about trust.']])
})

test('"kind of" meaning "type of" is not filler; the hedge still is', () => {
  assert.deepEqual(kinds('They had to decide what kind of hospital they wanted to be. The same sort of night came again.'), [])
  assert.deepEqual(instantFindings('It was kind of funny, and sort of sad.').map(f => f.quote), ['kind of', 'sort of'])
})

test('stock openings are caught', () => {
  const lede = 'In today\'s rapidly changing healthcare landscape, small hospitals face hard choices.'
  assert.deepEqual(instantFindings(lede).map(f => [f.kind, f.quote]), [['stock-open', 'In today\'s rapidly changing healthcare landscape']])
  for (const s of ['In an ever-changing world, we adapt.', 'Now more than ever, the clinic matters.', 'Since the dawn of time, people have told stories.', 'We live in a fast-moving world of screens.', 'It\'s no secret that rents are up.']) {
    assert.ok(kinds(s).includes('stock-open'), s)
  }
  assert.deepEqual(kinds('Today the clinic opened at nine.'), [])
})

test('no mark starts or ends with a space, and every mark matches the text exactly', () => {
  const body = 'Dr. Ellen Okafor said nothing. The plan is not the problem, it is the point. It is worth noting that\n  very few came.'
  for (const f of instantFindings(body)) {
    assert.equal(body.slice(f.start, f.end), f.quote)
    assert.equal(f.quote, f.quote.trim())
  }
})

test('the questions-not-rules line comes with what was found, so it can open the walk', () => {
  const r = instantRead('It is worth noting that the plan is very good. It is basically done.')
  const line = summarize(r.findings, r.quoted)
  assert.equal(line, `Found 1 throat-clearing phrase and 2 filler words. ${QUESTIONS}`)
  assert.match(summarize([], 0), /^Nothing obvious to question\./)
})

test('quotation counting is one pass and handles a stray closing mark', () => {
  const cum = quotedCounts('a ” b “c” d "e" f')
  assert.equal(cum[cum.length - 1], 6) // “c” and "e" with their marks
})

test('quick check stays linear on a long piece full of quotes and abbreviations', () => {
  const unit = '“It is not about the money, it is about trust,” said Dr. Ruiz at 9 a.m. on the U.S. route. It was very late. '
  const body = unit.repeat(Math.ceil(400000 / unit.length))
  const t = Date.now()
  const r = instantRead(body)
  assert.ok(Date.now() - t < 4000, `took ${Date.now() - t} ms`)
  assert.ok(r.findings.every(f => f.quote === 'very'))
})
