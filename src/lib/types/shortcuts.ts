// ── Keyboard Shortcut System — Type Definitions ─────────────────────────────

/** All valid scopes a shortcut can belong to. */
export type ShortcutScope = 'global' | 'chat' | 'editor' | 'settings';

/** Canonical combo string, e.g. "Ctrl+Shift+K" or "Meta+P". */
export type KeyCombo = string;

/**
 * Unique compound key for every shortcut.
 * Format: "scope:action", e.g. "global:command_palette".
 */
export type ShortcutId = `${ShortcutScope}:${string}`;

/** Human-readable category used to group shortcuts in the UI. */
export type ShortcutCategory =
  | 'Navigation'
  | 'Editing'
  | 'Chat'
  | 'Window'
  | 'General';

/** Full definition of a single keyboard shortcut. */
export interface ShortcutDef {
  /** Compound ID, matches registry key — "scope:action". */
  id: ShortcutId;
  /** Scope this shortcut is active in. */
  scope: ShortcutScope;
  /** The action name within the scope. */
  action: string;
  /** Immutable factory combo(s). */
  defaultKeys: KeyCombo[];
  /** User's current combo(s). Matches defaultKeys until customised. */
  currentKeys: KeyCombo[];
  /** Human-readable description shown in settings / palette. */
  description: string;
  /** Grouping category for UI. */
  category: ShortcutCategory;
  /** Whether this shortcut is currently enabled. */
  enabled: boolean;
}

/** Shape stored / returned from the Rust SQLite layer. */
export interface ShortcutCustomization {
  id: ShortcutId;
  current_keys: string; // JSON-serialised KeyCombo[]
  enabled: boolean;
}

/** A handler function bound at runtime for a given shortcut. */
export type ShortcutHandler = (event: KeyboardEvent) => void | Promise<void>;

/** Map from ShortcutId → handler callback (set by runtime listeners). */
export type HandlerRegistry = Map<ShortcutId, ShortcutHandler>;
