import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CHWReferralPage } from "./CHWReferralPage";
import {
  clearAllOfflineData,
  enqueueOfflineScreening,
  enqueueOfflineReferral,
  enqueueOfflineContact,
  enqueueOfflineOutcome,
  getPendingSyncCount,
  getRecordSyncStatus,
  processSyncQueue,
  cacheChildrenOffline,
  getCachedChildrenOffline,
  getConflictLogs,
} from "../lib/offlineStorage";
import type { ChildRecord, WorkerRecord } from "../api/types";

const mockGetMe = vi.fn();
const mockGetChildren = vi.fn();
const mockGetReferrals = vi.fn();
const mockSyncBatch = vi.fn();
const mockGetConflicts = vi.fn();

vi.mock("../api/client", () => ({
  referralApi: {
    getMe: () => mockGetMe(),
    getChildren: () => mockGetChildren(),
    getReferrals: () => mockGetReferrals(),
    getTierCounts: () =>
      Promise.resolve({
        total_children: 1,
        tier1_typical: 1,
        tier2_monitor: 0,
        tier3_referral: 0,
        unscreened: 0,
        overdue_follow_up: 0,
      }),
    syncBatch: (batch: any) => mockSyncBatch(batch),
    getConflicts: () => mockGetConflicts(),
    getSummary: vi.fn(),
    getSummaryText: vi.fn(),
    getSummaryPdfUrl: (id: string) => `http://localhost:8000/api/referrals/${id}/summary/pdf`,
    createChild: vi.fn(),
    deleteChild: vi.fn(),
    createReferral: vi.fn(),
    oneTouchReferral: vi.fn(),
    markContacted: vi.fn(),
    recordOutcome: vi.fn(),
    recordChildOutcome: vi.fn(),
    deleteReferral: vi.fn(),
  },
  api: {},
  setAuthToken: vi.fn(),
  onUnauthorized: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    role: "chw",
    token: "mock-chw-token",
    isAuthenticated: true,
    logout: async () => {
      await clearAllOfflineData();
    },
  }),
}));

const testWorker: WorkerRecord = {
  id: "worker-ward12",
  user_id: "user-asha-1",
  name: "Sunita Devi (ASHA)",
  role: "chw",
  area: "Ward 12",
  phone: "9876500001",
  created_at: new Date().toISOString(),
};

