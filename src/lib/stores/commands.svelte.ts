// ── commands.svelte.ts — Svelte 5 runes-based command palette store ──────────
//
// Central registry for all palette-visible commands.
// Components call registerCommand() / unregisterCommand() to add/remove entries.
// The store tracks open/close state, search query, selected index, and
// exposes filtered + grouped results via $derived.

import { shortcutStore } from '$lib/stores/shortcuts.svelte';

// ── Types ───────────────────────────────────────────────────────────────────

export interface PaletteCommand {
  /** Unique identifier, e.g. "nav:new_chat" or "action:toggle_dark". */
  id: string;
  /** Primary display label. */
  label: string;
  /** Optional secondary text shown below the label. */
  description?: string;
  /** Section the command appears under. */
  category: 'Recent' | 'Navigation' | 'Shortcuts' | 'Actions' | 'Chat' | 'Editing' | 'Window' | 'General';
  /** Extra search terms that aren't in the label. */
  keywords?: string[];
  /** Key combo string for display, e.g. "Ctrl+N". */
  shortcut?: string;
  /** Callback fired when the command is selected. */
  action: () => void;
  /** Optional icon SVG path data (24×24 viewBox). */
  icon?: string;
}

/** Internal scored result used during fuzzy search. */
interface ScoredCommand {
  command: PaletteCommand;
  score: number;
}

// ── Fuzzy scorer (no external deps) ─────────────────────────────────────────

/**
 * Simple fuzzy match scorer.
 * Returns 0 if no match, higher = better.
 *
 * Scoring:
 *  - Exact substring match  → 100
 *  - Prefix match           → 80
 *  - Word-boundary match    → 60
 *  - Fuzzy (all chars in order) → 10 + bonus for adjacency
 *  - No match               → 0
 */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (!q) return 1; // empty query matches everything equally

  // Exact substring
  if (t.includes(q)) {
    if (t.startsWith(q)) return 100;
    return 80;
  }

  // Word-boundary match: every query char starts a new word in target
  const words = t.split(/[\s\-_:]+/);
  const wordInitials = words.map((w) => w[0] || '').join('');
  if (wordInitials.includes(q)) return 60;

  // Fuzzy: all query chars appear in order in target
  let qi = 0;
  let consecutive = 0;
  let bonus = 0;
  let lastIdx = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === lastIdx + 1) {
        consecutive++;
        bonus += consecutive * 3;
      } else {
        consecutive = 0;
      }
      lastIdx = ti;
      qi++;
    }
  }

  if (qi === q.length) return 10 + bonus;
  return 0; // no match
}

/**
 * Score a command against the search query.
 * Checks label, description, keywords, and category.
 */
function scoreCommand(cmd: PaletteCommand, query: string): number {
  if (!query) return 1;
  let best = fuzzyScore(query, cmd.label);
  if (cmd.description) best = Math.max(best, fuzzyScore(query, cmd.description) * 0.8);
  if (cmd.keywords) {
    for (const kw of cmd.keywords) {
      best = Math.max(best, fuzzyScore(query, kw) * 0.7);
    }
  }
  best = Math.max(best, fuzzyScore(query, cmd.category) * 0.5);
  return best;
}

// ── State (runes) ───────────────────────────────────────────────────────────

/** Whether the palette is currently visible. */
let isOpen = $state(false);

/** Current search query text. */
let query = $state('');

/** Index of the highlighted/selected item in the flat filtered list. */
let selectedIndex = $state(0);

/** Master command list. */
let commands = $state<PaletteCommand[]>([]);

/** Recently-used command IDs (most recent first), max 5. */
let recentIds = $state<string[]>([]);

// ── Derived state ───────────────────────────────────────────────────────────

