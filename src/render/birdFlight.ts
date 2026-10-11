/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M42 — the render-only flock's flight, GPU-free (`docs/PLANS.md` §42.2j, §42.3b).
 *
 * A few birds flying high that never land and touch nothing. Everything here
 * is plain arithmetic over the immutable plan, so it is Node-testable and the
 * price (`countBirds`) is known before any GPU allocation:
 *
 * - **Eligibility** is plan data only (invariant 22): a world with at least one
 *   building, broadleaf, conifer or tree-canopy prop gets one flock. The
 *   proving ground and test fixtures get none, and nothing is allocated.
 * - **The skyline** is a `skylineCellMetres` grid built once: building
 *   pieces (the same records the prop owner emits) as their own turned
 *   footprints plus an eave, every other prop's vertical span × scale as a
 *   disc, collider and solid tops, and the heightfield's highest sample per
 *   cell, then dilated by `BIRDS.skylineRadiusMetres` (a disc of whole cells,
 *   a few row passes) so one look-up answers "the tallest thing within reach
 *   of any bird of the formation".
 * - **A pass crosses one rider's view** (M42 R13 and the birds critic: a
 *   flock must really be seen; R17, the owner "never saw" one: a readable
 *   pass every minute or two, lower, a few more and bigger birds, still
 *   absent most of the time). At its start the flock is born for the view
 *   that has waited longest for a flock (ties: pass index mod the view count,
 *   so every couch seat gets its turn), `birthBearingRadians` off that
 *   rider's travel on a hashed side (ahead of his shoulder), `CAMERA.far` +
 *   `entryMarginMetres` from **every** camera. While far it **steers** —
 *   proportionally past a deadband, at most `steerRadiansPerSecond` — to
 *   intercept a point the crossing depth in front of where that rider will be
 *   when it gets there: his own road (`walkRoad`, the plan's segment
 *   centrelines) walked ahead at his speed for the flock's own time to that
 *   point. It flies at 14 m/s wherever a pane can frame it; beyond
 *   `farRateFromMetres` of every camera (owner round 2: twice as often) its
 *   own clock runs `farRate` times faster — the same path, turns and climbs,
 *   flown sooner in the haze — easing back by `farRateToMetres`, beyond
 *   `framedMetres`. It flies straight on (commits) only
 *   where that pane will show it (the birds critic, r4): inside his pane's own
 *   width (its camera's `fov` and `aspect`) and near, or a little further
 *   while its crossing lies within `crossOffRadians` of his forward, or nearer
 *   still beside him, or nearly at its crossing — never while it is behind
 *   him; otherwise it keeps re-aiming on the same eased turn. A pass its
 *   rider has not seen (`sees`: in his frame, near enough to read, a clear
 *   line) that trails him, closing slower than `relayClosingMetresPerSecond`,
 *   or would retire, is **born again** ahead of his shoulder, out of sight
 *   (at most `relayMax` times; the flock is parked a moment between). After
 *   `lingerSeconds` — or, closing on him, within `bankAwayNearMetres`, or as
 *   soon as he has seen it while another pane waits for one — it banks away
 *   out of his view to the side it is on, again if he follows it, and it
 *   retires once beyond every far plane or, having flown straight a moment,
 *   as soon as no pane can show it (`unseen`: outside every view's frustum
 *   widened by `viewMarginRadians`), so a pass never hangs on behind him.
 *   **Nothing steps** (the birds critic, r2: a one-frame bank flip
 *   blinked the whole flock; r3, 2c: a held pitch and a clamped altitude hopped
 *   it): the turn rate slews at most `turnSlewRadiansPerSecondSquared`, the
 *   bank at most `bankSlewRadiansPerSecond`, a turn the other way needs more
 *   than `steerReverseRadians` of error (`steerReverseWatchedRadians` where
 *   its rider can see it: within `framedMetres`, or anywhere inside
 *   `watchedConeRadians` of his view); the altitude follows what it wants
 *   with a vertical speed (`climbMetresPerSecond`, `descentMetresPerSecond`)
 *   slewed by `verticalAccelerationMetresPerSecondSquared`, and the pitch
 *   follows that vertical speed, capped and slewed; a frame between two steps
 *   interpolates heading, bank and pitch and runs the altitude on at its
 *   vertical speed. **Just above the roofline** (r4): what it wants looks
 *   ahead only along the corridor it will fly — its steering run forward, a
 *   `pathMarginMetres` either side — at its full climb rate, with
 *   `steeredLeadMetres` held at full height; a narrow fan only while it still
 *   pursues. A turn (after its aim, or a bank-away) waits until it already
 *   flies high enough for that way, so it rises before a tall block, never
 *   through it, and settles back down right after one. A pass no pane framed
 *   (`noteFramed`), or one after which a pane has waited `starvedSeconds`, is
 *   followed by `unseenGapSeconds`, not the ordinary quiet, so the next one
 *   comes soon. The steering is integrated in fixed
 *   `steerStepSeconds` steps on the world clock, so the same seconds and
 *   cameras give the same flock at any frame rate. With no view to aim at (an
 *   instrument, a test) the pass is a chord across the field through the box
 *   centre ± a hashed quarter of each extent, entering and leaving that
 *   distance (plus the meander) from the heightfield box, its altitude a
 *   profile along it climbing at most `climbSlope`.
 * - **The clock** is the world's own (`BirdFlightClock`): its epoch is the
 *   first update after the world was built, it is fed the simulation clock,
 *   and the camera guard defers a pass start or end while any view camera is
 *   within the far plane plus the flock radius of that point.
 *
 * Hashes are `positionHash01` with salts no other caller uses (9421–9435, 9437), and
 * the world is keyed from the heightfield's origin and size, never a level id.
 * Nothing here reads a seed stream or writes the plan.
 */
import { BIRDS, CAMERA, PHYSICS } from '../data/tuning.ts';
import { PROP_VERTICAL_SPANS } from '../data/props.ts';
import type { LevelPlan } from '../level/plan.ts';
import { positionHash01 } from '../shared/maths.ts';
import { buildingSourceRecords } from './buildingSourceRecords.ts';
import type { SupplementCount } from './populationPrice.ts';

/** New salts (grep: nothing else hashes with 9421–9435 or 9437). */
const SALT = Object.freeze({
  world: 9421, centreX: 9422, centreZ: 9423, heading: 9424, meander: 9425, gap: 9426,
  forward: 9427, lateral: 9428, vertical: 9429, wanderHz: 9430, wanderPhase: 9431,
  flapPhase: 9432, cycle: 9433, crossDepth: 9434, birthBearing: 9435, crossSide: 9437,
});

/**
 * What a flock's clock reads from `BIRDS`. The game always passes `BIRDS`
 * itself; an instrument may pass a variant to compare cadences on one ride.
 */
export interface BirdClockTuning {
  readonly quietStartSeconds: number;
  readonly gapSeconds: readonly [number, number];
  readonly unseenGapSeconds: readonly [number, number];
  readonly crossDepthMetres: readonly [number, number];
}

/** View cameras whose motion the clock tracks (a couch has at most four panes). */
const MAX_VIEWS = 4;
/** A camera that moves faster than this between two frames was placed, not ridden, m/s: its speed restarts at zero. */
const PLACED_METRES_PER_SECOND = 40;
/** The camera speed estimate follows each frame's motion over about this long, s. */
const VELOCITY_SECONDS = 0.6;
/** Floats per view in the clock's motion record. */
const MOTION_FLOATS = 7;
/** A rider slower than this (smoothed) is standing: his camera's heading stands for his travel, m/s. */
const MOVING_METRES_PER_SECOND = 2;
/** Road centreline samples are this far apart, m. */
const ROAD_SAMPLE_METRES = 4;
/** A road walk snaps a step to a centreline sample within this, m, that continues within `ROAD_TURN_RADIANS`. */
const ROAD_SNAP_METRES = 8;
const ROAD_TURN_RADIANS = 0.8;
/** The wingspan the half-bird template is drawn at; it is scaled to `BIRDS.wingspanMetres`. */
const TEMPLATE_WINGSPAN_METRES = 1.8;

/** Prop kinds that make a world bird country: anything a bird would fly over. */
const ELIGIBLE_KINDS: ReadonlySet<string> = new Set(['building', 'broadleafTree', 'conifer', 'treeCanopy']);

/**
 * A crown or a post is about as wide as half its height: the horizontal reach
 * a non-building prop stamps into the skyline grid, as a share of its top.
 * Conservative only — the 40 m look-up radius dwarfs it.
 */
const PROP_REACH_SHARE = 0.5;

// ---------------------------------------------------------------------------
// The half-bird template (position only, Uint16 index)
// ---------------------------------------------------------------------------

/**
 * One half of a bird in its own frame (+Z forward, +X its left wing, Y up),
 * metres; the other half is the same template at instance scale (−1, 1, 1).
 * Drawn at a 1.8 m wingspan and scaled whole to `BIRDS.wingspanMetres`, so
 * the proportions hold: half body nose 0.40 ahead, tail 0.45 behind, 8 cm
 * half-width; wing root beside the body, wrist at 0.45 m, tip at half the
 * wingspan swept 0.15 m back from the wrist. Eight vertices, four triangles.
 */
export function birdTemplatePositions(): Float32Array {
  const k = BIRDS.wingspanMetres / TEMPLATE_WINGSPAN_METRES;
  const tip = TEMPLATE_WINGSPAN_METRES / 2;
  return new Float32Array([
    0, 0, 0.40, // 0 nose
    0.08, 0, 0.10, // 1 body side, front
    0.06, 0, -0.25, // 2 body side, back
    0, 0, -0.45, // 3 tail
    0.06, 0, 0.12, // 4 wing root, leading
    0.06, 0, -0.14, // 5 wing root, trailing
    0.45, 0, 0.08, // 6 wrist
    tip, 0, 0.08 - 0.15, // 7 tip, swept back
  ].map((value) => value * k));
}

/** Two body triangles, two wing triangles. */
export const BIRD_TEMPLATE_INDICES: readonly number[] = Object.freeze([0, 1, 2, 0, 2, 3, 4, 6, 5, 6, 7, 5]);

/** Instances per flock: two mirrored halves per bird. */
export function birdInstances(): number {
  return BIRDS.count * 2;
}

/** Bytes one instance matrix holds (16 floats). */
const INSTANCE_MATRIX_BYTES = 16 * 4;

/**
 * The flock's bounding radius about its centre, m: the farthest formation
 * slot plus wander and bob, plus half a wingspan for the wings and body
 * turning about it. Set once on the mesh; it never needs a per-frame scan.
 */
export function birdFlockRadius(): number {
  return Math.hypot(
    BIRDS.formationForwardMetres + BIRDS.wanderMetres,
    BIRDS.formationLateralMetres + BIRDS.wanderMetres,
    BIRDS.formationVerticalMetres + BIRDS.wanderMetres + BIRDS.bobMetres,
  ) + BIRDS.wingspanMetres / 2;
}

/** How far from the field box a pass begins and ends, at the flock centre, m (540). */
export function birdEntryDistance(): number {
  return CAMERA.far + BIRDS.entryMarginMetres;
}

/** The camera guard's reach, m: a transition waits while any view camera is this close. */
export function birdGuardDistance(): number {
  return CAMERA.far + birdFlockRadius();
}

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

export interface BirdFieldBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface PreparedBirdFlight {
  readonly eligible: boolean;
  /** The heightfield's box: the field the passes cross. */
  readonly box: BirdFieldBox;
  /** An integer keyed from the heightfield's origin and size (never a level id). */
  readonly worldKey: number;
  /** The flat surround's height: the ground outside the grid. */
  readonly surroundHeight: number;
  readonly cellMetres: number;
  readonly gridOriginX: number;
  readonly gridOriginZ: number;
  readonly columns: number;
  readonly rows: number;
  /** Tallest top per cell, m (−Infinity where nothing stands). */
  readonly skyline: Float32Array;
  /** Highest ground per cell, m. */
  readonly terrain: Float32Array;
  /** Tallest top within `skylineRadiusMetres` of any point in the cell (conservative). */
  readonly skylineNear: Float32Array;
  /** Highest ground within `skylineRadiusMetres` of any point in the cell (conservative). */
  readonly terrainNear: Float32Array;
  /** Largest altitude profile any pass needs, samples. */
  readonly profileCapacity: number;
  /** How many `altitudeSampleMetres` a steered flock looks ahead: enough to climb from the lowest target to the highest at `climbSlope`. */
  readonly lookAheadSamples: number;
  /** Road centreline samples (every segment, `ROAD_SAMPLE_METRES` apart): x, z and heading. */
  readonly roadX: Float32Array;
  readonly roadZ: Float32Array;
  readonly roadHeading: Float32Array;
  /** Samples by grid cell: cell c's are `roadItems[roadCellStart[c] .. roadCellStart[c + 1]]`. */
  readonly roadCellStart: Int32Array;
  readonly roadItems: Int32Array;
}

const NO_CELLS = new Float32Array(0);
const NO_INDEX = new Int32Array(0);
/** The longest look-ahead a steered flock keeps, m. */
const LOOK_AHEAD_LIMIT_METRES = 400;

/** The steered flock's look-ahead slope along the way it flies, m per m: its full climb rate over its speed (birds critic r4). */
export function steeredSlope(): number {
  return BIRDS.climbMetresPerSecond / BIRDS.speed;
}

/**
 * How far ahead the steered flock wants each altitude in full, m: its speed
 * times its altitude follower's lag (the settle time, plus half the time its
 * vertical acceleration takes to reach the climb rate), so the eased climb
 * arrives where the step-free clamp used to.
 */
export function steeredLeadMetres(): number {
  return BIRDS.speed * (BIRDS.altitudeSettleSeconds
    + BIRDS.climbMetresPerSecond / BIRDS.verticalAccelerationMetresPerSecondSquared / 2);
}

/**
 * The steered flock's own clock rate `range` metres from the nearest view
 * camera (owner round 2): `farRate` beyond `farRateFromMetres`, 1 within
 * `farRateToMetres` (beyond `framedMetres`), a smoothstep between. It flies
 * the same path, turns and climbs; only where the haze hides it, sooner.
 */
export function birdFlightRate(range: number): number {
  const u = Math.min(1, Math.max(0, (range - BIRDS.farRateToMetres) / (BIRDS.farRateFromMetres - BIRDS.farRateToMetres)));
  return 1 + (BIRDS.farRate - 1) * u * u * (3 - 2 * u);
}

/**
 * About how long the steered flock takes to fly `distance` metres in towards
 * its rider, s: its far stretch at `farRate`, the ease at the mean of the two
 * rates, the rest at `speed` (its intercept lead and its nominal window).
 */
export function birdFlightSeconds(distance: number): number {
  const from = BIRDS.farRateFromMetres, to = BIRDS.farRateToMetres;
  return (Math.max(0, distance - from) / BIRDS.farRate
    + (Math.min(Math.max(0, distance - to), from - to) * 2) / (1 + BIRDS.farRate)
    + Math.min(distance, to)) / BIRDS.speed;
}

function fieldBox(plan: LevelPlan): BirdFieldBox {
  const field = plan.heightfield;
  return Object.freeze({
    minX: field.originX, maxX: field.originX + (field.columns - 1) * field.spacing,
    minZ: field.originZ, maxZ: field.originZ + (field.rows - 1) * field.spacing,
  });
}

/** Whether a plan gets a flock: plan data only (invariant 22). */
export function birdEligible(plan: LevelPlan): boolean {
  return (plan.props ?? []).some((prop) => ELIGIBLE_KINDS.has(prop.kind));
}

/**
 * Everything a flock needs, from the plan, once per world. GPU-free; reads the
 * plan and writes nothing.
 */
export function prepareBirdFlight(plan: LevelPlan): PreparedBirdFlight {
  const box = fieldBox(plan);
  const surroundHeight = plan.surround.height;
  const cell = BIRDS.skylineCellMetres;
  const field = plan.heightfield;
  const worldKey = Math.floor((positionHash01(field.originX, field.originZ, SALT.world)
    + positionHash01((field.columns - 1) * field.spacing, (field.rows - 1) * field.spacing, SALT.world)) * 4999);
  if (!birdEligible(plan)) {
    return Object.freeze({
      eligible: false, box, worldKey, surroundHeight, cellMetres: cell, gridOriginX: box.minX, gridOriginZ: box.minZ,
      columns: 0, rows: 0, skyline: NO_CELLS, terrain: NO_CELLS, skylineNear: NO_CELLS, terrainNear: NO_CELLS,
      profileCapacity: 0, lookAheadSamples: 0, roadX: NO_CELLS, roadZ: NO_CELLS, roadHeading: NO_CELLS,
      roadCellStart: NO_INDEX, roadItems: NO_INDEX,
    });
  }

  // What stands, as (x, z, top, half-length, half-width, yaw): a building
  // piece is its own turned footprint (plus an eave), anything else a
  // square of its reach (half-width −1 marks a disc of that radius).
  const tops: number[] = [];
  const stand = (x: number, z: number, top: number, reach: number): void => {
    if (![x, z, top, reach].every(Number.isFinite)) throw new Error('Non-finite bird skyline source');
    tops.push(x, z, top, Math.max(0, reach), -1, 0);
  };
  const standBox = (x: number, z: number, top: number, halfX: number, halfZ: number, yaw: number): void => {
    if (![x, z, top, halfX, halfZ, yaw].every(Number.isFinite)) throw new Error('Non-finite bird skyline source');
    tops.push(x, z, top, Math.max(0, halfX), Math.max(0, halfZ), yaw);
  };
  for (const prop of plan.props ?? []) {
    const { x, y, z } = prop.position;
    if (prop.kind === 'building') {
      // Each piece where the prop owner places it: the prop's yaw turns its
      // offset and its own yaw adds to it.
      const cos = Math.cos(prop.rotationY), sin = Math.sin(prop.rotationY);
      for (const piece of buildingSourceRecords(prop)) {
        const lx = piece.x * prop.scale, lz = piece.z * prop.scale;
        standBox(x + lx * cos + lz * sin, z - lx * sin + lz * cos, y + prop.scale * (piece.y + piece.sy),
          (prop.scale * piece.sx) / 2 + BIRDS.eaveMetres, (prop.scale * piece.sz) / 2 + BIRDS.eaveMetres, prop.rotationY + piece.yaw);
      }
      continue;
    }
    const top = PROP_VERTICAL_SPANS[prop.kind].top * prop.scale;
    stand(x, z, y + top, top * PROP_REACH_SHARE);
  }
  const boxes = [...(plan.solids ?? []), ...plan.segments.flatMap((segment) => segment.colliders)];
  for (const solid of boxes) {
    stand(solid.centre.x, solid.centre.z, solid.centre.y + solid.halfExtents.y,
      Math.hypot(solid.halfExtents.x, solid.halfExtents.z));
  }
  const TOP_FLOATS = 6;
  const reachOf = (at: number): number => (tops[at + 4] < 0 ? tops[at + 3] : Math.hypot(tops[at + 3], tops[at + 4]));

  // The grid covers the field and everything standing, plus the look-up reach.
  const pad = BIRDS.skylineRadiusMetres + cell;
  let minX = box.minX, maxX = box.maxX, minZ = box.minZ, maxZ = box.maxZ;
  for (let at = 0; at < tops.length; at += TOP_FLOATS) {
    const x = tops[at], z = tops[at + 1], reach = reachOf(at);
    minX = Math.min(minX, x - reach); maxX = Math.max(maxX, x + reach);
    minZ = Math.min(minZ, z - reach); maxZ = Math.max(maxZ, z + reach);
  }
  const gridOriginX = Math.floor((minX - pad) / cell) * cell;
  const gridOriginZ = Math.floor((minZ - pad) / cell) * cell;
  const columns = Math.ceil((maxX + pad - gridOriginX) / cell) + 1;
  const rows = Math.ceil((maxZ + pad - gridOriginZ) / cell) + 1;
  const skyline = new Float32Array(columns * rows).fill(-Infinity);
  const terrain = new Float32Array(columns * rows).fill(surroundHeight);
  const column = (x: number): number => Math.min(columns - 1, Math.max(0, Math.floor((x - gridOriginX) / cell)));
  const row = (z: number): number => Math.min(rows - 1, Math.max(0, Math.floor((z - gridOriginZ) / cell)));

  // A cell takes a top when any of it can lie under it: its centre within the
  // footprint grown by half the cell's diagonal.
  const halfCell = (cell * Math.SQRT2) / 2;
  for (let at = 0; at < tops.length; at += TOP_FLOATS) {
    const x = tops[at], z = tops[at + 1], top = tops[at + 2], reach = reachOf(at);
    const disc = tops[at + 4] < 0, cos = Math.cos(tops[at + 5]), sin = Math.sin(tops[at + 5]);
    const halfX = tops[at + 3] + halfCell, halfZ = tops[at + 4] + halfCell, radius = tops[at + 3] + halfCell;
    for (let r = row(z - reach); r <= row(z + reach); r += 1) {
      for (let c = column(x - reach); c <= column(x + reach); c += 1) {
        const dx = gridOriginX + (c + 0.5) * cell - x, dz = gridOriginZ + (r + 0.5) * cell - z;
        if (disc ? Math.hypot(dx, dz) > radius
          : Math.abs(dx * cos - dz * sin) > halfX || Math.abs(dx * sin + dz * cos) > halfZ) continue;
        const index = r * columns + c;
        if (top > skyline[index]) skyline[index] = top;
      }
    }
  }
  for (let r = 0; r < field.rows; r += 1) {
    const cellRow = row(field.originZ + r * field.spacing) * columns;
    for (let c = 0; c < field.columns; c += 1) {
      const height = field.heights[r * field.columns + c];
      const index = cellRow + column(field.originX + c * field.spacing);
      if (height > terrain[index]) terrain[index] = height;
    }
  }

  // Dilate: a cell takes the tallest top of every cell any point of which
  // lies within the radius of any point of it.
  const skylineNear = dilateCells(skyline, columns, rows, BIRDS.skylineRadiusMetres / cell);
  const terrainNear = dilateCells(terrain, columns, rows, BIRDS.skylineRadiusMetres / cell);
  // Outside the grid the ground is the surround, so an edge cell never reads lower.
  for (let index = 0; index < terrainNear.length; index += 1) terrainNear[index] = Math.max(terrainNear[index], surroundHeight);

  const diagonal = Math.hypot(box.maxX - box.minX, box.maxZ - box.minZ);
  const offset = birdEntryDistance() + BIRDS.meanderAmplitude;
  // A field chord: the box crossing and the two runs out to the entry distance.
  const profileCapacity = Math.ceil((3 * diagonal + 2 * (offset + diagonal)) / BIRDS.altitudeSampleMetres) + 4;
  // The steered flock's look-ahead: from the lowest wanted altitude to the
  // highest, at the climb slope (capped; a taller rise is met by the floor).
  let highest = surroundHeight + BIRDS.terrainFloorMetres;
  for (let index = 0; index < columns * rows; index += 1) {
    highest = Math.max(highest, terrainNear[index] + BIRDS.terrainFloorMetres, skylineNear[index] + BIRDS.clearanceMetres);
  }
  const rise = highest - (surroundHeight + BIRDS.terrainFloorMetres);
  const lookAheadSamples = Math.ceil(Math.min(LOOK_AHEAD_LIMIT_METRES, steeredLeadMetres() + rise / steeredSlope())
    / BIRDS.altitudeSampleMetres) + 1;
  // The roads, for walking a rider's way ahead: each segment's arc between
  // its sockets (constant curvature, as `tests/harness.ts` routePoints draws it).
  const roadXs: number[] = [], roadZs: number[] = [], roadHs: number[] = [];
  for (const segment of plan.segments) {
    const turn = segment.exit.headingY - segment.entry.headingY;
    const chord = Math.hypot(segment.exit.position.x - segment.entry.position.x, segment.exit.position.z - segment.entry.position.z);
    const length = Math.abs(turn) < 1e-9 ? chord : (chord * (turn / 2)) / Math.sin(turn / 2);
    const curvature = length > 0 ? turn / length : 0, start = segment.entry.headingY;
    const count = Math.max(1, Math.round(length / ROAD_SAMPLE_METRES));
    for (let i = 0; i <= count; i += 1) {
      const along = (length * i) / count;
      if (Math.abs(curvature) < 1e-9) {
        roadXs.push(segment.entry.position.x + Math.sin(start) * along);
        roadZs.push(segment.entry.position.z + Math.cos(start) * along);
        roadHs.push(start);
      } else {
        const heading = start + curvature * along;
        roadXs.push(segment.entry.position.x + (Math.cos(start) - Math.cos(heading)) / curvature);
        roadZs.push(segment.entry.position.z + (Math.sin(heading) - Math.sin(start)) / curvature);
        roadHs.push(heading);
      }
    }
  }
  const cellOf = (x: number, z: number): number => {
    const c = Math.floor((x - gridOriginX) / cell), r = Math.floor((z - gridOriginZ) / cell);
    return c < 0 || r < 0 || c >= columns || r >= rows ? -1 : r * columns + c;
  };
  const roadCellStart = new Int32Array(columns * rows + 1);
  for (let i = 0; i < roadXs.length; i += 1) {
    const at = cellOf(roadXs[i], roadZs[i]);
    if (at >= 0) roadCellStart[at + 1] += 1;
  }
  for (let at = 0; at < columns * rows; at += 1) roadCellStart[at + 1] += roadCellStart[at];
  const roadItems = new Int32Array(roadCellStart[columns * rows]), filled = roadCellStart.slice(0, columns * rows);
  for (let i = 0; i < roadXs.length; i += 1) {
    const at = cellOf(roadXs[i], roadZs[i]);
    if (at >= 0) roadItems[filled[at]++] = i;
  }
  return Object.freeze({
    eligible: true, box, worldKey, surroundHeight, cellMetres: cell, gridOriginX, gridOriginZ, columns, rows,
    skyline, terrain, skylineNear, terrainNear, profileCapacity, lookAheadSamples,
    roadX: Float32Array.from(roadXs), roadZ: Float32Array.from(roadZs), roadHeading: Float32Array.from(roadHs),
    roadCellStart, roadItems,
  });
}

/**
 * Each cell's maximum over every cell whose nearest point lies within
 * `radiusCells` cell widths of it (a disc of whole cells): one windowed
 * maximum along the rows per row offset (van Herk / Gil-Werman, exact at
 * the edges), so the price is a few passes over the grid, not a disc per cell.
 */
export function dilateCells(source: Float32Array, columns: number, rows: number, radiusCells: number): Float32Array {
  const out = new Float32Array(columns * rows).fill(-Infinity);
  const along = new Float32Array(columns * rows), prefix = new Float32Array(columns), suffix = new Float32Array(columns);
  let half = -1;
  for (let offset = 0; offset <= rows; offset += 1) {
    const gap = Math.max(0, offset - 1), room = radiusCells * radiusCells - gap * gap;
    if (room < 0) break;
    const reach = 1 + Math.floor(Math.sqrt(room));
    if (reach !== half) {
      half = reach;
      const size = 2 * reach + 1;
      for (let r = 0; r < rows; r += 1) {
        const base = r * columns;
        for (let c = 0; c < columns; c += 1) prefix[c] = c % size === 0 ? source[base + c] : Math.max(prefix[c - 1], source[base + c]);
        for (let c = columns - 1; c >= 0; c -= 1) {
          suffix[c] = c === columns - 1 || (c + 1) % size === 0 ? source[base + c] : Math.max(suffix[c + 1], source[base + c]);
        }
        for (let c = 0; c < columns; c += 1) {
          const low = c - reach, high = c + reach;
          if (low >= 0 && high < columns) {
            along[base + c] = Math.max(suffix[low], prefix[high]);
            continue;
          }
          let most = -Infinity;
          for (let k = Math.max(0, low); k <= Math.min(columns - 1, high); k += 1) most = Math.max(most, source[base + k]);
          along[base + c] = most;
        }
      }
    }
    for (let r = 0; r < rows; r += 1) {
      const base = r * columns;
      for (const other of offset === 0 ? [r] : [r - offset, r + offset]) {
        if (other < 0 || other >= rows) continue;
        const from = other * columns;
        for (let c = 0; c < columns; c += 1) if (along[from + c] > out[base + c]) out[base + c] = along[from + c];
      }
    }
  }
  return out;
}

/** The grid cell holding (x, z), or −1 outside the grid. */
function cellAt(prepared: PreparedBirdFlight, x: number, z: number): number {
  const c = Math.floor((x - prepared.gridOriginX) / prepared.cellMetres);
  const r = Math.floor((z - prepared.gridOriginZ) / prepared.cellMetres);
  if (c < 0 || r < 0 || c >= prepared.columns || r >= prepared.rows) return -1;
  return r * prepared.columns + c;
}

/** The tallest thing standing in (x, z)'s own cell, m; −Infinity for open ground or outside the grid. */
export function skylineAt(prepared: PreparedBirdFlight, x: number, z: number): number {
  const index = cellAt(prepared, x, z);
  return index < 0 ? -Infinity : prepared.skyline[index];
}

/** Where the flock wants to be over (x, z): clear of the skyline and the ground within the look-up radius. */
export function birdTargetAltitude(prepared: PreparedBirdFlight, x: number, z: number): number {
  const index = cellAt(prepared, x, z);
  if (index < 0) return prepared.surroundHeight + BIRDS.terrainFloorMetres;
  return Math.max(prepared.terrainNear[index] + BIRDS.terrainFloorMetres,
    prepared.skylineNear[index] + BIRDS.clearanceMetres);
}

/** Where a road walk ends: position and heading. */
export interface RoadWalk {
  x: number;
  z: number;
  heading: number;
}

/**
 * Walk `distance` metres from (x, z) along `heading`, the way a rider follows
 * his road: each `ROAD_SAMPLE_METRES` step snaps to the nearest centreline
 * sample within `ROAD_SNAP_METRES` whose heading (either way along the road)
 * continues the walk's within `ROAD_TURN_RADIANS`, and takes that heading;
 * off the roads it goes straight on. Into `out`; pure and allocation-free.
 */
export function walkRoad(prepared: PreparedBirdFlight, x: number, z: number, heading: number, distance: number,
  out: RoadWalk): RoadWalk {
  const limit = ROAD_SNAP_METRES * ROAD_SNAP_METRES;
  for (let walked = 0; walked < distance; walked += ROAD_SAMPLE_METRES) {
    const px = x + Math.sin(heading) * ROAD_SAMPLE_METRES, pz = z + Math.cos(heading) * ROAD_SAMPLE_METRES;
    let best = limit, bx = px, bz = pz, bh = heading;
    const c0 = Math.floor((px - prepared.gridOriginX) / prepared.cellMetres), r0 = Math.floor((pz - prepared.gridOriginZ) / prepared.cellMetres);
    for (let r = Math.max(0, r0 - 1); r <= Math.min(prepared.rows - 1, r0 + 1); r += 1) {
      for (let c = Math.max(0, c0 - 1); c <= Math.min(prepared.columns - 1, c0 + 1); c += 1) {
        const at = r * prepared.columns + c;
        for (let k = prepared.roadCellStart[at]; k < prepared.roadCellStart[at + 1]; k += 1) {
          const i = prepared.roadItems[k];
          const d2 = (prepared.roadX[i] - px) ** 2 + (prepared.roadZ[i] - pz) ** 2;
          if (d2 >= best) continue;
          const along = prepared.roadHeading[i];
          const turn = Math.atan2(Math.sin(along - heading), Math.cos(along - heading));
          const way = Math.abs(turn) <= Math.PI / 2 ? along : along + Math.PI;
          if (Math.abs(Math.atan2(Math.sin(way - heading), Math.cos(way - heading))) > ROAD_TURN_RADIANS) continue;
          best = d2; bx = prepared.roadX[i]; bz = prepared.roadZ[i]; bh = way;
        }
      }
    }
    x = bx; z = bz; heading = bh;
  }
  out.x = x;
  out.z = z;
  out.heading = heading;
  return out;
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

export interface BirdPass {
  index: number;
  /** The chord at metre 0 (the entry). */
  startX: number;
  startZ: number;
  /** Unit chord direction; the chord's left (the heading frame's +X) is (dirZ, −dirX). */
  dirX: number;
  dirZ: number;
  /** Chord metres from entry to exit. */
  length: number;
  meanderPhase: number;
  /** The quiet after this pass, s. */
  gapSeconds: number;
}

export function createBirdPass(): BirdPass {
  return { index: -1, startX: 0, startZ: 0, dirX: 0, dirZ: 1, length: 0, meanderPhase: 0, gapSeconds: 0 };
}

function hash(prepared: PreparedBirdFlight, index: number, salt: number): number {
  return positionHash01(prepared.worldKey, index, salt);
}

/** Horizontal distance from (x, z) to the field box (0 inside it). */
export function distanceToBox(box: BirdFieldBox, x: number, z: number): number {
  return Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minZ - z, 0, z - box.maxZ));
}

