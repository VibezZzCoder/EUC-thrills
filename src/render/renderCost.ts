/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { PROP_KINDS, type PropKind } from '../data/props.ts';
import { CHASE, FX, LIGHTING } from '../data/tuning.ts';
import { createCheckpointGates } from './checkpointGates.ts';
import { createGhostRider } from './ghostRider.ts';
import { createParticleField } from './particles.ts';
import { createProps } from './props.ts';
import { machineForCharacter } from '../data/machines.ts';
import { machineLook } from './machineLook.ts';
import { PLAYABLE_RIDER_LOOKS, type RiderLook } from './riderLook.ts';
import { createCopRider, createCopRidingRig, type CopRiderOptions } from './copRider.ts';
import { createPose } from '../simulation/EucController.ts';
import { createRidingRig } from './ridingRig.ts';
import { createTargets } from './targets.ts';
import { createTerrain } from './terrain.ts';
import { BASELINE_PRESENTATION } from './presentation.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import { isUltraRecipe } from './ultra/ultraRecipe.ts';
import type { BuildRecipe, UltraBuildContext, UltraRecipe } from './ultra/ultraTypes.ts';

/**
 * What a level actually costs to draw, measured from the built scene.
 *
 * **M12 Phase 0** (`docs/PLANS.md` §10). The slice's 102 title / 124 peak draw
 * calls describe a *fixed* world. A generator makes scene size a variable, and
 * a budget checked after generation is a budget that ships broken on the seed
 * nobody generated in testing — so the §9 ceilings become one of the
 * generator's validation contracts, and a contract needs a cost model that came
 * from measurement rather than estimation.
 *
 * This file is that measurement. It builds the real scene the real renderer
 * builds, walks it, and reports what each mesh contributes. It is the *only*
 * authority on the numbers; `src/data/renderCost.ts` holds the handful of
 * primitives the sealed half needs, and `src/render/renderCost.test.ts` fails if
 * they and this instrument ever disagree. Nothing is hand-maintained, which is
 * the mitigation `docs/PLANS.md` §12 names for the cost model drifting from
 * reality.
 *
 * ## What a "draw call" means here, and why it is an upper bound
 *
 * One call per material group of every mesh in the level's group, plus one more
 * for every mesh that casts, because `renderer.info` counts the shadow pass and
 * the colour pass together. It deliberately ignores frustum culling: a cost
 * model for a *budget* must answer "what could this world cost", and the answer
 * a camera happens to give from one position is not that. So this number is at
 * or above what `renderer.info.render.calls` reports for the level, never below
 * — which is the safe direction for a validation contract, and which the
 * browser suites' existing whole-frame assertions remain the check on.
 *
 * Draw calls, triangles, instance counts, and GPU object counts are reportable
 * evidence. A frame interval is not (`AGENTS.md`).
 */

/** What one mesh in a built scene contributes. */
export interface MeshCost {
  readonly name: string;
  /** Colour-pass draw calls: one per material group, or one for a lone material. */
  readonly calls: number;
  /** Colour-pass triangles, instances included. */
  readonly triangles: number;
  /** Instances, or 1 for a plain mesh. */
  readonly instances: number;
  readonly castsShadow: boolean;
}

export interface SceneCost {
  readonly meshes: readonly MeshCost[];
  readonly drawCalls: number;
  readonly triangles: number;
  readonly shadowDrawCalls: number;
  readonly shadowTriangles: number;
  /** What the frame is charged in total: `renderer.info` counts both passes. */
  readonly totalDrawCalls: number;
  readonly totalTriangles: number;
}

/** The categories a level's meshes fall into, by the names the renderer gives them. */
export type CostCategory =
  | 'surround'
  | 'heightfield'
  | 'blocks'
  | 'props'
  | 'markings'
  | 'hazards'
  | 'targets';

export interface LevelSceneCost extends SceneCost {
  readonly byCategory: Readonly<Record<CostCategory, SceneCost>>;
  /** Heightfield cells the renderer actually emitted. */
  readonly cellsDrawn: number;
}

/**
 * Every renderable under an object, and what it costs.
 *
 * `THREE.Points` counts as one call and no triangles — the particle fields are
 * points, and a model that silently dropped them would under-report the frame.
 */
