import { Component, type ReactNode } from "react";
import { LogoLockup } from "../landing/components/system";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
  error: Error | null;
}

/**
 * Keeps a runtime error from blanking the whole app: the workspace shows a
 * branded recovery card instead, with a way back into the demo.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, error };
  }

  componentDidCatch(error: Error) {
    // Surface the failure in the console for debugging; no telemetry is wired up.
    console.error("Nirixon crashed:", error);
  }

  private reload = () => {
    this.setState({ failed: false, error: null });
    window.location.hash = "#/";
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center px-5 py-16">
        <div className="w-full max-w-[520px] rounded-[32px] border border-line-2 bg-card p-8 text-center shadow-[0_30px_60px_-30px_rgba(0,0,0,0.45)] sm:p-12">
          <div className="flex justify-center">
            <LogoLockup markClassName="h-12 w-12" wordClassName="h-6 w-auto" />
          </div>
          <h1 className="mt-9 font-display text-[42px] leading-none uppercase">Something went wrong</h1>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
            This screen stopped unexpectedly. Your check-in data is stored in this browser only, so nothing has been
            lost — reloading the app usually fixes it.
          </p>
          {this.state.error && (
            <p className="mt-5 rounded-2xl bg-sand/70 px-4 py-3 font-mono text-[11px] break-words text-ink-2">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-full bg-ink px-6 py-3 text-[13px] font-bold text-paper transition-colors hover:bg-night-3"
            >
              Reload the app
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="rounded-full border border-line-2 px-6 py-3 text-[13px] font-bold transition-colors hover:bg-sand/60"
            >
              Back to start
            </button>
          </div>
          <p className="mt-8 font-mono text-[10px] tracking-[0.16em] text-muted uppercase">
            Synthetic demo data · Screening aid, not a diagnosis
          </p>
        </div>
      </div>
    );
  }
}
