/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The rider's, the wheel's and the cop's own read of the Ultra near map — M39
 * gauntlet round 3, repair item 3 ("rider self-shadow stipple").
 *
 * **The defect.** Under Ultra the rider, wheel and cop receive the near
 * shadow (§3.2), through their **stock** `MeshStandardMaterial`s. three
 * 0.185.1's PCF `getShadow` reads the map with five bilinear taps on a Vogel
 * disk turned per *screen pixel* by interleaved gradient noise
 * (`shadowmap_pars_fragment`), so wherever a limb shades itself — the shin, the
 * torso's side — the penumbra is a fine per-pixel stipple that crawls as the
 * camera moves. High shows none of it: its rider never receives. Wave 4 (R-L)
 * replaced those taps in the patched Ultra families with a fixed 16-tap disk;
 * the stock rider materials kept three's.
 *
 * **The repair.** A per-material `onBeforeCompile` (+ `customProgramCacheKey`),
 * never a `ShaderChunk` edit (invariant 2), that inlines three's
 * `shadowmap_pars_fragment` into that one material's source with two edits:
 *
 * 1. before the PCF `getShadow`, the ground's own near-map filter,
 *    `ultraNearFilterGlsl()` from `ultraMaterials.ts` (final wave, P-LT):
 *    the same fixed 16-tap Vogel disk as the patched families
 *    (`ultraDiskTaps`: radius √((i+½)/n), golden-angle spaced, each a bilinear
 *    hardware compare weighted `1 − r²`), `ULTRA.nearFilter.edgeWiden` × the
 *    live radius, with its edge contrast restored (`ultraNearEdgeShadow`). No
 *    noise of any kind, so nothing swims or stipples as the camera moves; the
 *    rider and the ground under him are filtered by one text (the U4
 *    stabilizer replaced P-RT's per-texel turn with it: P-LT's model found
 *    that turn no different from the fixed disk, and a turn that jumps at
 *    every texel edge can draw the texel grid into a penumbra);
 * 2. at the PCF `getShadow`'s return, the shadow is replaced by that filter
 *    whenever three's own frustum test passed — so outside the map, and on
 *    every other light's lookup, nothing changes.
 *
 * The radius is the rig's live `shadowRadius` (`ULTRA.nearRadius`), the bias
 * and normal offset are three's (the rig's live values): only the filter
 * changes, never where the shadow falls.
 *
 * **Held and restored through the runtime's WeakMap** (`ultraRuntime.ts`
 * `receiveOn` / `restoreRiderMaterial`, the same record as A15's `envMap`):
 * `holdRiderShadow` returns the authored compile hooks — whether each was the
 * material's own property or the prototype's — and `releaseRiderShadow` puts
 * exactly that back, then flags the material for a program change. The Ultra
 * program variant each material compiled is released by the teardown's
 * `releaseEnvironmentPrograms` (step 4b), so the program count returns to the
 * ordinary set after Ultra; while Ultra draws, the variants share programs
 * wherever three's parameters agree, and count against the 36 ceiling.
 *
 * **A28 (Trade 1): the rider's light in static shade.** The same hold also
 * gives the held materials a light term for static shade — the only lighting
 * term the rider, wheel and cop take (A28 widens invariant 8 for it alone):
 * where the static far map says a building or a tree shades a point of the
 * rider, the environment's diffuse fill leans to the sky above him and the
 * sheen off the ground below is cut (`ULTRA.rider.shadeLight`), because the
 * painted environment's lower half is a *sunlit* street's bounce and the
 * street round him is in shade. Outside static shade it is exactly 1. It
 * reads the current world's far map through getters (`riderLightUniforms`),
 * so a material held across a world swap never samples a disposed map.
 *
 * **F-A1 (Fable's QA of A28): the light is compiled only where a far map
 * exists.** Its far map is a `sampler2DShadow`; a program that declares one
 * while the uniform is `null` makes three bind its never-uploaded
 * `emptyShadowTexture`, and ANGLE (Metal) rejects every draw of that program
 * with `INVALID_OPERATION` — the rider, wheel and cop vanished on every rung
 * without a far map (`ultra-lit`, `?ultrakit=-farShadow`). So the light, its
 * sampler and its varying are in the program only when the far map exists
 * at compile time, and the program key says so (`ULTRA_RIDER_FAR_KEY`,
 * `#define ULTRA_RIDER_FAR` in both stages); without one the held program is
 * the round-3 shadow program exactly, and no shadow sampler of ours is ever
 * bound null. The far map's presence can change while a material is held
 * (a world swap onto a rung without one, an empty far box), so the runtime's
 * frame hook re-keys the held set before the frame draws
 * (`rekeyRiderLight`): a change disposes their programs, and each compiles
 * again for what exists now.
 *
 * Headless: string edits and plain three objects, no GL (`ultraRiderShadow.test.ts`).
 */
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import { ultraNearFilterGlsl } from './ultraMaterials.ts';
import type { UltraShared } from './ultraTypes.ts';

/** The replace anchors, verbatim from three 0.185.1 (pinned by test against `node_modules`). */
export const RIDER_SHADOW_ANCHORS = Object.freeze({
  /** Where the chunk is inlined, in `meshphysical.glsl.js`'s fragment shader. */
  include: '#include <shadowmap_pars_fragment>',
  /** The PCF `getShadow`'s signature — the first `getShadow` in the chunk. */
  pcfGetShadow:
    'float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {',
  /** The PCF `getShadow`'s return — the first of the chunk's returns of this text. */
  shadowReturn: 'return mix( 1.0, shadow, shadowIntensity );',
});

/** Appended to the authored program key, so a held material never shares an ordinary program. */
export const ULTRA_RIDER_SHADOW_KEY = 'm39-ultra-rider-shadow-4';

/**
 * F-A1: in the held key, before `ULTRA_RIDER_SHADOW_KEY`, exactly when the
 * program carries the rider's light — which is exactly when a far map
 * existed at its compile (`riderLightHasFar`).
 */
export const ULTRA_RIDER_FAR_KEY = 'm39-ultra-rider-far';

/**
 * The filter, inserted immediately before the PCF `getShadow`, inside the
 * chunk's `SHADOWMAP_TYPE_PCF` branch (global scope), so a non-PCF build
 * never sees it. The text is the ground's (`ultraNearFilterGlsl()`), never a
 * copy: a stock rider material declares none of it itself.
 */
const RIDER_DISK_GLSL = /* glsl */ `
		// ---- M39 Ultra: the rider's near-map filter (render/ultra/ultraRiderShadow.ts) ----
${ultraNearFilterGlsl()}
		`;

/** The PCF return, with the ground's filter in place of three's five turned taps. */
const RIDER_SHADOW_RETURN = /* glsl */ `if ( frustumTest ) shadow = ultraNearEdgeShadow( shadowMap, shadowCoord.xyz, shadowMapSize, shadowRadius );
			${RIDER_SHADOW_ANCHORS.shadowReturn}`;

function replaceOnce(source: string, anchor: string, replacement: string, where: string): string {
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error(`ultraRiderShadow: the anchor "${anchor.slice(0, 48)}…" is missing from ${where}`);
  return source.slice(0, at) + replacement + source.slice(at + anchor.length);
}

/**
 * `shadowmap_pars_fragment` with the two edits: the disk before the PCF
 * `getShadow`, the disk at its return. Reads `THREE.ShaderChunk`, never writes it.
 */
export function riderShadowParsChunk(): string {
  let chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  chunk = replaceOnce(
    chunk,
    RIDER_SHADOW_ANCHORS.pcfGetShadow,
    RIDER_DISK_GLSL + RIDER_SHADOW_ANCHORS.pcfGetShadow,
    'shadowmap_pars_fragment',
  );
  // The first return of this text is now still the PCF `getShadow`'s: the
  // inserted helper returns `sum`, never this line.
  return replaceOnce(chunk, RIDER_SHADOW_ANCHORS.shadowReturn, RIDER_SHADOW_RETURN, 'shadowmap_pars_fragment');
}

/**
 * A fragment shader with the rider's filter: its `#include
 * <shadowmap_pars_fragment>` replaced by the edited chunk. A shader without
 * the include (no shadow lookup at all) is returned unchanged.
 */
export function patchRiderShadowFragment(source: string): string {
  if (!source.includes(RIDER_SHADOW_ANCHORS.include)) return source;
  return replaceOnce(source, RIDER_SHADOW_ANCHORS.include, riderShadowParsChunk(), 'the fragment shader');
}

// ---------------------------------------------------------------------------
// A28, Trade 1: the rider's light in static shade
// ---------------------------------------------------------------------------

/** The anchors the rider's light edits, verbatim from three 0.185.1 (pinned by test). */
export const RIDER_LIGHT_ANCHORS = Object.freeze({
  /** Both stages: the declarations follow it. */
  common: '#include <common>',
  /** Vertex: the world position is written after it. */
  worldpos: '#include <worldpos_vertex>',
  /** Fragment: the environment's irradiance is complete here, not yet spent. */
  lightsMaps: '#include <lights_fragment_maps>',
});

/**
 * The uniforms the rider's light reads: the static far map, its matrix and
 * `(enabled, spread texels, edge band)`. Each `value` is a getter onto the
 * **current** Ultra world's shared uniforms (`source()`), so a held material,
 * which outlives world swaps, never keeps a swapped-out world's far map and
 * needs no per-frame write; with no world (or no far map) the light is off.
 * three reads `value` at every material refresh, which is the first draw of
 * each material every frame. `ultraRiderFarMap` reads `null` without a far
 * map, and a program only declares its sampler when it did not (F-A1,
 * `riderLightHasFar`), so three never binds that `null`.
 */
export interface RiderLightUniforms {
  readonly ultraRiderFarMap: THREE.IUniform<THREE.Texture | null>;
  readonly ultraRiderFarMatrix: THREE.IUniform<THREE.Matrix4>;
  readonly ultraRiderFar: THREE.IUniform<THREE.Vector3>;
}

/** The rider's light uniforms, reading the Ultra world `source()` returns (null: off). */
export function riderLightUniforms(source: () => UltraShared | null): RiderLightUniforms {
  const identity = new THREE.Matrix4();
  const far = new THREE.Vector3();
  const shared = (name: string): unknown => source()?.uniforms[name]?.value;
  return Object.freeze({
    ultraRiderFarMap: {
      get value(): THREE.Texture | null {
        const enabled = shared('ultraFarEnabled');
        const map = shared('ultraFarMap');
        return enabled === 1 && map instanceof THREE.Texture ? map : null;
      },
    },
    ultraRiderFarMatrix: {
      get value(): THREE.Matrix4 {
        const matrix = shared('ultraFarMatrix');
        return matrix instanceof THREE.Matrix4 ? matrix : identity;
      },
    },
    ultraRiderFar: {
      get value(): THREE.Vector3 {
        const enabled = shared('ultraFarEnabled') === 1 && shared('ultraFarMap') instanceof THREE.Texture;
        const spread = shared('ultraFarSpread');
        const edge = shared('ultraFarEdge');
        return far.set(
          enabled ? 1 : 0,
          typeof spread === 'number' ? spread : 0,
          typeof edge === 'number' ? edge : 0,
        );
      },
    },
  });
}

/** Light off: what a hold without a runtime (a test) reads — no far map, so no light is compiled. */
const RIDER_LIGHT_OFF: RiderLightUniforms = riderLightUniforms(() => null);

/**
 * F-A1: whether the rider's light has a far map to read now — the one fact
 * a held program is compiled and keyed for. Without one, no program of ours
 * declares the `sampler2DShadow` that would otherwise be bound `null`.
 */
export function riderLightHasFar(light: RiderLightUniforms): boolean {
  return light.ultraRiderFarMap.value !== null;
}

/** Release a held material's programs (`WebGLRenderer`'s dispose listener); the material itself stays. */
function releasePrograms(material: THREE.Material): void {
  material.dispose();
}

/**
 * F-A1: keep the held rider, wheel and cop programs keyed for the far map
 * that exists **now**. `keyedFor` is what the held set was last keyed for
 * (null: nothing held has compiled since the hold began — each held material
 * is already flagged, and compiles for what exists at its first draw). When
 * the far map has come or gone since, every held material's programs are
 * released — `material.dispose()`, as teardown step 4b releases them, so the
 * old variant is freed rather than kept beside the new one — and each
 * compiles again at its next draw, with the light and its sampler exactly
 * when a far map exists. Returns what the held set is keyed for from here.
 *
 * Called by the runtime's frame hook after the shared uniforms take this
 * frame's far map and before the frame draws, which every Ultra render does
 * (`beforeSoloRender`), so no held program with the light's sampler is ever
 * drawn while the far map is `null`. Allocates nothing.
 */
export function rekeyRiderLight(
  materials: ReadonlySet<THREE.Material>,
  light: RiderLightUniforms,
  keyedFor: boolean | null,
): boolean {
  const far = riderLightHasFar(light);
  if (keyedFor !== null && keyedFor !== far) materials.forEach(releasePrograms);
  return far;
}

function glslFloat(value: number): string {
  const text = String(value);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
}

const RIDER_LIGHT_VERTEX_DECLARATIONS = /* glsl */ `
// ---- M39 Ultra: the rider's light in static shade (render/ultra/ultraRiderShadow.ts, A28) ----
#define ULTRA_RIDER_FAR
varying vec3 vUltraRiderWorld;`;

const RIDER_LIGHT_VERTEX = /* glsl */ `
	{
		// The world position, as worldpos_vertex computes it (whatever defines
		// that chunk was compiled under).
		vec4 ultraRiderWorld = vec4( transformed, 1.0 );
		#ifdef USE_BATCHING
			ultraRiderWorld = batchingMatrix * ultraRiderWorld;
		#endif
		#ifdef USE_INSTANCING
			ultraRiderWorld = instanceMatrix * ultraRiderWorld;
		#endif
		vUltraRiderWorld = ( modelMatrix * ultraRiderWorld ).xyz;
	}`;

/**
 * The fragment declarations: the far map and the static-shade lookup at this
 * point of the rider. The far map holds only static casters (buildings, trees,
 * blocks — never a rider, the cop or the ghost), so it answers "does a static
 * caster shade this point", never the rider's own self-shadow; its four-tap
 * tent (0.4–0.7 m texels) makes the answer ramp over about a metre as a rider
 * crosses a shade edge, so nothing pops. Compiled only where a far map exists
 * (F-A1): `ULTRA_RIDER_FAR` marks the program that declares the sampler.
 */
function riderLightFragmentDeclarations(): string {
  return /* glsl */ `
// ---- M39 Ultra: the rider's light in static shade (render/ultra/ultraRiderShadow.ts, A28) ----
#define ULTRA_RIDER_FAR
uniform sampler2DShadow ultraRiderFarMap;
uniform mat4 ultraRiderFarMatrix;
uniform vec3 ultraRiderFar;
varying vec3 vUltraRiderWorld;
float ultraRiderStaticShade() {
	if ( ultraRiderFar.x < 0.5 ) return 0.0;
	vec4 ultraC = ultraRiderFarMatrix * vec4( vUltraRiderWorld, 1.0 );
	vec2 ultraStep = ultraRiderFar.y / vec2( textureSize( ultraRiderFarMap, 0 ) );
	float ultraZ = min( ultraC.z, 1.0 );
	float ultraLit = 0.25 * (
		textureLod( ultraRiderFarMap, vec3( ultraC.xy + vec2( - ultraStep.x, - ultraStep.y ), ultraZ ), 0.0 ) +
		textureLod( ultraRiderFarMap, vec3( ultraC.xy + vec2( ultraStep.x, - ultraStep.y ), ultraZ ), 0.0 ) +
		textureLod( ultraRiderFarMap, vec3( ultraC.xy + vec2( - ultraStep.x, ultraStep.y ), ultraZ ), 0.0 ) +
		textureLod( ultraRiderFarMap, vec3( ultraC.xy + vec2( ultraStep.x, ultraStep.y ), ultraZ ), 0.0 ) );
	float ultraEdge = min( min( ultraC.x, 1.0 - ultraC.x ), min( ultraC.y, 1.0 - ultraC.y ) );
	float ultraCover = ultraRiderFar.z > 0.0 ? smoothstep( 0.0, ultraRiderFar.z, ultraEdge ) : step( 0.0, ultraEdge );
	return ( 1.0 - ultraLit ) * ultraCover;
}`;
}

/**
 * After `lights_fragment_maps` (the environment's irradiance and radiance are
 * complete, not yet spent by `lights_fragment_end`): in static shade only,
 * the diffuse fill × `mix(bodyKeep, skyGain, key)` (`key` how far the world
 * normal looks up, over `keyUp`), and the sheen × `sheenKeep` where its
 * reflection looks below the horizon (over `sheenSky`). The sun is added
 * elsewhere and untouched; at `ultraRiderShade` 0 nothing changes.
 */
function riderLightFragment(): string {
  const light = ULTRA.rider.shadeLight;
  return /* glsl */ `
	{
		// M39 Ultra (A28): in static shade the rider is lit by the sky above.
		float ultraRiderShade = ultraRiderStaticShade();
		if ( ultraRiderShade > 0.0 ) {
			vec3 ultraRiderN = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
			float ultraRiderKey = smoothstep( ${glslFloat(light.keyUp[0])}, ${glslFloat(light.keyUp[1])}, ultraRiderN.y );
			iblIrradiance *= mix( 1.0, mix( ${glslFloat(light.bodyKeep)}, ${glslFloat(light.skyGain)}, ultraRiderKey ), ultraRiderShade );
			#if defined( RE_IndirectSpecular )
				vec3 ultraRiderR = transformDirectionByInverseViewMatrix( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
				float ultraRiderSkyward = smoothstep( ${glslFloat(light.sheenSky[0])}, ${glslFloat(light.sheenSky[1])}, ultraRiderR.y );
				radiance *= mix( 1.0, mix( ${glslFloat(light.sheenKeep)}, 1.0, ultraRiderSkyward ), ultraRiderShade );
			#endif
		}
	}`;
}

/** A vertex shader with the rider's world position; unchanged without the anchors. */
export function patchRiderLightVertex(source: string): string {
  if (!source.includes(RIDER_LIGHT_ANCHORS.common) || !source.includes(RIDER_LIGHT_ANCHORS.worldpos)) return source;
  let out = replaceOnce(source, RIDER_LIGHT_ANCHORS.common, `${RIDER_LIGHT_ANCHORS.common}${RIDER_LIGHT_VERTEX_DECLARATIONS}`, 'the vertex shader');
  out = replaceOnce(out, RIDER_LIGHT_ANCHORS.worldpos, `${RIDER_LIGHT_ANCHORS.worldpos}${RIDER_LIGHT_VERTEX}`, 'the vertex shader');
  return out;
}

/** A fragment shader with the rider's light; unchanged without the anchors (no environment term to weigh). */
export function patchRiderLightFragment(source: string): string {
  if (!source.includes(RIDER_LIGHT_ANCHORS.common) || !source.includes(RIDER_LIGHT_ANCHORS.lightsMaps)) return source;
  let out = replaceOnce(source, RIDER_LIGHT_ANCHORS.common, `${RIDER_LIGHT_ANCHORS.common}${riderLightFragmentDeclarations()}`, 'the fragment shader');
  out = replaceOnce(out, RIDER_LIGHT_ANCHORS.lightsMaps, `${RIDER_LIGHT_ANCHORS.lightsMaps}${riderLightFragment()}`, 'the fragment shader');
  return out;
}

type CompileHook = THREE.Material['onBeforeCompile'];
type KeyHook = THREE.Material['customProgramCacheKey'];

/** A material's authored compile hooks, as `holdRiderShadow` found them. */
export interface HeldRiderShadow {
  /** Whether `onBeforeCompile` was the material's own property (else the prototype's). */
  readonly ownCompile: boolean;
  readonly onBeforeCompile: CompileHook;
  /** Whether `customProgramCacheKey` was the material's own property. */
  readonly ownKey: boolean;
  readonly customProgramCacheKey: KeyHook;
}

/**
 * Give one held material the rider's filter: wrap its compile hook (the
 * authored one runs first, unchanged) and its program key, and flag a
 * program change. Returns what to put back.
 *
 * The rider's light (A28) is compiled in only when `light` has a far map at
 * compile time, and the key carries `ULTRA_RIDER_FAR_KEY` exactly then
 * (F-A1): three evaluates the key and runs the hook in the same
 * `getProgram`, so the two always agree. The uniforms are handed over either
 * way — three uploads only what a program declares — so a variant three
 * reuses from the material's own cache always finds them.
 */
export function holdRiderShadow(material: THREE.Material, light: RiderLightUniforms = RIDER_LIGHT_OFF): HeldRiderShadow {
  const held: HeldRiderShadow = {
    ownCompile: Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile'),
    onBeforeCompile: material.onBeforeCompile,
    ownKey: Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey'),
    customProgramCacheKey: material.customProgramCacheKey,
  };
  const authoredCompile = held.onBeforeCompile;
  const authoredKey = held.customProgramCacheKey;
  material.onBeforeCompile = function riderShadowCompile(this: THREE.Material, shader, renderer): void {
    authoredCompile.call(this, shader, renderer);
    shader.fragmentShader = patchRiderShadowFragment(shader.fragmentShader);
    // A28: the rider's light in static shade — F-A1: only with a far map to
    // read, so no program declares a shadow sampler three would bind null.
    if (riderLightHasFar(light)) {
      shader.vertexShader = patchRiderLightVertex(shader.vertexShader);
      shader.fragmentShader = patchRiderLightFragment(shader.fragmentShader);
    }
    Object.assign(shader.uniforms, light);
  };
  material.customProgramCacheKey = function riderShadowKey(this: THREE.Material): string {
    const far = riderLightHasFar(light) ? `|${ULTRA_RIDER_FAR_KEY}` : '';
    return `${authoredKey.call(this)}${far}|${ULTRA_RIDER_SHADOW_KEY}`;
  };
  material.needsUpdate = true;
  return held;
}

/**
 * Put a material's authored compile hooks back exactly — its own property
 * restored, or the prototype's uncovered — and flag a program change, so the
 * next frame draws it with the program it had before Ultra.
 */
export function releaseRiderShadow(material: THREE.Material, held: HeldRiderShadow): void {
  if (held.ownCompile) material.onBeforeCompile = held.onBeforeCompile;
  else Reflect.deleteProperty(material, 'onBeforeCompile');
  if (held.ownKey) material.customProgramCacheKey = held.customProgramCacheKey;
  else Reflect.deleteProperty(material, 'customProgramCacheKey');
  material.needsUpdate = true;
}

/** Whether a material currently carries the rider's filter (for the tests and the report). */
export function hasRiderShadow(material: THREE.Material): boolean {
  return material.customProgramCacheKey().endsWith(`|${ULTRA_RIDER_SHADOW_KEY}`);
}
