/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, CHALLENGE, EUC, SIMULATION, WHEEL } from '../data/tuning.ts';
import {
  GhostPlayer,
  GhostRecorder,
  createGhostSample,
  decodeGhost,
  encodeGhost,
  type GhostSample,
} from '../simulation/ghost.ts';
import { riderRollFor, settleStep } from '../simulation/riderLean.ts';
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
  const lean = ghost.group.getObjectByName('ghost-riding-lean-pivot');
  const pelvis = ghost.group.getObjectByName('ghost-rider-pelvis');
  assert.ok(lean !== undefined && pelvis !== undefined);

  // The rig rolls by -rollAngle, and the pelvis gives back the difference
  // between the rider's roll and the wheel's. Calling `riderRollFor` rather
  // than copying its arithmetic is what stops the ghost and the player
  // drifting apart on a tuning change — and from M30 Phase 3 the share is a
  // *schedule* over speed, so a ghost checked at one speed is a ghost checked
  // in one of three bands.
  for (const speed of [0, 3, EUC.carveLeanSpeed, 14, EUC.carveLeanFullSpeed, 26]) {
    ghost.apply(sample({ rollAngle: roll, speed }));
    assert.ok(Math.abs(lean.rotation.z + roll) < 1e-9, `the wheel banks the same at ${speed} m/s`);
    // The ghost has the wheel's roll and not the cornering force, so it hands
    // `riderRollFor` its `rollAngle` for both — exact under today's grip
    // ceiling, and honestly a little short of the player past Phase 2's
    // saturation (q116). `technicalTurn` stays neutral: the recording never
    // carried it, and it is faded out above `carveLeanSpeed` anyway.
    const expected = -(riderRollFor(roll, roll, 0, speed, EUC) - roll);
    assert.ok(
      Math.abs(pelvis.rotation.z - expected) < 1e-9,
      `at ${speed} m/s the pelvis rolled ${pelvis.rotation.z} rather than ${expected}`,
    );
  }

  // The two ends, spelled out: below the low anchor it is M16's counter-roll,
  // and at the top of the schedule rider and wheel are one line and the pelvis
  // hinge is zero.
  ghost.apply(sample({ rollAngle: roll, speed: 3 }));
  assert.ok(Math.abs(pelvis.rotation.z + (roll * EUC.riderUpperBodyRollFactor - roll)) < 1e-9);
  ghost.apply(sample({ rollAngle: roll, speed: 26 }));
  assert.ok(Math.abs(pelvis.rotation.z) < 1e-9, 'a committed ghost carves on one line');

  ghost.dispose();
});

test('a ghost transitions like the player, on the recording\'s own clock', () => {
  // **M30 Phase 3b.** The settle is the same `settleStep` the controller runs,
  // integrated over the sample's own clock rather than the simulation's,
  // exactly as `wheelSpin` and `airBlend` already are. Without it a ghost
  // would ride the plank the owner rejected while the player beside it
  // transitions, which is the one comparison a ghost exists to make.
  //
  // This case steps the ghost knot by knot, at the recording's own rate. The
  // *shipped* caller does not — see the 60 Hz case below, which drives
  // `GhostPlayer.sample` at a display clock and measures what that costs.
  const ghost = createGhostRider();
  const pelvis = ghost.group.getObjectByName('ghost-rider-pelvis');
  assert.ok(pelvis !== undefined);
  const dt = 1 / CHALLENGE.ghostSampleHz;
  const speed = 26;
  const roll = 0.6;

  // A held bank, sampled at the recording's rate: the settle stays at one and
  // the pose is the schedule's, hinge zero at share 1.0.
  let t = 0;
  for (let i = 0; i < 20; i += 1) {
    t += dt;
    ghost.apply(sample({ t, rollAngle: roll, speed }));
  }
  assert.ok(Math.abs(pelvis.rotation.z) < 1e-9, 'a held ghost carves on one line');

  // Then a flick: the recorded bank crosses to the other side inside two
  // samples, which is 24 rad/s of recorded roll rate — far past
  // `carveLeanSwingRate`, so the body is back at the old pose and the pelvis
  // carries the hinge again.
  t += dt;
  ghost.apply(sample({ t, rollAngle: -roll, speed }));
  let settle = settleStep(1, (-roll - roll) / dt, dt, EUC);
  // A 0.05 s sample against a 0.06 s settle-out is five sixths of the ramp, so
  // one recorded sample of a flick puts the ghost most of the way back at the
  // old pose and the next one lands on it exactly.
  assert.ok(settle < 0.2 && settle > 0, `one sample of a flick left settle at ${settle}`);
  assert.ok(
    Math.abs(pelvis.rotation.z - -(riderRollFor(-roll, -roll, 0, speed, EUC, settle) - -roll)) < 1e-9,
    `the flicked ghost posed at a pelvis of ${pelvis.rotation.z}`,
  );
  assert.ok(
    Math.abs(pelvis.rotation.z) > 0.3,
    'and the hinge the plank had lost is back: ' + pelvis.rotation.z,
  );

  // And it climbs back once the recording holds the new bank, at the ramp's
  // own rate against the recording's clock.
  for (let i = 0; i < 8; i += 1) {
    t += dt;
    ghost.apply(sample({ t, rollAngle: -roll, speed }));
    settle = settleStep(settle, 0, dt, EUC);
    assert.ok(
      Math.abs(pelvis.rotation.z - -(riderRollFor(-roll, -roll, 0, speed, EUC, settle) - -roll)) < 1e-9,
      `sample ${i} of the settle-in`,
    );
  }
  assert.equal(settle, 1, 'and it arrives back on the line');

  // A restart rewinds it with `wheelSpin` and `airBlend`: a ghost placed again
  // is on a held bank, not mid-flick.
  ghost.apply(sample({ t: 0, rollAngle: roll, speed }));
  assert.ok(Math.abs(pelvis.rotation.z) < 1e-9, 'a restarted ghost is settled again');

  ghost.dispose();
});

