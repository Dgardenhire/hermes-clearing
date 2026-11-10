// A stand-in for '@hermes/plugin-sdk', for rendering desktop/plugin.js in a plain browser. Components come
// from the kit's stand-in (kit-sdk-stub.js, copied by the kit's build); atom and useValue are the real
// nanostores; host records calls. Harness only: Hermes provides the real SDK.
import { useStore } from '@nanostores/react'
import { atom as nanoAtom } from 'nanostores'

export * from './kit-sdk-stub.js'
export const atom = nanoAtom
export const useValue = useStore
const log = (...a) => (window.__hostLog = window.__hostLog || []).push(a)
export function captureGatewayFileDownload() { return async (path, name) => log('download', path, name) }
export const host = {
  navigate(path) { log('navigate', path) },
  notify(n) { log('notify', n); const box = document.getElementById('hb-toasts'); if (!box) return; const el = document.createElement('div'); el.className = 'hb-toast'; el.textContent = n.message; box.append(el); setTimeout(() => el.remove(), 4000) },
  onEvent() { return () => {} },
}