/** Walk from the box edge along the chord until the chord point stands `wanted` off the box. */
function clearOfBox(box: BirdFieldBox, x: number, z: number, dirX: number, dirZ: number, wanted: number): number {
  let s = wanted;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const distance = distanceToBox(box, x + dirX * s, z + dirZ * s);
    if (distance >= wanted) return s;
    s += wanted - distance + 0.01;
  }
  return wanted + Math.hypot(box.maxX - box.minX, box.maxZ - box.minZ);
}

/** Pass `index`'s quiet after it, s (hashed per pass, the same however the pass is laid). */
function gapOf(prepared: PreparedBirdFlight, index: number, range: readonly [number, number]): number {
  return range[0] + hash(prepared, index, SALT.gap) * (range[1] - range[0]);
}

/**
 * Pass `index`'s field chord (no view to aim at), gap and meander, into `out`.
 * Pure; allocation-free.
 */
export function fillBirdPass(prepared: PreparedBirdFlight, index: number, out: BirdPass,
  tuning: Pick<BirdClockTuning, 'gapSeconds'> = BIRDS): BirdPass {
  const { box } = prepared;
  const width = box.maxX - box.minX, depth = box.maxZ - box.minZ;
  const jitter = BIRDS.centreJitterShare * 2;
  const cx = (box.minX + box.maxX) / 2 + (hash(prepared, index, SALT.centreX) - 0.5) * jitter * width;
  const cz = (box.minZ + box.maxZ) / 2 + (hash(prepared, index, SALT.centreZ) - 0.5) * jitter * depth;
  const heading = hash(prepared, index, SALT.heading) * Math.PI * 2;
  const dirX = Math.sin(heading), dirZ = Math.cos(heading);
  // Slab intersection of the line through C with the box; C is inside it.
  let tIn = -Infinity, tOut = Infinity;
  if (Math.abs(dirX) > 1e-12) {
    const a = (box.minX - cx) / dirX, b = (box.maxX - cx) / dirX;
    tIn = Math.max(tIn, Math.min(a, b));
    tOut = Math.min(tOut, Math.max(a, b));
  }
  if (Math.abs(dirZ) > 1e-12) {
    const a = (box.minZ - cz) / dirZ, b = (box.maxZ - cz) / dirZ;
    tIn = Math.max(tIn, Math.min(a, b));
    tOut = Math.min(tOut, Math.max(a, b));
  }
  // The meander can swing the flock towards the box, so the chord stands its
  // amplitude further out: the flock centre itself is ≥ the entry distance.
  const wanted = birdEntryDistance() + BIRDS.meanderAmplitude;
  const before = clearOfBox(box, cx + dirX * tIn, cz + dirZ * tIn, -dirX, -dirZ, wanted);
  const after = clearOfBox(box, cx + dirX * tOut, cz + dirZ * tOut, dirX, dirZ, wanted);
  out.index = index;
  out.dirX = dirX;
  out.dirZ = dirZ;
  out.startX = cx + dirX * (tIn - before);
  out.startZ = cz + dirZ * (tIn - before);
  out.length = tOut + after - (tIn - before);
  out.meanderPhase = hash(prepared, index, SALT.meander) * Math.PI * 2;
  out.gapSeconds = gapOf(prepared, index, tuning.gapSeconds);
  return out;
}

