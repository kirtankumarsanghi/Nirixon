import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageNav } from "../components/PageNav";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { referralApi } from "../api/client";
import type {
  ChildRecord,
  ReferralRecord,
  ReferralSummary,
  TierCounts,
  WorkerRecord,
} from "../api/types";
import { useToast } from "../toast/Toast";
import {
  User,
  ShieldCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Clock,
  LayoutGrid,
  ClipboardList,
  Users,
} from "lucide-react";
import {
  cacheChildrenOffline,
  clearAllOfflineData,
  enqueueOfflineContact,
  enqueueOfflineOutcome,
  enqueueOfflineReferral,
  enqueueOfflineScreening,
  getCachedChildrenOffline,
  getConflictLogs,
  getPendingSyncCount,
  getRecordSyncStatus,
  processSyncQueue,
  type ConflictLogRecord,
  type RecordSyncBadgeStatus,
} from "../lib/offlineStorage";

function parseAgeMonths(bracket: string): string {
  if (!bracket) return "24";
  const b = bracket.toLowerCase();
  if (b.includes("0-6")) return "4";
  if (b.includes("6-12")) return "9";
  if (b.includes("12-24") || b.includes("18-24")) return "18";
  if (b.includes("24-30") || b.includes("24-36")) return "30";
  if (b.includes("36-48")) return "42";
  if (b.includes("48-60")) return "54";
  const digits = bracket.replace(/\D/g, "");
  return digits || "24";
}

