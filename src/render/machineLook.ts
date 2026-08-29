/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { DEFAULT_MACHINE, type MachineId } from '../data/machines.ts';
import { tintOver, type Tint, type UvRect } from './blockoutKit.ts';
import { ATLAS_REGIONS, createMaribelAtlas, type AtlasRegionName } from './maribelAtlas.ts';

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
  /**
   * Which leg-pad block a `surface: 'pad'` patch lands on. Defaults to the
   * first. Only meaningful for a look whose pads are built from several.
   */
  readonly block?: number;
  /**
   * Its page of the look's printed sheet — M23 Phase A2.
   *
   * The rider's mechanism (`RiderPatch.art`) pointed at a machine, and for the
   * same reason: a patch can carry relief and a flat colour, and a *mark* is
   * neither. Adonisb2's angry eyes are the counter-example that proves the
   * boundary — three nested rectangles were enough for eyes because eyes are
   * rectangles at that size, and Maribel's grinning devil is not.
   */
  readonly art?: string;
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
  /**
   * Diagonal shear: the height span slides by this many rings across the
   * angular span. An angry eyebrow is a sheared band, not a bent box.
   */
  readonly skew?: number;
  readonly taper?: number;
  /** Vertex multiplier over the trim material's colour. 1 is the colour. */
  readonly shade?: number;
  /**
   * The same multiplier per channel — and the reason it exists is M22.
   *
   * `shade` is a scalar, and a scalar cannot change hue. That was enough while
   * every trim slot held one colour: Cool Rider's strips are blue on a blue
   * material, Red Rider's guards red on a red one. Adonisb2's nose plate is
   * green, its eyes are white, its pupils are near-black and the chevrons
   * between his light panels are blue — four hues on one material, which the
   * direction rule at the top of this file says can only be reached by
   * painting *down* from a pale base. `tint` is that paint; it overrides
   * `shade` when both are given.
   */
  readonly tint?: Tint;
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

/**
 * One section of a leg pad, in metres about the pad's centre height.
 *
 * The same shape a shell ring is, measured about a different origin, and named
 * separately so a look cannot pass one where the other belongs.
 */
export interface MachinePadRing {
  readonly y: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly square?: number;
  readonly z?: number;
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
   * The leg-contact pads — M23 Phase A2, and the first look to want them.
   *
   * They were a shared constant for four machines because four machines had
   * black pads: a pad is the part a rider's shins press against, and every
   * reference machine before hers wears the same scuffed near-black there.
   * Hers are **purple**, in both the regenerated render and her own logo, and
   * they are the single largest colour field on the wheel — a pad is a hand's
   * breadth of flat surface at exactly shin height, which is why a machine
   * that wants to be *seen* from the chase camera puts its colour there rather
   * than on the shell.
   *
   * Omitted by every other look, which keeps `BLOCKOUT_COLOURS.pad`.
   */
  readonly pads?: {
    readonly colour?: number;
    readonly roughness?: number;
    /**
     * The pad's blocks, each a section in metres about `WHEEL.padCentreHeight`
     * — A1d.
     *
     * **Because "purple pads" turned out to be a shape, not a colour.** Every
     * machine before hers wore the shared pad: a flat slab from 0.34 to 0.54,
     * which is what a commuter's grip pad is. The owner's note on her real
     * wheel — *"it has a black seat surrounded by all the purple"* — describes
     * something else entirely: tall moulded power pads that rise past the
     * shell's shoulder and flank a black top plate, which is also what both
     * photographs and the reference render show.
     *
     * **A list, because hers is not one slab.** The shared pad is a single
     * soft-cornered loft, which is what a commuter's grip pad is; the photo of
     * her own machine shows separate angular blocks with black bodywork
     * showing between them. Every block merges into the same per-side mesh, so
     * however many a look authors the pads still cost what one pad cost.
     *
     * The **outer face does not move**: `halfWidth` stays at the shared pad's
     * thickness through the whole leg-contact band, so a restyled pad is
     * restyled and nothing else. `render/riderClearance.test.ts` is what holds
     * that promise, and `render/riderEuc.test.ts` still owns where the boots
     * land.
     */
    readonly blocks?: readonly (readonly MachinePadRing[])[];
    /** Sections around each block. The shared pad uses 12. */
    readonly segments?: number;
    /**
     * Vertex repaint of the merged per-side pad, in pad-local space — A1d.
     *
     * `paintShell`'s twin, for the same reason and with the same cost. A
     * moulded block reads as a block because its top plane is a stop brighter
     * than its outer one; a loft's own normals under one hard sun will not do
     * that at forty pixels, and the reference's pads read as blocks in every
     * photograph. Runs before the mesh is positioned, so `y` is measured about
     * the pad's centre height and `side` is +1 for the rider's left.
     */
    readonly paintPad?: (geometry: THREE.BufferGeometry, side: number) => void;
  };

