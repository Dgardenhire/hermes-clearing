// @jsxRuntime automatic
// The desk at rest: what the editor can do for this piece, in the margin on the scene. Read my piece leads (the one
// outlined primary); Ask the editor shows its one shortcut. Presentational only: the room owns state and network.
// Under 860 px it is a bottom bar of labeled buttons in the same order.
import { COPY, ICON, deskRows } from './surfaces.js'

export const Icon = ({ name }) => (
  <svg className="cl-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICON[name] || ''} /></svg>
)

export function Desk({ quickCount = 0, canRead = true, canAsk = true, canRewrite = false, canTalk = false, canBringIn = true, busy = false, resting = true, narrow = false, compact = false, modKey = 'Ctrl E', methodCount = 0, onLibrary, onRead, onPanel, onAsk, onRewrite, onBringIn, onTalk, onQuick, onFigures, onOpps }) {
  const all = deskRows({ quickCount, canRead, canAsk, canRewrite, canTalk, canBringIn, busy, modKey, methodCount: onLibrary ? methodCount : 0 })
  const act = { library: onLibrary, read: onRead, figures: onFigures, opps: onOpps, ask: onAsk, rewrite: onRewrite, bring: onBringIn, talk: onTalk, quick: onQuick }
  const faded = !resting
  if (narrow) {
    // Under 860 px: the bar keeps its five labeled buttons; Find figures of speech and Where to add a technique sit in a strip
    // just above it, beside Read my piece's column, while Read my piece can run.
    // All methods joins that strip, full width, so the bar itself stays at five.
    const rows = all.filter(r => r.id !== 'library')
    const lib = all.find(r => r.id === 'library')
    const beside = [...((rows[0] && rows[0].id === 'read' && rows[0].beside) || []), ...(lib ? [lib] : [])]
    return (
      <>
      {beside.length ? (
        <div className="cl-desk-strip" data-faded={faded ? '' : undefined} inert={faded || undefined}>
          {beside.map(x => <button key={x.id} type="button" className="cl-desk-side" data-id={x.id} onClick={() => act[x.id] && act[x.id]()}><Icon name={x.icon} /><span>{x.label}</span></button>)}
        </div>
      ) : null}
      <nav className="cl-desk-bar" aria-label={COPY.desk.label} data-faded={faded ? '' : undefined} inert={faded || undefined}
        style={{ '--cl-desk-n': rows.length }}>
        {rows.map(r => (
          <button key={r.id} type="button" className="cl-desk-tab" data-id={r.id} data-primary={r.primary ? '' : undefined}
            aria-pressed={r.id === 'read' ? !!r.busy : undefined} aria-busy={r.busy || undefined} disabled={r.busy || undefined}
            aria-label={r.id === 'quick' ? r.label : undefined} onClick={() => act[r.id] && act[r.id]()}>
            <span className="cl-desk-tabicon"><Icon name={r.icon} />{r.id === 'quick' && r.count ? <b className="cl-desk-count">{r.count}</b> : null}</span>
            <span className="cl-desk-tablabel">{r.short}</span>
          </button>
        ))}
      </nav>
      </>
    )
  }
  const rows = all
  return (
    <nav className="cl-desk" aria-label={COPY.desk.label} data-faded={faded ? '' : undefined} data-compact={compact ? '' : undefined} inert={faded || undefined}>
      {rows.map(r => r.id === 'read' ? (
        <div key="read" className="cl-desk-lead">
          <button type="button" className="cl-desk-read" aria-pressed={!!r.busy} aria-busy={r.busy || undefined} disabled={r.busy || undefined} onClick={() => onRead && onRead()}>
            <Icon name="read" /><span>{r.label}</span>
            {r.busy ? <span className="cl-dots cl-desk-dots" aria-hidden="true"><i /><i /><i /></span> : null}
            {r.busy ? <span className="cl-desk-sr">{COPY.desk.reading}</span> : null}
          </button>
          {r.beside.length ? (
            <div className="cl-desk-beside">
              {r.beside.map(x => <button key={x.id} type="button" className="cl-desk-side" data-id={x.id} onClick={() => act[x.id] && act[x.id]()}><Icon name={x.icon} /><span>{x.label}</span></button>)}
            </div>
          ) : null}
          {onPanel && !compact ? <button type="button" className="cl-desk-sub" onClick={() => onPanel()}>{r.sub.label}</button> : null}
        </div>
      ) : (
        <button key={r.id} type="button" className="cl-desk-row" data-id={r.id} onClick={() => act[r.id] && act[r.id]()}>
          <Icon name={r.icon} /><span className="cl-desk-label" aria-label={compact && r.tight !== r.label ? r.label : undefined}>{compact ? r.tight : r.label}</span>
          {r.key ? <kbd className="cl-desk-key">{r.key}</kbd> : null}
        </button>
      ))}
    </nav>
  )
}

