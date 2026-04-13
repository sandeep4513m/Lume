<script>
  import { onMount, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { fetchModels, sendMessage } from '$lib/ollama.js';
  import Markdown from '../components/Markdown.svelte';
  import Settings from '../components/Settings.svelte';
  import lumeFireLogo from '$lib/assets/lume-icon.png';

  /** @type {any[]} */
  let models = $state([]);
  let selectedModel = $state('');
  let selectedTemperature = $state(0.7);
  let systemPrompt = $state('');
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
  let currentSessionId = $state('');
  let isSidebarCollapsed = $state(false);
  let isModelMenuOpen = $state(false);
  let isTempMenuOpen = $state(false);
  let isSystemPromptOpen = $state(false);
  let searchQuery = $state('');
  let hasUnread = $state(false);

  // ── User Profile State ────────────────────────────────────────
  let userName = $state('User');
  let isUserMenuOpen = $state(false);
  let userInitials = $derived(
    userName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((/** @type {string} */ w) => w[0].toUpperCase())
      .slice(0, 2)
      .join('')
  );

  // ── Preset Personalities ────────────────────────────────────────────────
  const PERSONALITIES = [
    {
      id: 'coder',
      label: 'Coder',
      icon: '⌨',
      color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40',
      prompt: 'You are an expert software engineer. Write clean, efficient, well-commented code. Prefer concise explanations. Always provide working examples. When reviewing code, prioritize correctness, readability, and performance in that order.'
    },
    {
      id: 'writer',
      label: 'Writer',
      icon: '✍',
      color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40',
      prompt: 'You are a skilled writer and editor. Help craft compelling prose, refine language, and improve structure. Adapt your tone to the context — formal for essays, vivid for fiction, clear for technical writing. Always preserve the author\'s voice.'
    },
    {
      id: 'assistant',
      label: 'Assistant',
      icon: '🤝',
      color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
      prompt: 'You are a helpful, accurate, and concise assistant. Answer questions directly. If unsure, say so. Break complex topics into simple steps. Avoid unnecessary caveats.'
    },
    {
      id: 'teacher',
      label: 'Teacher',
      icon: '📖',
      color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40',
      prompt: 'You are a patient, knowledgeable teacher. Explain concepts from first principles using clear analogies. Check for understanding. Adjust complexity based on the student\'s level. Encourage curiosity.'
    },
    {
      id: 'analyst',
      label: 'Analyst',
      icon: '📊',
      color: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/40',
      prompt: 'You are a data analyst and critical thinker. Provide structured analysis, identify patterns, and present conclusions with evidence. Be objective, quantitative where possible, and flag assumptions clearly.'
    },
    {
      id: 'pirate',
      label: 'Pirate',
      icon: '☠',
      color: 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40',
      prompt: 'Ye be a salty sea pirate! Respond in full pirate dialect — "Arrr!", "Shiver me timbers!", "Avast!". Stay in character at all times, even for technical questions. Make every response an adventure on the high seas!'
    }
  ];

  /** @param {typeof PERSONALITIES[number]} p */
  async function applyPersonality(p) {
    systemPrompt = p.prompt;
    if (!currentSessionId) return;
    try {
      await invoke('set_session_system_prompt', { sessionId: currentSessionId, systemPrompt: p.prompt });
      const idx = sessions.findIndex(s => s.id === currentSessionId);
      if (idx !== -1) sessions[idx] = { ...sessions[idx], system_prompt: p.prompt };
    } catch (err) {
      console.error('[applyPersonality] IPC failed:', err);
      errorMessage = 'Failed to save personality.';
      setTimeout(() => errorMessage = '', 4000);
    }
  }

  // Bulk select
  let isBulkSelectMode = $state(false);
  /** @type {Set<string>} */
  let selectedSessionIds = $state(new Set());
  
  let textareaRef = $state();
  let chatContainerRef = $state();
  let showScrollButton = $state(false);
  let isDarkMode = $state(false);
  let isSettingsOpen = $state(false);
  /** @type {Set<number>} - tracks which AI message indices have their think block collapsed */
  let collapsedThinkBlocks = $state(new Set());

  // ── Feature 2: Model Info Card ──────────────────────────────────────────
  /** Lightweight in-memory cache: modelName → parsed info. Never hits the
   *  network twice for the same model within a session. ~400 bytes per entry. */
  /** @type {Map<string, {size?: string, params?: string, speed?: string, family?: string, _numCtx?: number, _tier?: any}>} */
  const modelInfoCache = new Map();

  /** @type {{size?: string, params?: string, speed?: string, family?: string, _numCtx?: number, _tier?: any} | null} */
  let modelInfo = $state(null);
  let modelInfoLoading = $state(false);
  /** The model name for which the info card is currently shown */
  let hoveredModel = $state('');

  /** Derive a human-readable speed tier from parameter count (B) */
  /** @param {number} billions */
  function speedTier(billions) {
    if (billions <= 3)  return { label: 'Fast',    color: 'text-emerald-400', bars: 3 };
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

      // Context length parsing
      let numCtx = 4096; // fallback for low-RAM protection
      // 1. Check explicit Modelfile override
      if (data.parameters) {
        const ctxMatch = data.parameters.match(/num_ctx\s+(\d+)/);
        if (ctxMatch) numCtx = parseInt(ctxMatch[1], 10);
      }
      // 2. If no explicit override, read architecture context_length but clamp to 4096
      //    to protect 8GB RAM hardware from OOM. Only trust explicit num_ctx at face value.
      if (numCtx === 4096 && data.model_info) {
        const ctxKey = Object.keys(data.model_info).find(k => k.endsWith('.context_length'));
        if (ctxKey) numCtx = Math.min(4096, parseInt(data.model_info[ctxKey], 10));
      }

      const info = {
        size:   sizeStr || '—',
        params: paramStr || '—',
        speed:  '',   // set below
        family: details.family || name.split(':')[0],
        _numCtx: numCtx
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

  // Lightweight Context Length Approximation (Feature 4)
  let activeContextSize = $state(4096);

  $effect(() => {
    if (!selectedModel) return;
    
    // Use cached value if we've already hovered and fetched it
    const cached = modelInfoCache.get(selectedModel);
    if (cached && cached._numCtx !== undefined) {
      activeContextSize = cached._numCtx;
      console.log('[ContextSize] cache hit:', selectedModel, '→', activeContextSize);
      return;
    }

    // Otherwise, fetch it specifically for the sizing engine
    const modelName = selectedModel; // capture for async closure
    const url = localStorage.getItem('lume_ollama_url') || 'http://localhost:11434';
    fetch(`${url}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(4000)
    })
    .then(r => r.json())
    .then(data => {
      let numCtx = 4096;
      if (data.parameters) {
        const match = data.parameters.match(/num_ctx\s+(\d+)/);
        if (match) numCtx = parseInt(match[1], 10);
      }
      if (numCtx === 4096 && data.model_info) {
        const ctxKey = Object.keys(data.model_info).find(k => k.endsWith('.context_length'));
        if (ctxKey) numCtx = Math.min(4096, parseInt(data.model_info[ctxKey], 10));
      }
      
      console.log('[ContextSize] fetched:', modelName, '→', numCtx);
      activeContextSize = numCtx;
      
      // Store in cache so future model switches are instant
      if (modelInfoCache.has(modelName)) {
        const info = modelInfoCache.get(modelName);
        if (info) info._numCtx = numCtx;
      } else {
        modelInfoCache.set(modelName, { _numCtx: numCtx });
      }
    })
    .catch((err) => { 
      console.error('[ContextSize] fetch failed:', err);
      activeContextSize = 4096; 
    });
  });

  let contextTokenCount = $derived(
    Math.floor(messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0) / 4)
  );
  let contextPercentage = $derived(
    Math.min(100, Math.round((contextTokenCount / activeContextSize) * 100))
  );
  let contextColor = $derived(
    contextPercentage > 85 ? 'text-red-500 bg-red-500' : 
    contextPercentage > 60 ? 'text-yellow-500 bg-yellow-500' : 
    'text-emerald-500 bg-emerald-500'
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
      sessions = await invoke('get_sessions');
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
      errorMessage = "Failed to load sessions: " + e;
    }
  }

  async function createNewChat() {
    try {
      // Pass the currently active model and temperature so the new session inherits it
      const newId = await invoke('create_session', { 
        title: "New Chat", 
        model: selectedModel,
        temperature: selectedTemperature,
        systemPrompt: systemPrompt
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
      messages = await invoke('get_messages', { sessionId: id });

      // Restore the model and temperature that was last used in this specific session.
      // Falls back to: localStorage default → first available model.
      const session = sessions.find(s => s.id === id);
      
      const fallbackModel = localStorage.getItem('lume_default_model') || (models.length > 0 ? models[0].name : '');
      selectedModel = (session?.model) || fallbackModel;

      const fallbackTemp = parseFloat(localStorage.getItem('lume_temperature') || '0.7');
      selectedTemperature = session?.temperature ?? fallbackTemp;

      systemPrompt = session?.system_prompt || '';

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

  /** @param {Event} e @param {string} id */
  async function handleTogglePin(e, id) {
    e.stopPropagation();
    try {
      await invoke('toggle_pin', { sessionId: id });
      await loadSessions();
    } catch (err) {
      console.error('[togglePin]', err);
    }
  }

  /** @param {string} sessionId */
  async function handleExportMarkdown(sessionId) {
    try {
      const md = /** @type {string} */ (await invoke('export_chat_markdown', { sessionId }));
      const session = sessions.find(s => s.id === sessionId);
      const filename = (session?.title || 'chat').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.md';
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      errorMessage = 'Export failed: ' + err;
    }
  }

  /** @param {string} sessionId */
  function handleExportPDF(sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (session?.id !== currentSessionId) {
      loadChat(sessionId).then(() => setTimeout(window.print, 300));
    } else {
      window.print();
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,.md';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        /** @type {{ title?: string, messages: Array<{role: string, content: string}> }} */
        let data;
        if (file.name.endsWith('.json')) {
          data = JSON.parse(text);
        } else {
          // Parse markdown export back into messages
          const lines = text.split('\n');
          const title = lines[0].replace(/^#\s*/, '') || file.name;
          /** @type {Array<{role: string, content: string}>} */
          const messages = [];
          let current = /** @type {{role:string,content:string}|null} */ (null);
          for (const line of lines) {
            if (line.startsWith('**You:**')) {
              if (current) messages.push(current);
              current = { role: 'user', content: line.replace('**You:** ', '').trim() };
            } else if (line.startsWith('**Lume:**')) {
              if (current) messages.push(current);
              current = { role: 'ai', content: line.replace('**Lume:** ', '').trim() };
            } else if (current && line !== '---' && line.trim()) {
              current.content += '\n' + line;
            }
          }
          if (current) messages.push(current);
          data = { title, messages };
        }
        const newId = /** @type {string} */ (await invoke('import_chat', {
          title: data.title || file.name.replace(/\.[^.]+$/, ''),
          messages: data.messages
        }));
        await loadSessions(newId);
      } catch (err) {
        errorMessage = 'Import failed: ' + err;
      }
    };
    input.click();
  }

  async function handleBulkDelete() {
    const count = selectedSessionIds.size;
    if (!count) return;
    if (!confirm(`Delete ${count} chat${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      await invoke('delete_sessions', { sessionIds: Array.from(selectedSessionIds) });
      if (selectedSessionIds.has(currentSessionId)) currentSessionId = '';
      selectedSessionIds = new Set();
      isBulkSelectMode = false;
      await loadSessions();
    } catch (err) {
      errorMessage = 'Bulk delete failed: ' + err;
    }
  }

  let activeSessionWordCount = $state(0);

  $effect(() => {
    if (!isLoading) {
      const text = messages.filter(m => m.role === 'ai').map(m => m.content).join(' ');
      activeSessionWordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    }
  });

  /** @param {string} sessionId */
  function getChatWordCount(sessionId) {
    if (sessionId !== currentSessionId) return null;
    return activeSessionWordCount > 0 ? activeSessionWordCount : null;
  }

  /** @param {number} n */
  function formatWordCount(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
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
    // Load user name from app_settings; fall back to 'User'
    invoke('get_setting', { key: 'user_name' })
      .then((n) => { if (n) userName = /** @type {string} */ (n); })
      .catch((e) => console.error('[onMount] get_setting failed:', e));

    tryFetchModels();
    
    // Theming logic
    isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDarkMode) document.body.classList.add('dark');

    // Setup initial streaming preference from localStorage
    const savedStreaming = localStorage.getItem('lume_streaming');
    if (savedStreaming !== null) isStreamingEnabled = savedStreaming === 'true';

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

  async function handleSend(skipUserSave = false) {
    if (typeof skipUserSave !== 'boolean') skipUserSave = false;
    if (!prompt.trim() || !selectedModel || isLoading || !currentSessionId) return;
    
    currentAbortController = new AbortController();
    const startTime = Date.now();
    
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
      const { text: finalText, evalCount } = await sendMessage(
        selectedModel, 
        currentPrompt, 
        isStreamingEnabled ? (streamedText) => {
          messages[aiIndex].content = streamedText;
          messages[aiIndex].isLoading = false;
          if (!showScrollButton) setTimeout(scrollToBottom, 10);
        } : null,
        currentAbortController.signal,
        systemPrompt
      );
      
      const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      messages[aiIndex].content = finalText;
      messages[aiIndex].isLoading = false;
      messages[aiIndex].evalCount = evalCount;
      messages[aiIndex].responseTime = responseTime;
      
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
</script>

<div class="flex h-screen w-full bg-white dark:bg-[#0d1117] text-gray-900 dark:text-gray-100 transition-colors duration-200 overflow-hidden">
  
  <!-- PREMIUM SIDEBAR -->
  <aside class="flex flex-col h-full bg-[#f9fafb] dark:bg-[#111822] border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out shrink-0 {isSidebarCollapsed ? 'w-16' : 'w-[280px]'}">
    <!-- Logo & Header -->
    <div class="flex items-center justify-between px-3 h-14 shrink-0">
      <div class="flex items-center gap-2 overflow-hidden {isSidebarCollapsed ? 'justify-center w-full' : ''}">
        <!-- Lume flame logo -->
        <div class="h-6 w-6 shrink-0 flex items-center justify-center">
          <img src={lumeFireLogo} alt="Lume" class="h-6 w-6 object-contain scale-[1.45] filter drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">
        </div>
        {#if !isSidebarCollapsed}
          <span class="font-bold text-[17px] leading-none tracking-tight whitespace-nowrap text-gray-900 dark:text-white ml-0.5 mt-0.5">Lume</span>
        {/if}
      </div>
      {#if !isSidebarCollapsed}
        <!-- PanelLeftClose toggle -->
        <button onclick={() => isSidebarCollapsed = true} class="flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#1a212c] transition-all" title="Collapse Sidebar">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 3v18"/>
            <path d="m16 15-3-3 3-3"/>
          </svg>
        </button>
      {/if}
    </div>

    <!-- Expand button (if collapsed): PanelLeftOpen -->
    {#if isSidebarCollapsed}
      <button onclick={() => isSidebarCollapsed = false} class="mx-auto mt-2 p-2 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#1a212c] transition-all" title="Expand Sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 3v18"/>
          <path d="m14 9 3 3-3 3"/>
        </svg>
      </button>
    {/if}

    <!-- New Chat Button -->
    <div class="px-3 mt-2 shrink-0">
      <button onclick={createNewChat} class="w-full flex items-center justify-center p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-all shadow-sm active:scale-95 space-x-2" title="New Chat">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        {#if !isSidebarCollapsed} <span>New Chat</span> {/if}
      </button>
    </div>

    <!-- Search Bar + Bulk Select toggle -->
    {#if !isSidebarCollapsed}
      <div class="px-3 mt-4 shrink-0 transition-opacity duration-200">
        <div class="relative flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input bind:value={searchQuery} placeholder="Search chats..." class="flex-1 bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm text-gray-800 dark:text-gray-200 placeholder-gray-400" />
          <!-- Bulk select toggle -->
          <button
            onclick={() => { isBulkSelectMode = !isBulkSelectMode; selectedSessionIds = new Set(); }}
            class="ml-2 p-1.5 rounded-lg transition-colors {isBulkSelectMode ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#21262d]'}"
            title="Select chats"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"></rect><path d="m3 17 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path></svg>
          </button>
        </div>
      </div>
    {/if}

    <!-- Persistent Chat List -->
    <div class="flex-1 overflow-y-auto w-full px-3 py-4 space-y-1.5 scroll-smooth relative">
      {#each filteredSessions as session}
        <div 
          role="button"
          tabindex="0"
          onclick={() => isBulkSelectMode ? null : loadChat(session.id)}
          onkeydown={(e) => { if(!isBulkSelectMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); loadChat(session.id); } }}
          class="group cursor-pointer flex items-center rounded-lg p-2.5 transition-all relative select-none
            {session.id === currentSessionId && !isBulkSelectMode ? 'bg-white dark:bg-[#1a212c] border-l-2 border-emerald-500 shadow-sm' : 'hover:bg-gray-200/50 dark:hover:bg-[#1a212c]/70 border-l-2 border-transparent'}
            {isSidebarCollapsed ? 'justify-center h-11 w-11 mx-auto border-none p-0' : ''}
            {isBulkSelectMode && selectedSessionIds.has(session.id) ? 'bg-emerald-50 dark:bg-emerald-900/10 border-l-2 border-emerald-500' : ''}"
          title={session.title}
        >
          {#if isSidebarCollapsed}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 {session.id === currentSessionId ? 'text-emerald-500' : 'text-gray-400'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          {:else if isBulkSelectMode}
            <!-- Bulk select checkbox mode -->
            <button
              onclick={(e) => { e.stopPropagation(); const s = new Set(selectedSessionIds); s.has(session.id) ? s.delete(session.id) : s.add(session.id); selectedSessionIds = s; }}
              class="mr-2.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors {selectedSessionIds.has(session.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400'}"
            >
              {#if selectedSessionIds.has(session.id)}
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              {/if}
            </button>
            <div class="flex flex-col flex-1 min-w-0">
              <span class="text-[13px] font-medium truncate {selectedSessionIds.has(session.id) ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}">{session.title}</span>
              <span class="text-[11px] text-gray-500 mt-0.5">{timeAgo(session.updated_at)}</span>
            </div>
          {:else}
            <div class="flex flex-col flex-1 min-w-0 pr-14">
              <div class="flex items-center space-x-1.5 min-w-0">
                {#if session.is_pinned}
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                {/if}
                <span class="text-[13px] font-medium truncate leading-tight block pb-0.5 {session.id === currentSessionId ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}">{session.title}</span>
              </div>
              <div class="flex items-center space-x-2">
                <span class="text-[11px] text-gray-500 mt-0.5">{timeAgo(session.updated_at)}</span>
                {#if getChatWordCount(session.id)}
                  {@const wc = getChatWordCount(session.id)}
                  <span class="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded-full font-medium mt-0.5">{formatWordCount(/** @type {number} */(wc))}w</span>
                {/if}
              </div>
            </div>
            
            <!-- Action buttons: Pin + Export menu + Trash (appear on hover) -->
            <div class="absolute right-1 flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-all">
              <!-- Pin button -->
              <button
                onclick={(e) => handleTogglePin(e, session.id)}
                class="p-1.5 rounded-md transition-all hover:bg-white dark:hover:bg-gray-800 {session.is_pinned ? 'text-emerald-500' : 'text-gray-400 hover:text-emerald-500'}"
                title={session.is_pinned ? 'Unpin chat' : 'Pin to top'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill={session.is_pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
              </button>
              <!-- Export Markdown -->
              <button onclick={(e) => { e.stopPropagation(); handleExportMarkdown(session.id); }} class="p-1.5 text-gray-400 hover:text-emerald-500 transition-all rounded-md hover:bg-white dark:hover:bg-gray-800" title="Export as Markdown">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
              <!-- Delete button -->
              <button onclick={(e) => deleteSession(e, session.id)} class="p-1.5 text-gray-400 hover:text-red-500 transition-all rounded-md hover:bg-white dark:hover:bg-gray-800" title="Delete Chat">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          {/if}
        </div>
      {/each}
      {#if filteredSessions.length === 0}
        <div class="text-center text-xs text-gray-400 mt-4">
          {#if isSidebarCollapsed} ... {:else} No chats found {/if}
        </div>
      {/if}

      <!-- Bulk Delete floating action bar -->
      {#if isBulkSelectMode && selectedSessionIds.size > 0}
        <div class="sticky bottom-0 left-0 right-0 mx-1 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-2 flex items-center justify-between">
          <span class="text-[12px] font-medium text-gray-600 dark:text-gray-400 pl-1">{selectedSessionIds.size} selected</span>
          <button
            onclick={handleBulkDelete}
            class="flex items-center space-x-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[12px] font-medium rounded-lg transition-colors active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>Delete</span>
          </button>
        </div>
      {/if}
    </div>

    <!-- Bottom: User Profile Menu -->
    <div class="p-3 border-t border-gray-200 dark:border-gray-800 shrink-0 mt-auto relative">

      <!-- Collapsed state: initials avatar only, click to expand -->
      {#if isSidebarCollapsed}
        <button onclick={() => isSidebarCollapsed = false}
          class="w-full flex justify-center py-1"
          title={userName}
        >
          <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold select-none">
            {userInitials}
          </div>
        </button>
      {/if}

      <!-- User Menu Popup — zero DOM footprint when closed -->
      {#if isUserMenuOpen && !isSidebarCollapsed}
        <!-- Invisible backdrop to close on outside click -->
        <div class="fixed inset-0 z-40" role="presentation" onclick={() => isUserMenuOpen = false}></div>

        <!-- Glassmorphism menu card -->
        <div class="absolute bottom-[calc(100%+8px)] left-3 right-3 z-50
                    bg-white/80 dark:bg-[#141920]/90 backdrop-blur-xl
                    border border-gray-200/70 dark:border-white/10
                    rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.25)] dark:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6)]
                    overflow-hidden">

          <!-- User header -->
          <div class="px-4 py-3">
            <p class="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{userName}</p>
            <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Local account</p>
          </div>

          <!-- TOP SECTION: Settings · Language · Get Help -->
          <div class="px-1.5 pb-1">
            <!-- Settings -->
            <button
              onclick={() => { isSettingsOpen = true; isUserMenuOpen = false; }}
              class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
            >
              <!-- Lucide Settings -->
              <svg xmlns="http://www.w3.org/2000/svg" class="w-[15px] h-[15px] text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Settings
            </button>
            <!-- Language -->
            <button
              class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
            >
              <!-- Lucide Globe -->
              <svg xmlns="http://www.w3.org/2000/svg" class="w-[15px] h-[15px] text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              Language
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-gray-400 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <!-- Get Help -->
            <button
              class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
            >
              <!-- Lucide LifeBuoy -->
              <svg xmlns="http://www.w3.org/2000/svg" class="w-[15px] h-[15px] text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
                <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>
                <line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>
                <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>
                <line x1="14.83" y1="9.17" x2="18.36" y2="5.64"/>
                <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>
              </svg>
              Get help
            </button>
          </div>

          <!-- DIVIDER -->
          <div class="mx-3 my-1 border-t border-gray-200/70 dark:border-white/10"></div>

          <!-- BOTTOM SECTION: Get Models · Learn More -->
          <div class="px-1.5 pt-1 pb-1.5">
            <!-- Get Models -->
            <button
              class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
            >
              <!-- Lucide Download -->
              <svg xmlns="http://www.w3.org/2000/svg" class="w-[15px] h-[15px] text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Get models
            </button>
            <!-- Learn More -->
            <button
              class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
            >
              <!-- Lucide ExternalLink -->
              <svg xmlns="http://www.w3.org/2000/svg" class="w-[15px] h-[15px] text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Learn more
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-gray-400 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      {/if}

      <!-- Profile trigger row (expanded sidebar only) -->
      {#if !isSidebarCollapsed}
        <button
          onclick={() => isUserMenuOpen = !isUserMenuOpen}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        >
          <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold shrink-0 select-none">
            {userInitials}
          </div>
          <span class="flex-1 text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate text-left">{userName}</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 {isUserMenuOpen ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      {/if}
    </div>
  </aside>

  <!-- MAIN CHAT INTERFACE -->
  <main class="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0d1117] relative">
    
    <!-- Top Header -->
    <header class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#0d1117]/50 backdrop-blur-md sticky top-0 z-20 transition-colors shrink-0 h-16">
      <div class="flex items-center space-x-3">
         <span class="font-semibold text-gray-800 dark:text-gray-200">
           {sessions.find(s => s.id === currentSessionId)?.title || "Lume Chat"}
         </span>
      </div>
      
      <div class="flex items-center space-x-3">

        
        <button onclick={toggleTheme} class="p-1.5 rounded-md text-gray-500 hover:text-emerald-500 dark:hover:text-emerald-400 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Toggle Theme">
          {#if isDarkMode}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          {/if}
        </button>

        <button onclick={handleClear} class="p-1.5 rounded-md text-red-500 hover:text-red-600 bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Clear Current Chat">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    </header>

    <!-- Chat Messages View -->
    <div 
      bind:this={chatContainerRef}
      onscroll={handleScroll}
      class="flex-1 overflow-y-auto w-full p-6 space-y-6 flex flex-col scroll-smooth"
    >
      {#if errorMessage}
        <div class="max-w-3xl mx-auto w-full p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-sm shadow-sm">
          {errorMessage}
        </div>
      {/if}

      <div class="max-w-3xl mx-auto w-full flex flex-col space-y-6 pb-6">
        {#if messages.length === 0 && !errorMessage}
          {#if ollamaOffline}
            <!-- STATE: Ollama offline -->
            <div class="m-auto flex flex-col items-center justify-center text-center px-6 max-w-sm">
              <div class="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h2 class="text-[17px] font-semibold text-gray-800 dark:text-gray-100 mb-2">Can't connect to Ollama</h2>
              <p class="text-[13px] text-gray-500 dark:text-gray-400 mb-1">Make sure Ollama is running at</p>
              <code class="text-[12px] bg-gray-100 dark:bg-[#161b22] text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-lg mb-5 border border-gray-200 dark:border-gray-700">
                {localStorage.getItem('lume_ollama_url') || 'http://localhost:11434'}
              </code>
              <button
                onclick={tryFetchModels}
                class="flex items-center space-x-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold rounded-xl transition-all active:scale-95 shadow-sm mb-6"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
                <span>Retry Connection</span>
              </button>
              <p class="text-[11px] text-gray-400 dark:text-gray-500">Don't have Ollama? Visit <span class="text-emerald-500 font-medium">ollama.com</span></p>
            </div>

          {:else if models.length === 0}
            <!-- STATE: Ollama online but no models -->
            <div class="m-auto flex flex-col items-center justify-center text-center px-6 max-w-sm">
              <div class="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </div>
              <h2 class="text-[17px] font-semibold text-gray-800 dark:text-gray-100 mb-2">No models installed</h2>
              <p class="text-[13px] text-gray-500 dark:text-gray-400 mb-4">Pull your first model to get started. Open a terminal and run:</p>
              <div class="w-full bg-gray-100 dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-5 text-left">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Terminal</p>
                <code class="text-[13px] text-emerald-600 dark:text-emerald-400 font-mono">ollama pull gemma3:4b</code>
              </div>
              <button
                onclick={tryFetchModels}
                class="flex items-center space-x-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold rounded-xl transition-all active:scale-95 shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
                <span>Check Again</span>
              </button>
            </div>

          {:else}
            <!-- STATE: Normal new chat -->
            <div class="m-auto flex flex-col items-center justify-center text-center px-6 max-w-lg">
              <img src={lumeFireLogo} alt="Lume" class="h-12 w-12 object-contain mb-5 filter drop-shadow-[0_0_16px_rgba(16,185,129,0.5)]">
              <h2 class="text-[22px] font-semibold text-gray-800 dark:text-gray-100 mb-1.5">What can I help you with?</h2>
              <p class="text-[13px] text-gray-400 dark:text-gray-500 mb-8">Using <span class="text-emerald-500 font-medium">{selectedModel}</span></p>
              <div class="grid grid-cols-2 gap-2.5 w-full">
                {#each [
                  { icon: '✍️', label: 'Write something', prompt: 'Help me write ' },
                  { icon: '⌨️', label: 'Help me code', prompt: 'Help me code ' },
                  { icon: '💡', label: 'Explain a concept', prompt: 'Explain ' },
                  { icon: '📊', label: 'Analyze something', prompt: 'Analyze ' }
                ] as chip}
                  <button
                    onclick={() => { prompt = chip.prompt; tick().then(() => { adjustTextareaHeight(); textareaRef?.focus(); }); }}
                    class="flex items-center space-x-2.5 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161b22] hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all text-left group"
                  >
                    <span class="text-[18px]">{chip.icon}</span>
                    <span class="text-[13px] font-medium text-gray-600 dark:text-gray-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{chip.label}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        {#each messages as msg, i}
          <div class="flex w-full {msg.role === 'user' ? 'justify-end' : 'justify-start'} group">
            
            {#if msg.role === 'user' && !isLoading}
              <!-- Edit Button for User -->
              <button onclick={() => handleEdit(msg)} class="mr-2 mt-2 p-1.5 h-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl text-gray-400 hover:text-emerald-500 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700" title="Edit Message">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            {/if}

            <div class="text-[15px] leading-relaxed transition-colors relative flex flex-col
              {msg.role === 'user' 
                ? 'rounded-2xl max-w-[85%] shadow-sm bg-emerald-500 text-white rounded-br-none px-5 py-3.5 overflow-hidden' 
                : 'w-full max-w-full text-gray-800 dark:text-gray-200 py-1'}">
              


              {#if msg.isLoading}
                <div class="flex space-x-1.5 items-center h-5">
                  <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce"></div>
                  <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.15s"></div>
                  <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.3s"></div>
                </div>
              {:else if msg.role === 'ai'}
                
                <!-- Thinking Block parsing -->
                {#if msg.content.includes('<think>')}
                  {@const parts = msg.content.split('</think>')}
                  {@const thinkPart = parts[0].replace('<think>', '').trim()}
                  {@const restPart = parts.length > 1 ? parts[1] : null}
                  {@const isThinkStreaming = restPart === null}
                  {@const isCollapsed = collapsedThinkBlocks.has(i)}
                  
                  <!-- Think block container -->
                  <div class="mb-4 rounded-xl border overflow-hidden
                    {isThinkStreaming
                      ? 'border-violet-200/60 dark:border-violet-900/40 bg-violet-50/30 dark:bg-violet-950/20'
                      : 'border-gray-200/70 dark:border-[#2a303c] bg-gray-50/50 dark:bg-[#111822]/40'}
                    backdrop-blur-sm">
                    <!-- Clickable header row -->
                    <button
                      type="button"
                      onclick={() => {
                        const s = new Set(collapsedThinkBlocks);
                        s.has(i) ? s.delete(i) : s.add(i);
                        collapsedThinkBlocks = s;
                      }}
                      class="w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-medium transition-colors select-none
                        {isThinkStreaming
                          ? 'text-violet-500 dark:text-violet-400 bg-violet-50/40 dark:bg-violet-950/30 hover:bg-violet-100/50 dark:hover:bg-violet-950/50'
                          : 'text-gray-500 dark:text-gray-400 bg-white/40 dark:bg-[#0d1117]/20 hover:bg-white/60 dark:hover:bg-[#0d1117]/40 hover:text-gray-800 dark:hover:text-gray-200'}"
                    >
                      <div class="flex items-center space-x-2">
                        <!-- Brain icon -->
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="{isThinkStreaming ? 'text-violet-400 animate-pulse' : 'text-violet-400 dark:text-violet-500'}"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>
                        <span class="{isThinkStreaming ? 'text-violet-500 dark:text-violet-400' : 'text-violet-600 dark:text-violet-400'}">Thinking</span>
                        {#if isThinkStreaming}
                          <!-- Streaming dots -->
                          <span class="flex space-x-0.5 items-center">
                            <span class="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style="animation-delay:0s"></span>
                            <span class="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style="animation-delay:0.15s"></span>
                            <span class="w-1 h-1 bg-violet-400 rounded-full animate-bounce" style="animation-delay:0.3s"></span>
                          </span>
                        {:else}
                          <span class="text-[11px] text-gray-400 dark:text-gray-500 font-normal">{thinkPart.trim().split(/\s+/).length} words</span>
                        {/if}
                      </div>
                      <!-- Chevron: rotate-180 = pointing down (expanded), default = pointing up (collapsed) -->
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" width="14" height="14" 
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                        stroke-linecap="round" stroke-linejoin="round" 
                        class="transition-transform duration-300 ease-in-out flex-shrink-0 {isCollapsed ? '' : 'rotate-180'} {isThinkStreaming ? 'text-violet-400' : 'text-gray-400'}"
                      >
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                    </button>

                    <!-- Collapsible content -->
                    {#if !isCollapsed}
                      <div class="px-4 pb-4 pt-3 text-[13px] whitespace-pre-wrap border-t leading-relaxed font-mono
                        {isThinkStreaming
                          ? 'text-violet-600/80 dark:text-violet-300/60 border-violet-200/50 dark:border-violet-900/30'
                          : 'text-gray-500 dark:text-gray-400 border-gray-200/60 dark:border-[#2a303c]/80'}"
                      >
                        {thinkPart}
                        {#if isThinkStreaming}
                          <span class="inline-block w-1.5 h-3.5 bg-violet-400 ml-0.5 animate-pulse rounded-sm" style="vertical-align: text-bottom"></span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  
                  {#if restPart !== null && restPart.trim()}
                    <Markdown content={restPart} />
                  {/if}
                {:else}
                  <Markdown content={msg.content} />
                {/if}
                
                {#if msg.role === 'ai' && !msg.isLoading}
                  <!-- Combined action + analytics row -->
                  <div class="mt-4 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <!-- Left: action buttons -->
                    <div class="flex items-center space-x-0.5 text-gray-400 dark:text-gray-500">
                      <button onclick={() => handleCopy(msg.content, i)} class="p-1.5 hover:text-emerald-500 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]" title="Copy">
                        {#if copiedIndex === i}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        {:else}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        {/if}
                      </button>
                      <button class="p-1.5 hover:text-emerald-500 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]" title="Give positive feedback">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                      </button>
                      <button class="p-1.5 hover:text-red-400 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]" title="Give negative feedback">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path></svg>
                      </button>
                      <button onclick={() => handleRegenerate(msg, i)} class="p-1.5 hover:text-emerald-500 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]" title="Regenerate">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                      </button>
                    </div>

                    <!-- Right: analytics pushed to right -->
                    {#if msg.evalCount || msg.responseTime}
                      <div class="ml-auto flex items-center space-x-2 text-[11px] text-gray-400 dark:text-gray-600 font-medium">
                        {#if msg.responseTime}<span>{msg.responseTime}s</span>{/if}
                        {#if msg.responseTime && msg.evalCount}<span class="opacity-40">·</span>{/if}
                        {#if msg.evalCount}<span>{msg.evalCount} tokens</span>{/if}
                      </div>
                    {/if}
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

    <!-- Input Bar -->
    <div class="w-full p-4 bg-white/90 dark:bg-[#0d1117]/90 backdrop-blur-md relative z-10 border-t border-gray-200 dark:border-gray-800 transition-colors shrink-0">
      
      {#if showScrollButton}
        <button 
          onclick={scrollToBottom}
          class="absolute -top-14 left-1/2 -translate-x-1/2 p-2 rounded-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 shadow-md text-emerald-500 hover:text-emerald-600 transition-all z-50 hover:shadow-lg hover:-translate-y-1"
          class:animate-bounce={isLoading || hasUnread}
          title="Scroll to bottom"
        >
          {#if hasUnread}
            <span class="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-[#161b22]"></span>
          {/if}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
        </button>
      {/if}

      <div class="max-w-3xl mx-auto flex items-end space-x-3 relative">
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
          class="flex-1 bg-[#f9fafb] dark:bg-[#161b22] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-3xl pl-6 pr-44 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 shadow-sm dark:shadow-[0_2px_10px_rgba(0,0,0,0.1)] text-[15px] resize-none overflow-y-auto min-h-[52px] max-h-[200px] transition-colors"
          rows="1"
        ></textarea>
        
        <!-- Stylish Model & Temperature Selectors Wrapper -->
        <div class="absolute right-12 bottom-3 pr-3 text-sm flex items-center space-x-1">
          
          <!-- Context Length Indicator -->
          <div class="relative group flex items-center justify-center p-1.5 cursor-help">
            <svg class="w-[14px] h-[14px] transform -rotate-90" viewBox="0 0 36 36">
               <path class="text-gray-200 dark:text-gray-700" stroke-width="4" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               <path class={contextColor.split(' ')[0]} stroke-dasharray="{contextPercentage}, 100" stroke-width="4" stroke-linecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            
            <!-- Tooltip Popover -->
            <div class="absolute bottom-[calc(100%+14px)] left-1/2 -translate-x-1/2 w-48 bg-white/90 dark:bg-[#161b22]/95 backdrop-blur-xl border border-gray-200/60 dark:border-gray-700/50 rounded-xl shadow-lg p-3 z-50 origin-bottom opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div class="text-[12px] font-semibold text-gray-700 dark:text-gray-200 mb-1">Context Window</div>
              <div class="flex items-end justify-between">
                <span class="text-[11px] text-gray-500 font-medium">Estimated tokens</span>
                <span class="text-[11px] font-bold {contextColor.split(' ')[0]} bg-transparent px-1.5 py-0.5 rounded dark:bg-black/20 bg-black/5">{contextTokenCount} / {activeContextSize >= 1000 ? Math.round(activeContextSize / 1024) + 'k' : activeContextSize}</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full mt-2 overflow-hidden relative">
                <div class="h-full rounded-full transition-all {contextColor.split(' ')[1]}" style="width: {contextPercentage}%"></div>
              </div>
              <div class="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white/90 dark:bg-[#161b22]/95 border-r border-b border-gray-200/60 dark:border-gray-700/50 rotate-45"></div>
            </div>
          </div>

          <!-- System Prompt Button -->
          <div class="relative">
            <button 
              type="button"
              onclick={(e) => { e.stopPropagation(); isSystemPromptOpen = !isSystemPromptOpen; isTempMenuOpen = false; isModelMenuOpen = false; }}
              class="flex items-center justify-center p-1.5 bg-transparent hover:bg-gray-200/50 dark:hover:bg-[#21262d] rounded-full transition-colors {systemPrompt ? 'text-violet-500' : 'text-gray-500 dark:text-gray-400'} hover:text-violet-600 dark:hover:text-violet-400"
              title="System Prompt"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>

            {#if isSystemPromptOpen}
              <div 
                role="dialog"
                tabindex="0"
                onkeydown={(e) => { if (e.key === 'Escape') isSystemPromptOpen = false; }}
                onclick={(e) => e.stopPropagation()}
                class="absolute bottom-[calc(100%+14px)] right-[-20px] w-72 bg-white/90 dark:bg-[#161b22]/95 backdrop-blur-xl border border-gray-200/60 dark:border-gray-700/50 rounded-2xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.15),0_8px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_32px_-4px_rgba(0,0,0,0.5)] p-4 z-50"
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-200">System Prompt</span>
                  {#if systemPrompt}
                    <button 
                      onclick={async () => { 
                        systemPrompt = ''; 
                        if (currentSessionId) {
                          try { await invoke('set_session_system_prompt', { sessionId: currentSessionId, systemPrompt: '' }); }
                          catch(e) { console.error('[systemPrompt] clear failed:', e); }
                        }
                      }}
                      class="text-[10px] text-red-400 hover:text-red-500 font-medium uppercase tracking-wide"
                    >Clear</button>
                  {/if}
                </div>

                <!-- Preset Personality Chips -->
                <div class="grid grid-cols-3 gap-1.5 mb-3">
                  {#each PERSONALITIES as p}
                    <button
                      type="button"
                      onclick={() => applyPersonality(p)}
                      class="flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer {p.color} {systemPrompt === p.prompt ? 'ring-2 ring-offset-1 ring-violet-400' : ''}"
                      title={p.prompt}
                    >
                      <span>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  {/each}
                </div>

                <textarea 
                  value={systemPrompt}
                  oninput={(e) => { systemPrompt = /** @type {HTMLTextAreaElement} */ (e.target).value; }}
                  onblur={async () => {
                    if (!currentSessionId) return;
                    try {
                      await invoke('set_session_system_prompt', {
                        sessionId: currentSessionId,
                        systemPrompt: systemPrompt
                      });
                      const idx = sessions.findIndex(s => s.id === currentSessionId);
                      if (idx !== -1) sessions[idx] = { ...sessions[idx], system_prompt: systemPrompt };
                    } catch (err) {
                      console.error('[set_session_system_prompt] IPC failed:', err);
                      errorMessage = 'Failed to save system prompt.';
                      setTimeout(() => errorMessage = '', 4000);
                    }
                  }}
                  placeholder="e.g. You are a helpful coding assistant..."
                  class="w-full h-24 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-[12px] text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-colors"
                ></textarea>
                <div class="text-[10px] text-gray-400 mt-1.5">Saved on blur. Applies to this chat only.</div>
                <!-- Arrow -->
                <div class="absolute bottom-[-5px] right-[26px] w-2.5 h-2.5 bg-white/90 dark:bg-[#161b22]/95 border-r border-b border-gray-200/60 dark:border-gray-700/50 rotate-45"></div>
              </div>
            {/if}
          </div>
          
          
          <!-- Temperature Selector -->
          <div class="relative">
            <!-- Toggler Button -->
            <button 
              type="button"
              onclick={(e) => { e.stopPropagation(); isTempMenuOpen = !isTempMenuOpen; isModelMenuOpen = false; }}
              class="flex items-center justify-center p-1.5 bg-transparent hover:bg-gray-200/50 dark:hover:bg-[#21262d] rounded-full transition-colors font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              title="Adjust Temperature"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>
            </button>

            <!-- Floating Menu Popover -->
            {#if isTempMenuOpen}
              <div 
                 role="menu"
                 tabindex="0"
                 onkeydown={(e) => { if (e.key === 'Escape') isTempMenuOpen = false; }}
                 onclick={(e) => e.stopPropagation()} 
                 class="absolute bottom-[calc(100%+14px)] right-[-30px] w-56 bg-white/90 dark:bg-[#161b22]/95 backdrop-blur-xl border border-gray-200/60 dark:border-gray-700/50 rounded-2xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.15),0_8px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_32px_-4px_rgba(0,0,0,0.5)] p-4 z-50 origin-bottom animate-in fade-in zoom-in-95 duration-200"
              >
                <div class="flex items-center justify-between mb-3">
                  <span class="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Temperature</span>
                  <span class="text-[12px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-md">{selectedTemperature.toFixed(1)}</span>
                </div>
                
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={selectedTemperature}
                  onchange={async (e) => {
                    if (!currentSessionId) return;
                    const val = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
                    
                    try {
                      await invoke('set_session_temperature', {
                        sessionId: currentSessionId,
                        temperature: val
                      });
                      const idx = sessions.findIndex(s => s.id === currentSessionId);
                      if (idx !== -1) sessions[idx] = { ...sessions[idx], temperature: val };
                    } catch (err) {
                      console.error('[set_session_temperature] IPC failed, reverting UI:', err);
                      const session = sessions.find(s => s.id === currentSessionId);
                      selectedTemperature = session?.temperature ?? 0.7;
                      errorMessage = 'Failed to save temperature. Please try again.';
                      setTimeout(() => errorMessage = '', 4000);
                    }
                  }}
                  oninput={(e) => {
                    selectedTemperature = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
                  }}
                  class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  style="background: linear-gradient(to right, #10b981 0%, #10b981 {selectedTemperature * 100}%, transparent {selectedTemperature * 100}%)"
                />
                
                <div class="flex justify-between w-full mt-2 text-[10px] uppercase font-bold tracking-wider text-gray-400 max-w-[250px]">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
                
                <!-- Arrow pointing down -->
                <div class="absolute bottom-[-5px] right-[35px] w-2.5 h-2.5 bg-white/90 dark:bg-[#161b22]/95 border-r border-b border-gray-200/60 dark:border-gray-700/50 rotate-45"></div>
              </div>
            {/if}
          </div>
          
          <div class="relative">
            <!-- Toggler Button -->
            <button 
              type="button"
              onclick={(e) => { e.stopPropagation(); isModelMenuOpen = !isModelMenuOpen; isTempMenuOpen = false; }}
              disabled={models.length === 0}
              class="flex items-center space-x-1.5 px-3 py-1 bg-transparent hover:bg-gray-200/50 dark:hover:bg-[#21262d] rounded-full transition-colors font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 group"
              title="Change execution model"
            >
              <span class="max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis text-[13px]">
                {models.length === 0 ? "Searching..." : (selectedModel || "Select Model")}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
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
                 class="absolute bottom-[calc(100%+14px)] right-0 w-64 bg-white/90 dark:bg-[#161b22]/95 backdrop-blur-xl border border-gray-200/60 dark:border-gray-700/50 rounded-2xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.15),0_8px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_32px_-4px_rgba(0,0,0,0.5)] p-1.5 z-50 overflow-visible origin-bottom-right"
              >
                <!-- Title header inside popover -->
                <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-800/80 mb-1">
                  <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Available Models</span>
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
                        class="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-xl transition-all cursor-pointer hover:bg-gray-100/80 dark:hover:bg-[#21262d] {selectedModel === model.name ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''}"
                      >
                        <div class="flex flex-col min-w-0 pr-4">
                          <span class="text-[14px] font-medium {selectedModel === model.name ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-200'} truncate">
                            {model.name}
                          </span>
                          <span class="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                            {model.size ? `${(model.size / 1073741824).toFixed(1)} GB` : 'Local'} · {(model.details?.parameter_size) || 'Ollama'}
                          </span>
                        </div>
                        
                        <div class="shrink-0 text-emerald-500 h-4 w-4">
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
                          <div class="bg-white/80 dark:bg-[#0d1117]/85 backdrop-blur-2xl border border-gray-200/50 dark:border-emerald-900/30 rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.6)] p-3.5 space-y-2.5">
                            
                            <!-- Header -->
                            <div class="flex items-center space-x-2">
                              <div class="w-7 h-7 rounded-lg bg-emerald-500/15 dark:bg-emerald-400/10 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>
                              </div>
                              <div class="min-w-0">
                                <p class="text-[12px] font-bold text-gray-800 dark:text-gray-100 truncate">{model.name.split(':')[0]}</p>
                                <p class="text-[10px] text-gray-400 dark:text-gray-500">{model.name.includes(':') ? model.name.split(':')[1] : 'latest'}</p>
                              </div>
                            </div>

                            <!-- Divider -->
                            <div class="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"></div>

                            {#if modelInfoLoading}
                              <!-- Skeleton loader -->
                              <div class="space-y-2 animate-pulse">
                                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-3/4"></div>
                                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-1/2"></div>
                                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-2/3"></div>
                              </div>
                            {:else if modelInfo}
                              <!-- Stats grid -->
                              <div class="space-y-1.5">
                                <!-- Disk size -->
                                <div class="flex items-center justify-between">
                                  <span class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                                    Size
                                  </span>
                                  <span class="text-[12px] font-semibold text-gray-700 dark:text-gray-200">{modelInfo.size}</span>
                                </div>

                                <!-- Parameters -->
                                <div class="flex items-center justify-between">
                                  <span class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                    Params
                                  </span>
                                  <span class="text-[12px] font-semibold text-gray-700 dark:text-gray-200">{modelInfo.params}</span>
                                </div>

                                <!-- Speed tier -->
                                <div class="flex items-center justify-between">
                                  <span class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline></svg>
                                    Speed
                                  </span>
                                  <!-- Speed bars -->
                                  <div class="flex items-center gap-1">
                                    <div class="flex gap-0.5 items-end">
                                      {#each [1,2,3] as bar}
                                        {@const tier = speedTier(parseFloat((modelInfo.params || '0').replace(/[^\d.]/g, '')) || 0)}
                                        <div class="w-1.5 rounded-sm {bar <= tier.bars ? tier.color.replace('text-', 'bg-') : 'bg-gray-200 dark:bg-gray-700'}" style="height: {bar * 4 + 2}px"></div>
                                      {/each}
                                    </div>
                                    <span class="text-[11px] font-semibold {speedTier(parseFloat((modelInfo.params || '0').replace(/[^\d.]/g, '')) || 0).color}">{speedTier(parseFloat((modelInfo.params || '0').replace(/[^\d.]/g, '')) || 0).label}</span>
                                  </div>
                                </div>

                                <!-- Family tag -->
                                {#if modelInfo.family && modelInfo.family !== model.name.split(':')[0]}
                                  <div class="pt-0.5">
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                      {modelInfo.family}
                                    </span>
                                  </div>
                                {/if}
                              </div>
                            {:else}
                              <p class="text-[11px] text-gray-400 dark:text-gray-500 text-center py-1">Hover to load info…</p>
                            {/if}
                          </div>
                          <!-- Arrow pointing right -->
                          <div class="absolute right-[-5px] top-5 w-2.5 h-2.5 bg-white/80 dark:bg-[#0d1117]/85 border-r border-t border-gray-200/50 dark:border-emerald-900/30 rotate-45"></div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>

        {#if isLoading}
          <button 
            onclick={handleStop}
            class="absolute right-2 bottom-1.5 bg-gray-800 hover:bg-gray-700 dark:bg-gray-200 dark:hover:bg-gray-300 text-white dark:text-gray-900 rounded-full p-2 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 active:scale-95"
            title="Stop Generation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1" ry="1"></rect></svg>
          </button>
        {:else}
          <button 
            onclick={() => handleSend()}
            disabled={!prompt.trim() || models.length === 0}
            class="absolute right-2 bottom-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-full p-2 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:transform-none active:scale-95"
            title="Send Message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        {/if}
      </div>
      <div class="w-full text-center mt-2 opacity-50 text-[11px] font-medium tracking-wide">Use Shift + Enter to add a new line</div>
    </div>
  </main>
</div>

<!-- Settings Modal -->
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