export function measureObject(root: THREE.Object3D): SceneCost {
  const meshes: MeshCost[] = [];

  // Faithful to three, which skips an invisible object and everything under it.
  // It matters: the ghost and the checkpoint gates both start hidden and cost
  // literally nothing in free ride, and a model that charged for them would
  // reserve a fifth of the draw-call budget for a mode nobody is in.
  const walk = (node: THREE.Object3D): void => {
    if (!node.visible) return;
    visit(node);
    for (const child of node.children) walk(child);
  };

  const visit = (node: THREE.Object3D): void => {
    const points = node as THREE.Points;
    if (points.isPoints === true) {
      meshes.push({
        name: node.name,
        calls: 1,
        triangles: 0,
        instances: 1,
        castsShadow: node.castShadow,
      });
      return;
    }

    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;

    const geometry = mesh.geometry;
    const instanced = mesh as THREE.InstancedMesh;
    const instances = instanced.isInstancedMesh === true ? instanced.count : 1;

    let calls: number;
    let triangles: number;

    if (Array.isArray(mesh.material) && geometry.groups.length > 0) {
      // One draw call per group, and each group is a range into the index
      // buffer — which is how the whole heightfield is seven calls and one mesh.
      calls = geometry.groups.length;
      triangles = 0;
      for (const group of geometry.groups) triangles += group.count / 3;
    } else {
      calls = 1;
      const index = geometry.getIndex();
      const vertices = index !== null
        ? index.count
        : (geometry.getAttribute('position')?.count ?? 0);
      triangles = vertices / 3;
    }

    meshes.push({
      name: mesh.name,
      calls,
      triangles: triangles * instances,
      instances,
      castsShadow: mesh.castShadow,
    });
  };

  walk(root);
  return totalOf(meshes);
}

function totalOf(meshes: readonly MeshCost[]): SceneCost {
  let drawCalls = 0;
  let triangles = 0;
  let shadowDrawCalls = 0;
  let shadowTriangles = 0;

  for (const mesh of meshes) {
    drawCalls += mesh.calls;
    triangles += mesh.triangles;
    if (mesh.castsShadow) {
      shadowDrawCalls += mesh.calls;
      shadowTriangles += mesh.triangles;
    }
  }

  return {
    meshes,
    drawCalls,
    triangles,
    shadowDrawCalls,
    shadowTriangles,
    totalDrawCalls: drawCalls + shadowDrawCalls,
    totalTriangles: triangles + shadowTriangles,
  };
}

/**
 * Which category a mesh belongs to, from the name `render/terrain.ts` gave it.
 *
 * **The fallthrough is `surround`, so a new mesh family that is not named here
 * is silently charged to the surround** — which is why M13's potholes get a
 * line of their own rather than being left to land in the default. The totals
 * would have been right either way; the per-category report, which is what a
 * budget conversation is actually held over, would have quietly stopped being.
 */
export function categoryOf(name: string): CostCategory {
  if (name === 'level-heightfield') return 'heightfield';
  if (name.startsWith('level-blocks-')) return 'blocks';
  if (name.startsWith('level-props-')) return 'props';
  if (name.startsWith('level-markings')) return 'markings';
  if (name.startsWith('level-hazards')) return 'hazards';
  if (name.startsWith('knockabout-target')) return 'targets';
  return 'surround';
}

/**
 * The build context an Ultra rung is measured with, headlessly — M39 (§6.3
 * W7).
 *
 * The renderer hands `createTerrain`/`createProps` a context carrying the
 * shared Ultra uniforms and the device's anisotropy ceiling; under
 * `node --test` there is no device, so the uniforms are
 * `createUltraShared()`'s (which needs no GL context, by contract) and the
 * anisotropy is 1. Neither can change what is *built* — they are material
 * state, and this file counts meshes, groups and triangles — so a
 * measurement taken with this context is the measurement of the world the
 * renderer builds with its own.
 */
export function headlessUltraContext(recipe: UltraRecipe): UltraBuildContext {
  return { recipe, shared: createUltraShared(), maxAnisotropy: 1 };
}

/** The context a recipe needs: an Ultra rung gets a headless one, an ordinary recipe none. */
function measureContext(recipe: BuildRecipe): UltraBuildContext | undefined {
  return isUltraRecipe(recipe) ? headlessUltraContext(recipe) : undefined;
}

/**
 * Build the level's scene, measure it, and free it again.
 *
 * The scene is disposed before returning, because a sweep measures hundreds of
 * candidate routes and a measurement that leaked a world per seed would be the
 * exact failure invariant 10 exists to catch.
 *
 * **Any recipe the renderer can build**, ordinary or Ultra (M39): an Ultra
 * rung is what `render/ultra/ultraCost.ts` predicts and `ultraCost.test.ts`
 * holds the prediction to this measurement, exactly as `renderCost.test.ts`
 * holds `planRenderCost` to it. The ordinary call — no recipe, or an
 * ordinary one — builds with no context and is byte-for-byte the call it
 * always was.
 */
