/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: ['class', '[class~="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Geist Sans', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-mono)', 'Geist Mono', ...defaultTheme.fontFamily.mono],
      },
      typography: () => ({
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
  plugins: [
    require('@tailwindcss/typography'),
  ],
};

