/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { CHARACTER_IDS, type CharacterId } from '../data/riders.ts';
import { machineForCharacter } from '../data/machines.ts';
import { createPose } from '../simulation/EucController.ts';
import { createCopRidingRig } from './copRider.ts';
import { machineLook } from './machineLook.ts';
import { riderLook } from './riderLook.ts';
import { createRidingRig, type RidingRig } from './ridingRig.ts';
import { createPaneShadowTrim, limbShadowCasters } from './paneShadowTrim.ts';
import { GameRenderer } from './Renderer.ts';

/**
 * The owner's OD-3 (2026-10-17, perf item "riders"): in pane i, every other
 * seat rider's limbs, boots and hands stop casting; their machine, torso and
 * head still cast; the pane's own rider casts in full; and every flag is put
 * back after the pane. `render/paneShadowTrim.ts` is the mechanism and
 * `Renderer.renderView` the one caller.
 */

const seatRig = (id: CharacterId): RidingRig => (
  id === 'cop' ? createCopRidingRig() : createRidingRig(riderLook(id), machineLook(machineForCharacter(id)))
);

const LIMB_JOINT = /^rider-(hip|knee|ankle|shoulder|elbow)-(left|right)$/;

/** Shadow submissions of one rig as three's shadow pass would make them: visible chain, casting. */
function shadowCalls(rig: RidingRig): number {
  let calls = 0;
  const walk = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    if ((object as THREE.Mesh).isMesh === true && (object as THREE.Mesh).castShadow) calls += 1;
    for (const child of object.children) walk(child);
  };
  walk(rig.group);
  return calls;
}

function castFlags(rigs: readonly RidingRig[]): boolean[] {
  const out: boolean[] = [];
  for (const rig of rigs) rig.group.traverse((object) => { if ((object as THREE.Mesh).isMesh === true) out.push((object as THREE.Mesh).castShadow); });
  return out;
}

test('a pane trims exactly the limbs, boots and hands of a rider it is not about', () => {
  for (const id of [...CHARACTER_IDS, 'cop'] as CharacterId[]) {
    const rig = seatRig(id);
    try {
      const limbs = limbShadowCasters(rig);
      // Four leg lofts, two boots, four arm lofts, two hands — every look.
      assert.equal(limbs.length, 12, `${id}: ${limbs.length} limb casters`);
      for (const mesh of limbs) {
        assert.ok(mesh.castShadow, `${id}: a non-caster was listed`);
        assert.ok(LIMB_JOINT.test(mesh.parent?.name ?? ''), `${id}: ${mesh.name || '(unnamed)'} is not on a limb joint`);
      }
      for (const name of ['rider-boot-left', 'rider-boot-right', 'rider-hand-left', 'rider-hand-right']) {
        assert.ok(limbs.includes(rig.group.getObjectByName(name) as THREE.Mesh), `${id}: ${name} keeps its shadow in other panes`);
      }
      // What other panes still see: the machine, the torso, the head — and the
      // carried paddle, which is two groups below the hand and not a limb.
      const kept = [
        rig.group.getObjectByName('euc-shell') as THREE.Mesh,
        rig.euc.tyre,
        rig.group.getObjectByName('rider-paddle-mesh') as THREE.Mesh,
        ...rig.rider.pelvis.children.filter((child) => (child as THREE.Mesh).isMesh === true) as THREE.Mesh[],
        ...rig.rider.neck.children.filter((child) => (child as THREE.Mesh).isMesh === true) as THREE.Mesh[],
      ];
      for (const mesh of kept) assert.ok(!limbs.includes(mesh), `${id}: ${mesh.name || mesh.parent?.name} would be trimmed`);
      assert.ok(kept.slice(0, 2).every((mesh) => mesh.castShadow), `${id}: the shell or tyre does not cast`);
      assert.ok(rig.rider.pelvis.children.some((child) => (child as THREE.Mesh).castShadow), `${id}: no torso caster`);
      assert.ok(rig.rider.neck.children.some((child) => (child as THREE.Mesh).castShadow), `${id}: no head caster`);
    } finally {
      rig.dispose();
    }
  }
});

