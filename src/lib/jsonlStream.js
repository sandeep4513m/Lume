/**
 * Minimal newline-delimited JSON (JSONL) streaming parser.
 * Buffers partial lines across chunks so progress events aren't dropped.
 */
export function createJsonlStreamParser() {
  /** @type {string} */
  let buffer = '';

  /**
   * Push new text and return parsed JSON objects.
   * Incomplete trailing line is retained in the internal buffer.
   * @param {string} text
   * @returns {any[]}
   */
  function push(text) {
    if (!text) return [];
    buffer += text;

    /** @type {any[]} */
    const out = [];

    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // Not valid JSON. Ignore this line and continue.
      }
    }
    return out;
  }

  /**
   * Attempt to parse any remaining buffered line.
   * @returns {any[]}
   */
  function flush() {
    const tail = buffer.trim();
    buffer = '';
    if (!tail) return [];
    try {
      return [JSON.parse(tail)];
    } catch {
      return [];
    }
  }

  return { push, flush };
}

