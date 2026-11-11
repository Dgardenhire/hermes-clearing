// The built-in scenes (desktop/src/scenes.js): out of the bundle, from the plugin's own route, kept in the
// plugin's data folder so later opens read them from disk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { SCENE_NAMES, cacheName, createSceneLoader, sceneStyle } from '../../desktop/src/scenes.js'
import { SCENES } from '../../desktop/src/assets.gen.js'

const DATA = 'QUJD'.repeat(40) // base64, longer than the loader's floor
const manifest = { snow: { mime: 'image/jpeg', hash: 'aaa' }, marsh: { mime: 'image/jpeg', hash: 'bbb' }, tide: { mime: 'image/jpeg', hash: 'ccc' } }
const toUrl = (d, mime) => `u:${mime}:${d.length}`

function files(initial = {}) {
  const disk = new Map(Object.entries(initial))
  return {
    dataFolder: 'data', disk, reads: 0, writes: 0,
    async readText(folder, path) { this.reads++; assert.equal(folder, 'data'); return disk.has(path) ? { ok: true, text: disk.get(path) } : { ok: false, error: 'missing' } },
    async writeText(folder, path, text) { this.writes++; disk.set(path, text); return { ok: true } },
  }
}
function backend({ fail = false, hash } = {}) {
  const calls = []
  const rest = async path => {
    calls.push(path)
    if (fail) throw new Error('Hermes desktop bridge unavailable')
    const name = path.split('/').pop()
    return { name, mime: 'image/jpeg', hash: hash || manifest[name].hash, data: DATA }
  }
  return { rest, calls }
}

test('the first open fetches each scene from the backend and keeps a copy named by its hash', async () => {
  const f = files(), b = backend()
  const seen = []
  const l = createSceneLoader({ manifest, rest: b.rest, files: f, toUrl, onLoad: u => seen.push(u) })
  await l.loadAll('marsh')
  assert.deepEqual(b.calls, ['/scene/builtin/marsh', '/scene/builtin/snow', '/scene/builtin/tide']) // the shown scene first
  assert.deepEqual([...f.disk.keys()].sort(), ['scene-marsh-bbb.b64', 'scene-snow-aaa.b64', 'scene-tide-ccc.b64'])
  assert.deepEqual(l.missing(), [])
  assert.equal(seen.at(-1).marsh, `u:image/jpeg:${DATA.length}`)
})

test('later opens read the kept copy and never wait on the backend', async () => {
  const f = files({ [cacheName('snow', 'aaa')]: DATA, [cacheName('marsh', 'bbb')]: DATA, [cacheName('tide', 'ccc')]: DATA })
  const b = backend({ fail: true })
  const l = createSceneLoader({ manifest, rest: b.rest, files: f, toUrl })
  const urls = await l.preload('snow')
  assert.ok(urls.every(Boolean))
  assert.deepEqual(b.calls, [])
})

test('preloading when the plugin registers never asks the backend; the page asks once it opens', async () => {
  const f = files(), b = backend()
  const l = createSceneLoader({ manifest, rest: b.rest, files: f, toUrl })
  const pre = l.preload('snow')
  const full = l.loadAll('snow') // the page opens while the preload still runs
  assert.deepEqual(await pre, [null, null, null])
  assert.ok((await full).every(Boolean))
  assert.deepEqual(b.calls.sort(), ['/scene/builtin/marsh', '/scene/builtin/snow', '/scene/builtin/tide'])
})

test('a backend that is still starting is asked again later; a picture from another version is shown but not kept', async () => {
  const f = files()
  let up = false
  const calls = []
  const rest = async path => { calls.push(path); if (!up) throw new Error('starting'); return { mime: 'image/jpeg', hash: 'other', data: DATA } }
  const l = createSceneLoader({ manifest, rest, files: f, toUrl })
  assert.equal(await l.load('tide'), null)
  up = true
  assert.ok(await l.load('tide'))
  assert.equal(calls.length, 2)
  assert.equal(f.disk.size, 0) // hash 'other' is not what this page expects
})

test('a damaged copy is ignored and fetched again; a host without ctx.files still gets its scenes', async () => {
  const f = files({ [cacheName('snow', 'aaa')]: 'not base64 at all!' })
  const b = backend()
  assert.ok(await createSceneLoader({ manifest, rest: b.rest, files: f, toUrl }).load('snow'))
  assert.deepEqual(b.calls, ['/scene/builtin/snow'])
  const b2 = backend()
  assert.ok(await createSceneLoader({ manifest, rest: b2.rest, files: undefined, toUrl }).load('snow'))
})

test('the room style names each loaded scene, and nothing for the rest', () => {
  assert.deepEqual(sceneStyle({ snow: 'blob:1' }), { '--cl-img-snow': 'url("blob:1")' })
  assert.deepEqual(sceneStyle({}), {})
  assert.deepEqual(SCENE_NAMES, ['snow', 'marsh', 'tide'])
})

test('the bundle no longer carries the photographs, and the manifest matches the files the backend serves', async () => {
  const bundle = readFileSync(new URL('../../desktop/plugin.js', import.meta.url), 'utf8')
  assert.ok(!bundle.includes('data:image/jpeg;base64'), 'rebuild: the scenes must not be in plugin.js')
  assert.ok(bundle.length < 800 * 1024, `plugin.js is ${Math.round(bundle.length / 1024)} KB`)
  assert.match(bundle, /format\("woff2"\)/)
  const { createHash } = await import('node:crypto')
  for (const name of SCENE_NAMES) {
    const file = new URL(`../../desktop/assets/${SCENES[name].file}`, import.meta.url)
    assert.ok(statSync(file).size > 1000)
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12), SCENES[name].hash, `${name}: run scripts/embed_assets.py`)
  }
})
