import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Info, Loader2, X } from "lucide-react";
import { getApiBase, getSavedApiBase, setApiBase, setAuthToken } from "../api/client";
import { Btn } from "./ui";
import { cn } from "../utils/cn";

function normalize(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Device-local API address. Kept outside the build so a laptop whose LAN IP
 * changes (or a different Wi-Fi network) does not require shipping a new APK.
 */
export function ServerSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(getSavedApiBase() || getApiBase());
    setError(null);
    setTest(null);
    setTesting(false);
    setApplying(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const apply = (raw: string | null) => {
    const next = normalize(raw ?? "");
    if (next && !/^https?:\/\//i.test(next)) {
      setError("Use a full address starting with http:// or https://");
      return;
    }
    setApiBase(next || null);
    // A token issued by the previous server is not valid on the new one.
    setAuthToken(null);
    setApplying(true);
    window.setTimeout(() => {
      try {
        window.location.reload();
      } catch {
        onClose();
      }
    }, 300);
  };

  const runTest = async () => {
    const base = normalize(value);
    if (!base) {
      setTest({ ok: true, message: "Using the built-in default (same origin)." });
      return;
    }
    if (!/^https?:\/\//i.test(base)) {
      setTest({ ok: false, message: "Use a full address starting with http:// or https://" });
      return;
    }
    setTesting(true);
    setTest(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${base}/health`, { signal: controller.signal });
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      if (res.ok && body?.status === "ok") {
        setTest({ ok: true, message: "Connected — the backend is healthy." });
      } else {
        setTest({ ok: false, message: `The server answered ${res.status}. Check the address.` });
      }
    } catch {
      setTest({ ok: false, message: "Could not reach that address from this device." });
    } finally {
      window.clearTimeout(timer);
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-night/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Server address"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(value);
        }}
        className="w-full max-w-[500px] rounded-[30px] border border-line-2 bg-card p-6 text-ink shadow-[0_40px_80px_-30px_rgba(31,20,9,.7)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10.5px] font-semibold tracking-[0.2em] text-rust uppercase">Connection</p>
            <h2 className="mt-2 font-display text-[32px] leading-none uppercase">Server address</h2>
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
          The address of the computer or server running the Nirixon API. This phone must be on a network that can reach it.
          Leave empty to use the default built into the app.
        </p>

        <label className="mt-5 block">
          <span className="mb-2 block font-mono text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">http:// or https://</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
              setTest(null);
            }}
            placeholder="http://192.168.1.20:8000"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-2xl border border-line-2 bg-card-2 px-4 py-3.5 text-[15px] font-semibold focus:border-sea focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-brick-bg px-3 py-2 text-[12.5px] font-semibold text-brick">
            {error}
          </p>
        )}
        {test && (
          <p
            role="status"
            className={cn(
              "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold",
              test.ok ? "bg-moss-bg text-moss" : "bg-brick-bg text-brick"
            )}
          >
            {test.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
            {test.message}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Btn type="submit" disabled={applying}>
            {applying ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Reloading…
              </>
            ) : (
              "Save & reload"
            )}
          </Btn>
          <Btn type="button" variant="light" onClick={() => void runTest()} disabled={testing}>
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Testing…
              </>
            ) : (
              "Test connection"
            )}
          </Btn>
          <Btn type="button" variant="soft" onClick={() => apply(null)} disabled={applying}>
            Use default
          </Btn>
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          If the app cannot connect after switching Wi-Fi, set this to the computer's new address and test it here first.
        </p>
      </form>
    </div>
  );
}

/** Button + modal pair so any screen can expose the setting. */
export function ServerSettingsButton({ className, children = "Server settings" }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Info className="size-4" />
        {children}
      </button>
      <ServerSettings open={open} onClose={() => setOpen(false)} />
    </>
  );
}
