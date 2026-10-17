/**
 * Nirixon CHW Offline Storage & Sync Queue Library
 *
 * Provides resilient client-side IndexedDB persistence for frontline health workers:
 * - Offline screening and referral creation
 * - Idempotent sync queue with client-generated UUID idempotency keys
 * - Conflict detection, logging, and per-record sync status
 * - Automatic wipe on logout (protecting child health data on shared devices)
 */

import type { ChildRecord } from "../api/types";

export type SyncOperationType = "screening" | "referral" | "contact" | "outcome";
export type SyncItemStatus = "pending" | "synced" | "failed" | "conflict";
export type RecordSyncBadgeStatus = "synced" | "pending" | "conflict";

export interface SyncQueueItem {
  idempotency_key: string;
  operation: SyncOperationType;
  child_id: string;
  payload: Record<string, any>;
  client_timestamp: string;
  status: SyncItemStatus;
  retry_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
}

export interface OfflineScreeningPayload {
  child_id: string;
  age_bracket: string;
  tier: string;
  domains_flagged: string[];
  safety_rule_triggered: string | null;
  answers?: Record<string, number>;
  module?: string;
  notes?: string;
}

export interface OfflineScreeningRecord extends OfflineScreeningPayload {
  idempotency_key: string;
  created_at: string;
  sync_status: RecordSyncBadgeStatus;
}

export interface OfflineReferralPayload {
  child_id: string;
  to_facility: string;
  reason: string;
  tier: string;
  status?: string;
  domains_of_concern: string[];
  safety_rule_trigger: string | null;
}

export interface OfflineReferralRecord extends OfflineReferralPayload {
  idempotency_key: string;
  from_worker_id?: string;
  created_at: string;
  sync_status: RecordSyncBadgeStatus;
}

export interface OfflineOutcomePayload {
  child_id: string;
  referral_id?: string;
  outcome_notes: string;
  new_tier?: string;
}

export interface ConflictLogRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  client_payload: Record<string, any>;
  server_state: Record<string, any>;
  resolution: string;
  reason: string;
  created_at: string;
}

export interface SyncBatchSummary {
  processed_count: number;
  created_count: number;
  deduplicated_count: number;
  conflict_count: number;
  error_count: number;
  errors: string[];
}

const DB_NAME = "nirixon_chw_offline_db";
const DB_VERSION = 1;
const STORES = [
  "sync_queue",
  "offline_screenings",
  "offline_referrals",
  "offline_contacts",
  "offline_outcomes",
  "cached_children",
  "conflict_log",
] as const;

type StoreName = (typeof STORES)[number];

// Memory/localStorage fallback for environments where indexedDB is unavailable (e.g. test runners or private mode)
const memoryStorage: Record<StoreName, Map<string, any>> = {
  sync_queue: new Map(),
  offline_screenings: new Map(),
  offline_referrals: new Map(),
  offline_contacts: new Map(),
  offline_outcomes: new Map(),
  cached_children: new Map(),
  conflict_log: new Map(),
};

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase | null> {
  if (!hasIndexedDB()) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            const keyPath = store === "cached_children" ? "id" : (store === "conflict_log" ? "id" : "idempotency_key");
            db.createObjectStore(store, { keyPath });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putItem<T extends { [key: string]: any }>(storeName: StoreName, key: string, item: T): Promise<void> {
  const db = await openDB();
  if (!db) {
    memoryStorage[storeName].set(key, item);
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (e) {
      memoryStorage[storeName].set(key, item);
      resolve();
    }
  });
}

