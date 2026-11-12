/// <reference types="vite/client" />

/** Injected from package.json by vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** Absolute API origin used by a Capacitor build when set. */
  readonly VITE_MOBILE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
