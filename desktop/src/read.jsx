// @jsxRuntime automatic
// Read my piece, in the margin card. While it runs: only the server's own steps, a live counter and Stop, never a
// percentage. When it lands: the verdict, then the changes in order (the only numbered labels in the plugin, because
// the order is the content), each headed by the change itself; the open one shows the writer's words, why, and Show
// me (the page underlines every change's words, so a closed change is its headline alone). Then Cut this first.
// Presentational only: the room polls the pass and draws the marks in the page.
import { COPY, addsLine, partialChanges, progressLine, readView } from './surfaces.js'
import { Icon } from './desk.jsx'

export function ReadProgress({ phase, words, elapsed, sections, partial, onStop }) {
  const p = progressLine({ phase, words, elapsed, sections })
  const first = partialChanges(partial)
  return (
    <section className="cl-note cl-read-progress" aria-labelledby="cl-read-now">
      <ol className="cl-read-steps">
        {p.steps.map((s, i) => {
          const now = i === p.steps.length - 1
          return (
            <li key={s.phase || 'start'} className="cl-read-step" data-done={s.done ? '' : undefined} data-now={now ? '' : undefined}>
              {s.done ? <Icon name="check" /> : <span className="cl-dots" aria-hidden="true"><i /><i /><i /></span>}
              <span id={now ? 'cl-read-now' : undefined} role={now ? 'status' : undefined} aria-live={now ? 'polite' : undefined}>{s.text}</span>
            </li>
          )
        })}
      </ol>
      {p.extra.length ? <p className="cl-read-extra">{p.extra.join(' · ')}</p> : null}
      {first.length ? (
        <div className="cl-read-first" aria-live="polite">
          <p className="cl-read-keephead">{COPY.read.firstNotes}</p>
          <ol className="cl-read-firstlist">{first.map((c, i) => <li key={i}>{c.kind === 'reporting' ? <span className="cl-read-kind">{COPY.read.reporting}</span> : null}{c.headline}</li>)}</ol>
        </div>
      ) : null}
      <div className="cl-row">
        <button type="button" className="cl-btn cl-read-stop" data-v="ghost" onClick={() => onStop && onStop()}><Icon name="stop" /><span>{COPY.read.stop}</span></button>
      </div>
    </section>
  )
}

function Flags({ list }) {
  const line = addsLine(list)
  return line ? <p className="cl-read-flag"><Icon name="alert" /><span>{line}</span></p> : null
}

