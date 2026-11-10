#!/usr/bin/env node
// Check Damon's notes (Nov 8, 2026) in a real browser: suggested text is never inserted on its own, is marked while
// it is tried, goes in only on Use this and is recorded with the model's name; the off switch takes every suggestion
// away; a model failure changes nothing; the floating card, the shortcut, Bring in, dictation's press first, and
// scenes that stay chosen in dark mode.
//
//   /usr/bin/python3 -m http.server 8841 --bind 127.0.0.1 --directory .      (from the repo root)
//   PLAYWRIGHT=<path to the playwright package> PORT=8841 node harness/check-notes.mjs
//
// Uses system Chrome. Needs network for the harness's React imports (esm.sh). Exits 1 on any failed check.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const BASE = `http://127.0.0.1:${process.env.PORT || 8841}/harness/`
const failures = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what) }
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--mute-audio', '--autoplay-policy=user-gesture-required'] })

async function open(query, { width = 1400, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}?${query}`)
  await page.waitForSelector('[data-ready="1"]', { timeout: 90000 }) // a loaded machine can take a while to serve React and the bundle; wait on the condition
  await page.waitForTimeout(300)
  return { page, errors }
}
const text = page => page.evaluate(() => (document.querySelector('.cl-body') || {}).value || '')
const decisions = page => page.evaluate(() => window.__decisions || [])
const calls = (page, path) => page.evaluate(p => window.__calls.filter(c => c.path === p), path)
const button = (page, name) => page.locator('button', { hasText: name }).first()
const ORIGINAL = 'The budget memo calls it a modest efficiency.'

{ // a rewrite: shown, marked, never inserted until Use this, then recorded
  const { page, errors } = await open('state=rewrite')
  const before = await page.evaluate(() => window.__calls.find(c => c.path === '/passes'))
  check(before && before.body.target === 'rewrite' && before.body.selection.end - before.body.selection.start === 45, 'rewrite: Rewrite sends only the selected passage')
  check((await page.locator('.cl-suggest .cl-tile[data-opt]').count()) === 3 && !/Yours/.test(await page.locator('.cl-suggest .cl-tiles').textContent()), 'rewrite: A, B and C, each with its words; Keep mine instead of a Yours tile')
  check((await page.locator('.cl-pop').count()) === 0 && (await page.locator('.cl-noteplace .cl-suggest').count()) === 1, 'rewrite: the card docks in the margin beside its words')
  const card = await page.locator('.cl-noteplace .cl-suggest').boundingBox(), shownA = await page.locator('.cl-proposed-page').boundingBox()
  check(card && shownA && (card.x >= shownA.x + shownA.width || card.x + card.width <= shownA.x), 'rewrite: the card never covers the words it shows')
  check((await page.locator('.cl-suggest .cl-tile[aria-pressed="true"]').count()) === 1 && (await page.locator('.cl-proposed-page[data-inline]').count()) === 1, 'rewrite: it opens on A, drawn in the page')
  check((await page.locator('.cl-struck').textContent()) === ORIGINAL && (await decisions(page)).length === 0 && !(await page.evaluate(() => window.__calls.some(c => c.path.endsWith('/save') && /In the budget memo|A modest efficiency/.test(c.body.body || '')))), 'rewrite: nothing goes into the page when the options arrive (shown struck, not saved)')
  await page.locator('.cl-suggest .cl-tile[data-opt]').nth(1).click()
  await page.waitForTimeout(150)
  const shown = await page.locator('.cl-proposed-page[data-inline]').textContent()
  check(shown === 'A modest efficiency, the budget memo calls it.', 'rewrite: choosing one shows it in the page, marked as a suggestion')
  check((await decisions(page)).length === 0, 'rewrite: trying one records nothing')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  check((await text(page)).includes(ORIGINAL) && (await page.locator('.cl-proposed-page').count()) === 0 && (await page.locator('.cl-suggest').count()) === 0, 'rewrite: Escape puts the writer\'s words back and closes the card')
  await page.evaluate(() => { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('The budget memo calls it a modest efficiency.'); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + 45); ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 })) })
  await button(page, 'Rewrite').click()
  await page.waitForSelector('.cl-suggest .cl-tile[data-opt]')
  await page.locator('.cl-suggest .cl-tile[data-opt]').nth(1).click()
  await button(page, 'Edit it myself').click()
  await page.locator('.cl-suggest textarea').fill('A modest efficiency, the memo calls it.')
  await button(page, 'Use this').click()
  await page.waitForTimeout(200)
  const t = await text(page), d = await decisions(page)
  check(t.includes('week. A modest efficiency, the memo calls it. I think') && !t.includes(ORIGINAL), 'rewrite: Use this after Edit it myself puts the edited words in their place')
  check(d.length === 1 && d[0].kind === 'rewrite' && d[0].model === 'hermes-4-405b' && d[0].original === ORIGINAL && d[0].chosen === 'A modest efficiency, the memo calls it.', 'rewrite: the change record names what it replaced, what went in and the model')
  check(await page.locator('.cl-ai [data-kind="ai"]').count() === 1 && await page.locator('.cl-ticks i').count() >= 1, 'authorship: the model\'s words keep a wash and a gutter tick')
  check(/\d+% your words/.test(await page.locator('.cl-top').textContent()), 'authorship: the top line says how much is the writer\'s')
  // The card's own Undo button takes the suggestion out; the top bar's Redo puts it back; Cmd Z and Cmd Shift Z
  // (and the Edit menu, which reaches the page as history input) run the same history.
  const usedCard = page.locator('.cl-usednote')
  check((await usedCard.count()) === 1 && (await usedCard.getByRole('button', { name: 'Undo', exact: true }).isVisible()), 'used: the card shows a plain Undo button')
  await usedCard.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(200)
  check((await text(page)).includes(ORIGINAL), 'undo: the Undo button takes the suggestion out')
  await page.locator('.cl-top').getByRole('button', { name: 'Redo', exact: true }).click()
  await page.waitForTimeout(200)
  check((await text(page)).includes('A modest efficiency, the memo calls it.') && !(await text(page)).includes(ORIGINAL), 'undo: the top bar Redo puts it back')
  await page.locator('.cl-body').focus()
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(150)
  check((await text(page)).includes(ORIGINAL), 'undo: Cmd Z still takes it out')
  await page.keyboard.press('Meta+Shift+z'); await page.waitForTimeout(150)
  check((await text(page)).includes('A modest efficiency, the memo calls it.') && !(await text(page)).includes(ORIGINAL), 'undo: Cmd Shift Z puts it back')
  await page.evaluate(() => document.execCommand('undo')); await page.waitForTimeout(150)
  check((await text(page)).includes(ORIGINAL), 'undo: the Edit menu\'s Undo (history input) runs the same history')
  await page.keyboard.press('Meta+Shift+z'); await page.waitForTimeout(150)
  const v = await calls(page, `/pieces/${(await page.evaluate(() => window.__calls.find(c => c.path.endsWith('/save')) || { path: '/pieces/h1/save' })).path.split('/')[2]}/versions`)
  check(v.some(c => c.method === 'POST' && c.body.reason === 'suggestion' && c.body.body.includes(ORIGINAL)), 'rewrite: the page before the change is kept in History')
  await page.evaluate(() => { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('the memo calls it.') + 4; ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at) })
  await page.keyboard.type('budget ')
  await page.waitForTimeout(100)
  check(await page.locator('.cl-ai [data-kind="ai"]').count() === 0 && !/your words/.test(await page.locator('.cl-top').textContent()), 'authorship: typing inside the words makes them the writer\'s')
  check(errors.length === 0, `rewrite: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await page.close()
}

