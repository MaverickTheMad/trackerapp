// Per-model Claude pricing, USD per 1 million tokens.
//
// ⚠️ These rates change. Refresh from current Claude pricing when they drift.
// Used only to ESTIMATE local Claude Code cost from log token counts — no
// Anthropic API is called (subscription, not Console billing). Keys are matched
// against the `model` string in the logs by longest-prefix (see rateFor).
//
// Last reviewed: 2026-07 (placeholder rates — verify before trusting the numbers).
export interface ModelRate {
  input: number // per 1M input tokens
  output: number // per 1M output tokens
  cacheRead: number // per 1M cache-read input tokens
  cacheWrite: number // per 1M cache-creation input tokens
}

export const PRICING: Record<string, ModelRate> = {
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-3-5-haiku': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 }
}

// Fallback when a model string matches nothing above (keeps cost > 0, flags drift).
const FALLBACK: ModelRate = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }

export function rateFor(model: string | null | undefined): ModelRate {
  if (!model) return FALLBACK
  let best: ModelRate | null = null
  let bestLen = -1
  for (const [prefix, rate] of Object.entries(PRICING)) {
    if (model.startsWith(prefix) && prefix.length > bestLen) {
      best = rate
      bestLen = prefix.length
    }
  }
  return best ?? FALLBACK
}

export function estimateCostUsd(
  model: string | null | undefined,
  tokens: {
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_creation_tokens: number
  }
): number {
  const r = rateFor(model)
  const M = 1_000_000
  return (
    (tokens.input_tokens * r.input +
      tokens.output_tokens * r.output +
      tokens.cache_read_tokens * r.cacheRead +
      tokens.cache_creation_tokens * r.cacheWrite) /
    M
  )
}
