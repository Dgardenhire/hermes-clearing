import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createThesaurus, normalizeSelection } from '../../desktop/src/thesaurus.js'
import { findTargets, buildTargets } from '../../desktop/src/ask.js'
import { followEdit, replaceSpan } from '../../desktop/src/text.js'

const shardFile = key => new URL(`../../library/thesaurus/${key}.json`, import.meta.url)
const local = () => createThesaurus(async key => (existsSync(shardFile(key)) ? JSON.parse(readFileSync(shardFile(key))) : { w: {} }))

test('every shard the lookup can ask for is on disk, with its notice', () => {
  const keys = 'abcdefghijklmnopqrstuvwxyz'.split('')
  for (const a of keys) for (const b of [...keys, '_']) if (existsSync(shardFile(`${a}${b}`))) assert.ok(JSON.parse(readFileSync(shardFile(`${a}${b}`))).w)
  assert.ok(existsSync(new URL('../../library/thesaurus/NOTICE.txt', import.meta.url)))
})

test('one word finds senses and alternatives, in the writer\'s case and form', async () => {
  const t = local()
  const modest = await t.lookup('modest')
  assert.ok(modest.groups.some(g => g.words.includes('small')))
  const cap = await t.lookup('Modest')
  assert.ok(cap.groups.some(g => g.words.includes('Small')))
  const plural = await t.lookup('counts')
  assert.equal(plural.lemma, 'count')
  assert.ok(plural.groups.every(g => g.words.every(w => w.toLowerCase() !== 'counts')))
})

test('no entry and not one word', async () => {
  const t = local()
  assert.deepEqual((await t.lookup('qwzx')).groups, [])
  assert.equal(normalizeSelection('two words'), null)
  assert.equal(normalizeSelection('“modest,”'), 'modest')
})

test('a failed shard means no groups, not an exception', async () => {
  const t = createThesaurus(async () => { throw new Error('Hermes desktop bridge unavailable') })
  assert.deepEqual((await t.lookup('modest')).groups, [])
})

test('the Ask line finds Other words', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../../library/${name}`, import.meta.url)))
  const targets = buildTargets({ methods: read('methods.json'), paths: read('craft-paths.json'), passes: read('passes.json'), add: read('additions.json') })
  assert.equal(findTargets('thesaurus', targets)[0].title, 'Other words')
  assert.equal(findTargets('synonym', targets)[0].title, 'Other words')
  assert.equal(findTargets('rephrase this', targets)[0].title, 'Suggest wording')
})

test('a swapped word stays pinned through edits elsewhere, and is set aside when rewritten', () => {
  const body = 'The memo calls it a modest efficiency. It is not.'
  const at = body.indexOf('modest')
  const { body: swapped, span } = replaceSpan(body, at, at + 6, 'small')
  const word = { id: 'word', start: span.start, end: span.end, quote: 'small' }
  const before = 'Today. ' + swapped
  const [moved] = followEdit([word], swapped, before)
  assert.equal(before.slice(moved.start, moved.end), 'small')
  const [gone] = followEdit([word], swapped, swapped.replace('small', 'tiny'))
  assert.ok(gone.changed)
})
