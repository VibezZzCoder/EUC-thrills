/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** The actual original building-emission records, shared by the emitter and
 * its render-only extraction price. This does not read a replacement ledger. */
import { composeBuilding, type BuildingPiece } from '../data/buildingLooks.ts';
import { BUILDING_FACADE, BUILDING_TONES, PROP_COLOURS, PROP_SIZES, PROP_TINT_JITTER } from '../data/props.ts';
import type { PropPartId } from '../data/renderCost.ts';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { positionHash01 } from '../shared/maths.ts';

export function buildingSourceRecords(prop: Prop): readonly BuildingPiece[] {
  if (prop.kind !== 'building') return [];
  if (prop.look !== undefined) return composeBuilding({ position: prop.position, size: prop.size, look: prop.look });
  // This is the original untagged createProps branch: cap tint keeps the
  // original salt-7 structure jitter, and short optional towers stay suppressed.
  const size = prop.size ?? { x: 12, y: 18, z: 12 }, shape = PROP_SIZES.building;
  const x = prop.position.x, z = prop.position.z;
  const tone = BUILDING_TONES[Math.floor(positionHash01(x, z, 3) * BUILDING_TONES.length) % BUILDING_TONES.length];
  const jitter = 1 + (positionHash01(x, z, 5) * 2 - 1) * PROP_TINT_JITTER.building;
  const facade = (height: number): PropPartId => height >= BUILDING_FACADE.highRiseHeight ? 'buildingTall'
    : height >= BUILDING_FACADE.lowRiseHeight ? 'buildingBody' : 'buildingLow';
  const records: BuildingPiece[] = [
    { part: facade(size.y), x: 0, y: 0, z: 0, sx: size.x, sy: size.y, sz: size.z, yaw: 0, tone, jitter },
    { part: 'buildingCap', x: 0, y: size.y, z: 0, sx: size.x + shape.capOversail,
      sy: shape.capHeight, sz: size.z + shape.capOversail, yaw: 0, tone: PROP_COLOURS.buildingCap,
      jitter: 1 + (positionHash01(x, z, 7) * 2 - 1) * PROP_TINT_JITTER.structure },
  ];
  if (positionHash01(x, z, 9) > 0.55) {
    const height = size.y * shape.towerHeightFraction;
    const part: PropPartId = height >= BUILDING_FACADE.highRiseHeight ? 'buildingTall' : 'buildingBody';
    const floors = part === 'buildingTall' ? BUILDING_FACADE.highFloors : BUILDING_FACADE.lowFloors;
    if (height / floors >= BUILDING_FACADE.minFloorHeight) records.push({ part, x: 0, y: size.y + shape.capHeight, z: 0,
      sx: size.x * shape.towerWidthFraction, sy: height, sz: size.z * shape.towerWidthFraction, yaw: 0, tone, jitter });
  }
  return records;
}

export function buildingSourcePartCounts(plan: LevelPlan): ReadonlyMap<PropPartId, number> {
  const counts = new Map<PropPartId, number>();
  for (const prop of plan.props ?? []) for (const record of buildingSourceRecords(prop))
    counts.set(record.part, (counts.get(record.part) ?? 0) + 1);
  return counts;
}
