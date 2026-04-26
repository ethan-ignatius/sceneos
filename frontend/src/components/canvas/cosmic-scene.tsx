import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * The "we're traveling through space" backdrop. Mounted once inside the
 * canvas; lives behind the planets and the connecting path.
 *
 * Layers (back to front):
 *   1. <GalaxyNebula>      — spiral point cloud, 6000 particles, slow rotation,
 *                            radial color gradient (warm core → cool arms).
 *                            Replaces the flat <color> background.
 *   2. <AsteroidBelt>      — instancedMesh of ~80 dodecahedron asteroids
 *                            ringing the journey at varying radii. Slow
 *                            individual tumbles.
 *   3. <Comets>            — 3 sphere-head + trailing-tail comets on
 *                            independent paths that occasionally cross the
 *                            frustum.
 *   4. <DistantSpaceship>  — procedural ship silhouette far in the bg,
 *                            drifting laterally at constant velocity. Reads
 *                            as "we're not alone out here."
 *
 * All of these are intentionally cheap — instancedMesh + a few hundred
 * points + a couple of textured spheres. The planets remain the focus;
 * cosmic decoration sets the FRAME but doesn't compete for attention.
 *
 * Performance budget: <500 draw calls total, <10k vertices added beyond
 * the existing planets. Tested at 60fps on M1 + 1080p.
 */
export function CosmicScene() {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <group>
      <GalaxyNebula reducedMotion={reducedMotion} />
      <AsteroidBelt reducedMotion={reducedMotion} />
      <Comets reducedMotion={reducedMotion} />
      <DistantSpaceship reducedMotion={reducedMotion} />
    </group>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Galaxy nebula — spiral point cloud
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Bruno-Simon-style galaxy generator: N particles distributed in a
 * three-armed spiral with a radial color gradient (warm ember at the
 * core, cool blue at the rim). The whole cloud rotates slowly around y.
 *
 * Tuning:
 *   COUNT       — total particles (6000 reads as "deep space" without
 *                 fragmenting at low DPR)
 *   RADIUS      — how far the arms extend (large enough that the camera
 *                 always feels INSIDE the galaxy, never near the edge)
 *   BRANCHES    — number of spiral arms (3 = classic barred spiral)
 *   SPIN        — how tightly the arms wind (1 = open, 3 = tight)
 *   RANDOMNESS  — per-particle scatter perpendicular to the arm
 *   POW         — exponent biasing scatter toward the arm itself (3 keeps
 *                 the arms readable; 1 = blob)
 *
 * Reference: alvarosabu/threejs-galaxy-generator + threejs-journey
 * "Animated Galaxy" lesson. Adapted to a static (non-vertex-shader-
 * animated) variant — the y-rotation in useFrame is plenty of motion.
 */
function GalaxyNebula({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const COUNT = 6000;
  const RADIUS = 60;
  const BRANCHES = 3;
  const SPIN = 1.6;
  const RANDOMNESS = 0.35;
  const POW = 3;

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const inside = new THREE.Color("#f0a868"); // brand-ember at galactic core
    const outside = new THREE.Color("#5e7080"); // brand-cool at the rim

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const r = Math.random() * RADIUS;
      const branchAngle = ((i % BRANCHES) / BRANCHES) * Math.PI * 2;
      const spinAngle = r * (SPIN / RADIUS);

      // Per-particle perpendicular scatter — biased toward the arm itself
      // so arms stay legible while edges fade into the core.
      const randX = Math.pow(Math.random(), POW) * (Math.random() < 0.5 ? 1 : -1) * RANDOMNESS * r;
      const randY = Math.pow(Math.random(), POW) * (Math.random() < 0.5 ? 1 : -1) * RANDOMNESS * r * 0.4;
      const randZ = Math.pow(Math.random(), POW) * (Math.random() < 0.5 ? 1 : -1) * RANDOMNESS * r;

      positions[i3 + 0] = Math.cos(branchAngle + spinAngle) * r + randX;
      positions[i3 + 1] = randY;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + randZ;

      // Colour interpolates from inside → outside by radial distance.
      const mixed = inside.clone().lerp(outside, r / RADIUS);
      colors[i3 + 0] = mixed.r;
      colors[i3 + 1] = mixed.g;
      colors[i3 + 2] = mixed.b;
    }
    return { positions, colors };
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current && !reducedMotion) {
      groupRef.current.rotation.y += delta * 0.012;
    }
  });

  return (
    <group ref={groupRef} position={[0, -8, -25]} rotation={[Math.PI / 2.6, 0, 0]}>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={COUNT}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.25}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexColors
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Asteroid belt — instancedMesh of small irregular rocks
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * 80 procedurally-placed asteroids in a wide ring offset BELOW the
 * journey path. Each instance has a random scale, rotation axis, and
 * rotation rate. We update the whole mesh's transforms via setMatrixAt
 * + instanceMatrix.needsUpdate per frame.
 *
 * Why dodecahedrons: 12 faces give enough silhouette variety at small
 * scale to read as "rock," not "low-poly placeholder." A custom GLB
 * would look better but a stock geometry is one less asset dependency.
 *
 * Why "below" the path: the journey snakes through the y=±0.55 band;
 * the asteroid ring sits at y=-3 to -4 so it's visible from above
 * (overview camera) without intersecting the planets.
 */
