import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setAuthToken } from "./client";

/** What Vite's dev proxy returns when it cannot reach the backend. */
function proxyUnavailable(): Response {
  return new Response("", {
    status: 500,
    statusText: "Internal Server Error",
    headers: { "Content-Type": "text/plain" },
  });
}

describe("api.submitAnswer retry", () => {
  beforeEach(() => {
    setAuthToken("test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    setAuthToken(null);
    vi.unstubAllGlobals();
  });

  it("retries on 5xx then succeeds", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "boom" }), { status: 500 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "question",
            session_id: "s1",
            status: "in_progress",
            question: {
              item_id: "GM01",
              question_text: "Q",
              domain: "gross_motor",
              question_number: 1,
              question_cap: 10,
              response_type: "frequency",
            },
            result: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const body = await api.submitAnswer("s1", { item_id: "GM01", answer: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.type).toBe("question");
  });

  it("does not retry on 4xx", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "rate limit exceeded" }), {
        status: 429,
      }),
    );

    await expect(
      api.submitAnswer("s1", { item_id: "GM01", answer: 1 }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("api.login resilience", () => {
  beforeEach(() => {
    setAuthToken(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries when the dev proxy answers a plain-text 500", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(proxyUnavailable())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "token", token_type: "bearer", role: "parent" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const res = await api.login({ email: "parent@example.com", password: "changeme" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.access_token).toBe("token");
  });

  it("reports an actionable message when the API stays unreachable", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => proxyUnavailable());

    const err = await api
      .login({ email: "parent@example.com", password: "changeme" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toMatch(/unavailable/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
