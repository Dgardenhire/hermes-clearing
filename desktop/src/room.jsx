// @jsxRuntime automatic
// The room: one page in a scene, the margin that holds one note at a time, the Ask line, the title menu
// and the Finish sheet. The writer's words are the only thing the page writes into the manuscript; the
// editor's answers arrive as marks, notes, change records and proposed openings the writer decides on.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { atom, captureGatewayFileDownload, host, useValue } from '@hermes/plugin-sdk'
import { instantRead, summarize } from './quick-check.js'
import { caretFor, placeNote, reopen } from './walk.js'
import { BUILT_IN, QUICK, WORDS, buildTargets, findTargets, forRoom, libraryMenu, shortFor } from './ask.js'
import { SCENES, USED, joinAt, quotedSource, sceneShown, screen, screenTry, shown, toolAt, wordAround } from './suggest.js'
import { POS_LABEL, createThesaurus, normalizeSelection } from './thesaurus.js'
import { createPassGate } from './gate.js'
import { Welcome } from './welcome.jsx'
import { Desk } from './desk.jsx'
import { ReadProgress, ReadResult } from './read.jsx'
import { FigureNote, OppsList, TryIt } from './spots.jsx'
import { figureMarks, oppMarks } from './spots.js'
import { share as authorShare } from './authorship.js'
import { readView, sentenceAt } from './surfaces.js'
import {
  applyChanges, applyCuts, asMarkdown, paragraphs, asPlainText, editSpan, fileName, followEdit, fromFile, markAt, plural, replaceSpan, runs, timeAgo, wordCount,
} from './text.js'
import methods from '../../library/methods.json'
import craft from '../../library/craft-paths.json'
import passes from '../../library/passes.json'
import additions from '../../library/additions.json'

export const LIB = { methods, paths: craft, passes, add: additions }
export const TARGETS = buildTargets(LIB)
export const $command = atom(null) // set by the Hermes palette commands: 'quick' | 'ask'

let api = null
export function bindContext(ctx) { api = ctx }

const MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '')
const MOD = MAC ? '⌘E' : 'Ctrl E'
const SAVE_DELAY = 700
const IDLE_VERSION_MS = 120000
const POLL_MS = 1000
const ASK_ROOM = 104 // the Ask line and the space under it

// ---------------------------------------------------------------- backend --
function errorOf(e) {
  const message = String((e && e.message) || e || '')
  const m = message.match(/(\d{3}):\s*([\s\S]*)$/)
  let status = m ? Number(m[1]) : (e && e.status) || null
  let detail = m ? m[2].trim() : message
  try { const b = JSON.parse(detail); if (b && b.detail !== undefined) detail = typeof b.detail === 'string' ? b.detail : (b.detail.message || '') } catch (x) { /* plain */ }
  // A status means the backend answered; then its own words decide (a plain message may say "network").
  const offline = !api || (!status && /bridge unavailable|failed to fetch|network|ECONNREFUSED|starting/i.test(message)) || (status === 404 && /^not found$/i.test(detail))
  // Only a sentence The Clearing wrote reaches the writer; a stack trace, "Forbidden" or a JavaScript error does not.
  const plain = /^[A-Z"'\u201c][\s\S]*[.?!\u201d"]$/.test(detail) && !/Error\b|Exception|Traceback|undefined/.test(detail)
  return { status, detail: plain ? detail : "The Clearing couldn't do that. Try again.", offline }
}

async function rest(path, options) {
  if (!api || typeof api.rest !== 'function') throw new Error('Hermes desktop bridge unavailable')
  return api.rest(path, { timeoutMs: 20000, ...(options || {}) })
}
const post = (path, body) => rest(path, { method: 'POST', body: body || {} })
// A PDF, a link or a recording can take longer than a save: the backend has its own limits for each.
const postLong = (path, body) => rest(path, { method: 'POST', body: body || {}, timeoutMs: 200000 })

// The dictionary's shards come from the backend, a few at a time, and stay loaded for the session.
let shardFailed = false
const THESAURUS = createThesaurus(key => rest(`/thesaurus/${key}`).then(r => { shardFailed = false; return r }, e => { shardFailed = true; throw e }))
const WORD_EDGE = /[^\p{L}\p{N}'’-]/u
const BUSY_CARDS = new Set(['walk', 'working', 'openings', 'apply', 'cuts', 'flip', 'panel', 'debate', 'proposals', 'across', 'choose', 'rewrite', 'next', 'titles'])
// Passes that read the whole piece, whatever is selected (openings and flips replace a part of it).
const WHOLE = new Set(['read', 'figures', 'opps', 'openings', 'flip', 'voice', 'lessons', 'guidance', 'across', 'debate', 'endings', 'titles'])
// Cards that float beside the words they are about, in the page, instead of in the margin: other words, a rewrite
// of a passage, a next sentence, and the passage tools for a selection.
const FLOAT = new Set(['words', 'tools'])
const FLOAT_PASSES = new Set(['wording', 'rewrite', 'next', 'ask', 'refine', 'explain'])
const MAX_RECORD_MS = 10 * 60 * 1000

const SECTION_LABEL = { voice: 'Voice', style: 'Style', audience: 'Audience', guardrails: 'Guardrails', workflow: 'Workflow' }
const JUDGMENT = { aligned: 'Sounds like you', drift: 'Drifts from your samples', unclear: 'Not enough to tell' }
const GATE = createPassGate()
const ZWSP = String.fromCharCode(0x200b) // keeps the mirror's last line as tall as the textarea's

function store() {
  const s = api && api.storage
  return {
    get(k, d) { try { const v = s ? s.get(k, null) : null; return v == null ? d : (typeof v === 'string' ? JSON.parse(v) : v) } catch (e) { return d } },
    set(k, v) { try { s && s.set(k, JSON.stringify(v)) } catch (e) { /* storage full: the backend still has it */ } },
    remove(k) { try { s && s.remove(k) } catch (e) { /* ignore */ } },
  }
}

function toBase64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(out)
}

// ---------------------------------------------------------------- icons --
const I = {
  down: <path d="m6 9 6 6 6-6" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  check: <path d="M20 6 9 17l-5-5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  local: <><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M8 20h8M12 16v4" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
  bring: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 19h14" /></>,
}
const Icon = ({ name }) => <svg className="cl-i" viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>

// ---------------------------------------------------------------- page --
function MarkLayer({ body, marks, active, mirrorRef, caret, layer }) {
  const parts = runs(body, marks, active)
  // A cursor the floating card hangs from (a next sentence): an empty marker at that offset, in the run there.
  let left = caret == null ? -1 : caret
  const out = []
  parts.forEach((p, i) => {
    const n = p.text.length
    const at = left >= 0 && left <= n && !p.mark ? left : -1
    if (at >= 0) left = -1
    else if (left >= 0) left -= n
    const text = at >= 0 ? [p.text.slice(0, at), <span key="c" data-id="caret">{ZWSP}</span>, p.text.slice(at)] : p.text
    out.push(p.mark
      ? <span key={i} className="cl-mk" data-id={p.mark.id} data-kind={p.mark.kind} data-from={p.mark.from || undefined} data-n={p.mark.n || undefined} data-fresh={p.mark.fresh ? '' : undefined} data-on={p.active ? '' : undefined}>{text}</span>
      : <span key={i}>{text}</span>)
  })
  return (
    <div className={layer ? `cl-text ${layer}` : 'cl-text'} ref={mirrorRef} aria-hidden="true">
      {out}
      {`${ZWSP}\n`}
    </div>
  )
}

function useAutoHeight(ref, value) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}

