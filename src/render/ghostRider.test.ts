/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, CHALLENGE, EUC, WHEEL } from '../data/tuning.ts';
import type { GhostSample } from '../simulation/ghost.ts';
import { createGhostRider } from './ghostRider.ts';
import { RIDER_LOOKS } from './riderLook.ts';
import { createRidingRig } from './ridingRig.ts';

/**
 * The ghost, measured rather than looked at.
 *
 * `render/` needs a browser for a *picture*, but a scene graph is plain maths:
 * the material, the draw-call count, the hidden parts, the derived pose, and
 * the disposal are all answerable under `node --test` with no WebGL context,
 * which is the layer `AGENTS.md` asks to be exhausted first. What the browser
 * still has to answer is whether a 42% alpha reads as a recording, and no
 * assertion here pretends otherwise.
 */

function sample(overrides: Partial<GhostSample> = {}): GhostSample {
  return {
    t: 0,
    x: 0,
    y: 0,
    z: 0,
    groundY: 0,
    headingY: 0,
    rollAngle: 0,
    speed: 0,
    crouch: 0,
    ...overrides,
  };
}

/** Every mesh under a root, whether or not it is currently visible. */
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) found.push(object as THREE.Mesh);
  });
  return found;
}

test('the ghost is one shared material, at the authored colour and opacity', () => {
  const ghost = createGhostRider();
  const all = meshes(ghost.group);
  assert.ok(all.length > 0, 'the ghost has no meshes at all');

  const materials = new Set(all.map((mesh) => mesh.material));
  assert.equal(materials.size, 1, 'the ghost was built from more than one material');

  const material = [...materials][0] as THREE.MeshBasicMaterial;
  // One colour for the whole ghost is what makes the alpha composite
  // order-independent, and `BLOCKOUT_COLOURS.ghost` is deliberately not a
  // tinted Cool Rider. Neither is this file's choice to make.
  assert.equal(material.color.getHex(THREE.SRGBColorSpace), BLOCKOUT_COLOURS.ghost);
  assert.equal(material.opacity, CHALLENGE.ghostOpacity);
  assert.equal(material.transparent, true);
  // Order-independence depends on this being off. See the file comment.
  assert.equal(material.depthWrite, false);
  // But the world must still occlude it.
  assert.equal(material.depthTest, true);
  // Unlit, so a gate-side reference stays legible under a tree and a
  // translucent copy of the player's own shading cannot read as a fault.
  assert.equal((material as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial, true);

  ghost.dispose();
});

test('the ghost casts no shadow, receives none, and cannot be picked', () => {
  const ghost = createGhostRider();
  const raycaster = new THREE.Raycaster();
  const intersects: THREE.Intersection[] = [];

  for (const mesh of meshes(ghost.group)) {
    // A second contact shadow under a rider who is not there reads as a bug.
    assert.equal(mesh.castShadow, false, 'a ghost mesh casts a shadow');
    assert.equal(mesh.receiveShadow, false, 'a ghost mesh receives a shadow');
    // The chase camera's probe reads the plan rather than the scene graph, so
    // this guards a *future* picker rather than the current one.
    mesh.raycast(raycaster, intersects);
  }
  assert.equal(intersects.length, 0, 'something picked the ghost');

  ghost.dispose();
});

test('the ghost hides exactly the parts the real rig does not cast from', () => {
  // The rule, not a list: a part its own authors judged too small or too flat
  // to cast at chase distance is a part that, in one flat colour, is invisible
  // — every one of them exists to be a *different colour* from the mesh it
  // sits on. Asserted against a real rig so the two cannot drift.
  const rig = createRidingRig();
  const rigMeshes = meshes(rig.group);
  const casting = rigMeshes.filter((mesh) => mesh.castShadow).length;
  const total = rigMeshes.length;
  rig.dispose();

  const ghost = createGhostRider();
  const ghostMeshes = meshes(ghost.group);
  const drawn = ghostMeshes.filter((mesh) => mesh.visible).length;

  assert.equal(ghostMeshes.length, total, 'the ghost is not built from a whole rig');
  assert.equal(drawn, casting, 'the ghost draws a different set from the rig it copies');
  assert.equal(ghost.drawCalls, casting);
  assert.ok(total > drawn, 'nothing was dropped — the rule found nothing to hide');

  ghost.dispose();
});

test('every rider fits the ghost budget, not just the one the default builds', () => {
  // **The budget is per character from M14.5**, and it has to be checked that
  // way: the reserve `level/renderBudget.ts` subtracts is measured over every
  // look and keeps the worst, so a look that quietly grew past the other would
  // ship routes the frame cannot afford. Trollina pays for her hair by not
  // having sleeve panels, elbow pads or a casting shoulder panel; this is the
  // assertion that keeps that trade honest rather than accidental.
  for (const look of RIDER_LOOKS) {
    const rig = createRidingRig(look);
    const rigMeshes = meshes(rig.group);
    const casting = rigMeshes.filter((mesh) => mesh.castShadow).length;
    const total = rigMeshes.length;
    rig.dispose();

    const ghost = createGhostRider(look);
    const ghostMeshes = meshes(ghost.group);
    const drawn = ghostMeshes.filter((mesh) => mesh.visible).length;

    assert.equal(ghostMeshes.length, total, `${look.id}: the ghost is not a whole rig`);
    assert.equal(drawn, casting, `${look.id}: the ghost draws a different set`);
    assert.equal(ghost.drawCalls, casting, `${look.id}: draw calls disagree with the rule`);
    assert.ok(total > drawn, `${look.id}: nothing was hidden`);
    // 26 since A1d, with the frame ceiling — the two moved together and for
    // the same reason. A recording is still the cheapest rig in the frame and
    // is still built at half density (`ghostDensity`), which is where its
    // triangles went; what it gained is the one casting mesh Maribel's hump
    // needs, plus a call of slack.
    assert.ok(ghost.drawCalls <= 26, `${look.id}: ${ghost.drawCalls} draw calls for a recording`);
    // **20 k since A1d**, and unlike the draw-call cap beside it this one was
    // never the binding constraint: the whole frame ceiling is 400 k and the
    // densest measured route sits under two thirds of it, so a recording at
    // eighteen thousand is four per cent of the budget. The number moved
    // because Maribel's hair is a merged buffer built by her own look — it
    // does not read the density table `ghostDensity` halves — and because the
    // owner opened the budget for exactly this: *"increase budget. Make it
    // better."* Draw calls remain the axis that is actually scarce.
    assert.ok(ghost.triangles < 20_000, `${look.id}: ${ghost.triangles} triangles`);

    // Every name still carries the prefix, whichever rider is underneath: the
    // M10 defect this guards — `getObjectByName` returning the ghost's frozen
    // joints to the whole QA harness — does not care which character is in the
    // scene, and a look that adds a mesh adds a name.
    ghost.group.traverse((object) => {
      if (object.name === '') return;
      assert.ok(object.name.startsWith('ghost-'), `${look.id}: ${object.name} is unprefixed`);
    });

    ghost.dispose();
  }
});

test('a hidden ghost costs nothing, and free ride is where it starts', () => {
  const ghost = createGhostRider();
  // Hidden by default. three skips an invisible subtree entirely, so the
  // draw-call cost of a ghost nobody asked for is zero rather than small.
  assert.equal(ghost.visible, false);
  assert.equal(ghost.group.visible, false);

  ghost.setVisible(true);
  assert.equal(ghost.group.visible, true);
  ghost.setVisible(false);
  assert.equal(ghost.group.visible, false);
  ghost.dispose();
});

test('the ghost fits the frame budget a second rig has to fit', () => {
  const ghost = createGhostRider();
  // `DESIGN.md` §8: 150 draw calls, 102 measured at M9. A whole second rig
  // would be 36; the shadow pass is gone and the colour-only detail with it.
  //
  // **This is the assertion that matters, and it is the one that has not moved
  // across either look pass.** Draw calls are the scarce resource here, and
  // `ghost.drawCalls` is exactly the count of parts carrying silhouette — so a
  // rig that grows a mesh fails here whatever it did to its triangles.
  assert.ok(ghost.drawCalls <= 24, `${ghost.drawCalls} draw calls for a recording`);
  // Triangles are the resource with room: the ceiling is 400,000 and the slice
  // sits near 220,000, so a second rig at six thousand is one and a half per
  // cent of it. Both M11 look passes — the rider's, then the machine's — bought
  // form with triangles *because* of that, and the assertion above is what
  // stopped either of them buying it with meshes instead. This bound is
  // therefore an order-of-magnitude guard rather than a budget: it catches a
  // rig that grew a subdivision surface, not one that grew a collar.
  assert.ok(ghost.triangles < 12_000, `${ghost.triangles} triangles`);
  ghost.dispose();
});

test('a recorded sample places the rig where it was recorded', () => {
  const ghost = createGhostRider();
  ghost.apply(sample({ x: 12.5, y: 3.25, z: -40, headingY: 1.1 }));

  const rig = ghost.group.getObjectByName('ghost-riding-rig');
  assert.ok(rig !== undefined, 'the rig root went missing');
  assert.equal(rig.position.x, 12.5);
  assert.equal(rig.position.y, 3.25);
  assert.equal(rig.position.z, -40);
  // No wobble on a ghost, so the rendered yaw is the recorded heading exactly.
  assert.ok(Math.abs(rig.rotation.y - 1.1) < 1e-9);

  ghost.dispose();
});

test('the upper body takes the controller\'s own share of the recorded lean', () => {
  const ghost = createGhostRider();
  const roll = 0.4;
  ghost.apply(sample({ rollAngle: roll }));

  const lean = ghost.group.getObjectByName('ghost-riding-lean-pivot');
  const pelvis = ghost.group.getObjectByName('ghost-rider-pelvis');
  assert.ok(lean !== undefined && pelvis !== undefined);

  // The rig rolls by -rollAngle, and the pelvis gives back the difference
  // between the rider's roll and the wheel's. Reading `riderUpperBodyRollFactor`
  // rather than a copied number is what stops the ghost and the player drifting
  // apart on a tuning change.
  assert.ok(Math.abs(lean.rotation.z + roll) < 1e-9);
  const expected = -(roll * EUC.riderUpperBodyRollFactor - roll);
  assert.ok(
    Math.abs(pelvis.rotation.z - expected) < 1e-9,
    `pelvis roll ${pelvis.rotation.z} is not the controller's split`,
  );

  ghost.dispose();
});

test('the wheel spins from the recorded speed, on the recording\'s own clock', () => {
  const ghost = createGhostRider();
  const radius = WHEEL.tyreDiameter / 2;

  ghost.apply(sample({ t: 0, speed: 10 }));
  const tyre = ghost.group.getObjectByName('ghost-euc-tyre');
  assert.ok(tyre !== undefined);
  // Nothing has elapsed yet, so nothing has turned.
  assert.equal(tyre.rotation.x, 0);

  ghost.apply(sample({ t: 0.5, speed: 10 }));
  assert.ok(Math.abs(tyre.rotation.x - (10 * 0.5) / radius) < 1e-9);

  // Signed: a ghost rolling backwards rolls its wheel backwards.
  ghost.apply(sample({ t: 1.0, speed: -10 }));
  assert.ok(Math.abs(tyre.rotation.x - 0) < 1e-9);

  ghost.dispose();
});

test('a restart rewinds the integrated state instead of unwinding it', () => {
  const ghost = createGhostRider();
  ghost.apply(sample({ t: 0, speed: 10 }));
  ghost.apply(sample({ t: 4, speed: 10 }));
  const tyre = ghost.group.getObjectByName('ghost-euc-tyre');
  assert.ok(tyre !== undefined && tyre.rotation.x > 1);

  // `R` during a run puts the clock back to zero. A smaller `t` is how this
  // file learns about it, which is what keeps the restart correct however the
  // caller reaches it.
  ghost.apply(sample({ t: 0, speed: 10 }));
  assert.equal(tyre.rotation.x, 0);

  ghost.dispose();
});

test('airborne is derived from the gap, and the quantisation cannot fake it', () => {
  const ghost = createGhostRider();
  const pelvis = ghost.group.getObjectByName('ghost-rider-pelvis');
  assert.ok(pelvis !== undefined);

  // `y` and `groundY` are quantised independently at `ghostPositionStep`, so a
  // grounded rider can show a step of gap that is arithmetic and not air. A
  // crouch at exactly that gap must still read as grounded, and therefore as a
  // tuck.
  ghost.apply(sample({ t: 0, y: CHALLENGE.ghostPositionStep, groundY: 0, crouch: 1 }));
  const groundedTuck = pelvis.rotation.x;

  ghost.apply(sample({ t: 1, y: 0.6, groundY: 0, crouch: 1 }));
  const airborneTuck = pelvis.rotation.x;

  assert.ok(
    groundedTuck > airborneTuck,
    'a grounded crouch did not hinge the torso further than an airborne one',
  );

  ghost.dispose();
});

test('nothing the recording does not carry is invented', () => {
  const ghost = createGhostRider();
  // A ghost never crashes, never wobbles, and never puts a foot down: those
  // are incidents, and a translucent rider having one beside the player reads
  // as the player having it. The observable consequence is that a ghost at a
  // standstill still holds a riding stance rather than blending to the rest
  // pose the controller would have reached.
  ghost.apply(sample({ t: 0, speed: 0 }));
  ghost.apply(sample({ t: 5, speed: 0 }));

  const rig = ghost.group.getObjectByName('ghost-riding-rig');
  const euc = ghost.group.getObjectByName('ghost-euc-blockout');
  assert.ok(rig !== undefined && euc !== undefined);
  // `restWheelLean * restFactor - wheelCrashLean`, both neutral.
  assert.equal(euc.rotation.z, 0);
  assert.equal(rig.rotation.x, 0);
  assert.equal(rig.rotation.z, 0);

  ghost.dispose();
});

test('the ghost has an explicit disposal path and takes its rig with it', () => {
  const ghost = createGhostRider();
  const all = meshes(ghost.group);
  const material = all[0].material as THREE.Material;

  const disposed = new Set<string>();
  material.addEventListener('dispose', () => disposed.add('ghost-material'));
  const geometries = new Set(all.map((mesh) => mesh.geometry));
  let geometriesDisposed = 0;
  for (const geometry of geometries) {
    geometry.addEventListener('dispose', () => {
      geometriesDisposed += 1;
    });
  }
  // The rig's *own* materials are still tracked by the modules that built
  // them even though `mesh.material` was overwritten, so disposal has to be
  // exhaustive rather than best-effort (invariant 10).
  const parent = new THREE.Scene();
  parent.add(ghost.group);

  ghost.dispose();

  assert.ok(disposed.has('ghost-material'), 'the ghost material was not disposed');
  assert.equal(geometriesDisposed, geometries.size, 'a rig geometry survived disposal');
  assert.equal(ghost.group.parent, null, 'the ghost stayed in the scene');
  assert.equal(parent.children.length, 0);
});

test('repeated ghosts plateau rather than accumulate', () => {
  // Resources must plateau across repeated restarts (invariant 10). A ghost is
  // built once per renderer, but a renderer is built once per test run and
  // several times per browser session.
  const scene = new THREE.Scene();
  for (let round = 0; round < 4; round += 1) {
    const ghost = createGhostRider();
    scene.add(ghost.group);
    ghost.apply(sample({ t: round, x: round, speed: 5 }));
    ghost.dispose();
  }
  assert.equal(scene.children.length, 0, 'a disposed ghost stayed in the scene');
});

test('the ghost shares no object name with the rider it is a copy of', () => {
  // **The regression guard for the worst integration bug of M10.**
  //
  // The ghost is built by `createRidingRig()`, the same factory the player's
  // rig comes from, so it originally arrived carrying identical names on every
  // joint. Both live in one scene, and `Object3D.getObjectByName` walks the
  // graph depth-first and returns the first match — so every name-based lookup
  // in the project became a coin toss, and the QA harness silently started
  // measuring the ghost's frozen pose instead of the rider's. Twenty-nine
  // browser scenarios across M2 through M9 failed at once, not one of them in
  // a file this milestone had touched, every one of them reporting a rider
  // that would not move.
  //
  // Nothing about the picture would have shown it. This test is the only thing
  // standing between a future edit and that afternoon.
  const player = createRidingRig();
  const ghost = createGhostRider();

  const namesOf = (root: THREE.Object3D): Set<string> => {
    const names = new Set<string>();
    root.traverse((object) => {
      if (object.name !== '') names.add(object.name);
    });
    return names;
  };

  const playerNames = namesOf(player.group);
  const ghostNames = namesOf(ghost.group);

  assert.ok(playerNames.size > 5, 'the rider rig should name its joints');
  const shared = [...ghostNames].filter((name) => playerNames.has(name));
  assert.deepEqual(shared, [], 'the ghost and the rider answer to the same names');

  // And the prefix is the mechanism, so a future part added to the rig is
  // covered without anybody remembering this test exists.
  for (const name of ghostNames) {
    assert.ok(name.startsWith('ghost-'), `${name} is not namespaced to the ghost`);
  }

  ghost.dispose();
  player.dispose();
});
