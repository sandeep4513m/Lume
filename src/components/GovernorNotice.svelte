<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { governor } from '$lib/stores/governor.svelte';
  import type { GovernorDecision, RamStatus } from '$lib/stores/governor.svelte';

  let { onConfirm, onDismiss }: {
    onConfirm: () => void;
    onDismiss: () => void;
  } = $props();

  let decision = $derived(governor.pendingDecision);
  let showWhy = $state(false);
  let isUnloading = $state(false);
  let unloadFailed = $state(false);

  function formatMB(mb: number): string {
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb + ' MB';
  }

  function whyText(d: GovernorDecision, ram: RamStatus): string {
    if (d.type === 'critical') {
      return `Your system is using swap memory (${formatMB(ram.swap_used_mb)} of ${formatMB(ram.swap_total_mb)}). This means physical RAM is full. Running another model will cause severe lag or an unresponsive system.`;
    }
    return `Only ${formatMB(ram.free_mb)} of RAM is free. Loading "${(d as any).nextModel}" while "${(d as any).currentModel}" is active may cause slowdowns. Unloading the previous model frees memory safely.`;
  }

  async function handleConfirm() {
    isUnloading = true;
    unloadFailed = false;
    try {
      await onConfirm();
    } catch {
      unloadFailed = true;
    } finally {
      isUnloading = false;
    }
  }
</script>

{#if decision && decision.type !== 'allow'}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 200 }}
  ></div>

  <!-- Notice card -->
  <div
    class="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
           w-full max-w-sm bg-white dark:bg-[#111822] rounded-2xl shadow-2xl
           border border-gray-200 dark:border-gray-700 overflow-hidden"
    in:fly={{ y: 16, duration: 250 }}
    out:fly={{ y: 16, duration: 200 }}
  >
    <!-- Header -->
    <div class="px-5 pt-5 pb-4 flex items-start gap-3">
      <div class="shrink-0 mt-0.5">
        {#if decision.type === 'critical'}
          <div class="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
        {:else}
          <div class="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
        {/if}
      </div>

      <div class="flex-1 min-w-0">
        <p class="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
          {#if isUnloading}
            Unloading model…
          {:else if decision.type === 'critical'}
            System under pressure
          {:else}
            Switching model
          {/if}
        </p>
        <p class="text-[13px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
          {#if isUnloading}
            Sending stop signal to Ollama. System is under load — this may take a moment.
          {:else if decision.type === 'critical'}
            <span class="font-medium text-gray-700 dark:text-gray-300">"{decision.currentModel}"</span>
            is pushing into swap memory. Your system may lag or crash.
          {:else}
            Unloading <span class="font-medium text-gray-700 dark:text-gray-300">"{decision.currentModel}"</span>
            to free memory for
            <span class="font-medium text-gray-700 dark:text-gray-300">"{decision.nextModel}"</span>.
          {/if}
        </p>
      </div>
    </div>

    <!-- RAM bar -->
    {#if decision.ram && !isUnloading}
      {@const pct = Math.min(100, Math.round((decision.ram.used_mb / decision.ram.total_mb) * 100))}
      <div class="px-5 pb-3">
        <div class="flex justify-between text-[11px] text-gray-400 dark:text-gray-500 mb-1">
          <span>RAM {formatMB(decision.ram.used_mb)} / {formatMB(decision.ram.total_mb)}</span>
          {#if decision.ram.swap_used_mb > 0}
            <span class="text-red-400">Swap {formatMB(decision.ram.swap_used_mb)} used</span>
          {/if}
        </div>
        <div class="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            class="h-full rounded-full transition-all {pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-500'}"
            style="width: {pct}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- Unload failed fallback -->
    {#if unloadFailed}
      <div class="mx-5 mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-[12px] text-red-700 dark:text-red-300 leading-relaxed space-y-1">
        <p class="font-semibold">Unload timed out — system too slow to respond.</p>
        <p>Run this in terminal:</p>
        <code class="block font-mono bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded text-[11px] break-all">
          ollama stop {decision.currentModel}
        </code>
        <p class="text-[11px] text-red-500 dark:text-red-400">Or close Lume to free memory immediately.</p>
      </div>
    {/if}

    <!-- Why expand -->
    {#if showWhy && decision.ram && !isUnloading && !unloadFailed}
      <div class="mx-5 mb-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50 text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed">
        {whyText(decision, decision.ram)}
      </div>
    {/if}

    <!-- Actions -->
    <div class="px-5 pb-5 flex items-center gap-2">
      {#if !isUnloading && !unloadFailed}
        <button
          class="text-[12px] text-emerald-600 dark:text-emerald-400 hover:underline mr-auto"
          onclick={() => showWhy = !showWhy}
        >
          {showWhy ? 'Hide' : 'Why?'}
        </button>
      {:else}
        <span class="mr-auto"></span>
      {/if}

      {#if unloadFailed}
        <button
          class="px-3 py-1.5 rounded-lg text-[13px] font-medium
                 text-gray-600 dark:text-gray-300
                 bg-gray-100 dark:bg-gray-800
                 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onclick={onDismiss}
        >
          Close
        </button>
      {:else if isUnloading}
        <span class="px-3 py-1.5 text-[13px] text-gray-400 dark:text-gray-500 animate-pulse">
          Stopping…
        </span>
      {:else}
        <button
          class="px-3 py-1.5 rounded-lg text-[13px] font-medium
                 text-gray-600 dark:text-gray-300
                 bg-gray-100 dark:bg-gray-800
                 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onclick={onDismiss}
        >
          {decision.type === 'critical' ? 'Continue anyway' : 'Cancel'}
        </button>

        <button
          class="px-3 py-1.5 rounded-lg text-[13px] font-medium text-white transition-colors
                 {decision.type === 'critical'
                   ? 'bg-red-500 hover:bg-red-600'
                   : 'bg-emerald-500 hover:bg-emerald-600'}"
          onclick={handleConfirm}
        >
          Unload model
        </button>
      {/if}
    </div>
  </div>
{/if}
