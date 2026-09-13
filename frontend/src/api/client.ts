import type {
  AnswerRequest,
  LoginRequest,
  LoginResponse,
  ScreenActionResponse,
  SessionStateResponse,
  StartScreenRequest,
  ResultPayload,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
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
};