test('the ghost\'s settle is close across frame rates, not identical, and is bounded', () => {
  // **M30 Phase 3b QA.** The case above steps knot by knot; the shipped caller
  // does not. `Game.updateGhost` calls `GhostPlayer.sample(elapsed)` once per
  // *rendered* frame, and `sample` writes `out.t = runSeconds` — so the `dt`
  // this file integrates is the **display** clock and `sample.rollAngle` is a
  // lerp between two recorded knots. A frame that straddles a knot reads the
  // average slope across it rather than either side's, and the settle's target
  // is clamped at both ends, so two frame rates enter the ramp from different
  // heights and a linear ramp cannot close the gap again.
  //
  // This drives the real path — `GhostPlayer.sample` at a 1/60 s frame clock
  // through a recorded flick — and pins what the difference actually is rather
  // than claiming it away. Measured on this track: worst settle gap **0.109**
  // and worst torso gap **2.14°** against the same recording replayed at its
  // own 20 Hz knot rate. The floor and ceiling never break, and a held bank is
  // exactly settled at every rate, which is what the capture baselines and the
  // held-carve specs depend on. Fixing it would mean a second clock stepping
  // knot by knot beside the controller's; a couple of degrees behind a 42%
  // alpha does not buy that.
  const stepSeconds = 1 / SIMULATION.hz;
  const speed = 26;
  const hold = 0.6;
  const crossSeconds = 0.4;
  const flickAt = 1.5;
  const totalSeconds = 4;

  // A hold, a flick across, a hold. Recorded through `GhostRecorder` at the
  // simulation's own rate off an **accumulated** clock, because that is what
  // decides where the knots land: a run clock that is a sum of 1/120 steps
  // falls a hair either side of each 0.05 boundary, so the knots sit at 0.008,
  // 0.058, 0.108 … and a 60 Hz frame straddles them. A clock built as `k / 120`
  // would land them on exact multiples of 0.05, where 60 Hz divides 20 Hz and
  // the whole effect disappears — a track that would prove nothing.
  const rollAt = (t: number): number => {
    if (t < flickAt) return hold;
    if (t < flickAt + crossSeconds) {
      return hold * Math.cos((Math.PI * (t - flickAt)) / crossSeconds);
    }
    return -hold;
  };
  const recorder = new GhostRecorder();
  let clock = 0;
  while (clock <= totalSeconds) {
    clock += stepSeconds;
    recorder.record(clock, {
      x: 0,
      y: 0.3,
      z: clock * speed,
      groundY: 0,
      headingY: 0,
      rollAngle: rollAt(clock),
      speed,
      crouch: 0,
    });
  }
  const track = recorder.finish('ghost-settle-rate', clock);
  assert.ok(track !== null);
  // Through the store's own round trip, so the replay reads the quantised
  // angles a real record carries rather than the doubles that were recorded.
  const decoded = decodeGhost(encodeGhost(track));
  assert.ok(decoded !== null);
  assert.ok(decoded.samples[1].t !== 0.05, 'the knots landed on the frame grid; the track proves nothing');

  /** The settle, read back out of the posed rig rather than mirrored. */
  const settleFromPose = (roll: number, riderRoll: number): number => {
    const low = roll * EUC.riderUpperBodyRollFactor;
    const top = roll * EUC.carveLeanShareTop;
    return Math.abs(top - low) > 1e-12 ? (riderRoll - low) / (top - low) : 1;
  };

  interface Frame {
    readonly t: number;
    readonly riderRoll: number;
    readonly settle: number;
  }

  const replay = (hz: number): Frame[] => {
    const ghost = createGhostRider();
    const pelvis = ghost.group.getObjectByName('ghost-rider-pelvis');
    assert.ok(pelvis !== undefined);
    const player = new GhostPlayer(decoded);
    const out = createGhostSample();
    const frames: Frame[] = [];
    for (let frame = 0; frame / hz <= player.totalSeconds + 1e-9; frame += 1) {
      const t = frame / hz;
      if (!player.sample(t, out)) continue;
      ghost.apply(out);
      // The Cool Rider look has no over-lean and no sway, so the pelvis hinge
      // is exactly `rollAngle - riderRoll` and the pose can be read back.
      const riderRoll = out.rollAngle - pelvis.rotation.z;
      frames.push({ t, riderRoll, settle: settleFromPose(out.rollAngle, riderRoll) });
    }
    ghost.dispose();
    return frames;
  };

  const at60 = replay(60);
  const at20 = replay(CHALLENGE.ghostSampleHz);
  assert.ok(at60.length > 200, `only ${at60.length} frames at 60 Hz`);

  // The floor and the ceiling hold at the display rate. The tolerance is the
  // rig's, not the settle's: the value is divided back out of a hinge angle,
  // so it carries that subtraction's rounding.
  for (const frame of at60) {
    assert.ok(
      frame.settle >= -1e-9 && frame.settle <= 1 + 1e-9,
      `settle left [0, 1] at t=${frame.t}: ${frame.settle}`,
    );
  }

  // The flick reaches the old pose at 60 Hz too — the point of the whole phase.
  const lowest = Math.min(...at60.map((frame) => frame.settle));
  assert.ok(lowest < 1e-9, `the flick only pulled the settle to ${lowest}`);

  // And the held tail is **exactly** one: at share 1.0 `riderRollFor` returns
  // the top end without a lerp, so the hinge is a hard zero and the settle
  // divides back out as 1 with no tolerance at all.
  const settledFrom = flickAt + crossSeconds + EUC.carveLeanSettleIn + 0.15;
  const tail = at60.filter((frame) => frame.t > settledFrom);
  assert.ok(tail.length > 50, `only ${tail.length} held frames to check`);
  for (const frame of tail) {
    assert.equal(frame.settle, 1, `a held bank read settle ${frame.settle} at t=${frame.t}`);
  }

  // Against the same recording replayed at its own knot rate, compared at the
  // frame times the two clocks share (60 Hz lands on every third 20 Hz frame,
  // where both read the same interpolated roll — so the difference is the
  // settle's and nothing else's).
  let worstRadians = 0;
  let worstAt = 0;
  let worstSettle = 0;
  let shared = 0;
  for (const frame of at60) {
    const knot = at20.find((other) => Math.abs(other.t - frame.t) < 1e-9);
    if (knot === undefined) continue;
    shared += 1;
    const gap = Math.abs(frame.riderRoll - knot.riderRoll);
    if (gap > worstRadians) {
      worstRadians = gap;
      worstAt = frame.t;
      worstSettle = Math.abs(frame.settle - knot.settle);
    }
  }
  assert.ok(shared > 60, `only ${shared} shared frame times`);
  const worstDegrees = (worstRadians * 180) / Math.PI;
  assert.ok(
    worstDegrees < 5,
    `the display rate moved the ghost's torso ${worstDegrees.toFixed(2)}° at t=${worstAt} `
      + `(settle gap ${worstSettle.toFixed(4)})`,
  );
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
