import type { CHWSyncItem } from "../api/types";

const DB_NAME = "nirixon-chw-offline";
const DB_VERSION = 1;
const QUEUE = "queue";
const CACHE = "cache";

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (once) the offline store. Rejects when the browser has no IndexedDB —
 *  callers treat that as "offline persistence unavailable" and carry on. */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: "idempotency_key" });
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        db.createObjectStore(CACHE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the offline store"));
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, step: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = step(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Offline store request failed"));
      }),
  );
}

/** Client-generated idempotency key for a queued operation. */
export function newKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueue(op: CHWSyncItem): Promise<void> {
  await run(QUEUE, "readwrite", (s) => s.put(op));
}

export async function listQueue(): Promise<CHWSyncItem[]> {
  return (await run<CHWSyncItem[]>(QUEUE, "readonly", (s) => s.getAll())) ?? [];
}

export async function deleteQueueItem(key: string): Promise<void> {
  await run(QUEUE, "readwrite", (s) => s.delete(key));
}

export async function queueCount(): Promise<number> {
  return (await run<number>(QUEUE, "readonly", (s) => s.count())) ?? 0;
}

export async function putCache(key: string, value: unknown): Promise<void> {
  await run(CACHE, "readwrite", (s) => s.put({ key, value }));
}

export async function getCache<T>(key: string): Promise<T | null> {
  const row = (await run<{ key: string; value: T } | undefined>(CACHE, "readonly", (s) => s.get(key))) ?? undefined;
  return row ? row.value : null;
}

/** Called on sign-out — shared-device wipe (README promise). Never throws. */
export async function clearAllOfflineData(): Promise<void> {
  try {
    await run(QUEUE, "readwrite", (s) => s.clear());
    await run(CACHE, "readwrite", (s) => s.clear());
  } catch {
    /* no offline store on this device — nothing to wipe */
  }
}

/** A failed request is "offline" (retryable) vs. a real API rejection (4xx/5xx). */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  return err instanceof Error && /failed to fetch|network|load failed|offline/i.test(err.message);
}
