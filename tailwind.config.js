/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Element 08 brand palette. Driven by CSS variables (see index.css)
      // so the `light` class on <html> swaps the whole palette. The
      // `rgb(... / <alpha-value>)` pattern lets Tailwind's opacity
      // modifiers (e.g. bg-accent/10) work on top of CSS variables.
      colors: {
        deep:      'rgb(var(--c-deep) / <alpha-value>)',
        abyss:     'rgb(var(--c-abyss) / <alpha-value>)',
        panel:     'rgb(var(--c-panel) / <alpha-value>)',
        border:    'rgb(var(--c-border) / <alpha-value>)',
        text:      'rgb(var(--c-text) / <alpha-value>)',
        textDim:   'rgb(var(--c-textDim) / <alpha-value>)',
        accent:    'rgb(var(--c-accent) / <alpha-value>)',
        highlight: 'rgb(var(--c-highlight) / <alpha-value>)',
        recover:   'rgb(var(--c-recover) / <alpha-value>)',
        amber:     'rgb(var(--c-amber) / <alpha-value>)',
        red:       'rgb(var(--c-red) / <alpha-value>)',
      },
      fontFamily: {
        body:    ['"Inter"', 'system-ui', 'sans-serif'],
        heading: ['"Barlow Condensed"', 'sans-serif'],
        mono:    ['"Share Tech Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
