// Idle-cap active-time windowing, shared by the Claude session parser and the
// chat-export parser. Given event timestamps (ms epoch), sum the gaps between
// consecutive events, but any gap longer than `idleCap` seconds counts as zero
// so an idle-open session/chat doesn't inflate hours. Returns whole seconds.
export function activeSeconds(timestampsMs: number[], idleCap: number): number {
  if (timestampsMs.length < 2) return 0
  const ts = [...timestampsMs].sort((a, b) => a - b)
  let total = 0
  for (let i = 1; i < ts.length; i++) {
    const gap = (ts[i] - ts[i - 1]) / 1000
    if (gap > 0 && gap <= idleCap) total += gap
  }
  return Math.round(total)
}
