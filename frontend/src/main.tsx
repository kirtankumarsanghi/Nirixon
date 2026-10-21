import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root is missing from index.html");

// Native shell starts on the landing page exactly like the web build; the
// "Start check-in" action there opens the check-in directly (see landing/App).

// Clear any service worker/cache an older APK left behind. The packaged app
// must always run the bundle that shipped inside the APK.
if (Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
  if ("caches" in window) {
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key);
    });
  }
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// The native app ships its assets inside the APK, so a service worker only
// risks serving a stale bundle after an update. Register it on the web only.
if (
  import.meta.env.PROD &&
  !Capacitor.isNativePlatform() &&
  "serviceWorker" in navigator
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline caching unavailable — the app still works online */
    });
  });
}

// Android hardware back: navigate the SPA first, exit only at the root.
if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    if (window.location.hash && window.location.hash !== "#/") {
      window.location.hash = "#/";
      return;
    }
    void CapacitorApp.exitApp();
  });
}
