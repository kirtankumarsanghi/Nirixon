import { Capacitor } from "@capacitor/core";

/**
 * Thin wrappers around the Android `NirixonNative` JavaScript interface.
 *
 * The Capacitor WebView can render the whole app, but a few browser APIs it
 * replaces do not exist there: `window.print()` is a no-op, and `<a download>`
 * never reaches the filesystem. These helpers detect the native shell and hand
 * the work to MainActivity, then fall back to the normal web behaviour.
 */

export interface NirixonNativeBridge {
  printHtml?: (html: string, jobName?: string) => void;
  printPage?: (jobName?: string) => void;
  saveFile?: (filename: string, mime: string, base64: string) => boolean;
  openExternal?: (url: string) => void;
}

declare global {
  interface Window {
    NirixonNative?: NirixonNativeBridge;
  }
}

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function bridge(): NirixonNativeBridge | null {
  if (typeof window === "undefined") return null;
  return isNativeApp() ? (window.NirixonNative ?? null) : null;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(blob);
  });
}

/** Print a self-contained HTML document through Android's print service. */
export function nativePrintHtml(html: string, jobName: string): boolean {
  const api = bridge();
  if (!api?.printHtml) return false;
  try {
    api.printHtml(html, jobName);
    return true;
  } catch {
    return false;
  }
}

/** Print the page currently shown in the WebView (used by "Print" buttons). */
export function nativePrintPage(jobName: string): boolean {
  const api = bridge();
  if (!api?.printPage) return false;
  try {
    api.printPage(jobName);
    return true;
  } catch {
    return false;
  }
}

/** Open a URL in the system browser / dialer / SMS app instead of the WebView. */
export function openExternalUrl(url: string): void {
  const api = bridge();
  if (api?.openExternal) {
    try {
      api.openExternal(url);
      return;
    } catch {
      /* fall through to the web path */
    }
  }
  if (/^(tel:|sms:|mailto:)/i.test(url)) {
    window.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener");
}

export interface DownloadResult {
  handled: boolean;
  ok: boolean;
  message?: string;
}

/**
 * Save a UTF-8 text file. Native builds hand it to Android (share sheet /
 * Downloads) because anchor downloads are silently ignored in a WebView.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain;charset=utf-8",
): DownloadResult {
  const api = bridge();
  if (api?.saveFile) {
    try {
      const ok = api.saveFile(filename, mime, toBase64(content));
      return { handled: true, ok, message: ok ? undefined : "Could not save the file on this device." };
    } catch {
      return { handled: true, ok: false, message: "Could not save the file on this device." };
    }
  }

  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { handled: false, ok: true };
  } catch {
    return { handled: false, ok: false, message: "Could not create the file." };
  }
}

/**
 * Save a binary file (PDF, image). Native builds pass the bytes to Android's
 * share sheet; the web path uses a blob anchor.
 */
export async function downloadBlobFile(filename: string, blob: Blob): Promise<DownloadResult> {
  const api = bridge();
  if (api?.saveFile) {
    try {
      const ok = api.saveFile(filename, blob.type || "application/octet-stream", await blobToBase64(blob));
      return { handled: true, ok, message: ok ? undefined : "Could not save the file on this device." };
    } catch {
      return { handled: true, ok: false, message: "Could not save the file on this device." };
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { handled: false, ok: true };
  } catch {
    return { handled: false, ok: false, message: "Could not create the file." };
  }
}

/**
 * Copy text with a WebView-safe fallback. `navigator.clipboard` is missing on
 * some Android WebView builds; the textarea + execCommand path still works.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Print the current page on web, or through Android's print service natively. */
export function printCurrentPage(jobName = "Nirixon"): void {
  if (nativePrintPage(jobName)) return;
  window.print();
}
