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
  
  let textareaRef = $state();
  let chatContainerRef = $state();
  let showScrollButton = $state(false);
  let isDarkMode = $state(false);
  let hasUnread = $state(false);

  // Monitor scroll position
  function handleScroll() {
    if (!chatContainerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef;
    // Show button if we are more than 150px away from the absolute bottom
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    showScrollButton = distanceFromBottom > 150;
    if (!showScrollButton) hasUnread = false;
  }

  // Helper to jump to the very bottom
  function scrollToBottom() {
    if (chatContainerRef) {
      chatContainerRef.scrollTo({ top: chatContainerRef.scrollHeight, behavior: 'smooth' });
    }
  }

  // Auto-scroll when messages change (if we aren't manually scrolled up)
  $effect(() => {
    if (messages.length && chatContainerRef && !showScrollButton) {
      setTimeout(() => scrollToBottom(), 50);
    }
  });

  onMount(async () => {
    errorMessage = '';
    
    // Theme setup
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDarkMode = true;
      document.body.classList.add('dark');
    }

    try { messages = await invoke('get_messages'); } 
    catch (e) { errorMessage = "Failed to load chat: " + e; }

    const fetchedModels = await fetchModels();
    models = fetchedModels;
    
    if (models.length > 0) { selectedModel = models[0].name; } 
    else { errorMessage = "No models found. Is Ollama running?"; }

    // Scroll down on initial load
    setTimeout(scrollToBottom, 100);
  });

  function toggleTheme() {
    isDarkMode = !isDarkMode;
    if (isDarkMode) document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }

  function adjustTextareaHeight() {
    if (textareaRef) {
      textareaRef.style.height = 'auto';
      textareaRef.style.height = textareaRef.scrollHeight + 'px';
    }
  }

  async function handleSend() {
    if (!prompt.trim() || !selectedModel || isLoading) return;
    
    const currentPrompt = prompt;
    prompt = '';
    tick().then(() => {
      adjustTextareaHeight();
      scrollToBottom(); // Force scroll bottom on sending
    });
    
    isLoading = true;
    errorMessage = '';
    
    messages.push({ role: 'user', content: currentPrompt });
    invoke('save_message', { role: 'user', content: currentPrompt }).catch(console.error);
    
    const aiIndex = messages.push({ role: 'ai', content: '', isLoading: true }) - 1;
    if (showScrollButton) hasUnread = true;
    
    try {
      const responseText = await sendMessage(selectedModel, currentPrompt);
      
      messages = messages.map((msg, i) => 
        i === aiIndex ? { ...msg, content: responseText, isLoading: false } : msg
      );
      
      invoke('save_message', { role: 'ai', content: responseText }).catch(console.error);
      
    } catch (error) {
      errorMessage = "Error communicating with Ollama: " + error.message;
      messages.pop(); 
      prompt = currentPrompt;
      tick().then(adjustTextareaHeight);
    } finally {
      isLoading = false;
    }
  }

  async function handleClear() {
    if(confirm("Delete all chat history?")) {
      await invoke('clear_messages');
      messages = [];
    }
  }
</script>

<main class="h-screen w-full flex flex-col bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-gray-100 transition-colors duration-200">
  
  <header class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#161b22]/50 backdrop-blur-md sticky top-0 z-20 transition-colors">
    <h1 class="text-xl font-bold tracking-tight text-emerald-500">Lume</h1>
    
    <div class="flex items-center space-x-4">
      <button onclick={handleClear} class="text-sm font-medium text-red-500 hover:text-red-600 transition-colors bg-red-500/10 hover:bg-red-500/20 p-2 rounded-full" title="Clear History">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>

      <div class="h-5 w-px bg-gray-300 dark:bg-gray-700"></div>

      <span class="text-sm font-medium opacity-70">Model:</span>
      <select 
        bind:value={selectedModel}
        disabled={models.length === 0}
        class="bg-white dark:bg-[#161b22] text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
      >
        {#if models.length === 0}
          <option value="">Searching...</option>
        {/if}
        {#each models as model}
          <option value={model.name}>{model.name}</option>
        {/each}
      </select>

      <button 
        onclick={toggleTheme}
        class="p-2 rounded-full bg-white dark:bg-[#161b22] border border-gray-300 dark:border-gray-700 shadow-sm text-gray-600 dark:text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
        title="Toggle Theme"
      >
        {#if isDarkMode}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        {/if}
      </button>
    </div>
  </header>

  <!-- Added scrolling hooks here! -->
  <div 
    bind:this={chatContainerRef}
    onscroll={handleScroll}
    class="flex-1 overflow-y-auto w-full p-4 space-y-6 flex flex-col scroll-smooth"
  >
    {#if errorMessage}
      <div class="max-w-3xl mx-auto w-full p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-sm shadow-sm">
        {errorMessage}
      </div>
    {/if}

    <div class="max-w-3xl mx-auto w-full flex flex-col space-y-6 pb-6">
      {#if messages.length === 0 && !errorMessage}
        <div class="m-auto flex flex-col items-center justify-center opacity-40 pt-20">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <p class="text-sm font-medium">Select a model and start a conversation</p>
        </div>
      {/if}

      {#each messages as msg}
        <div class="flex w-full {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div class="rounded-2xl max-w-[85%] shadow-sm text-[15px] leading-relaxed overflow-hidden transition-colors
            {msg.role === 'user' 
              ? 'bg-emerald-500 text-white rounded-br-none p-4' 
              : 'bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-bl-none px-5 py-3'}">
            
            {#if msg.isLoading}
              <div class="flex space-x-1 items-center h-5">
                <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
              </div>
            {:else if msg.role === 'ai'}
              <Markdown content={msg.content} />
            {:else}
              <div class="whitespace-pre-wrap">{msg.content}</div>
            {/if}
            
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="w-full p-4 bg-white/80 dark:bg-[#0d1117]/80 backdrop-blur-md relative z-10 border-t border-gray-200 dark:border-gray-800 transition-colors">
    <!-- Floating Arrow Button -->
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
        class="flex-1 bg-white dark:bg-[#161b22] text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-3xl pl-6 pr-14 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.2)] text-[15px] resize-none overflow-y-auto min-h-[52px] max-h-[200px] transition-colors"
        rows="1"
      ></textarea>
      <button 
        onclick={handleSend}
        disabled={isLoading || !prompt.trim() || models.length === 0}
        class="absolute right-2 bottom-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-full p-2 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:transform-none active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </div>
    <div class="w-full text-center mt-2 opacity-50 text-[11px] font-medium tracking-wide">Use Shift + Enter to add a new line</div>
  </div>
</main>
