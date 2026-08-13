/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, CHALLENGE, FX } from '../data/tuning.ts';
import { clamp01 } from '../shared/maths.ts';
import type { Checkpoint } from '../level/plan.ts';

/**
 * The checkpoint gates — render-only markers standing beside each `Checkpoint`.
 *
 * **A gate is never a collider and never a solid, and that is the whole reason
 * this file exists separately from anything the simulation reads.** The
 * terrain sampler resolves a collider by its *top face*, so an arch the rider
 * passes under, built as a collider, would read as ground three metres up — a
 * rider who ducks under a gate would land on it. `level/plan.ts` states the
 * trap on the `Checkpoint` type itself; this file is the half of it that draws
 * geometry, and it contributes nothing to `plan.solids` or to any segment's
 * colliders because it cannot: it is handed detection data and returns meshes.
 *
 * ## The shape, and why an overhead beam is allowed here
 *
 * Corridor checkpoints are two flanking pylons and one slender header spanning
 * them. A plaza-wide checkpoint becomes one capped overhead marker: its volume
 * edges are 17–19 metres from the centreline, so pylons there disappear behind
 * architecture while moving them inward would put intangible geometry on a
 * legal riding line. What says *gate* at riding speed is the thing crossing the
 * sky above the route, and it is exactly the thing that would have been the M7
 * bug if it were solid. Since nothing here is solid, it is allowed.
 *
 * The header is deliberately slender rather than an arch: 0.22 m of bar across
 * a 38 m start line reads as a line drawn on the sky, where a deep lintel that
 * wide would read as a wall the player is not sure they can pass.
 *
 * ## Detection stays authoritative
 *
 * Corridor geometry is derived from the checkpoint's own volume — the clear
 * opening between its pylons is exactly `2 × halfExtents.x`, and its header
 * sits at the top of the box. The wide form deliberately stops promising a
 * one-to-one drawn width: it marks the volume's centre without narrowing the
 * legal detection area. `checkpointGates.test.ts` asserts both forms rather
 * than trusting this paragraph.
 *
 * ## One draw call, whatever the level authors
 *
 * Every part of every gate is one instance of one unit box in one
 * `InstancedMesh`. Six gates built as individual meshes would be 12–18 draw
 * calls for six copies of one shape; instanced they are **one**, and a level
 * with twenty checkpoints would still be one. This is the standing rule
 * `render/props.ts` records for repeated dressing, applied to the first thing
 * outside the dressing that repeats.
 *
 * ## Unlit, because brightness is carrying meaning
 *
 * `BLOCKOUT_COLOURS.gate` and `.gatePassed` are the same hue at two
 * brightnesses — never red against green, which the most common colour-vision
 * deficiencies cannot separate. That only works if brightness on screen means
 * *state* and nothing else: under a lit material a passed gate in full sun
 * would out-brighten a gate ahead standing in a tree's shadow, and the cue
 * would silently become a lighting cue. `MeshBasicMaterial` makes the instance
 * colour the value that reaches the screen, so a gate reads the same in shadow
 * as in sun. It is still tone-mapped, so it lives in the same grade as
 * everything else (`DESIGN.md` §6), and the flare below uses that: it pushes
 * the colour past 1 and lets ACES give it a white core, which is the same
 * trick `FX.sparkIntensity` uses for a hot spark.
 *
 * ## The crossing feedback is visual, and it is stepped
 *
 * There is no checkpoint sound, deliberately. This game's audio law is
 * near-silence with nothing that fires often, and the owner has already had a
 * recovery beep replaced by a light flare (`FX.statusBootColour`). Crossing a
 * gate flares it; the HUD carries the split. The flare runs on the
 * **simulation clock** through `step()`, never on wall time, so `advance(n)`
 * reaches the same frame every run — the rule `render/euc.ts`'s `setStatus`
 * established and `DESIGN.md` §6c records.
 */

export interface CheckpointGates {
  /** Root. Added to the scene by `render/Renderer.ts`. */
  readonly group: THREE.Group;
  /** How many checkpoints were drawn. Zero on a plan that carries none. */
  readonly gates: number;
  /** Colour-pass draw calls while visible: one, or none with no gates. */
  readonly drawCalls: number;
  readonly triangles: number;
  readonly visible: boolean;
  /** Show or hide every marker. False in free ride, where they cost nothing. */
  setVisible(visible: boolean): void;
  /** Which `routeIndex` is being sought; lower indices read as passed. */
  setProgress(nextRouteIndex: number): void;
  /** Flare the gate just crossed. From the fixed step. */
  flare(routeIndex: number): void;
  /** Advance the flares on the simulation clock. From the fixed step. */
  step(stepSeconds: number): void;
  dispose(): void;
}

