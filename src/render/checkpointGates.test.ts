/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, FX } from '../data/tuning.ts';
import type { Checkpoint } from '../level/plan.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import { createProvingGround } from '../level/provingGround.ts';
import { createCheckpointGates } from './checkpointGates.ts';

/**
 * The gates, measured rather than looked at.
 *
 * Everything that matters about a marker except how it reads at speed is plain
 * maths: where its boxes are, how many draw calls they cost, which colour
 * carries which state, and whether the flare runs on the clock it claims to.
 * All of it answers under `node --test` with no WebGL, which is the layer
 * `AGENTS.md` asks to be exhausted first.
 *
 * The load-bearing one is the third test below. **A gate is never a collider**,
 * so nothing stops a rider hitting geometry that is drawn in the wrong place —
 * it would simply pass straight through it, which is worse: the player would
 * learn that the drawn gate and the timed gate are two different things.
 */

function checkpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'test',
    centre: { x: 0, y: 1.6, z: 0 },
    halfExtents: { x: 6, y: 1.6, z: 1.8 },
    headingY: 0,
    routeIndex: 0,
    kind: 'split',
    label: 'Test',
    ...overrides,
  };
}

function instancedMesh(group: THREE.Object3D): THREE.InstancedMesh {
  let found: THREE.InstancedMesh | null = null;
  group.traverse((object) => {
    if ((object as { isInstancedMesh?: boolean }).isInstancedMesh === true) {
      found = object as THREE.InstancedMesh;
    }
  });
  assert.ok(found !== null, 'the gates built no instanced mesh');
  return found;
}

/** The geometry every instance scales: a unit box standing on its base. */
const UNIT_BOX = new THREE.Box3(
  new THREE.Vector3(-0.5, 0, -0.5),
  new THREE.Vector3(0.5, 1, 0.5),
);

/**
 * Every instance's world-space axis-aligned box.
 *
 * Only meaningful for a gate whose heading is a multiple of a quarter turn —
 * for anything else this is the *bounding* box of an oriented one and is
 * bigger than the geometry. Use `insideInstance` when the gate is yawed.
 */
function boxes(mesh: THREE.InstancedMesh): THREE.Box3[] {
  const matrix = new THREE.Matrix4();
  const out: THREE.Box3[] = [];
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    out.push(UNIT_BOX.clone().applyMatrix4(matrix));
  }
  return out;
}

/** Whether a world point is inside one instance's *oriented* box. */
function insideInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  point: THREE.Vector3,
): boolean {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return UNIT_BOX.containsPoint(point.clone().applyMatrix4(matrix.invert()));
}

/**
 * `instanceColor` is a Float32 attribute, so a colour written as a double and
 * read back is equal to about seven digits and not exactly. Comparing with
 * `Color.equals` fails on the round trip rather than on anything real.
 */
function sameColour(actual: THREE.Color, hex: number): boolean {
  const expected = new THREE.Color().setHex(hex);
  return Math.abs(actual.r - expected.r) < 1e-6
    && Math.abs(actual.g - expected.g) < 1e-6
    && Math.abs(actual.b - expected.b) < 1e-6;
}

/** Non-degenerate instances among one gate's three reserved slots. */
function visibleParts(mesh: THREE.InstancedMesh, gateSlot: number): number {
  const matrix = new THREE.Matrix4();
  let visible = 0;
  for (let part = 0; part < 3; part += 1) {
    mesh.getMatrixAt(gateSlot * 3 + part, matrix);
    const e = matrix.elements;
    const scaleSquared = e[0] ** 2 + e[1] ** 2 + e[2] ** 2
      + e[4] ** 2 + e[5] ** 2 + e[6] ** 2
      + e[8] ** 2 + e[9] ** 2 + e[10] ** 2;
    // `Matrix4.decompose` substitutes unit scale for a degenerate matrix, so
    // read the basis columns directly: a hidden instance is exactly zero.
    if (scaleSquared > 1e-12) visible += 1;
  }
  return visible;
}

/** Rec. 709 luminance of a hex, in the linear space three lights in. */
function linearLuminance(hex: number): number {
  const colour = new THREE.Color().setHex(hex);
  return 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
}

