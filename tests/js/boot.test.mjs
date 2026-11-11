// The room's first screen, kept in ctx.storage (desktop/src/boot.js): drawn at once on the next open, replaced by
// the fresh answer, capped, and never holding anything but the plain fields the first screen needs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOOT_KEY, MAX_CHARS, MAX_LIST, packBoot, readBoot, shownText } from '../../desktop/src/boot.js'

const piece = (id, extra = {}) => ({ id, title: `Piece ${id}`, body: 'Every Saturday morning the branch opens at ten.', created: 1, updated: 2, trashed: null, finished_version: null, sample: false, voice: false, words: 8, spans: [], ...extra })
// A storage like ctx.storage: JSON in, JSON out (createPluginStorage in apps/desktop/src/contrib/plugin.ts).
function storage() {
  const m = new Map()
  return { get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)), remove: k => m.delete(k), raw: m }
}

test('first paint comes from the kept screen: what was saved is what the next open draws', () => {
  const s = storage()
  const state = { current: piece('a'), pieces: [piece('a'), piece('b')], trash: 2, settings: { suggestions: false } }
  s.set(BOOT_KEY, packBoot(state, 1000))
  const b = readBoot(s.get(BOOT_KEY, null))
  assert.equal(b.current.id, 'a')
  assert.equal(b.current.title, 'Piece a')
  assert.equal(b.current.body, state.current.body)
  assert.deepEqual(b.pieces.map(p => p.id), ['a', 'b'])
  assert.equal(b.trash, 2)
  assert.deepEqual(b.settings, { suggestions: false })
  // The title menu's list never carries bodies.
  assert.ok(b.pieces.every(p => !('body' in p)))
})

test('the background refresh replaces the kept screen: a newer save is what the following open draws', () => {
  const s = storage()
  s.set(BOOT_KEY, packBoot({ current: piece('a', { body: 'Old words.' }), pieces: [piece('a')], trash: 0, settings: {} }))
  assert.equal(readBoot(s.get(BOOT_KEY)).current.body, 'Old words.')
  s.set(BOOT_KEY, packBoot({ current: piece('a', { body: 'New words, saved.', updated: 9 }), pieces: [piece('a')], trash: 0, settings: {} }))
  const b = readBoot(s.get(BOOT_KEY))
  assert.equal(b.current.body, 'New words, saved.')
  assert.equal(b.current.updated, 9)
})

test('an unsaved buffer newer than the kept piece is what shows, the same rule the room uses when it opens a piece', () => {
  const p = piece('a', { title: 'T', body: 'Saved.', updated: 10 })
  assert.deepEqual(shownText(p, null), { title: 'T', body: 'Saved.', buffered: false })
  assert.deepEqual(shownText(p, { title: 'T', body: 'Typed after.', at: 11 }), { title: 'T', body: 'Typed after.', buffered: true })
  assert.deepEqual(shownText(p, { title: 'T', body: 'Older buffer.', at: 9 }), { title: 'T', body: 'Saved.', buffered: false })
  assert.deepEqual(shownText(p, { title: 'T', body: 'Saved.', at: 11 }), { title: 'T', body: 'Saved.', buffered: false })
})

test('size cap: a piece too long to keep is not kept, and the list is cut to what the menu can use', () => {
  const long = 'word '.repeat(Math.ceil(MAX_CHARS / 5) + 10)
  assert.equal(packBoot({ current: piece('a', { body: long }), pieces: [], trash: 0, settings: {} }), null)
  const many = Array.from({ length: 300 }, (_, i) => piece(`p${i}`))
  const v = packBoot({ current: piece('p0'), pieces: many, trash: 0, settings: {} })
  assert.equal(v.pieces.length, MAX_LIST)
  assert.ok(JSON.stringify(v).length <= MAX_CHARS)
  // An oversized value already in the storage (another version wrote it) is refused on the way out too.
  assert.equal(readBoot({ v: 1, current: piece('a', { body: long }), pieces: [] }), null)
})

test('no secrets: only the named plain fields are kept, whatever else the backend or the storage carries', () => {
  const sneaky = { token: 'sk-live-123', api_key: 'abc', authorization: 'Bearer x', model: 'hermes-4', provider: 'nous', path: '/Users/x/.hermes/.env', password: 'pw' }
  const v = packBoot({ current: piece('a', sneaky), pieces: [piece('b', sneaky)], trash: 1, settings: { suggestions: true, ...sneaky }, ...sneaky })
  const text = JSON.stringify(v)
  for (const value of Object.values(sneaky)) assert.ok(!text.includes(value), value)
  for (const key of Object.keys(sneaky)) assert.ok(!text.includes(`"${key}"`), key)
  // Spans, pass ids and anything else not on the list stay out as well.
  assert.ok(!text.includes('"spans"') && !text.includes('"trashed"'))
  // And on the way out: a tampered value comes back with the same fields only.
  const b = readBoot({ ...v, current: { ...v.current, ...sneaky }, pieces: [{ ...v.pieces[0], ...sneaky }], settings: { suggestions: true, ...sneaky } })
  assert.ok(!JSON.stringify(b).includes('sk-live-123'))
})

test('a kept screen from another version, or anything malformed, is ignored and the room opens as it always did', () => {
  for (const bad of [null, undefined, '', 'not json', 42, [], {}, { v: 2, current: piece('a') }, { v: 1 }, { v: 1, current: { id: 'a' } }, { v: 1, current: { title: 'x', body: 'y' } }]) {
    assert.equal(readBoot(bad), null, JSON.stringify(bad))
  }
  assert.equal(packBoot({}), null)
  assert.equal(packBoot({ current: { id: 'a', title: 'x' } }), null) // no body: nothing worth drawing
})

test('the room draws the kept screen read-only, swaps in the fresh piece, and never saves from the kept copy', () => {
  const room = readFileSync(new URL('../../desktop/src/room.jsx', import.meta.url), 'utf8')
  assert.match(room, /readBoot\(store\(\)\.get\(BOOT_KEY, null\)\)/) // read in the first render's state, not after it
  assert.match(room, /cached: true, local: true/)
  assert.match(room, /className="cl-titlefield"[^>]*readOnly=\{kept\}/)
  assert.match(room, /className="cl-body"[^>]*readOnly=\{kept\}/)
  assert.match(room, /if \(!p \|\| p\.cached\) return/) // flush
  assert.match(room, /function changeBody\(next, how = 'edit'\) \{\n\s+if \(live\.current\.piece && live\.current\.piece\.cached\) return/)
  assert.match(room, /if \(kept\) return; setMenu\(false\); setBring\(false\); setSheet\('finish'\)/) // no export from a kept copy
  assert.match(room, /if \(!live\.current\.piece \|\| live\.current\.piece\.cached\) \{/) // backend off: the old local fallback
  assert.match(room, /packBoot\(\{ current: \{ \.\.\.piece, title, body \}, pieces, trash, settings \}\)/)
})
