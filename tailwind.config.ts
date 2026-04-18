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
        /*
         * Override the @tailwindcss/typography prose plugin so that inline
         * code and fenced code blocks always render in Geist Mono, regardless
         * of which prose variant (prose-sm, prose-lg, dark, etc.) is active.
         */
        DEFAULT: {
          css: {
            'code, pre, pre code, kbd, samp': {
              fontFamily: 'var(--font-mono)',
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
} satisfies Config;

