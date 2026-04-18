<script>
  import { slide } from 'svelte/transition';

  /** @type {{ thinkContent: string, isGenerating?: boolean, showSetting?: boolean, isThinkingFinished?: boolean }} */
  let { 
    thinkContent = '', 
    isGenerating = false, 
    showSetting = true, 
    isThinkingFinished = false 
  } = $props();

  let isExpanded = $state(false);
  let manuallyToggled = $state(false);

  // Hybrid auto-expand/collapse logic
  $effect(() => {
    // Only automate if there's actually content and the user hasn't explicitly overridden it
    if (!manuallyToggled && showSetting && thinkContent.length > 0) {
      if (isGenerating && !isThinkingFinished) {
        // Expand while we are receiving think tokens actively
        isExpanded = true;
      } else if (isThinkingFinished || !isGenerating) {
        // Collapse as soon as thinking finishes (</think> received) or generation completes
        isExpanded = false;
      }
    }
  });

  let wordCount = $derived(thinkContent.trim() ? thinkContent.trim().split(/\s+/).length : 0);
</script>

{#if showSetting && thinkContent}
  <div class="mb-4 rounded-xl border border-violet-200/50 dark:border-violet-900/30 bg-violet-50/10 dark:bg-[#13111c]/50 backdrop-blur-sm overflow-hidden shadow-sm">
    
    <button
      type="button"
      onclick={() => {
        isExpanded = !isExpanded;
        manuallyToggled = true; // prevent auto-collapsing over the user's explicit choice
      }}
      class="w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-medium font-sans transition-colors select-none text-violet-600/80 dark:text-violet-400/80 hover:bg-violet-100/40 dark:hover:bg-violet-900/40"
    >
      <div class="flex items-center space-x-2">
        <!-- Brain/Process icon -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="{isGenerating && !isThinkingFinished ? 'text-violet-500 animate-pulse' : 'text-violet-600 dark:text-violet-500'}">
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
        </svg>
        
        <span class="font-semibold">{isGenerating && !isThinkingFinished ? 'Thinking' : 'Thought Process'}</span>
        
        {#if isGenerating && !isThinkingFinished}
          <span class="flex space-x-0.5 items-center ml-1">
            <span class="w-1 h-1 bg-violet-500 rounded-full animate-bounce" style="animation-delay:0s"></span>
            <span class="w-1 h-1 bg-violet-500 rounded-full animate-bounce" style="animation-delay:0.15s"></span>
            <span class="w-1 h-1 bg-violet-500 rounded-full animate-bounce" style="animation-delay:0.3s"></span>
          </span>
        {:else}
          <span class="text-[11px] text-gray-500/80 dark:text-gray-400/80 bg-gray-200/50 dark:bg-black/30 border border-gray-300/30 dark:border-gray-700/30 px-1.5 py-0.5 rounded-md ml-1 tracking-wide">{wordCount} words</span>
        {/if}
      </div>

      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-300 {isExpanded ? 'rotate-180' : ''}">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    {#if isExpanded}
      <div transition:slide={{ duration: 250 }} class="font-mono px-4 pb-4 pt-2 text-[13px] text-gray-600 dark:text-gray-400/90 leading-[1.6] whitespace-pre-wrap border-t border-violet-200/50 dark:border-violet-900/40 opacity-90 transition-opacity">
        {thinkContent}
        {#if isGenerating && !isThinkingFinished}
          <span class="inline-block w-1.5 h-3.5 bg-violet-500/80 ml-0.5 animate-pulse rounded-sm align-text-bottom"></span>
        {/if}
      </div>
    {/if}

  </div>
{/if}
