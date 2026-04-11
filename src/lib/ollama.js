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

export async function sendMessage(model, prompt) {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false
      })
    });
    
    if (!response.ok) throw new Error('Generation failed.');
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("Send message error:", error);
    throw error;
  }
}