test('four panes at the matched spawn: the own rider whole, the others trimmed, every flag restored', () => {
  const ids: CharacterId[] = ['cool-rider', 'trollina', 'red-rider', 'adonisb2'];
  const rigs = ids.map(seatRig);
  try {
    for (const rig of rigs) rig.apply(createPose());
    const trim = createPaneShadowTrim();
    trim.sync(rigs.map((rig) => ({ rig })));
    const before = castFlags(rigs);
    const whole = rigs.map(shadowCalls);
    let untrimmed = 0;
    let trimmed = 0;
    for (let pane = 0; pane < rigs.length; pane += 1) {
      untrimmed += whole.reduce((sum, calls) => sum + calls, 0);
      for (const rig of trim.rigs) if (rig !== rigs[pane]) trim.trim(rig);
      assert.equal(trim.trimmed, 3 * 12, `pane ${pane}: not three riders' limbs`);
      for (let other = 0; other < rigs.length; other += 1) {
        const calls = shadowCalls(rigs[other]);
        if (other === pane) assert.equal(calls, whole[other], `pane ${pane}: its own rider lost a shadow`);
        else assert.equal(calls, whole[other] - 12, `pane ${pane}: rider ${other} was not trimmed to its body`);
        trimmed += calls;
      }
      trim.restore();
      assert.equal(trim.trimmed, 0);
      assert.deepEqual(castFlags(rigs), before, `pane ${pane}: a flag outlived its pane`);
    }
    // Rider shadow submissions over the four panes, before frustum culling:
    // 332 with the consolidated rigs (the audit census measured 368 before
    // consolidation), 188 with OD-3.
    assert.equal(untrimmed, 332);
    assert.equal(trimmed, 188);
  } finally {
    for (const rig of rigs) rig.dispose();
  }
});

test('one seat trims nothing, a flag something else owns is never written, and a re-sync is free', () => {
  const solo = seatRig('cool-rider');
  const other = seatRig('trollina');
  try {
    const trim = createPaneShadowTrim();
    const seats = [{ rig: solo }];
    trim.sync(seats);
    const rigs = trim.rigs;
    for (const rig of trim.rigs) if (rig !== solo) trim.trim(rig);
    assert.equal(trim.trimmed, 0, 'a solo pane trimmed something');

    // Same seating: nothing rebuilt. A swapped rig: the list follows.
    trim.sync([{ rig: solo }]);
    assert.equal(trim.rigs, rigs);
    assert.deepEqual([...trim.rigs], [solo]);
    trim.sync([{ rig: solo }, { rig: other }]);
    assert.deepEqual([...trim.rigs], [solo, other]);

    // A limb whose shadow somebody else switched off stays off after the pane.
    const boot = other.group.getObjectByName('rider-boot-left') as THREE.Mesh;
    boot.castShadow = false;
    trim.trim(other);
    assert.equal(trim.trimmed, 11);
    trim.restore();
    assert.equal(boot.castShadow, false, 'restore switched on a shadow it never switched off');
    // Trimming one rig twice in a pane switches nothing twice.
    trim.trim(other);
    trim.trim(other);
    assert.equal(trim.trimmed, 11);
    trim.restore();
  } finally {
    solo.dispose();
    other.dispose();
  }
});

/**
 * The real `GameRenderer.renderView` around only the state it reads — no
 * WebGL: the context's three calls are recorded, and `render` hands the pane
 * to `draw`, which looks at every flag while the pass would be drawing.
 */
function paneRenderer(views: number, rigs: readonly RidingRig[], draw: (view: number) => void): GameRenderer {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const viewCameras = Array.from({ length: views }, () => new THREE.PerspectiveCamera());
  const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
  Object.assign(renderer, {
    supplements: { sync(): void {} },
    ultra: { active: false, supplementContext: (): null => null },
    perfProbe: null,
    viewCameras,
    lastWidth: 1280,
    lastHeight: 720,
    sun,
    squirrels: null,
    population: null,
    paneShadowTrim: createPaneShadowTrim(),
    paneSubjects: [],
    paneEyeRigs: [],
    scene: new THREE.Scene(),
    renderer: {
      setScissorTest(): void {},
      setViewport(): void {},
      setScissor(): void {},
      render: (_scene: THREE.Scene, camera: THREE.Camera): void => draw(viewCameras.indexOf(camera as THREE.PerspectiveCamera)),
    },
  });
  renderer.syncSeatRigs(rigs.map((rig) => ({ rig })));
  return renderer;
}

