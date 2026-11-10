import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { QUICK, WORDS, buildTargets, findTargets, libraryMenu, shortFor } from '../../desktop/src/ask.js'

const read = name => JSON.parse(readFileSync(new URL(`../../library/${name}`, import.meta.url)))
const lib = { methods: read('methods.json'), paths: read('craft-paths.json'), passes: read('passes.json'), add: read('additions.json') }
const targets = buildTargets(lib)
const ask = q => findTargets(q, targets, { figures: lib.add.figures }).map(t => t.title)

test('the page and the backend list the same targets', () => {
  const expected = process.env.CLEARING_PY_TARGETS
  if (expected) assert.deepEqual(targets.map(t => `${t.id}|${t.kind}`), JSON.parse(expected))
  const aliases = process.env.CLEARING_PY_ALIASES // the added and dropped Ask words, and each path's for line
  if (aliases) assert.deepEqual(Object.fromEntries(targets.map(t => [t.id, [t.aliases, t.for || '']])), JSON.parse(aliases))
  assert.equal(targets.filter(t => t.kind === 'later').length, 0) // every one of the 33 methods runs in the room
  assert.equal(new Set(targets.map(t => t.id)).size, targets.length)
})

test('plain words find the right pass', () => {
  assert.equal(ask('my opening is weak')[0], 'Propose openings')
  assert.ok(ask('my ending is weak').slice(0, 3).includes('Land the ending'))
  assert.ok(ask('it sounds like AI').slice(0, 2).includes('Remove the AI feel'))
  assert.ok(ask('where do readers get lost').slice(0, 2).includes('See where readers get lost'))
  assert.ok(ask('too many hedges').slice(0, 2).includes('Find hedges and filler'))
  assert.ok(ask('typos').includes('Fix punctuation and typos'))
  assert.ok(ask('dialogue').slice(0, 3).includes('Shape captured conversation'))
  assert.ok(ask('chiasmus').slice(0, 2).includes('Balance, contrast & threes'))
  assert.ok(ask('passive voice').slice(0, 3).includes('Choose active or passive on purpose'))
  assert.ok(ask('find the story arc').slice(0, 3).includes("Map the story's arc"))
})

test('an empty line shows the starters and nothing that cannot run', () => {
  const start = ask('')
  assert.equal(start[0], 'Quick check')
  assert.ok(start.includes('Find weak sentences'))
  assert.ok(ask('turn my notes into a draft').slice(0, 3).includes('Turn material into a draft'))
})

test('every pass, method, technique and check is reachable from the Ask line by its own name', () => {
  const missed = []
  for (const t of [QUICK, WORDS, ...targets.filter(x => !x.hidden)]) { // Show me runs from a note, never the Ask line
    const hits = findTargets(t.title, targets, { figures: lib.add.figures })
    if (hits[0].id !== t.id) missed.push(`${t.title} -> ${hits[0].title}`)
  }
  assert.deepEqual(missed, [])
})

test('the new methods answer to the words a writer would use', () => {
  assert.ok(ask('find my main point').slice(0, 3).includes('Three ways to state the main point'))
  assert.ok(ask('check the promise to my reader').slice(0, 3).includes('Three ways to make the promise'))
  assert.ok(ask('does this sound like me').slice(0, 3).includes('Check whether it sounds like you'))
  assert.ok(ask('several editorial perspectives').slice(0, 3).includes('Get several editorial perspectives'))
  assert.ok(ask('let the reviewers argue').slice(0, 3).includes('Let reviewers argue it through'))
  assert.ok(ask('remember this lesson for next time').slice(0, 3).includes('Keep a lesson for next time'))
  assert.ok(ask('build my writing guidance').slice(0, 3).includes('Build your writing guidance'))
  assert.ok(ask('set up a writing home folder').slice(0, 3).includes('Set up a writing home'))
  assert.ok(ask('compare drafts').slice(0, 3).includes('Find the piece across drafts'))
  assert.ok(ask('zeugma').slice(0, 2).includes('Sentence order & syntax'))
  assert.ok(ask('synecdoche').slice(0, 2).includes('Image, sense & substitution'))
})

test('the methods menu lists everything the Ask line can run, all five craft paths and every figure', () => {
  const menu = libraryMenu(targets, lib.add)
  const listed = menu.sections.flatMap(s => s.items.map(t => t.id))
  assert.deepEqual([...listed].sort(), [QUICK.id, WORDS.id, ...targets.filter(t => !t.hidden).map(t => t.id)].sort())
  const titles = menu.sections.map(s => s.title)
  for (const p of lib.paths.paths) assert.ok(titles.includes(p.title), p.title)
  assert.ok(titles.includes('Composition checks'))
  assert.equal(menu.sections.find(s => s.title === 'Composition checks').items.length, 9)
  assert.equal(menu.figures.groups.flatMap(g => g.figures).length, 44)
  for (const g of menu.figures.groups) assert.ok(g.target, `${g.focus} has a technique to run`)
})

