<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { fetchModels, sendMessage } from '$lib/ollama.js';
  import Markdown from '../components/Markdown.svelte';
  import Settings from '../components/Settings.svelte';
  import ModelManager from '../components/ModelManager.svelte';

  /** @type {any[]} */
  let models = $state([]);
  let selectedModel = $state('');
  let prompt = $state('');
  /** @type {any[]} */
  let messages = $state([]); 
  let isLoading = $state(false);
  let errorMessage = $state('');
  let copiedIndex = $state(-1);
  let ollamaOffline = $state(false);
  
  /** @type {AbortController | null} */
  let currentAbortController = $state(null);
  let isStreamingEnabled = $state(true);

  // Sidebar Multi-Session State
  /** @type {any[]} */
  let sessions = $state([]);
  let sessionsLoading = $state(true);
  let currentSessionId = $state('');
  let isSidebarCollapsed = $state(false);
  let isModelMenuOpen = $state(false);
  let searchQuery = $state('');
  let hasUnread = $state(false);

  let textareaRef = $state();
  let chatContainerRef = $state();
  let showScrollButton = $state(false);
  let isDarkMode = $state(false);
  let isSettingsOpen = $state(false);
  let isModelManagerOpen = $state(false);


  // ── Feature 2: Model Info Card ──────────────────────────────────────────
  /** Lightweight in-memory cache: modelName → parsed info. Never hits the
   *  network twice for the same model within a session. ~400 bytes per entry. */
  /** @type {Map<string, {size?: string, params?: string, speed?: string, family?: string, _tier?: any}>} */
  const modelInfoCache = new Map();

  /** @type {{size?: string, params?: string, speed?: string, family?: string, _tier?: any} | null} */
  let modelInfo = $state(null);
  let modelInfoLoading = $state(false);
  /** The model name for which the info card is currently shown */
  let hoveredModel = $state('');

  /** Derive a human-readable speed tier from parameter count (B) */
  /** @param {number} billions */
  function speedTier(billions) {
    if (billions <= 3)  return { label: 'Fast',    color: 'text-[#8a8a8a]', bars: 3 };
    if (billions <= 9)  return { label: 'Balanced', color: 'text-amber-400',   bars: 2 };
    if (billions <= 30) return { label: 'Capable',  color: 'text-orange-400',  bars: 2 };
    return               { label: 'Slow',    color: 'text-red-400',     bars: 1 };
  }

  /** @param {string} name */
  async function fetchModelInfo(name) {
    if (!name) return;
    if (modelInfoCache.has(name)) {
      modelInfo = modelInfoCache.get(name) ?? null;
      return;
    }
    modelInfoLoading = true;
    modelInfo = null;
    try {
      const ollamaUrl = localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';
      const res = await fetch(`${ollamaUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) throw new Error('show failed');
      const data = await res.json();

      // Extract fields — Ollama /api/show returns modelinfo or details depending on version
      const details = data.details || {};
      const modelDetails = data.model_info || {};

      // Parameter count: prefer model_info key, fall back to details string
      let billions = 0;
      const paramStr = details.parameter_size || '';
      const match = paramStr.match(/([\d.]+)\s*([BbMm])/);
      if (match) {
        billions = parseFloat(match[1]);
        if (match[2].toLowerCase() === 'm') billions /= 1000;
      }

      // Disk size from the model list entry
      const listEntry = models.find(m => m.name === name);
      const bytes = listEntry?.size ?? 0;
      const gb = bytes / 1073741824;
      const sizeStr = gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1048576).toFixed(0)} MB`;

      const info = {
        size:   sizeStr || '—',
        params: paramStr || '—',
        speed:  '',   // set below
        family: details.family || name.split(':')[0]
      };
      // Store speed metadata on the object directly
      const tier = speedTier(billions);
      // @ts-ignore
      info._tier = tier;

      modelInfoCache.set(name, info);
      modelInfo = info;
    } catch {
      // Non-fatal: just show nothing
      modelInfo = null;
    } finally {
      modelInfoLoading = false;
    }
  }

  // Derived filtered results
  let filteredSessions = $derived(
    sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  /** @param {number} timestamp */
  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  /** @param {string | null} switchToId */
  async function loadSessions(switchToId = null) {
    try {
      sessionsLoading = true;
      sessions = await invoke('get_sessions');
      sessionsLoading = false;
      if (sessions.length > 0) {
        if (switchToId) {
            await loadChat(switchToId);
        } else if (!currentSessionId || !sessions.find(s => s.id === currentSessionId)) {
            await loadChat(sessions[0].id);
        }
      } else {
        await createNewChat();
      }
    } catch(e) {
      sessionsLoading = false;
      errorMessage = "Failed to load sessions: " + e;
    }
  }

  async function createNewChat() {
    try {
      const newId = await invoke('create_session', { 
        title: "New Chat", 
        model: selectedModel
      });
      currentSessionId = newId;
      messages = [];
      await loadSessions(newId);
    } catch(e) {
      errorMessage = "Error creating chat: " + e;
    }
  }

  /** @param {string} id */
  async function loadChat(id) {
    currentSessionId = id;
    prompt = '';
    isLoading = false;
    errorMessage = '';
    try {
      const total = sessions.find(s => s.id === id)?.message_count ?? 0;
      const offset = Math.max(total - 50, 0);
      messages = await invoke('get_messages', { sessionId: id, limit: 50, offset });

      // Restore the model that was last used in this specific session.
      // Falls back to: localStorage default → first available model.
      const session = sessions.find(s => s.id === id);
      
      const fallbackModel = localStorage.getItem('lume_default_model') || (models.length > 0 ? models[0].name : '');
      selectedModel = (session?.model) || fallbackModel;

      setTimeout(scrollToBottom, 100);
    } catch (e) {
      console.error('[loadChat]', e);
      errorMessage = 'Failed to load messages: ' + e;
    }
  }

  /** 
   * @param {Event} e 
   * @param {string} id 
   */
  async function deleteSession(e, id) {
    e.stopPropagation();
    if (confirm("Delete this chat?")) {
      try {
        await invoke('delete_session', { sessionId: id });
        if (currentSessionId === id) currentSessionId = '';
        await loadSessions();
      } catch (err) {
        console.error('[deleteSession]', err);
        errorMessage = 'Failed to delete: ' + err;
      }
    }
  }

  async function tryFetchModels() {
    try {
      const ollamaUrl = localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';
      const ping = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!ping.ok) throw new Error('bad status');
      const m = await fetchModels();
      models = m;
      ollamaOffline = false;
      if (models.length > 0) {
        selectedModel = models[0].name;
        errorMessage = '';
      }
    } catch {
      ollamaOffline = true;
      models = [];
    }
  }

  onMount(() => {
    tryFetchModels();
    
    // Theming logic
    isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDarkMode) document.body.classList.add('dark');

    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeydown);

    // Load chat sessions from database — CRITICAL for sidebar and chat to work
    loadSessions();
  });

  function handleScroll() {
    if (!chatContainerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    showScrollButton = distanceFromBottom > 150;
    if (!showScrollButton) hasUnread = false;
  }

  function scrollToBottom() {
    if (chatContainerRef) {
      chatContainerRef.scrollTo({ top: chatContainerRef.scrollHeight, behavior: 'smooth' });
    }
  }

  $effect(() => {
    if (messages.length && chatContainerRef && !showScrollButton) {
      setTimeout(() => scrollToBottom(), 50);
    }
  });

  function adjustTextareaHeight() {
    if (textareaRef) {
      textareaRef.style.height = 'auto';
      textareaRef.style.height = textareaRef.scrollHeight + 'px';
    }
  }

  /** @param {string} content */
  function aiDisplayContent(content) {
    if (!content || !content.includes('<redacted_thinking>')) return content;
    const end = content.indexOf('</think>');
    if (end === -1) return '';
    return content.slice(end + '</think>'.length).trim();
  }

  async function handleSend(skipUserSave = false) {
    if (typeof skipUserSave !== 'boolean') skipUserSave = false;
    if (!prompt.trim() || !selectedModel || isLoading || !currentSessionId) return;
    
    currentAbortController = new AbortController();
    const currentPrompt = prompt;
    prompt = '';
    tick().then(() => {
      adjustTextareaHeight();
      scrollToBottom();
    });
    
    isLoading = true;
    errorMessage = '';
    
    if (!skipUserSave) {
      messages.push({ role: 'user', content: currentPrompt });
      const userMsgIndex = messages.length - 1;
      
      invoke('save_message', { sessionId: currentSessionId, role: 'user', content: currentPrompt })
        .then((id) => {
           messages[userMsgIndex].id = id;
           messages[userMsgIndex].created_at = Date.now();
           loadSessions();
        })
        .catch(console.error);
    }
    
    const aiIndex = messages.length;
    messages.push({ role: 'ai', content: '', isLoading: true });
    if (showScrollButton) hasUnread = true;
    
    try {
      const { text: finalText } = await sendMessage(
        selectedModel, 
        currentPrompt, 
        isStreamingEnabled ? (streamedText) => {
          messages[aiIndex].content = streamedText;
          messages[aiIndex].isLoading = false;
          if (!showScrollButton) setTimeout(scrollToBottom, 10);
        } : null,
        currentAbortController.signal
      );
      
      messages[aiIndex].content = finalText;
      messages[aiIndex].isLoading = false;
      
      try {
        const id = await invoke('save_message', { sessionId: currentSessionId, role: 'ai', content: finalText });
        messages[aiIndex].id = id;
        messages[aiIndex].created_at = Date.now();
        await loadSessions();
      } catch (err) { Object.seal(err); console.error(err); }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const partialText = messages[aiIndex].content;
        messages[aiIndex].isLoading = false;
        if (partialText) {
            try {
              const id = await invoke('save_message', { sessionId: currentSessionId, role: 'ai', content: partialText });
              messages[aiIndex].id = id;
              messages[aiIndex].created_at = Date.now();
              await loadSessions();
            } catch (err) { Object.seal(err); console.error(err); }
        } else {
            messages = messages.filter((_, i) => i !== aiIndex);
        }
      } else {
        errorMessage = "Error communicating with Ollama: " + (error instanceof Error ? error.message : String(error));
        messages = messages.filter((_, i) => i !== aiIndex);
        prompt = currentPrompt;
        tick().then(adjustTextareaHeight);
      }
    } finally {
      isLoading = false;
      currentAbortController = null;
    }
  }

  function handleStop() {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  }

  /** 
   * @param {string} text 
   * @param {number} i 
   */
  function handleCopy(text, i) {
    navigator.clipboard.writeText(text);
    copiedIndex = i;
    setTimeout(() => copiedIndex = -1, 2000);
  }

  /** @param {any} msg */
  async function handleEdit(msg) {
    if (!msg.id || isLoading) return;
    prompt = msg.content;
    const msgId = msg.id;
    const timestamp = msg.created_at;
    
    try {
      await invoke('delete_messages_after', { sessionId: currentSessionId, timestamp });
      const idx = messages.findIndex(m => m.id === msgId);
      if (idx !== -1) {
        messages = messages.slice(0, idx);
      }
      tick().then(adjustTextareaHeight);
    } catch (e) {
      errorMessage = "Failed to edit: " + e;
    }
  }

  /** 
   * @param {any} msg 
   * @param {number} idx 
   */
  async function handleRegenerate(msg, idx) {
    if (!msg.id || isLoading) return;
    
    const promptMsg = messages[idx - 1];
    if (!promptMsg || promptMsg.role !== 'user') return;
    
    prompt = promptMsg.content;
    
    try {
      await invoke('delete_message', { messageId: msg.id });
      messages = messages.filter(m => m.id !== msg.id);
      await handleSend(true);
    } catch (e) {
      errorMessage = "Failed to regenerate: " + e;
    }
  }

  function toggleTheme() {
    isDarkMode = !isDarkMode;
    if (isDarkMode) document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }

  async function handleClear() {
    if(confirm("Delete all history for this session?")) {
      await invoke('clear_messages', { sessionId: currentSessionId });
      messages = [];
    }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    // Ctrl+N — new chat
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      createNewChat();
    }
    // Ctrl+/ — focus input
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      textareaRef?.focus();
    }
    // Escape — close all menus
    if (e.key === 'Escape') {
      isModelMenuOpen = false;
      isSettingsOpen = false;
      isModelManagerOpen = false;
    }
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="flex h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden">
  
  <!-- PREMIUM SIDEBAR -->
  <aside class="flex flex-col h-full bg-[var(--bg-surface)] shrink-0 {isSidebarCollapsed ? 'w-16' : 'w-[260px]'}">
    <!-- Header Row -->
    <div class="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-primary)] shrink-0">
      <button
        onclick={() => isSidebarCollapsed = !isSidebarCollapsed}
        class="h-8 w-8 shrink-0 rounded-md text-[var(--text-secondary)] hover:bg-[var(--hover-color)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center"
        title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
      </button>
      {#if !isSidebarCollapsed}
        <div class="flex items-center gap-2">
          <div class="h-5 w-5 shrink-0 flex items-center justify-center">
            <svg width="16" height="18" viewBox="0 0 72 80" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="52" y1="8" x2="20" y2="72" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><line x1="20" y1="72" x2="58" y2="72" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><line x1="38" y1="62" x2="52" y2="68" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.7"/><line x1="42" y1="54" x2="58" y2="60" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/><line x1="45" y1="46" x2="56" y2="51" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.25"/></svg>
          </div>
          <span class="text-sm text-[var(--text-primary)]">Lume</span>
        </div>
      {/if}
    </div>

    {#if isSidebarCollapsed}
      <!-- Collapsed Top Actions -->
      <div class="px-3 pb-2 shrink-0">
        <button
          onclick={createNewChat}
          class="h-8 w-8 rounded-md text-[var(--text-secondary)] hover:bg-[var(--hover-color)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center"
          title="New Chat"
          aria-label="New Chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h13"></path><path d="M12 3v13"></path><path d="m16 16 5 5"></path></svg>
        </button>
      </div>
    {:else}
      <!-- Primary New Chat -->
      <div class="px-3 pt-1 shrink-0">
        <button onclick={createNewChat} class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-[var(--bg-muted)] text-[var(--text-primary)] transition-colors justify-start" title="New Chat">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h13"></path><path d="M12 3v13"></path><path d="m16 16 5 5"></path></svg>
          <span>New Chat</span>
        </button>
      </div>

      <!-- Navigation -->
      <div class="px-3 pt-2 space-y-1 shrink-0">
        <button onclick={() => isSettingsOpen = true} class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-color)] hover:text-[var(--text-primary)] transition-colors justify-start">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>
          <span>Settings</span>
        </button>
      </div>

      <!-- Chat History -->
      <div class="flex-1 overflow-y-auto w-full px-3 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-[var(--hover-color)] scrollbar-track-transparent">
        <div class="px-2 pb-1 text-xs text-[var(--text-secondary)]">This week</div>
        {#if sessionsLoading}
          {#each [1,2,3,4,5] as _}
            <div class="rounded-md px-3 py-2 flex items-center gap-2 justify-start">
              <div class="h-3 w-3/4 rounded-full bg-[var(--hover-color)] animate-pulse"></div>
            </div>
          {/each}
        {:else}
        {#each filteredSessions as session}
          <div 
            role="button"
            tabindex="0"
            onclick={() => loadChat(session.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadChat(session.id); } }}
            class="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-md text-sm justify-start
              {session.id === currentSessionId ? 'bg-[var(--bg-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-color)]'}"
            title={session.title}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span class="truncate">{session.title}</span>
          </div>
        {/each}
        {#if filteredSessions.length === 0}
          <div class="px-2 text-sm text-[var(--text-secondary)]">No chats yet</div>
        {/if}
      {/if}
      </div>
    {/if}

  </aside>

  <!-- MAIN CHAT INTERFACE -->
  <main class="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)] relative">
    {#if isSettingsOpen}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => isSettingsOpen = false}
        {models}
        {selectedModel}
        onModelChange={(model) => selectedModel = model}
        {isDarkMode}
        onThemeChange={(dark) => {
          isDarkMode = dark;
          if (dark) document.body.classList.add('dark');
          else document.body.classList.remove('dark');
        }}
        {isStreamingEnabled}
        onStreamingChange={(enabled) => isStreamingEnabled = enabled}
        onDataWiped={() => { loadSessions(); }}
      />
    {:else}
    <!-- Chat Messages View -->
    <div 
      bind:this={chatContainerRef}
      onscroll={handleScroll}
      class="flex-1 overflow-y-auto w-full p-6 space-y-6 flex flex-col flex-1 min-h-0"
    >
      {#if errorMessage}
        <div class="max-w-3xl mx-auto w-full p-4 bg-red-900/20 border border-red-800/40 text-red-400 rounded-2xl text-sm shadow-sm flex items-start space-x-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{errorMessage}</span>
        </div>
      {/if}

      <div class="max-w-3xl mx-auto w-full">
        <div class="flex flex-col flex-1 min-h-0 space-y-3 pb-6">
        {#if messages.length === 0 && !errorMessage}
          {#if ollamaOffline}
            <!-- STATE: Ollama offline -->
            <div class="m-auto flex flex-col items-center justify-center text-center px-6 max-w-sm">
              <div class="w-14 h-14 rounded-2xl bg-red-900/20 flex items-center justify-center mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h2 class="text-[17px] font-semibold text-gray-100 mb-2">Can't connect to Ollama</h2>
              <p class="text-[13px] text-gray-400 mb-1">Make sure Ollama is running at</p>
              <code class="text-[12px] bg-[#161b22] text-[#c4c4c4] px-3 py-1 rounded-lg mb-5 border border-gray-700">
                {localStorage.getItem('lume_ollama_url') || 'http://localhost:11434'}
              </code>
              <button
                onclick={tryFetchModels}
                class="flex items-center space-x-2 px-5 py-2.5 bg-[#8a8a8a] hover:bg-[#7a7a7a] text-white text-[13px] font-semibold rounded-xl transition-colors active:scale-95 shadow-sm mb-6"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
                <span>Retry Connection</span>
              </button>
              <p class="text-[11px] text-gray-500">Don't have Ollama? Visit <span class="text-[#8a8a8a] font-medium">ollama.com</span></p>
            </div>

          {:else if models.length === 0}
            <!-- STATE: Ollama online but no models -->
            <div class="m-auto flex flex-col items-center justify-center text-center px-6 max-w-sm">
              <div class="w-14 h-14 rounded-2xl bg-amber-900/20 flex items-center justify-center mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </div>
              <h2 class="text-[17px] font-semibold text-gray-100 mb-2">No models installed</h2>
              <p class="text-[13px] text-gray-400 mb-4">Pull your first model to get started. Open a terminal and run:</p>
              <div class="w-full bg-[#161b22] border border-gray-700 rounded-xl px-4 py-3 mb-5 text-left">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Terminal</p>
                <code class="text-[13px] text-[#c4c4c4] font-mono">ollama pull gemma3:4b</code>
              </div>
              <button
                onclick={tryFetchModels}
                class="flex items-center space-x-2 px-5 py-2.5 bg-[#8a8a8a] hover:bg-[#7a7a7a] text-white text-[13px] font-semibold rounded-xl transition-colors active:scale-95 shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
                <span>Check Again</span>
              </button>
            </div>

          {:else}
            <!-- STATE: Normal new chat -->
            <div class="flex flex-col items-center justify-center h-full gap-12">
              <svg width="96" height="107" viewBox="0 0 72 80" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="52" y1="8" x2="20" y2="72" stroke="#f0f0f0" stroke-width="7" stroke-linecap="round"/><line x1="20" y1="72" x2="58" y2="72" stroke="#f0f0f0" stroke-width="7" stroke-linecap="round"/><line x1="38" y1="62" x2="52" y2="68" stroke="#f0f0f0" stroke-width="3" stroke-linecap="round" opacity="0.7"/><line x1="42" y1="54" x2="58" y2="60" stroke="#f0f0f0" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/><line x1="45" y1="46" x2="56" y2="51" stroke="#f0f0f0" stroke-width="2" stroke-linecap="round" opacity="0.25"/></svg>
            </div>
          {/if}
        {/if}

        {#each messages as msg, i}
          <div class="flex w-full {msg.role === 'user' ? 'justify-end' : 'justify-start'} group">
            
            {#if msg.role === 'user' && !isLoading}
              <!-- Edit Button for User -->
              <button onclick={() => handleEdit(msg)} class="mr-2 mt-2 p-1.5 h-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl text-gray-400 hover:text-[#8a8a8a] bg-[#242424] shadow-sm border border-[#383838]" title="Edit Message">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            {/if}

            <div class="text-[14px] leading-6 relative flex flex-col
              {msg.role === 'user' 
                ? 'max-w-[85%] bg-[#2e2e2e] rounded-xl px-3 py-2 text-white' 
                : 'w-full max-w-full text-[#f0f0f0] py-1 px-1'}">
              


              {#if msg.isLoading}
                <div class="flex space-x-1.5 items-center h-5">
                  <div class="w-2 h-2 bg-gray-400/50 rounded-full animate-bounce"></div>
                  <div class="w-2 h-2 bg-gray-400/50 rounded-full animate-bounce" style="animation-delay: 0.15s"></div>
                  <div class="w-2 h-2 bg-gray-400/50 rounded-full animate-bounce" style="animation-delay: 0.3s"></div>
                </div>
              {:else if msg.role === 'ai'}
                <Markdown content={aiDisplayContent(msg.content)} />
                
                {#if msg.role === 'ai' && !msg.isLoading}
                  <!-- Combined action + analytics row -->
                  <div class="mt-4 pt-3 border-t border-gray-800/60 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <!-- Left: action buttons -->
                    <div class="flex items-center space-x-0.5 text-gray-500">
                      <button onclick={() => handleCopy(msg.content, i)} class="p-1.5 hover:text-[#8a8a8a] rounded-lg transition-colors hover:bg-[#21262d]" title="Copy">
                        {#if copiedIndex === i}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[#8a8a8a]"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        {:else}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        {/if}
                      </button>
                      <button class="p-1.5 hover:text-[#8a8a8a] rounded-lg transition-colors hover:bg-[#21262d]" title="Give positive feedback">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                      </button>
                      <button class="p-1.5 hover:text-red-400 rounded-lg transition-colors hover:bg-[#21262d]" title="Give negative feedback">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
                      </button>
                      <button onclick={() => handleRegenerate(msg, i)} class="p-1.5 hover:text-[#8a8a8a] rounded-lg transition-colors hover:bg-[#21262d]" title="Regenerate">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                      </button>
                    </div>

                  </div>
                {/if}

              {:else}
                <div class="whitespace-pre-wrap">{msg.content}</div>
              {/if}
            </div>
          </div>
        {/each}
        </div>
      </div>
    </div>

    <!-- Input Bar -->
    <div class="w-full shrink-0 relative z-10">
      
      {#if showScrollButton}
        <button 
          onclick={scrollToBottom}
          class="absolute -top-14 left-1/2 -translate-x-1/2 p-2 rounded-full bg-[#161b22] border border-gray-700 shadow-md text-[#8a8a8a] hover:text-[#7a7a7a] transition-colors z-50 hover:shadow-lg hover:-translate-y-1"
          class:animate-bounce={isLoading || hasUnread}
          title="Scroll to bottom"
        >
          {#if hasUnread}
            <span class="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#161b22]"></span>
          {/if}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
        </button>
      {/if}

      <div class="p-4">
        <div class="max-w-3xl mx-auto w-full">
          <div class="flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-color)] focus-within:border-[var(--text-secondary)] rounded-xl relative">
        <textarea 
          bind:this={textareaRef}
          bind:value={prompt}
          placeholder="Message Lume..."
          oninput={adjustTextareaHeight}
          onkeydown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isLoading || models.length === 0}
          class="flex-1 bg-transparent outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] text-sm"
          rows="1"
        ></textarea>
        
        <!-- Model selector -->
        <div class="absolute right-12 bottom-2 pr-3 text-sm flex items-center space-x-1">
          
          <div class="relative">
            <!-- Toggler Button -->
            <button 
              type="button"
              onclick={(e) => { e.stopPropagation(); isModelMenuOpen = !isModelMenuOpen; }}
              disabled={models.length === 0}
              class="flex items-center space-x-1.5 px-3 py-1 bg-transparent hover:bg-[var(--hover-color)] rounded-full transition-colors font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] group"
              title="Change execution model"
            >
              <span class="max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis text-[13px]">
                {models.length === 0 ? "Searching..." : (selectedModel || "Select Model")}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <!-- Floating Menu Popover -->
            {#if isModelMenuOpen && models.length > 0}
              <div 
                 role="menu"
                 tabindex="0"
                 onkeydown={(e) => { if (e.key === 'Escape') isModelMenuOpen = false; }}
                 onclick={(e) => e.stopPropagation()} 
                 class="absolute bottom-[calc(100%+14px)] right-0 w-64 bg-[var(--bg-elevated)]/95 backdrop-blur-xl border border-[var(--border-color)] rounded-2xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.35)] p-1.5 z-50 overflow-visible origin-bottom-right"
              >
                <!-- Title header inside popover -->
                <div class="px-3 py-2 border-b border-[var(--border-color)] mb-1">
                  <span class="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-widest">Available Models</span>
                </div>
                
                <div class="max-h-[350px] overflow-y-auto w-full custom-scrollbar">
                  {#each models as model}
                    <!-- Model row with info card trigger -->
                    <div
                      class="relative"
                      onmouseenter={() => { hoveredModel = model.name; fetchModelInfo(model.name); }}
                      onmouseleave={() => { hoveredModel = ''; modelInfo = null; }}
                      role="none"
                    >
                      <button 
                        type="button"
                        onclick={async () => {
                          if (!currentSessionId || selectedModel === model.name) {
                            isModelMenuOpen = false;
                            return;
                          }
                          const previousModel = selectedModel;
                          selectedModel = model.name;
                          isModelMenuOpen = false;
                          try {
                            await invoke('set_session_model', {
                              sessionId: currentSessionId,
                              model: model.name
                            });
                            const idx = sessions.findIndex(s => s.id === currentSessionId);
                            if (idx !== -1) sessions[idx] = { ...sessions[idx], model: model.name };
                          } catch (err) {
                            console.error('[set_session_model] IPC failed, reverting UI:', err);
                            selectedModel = previousModel;
                            errorMessage = 'Failed to save model choice. Please try again.';
                            setTimeout(() => errorMessage = '', 4000);
                          }
                        }}
                        class="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer hover:bg-[#21262d] {selectedModel === model.name ? 'bg-gray-800/50' : ''}"
                      >
                        <div class="flex flex-col min-w-0 pr-4">
                          <span class="text-[14px] font-medium {selectedModel === model.name ? 'text-[#c4c4c4]' : 'text-gray-200'} truncate">
                            {model.name}
                          </span>
                          <span class="text-[11px] text-gray-500 truncate mt-0.5">
                            {model.size ? `${(model.size / 1073741824).toFixed(1)} GB` : 'Local'} · {(model.details?.parameter_size) || 'Ollama'}
                          </span>
                        </div>
                        
                        <div class="shrink-0 text-[#8a8a8a] h-4 w-4">
                          {#if selectedModel === model.name}
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          {/if}
                        </div>
                      </button>

                      <!-- ── Model Info Card (glassmorphism, appears on hover) ── -->
                      {#if hoveredModel === model.name}
                        <div
                          class="absolute right-[calc(100%+10px)] top-0 w-52 pointer-events-none z-[60]"
                          style="transform: translateY(min(0px, calc(100vh - 300px - var(--mouse-y, 0px))))"
                        >
                          <div class="bg-[#1a1a1a]/85 backdrop-blur-2xl border border-gray-700/50 rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.6)] p-3.5 space-y-2.5">
                            
                            <!-- Header -->
                            <div class="flex items-center space-x-2">
                              <div class="w-7 h-7 rounded-lg bg-gray-700/50 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-[#8a8a8a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>
                              </div>
                              <div class="min-w-0">
                                <p class="text-[12px] font-bold text-gray-100 truncate">{model.name.split(':')[0]}</p>
                                <p class="text-[10px] text-gray-500">{model.name.includes(':') ? model.name.split(':')[1] : 'latest'}</p>
                              </div>
                            </div>

                            <!-- Divider -->
                            <div class="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>

                            {#if modelInfoLoading}
                              <!-- Skeleton loader -->
                              <div class="space-y-2 animate-pulse">
                                <div class="h-3 bg-gray-700 rounded-full w-3/4"></div>
                                <div class="h-3 bg-gray-700 rounded-full w-1/2"></div>
                                <div class="h-3 bg-gray-700 rounded-full w-2/3"></div>
                              </div>
                            {:else if modelInfo}
                              <!-- Stats grid -->
                              <div class="space-y-1.5">
                                <!-- Disk size -->
                                <div class="flex items-center justify-between">
                                  <span class="text-[11px] text-gray-500 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                                    Size
                                  </span>
                                  <span class="text-[12px] font-semibold text-gray-200">{modelInfo.size}</span>
                                </div>

                                <!-- Parameters -->
                                <div class="flex items-center justify-between">
                                  <span class="text-[11px] text-gray-500 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                    Params
                                  </span>
                                  <span class="text-[12px] font-semibold text-gray-200">{modelInfo.params}</span>
                                </div>

                                <!-- Speed tier -->
                                <div class="flex items-center justify-between">
                                  <span class="text-[11px] text-gray-500 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline></svg>
                                    Speed
                                  </span>
                                  <!-- Speed bars -->
                                  <div class="flex items-center gap-1">
                                    <div class="flex gap-0.5 items-end">
                                      {#each [1,2,3] as bar}
                                        {@const tier = speedTier(parseFloat((modelInfo.params || '0').replace(/[^\d.]/g, '')) || 0)}
                                        <div class="w-1.5 rounded-sm {bar <= tier.bars ? tier.color.replace('text-', 'bg-') : 'bg-gray-700'}" style="height: {bar * 4 + 2}px"></div>
                                      {/each}
                                    </div>
                                    <span class="text-[11px] font-semibold {speedTier(parseFloat((modelInfo.params || '0').replace(/[^\d.]/g, '')) || 0).color}">{speedTier(parseFloat((modelInfo.params || '0').replace(/[^\d.]/g, '')) || 0).label}</span>
                                  </div>
                                </div>

                                <!-- Family tag -->
                                {#if modelInfo.family && modelInfo.family !== model.name.split(':')[0]}
                                  <div class="pt-0.5">
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-400">
                                      {modelInfo.family}
                                    </span>
                                  </div>
                                {/if}
                              </div>
                            {:else}
                              <p class="text-[11px] text-gray-500 text-center py-1">Hover to load info…</p>
                            {/if}
                          </div>
                          <!-- Arrow pointing right -->
                          <div class="absolute right-[-5px] top-5 w-2.5 h-2.5 bg-[#1a1a1a]/85 border-r border-t border-gray-700/50 rotate-45"></div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                  <div class="border-t border-gray-800 mt-1 pt-1">
                    <button
                      onclick={() => { isModelMenuOpen = false; isModelManagerOpen = true; }}
                      class="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#c4c4c4] hover:bg-[#21262d] rounded-lg transition-colors font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Get Models
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>

        {#if isLoading}
          <button 
            onclick={handleStop}
            class="absolute right-2 bottom-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-full p-2 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 active:scale-95"
            title="Stop Generation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1" ry="1"></rect></svg>
          </button>
        {:else}
          <button 
            onclick={() => handleSend()}
            disabled={!prompt.trim() || models.length === 0}
            class="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 transition-colors"
            title="Send Message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        {/if}
          </div>
        </div>
      </div>
      <div class="w-full text-center mt-2 opacity-50 text-[11px] font-medium tracking-wide">Use Shift + Enter to add a new line</div>
    </div>
    {/if}
  </main>
</div>
<ModelManager
  isOpen={isModelManagerOpen}
  onClose={() => { isModelManagerOpen = false; }}
  onModelSelect={(/** @type {string} */ model) => { selectedModel = model; }}
/>
