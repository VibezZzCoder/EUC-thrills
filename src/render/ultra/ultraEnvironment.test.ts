/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import { DAYLIGHT_LOOK, resolveVenueLook } from '../../data/venueLook.ts';
import { SWITCHBACK_LOOK } from '../../level/switchbackLevel.ts';
import { skyConstruction } from '../sky.ts';
import { hexToLinear, paintEnvironment } from '../skyImage.ts';
import {
  buildUltraEnvironment,
  environmentBytes,
  environmentCubeSize,
  ultraEnvironmentSource,
  type EnvironmentGenerator,
} from './ultraEnvironment.ts';
import { defaultUltraLive } from './ultraLighting.ts';

/**
 * The painted-sky environment (T1) — M39 W4 (`docs/M39_ULTRA.md` §3.2).
 *
 * The painter's own properties (bounce × β below, no sun core, the horizon,
 * determinism) are held in `skyImage.test.ts` beside the sky's. This file
 * holds the texture the renderer filters and the build around PMREM: the
 * half-float source matches the painter, the cube size and bytes are three's
 * arithmetic, and the source and the generator are gone the moment the
 * filtered target exists — only that target is the ledger's to free.
 */

test('the source is a 1024×512 linear half-float equirect of the painted environment', () => {
  const live = defaultUltraLive();
  const source = ultraEnvironmentSource(DAYLIGHT_LOOK, live);
  try {
    assert.equal(source.image.width, ULTRA.env.width);
    assert.equal(source.image.height, ULTRA.env.height);
    assert.equal(source.type, THREE.HalfFloatType);
    assert.equal(source.format, THREE.RGBAFormat);
    assert.equal(source.mapping, THREE.EquirectangularReflectionMapping);
    assert.equal(source.colorSpace, THREE.LinearSRGBColorSpace);
    assert.equal(source.generateMipmaps, false);
    const half = source.image.data as Uint16Array;
    assert.equal(half.length, ULTRA.env.width * ULTRA.env.height * 4);

    // Every texel is the painter's float, to half precision.
    const floats = paintEnvironment(DAYLIGHT_LOOK, {
      width: ULTRA.env.width,
      height: ULTRA.env.height,
      bounceLift: live.bounceLift,
      sunCoreStrength: ULTRA.env.sunCoreStrength,
      aureoleScale: ULTRA.env.aureoleScale,
      horizonBlendDegrees: ULTRA.env.horizonBlendDegrees,
      construction: skyConstruction(),
    });
    for (let index = 0; index < half.length; index += 997) {
      const back = THREE.DataUtils.fromHalfFloat(half[index]);
      assert.ok(Math.abs(back - floats[index]) <= Math.abs(floats[index]) * 1e-3 + 1e-4, `texel ${index}`);
    }
  } finally {
    source.dispose();
  }
});

test('β is live: the bounce half follows bounceLift and the sky half does not move', () => {
  const low = ultraEnvironmentSource(DAYLIGHT_LOOK, { ...defaultUltraLive(), bounceLift: 1 });
  const high = ultraEnvironmentSource(DAYLIGHT_LOOK, { ...defaultUltraLive(), bounceLift: 2 });
  try {
    const width = ULTRA.env.width;
    const a = low.image.data as Uint16Array;
    const b = high.image.data as Uint16Array;
    const nadir = 0;
    const zenith = (ULTRA.env.height - 1) * width * 4;
    const bounce = hexToLinear(DAYLIGHT_LOOK.groundBounceColour);
    assert.ok(Math.abs(THREE.DataUtils.fromHalfFloat(a[nadir]) - bounce.r) < 2e-3);
    assert.ok(Math.abs(THREE.DataUtils.fromHalfFloat(b[nadir]) - bounce.r * 2) < 4e-3);
    for (let channel = 0; channel < 4; channel += 1) assert.equal(a[zenith + channel], b[zenith + channel]);
  } finally {
    low.dispose();
    high.dispose();
  }
});