test('every gate in a level is one draw call', () => {
  // The standing rule for repeated props (`render/props.ts`), applied to the
  // first thing outside the dressing that repeats. Six gates built as
  // individual meshes would be 12-18 draw calls for six copies of one shape.
  const plan = createSliceLevel();
  const gates = createCheckpointGates(plan.checkpoints);

  assert.ok(plan.checkpoints.length >= 2, 'the slice carries no checkpoints to draw');
  assert.equal(gates.gates, plan.checkpoints.length);
  assert.equal(gates.drawCalls, 1);
  assert.equal(instancedMesh(gates.group).count, plan.checkpoints.length * 3);
  // Three boxes a gate at twelve triangles each. Rounding error on the budget.
  assert.ok(gates.triangles <= 12 * 3 * plan.checkpoints.length);

  gates.dispose();
});

test('a level with no checkpoints builds no gates and costs nothing', () => {
  // The proving ground is a measuring instrument rather than a place
  // (`level/levels.ts`), and every unit-test fixture is the same. An empty
  // array is "no gates", not an error and not an empty mesh.
  for (const plan of [createProvingGround(), createSliceLevel()]) {
    const gates = createCheckpointGates(plan.id === 'proving' ? [] : plan.checkpoints);
    if (plan.id === 'proving') {
      assert.equal(gates.gates, 0);
      assert.equal(gates.drawCalls, 0);
      assert.equal(gates.triangles, 0);
      assert.equal(gates.group.children.length, 0);
      // And every operation on it is a no-op rather than a throw.
      gates.setProgress(3);
      gates.flare(3);
      gates.step(1 / 120);
      gates.setVisible(true);
    }
    gates.dispose();
  }
});

test('the gate you see is exactly the gate that detects you', () => {
  // A marker drawn at any other size is a second, disagreeing statement of
  // where the checkpoint is, and the player learns the wrong one.
  const cp = checkpoint({ centre: { x: 10, y: 1.6, z: -25 }, halfExtents: { x: 6, y: 1.6, z: 1.8 } });
  const gates = createCheckpointGates([cp]);
  const [left, right, header] = boxes(instancedMesh(gates.group));

  const surfaceY = cp.centre.y - cp.halfExtents.y;
  const openingTop = surfaceY + cp.halfExtents.y * 2;

  // The clear opening between the pylons' inner faces is the detection box.
  assert.ok(Math.abs(left.min.x - (cp.centre.x + cp.halfExtents.x)) < 1e-6);
  assert.ok(Math.abs(right.max.x - (cp.centre.x - cp.halfExtents.x)) < 1e-6);
  // The header's underside is the top of the box.
  assert.ok(Math.abs(header.min.y - openingTop) < 1e-6);
  // The pylons reach it.
  assert.ok(Math.abs(left.max.y - openingTop) < 1e-6);
  assert.ok(Math.abs(right.max.y - openingTop) < 1e-6);
  // And the header spans them both, ends flush with their outer faces.
  assert.ok(Math.abs(header.min.x - right.min.x) < 1e-6);
  assert.ok(Math.abs(header.max.x - left.max.x) < 1e-6);

  gates.dispose();
});

test('a plaza-wide checkpoint is a visible overhead marker, never invisible edge posts', () => {
  const cp = checkpoint({ halfExtents: { x: 19.4, y: 1.6, z: 1.8 } });
  const gates = createCheckpointGates([cp]);
  const mesh = instancedMesh(gates.group);
  const [left, right, header] = boxes(mesh);
  const openingTop = cp.centre.y + cp.halfExtents.y;

  assert.equal(visibleParts(mesh, 0), 1, 'the wide gate should reserve only its overhead bar');
  assert.ok(left.isEmpty() || left.getSize(new THREE.Vector3()).lengthSq() < 1e-12);
  assert.ok(right.isEmpty() || right.getSize(new THREE.Vector3()).lengthSq() < 1e-12);
  assert.ok(Math.abs(header.min.y - openingTop) < 1e-6, 'the marker hangs in the rider envelope');
  assert.ok(header.max.x - header.min.x < cp.halfExtents.x * 2, 'the marker was not capped');
  assert.ok(header.max.x - header.min.x > 8, 'the marker is too small to read as a gate');

  gates.dispose();
});

