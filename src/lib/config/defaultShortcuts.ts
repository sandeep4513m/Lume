// ── Default Shortcuts Registry ───────────────────────────────────────────────
import type { ShortcutDef, ShortcutId } from '$lib/types/shortcuts';

/**
 * Helper to detect platform for Meta vs Ctrl.
 * At import-time `navigator` exists in the Tauri webview.
 */
const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Platform-aware modifier: Cmd on macOS, Ctrl everywhere else. */
const MOD = isMac ? 'Meta' : 'Ctrl';

/** Build a ShortcutDef with sane defaults. */
function def(
  scope: ShortcutDef['scope'],
  action: string,
  keys: string[],
  description: string,
  category: ShortcutDef['category'],
): ShortcutDef {
  const id = `${scope}:${action}` as ShortcutId;
  return {
    id,
    scope,
    action,
    defaultKeys: keys,
    currentKeys: [...keys],
    description,
    category,
    enabled: true,
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

const shortcuts: ShortcutDef[] = [
  // ── Global ──────────────────────────────────────────────────────────────
  def('global', 'command_palette',  [`${MOD}+K`],          'Command Palette',            'Navigation'),
  def('global', 'new_chat',         [`${MOD}+N`],          'New Chat',                   'Chat'),
  def('global', 'toggle_sidebar',   [`${MOD}+B`],          'Toggle Sidebar',             'Window'),
  def('global', 'toggle_settings',  [`${MOD}+,`],          'Settings',                   'Navigation'),
  def('global', 'open_codex',    [`${MOD}+C`],  'Lume Codex',         'Navigation'),
  def('global', 'open_settings', [`${MOD}+I`],  'Settings',            'Navigation'),
  def('global', 'open_profile',  [`${MOD}+P`],  'Profile',             'Navigation'),
  def('global', 'search',           [`${MOD}+F`],          'Search',                     'Navigation'),
  def('global', 'close_panel',      ['Escape'],            'Close Panel',                'Window'),
  def('global', 'zoom_in',          [`${MOD}+=`],          'Zoom In',                    'Window'),
  def('global', 'zoom_out',         [`${MOD}+-`],          'Zoom Out',                   'Window'),
  def('global', 'zoom_reset',       [`${MOD}+0`],          'Reset Zoom',                 'Window'),

  // ── Chat ────────────────────────────────────────────────────────────────
  def('chat', 'send_message',       ['Enter'],             'Send Message',               'Chat'),
  def('chat', 'new_line',           ['Shift+Enter'],       'New Line',                   'Editing'),
  def('chat', 'regenerate',         [`${MOD}+Shift+R`],    'Regenerate',                 'Chat'),
  def('chat', 'stop_generation',    [`${MOD}+Shift+S`],    'Stop Generation',            'Chat'),
  def('chat', 'copy_last_response', [`${MOD}+Shift+C`],    'Copy Response',              'Chat'),
  def('chat', 'clear_chat',         [`${MOD}+Shift+Delete`], 'Clear Chat',               'Chat'),
  def('chat', 'focus_input',        [`${MOD}+L`],          'Focus Input',                'Navigation'),
  def('chat', 'scroll_to_bottom',   [`${MOD}+End`],        'Scroll to Bottom',           'Navigation'),

  // ── Editor ──────────────────────────────────────────────────────────────
  def('editor', 'undo',             [`${MOD}+Z`],          'Undo',                       'Editing'),
  def('editor', 'redo',             [`${MOD}+Shift+Z`],    'Redo',                       'Editing'),

  // ── Settings ────────────────────────────────────────────────────────────
  def('settings', 'save',           [`${MOD}+S`],          'Save Settings',              'General'),
  def('settings', 'reset',          [`${MOD}+Shift+R`],    'Reset Settings',             'General'),
  def('settings', 'close',          ['Escape'],            'Close Settings',             'Navigation'),
];

/** Immutable factory registry keyed by ShortcutId. */
export const DEFAULT_SHORTCUTS: Map<ShortcutId, ShortcutDef> = new Map(
  shortcuts.map((s) => [s.id, s]),
);

/** Get a fresh deep-copy of the entire default set (safe to mutate). */
export function cloneDefaults(): Map<ShortcutId, ShortcutDef> {
  return new Map(
    shortcuts.map((s) => [
      s.id,
      { ...s, defaultKeys: [...s.defaultKeys], currentKeys: [...s.currentKeys] },
    ]),
  );
}
