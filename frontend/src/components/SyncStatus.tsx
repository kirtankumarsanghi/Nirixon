import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useApp } from "../store";
import { cn } from "../utils/cn";

/** Floating offline / queued-changes pill. Hidden when online with nothing queued. */
export function SyncStatus() {
  const { online, pendingSync, syncNow } = useApp();
  const [busy, setBusy] = useState(false);

  if (online && pendingSync === 0) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-3">
      <button
        type="button"
        onClick={() => void run()}
        aria-live="polite"
        className={cn(
          "pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] uppercase shadow-[0_18px_34px_-18px_rgba(31,20,9,0.9)] transition-colors",
          online ? "border border-line-2 bg-card text-ink hover:bg-card-2" : "bg-night text-paper/80",
        )}
      >
        {online ? (
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
        ) : (
          <WifiOff className="size-3.5 text-peach" />
        )}
        {busy ? "Syncing…" : online ? `${pendingSync} queued · sync now` : `Offline · ${pendingSync} queued`}
      </button>
    </div>
  );
}