export function measureLevelScene(
  plan: LevelPlan,
  recipe: BuildRecipe = BASELINE_PRESENTATION,
): LevelSceneCost {
  const view = createTerrain(plan, recipe, measureContext(recipe));
  // **The target family is measured here even though `createTerrain` does not
  // build it** — M14. `render/Renderer.ts` builds it beside the terrain rather
  // than inside it, on the checkpoint gates' pattern, but the two are not
  // alike in what they cost: a gate family is the same six markers on every
  // world and lives in `NON_LEVEL_RESERVE`, while targets are *level content*
  // that scales with what the generator placed. Measuring them anywhere but
  // here would leave `planRenderCost` predicting a cost that
  // `measureLevelScene` could not see, and the exact-equality assertion in
  // `renderCost.test.ts` would fail on every seed carrying a target.
  const targets = createTargets(plan.targets ?? []);
  const combined = new THREE.Group();
  combined.add(view.group);
  combined.add(targets.group);
  try {
    const whole = measureObject(combined);
    const buckets = new Map<CostCategory, MeshCost[]>([
      ['surround', []], ['heightfield', []], ['blocks', []], ['props', []], ['markings', []],
      ['hazards', []], ['targets', []],
    ]);
    for (const mesh of whole.meshes) buckets.get(categoryOf(mesh.name))!.push(mesh);

    const byCategory = {
      surround: totalOf(buckets.get('surround')!),
      heightfield: totalOf(buckets.get('heightfield')!),
      blocks: totalOf(buckets.get('blocks')!),
      props: totalOf(buckets.get('props')!),
      markings: totalOf(buckets.get('markings')!),
      hazards: totalOf(buckets.get('hazards')!),
      targets: totalOf(buckets.get('targets')!),
    } as const;

    return { ...whole, byCategory, cellsDrawn: view.cellsDrawn };
  } finally {
    targets.dispose();
    view.dispose();
  }
}

// ---------------------------------------------------------------------------
// Everything in the frame that is not the level
// ---------------------------------------------------------------------------

/**
 * What the rest of the scene costs, so the level knows what is left for it.
 *
 * The §9 ceiling is on the whole frame, not on the level, so the generator's
 * budget contract needs a reserve — and a reserve that was written down by hand
 * is a reserve that is wrong the first time the rider grows a part. This builds
 * the same rig, ghost, gates, and particle fields `render/Renderer.ts` builds
 * and measures them.
 *
 * **Measured in the most expensive state the player can reach**, which is a
 * timed run against a saved ghost: gates visible, ghost visible, and a spark
 * and a dust burst in the air (both fields live, one call each — QA r2). Free
 * ride at rest costs materially less, because all of them start hidden and
 * three draws nothing for an invisible subtree. The cheaper state is not the
 * one a budget is written against.
 *
 * The background is three's own pass rather than anything this project builds —
 * `scene.background` is the sky texture — and it is one call for a full-screen
 * quad, counted here so the reserve is the whole remainder rather than
 * *almost* the whole remainder.
 */
export const BACKGROUND_PASS = { drawCalls: 1, triangles: 2 } as const;

/**
 * Somewhere for the paddle to point while it is being measured — M14.
 *
 * Any finite point does: what is being measured is a mesh, and a mesh costs the
 * same wherever it is aimed. It exists only because `applySwing`'s "carrying
 * nothing" case is `null`, and the reserve has to be taken in the state where
 * the rider *is* carrying one.
 */
const PADDLE_MEASURE_POINT = new THREE.Vector3(0, 1.4, 1);

/**
 * The reserve for one rider, and the reason there is a loop above it.
 *
 * From M14.5 the frame can hold either character, and the two do not cost the
 * same: Trollina trades sleeve panels, elbow pads and a casting shoulder panel
 * for one merged head of hair. **A budget measured against whichever look
 * happens to be the default under-reserves the moment the player picks the
 * other one**, and the generator would then accept routes the frame cannot
 * afford — silently, because nothing in a route's validation knows a rider
 * exists. So `measureNonLevelScene` measures every look and keeps the worst on
 * each axis independently, which is conservative in the only direction a budget
 * may be wrong.
 */
/**
 * Which second rider the frame is holding — M18, and the pack from M39 Part P.
 *
 * **They are alternatives, not additions**, and `render/Renderer.ts` enforces
 * that with one slot rather than leaving it to convention: a Time-trial ghost
 * and a chase cop cannot appear together because no state exists in which both
 * are shown. So the reserve is the *worse* of the two frames, exactly as it is
 * already the worse of the two rider looks, and for the same reason — only one
 * of them is ever on screen.
 *
 * `'pack'` is the slot's chase state from Part P (§39.6b.5): `CHASE.roomSize −
 * outlaws` cop trims — three in the solo face (q209), two or one in a couch —
 * still in the one slot, so a ghost and the pack never coexist either. `'cop'`
 * stays as the single trim, because the split and quad sweeps' companion rows
 * are written against it and the enumeration order is part of a measurement's
 * identity (`playableSubsets`' note).
 */
export type SecondRider = 'none' | 'ghost' | 'cop' | 'pack';

/**
 * One chase room as the scene holds it — M39 Part P (§39.6b.4b, `docs/M39_CHASE.md` §2f).
 *
 * The rule has two faces and one shape: up to three outlaws against one cop
 * slot, the slot either a CPU pack of `CHASE.roomSize − outlaws` trims or one
 * human seated on the cop's full rig (q218), never both.
 */
