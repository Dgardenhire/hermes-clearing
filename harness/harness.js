// The Clearing harness: a fake backend that answers the page's ctx.rest calls the way
// dashboard/plugin_api.py does, fixture editor answers pinned to the sample piece, and scripted
// steps that drive the page into each state for screenshots. URL parameters:
//   theme=dark  accent=orange|red|green  scene=plain  width=<px>  bare=1  long=1 (harness/long.json instead of the sample)
//   step=<n> (Leave it n times after the state)
//   state=longquick|longwalk|longshape|rewalk|fixmyself|escask: the note walk on a piece several screens tall
//   state=askfiction|libfiction: the Ask line and All methods for a novelist
//   state=spot|spottry|spotcoach|spotmine|spotnext|opps|oppshow|oppcut|opplitany|oppused|oppundo|opptry: Find figures of speech and Where to add a technique (opps1)
//   state=flip|promise|draft|voice|panel|panelwalk|debate|debate3|debating|lessons|guidance|choose|across|library|figures|yourguidance|home|homedone|
//         wording|wording2|phrase|cuts|cuts2|words|words2|wordsoff|invite|quick|quick2|pass|note|notewalk|changes|apply|openings|working|nomodel|cutoff|off|ask|askempty|menu|finish|history|about|trash|trashask|trashall
import { createRoot } from 'react-dom/client'
import { jsx } from 'react/jsx-runtime'
import plugin from '../desktop/plugin.js'

const q = new URLSearchParams(location.search)
const root = document.documentElement
if (q.get('theme') === 'dark') root.classList.add('dark')
if (q.get('accent')) root.classList.add(q.get('accent'))
if (q.get('bare')) document.body.classList.add('hb-bare')
if (q.get('width')) document.querySelector('.hb-window').style.width = `${q.get('width')}px`
const STATE = q.get('state') || 'invite'
const MODEL = 'hermes-4-405b'

const LONG = q.get('long') || /^(longquick|longwalk|longshape|rewalk|fixmyself)$/.test(q.get('state') || '')
const sample = await (await fetch(LONG ? './long.json' : '../library/sample.json')).json()
// Find figures of speech, Where to add a technique, their Show me answers and the coach's replies: real model output on the sample
// piece (opps-fixtures.json, from the opps1 bench), served as the model's answers.
const OPPS = await (await fetch('./opps-fixtures.json')).json()
const now = () => Date.now() / 1000
const words = s => (s.trim() ? s.trim().split(/\s+/).length : 0)
const db = { pieces: {}, versions: [], passes: {}, seq: 0, decisions: [], picture: null }
const settings = { suggestions: q.get('suggestions') !== 'off' }
const id = () => `h${++db.seq}`
function addPiece(title, body, extra = {}) {
  const p = { id: id(), title, body, created: now() - 86400 * 3, updated: now() - 600, trashed: null, finished_version: null, sample: false, ...extra }
  db.pieces[p.id] = p
  return p
}
const NOTES = 'branch open 6 days now, memo says cut to 4\nArturo: printed résumé 4 times, shelter address kept changing\nthe sisters, chemistry homework, corner table\nnurse asleep 40 min in the reading chair, nobody woke her\nmemo counts checkouts only (down a third in 5 yrs)\nask: count who uses the room before deciding'
const current = STATE === 'theoread' && window.__THEO ? addPiece(window.__THEO.title, window.__THEO.body) : STATE === 'draft' ? addPiece('Council letter', NOTES) : addPiece(sample.title, sample.body, { sample: STATE === 'invite' || /^(welcome|sample)/.test(STATE) })
const zoning = addPiece('Notes on the zoning hearing', 'The planning commission met on Tuesday. Nobody counted the people standing in the hall, and the minutes say the room was quiet.', { updated: now() - 7200 })
addPiece('Letter to my sister', 'I found the photograph of the lake house. You were nine and furious about the canoe, and I still have the paddle.', { updated: now() - 86400 * 2, voice: true })
const rules = [{ id: 'r1', section: 'voice', text: 'Say the feeling plainly; no hedges in front of it.', evidence: 'You were nine and furious about the canoe', source: 'onboarding' },
  { id: 'r2', section: 'style', text: 'Name the person before the statistic.', evidence: 'A man named Arturo printed the same résumé four times', source: 'lesson' },
  { id: 'r3', section: 'guardrails', text: 'Never quote the memo without saying it is the memo.', evidence: '', source: 'writer' }]
db.pieces[addPiece('An older draft', 'Words.').id].trashed = now() - 3600
// The seeded history grows the way a draft does: the first two paragraphs, then all but the last two, then all but the
// last, then the whole piece, so each row has its own change to show.
{ const ps = current.body.split('\n\n'), upTo = n => ps.slice(0, Math.max(1, n)).join('\n\n')
  for (const [reason, ago, n] of [['finished', 400, ps.length], ['changes', 1900, ps.length - 1], ['idle', 5400, ps.length - 2], ['start', 86400 * 3, 2]]) {
    db.versions.push({ id: id(), piece_id: current.id, title: current.title, body: upTo(n), reason, created: now() - ago })
  } }
const LABELS = { suggestion: 'Before using a suggestion', idle: 'Saved while you paused', changes: "Kept the editor's changes", opening: 'Kept a new opening', finished: 'Marked finished', restore: 'Before restoring an older version', start: 'First words', import: 'Opened from a file', before_changes: "Before applying the editor's changes", before_opening: 'Before keeping a new opening' }
const meta = p => { const { body, ...rest } = p; return { ...rest, words: words(body) } }
const full = p => ({ ...p, words: words(p.body) })

