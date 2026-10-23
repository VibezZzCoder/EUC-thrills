/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Presentation-only vehicle variety for the outdoor population (2026-10-22).
 *
 * Every vehicle keeps the one physical hull the plan gives it (2.04 × 4.8 ×
 * 2.8 m, `POPULATION_AUTHORING`). The body drawn inside that hull is chosen
 * here, deterministically from the actor ids, and only ever reaches the GPU
 * view and its price — never the simulation, a digest or a seed record.
 *
 * **Why only tall bodies.** The hull is a solid prism from the ground to
 * 2.8 m, so a rider launched over a low hatchback would hit air above its
 * roof. Every body here therefore fills that height honestly: a high-roof
 * delivery van (2.50 m), a passenger minibus (2.42 m) and a small box truck
 * whose box reaches the full 2.80 m. Footprints fill the hull's width and
 * length exactly (mirrors, rims and bumpers reach them), as before.
 *
 * One part list per body feeds both the factory (`populationView.ts`) and the
 * GPU-free price (`populationPrice.ts`), so the two cannot drift apart.
 */
import type { ActorKind, ActorSpec } from '../level/populationPlan.ts';

export type PopulationVehicleBody = 'deliveryVan' | 'minibus' | 'boxTruck';
export type PopulationVehicleFinish = 'paint' | 'glass' | 'rubber' | 'metal' | 'lens';
/** Which colour a part takes: the body's own paint, its livery trim, the truck's box, or a fixed hex. */
export type VehicleColourRole = 'body' | 'trim' | 'cargo' | number;

export interface VehiclePartSpec {
  /** Pose key inside one vehicle's part record. */
  readonly key: string;
  /** `vehicle` families are vehicle-only geometry; `human` boxes share the people's box batches. */
  readonly family: 'vehicle' | 'human';
  readonly geometry: string;
  readonly finish: PopulationVehicleFinish;
  readonly casts: boolean;
  readonly colour: VehicleColourRole;
}

/** Drawn heights, metres. The hull stays 2.8 m; the box truck fills it. */
export const VEHICLE_BODY_HEIGHT: Readonly<Record<PopulationVehicleBody, number>> = Object.freeze({
  deliveryVan: 2.50, minibus: 2.42, boxTruck: 2.80,
});

/** Fixed part colours (sRGB). Glass reads as dark tinted, never transparent. */
export const VEHICLE_COLOURS = Object.freeze({
  glass: 0x46596a, mirrorGlass: 0x5f7380, tyre: 0x45494e, rim: 0x9aa2a6, arch: 0x2c3034,
  headlamp: 0xc9cdc0, taillamp: 0xa3463a, rubber: 0x4d5358, grille: 0x3b4248, plate: 0xc2c6bc,
  handle: 0x8d969a, seam: 0x40474d, chrome: 0x9ca4a8,
});

const kindIsVehicle = (kind: ActorKind | string): boolean =>
  kind === 'parkedVehicle' || kind === 'serviceVehicle' || kind === 'trafficVehicle';

/** FNV-1a, 32 bit. Stable across runs and platforms; no Math.random anywhere. */
export function populationHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const BODY_CYCLE: readonly PopulationVehicleBody[] = Object.freeze(['deliveryVan', 'boxTruck', 'minibus']);

/**
 * Body per vehicle actor. Vehicles are ranked by the hash of their id and dealt
 * the three bodies in turn, so even a world with three vans shows all three
 * shapes; the starting body comes from the first id's hash. A service vehicle
 * is a working vehicle: dealt a minibus, it drives a delivery van instead.
 * Pure function of the roster's ids and kinds.
 */