test('no two figures share wording: each has its own definition and its own example', () => {
  const figs = lib.add.figures.groups.flatMap(g => g.figures)
  const tri = s => { const w = s.toLowerCase().match(/[a-z]+/g); const out = new Set(); for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(' ')); return out }
  for (const f of figs) assert.equal(f.length, 3, `${f[0]} has a definition and an example`)
  for (let i = 0; i < figs.length; i++) for (let j = i + 1; j < figs.length; j++) {
    for (const k of [1, 2]) {
      const shared = [...tri(figs[i][k])].filter(x => tri(figs[j][k]).has(x))
      assert.deepEqual(shared, [], `${figs[i][0]} and ${figs[j][0]}`)
    }
  }
  const def = name => figs.find(f => f[0] === name)[1]
  for (const [a, b] of [['zeugma', 'syllepsis'], ['merism', 'synecdoche']]) {
    const words = s => new Set(s.toLowerCase().match(/[a-z]{4,}/g))
    const both = [...words(def(a))].filter(w => words(def(b)).has(w))
    assert.ok(both.length <= 1, `${a} and ${b} share ${both}`)
  }
})

// Persona test, Nov 8, 2026: the words a retired teacher, a reporter on deadline and a novelist actually typed.
// Before these additions roughly a third of them got "Nothing in the library matches those words."
test('the Ask line answers to the words writers actually type', () => {
  const first = q => ask(q)[0]
  const top = (q, n = 3) => ask(q).slice(0, n)
  for (const q of ['spelling', 'grammar', 'check my grammar', 'proofread', 'commas', 'typos']) assert.equal(first(q), 'Fix punctuation and typos', q)
  assert.equal(first('check'), 'Quick check')
  assert.ok(!top('check my grammar', 7).includes('Three ways to make the promise'))
  assert.equal(first('stronger lede'), 'Propose openings')
  assert.ok(top('nut graf').includes('Get to the point sooner'))
  assert.equal(first('headline'), 'Build curiosity in the title & opening')
  for (const q of ['deadline', 'kill my darlings']) assert.equal(first(q), 'Try a shorter draft', q)
  assert.equal(first('kicker'), 'Land the ending')
  assert.equal(first('remembering my mother'), 'Find the moment worth telling')
  assert.ok(top('memoir').includes('Find the moment worth telling'))
  assert.equal(first('voice'), 'Check whether it sounds like you')
  assert.equal(first('dialogue sounds fake'), 'Shape captured conversation')
  assert.ok(top('what does june want', 2).includes('Check the story foundations'))
  for (const q of ['subtext', 'conflict', 'fiction', 'novel', 'character']) assert.ok(top(q, 4).some(t => /story foundations|Raise stakes|Build scenes|Choose whose story|decisive change/.test(t)), q)
  assert.ok(top('stakes').includes('Raise stakes and suspense'))
  assert.ok(!top('stakes').includes('Three ways to make the promise'))
  assert.ok(top('the middle sags').includes('Keep it moving'))
  assert.equal(first('help me write the next scene'), 'Build scenes without rambling')
  for (const q of ['simile', 'metaphor']) assert.ok(top(q, 2).includes('Image, sense & substitution'), q)
  assert.equal(first('rewrite this'), 'Suggest wording')
})

test('a bare "remember" no longer means Keep a lesson; the lesson still answers to its own words', () => {
  assert.ok(!ask('remember').includes('Keep a lesson for next time'))
  assert.ok(ask('remember this lesson for next time').slice(0, 3).includes('Keep a lesson for next time'))
})

test('each craft path says who it is for, and a novelist finds hers', () => {
  const human = targets.filter(t => t.group === 'Find the human story')
  assert.ok(human.length >= 7 && human.every(t => /fiction/.test(t.for)))
  const menu = libraryMenu(targets, lib.add)
  assert.match(menu.sections.find(s => s.title === 'Find the human story').detail, /^For fiction, memoir and personal essays/)
  for (const p of lib.paths.paths) {
    const line = menu.sections.find(s => s.title === p.title).detail
    assert.ok(line, `${p.title} has a for line`)
    assert.ok(shortFor(line).length <= 24, `${p.title}: "${shortFor(line)}" fits an Ask line row`)
  }
  assert.equal(shortFor('For fiction, memoir and personal essays'), 'fiction, memoir')
})

test('a few figures carry a narrative example next to the civic ones', () => {
  const ex = Object.fromEntries(lib.add.figures.groups.flatMap(g => g.figures).map(([n, , e]) => [n, e]))
  for (const n of ['alliteration', 'diacope', 'antithesis', 'aposiopesis', 'litotes', 'periodic sentence']) assert.ok(!/council|budget|vote|memo|branch|board/i.test(ex[n]), n)
})
