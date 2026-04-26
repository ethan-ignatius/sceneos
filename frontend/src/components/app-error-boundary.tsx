import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Top-level error boundary. Without this, any uncaught render error
 * unmounts the entire route tree and React 19 paints `<body>`'s background
 * — which on this app is `bg-bg-base` (#0a0908), reading as a black page.
 *
 * We surface the actual error + component stack so we can diagnose silent
 * crashes (e.g. WebGL init failure, lazy-import 404, store hydration mismatch).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary] render crash", error);
    console.error("[AppErrorBoundary] component stack:", info.componentStack);
    // Intentionally do NOT call setState here — getDerivedStateFromError
    // already captured the error. setState in componentDidCatch can interact
    // badly with child render loops in React 19.
    if (!this.state.info) {
      // Use a microtask so we don't update state during the same commit.
      queueMicrotask(() => this.setState({ info }));
    }
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-screen w-screen place-items-center bg-bg-base p-8">
        <div className="max-w-2xl space-y-4">
          <div className="font-body text-pill font-medium text-state-error">
            Uncaught render error
          </div>
          <p className="font-display text-2xl italic leading-snug text-fg-primary">
            The app threw before it could mount the route.
          </p>
          <pre className="overflow-auto rounded-md border border-state-error/30 bg-state-error/5 p-3 font-mono text-caption leading-relaxed text-fg-secondary">
            {this.state.error.message}
          </pre>
          {this.state.info?.componentStack ? (
            <div className="rounded-md border border-fg-tertiary/25 bg-bg-elev-1/60 p-3">
              <div className="mb-2 font-body text-pill font-medium text-fg-tertiary">
                Component stack
              </div>
              <pre className="overflow-auto font-mono text-overline leading-relaxed text-fg-tertiary">
                {this.state.info.componentStack}
              </pre>
            </div>
          ) : (
            <p className="font-mono text-overline text-fg-tertiary">
              Component stack not yet captured — open DevTools console; the
              boundary printed it via console.error on crash.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md border border-fg-tertiary/40 px-4 py-2 font-body text-pill font-medium text-fg-secondary hover:border-brand-ember hover:text-brand-ember"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("sceneos:beat-graph");
                localStorage.removeItem("sceneos:prompt");
                location.href = "/";
              }}
              className="rounded-md border border-fg-tertiary/40 px-4 py-2 font-body text-pill font-medium text-fg-secondary hover:border-brand-ember hover:text-brand-ember"
            >
              Reset session and go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
