// @jsxRuntime automatic
// Spot the figures and Find opportunities, the cards. Presentational only: the room owns state, the page and the
// network. The pattern follows Debate Workbench's figure panel: the name and plain definition (from the library), why
// it works in this exact line, and Try it, where the writer writes their own version and the coach answers with
// questions. Find opportunities is a ranked list; the open one carries Show me and Try it myself.
import { useEffect, useRef } from 'react'
import { canAskCoach, canUseMine, typeLine, whyLabel } from './spots.js'
import { Icon } from './desk.jsx'

const CloseIcon = () => <svg className="cl-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>

// Try it: the writer's own version of the line, the coach's reply, and Use mine.
export function TryIt({ m, state, onChange, onAsk, onUse, onCancel, label }) {
  const ref = useRef(null), said = useRef(null)
  useEffect(() => { if (ref.current) ref.current.focus({ preventScroll: true }) }, [m.id])
  useEffect(() => { if (state.reply && said.current && said.current.scrollIntoView) said.current.scrollIntoView({ block: 'nearest' }) }, [state.reply])
  const line = state.line
  return (
    <div className="cl-tryit">
      <label className="cl-tryit-label" htmlFor="cl-tryit-line">{label}</label>
      <textarea id="cl-tryit-line" ref={ref} className="cl-tryit-box" rows={3} value={line} onChange={e => onChange(e.target.value)} />
      {state.err ? <p className="cl-reason cl-warn"><Icon name="alert" /><span>{state.err}</span></p> : null}
      {state.reply ? <div className="cl-coach" role="status" ref={said}><span className="cl-coach-who">Coach</span><p>{state.reply}</p></div> : null}
      <div className="cl-row">
        <button className="cl-btn" data-v="primary" disabled={state.busy || !canAskCoach(line, m.quote)} onClick={onAsk}>{state.busy ? 'The coach is reading' : state.reply ? 'Ask again' : 'Ask the coach'}</button>
        <button className="cl-btn" data-v="ghost" disabled={!canUseMine(line, m.quote)} onClick={onUse}>Use mine</button>
        <button className="cl-btn cl-last" data-v="link" onClick={onCancel}>Close</button>
      </div>
    </div>
  )
}

// One figure the piece already uses, beside its words.
export function FigureNote({ m, pos, total, used, trying, tryit, onTry, onPrev, onNext, onClose, onUndo }) {
  return (
    <div className="cl-note cl-hero cl-spot" aria-label={`Figure: ${m.name}`}>
      <div className="cl-hero-head">
        <div className="cl-spot-title"><span className="cl-spot-kind">{typeLine(m)}</span><h3 className="cl-hero-title">{m.name}</h3></div>
        {total > 1 ? <span className="cl-hero-pos">{pos} of {total}</span> : null}
        <button className="cl-x" aria-label="Close the figures" onClick={onClose}><CloseIcon /></button>
      </div>
      <p className="cl-spot-def">{m.definition}</p>
      {used ? null : <p className="cl-hero-quote cl-spot-quote">{m.quote}</p>}
      <h4 className="cl-spot-h">{whyLabel(m)}</h4>
      <p className="cl-say">{m.text}</p>
      {used ? (
        <div className="cl-used-row"><p className="cl-say cl-usedline"><Icon name="check" /><span>Yours is in.</span></p><button className="cl-btn cl-undobtn" data-v="ghost" onClick={onUndo}>Undo</button>{pos < total ? <button className="cl-btn" data-v="link" onClick={onNext}>Next figure</button> : null}</div>
      ) : trying ? tryit : (
        <div className="cl-row">
          <button className="cl-btn" data-v="primary" onClick={onTry}>Try it</button>
          {pos < total ? <button className="cl-btn" data-v="ghost" onClick={onNext}>Next figure</button> : null}
          {pos > 1 ? <button className="cl-btn cl-last" data-v="link" onClick={onPrev}>Previous</button> : null}
        </div>
      )}
    </div>
  )
}

