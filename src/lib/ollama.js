export async function fetchModels() {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) throw new Error('Ollama is not responding. Is it running?');
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error("Fetch models error:", error);
    return [];
  }
}

/**
 * Send a message to Ollama with real-time streaming and abort support.
 * @param {string} model - The model name
 * @param {string} prompt - The user prompt
 * @param {((chunk: string) => void) | null} onChunk - Called with each token as it arrives
 * @param {AbortSignal | null} signal - Signal to abort the request
 * @param {string} [system] - Optional system prompt override
 * @returns {Promise<{text: string, evalCount: number}>} - Complete text and token count
 */
export async function sendMessage(model, prompt, onChunk = null, signal = null, system = '') {
  /** @type {Record<string, any>} */
  const body = {
    model: model,
    prompt: prompt,
    stream: !!onChunk
  };
  if (system) body.system = system;

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: signal || undefined,
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error('Generation failed.');

  // Non-streaming fallback
  if (!onChunk) {
    const data = await response.json();
    return { text: data.response, evalCount: data.eval_count || 0 };
  }

  // Streaming
  if (!response.body) throw new Error('Response body is null');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let evalCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; 

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.response !== undefined) {
            fullText += chunk.response;
            onChunk(fullText);
          }
          if (chunk.done && chunk.eval_count) {
            evalCount = chunk.eval_count;
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }

    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.response !== undefined) {
          fullText += chunk.response;
          onChunk(fullText);
        }
        if (chunk.done && chunk.eval_count) {
          evalCount = chunk.eval_count;
        }
      } catch (e) {}
    }
  } finally {
    reader.releaseLock();
  }

  return { text: fullText, evalCount };
}

