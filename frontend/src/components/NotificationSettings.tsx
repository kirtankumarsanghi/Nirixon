import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Check,
  Loader2,
  MessageCircle,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { notificationApi } from "../api/client";
import type { NotificationChannels, NotificationPreference } from "../api/types";
import {
  isPushSupported,
  subscribeToPush,
  toSubscriptionPayload,
  unsubscribeFromPush,
} from "../lib/push";
import { useApp } from "../store";
import { Btn } from "./ui";
import { cn } from "../utils/cn";

const DEFAULT_CHANNELS: NotificationChannels = {
  push: false,
  whatsapp: false,
  sms: false,
  ivr: false,
};

function Toggle({
  icon: Icon,
  label,
  description,
  active,
  onClick,
}: {
  icon: typeof Bell;
  label: string;
  description: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-line-2 bg-card-2 hover:border-ink/50",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border",
          active ? "border-peach bg-peach text-night" : "border-line-2 text-rust",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold">{label}</span>
        <span className={cn("mt-0.5 block text-[11.5px] leading-relaxed", active ? "text-paper/65" : "text-muted")}>
          {description}
        </span>
      </span>
      <span
        className={cn(
          "mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2",
          active ? "border-peach bg-peach text-night" : "border-ink/25",
        )}
      >
        {active && <Check className="size-3" />}
      </span>
    </button>
  );
}

