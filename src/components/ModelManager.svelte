<script>
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { createJsonlStreamParser } from '$lib/jsonlStream.js';

  /** @type {{ isOpen?: boolean, onClose?: () => void, onModelSelect?: (model: string) => void }} */
  let { isOpen = false, onClose = () => {}, onModelSelect = (_model) => {} } = $props();

  /** @type {any[]} */
  let models = $state([]);
  let isLoading = $state(true);
  let error = $state('');
  let deletingModel = $state('');

  /** @type {{ total_ram_mb: number, free_ram_mb: number, gpu_name: string, vram_mb: number } | null} */
  let hardware = $state(null);

  /** @type {'installed' | 'discover'} */
  let activeTab = $state('installed');

  onMount(() => {
    if (isOpen) init();
  });

  $effect(() => {
    if (isOpen) init();
  });

  async function init() {
    await Promise.all([fetchModels(), fetchHardware(), loadLastUsedModel()]);
  }

  async function fetchModels() {
    isLoading = true;
    error = '';
    try {
      const url = localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      models = data.models || [];
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof TypeError && e.message.includes('fetch')) {
        error = 'Ollama is not running. Start it with: ollama serve';
      } else {
        error = `Cannot reach Ollama (${message}). Make sure it is running.`;
      }
    } finally {
      isLoading = false;
    }
  }

  async function fetchHardware() {
    try {
      hardware = await invoke('get_hardware_info');
    } catch {
      hardware = null;
    }
  }

  /** @param {string} name */
  async function deleteModel(name) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    deletingModel = name;
    try {
      const url = localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';
      const res = await fetch(`${url}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error('Delete failed');
      models = models.filter(m => m.name !== name);
    } catch {
      error = `Failed to delete ${name}.`;
      setTimeout(() => error = '', 3000);
    } finally {
      deletingModel = '';
    }
  }

  /** @param {number} bytes */
  function formatSize(bytes) {
    const gb = bytes / 1073741824;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1048576).toFixed(0)} MB`;
  }

  /** @param {string} paramStr */
  function paramBadgeColor(paramStr) {
    const match = paramStr?.match(/([\d.]+)\s*([BbMm])/);
    if (!match) return 'bg-[var(--bg-muted)] text-[var(--text-secondary)]';
    let b = parseFloat(match[1]);
    if (match[2].toLowerCase() === 'm') b /= 1000;
    if (b <= 3) return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    if (b <= 9) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
    return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
  }

  /** Returns tier label based on RAM + VRAM */
  function hardwareTier() {
    if (!hardware) return null;
    const vram = hardware.vram_mb;
    const ram = hardware.total_ram_mb;
    if (vram >= 8000 || ram >= 16000) return 'high';
    if (vram >= 4000 || ram >= 8000) return 'mid';
    return 'low';
  }

  // Download state
  let downloadingModel = $state('');
  let downloadProgress = $state(0);
  let downloadStatus = $state('');
  /** @type {AbortController | null} */
  let downloadAbortController = $state(null);

  // Derived: set of installed model names for quick lookup
  let installedNames = $derived(new Set(models.map(m => m.name)));

  /** @param {string} modelName */
  async function startDownload(modelName) {
    downloadingModel = modelName;
    downloadProgress = 0;
    downloadStatus = 'Connecting...';
    downloadAbortController = new AbortController();
    error = '';

    try {
      const url = localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';

      let res;
      try {
        res = await fetch(`${url}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: modelName, stream: true }),
          signal: downloadAbortController.signal
        });
      } catch (fetchErr) {
        if (downloadAbortController?.signal.aborted) return;
        throw new Error('OFFLINE');
      }

      if (!res.ok) throw new Error(`SERVER_ERROR:${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('NO_STREAM');
      const decoder = new TextDecoder();
      const jsonl = createJsonlStreamParser();

      while (true) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (readErr) {
          if (downloadAbortController?.signal.aborted) break;
          throw new Error('STREAM_INTERRUPTED');
        }

        if (chunk.done) break;

        const text = decoder.decode(chunk.value, { stream: true });
        const events = jsonl.push(text);
        for (const json of events) {
          // Ollama sends error field on disk full or bad model name
          if (json?.error) throw new Error(`OLLAMA_ERROR:${json.error}`);

          if (json?.status) downloadStatus = json.status;
          if (json?.total && json?.completed) {
            downloadProgress = Math.round((json.completed / json.total) * 100);
          }
        }
      }

      // Drain any remaining buffered JSONL line (best-effort)
      for (const json of jsonl.flush()) {
        if (json?.error) throw new Error(`OLLAMA_ERROR:${json.error}`);
        if (json?.status) downloadStatus = json.status;
        if (json?.total && json?.completed) {
          downloadProgress = Math.round((json.completed / json.total) * 100);
        }
      }

      // Download complete
      await fetchModels();
      onModelSelect(modelName);
      activeTab = 'installed';
      await persistLastUsedModel(modelName);

    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (downloadAbortController?.signal.aborted) {
        // User cancelled — silent
      } else if (message === 'OFFLINE') {
        error = 'Cannot reach Ollama. Check that it is running and try again.';
      } else if (message === 'STREAM_INTERRUPTED') {
        error = 'Download interrupted. Your network may have dropped. Try again.';
      } else if (message.startsWith('OLLAMA_ERROR:')) {
        const detail = message.replace('OLLAMA_ERROR:', '');
        if (detail.toLowerCase().includes('disk') || detail.toLowerCase().includes('space') || detail.toLowerCase().includes('storage')) {
          error = 'Download failed: Not enough disk space. Free up space and try again.';
        } else if (detail.toLowerCase().includes('not found') || detail.toLowerCase().includes('unknown')) {
          error = `Model "${modelName}" not found in Ollama registry. Check the model name.`;
        } else {
          error = `Ollama error: ${detail}`;
        }
      } else if (message.startsWith('SERVER_ERROR:')) {
        error = 'Ollama returned an unexpected error. Try restarting Ollama.';
      } else {
        error = `Download failed: ${message}`;
      }
      setTimeout(() => error = '', 6000);
    } finally {
      downloadingModel = '';
      downloadProgress = 0;
      downloadStatus = '';
      downloadAbortController = null;
    }
  }

  function cancelDownload() {
    downloadAbortController?.abort();
  }

  /** @param {string} modelName */
  async function persistLastUsedModel(modelName) {
    try {
      await invoke('save_preference', { key: 'last_used_model', value: modelName });
    } catch {
      // non-critical — silently ignore
    }
  }

  async function loadLastUsedModel() {
    try {
      const val = await invoke('load_preference', { key: 'last_used_model' });
      if (val) onModelSelect(val);
    } catch {
      // non-critical
    }
  }

  // Model catalog with tier tags
  // tiers: 'low' = <8GB RAM, 'mid' = 8-16GB, 'high' = 16GB+ or 6GB+ VRAM
  const CATALOG = [
    { name: 'qwen2.5:0.5b',        params: '0.5B', size: '0.4 GB', desc: 'Fastest model. Great for quick tasks.',           tags: ['General', 'Fast'],          tiers: ['low', 'mid', 'high'] },
    { name: 'qwen2.5:1.5b',        params: '1.5B', size: '1.0 GB', desc: 'Good balance of speed and quality.',              tags: ['General', 'Fast'],          tiers: ['low', 'mid', 'high'] },
    { name: 'qwen2.5:3b',          params: '3B',   size: '2.0 GB', desc: 'Smart and still fast on most hardware.',          tags: ['General', 'Coding'],        tiers: ['low', 'mid', 'high'] },
    { name: 'qwen2.5-coder:1.5b',  params: '1.5B', size: '1.0 GB', desc: 'Optimised for code. Runs on anything.',          tags: ['Coding', 'Fast'],           tiers: ['low', 'mid', 'high'] },
    { name: 'qwen2.5-coder:7b',    params: '7B',   size: '4.7 GB', desc: 'Best coding model for mid-range hardware.',      tags: ['Coding'],                   tiers: ['mid', 'high'] },
    { name: 'llama3.2:3b',         params: '3B',   size: '2.0 GB', desc: "Meta's compact model. Well-rounded.",            tags: ['General', 'Writing'],       tiers: ['low', 'mid', 'high'] },
    { name: 'llama3.1:8b',         params: '8B',   size: '4.9 GB', desc: 'Strong general model. Needs 8GB+ RAM.',          tags: ['General', 'Writing'],       tiers: ['mid', 'high'] },
    { name: 'mistral:7b',          params: '7B',   size: '4.1 GB', desc: 'Fast and capable. Great for writing.',           tags: ['Writing', 'General'],       tiers: ['mid', 'high'] },
    { name: 'gemma2:2b',           params: '2B',   size: '1.6 GB', desc: "Google's efficient small model.",                tags: ['General', 'Fast'],          tiers: ['low', 'mid', 'high'] },
    { name: 'gemma2:9b',           params: '9B',   size: '5.5 GB', desc: 'High quality. Needs mid-range hardware.',        tags: ['General', 'Writing'],       tiers: ['mid', 'high'] },
    { name: 'phi3.5:3.8b',         params: '3.8B', size: '2.2 GB', desc: "Microsoft's efficient reasoning model.",         tags: ['Reasoning', 'General'],     tiers: ['low', 'mid', 'high'] },
    { name: 'deepseek-r1:7b',      params: '7B',   size: '4.7 GB', desc: 'Strong reasoning and math. Mid+ hardware.',      tags: ['Reasoning', 'Math'],        tiers: ['mid', 'high'] },
    { name: 'deepseek-r1:14b',     params: '14B',  size: '9.0 GB', desc: 'Best reasoning model. High-end only.',           tags: ['Reasoning', 'Math'],        tiers: ['high'] },
    { name: 'llama3.3:70b',        params: '70B',  size: '43 GB',  desc: 'Flagship quality. Needs 48GB+ RAM.',             tags: ['General', 'Writing'],       tiers: ['high'] },
  ];

  /** @type {{ id: 'installed' | 'discover', label: string }[]} */
  const TABS = [{ id: 'installed', label: 'Installed' }, { id: 'discover', label: 'Discover' }];
</script>

{#if isOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" role="presentation" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[var(--bg-surface)] rounded-2xl shadow-2xl border border-[var(--border-color)] overflow-hidden"
    role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>

    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] shrink-0">
      <div>
        <h2 class="text-[16px] font-bold text-[var(--text-primary)]">Model Manager</h2>
        <p class="text-[12px] text-[var(--text-secondary)] mt-0.5">
          {#if hardware}
            {Math.round(hardware.total_ram_mb / 1024)}GB RAM
            {#if hardware.vram_mb > 0}· {Math.round(hardware.vram_mb / 1024)}GB VRAM{/if}
            · {hardware.gpu_name}
          {:else}
            Detecting hardware...
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick={fetchModels} title="Refresh"
          class="p-2 rounded-lg text-[var(--text-secondary)] hover:text-emerald-500 hover:bg-[var(--hover-color)] transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 {isLoading ? 'animate-spin' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
        </button>
        <button onclick={onClose} title="Close"
          class="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-color)] transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex px-6 pt-3 gap-1 border-b border-[var(--border-color)] shrink-0">
      {#each TABS as tab}
        <button onclick={() => activeTab = tab.id}
          class="px-4 py-2 text-[13px] font-medium rounded-t-lg transition-colors border-b-2 -mb-px
            {activeTab === tab.id
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}">
          {tab.label}
          {#if tab.id === 'installed' && models.length > 0}
            <span class="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">{models.length}</span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Error banner -->
    {#if error}
      <div class="mx-4 mt-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl shrink-0 flex items-start gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div class="flex-1">
          <p class="text-[13px] text-red-600 dark:text-red-400">{error}</p>
        </div>
        <button onclick={() => error = ''} title="Dismiss error" class="text-red-400 hover:text-red-600 transition-colors shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    {/if}

    <!-- Body -->
    <div class="flex-1 overflow-y-auto px-4 py-3 bg-[var(--bg-surface)]">

      <!-- ── INSTALLED TAB ── -->
      {#if activeTab === 'installed'}
        {#if isLoading}
          <div class="space-y-2">
            {#each [1,2,3] as _}
              <div class="h-[72px] rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"></div>
            {/each}
          </div>
        {:else if models.length === 0 && !error}
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            </div>
            <p class="text-[14px] font-semibold text-gray-700 dark:text-gray-300">No models installed</p>
            <p class="text-[12px] text-gray-400 mt-1">Go to Discover tab to download one</p>
            <button onclick={() => activeTab = 'discover'}
              class="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-medium rounded-xl transition-colors">
              Browse Models
            </button>
          </div>
        {:else}
          <div class="space-y-2">
            {#each models as model}
              {@const params = model.details?.parameter_size || ''}
              {@const family = model.details?.family || ''}
              <div class="group flex items-center gap-4 px-4 py-3 bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl hover:border-emerald-400/50 transition-all">
                <div class="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">{model.name}</p>
                  <div class="flex items-center gap-2 mt-1 flex-wrap">
                    <span class="text-[11px] text-gray-400">{formatSize(model.size)}</span>
                    {#if params}
                      <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full {paramBadgeColor(params)}">{params}</span>
                    {/if}
                    {#if family}
                      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">{family}</span>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button onclick={() => { onModelSelect(model.name); onClose(); }}
                    class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-medium rounded-lg transition-colors active:scale-95">
                    Use
                  </button>
                  <button onclick={() => deleteModel(model.name)} disabled={deletingModel === model.name}
                    class="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-50"
                    title="Delete model">
                    {#if deletingModel === model.name}
                      <svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    {/if}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

      <!-- ── DISCOVER TAB ── -->
      {:else if activeTab === 'discover'}
        {@const tier = hardwareTier()}
        {@const recommended = CATALOG.filter(m => m.tiers.includes(tier ?? 'low'))}
        {@const rest = CATALOG.filter(m => !m.tiers.includes(tier ?? 'low'))}

        <!-- Hardware tier badge -->
        {#if hardware}
          <div class="mb-4 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            <p class="text-[12px] text-emerald-700 dark:text-emerald-400">
              Showing models that run well on your hardware
              ({tier === 'high' ? 'High-end' : tier === 'mid' ? 'Mid-range' : 'Low-end'} tier)
            </p>
          </div>
        {/if}

        <!-- Recommended section -->
        {#if recommended.length > 0}
          <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Recommended for you</p>
          <div class="space-y-2 mb-5">
            {#each recommended as m}
              <div class="flex items-center gap-4 px-4 py-3 bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl hover:border-emerald-400/50 transition-all">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="text-[13px] font-semibold text-gray-800 dark:text-gray-100">{m.name}</p>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">{m.params}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">{m.size}</span>
                  </div>
                  <p class="text-[11px] text-gray-400 mt-1">{m.desc}</p>
                  <div class="flex gap-1.5 mt-1.5 flex-wrap">
                    {#each m.tags as tag}
                      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400">{tag}</span>
                    {/each}
                  </div>
                </div>
                <div class="shrink-0">
                  {#if downloadingModel === m.name}
                    <div class="w-28">
                      <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>{downloadStatus}</span>
                        <span>{downloadProgress}%</span>
                      </div>
                      <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full bg-emerald-500 rounded-full transition-all duration-300" style="width: {downloadProgress}%"></div>
                      </div>
                      <button onclick={cancelDownload}
                        class="mt-1.5 w-full text-[10px] text-red-400 hover:text-red-500 transition-colors">
                        Cancel
                      </button>
                    </div>
                  {:else if installedNames.has(m.name)}
                    <span class="flex items-center gap-1 text-[12px] text-emerald-500 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Installed
                    </span>
                  {:else}
                    <button onclick={() => startDownload(m.name)}
                      class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-medium rounded-lg transition-colors active:scale-95">
                      Download
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- All other models -->
        {#if rest.length > 0}
          <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">All models</p>
          <div class="space-y-2">
            {#each rest as m}
              <div class="flex items-center gap-4 px-4 py-3 bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-all opacity-80">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="text-[13px] font-semibold text-gray-800 dark:text-gray-100">{m.name}</p>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">{m.params}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">{m.size}</span>
                  </div>
                  <p class="text-[11px] text-gray-400 mt-1">{m.desc}</p>
                  <div class="flex gap-1.5 mt-1.5 flex-wrap">
                    {#each m.tags as tag}
                      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">{tag}</span>
                    {/each}
                  </div>
                </div>
                <div class="shrink-0">
                  {#if downloadingModel === m.name}
                    <div class="w-28">
                      <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>{downloadStatus}</span>
                        <span>{downloadProgress}%</span>
                      </div>
                      <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full bg-emerald-500 rounded-full transition-all duration-300" style="width: {downloadProgress}%"></div>
                      </div>
                      <button onclick={cancelDownload}
                        class="mt-1.5 w-full text-[10px] text-red-400 hover:text-red-500 transition-colors">
                        Cancel
                      </button>
                    </div>
                  {:else if installedNames.has(m.name)}
                    <span class="flex items-center gap-1 text-[12px] text-emerald-500 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Installed
                    </span>
                  {:else}
                    <button onclick={() => startDownload(m.name)}
                      class="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-emerald-500 hover:text-white text-gray-600 dark:text-gray-300 text-[12px] font-medium rounded-lg transition-all active:scale-95">
                      Download
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

  </div>
</div>
{/if}