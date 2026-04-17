<script>
  import { onMount } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';

  /** @type {{ isOpen: boolean, onClose: () => void }} */
  let { isOpen = false, onClose } = $props();

  // State for shortcut highlighting
  let lastPressedKey = $state('');

  // Expandable state for "How Lume Thinks"
  let isThinkExpanded = $state(false);

  // Keyboard shortcut listener to highlight keys visually if they are pressed
  $effect(() => {
    if (!isOpen) return;

    /** @param {KeyboardEvent} e */
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
        lastPressedKey = 'Escape';
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        lastPressedKey = 'Ctrl+K';
        e.preventDefault(); // Prevent default browser search if needed
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        lastPressedKey = 'Ctrl+Enter';
      }
      
      // Clear highlight after a short delay
      setTimeout(() => {
        if (lastPressedKey === 'Escape' || lastPressedKey === 'Ctrl+K' || lastPressedKey === 'Ctrl+Enter') {
          lastPressedKey = '';
        }
      }, 300);
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

{#if isOpen}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-sm cursor-default transition-all"
    onclick={onClose}
    in:fade={{ duration: 300 }}
    out:fade={{ duration: 300 }}
    aria-label="Close Lume Codex"
  ></button>

  <!-- Drawer -->
  <aside
    class="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white/90 dark:bg-[#111822]/90 backdrop-blur-xl border-l border-gray-200 dark:border-gray-800 shadow-[0_0_40px_rgba(0,0,0,0.1)] dark:shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-y-auto flex flex-col"
    in:fly={{ x: '100%', duration: 350, opacity: 1, delay: 0 }}
    out:fly={{ x: '100%', duration: 300, opacity: 1 }}
  >
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-800 shrink-0 sticky top-0 bg-white/50 dark:bg-[#111822]/50 backdrop-blur-md z-10">
      <div class="flex items-center gap-3">
        <div class="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <h2 class="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent tracking-tight">
          Lume Codex
        </h2>
      </div>
      <button 
        class="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
        onclick={onClose}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </header>

    <div class="flex-1 p-6 space-y-10 overflow-y-auto">
      
      <!-- 1. The Local AI Primer -->
      <section class="group">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
          Privacy First
        </h3>
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 relative overflow-hidden transition-all duration-300 group-hover:shadow-md">
          <div class="absolute -right-4 -top-4 text-emerald-500/10 dark:text-emerald-400/5 transition-transform duration-500 group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="relative z-10">
            <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">100% Local Inference</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Lume routes your prompts directly to your local Ollama instance. Your conversations, ideas, and code <strong>never leave your machine</strong>. We believe your thoughts should remain yours.
            </p>
          </div>
        </div>
      </section>

      <!-- 2. "How Lume Thinks" -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
          Under the Hood
        </h3>
        
        <!-- Interactive Accordion Box -->
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
          <button 
            class="w-full px-5 py-4 flex items-center justify-between bg-white dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            onclick={() => isThinkExpanded = !isThinkExpanded}
          >
            <span class="font-semibold text-gray-900 dark:text-gray-100 text-sm">Reasoning Models & &lt;think&gt; tags</span>
            <svg 
              xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="text-gray-500 transition-transform duration-300 {isThinkExpanded ? 'rotate-180' : ''}"
            ><path d="m6 9 6 6 6-6"/></svg>
          </button>
          
          {#if isThinkExpanded}
            <div transition:slide={{ duration: 300 }} class="px-5 pb-5 pt-2">
              <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                Advanced models like DeepSeek-R1 output their reasoning process inside special <code>&lt;think&gt;</code> blocks before answering.
              </p>
              
              <!-- Mock Chat Bubble Animation -->
              <div class="space-y-3 relative before:absolute before:inset-0 before:bg-gradient-to-t before:from-gray-50 dark:before:from-gray-800/50 before:to-transparent before:z-10 before:h-full">
                <div class="flex gap-2">
                  <div class="w-1 bg-emerald-500 rounded-full"></div>
                  <div class="text-xs text-gray-500 font-mono bg-gray-200/50 dark:bg-black/30 p-2 rounded-md italic">
                    <span class="text-emerald-600 dark:text-emerald-400 opacity-70">thinking...</span><br/>
                    1. Analyze the user's prompt<br/>
                    2. Check dependencies<br/>
                    3. Formulate solution
                  </div>
                </div>
                <div class="text-sm text-gray-800 dark:text-gray-200">
                  Here is the optimized Svelte component you requested.
                </div>
              </div>
              <p class="text-[13px] text-emerald-600 dark:text-emerald-400 mt-4 font-medium">
                Lume intelligently parses these tags, allowing you to collapse the "thinking" process and focus on the final answer.
              </p>
            </div>
          {/if}
        </div>
      </section>

      <!-- 3. Mastery (Shortcuts) -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Keyboard Mastery
        </h3>
        
        <div class="space-y-2">
          <!-- Shortcut Item 1 -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/30 border border-transparent transition-colors {lastPressedKey === 'Ctrl+K' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'hover:bg-gray-100 dark:hover:bg-gray-800/60'}">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Focus Chat Input</span>
            <div class="flex gap-1">
              <kbd class="px-2 py-1 rounded bg-white dark:bg-black border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-600 dark:text-gray-400 shadow-sm {lastPressedKey === 'Ctrl+K' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50' : ''}">Ctrl/Cmd</kbd>
              <kbd class="px-2 py-1 rounded bg-white dark:bg-black border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-600 dark:text-gray-400 shadow-sm {lastPressedKey === 'Ctrl+K' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50' : ''}">K</kbd>
            </div>
          </div>

          <!-- Shortcut Item 2 -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/30 border border-transparent transition-colors {lastPressedKey === 'Ctrl+Enter' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'hover:bg-gray-100 dark:hover:bg-gray-800/60'}">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Send Message</span>
            <div class="flex gap-1">
              <kbd class="px-2 py-1 rounded bg-white dark:bg-black border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-600 dark:text-gray-400 shadow-sm {lastPressedKey === 'Ctrl+Enter' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50' : ''}">Ctrl</kbd>
              <kbd class="px-2 py-1 rounded bg-white dark:bg-black border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-600 dark:text-gray-400 shadow-sm {lastPressedKey === 'Ctrl+Enter' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50' : ''}">Enter</kbd>
            </div>
          </div>
          
          <!-- Shortcut Item 3 -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/30 border border-transparent transition-colors {lastPressedKey === 'Escape' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'hover:bg-gray-100 dark:hover:bg-gray-800/60'}">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Stop Generation / Close</span>
            <div class="flex gap-1">
              <kbd class="px-2 py-1 rounded bg-white dark:bg-black border border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-600 dark:text-gray-400 shadow-sm {lastPressedKey === 'Escape' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50' : ''}">Esc</kbd>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Footer -->
      <footer class="pt-6 border-t border-gray-200/50 dark:border-gray-800/50 flex flex-col items-center gap-2">
        <p class="text-xs text-gray-400 dark:text-gray-500">Lume is built with ❤️ using Tauri & Svelte 5</p>
        <button 
          class="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400 font-medium transition-colors"
          onclick={onClose}
        >
          Dismiss Codex
        </button>
      </footer>
    </div>
  </aside>
{/if}
