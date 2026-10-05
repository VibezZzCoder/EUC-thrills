/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** GPU-free mirror of the fixed population part/finish batches. This is a
 * presentation price of the supplied roster, never a roster selector.
 * The proposed reconciliation control compares it with the actual factory.
 */
import type { PopulationPlan } from '../level/populationPlan.ts';
import { STANDARD_MACHINE_LOOK } from './machineLook.ts';

export interface SupplementCount {
  readonly colourDraws: number;
  readonly shadowDraws: number;
  readonly colourTriangles: number;
  readonly shadowTriangles: number;
  readonly geometryBytes: number;
  readonly instanceBytes: number;
  readonly textureBytes: number;
}
interface Shape { vertices: number; indices: number; stride: number }
const shape = (vertices: number, indices: number, stride = 44): Shape => ({ vertices, indices, stride });
const loft = (rows: number, radial: number, caps = 2): Shape => shape(rows * radial + caps,
  (2 * radial * (rows - 1) + radial * caps) * 3);
const patch = (u = 8, v = 4): Shape => shape(2 * (u + 1) * (v + 1) + 8 * (u + v),
  (4 * u * v + 4 * (u + v)) * 3);
const cylinder = (radial: number, stride = 44): Shape => shape(6 * radial + 4, 12 * radial, stride);
const box = (stride = 32): Shape => shape(24, 36, stride);
function merge(...parts: Shape[]): Shape {
  if (parts.some(part => part.stride !== parts[0].stride)) throw new Error('Population price merge stride mismatch');
  return shape(parts.reduce((sum, part) => sum + part.vertices, 0),
    parts.reduce((sum, part) => sum + part.indices, 0), parts[0].stride);
}
function bytes(part: Shape): number {
  return part.vertices * part.stride + part.indices * (part.vertices - 1 >= 65535 ? 4 : 2);
}
const HUMAN: Readonly<Record<string, Shape>> = {
  torso: loft(6, 16), pelvis: loft(4, 14), upperLeg: loft(5, 12), lowerLeg: loft(5, 12),
  upperArm: loft(5, 12), forearm: loft(5, 12), hand: loft(4, 12), head: loft(6, 18),
  hair: loft(4, 18), shoe: loft(4, 16), sole: loft(2, 16), nose: loft(3, 10),
  round: shape(88, 360, 32), box: box(),
};
const WINDOW = patch(12, 6);
const VEHICLE: Readonly<Record<string, Shape>> = {
  hull: loft(5, 20), cabin: loft(4, 20), windshield: WINDOW, rearWindow: WINDOW,
  sideWindow: merge(WINDOW, WINDOW), sidePassenger: merge(WINDOW, WINDOW),
  tyre: cylinder(20, 32), rim: merge(loft(4, 16), ...Array.from({ length: 6 }, () => box(44))),
};
/** Standard euc.ts uses these fixed original profiles (7/7/7/4/4 rings),
 * capped cylinders and unchanged path patches. No custom look or atlas is
 * admissible here; the live owner also refuses any template texture.
 */
