/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { RIDER_BLOCKOUT } from '../data/tuning.ts';
import type { LoftProfile } from './blockoutKit.ts';

export interface HemGravity {
  /** Pelvis-local attachment height, metres. Fabric above it stays fitted. */
  readonly anchorY: number;
  /** Share of world-down carried by the free edge, from 0 to 1. */
  readonly share: number;
  /** Maximum local lift off a supporting thigh, metres. */
  readonly clearanceTravel: number;
  /** An inward-facing copy below this height, in the existing cloth mesh. */
  readonly liningTop: number;
}

/** A small convex envelope measured once from the sprung shell and its lights.
 * The clipped upper shoulders let the skirt lie beside the carry handle; a box
 * around the entire wheel would hold the rear fabric well away from the lamp. */
function wheelSupport(body: THREE.Group) {
  const directions = [
    [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    ...[-1, 1].flatMap(z => [[0, .85, z], [0, 2.2, z],
      ...[-1, 1].flatMap(x => [[x, .8, z], [x, 0, z]])]),
    [-1, 1.4, 0], [1, 1.4, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  const limits = directions.map(() => -Infinity);
  const point = new THREE.Vector3();
  for (const part of body.children) {
    if (!(part instanceof THREE.Mesh)) continue;
    part.updateMatrix();
    const vertices = part.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(part.matrix);
      for (let j = 0; j < directions.length; j++) {
        limits[j] = Math.max(limits[j]!, point.dot(directions[j]!) + .012);
      }
    }
  }
  return {
    intoBody: new THREE.Matrix4(),
    contains(local: THREE.Vector3): boolean {
      point.copy(local).applyMatrix4(this.intoBody);
      for (let j = 0; j < directions.length; j++) if (point.dot(directions[j]!) > limits[j]!) return false;
      return true;
    },
  };
}

/** A real, dark underside for an open skirt; source indices keep both skins
 * together when a posed thigh supports the cloth. No second mesh/material. */
function hemLining(geometry: THREE.BufferGeometry, top: number): readonly number[] {
  const positions = geometry.getAttribute('position');
  const count = positions.count;
  const sources = Array.from({ length: count }, (_, index) => index);
  const copy = new Map<number, number>();
  for (let i = 0; i < count; i++) if (positions.getY(i) <= top) {
    copy.set(i, sources.length); sources.push(i);
  }
  const oldIndex = geometry.getIndex()!;
  const indices = Array.from(oldIndex.array);
  for (let i = 0; i < oldIndex.count; i += 3) {
    const a = copy.get(oldIndex.getX(i)), b = copy.get(oldIndex.getX(i + 1)), c = copy.get(oldIndex.getX(i + 2));
    if (a !== undefined && b !== undefined && c !== undefined) indices.push(a, c, b);
  }
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const buffer = attribute as THREE.BufferAttribute;
    const values = new Float32Array(sources.length * attribute.itemSize);
    for (let i = 0; i < sources.length; i++) for (let component = 0; component < attribute.itemSize; component++) {
      const value = buffer.array[sources[i]! * attribute.itemSize + component]!;
      values[i * attribute.itemSize + component] = name === 'color' && i >= count ? value * .66 : value;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return sources;
}

/** Short cloth corrections follow posed trouser shoulders, never the distant
 * knees. Each wrap column of the open hem lifts as one piece, off the body and
 * towards the chest, until it clears both legs: a radial ray through a folded
 * leg can reach its far end and stretch the shirt into a long ribbon. */
export function drapeRiderHem(
  geometry: THREE.BufferGeometry, pelvis: THREE.Object3D,
  hips: readonly THREE.Object3D[],
  layout: { readonly radial: number; readonly rings: number; readonly splitSeam: boolean;
    readonly envelope?: { readonly x: number; readonly z: number; readonly cap: number };
    readonly seatProfile?: LoftProfile;
    readonly wheelBody?: THREE.Group;
    readonly gravity?: HemGravity },
): () => void {
  const { radial, rings: rows, splitSeam } = layout;
  const sources = layout.gravity ? hemLining(geometry, layout.gravity.liningTop) : undefined;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  positions.setUsage(THREE.DynamicDrawUsage);
  (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const rest = positions.array.slice();
  const base = layout.gravity ? new Float32Array(rest) : rest;
  geometry.computeBoundingSphere(); geometry.boundingSphere!.radius += layout.gravity ? .40 : .10;
  const inversePelvis = new THREE.Matrix4();
  const intoHip = hips.map(() => new THREE.Matrix4()), intoPelvis = hips.map(() => new THREE.Matrix4());
  const point = new THREE.Vector3(), original = new THREE.Vector3(), normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), localUp = new THREE.Vector3();
  const gravityTurn = new THREE.Quaternion(), weightedTurn = new THREE.Quaternion();
  const lastLocalUp = new THREE.Vector3();
  const lastIntoHip = hips.map(() => new THREE.Matrix4());
  let gravityPoseValid = false;
  // The trouser leg the shirt hem must clear, as an elliptic capsule in each
  // hip's frame: the hip dome's sphere over the joint and the thigh's barrel
  // down to 0.25 m (M41 C4: loose cargos narrow at the hip, half-width .078
  // to .098 down to the pocket, so the trousers sit inside the hem).
  const rx = layout.envelope?.x ?? .102, rz = layout.envelope?.z ?? .094;
  const cap = layout.envelope?.cap ?? .080, top = 0, bottom = -.25;
  const probe = new THREE.Vector3();
  const wheel = layout.wheelBody && wheelSupport(layout.wheelBody);
  const lastIntoWheel = new THREE.Matrix4();
  const inside = (at: THREE.Vector3): boolean => {
    const seat = layout.gravity ? layout.seatProfile : undefined;
    if (seat && at.y >= seat[0]!.y - .015 && at.y <= seat[seat.length - 1]!.y + .015) {
      // The pelvis-fixed shorts do not belong to either thigh capsule. A
      // hanging skirt must still cover that authored volume under the belt.
      let next = 1;
      while (next < seat.length - 1 && seat[next]!.y < at.y) next++;
      const below = seat[next - 1]!, above = seat[next]!;
      const t = Math.min(1, Math.max(0, (at.y - below.y) / (above.y - below.y)));
      const x = below.x + (above.x - below.x) * t;
      const z = below.z + (above.z - below.z) * t;
      // The extra cloth allowance also clears the chords between corrected
      // rows, rather than letting safe vertices hide a seat-cutting facet.
      const width = below.halfWidth + (above.halfWidth - below.halfWidth) * t + .015;
      const depth = below.halfDepth + (above.halfDepth - below.halfDepth) * t + .015;
      const square = below.square + (above.square - below.square) * t;
      if (Math.abs((at.x - x) / width) ** square + Math.abs((at.z - z) / depth) ** square < 1) return true;
    }
    for (let h = 0; h < hips.length; h++) {
      probe.copy(at).applyMatrix4(intoHip[h]!);
      const dy = probe.y - Math.min(top, Math.max(bottom, probe.y));
      if ((probe.x / rx) ** 2 + (dy / cap) ** 2 + (probe.z / rz) ** 2 < 1) return true;
    }
    return wheel?.contains(at) ?? false;
  };
  // Cloth rides up and off the legs: each column's lower panel lifts as one
  // piece along its own rest normal tipped a little towards the chest (more
  // tip slid the lower panel up over the chest V as a second layer). Per-vertex
  // projection let a raised thigh shove neighbouring rows past each other —
  // a hanging ribbon, a crumpled front, a row of spikes along the hem.
  // The first loft is the garment. Caps, a merged rigid seat and collar
  // pieces are not cloth rows. Unmapped lofts also have no duplicate seam.
  const columns = radial + (splitSeam ? 1 : 0);
  // Every vertex of a loft row has the same height and therefore the same
  // gravity blend. Precompute those factors once, then rotate once per row.
  const gravityRows: { readonly start: number; readonly blend: number }[] = [];
  if (layout.gravity) {
    const { anchorY, share } = layout.gravity;
    const skirtLength = Math.max(1e-6, anchorY - rest[1]!);
    for (let row = 0; row < rows; row++) {
      const start = row * columns;
      const free = Math.min(1, Math.max(0, (anchorY - rest[start * 3 + 1]!) / skirtLength));
      const blend = free * free * (3 - 2 * free) * share;
      if (blend > 0) gravityRows.push({ start, blend });
    }
  }
  const restNormals = (geometry.getAttribute('normal') as THREE.BufferAttribute).array.slice();
  const lift = restNormals.slice();
  for (let i = 0; i < positions.count; i++) {
    normal.fromArray(restNormals, (sources?.[i] ?? i) * 3); normal.y += .45; normal.normalize().toArray(lift, i * 3);
  }
  // A long eased fade, so a lifted panel slopes back into the chest instead of
  // folding into a step a low camera reads as two layers.
  const weight = (y: number): number => { const t = Math.min(1, Math.max(0, (.22 - y) / .15)); return t * t * (3 - 2 * t); };
  const travel = new Float32Array(columns), widened = new Float32Array(columns);
  // The gravity-hanging skirt may meet a thigh after leaving its rigid
  // envelope. It needs more local travel than a short shirt hem.
  const maxTravel = layout.gravity?.clearanceTravel ?? .09;
  const outerCount = rows * columns;
  const clothVertices = layout.gravity ? outerCount : 0;
  const support = new Float32Array(clothVertices), lifted = new Float32Array(clothVertices);
  const thighs = (layout.gravity ? hips : []).map(() => ({ origin: new THREE.Vector3(), horizontal: new THREE.Vector3(),
    rise: 0, span: 0 }));
  const delta = new THREE.Vector3();

  // The normal short-hem solver protects the hip end. In a deep riding tuck
  // a whole thigh can cross the skirt horizontally. Hanging cloth rests ON
  // it; pushing the cloth sideways to its distant knee stretches the skirt.
  // Find the upper surface of the posed capsule along gravity, including its
  // round ends. The extremum lies on the projected axis, shifted uphill.
  const supportAbove = (at: THREE.Vector3): number => {
    let result = 0;
    for (const leg of thighs) {
      if (leg.span < .20) continue;
      delta.subVectors(at, leg.origin);
      const height = delta.dot(localUp), along = delta.dot(leg.horizontal);
      const acrossSq = Math.max(0, delta.lengthSq() - height * height - along * along);
      const radius = .082;
      if (acrossSq >= radius * radius) continue;
      const chord = Math.sqrt(radius * radius - acrossSq);
      const reach = Math.min(leg.span, Math.max(0, along + chord * leg.rise / RIDER_BLOCKOUT.thighLength));
      const radicand = chord * chord - (reach - along) ** 2;
      if (radicand <= 0) continue;
      const top = leg.rise * reach / leg.span + Math.sqrt(radicand);
      result = Math.max(result, top - height);
    }
    return result;
  };
  const clear = (c: number, t: number): boolean => {
    for (let r = 0; r < rows; r++) {
      const i = r * columns + c, y = rest[i * 3 + 1]!;
      if (y > .16) break;
      point.fromArray(base, i * 3).addScaledVector(normal.fromArray(lift, i * 3), t * weight(y));
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
    if (layout.gravity) {
      // Ignore heading: only the pelvis's tilt relative to gravity matters.
      // The belt holds the fitted upper cloth; its lower edge hangs towards
      // world-down instead of remaining a rigid shelf on the leaning pelvis.
      localUp.copy(up).transformDirection(inversePelvis);
      // World translation and heading alone do not alter hanging cloth. The
      // epsilon ignores only matrix roundoff below a tenth of a nanometre;
      // compare to the last *drawn* pose so small changes cannot accumulate.
      let unchanged = gravityPoseValid && localUp.distanceToSquared(lastLocalUp) < 1e-20;
      for (let hip = 0; unchanged && hip < hips.length; hip++) {
        for (let element = 0; element < 16; element++) {
          if (Math.abs(intoHip[hip]!.elements[element]! - lastIntoHip[hip]!.elements[element]!) >= 1e-10) {
            unchanged = false; break;
          }
        }
      }
      if (wheel && layout.wheelBody) {
        layout.wheelBody.updateWorldMatrix(true, false);
        wheel.intoBody.copy(layout.wheelBody.matrixWorld).invert().multiply(pelvis.matrixWorld);
        if (unchanged) unchanged = wheel.intoBody.elements.every((value, i) =>
          Math.abs(value - lastIntoWheel.elements[i]!) < 1e-10);
        lastIntoWheel.copy(wheel.intoBody);
      }
      if (unchanged) return;
      lastLocalUp.copy(localUp);
      intoHip.forEach((matrix, index) => lastIntoHip[index]!.copy(matrix));
      gravityPoseValid = true;
      gravityTurn.setFromUnitVectors(up, localUp);
      const { anchorY } = layout.gravity;
      for (const { start, blend } of gravityRows) {
        weightedTurn.identity().slerp(gravityTurn, blend);
        for (let i = start; i < start + columns; i++) {
          original.fromArray(rest, i * 3);
          point.copy(original); point.y -= anchorY;
          point.applyQuaternion(weightedTurn); point.y += anchorY;
          point.toArray(base, i * 3);
        }
      }
      // The lining is a second face of the same cloth, not a second solve.
      for (let i = rows * columns; i < positions.count; i++) {
        const source = sources![i]!;
        if (source === i) continue;
        base[i * 3] = base[source * 3]!;
        base[i * 3 + 1] = base[source * 3 + 1]!;
        base[i * 3 + 2] = base[source * 3 + 2]!;
      }
      // A skirt resting on a thigh spreads outward across the horizontal
      // hem plane. The shirt's up-and-out correction would turn a supported
      // column into an upright wedge when the pelvis is heavily banked.
      for (let column = 0; column < columns; column++) {
        normal.fromArray(base, column * 3); normal.y -= anchorY;
        normal.addScaledVector(localUp, -normal.dot(localUp)).normalize();
        for (let row = 0; row < rows; row++) normal.toArray(lift, (row * columns + column) * 3);
      }
      for (let i = rows * columns; i < positions.count; i++) {
        const source = sources![i]!;
        if (source === i) continue;
        lift[i * 3] = lift[source * 3]!;
        lift[i * 3 + 1] = lift[source * 3 + 1]!;
        lift[i * 3 + 2] = lift[source * 3 + 2]!;
      }
    }
    for (let c = 0; c < radial; c++) {
      let t = 0;
      if (!clear(c, 0)) {
        let low = 0;
        for (t = .004; t < maxTravel && !clear(c, t); t += .004) low = t;
        t = Math.min(maxTravel, t);
        for (let k = 0; k < 4; k++) { const mid = (low + t) / 2; if (clear(c, mid)) t = mid; else low = mid; }
      }
      travel[c] = t;
    }
    // Never lower a column: a widened neighbourhood only softens the steps.
    for (let c = 0; c < radial; c++) {
      const before = travel[(c + radial - 1) % radial]!, after = travel[(c + 1) % radial]!;
      widened[c] = Math.max(travel[c]!, (before + 2 * travel[c]! + after) / 4);
      if (layout.gravity) {
        // Spread a thigh's support over a broad cloth panel, never an
        // isolated column that would read as a spike or narrow strip.
        const reach = Math.ceil(radial / 9);
        for (let offset = 1; offset <= reach; offset++) {
          const share = .5 + .5 * Math.cos(Math.PI * offset / (reach + 1));
          widened[c] = Math.max(widened[c]!,
            travel[(c + radial - offset) % radial]! * share,
            travel[(c + offset) % radial]! * share);
        }
      }
    }
    if (splitSeam) widened[radial] = widened[0]!;
    if (layout.gravity) {
      thighs.forEach((leg, i) => {
        const matrix = intoPelvis[i]!;
        leg.origin.setFromMatrixPosition(matrix);
        leg.horizontal.set(0, -RIDER_BLOCKOUT.thighLength, 0).applyMatrix4(matrix).sub(leg.origin);
        leg.rise = leg.horizontal.dot(localUp);
        leg.horizontal.addScaledVector(localUp, -leg.rise);
        leg.span = leg.horizontal.length();
        if (leg.span > 0) leg.horizontal.divideScalar(leg.span);
      });
      // Carry support into adjacent fabric. Each row keeps its own height
      // correction so a knee under the hem cannot lift the fitted waistband.
      support.fill(0); lifted.fill(0);
      if (thighs.some(leg => leg.span >= .20)) {
        for (const { start } of gravityRows) {
          for (let col = 0; col < radial; col++) {
            const i = start + col, y = rest[i * 3 + 1]!;
            point.fromArray(base, i * 3).addScaledVector(normal.fromArray(lift, i * 3), widened[col]! * weight(y));
            support[i] = supportAbove(point);
          }
        }
        for (const { start } of gravityRows) {
          for (let col = 0; col < radial; col++) {
            let height = support[start + col]!;
            for (let d = 1; d <= 5; d++) {
              const spread = .5 + .5 * Math.cos(Math.PI * d / 6);
              height = Math.max(height, spread * support[start + (col + d) % radial]!,
                spread * support[start + (col - d + radial) % radial]!);
            }
            lifted[start + col] = height;
          }
          if (splitSeam) lifted[start + radial] = lifted[start]!;
        }
      }
    }
    for (let i = 0; i < positions.count; i++) {
      original.fromArray(rest, i * 3);
      // A cloth fold is local, bounded, and changes nothing above the waist.
      const source = sources?.[i] ?? i;
      const t = source < rows * columns ? Math.min(maxTravel, widened[source % columns]!) * weight(original.y) : 0;
      point.fromArray(base, i * 3).addScaledVector(normal.fromArray(lift, i * 3), t);
      if (layout.gravity && source < outerCount) point.addScaledVector(localUp, lifted[source]!);
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