// ---------------------------------------------------------------- the room --
export function Room() {
  const command = useValue($command)
  const [conn, setConn] = useState('loading') // loading | ok | off
  const [piece, setPiece] = useState(null)
  const [pieces, setPieces] = useState([])
  const [trash, setTrash] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [save, setSave] = useState('saved') // saved | saving | local | error
  const [marks, setMarks] = useState([])
  const [walk, setWalk] = useState(null) // the open set of notes and where the writer is in it
  const [card, setCard] = useState(null) // what the margin shows
  const [ask, setAsk] = useState({ open: false, q: '', sel: 0 })
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [away, setAway] = useState(false)
  const [scene, setScene] = useState(() => store().get('scene', 'theme'))
  const [picture, setPicture] = useState(null) // the writer's own scene picture, as a data URL
  const [settings, setSettings] = useState(() => ({ suggestions: store().get('suggestions', true) !== false }))
  const [bring, setBring] = useState(false) // the Bring in menu
  const [rec, setRec] = useState({ phase: 'idle' }) // dictation: idle | starting | recording | working
  const [pop, setPop] = useState({ top: 0, left: 0 }) // where the floating card sits in the page
  const [spans, setSpans] = useState([]) // the model's words in this piece, until the writer types inside them
  const [shape, setShape] = useState(() => store().get('shape', false))
  const [look, setLook] = useState(() => store().get('look', { size: 'regular', contrast: 'standard' }))
  const setLookKey = (k, v) => setLook(l => { const n = { ...l, [k]: v }; store().set('look', n); return n })
  const [narrow, setNarrow] = useState(false)
  const [noteTop, setNoteTop] = useState(0)
  const [preview, setPreview] = useState(null) // an opening shown in the page, not yet kept
  const [welcome, setWelcome] = useState(false) // first open on a fresh profile: the welcome card, alone
  const [sampleRead, setSampleRead] = useState(null) // the stored real read of the sample piece (GET /state)
  const [nums, setNums] = useState([]) // the margin numerals beside the ranked changes

  const roomRef = useRef(null), bodyRef = useRef(null), titleRef = useRef(null), mirrorRef = useRef(null)
  const titleBtnRef = useRef(null), marginRef = useRef(null), scrollRef = useRef(null), noteRef = useRef(null), askRef = useRef(null), fileRef = useRef(null)
  const pageRef = useRef(null), popRef = useRef(null), recRef = useRef(null), bringRef = useRef(null), aiRef = useRef(null)
  const [ticks, setTicks] = useState([]) // the gutter ticks beside lines that hold the model's words
  const live = useRef({}) // latest values for timers and handlers
  // Latest state for timers and handlers. Fields set between renders (the body a pass was sent with, a reveal in
  // progress) are kept: replacing the object each render dropped them, so a pass's notes never followed the
  // edits typed while it ran.
  live.current = { ...live.current, piece, title, body, marks, spans, walk, card, conn, save, narrow, settings, rec, preview, sampleRead }
  const roomTargets = useMemo(() => forRoom(TARGETS, settings.suggestions), [settings.suggestions])
  const timers = useRef({})
  const pollRef = useRef(null) // the running pass's poll

  useAutoHeight(bodyRef, `${preview ? 1 : 0}${card && card.type === 'cuts' ? 1 : 0}${body}`)
  useAutoHeight(titleRef, title)

  // ---- loading and saving
  const open = useCallback((p, list) => {
    const buf = store().get(`draft:${p.id}`, null)
    let t = p.title, b = p.body
    if (buf && buf.at > (p.updated || 0) && (buf.body !== p.body || buf.title !== p.title)) { t = buf.title; b = buf.body; queueSave() }
    clearInterval(pollRef.current) // a pass started on the last piece never lands on this one
    setPiece(p); setTitle(t); setBody(b); setMarks([]); setWalk(null); setPreview(null)
    // Words that came from the editor stay marked across sessions, as long as they are still the same words.
    setSpans(store().get(`spans:${p.id}`, []).filter(s => s && typeof s.start === 'number' && b.slice(s.start, s.end) === s.quote))
    setCard(null)
    setWelcome(!!p.sample && !store().get('welcomed', false))
    if (list) setPieces(list)
    setSave('saved')
    store().set('last', p.id)
  }, [])

  const load = useCallback(async () => {
    try {
      const s = await rest('/state')
      setConn('ok'); setTrash(s.trash)
      setSampleRead(s.sample_read && s.sample_read.result ? s.sample_read : null)
      if (s.settings && typeof s.settings.suggestions === 'boolean') { setSettings(x => ({ ...x, suggestions: s.settings.suggestions })); store().set('suggestions', s.settings.suggestions) }
      const local = store().get('draft:local', null)
      if (local && local.body && local.body.trim()) {
        const p = await post('/pieces', { title: local.title, body: local.body, imported: true })
        store().remove('draft:local')
        open(p, (await rest('/pieces')).pieces)
        host.notify && host.notify({ kind: 'success', message: 'Your words from while saving was off are in a new piece.' })
        return
      }
      open(s.current, s.pieces)
      if (s.running) follow(s.running)
    } catch (e) {
      const err = errorOf(e)
      setConn('off')
      if (!live.current.piece) {
        const local = store().get('draft:local', { title: '', body: '' })
        setPiece({ id: 'local', title: local.title, body: local.body, local: true }); setTitle(local.title); setBody(local.body)
      }
      setSave('local')
      if (!err.offline) setCard({ type: 'failed', title: 'The Clearing', message: err.detail, retry: 'reload' })
    }
  }, [open])

  useEffect(() => { load() }, [load])

  // While the backend is off, look for it every few seconds.
  useEffect(() => {
    if (conn !== 'off') return undefined
    const t = setInterval(async () => { try { await rest('/health'); load() } catch (e) { /* still off */ } }, 5000)
    return () => clearInterval(t)
  }, [conn, load])

  function queueSave() {
    clearTimeout(timers.current.save)
    timers.current.save = setTimeout(flush, SAVE_DELAY)
  }

  async function flush() {
    const { piece: p, title: t, body: b, conn: c } = live.current
    if (!p) return
    if (p.local || c !== 'ok') { store().set(`draft:${p.local ? 'local' : p.id}`, { title: t, body: b, at: Date.now() / 1000 }); setSave('local'); return }
    setSave('saving')
    try {
      const saved = await post(`/pieces/${p.id}/save`, { title: t, body: b })
      if (live.current.body === b && live.current.title === t) { setSave('saved'); store().remove(`draft:${p.id}`) }
      setPiece(prev => prev && prev.id === saved.id ? { ...prev, ...saved, body: b } : prev)
      setPieces(list => list.map(x => x.id === saved.id ? { ...x, ...saved } : x))
    } catch (e) {
      const err = errorOf(e)
      setSave(err.offline ? 'local' : 'error')
      if (err.offline) setConn('off')
    }
  }

  function scheduleIdleVersion() {
    clearTimeout(timers.current.idle)
    timers.current.idle = setTimeout(() => {
      const { piece: p, title: t, body: b, conn: c } = live.current
      if (p && !p.local && c === 'ok') post(`/pieces/${p.id}/versions`, { reason: 'idle', title: t, body: b }).catch(() => {})
    }, IDLE_VERSION_MS)
  }

  function typed() {
    clearTimeout(timers.current.away)
    clearTimeout(timers.current.back)
    timers.current.away = setTimeout(() => setAway(true), 1500)
    timers.current.back = setTimeout(() => setAway(false), 2700)
  }

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); flush() }, [])

  // ------------------------------------------------------------- history --
  // The room keeps its own undo history, so Undo and Redo work from buttons as well as from Cmd Z and Cmd Shift Z,
  // and one applied change (a move and the trim that goes with it) is one step. Typing groups into one step per burst.
  const [histRev, setHistRev] = useState(0) // eslint-disable-line no-unused-vars
  const hist = () => live.current.hist || (live.current.hist = { past: [], future: [] })
  function remember(prev, next, kind) {
    const h = hist(), now = Date.now(), last = h.past[h.past.length - 1]
    if (kind === 'typing' && last && last.kind === 'typing' && now - last.at < 1500) { last.after = next; last.at = now }
    else {
      const snap = (kind === 'suggestion' && live.current.snap) || { marks: live.current.marks, spans: live.current.spans, walk: live.current.walk, card: live.current.card }
      h.past.push({ kind, before: prev, after: next, at: now, ...snap })
      if (h.past.length > 200) h.past.shift()
    }
    h.future = []
    setHistRev(r => r + 1)
  }
  const canUndo = () => !!(live.current.hist && live.current.hist.past.length)
  const canRedo = () => !!(live.current.hist && live.current.hist.future.length)
  function undo() {
    if (live.current.pendingInsert && bodyRef.current && !live.current.preview) runInsert() // a quick second press waits for the first
    const h = hist()
    if (!h.past.length) return
    const e = h.past.pop()
    e.redoMarks = live.current.marks; e.redoSpans = live.current.spans; e.redoWalk = live.current.walk; e.redoCard = live.current.card
    replay(e.before, e.marks, e.spans, e.walk, e.card)
    h.future.push(e)
    setHistRev(r => r + 1)
  }
  function redo() {
    if (live.current.pendingInsert && bodyRef.current && !live.current.preview) runInsert() // a quick second press waits for the first
    const h = hist()
    if (!h.future.length) return
    const e = h.future.pop()
    replay(e.after, e.redoMarks, e.redoSpans, e.redoWalk, e.redoCard)
    h.past.push(e)
    setHistRev(r => r + 1)
  }
  // Undo and Redo go in through the textarea's own editing path too, so the app's Edit menu always has a step to
  // offer (setting the value directly would empty it); the room's history decides what that step is.
  function replay(text, marks, spans, walk, card) {
    const cur = live.current.body, sp = editSpan(cur, text)
    const restore = () => {
      setMarks(marks || [])
      setSpans(spans || [])
      setWalk(walk ? { ...walk, showing: null } : walk)
      // The figures and the opportunities come back with their card open, on the item the change came from.
      setCard(card && (card.type === 'readresult' || card.type === 'used' || (card.type === 'walk' && walk && (walk.kind === 'figures' || walk.kind === 'opps'))) ? card : null)
      requestAnimationFrame(() => { const ta = bodyRef.current; if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(sp.newEnd, sp.newEnd) } })
    }
    live.current.pendingInsert = { start: sp.start, end: sp.oldEnd, text: text.slice(sp.start, sp.newEnd), after: restore, replay: true }
    if (live.current.preview) setPreview(null)
    else setTimeout(runInsert, 0)
  }

  // Undo and Redo from the app's Edit menu reach the textarea as history input; they run the room's history too.
  useEffect(() => {
    const ta = bodyRef.current
    if (!ta) return
    const on = e => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); e.inputType === 'historyUndo' ? undo() : redo() } }
    ta.addEventListener('beforeinput', on)
    return () => ta.removeEventListener('beforeinput', on)
  })

  function changeBody(next, how = 'edit') {
    const prev = live.current.body
    if (!live.current.replaying && prev !== next) {
      remember(prev, next, live.current.inserting ? 'suggestion' : how)
      if (how === 'typing' && !live.current.inserting && live.current.card && live.current.card.type === 'used') setCard(null) // the writer's next change
    }
    live.current.body = next // a second change before the next render starts from this one
    live.current.typedIn = true
    setBody(next)
    setMarks(ms => followEdit(ms, prev, next))
    // A span of model words follows every edit; typing inside it makes the words the writer's, and the mark goes.
    setSpans(ss => (ss.length ? followEdit(ss, prev, next).filter(s => !s.changed) : ss))
    setCard(c => (c && c.type === 'words' && !c.moved ? trackWord(c, prev, next) : c))
    store().set(`draft:${piece && !piece.local ? piece.id : 'local'}`, { title: live.current.title, body: next, at: Date.now() / 1000 })
    setSave(live.current.conn === 'ok' ? 'saving' : 'local')
    queueSave(); scheduleIdleVersion(); if (!live.current.inserting) typed() // a suggestion going in isn't typing
  }

  function changeTitle(next) {
    setTitle(next.replace(/\n/g, ' '))
    setSave(live.current.conn === 'ok' ? 'saving' : 'local')
    queueSave(); typed()
  }

  // ---- marks and the walk
  // A floating card (other words, a rewrite, a next sentence, the passage tools) hangs from the words it is about,
  // or from the cursor; a pass started from one keeps that place while it works.
  const floating = !!card && (FLOAT.has(card.type) || (card.type === 'working' && card.pass.kind === 'wording' && !!card.anchor))
  // A rewrite, a next sentence or an answer to the writer's own words docks in the margin beside its passage (or as
  // a sheet at the bottom of a narrow pane), never over the words it is about; its passage stays marked in the page.
  const docked = !!card && (card.type === 'rewrite' || card.type === 'next' || (card.type === 'working' && !!card.anchor && card.pass.kind !== 'wording'))
  const span = floating || docked ? (card.type === 'working' ? card.anchor : card.type === 'next' ? { start: card.at, end: card.at } : card) : null
  const wordMark = span && !span.moved && span.end > span.start ? [{ id: 'word', kind: 'word', status: 'open', start: span.start, end: span.end, quote: body.slice(span.start, span.end) }] : []
  const caretAt = span && !span.moved && span.end === span.start ? span.start : null
  const openMarks = [...marks.filter(m => m.status === 'open' || m.kind === 'kept'), ...wordMark]
  const current = walk && walk.ids[walk.index] ? marks.find(m => m.id === walk.ids[walk.index]) : null

  // Line the note up with its mark.
  const anchor = card && card.type === 'walk' && current ? current.id : docked ? (card.type === 'next' ? 'caret' : 'word') : null
  live.current.anchor = anchor
  // Line the note up with its passage, but keep the whole note on screen and above the Ask line. It is measured
  // after the page has scrolled the passage into view (reveal() places it again in the same frame), never before.
  function place() {
    const a = live.current.anchor
    if (!a || !marginRef.current || !scrollRef.current || live.current.narrow || (!mirrorRef.current && !(live.current.preview && live.current.preview.inline))) { setNoteTop(0); return }
    const shown = live.current.preview && live.current.preview.inline && roomRef.current && roomRef.current.querySelector('.cl-proposed-page')
    const el = shown || mirrorRef.current.querySelector(`[data-id="${a}"]`)
    if (!el) { setNoteTop(0); return }
    const margin = marginRef.current.getBoundingClientRect(), view = scrollRef.current.getBoundingClientRect()
    const top = placeNote({ passageTop: el.getBoundingClientRect().top, viewTop: view.top, viewBottom: view.bottom, marginTop: margin.top, noteHeight: noteRef.current ? noteRef.current.offsetHeight : 240, askRoom: ASK_ROOM })
    if (noteRef.current) noteRef.current.style.marginTop = `${top}px` // before this frame paints, so the card never jumps
    setNoteTop(top)
  }
  useLayoutEffect(() => { if (!live.current.revealing) place() }, [anchor, current && current.start, card, narrow, body, preview, walk && walk.trying, walk && walk.index]) // eslint-disable-line react-hooks/exhaustive-deps

  // The floating card sits just under the words it is about (or above them, when there is no room under), in the
  // page, so it scrolls with them. It never covers its own words, and it stays inside the page's column.
  function placePop() {
    const page = pageRef.current, el = popRef.current, view = scrollRef.current
    if (!page || !el || !view) return
    // While the writer tries options the card holds still, so the option under the pointer stays under it.
    if (preview && preview.inline && el.style.top && live.current.card && FLOAT.has(live.current.card.type)) return
    const target = preview && preview.inline ? page.querySelector('.cl-proposed-page') : mirrorRef.current && mirrorRef.current.querySelector('[data-id="word"],[data-id="caret"]')
    if (!target) return
    const rects = target.getClientRects()
    const first = rects[0] || target.getBoundingClientRect(), last = rects[rects.length - 1] || first
    const pr = page.getBoundingClientRect(), vr = view.getBoundingClientRect()
    const w = el.offsetWidth, h = el.offsetHeight
    const bottomRoom = vr.bottom - (live.current.narrow ? 80 : 16) - last.bottom
    const bar = live.current.card && live.current.card.type === 'tools'
    // The selection bar sits 8 px above the first line when there is room between it and whatever is above: the
    // window's top and the title, which it must never cover (Damon's Hermes test, Nov 9: Rewrite / Tighten / Make it
    // concrete / Ask sat on the title when the selection was the first sentence). Otherwise it goes under the selection.
    const ceiling = Math.max(vr.top, titleRef.current ? titleRef.current.getBoundingClientRect().bottom : vr.top) + 4
    const top = bar ? (first.top - ceiling < h + 8 ? last.bottom - pr.top + 8 : first.top - pr.top - h - 8)
      : bottomRoom >= h + 12 || first.top - vr.top < h + 24 ? last.bottom - pr.top + 10 : first.top - pr.top - h - 10
    const left = Math.max(0, Math.min(first.left - pr.left - 12, pr.width - w))
    el.style.top = `${top}px`; el.style.left = `${left}px`
    setPop(p => (p.top === top && p.left === left ? p : { top, left }))
    // When the card changes and runs past the window (its answer arrived, a word was tried), the page scrolls just
    // enough to show it, and never so far that its own words leave the top.
    const over = el.getBoundingClientRect().bottom - (vr.bottom - (live.current.narrow ? 80 : 16))
    if (over > 0 && !bar) view.scrollBy({ top: Math.min(over, first.top - vr.top - 40) })
  }
  useLayoutEffect(() => { if (floating) placePop() }, [floating, card, preview, body, narrow]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = roomRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 860))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function startWalk(kindMarks, info) {
    const ids = kindMarks.map(m => m.id)
    setMarks(ms => [...ms.filter(m => m.kind === 'kept'), ...kindMarks])
    setWalk({ ids, index: 0, ...info })
    setCard(ids.length ? { type: info.read ? 'read' : 'walk' } : { type: 'clean' })
    if (ids.length && !info.read) reveal(kindMarks[0])
  }

  // Scroll a passage into view, then place its note beside it. The passage's mark may not be on the page in the
  // first frame (a pass that lands outside a click renders a little later), so it looks again for a few frames.
  function reveal(m, tries = 6) {
    live.current.revealing = true
    requestAnimationFrame(() => {
      const el = mirrorRef.current && mirrorRef.current.querySelector(`[data-id="${m.id}"]`)
      if (!el && tries > 1) { reveal(m, tries - 1); return }
      // In a narrow pane the note docks over the lower part of the page, so the passage goes near the top.
      if (el && el.scrollIntoView) el.scrollIntoView({ block: live.current.narrow ? 'start' : 'center' })
      live.current.revealing = false
      place(); placePop()
      requestAnimationFrame(() => { place(); placePop() }) // and once more, in case the scene animates the scroll
    })
  }

  // When the pane crosses into or out of the narrow layout, bring the current passage back into view.
  useEffect(() => { if (current && card && card.type === 'walk') reveal(current) }, [narrow]) // eslint-disable-line react-hooks/exhaustive-deps

  // A proposal tried in the page (an opening, a main point, a draft) scrolls into view, wherever it sits.
  // A suggestion tried from a floating card is already beside its card, so it scrolls only as far as it must.
  useEffect(() => {
    if (!preview || !roomRef.current) return
    const floatingNow = live.current.card && FLOAT.has(live.current.card.type)
    requestAnimationFrame(() => {
      const el = roomRef.current && roomRef.current.querySelector('.cl-proposed-page')
      if (el && el.scrollIntoView) el.scrollIntoView({ block: floatingNow ? 'nearest' : live.current.narrow ? 'start' : 'center' })
    })
  }, [preview && preview.start, preview && preview.text])

  function step(delta) {
    setWalk(w => {
      if (!w) return w
      const ms = live.current.marks
      let i = w.index
      for (let n = 0; n < w.ids.length; n++) {
        i += delta
        if (i < 0 || i >= w.ids.length) break
        const m = ms.find(x => x.id === w.ids[i])
        if (m && m.status === 'open') { reveal(m); return { ...w, index: i } }
      }
      setCard({ type: w.kind === 'changes' ? 'apply' : 'end' })
      return { ...w, index: w.ids.length }
    })
  }

  function setStatus(id, status) { setMarks(ms => ms.map(m => m.id === id ? { ...m, status } : m)) }

  function done() {
    setMarks(ms => ms.filter(m => m.kind === 'kept'))
    setWalk(null); setCard(null); setPreview(null)
  }

  // The cursor goes to the start of the passage with nothing selected, and the underline shows the passage.
  // A live selection let the first key the writer pressed replace the whole sentence.
  function fixMyself(m) {
    const ta = bodyRef.current
    if (!ta) return
    const at = caretFor(m)
    ta.focus({ preventScroll: true })
    ta.setSelectionRange(at.start, at.end)
    reveal(m)
  }

  // Walk a pass's notes again from the first, after its summary: the notes come back underlined.
  function walkAgain() {
    const w = live.current.walk
    if (!w || !w.ids.length) return
    const ms = reopen(live.current.marks, w.ids)
    setMarks(ms)
    const first = ms.find(m => w.ids.includes(m.id) && m.status === 'open')
    setWalk(x => ({ ...x, index: first ? w.ids.indexOf(first.id) : 0 }))
    setCard({ type: 'walk' })
    if (first) reveal(first)
  }

  function pickAtCaret() {
    const ta = bodyRef.current
    if (!ta || !walk || ta.selectionStart !== ta.selectionEnd) return
    const m = markAt(openMarks.filter(x => x.kind !== 'kept'), ta.selectionStart)
    if (!m) return
    const i = walk.ids.indexOf(m.id)
    if (i >= 0 && walk.kind === 'read') { if (m.n && !walk.showing) setWalk(w => ({ ...w, index: i, used: null })); return }
    if (i >= 0) { setWalk(w => ({ ...w, index: i })); setCard({ type: 'walk' }) }
  }

  // ---- quick check (no model)
  function quickCheck() {
    store().set('invited', true)
    const { findings: found, quoted } = instantRead(live.current.body)
    const ms = found.map((f, i) => ({ id: `q${Date.now()}-${i}`, kind: 'finding', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.issue }))
    // The summary opens the walk ("These are questions, not rules"), on the first note, and closes it.
    startWalk(ms, { kind: 'findings', title: 'Quick check', who: 'Quick check · built in, no AI needed', local: true, summary: summarize(found, quoted), intro: true })
  }

  // Quick check on a selected passage only, from the passage tools.
  function quickCheckPassage(start, end) {
    const b = live.current.body
    const { findings: found, quoted } = instantRead(b.slice(start, end))
    const ms = found.map((f, i) => ({ id: `q${Date.now()}-${i}`, kind: 'finding', status: 'open', start: start + f.start, end: start + f.end, quote: f.quote, text: f.issue }))
    startWalk(ms, { kind: 'findings', title: 'Quick check', who: 'Quick check · your selection · built in, no AI needed', local: true, summary: summarize(found, quoted), intro: true })
  }

  // ---- editor passes (the writer's Hermes model)
  function follow(p, anchorAt) {
    setCard({ type: 'working', pass: p, at: Date.now() - (p.elapsed || 0) * 1000, anchor: anchorAt || null })
    clearInterval(pollRef.current)
    pollRef.current = setInterval(() => poll(p.id), POLL_MS)
  }

  async function poll(id) {
    let p
    try { p = await rest(`/passes/${id}`) } catch (e) {
      const err = errorOf(e)
      if (err.offline) {
        clearInterval(pollRef.current); setConn('off')
        if (GATE.claim(live.current.card, id)) setCard({ type: 'failed', title: 'Editor pass', message: "The Clearing's saving and editor are off. Your words are kept here.", retry: null })
      }
      return
    }
    if (p.status === 'running') { setCard(c => c && c.type === 'working' && c.pass.id === id ? { ...c, pass: { ...c.pass, ...p } } : c); return }
    clearInterval(pollRef.current)
    // The interval and the pass.ended event can both answer; a stopped pass or one from another piece can answer late.
    if (!GATE.claim(live.current.card, id)) return
    if (p.status === 'done') land(p)
    else if (p.status === 'stopped') setCard(p.kind === 'wording' && wordBack.current ? wordBack.current : p.kind === 'apply' ? { type: 'walk' } : null)
    else if (p.kind === 'wording' && wordBack.current) setCard({ type: 'failed', title: p.title, message: p.message, code: p.code, retry: null, back: wordBack.current })
    else if (p.kind === 'apply') setCard({ type: 'failed', title: p.title, message: p.message, code: p.code, retry: null, resume: true })
    else setCard({ type: 'failed', title: p.title, message: p.message, code: p.code, retry: FLOAT_PASSES.has(p.kind) ? null : p.target })
  }

  useEffect(() => {
    if (!(api && api.onEvent) && !host.onEvent) return undefined
    const on = (api && api.onEvent) || host.onEvent
    const off = on('plugin.clearing.pass.ended', ({ payload } = {}) => { const c = live.current.card; if (c && c.type === 'working' && payload && payload.id === c.pass.id) poll(c.pass.id) })
    return () => { clearInterval(pollRef.current); if (typeof off === 'function') off() }
  }, [])

  async function runTarget(t, opts) {
    setAsk({ open: false, q: '', sel: 0 })
    if (t.kind === 'local') return quickCheck()
    if (t.kind === 'home') { setSheet('home'); return }
    if (t.kind === 'wording' && !(opts && opts.selection)) {
      const ta = bodyRef.current
      if (ta && ta.selectionEnd > ta.selectionStart) return lookWord(ta.selectionStart, ta.selectionEnd, { suggest: true })
      setCard({ type: 'failed', title: t.title, message: 'Select the words you want other wording for, then ask.', retry: null })
      return
    }
    const back = t.kind === 'wording' ? wordBack.current : null
    if (t.kind === 'words') {
      const ta = bodyRef.current
      if (ta && ta.selectionEnd > ta.selectionStart) return lookWord(ta.selectionStart, ta.selectionEnd)
      setCard({ type: 'failed', title: 'Other words', message: 'Select a word in your piece first, or double-click it.', retry: null })
      return
    }
    const { piece: p, title: ti, body: b, conn: c } = live.current
    if (!p || p.local || c !== 'ok') { setCard({ type: 'failed', title: t.title, message: "The Clearing's editor is off. Turn on The Clearing in Settings, Plugins. Quick check still works.", retry: null, back }); return }
    if (!b.trim()) { setCard({ type: 'failed', title: t.title, message: 'The page is empty. Write a little first, then ask.', retry: null }); return }
    if (t.kind === 'across' && !(opts && opts.pieces)) { setCard({ type: 'choose', target: t, picked: [] }); return }
    const ta = bodyRef.current
    let selection = opts && (opts.selection || (t.kind === 'ask' && 'selection' in opts)) ? opts.selection
      : ta && ta.selectionEnd - ta.selectionStart > 20 && !WHOLE.has(t.kind) ? { start: ta.selectionStart, end: ta.selectionEnd } : null
    if (t.kind === 'rewrite' && !selection) {
      if (!(ta && ta.selectionEnd > ta.selectionStart)) { setCard({ type: 'failed', title: t.title, message: 'Select the sentence or paragraph you want rewritten, then ask.', retry: null }); return }
      selection = { start: ta.selectionStart, end: ta.selectionEnd }
    }
    if (t.kind === 'next' && !(opts && opts.selection)) {
      const at = live.current.caret != null ? live.current.caret : ta ? ta.selectionEnd : b.length
      selection = { start: at, end: at }
    }
    const anchorAt = (FLOAT_PASSES.has(t.kind) || t.kind === 'ask') && selection ? { start: selection.start, end: selection.end } : null
    const keep = opts && opts.keepWalk
    if (!keep) { setMarks(ms => ms.filter(m => m.kind === 'kept')); if (!back) setWalk(null); setPreview(null) }
    clearTimeout(timers.current.save); await flush()
    try {
      live.current.lastRun = { t, opts: { ...(opts || {}), selection }, retried: !!(opts && opts.retried) }
      const started = await post('/passes', { piece_id: p.id, target: t.id, title: ti, body: b, selection, pieces: opts && opts.pieces ? opts.pieces : undefined, note: opts && opts.note ? opts.note : undefined, move: opts && opts.move ? opts.move : undefined, instruction: opts && opts.instruction ? opts.instruction : undefined,
        original: opts && opts.original != null ? opts.original : undefined, current: opts && opts.current != null ? opts.current : undefined, request: opts && opts.request ? opts.request : undefined,
        item: opts && opts.item ? opts.item : undefined, why: opts && opts.why != null ? opts.why : undefined })
      started.sentBody = b
      live.current.sent = b
      follow(started, anchorAt)
      // Spot the figures and Find opportunities keep one result per piece version: the same words show it again at once.
      if (started.status === 'done') { live.current.card = { type: 'working', pass: started }; poll(started.id) }
    } catch (e) {
      const err = errorOf(e)
      setCard({ type: 'failed', title: t.title, message: err.offline ? "The Clearing's editor is off. Turn on The Clearing in Settings, Plugins." : err.detail, retry: err.status === 409 || back ? null : t.id, back })
    }
  }

  async function stop() {
    const c = live.current.card
    clearInterval(pollRef.current)
    if (c && c.pass) GATE.drop(c.pass.id)
    setCard(c && c.pass && c.pass.kind === 'wording' && wordBack.current ? wordBack.current : c && c.pass && c.pass.kind === 'apply' ? { type: 'walk' } : null)
    if (c && c.pass) post(`/passes/${c.pass.id}/stop`).catch(() => {})
  }

  function land(p) {
    const r = p.result || {}
    const scope = p.selection ? ' · your selection' : ''
    const who = p.title + scope // the model's name goes on the provenance line, on hover, and in History
    const sent = live.current.sent
    const now = live.current.body
    const moved = list => (sent && sent !== now ? followEdit(list, sent, now) : list)
    const stamp = Date.now(), model = p.model || ''
    // A note's rewritten example is shown only when it passes Quick check against the words it would replace.
    const tryOf = f => (live.current.settings.suggestions ? screenTry(f.try || '', f.quote) : '')
    // Every option breaking a Quick check rule: ask once more on the writer's behalf, then show them folded.
    const again = () => {
      const last = live.current.lastRun
      if (!last || last.retried || last.t.id !== p.target) return false
      runTarget(last.t, { ...last.opts, retried: true, keepWalk: last.opts.keepWalk })
      return true
    }
    if (p.kind === 'read') { showRead(r, { model, moved }); return }
    if (p.kind === 'figures' || p.kind === 'opps') {
      const ms = moved(p.kind === 'figures' ? figureMarks(LIB, r, stamp) : oppMarks(LIB, r, stamp)).filter(m => !m.changed)
      const none = p.kind === 'figures' ? 'Spot the figures found none of the library’s figures in this version of your piece.' : 'Find opportunities found nothing to propose in this version of your piece.'
      startWalk(ms, { kind: p.kind, title: p.title, who, model, counts: r.counts, summary: ms.length ? '' : none, cached: !!p.cached })
      return
    }
    if (p.kind === 'findings') {
      const ms = ranked(moved((r.findings || []).map((f, i) => ({ id: `f${stamp}-${i}`, kind: 'finding', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.issue, change: f.change, rank: f.rank, try: tryOf(f), unsupported: f.unsupported }))))
      startWalk(ms.map(m => m.changed ? { ...m, status: 'changed' } : m).filter(m => m.status === 'open'), { kind: 'findings', title: p.title, who, model, summary: r.summary, counts: r.counts, setAside: ms.filter(m => m.changed).length })
    } else if (p.kind === 'changes') {
      const ms = moved((r.changes || []).map((f, i) => ({ id: `c${stamp}-${i}`, kind: 'change', status: 'open', start: f.start, end: f.end, quote: f.quote, replacement: f.replacement, text: f.reason })))
      startWalk(ms.filter(m => !m.changed), { kind: 'changes', title: p.title, who, model, summary: r.summary })
    } else if (p.kind === 'note') {
      const ms = moved((r.notes || []).map((f, i) => ({ id: `n${stamp}-${i}`, kind: 'note', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.note, try: tryOf(f), unsupported: f.unsupported })))
      startWalk(ms.filter(m => !m.changed), { kind: 'note', title: p.title, who, model, summary: r.summary, question: r.question, general: r.general || [], read: true })
      if (!ms.filter(m => !m.changed).length) setCard({ type: 'read' })
    } else if (p.kind === 'wording') {
      const sel = r.selection || {}
      let c = wordBack.current && wordBack.current.start === sel.start ? wordBack.current
        : { type: 'words', phrase: !normalizeSelection(sel.text || ''), start: sel.start, end: sel.end, original: sel.text, current: sel.text, tried: [], versioned: false, result: { groups: [] } }
      if (sent && sent !== now) c = trackWord(c, sent, now)
      const got = shown(r.options || [], sel.text || '', 'text', null)
      setCard({ ...c, loading: false, suggestions: got.list, dropped: got.dropped, suggestedBy: p.model || 'your Hermes model', model })
      wordBack.current = null
      reveal({ id: 'word' })
    } else if (p.kind === 'ask' && !r.options) {
      // Your own words, without a selection: notes pinned to the piece, each with its change to try.
      const ms = ranked(moved((r.findings || []).map((f, i) => ({ id: `k${stamp}-${i}`, kind: 'finding', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.issue, change: f.change, rank: f.rank, try: tryOf(f), unsupported: f.unsupported }))))
      startWalk(ms.filter(m => !m.changed), { kind: 'findings', title: p.title, who, model, summary: r.summary, answer: r.answer })
    } else if (p.kind === 'explain') {
      // Why?: two or three plain sentences, back on the card they were asked from.
      const back = live.current.explainBack
      if (back && back.type === 'walk') { setWalk(w => (w ? { ...w, why: { id: live.current.whyFor, text: r.text || '' } } : w)); setCard({ type: 'walk' }) } else {
        setCard(back ? { ...back, why: r.text || '' } : null)
        if (back && back.choice >= 0) tryOption(back.choice, back) // the option they asked about goes back into the page
      }
      live.current.explainBack = null
    } else if (p.kind === 'rewrite' || p.kind === 'next' || p.kind === 'ask' || p.kind === 'refine') {
      const at = p.kind === 'next' ? r.at : r.selection.start, end = p.kind === 'next' ? r.at : r.selection.end
      const asTitle = p.kind === 'ask' ? 'Ask the editor' : p.kind === 'refine' ? 'Change it' : p.title
      const [m] = moved([{ id: 'x', start: at, end, quote: now.slice(at, end) }])
      if (m.changed) { setCard({ type: 'failed', title: p.title, message: 'That passage changed while your model worked. Nothing changed.', retry: null }); return }
      const got = shown(r.options || [], p.kind === 'next' ? '' : r.selection.text, 'text', again)
      if (!got) return
      const round = p.kind === 'refine' ? live.current.roundBack : null
      live.current.roundBack = null
      const first = Math.max(0, got.list.findIndex(o => !(o.unsupported && o.unsupported.length))) // a clean option first; a flagged one waits to be picked
      setCard(p.kind === 'next'
        ? { type: 'next', at: m.start, options: got.list, dropped: got.dropped, folded: got.folded, choice: -1, model, title: p.title }
        : { type: 'rewrite', kind: p.kind, instruction: r.instruction || '', start: m.start, end: m.end, original: r.selection.text, options: got.list, dropped: got.dropped, folded: got.folded, choice: got.list.length && !got.folded ? first : -1, model, title: asTitle, back: round })
      if (p.kind !== 'next' && got.list.length && !got.folded) tryOption(first, { type: 'rewrite', start: m.start, end: m.end, original: r.selection.text, options: got.list })
      reveal({ id: p.kind === 'next' ? 'caret' : 'word' })
    } else if (p.kind === 'endings') {
      const got = shown(r.options || [], r.replaces.text, 'text', again)
      if (!got) return
      setWalk({ ids: [], index: 0, kind: 'openings', title: p.title, who })
      setCard({ type: 'openings', kind: 'endings', options: got.list.map(o => ({ opening: o.text, how: o.how, unsupported: o.unsupported, flag: o.flag })), replaces: r.replaces, choice: -1, model, dropped: got.dropped })
    } else if (p.kind === 'titles') {
      const got = shown(r.options || [], live.current.title, 'text', again)
      if (!got) return
      setWalk({ ids: [], index: 0, kind: 'titles', title: p.title, who })
      setCard({ type: 'titles', options: got.list, choice: -1, model })
    } else if (p.kind === 'apply') {
      const w = live.current.walk, cur = w && live.current.marks.find(x => x.id === w.ids[w.index])
      const sel = r.selection
      const [m] = moved([{ id: 'x', start: sel.start, end: sel.end, quote: sel.text }])
      if (!cur || m.changed) {
        setCard({ type: 'failed', title: 'Show me', message: 'That passage changed while your model worked. Nothing changed.', retry: null, resume: !!cur }); return
      }
      if (r.cut) { // an opportunity whose change is a cut: struck in the page, nothing inserted, until Use this
        setMarks(ms => ms.map(x => x.id === cur.id ? { ...x, cutChange: true, try: '', unsupported: [] } : x))
        setCard({ type: 'walk' })
        showCutChange({ ...cur, start: m.start, end: m.end })
        return
      }
      const got = shown([{ text: r.text }], sel.text, 'text', again)
      if (!got) return
      setMarks(ms => ms.map(x => x.id === cur.id ? { ...x, try: r.text, unsupported: r.unsupported, flag: got.list[0].flag } : x))
      setCard({ type: 'walk' })
      showMe({ ...cur, start: m.start, end: m.end, try: r.text })
    } else if (p.kind === 'cuts') {
      const cs = moved((r.cuts || []).map((f, i) => ({ id: `x${stamp}-${i}`, kind: 'cut', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.reason, kept: false }))).filter(m => !m.changed)
      setWalk({ ids: [], index: 0, kind: 'cuts', title: p.title, who, model, summary: r.summary })
      setCard(cs.length ? { type: 'cuts', cuts: cs, focus: null } : { type: 'clean' })
    } else if (p.kind === 'openings') {
      const got = shown(r.options || [], r.replaces.text, 'opening', again)
      if (!got) return
      setWalk({ ids: [], index: 0, kind: 'openings', title: p.title, who })
      setCard({ type: 'openings', options: got.list, replaces: r.replaces, choice: -1, model, dropped: got.dropped })
    } else if (p.kind === 'flip' || p.kind === 'draft') {
      const got = shown(r.options || [], r.replaces.text, 'text', again)
      if (!got) return
      setWalk({ ids: [], index: 0, kind: p.kind, title: p.title, who })
      setCard({ type: 'flip', kind: p.kind, target: p.target, title: p.title, options: got.list, replaces: r.replaces, insert: !!r.insert, choice: -1, model, dropped: got.dropped })
    } else if (p.kind === 'voice') {
      const ms = moved((r.notes || []).map((f, i) => ({ id: `v${stamp}-${i}`, kind: 'note', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.note, judgment: f.judgment, sample: f.sample, sampleTitle: f.sample_title })))
      startWalk(ms.filter(m => !m.changed), { kind: 'note', title: p.title, who, model, summary: r.summary, question: r.question, general: [], read: true })
      if (!ms.filter(m => !m.changed).length) setCard({ type: 'read' })
    } else if (p.kind === 'panel') {
      setWalk(null); setMarks(ms => ms.filter(m => m.kind === 'kept'))
      setCard({ type: 'panel', panel: r, title: p.title, model: p.model, who, sent })
    } else if (p.kind === 'debate') {
      const c = { type: 'debate', debate: r, title: p.title, model: p.model, who, sent, at: 0 }
      setWalk(null); setCard(c); debateMarks(c, 0)
    } else if (p.kind === 'lessons' || p.kind === 'guidance') {
      const items = (p.kind === 'lessons' ? r.lessons : r.proposals) || []
      setWalk({ ids: [], index: 0, kind: p.kind, title: p.title, who, model, summary: r.summary })
      setCard(items.length || (r.questions || []).length
        ? { type: 'proposals', kind: p.kind, items: items.map(x => ({ ...x, status: 'open', draft: x.rule })), at: 0, gaps: r.gaps || [], questions: r.questions || [], summary: r.summary, kept: 0, model }
        : { type: 'clean' })
    } else if (p.kind === 'across') {
      const here = moved((r.notes || []).filter(n => n.here).map((f, i) => ({ id: `a${stamp}-${i}`, kind: 'note', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.note }))).filter(m => !m.changed)
      const c = { type: 'across', across: r, who, model }
      setMarks(ms => [...ms.filter(m => m.kind === 'kept'), ...here])
      setWalk({ ids: here.map(m => m.id), index: 0, kind: 'note', title: p.title, who, model, back: c })
      setCard(c)
    }
  }

  // ---- the panel: walk one reviewer's notes, or the passages where reviewers agree
  function walkPanel(c, which) {
    const stamp = Date.now(), now = live.current.body
    const moved = list => (c.sent && c.sent !== now ? followEdit(list, c.sent, now) : list)
    const src = c.sent || now
    let ms, name
    if (which === 'agree') {
      name = 'Where they agree'
      ms = c.panel.agreements.map((g, i) => ({ id: `g${stamp}-${i}`, kind: 'finding', status: 'open', start: g.start, end: g.end, quote: src.slice(g.start, g.end), lines: g.notes }))
    } else {
      const rev = c.panel.reviewers.find(x => x.id === which)
      name = rev.name
      ms = rev.findings.map((f, i) => ({ id: `p${stamp}-${i}`, kind: 'finding', status: 'open', start: f.start, end: f.end, quote: f.quote, text: f.issue }))
    }
    const open = moved(ms).filter(m => !m.changed)
    startWalk(open, { kind: 'findings', title: name, who: [c.title, name].filter(Boolean).join(' · '), model: c.model, back: c, setAside: ms.length - open.length })
  }

  function backTo(c) {
    setMarks(ms => ms.filter(m => m.kind === 'kept'))
    if (c.type === 'across') {
      const here = live.current.walk && live.current.walk.back === c ? live.current.walk : null
      if (here) setMarks(ms => [...ms, ...here.ids.map(id => live.current.marks.find(m => m.id === id)).filter(Boolean).map(m => ({ ...m, status: 'open' }))])
    } else setWalk(null)
    setCard(c)
  }

  function finishWalk() { const w = live.current.walk; if (w && w.back) backTo(w.back); else done() }

  // ---- the debate: four steps, each marking the passages it turns on
  function debateMarks(c, at) {
    const r = c.debate, now = live.current.body
    const sides = at === 0 ? r.sides : at === 1 ? [r.sides[0]] : at === 2 ? [r.sides[1]] : []
    const spans = []
    for (const s of sides) for (const q of [s.passage, ...(at ? s.quotes : [])]) if (q && !spans.some(x => x.start < q.end && q.start < x.end)) spans.push(q)
    let ms = spans.map((q, i) => ({ id: `d${Date.now()}-${i}`, kind: 'note', status: 'open', start: q.start, end: q.end, quote: q.quote }))
    if (c.sent && c.sent !== now) ms = followEdit(ms, c.sent, now).filter(m => !m.changed)
    setMarks(m => [...m.filter(x => x.kind === 'kept'), ...ms])
    if (ms[0]) reveal(ms[0])
  }

  function debateStep(at) {
    const c = { ...live.current.card, at }
    setCard(c); debateMarks(c, at)
  }

  // ---- lessons and guidance: the writer keeps each proposed rule or skips it
  async function keepProposal() {
    const c = live.current.card, it = c.items[c.at], p = live.current.piece
    try {
      await post('/guidance', { section: it.section, text: it.draft, evidence: it.evidence, source: c.kind === 'lessons' ? 'lesson' : 'onboarding', piece_id: p && !p.local ? p.id : null })
      nextProposal('kept')
    } catch (e) { const err = errorOf(e); setCard({ ...c, error: err.offline ? "The Clearing's saving is off, so the rule can't be kept yet." : err.detail }) }
  }
  function nextProposal(status) {
    setCard(c => ({ ...c, items: c.items.map((x, i) => i === c.at ? { ...x, status } : x), at: c.at + 1, error: null, kept: c.kept + (status === 'kept' ? 1 : 0) }))
  }

  // ---- what the writer did with the editor's suggestions: evidence for lessons later
  function logDecisions(items) {
    const p = live.current.piece
    if (p && !p.local && live.current.conn === 'ok' && items.length) post(`/pieces/${p.id}/decisions`, { items }).catch(() => {})
  }

  // ---- three ways to say it, and drafts from notes: tried in the page, kept only on the writer's click
  function chooseFlip(i) {
    const c = live.current.card
    setCard({ ...c, choice: i })
    setPreview(i >= 0 ? { start: c.replaces.start, end: c.replaces.end, text: c.options[i].text, insert: c.insert } : null)
  }

  function keepFlip() {
    const c = live.current.card, b = live.current.body, o = c.options[c.choice]
    if (b.slice(c.replaces.start, c.replaces.end) !== c.replaces.text) {
      setPreview(null)
      setCard({ type: 'failed', title: c.title, message: c.kind === 'draft' ? 'Your notes changed while the editor worked. Nothing changed.' : 'That part of your piece changed while the editor worked. Nothing changed.', retry: c.target })
      return
    }
    const p = live.current.piece
    if (p && !p.local) post(`/pieces/${p.id}/versions`, { reason: c.kind === 'draft' ? 'draft' : 'flip', title: live.current.title, body: b }).catch(() => {})
    const from = c.replaces.start + (c.insert ? 2 : 0)
    setWalk(null); setCard(null)
    insertNative(c.replaces.start, c.replaces.end, c.insert ? `\n\n${o.text}` : o.text, () => addSpan(from, from + o.text.length, c.kind === 'draft' ? 'draft' : 'flip', c.model))
    logDecisions([{ kind: c.kind === 'draft' ? 'draft' : 'flip', original: c.replaces.text, chosen: o.text, choice: 'chose', model: c.model }])
  }

  // ---- suggested text: shown marked as a suggestion, put in only on the writer's click, recorded for History
  function useSuggested({ start, end, at, text, kind, original, model }) {
    const b = live.current.body, p = live.current.piece
    if (p && !p.local && live.current.conn === 'ok') post(`/pieces/${p.id}/versions`, { reason: 'suggestion', title: live.current.title, body: b }).catch(() => {})
    let s0 = start, e0 = end, ins = text, span = { start, end: start + text.length }
    if (at != null) { const j = joinAt(b, at, text); s0 = e0 = at; ins = j.body.slice(at, at + j.body.length - b.length); span = j.span }
    insertNative(s0, e0, ins, () => addSpan(span.start, span.end, kind, model))
    logDecisions([{ kind, original: original || '', chosen: text, choice: 'chose', model: model || '' }])
    return span
  }

  // Every suggestion goes in through the textarea's own editing path ; it is one step in the room's history, so Undo
  // takes it out and Redo puts it back, the way the writer's own typing does. While a suggestion is shown in the page the textarea isn't there,
  // so the insert waits for the frame that brings it back.
  function insertNative(start, end, text, after) {
    // What the room looked like before this change, for Undo: taken now, before the change's own status updates land.
    const snap = { marks: live.current.marks, spans: live.current.spans, walk: live.current.walk, card: live.current.card }
    live.current.pendingInsert = { start, end, text, after, snap }
    if (live.current.preview) setPreview(null)
    else setTimeout(runInsert, 0)
  }
  function runInsert() {
    const job = live.current.pendingInsert, ta = bodyRef.current
    if (!job || !ta) return
    live.current.pendingInsert = null
    live.current.snap = job.snap
    live.current.replaying = !!job.replay
    ta.focus({ preventScroll: true })
    ta.setSelectionRange(job.start, job.end)
    let ok = false
    live.current.typedIn = false
    live.current.inserting = true
    try { ok = document.execCommand('insertText', false, job.text) } catch (e) { ok = false }
    if (!ok || ta.value.slice(job.start, job.start + job.text.length) !== job.text) {
      const b = live.current.body
      changeBody(b.slice(0, job.start) + job.text + b.slice(job.end)) // a host without execCommand: no undo, same words
    } else if (!live.current.typedIn) changeBody(ta.value) // the input event didn't reach React inside this commit
    live.current.inserting = false
    live.current.snap = null
    live.current.replaying = false
    if (job.after) job.after()
  }
  // Outside React's own render and event handling, so the browser's input event reaches the page like typing does.
  useEffect(() => { if (live.current.pendingInsert && !preview) setTimeout(runInsert, 0) })

  // The model's words in the piece, each its own span, never just the last one.
  function addSpan(start, end, kind, model) {
    const id = `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    setSpans(ss => [...ss.filter(s => s.end <= start || s.start >= end), { id, start, end, quote: live.current.body.slice(start, end), kind, model: model || '', fresh: true }])
    setTimeout(() => setSpans(ss => ss.map(s => (s.id === id ? { ...s, fresh: false } : s))), 2200)
  }

  // The editor's ranked changes come first, numbered 1 to 3 in the page and on the card; a pass with no ranks keeps its
  // page order and draws no numerals.
  function ranked(list) {
    if (!list.some(m => Number.isFinite(m.rank))) return list
    return [...list].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((m, i) => ({ ...m, n: i + 1 }))
  }

  // Read my piece: the verdict, three ranked changes underlined and numbered in the page, and Cut this first. The
  // sample's stored read is pinned by its words, so it opens with no wait; a live read follows the edits typed while it ran.
  function showRead(r, { model, moved, sample = false }) {
    const b = live.current.body, stamp = Date.now()
    const pin = c => {
      if (!c || !c.quote) return null
      if (Number.isInteger(c.start) && b.slice(c.start, c.end) === c.quote) return { start: c.start, end: c.end }
      const i = b.indexOf(c.quote)
      return i >= 0 && b.indexOf(c.quote, i + 1) < 0 ? { start: i, end: i + c.quote.length } : null
    }
    const v = readView(r)
    let ms = v.changes.map(c => ({ id: `r${stamp}-${c.n}`, kind: 'finding', status: 'open', start: c.start, end: c.end, quote: c.quote, text: c.why || '', change: c.headline, rank: c.rank, n: c.n,
      try: live.current.settings.suggestions ? screenTry(c.try || '', c.quote) : '', unsupported: c.unsupported || [], cutChange: c.cut === true && live.current.settings.suggestions, pairNext: c.pairNext || null, pairedWith: c.pairedWith || null }))
    ms = sample || !moved ? ms.map(m => ({ ...m, ...pin(m) })).filter(m => Number.isInteger(m.start)) : moved(ms).filter(m => !m.changed)
    const cutAt = pin(v.cut)
    const cut = cutAt ? { ...v.cut, ...cutAt } : null
    const keepAt = pin(v.keep)
    const keepMark = keepAt && !ms.some(m => m.start < keepAt.end && keepAt.start < m.end) ? [{ id: `r${stamp}-keep`, kind: 'keep', status: 'open', ...keepAt, quote: v.keep.quote }] : []
    setMarks(mk => [...mk.filter(m => m.kind === 'kept'), ...ms, ...keepMark])
    setWalk({ ids: ms.map(m => m.id), index: 0, kind: 'read', title: 'Read my piece', who: 'Read my piece', model, result: r, sample, cut })
    setCard({ type: 'readresult' })
    setPreview(null)
    if (ms[0]) reveal(ms[0])
  }
  function focusChange(rank) {
    const w = live.current.walk
    if (!w) return
    const i = w.ids.findIndex(id => { const m = live.current.marks.find(x => x.id === id); return m && m.n === rank })
    if (i < 0) return
    if (w.showing) backToMine()
    setWalk(x => ({ ...x, index: i, used: null }))
    reveal(live.current.marks.find(x => x.id === w.ids[i]))
  }
  // Cut this first: the words struck in the page, nothing inserted, until the writer uses it.
  function showCut(c) {
    const b = live.current.body
    if (!c || b.slice(c.start, c.end) !== c.quote) return
    // A clause cut from the middle of a sentence takes its leading comma with it ("number, in the same way ... ."
    // leaves "number."), and a sentence cut whole takes the space after it.
    const start = /,\s$/.test(b.slice(Math.max(0, c.start - 2), c.start)) && /^[.;:!?]/.test(b.slice(c.end)) ? c.start - 2 : c.start
    const end = start === c.start && b[c.end] === ' ' && (c.start === 0 || /[\s.!?]/.test(b[c.start - 1])) ? c.end + 1 : c.end
    setPreview({ inline: true, start, end: start, text: '', struck: b.slice(start, end), body: b.slice(0, start) + b.slice(end) })
    setWalk(w => (w ? { ...w, showing: 'cut', cutStart: start, cutEnd: end } : w))
    requestAnimationFrame(() => { const el = roomRef.current && roomRef.current.querySelector('.cl-roomread'); if (el) el.scrollTop = el.scrollHeight })
  }
  // A ranked change that is a cut (round 6, mostly in essays): the words struck in the page, nothing inserted; a whole
  // paragraph takes the blank line after it.
  function cutRange(b, start, end) {
    const para = (start === 0 || b.slice(Math.max(0, start - 2), start) === '\n\n') && (end === b.length || b.slice(end, end + 2) === '\n\n')
    if (para) return { start, end: end === b.length ? end : end + 2 }
    const s = /,\s$/.test(b.slice(Math.max(0, start - 2), start)) && /^[.;:!?]/.test(b.slice(end)) ? start - 2 : start
    return { start: s, end: s === start && b[end] === ' ' && (start === 0 || /[\s.!?]/.test(b[start - 1])) ? end + 1 : end }
  }
  function showCutChange(m) {
    const b = live.current.body
    if (b.slice(m.start, m.end) !== m.quote) return
    const r = cutRange(b, m.start, m.end)
    setPreview({ inline: true, start: r.start, end: r.start, text: '', struck: b.slice(r.start, r.end), body: b.slice(0, r.start) + b.slice(r.end) })
    setWalk(w => (w ? { ...w, showing: m.id, cutStart: r.start, cutEnd: r.end } : w))
  }
  function useCutChange(m) {
    const w = live.current.walk, b = live.current.body
    if (b.slice(m.start, m.end) !== m.quote) { setPreview(null); setStatus(m.id, 'changed'); return }
    const p = live.current.piece
    if (p && !p.local && live.current.conn === 'ok') post(`/pieces/${p.id}/versions`, { reason: 'suggestion', title: live.current.title, body: b }).catch(() => {})
    insertNative(w.cutStart, w.cutEnd, '')
    logDecisions([{ kind: 'cut', original: m.quote, chosen: '', choice: 'cut', model: w.model || '' }])
    setStatus(m.id, 'used')
    setWalk(x => ({ ...x, showing: null, used: m.id }))
  }
  function useCut() {
    const w = live.current.walk, c = w && w.cut, b = live.current.body
    if (!c || b.slice(c.start, c.end) !== c.quote) { setPreview(null); return }
    const p = live.current.piece
    if (p && !p.local && live.current.conn === 'ok') post(`/pieces/${p.id}/versions`, { reason: 'suggestion', title: live.current.title, body: b }).catch(() => {})
    insertNative(w.cutStart != null ? w.cutStart : c.start, w.cutEnd || c.end, '')
    logDecisions([{ kind: 'cut', original: c.quote, chosen: '', choice: 'cut', model: w.model || '' }])
    setWalk(x => ({ ...x, showing: null, cut: null, used: 'cut' }))
  }
  function startSample() {
    store().set('welcomed', true)
    setWelcome(false)
    const sr = live.current.sampleRead, p = live.current.piece
    if (sr && p && p.sample) showRead(sr.result, { model: sr.model || '', sample: true })
    else runTarget(TARGETS.find(x => x.id === 'read'))
  }
  function closeWelcome() { store().set('welcomed', true); setWelcome(false) }

  // Show me: a note's rewritten example, tried in the page in place of the words it is about.
  function showMe(m) {
    const b = live.current.body
    if (!m || !m.try || b.slice(m.start, m.end) !== m.quote) return
    let body2 = b.slice(0, m.start) + m.try + b.slice(m.end), also = null
    const t = partnerOf(m)
    if (t && t.start >= m.end) { // the trim that goes with a move, struck in the same preview (it goes in with Use this)
      const r = t.cutChange || !t.try ? { ...cutRange(b, t.start, t.end), text: '' } : { start: t.start, end: t.end, text: t.try }
      const d = m.try.length - (m.end - m.start), at = r.start + d
      also = { start: at, struck: b.slice(r.start, r.end), text: r.text }
      body2 = body2.slice(0, at) + r.text + body2.slice(r.end + d)
    }
    setPreview({ inline: true, start: m.start, end: m.start + m.try.length, text: m.try, struck: m.quote, body: body2, also })
    setWalk(w => (w ? { ...w, showing: m.id } : w))
  }
  function showMeFor(m) {
    if (m.try) { showMe(m); return }
    runTarget(TARGETS.find(x => x.id === 'apply'), { selection: { start: m.start, end: m.end }, note: m.text || '', keepWalk: true })
  }
  function useShown(m) {
    const w = live.current.walk
    if (live.current.body.slice(m.start, m.end) !== m.quote) { setPreview(null); setWalk(x => ({ ...x, showing: null })); setStatus(m.id, 'changed'); return }
    useSuggested({ start: m.start, end: m.end, text: m.try, kind: w && w.kind === 'read' ? 'read' : 'note', original: m.quote, model: w && w.model })
    setStatus(m.id, 'used')
    setWalk(x => ({ ...x, showing: null, used: m.id, changeOpen: false }))
  }
  // The move and its trim in one Use this: the later edit goes in first, so the earlier one's place in the piece
  // holds; both are one edit and one step in the room's history, so one Undo takes both out.
  function partnerOf(m) {
    const w = live.current.walk
    if (!w || !m || !m.pairNext) return null
    const t = live.current.marks.find(x => w.ids.includes(x.id) && x.n === m.pairNext)
    const b = live.current.body
    if (!t || t.status !== 'open' || b.slice(t.start, t.end) !== t.quote || !(t.try || t.cutChange)) return null
    return t.end <= m.start || t.start >= m.end ? t : null
  }
  function usePair(m, t) {
    const w = live.current.walk, b = live.current.body
    if (b.slice(m.start, m.end) !== m.quote || !t) { useShown(m); return }
    const tr = t.cutChange || !t.try ? { ...cutRange(b, t.start, t.end), text: '' } : { start: t.start, end: t.end, text: t.try }
    const mv = { start: m.start, end: m.end, text: m.try }
    if (!(tr.end <= mv.start || tr.start >= mv.end)) { useShown(m); return }
    const [first, second] = mv.start < tr.start ? [mv, tr] : [tr, mv]
    const p = live.current.piece
    if (p && !p.local && live.current.conn === 'ok') post(`/pieces/${p.id}/versions`, { reason: 'suggestion', title: live.current.title, body: b }).catch(() => {})
    const model = w && w.model
    // One edit from the start of the first to the end of the second, so one Undo takes both out. The words between
    // go back in unchanged, and the marks on them are found again by their quotes.
    const d = first.text.length - (first.end - first.start)
    insertNative(first.start, second.end, first.text + b.slice(first.end, second.start) + second.text, () => {
      if (first.text) addSpan(first.start, first.start + first.text.length, 'read', model)
      if (second.text) addSpan(second.start + d, second.start + d + second.text.length, 'read', model)
    })
    logDecisions([{ kind: 'read', original: m.quote, chosen: m.try, choice: 'chose', model: model || '' },
      { kind: t.cutChange || !t.try ? 'cut' : 'read', original: t.quote, chosen: tr.text, choice: t.cutChange || !t.try ? 'cut' : 'chose', model: model || '' }])
    setStatus(m.id, 'used')
    setStatus(t.id, 'used')
    setWalk(x => ({ ...x, showing: null, used: m.id, usedPair: t.id, changeOpen: false }))
  }
  // After Use this: on to the next open change, or the end of the walk.
  function nextChange() {
    const w = live.current.walk
    setWalk(x => ({ ...x, used: null, usedPair: null }))
    if (w && w.kind === 'read') {
      const open = w.ids.map(id => live.current.marks.find(m => m.id === id)).find(m => m && m.status === 'open')
      if (open) focusChange(open.n)
      return
    }
    step(1)
  }
  function backToMine() { setPreview(null); setWalk(w => (w ? { ...w, showing: null, changeOpen: false } : w)) }

  // A rewrite or a next sentence: hovering or choosing one shows it in the page, marked; Use puts it in.
  function tryOption(i, given) {
    const c = given || live.current.card, b = live.current.body
    if (!c || (c.type !== 'rewrite' && c.type !== 'next')) return
    const text = i >= 0 ? (c.edit != null && i === c.choice ? c.edit : c.options[i].text) : null
    if (text == null) { setPreview(null); return }
    if (c.type === 'next') {
      const j = joinAt(b, c.at, text)
      setPreview({ inline: true, start: j.span.start, end: j.span.end, text, body: j.body })
    } else setPreview({ inline: true, start: c.start, end: c.start + text.length, text, struck: c.original, body: b.slice(0, c.start) + text + b.slice(c.end) })
  }
  function useOption() {
    const c = live.current.card, b = live.current.body
    const text = (c.edit != null ? c.edit : c.options[c.choice] && c.options[c.choice].text || '').trim()
    if (!text) return
    if (c.type === 'rewrite' && b.slice(c.start, c.end) !== c.original) { setPreview(null); setCard({ type: 'failed', title: c.title, message: 'That passage changed since the suggestions came. Nothing changed.', retry: null }); return }
    useSuggested(c.type === 'next' ? { at: c.at, text, kind: 'next', model: c.model } : { start: c.start, end: c.end, text, kind: c.kind === 'ask' ? 'ask' : 'rewrite', original: c.original, model: c.model })
    setCard({ type: 'used' }) // stays, with its Undo, until the writer's next change
  }
  function keepMine() { setPreview(null); setCard(null); bodyRef.current && bodyRef.current.focus({ preventScroll: true }) }

  // Change it: Shorter, Plainer, Keep my rhythm, a request in the writer's words, or Why?. Follow-ups never touch
  // the page; each round's options replace the card's, and the round before stays one click back.
  function changeIt(base, current, request) {
    const sel = { start: base.start, end: base.end }
    const t = TARGETS.find(x => x.id === (request === 'why' ? 'explain' : 'refine')) || { id: request === 'why' ? 'explain' : 'refine', kind: request === 'why' ? 'explain' : 'refine', title: request === 'why' ? 'Why?' : 'Change it' }
    if (request === 'why') live.current.explainBack = live.current.card
    else live.current.roundBack = live.current.card && live.current.card.type === 'rewrite' ? live.current.card : null
    setPreview(null)
    runTarget(t, { selection: sel, original: base.original, current, request: request === 'why' ? undefined : request, keepWalk: true })
  }

  function useTitle() {
    const c = live.current.card, o = c.options[c.choice], p = live.current.piece
    if (!o) return
    if (p && !p.local && live.current.conn === 'ok') post(`/pieces/${p.id}/versions`, { reason: 'suggestion', title: live.current.title, body: live.current.body }).catch(() => {})
    logDecisions([{ kind: 'title', original: live.current.title, chosen: o.text, choice: 'chose', model: c.model }])
    changeTitle(o.text)
    setWalk(null); setCard(null)
  }

  async function toggleVoice() {
    const p = live.current.piece
    setMenu(false)
    act(async () => {
      const saved = await post(`/pieces/${p.id}/voice`, { on: !p.voice })
      setPiece(x => ({ ...x, voice: saved.voice }))
      host.notify && host.notify({ kind: 'info', message: saved.voice ? 'This piece is now a voice sample. Voice check and Build your writing guidance read it.' : 'This piece is no longer a voice sample.' })
    })
  }

  // ---- change records
  function applyKept() {
    const kept = live.current.marks.filter(m => m.kind === 'change' && m.status === 'kept')
    logDecisions(live.current.marks.filter(m => m.kind === 'change' && (m.status === 'kept' || m.status === 'skipped'))
      .map(m => ({ kind: 'change', original: m.quote, chosen: m.replacement || '', choice: m.status, model: (live.current.walk && live.current.walk.model) || '' })))
    const b = live.current.body
    const { body: next, applied } = applyChanges(b, kept)
    const p = live.current.piece
    if (applied && p && !p.local) post(`/pieces/${p.id}/versions`, { reason: 'before_changes', title: live.current.title, body: b }).catch(() => {})
    if (applied) changeBody(next)
    done()
    host.notify && host.notify({ kind: 'success', message: applied ? `Applied ${plural(applied, 'change', 'changes')} you kept.` : 'Nothing changed.' })
  }

  // ---- proposed cuts
  function toggleCut(id) { setCard(c => ({ ...c, focus: id, cuts: c.cuts.map(x => x.id === id ? { ...x, kept: !x.kept } : x) })) }

  function acceptCuts() {
    const c = live.current.card, b = live.current.body
    const { body: next, applied } = applyCuts(b, c.cuts)
    logDecisions(c.cuts.map(x => ({ kind: 'cut', original: x.quote, chosen: x.kept ? x.quote : '', choice: x.kept ? 'protected' : 'cut' })))
    const p = live.current.piece
    if (applied && p && !p.local) post(`/pieces/${p.id}/versions`, { reason: 'cut', title: live.current.title, body: b }).catch(() => {})
    if (applied) changeBody(next)
    done()
    host.notify && host.notify({ kind: 'success', message: applied ? `Cut ${plural(applied, 'passage', 'passages')}. The longer draft is in History.` : 'Nothing changed.' })
  }

  // ---- openings
  function choose(i) {
    const c = live.current.card
    setCard({ ...c, choice: i })
    setPreview(i >= 0 ? { start: c.replaces.start, end: c.replaces.end, text: c.options[i].opening } : null)
  }

  function keepOpening() {
    const c = live.current.card
    const b = live.current.body
    const ending = c.kind === 'endings'
    if (b.slice(c.replaces.start, c.replaces.end) !== c.replaces.text) {
      setPreview(null)
      setCard({ type: 'failed', title: ending ? 'Propose endings' : 'Propose openings', message: ending ? 'Your ending changed while the editor worked. Nothing changed.' : 'Your opening changed while the editor worked. Nothing changed.', retry: ending ? 'endings' : 'openings' })
      return
    }
    const p = live.current.piece
    if (p && !p.local) post(`/pieces/${p.id}/versions`, { reason: ending ? 'suggestion' : 'before_opening', title: live.current.title, body: b }).catch(() => {})
    const chosen = c.options[c.choice].opening
    logDecisions([{ kind: ending ? 'ending' : 'opening', original: c.replaces.text, chosen, choice: 'chose', model: c.model }])
    setWalk(null); setCard(null)
    insertNative(c.replaces.start, c.replaces.end, chosen, () => addSpan(c.replaces.start, c.replaces.start + chosen.length, ending ? 'ending' : 'opening', c.model))
  }

  // ---- better words (the dictionary, no model)
  function lookWord(start, end, opts) {
    const b = live.current.body
    let s0 = start, e0 = end
    while (s0 < e0 && WORD_EDGE.test(b[s0])) s0++
    while (e0 > s0 && WORD_EDGE.test(b[e0 - 1])) e0--
    const text = b.slice(s0, e0)
    const q = normalizeSelection(text)
    if (!q) {
      if (!/\p{L}/u.test(text)) { setCard({ type: 'failed', title: 'Other words', message: 'Select a word or a phrase in your piece first.', retry: null }); return }
      if (text.length > 600) { setCard({ type: 'failed', title: 'Suggest wording', message: 'Select a sentence or less for wording suggestions.', retry: null }); return }
      const phrase = { type: 'words', phrase: true, start: s0, end: e0, original: text, current: text, tried: [], versioned: false, loading: false, result: { groups: [] } }
      setCard(phrase); reveal({ id: 'word' })
      if (opts && opts.suggest) suggest(phrase)
      return
    }
    const s = s0 + text.indexOf(q), e = s + q.length
    const c0 = live.current.card
    const again = c0 && c0.type === 'words' && !c0.moved && c0.start === s && c0.end === e
    const base = again ? c0 : { type: 'words', start: s, end: e, original: q, current: q, tried: [], versioned: false }
    setCard({ ...base, loading: true, result: null, offline: false })
    reveal({ id: 'word' })
    if (opts && opts.suggest) { suggest({ ...base, loading: false, result: { groups: [] } }); return }
    THESAURUS.lookup(again ? c0.original : q).then(result => {
      setCard(c => (c && c.type === 'words' && c.start === s ? { ...c, loading: false, result, offline: !result.groups.length && shardFailed } : c))
    })
  }

  // Suggest wording: the writer's model offers other ways to say the selected words; they land in the word card.
  const wordBack = useRef(null)
  function suggest(c) {
    wordBack.current = { ...c, suggestions: null }
    runTarget(TARGETS.find(x => x.id === 'wording'), { selection: { start: c.start, end: c.end } })
  }

  function trackWord(c, prev, next) {
    const [m] = followEdit([{ id: 'word', start: c.start, end: c.end, quote: c.current }], prev, next)
    return m.changed ? { ...c, moved: true } : { ...c, start: m.start, end: m.end }
  }

  function tryWord(w) {
    const c = live.current.card, b = live.current.body
    if (!c || c.type !== 'words') return
    if (c.moved || b.slice(c.start, c.end) !== c.current) { setCard({ ...c, moved: true }); return }
    if (w === c.current) return
    if (c.suggestions && c.suggestions.some(o => o.text === w)) setCard(x => ({ ...x, fromModel: true }))
    const p = live.current.piece
    if (!c.versioned && p && !p.local && live.current.conn === 'ok') post(`/pieces/${p.id}/versions`, { reason: 'word', title: live.current.title, body: b }).catch(() => {})
    const span = { start: c.start, end: c.start + w.length }
    const fromModel = !!(c.suggestions && c.suggestions.some(o => o.text === w))
    insertNative(c.start, c.end, w, () => setSpans(ss => fromModel
      ? [...ss.filter(s => s.end <= span.start || s.start >= span.end), { id: `s${Date.now()}`, start: span.start, end: span.end, quote: w, kind: 'wording', model: c.model || '' }]
      : ss.filter(s => s.end <= span.start || s.start >= span.end)))
    setCard({ ...c, end: span.end, current: w, tried: w === c.original || c.tried.includes(w) ? c.tried : [...c.tried, w], versioned: true })
    requestAnimationFrame(() => {
      const ta = bodyRef.current
      if (ta && document.activeElement === ta) ta.setSelectionRange(span.start, span.end)
      reveal({ id: 'word' })
    })
  }

  function onDouble() {
    const ta = bodyRef.current, c = live.current.card
    if (!ta || ta.selectionEnd <= ta.selectionStart || (c && BUSY_CARDS.has(c.type))) return
    lookWord(ta.selectionStart, ta.selectionEnd)
  }

  // A selection made with the pointer gets the passage tools beside it (a double-click opens other words instead).
  function onPointerUp(e) {
    const ta = bodyRef.current, c = live.current.card
    if (!ta || e.detail === 2) return
    live.current.caret = ta.selectionEnd
    if (ta.selectionEnd <= ta.selectionStart) { if (c && c.type === 'tools') setCard(null); return }
    if (c && (BUSY_CARDS.has(c.type) || c.type === 'words')) return
    const s = ta.selectionStart, en = ta.selectionEnd, text = live.current.body.slice(s, en)
    if (!text.trim()) return
    setCard({ type: 'tools', start: s, end: en, word: toolAt(live.current.body, s, en) === 'word' })
  }

  // mod+shift+E: the tool for what is under the cursor: other words for a word, the passage tools for a
  // selection, a next sentence in a gap.
  function openTool() {
    const ta = bodyRef.current, b = live.current.body
    if (!ta) return
    const s = ta.selectionStart, en = ta.selectionEnd
    const kind = toolAt(b, s, en)
    if (kind === 'word') { const w = en > s ? { start: s, end: en } : wordAround(b, s); if (w) lookWord(w.start, w.end); return }
    if (kind === 'passage') { setCard({ type: 'tools', start: s, end: en, word: false }); reveal({ id: 'word' }); return }
    if (!live.current.settings.suggestions) { setCard({ type: 'failed', title: 'Suggest a next sentence', message: 'Suggested text is off for this room. Turn it on in The room, in the title menu, to see suggestions.', retry: null }); return }
    live.current.caret = s
    runTarget(TARGETS.find(x => x.id === 'next'), { selection: { start: s, end: s } })
  }

  // ---- pieces
  async function act(fn) {
    try { await fn() } catch (e) {
      const err = errorOf(e)
      setMenu(false)
      setCard({ type: 'failed', title: 'The Clearing', message: err.offline ? "The Clearing's saving is off. Turn on The Clearing in Settings, Plugins." : err.detail, retry: null })
    }
  }
  const newPiece = () => act(async () => { await flush(); const p = await post('/pieces', {}); open(p, (await rest('/pieces')).pieces); setMenu(false); setTimeout(() => titleRef.current && titleRef.current.focus(), 0) })
  const openPiece = id => act(async () => { await flush(); const p = await rest(`/pieces/${id}`); open(p); setMenu(false) })
  const trashPiece = () => act(async () => { await flush(); const r = await post(`/pieces/${piece.id}/trash`); open(r.current, r.pieces); setTrash(t => t + 1); setMenu(false); host.notify && host.notify({ kind: 'info', message: 'Moved to the trash. Restore it from the title menu.' }) })
  const restorePiece = id => act(async () => { const p = await post(`/pieces/${id}/restore`); open(p, (await rest('/pieces')).pieces); setTrash(t => Math.max(0, t - 1)); setSheet(null) })

  async function openFile(file) {
    if (!file) return
    setBring(false)
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      if (file.size > 12 * 1024 * 1024) { setCard({ type: 'failed', title: 'Bring in a PDF', message: 'That PDF is larger than 12 MB. Open a shorter PDF, or the pages you need.', retry: null }); return }
      let data = ''
      try { data = toBase64(new Uint8Array(await file.arrayBuffer())) } catch (e) { setCard({ type: 'failed', title: 'Bring in a PDF', message: "The Clearing couldn't read that file. Try again.", retry: null }); return }
      setCard({ type: 'busy', title: 'Bring in a PDF', say: 'Reading the PDF' })
      act(async () => {
        await flush()
        const r = await postLong('/import/pdf', { name: file.name, data })
        const p = await post('/pieces', { title: r.title, body: r.body, imported: true })
        open(p, (await rest('/pieces')).pieces); setMenu(false)
        host.notify && host.notify({ kind: 'info', message: r.stopped ? 'Opened the first part of the PDF. It was too long to read all at once; the rest is in the original.' : 'Opened the words from the PDF. Pictures, layout and links stay in the original.' })
      })
      return
    }
    if (file.size > 4 * 1024 * 1024) { setCard({ type: 'failed', title: 'Open a file', message: 'That file is larger than 4 MB. Open a shorter file, or paste a section.', retry: null }); return }
    if (/\.docx$/i.test(file.name)) {
      let data = ''
      try { data = toBase64(new Uint8Array(await file.arrayBuffer())) } catch (e) { setCard({ type: 'failed', title: 'Open a file', message: "The Clearing couldn't read that file. Try again.", retry: null }); return }
      act(async () => {
        await flush()
        const r = await post('/import/docx', { name: file.name, data })
        const p = await post('/pieces', { title: r.title, body: r.body, imported: true })
        open(p, (await rest('/pieces')).pieces); setMenu(false)
        host.notify && host.notify({ kind: 'info', message: 'Opened the words from the Word file. Comments, images and formatting stay in the original.' })
      })
      return
    }
    let text = ''
    try { text = await file.text() } catch (e) { setCard({ type: 'failed', title: 'Open a file', message: "The Clearing couldn't read that file. Try a .md or .txt file.", retry: null }); return }
    if (/\u0000/.test(text)) { setCard({ type: 'failed', title: 'Open a file', message: "That file isn't plain text. Open a .md, .txt, .docx or .pdf file.", retry: null }); return }
    const { title: t, body: b } = fromFile(file.name, text)
    act(async () => { await flush(); const p = await post('/pieces', { title: t, body: b, imported: true }); open(p, (await rest('/pieces')).pieces); setMenu(false) })
  }

  // ---- bring in: files, a link, dictation, pasted text
  const ACCEPT = {
    word: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: '.pdf,application/pdf',
    text: '.md,.markdown,.txt,text/plain,text/markdown',
    any: '.md,.markdown,.txt,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  function pickFile(kind) {
    setBring(false); setMenu(false)
    const el = fileRef.current
    if (!el) return
    el.accept = ACCEPT[kind] || ACCEPT.any
    el.click()
  }

  // Words the writer brought in, put at the cursor as their own paragraph(s), or in a sentence for dictation.
  function insertAtCursor(text, block) {
    const b = live.current.body
    const at = Math.min(b.length, live.current.caret != null ? live.current.caret : b.length)
    if (!block) { const j = joinAt(b, at, text); changeBody(j.body); return j.span }
    const before = b.slice(0, at).replace(/[ \t]+$/, ''), after = b.slice(at).replace(/^[ \t]+/, '')
    const lead = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const tail = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    const t = String(text).trim()
    changeBody(before + lead + t + tail + after)
    return { start: before.length + lead.length, end: before.length + lead.length + t.length }
  }

  async function newPieceFrom(t, b, sourceUrl) {
    await act(async () => { await flush(); const p = await post('/pieces', { title: t, body: b, imported: true, ...(sourceUrl ? { source_url: sourceUrl } : {}) }); open(p, (await rest('/pieces')).pieces); setSheet(null) })
  }

  // ---- dictation: the page records; the backend turns it into text with Hermes's own speech-to-text
  const sendOk = useRef(null) // the service the writer agreed to send recordings to, this session
  // Where talk-it-through goes, asked once the backend is on: hidden when there is no speech-to-text, "Typed out
  // privately" when it stays on the computer, and the service's name when it doesn't.
  const [speech, setSpeech] = useState(null)
  useEffect(() => { if (conn === 'ok') rest('/dictation').then(setSpeech, () => setSpeech(null)) }, [conn])
  const speechLine = !speech ? '' : speech.local === true ? 'Typed out privately. Nothing is sent.' : `Sent to ${speech.label || 'the speech-to-text set up in Hermes'} to type out`
  function dictationFailed(message) { setRec({ phase: 'idle' }); setCard({ type: 'failed', title: 'Talk it through', message, retry: null }) }
  async function dictate() {
    const r = live.current.rec
    if (r.phase === 'recording') { stopRecording(); return }
    if (r.phase !== 'idle') return
    setBring(false)
    const { piece: p, conn: c } = live.current
    if (!p || p.local || c !== 'ok') { dictationFailed("Talking it through needs The Clearing turned on. Turn it on in Settings, Plugins."); return }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') { dictationFailed("This version of Hermes can't record from a microphone in The Clearing."); return }
    if (bodyRef.current && live.current.caret == null) live.current.caret = bodyRef.current.selectionEnd
    setRec({ phase: 'starting' })
    let st
    try { st = await rest('/dictation') } catch (e) { dictationFailed(errorOf(e).detail); return }
    if (!st.ready) { dictationFailed(st.message); return }
    setSpeech(st)
    if (st.press_first && sendOk.current !== st.provider) { setRec({ phase: 'idle' }); setCard({ type: 'dictation', label: st.label, provider: st.provider }); return }
    record()
  }
  async function record() {
    setRec({ phase: 'starting' })
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (e) {
      const name = e && e.name
      dictationFailed(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No microphone was found. Connect one, then try again.'
        : name === 'NotAllowedError' || name === 'SecurityError' ? "The Clearing can't hear the microphone. Allow Hermes to use it in System Settings, Privacy & Security, Microphone, then try again."
          : "The microphone couldn't start. Try again.")
      return
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t))
    let mr
    try { mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined) } catch (e) { stream.getTracks().forEach(t => t.stop()); dictationFailed("The microphone couldn't start. Try again."); return }
    const chunks = []
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
    mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); sendRecording(new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' })) }
    mr.start(1000)
    recRef.current = { mr, timer: setTimeout(stopRecording, MAX_RECORD_MS) }
    setRec({ phase: 'recording', started: Date.now() })
  }
  function stopRecording() {
    const r = recRef.current
    if (r && r.mr.state !== 'inactive') { clearTimeout(r.timer); r.mr.stop() }
  }
  useEffect(() => () => { const r = recRef.current; if (r && r.mr.state !== 'inactive') { r.mr.onstop = null; r.mr.stop(); r.mr.stream && r.mr.stream.getTracks().forEach(t => t.stop()) } }, [])
  async function sendRecording(blob, data) {
    setRec({ phase: 'working' })
    try {
      if (!data) {
        if (!blob.size) { dictationFailed('No sound was recorded. Check the microphone, then try again.'); return }
        if (blob.size > 25 * 1024 * 1024) { dictationFailed('That recording is longer than The Clearing takes at once. Record ten minutes or less.'); return }
        data = toBase64(new Uint8Array(await blob.arrayBuffer()))
      }
      const r = await postLong('/dictation', { data, send_to: sendOk.current != null ? sendOk.current : undefined })
      if (r.needs_press) { setRec({ phase: 'idle' }); setCard({ type: 'dictation', label: r.label, provider: r.send_to, pending: data }); return }
      setRec({ phase: 'idle' })
      const c = live.current.card
      if (c && (c.type === 'dictation' || (c.type === 'failed' && c.title === 'Talk it through'))) setCard(null)
      insertAtCursor(r.text, false)
    } catch (e) { const err = errorOf(e); dictationFailed(err.offline ? "Talking it through needs The Clearing turned on. Turn it on in Settings, Plugins." : err.detail) }
  }

  // ---- the room's settings and the writer's own picture
  async function setSuggestions(on) {
    setSettings(x => ({ ...x, suggestions: on })); store().set('suggestions', on)
    if (!on) {
      const c = live.current.card
      if (c && ['rewrite', 'next', 'titles', 'openings', 'flip'].includes(c.type)) { setPreview(null); setCard(null) }
      backToMine()
    }
    if (live.current.conn === 'ok') post('/settings', { suggestions: on }).catch(() => {})
  }
  useEffect(() => {
    if (scene !== 'own' || conn !== 'ok' || picture) return
    rest('/scene/picture').then(r => setPicture(r.data || null), () => {})
  }, [scene, conn, picture])
  function chooseScene(v) { setScene(v); store().set('scene', v) }

  // ---- palette commands and keys
  useEffect(() => {
    if (!command) return
    $command.set(null)
    if (command === 'quick') quickCheck()
    if (command === 'ask') openAsk()
  }, [command])

  // Opening the Ask line cancels a close still waiting from its last blur (Escape, then Cmd E within 150 ms,
  // used to open it and shut it again). Focus lands in the same frame it opens, so no key reaches the page.
  // Cmd E is the one shortcut. What is under the cursor decides its first rows: a selected passage gets Rewrite,
  // Tighten and Make it concrete; a word gets Other words; a gap gets a next sentence.
  function openAsk() {
    clearTimeout(timers.current.askBlur)
    setMenu(false)
    const ta = bodyRef.current, b = live.current.body
    const at = ta ? { start: ta.selectionStart, end: ta.selectionEnd } : null
    const where = at && live.current.card?.type !== 'walk' ? toolAt(b, at.start, at.end) : null
    setAsk(a => ({ ...a, open: true, sel: 0, where, at }))
  }
  useLayoutEffect(() => { if (ask.open && askRef.current && document.activeElement !== askRef.current) askRef.current.focus() }, [ask.open])
  function askBlur() {
    clearTimeout(timers.current.askBlur)
    timers.current.askBlur = setTimeout(() => setAsk(a => (document.activeElement && document.activeElement.closest && document.activeElement.closest('.cl-hits')) || document.activeElement === askRef.current ? a : { open: false, q: '', sel: 0 }), 150)
  }

  // A sheet takes focus when it opens, so Escape closes it; closing gives the page its focus back.
  const shadeRef = useRef(null), hadSheet = useRef(false)
  useLayoutEffect(() => {
    const el = shadeRef.current
    if (sheet && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
    // Only when a sheet has just closed, never when the room first opens.
    if (!sheet && hadSheet.current && (!document.activeElement || document.activeElement === document.body) && bodyRef.current) bodyRef.current.focus({ preventScroll: true })
    hadSheet.current = !!sheet
  }, [sheet])

  // A suggestion shown in the page takes the textarea away, and the focus with it; keys that land on the document
  // body still reach the room, so Escape puts the writer's words back.
  const keyRef = useRef(null)
  keyRef.current = onKeyDown
  useEffect(() => {
    const k = e => { if (e.target === document.body && keyRef.current) keyRef.current(e) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  function onKeyDown(e) {
    const mod = MAC ? e.metaKey : e.ctrlKey
    const t = e.target, own = !t || !t.tagName || t === bodyRef.current || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
    if (mod && own && !e.altKey && (e.key === 'z' || e.key === 'Z' || (!MAC && (e.key === 'y' || e.key === 'Y')))) {
      e.preventDefault()
      if (e.shiftKey || e.key === 'y' || e.key === 'Y') redo(); else undo()
      return
    }
    if (mod && !e.shiftKey && !e.altKey && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); ask.open ? setAsk({ open: false, q: '', sel: 0 }) : openAsk(); return }
    if (e.key === 'Escape') {
      if (ask.open) { setAsk({ open: false, q: '', sel: 0 }); bodyRef.current && bodyRef.current.focus() } else if (sheet) setSheet(null)
      else if (menu) { setMenu(false); titleBtnRef.current && titleBtnRef.current.focus() }
      else if (bring) { setBring(false); bringRef.current && bringRef.current.focus() }
      else if (card && (FLOAT.has(card.type) || card.type === 'rewrite' || card.type === 'next')) { setPreview(null); setCard(null); bodyRef.current && bodyRef.current.focus({ preventScroll: true }) }
      else if (preview && walk && walk.showing) backToMine()
      else if (preview) (card && card.type === 'flip' ? chooseFlip(-1) : choose(-1))
    }
  }

  const hits = useMemo(() => {
    const q = ask.q.trim()
    // The first row is always the writer's own words, sent to the editor as they are (the editor lane's ask kind).
    const own = q ? [{ id: 'ask', kind: 'ask', title: `Ask the editor: “${q.length > 80 ? `${q.slice(0, 77)}…` : q}”`, instruction: q.slice(0, 500), group: 'Your words, to your editor', own: true }] : []
    const rw = TARGETS.find(x => x.id === 'rewrite'), nx = TARGETS.find(x => x.id === 'next')
    const ctx = q || !ask.where ? []
      : ask.where === 'word' ? [WORDS]
        : !settings.suggestions ? []
          : ask.where === 'passage' ? [{ ...rw, title: 'Rewrite', group: 'For your selection' }, { ...rw, title: 'Tighten', move: 'tighter', group: 'For your selection' }, { ...rw, title: 'Make it concrete', move: 'concrete', group: 'For your selection' }]
            : [nx]
    const lib = findTargets(ask.q, roomTargets, { figures: additions.figures }).filter(t => !ctx.some(c => c.id === t.id && !c.move))
    return [...own, ...ctx, ...lib].slice(0, 9)
  }, [ask.q, ask.where, roomTargets, settings.suggestions])
  // The row Enter runs: the writer's own words, unless they typed a pass's exact name.
  const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const exact = hits.findIndex(t => !t.own && norm(t.title) === norm(ask.q))
  const sel = ask.sel == null ? Math.max(0, exact) : ask.sel

  function runHit(t) {
    const at = ask.at
    if (t.kind === 'ask') return runTarget(TARGETS.find(x => x.id === 'ask') || { id: 'ask', kind: 'ask', title: 'Ask the editor' }, { instruction: t.instruction, selection: at && at.end > at.start ? at : null })
    if (t.move) return runTarget(t, { move: t.move, selection: at && at.end > at.start ? at : null })
    if (t.kind === 'words' && at) { setAsk({ open: false, q: '', sel: 0 }); const w = at.end > at.start ? at : wordAround(live.current.body, at.start); if (w) { lookWord(w.start, w.end); return } }
    if (t.kind === 'next' && at) return runTarget(t, { selection: { start: at.end, end: at.end } })
    return runTarget(t)
  }

  function askKeys(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAsk(a => ({ ...a, sel: Math.min(hits.length - 1, sel + 1) })) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAsk(a => ({ ...a, sel: Math.max(0, sel - 1) })) }
    if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); runHit(hits[sel]) }
  }

  const paras = useMemo(() => (shape ? paragraphs(body) : []), [shape, body])

  // Scroll the page so a character offset sits near the top (the shape strip's bars).
  function goTo(offset) {
    const mirror = mirrorRef.current, view = scrollRef.current
    if (!mirror || !view) return
    let left = offset
    for (const span of mirror.children) {
      const n = span.textContent.length
      if (left <= n && span.firstChild) {
        const range = document.createRange()
        range.setStart(span.firstChild, Math.min(left, span.firstChild.length))
        const r = range.getBoundingClientRect()
        view.scrollBy({ top: r.top - view.getBoundingClientRect().top - 90, behavior: 'smooth' })
        return
      }
      left -= n
    }
  }

  // Spans are kept per piece, so a reopened piece still shows which words came from the editor.
  useEffect(() => { if (piece && !piece.local) store().set(`spans:${piece.id}`, spans.map(({ fresh, ...x }) => x)) }, [spans]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const layer = aiRef.current, field = layer && layer.parentElement
    if (!spans.length || !layer || !field) { if (ticks.length) setTicks([]); return }
    const top0 = field.getBoundingClientRect().top, lines = []
    for (const el of layer.querySelectorAll('[data-kind="ai"]')) for (const r of el.getClientRects()) {
      const t = Math.round(r.top - top0), h = Math.round(r.height)
      if (h && !lines.some(x => Math.abs(x.top - t) < 4)) lines.push({ top: t, height: h })
    }
    if (JSON.stringify(lines) !== JSON.stringify(ticks)) setTicks(lines)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const layer = mirrorRef.current, field = layer && layer.parentElement
    const list = []
    if (layer && field) {
      const top0 = field.getBoundingClientRect().top
      for (const el of layer.querySelectorAll('[data-n]')) { const r = el.getClientRects()[0]; if (r) list.push({ n: el.getAttribute('data-n'), top: Math.round(r.top - top0), on: el.hasAttribute('data-on') }) }
    }
    // Two changes that start on the same line sit side by side in the margin, in rank order, never on top of each
    // other (Loop 2 critics: "2" and "4" stacked on one paragraph).
    list.sort((a, b) => a.top - b.top || a.n - b.n)
    const groups = []
    for (const x of list) { const g = groups[groups.length - 1]; if (g && Math.abs(x.top - g[0].top) < 22) g.push(x); else groups.push([x]) }
    for (const g of groups) g.sort((a, b) => a.n - b.n).forEach((x, j) => { x.top = g[0].top; x.col = g.length - 1 - j }) // "2 4", read left to right
    if (JSON.stringify(list) !== JSON.stringify(nums)) setNums(list)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const words = wordCount(body) // a suggestion shown in the page isn't in the piece yet, so the count holds still
  const yours = spans.length ? authorShare(body, spans) : null
  const quickCount = useMemo(() => instantRead(body).findings.length, [body])
  const saveLabel = { saved: 'Saved', saving: 'Saving', local: 'Waiting to save', error: 'Not saved yet' }[save]

  const note = renderCard()
  const ownScene = scene === 'own' && picture ? { '--cl-scene': `url("${picture}")` } : undefined
  return (
    <div className="cl-room" ref={roomRef} data-welcome={welcome ? '' : undefined} data-scene={scene} data-size={look.size} data-contrast={look.contrast} style={ownScene} onKeyDown={onKeyDown} onPointerMove={() => away && setAway(false)}>
      <div className="cl-top" data-away={away && !menu ? '' : undefined}>
        <button className="cl-titlebtn" ref={titleBtnRef} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
          <span>{title.trim() || 'Untitled'}</span><Icon name="down" />
        </button>
        <span className="cl-count">{plural(words, 'word', 'words')}</span>
        {yours && yours.model ? <span className="cl-count cl-yours" title="How much of this piece you wrote yourself. Words from a suggestion count as yours once you type inside them.">{yours.yours}% your words</span> : null}
        <span className="cl-grow" />
        <span className="cl-history" role="group" aria-label="History">
          <button className="cl-histbtn" onClick={undo} disabled={!canUndo()} title="Undo the last change"><Icon name="undo" /><span>Undo</span></button>
          <button className="cl-histbtn" onClick={redo} disabled={!canRedo()} title="Redo what you undid"><Icon name="redo" /><span>Redo</span></button>
        </span>
        <span className="cl-saved" role="status">{save === 'saved' ? <Icon name="check" /> : save === 'error' ? <Icon name="alert" /> : save === 'local' ? <Icon name="local" /> : null}<span className="cl-savedtext">{saveLabel}</span></span>
        <button className="cl-finish cl-scenebtn" onClick={() => { setMenu(false); setBring(false); setSheet('room') }}>Scene</button>
        <button className="cl-finish" ref={bringRef} aria-haspopup="menu" aria-expanded={bring} onClick={() => { setMenu(false); setBring(v => !v) }}>Bring in</button>
        <button className="cl-finish" onClick={() => { setMenu(false); setBring(false); setSheet('finish') }}>Finish</button>
      </div>
      {conn === 'off' && <div className="cl-banner" role="status"><Icon name="alert" />The Clearing's saving and editor are off. Turn on The Clearing in Settings, Plugins.</div>}

      <div className="cl-scroll" ref={scrollRef}>
        <div className="cl-grid">
          <article className="cl-page" ref={pageRef}>
            <textarea className="cl-titlefield" ref={titleRef} rows={1} value={title} placeholder="Title" aria-label="Title"
              onChange={e => changeTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bodyRef.current && bodyRef.current.focus() } }} />
            {card && card.type === 'cuts' ? (
              <div className="cl-preview cl-cutview" aria-label="The page with proposed cuts">
                {runs(body, card.cuts, card.focus).map((r, i) => r.mark
                  ? <span key={i} className="cl-cut" role="button" tabIndex={0} aria-pressed={r.mark.kept} aria-label={r.mark.kept ? `Kept: ${r.text}` : `Proposed cut: ${r.text}`}
                      data-kept={r.mark.kept ? '' : undefined} data-on={r.active ? '' : undefined}
                      onMouseEnter={() => setCard(c => ({ ...c, focus: r.mark.id }))} onFocus={() => setCard(c => ({ ...c, focus: r.mark.id }))}
                      onClick={() => toggleCut(r.mark.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCut(r.mark.id) } }}>{r.text}</span>
                  : <span key={i}>{r.text}</span>)}
              </div>
            ) : preview && preview.inline ? (
              <div className="cl-preview" aria-label="The page with the suggested text">
                {preview.body.slice(0, preview.start)}{preview.struck ? <del className="cl-struck" aria-label={`Your words: ${preview.struck}`}>{preview.struck}</del> : null}<span className="cl-proposed-page" data-inline="" title="Suggested by your model. It is not in your piece unless you use it.">{preview.body.slice(preview.start, preview.end)}</span>{preview.also ? <>{preview.body.slice(preview.end, preview.also.start)}<del className="cl-struck" aria-label={`Your words: ${preview.also.struck}`}>{preview.also.struck}</del>{preview.also.text ? <span className="cl-proposed-page" data-inline="">{preview.also.text}</span> : null}{preview.body.slice(preview.also.start + preview.also.text.length)}</> : preview.body.slice(preview.end)}
              </div>
            ) : preview ? (
              <div className="cl-preview" aria-label="The page with the proposed text">
                {body.slice(0, preview.start)}<span className="cl-proposed-page" data-insert={preview.insert ? '' : undefined}>{preview.text}</span>{body.slice(preview.end).replace(/^\n/, '')}
              </div>
            ) : (
              <div className="cl-field">
                {spans.length ? <MarkLayer body={body} marks={spans.map(s => ({ ...s, kind: 'ai', status: 'open' }))} mirrorRef={aiRef} layer="cl-ai" /> : null}
                <MarkLayer body={body} marks={openMarks} active={current && current.id} mirrorRef={mirrorRef} caret={caretAt} />
                {ticks.length ? <div className="cl-ticks" aria-hidden="true">{ticks.map((t, i) => <i key={i} style={{ top: t.top, height: t.height }} />)}</div> : null}
                {nums.length ? <div className="cl-nums" aria-hidden="true">{nums.map(x => <b key={x.n} data-on={x.on ? '' : undefined} style={{ top: x.top, left: -26 * (x.col || 0) }}>{x.n}</b>)}</div> : null}
                <textarea className="cl-body" ref={bodyRef} value={body} aria-label="Your piece" placeholder="Start writing." spellCheck
                  onChange={e => { changeBody(e.target.value, 'typing'); if (card && card.type === 'tools') setCard(null) }} onClick={pickAtCaret} onDoubleClick={onDouble} onMouseUp={onPointerUp}
                  onSelect={e => { live.current.caret = e.target.selectionEnd }}
                  onKeyUp={e => { if (e.key.startsWith('Arrow')) pickAtCaret() }} />
              </div>
            )}
            {floating && note ? <div className="cl-pop" ref={popRef} style={{ top: pop.top, left: pop.left }} key={card.type === 'working' ? 'working' : card.type}>{note}</div> : null}
          </article>
          <aside className="cl-margin" ref={marginRef} aria-live="polite">
            {!narrow && note && !floating && <div style={{ marginTop: noteTop }} className="cl-noteplace" ref={noteRef} key={card && card.type}>{note}</div>}
            {!narrow && !welcome && (!note || floating) ? <div className="cl-noteplace cl-deskplace">{desk(false)}</div> : null}
          </aside>
        </div>
      </div>

      {narrow && note && !floating && <div className="cl-dock">{note}</div>}
      {narrow && !welcome && (!note || floating) ? <div className="cl-dock cl-deskdock">{desk(false, true)}</div> : null}
      {welcome ? <Welcome onSample={startSample} onNew={() => { closeWelcome(); newPiece() }} onBringIn={() => { closeWelcome(); setBring(true) }} onModelSettings={openSettings} onClose={closeWelcome} /> : null}

      {shape && !narrow && paras.length ? (
        <div className="cl-overlay"><nav className="cl-shape" aria-label="The shape of the piece">
          {(() => {
            const most = Math.max(...paras.map(x => x.words), 1)
            const live = openMarks.filter(m => m.kind !== 'kept' && m.kind !== 'word')
            return paras.map((x, i) => {
              const n = live.filter(m => m.start >= x.start && m.start < x.end).length
              return (
                <button key={i} className="cl-bar" onClick={() => goTo(x.start)} aria-label={`Paragraph ${i + 1}, ${plural(x.words, 'word', 'words')}${n ? `, ${plural(n, 'note', 'notes')}` : ''}`}>
                  <i style={{ width: `${Math.max(8, Math.round((x.words / most) * 100))}%` }} />{n ? <b aria-hidden="true" /> : null}
                </button>
              )
            })
          })()}
        </nav></div>
      ) : null}

      <div className="cl-overlay">
        <div className="cl-askwrap">
          {ask.open && (
            <div className="cl-hits" role="listbox" aria-label="Passes">
              {hits.length ? hits.map((t, i) => (
                <button key={t.id} role="option" aria-selected={i === sel} className="cl-hit" data-on={i === sel ? '' : undefined}
                  onMouseEnter={() => setAsk(a => ({ ...a, sel: i }))} onClick={() => runHit(t)}>
                  <strong>{t.title}</strong><span>{t.kind === 'local' || t.kind === 'words' ? BUILT_IN : t.for ? `${t.group} · ${shortFor(t.for)}` : t.group}</span>
                </button>
              )) : null}
              <button className="cl-hit cl-allhit" onMouseDown={e => e.preventDefault()} onClick={() => { setAsk({ open: false, q: '', sel: 0 }); setSheet('library') }}><strong>All methods</strong><span>Every pass, method, craft path and figure, by group</span></button>
            </div>
          )}
          <div className="cl-askrow">
            <label className="cl-ask" data-open={ask.open ? '' : undefined} onClick={() => !ask.open && openAsk()}>
              <Icon name="search" />
              {ask.open
                ? <input className="cl-askinput" ref={askRef} value={ask.q} placeholder="What do you want help with?" aria-label="Ask for help with this piece"
                    onChange={e => { const q = e.target.value; setAsk(a => ({ ...a, open: true, q, sel: null })) }} onKeyDown={askKeys} onBlur={askBlur} />
                : <span>Ask for help with this piece</span>}
              <span className="cl-kbd">{MOD}</span>
            </label>
            {speech && !speech.ready && rec.phase === 'idle' ? null : <button className="cl-mic" data-phase={rec.phase} aria-pressed={rec.phase === 'recording'} disabled={rec.phase === 'starting' || rec.phase === 'working'}
              aria-label={rec.phase === 'recording' ? 'Stop talking it through' : rec.phase === 'working' ? 'Typing out what you said' : 'Talk it through, at the cursor'}
              title={rec.phase === 'recording' ? 'Stop' : `Talk it through${speechLine ? `. ${speechLine}` : ''}`} onMouseDown={e => e.preventDefault()} onClick={dictate}>
              {rec.phase === 'recording' ? <><Icon name="stop" /><RecTime since={rec.started} /></> : rec.phase === 'working' || rec.phase === 'starting' ? <span className="cl-dots" aria-hidden="true"><i /><i /><i /></span> : <Icon name="mic" />}
            </button>}
          </div>
        </div>
      </div>

      {menu && <TitleMenu pieces={pieces} piece={piece} trash={trash} scene={scene} conn={conn} shape={shape} onVoice={toggleVoice}
        onShape={() => { setShape(v => { store().set('shape', !v); return !v }); setMenu(false) }}
        onNew={newPiece} onOpen={openPiece} onFile={() => pickFile('any')} onTrash={trashPiece}
        onSheet={s => { setMenu(false); setSheet(s) }} onScene={s => { setScene(s); store().set('scene', s) }} onClose={() => setMenu(false)} />}
      {bring && <BringMenu speech={speech} speechLine={speechLine} onFile={pickFile} onLink={() => { setBring(false); setSheet('link') }} onPaste={() => { setBring(false); setSheet('paste') }} onDictate={dictate} recording={rec.phase !== 'idle'} off={conn !== 'ok'} onClose={() => setBring(false)} />}
      <input type="file" ref={fileRef} accept={ACCEPT.any} style={{ display: 'none' }} onChange={e => { openFile(e.target.files && e.target.files[0]); e.target.value = '' }} />

      {sheet && (
        <div className="cl-shade" ref={shadeRef} tabIndex={-1} onMouseDown={e => { if (e.target === e.currentTarget) setSheet(null) }}>
          {sheet === 'finish' && <FinishSheet title={title} body={body} piece={piece} conn={conn} onClose={() => setSheet(null)} onFinished={p => setPiece(x => ({ ...x, ...p }))} flush={flush} />}
          {sheet === 'history' && <HistorySheet piece={piece} current={body} onClose={() => setSheet(null)} onRestore={p => { open(p); setSheet(null) }} flush={flush} />}
          {sheet === 'link' && <LinkSheet conn={conn} onClose={() => setSheet(null)} onNew={(t, b, u) => newPieceFrom(t, b, u)} onInsert={text => { insertAtCursor(text, true); setSheet(null) }} />}
          {sheet === 'paste' && <PasteSheet onClose={() => setSheet(null)} conn={conn} onNew={b => { const f = fromFile('', b); newPieceFrom(f.title, f.body) }} onInsert={text => { insertAtCursor(text, true); setSheet(null) }} />}
          {sheet === 'trash' && <TrashSheet onClose={() => setSheet(null)} onRestore={restorePiece} />}
          {sheet === 'about' && <AboutSheet targets={roomTargets} suggestions={settings.suggestions} onClose={() => setSheet(null)} onLibrary={() => setSheet('library')} />}
          {sheet === 'library' && <LibrarySheet targets={roomTargets} onClose={() => setSheet(null)} onRun={t => { setSheet(null); runTarget(t) }} />}
          {sheet === 'guidance' && <GuidanceSheet piece={piece} conn={conn} onClose={() => setSheet(null)} onVoice={toggleVoice} onRun={id => { setSheet(null); runTarget(TARGETS.find(x => x.id === id)) }} onHome={() => setSheet('home')} />}
          {sheet === 'home' && <HomeSheet conn={conn} onClose={() => setSheet(null)} flush={flush} />}
          {sheet === 'room' && <RoomSheet scene={scene} look={look} picture={picture} conn={conn} suggestions={settings.suggestions} onSuggestions={setSuggestions} onPicture={setPicture} onScene={chooseScene} onLook={setLookKey} onClose={() => setSheet(null)} />}
        </div>
      )}
    </div>
  )

  // Rewrite a sentence, from the desk: the selection if there is one, else the sentence at the caret (the first
  // sentence when the writer hasn't clicked into the page yet). The sentence is selected so the writer sees what goes.
  function rewriteHere() {
    const ta = bodyRef.current, b = live.current.body
    if (!ta) return
    let sel = ta.selectionEnd > ta.selectionStart ? { start: ta.selectionStart, end: ta.selectionEnd } : sentenceAt(b, ta.selectionStart)
    if (!sel) return
    if (sel.end - sel.start > 2000) sel = { start: sel.start, end: sel.start + 2000 }
    ta.focus({ preventScroll: true })
    ta.setSelectionRange(sel.start, sel.end)
    runTarget(TARGETS.find(x => x.id === 'rewrite'), { selection: sel })
  }

  // ------------------------------------------------- Spot the figures, Find opportunities --
  // Try it: the writer writes their own version of the line in the card; the coach answers with what works and
  // questions, never wording; Use mine puts the writer's version into the page as one step Undo takes out.
  function tryStart(m) { setPreview(null); setWalk(w => (w ? { ...w, showing: null, trying: { id: m.id, line: m.quote, reply: '', busy: false, err: '' } } : w)) }
  function tryStop() { setWalk(w => (w ? { ...w, trying: null } : w)) }
  function tryChange(v) { setWalk(w => (w && w.trying ? { ...w, trying: { ...w.trying, line: v, err: '' } } : w)) }
  async function askCoach(m) {
    const w = live.current.walk, t = w && w.trying, p = live.current.piece
    if (!t || t.id !== m.id || !p || p.local) return
    const at = x => (x && x.trying && x.trying.id === m.id ? x : null)
    setWalk(x => (at(x) ? { ...x, trying: { ...x.trying, busy: true, err: '' } } : x))
    try {
      const r = await postLong('/coach', { piece_id: p.id, item: m.item, quote: m.quote, why: m.text, line: t.line, body: live.current.body, title: live.current.title })
      setWalk(x => (at(x) ? { ...x, trying: { ...x.trying, busy: false, reply: r.text || '', model: r.model || '' } } : x))
    } catch (e) {
      const err = errorOf(e)
      setWalk(x => (at(x) ? { ...x, trying: { ...x.trying, busy: false, err: err.offline ? "The Clearing's editor is off. Your line is still here." : err.detail } } : x))
    }
  }
  function useMine(m) {
    const w = live.current.walk, t = w && w.trying, b = live.current.body
    if (!t || t.id !== m.id) return
    if (b.slice(m.start, m.end) !== m.quote) { setStatus(m.id, 'changed'); tryStop(); return }
    insertNative(m.start, m.end, t.line.trim())
    setStatus(m.id, 'used')
    setWalk(x => ({ ...x, trying: null, showing: null, used: m.id }))
  }
  function pickSpot(m) {
    const w = live.current.walk
    if (!w) return
    const i = w.ids.indexOf(m.id)
    if (i < 0) return
    setPreview(null)
    setWalk(x => ({ ...x, index: i, showing: null, trying: null, used: x.used === m.id ? x.used : null }))
    reveal(m)
  }
  function closeSpots() { backToMine(); finishWalk() }

  function spotCard(m) {
    const trying = walk.trying && walk.trying.id === m.id ? walk.trying : null
    const tryit = trying ? <TryIt m={m} state={trying} label={m.kind === 'figure' ? `Write your own version of this line, using ${m.name.toLowerCase()}. Your words stay yours.` : `Write your own version of these words, with ${m.name.toLowerCase()}. Your words stay yours.`}
      onChange={tryChange} onAsk={() => askCoach(m)} onUse={() => useMine(m)} onCancel={tryStop} /> : null
    if (walk.kind === 'figures') {
      return <FigureNote m={m} pos={walk.index + 1} total={walk.ids.length} used={walk.used === m.id} trying={!!trying} tryit={tryit}
        onTry={() => tryStart(m)} onPrev={() => step(-1)} onNext={() => { setWalk(x => ({ ...x, used: null, trying: null })); step(1) }} onClose={closeSpots} onUndo={undo} />
    }
    const items = walk.ids.map(id => marks.find(x => x.id === id)).filter(Boolean)
    const changed = x => x.changed || x.status === 'changed'
    const canShow = settings.suggestions && conn === 'ok' && !!piece && !piece.local
    const active = x => {
      const used = walk.used === x.id
      const showing = walk.showing === x.id && preview && preview.inline
      const mine = walk.trying && walk.trying.id === x.id ? tryit : null
      const blank = showing && /\[[^\]\n]{1,120}\]/.test(x.try || '')
      const flags = (showing || used) && x.unsupported && x.unsupported.length
      return <>
        {used ? null : <p className="cl-hero-quote cl-spot-quote">{x.quote}</p>}
        <p className="cl-spot-def">{x.definition}</p>
        <h4 className="cl-spot-h">Why here</h4>
        <p className="cl-say">{x.text}</p>
        {flags ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Adds something your piece doesn't say: {x.unsupported.map(u => `“${String(u).replace(/^['"‘“]|['"’”]$/g, '')}”`).join(', ')}</span></p> : null}
        {blank ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Leaves a blank for what only you know</span></p> : null}
        {used ? (
          <div className="cl-used-row"><p className="cl-say cl-usedline"><Icon name="check" /><span>Used.</span></p><button className="cl-btn cl-undobtn" data-v="ghost" onClick={undo}><Icon name="undo" />Undo</button><button className="cl-btn" data-v="link" onClick={nextChange}>{items.some(y => y.status === 'open' && y.id !== x.id) ? 'Next' : 'Done'}</button></div>
        ) : changed(x) ? <p className="cl-say">You changed these words since the editor read them.</p>
          : showing ? (
            <div className="cl-row">
              <button className="cl-btn" data-v="primary" onClick={() => (x.cutChange ? useCutChange(x) : useShown(x))}>Use this</button>
              <button className="cl-btn" data-v="ghost" onClick={backToMine}>Keep mine</button>
            </div>
          ) : mine || (
            <div className="cl-row">
              {canShow ? <button className="cl-btn" data-v="primary" onClick={() => (x.cutChange ? showCutChange(x) : x.try ? showMe(x) : runTarget(TARGETS.find(t => t.id === 'apply'), { selection: { start: x.start, end: x.end }, note: x.text, item: x.item, why: x.text, keepWalk: true }))}>Show me</button> : null}
              <button className="cl-btn" data-v={canShow ? 'ghost' : 'primary'} onClick={() => tryStart(x)}>Try it myself</button>
              <button className="cl-btn cl-last" data-v="link" onClick={() => { setStatus(x.id, 'left'); step(1) }}>Leave it</button>
            </div>
          )}
      </>
    }
    return <OppsList items={items} active={m} onPick={pickSpot} onClose={closeSpots} renderActive={active} model={walk.model} />
  }

  // ---------------------------------------------------------------- the desk --
  // What the editor can do for this piece, at rest in the margin: Read my piece leads.
  function desk(compact, bar) {
    if (bring) return null // the Bring in menu opens over the margin; two stacked lists both offered Talk it through (Loop 2 critics)
    const reading = !!card && card.type === 'working' && card.pass.kind === 'read'
    return <Desk compact={compact} narrow={!!bar} resting={!card || card.type === 'readresult' || floating} busy={reading} modKey={MOD} quickCount={quickCount}
      canRead={conn === 'ok' && !!piece && !piece.local} canAsk canRewrite={settings.suggestions && conn === 'ok' && !!piece && !piece.local} canTalk={!!(speech && speech.ready)} canBringIn
      onRead={() => runTarget(TARGETS.find(x => x.id === 'read'))} onFigures={() => runTarget(TARGETS.find(x => x.id === 'figures'))} onOpps={() => runTarget(TARGETS.find(x => x.id === 'opportunities'))} onAsk={openAsk} onRewrite={rewriteHere} onBringIn={() => { setMenu(false); setBring(true) }} onTalk={dictate} onQuick={quickCheck} />
  }

  // ---------------------------------------------------------------- the card --
  function renderCard() {
    if (!card) return null
    // Each part of the provenance line ("Find weak sentences · model-name · your selection") stays whole,
    // so a hyphenated model name never breaks across lines.
    const parts = s => String(s).split(' · ').flatMap((x, i) => i ? [' · ', <span key={i} className="cl-part">{x}</span>] : [<span key={i} className="cl-part">{x}</span>])
    // The header names the pass; "Suggested by your model" closes every card the model wrote, with its name on hover.
    const meta = (left, right, model) => <><div className="cl-meta"><span>{parts(left)}</span><span>{right || ''}</span></div>{model ? <p className="cl-prov" title={`Written by ${model}`}>Suggested by your model</p> : null}</>
    if (card.type === 'working' && card.pass.kind === 'read') return <ReadProgress phase={card.pass.phase} words={card.pass.words || wordCount(body)} elapsed={(Date.now() - card.at) / 1000} sections={card.pass.sections} partial={card.pass.result} onStop={stop} />
    if (card.type === 'working' && !(card.anchor && (card.pass.kind === 'rewrite' || card.pass.kind === 'ask'))) return <Working card={card} onStop={stop} />
    if (card.type === 'used') return (
      <div className="cl-note cl-usednote" role="status">
        <div className="cl-used-row"><p className="cl-say cl-usedline"><Icon name="check" /><span>Used.</span></p><button className="cl-btn cl-undobtn" data-v="ghost" onClick={undo}><Icon name="undo" />Undo</button></div>
      </div>
    )
    if (card.type === 'readresult' && walk) {
      const cur = current
      const flagLine = m => (m && m.unsupported && m.unsupported.length ? <p className="cl-read-flag"><Icon name="alert" /><span>Adds something your piece doesn't say: {m.unsupported.map(x => `“${String(x).replace(/^['"‘“]|['"’”]$/g, '')}”`).join(', ')}</span></p> : null)
      const actions = c => {
        const m = cur && cur.n === c.n && walk.showing !== 'cut' ? cur : null
        if (!m) return null
        if (walk.used === m.id) return <div className="cl-used-row"><p className="cl-say cl-usedline"><Icon name="check" /><span>{walk.usedPair ? `Used, with change ${m.pairNext}.` : 'Used.'}</span></p><button className="cl-btn cl-undobtn" data-v="ghost" onClick={undo}><Icon name="undo" />Undo</button><button className="cl-btn" data-v="link" onClick={nextChange}>Next change</button></div>
        const partner = walk.showing === m.id && !m.cutChange ? partnerOf(m) : null
        if (walk.showing === m.id) return <>{flagLine(m)}{partner ? <p className="cl-read-pair">This also cuts the repeated news in paragraph {body.slice(0, partner.start).split(/\n\s*\n/).length}.</p> : null}<div className="cl-row"><button className="cl-btn" data-v="primary" onClick={() => (m.cutChange ? useCutChange(m) : partner ? usePair(m, partner) : useShown(m))}>Use this</button><button className="cl-btn" data-v="ghost" onClick={backToMine}>Keep mine</button></div></>
        if (m.status === 'used') return <p className="cl-say cl-usedline"><Icon name="check" /><span>Used.</span></p>
        const can = m.try || m.cutChange
        return <div className="cl-row">{can ? <button className="cl-btn" data-v="primary" onClick={() => (m.cutChange ? showCutChange(m) : showMe(m))}>Show me</button> : null}<button className="cl-btn" data-v={can ? 'link' : 'primary'} onClick={() => fixMyself(m)}>Edit it myself</button></div>
      }
      const cutRow = walk.cut ? (walk.showing === 'cut'
        ? <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={useCut}>Use this</button><button className="cl-btn" data-v="ghost" onClick={backToMine}>Keep mine</button></div>
        : null) : walk.used === 'cut' ? <div className="cl-used-row"><p className="cl-say cl-usedline"><Icon name="check" /><span>Cut.</span></p><button className="cl-btn cl-undobtn" data-v="ghost" onClick={undo}><Icon name="undo" />Undo</button></div> : null
      return (
        <div className="cl-roomread">
          <button className="cl-x" aria-label="Close the read" onClick={() => { backToMine(); done() }}><Icon name="close" /></button>
          <ReadResult result={walk.result} sample={walk.sample} activeRank={cur ? cur.n : null} used={n => { const x = marks.find(mm => walk.ids.includes(mm.id) && mm.n === n); return !!x && x.status === 'used' }} renderActions={actions} done={c => !!cur && cur.n === c.n && (walk.used === cur.id || cur.status === 'used')} cutRow={cutRow} cut={walk.cut}
            onQuery={q => { const b = live.current.body, i = Number.isInteger(q.start) && b.slice(q.start, q.end) === q.quote ? q.start : b.indexOf(q.quote); const ta = bodyRef.current; if (i >= 0 && ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(i, i + q.quote.length); goTo(i) } }}
            onFocus={rank => focusChange(rank)} onCutFirst={() => (walk.showing === 'cut' ? backToMine() : showCut(walk.cut))} onRunOwn={() => runTarget(TARGETS.find(x => x.id === 'read'))} />
          {walk.sample ? null : <p className="cl-prov" title={walk.model ? `Written by ${walk.model}` : undefined}>Suggested by your model</p>}
        </div>
      )
    }
    if (card.type === 'busy') return (
      <div className="cl-note">
        {meta(card.title)}
        <p className="cl-working"><span className="cl-dots" aria-hidden="true"><i /><i /><i /></span>{card.say}</p>
      </div>
    )
    if (card.type === 'words') {
      const fromModel = card.suggestions && card.suggestions.some(o => o.text === card.current)
      return <WordCard card={card} canSuggest={conn === 'ok' && piece && !piece.local && settings.suggestions} onSuggest={() => suggest(card)} onTry={tryWord} onDone={() => { if (!card.moved && card.current !== card.original) logDecisions([fromModel ? { kind: 'wording', original: card.original, chosen: card.current, choice: 'chose', model: card.model } : { kind: 'word', original: card.original, chosen: card.current, choice: 'chose' }]); setCard(null) }} onToggle={() => setCard(c => ({ ...c, all: !c.all }))} onDict={() => setCard(c => ({ ...c, dict: true }))} />
    }
    if (card.type === 'tools') {
      // The selection bar: small, 8 px above the selection's first line.
      const text = body.slice(card.start, card.end)
      const canAsk = settings.suggestions && conn === 'ok' && piece && !piece.local
      const rw = TARGETS.find(x => x.id === 'rewrite'), sel = { start: card.start, end: card.end }
      return (
        <div className="cl-selbar" role="toolbar" aria-label="Tools for your selection">
          {card.word ? <button className="cl-barbtn" onClick={() => lookWord(card.start, card.end)}>Other words</button> : null}
          {canAsk && !card.word && text.length <= 2000 ? <>
            <button className="cl-barbtn" onClick={() => runTarget(rw, { selection: sel })}>Rewrite</button>
            <button className="cl-barbtn" onClick={() => runTarget({ ...rw, title: 'Tighten' }, { selection: sel, move: 'tighter' })}>Tighten</button>
            <button className="cl-barbtn" onClick={() => runTarget({ ...rw, title: 'Make it concrete' }, { selection: sel, move: 'concrete' })}>Make it concrete</button>
          </> : null}
          <button className="cl-barbtn" onClick={() => { setCard(null); openAsk() }}>Ask</button>
        </div>
      )
    }
    if (card.type === 'working' && card.anchor && (card.pass.kind === 'rewrite' || card.pass.kind === 'ask')) {
      // Rewrites land one at a time; each tile fills as its answer comes back, and Yours is always last.
      const got = (card.pass.result && Array.isArray(card.pass.result.options) ? card.pass.result.options : [])
      const pseudo = { type: 'rewrite', start: card.anchor.start, end: card.anchor.end, original: body.slice(card.anchor.start, card.anchor.end), options: got }
      return (
        <div className="cl-note" aria-busy="true">
          <div className="cl-hero-head"><h3 className="cl-hero-title cl-suggest-title">{card.pass.kind === 'ask' && card.pass.instruction ? `Ask the editor: “${card.pass.instruction}”` : card.pass.title}</h3></div>
          <Tiles options={got} pick={card.pick == null ? -1 : card.pick} onPick={i => { setCard(c => ({ ...c, pick: i })); tryOption(i, pseudo) }} />
          <div className="cl-row"><button className="cl-btn" data-v="ghost" onClick={() => { setPreview(null); stop() }}>Stop</button><span className="cl-working cl-filling" role="status"><span className="cl-dots" aria-hidden="true"><i /><i /><i /></span>{got.length ? `${got.length} of 3 ready` : 'Writing three ways'}</span></div>
          {got.length ? <p className="cl-prov">Suggested by your model</p> : null}
        </div>
      )
    }
    if (card.type === 'rewrite' || card.type === 'next') {
      const next = card.type === 'next'
      const pick = card.choice
      const o = pick >= 0 ? card.options[pick] : null
      const pickOpt = i => { setCard(c => ({ ...c, choice: i, edit: null })); tryOption(i, { ...card, choice: i, edit: null }) }
      const head = card.kind === 'ask' && card.instruction ? `Ask the editor: “${card.instruction.length > 70 ? `${card.instruction.slice(0, 67)}…` : card.instruction}”` : next ? 'A next sentence' : card.title
      const blank = o && /\[[^\]\n]{1,120}\]/.test(card.edit != null ? card.edit : o.text)
      return (
        <div className="cl-note cl-suggest">
          <div className="cl-hero-head"><h3 className="cl-hero-title cl-suggest-title">{head}</h3><button className="cl-x" aria-label="Close" onClick={keepMine}><Icon name="close" /></button></div>
          {card.edit != null ? (
            <textarea className="cl-rule" aria-label="Edit the suggestion before you use it" rows={3} value={card.edit} onChange={e => { const v = e.target.value; setCard(c => ({ ...c, edit: v })); tryOption(pick, { ...card, edit: v }) }} />
          ) : <Tiles options={card.options} pick={pick} onPick={i => (i < 0 ? keepMine() : pickOpt(i))} />}
          {o && o.unsupported && o.unsupported.length ? (() => {
            // A fact the writer typed in the request is theirs to check; one the model brought in is flagged as new.
            const clean = x => String(x).replace(/^['"‘“]|['"’”]$/g, '')
            const asked = String(card.instruction || '').toLowerCase()
            const yours = o.unsupported.map(clean).filter(x => asked.includes(x.toLowerCase())), added = o.unsupported.map(clean).filter(x => !asked.includes(x.toLowerCase()))
            return <>
              {added.length ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>{card.options && card.options.length > 1 ? `${'ABCDE'[pick]} adds` : 'Adds'} something your piece doesn't say: {added.map(x => `“${x}”`).join(', ')}</span></p> : null}
              {yours.length ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>From your request, not yet in your piece: {yours.map(x => `“${x}”`).join(', ')}. Check before you use it.</span></p> : null}
            </>
          })() : null}
          {blank ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Leaves a blank for your figure</span></p> : null}
          {o && o.flag ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>{o.flag}</span></p> : null}
          {card.folded ? <><p className="cl-reason">Each of these breaks one of Quick check's rules. Use one only if it still sounds like you.</p>
            {!next ? <ul className="cl-list">{card.options.map((x, i) => <li key={i} className="cl-flag">{'ABCDE'[i]}. {x.flag}</li>)}</ul> : null}</> : null}
          {card.changeOpen && o && card.edit == null && conn === 'ok' ? <ChangeIt why={card.why} onAsk={req => changeIt(next ? { start: card.at, end: card.at, original: '' } : card, o.text, req)} /> : null}
          {card.back ? <button className="cl-btn" data-v="link" style={{ marginLeft: 0, paddingLeft: 0 }} onClick={() => { setPreview(null); setCard(card.back); if (card.back.choice >= 0) tryOption(card.back.choice, card.back) }}>Back to the last options</button> : null}
          <div className="cl-row">
            {pick >= 0 ? <button className="cl-btn" data-v="primary" onClick={useOption}>Use this</button> : null}
            <button className="cl-btn" data-v="ghost" onClick={keepMine}>Keep mine</button>
          </div>
          {o && card.edit == null ? <div className="cl-links">
            <button className="cl-btn" data-v="link" onClick={() => setCard(c => ({ ...c, edit: c.options[c.choice].text }))}>Edit it myself</button>
            {!card.changeOpen && conn === 'ok' ? <button className="cl-btn" data-v="link" onClick={() => setCard(c => ({ ...c, changeOpen: true }))}>Change it</button> : null}
          </div> : null}
          <p className="cl-prov" title={card.model ? `Written by ${card.model}` : undefined}>Suggested by your model</p>
        </div>
      )
    }
    if (card.type === 'titles') return (
      <div className="cl-note">
        {meta(walk ? walk.who : 'Title ideas', '', card.model)}
        <p className="cl-reason">Your title now: <span className="cl-sample">{title.trim() || 'none yet'}</span></p>
        <div className="cl-suggs">{card.options.map((o, i) => (
          <button key={i} className="cl-sugg" aria-pressed={card.choice === i} onClick={() => setCard(c => ({ ...c, choice: i }))}><span>{o.text}</span>{o.how ? <small>{o.how}</small> : null}{o.flag ? <small className="cl-flag"><Icon name="alert" />{o.flag}</small> : null}</button>
        ))}</div>
        <div className="cl-row" style={{ marginTop: 12 }}>
          {card.choice >= 0 ? <button className="cl-btn" data-v="primary" onClick={useTitle}>Use this title</button> : null}
          <button className="cl-btn" data-v="link" onClick={done}>Done</button>
        </div>
      </div>
    )
    if (card.type === 'dictation') return (
      <div className="cl-note" role="alertdialog" aria-label="Talk it through">
        {meta('Talk it through')}
        <p className="cl-say">Sent to {card.label || 'the speech-to-text set up in Hermes'} to type out. Choose Send to send this recording.</p>
        <div className="cl-row">
          <button className="cl-btn" data-v="primary" onClick={() => { sendOk.current = card.provider; if (card.pending) sendRecording(null, card.pending); else { setCard(null); record() } }}>Send</button>
          <button className="cl-btn" data-v="link" onClick={() => setCard(null)}>Not now</button>
        </div>
      </div>
    )
    if (card.type === 'failed') {
      const t = card.retry && card.retry !== 'reload' ? TARGETS.find(x => x.id === card.retry) || (card.retry === 'openings' ? TARGETS.find(x => x.id === 'openings') : null) : null
      return (
        <div className="cl-note" role="alert">
          {meta(card.title || 'The Clearing')}
          <p className="cl-say" style={{ display: 'flex', gap: 8 }}><Icon name="alert" /><span>{card.message}</span></p>
          <div className="cl-row">
            {card.code === 'no_model' && <button className="cl-btn" data-v="primary" onClick={openSettings}>Open Settings</button>}
            {/voice sample/.test(card.message || '') && <button className="cl-btn" data-v="primary" onClick={() => setSheet('guidance')}>Your guidance</button>}
            {t && !/voice sample|nothing to learn|two to five/i.test(card.message || '') && <button className="cl-btn" data-v={card.code === 'no_model' ? 'ghost' : 'primary'} onClick={() => runTarget(t)}>Try again</button>}
            {card.retry === 'reload' && <button className="cl-btn" data-v="primary" onClick={load}>Try again</button>}
            {card.back && <button className="cl-btn" data-v={card.code === 'no_model' ? 'ghost' : 'primary'} onClick={() => suggest(card.back)}>Try again</button>}
            {card.back && <button className="cl-btn" data-v="ghost" onClick={() => setCard(card.back)}>Back to the word</button>}
            {card.resume && <button className="cl-btn" data-v={card.code === 'no_model' ? 'ghost' : 'primary'} onClick={() => setCard({ type: 'walk' })}>Back to the notes</button>}
            {card.code !== 'no_model' && !t && !card.back && !card.resume && card.title !== 'Talk it through' && <button className="cl-btn" data-v="ghost" onClick={quickCheck}>Quick check instead</button>}
            <button className="cl-btn" data-v="link" onClick={() => setCard(null)}>Done</button>
          </div>
        </div>
      )
    }
    if (card.type === 'clean') return (
      <div className="cl-note">
        {meta(walk ? walk.who : 'The Clearing', '', walk && walk.model)}
        <p className="cl-say">{(walk && walk.summary) || 'Nothing here needs your attention.'}</p>
        {walk && walk.setAside ? <p className="cl-reason">{plural(walk.setAside, 'note was', 'notes were')} set aside because you changed {walk.setAside === 1 ? 'that passage' : 'those passages'}.</p> : null}
        <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={finishWalk}>{walk && walk.back ? backLabel(walk.back) : 'Done'}</button></div>
      </div>
    )
    if (card.type === 'read' && walk) {
      const n = walk.ids.length
      return (
        <div className="cl-note">
          {meta(walk.who, n ? plural(n, 'note', 'notes') : '', walk.model)}
          <p className="cl-say">{walk.summary}</p>
          {walk.general && walk.general.length ? <ul className="cl-list">{walk.general.slice(0, 4).map((g, i) => <li key={i}>{g.note}</li>)}</ul> : null}
          {walk.question ? <p className="cl-say"><strong style={{ fontWeight: 600 }}>{walk.question}</strong></p> : null}
          <div className="cl-row">
            {n ? <button className="cl-btn" data-v="primary" onClick={walkAgain}>Walk the notes</button> : null}
            <button className="cl-btn" data-v={n ? 'link' : 'primary'} onClick={done}>Done</button>
          </div>
        </div>
      )
    }
    if (card.type === 'walk' && walk && current && (walk.kind === 'figures' || walk.kind === 'opps')) return spotCard(current)
    if (card.type === 'walk' && walk && current) {
      const pos = `${walk.index + 1} of ${walk.ids.length}`
      // Show me drafts the note into the writer's words: the note's own example, or one asked for on the press.
      const showing = walk.showing === current.id && preview && preview.inline
      const example = settings.suggestions && !current.changed && current.status !== 'changed' ? current.try : ''
      const canShow = settings.suggestions && !walk.local && !current.lines && !current.judgment && !current.changed && current.status !== 'changed' && conn === 'ok' && piece && !piece.local
      if (current.kind === 'change') return (
        <div className="cl-note">
          {meta(walk.who, pos, walk.model)}
          <p className="cl-quote">“{current.quote}”</p>
          <p className="cl-proposed">{current.replacement || '(cut)'}</p>
          {current.text ? <p className="cl-reason">{current.text}</p> : null}
          <div className="cl-row">
            <button className="cl-btn" data-v="primary" onClick={() => { setStatus(current.id, 'kept'); step(1) }}>Keep</button>
            <button className="cl-btn" data-v="ghost" onClick={() => { setStatus(current.id, 'skipped'); step(1) }}>Skip</button>
            <button className="cl-btn" data-v="link" onClick={() => setCard({ type: 'apply' })}>Done</button>
          </div>
        </div>
      )
      // An editor's note from your model: the change is the title, the writer's words one line under it, the reason,
      // and Show me. Change it, the chips and the free field wait behind Show me.
      const hero = !walk.local && !current.lines && !current.judgment && !current.sample && ((!current.changed && current.status !== 'changed') || walk.used === current.id)
      if (hero) {
        const used = walk.used === current.id
        const flags = (showing || used) && current.unsupported && current.unsupported.length
        const blank = showing && /\[[^\]\n]{1,120}\]/.test(current.try || '')
        const headline = current.change || String(current.text || '').split(/(?<=[.?!])\s/)[0]
        return (
          <div className="cl-note cl-hero">
            <div className="cl-hero-head">
              {current.n ? <span className="cl-hero-n" aria-hidden="true">{current.n}</span> : null}
              <h3 className="cl-hero-title">{headline}</h3>
              {walk.ids.length > 1 ? <span className="cl-hero-pos">{pos}</span> : null}
              <button className="cl-x" aria-label="Close the notes" onClick={() => { backToMine(); finishWalk() }}><Icon name="close" /></button>
            </div>
            {used ? null : <p className="cl-hero-quote">{current.quote}</p>}
            {current.text && current.text !== headline && !used ? <p className="cl-say">{current.text}</p> : null}
            {flags ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Adds something your piece doesn't say: {current.unsupported.map(x => `“${String(x).replace(/^['"‘“]|['"’”]$/g, '')}”`).join(', ')}</span></p> : null}
            {blank ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Leaves a blank for your figure</span></p> : null}
            {showing && walk.changeOpen && canShow ? <ChangeIt why={walk.why && walk.why.id === current.id ? walk.why.text : ''} onAsk={req => {
              if (req === 'why') { live.current.explainBack = { type: 'walk' }; live.current.whyFor = current.id }
              changeIt({ start: current.start, end: current.end, original: current.quote }, current.try, req)
            }} /> : null}
            {used ? (
              <div className="cl-used-row"><p className="cl-say cl-usedline"><Icon name="check" /><span>Used.</span></p><button className="cl-btn cl-undobtn" data-v="ghost" onClick={undo}><Icon name="undo" />Undo</button><button className="cl-btn" data-v="link" onClick={nextChange}>{walk.index + 1 < walk.ids.length ? 'Next change' : 'Done'}</button></div>
            ) : showing ? (
              <div className="cl-row">
                <button className="cl-btn" data-v="primary" onClick={() => useShown(current)}>Use this</button>
                <button className="cl-btn" data-v="ghost" onClick={backToMine}>Keep mine</button>
                {canShow && !walk.changeOpen ? <button className="cl-btn" data-v="link" onClick={() => setWalk(w => ({ ...w, changeOpen: true }))}>Change it</button> : null}
              </div>
            ) : (
              <div className="cl-row">
                {canShow ? <button className="cl-btn" data-v="primary" onClick={() => showMeFor(current)}>Show me</button> : null}
                <button className="cl-btn" data-v="ghost" onClick={() => { setStatus(current.id, 'left'); step(1) }}>Leave it</button>
                <button className="cl-btn cl-last" data-v="link" onClick={() => fixMyself(current)}>Edit it myself</button>
              </div>
            )}
            <p className="cl-prov" title={walk.model ? `Written by ${walk.model}` : undefined}>Suggested by your model</p>
          </div>
        )
      }
      return (
        <div className="cl-note">
          {meta(walk.who, pos, walk.model)}
          {walk.intro && walk.index === 0 && walk.summary ? <p className="cl-reason cl-intro">{walk.summary}</p> : null}
          {current.changed || current.status === 'changed'
            ? <p className="cl-say">You changed this passage.</p>
            : <p className="cl-quote">“{current.quote}”</p>}
          {current.judgment ? <p className="cl-tag" data-judgment={current.judgment}>{JUDGMENT[current.judgment]}</p> : null}
          {current.lines
            ? current.lines.map((l, i) => <p key={i} className="cl-say"><strong style={{ fontWeight: 600 }}>{l.name}.</strong> {l.issue}</p>)
            : <p className="cl-say">{current.text}</p>}
          {current.sample ? <p className="cl-reason">From “{current.sampleTitle}”: <span className="cl-sample">“{current.sample}”</span></p> : null}
          {showing ? <p className="cl-reason">Suggested by your model, shown in your page. It goes in only if you use it.</p>
            : example ? <><p className="cl-label2">Try</p><p className="cl-proposed cl-try">{current.try}</p></> : null}
          {(showing || example) && current.flag ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>{current.flag}</span></p> : null}
          {(showing || example) && canShow ? <ChangeIt why={walk.why && walk.why.id === current.id ? walk.why.text : ''} onAsk={req => {
            if (req === 'why') { live.current.explainBack = { type: 'walk' }; live.current.whyFor = current.id }
            changeIt({ start: current.start, end: current.end, original: current.quote }, current.try, req)
          }} /> : null}
          {(showing || example) && current.unsupported && current.unsupported.length ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Not in your piece: {current.unsupported.join(', ')}. Check before you use it.</span></p> : null}
          <div className="cl-row">
            {showing ? <>
              <button className="cl-btn" data-v="primary" onClick={() => useShown(current)}>Use this</button>
              <button className="cl-btn" data-v="ghost" onClick={backToMine}>Back to mine</button>
            </> : example && canShow ? <>
              {/* Show me leads when the note carries its change: one press shows it in the sentence. */}
              <button className="cl-btn" data-v="primary" onClick={() => showMeFor(current)}>Show me</button>
              <button className="cl-btn" data-v="ghost" onClick={() => { setStatus(current.id, 'left'); step(1) }}>Leave it</button>
            </> : <>
              {current.changed
                ? <button className="cl-btn" data-v="primary" onClick={() => step(1)}>Next note</button>
                : <button className="cl-btn" data-v="primary" onClick={() => fixMyself(current)}>Edit it myself</button>}
              {canShow ? <button className="cl-btn" data-v="ghost" onClick={() => showMeFor(current)}>Show me</button> : null}
              <button className="cl-btn" data-v="ghost" onClick={() => { setStatus(current.id, 'left'); step(1) }}>Leave it</button>
            </>}
            <button className="cl-btn" data-v="link" onClick={() => { backToMine(); finishWalk() }}>{walk.back ? backLabel(walk.back) : 'Done'}</button>
            {!showing && example && canShow ? <button className="cl-btn cl-last" data-v="link" onClick={() => fixMyself(current)}>Edit it myself</button> : null}
          </div>
        </div>
      )
    }
    if (card.type === 'walk' && walk && !current) { setTimeout(() => step(1), 0); return null }
    if (card.type === 'end' && walk) return (
      <div className="cl-note">
        {meta(walk.who, '', walk.model)}
        <p className="cl-say">{walk.back ? "That's every note here." : "That's every note from this pass."}</p>
        <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={finishWalk}>{walk.back ? backLabel(walk.back) : 'Done'}</button>{walk.summary && !walk.back ? <button className="cl-btn" data-v="ghost" onClick={() => setCard({ type: 'read' })}>Read the summary</button> : null}</div>
      </div>
    )
    if (card.type === 'apply' && walk) {
      const kept = marks.filter(m => m.kind === 'change' && m.status === 'kept').length
      return (
        <div className="cl-note">
          {meta(walk.who, '', walk.model)}
          <p className="cl-say">{kept ? `You kept ${plural(kept, 'change', 'changes')}. Apply ${kept === 1 ? 'it' : 'them'} to the page?` : 'You kept none of the changes. The page stays as it is.'}</p>
          <div className="cl-row">
            {kept ? <button className="cl-btn" data-v="primary" onClick={applyKept}>Apply</button> : null}
            <button className="cl-btn" data-v={kept ? 'ghost' : 'primary'} onClick={done}>{kept ? 'Discard' : 'Done'}</button>
          </div>
        </div>
      )
    }
    if (card.type === 'cuts') {
      const cut = card.cuts.filter(x => !x.kept)
      const after = wordCount(applyCuts(body, card.cuts).body)
      const f = card.cuts.find(x => x.id === card.focus)
      return (
        <div className="cl-note">
          {meta(walk ? walk.who : 'Try a shorter draft', plural(card.cuts.length, 'cut', 'cuts'), walk && walk.model)}
          {walk && walk.summary ? <p className="cl-say">{walk.summary}</p> : null}
          <p className="cl-reason">{plural(wordCount(body), 'word', 'words')} now, {plural(after, 'word', 'words')} with {cut.length === card.cuts.length ? 'every cut' : plural(cut.length, 'cut', 'cuts')}. Click a struck passage to keep it.</p>
          {f ? <p className="cl-proposed">{f.kept ? 'Kept. ' : ''}{f.text}</p> : null}
          <div className="cl-row">
            {cut.length ? <button className="cl-btn" data-v="primary" onClick={acceptCuts}>{cut.length === card.cuts.length ? 'Accept the cuts' : `Accept ${plural(cut.length, 'cut', 'cuts')}`}</button> : null}
            <button className="cl-btn" data-v={cut.length ? 'ghost' : 'primary'} onClick={done}>Keep everything</button>
          </div>
        </div>
      )
    }
    if (card.type === 'openings') {
      const letters = ['A', 'B', 'C']
      const pick = card.choice
      const ending = card.kind === 'endings'
      const o = pick >= 0 ? card.options[pick] : null
      return (
        <div className="cl-note">
          {meta(walk ? walk.who : ending ? 'Propose endings' : 'Propose openings', '', card.model)}
          <div className="cl-choices" role="group" aria-label={ending ? 'Endings' : 'Openings'}>
            {card.options.map((x, i) => <button key={i} className="cl-choice" aria-pressed={pick === i} onClick={() => choose(i)}>{letters[i]}</button>)}
            <button className="cl-choice" aria-pressed={pick < 0} onClick={() => choose(-1)}>Yours</button>
          </div>
          <p className="cl-say">{o ? o.how : ending ? 'Your ending, as you wrote it. Choose A, B or C to try one in the page.' : 'Your opening, as you wrote it. Choose A, B or C to try one in the page.'}</p>
          {o && o.unsupported && o.unsupported.length ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Not in your piece: {o.unsupported.join(', ')}. Check before you keep it.</span></p> : null}
          {o && o.flag ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>{o.flag}</span></p> : null}
          <div className="cl-row">
            {pick >= 0 ? <button className="cl-btn" data-v="primary" onClick={keepOpening}>Keep {letters[pick]}</button> : null}
            {pick >= 0 ? <button className="cl-btn" data-v="ghost" onClick={() => choose(-1)}>Go back to mine</button> : null}
            <button className="cl-btn" data-v="link" onClick={done}>Done</button>
          </div>
        </div>
      )
    }
    if (card.type === 'flip') {
      const letters = ['A', 'B', 'C'], pick = card.choice, o = pick >= 0 ? card.options[pick] : null
      const draft = card.kind === 'draft'
      const yours = draft ? 'Your notes, as you wrote them. Choose A, B or C to try a draft in their place.'
        : card.insert ? 'Your piece has no sentence that does this yet. Choose A, B or C to try one after your first paragraph.'
          : 'Your sentence, as you wrote it. Choose A, B or C to try one in its place.'
      return (
        <div className="cl-note">
          {meta(walk ? walk.who : card.title, '', card.model)}
          <div className="cl-choices" role="group" aria-label={draft ? 'Drafts' : 'Options'}>
            {card.options.map((x, i) => <button key={i} className="cl-choice" aria-pressed={pick === i} onClick={() => chooseFlip(i)}>{letters[i]}</button>)}
            <button className="cl-choice" aria-pressed={pick < 0} onClick={() => chooseFlip(-1)}>Yours</button>
          </div>
          <p className="cl-say">{o ? o.how : yours}</p>
          {o && o.gaps && o.gaps.length ? <><p className="cl-reason" style={{ marginBottom: 6 }}>Your notes don't give:</p><ul className="cl-list">{o.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></> : null}
          {o && o.unsupported && o.unsupported.length ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>Not in your {draft ? 'notes' : 'piece'}: {o.unsupported.join(', ')}. Check before you keep it.</span></p> : null}
          {o && o.flag ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>{o.flag}</span></p> : null}
          <div className="cl-row">
            {o ? <button className="cl-btn" data-v="primary" onClick={keepFlip}>Keep {letters[pick]}</button> : null}
            {o ? <button className="cl-btn" data-v="ghost" onClick={() => chooseFlip(-1)}>Go back to {draft ? 'my notes' : 'mine'}</button> : null}
            <button className="cl-btn" data-v="link" onClick={done}>Done</button>
          </div>
        </div>
      )
    }
    if (card.type === 'panel') {
      const r = card.panel
      return (
        <div className="cl-note">
          {meta(card.who, plural(r.reviewers.filter(x => x.status === 'done').length, 'review', 'reviews'), card.model)}
          <div className="cl-revs">
            {r.reviewers.map(x => (
              <div className="cl-rev" key={x.id}>
                <b>{x.name}</b>
                {x.status === 'done'
                  ? <><p>{x.summary || 'No summary.'}</p><button className="cl-btn" data-v="ghost" disabled={!x.findings.length} onClick={() => walkPanel(card, x.id)}>{x.findings.length ? `Walk ${plural(x.findings.length, 'note', 'notes')}` : 'No notes'}</button></>
                  : <p className="cl-warn"><Icon name="alert" /><span>{x.message}</span></p>}
              </div>
            ))}
          </div>
          <p className="cl-say">{r.agreements.length ? `${plural(r.agreements.length, 'passage', 'passages')} drew notes from more than one reviewer.` : 'No passage drew notes from more than one reviewer.'}</p>
          <div className="cl-row">
            {r.agreements.length ? <button className="cl-btn" data-v="primary" onClick={() => walkPanel(card, 'agree')}>Where they agree</button> : null}
            <button className="cl-btn" data-v="ghost" onClick={() => runTarget(TARGETS.find(x => x.id === 'method:debate'))}>Let them argue it</button>
            <button className="cl-btn" data-v="link" onClick={done}>Done</button>
          </div>
        </div>
      )
    }
    if (card.type === 'debate') {
      const r = card.debate, at = card.at, [a, b] = r.sides
      const side = s => (
        <>
          <p className="cl-label2">{s.side === 'A' ? 'Side A' : 'Side B'}: {s.name}</p>
          <p className="cl-say">{s.argument}</p>
          {s.concedes ? <p className="cl-reason">Grants: {s.concedes}</p> : null}
        </>
      )
      return (
        <div className="cl-note">
          {meta(card.who, `${at + 1} of 4`, card.model)}
          {at === 0 ? <>
            <p className="cl-say"><strong style={{ fontWeight: 600 }}>{r.question}</strong></p>
            {r.sides.map(s => <p key={s.side} className="cl-proposed"><b>{s.name}.</b> {s.position}</p>)}
          </> : at === 1 ? side(a) : at === 2 ? side(b) : <>
            <p className="cl-label2">What moved</p><p className="cl-say">{r.close.moved || 'Nothing moved.'}</p>
            <p className="cl-label2">Still open</p><p className="cl-say">{r.close.unresolved || 'Nothing.'}</p>
            <p className="cl-say"><strong style={{ fontWeight: 600 }}>{r.close.decision}</strong></p>
          </>}
          <div className="cl-row">
            {at < 3 ? <button className="cl-btn" data-v="primary" onClick={() => debateStep(at + 1)}>{at === 0 ? `Hear ${a.name}` : at === 1 ? `Hear ${b.name}` : 'Where it stands'}</button> : null}
            {at > 0 ? <button className="cl-btn" data-v="ghost" onClick={() => debateStep(at - 1)}>Back</button> : null}
            {at === 3 && r.panel ? <button className="cl-btn" data-v="ghost" onClick={() => { setMarks(ms => ms.filter(m => m.kind === 'kept')); setCard({ type: 'panel', panel: r.panel, title: 'Get several editorial perspectives', model: card.model, who: card.who.replace(card.title, 'Get several editorial perspectives'), sent: card.sent }) }}>See the reviews</button> : null}
            <button className="cl-btn" data-v="link" onClick={done}>Done</button>
          </div>
        </div>
      )
    }
    if (card.type === 'proposals') {
      const it = card.items[card.at], lessons = card.kind === 'lessons'
      if (!it) return (
        <div className="cl-note">
          {meta(walk ? walk.who : 'Your guidance', '', card.model)}
          <p className="cl-say">{card.kept ? `You kept ${plural(card.kept, 'rule', 'rules')}. The editor reads ${card.kept === 1 ? 'it' : 'them'} on every pass; change ${card.kept === 1 ? 'it' : 'them'} in Your guidance.` : 'You kept none of them. Your guidance is unchanged.'}</p>
          {card.gaps.length ? <><p className="cl-label2">What your samples can't show yet</p><ul className="cl-list">{card.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></> : null}
          {card.questions.length ? <><p className="cl-label2">Questions worth answering</p><ul className="cl-list">{card.questions.map((g, i) => <li key={i}>{g}</li>)}</ul></> : null}
          <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={done}>Done</button><button className="cl-btn" data-v="ghost" onClick={() => { done(); setSheet('guidance') }}>Your guidance</button></div>
        </div>
      )
      return (
        <div className="cl-note">
          {meta(walk ? walk.who : 'Your guidance', `${card.at + 1} of ${card.items.length}`, card.model)}
          {card.at === 0 && card.summary ? <p className="cl-say">{card.summary}</p> : null}
          <p className="cl-tag">{SECTION_LABEL[it.section] || 'Style'}{lessons ? (it.scope === 'piece' ? ' · Looks like a choice for this piece only' : ' · Looks lasting') : ''}</p>
          <textarea className="cl-rule" aria-label="The rule, as it will be kept" rows={2} value={it.draft} onChange={e => { const v = e.target.value; setCard(c => ({ ...c, items: c.items.map((x, i) => i === c.at ? { ...x, draft: v } : x) })) }} />
          <p className="cl-reason" style={it.why ? { marginBottom: 6 } : undefined}>{lessons ? 'From your words' : `From “${it.sample_title}”`}: <span className="cl-sample">“{it.evidence}”</span></p>
          {it.why ? <p className="cl-reason">{it.why}</p> : null}
          {card.error ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>{card.error}</span></p> : null}
          <div className="cl-row">
            <button className="cl-btn" data-v={lessons && it.scope === 'piece' ? 'ghost' : 'primary'} disabled={!it.draft.trim()} onClick={keepProposal}>Keep this rule</button>
            <button className="cl-btn" data-v={lessons && it.scope === 'piece' ? 'primary' : 'ghost'} onClick={() => nextProposal('skipped')}>Skip</button>
            <button className="cl-btn" data-v="link" onClick={() => setCard(c => ({ ...c, at: c.items.length }))}>Done</button>
          </div>
        </div>
      )
    }
    if (card.type === 'choose') {
      const others = pieces.filter(x => piece && x.id !== piece.id)
      const n = card.picked.length
      const pick = id => setCard(c => ({ ...c, picked: c.picked.includes(id) ? c.picked.filter(x => x !== id) : c.picked.length < 4 ? [...c.picked, id] : c.picked }))
      return (
        <div className="cl-note">
          {meta(card.target.title)}
          <p className="cl-say">Read this piece together with which others? Choose one to four.</p>
          {others.length ? <div className="cl-picks" role="group" aria-label="Pieces to read together">
            {others.map(x => (
              <label key={x.id} className="cl-pick"><input type="checkbox" checked={card.picked.includes(x.id)} disabled={!card.picked.includes(x.id) && n >= 4} onChange={() => pick(x.id)} />
                <span className="cl-name">{x.title || 'Untitled'}</span><small>{plural(x.words, 'word', 'words')}</small></label>
            ))}
          </div> : <p className="cl-say">You have no other pieces yet. Open a file or start a new piece, then come back.</p>}
          <div className="cl-row">
            <button className="cl-btn" data-v="primary" disabled={!n} onClick={() => runTarget(card.target, { pieces: card.picked })}>{n ? `Read ${n + 1} pieces together` : 'Read them together'}</button>
            <button className="cl-btn" data-v="link" onClick={() => setCard(null)}>Cancel</button>
          </div>
        </div>
      )
    }
    if (card.type === 'across') {
      const r = card.across, here = walk && walk.back === card ? walk.ids.length : 0
      const away = r.notes.filter(n => !n.here)
      const cut = r.coverage.filter(c => c.sent < c.total)
      return (
        <div className="cl-note" data-long="">
          {meta(card.who, plural(r.coverage.length, 'piece', 'pieces'), card.model)}
          <p className="cl-say"><strong style={{ fontWeight: 600 }}>{r.possibility}</strong></p>
          <p className="cl-say">{r.summary}</p>
          <p className="cl-reason">{cut.length ? `Read ${cut.map(c => `the first ${Math.round(100 * c.sent / c.total)}% of “${c.title}”`).join(' and ')} and all of the rest.` : `Read all of ${plural(r.coverage.length, 'piece', 'pieces')}.`}</p>
          {away.length ? <><p className="cl-label2">In your other pieces</p><ul className="cl-list">{away.map((n, i) => <li key={i}><span className="cl-sample">“{n.quote}”</span> ({n.title}). {n.note}</li>)}</ul></> : null}
          {r.gaps.length ? <><p className="cl-label2">Gaps</p><ul className="cl-list">{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></> : null}
          {r.decisions.length ? <><p className="cl-label2">Yours to decide</p><ul className="cl-list">{r.decisions.map((g, i) => <li key={i}>{g}</li>)}</ul></> : null}
          <div className="cl-row">
            {here ? <button className="cl-btn" data-v="primary" onClick={walkAgain}>Walk {plural(here, 'note', 'notes')} here</button> : null}
            <button className="cl-btn" data-v={here ? 'link' : 'primary'} onClick={done}>Done</button>
          </div>
        </div>
      )
    }
    return null
  }

  function backLabel(c) { return c.type === 'panel' ? 'Back to the panel' : c.type === 'across' ? 'Back to the read' : 'Back' }

  function openSettings() {
    try {
      const list = api && typeof api.listActions === 'function' ? api.listActions() : []
      const hit = (list || []).find(a => /settings/i.test(a.id) && /model/i.test(`${a.id} ${a.label}`)) || (list || []).find(a => /settings/i.test(a.id))
      if (hit && api.runAction) { api.runAction(hit.id); return }
    } catch (e) { /* fall through */ }
    host.navigate && host.navigate('/settings')
  }
}

// A dictionary meaning cut short in the shard ends on its last whole clause, never on an ellipsis.
function shortGloss(g) {
  const t = String(g || '')
  if (!/(\.\.\.|…)$/.test(t)) return t
  const i = t.lastIndexOf(';')
  return i > 8 ? t.slice(0, i) : t.replace(/(\.\.\.|…)$/, '')
}

function WordCard({ card, canSuggest, onSuggest, onTry, onDone, onToggle, onDict }) {
  const r = card.result
  const groups = r ? r.groups : []
  const shown = card.all ? groups.slice(0, 12) : groups.slice(0, card.suggestions ? 2 : 3)
  const what = card.phrase ? 'passage' : 'word'
  let body
  if (card.moved) body = <p className="cl-say">This {what} changed. Select it again to look for other wording.</p>
  else if (card.loading) body = <p className="cl-working"><span className="cl-dots" aria-hidden="true"><i /><i /><i /></span>Looking it up</p>
  else if (card.offline) body = <p className="cl-say">Other words needs The Clearing turned on. Turn it on in Settings, Plugins.</p>
  else if (card.phrase || card.suggestions) body = null
  else if (!groups.length) body = <p className="cl-say">No dictionary entry for “{card.original}”.</p>
  else body = (
    <div className="cl-senses">
      {shown.map((g, i) => (
        <div className="cl-sense" key={i}>
          <p className="cl-gloss"><b>{POS_LABEL[g.pos]}</b>{shortGloss(g.gloss)}</p>
          <div className="cl-alts">{g.words.slice(0, 8).map(w => <button key={w} className="cl-alt" aria-pressed={w === card.current} onClick={() => onTry(w)}>{w}</button>)}</div>
        </div>
      ))}
      {groups.length > 3 ? <button className="cl-btn" data-v="link" style={{ marginLeft: 0, paddingLeft: 0 }} onClick={onToggle}>{card.all ? 'Fewer senses' : `${plural(Math.min(groups.length, 12) - 3, 'more sense', 'more senses')}`}</button> : null}
    </div>
  )
  const sugg = card.suggestions && !card.moved ? (
    <div className="cl-senses">
      <p className="cl-gloss"><b>More like this from your editor</b></p>
      <div className="cl-suggs">{card.suggestions.map(o => (
        <button key={o.text} className="cl-sugg" aria-pressed={o.text === card.current} onClick={() => onTry(o.text)}><span>{o.text}</span>{o.why ? <small>{o.why}</small> : null}</button>
      ))}</div>
      {!card.phrase && groups.length && !card.dict ? <button className="cl-btn" data-v="link" style={{ marginLeft: 0, paddingLeft: 0, marginTop: 6 }} onClick={onDict}>Dictionary senses</button> : null}
      {!card.phrase && groups.length && card.dict ? <div style={{ marginTop: 14 }}>{shown.map((g, i) => (
        <div className="cl-sense" key={i}><p className="cl-gloss"><b>{POS_LABEL[g.pos]}</b>{shortGloss(g.gloss)}</p>
          <div className="cl-alts">{g.words.slice(0, 8).map(w => <button key={w} className="cl-alt" aria-pressed={w === card.current} onClick={() => onTry(w)}>{w}</button>)}</div></div>
      ))}</div> : null}
    </div>
  ) : null
  return (
    <div className="cl-note">
      <div className="cl-meta"><span>{card.phrase ? 'Other wording' : 'Other words'}</span><span>{card.suggestions || card.phrase ? '' : 'Dictionary, built in'}</span></div>
      <p className="cl-word" data-phrase={card.phrase ? '' : undefined}>{card.current}</p>
      {sugg || body}
      {card.tried.length && !card.moved ? (
        <div className="cl-tried" role="group" aria-label="Words you tried">
          <button className="cl-alt" data-yours="" aria-pressed={card.current === card.original} onClick={() => onTry(card.original)}>{card.original}</button>
          {card.tried.map(w => <button key={w} className="cl-alt" aria-pressed={card.current === w} onClick={() => onTry(w)}>{w}</button>)}
        </div>
      ) : null}
      <div className="cl-row">
        {!card.suggestions && !card.moved && !card.loading && canSuggest ? <button className="cl-btn" data-v={card.phrase || !groups.length ? 'primary' : 'ghost'} onClick={onSuggest}>Suggest wording</button> : null}
        {card.current !== card.original && !card.moved ? <button className="cl-btn" data-v="ghost" onClick={() => onTry(card.original)}>{card.phrase ? 'Go back to yours' : `Go back to “${card.original}”`}</button> : null}
        <button className="cl-btn" data-v="link" onClick={onDone}>Done</button>
      </div>
      {card.suggestions ? <p className="cl-prov" title={card.suggestedBy ? `Written by ${card.suggestedBy}` : undefined}>Suggested by your model</p> : null}
    </div>
  )
}

// Change it: three quick asks, Why?, and the writer's own words.
function ChangeIt({ onAsk, why }) {
  const [text, setText] = useState('')
  return (
    <div className="cl-change" role="group" aria-label="Change it">
      <div className="cl-chips">
        {['Shorter', 'Plainer', 'Keep my rhythm'].map(x => <button key={x} className="cl-chip" onClick={() => onAsk(x.toLowerCase())}>{x}</button>)}
        <button className="cl-chip" onClick={() => onAsk('why')}>Why?</button>
      </div>
      <input className="cl-chipfield" aria-label="Change it in your own words" placeholder="Or say how to change it" value={text} maxLength={300}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { e.preventDefault(); onAsk(text.trim()); setText('') } }} />
      {why ? <p className="cl-reason cl-why">{why}</p> : null}
    </div>
  )
}

// A, B and C, then Yours: one segmented row. A tile still being written shows a line at its final size.
function Tiles({ options, pick, onPick, expected = 3 }) {
  const letters = ['A', 'B', 'C', 'D', 'E']
  const n = Math.max(expected, options.length)
  const label = o => { const m = String(o.move || o.how || '').trim(); return m ? m[0].toUpperCase() + m.slice(1) : '' }
  return (
    <div className="cl-tiles" role="group" aria-label="Suggestions">
      {Array.from({ length: n }, (_, i) => options[i]
        ? <button key={i} className="cl-tile" data-opt="" aria-pressed={pick === i} title={label(options[i]) || undefined} onClick={() => onPick(i)} onMouseDown={e => e.preventDefault()}>
            <b className="cl-tile-l">{letters[i]}</b><span className="cl-tile-body"><span className="cl-tile-text">{options[i].text}</span>{options[i].unsupported && options[i].unsupported.length ? <small className="cl-tile-adds"><Icon name="alert" />Adds a fact</small> : null}</span>
          </button>
        : <span key={i} className="cl-tile" data-wait="" aria-label={`${letters[i]}, still being written`}><b className="cl-tile-l">{letters[i]}</b><span className="cl-tile-body"><i className="cl-skel" style={{ width: '46%' }} /><i className="cl-skel" /><i className="cl-skel" style={{ width: '72%' }} /></span></span>)}
    </div>
  )
}

function RecTime({ since }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 500); return () => clearInterval(t) }, [])
  const s = Math.max(0, Math.floor((Date.now() - (since || Date.now())) / 1000))
  return <span className="cl-rectime">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
}

