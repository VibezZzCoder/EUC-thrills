/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LANDMARK_SIZES } from '../data/buildingLooks.ts';
import type { BuildingLook } from '../data/props.ts';
import { CAMERA } from '../data/tuning.ts';
import { fieldHeightAt } from './buildPlan.ts';
import { generateLevel } from './generateRoute.ts';
import type { LevelPlan, Prop } from './plan.ts';
import { createProvingGround } from './provingGround.ts';
import { centrelineAt, headingAt, querySegment, type PlacedSegment } from './segments.ts';
import { createSliceLevel } from './sliceLevel.ts';
import { createSwitchbackLevel } from './switchbackLevel.ts';
import { createTrackLevel } from './trackLevel.ts';
import {
  LANDMARK_CLEARANCE,
  LANDMARK_SIGHT_CONE,
  LANDMARK_SIGHT_GAP,
  LANDMARK_SIGHT_RANGE,
  ridingLine,
  silhouetteRadius,
  worstSightGap,
} from './townDressing.ts';

/**
 * M39 Phase 2 — readable districts. The predicates Phase 2 adds: looks never
 * reach a hand-authored world, every town has a yard of sheds and a landmark
 * per quarter, and every landmark is solid, off every corridor and clear of
 * every block, so a rider can reach it and cannot be trapped by it.
 */

// The seven-seed corpus every M39 measurement is recorded on.
const SEEDS = ['euc', 'route-41', 'sweep-15', 'euc-7', 'harbour-spark-42', 'x67', 'route-12'];
const LANDMARKS = Object.keys(LANDMARK_SIZES);
const towns = SEEDS.map((seed) => ({ seed, ...generateLevel(seed) }));
// Seeds whose landmarks stood worst before the sightline rule (Codex QA probe).
const SIGHT_SEEDS = ['sweep-4', 'sweep-12', 'sweep-19', 'sweep-39'];
const sightTowns = [...towns, ...SIGHT_SEEDS.map((seed) => ({ seed, ...generateLevel(seed) }))];

/** Distance outside the nearest corridor edge, with no bounds cull. */
function outsideAll(placed: readonly PlacedSegment[], x: number, z: number): number {
  let nearest = Infinity;
  for (const segment of placed) {
    const grown = { ...segment, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };
    const query = querySegment(grown, x, z);
    if (query !== null && query.outside < nearest) nearest = query.outside;
  }
  return nearest;
}

function corners(prop: Prop): [number, number][] {
  const size = prop.size!;
  const cos = Math.cos(prop.rotationY);
  const sin = Math.sin(prop.rotationY);
  const out: [number, number][] = [];
  for (const dx of [-size.x / 2, 0, size.x / 2]) {
    for (const dz of [-size.z / 2, 0, size.z / 2]) {
      out.push([prop.position.x + cos * dx + sin * dz, prop.position.z - sin * dx + cos * dz]);
    }
  }
  return out;
}

test('no hand-authored world carries a district look, so each draws exactly as before', () => {
  const worlds: [string, LevelPlan][] = [
    ['slice', createSliceLevel()],
    ['switchback', createSwitchbackLevel()],
    ['belvar', createTrackLevel()],
    ['proving', createProvingGround()],
  ];
  for (const [name, plan] of worlds) {
    const looked = (plan.props ?? []).filter((prop) => prop.look !== undefined);
    assert.equal(looked.length, 0, `${name} carries ${looked.length} props with a look`);
  }
});

test('every town carries one landmark per quarter, each solid, off every corridor and clear of every block', () => {
  for (const { seed, plan, layout } of towns) {
    const landmarks = (plan.props ?? []).filter((prop) => prop.look !== undefined && LANDMARKS.includes(prop.look));
    assert.deepEqual(landmarks.map((prop) => prop.look).sort(), [...LANDMARKS].sort(), `${seed}: landmarks`);
    const blocks = plan.segments.flatMap((segment) => segment.colliders);
    for (const landmark of landmarks) {
      // Solid: the builder derived a collider from the landmark's own footprint.
      const solid = (plan.solids ?? []).find((box) => Math.hypot(box.centre.x - landmark.position.x, box.centre.z - landmark.position.z) < 1e-6);
      assert.ok(solid !== undefined, `${seed}: ${landmark.look} has no collider`);
      assert.ok(Math.abs(solid.halfExtents.x - landmark.size!.x / 2) < 1e-6, `${seed}: ${landmark.look} collider width`);
      assert.ok(Math.abs(solid.halfExtents.z - landmark.size!.z / 2) < 1e-6, `${seed}: ${landmark.look} collider depth`);
      // Off every corridor by the landmark rule, measured with no bounds cull.
      for (const [x, z] of corners(landmark)) {
        const clear = outsideAll(layout.placed, x, z);
        assert.ok(clear >= LANDMARK_CLEARANCE - 1e-6, `${seed}: ${landmark.look} stands ${clear.toFixed(2)} m off a corridor`);
      }
      // Clear of every authored block — the return climb's ledge among them.
      for (const block of blocks) {
        const gap = Math.hypot(block.centre.x - landmark.position.x, block.centre.z - landmark.position.z)
          - Math.hypot(block.halfExtents.x, block.halfExtents.z) - Math.hypot(landmark.size!.x, landmark.size!.z) / 2;
        if (gap > 0) continue;
        assert.fail(`${seed}: ${landmark.look} stands within reach of an authored block`);
      }
    }
  }
});