/** Horizontal distance from (x, z) to the nearest view camera. */
function nearestView(cameras: readonly PositionedLike[], x: number, z: number): number {
  let nearest = Infinity;
  for (let index = 0; index < cameras.length; index += 1) {
    const p = cameras[index].position;
    nearest = Math.min(nearest, Math.hypot(p.x - x, p.z - z));
  }
  return nearest;
}

/**
 * Chord metres from (x, z) along (dirX, dirZ) to the first point `wanted` from
 * every camera. The nearest-camera distance changes by at most a metre per
 * metre walked, so each step (`wanted` minus it) never walks past that point.
 */
function clearOfViews(cameras: readonly PositionedLike[], x: number, z: number, dirX: number, dirZ: number, wanted: number): number {
  let s = 0;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const distance = nearestView(cameras, x + dirX * s, z + dirZ * s);
    if (distance >= wanted) return s;
    s += wanted - distance + 0.01;
  }
  return Infinity;
}

/** Seconds one pass takes from entry to exit. */
export function birdPassSeconds(pass: BirdPass): number {
  return pass.length / BIRDS.speed;
}

const MEANDER_K = (): number => (Math.PI * 2) / BIRDS.meanderWavelength;

/**
 * The pass's altitude, every `altitudeSampleMetres` of chord, into `profile`;
 * returns the sample count. Each sample is the target over the meandering
 * centre, then a two-way slope limit lifts the line so it climbs before a tall
 * block and comes down after it, never steeper than `climbSlope`.
 */
