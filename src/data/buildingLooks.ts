/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { deepFreeze } from '../shared/freeze.ts';
import { positionHash01 } from '../shared/maths.ts';
import {
  BUILDING_FACADE,
  DISTRICT_TONES,
  LANDMARK_TONES,
  PROP_COLOURS,
  PROP_SIZES,
  PROP_TINT_JITTER,
  type BuildingLook,
} from './props.ts';
import { buildingTowerPart, type PropPartId } from './renderCost.ts';

/**
 * What a building with a `look` is drawn from — M39 Phase 2, readable districts.
 *
 * **Plain data, shared by the renderer and the cost model.** `render/props.ts`
 * turns each piece into one instance of its part, and `data/renderCost.ts`
 * counts the same pieces, so the budget a generated town is admitted with is
 * the scene it builds by construction rather than by a second description.
 *
 * **What a look may change, and what it may not.** The building's footprint,
 * height and collider come from its metric `size` exactly as they always have
 * (`level/buildPlan.ts` derives the solid from it before anybody asks what it
 * looks like). A look chooses the tones, the roof, and — for a landmark — the
 * pieces that stand on or rise out of that box. Anything that reaches outside
 * the footprint does so well above a rider's head (a deck at 36 m, a tank at
 * 20 m), so no piece is a wall the collider does not know about.
 *
 * **Every piece is an existing part plus one.** Facade boxes and the plain
 * parapet box are the kit's own; `roofGable` is the one part Phase 2 adds — a pitched roof for
 * houses, several shallow ones in a row for a shed, two crossed at right
 * angles for a spire. It does not cast, so it costs one solo draw call and no
 * shadow call: the library bound becomes 70 + 90 = 160, exactly the ceiling.
 *
 * Deterministic from the prop's own position through `positionHash01`, the
 * hash every building tone already uses; never `Math.random`.
 */

/** One instance of one part, in the building's own frame (origin at its base). */
export interface BuildingPiece {
  readonly part: PropPartId;
  /** Local offset of the part's base centre, metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Local scale of the part's unit geometry. */
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** Local yaw, radians, applied after the scale. */
  readonly yaw: number;
  /** sRGB hex albedo. */
  readonly tone: number;
  /** Multiplier on the linear albedo — the per-instance jitter. */
  readonly jitter: number;
}

export interface LookedBuilding {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly size?: { readonly x: number; readonly y: number; readonly z: number };
  readonly look: BuildingLook;
}

/**
 * Landmark proportions, metres. Each landmark's collider is its `size` — the
 * shaft or the body a rider can actually meet — and every other dimension here
 * is drawn above or on top of it.
 */
export const LANDMARK_SIZES = deepFreeze({
  beacon: { x: 5, y: 48, z: 5 },
  steeple: { x: 11, y: 9, z: 24 },
  clockTower: { x: 7, y: 24, z: 7 },
  lookout: { x: 4.5, y: 16, z: 4.5 },
  waterTower: { x: 6.5, y: 20, z: 6.5 },
  chimneys: { x: 16, y: 9, z: 12 },
} satisfies Record<string, { x: number; y: number; z: number }>);

/** Which facade a body of this height wears — `data/renderCost.ts`'s own rule. */
export function facadeForHeight(height: number): PropPartId {
  if (height >= BUILDING_FACADE.highRiseHeight) return 'buildingTall';
  return height >= BUILDING_FACADE.lowRiseHeight ? 'buildingBody' : 'buildingLow';
}

const pick = (list: readonly number[], x: number, z: number, salt: number): number =>
  list[Math.floor(positionHash01(x, z, salt) * list.length) % list.length];

const jitterOf = (x: number, z: number, salt: number, amount: number): number =>
  1 + (positionHash01(x, z, salt) * 2 - 1) * amount;

/**
 * The pieces a building with a look is drawn from.
 *
 * The body (or a landmark's shaft) always comes first and always spans the
 * collider exactly, so the one thing a rider can touch is drawn where it is.
 */
