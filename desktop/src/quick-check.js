// A free, immediate read for habits that rarely need a model to spot.
// Each mark asks a question; nothing is banned and nothing changes until the writer edits.
//
// Words inside quotation marks are left alone: a quote is someone else's words, and the writer can't edit it.
// Sentences are split the way a reader splits them, so "Dr. Okafor", "St. Agnes", "1:52 a.m., with" and
// "U.S. Senate" stay inside one sentence. Every step is one pass over the text or works on a bounded window,
// so a 400,000-character paste costs no more than its length (security audit A-01).
const rules = [
  { kind: 'throat', issue: 'Throat-clearing. Does the sentence start sooner without it?', pattern: /\b(?:it is important to note(?: that)?|it's important to note(?: that)?|it should be noted(?: that)?|it is worth noting(?: that)?|it's worth noting(?: that)?|needless to say|it goes without saying(?: that)?|the fact of the matter is(?: that)?|at the end of the day|here's the thing|the truth is(?: that)?|let me be clear|in many ways|all things considered|when all is said and done)\b,?/gi },
  { kind: 'stock-open', issue: 'A stock way to set the scene. What, specifically, changed, and for whom?', pattern: /\b(?:in today['’]s (?:[\w-]+,? ){0,4}?(?:world|landscape|environment|climate|age|era|society|economy|market|marketplace|culture|times)|in (?:an?|the|this|our) (?:[\w-]+ ){0,2}?(?:ever[- ]changing|ever[- ]evolving|rapidly (?:changing|evolving)|fast[- ]paced|constantly (?:changing|evolving)|increasingly (?:complex|connected|digital))(?: [\w-]+){0,3}? (?:world|landscape|environment|climate|age|era|society|economy|market|culture|times)|now more than ever|since the dawn of (?:time|history|civilization|humankind)|(?:we|you) live in (?:a|an) (?:[\w-]+ ){0,2}?(?:world|age|era|time)|it['’]s no secret that|it is no secret that)\b,?/gi },
  { kind: 'stacked-hedge', issue: 'Two hedges in a row. Pick one, or neither, and say what you mean.', pattern: /\b(?:might|may|could|would) (?:perhaps|possibly|maybe|potentially)\b|\b(?:really|actually|basically|just|truly|literally|simply|honestly) (?:really|actually|basically|just|truly|literally|simply|honestly)\b|\bI think (?:that )?(?:it )?(?:might|may|could|perhaps|maybe)\b/gi },
  { kind: 'filler', issue: 'Filler word. Does the sentence lose anything without it?', pattern: /\b(?:basically|literally|very|quite|somewhat|kind of|sort of|in order to)\b/gi },
  { kind: 'stock', issue: 'A stock business phrase. What would you say to a friend instead?', pattern: /\b(?:leverage[sd]?|leveraging|synerg(?:y|ies)|delve|deep dive|circle back|moving forward|double down|lean into|game[- ]changer|unpack(?:ing)?|move the needle|low-hanging fruit|best-in-class|world-class)\b/gi },
  { kind: 'pileup', issue: 'A pile of near-synonyms. One precise word usually carries more.', pattern: /\b\w+ (?:or|and) \w+ (?:or|and) \w+ (?:way|manner|fashion)\b/gi },
]
const CONTRAST = 'A “not X, it’s Y” setup. Could you just say Y, and show why?'
const longSentence = 40

// "kind of" and "sort of" after a word like "what" or "the" mean "type of" ("what kind of hospital"), not a hedge.
const TYPE_OF = /\b(?:what|which|whatever|this|that|these|those|the|a|an|any|some|every|each|no|one|same|other|another|my|your|his|her|its|our|their|all|only|right|wrong|first|last)\s+$/i

// ---------------------------------------------------------------- sentences --
// Words that come before a name or a number, so their period never ends a sentence.
const TITLES = new Set('Mr Mrs Ms Mx Dr Drs Prof Rev Fr Sra St Ste Mt Ft Sen Sens Rep Reps Gov Lt Col Gen Maj Capt Cpt Sgt Cpl Pvt Cmdr Adm Det Insp Supt Atty Hon Pres vs Messrs Mme Mlle'.split(' '))
// Abbreviations that can end a sentence or sit inside one; they end it only when a sentence plainly starts next.
const SOFT = new Set('etc Inc Ltd Co Corp Bros Jr Sr Ave Blvd Rd Hwy Jan Feb Mar Apr Aug Sep Sept Oct Nov Dec approx dept est misc'.split(' '))
const NEVER = new Set(['e.g', 'i.e', 'cf', 'viz', 'al']) // "e.g." and "i.e." always lead into more of the sentence
// Words that commonly open a sentence. After an abbreviation, a capitalized word from this list starts a new one.
const STARTERS = new Set('The A An He She It They We I You This That These Those There Then But And So Yet Or Nor For In On At By To From With Without When While After Before Since Because If Although Though As His Her Their Our My Its Your No Not Now Still Even Only Instead Meanwhile Later Today Tomorrow Yesterday Here Why What How Who Where Some Most Many Each Every All One Two Three'.split(' '))
// A run of sentence marks is tried only from its first mark. Tried from every mark, a long run with no space
// after it (".....x") cost time that grew with the square of its length (second security review, B-01). A match
// can never begin inside a run that failed from its start, so the sentence ends found are the same.
export const END = /(?<![.!?…])[.!?…]+[”"’')\]]*(?=\s|$)|\n/g

// The sentences of a piece as [{ start, end }], trimmed, in order. A line break always ends a sentence.
export function sentences(body) {
  const text = String(body || ''), out = []
  let from = 0
  const push = to => {
    let s = from, e = to
    while (s < e && /\s/.test(text[s])) s++
    while (e > s && /\s/.test(text[e - 1])) e--
    if (e > s) out.push({ start: s, end: e })
  }
  for (const m of text.matchAll(END)) {
    if (m[0] !== '\n' && !endsHere(text, m.index, m[0])) continue
    push(m.index + (m[0] === '\n' ? 0 : m[0].length))
    from = m.index + m[0].length
  }
  push(text.length)
  return out
}

function endsHere(text, at, mark) {
  const next = /^\s*([“"‘'(]*)(\S*)/.exec(text.slice(at + mark.length, at + mark.length + 40))
  const word = next ? next[2].replace(/[^A-Za-z0-9'’-].*$/, '') : ''
  if (mark[0] === '…' || mark.startsWith('...')) return !/^[a-z]/.test(word) // "and then... nothing" runs on
  if (/[”"’')\]]$/.test(mark) && /^[a-z]/.test(word)) return false // "Where are you going?" she asked.
  if (mark[0] !== '.') return true
  // The token before the period: letters and inner dots, like "Dr", "a.m", "U.S", "J".
  const before = /([A-Za-z][A-Za-z.]*)$/.exec(text.slice(Math.max(0, at - 12), at))
  if (!before) return true
  const tok = before[1]
  if (/\.$/.test(tok)) return true // "..." handled above; a stray double period ends it
  if (NEVER.has(tok.toLowerCase())) return false
  if (TITLES.has(tok)) return false
  if (tok === 'No' && /^\d/.test(word)) return false // "No. 4"
  const dotted = tok.includes('.') // a.m, p.m, U.S, Ph.D
  const initial = /^[A-Z]$/.test(tok) // "J. R. Tolkien", "Ellen J. Okafor"
  if (dotted || initial || SOFT.has(tok)) return STARTERS.has(word) || word === ''
  return true
}

// -------------------------------------------------------------- quotations --
// Spans inside double quotation marks, curly or straight. An unclosed quote ends with its paragraph, the way a
// quote that runs on into the next paragraph reopens there. Returns a running count of quoted characters, so any
// span's quoted share is one subtraction.
export function quotedCounts(body) {
  const text = String(body || ''), cum = new Int32Array(text.length + 1)
  let inQuote = false, curly = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    let quoted = inQuote
    if (c === '\n') inQuote = false
    else if (c === '“') { inQuote = true; curly = true; quoted = true }
    else if (c === '”' && inQuote) { inQuote = false; quoted = true }
    else if (c === '"') {
      if (inQuote && !curly) { inQuote = false; quoted = true } else if (!inQuote) { inQuote = true; curly = false; quoted = true }
    }
    cum[i + 1] = cum[i] + (quoted ? 1 : 0)
  }
  return cum
}

// ----------------------------------------------------------------- contrast --
const NEG = /\b(?:is|are|was|were|do|does|did|has|have)(?: not|n['’]t)\b/i
const AFTER_SEP = /[;,—–]\s*(?:but\s+)?(?:(?:it|they|this|that|he|she|we|you)(?:['’](?:s|re)|\s+(?:is|are|was|were))|is|are|was|were|just)\s+(?:(?:a|an|the)\s+)?[^;,—–.!?\n]{0,60}?\b(?:problem|issue|question|story|point|about|matter)\b/iy
const RESTATE = /^(?:it|they|this|that|he|she|we|you)(?:['’](?:s|re)|\s+(?:is|are|was|were))\s+[^.!?\n]{0,60}?\b(?:problem|issue|question|story|point|about|matter)\b/i

// The negation in the first 300 characters of a sentence, then a comma, semicolon or dash within 90 characters
// that turns with "it is", "it's" or "they're" to the real point. Or a negated sentence answered by one that opens "It's ..." or "They're ...".
// Never a sentence that just happens to end on a word like "thing".
function contrastAt(text, s, next) {
  const head = text.slice(s.start, Math.min(s.end, s.start + 320))
  const neg = NEG.exec(head)
  if (!neg || neg.index > 300) return null
  const from = s.start + neg.index + neg[0].length + 1
  const window = text.slice(from, Math.min(s.end, from + 160))
  for (let p = 0; p < Math.min(window.length, 90); p++) {
    if (!/[;,—–]/.test(window[p])) continue
    AFTER_SEP.lastIndex = p
    if (AFTER_SEP.test(window)) return { start: s.start, end: s.end }
  }
  if (next && RESTATE.test(text.slice(next.start, Math.min(next.end, next.start + 160)))) return { start: s.start, end: next.end }
  return null
}

// --------------------------------------------------------------------- read --
export function instantRead(body) {
  if (typeof body !== 'string' || !body.trim()) return { findings: [], quoted: 0 }
  const cum = quotedCounts(body)
  const inQuote = (start, end) => cum[end] - cum[start]
  const marks = []
  let quoted = 0
  const add = mark => {
    if (inQuote(mark.start, mark.end) > 0) { quoted++; return }
    marks.push(mark)
  }
  for (const rule of rules) {
    for (const match of body.matchAll(rule.pattern)) {
      let quote = match[0].replace(/[,\s]+$/, ''), start = match.index
      const lead = quote.length - quote.replace(/^\s+/, '').length
      start += lead; quote = quote.slice(lead)
      if (!quote) continue
      if ((rule.kind === 'filler') && /^(?:kind|sort) of$/i.test(quote) && TYPE_OF.test(body.slice(Math.max(0, start - 16), start))) continue
      add({ start, end: start + quote.length, quote, issue: rule.issue, kind: rule.kind })
    }
  }
  const list = sentences(body)
  for (let i = 0; i < list.length; i++) {
    const hit = contrastAt(body, list[i], list[i + 1])
    if (hit) add({ ...hit, quote: body.slice(hit.start, hit.end), issue: CONTRAST, kind: 'contrast' })
  }
  // Earlier and longer marks win; a phrase inside an already marked span adds nothing.
  marks.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept = []
  for (const mark of marks) if (!kept.length || mark.start >= kept[kept.length - 1].end) kept.push(mark)
  for (const s of list) {
    const text = body.slice(s.start, s.end), n = text.split(/\s+/).length
    if (n <= longSentence) continue
    if (inQuote(s.start, s.end) * 2 > s.end - s.start) { quoted++; continue } // mostly someone else's words
    if (kept.some(mark => mark.start < s.end && mark.end > s.start)) continue
    kept.push({ start: s.start, end: s.end, quote: text, issue: `This sentence runs ${n} words. Where could it breathe?`, kind: 'long' })
  }
  return { findings: kept.sort((a, b) => a.start - b.start), quoted }
}

export function instantFindings(body) {
  return instantRead(body).findings
}

const NAMES = { throat: ['throat-clearing phrase', 'throat-clearing phrases'], 'stock-open': ['stock opening', 'stock openings'], 'stacked-hedge': ['stacked hedge', 'stacked hedges'], filler: ['filler word', 'filler words'], stock: ['stock phrase', 'stock phrases'], pileup: ['word pile', 'word piles'], contrast: ['not-this-but-that setup', 'not-this-but-that setups'], long: ['long sentence', 'long sentences'] }
export const QUESTIONS = 'Each note is a suggestion. Leave any passage that already sounds the way you want.'

// The line that opens a Quick check walk and closes it: what was found, that quotes were left alone, and that
// every note is a question.
export function summarize(found, quoted = 0) {
  const counts = found.reduce((all, mark) => ({ ...all, [mark.kind]: (all[mark.kind] || 0) + 1 }), {})
  const parts = Object.entries(counts).map(([kind, count]) => `${count} ${NAMES[kind][count === 1 ? 0 : 1]}`)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  const left = quoted ? ` Words inside quotation marks are left alone (${quoted} ${quoted === 1 ? 'spot' : 'spots'} here).` : ''
  if (!found.length) return `Nothing obvious to question.${left} The careful read is still yours, or ask the editor for a deeper pass.`
  return `Found ${list}.${left} ${QUESTIONS}`
}

export function instantCheck(body) {
  const { findings: found, quoted } = instantRead(body)
  return { id: crypto.randomUUID(), operation: 'instant', originalBody: body, summary: summarize(found, quoted), findings: found.map(({ start, end, quote, issue }, index) => ({ number: index + 1, start, end, quote, issue })) }
}
