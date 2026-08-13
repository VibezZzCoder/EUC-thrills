/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';

/**
 * A small pooled particle field — M5's sparks and surface dust.
 *
 * Two producers, one mechanism: a pedal scraping the ground throws sparks, and
 * a landing throws whatever `data/surfaces.ts` says that surface throws. Both
 * are short-lived, ballistic, and unlit, so both are a `THREE.Points` over a
 * fixed pool with a compaction pass — one draw call each, and none at all when
 * nothing is alive.
 *
 * Four decisions are load-bearing rather than incidental:
 *
 *   1. **Deterministic, never random** (`DESIGN.md` §4, rule 3). Every spread
 *      below comes from an integer hash of a monotonic spawn counter, so
 *      `advance(n)` reaches the same field on every run and a frozen capture
 *      of a landing means something. `Math.random()` here would make every
 *      screenshot disagree with the last one.
 *   2. **Stepped at the fixed rate**, from `app/Game.ts`, exactly as the pose
 *      and the camera are — for the same reason and with the same payoff.
 *   3. **Colour fades toward a target rather than alpha.** `PointsMaterial`
 *      carries one opacity for the whole draw, and per-particle alpha needs a
 *      custom shader, which is a bigger commitment than a blockout effect
 *      earns. Fading each particle's vertex colour toward the horizon works
 *      under ordinary blending, costs nothing, and reads correctly for dust
 *      dissolving into the air. Sparks simply go out, which sparks do.
 *   4. **Dead particles are compacted out, not hidden.** The alternative is a
 *      degenerate vertex somewhere, which either shows as a dot at the origin
 *      or has to be moved to infinity and confuses the bounding sphere.
 *
 * **Particle brightness is part of the coupled visual system** (AGENTS.md
 * invariant 6, `DESIGN.md` §6). The colours live in `FX` in `data/tuning.ts`
 * and the field itself is owned by `render/Renderer.ts`, alongside the
 * lighting and tone mapping it is judged against.
 */

export interface ParticleFieldOptions {
  /** Pool size. The field silently reuses the oldest particle when full. */
  readonly capacity: number;
  /** World-space point size, metres. One value per field; see the note above. */
  readonly size: number;
  /** Downward acceleration, m/s². */
  readonly gravity: number;
  /** What each particle's colour fades toward as it dies. sRGB hex. */
  readonly fadeTo: number;
  readonly name: string;
}

export interface ParticleBurst {
  x: number;
  y: number;
  z: number;
  /** How many to spawn. Clamped to the pool. */
  count: number;
  /** Ejection speed, m/s. */
  speed: number;
  /**
   * Cone half-angle about the ejection axis, radians. A spread of pi/2 or
   * more is a hemisphere, which is what a landing puff wants.
   */
  spread: number;
  /** Ejection axis. Need not be normalised; a zero axis ejects straight up. */
  axisX: number;
  axisY: number;
  axisZ: number;
  lifeSeconds: number;
  /** sRGB hex. */
  colour: number;
  /**
   * Multiplier applied to the colour after it is decoded to linear. Above 1
   * takes the particle over white, which is what an incandescent emitter
   * genuinely is and what ACES needs in order to render one as hot rather than
   * as another mid-grey. Defaults to 1.
   */
  intensity?: number;
  /**
   * What this burst fades to, overriding the field's own target. sRGB hex.
   *
   * The reason it is per burst rather than per field: dust thrown off grass
   * should settle back into grass, and dust thrown off gravel back into
   * gravel. Fading every surface's dust toward the same value makes a puff on
   * dark grass get *brighter* as it dies, which is backwards and reads as a
   * pale disc rather than as clippings.
   */
  fadeTo?: number;
}

export interface ParticleField {
  readonly points: THREE.Points;
  /** How many particles are currently alive. */
  readonly live: number;
  emit(burst: ParticleBurst): void;
  step(dt: number): void;
  /** Kill everything immediately. A reset must not leave sparks in the air. */
  clear(): void;
  dispose(): void;
}

/**
 * A 32-bit integer hash, spent as three uniform values per particle.
 *
 * The same shape `simulation/roughness.ts` uses for the same reason: a
 * reproducible field beats a characterful one whenever a test has to look at
 * it. Constants are the usual xorshift-multiply mix.
 */
