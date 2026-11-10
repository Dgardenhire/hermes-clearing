#!/usr/bin/env node
// Screens for Damon's notes (Nov 8): the floating card, suggested text, Bring in, dictation and the scenes.
// Rendered with Playwright and system Chrome at real time, because the floating card and the in-page
// previews are placed after layout, which headless Chrome's virtual time can skip.
//
//   /usr/bin/python3 -m http.server 8841 --bind 127.0.0.1 --directory .      (from the repo root)
//   PLAYWRIGHT=<path to the playwright package> PORT=8841 node harness/shoot-notes.mjs [name ...]
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const BASE = `http://127.0.0.1:${process.env.PORT || 8841}/harness/`
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'shots')
const SHOTS = [
  ['shownote-light', 'state=shownote'], ['shownote-dark', 'state=shownote&theme=dark'], ['shownote-used-light', 'state=shownoteused'],
  ['tools-light', 'state=tools'], ['rewrite-light', 'state=rewritepick'], ['rewrite-dark-green', 'state=rewritepick&theme=dark&accent=green'],
  ['next-dark', 'state=nextpick&theme=dark'], ['next-light', 'state=nextpick'], ['wordpop-light', 'state=wordpop'], ['wordpop-dark', 'state=wordpop&theme=dark'],
  ['endings-light', 'state=endings'], ['titles-light', 'state=titles'], ['bring-light', 'state=bring'], ['bring-dark', 'state=bring&theme=dark'],
  ['link-light', 'state=link'], ['link-refused-light', 'state=linkbad'], ['paste-light', 'state=paste'],
  ['dictate-ask-light', 'state=dictask'], ['dictating-dark', 'state=dictating&theme=dark'], ['dictated-light', 'state=dictated'],
  ['room-scenes-dark', 'state=roomscene&theme=dark&scene=marsh'], ['room-off-light', 'state=roomoff&suggestions=off'],
  ['scene-snow-dark', 'state=quick&theme=dark&scene=snow'], ['scene-marsh-dark', 'state=quick&theme=dark&scene=marsh'],
  ['scene-tide-light', 'state=quick&scene=tide'], ['scene-own-light', 'state=quick&scene=own'], ['scene-own-dark', 'state=quick&scene=own&theme=dark'],
  ['history-used-light', 'state=usedhistory'], ['ask-off-dark', 'state=askoff&suggestions=off&theme=dark'], ['shownote-narrow-dark', 'state=shownote&theme=dark&width=800', 800],
  ['rewrite-narrow-light', 'state=rewritepick&width=800', 800], ['words2-dark', 'state=words2&theme=dark'], ['words-light', 'state=words'],
]
const only = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--mute-audio', '--autoplay-policy=user-gesture-required'] })
for (const [name, query, width = 1420] of SHOTS.filter(([n]) => !only.length || only.includes(n))) {
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  await page.goto(`${BASE}?${query}`)
  await page.waitForSelector('[data-ready="1"]', { timeout: 30000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(join(OUT, `${name}.png`))
  await page.close()
}
await browser.close()