// Bring in: every way words get into The Clearing, in one place.
function BringMenu({ speech, speechLine, onFile, onLink, onPaste, onDictate, recording, off, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = e => { if (ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('[aria-haspopup=menu]'))) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  useEffect(() => { const first = ref.current && ref.current.querySelector('.cl-item:not([disabled])'); first && first.focus() }, [])
  function keys(e) {
    const items = [...ref.current.querySelectorAll('.cl-item:not([disabled])')]
    const i = items.indexOf(document.activeElement)
    const go = n => { e.preventDefault(); items[(n + items.length) % items.length].focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'Tab') onClose()
  }
  const item = (label, where, fn, disabled) => <button className="cl-item" role="menuitem" disabled={disabled} onClick={fn}><span className="cl-name">{label}</span><small>{where}</small></button>
  return (
    <div className="cl-menu cl-bring" role="menu" aria-label="Bring in" ref={ref} onKeyDown={keys}>
      {item('A Word file', 'New piece', () => onFile('word'), off)}
      {item('A PDF', 'New piece', () => onFile('pdf'), off)}
      {item('A text or Markdown file', 'New piece', () => onFile('text'), off)}
      {item('A link', 'New piece or at the cursor', onLink, off)}
      <div className="cl-sep" />
      {speech && !speech.ready ? null : item('Talk it through', speechLine || 'At the cursor', onDictate, off || recording)}
      {item('Paste text', 'New piece or at the cursor', onPaste, false)}
    </div>
  )
}

function LinkSheet({ conn, onClose, onNew, onInsert }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [page, setPage] = useState(null)
  const ref = useRef(null)
  useEffect(() => { ref.current && ref.current.focus() }, [])
  async function fetchIt() {
    if (!url.trim()) return
    setBusy(true); setErr(null); setPage(null)
    try { setPage(await postLong('/link', { url })) } catch (e) { const x = errorOf(e); setErr(x.offline ? "Bringing in links needs The Clearing turned on. Turn it on in Settings, Plugins." : x.detail) }
    setBusy(false)
  }
  return (
    <div className="cl-sheet" role="dialog" aria-label="Bring in a link">
      <h2>Bring in a link</h2>
      <p>Your Hermes web tool reads the page and The Clearing keeps its words. Public pages only.</p>
      <input className="cl-field-input" ref={ref} type="url" inputMode="url" placeholder="https://" aria-label="The page's address" value={url}
        onChange={e => { setUrl(e.target.value); setPage(null) }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchIt() } }} disabled={busy || conn !== 'ok'} />
      {err && <p className="cl-status"><Icon name="alert" /><span>{err}</span></p>}
      {busy && <p className="cl-working" style={{ marginTop: 12 }}><span className="cl-dots" aria-hidden="true"><i /><i /><i /></span>Reading the page</p>}
      {page && <div className="cl-linkpage"><b>{page.title || page.url}</b><span>{plural(wordCount(page.body), 'word', 'words')}</span></div>}
      <div className="cl-row" style={{ marginTop: 14 }}>
        {page ? <>
          <button className="cl-btn" data-v="primary" onClick={() => onNew(page.title, quotedSource(page.title, page.url, page.body, 400000, page.date), page.url)}>Make it a new piece</button>
          <button className="cl-btn" data-v="ghost" onClick={() => onInsert(quotedSource(page.title, page.url, page.body, 20000, page.date))}>Add it at my cursor</button>
        </> : <button className="cl-btn" data-v="primary" disabled={busy || !url.trim() || conn !== 'ok'} onClick={fetchIt}>Bring it in</button>}
        <button className="cl-btn" data-v="link" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

function PasteSheet({ conn, onClose, onNew, onInsert }) {
  const [text, setText] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current && ref.current.focus() }, [])
  return (
    <div className="cl-sheet" role="dialog" aria-label="Paste text">
      <h2>Paste text</h2>
      <p>Paste your text here, then choose where it goes.</p>
      <textarea className="cl-rule cl-pastebox" ref={ref} rows={7} aria-label="The text to bring in" value={text} onChange={e => setText(e.target.value)} />
      <div className="cl-row" style={{ marginTop: 12 }}>
        <button className="cl-btn" data-v="primary" disabled={!text.trim() || conn !== 'ok'} onClick={() => onNew(text)}>Make it a new piece</button>
        <button className="cl-btn" data-v="ghost" disabled={!text.trim()} onClick={() => onInsert(text)}>Add it at the cursor</button>
        <button className="cl-btn" data-v="link" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

function Working({ card, onStop }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t) }, [])
  const secs = Math.max(0, Math.round((Date.now() - card.at) / 1000))
  return (
    <div className="cl-note">
      <div className="cl-meta"><span>{card.pass.title}</span><span>{secs} s</span></div>
      <p className="cl-working"><span className="cl-dots" aria-hidden="true"><i /><i /><i /></span>{card.pass.step || (card.pass.selection ? 'Reading the passage you selected' : 'Reading your piece')}</p>
      <div className="cl-row"><button className="cl-btn" data-v="ghost" onClick={onStop}>Stop</button></div>
    </div>
  )
}

