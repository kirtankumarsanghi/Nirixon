import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest types are ambient via /// reference; keeps tsc -b happy across vite versions.
/// <reference types="vitest/config" />

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  // @ts-expect-error vitest augments UserConfig with `test` at runtime
  test: {
    globals: true,
    environment: "jsdom",
    // Force the test build even when the shell exports NODE_ENV=production —
    // React's production bundle has no `act`, which breaks React Testing Library.
    env: { NODE_ENV: "test" },
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
