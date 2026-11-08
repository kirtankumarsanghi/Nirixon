import { describe, expect, it } from "vitest";
import type { ChildRecord } from "../api/types";
import { childRecordToChild } from "../lib/apiAdapters";

const base: ChildRecord = {
  id: "child-1",
  pseudonymous_id: "child-ward12-001",
  age_bracket: "18-24m",
  village_ward: "Ward 12 - Sector B",
  consent_given: true,
  consent_recorded_at: "2026-01-01T00:00:00Z",
  opt_in: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("childRecordToChild handoff state", () => {
  it("maps the persisted handoff_state onto the drawer chip", () => {
    expect(childRecordToChild({ ...base, handoff_state: "queued" }).handoff).toBe("queued");
    expect(childRecordToChild({ ...base, handoff_state: "done" }).handoff).toBe("done");
  });

  it("defaults to none when the backend omits handoff_state", () => {
    expect(childRecordToChild(base).handoff).toBe("none");
  });
});
