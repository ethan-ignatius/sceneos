import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors from the React Three Fiber canvas (or any other
 * child) and renders a readable fallback instead of letting React unmount the
 * entire route — which presents as a black screen on top of `bg-bg-base`.
 *
 * The 3D stack (Three.js, WebGL postprocessing, custom shaders) can throw
 * during render in ways that don't bubble to a console.error visible to the
 * user — particularly on viewports without the GL extensions our EffectComposer
 * needs. Without this boundary, those throws silently nuke the whole page.
 */
export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[CanvasErrorBoundary] caught render error", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="absolute inset-0 grid place-items-center bg-bg-base p-8">
          <div className="max-w-lg space-y-4 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-state-error">
              Canvas render failed
            </div>
            <p className="font-display text-2xl italic leading-snug text-fg-primary">
              The 3D scene threw an error.
            </p>
            <pre className="overflow-auto rounded-md border border-state-error/30 bg-state-error/5 p-3 text-left font-mono text-[11px] leading-relaxed text-fg-secondary">
              {this.state.error.message}
            </pre>
            <button
              onClick={this.reset}
              className="rounded-md border border-fg-tertiary/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-secondary hover:border-brand-ember hover:text-brand-ember"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