  /**
   * A printed sheet for the trim mesh — M23 Phase A2.
   *
   * The rider's `RiderAtlas` with the rig-shaped parts taken out: one texture,
   * one material, and a page per patch. Only the trim material samples it, so
   * a machine's shell, tyre, pads and lamps are exactly the untextured lofts
   * they have always been.
   */
  readonly atlas?: {
    build(): THREE.Texture;
    region(art: string | undefined): UvRect;
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

  /**
   * The forward lighting: its patches on the nose, and what they glow.
   *
   * A list rather than one patch since M22, because a `MachinePatch` spans one
   * contiguous arc and his machine carries a pair of pale panels with the
   * bodywork's centre spine between them. They merge into the one
   * `euc-headlight` mesh either way, so a look with two lamps costs exactly
   * what a look with one costs.
   */
  readonly headlight: {
    readonly patches: readonly MachinePatch[];
    readonly emissive: number;
    readonly emissiveIntensity: number;
  };

  /**
   * The rear lamp's patches, when a look wants its own — q61.
   *
   * Absent, the shared narrow bar ships (deliberately smaller than the
   * headlight so the status light stays the one the rider reads; see the
   * taillight note in `euc.ts`). The material — colour, emissive, intensity —
   * is the shared one either way: a tail lamp's red is road grammar, not
   * livery, and a look only gets to say how much of it there is.
   */
  readonly taillight?: {
    readonly patches: readonly MachinePatch[];
  };

  /**
   * The tyre — appearance only, and the one place this axis buys geometry.
   *
   * `MACHINE_CONTRACT` owns `tyreDiameter`, so a look may not change how big
   * the wheel is or where it touches the ground. What it may change is what
   * the rubber looks like, and M22 needed one thing no colour could say: the
   * owner named the off-road tyre as one of four traits that make his machine
   * his, and a knobby tyre's whole read is its *broken silhouette*. Paint on a
   * shared-vertex loft blurs between columns and gives a ripple, not blocks —
   * so the lugs are boxes, merged into the tyre's own mesh at no draw calls,
   * and bounded by `count × rows` so the cost is stated rather than open.
   * `docs/PLANS.md` §22.4 assumed colour and roughness would be enough here;
   * §22.7's delivery records the measurement that changed the answer.
   */
  readonly tyre?: {
    readonly colour?: number;
    readonly roughness?: number;
    readonly lugs?: {
      /** How many lug positions around the circumference. */
      readonly count: number;
      /**
       * One row per entry. `at` is the position along the axle as a fraction
       * of the tyre's half width; `phase` offsets the row around the wheel in
       * lug pitches, which is what makes a staggered block pattern rather than
       * three rings of the same lug.
       */
      readonly rows: readonly { readonly at: number; readonly phase: number }[];
      /** Arc width, radial height, and length along the axle. All metres. */
      readonly size: readonly [number, number, number];
      readonly shade: number;
    };
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
    // Six rows rather than two: this lamp straddles the chine (0.500 → 0.508),
    // and a two-row chord across a step is the same defect the purple arcs
    // above carried — the bodywork breaking back through the lamp's own face.
    patches: [{
      u0: Math.PI / 2 - 0.44,
      u1: Math.PI / 2 + 0.44,
      from: 0.502,
      to: 0.530,
      lift: 0.004,
      sink: -0.012,
      uSegments: 6,
      vSegments: 6,
      taper: 0.40,
    }],
    emissive: BLOCKOUT_COLOURS.headlight,
    emissiveIntensity: 1.4,
  },
};

// -- Trollina's standard-wheel livery ---------------------------------------

/**
 * The standard wheel in Trollina's palette — deliberately a livery, not a
 * fifth wheel design. Everything except the trim material is shared by
 * reference with `STANDARD_MACHINE_LOOK`; the trim spread retains the exact
 * three patches and material response while exchanging blue albedo/emissive
 * for pink. This keeps geometry, lights, draw calls and physics identical and
 * makes it impossible for the variant to drift accidentally through copied
 * profile numbers.
 */
export const TROLLINA_MACHINE_LOOK: MachineLook = {
  ...STANDARD_MACHINE_LOOK,
  machine: 'trollina',
  trim: {
    ...STANDARD_MACHINE_LOOK.trim,
    colour: BLOCKOUT_COLOURS.machineTrollinaAccent,
    emissive: BLOCKOUT_COLOURS.machineTrollinaEmissive,
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
    patches: [{
      u0: Math.PI / 2 - 0.13,
      u1: Math.PI / 2 + 0.13,
      from: 0.497,
      to: 0.537,
      lift: 0.006,
      sink: -0.014,
      uSegments: 6,
      vSegments: 2,
      taper: 0.55,
    }],
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

// -- Adonisb2's wheel — M22 Phase 2 -----------------------------------------

/**
 * Where a feature `x` metres off the centreline lands on his nose, in radians.
 *
 * **A superellipse is not a ruler.** A ring with `square` well above 2 is very
 * nearly flat across its front face, so `x` rises almost vertically out of the
 * centreline and then crawls: on the ring below, 20 mm of nose is the first
 * 0.03 rad and the remaining 90 mm takes the next 0.75. Hand-authoring the
 * angry eyes in radians against that curve is guesswork, and guesswork in `u`
 * is what puts an eye through the edge of the plate it sits on. So the face is
 * authored the way it was measured off the photograph — in millimetres either
 * side of centre — and inverted here, once.
 *
 * `side` is -1 for the rider's LEFT (+X, angles below front centre) and +1 for
 * their right, matching `loftPoint`'s frame. The ring it inverts is the widest
 * one; features higher up the nose ride a slightly narrower ring and come out
 * marginally narrower, which is the taper the plate has in the reference
 * anyway.
 */
const ADONISB2_NOSE_HALF_WIDTH = 0.114;
const ADONISB2_NOSE_SQUARE = 4.6;

/** How far off front centre a feature `x` metres from the centreline sits. */
function adonisb2NosePhi(x: number): number {
  const t = Math.min(1, Math.abs(x) / ADONISB2_NOSE_HALF_WIDTH) ** (ADONISB2_NOSE_SQUARE / 2);
  return Math.asin(t);
}

function adonisb2NoseU(x: number, side: number): number {
  return Math.PI / 2 + side * adonisb2NosePhi(x);
}

/** A patch on the nose authored in metres from the centreline rather than radians. */
interface Adonisb2NosePatch extends Omit<MachinePatch, 'u0' | 'u1'> {
  /** Distance from the centreline, metres. `inner` is the edge nearer centre. */
  readonly inner: number;
  readonly outer: number;
}

/**
 * The same patch on both halves of the nose.
 *
 * A mirrored span runs backwards in parameter space, so the ends swap *and*
 * the shear flips: `skew` is authored for the rider's left, where `s` runs
 * outboard-to-inboard, and negated on the right so an eyebrow slanting down
 * toward the centre keeps slanting down toward the centre. Getting that sign
 * wrong is the defect `blockoutKit.ts` documents at length — a panel wound
 * inside-out, or here, a face with one raised eyebrow.
 */
function adonisb2NosePair({ inner, outer, ...rest }: Adonisb2NosePatch): MachinePatch[] {
  const skew = rest.skew ?? 0;
  return [
    { ...rest, u0: adonisb2NoseU(outer, -1), u1: adonisb2NoseU(inner, -1), skew },
    { ...rest, u0: adonisb2NoseU(inner, 1), u1: adonisb2NoseU(outer, 1), skew: -skew },
  ];
}

/** One patch straddling front centre, `half` metres either side of it. */
function adonisb2NoseSpan(
  { half, ...rest }: Omit<MachinePatch, 'u0' | 'u1'> & { readonly half: number },
): MachinePatch {
  return { ...rest, u0: adonisb2NoseU(half, -1), u1: adonisb2NoseU(half, 1) };
}

/**
 * The trim's four hues, painted down from one pale material.
 *
 * Greys need no entry here: the base is deliberately near-neutral, so a scalar
 * `shade` walks it all the way from the eye whites (1) through the mockup's
 * grey irises (0.32) to the near-black of the brows and pupils (0.010) without
 * touching hue. Only the three colours need real per-channel paint, and the
 * green is `adonisb2Guard` — the rider's own knee-guard lime — because the
 * whole point of the personalization is that he and the machine match.
 */
const ADONISB2_TRIM = BLOCKOUT_COLOURS.machineAdonisb2Trim;
const ADONISB2_TRIM_GREEN = tintOver(ADONISB2_TRIM, BLOCKOUT_COLOURS.machineAdonisb2Green);
const ADONISB2_TRIM_BLUE = tintOver(ADONISB2_TRIM, BLOCKOUT_COLOURS.machineAdonisb2Blue);
const ADONISB2_TRIM_TEAL = tintOver(ADONISB2_TRIM, BLOCKOUT_COLOURS.machineAdonisb2Teal);
/** The eye whites are the base itself; the brows and the V are it crushed. */
const ADONISB2_INK = 0.010;
/**
 * The iris inside each eye — the middle of three values, and it has to *be*
 * the middle.
 *
 * It shipped at 0.055 for one capture, which is dark enough to be the same
 * mark as the lash above it: the two merged and the eye became a black hole
 * with a white rim. The eye needs the sclera bright, the lid near-black, and
 * this clearly between them, or the lid stops reading as a lid.
 */
const ADONISB2_IRIS = 0.30;
/**
 * Structural bodywork on the trim material — the rear corner guards.
 *
 * A step *above* the shell's graphite rather than level with it. At 0.038 the
 * guards matched the body exactly and the tail came back from the capture as
 * one featureless black slab with two lights on it; a bolted-on panel in a
 * lighter polymer is both what the machine's construction actually looks like
 * and the only thing giving that face any form.
 */
const ADONISB2_STRUCTURE = 0.075;

/** Metres of height per ring index where the face lives. See the shell profile. */
const ADONISB2_NOSE_RING = 0.040;

/** One part of one eye, in millimetres either side of centre and metres up. */
export interface Adonisb2EyePart {
  readonly inner: number;
  readonly outer: number;
  readonly from: number;
  readonly to: number;
}

/**
 * The four parts of one eye, all measured in the **same** frame: heights as
 * they stand at the eye's own mid-angle, so `iris.from > sclera.from` means
 * exactly what it reads like — the iris starts above the white's bottom edge.
 *
 * Exported because it is the face's specification rather than an
 * implementation detail: `adonisb2.test.ts` asserts the relationships between
 * these four spans directly, which is the level they are actually stated at.
 */
export const ADONISB2_EYE = Object.freeze({
  sclera: Object.freeze({ inner: 0.009, outer: 0.058, from: 0.496, to: 0.538 }),
  iris: Object.freeze({ inner: 0.022, outer: 0.046, from: 0.507, to: 0.535 }),
  pupil: Object.freeze({ inner: 0.027, outer: 0.039, from: 0.510, to: 0.526 }),
  lash: Object.freeze({ inner: 0.008, outer: 0.061, from: 0.532, to: 0.538 }),
});

/**
 * The eyebrow, and it is **not** an eye part — it has its own, much steeper
 * tilt, which is what makes it an arrow rather than a lid. Stated beside the
 * eye so the two can be compared, since confusing them is the defect that
 * shipped once.
 */
export const ADONISB2_BROW = Object.freeze({
  inner: 0.001, outer: 0.008, from: 0.550, to: 0.554, skew: -0.50,
});

const ADONISB2_EYE_LOW = adonisb2NosePhi(ADONISB2_EYE.sclera.inner);
const ADONISB2_EYE_HIGH = adonisb2NosePhi(ADONISB2_EYE.sclera.outer);
const ADONISB2_EYE_MID = (ADONISB2_EYE_LOW + ADONISB2_EYE_HIGH) / 2;

/**
 * The eye's tilt, and what makes the face angry — now as rings of rise per
 * radian outboard rather than as one `skew` number.
 *
 * Measured off the photograph and the mockup together: the eyes fill the lower
 * two thirds of the plate, nearly meet at the centre, and slant *down toward
 * the centre*, which is the entire difference between an angry face and a
 * worried one. 0.50 rings — 20 mm at this profile's ring spacing — across the
 * whole eye is the 22° the reference measures.
 *
 * **It has to be a tilt and not a skew, and that is the owner's second
 * correction.** `MachinePatch.skew` slides a band across the patch's *own*
 * angular span, so giving the iris the eye's 0.50 tilted it by 0.50 across
 * half the width — twice the angle — and its corners came out through the
 * white on both sides. Nothing about the numbers looked wrong; they were the
 * eye's own.
 */
const ADONISB2_EYE_TILT = 0.50 / (ADONISB2_EYE_HIGH - ADONISB2_EYE_LOW);

/**
 * One eye part, resolved from the shared frame into a patch.
 *
 * Two corrections, both consequences of `skew` being measured per patch:
 * the **shear** scales with the part's own angular span so every part sits at
 * the eye's angle rather than at its own; and the **heights** shift by the rise
 * between the eye's mid-angle and the part's, because a patch shears about its
 * own midpoint and a narrower part's midpoint is further inboard and therefore
 * lower down the eye.
 */
function adonisb2EyePatch(
  part: Adonisb2EyePart,
  rest: Omit<Adonisb2NosePatch, 'inner' | 'outer' | 'from' | 'to' | 'skew'>,
): Adonisb2NosePatch {
  const low = adonisb2NosePhi(part.inner);
  const high = adonisb2NosePhi(part.outer);
  const rise = ADONISB2_EYE_TILT * ((low + high) / 2 - ADONISB2_EYE_MID) * ADONISB2_NOSE_RING;
  return {
    ...rest,
    inner: part.inner,
    outer: part.outer,
    from: part.from + rise,
    to: part.to + rise,
    skew: -ADONISB2_EYE_TILT * (high - low),
  };
}

/** The livery's paint values. See `paintShell` for what each one covers. */
const ADONISB2_CORE: Tint = [0.60, 0.60, 0.62];
const ADONISB2_CAVITY: Tint = [0.26, 0.26, 0.28];
const ADONISB2_EDGE: Tint = [1.28, 1.28, 1.30];
/** Black leatherette over the graphite shell. Neutral base, so this is nearly scalar. */
const ADONISB2_SEAT = tintOver(BLOCKOUT_COLOURS.machineAdonisb2, 0x141519);
/** Where the seat starts, shared by the profile and the painter that must not repaint it. */
const ADONISB2_SEAT_BOTTOM = 0.556;

/**
 * Adonisb2's machine, from his photograph (`references/guest-rider/`) and the
 * mockup beside it — the second wheel on this axis taken from a real rider's
 * own machine, with his permission.
 *
 * His character reference ranks the wheel fourth in what carries the identity
 * and is explicit that it "should not be replaced with a generic wheel". The
 * owner named the four traits that make it his — *aggressive, tall, off-road
 * tyre, an obvious saddle* — and then the one thing that matters most: the
 * green at the front, the pair of white headlights, and the little face in the
 * middle. This look is those six things in the §19.3 order of what carries at
 * distance, and nothing else:
 *
 * - **Black bodywork over a graphite base** — the colour field, free. The
 *   inverse of Red Rider's build (`BLOCKOUT_COLOURS.machineAdonisb2`): his
 *   identity colour is *not* the shell's, so the shell is dark enough to read
 *   black and light enough that the painter can still take the recesses down.
 * - **A blocky, near-vertical body** — the silhouette. Squarer sections than
 *   either wheel before it, full width held from the arch to the shoulder
 *   instead of tapering into a pod, and a short hard chamfer at the top rather
 *   than a dome. The tyre, pedals and suspension stay `MACHINE_CONTRACT`.
 * - **The saddle** — the silhouette's other half, and the trait the owner
 *   asked for by name. A narrow neck out of the shell's top face flaring into
 *   a long cushion with a kicked tail, so it reads as *bolted on* rather than
 *   as a rounded cap. Merged into the shell mesh: triangles, no draw call.
 * - **The knobby tyre** — the one place this axis buys geometry, and the
 *   reason `tyre.lugs` exists. See the field's own comment.
 * - **The angry-eye plate** — his single most memorable mark, and original art
 *   in the game's own hand rather than a copy of any decal product. A green
 *   plate standing proud of the nose, two pale eyes with grey irises, brows
 *   slanting down to the centre, the scored V above them and the mount notch
 *   below. All paint and patches; not one extra mesh.
 * - **The pair of cream lamps** with the bodywork's dark spine between them,
 *   the blue chevron stack on that spine, and the green bars beneath — the
 *   front exactly as the mockup lays it out.
 *
 * What the references show and this look deliberately does not build: the
 * third-party decal art on the machine (a lotus in the photograph, a maple
 * leaf in the mockup — the same rule that kept a commercial gear mark off Red
 * Rider's thigh), any manufacturer's shell, the printed artwork inside the
 * light panels (they ship as light panels, not as pictures), and his name
 * anywhere on it — the machine carries the eyes, and the legible wordmark
 * lives on his chooser card where a player is actually reading names.
 *
 * The one addition the references do not contain: **green rails on the
 * shoulder**, where the standard machine's accent strips sit. Everything else
 * green on this wheel faces forward, and the camera lives behind the rider —
 * so without them his machine is a black wheel from the only angle the game
 * normally shows. They are stated here rather than hidden because they are the
 * one thing on it that is the game's invention rather than his.
 */
export const ADONISB2_MACHINE_LOOK: MachineLook = {
  machine: 'adonisb2',

  shell: {
    colour: BLOCKOUT_COLOURS.machineAdonisb2,
    // Flatter than either wheel before it. The photograph's machine is
    // moulded plastic over a hard frame, and a satin sheen is what separates
    // that from the standard wheel's painted shell at the same value.
    roughness: 0.52,
    // Blocky, and tall by *aspect* rather than by height — the contract fixes
    // where the axle and the pedals are, so a taller machine is one that holds
    // its width and depth from the arch all the way to the shoulder instead of
    // rounding off. `square` is the number doing that work: 4.6 through the
    // body is a rounded rectangle in plan, well past Red Rider's 4.4, which is
    // what gives the nose a flat face for the plate and the lamps to sit on.
    // The skirt stays narrow so the stanchions still show the travel.
    //
    // **The four middle rings are evenly spaced on purpose, and it is not a
    // shape decision.** `MachinePatch.skew` and every patch's height are ring
    // *indices*, not metres — `patchGeometry` shears in v — so a region whose
    // rings crowd together shears less per authored unit than one whose rings
    // are far apart. The first version of this profile jumped from 68 mm
    // between rings to 30 mm right where the eyes sit, and the brows came back
    // from the capture three times thicker at one end than the other: one
    // slanted band read as a solid black mass over half the plate. 40 mm a ring
    // from 0.378 to 0.578 makes the whole face authorable in millimetres —
    // `skew: -0.50` is 20 mm of drop, everywhere on it.
    profile: [
      { y: 0.250, halfWidth: 0.050, halfDepth: 0.120, square: 3.2 },
      { y: 0.322, halfWidth: 0.086, halfDepth: 0.188, square: 4.0 },
      { y: 0.378, halfWidth: 0.112, halfDepth: 0.226, square: 4.6 },
      { y: 0.418, halfWidth: 0.114, halfDepth: 0.230, square: 4.6 },
      { y: 0.458, halfWidth: 0.114, halfDepth: 0.230, square: 4.6 },
      { y: 0.498, halfWidth: 0.114, halfDepth: 0.229, square: 4.6 },
      { y: 0.538, halfWidth: 0.112, halfDepth: 0.226, square: 4.6 },
      { y: 0.578, halfWidth: 0.098, halfDepth: 0.196, square: 4.2 },
      { y: 0.598, halfWidth: 0.072, halfDepth: 0.146, square: 3.4 },
    ],
  },

  top: {
    kind: 'saddle',
    // "An obvious saddle" — the owner's words, and the shape is what has to
    // carry it, because the height cannot. The crown is pinned under
    // `RIDER.hipHeight - crouchHipDrop` by a hand's breadth exactly as Red
    // Rider's is (`redRider.test.ts`), so the only room left is the 62 mm
    // above the shell's top face. It spends them on a *neck*: rings 1-2 are
    // narrower than the shell's crown and buried in it, and the cushion then
    // flares 40 mm wider than the neck and 90 mm longer than Red Rider's seat,
    // with the last two rings sliding back into a kicked tail. A seat you can
    // see daylight under reads as a seat; a wide ring on the crown reads as a
    // lid.
    profile: [
      { y: ADONISB2_SEAT_BOTTOM, halfWidth: 0.044, halfDepth: 0.126, square: 3.6 },
      { y: 0.598, halfWidth: 0.052, halfDepth: 0.148, square: 3.8 },
      { y: 0.620, halfWidth: 0.078, halfDepth: 0.196, z: -0.012, square: 4.4 },
      { y: 0.638, halfWidth: 0.082, halfDepth: 0.204, z: -0.026, square: 4.8 },
      { y: 0.649, halfWidth: 0.058, halfDepth: 0.162, z: -0.042, square: 3.8 },
    ],
    tint: ADONISB2_SEAT,
  },

  tyre: {
    // The photograph's tyre is a moto knobby, and the mockup enlarges its
    // blocks further. Three staggered rows of 18: the centre row sits on the
    // crown and breaks the wheel's silhouette by 12 mm, the shoulder rows sit
    // where the tread falls away and read as the tyre's edge. `shade` is high
    // for the reason every multiplier on this near-black rubber is — see the
    // note above `RIM_SHADE` in `render/euc.ts`.
    lugs: {
      count: 18,
      rows: [
        { at: -0.62, phase: 0 },
        { at: 0, phase: 0.5 },
        { at: 0.62, phase: 0 },
      ],
      size: [0.048, 0.016, 0.022],
      shade: 2.4,
    },
  },

  trim: {
    colour: ADONISB2_TRIM,
    // No glow anywhere on the trim. The lamps carry their own emissive on the
    // headlight channel and the status light carries the power ladder; a third
    // glowing thing on a black machine is a third thing competing to be read.
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.38,
    metalness: 0.08,
    patches: [
      // -- The nose plate, and the face on it ---------------------------------
      // The plate first, so everything else lands on top of it. Lifted 22 mm:
      // in both references it is a separate moulding bolted to the front, not
      // a sticker, and the shadow under its lower edge is half of what makes it
      // read that way.
      adonisb2NoseSpan({
        half: 0.066,
        from: 0.454,
        to: 0.566,
        lift: 0.026,
        sink: -0.010,
        uSegments: 6,
        vSegments: 4,
        tint: ADONISB2_TRIM_GREEN,
      }),
      // The eye whites, and they have to *be* white. The second capture built
      // them as three nested rectangles — white rim, grey iris, black pupil,
      // which is what the mockup draws — and at this size three values inside
      // a 48 mm eye read as a machined bezel, not as an eye. So the eye is the
      // photograph's instead, where the two references disagree and §22.2 says
      // the photograph wins: a white sclera with one smoked lens in it. Sunk
      // to 10 mm — below the plate's own outer face — so the rim stays buried
      // in the plate and only the lens shows.
      ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.sclera, {
        lift: 0.030,
        sink: 0.010,
        uSegments: 4,
        vSegments: 2,
      })),
      // The iris. It runs *up under* the lash rather than stopping short of
      // it: a strip of white left between the two would be a bright line
      // trapped between two darks, which is the sandwich this project has
      // already been shown once (`docs/LESSONS_LEARNED.md`). White stays
      // generous around its sides and under it, which is what the mockup's eye
      // actually is.
      ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.iris, {
        lift: 0.032,
        sink: 0.012,
        uSegments: 3,
        vSegments: 2,
        shade: ADONISB2_IRIS,
      })),
      // The pupils. Small enough that they are a mark rather than a third
      // ring, and they take the eye's tilt like everything else on it.
      ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.pupil, {
        lift: 0.035,
        sink: 0.014,
        uSegments: 2,
        vSegments: 1,
        shade: ADONISB2_INK,
      })),
      // The lashes — a darkened upper lid, not a second brow.
      //
      // **This is the owner's correction, and it is worth stating as a rule.**
      // The first build put a wide dark band *above* the eye and a heavy V
      // above that, and he read the result exactly right: two sets of
      // eyebrows. In both references the dark near the eye is cartoon
      // eyelashes — the eye's own top edge darkened — and the eyebrows are the
      // small arrow much higher up. So this patch is thin, and it lies inside
      // the eye's own span rather than over the plate: 6 mm of the eye's top,
      // running 3 mm past its outer corner into the point that makes the face
      // angry, and 1 mm past its inner one.
      //
      // The shear is the eye's, and the whole face still turns on its sign:
      // dropping toward the centre is angry, the other way is worried.
      ...adonisb2NosePair(adonisb2EyePatch(ADONISB2_EYE.lash, {
        lift: 0.034,
        sink: 0.020,
        uSegments: 4,
        vSegments: 1,
        shade: ADONISB2_INK,
      })),
      // The eyebrows: the tiny steep arrow scored high into the plate, which
      // is the only thing on this face that is actually a brow. Measured off
      // the mockup rather than judged — the mark there is 10% of the plate's
      // width and 22% of its height, which is a *narrow* V, not a wide one.
      // The first build drew it at half the plate's width with a shallow slope
      // and it became the upper of the two brow rows.
      ...adonisb2NosePair({
        ...ADONISB2_BROW,
        lift: 0.030,
        sink: 0.020,
        uSegments: 2,
        vSegments: 1,
        shade: ADONISB2_INK,
      }),
      // The mount notch bitten out of the plate's bottom edge.
      adonisb2NoseSpan({
        half: 0.016,
        from: 0.454,
        to: 0.470,
        lift: 0.028,
        sink: 0.014,
        uSegments: 2,
        vSegments: 1,
        shade: ADONISB2_INK,
      }),

      // -- The centre spine, between the lamps -------------------------------
      // Three chevrons pointing down, the machine's one cool mark. Each is two
      // sheared arms; a single patch cannot bend.
      ...[0.378, 0.398, 0.418].flatMap((base) => adonisb2NosePair({
        inner: 0.002,
        outer: 0.020,
        from: base,
        to: base + 0.010,
        lift: 0.010,
        sink: -0.006,
        uSegments: 2,
        vSegments: 1,
        skew: -0.20,
        tint: ADONISB2_TRIM_BLUE,
      })),

      // -- Green, below the lamps --------------------------------------------
      ...adonisb2NosePair({
        inner: 0.022,
        outer: 0.064,
        from: 0.344,
        to: 0.362,
        lift: 0.012,
        sink: -0.008,
        uSegments: 3,
        vSegments: 1,
        tint: ADONISB2_TRIM_GREEN,
      }),
      // The teal running strips on the front corner brackets — the only colour
      // on the real machine that is neither green nor black, and the reason
      // `machineAdonisb2Teal` exists. Pulled inboard of the corner after the
      // first capture put them right on it, where a strip on a surface turning
      // away from you reads as a loose cyan block rather than a light.
      ...adonisb2NosePair({
        inner: 0.074,
        outer: 0.092,
        from: 0.354,
        to: 0.366,
        lift: 0.011,
        sink: -0.008,
        uSegments: 2,
        vSegments: 1,
        tint: ADONISB2_TRIM_TEAL,
      }),

      // -- The shoulder rails, where the camera actually is ------------------
      // Above the leg pads (which end at 0.54) for the reason the standard
      // machine's strips are: a stripe on the mid flank is a stripe nobody
      // sees. They run most of the shoulder rather than sitting square on the
      // flank, so the front and rear corners catch them too — from behind, at
      // ±0.36, the saddle overhung them and there was nothing green on the
      // machine at all. See the note in this look's own comment: these are the
      // game's invention, not his.
      {
        u0: -0.62,
        u1: 0.62,
        from: 0.544,
        to: 0.566,
        lift: 0.010,
        sink: -0.010,
        uSegments: 8,
        vSegments: 1,
        tint: ADONISB2_TRIM_GREEN,
      },
      {
        u0: Math.PI - 0.62,
        u1: Math.PI + 0.62,
        from: 0.544,
        to: 0.566,
        lift: 0.010,
        sink: -0.010,
        uSegments: 8,
        vSegments: 1,
        tint: ADONISB2_TRIM_GREEN,
      },

      // -- The rear corner guards -------------------------------------------
      // Structural, not decorative: they give the tail the same vertical route
      // the nose has, and they stop 0.28 rad short of rear centre so the
      // status light keeps a dark margin all round (§19.7's rule, which is
      // cheap to honour here because the field behind the light is already
      // dark).
      {
        u0: -Math.PI / 2 + 0.28,
        u1: -Math.PI / 2 + 0.62,
        from: 0.372,
        to: 0.556,
        lift: 0.012,
        sink: -0.010,
        uSegments: 3,
        vSegments: 5,
        taper: 0.10,
        shade: ADONISB2_STRUCTURE,
      },
      {
        u0: -Math.PI / 2 - 0.62,
        u1: -Math.PI / 2 - 0.28,
        from: 0.372,
        to: 0.556,
        lift: 0.012,
        sink: -0.010,
        uSegments: 3,
        vSegments: 5,
        taper: 0.10,
        shade: ADONISB2_STRUCTURE,
      },
    ],
  },

  headlight: {
    // Two panels, not one lamp — the trait the owner named as "the left/right
    // white headlights". They are tall portrait rectangles either side of the
    // dark centre spine, exactly as both references lay them out, and they are
    // warm rather than the projector white on Red Rider's wheel because the
    // photograph's panels are cream.
    patches: [
      ...adonisb2NosePair({
        inner: 0.024,
        outer: 0.062,
        from: 0.372,
        to: 0.436,
        lift: 0.008,
        sink: -0.014,
        uSegments: 3,
        vSegments: 4,
      }),
    ],
    emissive: BLOCKOUT_COLOURS.headlight,
    // Under the standard machine's 1.4 rather than over it: two panels this
    // size at 1.5 came back from the first capture as blank white rectangles
    // with the warmth burnt out of them, and the references' panels are cream.
    emissiveIntensity: 1.2,
  },

  paintShell: (geometry): void => {
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);

      // The saddle, tinted at build and repainted identically here so the
      // bands below cannot half-recolour it.
      //
      // **A height alone cannot find it.** The saddle is merged into the shell
      // mesh, and the two overlap for the 34 mm the neck spends buried in the
      // crown — so `y > seatBottom` catches the shell's own top chamfer too,
      // which is exactly the edge the highlight below exists to keep. Above the
      // shell's last ring only the saddle exists; inside the overlap the
      // saddle is the narrow thing, which is what the second clause says.
      if (y > 0.599
        || (y > ADONISB2_SEAT_BOTTOM && Math.abs(x) < 0.062 && Math.abs(z) < 0.160)) {
        colour.setXYZ(i, ADONISB2_SEAT[0], ADONISB2_SEAT[1], ADONISB2_SEAT[2]);
        continue;
      }
      // The nose recess the lamps sit in, and the spine between them. Painted
      // as one region rather than two windows: what the reference shows is a
      // dark plate with the panels let into it, and the chevrons then ride
      // that plate.
      if (z > 0.16 && Math.abs(x) < 0.075 && y > 0.360 && y < 0.470) {
        colour.setXYZ(i, ADONISB2_CAVITY[0], ADONISB2_CAVITY[1], ADONISB2_CAVITY[2]);
        continue;
      }
      // The rear spine: taillight surround and the status light's bezel.
      if (z < -0.15 && Math.abs(x) < 0.075 && y > 0.400) {
        colour.setXYZ(i, ADONISB2_CAVITY[0], ADONISB2_CAVITY[1], ADONISB2_CAVITY[2]);
        continue;
      }
      // The arch skirt, all the way round — the structure under the bodywork,
      // and the shadow the tyre sits in.
      if (y < 0.336) {
        colour.setXYZ(i, ADONISB2_CORE[0], ADONISB2_CORE[1], ADONISB2_CORE[2]);
        continue;
      }
      // The top chamfer, and only it. Everything on this machine is dark, so
      // the one thing a capture cannot recover is where the box *ends* — the
      // hard edge the sun would catch on moulded plastic. This is the single
      // band painted brighter than the base, and it is what keeps the blocky
      // crown from dissolving into the body at chase distance.
      if (y > 0.560) {
        colour.setXYZ(i, ADONISB2_EDGE[0], ADONISB2_EDGE[1], ADONISB2_EDGE[2]);
      }
    }
  },

  paintPedal: (geometry): void => {
    const colour = geometry.getAttribute('color');
    // His platforms are black polymer, not the standard machine's machined
    // metal — and they are directly under the rider's boots in every chase
    // frame, which makes them the machine's most-seen surface. Scaled rather
    // than overwritten, so the grip inset, the outboard lip and the hinge keep
    // every value relation `render/euc.ts` authored and the whole plate simply
    // moves to a darker material.
    for (let i = 0; i < colour.count; i += 1) {
      colour.setXYZ(i, colour.getX(i) * 0.11, colour.getY(i) * 0.11, colour.getZ(i) * 0.115);
    }
  },
};