test('the industrial quarter has a yard of sheds, one verge behind the kerb', () => {
  for (const { seed, plan, layout } of towns) {
    // Sheds are the low industrial bodies; the return beat's own blocks are 12 m and up.
    const sheds = (plan.props ?? []).filter((prop) => prop.look === 'industrial' && prop.size!.y < 10);
    assert.ok(sheds.length >= 3, `${seed}: ${sheds.length} sheds in the yard`);
    for (const shed of sheds) {
      for (const [x, z] of corners(shed)) {
        assert.ok(outsideAll(layout.placed, x, z) >= 7, `${seed}: a shed stands inside a road's shoulder`);
      }
    }
  }
});

test('no target stand is anywhere near the Phase 2 dressing', () => {
  // A stand needs 0.45 m of clear ground (`TARGET.standClearance`) and sits
  // within a metre of its corridor; everything Phase 2 adds is seven metres
  // and more beyond every corridor, so the target pass cannot have seen it.
  for (const { seed, plan } of towns) {
    const added = (plan.props ?? []).filter((prop) => prop.look !== undefined
      && (LANDMARKS.includes(prop.look) || (prop.look === 'industrial' && prop.size!.y < 10)));
    for (const target of plan.targets ?? []) {
      for (const prop of added) {
        // Distance to the footprint itself (the collider), not to a circle
        // round it: a long shed's circumscribed circle reaches metres past
        // its walls, and the front row now stands at the legal setback.
        const dx = target.base.x - prop.position.x;
        const dz = target.base.z - prop.position.z;
        const cos = Math.cos(prop.rotationY);
        const sin = Math.sin(prop.rotationY);
        const localX = cos * dx - sin * dz;
        const localZ = sin * dx + cos * dz;
        const gap = Math.hypot(Math.max(0, Math.abs(localX) - prop.size!.x / 2), Math.max(0, Math.abs(localZ) - prop.size!.z / 2));
        assert.ok(gap > 3, `${seed}: a target stands ${gap.toFixed(2)} m from new dressing`);
      }
    }
  }
});

/**
 * The narrowest angular gap between two landmarks' silhouettes, measured here
 * independently of `worstSightGap`: from every riding-line point where both
 * stand ahead inside the sight cone and range, the bearing difference less
 * both angular half-widths.
 */
function sightGap(line: readonly { x: number; z: number; heading: number }[], a: Prop, b: Prop): number {
  const radius = (prop: Prop) => silhouetteRadius(prop.look as BuildingLook, prop.size!);
  const off = (from: number, to: number) => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
  let worst = Infinity;
  for (const eye of line) {
    const [da, db] = [a, b].map((prop) => Math.hypot(prop.position.x - eye.x, prop.position.z - eye.z));
    if (da > LANDMARK_SIGHT_RANGE || db > LANDMARK_SIGHT_RANGE || da <= radius(a) || db <= radius(b)) continue;
    const [ba, bb] = [a, b].map((prop) => Math.atan2(prop.position.x - eye.x, prop.position.z - eye.z));
    if (off(eye.heading, ba) > LANDMARK_SIGHT_CONE || off(eye.heading, bb) > LANDMARK_SIGHT_CONE) continue;
    worst = Math.min(worst, off(ba, bb) - Math.asin(radius(a) / da) - Math.asin(radius(b) / db));
  }
  return worst;
}