export interface ChaseRoomScene {
  /** The seated outlaws' looks — one per human outlaw pane. */
  readonly outlaws: readonly RiderLook[];
  /** A human holds the cop slot: one `createCopRidingRig` seated in the scene (q218). */
  readonly copSeated: boolean;
  /** CPU trims in the pack slot: `CHASE.roomSize − outlaws` when the slot is CPU, 0 beside a human cop. */
  readonly pack: number;
}

/** What one scene holds outside the level: the seats, the slot, and the shared world. */
interface SceneSeating {
  /** Playable seat rigs, each on its character's machine. */
  readonly looks: readonly RiderLook[];
  /** A seated human cop on the full rig. */
  readonly copSeated: boolean;
  /** The Time-trial ghost in the slot. */
  readonly ghost: boolean;
  /** Cop trims in the slot: 0 (none), 1 (M18's lone tail) or the pack. */
  readonly trims: number;
}

/** The CPU pack a room of `outlaws` fills the cop slot with (§39.6b: 1 → 3, 2 → 2, 3 → 1). */
function cpuPack(outlaws: number): number {
  return Math.max(0, CHASE.roomSize - outlaws);
}

/**
 * One frame's non-level cost, for however many riders are seated.
 *
 * `looks` is the whole seated roster rather than one rider: **one derived
 * writer for one and for two**, so the split reserve cannot drift away from
 * the single-player one by being a second copy of this function that somebody
 * forgot to update. The ghost and the cop are built from `looks[0]` because
 * both are the *player's* companion — a recording of them, or the officer
 * chasing them — and neither has ever been per-seat.
 *
 * From M39 Part P the same writer seats a chase room: a human cop is one more
 * seat rig (`createCopRidingRig`, armed like every seat), and the slot holds
 * however many trims the room fills it with, each armed, each prefixed by its
 * index exactly as the renderer will name them (R-7).
 */
function measureSeating(checkpoints: LevelPlan['checkpoints'], seating: SceneSeating): SceneCost {
  const meshes: MeshCost[] = [];

  const looks = seating.looks;
  const look = looks[0];
  // The machine follows the character exactly as `app/Game.ts` installs it —
  // M19. A reserve measured on the standard wheel alone would under-reserve
  // the moment the player picks Red Rider, which is the same silent failure
  // the rider-look loop already exists to prevent, one axis over.
  const machine = machineLook(machineForCharacter(look.id));
  const rigs = looks.map((seated) => (
    createRidingRig(seated, machineLook(machineForCharacter(seated.id)))
  ));
  if (seating.copSeated) rigs.push(createCopRidingRig());
  const ghost = createGhostRider(look, machine);
  // At least one trim is always built, hidden when the slot holds none, so
  // the frames without a cop are the builds they always were.
  const cops = Array.from({ length: Math.max(1, seating.trims) }, (_, index) => createCopRider({ index }));
  const gates = createCheckpointGates(checkpoints);
  const sparks = createParticleField({
    name: 'fx-sparks',
    capacity: FX.sparkCount,
    size: FX.sparkSize,
    gravity: FX.sparkGravity,
    fadeTo: FX.sparkFadeColour,
  });
  const dust = createParticleField({
    name: 'fx-dust',
    capacity: FX.dustCount,
    size: FX.dustSize,
    gravity: FX.dustGravity,
    fadeTo: LIGHTING.horizonColour,
  });

  try {
    ghost.setVisible(seating.ghost);
    for (const [index, cop] of cops.entries()) {
      const shown = index < seating.trims;
      cop.setVisible(shown);
      if (shown) {
        // Posed and armed, for the reason the player's rig below is: a paddle
        // that has never been aimed is a hidden mesh, and a reserve taken with
        // it hidden is a reserve that does not know about the mode it exists
        // for. Every cop of the pack carries one (q212).
        cop.applySwing(PADDLE_MEASURE_POINT, 0, 1);
        cop.apply(createPose());
      }
    }
    gates.group.visible = true;
    // The paddle, shown for the same reason and by the same argument — M14. It
    // hangs off the rider's grip and starts hidden, so a reserve measured
    // without this line would be a frame budget that does not know the mode the
    // owner is about to ride exists. `measureObject` is faithful to three and
    // skips an invisible subtree entirely, which is exactly what makes the
    // cheap state the wrong one to write a budget against.
    // Through `apply`, because that is the method that consumes a recorded
    // swing — `applySwing` only says what to do, and the paddle is not shown
    // until the stance has been solved and the mesh aimed. Measuring after the
    // record and before the apply is measuring a hidden mesh.
    //
    // **Every seated rig, armed.** A second seat is a whole second rider and a
    // whole second machine in the same scene; the particle pools, the gates
    // and the background are shared, which is why they are outside this loop.
    // The seated human cop is armed like everyone else: his hits are strikes.
    for (const seated of rigs) {
      seated.applySwing(PADDLE_MEASURE_POINT, 0, 1);
      seated.apply(createPose());
    }
    // **And the particle fields, live** (QA r2; PLANS §21.11's own fix). A
    // field is a hidden `Points` until it holds a particle, exactly as the
    // paddle is a hidden mesh until aimed, and `measureObject` skips it — so a
    // reserve measured at rest never counted the call each field draws while a
    // pedal strike's sparks or a rough surface's dust are in the air, which is
    // reachable in every mode. One particle each, through the fields' own
    // API: +1 colour call a field, no shadow, no triangles.
    for (const field of [sparks, dust]) {
      field.emit({
        x: 0, y: 0, z: 0, axisX: 0, axisY: 1, axisZ: 0,
        count: 1, speed: 1, spread: 0, lifeSeconds: 1, colour: 0xffffff,
      });
    }

    for (const root of [
      ...rigs.map((seated) => seated.group),
      ghost.group, ...cops.map((cop) => cop.group), gates.group, sparks.points, dust.points,
    ]) {
      meshes.push(...measureObject(root).meshes);
    }
    meshes.push({
      name: 'scene-background',
      calls: BACKGROUND_PASS.drawCalls,
      triangles: BACKGROUND_PASS.triangles,
      instances: 1,
      castsShadow: false,
    });
    return totalOf(meshes);
  } finally {
    dust.dispose();
    sparks.dispose();
    gates.dispose();
    for (const cop of cops) cop.dispose();
    ghost.dispose();
    for (const seated of rigs) seated.dispose();
  }
}

