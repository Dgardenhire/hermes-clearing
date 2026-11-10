#!/usr/bin/env node
// One harness state in light and dark at 1440 x 900 (the product owner's check size), into docs/shots/.
//   PLAYWRIGHT=<path> PORT=8841 node harness/shoot-one.mjs <name> "<query>" [<name> "<query>" ...]
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const BASE = `http://127.0.0.1:${process.env.PORT || 8841}/harness/`
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'shots')
const args = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--mute-audio', '--autoplay-policy=user-gesture-required'] })
for (let i = 0; i < args.length; i += 2) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${BASE}?${args[i + 1]}${theme === 'dark' ? '&theme=dark' : ''}`)
    await page.waitForSelector('[data-ready="1"]', { timeout: 30000 })
    await page.waitForTimeout(500)
    const file = join(OUT, `${args[i]}-${theme}.png`)
    await page.screenshot({ path: file })
    console.log(file.split('/').pop())
    await page.close()
  }
}
await browser.close()