const pin = (body, items, key) => items.map(it => { const s = body.indexOf(it[key]); return s < 0 ? null : { start: s, end: s + it[key].length, quote: it[key], ...it } }).filter(Boolean)
// Fixture notes for the long piece, spread from its second paragraph to its last, so the walk jumps down and up.
const LONG_FINDINGS = [
  { quote: 'The bookmobile is a converted school bus, white with a green stripe', issue: 'A good image, but the reader meets the bus before the people. Could Agnes Ruiz come first?' },
  { quote: 'She reads one a day, she said, two if it rains.', issue: 'The best line so far. Would it carry more as the end of its paragraph than the middle?' },
  { quote: 'Marsh said the bus costs about $61,000 a year to run', issue: 'The number arrives with no comparison. Is $61,000 a lot for this county?' },
  { quote: 'The bookmobile’s own numbers are hard to read.', issue: 'A sentence about the numbers before the numbers. Does the paragraph start sooner without it?' },
  { quote: 'She was reading when the bus pulled out.', issue: 'This is the ending. Does the piece need the four paragraphs after it?' },
].map(f => ({ ...f, quote: f.quote.replace('’', "'") }))
const LONG_ANSWERS = {
  'pass:weakest': b => ({ kind: 'findings', title: 'Find weak sentences', result: { summary: 'Five sentences do less than they could; the strongest image arrives too late and the ending comes too soon.', counts: { returned: 5, matched: 5, dropped: 0 }, findings: pin(b, LONG_FINDINGS, 'quote').map(({ quote, issue, start, end }) => ({ quote, issue, start, end })) } }),
  'method:dev-edit': b => ({ kind: 'note', title: 'Find the shape', result: { summary: 'The piece is built as a day on the route with the budget argument set inside it. The day is the stronger shape; the argument interrupts it twice.', question: 'Is this a story about Agnes Ruiz and the route, or about the commission’s vote?', general: [], notes: pin(b, [
    { quote: 'In today\'s rapidly changing information landscape', note: 'The piece starts with the landscape, not the bus. The Pell stop is the real opening.' },
    { quote: 'On a cold afternoon in November, eleven people were waiting for it, and four of them had walked.', note: 'This is the scene the piece keeps returning to. Could it open the piece?' },
    { quote: 'Marsh said the bus costs about $61,000 a year to run', note: 'The budget section starts here and runs four paragraphs. Could it be one?' },
    { quote: 'Okafor keeps his own count.', note: 'The day resumes here. Does the reader still remember it is November in Pell?' },
    { quote: 'The commission will take up the grant in January.', note: 'The argument returns after the ending. Could this move above the last scene?' },
  ], 'quote').map(({ quote, note, start, end }) => ({ quote, note, start, end })) } }),
}
const ANSWERS = {
  'figures': () => ({ kind: 'figures', title: 'Find figures of speech', result: OPPS.figures }),
  'opportunities': () => ({ kind: 'opps', title: 'Where to add a technique', result: OPPS.opportunities }),
  'read': (b) => { const r = FIXTURE_READ({ sample: true, body: b }); return { kind: 'read', title: 'Read my piece', result: r.result } },
  'rewrite': (b, sel) => { const text = b.slice(sel.start, sel.end); return { kind: 'rewrite', title: 'Rewrite', result: { selection: { start: sel.start, end: sel.end, text }, options: q.get('stocky') ? [
    { text: 'Moving forward, the memo calls it a modest efficiency.', how: 'adds a turn', unsupported: [] },
    { text: 'The memo basically calls it a modest efficiency.', how: 'plainer', unsupported: [] },
    { text: 'It is important to note that the memo calls it a modest efficiency.', how: 'slower', unsupported: [] },
  ] : [
    { text: 'The budget memo calls the cut a modest efficiency.', how: 'more concrete', unsupported: [] },
    { text: 'A modest efficiency, the budget memo calls it.', how: 'ends on the memo', unsupported: [] },
    { text: 'The memo calls it efficient.', how: 'tighter', unsupported: [] },
    { text: 'Moving forward, the memo leverages a modest efficiency.', how: 'stock (left out by Quick check)', unsupported: [] },
  ] } } },
  'ask': (b, sel, body) => sel && sel.end > sel.start
    ? { kind: 'ask', title: 'Ask the editor', result: { selection: { start: sel.start, end: sel.end, text: b.slice(sel.start, sel.end) }, options: [
      { text: 'A modest efficiency, the memo calls it, and it lands hardest last.', how: 'ends on the claim', unsupported: [] },
      { text: 'The memo calls the cut efficient.', how: 'plainer', unsupported: [] },
      { text: 'The budget memo calls closing two days a week a modest efficiency.', how: 'names the cut', unsupported: [] },
    ] } }
    : { kind: 'ask', title: 'Ask the editor', result: { summary: 'Two places carry the most weight for what you asked.', findings: pin(b, [
      { quote: 'If the council wants to save money, it should count who uses the room before it decides who can do without it.', issue: 'Land it on the person, not the council: end on who would lose the room.', try: 'Before the council decides who can do without the room, it should count who uses it: Arturo, the sisters, the nurse in the chair.' },
      { quote: 'That number is real.', issue: 'Concede and turn in one breath so the ending has momentum.', try: 'That number is real, and it is the wrong one.' },
    ], 'quote').map(({ quote, issue, try: t, start, end }) => ({ quote, issue, try: t, start, end, unsupported: [] })) } },
  'refine': (b, sel, body) => ({ kind: 'refine', title: 'Change it', result: { selection: { start: sel.start, end: sel.end, text: b.slice(sel.start, sel.end) }, options: body.request === 'shorter'
    ? [{ text: 'The memo calls it efficient.', how: 'shorter', unsupported: [] }, { text: 'Efficient, says the memo.', how: 'shorter still', unsupported: [] }, { text: 'The memo: efficient.', how: 'clipped', unsupported: [] }]
    : [{ text: 'The budget memo says it saves a little.', how: body.request || 'plainer', unsupported: [] }, { text: 'The memo calls the cut a small saving.', how: body.request || 'plainer', unsupported: [] }, { text: 'A small saving, the memo says.', how: body.request || 'plainer', unsupported: [] }] } }),
  'explain': (b, sel, body) => ({ kind: 'explain', title: 'Why?', result: { text: 'Ending on the memo puts its own phrase last, where a reader weighs it. Your version ends on "efficiency," which is the word you want the reader to doubt.' } }),
  'next': (b, sel) => ({ kind: 'next', title: 'Suggest a next sentence', result: { at: sel.end, options: [
    { text: 'None of them is counted.', how: 'turns to the memo', unsupported: [] },
    { text: 'Arturo was back the next Saturday, with a new address for the same résumé.', how: 'a detail you already have', unsupported: [] },
    { text: 'Ask the librarian how many [chairs are full by noon].', how: 'asks for a fact', unsupported: [] },
  ] } }),
  'endings': (b) => { const s = b.lastIndexOf('\n\n') + 2; return { kind: 'endings', title: 'Propose endings', result: { replaces: { start: s, end: b.length, text: b.slice(s) }, options: [
    { text: 'Before the council votes, someone should stand in the line on a Saturday morning and count.', how: 'A demand; gives up the quiet close.', unsupported: [] },
    { text: 'The nurse in the reading chair slept for forty minutes, and nobody woke her. Count her.', how: 'Returns to a person; ends on an order.', unsupported: [] },
    { text: 'The memo counts checkouts. The room counts everyone else.', how: 'A turn on the memo; loses the ask.', unsupported: [] },
  ] } } },
  'titles': (b) => ({ kind: 'titles', title: 'Title ideas', result: { current: 'The room nobody counts', options: [
    { text: 'Who uses the Ninth Street branch', how: 'Plain and exact' },
    { text: 'Forty minutes in the reading chair', how: 'The nurse, as an image' },
    { text: 'Four days a week', how: 'Names the stakes' },
    { text: 'What does the memo count?', how: 'The question the piece answers' },
    { text: 'Count the room', how: 'Short' },
  ] } }),
  'apply': (b, sel, body) => (body && body.item ? { kind: 'apply', title: 'Show me', result: (OPPS.show_me.find(x => x.id === body.item && x.quote === b.slice(sel.start, sel.end)) || OPPS.show_me[0]).result } : { kind: 'apply', title: 'Show me', result: { selection: { start: sel.start, end: sel.end, text: b.slice(sel.start, sel.end) }, text: 'So Arturo, who printed one résumé four times, leaves fewer marks on paper than a book returned late', how: 'Put Arturo in the claim', unsupported: [] } }),
  'pass:weakest': (b) => ({ kind: 'findings', title: 'Find weak sentences', result: { summary: 'Three sentences do less than their neighbors.', counts: { returned: 3, matched: 3, dropped: 0 }, findings: pin(b, [
    { quote: 'That number is real.', issue: 'It concedes the point in a sentence of its own. Make the concession do work: say what the number counts.', try: 'That number is real, but it counts only checkouts.' },
    { quote: 'None of them shows up in the memo.', issue: 'This is the hinge of the piece. Move it to the front of its paragraph, where it can land.', try: 'None of them shows up in the memo, and none of them came for a book.' },
    { quote: 'So the people who use the room most leave the fewest marks on paper', issue: 'The idea arrives as a summary. Put Arturo in it, so the claim carries its own proof.' },
  ], 'quote').map(({ quote, issue, try: t, start, end }) => ({ quote, issue, try: t || '', unsupported: [], start, end })) } }),
  'method:reader': (b) => ({ kind: 'note', title: 'See where readers get lost', result: { summary: 'A newcomer follows this easily until the fourth paragraph, where the church comparison arrives without a bridge. The three Saturdays are the strongest material, and the reader wants one of them earlier.', question: 'Would Arturo make a better first sentence than the line outside the door?', general: [{ note: 'The memo is never named or dated. A reader may wonder whether it is public.' }], counts: { returned: 2, matched: 2, dropped: 0 }, notes: pin(b, [
    { quote: 'in the same way that counting the pews would be the wrong way to measure a church that runs a food pantry in its basement', note: 'The comparison is vivid but changes subject. Does a reader need a second institution to see the first?' },
    { quote: 'a modest efficiency', note: 'Is this the memo’s phrase? If so, quotation marks would tell the reader whose words these are.' },
  ], 'quote').map(({ quote, note, start, end }) => ({ quote, note, start, end })) } }),
  'pass:typos': (b) => ({ kind: 'changes', title: 'Fix punctuation and typos', result: { summary: 'Two small fixes.', changes: pin(b, [
    { quote: 'the printers, the Wi-Fi and the one quiet room', replacement: 'the printers, the Wi-Fi, and the one quiet room', reason: 'A comma before "and" keeps the third item from reading as part of the second.' },
    { quote: 'did their chemistry homework at the corner table until the lights flickered at close', replacement: 'did their chemistry homework at the corner table until the lights flickered at closing', reason: '"At close" reads as a typo for "at closing."' },
  ], 'quote').map(({ quote, replacement, reason, start, end }) => ({ quote, replacement, reason, start, end })) } }),
  'wording': (b, sel) => {
    const text = b.slice(sel.start, sel.end)
    const options = text === 'modest'
      ? [{ text: 'small', why: 'Plainer; matches how the memo itself talks' }, { text: 'minor', why: 'Shrinks it further, a touch dismissive' }, { text: 'tidy', why: 'Hints at bookkeeping, which is your point' }, { text: 'painless', why: 'Names what the memo implies and you dispute' }]
      : [{ text: 'That undersells what the building does: it is', why: 'Drops three hedges; states the claim' }, { text: 'The memo misses what the building is:', why: 'Shorter; turns on the memo' }, { text: 'What the building actually does is serve as', why: 'Keeps your rhythm, loses the doubt' }, { text: 'The building is', why: 'Bare; lets the next clause carry it' }]
    return { kind: 'wording', title: 'Suggest wording', result: { selection: { start: sel.start, end: sel.end, text }, options } }
  },
  'cut': (b) => ({ kind: 'cuts', title: 'Try a shorter draft', result: { summary: 'Four cuts take out the windup and a second comparison the argument does not need. Arturo, the sisters and the nurse all stay.', counts: { returned: 4, matched: 4, dropped: 0 }, cuts: pin(b, [
    { quote: 'It is important to note that ', reason: 'Windup before the point. "Most of the people" can start the sentence.' },
    { quote: 'I think that might perhaps understate what the building actually does, which is serve as the only public place within two miles where a person can basically leverage a free afternoon into a job application.', reason: 'Three hedges soften the claim, and your three Saturdays prove it better.' },
    { quote: ', in the same way that counting the pews would be the wrong way to measure a church that runs a food pantry in its basement', reason: 'A second comparison the reader does not need after the memo.' },
    { quote: 'That number is real. ', reason: 'Concedes before the turn; the next sentence carries it.' },
  ], 'quote').map(({ quote, reason, start, end }) => ({ quote, reason, start, end })) } }),
  'flip:thesis': (b) => { const cur = 'If the council wants to save money, it should count who uses the room before it decides who can do without it.'; const s = b.indexOf(cur); return { kind: 'flip', title: 'Three ways to state the main point', result: { insert: false, replaces: { start: s, end: s + cur.length, text: cur }, options: [
    { text: 'Before it cuts the Ninth Street branch, the council should count who uses the room.', how: 'Narrower: asks for a count, not a vote.', unsupported: [] },
    { text: 'A budget that counts only checkouts will always find the people who need this room easy to cut.', how: 'Bolder: says the method itself is the problem.', unsupported: [] },
    { text: 'Cutting Saturdays closes the only free public room within two miles, and the memo never says so.', how: 'Names the stakes and the memo’s silence.', unsupported: [] },
  ] } } },
  'flip:promise': (b) => { const at = b.indexOf('\n\n'); return { kind: 'flip', title: 'Three ways to make the promise', result: { insert: true, replaces: { start: at, end: at, text: '' }, options: [
    { text: 'This is about what the budget memo cannot see, and what the city loses if it never looks.', how: 'What is at stake; kept in the last two paragraphs.', unsupported: [] },
    { text: 'Here is who uses the room on a Saturday, and why none of them shows up in the numbers.', how: 'What the reader will learn; kept by the three Saturdays.', unsupported: [] },
    { text: 'What does a library owe a tired nurse at four in the afternoon?', how: 'The question the piece answers; kept by the nurse.', unsupported: ['four in the afternoon'] },
  ] } } },
  'method:draft': (b) => ({ kind: 'draft', title: 'Turn material into a draft', result: { insert: false, replaces: { start: 0, end: b.length, text: b }, options: [
    { text: 'The Ninth Street branch is open six days a week. The budget memo would cut it to four, and it measures the branch by checkouts, which have fallen by a third in five years.\n\nThat is not what the room is for. Arturo printed his résumé four times because the shelter’s address kept changing. Two sisters do their chemistry homework at the corner table. A nurse slept for forty minutes in the reading chair, and nobody woke her.\n\nBefore you decide, count who uses the room.', how: 'Memo first, then the people, then the ask.', gaps: ['The date of the council vote', 'Your name and ward for the signature'], unsupported: [] },
    { text: 'Arturo printed the same résumé four times at the Ninth Street branch, because the shelter’s address kept changing. He is one of the people the budget memo does not count.', how: 'Starts with Arturo; the memo arrives second.', gaps: ['What you want the council to do, and by when'], unsupported: [] },
    { text: 'The memo counts checkouts. It does not count the 40 minutes a nurse slept in the reading chair, or the 300 people a week who come for the printers.', how: 'Built on what the count leaves out.', gaps: [], unsupported: ['300'] },
  ] } }),
  'method:voice-check': (b) => ({ kind: 'voice', title: 'Check whether it sounds like you', result: { summary: 'Most of the piece sounds like the letter to your sister: plain statements, a concrete thing at the end of a sentence. The second paragraph drifts; it stacks hedges in front of the claim, which your sample never does.', question: 'Is the hedging in the second paragraph a choice, or a habit of public writing?', counts: { returned: 2, matched: 2, dropped: 0 }, notes: pin(b, [
    { quote: 'I think that might perhaps understate what the building actually does', judgment: 'drift', sample: 'You were nine and furious about the canoe', sample_title: 'Letter to my sister', note: 'Your sample says the feeling flat out. Here three hedges come before the claim. Do you want the reader to hear doubt?' },
    { quote: 'and nobody woke her', judgment: 'aligned', sample: 'and I still have the paddle', sample_title: 'Letter to my sister', note: 'A short clause that lands on a plain fact, the way your sample ends. Keep it?' },
  ], 'quote').map(({ quote, note, judgment, sample, sample_title, start, end }) => ({ quote, note, judgment, sample, sample_title, start, end })) } }),
  'method:panel': (b) => ({ kind: 'panel', title: 'Get several editorial perspectives', result: PANEL(b) }),
  'method:debate': (b) => ({ kind: 'debate', title: 'Let reviewers argue it through', result: { panel: PANEL(b), question: 'Does the church comparison stay, or does the piece end its argument at the memo?', sides: [
    { side: 'A', reviewer: 'newcomer', name: 'The newcomer', position: 'Cut it. A second institution arrives just as the reader has the first one.', passage: span(b, 'in the same way that counting the pews would be the wrong way to measure a church'), argument: 'The paragraph’s job is to show that the memo counts the wrong thing. It has done that by “It is also the wrong number.” The church then asks the reader to picture a new building, a new kind of counting and a food pantry in one clause, and the next paragraph has to bring them back to the printers.', concedes: 'The comparison is vivid and true to the argument.', quotes: [] },
    { side: 'B', reviewer: 'skeptic', name: 'The skeptic', position: 'Keep it. It is the one place the piece shows why counting checkouts fails anywhere.', passage: span(b, 'runs a food pantry in its basement'), argument: 'A skeptical council member can dismiss three Saturdays as anecdotes. The church makes the claim general: any place that serves people outside its official job will look wasteful to the wrong count. Without it the piece is a plea for one branch; with it, it is an argument about method.', concedes: 'It does change subject for a sentence.', quotes: [] },
  ], close: { moved: 'Both agree the comparison is vivid and that it turns the piece from one branch to a method.', unresolved: 'Whether this reader needs the general argument, or only the branch.', decision: 'Is this piece asking the council to save one branch, or to change how it counts?' } } }),
  'method:save': (b) => ({ kind: 'lessons', title: 'Keep a lesson for next time', result: { summary: 'You cut hedges by hand twice and skipped one fix that would have flattened your phrasing.', counts: { returned: 2, matched: 2, dropped: 0 }, lessons: [
    { rule: 'State the claim, then the evidence; no stacked hedges in front of it.', scope: 'lasting', section: 'style', evidence: 'That undersells what the building does', why: 'You replaced three hedges with this by hand.' },
    { rule: 'Keep "at close" the way the library staff say it.', scope: 'piece', section: 'voice', evidence: 'until the lights flickered at close', why: 'You skipped the fix to "closing".' },
  ] } }),
  'method:onboarding': (b) => ({ kind: 'guidance', title: 'Build your writing guidance', result: { summary: 'One sample, so this is a start, not a profile. It writes in plain statements and ends sentences on objects.', counts: { returned: 2, matched: 2, dropped: 0 }, proposals: [
    { section: 'voice', rule: 'End a sentence on the concrete thing, not on the feeling about it.', evidence: 'and I still have the paddle', sample_title: 'Letter to my sister', why: 'The feeling is implied by the object.' },
    { section: 'style', rule: 'Give an age or a number only when it changes the picture.', evidence: 'You were nine and furious about the canoe', sample_title: 'Letter to my sister', why: 'Nine does the work an adjective would.' },
  ], gaps: ['Nothing yet about how you write for strangers rather than family.', 'One sample is too few to tell rhythm from habit.'], questions: ['Who reads your public pieces first?', 'Do you want the letter voice in op-eds, or a cooler one?'] } }),
  'method:emergent': (b) => ({ kind: 'across', title: 'Find the piece across drafts', result: { summary: 'Both pieces are about rooms that official records miss: the branch on Saturdays and the hall at the zoning hearing. The library piece has the people; the hearing notes have the second example.', possibility: 'A piece about what cities fail to count, built on the branch and the hearing.', notes: [
    { ...span(b, 'None of them shows up in the memo.'), label: 'P1', here: true, title: sample.title, note: 'The hinge both pieces share.' },
    { ...span(b, 'So the people who use the room most leave the fewest marks on paper'), label: 'P1', here: true, title: sample.title, note: 'Your thesis for the larger piece, already written.' },
    { start: 39, end: 85, quote: 'Nobody counted the people standing in the hall', label: 'P2', here: false, title: 'Notes on the zoning hearing', note: 'The same failure in a second room.' },
  ], gaps: ['A number for the hall, if anyone kept one'], decisions: ['Which room opens the piece?', 'Is this still a letter to the council?'], coverage: [{ id: current.id, label: 'P1', title: sample.title, sent: 1, total: 1 }, { id: zoning.id, label: 'P2', title: 'Notes on the zoning hearing', sent: 1, total: 1 }], counts: { returned: 3, matched: 3, dropped: 0 } } }),
  'openings': (b) => { const end = b.indexOf('\n\n'); return { kind: 'openings', title: 'Propose openings', result: { replaces: { start: 0, end, text: b.slice(0, end) }, options: [
    { opening: 'A man named Arturo printed the same résumé four times last Saturday, because the shelter’s address kept changing. He did it at the branch library on Ninth Street, which the city now wants to open four days a week instead of six.', how: 'Starts with one person; delays the budget fight by a sentence.' },
    { opening: 'The budget memo calls it a modest efficiency: cut the Ninth Street branch to four days a week. Stand in the line outside on a Saturday morning and you will see what that efficiency costs.', how: 'Opens on the claim; the scene becomes the proof.' },
    { opening: 'Every Saturday the line at the Ninth Street library forms before ten, and almost nobody in it has come for a book.', how: 'Your opening, shortened to one sentence; loses the printers and Wi-Fi.' },
  ] } } },
}