test('the cube size and bytes are three’s own arithmetic: 256 and 6 MiB for the 1024 source', () => {
  assert.equal(environmentCubeSize(ULTRA.env.width), 256);
  assert.equal(environmentBytes(256), 3 * 256 * 4 * 256 * 8);
  assert.equal(environmentBytes(256) / 2 ** 20, 6);
  // Small cubes keep three's 112-texel width floor.
  assert.equal(environmentBytes(64), 3 * 112 * 4 * 64 * 8);
  assert.equal(environmentBytes(0), 0);
});

/** A PMREM stand-in: returns a real (GL-less) cube-UV-shaped target and records the calls. */
function fakeGenerator(options: { fail?: boolean } = {}): {
  generator: EnvironmentGenerator; calls: string[]; source: THREE.Texture[]; target: THREE.WebGLRenderTarget;
} {
  const calls: string[] = [];
  const source: THREE.Texture[] = [];
  const target = new THREE.WebGLRenderTarget(3 * 256, 4 * 256, { type: THREE.HalfFloatType });
  target.texture.mapping = THREE.CubeUVReflectionMapping;
  const generator: EnvironmentGenerator = {
    fromEquirectangular(texture: THREE.Texture): THREE.WebGLRenderTarget {
      calls.push('filter');
      source.push(texture);
      if (options.fail === true) throw new Error('out of memory');
      return target;
    },
    dispose(): void {
      calls.push('dispose-generator');
    },
  };
  return { generator, calls, source, target };
}

test('the build filters once, frees the source and the generator, and hands over only the target', () => {
  const fake = fakeGenerator();
  const released: string[] = [];
  const environment = buildUltraEnvironment({} as THREE.WebGLRenderer, DAYLIGHT_LOOK, defaultUltraLive(), () => fake.generator);
  fake.source[0].addEventListener('dispose', () => released.push('late source'));
  assert.deepEqual(fake.calls, ['filter', 'dispose-generator']);
  assert.equal(environment.texture, fake.target.texture);
  assert.equal(environment.cubeSize, 256);
  assert.equal(environment.bytes, environmentBytes(256));
  // The source was already disposed inside the build (a late listener hears nothing).
  assert.equal(released.length, 0);
  assert.equal(fake.source[0].name, 'ultra-environment-source');

  fake.target.addEventListener('dispose', () => released.push('target'));
  environment.dispose();
  environment.dispose();
  assert.deepEqual(released, ['target']);
});

test('the source was disposed during the build, not leaked', () => {
  const fake = fakeGenerator();
  let sourceDisposed = false;
  const generator: EnvironmentGenerator = {
    fromEquirectangular(texture: THREE.Texture): THREE.WebGLRenderTarget {
      texture.addEventListener('dispose', () => { sourceDisposed = true; });
      return fake.generator.fromEquirectangular(texture);
    },
    dispose: () => fake.generator.dispose(),
  };
  buildUltraEnvironment({} as THREE.WebGLRenderer, resolveVenueLook(SWITCHBACK_LOOK), defaultUltraLive(), () => generator).dispose();
  assert.equal(sourceDisposed, true);
});

test('a failed filter still frees the generator and the source, and throws', () => {
  const fake = fakeGenerator({ fail: true });
  let sourceDisposed = false;
  const generator: EnvironmentGenerator = {
    fromEquirectangular(texture: THREE.Texture): THREE.WebGLRenderTarget {
      texture.addEventListener('dispose', () => { sourceDisposed = true; });
      return fake.generator.fromEquirectangular(texture);
    },
    dispose: () => fake.generator.dispose(),
  };
  assert.throws(
    () => buildUltraEnvironment({} as THREE.WebGLRenderer, DAYLIGHT_LOOK, defaultUltraLive(), () => generator),
    /out of memory/,
  );
  assert.deepEqual(fake.calls, ['filter', 'dispose-generator']);
  assert.equal(sourceDisposed, true);
});

/**
 * A GL-less renderer three's real `PMREMGenerator` can drive (A28 C2): it
 * records every target it is pointed at and hears each one's `dispose`, and
 * its `render` throws on the `throwOn`-th call, as a lost or exhausted
 * context can in the middle of the filter. It starts on a target of its own
 * with XR and auto-clear on, so a filter that strands any of them shows.
 */
