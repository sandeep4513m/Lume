<script>
  /**
   * @typedef {{size?: string, params?: string, speed?: string, family?: string, _numCtx?: number, _tier?: any} | null} ModelInfo
   */

  /** @type {{ modelInfo: ModelInfo, modelInfoLoading: boolean, hoveredModel: string, modelName: string }} */
  const { modelInfo, modelInfoLoading, hoveredModel, modelName } = $props();

  /** Derive a human-readable speed tier from parameter count (B) */
  /** @param {number} billions */
  function speedTier(billions) {
    if (billions <= 3)
      return { label: "Fast", color: "text-emerald-400", bars: 3 };
    if (billions <= 9)
      return { label: "Balanced", color: "text-amber-400", bars: 2 };
    if (billions <= 30)
      return { label: "Capable", color: "text-orange-400", bars: 2 };
    return { label: "Slow", color: "text-red-400", bars: 1 };
  }
</script>

{#if hoveredModel === modelName}
  <div
    class="absolute right-[calc(100%+10px)] top-0 w-52 pointer-events-none z-[60]"
    style="transform: translateY(min(0px, calc(100vh - 300px - var(--mouse-y, 0px))))"
  >
    <div
      class="bg-white/80 dark:bg-[#0d1117]/85 backdrop-blur-2xl border border-gray-200/50 dark:border-emerald-900/30 rounded-2xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.2)] dark:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.6)] p-3.5 space-y-2.5"
    >
      <!-- Header -->
      <div class="flex items-center space-x-2">
        <div
          class="w-7 h-7 rounded-lg bg-emerald-500/15 dark:bg-emerald-400/10 flex items-center justify-center shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-3.5 h-3.5 text-emerald-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"
            ></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"
            ></line><line x1="16" y1="16" x2="16" y2="16"></line></svg
          >
        </div>
        <div class="min-w-0">
          <p class="text-[12px] font-bold text-gray-800 dark:text-gray-100 truncate">
            {modelName.split(":")[0]}
          </p>
          <p class="text-[10px] text-gray-400 dark:text-gray-500">
            {modelName.includes(":") ? modelName.split(":")[1] : "latest"}
          </p>
        </div>
      </div>

      <!-- Divider -->
      <div
        class="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent"
      ></div>

      {#if modelInfoLoading}
        <!-- Skeleton loader -->
        <div class="space-y-2 animate-pulse">
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-3/4"></div>
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-1/2"></div>
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full w-2/3"></div>
        </div>
      {:else if modelInfo}
        <!-- Stats grid -->
        <div class="space-y-1.5">
          <!-- Disk size -->
          <div class="flex items-center justify-between">
            <span class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path
                  d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"
                ></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg
              >
              Size
            </span>
            <span class="text-[12px] font-semibold text-gray-700 dark:text-gray-200"
              >{modelInfo.size}</span
            >
          </div>

          <!-- Parameters -->
          <div class="flex items-center justify-between">
            <span class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><circle cx="12" cy="12" r="3"></circle><path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                ></path></svg
              >
              Params
            </span>
            <span class="text-[12px] font-semibold text-gray-700 dark:text-gray-200"
              >{modelInfo.params}</span
            >
          </div>

          <!-- Speed tier -->
          <div class="flex items-center justify-between">
            <span class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline></svg
              >
              Speed
            </span>
            <!-- Speed bars -->
            <div class="flex items-center gap-1">
              <div class="flex gap-0.5 items-end">
                {#each [1, 2, 3] as bar}
                  {@const tier = speedTier(
                    parseFloat((modelInfo.params || "0").replace(/[^\d.]/g, "")) || 0,
                  )}
                  <div
                    class="w-1.5 rounded-sm {bar <= tier.bars
                      ? tier.color.replace('text-', 'bg-')
                      : 'bg-gray-200 dark:bg-gray-700'}"
                    style="height: {bar * 4 + 2}px"
                  ></div>
                {/each}
              </div>
              <span
                class="text-[11px] font-semibold {speedTier(
                  parseFloat((modelInfo.params || '0').replace(/[^\d.]/g, '')) || 0,
                ).color}"
                >{speedTier(
                  parseFloat((modelInfo.params || "0").replace(/[^\d.]/g, "")) || 0,
                ).label}</span
              >
            </div>
          </div>

          <!-- Family tag -->
          {#if modelInfo.family && modelInfo.family !== modelName.split(":")[0]}
            <div class="pt-0.5">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              >
                {modelInfo.family}
              </span>
            </div>
          {/if}
        </div>
      {:else}
        <p class="text-[11px] text-gray-400 dark:text-gray-500 text-center py-1">
          Hover to load info…
        </p>
      {/if}
    </div>
    <!-- Arrow pointing right -->
    <div
      class="absolute right-[-5px] top-5 w-2.5 h-2.5 bg-white/80 dark:bg-[#0d1117]/85 border-r border-t border-gray-200/50 dark:border-emerald-900/30 rotate-45"
    ></div>
  </div>
{/if}
