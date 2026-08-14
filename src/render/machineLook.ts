/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { DEFAULT_MACHINE, type MachineId } from '../data/machines.ts';

/**
 * What a machine *looks like* — M19 Phase 2's axis.
 *
 * `data/machines.ts` holds the roster and the contract; this file holds the
 * appearance each entry resolves to, exactly as `render/riderLook.ts` does for
 * riders and under the same rule: **one machine geometry, many looks.** Every
 * number a look carries is appearance — patch spans, colours, a saddle profile.
 * The four `MACHINE_CONTRACT` constants never appear here, and
 * `data/machines.test.ts` audits the tree so they cannot arrive silently.
 *
 * ## Why the standard entry is a table of the numbers `euc.ts` used to own
 *
 * Phase 2's entire job is to be a provable no-op (`docs/PLANS.md` §19.6): the
 * standard machine must come out of the parameterised builder *identical to
 * the call and to the triangle*. So the entry below is not a redesign — it is
 * the accent strips, the nose blade, the headlight patch and the carry handle
 * moved here verbatim, and `render/redRider.test.ts` measures that nothing
 * moved. A refactor and a feature landing together is a refactor whose
 * regressions are invisible; the red machine is a separate entry added by a
 * separate phase.
 *
 * ## The two decoration channels, and which to prefer
 *
 * **Paint before patches** (`docs/PLANS.md` §19.2 fact 2). Every machine
 * material sets `vertexColors: true`, so `paintShell` can turn any region of
 * the shell another colour for zero draw calls — the technique
 * `render/copRider.ts` proved with its painted headlamp square, promoted here
 * to a channel every machine reads. A patch is a mesh's worth of triangles in
 * the shared trim draw call and buys *relief* — a lifted edge, a panel
 * shadow — which paint cannot. Spend triangles on silhouette, paint on colour.
 *
 * One direction rule the painter must respect: a vertex colour is a
 * *multiplier*, so paint can only darken or re-hue a base that has the
 * channels to spare. Red can be painted down to black; black cannot be
 * painted up to red. A machine whose livery needs a saturated colour must
 * carry it in `shell.colour` and paint the *other* regions dark — never the
 * reverse.
 */

/**
 * A decoration panel on one of the machine's lofted surfaces.
 *
 * `from`/`to` are heights in metres — absolute for the shell (`y = 0` is the
 * ground), local for a pad (`y = 0` is the pad's centre) — converted to ring
 * space with `vAtHeight` by the builder, so a reshaped profile cannot silently
 * move a panel. A `pad` patch is built once per side, mirrored across the
 * machine's X axis, because a machine is symmetric and a plate that exists on
 * one flank only would read as a defect.
 */
export interface MachinePatch {
  /** Which surface carries it. Default `'shell'`. */
  readonly surface?: 'shell' | 'pad';
  /** Angular span, radians, measured from +X (the rider's left). Front is π/2. */
  readonly u0: number;
  readonly u1: number;
  /** Vertical span, metres, in the surface's own frame. */
  readonly from: number;
  readonly to: number;
  readonly uSegments?: number;
  readonly vSegments?: number;
  readonly lift?: number;
  readonly sink?: number;
  readonly taper?: number;
  /** Vertex multiplier over the trim material's colour. 1 is the colour. */
  readonly shade?: number;
}

/** One ring of a saddle loft. Heights are absolute metres, like the shell's. */
export interface MachineSaddleRing {
  readonly y: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  /** Forward offset, metres. A kicked tail is a ring slid rearward. */
  readonly z?: number;
  readonly square?: number;
}

/** One absolute section of a machine-specific cosmetic shell. */
export interface MachineShellRing {
  readonly y: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly z?: number;
  readonly square?: number;
}

export interface MachineLook {
  readonly machine: MachineId;

  /**
   * The shell's material and, when silhouette is part of the look, its cosmetic
   * loft. Omit `profile` to retain the standard WHEEL-derived body exactly. A
   * profile may not carry any tyre, pedal, or suspension contract dimension.
   */
  readonly shell: {
    readonly colour: number;
    readonly roughness: number;
    readonly profile?: readonly MachineShellRing[];
  };

  /**
   * What stands on the shell's top face: the carry handle every EUC has, or a
   * saddle bolted over it. Exclusive, and that is deliberate honesty — a
   * handle under a saddle is a handle no hand can reach, and the triangles
   * would be spent drawing a part the saddle exists to bury.
   *
   * `tint` is the saddle's vertex multiplier over `shell.colour`, per channel,
   * because the saddle merges into the shell mesh to stay off the draw-call
   * bill — and a black cushion on a red machine needs a hue change, which a
   * scalar shade cannot make (the `parts.neck` lesson, one file over).
   */
  readonly top:
    | { readonly kind: 'handle' }
    | {
      readonly kind: 'saddle';
      readonly profile: readonly MachineSaddleRing[];
      readonly tint: readonly [number, number, number];
    };

