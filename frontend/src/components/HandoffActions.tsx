import { useState } from "react";
import { MessageCircle, MessageSquare, Phone, Send } from "lucide-react";
import { referralApi } from "../api/client";
import type { ReferralSummary } from "../api/types";
import { referralSmsText, referralWhatsAppText, smsLink, telLink, waLink } from "../lib/handoff";
import { useApp } from "../store";
import { Btn } from "./ui";

const HELPLINE = "14416"; // Tele-MANAS, also listed in Find Help

/**
 * Share the referral handoff. The summary comes from the server (creates or
 * reuses the child's open referral), so WhatsApp / SMS / copy all carry the
 * same four consent-appropriate fields as the printed slip.
 */
export function HandoffActions({ childId }: { childId: string }) {
  const { showToast, go } = useApp();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const ensureSummary = async (): Promise<ReferralSummary | null> => {
    if (summary) return summary;
    setBusy(true);
    try {
      const res = await referralApi.oneTouchReferral(childId);
      setSummary(res.summary);
      return res.summary;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not prepare the handoff");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const share = async (kind: "wa" | "sms" | "copy") => {
    const s = await ensureSummary();
    if (!s) return;
    const text = kind === "sms" ? referralSmsText(s) : referralWhatsAppText(s);
    if (kind === "wa") {
      window.open(waLink(text), "_blank", "noopener");
      return;
    }
    if (kind === "sms") {
      window.location.href = smsLink(text);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Handoff copied");
    } catch {
      showToast("Could not copy the handoff");
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-line-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">Referral handoff</p>
        <span className="font-mono text-[9.5px] text-muted">creates / reuses the open referral</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Btn size="sm" variant="rust" onClick={() => void share("wa")} disabled={busy}>
          <MessageCircle className="size-3.5" /> WhatsApp
        </Btn>
        <Btn size="sm" variant="light" onClick={() => void share("sms")} disabled={busy}>
          <MessageSquare className="size-3.5" /> SMS
        </Btn>
        <Btn size="sm" variant="light" onClick={() => void share("copy")} disabled={busy}>
          <Send className="size-3.5" /> Copy
        </Btn>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
        <Phone className="mt-0.5 size-3.5 shrink-0" />
        <span>
          No smartphone?{" "}
          <a href={telLink(HELPLINE)} className="font-semibold text-ink underline underline-offset-2">
            Call Tele-MANAS {HELPLINE}
          </a>{" "}
          or{" "}
          <button type="button" onClick={() => go("help")} className="font-semibold text-ink underline underline-offset-2">
            find nearby support
          </button>
          . IVR is on the roadmap.
        </span>
      </p>
    </div>
  );
}
