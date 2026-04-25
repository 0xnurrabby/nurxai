import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1419",
        paper: "#fafaf7",
        sun: "#fff89c",
        sky: "#b8e1ff",
        leaf: "#c4f0c2",
        rose: "#ffd1dc",
        peach: "#ffd9a8",
        // dark
        nightInk: "#f3f3f5",
        nightPaper: "#1a1a1a",
        nightCard: "#222222"
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui']
      },
      borderRadius: {
        nb: "12px"
      }
    }
  },
  plugins: []
};
export default config;
