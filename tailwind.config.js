/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['"Space Grotesk"', 'sans-serif'],
        condensed: ['"Barlow Condensed"', 'sans-serif'],
      },
      colors: {
        bg: '#0c0b0b',
        ink: '#f0ece3',
      },
    },
  },
  plugins: [],
}
