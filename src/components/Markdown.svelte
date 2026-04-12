<script>
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import hljs from 'highlight.js';

  /** @type {{ content: string }} */
  let { content = '' } = $props();



  marked.use({ 
    breaks: true,
    renderer: {
      /** @param {any} token */
      code(token) {
        const lang = token.lang || 'text';
        const highlighted = hljs.getLanguage(lang) ? hljs.highlight(token.text, { language: lang }).value : hljs.highlightAuto(token.text).value;
        return `
          <div class="relative group my-4 rounded-xl bg-[#0d1117] border border-gray-800 shadow-sm overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2 bg-[#161b22] text-xs text-gray-400 font-sans border-b border-gray-800/60 transition-colors">
              <span>${lang}</span>
              <button class="copy-code-btn flex items-center space-x-1.5 hover:text-white transition-colors bg-transparent border-none cursor-pointer" aria-label="Copy code">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy</span>
              </button>
            </div>
            <pre class="!my-0 !rounded-t-none !border-0 bg-transparent p-4 overflow-x-auto text-[13px] leading-relaxed"><code class="hljs ${lang ? 'language-' + lang : ''}">${highlighted}</code></pre>
          </div>
        `;
      }
    }
  });

  let htmlContent = $derived(DOMPurify.sanitize(/** @type {string} */ (marked.parse(content || '')), { USE_PROFILES: { html: true, svg: true } }));

  /** @param {MouseEvent} e */
  function handleInterop(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const btn = target.closest('.copy-code-btn');
    if (btn) {
      const flexContainer = btn.closest('.group');
      if (!flexContainer) return;
      const codeBlock = /** @type {HTMLElement} */ (flexContainer.querySelector('pre code'));
      if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.textContent || '');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="text-emerald-500">Copied!</span>`;
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
      }
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events text_clicks_unassociated_label -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div onclick={handleInterop} class="prose prose-sm md:prose-base prose-emerald dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:!bg-transparent prose-pre:!p-0 prose-pre:!m-0 prose-code:text-emerald-600 dark:prose-code:text-emerald-400">
  {@html htmlContent}
</div>