{ // a next sentence from the shortcut, at the cursor
  const { page } = await open('state=next')
  // Wait on the conditions, never a fixed delay: the pass is posted, and its options have landed in the card.
  await page.waitForFunction(() => window.__calls.some(c => c.path === '/passes'), null, { timeout: 15000 })
  await page.waitForSelector('.cl-suggest .cl-tile[data-opt]', { timeout: 15000 })
  const sent = await page.evaluate(() => window.__calls.find(c => c.path === '/passes'))
  const at = await page.evaluate(() => document.querySelector('.cl-body').value.indexOf('That number is real.') + 20)
  check(sent && sent.body.target === 'next' && sent.body.selection.start === at && sent.body.selection.end === at, 'next: Cmd E in a gap offers a next sentence first, at the cursor')
  check((await page.locator('.cl-text [data-id="caret"]').count()) === 1, 'next: the cursor is marked while the card is open')
  check((await decisions(page)).length === 0 && !(await text(page)).includes('None of them is counted.'), 'next: no sentence goes in on its own')
  await page.locator('.cl-suggest .cl-tile[data-opt]').nth(0).click()
  await button(page, 'Use this').click()
  await page.waitForFunction(() => (document.querySelector('.cl-body') || {}).value?.includes('None of them is counted.'), null, { timeout: 15000 }).catch(() => {})
  check((await text(page)).includes('That number is real. None of them is counted. It is also'), 'next: Use this puts it at the cursor with a space on each side')
  check((await decisions(page))[0].kind === 'next', 'next: recorded as a next sentence')
  await page.close()
}

