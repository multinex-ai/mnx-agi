/** Rough budget: one token is about four characters. Good enough to stay under a limit, not to bill by. */
export const CHARS_PER_TOKEN = 4;
/** A cut-off block is only worth keeping if at least this many tokens of room remain. */
export const MIN_PARTIAL_TOKENS = 50;
export const TRUNCATION_MARKER = "\n... [Context Sliced due to token budget]";

export interface SliceOptions {
  maxTokens: number;
  blocks: readonly string[];
}

/**
 * Fit context blocks to a token budget, in order. Whole blocks are kept while they fit;
 * the first block that does not fit is cut to the remaining room (if enough remains)
 * and marked, and everything after it is dropped.
 */
export function sliceContext(options: SliceOptions): string[] {
  const kept: string[] = [];
  let used = 0;
  if (!(options.maxTokens > 0)) return kept;
  for (const block of options.blocks) {
    const cost = Math.ceil(block.length / CHARS_PER_TOKEN);
    if (used + cost <= options.maxTokens) {
      kept.push(block);
      used += cost;
      continue;
    }
    const remaining = options.maxTokens - used;
    if (remaining > MIN_PARTIAL_TOKENS) kept.push(block.slice(0, remaining * CHARS_PER_TOKEN) + TRUNCATION_MARKER);
    break;
  }
  return kept;
}
