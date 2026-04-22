<script>
  import { onMount } from 'svelte';

  let name = $state('');
  let avatarColor = $state('#10b981');
  let openLastChat = $state(true);
  let confirmDelete = $state(true);
  let showSaved = $state(false);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveTimeout;

  const colors = [
    '#10b981', // Emerald (Default)
    '#3b82f6', // Blue
    '#a855f7', // Purple
    '#f43f5e', // Rose
    '#f59e0b', // Amber
    '#6366f1'  // Indigo
  ];

  onMount(() => {
    name = localStorage.getItem('lume_user_name') || '';
    avatarColor = localStorage.getItem('lume_user_avatar_color') || '#10b981';
    openLastChat = localStorage.getItem('lume_open_last_chat') !== 'false';
    confirmDelete = localStorage.getItem('lume_confirm_delete') !== 'false';
  });

  // Keep avatar color in sync with localStorage and notify other components immediately
  $effect(() => {
    if (avatarColor) {
      localStorage.setItem('lume_user_avatar_color', avatarColor);
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'lume_user_avatar_color',
        newValue: avatarColor
      }));
    }
  });

  function triggerSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      localStorage.setItem('lume_user_name', name);
      localStorage.setItem('lume_open_last_chat', String(openLastChat));
      localStorage.setItem('lume_confirm_delete', String(confirmDelete));
      
      // Manually dispatch a storage event to notify other components in the same window
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'lume_user_name',
        newValue: name
      }));
      
      showSaved = true;
      setTimeout(() => { showSaved = false; }, 2000);
    }, 800);
  }

  let initials = $derived(
    name.trim()
      ? name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
      : '?'
  );

  /** @param {Event} e */
  function handleNameInput(e) {
    name = (/** @type {HTMLInputElement} */(e.target)).value;
    triggerSave();
  }

  /** @param {string} color */
  function handleColorPick(color) {
    avatarColor = color;
    triggerSave();
  }

  function handleToggleOpenLast() {
    openLastChat = !openLastChat;
    triggerSave();
  }

  function handleToggleConfirmDelete() {
    confirmDelete = !confirmDelete;
    triggerSave();
  }
</script>

<div class="space-y-8">
  <!-- PROFILE SECTION -->
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-[13px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Profile</h3>
      {#if showSaved}
        <span class="text-[11px] font-medium text-emerald-500 transition-opacity duration-300">Saved</span>
      {/if}
    </div>

    <div class="flex items-center space-x-6 bg-[#f9fafb] dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
      <!-- Avatar Preview -->
      <div 
        class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm transition-colors duration-300 shrink-0"
        style="background-color: {avatarColor}"
      >
        {initials}
      </div>

      <div class="flex-1 space-y-4">
        <div class="space-y-1.5">
          <label for="display-name" class="text-[13px] font-medium text-gray-600 dark:text-gray-400">Display Name</label>
          <input
            id="display-name"
            type="text"
            value={name}
            oninput={handleNameInput}
            placeholder="Your name"
            class="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2 text-[14px] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>

        <div class="space-y-1.5">
          <span class="text-[13px] font-medium text-gray-600 dark:text-gray-400">Avatar Color</span>
          <div class="flex items-center space-x-2">
            {#each colors as color}
              <button
                onclick={() => handleColorPick(color)}
                class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 active:scale-95 {avatarColor === color ? 'border-gray-400 dark:border-white scale-110 shadow-sm' : 'border-transparent'}"
                style="background-color: {color}"
                aria-label="Pick color {color}"
              ></button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- PREFERENCES SECTION -->
  <section class="space-y-4">
    <h3 class="text-[13px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Preferences</h3>
    
    <div class="space-y-1">
      <!-- Open last chat -->
      <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
        <div>
          <p class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Open last chat on launch</p>
          <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">Resume your previous conversation automatically</p>
        </div>
        <button
          onclick={handleToggleOpenLast}
          aria-label="Toggle open last chat"
          class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0d1117]
            {openLastChat ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
        >
          <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 {openLastChat ? 'translate-x-5' : 'translate-x-0'}"></span>
        </button>
      </div>

      <!-- Show confirmation before deleting -->
      <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
        <div>
          <p class="text-[14px] font-medium text-gray-800 dark:text-gray-200">Show confirmation before deleting chat</p>
          <p class="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">Protect against accidental deletions</p>
        </div>
        <button
          onclick={handleToggleConfirmDelete}
          aria-label="Toggle delete confirmation"
          class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0d1117]
            {confirmDelete ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}"
        >
          <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 {confirmDelete ? 'translate-x-5' : 'translate-x-0'}"></span>
        </button>
      </div>
    </div>
  </section>
</div>