export function fillBirdProfile(prepared: PreparedBirdFlight, pass: BirdPass, profile: Float32Array): number {
  const step = BIRDS.altitudeSampleMetres;
  const count = Math.floor(pass.length / step) + 2;
  if (count > profile.length) throw new Error(`Bird profile needs ${count} samples, has ${profile.length}`);
  const k = MEANDER_K(), amplitude = BIRDS.meanderAmplitude;
  const leftX = pass.dirZ, leftZ = -pass.dirX;
  for (let i = 0; i < count; i += 1) {
    const d = i * step, m = amplitude * Math.sin(k * d + pass.meanderPhase);
    profile[i] = birdTargetAltitude(prepared, pass.startX + pass.dirX * d + leftX * m,
      pass.startZ + pass.dirZ * d + leftZ * m);
  }
  const drop = BIRDS.climbSlope * step;
  for (let i = 1; i < count; i += 1) profile[i] = Math.max(profile[i], profile[i - 1] - drop);
  for (let i = count - 2; i >= 0; i -= 1) profile[i] = Math.max(profile[i], profile[i + 1] - drop);
  return count;
}

/** Where the flock centre is and how it is turned. */
export interface FlockFrame {
  x: number;
  y: number;
  z: number;
  /** The path's heading (three's yaw: forward is (sin, cos)). */
  headingY: number;
  /** Bank about the forward axis, rad; negative lowers the left (+X) wing. */
  roll: number;
  /** Nose up, rad. */
  pitch: number;
}

export function createFlockFrame(): FlockFrame {
  return { x: 0, y: 0, z: 0, headingY: 0, roll: 0, pitch: 0 };
}

/**
 * The flock centre at `d` chord metres into the pass. Beyond the exit (a
 * deferred end) it keeps flying the same meandering line at its last altitude.
 */
export function flockFrameAt(pass: BirdPass, profile: Float32Array, count: number, d: number, out: FlockFrame): FlockFrame {
  const k = MEANDER_K(), amplitude = BIRDS.meanderAmplitude, phase = k * d + pass.meanderPhase;
  const m = amplitude * Math.sin(phase);
  const m1 = amplitude * k * Math.cos(phase);
  const m2 = -amplitude * k * k * Math.sin(phase);
  const leftX = pass.dirZ, leftZ = -pass.dirX;
  out.x = pass.startX + pass.dirX * d + leftX * m;
  out.z = pass.startZ + pass.dirZ * d + leftZ * m;
  out.headingY = Math.atan2(pass.dirX + leftX * m1, pass.dirZ + leftZ * m1);
  const step = BIRDS.altitudeSampleMetres;
  const at = Math.max(0, d) / step;
  const i = Math.min(count - 2, Math.floor(at));
  const t = Math.min(1, at - i);
  out.y = profile[i] + (profile[i + 1] - profile[i]) * t;
  const stretch = Math.sqrt(1 + m1 * m1);
  out.pitch = at >= count - 1 ? 0 : Math.atan((profile[i + 1] - profile[i]) / step / stretch);
  // Signed curvature of the meander towards the chord's left, times the
  // path speed squared, is the lateral acceleration a bird leans into.
  const pathSpeed = BIRDS.speed * stretch;
  const lateral = (m2 / (stretch * stretch * stretch)) * pathSpeed * pathSpeed;
  out.roll = Math.max(-BIRDS.bankLimitRadians, Math.min(BIRDS.bankLimitRadians, -lateral / PHYSICS.gravity));
  return out;
}

// ---------------------------------------------------------------------------
// The pure schedule (no camera guard)
// ---------------------------------------------------------------------------

export interface BirdScheduleEntry {
  readonly index: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

/**
 * Pass `index`'s nominal window on the world clock with no view to aim at
 * (field chords) and no camera ever in the way — the schedule a clock fed no
 * cameras follows. For tests; it walks from pass 0. In the game every pass is
 * steered across a view (`BirdFlightClock`), so its end is known only when it
 * retires.
 */
export function birdSchedule(prepared: PreparedBirdFlight, passes: number, tuning: BirdClockTuning = BIRDS): BirdScheduleEntry[] {
  const out: BirdScheduleEntry[] = [];
  if (!prepared.eligible) return out;
  const pass = createBirdPass();
  let start = tuning.quietStartSeconds;
  for (let index = 0; index < passes; index += 1) {
    fillBirdPass(prepared, index, pass, tuning);
    const end = start + birdPassSeconds(pass);
    out.push({ index, startSeconds: start, endSeconds: end });
    start = end + pass.gapSeconds;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Each bird, in the flock's heading frame
// ---------------------------------------------------------------------------

/** One bird's pose relative to the flock centre and heading. */
export interface BirdLocalPose {
  /** Offset in the heading frame, m: +X left, +Y up, +Z forward. */
  x: number;
  y: number;
  z: number;
  /** The wing angle about the forward axis, rad (up is positive for both halves). */
  wing: number;
}

export function createBirdLocalPose(): BirdLocalPose {
  return { x: 0, y: 0, z: 0, wing: 0 };
}

function birdHash(worldKey: number, bird: number, axis: number, salt: number): number {
  return positionHash01(worldKey + bird, axis, salt);
}

/** One bird's slow wander along one axis (0 lateral, 1 vertical, 2 forward), m. */
function wanderOf(worldKey: number, bird: number, axis: number, t: number): number {
  const low = BIRDS.wanderHz[0], high = BIRDS.wanderHz[1];
  const hz = low + birdHash(worldKey, bird, axis, SALT.wanderHz) * (high - low);
  return BIRDS.wanderMetres * Math.sin(Math.PI * 2 * hz * t + birdHash(worldKey, bird, axis, SALT.wanderPhase) * Math.PI * 2);
}

/**
 * Bird `bird`'s offset and wing at world time `t`. Lateral slots are stratified
 * so no two birds share a lane; forward and vertical are hashed; a slow
 * per-axis wander keeps the formation loose. Wings flap at `flapHz` inside a
 * flap/glide envelope, phase-shifted per bird, and hold the glide dihedral
 * between spells; the body bobs with the beat.
 */
export function birdLocalPose(worldKey: number, bird: number, t: number, out: BirdLocalPose): BirdLocalPose {
  const lateral = BIRDS.formationLateralMetres, slot = (2 * lateral) / BIRDS.count;
  const cycle = BIRDS.flapSeconds + BIRDS.glideSeconds;
  const shifted = t + birdHash(worldKey, bird, 0, SALT.cycle) * cycle;
  const into = shifted - Math.floor(shifted / cycle) * cycle;
  let envelope = 0;
  if (into < BIRDS.flapSeconds) {
    const ramp = Math.min(1, into / BIRDS.flapBlendSeconds, (BIRDS.flapSeconds - into) / BIRDS.flapBlendSeconds);
    envelope = Math.sin((Math.PI / 2) * ramp) ** 2;
  }
  const beat = Math.sin(Math.PI * 2 * BIRDS.flapHz * t + birdHash(worldKey, bird, 0, SALT.flapPhase) * Math.PI * 2);
  out.x = -lateral + slot * (bird + 0.5) + (birdHash(worldKey, bird, 0, SALT.lateral) - 0.5) * slot * 0.4
    + wanderOf(worldKey, bird, 0, t);
  out.y = (birdHash(worldKey, bird, 0, SALT.vertical) * 2 - 1) * BIRDS.formationVerticalMetres
    + wanderOf(worldKey, bird, 1, t) - BIRDS.bobMetres * envelope * beat;
  out.z = (birdHash(worldKey, bird, 0, SALT.forward) * 2 - 1) * BIRDS.formationForwardMetres
    + wanderOf(worldKey, bird, 2, t);
  out.wing = BIRDS.glideDihedral + envelope * BIRDS.flapRadians * beat;
  return out;
}

// ---------------------------------------------------------------------------
// The runtime clock, with the camera guard
// ---------------------------------------------------------------------------

/**
 * A view camera: its world position, and (a three camera's) world matrix,
 * whose heading a pass is laid across. Without the matrix a pass keeps its
 * field chord.
 */
export interface PositionedLike {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly matrixWorld?: { readonly elements: ArrayLike<number> };
  /** A three `PerspectiveCamera`'s vertical field of view, degrees, and aspect: how wide its pane sees. */
  readonly fov?: number;
  readonly aspect?: number;
}

/** Wrap an angle to (−π, π]. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** How far (x, z) lies off a camera's level forward, rad (0 … π). */
function offForward(camera: PositionedLike, x: number, z: number): number {
  const e = camera.matrixWorld?.elements;
  if (e === undefined) return 0;
  const fx = -e[8], fz = -e[10], dx = x - camera.position.x, dz = z - camera.position.z;
  const norm = Math.hypot(fx, fz) * Math.hypot(dx, dz);
  return norm < 1e-9 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / norm)));
}

