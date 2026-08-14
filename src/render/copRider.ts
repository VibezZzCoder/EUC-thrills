/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import type { EucPose } from '../simulation/EucController.ts';
import { STANDARD_MACHINE_LOOK, type MachineLook } from './machineLook.ts';
import { COP_LOOK } from './riderLook.ts';
import { createRidingRig, type RidingRig } from './ridingRig.ts';

/**
 * Officer Dorkins on the road — M18 Phase 2.
 *
 * A second **live** rider: he is lit, he has colours, he casts a shadow, and he
 * is posed every frame from a real `EucController` rather than from a
 * recording. That is what separates him from the ghost, and it is also why he
 * could not simply be built and added to the scene.
 *
 * ## The budget, which is this file's whole reason to exist
 *
 * Measured 2026-08-13, before a line of this was written (`docs/PLANS.md`
 * §18.4). A full riding rig costs **60 draw calls** — 36 colour and 24 shadow.
 * The frame's ceiling is 150, the densest of the six pinned adversarial routes
 * already spends 134, and `level/generatedLevel.test.ts` asserts the densest
 * known route stays under 95% of the ceiling. A second full rig would put that
 * route at 194. There is no version of this milestone in which the cop is
 * another `createRidingRig` call.
 *
 * Two things make him affordable, and they are decisions rather than tricks.
 *
 * **1. He and the ghost are alternatives, and the renderer enforces it.**
 * `render/Renderer.ts` holds one *second-rider slot* with three states — none,
 * ghost, cop — so no call sequence can put both in a frame, and
 * `render/renderCost.ts` reserves the **worse of the two** rather than the sum.
 * A Time-trial ghost and a chase cop never coexisting was going to be an
 * assumption; making it a state makes it a fact.
 *
 * **2. He is a cheaper build than the player's rig, by two rules.** The look
 * itself omits what a uniform does not need (`COP_LOOK`: no elbow pads, no
 * sleeve panels, no separate seat mesh), and this file trims what a second
 * rider thirty metres away cannot resolve:
 *
 *   - **the wheel's decoration goes.** Its accent stripe, head and tail lamps
 *     and status light exist to say something about *the player's* machine —
 *     battery state, which way it is facing in a screenshot — and none of that
 *     is a question anybody asks of the thing chasing them.
 *   - **the shadow pass is a subset**: the wheel's shell, the torso and the
 *     head. Those three carry the contact and the silhouette; the limb shadows
 *     of a rider at chase distance are below what a single 2048 map resolves,
 *     and a full pass was costing a third of his whole budget.
 *
 * The trim is expressed as rules over names the rig already has rather than as
 * a hand-listed set of meshes, so a part added to the rig later joins the right
 * side of it by itself. `render/renderCost.test.ts` measures what comes out.
 *
 * ## What is deliberately *not* cheapened
 *
 * His colours, his lighting, and his pose. He is shaded by the same sun as the
 * player through the same materials, and posed by `RidingRig.apply` from a
 * pose the same controller produced — because the entire point of the chase is
 * that he is riding, and a cop who moved differently from a player would read
 * as a scripted obstacle rather than as somebody chasing you.
 */

/** Wheel parts a second rider does not need. Decoration, not silhouette. */
const DROPPED_MESHES: ReadonlySet<string> = new Set([
  'euc-accent',
  'euc-headlight',
  'euc-taillight',
  'euc-status-light',
  // The shell's side pads and the suspension link: 464 triangles of moulding
  // between the shell and the tyre, at a scale where the two read as one body
  // anyway. These are the calls that took the cop from over the ceiling to
  // under it — see the arithmetic below.
  'euc-pad-right',
  'euc-pad-left',
  'euc-suspension',
]);

/**
 * **His wheel's headlamp is paint, not a mesh.** The rig's decoration meshes
 * stay dropped — the calls are the scarce thing — but the shell's material is
 * `vertexColors: true` like everything in the rig, and the cop's shell
 * geometry is his own copy, so a repaint of its nose vertices buys the bright
 * lamp square a machine coming *at* you leads with. Banded off the shell's own
 * bounding box, because the shell is authored in `render/euc.ts`'s frame and
 * this file should not have to know its arithmetic. Not emissive — a painted
 * lamp does not light the road — but at chase distance a bright square on a
 * dark nose *is* a headlight, the same judgement the painted sock ring makes.
 * (A hi-vis band around the arch skirt was tried and removed: the shell's
 * vertex rows are sparse down there, so the band's edge interpolated half way
 * up the shell and read as a spill of paint rather than trim.)
 *
 * From M19 Phase 2 the repaint rides the `MachineLook` axis it pioneered: he
 * rides the standard machine (`data/machines.ts` says why) wearing this one
 * paint, and `render/euc.ts` applies it at build. Same band, same values, same
 * pixels — `renderCost.test.ts` would notice a moved vertex as a moved call.
 */
