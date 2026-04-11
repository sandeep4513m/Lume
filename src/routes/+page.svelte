<script>
  import { onMount, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { fetchModels, sendMessage } from '$lib/ollama.js';
  import Markdown from '../components/Markdown.svelte';

  let models = $state([]);
  let selectedModel = $state('');
  let prompt = $state('');
  let messages = $state([]); 
  let isLoading = $state(false);
  let errorMessage = $state('');
  let copiedIndex = $state(-1);
  
  let currentAbortController = $state(null);
  let isStreamingEnabled = $state(true);

  // Sidebar Multi-Session State
  let sessions = $state([]);
  let currentSessionId = $state('');
  let isSidebarCollapsed = $state(false);
  let searchQuery = $state('');
  let hasUnread = $state(false);
  
  let textareaRef = $state();
  let chatContainerRef = $state();
  let showScrollButton = $state(false);
  let isDarkMode = $state(false);

  // Derived filtered results
  let filteredSessions = $derived(
    sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  function timeAgo(timestamp) {
    const seconds = Math.floor(Date.now() / 1000) - timestamp;
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  }

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
      const newId = await invoke('create_session', { title: "New Chat" });
      currentSessionId = newId;
      messages = [];
      await loadSessions(newId);
    } catch(e) {
      errorMessage = "Error creating chat: " + e;
    }
  }

  async function loadChat(id) {
    currentSessionId = id;
    prompt = '';
    isLoading = false;
    errorMessage = '';
    try {
      messages = await invoke('get_messages', { sessionId: id });
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      console.error('[loadChat]', e);
      errorMessage = 'Failed to load messages: ' + e;
    }
  }

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

  onMount(async () => {
    errorMessage = '';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDarkMode = true;
      document.body.classList.add('dark');
    }

    const savedStreaming = localStorage.getItem('lume_streaming');
    if (savedStreaming !== null) isStreamingEnabled = savedStreaming === 'true';

    await loadSessions();

    const fetchedModels = await fetchModels();
    models = fetchedModels;
    if (models.length > 0) { selectedModel = models[0].name; } 
    else { errorMessage = "No models found. Is Ollama running?"; }
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

  async function handleSend() {
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
    
    messages.push({ role: 'user', content: currentPrompt });
    const userMsgIndex = messages.length - 1;
    
    invoke('save_message', { sessionId: currentSessionId, role: 'user', content: currentPrompt })
      .then((id) => {
         messages[userMsgIndex].id = id;
         messages[userMsgIndex].created_at = Date.now() / 1000;
         loadSessions(currentSessionId);
      })
      .catch(console.error);
    
    const aiIndex = messages.length;
    messages.push({ role: 'ai', content: '', isLoading: true });
    messages = messages; 
    if (showScrollButton) hasUnread = true;
    
    try {
      const { text: finalText, evalCount } = await sendMessage(
        selectedModel, 
        currentPrompt, 
        isStreamingEnabled ? (streamedText) => {
          messages[aiIndex] = { role: 'ai', content: streamedText, isLoading: false };
          messages = messages; 
          if (!showScrollButton) setTimeout(scrollToBottom, 10);
        } : null,
        currentAbortController.signal
      );
      
      const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      messages[aiIndex] = { role: 'ai', content: finalText, isLoading: false, evalCount, responseTime };
      messages = messages;
      
      invoke('save_message', { sessionId: currentSessionId, role: 'ai', content: finalText })
        .then((id) => {
           messages[aiIndex].id = id;
           messages[aiIndex].created_at = Date.now() / 1000;
           loadSessions(currentSessionId);
        })
        .catch(console.error);
    } catch (error) {
      if (error.name === 'AbortError') {
        const partialText = messages[aiIndex].content;
        messages[aiIndex].isLoading = false;
        messages = messages;
        if (partialText) {
            invoke('save_message', { sessionId: currentSessionId, role: 'ai', content: partialText });
        } else {
            messages = messages.filter((_, i) => i !== aiIndex);
        }
      } else {
        errorMessage = "Error communicating with Ollama: " + error.message;
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

  function handleCopy(text, i) {
    navigator.clipboard.writeText(text);
    copiedIndex = i;
    setTimeout(() => copiedIndex = -1, 2000);
  }

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

  async function handleRegenerate(msg, idx) {
    if (!msg.id || isLoading) return;
    
    const promptMsg = messages[idx - 1];
    if (!promptMsg || promptMsg.role !== 'user') return;
    
    prompt = promptMsg.content;
    
    try {
      await invoke('delete_message', { messageId: msg.id });
      messages = messages.filter(m => m.id !== msg.id);
      await handleSend();
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
    <div class="flex items-center justify-between p-4 h-16 shrink-0">
      <div class="flex items-center space-x-2 overflow-hidden {isSidebarCollapsed ? 'justify-center w-full' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        {#if !isSidebarCollapsed}
          <span class="font-bold text-lg tracking-tight whitespace-nowrap text-emerald-500">Lume</span>
        {/if}
      </div>
      {#if !isSidebarCollapsed}
        <button onclick={() => isSidebarCollapsed = true} class="p-1.5 rounded-md text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#1a212c] transition-all" title="Collapse Sidebar">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
      {/if}
    </div>

    <!-- Expand button (if collapsed) -->
    {#if isSidebarCollapsed}
      <button onclick={() => isSidebarCollapsed = false} class="mx-auto mt-2 p-2 rounded-md text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#1a212c] transition-all" title="Expand Sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><polyline points="12 5 19 12 12 19"></polyline></svg>
      </button>
    {/if}

    <!-- New Chat Button -->
    <div class="px-3 mt-2 shrink-0">
      <button onclick={createNewChat} class="w-full flex items-center justify-center p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-all shadow-sm active:scale-95 space-x-2" title="New Chat">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        {#if !isSidebarCollapsed} <span>New Chat</span> {/if}
      </button>
    </div>

    <!-- Search Bar -->
    {#if !isSidebarCollapsed}
      <div class="px-3 mt-4 shrink-0 transition-opacity duration-200">
        <div class="relative">
          <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input bind:value={searchQuery} placeholder="Search chats..." class="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm text-gray-800 dark:text-gray-200 placeholder-gray-400" />
        </div>
      </div>
    {/if}

    <!-- Persistent Chat List -->
    <div class="flex-1 overflow-y-auto w-full px-3 py-4 space-y-1.5 scroll-smooth">
      {#each filteredSessions as session}
        <div 
          onclick={() => loadChat(session.id)}
          class="group cursor-pointer flex items-center rounded-lg p-2.5 transition-all relative select-none
            {session.id === currentSessionId ? 'bg-white dark:bg-[#1a212c] border-l-2 border-emerald-500 shadow-sm' : 'hover:bg-gray-200/50 dark:hover:bg-[#1a212c]/70 border-l-2 border-transparent'}
            {isSidebarCollapsed ? 'justify-center h-11 w-11 mx-auto border-none p-0' : ''}"
          title={session.title}
        >
          {#if isSidebarCollapsed}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 {session.id === currentSessionId ? 'text-emerald-500' : 'text-gray-400'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          {:else}
            <div class="flex flex-col flex-1 min-w-0 pr-6">
              <span class="text-[13px] font-medium truncate leading-tight block pb-0.5 {session.id === currentSessionId ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}">{session.title}</span>
              <span class="text-[11px] text-gray-500 truncate mt-0.5">{timeAgo(session.updated_at)}</span>
            </div>
            
            <!-- Trash Icon on Hover -->
            <button onclick={(e) => deleteSession(e, session.id)} class="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 transition-all rounded-md hover:bg-white dark:hover:bg-gray-800 shadow-sm" title="Delete Chat">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          {/if}
        </div>
      {/each}
      {#if filteredSessions.length === 0}
        <div class="text-center text-xs text-gray-400 mt-4">
          {#if isSidebarCollapsed} ... {:else} No chats found {/if}
        </div>
      {/if}
    </div>

    <!-- Bottom Settings & Model Indicator -->
    <div class="p-3 border-t border-gray-200 dark:border-gray-800 shrink-0 flex flex-col space-y-2 mt-auto">
      
      <!-- Tiny Model Indicator Display inside sidebar -->
      <div class="w-full flex items-center {isSidebarCollapsed ? 'justify-center' : 'space-x-3 px-3'} py-2.5 text-emerald-600 dark:text-emerald-500 rounded-lg transition-colors cursor-pointer" title="Current Model: {selectedModel || 'Loading'}">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        {#if !isSidebarCollapsed} <span class="text-xs font-semibold truncate uppercase tracking-widest">{selectedModel || 'No Model'}</span> {/if}
      </div>

      <button class="w-full flex items-center {isSidebarCollapsed ? 'justify-center' : 'space-x-3 px-3'} py-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-[#1a212c] rounded-lg transition-colors cursor-pointer" title="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        {#if !isSidebarCollapsed} <span class="text-sm font-medium">Settings</span> {/if}
      </button>
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
        <!-- Model Selection Dropdown -->
        <select 
          bind:value={selectedModel}
          disabled={models.length === 0}
          class="bg-gray-50 dark:bg-[#161b22] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
        >
          {#if models.length === 0}
            <option value="">Searching...</option>
          {/if}
          {#each models as model}
            <option value={model.name}>{model.name}</option>
          {/each}
        </select>
        
        <div class="h-4 w-px bg-gray-300 dark:bg-gray-700 mx-1"></div>
        
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
          <div class="m-auto flex flex-col items-center justify-center opacity-40 pt-24">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <p class="text-[15px] font-medium">Hello there. How can I help you today?</p>
          </div>
        {/if}

        {#each messages as msg, i}
          <div class="flex w-full {msg.role === 'user' ? 'justify-end' : 'justify-start'} group">
            
            {#if msg.role === 'user' && !isLoading}
              <!-- Edit Button for User -->
              <button onclick={() => handleEdit(msg)} class="mr-2 mt-2 p-1.5 h-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl text-gray-400 hover:text-emerald-500 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700" title="Edit Message">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            {/if}

            <div class="rounded-2xl max-w-[85%] shadow-sm text-[15px] leading-relaxed overflow-hidden transition-colors relative
              {msg.role === 'user' 
                ? 'bg-emerald-500 text-white rounded-br-none px-5 py-3.5' 
                : 'bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-bl-none px-6 py-5'}">
              
              {#if msg.role === 'ai' && !msg.isLoading}
                <!-- AI Utilities: Copy & Regenerate -->
                <div class="absolute top-3 right-3 flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onclick={() => handleCopy(msg.content, i)} class="p-1.5 bg-white/80 dark:bg-gray-800/80 rounded-md backdrop-blur-sm border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 shadow-sm" title="Copy Message">
                    {#if copiedIndex === i}
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    {/if}
                  </button>
                  <button onclick={() => handleRegenerate(msg, i)} class="p-1.5 bg-white/80 dark:bg-gray-800/80 rounded-md backdrop-blur-sm border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-emerald-500 shadow-sm" title="Regenerate Response">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                  </button>
                </div>
              {/if}

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
                  {@const restPart = parts[1] || ''}
                  
                  <details class="mb-4 border border-gray-200 dark:border-[#2a303c] rounded-xl bg-gray-50 dark:bg-[#111822]/50 overflow-hidden">
                    <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors select-none flex items-center space-x-2 bg-white/50 dark:bg-[#0d1117]/30">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>
                      <span>Thinking Process</span>
                    </summary>
                    <div class="px-4 pb-4 pt-2 text-[14px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap border-t border-gray-200 dark:border-[#2a303c]">
                      {thinkPart}
                    </div>
                  </details>
                  
                  {#if restPart.trim()}
                    <Markdown content={restPart} />
                  {/if}
                {:else}
                  <Markdown content={msg.content} />
                {/if}

                <!-- Analytics Footer -->
                {#if msg.evalCount || msg.responseTime}
                  <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800/80 flex space-x-3 text-[11px] text-gray-400 dark:text-gray-500 font-medium tracking-wide">
                    {#if msg.responseTime}<span>Answered in {msg.responseTime}s</span>{/if}
                    {#if msg.responseTime && msg.evalCount}<span class="opacity-30">•</span>{/if}
                    {#if msg.evalCount}<span>{msg.evalCount} tokens</span>{/if}
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
          class="flex-1 bg-[#f9fafb] dark:bg-[#161b22] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-3xl pl-6 pr-14 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 shadow-sm dark:shadow-[0_2px_10px_rgba(0,0,0,0.1)] text-[15px] resize-none overflow-y-auto min-h-[52px] max-h-[200px] transition-colors"
          rows="1"
        ></textarea>
        
        {#if isLoading}
          <button 
            onclick={handleStop}
            class="absolute right-2 bottom-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 active:scale-95"
            title="Stop Generation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>
          </button>
        {:else}
          <button 
            onclick={handleSend}
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