function filterRenderer(throwOn: number | null): {
  renderer: THREE.WebGLRenderer;
  previous: THREE.WebGLRenderTarget;
  state: { target: THREE.RenderTarget | null };
  seen: THREE.RenderTarget[];
  disposed: Set<THREE.RenderTarget>;
} {
  const previous = new THREE.WebGLRenderTarget(2, 2);
  const state = { target: previous as THREE.RenderTarget | null, face: 0, level: 0, renders: 0 };
  const seen: THREE.RenderTarget[] = [];
  const disposed = new Set<THREE.RenderTarget>();
  const renderer = {
    xr: { enabled: true },
    autoClear: true,
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.level,
    setRenderTarget(target: THREE.RenderTarget | null, face = 0, level = 0): void {
      state.target = target;
      state.face = face;
      state.level = level;
      if (target !== null && target !== previous && !seen.includes(target)) {
        seen.push(target);
        target.addEventListener('dispose', () => disposed.add(target));
      }
    },
    render(): void {
      state.renders += 1;
      if (state.renders === throwOn) throw new Error('context lost mid-filter');
    },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, previous, state, seen, disposed };
}

test('A28 C2: the ledger wraps three’s own PMREM allocator, by the name 0.185.1 gives it', () => {
  const prototype = THREE.PMREMGenerator.prototype as unknown as Record<string, unknown>;
  assert.equal(typeof prototype._allocateTargets, 'function', 'three renamed the allocator buildUltraEnvironment wraps');
});

test('A28 C2: a PMREM filter that throws frees the target three allocated for it, and puts the renderer back', () => {
  // 1: filling the cube-UV target; 2: the first GGX pass, into the ping-pong
  // target, with the cube-UV one already drawn; 3: its copy back.
  for (const throwOn of [1, 2, 3]) {
    const fake = filterRenderer(throwOn);
    assert.throws(
      () => buildUltraEnvironment(fake.renderer, DAYLIGHT_LOOK, defaultUltraLive()),
      /context lost mid-filter/,
    );
    assert.equal(fake.seen.length, throwOn === 1 ? 1 : 2, `render ${throwOn}: targets drawn into`);
    assert.equal(fake.disposed.size, fake.seen.length, `render ${throwOn}: a target the filter made was stranded`);
    assert.equal(fake.state.target, fake.previous, 'the renderer was left on a disposed target');
    assert.equal(fake.renderer.xr.enabled, true, 'XR was left off');
    assert.equal(fake.renderer.autoClear, true, 'auto-clear was left off');
  }
});

test('A28 C2: a PMREM filter that finishes hands over exactly the target it allocated, which the ledger frees', () => {
  const fake = filterRenderer(null);
  const environment = buildUltraEnvironment(fake.renderer, DAYLIGHT_LOOK, defaultUltraLive());
  assert.equal(fake.seen.length, 2, 'the cube-UV target and the ping-pong target');
  assert.equal(environment.target, fake.seen[0]);
  assert.equal(environment.texture, (fake.seen[0] as THREE.WebGLRenderTarget).texture);
  assert.deepEqual([...fake.disposed], [fake.seen[1]], 'only the ping-pong target goes with the generator');
  assert.equal(fake.state.target, fake.previous);
  environment.dispose();
  assert.equal(fake.disposed.size, 2);
});

test('each venue paints its own environment from its own look', () => {
  const day = ultraEnvironmentSource(DAYLIGHT_LOOK, defaultUltraLive());
  const park = ultraEnvironmentSource(resolveVenueLook(SWITCHBACK_LOOK), defaultUltraLive());
  try {
    const a = day.image.data as Uint16Array;
    const b = park.image.data as Uint16Array;
    // The warm park bounce is redder relative to blue than daylight's.
    const ratio = (data: Uint16Array): number =>
      THREE.DataUtils.fromHalfFloat(data[0]) / THREE.DataUtils.fromHalfFloat(data[2]);
    assert.ok(ratio(b) > ratio(a));
  } finally {
    day.dispose();
    park.dispose();
  }
});
