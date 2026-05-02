// ── sessionStore.svelte.ts — Chat session & sidebar state ────────────────────

/** @type {any[]} */
let sessions = $state<any[]>([]);
let currentSessionId = $state('');
let isSidebarCollapsed = $state(false);
let searchQuery = $state('');
/** @type {string | null} */
let activeDropdown = $state<string | null>(null);
/** @type {string | null} */
let editingSessionId = $state<string | null>(null);
let editingSessionTitle = $state('');
let isBulkSelectMode = $state(false);
/** @type {Set<string>} */
let selectedSessionIds = $state<Set<string>>(new Set());
let hasUnread = $state(false);

export const sessionStore = {
  get sessions() { return sessions; },
  setSessions(val: any[]) { sessions = val; },

  get currentSessionId() { return currentSessionId; },
  setCurrentSessionId(val: string) { currentSessionId = val; },

  get isSidebarCollapsed() { return isSidebarCollapsed; },
  setIsSidebarCollapsed(val: boolean) { isSidebarCollapsed = val; },

  get searchQuery() { return searchQuery; },
  setSearchQuery(val: string) { searchQuery = val; },

  get activeDropdown() { return activeDropdown; },
  setActiveDropdown(val: string | null) { activeDropdown = val; },

  get editingSessionId() { return editingSessionId; },
  setEditingSessionId(val: string | null) { editingSessionId = val; },

  get editingSessionTitle() { return editingSessionTitle; },
  setEditingSessionTitle(val: string) { editingSessionTitle = val; },

  get isBulkSelectMode() { return isBulkSelectMode; },
  setIsBulkSelectMode(val: boolean) { isBulkSelectMode = val; },

  get selectedSessionIds() { return selectedSessionIds; },
  setSelectedSessionIds(val: Set<string>) { selectedSessionIds = val; },

  get hasUnread() { return hasUnread; },
  setHasUnread(val: boolean) { hasUnread = val; },
};