// A stand-in for the stored sample read (fixture text, for checks only; judged shots inject a real one).
function FIXTURE_READ(p) {
  if (!p || !p.sample) return null
  const b = p.body, c = (q, change, why, t) => ({ ...span(b, q), change, why, try: t, unsupported: [] })
  return { id: 'sample-read', kind: 'read', status: 'done', sample: true, model: MODEL, result: {
    verdict: 'Fixture verdict for the harness.',
    changes: [c('I think that might perhaps understate what the building actually does', 'Cut the three hedges', 'Fixture reason.', 'That understates what the building does'),
      c('The budget memo calls it a modest efficiency.', 'Say whose word it is', 'Fixture reason.', 'The budget memo calls the cut a modest efficiency.'),
      c('That number is real.', 'Say what the number counts', 'Fixture reason.', 'That number counts checkouts, and only checkouts.'),
      { ...c('They come for the printers, the Wi-Fi and the one quiet room in the neighborhood that does not charge anyone to sit down.', 'Cut the list the scenes already show', 'Fixture reason.', ''), cut: true }].filter(x => x.quote).map((x, i) => ({ ...x, rank: i + 1 })),
    cut_first: { ...span(b, 'It is important to note that'), why: 'Fixture reason.' } } }
}
function span(b, q) { const s = b.indexOf(q); return s < 0 ? null : { start: s, end: s + q.length, quote: q } }
function PANEL(b) {
  const f = (q, issue) => ({ ...span(b, q), issue })
  const reviewers = [
    { id: 'newcomer', name: 'The newcomer', status: 'done', summary: 'Easy to follow until the church arrives in the fourth paragraph; the memo is never named.', findings: [f('in the same way that counting the pews would be the wrong way to measure a church', 'A new building in mid-argument. Do I need it?'), f('The budget memo calls it a modest efficiency.', 'Which memo? Is it public?')] },
    { id: 'skeptic', name: 'The skeptic', status: 'done', summary: 'The people are vivid, but three Saturdays are anecdotes; the church comparison is what makes this an argument.', findings: [f('a church that runs a food pantry in its basement', 'This is your strongest general claim. Why bury it at the end of a sentence?'), f('The budget memo calls it a modest efficiency.', 'Does the memo say this, or is it your summary?'), f('That number is real.', 'Why concede before the turn?')] },
    { id: 'editor', name: 'The line editor', status: 'failed', message: 'Your model took too long to answer. Try again, or run the pass on one section.', summary: '', findings: [] },
  ]
  const g = (q, notes) => ({ ...span(b, q), notes, reviewers: notes.map(n => n.reviewer) })
  return { reviewers, agreements: [
    g('The budget memo calls it a modest efficiency.', [{ reviewer: 'newcomer', name: 'The newcomer', issue: 'Which memo? Is it public?' }, { reviewer: 'skeptic', name: 'The skeptic', issue: 'Does the memo say this, or is it your summary?' }]),
    g('in the same way that counting the pews would be the wrong way to measure a church that runs a food pantry in its basement', [{ reviewer: 'newcomer', name: 'The newcomer', issue: 'A new building in mid-argument. Do I need it?' }, { reviewer: 'skeptic', name: 'The skeptic', issue: 'This is your strongest general claim. Why bury it at the end of a sentence?' }]),
  ] }
}

