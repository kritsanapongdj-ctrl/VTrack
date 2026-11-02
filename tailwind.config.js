/** @type {import('tailwindcss').Config} */
// Neo-brutalist theme: square corners, ink borders, hard offset shadows,
// and a clear numeric face (Space Grotesk, tabular) in place of mono/serif.
const hard = (n) => `${n}px ${n}px 0 0 #111`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        mono: ['"Space Grotesk"', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { lg: '0', xl: '0', '2xl': '0', '3xl': '0' },
      borderColor: { DEFAULT: '#111' },
      boxShadow: { sm: hard(2), DEFAULT: hard(3), md: hard(4), lg: hard(5), xl: hard(6), '2xl': hard(8) },
    },
  },
  plugins: [],
}
