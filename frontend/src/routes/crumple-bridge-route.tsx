import { Suspense, lazy, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { playCinematicRiser, playEmberPop } from "@/lib/audio-cues";

const PaperCurlCanvas = lazy(() =>
  import("@/components/transition/paper-curl-canvas").then((m) => ({
    default: m.PaperCurlCanvas,
  })),
);

/**
 * Page-crumple bridge between Landing and Canvas. The showpiece.
 *
 * Choreography (see docs/MOTION_LANGUAGE.md §6.2 + docs/SHADERS_AUDIO.md):
 *   Track A (0.00–0.18s)  Ember-flash radial gradient ignites at bottom-right.
 *   Track B (0.00–0.95s)  Landing-vibe content collapses (scale, rotate, blur, opacity).
 *   Track C (0.50–1.20s)  Canvas-page silhouette fades up beneath.
 *   Track D (0.40–0.80s)  Ember-flash fades.
 *   Track E (0.20–1.60s)  GLSL ember-burn shader sweeps diagonally.
 *   Track F (1.40–1.60s)  Final settle veil.
 *
 * Audio cues (synthesized — see lib/audio-cues.ts):
 *   +0.04s  Ember pop (filtered noise burst, ~150ms).
 *   +0.18s  Cinematic riser (sub-bass + bandpass sweep, ~1.2s).
 */
export function CrumpleBridgeRoute() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  // GSAP-mutated ref bridge into the shader. Avoids per-frame React renders.
  const progressRef = useRef({ value: 0 });

  // Second-line texture preload. Landing fires its preload on mount, but if
  // the user typed and submitted in <2s the network may not have pulled all
  // 9 planet textures yet. The bridge plays for 1.6s — that's a free
  // window to keep warming the cache so the canvas opens with everything
  // resident. Idempotent: drei's loader cache short-circuits already-loaded
  // urls, so this is a no-op when landing's preload already finished.
  useEffect(() => {
    void Promise.all([
      import("@react-three/drei"),
      import("@/lib/planet-templates"),
    ])
      .then(([{ useTexture }, { PLANET_TEXTURE_PRELOAD_LIST, SATURN_RING_TEXTURE }]) => {
        useTexture.preload([...PLANET_TEXTURE_PRELOAD_LIST, SATURN_RING_TEXTURE]);
      })
      .catch(() => {});
    // Also warm the canvas + node-mesh JS chunks so the lazy() in
    // canvas-route.tsx doesn't pay a parse cost on top of texture loads.
    void import("@/components/canvas/beat-map-3d").catch(() => {});
  }, []);

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

    // Audio cues — fired via tl.call so they ride the same timeline as visuals.
    tl.call(() => playEmberPop({ volume: 0.07 }), [], 0.04);
    tl.call(() => playCinematicRiser({ volume: 0.04 }), [], 0.18);

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

    // Track E — GLSL ember-burn shader sweeps the screen.
    // The mutated ref is read every frame inside the shader's useFrame.
    tl.to(progressRef.current, { value: 1, duration: 1.4, ease: "power1.inOut" }, 0.2);

    // Track F — final veil to ensure clean handoff to canvas mount
    tl.to(".crumple-veil", { opacity: 1, duration: 0.2, ease: "power2.out" }, 1.4);

    return () => {
      tl.kill();
    };
  }, [navigate]);

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-bg-base">
      {/* Vignette + scan-band — match the landing's overlay stack so the
          bridge reads as the same room, not a different page. The radial
          gradient pulls focus to the centered headline; the 1px ember
          repeat is the "glitchy" register the landing carries. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg-base/85 via-bg-base/55 to-bg-base/95"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 70% at 50% 50%, transparent 30%, rgba(10,9,8,0.9) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(240,168,104,1) 2px, rgba(240,168,104,1) 3px)",
        }}
      />

      {/* Track B — the "landing vibe" we collapse. Single line of display
          type matching the landing's headline register; no mono caption. */}
      <div className="crumple-landing absolute inset-0 grid place-items-center">
        <h2
          className="text-center font-display font-medium leading-[1.0] tracking-[-0.03em] text-fg-primary"
          style={{ fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
        >
          Composing <span className="italic text-fg-secondary">the</span> canvas.
        </h2>
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

      {/* Track E — GLSL ember-burn shader. Lazy-loaded so the R3F+three chunk
          isn't paid on the landing route. Suspense fallback is null because
          a missing burn for ~80ms is invisible against the GSAP-only floor. */}
      <Suspense fallback={null}>
        <PaperCurlCanvas progressRef={progressRef} />
      </Suspense>

      {/* Track F — final veil. */}
      <div className="crumple-veil pointer-events-none absolute inset-0 bg-bg-base opacity-0" />
    </div>
  );
}