export function ReadResult({ result, sample = false, activeRank, onShow, onFocus, onCutFirst, onRunOwn, onPanel, onQuery, renderActions, cutRow, cut, done, used }) {
  const v = readView(result)
  const r = COPY.read
  const active = v.changes.some(c => c.rank === activeRank) ? activeRank : v.changes.length ? v.changes[0].rank : null
  return (
    <section className="cl-note cl-read" aria-label={COPY.desk.read}>
      {sample ? (
        <p className="cl-read-sample">
          <span>{r.sample}</span>{' '}
          <button type="button" className="cl-read-link" onClick={() => onRunOwn && onRunOwn()}>{r.runOwn}</button>
        </p>
      ) : null}
      {v.genre ? <p className="cl-read-genre">{v.genre}</p> : null}
      {v.verdict ? <p className="cl-read-verdict">{v.verdict}</p> : null}
      {v.thin ? <p className="cl-read-thin">{v.message}</p> : null}
      {v.changes.length ? (
        <ol className="cl-read-changes" aria-label={r.changes}>
          {v.changes.map(c => {
            const on = c.rank === active
            return (
              <li key={c.rank} className="cl-read-change" data-on={on ? '' : undefined} data-used={used && used(c.n) ? '' : undefined}>
                <button type="button" className="cl-read-pick" aria-expanded={on} aria-current={on || undefined} onClick={() => onFocus && onFocus(c.rank, c)}>
                  <span className="cl-read-n" aria-hidden="true">{used && used(c.n) && !on ? <Icon name="check" /> : c.n}</span>
                  <span className="cl-read-headline">{c.kind === 'reporting' ? <span className="cl-read-kind" title={r.reportingTip}>{r.reporting}</span> : c.cut === true ? <span className="cl-read-kind">{r.cutTag}</span> : null}{c.headline}</span>
                </button>
                {on ? <div className="cl-read-body">
                  {on && c.quote && !(done && done(c)) ? <p className="cl-quote cl-read-quote">{c.quote}</p> : null}
                  {on && c.why && !(done && done(c)) ? <p className="cl-read-why">{c.why}</p> : null}
                  {on && !renderActions ? <Flags list={c.flags} /> : null}
                  {on && renderActions ? renderActions(c) : on ? (
                    <div className="cl-row">
                      {c.try
                        ? <button type="button" className="cl-btn" data-v="primary" onClick={() => onShow && onShow(c)}>{r.show}</button>
                        : <button type="button" className="cl-btn" data-v="ghost" onClick={() => onFocus && onFocus(c.rank, c)}>{r.goTo}</button>}
                    </div>
                  ) : null}
                </div> : null}
              </li>
            )
          })}
        </ol>
      ) : null}
      {v.keep ? (
        <div className="cl-read-keep">
          <p className="cl-read-keephead">{r.keep}</p>
          <p className="cl-quote cl-read-quote cl-read-keepquote">{v.keep.quote}</p>
          {v.keep.why ? <p className="cl-read-why">{v.keep.why}</p> : null}
        </div>
      ) : null}
      {v.query ? (
        <div className="cl-read-query">
          <button type="button" className="cl-read-cuthead" onClick={() => onQuery && onQuery(v.query)}><Icon name="alert" /><span>{r.query}</span></button>
          <p className="cl-read-why">{v.query.question}</p>
        </div>
      ) : null}
      {v.holds ? <p className="cl-read-holds"><strong>{v.holds.line}</strong>{v.holds.reason ? ` ${v.holds.reason}` : ''}</p> : null}
      {v.cut && (cut !== null || cutRow) ? (
        <div className="cl-read-cut">
          <button type="button" className="cl-read-cuthead" onClick={() => onCutFirst && onCutFirst(v.cut)}><Icon name="cut" /><span>{r.cut}</span></button>
          <p className="cl-quote cl-read-quote cl-read-struck">{String(v.cut.quote).replace(/^[,;:]\s*/, '')}</p>
          {v.cut.why ? <p className="cl-read-why">{v.cut.why}</p> : null}
          {cutRow || null}
        </div>
      ) : null}
      {onPanel ? <button type="button" className="cl-read-link cl-read-panel" onClick={() => onPanel()}>{r.panel}</button> : null}
    </section>
  )
}