function hash01(seed: number, salt: number): number {
  let h = (seed * 374761393 + salt * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function createParticleField(options: ParticleFieldOptions): ParticleField {
  const { capacity } = options;

  const positions = new Float32Array(capacity * 3);
  const colours = new Float32Array(capacity * 3);
  const velocityX = new Float32Array(capacity);
  const velocityY = new Float32Array(capacity);
  const velocityZ = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const totalLife = new Float32Array(capacity);
  const baseColour = new Float32Array(capacity * 3);
  /** Per particle, not per field: see `ParticleBurst.fadeTo`. */
  const fadeColour = new Float32Array(capacity * 3);

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const colourAttribute = new THREE.BufferAttribute(colours, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colourAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colourAttribute);
  geometry.setDrawRange(0, 0);
  // The pool never leaves the neighbourhood of the rider, and the field is
  // drawn every frame something is alive, so frustum culling on a bounding
  // sphere that would have to be recomputed per frame buys nothing.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

  const material = new THREE.PointsMaterial({
    size: options.size,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    // Written into the depth buffer they would occlude each other in draw
    // order rather than in depth order; tested against it they are still
    // correctly hidden behind terrain, which is the part that matters.
    depthWrite: false,
    // No lighting: these are emissive-looking specks, and a lit point sprite
    // under one directional light is a flat grey square.
    fog: true,
  });

  const points = new THREE.Points(geometry, material);
  points.name = options.name;
  points.visible = false;
  points.frustumCulled = false;

  /**
   * Two scratch colours.
   *
   * **`new THREE.Color(hex)` already decodes sRGB to linear** — three.js has
   * colour management on by default, and `set(hex)` runs
   * `toWorkingColorSpace`. An explicit `convertSRGBToLinear()` on top of that
   * is a *second* decode, which took every particle here to about a seventh of
   * its authored reflectance the first time this file was written. The
   * colour-authoring rule in `DESIGN.md` §2 is about picking the value; this is
   * the other half of it, and the symptom was the same both times — an effect
   * that reads as far darker than the number says.
   */
  const spawnColour = new THREE.Color();
  const spawnFade = new THREE.Color();
  let live = 0;
  let spawnCounter = 0;
  /** Where the next particle goes when the pool is full. */
  let oldest = 0;

  const writeColour = (index: number, fraction: number): void => {
    const base = index * 3;
    // `fraction` runs 1 at birth to 0 at death.
    colours[base] = fadeColour[base] + (baseColour[base] - fadeColour[base]) * fraction;
    colours[base + 1] = fadeColour[base + 1]
      + (baseColour[base + 1] - fadeColour[base + 1]) * fraction;
    colours[base + 2] = fadeColour[base + 2]
      + (baseColour[base + 2] - fadeColour[base + 2]) * fraction;
  };

  return {
    points,
    get live(): number {
      return live;
    },

    emit(burst: ParticleBurst): void {
      const count = Math.min(Math.max(0, Math.floor(burst.count)), capacity);
      if (count === 0 || !(burst.lifeSeconds > 0)) return;

      spawnColour.set(burst.colour);
      if (burst.intensity !== undefined && burst.intensity !== 1) {
        spawnColour.multiplyScalar(burst.intensity);
      }
      spawnFade.set(burst.fadeTo ?? options.fadeTo);

      // A zero axis means straight up, which is what a landing puff wants.
      const axisLength = Math.hypot(burst.axisX, burst.axisY, burst.axisZ);
      const ax = axisLength > 1e-9 ? burst.axisX / axisLength : 0;
      const ay = axisLength > 1e-9 ? burst.axisY / axisLength : 1;
      const az = axisLength > 1e-9 ? burst.axisZ / axisLength : 0;

      // Any two vectors perpendicular to the axis. Picking the world axis the
      // ejection is *least* aligned with keeps the cross product well
      // conditioned however the wheel happens to be pointing.
      const helperX = Math.abs(ay) < 0.9 ? 0 : 1;
      const helperY = Math.abs(ay) < 0.9 ? 1 : 0;
      let ux = ay * 0 - az * helperY;
      let uy = az * helperX - ax * 0;
      let uz = ax * helperY - ay * helperX;
      const uLength = Math.hypot(ux, uy, uz) || 1;
      ux /= uLength;
      uy /= uLength;
      uz /= uLength;
      const vx = ay * uz - az * uy;
      const vy = az * ux - ax * uz;
      const vz = ax * uy - ay * ux;

      for (let i = 0; i < count; i += 1) {
        spawnCounter += 1;
        let index: number;
        if (live < capacity) {
          index = live;
          live += 1;
        } else {
          index = oldest;
          oldest = (oldest + 1) % capacity;
        }

        const angle = hash01(spawnCounter, 1) * Math.PI * 2;
        // sqrt keeps the cone's density uniform in solid angle instead of
        // piling every particle onto the axis.
        const tilt = Math.sqrt(hash01(spawnCounter, 2)) * burst.spread;
        const speed = burst.speed * (0.55 + 0.45 * hash01(spawnCounter, 3));

        const sinTilt = Math.sin(tilt);
        const cosTilt = Math.cos(tilt);
        const radialX = ux * Math.cos(angle) + vx * Math.sin(angle);
        const radialY = uy * Math.cos(angle) + vy * Math.sin(angle);
        const radialZ = uz * Math.cos(angle) + vz * Math.sin(angle);

        const base = index * 3;
        positions[base] = burst.x;
        positions[base + 1] = burst.y;
        positions[base + 2] = burst.z;
        velocityX[index] = (ax * cosTilt + radialX * sinTilt) * speed;
        velocityY[index] = (ay * cosTilt + radialY * sinTilt) * speed;
        velocityZ[index] = (az * cosTilt + radialZ * sinTilt) * speed;
        // A little spread in lifetime, or the whole burst blinks out at once.
        totalLife[index] = burst.lifeSeconds * (0.65 + 0.35 * hash01(spawnCounter, 4));
        life[index] = totalLife[index];
        baseColour[base] = spawnColour.r;
        baseColour[base + 1] = spawnColour.g;
        baseColour[base + 2] = spawnColour.b;
        fadeColour[base] = spawnFade.r;
        fadeColour[base + 1] = spawnFade.g;
        fadeColour[base + 2] = spawnFade.b;
        writeColour(index, 1);
      }

      points.visible = true;
      positionAttribute.needsUpdate = true;
      colourAttribute.needsUpdate = true;
      geometry.setDrawRange(0, live);
    },

    step(dt: number): void {
      if (live === 0 || dt <= 0) return;

      let write = 0;
      for (let read = 0; read < live; read += 1) {
        const remaining = life[read] - dt;
        if (remaining <= 0) continue;

        velocityY[read] -= options.gravity * dt;
        const readBase = read * 3;
        const x = positions[readBase] + velocityX[read] * dt;
        const y = positions[readBase + 1] + velocityY[read] * dt;
        const z = positions[readBase + 2] + velocityZ[read] * dt;

        // Compact toward the front of the pool. `write <= read` always, so the
        // copy can never overwrite a slot that has not been read yet.
        const writeBase = write * 3;
        positions[writeBase] = x;
        positions[writeBase + 1] = y;
        positions[writeBase + 2] = z;
        velocityX[write] = velocityX[read];
        velocityY[write] = velocityY[read];
        velocityZ[write] = velocityZ[read];
        life[write] = remaining;
        totalLife[write] = totalLife[read];
        baseColour[writeBase] = baseColour[readBase];
        baseColour[writeBase + 1] = baseColour[readBase + 1];
        baseColour[writeBase + 2] = baseColour[readBase + 2];
        fadeColour[writeBase] = fadeColour[readBase];
        fadeColour[writeBase + 1] = fadeColour[readBase + 1];
        fadeColour[writeBase + 2] = fadeColour[readBase + 2];
        writeColour(write, remaining / totalLife[write]);
        write += 1;
      }

      live = write;
      // Compaction moves particles, so the oldest-slot cursor no longer points
      // at anything meaningful; the pool is no longer full anyway.
      oldest = 0;
      points.visible = live > 0;
      geometry.setDrawRange(0, live);
      positionAttribute.needsUpdate = true;
      colourAttribute.needsUpdate = true;
    },

    clear(): void {
      live = 0;
      oldest = 0;
      // **The spawn counter goes back too, and that is the point of it.** A
      // reset has to restore the effect system to a known state exactly as it
      // restores the rider, or "reset the ride, do this, take a screenshot"
      // gives a different picture the second time it is run in one session —
      // which is the same thing as having no determinism at all.
      spawnCounter = 0;
      points.visible = false;
      geometry.setDrawRange(0, 0);
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
      points.removeFromParent();
    },
  };
}