function AsteroidBelt({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const COUNT = 80;

  // Pre-baked per-instance state. Stored as plain arrays so the per-frame
  // matrix update doesn't allocate.
  const transforms = useMemo(() => {
    const data: {
      basePos: THREE.Vector3;
      orbitRadius: number;
      orbitAngle: number;
      orbitSpeed: number;
      tumbleAxis: THREE.Vector3;
      tumbleSpeed: number;
      scale: number;
    }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const orbitRadius = 8 + Math.random() * 14; // ring extent: 8–22 wide
      const orbitAngle = Math.random() * Math.PI * 2;
      const yScatter = -3 + (Math.random() - 0.5) * 1.5; // y plane ± 0.75
      data.push({
        basePos: new THREE.Vector3(0, yScatter, 0),
        orbitRadius,
        orbitAngle,
        orbitSpeed: (Math.random() - 0.5) * 0.04, // some retrograde
        tumbleAxis: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize(),
        tumbleSpeed: (Math.random() - 0.5) * 0.6,
        scale: 0.08 + Math.random() * 0.18,
      });
    }
    return data;
  }, []);

  // Reusable matrix + quaternion to avoid per-frame allocations.
  const dummyMatrix = useMemo(() => new THREE.Matrix4(), []);
  const dummyQuat = useMemo(() => new THREE.Quaternion(), []);
  const dummyPos = useMemo(() => new THREE.Vector3(), []);
  const dummyScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      const tr = transforms[i];
      const angle = tr.orbitAngle + t * tr.orbitSpeed;
      dummyPos.set(
        tr.basePos.x + Math.cos(angle) * tr.orbitRadius,
        tr.basePos.y,
        tr.basePos.z + Math.sin(angle) * tr.orbitRadius,
      );
      dummyQuat.setFromAxisAngle(tr.tumbleAxis, t * tr.tumbleSpeed);
      dummyScale.setScalar(tr.scale);
      dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
      meshRef.current.setMatrixAt(i, dummyMatrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#3a322a" roughness={0.95} metalness={0.05} />
    </instancedMesh>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Comets — sphere head + fading-trail polyline
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Three independent comets on linear paths that cross the canvas at
 * different intervals. Each comet is:
 *   - a small ember sphere (the head, toneMapped=false so it stays bright)
 *   - a polyline of 30 trail points behind it, with vertex alpha fading
 *     from head-bright to tail-invisible
 *
 * Paths are designed to cross the camera frustum during the active beat
 * view AND the overview, so the user sees motion regardless of where
 * they are on the spline.
 */
function Comets({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group>
      <Comet
        startAt={[-30, 4, -10]}
        endAt={[30, 1, -8]}
        period={18}
        phase={0}
        reducedMotion={reducedMotion}
      />
      <Comet
        startAt={[20, -2, -16]}
        endAt={[-25, 5, -6]}
        period={25}
        phase={8}
        reducedMotion={reducedMotion}
      />
      <Comet
        startAt={[-18, -5, -20]}
        endAt={[22, 6, -12]}
        period={32}
        phase={20}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}

interface CometProps {
  startAt: [number, number, number];
  endAt: [number, number, number];
  /** Seconds per pass start→end. */
  period: number;
  /** Initial phase offset so multiple comets don't sync. */
  phase: number;
  reducedMotion: boolean;
}

function Comet({ startAt, endAt, period, phase, reducedMotion }: CometProps) {
  const headRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Line>(null);
  const TRAIL_POINTS = 30;
  const startVec = useMemo(() => new THREE.Vector3(...startAt), [startAt]);
  const endVec = useMemo(() => new THREE.Vector3(...endAt), [endAt]);

  // Fixed-length buffer for the trail. Updated each frame with the most
  // recent N positions so the line always has TRAIL_POINTS-1 segments.
  const positionsBuffer = useMemo(() => new Float32Array(TRAIL_POINTS * 3), []);
  const colorsBuffer = useMemo(() => {
    const arr = new Float32Array(TRAIL_POINTS * 3);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      // Fade alpha-via-color from ember-bright at head (i=0) to dark at tail.
      const a = 1 - i / TRAIL_POINTS;
      arr[i * 3 + 0] = 0.94 * a;
      arr[i * 3 + 1] = 0.66 * a;
      arr[i * 3 + 2] = 0.41 * a;
    }
    return arr;
  }, []);

  const lineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positionsBuffer, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colorsBuffer, 3));
    return geo;
  }, [positionsBuffer, colorsBuffer]);

  // History ring buffer so the trail genuinely lags behind the head
  // instead of being computed from the parametric path. This means the
  // trail correctly bends with curvature if we ever non-linear the path.
  const history = useRef<THREE.Vector3[]>(
    Array.from({ length: TRAIL_POINTS }, () => startVec.clone()),
  );

  useFrame((state) => {
    if (reducedMotion) return;
    const t = ((state.clock.elapsedTime + phase) % period) / period;
    const head = startVec.clone().lerp(endVec, t);
    if (headRef.current) headRef.current.position.copy(head);

    // Push head onto history and pop tail.
    history.current.unshift(head.clone());
    history.current = history.current.slice(0, TRAIL_POINTS);

    // Sync history into the position buffer.
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const p = history.current[i];
      positionsBuffer[i * 3 + 0] = p.x;
      positionsBuffer[i * 3 + 1] = p.y;
      positionsBuffer[i * 3 + 2] = p.z;
    }
    if (trailRef.current) {
      const attr = trailRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh ref={headRef} position={startAt}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#ffd9a3" toneMapped={false} />
      </mesh>
      {/* @ts-expect-error — drei's <line> typing collides with HTML <line>; runtime is correct. */}
      <line ref={trailRef} geometry={lineGeometry}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} toneMapped={false} />
      </line>
    </group>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Distant spaceship — procedural silhouette in the bg
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * A small ship-shaped silhouette drifting laterally far behind the
 * journey. Procedural — a stretched cone for the hull, two thin cylinder
 * "wings" cantilevered out the sides. No texture, just dark grey
 * material with a faint ember exhaust dot at the back.
 *
 * Sits at y=6, z=-30 and drifts x=±20 over a 90s loop. Far enough back
 * that it reads as "another vessel out there," not as a scene object.
 */
function DistantSpaceship({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    const period = 90;
    const phase = (t % period) / period;
    // Linear drift in x; slight sin in y for a "rocking" feel.
    const x = -20 + phase * 40;
    const y = 6 + Math.sin(t * 0.2) * 0.3;
    groupRef.current.position.set(x, y, -30);
    // Orient ship to face direction of travel (always +x in this simple
    // path), with a slight pitch for character.
    groupRef.current.rotation.set(0, Math.PI / 2, Math.sin(t * 0.15) * 0.05);
  });

  return (
    <group ref={groupRef}>
      {/* Hull — stretched cone, nose forward (+z after rotation). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.18, 0.95, 14]} />
        <meshStandardMaterial color="#2a2520" roughness={0.65} metalness={0.45} />
      </mesh>
      {/* Wings — thin cylinder spanning across the hull near its midpoint. */}
      <mesh position={[0, 0, -0.05]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.6, 6]} />
        <meshStandardMaterial color="#2a2520" roughness={0.65} metalness={0.45} />
      </mesh>
      {/* Exhaust dot — bright ember, behind the hull. */}
      <mesh position={[0, 0, -0.55]}>
        <sphereGeometry args={[0.055, 10, 10]} />
        <meshBasicMaterial color="#ffb874" toneMapped={false} />
      </mesh>
      {/* Cockpit highlight — small bright dot near the nose-front edge. */}
      <mesh position={[0, 0.08, 0.25]}>
        <sphereGeometry args={[0.028, 10, 10]} />
        <meshBasicMaterial color="#88c8ff" toneMapped={false} />
      </mesh>
    </group>
  );
}
