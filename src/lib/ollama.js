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
 * Send a message to Ollama with real-time streaming.
 * @param {string} model - The model name
 * @param {string} prompt - The user prompt
 * @param {(chunk: string) => void} onChunk - Called with each token as it arrives
 * @returns {Promise<string>} - The complete response text
 */
export async function sendMessage(model, prompt, onChunk = null) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      prompt: prompt,
      stream: !!onChunk  // Stream only if callback provided
    })
  });

  if (!response.ok) throw new Error('Generation failed.');

  // Non-streaming fallback (if no callback)
  if (!onChunk) {
    const data = await response.json();
    return data.response;
  }

  // Streaming: read newline-delimited JSON chunks
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.response) {
          fullText += chunk.response;
          onChunk(fullText);
        }
      } catch (e) {
        // Skip malformed JSON lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const chunk = JSON.parse(buffer);
      if (chunk.response) {
        fullText += chunk.response;
        onChunk(fullText);
      }
    } catch (e) {
      // Skip
    }
  }

  return fullText;
}
