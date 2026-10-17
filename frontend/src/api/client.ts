import type {
  AnswerRequest,
  LoginRequest,
  LoginResponse,
  RecallRequest,
  ResultPayload,
  ScreenActionResponse,
  SessionStateResponse,
  StartScreenRequest,
  IntakeRequest,
  IntakeResponse,
  TeacherAnswerRequest,
  TeacherAnswerResponse,
  TeacherItemsResponse,
  WorkerContactRequest,
  WorkerContactResponse,
  WorkerSuggestion,
  SandboxSimulateRequest,
  HelpNearbyResponse,
  LiveTaskDefinition,
  TouchConfigResponse,
  TouchTelemetrySubmission,
  TouchTelemetryResponse,
  WorkerRecord,
  ChildRecord,
  ChildRecordCreateRequest,
  ReferralRecord,
  ReferralCreateRequest,
  ReferralUpdateRequest,
  ReferralOutcomeRequest,
  ReferralSummary,
  TierCounts,
  SeedChildrenResponse,
  ChildContactResponse,
  OneTouchReferralResponse,
  RecordChildOutcomeRequest,
  CHWSyncBatchRequest,
  CHWSyncBatchResponse,
  ConflictLogRecord,
  CreateJointInviteRequest,
  JointInviteResponse,
  JointInvitesListResponse,
  JointInvitePublicDetail,
  SubmitJointResponseRequest,
  SubmitJointResponseResponse,
  JointMergeResponse,
  AudioManifestResponse,
  AudioItemQueryResponse,
  AudioCoverageReport,
} from "./types";

const rawBase = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_BASE = typeof rawBase === "string" ? rawBase.replace("://localhost:", "://127.0.0.1:") : "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

let authToken: string | null = (() => {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("nirixon_token") : null;
  } catch {
    return null;
  }
})();

export function setAuthToken(token: string | null): void {
  authToken = token;
  try {
    if (typeof localStorage !== "undefined") {
      if (token) localStorage.setItem("nirixon_token", token);
      else localStorage.removeItem("nirixon_token");
    }
  } catch {}
}

export function getAuthToken(): string | null {
  return authToken;
}

/** Register once at app root — redirects to /login on any 401. */
export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

