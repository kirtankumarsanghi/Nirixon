import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({
  referralApi: { syncBatch: vi.fn() },
}));

import { referralApi } from "../api/client";
import type { CHWSyncBatchResponse, CHWSyncItem } from "../api/types";
import {
  clearAllOfflineData,
  deleteQueueItem,
  enqueue,
  getCache,
  listQueue,
  putCache,
  queueCount,
} from "../lib/offlineQueue";
import { flushQueue } from "../lib/offlineSync";

const op = (key: string, operation: CHWSyncItem["operation"] = "contact"): CHWSyncItem => ({
  idempotency_key: key,
  operation,
  child_id: "child-1",
  payload: {},
  client_timestamp: "2026-10-18T10:00:00Z",
});

const batch = (results: CHWSyncBatchResponse["results"]): CHWSyncBatchResponse => ({
  processed_count: results.length,
  created_count: results.filter((r) => r.status === "created").length,
  deduplicated_count: results.filter((r) => r.status === "deduplicated").length,
  conflict_count: results.filter((r) => r.status === "conflict").length,
  results,
  server_timestamp: "2026-10-18T10:00:00Z",
});

describe("offline queue", () => {
  beforeEach(async () => {
    await clearAllOfflineData();
    vi.mocked(referralApi.syncBatch).mockReset();
  });

  it("stores, lists and removes queued operations", async () => {
    await enqueue(op("a"));
    await enqueue(op("b"));
    expect(await queueCount()).toBe(2);
    expect((await listQueue()).map((o) => o.idempotency_key).sort()).toEqual(["a", "b"]);

    await deleteQueueItem("a");
    expect(await queueCount()).toBe(1);
  });

  it("round-trips the read cache", async () => {
    await putCache("children", [{ id: "c1" }]);
    expect(await getCache<{ id: string }[]>("children")).toEqual([{ id: "c1" }]);
  });

  it("flushes settled operations and keeps conflicts", async () => {
    await enqueue(op("ok", "referral"));
    await enqueue(op("bad", "outcome"));
    vi.mocked(referralApi.syncBatch).mockResolvedValue(
      batch([
        { idempotency_key: "ok", operation: "referral", status: "created", entity_id: "ref-1", message: "created" },
        { idempotency_key: "bad", operation: "outcome", status: "conflict", entity_id: null, message: "conflict" },
      ]),
    );

    const res = await flushQueue();

    expect(res).toMatchObject({ sent: 2, synced: 1, failed: 1 });
    expect((await listQueue()).map((o) => o.idempotency_key)).toEqual(["bad"]);
    const sent = vi.mocked(referralApi.syncBatch).mock.calls[0][0].operations.map((o) => o.idempotency_key);
    expect(sent.sort()).toEqual(["bad", "ok"]);
  });

  it("keeps the queue when the network is still down", async () => {
    await enqueue(op("a"));
    vi.mocked(referralApi.syncBatch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(flushQueue()).rejects.toBeInstanceOf(TypeError);
    expect(await queueCount()).toBe(1);
  });

  it("does nothing when the queue is empty", async () => {
    expect(await flushQueue()).toEqual({ sent: 0, synced: 0, failed: 0 });
    expect(referralApi.syncBatch).not.toHaveBeenCalled();
  });
});