/** Count every write to any mesh's `castShadow` (a no-op write included) until `release`. */
function watchCastShadow(rigs: readonly RidingRig[]): { readonly writes: () => number; release(): void } {
  let writes = 0;
  const undo: (() => void)[] = [];
  for (const rig of rigs) {
    rig.group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh !== true) return;
      let value = (object as THREE.Mesh).castShadow;
      Object.defineProperty(object, 'castShadow', {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: (next: boolean) => { writes += 1; value = next; },
      });
      undo.push(() => {
        delete (object as { castShadow?: boolean }).castShadow;
        (object as THREE.Mesh).castShadow = value;
      });
    });
  }
  return { writes: () => writes, release: () => { for (const step of undo) step(); } };
}

/** The meshes of `rig` that are not casting now but were in `before` (same traversal order). */
function switchedOff(rig: RidingRig, before: readonly boolean[]): THREE.Mesh[] {
  const off: THREE.Mesh[] = [];
  let index = 0;
  rig.group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh !== true) return;
    if (before[index] && !(object as THREE.Mesh).castShadow) off.push(object as THREE.Mesh);
    index += 1;
  });
  return off;
}

test('one full-canvas view never trims, however many chairs are posed (the join panel); a split trims per pane', () => {
  const ids: CharacterId[] = ['cool-rider', 'trollina', 'red-rider', 'cop'];
  const rigs = ids.map(seatRig);
  try {
    for (const rig of rigs) rig.apply(createPose());
    const before = rigs.map((rig) => castFlags([rig]));
    // Read while every rider casts in full: the list is of casting meshes.
    const limbsOf = rigs.map(limbShadowCasters);
    const sameAsBefore = (label: string): void => {
      rigs.forEach((rig, index) => assert.deepEqual(castFlags([rig]), before[index], `${label}: rider ${index}'s flags`));
    };

    // One view, two to four seated rigs — solo with company, or the join
    // panel before a second claim: not one castShadow write, in any pane
    // subject the game can name (its own seat, a followed seat, a CPU cop).
    for (let seated = 1; seated <= 4; seated += 1) {
      const seats = rigs.slice(0, seated);
      for (const subject of [seats[0], seats[seated - 1], null]) {
        const watch = watchCastShadow(rigs);
        try {
          let drawn = 0;
          const renderer = paneRenderer(1, seats, (view) => {
            assert.equal(view, 0);
            drawn += 1;
            sameAsBefore(`one view, ${seated} seated: during the pass`);
          });
          renderer.setPaneSubject(0, subject);
          renderer.renderView(0);
          assert.equal(drawn, 1);
          assert.equal(watch.writes(), 0, `one view, ${seated} seated: castShadow was written`);
        } finally {
          watch.release();
        }
        sameAsBefore(`one view, ${seated} seated`);
      }
    }

    // Two, three and four panes: in each pane exactly the other riders' twelve
    // limb, boot and hand meshes are off, the pane's own rider is whole, and
    // every flag is back after the pane — also when the pass throws.
    for (let views = 2; views <= 4; views += 1) {
      const seats = rigs.slice(0, views);
      for (const failing of [false, true]) {
        let current = -1;
        const renderer = paneRenderer(views, seats, (view) => {
          assert.equal(view, current, 'the pass drew another pane\'s camera');
          for (let other = 0; other < seats.length; other += 1) {
            const off = switchedOff(seats[other], before[other]);
            if (other === view) {
              assert.equal(off.length, 0, `${views} views, pane ${view}: its own rider lost a shadow`);
            } else {
              // By identity: never deep-compare (or print) scene-graph meshes.
              const limbs = limbsOf[other];
              assert.equal(off.length, 12, `${views} views, pane ${view}: rider ${other} lost ${off.length} shadows, not 12`);
              assert.ok(off.every((mesh, index) => mesh === limbs[index]), `${views} views, pane ${view}: rider ${other} is not trimmed to its body`);
            }
          }
          if (failing) throw new Error(`lost pane ${view}`);
        });
        for (let view = 0; view < views; view += 1) {
          current = view;
          renderer.setPaneSubject(view, seats[view]);
          const watch = watchCastShadow(rigs);
          try {
            if (failing) assert.throws(() => renderer.renderView(view), new RegExp(`lost pane ${view}`));
            else renderer.renderView(view);
            // Off and back on, nothing else: two writes per trimmed mesh.
            assert.equal(watch.writes(), 2 * 12 * (views - 1), `${views} views, pane ${view}: castShadow writes`);
          } finally {
            watch.release();
          }
          sameAsBefore(`${views} views, pane ${view}${failing ? ' (threw)' : ''}`);
        }
      }
    }

    // A watching outlaw's pane is about the seat he follows: that rider stays
    // whole and his own body is trimmed like any other.
    const followed = paneRenderer(3, rigs.slice(0, 3), () => {
      assert.equal(switchedOff(rigs[2], before[2]).length, 0, 'the followed rider lost a shadow');
      assert.equal(switchedOff(rigs[1], before[1]).length, 12, 'the watcher\'s own body kept its limb shadows');
      assert.equal(switchedOff(rigs[0], before[0]).length, 12);
    });
    followed.setPaneSubject(1, rigs[2]);
    followed.renderView(1);
    sameAsBefore('a followed pane');
  } finally {
    for (const rig of rigs) rig.dispose();
  }
});

