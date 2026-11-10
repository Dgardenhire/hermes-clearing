#!/usr/bin/env node
// Check the note walk in a real browser: the card sits beside its passage on a piece several screens tall, its
// buttons stay above the Ask line, walking again after the summary underlines and scrolls, Edit it myself leaves
// a cursor (not a selection), Escape then Cmd E keeps the Ask line open, and Escape closes History.
//
//   /usr/bin/python3 -m http.server 8831 --bind 127.0.0.1 --directory .      (from the repo root)
//   PLAYWRIGHT=<path to the playwright package> PORT=8831 node harness/check-walk.mjs
//
// Uses system Chrome. Needs network for the harness's React imports (esm.sh). Exits 1 on any failed check.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const BASE = `http://127.0.0.1:${process.env.PORT || 8831}/harness/`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const failures = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what) }

const browser = await chromium.launch({ executablePath: CHROME, args: ['--mute-audio', '--autoplay-policy=user-gesture-required'] })

async function open(query, { width = 1400, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}?${query}`)
  await page.waitForSelector('[data-ready="1"]', { timeout: 90000 }) // wait on the condition: a loaded machine can be slow to serve React and the bundle
  await page.waitForTimeout(300)
  return { page, errors }
}

// Where the active passage and the note card are, in window coordinates.
const geometry = page => page.evaluate(() => {
  const mark = document.querySelector('.cl-mk[data-on]')
  const note = document.querySelector('.cl-noteplace .cl-note') || document.querySelector('.cl-dock .cl-note')
  const ask = document.querySelector('.cl-ask')
  const r = el => (el ? el.getBoundingClientRect() : null)
  const btns = note ? [...note.querySelectorAll('.cl-row')].map(x => x.getBoundingClientRect().bottom) : []
  return { mark: r(mark), note: r(note), ask: r(ask), buttonsBottom: btns.length ? Math.max(...btns) : null, pos: note ? (note.querySelector('.cl-hero-pos') || note.querySelector('.cl-meta > span:last-child'))?.textContent : '', marks: document.querySelectorAll('.cl-mk[data-kind="finding"],.cl-mk[data-kind="note"]').length, viewH: innerHeight }
})

function besideIt(g, label) {
  check(!!g.mark, `${label}: the passage is underlined`)
  if (!g.mark || !g.note) return
  check(g.mark.top >= 40 && g.mark.bottom <= g.viewH - 40, `${label}: the passage is in view (${Math.round(g.mark.top)} to ${Math.round(g.mark.bottom)})`)
  const gap = Math.abs(g.note.top - g.mark.top)
  const clamped = g.note.bottom >= g.ask.top - 24 // pushed up only as far as the Ask line requires
  check(gap <= 40 || clamped, `${label}: the card is beside its passage (card top ${Math.round(g.note.top)}, passage top ${Math.round(g.mark.top)})`)
  check(g.buttonsBottom <= g.ask.top, `${label}: the card's buttons end above the Ask line (${Math.round(g.buttonsBottom)} vs ${Math.round(g.ask.top)})`)
  check(g.note.top >= 0 && g.note.bottom <= g.viewH, `${label}: the whole card is on screen`)
}

async function walkThrough(query, label, theme = '') {
  const { page, errors } = await open(`${query}${theme}`)
  for (let i = 0; i < 6; i++) {
    const g = await geometry(page)
    if (!g.note || !/of/.test(g.pos || '')) break
    besideIt(g, `${label} ${g.pos}`)
    const leave = page.getByRole('button', { name: 'Leave it', exact: true })
    if (!(await leave.count())) break
    await leave.click(); await page.waitForTimeout(350)
  }
  // Back up the page: a walk that jumps upward (the persona's worst case, the card over the Ask line).
  check(errors.length === 0, `${label}: no page errors ${errors.join('; ')}`)
  await page.close()
}

await walkThrough('state=longwalk', 'find weak sentences')
await walkThrough('state=longshape', 'find the shape')
await walkThrough('state=longquick', 'quick check')
await walkThrough('state=longwalk', 'find weak sentences, dark', '&theme=dark')

{ // Quick check opens with what it found and the questions-not-rules line, on the first note
  const { page } = await open('state=longquick')
  const intro = await page.evaluate(() => document.querySelector('.cl-intro')?.textContent || '')
  check(/Each note is a suggestion/.test(intro) && /^Found /.test(intro), `quick check: the first note opens with the summary ("${intro.slice(0, 60)}...")`)
  check(/quotation marks are left alone/.test(intro), 'quick check: it says quotes were left alone')
  await page.getByRole('button', { name: 'Leave it', exact: true }).click(); await page.waitForTimeout(300)
  check(!(await page.evaluate(() => !!document.querySelector('.cl-intro'))), 'quick check: the second note has no intro')
  await page.close()
}

