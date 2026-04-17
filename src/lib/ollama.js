// ──────────────────────────────────────────────────────────────
// Lume — Ollama API Integration Layer
// Native streaming parser using Ollama's dedicated `thinking` field
// ──────────────────────────────────────────────────────────────

function getBaseUrl() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';
  }
  return 'http://localhost:11434';
}

export async function fetchModels() {
  try {
    const response = await fetch(`${getBaseUrl()}/api/tags`);
    if (!response.ok) throw new Error('Ollama is not responding. Is it running?');
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error("Fetch models error:", error);
    return [];
  }
}

/**
 * Helper to strip and isolate reasoning blocks from completed text.
 * Used for loading saved messages from DB (non-streaming) where
 * the text may still contain legacy <think> tags.
 * @param {string} text
 * @returns {{ content: string, think_content: string, isThinkingFinished: boolean }}
 */
export function extractThink(text) {
  let content = '';
  let think_content = '';
  let currentStr = text;
  let isThinkingFinished = false;

  while (true) {
    const startIdx = currentStr.indexOf('<think>');
    if (startIdx === -1) {
      content += currentStr;
      break;
    }
    content += currentStr.substring(0, startIdx);
    currentStr = currentStr.substring(startIdx + 7);

    const endIdx = currentStr.indexOf('</think>');
    if (endIdx === -1) {
      think_content += currentStr;
      break;
    } else {
      think_content += currentStr.substring(0, endIdx);
      currentStr = currentStr.substring(endIdx + 8);
      isThinkingFinished = true;
    }
  }
  return {
    content: content.trim(),
    think_content: think_content.trim(),
    isThinkingFinished
  };
}

/**
 * Send a message to Ollama with real-time streaming and abort support.
 *
 * Ollama natively intercepts <think> tags for reasoning models and streams
 * them in a dedicated `thinking` field (for /api/generate) or `message.thinking`
 * (for /api/chat). The `content` / `response` field contains only the final
 * answer text. No manual tag parsing is required.
 *
 * @param {string} model - The model name
 * @param {string} prompt - The user prompt
 * @param {((chunk: {content: string, think_content: string, isThinkingFinished: boolean}) => void) | null} onChunk - Called with parsed objects
 * @param {AbortSignal | null} signal - Signal to abort the request
 * @param {string} [system] - Optional system prompt override
 * @returns {Promise<{text: string, thinkText: string, evalCount: number}>} - Complete text and token count
 */
export async function sendMessage(model, prompt, onChunk = null, signal = null, system = '') {
  /** @type {Record<string, any>} */
  const body = {
    model: model,
    prompt: prompt,
    stream: !!onChunk
  };
  if (system) body.system = system;

  console.log('[ollama] Sending request:', { model, stream: body.stream, promptLength: prompt.length });

  const response = await fetch(`${getBaseUrl()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: signal || undefined,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Generation failed (${response.status}): ${errText}`);
  }

  // ── Non-streaming fallback ──
  if (!onChunk) {
    const data = await response.json();
    // Ollama provides `thinking` natively; fall back to legacy tag parsing for older responses
    const nativeThink = data.thinking || '';
    const contentText = data.response || '';
    if (nativeThink) {
      return { text: contentText.trim(), thinkText: nativeThink.trim(), evalCount: data.eval_count || 0 };
    }
    // Legacy fallback: parse <think> tags from response text (older Ollama versions / saved messages)
    const parsed = extractThink(contentText);
    return { text: parsed.content, thinkText: parsed.think_content, evalCount: data.eval_count || 0 };
  }

  // ── Streaming with native field extraction ──
  if (!response.body) throw new Error('Response body is null');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let jsonBuffer = '';      // Buffer for incomplete JSON lines from the stream
  let finalContent = '';    // Accumulated answer content
  let finalThink = '';      // Accumulated reasoning content
  let isThinkingFinished = false;
  let evalCount = 0;
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      jsonBuffer += decoder.decode(value, { stream: true });

      // Ollama streams one JSON object per line
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';  // Keep the last incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          chunkCount++;

          // ── Extract tokens from Ollama's native fields ──
          // /api/generate uses: `response` for content, `thinking` for reasoning
          // /api/chat uses:     `message.content` for content, `message.thinking` for reasoning
          const contentToken = chunk.message?.content || chunk.response || '';
          const thinkToken   = chunk.message?.thinking || chunk.thinking || '';

          if (thinkToken) {
            finalThink += thinkToken;
          }

          if (contentToken) {
            // Once we receive content tokens, reasoning is finished
            if (finalThink && !isThinkingFinished) {
              isThinkingFinished = true;
            }
            finalContent += contentToken;
          }

          // Emit current accumulated state to the UI on every chunk
          onChunk({
            content: finalContent,
            think_content: finalThink,
            isThinkingFinished
          });

          if (chunk.done && chunk.eval_count) {
            evalCount = chunk.eval_count;
          }
        } catch {
          // Skip malformed JSON lines
          console.warn('[ollama] Skipped malformed JSON line:', line.substring(0, 80));
        }
      }
    }

    // Process any remaining data in the JSON buffer
    if (jsonBuffer.trim()) {
      try {
        const chunk = JSON.parse(jsonBuffer);
        const contentToken = chunk.message?.content || chunk.response || '';
        const thinkToken   = chunk.message?.thinking || chunk.thinking || '';

        if (thinkToken) finalThink += thinkToken;
        if (contentToken) {
          if (finalThink && !isThinkingFinished) isThinkingFinished = true;
          finalContent += contentToken;
        }

        onChunk({
          content: finalContent,
          think_content: finalThink,
          isThinkingFinished
        });

        if (chunk.done && chunk.eval_count) {
          evalCount = chunk.eval_count;
        }
      } catch {
        // Ignore
      }
    }
  } finally {
    reader.releaseLock();
  }

  // If we accumulated thinking but never got content, mark thinking as finished
  if (finalThink && !isThinkingFinished) {
    isThinkingFinished = true;
  }

  console.log('[ollama] Stream complete:', {
    chunkCount,
    evalCount,
    thinkLength: finalThink.length,
    contentLength: finalContent.length
  });

  return { text: finalContent.trim(), thinkText: finalThink.trim(), evalCount };
}