  /**
   * The trim mesh: every decoration patch, merged under one material — the
   * slot the standard machine's blue accent strips occupy. One draw call
   * regardless of how many patches a look authors, which is what lets Red
   * Rider's guard set cost the same calls as Cool Rider's two stripes.
   */
  readonly trim: {
    readonly colour: number;
    readonly emissive: number;
    readonly emissiveIntensity: number;
    readonly roughness: number;
    readonly metalness: number;
    readonly patches: readonly MachinePatch[];
  };

  /** The headlight: its patch on the nose, and what it glows. */
  readonly headlight: {
    readonly patch: MachinePatch;
    readonly emissive: number;
    readonly emissiveIntensity: number;
  };

  /**
   * Vertex repaint of the shell's merged geometry, run once at build — the
   * cop's painted headlamp square, promoted from a one-off in
   * `render/copRider.ts` to the channel it always deserved to be. The
   * geometry arrives with its `color` attribute written and its bounding box
   * computable; the painter owns which vertices to touch.
   */
  readonly paintShell?: (geometry: THREE.BufferGeometry) => void;

  /**
   * The same channel for each pedal's merged geometry. `side` is +1 for the
   * rider's LEFT pedal (+X), -1 for their right, so a painter can mirror.
   */
  readonly paintPedal?: (geometry: THREE.BufferGeometry, side: number) => void;
}

/**
 * The standard wheel, exactly as `render/euc.ts` has always built it.
 *
 * Every number here is moved, not authored: the shoulder strips at 0.545 to
 * 0.575 m, the nose blade, the headlight patch, and the handle the shell has
 * carried since M11. Change one and `redRider.test.ts`'s no-op measurement
 * fails — which is the point of it being a test rather than a promise.
 */
export const STANDARD_MACHINE_LOOK: MachineLook = {
  machine: 'standard',

  shell: { colour: BLOCKOUT_COLOURS.shell, roughness: 0.45 },

  top: { kind: 'handle' },

  // Cool Rider's identity colour, previewed on the wheel's accent strips so
  // the black/reflective-blue language is present from the first frame. The
  // strips sit on the shoulder and the nose deliberately: the leg pads cover
  // the shell's mid flank completely, so a stripe there is a stripe nobody
  // sees.
  trim: {
    colour: BLOCKOUT_COLOURS.accent,
    emissive: 0x1c4f9c,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.2,
    patches: [
      {
        u0: -0.55,
        u1: 0.55,
        from: 0.545,
        to: 0.575,
        lift: 0.005,
        sink: -0.010,
        uSegments: 8,
        vSegments: 2,
      },
      {
        u0: Math.PI - 0.55,
        u1: Math.PI + 0.55,
        from: 0.545,
        to: 0.575,
        lift: 0.005,
        sink: -0.010,
        uSegments: 8,
        vSegments: 2,
      },
      {
        u0: Math.PI / 2 - 0.62,
        u1: Math.PI / 2 + 0.62,
        from: 0.430,
        to: 0.468,
        lift: 0.005,
        sink: -0.010,
        uSegments: 8,
        vSegments: 2,
        taper: 0.35,
      },
    ],
  },

  headlight: {
    patch: {
      u0: Math.PI / 2 - 0.44,
      u1: Math.PI / 2 + 0.44,
      from: 0.502,
      to: 0.530,
      lift: 0.004,
      sink: -0.012,
      uSegments: 6,
      vSegments: 2,
      taper: 0.40,
    },
    emissive: BLOCKOUT_COLOURS.headlight,
    emissiveIntensity: 1.4,
  },
};

// -- Red Rider's wheel — M19 Phase 3 ----------------------------------------

/**
 * The livery's three paint values, shared by the painter below.
 *
 * `CORE` is the black structural polymer — battery case, arch skirt, side
 * panels — reached by multiplying the red base down: the red channel is
 * crushed and the green/blue channels are left proportionally higher so the
 * result is a neutral charcoal rather than a deep maroon, which on a machine
 * reads as unpainted plastic exactly as intended. `CAVITY` is one step darker
 * for the two recesses that have to read as *holes*: the headlight's square
 * cavity and the rear spine column behind the status light — the bezel that
 * keeps `statusCritical` readable against his red shell (§19.7's collision,
 * fixed in paint). `RED_STEEL` is the pedal hangers' multiplier over the
 * pedal metal's grey.
 */
