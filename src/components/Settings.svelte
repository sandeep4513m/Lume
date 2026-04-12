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

  // Tab state
  let activeTab = $state('models');
  
  const tabs = [
    { id: 'models', label: 'Models', icon: 'robot' },
    { id: 'chat', label: 'Chat', icon: 'chat' },
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'data', label: 'Data', icon: 'database' },
    { id: 'about', label: 'About', icon: 'info' }
  ];

  // ── Models Tab State ──
  let ollamaUrl = $state('http://localhost:11434');
  let temperature = $state(0.7);
  let connectionStatus = $state(''); // '', 'testing', 'connected', 'failed'
  let defaultModel = $state('');

  // ── Chat Tab State ──
  let showThinkingBlocks = $state(true);
  let showTokenCounter = $state(true);
  let showResponseTime = $state(true);
  let enterToSend = $state(true);
  let defaultSystemPrompt = $state('');

  // ── Appearance Tab State ──
  let theme = $state('system');
  let fontSize = $state('medium');
  let messageDensity = $state('comfortable');

  // ── Data Tab State ──
  let storageStats = $state({ session_count: 0, message_count: 0, db_size_bytes: 0 });
  let isExporting = $state(false);
  let isImporting = $state(false);
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
    temperature = parseFloat(localStorage.getItem('lume_temperature') || '0.7');
    defaultModel = localStorage.getItem('lume_default_model') || '';

    // Chat
    showThinkingBlocks = localStorage.getItem('lume_show_thinking') !== 'false';
    showTokenCounter = localStorage.getItem('lume_show_tokens') !== 'false';
    showResponseTime = localStorage.getItem('lume_show_response_time') !== 'false';
    enterToSend = localStorage.getItem('lume_enter_to_send') !== 'false';
    defaultSystemPrompt = localStorage.getItem('lume_system_prompt') || '';

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

  /** @param {number} val */
  function handleTemperatureChange(val) {
    temperature = val;
    persist('lume_temperature', temperature);
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

  function handleSystemPromptChange() {
    persist('lume_system_prompt', defaultSystemPrompt);
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

  async function exportAllChats() {
    isExporting = true;
    try {
      const sessions = /** @type {any[]} */ (await invoke('get_sessions'));
      const allData = [];
      for (const session of sessions) {
        const messages = await invoke('get_messages', { sessionId: session.id });
        allData.push({
          id: session.id,
          title: session.title,
          created_at: session.created_at,
          updated_at: session.updated_at,
          is_pinned: session.is_pinned,
          messages
        });
      }
      const json = JSON.stringify(allData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lume-chats-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      isExporting = false;
    }
  }

  async function importChats() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      isImporting = true;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('Invalid format');
        for (const chat of data) {
          const msgs = (chat.messages || []).map((/** @type {any} */ m) => ({
            role: m.role,
            content: m.content
          }));
          await invoke('import_chat', {
            title: chat.title || 'Imported Chat',
            messages: msgs
          });
        }
        await fetchStorageStats();
        onDataWiped(); // Refresh sessions list
      } catch (e) {
        console.error('Import failed:', e);
      } finally {
        isImporting = false;
      }
    };
    input.click();
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center"
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute inset-0 bg-black/50 backdrop-blur-sm settings-backdrop-enter"
      onclick={onClose}
    ></div>

    <!-- Modal Container -->
    <div class="relative z-10 w-[860px] max-w-[92vw] h-[600px] max-h-[85vh] bg-white dark:bg-[#0d1117] rounded-2xl shadow-2xl dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)] border border-gray-200 dark:border-gray-800 flex overflow-hidden settings-modal-enter">
      
      <!-- Left Sidebar Navigation -->
      <nav class="w-[220px] shrink-0 bg-[#f9fafb] dark:bg-[#111822] border-r border-gray-200 dark:border-gray-800 flex flex-col">
        
        <!-- Settings Header -->
        <div class="px-5 py-5 border-b border-gray-200 dark:border-gray-800">
          <div class="flex items-center space-x-2.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span class="text-[15px] font-bold text-gray-800 dark:text-gray-100">Settings</span>
          </div>
        </div>
        
        <!-- Tab List -->
        <div class="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
          {#each tabs as tab}
            <button
              onclick={() => activeTab = tab.id}
              class="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150
                {activeTab === tab.id
                  ? 'bg-white dark:bg-[#1a212c] text-emerald-600 dark:text-emerald-400 shadow-sm border border-gray-200/60 dark:border-gray-700/60'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-[#1a212c]/60 hover:text-gray-900 dark:hover:text-gray-200'
                }"
            >
              <!-- Tab Icons -->
              {#if tab.icon === 'robot'}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>
              {:else if tab.icon === 'chat'}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              {:else if tab.icon === 'palette'}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"></circle><circle cx="19" cy="13.5" r="2.5"></circle><circle cx="6.5" cy="12" r="2.5"></circle><circle cx="10.5" cy="19" r="2.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.1 0 2-.4 2-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-1.1.9-2 2-2h2.3c3 0 5.5-2.5 5.5-5.5C23 6.5 18 2 12 2z"></path></svg>
              {:else if tab.icon === 'database'}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
              {:else if tab.icon === 'info'}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              {/if}
              <span>{tab.label}</span>
            </button>
          {/each}
        </div>

        <!-- Bottom: version badge -->
        <div class="px-5 py-4 border-t border-gray-200 dark:border-gray-800">
          <span class="text-[11px] text-gray-400 dark:text-gray-600 font-medium">Lume v0.4.0</span>
        </div>
      </nav>

      <!-- Right Content Area -->
      <div class="flex-1 flex flex-col min-w-0">
        
        <!-- Content Header + Close Button -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">
            {#if activeTab === 'models'}🤖 Models
            {:else if activeTab === 'chat'}💬 Chat
            {:else if activeTab === 'appearance'}🎨 Appearance
            {:else if activeTab === 'data'}💾 Data
            {:else if activeTab === 'about'}ℹ️ About
            {/if}
          </h2>
          <button
            onclick={onClose}
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1a212c] transition-colors"
            title="Close Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <!-- ═══════════════════════════════════════════ -->
          <!-- MODELS TAB -->
          <!-- ═══════════════════════════════════════════ -->
          {#if activeTab === 'models'}
            
            <!-- Default Model -->
            <div class="space-y-2">
              <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">Default Model</span>
              <select
                value={selectedModel}
                onchange={(e) => handleDefaultModelChange(/** @type {HTMLSelectElement} */(e.target).value)}
                class="w-full bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-[14px] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
              >
                {#each models as model}
                  <option value={model.name}>{model.name}</option>
                {/each}
                {#if models.length === 0}
                  <option disabled>No models available</option>
                {/if}
              </select>
              <p class="text-[12px] text-gray-400 dark:text-gray-500">Select the model used for new conversations</p>
            </div>

            <!-- Ollama Server URL -->
            <div class="space-y-2">
              <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">Ollama Server URL</span>
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  bind:value={ollamaUrl}
                  onblur={handleOllamaUrlChange}
                  class="flex-1 bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-[14px] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors font-mono"
                  placeholder="http://localhost:11434"
                />
                <button
                  onclick={testConnection}
                  disabled={connectionStatus === 'testing'}
                  class="px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all shrink-0
                    {connectionStatus === 'connected'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                      : connectionStatus === 'failed'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-600'
                    }"
                >
                  {#if connectionStatus === 'testing'}
                    <span class="flex items-center space-x-1.5">
                      <svg class="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                      <span>Testing...</span>
                    </span>
                  {:else if connectionStatus === 'connected'}
                    ✓ Connected
                  {:else if connectionStatus === 'failed'}
                    ✗ Failed
                  {:else}
                    Test Connection
                  {/if}
                </button>
              </div>
              <p class="text-[12px] text-gray-400 dark:text-gray-500">The URL of your Ollama instance</p>
            </div>

            <!-- Temperature Slider -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Temperature</span>
                <span class="text-[14px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-0.5 rounded-lg">{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                oninput={(e) => handleTemperatureChange(parseFloat(/** @type {HTMLInputElement} */(e.target).value))}
                class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-emerald-500"
              />
              <div class="flex justify-between text-[11px] text-gray-400 dark:text-gray-500">
                <span>Precise (0.0)</span>
                <span>Balanced (1.0)</span>
                <span>Creative (2.0)</span>
              </div>
            </div>

          <!-- ═══════════════════════════════════════════ -->
          <!-- CHAT TAB -->
          <!-- ═══════════════════════════════════════════ -->
          {:else if activeTab === 'chat'}
            
            <!-- Streaming Toggle -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Streaming Responses</p>
                <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">Show AI responses as they're generated</p>
              </div>
              <button
                onclick={() => handleStreamingToggle(!isStreamingEnabled)}
                aria-label="Toggle streaming responses"
                class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0d1117]
                  {isStreamingEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 {isStreamingEnabled ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Show Thinking Blocks -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Show Thinking Blocks</p>
                <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">Display model's reasoning process</p>
              </div>
              <button
                onclick={() => handleThinkingToggle(!showThinkingBlocks)}
                aria-label="Toggle thinking blocks"
                class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0d1117]
                  {showThinkingBlocks ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 {showThinkingBlocks ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Show Token Counter -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Show Token Counter</p>
                <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">Display token usage for each response</p>
              </div>
              <button
                onclick={() => handleTokenToggle(!showTokenCounter)}
                aria-label="Toggle token counter"
                class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0d1117]
                  {showTokenCounter ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 {showTokenCounter ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Show Response Time -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Show Response Time</p>
                <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">Display how long each response took</p>
              </div>
              <button
                onclick={() => handleResponseTimeToggle(!showResponseTime)}
                aria-label="Toggle response time"
                class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0d1117]
                  {showResponseTime ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 {showResponseTime ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Enter to Send -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Enter to Send</p>
                <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">{enterToSend ? 'Press Enter to send, Shift+Enter for new line' : 'Press Enter for new line, Ctrl+Enter to send'}</p>
              </div>
              <button
                onclick={() => handleEnterToSendToggle(!enterToSend)}
                aria-label="Toggle enter to send"
                class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0d1117]
                  {enterToSend ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
              >
                <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 {enterToSend ? 'translate-x-5' : 'translate-x-0'}"></span>
              </button>
            </div>

            <!-- Default System Prompt -->
            <div class="space-y-2 pt-2">
              <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">System Prompt</span>
              <textarea
                bind:value={defaultSystemPrompt}
                onblur={handleSystemPromptChange}
                placeholder="You are a helpful assistant..."
                rows="4"
                class="w-full bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-[14px] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors resize-none"
              ></textarea>
              <p class="text-[12px] text-gray-400 dark:text-gray-500">Applied to all new conversations. Leave empty for default behavior.</p>
            </div>

          <!-- ═══════════════════════════════════════════ -->
          <!-- APPEARANCE TAB -->
          <!-- ═══════════════════════════════════════════ -->
          {:else if activeTab === 'appearance'}

            <!-- Theme Selector -->
            <div class="space-y-3">
              <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">Theme</span>
              <div class="grid grid-cols-3 gap-3">
                {#each [
                  { id: 'light', label: 'Light', icon: '☀️' },
                  { id: 'dark', label: 'Dark', icon: '🌙' },
                  { id: 'system', label: 'System', icon: '💻' }
                ] as t}
                  <button
                    onclick={() => handleThemeChange(t.id)}
                    class="flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-150
                      {theme === t.id
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/15 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-[#161b22]'
                      }"
                  >
                    <span class="text-2xl mb-2">{t.icon}</span>
                    <span class="text-[13px] font-medium {theme === t.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}">{t.label}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Font Size -->
            <div class="space-y-3">
              <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">Font Size</span>
              <div class="grid grid-cols-3 gap-3">
                {#each [
                  { id: 'small', label: 'Small', preview: 'Aa', size: '13px' },
                  { id: 'medium', label: 'Medium', preview: 'Aa', size: '15px' },
                  { id: 'large', label: 'Large', preview: 'Aa', size: '18px' }
                ] as f}
                  <button
                    onclick={() => handleFontSizeChange(f.id)}
                    class="flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-150
                      {fontSize === f.id
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/15 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-[#161b22]'
                      }"
                  >
                    <span class="mb-1 font-bold {fontSize === f.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}" style="font-size: {f.size}">{f.preview}</span>
                    <span class="text-[12px] font-medium {fontSize === f.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}">{f.label}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Message Density -->
            <div class="space-y-3">
              <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">Message Density</span>
              <div class="grid grid-cols-3 gap-3">
                {#each [
                  { id: 'compact', label: 'Compact', desc: 'Less spacing' },
                  { id: 'comfortable', label: 'Comfortable', desc: 'Default' },
                  { id: 'spacious', label: 'Spacious', desc: 'More spacing' }
                ] as d}
                  <button
                    onclick={() => handleDensityChange(d.id)}
                    class="flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-150
                      {messageDensity === d.id
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/15 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-[#161b22]'
                      }"
                  >
                    <!-- Density visual -->
                    <div class="flex flex-col space-y-{d.id === 'compact' ? '0.5' : d.id === 'spacious' ? '2' : '1'} mb-2">
                      <div class="w-10 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full {messageDensity === d.id ? '!bg-emerald-400 dark:!bg-emerald-500' : ''}"></div>
                      <div class="w-8 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full {messageDensity === d.id ? '!bg-emerald-300 dark:!bg-emerald-600' : ''}"></div>
                      <div class="w-10 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full {messageDensity === d.id ? '!bg-emerald-400 dark:!bg-emerald-500' : ''}"></div>
                    </div>
                    <span class="text-[12px] font-medium {messageDensity === d.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}">{d.label}</span>
                  </button>
                {/each}
              </div>
            </div>

          <!-- ═══════════════════════════════════════════ -->
          <!-- DATA TAB -->
          <!-- ═══════════════════════════════════════════ -->
          {:else if activeTab === 'data'}

            <!-- Storage Info -->
            <div class="bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <h3 class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Storage Usage</h3>
              <div class="grid grid-cols-3 gap-4">
                <div class="text-center">
                  <p class="text-2xl font-bold text-emerald-500">{storageStats.session_count}</p>
                  <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-1">Chats</p>
                </div>
                <div class="text-center">
                  <p class="text-2xl font-bold text-emerald-500">{storageStats.message_count}</p>
                  <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-1">Messages</p>
                </div>
                <div class="text-center">
                  <p class="text-2xl font-bold text-emerald-500">{formatBytes(storageStats.db_size_bytes)}</p>
                  <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-1">Database</p>
                </div>
              </div>
            </div>

            <!-- Export / Import -->
            <div class="space-y-3">
              <h3 class="text-[13px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Import / Export</h3>
              <div class="flex space-x-3">
                <button
                  onclick={exportAllChats}
                  disabled={isExporting}
                  class="flex-1 flex items-center justify-center space-x-2 py-3 px-4 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
                >
                  {#if isExporting}
                    <svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  {/if}
                  <span>Export All Chats</span>
                </button>
                <button
                  onclick={importChats}
                  disabled={isImporting}
                  class="flex-1 flex items-center justify-center space-x-2 py-3 px-4 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
                >
                  {#if isImporting}
                    <svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  {/if}
                  <span>Import Chats</span>
                </button>
              </div>
            </div>

            <!-- Danger Zone -->
            <div class="mt-4 border-2 border-red-200 dark:border-red-900/50 rounded-xl p-4 bg-red-50/50 dark:bg-red-950/10 space-y-3">
              <div class="flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <h3 class="text-[13px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Danger Zone</h3>
              </div>
              <p class="text-[13px] text-red-600/80 dark:text-red-400/80">This will permanently delete all your chats, messages, and settings. This action cannot be undone.</p>
              
              {#if !showWipeConfirm}
                <button
                  onclick={() => showWipeConfirm = true}
                  class="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[13px] font-semibold transition-colors"
                >
                  Wipe All Data
                </button>
              {:else}
                <div class="space-y-2">
                  <p class="text-[12px] text-red-500 font-medium">Type <span class="font-mono font-bold">DELETE</span> to confirm:</p>
                  <div class="flex items-center space-x-2">
                    <input
                      type="text"
                      bind:value={wipeConfirmText}
                      placeholder="Type DELETE"
                      class="flex-1 bg-white dark:bg-[#0d1117] border border-red-300 dark:border-red-800 rounded-xl px-4 py-2 text-[14px] text-red-600 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                    />
                    <button
                      onclick={wipeAllData}
                      disabled={wipeConfirmText !== 'DELETE'}
                      class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-red-900/30 text-white rounded-xl text-[13px] font-semibold transition-colors disabled:cursor-not-allowed"
                    >
                      Confirm
                    </button>
                    <button
                      onclick={() => { showWipeConfirm = false; wipeConfirmText = ''; }}
                      class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-[13px] font-medium transition-colors hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {/if}
            </div>

          <!-- ═══════════════════════════════════════════ -->
          <!-- ABOUT TAB -->
          <!-- ═══════════════════════════════════════════ -->
          {:else if activeTab === 'about'}

            <!-- App Info Card -->
            <div class="bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
              <div class="flex items-center space-x-3">
                <div class="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div>
                  <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">Lume</h3>
                  <p class="text-[13px] text-gray-500 dark:text-gray-400">Local AI Chat Client</p>
                </div>
              </div>
            </div>

            <!-- Version & System Info -->
            <div class="space-y-1">
              <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                <span class="text-[14px] text-gray-600 dark:text-gray-400">Version</span>
                <span class="text-[14px] font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">v0.4.0</span>
              </div>
              <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                <span class="text-[14px] text-gray-600 dark:text-gray-400">Ollama Status</span>
                <span class="flex items-center space-x-2">
                  <span class="w-2 h-2 rounded-full {ollamaConnected ? 'bg-emerald-500' : 'bg-red-500'}"></span>
                  <span class="text-[14px] font-medium {ollamaConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">{ollamaConnected ? 'Connected' : 'Disconnected'}</span>
                </span>
              </div>
              {#if ollamaConnected && ollamaVersion}
                <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                  <span class="text-[14px] text-gray-600 dark:text-gray-400">Ollama Version</span>
                  <span class="text-[14px] font-medium text-gray-800 dark:text-gray-200">{ollamaVersion}</span>
                </div>
              {/if}
              <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                <span class="text-[14px] text-gray-600 dark:text-gray-400">Runtime</span>
                <span class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Tauri 2 + WebKit</span>
              </div>
              <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
                <span class="text-[14px] text-gray-600 dark:text-gray-400">Framework</span>
                <span class="text-[14px] font-medium text-gray-800 dark:text-gray-200">SvelteKit + Svelte 5</span>
              </div>
              <div class="flex items-center justify-between py-3">
                <span class="text-[14px] text-gray-600 dark:text-gray-400">License</span>
                <span class="text-[14px] font-medium text-gray-800 dark:text-gray-200">MIT</span>
              </div>
            </div>

            <!-- GitHub Link -->
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-center space-x-2 py-3 px-4 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg>
              <span>View on GitHub</span>
            </a>
          {/if}

        </div>
      </div>
    </div>
  </div>
{/if}


