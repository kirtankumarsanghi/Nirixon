interface Props {
  classification: string;
}

/**
 * Client-side .ics download — no backend call.
 * Defaulting to a 3-month interval.
 */
export function CalendarReminderButton({ classification }: Props) {
  function downloadIcs() {
    // Default interval — 3 months
    const months = 3;
    const start = new Date();
    start.setMonth(start.getMonth() + months);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    const stamp = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Nirixon//Screening Reminder//EN",
      "BEGIN:VEVENT",
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:Nirixon follow-up check-in (${classification})`,
      "DESCRIPTION:Reminder — confirm recheck interval with your clinician.",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nirixon-follow-up.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn btn--secondary" onClick={downloadIcs}>
      Add 3-month reminder to calendar
    </button>
  );
}
