// Hermes's command palette calls each entry's detail() every time it opens (apps/desktop command-palette:
// `detail: item.detail?.()`), so a string detail throws there. The kit's committed register.js passes detail
// through unchanged, so The Clearing hands it functions (Nov 8, 2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('every palette entry gives Hermes a detail function, in the source and in the bundle', () => {
  const src = readFileSync(new URL('../../desktop/src/plugin.js', import.meta.url), 'utf8')
  const details = [...src.matchAll(/\{ id: 'clearing\.[^}]*?\bdetail:\s*([^,]+),/g)].map(m => m[1].trim())
  assert.equal(details.length, 3)
  for (const d of details) assert.match(d, /^\(\) => '/, d)
  const bundle = readFileSync(new URL('../../desktop/plugin.js', import.meta.url), 'utf8')
  assert.equal((bundle.match(/detail: \(\) => "/g) || []).length, 3)
})
