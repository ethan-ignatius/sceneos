import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";

/**
 * Page-crumple bridge between Landing and Canvas. Showpiece for the demo.
 *
 * v0 implementation: a CSS-driven dissolve + ember-flicker placeholder so the
 * route is wired end-to-end before Alex builds the GLSL paper-curl shader. The
 * GSAP timeline is hooked up so swapping in a `<canvas>` shader pass later only
 * requires changing the elements, not the navigation timing.
 */
export function CrumpleBridgeRoute() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const tl = gsap.timeline({
      onComplete: () => navigate("/canvas", { replace: true }),
    });

    tl.fromTo(
      ".crumple-flash",
      { opacity: 0 },
      { opacity: 1, duration: 0.18, ease: "power2.out" },
    )
      .to(".crumple-page", {
        scale: 0.92,
        rotateZ: -3,
        opacity: 0,
        filter: "blur(12px)",
        duration: 1.05,
        ease: "power3.in",
      }, "<")
      .to(".crumple-flash", { opacity: 0, duration: 0.4, ease: "power2.in" }, "-=0.4")
      .to(".crumple-veil", { opacity: 1, duration: 0.4, ease: "power2.out" }, "-=0.5");

    return () => {
      tl.kill();
    };
  }, [navigate]);

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-bg-base">
      <div className="crumple-page absolute inset-0 grid place-items-center">
        <div className="space-y-3 text-center">
          <h2 className="text-display-md italic text-fg-primary">Composing the canvas…</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-fg-tertiary">
            Five beats. One cinematic.
          </p>
        </div>
      </div>

      <div className="crumple-flash pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,_rgba(240,168,104,0.55),_transparent_55%)] opacity-0" />

      <div className="crumple-veil pointer-events-none absolute inset-0 bg-bg-base opacity-0" />
    </div>
  );
}
