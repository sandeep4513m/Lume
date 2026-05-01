<script>
  import lumeFireLogo from "$lib/assets/lume-icon.png";

  /** @type {{
   *   isSidebarCollapsed: boolean,
   *   filteredSessions: any[],
   *   currentSessionId: string,
   *   isBulkSelectMode: boolean,
   *   selectedSessionIds: Set<string>,
   *   searchQuery: string,
   *   searchInputRef: any,
   *   activeDropdown: string | null,
   *   editingSessionId: string | null,
   *   editingSessionTitle: string,
   *   isUserMenuOpen: boolean,
   *   isSettingsOpen: boolean,
   *   isCodexOpen: boolean,
   *   userName: string,
   *   userInitials: string,
   *   userAvatarColor: string,
   *   oncreatenewchat: () => void,
   *   onloadchat: (id: string) => void,
   *   onrenamesession: (e: any, id: string) => void,
   *   onrenameconfirm: () => void,
   *   ontogglepin: (e: any, id: string) => void,
   *   onexportmarkdown: (id: string) => void,
   *   ondeletesession: (e: any, id: string) => void,
   *   onbulkdelete: () => void,
   *   ontimeago: (ts: number) => string,
   *   ongetchatwordcount: (id: string) => number | null,
   *   onformatwordcount: (n: number) => string,
   *   autofocus: (node: HTMLInputElement) => void,
   * }} */
  let {
    isSidebarCollapsed = $bindable(),
    filteredSessions,
    currentSessionId,
    isBulkSelectMode = $bindable(),
    selectedSessionIds = $bindable(),
    searchQuery = $bindable(),
    searchInputRef = $bindable(),
    activeDropdown = $bindable(),
    editingSessionId = $bindable(),
    editingSessionTitle = $bindable(),
    isUserMenuOpen = $bindable(),
    isSettingsOpen = $bindable(),
    isCodexOpen = $bindable(),
    userName,
    userInitials,
    userAvatarColor,
    oncreatenewchat,
    onloadchat,
    onrenamesession,
    onrenameconfirm,
    ontogglepin,
    onexportmarkdown,
    ondeletesession,
    onbulkdelete,
    ontimeago,
    ongetchatwordcount,
    onformatwordcount,
    autofocus,
  } = $props();
</script>

<!-- PREMIUM SIDEBAR -->
<aside
  class="flex flex-col h-full bg-[#f9fafb] dark:bg-[#111822] border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out shrink-0 {isSidebarCollapsed
    ? 'w-16'
    : 'w-[280px]'}"