{ // Show me on an editor's note: its example, then one drafted on the press
  const { page } = await open('state=shownote')
  check((await page.locator('.cl-proposed-page[data-inline]').textContent()) === 'That number is real, but it counts only checkouts.', 'show me: the note\'s example is shown in the page, marked')
  const note = await page.locator('.cl-noteplace').boundingBox(), shown = await page.locator('.cl-proposed-page').boundingBox()
  check(Math.abs(note.y - shown.y) < 120, `show me: the note stays beside the passage it shows (${Math.round(note.y - shown.y)} px)`)
  check(!(await text(page).catch(() => '')).includes('but it counts only'), 'show me: the page is unchanged until Use this')
  await button(page, 'Use this').click()
  await page.waitForTimeout(200)
  check((await text(page)).includes('That number is real, but it counts only checkouts. It is also'), 'show me: Use this puts the example in place of the passage')
  const d = await decisions(page)
  check(d.length === 1 && d[0].kind === 'note' && d[0].original === 'That number is real.', 'show me: recorded as text from an editor\'s note')
  check(/Used\./.test(await page.locator('.cl-noteplace').textContent()) && (await page.locator('.cl-noteplace').getByRole('button', { name: 'Undo', exact: true }).isVisible()) && !/Press|Cmd Z/.test(await page.locator('.cl-noteplace').textContent()), 'show me: after Use this the card holds on Used, with an Undo button and no keys to press')
  await button(page, 'Next change').click()
  await page.waitForTimeout(150)
  check(/2 of \d/.test(await page.locator('.cl-noteplace').textContent()), 'show me: Next change moves on to the next note')
  await button(page, 'Leave it').click()
  await button(page, 'Show me').click()
  await page.waitForSelector('.cl-proposed-page[data-inline]', { timeout: 5000 })
  const asked = await page.evaluate(() => window.__calls.filter(c => c.path === '/passes').map(c => c.body))
  check(asked[1] && asked[1].target === 'apply' && /Put Arturo in it/.test(asked[1].note), 'show me: a note with no example asks the model to draft it, with the note')
  check((await page.locator('.cl-proposed-page').textContent()).startsWith('So Arturo'), 'show me: the drafted change is shown in the page')
  await button(page, 'Keep mine').click()
  check((await text(page)).includes('So the people who use the room most leave the fewest marks on paper') && (await decisions(page)).length === 1, 'show me: Keep mine leaves the page as it was')
  await page.close()
}

