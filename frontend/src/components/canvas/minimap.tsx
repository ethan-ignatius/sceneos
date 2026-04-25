import { useMemo } from "react";
import { motion } from "motion/react";
import type { Beat } from "@/types/manifest";
import { computeBeatPositions } from "@/lib/beat-layout";
import { GOTO_CAMERA_EVENT, RESET_CAMERA_EVENT } from "./beat-map-3d";

interface MinimapProps {
  beats: Beat[];
  activeBeatId: string | null;
}

/**
 * Top-down 2D minimap overlay — the cheap-but-correct answer to the
 * "combine 3D with React-Flow" question. R3F renders WebGL; React Flow
 * is HTML/SVG; they can't share node positions natively. So the minimap
 * is a small SVG drawing top-down (X/Y, Z dropped) of the same beats
 * the 3D canvas is already showing, with a click-to-pan affordance.
 *
 * Click anywhere on the minimap → fires `GOTO_CAMERA_EVENT` with the
 * world-space (x, y) target; BeatMap3D's pan ref absorbs it. Click on a
 * specific beat → set that beat active (drawer opens, camera arcs in).
 *
 * Positioned top-right of the canvas chrome, below the stitch button.
 */
export function Minimap({ beats, activeBeatId }: MinimapProps) {
  // 3D positions → 2D minimap coordinates. We collapse Z (depth) and use
  // (X, Y) directly. The minimap is 140×96px with 8px padding.
  const layout = useMemo(() => {
    const positions = computeBeatPositions(beats);
    if (positions.length === 0) return { points: [], extent: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    const xs = positions.map((p) => p[0]);
    const ys = positions.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const xRange = Math.max(maxX - minX, 0.001);
    const yRange = Math.max(maxY - minY, 0.001);
    const points = positions.map((p, i) => ({
      beatId: beats[i].beatId,
      status: beats[i].status,
      // Map world (x,y) → svg (px, py) with padding. Y axis flipped because
      // SVG y grows down while world y grows up.
      px: 8 + ((p[0] - minX) / xRange) * 124,
      py: 8 + (1 - (p[1] - minY) / yRange) * 80,
      worldX: p[0],
      worldY: p[1],
    }));
    return { points, extent: { minX, maxX, minY, maxY } };
  }, [beats]);

  const handleNodeClick = (beatId: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent(GOTO_CAMERA_EVENT, { detail: { beatId } }));
  };

  // Empty-space click → return to outer view. The minimap is a navigation
  // surface; tapping outside any beat-dot is the user saying "no beat,
  // just the whole timeline." Fires the same RESET event Esc / Re-center
  // use, so the camera, pan, orbit, and zoom all zero in one move.
  const handleBackgroundClick = () => {
    window.dispatchEvent(new CustomEvent(RESET_CAMERA_EVENT));
  };

  if (layout.points.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.25, 1, 0.5, 1], delay: 0.5 }}
      className="pointer-events-auto fixed bottom-20 right-4 z-20 rounded-xl border border-fg-tertiary/20 bg-bg-elev-1/70 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]"
      aria-label="Beat-map minimap"
    >
      {/* Eyebrow — names the surface. The user who's never seen this canvas
          before gets one tiny line of "this is what you're looking at,"
          where without it the SVG is just dots. */}
      <div className="flex items-center justify-between border-b border-fg-tertiary/15 px-2.5 py-1.5">
        <span className="caption-track text-[9px] text-fg-tertiary">Timeline</span>
        <span className="caption-track text-[9px] text-fg-tertiary/55" title="Scroll to zoom · click empty to reset">
          ⊕ scroll
        </span>
      </div>

      <svg
        width={156}
        height={64}
        viewBox="0 0 156 64"
        role="img"
        aria-label="Click a beat to fly there. Click empty space to return to outer view."
        className="block cursor-pointer"
        onClick={handleBackgroundClick}
      >
        {/* Background hit target — eats clicks that miss every beat dot.
            Dispatches the reset event via handleBackgroundClick (the svg
            onClick). Beat-dot groups stop propagation in their handler so
            this only fires for true empty-space clicks. */}
        <rect x={0} y={0} width={156} height={64} fill="transparent" />

        {/* Hairline timeline rail — a single horizontal line, since the
            layout itself is now a flat timeline (y=0 everywhere). The
            previous dotted rect framed an arch that no longer exists. */}
        <line
          x1={8}
          y1={32}
          x2={148}
          y2={32}
          stroke="rgba(142, 127, 110, 0.22)"
          strokeWidth={0.6}
          strokeDasharray="2 3"
        />

        {/* Path threading the beats — this echoes the ConnectingPath in
            the 3D scene so the minimap reads as the same surface, smaller. */}
        {layout.points.length > 1 ? (
          <polyline
            points={layout.points.map((p) => `${(p.px / 140) * 156},32`).join(" ")}
            fill="none"
            stroke="rgba(192, 136, 88, 0.45)"
            strokeWidth={0.9}
          />
        ) : null}

        {/* Beat dots — laid along the rail. We override Y to a constant
            32 (mid-height) so the timeline reads dead-flat regardless of
            any tiny y deltas computeBeatPositions might emit. */}
        {layout.points.map((p) => {
          const isActive = p.beatId === activeBeatId;
          const isApproved = p.status === "approved";
          const fill = isApproved
            ? "#f0a868"
            : isActive
              ? "#f0a868"
              : p.status === "ready-to-generate" || p.status === "preview" || p.status === "generating"
                ? "#c08858"
                : "rgba(245, 239, 231, 0.4)";
          const r = isActive ? 3.5 : isApproved ? 2.8 : 2.2;
          const cx = (p.px / 140) * 156;
          const cy = 32;
          return (
            <g
              key={p.beatId}
              role="button"
              tabIndex={0}
              aria-label={`Go to beat ${p.beatId}`}
              onClick={(e) => handleNodeClick(p.beatId, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleNodeClick(p.beatId, e);
                }
              }}
              className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-brand-ember"
            >
              {/* Hit target — invisible, generous so clicks register easily. */}
              <circle cx={cx} cy={cy} r={7} fill="transparent" />
              {/* Active outer ring for the focused beat. */}
              {isActive ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 2}
                  fill="none"
                  stroke="rgba(240, 168, 104, 0.5)"
                  strokeWidth={0.85}
                />
              ) : null}
              <circle cx={cx} cy={cy} r={r} fill={fill} />
            </g>
          );
        })}
      </svg>
    </motion.div>
  );
}
