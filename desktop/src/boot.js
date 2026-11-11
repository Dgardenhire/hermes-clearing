// The room's first screen, remembered. Opening The Clearing waits on its backend (Hermes starts it and its gateway
// on demand, a few seconds on a cold open), so the page keeps the last answer that drew the first screen (the
// current piece, the piece list for the title menu, the trash count and the room settings) in ctx.storage, and
// draws from it at once on the next open. The fresh answer replaces it when it arrives.
//
// What is kept is an allow-list of plain fields: no ids of passes, no model or provider names, no paths, no
// tokens, nothing the backend adds later unless it is named here. It is capped (MAX_CHARS of JSON); a piece too
// long to keep is not kept, and the room opens the way it always did.
//
// Pure: the caller reads and writes the storage.

export const BOOT_KEY = 'boot'
export const BOOT_VERSION = 1
export const MAX_CHARS = 200 * 1024
export const MAX_LIST = 40 // the title menu shows the six most recent; the rest is room to spare

const PIECE_FIELDS = { id: 'string', title: 'string', body: 'string', created: 'number', updated: 'number', sample: 'boolean', voice: 'boolean', words: 'number' }
const LIST_FIELDS = { id: 'string', title: 'string', created: 'number', updated: 'number', sample: 'boolean', voice: 'boolean', words: 'number' }

function pick(src, fields) {
  if (!src || typeof src !== 'object') return null
  const out = {}
  for (const [k, type] of Object.entries(fields)) if (typeof src[k] === type) out[k] = src[k]
  return typeof out.id === 'string' && out.id ? out : null
}

// What to keep, or null when there is nothing worth keeping or it is over the cap.
export function packBoot({ current, pieces, trash, settings } = {}, now = Date.now()) {
  const cur = pick(current, PIECE_FIELDS)
  if (!cur || typeof cur.body !== 'string' || typeof cur.title !== 'string') return null
  const list = (Array.isArray(pieces) ? pieces : []).map(p => pick(p, LIST_FIELDS)).filter(Boolean).slice(0, MAX_LIST)
  const value = {
    v: BOOT_VERSION, at: now, current: cur, pieces: list,
    trash: Number.isFinite(trash) && trash >= 0 ? Math.floor(trash) : 0,
    settings: settings && typeof settings.suggestions === 'boolean' ? { suggestions: settings.suggestions } : {},
  }
  return JSON.stringify(value).length <= MAX_CHARS ? value : null
}

// The kept screen, checked again on the way out (the storage is shared and can hold anything), or null.
export function readBoot(raw) {
  let v = raw
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch (e) { return null } }
  if (!v || typeof v !== 'object' || v.v !== BOOT_VERSION) return null
  const cur = pick(v.current, PIECE_FIELDS)
  if (!cur || typeof cur.body !== 'string' || typeof cur.title !== 'string') return null
  if (JSON.stringify(v).length > MAX_CHARS) return null
  return {
    current: cur,
    pieces: (Array.isArray(v.pieces) ? v.pieces : []).map(p => pick(p, LIST_FIELDS)).filter(Boolean).slice(0, MAX_LIST),
    trash: Number.isFinite(v.trash) && v.trash >= 0 ? v.trash : 0,
    settings: v.settings && typeof v.settings.suggestions === 'boolean' ? { suggestions: v.settings.suggestions } : {},
  }
}

// The text the room shows for a piece: its own, or the writer's unsaved buffer when that is newer (the same rule
// the room has always used when it opens a piece).
export function shownText(p, buf) {
  if (buf && buf.at > (p.updated || 0) && (buf.body !== p.body || buf.title !== p.title)) {
    return { title: buf.title, body: buf.body, buffered: true }
  }
  return { title: p.title, body: p.body, buffered: false }
}