export function assignVehicleBodies(actors: readonly Pick<ActorSpec, 'id' | 'kind'>[]): ReadonlyMap<string, PopulationVehicleBody> {
  const vehicles = actors.filter(actor => kindIsVehicle(actor.kind))
    .map(actor => ({ actor, hash: populationHash(actor.id) }))
    .sort((a, b) => a.hash - b.hash || (a.actor.id < b.actor.id ? -1 : a.actor.id > b.actor.id ? 1 : 0));
  const out = new Map<string, PopulationVehicleBody>();
  const offset = vehicles.length > 0 ? vehicles[0]!.hash % BODY_CYCLE.length : 0;
  vehicles.forEach(({ actor }, rank) => {
    const dealt = BODY_CYCLE[(rank + offset) % BODY_CYCLE.length]!;
    out.set(actor.id, actor.kind === 'serviceVehicle' && dealt === 'minibus' ? 'deliveryVan' : dealt);
  });
  return out;
}

/**
 * Body paints (sRGB): the town's muted vocabulary, but distinct from one
 * another at chase distance — a white fleet van, silver, slate, brick red,
 * bottle green, ochre, teal, navy, charcoal and a municipal orange.
 */
export const VEHICLE_BODY_PAINTS: readonly number[] = Object.freeze([
  0xbec2ba, 0xa2a8aa, 0x5c7891, 0x8e4536, 0x4c6a55, 0xae893f, 0x3f7370, 0x3b4b66, 0x52585e, 0xb06a3c,
]);
/** Livery stripes and minibus roofs: pale and saturated accents that sit on any body paint. */
export const VEHICLE_TRIM_PAINTS: readonly number[] = Object.freeze([
  0xd3d4cc, 0xb8a05a, 0x9c4a3e, 0x5d84a0, 0x6e8f5c, 0xc07c44,
]);
/** A box truck's box is a plain fleet panel: white, cream or light grey. */
export const VEHICLE_CARGO_PAINTS: readonly number[] = Object.freeze([0xc6c9c2, 0xc2b99f, 0xaeb3b2]);

export interface VehiclePaint { readonly body: number; readonly trim: number; readonly cargo: number }
/** Deterministic paints per vehicle id; a trim never repeats its own body paint. */
export function vehiclePaint(id: string): VehiclePaint {
  const hash = populationHash(`${id}#paint`);
  const body = VEHICLE_BODY_PAINTS[hash % VEHICLE_BODY_PAINTS.length]!;
  let trim = VEHICLE_TRIM_PAINTS[(hash >>> 8) % VEHICLE_TRIM_PAINTS.length]!;
  if (trim === body) trim = VEHICLE_TRIM_PAINTS[((hash >>> 8) + 1) % VEHICLE_TRIM_PAINTS.length]!;
  return { body, trim, cargo: VEHICLE_CARGO_PAINTS[(hash >>> 16) % VEHICLE_CARGO_PAINTS.length]! };
}

const C = VEHICLE_COLOURS;
const part = (key: string, family: 'vehicle' | 'human', geometry: string, finish: PopulationVehicleFinish,
  colour: VehicleColourRole, casts = false): VehiclePartSpec => Object.freeze({ key, family, geometry, finish, casts, colour });
const pair = (key: string, family: 'vehicle' | 'human', geometry: string, finish: PopulationVehicleFinish,
  colour: VehicleColourRole, casts = false): VehiclePartSpec[] =>
  ['l', 'r'].map(side => part(`${side}-${key}`, family, geometry, finish, colour, casts));
