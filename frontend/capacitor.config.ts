import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for the existing React app.
 *
 * Production build:
 *   VITE_API_BASE_URL=https://api.example.org npm run build
 *   npx cap sync
 *
 * Live reload on a device (backend must be reachable on the LAN):
 *   uncomment `server` below, set your laptop IP, then:
 *   npx cap run android
 */
const config: CapacitorConfig = {
  appId: "com.nirixon.app",
  appName: "Nirixon",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // url: "http://192.168.1.10:5173",
    // cleartext: true,
  },
  android: {
    // Dev only: the LAN backend is plain HTTP. Release builds should use an
    // HTTPS API and this can go back to false.
    allowMixedContent: true,
  },
};

export default config;
