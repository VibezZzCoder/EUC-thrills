/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { PROP_KINDS, type PropKind } from '../data/props.ts';
import { FX, LIGHTING } from '../data/tuning.ts';
import { createCheckpointGates } from './checkpointGates.ts';
import { createGhostRider } from './ghostRider.ts';
import { createParticleField } from './particles.ts';
import { createProps } from './props.ts';
import { machineForCharacter } from '../data/machines.ts';
import { machineLook } from './machineLook.ts';
import { PLAYABLE_RIDER_LOOKS, type RiderLook } from './riderLook.ts';
import { createCopRider } from './copRider.ts';
import { createPose } from '../simulation/EucController.ts';
import { createRidingRig } from './ridingRig.ts';
import { createTargets } from './targets.ts';
import { createTerrain } from './terrain.ts';

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
 * Build the level's scene, measure it, and free it again.
 *
 * The scene is disposed before returning, because a sweep measures hundreds of
 * candidate routes and a measurement that leaked a world per seed would be the
 * exact failure invariant 10 exists to catch.
 */
export function measureLevelScene(plan: LevelPlan): LevelSceneCost {
  const view = createTerrain(plan);
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
 * timed run against a saved ghost: gates visible, ghost visible. Free ride
 * costs materially less, because both start hidden and three draws nothing for
 * an invisible subtree. The cheaper state is not the one a budget is written
 * against.
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
 * Which second rider the frame is holding — M18.
 *
 * **They are alternatives, not additions**, and `render/Renderer.ts` enforces
 * that with one slot rather than leaving it to convention: a Time-trial ghost
 * and a chase cop cannot appear together because no state exists in which both
 * are shown. So the reserve is the *worse* of the two frames, exactly as it is
 * already the worse of the two rider looks, and for the same reason — only one
 * of them is ever on screen.
 */
export type SecondRider = 'none' | 'ghost' | 'cop';

/**
 * One frame's non-level cost, for however many riders are seated.
 *
 * `looks` is the whole seated roster rather than one rider: **one derived
 * writer for one and for two**, so the split reserve cannot drift away from
 * the single-player one by being a second copy of this function that somebody
 * forgot to update. The ghost and the cop are built from `looks[0]` because
 * both are the *player's* companion — a recording of them, or the officer
 * chasing them — and neither has ever been per-seat.
 */
function measureNonLevelSceneFor(
  checkpoints: LevelPlan['checkpoints'],
  looks: readonly RiderLook[],
  second: SecondRider,
): SceneCost {
  const meshes: MeshCost[] = [];

  const look = looks[0];
  // The machine follows the character exactly as `app/Game.ts` installs it —
  // M19. A reserve measured on the standard wheel alone would under-reserve
  // the moment the player picks Red Rider, which is the same silent failure
  // the rider-look loop already exists to prevent, one axis over.
  const machine = machineLook(machineForCharacter(look.id));
  const rigs = looks.map((seated) => (
    createRidingRig(seated, machineLook(machineForCharacter(seated.id)))
  ));
  const ghost = createGhostRider(look, machine);
  const cop = createCopRider();
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
    ghost.setVisible(second === 'ghost');
    cop.setVisible(second === 'cop');
    if (second === 'cop') {
      // Posed and armed, for the reason the player's rig below is: a paddle
      // that has never been aimed is a hidden mesh, and a reserve taken with it
      // hidden is a reserve that does not know about the mode it exists for.
      cop.applySwing(PADDLE_MEASURE_POINT, 0, 1);
      cop.apply(createPose());
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
    for (const seated of rigs) {
      seated.applySwing(PADDLE_MEASURE_POINT, 0, 1);
      seated.apply(createPose());
    }

    for (const root of [
      ...rigs.map((seated) => seated.group),
      ghost.group, cop.group, gates.group, sparks.points, dust.points,
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
    cop.dispose();
    ghost.dispose();
    for (const seated of rigs) seated.dispose();
  }
}

export function measureNonLevelScene(checkpoints: LevelPlan['checkpoints']): SceneCost {
  // Every frame a player can actually reach: either playable rider, wearing
  // either second rider. Six builds, once, at build time.
  const perFrame = PLAYABLE_RIDER_LOOKS.flatMap((look) => (
    (['ghost', 'cop'] as const).map((second) => (
      measureNonLevelSceneFor(checkpoints, [look], second)
    ))
  ));
  // Worst on each axis separately. A frame could in principle be cheaper in
  // calls and dearer in triangles, and reserving the per-axis maximum is the
  // only answer that is safe for both.
  const worstCalls = perFrame.reduce((a, b) => (b.totalDrawCalls > a.totalDrawCalls ? b : a));
  const worstTriangles = perFrame.reduce((a, b) => (b.totalTriangles > a.totalTriangles ? b : a));
  return {
    ...worstCalls,
    totalTriangles: worstTriangles.totalTriangles,
    shadowTriangles: worstTriangles.shadowTriangles,
  };
}

/**
 * The same reserve for a desktop split frame — M25 Phase 3, Contract 2.
 *
 * **Per pass, not per frame.** This is what one half of a split screen costs
 * outside the level; `SPLIT_PASSES` above is what turns it into a frame. The
 * two are kept apart so that a reader can check either half of the arithmetic
 * and so that a third view, if the couch ever grows one, is a constant change.
 *
 * The sweep is over **unordered distinct pairs** of playable riders. Distinct
 * because q68 forbids two riders on one screen wearing the same character;
 * unordered because the cost of a scene holding two rigs does not depend on
 * which of them sat down first — the two contribute the same meshes either
 * way. Ten pairs against the single-player sweep's five riders, each still
 * wearing the worse of the two companion slots.
 */
export function measureSplitNonLevelScene(checkpoints: LevelPlan['checkpoints']): SceneCost {
  const pairs: (readonly [RiderLook, RiderLook])[] = [];
  for (let first = 0; first < PLAYABLE_RIDER_LOOKS.length; first += 1) {
    for (let second = first + 1; second < PLAYABLE_RIDER_LOOKS.length; second += 1) {
      pairs.push([PLAYABLE_RIDER_LOOKS[first], PLAYABLE_RIDER_LOOKS[second]]);
    }
  }
  const perPass = pairs.flatMap((pair) => (
    (['ghost', 'cop'] as const).map((second) => (
      measureNonLevelSceneFor(checkpoints, pair, second)
    ))
  ));
  const worstCalls = perPass.reduce((a, b) => (b.totalDrawCalls > a.totalDrawCalls ? b : a));
  const worstTriangles = perPass.reduce((a, b) => (b.totalTriangles > a.totalTriangles ? b : a));
  return {
    ...worstCalls,
    totalTriangles: worstTriangles.totalTriangles,
    shadowTriangles: worstTriangles.shadowTriangles,
  };
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
 */
export function measurePartTriangles(): Map<string, { triangles: number; castsShadow: boolean }> {
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
  const view = createProps(propOnlyPlan(props));
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
