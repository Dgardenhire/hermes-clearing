#!/usr/bin/env node
// Loop 2 acceptance checks (premium-plan LOOP1.md section 4): the first run, the sample read, the note card cut
// down, cards docked off their passage, one verb pair, Use this given its beat, the word count holding still.
//
//   /usr/bin/python3 -m http.server 8841 --bind 127.0.0.1 --directory .      (from the repo root)
//   PLAYWRIGHT=<path to the playwright package> PORT=8841 node harness/check-loop2.mjs
//
// Uses system Chrome, muted. Exits 1 on any failed check.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const BASE = `http://127.0.0.1:${process.env.PORT || 8841}/harness/`
const failures = []
const check = (ok, name) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--mute-audio', '--autoplay-policy=user-gesture-required'] })
const BANNED = [/your computer/i, /no ai model/i, /on this computer/i, /no model/i, /never writes/i, /never rewrites/i, /no network calls/i, /no shell commands/i]

async function open(query, { width = 1280, height = 800, init = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  if (init) await page.addInitScript(init)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}?${query}`)
  await page.waitForSelector('[data-ready="1"]', { timeout: 90000 }) // a loaded machine can take a while to serve React and the bundle; wait on the condition
  await page.waitForTimeout(300)
  return { page, errors }
}
const button = (page, name) => page.getByRole('button', { name, exact: true }).first()
const words = page => page.locator('.cl-count').first().textContent()
const filled = page => page.evaluate(() => [...document.querySelectorAll('button')].filter(b => {
  const r = b.getBoundingClientRect(); if (!r.width || getComputedStyle(b).visibility === 'hidden') return false
  const bg = getComputedStyle(b).backgroundColor // rgb(...) or, for a color-mix, color(srgb r g b / a) in 0..1
  const m = bg.match(/rgba?\(([^)]+)\)/), c = bg.match(/color\(srgb ([\d.\s]+)(?:\/\s*([\d.]+))?\)/)
  if (!m && !c) return false
  const [r0, g, bl, a = 1] = m ? m[1].split(',').map(Number) : [...c[1].trim().split(/\s+/).map(x => Number(x) * 255), c[2] != null ? Number(c[2]) : 1]
  return a > 0.5 && Math.max(r0, g, bl) - Math.min(r0, g, bl) > 60
}).map(b => b.textContent.trim()))

{ // first run: the welcome card alone, Try it on the sample the one filled button, no retired phrase anywhere
  const { page, errors } = await open('state=welcome')
  check((await page.locator('.cl-welcome').count()) === 1 && (await page.locator('.cl-noteplace .cl-note, .cl-desk').count()) === 0, 'welcome: the welcome card is the only card')
  check(JSON.stringify(await filled(page)) === '["Try it on the sample"]', 'welcome: Try it on the sample is the only filled button')
  const dom = await page.evaluate(() => document.querySelector('.cl-room').innerText)
  check(!BANNED.some(b => b.test(dom)), 'welcome: no retired phrase in the room')
  await button(page, 'Try it on the sample').click()
  await page.waitForSelector('.cl-roomread', { timeout: 5000 })
  await page.waitForTimeout(300)
  const n = await page.locator('.cl-text:not(.cl-ai) .cl-mk[data-kind="finding"]').count()
  const nums = (await page.locator('.cl-nums b').allTextContents()).sort().join(',')
  const cardNums = (await page.locator('.cl-read-n').allTextContents()).join(',')
  const want = Array.from({ length: n }, (_, i) => i + 1).join(',')
  check(n >= 3 && n <= 5 && nums === want && cardNums === want, `sample read: 3 to 5 ranked underlines, numerals in the margin matching the card (${n}; ${nums}; ${cardNums})`)
  check((await page.locator('.cl-text [data-kind="keep"]').count()) === (await page.locator('.cl-read-keep').count()), 'sample read: the strongest line is marked in the page when the read names one')
  const show = await button(page, 'Show me').boundingBox()
  check(show && show.y + show.height < 800, `sample read: Show me above the fold at 1280x800 (${show ? Math.round(show.y + show.height) : '?'})`)
  check(await page.locator('.cl-ask').isVisible() && /Read my own piece/.test(await page.locator('.cl-roomread').textContent()), 'sample read: Ask and Read my piece are on the screen without hover')
  const before = await words(page)
  await button(page, 'Show me').click(); await page.waitForTimeout(250)
  check((await words(page)) === before, `show me: the word count holds still while the suggestion is only shown (${before})`)
  const card = await page.locator('.cl-roomread').boundingBox()
  const overlap = await page.evaluate(([x, w]) => [...document.querySelectorAll('.cl-proposed-page, .cl-struck')].some(el => [...el.getClientRects()].some(r => r.right > x && r.left < x + w)), [card.x, card.width])
  check(!overlap, 'show me: the card never covers the struck or inserted words')
  check(JSON.stringify(await filled(page)) === '["Use this"]', 'show me: Use this is the one filled button')
  await button(page, 'Use this').click(); await page.waitForTimeout(400)
  check(/Used\./.test(await page.locator('.cl-roomread').textContent()) && (await page.locator('.cl-roomread').getByRole('button', { name: 'Undo', exact: true }).isVisible()) && (await button(page, 'Next change').count()) === 1, 'use this: the card holds on Used, with a visible Undo button and Next change')
  check(!/Press|Cmd Z|Ctrl Z/.test(await page.locator('.cl-room').textContent()), 'use this: no instruction to press keys anywhere in the room')
  const versions = await page.evaluate(() => window.__calls.filter(c => c.method === 'POST' && /\/versions$/.test(c.path)).map(c => c.body.reason))
  check(versions.includes('suggestion'), 'use this: a version is saved before the suggestion goes in')
  check((await page.locator('.cl-ai [data-fresh]').count()) === 1, 'use this: the words just used get the fresh wash')
  await page.waitForTimeout(2500)
  check((await page.locator('.cl-ai [data-fresh]').count()) === 0, 'use this: the fresh wash fades after about two seconds')
  const used = await page.evaluate(() => document.querySelector('.cl-body').value)
  await page.locator('.cl-roomread').getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForTimeout(250)
  const undone = await page.evaluate(() => document.querySelector('.cl-body').value)
  check(undone.includes('I think that might perhaps understate what the building actually does'), 'undo button: the writer\'s words come back')
  check(await page.locator('.cl-roomread .cl-read-change[data-on]').count() === 1 && (await button(page, 'Show me').count()) >= 1, 'undo button: the change is open again, with Show me')
  const redoBtn = page.locator('.cl-top').getByRole('button', { name: 'Redo', exact: true })
  check(await redoBtn.isEnabled(), 'top bar: Redo is on after an undo')
  await redoBtn.click(); await page.waitForTimeout(250)
  check((await page.evaluate(() => document.querySelector('.cl-body').value)) === used, 'top bar: Redo puts the suggestion back')
  check(!(await redoBtn.isEnabled()), 'top bar: Redo greys out when there is nothing left to redo')
  check(errors.length === 0, `sample read: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

{ // the shipped sample read: the move to the top and its trim go in with one Use this; undo twice takes both out
  const shipped = JSON.parse(readFileSync(new URL('../library/sample.json', import.meta.url), 'utf8')).sample_read
  const sr = { id: 'sample-read', kind: 'read', status: 'done', sample: true, model: shipped.made_by, result: { verdict: shipped.verdict, keep: shipped.keep, changes: shipped.changes.map((c, i) => ({ ...c, rank: i + 1, unsupported: [] })), cut_first: shipped.cut_first } }
  const { page, errors } = await open('state=welcome', { init: `window.__SAMPLE_READ = ${JSON.stringify(sr)}` })
  await button(page, 'Try it on the sample').click()
  await page.waitForSelector('.cl-roomread', { timeout: 5000 }); await page.waitForTimeout(300)
  await button(page, 'Show me').click(); await page.waitForTimeout(250)
  check(/This also cuts the repeated news in paragraph 2\./.test(await page.locator('.cl-roomread').textContent()), 'pair: Show me on the move says it takes the trim with it')
  check((await page.locator('.cl-preview .cl-struck').count()) === 2 && (await page.locator('.cl-preview .cl-struck').nth(1).textContent()).includes('The city is now deciding whether to cut the branch to four days a week.'), 'pair: the preview strikes the repeat too, so the page and the card agree')
  await button(page, 'Use this').click(); await page.waitForTimeout(700)
  check(/Used, with change 2\./.test(await page.locator('.cl-roomread').textContent()) && (await page.locator('.cl-roomread').getByRole('button', { name: 'Undo', exact: true }).isVisible()) && (await button(page, 'Next change').count()) === 1, 'pair: one Use this puts in both; the card holds on Used, with Undo and Next change')
  const NEWS = 'The city is now deciding whether to cut the branch to four days a week.'
  const both = await page.evaluate(() => document.querySelector('.cl-body').value)
  check(both.startsWith('The city is now deciding') && !both.includes(NEWS), 'pair: the news is at the top once, never twice')
  check((await page.locator('.cl-read-change[data-used]').count()) === 2, 'pair: both changes are ticked on the card')
  await page.locator('.cl-roomread').getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForTimeout(250)
  const once = await page.evaluate(() => document.querySelector('.cl-body').value)
  check(once.startsWith('Every Saturday morning') && once.includes(NEWS), 'pair: ONE Undo brings back the writer\'s words in both places')
  check((await page.locator('.cl-read-change[data-used]').count()) === 0, 'pair: after Undo neither change is ticked')
  await page.locator('.cl-top').getByRole('button', { name: 'Redo', exact: true }).click(); await page.waitForTimeout(250)
  check((await page.evaluate(() => document.querySelector('.cl-body').value)) === both, 'pair: one Redo puts both back')
  await button(page, 'Next change').click(); await page.waitForTimeout(300)
  check(/^3$/.test((await page.locator('.cl-read-change[data-on] .cl-read-n').textContent()).trim()), 'pair: Next change goes to change 3, past the trim already made')
  await page.locator('.cl-body').focus()
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(250)
  const back = await page.evaluate(() => document.querySelector('.cl-body').value)
  check(back.startsWith('Every Saturday morning') && back.includes(NEWS), 'pair: one Cmd Z still works too, and takes out both')
  await page.keyboard.press('Meta+Shift+z'); await page.waitForTimeout(250)
  check((await page.evaluate(() => document.querySelector('.cl-body').value)) === both, 'pair: Cmd Shift Z puts both back')
  check(errors.length === 0, `pair: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

{ // Rewrite a sentence from the desk, with nothing selected: the sentence at the caret is selected and rewritten
  const { page, errors } = await open('state=rest')
  await page.locator('.cl-body').focus()
  await page.evaluate(() => { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('The budget memo calls it') + 5; ta.setSelectionRange(at, at) })
  await page.getByRole('button', { name: /Rewrite a sentence/ }).first().click()
  await page.waitForSelector('.cl-tile[data-opt]', { timeout: 8000 }).catch(() => {})
  const sent = await page.evaluate(() => (window.__calls || []).filter(c => c.method === 'POST' && /\/passes$/.test(c.path)).map(c => c.body).find(b => b.target === 'rewrite'))
  check(!!sent && sent.selection && sent.body.slice(sent.selection.start, sent.selection.end) === 'The budget memo calls it a modest efficiency.', `desk: Rewrite a sentence rewrites the sentence at the caret (${sent && sent.selection ? JSON.stringify(sent.body.slice(sent.selection.start, sent.selection.end)) : 'no call'})`)
  check((await page.locator('.cl-tile[data-opt]').count()) >= 1, 'desk: the rewrite options arrive')
  check(errors.length === 0, `desk rewrite: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

{ // the top bar's Undo and Redo: greyed out with nothing to undo; typing makes Undo live; Undo takes the typing out
  const { page, errors } = await open('state=rest')
  const top = page.locator('.cl-top')
  const u = top.getByRole('button', { name: 'Undo', exact: true }), r = top.getByRole('button', { name: 'Redo', exact: true })
  check((await u.isVisible()) && (await r.isVisible()) && !(await u.isEnabled()) && !(await r.isEnabled()), 'top bar: Undo and Redo are on the screen, greyed out with nothing to undo')
  const before = await page.evaluate(() => document.querySelector('.cl-body').value)
  await page.locator('.cl-body').click({ position: { x: 20, y: 10 } })
  await page.keyboard.type(' A new line of my own.')
  await page.waitForTimeout(150)
  check(await u.isEnabled(), 'top bar: Undo comes on after typing')
  await u.click(); await page.waitForTimeout(200)
  check((await page.evaluate(() => document.querySelector('.cl-body').value)) === before && (await r.isEnabled()), 'top bar: Undo takes the typing out, and Redo comes on')
  check(errors.length === 0, `top bar undo: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

for (const [w, h] of [[1280, 800], [1440, 900]]) { // the selection toolbar never sits on the title
  const { page, errors } = await open('state=rest', { width: w, height: h })
  await page.evaluate(() => { const ta = document.querySelector('.cl-body'), q = 'Every Saturday morning the branch library on Ninth Street opens at ten, and every Saturday there is a line.', at = ta.value.indexOf(q); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + q.length); document.querySelector('.cl-scroll').scrollTop = 0; ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 })) })
  await page.waitForSelector('.cl-selbar', { timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(200)
  const g = await page.evaluate(() => { const b = document.querySelector('.cl-selbar'), t = document.querySelector('.cl-titlefield'); if (!b || !t) return null; const br = b.getBoundingClientRect(), tr = t.getBoundingClientRect(); return { barTop: br.top, barBottom: br.bottom, titleBottom: tr.bottom, titleTop: tr.top } })
  check(!!g && (g.barTop >= g.titleBottom || g.barBottom <= g.titleTop), `toolbar at ${w}x${h}: the selection bar on the first sentence stays off the title (${g ? `bar ${Math.round(g.barTop)}-${Math.round(g.barBottom)}, title ${Math.round(g.titleTop)}-${Math.round(g.titleBottom)}` : 'no bar'})`)
  // a sentence further down keeps the bar above it, where it was
  await page.evaluate(() => { const ta = document.querySelector('.cl-body'), q = 'The budget memo calls it a modest efficiency.', at = ta.value.indexOf(q); ta.focus(); ta.setSelectionRange(at, at + q.length); ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 })) })
  await page.waitForTimeout(250)
  const g2 = await page.evaluate(() => { const b = document.querySelector('.cl-selbar'), t = document.querySelector('.cl-titlefield'); if (!b || !t) return null; return { barBottom: b.getBoundingClientRect().bottom, barTop: b.getBoundingClientRect().top, titleBottom: t.getBoundingClientRect().bottom } })
  check(!!g2 && g2.barTop >= g2.titleBottom, `toolbar at ${w}x${h}: a selection lower down also keeps the bar below the title`)
  check(errors.length === 0, `toolbar: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

{ // a ranked change that is a cut: struck in the page with nothing inserted, Use this deletes it, undo brings it back
  const { page, errors } = await open('state=sampleread')
  const CUT = 'They come for the printers, the Wi-Fi and the one quiet room in the neighborhood that does not charge anyone to sit down.'
  await page.locator('.cl-read-pick', { hasText: 'Cut the list the scenes already show' }).click(); await page.waitForTimeout(300)
  check(/Cut/.test(await page.locator('.cl-read-change[data-on] .cl-read-kind').textContent().catch(() => '')), 'cut change: tagged Cut on the card')
  await button(page, 'Show me').click(); await page.waitForTimeout(250)
  check((await page.locator('.cl-struck').textContent()).includes(CUT.slice(0, 30)) && ((await page.locator('.cl-proposed-page').textContent()) || '') === '', 'cut change: Show me strikes the words and inserts nothing')
  await button(page, 'Use this').click(); await page.waitForTimeout(400)
  const after = await page.evaluate(() => document.querySelector('.cl-body').value)
  check(!after.includes(CUT) && after.includes('There is a line. It is important to note') === false && after.includes('not there for books.'), 'cut change: Use this deletes the sentence, the rest stays')
  await page.locator('.cl-roomread').getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForTimeout(250)
  check((await page.evaluate(() => document.querySelector('.cl-body').value)).includes(CUT), 'cut change: the Undo button brings it back')
  check(errors.length === 0, `cut change: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

{ // the note card at rest
  const { page } = await open('state=pass', { width: 1440, height: 900 })
  const note = page.locator('.cl-noteplace .cl-note').first()
  check((await note.locator('button, a, input, textarea').count()) <= 5, `note: five controls or fewer at rest (${await note.locator('button, a, input, textarea').count()})`)
  check(!/hermes-4-405b|claude-/.test(await note.textContent()), 'note: no model id in the card')
  check((await note.locator('.cl-chip, .cl-chipfield').count()) === 0, 'note: no chips or free field at rest')
  check((await note.locator('.cl-hero-title').count()) === 1, 'note: the change is the title')
  await page.close()
}

{ // the desk at rest: Read my piece leads, Ask carries its one shortcut
  const { page } = await open('state=rest', { width: 1440, height: 900 })
  const rows = await page.locator('.cl-desk button').allTextContents()
  check(/^Read my piece/.test(rows[0] || '') && rows.some(r => /Ask the editor/.test(r)), `desk: Read my piece first, Ask the editor with its key (${rows.join(' | ')})`)
  await page.close()
}

{ // the rewrite card docks beside its passage and ends in Use this / Keep mine
  const { page } = await open('state=rewrite', { width: 1440, height: 900 })
  const card = await page.locator('.cl-noteplace .cl-suggest').boundingBox()
  const overlap = await page.evaluate(([x, w]) => [...document.querySelectorAll('.cl-proposed-page, .cl-struck')].some(el => [...el.getClientRects()].some(r => r.right > x && r.left < x + w)), [card.x, card.width])
  check(!overlap, 'rewrite: the card never covers the words it is about')
  const btns = await page.locator('.cl-suggest .cl-row button').allTextContents()
  check(btns.join(',') === 'Use this,Keep mine', `rewrite: one verb pair (${btns.join(', ')})`)
  const dom = await page.locator('.cl-suggest').textContent()
  check(!/Yours, as you wrote it|It goes in only if you use it|Done/.test(dom), 'rewrite: no helper sentence and no Done')
  await page.close()
}

{ // the scene picker changes the room, in light and in dark, for every scene (Damon: "the background picker didn't change")
  for (const theme of ['', '&theme=dark']) {
    const { page } = await open(`state=roomscene&scene=tide${theme}`, { width: 1440, height: 900 })
    const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.cl-room')).backgroundImage.slice(0, 120) + getComputedStyle(document.querySelector('.cl-room')).backgroundImage.length)
    const seen = new Set([await bg()])
    for (const name of ['Snow Light', 'Quiet Marsh', 'Plain page']) { await button(page, name).click(); await page.waitForTimeout(120); seen.add(await bg()) }
    check(seen.size === 4, `scenes${theme ? ' (dark)' : ''}: Night Tide, Snow Light, Quiet Marsh and Plain page are four different rooms (${seen.size})`)
    await page.close()
  }
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
