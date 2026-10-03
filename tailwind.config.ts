import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#000",
        backgroundContrast: "#111",
        textBlack: "#1d1d1f",
        ink: { 950: "#0B0D0F", 900: "#12161A", 800: "#1A2025", 700: "#283139" },
        fog: { 500: "#99A3AA" },
        paper: { 100: "#F4F1EA" },
        gold: { 500: "#C8A45D" },
        ember: { 500: "#D95D45" },
        success: { 500: "#5EAD83" },
      },
      fontFamily: {
        display: ["'Bodoni Moda'", "serif"],
        body: ["'DM Sans'", "sans-serif"],
        apple: [
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: { display: "-0.025em" },
      boxShadow: {
        raised: "0 3px 0 0 #99A3AA",
        "raised-pressed": "0 1px 0 0 #99A3AA",
      },
      keyframes: {
        "carousel-move": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
      animation: {
        "carousel-move": "carousel-move var(--duration,80s) infinite linear",
      },
    },
  },
  plugins: [],
} satisfies Config;