async function getItem<T>(storeName: StoreName, key: string): Promise<T | null> {
  const db = await openDB();
  if (!db) {
    return (memoryStorage[storeName].get(key) as T) || null;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getAllItems<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDB();
  if (!db) {
    return Array.from(memoryStorage[storeName].values()) as T[];
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function deleteItem(storeName: StoreName, key: string): Promise<void> {
  const db = await openDB();
  if (!db) {
    memoryStorage[storeName].delete(key);
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      memoryStorage[storeName].delete(key);
      resolve();
    }
  });
}

async function clearStore(storeName: StoreName): Promise<void> {
  memoryStorage[storeName].clear();
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Completely purges all local storage data upon logout.
 * Protects child privacy on shared Anganwadi/ASHA mobile devices.
 */
export async function clearAllOfflineData(): Promise<void> {
  for (const store of STORES) {
    await clearStore(store);
  }
  // Clear any fallback storage tokens
  try {
    sessionStorage.removeItem("nirixon-chw-pending-sync");
  } catch {}
}

/**
 * Cache child records locally for offline viewing and triage.
 */
export async function cacheChildrenOffline(children: ChildRecord[]): Promise<void> {
  for (const child of children) {
    await putItem("cached_children", child.id, child);
  }
}

/**
 * Retrieve cached child records when offline.
 */
export async function getCachedChildrenOffline(): Promise<ChildRecord[]> {
  return getAllItems<ChildRecord>("cached_children");
}

/**
 * Record a completed screening offline with client UUID idempotency key.
 */
export async function enqueueOfflineScreening(payload: OfflineScreeningPayload): Promise<OfflineScreeningRecord> {
  const idempotency_key = `offline-screen-${generateUUID()}`;
  const now = new Date().toISOString();

  const record: OfflineScreeningRecord = {
    ...payload,
    idempotency_key,
    created_at: now,
    sync_status: "pending",
  };

  // 1. Store in offline screenings
  await putItem("offline_screenings", idempotency_key, record);

  // 2. Enqueue into sync_queue
  const queueItem: SyncQueueItem = {
    idempotency_key,
    operation: "screening",
    child_id: payload.child_id,
    payload: {
      tier: payload.tier,
      domains_flagged: payload.domains_flagged,
      safety_rule_triggered: payload.safety_rule_triggered,
      answers: payload.answers || {},
      age_bracket: payload.age_bracket,
      module: payload.module || "A",
      notes: payload.notes || "Offline screening completed by frontline worker",
    },
    client_timestamp: now,
    status: "pending",
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
  };
  await putItem("sync_queue", idempotency_key, queueItem);

  // 3. Update cached child record if present
  const cachedChild = await getItem<ChildRecord>("cached_children", payload.child_id);
  if (cachedChild) {
    cachedChild.current_tier = payload.tier;
    cachedChild.last_screened_at = now;
    cachedChild.domains_flagged = payload.domains_flagged;
    cachedChild.safety_rule_triggered = payload.safety_rule_triggered;
    await putItem("cached_children", payload.child_id, cachedChild);
  }

  return record;
}

/**
 * Record a referral offline with client UUID idempotency key.
 */
export async function enqueueOfflineReferral(payload: OfflineReferralPayload): Promise<OfflineReferralRecord> {
  const idempotency_key = `offline-ref-${generateUUID()}`;
  const now = new Date().toISOString();

  const record: OfflineReferralRecord = {
    ...payload,
    idempotency_key,
    created_at: now,
    sync_status: "pending",
  };

  // 1. Store in offline referrals
  await putItem("offline_referrals", idempotency_key, record);

  // 2. Enqueue into sync_queue
  const queueItem: SyncQueueItem = {
    idempotency_key,
    operation: "referral",
    child_id: payload.child_id,
    payload: {
      to_facility: payload.to_facility,
      reason: payload.reason,
      tier: payload.tier,
      status: payload.status || "created",
      domains_of_concern: payload.domains_of_concern,
      safety_rule_trigger: payload.safety_rule_trigger,
    },
    client_timestamp: now,
    status: "pending",
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
  };
  await putItem("sync_queue", idempotency_key, queueItem);

  return record;
}

/**
 * Record child contact offline.
 */
export async function enqueueOfflineContact(childId: string): Promise<string> {
  const idempotency_key = `offline-contact-${generateUUID()}`;
  const now = new Date().toISOString();

  await putItem("offline_contacts", idempotency_key, {
    idempotency_key,
    child_id: childId,
    contacted_at: now,
    sync_status: "pending",
  });

  const queueItem: SyncQueueItem = {
    idempotency_key,
    operation: "contact",
    child_id: childId,
    payload: { contacted_at: now },
    client_timestamp: now,
    status: "pending",
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
  };
  await putItem("sync_queue", idempotency_key, queueItem);

  return idempotency_key;
}

/**
 * Record clinical outcome offline.
 */
export async function enqueueOfflineOutcome(payload: OfflineOutcomePayload): Promise<string> {
  const idempotency_key = `offline-outcome-${generateUUID()}`;
  const now = new Date().toISOString();

  await putItem("offline_outcomes", idempotency_key, {
    idempotency_key,
    ...payload,
    created_at: now,
    sync_status: "pending",
  });

  const queueItem: SyncQueueItem = {
    idempotency_key,
    operation: "outcome",
    child_id: payload.child_id,
    payload: {
      referral_id: payload.referral_id,
      outcome_notes: payload.outcome_notes,
      new_tier: payload.new_tier,
    },
    client_timestamp: now,
    status: "pending",
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
  };
  await putItem("sync_queue", idempotency_key, queueItem);

  return idempotency_key;
}

/**
 * Retrieve all pending or failed sync queue items.
 */
export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  const all = await getAllItems<SyncQueueItem>("sync_queue");
  return all.filter((item) => item.status === "pending" || item.status === "failed");
}

/**
 * Get count of items awaiting sync.
 */
export async function getPendingSyncCount(): Promise<number> {
  const pending = await getPendingSyncQueue();
  return pending.length;
}

/**
 * Look up the sync status for a specific record (child or referral).
 */
export async function getRecordSyncStatus(childId: string): Promise<RecordSyncBadgeStatus> {
  const allQueue = await getAllItems<SyncQueueItem>("sync_queue");
  const childItems = allQueue.filter((item) => item.child_id === childId);

  if (childItems.length === 0) return "synced";

  if (childItems.some((item) => item.status === "conflict")) {
    return "conflict";
  }
  if (childItems.some((item) => item.status === "pending" || item.status === "failed")) {
    return "pending";
  }
  return "synced";
}

/**
 * Retrieve conflict log records.
 */
export async function getConflictLogs(): Promise<ConflictLogRecord[]> {
  return getAllItems<ConflictLogRecord>("conflict_log");
}

/**
 * Flush and synchronize pending queue with backend idempotent sync endpoint.
 */
export async function processSyncQueue(
  syncBatchFn: (batch: {
    operations: Array<{
      idempotency_key: string;
      operation: SyncOperationType;
      child_id: string;
      payload: Record<string, any>;
      client_timestamp: string;
    }>;
  }) => Promise<{
    processed_count: number;
    created_count: number;
    deduplicated_count: number;
    conflict_count: number;
    results: Array<{
      idempotency_key: string;
      operation: string;
      status: "created" | "deduplicated" | "updated" | "conflict" | "error";
      entity_id?: string | null;
      message: string;
      conflict_detail?: any;
    }>;
  }>
): Promise<SyncBatchSummary> {
  const pendingItems = await getPendingSyncQueue();
  if (pendingItems.length === 0) {
    return {
      processed_count: 0,
      created_count: 0,
      deduplicated_count: 0,
      conflict_count: 0,
      error_count: 0,
      errors: [],
    };
  }

  const payload = {
    operations: pendingItems.map((item) => ({
      idempotency_key: item.idempotency_key,
      operation: item.operation,
      child_id: item.child_id,
      payload: item.payload,
      client_timestamp: item.client_timestamp,
    })),
  };

  try {
    const response = await syncBatchFn(payload);
    const summary: SyncBatchSummary = {
      processed_count: response.processed_count,
      created_count: response.created_count,
      deduplicated_count: response.deduplicated_count,
      conflict_count: response.conflict_count,
      error_count: 0,
      errors: [],
    };

    for (const res of response.results) {
      const qItem = await getItem<SyncQueueItem>("sync_queue", res.idempotency_key);
      if (!qItem) continue;

      qItem.last_attempt_at = new Date().toISOString();

      if (res.status === "created" || res.status === "deduplicated" || res.status === "updated") {
        qItem.status = "synced";
        qItem.last_error = null;
        await putItem("sync_queue", res.idempotency_key, qItem);

        // Update corresponding offline record sync status to "synced"
        if (qItem.operation === "screening") {
          const s = await getItem<OfflineScreeningRecord>("offline_screenings", res.idempotency_key);
          if (s) {
            s.sync_status = "synced";
            await putItem("offline_screenings", res.idempotency_key, s);
          }
        } else if (qItem.operation === "referral") {
          const r = await getItem<OfflineReferralRecord>("offline_referrals", res.idempotency_key);
          if (r) {
            r.sync_status = "synced";
            await putItem("offline_referrals", res.idempotency_key, r);
          }
        }
      } else if (res.status === "conflict") {
        qItem.status = "conflict";
        qItem.last_error = res.message;
        await putItem("sync_queue", res.idempotency_key, qItem);

        // Record into conflict log
        const conflictRecord: ConflictLogRecord = {
          id: `conflict-${generateUUID()}`,
          entity_type: qItem.operation,
          entity_id: qItem.child_id,
          operation: qItem.operation,
          client_payload: qItem.payload,
          server_state: res.conflict_detail?.server_state || {},
          resolution: res.conflict_detail?.resolution || "server_retained",
          reason: res.message,
          created_at: new Date().toISOString(),
        };
        await putItem("conflict_log", conflictRecord.id, conflictRecord);
      } else {
        qItem.status = "failed";
        qItem.retry_count += 1;
        qItem.last_error = res.message;
        summary.error_count += 1;
        summary.errors.push(res.message);
        await putItem("sync_queue", res.idempotency_key, qItem);
      }
    }

    return summary;
  } catch (err: any) {
    // Network failure during batch sync
    for (const item of pendingItems) {
      item.retry_count += 1;
      item.last_attempt_at = new Date().toISOString();
      item.last_error = err?.message || "Network offline during sync attempt";
      await putItem("sync_queue", item.idempotency_key, item);
    }
    return {
      processed_count: 0,
      created_count: 0,
      deduplicated_count: 0,
      conflict_count: 0,
      error_count: pendingItems.length,
      errors: [err?.message || "Sync failed due to network error"],
    };
  }
}
