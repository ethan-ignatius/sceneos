import { useMemo } from "react";
import { motion } from "motion/react";
import type { Beat } from "@/types/manifest";
import { computeBeatPositions } from "@/lib/beat-layout";
import { GOTO_CAMERA_EVENT } from "./beat-map-3d";

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

  const handleNodeClick = (beatId: string) => {
    window.dispatchEvent(new CustomEvent(GOTO_CAMERA_EVENT, { detail: { beatId } }));
  };

  if (layout.points.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.25, 1, 0.5, 1], delay: 0.5 }}
      className="pointer-events-auto fixed bottom-20 right-4 z-20 rounded-md border border-fg-tertiary/20 bg-bg-elev-1/70 p-1.5 backdrop-blur-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]"
      aria-label="Beat-map minimap"
    >
      <svg
        width={140}
        height={96}
        viewBox="0 0 140 96"
        role="img"
        aria-label="Top-down view of all beats"
        className="block"
      >
        {/* Frame guide — a faint dotted rect that says "this is the canvas." */}
        <rect
          x={4}
          y={4}
          width={132}
          height={88}
          fill="none"
          stroke="rgba(142, 127, 110, 0.18)"
          strokeWidth={0.5}
          strokeDasharray="2 3"
          rx={3}
        />

        {/* Hairline path threading through the beats — same order as the
            ConnectingPath in the 3D scene. Polyline keeps it cheap. */}
        {layout.points.length > 1 ? (
          <polyline
            points={layout.points.map((p) => `${p.px},${p.py}`).join(" ")}
            fill="none"
            stroke="rgba(192, 136, 88, 0.4)"
            strokeWidth={0.75}
          />
        ) : null}

        {/* Beat dots */}
        {layout.points.map((p) => {
          const isActive = p.beatId === activeBeatId;
          const isApproved = p.status === "approved";
          const fill = isApproved
            ? "#f0a868"
            : isActive
            ? "#f0a868"
            : p.status === "ready-to-generate" || p.status === "preview" || p.status === "generating"
            ? "#c08858"
            : "rgba(245, 239, 231, 0.35)";
          const r = isActive ? 3.5 : isApproved ? 2.8 : 2.2;
          return (
            <g
              key={p.beatId}
              role="button"
              tabIndex={0}
              aria-label={`Go to beat at ${p.worldX.toFixed(1)}, ${p.worldY.toFixed(1)}`}
              onClick={() => handleNodeClick(p.beatId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleNodeClick(p.beatId);
                }
              }}
              className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-brand-ember"
            >
              {/* Hit target — invisible, generous so clicks register easily. */}
              <circle cx={p.px} cy={p.py} r={6} fill="transparent" />
              {/* Active outer ring for the focused beat. */}
              {isActive ? (
                <circle
                  cx={p.px}
                  cy={p.py}
                  r={r + 2}
                  fill="none"
                  stroke="rgba(240, 168, 104, 0.4)"
                  strokeWidth={0.75}
                />
              ) : null}
              <circle cx={p.px} cy={p.py} r={r} fill={fill} />
            </g>
          );
        })}
      </svg>
    </motion.div>
  );
}
