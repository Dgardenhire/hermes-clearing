// Security audit (Nov 8, 2026): each test here failed before its fix. See docs/SECURITY-AUDIT.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileName, paragraphs } from '../../desktop/src/text.js'
import * as quick from '../../desktop/src/quick-check.js'
const { instantFindings } = quick

// A-01: Quick check on a long passage with no sentence ending used to take time that grew with the square of
// its length (about 13 s at 40,000 characters, minutes at the 400,000 a piece may hold), freezing Hermes.
test('quick check stays fast on a long passage with no sentence ending', () => {
  const body = 'it is not a big deal and '.repeat(2400) // 60,000 characters, one "sentence"
  const t = Date.now()
  instantFindings(body)
  assert.ok(Date.now() - t < 4000, `took ${Date.now() - t} ms`)
})

test('quick check still marks the not-X-but-Y setup in an ordinary sentence', () => {
  const body = 'The budget is not the problem, it is the plan that is the problem. Then we left.'
  const found = instantFindings(body)
  assert.ok(found.some(f => f.issue.includes('not X') && body.slice(f.start, f.end) === f.quote && f.start === 0))
})

// A-02: the shape strip splits the piece into paragraphs on every keystroke; a long run of spaces (a pasted PDF
// table, say) took seconds per keystroke and grew with the square of its length.
const OLD = /[^\n]*\S[^\n]*(?:\n(?!\s*\n)[^\n]*)*/g
function oldParagraphs(body) {
  const out = []
  const re = new RegExp(OLD.source, 'g')
  let m
  while ((m = re.exec(String(body || '')))) out.push({ start: m.index, end: m.index + m[0].length })
  return out
}

test('paragraphs stay fast on a long line of spaces', () => {
  const t = Date.now()
  assert.deepEqual(paragraphs(' '.repeat(100000) + 'x'), [{ start: 0, end: 100001, words: 1 }])
  assert.ok(Date.now() - t < 400, `took ${Date.now() - t} ms`)
})

test('paragraphs split exactly as before on random text', () => {
  const bits = ['a', 'b c', ' ', '  ', '\t', '\n', '\n\n', ' \n', '\n \n', '\u00a0', '\r', 'word.']
  let seed = 7
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
  for (let i = 0; i < 3000; i++) {
    let s = ''
    const len = rand(14)
    for (let j = 0; j < len; j++) s += bits[rand(bits.length)]
    assert.deepEqual(paragraphs(s).map(p => ({ start: p.start, end: p.end })), oldParagraphs(s), JSON.stringify(s))
  }
})

// A-06: file names from a title match the backend's rules: never hidden, never a Windows device, no bidi tricks.
test('file names are never hidden, never a device and carry no bidi controls', () => {
  assert.equal(fileName('.bashrc', 'md'), 'bashrc.md')
  assert.equal(fileName('...', 'md'), 'Untitled.md')
  assert.equal(fileName('CON', 'txt'), '_CON.txt')
  assert.equal(fileName('Report\u202egpj.exe', 'md'), 'Reportgpj.exe.md')
  assert.equal(fileName('Ends with dots. . .', 'md'), 'Ends with dots.md')
  assert.equal(fileName('../../etc/passwd', 'md'), 'etc passwd.md')
})

// Second review (Nov 8, 2026), B-01: Quick check's new sentence splitter looked for a run of sentence marks
// followed by a space and retried from every mark in a run that isn't, so a pasted run of periods, "!!!" or "…"
// with a letter after it took time that grew with the square of its length: 11 to 14 s at 60,000 characters,
// minutes at the 400,000 a piece may hold, with Hermes's window frozen.
test('quick check stays fast on a long run of sentence marks with no space after it', () => {
  for (const body of ['.'.repeat(60000) + 'x', '!?.…'.repeat(15000) + 'x', '.'.repeat(30000) + ')'.repeat(30000) + 'x']) {
    const t = Date.now()
    instantFindings(body)
    assert.ok(Date.now() - t < 1000, `took ${Date.now() - t} ms on ${JSON.stringify(body.slice(0, 8))}`)
  }
})

const OLD_END = /[.!?…]+[”"’')\]]*(?=\s|$)|\n/g
test('the sentence splitter finds the same sentence ends as before on random text', () => {
  const bits = ['.', '..', '!', '?', '…', ')', '"', '”', '’', ' ', '\n', 'a', 'Dr', 'x.y', 'The']
  let seed = 11
  const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
  const ends = (s, re) => [...s.matchAll(new RegExp(re.source, 'g'))].map(m => [m.index, m[0]])
  assert.ok(quick.END instanceof RegExp, 'quick-check.js exports END')
  const NEW_END = quick.END
  for (let i = 0; i < 4000; i++) {
    let s = ''
    const len = rand(16)
    for (let j = 0; j < len; j++) s += bits[rand(bits.length)]
    assert.deepEqual(ends(s, NEW_END), ends(s, OLD_END), JSON.stringify(s))
  }
})

test('the shipped bundle carries the same sentence splitter as the source', async () => {
  const { readFileSync } = await import('node:fs')
  const bundle = readFileSync(new URL('../../desktop/plugin.js', import.meta.url), 'utf8')
  assert.ok(bundle.includes(`var END = ${quick.END.toString()};`), 'rebuild desktop/plugin.js from desktop/src')
})
