/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#141210", soft: "#2a2622", muted: "#6b645c" },
        paper: { DEFAULT: "#f7f3ec", deep: "#efe8dc", card: "#fffdf9" },
        gold: { DEFAULT: "#a8833e", light: "#c9a96a", dark: "#7d602a" },
        live: "#b4232a",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      letterSpacing: { widest2: "0.25em" },
      keyframes: {
        flash: { "0%": { backgroundColor: "rgba(168,131,62,.35)" }, "100%": { backgroundColor: "transparent" } },
        pulseDot: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } },
      },
      animation: {
        flash: "flash 1.2s ease-out",
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