>
  <!-- Logo & Header -->
  <div class="flex items-center justify-between px-3 h-14 shrink-0">
    <div
      class="flex items-center gap-2 overflow-hidden {isSidebarCollapsed
        ? 'justify-center w-full'
        : ''}"
    >
      <!-- Lume flame logo -->
      <div class="h-6 w-6 shrink-0 flex items-center justify-center">
        <img
          src={lumeFireLogo}
          alt="Lume"
          class="h-6 w-6 object-contain scale-[1.45] filter drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]"
        />
      </div>
      {#if !isSidebarCollapsed}
        <span
          class="font-medium text-[16px] leading-none tracking-tight whitespace-nowrap text-gray-900 dark:text-white ml-0.5 mt-0.5"
          >Lume</span
        >
      {/if}
    </div>
    {#if !isSidebarCollapsed}
      <!-- PanelLeftClose toggle -->
      <button
        onclick={() => (isSidebarCollapsed = true)}
        class="flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#1a212c] transition-all"
        title="Collapse Sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Expand button (if collapsed) -->
  {#if isSidebarCollapsed}
    <button
      onclick={() => (isSidebarCollapsed = false)}
      class="mx-auto mt-2 p-2 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#1a212c] transition-all"
      title="Expand Sidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" />
      </svg>
    </button>
  {/if}

  <!-- New Chat Button -->
  <div class="px-3 mt-2 shrink-0">
    <button
      onclick={oncreatenewchat}
      class="w-full flex items-center justify-center p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-all shadow-sm active:scale-95 space-x-2"
      title="New Chat"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        ><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      {#if !isSidebarCollapsed}
        <span>New Chat</span>
      {/if}
    </button>
  </div>

  <!-- Search Bar + Bulk Select toggle -->
  {#if !isSidebarCollapsed}
    <div class="px-3 mt-4 shrink-0 transition-opacity duration-200">
      <div class="relative flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input
          bind:this={searchInputRef}
          bind:value={searchQuery}
          placeholder="Search chats..."
          class="flex-1 bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm text-gray-800 dark:text-gray-200 placeholder-gray-400"
        />
        <!-- Bulk select toggle -->
        <button
          onclick={() => {
            isBulkSelectMode = !isBulkSelectMode;
            selectedSessionIds = new Set();
          }}
          class="ml-2 p-1.5 rounded-lg transition-colors {isBulkSelectMode
            ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
            : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#21262d]'}"
          title="Select chats"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            ><rect x="3" y="5" width="6" height="6" rx="1"></rect><path d="m3 17 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path></svg>
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
        onclick={() => (isBulkSelectMode ? null : onloadchat(session.id))}
        onkeydown={(e) => {
          if (!isBulkSelectMode && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onloadchat(session.id);
          }
        }}
        class="group cursor-pointer flex items-center rounded-lg p-2.5 transition-all relative select-none
          {session.id === currentSessionId && !isBulkSelectMode
          ? 'bg-white dark:bg-[#1a212c] border-l-2 border-emerald-500 shadow-sm'
          : 'hover:bg-gray-200/50 dark:hover:bg-[#1a212c]/70 border-l-2 border-transparent'}
          {isSidebarCollapsed ? 'justify-center h-11 w-11 mx-auto border-none p-0' : ''}
          {isBulkSelectMode && selectedSessionIds.has(session.id)
          ? 'bg-emerald-50 dark:bg-emerald-900/10 border-l-2 border-emerald-500'
          : ''}"
        title={session.title}
      >
        {#if isSidebarCollapsed}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 {session.id === currentSessionId ? 'text-emerald-500' : 'text-gray-400'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            ><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        {:else if isBulkSelectMode}
          <!-- Bulk select checkbox mode -->
          <button
            onclick={(e) => {
              e.stopPropagation();
              const s = new Set(selectedSessionIds);
              s.has(session.id) ? s.delete(session.id) : s.add(session.id);
              selectedSessionIds = s;
            }}
            class="mr-2.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors {selectedSessionIds.has(session.id)
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400'}"
          >
            {#if selectedSessionIds.has(session.id)}
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
                ><polyline points="20 6 9 17 4 12"></polyline></svg>
            {/if}
          </button>
          <div class="flex flex-col flex-1 min-w-0">
            <span class="text-[13px] font-medium truncate {selectedSessionIds.has(session.id) ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}">{session.title}</span>
            <span class="text-[11px] text-gray-500 mt-0.5">{ontimeago(session.updated_at)}</span>
          </div>
        {:else}
          <div class="flex flex-col flex-1 min-w-0 pr-14">
            <div class="flex items-center space-x-1.5 min-w-0">
              {#if session.is_pinned}
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"
                  ><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
              {/if}
              {#if editingSessionId === session.id}
                <input
                  bind:value={editingSessionTitle}
                  class="text-[13px] w-full bg-white dark:bg-[#1a212c] border border-emerald-500 rounded px-1.5 py-0.5 focus:outline-none text-gray-900 dark:text-gray-100 font-medium"
                  use:autofocus
                  onclick={(/** @type {any} */ e) => e.stopPropagation()}
                  onkeydown={(/** @type {any} */ e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") onrenameconfirm();
                    else if (e.key === "Escape") editingSessionId = null;
                  }}
                />
              {:else}
                <span class="text-[13px] truncate leading-tight block pb-0.5 {session.id === currentSessionId ? 'font-medium text-gray-900 dark:text-gray-100' : 'font-normal text-gray-400 dark:text-gray-500'}">{session.title}</span>
              {/if}
            </div>
            <div class="flex items-center space-x-2">
              <span class="text-[11px] text-gray-500 mt-0.5">{ontimeago(session.updated_at)}</span>
              {#if ongetchatwordcount(session.id)}
                {@const wc = ongetchatwordcount(session.id)}
                <span class="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded-full font-medium mt-0.5">{onformatwordcount(/** @type {number} */ (wc))}w</span>
              {/if}
            </div>
          </div>

          <!-- Action buttons: Pin + More (appear on hover) -->
          <div class="absolute right-1 flex items-center space-x-0.5 transition-all {activeDropdown === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}">
            <!-- Pin button -->
            <button
              onclick={(e) => ontogglepin(e, session.id)}
              class="p-1.5 rounded-md transition-all hover:bg-white dark:hover:bg-gray-800 {session.is_pinned ? 'text-emerald-500' : 'text-gray-400 hover:text-emerald-500'}"
              title={session.is_pinned ? "Unpin chat" : "Pin to top"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill={session.is_pinned ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                ><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
            </button>

            <!-- More actions menu -->
            <div class="relative">
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  activeDropdown = activeDropdown === session.id ? null : session.id;
                }}
                class="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all rounded-md hover:bg-white dark:hover:bg-gray-800"
                title="More actions"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                </svg>
              </button>

              {#if activeDropdown === session.id}
                <div
                  class="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-[#1a212c] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
                  role="menu"
                  tabindex="-1"
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => e.stopPropagation()}
                >
                  <button
                    onclick={(e) => onrenamesession(e, session.id)}
                    class="w-full text-left px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                  >Rename</button>
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      onexportmarkdown(session.id);
                      activeDropdown = null;
                    }}
                    class="w-full text-left px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                  >Export</button>
                  <button
                    onclick={(e) => {
                      ondeletesession(e, session.id);
                      activeDropdown = null;
                    }}
                    class="w-full text-left px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                  >Delete</button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
    {#if filteredSessions.length === 0}
      <div class="text-center text-xs text-gray-400 mt-4">
        {#if isSidebarCollapsed}...{:else}No chats found{/if}
      </div>
    {/if}

    <!-- Bulk Delete floating action bar -->
    {#if isBulkSelectMode && selectedSessionIds.size > 0}
      <div class="sticky bottom-0 left-0 right-0 mx-1 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-2 flex items-center justify-between">
        <span class="text-[12px] font-medium text-gray-600 dark:text-gray-400 pl-1">{selectedSessionIds.size} selected</span>
        <button
          onclick={onbulkdelete}
          class="flex items-center space-x-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[12px] font-medium rounded-lg transition-colors active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            ><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          <span>Delete</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Bottom: User Profile Menu -->
  <div class="p-3 border-t border-gray-200 dark:border-gray-800 shrink-0 mt-auto relative">
    <!-- Collapsed state: initials avatar only -->
    {#if isSidebarCollapsed}
      <button onclick={() => (isSidebarCollapsed = false)} class="w-full flex justify-center py-1" title={userName}>
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold select-none" style="background-color: {userAvatarColor}">
          {userInitials}
        </div>
      </button>
    {/if}

    <!-- User Menu Popup -->
    {#if isUserMenuOpen && !isSidebarCollapsed}
      <div class="fixed inset-0 z-40" role="presentation" onclick={() => (isUserMenuOpen = false)}></div>
      <div class="absolute bottom-[calc(100%+8px)] left-3 right-3 z-50 bg-white/80 dark:bg-[#141920]/90 backdrop-blur-xl border border-gray-200/70 dark:border-white/10 rounded-2xl shadow-[0_16px_40px_-8px_rgba(0,0,0,0.25)] dark:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6)] overflow-hidden">
        <div class="px-4 py-3">
          <p class="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">{userName}</p>
          <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Local account</p>
        </div>
        <div class="px-1.5 pb-1">
          <button
            onclick={() => { isSettingsOpen = true; isUserMenuOpen = false; }}
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-[15px] h-[15px] text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </button>
        </div>
        <div class="mx-3 my-1 border-t border-gray-200/70 dark:border-white/10"></div>
        <div class="px-1.5 pt-1 pb-1.5">
          <button
            onclick={() => { isCodexOpen = true; isUserMenuOpen = false; }}
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/6 transition-colors text-left group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-[15px] h-[15px] text-gray-400 shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            Learn more
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-gray-400 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              ><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>
    {/if}

    <!-- Profile trigger row (expanded sidebar only) -->
    {#if !isSidebarCollapsed}
      <button
        onclick={() => (isUserMenuOpen = !isUserMenuOpen)}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
      >
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 select-none" style="background-color: {userAvatarColor}">
          {userInitials}
        </div>
        <span class="flex-1 text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate text-left">{userName}</span>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 {isUserMenuOpen ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          ><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    {/if}
  </div>
</aside>
