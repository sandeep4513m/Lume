<script lang="ts">
  import './CommandPalette.css';
  import { commandStore } from '$lib/stores/commands.svelte';
  import { onMount, tick } from 'svelte';

  // -- Platform detection for glyph rendering ------------------------------
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  /** Map modifier names → platform-appropriate glyphs. */
  const KEY_GLYPHS: Record<string, string> = isMac
    ? { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘', Enter: '↵', Escape: 'esc', Delete: '⌫', Backspace: '⌫', Tab: '⇥', Space: '␣', Up: '↑', Down: '↓', Left: '←', Right: '→' }
    : { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win', Enter: '↵', Escape: 'Esc', Delete: 'Del', Backspace: '⌫', Tab: 'Tab', Space: '␣', Up: '↑', Down: '↓', Left: '←', Right: '→' };

  function formatKeyPart(part: string): string {
    return KEY_GLYPHS[part] ?? part;
  }

  /** Parse a combo string like "Ctrl+Shift+K" into displayable segments. */
  function parseCombo(combo: string): string[] {
    return combo.split('+').map(formatKeyPart);
  }

  // -- Refs ----------------------------------------------------------------
  let inputRef = $state<HTMLInputElement | null>(null);
  let listRef = $state<HTMLDivElement | null>(null);

  // -- Reactive reads from store ------------------------------------------─
  // We access these through the store's getters so Svelte tracks them.

  // -- Auto-focus input when palette opens --------------------------------─
  $effect(() => {
    if (commandStore.isOpen) {
      tick().then(() => inputRef?.focus());
    }
  });

  // -- Scroll selected item into view --------------------------------------
  $effect(() => {
    // Read selectedIndex to subscribe
    const idx = commandStore.selectedIndex;
    if (!listRef || idx < 0) return;
    tick().then(() => {
      const el = listRef?.querySelector(`[data-idx="${idx}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    });
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!commandStore.isOpen) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        commandStore.moveUp();
        break;
      case 'ArrowDown':
        e.preventDefault();
        commandStore.moveDown();
        break;
      case 'Enter':
        e.preventDefault();
        commandStore.executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        commandStore.close();
        break;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement)?.dataset?.backdrop === 'true') {
      commandStore.close();
    }
  }

  /** Category section icons (SVG path data, 24×24 viewBox). */
  const CATEGORY_ICONS: Record<string, string> = {
    Recent: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    Navigation: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
    Shortcuts: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    Actions: 'M13 10V3L4 14h7v7l9-11h-7z',
  };
</script>

<!--
  CommandPalette.svelte — Full-screen overlay command palette.
  Mounts as portal via <svelte:body> trick — renders outside normal DOM flow.
  Keyboard: ↑/↓ navigate, Enter fires, Escape closes.
-->

{#if commandStore.isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="palette-backdrop"
    data-backdrop="true"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div class="palette-modal" role="dialog" aria-label="Command palette" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <!-- Search input -->
      <div class="palette-search">
        <svg class="palette-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
        <input
          bind:this={inputRef}
          type="text"
          class="palette-search-input"
          placeholder="Type a command…"
          value={commandStore.query}
          oninput={(e) => commandStore.setQuery((e.target as HTMLInputElement).value)}
          autocomplete="off"
          spellcheck="false"
        />
        {#if commandStore.query}
          <button
            class="palette-clear-btn"
            onclick={() => commandStore.setQuery('')}
            aria-label="Clear search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        {/if}
      </div>

      <!-- Results -->
      <div class="palette-results" bind:this={listRef}>
        {#if commandStore.resultCount === 0}
          <div class="palette-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <p>No commands found</p>
            <p class="palette-empty-hint">Try a different search term</p>
          </div>
        {:else}
          {#each commandStore.grouped as group}
            <div class="palette-group">
              <div class="palette-group-header">
                {#if CATEGORY_ICONS[group.category]}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                    <path d={CATEGORY_ICONS[group.category]}/>
                  </svg>
                {/if}
                {group.category}
              </div>
              {#each group.items as cmd}
                {@const flatIdx = commandStore.flat.indexOf(cmd)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="palette-item"
                  class:palette-item-selected={flatIdx === commandStore.selectedIndex}
                  data-idx={flatIdx}
                  onmouseenter={() => commandStore.setIndex(flatIdx)}
                  onclick={() => { commandStore.setIndex(flatIdx); commandStore.executeSelected(); }}
                >
                  <div class="palette-item-content">
                    <span class="palette-item-label">{cmd.label}</span>
                    {#if cmd.description}
                      <span class="palette-item-desc">{cmd.description}</span>
                    {/if}
                  </div>
                  {#if cmd.shortcut}
                    <div class="palette-item-keys">
                      {#each parseCombo(cmd.shortcut) as part}
                        <kbd class="key-badge">{part}</kbd>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer -->
      <div class="palette-footer">
        <div class="palette-footer-hint">
          <kbd class="key-badge-sm">↑</kbd>
          <kbd class="key-badge-sm">↓</kbd>
          <span>navigate</span>
        </div>
        <div class="palette-footer-hint">
          <kbd class="key-badge-sm">↵</kbd>
          <span>select</span>
        </div>
        <div class="palette-footer-hint">
          <kbd class="key-badge-sm">esc</kbd>
          <span>close</span>
        </div>
        <div class="palette-footer-count">
          {commandStore.resultCount} command{commandStore.resultCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  </div>
{/if}
