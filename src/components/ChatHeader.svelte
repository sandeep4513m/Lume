<script>
  /** @type {{
   *   sessions: any[],
   *   currentSessionId: string,
   *   isDarkMode: boolean,
   *   isHeaderMenuOpen: boolean,
   *   isGovernorOpen: boolean,
   *   isSettingsOpen: boolean,
   *   settingsInitialTab: string,
   *   settingsScrollTo: string,
   *   contextTokenCount: number,
   *   activeContextSize: number,
   *   contextColor: string,
   *   contextPercentage: number,
   *   ontoggledarkmode: () => void,
   *   onclear: () => void,
   * }} */
  let {
    sessions,
    currentSessionId,
    isDarkMode,
    isHeaderMenuOpen = $bindable(),
    isGovernorOpen = $bindable(),
    isSettingsOpen = $bindable(),
    settingsInitialTab = $bindable(),
    settingsScrollTo = $bindable(),
    contextTokenCount,
    activeContextSize,
    contextColor,
    contextPercentage,
    ontoggledarkmode,
    onclear,
  } = $props();
</script>

<!-- Top Header -->
<header
  class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#0d1117]/50 backdrop-blur-md sticky top-0 z-20 transition-colors shrink-0 h-16"
>
  <div class="flex items-center space-x-3">
    <span class="font-normal text-[14px] text-gray-600 dark:text-gray-400">
      {sessions.find((s) => s.id === currentSessionId)?.title || "Lume Chat"}
    </span>
  </div>

  <div class="flex items-center space-x-3">
    <!-- Theme toggle -->
    <button
      onclick={ontoggledarkmode}
      class="p-1.5 rounded-md text-gray-500 hover:text-emerald-500 dark:hover:text-emerald-400 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      title="Toggle Theme"
    >
      {#if isDarkMode}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
      {/if}
    </button>

    <!-- Chat options menu -->
    <div class="relative">
      <button
        onclick={() => (isHeaderMenuOpen = !isHeaderMenuOpen)}
        class="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-[#1a212c] transition-colors"
        title="Chat Options"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
      </button>

      {#if isHeaderMenuOpen}
        <div
          class="fixed inset-0 z-40"
          role="presentation"
          onclick={() => (isHeaderMenuOpen = false)}
        ></div>
        <div
          class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#141920] border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg z-50 py-1 overflow-hidden"
        >
          <button
            onclick={() => {
              isGovernorOpen = true;
              isHeaderMenuOpen = false;
            }}
            class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <span class="mr-2 text-[14px]">🛡</span>
            System Health
          </button>
          <div class="border-b border-gray-100 dark:border-gray-800"></div>
          <!-- Context Window -->
          <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
            <div class="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Context Window</div>
            <div class="text-[13px] font-medium text-gray-700 dark:text-gray-300">
              {contextTokenCount} / {activeContextSize >= 1000 ? Math.round(activeContextSize / 1024) + 'k' : activeContextSize} tokens
              <span class="ml-1 text-[11px] {contextColor.split(' ')[0]}">({contextPercentage}%)</span>
            </div>
          </div>
          <button
            onclick={() => {
              settingsInitialTab = 'chat';
              settingsScrollTo = 'settings-system-prompt';
              isSettingsOpen = true;
              isHeaderMenuOpen = false;
            }}
            class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            System Prompt
          </button>
          <button
            onclick={() => {
              settingsInitialTab = 'models';
              settingsScrollTo = 'settings-temperature';
              isSettingsOpen = true;
              isHeaderMenuOpen = false;
            }}
            class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>
            Temperature
          </button>
          <div class="border-t border-gray-100 dark:border-gray-800"></div>
          <button
            onclick={() => {
              onclear();
              isHeaderMenuOpen = false;
            }}
            class="w-full flex items-center px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete Current Chat
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>
