/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { RiderOccupancyPose } from './riderOccupancy.ts';
import { branchBefore } from './ragBasisSignBoundaryFixture.ts';
/** Actual native basis extraction, not invented quaternion leaves. These
 * particle columns represent a 180-degree frame whose opposite-sign y/z
 * axis crosses diagonal dominance. Mounted identity has exact dot=0. */
export function zeroDotPose(diagonal: number, blend = .5): RiderOccupancyPose {
  const values = Object.fromEntries(Object.keys(branchBefore).filter(key => key !== 'ragdoll').map(key => [key, 0])) as unknown as RiderOccupancyPose;
  const particles = new Float64Array(33), set = (index: number, x: number, y: number, z: number) => particles.set([x, y, z], index * 3);
  set(0, 0, 1, 0); set(1, 0, 1 + diagonal, -1); set(2, 0, 1 + 1.2 * diagonal, -1.2);
  set(3, -.2, 1 + .5 * diagonal, -.5); set(4, .2, 1 + .5 * diagonal, -.5);
  set(5, -.3, .7, -.8); set(6, .3, .7, -.8); set(7, -.4, .5, -.7); set(8, .4, .5, -.7);
  set(9, -.2, .2, 0); set(10, .2, .2, 0);
  return { ...values, ragdollBlend: blend, ragdoll: particles };
}
