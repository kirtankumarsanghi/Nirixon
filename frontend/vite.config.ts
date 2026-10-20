import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest types are ambient via /// reference; keeps tsc -b happy across vite versions.
/// <reference types="vitest/config" />

import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, isPreview }) => {
  // A shell-wide NODE_ENV=production otherwise makes `vite dev` behave like a
  // production build: DEV=false, no Fast Refresh, and react/jsx-dev-runtime
  // resolves to the production stub whose jsxDEV is undefined — which crashes
  // the browser with "jsxDEV is not a function". Vite reads NODE_ENV after the
  // config file loads, so setting it here is early enough to fix the mode.
  process.env.NODE_ENV =
    command === "serve" && !isPreview ? "development" : "production";

  return {
    plugins: [react(), tailwindcss()],
    // Android System WebView on older phones lags behind desktop Chrome.
    build: {
      target: "es2019",
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        // Narration clips (including Hindi generated on demand) are served by the
        // backend so there is a single source of truth for audio.
        "/audio": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
    // `vite preview` does not inherit server.proxy, so mirror it for the built app.
    preview: {
      port: 4173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
        "/audio": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      // Force the test build even when the shell exports NODE_ENV=production —
      // React's production bundle has no `act`, which breaks React Testing Library.
      env: { NODE_ENV: "test" },
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});