{ // rewrites land one at a time
  const { page } = await open('state=rewriting')
  const first = await page.locator('.cl-note .cl-tile[data-opt]').count(), waiting = await page.locator('.cl-note .cl-tile[data-wait]').count()
  check(first >= 1 && first + waiting === 3, `rewrite: tiles fill as each answer lands (${first} ready, ${waiting} still being written)`)
  const sk = await page.locator('.cl-note .cl-tile[data-wait]').first().boundingBox(), ready = await page.locator('.cl-note .cl-tile[data-opt]').first().boundingBox()
  check(sk && ready && Math.abs(sk.width - ready.width) < 1 && sk.height >= 56, 'rewrite: the tiles still being written hold their final size')
  await page.close()
  const full = await open('state=rewrite')
  check((await full.page.locator('.cl-suggest .cl-tile[data-wait]').count()) === 0 && (await full.page.locator('.cl-suggest .cl-tile[data-opt]').count()) === 3, 'rewrite: all three in when the answer is complete')
  await full.page.close()
}

{ // Change it: Shorter, Plainer, Keep my rhythm, Why?, and a free field under every option and try
  const ch = await open('state=changed')
  const sent = (await calls(ch.page, '/passes')).find(x => x.body.target === 'refine')
  check(sent && sent.body.request === 'shorter' && sent.body.current === 'A modest efficiency, the budget memo calls it.' && sent.body.original === 'The budget memo calls it a modest efficiency.', 'change it: Shorter sends the original, the option and the request')
  check(/Change it/.test(await ch.page.locator('.cl-suggest').textContent()) && (await ch.page.locator('.cl-suggest .cl-tile[data-opt]').count()) === 3, 'change it: three new versions in the same card')
  check(((await text(ch.page)) || (await ch.page.locator('.cl-struck').textContent())).includes(ORIGINAL) && (await decisions(ch.page)).length === 0, 'change it: follow-ups never touch the page')
  await ch.page.locator('button', { hasText: 'Back to the last options' }).click()
  check(/ends on the memo/i.test((await ch.page.locator('.cl-suggest .cl-tile[data-opt]').evaluateAll(els => els.map(e => `${e.title} ${e.textContent}`))).join(' ')), 'change it: the round before is one click back')
  await ch.page.close()
  const w = await open('state=why')
  check(/where a reader weighs it/.test(await w.page.locator('.cl-why').textContent()), 'change it: Why? answers in plain sentences on the card')
  await w.page.close()
  const n = await open('state=pass')
  check((await n.page.locator('.cl-noteplace .cl-chip').count()) === 0 && (await n.page.locator('.cl-noteplace .cl-note').locator('button, input, textarea, a').count()) <= 5, 'note card: five controls or fewer at rest, no chips')
  await button(n.page, 'Show me').click()
  await button(n.page, 'Change it').click()
  check((await n.page.locator('.cl-noteplace .cl-chip').allTextContents()).join(',') === 'Shorter,Plainer,Keep my rhythm,Why?' && (await n.page.locator('.cl-noteplace .cl-chipfield').count()) === 1, 'change it: behind Show me on a note too')
  await n.page.close()
}

{ // provenance: the model's name is off the header, on a closing line, and on hover
  const { page } = await open('state=pass')
  const head = await page.locator('.cl-noteplace .cl-note').first().textContent(), prov = page.locator('.cl-noteplace .cl-prov')
  check(!/hermes-4-405b/.test(head) && (await prov.textContent()) === 'Suggested by your model' && (await prov.getAttribute('title')) === 'Written by hermes-4-405b', 'provenance: "Suggested by your model", the name on hover, not in the header')
  const box = await prov.boundingBox(), row = await page.locator('.cl-noteplace .cl-row').last().boundingBox()
  check(box.y > row.y, 'provenance: the line closes the card')
  await page.close()
}

{ // never an empty card: every option breaks a rule, so it asks once more, then shows them folded under the rule
  const { page } = await open('state=rewritefolded&stocky=1')
  await page.waitForTimeout(1500)
  const posts = (await calls(page, '/passes')).filter(c => c.body.target === 'rewrite')
  check(posts.length === 2, `folded: it asked once more on its own (${posts.length} calls)`)
  const flags = await page.locator('.cl-suggest li.cl-flag').allTextContents()
  check(flags.length === 3 && /Adds a stock phrase: “Moving forward/.test(flags[0]) && /Adds filler/.test(flags[1]) && /Adds throat-clearing/.test(flags[2]), 'folded: each option shows the rule it broke and the words')
  check(!/none are shown/i.test(await page.locator('.cl-suggest').textContent()), 'folded: the card is never empty')
  await page.close()
}

