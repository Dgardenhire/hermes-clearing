// The three built-in scene photographs. They used to travel inside plugin.js as base64 (about 700 KB of the bundle);
// now the backend serves each one through the plugin's own route (GET /scene/builtin/{name}, reached with ctx.rest),
// and the page keeps a copy in its own data folder (ctx.files, 'data'), so every open after the first reads the
// picture from disk without waiting for the backend. A copy is named by the picture's hash (assets.gen.js), so a
// changed photograph is fetched again instead of shown from an old copy.
//
// Pure apart from what it is handed: rest, files and toUrl come from the caller, so node tests can drive it.

export const SCENE_NAMES = ['snow', 'marsh', 'tide']
const B64 = /^[A-Za-z0-9+/]+={0,2}$/

export const cacheName = (name, hash) => `scene-${name}-${hash}.b64`

// base64 -> a URL the stylesheet can use: a blob: URL where the browser has one (short, cheap to restyle), else a data URL.
export function base64ToUrl(data, mime) {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined' && typeof atob === 'function') {
    const bin = atob(data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: mime }))
  }
  return `data:${mime};base64,${data}`
}

// One loader per page. load(name) resolves the scene's URL, or null when neither the copy nor the backend has it
// (the room then shows its paper color, as the plain scene does). A failed load is forgotten, so the next call
// tries again (the backend may only just have started).
export function createSceneLoader({ manifest, rest, files, toUrl = base64ToUrl, onLoad }) {
  const done = new Map() // name -> { p: Promise<url|null>, copyOnly }
  const urls = {}

  async function fromCopy(name, hash) {
    if (!files || typeof files.readText !== 'function') return null
    try {
      const r = await files.readText(files.dataFolder || 'data', cacheName(name, hash))
      const text = r && r.ok && typeof r.text === 'string' ? r.text.trim() : ''
      return text.length > 64 && B64.test(text) ? text : null
    } catch (e) { return null }
  }

  async function keep(name, hash, data) {
    if (!files || typeof files.writeText !== 'function') return
    try { await files.writeText(files.dataFolder || 'data', cacheName(name, hash), data) } catch (e) { /* the next open fetches it again */ }
  }

  async function fetchOne(name, copyOnly) {
    const want = manifest[name]
    if (!want) return null
    let data = await fromCopy(name, want.hash)
    if (!data) {
      if (copyOnly) throw new Error('no copy yet')
      const r = await rest(`/scene/builtin/${name}`)
      if (!r || typeof r.data !== 'string' || !B64.test(r.data)) throw new Error('no scene')
      data = r.data
      // Keep a copy only of the picture this page expects; a backend from another version still shows its own.
      if (r.hash === want.hash) keep(name, want.hash, data)
    }
    const url = toUrl(data, want.mime || 'image/jpeg')
    urls[name] = url
    if (onLoad) onLoad({ ...urls })
    return url
  }

  // copyOnly reads the kept copy and never asks the backend: the plugin preloads that way when it registers, so
  // starting Hermes never wakes The Clearing's backend for a page nobody opened.
  function load(name, copyOnly = false) {
    const had = done.get(name)
    if (had && (!had.copyOnly || copyOnly)) return had.p
    // A full load asked for while a copy-only one runs waits for it, then asks the backend if it found nothing.
    const p = (had ? had.p.then(url => url || fetchOne(name, false)) : fetchOne(name, copyOnly))
      .catch(() => null)
      .then(url => { if (!url && done.get(name) === entry) done.delete(name); return url })
    const entry = { p, copyOnly }
    done.set(name, entry)
    return p
  }
  const order = first => [first, ...SCENE_NAMES.filter(n => n !== first)].filter(n => SCENE_NAMES.includes(n))

  return {
    load,
    loadAll: first => Promise.all(order(first).map(n => load(n))),
    preload: first => Promise.all(order(first).map(n => load(n, true))),
    urls: () => ({ ...urls }),
    missing: () => SCENE_NAMES.filter(n => !urls[n]),
  }
}

// The room's inline style: one custom property per loaded scene, which the stylesheet's scene rules read.
export function sceneStyle(urls) {
  const out = {}
  for (const n of SCENE_NAMES) if (urls && urls[n]) out[`--cl-img-${n}`] = `url("${urls[n]}")`
  return out
}
