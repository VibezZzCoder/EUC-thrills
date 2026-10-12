/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';

/** Short cloth corrections follow posed trouser shoulders, never the distant
 * knees. Each wrap column of the open hem lifts as one piece, off the body and
 * towards the chest, until it clears both legs: a radial ray through a folded
 * leg can reach its far end and stretch the shirt into a long ribbon. */
export function drapeRiderHem(
  geometry: THREE.BufferGeometry, pelvis: THREE.Object3D,
  hips: readonly THREE.Object3D[],
  layout: { readonly radial: number; readonly rings: number; readonly splitSeam: boolean;
    readonly envelope?: { readonly x: number; readonly z: number; readonly cap: number } },
): () => void {
  const { radial, rings: rows, splitSeam } = layout;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  positions.setUsage(THREE.DynamicDrawUsage);
  (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const rest = positions.array.slice();
  geometry.computeBoundingSphere(); geometry.boundingSphere!.radius += .10;
  const inversePelvis = new THREE.Matrix4();
  const intoHip = hips.map(() => new THREE.Matrix4()), intoPelvis = hips.map(() => new THREE.Matrix4());
  const point = new THREE.Vector3(), original = new THREE.Vector3(), normal = new THREE.Vector3();
  // The trouser leg the shirt hem must clear, as an elliptic capsule in each
  // hip's frame: the hip dome's sphere over the joint and the thigh's barrel
  // down to 0.25 m (M41 C4: loose cargos narrow at the hip, half-width .078
  // to .098 down to the pocket, so the trousers sit inside the hem).
  const rx = layout.envelope?.x ?? .102, rz = layout.envelope?.z ?? .094;
  const cap = layout.envelope?.cap ?? .080, top = 0, bottom = -.25;
  const probe = new THREE.Vector3();
  const inside = (at: THREE.Vector3): boolean => {
    for (let h = 0; h < hips.length; h++) {
      probe.copy(at).applyMatrix4(intoHip[h]!);
      const dy = probe.y - Math.min(top, Math.max(bottom, probe.y));
      if ((probe.x / rx) ** 2 + (dy / cap) ** 2 + (probe.z / rz) ** 2 < 1) return true;
    }
    return false;
  };
  // Cloth rides up and off the legs: each column's lower panel lifts as one
  // piece along its own rest normal tipped a little towards the chest (more
  // tip slid the lower panel up over the chest V as a second layer). Per-vertex
  // projection let a raised thigh shove neighbouring rows past each other —
  // a hanging ribbon, a crumpled front, a row of spikes along the hem.
  // The first loft is the garment. Caps, a merged rigid seat and collar
  // pieces are not cloth rows. Unmapped lofts also have no duplicate seam.
  const columns = radial + (splitSeam ? 1 : 0);
  const lift = (geometry.getAttribute('normal') as THREE.BufferAttribute).array.slice();
  for (let i = 0; i < positions.count; i++) {
    normal.fromArray(lift, i * 3); normal.y += .45; normal.normalize().toArray(lift, i * 3);
  }
  // A long eased fade, so a lifted panel slopes back into the chest instead of
  // folding into a step a low camera reads as two layers.
  const weight = (y: number): number => { const t = Math.min(1, Math.max(0, (.22 - y) / .15)); return t * t * (3 - 2 * t); };
  const travel = new Float32Array(columns), widened = new Float32Array(columns);
  const clear = (c: number, t: number): boolean => {
    for (let r = 0; r < rows; r++) {
      const i = r * columns + c, y = rest[i * 3 + 1]!;
      if (y > .16) break;
      point.fromArray(rest, i * 3).addScaledVector(normal.fromArray(lift, i * 3), t * weight(y));
      if (inside(point)) return false;
    }
    return true;
  };
  return () => {
    pelvis.updateWorldMatrix(true, false); inversePelvis.copy(pelvis.matrixWorld).invert();
    hips.forEach((hip, i) => {
      hip.updateWorldMatrix(true, false);
      intoPelvis[i]!.multiplyMatrices(inversePelvis, hip.matrixWorld);
      intoHip[i]!.copy(intoPelvis[i]!).invert();
    });
    for (let c = 0; c < radial; c++) {
      let t = 0;
      if (!clear(c, 0)) {
        let low = 0;
        for (t = .004; t < .09 && !clear(c, t); t += .004) low = t;
        t = Math.min(.09, t);
        for (let k = 0; k < 4; k++) { const mid = (low + t) / 2; if (clear(c, mid)) t = mid; else low = mid; }
      }
      travel[c] = t;
    }
    // Never lower a column: a widened neighbourhood only softens the steps.
    for (let c = 0; c < radial; c++) {
      const before = travel[(c + radial - 1) % radial]!, after = travel[(c + 1) % radial]!;
      widened[c] = Math.max(travel[c]!, (before + 2 * travel[c]! + after) / 4);
    }
    if (splitSeam) widened[radial] = widened[0]!;
    for (let i = 0; i < positions.count; i++) {
      original.fromArray(rest, i * 3);
      // A cloth fold is local: at most 90 mm, and nothing above the waist.
      const t = i < rows * columns ? Math.min(.09, widened[i % columns]!) * weight(original.y) : 0;
      point.copy(original).addScaledVector(normal.fromArray(lift, i * 3), t);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true; geometry.computeVertexNormals();
    const normals = geometry.getAttribute('normal');
    for (let r = 0; splitSeam && r < rows; r++) {
      const a = r * (radial + 1), b = a + radial;
      normal.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
      normals.setXYZ(a, normal.x, normal.y, normal.z); normals.setXYZ(b, normal.x, normal.y, normal.z);
    }
  };
}