// Find opportunities: the ranked list, the open one expanded with its actions.
export function OppsList({ items, active, onPick, onClose, renderActive, model }) {
  return (
    <div className="cl-note cl-hero cl-spot cl-opps" aria-label="Opportunities">
      <div className="cl-hero-head">
        <h3 className="cl-hero-title">Opportunities in your piece</h3>
        <span className="cl-hero-pos">{items.length}</span>
        <button className="cl-x" aria-label="Close the opportunities" onClick={onClose}><CloseIcon /></button>
      </div>
      <ol className="cl-opps-list">
        {items.map(m => {
          const on = active && active.id === m.id
          return (
            <li key={m.id} className="cl-opp" data-on={on ? '' : undefined} data-done={m.status === 'used' || m.status === 'left' ? '' : undefined}>
              <button type="button" className="cl-opp-head" aria-expanded={on} onClick={() => onPick(m)}>
                <span className="cl-hero-n" aria-hidden="true">{m.n}</span>
                <span className="cl-opp-name"><b>{m.name}</b><span className="cl-spot-kind">{typeLine(m)}</span></span>
                {m.status === 'used' ? <span className="cl-opp-state">Used</span> : m.status === 'left' ? <span className="cl-opp-state">Left</span> : null}
              </button>
              {on ? <div className="cl-opp-body">{renderActive(m)}</div> : null}
            </li>
          )
        })}
      </ol>
      {model ? <p className="cl-prov" title={`Written by ${model}`}>Suggested by your model</p> : null}
    </div>
  )
}

export const CSS = `
/* Like the read card: never taller than the room above the Ask line; long content scrolls inside the card. */
.cl-margin .cl-spot{max-height:calc(100vh - 210px);overflow:auto;overscroll-behavior:contain}
.cl-spot .cl-hero-head{align-items:flex-start}
.cl-spot-title{flex:1;min-width:0;display:grid;gap:2px}
.cl-spot-kind{font-size:12.5px;font-weight:500;color:color-mix(in srgb,var(--cl-ink) 78%,transparent)}
.cl-spot-def{margin:0 0 10px !important;font-size:14px;line-height:1.5}
.cl-spot-h{margin:4px 0 4px !important;font-size:12.5px;font-weight:600}
.cl-spot-quote{white-space:normal;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.cl-tryit{display:grid;gap:8px;border-top:1px solid var(--cl-stroke);padding-top:10px;margin-top:4px}
.cl-tryit-label{font-size:13.5px;font-weight:500;line-height:1.4}
.cl-tryit-box{width:100%;box-sizing:border-box;font-family:var(--cl-page);font-size:16px;line-height:1.5;color:var(--cl-ink);background:var(--cl-wash);border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);padding:8px 10px;resize:vertical;outline:none}
.cl-tryit-box:focus-visible{box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-coach{display:grid;gap:2px;font-size:14.5px;line-height:1.5;padding:8px 10px;border-radius:var(--cl-radius);box-shadow:inset 2px 0 0 var(--cl-accent)}
.cl-coach p{margin:0 !important}
.cl-coach-who{font-size:12.5px;font-weight:600}
.cl-opps-list{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:2px}
.cl-opp{border-top:1px solid var(--cl-stroke)}
.cl-opp:first-child{border-top:0}
.cl-opp-head{all:unset;box-sizing:border-box;display:flex;align-items:flex-start;gap:10px;width:100%;padding:9px 2px;cursor:pointer;border-radius:var(--cl-radius)}
.cl-opp-head:hover{background:var(--cl-wash)}
.cl-opp-head:focus-visible{outline:2px solid var(--cl-accent);outline-offset:1px}
.cl-opp-name{flex:1;min-width:0;display:grid;gap:1px;font-size:14.5px;line-height:1.35}
.cl-opp-name b{font-weight:600}
.cl-opp-state{flex:none;font-size:12.5px;font-weight:500}
.cl-opp[data-done] .cl-opp-name b{text-decoration:line-through;text-decoration-color:var(--cl-stroke)}
.cl-opp-body{padding:0 0 10px 32px}
.cl-opp-body .cl-spot-def{font-size:13.5px}
.cl-text .cl-mk[data-kind=figure]{text-decoration-style:dotted;text-decoration-thickness:2px}
`