{ // a model failure on a suggestion changes nothing
  const { page } = await open('state=rewrite&fail=rewrite')
  const msg = await page.locator('.cl-note[role="alert"]').textContent().catch(() => '')
  check(/can't read\. Nothing changed/.test(msg), 'failure: an answer out of shape says so plainly')
  check((await text(page)).includes(ORIGINAL) && (await decisions(page)).length === 0, 'failure: the page and the record are unchanged')
  await page.close()
}

{ // one shortcut: Cmd E; the writer's own words first; context rows for a selection
  const c = await open('state=askctx')
  const rows = await c.page.locator('.cl-hit strong').allTextContents()
  check(rows.slice(0, 3).join(',') === 'Rewrite,Tighten,Make it concrete', `ask: a selection's first rows are Rewrite, Tighten, Make it concrete (${rows.slice(0, 3).join(', ')})`)
  await c.page.close()
  const o = await open('state=askown')
  const first = await o.page.locator('.cl-hit strong').first().textContent()
  check(first === 'Ask the editor: “make the ending land harder”', 'ask: the first row is always the writer\'s own words')
  await o.page.locator('.cl-askinput').fill('zzqx frobnicate')
  check(/Ask the editor/.test(await o.page.locator('.cl-hit strong').first().textContent()) && !/Nothing in the library/.test(await o.page.locator('.cl-hits').textContent()), 'ask: no words ever leave the list empty')
  await o.page.close()
  const r = await open('state=askownran')
  const sent = (await calls(r.page, '/passes')).find(x => x.body.target === 'ask')
  check(sent && sent.body.instruction === 'make the ending land harder' && !sent.body.selection, 'ask: Enter sends the writer\'s words to the editor')
  check(/Show me/.test(await r.page.locator('.cl-noteplace').textContent()), 'ask: without a selection the answer is pinned notes, each with Show me')
  await r.page.close()
  const sh = (await import('node:fs')).readFileSync(new URL('../desktop/src/room.jsx', import.meta.url), 'utf8')
  check(!/mod && e\.shiftKey/.test(sh), 'ask: no second shortcut')
}

{ // the off switch
  const { page } = await open('state=pass&suggestions=off')
  check((await page.locator('.cl-noteplace').textContent()).indexOf('Show me') < 0 && (await page.locator('.cl-try').count()) === 0, 'off: notes carry no example and no Show me')
  await page.locator('.cl-ask').click()
  await page.locator('.cl-askinput').fill('rewrite this paragraph')
  const titles = await page.locator('.cl-hit strong').allTextContents()
  check(!titles.some(t => /Rewrite a passage|Suggest wording|Propose openings|Title ideas|Propose endings/.test(t)), 'off: the Ask line offers no suggestion')
  await page.keyboard.press('Escape')
  await page.locator('[aria-label="Close the notes"]').click() // the walk ends; a selection during a walk keeps the note in front
  await page.evaluate(() => { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('The budget memo calls it a modest efficiency.'); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + 45); ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 })) })
  await page.waitForTimeout(100)
  const tools = await page.locator('.cl-pop').textContent()
  check(!/Rewrite|Tighten|concrete/.test(tools) && /Ask/.test(tools), 'off: the selection bar keeps Ask and drops the rewrites')
  await page.close()
  const r = await open('state=roomoff')
  await r.page.locator('.cl-setting[aria-label="Suggested text"] button', { hasText: 'Off' }).click()
  await r.page.waitForTimeout(100)
  const posted = await r.page.evaluate(() => window.__calls.filter(c => c.path === '/settings' && c.method === 'POST').map(c => c.body))
  check(posted.length === 1 && posted[0].suggestions === false, 'off: the switch is kept by the backend, so every window agrees')
  await r.page.close()
}

