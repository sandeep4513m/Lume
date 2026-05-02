// ── settingsStore.svelte.ts — UI settings state ───────────────────────────────

let showTokenCounter = $state(true);
let showResponseTime = $state(true);
let enterToSend = $state(true);
let isDarkMode = $state(false);
let isSettingsOpen = $state(false);
let settingsInitialTab = $state('');
let settingsScrollTo = $state('');

export const settingsStore = {
  get showTokenCounter() { return showTokenCounter; },
  setShowTokenCounter(val: boolean) { showTokenCounter = val; },

  get showResponseTime() { return showResponseTime; },
  setShowResponseTime(val: boolean) { showResponseTime = val; },

  get enterToSend() { return enterToSend; },
  setEnterToSend(val: boolean) { enterToSend = val; },

  get isDarkMode() { return isDarkMode; },
  setIsDarkMode(val: boolean) { isDarkMode = val; },

  get isSettingsOpen() { return isSettingsOpen; },
  setIsSettingsOpen(val: boolean) { isSettingsOpen = val; },

  get settingsInitialTab() { return settingsInitialTab; },
  setSettingsInitialTab(val: string) { settingsInitialTab = val; },

  get settingsScrollTo() { return settingsScrollTo; },
  setSettingsScrollTo(val: string) { settingsScrollTo = val; },

  /** Load persisted preferences from localStorage. */
  loadSettings() {
    showTokenCounter = localStorage.getItem('lume_show_tokens') !== 'false';
    showResponseTime = localStorage.getItem('lume_show_response_time') !== 'false';
    enterToSend = localStorage.getItem('lume_enter_to_send') !== 'false';
  },
};
