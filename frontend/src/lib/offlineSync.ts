import { referralApi } from "../api/client";
import type { CHWSyncBatchResponse } from "../api/types";
import { deleteQueueItem, listQueue } from "./offlineQueue";

export interface FlushResult {
  sent: number;
  synced: number;
  failed: number;
  response?: CHWSyncBatchResponse;
}

/** Server-side outcomes that mean "this operation is safely recorded". */
const SETTLED = new Set(["created", "deduplicated", "updated"]);

/**
 * Replay every queued offline operation through `/api/chw/sync`. Settled
 * operations are removed from the queue; conflicts/errors stay put so the UI can
 * surface them. Throws only if the network itself is still unavailable — the
 * caller keeps the queue intact in that case.
 */
export async function flushQueue(): Promise<FlushResult> {
  const operations = await listQueue();
  if (operations.length === 0) return { sent: 0, synced: 0, failed: 0 };

  const response = await referralApi.syncBatch({ operations });

  let synced = 0;
  let failed = 0;
  for (const result of response.results) {
    if (SETTLED.has(result.status)) {
      await deleteQueueItem(result.idempotency_key);
      synced += 1;
    } else {
      failed += 1;
    }
  }
  return { sent: operations.length, synced, failed, response };
}