/** Half a camera's pane width, rad: what its frame shows either side of its forward. */
function paneHalfWidth(camera: PositionedLike): number {
  return Math.atan(Math.tan(((camera.fov ?? 78) * Math.PI) / 360) * (camera.aspect ?? 16 / 9));
}

/**
 * One world's flock clock. `advance` is fed the simulation clock once per drawn
 * frame and answers whether the flock flies (and where, in `frame`). Its epoch
 * is the first call; a clock that goes backwards replays from the epoch. Each
 * pass is laid when it starts: **steered** across one view if that camera has
 * a heading, else its **field chord**. A steered flock is integrated in fixed
 * `steerStepSeconds` steps from its start on the world clock, each step
 * reading the cameras of the frame that reached it, so the same seconds and
 * the same cameras always give the same flock. A pass's end is provisional
 * until it retires. Allocation-free after construction.
 */
export class BirdFlightClock {
  readonly prepared: PreparedBirdFlight;
  readonly tuning: BirdClockTuning;
  readonly pass: BirdPass = createBirdPass();
  readonly profile: Float32Array;
  profileCount = 0;
  /** The view the current pass crosses; null while it waits or holds its field chord. */
  aimedView: number | null = null;
  /** The simulation second this world's clock started at; null before the first frame. */
  epoch: number | null = null;
  /** World seconds at the last advance. */
  worldSeconds = 0;
  phase: 'waiting' | 'flying' = 'waiting';
  /** The current (or next) pass's start, world seconds. */
  start = 0;
  /** The steered flock has come within `commitMetres` of its rider and flies straight on (then, after `lingerSeconds`, away). */
  committed = false;
  /** Seconds since it committed. */
  private committedFor = 0;
  /** Seconds the flock has stood where no view can show it, without a break. */
  private unseenFor = 0;
  /** Per view: the world second it last saw a flock (`sees`), and for how long it has without a break (0 at the world's start). */
  private readonly seenAt = new Float64Array(MAX_VIEWS);
  private readonly seenFor = new Float64Array(MAX_VIEWS);
  /** The current pass's aimed view has seen it. */
  private seenByAim = false;
  /** Times the current pass was born again ahead of its rider, and whether the wait is such a re-lay. */
  private relays = 0;
  private relaying = false;
  /** Its closing speed on its aimed rider, m/s (smoothed), the range it was at one step back, and how long it has closed slowly. */
  private closing = 0;
  private lastRange = Number.NaN;
  private slowFor = 0;
  private awayAt = 0;
  /** The crossing on his road (the pursuit point) and that point smoothed as the aim is. */
  private crossX = 0;
  private crossZ = 0;
  private crossAimX = 0;
  private crossAimZ = 0;
  /** The view the last pass was aimed at (−1: none yet). */
  private lastAimed = -1;
  /** View cameras at the last advance (at most `MAX_VIEWS` tracked). */
  private views = 0;
  /** A field-chord pass whose end a camera is holding open. */
  private deferredEnd = false;
  /** A pass reduced motion touched stays parked to its end, so it never pops back in mid-sky. */
  private suppressed = -1;
  /** A pane drew the current pass near enough to be seen (`noteFramed`). */
  private framed = false;
  // The steered flock, at world second `stepped`.
  private steered = false;
  private stepped = 0;
  private x = 0;
  private z = 0;
  private y = 0;
  private heading = 0;
  /** rad/s, slewed (the bank leans into it). */
  private turn = 0;
  /** The heading and bank one step back: a frame between steps interpolates from them, so nothing jumps. */
  private headingBefore = 0;
  private bank = 0;
  private bankBefore = 0;
  /** The world heading the bank-away turns to, chosen once per pass when the linger ends (NaN before). */
  private awayHeading = Number.NaN;
  /** While committed, before that: the heading it would bank away to now (NaN otherwise). */
  private awayAhead = Number.NaN;
  /** The pursuit point, smoothed over `aimSmoothSeconds` (a road walk that snaps to another segment never jerks the flock). */
  private aimX = 0;
  private aimZ = 0;
  /** The sign of its last turn this pass (0 before any). */
  private turnSign = 0;
  private pitch = 0;
  /** Its own clock's rate for the step to come and the frames before it (`birdFlightRate`; 1 wherever a pane can frame it). */
  private rate = 1;
  /** Vertical speed, m/s (eased: the altitude never steps), and the altitude and pitch one step back. */
  private vy = 0;
  private pitchBefore = 0;
  private crossDepth = 0;
  // The aimed rider's travel, written by `travel`: unit heading and speed.
  private travelX = 0;
  private travelZ = 1;
  private travelSpeed = 0;
  // `walkRoad`'s answer and the pursuit point, written in place.
  private readonly road = { x: 0, z: 0, heading: 0 };
  private targetX = 0;
  private targetZ = 0;
  /**
   * Per view: last x, last z, last world second, velocity x and z smoothed
   * over `VELOCITY_SECONDS`, and over `BIRDS.travelSmoothSeconds` (NaN before
   * the first frame).
   */
  private readonly motion = new Float64Array(MAX_VIEWS * MOTION_FLOATS).fill(Number.NaN);

  constructor(prepared: PreparedBirdFlight, tuning: BirdClockTuning = BIRDS) {
    this.prepared = prepared;
    this.tuning = tuning;
    this.profile = new Float32Array(Math.max(2, prepared.profileCapacity));
    if (prepared.eligible) this.reset();
  }

  /** Back to the quiet start of pass 0, keeping the epoch. */
  reset(): void {
    this.load(0);
    this.start = this.tuning.quietStartSeconds;
    this.phase = 'waiting';
    this.deferredEnd = false;
    this.suppressed = -1;
    this.worldSeconds = 0;
    this.motion.fill(Number.NaN);
    this.seenAt.fill(0);
    this.seenFor.fill(0);
    this.lastAimed = -1;
  }

  /** Pass `index` on its field chord. */
  private load(index: number): void {
    fillBirdPass(this.prepared, index, this.pass, this.tuning);
    this.profileCount = fillBirdProfile(this.prepared, this.pass, this.profile);
    this.aimedView = null;
    this.framed = false;
    this.steered = false;
    this.committed = false;
    this.seenByAim = false;
    this.relays = 0;
    this.relaying = false;
  }

  /**
   * A pane drew the flying flock within `BIRDS.framedMetres` of its camera
   * (the mesh's `onBeforeRender`): this pass was on somebody's screen, so the
   * ordinary quiet follows it. A steered pass nobody framed (the rider turned
   * away) is followed by `unseenGapSeconds` instead.
   */
  noteFramed(): void {
    if (this.phase === 'flying') this.framed = true;
  }

  /**
   * The current pass's window, world seconds. A steered pass's end is a
   * nominal estimate until it retires: the flight in from its birth to its
   * rider and its linger (it retires out of sight soon after), so its middle
   * finds the flock still flying in.
   */
  window(): { startSeconds: number; endSeconds: number } {
    const nominal = this.steered ? birdFlightSeconds(birdEntryDistance()) + BIRDS.lingerSeconds : birdPassSeconds(this.pass);
    return { startSeconds: this.start, endSeconds: this.start + nominal };
  }

  /** Each view camera's ground velocity, smoothed twice; a camera that jumps was placed, and its speed restarts at zero. */
  private track(cameras: readonly PositionedLike[], t: number): void {
    for (let view = 0; view < Math.min(MAX_VIEWS, cameras.length); view += 1) {
      const p = cameras[view].position, at = view * MOTION_FLOATS, m = this.motion;
      if (Number.isNaN(m[at])) {
        m[at] = p.x; m[at + 1] = p.z; m[at + 2] = t; m[at + 3] = 0; m[at + 4] = 0; m[at + 5] = 0; m[at + 6] = 0;
        continue;
      }
      const dt = t - m[at + 2];
      if (!(dt > 0)) continue;
      const vx = (p.x - m[at]) / dt, vz = (p.z - m[at + 1]) / dt;
      if (Math.hypot(vx, vz) > PLACED_METRES_PER_SECOND) {
        m[at + 3] = 0; m[at + 4] = 0; m[at + 5] = 0; m[at + 6] = 0;
      } else {
        const quick = Math.min(1, dt / VELOCITY_SECONDS), slow = Math.min(1, dt / BIRDS.travelSmoothSeconds);
        m[at + 3] += (vx - m[at + 3]) * quick;
        m[at + 4] += (vz - m[at + 4]) * quick;
        m[at + 5] += (vx - m[at + 5]) * slow;
        m[at + 6] += (vz - m[at + 6]) * slow;
      }
      m[at] = p.x; m[at + 1] = p.z; m[at + 2] = t;
    }
  }