const testChild: ChildRecord = {
  id: "child-rec-001",
  pseudonymous_id: "child-ward12-001",
  age_bracket: "18-24m",
  village_ward: "Ward 12",
  consent_given: true,
  consent_recorded_at: new Date().toISOString(),
  opt_in: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("CHW Offline Worker Dashboard Acceptance Tests", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllOfflineData();

    mockGetMe.mockResolvedValue(testWorker);
    mockGetChildren.mockResolvedValue([testChild]);
    mockGetReferrals.mockResolvedValue([]);
    mockGetConflicts.mockResolvedValue([]);
  });

  it("Acceptance Check: completes a screening and referral offline, reconnects, and confirms exactly one record of each after two sync retries", async () => {
    // 1. Frontline worker records screening and referral while offline (intermittent connectivity in village)
    const screening = await enqueueOfflineScreening({
      child_id: testChild.id,
      age_bracket: testChild.age_bracket,
      tier: "Tier 3: Direct Referral",
      domains_flagged: ["gross_motor", "communication"],
      safety_rule_triggered: "Motor regression <= -2.0 SD",
      notes: "Door-to-door visit screening by ASHA",
    });

    const referral = await enqueueOfflineReferral({
      child_id: testChild.id,
      to_facility: "District Early Intervention Center (DEIC)",
      reason: "Severe gross motor milestone delay flagged during village screening",
      tier: "Tier 3: Direct Referral",
      status: "created",
      domains_of_concern: ["gross_motor", "communication"],
      safety_rule_trigger: "Motor regression <= -2.0 SD",
    });

    // Verify both items are queued locally with client UUID idempotency keys
    expect(screening.idempotency_key).toContain("offline-screen-");
    expect(referral.idempotency_key).toContain("offline-ref-");

    const pendingCount = await getPendingSyncCount();
    expect(pendingCount).toBe(2);

    const initialBadge = await getRecordSyncStatus(testChild.id);
    expect(initialBadge).toBe("pending");

    // 2. Setup server-side idempotency registry to track received records
    const serverScreenings = new Map<string, any>();
    const serverReferrals = new Map<string, any>();
    const serverSyncRegistry = new Set<string>();

    const backendSyncImplementation = async (batch: { operations: any[] }) => {
      const results: any[] = [];
      let created = 0;
      let deduplicated = 0;

      for (const op of batch.operations) {
        if (serverSyncRegistry.has(op.idempotency_key)) {
          // Idempotent deduplication: record already processed
          deduplicated += 1;
          results.push({
            idempotency_key: op.idempotency_key,
            operation: op.operation,
            status: "deduplicated",
            entity_id: op.operation === "screening" ? serverScreenings.get(op.idempotency_key)?.id : serverReferrals.get(op.idempotency_key)?.id,
            message: `Deduplicated operation ${op.operation} (${op.idempotency_key})`,
          });
        } else {
          // First time processing: create record
          serverSyncRegistry.add(op.idempotency_key);
          created += 1;

          if (op.operation === "screening") {
            const screenId = `server-screen-${serverScreenings.size + 1}`;
            serverScreenings.set(op.idempotency_key, { id: screenId, ...op.payload });
            results.push({
              idempotency_key: op.idempotency_key,
              operation: op.operation,
              status: "created",
              entity_id: screenId,
              message: "Offline screening synced successfully",
            });
          } else if (op.operation === "referral") {
            const refId = `server-ref-${serverReferrals.size + 1}`;
            serverReferrals.set(op.idempotency_key, { id: refId, ...op.payload });
            results.push({
              idempotency_key: op.idempotency_key,
              operation: op.operation,
              status: "created",
              entity_id: refId,
              message: "Offline referral synced successfully",
            });
          }
        }
      }

      return {
        processed_count: batch.operations.length,
        created_count: created,
        deduplicated_count: deduplicated,
        conflict_count: 0,
        results,
      };
    };

    // 3. Reconnect & Execute Initial Batch Sync
    const initialSyncSummary = await processSyncQueue(backendSyncImplementation);
    expect(initialSyncSummary.processed_count).toBe(2);
    expect(initialSyncSummary.created_count).toBe(2);
    expect(initialSyncSummary.deduplicated_count).toBe(0);

    // Verify exact count on server after initial sync: 1 screening, 1 referral
    expect(serverScreenings.size).toBe(1);
    expect(serverReferrals.size).toBe(1);

    // 4. FIRST SYNC RETRY (simulating client retry due to network timeout or retry loop)
    const retry1Payload = {
      operations: [
        {
          idempotency_key: screening.idempotency_key,
          operation: "screening" as const,
          child_id: testChild.id,
          payload: { tier: screening.tier },
          client_timestamp: screening.created_at,
        },
        {
          idempotency_key: referral.idempotency_key,
          operation: "referral" as const,
          child_id: testChild.id,
          payload: { tier: referral.tier },
          client_timestamp: referral.created_at,
        },
      ],
    };

    const retry1Res = await backendSyncImplementation(retry1Payload);
    expect(retry1Res.processed_count).toBe(2);
    expect(retry1Res.created_count).toBe(0);
    expect(retry1Res.deduplicated_count).toBe(2);
    expect(retry1Res.results.every((r) => r.status === "deduplicated")).toBe(true);

    // Confirm EXACTLY one record of each remains on server after retry 1
    expect(serverScreenings.size).toBe(1);
    expect(serverReferrals.size).toBe(1);

    // 5. SECOND SYNC RETRY (simulating secondary reconnect or manual sync trigger)
    const retry2Res = await backendSyncImplementation(retry1Payload);
    expect(retry2Res.processed_count).toBe(2);
    expect(retry2Res.created_count).toBe(0);
    expect(retry2Res.deduplicated_count).toBe(2);
    expect(retry2Res.results.every((r) => r.status === "deduplicated")).toBe(true);

    // Confirm EXACTLY one record of each remains on server after retry 2
    expect(serverScreenings.size).toBe(1);
    expect(serverReferrals.size).toBe(1);

    // 6. Verify client sync status badges update to "synced"
    const finalPendingCount = await getPendingSyncCount();
    expect(finalPendingCount).toBe(0);

    const finalBadge = await getRecordSyncStatus(testChild.id);
    expect(finalBadge).toBe("synced");
  });

  it("renders per-record sync status badge (Synced, Pending Sync, Conflict) and Offline status bar in UI", async () => {
    // 1. Initial render with no pending items -> Synced
    const { unmount } = render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Sunita Devi \(ASHA\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Online — All records synchronized with server/i)).toBeInTheDocument();

    const syncedBadge = await screen.findByTestId(`sync-status-${testChild.id}`);
    expect(syncedBadge).toHaveTextContent(/Synced/i);

    unmount();

    // 2. Enqueue offline action -> Pending Sync badge
    await enqueueOfflineContact(testChild.id);
    expect(await getRecordSyncStatus(testChild.id)).toBe("pending");

    render(
      <MemoryRouter>
        <CHWReferralPage />
      </MemoryRouter>
    );

    const pendingBadge = await screen.findByTestId(`sync-status-${testChild.id}`);
    expect(pendingBadge).toHaveTextContent(/Pending Sync/i);
    expect(screen.getByText(/1 offline changes pending sync/i)).toBeInTheDocument();
  });

  it("Privacy & data protection: clearAllOfflineData purges all device storage, child cache, and sync queue on logout", async () => {
    // Cache records locally
    await cacheChildrenOffline([testChild]);
    await enqueueOfflineContact(testChild.id);
    await enqueueOfflineOutcome({
      child_id: testChild.id,
      outcome_notes: "Routine stimulation counselled",
      new_tier: "Tier 1: Typical",
    });

    const cachedBefore = await getCachedChildrenOffline();
    expect(cachedBefore.length).toBe(1);
    expect(await getPendingSyncCount()).toBe(2);

    // Trigger clear device data / logout wipe
    await clearAllOfflineData();

    // Verify total erasure of local device data
    const cachedAfter = await getCachedChildrenOffline();
    expect(cachedAfter.length).toBe(0);

    const pendingAfter = await getPendingSyncCount();
    expect(pendingAfter).toBe(0);

    const conflictsAfter = await getConflictLogs();
    expect(conflictsAfter.length).toBe(0);
  });
});
