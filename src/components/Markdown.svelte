<script>
  import { Marked } from 'marked';
  import { markedHighlight } from 'marked-highlight';
  import DOMPurify from 'dompurify';
  import hljs from 'highlight.js';

  let { content } = $props();

  const marked = new Marked(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      }
    })
  );

  marked.options = { gfm: true, breaks: true };
  let htmlContent = $derived(DOMPurify.sanitize(marked.parse(content || '')));
</script>

<div class="prose prose-sm md:prose-base prose-emerald dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-gray-800 prose-pre:rounded-xl prose-pre:shadow-sm prose-code:text-emerald-600 dark:prose-code:text-emerald-400">
  {@html htmlContent}
</div>
