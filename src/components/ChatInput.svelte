<script>
  import { shortcutStore } from "$lib/stores/shortcuts.svelte";
  import { modelStore } from "$lib/stores/modelStore.svelte";
  import { sessionStore } from "$lib/stores/sessionStore.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import ModelInfoCard from "./ModelInfoCard.svelte";

  /** @type {{
   *   prompt: string,
   *   textareaRef: any,
   *   isLoading: boolean,
   *   hasUnread: boolean,
   *   showScrollButton: boolean,
   *   enterToSend: boolean,
   *   currentSessionId: string,
   *   errorMessage: string,
   *   onscrollbottom: () => void,
   *   onsend: () => void,
   *   onstop: () => void,
   *   onadjusttextareaheight: () => void,
   *   onfetchmodelinfo: (name: string) => void,
   *   onmodelchange: (name: string) => Promise<void>,
   * }} */
  let {
    prompt = $bindable(),
    textareaRef = $bindable(),
    isLoading,
    hasUnread,
    showScrollButton,
    enterToSend,
    currentSessionId,
    errorMessage = $bindable(),
    onscrollbottom,
    onsend,
    onstop,
    onadjusttextareaheight,
    onfetchmodelinfo,
    onmodelchange,
  } = $props();
</script>

<!-- Input Bar -->
<div
  class="w-full p-4 bg-white/90 dark:bg-[#0d1117]/90 backdrop-blur-md relative z-10 border-t border-gray-200 dark:border-gray-800 transition-colors shrink-0"