test('nothing is drawn in the space the rider rides through', () => {
  // The whole of the volume, up to its top, is clear. This is the assertion
  // that would have caught a gate whose pylons crept inboard as the bar
  // thickness changed — and a rider does not bounce off it, they ride through
  // it, so the failure would be silent.
  const plan = createSliceLevel();
  const gates = createCheckpointGates(plan.checkpoints);
  const mesh = instancedMesh(gates.group);

  plan.checkpoints.forEach((cp, gateIndex) => {
    gates.setProgress(cp.routeIndex);
    const surfaceY = cp.centre.y - cp.halfExtents.y;
    // Sample across the full width of the volume at rider head height, on the
    // gate's own plane.
    const across = new THREE.Vector3(Math.cos(cp.headingY), 0, -Math.sin(cp.headingY));
    for (let step = -20; step <= 20; step += 1) {
      // Strictly inside: a pylon's inner face sits exactly on the volume's
      // edge on purpose, and `Box3.containsPoint` counts a face as contained.
      const offset = (step / 20) * cp.halfExtents.x * 0.999;
      for (const height of [0.05, 1.0, 1.8, cp.halfExtents.y * 2 - 0.05]) {
        const point = new THREE.Vector3(
          cp.centre.x + across.x * offset,
          surfaceY + height,
          cp.centre.z + across.z * offset,
        );
        for (let part = 0; part < 3; part += 1) {
          assert.ok(
            !insideInstance(mesh, gateIndex * 3 + part, point),
            `gate ${cp.id} draws geometry inside its own opening at ${offset.toFixed(1)} m, ${height} m`,
          );
        }
      }
    }
  });

  gates.dispose();
});

test('a pylon may be buried but must never float', () => {
  // A gate's ground level is sampled at its centre and its pylons stand up to
  // nineteen metres out across a crown, a shoulder, and a cross-slope. A
  // buried foot is invisible; a floating one is a bug.
  const cp = checkpoint();
  const gates = createCheckpointGates([cp]);
  const [left, right] = boxes(instancedMesh(gates.group));
  const surfaceY = cp.centre.y - cp.halfExtents.y;

  for (const pylon of [left, right]) {
    assert.ok(
      pylon.min.y <= surfaceY - cp.halfExtents.y + 1e-6,
      'a pylon stops at the sampled surface and would float on a fall',
    );
  }

  gates.dispose();
});

test('the gate is yaw-aligned to the heading the rider goes through it', () => {
  // A gate across a corner is not axis-aligned to anything. Turned a quarter
  // turn, the width axis has to swing from world +X onto world -Z.
  const cp = checkpoint({ headingY: Math.PI / 2, halfExtents: { x: 6, y: 1.6, z: 1.8 } });
  const gates = createCheckpointGates([cp]);
  const [left, right] = boxes(instancedMesh(gates.group));

  // Positive yaw turns left, so local +X (the rider's left) maps onto -Z, and
  // the pylon's *inner* face — the one on the volume's edge — becomes its
  // maximum in z.
  assert.ok(Math.abs(left.max.z + 6) < 1e-6, `left pylon inner face at z ${left.max.z}`);
  assert.ok(Math.abs(right.min.z - 6) < 1e-6, `right pylon inner face at z ${right.min.z}`);
  // And the width no longer runs along world X at all.
  assert.ok(left.max.x - left.min.x < 0.3, 'the gate did not rotate');

  gates.dispose();
});