function machineShapes(): Readonly<Record<string, Shape>> {
  if (STANDARD_MACHINE_LOOK.atlas || STANDARD_MACHINE_LOOK.shell.profile || STANDARD_MACHINE_LOOK.tyre?.lugs || STANDARD_MACHINE_LOOK.pads?.blocks || STANDARD_MACHINE_LOOK.pads?.segments || STANDARD_MACHINE_LOOK.pads?.art
    || STANDARD_MACHINE_LOOK.top.kind !== 'handle') throw new Error('Population price needs the original texture-free standard EUC');
  const pad = loft(7, 12), pedal = merge(loft(4, 14), box(44), box(44), box(44), cylinder(8));
  return {
    'euc-tyre': merge(loft(7, 20, 0), cylinder(20), cylinder(16)),
    'euc-suspension': merge(cylinder(12), cylinder(10), cylinder(10)),
    'euc-shell': merge(loft(7, 28), box(44), box(44), box(44), cylinder(10), cylinder(10)),
    'euc-accent': merge(...STANDARD_MACHINE_LOOK.trim.patches.map(p => patch(p.uSegments, p.vSegments))),
    'euc-pad-left': pad, 'euc-pad-right': pad,
    'euc-pedal-left': pedal, 'euc-pedal-right': pedal,
    'euc-headlight': merge(...STANDARD_MACHINE_LOOK.headlight.patches.map(p => patch(p.uSegments, p.vSegments))),
    'euc-taillight': STANDARD_MACHINE_LOOK.taillight
      ? merge(...STANDARD_MACHINE_LOOK.taillight.patches.map(p => patch(p.uSegments, p.vSegments))) : patch(6, 2),
    'euc-status-light': loft(4, 12),
  };
}
export function countPopulation(plan: PopulationPlan | null): SupplementCount {
  const batches = new Map<string, { shape: Shape; casts: boolean; instances: number }>();
  const add = (id: string, geometry: Shape, casts: boolean, count = 1) => {
    const prior = batches.get(id);
    if (prior && prior.casts !== casts) throw new Error('Population price cast flag collision');
    batches.set(id, { shape: geometry, casts, instances: (prior?.instances ?? 0) + count });
  };
  const human = (geometry: string, finish: string, count = 1, casts = false) =>
    add(`human-${geometry}-${finish}`, HUMAN[geometry], casts, count);
  const van = (geometry: string, finish: string, count = 1, casts = false) =>
    add(`vehicle-${geometry}-${finish}`, VEHICLE[geometry], casts, count);
  for (const spec of plan?.actors ?? []) {
    const vehicle = spec.kind === 'parkedVehicle' || spec.kind === 'serviceVehicle' || spec.kind === 'trafficVehicle';
    if (vehicle) {
      const passenger = spec.kind === 'trafficVehicle' || (spec.kind === 'parkedVehicle' && spec.appearanceIndex % 2 !== 0);
      van('hull', 'paint', 1, true); van('cabin', 'paint', 1, true);
      van('windshield', 'glass'); van('sideWindow', 'glass');
      if (passenger) { van('sidePassenger', 'glass'); van('rearWindow', 'glass'); }
      van('tyre', 'rubber', 4, true); van('rim', 'metal', 4);
      human('box', 'paint', passenger ? 5 : 7); // mirrors, plates, ridge, optional service bands
      human('box', 'glass', 2); human('box', 'metal', 2); human('box', 'lens', 4);
      human('box', 'rubber', 5); // door seams, bumpers and grille
    } else {
      human('torso', 'cloth', 1, true); human('pelvis', 'cloth'); human('head', 'skin', 1, true);
      human('hair', 'hair'); human('nose', 'skin'); human('round', 'skin', 3);
      human('box', 'skin'); human('box', 'cloth', 5);
      human('upperLeg', 'cloth', 2, true); human('lowerLeg', 'cloth', 2, true);
      human('upperArm', 'cloth', 2); human('forearm', 'skin', 2); human('hand', 'skin', 2);
      human('shoe', 'rubber', 2); human('sole', 'rubber', 2); human('round', 'glass', 2); human('box', 'hair', 2);
      if (spec.kind === 'worker') { human('sole', 'paint'); human('box', 'cloth'); human('box', 'paint'); human('box', 'metal'); }
      if (spec.kind === 'fictionalEuc') for (const [name, geometry] of Object.entries(machineShapes())) {
        add(`population-${name}`, geometry, name === 'euc-tyre' || name === 'euc-shell');
      }
    }
  }
  let colourDraws = 0, shadowDraws = 0, colourTriangles = 0, shadowTriangles = 0, geometryBytes = 0, instanceBytes = 0;
  for (const { shape: geometry, casts, instances } of batches.values()) {
    colourDraws++; if (casts) shadowDraws++;
    const triangles = geometry.indices / 3 * instances;
    colourTriangles += triangles; if (casts) shadowTriangles += triangles;
    geometryBytes += bytes(geometry); instanceBytes += 76 * instances;
  }
  return { colourDraws, shadowDraws, colourTriangles, shadowTriangles, geometryBytes, instanceBytes, textureBytes: 0 };
}
