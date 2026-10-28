/** @type {import('tailwindcss').Config} */

// Each token maps to a CSS variable defined in src/index.css for light and dark mode.
const TOKEN_NAMES = [
  "canvas",
  "surface",
  "muted",
  "line",
  "line-strong",
  "ink",
  "ink-muted",
  "ink-faint",
  "accent",
  "accent-strong",
  "accent-soft",
  "danger",
  "danger-soft",
  "success",
];

const tokenColors = Object.fromEntries(
  TOKEN_NAMES.map((name) => [
    name,
    `rgb(var(--color-${name}) / <alpha-value>)`,
  ]),
);

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: tokenColors,
      // A new assistant reply fades in from the accent tint, so it's noticed.
      keyframes: {
        "reply-highlight": {
          from: { backgroundColor: "rgb(var(--color-accent-soft))" },
          to: { backgroundColor: "transparent" },
        },
      },
      animation: {
        "reply-highlight": "reply-highlight 2s ease-out",
      },
    },
  },
  plugins: [],
};
