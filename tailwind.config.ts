import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: ['class', '[class~="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        /*
         * Leading with the CSS variable keeps Tailwind utilities in sync with
         * the :root token defined in app.css — one source of truth.
         */
        sans: ['var(--font-sans)', 'Geist Sans', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-mono)', 'Geist Mono', ...defaultTheme.fontFamily.mono],
      },
      typography: () => ({
        DEFAULT: {
          css: {
            /* ── Mono for all code surfaces ── */
            'code, pre, pre code, kbd, samp': {
              fontFamily: 'var(--font-mono)',
            },

            /*
             * ── Heading scale: Claude/Gemini style ──────────────────────────
             * Rule: headings should feel like *document structure*, not chapter
             * titles. Weight carries all the hierarchy; size stays modest.
             * Geist 600 at these sizes reads clean and editorial, not textbook.
             */
            h1: {
              fontWeight: '600',
              fontSize: '1.2em',
              letterSpacing: '-0.02em',
              lineHeight: '1.35',
              marginTop: '1.25em',
              marginBottom: '0.5em',
            },
            h2: {
              fontWeight: '600',
              fontSize: '1.05em',
              letterSpacing: '-0.015em',
              lineHeight: '1.4',
              marginTop: '1.5em',
              marginBottom: '0.4em',
            },
            h3: {
              fontWeight: '500',
              fontSize: '1em',
              letterSpacing: '-0.01em',
              lineHeight: '1.5',
              marginTop: '1.25em',
              marginBottom: '0.35em',
            },
            h4: {
              fontWeight: '500',
              fontSize: '0.95em',
              letterSpacing: '0em',
              marginTop: '1em',
              marginBottom: '0.25em',
            },
            /* Strong: semibold feels more refined than bold in Geist */
            strong: {
              fontWeight: '600',
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
} satisfies Config;