const CORE: readonly [number, number, number] = [0.045, 0.30, 0.33];
const CAVITY: readonly [number, number, number] = [0.028, 0.19, 0.21];
const RED_STEEL: readonly [number, number, number] = [2.1, 0.16, 0.18];

/**
 * Red Rider's machine, from the owner's mockup (`references/red-rider/red
 * rider wheel mockup.png`) and the customization addendum beside it.
 *
 * What the mockup asks for and how each part is paid for, in the §19.3 order
 * of what carries at chase distance — colour field, silhouette, then detail:
 *
 * - **Red bodywork over black structure** — the colour field, free. Red base
 *   colour, black painted down (see `BLOCKOUT_COLOURS.machineRed`).
 * - **The saddle** — the silhouette, and the one genuinely new form. Merged
 *   into the shell mesh (triangles, no draw call) in the carry handle's
 *   place: a saddle is bolted over the top face, so the handle under it would
 *   be spent drawing a part no hand can reach.
 * - **The angular cowl, corner guards and rails** — relief, as trim patches
 *   in the accent slot: one draw call however many pieces, same as the
 *   standard machine's two stripes.
 * - **The nameplate** — a red plate with a dark embossed bar and four bolts
 *   on each pad, *shape rather than type* (§19.3): nobody resolves engraved
 *   text at riding distance, and the legible RED RIDER wordmark lives on his
 *   chooser card where a player is actually reading names.
 * - **The recessed projector headlight** — the standard patch pulled rounder
 *   and cooler inside a painted cavity, between red cowl cheeks.
 * - **Red pedal hangers** — the mockup's one flash of colour below the axle,
 *   painted onto the pedal metal.
 *
 * What the mockup shows and this look deliberately does not build: the
 * honeycomb pedal lattice and the tyre's V-groove tread (normal-map detail a
 * chase camera cannot resolve — and this project ships no texture maps), and
 * a light *beam* (a shadow-casting spotlight per machine is a renderer
 * redesign, not a livery).
 */
