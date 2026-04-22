// ── shortcuts.svelte.ts — Svelte 5 runes-based shortcut store ───────────────
//
// Exposes reactive state ($state / $derived) and a runtime keyboard listener
// that matches key events against the active scope and fires handlers.

import { invoke } from '@tauri-apps/api/core';
import type {
  ShortcutDef,
  ShortcutId,
  ShortcutScope,
  ShortcutHandler,
  ShortcutCustomization,
  KeyCombo,
} from '$lib/types/shortcuts';
import { cloneDefaults } from '$lib/config/defaultShortcuts';

// ── Internal state (runes) ──────────────────────────────────────────────────

/** Master registry — starts as factory defaults, overlaid with user customisations. */
let registry = $state<Map<ShortcutId, ShortcutDef>>(cloneDefaults());

/** Currently active scope stack (last = highest priority). */
let scopeStack = $state<ShortcutScope[]>(['global']);

/** Map of handler callbacks bound by components at runtime. */
let handlers: Map<ShortcutId, ShortcutHandler> = new Map();

/** Whether the keyboard listener is currently attached. */
let listenerAttached = false;

/** Whether the store has been initialised from SQLite. */
let initialized = $state(false);

// ── Derived state ───────────────────────────────────────────────────────────

/** Flat array of all shortcut defs (reactive). */
const allShortcuts = $derived<ShortcutDef[]>(Array.from(registry.values()));

/** Only the active scopes' shortcuts. */
const activeShortcuts = $derived<ShortcutDef[]>(
  allShortcuts.filter((s) => scopeStack.includes(s.scope) && s.enabled),
);

/** Shortcuts grouped by category for UI display. */
const byCategory = $derived.by<Record<string, ShortcutDef[]>>(() => {
  const groups: Record<string, ShortcutDef[]> = {};
  for (const s of allShortcuts) {
    (groups[s.category] ??= []).push(s);
  }
  return groups;
})

/** Shortcuts grouped by scope. */
const byScope = $derived.by<Record<ShortcutScope, ShortcutDef[]>>(() => {
  const groups = { global: [], chat: [], editor: [], settings: [] } as Record<
    ShortcutScope,
    ShortcutDef[]
  >;
  for (const s of allShortcuts) {
    groups[s.scope].push(s);
  }
  return groups;
})

// ── Key-event normalisation ─────────────────────────────────────────────────

/**
 * Convert a native KeyboardEvent into our canonical combo string.
 * E.g. pressing Ctrl+Shift+K → "Ctrl+Shift+K".
 */
function normalizeEvent(e: KeyboardEvent): KeyCombo {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  // Map physical key to our naming convention
  let key = e.key;
  // Normalise common aliases
  if (key === ' ') key = 'Space';
  if (key === 'ArrowUp') key = 'Up';
  if (key === 'ArrowDown') key = 'Down';
  if (key === 'ArrowLeft') key = 'Left';
  if (key === 'ArrowRight') key = 'Right';

  // Don't duplicate modifier names
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    // Capitalise single-char keys
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }

  return parts.join('+');
}

/**
 * Compare a canonical combo against a KeyboardEvent.
 */
function comboMatchesEvent(combo: KeyCombo, e: KeyboardEvent): boolean {
  return normalizeEvent(e) === combo;
}

// ── Global keyboard listener ────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent) {
  // Skip if the user is typing in an input/textarea and the combo is a
  // simple key (no modifier).  Allow modifier combos through.
  const target = e.target as HTMLElement;
  const isInput =
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable;

  // Walk the scope stack from highest priority → lowest
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const scope = scopeStack[i];

    for (const [id, def] of registry) {
      if (def.scope !== scope || !def.enabled) continue;

      for (const combo of def.currentKeys) {
        if (!comboMatchesEvent(combo, e)) continue;

        // If in an input, only allow combos that contain a modifier
        const hasModifier =
          combo.includes('Ctrl') ||
          combo.includes('Alt') ||
          combo.includes('Meta') ||
          combo.includes('Shift');

        if (isInput && !hasModifier) continue;

        const handler = handlers.get(id);
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler(e);
          return; // first match wins
        }
      }
    }
  }
}

function attachListener() {
  if (listenerAttached) return;
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  listenerAttached = true;
}

function detachListener() {
  if (!listenerAttached) return;
  window.removeEventListener('keydown', handleKeyDown, { capture: true });
  listenerAttached = false;
}

// ── SQLite persistence helpers ──────────────────────────────────────────────

async function loadCustomizations(): Promise<void> {
  try {
    const rows: ShortcutCustomization[] = await invoke('get_shortcut_customizations');
    const base = cloneDefaults();

    for (const row of rows) {
      const id = row.id as ShortcutId;
      const def = base.get(id);
      if (!def) continue;

      try {
        def.currentKeys = JSON.parse(row.current_keys) as KeyCombo[];
      } catch {
        def.currentKeys = [...def.defaultKeys];
      }
      def.enabled = row.enabled;
    }

    registry = base;
  } catch (err) {
    console.error('[shortcuts] Failed to load customizations:', err);
    // Fall back to factory defaults (already the initial state)
  }
}

async function persistOne(def: ShortcutDef): Promise<void> {
  const customization: ShortcutCustomization = {
    id: def.id,
    current_keys: JSON.stringify(def.currentKeys),
    enabled: def.enabled,
  };
  await invoke('set_shortcut_customization', { customization });
}