{ // the floating Other words card and the passage tools
  const { page } = await open('state=wordpop')
  check((await page.locator('.cl-pop .cl-alt').count()) > 0 && (await page.locator('.cl-margin .cl-note').count()) === 0, 'other words: a double-click opens the card beside the word')
  await page.locator('.cl-pop .cl-alt', { hasText: 'small' }).click()
  await page.waitForTimeout(100)
  check((await text(page)).includes('calls it a small efficiency'), 'other words: a click swaps the word in place')
  check((await decisions(page)).length === 0, 'other words: a dictionary word is not model text')
  await page.close()
  const k = await open('state=wordkey')
  check((await k.page.locator('.cl-pop .cl-word').textContent()) === 'modest', 'other words: Cmd E inside a word offers Other words first')
  await k.page.close()
  const tl = await open('state=tools')
  check((await tl.page.locator('.cl-pop .cl-selbar button').allTextContents()).join(',') === 'Rewrite,Tighten,Make it concrete,Ask', 'bar: a selected sentence gets Rewrite, Tighten, Make it concrete and Ask')
  const barBox = await tl.page.locator('.cl-selbar').boundingBox(), selBox = await tl.page.locator('.cl-text [data-id="word"]').boundingBox()
  check(barBox && selBox && Math.abs(selBox.y - (barBox.y + barBox.height) - 8) <= 2, `bar: 8 px above the selection's first line (${barBox && selBox ? Math.round(selBox.y - barBox.y - barBox.height) : '?'} px)`)
  await tl.page.close()
}

{ // Bring in, dictation's press first, scenes
  const { page } = await open('state=bring')
  const items = await page.locator('.cl-bring .cl-item .cl-name').allTextContents()
  check(items.join(',') === 'A Word file,A PDF,A text or Markdown file,A link,Talk it through,Paste text', 'bring in: one menu for Word, PDF, text, a link, dictation and paste')
  await page.close()
  const bad = await open('state=linkbad')
  check(/public web pages/.test(await bad.page.locator('.cl-sheet .cl-status').textContent()), 'bring in: a link inside the computer is refused in plain words')
  await bad.page.close()
  const ln = await open('state=linknew')
  const piece = (await calls(ln.page, '/pieces')).find(c => c.method === 'POST')
  check(piece && piece.body.source_url === 'https://www.example.org/branch-hours' && /^From “Branch hours and the budget”, example\.org, read /.test(piece.body.body) && !/^>/m.test(piece.body.body), 'link: a new piece opens under one source line, clean paragraphs, the address kept in the record')
  await ln.page.close()
  const d = await open('state=dictask')
  check(/^Sent to OpenAI to type out/.test(await d.page.locator('.cl-note[aria-label="Talk it through"] .cl-say').textContent()), 'dictation: "Sent to OpenAI to type out" before anything is recorded')
  check((await calls(d.page, '/dictation')).every(c => c.method === 'GET'), 'dictation: nothing is sent before Send')
  await d.page.close()
  const done = await open('state=dictated')
  const posts = (await calls(done.page, '/dictation')).filter(c => c.method === 'POST')
  check(posts.length === 1 && posts[0].body.send_to === 'openai', 'dictation: the recording goes once, to the service the writer agreed to')
  check((await text(done.page)).includes('That number is real. Nobody in the line had come for a book. It is also'), 'dictation: the words land at the cursor')
  await done.page.close()
  const bg = async q => { const p = await open(q); const v = await p.page.evaluate(() => { const b = getComputedStyle(document.querySelector('.cl-room')).backgroundImage; return `${b.length}:${b.slice(-80)}` }); await p.page.close(); return v }
  const tideDark = await bg('state=invite&theme=dark&scene=tide'), marshDark = await bg('state=invite&theme=dark&scene=marsh'), snowDark = await bg('state=invite&theme=dark&scene=snow')
  check(marshDark !== tideDark && snowDark !== tideDark && marshDark !== snowDark, 'scenes: Quiet Marsh and Snow Light stay themselves in dark mode')
  check((await bg('state=invite&scene=own')).includes('own-picture.png'), 'scenes: your own picture becomes the scene')
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed')
process.exit(failures.length ? 1 : 0)