/**
 * Bar thickness for both the pylons and the header, metres.
 *
 * Local geometry rather than a ride value, in the same spirit as the shell
 * proportions in `render/euc.ts` — it describes how this marker is drawn and
 * nothing reads it but this file. The size is set against the chase camera the
 * way `DESIGN.md` §6b sets a particle's: at the arm's six metres a 1000-pixel
 * viewport gives roughly 80 pixels per metre, so 0.22 m is a bar you can see
 * at the near pylon and still make out as a line at fifty. Thicker and the
 * widest gate's header becomes a wall across the plaza; thinner and it
 * disappears against a bright sky at distance.
 */
const GATE_BAR_THICKNESS = 0.22;

/**
 * How far below the gate's own surface height the pylons keep going, as a
 * multiple of the checkpoint's half-height.
 *
 * A gate's ground level is sampled at the checkpoint's *centre*, and its
 * pylons stand up to nineteen metres out from there across a crowned road, a
 * shoulder, and whatever the corridor's cross-slope is doing. **A pylon that
 * floats is a bug; a buried pylon is invisible**, so the skirt is drawn and
 * the terrain hides whatever of it is underground. One half-height (1.6 m) is
 * far more fall than any corridor cross section produces, and the extra
 * triangles are free — it is the same box, scaled.
 */
const GATE_SKIRT_FRACTION = 1;

/** Parts per gate: left pylon, right pylon, header. */
const PARTS_PER_GATE = 3;

interface GateState {
  readonly kind: Checkpoint['kind'];
  readonly routeIndex: number;
  /** Where this gate's three instances start in the mesh. */
  readonly firstInstance: number;
  /** Authored transforms, restored when this gate is the active objective. */
  readonly transforms: readonly THREE.Matrix4[];
  /** Flare, 1 at the crossing and decaying to 0. */
  flare: number;
}