  /**
   * The aimed rider's travel into `travelX/Z` and `travelSpeed`: the heading of
   * his ground velocity smoothed over `travelSmoothSeconds` while he moves,
   * else the camera's level heading. False when the camera carries no world
   * matrix or looks straight up or down (a pass then keeps its field chord).
   */
  private travel(camera: PositionedLike, view: number): boolean {
    const elements = camera.matrixWorld?.elements;
    if (elements === undefined) return false;
    // three's camera looks down its local −Z: the world heading is −(column 2).
    const fx = -elements[8], fz = -elements[10], flat = Math.hypot(fx, fz);
    if (!(flat >= 0.2)) return false;
    const at = view < MAX_VIEWS && !Number.isNaN(this.motion[view * MOTION_FLOATS]) ? view * MOTION_FLOATS : -1;
    const slowX = at < 0 ? 0 : this.motion[at + 5], slowZ = at < 0 ? 0 : this.motion[at + 6], slow = Math.hypot(slowX, slowZ);
    if (slow > MOVING_METRES_PER_SECOND) {
      this.travelX = slowX / slow;
      this.travelZ = slowZ / slow;
    } else {
      this.travelX = fx / flat;
      this.travelZ = fz / flat;
    }
    this.travelSpeed = at < 0 ? 0 : Math.hypot(this.motion[at + 3], this.motion[at + 4]);
    return true;
  }

  /** The crossing depth for a flock at height `above` over its camera: deep enough to stay inside the frame's top. */
  private depthFor(above: number): number {
    return Math.min(BIRDS.crossDepthMaxMetres, Math.max(this.crossDepth, above / Math.tan(BIRDS.crossTopRadians)));
  }

  /**
   * The point the flock heads for, into `targetX/Z`: where the rider will be
   * when it gets there, then the crossing depth further along his heading
   * there — in front of the view he will have. An intercept: his road is
   * walked ahead at his speed for `leadShare` of the flock's own time to the
   * last such point (at most `leadMaxSeconds`), `interceptIterations` times
   * from where he is now. `travel` must have been read first.
   */
  private pursue(camera: PositionedLike): void {
    const depth = this.depthFor(this.y - camera.position.y), heading = Math.atan2(this.travelX, this.travelZ);
    let lead = 0;
    for (let iteration = 0; iteration <= BIRDS.interceptIterations; iteration += 1) {
      walkRoad(this.prepared, camera.position.x, camera.position.z, heading, this.travelSpeed * lead, this.road);
      this.crossX = this.road.x + Math.sin(this.road.heading) * depth;
      this.crossZ = this.road.z + Math.cos(this.road.heading) * depth;
      this.targetX = this.crossX;
      this.targetZ = this.crossZ;
      // An intercept: lead again by the flock's own time to that point.
      lead = Math.min(BIRDS.leadMaxSeconds, birdFlightSeconds(Math.hypot(this.targetX - this.x, this.targetZ - this.z)) * BIRDS.leadShare);
    }
  }

  /**
   * The highest altitude wanted along the flock's way, less the climb it has
   * room for: it rises before a tall block. The birds critic, r4: only the
   * corridor it will really fly (its steering run forward — the skyline is
   * already dilated by the formation's half-width), at the full climb rate,
   * with no fan once it flies straight; while it still pursues, straight on
   * as well (where a held-back turn goes) and one narrow fan, at a climb rate
   * kept in hand. A turn it cannot climb for in time is held back
   * (`step`, the bank-away), so it never turns into a block.
   */
  private lookAhead(x: number, z: number, heading: number): number {
    const samples = this.prepared.lookAheadSamples;
    const fanSamples = Math.min(samples, Math.ceil(BIRDS.fanMetres / BIRDS.altitudeSampleMetres));
    // The way it will fly, its steering run forward: straight on (the turn
    // easing out), round its bank-away, or after its aim point.
    const away = Number.isNaN(this.awayHeading) && this.committed ? this.awayAhead : this.awayHeading;
    let best: number;
    if (this.committed) {
      best = this.path(x, z, heading, this.awayHeading, Number.NaN, Number.NaN, samples);
      if (!Number.isNaN(away)) best = Math.max(best, this.path(x, z, heading, away, Number.NaN, Number.NaN, samples));
    } else {
      best = this.path(x, z, heading, Number.NaN, this.aimX, this.aimZ, samples);
      // …and straight on, where it goes when a turn is held back.
      best = Math.max(best, this.ray(x, z, heading, samples, 1));
    }
    // While it may still turn (pursuing, before it commits: its aim moves) the narrow fan too.
    if (!this.committed) {
      for (const spread of BIRDS.fanRadians) {
        best = Math.max(best, this.ray(x, z, heading + spread, fanSamples), this.ray(x, z, heading - spread, fanSamples));
      }
    }
    return best;
  }

  /**
   * The altitude wanted now for what stands along the path its steering will
   * fly (each target less the eased climb it has room for): from (x, z) on
   * `heading` in its present turn, turning for `toHeading` (a bank-away) or
   * after the point (`aimX`, `aimZ`) as `steer` would, or with neither
   * straight on as the turn eases out.
   */
  private path(x: number, z: number, heading: number, toHeading: number, aimX: number, aimZ: number, samples: number): number {
    const step = BIRDS.altitudeSampleMetres, slope = steeredSlope(), lead = steeredLeadMetres(), dt = step / BIRDS.speed;
    const slew = BIRDS.turnSlewRadiansPerSecondSquared * dt;
    let best = -Infinity, px = x, pz = z, h = heading, turn = this.turn;
    const margin = BIRDS.pathMarginMetres;
    for (let k = 0; k < samples; k += 1) {
      // A corridor, not a line: a path that skims a block's edge is a path into it.
      const sideX = Math.cos(h) * margin, sideZ = -Math.sin(h) * margin;
      const here = Math.max(birdTargetAltitude(this.prepared, px, pz),
        birdTargetAltitude(this.prepared, px + sideX, pz + sideZ), birdTargetAltitude(this.prepared, px - sideX, pz - sideZ));
      best = Math.max(best, here - slope * Math.max(0, step * k - lead));
      const wanted = !Number.isNaN(toHeading) ? toHeading : Number.isNaN(aimX) ? Number.NaN : Math.atan2(aimX - px, aimZ - pz);
      let command = 0;
      if (!Number.isNaN(wanted)) {
        const error = wrapAngle(wanted - h), excess = Math.abs(error) - BIRDS.steerDeadbandRadians;
        if (excess > 0) command = Math.sign(error) * Math.min(BIRDS.steerRadiansPerSecond, BIRDS.steerGainPerSecond * excess);
      }
      turn += Math.max(-slew, Math.min(slew, command - turn));
      h += turn * dt;
      px += Math.sin(h) * step;
      pz += Math.cos(h) * step;
    }
    return best;
  }



  /** The altitude wanted now for what stands along one ray: each target less the eased climb it has room for. */
  private ray(x: number, z: number, heading: number, samples: number, share: number = BIRDS.fanSlopeShare): number {
    // A fan ray is the envelope of turns it has not made yet: it keeps climb in hand (`fanSlopeShare`).
    const step = BIRDS.altitudeSampleMetres, sx = Math.sin(heading) * step, sz = Math.cos(heading) * step;
    const slope = steeredSlope() * share, lead = steeredLeadMetres();
    let best = -Infinity;
    for (let k = 0; k < samples; k += 1) {
      best = Math.max(best, birdTargetAltitude(this.prepared, x + sx * k, z + sz * k) - slope * Math.max(0, step * k - lead));
    }
    return best;
  }

  /**
   * No view can show the flock: from every camera within reach it stands
   * outside the pane's frustum widened by `viewMarginRadians` (its own
   * angular radius allowed for). A camera with no world matrix might see it.
   */
  private unseen(cameras: readonly PositionedLike[]): boolean {
    const radius = birdFlockRadius(), reach = birdGuardDistance(), margin = BIRDS.viewMarginRadians;
    for (let index = 0; index < cameras.length; index += 1) {
      const camera = cameras[index], p = camera.position, e = camera.matrixWorld?.elements;
      const dx = this.x - p.x, dy = this.y - p.y, dz = this.z - p.z, distance = Math.hypot(dx, dy, dz);
      if (distance >= reach) continue;
      if (e === undefined) return false;
      const halfV = ((camera.fov ?? 78) * Math.PI) / 360, halfH = Math.atan(Math.tan(halfV) * (camera.aspect ?? 16 / 9));
      const lx = dx * e[0] + dy * e[1] + dz * e[2], ly = dx * e[4] + dy * e[5] + dz * e[6], depth = -(dx * e[8] + dy * e[9] + dz * e[10]);
      const spread = Math.asin(Math.min(1, radius / Math.max(distance, 1e-6)));
      if (Math.atan2(Math.abs(lx), depth) - spread <= halfH + margin && Math.atan2(Math.abs(ly), depth) - spread <= halfV + margin) return false;
    }
    return true;
  }

  /**
   * Lay pass `index` for view `index % cameras.length` at world second `at`:
   * born on a hashed side of that rider, `birthBearingRadians` off his travel
   * (ahead of his shoulder), `CAMERA.far` + `entryMarginMetres` from every
   * camera (beyond every far plane), heading for its pursuit point. False
   * (nothing laid) without a usable heading.
   */
  private lay(cameras: readonly PositionedLike[], at: number): boolean {
    if (!this.prepared.eligible || cameras.length === 0) return false;
    // A re-lay keeps its rider; a new pass goes to the view that has waited
    // longest for a flock, the one the last pass was aimed at counted
    // `turnAboutSeconds` less (ties: pass index mod the view count), so the
    // couch seats take turns unless one has waited much longer.
    let view = this.relaying && this.aimedView !== null ? this.aimedView % cameras.length : this.pass.index % cameras.length;
    if (!this.relaying) {
      const views = Math.min(MAX_VIEWS, cameras.length);
      const waited = (each: number): number => this.seenAt[each] + (each === this.lastAimed ? BIRDS.turnAboutSeconds : 0);
      for (let k = 1; k < views; k += 1) {
        const other = (this.pass.index + k) % cameras.length;
        if (other < views && waited(other) < waited(view)) view = other;
      }
    }
    const camera = cameras[view];
    if (!this.travel(camera, view)) return false;
    const index = this.pass.index;
    // Each re-lay comes in on the other side of him.
    const side = (hash(this.prepared, index, SALT.crossSide) < 0.5 ? 1 : -1) * (this.relays % 2 === 0 ? 1 : -1);
    const range = this.tuning.crossDepthMetres;
    this.crossDepth = range[0] + hash(this.prepared, index, SALT.crossDepth) * (range[1] - range[0]);
    const bearing = BIRDS.birthBearingRadians[0]
      + hash(this.prepared, index, SALT.birthBearing) * (BIRDS.birthBearingRadians[1] - BIRDS.birthBearingRadians[0]);
    // (travelX, travelZ) turned by `bearing` towards the side (travelZ, −travelX).
    const cos = Math.cos(bearing), sin = Math.sin(bearing) * side;
    const dx = cos * this.travelX + sin * this.travelZ, dz = cos * this.travelZ - sin * this.travelX;
    const out = clearOfViews(cameras, camera.position.x, camera.position.z, dx, dz, birdEntryDistance());
    if (!Number.isFinite(out)) return false;
    this.x = camera.position.x + dx * out;
    this.z = camera.position.z + dz * out;
    this.awayHeading = Number.NaN;
    this.awayAhead = Number.NaN;
    this.turn = 0;
    this.committed = false;
    this.y = birdTargetAltitude(this.prepared, this.x, this.z);
    this.pursue(camera);
    this.heading = Math.atan2(this.targetX - this.x, this.targetZ - this.z);
    this.aimX = this.targetX;
    this.aimZ = this.targetZ;
    this.y = Math.max(this.y, this.lookAhead(this.x, this.z, this.heading));
    this.headingBefore = this.heading;
    this.bank = 0;
    this.bankBefore = 0;
    this.awayHeading = Number.NaN;
    this.aimX = this.targetX;
    this.aimZ = this.targetZ;
    this.crossAimX = this.crossX;
    this.crossAimZ = this.crossZ;
    this.turnSign = 0;
    this.pitch = 0;
    this.pitchBefore = 0;
    this.vy = 0;
    this.unseenFor = 0;
    this.closing = 0;
    this.lastRange = Number.NaN;
    this.slowFor = 0;
    this.stepped = at;
    this.rate = this.rateAt(cameras);
    this.steered = true;
    this.committed = false;
    if (!this.relaying) this.framed = false;
    this.relaying = false;
    this.aimedView = view;
    return true;
  }


