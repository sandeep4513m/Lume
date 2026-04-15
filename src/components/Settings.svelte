<script>
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  /** 
   * @type {{ 
   *   isOpen: boolean, 
   *   onClose: () => void, 
   *   models: any[], 
   *   selectedModel: string, 
   *   onModelChange: (model: string) => void,
   *   isDarkMode: boolean,
   *   onThemeChange: (dark: boolean) => void,
   *   isStreamingEnabled: boolean,
   *   onStreamingChange: (enabled: boolean) => void,
   *   onDataWiped: () => void
   * }} 
   */
  let { 
    isOpen = false, 
    onClose = () => {}, 
    models = [],
    selectedModel = '',
    onModelChange = () => {},
    isDarkMode = false,
    onThemeChange = () => {},
    isStreamingEnabled = true,
    onStreamingChange = () => {},
    onDataWiped = () => {}
  } = $props();

  // ── Models Tab State ──
  let ollamaUrl = $state('http://localhost:11434');
  let connectionStatus = $state(''); // '', 'testing', 'connected', 'failed'
  let defaultModel = $state('');

  // ── Chat Tab State ──
  let showThinkingBlocks = $state(true);
  let showTokenCounter = $state(true);
  let showResponseTime = $state(true);
  let enterToSend = $state(true);

  // ── Appearance Tab State ──
  let theme = $state('system');
  let fontSize = $state('medium');
  let messageDensity = $state('comfortable');

  // ── Data Tab State ──
  let storageStats = $state({ session_count: 0, message_count: 0, db_size_bytes: 0 });
  let showWipeConfirm = $state(false);
  let wipeConfirmText = $state('');

  // ── About Tab State ──
  let ollamaVersion = $state('');
  let ollamaConnected = $state(false);

  // Load settings from localStorage on mount
  onMount(() => {
    loadSettings();
  });

  function loadSettings() {
    // Models
    ollamaUrl = localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';
    defaultModel = localStorage.getItem('lume_default_model') || '';

    // Chat
    showThinkingBlocks = localStorage.getItem('lume_show_thinking') !== 'false';
    showTokenCounter = localStorage.getItem('lume_show_tokens') !== 'false';
    showResponseTime = localStorage.getItem('lume_show_response_time') !== 'false';
    enterToSend = localStorage.getItem('lume_enter_to_send') !== 'false';

    // Appearance
    theme = localStorage.getItem('lume_theme') || 'system';
    fontSize = localStorage.getItem('lume_font_size') || 'medium';
    messageDensity = localStorage.getItem('lume_density') || 'comfortable';

    // Fetch status
    fetchOllamaVersion();
    fetchStorageStats();
  }

  // ── Persist helpers ──
  /** @param {string} key @param {any} value */
  function persist(key, value) {
    localStorage.setItem(key, String(value));
  }

  // ── Models Actions ──
  async function testConnection() {
    connectionStatus = 'testing';
    try {
      const response = await fetch(ollamaUrl + '/api/tags');
      if (response.ok) {
        connectionStatus = 'connected';
        setTimeout(() => connectionStatus = '', 3000);
      } else {
        connectionStatus = 'failed';
      }
    } catch {
      connectionStatus = 'failed';
    }
  }

  function handleOllamaUrlChange() {
    persist('lume_ollama_url', ollamaUrl);
  }

  /** @param {string} model */
  function handleDefaultModelChange(model) {
    defaultModel = model;
    persist('lume_default_model', model);
    onModelChange(model);
  }

  // ── Chat Actions ──
  /** @param {boolean} val */
  function handleStreamingToggle(val) {
    onStreamingChange(val);
    persist('lume_streaming', val);
  }

  /** @param {boolean} val */
  function handleThinkingToggle(val) {
    showThinkingBlocks = val;
    persist('lume_show_thinking', val);
  }

  /** @param {boolean} val */
  function handleTokenToggle(val) {
    showTokenCounter = val;
    persist('lume_show_tokens', val);
  }

  /** @param {boolean} val */
  function handleResponseTimeToggle(val) {
    showResponseTime = val;
    persist('lume_show_response_time', val);
  }

  /** @param {boolean} val */
  function handleEnterToSendToggle(val) {
    enterToSend = val;
    persist('lume_enter_to_send', val);
  }

  // ── Appearance Actions ──
  /** @param {string} t */
  function handleThemeChange(t) {
    theme = t;
    persist('lume_theme', t);
    
    if (t === 'dark') {
      onThemeChange(true);
    } else if (t === 'light') {
      onThemeChange(false);
    } else {
      // System
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      onThemeChange(prefersDark);
    }
  }

  /** @param {string} size */
  function handleFontSizeChange(size) {
    fontSize = size;
    persist('lume_font_size', size);
    applyFontSize(size);
  }

  /** @param {string} size */
  function applyFontSize(size) {
    const root = document.documentElement;
    if (size === 'small') root.style.fontSize = '14px';
    else if (size === 'large') root.style.fontSize = '18px';
    else root.style.fontSize = '16px';
  }

  /** @param {string} density */
  function handleDensityChange(density) {
    messageDensity = density;
    persist('lume_density', density);
  }

  // ── Data Actions ──
  async function fetchStorageStats() {
    try {
      storageStats = await invoke('get_storage_stats');
    } catch (e) {
      console.error('Failed to fetch storage stats:', e);
    }
  }

  async function wipeAllData() {
    if (wipeConfirmText !== 'DELETE') return;
    try {
      await invoke('wipe_all_data');
      showWipeConfirm = false;
      wipeConfirmText = '';
      await fetchStorageStats();
      onDataWiped();
    } catch (e) {
      console.error('Wipe failed:', e);
    }
  }

  // ── About Actions ──
  async function fetchOllamaVersion() {
    try {
      const url = (localStorage.getItem('lume_ollama_url') || 'http://localhost:11434') + '/api/version';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        ollamaVersion = data.version || 'Unknown';
        ollamaConnected = true;
      } else {
        ollamaConnected = false;
      }
    } catch {
      ollamaConnected = false;
    }
  }

  /** @param {number} bytes */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if isOpen}
  <section class="h-full w-full bg-[var(--settings-page-bg)] text-[var(--settings-text-primary)] overflow-y-auto" onkeydown={handleKeydown}>
    <div class="max-w-[980px] mx-auto px-8 py-6">
      <div class="flex items-center gap-3 mb-8">
        <button
          onclick={onClose}
          class="h-8 w-8 rounded-md text-[var(--settings-text-secondary)] hover:text-[var(--settings-text-primary)] hover:bg-[var(--settings-row-hover)] transition-colors flex items-center justify-center"
          aria-label="Back"
          title="Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        <h2 class="text-[15px] font-semibold tracking-tight">Settings</h2>
      </div>

      <div class="space-y-10">
        <section class="space-y-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[14px] font-medium text-[var(--settings-text-primary)]">Ollama account</p>
              <p class="text-[12px] text-[var(--settings-text-secondary)] mt-0.5">Not connected</p>
            </div>
            <button
              type="button"
              class="h-8 px-3 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control-bg)] text-[12px] font-medium text-[var(--settings-text-primary)] hover:bg-[var(--settings-row-hover)] transition-colors"
            >
              Sign In
            </button>
          </div>
        </section>

        <section class="space-y-1">
          <div class="settings-row">
            <div class="settings-row-copy">
              <p class="settings-row-title">Streaming responses</p>
              <p class="settings-row-subtitle">Show AI responses as they are generated.</p>
            </div>
            <button onclick={() => handleStreamingToggle(!isStreamingEnabled)} class="settings-switch {isStreamingEnabled ? 'is-on' : ''}" aria-label="Toggle streaming responses">
              <span class="settings-switch-knob"></span>
            </button>
          </div>
          <div class="settings-row">
            <div class="settings-row-copy">
              <p class="settings-row-title">Show thinking blocks</p>
              <p class="settings-row-subtitle">Display model reasoning sections when available.</p>
            </div>
            <button onclick={() => handleThinkingToggle(!showThinkingBlocks)} class="settings-switch {showThinkingBlocks ? 'is-on' : ''}" aria-label="Toggle thinking blocks">
              <span class="settings-switch-knob"></span>
            </button>
          </div>
          <div class="settings-row">
            <div class="settings-row-copy">
              <p class="settings-row-title">Show token counter</p>
              <p class="settings-row-subtitle">Display token usage metadata per response.</p>
            </div>
            <button onclick={() => handleTokenToggle(!showTokenCounter)} class="settings-switch {showTokenCounter ? 'is-on' : ''}" aria-label="Toggle token counter">
              <span class="settings-switch-knob"></span>
            </button>
          </div>
          <div class="settings-row">
            <div class="settings-row-copy">
              <p class="settings-row-title">Show response time</p>
              <p class="settings-row-subtitle">Display how long each response took.</p>
            </div>
            <button onclick={() => handleResponseTimeToggle(!showResponseTime)} class="settings-switch {showResponseTime ? 'is-on' : ''}" aria-label="Toggle response time">
              <span class="settings-switch-knob"></span>
            </button>
          </div>
          <div class="settings-row">
            <div class="settings-row-copy">
              <p class="settings-row-title">Enter to send</p>
              <p class="settings-row-subtitle">{enterToSend ? 'Press Enter to send, Shift+Enter for new line.' : 'Press Enter for new line, Ctrl+Enter to send.'}</p>
            </div>
            <button onclick={() => handleEnterToSendToggle(!enterToSend)} class="settings-switch {enterToSend ? 'is-on' : ''}" aria-label="Toggle enter to send">
              <span class="settings-switch-knob"></span>
            </button>
          </div>
        </section>

        <section class="space-y-4">
          <div class="settings-field">
            <label class="settings-label">Default model</label>
            <select value={selectedModel} onchange={(e) => handleDefaultModelChange(/** @type {HTMLSelectElement} */(e.target).value)} class="settings-input">
              {#each models as model}
                <option value={model.name}>{model.name}</option>
              {/each}
              {#if models.length === 0}
                <option disabled>No models available</option>
              {/if}
            </select>
          </div>

          <div class="settings-field">
            <label class="settings-label">Ollama server URL</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                bind:value={ollamaUrl}
                onblur={handleOllamaUrlChange}
                class="settings-input font-mono flex-1"
                placeholder="http://localhost:11434"
              />
              <button
                onclick={testConnection}
                disabled={connectionStatus === 'testing'}
                class="h-10 px-4 rounded-md text-[12px] font-medium transition-colors border border-transparent bg-[var(--settings-accent)] text-white hover:opacity-95 disabled:opacity-65 disabled:cursor-not-allowed"
              >
                {#if connectionStatus === 'testing'}
                  Testing...
                {:else if connectionStatus === 'connected'}
                  Connected
                {:else if connectionStatus === 'failed'}
                  Failed
                {:else}
                  Test Connection
                {/if}
              </button>
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <div class="settings-segment-group">
            <p class="settings-label">Theme</p>
            <div class="settings-segment">
              {#each [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }] as t}
                <button onclick={() => handleThemeChange(t.id)} class="settings-segment-item {theme === t.id ? 'is-active' : ''}">
                  {t.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="settings-segment-group">
            <p class="settings-label">Font size</p>
            <div class="settings-segment">
              {#each [{ id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }, { id: 'large', label: 'Large' }] as f}
                <button onclick={() => handleFontSizeChange(f.id)} class="settings-segment-item {fontSize === f.id ? 'is-active' : ''}">
                  {f.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="settings-segment-group">
            <p class="settings-label">Message density</p>
            <div class="settings-segment">
              {#each [{ id: 'compact', label: 'Compact' }, { id: 'comfortable', label: 'Comfortable' }, { id: 'spacious', label: 'Spacious' }] as d}
                <button onclick={() => handleDensityChange(d.id)} class="settings-segment-item {messageDensity === d.id ? 'is-active' : ''}">
                  {d.label}
                </button>
              {/each}
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <p class="settings-label">Storage</p>
          <div class="grid grid-cols-3 gap-3">
            <div class="settings-metric">
              <span class="settings-metric-value">{storageStats.session_count}</span>
              <span class="settings-metric-label">Chats</span>
            </div>
            <div class="settings-metric">
              <span class="settings-metric-value">{storageStats.message_count}</span>
              <span class="settings-metric-label">Messages</span>
            </div>
            <div class="settings-metric">
              <span class="settings-metric-value">{formatBytes(storageStats.db_size_bytes)}</span>
              <span class="settings-metric-label">Database</span>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <div class="settings-danger">
            <p class="text-[13px] font-medium text-red-600 dark:text-red-400">Danger zone</p>
            <p class="text-[12px] text-red-600/85 dark:text-red-300/90">This permanently deletes all chats, messages, and settings.</p>

            {#if !showWipeConfirm}
              <button onclick={() => showWipeConfirm = true} class="settings-danger-btn">Wipe All Data</button>
            {:else}
              <div class="space-y-2">
                <p class="text-[12px] text-red-600 dark:text-red-400">Type <span class="font-mono font-semibold">DELETE</span> to confirm:</p>
                <div class="flex items-center gap-2">
                  <input type="text" bind:value={wipeConfirmText} placeholder="Type DELETE" class="settings-input danger" />
                  <button onclick={wipeAllData} disabled={wipeConfirmText !== 'DELETE'} class="settings-danger-btn confirm">Confirm</button>
                  <button onclick={() => { showWipeConfirm = false; wipeConfirmText = ''; }} class="settings-cancel-btn">Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        </section>

        <section class="space-y-1 pb-4">
          <div class="settings-row compact">
            <span class="settings-row-title">Lume version</span>
            <span class="settings-tag">v0.4.0</span>
          </div>
          <div class="settings-row compact">
            <span class="settings-row-title">Ollama status</span>
            <span class="text-[12px] font-medium {ollamaConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">{ollamaConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          {#if ollamaConnected && ollamaVersion}
            <div class="settings-row compact">
              <span class="settings-row-title">Ollama version</span>
              <span class="settings-row-subtitle">{ollamaVersion}</span>
            </div>
          {/if}
          <div class="settings-row compact">
            <span class="settings-row-title">Runtime</span>
            <span class="settings-row-subtitle">Tauri 2 + WebKit</span>
          </div>
          <div class="settings-row compact">
            <span class="settings-row-title">Framework</span>
            <span class="settings-row-subtitle">SvelteKit + Svelte 5</span>
          </div>
        </section>
      </div>
    </div>
  </section>
{/if}


