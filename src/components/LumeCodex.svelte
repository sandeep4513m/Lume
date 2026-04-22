<script lang="ts">
  import { fade, fly, slide } from 'svelte/transition';
  import { shortcutStore } from '$lib/stores/shortcuts.svelte';
  import KeyBadge from '$lib/components/KeyBadge.svelte';
  import type { ShortcutDef, ShortcutId, ShortcutScope } from '$lib/types/shortcuts';

  let { isOpen = false, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  // ── Keyboard press highlight ─────────────────────────────────────────────
  let lastPressedCombo = $state('');

  // ── Scope accordion expansion state ─────────────────────────────────────
  let expandedScopes = $state<Set<ShortcutScope>>(new Set(['global', 'chat']));

  // ── "Under the Hood" accordion ───────────────────────────────────────────
  let isThinkExpanded = $state(false);

  // ── Scope display config ─────────────────────────────────────────────────
  const SCOPE_META: Record<ShortcutScope, { label: string; icon: string; description: string }> = {
    global: {
      label: 'Global',
      description: 'Active everywhere in the application',
      icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
    },
    chat: {
      label: 'Chat',
      description: 'Active during a conversation',
      icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
    },
    editor: {
      label: 'Editor',
      description: 'Active while editing code or prompts',
      icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    },
    settings: {
      label: 'Settings',
      description: 'Active in the settings panel',
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    },
  };

  const SCOPE_ORDER: ShortcutScope[] = ['global', 'chat', 'editor', 'settings'];

  // ── Reactive store data ───────────────────────────────────────────────────
  // byScope is a $derived inside the store — accessing it here tracks reactivity
  const scopeGroups = $derived(shortcutStore.byScope);

  // ── Keyboard highlight listener ───────────────────────────────────────────
  $effect(() => {
    if (!isOpen) return;

    let clearTimer: ReturnType<typeof setTimeout>;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        lastPressedCombo = 'Escape';
      } else {
        lastPressedCombo = shortcutStore.normalizeEvent(e);
      }
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => { lastPressedCombo = ''; }, 600);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(clearTimer);
    };
  });

  // ── Edit button → open Settings → Shortcuts → highlight row ──────────────
  function openShortcutEdit(id: ShortcutId) {
    onClose();
    // Small delay so Codex closes before Settings opens (avoids z-index flash)
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('lume:open_keybinding', { detail: { id } }),
      );
    }, 160);
  }

  function toggleScope(scope: ShortcutScope) {
    const next = new Set(expandedScopes);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    expandedScopes = next;
  }

  // Check if the last pressed combo matches a shortcut's current keys
  function isHighlighted(def: ShortcutDef): boolean {
    return lastPressedCombo !== '' && def.currentKeys.includes(lastPressedCombo);
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-sm cursor-default transition-all"
    onclick={onClose}
    in:fade={{ duration: 300 }}
    out:fade={{ duration: 300 }}
    aria-label="Close Lume Codex"
  ></button>

  <!-- Drawer -->
  <aside
    class="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white/90 dark:bg-[#111822]/90 backdrop-blur-xl border-l border-gray-200 dark:border-gray-800 shadow-[0_0_40px_rgba(0,0,0,0.1)] dark:shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-y-auto flex flex-col"
    in:fly={{ x: '100%', duration: 350, opacity: 1, delay: 0 }}
    out:fly={{ x: '100%', duration: 300, opacity: 1 }}
  >
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-800 shrink-0 sticky top-0 bg-white/50 dark:bg-[#111822]/50 backdrop-blur-md z-10">
      <div class="flex items-center gap-3">
        <div class="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <h2 class="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-300 bg-clip-text text-transparent tracking-tight">
          Lume Codex
        </h2>
      </div>
      <button
        class="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
        onclick={onClose}
        aria-label="Close Codex"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </header>

    <div class="flex-1 p-6 space-y-10 overflow-y-auto">

      <!-- ── 1. Privacy First ─────────────────────────────────────────────── -->
      <section class="group">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
          Privacy First
        </h3>
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 relative overflow-hidden transition-all duration-300 group-hover:shadow-md">
          <div class="absolute -right-4 -top-4 text-emerald-500/10 dark:text-emerald-400/5 transition-transform duration-500 group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="relative z-10">
            <h4 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">100% Local Inference</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Lume routes your prompts directly to your local Ollama instance. Your conversations, ideas, and code <strong>never leave your machine</strong>. We believe your thoughts should remain yours.
            </p>
          </div>
        </div>
      </section>

      <!-- ── 2. Under the Hood ───────────────────────────────────────────── -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
          Under the Hood
        </h3>

        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
          <button
            class="w-full px-5 py-4 flex items-center justify-between bg-white dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            onclick={() => isThinkExpanded = !isThinkExpanded}
          >
            <span class="font-semibold text-gray-900 dark:text-gray-100 text-sm">Reasoning Models &amp; &lt;think&gt; tags</span>
            <svg
              xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="text-gray-500 transition-transform duration-300 {isThinkExpanded ? 'rotate-180' : ''}"
            ><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {#if isThinkExpanded}
            <div transition:slide={{ duration: 300 }} class="px-5 pb-5 pt-2">
              <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                Advanced models like DeepSeek-R1 output their reasoning process inside special <code>&lt;think&gt;</code> blocks before answering.
              </p>

              <div class="space-y-3 relative before:absolute before:inset-0 before:bg-gradient-to-t before:from-gray-50 dark:before:from-gray-800/50 before:to-transparent before:z-10 before:h-full">
                <div class="flex gap-2">
                  <div class="w-1 bg-emerald-500 rounded-full"></div>
                  <div class="text-xs text-gray-500 font-mono bg-gray-200/50 dark:bg-black/30 p-2 rounded-md italic">
                    <span class="text-emerald-600 dark:text-emerald-400 opacity-70">thinking...</span><br/>
                    1. Analyze the user's prompt<br/>
                    2. Check dependencies<br/>
                    3. Formulate solution
                  </div>
                </div>
                <div class="text-sm text-gray-800 dark:text-gray-200">
                  Here is the optimized Svelte component you requested.
                </div>
              </div>
              <p class="text-[13px] text-emerald-600 dark:text-emerald-400 mt-4 font-medium">
                Lume intelligently parses these tags, allowing you to collapse the "thinking" process and focus on the final answer.
              </p>
            </div>
          {/if}
        </div>
      </section>

      <!-- ── 3. Keyboard Mastery (live from store, grouped by scope) ────── -->
      <section>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" ry="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01M10 18h4"/></svg>
            Keyboard Mastery
          </h3>
          <button
            class="text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium transition-colors"
            onclick={() => window.dispatchEvent(new CustomEvent('lume:open_keybinding', { detail: { id: null } }))}
          >
            Edit all →
          </button>
        </div>

        <!-- Press-to-highlight tip -->
        {#if lastPressedCombo}
          <div class="mb-3 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/40 text-[12px] text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-2 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Detected: {lastPressedCombo}
          </div>
        {/if}

        <div class="space-y-4">
          {#each SCOPE_ORDER as scope}
            {@const defs = scopeGroups[scope] ?? []}
            {@const meta = SCOPE_META[scope]}
            {#if defs.length > 0}
              <div class="rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
                <!-- Scope header (accordion toggle) -->
                <button
                  class="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800/80 hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors text-left"
                  onclick={() => toggleScope(scope)}
                >
                  <div class="flex items-center gap-2.5">
                    <div class="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={meta.icon}/></svg>
                    </div>
                    <div>
                      <span class="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{meta.label}</span>
                      <span class="ml-2 text-[11px] text-gray-400 dark:text-gray-500">{defs.length} shortcut{defs.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="text-gray-400 transition-transform duration-200 {expandedScopes.has(scope) ? 'rotate-180' : ''}"
                  ><path d="m6 9 6 6 6-6"/></svg>
                </button>

                <!-- Shortcut rows -->
                {#if expandedScopes.has(scope)}
                  <div transition:slide={{ duration: 200 }} class="divide-y divide-gray-100 dark:divide-gray-700/30 bg-gray-50/50 dark:bg-gray-800/30">
                    {#each defs as def (def.id)}
                      {@const highlighted = isHighlighted(def)}
                      {@const isModified = JSON.stringify(def.currentKeys) !== JSON.stringify(def.defaultKeys)}
                      <div
                        class="group flex items-center justify-between px-4 py-3 transition-colors"
                        class:bg-emerald-50={highlighted}
                        class:dark:bg-emerald-900={highlighted}
                        style={highlighted ? 'box-shadow: 0 0 12px rgba(16,185,129,0.15) inset;' : ''}
                      >
                        <div class="flex-1 min-w-0 pr-4">
                          <p class="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate">{def.description}</p>
                          {#if isModified}
                            <p class="text-[11px] text-amber-500 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                              Customised
                            </p>
                          {/if}
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                          <!-- Key badge(s) — live from store -->
                          {#each def.currentKeys as combo (combo)}
                            <KeyBadge {combo} active={highlighted} />
                          {/each}
                          {#if def.currentKeys.length === 0}
                            <KeyBadge combo="" dim />
                          {/if}

                          <!-- Edit button — hidden by default, revealed on hover -->
                          <button
                            class="ml-1 px-2 py-1 rounded-md text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity
                              text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800"
                            onclick={() => openShortcutEdit(def.id)}
                            title="Edit in Settings → Shortcuts"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>

        <!-- Tip bar -->
        <p class="mt-4 text-[11px] text-gray-400 dark:text-gray-600 text-center flex items-center justify-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Press any shortcut while this panel is open to highlight it
        </p>
      </section>

      <!-- Footer -->
      <footer class="pt-6 border-t border-gray-200/50 dark:border-gray-800/50 flex flex-col items-center gap-2">
        <p class="text-xs text-gray-400 dark:text-gray-500">Lume is built with ❤️ using Tauri &amp; Svelte 5</p>
        <button
          class="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400 font-medium transition-colors"
          onclick={onClose}
        >
          Dismiss Codex
        </button>
      </footer>
    </div>
  </aside>
{/if}
