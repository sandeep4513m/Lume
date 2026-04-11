<script>
  import { Marked } from 'marked';
  import { markedHighlight } from 'marked-highlight';
  import DOMPurify from 'dompurify';
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github-dark-dimmed.css';

  let { content } = $props();

  // Create a customized marked instance using the official extension
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

  // Enable GitHub-flavored Markdown
  marked.options = { gfm: true, breaks: true };

  // Reactively parse and safely sanitize the HTML
  let htmlContent = $derived(DOMPurify.sanitize(marked.parse(content || '')));
</script>

<div class="prose prose-sm md:prose-base prose-emerald dark:prose-invert max-w-none 
            prose-p:leading-relaxed prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-gray-800 
            prose-pre:rounded-xl prose-pre:shadow-sm prose-code:text-emerald-600 dark:prose-code:text-emerald-400">
  {@html htmlContent}
</div>

<style>
  /* Fix tailwind typography adding margin to the first/last paragraphs in chat bubbles */
  .prose :global(> :first-child) { margin-top: 0; }
  .prose :global(> :last-child) { margin-bottom: 0; }
</style>
