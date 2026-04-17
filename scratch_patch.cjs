const fs = require('fs');

const pageFile = 'c:\\Users\\VISHNU\\Documents\\Lume\\src\\routes\\+page.svelte';
let c = fs.readFileSync(pageFile, 'utf8');

c = c.replace(
`              {#if msg.isLoading}
                <div class="flex space-x-1.5 items-center h-5">
                  <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce"></div>
                  <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.15s"></div>
                  <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.3s"></div>
                </div>
              {:else if msg.role === 'ai'}
                
                {#if msg.thinkContent}
                  <!-- The custom Hybrid UI Reasoning Component -->
                  <ThinkingProcess 
                    thinkContent={msg.thinkContent} 
                    isGenerating={isLoading && i === messages.length - 1} 
                    showSetting={isThinkingEnabled} 
                    isThinkingFinished={msg.isThinkingFinished} 
                  />
                {/if}`,
`              {#if msg.role === 'ai'}
                
                {#if msg.isLoading && !msg.content && !msg.thinkContent}
                  <div class="flex space-x-1.5 items-center h-5">
                    <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce"></div>
                    <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.15s"></div>
                    <div class="w-2 h-2 bg-emerald-500/50 rounded-full animate-bounce" style="animation-delay: 0.3s"></div>
                  </div>
                {/if}

                {#if msg.thinkContent || (msg.isLoading && isThinkingEnabled && !msg.content)}
                  <!-- The custom Hybrid UI Reasoning Component -->
                  <ThinkingProcess 
                    thinkContent={msg.thinkContent || ''} 
                    isGenerating={isLoading && i === messages.length - 1} 
                    showSetting={isThinkingEnabled} 
                    isThinkingFinished={msg.isThinkingFinished} 
                  />
                {/if}`
);

// Fix TS types on Settings component props
c = c.replace(
  'onStreamingChange={(val) => {\n    isStreamingEnabled = val;\n  }}',
  'onStreamingChange={(/** @type {boolean} */ val) => {\n    isStreamingEnabled = val;\n  }}'
);

c = c.replace(
  'onThinkingChange={(val) => {\n    isThinkingEnabled = val;\n  }}',
  'onThinkingChange={(/** @type {boolean} */ val) => {\n    isThinkingEnabled = val;\n  }}'
);

// Standardize CRLF if needed (though node readFileSync in string mode preserves original)
fs.writeFileSync(pageFile, c, 'utf8');

console.log("Replaced successfully!");
