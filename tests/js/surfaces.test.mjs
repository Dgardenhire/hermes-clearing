// The screens a stranger meets first (surfaces lane, Nov 8, 2026): the desk's rows, Read my piece's real steps, the
// blanks in a suggested opening, the read result's shapes, the Start form's limits, and a copy audit of every word.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COPY, ICON, LIMIT, addsLine, allCopy, blanks, clock, counter, deskRows, libraryLabel, progressLine, quickLabel, readView, sentenceAt, validateStart } from '../../desktop/src/surfaces.js'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const FILES = ['welcome.jsx', 'desk.jsx', 'start.jsx', 'read.jsx', 'surfaces.js', 'authorship.js']

// The sample read in docs/SUGGEST-API.md section 7 (lane B's contract), on the sample piece.
const READ = {
  verdict: "The piece makes its case with real people, then hands the memo the last word on numbers. Name what the memo's number counts and what it misses, and the argument closes. The second paragraph hedges where it should claim.",
  changes: [
    { rank: 3, quote: 'basically leverage', start: 575, end: 593, change: 'Trade the business verb for the plain one', why: "'Leverage' is memo language.", try: 'turn', unsupported: [] },
    { rank: 1, quote: 'That number is real.', start: 1310, end: 1330, change: 'Say what the number counts', why: "'Real' concedes the memo's ground.", try: 'That number counts checkouts, and only checkouts.', unsupported: [] },
    { rank: 2, quote: 'I think that might perhaps understate what the building actually does', start: 428, end: 497, change: 'Cut the three hedges and claim it', why: 'Three doubts on the main claim.', try: 'That understates what the building does', unsupported: ["'1,400'"] },
  ],
  cut_first: { quote: 'It is important to note that', start: 108, end: 136, why: 'The sentence starts sooner without it.' },
  counts: { returned: 5, matched: 4, dropped: 1, praise: 0 },
}

test('the desk lists its rows in order, Read my piece first and Quick check last; Talk it through only when it can run', () => {
  const rows = deskRows({ quickCount: 3, canTalk: true, modKey: '⌘E' })
  assert.deepEqual(rows.map(r => r.id), ['read', 'ask', 'bring', 'talk', 'quick'])
  assert.deepEqual(rows.map(r => r.label), ['Read my piece', 'Ask the editor', 'Bring in', 'Talk it through', 'Quick check: 3 things to look at'])
  assert.equal(rows.filter(r => r.primary).length, 1)
  assert.equal(rows[0].sub.label, "Get three editors' reads")
  // The two readings beside Read my piece say what they do in plain words: figures of speech, not numbers.
  assert.deepEqual(rows[0].beside.map(x => x.label), ['Find figures of speech', 'Where to add a technique'])
  assert.equal(rows[1].key, '⌘E')
  const without = deskRows({ quickCount: 3, canTalk: false })
  assert.deepEqual(without.map(r => r.id), ['read', 'ask', 'bring', 'quick'])
  assert.ok(!without.some(r => /talk/i.test(r.label)))
  assert.equal(deskRows({}).find(r => r.id === 'ask').key, 'Ctrl E')
  // A row that can't run is left out, never shown dead; Read my piece stays while it runs.
  assert.deepEqual(deskRows({ canRead: false, canAsk: false, canBringIn: false }).map(r => r.id), ['quick'])
  const busy = deskRows({ canRead: false, busy: true })
  assert.equal(busy[0].id, 'read')
  assert.equal(busy[0].busy, true)
  // The compact desk (under an open read) keeps every label, Quick check with its count only.
  assert.deepEqual(rows.map(r => r.tight), ['Read my piece', 'Ask the editor', 'Bring in', 'Talk it through', 'Quick check: 3'])
  assert.equal(deskRows({ quickCount: 0 }).at(-1).tight, 'Quick check')
  // Five rows at most: the narrow bar has five labeled buttons.
  assert.ok(rows.length <= 5)
  for (const r of rows) assert.ok(ICON[r.icon], r.id)
})

