// @jsxRuntime automatic
// First open on a fresh profile: one card on the scene. It says what the room is and offers three ways in, with the
// sample first. The page behind it already takes a paste, so the card never takes the focus; Esc closes it into the
// blank page. Presentational only.
import { useEffect, useRef } from 'react'
import { COPY } from './surfaces.js'
import { Icon } from './desk.jsx'

export function Welcome({ onSample, onNew, onBringIn, onModelSettings, onClose }) {
  const close = useRef(onClose || onNew)
  close.current = onClose || onNew
  useEffect(() => {
    const key = e => { if (e.key === 'Escape' && !e.defaultPrevented && close.current) { e.preventDefault(); close.current() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const w = COPY.welcome
  return (
    <div className="cl-welcome-place">
      <section className="cl-welcome" role="dialog" aria-modal="false" aria-labelledby="cl-welcome-title" aria-describedby="cl-welcome-line">
        <h2 id="cl-welcome-title" className="cl-welcome-title">{w.title}</h2>
        <p id="cl-welcome-line" className="cl-welcome-line">{w.line}</p>
        <p className="cl-welcome-privacy">{w.privacy}</p>
        <div className="cl-welcome-ways">
          <button type="button" className="cl-btn cl-welcome-way" data-v="primary" onClick={() => onSample && onSample()}><Icon name="sample" /><span>{w.sample}</span></button>
          <button type="button" className="cl-btn cl-welcome-way" data-v="ghost" onClick={() => onNew && onNew()}><Icon name="fresh" /><span>{w.fresh}</span></button>
          <button type="button" className="cl-btn cl-welcome-way" data-v="ghost" onClick={() => onBringIn && onBringIn()}><Icon name="bring" /><span>{w.bring}</span></button>
        </div>
        <button type="button" className="cl-welcome-models" onClick={() => onModelSettings && onModelSettings()}>{w.models}<Icon name="arrow" /></button>
      </section>
    </div>
  )
}

export const CSS = `
.cl-welcome-place{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:20px;pointer-events:none}
.cl-welcome{pointer-events:auto;width:min(440px,100%);background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:30px 32px 22px;font-family:var(--cl-sans);color:var(--cl-ink);animation:cl-welcome-in 200ms ease-out both}
.cl-welcome-title{font-family:var(--cl-page);font-weight:400;font-size:32px;line-height:1.15;letter-spacing:-.01em;margin:0 0 10px}
.cl-welcome-line{font-size:15.5px;line-height:1.5;margin:0 0 10px !important;max-width:34ch}
.cl-welcome-privacy{font-size:13.5px;line-height:1.5;margin:0 0 22px !important;max-width:40ch}
.cl-welcome-ways{display:grid;gap:8px}
.cl-welcome-way{display:flex;align-items:center;gap:10px;width:100%;font-size:14px;padding:11px 14px;text-align:left}
.cl-welcome-way[data-v=primary]{font-weight:600}
.cl-welcome-models{display:inline-flex;align-items:center;gap:6px;margin-top:18px;font:inherit;font-size:13px;font-weight:500;color:var(--cl-ink);background:none;border:0;padding:4px 0;cursor:pointer;text-decoration:underline;text-decoration-color:var(--cl-stroke);text-underline-offset:3px;border-radius:var(--cl-radius)}
.cl-welcome-models:hover{text-decoration-color:var(--cl-accent)}
.cl-welcome-models svg.cl-i{width:13px;height:13px}
.cl-welcome button:focus-visible{outline:2px solid var(--cl-accent);outline-offset:2px}
@keyframes cl-welcome-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.cl-welcome{animation:none}}
@container (max-width:600px){.cl-welcome{padding:24px 22px 18px}.cl-welcome-title{font-size:28px}}
`
