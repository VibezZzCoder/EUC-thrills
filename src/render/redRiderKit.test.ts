/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as THREE from 'three';
import { redRiderCamera, redRiderHelmet, redRiderVisor, redRiderArmour, redRiderHarness, redRiderChestPlate, RED_RIDER_HARNESS_ROUTES, RED_RIDER_TORSO } from './redRiderKit.ts';
import { loftPoint, loftNormal, vAtHeight } from './blockoutKit.ts';

function frontHit(g: THREE.BufferGeometry, x: number, y: number): number {
  const material = new THREE.MeshBasicMaterial();
  try {
    const mesh = new THREE.Mesh(g, material);
    return new THREE.Raycaster(new THREE.Vector3(x, y, .5), new THREE.Vector3(0, 0, -1))
      .intersectObject(mesh)[0]?.point.z ?? -Infinity;
  } finally { material.dispose(); }
}

test("Red Rider's camera is on his own left and its lens lies behind a raised rim", () => {
  const g = redRiderCamera();
  try {
    g.computeBoundingBox();
    assert.ok(g.boundingBox!.min.x > .01, 'camera must remain entirely on rider-left (+X)');
    assert.ok(g.boundingBox!.max.x < .08, 'camera stays inside the left harness route');
    const centre = frontHit(g, .048, .297);
    const rim = frontHit(g, .0592, .297);
    const body = frontHit(g, .030, .270);
    assert.ok(centre > body, 'lens is forward of the body');
    assert.ok(rim > centre + .003, 'the well is recessed behind the raised ring');
  } finally { g.dispose(); }
});

test("Red Rider's visor occupies a real opening in the red shell", () => {
  const shell = redRiderHelmet(), visor = redRiderVisor();
  try {
    for (const [x, y] of [[0, .205], [-.065, .205], [.065, .205], [0, .174], [0, .244]]) {
      assert.ok(frontHit(shell, x!, y!) < 0, `shell closes the aperture at ${x}, ${y}`);
      assert.ok(frontHit(visor, x!, y!) > .07, `missing glass at ${x}, ${y}`);
    }
    assert.ok(frontHit(shell, 0, .122) > .15, 'chin bar projects ahead of the glazing');
    assert.ok(frontHit(shell, 0, .28) > .10, 'red brow/crown still closes above the aperture');
  } finally { shell.dispose(); visor.dispose(); }
});

test('Red Rider kit geometry has finite positions, normals and vertex colours', () => {
  for (const build of [redRiderHelmet, redRiderVisor, redRiderCamera, redRiderHarness, redRiderChestPlate,
    () => redRiderArmour('elbow'), () => redRiderArmour('knee')]) {
    const g = build();
    try {
      for (const attribute of ['position', 'normal', 'color', 'uv']) {
        const a = g.getAttribute(attribute);
        assert.ok(a, `${attribute} is needed by the shared merged-geometry path`);
        assert.ok(Array.from(a.array).every(Number.isFinite), `${attribute} contains a non-finite value`);
      }
    } finally { g.dispose(); }
  }
});

// Sample the actual shaped surface along both routes, including the shoulder
// crown. This catches an inverted, missing or buried strip between the anchors.
test('Red Rider harness remains above the garment over both complete shoulder routes', () => {
  const g = redRiderHarness(), material = new THREE.MeshBasicMaterial();
  try {
    const mesh = new THREE.Mesh(g, material);
    for (const [index, knots] of RED_RIDER_HARNESS_ROUTES.entries()) {
      const route = new THREE.CatmullRomCurve3(knots.map(([u, y, w]) => new THREE.Vector3(u, y, w)));
      for (let i = 0; i <= 128; i++) {
        // The exact end edge can miss after float32 rounding. Probe the face
        // inside each cap by a few micrometres.
        const k = route.getPoint(THREE.MathUtils.clamp(i / 128, .00001, .99999)), u = k.x;
        const v = vAtHeight(RED_RIDER_TORSO, k.y);
        const n = loftNormal(RED_RIDER_TORSO, u, v, new THREE.Vector3());
        const p = loftPoint(RED_RIDER_TORSO, u, v, new THREE.Vector3());
        const ray = new THREE.Raycaster(p.clone().addScaledVector(n, .05), n.clone().negate());
        const hit = ray.intersectObject(mesh)[0];
        assert.ok(hit, `missing or inward-facing route at route ${index}, step ${i}`);
        assert.ok(hit.distance < .047 && hit.distance > .030, `buried or floating route at route ${index}, step ${i}`);
      }
    }
  } finally { g.dispose(); material.dispose(); }
});

test('Red Rider chest vents are recessed below the red field and reach toward the collar', () => {
  const g = redRiderChestPlate();
  try {
    const y = .235 + .292 * 7.5 / 14;
    const well = frontHit(g, 0, y), rim = frontHit(g, .004, y);
    assert.ok(rim > well + .0015, 'wide dark vent needs real relief below the red rim');
    g.computeBoundingBox();
    assert.ok(g.boundingBox!.max.y > .52, 'the red field must reach the collar, not stop at a blank shoulder shelf');
  } finally { g.dispose(); }
});

test('broad web is visible between the camera and its waist anchor', () => {
  const web = redRiderHarness(), armour = redRiderChestPlate();
  try {
    // Follow the visible diagonal under the device, then into the top of the belt.
    for (let step = 0; step <= 18; step++) {
      const t = step / 18, y = .204 + .077 * t, x = .096 - .039 * t;
      for (const edge of [-.013, .013]) {
        const front = frontHit(web, x + edge, y);
        assert.ok(Number.isFinite(front), `gap below the camera at ${x + edge}, ${y}`);
        assert.ok(front > frontHit(armour, x + edge, y), 'the protector hides the web');
      }
    }
  } finally { web.dispose(); armour.dispose(); }
});