window.__calls = []
function fakeRest(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase(), body = opts.body || {}
  window.__calls.push({ path, method, body })
  if (STATE === 'off') return Promise.reject(new Error('404: {"detail":"Not Found"}'))
  const m = (re) => path.match(re)
  let r
  if (path.startsWith('/thesaurus/') && STATE === 'wordsoff') return Promise.reject(new Error('Hermes desktop bridge unavailable'))
  if (path.startsWith('/thesaurus/')) return fetch(`../library/thesaurus/${path.slice(11)}.json`).then(x => x.json())
  if (path === '/health') r = { ok: true }
  else if (path === '/state' && q.get('slow') && !opts.__late) return new Promise(res => setTimeout(() => res(fakeRest(path, { ...opts, __late: true })), Number(q.get('slow'))))
  else if (path === '/state') r = { pieces: Object.values(db.pieces).filter(p => !p.trashed).sort((a, b) => b.updated - a.updated).map(meta), trash: Object.values(db.pieces).filter(p => p.trashed).length, current: full(current), running: null, settings, sample_read: window.__SAMPLE_READ !== undefined ? window.__SAMPLE_READ : FIXTURE_READ(current) }
  else if (path === '/settings') { if (method === 'POST') Object.assign(settings, body); r = settings }
  else if ((r = m(/^\/scene\/builtin\/(\w+)$/))) return builtinScene(r[1])
  else if (path === '/scene/picture' && method === 'GET') r = { data: db.picture || null }
  else if (path === '/scene/picture') { db.picture = `data:image/png;base64,${body.data}`; r = { data: db.picture } }
  else if (path === '/scene/picture/remove') { db.picture = null; r = { data: null } }
  else if (path === '/link') {
    if (/127\.0\.0\.1|localhost|192\.168\./.test(body.url || '')) return Promise.reject(new Error('400: {"detail":"The Clearing only brings in public web pages. That address points inside your own computer or network."}'))
    r = { url: body.url, title: 'Branch hours and the budget', body: 'The county commission will vote in January on a plan to close three branches on Saturdays.\n\nThe plan counts checkouts, which fell by a third in five years. It does not count visits, printer use or the meeting room.' }
  } else if (path === '/import/pdf') r = { title: 'Council budget memo', body: 'The memo proposes four-day weeks at three branches.\n\nSavings are estimated from checkout counts.', stopped: false }
  else if (path === '/dictation' && method === 'GET') r = q.get('speech') === 'none' ? { ready: false, local: null, label: '', message: 'Dictation needs speech-to-text. Turn it on in Hermes Settings, Voice, then try again.', press_first: false }
    : q.get('speech') === 'local' ? { ready: true, engine: 'hermes', provider: 'local', local: true, label: "Hermes's speech-to-text on your computer", message: '', press_first: false }
      : { ready: true, engine: 'hermes', provider: 'openai', local: false, label: 'OpenAI', message: '', press_first: true }
  else if (path === '/dictation') r = body.send_to === 'openai' ? { text: 'Nobody in the line had come for a book.', label: 'OpenAI', local: false } : { needs_press: true, ask: 'Your recording goes to OpenAI, the speech-to-text chosen in Hermes Settings, Voice, to be turned into text. Send it?', send_to: 'openai', label: 'OpenAI' }
  else if (path === '/pieces' && method === 'GET') r = { pieces: Object.values(db.pieces).filter(p => !p.trashed).map(meta), trash: Object.values(db.pieces).filter(p => p.trashed).map(meta) }
  else if ((r = m(/^\/pieces\/(\w+)\/delete$/))) { if (!db.pieces[r[1]]?.trashed) throw new Error('400: Move this piece to the trash first. Only a piece in the trash can be deleted forever.'); delete db.pieces[r[1]]; r = { pieces: Object.values(db.pieces).filter(p => !p.trashed).map(meta), trash: Object.values(db.pieces).filter(p => p.trashed).map(meta) } }
  else if (path === '/trash/empty') { const gone = Object.values(db.pieces).filter(p => p.trashed); for (const p of gone) delete db.pieces[p.id]; r = { deleted: gone.length, pieces: Object.values(db.pieces).filter(p => !p.trashed).map(meta), trash: [] } }
  else if (path === '/pieces' && method === 'POST') { const p = addPiece(body.title || '', body.body || '', { updated: now() }); r = full(p) }
  else if ((r = m(/^\/pieces\/(\w+)\/save$/))) { const p = db.pieces[r[1]]; if (body.title != null) p.title = body.title; if (body.body != null) p.body = body.body; p.updated = now(); r = meta(p) }
  else if ((r = m(/^\/pieces\/(\w+)\/versions$/)) && method === 'GET') r = { finished: db.versions[0].id, usage: { passes: 6, tokens_in: 41820, tokens_out: 5310 }, versions: db.versions.filter(v => v.piece_id === r[1]).sort((a, b) => b.created - a.created).map((v, i, all) => ({ ...v, label: LABELS[v.reason], words: words(v.body), start: v.body.slice(0, 140), changed: changedPhrase(v.body, all[i + 1] ? all[i + 1].body : null) })),
    suggested: db.decisions.filter(d => d.model && d.choice === 'chose').reverse().map(d => ({ ...d, label: d.kind, created: d.created })) }
  else if ((r = m(/^\/pieces\/(\w+)\/versions$/))) { const v = { id: id(), piece_id: r[1], title: body.title, body: body.body, reason: body.reason, created: now() }; db.versions.push(v); r = { version: v } }
  else if ((r = m(/^\/pieces\/(\w+)\/finish$/))) { const p = db.pieces[r[1]]; p.finished_version = 'x'; r = full(p) }
  else if ((r = m(/^\/pieces\/(\w+)$/))) r = full(db.pieces[r[1]])
  else if (path === '/passes') {
    if (STATE === 'nomodel' || STATE === 'cutoff') {
      const code = STATE === 'nomodel' ? 'no_model' : 'cut_off'
      const message = code === 'no_model' ? "Hermes doesn't have a model ready for The Clearing. Choose one in Settings, then try again." : 'The editor stopped before finishing. Try a shorter piece or one section.'
      const p = { id: id(), target: body.target, title: 'Find weak sentences', kind: 'findings', status: 'failed', code, message, elapsed: 3 }
      db.passes[p.id] = p; r = { ...p, status: 'running' }
    } else {
      if (!settings.suggestions && /^(rewrite|next|endings|titles|apply|wording|openings|flip:|method:draft)/.test(body.target)) return Promise.reject(new Error('400: {"detail":"Suggested text is off for this room. Turn it on in The room, in the title menu, to see suggestions."}'))
    if (q.get('fail') === body.target) { const p = { id: id(), target: body.target, title: body.target === 'read' ? 'Read my piece' : body.target, kind: body.target, status: 'failed', code: 'unreadable', message: "The editor's answer came back in a form The Clearing can't read. Nothing changed. Try again.", elapsed: 2 }; db.passes[p.id] = p; return Promise.resolve({ ...p, status: 'running' }) }
    const a = ((LONG && LONG_ANSWERS[body.target]) || ANSWERS[body.target] || (LONG && LONG_ANSWERS['pass:weakest']) || ANSWERS['pass:weakest'])(body.body, body.selection, body)
      const working = STATE === 'working' || STATE === 'debating' || STATE === 'readingnow'
      const p = { id: id(), target: body.target, status: working ? 'running' : 'done', model: MODEL, provider: 'nous', elapsed: 14, ...a, ...(STATE === 'debating' ? { step: 'The skeptic answers' } : {}), ...(STATE === 'readingnow' ? { phase: 'reading', words: words(body.body || '') } : {}) }
      db.passes[p.id] = p; r = { ...p, status: 'running', result: null }
    }
  } else if (path === '/coach') { const c = OPPS.coach.find(x => x.id === body.item && x.quote === body.quote) || OPPS.coach[OPPS.coach.length - 1]; r = { text: c.text, model: MODEL }; return new Promise(res => setTimeout(() => res(r), 400)) }
  else if (path === '/guidance' && method === 'GET') r = { rules, sections: ['voice', 'style', 'audience', 'guardrails', 'workflow'], samples: Object.values(db.pieces).filter(p => p.voice && !p.trashed).map(meta) }
  else if (path === '/guidance') { const x = { id: id(), status: 'kept', ...body }; rules.push(x); r = x }
  else if ((r = m(/^\/guidance\/(\w+)$/))) { const x = rules.find(y => y.id === r[1]); Object.assign(x, body); if (body.status === 'retired') rules.splice(rules.indexOf(x), 1); r = x }
  else if ((r = m(/^\/pieces\/(\w+)\/voice$/))) { const p = db.pieces[r[1]]; p.voice = !!body.on; r = meta(p) }
  else if ((r = m(/^\/pieces\/(\w+)\/decisions$/))) { for (const d of body.items || []) db.decisions.push({ ...d, created: now() }); window.__decisions = db.decisions; r = { saved: (body.items || []).length } }
  else if (path === '/home/plan') r = { folder: '/Users/you/.hermes/plugin-data/clearing/home', fingerprint: 'a1b2c3d4e5f6', create: 9, keep: 1, files: [
    { path: 'README.md', status: 'create' }, { path: 'VOICE.md', status: 'keep' }, { path: 'STYLE.md', status: 'create' }, { path: 'examples/Letter to my sister.md', status: 'create' },
    { path: 'drafts/The room nobody counts.md', status: 'create' }, { path: 'drafts/Notes on the zoning hearing.md', status: 'create' }, { path: 'drafts/Letter to my sister.md', status: 'create' },
    { path: 'drafts/Council letter.md', status: 'create' }, { path: 'drafts/Spring newsletter.md', status: 'create' }, { path: 'drafts/Toast for Dana.md', status: 'create' }] }
  else if (path === '/home/setup') r = { folder: '/Users/you/.hermes/plugin-data/clearing/home', created: new Array(9).fill('x'), kept: ['VOICE.md'], failed: [] }
  else if (path === '/export/docx') r = { path: '/hermes/plugin-data/clearing/exports/The room nobody counts.docx', name: 'The room nobody counts.docx' }
  else if ((r = m(/^\/passes\/(\w+)\/stop$/))) r = { ...db.passes[r[1]], status: 'stopped' }
  else if ((r = m(/^\/passes\/(\w+)$/))) {
    // Rewrites land one at a time: the first poll has A, the next A and B, then the whole answer.
    const p = db.passes[r[1]]
    if (p && p.status === 'done' && (p.kind === 'rewrite' || (p.kind === 'ask' && p.result && p.result.options)) && (p.polls || 0) < 2) {
      p.polls = STATE === 'rewriting' ? 1 : (p.polls || 0) + 1 // 'rewriting' holds on the first answer, to show the filling state
      r = { ...p, status: 'running', result: { ...p.result, options: p.result.options.slice(0, p.polls) } }
    } else r = p
  }
  else return Promise.reject(new Error(`404: {"detail":"Not Found"}`))
  return new Promise(res => setTimeout(() => res(JSON.parse(JSON.stringify(r))), 20))
}