  /**
   * Turn towards `wanted` (or straight on, `null`) for one step without a
   * step anywhere: a proportional command with a deadband, so it settles on
   * its aim instead of chattering around it; the turn rate slewed towards it;
   * the bank slewed towards the turn's lean. `steady` (near enough to be
   * watched): a turn the other way needs a real miss. `dt` is the step on the
   * flock's own clock (`rate` × the world step).
   */
  private steer(wanted: number | null, steady: boolean, dt: number): void {
    let command = 0;
    if (wanted !== null) {
      const error = wrapAngle(wanted - this.heading), excess = Math.abs(error) - BIRDS.steerDeadbandRadians;
      // A turn the other way from its last one needs a real error, so a jittery aim never rocks it.
      const reversing = this.turnSign !== 0 && Math.sign(error) !== this.turnSign;
      const reverseAt = steady ? BIRDS.steerReverseWatchedRadians : BIRDS.steerReverseRadians;
      if (excess > 0 && !(reversing && Math.abs(error) < reverseAt)) {
        command = Math.sign(error) * Math.min(BIRDS.steerRadiansPerSecond, BIRDS.steerGainPerSecond * excess);
      }
    }
    const slew = BIRDS.turnSlewRadiansPerSecondSquared * dt;
    this.turn += Math.max(-slew, Math.min(slew, command - this.turn));
    if (this.turn !== 0) this.turnSign = Math.sign(this.turn);
    this.headingBefore = this.heading;
    this.heading = wrapAngle(this.heading + this.turn * dt);
    // Turning towards +heading swings the nose to the flock's left (+X): it banks that wing down.
    const lean = Math.max(-BIRDS.bankLimitRadians, Math.min(BIRDS.bankLimitRadians, -(this.turn * BIRDS.speed) / PHYSICS.gravity));
    const roll = BIRDS.bankSlewRadiansPerSecond * dt;
    this.bankBefore = this.bank;
    this.bank += Math.max(-roll, Math.min(roll, lean - this.bank));
  }

  /**
   * One `steerStepSeconds` of the world clock (`wall`) for the steered flock:
   * `rate` × that on its own clock (`dt`), which moves, turns, climbs and
   * pitches it; its timers and closing speed stay on the world clock.
   */
  private step(cameras: readonly PositionedLike[]): void {
    const wall = BIRDS.steerStepSeconds, dt = wall * this.rate, ds = BIRDS.speed * dt;
    const view = (this.aimedView ?? 0) % cameras.length, camera = cameras[view];
    let aim: number | null = null, steady = false;
    if (this.committed) {
      this.committedFor += wall;
      // Seen long enough: it banks away out of its rider's view, so a flock
      // that happens to fly along with him never lingers on his screen.
      const elements = camera.matrixWorld?.elements;
      this.awayAhead = Number.NaN;
      const again = !Number.isNaN(this.awayHeading) && this.committedFor - this.awayAt >= BIRDS.awayAgainSeconds && this.unseenFor === 0;
      if ((Number.isNaN(this.awayHeading) || again) && elements !== undefined) {
        const fx = -elements[8], fz = -elements[10], flat = Math.hypot(fx, fz);
        const rx = this.x - camera.position.x, rz = this.z - camera.position.z;
        if (flat >= 0.2) {
          // Out to the side it is on, square to his view: along (forwardZ,
          // −forwardX) or its opposite. Chosen once, as a world heading, so
          // it never flips back and forth across his line of sight as he turns.
          const side = rx * fz - rz * fx >= 0 ? 1 : -1;
          const away = Math.atan2((side * fz) / flat, (-side * fx) / flat);
          // Due once seen long enough or, closing on him, near enough to read
          // well (it crosses his view instead of coming over him), while it is
          // in front of him…
          const close = Math.hypot(rx, rz) <= BIRDS.bankAwayNearMetres && this.closing > 0 && this.committedFor >= BIRDS.lingerMinSeconds;
          // …or, its rider having seen it, as soon as another pane has waited long for one (a couch: its pass comes sooner).
          let waiting = false;
          for (let other = 0; other < this.views; other += 1) waiting ||= other !== view && this.stepped - this.seenAt[other] >= BIRDS.starvedSeconds;
          const hurry = waiting && this.seenByAim && this.committedFor >= BIRDS.lingerMinSeconds;
          // Still on somebody's screen a while after it banked away (he turned
          // after it): it banks away again, from his view as it is now — only
          // on round the way it was turning, never back (no bank flip on screen).
          const onward = this.turnSign === 0 || Math.sign(wrapAngle(away - this.heading)) === this.turnSign;
          if (again ? onward && Math.abs(wrapAngle(away - this.awayHeading)) > BIRDS.steerReverseRadians
            : (this.committedFor >= BIRDS.lingerSeconds || close || hurry) && rx * fx + rz * fz > 0) {
            // …and only once it flies high enough for the way round (no higher
            // than the way it flies now asks): until then its altitude looks
            // along that way, so it climbs first and never turns into a block
            // (R17: a 110° bank-away met a tower late).
            const samples = this.prepared.lookAheadSamples, nan = Number.NaN;
            const round = this.path(this.x, this.z, this.heading, away, nan, nan, samples);
            if (round <= Math.max(this.settledY(), this.path(this.x, this.z, this.heading, this.awayHeading, nan, nan, samples)) + BIRDS.turnHeadroomMetres) {
              this.awayHeading = away;
              this.awayAt = this.committedFor;
            }
            else this.awayAhead = away;
          }
        }
      }
      if (!Number.isNaN(this.awayHeading)) aim = this.awayHeading;
      const range = Math.hypot(this.x - camera.position.x, this.z - camera.position.z);
      if (!Number.isNaN(this.lastRange)) this.closing += ((this.lastRange - range) / wall - this.closing) * Math.min(1, wall / BIRDS.relaySeconds);
      this.lastRange = range;
    } else if (this.travel(camera, view)) {
      const range = Math.hypot(this.x - camera.position.x, this.z - camera.position.z);
      this.pursue(camera);
      const smooth = Math.min(1, wall / BIRDS.aimSmoothSeconds);
      this.aimX += (this.targetX - this.aimX) * smooth;
      this.aimZ += (this.targetZ - this.aimZ) * smooth;
      this.crossAimX += (this.crossX - this.crossAimX) * smooth;
      this.crossAimZ += (this.crossZ - this.crossAimZ) * smooth;
      // Where it is and where it will cross, off his camera's forward (birds
      // critic r4: a pass must cross *that* pane's view).
      const flockOff = offForward(camera, this.x, this.z), crossOff = offForward(camera, this.crossAimX, this.crossAimZ);
      const inView = flockOff <= paneHalfWidth(camera), behind = flockOff > Math.PI / 2;
      const crossing = crossOff <= BIRDS.crossOffRadians;
      const aimNear = Math.hypot(this.aimX - this.x, this.aimZ - this.z) <= BIRDS.commitAimMetres && range <= BIRDS.commitAimRangeMetres;
      // Straight on from here (the turn eases out) once it is in his pane and
      // near (or a little further while its crossing lies in front of him), or
      // nearer still beside him, or nearly at its crossing point — never while
      // it is behind him or would cross outside his view: it keeps re-aiming.
      // The further commits wait while the way straight on asks more climb than
      // it has in hand (owner round 2: a commit mid-turn froze a heading into a
      // tower the turn after its aim would have passed); it turns on after its aim.
      const further = (inView && crossing && range <= BIRDS.commitMetres)
        || (!behind && (inView || crossing) && range <= BIRDS.commitNearMetres) || (!behind && crossing && aimNear);
      if ((inView && range <= BIRDS.commitInViewMetres) || (further && this.path(this.x, this.z, this.heading, Number.NaN,
        Number.NaN, Number.NaN, this.prepared.lookAheadSamples) <= this.settledY() + BIRDS.turnHeadroomMetres)) {
        this.committed = true;
        this.committedFor = 0;
      } else {
        // Watched (near, or anywhere in front of his view): it eases its turn, and reverses it only for a real miss.
        steady = range <= BIRDS.framedMetres || flockOff <= BIRDS.watchedConeRadians;
        aim = Math.atan2(this.aimX - this.x, this.aimZ - this.z);
        // It turns after its aim only where it already flies high enough for
        // that way (else it holds on and climbs for it first): a moving aim
        // never swings it into a block it cannot climb in time.
        {
          const samples = this.prepared.lookAheadSamples, nan = Number.NaN;
          const after = this.path(this.x, this.z, this.heading, nan, this.aimX, this.aimZ, samples);
          if (after > Math.max(this.settledY(), this.ray(this.x, this.z, this.heading, samples, 1)) + BIRDS.turnHeadroomMetres) aim = null;
        }
      }
      // How fast it closes on him: slower than he could ever see it arrive (trailing him) and it is born again ahead.
      if (!Number.isNaN(this.lastRange)) this.closing += ((this.lastRange - range) / wall - this.closing) * Math.min(1, wall / BIRDS.relaySeconds);
      this.lastRange = range;
      this.slowFor = this.closing < BIRDS.relayClosingMetresPerSecond ? this.slowFor + wall : 0;
    }
    this.steer(aim, steady, dt);
    this.x += Math.sin(this.heading) * ds;
    this.z += Math.cos(this.heading) * ds;
    const floor = birdTargetAltitude(this.prepared, this.x, this.z);
    const wanted = this.lookAhead(this.x, this.z, this.heading);
    // Eased (birds critic r3, 2c): the altitude follows what it wants over the
    // settle time, never faster than it can still ease out of, within the climb
    // (or, below its floor, the emergency climb) and descent rates, its vertical
    // speed slewed by the vertical acceleration; the pitch follows that vertical
    // speed, capped and slewed. Nothing steps.
    const accel = BIRDS.verticalAccelerationMetresPerSecondSquared, goal = Math.max(floor, wanted), error = goal - this.y;
    const ease = Math.min(Math.abs(error) / BIRDS.altitudeSettleSeconds, Math.sqrt(2 * accel * Math.abs(error)));
    const ceiling = this.y < floor || this.y < goal - BIRDS.rampSlackMetres ? BIRDS.climbEmergencyMetresPerSecond : BIRDS.climbMetresPerSecond;
    const command = Math.max(-BIRDS.descentMetresPerSecond, Math.min(ceiling, Math.sign(error) * ease));
    this.vy += Math.max(-accel * dt, Math.min(accel * dt, command - this.vy));
    this.y += this.vy * dt;
    const limit = BIRDS.pitchLimitRadians, slew = BIRDS.pitchSlewRadiansPerSecond * dt;
    const pitch = Math.max(-limit, Math.min(limit, Math.atan(this.vy / BIRDS.speed)));
    this.pitchBefore = this.pitch;
    this.pitch += Math.max(-slew, Math.min(slew, pitch - this.pitch));
    this.stepped += wall;
    this.unseenFor = this.unseen(cameras) ? this.unseenFor + wall : 0;
    // The rate for the next step, and for the frames before it (so they run on into it).
    this.rate = this.rateAt(cameras);
    // Which panes see it now (in frame, near enough to read, a clear line).
    for (let other = 0; other < Math.min(MAX_VIEWS, cameras.length); other += 1) {
      if (!this.sees(cameras[other])) {
        this.seenFor[other] = 0;
        continue;
      }
      this.seenFor[other] += wall;
      if (this.seenFor[other] >= BIRDS.seenSeconds - 1e-9) {
        this.seenAt[other] = this.stepped;
        if (other === view) this.seenByAim = true;
      }
    }
  }