test('the renderer trims per pane and restores in a finally; the game hands it the seats and each pane\'s subject', () => {
  // A source census, because the seam needs a WebGL renderer to run: the
  // couch browser census (`test-results/perf-actions-2026-10-17/harness/
  // riders/capture.mjs --census`) is the behavioural proof.
  const renderer = readFileSync(new URL('./Renderer.ts', import.meta.url), 'utf8');
  const viewAt = renderer.indexOf('  renderView(view: number): void {');
  assert.ok(viewAt > 0, 'renderView moved');
  const view = renderer.slice(viewAt, renderer.indexOf('\n  }\n', viewAt));
  assert.match(view, /try \{\s*\/\/[^]*?this\.trimOtherRiders\(this\.viewCameras\.length, this\.paneSubject\(view\)\);\s*this\.renderer\.render\(this\.scene, camera\);\s*\} finally \{\s*this\.paneShadowTrim\.restore\(\);/);
  // First-Person (1.3.0, §50): the pane's own head is hidden for its pass and
  // put back in the same finally.
  assert.match(view, /if \(head !== null\) head\.visible = false;\s*try \{/);
  assert.match(view, /\} finally \{[^}]*if \(head !== null\) head\.visible = true;/);
  const quadAt = renderer.indexOf('  private renderPerfQuadFrame(');
  assert.ok(quadAt > 0, 'the quad probe frame moved');
  const quad = renderer.slice(quadAt, renderer.indexOf('\n  }\n', quadAt));
  assert.match(quad, /try \{\s*this\.trimOtherRiders\(4, [^;]+\);\s*this\.renderer\.render\(this\.scene, camera\);\s*\} finally \{\s*this\.paneShadowTrim\.restore\(\);/);
  // The split gate (OD-3 scope ruling): one pane trims nothing; the quad
  // probe is a four-pane frame by construction.
  const trimAt = renderer.indexOf('  private trimOtherRiders(panes: number, subject: RidingRig | null): void {');
  assert.ok(trimAt > 0, 'trimOtherRiders moved or lost its pane count');
  assert.match(renderer.slice(trimAt, renderer.indexOf('\n  }\n', trimAt)), /^ {2}private trimOtherRiders[^\n]*\n {4}if \(panes <= 1 \|\| !this\.sun\.castShadow\) return;/);
  // One scene pass in each, and it is the trimmed one. (The warm-up draw and
  // Ultra's first frame stay whole on purpose: the warm-up links every depth
  // program the world can need, and Ultra is a one-seat tier.)
  for (const [name, body] of [['renderView', view], ['the quad probe', quad]] as const) {
    assert.equal((body.match(/this\.renderer\.render\(/g) ?? []).length, 1, `${name} draws a pass outside the trim`);
  }

  const game = readFileSync(new URL('../app/Game.ts', import.meta.url), 'utf8');
  const sync = game.indexOf('this.renderer.syncSeatRigs(this.seats);');
  const pass = game.indexOf('this.renderer.renderView(view);');
  assert.ok(sync > 0 && sync < pass && pass - sync < 2000, 'the seats are not synced before the view loop');
  assert.match(game, /this\.renderer\.setPaneSubject\(view, this\.followedRig\(drawn\)\);\s*this\.renderer\.renderView\(view\);/);
});
