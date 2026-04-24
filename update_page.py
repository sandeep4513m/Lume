import sys, re

with open("src/routes/+page.svelte", "r") as f:
    text = f.read()

# 1. Add settingsInitialTab
if "  let settingsInitialTab = $state('');" not in text:
    text = text.replace("  let isSettingsOpen = $state(false);", "  let isSettingsOpen = $state(false);\n  let settingsInitialTab = $state('');")

# 2. Add items to dropdown
target2 = """              <button
                onclick={() => {
                  handleClear();
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >"""
replacement2 = """              <!-- Context Window -->
              <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <div class="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Context Window</div>
                <div class="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                  {contextTokenCount} / {activeContextSize >= 1000 ? Math.round(activeContextSize / 1024) + 'k' : activeContextSize} tokens
                  <span class="ml-1 text-[11px] {contextColor.split(' ')[0]}">({contextPercentage}%)</span>
                </div>
              </div>
              <button
                onclick={() => {
                  settingsInitialTab = 'chat';
                  isSettingsOpen = true;
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                System Prompt
              </button>
              <button
                onclick={() => {
                  settingsInitialTab = 'chat';
                  isSettingsOpen = true;
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path></svg>
                Temperature
              </button>
              <div class="border-t border-gray-100 dark:border-gray-800"></div>
              <button
                onclick={() => {
                  handleClear();
                  isHeaderMenuOpen = false;
                }}
                class="w-full flex items-center px-4 py-2.5 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >"""
if "<!-- Context Window -->" not in text:
    text = text.replace(target2, replacement2)

# 3,4,5. Remove Context Indicator, System Prompt, Temperature
pattern = r"          <!-- Context Length Indicator -->.*?          <div class=\"relative\">\n            <!-- Toggler Button -->\n            <button\n              type=\"button\"\n              onclick={\(e\) => {\n                e\.stopPropagation\(\);\n                isModelMenuOpen = !isModelMenuOpen;"
replacement3 = """          <div class="relative">
            <!-- Toggler Button -->
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                isModelMenuOpen = !isModelMenuOpen;"""
if "<!-- Context Length Indicator -->" in text:
    text = re.sub(pattern, replacement3, text, flags=re.DOTALL)

# 6. Settings initialTab
if "initialTab={settingsInitialTab}" not in text:
    text = text.replace("<Settings\n  isOpen={isSettingsOpen}", "<Settings\n  initialTab={settingsInitialTab}\n  isOpen={isSettingsOpen}")

with open("src/routes/+page.svelte", "w") as f:
    f.write(text)
print("Changes applied successfully!")