test('no landmark stands in another\'s sightline from the riding line', () => {
  // Codex QA of Phase 2: on curated `euc` the water tower stood 42 m straight
  // behind the boiler house's chimneys on the yard approach. The pre-fix sites
  // are the failing control — the rule must see them overlap.
  const euc = towns[0];
  const line = ridingLine(euc.layout.placed, euc.layout.throughIds);
  const before = worstSightGap(line,
    { x: 2.457, z: -87.756, radius: silhouetteRadius('waterTower', LANDMARK_SIZES.waterTower) },
    { x: 5.032, z: -129.449, radius: silhouetteRadius('chimneys', LANDMARK_SIZES.chimneys) });
  assert.ok(before < 0, `the pre-fix euc water tower and chimneys read apart (${before})`);

  for (const { seed, plan, layout } of sightTowns) {
    const riding = ridingLine(layout.placed, layout.throughIds);
    const landmarks = (plan.props ?? []).filter((prop) => prop.look !== undefined && LANDMARKS.includes(prop.look));
    assert.equal(landmarks.length, LANDMARKS.length, `${seed}: landmarks`);
    for (let i = 0; i < landmarks.length; i += 1) {
      for (let j = i + 1; j < landmarks.length; j += 1) {
        const gap = sightGap(riding, landmarks[i], landmarks[j]);
        assert.ok(gap >= LANDMARK_SIGHT_GAP - 1e-9,
          `${seed}: ${landmarks[i].look} and ${landmarks[j].look} come within ${(gap * 180 / Math.PI).toFixed(1)}° in the rider's view`);
      }
    }
  }
});

test('the yard\'s sheds read from the chase camera on the yard road, over a cutting\'s bank', () => {
  // A 2 m eye (`CAMERA.armHeight`) above the finished ground on the yard road
  // and the 120 m of through line leading into it, looking along the riding
  // heading (±45°, 150 m). A shed reads when a ray reaches the upper half of
  // one of its walls without meeting the ground. The yard is the ring's last
  // station: every through segment after the kicker's landing up to the return
  // into the plaza, less the closing road.
  const RANGE = 150;
  const CONE = (45 * Math.PI) / 180;
  for (const { seed, plan, layout } of towns) {
    const ground = (x: number, z: number) => fieldHeightAt(plan.heightfield, plan.surround, x, z);
    const ids = layout.throughIds;
    let start = -1;
    ids.forEach((id, index) => { if (id.startsWith('kicker-land@')) start = index; });
    const end = ids.findIndex((id) => id.startsWith('return-plaza@'));
    const yard = ids.slice(start + 1, end + 1).filter((id) => !id.startsWith('close-'));
    assert.ok(yard.some((id) => id.startsWith('return-climb@')), `${seed}: the yard road`);
    const lead: string[] = [];
    for (let index = start, run = 0; index >= 0 && run < 120; index -= 1) {
      lead.unshift(ids[index]);
      run += layout.placed.find((segment) => segment.spec.id === ids[index])!.spec.length;
    }
    const eyes: { x: number; y: number; z: number; heading: number; inYard: boolean }[] = [];
    for (const id of [...lead, ...yard]) {
      const segment = layout.placed.find((candidate) => candidate.spec.id === id)!;
      for (let s = 0; s < segment.spec.length; s += 4) {
        const point = centrelineAt(segment.entry, segment.spec, s);
        eyes.push({ x: point.x, y: ground(point.x, point.z) + CAMERA.armHeight, z: point.z,
          heading: headingAt(segment.entry, segment.spec, s), inYard: yard.includes(id) });
      }
    }
    const clear = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
      for (let step = 1; step < steps; step += 1) {
        const f = step / steps;
        if (ground(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f) > a.y + (b.y - a.y) * f - 0.05) return false;
      }
      return true;
    };
    const sheds = (plan.props ?? []).filter((prop) => prop.look === 'industrial' && prop.size!.y < 10);
    const sees = (eye: typeof eyes[number], shed: Prop): boolean => {
      if (Math.hypot(shed.position.x - eye.x, shed.position.z - eye.z) > RANGE) return false;
      const bearing = Math.atan2(shed.position.x - eye.x, shed.position.z - eye.z);
      if (Math.abs(Math.atan2(Math.sin(bearing - eye.heading), Math.cos(bearing - eye.heading))) > CONE) return false;
      const y = shed.position.y + shed.size!.y / 2;
      return corners(shed).some(([x, z], index) => index !== 4 && clear(eye, { x, y, z }));
    };
    const read = sheds.filter((shed) => eyes.some((eye) => sees(eye, shed))).length;
    assert.ok(read >= 4 && read >= (sheds.length * 2) / 3, `${seed}: ${read} of ${sheds.length} sheds read from the road`);
    // And most of the ride through the yard has a shed in view — before the
    // fix `sweep-15` had none from anywhere on its yard road and `euc` a third.
    const yardEyes = eyes.filter((eye) => eye.inYard);
    const seeing = yardEyes.filter((eye) => sheds.some((shed) => sees(eye, shed))).length / yardEyes.length;
    assert.ok(seeing >= 0.4, `${seed}: a shed is in view from ${(seeing * 100).toFixed(0)}% of the yard road`);
  }
});
