export interface Reminder {
  uid: string;
  title: string;
  date: Date;
  description?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** All-day ICS date (YYYYMMDD). */
function icsDate(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** A minimal RFC-5545 VCALENDAR with one all-day event per reminder. */
export function remindersIcs(reminders: Reminder[], now = new Date()): string {
  const stamp = icsStamp(now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nirixon//Follow-ups//EN", "CALSCALE:GREGORIAN"];
  for (const r of reminders) {
    const next = new Date(r.date);
    next.setDate(next.getDate() + 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(r.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(r.date)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${escapeIcs(r.title)}`,
      ...(r.description ? [`DESCRIPTION:${escapeIcs(r.description)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Trigger a .ics download (the user's calendar app imports it). */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
