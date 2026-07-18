/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: {
          DEFAULT: "#0f1f2e",
          light: "#1c3347",
          dark: "#081420",
        },
        cream: {
          DEFAULT: "#faf6ef",
          card: "#ffffff",
          dark: "#f0e9db",
        },
        gold: {
          DEFAULT: "#c9a24c",
          light: "#e6cf95",
        },
      },
      fontFamily: {
        rubikBurned: ['"Rubik Burned"', 'cursive'],
        rubikVinyl: ['"Rubik Vinyl"', 'cursive'],
        inter: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        custom: '0px 3px 80px rgba(0, 0, 0, 0.5)',
      },
      textDecorationStyle: {
        wavy: 'wavy',
      },
    },
  },
  plugins: [],
};
