/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The camera views a seat can cycle through — 1.3.0 (`docs/PLANS.md` §50).
 *
 * One catalogue: the ids, the words on the button and in Settings, the order a
 * press walks, and every rider-relative view's composition. **Imports nothing**,
 * so the options record, the seat model and the solver can all name a view
 * without a runtime dependency on each other or on three.
 *
 * Two views are not profiles here, on purpose. `chase` is the native chase
 * camera (`render/chaseCamera.ts`), the default and the game's acceptance
 * view, untouched. `orbit` is the inspection orbit the game has had since M3 —
 * its id, maths and snapshot fields are unchanged; only its place in the cycle
 * and its label ("Inspect") are new. Everything else is solved by
 * `render/cinematicCamera.ts` from the profile below.
 *
 * Profile values started from the owner-accepted NYC spin-off and were judged
 * again in this game. NYC's lenses are 46°–60° against our native chase's
 * 65°–78°, so they are widened toward ours; degrees are converted to radians
 * **here, once**, and the renderer applies the split widening to whatever
 * arrives (`Renderer.setFieldOfView`), so nothing downstream widens twice.
 */

export type CameraViewId =
  | 'chase'
  | 'action'
  | 'firstPerson'
  | 'avenue'
  | 'elevated'
  | 'side'
  | 'crossroads'
  | 'overlook'
  | 'architecture'
  | 'director'
  | 'orbit';

/** The order one press walks, wrapping from Inspect back to Chase. */
export const CAMERA_VIEW_CYCLE: readonly CameraViewId[] = Object.freeze([
  'chase',
  'action',
  'firstPerson',
  'avenue',
  'elevated',
  'side',
  'crossroads',
  'overlook',
  'architecture',
  'director',
  'orbit',
] as CameraViewId[]);

/** Every new ride starts here unless the host picked another in Settings. */
export const DEFAULT_CAMERA_VIEW: CameraViewId = 'chase';

/** The name a player reads: the HUD cue and the VIEW chip's accessible name. */
export const CAMERA_VIEW_LABELS: Readonly<Record<CameraViewId, string>> = Object.freeze({
  chase: 'Chase',
  action: 'Action',
  firstPerson: 'First-Person',
  avenue: 'Avenue',
  elevated: 'Elevated',
  side: 'Side Tracking',
  crossroads: 'Crossroads',
  overlook: 'Overlook',
  architecture: 'Architecture',
  director: 'Director',
  orbit: 'Inspect',
});

/**
 * The word on a Settings button: short, so eleven fit a six-and-five grid on
 * a phone. The button's accessible name is the full label.
 */
export const CAMERA_VIEW_SHORT_LABELS: Readonly<Record<CameraViewId, string>> = Object.freeze({
  chase: 'Chase',
  action: 'Action',
  firstPerson: 'POV',
  avenue: 'Avenue',
  elevated: 'Elevated',
  side: 'Side',
  crossroads: 'Cross',
  overlook: 'Overlook',
  architecture: 'Arch',
  director: 'Director',
  orbit: 'Inspect',
});

export function isCameraViewId(value: unknown): value is CameraViewId {
  return typeof value === 'string' && (CAMERA_VIEW_CYCLE as readonly string[]).includes(value);
}

/** The view one press moves to. An unknown id starts the cycle again. */
export function nextCameraView(current: CameraViewId): CameraViewId {
  const at = CAMERA_VIEW_CYCLE.indexOf(current);
  return CAMERA_VIEW_CYCLE[(at + 1) % CAMERA_VIEW_CYCLE.length];
}

/** The views `render/cinematicCamera.ts` solves. */
export type CinematicViewId = Exclude<CameraViewId, 'chase' | 'orbit'>;

export function isCinematicView(id: CameraViewId): id is CinematicViewId {
  return id !== 'chase' && id !== 'orbit';
}

/**
 * One rider-relative composition. Offsets are metres in the rider's own
 * heading frame and heights are above the rider's contact patch — never above
 * world zero, so every view rides up a hill with the rider.
 */
export interface CinematicProfile {
  /**
   * `follow` is a polar arm eased around the rider; `action` is the same arm
   * lengthened by speed; `eye` sits at the rider's eye and looks down the road.
   */
  readonly kind: 'follow' | 'action' | 'eye';
  /** Behind the rider, m. Negative is ahead (the eye sits just in front of the face). */
  readonly back: number;
  /** Sideways, m; the side it falls on is a per-seat choice (clearer side). */
  readonly side: number;
  /** Camera height above the contact patch, m. */
  readonly height: number;
  /** How far ahead of the rider the camera aims, m. */
  readonly lookAhead: number;
  /** Aim height above the contact patch, m. */
  readonly lookHeight: number;
  /** Vertical field of view, radians. */
  readonly fov: number;
  /** Automatic orbit, rad/s. Director only; zero for every other view. */
  readonly orbitRate: number;
  /** Easing rate for this view's polar quantities, 1/s. */
  readonly followRate: number;
  /** Compare both sides every so often and ease to the clearer one. */
  readonly sideChoice: boolean;
  /**
   * How a narrow (portrait) pane changes this view, at full narrowness: the
   * arm (and its height) scales by `1 + portraitArm`, and the aim moves
   * `portraitLead` metres further down the road. NYC tightened every view in
   * portrait (−0.12 and the look-ahead scaled away); a phone held upright
   * keeps our vertical lens, so its horizontal coverage collapses, and the
   * views that look across the rider need the opposite — pull back and lead.
   * Interpolated by the pane's aspect, so a landscape pane is untouched.
   */
  readonly portraitArm: number;
  readonly portraitLead: number;
  /**
   * Radians added to the vertical lens at full narrowness: an upright phone
   * shows ~29° across at 58° up, too little to see a rider *and* the road
   * from beside him. Only the views that look across the rider take it.
   */
  readonly portraitFov: number;
  /** Share of the sideways offset added at full narrowness (negative pulls the camera in behind). */
  readonly portraitSide: number;
  /** Pull in along the arm when something solid is in the way. */
  readonly obstruction: boolean;
  /** Use the native chase framing while the rider is down. */
  readonly crashFallback: boolean;
  /** Ride the native chase's airborne height lag and landing dip. */
  readonly airLag: boolean;
}