test('passed versus ahead is carried by brightness, never by hue alone', () => {
  // `BLOCKOUT_COLOURS` authors the pair; this asserts the property the pair
  // exists for. The most common colour-vision deficiencies cannot separate a
  // red from a green, so the difference has to survive being read as grey.
  const ahead = linearLuminance(BLOCKOUT_COLOURS.gate);
  const passed = linearLuminance(BLOCKOUT_COLOURS.gatePassed);
  assert.ok(passed < ahead * 0.5, `passed (${passed}) is not clearly darker than ahead (${ahead})`);

  // And they are the same hue, so the player learns one shape rather than two.
  const aheadHue = new THREE.Color().setHex(BLOCKOUT_COLOURS.gate).getHSL({ h: 0, s: 0, l: 0 });
  const passedHue = new THREE.Color().setHex(BLOCKOUT_COLOURS.gatePassed).getHSL({ h: 0, s: 0, l: 0 });
  assert.ok(Math.abs(aheadHue.h - passedHue.h) < 0.05, 'the gate pair are two different hues');

  // The finish is the one gate that means something else, and it also differs
  // in brightness rather than only in hue.
  const finish = linearLuminance(BLOCKOUT_COLOURS.gateFinish);
  assert.ok(finish > ahead * 1.5, 'the finish does not stand out from a split');
});

test('only the active gate is drawn, while a crossing flare briefly keeps the old one', () => {
  const plan = createSliceLevel();
  const gates = createCheckpointGates(plan.checkpoints);
  const mesh = instancedMesh(gates.group);
  const colour = new THREE.Color();

  const colourOf = (routeIndex: number): THREE.Color => {
    const slot = plan.checkpoints.findIndex((cp) => cp.routeIndex === routeIndex);
    mesh.getColorAt(slot * 3, colour);
    return colour.clone();
  };

  gates.setProgress(3);
  for (let slot = 0; slot < plan.checkpoints.length; slot += 1) {
    const cp = plan.checkpoints[slot];
    const parts = visibleParts(mesh, slot);
    if (cp.routeIndex === 3) assert.ok(parts >= 1, 'the active gate is hidden');
    else assert.equal(parts, 0, `future or passed gate ${cp.id} is still drawn`);
  }
  assert.ok(sameColour(colourOf(3), BLOCKOUT_COLOURS.gate));

  // Crossing keeps the old marker for the flare while the next objective is
  // already visible. It then disappears on the simulation clock.
  gates.flare(2);
  assert.ok(visibleParts(mesh, 2) >= 1, 'the crossed gate vanished before its flare');
  assert.ok(visibleParts(mesh, 3) >= 1, 'the next gate disappeared during the flare');
  for (let i = 0; i < 60; i += 1) gates.step(1 / 120);
  assert.equal(visibleParts(mesh, 2), 0, 'the crossed gate remained after its flare');

  // Completion keeps the finish line and nothing else for the results delay.
  gates.setProgress(plan.checkpoints.length);
  const finishSlot = plan.checkpoints.findIndex((cp) => cp.kind === 'finish');
  assert.ok(visibleParts(mesh, finishSlot) >= 1, 'the finish vanished on completion');
  assert.ok(sameColour(colourOf(plan.checkpoints[finishSlot].routeIndex), BLOCKOUT_COLOURS.gateFinish));

  // -1 is an unarmed or abandoned run: no route furniture is drawn.
  gates.setProgress(-1);
  for (let slot = 0; slot < plan.checkpoints.length; slot += 1) {
    assert.equal(visibleParts(mesh, slot), 0);
  }

  gates.dispose();
});

test('a flare rises on the crossing and dies on the simulation clock', () => {
  const gates = createCheckpointGates([checkpoint({ routeIndex: 2 })]);
  const mesh = instancedMesh(gates.group);
  const colour = new THREE.Color();
  const luminance = (): number => {
    mesh.getColorAt(0, colour);
    return 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
  };

  gates.setProgress(2);
  const resting = luminance();

  // It rises instantly. A flare that faded in would peak after the rider had
  // already gone past the thing it is about.
  gates.flare(2);
  const peak = luminance();
  assert.ok(peak > resting * 4, `a flare of ${peak} against ${resting} is not a flare`);

  // And it is spent on the simulation clock, so `advance(n)` reaches the same
  // frame every run. `FX.sparkLifeSeconds` is the project's authored lifetime
  // for a one-shot effect caught in the corner of the eye.
  const step = 1 / 120;
  const steps = Math.ceil(FX.sparkLifeSeconds / step);
  for (let i = 0; i < steps - 1; i += 1) gates.step(step);
  assert.ok(luminance() > resting, 'the flare was gone before its own lifetime');
  for (let i = 0; i < 4; i += 1) gates.step(step);
  assert.ok(
    Math.abs(luminance() - resting) < 1e-9,
    'the flare did not reach exactly its resting value',
  );

  gates.dispose();
});