function TitleMenu({ pieces, piece, trash, scene, conn, shape, onVoice, onShape, onNew, onOpen, onFile, onTrash, onSheet, onScene, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = e => { if (ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('.cl-titlebtn'))) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  useEffect(() => { const first = ref.current && ref.current.querySelector('.cl-item:not([disabled])'); first && first.focus() }, [])
  function keys(e) {
    const items = [...ref.current.querySelectorAll('.cl-item:not([disabled])')]
    const i = items.indexOf(document.activeElement)
    const go = n => { e.preventDefault(); items[(n + items.length) % items.length].focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'Tab') onClose()
  }
  const off = conn !== 'ok'
  const recent = pieces.filter(p => !piece || p.id !== piece.id).slice(0, 6)
  return (
    <div className="cl-menu" role="menu" ref={ref} onKeyDown={keys}>
      <button className="cl-item" role="menuitem" disabled={off} onClick={onNew}>New piece</button>
      <button className="cl-item" role="menuitem" disabled={off} onClick={onFile}>Open a file</button>
      {recent.length ? <><div className="cl-sep" /><div className="cl-label">Recent</div></> : null}
      {recent.map(p => (
        <button key={p.id} className="cl-item" role="menuitem" onClick={() => onOpen(p.id)}>
          <span className="cl-name">{p.title || 'Untitled'}</span><small>{plural(p.words, 'word', 'words')}</small>
        </button>
      ))}
      <div className="cl-sep" />
      <button className="cl-item" role="menuitem" disabled={off || !piece || piece.local} onClick={() => onSheet('history')}>History</button>
      <button className="cl-item" role="menuitemcheckbox" aria-checked={!!(piece && piece.voice)} disabled={off || !piece || piece.local} onClick={onVoice}>{piece && piece.voice ? 'Stop using as a voice sample' : 'Use as a voice sample'}</button>
      <button className="cl-item" role="menuitem" disabled={off} onClick={() => onSheet('guidance')}>Your guidance</button>
      <button className="cl-item" role="menuitem" onClick={() => onSheet('library')}>All methods</button>
      <div className="cl-sep" />
      <button className="cl-item" role="menuitem" onClick={() => onSheet('room')}>The room</button>
      <button className="cl-item" role="menuitemcheckbox" aria-checked={shape} onClick={onShape}>{shape ? 'Hide the shape' : 'Show the shape'}</button>
      <button className="cl-item" role="menuitem" disabled={off || !piece || piece.local} onClick={onTrash}>Move to trash</button>
      <button className="cl-item" role="menuitem" disabled={off || !trash} onClick={() => onSheet('trash')}>Trash<small>{trash || ''}</small></button>
      <div className="cl-sep" />
      <button className="cl-item" role="menuitem" onClick={() => onSheet('about')}>About The Clearing</button>
    </div>
  )
}

function FinishSheet({ title, body, piece, conn, onClose, onFinished, flush }) {
  const [status, setStatus] = useState(null)
  const [word, setWord] = useState(null)
  const say = (ok, text) => setStatus({ ok, text })
  async function copy(kind) {
    const text = kind === 'md' ? asMarkdown(title, body) : asPlainText(title, body)
    try {
      const ok = api && api.os && api.os.writeClipboard ? await api.os.writeClipboard(text) : (navigator.clipboard ? (await navigator.clipboard.writeText(text), true) : false)
      say(ok !== false, ok !== false ? (kind === 'md' ? 'Copied as Markdown.' : 'Copied as plain text.') : "Couldn't reach the clipboard. Try again.")
    } catch (e) { say(false, "Couldn't reach the clipboard. Try again.") }
  }
  async function saveFile(ext) {
    const files = api && api.files
    if (!files || typeof files.requestFolder !== 'function') { say(false, 'This version of Hermes cannot save files for plugins. Copy the text instead.'); return }
    try {
      let folder = ((await files.folders()) || [])[0]
      if (!folder) {
        const picked = await files.requestFolder()
        if (!picked || !picked.ok || !picked.folder) { say(false, 'No folder chosen. Nothing was saved.'); return }
        folder = picked.folder
      }
      const text = ext === 'md' ? asMarkdown(title, body) : asPlainText(title, body)
      const base = fileName(title, ext)
      for (let n = 1; n < 50; n++) {
        const name = n === 1 ? base : base.replace(new RegExp(`\\.${ext}$`), ` (${n}).${ext}`)
        const r = await files.writeText(folder.id, name, text, { exclusive: true })
        if (r && r.ok) { say(true, `Saved ${name} in ${folder.name}.`); return }
        if (!r || r.error !== 'exists') {
          if (r && (r.error === 'not-granted' || r.error === 'folder-missing' || r.error === 'folder-changed')) { await files.release(folder.id); say(false, 'That folder is no longer available. Save again to choose a folder.'); return }
          say(false, (r && r.message) || "Couldn't save the file. Try again."); return
        }
      }
      say(false, 'Too many files with that name. Rename the piece, then save.')
    } catch (e) { say(false, "Couldn't save the file. Try again.") }
  }
  async function saveWord() {
    if (conn !== 'ok' || !piece || piece.local) { say(false, "The Clearing's saving is off, so a Word file can't be made yet. Copy the text instead."); return }
    const save = typeof captureGatewayFileDownload === 'function' ? captureGatewayFileDownload() : null
    try {
      const r = await post('/export/docx', { title, body })
      setWord({ ...r, dialog: !!save })
      if (save) { await save(r.path, r.name); say(true, `${r.name} is ready.`) } else say(true, `Saved ${r.name} in The Clearing's data folder.`)
    } catch (e) { const err = errorOf(e); say(false, err.offline ? "The Clearing's saving is off. Copy the text instead." : err.detail) }
  }
  async function markFinished() {
    if (conn !== 'ok' || !piece || piece.local) { say(false, "The Clearing's saving is off, so this version can't be marked yet."); return }
    try { await flush(); const p = await post(`/pieces/${piece.id}/finish`, { title, body }); onFinished(p); say(true, 'This version is marked finished. Find it in History.') } catch (e) { say(false, errorOf(e).detail) }
  }
  return (
    <div className="cl-sheet" role="dialog" aria-label="Finish">
      <h2>Finish</h2>
      <p>{plural(wordCount(body), 'word', 'words')}{piece && piece.finished_version ? ' · a version is already marked finished' : ''}</p>
      <div className="cl-actions">
        <button className="cl-btn" data-v="ghost" onClick={() => copy('md')}>Copy as Markdown</button>
        <button className="cl-btn" data-v="ghost" onClick={() => copy('txt')}>Copy as plain text</button>
        <button className="cl-btn" data-v="ghost" onClick={() => saveFile('md')}>Save as .md</button>
        <button className="cl-btn" data-v="ghost" onClick={() => saveFile('txt')}>Save as .txt</button>
        <button className="cl-btn" data-v="ghost" onClick={saveWord}>Save as Word</button>
        {word && !word.dialog && api && api.os && api.os.revealPath ? <button className="cl-btn" data-v="ghost" onClick={() => api.os.revealPath(word.path)}>Show the Word file</button> : <span />}
      </div>
      <div className="cl-row">
        <button className="cl-btn" data-v="primary" onClick={markFinished}>Mark this version finished</button>
        <button className="cl-btn" data-v="link" onClick={onClose}>Close</button>
      </div>
      {status && <p className="cl-status" role="status"><Icon name={status.ok ? 'check' : 'alert'} /><span>{status.text}</span></p>}
    </div>
  )
}

function HistorySheet({ piece, current = '', onClose, onRestore, flush }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { (async () => { try { await flush(); setData(await rest(`/pieces/${piece.id}/versions`)) } catch (e) { setErr(errorOf(e).detail) } })() }, [piece && piece.id])
  async function restore(v) {
    try { onRestore(await post(`/pieces/${piece.id}/versions/${v.id}/restore`)) } catch (e) { setErr(errorOf(e).detail) }
  }
  return (
    <div className="cl-sheet" role="dialog" aria-label="History">
      <h2>History</h2>
      {err && <p className="cl-status"><Icon name="alert" /><span>{err}</span></p>}
      {!data && !err && <p>Loading</p>}
      {data && (data.versions.length ? (
        <div className="cl-versions">
          {data.versions.map((v, i) => (
            <div className="cl-version" key={v.id}>
              <b>{v.id === data.finished ? 'Finished' : v.label}</b>
              <span>{timeAgo(v.created)} · {plural(v.words, 'word', 'words')}</span>
              {v.start === current.slice(0, 140) && v.words === wordCount(current) ? <span className="cl-version-now">Same as the page</span> : <button className="cl-btn" data-v="ghost" onClick={() => restore(v)}>Restore</button>}
              {v.changed ? <p className="cl-version-change">{v.changed.kind === 'cut' ? <s>{v.changed.text}</s> : `“${v.changed.text}”`}</p> : null}
            </div>
          ))}
        </div>
      ) : <p>No versions yet. One is kept each time you pause for two minutes, keep the editor's changes, or finish.</p>)}
      {data && data.suggested && data.suggested.length ? <>
        <h3>Suggested text you used</h3>
        <div className="cl-versions">{data.suggested.slice(0, 12).map((u, i) => (
          <div className="cl-version cl-used" key={i}>
            <b>{USED[u.kind] || u.label}</b>
            <span title={u.model ? `Written by ${u.model}` : undefined}>{timeAgo(u.created)}</span>
            <p className="cl-sample">“{u.chosen.length > 160 ? `${u.chosen.slice(0, 157).trimEnd()}…` : u.chosen}”</p>
          </div>
        ))}</div>
      </> : null}
      <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={onClose}>Close</button></div>
    </div>
  )
}

function TrashSheet({ onClose, onRestore }) {
  const [items, setItems] = useState(null)
  useEffect(() => { rest('/pieces').then(r => setItems(r.trash)).catch(() => setItems([])) }, [])
  return (
    <div className="cl-sheet" role="dialog" aria-label="Trash">
      <h2>Trash</h2>
      <p>Pieces in the trash are kept until you restore them.</p>
      <div className="cl-versions">
        {(items || []).map(p => (
          <div className="cl-version" key={p.id}>
            <b>{p.title || 'Untitled'}</b><span>{plural(p.words, 'word', 'words')} · moved {timeAgo(p.trashed)}</span>
            <button className="cl-btn" data-v="ghost" onClick={() => onRestore(p.id)}>Restore</button>
          </div>
        ))}
        {items && !items.length ? <p>The trash is empty.</p> : null}
      </div>
      <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={onClose}>Close</button></div>
    </div>
  )
}

function RoomSheet({ scene, look, picture, conn, suggestions, onSuggestions, onPicture, onScene, onLook, onClose }) {
  const [status, setStatus] = useState(null)
  const fileRef = useRef(null)
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const shown = sceneShown(scene, dark)
  const row = (label, value, options, set, wrap) => (
    <div className="cl-setting" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="cl-choices" data-wrap={wrap ? '' : undefined}>{options.map(([v, l]) => <button key={v} className="cl-choice" aria-pressed={value === v} onClick={() => set(v)}>{l}</button>)}</div>
    </div>
  )
  async function upload(file) {
    if (!file) return
    if (file.size > 6 * 1024 * 1024) { setStatus({ ok: false, text: 'That picture is larger than 6 MB. Choose a smaller one, or save it smaller first.' }); return }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setStatus({ ok: false, text: 'Choose a JPEG, PNG or WebP picture.' }); return }
    setStatus({ ok: true, text: 'Adding your picture' })
    try {
      const r = await post('/scene/picture', { data: toBase64(new Uint8Array(await file.arrayBuffer())) })
      onPicture(r.data); onScene('own'); setStatus(null)
    } catch (e) { const x = errorOf(e); setStatus({ ok: false, text: x.offline ? "Your own picture needs The Clearing turned on. Turn it on in Settings, Plugins." : x.detail }) }
  }
  async function remove() {
    try { await post('/scene/picture/remove'); onPicture(null); onScene(dark ? 'tide' : 'snow'); setStatus({ ok: true, text: 'Your picture is removed.' }) } catch (e) { setStatus({ ok: false, text: errorOf(e).detail }) }
  }
  const pickScene = v => { setStatus(null); if (v === 'own' && !picture) { if (conn === 'ok') fileRef.current && fileRef.current.click(); else setStatus({ ok: false, text: "Your own picture needs The Clearing turned on. Turn it on in Settings, Plugins." }) } else onScene(v) }
  return (
    <div className="cl-sheet" role="dialog" aria-label="The room">
      <h2>The room</h2>
      {row('Scene', shown, SCENES, pickScene, true)}
      {shown === 'own' && picture ? <div className="cl-row" style={{ margin: '-4px 0 12px' }}>
        <button className="cl-btn" data-v="ghost" onClick={() => fileRef.current && fileRef.current.click()}>Change the picture</button>
        <button className="cl-btn" data-v="ghost" onClick={remove}>Remove it</button>
      </div> : null}
      <input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { upload(e.target.files && e.target.files[0]); e.target.value = '' }} />
      {row('Text', look.size, [['regular', 'Regular'], ['large', 'Larger']], v => onLook('size', v))}
      {row('Contrast', look.contrast, [['standard', 'Standard'], ['high', 'Stronger']], v => onLook('contrast', v))}
      {row('Suggested text', suggestions ? 'on' : 'off', [['on', 'Shown'], ['off', 'Off']], v => onSuggestions(v === 'on'))}
      <p style={{ marginTop: 10 }}>{suggestions ? 'Your model writes suggested rewrites, next sentences, endings and titles. Each one goes into your page only when you click Use this.' : "Off: your model points and asks but drafts no words. Quick check, other words and the editor's notes still work."}</p>
      {status && <p className="cl-status" role="status"><Icon name={status.ok ? 'check' : 'alert'} /><span>{status.text}</span></p>}
      <div className="cl-row" style={{ marginTop: 14 }}><button className="cl-btn" data-v="primary" onClick={onClose}>Done</button></div>
    </div>
  )
}

