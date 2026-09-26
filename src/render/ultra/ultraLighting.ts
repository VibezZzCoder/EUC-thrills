/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra lighting maths — M39 (`docs/M39_ULTRA.md` §3.1–§3.2, §3.6,
 * package W4, the lighting owner).
 *
 * **The no-delta rule (§3.1).** Every value written here is absolute,
 * computed from the resolved look, the tuned F4 set, the live Ultra set and
 * the effective tier. There is no `*=`, no snapshot and no restore: leaving
 * Ultra re-runs the ordinary writers, which is what makes High → Ultra → High
 * land on the exact High frame. `render/Renderer.ts` only *calls* these at the
 * right moments and introduces no lighting constant of its own.
 *
 * **What lives here:**
 *
 * - `shadowRigFor` — the single sun's shadow rig for a tier. The ordinary rig
 *   is today's constructor and `setQuality`, to the value; the Ultra rig is
 *   the near cascade of §3.2 (4096, ±55 m, light 150 m out, near 1 / far
 *   320) with the three live near values, and — final wave, A22 / Fable F5 —
 *   the map edge the runtime sized from the drawing buffer (2048 on a phone).
 * - `writeShadowRig` — writes a rig onto the sun, absolutely.
 * - `finaliseShadowFocus` — places the Ultra cascade each solo frame: pushed
 *   ahead of the rider along the camera's horizontal forward, clamped so the
 *   rider stays ≥ 35 m inside every edge, and snapped to whole texels in
 *   light space so the map is world-locked and cannot crawl as the rider
 *   moves (the `CSM.js:386-396` formula).
 * - `ultraFill` — hemisphere 0 (the light is kept, so `lights === 2`) and
 *   `environmentIntensity = κ·fill/π`.
 * - `ultraSkyOptions` — the 2048 sky with the fine octave, anisotropy 4 and
 *   the daylight cumulus (A2).
 * - `readUltraLive` — the fifteen F4 values (the thirteen W4 response values
 *   and, from the final touch, the static-shade lift's two).
 */
import * as THREE from 'three';
import { LIGHTING, ULTRA } from '../../data/tuning.ts';
import type { ResolvedVenueLook } from '../../data/venueLook.ts';
import type { SkyOptions } from '../sky.ts';
import type { ShadowRig, UltraLiveTuning } from './ultraTypes.ts';

/**
 * How the sky is painted beyond the look. Declared by W0 here and moved into
 * `render/sky.ts` by W4 (beside the painter it configures); re-exported so
 * this import path keeps working.
 */
export type { SkyOptions };

/**
 * Today's rig, restated field by field from the two places that write it:
 * the `GameRenderer` constructor (map size, bias, normal bias, the ±30 m box,
 * near 1, far `2 × sunDistance`) and `setQuality` (2048 on High, 1024 below).
 * Radius and intensity are three's own defaults, which the renderer never
 * writes. Low does not cast at all (`setQuality` turns `castShadow` off), so
 * its map size is an idle value; it is stated as Medium's so an ordinary rig
 * never *grows* a map.
 */
function ordinaryRig(quality: 'low' | 'medium' | 'high'): ShadowRig {
  return Object.freeze({
    mapSize: quality === 'high' ? LIGHTING.shadowMapSize : LIGHTING.shadowMapSize / 2,
    extent: LIGHTING.shadowRadius,
    near: 1,
    far: LIGHTING.sunDistance * 2,
    bias: LIGHTING.shadowBias,
    normalBias: LIGHTING.shadowNormalBias,
    radius: 1,
    intensity: 1,
    lightDistance: LIGHTING.sunDistance,
    forwardShare: 0,
    snap: false,
    fadeShare: 0,
  });
}

/**
 * The smallest near map edge `shadowRigFor` accepts from a caller (final
 * wave, A22): a quarter of the table's 4096 — ±55 m over 1024 texels is a
 * 10.7 cm texel, as coarse as the near cascade may get — so a bad size can
 * shrink the map, never ruin it.
 */
export const ULTRA_NEAR_MIN_MAP_SIZE = 1024;

/** The near map edge for a requested size: rounded, clamped to `[ULTRA_NEAR_MIN_MAP_SIZE, ULTRA.near.mapSize]`; the table's when none is given. */
export function ultraNearMapSize(requested?: number): number {
  const ceiling = ULTRA.near.mapSize;
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return ceiling;
  return Math.min(ceiling, Math.max(Math.min(ULTRA_NEAR_MIN_MAP_SIZE, ceiling), Math.round(requested)));
}

/**
 * The single sun's shadow rig for a tier.
 *
 * `'ordinary'` is today's constructor and `setQuality` exactly — 2048 on High
 * and 1024 below it, ±30 m, near 1, far 120, bias −0.0005, normal bias 0.02,
 * three's default radius and intensity, the light 60 m out — and must stay so
 * (`ultraLighting.test.ts`, `levelLifecycle.test.ts`).
 *
 * `'ultra'` is the §3.2 near cascade from `ULTRA.near`, with the bias, normal
 * bias and PCF radius from the live set when one is given (the three F4
 * `ULTRA.near*` sliders) and the table's start values otherwise. Quality does
 * not shape the Ultra rig: Ultra's ordinary tier is always High.
 *
 * **Compatible addition (W4):** the optional `live` argument. The §6.2
 * signature is the first two parameters; a two-argument call is unchanged.
 *
 * **Compatible addition (final wave, P-LT; A22, Fable F5):** the optional
 * `nearMapSize`, the near map edge the runtime chose for this activation from
 * the drawing buffer (`ultraShadowSizes.ts`: 4096 on the Air and at the GU
 * captures' 1920×1080, 2048 on a phone). It is clamped to
 * `[ULTRA_NEAR_MIN_MAP_SIZE, ULTRA.near.mapSize]` and rounded, so a caller can
 * shrink the map but never grow it past the envelope's `shadowMap` ceiling;
 * omitted or not a finite number, the rig is the table's 4096 exactly as
 * before. The ordinary rig ignores it: an ordinary rig is today's, whatever
 * the buffer. The snap reads the size three actually allocated
 * (`nearTexelMetres`), and the edge fade is a share of the box, not of the
 * map, so both follow a smaller map with no other change; the patches'
 * filter radii are in texels, so on a 2048 map a penumbra is twice as wide
 * in metres and about as wide in the phone's pixels.
 */
export function shadowRigFor(
  tier: 'ordinary' | 'ultra',
  quality: 'low' | 'medium' | 'high',
  live?: UltraLiveTuning,
  nearMapSize?: number,
): ShadowRig {
  if (tier === 'ordinary') return ordinaryRig(quality);
  const near = ULTRA.near;
  return Object.freeze({
    mapSize: ultraNearMapSize(nearMapSize),
    extent: near.extent,
    near: near.near,
    far: near.far,
    bias: live?.nearBias ?? ULTRA.nearBias,
    normalBias: live?.nearNormalBias ?? ULTRA.nearNormalBias,
    radius: live?.nearRadius ?? ULTRA.nearRadius,
    intensity: near.intensity,
    lightDistance: near.lightDistance,
    forwardShare: near.forwardShare,
    snap: near.snap,
    fadeShare: near.fadeShare,
  });
}

/**
 * Write a rig onto the sun, absolutely (§3.6 step 2): the orthographic box,
 * then the map size — disposing the old map so three reallocates it — then
 * bias, normal bias, radius and intensity, and the light's distance from its
 * target along the direction it already has.
 */
export function writeShadowRig(sun: THREE.DirectionalLight, rig: ShadowRig): void {
  const camera = sun.shadow.camera;
  camera.left = -rig.extent;
  camera.right = rig.extent;
  camera.top = rig.extent;
  camera.bottom = -rig.extent;
  camera.near = rig.near;
  camera.far = rig.far;
  camera.updateProjectionMatrix();

  if (sun.shadow.mapSize.x !== rig.mapSize || sun.shadow.mapSize.y !== rig.mapSize) {
    sun.shadow.mapSize.setScalar(rig.mapSize);
    // three allocates the depth target from `mapSize` once and reuses it.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }

  sun.shadow.bias = rig.bias;
  sun.shadow.normalBias = rig.normalBias;
  sun.shadow.radius = rig.radius;
  sun.shadow.intensity = rig.intensity;

  // Only a real change of distance moves the light: re-normalising an offset
  // that is already `lightDistance` long would perturb its last bits, and the
  // ordinary rig must write back exactly what the venue rig hung.
  const dx = sun.position.x - sun.target.position.x;
  const dy = sun.position.y - sun.target.position.y;
  const dz = sun.position.z - sun.target.position.z;
  const length = Math.hypot(dx, dy, dz);
  if (length > 0 && Math.abs(length - rig.lightDistance) > 1e-6) {
    const scale = rig.lightDistance / length;
    sun.position.set(
      sun.target.position.x + dx * scale,
      sun.target.position.y + dy * scale,
      sun.target.position.z + dz * scale,
    );
  }
}

/**
 * The orthonormal basis three's shadow camera wears for a sun direction:
 * `z` toward the sun, `x = up × z`, `y = z × x` — `Matrix4.lookAt` with the
 * camera's default up, including its nudge when the sun is straight overhead.
 * Snapping in any other basis would snap to a grid the shadow map does not
 * have. Exported for the tests and the far map, which share it.
 */
export function lightBasis(
  sunOffsetUnit: THREE.Vector3,
  x: THREE.Vector3,
  y: THREE.Vector3,
  z: THREE.Vector3,
): void {
  z.copy(sunOffsetUnit).normalize();
  if (z.lengthSq() === 0) z.set(0, 0, 1);
  x.set(z.z, 0, -z.x); // (0, 1, 0) × z
  if (x.lengthSq() === 0) {
    // `Matrix4.lookAt`'s own fallback for a view along the up axis.
    z.z += 0.0001;
    z.normalize();
    x.set(z.z, 0, -z.x);
  }
  x.normalize();
  y.crossVectors(z, x);
}

const basisX = new THREE.Vector3();
const basisY = new THREE.Vector3();
const basisZ = new THREE.Vector3();
const centre = new THREE.Vector3();
const offset = new THREE.Vector3();

/**
 * World metres per near-map texel as the map will actually be drawn: the
 * shadow camera's width over the map's edge. Reads the sun's *current*
 * `mapSize`, which three writes back after the first frame if the device
 * clamped the request (`WebGLShadowMap`, "read back after the first frame",
 * §3.2) — snapping to the requested size on a clamped map would snap to the
 * wrong grid.
 */
export function nearTexelMetres(sun: THREE.DirectionalLight, rig: ShadowRig): number {
  const camera = sun.shadow.camera;
  const width = camera.right - camera.left;
  const mapSize = sun.shadow.mapSize.x > 0 ? sun.shadow.mapSize.x : rig.mapSize;
  return (width > 0 ? width : rig.extent * 2) / mapSize;
}

/**
 * Place the cascade for this frame (Ultra only, from the renderer's solo
 * frame hook), in three steps:
 *
 * 1. **Forward bias.** The box centre is the rider plus `forwardShare ×
 *    extent` (19.25 m) along the camera's *horizontal* forward, so the map
 *    spends its texels where the chase camera looks rather than half of them
 *    behind the rider (U0 defect D5). Horizontal so a camera pitched at the
 *    ground does not sink the box.
 * 2. **Rear-inset clamp.** In light space the rider is kept at least
 *    `ULTRA.near.rearInsetMetres` (35 m) inside every edge of the box — plus
 *    one texel, so the snap below cannot cost the margin. At the shipped
 *    share the clamp is idle (the rider sits ≥ 35.75 m in); it exists so a
 *    tuned share can never walk the rider's own contact shadow off the map.
 * 3. **Texel snap** (`rig.snap`): the centre's light-space x and y are
 *    floored to whole texels, the `CSM.js:386-396` formula, so every world
 *    point keeps the same sub-texel phase frame to frame and edges do not
 *    crawl. Depth along the light is left alone; it does not move the grid.
 *
 * The light hangs `lightDistance` (150 m) toward the sun from the snapped
 * centre. The ordinary tier never calls this: its focus is the unchanged
 * `setShadowFocus` (§3.6).
 *
 * **Allocation-free** (final wave, Fable F7): it runs from the solo frame
 * hook every Ultra frame, so every intermediate is module scratch
 * (`basisX/Y/Z`, `centre`, `offset`) or a local number, and the result is
 * written into the sun's own vectors. (Until the final wave the clamp built
 * two small arrays a frame; `ultraLighting.test.ts` now pins the scalars.)
 */
export function finaliseShadowFocus(
  sun: THREE.DirectionalLight,
  pose: THREE.Vector3,
  cameraForward: THREE.Vector3,
  sunOffsetUnit: THREE.Vector3,
  rig: ShadowRig,
): void {
  lightBasis(sunOffsetUnit, basisX, basisY, basisZ);

  // 1. Forward bias along the camera's horizontal forward.
  centre.copy(pose);
  const forwardLength = Math.hypot(cameraForward.x, cameraForward.z);
  if (forwardLength > 1e-6 && rig.forwardShare !== 0) {
    const reach = (rig.forwardShare * rig.extent) / forwardLength;
    centre.x += cameraForward.x * reach;
    centre.z += cameraForward.z * reach;
  }

  // 2. Rear-inset clamp, in light space. Both reaches are read before the
  // centre moves (the axes are orthogonal, so moving along one leaves the
  // other's reach alone) — two numbers, not arrays: this runs every Ultra
  // solo frame and allocates nothing (Fable F7).
  const texel = nearTexelMetres(sun, rig);
  const limit = Math.max(0, rig.extent - ULTRA.near.rearInsetMetres - (rig.snap ? texel : 0));
  offset.subVectors(pose, centre);
  const reachX = offset.dot(basisX);
  const reachY = offset.dot(basisY);
  // Move the centre toward the rider until they sit `limit` from it.
  if (Math.abs(reachX) > limit) centre.addScaledVector(basisX, reachX - Math.sign(reachX) * limit);
  if (Math.abs(reachY) > limit) centre.addScaledVector(basisY, reachY - Math.sign(reachY) * limit);

  // 3. Light-space texel snap.
  if (rig.snap && texel > 0) {
    const lx = Math.floor(centre.dot(basisX) / texel) * texel;
    const ly = Math.floor(centre.dot(basisY) / texel) * texel;
    const lz = centre.dot(basisZ);
    centre.set(0, 0, 0)
      .addScaledVector(basisX, lx)
      .addScaledVector(basisY, ly)
      .addScaledVector(basisZ, lz);
  }

  sun.target.position.copy(centre);
  sun.position.copy(centre).addScaledVector(basisZ, rig.lightDistance);
}

/**
 * The near map's own edge fade band, in shadow-map UV (§3.2): the outer
 * `fadeShare` of the box's half-extent, so 0.12 of 55 m (6.6 m) is 0.06 of
 * the map's full width. The Ultra patches fade the shadow to 1 across it, and
 * the far term fades in across the same band, so nothing darkens twice.
 */
export function nearFadeBand(rig: ShadowRig): number {
  return rig.fadeShare * 0.5;
}

/**
 * The fill for the Ultra tier (§3.2): the hemisphere light is kept (so the
 * light count, and with it every stock program, is unchanged) and zeroed; the
 * painted-sky environment is the fill, at
 * `environmentIntensity = κ·(tuned ?? look hemisphere)/π` — daylight 0.350κ,
 * Switchback 0.388κ.
 *
 * Why `/π`: three's IBL irradiance is `π × radiance × envMapIntensity`, and
 * the Lambert term divides by π again, so an up-facing surface under an
 * environment whose upper half is about the hemisphere's sky colour receives
 * `κ·fill` times what the hemisphere gave it. κ is then the one calibration
 * left, set in U2 so up-facing shade matches High within ±3 %.
 *
 * A tuned hemisphere (the F4 `LIGHTING.hemisphereIntensity` slider, moved off
 * its default) still wins, as it does on every tier: it scales the Ultra fill
 * instead of the hemisphere light.
 */
export function ultraFill(
  look: ResolvedVenueLook,
  tunedHemisphere: number | undefined,
  live: UltraLiveTuning,
): { hemisphereIntensity: number; environmentIntensity: number } {
  const fill = tunedHemisphere ?? look.hemisphereIntensity;
  return {
    hemisphereIntensity: ULTRA.env.hemisphereIntensity,
    environmentIntensity: (Math.max(0, live.envKappa) * fill) / Math.PI,
  };
}

/**
 * The Ultra sky's options (T8, A2): 2048×1024, one fine octave, anisotropy
 * `min(4, device maximum)`, the daylight cumulus, and crisper wisp edges
 * (`ULTRA.sky.cloudSoftnessScale`, pre-R1 calibration). `createSky`
 * decides per look whether the cumulus applies (daylight skies only), so this
 * needs no venue.
 *
 * **`cloudSeed` (Wave 3, R-L):** the plan's cumulus layout seed,
 * `cumulusSeedFor(plan.id)` from `render/sky.ts`, so two worlds that share a
 * heading do not share a sky (gauntlet round 1: the plaza and BelVar showed
 * the same cloud in the same place). Omitted, the options are exactly the
 * pre-seed ones (seed 0). A seed that is not a finite number (a hook that
 * passes none, or garbage) is seed 0 too (Wave 4, R-L), so a caller can
 * never paint a sky the key cannot name.
 */
export function ultraSkyOptions(maxAnisotropy: number, cloudSeed?: number): SkyOptions {
  const seed = typeof cloudSeed === 'number' && Number.isFinite(cloudSeed) ? cloudSeed | 0 : 0;
  return Object.freeze({
    width: ULTRA.sky.width,
    height: ULTRA.sky.height,
    anisotropy: Math.max(1, Math.min(ULTRA.sky.anisotropy, Math.floor(maxAnisotropy))),
    fineOctaveAmplitude: ULTRA.sky.fineOctaveAmplitude,
    daylightClouds: ULTRA.sky.daylightClouds,
    cloudSoftnessScale: ULTRA.sky.cloudSoftnessScale,
    ...(seed !== 0 ? { cloudSeed: seed } : {}),
  });
}

/**
 * The fifteen live Ultra values, read through whatever the caller reads
 * tuning with (`Game.applyTuning` passes `path => this.tuning.get(path)`).
 * The paths are the `LIVE_TUNABLES` registrations in `data/tuning.ts`; the
 * last two are the static-shade lift's (`ULTRA.shade.lift`, `.liftFar`; final
 * touch, post round 4), which the ground, paint and block patches read as the
 * shared `ultraShadeLift` / `ultraShadeLiftFar` uniforms.
 */
export function readUltraLive(get: (path: string) => number): UltraLiveTuning {
  return {
    nearBias: get('ULTRA.nearBias'),
    nearNormalBias: get('ULTRA.nearNormalBias'),
    nearRadius: get('ULTRA.nearRadius'),
    envKappa: get('ULTRA.envKappa'),
    bounceLift: get('ULTRA.bounceLift'),
    groundSpec: get('ULTRA.groundSpec'),
    glassSpec: get('ULTRA.glassSpec'),
    waterSpec: get('ULTRA.waterSpec'),
    contactStrength: get('ULTRA.contactStrength'),
    contactDirectShare: get('ULTRA.contactDirectShare'),
    foliageWrap: get('ULTRA.foliageWrap'),
    foliageTransmission: get('ULTRA.foliageTransmission'),
    specAA: get('ULTRA.specAA'),
    shadeLift: get('ULTRA.shade.lift'),
    shadeLiftFar: get('ULTRA.shade.liftFar'),
  };
}

/**
 * The live set at the table's start values — what a headless build, or a
 * renderer that has not yet received an F4 push, lights with.
 */
export function defaultUltraLive(): UltraLiveTuning {
  return Object.freeze({
    nearBias: ULTRA.nearBias,
    nearNormalBias: ULTRA.nearNormalBias,
    nearRadius: ULTRA.nearRadius,
    envKappa: ULTRA.envKappa,
    bounceLift: ULTRA.bounceLift,
    groundSpec: ULTRA.groundSpec,
    glassSpec: ULTRA.glassSpec,
    waterSpec: ULTRA.waterSpec,
    contactStrength: ULTRA.contactStrength,
    contactDirectShare: ULTRA.contactDirectShare,
    foliageWrap: ULTRA.foliageWrap,
    foliageTransmission: ULTRA.foliageTransmission,
    specAA: ULTRA.specAA,
    shadeLift: ULTRA.shade.lift,
    shadeLiftFar: ULTRA.shade.liftFar,
  });
}
