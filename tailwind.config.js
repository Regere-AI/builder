/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './src/**/*.{ts,tsx,js,jsx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(0, 0%, 100%)',
        foreground: 'hsl(0, 0%, 9%)',
        card: {
          DEFAULT: 'hsl(0, 0%, 100%)',
          foreground: 'hsl(0, 0%, 9%)',
        },
        popover: {
          DEFAULT: 'hsl(0, 0%, 100%)',
          foreground: 'hsl(0, 0%, 9%)',
        },
        primary: {
          DEFAULT: 'hsl(0, 0%, 9%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        secondary: {
          DEFAULT: 'hsl(0, 0%, 96%)',
          foreground: 'hsl(0, 0%, 9%)',
        },
        muted: {
          DEFAULT: 'hsl(0, 0%, 96%)',
          foreground: 'hsl(0, 0%, 45%)',
        },
        accent: {
          DEFAULT: 'hsl(0, 0%, 96%)',
          foreground: 'hsl(0, 0%, 9%)',
        },
        destructive: {
          DEFAULT: 'hsl(0, 84%, 60%)',
          foreground: 'hsl(0, 0%, 100%)',
        },
        border: 'hsl(0, 0%, 90%)',
        input: 'hsl(0, 0%, 90%)',
        ring: 'hsl(0, 0%, 9%)',
        chart: {
          '1': 'hsl(12, 76%, 61%)',
          '2': 'hsl(173, 58%, 39%)',
          '3': 'hsl(197, 37%, 24%)',
          '4': 'hsl(43, 74%, 66%)',
          '5': 'hsl(27, 87%, 67%)',
        },
      },
      borderRadius: {
        lg: '0.5rem',
        md: 'calc(0.5rem - 2px)',
        sm: 'calc(0.5rem - 4px)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in-right': 'slideInFromRight 0.3s ease-out',
        'slide-in-left': 'slideInFromLeft 0.3s ease-out',
        'slide-in-top': 'slideInFromTop 0.3s ease-out',
        'slide-in-bottom': 'slideInFromBottom 0.3s ease-out',
        'zoom-in': 'zoomIn 0.5s ease-out',
      },
    },
  },
  plugins: [],
}
