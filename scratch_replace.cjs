const fs = require('fs');

let content = fs.readFileSync('src/routes/+page.svelte', 'utf8');

// 1. Add import
content = content.replace(
  'import { sessionStore } from "$lib/stores/sessionStore.svelte";',
  'import { sessionStore } from "$lib/stores/sessionStore.svelte";\n  import { chatStore } from "$lib/stores/chatStore.svelte";'
);

// 2. Remove $state declarations
content = content.replace(/let prompt = \$state\(""\);\n/g, '');
content = content.replace(/\/\*\* @type \{any\[\]\} \*\/\n\s*let messages = \$state\(\[\]\);\n/g, '');
content = content.replace(/let isLoading = \$state\(false\);\n/g, '');
content = content.replace(/let errorMessage = \$state\(""\);\n/g, '');
content = content.replace(/let copiedIndex = \$state\(-1\);\n/g, '');
content = content.replace(/\/\*\* @type \{AbortController \| null\} \*\/\n\s*let currentAbortController = \$state\(null\);\n/g, '');
content = content.replace(/let isStreamingEnabled = \$state\(true\);\n/g, '');
content = content.replace(/let isThinkingEnabled = \$state\(true\);\n/g, '');

// 3. Replace usages.
const vars = ['prompt', 'messages', 'isLoading', 'errorMessage', 'copiedIndex', 'currentAbortController', 'isStreamingEnabled', 'isThinkingEnabled'];

for (const v of vars) {
  const regex = new RegExp(`(?<![\\w.])${v}(?![\\w:])`, 'g');
  content = content.replace(regex, `chatStore.${v}`);
}

// 4. Fix ChatArea and ChatInput props manually since the above regex changed them:
// {errorMessage} -> {chatStore.errorMessage}
// bind:prompt -> bind:chatStore.prompt
// {isLoading} -> {chatStore.isLoading}
// {messages} -> {chatStore.messages}

content = content.replace(/\s*\{chatStore\.errorMessage\}\n/g, '\n');
content = content.replace(/\s*\{chatStore\.messages\}\n/g, '\n');
content = content.replace(/\s*\{chatStore\.isLoading\}\n/g, '\n');
content = content.replace(/\s*\{chatStore\.isThinkingEnabled\}\n/g, '\n');
content = content.replace(/\s*\{chatStore\.copiedIndex\}\n/g, '\n');

// ChatInput specific:
content = content.replace(/\s*bind:chatStore\.prompt\n/g, '\n');
content = content.replace(/\s*bind:chatStore\.errorMessage\n/g, '\n');

// Also remove `chatStore.errorMessage={chatStore.errorMessage}` in case it was explicitly passed like `errorMessage={errorMessage}` (it wasn't, it was `{errorMessage}`).

// For Settings:
// {isStreamingEnabled} -> {chatStore.isStreamingEnabled}
// We should change it to `isStreamingEnabled={chatStore.isStreamingEnabled}` because it was shorthand.
content = content.replace(/\{chatStore\.isStreamingEnabled\}/g, 'isStreamingEnabled={chatStore.isStreamingEnabled}');

// showThinkingBlocks={isThinkingEnabled} -> showThinkingBlocks={chatStore.isThinkingEnabled} (already handled correctly by the vars loop!)

fs.writeFileSync('src/routes/+page.svelte', content);
console.log("Replaced successfully!");
