// The room's stylesheet. Colors come only from Hermes theme variables (--ui-*, --dt-*, --radius-*), so the
// room follows light and dark and the writer's accent live. The writer's words are set in Libre Caslon Text;
// everything the editor or the app says is in Hermes's own sans. Nothing is dimmed below 94% of the theme's
// text color, nothing is set below 12.5px, and corners follow the host's --radius-md (2px).
import { FONT_ITALIC, FONT_REGULAR, SCENE_DARK, SCENE_LIGHT, SCENE_MARSH } from './assets.gen.js'

export const CSS = `
@font-face{font-family:"Clearing Caslon";src:url(${FONT_REGULAR}) format("truetype");font-weight:400 700;font-style:normal;font-display:block}
@font-face{font-family:"Clearing Caslon";src:url(${FONT_ITALIC}) format("truetype");font-weight:400 700;font-style:italic;font-display:block}
.cl-room{
  --cl-base:var(--ui-base,currentColor);
  --cl-ink:var(--ui-text-primary,color-mix(in srgb,var(--cl-base) 94%,transparent));
  --cl-accent:var(--ui-accent,var(--dt-primary,currentColor));
  --cl-paper:var(--ui-bg-editor,Canvas);
  --cl-surface:var(--ui-bg-elevated,var(--cl-paper));
  --cl-on-accent:var(--dt-primary-foreground,var(--cl-paper));
  --cl-stroke:color-mix(in srgb,var(--cl-accent) 16%,color-mix(in srgb,var(--cl-base) 14%,transparent));
  --cl-mark:color-mix(in srgb,var(--cl-accent) 72%,var(--cl-base));
  --cl-wash:color-mix(in srgb,var(--cl-accent) 15%,transparent);
  --cl-radius:var(--radius-md,2px);
  --cl-shadow:0 0 0 1px color-mix(in srgb,var(--cl-base) 8%,transparent),0 .5rem .75rem -.375rem rgba(0,0,0,.08),0 1.25rem 1.75rem -.875rem rgba(0,0,0,.12);
  --cl-page:"Clearing Caslon","Libre Caslon Text",Charter,Georgia,serif;
  --cl-sans:var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);
  --cl-scene:url(${SCENE_LIGHT});
  --cl-veil:color-mix(in srgb,var(--cl-paper) 34%,transparent);
  position:relative;height:100%;min-height:0;overflow:hidden;container-type:inline-size;
  background:var(--cl-scene) center 64%/cover no-repeat,var(--cl-paper);
  color:var(--cl-ink);font-family:var(--cl-sans);font-size:13.5px;line-height:1.45;-webkit-font-smoothing:antialiased;
}
:root.dark .cl-room{--cl-scene:url(${SCENE_DARK});--cl-veil:color-mix(in srgb,var(--cl-paper) 30%,transparent)}
.cl-room[data-contrast=high]{--cl-veil:color-mix(in srgb,var(--cl-paper) 64%,transparent);--cl-ink:var(--ui-text-primary,var(--cl-base))}
:root.dark .cl-room[data-contrast=high]{--cl-veil:color-mix(in srgb,var(--cl-paper) 62%,transparent)}
/* Every scene is its own choice in light and dark (Damon, Nov 8: dark mode used to swap every scene for Night Tide,
   so choosing one changed nothing). A light picture under a dark theme, or a dark picture under a light one, gets a
   deeper veil so the writer's words keep their contrast; the picture itself never changes. The writer's own picture
   arrives as --cl-scene on the room's style. */
.cl-room[data-scene=snow]{--cl-scene:url(${SCENE_LIGHT})}
.cl-room[data-scene=marsh]{--cl-scene:url(${SCENE_MARSH})}
.cl-room[data-scene=tide]{--cl-scene:url(${SCENE_DARK});--cl-veil:color-mix(in srgb,var(--cl-paper) 70%,transparent)}
.cl-room[data-scene=own]{--cl-veil:color-mix(in srgb,var(--cl-paper) 52%,transparent)}
/* At night the two light scenes keep their own cast under the veil (cold slate for snow, peat for the marsh), so they
   never read as the same grey (Loop 2 critics); the veil stays as dark as before, so the text keeps its contrast. */
:root.dark .cl-room[data-scene=snow]{--cl-scene:url(${SCENE_LIGHT});--cl-veil:color-mix(in srgb,color-mix(in srgb,var(--cl-paper) 70%,#1b2a40) 74%,transparent)}
:root.dark .cl-room[data-scene=marsh]{--cl-scene:url(${SCENE_MARSH});--cl-veil:color-mix(in srgb,color-mix(in srgb,var(--cl-paper) 70%,#2e2a17) 74%,transparent)}
:root.dark .cl-room[data-scene=tide]{--cl-scene:url(${SCENE_DARK});--cl-veil:color-mix(in srgb,var(--cl-paper) 30%,transparent)}
:root.dark .cl-room[data-scene=own]{--cl-veil:color-mix(in srgb,var(--cl-paper) 66%,transparent)}
.cl-room[data-scene=tide][data-contrast=high],.cl-room[data-scene=own][data-contrast=high]{--cl-veil:color-mix(in srgb,var(--cl-paper) 82%,transparent)}
:root.dark .cl-room[data-scene=snow][data-contrast=high],:root.dark .cl-room[data-scene=marsh][data-contrast=high],:root.dark .cl-room[data-scene=own][data-contrast=high]{--cl-veil:color-mix(in srgb,var(--cl-paper) 84%,transparent)}
:root.dark .cl-room[data-scene=tide][data-contrast=high]{--cl-veil:color-mix(in srgb,var(--cl-paper) 62%,transparent)}
.cl-room[data-scene=plain],:root.dark .cl-room[data-scene=plain]{--cl-scene:none}
.cl-room[data-size=large] .cl-text,.cl-room[data-size=large] .cl-body,.cl-room[data-size=large] .cl-preview{font-size:22px}
.cl-room[data-size=large] .cl-titlefield{font-size:44px}
.cl-room::before{content:"";position:absolute;inset:0;background:var(--cl-veil);pointer-events:none}
.cl-room[data-scene=plain]::before{display:none}
.cl-room *,.cl-room *::before,.cl-room *::after{box-sizing:border-box}
.cl-room p{margin:0}
.cl-room svg.cl-i{width:15px;height:15px;stroke:currentColor;stroke-width:1.5;fill:none;stroke-linecap:round;stroke-linejoin:round;flex:none}
/* The room is the size container; its children read the column plan. */
.cl-grid,.cl-overlay{--cl-cols:minmax(28px,146px) minmax(0,610px) minmax(28px,66px) 312px minmax(16px,1fr)}
/* On a wide pane the page and its margin sit together in the middle of the scene. */
@container (min-width:1400px){.cl-grid,.cl-overlay{--cl-cols:minmax(146px,1fr) 610px 66px 312px minmax(146px,1fr)}}
@container (max-width:1100px){.cl-grid,.cl-overlay{--cl-cols:minmax(20px,1fr) minmax(0,610px) 32px 280px 20px}}
@container (max-width:860px){.cl-grid,.cl-overlay{--cl-cols:20px minmax(0,1fr) 20px}}

/* top line: the title is the file menu */
.cl-top{position:absolute;z-index:4;top:0;left:0;right:0;height:54px;display:flex;align-items:center;gap:18px;padding:0 22px 0 20px;transition:opacity 160ms ease}
.cl-top[data-away]{opacity:0;pointer-events:none}
.cl-titlebtn{display:inline-flex;align-items:center;gap:6px;max-width:44%;font-family:var(--cl-page);font-size:16px;color:inherit;background:none;border:0;padding:4px 6px;border-radius:var(--cl-radius);cursor:pointer}
.cl-titlebtn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-titlebtn:hover,.cl-titlebtn[aria-expanded=true]{background:var(--cl-wash)}
.cl-count{font-variant-numeric:tabular-nums;white-space:nowrap}
.cl-grow{flex:1}
.cl-saved{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.cl-finish{font:inherit;color:inherit;background:none;border:1px solid var(--cl-stroke);padding:6px 14px;border-radius:var(--cl-radius);cursor:pointer}
.cl-finish:hover{background:var(--cl-wash)}
.cl-finish{white-space:nowrap}
.cl-history{display:inline-flex;gap:2px;margin-right:6px}
.cl-histbtn{display:inline-flex;align-items:center;gap:6px;font:inherit;color:inherit;background:none;border:0;padding:6px 9px;border-radius:var(--cl-radius);cursor:pointer;white-space:nowrap}
.cl-histbtn svg.cl-i{width:16px;height:16px}
.cl-histbtn:hover:not(:disabled){background:var(--cl-wash)}
.cl-histbtn:disabled{opacity:.38;cursor:default}
.cl-histbtn:focus-visible,.cl-undobtn:focus-visible{outline:2px solid var(--cl-accent);outline-offset:2px}
.cl-undobtn{display:inline-flex;align-items:center;gap:6px}
.cl-undobtn svg.cl-i{width:15px;height:15px}
.cl-preview .cl-proposed-page{scroll-margin-top:72px;scroll-margin-bottom:96px}
/* A narrow pane keeps the title, Bring in and Finish on one line: the word count goes, then the saved label's words. */
@container (max-width:700px){.cl-count{display:none}.cl-top{gap:12px}}
@container (max-width:560px){.cl-savedtext{display:none}}
.cl-banner{position:absolute;z-index:4;top:54px;left:50%;transform:translateX(-50%);max-width:calc(100% - 40px);display:flex;gap:8px;align-items:center;background:var(--cl-surface);box-shadow:var(--cl-shadow);border-radius:var(--cl-radius);padding:8px 14px}

/* the page */
.cl-scroll{position:absolute;inset:54px 0 0 0;overflow:auto;overscroll-behavior:contain;z-index:1;-webkit-mask-image:linear-gradient(to bottom,transparent 0,black 40px);mask-image:linear-gradient(to bottom,transparent 0,black 40px)}
.cl-grid{display:grid;grid-template-columns:var(--cl-cols);min-height:100%;padding:50px 0 190px}
.cl-page{grid-column:2;position:relative;min-width:0}
.cl-margin{grid-column:4;position:relative;min-width:0}
.cl-titlefield{display:block;width:100%;font-family:var(--cl-page);font-weight:400;font-size:39px;line-height:1.14;letter-spacing:-.012em;margin:0 0 30px;padding:0;border:0;outline:none;background:none;color:var(--cl-ink);resize:none;overflow:hidden;caret-color:var(--cl-accent)}
.cl-titlefield::placeholder,.cl-body::placeholder{color:var(--cl-ink);opacity:.94}
.cl-field{position:relative}
.cl-text,.cl-body{font-family:var(--cl-page);font-size:19.5px;line-height:1.74;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;tab-size:4;letter-spacing:0;padding:0;margin:0;border:0;text-wrap:wrap}
/* One spare pixel: text split into marked spans shapes a hair wider than the textarea's plain run, so a line that
   exactly fills the column wrapped one word early in the mirror and the wash stopped mid-line (Loop 2 critic). */
.cl-text{position:absolute;inset:0 -1px 0 0;color:transparent;pointer-events:none;user-select:none}
.cl-body{position:relative;display:block;width:100%;min-height:50vh;outline:none;background:transparent;color:var(--cl-ink);resize:none;overflow:hidden;caret-color:var(--cl-accent)}
.cl-mk{text-decoration:underline;text-decoration-color:var(--cl-mark);text-decoration-thickness:1.5px;text-underline-offset:5px;text-decoration-skip-ink:none;border-radius:2px;transition:background-color 120ms ease}
.cl-mk[data-on]{background:var(--cl-wash);box-shadow:0 0 0 3px var(--cl-wash);text-decoration-thickness:2px}
.cl-mk[data-kind=word]{text-decoration:none;background:var(--cl-wash);box-shadow:0 0 0 3px var(--cl-wash)}
.cl-mk[data-kind=kept]{text-decoration-style:dotted;text-decoration-thickness:1.5px}
/* Words that came from a suggestion stay dotted until the writer edits them. */
.cl-mk[data-kind=kept][data-from=model]{text-decoration-thickness:2px;text-underline-offset:6px}
.cl-preview{font-family:var(--cl-page);font-size:19.5px;line-height:1.74;white-space:pre-wrap;overflow-wrap:break-word}
.cl-cut{text-decoration:line-through;text-decoration-color:var(--cl-mark);text-decoration-thickness:1.5px;color:color-mix(in srgb,var(--cl-ink) 64%,transparent);cursor:pointer;border-radius:2px;transition:background-color 120ms ease,color 120ms ease}
.cl-cut:hover,.cl-cut[data-on]{background:var(--cl-wash)}
.cl-cut[data-kept]{text-decoration:underline dotted;text-decoration-color:var(--cl-mark);text-underline-offset:5px;color:inherit}
.cl-text [data-id]{scroll-margin-top:72px}
.cl-cut:focus-visible{outline:2px solid var(--cl-accent);outline-offset:1px}
.cl-preview .cl-proposed-page{font-family:var(--cl-sans);font-size:18px;line-height:1.7;box-shadow:inset 3px 0 0 var(--cl-accent);padding-left:16px;margin-left:-19px;display:block}
/* A suggestion tried inside a sentence: the editor's sans, washed and underlined, until the writer uses it. */
.cl-preview .cl-proposed-page[data-inline]{display:inline;box-shadow:none;padding:0 2px;margin:0;font-family:var(--cl-page);font-size:inherit;color:var(--cl-mark);background:var(--cl-wash);text-decoration:underline dashed;text-decoration-color:var(--cl-mark);text-underline-offset:5px;border-radius:2px;-webkit-box-decoration-break:clone;box-decoration-break:clone}

/* The model's words, until the writer types inside them: a faint wash, and a 2 px tick in the gutter beside the line. */
.cl-text.cl-ai .cl-mk{text-decoration:none;background:color-mix(in srgb,var(--cl-accent) 10%,transparent);border-radius:2px}
.cl-ticks{position:absolute;top:0;left:-18px;width:2px;height:100%;pointer-events:none}
.cl-ticks i{position:absolute;left:0;width:2px;background:var(--cl-accent);border-radius:1px}
/* A proofreader's mark: the writer's words struck in their own face, the suggestion inserted after them in sans. */
.cl-preview .cl-struck{text-decoration:line-through;text-decoration-color:var(--cl-accent);text-decoration-thickness:1.5px;color:color-mix(in srgb,var(--cl-ink) 64%,transparent);margin-right:.3em}
.cl-btn.cl-last{margin-left:0}
/* the floating card: other words, a rewrite, a next sentence, the passage tools; in the page beside its words */
.cl-pop{position:absolute;z-index:5;width:min(384px,100%)}
.cl-pop .cl-note{animation:cl-pop 120ms ease-out both}
.cl-pop .cl-senses{max-height:min(34vh,300px)}
.cl-pop .cl-tools{padding:6px}
.cl-pop .cl-tools .cl-row{gap:4px}
@keyframes cl-pop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
/* The selection bar: four plain words on one solid strip, above the selection. */
.cl-pop:has(> .cl-selbar){width:auto}
.cl-selbar{display:inline-flex;gap:2px;padding:4px;background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);animation:cl-rise 120ms ease-out both;white-space:nowrap}
.cl-barbtn{font:inherit;font-size:13px;font-weight:500;padding:6px 10px;border:0;border-radius:var(--cl-radius);background:none;color:var(--cl-ink);cursor:pointer}
.cl-barbtn:hover,.cl-barbtn:focus-visible{background:var(--cl-wash)}
@keyframes cl-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
/* A, B, C and Yours: one segmented row, the move under each letter. */
.cl-skel{display:block;width:70%;height:8px;margin-top:6px;border-radius:2px;background:color-mix(in srgb,var(--cl-ink) 14%,transparent);animation:cl-pulse 1.2s ease-in-out infinite}
.cl-change{margin:0 0 12px}
.cl-chips{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px}
.cl-chip{font:inherit;font-size:12.5px;font-weight:500;padding:4px 9px;border:0;border-radius:var(--cl-radius);background:none;color:var(--cl-ink);box-shadow:inset 0 0 0 1px var(--cl-stroke);cursor:pointer}
.cl-chip:hover,.cl-chip:focus-visible{background:var(--cl-wash)}
.cl-chipfield{display:block;width:100%;font:inherit;font-size:13px;color:var(--cl-ink);background:none;border:0;border-bottom:1px solid var(--cl-stroke);padding:5px 2px;caret-color:var(--cl-accent)}
.cl-chipfield:focus-visible{outline:none;border-bottom-color:var(--cl-accent)}
.cl-why{margin:8px 0 0 !important;padding-left:10px;box-shadow:inset 2px 0 0 var(--cl-stroke)}
/* The provenance line closes the card whatever comes before it in the source. */
.cl-note:has(> .cl-prov){display:flex;flex-direction:column}
.cl-note > .cl-prov{order:99;font-size:12.5px;margin:12px 0 0 !important}
.cl-prov{font-size:12.5px;margin:12px 0 0 !important}
.cl-try{font-family:var(--cl-page);font-size:15.5px;line-height:1.5}

/* the margin: one note at a time */
.cl-noteplace{position:sticky;top:18px}
.cl-note{position:relative;background:var(--cl-surface);border-radius:var(--cl-radius);padding:18px 20px 16px;box-shadow:var(--cl-shadow);animation:cl-in 120ms ease-out both}
.cl-dock .cl-note{max-height:38vh;overflow:auto}
.cl-dock{position:absolute;z-index:3;left:20px;right:20px;bottom:62px}
/* In the narrow layout the page fades out behind the docked note and the Ask line, the way it fades under the top
   line, so no sliver of text shows between them; the dock lines up with the Ask line's edges. */
@container (max-width:860px){.cl-scroll{-webkit-mask-image:linear-gradient(to bottom,transparent 0,black 40px,black calc(100% - 78px),transparent calc(100% - 60px));mask-image:linear-gradient(to bottom,transparent 0,black 40px,black calc(100% - 78px),transparent calc(100% - 60px))}}
@keyframes cl-in{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
.cl-meta{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:12.5px;margin-bottom:12px}
.cl-meta span:first-child{min-width:0;overflow-wrap:anywhere}
.cl-meta .cl-part{display:inline-block;max-width:100%}
.cl-meta .cl-part:first-child{display:inline}
.cl-meta > span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
.cl-quote{font-family:var(--cl-page);font-style:italic;font-size:16.5px;line-height:1.45;margin:0 0 8px !important;overflow-wrap:anywhere}
/* Libre Caslon's italic draws "st" as a long-s ligature through its common ligatures (liga), so "easiest" read as
   "easieſt". Common ligatures are off in italic; the italic's fi and ffi still join. */
.cl-quote,.cl-sample,.cl-word[data-phrase]{font-variant-ligatures:no-common-ligatures no-discretionary-ligatures no-historical-ligatures}
.cl-intro{margin:0 0 12px !important}
.cl-say{font-size:14.5px;line-height:1.5;margin:0 0 14px !important}
.cl-say + .cl-say{margin-top:-4px !important}
.cl-proposed{font-size:14.5px;line-height:1.5;margin:0 0 10px !important;padding-left:10px;box-shadow:inset 2px 0 0 var(--cl-accent)}
.cl-reason{font-size:13px;line-height:1.45;margin:0 0 14px !important}
.cl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cl-btn{font:inherit;font-size:13px;font-weight:500;line-height:1.25;border-radius:var(--cl-radius);padding:7px 13px;border:0;background:none;color:var(--cl-ink);cursor:pointer;white-space:nowrap}
.cl-btn[data-v=primary]{background:color-mix(in srgb,var(--cl-accent) 72%,#0d1b33);color:var(--cl-on-accent)}
.cl-version-now{font-size:12.5px;align-self:center}
.cl-version-change{grid-column:1/-1;margin:2px 0 0 !important;font-size:13px;line-height:1.4;font-family:var(--cl-serif,inherit)}
.cl-version-change s{text-decoration-color:var(--cl-accent)}
.cl-btn[data-v=primary]:hover{filter:brightness(1.08)}
.cl-btn[data-v=ghost]{box-shadow:inset 0 0 0 1px var(--cl-stroke)}
.cl-btn[data-v=ghost]:hover,.cl-btn[data-v=link]:hover{background:var(--cl-wash)}
.cl-btn[data-v=link]{padding:7px 4px;margin-left:auto;text-decoration:underline;text-decoration-color:var(--cl-stroke);text-underline-offset:3px}
.cl-btn:disabled{cursor:default;box-shadow:inset 0 0 0 1px var(--cl-stroke);background:none;color:var(--cl-ink)}
.cl-room button:focus-visible,.cl-room input:focus-visible,.cl-room a:focus-visible{outline:2px solid var(--cl-accent);outline-offset:2px}
.cl-choices{display:flex;gap:4px;margin:0 0 12px}
.cl-choice{flex:1;font:inherit;font-size:13px;font-weight:500;padding:6px 0;border:0;border-radius:var(--cl-radius);background:none;color:var(--cl-ink);box-shadow:inset 0 0 0 1px var(--cl-stroke);cursor:pointer}
.cl-choice[aria-pressed=true]{background:var(--cl-wash);box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-working{display:flex;align-items:center;gap:10px;font-size:14.5px;margin:0 0 14px}
.cl-dots{display:inline-flex;gap:4px}
.cl-dots i{width:5px;height:5px;border-radius:50%;background:var(--cl-accent);animation:cl-pulse 1.2s ease-in-out infinite}
.cl-dots i:nth-child(2){animation-delay:.15s}.cl-dots i:nth-child(3){animation-delay:.3s}
@keyframes cl-pulse{0%,100%{transform:scale(.6)}50%{transform:scale(1)}}
.cl-list{margin:0 0 14px;padding:0;list-style:none;display:grid;gap:8px}
.cl-list li{font-size:14px;line-height:1.5;padding-left:12px;box-shadow:inset 2px 0 0 var(--cl-stroke)}

/* better words */
.cl-word{font-family:var(--cl-page);font-size:23px;line-height:1.2;margin:0 0 14px !important;overflow-wrap:anywhere}
.cl-senses{max-height:min(44vh,400px);overflow:auto;margin:0 -4px 8px;padding:0 4px}
.cl-sense{margin:0 0 14px}
.cl-gloss{font-size:13px;line-height:1.45;margin:0 0 7px !important}
.cl-gloss b{font-weight:600;margin-right:7px}
.cl-alts,.cl-tried{display:flex;flex-wrap:wrap;gap:6px}
.cl-alt{font:inherit;font-size:13.5px;line-height:1.3;padding:5px 10px;border:0;border-radius:var(--cl-radius);background:none;color:var(--cl-ink);box-shadow:inset 0 0 0 1px var(--cl-stroke);cursor:pointer}
.cl-alt:hover{background:var(--cl-wash)}
.cl-alt[aria-pressed=true]{background:var(--cl-wash);box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-alt[data-yours]{font-family:var(--cl-page);font-size:14.5px}
.cl-word[data-phrase]{font-size:17.5px;line-height:1.45;font-style:italic}
.cl-suggs{display:grid;gap:6px}
.cl-suggs + .cl-reason{margin-top:8px !important}
.cl-suggs + .cl-row,.cl-pop .cl-rule + .cl-row{margin-top:12px}
.cl-sugg{display:grid;gap:3px;text-align:left;font:inherit;font-size:14px;line-height:1.4;padding:8px 11px;border:0;border-radius:var(--cl-radius);background:none;color:var(--cl-ink);box-shadow:inset 0 0 0 1px var(--cl-stroke);cursor:pointer}
.cl-sugg small{font-size:12.5px;line-height:1.4}
.cl-sugg .cl-flag{display:flex;gap:6px;align-items:flex-start}
.cl-sugg .cl-flag svg.cl-i{width:13px;height:13px;margin-top:2px}
.cl-sugg:hover{background:var(--cl-wash)}
.cl-sugg[aria-pressed=true]{background:var(--cl-wash);box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-alt{white-space:normal;text-align:left}
.cl-tried{padding-top:12px;margin:0 0 14px;border-top:1px solid var(--cl-stroke)}

/* the Ask line */
.cl-overlay{position:absolute;inset:0;z-index:3;pointer-events:none;display:grid;grid-template-columns:var(--cl-cols)}
.cl-askwrap{grid-column:4;align-self:end;margin-bottom:34px;pointer-events:auto;display:grid;gap:8px;min-width:0}
/* In a narrow pane the note docks over the lower page; leave room so the last passage can scroll above it. */
@container (max-width:860px){.cl-grid{padding-bottom:46vh}}
@container (max-width:860px){.cl-askwrap{grid-column:2;margin-bottom:14px}.cl-askwrap .cl-ask{background:var(--cl-surface);box-shadow:var(--cl-shadow);border-radius:var(--cl-radius);border-bottom:0;padding:10px 12px}.cl-askwrap .cl-ask[data-open]{box-shadow:var(--cl-shadow),inset 0 -1.5px 0 var(--cl-accent)}}
.cl-ask{display:flex;align-items:center;gap:10px;width:100%;font:inherit;font-size:14px;color:inherit;padding:10px 2px;background:none;border:0;border-bottom:1px solid var(--cl-stroke);cursor:text;text-align:left}
.cl-ask[data-open]{border-bottom-color:var(--cl-accent)}
.cl-askinput{flex:1;min-width:0;font:inherit;font-size:14px;color:var(--cl-ink);background:none;border:0;outline:none;padding:0}
.cl-askinput::placeholder{color:var(--cl-ink);opacity:.94}
.cl-askrow{display:flex;gap:8px;align-items:stretch}
.cl-askrow .cl-ask{flex:1;min-width:0}
.cl-askrow .cl-ask > span:not(.cl-kbd){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-mic{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:38px;padding:0 10px;font:inherit;font-size:12.5px;font-variant-numeric:tabular-nums;color:inherit;background:none;border:0;border-bottom:1px solid var(--cl-stroke);border-radius:0;cursor:pointer}
.cl-mic:hover{background:var(--cl-wash)}
.cl-mic[data-phase=recording]{color:var(--cl-accent);border-bottom-color:var(--cl-accent)}
.cl-mic[data-phase=recording] svg.cl-i{fill:currentColor}
.cl-mic:disabled{cursor:default}
@container (max-width:860px){.cl-mic{background:var(--cl-surface);box-shadow:var(--cl-shadow);border-radius:var(--cl-radius);border-bottom:0}}
.cl-kbd{margin-left:auto;font-size:12.5px;padding:2px 6px;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);white-space:nowrap}
.cl-hits{background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:6px;max-height:min(52vh,460px);overflow:auto;animation:cl-in 120ms ease-out both}
.cl-hit{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:0;border-radius:var(--cl-radius);padding:8px 10px;cursor:pointer}
.cl-hit[data-on]{background:var(--cl-wash)}
.cl-hit strong{display:block;font-weight:500;font-size:14px;line-height:1.35}
.cl-hit span{display:block;font-size:12.5px;line-height:1.4;margin-top:2px}
.cl-empty{padding:10px;font-size:13.5px}

/* the shape strip: one bar per paragraph, a tick where notes are */
.cl-shape{grid-column:1;grid-row:1;align-self:center;justify-self:end;width:min(96px,calc(100% - 16px));margin-right:22px;pointer-events:auto;display:flex;flex-direction:column;gap:3px;max-height:62vh;padding-left:12px;animation:cl-in 120ms ease-out both}
.cl-bar{position:relative;display:flex;align-items:center;flex:1 1 7px;min-height:3px;max-height:9px;padding:0;border:0;background:none;cursor:pointer;border-radius:var(--cl-radius)}
.cl-bar i{display:block;height:100%;max-height:5px;min-height:2px;background:color-mix(in srgb,var(--cl-ink) 46%,transparent);border-radius:1px;transition:background-color 120ms ease}
.cl-bar:hover i,.cl-bar:focus-visible i{background:var(--cl-accent)}
.cl-bar b{position:absolute;left:-12px;width:6px;height:6px;border-radius:50%;background:var(--cl-accent)}

/* menus and sheets */
.cl-menu{position:absolute;z-index:6;top:48px;left:16px;width:300px;max-height:calc(100% - 70px);overflow:auto;background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:6px;animation:cl-in 120ms ease-out both}
.cl-item{display:flex;align-items:baseline;gap:10px;width:100%;text-align:left;font:inherit;font-size:13.5px;color:inherit;background:none;border:0;border-radius:var(--cl-radius);padding:7px 10px;cursor:pointer}
.cl-item:hover,.cl-item:focus-visible{background:var(--cl-wash)}
.cl-item small{margin-left:auto;font-size:12.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.cl-item[aria-current=true]{box-shadow:inset 2px 0 0 var(--cl-accent)}
.cl-bring{left:auto;right:16px;width:376px}
.cl-bring .cl-item .cl-name{flex:none;overflow:visible}
.cl-bring .cl-item .cl-name{font-family:var(--cl-sans);font-size:13.5px}
.cl-item .cl-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--cl-page);font-size:15px}
.cl-sep{height:1px;background:var(--cl-stroke);margin:6px 4px}
.cl-label{font-size:12.5px;font-weight:600;padding:8px 10px 4px}
.cl-shade{position:absolute;inset:0;z-index:7;background:color-mix(in srgb,var(--cl-paper) 45%,transparent);display:grid;place-items:center;padding:20px}
.cl-shade:focus{outline:none} /* it takes focus so Escape closes the sheet; the sheet itself is the visible target */
.cl-sheet{width:min(560px,100%);max-height:100%;overflow:auto;background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:22px 24px;animation:cl-in 120ms ease-out both}
.cl-sheet h2{font-size:18px;font-weight:600;line-height:1.3;margin:0 0 6px}
.cl-sheet h3{font-size:13.5px;font-weight:600;margin:18px 0 8px}
.cl-sheet p{font-size:14px;line-height:1.55;margin:0 0 10px}
.cl-sheet .cl-row{margin-top:14px}
.cl-setting{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center;margin-top:12px}
.cl-setting > span{font-size:13.5px;font-weight:600}
.cl-setting .cl-choices{margin:0;flex-wrap:wrap}
.cl-setting .cl-choice{flex:1 1 auto;padding:7px 10px}
.cl-setting .cl-choices[data-wrap] .cl-choice{flex:1 1 30%}
.cl-field-input{display:block;width:100%;font:inherit;font-size:14.5px;line-height:1.4;color:var(--cl-ink);background:none;border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);padding:9px 11px;margin-top:6px;caret-color:var(--cl-accent)}
.cl-field-input:focus-visible{outline:2px solid var(--cl-accent);outline-offset:1px}
.cl-linkpage{display:grid;gap:2px;margin-top:12px;padding:8px 10px;box-shadow:inset 2px 0 0 var(--cl-accent)}
.cl-linkpage b{font-weight:500;font-size:13.5px}
.cl-linkpage span{font-size:12.5px}
.cl-pastebox{font-family:var(--cl-page);font-size:15px;min-height:140px}
.cl-version.cl-used{grid-template-columns:1fr}
.cl-version.cl-used p{font-size:13.5px;line-height:1.45;margin-top:2px}
.cl-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.cl-actions .cl-btn{text-align:left;padding:10px 12px}
.cl-status{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;margin-top:14px}
.cl-status svg.cl-i{margin-top:2px}
.cl-versions{display:grid;gap:2px;margin-top:10px}
.cl-version{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;padding:8px 10px;border-radius:var(--cl-radius)}
.cl-version:hover{background:var(--cl-wash)}
.cl-version b{font-weight:500;font-size:13.5px}
.cl-version span{font-size:12.5px;grid-column:1}
.cl-version .cl-btn{grid-row:1 / span 2;grid-column:2}
.cl-version .cl-version-now{grid-row:1 / span 2;grid-column:2}
.cl-credits{display:grid;gap:10px;margin:8px 0 0;padding:0;list-style:none}
.cl-credits li{font-size:13.5px;line-height:1.5}
.cl-credits b{font-weight:600}
/* About: a colophon. Page serif for the reading, real hierarchy, about 62 characters a line, full ink. */
.cl-sheet.cl-about{width:min(600px,100%);padding:34px 40px 28px}
.cl-about h2{font-family:var(--cl-page);font-weight:400;font-size:28px;line-height:1.2;letter-spacing:-.005em;margin:0 0 18px}
.cl-about h3{font-size:15px;font-weight:600;line-height:1.3;color:var(--cl-ink);margin:28px 0 10px;padding-top:18px;border-top:1px solid var(--cl-stroke)}
.cl-about p{font-family:var(--cl-page);font-size:16.5px;line-height:1.6;color:var(--cl-ink);max-width:62ch;margin:0 !important}
.cl-about .cl-credits{gap:12px;margin:0;max-width:62ch}
.cl-about .cl-credits li{font-size:13.5px;line-height:1.55;color:var(--cl-ink)}
.cl-about .cl-credits a{white-space:nowrap}
.cl-about-row{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:30px !important}
@container (max-width:600px){.cl-sheet.cl-about{padding:24px 22px 20px}.cl-about h2{font-size:24px}}
/* Loop 2. A, B and C: the move over the option's own words, three lines at most; the one picked is outlined. */
.cl-tiles{display:grid;gap:6px;margin:0 0 12px;align-items:start}
.cl-tile{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;width:100%;font:inherit;color:var(--cl-ink);background:none;border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);padding:9px 11px;text-align:left;cursor:pointer;transition:box-shadow 120ms ease,background-color 120ms ease}
.cl-tile[data-opt]:hover{background:var(--cl-wash)}
.cl-tile[aria-pressed=true]{box-shadow:inset 0 0 0 1.5px var(--cl-accent);background:var(--cl-wash)}
.cl-tile[data-wait]{cursor:default}
.cl-tile-l{display:inline-grid;place-items:center;width:22px;height:22px;font-weight:600;font-size:12.5px;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke)}
.cl-tile[aria-pressed=true] .cl-tile-l{color:var(--cl-accent);box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-tile-body{display:grid;gap:3px;min-width:0;align-content:start}
.cl-tile[data-wait] .cl-tile-body{min-height:58px}
.cl-tile-adds{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600}
.cl-tile-adds svg.cl-i{width:13px;height:13px}
.cl-tile-move{font-size:12.5px;font-weight:600;line-height:1.3}
.cl-tile-text{font-family:var(--cl-page);font-size:15px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cl-tile .cl-skel{width:100%;height:9px;margin:5px 0 0}
.cl-filling{margin-left:auto;font-size:13px}
.cl-links{display:flex;gap:16px;margin-top:8px}
.cl-preview .cl-proposed-page[data-inline]:empty{padding:0;background:none}
.cl-preview .cl-struck:has(+ .cl-proposed-page:empty){margin-right:0}
@container (max-width:700px){.cl-scenebtn{display:none}}
.cl-links .cl-btn[data-v=link]{margin:0;padding-left:0;padding-right:0}
.cl-suggest-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
/* The editor's note, cut down: the change as the title, the writer's words on one upright line, the reason. */
.cl-hero-head{display:flex;align-items:baseline;gap:10px;margin:0 0 8px}
.cl-hero-n{flex:none;display:inline-grid;place-items:center;width:22px;height:22px;font-size:12.5px;font-weight:600;color:var(--cl-accent);border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1.5px var(--cl-accent);transform:translateY(-2px)}
.cl-hero-title{flex:1;min-width:0;font-size:16px;font-weight:600;line-height:1.35;margin:0}
.cl-suggest-title{font-size:15px}
.cl-hero-pos{flex:none;font-size:12.5px;font-variant-numeric:tabular-nums}
.cl-x{flex:none;align-self:flex-start;display:inline-grid;place-items:center;width:28px;height:28px;margin:-6px -8px 0 0;color:var(--cl-ink);background:none;border:0;border-radius:var(--cl-radius);cursor:pointer}
.cl-x:hover{background:var(--cl-wash)}
.cl-x:focus-visible{outline:2px solid var(--cl-accent);outline-offset:1px}
.cl-hero-quote{font-family:var(--cl-page);font-size:15.5px;line-height:1.45;margin:0 0 8px !important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:inset 2px 0 0 var(--cl-mark);padding-left:10px;font-variant-ligatures:no-common-ligatures}
.cl-hero .cl-say{margin-bottom:12px}
.cl-usedline{display:flex;gap:8px;align-items:center;margin:0 !important}
.cl-usedline svg.cl-i{color:var(--cl-accent)}
.cl-used-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.cl-used-row .cl-usedline{margin-right:auto !important}
/* Read my piece in the room: one card, the close button in its corner, the compact desk at its foot. */
.cl-roomread{max-height:calc(100vh - 210px);overflow:auto;overscroll-behavior:contain;position:relative;background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:18px 20px 14px;animation:cl-in 120ms ease-out both}
.cl-roomread::after{content:'';position:sticky;bottom:-14px;display:block;height:30px;margin:0 -20px -14px;background:linear-gradient(color-mix(in srgb,var(--cl-surface) 0%,transparent),var(--cl-surface) 85%);pointer-events:none}
.cl-roomread > .cl-note{background:none;box-shadow:none;padding:0;animation:none}
.cl-roomread .cl-read-changes{grid-template-columns:minmax(0,1fr)}
.cl-roomread .cl-read-change,.cl-roomread .cl-read-body,.cl-roomread .cl-read-headline,.cl-roomread .cl-read-cut{min-width:0}
.cl-roomread .cl-read-sample{padding-right:30px}
.cl-roomread > .cl-x{position:absolute;top:12px;right:12px;margin:0}
.cl-roomread .cl-read-verdict{padding-right:28px}
.cl-roomread > .cl-prov{margin:12px 0 0 !important}
.cl-noteplace > .cl-desk{margin-top:10px;background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:10px 12px}
.cl-deskplace .cl-desk{background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:var(--cl-shadow);padding:2px 12px}
.cl-deskplace .cl-desk > *:first-child{border-top:0}
.cl-deskplace .cl-desk > *:last-child{border-bottom:0}
.cl-deskdock{bottom:62px}
/* The ranked changes in the page: a thin accent rule, and the matching numeral in the margin. */
.cl-text .cl-mk[data-kind=keep]{text-decoration-style:dotted;text-decoration-color:color-mix(in srgb,var(--cl-ink) 45%,transparent);text-decoration-thickness:1.5px}
.cl-text .cl-mk[data-n]{text-decoration-color:color-mix(in srgb,var(--cl-ink) 30%,transparent);text-decoration-thickness:1px}
.cl-text .cl-mk[data-n][data-on]{text-decoration-color:var(--cl-accent);text-decoration-thickness:2px}
.cl-nums{position:absolute;top:0;left:-46px;width:24px;height:100%;pointer-events:none}
.cl-nums b{position:absolute;left:0;display:grid;place-items:center;width:22px;height:22px;margin-top:6px;font-family:var(--cl-sans);font-size:12.5px;font-weight:600;color:var(--cl-accent);background:var(--cl-surface);border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke)}
.cl-nums b[data-on]{box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
/* Words just used: a neutral wash that settles into the model-words wash over two seconds. */
.cl-text.cl-ai .cl-mk[data-fresh]{animation:cl-fresh 2.2s ease-out both}
@keyframes cl-fresh{from{background:color-mix(in srgb,var(--cl-ink) 16%,transparent)}to{background:color-mix(in srgb,var(--cl-accent) 10%,transparent)}}
/* First open: the welcome card alone over a quiet page. */
.cl-room[data-welcome] .cl-scroll{opacity:.26;pointer-events:none}
.cl-room[data-welcome] .cl-askwrap,.cl-room[data-welcome] .cl-top > :not(.cl-titlebtn):not(.cl-grow){visibility:hidden}
.cl-room a{color:inherit;text-decoration-color:var(--cl-mark);text-underline-offset:3px}

/* the methods that have their own card: flips, the panel, the debate, lessons, reading across pieces */
.cl-preview .cl-proposed-page[data-insert]{margin-top:1.74em}
.cl-tag{display:inline-block;font-size:12.5px;font-weight:600;line-height:1.3;padding:3px 8px;margin:0 0 10px !important;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke)}
.cl-tag[data-judgment=aligned]{box-shadow:inset 0 0 0 1.5px var(--cl-accent)}
.cl-tag[data-judgment=drift]{background:var(--cl-wash)}
.cl-sample{font-family:var(--cl-page);font-style:italic;font-size:14px}
.cl-warn{display:flex;gap:8px;align-items:flex-start}
.cl-warn svg.cl-i{margin-top:2px}
.cl-label2{font-size:12.5px;font-weight:600;line-height:1.35;margin:0 0 6px !important}
.cl-revs{display:grid;gap:12px;margin:0 0 14px}
.cl-rev{display:grid;gap:6px;justify-items:start;padding-bottom:12px;border-bottom:1px solid var(--cl-stroke)}
.cl-rev b{font-weight:600;font-size:13.5px}
.cl-rev p{font-size:14px;line-height:1.5}
.cl-note[data-long]{max-height:calc(100vh - 220px);overflow:auto}
.cl-rule{display:block;width:100%;font:inherit;font-size:14.5px;line-height:1.5;color:var(--cl-ink);background:none;border:0;border-radius:var(--cl-radius);box-shadow:inset 0 0 0 1px var(--cl-stroke);padding:8px 10px;margin:0 0 10px;resize:vertical;caret-color:var(--cl-accent)}
.cl-rule:focus-visible{outline:2px solid var(--cl-accent);outline-offset:1px}
.cl-rules{display:grid;gap:4px}
.cl-ruleitem{padding:8px 10px;border-radius:var(--cl-radius);box-shadow:inset 2px 0 0 var(--cl-stroke)}
.cl-ruleitem p{margin:0 0 6px}
.cl-ruleitem .cl-row{margin-top:4px}
.cl-picks{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;margin:0 0 14px;max-height:260px;overflow:auto}
.cl-pick{min-width:0;display:flex;align-items:baseline;gap:10px;padding:7px 8px;border-radius:var(--cl-radius);cursor:pointer;font-size:13.5px}
.cl-pick:hover{background:var(--cl-wash)}
.cl-pick input{accent-color:var(--cl-accent);margin:0;transform:translateY(1px)}
.cl-pick .cl-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--cl-page);font-size:15px}
.cl-pick small{font-size:12.5px;white-space:nowrap}
.cl-allhit{border-top:1px solid var(--cl-stroke);border-radius:0;margin-top:4px}
.cl-libsheet{width:min(680px,100%)}
.cl-libsec{border-top:1px solid var(--cl-stroke)}
.cl-libsec:last-of-type{border-bottom:1px solid var(--cl-stroke)}
.cl-libhead{display:flex;align-items:baseline;gap:10px;width:100%;font:inherit;font-size:14px;font-weight:600;color:inherit;background:none;border:0;padding:11px 6px;cursor:pointer;text-align:left}
.cl-libhead:hover{background:var(--cl-wash)}
.cl-libhead small{margin-left:auto;font-size:12.5px;font-weight:400;font-variant-numeric:tabular-nums}
.cl-libhead::before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform 120ms ease;flex:none;align-self:center}
.cl-libhead[aria-expanded=true]::before{transform:rotate(45deg)}
.cl-libbody{padding:2px 0 14px}
.cl-libbody > p{font-size:13.5px}
.cl-libbody .cl-label2{margin:12px 6px 4px !important}
.cl-libitem{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:0;border-radius:var(--cl-radius);padding:8px 10px;cursor:pointer}
.cl-libitem:hover,.cl-libitem:focus-visible{background:var(--cl-wash)}
.cl-libitem strong{display:block;font-weight:500;font-size:14px;line-height:1.35}
.cl-libitem span{display:block;font-size:13px;line-height:1.45;margin-top:2px}
.cl-figgroup{margin:0 0 16px}
.cl-figs{margin:0 0 8px;display:grid;gap:8px}
.cl-figs div{padding:0 6px}
.cl-figs dt{font-weight:600;font-size:13.5px}
.cl-figs dd{margin:2px 0 0;font-size:13.5px;line-height:1.5}

@media (prefers-reduced-motion:reduce){
  .cl-room *,.cl-room *::before,.cl-room *::after{animation:none !important;transition:none !important}
}
`