/** A seating of playable riders wearing one companion state — the sweeps' row. */
function measureNonLevelSceneFor(
  checkpoints: LevelPlan['checkpoints'],
  looks: readonly RiderLook[],
  second: SecondRider,
): SceneCost {
  return measureSeating(checkpoints, {
    looks,
    copSeated: false,
    ghost: second === 'ghost',
    trims: second === 'cop' ? 1 : second === 'pack' ? cpuPack(looks.length) : 0,
  });
}

/**
 * One pass of one chase room — M39 Part P (§39.6b.4b).
 *
 * The gates, the particle pools and the background are shared and counted
 * once; every rig — each outlaw's, the seated cop's, each trim of the pack —
 * is armed as today. A room is never a ghost frame: the pack holds the slot.
 */
export function measureChaseRoomScene(
  checkpoints: LevelPlan['checkpoints'],
  room: ChaseRoomScene,
): SceneCost {
  if (room.outlaws.length < 1) throw new Error('a chase room seats at least one outlaw');
  if (room.copSeated && room.pack > 0) {
    // §39.6b: a human in the cop slot means no CPU cops. A room that says
    // otherwise is a scene the rule cannot build, and pricing it would
    // over-reserve for nothing.
    throw new Error('a human cop and the CPU pack never share a room');
  }
  return measureSeating(checkpoints, {
    looks: room.outlaws,
    copSeated: room.copSeated,
    ghost: false,
    trims: room.pack,
  });
}

/**
 * Every room the rule allows for a contract, over playable subsets (q68
 * distinct) — M39 Part P (§39.6b.4b, `docs/M39_CHASE.md` §2f).
 *
 *   - **1 view** (Contract 1): the solo face — one outlaw and the pack of
 *     three trims (q209).
 *   - **2 views** (Contract 2): 1v1 with a human cop; 2v2 with the CPU
 *     holding the slot (two seat rigs and two trims).
 *   - **4 views** (Contract 3, which governs three and four panes): 2v1 with a
 *     human cop (three seats), 3v1 with the CPU (three seats and one trim),
 *     3v1 with a human cop (four seats, one of them the cop at full rig).
 *
 * The outlaws are never the cop's look: `PLAYABLE_RIDER_LOOKS` does not hold
 * him, and the roster offers Dorkins only to the cop seat (§39.6b.3b).
 */
export function chaseRooms(views: 1 | 2 | 4): readonly ChaseRoomScene[] {
  const cpu = (outlaws: readonly RiderLook[]): ChaseRoomScene => ({
    outlaws, copSeated: false, pack: cpuPack(outlaws.length),
  });
  const human = (outlaws: readonly RiderLook[]): ChaseRoomScene => ({
    outlaws, copSeated: true, pack: 0,
  });
  if (views === 1) return playableSubsets(1).map(cpu);
  if (views === 2) return [...playableSubsets(1).map(human), ...playableSubsets(2).map(cpu)];
  return [
    ...playableSubsets(2).map(human),
    ...playableSubsets(3).map(cpu),
    ...playableSubsets(3).map(human),
  ];
}