export const CSS = `
.cl-read{font-family:var(--cl-sans)}
.cl-read-sample{font-size:12.5px;line-height:1.45;margin:0 0 10px !important;padding:0 0 9px;border-bottom:1px solid var(--cl-stroke)}
.cl-read-link{font:inherit;font-size:12.5px;font-weight:500;color:var(--cl-ink);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-decoration-color:var(--cl-accent);text-underline-offset:3px;border-radius:var(--cl-radius)}
.cl-read-verdict{font-size:14px;line-height:1.5;margin:0 0 12px !important}
.cl-read-thin{font-size:14.5px;line-height:1.55;margin:0 0 12px !important}
.cl-read-changes{list-style:none;margin:0;padding:0;display:grid}
.cl-read-change{border-top:1px solid var(--cl-stroke);padding:8px 0}
.cl-read-change:last-child{border-bottom:1px solid var(--cl-stroke)}
.cl-read-pick{display:flex;align-items:baseline;gap:10px;width:100%;font:inherit;color:var(--cl-ink);background:none;border:0;padding:2px 0;cursor:pointer;text-align:left;border-radius:var(--cl-radius)}
.cl-read-n{flex:none;display:inline-grid;place-items:center;width:20px;height:20px;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);transform:translateY(-1px)}
.cl-read-change[data-on] .cl-read-n{color:var(--cl-accent);box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-read-headline{font-size:15px;font-weight:600;line-height:1.35;min-width:0}
.cl-read-change:not([data-on]) .cl-read-headline{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cl-read-body{padding-left:30px}
.cl-read-quote{margin:3px 0 0 !important;font-size:14.5px;line-height:1.4}
.cl-read-quote{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl-read-change[data-on] .cl-read-quote{font-size:15px;line-height:1.45;margin:4px 0 8px !important}
.cl-read-why{font-size:14px;line-height:1.45;margin:0 0 10px !important}
.cl-read-flag{display:flex;align-items:flex-start;gap:7px;font-size:13px;line-height:1.45;margin:-4px 0 12px !important}
.cl-read-flag svg.cl-i{margin-top:2px}
.cl-read-holds{font-size:13.5px;line-height:1.5;margin:12px 0 0 !important}
.cl-read-holds strong{font-weight:600}
.cl-read-cut{margin-top:10px}
.cl-read-query{margin-top:10px}
.cl-read-genre{font-size:12.5px;font-weight:600;margin:0 0 6px !important}
.cl-read-first{margin:4px 0 12px;padding-top:10px;border-top:1px solid var(--cl-stroke)}
.cl-read-firstlist{margin:4px 0 0;padding-left:20px;display:grid;gap:4px;font-size:14px;line-height:1.4}
.cl-read-keep{margin:12px 0 0;padding:6px 0 6px 12px;box-shadow:inset 2px 0 0 var(--cl-accent)}
.cl-read-keephead{font-size:12.5px;font-weight:600;margin:0 0 2px !important}
.cl-read-keep .cl-read-keepquote{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:15px;margin:0 0 4px !important}
.cl-read-keep .cl-read-why{margin:0 !important;font-size:13px}
.cl-read-change[data-used] .cl-read-n svg.cl-i{width:13px;height:13px}
.cl-read-pair{font-size:13px;line-height:1.45;margin:-2px 0 10px !important}
.cl-read-kind{display:inline-block;font-size:12.5px;font-weight:600;color:var(--cl-accent);margin-right:6px}
.cl-read-query .cl-read-why{padding-left:23px;margin:2px 0 0 !important;font-size:13.5px}
.cl-read-cuthead{display:flex;align-items:center;gap:8px;font:inherit;font-size:13.5px;font-weight:600;color:var(--cl-ink);background:none;border:0;padding:2px 0;cursor:pointer;border-radius:var(--cl-radius)}
.cl-read-cuthead:hover{color:var(--cl-accent)}
.cl-read-cut .cl-read-quote{margin:2px 0 4px !important;padding-left:23px}
.cl-read-cut .cl-read-why{padding-left:23px;margin:0 !important;font-size:13.5px}
.cl-read-struck{text-decoration:line-through;text-decoration-color:var(--cl-accent);text-decoration-thickness:1.5px}
.cl-read-panel{display:block;margin-top:12px}
.cl-read button:focus-visible,.cl-read-progress button:focus-visible{outline:2px solid var(--cl-accent);outline-offset:2px}
.cl-read-progress{font-family:var(--cl-sans)}
.cl-read-steps{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:8px}
.cl-read-step{display:flex;align-items:center;gap:10px;font-size:14.5px;line-height:1.4;font-variant-numeric:tabular-nums}
.cl-read-step[data-done]{font-size:13.5px}
.cl-read-step .cl-dots{width:15px;justify-content:center}
.cl-read-extra{font-size:13px;line-height:1.45;margin:0 0 12px 25px !important;font-variant-numeric:tabular-nums}
.cl-read-stop{display:inline-flex;align-items:center;gap:7px;margin-top:6px}
`
