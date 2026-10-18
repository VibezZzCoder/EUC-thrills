/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type * as THREE from 'three';
import type { RidingRig } from './ridingRig.ts';

/**
 * The couch's per-pane rider shadow trim — the owner's OD-3, 2026-10-17
 * (perf item "riders", `docs/PERFORMANCE_AUDIT_2026-10-17.md` §2).
 *
 * A couch frame runs one shadow pass *per pane*, and every pane re-submitted
 * every seat rider's whole shadow. **In pane i, every other seat rider's
 * limbs, boots and hands stop casting**; their machine, torso and head — and
 * everything else they own — still cast, and the pane's own rider casts in
 * full. It is the accepted CPU-cop trim's reasoning (`copRider.ts`: a limb
 * shadow at couch distance is below what one shadow map resolves) applied to
 * the riders a pane is not about, and nothing else: the colour pass is
 * untouched, no rig is rebuilt, and with one seat there is no other rider, so
 * a solo frame trims nothing. **Only a split frame trims** (more than one
 * pane): one full-canvas view — the couch join panel posing two to four
 * chairs before a second claim splits the screen — keeps every shadow whole.
 *
 * **What a limb is, structurally**: a mesh that casts at build and is a
 * *direct* child of one of the ten limb joints `rider.ts` names
 * (`rider-{hip,knee,ankle,shoulder,elbow}-{left,right}`) — the thigh, shin
 * and arm lofts with whatever panels consolidation folded into them, the
 * boots on the ankles and the hands on the elbows. The paddle hangs two
 * groups below the right elbow (`rider-grip-right` → `rider-paddle`) and is
 * therefore not a limb; the torso, neck, head, face, hair, packs and the
 * whole machine are not under a limb joint at all.
 *
 * **Per pane, restored after the pane** — `Renderer.renderView` calls `trim`
 * for every rider the pane is not about before its `render`, and `restore`
 * in a `finally`. Only a mesh that is casting when trimmed is switched off,
 * and exactly those are switched back on, so a flag anything else owns (the
 * ghost's, the CPU-cop trim's, a hidden rig's) is never written. The lists
 * are computed once per rig; the trim itself allocates nothing per frame.
 */
const LIMB_JOINT = /^rider-(hip|knee|ankle|shoulder|elbow)-(left|right)$/;

/** The meshes a pane that is not about this rig stops casting — limbs, boots, hands. */
export function limbShadowCasters(rig: RidingRig): readonly THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  rig.group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true || !mesh.castShadow) return;
    const parent = mesh.parent;
    if (parent !== null && LIMB_JOINT.test(parent.name)) out.push(mesh);
  });
  return Object.freeze(out);
}

export interface PaneShadowTrim {
  /** The seat rigs, in seat order, as last synced. */
  readonly rigs: readonly RidingRig[];
  /**
   * Read the seats' rigs. Cheap and allocation-free when nothing changed, so
   * the frame calls it every time rather than every seat path remembering to.
   */
  sync(seats: readonly { readonly rig: RidingRig }[]): void;
  /** Stop `rig`'s limb, boot and hand shadows until `restore`. */
  trim(rig: RidingRig): void;
  /** Put back exactly what `trim` switched off since the last restore. */
  restore(): void;
  /** How many meshes are switched off right now. */
  readonly trimmed: number;
}

export function createPaneShadowTrim(): PaneShadowTrim {
  const rigs: RidingRig[] = [];
  const lists = new WeakMap<RidingRig, readonly THREE.Mesh[]>();
  // Fixed-capacity scratch: written by index and never truncated, so a frame
  // allocates nothing once it has held its largest trim.
  const off: (THREE.Mesh | null)[] = [];
  let count = 0;

  const listFor = (rig: RidingRig): readonly THREE.Mesh[] => {
    let list = lists.get(rig);
    if (list === undefined) {
      list = limbShadowCasters(rig);
      lists.set(rig, list);
    }
    return list;
  };

  return {
    rigs,
    get trimmed(): number {
      return count;
    },
    sync(seats): void {
      let same = seats.length === rigs.length;
      for (let index = 0; same && index < seats.length; index += 1) same = seats[index].rig === rigs[index];
      if (same) return;
      rigs.length = 0;
      for (const seat of seats) {
        rigs.push(seat.rig);
        listFor(seat.rig);
      }
    },
    trim(rig): void {
      const list = listFor(rig);
      for (let index = 0; index < list.length; index += 1) {
        const mesh = list[index];
        if (!mesh.castShadow) continue;
        mesh.castShadow = false;
        off[count] = mesh;
        count += 1;
      }
    },
    restore(): void {
      for (let index = 0; index < count; index += 1) {
        (off[index] as THREE.Mesh).castShadow = true;
        off[index] = null;
      }
      count = 0;
    },
  };
}
