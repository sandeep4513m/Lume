<script lang="ts">
  import { tick } from 'svelte';
  import { shortcutStore } from '$lib/stores/shortcuts.svelte';
  import KeyBadge from '$lib/components/KeyBadge.svelte';
  import type { ShortcutDef, ShortcutId } from '$lib/types/shortcuts';

  // ── Props ─────────────────────────────────────────────────────────────────
  /**
   * When set, the tab auto-scrolls to that shortcut row and pulses it.
   * Accepts a raw string so plain-JS parents can pass it without casting.
   */
  let { highlightId = null }: { highlightId?: string | null } = $props();

  // Internal alias with the strict brand type used by the store
  const highlightShortcutId = $derived(highlightId as ShortcutId | null);

  // ── Search State ──────────────────────────────────────────────────────────
  let searchQuery = $state('');

  // ── Capture State ─────────────────────────────────────────────────────────
  let capturingId = $state<ShortcutId | null>(null);
  let capturedCombo = $state<string | null>(null);
  let conflictError = $state<ShortcutDef | null>(null);

  // ── Scroll container ref ───────────────────────────────────────────────────
  let listEl = $state<HTMLDivElement | null>(null);

  // ── Auto-scroll + pulse when highlightId changes ──────────────────────────
  $effect(() => {
    const id = highlightShortcutId;
    if (!id || !listEl) return;

    // Pulse fades after 2 s
    let pulseTimer: ReturnType<typeof setTimeout>;

    tick().then(() => {
      const row = listEl?.querySelector(`[data-shortcut-id="${id}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('shortcut-pulse');
        pulseTimer = setTimeout(() => row.classList.remove('shortcut-pulse'), 2000);
      }
    });

    return () => clearTimeout(pulseTimer);
  });

  // ── Derived filtered ───────────────────────────────────────────────────────


  const filteredCategories = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    const result: Array<{ category: string; items: ShortcutDef[] }> = [];

    const order = ['General', 'Navigation', 'Chat', 'Editing', 'Window'];
    const groups = shortcutStore.byCategory;

    for (const cat of order) {
      if (!groups[cat]) continue;
      const items = groups[cat].filter((def: ShortcutDef) => {
        if (!q) return true;
        return (
          def.action.toLowerCase().includes(q) ||
          def.description.toLowerCase().includes(q) ||
          shortcutStore.getLabel(def.id).toLowerCase().includes(q)
        );
      });
      if (items.length > 0) result.push({ category: cat, items });
    }

    for (const cat in groups) {
      if (order.includes(cat)) continue;
      const items = groups[cat].filter((def: ShortcutDef) => {
        if (!q) return true;
        return (
          def.action.toLowerCase().includes(q) ||
          def.description.toLowerCase().includes(q) ||
          shortcutStore.getLabel(def.id).toLowerCase().includes(q)
        );
      });
      if (items.length > 0) result.push({ category: cat, items });
    }

    return result;
  });

  // ── Capture actions ────────────────────────────────────────────────────────
  function startCapture(id: ShortcutId) {
    if (capturingId === id) { cancelCapture(); return; }
    capturingId = id;
    capturedCombo = null;
    conflictError = null;
  }

  function cancelCapture() {
    capturingId = null;
    capturedCombo = null;
    conflictError = null;
  }

  async function handleKeydown(e: KeyboardEvent) {
    if (!capturingId) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') { cancelCapture(); return; }

    const combo = shortcutStore.normalizeEvent(e);
    if (['Ctrl', 'Alt', 'Shift', 'Meta'].includes(combo)) return;

    capturedCombo = combo;
    const def = shortcutStore.get(capturingId);
    if (!def) { cancelCapture(); return; }

    const conflict = shortcutStore.findConflict(combo, def.scope, capturingId);
    if (conflict) { conflictError = conflict; return; }

    await shortcutStore.setKeys(capturingId, [combo]);
    cancelCapture();
  }

  $effect(() => {
    if (capturingId) {
      window.addEventListener('keydown', handleKeydown, { capture: true });
      return () => window.removeEventListener('keydown', handleKeydown, { capture: true });
    }
  });

  async function resetAll() {
    if (confirm('Restore ALL shortcuts to factory defaults?')) {
      await shortcutStore.resetAll();
      cancelCapture();
    }
  }

  async function resetOne(e: Event, id: ShortcutId) {
    e.stopPropagation();
    await shortcutStore.resetOne(id);
    if (capturingId === id) cancelCapture();
  }
</script>

<div class="flex flex-col h-full space-y-4">
  <!-- Top Bar: Search & Reset All -->
  <div class="flex items-center space-x-3 shrink-0">
    <div class="relative flex-1">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      </div>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search shortcuts…"
        class="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 rounded-xl text-[13px] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
      />
      {#if searchQuery}
        <button
          onclick={() => searchQuery = ''}
          class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Clear search"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      {/if}
    </div>

    <button
      onclick={resetAll}
      class="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-[#1a212c] dark:hover:bg-[#222a38] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-[13px] font-medium transition-colors"
      title="Restore all to defaults"
    >
      Reset All
    </button>
  </div>

  <!-- Shortcuts List -->
  <div class="flex-1 overflow-y-auto px-1 -mx-1" bind:this={listEl}>
    {#if filteredCategories.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 space-y-2 py-12">
        <svg class="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <p class="text-[13px] font-medium">No shortcuts match.</p>
      </div>
    {:else}
      <div class="space-y-6 pb-4">
        {#each filteredCategories as { category, items }}
          <div class="space-y-2">
            <h3 class="text-[12px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider pl-1">{category}</h3>

            <div class="space-y-1">
              {#each items as def (def.id)}
                {@const isCapturing = capturingId === def.id}
                {@const isModified = JSON.stringify(def.currentKeys) !== JSON.stringify(def.defaultKeys)}
                {@const isHighlighted = highlightShortcutId === def.id}

                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  data-shortcut-id={def.id}
                  class="group flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer
                    {isCapturing
                      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 shadow-sm'
                      : isHighlighted
                        ? 'bg-emerald-50/80 border-emerald-300 dark:bg-emerald-900/25 dark:border-emerald-700'
                        : 'bg-white border-white hover:border-gray-200 dark:bg-[#161b22] dark:border-[#161b22] dark:hover:border-gray-700 hover:shadow-sm'}"
                  onclick={() => startCapture(def.id)}
                >
                  <div class="flex flex-col min-w-0 pr-4">
                    <span class="text-[14px] font-medium text-gray-900 dark:text-gray-100 truncate">{def.description}</span>
                    <span class="text-[12px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">{def.scope} · {def.action}</span>

                    {#if isCapturing && conflictError}
                      <span class="text-[12px] text-red-500 dark:text-red-400 font-medium mt-1.5 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        Already used by "{conflictError.description}"
                      </span>
                    {:else if isCapturing}
                      <span class="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5 flex items-center gap-1.5">
                        <span class="animate-pulse w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                        Press new combo, or Esc to cancel…
                      </span>
                    {/if}
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <!-- Key combo: show captured preview while recording, else current keys -->
                    {#if isCapturing && capturedCombo}
                      <KeyBadge combo={capturedCombo} active />
                    {:else if def.currentKeys.length > 0}
                      <KeyBadge combo={def.currentKeys[0]} active={isHighlighted} />
                    {:else}
                      <KeyBadge combo="" dim />
                    {/if}

                    <!-- Reset button — shown only when customised -->
                    <div class="w-8 flex justify-center ml-1 opacity-0 group-hover:opacity-100 transition-opacity" class:opacity-100={isModified}>
                      {#if isModified}
                        <button
                          class="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          onclick={(e) => resetOne(e, def.id)}
                          title="Reset to default"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Pulse animation — added/removed via JS in $effect */
  :global(.shortcut-pulse) {
    animation: shortcut-highlight-pulse 2s ease-out forwards;
  }

  @keyframes shortcut-highlight-pulse {
    0%   { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.5); }
    60%  { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.2); }
    100% { box-shadow: 0 0 0 0px rgba(16, 185, 129, 0); }
  }
</style>
