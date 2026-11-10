// The Clearing, desktop half. SOURCE: desktop/plugin.js is built from this folder and the shared
// hermes-ui-kit by `node <hermes-ui-kit>/scripts/build.mjs .` (esbuild), run from the plugin folder.
// The built file is one ES module that imports only '@hermes/plugin-sdk', 'react' and 'react/jsx-runtime'.
//
// One page, the room (room.jsx). The backend (dashboard/plugin_api.py, reached through ctx.rest) keeps the
// pieces and versions and runs the editor passes on the writer's own Hermes model. The page keeps only a
// buffer of unsaved words and the writer's scene choice in ctx.storage.
//
// Hermes owns mod+K and mod+P. The room's Ask line is mod+E, handled inside the page. Three commands go
// into Hermes's own palette, and one rebindable keybind ("Ask the editor") ships unbound.
import { jsx } from 'react/jsx-runtime'
import { host } from '@hermes/plugin-sdk'
import { installStyles, registerPage } from 'hermes-ui-kit'
import { $command, Room, bindContext } from './room.jsx'
import { CSS as ROOM_CSS } from './styles.js'
import { CSS as DESK_CSS } from './desk.jsx'
import { CSS as WELCOME_CSS } from './welcome.jsx'
import { CSS as READ_CSS } from './read.jsx'
import { CSS as SPOTS_CSS } from './spots.jsx'

const CSS = ROOM_CSS + DESK_CSS + WELCOME_CSS + READ_CSS + SPOTS_CSS

const PLUGIN_ID = 'clearing'
const ROUTE = '/clearing'

export default {
  id: PLUGIN_ID,
  name: 'The Clearing',
  register(ctx) {
    bindContext(ctx)
    installStyles(ctx, PLUGIN_ID, CSS)
    // Hermes's palette calls each entry's detail() every time it opens (apps/desktop command-palette:
    // `detail: item.detail?.()`), so the details are functions; a string there throws when the palette opens.
    const go = command => () => { host.navigate(ROUTE); if (command) setTimeout(() => $command.set(command), 60) }
    registerPage(ctx, {
      id: PLUGIN_ID, route: ROUTE, label: 'The Clearing', codicon: 'edit',
      render: () => jsx(Room, {}),
      palette: [
        { id: 'clearing.open', label: 'Open The Clearing', detail: () => 'Your writing room', keywords: ['write', 'writing', 'draft', 'essay', 'editor'], run: go(null) },
        { id: 'clearing.quick', contributionId: 'quick', label: 'Quick check this piece', detail: () => 'The Clearing, built in, no AI needed', keywords: ['clearing', 'hedges', 'filler', 'check'], run: go('quick') },
        { id: 'clearing.ask', contributionId: 'ask', label: 'Ask the editor', detail: () => 'The Clearing', keywords: ['clearing', 'editor', 'notes', 'method'], run: go('ask') },
      ],
      keybinds: [{ id: 'clearing.ask', label: 'The Clearing: ask the editor', category: 'The Clearing', defaults: [], run: go('ask') }],
    })
    ctx.onDispose(() => bindContext(null))
  },
}

// For the harness only.
export { $command }
