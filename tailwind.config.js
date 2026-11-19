/** @type {import('tailwindcss').Config} */
// LH-direction theme: square corners, navy + gold on a mist canvas, hairline borders.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lh: {
          navy: '#003C71',
          gold: '#B08731',
          goldlt: '#E3C27A',
          ink: '#1A1C1E',
          mist: '#F2F2F2',
          line: '#D9DEE4',
          brick: '#A32A22',
          green: '#1F6B4A',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        mono: ['"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { lg: '0', xl: '0', '2xl': '0', '3xl': '0' },
      borderColor: { DEFAULT: '#D9DEE4' },
      boxShadow: { sm: 'none', DEFAULT: 'none', md: '0 1px 2px rgba(0,60,113,.08)', lg: '0 2px 8px rgba(0,60,113,.12)', xl: '0 4px 16px rgba(0,60,113,.14)', '2xl': '0 8px 32px rgba(0,60,113,.18)' },
    },
  },
  plugins: [],
}
