/**
 * Web-push client half. Delivery also needs a server-side sender (VAPID private
 * key + a stored subscription), which is not implemented yet — the UI therefore
 * never offers a toggle that would silently do nothing.
 */
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushConfigured(): boolean {
  return Boolean(VAPID) && typeof Notification !== "undefined" && "serviceWorker" in navigator;
}

export function pushPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask for permission and subscribe this device. Returns null when unavailable. */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!pushConfigured() || !VAPID) return null;
  if ((await Notification.requestPermission()) !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource,
  });
}
