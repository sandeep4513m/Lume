<!--
  KeyBadge.svelte — Platform-aware keyboard combo renderer.
  Splits a combo string like "Ctrl+Shift+K" into individual styled badges.
  Renders Mac glyphs (⌘⇧⌥⌃) on macOS and text tokens on other platforms.

  Props:
    combo   — canonical combo string, e.g. "Ctrl+Shift+K" or "Meta+P"
    dim     — if true, renders in muted/secondary style (for inactive rows)
    active  — if true, renders in emerald active/highlight style
    size    — "sm" | "md" (default "md")
-->
<script lang="ts">
  const {
    combo = '',
    dim = false,
    active = false,
    size = 'md',
  }: {
    combo: string;
    dim?: boolean;
    active?: boolean;
    size?: 'sm' | 'md';
  } = $props();

  // Platform detection — runs once, never changes
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const GLYPH: Record<string, string> = isMac
    ? {
        Ctrl: '⌃',
        Alt: '⌥',
        Shift: '⇧',
        Meta: '⌘',
        Enter: '↵',
        Escape: 'esc',
        Delete: '⌫',
        Backspace: '⌫',
        Tab: '⇥',
        Space: '␣',
        Up: '↑',
        Down: '↓',
        Left: '←',
        Right: '→',
        PageUp: 'pgup',
        PageDown: 'pgdn',
        Home: 'home',
        End: 'end',
      }
    : {
        Ctrl: 'Ctrl',
        Alt: 'Alt',
        Shift: 'Shift',
        Meta: 'Win',
        Enter: '↵',
        Escape: 'Esc',
        Delete: 'Del',
        Backspace: '⌫',
        Tab: 'Tab',
        Space: '␣',
        Up: '↑',
        Down: '↓',
        Left: '←',
        Right: '→',
        PageUp: 'PgUp',
        PageDown: 'PgDn',
        Home: 'Home',
        End: 'End',
      };

  function glyph(part: string): string {
    return GLYPH[part] ?? part;
  }

  const parts = $derived(
    combo
      ? combo.split('+').map(glyph)
      : [],
  );
</script>

{#if parts.length}
  <span class="key-combo" class:key-combo-sm={size === 'sm'}>
    {#each parts as part, i}
      {#if i > 0}
        <span class="key-sep" class:key-sep-dim={dim}>+</span>
      {/if}
      <kbd
        class="key-badge"
        class:key-badge-sm={size === 'sm'}
        class:key-badge-dim={dim}
        class:key-badge-active={active}
      >{part}</kbd>
    {/each}
  </span>
{:else}
  <span class="key-unbound" class:key-unbound-sm={size === 'sm'}>—</span>
{/if}

<style>
  .key-combo {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .key-sep {
    font-size: 10px;
    color: #9ca3af;
    user-select: none;
    line-height: 1;
    margin: 0 -1px;
  }
  .key-sep-dim {
    opacity: 0.5;
  }

  .key-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    height: 24px;
    padding: 0 6px;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    user-select: none;
    border-radius: 6px;

    /* Light default */
    color: #374151;
    background: #f9fafb;
    border: 1px solid #d1d5db;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8) inset;
    transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
  }

  /* Dark mode via body.dark class */
  :global(body.dark) .key-badge {
    color: #d1d5db;
    background: #1e2633;
    border-color: #374151;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.04) inset;
  }

  /* Dim style */
  .key-badge-dim {
    color: #9ca3af;
    background: rgba(0,0,0,0.03);
    border-color: #e5e7eb;
    box-shadow: none;
  }
  :global(body.dark) .key-badge-dim {
    color: #6b7280;
    background: rgba(255,255,255,0.03);
    border-color: rgba(255,255,255,0.06);
  }

  /* Active / highlighted style (emerald) */
  .key-badge-active {
    color: #059669;
    background: #ecfdf5;
    border-color: #a7f3d0;
    box-shadow: 0 0 0 2px rgba(16,185,129,0.15);
  }
  :global(body.dark) .key-badge-active {
    color: #34d399;
    background: rgba(16,185,129,0.12);
    border-color: rgba(52,211,153,0.25);
    box-shadow: 0 0 0 2px rgba(52,211,153,0.1);
  }

  /* Small variant */
  .key-badge-sm {
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    font-size: 10.5px;
    border-radius: 5px;
  }
  .key-combo-sm {
    gap: 2px;
  }

  .key-unbound {
    font-size: 14px;
    color: #d1d5db;
    user-select: none;
  }
  :global(body.dark) .key-unbound {
    color: #374151;
  }
  .key-unbound-sm {
    font-size: 12px;
  }
</style>
