/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';

/** Join two open loft ends on the joint's half-angle plane. Only the short
 * transition bands deform; the shared IK, pivots and limb lengths stay intact.
 * Matching seam rings are required, including their angular vertex order. */
export function joinRiderSurface(
  upper: THREE.BufferGeometry, lower: THREE.BufferGeometry,
  joint: THREE.Object3D, length: number, band: number,
): () => void {
  const half = new THREE.Quaternion(), rotation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  const parts = [upper, lower].map((geometry, part) => {
    const p = geometry.getAttribute('position') as THREE.BufferAttribute, n = geometry.getAttribute('normal') as THREE.BufferAttribute;
    p.setUsage(THREE.DynamicDrawUsage); n.setUsage(THREE.DynamicDrawUsage);
    const samples: { index: number; p: THREE.Vector3; n: THREE.Vector3; weight: number }[] = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + (part === 0 ? length : 0);
      const t = Math.max(0, 1 - Math.abs(y) / band);
      if (t === 0) continue;
      const position = new THREE.Vector3(p.getX(i), y, p.getZ(i));
      const direction = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      // Both ends use the same radial normal, independently of their caps or
      // neighbouring folds. This prevents a lighting seam at the welded ring.
      if (Math.abs(y) < 1e-6) direction.set(position.x, 0, position.z).normalize();
      samples.push({ index: i, p: position, n: direction, weight: t * t * (3 - 2 * t) });
    }
    // Dynamic bands can leave the rest-pose bounds during deep crouches.
    geometry.computeBoundingSphere();
    geometry.boundingSphere!.radius += band;
    return { p, n, samples, part };
  });
  return () => {
    half.identity().slerp(joint.quaternion, .5);
    for (const { p, n, samples, part } of parts) {
      rotation.copy(half);
      if (part === 1) rotation.premultiply(inverse.copy(joint.quaternion).invert());
      for (const sample of samples) {
        point.copy(sample.p).applyQuaternion(rotation).lerp(sample.p, 1 - sample.weight);
        normal.copy(sample.n).applyQuaternion(rotation).lerp(sample.n, 1 - sample.weight).normalize();
        p.setXYZ(sample.index, point.x, point.y - (part === 0 ? length : 0), point.z);
        n.setXYZ(sample.index, normal.x, normal.y, normal.z);
      }
      p.needsUpdate = true; n.needsUpdate = true;
    }
  };
}