function AboutSheet({ onClose, onLibrary }) {
  const credits = additions.credits.filter(c => c.software)
  const link = c => <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={e => { if (api && api.os && api.os.openExternal) { e.preventDefault(); api.os.openExternal(c.url) } }}>{c.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
  return (
    <div className="cl-sheet cl-about" role="dialog" aria-labelledby="cl-about-title">
      <h2 id="cl-about-title">About The Clearing</h2>
      <p>A quiet page for writing, with your Hermes model as the editor. It reads your piece the way a good editor would, marks the passages worth changing, and shows a better version in your page. <b>Use this</b> puts a suggestion into your page, and <b>Undo</b> takes it out again.</p>
      <h3>Where your words go</h3>
      <p>Your pieces and their history are kept in Hermes's data folder. When you ask the editor for something, the piece or the passage you selected goes to the model you picked in Hermes: a model on your own machine keeps it there, and a cloud model sends it to that provider. Talk it through sends your voice to OpenAI to type it out. Quick check and Other words work without a model.</p>
      <h3>Credits</h3>
      <ul className="cl-credits">{credits.map(c => <li key={c.name}><b>{c.name}.</b> {c.what.replace(/\s*The notice is in [^ ]+\.txt\./, '')}{c.url ? <> {link(c)}</> : null}</li>)}</ul>
      <div className="cl-row cl-about-row"><button className="cl-btn" data-v="ghost" onClick={onLibrary}>All methods</button><button className="cl-btn" data-v="primary" onClick={onClose}>Close</button></div>
    </div>
  )
}

// The methods menu: everything in the library by group, each one a click away. The Ask line finds the
// same things from plain words.
function LibrarySheet({ targets, onClose, onRun }) {
  const menu = useMemo(() => libraryMenu(targets, additions), [targets])
  const [open, setOpen] = useState(() => store().get('libopen', 'Editor passes'))
  const toggle = t => setOpen(o => { const n = o === t ? null : t; store().set('libopen', n); return n })
  const item = t => (
    <button key={t.id} className="cl-libitem" onClick={() => onRun(t)}><strong>{t.title}</strong><span>{t.detail}</span></button>
  )
  return (
    <div className="cl-sheet cl-libsheet" role="dialog" aria-label="All methods">
      <h2>All methods</h2>
      <p>Choose one to run it on this piece. Select a passage first to run most of them on that passage only.</p>
      {menu.sections.map(sec => (
        <section key={sec.title} className="cl-libsec">
          <button className="cl-libhead" aria-expanded={open === sec.title} onClick={() => toggle(sec.title)}>
            <span>{sec.title}</span><small>{sec.items.length}</small>
          </button>
          {open === sec.title ? <div className="cl-libbody">
            {sec.detail ? <p>{sec.detail}</p> : null}
            {sec.parts ? sec.parts.map(part => <div key={part.title || 'first'}>{part.title ? <p className="cl-label2">{part.title}</p> : null}{part.items.map(item)}</div>) : sec.items.map(item)}
          </div> : null}
        </section>
      ))}
      <section className="cl-libsec">
        <button className="cl-libhead" aria-expanded={open === 'figures'} onClick={() => toggle('figures')}><span>{menu.figures.title}</span><small>{menu.figures.groups.reduce((n, g) => n + g.figures.length, 0)}</small></button>
        {open === 'figures' ? <div className="cl-libbody">
          <p>{menu.figures.detail}</p>
          {menu.figures.groups.map(g => (
            <div key={g.focus} className="cl-figgroup">
              <p className="cl-label2">{g.focus}</p>
              <dl className="cl-figs">{g.figures.map(f => <div key={f.name}><dt>{f.name}</dt><dd>{f.definition} <span className="cl-sample">{f.example}</span></dd></div>)}</dl>
              {g.target ? <button className="cl-btn" data-v="ghost" onClick={() => onRun(g.target)}>Try {g.focus.toLowerCase()} on this piece</button> : null}
            </div>
          ))}
        </div> : null}
      </section>
      <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={onClose}>Close</button></div>
    </div>
  )
}

// The writer's own guidance: rules kept across pieces, the voice samples, and the writing home.
function GuidanceSheet({ piece, conn, onClose, onVoice, onRun, onHome }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [edit, setEdit] = useState(null) // { id, text }
  const [add, setAdd] = useState({ section: 'voice', text: '' })
  const load = async () => { try { setData(await rest('/guidance')); setErr(null) } catch (e) { setErr(errorOf(e).detail) } }
  useEffect(() => { load() }, [])
  async function save(id, body) { try { await post(`/guidance/${id}`, body); setEdit(null); load() } catch (e) { setErr(errorOf(e).detail) } }
  async function addRule() { try { await post('/guidance', { section: add.section, text: add.text, source: 'writer' }); setAdd(a => ({ ...a, text: '' })); load() } catch (e) { setErr(errorOf(e).detail) } }
  const rules = data ? data.rules : []
  return (
    <div className="cl-sheet" role="dialog" aria-label="Your guidance">
      <h2>Your guidance</h2>
      <p>Rules you keep go to the editor on every pass and win over its own habits. A proposed rule is used only after you keep it, and you can remove any rule.</p>
      {err && <p className="cl-status"><Icon name="alert" /><span>{err}</span></p>}
      {!data && !err && <p>Loading</p>}
      {data && (rules.length ? Object.keys(SECTION_LABEL).filter(sec => rules.some(r => r.section === sec)).map(sec => (
        <div key={sec}>
          <h3>{SECTION_LABEL[sec]}</h3>
          <div className="cl-rules">{rules.filter(r => r.section === sec).map(r => edit && edit.id === r.id ? (
            <div className="cl-ruleitem" key={r.id}>
              <textarea className="cl-rule" aria-label="Edit the rule" rows={2} value={edit.text} onChange={e => setEdit({ id: r.id, text: e.target.value })} />
              <div className="cl-row"><button className="cl-btn" data-v="primary" onClick={() => save(r.id, { text: edit.text })}>Save</button><button className="cl-btn" data-v="link" onClick={() => setEdit(null)}>Cancel</button></div>
            </div>
          ) : (
            <div className="cl-ruleitem" key={r.id}>
              <p>{r.text}</p>
              {r.evidence ? <p className="cl-reason">From your words: <span className="cl-sample">“{r.evidence}”</span></p> : null}
              <div className="cl-row"><button className="cl-btn" data-v="ghost" onClick={() => setEdit({ id: r.id, text: r.text })}>Edit</button><button className="cl-btn" data-v="ghost" onClick={() => save(r.id, { status: 'retired' })}>Remove</button></div>
            </div>
          ))}</div>
        </div>
      )) : <p>No rules yet. Keep a lesson for next time, build guidance from your voice samples, or write one yourself below.</p>)}
      {data && <>
        <h3>Add a rule of your own</h3>
        <div className="cl-choices" role="group" aria-label="Area">{Object.entries(SECTION_LABEL).map(([k, l]) => <button key={k} className="cl-choice" aria-pressed={add.section === k} onClick={() => setAdd(a => ({ ...a, section: k }))}>{l}</button>)}</div>
        <textarea className="cl-rule" aria-label="Your rule" rows={2} placeholder="For example: I never open with a question." value={add.text} onChange={e => setAdd(a => ({ ...a, text: e.target.value }))} />
        <div className="cl-row" style={{ marginTop: 8 }}><button className="cl-btn" data-v="ghost" disabled={!add.text.trim()} onClick={addRule}>Keep this rule</button></div>
        <h3>Voice samples</h3>
        {data.samples.length
          ? <ul className="cl-credits">{data.samples.map(p => <li key={p.id}><b>{p.title || 'Untitled'}</b> · {plural(p.words, 'word', 'words')}</li>)}</ul>
          : <p>None yet. Mark a piece you wrote yourself as a voice sample; the voice check compares other pieces with it.</p>}
        {piece && !piece.local ? <div className="cl-row" style={{ marginTop: 8 }}><button className="cl-btn" data-v="ghost" disabled={conn !== 'ok'} onClick={async () => { await onVoice(); setTimeout(load, 300) }}>{piece.voice ? 'Stop using this piece as a sample' : 'Use this piece as a voice sample'}</button></div> : null}
      </>}
      <div className="cl-row">
        <button className="cl-btn" data-v="primary" onClick={onClose}>Close</button>
        <button className="cl-btn" data-v="ghost" disabled={!data || !data.samples.length} onClick={() => onRun('method:onboarding')}>Build your writing guidance</button>
        <button className="cl-btn" data-v="ghost" onClick={onHome}>Set up a writing home</button>
      </div>
    </div>
  )
}

// Set up a writing home: the plan first, then exclusive creation. No model.
function HomeSheet({ conn, onClose, flush }) {
  const [plan, setPlan] = useState(null)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = async () => { try { await flush(); setPlan(await rest('/home/plan')); setErr(null) } catch (e) { const x = errorOf(e); setErr(x.offline ? "The Clearing's saving is off, so the writing home can't be set up yet." : x.detail) } }
  useEffect(() => { load() }, [])
  async function go() {
    setBusy(true)
    try { setDone(await post('/home/setup', { fingerprint: plan.fingerprint })) } catch (e) { const x = errorOf(e); setErr(x.detail); if (x.status === 409) load() }
    setBusy(false)
  }
  const shown = plan ? plan.files.slice(0, 8) : []
  return (
    <div className="cl-sheet" role="dialog" aria-label="Set up a writing home">
      <h2>Set up a writing home</h2>
      <p>A folder of plain files: your guidance, your voice samples and your pieces as they are today. You can open it in any editor or hand it to another tool. Files already there are never changed. Built in, no AI needed.</p>
      {err && <p className="cl-status"><Icon name="alert" /><span>{err}</span></p>}
      {!plan && !err && <p>Loading</p>}
      {plan && !done && <>
        <h3>The plan</h3>
        <p>{plan.create ? `${plural(plan.create, 'file', 'files')} to create` : 'Nothing new to create'}{plan.keep ? `, ${plan.keep === 1 ? '1 file already there that stays as it is' : `${plan.keep} files already there that stay as they are`}` : ''}.</p>
        <div className="cl-versions">{shown.map(f => (
          <div className="cl-version" key={f.path}><b>{f.path}</b><span>{f.status === 'create' ? 'Will be created' : 'Already there, kept as it is'}</span></div>
        ))}</div>
        {plan.files.length > shown.length ? <p style={{ marginTop: 8 }}>And {plural(plan.files.length - shown.length, 'more file', 'more files')}.</p> : null}
      </>}
      {done && <>
        <h3>Done</h3>
        <p>{done.created.length ? `Created ${plural(done.created.length, 'file', 'files')}.` : 'No new files were needed.'}{done.kept.length ? (done.kept.length === 1 ? ' 1 file was already there and stays as you left it.' : ` ${done.kept.length} files were already there and stay as you left them.`) : ''}</p>
        {done.failed.length ? <p className="cl-status"><Icon name="alert" /><span>{plural(done.failed.length, 'file', 'files')} could not be written: {done.failed.slice(0, 4).join(', ')}. Check that the disk has room, then set it up again.</span></p> : null}
        <p>The folder: {done.folder}</p>
      </>}
      <div className="cl-row">
        {plan && !done ? <button className="cl-btn" data-v="primary" disabled={busy || conn !== 'ok' || !plan.create} onClick={go}>{busy ? 'Setting it up' : 'Set it up'}</button> : null}
        {(done || (plan && !plan.create)) && api && api.os && api.os.revealPath ? <button className="cl-btn" data-v={done ? 'primary' : 'ghost'} onClick={() => api.os.revealPath((done || plan).folder)}>Show the folder</button> : null}
        <button className="cl-btn" data-v="link" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