  /** Where its altitude stops falling if it pulls up now (its descent eased out at the vertical acceleration), m. */
  private settledY(): number {
    return this.y - (this.vy < 0 ? (this.vy * this.vy) / (2 * BIRDS.verticalAccelerationMetresPerSecondSquared) : 0);
  }

  /**
   * One pane sees the flock: its centre inside the camera's frustum, its
   * wingspan at least `seenSpanShare` of the pane's height (≈ 40 px for the
   * nine birds at 720 rows: the birds critic's "readable"), and no skyline
   * cell standing above the line from the camera to it.
   */
  private sees(camera: PositionedLike): boolean {
    const e = camera.matrixWorld?.elements;
    if (e === undefined) return false;
    const p = camera.position, dx = this.x - p.x, dy = this.y - p.y, dz = this.z - p.z;
    const depth = -(dx * e[8] + dy * e[9] + dz * e[10]);
    if (!(depth > 1)) return false;
    const tanV = Math.tan(((camera.fov ?? 78) * Math.PI) / 360), tanH = tanV * (camera.aspect ?? 16 / 9);
    const lx = dx * e[0] + dy * e[1] + dz * e[2], ly = dx * e[4] + dy * e[5] + dz * e[6];
    if (Math.abs(lx) > depth * tanH || Math.abs(ly) > depth * tanV) return false;
    const range = Math.hypot(dx, dy, dz);
    if (BIRDS.wingspanMetres / range < BIRDS.seenSpanShare * 2 * tanV) return false;
    // The grid is coarse and stamped wide: the cells round the camera (his own
    // street) and round the flock are skipped, so only a block standing well
    // between them hides it.
    const cell = this.prepared.cellMetres, flat = Math.hypot(dx, dz), steps = Math.ceil(flat / cell);
    const skip = Math.ceil(BIRDS.seenNearSkipMetres / cell);
    for (let k = skip; k < steps - skip; k += 1) {
      const t = k / steps;
      if (skylineAt(this.prepared, p.x + dx * t, p.z + dz * t) > p.y + dy * t) return false;
    }
    return true;
  }


  /** The steered flock at world second `t` (≤ one step past the last), into `frame`. */
  private steeredFrame(t: number, frame: FlockFrame): void {
    // Run on at the rate the next step will fly (1 wherever a pane can frame it).
    const flown = Math.max(0, t - this.stepped) * this.rate, ahead = BIRDS.speed * flown;
    frame.x = this.x + Math.sin(this.heading) * ahead;
    frame.z = this.z + Math.cos(this.heading) * ahead;
    frame.y = this.y + this.vy * flown;
    // Heading, bank and pitch run one step behind, interpolated: continuous at every frame.
    const share = Math.min(1, Math.max(0, (t - this.stepped) / BIRDS.steerStepSeconds));
    frame.headingY = wrapAngle(this.headingBefore + wrapAngle(this.heading - this.headingBefore) * share);
    frame.pitch = this.pitchBefore + (this.pitch - this.pitchBefore) * share;
    frame.roll = this.bankBefore + (this.bank - this.bankBefore) * share;
  }

  /** The flock's clock rate where it flies now: `birdFlightRate` of the nearest view camera's range. */
  private rateAt(cameras: readonly PositionedLike[]): number {
    let nearest = Infinity;
    for (let index = 0; index < cameras.length; index += 1) {
      const p = cameras[index].position;
      nearest = Math.min(nearest, Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z));
    }
    return birdFlightRate(nearest);
  }

  private guarded(x: number, y: number, z: number, cameras: readonly PositionedLike[]): boolean {
    const reach = birdGuardDistance();
    for (let index = 0; index < cameras.length; index += 1) {
      const p = cameras[index].position;
      if (Math.hypot(p.x - x, p.y - y, p.z - z) < reach) return true;
    }
    return false;
  }

  /** The pass is over at world second `end`: the next one waits its quiet. */
  private finish(end: number): void {
    this.lastAimed = this.aimedView ?? -1;
    // A short quiet when nobody framed it, or a pane has waited long for a flock.
    let starved = false;
    for (let view = 0; view < this.views; view += 1) starved ||= end - this.seenAt[view] >= BIRDS.starvedSeconds;
    const gap = this.steered && (!this.framed || starved)
      ? gapOf(this.prepared, this.pass.index, this.tuning.unseenGapSeconds) : this.pass.gapSeconds;
    this.load(this.pass.index + 1);
    this.start = end + gap;
    this.phase = 'waiting';
    this.deferredEnd = false;
  }

  /** Advance to simulation second `seconds`; true when the flock is drawn at `frame`. */
  advance(seconds: number, reducedMotion: boolean, cameras: readonly PositionedLike[], frame: FlockFrame): boolean {
    if (!this.prepared.eligible) return false;
    if (this.epoch === null) this.epoch = seconds;
    const t = Math.max(0, seconds - this.epoch);
    if (t < this.worldSeconds) this.reset();
    this.worldSeconds = t;
    this.views = Math.min(MAX_VIEWS, cameras.length);
    this.track(cameras, t);
    // Bounded: a long jump walks several passes.
    for (let iteration = 0; iteration < 4096; iteration += 1) {
      if (this.phase === 'waiting') {
        if (t < this.start) return false;
        // Laid now, out of everyone's sight: steered across a view if there is one.
        if (!this.lay(cameras, this.start)) {
          flockFrameAt(this.pass, this.profile, this.profileCount, 0, frame);
          if (this.guarded(frame.x, frame.y, frame.z, cameras)) {
            this.start = t; // somebody is out there: wait, parked
            return false;
          }
        }
        this.phase = 'flying';
      }
      if (this.steered) {
        // Retire once it flies straight (or gave up its approach) and is beyond every far plane.
        let retired = false, relaid = false;
        while (this.stepped + BIRDS.steerStepSeconds <= t + 1e-9) {
          this.step(cameras);
          const done = this.committed || this.stepped - this.start >= BIRDS.approachSeconds;
          // Out of sight: beyond every far plane, or (once it has flown straight a moment) where no pane can show it.
          const gone = this.committed && this.committedFor >= BIRDS.retireCommittedSeconds
            && this.unseenFor >= BIRDS.unseenRetireSeconds;
          const ending = done && (gone || !this.guarded(this.x, this.y, this.z, cameras));
          // A pass its rider has not seen that would end, or trails him unseen
          // (closing slower than `relayClosingMetresPerSecond`), is born again
          // ahead of his shoulder instead (birds critic r4), at most `relayMax` times.
          const trailing = !this.committed && this.slowFor >= BIRDS.relaySeconds && this.unseenFor >= BIRDS.unseenRetireSeconds;
          if (!this.seenByAim && this.relays < BIRDS.relayMax && (ending || trailing)) {
            relaid = true;
            break;
          }
          if (ending) {
            retired = true;
            break;
          }
        }
        if (relaid) {
          // Parked a moment out of everyone's sight, then laid again for the same rider.
          this.relays += 1;
          this.relaying = true;
          this.phase = 'waiting';
          this.start = this.stepped + BIRDS.relayHoldSeconds;
          continue;
        }
        if (retired) {
          this.finish(this.stepped);
          continue;
        }
        this.steeredFrame(t, frame);
        if (reducedMotion) this.suppressed = this.pass.index;
        return this.suppressed !== this.pass.index;
      }
      const d = (t - this.start) * BIRDS.speed;
      flockFrameAt(this.pass, this.profile, this.profileCount, d, frame);
      const guarded = this.guarded(frame.x, frame.y, frame.z, cameras);
      if (d < this.pass.length || guarded) {
        if (d >= this.pass.length) this.deferredEnd = true;
        if (reducedMotion) this.suppressed = this.pass.index;
        return this.suppressed !== this.pass.index;
      }
      this.finish(this.deferredEnd ? t : this.start + birdPassSeconds(this.pass));
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// The price
// ---------------------------------------------------------------------------

/**
 * What a flock costs per pane, derived from the template and `BIRDS`: one
 * colour draw, two half-birds' triangles per bird, no shadow, the template's
 * position and index bytes and one matrix per instance. Zero for a world with
 * no flock. Priced whether or not a pass is under way (culling ignored).
 */
export function countBirds(prepared: PreparedBirdFlight): SupplementCount {
  if (!prepared.eligible) {
    return { colourDraws: 0, shadowDraws: 0, colourTriangles: 0, shadowTriangles: 0,
      geometryBytes: 0, instanceBytes: 0, textureBytes: 0 };
  }
  const vertices = birdTemplatePositions().length / 3;
  const indices = BIRD_TEMPLATE_INDICES.length;
  return {
    colourDraws: 1,
    shadowDraws: 0,
    colourTriangles: birdInstances() * (indices / 3),
    shadowTriangles: 0,
    geometryBytes: vertices * 3 * Float32Array.BYTES_PER_ELEMENT + indices * Uint16Array.BYTES_PER_ELEMENT,
    instanceBytes: birdInstances() * INSTANCE_MATRIX_BYTES,
    textureBytes: 0,
  };
}