// -- Maribel's wheel — M23 Phase A2 ------------------------------------------

/**
 * The trim's three paints, all reached **down** from a pale base.
 *
 * The direction rule at the top of this file, on a machine whose livery is a
 * saturated purple over near-black: black cannot be painted up to purple, so
 * the material is pale and everything on it — the charcoal rails and blade,
 * the pad badge's plate — is a multiplier.
 *
 * **A1d retired the rail purple.** No reference carries purple on the
 * shoulder, and the black deck above it only reads as black if nothing purple
 * sits immediately under it.
 */
const MARIBEL_TRIM_BASE = 0xdcdde1;
const MARIBEL_TRIM_DARK = tintOver(MARIBEL_TRIM_BASE, 0x26272c);
const MARIBEL_TRIM_PURPLE = tintOver(MARIBEL_TRIM_BASE, BLOCKOUT_COLOURS.maribelPurple);
/**
 * The deck's black — A1d.
 *
 * The saddle slot is tinted, not painted, so the crown's colour is authored in
 * one place. A step *down* from the shell rather than level with it, because a
 * deck that is exactly its surroundings has no edge and the whole point of the
 * plate is that it reads as a separate black surface between the purple.
 */
const MARIBEL_DECK = tintOver(BLOCKOUT_COLOURS.maribelMachine, 0x141519);

