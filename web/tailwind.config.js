/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        leaf: {
          50: '#f3faf2',
          100: '#e3f4e1',
          200: '#c6e8c2',
          300: '#9ad494',
          400: '#66b75e',
          500: '#429a3a',
          600: '#2f7c2a',
          700: '#276223',
          800: '#234f21',
          900: '#1f421e',
        },
        soil: '#6b4f3a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -12px rgba(16, 24, 40, 0.10)',
      },
    },
  },
  plugins: [],
};