/** Rendered views for a room: one per human, the seated cop included. */
export function chaseRoomViews(room: ChaseRoomScene): number {
  return room.outlaws.length + (room.copSeated ? 1 : 0);
}

/**
 * One cop rig on its own, posed and armed — M39 Part P, the record's first row
 * (§39.6b.4: "the cop rig today: colour calls, shadow calls, triangles").
 *
 * `{}` is the shipped trim, `{ full: true }` the q218 full rig. Read by
 * `tools/render-cost.mjs` for the report and by `renderCost.test.ts`.
 */
export function measureCopRig(options: CopRiderOptions = {}): SceneCost {
  const cop = createCopRider(options);
  try {
    cop.setVisible(true);
    cop.applySwing(PADDLE_MEASURE_POINT, 0, 1);
    cop.apply(createPose());
    return measureObject(cop.group);
  } finally {
    cop.dispose();
  }
}

/**
 * One seat rig on its own, posed and armed: a playable look on its own
 * machine, or `'cop'` for the seated human cop (`createCopRidingRig`).
 */
export function measureSeatRig(look: RiderLook | 'cop'): SceneCost {
  const rig = look === 'cop'
    ? createCopRidingRig()
    : createRidingRig(look, machineLook(machineForCharacter(look.id)));
  try {
    rig.applySwing(PADDLE_MEASURE_POINT, 0, 1);
    rig.apply(createPose());
    return measureObject(rig.group);
  } finally {
    rig.dispose();
  }
}

/**
 * **The instanced pack — modelled, not built** (§39.6b.4's third row).
 *
 * Three cops from one set of draw calls: an `InstancedMesh` per rig part with
 * three instance matrices, the shadow subset instanced too
 * (`checkpointGates.ts` is the precedent). Priced from the measured trim
 * rather than from a build, because the plain route ships and the spike is
 * held as the remedy if the phone rejects it: the one-trim frame's calls, and
 * its triangles plus `pack − 1` more trims' worth on both passes. Worst on
 * each axis over every playable look × {ghost, instanced pack}, exactly as
 * the shipped reserve is taken. No game code builds this.
 */
export function modelInstancedPackReserve(checkpoints: LevelPlan['checkpoints']): SceneCost {
  const trim = measureCopRig();
  const extra = cpuPack(1) - 1;
  const perFrame = PLAYABLE_RIDER_LOOKS.flatMap((look) => {
    const ghost = measureNonLevelSceneFor(checkpoints, [look], 'ghost');
    const one = measureNonLevelSceneFor(checkpoints, [look], 'cop');
    const instanced: SceneCost = {
      ...one,
      triangles: one.triangles + extra * trim.triangles,
      shadowTriangles: one.shadowTriangles + extra * trim.shadowTriangles,
      totalTriangles: one.totalTriangles + extra * trim.totalTriangles,
    };
    return [ghost, instanced];
  });
  return worstOnEachAxis(perFrame);
}

export function measureNonLevelScene(checkpoints: LevelPlan['checkpoints']): SceneCost {
  // Every frame a player can actually reach: any playable rider, wearing
  // either second rider — the ghost, or from M39 Part P the pack of
  // `CHASE.roomSize − 1` trims (q209: "no more mr nice guy", three cops is the
  // solo chase). The lone trim is no longer a solo state the player can reach
  // except through the `?cops=1` probe, which is a subset of the pack and
  // prices nothing new.
  const perFrame = PLAYABLE_RIDER_LOOKS.flatMap((look) => (
    (['ghost', 'pack'] as const).map((second) => (
      measureNonLevelSceneFor(checkpoints, [look], second)
    ))
  ));
  // Worst on each axis separately. A frame could in principle be cheaper in
  // calls and dearer in triangles, and reserving the per-axis maximum is the
  // only answer that is safe for both.
  return worstOnEachAxis(perFrame);
}

/**
 * Every unordered distinct seating of `seats` playable riders — M27 Phase 0.
 *
 * Lifted out of `measureSplitNonLevelScene` when the four-seat measurement
 * needed the same walk at a different size, because a second copy of a
 * combination enumerator is how the two sweeps would drift. Unordered because
 * the cost of a scene holding N rigs does not depend on who sat down first;
 * distinct because q68 forbids two riders on one screen wearing the same
 * character. Lexicographic over the roster order, which keeps the pair sweep's
 * result byte-identical to the loop this replaced: `reduce` keeps the first of
 * two equal worsts, so enumeration order is part of the measurement's identity.
 *
 * Exported for `renderCost.test.ts`, which asserts the enumeration rather than
 * trusting it — C(5,2) is ten and C(5,4) is five today, and both grow with the
 * roster.
 */