/**
 * Maribel's machine — the fourth `MachineLook` row, and the third taken from a
 * real rider's own wheel with her permission.
 *
 * **She was shown to the owner on Cool Rider's wheel and half the miss was the
 * machine.** A1 shipped her black leathers standing on the identity-blue
 * default, which is the M22 Phase 0 intermediate — legitimate while a phase is
 * in flight and not shippable — and §23.9c bundled this phase into A1b so she
 * is never seen halfway again, by him or by her.
 *
 * What the references agree on, and what each part costs:
 *
 * - **Black shell, purple pads.** The colour field, free: the pads already
 *   have their own material and their own mesh, so the loudest surface on the
 *   machine is a hex in `data/tuning.ts` (`MachineLook.pads`).
 * - **Her logo on the pad.** The mark, one page of her printed sheet, no draw
 *   call — the first thing on any machine in this game that a patch could not
 *   have drawn. §23.5's "original mascot" drafting is superseded by her own
 *   written grant.
 * - **Purple shoulder rails.** Adonisb2's lesson, restated: everything else
 *   coloured on this wheel faces sideways, and the camera lives behind the
 *   rider — without them her machine is a black wheel from the one angle the
 *   game normally shows.
 * - **Road rubber with real tread.** A2 shipped the tyre slick on the
 *   reasoning that lugs are Adonisb2's identity; the photograph disagrees —
 *   her tyre carries visible street blocks — and A1c splits the difference
 *   the way the references do: shallow wide blocks at half his height, a
 *   road tyre's tread rather than a moto knobby's, distinct from both the
 *   slick and his by construction.
 *
 * **A2 kept the standard body loft and A1c re-authors it, because the claim
 * behind keeping it was measured against the photograph and failed.** The A2
 * row said her machine's identity was livery, not shape — but the machine in
 * both racing photographs is a tall performance wheel with a big pad stack on
 * top, and the *standard* body is the invented claim: it dressed her kit as a
 * compact commuter. The owner's reviewer named exactly that ("a compact
 * generic EUC with purple cosmetics"). What ships now is the game's own
 * fictional performance form — taller body held wide over the tyre, the
 * carry handle giving way to a moulded purple pad stack (`top: saddle`, the
 * mechanism Red Rider's seat proved) — wearing her livery. Contract
 * dimensions untouched: same tyre circle, same pedals, same suspension.
 */