test('All methods sits right under Read my piece with the library\'s own count, and only when the room passes one', () => {
  const rows = deskRows({ quickCount: 2, methodCount: 159 })
  assert.deepEqual(rows.map(r => r.id), ['read', 'library', 'ask', 'bring', 'quick'])
  assert.equal(rows[1].label, 'All 159 methods')
  assert.equal(rows[1].tight, 'All 159 methods')
  assert.ok(ICON[rows[1].icon])
  assert.equal(libraryLabel(1500), 'All 1,500 methods')
  assert.equal(libraryLabel(0), 'All methods')
  assert.ok(!deskRows({ methodCount: 0 }).some(r => r.id === 'library'))
  assert.ok(!deskRows({}).some(r => r.id === 'library'))
})

test('Quick check says how many things to look at: none, one, three', () => {
  assert.equal(quickLabel(0), 'Quick check: nothing to look at')
  assert.equal(quickLabel(1), 'Quick check: 1 thing to look at')
  assert.equal(quickLabel(3), 'Quick check: 3 things to look at')
  assert.equal(quickLabel(1200), 'Quick check: 1,200 things to look at')
  assert.equal(quickLabel(undefined), 'Quick check: nothing to look at')
  assert.equal(deskRows({ quickCount: 0 }).at(-1).label, 'Quick check: nothing to look at')
  assert.equal(deskRows({ quickCount: 1 }).at(-1).label, 'Quick check: 1 thing to look at')
})

test('Read my piece shows only the server\'s steps, with a live counter, and never a percentage', () => {
  const sending = progressLine({ phase: 'sending', words: 1304 })
  assert.equal(sending.current, 'Sending 1,304 words')
  assert.deepEqual(sending.extra, [])
  const reading = progressLine({ phase: 'reading', words: 1304, elapsed: 12.6 })
  assert.equal(reading.current, 'Your model is reading 0:12')
  assert.deepEqual(reading.steps.map(s => [s.text, s.done]), [['Sent 1,304 words', true], ['Your model is reading 0:12', false]])
  assert.equal(progressLine({ phase: 'checking', words: 343 }).current, 'Checking every change against your words')
  assert.equal(progressLine({ phase: 'checking', words: 343 }).steps.length, 3)
  // The counter's format.
  assert.equal(clock(0), '0:00'); assert.equal(clock(9), '0:09'); assert.equal(clock(75), '1:15'); assert.equal(clock(-3), '0:00')
  // One word, and no phase yet (the pressed state's own line).
  assert.equal(progressLine({ phase: 'sending', words: 1 }).current, 'Sending 1 word')
  assert.equal(progressLine({}).current, 'Your editor is reading')
  assert.equal(progressLine({ phase: 'guessing' }).current, 'Your editor is reading', 'an unknown phase is never shown as a step')
  // A long piece says so, and a sectioned read says which section.
  const long = progressLine({ phase: 'reading', words: 2400, elapsed: 40, sections: { done: 1, total: 3 } })
  assert.deepEqual(long.extra, ['Long piece: about a minute', 'Section 2 of 3'])
  assert.deepEqual(progressLine({ phase: 'reading', words: 1500 }).extra, [])
  assert.deepEqual(progressLine({ phase: 'reading', words: 2400, sections: { done: 3, total: 3 } }).extra, ['Long piece: about a minute', 'Every section read'])
  for (const p of [sending, reading, long]) for (const line of [...p.steps.map(s => s.text), ...p.extra]) assert.doesNotMatch(line, /%/)
})

test('blanks: none, one and two, drawn apart from the text', () => {
  assert.deepEqual(blanks('On Saturday mornings the line starts early.'), [{ blank: false, text: 'On Saturday mornings the line starts early.' }])
  assert.deepEqual(blanks('Say when: [the date of the vote].'), [
    { blank: false, text: 'Say when: ' }, { blank: true, text: 'the date of the vote' }, { blank: false, text: '.' }])
  const two = blanks('[a name] said it saved [the savings the city expects]')
  assert.deepEqual(two.map(p => p.blank), [true, false, true])
  assert.deepEqual(two.filter(p => p.blank).map(p => p.text), ['a name', 'the savings the city expects'])
  assert.deepEqual(blanks(''), [])
  assert.deepEqual(blanks('[]'), [{ blank: false, text: '[]' }])
  // Joined back, the parts keep every word.
  const s = 'Ask why they came, and you will hear [a reason a patron gave you].'
  assert.equal(blanks(s).map(p => p.blank ? `[${p.text}]` : p.text).join(''), s)
})