// The built-in scenes, as dashboard/plugin_api.py serves them: the photograph in desktop/assets/ as base64.
const SCENE_FILES = { snow: 'snow-light.jpg', marsh: 'quiet-marsh.jpg', tide: 'night-tide.jpg' }
async function builtinScene(name) {
  if (!SCENE_FILES[name]) throw new Error('404: {"detail":"That scene is not part of The Clearing."}')
  const bytes = new Uint8Array(await (await fetch(`../desktop/assets/${SCENE_FILES[name]}`)).arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12)
  return { name, mime: 'image/jpeg', hash, data: btoa(bin) }
}

const store = new Map(STATE === 'invite' ? [] : /^(welcome|sample)/.test(STATE) ? [['invited', 'true']] : [['invited', 'true'], ['welcomed', 'true']])
const ctx = {
  rest: fakeRest,
  storage: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v), remove: k => store.delete(k) },
  os: { writeClipboard: async () => true, openExternal: async () => true, revealPath: async () => true },
  files: { folders: async () => [{ id: 'f1', name: 'Writing', path: '~/Writing' }], requestFolder: async () => ({ ok: true, folder: { id: 'f1', name: 'Writing' } }), writeText: async () => ({ ok: true }), release: async () => true },
  registerMany: list => { ctx.registered = list },
  onDispose: () => {},
}
if (q.get('scene') && q.get('scene') !== 'plain' && q.get('scene') !== 'marsh') store.set('scene', JSON.stringify(q.get('scene')))
if (q.get('scene') === 'own') db.picture = './own-picture.png'
if (q.get('suggestions') === 'off') store.set('suggestions', 'false')
if (/^dict/.test(STATE)) { // a stand-in microphone: the harness never records
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
  window.MediaRecorder = class { constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm' } start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], { type: 'audio/webm' }) }); this.onstop && this.onstop() }
    static isTypeSupported() { return true } }
}
if (q.get('scene') === 'plain') store.set('scene', '"plain"')
if (q.get('shape')) store.set('shape', 'true')
if (q.get('scene') === 'marsh') store.set('scene', '"marsh"')
if (q.get('look')) store.set('look', JSON.stringify({ size: 'large', contrast: 'high' }))
// kept=1: the room's first screen from an earlier open is in the storage (desktop/src/boot.js); with slow=<ms> the
// backend's GET /state answers that late, so a screenshot shows what the room draws before it does.
if (q.get('kept')) store.set('boot', JSON.stringify({ v: 1, at: Date.now(), current: { ...meta(current), body: current.body }, pieces: Object.values(db.pieces).filter(p => !p.trashed).map(meta), trash: 1, settings: {} }))
window.__store = store // what the page keeps in ctx.storage, for checks
plugin.register(ctx)
const page = ctx.registered.find(c => c.id === 'page')
createRoot(document.getElementById('root')).render(jsx(page.render, {}))