export const MARIBEL_MACHINE_LOOK: MachineLook = {
  machine: 'maribel',

  shell: {
    colour: BLOCKOUT_COLOURS.maribelMachine,
    // Satin. Her suit is matte and her helmet is matte; a glossy machine under
    // the same sun would read as the only lacquered thing in the frame.
    roughness: 0.48,
    // The performance body — A1c. Taller by *mass* rather than by a spike:
    // the standard shell starts tapering at 0.51 and hers holds its full
    // section to 0.545, carries more width (0.116 against 0.110) and a touch
    // more length, and squares off harder in plan (4.2 through the body).
    // The skirt stays narrow so the stanchions still show the travel, and
    // every trim, lamp and status height on it is authored in metres and
    // re-lands via `vAtHeight`.
    profile: [
      { y: 0.250, halfWidth: 0.052, halfDepth: 0.130, square: 3.0 },
      { y: 0.318, halfWidth: 0.096, halfDepth: 0.212, square: 3.6 },
      { y: 0.372, halfWidth: 0.113, halfDepth: 0.252, square: 4.0 },
      { y: 0.428, halfWidth: 0.116, halfDepth: 0.258, square: 5.0 },
      { y: 0.490, halfWidth: 0.116, halfDepth: 0.256, square: 5.0 },
      // The chine: an 8 mm step across the flank, so a large flat black panel
      // has one edge to catch the sun instead of reading as unlit mass.
      { y: 0.500, halfWidth: 0.116, halfDepth: 0.256, square: 5.0 },
      { y: 0.508, halfWidth: 0.112, halfDepth: 0.248, square: 4.6 },
      { y: 0.545, halfWidth: 0.112, halfDepth: 0.244, square: 4.0 },
      { y: 0.582, halfWidth: 0.100, halfDepth: 0.212, square: 3.5 },
      { y: 0.600, halfWidth: 0.074, halfDepth: 0.152, square: 3.0 },
    ],
  },

  top: {
    // The purple pad stack — the photograph's loudest feature after the pads
    // themselves: a moulded power-pad crown standing over the shell where a
    // commuter carries its handle. Mechanically it is Red Rider's saddle slot
    // (merged into the shell mesh, casts with it, costs no draw call), tinted
    // to her purple, and its crown sits at 0.649 — level with Adonisb2's seat
    // and inside the crouched-hips ceiling his test pins.
    kind: 'saddle',
    // **The black deck** — A1d, and the owner's own description of his
    // friend's machine: *"it has a black seat surrounded by all the purple"*.
    //
    // A1c had this exactly inverted. It put a purple loaf on the crown, which
    // made the highest and best-lit surface on the wheel purple and left the
    // machine reading as a purple wheel with black gaps rather than a black
    // wheel with purple blocks on it. The rings below are a flat deck rather
    // than a cushion, the tint is the shell's own black, and the purple that
    // surrounds it is the pad blocks standing up on either flank.
    //
    // The crown drops from 0.649 to 0.626, which is *further* inside the
    // crouched-hip ceiling `maribel.test.ts` pins, not closer to it.
    profile: [
      { y: 0.590, halfWidth: 0.070, halfDepth: 0.168, square: 4.6 },
      { y: 0.604, halfWidth: 0.078, halfDepth: 0.182, square: 5.4 },
      { y: 0.618, halfWidth: 0.076, halfDepth: 0.178, z: -0.004, square: 5.6 },
      { y: 0.626, halfWidth: 0.062, halfDepth: 0.150, z: -0.008, square: 4.4 },
    ],
    tint: MARIBEL_DECK,
  },

  pads: {
    colour: BLOCKOUT_COLOURS.maribelPurple,
    // Softer than the shell: a pad is moulded foam, and the sheen is most of
    // what says so at this distance.
    roughness: 0.82,
    // **One moulded wrap per flank, worn high — q60 W1.** A1d built two
    // vertical pad pills per side and the owner's ride threw them out: *"her
    // real one does not [have vertical pads]… it's just the purple pads ain't
    // that great."* What IMG_6601 actually shows is purple saddling the top of
    // the machine — pads wrapping the upper body just under the black seat —
    // so each flank now carries one long low block hugging the shell from the
    // chine up to the deck, running the bodywork's full length. The nose and
    // tail bands on the trim close the same purple into a ring, which is his
    // sketch verbatim: "a purple band all around the black seat".
    //
    // The outer face is still the shared pad's, ring for ring: `halfWidth`
    // never exceeds 0.028, so the plane a rider's shins rest against has not
    // moved by a millimetre and every clearance the rig proves still holds.
    blocks: [
      [
        { y: 0.026, halfWidth: 0.012, halfDepth: 0.128, z: 0.004, square: 3.2 },
        { y: 0.052, halfWidth: 0.026, halfDepth: 0.146, z: 0.002, square: 3.6 },
        { y: 0.086, halfWidth: 0.028, halfDepth: 0.150, z: 0.000, square: 3.6 },
        { y: 0.116, halfWidth: 0.024, halfDepth: 0.142, z: -0.002, square: 3.4 },
        { y: 0.138, halfWidth: 0.011, halfDepth: 0.120, z: -0.004, square: 3.0 },
      ],
    ],
    segments: 16,
    // Three planes, one stop apart: a block reads as a block because its top
    // catches the sun and its underside does not.
    paintPad: (geometry): void => {
      const position = geometry.getAttribute('position');
      const colour = geometry.getAttribute('color');
      for (let i = 0; i < position.count; i += 1) {
        const y = position.getY(i);
        const lift = y > 0.108 ? 1.26 : y < 0.048 ? 0.62 : 1;
        if (lift === 1) continue;
        colour.setXYZ(i, colour.getX(i) * lift, colour.getY(i) * lift, colour.getZ(i) * lift);
      }
    },
  },

  atlas: {
    build: createMaribelAtlas,
    region: (art: string | undefined): UvRect => (
      art !== undefined && art in ATLAS_REGIONS
        ? ATLAS_REGIONS[art as AtlasRegionName]
        : ATLAS_REGIONS.blank
    ),
  },

  tyre: {
    // Road rubber: a touch glossier than the standard tyre's matte —
    roughness: 0.86,
    // — with street tread. Half the height of Adonisb2's moto blocks and
    // nearly twice as many around the circle, so the silhouette break reads
    // as siped road rubber, not knobbies: distinct from his machine on both
    // numbers, and from the slick the A2 row shipped, which the photograph's
    // visibly treaded tyre never supported.
    lugs: {
      count: 26,
      rows: [
        { at: -0.86, phase: 0.25 },
        { at: -0.50, phase: 0 },
        { at: 0.02, phase: 0.5 },
        { at: 0.50, phase: 0 },
        { at: 0.86, phase: 0.25 },
      ],
      // Flat and wide: the first cut at 7.5 mm still silhouetted as a moto
      // knobby from the side, which is the one read this tyre must not have.
      size: [0.030, 0.008, 0.036],
      shade: 1.22,
    },
  },

  trim: {
    colour: MARIBEL_TRIM_BASE,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.40,
    metalness: 0.10,
    patches: [
      // **The purple ring's nose and tail arcs — q60 W1.** The flanks' purple
      // is the pad mesh itself; these two bands carry the same colour around
      // the ends at the same height, so from every angle the black deck sits
      // inside purple — "a black seat surrounded by all the purple", which is
      // the owner's description of the real machine. They sit above the
      // headlight (0.502–0.530) and the tail lamp, and the status light is a
      // proud emissive mesh that stays legible on top of the tail arc.
      //
      // **`vSegments: 8`, and that is the owner's second black strip.** A
      // patch's outer face is a *chord* between its own sample rows, and this
      // band spans the shell's steepest knee: half-depth falls 0.244 → 0.212 →
      // 0.152 across 0.545, 0.582 and 0.600. At two rows the chord from 0.562
      // to 0.588 cut 7.2 mm inside a surface it was only lifted 5.0 mm off, so
      // the black bodywork came back through the purple once per u-segment —
      // ten dark teeth along the top edge of the arc, which is what he circled
      // on the wheel. Raising the lift would hide it by standing the trim off
      // the body; sampling the knee is the fix that keeps a decal flat.
      // The rule this stands for: **`lift` only clears the body where the
      // patch's own rows are dense enough to follow it.**
      {
        u0: Math.PI / 2 - 0.85,
        u1: Math.PI / 2 + 0.85,
        from: 0.535,
        to: 0.588,
        lift: 0.005,
        sink: -0.010,
        uSegments: 10,
        vSegments: 8,
        tint: MARIBEL_TRIM_PURPLE,
      },
      {
        u0: -Math.PI / 2 - 0.85,
        u1: -Math.PI / 2 + 0.85,
        from: 0.535,
        to: 0.588,
        lift: 0.005,
        sink: -0.010,
        uSegments: 10,
        vSegments: 8,
        tint: MARIBEL_TRIM_PURPLE,
      },
      // The nose blade, charcoal: relief under the lamp, and the one piece of
      // structure on an otherwise plain front.
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
        tint: MARIBEL_TRIM_DARK,
      },
      // A deep-purple spine ran down the tail here until the owner's bug-hunt
      // ride called it what the chase camera sees: *"a purple square in the
      // back of her EUC. just a square."* It was an invention — no reference
      // shows her machine's rear — and it out-shouted her own back mark from
      // the one angle the player always has. The tail is her black bodywork
      // now; if the rear earns a feature it will be a larger tail lamp (his
      // suggestion), which is an authored light, not a tint.
      // **Her devil, large on the black flank — q60.** The owner named the old
      // wheel's flank devil "really cool" and the A1d badge unreadable, and he
      // was right on both: A1d printed it 154 mm on a near-black plate in the
      // 150 mm column between two pads, dead centre where the rider's own shin
      // stands. This one is 176 mm on a plate in her pad purple — the old
      // badge's own ground, which is what made it pop — on the black bodywork
      // below the wrap, biased toward the tail so the boot no longer parks in
      // front of it and the chase camera's three-quarter sees it whole.
      //
      // **Sized in metres, and the previous size was measured wrong.** The
      // note this replaces claimed 0.68 rad was 0.176 m of arc "square on this
      // shell". It is not: this shell is a boxy superellipse, so a radian near
      // the flank buys about half a metre of surface rather than the quarter
      // of one a circle of the wheel's width would — `tools/uv-anisotropy.mjs`
      // measures 0.68 rad as roughly 0.34 m, twice the number the plate was
      // laid out around. Her mark was printed 1.8 : 1 into that page and came
      // out that much too wide, which is the badge the owner circled.
      //
      // 0.34 rad by 0.155 m is the page now — near enough square in metres
      // that the artwork lands at its own proportions with a tenth left over,
      // and a 150 mm sticker on a 460 mm wheel besides, which is the size a
      // real one is. The centre keeps its small rearward bias so the boot does
      // not park in front of it.
      {
        u0: -0.21,
        u1: 0.13,
        from: 0.272,
        to: 0.427,
        lift: 0.004,
        sink: -0.014,
        uSegments: 8,
        vSegments: 8,
        art: 'machineMark',
      },
      {
        u0: Math.PI - 0.13,
        u1: Math.PI + 0.21,
        from: 0.272,
        to: 0.427,
        lift: 0.004,
        sink: -0.014,
        uSegments: 8,
        vSegments: 8,
        art: 'machineMark',
      },
    ],
  },

  headlight: {
    // Six rows rather than two: this lamp straddles the chine (0.500 → 0.508),
    // and a two-row chord across a step is the same defect the purple arcs
    // above carried — the bodywork breaking back through the lamp's own face.
    patches: [{
      u0: Math.PI / 2 - 0.44,
      u1: Math.PI / 2 + 0.44,
      from: 0.502,
      to: 0.530,
      lift: 0.004,
      sink: -0.012,
      uSegments: 6,
      vSegments: 6,
      taper: 0.40,
    }],
    emissive: BLOCKOUT_COLOURS.headlight,
    emissiveIntensity: 1.4,
  },

  // The wide rear lamp — q61, the owner's call once the tail spine was gone:
  // *"maybe a bigger red light?"* Below the chine and clear of the purple arc
  // and the status light above it; the shared red material, just more of it.
  taillight: {
    patches: [{
      u0: -Math.PI / 2 - 0.50,
      u1: -Math.PI / 2 + 0.50,
      // Wider than the shared bar and *lower* — the blind critic caught the
      // first cut stacked directly under the status lamp at chase distance,
      // where the two would merge into one red blob at exactly the moment the
      // status ramps red and matters most. Bigger by width, never by height,
      // and 80 mm of black bodywork now separates them.
      from: 0.446,
      to: 0.476,
      lift: 0.004,
      sink: -0.012,
      uSegments: 8,
      vSegments: 2,
      taper: 0.28,
    }],
  }

};

const MACHINE_LOOKS: readonly MachineLook[] = Object.freeze([
  STANDARD_MACHINE_LOOK,
  TROLLINA_MACHINE_LOOK,
  RED_RIDER_MACHINE_LOOK,
  ADONISB2_MACHINE_LOOK,
  MARIBEL_MACHINE_LOOK,
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