async function parseDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d) => JSON.stringify(d)).join("; ");
    }
    return res.statusText || "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { retry?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const maxAttempts = options.retry ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

      if (res.status === 401) {
        if (path === "/api/auth/login") {
          const detail = await parseDetail(res);
          throw new ApiError(401, detail || "Invalid email or password");
        }
        unauthorizedHandler?.();
        throw new ApiError(401, "Unauthorized");
      }

      if (!res.ok) {
        const detail = await parseDetail(res);
        const err = new ApiError(res.status, detail);
        // Retry only on network-adjacent server failures (5xx), not 4xx.
        if (options.retry && res.status >= 500 && attempt < maxAttempts - 1) {
          await sleep(backoffMs(attempt));
          lastError = err;
          continue;
        }
        throw err;
      }

      if (res.status === 204) {
        return undefined as T;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error && err.message === "Failed to fetch");
      if (options.retry && isNetwork && attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

function backoffMs(attempt: number): number {
  // Keep tests fast; production still uses exponential backoff.
  if (import.meta.env.MODE === "test") return 0;
  return 400 * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const api = {
  login(body: LoginRequest): Promise<LoginResponse> {
    return request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  startScreen(body: StartScreenRequest): Promise<ScreenActionResponse> {
    return request<ScreenActionResponse>("/api/screen/start", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** Only endpoint with automatic retry (network / 5xx, up to 2 retries). */
  submitAnswer(
    sessionId: string,
    body: AnswerRequest,
  ): Promise<ScreenActionResponse> {
    return request<ScreenActionResponse>(
      `/api/screen/${sessionId}/answer`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      { retry: true },
    );
  },

  getSession(sessionId: string): Promise<SessionStateResponse> {
    return request<SessionStateResponse>(`/api/screen/${sessionId}`);
  },

  getResult(sessionId: string): Promise<ResultPayload> {
    return request<ResultPayload>(`/api/screen/${sessionId}/result`);
  },

  /** Module B: submit free-text observation for NLP domain routing. */
  submitIntake(sessionId: string, body: IntakeRequest): Promise<IntakeResponse> {
    return request<IntakeResponse>(`/api/screen/${sessionId}/intake`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** Module B: submit recall-help domain selection. */
  submitRecall(
    sessionId: string,
    body: RecallRequest,
  ): Promise<ScreenActionResponse> {
    const payload = {
      ...body,
      domains: body.domains ?? body.selected_domains ?? [],
    };
    return request<ScreenActionResponse>(
      `/api/screen/${sessionId}/recall`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  /** Module B: items for the teacher form (matched to parent answers). */
  getTeacherItems(sessionId: string): Promise<TeacherItemsResponse> {
    return request<TeacherItemsResponse>(
      `/api/screen/${sessionId}/teacher-items`,
    );
  },

  /** Module B: submit teacher answers for cross-context consistency scoring. */
  submitTeacher(
    sessionId: string,
    body: TeacherAnswerRequest,
  ): Promise<TeacherAnswerResponse> {
    return request<TeacherAnswerResponse>(`/api/screen/${sessionId}/teacher`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** Get suggested community healthcare workers (ASHA, Anganwadi, DEIC, RBSK). */
  getWorkers(sessionId: string): Promise<WorkerSuggestion[]> {
    return request<WorkerSuggestion[]>(`/api/screen/${sessionId}/workers`);
  },

  /** Log request to connect with a healthcare or community worker. */
  contactWorker(
    sessionId: string,
    body: WorkerContactRequest,
  ): Promise<WorkerContactResponse> {
    return request<WorkerContactResponse>(
      `/api/screen/${sessionId}/contact_worker`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  /** Module A: Get normative provisional reference ranges for touch motor tasks. */
  getTouchConfig(): Promise<TouchConfigResponse> {
    return request<TouchConfigResponse>("/api/screen/touch-config");
  },

  /** Module A: Get live direct observation task definitions for an age bracket. */
  getLiveTasks(bracket: string): Promise<LiveTaskDefinition[]> {
    return request<LiveTaskDefinition[]>(`/api/screen/live-tasks/${bracket}`);
  },

  /** Module A: Get live tasks for an active screening session's child age bracket. */
  getSessionLiveTasks(sessionId: string): Promise<LiveTaskDefinition[]> {
    return request<LiveTaskDefinition[]>(`/api/screen/${sessionId}/live-tasks`);
  },

  /** Module A (24m+): Submit exploratory touch motor telemetry (tap, trace, drag). */
  submitTouchTelemetry(
    sessionId: string,
    body: TouchTelemetrySubmission,
  ): Promise<TouchTelemetryResponse> {
    return request<TouchTelemetryResponse>(
      `/api/screen/${sessionId}/touch-telemetry`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
};

export const screenApi = api;

export const sandboxApi = {
  simulate(
    sessionId: string,
    body: SandboxSimulateRequest,
  ): Promise<ResultPayload> {
    return request<ResultPayload>(`/api/sandbox/${sessionId}/simulate`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};

export const helpApi = {
  getNearby(params: {
    pin?: string | null;
    lat?: number | null;
    lng?: number | null;
    age?: number | null;
    age_years?: number | null;
    limit?: number;
  }): Promise<HelpNearbyResponse> {
    const query = new URLSearchParams();
    if (params.pin) query.set("pin", params.pin);
    if (params.lat != null) query.set("lat", String(params.lat));
    if (params.lng != null) query.set("lng", String(params.lng));
    if (params.age != null) query.set("age", String(params.age));
    if (params.age_years != null) query.set("age_years", String(params.age_years));
    if (params.limit != null) query.set("limit", String(params.limit));
    return request<HelpNearbyResponse>(`/api/help/nearby?${query.toString()}`);
  },
};

export const referralApi = {
  getMe(): Promise<WorkerRecord> {
    return request<WorkerRecord>("/api/chw/workers/me");
  },
  getWorkers(): Promise<WorkerRecord[]> {
    return request<WorkerRecord[]>("/api/chw/workers");
  },
  getChildren(filters?: {
    tier?: string;
    village_ward?: string;
    age_group?: string;
    overdue_only?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ChildRecord[]> {
    const q = new URLSearchParams();
    if (filters?.tier) q.set("tier", filters.tier);
    if (filters?.village_ward) q.set("village_ward", filters.village_ward);
    if (filters?.age_group) q.set("age_group", filters.age_group);
    if (filters?.overdue_only) q.set("overdue_only", "true");
    if (filters?.search) q.set("search", filters.search);
    if (filters?.limit != null) q.set("limit", String(filters.limit));
    if (filters?.offset != null) q.set("offset", String(filters.offset));
    const qs = q.toString();
    return request<ChildRecord[]>(`/api/chw/children${qs ? `?${qs}` : ""}`);
  },
  getTierCounts(village_ward?: string): Promise<TierCounts> {
    const qs = village_ward ? `?village_ward=${encodeURIComponent(village_ward)}` : "";
    return request<TierCounts>(`/api/chw/tier-counts${qs}`);
  },
  seedChildren(count = 200, area?: string, cleanFirst = false): Promise<SeedChildrenResponse> {
    return request<SeedChildrenResponse>("/api/chw/seed-children", {
      method: "POST",
      body: JSON.stringify({ count, area, clean_first: cleanFirst }),
    });
  },
  markContacted(childId: string): Promise<ChildContactResponse> {
    return request<ChildContactResponse>(`/api/chw/children/${encodeURIComponent(childId)}/contact`, {
      method: "POST",
    });
  },
  oneTouchReferral(childId: string): Promise<OneTouchReferralResponse> {
    return request<OneTouchReferralResponse>(`/api/chw/children/${encodeURIComponent(childId)}/one-touch-referral`, {
      method: "POST",
    });
  },
  recordChildOutcome(childId: string, data: RecordChildOutcomeRequest): Promise<ReferralRecord> {
    return request<ReferralRecord>(`/api/chw/children/${encodeURIComponent(childId)}/outcome`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getChild(id: string): Promise<ChildRecord> {
    return request<ChildRecord>(`/api/chw/children/${encodeURIComponent(id)}`);
  },
  createChild(data: ChildRecordCreateRequest): Promise<ChildRecord> {
    return request<ChildRecord>("/api/chw/children", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  deleteChild(id: string): Promise<{ deleted: boolean; message: string }> {
    return request<{ deleted: boolean; message: string }>(`/api/chw/children/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  getReferrals(): Promise<ReferralRecord[]> {
    return request<ReferralRecord[]>("/api/referrals");
  },
  getReferral(id: string): Promise<ReferralRecord> {
    return request<ReferralRecord>(`/api/referrals/${encodeURIComponent(id)}`);
  },
  createReferral(data: ReferralCreateRequest): Promise<ReferralRecord> {
    return request<ReferralRecord>("/api/referrals", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateReferral(id: string, data: ReferralUpdateRequest): Promise<ReferralRecord> {
    return request<ReferralRecord>(`/api/referrals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  recordOutcome(id: string, data: ReferralOutcomeRequest): Promise<ReferralRecord> {
    return request<ReferralRecord>(`/api/referrals/${encodeURIComponent(id)}/outcome`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getSummary(id: string): Promise<ReferralSummary> {
    return request<ReferralSummary>(`/api/referrals/${encodeURIComponent(id)}/summary`);
  },
  async getSummaryText(id: string): Promise<string> {
    const token = getAuthToken();
    const headers: Record<string, string> = { Accept: "text/plain" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/referrals/${encodeURIComponent(id)}/summary?format=text`, {
      headers,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.text();
  },
  getSummaryPdfUrl(id: string): string {
    return `${API_BASE}/api/referrals/${encodeURIComponent(id)}/summary/pdf`;
  },
  deleteReferral(id: string): Promise<{ deleted: boolean; message: string }> {
    return request<{ deleted: boolean; message: string }>(`/api/referrals/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  syncBatch(data: CHWSyncBatchRequest): Promise<CHWSyncBatchResponse> {
    return request<CHWSyncBatchResponse>("/api/chw/sync", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getConflicts(): Promise<ConflictLogRecord[]> {
    return request<ConflictLogRecord[]>("/api/chw/conflicts");
  },
};

export const shareApi = {
  /** Generate an expiring, single-use invite link for a secondary caregiver (max 3). */
  createInvite(
    sessionId: string,
    body: CreateJointInviteRequest,
  ): Promise<JointInviteResponse> {
    return request<JointInviteResponse>(`/api/share/session/${sessionId}/invite`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** List active and completed invites for a session. */
  listInvites(sessionId: string): Promise<JointInvitesListResponse> {
    return request<JointInvitesListResponse>(`/api/share/session/${sessionId}/invites`);
  },

  /** Public endpoint: Get only the question items to answer (zero child data). */
  getInviteQuestions(token: string): Promise<JointInvitePublicDetail> {
    return request<JointInvitePublicDetail>(`/api/share/invite/${token}`);
  },

  /** Public endpoint: Submit independent responses with role label only (no account). */
  submitResponse(
    token: string,
    body: SubmitJointResponseRequest,
  ): Promise<SubmitJointResponseResponse> {
    return request<SubmitJointResponseResponse>(`/api/share/invite/${token}/respond`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** Retrieve existing joint concordance calculation. */
  getConcordance(sessionId: string): Promise<JointMergeResponse> {
    return request<JointMergeResponse>(`/api/share/session/${sessionId}/concordance`);
  },

  /** Compute joint concordance and apply combination rule. */
  merge(
    sessionId: string,
    body?: { role_label?: string; answers?: Record<string, number> },
  ): Promise<JointMergeResponse> {
    return request<JointMergeResponse>(`/api/share/session/${sessionId}/merge`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /** Permanently delete screening session and all cascading respondent answers. */
  deleteSession(sessionId: string): Promise<{ status: string; session_id: string; message: string }> {
    return request<{ status: string; session_id: string; message: string }>(
      `/api/share/session/${sessionId}`,
      { method: "DELETE" },
    );
  },

  /** Audio Narration APIs */
  getAudioManifest(includeUnreviewed = false): Promise<AudioManifestResponse> {
    const query = includeUnreviewed ? "?include_unreviewed=true" : "";
    return request<AudioManifestResponse>(`/api/audio/manifest${query}`);
  },

  getAudioItem(itemId: string, language = "en"): Promise<AudioItemQueryResponse> {
    return request<AudioItemQueryResponse>(
      `/api/audio/item/${encodeURIComponent(itemId)}?language=${encodeURIComponent(language)}`,
    );
  },

  getAudioCoverageReport(): Promise<AudioCoverageReport> {
    return request<AudioCoverageReport>("/api/audio/report");
  },
};

export interface GrowthVisit {
  id: string;
  child_id: string;
  age_bracket: string;
  birth_year_month: string | null;
  chronological_age_months: number;
  developmental_age_months: number;
  visit_date: string;
  domain_scores: Record<string, number>;
  tier: string;
  created_at: string;
}

export interface GrowthAnalysis {
  child_id: string;
  total_visits: number;
  is_plateau_detected: boolean;
  plateau_summary: string;
  sync_enabled: boolean;
  trajectory: { chronological_age: number; developmental_age: number; visit_date: string; tier: string }[];
  intervals: {
    visit_index: number;
    prev_chronological_age: number;
    curr_chronological_age: number;
    chronological_gain: number;
    developmental_gain: number;
    gain_ratio: number | null;
    is_plateau: boolean;
    message: string;
  }[];
}

export const growthApi = {
  getStatus(): Promise<{ sync_enabled: boolean; privacy_model: string }> {
    return request<{ sync_enabled: boolean; privacy_model: string }>("/api/growth/status");
  },
  getVisits(childId: string): Promise<GrowthVisit[]> {
    return request<GrowthVisit[]>(`/api/growth/visits/${encodeURIComponent(childId)}`);
  },
  getAnalysis(childId: string): Promise<GrowthAnalysis> {
    return request<GrowthAnalysis>(`/api/growth/analysis/${encodeURIComponent(childId)}`);
  },
};

export interface EvidenceClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface EvidenceResponse {
  generated_at: string;
  disclaimer: string;
  module_a: {
    model_name: string;
    n_test: number;
    confusion_matrix: number[][];
    confusion_matrix_labels: string[];
    macro_f1: number;
    macro_auroc: number;
    macro_auprc: number;
    accuracy: number;
    refer_recall: number;
    refer_precision: number;
    refer_specificity: number;
    monitor_recall: number;
    typical_recall: number;
    class_metrics: Record<string, EvidenceClassMetrics>;
    latency_p50_ms: number;
    latency_p95_ms: number;
    latency_p99_ms: number;
  };
  module_b: {
    n_test: number;
    safety_recall: number;
    safety_precision: number;
    n_safety: number;
    any_true_domain_hit_rate: number;
    domain_micro_precision: number;
    domain_micro_recall: number;
    domain_micro_f1: number;
    ml_only_safety_recall: number;
    handwritten_notes: number;
    handwritten_any_domain_hit_rate: number | null;
    handwritten_micro_f1: number | null;
  };
  dataset_note: string;
}

export const evidenceApi = {
  get(): Promise<EvidenceResponse> {
    return request<EvidenceResponse>("/api/evidence");
  },
};


