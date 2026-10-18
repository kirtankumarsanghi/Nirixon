import { describe, expect, it } from "vitest";
import { remindersIcs } from "../lib/ics";

const now = new Date("2026-10-18T10:00:00Z");

describe("ics reminders", () => {
  it("wraps events in a valid all-day VCALENDAR", () => {
    const ics = remindersIcs([{ uid: "c1-followup", title: "Nirixon follow-up", date: new Date(2026, 10, 3) }], now);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:c1-followup");
    expect(ics).toContain("DTSTAMP:20261018T100000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261103");
    expect(ics).toContain("DTEND;VALUE=DATE:20261104");
  });

  it("escapes separators in text fields", () => {
    const ics = remindersIcs([{ uid: "u", title: "A; B, C\nD", date: new Date(2026, 0, 2) }], now);
    expect(ics).toContain("SUMMARY:A\\; B\\, C\\nD");
  });

  it("handles an empty list", () => {
    const ics = remindersIcs([], now);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
