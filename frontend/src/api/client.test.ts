import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, setAuthToken } from "./client";

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
