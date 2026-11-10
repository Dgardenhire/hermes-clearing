// One ending per editor pass. The page polls a running pass every second and also hears Hermes's
// pass.ended event, so two answers for the same pass can be in flight at once; a pass the writer
// stopped, or one started on another piece, can also answer late. A pass result is shown only once,
// and only while the margin is still waiting on that very pass. No imports, so node tests load it.

export function createPassGate() {
  const settled = new Set()
  return {
    // True exactly once for a pass whose result the margin is still waiting on.
    claim(card, id) {
      if (!id || settled.has(id)) return false
      if (!card || card.type !== 'working' || !card.pass || card.pass.id !== id) return false
      settled.add(id)
      return true
    },
    // The writer stopped it or left the piece: anything it says later is ignored.
    drop(id) { if (id) settled.add(id) },
  }
}
