import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

function getBaseUrl() {
    if (typeof localStorage !== 'undefined') {
        const v = (localStorage.getItem('lume_ollama_url') || '').trim();
        if (v) return v;
        const fallback = 'http://localhost:11434';
        return fallback;
    }
    return 'http://localhost:11434';
}

export async function fetchModels() {
    try {
        const base = getBaseUrl();
        const response = await invoke('proxy_ollama', {
            baseUrl: base,
            endpoint: '/api/tags',
            method: 'GET',
            body: ''
        });
        const data = JSON.parse(response);
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
 * @returns {Promise<{text: string, evalCount: number}>} - Complete text and token count
 */
export async function sendMessage(model, prompt, onChunk = null, signal = null) {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        throw new Error('base_url is required');
    }

    let fullText = '';
    /** @type {(value?: unknown) => void} */
    let resolveStreamDone = () => {};
    const streamDone = new Promise((resolve) => {
        resolveStreamDone = resolve;
    });

    const unlistenResponse = await listen('ollama_response', (event) => {
        const token = typeof event.payload === 'string' ? event.payload : '';
        fullText += token;
        if (onChunk) {
            onChunk(fullText);
        }
    });

    const unlistenDone = await listen('ollama_done', () => {
        resolveStreamDone();
    });

    const streamId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let abortHandler = null;
    let abortPromise = null;
    if (signal) {
        if (signal.aborted) {
            await invoke('cancel_ollama_stream', { streamId }).catch(() => {});
            unlistenResponse();
            unlistenDone();
            throw new DOMException('Aborted', 'AbortError');
        }
        abortPromise = new Promise((_, reject) => {
            abortHandler = async () => {
                await invoke('cancel_ollama_stream', { streamId }).catch(() => {});
                reject(new DOMException('Aborted', 'AbortError'));
            };
            signal.addEventListener('abort', abortHandler, { once: true });
        });
    }

    try {
        const invokePromise = invoke('ollama_stream', {
            streamId,
            baseUrl,
            model,
            prompt
        });

        const invocation = abortPromise ? Promise.race([invokePromise, abortPromise]) : invokePromise;
        await invocation;

        const completion = abortPromise ? Promise.race([streamDone, abortPromise]) : streamDone;
        await completion;
    } finally {
        unlistenResponse();
        unlistenDone();
        if (signal && abortHandler) {
            signal.removeEventListener('abort', abortHandler);
        }
    }

    return { text: fullText, evalCount: 0 };
}