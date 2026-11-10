#!/usr/bin/env node
// Port The Clearing's own method library from the web app into library/*.json.
//
//   node scripts/port_library.mjs [<writing-bench folder>]
//
// The web app (branch clearing-tester-1) is read, never written. Everything copied here is
// Clearing-authored text: the 33-method catalog and its rules, the method-discovery words, the
// five craft paths (49 techniques) and the editor-pass definitions. No upstream Compound Writing
// file is read or bundled (docs/RELEASE-RIGHTS.md in the web app sets that boundary).
// Run scripts/overlap_check.py afterwards.

import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'

const SOURCE = resolve(process.argv[2] || join(homedir(), 'Documents/Codex/2026-09-06/https-every-to-guides-compound-writing/outputs/writing-bench'))
const OUT = resolve(new URL('..', import.meta.url).pathname, 'library')
const load = rel => import(pathToFileURL(join(SOURCE, rel)).href)

const { writingCatalog } = await load('shared/writing-catalog.js')
const { writingMethodInstructions, writingContextContract, writingMethodVersion } = await load('shared/writing-methods.js')
const { methodHelp } = await load('shared/method-discovery.js')
const { craftPaths } = await load('shared/craft-paths.js')
const { labPasses, labDiagnosisFormat } = await load('src/writing-lab.js')

// How each method runs in the room: 'note' returns the editor's read plus notes pinned to exact words; the
// rest have their own surface (library.py ROOM_KINDS): proposed drafts, the voice check against the writer's
// samples, the panel and the debate in separate calls, lessons and guidance the writer keeps, the writing
// home (no model) and reading several pieces at once. Their prompts are in library/additions.json (rooms).
const ROOMS = {
  'cw-draft': 'draft', 'cw-voice-check': 'voice', 'cw-panel': 'panel', 'cw-debate': 'debate',
  'cw-save': 'lessons', 'cw-onboarding': 'guidance', 'cw-setup-project': 'home', 'cw-emergent': 'across',
}

// The figure palettes name each figure's own effect, so zeugma and syllepsis, and merism and synecdoche,
// never share a description.
const FIGURE_WORDS = [
  ['one governing word across clauses', 'one word serving a whole list of clauses, one word read two ways at once'],
  ['parts standing for a whole, an extended catalog', 'a few parts or two opposite ends naming a whole range, a single part standing in for the thing it belongs to, an extended catalog'],
]

const methods = writingCatalog.map(m => {
  const [label, help, aliases] = methodHelp[m.id] || [m.title, m.description, '']
  return {
    id: m.id.replace(/^cw-/, ''),
    title: m.title,
    description: m.description,
    help,
    aliases,
    instructions: writingMethodInstructions(m.id),
    room: ROOMS[m.id] || 'note',
    ...(label !== m.title ? { label } : {}),
  }
})

// Aliases live inside craft-paths.js as a private map; read them through findCraftFocuses' source.
const craftSource = (await import('node:fs')).readFileSync(join(SOURCE, 'shared/craft-paths.js'), 'utf8')
const aliasMap = new Map([...craftSource.matchAll(/\['([^']+)','([^']+)'\]/g)].map(m => [m[1], m[2]]))
let n = 0
const paths = craftPaths.map(p => ({
  id: p.id,
  title: p.title,
  detail: p.detail,
  influences: p.influences,
  focuses: p.focuses.map(f => ({
    id: `${p.id}:${++n}`,
    group: f.group || '',
    title: f.title,
    detail: f.detail,
    prompt: FIGURE_WORDS.reduce((text, [from, to]) => text.replaceAll(from, to),
      f.prompt.replaceAll('Apply the available editorial methods', 'Use the editorial judgment this room allows')),
    aliases: aliasMap.get(f.title) || '',
  })),
}))

const passes = labPasses.filter(p => p.operation !== 'trim').map(p => ({
  id: p.operation, title: p.label, detail: p.detail, kind: p.operation === 'typos' ? 'changes' : 'findings',
}))
const protection = labDiagnosisFormat.slice(labDiagnosisFormat.indexOf('Preserve facts'))

const meta = { ported_from: 'The Clearing web app, branch clearing-tester-1', method_version: writingMethodVersion }
const write = (name, data) => {
  writeFileSync(join(OUT, name), JSON.stringify({ ...meta, ...data }, null, 1) + '\n')
  console.log(`library/${name}`)
}
write('methods.json', { contract: writingContextContract, methods })
write('craft-paths.json', { paths })
write('passes.json', { protection, passes })
console.log(`${methods.length} methods (${methods.filter(m => m.room === 'note').length} notes, ${methods.filter(m => m.room !== 'note').length} with their own surface), ${n} craft techniques, ${passes.length} editor passes`)
