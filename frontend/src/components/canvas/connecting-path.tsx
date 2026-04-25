import { useMemo } from "react";
import * as THREE from "three";

interface ConnectingPathProps {
  positions: Array<[number, number, number]>;
}

/**
 * Quiet dotted path threading through the beat nodes.
 *
 * THREE.CatmullRomCurve3 generates a smooth spline through the input points;
 * `getPoints(n)` samples evenly along that curve. We render those samples as
 * <points> with a small pointsMaterial — the result reads as a faint trail,
 * not a wireframe line.
 *
 * Rendering choices:
 *   - sizeAttenuation true → nearer dots larger, gives perspective.
 *   - opacity 0.3 → background quietly teaches beat order without competing.
 *   - color matches fg-tertiary so it sits behind ember nodes.
 */
export function ConnectingPath({ positions }: ConnectingPathProps) {
  const geometry = useMemo(() => {
    if (positions.length < 2) return null;
    const vectorPoints = positions.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(vectorPoints);
    const samples = curve.getPoints(positions.length * 8);
    return new THREE.BufferGeometry().setFromPoints(samples);
  }, [positions]);

  if (!geometry) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={0.04}
        color="#9aa6ad"
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