test('readView: three changes in rank order, numbered 1 to 3, with Cut this first', () => {
  const v = readView(READ)
  assert.equal(v.thin, false)
  assert.equal(v.holds, null)
  assert.deepEqual(v.changes.map(c => [c.n, c.rank, c.headline]), [
    [1, 1, 'Say what the number counts'], [2, 2, 'Cut the three hedges and claim it'], [3, 3, 'Trade the business verb for the plain one']])
  assert.equal(v.cut.quote, 'It is important to note that')
  assert.equal(v.verdict, READ.verdict)
  assert.equal(addsLine(v.changes[1].flags), "Adds something your piece doesn't say: '1,400'")
  assert.equal(addsLine([]), '')
  // Up to five ranked changes (round 3: reporting changes compete for the slots), never more.
  const more = [4, 5, 6].map(r => ({ rank: r, change: `More ${r}`, quote: `x${r}` }))
  assert.equal(readView({ ...READ, changes: [...READ.changes, ...more] }).changes.length, 5)
  // The strongest line and each change's kind come through.
  const k = readView({ ...READ, keep: { quote: 'and nobody woke her', why: 'The plainest line carries the scene.' }, changes: READ.changes.map((c, i) => ({ ...c, kind: i ? 'line' : 'reporting' })) })
  assert.equal(k.keep.quote, 'and nobody woke her')
  assert.deepEqual(k.changes.map(c => c.kind).sort(), ['line', 'line', 'reporting'])
  // Suggested text off: no try, so the card has no Show me (read.jsx draws "Go to these words").
  assert.equal(readView({ ...READ, changes: READ.changes.map(c => ({ ...c, try: '' })) }).changes[0].try, '')
})

test('readView: two changes plus holds, one change plus holds, and the thin case', () => {
  const holds = 'The scenes in the third paragraph already carry the argument; changing them would trade a person for a summary.'
  const two = readView({ ...READ, changes: READ.changes.slice(1), holds })
  assert.equal(two.changes.length, 2)
  assert.deepEqual(two.holds, { line: 'Only two changes worth making.', reason: holds })
  const one = readView({ ...READ, changes: READ.changes.slice(1, 2), holds })
  assert.equal(one.holds.line, 'Only one change worth making.')
  const none = readView({ verdict: 'It holds.', changes: [], holds })
  assert.equal(none.thin, false)
  assert.equal(none.holds.line, 'Nothing here your editor would change.')
  // No changes and no holds: a plain next step, never an empty card.
  for (const thin of [readView({ changes: [] }), readView(null), readView({ verdict: 'Fine.', changes: [], cut_first: null })]) {
    assert.equal(thin.thin, true)
    assert.equal(thin.message, "Your editor didn't find changes worth making. Try a harder read, or pick a different model in Settings.")
  }
  assert.equal(readView({ ...READ, cut_first: null }).cut, null)
})

test('validateStart: at least one answer, none over 600 characters', () => {
  const empty = validateStart({ who: '  ', what: '', know: '\n' })
  assert.equal(empty.ok, false)
  assert.equal(empty.message, 'Answer at least one question first.')
  assert.equal(validateStart(undefined).ok, false)
  const one = validateStart({ who: '', what: 'Why our library should stay open on Saturdays', know: '' })
  assert.equal(one.ok, true)
  assert.deepEqual(one.values, { who: '', what: 'Why our library should stay open on Saturdays', know: '' })
  const long = validateStart({ who: 'Neighbors', what: 'x'.repeat(LIMIT + 1), know: '' })
  assert.equal(long.ok, false)
  assert.equal(long.errors.what, 'Keep each answer to 600 characters.')
  assert.equal(validateStart({ who: 'x'.repeat(LIMIT) }).ok, true)
  // Trimmed before sending, under the exact field names of the start kind.
  assert.deepEqual(Object.keys(validateStart({ who: ' a ', what: 'b', know: 'c' }).values), ['who', 'what', 'know'])
  assert.equal(validateStart({ who: ' a ' }).values.who, 'a')
  // The counter shows only near the limit.
  assert.equal(counter('x'.repeat(100)), '')
  assert.equal(counter('x'.repeat(540)), '60 left')
})

