<script>
  import ThinkingProcess from './ThinkingProcess.svelte';
  import Markdown from './Markdown.svelte';
  import { chatStore } from "$lib/stores/chatStore.svelte";

  /** @type {{
   *   msg: any,
   *   index: number,
   *   showResponseTime: boolean,
   *   showTokenCounter: boolean,
   *   oncopy: (text: string, i: number) => void,
   *   onedit: (msg: any) => void,
   *   onregenerate: (msg: any, idx: number) => void,
   * }} */
  const {
    msg,
    index: i,
    showResponseTime,
    showTokenCounter,
    oncopy,
    onedit,
    onregenerate,
  } = $props();
</script>

<div
  class="flex w-full {msg.role === 'user'
    ? 'justify-end'
    : 'justify-start'} group"
>
  {#if msg.role === "user" && !chatStore.isLoading}
    <!-- Edit Button for User -->
    <button
      onclick={() => onedit(msg)}
      class="mr-2 mt-2 p-1.5 h-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl text-gray-400 hover:text-emerald-500 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700"
      title="Edit Message"
    >
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
        ><path d="M12 20h9"></path><path
          d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        ></path></svg
      >
    </button>
  {/if}

  <div
    class="text-[15px] leading-relaxed transition-colors relative flex flex-col
    {msg.role === 'user'
      ? 'rounded-2xl max-w-[85%] shadow-sm bg-emerald-500 text-white rounded-br-none px-5 py-3.5 overflow-hidden'
      : 'w-full max-w-full text-gray-800 dark:text-gray-200 py-1'}"
  >
    {#if msg.role === "ai"}
      <!-- ═══ AI Message Rendering: Pending → Thinking → Answering ═══ -->

      <!-- Phase 1: Pending — waiting for first token -->
      {#if msg.isLoading && !msg.thinkContent && !msg.content}
        <div
          class="flex items-center space-x-2 py-2 text-gray-400 dark:text-gray-500"
        >
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
            class="animate-spin"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          <span class="text-[13px] font-medium animate-pulse">Generating...</span>
        </div>
      {/if}

      <!-- Phase 2: Thinking — ThinkingProcess accordion -->
      {#if msg.thinkContent}
        <ThinkingProcess
          thinkContent={msg.thinkContent}
          isGenerating={chatStore.isLoading && i === chatStore.messages.length - 1}
          showSetting={chatStore.isThinkingEnabled}
          isThinkingFinished={msg.isThinkingFinished ?? false}
        />
      {/if}

      <!-- Phase 3: Answering — standard markdown content -->
      {#if msg.content}
        <Markdown content={msg.content} />
      {/if}

      <!-- Action row — only visible when generation is complete -->
      {#if !msg.isLoading && (msg.content || msg.thinkContent)}
        <div
          class="mt-4 flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div
            class="flex items-center space-x-0.5 text-gray-400 dark:text-gray-500"
          >
            <button
              onclick={() => oncopy(msg.content, i)}
              class="p-1.5 hover:text-emerald-500 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]"
              title="Copy"
            >
              {#if chatStore.copiedIndex === i}
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
                  class="text-emerald-500"
                  ><polyline points="20 6 9 17 4 12"></polyline></svg
                >
              {:else}
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
                  ><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path
                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                  ></path></svg
                >
              {/if}
            </button>
            <button
              class="p-1.5 hover:text-emerald-500 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]"
              title="Give positive feedback"
            >
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
                ><path
                  d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
                ></path></svg
              >
            </button>
            <button
              class="p-1.5 hover:text-red-400 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]"
              title="Give negative feedback"
            >
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
                ><path
                  d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"
                ></path></svg
              >
            </button>
            <button
              onclick={() => onregenerate(msg, i)}
              class="p-1.5 hover:text-emerald-500 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-[#21262d]"
              title="Regenerate"
            >
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
                ><polyline points="1 4 1 10 7 10"></polyline><polyline
                  points="23 20 23 14 17 14"
                ></polyline><path
                  d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
                ></path></svg
              >
            </button>
          </div>

          {#if (showResponseTime && msg.responseTime) || (showTokenCounter && msg.evalCount)}
            <div
              class="ml-auto flex items-center space-x-2 text-[11px] text-gray-400 dark:text-gray-600 font-medium"
            >
              {#if showResponseTime && msg.responseTime}<span>{msg.responseTime}s</span>{/if}
              {#if (showResponseTime && msg.responseTime) && (showTokenCounter && msg.evalCount)}<span
                  class="opacity-40">·</span
                >{/if}
              {#if showTokenCounter && msg.evalCount}<span>{msg.evalCount} tokens</span>{/if}
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      <!-- User message -->
      <div class="whitespace-pre-wrap">{msg.content}</div>
    {/if}
  </div>
</div>
