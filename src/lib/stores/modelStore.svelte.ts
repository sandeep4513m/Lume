// ── modelStore.svelte.ts — Ollama model & UI state ───────────────────────────

/** @type {any[]} */
let models = $state<any[]>([]);
let selectedModel = $state('');
let ollamaStatus = $state(true);

/** @type {any} */
let modelInfo = $state<any>(null);
let modelInfoLoading = $state(false);
let hoveredModel = $state('');
let isModelMenuOpen = $state(false);

export const modelStore = {
  get models() { return models; },
  setModels(val: any[]) { models = val; },

  get selectedModel() { return selectedModel; },
  setSelectedModel(val: string) { selectedModel = val; },

  get ollamaStatus() { return ollamaStatus; },
  setOllamaStatus(val: boolean) { ollamaStatus = val; },

  get modelInfo() { return modelInfo; },
  setModelInfo(val: any) { modelInfo = val; },

  get modelInfoLoading() { return modelInfoLoading; },
  setModelInfoLoading(val: boolean) { modelInfoLoading = val; },

  get hoveredModel() { return hoveredModel; },
  setHoveredModel(val: string) { hoveredModel = val; },

  get isModelMenuOpen() { return isModelMenuOpen; },
  setIsModelMenuOpen(val: boolean) { isModelMenuOpen = val; },
};