// Appended to styles.js by the room lane. Only --cl-* variables (Hermes's --ui-* and --dt-* tokens underneath).
export const CSS = `
.cl-desk{display:grid;transition:opacity 200ms ease;font-family:var(--cl-sans)}
.cl-desk[data-faded],.cl-desk-bar[data-faded]{opacity:0;pointer-events:none}
.cl-desk > *{border-top:1px solid var(--cl-stroke)}
.cl-desk > *:last-child{border-bottom:1px solid var(--cl-stroke)}
.cl-desk-lead{display:grid;justify-items:start;gap:2px;padding:12px 0 10px}
.cl-desk-read{display:flex;align-items:center;gap:10px;width:100%;font:inherit;font-size:14px;font-weight:600;line-height:1.3;color:var(--cl-accent);background:none;border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1.5px var(--cl-accent);padding:10px 12px;cursor:pointer;text-align:left;transition:background-color 120ms ease}
.cl-desk-read:hover{background:var(--cl-wash)}
.cl-desk-read[aria-pressed=true]{background:var(--cl-wash);cursor:default;box-shadow:inset 0 0 0 1.5px var(--cl-accent),inset 0 2px 3px color-mix(in srgb,var(--cl-base) 10%,transparent)}
.cl-desk-read:disabled{color:var(--cl-accent)}
.cl-desk-dots{margin-left:auto}
.cl-desk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cl-desk-sub{font:inherit;font-size:12.5px;font-weight:500;line-height:1.3;color:var(--cl-ink);background:none;border:0;padding:6px 12px 2px;cursor:pointer;text-decoration:underline;text-decoration-color:var(--cl-stroke);text-underline-offset:3px;border-radius:var(--cl-radius)}
.cl-desk-sub:hover{text-decoration-color:var(--cl-accent)}
.cl-desk-beside{display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%;margin-top:6px}
.cl-desk-side{display:flex;align-items:center;gap:7px;min-width:0;min-height:36px;font:inherit;font-size:13px;font-weight:500;line-height:1.25;color:var(--cl-ink);background:none;border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);padding:7px 9px;cursor:pointer;text-align:left;transition:background-color 120ms ease}
.cl-desk-side:hover{background:var(--cl-wash);box-shadow:inset 0 0 0 1px var(--cl-accent)}
.cl-desk-side span{min-width:0;overflow-wrap:anywhere}
.cl-desk-strip{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin-bottom:4px;background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);transition:opacity 200ms ease;font-family:var(--cl-sans)}
.cl-desk-strip[data-faded]{opacity:0;pointer-events:none}
.cl-desk-strip .cl-desk-side{justify-content:center}
.cl-desk-strip .cl-desk-side[data-id=library]{grid-column:1/-1}
.cl-desk-row[data-id=library] .cl-desk-label{font-variant-numeric:tabular-nums}
.cl-desk-row{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;font:inherit;font-size:14px;font-weight:500;line-height:1.3;color:var(--cl-ink);background:none;border:0;padding:10px 12px;cursor:pointer;text-align:left;transition:background-color 120ms ease}
.cl-desk-row:hover{background:var(--cl-wash)}
.cl-desk-label{min-width:0;overflow-wrap:anywhere}
.cl-desk-row[data-id=quick] .cl-desk-label{font-variant-numeric:tabular-nums}
.cl-desk-key{margin-left:auto;font:inherit;font-size:12.5px;font-weight:500;padding:2px 6px;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);white-space:nowrap}
.cl-desk-bar{display:grid;grid-template-columns:repeat(var(--cl-desk-n,5),minmax(0,1fr));gap:2px;padding:4px;background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);transition:opacity 200ms ease;font-family:var(--cl-sans)}
.cl-desk-tab{display:grid;justify-items:center;align-content:center;gap:4px;min-width:0;min-height:52px;font:inherit;font-size:12.5px;font-weight:500;line-height:1.2;color:var(--cl-ink);background:none;border:0;border-radius:var(--cl-radius);padding:6px 4px;cursor:pointer;text-align:center}
.cl-desk-tab:hover{background:var(--cl-wash)}
.cl-desk-tab[data-primary]{color:var(--cl-accent);box-shadow:inset 0 0 0 1.5px var(--cl-accent);font-weight:600}
.cl-desk-tab[aria-pressed=true]{background:var(--cl-wash);cursor:default}
.cl-desk-tabicon{display:inline-flex;align-items:center;gap:5px}
.cl-desk-tablabel{max-width:100%;overflow-wrap:anywhere}
.cl-desk-count{font-weight:600;font-size:12.5px;font-variant-numeric:tabular-nums;min-width:18px;padding:0 5px;border-radius:var(--cl-radius);background:var(--cl-wash)}
/* Compact: under an open read card, where the margin has little height left. Read my piece keeps its full row; the
   other actions sit beside each other as small labeled buttons, in the same order. Get three editors' reads moves to
   the foot of the read card. */
.cl-desk[data-compact]{display:flex;flex-wrap:wrap;gap:2px 2px;padding-top:10px;border-top:1px solid var(--cl-stroke)}
.cl-desk[data-compact] > *,.cl-desk[data-compact] > *:last-child{border:0}
.cl-desk[data-compact] .cl-desk-lead{flex:1 0 100%;padding:0 0 4px}
.cl-desk[data-compact] .cl-desk-read{padding:8px 12px}
.cl-desk[data-compact] .cl-desk-row{width:auto;min-height:32px;padding:6px 9px;gap:7px;font-size:13px;border-radius:var(--cl-radius)}
.cl-desk[data-compact] .cl-desk-key{margin-left:2px;padding:1px 5px}
.cl-desk button:focus-visible,.cl-desk-bar button:focus-visible,.cl-desk-strip button:focus-visible{outline:2px solid var(--cl-accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.cl-desk,.cl-desk-bar,.cl-desk-read,.cl-desk-row,.cl-desk-side{transition:none}}
`
