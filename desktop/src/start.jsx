// @jsxRuntime automatic
// The blank page and Start from an idea. A new piece shows four ways in, in the page column. Start from an idea asks
// three questions in one form and shows the editor's outline and three openings, with any fact the answers didn't
// give drawn as a blank to fill in. Presentational only: the room sends the form and puts chosen text in the page.
import { useState } from 'react'
import { COPY, LIMIT, blanks, counter, validateStart } from './surfaces.js'
import { Icon } from './desk.jsx'

export function BlankWays({ canTalk = false, onIdea, onBringIn, onTalk, onType }) {
  const b = COPY.blank
  const rows = [
    { id: 'idea', label: b.idea, icon: 'idea', act: onIdea },
    { id: 'bring', label: b.bring, icon: 'bring', act: onBringIn },
    canTalk ? { id: 'talk', label: b.talk, icon: 'talk', act: onTalk } : null,
    { id: 'type', label: b.type, icon: 'type', act: onType },
  ].filter(Boolean)
  return (
    <section className="cl-start-ways" aria-labelledby="cl-start-ways-title">
      <h2 id="cl-start-ways-title" className="cl-start-waystitle">{b.title}</h2>
      <div className="cl-start-list">
        {rows.map(r => (
          <button key={r.id} type="button" className="cl-start-way" data-id={r.id} onClick={() => r.act && r.act()}>
            <Icon name={r.icon} /><span>{r.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

const FIELDS = ['who', 'what', 'know']

export function StartForm({ busy = false, initial, onSubmit, onCancel }) {
  const s = COPY.start
  const [answers, setAnswers] = useState(() => ({ who: '', what: '', know: '', ...(initial || {}) }))
  const [tried, setTried] = useState(false)
  const check = validateStart(answers)
  const submit = e => {
    e.preventDefault()
    setTried(true)
    if (busy || !check.ok) return
    onSubmit && onSubmit({ who: check.values.who, what: check.values.what, know: check.values.know })
  }
  return (
    <form className="cl-start-form" onSubmit={submit} aria-labelledby="cl-start-title" aria-busy={busy || undefined}>
      <h2 id="cl-start-title" className="cl-start-title">{s.title}</h2>
      {FIELDS.map((k, i) => {
        const left = counter(answers[k])
        return (
          <label key={k} className="cl-start-field">
            <span className="cl-start-q">{s[k]}</span>
            <textarea className="cl-start-input" name={k} rows={i === 2 ? 3 : 2} maxLength={LIMIT} value={answers[k]} disabled={busy}
              autoFocus={i === 0} aria-invalid={tried && check.errors[k] ? true : undefined}
              onChange={e => setAnswers(a => ({ ...a, [k]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e) }} />
            {left ? <span className="cl-start-count" aria-live="polite">{left}</span> : null}
          </label>
        )
      })}
      {tried && check.message ? <p className="cl-start-error" role="alert"><Icon name="alert" /><span>{check.message}</span></p> : null}
      <div className="cl-start-actions">
        <button type="submit" className="cl-btn" data-v="primary" aria-pressed={busy || undefined} disabled={busy || undefined}>
          {busy ? <><span>{s.working}</span><span className="cl-dots" aria-hidden="true"><i /><i /><i /></span></> : s.submit}
        </button>
        <button type="button" className="cl-btn" data-v="link" onClick={() => onCancel && onCancel()}>{s.cancel}</button>
      </div>
    </form>
  )
}

// A suggested line with its blanks drawn as blanks.
export function WithBlanks({ text }) {
  return blanks(text).map((p, i) => p.blank
    ? <span key={i} className="cl-start-blank" title={COPY.start.blank}><span className="cl-start-sr">{COPY.start.blank}: </span>{p.text}</span>
    : <span key={i}>{p.text}</span>)
}

export function StartResult({ result, onUseOpening, onUseOutline, onClose }) {
  const s = COPY.start
  const beats = Array.isArray(result && result.beats) ? result.beats.filter(b => typeof b === 'string' && b.trim()) : []
  const openings = Array.isArray(result && result.openings) ? result.openings.filter(o => o && typeof o.text === 'string' && o.text.trim()).slice(0, 3) : []
  return (
    <section className="cl-start-result" aria-labelledby="cl-start-beats">
      <h2 id="cl-start-beats" className="cl-start-head">{s.beats}</h2>
      <ul className="cl-start-beats">
        {beats.map((b, i) => <li key={i}><WithBlanks text={b} /></li>)}
      </ul>
      {openings.length ? <>
        <h3 className="cl-start-head">{s.openings}</h3>
        <div className="cl-start-openings" role="list">
          {openings.map((o, i) => (
            <button key={i} type="button" role="listitem" className="cl-start-opening" onClick={() => onUseOpening && onUseOpening(o.text)}>
              <span className="cl-start-text"><WithBlanks text={o.text} /></span>
              <span className="cl-start-foot"><span className="cl-start-how">{o.how || ''}</span><span className="cl-start-use">{s.use}</span></span>
              {Array.isArray(o.unsupported) && o.unsupported.length
                ? <span className="cl-start-flag"><Icon name="alert" />{COPY.read.adds} {o.unsupported.join(', ')}</span> : null}
            </button>
          ))}
        </div>
      </> : null}
      <div className="cl-start-actions">
        {beats.length ? <button type="button" className="cl-btn" data-v="ghost" onClick={() => onUseOutline && onUseOutline(beats)}>{s.outline}</button> : null}
        <button type="button" className="cl-btn" data-v="link" onClick={() => onClose && onClose()}>{s.close}</button>
      </div>
    </section>
  )
}

export const CSS = `
.cl-start-ways{font-family:var(--cl-sans);color:var(--cl-ink);max-width:420px;padding-top:4px}
.cl-start-waystitle{font-family:var(--cl-page);font-weight:400;font-size:19.5px;line-height:1.74;margin:0 0 14px}
.cl-start-list{display:grid}
.cl-start-way{display:flex;align-items:center;gap:12px;min-height:46px;font:inherit;font-size:14.5px;font-weight:500;color:var(--cl-ink);background:none;border:0;border-top:1px solid var(--cl-stroke);padding:11px 12px;cursor:pointer;text-align:left;transition:background-color 120ms ease}
.cl-start-way:last-child{border-bottom:1px solid var(--cl-stroke)}
.cl-start-way:hover{background:var(--cl-wash)}
.cl-start-form,.cl-start-result{font-family:var(--cl-sans);color:var(--cl-ink);background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:22px 24px 18px;max-width:560px}
.cl-start-title{font-size:18px;font-weight:600;line-height:1.3;margin:0 0 16px}
.cl-start-field{display:grid;gap:6px;margin:0 0 16px}
.cl-start-q{font-size:14.5px;font-weight:600;line-height:1.4}
.cl-start-input{font:inherit;font-size:15px;line-height:1.5;color:var(--cl-ink);background:var(--cl-paper);border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);padding:9px 11px;resize:vertical;min-height:44px;width:100%}
.cl-start-input:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-start-input[aria-invalid=true]{box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-start-count{justify-self:end;font-size:12.5px;font-variant-numeric:tabular-nums}
.cl-start-error{display:flex;align-items:center;gap:8px;font-size:13.5px;margin:-4px 0 14px !important}
.cl-start-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.cl-start-actions .cl-btn[data-v=primary]{display:inline-flex;align-items:center;gap:8px}
.cl-start-head{font-size:12.5px;font-weight:600;line-height:1.35;margin:0 0 8px;letter-spacing:.01em}
.cl-start-beats{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:0}
.cl-start-beats li{position:relative;font-size:14.5px;line-height:1.5;padding:7px 0 7px 16px;border-top:1px solid var(--cl-stroke)}
.cl-start-beats li:last-child{border-bottom:1px solid var(--cl-stroke)}
.cl-start-beats li::before{content:"";position:absolute;left:2px;top:calc(7px + .75em);width:6px;height:2px;background:var(--cl-accent)}
.cl-start-openings{display:grid;gap:8px;margin:0 0 16px}
.cl-start-opening{display:grid;gap:6px;width:100%;font:inherit;color:var(--cl-ink);background:none;border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);padding:12px 14px;cursor:pointer;text-align:left;transition:background-color 120ms ease,box-shadow 120ms ease}
.cl-start-opening:hover{background:var(--cl-wash);box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-start-text{font-family:var(--cl-page);font-size:16.5px;line-height:1.5}
.cl-start-how{font-size:12.5px;font-weight:600;line-height:1.35}
.cl-start-foot{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.cl-start-use{font-size:12.5px;font-weight:600;color:var(--cl-accent);white-space:nowrap}
.cl-start-flag{display:flex;align-items:center;gap:6px;font-size:12.5px;line-height:1.35}
.cl-start-blank{font-family:var(--cl-sans);font-size:.88em;font-style:normal;padding:0 3px;border-radius:2px;background:var(--cl-wash);text-decoration:underline dotted;text-decoration-color:var(--cl-accent);text-decoration-thickness:2px;text-underline-offset:4px}
.cl-start-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cl-start-ways button:focus-visible,.cl-start-result button:focus-visible{outline:2px solid var(--cl-accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.cl-start-way,.cl-start-opening{transition:none}}
`