const wheels = (): VehiclePartSpec[] => ['l', 'r'].flatMap(side => ['front', 'rear'].flatMap(axle => [
  part(`${side}-${axle}-tyre`, 'vehicle', 'tyre', 'rubber', C.tyre, true),
  part(`${side}-${axle}-rim`, 'vehicle', 'rim', 'metal', C.rim),
]));
/** The cab every body shares: shell, glazing, lamps, mirrors and front end. */
const front = (): VehiclePartSpec[] => [
  part('hull', 'vehicle', 'hull', 'paint', 'body', true),
  part('cabin', 'vehicle', 'cabin', 'paint', 'body', true),
  part('windshield', 'vehicle', 'windshield', 'glass', C.glass),
  part('sideWindows', 'vehicle', 'sideWindow', 'glass', C.glass),
  ...wheels(),
  ...pair('front-arch', 'vehicle', 'arch', 'rubber', C.arch),
  ...pair('mirror', 'human', 'box', 'paint', 'body'),
  ...pair('mirror-glass', 'human', 'box', 'glass', C.mirrorGlass),
  ...pair('headlamp', 'human', 'box', 'lens', C.headlamp),
  ...pair('handle', 'human', 'box', 'metal', C.handle),
  part('grille', 'human', 'box', 'rubber', C.grille),
  part('front-bumper', 'human', 'box', 'rubber', C.rubber),
  part('front-plate', 'human', 'box', 'paint', C.plate),
];
/** A van's back half: rear arches, sliding door, rear doors and lamps. */
const vanBack = (): VehiclePartSpec[] => [
  ...pair('rear-arch', 'vehicle', 'arch', 'rubber', C.arch),
  ...pair('taillamp', 'human', 'box', 'lens', C.taillamp),
  ...pair('door-seam', 'human', 'box', 'rubber', C.seam),
  ...pair('slide-seam', 'human', 'box', 'rubber', C.seam),
  ...pair('slide-handle', 'human', 'box', 'metal', C.handle),
  ...pair('side-rub', 'human', 'box', 'rubber', C.rubber),
  part('rear-seam', 'human', 'box', 'rubber', C.seam),
  part('rear-bumper', 'human', 'box', 'rubber', C.rubber),
  part('rear-plate', 'human', 'box', 'paint', C.plate),
];

const PARTS: Readonly<Record<PopulationVehicleBody, readonly VehiclePartSpec[]>> = Object.freeze({
  deliveryVan: Object.freeze([...front(), ...vanBack(),
    ...pair('livery', 'human', 'box', 'paint', 'trim')]),
  minibus: Object.freeze([...front(), ...vanBack(),
    part('sidePassenger', 'vehicle', 'sidePassenger', 'glass', C.glass),
    part('rearWindow', 'vehicle', 'rearWindow', 'glass', C.glass),
    ...pair('pillar', 'human', 'box', 'paint', 'body'),
    ...pair('roof-rail', 'human', 'box', 'metal', C.chrome),
    ...pair('waist-stripe', 'human', 'box', 'paint', 'trim')]),
  boxTruck: Object.freeze([...front(),
    // The rear-side glass on the short cab is its door window.
    part('sidePassenger', 'vehicle', 'sidePassenger', 'glass', C.glass),
    part('box', 'vehicle', 'box', 'paint', 'cargo', true),
    part('peak', 'vehicle', 'box', 'paint', 'cargo', true),
    ...pair('top-rail', 'human', 'box', 'metal', C.chrome),
    ...pair('sill-rail', 'human', 'box', 'metal', C.chrome),
    ...['l', 'r'].flatMap(side => ['front', 'rear'].map(end => part(`${side}-${end}-post`, 'human', 'box', 'metal', C.chrome))),
    ...[0, 1, 2].map(index => part(`door-slat-${index}`, 'human', 'box', 'rubber', C.seam)),
    part('door-handle', 'human', 'box', 'metal', C.handle),
    part('chassis', 'human', 'box', 'rubber', C.arch),
    part('underrun', 'human', 'box', 'rubber', C.rubber),
    ...pair('mudguard', 'human', 'box', 'rubber', C.arch),
    ...pair('side-guard', 'human', 'box', 'metal', C.handle),
    ...pair('taillamp', 'human', 'box', 'lens', C.taillamp),
    ...pair('cab-seam', 'human', 'box', 'rubber', C.seam),
    part('rear-plate', 'human', 'box', 'paint', C.plate),
    ...pair('livery', 'human', 'box', 'paint', 'trim')]),
});

export function vehicleBodyParts(body: PopulationVehicleBody): readonly VehiclePartSpec[] { return PARTS[body]; }