export function CHWReferralPage() {
  const { push } = useToast();

  const [worker, setWorker] = useState<WorkerRecord | null>(null);
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [tierCounts, setTierCounts] = useState<TierCounts | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "referrals" | "children">("dashboard");
  const [viewMode, setViewMode] = useState<"cards" | "batch">("cards");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Network & Sync State
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [recordSyncStatuses, setRecordSyncStatuses] = useState<Record<string, RecordSyncBadgeStatus>>({});
  const [conflicts, setConflicts] = useState<ConflictLogRecord[]>([]);
  const [showConflictsModal, setShowConflictsModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Field Screening Modal State
  const [showScreeningModal, setShowScreeningModal] = useState(false);
  const [selectedChildForScreening, setSelectedChildForScreening] = useState<ChildRecord | null>(null);
  const [screeningTier, setScreeningTier] = useState<string>("Tier 1: Typical");
  const [screeningDomains, setScreeningDomains] = useState<string[]>([]);
  const [screeningSafetyRule, setScreeningSafetyRule] = useState<string>("");
  const [screeningNotes, setScreeningNotes] = useState<string>("");

  // Filters state
  const [selectedWard, setSelectedWard] = useState<string>("all");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals state
  const [showChildModal, setShowChildModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Selected items for modals
  const [selectedReferral, setSelectedReferral] = useState<ReferralRecord | null>(null);
  const [selectedChildForOutcome, setSelectedChildForOutcome] = useState<ChildRecord | null>(null);
  const [summaryData, setSummaryData] = useState<ReferralSummary | null>(null);

  // Form states
  const [newChildPseudoId, setNewChildPseudoId] = useState("");
  const [newChildBracket, setNewChildBracket] = useState("18-24m");
  const [newChildConsent, setNewChildConsent] = useState(true);

  const [refChildId, setRefChildId] = useState("");
  const [refFacility, setRefFacility] = useState("");
  const [refReason, setRefReason] = useState("");
  const [refTier, setRefTier] = useState("Tier 3: Direct Referral");
  const [refDomains, setRefDomains] = useState("motor, communication");
  const [refSafetyTrigger, setRefSafetyTrigger] = useState("");

  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeNewTier, setOutcomeNewTier] = useState("");
  const [outcomeNextDays, setOutcomeNextDays] = useState("14");
  const [closeOnOutcome, setCloseOnOutcome] = useState(true);

  useEffect(() => {
    loadData();

    const handleOnlineEvent = () => {
      setIsOnline(true);
      push("Internet connection restored. Synchronizing offline queue…", "info");
      handleSyncNow();
    };

    const handleOfflineEvent = () => {
      setIsOnline(false);
      push("Offline Mode: changes will be saved to IndexedDB queue.", "warning");
    };

    window.addEventListener("online", handleOnlineEvent);
    window.addEventListener("offline", handleOfflineEvent);

    return () => {
      window.removeEventListener("online", handleOnlineEvent);
      window.removeEventListener("offline", handleOfflineEvent);
    };
  }, []);

  async function refreshSyncState(childList?: ChildRecord[]) {
    try {
      const count = await getPendingSyncCount();
      setPendingSyncCount(count);
      const targetChildren = childList || children;
      const statusMap: Record<string, RecordSyncBadgeStatus> = {};
      for (const c of targetChildren) {
        statusMap[c.id] = await getRecordSyncStatus(c.id);
      }
      setRecordSyncStatuses(statusMap);
      const conflictLogs = await getConflictLogs();
      setConflicts(conflictLogs);
    } catch {
      // IndexedDB fallback graceful handling
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      let w: WorkerRecord | null = null;
      let cList: ChildRecord[] = [];
      let rList: ReferralRecord[] = [];
      let counts: TierCounts | null = null;

      try {
        [w, cList, rList, counts] = await Promise.all([
          referralApi.getMe().catch(() => null),
          referralApi.getChildren().catch(() => []),
          referralApi.getReferrals().catch(() => []),
          typeof referralApi.getTierCounts === "function"
            ? referralApi.getTierCounts().catch(() => null)
            : Promise.resolve(null),
        ]);
      } catch {
        // Network unavailable
      }

      if (cList.length > 0) {
        await cacheChildrenOffline(cList);
      } else {
        const cached = await getCachedChildrenOffline();
        if (cached.length > 0) {
          cList = cached;
        }
      }

      setWorker(w);
      setChildren(cList);
      setReferrals(rList);
      setTierCounts(counts);

      if (cList.length > 0 && !refChildId) {
        setRefChildId(cList[0].pseudonymous_id);
      }

      await refreshSyncState(cList);
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to load community health data", "error");
    } finally {
      setLoading(false);
    }
  }

  // Derived unique villages / wards
  const availableWards = useMemo(() => {
    const set = new Set<string>();
    children.forEach((c) => {
      if (c.village_ward) set.add(c.village_ward);
    });
    return Array.from(set).sort();
  }, [children]);

  // Client-side computed tier counts fallback/sync
  const computedCounts = useMemo(() => {
    const t1 = children.filter((c) => (c.current_tier || "").startsWith("Tier 1")).length;
    const t2 = children.filter((c) => (c.current_tier || "").startsWith("Tier 2")).length;
    const t3 = children.filter((c) => (c.current_tier || "").startsWith("Tier 3")).length;
    const unscreened = children.filter((c) => !c.current_tier || c.current_tier === "Unscreened").length;
    const overdue = children.filter((c) => {
      if (c.is_overdue) return true;
      if (c.follow_up_due_at) {
        return new Date(c.follow_up_due_at).getTime() < Date.now();
      }
      return false;
    }).length;

    return {
      total_children: children.length,
      tier1_typical: tierCounts?.tier1_typical ?? t1,
      tier2_monitor: tierCounts?.tier2_monitor ?? t2,
      tier3_referral: tierCounts?.tier3_referral ?? t3,
      unscreened: tierCounts?.unscreened ?? unscreened,
      overdue_follow_up: tierCounts?.overdue_follow_up ?? overdue,
    };
  }, [children, tierCounts]);

  // Filtered children list
  const filteredChildren = useMemo(() => {
    return children.filter((c) => {
      // Village / Ward
      if (selectedWard !== "all" && c.village_ward !== selectedWard) {
        return false;
      }
      // Overdue Follow-up
      if (overdueOnly) {
        const isOd = c.is_overdue || (c.follow_up_due_at && new Date(c.follow_up_due_at).getTime() < Date.now());
        if (!isOd) return false;
      }
      // Tier
      if (selectedTier !== "all") {
        if (selectedTier === "overdue") {
          const isOd = c.is_overdue || (c.follow_up_due_at && new Date(c.follow_up_due_at).getTime() < Date.now());
          if (!isOd) return false;
        } else if (selectedTier === "Tier 1") {
          if (!(c.current_tier || "").startsWith("Tier 1")) return false;
        } else if (selectedTier === "Tier 2") {
          if (!(c.current_tier || "").startsWith("Tier 2")) return false;
        } else if (selectedTier === "Tier 3") {
          if (!(c.current_tier || "").startsWith("Tier 3")) return false;
        } else if (selectedTier === "Unscreened") {
          if (c.current_tier && c.current_tier !== "Unscreened") return false;
        }
      }
      // Age Group
      if (selectedAgeGroup !== "all" && c.age_bracket !== selectedAgeGroup) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = c.pseudonymous_id.toLowerCase().includes(q);
        const matchesArea = c.village_ward.toLowerCase().includes(q);
        if (!matchesId && !matchesArea) return false;
      }
      return true;
    });
  }, [children, selectedWard, selectedTier, selectedAgeGroup, overdueOnly, searchQuery]);

  // Map each child to their active referral if one exists
  const referralByChildId = useMemo(() => {
    const map = new Map<string, ReferralRecord>();
    referrals.forEach((r) => {
      // Index by both DB id and pseudonymous ID
      if (!map.has(r.child_id)) {
        map.set(r.child_id, r);
      }
    });
    return map;
  }, [referrals]);

  // Quick Action 1: Start Screening
  function handleStartScreening(child: ChildRecord) {
    setSelectedChildForScreening(child);
    setScreeningTier(child.current_tier || "Tier 1: Typical");
    setScreeningDomains(child.domains_flagged || []);
    setScreeningSafetyRule(child.safety_rule_triggered || "");
    setScreeningNotes("");
    setShowScreeningModal(true);
  }

  // Save Screening (Offline-capable with Idempotency Key)
  async function handleSaveScreening(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChildForScreening) return;
    const child = selectedChildForScreening;

    try {
      await enqueueOfflineScreening({
        child_id: child.id,
        age_bracket: child.age_bracket,
        tier: screeningTier,
        domains_flagged: screeningDomains,
        safety_rule_triggered: screeningSafetyRule.trim() || null,
        notes: screeningNotes.trim() || "Frontline worker field screening",
      });

      // Optimistic UI update
      setChildren((prev) =>
        prev.map((c) =>
          c.id === child.id
            ? {
              ...c,
              current_tier: screeningTier,
              last_screened_at: new Date().toISOString(),
              domains_flagged: screeningDomains,
              safety_rule_triggered: screeningSafetyRule.trim() || null,
            }
            : c
        )
      );
      setRecordSyncStatuses((prev) => ({ ...prev, [child.id]: "pending" }));
      setPendingSyncCount((prev) => prev + 1);
      setShowScreeningModal(false);
      setSelectedChildForScreening(null);

      if (isOnline) {
        handleSyncNow();
      } else {
        push("Screening saved to offline queue. Will sync when reconnected.", "success");
      }
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to record screening", "error");
    }
  }

  // Quick Action 2: One-Touch Referral (Offline capable with minimal summary)
  async function handleOneTouchReferral(childId: string) {
    const child = children.find((c) => c.id === childId);
    if (!isOnline) {
      try {
        await enqueueOfflineReferral({
          child_id: childId,
          to_facility: "District Early Intervention Center (DEIC)",
          reason: "Tier 3 referral priority identified during community visit",
          tier: child?.current_tier || "Tier 3: Direct Referral",
          status: "created",
          domains_of_concern: child?.domains_flagged || ["communication", "motor"],
          safety_rule_trigger: child?.safety_rule_triggered || null,
        });
        setRecordSyncStatuses((prev) => ({ ...prev, [childId]: "pending" }));
        setPendingSyncCount((prev) => prev + 1);
        push("Referral created offline with idempotency key. Queued for sync.", "success");
        return;
      } catch (err: unknown) {
        push(err instanceof Error ? err.message : "Failed to record offline referral", "error");
        return;
      }
    }

    try {
      const res = await referralApi.oneTouchReferral(childId);
      push(res.message, "success");
      setSelectedReferral(res.referral);
      setSummaryData(res.summary);
      setShowSummaryModal(true);
      await loadData();
    } catch (err: unknown) {
      // Fallback on network error
      try {
        await enqueueOfflineReferral({
          child_id: childId,
          to_facility: "District Early Intervention Center (DEIC)",
          reason: "Tier 3 referral priority identified during community visit",
          tier: child?.current_tier || "Tier 3: Direct Referral",
          status: "created",
          domains_of_concern: child?.domains_flagged || ["communication", "motor"],
          safety_rule_trigger: child?.safety_rule_triggered || null,
        });
        setRecordSyncStatuses((prev) => ({ ...prev, [childId]: "pending" }));
        setPendingSyncCount((prev) => prev + 1);
        push("Network offline. Referral saved to local queue.", "warning");
      } catch {
        push(err instanceof Error ? err.message : "Failed to create referral", "error");
      }
    }
  }

  // Quick Action 3: Mark "Contacted" / Visited (Offline capable)
  async function handleMarkContacted(childId: string) {
    const now = new Date().toISOString();
    if (!isOnline) {
      try {
        await enqueueOfflineContact(childId);
        setChildren((prev) =>
          prev.map((c) =>
            c.id === childId
              ? {
                ...c,
                last_contacted_at: now,
                contact_count: (c.contact_count || 0) + 1,
                is_overdue: false,
              }
              : c
          )
        );
        setRecordSyncStatuses((prev) => ({ ...prev, [childId]: "pending" }));
        setPendingSyncCount((prev) => prev + 1);
        push("Door-to-door visit recorded offline. Pending sync.", "success");
        return;
      } catch (err: unknown) {
        push(err instanceof Error ? err.message : "Failed to record offline visit", "error");
        return;
      }
    }

    try {
      const res = await referralApi.markContacted(childId);
      push(res.message, "success");
      setChildren((prev) =>
        prev.map((c) =>
          c.id === childId
            ? {
              ...c,
              last_contacted_at: res.last_contacted_at,
              contact_count: res.contact_count,
              is_overdue: false,
            }
            : c
        )
      );
      referralApi.getTierCounts().then(setTierCounts).catch(() => null);
    } catch {
      // Fallback on network error
      await enqueueOfflineContact(childId);
      setChildren((prev) =>
        prev.map((c) =>
          c.id === childId
            ? {
              ...c,
              last_contacted_at: now,
              contact_count: (c.contact_count || 0) + 1,
              is_overdue: false,
            }
            : c
        )
      );
      setRecordSyncStatuses((prev) => ({ ...prev, [childId]: "pending" }));
      setPendingSyncCount((prev) => prev + 1);
      push("Network offline. Visit recorded to local queue.", "warning");
    }
  }

  // Quick Action 4: Record Outcome
  function handleOpenOutcome(child: ChildRecord) {
    setSelectedChildForOutcome(child);
    const existingRef = referralByChildId.get(child.id) || referralByChildId.get(child.pseudonymous_id);
    if (existingRef) {
      setSelectedReferral(existingRef);
    } else {
      setSelectedReferral(null);
    }
    setOutcomeNotes("");
    setOutcomeNewTier(child.current_tier || "Tier 1: Typical");
    setOutcomeNextDays("14");
    setCloseOnOutcome(true);
    setShowOutcomeModal(true);
  }

  async function handleSaveOutcome(e: React.FormEvent) {
    e.preventDefault();
    if (!outcomeNotes.trim()) {
      push("Outcome notes are required.", "error");
      return;
    }

    const childId = selectedChildForOutcome?.id || selectedReferral?.child_id;
    if (!childId) return;

    if (!isOnline) {
      await enqueueOfflineOutcome({
        child_id: childId,
        referral_id: selectedReferral?.id,
        outcome_notes: outcomeNotes.trim(),
        new_tier: outcomeNewTier || undefined,
      });

      if (selectedChildForOutcome) {
        setChildren((prev) =>
          prev.map((c) =>
            c.id === childId
              ? {
                ...c,
                current_tier: outcomeNewTier || c.current_tier,
              }
              : c
          )
        );
      }
      if (selectedReferral) {
        setReferrals((prev) =>
          prev.map((r) =>
            r.id === selectedReferral.id
              ? {
                ...r,
                status: closeOnOutcome ? "closed" : "outcome recorded",
                outcome_notes: outcomeNotes.trim(),
              }
              : r
          )
        );
      }
      setRecordSyncStatuses((prev) => ({ ...prev, [childId]: "pending" }));
      setPendingSyncCount((prev) => prev + 1);
      setShowOutcomeModal(false);
      setSelectedChildForOutcome(null);
      setSelectedReferral(null);
      setOutcomeNotes("");
      push("Clinical outcome saved offline. Pending sync.", "success");
      return;
    }

    try {
      if (selectedChildForOutcome) {
        await referralApi.recordChildOutcome(selectedChildForOutcome.id, {
          outcome_notes: outcomeNotes.trim(),
          close_referral: closeOnOutcome,
          new_tier: outcomeNewTier || undefined,
          next_follow_up_days: outcomeNextDays ? Number(outcomeNextDays) : undefined,
        });
        push(`Clinical outcome recorded for ${selectedChildForOutcome.pseudonymous_id}.`, "success");
      } else if (selectedReferral) {
        await referralApi.recordOutcome(selectedReferral.id, {
          outcome_notes: outcomeNotes.trim(),
          close_referral: closeOnOutcome,
        });
        push("Post-referral clinical outcome recorded.", "success");
      }
      setShowOutcomeModal(false);
      setSelectedChildForOutcome(null);
      setSelectedReferral(null);
      setOutcomeNotes("");
      await loadData();
    } catch {
      await enqueueOfflineOutcome({
        child_id: childId,
        referral_id: selectedReferral?.id,
        outcome_notes: outcomeNotes.trim(),
        new_tier: outcomeNewTier || undefined,
      });
      setRecordSyncStatuses((prev) => ({ ...prev, [childId]: "pending" }));
      setPendingSyncCount((prev) => prev + 1);
      setShowOutcomeModal(false);
      setSelectedChildForOutcome(null);
      setSelectedReferral(null);
      setOutcomeNotes("");
      push("Network error. Outcome queued offline.", "warning");
    }
  }

  // Idempotent Sync Queue Trigger
  async function handleSyncNow() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const summary = await processSyncQueue((batch) => referralApi.syncBatch(batch));
      const pending = await getPendingSyncCount();
      setPendingSyncCount(pending);
      await refreshSyncState();

      if (summary.processed_count > 0) {
        push(
          `Sync complete: ${summary.processed_count} items processed (${summary.created_count} created, ${summary.deduplicated_count} deduplicated${summary.conflict_count > 0 ? `, ${summary.conflict_count} conflicts` : ""
          }).`,
          summary.conflict_count > 0 ? "warning" : "success"
        );
      } else {
        push("All local records are synchronized.", "info");
      }
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Sync attempt failed", "error");
    } finally {
      setIsSyncing(false);
    }
  }

  // Purge all offline data upon device handover or logout
  async function handleClearDeviceData() {
    if (
      !window.confirm(
        "Are you sure you want to completely clear all offline cached data from this device? This will purge all cached child records, offline screenings, and pending sync queues. Use this when handing over shared Anganwadi/ASHA mobile tablets."
      )
    ) {
      return;
    }
    try {
      await clearAllOfflineData();
      setPendingSyncCount(0);
      setRecordSyncStatuses({});
      setConflicts([]);
      push("All local device data has been cleared securely.", "success");
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to clear device data", "error");
    }
  }

  // Advance referral lifecycle status
  async function handleAdvanceStatus(ref: ReferralRecord, targetStatus: string) {
    try {
      const updated = await referralApi.updateReferral(ref.id, { status: targetStatus });
      push(`Status updated: ${ref.status} → ${updated.status}`, "success");
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Invalid status transition", "error");
    }
  }

  // Open Summary Modal (6a)
  async function handleOpenSummary(ref: ReferralRecord) {
    try {
      setSelectedReferral(ref);
      const sum = await referralApi.getSummary(ref.id);
      setSummaryData(sum);
      setShowSummaryModal(true);
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to load summary", "error");
    }
  }

  async function handleCopySummaryText() {
    if (!selectedReferral) return;
    try {
      const txt = await referralApi.getSummaryText(selectedReferral.id);
      await navigator.clipboard.writeText(txt);
      push("Minimal referral summary copied to clipboard.", "success");
    } catch {
      push("Failed to copy summary.", "error");
    }
  }

  // Demo seeder: Seed 200 children
  async function handleSeedChildren() {
    setSeeding(true);
    try {
      const res = await referralApi.seedChildren(200, worker?.area, true);
      push(res.message, "success");
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to seed children", "error");
    } finally {
      setSeeding(false);
    }
  }

  // Create child
  async function handleCreateChild(e: React.FormEvent) {
    e.preventDefault();
    if (!newChildConsent) {
      push("Explicit caregiver consent is required by privacy policy.", "error");
      return;
    }
    try {
      const child = await referralApi.createChild({
        pseudonymous_id: newChildPseudoId.trim() || undefined,
        age_bracket: newChildBracket,
        consent_given: true,
      });
      push(`Registered pseudonymous child ${child.pseudonymous_id} with consent recorded.`, "success");
      setShowChildModal(false);
      setNewChildPseudoId("");
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to register child", "error");
    }
  }

  // Create manual referral
  async function handleCreateReferral(e: React.FormEvent) {
    e.preventDefault();
    if (!refChildId || !refFacility || !refReason) {
      push("Please fill all required referral fields.", "error");
      return;
    }
    try {
      const domainList = refDomains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      const created = await referralApi.createReferral({
        child_id: refChildId,
        to_facility: refFacility.trim(),
        reason: refReason.trim(),
        tier: refTier,
        domains_of_concern: domainList,
        safety_rule_trigger: refSafetyTrigger.trim() || undefined,
      });
      push(`Created referral ${created.id.slice(0, 8)}… with status "created"`, "success");
      setShowReferralModal(false);
      setRefReason("");
      setRefSafetyTrigger("");
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to create referral", "error");
    }
  }

  // Delete child
  async function handleDeleteChild(id: string) {
    if (!window.confirm("Permanently delete this child record and all associated referrals? (Right to erasure)")) {
      return;
    }
    try {
      const res = await referralApi.deleteChild(id);
      push(res.message, "success");
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to remove child", "error");
    }
  }

  // Delete referral
  async function handleDeleteReferral(refId: string) {
    if (!window.confirm("Permanently delete this referral?")) return;
    try {
      const res = await referralApi.deleteReferral(refId);
      push(res.message, "success");
      await loadData();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "Failed to delete referral", "error");
    }
  }

  const getTierVisual = (tier?: string | null) => {
    if (!tier || tier === "Unscreened") {
      return {
        label: "Needs Screening",
        icon: "",
        dot: "#9ca3af",
        bg: "rgba(156, 163, 175, 0.15)",
        text: "#475569",
        border: "rgba(156, 163, 175, 0.35)",
      };
    }
    if (tier.startsWith("Tier 1")) {
      return {
        label: "On Track",
        icon: "",
        dot: "#22c55e",
        bg: "rgba(34, 197, 94, 0.15)",
        text: "#15803d",
        border: "rgba(34, 197, 94, 0.35)",
      };
    }
    if (tier.startsWith("Tier 2")) {
      return {
        label: "Watch Closely",
        icon: "",
        dot: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.15)",
        text: "#b45309",
        border: "rgba(245, 158, 11, 0.35)",
      };
    }
    return {
      label: "Doctor Referral",
      icon: "",
      dot: "#ef4444",
      bg: "rgba(239, 68, 68, 0.15)",
      text: "#b91c1c",
      border: "rgba(239, 68, 68, 0.35)",
    };
  };

  const statusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "created":
        return { bg: "rgba(176, 79, 31, 0.12)", text: "#b04f1f", border: "rgba(176, 79, 31, 0.28)" };
      case "sent":
        return { bg: "rgba(47, 109, 129, 0.12)", text: "#2f6d81", border: "rgba(47, 109, 129, 0.28)" };
      case "seen":
        return { bg: "rgba(138, 95, 16, 0.12)", text: "#8a5f10", border: "rgba(138, 95, 16, 0.28)" };
      case "outcome recorded":
        return { bg: "rgba(47, 122, 92, 0.12)", text: "#2f7a5c", border: "rgba(47, 122, 92, 0.28)" };
      case "closed":
        return { bg: "rgba(33, 23, 9, 0.06)", text: "#6e5d47", border: "rgba(33, 23, 9, 0.14)" };
      default:
        return { bg: "rgba(33, 23, 9, 0.06)", text: "#211709", border: "rgba(33, 23, 9, 0.14)" };
    }
  };

  return (
    <div
      className="feature-page"
      style={{
        maxWidth: "1080px",
        margin: "0 auto",
        padding: "1rem 0.75rem",
        boxSizing: "border-box",
        overflowX: "hidden",
        width: "100%",
      }}
    >
      <PageNav backTo="/referrals" backLabel="Refresh dashboard" preferHistoryBack={false} />

      {/* Header Banner */}
      <section style={{ marginBottom: "1rem", width: "100%", boxSizing: "border-box" }}>
        <p className="eyebrow">
          Community Health Network · ASHA / Anganwadi / ANM
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <div>
            <h1 className="display" style={{ margin: 0 }}>
              Frontline Worker Dashboard
            </h1>
            <p className="lede" style={{ margin: "0.5rem 0 0" }}>
              Plain-language developmental triage, village house visits, and 1-touch clinical handoffs.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            {worker && (
              <div
                style={{
                  display: "flex",
                  gap: "0.4rem",
                  alignItems: "center",
                  background: "rgba(255, 248, 232, 0.85)",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "999px",
                  border: "1px solid rgba(33, 23, 9, 0.12)",
                  fontSize: "0.82rem",
                  boxSizing: "border-box",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <User size={14} />
                  <strong>{worker.name}</strong>
                </span>
                <span>·</span>
                <span style={{ color: "#15803d", fontWeight: 700 }}>{worker.role.toUpperCase()}</span>
                <span>·</span>
                <span style={{ color: "#2f6d81" }}>Ward: <strong>{worker.area}</strong></span>
              </div>
            )}

            <button
              type="button"
              className="btn btn--secondary"
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", minHeight: "44px" }}
              onClick={handleSeedChildren}
              disabled={seeding}
              title="Seed 200 realistic children with diverse tiers and follow-up dates"
            >
              {seeding ? "Seeding…" : "Seed 200 Children"}
            </button>
          </div>
        </div>
      </section>

      {/* Offline Sync & Connectivity Control Bar */}
      <div
        style={{
          background: !isOnline
            ? "rgba(239, 68, 68, 0.12)"
            : pendingSyncCount > 0
              ? "rgba(245, 158, 11, 0.12)"
              : "rgba(34, 197, 94, 0.08)",
          border: `1px solid ${!isOnline
              ? "rgba(239, 68, 68, 0.35)"
              : pendingSyncCount > 0
                ? "rgba(245, 158, 11, 0.35)"
                : "rgba(34, 197, 94, 0.25)"
            }`,
          borderRadius: "10px",
          padding: "0.6rem 0.85rem",
          marginBottom: "0.75rem",
          fontSize: "0.82rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {!isOnline ? (
              <WifiOff size={16} color="#ef4444" />
            ) : pendingSyncCount > 0 ? (
              <Clock size={16} color="#f59e0b" />
            ) : (
              <Wifi size={16} color="#22c55e" />
            )}
          </span>
          <div>
            <strong>
              {!isOnline
                ? `Offline Mode — Working Locally (${pendingSyncCount} changes queued)`
                : pendingSyncCount > 0
                  ? `Online — ${pendingSyncCount} offline changes pending sync`
                  : "Online — All records synchronized with server"}
            </strong>
            <div style={{ fontSize: "0.74rem", opacity: 0.8 }}>
              {!isOnline
                ? "All screenings, visits, and referrals are saved to IndexedDB storage and will sync upon reconnect."
                : "Zero uncommitted changes in IndexedDB."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          {conflicts.length > 0 && (
            <button
              type="button"
              className="btn btn--secondary"
              style={{
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
                minHeight: "36px",
                background: "rgba(239, 68, 68, 0.2)",
                color: "#b04f1f",
                borderColor: "rgba(239, 68, 68, 0.4)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
              onClick={() => setShowConflictsModal(true)}
            >
              <AlertTriangle size={13} />
              View Conflicts ({conflicts.length})
            </button>
          )}

          {isOnline && (
            <button
              type="button"
              id="sync-now-worker-btn"
              data-testid="sync-now-worker-btn"
              className="btn btn--primary"
              style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", minHeight: "36px", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
              onClick={handleSyncNow}
              disabled={isSyncing}
            >
              <RefreshCw size={13} className={isSyncing ? "spin" : ""} />
              {isSyncing ? "Syncing…" : "Sync Now"}
            </button>
          )}

          <button
            type="button"
            id="clear-device-data-btn"
            data-testid="clear-device-data-btn"
            className="btn btn--ghost"
            style={{
              fontSize: "0.75rem",
              padding: "0.3rem 0.6rem",
              minHeight: "36px",
              border: "1px solid rgba(33, 23, 9, 0.14)",
              color: "#b04f1f",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
            onClick={handleClearDeviceData}
            title="Purge all offline cached data and sync queues from this device"
          >
            <Trash2 size={13} />
            Clear Device Data
          </button>
        </div>
      </div>

      {/* Privacy Guarantee Banner */}
      <div
        style={{
          background: "rgba(34, 197, 94, 0.08)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          borderRadius: "10px",
          padding: "0.6rem 0.85rem",
          marginBottom: "1rem",
          fontSize: "0.82rem",
          color: "#15803d",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        <div style={{ wordBreak: "break-word", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <ShieldCheck size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>Privacy Guarantee:</strong> 100% Opt-In with consent recorded · Pseudonymous IDs only ·
            Area-isolated ({worker?.area ?? "Ward 12"}) · Minimal data summary · Browser IndexedDB offline storage strictly purged on logout or device handover · Removable upon request.
          </span>
        </div>
        <Link to="/growth" style={{ color: "#15803d", textDecoration: "underline", fontSize: "0.8rem", fontWeight: 600 }}>
          Privacy Statement →
        </Link>
      </div>

      {/* Primary Navigation Tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1rem",
          borderBottom: "1px solid rgba(33, 23, 9, 0.12)",
          paddingBottom: "0.5rem",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={activeTab === "dashboard" ? "btn btn--primary" : "btn btn--ghost"}
            style={{ fontSize: "0.85rem", padding: "0.45rem 0.85rem", minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            onClick={() => setActiveTab("dashboard")}
          >
            <LayoutGrid size={15} /> Village Dashboard ({children.length})
          </button>
          <button
            type="button"
            className={activeTab === "referrals" ? "btn btn--primary" : "btn btn--ghost"}
            style={{ fontSize: "0.85rem", padding: "0.45rem 0.85rem", minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            onClick={() => setActiveTab("referrals")}
          >
            <ClipboardList size={15} /> Facility Handoffs ({referrals.length})
          </button>
          <button
            type="button"
            className={activeTab === "children" ? "btn btn--primary" : "btn btn--ghost"}
            style={{ fontSize: "0.85rem", padding: "0.45rem 0.85rem", minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            onClick={() => setActiveTab("children")}
          >
            <Users size={15} /> Child Registry ({children.length})
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.8rem", minHeight: "44px" }}
            onClick={() => setShowChildModal(true)}
          >
            + Register Child
          </button>
          <button
            type="button"
            className="btn btn--primary"
            style={{ fontSize: "0.82rem", padding: "0.4rem 0.8rem", minHeight: "44px" }}
            onClick={() => setShowReferralModal(true)}
            disabled={children.length === 0}
          >
            + New Referral
          </button>
        </div>
      </div>

      {loading ? (
        <p className="lede">Loading community health data…</p>
      ) : activeTab === "dashboard" ? (
        /* ========================================================================= */
        /* LOW-LITERACY WORKER DASHBOARD                                            */
        /* ========================================================================= */
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          {/* Top Tier Counters - Tap to Filter */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))",
              gap: "0.5rem",
              marginBottom: "1rem",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* On Track */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedTier(selectedTier === "Tier 1" ? "all" : "Tier 1");
                setOverdueOnly(false);
              }}
              style={{
                background: selectedTier === "Tier 1" ? "rgba(34, 197, 94, 0.25)" : "rgba(34, 197, 94, 0.08)",
                border: `2px solid ${selectedTier === "Tier 1" ? "#22c55e" : "rgba(34, 197, 94, 0.3)"}`,
                borderRadius: "10px",
                padding: "0.6rem 0.5rem",
                textAlign: "center",
                cursor: "pointer",
                boxSizing: "border-box",
                minHeight: "75px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase" }}>
                On Track
              </div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                {computedCounts.tier1_typical}
              </div>
              <div style={{ fontSize: "0.68rem", opacity: 0.7 }}>Tier 1 Typical</div>
            </div>

            {/* Watch Closely */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedTier(selectedTier === "Tier 2" ? "all" : "Tier 2");
                setOverdueOnly(false);
              }}
              style={{
                background: selectedTier === "Tier 2" ? "rgba(245, 158, 11, 0.25)" : "rgba(245, 158, 11, 0.08)",
                border: `2px solid ${selectedTier === "Tier 2" ? "#f59e0b" : "rgba(245, 158, 11, 0.3)"}`,
                borderRadius: "10px",
                padding: "0.6rem 0.5rem",
                textAlign: "center",
                cursor: "pointer",
                boxSizing: "border-box",
                minHeight: "75px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#8a5f10", textTransform: "uppercase" }}>
                Watch Closely
              </div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                {computedCounts.tier2_monitor}
              </div>
              <div style={{ fontSize: "0.68rem", opacity: 0.7 }}>Tier 2 Reflex</div>
            </div>

            {/* Doctor Referral */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedTier(selectedTier === "Tier 3" ? "all" : "Tier 3");
                setOverdueOnly(false);
              }}
              style={{
                background: selectedTier === "Tier 3" ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.08)",
                border: `2px solid ${selectedTier === "Tier 3" ? "#b04f1f" : "rgba(239, 68, 68, 0.3)"}`,
                borderRadius: "10px",
                padding: "0.6rem 0.5rem",
                textAlign: "center",
                cursor: "pointer",
                boxSizing: "border-box",
                minHeight: "75px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#b04f1f", textTransform: "uppercase" }}>
                Refer
              </div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                {computedCounts.tier3_referral}
              </div>
              <div style={{ fontSize: "0.68rem", opacity: 0.7 }}>Tier 3 Clinical</div>
            </div>

            {/* Visit Due / Overdue */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setOverdueOnly(!overdueOnly);
                setSelectedTier("all");
              }}
              style={{
                background: overdueOnly ? "rgba(168, 85, 247, 0.3)" : "rgba(168, 85, 247, 0.1)",
                border: `2px solid ${overdueOnly ? "#a855f7" : "rgba(168, 85, 247, 0.35)"}`,
                borderRadius: "10px",
                padding: "0.6rem 0.5rem",
                textAlign: "center",
                cursor: "pointer",
                boxSizing: "border-box",
                minHeight: "75px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#c084fc", textTransform: "uppercase" }}>
                Overdue
              </div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                {computedCounts.overdue_follow_up}
              </div>
              <div style={{ fontSize: "0.68rem", opacity: 0.7 }}>Home Visit Due</div>
            </div>

            {/* Unscreened */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedTier(selectedTier === "Unscreened" ? "all" : "Unscreened");
                setOverdueOnly(false);
              }}
              style={{
                background: selectedTier === "Unscreened" ? "rgba(156, 163, 175, 0.25)" : "rgba(33, 23, 9, 0.03)",
                border: `2px solid ${selectedTier === "Unscreened" ? "#9ca3af" : "rgba(33, 23, 9, 0.14)"}`,
                borderRadius: "10px",
                padding: "0.6rem 0.5rem",
                textAlign: "center",
                cursor: "pointer",
                boxSizing: "border-box",
                minHeight: "75px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#5b4a38", textTransform: "uppercase" }}>
                Unscreened
              </div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                {computedCounts.unscreened}
              </div>
              <div style={{ fontSize: "0.68rem", opacity: 0.7 }}>Need Check</div>
            </div>
          </div>

          {/* Progress Indicator Component Reuse */}
          <div style={{ marginBottom: "1rem", width: "100%", boxSizing: "border-box" }}>
            <ProgressIndicator
              coveredCount={computedCounts.total_children - computedCounts.unscreened}
              totalDomains={Math.max(computedCounts.total_children, 1)}
              label="children screened in area"
            />
          </div>

          {/* Overdue Follow-up Urgent Banner */}
          {computedCounts.overdue_follow_up > 0 && (
            <div
              style={{
                background: "rgba(168, 85, 247, 0.12)",
                border: "1px solid rgba(168, 85, 247, 0.4)",
                borderRadius: "10px",
                padding: "0.65rem 0.85rem",
                marginBottom: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#5b4a38" }}>
                <strong>Follow-Up Alert:</strong> {computedCounts.overdue_follow_up} children have overdue visits or referrals awaiting clinical follow-up.
              </div>
              <button
                type="button"
                className={overdueOnly ? "btn btn--primary" : "btn btn--secondary"}
                style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem", minHeight: "36px" }}
                onClick={() => setOverdueOnly(!overdueOnly)}
              >
                {overdueOnly ? "Show All Children" : "Filter Overdue Follow-ups →"}
              </button>
            </div>
          )}

          {/* Filters, Search & View Toolbar */}
          <div
            style={{
              background: "rgba(33, 23, 9, 0.03)",
              border: "1px solid rgba(33, 23, 9, 0.1)",
              borderRadius: "12px",
              padding: "0.75rem",
              marginBottom: "1rem",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* Search Input & Village/Ward Selector */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "0.6rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {/* Search */}
              <div style={{ flex: "1 1 180px", minWidth: "140px" }}>
                <input
                  type="text"
                  placeholder="Search child ID or area…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.65rem",
                    borderRadius: "8px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    fontSize: "0.85rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                />
              </div>

              {/* Village/Ward Dropdown */}
              <div style={{ flex: "1 1 140px", minWidth: "120px" }}>
                <select
                  value={selectedWard}
                  onChange={(e) => setSelectedWard(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.5rem",
                    borderRadius: "8px",
                    background: "#2a221b",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    fontSize: "0.85rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                >
                  <option value="all">All Wards / Villages</option>
                  {availableWards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              {/* Age Bracket Dropdown */}
              <div style={{ flex: "1 1 120px", minWidth: "110px" }}>
                <select
                  value={selectedAgeGroup}
                  onChange={(e) => setSelectedAgeGroup(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.5rem",
                    borderRadius: "8px",
                    background: "#2a221b",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    fontSize: "0.85rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                >
                  <option value="all">All Ages</option>
                  <option value="0-6m">0–6m</option>
                  <option value="6-12m">6–12m</option>
                  <option value="12-24m">12–24m</option>
                  <option value="24-36m">24–36m</option>
                  <option value="36-48m">36–48m</option>
                  <option value="48-60m">48–60m</option>
                </select>
              </div>

              {/* View Switch: Card View vs Batch View */}
              <div style={{ display: "flex", gap: "0.3rem" }}>
                <button
                  type="button"
                  className={viewMode === "cards" ? "btn btn--primary" : "btn btn--ghost"}
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.7rem", minHeight: "44px" }}
                  onClick={() => setViewMode("cards")}
                  title="Card View"
                >
                  Cards
                </button>
                <button
                  type="button"
                  className={viewMode === "batch" ? "btn btn--primary" : "btn btn--ghost"}
                  style={{ fontSize: "0.8rem", padding: "0.4rem 0.7rem", minHeight: "44px" }}
                  onClick={() => setViewMode("batch")}
                  title="Batch Checklist View"
                >
                  Batch
                </button>
              </div>
            </div>

            {/* Scrollable Filter Chips (360px safe overflow-x auto) */}
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                paddingBottom: "0.2rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedTier("all");
                  setOverdueOnly(false);
                }}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  minHeight: "36px",
                  background: selectedTier === "all" && !overdueOnly ? "#d97706" : "rgba(33, 23, 9, 0.08)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                All ({children.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverdueOnly(!overdueOnly);
                  setSelectedTier("all");
                }}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  minHeight: "36px",
                  background: overdueOnly ? "#a855f7" : "rgba(168, 85, 247, 0.15)",
                  color: "#5b4a38",
                  border: "1px solid rgba(168, 85, 247, 0.35)",
                  cursor: "pointer",
                }}
              >
                Overdue ({computedCounts.overdue_follow_up})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTier("Tier 1");
                  setOverdueOnly(false);
                }}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  minHeight: "36px",
                  background: selectedTier === "Tier 1" ? "#16a34a" : "rgba(34, 197, 94, 0.15)",
                  color: "#86efac",
                  border: "1px solid rgba(34, 197, 94, 0.35)",
                  cursor: "pointer",
                }}
              >
                On Track ({computedCounts.tier1_typical})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTier("Tier 2");
                  setOverdueOnly(false);
                }}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  minHeight: "36px",
                  background: selectedTier === "Tier 2" ? "#d97706" : "rgba(245, 158, 11, 0.15)",
                  color: "#8a5f10",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  cursor: "pointer",
                }}
              >
                Watch ({computedCounts.tier2_monitor})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTier("Tier 3");
                  setOverdueOnly(false);
                }}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  minHeight: "36px",
                  background: selectedTier === "Tier 3" ? "#dc2626" : "rgba(239, 68, 68, 0.15)",
                  color: "#b04f1f",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  cursor: "pointer",
                }}
              >
                Refer ({computedCounts.tier3_referral})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTier("Unscreened");
                  setOverdueOnly(false);
                }}
                style={{
                  padding: "0.3rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  minHeight: "36px",
                  background: selectedTier === "Unscreened" ? "#4b5563" : "rgba(156, 163, 175, 0.15)",
                  color: "#211709",
                  border: "1px solid rgba(156, 163, 175, 0.35)",
                  cursor: "pointer",
                }}
              >
                Unscreened ({computedCounts.unscreened})
              </button>
            </div>
          </div>

          {/* Children List Header Info */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              fontSize: "0.82rem",
              opacity: 0.85,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <span>
              Showing <strong>{filteredChildren.length}</strong> of {children.length} children
            </span>
            {(selectedTier !== "all" || overdueOnly || selectedWard !== "all" || selectedAgeGroup !== "all" || searchQuery) && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem" }}
                onClick={() => {
                  setSelectedTier("all");
                  setOverdueOnly(false);
                  setSelectedWard("all");
                  setSelectedAgeGroup("all");
                  setSearchQuery("");
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Empty State */}
          {filteredChildren.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "2.5rem 1rem",
                background: "rgba(33, 23, 9, 0.03)",
                borderRadius: "12px",
                border: "1px dashed rgba(33, 23, 9, 0.14)",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <h2 className="h-sm" style={{ margin: "0 0 0.5rem" }}>No matching children found</h2>
              <p style={{ opacity: 0.75, maxWidth: "450px", margin: "0 auto 1rem", fontSize: "0.85rem" }}>
                Try adjusting your filters, searching a different ID, or seed 200 demo children for your ward.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSeedChildren}
                disabled={seeding}
              >
                {seeding ? "Seeding…" : "Seed 200 Children"}
              </button>
            </div>
          ) : viewMode === "cards" ? (
            /* =================================================================== */
            /* VIEW 1: MOBILE-FIRST CARD VIEW                                      */
            /* =================================================================== */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {filteredChildren.map((ch) => {
                const tv = getTierVisual(ch.current_tier);
                const activeRef = referralByChildId.get(ch.id) || referralByChildId.get(ch.pseudonymous_id);
                const isOverdue = ch.is_overdue || (ch.follow_up_due_at && new Date(ch.follow_up_due_at).getTime() < Date.now());

                return (
                  <div
                    key={ch.id}
                    style={{
                      background: isOverdue ? "rgba(168, 85, 247, 0.08)" : "rgba(33, 23, 9, 0.03)",
                      border: `1.5px solid ${isOverdue ? "rgba(168, 85, 247, 0.5)" : "rgba(33, 23, 9, 0.1)"}`,
                      borderRadius: "12px",
                      padding: "0.85rem",
                      width: "100%",
                      boxSizing: "border-box",
                      wordBreak: "break-word",
                    }}
                  >
                    {/* Top Meta Row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                        marginBottom: "0.4rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "0.2rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: tv.bg,
                            color: tv.text,
                            border: `1px solid ${tv.border}`,
                          }}
                        >
                          {tv.icon} {tv.label}
                        </span>

                        {isOverdue && (
                          <span
                            style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "999px",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              background: "rgba(239, 68, 68, 0.2)",
                              color: "#b04f1f",
                              border: "1px solid rgba(239, 68, 68, 0.4)",
                            }}
                          >
                            VISIT OVERDUE
                          </span>
                        )}

                        <span style={{ fontSize: "0.8rem", color: "#6e5d47" }}>
                          {ch.age_bracket}
                        </span>

                        <span
                          data-testid={`sync-status-${ch.id}`}
                          style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background:
                              recordSyncStatuses[ch.id] === "pending"
                                ? "rgba(245, 158, 11, 0.2)"
                                : recordSyncStatuses[ch.id] === "conflict"
                                  ? "rgba(239, 68, 68, 0.2)"
                                  : "rgba(34, 197, 94, 0.15)",
                            color:
                              recordSyncStatuses[ch.id] === "pending"
                                ? "#8a5f10"
                                : recordSyncStatuses[ch.id] === "conflict"
                                  ? "#b04f1f"
                                  : "#86efac",
                            border: `1px solid ${recordSyncStatuses[ch.id] === "pending"
                                ? "rgba(245, 158, 11, 0.4)"
                                : recordSyncStatuses[ch.id] === "conflict"
                                  ? "rgba(239, 68, 68, 0.4)"
                                  : "rgba(34, 197, 94, 0.3)"
                              }`,
                          }}
                        >
                          {recordSyncStatuses[ch.id] === "pending"
                            ? "Pending Sync"
                            : recordSyncStatuses[ch.id] === "conflict"
                              ? "Conflict"
                              : "Synced"}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.78rem", color: "#6e5d47" }}>
                        {ch.village_ward}
                      </div>
                    </div>

                    {/* Child ID & Quick Info */}
                    <div style={{ margin: "0.3rem 0" }}>
                      <h2
                        className="h-sm"
                        style={{
                          margin: 0,
                          fontSize: "1.05rem",
                          letterSpacing: "-0.01em",
                          wordBreak: "break-all",
                        }}
                      >
                        <code>{ch.pseudonymous_id}</code>
                      </h2>
                    </div>

                    {/* Visit & Contact Tracking Information */}
                    <div
                      style={{
                        display: "flex",
                        gap: "0.6rem",
                        fontSize: "0.78rem",
                        color: "#6e5d47",
                        margin: "0.3rem 0",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        Visited: <strong>{ch.contact_count ?? 0} times</strong>
                      </span>
                      <span>·</span>
                      <span>
                        {ch.last_contacted_at
                          ? `Last: ${new Date(ch.last_contacted_at).toLocaleDateString()}`
                          : "Never visited"}
                      </span>
                      {ch.follow_up_due_at && (
                        <>
                          <span>·</span>
                          <span style={{ color: isOverdue ? "#b04f1f" : "#c084fc" }}>
                            Next due: {new Date(ch.follow_up_due_at).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Flags & Concerns Pills */}
                    {ch.domains_flagged && ch.domains_flagged.length > 0 && (
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", margin: "0.3rem 0" }}>
                        {ch.domains_flagged.map((d) => (
                          <span
                            key={d}
                            style={{
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#8a5f10",
                              fontSize: "0.72rem",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                            }}
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    )}

                    {ch.safety_rule_triggered && (
                      <div
                        style={{
                          margin: "0.3rem 0",
                          fontSize: "0.75rem",
                          color: "#b04f1f",
                          background: "rgba(239, 68, 68, 0.1)",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          border: "1px solid rgba(239, 68, 68, 0.25)",
                        }}
                      >
                        Safety Trigger: {ch.safety_rule_triggered}
                      </div>
                    )}

                    {/* Active Referral Section if exists */}
                    {activeRef && (
                      <div
                        style={{
                          margin: "0.5rem 0",
                          padding: "0.5rem 0.65rem",
                          borderRadius: "8px",
                          background: "rgba(0,0,0,0.25)",
                          border: "1px solid rgba(33, 23, 9, 0.12)",
                          fontSize: "0.82rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.3rem" }}>
                          <div>
                            <strong>To: {activeRef.to_facility}</strong>
                            <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Reason: {activeRef.reason}</div>
                          </div>
                          <span
                            style={{
                              padding: "0.15rem 0.45rem",
                              borderRadius: "999px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background: statusBadgeColor(activeRef.status).bg,
                              color: statusBadgeColor(activeRef.status).text,
                              border: `1px solid ${statusBadgeColor(activeRef.status).border}`,
                            }}
                          >
                            ● {activeRef.status}
                          </span>
                        </div>

                        {/* Lifecycle transition quick button */}
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                          {activeRef.status === "created" && (
                            <button
                              type="button"
                              className="btn btn--secondary"
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", minHeight: "36px" }}
                              onClick={() => handleAdvanceStatus(activeRef, "sent")}
                            >
                              Mark Sent →
                            </button>
                          )}
                          {activeRef.status === "sent" && (
                            <button
                              type="button"
                              className="btn btn--secondary"
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", minHeight: "36px" }}
                              onClick={() => handleAdvanceStatus(activeRef, "seen")}
                            >
                              Mark Seen at Facility →
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn--ghost"
                            style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", minHeight: "36px" }}
                            onClick={() => handleOpenSummary(activeRef)}
                          >
                            One-Page Minimal Summary
                          </button>
                        </div>
                      </div>
                    )}

                    {/* PRIMARY QUICK ACTIONS TOOLBAR (Large touch targets >= 44px) */}
                    <div
                      style={{
                        marginTop: "0.6rem",
                        paddingTop: "0.5rem",
                        borderTop: "1px solid rgba(33, 23, 9, 0.08)",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                      }}
                    >
                      {/* Action 1: Start Screening */}
                      <button
                        type="button"
                        className="btn btn--primary"
                        style={{
                          fontSize: "0.78rem",
                          padding: "0.35rem 0.65rem",
                          minHeight: "44px",
                          flex: "1 1 110px",
                        }}
                        onClick={() => handleStartScreening(ch)}
                      >
                        Screen
                      </button>

                      {/* Action 2: One-Touch Referral (6a) */}
                      <button
                        type="button"
                        className="btn btn--secondary"
                        style={{
                          fontSize: "0.78rem",
                          padding: "0.35rem 0.65rem",
                          minHeight: "44px",
                          flex: "1 1 110px",
                        }}
                        onClick={() => handleOneTouchReferral(ch.id)}
                      >
                        1-Touch Refer
                      </button>

                      {/* Action 3: Mark Contacted */}
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{
                          fontSize: "0.78rem",
                          padding: "0.35rem 0.65rem",
                          minHeight: "44px",
                          flex: "1 1 100px",
                          border: "1px solid rgba(33, 23, 9, 0.14)",
                        }}
                        onClick={() => handleMarkContacted(ch.id)}
                      >
                        Contacted
                      </button>

                      {/* Action 4: Record Outcome */}
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{
                          fontSize: "0.78rem",
                          padding: "0.35rem 0.65rem",
                          minHeight: "44px",
                          flex: "1 1 100px",
                          border: "1px solid rgba(33, 23, 9, 0.14)",
                        }}
                        onClick={() => handleOpenOutcome(ch)}
                      >
                        Outcome
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* =================================================================== */
            /* VIEW 2: BATCH CHECKLIST VIEW (FRONT-LINE DOOR-TO-DOOR VISITS)      */
            /* =================================================================== */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {filteredChildren.map((ch, idx) => {
                const tv = getTierVisual(ch.current_tier);
                const isOverdue = ch.is_overdue || (ch.follow_up_due_at && new Date(ch.follow_up_due_at).getTime() < Date.now());

                return (
                  <div
                    key={ch.id}
                    style={{
                      background: isOverdue ? "rgba(168, 85, 247, 0.1)" : "rgba(33, 23, 9, 0.03)",
                      border: `1px solid ${isOverdue ? "rgba(168, 85, 247, 0.4)" : "rgba(33, 23, 9, 0.1)"}`,
                      borderRadius: "8px",
                      padding: "0.6rem 0.75rem",
                      width: "100%",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.3rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>#{idx + 1}</span>
                        <span style={{ fontSize: "0.95rem" }}>{tv.icon}</span>
                        <strong style={{ fontSize: "0.88rem", wordBreak: "break-all" }}>
                          <code>{ch.pseudonymous_id}</code>
                        </strong>
                      </div>

                      <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", color: "#6e5d47" }}>{ch.age_bracket}</span>
                        <span style={{ fontSize: "0.75rem", color: "#2f6d81" }}>{ch.village_ward}</span>
                        {isOverdue && (
                          <span style={{ fontSize: "0.72rem", color: "#b04f1f", fontWeight: 700 }}>
                            OVERDUE
                          </span>
                        )}
                        <span
                          data-testid={`sync-status-batch-${ch.id}`}
                          style={{
                            padding: "0.15rem 0.45rem",
                            borderRadius: "999px",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            background:
                              recordSyncStatuses[ch.id] === "pending"
                                ? "rgba(245, 158, 11, 0.2)"
                                : recordSyncStatuses[ch.id] === "conflict"
                                  ? "rgba(239, 68, 68, 0.2)"
                                  : "rgba(34, 197, 94, 0.15)",
                            color:
                              recordSyncStatuses[ch.id] === "pending"
                                ? "#8a5f10"
                                : recordSyncStatuses[ch.id] === "conflict"
                                  ? "#b04f1f"
                                  : "#86efac",
                            border: `1px solid ${recordSyncStatuses[ch.id] === "pending"
                                ? "rgba(245, 158, 11, 0.4)"
                                : recordSyncStatuses[ch.id] === "conflict"
                                  ? "rgba(239, 68, 68, 0.4)"
                                  : "rgba(34, 197, 94, 0.3)"
                              }`,
                          }}
                        >
                          {recordSyncStatuses[ch.id] === "pending"
                            ? "Pending"
                            : recordSyncStatuses[ch.id] === "conflict"
                              ? "Conflict"
                              : "Synced"}
                        </span>
                      </div>
                    </div>

                    {/* Batch 1-tap quick action buttons */}
                    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
                      <button
                        type="button"
                        className="btn btn--primary"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.55rem", minHeight: "44px", flex: 1 }}
                        onClick={() => handleStartScreening(ch)}
                      >
                        Screen
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.55rem", minHeight: "44px", flex: 1 }}
                        onClick={() => handleOneTouchReferral(ch.id)}
                      >
                        Refer
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.55rem", minHeight: "44px", flex: 1, border: "1px solid rgba(33, 23, 9, 0.14)" }}
                        onClick={() => handleMarkContacted(ch.id)}
                      >
                        Visited ({ch.contact_count ?? 0})
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.55rem", minHeight: "44px", flex: 1, border: "1px solid rgba(33, 23, 9, 0.14)" }}
                        onClick={() => handleOpenOutcome(ch)}
                      >
                        Outcome
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === "referrals" ? (
        /* ========================================================================= */
        /* REFERRALS LIFECYCLE TAB                                                  */
        /* ========================================================================= */
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          {referrals.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 1rem",
                background: "rgba(33, 23, 9, 0.03)",
                borderRadius: "12px",
                border: "1px dashed rgba(33, 23, 9, 0.14)",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <h2 className="h-sm" style={{ margin: "0 0 0.5rem" }}>No active referrals for {worker?.area ?? "this area"}</h2>
              <p style={{ opacity: 0.75, maxWidth: "500px", margin: "0 auto 1.25rem", fontSize: "0.9rem" }}>
                When screening reveals developmental delays or triggers clinical safety rules,
                create an opt-in referral to a local DEIC or CHC.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowReferralModal(true)}
                disabled={children.length === 0}
              >
                Create First Referral
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "100%", boxSizing: "border-box" }}>
              {referrals.map((ref) => {
                const badge = statusBadgeColor(ref.status);
                return (
                  <div
                    key={ref.id}
                    style={{
                      background: "rgba(33, 23, 9, 0.03)",
                      border: "1px solid rgba(33, 23, 9, 0.1)",
                      borderRadius: "12px",
                      padding: "1.25rem",
                      width: "100%",
                      boxSizing: "border-box",
                      wordBreak: "break-word",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                          <span
                            style={{
                              padding: "0.25rem 0.6rem",
                              borderRadius: "999px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background: badge.bg,
                              color: badge.text,
                              border: `1px solid ${badge.border}`,
                            }}
                          >
                            ● {ref.status}
                          </span>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#211709" }}>
                            Child ID: <code>{ref.child_id}</code>
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "#6e5d47" }}>
                            {ref.tier}
                          </span>
                        </div>
                        <h2 className="h-sm" style={{ margin: "0.5rem 0 0.25rem", fontSize: "1.15rem" }}>
                          To: {ref.to_facility}
                        </h2>
                        <p style={{ margin: 0, fontSize: "0.88rem", opacity: 0.9 }}>
                          <strong>Reason:</strong> {ref.reason}
                        </p>
                      </div>

                      <div style={{ fontSize: "0.78rem", color: "#6e5d47", textAlign: "right" }}>
                        <div>Created: {new Date(ref.created_at).toLocaleDateString()}</div>
                        {ref.sent_at && <div>Sent: {new Date(ref.sent_at).toLocaleDateString()}</div>}
                        {ref.seen_at && <div>Seen: {new Date(ref.seen_at).toLocaleDateString()}</div>}
                        {ref.outcome_recorded_at && <div>Outcome: {new Date(ref.outcome_recorded_at).toLocaleDateString()}</div>}
                      </div>
                    </div>

                    {/* Flags & Domains */}
                    <div style={{ margin: "0.75rem 0", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      {ref.domains_of_concern.map((dom) => (
                        <span
                          key={dom}
                          style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: "6px",
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "#b04f1f",
                            fontSize: "0.78rem",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                          }}
                        >
                          Concern: {dom}
                        </span>
                      ))}
                      {ref.safety_rule_trigger && (
                        <span
                          style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: "6px",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#8a5f10",
                            fontSize: "0.78rem",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                            fontWeight: 600,
                          }}
                        >
                          Safety Trigger: {ref.safety_rule_trigger}
                        </span>
                      )}
                    </div>

                    {/* Outcome notes if recorded */}
                    {ref.outcome_notes && (
                      <div
                        style={{
                          margin: "0.75rem 0",
                          padding: "0.6rem 0.8rem",
                          borderRadius: "8px",
                          background: "rgba(34, 197, 94, 0.08)",
                          border: "1px solid rgba(34, 197, 94, 0.25)",
                          fontSize: "0.85rem",
                          color: "#86efac",
                        }}
                      >
                        <strong>Follow-up Outcome:</strong> {ref.outcome_notes}
                      </div>
                    )}

                    {/* Actions & Lifecycle Transitions */}
                    <div
                      style={{
                        marginTop: "1rem",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid rgba(33, 23, 9, 0.08)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {ref.status === "created" && (
                          <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", minHeight: "44px" }}
                            onClick={() => handleAdvanceStatus(ref, "sent")}
                          >
                            Mark Sent →
                          </button>
                        )}
                        {ref.status === "sent" && (
                          <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", minHeight: "44px" }}
                            onClick={() => handleAdvanceStatus(ref, "seen")}
                          >
                            Mark Seen at Facility →
                          </button>
                        )}
                        {ref.status === "seen" && (
                          <button
                            type="button"
                            className="btn btn--primary"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", minHeight: "44px" }}
                            onClick={() => {
                              setSelectedReferral(ref);
                              setShowOutcomeModal(true);
                            }}
                          >
                            Record Clinical Outcome →
                          </button>
                        )}
                        {ref.status === "outcome recorded" && (
                          <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", minHeight: "44px" }}
                            onClick={() => handleAdvanceStatus(ref, "closed")}
                          >
                            Close Referral
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn--ghost"
                          style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem", minHeight: "44px" }}
                          onClick={() => handleOpenSummary(ref)}
                        >
                          One-Page Minimal Summary
                        </button>
                      </div>

                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "0.78rem", padding: "0.25rem 0.6rem", color: "#b04f1f" }}
                        onClick={() => handleDeleteReferral(ref.id)}
                      >
                        Delete Referral
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* CHILD REGISTRY TAB                                                       */
        /* ========================================================================= */
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          {children.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 1rem",
                background: "rgba(33, 23, 9, 0.03)",
                borderRadius: "12px",
                border: "1px dashed rgba(33, 23, 9, 0.14)",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <h2 className="h-sm" style={{ margin: "0 0 0.5rem" }}>No children registered in {worker?.area ?? "this area"}</h2>
              <p style={{ opacity: 0.75, maxWidth: "500px", margin: "0 auto 1.25rem", fontSize: "0.9rem" }}>
                Frontline health workers only register children with verified caregiver consent.
                All identifiers are strictly pseudonymous.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowChildModal(true)}
              >
                Register Child with Consent
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {children.map((ch) => (
                <div
                  key={ch.id}
                  style={{
                    background: "rgba(33, 23, 9, 0.03)",
                    border: "1px solid rgba(33, 23, 9, 0.1)",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxSizing: "border-box",
                    wordBreak: "break-word",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#4ade80", fontWeight: 700 }}>
                        ✓ Consent Recorded
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#6e5d47" }}>
                        {new Date(ch.consent_recorded_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h2 className="h-sm" style={{ margin: "0.5rem 0 0.25rem", fontSize: "1.05rem" }}>
                      <code>{ch.pseudonymous_id}</code>
                    </h2>
                    <p style={{ margin: "0 0 0.25rem", fontSize: "0.85rem", opacity: 0.85 }}>
                      <strong>Age Bracket:</strong> {ch.age_bracket}
                    </p>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", opacity: 0.85 }}>
                      <strong>Village / Ward:</strong> {ch.village_ward}
                    </p>
                    {ch.current_tier && (
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", opacity: 0.85 }}>
                        <strong>Triage Tier:</strong> {ch.current_tier}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", flex: 1, minHeight: "44px" }}
                      onClick={() => {
                        setRefChildId(ch.pseudonymous_id);
                        setShowReferralModal(true);
                      }}
                    >
                      + Refer Child
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", color: "#b04f1f", minHeight: "44px" }}
                      onClick={() => handleDeleteChild(ch.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: REGISTER CHILD (OPT-IN CONSENT) */}
      {showChildModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, rgba(255,248,232,0.98), rgba(255,241,212,0.92))",
              border: "1px solid rgba(33, 23, 9, 0.14)",
              borderRadius: "16px",
              maxWidth: "480px",
              width: "100%",
              padding: "1.75rem",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              boxSizing: "border-box",
            }}
          >
            <h2 className="h-sm" style={{ margin: "0 0 0.5rem" }}>Register Pseudonymous Child</h2>
            <p style={{ fontSize: "0.85rem", opacity: 0.8, margin: "0 0 1.25rem" }}>
              Area: <strong>{worker?.area ?? "Assigned Area"}</strong>. Never store real names or phone numbers.
            </p>

            <form onSubmit={handleCreateChild}>
              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>Pseudonymous Child Identifier (optional, generated if blank):</span>
                <input
                  type="text"
                  placeholder="e.g. child-ward12-042"
                  value={newChildPseudoId}
                  onChange={(e) => setNewChildPseudoId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "1rem", fontSize: "0.85rem" }}>
                <span>Age Bracket:</span>
                <select
                  value={newChildBracket}
                  onChange={(e) => setNewChildBracket(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "#2a221b",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                >
                  <option value="0-6m">0–6 months</option>
                  <option value="6-12m">6–12 months</option>
                  <option value="12-24m">12–24 months</option>
                  <option value="18-24m">18–24 months</option>
                  <option value="24-30m">24–30 months</option>
                  <option value="30-36m">30–36 months</option>
                  <option value="36-48m">36–48 months</option>
                  <option value="48-60m">48–60 months</option>
                </select>
              </label>

              <label
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                  marginBottom: "1.5rem",
                  fontSize: "0.85rem",
                  background: "rgba(34, 197, 94, 0.08)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(34, 197, 94, 0.25)",
                  boxSizing: "border-box",
                }}
              >
                <input
                  type="checkbox"
                  checked={newChildConsent}
                  onChange={(e) => setNewChildConsent(e.target.checked)}
                  style={{ marginTop: "0.2rem", width: "18px", height: "18px" }}
                  required
                />
                <span>
                  <strong>Explicit Caregiver Consent Verified:</strong> The parent/guardian consented
                  to developmental coordination under community health protocols.
                </span>
              </label>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowChildModal(false)}
                  style={{ minHeight: "44px" }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" style={{ minHeight: "44px" }}>
                  Record & Register Child
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW REFERRAL */}
      {showReferralModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, rgba(255,248,232,0.98), rgba(255,241,212,0.92))",
              border: "1px solid rgba(33, 23, 9, 0.14)",
              borderRadius: "16px",
              maxWidth: "520px",
              width: "100%",
              padding: "1.75rem",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              boxSizing: "border-box",
            }}
          >
            <h2 className="h-sm" style={{ margin: "0 0 0.5rem" }}>Create Clinical Referral</h2>
            <p style={{ fontSize: "0.85rem", opacity: 0.8, margin: "0 0 1.25rem" }}>
              Sends referral from <strong>{worker?.name ?? "CHW"}</strong> to receiving hospital or DEIC.
            </p>

            <form onSubmit={handleCreateReferral}>
              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>Select Pseudonymous Child:</span>
                <select
                  value={refChildId}
                  onChange={(e) => setRefChildId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "#2a221b",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                  required
                >
                  {children.map((ch) => (
                    <option key={ch.id} value={ch.pseudonymous_id}>
                      {ch.pseudonymous_id} ({ch.age_bracket})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>To Receiving Facility:</span>
                <input
                  type="text"
                  placeholder="e.g. Safdarjung Hospital DEIC / Rampur CHC"
                  value={refFacility}
                  onChange={(e) => setRefFacility(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                  required
                />
              </label>

              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>Triage Tier:</span>
                <select
                  value={refTier}
                  onChange={(e) => setRefTier(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "#2a221b",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                >
                  <option value="Tier 3: Direct Referral">Tier 3: Direct Referral</option>
                  <option value="Tier 2: In-App Reflex Monitor">Tier 2: In-App Reflex Monitor</option>
                  <option value="Refer">Refer (Clinical Assessment)</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>Clinical Rationale / Reason:</span>
                <textarea
                  rows={2}
                  placeholder="e.g. Suspected gross motor milestone delay flagged during village screening."
                  value={refReason}
                  onChange={(e) => setRefReason(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </label>

              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>Domains of Concern (comma-separated):</span>
                <input
                  type="text"
                  placeholder="e.g. gross_motor, communication, cognitive"
                  value={refDomains}
                  onChange={(e) => setRefDomains(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
                <span>Safety Rule Trigger (optional):</span>
                <input
                  type="text"
                  placeholder="e.g. Loss of motor milestones (SD <= -2.0)"
                  value={refSafetyTrigger}
                  onChange={(e) => setRefSafetyTrigger(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowReferralModal(false)}
                  style={{ minHeight: "44px" }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" style={{ minHeight: "44px" }}>
                  Create Referral
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD CLINICAL OUTCOME */}
      {showOutcomeModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, rgba(255,248,232,0.98), rgba(255,241,212,0.92))",
              border: "1px solid rgba(33, 23, 9, 0.14)",
              borderRadius: "16px",
              maxWidth: "500px",
              width: "100%",
              padding: "1.75rem",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              boxSizing: "border-box",
            }}
          >
            <h2 className="h-sm" style={{ margin: "0 0 0.5rem" }}>Record Clinical Outcome</h2>
            <p style={{ fontSize: "0.85rem", opacity: 0.8, margin: "0 0 1rem" }}>
              Target: <strong>{selectedChildForOutcome?.pseudonymous_id ?? selectedReferral?.child_id}</strong>
            </p>

            {/* Quick Outcome Templates for low literacy */}
            <div style={{ marginBottom: "0.85rem" }}>
              <span style={{ fontSize: "0.78rem", color: "#6e5d47", display: "block", marginBottom: "0.3rem" }}>
                Quick Templates (tap to use):
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {[
                  "Doctor examined child at DEIC. Routine stimulation recommended.",
                  "Speech therapy initiated at CHC / District Hospital.",
                  "Early Interventionist home visit completed. Mother trained on motor play.",
                  "Child caught up on milestones. Normal progress observed.",
                  "Caregiver counselled; next home visit scheduled.",
                ].map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setOutcomeNotes(tpl)}
                    style={{
                      textAlign: "left",
                      padding: "0.35rem 0.6rem",
                      borderRadius: "6px",
                      background: "rgba(33, 23, 9, 0.04)",
                      border: "1px solid rgba(33, 23, 9, 0.12)",
                      color: "#211709",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveOutcome}>
              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>Outcome Notes & Clinical Observations:</span>
                <textarea
                  rows={3}
                  placeholder="Record observations, services received, or parental guidance given."
                  value={outcomeNotes}
                  onChange={(e) => setOutcomeNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginBottom: "0.85rem" }}>
                <label style={{ fontSize: "0.82rem" }}>
                  <span>Updated Triage Tier:</span>
                  <select
                    value={outcomeNewTier}
                    onChange={(e) => setOutcomeNewTier(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem",
                      borderRadius: "6px",
                      background: "#2a221b",
                      border: "1px solid rgba(33, 23, 9, 0.14)",
                      color: "#fff",
                      marginTop: "0.25rem",
                      boxSizing: "border-box",
                      minHeight: "44px",
                    }}
                  >
                    <option value="Tier 1: Typical">Tier 1: Typical</option>
                    <option value="Tier 2: In-App Reflex Monitor">Tier 2: Reflex Monitor</option>
                    <option value="Tier 3: Direct Referral">Tier 3: Direct Referral</option>
                  </select>
                </label>

                <label style={{ fontSize: "0.82rem" }}>
                  <span>Next Home Visit:</span>
                  <select
                    value={outcomeNextDays}
                    onChange={(e) => setOutcomeNextDays(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem",
                      borderRadius: "6px",
                      background: "#2a221b",
                      border: "1px solid rgba(33, 23, 9, 0.14)",
                      color: "#fff",
                      marginTop: "0.25rem",
                      boxSizing: "border-box",
                      minHeight: "44px",
                    }}
                  >
                    <option value="7">In 7 Days (Urgent)</option>
                    <option value="14">In 14 Days (Standard)</option>
                    <option value="30">In 30 Days (Monthly)</option>
                    <option value="60">In 60 Days</option>
                  </select>
                </label>
              </div>

              <label
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  marginBottom: "1.25rem",
                  fontSize: "0.85rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={closeOnOutcome}
                  onChange={(e) => setCloseOnOutcome(e.target.checked)}
                  style={{ width: "18px", height: "18px" }}
                />
                <span>Also mark referral as <code>closed</code> upon saving outcome</span>
              </label>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowOutcomeModal(false)}
                  style={{ minHeight: "44px" }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" style={{ minHeight: "44px" }}>
                  Save Clinical Outcome
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ONE-PAGE MINIMAL SUMMARY (STRICTLY 4 FIELDS - REQUIREMENT 6a) */}
      {showSummaryModal && summaryData && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, rgba(255,248,232,0.98), rgba(255,241,212,0.92))",
              border: "2px solid rgba(255,255,255,0.25)",
              borderRadius: "16px",
              maxWidth: "580px",
              width: "100%",
              padding: "1.75rem",
              boxShadow: "0 20px 40px rgba(0,0,0,0.7)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <p className="eyebrow" style={{ color: "#d97706", margin: 0 }}>
                  Clinical Intake Handoff
                </p>
                <h2 className="h-sm" style={{ margin: "0.2rem 0 0", fontSize: "1.25rem" }}>
                  One-Page Minimal Referral Summary
                </h2>
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "0.25rem 0.6rem",
                  borderRadius: "999px",
                  background: "rgba(74, 222, 128, 0.15)",
                  color: "#4ade80",
                  border: "1px solid rgba(74, 222, 128, 0.3)",
                }}
              >
                Minimum Data Needed
              </span>
            </div>

            <p style={{ fontSize: "0.82rem", opacity: 0.8, margin: "0 0 1.25rem", lineHeight: 1.5 }}>
              Strictly restricted to the 4 essential clinical triage fields. Zero identifiable names,
              contact numbers, or village identifiers transmitted.
            </p>

            {/* The 4 fields container */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.3)",
                borderRadius: "10px",
                padding: "1.25rem",
                border: "1px solid rgba(33, 23, 9, 0.12)",
                fontSize: "0.9rem",
                lineHeight: 1.8,
                marginBottom: "1.5rem",
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(33, 23, 9, 0.08)", paddingBottom: "0.4rem" }}>
                <span style={{ color: "#6e5d47" }}>1. Age Bracket:</span>
                <strong>{summaryData.age_bracket}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(33, 23, 9, 0.08)", padding: "0.4rem 0" }}>
                <span style={{ color: "#6e5d47" }}>2. Triage Tier:</span>
                <span style={{ color: "#b04f1f", fontWeight: 700 }}>{summaryData.tier}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(33, 23, 9, 0.08)", padding: "0.4rem 0" }}>
                <span style={{ color: "#6e5d47" }}>3. Domains of Concern:</span>
                <strong>
                  {summaryData.domains_of_concern && summaryData.domains_of_concern.length > 0
                    ? summaryData.domains_of_concern.join(", ")
                    : "None flagged"}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0" }}>
                <span style={{ color: "#6e5d47" }}>4. Safety Rule Trigger:</span>
                <span style={{ color: summaryData.safety_rule_trigger ? "#8a5f10" : "#9ca3af", fontWeight: 600 }}>
                  {summaryData.safety_rule_trigger || "None (Routine rule set)"}
                </span>
              </div>
            </div>

            {/* Output Formats: PDF or Shareable Text */}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {selectedReferral && (
                  <a
                    href={referralApi.getSummaryPdfUrl(selectedReferral.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--secondary"
                    style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem", minHeight: "44px", textDecoration: "none" }}
                  >
                    Download Printable PDF
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem", minHeight: "44px" }}
                  onClick={handleCopySummaryText}
                >
                  Copy Shareable Text
                </button>
              </div>

              <button
                type="button"
                className="btn btn--primary"
                style={{ fontSize: "0.85rem", padding: "0.45rem 1rem", minHeight: "44px" }}
                onClick={() => setShowSummaryModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 5: OFFLINE FIELD SCREENING MODAL */}
      {showScreeningModal && selectedChildForScreening && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, rgba(255,248,232,0.98), rgba(255,241,212,0.92))",
              border: "1px solid rgba(33, 23, 9, 0.14)",
              borderRadius: "16px",
              maxWidth: "520px",
              width: "100%",
              padding: "1.75rem",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              boxSizing: "border-box",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h2 className="h-sm" style={{ margin: 0 }}>Field Screening Assessment</h2>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.5rem",
                  borderRadius: "999px",
                  background: !isOnline ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)",
                  color: !isOnline ? "#b04f1f" : "#86efac",
                  border: `1px solid ${!isOnline ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)"}`,
                }}
              >
                {!isOnline ? "Offline Ready" : "Auto-Sync Enabled"}
              </span>
            </div>

            <p style={{ fontSize: "0.82rem", opacity: 0.8, margin: "0 0 1rem" }}>
              Child: <code>{selectedChildForScreening.pseudonymous_id}</code> · Age Bracket: <strong>{selectedChildForScreening.age_bracket}</strong>
            </p>

            <form onSubmit={handleSaveScreening}>
              {/* Triage Tier Choice */}
              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span style={{ fontWeight: 600 }}>Developmental Triage Assessment:</span>
                <select
                  data-testid="screening-tier-select"
                  value={screeningTier}
                  onChange={(e) => setScreeningTier(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "#2a221b",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                >
                  <option value="Tier 1: Typical">Tier 1: Typical (On Track)</option>
                  <option value="Tier 2: In-App Reflex Monitor">Tier 2: Watch Closely / Monitor</option>
                  <option value="Tier 3: Direct Referral">Tier 3: Priority Clinical Referral</option>
                </select>
              </label>

              {/* Domains Flagged */}
              <div style={{ marginBottom: "0.85rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>
                  Flagged Developmental Domains (tap to toggle):
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {[
                    { id: "gross_motor", label: "Gross Motor" },
                    { id: "fine_motor", label: "Fine Motor" },
                    { id: "communication", label: "Communication" },
                    { id: "problem_solving", label: "Problem Solving" },
                    { id: "personal_social", label: "Personal-Social" },
                  ].map((dom) => {
                    const isSelected = screeningDomains.includes(dom.id);
                    return (
                      <button
                        key={dom.id}
                        type="button"
                        onClick={() => {
                          setScreeningDomains((prev) =>
                            isSelected ? prev.filter((d) => d !== dom.id) : [...prev, dom.id]
                          );
                        }}
                        style={{
                          padding: "0.3rem 0.6rem",
                          borderRadius: "6px",
                          fontSize: "0.78rem",
                          fontWeight: isSelected ? 700 : 500,
                          background: isSelected ? "rgba(245, 158, 11, 0.3)" : "rgba(33, 23, 9, 0.04)",
                          color: isSelected ? "#8a5f10" : "#d1d5db",
                          border: `1px solid ${isSelected ? "#f59e0b" : "rgba(33, 23, 9, 0.14)"}`,
                          cursor: "pointer",
                          minHeight: "36px",
                        }}
                      >
                        {isSelected ? "✓ " : "+ "}
                        {dom.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Safety Rule Trigger */}
              <label style={{ display: "block", marginBottom: "0.85rem", fontSize: "0.85rem" }}>
                <span>Safety Rule Trigger (optional override):</span>
                <input
                  type="text"
                  placeholder="e.g. Loss of motor milestones (SD <= -2.0)"
                  value={screeningSafetyRule}
                  onChange={(e) => setScreeningSafetyRule(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                    minHeight: "44px",
                  }}
                />
              </label>

              {/* Field Observation Notes */}
              <label style={{ display: "block", marginBottom: "1.25rem", fontSize: "0.85rem" }}>
                <span>Field Observations / Assessment Summary:</span>
                <textarea
                  rows={2}
                  placeholder="e.g. Completed milestone observation at Anganwadi center. Mother reported delayed vocal responses."
                  value={screeningNotes}
                  onChange={(e) => setScreeningNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(33, 23, 9, 0.05)",
                    border: "1px solid rgba(33, 23, 9, 0.14)",
                    color: "#fff",
                    marginTop: "0.25rem",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <Link
                  to={`/screen?child_ref=${encodeURIComponent(selectedChildForScreening.pseudonymous_id)}&age=${parseAgeMonths(
                    selectedChildForScreening.age_bracket
                  )}`}
                  style={{ fontSize: "0.78rem", color: "#2f6d81", textDecoration: "underline" }}
                >
                  Or launch full adaptive test →
                </Link>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setShowScreeningModal(false);
                      setSelectedChildForScreening(null);
                    }}
                    style={{ minHeight: "44px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="save-offline-screening-btn"
                    className="btn btn--primary"
                    style={{ minHeight: "44px" }}
                  >
                    Save Screening
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: SYNCHRONIZATION CONFLICT LOG MODAL */}
      {showConflictsModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, rgba(255,248,232,0.98), rgba(255,241,212,0.92))",
              border: "1px solid rgba(33, 23, 9, 0.14)",
              borderRadius: "16px",
              maxWidth: "580px",
              width: "100%",
              padding: "1.75rem",
              boxShadow: "0 20px 40px rgba(0,0,0,0.7)",
              boxSizing: "border-box",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <p className="eyebrow" style={{ color: "#b04f1f", margin: 0 }}>
                  Audit & Data Integrity
                </p>
                <h2 className="h-sm" style={{ margin: "0.2rem 0 0", fontSize: "1.25rem" }}>
                  Synchronization Conflict Log ({conflicts.length})
                </h2>
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowConflictsModal(false)}
                style={{ fontSize: "1.25rem", padding: "0.2rem 0.5rem" }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "0.82rem", opacity: 0.8, margin: "0 0 1rem", lineHeight: 1.5 }}>
              The following operations encountered concurrency or validation conflicts during offline sync.
              Server safety floors and existing clinical states were preserved.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
              {conflicts.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    padding: "0.75rem",
                    fontSize: "0.8rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                    <span style={{ fontWeight: 700, color: "#b04f1f", textTransform: "uppercase" }}>
                      {c.operation} • {c.entity_type}
                    </span>
                    <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>
                      {new Date(c.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ margin: "0.2rem 0" }}>
                    <strong>Reason:</strong> {c.reason}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6e5d47" }}>
                    Entity ID: <code>{c.entity_id}</code> · Resolution: <code>{c.resolution}</code>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowConflictsModal(false)}
                style={{ minHeight: "44px" }}
              >
                Close Conflict Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