const COP_MACHINE_LOOK: MachineLook = {
  ...STANDARD_MACHINE_LOOK,
  paintShell: (geometry: THREE.BufferGeometry): void => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null) return;
    const span = Math.max(1e-3, box.max.y - box.min.y);
    const position = geometry.getAttribute('position');
    const colour = geometry.getAttribute('color');
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      const z = position.getZ(i);
      if (
        z > box.max.z - 0.028
        && y > box.min.y + span * 0.30
        && y < box.min.y + span * 0.62
        && Math.abs(position.getX(i)) < 0.045
      ) {
        colour.setXYZ(i, 3.2, 3.2, 3.4);
      }
    }
  },
};

/**
 * How much geometry a mesh needs before it is worth a shadow, triangles.
 *
 * **A rule rather than a list, and the rule is bulk.** What a shadow does at
 * chase distance is put the rider on the ground and give him an outline; the
 * things that do that are the wheel's shell, its tyre, the torso and the head,
 * and everything below this threshold — boots, hands, forearms, the neck, the
 * paddle — contributes a smear a single 2048 map cannot resolve anyway. Chosen
 * so those four are in and the rest are out, with the nearest excluded part
 * (the paddle, at 376) close enough behind it that the choice is visible in the
 * numbers rather than hidden in a set literal.
 */
const SHADOW_MIN_TRIANGLES = 390;

export interface CopRider {
  /** Root. Added to the scene by `render/Renderer.ts`, hidden by default. */
  readonly group: THREE.Group;
  /** Colour-pass draw calls while visible. Zero while hidden. */
  readonly drawCalls: number;
  /** Shadow-pass draw calls while visible. */
  readonly shadowDrawCalls: number;
  readonly triangles: number;
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** Pose him from a controller pose, exactly as the player's rig is posed. */
  apply(pose: EucPose): void;
  /** Pose his paddle — M14's `applySwing`, forwarded unchanged. */
  applySwing(headWorld: THREE.Vector3 | null, angle: number, blend: number): void;
  dispose(): void;
}

export function createCopRider(): CopRider {
  const group = new THREE.Group();
  group.name = 'cop-rider';
  // Hidden until a chase starts. Free ride, the timed run and Knockabout must
  // cost nothing for a rider who is not in them.
  group.visible = false;

  const rig: RidingRig = createRidingRig(COP_LOOK, COP_MACHINE_LOOK);
  group.add(rig.group);

  // **Every name in the cop's copy of the rig is prefixed**, for the reason
  // `render/ghostRider.ts` records at length and paid for once already:
  // `getObjectByName` walks the graph depth-first and returns the first match,
  // so a second `riding-rig` in the scene silently redirects the entire QA
  // harness onto whichever rig happens to come first. That cost twenty-nine
  // browser scenarios at M10 and it is not being paid twice.
  //
  // The trim below therefore reads the names *before* this runs.
  const trim = (): void => {
    rig.group.traverse((object) => {
      if ((object as { isMesh?: boolean }).isMesh !== true) return;
      const mesh = object as THREE.Mesh;

      if (DROPPED_MESHES.has(mesh.name)) {
        mesh.visible = false;
        mesh.castShadow = false;
        return;
      }

      const geometry = mesh.geometry;
      const index = geometry.getIndex();
      const faces = (index !== null
        ? index.count
        : (geometry.getAttribute('position')?.count ?? 0)) / 3;
      mesh.castShadow = mesh.castShadow && faces >= SHADOW_MIN_TRIANGLES;
      // He receives shadows like anything else in the world — a rider the
      // player's own shadow falls across is what makes him look like he is
      // *in* the scene rather than composited over it, and receiving costs
      // nothing extra in a single-pass shadow map.
    });
  };
  trim();

  rig.group.traverse((object) => {
    if (object.name !== '') object.name = `cop-${object.name}`;
  });

  let drawCalls = 0;
  let shadowDrawCalls = 0;
  let triangles = 0;
  rig.group.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh !== true) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.visible) return;
    drawCalls += 1;
    if (mesh.castShadow) shadowDrawCalls += 1;
    const geometry = mesh.geometry;
    const index = geometry.getIndex();
    triangles += (index !== null ? index.count : geometry.getAttribute('position').count) / 3;
  });

  return {
    group,
    get drawCalls(): number {
      return drawCalls;
    },
    get shadowDrawCalls(): number {
      return shadowDrawCalls;
    },
    get triangles(): number {
      return triangles;
    },
    get visible(): boolean {
      return group.visible;
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    apply(pose: EucPose): void {
      rig.apply(pose);
    },

    applySwing(headWorld: THREE.Vector3 | null, angle: number, blend: number): void {
      rig.applySwing(headWorld, angle, blend);
    },

    dispose(): void {
      rig.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}