>
  {#if showScrollButton}
    <button
      onclick={onscrollbottom}
      class="absolute -top-14 left-1/2 -translate-x-1/2 p-2 rounded-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-700 shadow-md text-emerald-500 hover:text-emerald-600 transition-all z-50 hover:shadow-lg hover:-translate-y-1"
      class:animate-bounce={isLoading || hasUnread}
      title="Scroll to bottom"
    >
      {#if hasUnread}
        <span
          class="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-[#161b22]"
        ></span>
      {/if}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><line x1="12" y1="5" x2="12" y2="19"></line><polyline
          points="19 12 12 19 5 12"
        ></polyline></svg
      >
    </button>
  {/if}

  <div class="max-w-3xl mx-auto flex items-end space-x-3 relative">
    <textarea
      bind:this={textareaRef}
      onfocus={() => shortcutStore.pushScope("editor")}
      onblur={() => shortcutStore.popScope("editor")}
      bind:value={prompt}
      placeholder="Message Lume..."
      oninput={onadjusttextareaheight}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          if (enterToSend) {
            if (!e.shiftKey) {
              e.preventDefault();
              onsend();
            }
          } else {
            if (e.shiftKey) {
              e.preventDefault();
              onsend();
            }
          }
        }
      }}
      disabled={isLoading || modelStore.models.length === 0}
      class="flex-1 bg-[#f9fafb] dark:bg-[#161b22] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-3xl pl-6 pr-44 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 shadow-sm dark:shadow-[0_2px_10px_rgba(0,0,0,0.1)] text-[15px] resize-none overflow-y-auto min-h-[52px] max-h-[200px] transition-colors"
      rows="1"
    ></textarea>

    <!-- Stylish Model & Temperature Selectors Wrapper -->
    <div
      class="absolute right-12 bottom-3 pr-3 text-sm flex items-center space-x-1"
    >
      <div class="relative">
        <!-- Toggler Button -->
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            modelStore.setIsModelMenuOpen(!modelStore.isModelMenuOpen);
          }}
          disabled={modelStore.models.length === 0}
          class="flex items-center space-x-1.5 px-3 py-1 bg-transparent hover:bg-gray-200/50 dark:hover:bg-[#21262d] rounded-full transition-colors font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 group"
          title="Change execution model"
        >
          <span
            class="max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis text-[13px]"
          >
            {modelStore.models.length === 0
              ? "Searching..."
              : modelStore.selectedModel || "Select Model"}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        <!-- Floating Menu Popover -->
        {#if modelStore.isModelMenuOpen && modelStore.models.length > 0}
          <div
            role="menu"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === "Escape") modelStore.setIsModelMenuOpen(false);
            }}
            onclick={(e) => e.stopPropagation()}
            class="absolute bottom-[calc(100%+14px)] right-0 w-64 bg-white/90 dark:bg-[#161b22]/95 backdrop-blur-xl border border-gray-200/60 dark:border-gray-700/50 rounded-2xl shadow-[0_12px_32px_-4px_rgba(0,0,0,0.15),0_8px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_32px_-4px_rgba(0,0,0,0.5)] p-1.5 z-50 overflow-visible origin-bottom-right"
          >
            <!-- Title header inside popover -->
            <div
              class="px-3 py-2 border-b border-gray-100 dark:border-gray-800/80 mb-1"
            >
              <span
                class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest"
                >Available Models</span
              >
            </div>

            <div
              class="max-h-[350px] overflow-y-auto w-full custom-scrollbar"
            >
              {#each modelStore.models as model}
                <!-- Model row with info card trigger -->
                <div
                  class="relative"
                  onmouseenter={() => {
                    modelStore.setHoveredModel(model.name);
                    onfetchmodelinfo(model.name);
                  }}
                  onmouseleave={() => {
                    modelStore.setHoveredModel("");
                    modelStore.setModelInfo(null);
                  }}
                  role="none"
                >
                  <button
                    type="button"
                    onclick={async () => {
                      if (
                        !currentSessionId ||
                        modelStore.selectedModel === model.name
                      ) {
                        modelStore.setIsModelMenuOpen(false);
                        return;
                      }
                      const previousModel = modelStore.selectedModel;
                      await onmodelchange(model.name);
                      modelStore.setIsModelMenuOpen(false);
                      try {
                        await invoke("set_session_model", {
                          session_id: currentSessionId,
                          model: model.name,
                        });
                        const idx = sessionStore.sessions.findIndex(
                          (/** @type {any} */ s) => s.id === currentSessionId,
                        );
                        if (idx !== -1)
                          sessionStore.sessions[idx] = {
                            ...sessionStore.sessions[idx],
                            model: model.name,
                          };
                      } catch (err) {
                        console.error(
                          "[set_session_model] IPC failed, reverting UI:",
                          err,
                        );
                        modelStore.setSelectedModel(previousModel);
                        errorMessage =
                          "Failed to save model choice. Please try again.";
                        setTimeout(() => (errorMessage = ""), 4000);
                      }
                    }}

                    class="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-xl transition-all cursor-pointer hover:bg-gray-100/80 dark:hover:bg-[#21262d] {modelStore.selectedModel ===
                    model.name
                      ? 'bg-emerald-50 dark:bg-emerald-900/10'
                      : ''}"
                  >
                    <div class="flex flex-col min-w-0 pr-4">
                      <span
                        class="text-[14px] font-medium {modelStore.selectedModel ===
                        model.name
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-gray-700 dark:text-gray-200'} truncate"
                      >
                        {model.name}
                      </span>
                      <span
                        class="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5"
                      >
                        {model.size
                          ? `${(model.size / 1073741824).toFixed(1)} GB`
                          : "Local"} · {model.details?.parameter_size ||
                          "Ollama"}
                      </span>
                    </div>

                    <div class="shrink-0 text-emerald-500 h-4 w-4">
                      {#if modelStore.selectedModel === model.name}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          ><polyline points="20 6 9 17 4 12"
                          ></polyline></svg
                        >
                      {/if}
                    </div>
                  </button>

                  <!-- ── Model Info Card (glassmorphism, appears on hover) ── -->
                  <ModelInfoCard
                    modelInfo={modelStore.modelInfo}
                    modelInfoLoading={modelStore.modelInfoLoading}
                    hoveredModel={modelStore.hoveredModel}
                    modelName={model.name}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if isLoading}
      <button
        onclick={onstop}
        class="absolute right-2 bottom-1.5 bg-gray-800 hover:bg-gray-700 dark:bg-gray-200 dark:hover:bg-gray-300 text-white dark:text-gray-900 rounded-full p-2 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 active:scale-95"
        title="Stop Generation"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><rect x="7" y="7" width="10" height="10" rx="1" ry="1"
          ></rect></svg
        >
      </button>
    {:else}
      <button
        onclick={() => onsend()}
        disabled={!prompt.trim() || modelStore.models.length === 0}
        class="absolute right-2 bottom-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-full p-2 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:transform-none active:scale-95"
        title="Send Message"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><line x1="22" y1="2" x2="11" y2="13"></line><polygon
            points="22 2 15 22 11 13 2 9 22 2"
          ></polygon></svg
        >
      </button>
    {/if}
  </div>
  <div
    class="w-full text-center mt-2 opacity-50 text-[11px] font-medium tracking-wide"
  >
    Use Shift + Enter to add a new line
  </div>
</div>