const degrees = (value: number): number => (value * Math.PI) / 180;

/** Defaults every follow profile shares; each entry below states what differs. */
const FOLLOW = {
  kind: 'follow',
  orbitRate: 0,
  followRate: 4,
  sideChoice: false,
  portraitArm: 0,
  portraitLead: 0,
  portraitFov: 0,
  portraitSide: 0,
  obstruction: true,
  // A crash throws the rider up to a few metres from the wheel the pose
  // follows; a fixed composition loses one of them (the first captures lost
  // the rider from Elevated, Side and Crossroads). The native chase's crash
  // framing (M6) is built to hold both, so every view hands it the pane while
  // the rider is down, and takes it back on the way up.
  crashFallback: true,
  airLag: true,
} as const;

/**
 * Eye height above the contact patch, m: the middle of Cool Rider's visor on
 * the wheel, measured from the built rig at the riding pose (the head mesh's
 * centre stands about 1.83 m over the ground). Every rider shares the one
 * skeleton, so one number serves them all.
 */
export const EYE_HEIGHT = 1.78;

export const CINEMATIC_PROFILES: Readonly<Record<CinematicViewId, CinematicProfile>> = Object.freeze({
  // The critic pass (§50): the rider no longer sits on the road's vanishing
  // point — further out to the side, aim lifted and further ahead.
  action: Object.freeze({
    ...FOLLOW,
    kind: 'action',
    back: 2.4,
    side: 1.45,
    height: 1.0,
    lookAhead: 5,
    lookHeight: 1.2,
    fov: degrees(66),
    followRate: 6,
    portraitArm: 0.35,
    portraitSide: -0.45,
  }),
  firstPerson: Object.freeze({
    ...FOLLOW,
    kind: 'eye',
    back: -0.3,
    side: 0,
    height: EYE_HEIGHT,
    lookAhead: 40,
    lookHeight: EYE_HEIGHT - 0.12,
    fov: degrees(76),
    followRate: 12,
    obstruction: false,
    airLag: false,
  }),
  // Lower and longer than Chase, a narrower lens and the aim well down the road.
  avenue: Object.freeze({
    ...FOLLOW, back: 10, side: 0, height: 2.2, lookAhead: 6, lookHeight: 1.2, fov: degrees(52),
    portraitArm: -0.12,
  }),
  // Aimed down the road so the rider sits in the lower third.
  elevated: Object.freeze({
    ...FOLLOW, back: 7.5, side: 0, height: 6.2, lookAhead: 5, lookHeight: 0.8, fov: degrees(60),
    portraitLead: 3,
  }),
  // Raised a little over a co-rider's helmet; in portrait it pulls back and
  // leads so the road ahead is in the pane, not behind the rider's nose.
  side: Object.freeze({
    ...FOLLOW, back: 1.5, side: 6, height: 2.5, lookAhead: 1.5, lookHeight: 1.0, fov: degrees(58),
    sideChoice: true, portraitArm: 0.6, portraitLead: 1.5, portraitFov: 0.4,
  }),
  crossroads: Object.freeze({
    ...FOLLOW, back: 5.2, side: 5.2, height: 3.6, lookAhead: 1.5, lookHeight: 1.1, fov: degrees(62),
    sideChoice: true, portraitArm: 0.15, portraitLead: 1, portraitFov: 0.25,
  }),
  // Overhead, but tilted forward: the rider in the lower third and twice the
  // road ahead in view.
  overlook: Object.freeze({
    ...FOLLOW, back: 6, side: 0, height: 12, lookAhead: 4, lookHeight: 0, fov: degrees(56),
    portraitLead: 1,
  }),
  // Close and low: the rider about a third of the frame, the aim lifted only
  // enough to stand him against what is behind — not a sky shot. 1.3 m up so
  // benches, bins and planters (non-occluding dressing) fall below the line.
  architecture: Object.freeze({
    ...FOLLOW, back: 2.4, side: 3.2, height: 1.3, lookAhead: 0.5, lookHeight: 1.45, fov: degrees(62),
    sideChoice: true,
  }),
  // Higher, wider and further out than Elevated, from a three-quarter angle,
  // circling once every ~70 s relative to the rider's heading; aimed high
  // enough to keep the skyline, so it never reads as Overlook.
  director: Object.freeze({
    ...FOLLOW, back: 8.5, side: 6.5, height: 7, lookAhead: 1, lookHeight: 1.6, fov: degrees(54),
    orbitRate: 0.09,
  }),
});
