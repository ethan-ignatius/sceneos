import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { DURATIONS } from "@/lib/motion-presets";

/**
 * Page-crumple bridge between Landing and Canvas. The showpiece.
 *
 * Choreography (see docs/MOTION_LANGUAGE.md §6.2):
 *   Track A (0.00–0.18s)  Ember-flash radial gradient ignites at bottom-right.
 *   Track B (0.00–0.95s)  Landing-vibe content collapses (scale, rotate, blur, opacity).
 *   Track C (0.50–1.20s)  Canvas-page silhouette fades up beneath.
 *   Track D (0.40–0.80s)  Ember-flash fades.
 *   Track E (0.20–1.40s)  [Plan A only] GLSL paper-curl shader. Skipped in v0.
 *   Track F (1.40–1.60s)  Final settle.
 *
 * Plan A (GLSL paper-curl) is deferred — see FRONTEND_TODO.md item 2.2.
 * The GSAP-only floor below already lands the showpiece on its own.
 */
export function CrumpleBridgeRoute() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      const t = setTimeout(() => navigate("/canvas", { replace: true }), 200);
      return () => clearTimeout(t);
    }

    const tl = gsap.timeline({
      onComplete: () => navigate("/canvas", { replace: true }),
    });

    // Track A — ember flash ignites at bottom-right
    tl.fromTo(
      ".crumple-flash",
      { opacity: 0 },
      { opacity: 1, duration: 0.18, ease: "power2.out" },
      0,
    );

    // Track B — landing vibe collapses
    tl.fromTo(
      ".crumple-landing",
      { scale: 1, rotate: 0, y: 0, opacity: 1, filter: "blur(0px)" },
      {
        scale: 0.92,
        rotate: -3,
        y: 24,
        opacity: 0,
        filter: "blur(12px)",
        duration: 0.95,
        ease: "power3.in",
      },
      0,
    );

    // Track C — canvas silhouette emerges
    tl.fromTo(
      ".crumple-canvas-silhouette",
      { opacity: 0, scale: 1.04 },
      { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" },
      0.5,
    );

    // Track D — flash fades
    tl.to(".crumple-flash", { opacity: 0, duration: 0.4, ease: "power2.in" }, 0.4);

    // Track F — final veil to ensure clean handoff to canvas mount
    tl.to(".crumple-veil", { opacity: 1, duration: 0.2, ease: "power2.out" }, 1.4);

    return () => {
      tl.kill();
    };
  }, [navigate]);

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-bg-base">
      {/* Track B — the "landing vibe" we collapse. Standalone visual cue, not a snapshot. */}
      <div className="crumple-landing absolute inset-0 grid place-items-center">
        <div className="space-y-3 text-center">
          <h2 className="text-display-md italic text-fg-primary">Composing the canvas…</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-fg-tertiary">
            Five beats. One cinematic.
          </p>
        </div>
      </div>

      {/* Track C — canvas silhouette: a few glowing orbs hint at the beat-map. */}
      <div className="crumple-canvas-silhouette pointer-events-none absolute inset-0 grid place-items-center opacity-0">
        <div className="relative h-72 w-[44rem]">
          {[0, 1, 2, 3, 4].map((i) => {
            const t = i / 4;
            const x = (t - 0.5) * 36;
            const y = Math.sin(t * Math.PI) * -8;
            return (
              <span
                key={i}
                className="absolute h-3 w-3 rounded-full bg-brand-ember"
                style={{
                  left: `calc(50% + ${x}rem)`,
                  top: `calc(50% + ${y}rem)`,
                  transform: "translate(-50%, -50%)",
                  boxShadow: "0 0 24px rgba(240, 168, 104, 0.7)",
                  opacity: 0.6 + (1 - Math.abs(0.5 - t)) * 0.4,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Track A — radial ember flash from bottom-right. */}
      <div className="crumple-flash pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,_rgba(240,168,104,0.55),_transparent_55%)] opacity-0" />

      {/* Track F — final veil. */}
      <div className="crumple-veil pointer-events-none absolute inset-0 bg-bg-base opacity-0" />
    </div>
  );
}

// Avoid unused-import diagnostic if DURATIONS is later wired in.
void DURATIONS;