export const RED_RIDER_MACHINE_LOOK: MachineLook = {
  machine: 'red-rider',

  shell: {
    colour: BLOCKOUT_COLOURS.machineRed,
    roughness: 0.42,
    // The shared shell is 0.52 m long — deliberately close to the tyre's
    // diameter — and it makes this red livery read as a round pod in side
    // view. Red Rider's reference carries a narrower, near-vertical tower.
    // These cosmetic sections keep the same width at the rider's legs and the
    // same axle-height start, but pull the fore/aft shoulders inward and square
    // the side panels. Tyre, pedals and suspension remain the shared machine
    // contract; only the bodywork silhouette changes.
    profile: [
      { y: 0.250, halfWidth: 0.052, halfDepth: 0.125, square: 3.0 },
      { y: 0.330, halfWidth: 0.096, halfDepth: 0.185, square: 3.8 },
      { y: 0.430, halfWidth: 0.110, halfDepth: 0.215, square: 4.2 },
      { y: 0.520, halfWidth: 0.108, halfDepth: 0.215, square: 4.4 },
      { y: 0.565, halfWidth: 0.098, halfDepth: 0.195, square: 4.0 },
      { y: 0.595, halfWidth: 0.080, halfDepth: 0.160, square: 3.6 },
    ],
  },

  top: {
    kind: 'saddle',
    // Absolute metres. The pan ring sinks below the shell's top face (0.586)
    // so the cushion sits bolted rather than floating. The earlier profile
    // spread to 0.364 m in side view while rising only 0.056 m, which made the
    // whole machine read as a rounded horizontal pod. This one reaches the
    // same hard clearance ceiling through a narrower, squarer stack, with the
    // upper rings still sliding rearward for the mockup's kicked tail. The
    // rider stands, and at a full crouch the hips come down to
    // `RIDER.hipHeight - crouchHipDrop` = 0.75 — `redRider.test.ts` asserts
    // the cushion keeps a hand's breadth under that.
    profile: [
      { y: 0.578, halfWidth: 0.048, halfDepth: 0.124, square: 3.6 },
      { y: 0.596, halfWidth: 0.068, halfDepth: 0.162, square: 4.2 },
      { y: 0.626, halfWidth: 0.064, halfDepth: 0.156, z: -0.010, square: 4.4 },
      { y: 0.650, halfWidth: 0.050, halfDepth: 0.128, z: -0.020, square: 3.6 },
    ],
    // Black leatherette, not scalar-dark red: the hue change needs channels.
    tint: [0.05, 0.30, 0.34],
  },

  trim: {
    colour: BLOCKOUT_COLOURS.machineTrimRed,
    // No glow. Cool Rider's blue strips shimmer because they are his identity
    // preview; armour plastic that glowed would read as a second status light.
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.30,
    metalness: 0.15,
    patches: [
      // The front cowl: brow over the light and one long blade down each side
      // of its cavity. The first wheel stopped both cheeks at 0.462 m and then
      // joined them with one broad horizontal chin; in the real camera that
      // made the red mass a squat oval. The separated blades now run almost
      // to the axle, leaving a black centre between them like the tall open
      // armor route in the character reference. Front centre is π/2.
      {
        u0: Math.PI / 2 - 0.66,
        u1: Math.PI / 2 + 0.66,
        from: 0.548,
        to: 0.582,
        lift: 0.011,
        sink: -0.010,
        uSegments: 8,
        vSegments: 2,
        taper: 0.22,
      },
      {
        u0: Math.PI / 2 + 0.26,
        u1: Math.PI / 2 + 0.62,
        from: 0.292,
        to: 0.552,
        lift: 0.012,
        sink: -0.010,
        uSegments: 3,
        vSegments: 7,
        taper: 0.08,
      },
      {
        u0: Math.PI / 2 - 0.62,
        u1: Math.PI / 2 - 0.26,
        from: 0.292,
        to: 0.552,
        lift: 0.012,
        sink: -0.010,
        uSegments: 3,
        vSegments: 7,
        taper: 0.08,
      },
      // Rear corner guards, flanking the painted spine column. They stop 0.30
      // rad short of rear centre (-π/2) so the status light keeps its dark
      // bezel — red armour crowding that light is exactly the §19.7 collision.
      // Like the front blades, they now reach down toward the axle so the rear
      // silhouette has one continuous vertical route instead of a red cap.
      {
        u0: -Math.PI / 2 + 0.30,
        u1: -Math.PI / 2 + 0.62,
        from: 0.292,
        to: 0.574,
        lift: 0.012,
        sink: -0.010,
        uSegments: 3,
        vSegments: 7,
        taper: 0.08,
      },
      {
        u0: -Math.PI / 2 - 0.62,
        u1: -Math.PI / 2 - 0.30,
        from: 0.292,
        to: 0.574,
        lift: 0.012,
        sink: -0.010,
        uSegments: 3,
        vSegments: 7,
        taper: 0.08,
      },
      // Upper side rails along the shoulder, where the standard strips sit —
      // they tie the cowl to the corner guards when the wheel is seen side-on.
      {
        u0: -0.30,
        u1: 0.30,
        from: 0.548,
        to: 0.580,
        lift: 0.009,
        sink: -0.010,
        uSegments: 4,
        vSegments: 2,
      },
      {
        u0: Math.PI - 0.30,
        u1: Math.PI + 0.30,
        from: 0.548,
        to: 0.580,
        lift: 0.009,
        sink: -0.010,
        uSegments: 4,
        vSegments: 2,
      },
      // Tall side frames around the nameplate. These sit on the pads rather
      // than disappearing behind them on the shell, and their relief makes
      // the long verticals affect the side silhouette as well as its colour.
      // The central plate remains the identity detail; these rails establish
      // the machine's proportion before that detail can be read.
      {
        surface: 'pad',
        u0: -0.70,
        u1: -0.48,
        from: -0.090,
        to: 0.090,
        lift: 0.010,
        sink: -0.008,
        uSegments: 2,
        vSegments: 5,
        taper: 0.08,
      },
      {
        surface: 'pad',
        u0: 0.48,
        u1: 0.70,
        from: -0.090,
        to: 0.090,
        lift: 0.010,
        sink: -0.008,
        uSegments: 2,
        vSegments: 5,
        taper: 0.08,
      },
      // The nameplate, once per pad (a `pad` patch builds mirrored): the red
      // plate, the dark embossed name bar, and four recessed bolts. Heights
      // are pad-local metres; the pad is 0.20 tall.
      {
        surface: 'pad',
        u0: -0.55,
        u1: 0.55,
        from: -0.048,
        to: 0.048,
        lift: 0.010,
        sink: -0.008,
        uSegments: 4,
        vSegments: 3,
      },
      {
        surface: 'pad',
        u0: -0.34,
        u1: 0.34,
        from: -0.002,
        to: 0.024,
        lift: 0.014,
        sink: -0.006,
        uSegments: 3,
        vSegments: 1,
        // Embossed, not engraved-black: the first capture's 0.30 bar swallowed
        // the plate and the whole thing read as a dark inset with a red rim.
        // The plate is the mockup's red; the bar is one firm value below it.
        shade: 0.45,
      },
      { surface: 'pad', u0: -0.50, u1: -0.40, from: 0.028, to: 0.040, lift: 0.016, sink: -0.006, shade: 0.30 },
      { surface: 'pad', u0: 0.40, u1: 0.50, from: 0.028, to: 0.040, lift: 0.016, sink: -0.006, shade: 0.30 },
      { surface: 'pad', u0: -0.50, u1: -0.40, from: -0.040, to: -0.028, lift: 0.016, sink: -0.006, shade: 0.30 },
      { surface: 'pad', u0: 0.40, u1: 0.50, from: -0.040, to: -0.028, lift: 0.016, sink: -0.006, shade: 0.30 },
    ],
  },

  headlight: {
    // A compact projector, not a strip — recessed harder into its painted
    // cavity, and stopped 0.05 rad short of the cowl cheeks at ±0.26 so the
    // cavity's dark margin shows all the way round the lens. The first
    // capture had it at ±0.30: a wide white diamond whose corners ran under
    // the cheeks, which is a light bar, not a projector. The taller shell's
    // flatter nose made ±0.17 read as a white slit, so the final aperture is
    // narrower and slightly taller — square enough to keep the reference's
    // single projector read.
    patch: {
      u0: Math.PI / 2 - 0.13,
      u1: Math.PI / 2 + 0.13,
      from: 0.497,
      to: 0.537,
      lift: 0.006,
      sink: -0.014,
      uSegments: 6,
      vSegments: 2,
      taper: 0.55,
    },
    emissive: BLOCKOUT_COLOURS.machineHeadlightCool,
    emissiveIntensity: 1.9,
  },

  paintShell: (geometry): void => {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);

      // The saddle is tinted at build and repainted identically here so the
      // bands below cannot half-recolour it: everything above the shell's
      // shoulder line is the black cushion and its pan.
      if (y > 0.578) {
        colour.setXYZ(i, 0.05, 0.30, 0.34);
        continue;
      }
      // The arch skirt and lower structure, all the way round. The red chin
      // blade rides *over* this as a lifted patch, which is what makes it a
      // guard on a black arch rather than paint on paint.
      if (y < 0.372) {
        colour.setXYZ(i, CORE[0], CORE[1], CORE[2]);
        continue;
      }
      // Side battery panels: the flank between skirt and shoulder, kept clear
      // of the nose and tail corners where the cowl and guards live. Mostly
      // behind the leg pads — what shows is the black margin above and below
      // them, which is exactly the mockup's core-between-armour read.
      if (Math.abs(z) < 0.13 && Math.abs(x) > 0.06 && y < 0.548) {
        colour.setXYZ(i, CORE[0], CORE[1], CORE[2]);
        continue;
      }
      // The headlight's recessed cavity: a dark square the projector patch
      // sits inside, its painted margin showing all round the lens.
      if (z > 0.16 && Math.abs(x) < 0.062 && y > 0.490 && y < 0.545) {
        colour.setXYZ(i, CAVITY[0], CAVITY[1], CAVITY[2]);
        continue;
      }
      // The rear spine column: taillight surround and the status light's
      // bezel in one dark band. This is the fix for the statusCritical
      // collision — the ladder's red warning pulses against near-black here,
      // where the standard machine shows it against mid grey.
      if (z < -0.15 && Math.abs(x) < 0.07 && y > 0.400) {
        colour.setXYZ(i, CAVITY[0], CAVITY[1], CAVITY[2]);
      }
    }
  },

  paintPedal: (geometry, side): void => {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      // The hanger bracket climbing to the shell, and the fold hinge at the
      // plate's inboard edge — the mockup's red mounts. The plate, grip and
      // lip keep the machined metal the standard pedal has.
      const inboard = position.getX(i) * -side;
      if (y > 0.015 || inboard > 0.0675) {
        colour.setXYZ(i, RED_STEEL[0], RED_STEEL[1], RED_STEEL[2]);
      }
    }
  },
};

const MACHINE_LOOKS: readonly MachineLook[] = Object.freeze([
  STANDARD_MACHINE_LOOK,
  RED_RIDER_MACHINE_LOOK,
]);

/**
 * Resolve a machine's look, falling back the way `machineSpec` does and for
 * the same hostile-input reason: an id out of an older build's saved options
 * has to resolve to *something*, and the standard wheel is the something.
 */
export function machineLook(id: MachineId): MachineLook {
  return MACHINE_LOOKS.find((look) => look.machine === id)
    ?? MACHINE_LOOKS.find((look) => look.machine === DEFAULT_MACHINE)
    ?? MACHINE_LOOKS[0];
}
