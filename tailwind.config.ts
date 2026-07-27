import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        // Bleu azur assumé : énergique, net et distinct du logo.
        brand: {
          50: "#eff8ff",
          100: "#dbefff",
          200: "#b8e0f7",
          300: "#7ec8ec",
          400: "#3eabe0",
          500: "#168dc9",
          600: "#0873ab",
          700: "#075d8d",
          800: "#0b4d73",
          900: "#0c405f",
          950: "#082a40",
        },
        // Turquoise lagon, volontairement saturé sur les points d'action.
        sea: {
          50: "#ecfdf9",
          100: "#cff9f1",
          200: "#9af1e3",
          300: "#5de4d1",
          400: "#2ccbbb",
          500: "#12aa9e",
          600: "#0c887f",
          700: "#0e6d68",
          800: "#105753",
          900: "#104945",
        },
        // Neutres chauds pour les statuts non critiques.
        sand: {
          50: "#faf8f4",
          100: "#f0ece4",
          200: "#e2dbce",
          300: "#cfc3b0",
          400: "#b8a88f",
          500: "#9c8b72",
          600: "#7d6f5c",
          700: "#665b4c",
          800: "#554c41",
          900: "#494139",
        },
        // Rose sourd, uniquement pour les alertes et actions destructives.
        coral: {
          50: "#faf3f4",
          100: "#f2e1e4",
          200: "#e6c6cc",
          300: "#d6a1ab",
          400: "#c47787",
          500: "#ad5b6d",
          600: "#914457",
          700: "#783746",
          800: "#64313d",
          900: "#552c36",
        },
      },
      boxShadow: {
        buoy: "0 2px 0 rgba(8, 42, 64, 0.12)",
        card: "0 1px 2px rgba(8, 42, 64, 0.06)",
        elevated: "0 4px 12px rgba(8, 42, 64, 0.09)",
      },
      keyframes: {
        "progress-indeterminate": {
          "0%": { left: "-40%", width: "40%" },
          "50%": { width: "55%" },
          "100%": { left: "100%", width: "30%" },
        },
        pop: {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "60%": { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fade-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "progress-indeterminate":
          "progress-indeterminate 1.1s ease-in-out infinite",
        pop: "pop 0.35s ease-out both",
        "fade-up": "fade-up 0.45s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
