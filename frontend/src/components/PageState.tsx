import { Loader2, RefreshCw, SearchX, TriangleAlert } from "lucide-react";

/**
 * Loading / error / empty placeholder for data-driven views. Built from the
 * design's tokens so it reads as part of the same UI.
 */
export function PageState({
  kind,
  message,
  onRetry,
}: {
  kind: "loading" | "error" | "empty";
  message?: string;
  onRetry?: () => void;
}) {
  const icon =
    kind === "loading" ? (
      <Loader2 className="size-6 animate-spin text-ink-2" />
    ) : kind === "error" ? (
      <TriangleAlert className="size-6 text-brick" />
    ) : (
      <SearchX className="size-6 text-ink-2" />
    );

  const title =
    kind === "loading" ? "Loading" : kind === "error" ? "Something went wrong" : "Nothing here yet";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="grid size-14 place-items-center rounded-full border border-line-2 bg-card">{icon}</div>
      <h2 className="mt-6 font-display text-[clamp(28px,4vw,46px)] leading-[0.95] text-ink uppercase">{title}</h2>
      {message && <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">{message}</p>}
      {kind === "error" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[14px] font-semibold text-paper transition-transform hover:-translate-y-0.5"
        >
          <RefreshCw className="size-4" /> Try again
        </button>
      )}
    </div>
  );
}