test('copy audit: no banned words, no "Coming", no ellipsis, in COPY or anywhere in the surfaces files', () => {
  const banned = [/on this computer/i, /no model/i, /tokens/i, /no credits/i, /no keys/i, /Coming/, /\.\.\./, /…/]
  const strings = allCopy()
  assert.ok(strings.length > 50)
  for (const s of strings) for (const b of banned) assert.doesNotMatch(s, b, s)
  // The four screens' own words are all in COPY; the sources hold no stray visible text with the banned words either.
  for (const f of FILES) {
    const src = read(`../../desktop/src/${f}`).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const b of [/on this computer/i, /no model/i, /no credits/i, /no keys/i, /Coming/, /…/]) assert.doesNotMatch(src, b, f)
  }
  // The exact lines the brief names.
  assert.equal(COPY.welcome.line, 'An AI editor reads your piece and shows its changes in your page. You pick which ones to use.')
  assert.equal(COPY.blank.title, 'Start writing, or pick a way in')
  assert.deepEqual([COPY.start.who, COPY.start.what, COPY.start.know], ['Who is it for?', 'What should they do or feel when they finish?', "What do you know that they don't?"])
})

test('craft floors in the surfaces files: no hex colors, nothing under 12 px, no emoji, 2 px corners from the host', () => {
  for (const f of FILES) {
    const src = read(`../../desktop/src/${f}`)
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b(?![^\n]*\/\/ not a color)/, `${f}: hex color`)
    for (const m of src.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 12.5, `${f}: font-size ${m[1]}px`)
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f}: emoji`)
    for (const m of src.matchAll(/border-radius:\s*([^;}]+)/g)) assert.match(m[1], /var\(--cl-radius\)|^2px$|^1px$/, `${f}: radius ${m[1]}`)
  }
  // Each .jsx starts with the automatic runtime pragma and exports its CSS, every class under its own prefix.
  for (const [f, prefix] of [['welcome.jsx', 'cl-welcome-'], ['desk.jsx', 'cl-desk'], ['start.jsx', 'cl-start-'], ['read.jsx', 'cl-read']]) {
    const src = read(`../../desktop/src/${f}`)
    assert.ok(src.startsWith('// @jsxRuntime automatic'), f)
    const css = src.slice(src.indexOf('export const CSS'))
    for (const m of css.matchAll(/^\.([a-z][\w-]*)/gm)) assert.ok(m[1].startsWith(prefix.replace(/-$/, '')), `${f}: .${m[1]}`)
    // Presentational only: no network, no store.
    assert.doesNotMatch(src, /\bfetch\(|\brest\(|\bpost\(|store\(\)|setTimeout|setInterval/, f)
  }
})

test('genreLine names the kind of piece in plain words, and partialChanges lists the notes that have landed', async () => {
  const { genreLine, partialChanges } = await import('../../desktop/src/surfaces.js')
  assert.equal(genreLine('essay'), 'Read as a personal essay')
  assert.equal(genreLine('op-ed'), 'Read as an op-ed')
  assert.equal(genreLine('opinion'), 'Read as an opinion piece')
  assert.equal(genreLine('letter'), 'Read as a letter')
  assert.equal(genreLine('fiction'), 'Read as fiction')
  assert.equal(genreLine('news'), 'Read as a news story')
  assert.equal(genreLine(''), '')
  assert.equal(genreLine('limerick'), '')
  assert.deepEqual(partialChanges({ changes: [{ change: 'Say where the figure comes from', kind: 'reporting' }] }), [{ headline: 'Say where the figure comes from', kind: 'reporting' }])
  assert.deepEqual(partialChanges({ sections: [{ changes: [{ change: 'A' }] }, { changes: [] }, { changes: [{ quote: 'b' }] }] }).map(c => c.headline), ['A', 'b'])
  assert.deepEqual(partialChanges(null), [])
})

test('sentenceAt: the sentence around the caret, for the desk Rewrite a sentence', () => {
  const b = 'One two three. Four five six! Seven eight.\n\nNine ten.'
  const at = n => { const r = sentenceAt(b, n); return r && b.slice(r.start, r.end) }
  assert.equal(at(0), 'One two three.')
  assert.equal(at(15), 'Four five six!')
  assert.equal(at(30), 'Seven eight.')
  assert.equal(at(b.length), 'Nine ten.')
})

test('welcome: the privacy line holds for a local model and a cloud model alike', () => {
  const p = COPY.welcome.privacy
  assert.match(p, /^Your pieces stay in Hermes\. When you ask the editor, the piece goes to the model you picked/)
  assert.match(p, /local model keeps it on your machine/)
  assert.match(p, /cloud model sends it to that provider/)
  assert.doesNotMatch(p, /never leave|don't leave|your computer/i)
})