export function playableSubsets(seats: number): (readonly RiderLook[])[] {
  const subsets: (readonly RiderLook[])[] = [];
  const picked: RiderLook[] = [];
  const walk = (from: number): void => {
    if (picked.length === seats) {
      subsets.push([...picked]);
      return;
    }
    const room = seats - picked.length;
    for (let index = from; index <= PLAYABLE_RIDER_LOOKS.length - room; index += 1) {
      picked.push(PLAYABLE_RIDER_LOOKS[index]);
      walk(index + 1);
      picked.pop();
    }
  };
  walk(0);
  return subsets;
}

/**
 * Worst on each axis separately, over every frame a sweep produced.
 *
 * A frame could in principle be cheaper in calls and dearer in triangles, and
 * reserving the per-axis maximum is the only answer that is safe for both —
 * the same rule `measureNonLevelScene` has applied since M14.5, stated once.
 */
function worstOnEachAxis(perPass: readonly SceneCost[]): SceneCost {
  const worstCalls = perPass.reduce((a, b) => (b.totalDrawCalls > a.totalDrawCalls ? b : a));
  const worstTriangles = perPass.reduce((a, b) => (b.totalTriangles > a.totalTriangles ? b : a));
  return {
    ...worstCalls,
    totalTriangles: worstTriangles.totalTriangles,
    shadowTriangles: worstTriangles.shadowTriangles,
  };
}

/**
 * One sweep, any seat count: every distinct seating, wearing either companion
 * — and from M39 Part P every chase room the contract governs, appended after
 * today's rows (§39.6b.4b: "the worse of today's playable subsets plus one
 * companion and the chase rooms"). Appended, not interleaved, because `reduce`
 * keeps the first of two equal worsts and enumeration order is part of the
 * measurement's identity.
 */
function measureSeatedNonLevelScene(
  checkpoints: LevelPlan['checkpoints'],
  seats: 2 | 4,
): SceneCost {
  const perPass = playableSubsets(seats).flatMap((seated) => (
    (['ghost', 'cop'] as const).map((second) => (
      measureNonLevelSceneFor(checkpoints, seated, second)
    ))
  ));
  for (const room of chaseRooms(seats)) perPass.push(measureChaseRoomScene(checkpoints, room));
  return worstOnEachAxis(perPass);
}

/**
 * The same reserve for a desktop split frame — M25 Phase 3, Contract 2.
 *
 * **Per pass, not per frame.** This is what one half of a split screen costs
 * outside the level; `SPLIT_PASSES` above is what turns it into a frame. The
 * two are kept apart so that a reader can check either half of the arithmetic
 * and so that a third view, if the couch ever grows one, is a constant change.
 *
 * The sweep is over **unordered distinct pairs** of playable riders — see
 * `playableSubsets` for both words. Ten pairs against the single-player
 * sweep's five riders, each still wearing the worse of the two companion
 * slots.
 *
 * **M39 Part P (q219):** and every two-pane chase room — 1v1 beside a human
 * cop, and 2v2 with the CPU pack of two trims in the slot, which is the room
 * that breaches (two seat rigs and two trims a pass, one trim more than a
 * pair wearing the lone cop).
 */
export function measureSplitNonLevelScene(checkpoints: LevelPlan['checkpoints']): SceneCost {
  return measureSeatedNonLevelScene(checkpoints, 2);
}

/**
 * The reserve for one pass of a **four-seat quadrant frame** — M27 Phase 0,
 * the scope-lock measurement (`docs/PLANS.md` §27.5–§27.6).
 *
 * Four whole rigs and four whole machines in the one scene; the gates, the
 * particle pools and the background still shared and still counted once. The
 * sweep is over unordered distinct **four-subsets** of the playable roster —
 * five of them today — each still wearing the worse of the two companion
 * slots, exactly as the split reserve does. Keeping the companion is not a
 * claim that a quad session shows a ghost (q93 says a race never does); it is
 * the same conservatism both existing reserves are built on — a reserve is
 * written against the dearest state the frame could reach, and dropping the
 * slot here would also make the §27.2 estimate, which extrapolates from the
 * companion-carrying split reserve, a comparison of unlike things.
 *
 * It became Contract 3's reserve at M27 Phase 1 (`RENDER_BUDGET_QUAD`).
 *
 * **M39 Part P (q219):** and every grid chase room — 2v1 and 3v1 beside a
 * human cop, 3v1 with one CPU trim. The 3v1 human room is four seat rigs, one
 * of them the cop at full rig, with no companion; it can move this reserve
 * only by the uniform's delta over the rigs it replaces.
 */
export function measureQuadNonLevelScene(checkpoints: LevelPlan['checkpoints']): SceneCost {
  return measureSeatedNonLevelScene(checkpoints, 4);
}

// ---------------------------------------------------------------------------
// The prop kit, part by part
// ---------------------------------------------------------------------------

/** What one prop of one kind costs, and which instanced parts it lands in. */
export interface PropKindCost {
  readonly kind: PropKind;
  /** Instances per part id, keyed by the name `render/props.ts` gives the mesh. */
  readonly parts: Readonly<Record<string, number>>;
  readonly triangles: number;
  readonly shadowTriangles: number;
}