export function createCheckpointGates(
  checkpoints: readonly Checkpoint[],
): CheckpointGates {
  const group = new THREE.Group();
  group.name = 'checkpoint-gates';
  // Free ride is the default and the mode the owner's five-minute
  // no-objective test is judged in. Gates start hidden so that mode pays
  // nothing at all, rather than paying for something it then fades out.
  group.visible = false;

  // An empty checkpoint array means "no gates", cleanly: no geometry, no
  // material, no mesh, and a `dispose` with nothing to do. Every level built
  // by a unit-test fixture and the proving ground itself take this path.
  if (checkpoints.length === 0) {
    return {
      group,
      gates: 0,
      drawCalls: 0,
      triangles: 0,
      get visible(): boolean {
        return group.visible;
      },
      setVisible(visible: boolean): void {
        group.visible = visible;
      },
      setProgress(): void {},
      flare(): void {},
      step(): void {},
      dispose(): void {
        group.removeFromParent();
      },
    };
  }

  // A unit box standing on its base, so an instance's scale is its metric
  // size and its position is where its foot goes. The white `color`
  // attribute is not optional: `instanceColor` only reaches the fragment
  // shader when the material sets `vertexColors`, which also declares a
  // `color` attribute the shader multiplies by — and a geometry without one
  // gets WebGL's black default. `render/props.ts` records this trap at
  // length; it is the fifth thing this project has nearly shipped as a
  // silhouette.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  const vertexCount = geometry.getAttribute('position').count;
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Array(vertexCount * 3).fill(1), 3),
  );
  // From the *index*, not the position count: a box shares its eight corners
  // across twelve triangles, so counting positions would report two thirds of
  // the real cost to the budget.
  const trianglesPerBox = (geometry.getIndex()?.count ?? vertexCount) / 3;

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
  });

  const instanceCount = checkpoints.length * PARTS_PER_GATE;
  const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);
  mesh.name = 'checkpoint-gate-bars';
  // A marker is not a thing in the world. It casts no shadow — a shadow would
  // argue it is architecture, and it would cost a second draw call for the
  // shadow pass — and it is not pickable, so nothing can pull the chase
  // camera in around a gate the player rides straight through.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = (): void => {};

  const gates: GateState[] = [];
  const byRouteIndex = new Map<number, GateState>();

  const matrix = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const gateFrame = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  checkpoints.forEach((checkpoint, gateIndex) => {
    const halfWidth = checkpoint.halfExtents.x;
    const halfHeight = checkpoint.halfExtents.y;
    /**
     * **A gate too wide to span becomes one centred overhead marker.**
     *
     * The first M10 pass left its pylons on the detection volume's edges. That
     * kept geometry out of the legal line, but the plaza's edges sit nineteen
     * metres from centre — outside the camera and behind its gateway walls —
     * so the active start line had no visible marker. Keeping the full header
     * was not the answer either: a 39 m beam crossing the sky had already
     * failed the gameplay-scale review.
     *
     * Wide gates therefore cap the overhead span and drop the ground posts.
     * The bar remains above the detection volume, never in the rider envelope;
     * the HUD bearing and distance identify its centre; and the detection box
     * keeps the generous legal catch area authored by the plan.
     */
    const spanned = halfWidth <= CHALLENGE.gateDrawnMaxHalfWidth;
    const drawnHalfWidth = spanned ? halfWidth : CHALLENGE.gateWideMarkerHalfWidth;
    // The box's centre is one half-height above the surface, so the surface
    // is one half-height below it and the opening is twice that tall.
    const surfaceY = checkpoint.centre.y - halfHeight;
    const openingHeight = halfHeight * 2;
    const bar = GATE_BAR_THICKNESS;
    const skirt = halfHeight * GATE_SKIRT_FRACTION;

    // The gate's own frame: origin on the surface under the checkpoint
    // centre, yawed to the heading the rider goes through it. `+X` is
    // therefore across the route, which is the axis `halfExtents.x` measures.
    position.set(checkpoint.centre.x, surfaceY, checkpoint.centre.z);
    quaternion.setFromAxisAngle(up, checkpoint.headingY);
    scale.setScalar(1);
    gateFrame.compose(position, quaternion, scale);

    const firstInstance = gateIndex * PARTS_PER_GATE;
    const transforms: THREE.Matrix4[] = [];

    // A normal corridor gets two pylons whose inner faces are exactly on the
    // detection volume's edge. A plaza-wide checkpoint cannot: its edges sit
    // behind architecture and outside the camera, which made the active start
    // line invisible. Wide gates use a centred overhead marker instead, so
    // their pylon slots are degenerate and nothing intangible stands in the
    // rider's path.
    for (const side of [1, -1]) {
      if (spanned) {
        local.makeScale(bar, openingHeight + skirt, bar);
        local.setPosition(side * (halfWidth + bar / 2), -skirt, 0);
      } else {
        local.makeScale(0, 0, 0);
        local.setPosition(0, openingHeight, 0);
      }
      matrix.multiplyMatrices(gateFrame, local);
      const part = side > 0 ? 0 : 1;
      mesh.setMatrixAt(firstInstance + part, matrix);
      transforms[part] = matrix.clone();
    }

    // The header, its underside exactly at the top of the box and its ends
    // flush with the pylons' outer faces.
    //
    // The wide version is deliberately capped: a 39 m plaza gantry reads as a
    // random beam across the sky, while a centred overhead bar reads as the
    // line the bearing and distance are pointing at. It stays above the whole
    // detection volume, so a rider never passes through visible geometry.
    local.makeScale(drawnHalfWidth * 2 + bar * 2, bar, bar);
    local.setPosition(0, openingHeight, 0);
    matrix.multiplyMatrices(gateFrame, local);
    mesh.setMatrixAt(firstInstance + 2, matrix);
    transforms[2] = matrix.clone();

    const state: GateState = {
      kind: checkpoint.kind,
      routeIndex: checkpoint.routeIndex,
      firstInstance,
      transforms,
      flare: 0,
    };
    gates.push(state);
    byRouteIndex.set(checkpoint.routeIndex, state);
  });
  mesh.instanceMatrix.needsUpdate = true;
  // Without this the mesh keeps the *unit box's* bounding sphere, centred on
  // the world origin — so every gate more than a metre from the plaza would be
  // frustum-culled while the player rode straight through it, with nothing in
  // the console. `InstancedMesh.computeBoundingSphere` is the one that reads
  // the instance matrices.
  mesh.computeBoundingSphere();
  group.add(mesh);

  // Preallocated. `step` runs at 120 Hz while any flare is alive, and three
  // `Color` objects a step is the same class of garbage the pose
  // interpolation and `euc.ts`'s status light are preallocated to avoid.
  const base = new THREE.Color();
  const flareColour = new THREE.Color();
  const composed = new THREE.Color();

  /** The `routeIndex` the run is currently seeking. -1 means none. */
  let nextRouteIndex = checkpoints[0]?.routeIndex ?? -1;

  // A future checkpoint is not route guidance: on the slice the finish stands
  // in the spawn plaza, closer and more legible than the real start line, so a
  // player naturally rides through the one gate the referee is required to
  // ignore. Only the active objective is drawn. The gate just crossed remains
  // for its short flare, and the finish remains after completion so the line
  // does not disappear under the wheel that earned it.
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const writeMatrices = (): void => {
    for (const gate of gates) {
      const active = gate.routeIndex === nextRouteIndex;
      const completedFinish = gate.kind === 'finish' && nextRouteIndex === gates.length;
      const visible = active || completedFinish || gate.flare > 0;
      for (let part = 0; part < PARTS_PER_GATE; part += 1) {
        mesh.setMatrixAt(
          gate.firstInstance + part,
          visible ? gate.transforms[part] : hidden,
        );
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const writeColours = (): void => {
    for (const gate of gates) {
      // The finish keeps its own colour whether it is ahead or behind. It is
      // the one gate that means something different from "another split", and
      // dimming it the instant the run ends would take the amber away at the
      // exact moment the player is looking at it.
      const hex = gate.kind === 'finish'
        ? BLOCKOUT_COLOURS.gateFinish
        : (nextRouteIndex >= 0 && gate.routeIndex < nextRouteIndex)
          ? BLOCKOUT_COLOURS.gatePassed
          : BLOCKOUT_COLOURS.gate;
      base.setHex(hex);

      if (gate.flare > 0) {
        // Toward the machine's own power-on flare — the cool boot white and
        // the magnitude `FX` already authors for "that just happened", judged
        // under this exposure and this tone mapping. Reused rather than
        // re-picked because a second flare magnitude in the same frame is a
        // second owner of the coupled visual system (`AGENTS.md` invariant 6).
        //
        // **Toward a fixed bright value rather than a multiple of the gate's
        // own colour**, and that is the whole point: a gate flares at the
        // instant it becomes *passed*, so a flare scaled from the passed
        // colour would be at its dimmest exactly when it has to be seen.
        // The peak is `CHALLENGE.gateFlareIntensity` rather than `FX`'s boot
        // intensity, which this originally borrowed. Same value, and now the
        // gates cannot be silently retuned by somebody adjusting the wheel's
        // power-on flare.
        flareColour.setHex(FX.statusBootColour).multiplyScalar(CHALLENGE.gateFlareIntensity);
        composed.copy(base).lerp(flareColour, gate.flare);
      } else {
        composed.copy(base);
      }

      for (let part = 0; part < PARTS_PER_GATE; part += 1) {
        mesh.setColorAt(gate.firstInstance + part, composed);
      }
    }
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  };

  writeColours();
  writeMatrices();

  return {
    group,
    gates: gates.length,
    drawCalls: 1,
    triangles: trianglesPerBox * instanceCount,

    get visible(): boolean {
      return group.visible;
    },

    setVisible(visible: boolean): void {
      group.visible = visible;
    },

    setProgress(next: number): void {
      if (next === nextRouteIndex) return;
      nextRouteIndex = next;
      writeColours();
      writeMatrices();
    },

    flare(routeIndex: number): void {
      const gate = byRouteIndex.get(routeIndex);
      // Silently ignored rather than asserted. A route index with no gate is
      // what a level with no checkpoints, or a rebuilt level, legitimately
      // hands back, and a marker is never worth throwing over.
      if (gate === undefined) return;
      // Rises instantly. A flare that faded *in* would peak after the rider
      // had already gone past the thing it is about.
      gate.flare = 1;
      writeColours();
      writeMatrices();
    },

    step(stepSeconds: number): void {
      if (stepSeconds <= 0) return;
      let alive = false;
      for (const gate of gates) {
        if (gate.flare <= 0) continue;
        // Linear, so it reaches exactly zero and the dirty flag can stop.
        // `CHALLENGE.gateFlareSeconds` is the lifetime of a one-shot effect
        // that has to be caught in the corner of the eye: at riding speed the
        // gate is six metres behind the player by the time it goes out. It was
        // `FX.sparkLifeSeconds` first, which is the same number and the wrong
        // owner — tuning how long a pedal-strike spark lives must not retune
        // every checkpoint in the game.
        gate.flare = clamp01(gate.flare - stepSeconds / CHALLENGE.gateFlareSeconds);
        alive = true;
      }
      // Only while something is actually decaying. A run spends almost all of
      // itself between checkpoints, and re-uploading a colour buffer 120 times
      // a second to write the values it already holds is work for nothing.
      if (alive) {
        writeColours();
        writeMatrices();
      }
    },

    dispose(): void {
      // `InstancedMesh.dispose()` and not only the geometry and material:
      // the instance matrix and colour buffers are the mesh's own, and
      // disposing around them leaves them alive across a level rebuild while
      // `renderer.info.memory` reports flat (`DESIGN.md` §8).
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}
