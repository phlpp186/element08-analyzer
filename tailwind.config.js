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
        ink:       'rgb(var(--c-ink) / <alpha-value>)',
        highlight: 'rgb(var(--c-highlight) / <alpha-value>)',
        recover:   'rgb(var(--c-recover) / <alpha-value>)',
        amber:     'rgb(var(--c-amber) / <alpha-value>)',
        red:       'rgb(var(--c-red) / <alpha-value>)',
        surface:   'rgb(var(--c-surface) / <alpha-value>)',
        profile:   'rgb(var(--c-profile) / <alpha-value>)',
        hero:      'rgb(var(--c-hero) / <alpha-value>)',
        modeDepth: 'rgb(var(--c-modeDepth) / <alpha-value>)',
        modePool:  'rgb(var(--c-modePool) / <alpha-value>)',
        modeDry:   'rgb(var(--c-modeDry) / <alpha-value>)',
      },
      fontFamily: {
        // Open Water: Nunito everywhere. `heading` renders at weight 800
        // (see index.css); `mono` is Nunito with tabular numerals.
        body:    ['"Nunito"', 'system-ui', 'sans-serif'],
        // Per theme (index.css): Nunito, or Fredoka in Block Arcade.
        heading: ['var(--font-heading)'],
        num:     ['var(--font-num)'],
        mono:    ['"Nunito"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
