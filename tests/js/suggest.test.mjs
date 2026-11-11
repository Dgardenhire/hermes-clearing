// Damon's notes, Nov 8, 2026: scenes that stay chosen, labels that say what "built in" means, suggested text that is
// screened by Quick check and never inserted on its own, and the shortcut's choice of tool.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SCENES, USED, joinAt, quotedSource, sourceLine, sceneShown, screen, screenTry, shown, toolAt, wordAround } from '../../desktop/src/suggest.js'
import { BUILT_IN, QUICK, WORDS, SUGGEST_KINDS, forRoom, buildTargets } from '../../desktop/src/ask.js'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const lib = Object.fromEntries(['methods', 'craft-paths', 'passes', 'additions'].map(n => [n, JSON.parse(read(`../../library/${n}.json`))]))
const targets = buildTargets({ methods: lib.methods, paths: lib['craft-paths'], passes: lib.passes, add: lib.additions })

test('note 1: every scene is its own choice in dark mode too; the default follows the theme', () => {
  for (const [v] of SCENES) if (v !== 'theme') { assert.equal(sceneShown(v, true), v); assert.equal(sceneShown(v, false), v) }
  assert.equal(sceneShown('theme', true), 'tide')
  assert.equal(sceneShown('theme', false), 'snow')
  assert.deepEqual(SCENES.map(([, l]) => l), ['Snow Light', 'Quiet Marsh', 'Night Tide', 'Plain page', 'Your own picture'])
  const css = read('../../desktop/src/styles.js')
  // The bug: dark mode swapped Quiet Marsh (and every scene) for Night Tide.
  assert.ok(!/:root\.dark \.cl-room\[data-scene=marsh\]\{--cl-scene:\$\{SCENE_DARK\}/.test(css))
  assert.match(css, /:root\.dark \.cl-room\[data-scene=marsh\]\{--cl-scene:\$\{SCENE_MARSH\}/)
  assert.match(css, /:root\.dark \.cl-room\[data-scene=snow\]\{--cl-scene:\$\{SCENE_LIGHT\}/)
  assert.match(css, /\.cl-room\[data-scene=tide\]\{--cl-scene:\$\{SCENE_DARK\}/)
  // Each name reads its own photograph (scenes.js sets --cl-img-<name> on the room as the picture loads).
  assert.match(css, /SCENE_LIGHT = 'var\(--cl-img-snow,none\)', SCENE_MARSH = 'var\(--cl-img-marsh,none\)', SCENE_DARK = 'var\(--cl-img-tide,none\)'/)
})

test('note 2: the built-in tools say what built in means, and "On this computer" is gone', () => {
  assert.equal(BUILT_IN, 'Built in, no AI needed')
  assert.equal(QUICK.group, BUILT_IN)
  assert.equal(WORDS.group, BUILT_IN)
  for (const t of [QUICK, WORDS]) {
    assert.match(t.detail, /works without your model/i)
    for (const bad of [/your computer/i, /no AI model/i, /no model/i, /on this computer/i]) assert.doesNotMatch(t.detail, bad)
  }
  for (const file of ['room.jsx', 'ask.js', 'plugin.js']) assert.ok(!/on this computer/i.test(read(`../../desktop/src/${file}`)), file)
})

test('note 8: Quick check screens suggestions, but never for words the writer already had', () => {
  const { kept, dropped } = screen([{ text: 'The memo calls it efficient.' }, { text: 'Moving forward, the memo leverages efficiency.' },
    { text: 'It is important to note that the memo is wrong.' }, { text: 'The memo is very wrong.' }], 'The memo calls it a modest efficiency.')
  assert.deepEqual(kept.map(o => o.text), ['The memo calls it efficient.'])
  assert.equal(dropped.length, 3)
  // The writer's own "very" stays allowed in a rewrite of a sentence that already had it.
  assert.equal(screen([{ text: 'It was very cold at the door.' }], 'It was very cold outside the door that morning.').kept.length, 1)
  assert.equal(screen([{ opening: 'In today\'s fast-paced world, libraries matter.' }], 'Every Saturday there is a line.', 'opening').kept.length, 0)
  assert.equal(screenTry('That number is real, but it counts only checkouts.', 'That number is real.'), 'That number is real, but it counts only checkouts.')
  assert.equal(screenTry('That number is basically real.', 'That number is real.'), '')
  assert.deepEqual(screen([null, { text: '' }, { text: 7 }], 'x').kept, [])
})

test('note 8: a next sentence goes in at the cursor with the spacing a sentence needs, and only when asked', () => {
  assert.deepEqual(joinAt('One.', 4, 'Two.'), { body: 'One. Two.', span: { start: 5, end: 9 } })
  assert.deepEqual(joinAt('One. Three.', 5, 'Two.'), { body: 'One. Two. Three.', span: { start: 5, end: 9 } })
  assert.deepEqual(joinAt('One.\n\nThree.', 4, ' Two. '), { body: 'One. Two.\n\nThree.', span: { start: 5, end: 9 } })
  assert.deepEqual(joinAt('', 0, 'First.'), { body: 'First.', span: { start: 0, end: 6 } })
  assert.equal(joinAt('Word', 2, 'x').body, 'Wo x rd') // inside a word it still never glues two words together
  assert.equal(joinAt('Done', 99, 'More.').body, 'Done More.')
})

test('note 4: the shortcut opens other words for a word, the passage tools for a selection, a next sentence in a gap', () => {
  const b = 'The memo counts checkouts.\n\nNext paragraph.'
  assert.equal(toolAt(b, 4, 8), 'word')
  assert.equal(toolAt(b, 0, 15), 'passage')
  assert.equal(toolAt(b, 6, 6), 'word')
  assert.equal(toolAt(b, 26, 26), 'next')
  assert.equal(toolAt(b, 27, 27), 'next')
  assert.deepEqual(wordAround(b, 6), { start: 4, end: 8 })
  assert.deepEqual(wordAround("it's here", 2), { start: 0, end: 4 })
  assert.equal(wordAround('a  b', 2), null)
})

test('note 5: a page brought in reads as clean paragraphs under one source line, with no quote marks', () => {
  const now = new Date('2026-11-08T12:00:00')
  const q = quotedSource('Branch hours', 'https://www.example.org/x', 'First para.\n\nSecond\nline.', 20000, null, now)
  assert.equal(q, 'From “Branch hours”, example.org, read Nov 8, 2026.\n\nFirst para.\n\nSecond\nline.')
  assert.ok(!/^>/m.test(q))
  assert.equal(quotedSource('', 'https://e.org/a', 'Words.', 20000, '2026-10-02T09:00:00', now), 'From e.org, Oct 2, 2026.\n\nWords.')
  const long = quotedSource('', 'https://e.org', 'word '.repeat(10000), 200, null, now)
  assert.ok(long.endsWith('(The page goes on; the rest is at the link.)'))
  assert.ok(long.length < 400)
})

test('note 8: the off switch takes every kind that drafts words out of the Ask line and All methods', () => {
  const off = forRoom(targets, false), on = forRoom(targets, true)
  assert.ok(off.every(t => !SUGGEST_KINDS.has(t.kind)))
  for (const id of ['rewrite', 'next', 'endings', 'titles', 'openings', 'wording', 'flip:thesis', 'method:draft']) {
    assert.ok(on.some(t => t.id === id), id)
    assert.ok(!off.some(t => t.id === id), id)
  }
  assert.ok(!on.some(t => t.id === 'apply')) // Show me runs from a note, never from the Ask line
  assert.ok(off.some(t => t.id === 'pass:weakest'))
  assert.deepEqual(Object.keys(USED).sort(), ['change', 'draft', 'ending', 'flip', 'next', 'note', 'opening', 'rewrite', 'title', 'wording'])
})

test('note 8: the room never inserts a suggestion on its own: every insertion follows a click', () => {
  const room = read('../../desktop/src/room.jsx')
  const callers = [...room.matchAll(/useSuggested\(/g)].length
  assert.equal(callers, 3) // its definition, Use this on a note (useShown), Use this on a rewrite or next sentence (useOption)
  for (const name of ['useShown', 'useOption']) assert.ok(new RegExp(`onClick=\\{[^}]*${name}`).test(room), `${name} runs only from a click`)
  const body = name => { const s = room.indexOf(`  function ${name}(`); return room.slice(s, room.indexOf('\n  }\n', s)) }
  for (const name of ['land', 'poll', 'follow', 'tryOption', 'showMe']) assert.ok(!/changeBody\(|useSuggested\(/.test(body(name)), `${name} changes the page`)
})

test('never an empty card: retry once, then fold every option under the rule it broke', () => {
  const opts = [{ text: 'Moving forward, it works.' }, { text: 'It is basically fine.' }]
  let asked = 0
  assert.equal(shown(opts, 'It works.', 'text', () => { asked++; return true }), null)
  assert.equal(asked, 1)
  const folded = shown(opts, 'It works.', 'text', () => false)
  assert.equal(folded.folded, true)
  assert.deepEqual(folded.list.map(o => o.flag), ['Adds a stock phrase: “Moving forward”', 'Adds filler: “basically”'])
  assert.deepEqual(shown([{ text: 'It works well.' }, ...opts], 'It works.', 'text', () => true), { list: [{ text: 'It works well.' }], dropped: 2, folded: false })
})

test('plain labels: no UI string says where instead of what, or sells on free', () => {
  for (const file of ['room.jsx', 'ask.js', 'plugin.js', 'suggest.js']) {
    const strings = [...read(`../../desktop/src/${file}`).matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map(m => m[2])
    for (const bad of [/on this computer/i, /\bno model\b/i, /\btokens?\b/i, /no credits/i, /no keys/i, /kept on your computer/i]) {
      const hit = strings.find(x => bad.test(x))
      assert.equal(hit, undefined, `${file}: "${hit}"`)
    }
  }
  const room = read('../../desktop/src/room.jsx')
  assert.ok(room.includes("'Typed out privately. Nothing is sent.'"))
  assert.ok(room.includes('Sent to {card.label'))
})
