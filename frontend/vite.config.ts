import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest types are ambient via /// reference; keeps tsc -b happy across vite versions.
/// <reference types="vitest/config" />

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // @ts-expect-error vitest augments UserConfig with `test` at runtime
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