test('the flare is deterministic — the same steps reach the same frame', () => {
  const run = (): number => {
    const gates = createCheckpointGates([checkpoint({ routeIndex: 0 })]);
    const mesh = instancedMesh(gates.group);
    gates.setProgress(0);
    gates.flare(0);
    for (let i = 0; i < 17; i += 1) gates.step(1 / 120);
    const colour = new THREE.Color();
    mesh.getColorAt(0, colour);
    gates.dispose();
    return colour.g;
  };
  assert.equal(run(), run());
});

test('a flare for a route index with no gate is ignored, not thrown', () => {
  // A rebuilt level, or a level with no checkpoints, legitimately hands back
  // an index nothing was drawn for. A marker is never worth throwing over.
  const gates = createCheckpointGates([checkpoint({ routeIndex: 0 })]);
  gates.flare(99);
  gates.step(1 / 120);
  gates.dispose();
});

test('gates are hidden by default and cast nothing when shown', () => {
  const gates = createCheckpointGates(createSliceLevel().checkpoints);
  // Free ride is the default and the mode the owner's five-minute
  // no-objective test is judged in. Hidden costs zero draw calls.
  assert.equal(gates.visible, false);
  assert.equal(gates.group.visible, false);

  gates.setVisible(true);
  assert.equal(gates.group.visible, true);
  const mesh = instancedMesh(gates.group);
  // A shadow would argue a marker is architecture, and it would cost a second
  // draw call for the shadow pass.
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);

  // And it is not pickable, so nothing pulls the chase camera in around a gate
  // the player rides straight through.
  const intersects: THREE.Intersection[] = [];
  mesh.raycast(new THREE.Raycaster(), intersects);
  assert.equal(intersects.length, 0);

  gates.dispose();
});

test('the instanced mesh carries the colour attribute its material needs', () => {
  // `instanceColor` only reaches the fragment shader when the material sets
  // `vertexColors`, which also declares a `color` attribute the shader
  // multiplies by — and a geometry without one gets WebGL's black default.
  // `render/props.ts` records this trap; this is the sixth mesh it applies to.
  const gates = createCheckpointGates([checkpoint()]);
  const mesh = instancedMesh(gates.group);
  const material = mesh.material as THREE.MeshBasicMaterial;
  assert.equal(material.vertexColors, true);

  const attribute = mesh.geometry.getAttribute('color');
  assert.ok(attribute !== undefined, 'the gate geometry would render black');
  for (let i = 0; i < attribute.count; i += 1) {
    assert.equal(attribute.getX(i), 1, 'the colour attribute is not white');
  }
  assert.ok(mesh.instanceColor !== null, 'no instance colours were written');

  gates.dispose();
});

test('the gates have an explicit disposal path and plateau across rebuilds', () => {
  const plan = createSliceLevel();
  const scene = new THREE.Scene();

  for (let round = 0; round < 4; round += 1) {
    const gates = createCheckpointGates(plan.checkpoints);
    scene.add(gates.group);
    const mesh = instancedMesh(gates.group);

    const events: string[] = [];
    mesh.geometry.addEventListener('dispose', () => events.push('geometry'));
    (mesh.material as THREE.Material).addEventListener('dispose', () => events.push('material'));
    // `InstancedMesh.dispose()` and not only the geometry and material: the
    // instance matrix and colour buffers are the mesh's own, and disposing
    // around them leaves them alive across a level rebuild while
    // `renderer.info.memory` reports flat (`DESIGN.md` §8).
    mesh.addEventListener('dispose', () => events.push('mesh'));

    gates.dispose();

    assert.deepEqual(events.sort(), ['geometry', 'material', 'mesh']);
    assert.equal(gates.group.parent, null);
  }
  assert.equal(scene.children.length, 0, 'a disposed gate set stayed in the scene');
});
