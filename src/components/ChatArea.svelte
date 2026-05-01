<script>
  import MessageBubble from "./MessageBubble.svelte";

  /** @type {{
   *   chatContainerRef: any,
   *   errorMessage: string,
   *   messages: any[],
   *   isLoading: boolean,
   *   isThinkingEnabled: boolean,
   *   copiedIndex: number | null,
   *   showResponseTime: boolean,
   *   showTokenCounter: boolean,
   *   onscroll: () => void,
   *   oncopy: (text: string, i: number) => void,
   *   onedit: (msg: any) => void,
   *   onregenerate: (msg: any, idx: number) => void,
   * }} */
  let {
    chatContainerRef = $bindable(),
    errorMessage,
    messages,
    isLoading,
    isThinkingEnabled,
    copiedIndex,
    showResponseTime,
    showTokenCounter,
    onscroll,
    oncopy,
    onedit,
    onregenerate,
  } = $props();
</script>

<!-- Chat Messages View -->
<div
  bind:this={chatContainerRef}
  onscroll={onscroll}
  class="flex-1 overflow-y-auto w-full p-6 space-y-6 flex flex-col scroll-smooth"
>
  {#if errorMessage}
    <div
      class="max-w-3xl mx-auto w-full p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl text-sm shadow-sm"
    >
      {errorMessage}
    </div>
  {/if}

  <div class="max-w-3xl mx-auto w-full flex flex-col space-y-6 pb-6">
    {#if messages.length === 0 && !errorMessage}
      <div class="m-auto flex flex-col items-center justify-center opacity-40 pt-24">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-16 w-16 mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <p class="text-[15px] font-medium">Hello there. How can I help you today?</p>
      </div>
    {/if}

    {#each messages as msg, i}
      <MessageBubble
        {msg}
        index={i}
        {isLoading}
        {isThinkingEnabled}
        {copiedIndex}
        {showResponseTime}
        {showTokenCounter}
        {messages}
        oncopy={oncopy}
        onedit={onedit}
        onregenerate={onregenerate}
      />
    {/each}
  </div>
</div>
