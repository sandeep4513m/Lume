<script lang="ts">
  import { slide } from 'svelte/transition';
  import { governor } from '$lib/stores/governor.svelte';

  let { onClose }: { onClose: () => void } = $props();

  let ram = $derived(governor.ram);
  let hardware = $derived(governor.hardwareTier);
  let loadedModels = $derived(governor.loadedModels ?? []);
  let modelList = $derived(governor.modelList ?? []);
  let pressure = $derived(ram?.pressure ?? 'stable');
  let freeMB = $derived(ram?.free_mb ?? 0);

  function formatMB(mb: number): string {
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb.toFixed(0) + ' MB';
  }

  function pressureClasses(p: string) {
    if (p === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    if (p === 'warn') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  }

  function pressureLabel(p: string) {
    if (p === 'critical') return 'CRITICAL';
    if (p === 'warn') return 'ELEVATED';
    return 'STABLE';
  }

  function modelBadgeColor(estMB: number) {
    if (estMB < freeMB * 0.6) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    if (estMB < freeMB) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  }
</script>

<button
  type="button"
  class="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 w-full h-full border-none appearance-none cursor-default"
  onclick={onClose}
  aria-label="Close health panel"
></button>

<aside
  class="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-50 overflow-y-auto"
  transition:slide|local={{ duration: 200, axis: 'x' }}
>
  <!-- Header -->
  <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
    <h2 class="text-[15px] font-semibold text-gray-900 dark:text-gray-100">System Health</h2>
    <button
      class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-[18px] leading-none"
      onclick={onClose}
    >✕</button>
  </div>

  <div class="p-5 space-y-5">
    <!-- Status Badge -->
    <div class="flex items-center gap-2">
      <span class="px-2 py-1 rounded-md text-[11px] font-bold tracking-wide {pressureClasses(pressure)}">
        {pressureLabel(pressure)}
      </span>
      <span class="text-[12px] text-gray-500 dark:text-gray-400">System Pressure</span>
    </div>

    <!-- RAM Bar -->
    {#if ram}
      {@const pct = Math.min(100, Math.round((ram.used_mb / ram.total_mb) * 100))}
      <div>
        <div class="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
          <span>RAM {formatMB(ram.used_mb)} / {formatMB(ram.total_mb)}</span>
          <span>{pct}%</span>
        </div>
        <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            class="h-full rounded-full transition-all {pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-500'}"
            style="width: {pct}%"
          ></div>
        </div>
      </div>

      <!-- Swap Bar -->
      {#if ram.swap_total_mb > 0}
        {@const swapPct = Math.min(100, Math.round((ram.swap_used_mb / ram.swap_total_mb) * 100))}
        <div>
          <div class="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
            <span>Swap {formatMB(ram.swap_used_mb)} / {formatMB(ram.swap_total_mb)}</span>
            <span>{swapPct}%</span>
          </div>
          <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div class="h-full rounded-full bg-red-400 transition-all" style="width: {swapPct}%"></div>
          </div>
        </div>
      {/if}
    {/if}

    <!-- Hardware Tier -->
    {#if hardware}
      <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50">
        <p class="text-[12px] font-medium text-gray-700 dark:text-gray-300">{hardware.tier_label}</p>
        <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Max recommended: {hardware.max_recommended_params_b}</p>
      </div>
    {/if}

    <!-- Loaded Models -->
    <div>
      <h3 class="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2">Loaded Models</h3>
      {#if loadedModels.length === 0}
        <p class="text-[12px] text-gray-400 dark:text-gray-500 italic">No models loaded</p>
      {:else}
        <div class="space-y-2">
          {#each loadedModels as m}
            <div class="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/30">
              <div class="min-w-0 flex-1">
                <p class="text-[12px] font-medium text-gray-800 dark:text-gray-200 truncate">{m.name}</p>
                <p class="text-[11px] text-gray-500 dark:text-gray-400">{formatMB(m.size / 1024 / 1024)}</p>
              </div>
              <button
                class="ml-2 px-2 py-1 rounded text-[11px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                onclick={() => governor.unload(m.name)}
              >Unload</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Available Models -->
    <div>
      <h3 class="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2">Available Models</h3>
      {#if modelList.length === 0}
        <p class="text-[12px] text-gray-400 dark:text-gray-500 italic">No models found</p>
      {:else}
        <div class="space-y-2">
          {#each modelList.filter(m => !loadedModels.some(l => l.name === m.name)) as m}
            <div class="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/30">
              <div class="min-w-0 flex-1">
                <p class="text-[12px] font-medium text-gray-800 dark:text-gray-200 truncate">{m.name}</p>
                <p class="text-[11px] text-gray-500 dark:text-gray-400">{formatMB(m.ram_estimate_mb)}</p>
              </div>
              <span class="ml-2 px-2 py-0.5 rounded text-[10px] font-bold {modelBadgeColor(m.ram_estimate_mb)}">
                {m.ram_estimate_mb < freeMB * 0.6 ? 'SAFE' : m.ram_estimate_mb < freeMB ? 'WARN' : 'RISK'}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</aside>