{ // Walking upward: from the last note back to the first
  const { page } = await open('state=longwalk&step=4')
  const last = await geometry(page)
  besideIt(last, 'last note')
  await page.getByRole('button', { name: 'Leave it', exact: true }).click(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Read the summary', exact: true }).click(); await page.waitForTimeout(300)
  check(await page.getByRole('button', { name: 'Walk the notes', exact: true }).count() > 0, 'after the summary there is a Walk the notes button')
  await page.getByRole('button', { name: 'Walk the notes', exact: true }).click(); await page.waitForTimeout(500)
  const g = await geometry(page)
  check(g.pos === '1 of 5', `walking again starts at 1 of 5 (${g.pos})`)
  check(g.marks === 5, `walking again underlines all five notes (${g.marks})`)
  besideIt(g, 'walking again, note 1 (an upward jump)')
  await page.close()
}

{ // The same through the note kind (Find the shape)
  const { page } = await open('state=rewalk')
  const g = await geometry(page)
  check(g.pos === '1 of 5' && g.marks === 5, `find the shape walked again: ${g.pos}, ${g.marks} underlined`)
  besideIt(g, 'find the shape walked again')
  await page.close()
}

{ // Edit it myself leaves a cursor at the passage; one key adds a letter instead of replacing the passage
  const { page } = await open('state=fixmyself&step=2')
  const before = await page.evaluate(() => document.querySelector('.cl-body').value)
  await page.getByRole('button', { name: 'Edit it myself', exact: true }).click(); await page.waitForTimeout(300)
  const sel = await page.evaluate(() => { const ta = document.querySelector('.cl-body'); return { s: ta.selectionStart, e: ta.selectionEnd, focused: document.activeElement === ta } })
  const quote = 'Marsh said the bus costs about $61,000 a year to run'
  check(sel.focused && sel.s === sel.e && sel.s === before.indexOf(quote), `fix it myself: cursor at the passage, nothing selected (${sel.s}-${sel.e})`)
  await page.keyboard.type('X'); await page.waitForTimeout(200)
  const after = await page.evaluate(() => document.querySelector('.cl-body').value)
  check(after.length === before.length + 1 && after.includes('X' + quote), 'fix it myself: one key adds one letter, the passage stays')
  besideIt(await geometry(page), 'fix it myself')
  await page.close()
}

{ // Words typed while a pass runs: its notes still land on their own words, not shifted by the new text
  const { page } = await open('state=blank')
  await page.click('.cl-ask'); await page.keyboard.type('find weak sentences'); await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  await page.evaluate(() => { const ta = document.querySelector('.cl-body'); ta.focus(); ta.setSelectionRange(0, 0) })
  await page.keyboard.type('A new first line. ')
  await page.waitForSelector('.cl-mk[data-on]', { timeout: 8000 })
  const ok = await page.evaluate(() => {
    const quote = document.querySelector('.cl-noteplace .cl-hero-quote, .cl-noteplace .cl-quote')?.textContent.replace(/^“|”$/g, '')
    return { mark: document.querySelector('.cl-mk[data-on]').textContent, quote }
  })
  check(ok.mark === ok.quote, `typing during a pass: the note still marks its own words ("${ok.mark.slice(0, 40)}")`)
  await page.close()
}

{ // Escape, then Cmd E within 40 ms: the Ask line stays open with the cursor in it
  const { page } = await open('state=escask')
  const s = await page.evaluate(() => ({ open: !!document.querySelector('.cl-askinput'), focused: document.activeElement === document.querySelector('.cl-askinput') }))
  check(s.open && s.focused, `escape then cmd E: the Ask line is open (${s.open}) and focused (${s.focused})`)
  await page.close()
}

{ // Opening the room does not pull focus into the page; closing a sheet gives the page its focus back
  const { page } = await open('state=blank')
  check(await page.evaluate(() => document.activeElement === document.body), 'the room opens without taking focus')
  await page.close()
}

{ // Escape closes History
  const { page } = await open('state=history')
  check(await page.evaluate(() => !!document.querySelector('.cl-sheet')), 'history is open')
  const text = await page.evaluate(() => document.querySelector('.cl-sheet').textContent)
  check(!/token/i.test(text) && !/Editor passes on this piece|claude-|hermes-\d/.test(text), 'history: no token counts, no usage line, no model id (Loop 2 round 8 critics)')
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  check(!(await page.evaluate(() => !!document.querySelector('.cl-sheet'))), 'escape closes history')
  check(await page.evaluate(() => document.activeElement === document.querySelector('.cl-body')), 'closing history gives the page its focus back')
  await page.close()
}

{ // The narrow dock sits on the Ask line with no page text showing between them
  const { page } = await open('state=longwalk&width=800', { width: 800, height: 800 })
  const g = await page.evaluate(() => {
    const d = document.querySelector('.cl-dock').getBoundingClientRect(), a = document.querySelector('.cl-askrow').getBoundingClientRect() // the Ask line and its microphone, one row
    const mask = getComputedStyle(document.querySelector('.cl-scroll')).webkitMaskImage || ''
    return { gap: a.top - d.bottom, left: d.left - a.left, right: d.right - a.right, fades: (mask.match(/transparent|rgba\(0, 0, 0, 0\)/g) || []).length }
  })
  check(g.gap >= -1 && g.gap <= 10, `narrow: the dock meets the Ask line (gap ${Math.round(g.gap)} px)`)
  check(Math.abs(g.left) <= 1 && Math.abs(g.right) <= 1, `narrow: the dock lines up with the Ask line (${Math.round(g.left)}, ${Math.round(g.right)})`)
  check(g.fades >= 2, 'narrow: the page fades out behind the dock and the Ask line, so no text shows between them')
  await page.close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