/** A plan carrying nothing but the props handed to it. */
function propOnlyPlan(props: readonly Prop[]): LevelPlan {
  return {
    id: 'render-cost-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: {
      originX: 0, originZ: 0, spacing: 1, columns: 2, rows: 2,
      heights: [0, 0, 0, 0], surfaces: ['grass'],
    },
    segments: [],
    checkpoints: [],
    props: [...props],
  };
}

function probeProp(kind: PropKind, x: number, z: number): Prop {
  return {
    kind,
    position: { x, y: 0, z },
    rotationY: 0,
    scale: 1,
    // Only `building` reads a size, and the default the kit falls back to is
    // the one measured here. Every other kind ignores it.
    ...(kind === 'building' ? { size: { x: 12, y: 18, z: 12 } } : {}),
  };
}

/**
 * The per-instance triangle count of every part the kit builds.
 *
 * Measured by placing one prop of every kind and dividing each part's mesh by
 * its instance count, which is exactly the number `data/renderCost.ts` carries
 * for the sealed half to multiply by.
 *
 * Under an Ultra rung (M39) this is the number `ultra/ultraCatalog.ts`
 * carries — `tools/render-cost.mjs --write` regenerates that file from
 * `measurePartTriangles(ULTRA_FULL)` — and the cast flag it reads is the
 * rung's own, so a building part that starts casting under `kit.buildings`
 * reports `castsShadow: true` here.
 */
export function measurePartTriangles(
  recipe: BuildRecipe = BASELINE_PRESENTATION,
): Map<string, { triangles: number; castsShadow: boolean }> {
  const props = PROP_KINDS.map((kind, index) => probeProp(kind, index * 40, 0));
  // One block of every height class, because a building's facade is chosen by
  // its own height: a low block wears `buildingBody` and only a high-rise ever
  // builds `buildingTall`. A probe made of one 18 m block would leave the
  // most expensive part in the whole kit unmeasured — and one that starts at
  // 18 m leaves the *cheapest* one unmeasured at the other end, which is how
  // `buildingLow` arrived unpriced. Every class this list omits is a part the
  // budget cannot see.
  for (const [index, height] of [5, 18, 34, 64].entries()) {
    props.push({
      kind: 'building',
      position: { x: -60 - index * 40, y: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      size: { x: 14, y: height, z: 14 },
    });
  }
  // M39 Phase 2: the roof part exists only on a building with a look, so one
  // house is placed to measure it. Its body is a part already probed above.
  props.push({
    kind: 'building',
    position: { x: -260, y: 0, z: 0 },
    rotationY: 0,
    scale: 1,
    size: { x: 10, y: 7, z: 12 },
    look: 'residential',
  });
  const view = createProps(propOnlyPlan(props), recipe, measureContext(recipe));
  try {
    const out = new Map<string, { triangles: number; castsShadow: boolean }>();
    for (const mesh of measureObject(view.group).meshes) {
      out.set(mesh.name.replace('level-props-', ''), {
        triangles: mesh.triangles / mesh.instances,
        castsShadow: mesh.castsShadow,
      });
    }
    return out;
  } finally {
    view.dispose();
  }
}

/**
 * What each kind costs on its own.
 *
 * One kind at a time, because the whole point of the kit is that kinds *share*
 * parts — a tree's crown and the crown that tops one of the level's own trunk
 * colliders are the same triangles in the same draw call — and a measurement
 * taken from the whole set could not attribute a shared part to either.
 *
 * `building` is the one kind whose cost is not a constant: its setback tower is
 * decided by a hash of its position, so it is measured over a spread of
 * positions and reported at its worst case, which is the only figure a budget
 * contract can use.
 */
export function measurePropKinds(): PropKindCost[] {
  const out: PropKindCost[] = [];

  for (const kind of PROP_KINDS) {
    const samples = kind === 'building' ? 64 : 1;
    let worst: PropKindCost | null = null;

    for (let index = 0; index < samples; index += 1) {
      // Spread across a grid so the position hash the kit reads takes many
      // different values rather than one.
      const view = createProps(propOnlyPlan([
        probeProp(kind, (index % 8) * 37 + 1, Math.floor(index / 8) * 41 + 1),
      ]));
      try {
        const cost = measureObject(view.group);
        const parts: Record<string, number> = {};
        for (const mesh of cost.meshes) parts[mesh.name.replace('level-props-', '')] = mesh.instances;
        const candidate: PropKindCost = {
          kind,
          parts,
          triangles: cost.triangles,
          shadowTriangles: cost.shadowTriangles,
        };
        if (worst === null || candidate.triangles > worst.triangles) worst = candidate;
      } finally {
        view.dispose();
      }
    }

    out.push(worst!);
  }

  return out;
}
