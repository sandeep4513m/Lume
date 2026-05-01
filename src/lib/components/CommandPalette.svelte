<script lang="ts">
  import { commandStore } from '$lib/stores/commands.svelte';
  import { onMount, tick } from 'svelte';

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const KEY_GLYPHS: Record<string, string> = isMac
    ? { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘', Enter: '↵', Escape: 'esc', Delete: '⌫', Backspace: '⌫', Tab: '⇥', Space: '␣', Up: '↑', Down: '↓', Left: '←', Right: '→' }
    : { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win', Enter: '↵', Escape: 'Esc', Delete: 'Del', Backspace: '⌫', Tab: 'Tab', Space: '␣', Up: '↑', Down: '↓', Left: '←', Right: '→' };

  function formatKeyPart(part: string): string {
    return KEY_GLYPHS[part] ?? part;
  }

  function parseCombo(combo: string): string[] {
    return combo.split('+').map(formatKeyPart);
  }

  let inputRef = $state<HTMLInputElement | null>(null);
  let listRef = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (commandStore.isOpen) {
      tick().then(() => inputRef?.focus());
    }
  });

  $effect(() => {
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

  const CATEGORY_ICONS: Record<string, string> = {
    Recent: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    Navigation: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
    Shortcuts: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    Actions: 'M13 10V3L4 14h7v7l9-11h-7z',
  };
</script>

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

<style>
  /* ── Backdrop ──────────────────────────────────────────────────────────── */
  .palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: palette-fade-in 120ms ease-out;
  }

  /* ── Modal container ───────────────────────────────────────────────────── */
  .palette-modal {
    width: 100%;
    max-width: 580px;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 16px;
    box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.20),
      0 8px 24px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 70vh;
    animation: palette-slide-up 150ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global(body.dark) .palette-modal {
    background: #161b22;
    border-color: rgba(255, 255, 255, 0.06);
  }

  /* ── Search bar ────────────────────────────────────────────────────────── */
  .palette-search {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  :global(body.dark) .palette-search {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }

  .palette-search-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: #9ca3af;
  }

  .palette-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 400;
    color: #111827;
    caret-color: #10b981;
  }

  .palette-search-input::placeholder {
    color: #9ca3af;
  }

  :global(body.dark) .palette-search-input {
    color: #e5e7eb;
  }

  .palette-clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 6px;
    color: #6b7280;
    cursor: pointer;
    transition: all 100ms ease;
  }
  .palette-clear-btn:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #374151;
  }
  :global(body.dark) .palette-clear-btn {
    background: rgba(255, 255, 255, 0.06);
    color: #9ca3af;
  }
  :global(body.dark) .palette-clear-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #e5e7eb;
  }

  /* ── Results list ──────────────────────────────────────────────────────── */
  .palette-results {
    overflow-y: auto;
    padding: 8px;
    flex: 1;
    min-height: 0;
  }

  .palette-results::-webkit-scrollbar {
    width: 6px;
  }
  .palette-results::-webkit-scrollbar-track {
    background: transparent;
  }
  .palette-results::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
  }
  :global(body.dark) .palette-results::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
  }

  /* ── Empty state ───────────────────────────────────────────────────────── */
  .palette-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    gap: 8px;
    color: #9ca3af;
  }
  .palette-empty p {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }
  .palette-empty-hint {
    font-size: 12px !important;
    font-weight: 400 !important;
    opacity: 0.7;
  }

  /* ── Group ──────────────────────────────────────────────────────────────── */
  .palette-group {
    margin-bottom: 4px;
  }

  .palette-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    user-select: none;
  }

  /* ── Individual command item ────────────────────────────────────────────── */
  .palette-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 80ms ease;
    gap: 12px;
  }

  .palette-item:hover,
  .palette-item-selected {
    background: rgba(16, 185, 129, 0.06);
  }
  .palette-item-selected {
    background: rgba(16, 185, 129, 0.10);
  }

  :global(body.dark) .palette-item:hover,
  :global(body.dark) .palette-item-selected {
    background: rgba(16, 185, 129, 0.08);
  }
  :global(body.dark) .palette-item-selected {
    background: rgba(16, 185, 129, 0.14);
  }

  .palette-item-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .palette-item-label {
    font-size: 14px;
    font-weight: 500;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(body.dark) .palette-item-label {
    color: #e5e7eb;
  }

  .palette-item-desc {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(body.dark) .palette-item-desc {
    color: #9ca3af;
  }

  /* ── Key Badges ────────────────────────────────────────────────────────── */
  .palette-item-keys {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .key-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    color: #6b7280;
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    white-space: nowrap;
    user-select: none;
  }

  :global(body.dark) .key-badge {
    color: #9ca3af;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .key-badge-sm {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    color: #9ca3af;
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 5px;
    white-space: nowrap;
    user-select: none;
  }

  :global(body.dark) .key-badge-sm {
    color: #6b7280;
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.06);
  }

  /* ── Footer ────────────────────────────────────────────────────────────── */
  .palette-footer {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    font-size: 12px;
    color: #9ca3af;
    user-select: none;
  }

  :global(body.dark) .palette-footer {
    border-top-color: rgba(255, 255, 255, 0.06);
  }

  .palette-footer-hint {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .palette-footer-count {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.6;
  }

  /* ── Animations ────────────────────────────────────────────────────────── */
  @keyframes palette-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes palette-slide-up {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
