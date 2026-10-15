import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest types are ambient via /// reference; keeps tsc -b happy across vite versions.
/// <reference types="vitest/config" />

import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "react-router-dom": fileURLToPath(
        new URL(
          "./node_modules/react-router-dom/dist/index.mjs",
          import.meta.url,
        ),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  // @ts-expect-error vitest augments UserConfig with `test` at runtime
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