export function NotificationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vapid, setVapid] = useState<{ public_key: string; enabled: boolean }>({ public_key: "", enabled: false });
  const [channels, setChannels] = useState<NotificationChannels>(DEFAULT_CHANNELS);
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [leadDays, setLeadDays] = useState(3);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [consent, setConsent] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void Promise.all([notificationApi.getVapidKey(), notificationApi.getPreferences()])
      .then(([key, pref]) => {
        setVapid(key);
        applyPreference(pref);
      })
      .catch(() => setError("Could not load notification settings."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function applyPreference(pref: NotificationPreference) {
    setChannels({ ...DEFAULT_CHANNELS, ...pref.channels });
    setPhone(pref.phone ?? "");
    setWhatsapp(pref.whatsapp_number ?? "");
    setLeadDays(pref.reminder_lead_days ?? 3);
    setQuietStart(pref.quiet_start ?? "");
    setQuietEnd(pref.quiet_end ?? "");
    setConsent(Boolean(pref.consent_recorded_at));
    setEnabled(pref.enabled);
  }

  if (!open) return null;

  const toggle = (key: keyof NotificationChannels) =>
    setChannels((current) => ({ ...current, [key]: !current[key] }));

  const enablePush = async () => {
    if (!isPushSupported()) {
      setError("This browser does not support push notifications.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const subscription = await subscribeToPush(vapid.public_key);
      if (!subscription) {
        setError("Push permission was not granted, or the service worker could not start.");
        return;
      }
      const payload = toSubscriptionPayload(subscription);
      if (!payload) {
        setError("The push subscription was missing its keys.");
        return;
      }
      await notificationApi.subscribe(payload);
      setChannels((current) => ({ ...current, push: true }));
      showToast("Push notifications enabled on this device");
    } catch {
      setError("Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await notificationApi.unsubscribe(endpoint);
      setChannels((current) => ({ ...current, push: false }));
      showToast("Push notifications disabled");
    } catch {
      setError("Could not disable push notifications.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const pref = await notificationApi.updatePreferences({
        channels,
        phone: phone.trim() || null,
        whatsapp_number: whatsapp.trim() || null,
        reminder_lead_days: leadDays,
        quiet_start: quietStart || null,
        quiet_end: quietEnd || null,
        enabled,
        consent_given: consent,
      });
      applyPreference(pref);
      showToast("Notification preferences saved");
      onClose();
    } catch {
      setError("Could not save preferences. Check the phone number and consent.");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError(null);
    try {
      const channel = channels.push ? "push" : channels.whatsapp ? "whatsapp" : channels.sms ? "sms" : "ivr";
      const result = await notificationApi.sendTest(channel);
      if (result.delivered > 0) showToast("Test notification queued");
      else setError("The test was queued but not delivered. Check the channel setup.");
    } catch {
      setError("Could not queue a test notification.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-night/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Notification settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[560px] rounded-[30px] border border-line-2 bg-card p-6 text-ink shadow-[0_40px_80px_-30px_rgba(31,20,9,.7)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-rust uppercase">Follow-ups</p>
            <h2 className="mt-2 font-display text-[32px] leading-none uppercase">Reminders</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line-2 text-muted transition-colors hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
          Choose how Nirixon reminds you about re-screening, referral updates and home activities. Reminders only start after you give consent.
        </p>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-[13px] text-muted">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Toggle
                icon={Bell}
                label="Push"
                description={vapid.enabled ? "Instant alerts on this device." : "The server has no VAPID key configured."}
                active={channels.push}
                onClick={() => void (channels.push ? disablePush() : enablePush())}
              />
              <Toggle
                icon={MessageCircle}
                label="WhatsApp"
                description="Reminders and activity tips."
                active={channels.whatsapp}
                onClick={() => toggle("whatsapp")}
              />
              <Toggle
                icon={Smartphone}
                label="SMS"
                description="Works on feature phones."
                active={channels.sms}
                onClick={() => toggle("sms")}
              />
              <Toggle
                icon={PhoneCall}
                label="Voice call"
                description="Automated IVR reminder."
                active={channels.ivr}
                onClick={() => toggle("ivr")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">Phone</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98000 00000"
                  inputMode="tel"
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-4 py-3 text-[14px] font-semibold focus:border-sea focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">WhatsApp</span>
                <input
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  placeholder="+91 98000 00000"
                  inputMode="tel"
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-4 py-3 text-[14px] font-semibold focus:border-sea focus:outline-none"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">Lead days</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={leadDays}
                  onChange={(event) => setLeadDays(Number(event.target.value))}
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-4 py-3 text-[14px] font-semibold focus:border-sea focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">Quiet from</span>
                <input
                  type="time"
                  value={quietStart}
                  onChange={(event) => setQuietStart(event.target.value)}
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-4 py-3 text-[14px] font-semibold focus:border-sea focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">Quiet to</span>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(event) => setQuietEnd(event.target.value)}
                  className="w-full rounded-2xl border border-line-2 bg-card-2 px-4 py-3 text-[14px] font-semibold focus:border-sea focus:outline-none"
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-line-2 bg-card-2 p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-rust)]"
              />
              <span className="text-[12px] leading-relaxed text-ink-2">
                <b className="text-ink">I agree to receive reminders.</b> Nirixon will send only pseudonymous follow-up messages, respects quiet hours, and stops immediately when I reply STOP.
              </span>
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-line-2 bg-card-2 p-4">
              <span className="text-[13px] font-bold">Reminders active</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Reminders active"
                onClick={() => setEnabled((value) => !value)}
                className={cn("relative h-7 w-[50px] shrink-0 rounded-full transition-colors", enabled ? "bg-moss" : "bg-sand")}
              >
                <span className={cn("absolute top-1 size-5 rounded-full shadow transition-all", enabled ? "left-[26px] bg-white" : "left-1 bg-ink")} />
              </button>
            </label>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-brick-bg px-3 py-2 text-[12.5px] font-semibold text-brick">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Btn type="button" onClick={() => void save()} disabled={loading || saving || busy}>
            {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save preferences"}
          </Btn>
          <Btn type="button" variant="light" onClick={() => void sendTest()} disabled={loading || busy}>
            Send test
          </Btn>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <ShieldCheck className="size-3.5" /> No child names or addresses are sent.
          </span>
        </div>
      </div>
    </div>
  );
}

/** Button + modal pair for the workspace menu. */
export function NotificationSettingsButton({
  className,
  children = "Notification settings",
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Bell className="size-4" />
        {children}
      </button>
      <NotificationSettings open={open} onClose={() => setOpen(false)} />
    </>
  );
}
