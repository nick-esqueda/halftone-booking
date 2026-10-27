/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { "/api": API_PROXY_TARGET },
  },
  preview: {
    proxy: { "/api": API_PROXY_TARGET },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // An absolute API URL, so requests in tests have a full URL to match.
    env: { VITE_API_URL: "http://api.test" },
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