async function persistAll(): Promise<void> {
  const customizations: ShortcutCustomization[] = [];
  for (const def of registry.values()) {
    // Only persist entries that differ from factory defaults
    const isCustomised =
      JSON.stringify(def.currentKeys) !== JSON.stringify(def.defaultKeys) ||
      !def.enabled;
    if (isCustomised) {
      customizations.push({
        id: def.id,
        current_keys: JSON.stringify(def.currentKeys),
        enabled: def.enabled,
      });
    }
  }
  await invoke('set_shortcut_customizations_batch', { customizations });
}

// ── Conflict detection ──────────────────────────────────────────────────────

/**
 * Check if a key combo is already in use by another shortcut within the
 * same scope (or global scope, since global always applies).
 * Returns the conflicting ShortcutDef or null.
 */
function findConflict(
  combo: KeyCombo,
  scope: ShortcutScope,
  excludeId: ShortcutId,
): ShortcutDef | null {
  for (const def of registry.values()) {
    if (def.id === excludeId) continue;
    if (def.scope !== scope && def.scope !== 'global' && scope !== 'global') continue;
    if (!def.enabled) continue;
    if (def.currentKeys.includes(combo)) return def;
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

export const shortcutStore = {
  // ── Reactive getters ────────────────────────────────────────────────────
  get registry() {
    return registry;
  },
  get all() {
    return allShortcuts;
  },
  get active() {
    return activeShortcuts;
  },
  get byCategory() {
    return byCategory;
  },
  get byScope() {
    return byScope;
  },
  get scopeStack() {
    return scopeStack;
  },
  get initialized() {
    return initialized;
  },

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Call once on app startup. Loads user customisations and attaches the listener. */
  async init() {
    await loadCustomizations();
    attachListener();
    initialized = true;
  },

  /** Teardown — call on app unmount. */
  destroy() {
    detachListener();
    handlers.clear();
  },

  // ── Scope management ──────────────────────────────────────────────────

  /** Push a scope onto the stack (e.g. when entering a chat view). */
  pushScope(scope: ShortcutScope) {
    if (!scopeStack.includes(scope)) {
      scopeStack = [...scopeStack, scope];
    }
  },

  /** Remove a scope from the stack (e.g. when leaving a view). */
  popScope(scope: ShortcutScope) {
    if (scope === 'global') return; // global is always active
    if (!scopeStack.includes(scope)) return; // nothing to remove
    scopeStack = scopeStack.filter((s) => s !== scope);
  },

  /** Replace the entire scope stack (keeps global). */
  setScopes(scopes: ShortcutScope[]) {
    scopeStack = ['global', ...scopes.filter((s) => s !== 'global')];
  },

  // ── Handler registration ──────────────────────────────────────────────

  /** Bind a handler for a shortcut id. Returns an unbind function. */
  on(id: ShortcutId, handler: ShortcutHandler): () => void {
    handlers.set(id, handler);
    return () => handlers.delete(id);
  },

  /** Remove a handler. */
  off(id: ShortcutId) {
    handlers.delete(id);
  },

  // ── Customisation ─────────────────────────────────────────────────────

  /** Update the key combo(s) for a shortcut. Persists to SQLite. */
  async setKeys(id: ShortcutId, keys: KeyCombo[]): Promise<{ conflict: ShortcutDef | null }> {
    const def = registry.get(id);
    if (!def) return { conflict: null };

    // Check for conflicts
    for (const combo of keys) {
      const conflict = findConflict(combo, def.scope, id);
      if (conflict) return { conflict };
    }

    def.currentKeys = keys;
    // Trigger reactivity by re-assigning the map
    registry = new Map(registry);

    await persistOne(def);
    return { conflict: null };
  },

  /** Toggle enabled state for a shortcut. */
  async setEnabled(id: ShortcutId, enabled: boolean): Promise<void> {
    const def = registry.get(id);
    if (!def) return;
    def.enabled = enabled;
    registry = new Map(registry);
    await persistOne(def);
  },

  /** Reset a single shortcut to factory default. */
  async resetOne(id: ShortcutId): Promise<void> {
    const def = registry.get(id);
    if (!def) return;
    def.currentKeys = [...def.defaultKeys];
    def.enabled = true;
    registry = new Map(registry);
    await invoke('delete_shortcut_customization', { shortcut_id: id });
  },

  /** Reset ALL shortcuts to factory defaults. */
  async resetAll(): Promise<void> {
    registry = cloneDefaults();
    await invoke('reset_all_shortcut_customizations');
  },

  /** Persist all current state (bulk save). */
  async saveAll(): Promise<void> {
    await persistAll();
  },

  // ── Lookup helpers ────────────────────────────────────────────────────

  /** Get a single ShortcutDef by id. */
  get(id: ShortcutId): ShortcutDef | undefined {
    return registry.get(id);
  },

  /** Get the current key combo string for display. */
  getLabel(id: ShortcutId): string {
    const def = registry.get(id);
    return def ? def.currentKeys.join(', ') : '';
  },

  /** Find conflict for a given combo + scope. */
  findConflict,

  /** Normalise a keyboard event into a combo string (useful for "press a key" UI). */
  normalizeEvent,
};
