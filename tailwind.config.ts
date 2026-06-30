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
        // Bleu mer — couleur principale (« les flots »).
        brand: {
          50: "#eef7ff",
          100: "#d7ecff",
          200: "#b6ddff",
          300: "#84c7ff",
          400: "#48a6ff",
          500: "#1f86f7",
          600: "#0a68e0",
          700: "#0a53b8",
          800: "#0f4794",
          900: "#133d79",
        },
        // Écume / turquoise — accents frais.
        sea: {
          50: "#eafdfb",
          100: "#cbf7f3",
          200: "#9deee9",
          300: "#63ddd9",
          400: "#31c4c2",
          500: "#16a7a7",
          600: "#0d8587",
          700: "#106a6c",
          800: "#125456",
          900: "#134749",
        },
        // Sable — chaleur.
        sand: {
          50: "#fef8ed",
          100: "#fbeccb",
          200: "#f6d690",
          300: "#f1bf57",
          400: "#eda82f",
          500: "#e08a17",
          600: "#c46912",
          700: "#a34c13",
          800: "#853d16",
          900: "#6f3416",
        },
        // Corail — accent ludique (CTA spéciaux, célébrations).
        coral: {
          50: "#fff2f0",
          100: "#ffe2dd",
          200: "#ffc9c0",
          300: "#ffa394",
          400: "#ff7058",
          500: "#fa4a2e",
          600: "#e72f15",
          700: "#c1230f",
          800: "#9f2113",
          900: "#841f16",
        },
      },
      boxShadow: {
        buoy: "0 12px 30px -12px rgba(10, 104, 224, 0.35)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
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
      },
      animation: {
        float: "float 4s ease-in-out infinite",
        "progress-indeterminate":
          "progress-indeterminate 1.1s ease-in-out infinite",
        pop: "pop 0.35s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