// ---- scripted steps
const wait = ms => new Promise(r => setTimeout(r, ms))
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await wait(30) } return null }
const byText = (text, sel = 'button') => [...document.querySelectorAll(sel)].find(b => b.textContent.trim() === text)
const click = async text => { const b = await until(() => byText(text)); if (b) b.click(); await wait(80) }
function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
  setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }))
}
async function askFor(query, run = true) {
  await until(() => document.querySelector('.cl-room'))
  await wait(150)
  document.querySelector('.cl-ask').click()
  const input = await until(() => document.querySelector('.cl-askinput'))
  type(input, query)
  await wait(80)
  // The first row is the writer's own words to the editor; a scripted step that names a pass picks the pass.
  const on = document.querySelector('.cl-hit[data-on] strong')
  if (run && query && on && on.textContent.startsWith('Ask the editor') && !/^(make the ending land harder)$/.test(query)) { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await wait(60) }
  if (run) { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(1300) }
}
async function script() {
  await until(() => document.querySelector('.cl-titlefield'))
  await wait(200)
  const s = STATE
  if (s === 'quick' || s === 'quick2') { await askFor('quick check'); if (s === 'quick2') await click('Leave it') }
  if (s === 'pass' || s === 'working' || s === 'nomodel' || s === 'cutoff') await askFor('find weak sentences')
  if (s === 'note' || s === 'notewalk') { await askFor('where do readers get lost'); if (s === 'notewalk') await click('Walk the notes') }
  if (s === 'changes' || s === 'apply') { await askFor('typos'); if (s === 'apply') { await click('Keep'); await click('Skip') } }
  if (s === 'openings') { await askFor('my opening is weak'); await click('B') }
  if (s === 'words' || s === 'words2' || s === 'wordsoff') {
    const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('modest')
    ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + 6)
    ta.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await until(() => document.querySelector('.cl-alt, .cl-note p.cl-say'))
    await wait(200)
    if (s === 'words2') { await click('small'); await click('moderate') }
  }
  if (s === 'wording' || s === 'wording2') {
    const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('modest')
    ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + 6)
    ta.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await click('Suggest wording'); await until(() => document.querySelector('.cl-sugg'), 4000); await wait(100)
    if (s === 'wording2') { const b = [...document.querySelectorAll('.cl-sugg')][2]; b && b.click(); await wait(100) }
  }
  if (s === 'phrase') {
    const ta = document.querySelector('.cl-body'), q = 'I think that might perhaps understate what the building actually does, which is serve as', at = ta.value.indexOf(q)
    ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + q.length)
    await askFor('rephrase this')
    await until(() => document.querySelector('.cl-sugg'), 4000); await wait(400)
  }
  if (s === 'cuts' || s === 'cuts2') {
    await askFor('make it shorter')
    if (s === 'cuts2') { const c = [...document.querySelectorAll('.cl-cut')][2]; c && c.click(); await wait(100) }
  }
  if (s === 'flip') { await askFor('three ways to state the main point'); await click('B') }
  if (s === 'promise') { await askFor('three ways to make the promise'); await click('C') }
  if (s === 'draft') { await askFor('turn my notes into a draft'); await click('A') }
  if (s === 'voice') { await askFor('does this sound like me'); await click('Walk the notes') }
  if (s === 'panel' || s === 'panelwalk') { await askFor('several editorial perspectives'); if (s === 'panelwalk') await click('Where they agree') }
  if (s === 'debate' || s === 'debate3' || s === 'debating') { await askFor('let the reviewers argue'); if (s === 'debate3') { await click('Hear The newcomer'); await click('Hear The skeptic'); await click('Where it stands') } }
  if (s === 'lessons') await askFor('remember this lesson for next time')
  if (s === 'guidance') { await askFor('build my writing guidance'); await click('Keep this rule') }
  if (s === 'choose' || s === 'across') { await askFor('compare drafts'); const box = await until(() => document.querySelector('.cl-pick input')); box && box.click(); await wait(80); if (s === 'across') await click('Read 2 pieces together') }
  if (s === 'library' || s === 'figures') { await click('The room nobody counts'); await click('All methods'); if (s === 'figures') { await click('Editor passes'); const h = [...document.querySelectorAll('.cl-libhead')].find(x => /Figures/.test(x.textContent)); h && h.click(); await wait(100); const fig = [...document.querySelectorAll('.cl-figgroup')][3]; fig && fig.scrollIntoView() } }
  if (s === 'yourguidance') { await click('The room nobody counts'); await click('Your guidance') }
  if (s === 'home' || s === 'homedone') { await click('The room nobody counts'); await click('Your guidance'); await click('Set up a writing home'); await until(() => byText('Set it up')); if (s === 'homedone') await click('Set it up') }
  if (s === 'longquick') await askFor('quick check')
  if (s === 'longwalk' || s === 'fixmyself') await askFor('find weak sentences')
  if (s === 'longshape' || s === 'rewalk') { await askFor('find the shape'); await click('Walk the notes') }
  for (let i = 0; i < Number(q.get('step') || 0); i++) { await click('Leave it'); await wait(250) }
  if (s === 'rewalk') { while (byText('Leave it')) { await click('Leave it'); await wait(150) } await click('Read the summary'); await click('Walk the notes') }
  if (s === 'fixmyself') await click('Edit it myself')
  if (s === 'escask') { await askFor('', false); document.querySelector('.cl-askinput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(40); document.querySelector('.cl-room').dispatchEvent(new KeyboardEvent('keydown', { key: 'e', metaKey: true, ctrlKey: true, bubbles: true })); await wait(400) }
  if (s === 'askfiction') await askFor('fiction', false)
  if (s === 'libfiction') {
    await click('The room nobody counts'); await click('All methods')
    const head = await until(() => [...document.querySelectorAll('.cl-libhead')].find(h => h.querySelector('span').textContent === 'Find the human story'))
    if (head) { head.click(); await wait(150); head.scrollIntoView({ block: 'start' }) }
  }
  if (s === 'ask') await askFor('my ending is weak', false)
  if (s === 'askempty') await askFor('', false)
  // Find figures of speech and Where to add a technique (opps1)
  const spots = async which => { const b = await until(() => document.querySelector(`.cl-desk-side[data-id=${which}]`)); b && b.click(); await until(() => document.querySelector('.cl-spot'), 6000); await wait(300) }
  const typeInto = async (sel, text) => { const t = await until(() => document.querySelector(sel)); if (t) { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, text); t.dispatchEvent(new Event('input', { bubbles: true })) } await wait(120) }
  if (/^spot/.test(s)) {
    await spots('figures')
    if (s === 'spottry' || s === 'spotcoach' || s === 'spotmine') { await click('Try it'); await typeInto('.cl-tryit-box', OPPS.coach[0].line) }
    if (s === 'spotcoach' || s === 'spotmine') { await click('Ask the coach'); await until(() => document.querySelector('.cl-coach'), 4000); await wait(200) }
    if (s === 'spotmine') { await click('Use mine'); await wait(400) }
    if (s === 'spotnext') { await click('Next figure'); await click('Next figure'); await wait(300) }
  }
  if (/^opp/.test(s)) {
    await spots('opps')
    const pick = async n => { const h = [...document.querySelectorAll('.cl-opp-head')][n]; h && h.click(); await wait(300) }
    if (s === 'oppshow' || s === 'oppused' || s === 'oppundo') { await pick(1); await click('Show me'); await until(() => document.querySelector('.cl-proposed-page'), 4000); await wait(300) }
    if (s === 'oppcut') { await pick(2); await click('Show me'); await wait(900) }
    if (s === 'opplitany') { await pick(5); await click('Show me'); await until(() => document.querySelector('.cl-proposed-page'), 4000); await wait(300) }
    if (s === 'oppused' || s === 'oppundo') { await click('Use this'); await wait(500) }
    if (s === 'oppundo') { await click('Undo'); await wait(500) }
    if (s === 'opptry') { await pick(1); await click('Try it myself'); await typeInto('.cl-tryit-box', OPPS.coach[2].line); await click('Ask the coach'); await until(() => document.querySelector('.cl-coach'), 4000); await wait(200) }
  }
  if (s === 'menu') await click('The room nobody counts')
  if (s === 'finish') { await click('Finish'); await click('Save as .md') }
  if (s === 'finishword') { await click('Finish'); await click('Save as Word') }
  if (s === 'history') { await click('The room nobody counts'); await click('History') }
  if (s === 'room') { await click('The room nobody counts'); await click('The room') }
  if (s === 'trash' || s === 'trashask' || s === 'trashall') { db.pieces[addPiece('Notes for the council letter', 'More words.').id].trashed = now() - 7200; await click('The room nobody counts'); await until(() => [...document.querySelectorAll('.cl-item')].find(b => b.firstChild && b.firstChild.textContent === 'Trash')).then(b => b && b.click()); await wait(400)
    if (s === 'trashask') { document.querySelector('[aria-label^="Delete An older draft"]').click(); await wait(200) }
    if (s === 'trashall') { await click('Empty the trash'); await wait(200) } }
  if (s === 'about') { await click('The room nobody counts'); await click('About The Clearing') }
  // Damon's notes, Nov 8
  const select = (q, detail = 1) => { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf(q); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + q.length); ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail })) }
  const caretAfter = q => { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf(q) + q.length; ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at); ta.dispatchEvent(new Event('select', { bubbles: true })) }
  if (s === 'shownote' || s === 'shownoteused' || s === 'usedhistory') { await askFor('find weak sentences'); await click('Show me'); if (s !== 'shownote') { await click('Use this'); await wait(150) } if (s === 'usedhistory') { await wait(300); await click('The room nobody counts'); await click('History'); await wait(200) } }
  if (s === 'showask') { await askFor('find weak sentences'); await click('Leave it'); await click('Leave it'); await click('Show me'); await wait(1300) }
  if (s === 'sampleread' || s === 'sampleshow' || s === 'sampleused' || s === 'samplecut') {
    await click('Try it on the sample'); await until(() => document.querySelector('.cl-roomread')); await wait(300)
    if (s !== 'sampleread' && s !== 'samplecut') { await click('Show me'); await wait(400) }
    if (s === 'sampleused') { await click('Use this'); await wait(500) }
    if (s === 'samplecut') { await click('Cut this first'); await wait(400) }
  }
  if (s === 'readingnow') { const b = await until(() => document.querySelector('.cl-desk-read')); b && b.click(); await until(() => document.querySelector('.cl-read-progress'), 6000); await wait(1200) }
  if (s === 'theoread') { const b = await until(() => document.querySelector('.cl-desk-read')); b && b.click(); await until(() => document.querySelector('.cl-roomread'), 8000); await wait(300) }
  if (s === 'readlive') { const b = await until(() => document.querySelector('.cl-desk-read')); b && b.click(); await until(() => document.querySelector('.cl-roomread'), 8000); await wait(300) }
  if (s === 'tools') { select('The budget memo calls it a modest efficiency.'); await wait(200) }
  if (s === 'rewriting') { select('The budget memo calls it a modest efficiency.'); await click('Rewrite'); await until(() => document.querySelector('.cl-tile[data-opt]'), 4000); await wait(60) }
  if (s === 'rewrite' || s === 'rewritepick' || s === 'rewriteused' || s === 'rewritefolded') {
    select('The budget memo calls it a modest efficiency.'); await click('Rewrite'); await until(() => document.querySelector('.cl-note:not([aria-busy]) .cl-tiles, .cl-note:not([aria-busy]) .cl-flag'), 6000); await wait(200)
    if (s !== 'rewrite' && s !== 'rewritefolded') { const b = [...document.querySelectorAll('.cl-tile[data-opt]')][1]; b && b.click(); await wait(200) }
    if (s === 'rewriteused') { await click('Use this'); await wait(200) }
  }
  if (s === 'wordpop') { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('modest'); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + 6); ta.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await until(() => document.querySelector('.cl-alt')); await wait(200) }
  // Cmd E is the one shortcut: on a word its first row is Other words; in a gap, a next sentence.
  const cmdE = async () => { document.querySelector('.cl-body').dispatchEvent(new KeyboardEvent('keydown', { key: 'e', metaKey: true, ctrlKey: true, bubbles: true })); await wait(120); const i = await until(() => document.querySelector('.cl-askinput')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }
  if (s === 'wordkey') { caretAfter('modes'); await cmdE(); await until(() => document.querySelector('.cl-alt')); await wait(200) }
  if (s === 'next' || s === 'nextpick') { caretAfter('That number is real.'); await cmdE(); await until(() => document.querySelector('.cl-note:not([aria-busy]) .cl-tile[data-opt]'), 10000); if (s === 'nextpick') { const b = [...document.querySelectorAll('.cl-tile[data-opt]')][1]; b && b.click(); await until(() => document.querySelector('.cl-proposed-page'), 4000) } }
  if (s === 'endings') { await askFor('propose endings'); await click('B') }
  if (s === 'titles') { await askFor('title ideas'); const b = await until(() => [...document.querySelectorAll('.cl-sugg')][1]); b && b.click(); await wait(100) }
  if (s === 'bring') await click('Bring in')
  if (s === 'linknew') { await click('Bring in'); await click('A linkNew piece or at the cursor'); const i = await until(() => document.querySelector('.cl-field-input')); type(i, 'https://www.example.org/branch-hours'); await wait(50); await click('Bring it in'); await wait(300); await click('Make it a new piece'); await wait(400) }
  if (s === 'link' || s === 'linkbad') { await click('Bring in'); await click('A linkNew piece or at the cursor'); const i = await until(() => document.querySelector('.cl-field-input')); type(i, s === 'link' ? 'https://example.org/branch-hours' : 'http://127.0.0.1:8080/admin'); await wait(50); await click('Bring it in'); await wait(300) }
  if (s === 'paste') { await click('Bring in'); await click('Paste textNew piece or at the cursor'); const t = await until(() => document.querySelector('.cl-pastebox')); type(t, 'Notes from the Saturday line: eleven people, four on foot, two with laptops.'); await wait(100) }
  if (s === 'dictask' || s === 'dictating' || s === 'dictated') { caretAfter('That number is real.'); document.querySelector('.cl-mic').click(); await until(() => byText('Send')); if (s !== 'dictask') { await click('Send'); await wait(1200) } if (s === 'dictated') { document.querySelector('.cl-mic').click(); await wait(600) } }
  if (s === 'roomoff' || s === 'roomscene') { await click('The room nobody counts'); await click('The room') }
  if (s === 'askoff') await askFor('rewrite', false)
  if (s === 'changeit' || s === 'changed' || s === 'why') {
    select('The budget memo calls it a modest efficiency.'); await click('Rewrite'); await until(() => document.querySelector('.cl-note:not([aria-busy]) .cl-tile[data-opt]'), 6000); await wait(100)
    const b = [...document.querySelectorAll('.cl-tile[data-opt]')][1]; b && b.click(); await wait(150)
    await click('Change it')
    if (s === 'changed') { await click('Shorter'); await until(() => document.querySelector('.cl-note:not([aria-busy]) .cl-tile[data-opt]') && /Change it/.test(document.querySelector('.cl-margin, .cl-dock').textContent), 6000); await wait(200) }
    if (s === 'why') { await click('Why?'); await until(() => document.querySelector('.cl-why'), 6000); await wait(150) }
  }
  if (s === 'askown' || s === 'askownsel' || s === 'askownran') {
    if (s === 'askownsel') { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('The budget memo calls it a modest efficiency.'); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + 45) }
    await askFor('make the ending land harder', s !== 'askown'); await wait(300)
  }
  if (s === 'askctx') { const ta = document.querySelector('.cl-body'), at = ta.value.indexOf('The budget memo calls it a modest efficiency.'); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at + 45); await askFor('', false) }
  await wait(s === 'rewriting' ? 0 : 600) // let the last note finish arriving before the screenshot
  document.body.dataset.ready = '1'
}
script()

// store.changed_phrase, mirrored: the first words a version changed from the one before it.
function changedPhrase(nw, old, limit = 70) {
  if (old == null || nw === old) return null
  let a = 0; while (a < Math.min(nw.length, old.length) && nw[a] === old[a]) a++
  let b = 0; while (b < Math.min(nw.length, old.length) - a && nw[nw.length - 1 - b] === old[old.length - 1 - b]) b++
  const added = nw.length - b > a, src = added ? nw : old
  let text = src.slice(a, src.length - b)
  while (a > 0 && !/^\s/.test(text) && src[a - 1].trim()) { a--; text = src[a] + text }
  text = text.split(/\s+/).filter(Boolean).join(' ')
  if (text.length > limit) text = text.slice(0, limit).replace(/\s+\S*$/, '') + '…'
  return text ? { kind: added ? 'added' : 'cut', text } : null
}