export function composeBuilding(building: LookedBuilding): BuildingPiece[] {
  const size = building.size ?? { x: 12, y: 18, z: 12 };
  const { x: px, z: pz } = building.position;
  const out: BuildingPiece[] = [];
  const add = (
    part: PropPartId, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, tone: number, jitter = 1, yaw = 0,
  ): void => {
    out.push({ part, x, y, z, sx, sy, sz, yaw, tone, jitter });
  };
  const h = size.y;
  const bodyJitter = jitterOf(px, pz, 5, PROP_TINT_JITTER.building);
  const roofJitter = jitterOf(px, pz, 7, PROP_TINT_JITTER.structure);
  /** Two gables crossed at right angles: a pointed roof from one part. */
  const spire = (y: number, width: number, rise: number, tone: number): void => {
    add('roofGable', 0, y, 0, width, rise, width, tone);
    add('roofGable', 0, y, 0, width, rise, width, tone, 1, Math.PI / 2);
  };

  switch (building.look) {
    case 'commercial': {
      // The city look the owner accepted, in the district's own palette: the
      // same body, parapet and setback tower an untagged block gets.
      const tone = pick(DISTRICT_TONES.commercial.walls, px, pz, 3);
      add(facadeForHeight(h), 0, 0, 0, size.x, h, size.z, tone, bodyJitter);
      const cap = PROP_SIZES.building;
      add('buildingCap', 0, h, 0, size.x + cap.capOversail, cap.capHeight, size.z + cap.capOversail,
        PROP_COLOURS.buildingCap, roofJitter);
      const tower = buildingTowerPart(size, px, pz);
      if (tower !== null) {
        add(tower, 0, h + cap.capHeight, 0, size.x * cap.towerWidthFraction,
          h * cap.towerHeightFraction, size.z * cap.towerWidthFraction, tone, bodyJitter);
      }
      return out;
    }
    case 'residential': {
      // A house is a light wall under a pitched roof. The ridge runs along the
      // longer side, so a terrace row between two streets shows its gable ends
      // to both and a detached house its eaves to the pavement.
      add(facadeForHeight(h), 0, 0, 0, size.x, h, size.z,
        pick(DISTRICT_TONES.residential.walls, px, pz, 3), bodyJitter);
      const along = size.x >= size.z ? 'x' : 'z';
      const span = Math.min(size.x, size.z) + 0.8;
      const length = Math.max(size.x, size.z) + 0.8;
      const rise = Math.min(span * 0.42, 7);
      add('roofGable', 0, h, 0, span, rise, length,
        pick(DISTRICT_TONES.residential.roofs, px, pz, 11), roofJitter, along === 'x' ? Math.PI / 2 : 0);
      return out;
    }
    case 'industrial': {
      // A shed: painted sheeting under a row of shallow ridges that run away
      // from the street, so the street elevation is a saw-edged skyline no
      // office block has. `z` is along the street for every frontage prop.
      add(facadeForHeight(h), 0, 0, 0, size.x, h, size.z,
        pick(DISTRICT_TONES.industrial.walls, px, pz, 3), bodyJitter);
      const bays = Math.min(4, Math.max(1, Math.round(size.z / 10)));
      const bay = size.z / bays;
      const roof = pick(DISTRICT_TONES.industrial.roofs, px, pz, 11);
      for (let index = 0; index < bays; index += 1) {
        add('roofGable', 0, h, -size.z / 2 + bay * (index + 0.5), bay + 0.3,
          Math.min(2.6, bay * 0.3), size.x + 0.6, roof, roofJitter, Math.PI / 2);
      }
      return out;
    }
    case 'beacon': {
      // A TV tower: a pale shaft, a glazed deck near its top, and a mast in
      // red and white bands — the tallest thing in any town, ~70 m.
      const t = LANDMARK_TONES;
      add('buildingCap', 0, 0, 0, size.x, h, size.z, t.concrete);
      add('buildingLow', 0, h - 12, 0, size.x + 6, 6, size.z + 6, t.deck);
      add('buildingCap', 0, h - 6, 0, size.x + 7.4, 0.8, size.z + 7.4, t.white);
      add('buildingCap', 0, h, 0, size.x * 0.46, 8, size.z * 0.46, t.white);
      add('buildingCap', 0, h + 8, 0, size.x * 0.5, 2.2, size.z * 0.5, t.red);
      add('buildingCap', 0, h + 10.2, 0, size.x * 0.16, 9, size.z * 0.16, t.white);
      add('buildingCap', 0, h + 19.2, 0, size.x * 0.2, 2.4, size.z * 0.2, t.red);
      return out;
    }
    case 'steeple': {
      // A church: a stone nave under slate, a square tower at the street end
      // (inside the footprint) and a copper spire, ~40 m.
      const t = LANDMARK_TONES;
      add('buildingLow', 0, 0, 0, size.x, h, size.z, t.stone);
      add('roofGable', 0, h, 0, size.x + 0.8, Math.min(size.x * 0.6, 7), size.z + 0.8, t.slate);
      const towerZ = size.z / 2 - 3.2;
      add('buildingCap', 0, 0, towerZ, 6, h + 14, 6, t.stone);
      add('buildingLow', 0, h + 14, towerZ, 6.6, 4, 6.6, t.stone);
      add('buildingCap', 0, h + 18, towerZ, 7.2, 0.6, 7.2, t.white);
      add('roofGable', 0, h + 18.6, towerZ, 6.2, 13, 6.2, t.copper);
      add('roofGable', 0, h + 18.6, towerZ, 6.2, 13, 6.2, t.copper, 1, Math.PI / 2);
      return out;
    }
    case 'clockTower': {
      // A gatehouse clock tower: stone shaft, a glazed clock stage wrapping its
      // top, a cornice and a copper roof, ~34 m.
      const t = LANDMARK_TONES;
      add('buildingCap', 0, 0, 0, size.x, h, size.z, t.stone);
      add('buildingLow', 0, h - 5, 0, size.x + 1, 5, size.z + 1, t.white);
      add('buildingCap', 0, h, 0, size.x + 1.8, 0.7, size.z + 1.8, t.stone);
      spire(h + 0.7, size.x + 1, 9.5, t.copper);
      return out;
    }
    case 'lookout': {
      // A fire lookout: a timber tower, a glazed cabin and a tiled roof, ~24 m.
      const t = LANDMARK_TONES;
      add('buildingCap', 0, 0, 0, size.x, h, size.z, t.timber);
      add('buildingLow', 0, h, 0, size.x + 2.5, 3.4, size.z + 2.5, t.white);
      spire(h + 3.4, size.x + 3.5, 4, t.tile);
      return out;
    }
    case 'waterTower': {
      // A water tank on a brick tower, the tank wider than the tower it
      // stands on, ~31 m. The tank is two plain boxes turned 45° to each
      // other, which reads as a round, riveted drum from every side at the
      // distance a rider sees it — and, unlike a scaled litter bin, casts no
      // shadow a building's own body does not (no building part casts).
      const t = LANDMARK_TONES;
      add('buildingCap', 0, 0, 0, size.x, h, size.z, t.brick);
      const drum = size.x * 1.35;
      const tankHeight = 8;
      for (const turn of [0, Math.PI / 4]) {
        add('buildingCap', 0, h, 0, drum, tankHeight, drum, t.tank, 1, turn);
        add('buildingCap', 0, h + tankHeight - 0.9, 0, drum + 0.5, 0.9, drum + 0.5, t.galvanised, 1, turn);
      }
      spire(h + tankHeight, drum + 0.4, 3.2, t.galvanised);
      add('roofGable', 0, h + tankHeight, 0, drum + 0.4, 3.2, drum + 0.4, t.galvanised, 1, Math.PI / 4);
      add('roofGable', 0, h + tankHeight, 0, drum + 0.4, 3.2, drum + 0.4, t.galvanised, 1, -Math.PI / 4);
      return out;
    }
    case 'chimneys': {
      // A boiler house and two tall brick chimneys rising out of its roof,
      // ~35 m. Both chimneys stand inside the footprint.
      const t = LANDMARK_TONES;
      add(facadeForHeight(h), 0, 0, 0, size.x, h, size.z,
        pick(DISTRICT_TONES.industrial.walls, px, pz, 3), bodyJitter);
      add('roofGable', 0, h, 0, size.z + 0.6, 3, size.x + 0.6, t.galvanised, 1, Math.PI / 2);
      for (const side of [-1, 1]) {
        const cx = side * size.x * 0.28;
        add('buildingCap', cx, 0, size.z * 0.15, 2.6, h + 26, 2.6, t.brick);
        add('buildingCap', cx, h + 24.5, size.z * 0.15, 3.1, 1.5, 3.1, t.slate);
      }
      return out;
    }
    default:
      return out;
  }
}
