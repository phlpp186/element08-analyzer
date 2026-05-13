/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Element 08 brand palette — mirrored from the app's chalk_dark theme so
      // the analyzer feels like an extension of the phone, not a separate
      // product. Update these tokens whenever the app's theme system changes
      // so the two stay in sync.
      colors: {
        deep:      '#080808', // page background
        abyss:     '#101010', // panel inset
        panel:     '#161616', // raised surface
        border:    '#262626',
        text:      '#f4f4f5',
        textDim:   '#9a9a9e',
        accent:    '#4fc3f7', // primary blue (depth)
        highlight: '#ff5f9e', // pink (HR)
        recover:   '#66bb6a', // green
        amber:     '#ffa726',
        red:       '#ef5350',
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