/** Filtered + scored results. */
const filteredCommands = $derived.by<PaletteCommand[]>(() => {
  const q = query.trim();
  if (!q) return commands;

  const scored: ScoredCommand[] = [];
  for (const cmd of commands) {
    const s = scoreCommand(cmd, q);
    if (s > 0) scored.push({ command: cmd, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.command);
});

/** Category ordering for display. */
const CATEGORY_ORDER: PaletteCommand['category'][] = ['Recent', 'Navigation', 'Chat', 'Editing', 'Window', 'Actions', 'General', 'Shortcuts'];

/** Grouped by category, preserving section order. */
const groupedCommands = $derived.by<{ category: string; items: PaletteCommand[] }[]>(() => {
  const groups = new Map<string, PaletteCommand[]>();
  const q = query.trim();

  // Inject "Recent" virtual commands at the top when no query
  if (!q && recentIds.length > 0) {
    const recentItems: PaletteCommand[] = [];
    for (const id of recentIds) {
      const cmd = commands.find((c) => c.id === id);
      if (cmd) recentItems.push({ ...cmd, category: 'Recent' });
    }
    if (recentItems.length > 0) groups.set('Recent', recentItems);
  }

  for (const cmd of filteredCommands) {
    // Skip duplicates already in recent
    if (!q && recentIds.includes(cmd.id)) continue;
    const list = groups.get(cmd.category) ?? [];
    list.push(cmd);
    groups.set(cmd.category, list);
  }

  const result: { category: string; items: PaletteCommand[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = groups.get(cat);
    if (items && items.length > 0) result.push({ category: cat, items });
  }
  // Any categories not in our order, append at end
  for (const [cat, items] of groups) {
    if (!CATEGORY_ORDER.includes(cat as PaletteCommand['category']) && items.length > 0) {
      result.push({ category: cat, items });
    }
  }
  return result;
});

/** Flat list of all filtered commands in display order (for keyboard nav). */
const flatList = $derived<PaletteCommand[]>(
  groupedCommands.flatMap((g) => g.items),
);

/** Total count of visible results. */
const resultCount = $derived(flatList.length);

// ── Helpers ─────────────────────────────────────────────────────────────────

function addRecent(id: string) {
  recentIds = [id, ...recentIds.filter((r) => r !== id)].slice(0, 5);
  // Persist to localStorage
  try {
    localStorage.setItem('lume_recent_commands', JSON.stringify(recentIds));
  } catch { /* non-fatal */ }
}

function loadRecents() {
  try {
    const raw = localStorage.getItem('lume_recent_commands');
    if (raw) recentIds = JSON.parse(raw);
  } catch { /* non-fatal */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const commandStore = {
  // ── Reactive getters ────────────────────────────────────────────────────
  get isOpen() { return isOpen; },
  get query() { return query; },
  get selectedIndex() { return selectedIndex; },
  get grouped() { return groupedCommands; },
  get flat() { return flatList; },
  get resultCount() { return resultCount; },

  // ── Open / Close ──────────────────────────────────────────────────────

  open() {
    query = '';
    selectedIndex = 0;
    isOpen = true;
  },

  close() {
    isOpen = false;
    query = '';
    selectedIndex = 0;
  },

  toggle() {
    if (isOpen) {
      commandStore.close();
    } else {
      commandStore.open();
    }
  },

  // ── Search ────────────────────────────────────────────────────────────

  setQuery(q: string) {
    query = q;
    selectedIndex = 0; // reset selection on new query
  },

  // ── Keyboard navigation ───────────────────────────────────────────────

  moveUp() {
    selectedIndex = selectedIndex <= 0 ? flatList.length - 1 : selectedIndex - 1;
  },

  moveDown() {
    selectedIndex = selectedIndex >= flatList.length - 1 ? 0 : selectedIndex + 1;
  },

  setIndex(i: number) {
    selectedIndex = i;
  },

  /** Execute the currently selected command. */
  executeSelected() {
    const cmd = flatList[selectedIndex];
    if (cmd) {
      addRecent(cmd.id);
      commandStore.close();
      cmd.action();
    }
  },

  /** Execute a specific command by ID. */
  execute(id: string) {
    const cmd = commands.find((c) => c.id === id);
    if (cmd) {
      addRecent(cmd.id);
      commandStore.close();
      cmd.action();
    }
  },

  // ── Registry ──────────────────────────────────────────────────────────

  /** Register a command. Duplicates (same id) are silently replaced. */
  registerCommand(cmd: PaletteCommand) {
    commands = [...commands.filter((c) => c.id !== cmd.id), cmd];
  },

  /** Register multiple commands at once. */
  registerCommands(cmds: PaletteCommand[]) {
    const ids = new Set(cmds.map((c) => c.id));
    commands = [...commands.filter((c) => !ids.has(c.id)), ...cmds];
  },

  /** Remove a command by ID. */
  unregisterCommand(id: string) {
    commands = commands.filter((c) => c.id !== id);
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /** Wire to shortcut store and load recents. Call once at app startup. */
  init() {
    loadRecents();

    // Wire shortcut: global:command_palette → toggle palette
    shortcutStore.on('global:command_palette', () => {
      commandStore.toggle();
    });
  },
};
