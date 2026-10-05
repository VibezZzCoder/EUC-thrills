/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra material and patch library — M39 (`docs/M39_ULTRA.md` §3.3, §3.4,
 * package W4, the lighting owner).
 *
 * Every Ultra surface response lives here as a **per-material**
 * `onBeforeCompile` + `customProgramCacheKey` — never a global `ShaderChunk`
 * edit (invariant 2). A chunk that needs an edit *inside* it is inlined into
 * that one material's source from `THREE.ShaderChunk`, edited, and left in
 * place of its `#include`; `THREE.ShaderChunk` itself is only ever read
 * (`ultraMaterials.test.ts` deep-compares it before and after building every
 * material). Every replace anchor is listed in `ULTRA_PATCH_ANCHOR_SITES`
 * and pinned by test against the three 0.185.1 chunk text, so a three
 * upgrade that moves one fails a test rather than a shader.
 *
 * ## One patch text, families by define
 *
 * Every lit Ultra material runs the same vertex and fragment patch; what a
 * family *does* is chosen by `#define`s on `material.defines`, which three
 * already folds into its program cache key. The patch text therefore depends
 * on nothing but the family and the defines, which is what makes
 * `customProgramCacheKey` (one per family) honest: two materials that share a
 * key compile to the same source. Per-material values (the roughness floor)
 * are per-material uniforms; values every Ultra material shares — the near
 * fade band, the far map, the live response values — are the *same uniform
 * objects* in every material (`UltraShared`), so one write in
 * `updateUltraShared` / `tuneUltraShared` reaches them all with no program
 * change.
 *
 * | Family (key) | Defines | Response |
 * |---|---|---|
 * | ground | `ULTRA_GROUND`, `ULTRA_AO`, `ULTRA_BRICK`, `ULTRA_ROAD` (+ the ground patch's `ULTRA_EDGE`, `ULTRA_DETAIL`, `ultraGroundDetail.ts`) | indirect specular × `groundSpec`; contact AO on indirect; brick joints on brick only; the edge field and surface detail |
 * | block | `ULTRA_AO` | base AO on indirect; street-metal roughness floor |
 * | facade | `ULTRA_RELIEF`, `ULTRA_BASE_AO`, `ULTRA_GLASS`, `ULTRA_FACADE_RECEIVE`, `ULTRA_FACADE_LIFT` (both `kit.lighting`) | normal + ORM maps; glass indirect specular × `glassSpec`; metric base AO; relief; its own near-map receive (fixed disk widening as the sun grazes and past 30 m, receive bias along the light, slope-scaled normal offset, grazing fade); a caster's cast shade lifted toward form shade (final wave) |
 * | relief | `ULTRA_RELIEF`, `ULTRA_TILES` | cap/gable relief; roof tile courses |
 * | foliage | `ULTRA_FOLIAGE` | wrap + transmission inside the shadowed direct term; the canopy's sky light (`ULTRA.foliage.skyFill` × the fill) |
 * | furniture | – | the environment arrives on its own; street-metal floor |
 * | water | `ULTRA_GROUND_SHADOW` (`kit.lighting`) | explicit `envMap`, `envMapIntensity = environmentIntensity × waterSpec`; the ground's near-map filter |
 * | marking | `ULTRA_SHADE_LIFT` (`kit.lighting`), `ULTRA_CONTACT_DYNAMIC` (`kit.ground`) — the paint patch, `ultraGroundDetail.ts`; `ULTRA_GROUND_SHADOW` (`kit.lighting`) | environment fill; the road's static-shade lift, rider/cop contact and near-map filter, so paint keeps its ratio to the road |
 * | hazard-ground | `ULTRA_CAVITY`, `ULTRA_GROUND_SHADOW` (with `kit.lighting`) | the bowl's fill is the up-facing face's; indirect specular × `groundSpec`; the ground's near-map filter |
 *
 * **Everything lit** also gets: the near map's edge fade inside `getShadow`
 * (the outer 12 % of the ±55 m box eases out, so there is no switch-on line),
 * crossfaded there into the static far map (`ULTRA_FAR`, from the kit) —
 * `mix(far, near, coverage)`, see `NEAR_FADE_RETURN` for why not §3.4's
 * post-loop product; the geometric specular-AA floor
 * `roughness = max(r, k·|fwidth(n)|)`; and the fill's hue (`FILL_CHROMA`,
 * pre-R1 calibration): the diffuse fill desaturated toward a haze-tinted grey
 * in shade, High's sky hue kept in sun, and a rough reflection given the
 * surface's own hue.
 *
 * **`kit.lighting` off** (the `?ultrakit=-lighting` attribution diagnostic)
 * drops the *responses* — foliage, ground and glass specular, the water
 * environment — and keeps the surfaces (AO, edge fill, joints, facade maps,
 * relief), so U1 can capture forms and surfaces gaining alone.
 *
 * ## The attribute contract with W3 and W6
 *
 * A patch that declares a vertex attribute the geometry lacks reads whatever
 * the GL's generic attribute holds — not zero, not one — so every attribute
 * below is declared **only** under the define whose kit switch promises it,
 * and the builders attach it under exactly that switch:
 *
 * - `ultraAo` (float, 1 = open) — heightfield and field when `kit.ground`,
 *   blocks when `kit.blocks` (W6).
 * - `ultraEdge` (vec2), `ultraFillTint` (vec3), `ultraFillKind` (float) —
 *   heightfield when `kit.ground && kit.edgeFill`; declared by the ground's
 *   own patch (`ultraGroundDetail.ts`, `ULTRA_EDGE`), not this one.
 * - `ultraRelief` (vec3, metres, local axes) — building parts when
 *   `kit.buildings` (W3).
 *
 * **Headless.** Nothing here needs a GL context: materials are plain three
 * objects and the patches are string edits, which is how W3 and W6 build
 * Ultra views under `node --test` with `createUltraShared()`.
 */
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import type { MaterialAppearance, MaterialId } from '../../data/surfaces.ts';
import type { PartId } from '../props.ts';
import { emptyFarShadowMap, type UltraFarShadow } from './ultraFarShadow.ts';
import { nearFadeBand } from './ultraLighting.ts';
import {
  groundDetailKind,
  groundScreenKernelCompiled,
  installUltraGroundPatch,
  installUltraPaintPatch,
  ULTRA_CONTACT_SLOTS,
  ULTRA_CONTACT_VEC4_PER_SLOT,
  ULTRA_GROUND_SCREEN_KERNEL,
  type UltraGroundDetail,
} from './ultraGroundDetail.ts';
import { installUltraBlockPatch } from './ultraBlocks.ts';
import type {
  ShadowRig,
  UltraBuildContext,
  UltraFacadeMaps,
  UltraKit,
  UltraLiveTuning,
  UltraShared,
} from './ultraTypes.ts';

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

/** Where an anchor lives in the pinned three source. */
export type UltraAnchorSource =
  | 'meshphysical.vertex'
  | 'meshphysical.fragment'
  | 'depth.vertex'
  | 'shadowmap_pars_fragment'
  | 'lights_physical_pars_fragment'
  | 'shadowmap_vertex';

/** One `String.replace` anchor and the source text it must be found in. */
export interface UltraAnchorSite {
  readonly source: UltraAnchorSource;
  readonly anchor: string;
}

const A = {
  common: '#include <common>',
  beginVertex: '#include <begin_vertex>',
  projectVertex: '#include <project_vertex>',
  shadowmapVertex: '#include <shadowmap_vertex>',
  shadowmapPars: '#include <shadowmap_pars_fragment>',
  physicalPars: '#include <lights_physical_pars_fragment>',
  physicalFragment: '#include <lights_physical_fragment>',
  lightsBegin: '#include <lights_fragment_begin>',
  /** Where `iblIrradiance` (the environment's diffuse fill) is final. */
  fragmentMaps: '#include <lights_fragment_maps>',
  aomap: '#include <aomap_fragment>',
  /** The PCF `getShadow`'s return — the first of five in the chunk (§3.2). */
  shadowReturn: 'return mix( 1.0, shadow, shadowIntensity );',
  /** `RE_Direct_Physical`'s diffuse accumulation. */
  directDiffuse: 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',
  /** The world normal the shadow lookup is offset along (`shadowmap_vertex`). */
  shadowNormal: 'vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );',
} as const;

/**
 * Every anchor, with the pinned source it is replaced in. The test reads each
 * source's file from `node_modules/three/src/renderers/shaders/` and requires
 * the anchor there (and in the live `THREE.ShaderChunk` / `ShaderLib` text).
 */
const SITES: UltraAnchorSite[] = [
  { source: 'meshphysical.vertex', anchor: A.common },
  { source: 'meshphysical.vertex', anchor: A.beginVertex },
  { source: 'meshphysical.vertex', anchor: A.projectVertex },
  { source: 'meshphysical.vertex', anchor: A.shadowmapVertex },
  { source: 'meshphysical.fragment', anchor: A.common },
  { source: 'meshphysical.fragment', anchor: A.shadowmapPars },
  { source: 'meshphysical.fragment', anchor: A.physicalPars },
  { source: 'meshphysical.fragment', anchor: A.physicalFragment },
  { source: 'meshphysical.fragment', anchor: A.lightsBegin },
  { source: 'meshphysical.fragment', anchor: A.fragmentMaps },
  { source: 'meshphysical.fragment', anchor: A.aomap },
  { source: 'depth.vertex', anchor: A.common },
  { source: 'depth.vertex', anchor: A.beginVertex },
  { source: 'shadowmap_pars_fragment', anchor: A.shadowReturn },
  { source: 'lights_physical_pars_fragment', anchor: A.directDiffuse },
  { source: 'shadowmap_vertex', anchor: A.shadowNormal },
];
export const ULTRA_PATCH_ANCHOR_SITES: readonly UltraAnchorSite[] = Object.freeze(
  SITES.map((site) => Object.freeze(site)),
);

/**
 * Every `String.replace` anchor the patches use, verbatim from the pinned
 * three chunks, so a three upgrade that moves one fails a test rather than a
 * shader. (§6.2's name; `ULTRA_PATCH_ANCHOR_SITES` says where each lives.)
 */
export const ULTRA_PATCH_ANCHORS: readonly string[] = Object.freeze(
  [...new Set(ULTRA_PATCH_ANCHOR_SITES.map((site) => site.anchor))],
);

/** Replace the first occurrence of an anchor, or fail loudly — never compile a half patch. */
function replaceOnce(source: string, anchor: string, replacement: string, where: string): string {
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error(`Ultra patch anchor missing from ${where}: ${anchor}`);
  return source.slice(0, at) + replacement + source.slice(at + anchor.length);
}

/**
 * Inline one chunk in place of its `#include`, with an edit applied to *this
 * material's copy*. `THREE.ShaderChunk` is read, never written.
 */
function inlineChunk(
  source: string,
  chunk: 'shadowmap_pars_fragment' | 'lights_physical_pars_fragment' | 'shadowmap_vertex',
  edit: (text: string) => string,
): string {
  const text = (THREE.ShaderChunk as Record<string, string>)[chunk];
  return replaceOnce(source, `#include <${chunk}>`, edit(text), `the ${chunk} include`);
}

// ---------------------------------------------------------------------------
// The attribute contract
// ---------------------------------------------------------------------------

/**
 * The Ultra vertex attribute names this shared patch declares. The ground's
 * edge attributes (`ultraEdge`, `ultraFillTint`, `ultraFillKind`) are the
 * ground patch's own (`ultraGroundDetail.ts`, `ULTRA_GROUND_EDGE_ATTRIBUTES`).
 */
export const ULTRA_ATTRIBUTES = Object.freeze({
  ao: 'ultraAo',
  relief: 'ultraRelief',
  wood: 'vegetationWood',
} as const);

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/** Vertex declarations, after `#include <common>`. */
const VERTEX_DECLARATIONS = /* glsl */ `
// ---- M39 Ultra (render/ultra/ultraMaterials.ts) ----
varying vec3 vUltraWorld;
#ifdef ULTRA_VEGETATION_WOOD
  attribute float vegetationWood;
  varying float vUltraVegetationWood;
#endif
#ifdef ULTRA_AO
	attribute float ultraAo;
	varying float vUltraAo;
#endif
#ifdef ULTRA_BASE_AO
	varying float vUltraBaseHeight;
#endif
#if defined( ULTRA_FOLIAGE ) || defined( ULTRA_FACADE_RECEIVE )
	uniform vec3 ultraSunDirection;
#endif
#ifdef ULTRA_FACADE_RECEIVE
	uniform float ultraFacadeSlopeNormal;
#endif
`;

/**
 * The relief attribute and the local → metric scale, shared by the colour
 * and depth patches. `ultraRelief` is metres along the part's local axes, so
 * it is divided by the instance (and model) matrix's column lengths before it
 * joins `transformed`: after three applies those matrices the displacement is
 * the same number of metres on a 0.75 m parapet and a 48 m shaft (§4).
 */
const RELIEF_DECLARATIONS = /* glsl */ `
#ifdef ULTRA_RELIEF
	attribute vec3 ultraRelief;
#endif
vec3 ultraLocalScale() {
	vec3 ultraScale = vec3( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ), length( modelMatrix[ 2 ].xyz ) );
	#ifdef USE_INSTANCING
		ultraScale *= vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
	#endif
	return max( ultraScale, vec3( 1e-4 ) );
}
`;

/** After `#include <begin_vertex>`: the metric relief, inward only by the builders' contract. */
const RELIEF_VERTEX = /* glsl */ `
#ifdef ULTRA_RELIEF
	transformed += ultraRelief / ultraLocalScale();
#endif
`;

/** After `#include <project_vertex>`: world position and the per-vertex Ultra data. */
const PROJECT_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
	vUltraWorld = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
#else
	vUltraWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#endif
#ifdef ULTRA_VEGETATION_WOOD
  vUltraVegetationWood = vegetationWood;
#endif
#ifdef ULTRA_AO
	vUltraAo = ultraAo;
#endif
#ifdef ULTRA_BASE_AO
	// Metres above the part's own base: the unit geometry stands on y = 0.
	vUltraBaseHeight = transformed.y * ultraLocalScale().y;
#endif
`;

/**
 * Inside `shadowmap_vertex`: foliage offsets its shadow lookup *toward the
 * sun* on faces that look away from it. three renders casters' back faces,
 * so a crown's far side is its own stored depth; offset along its normal
 * (away from the sun) it self-shadows solid, and the wrap and transmission
 * light it is meant to receive would be multiplied by zero. Offset toward
 * the sun it is lit by itself and still shadowed by every *other* caster —
 * building shade keeps a tree dark (no glow, §3.3), a back-lit crown rims.
 */
const FOLIAGE_SHADOW_NORMAL = /* glsl */ `
#ifdef ULTRA_FOLIAGE
  #ifdef ULTRA_VEGETATION_WOOD
    if (vegetationWood < 0.5)
  #endif
	shadowWorldNormal *= dot( shadowWorldNormal, ultraSunDirection ) < 0.0 ? - 1.0 : 1.0;
#endif
#ifdef ULTRA_FACADE_RECEIVE
	// Wave 4 (R-L, gauntlet round 2 item 6): the facade's normal offset is
	// slope-scaled, (1 + k(1 - N.L)) x the rig's, so a face the sun grazes
	// looks its shadow up a little farther off its own surface. It scales the
	// live normal bias, so the planted nearNormalBias 0 still means none.
	shadowWorldNormal *= 1.0 + ultraFacadeSlopeNormal * ( 1.0 - saturate( dot( shadowWorldNormal, ultraSunDirection ) ) );
#endif
`;

/**
 * The fixed disk's taps (Wave 4, R-L): a Vogel spiral with **no** per-pixel
 * turn — `ULTRA.nearFilter.taps` points, radius √((i + ½)/n) of the unit
 * disk at `i` golden angles — so every pixel filters with the same kernel
 * and a penumbra is a smooth ramp that holds still in motion. Each tap is a
 * bilinear hardware compare. Each is weighted `1 − r²` (an Epanechnikov
 * kernel, normalised to 1): a flat disk's hard rim lets a caster edge's
 * one-texel stair steps through as teeth along the shadow line (measured on
 * the commercial soffit), a smooth rim damps them at the same tap count.
 * Exported for the test, which checks the disk's shape: `[x, y, weight]`.
 */
export function ultraDiskTaps(count: number = ULTRA.nearFilter.taps): [number, number, number][] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const taps: [number, number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.sqrt((i + 0.5) / count);
    // 1 − r² = (2n − 2i − 1) / 2n, and Σ (2n − 2i − 1) = n²: at 16 taps each
    // weight is a whole number of 256ths, so the sum is exactly 1 in float32
    // and a fully lit pixel stays exactly lit.
    taps.push([r * Math.cos(i * golden), r * Math.sin(i * golden), (2 * count - 2 * i - 1) / (count * count)]);
  }
  return taps;
}

const DISK_TAPS = ultraDiskTaps();
const glslFloat = (value: number, digits = 6): string => {
  const text = value.toFixed(digits);
  return /^-0\.0+$/.test(text) ? text.slice(1) : text;
};

/**
 * The edge reconstruction's contrast curve (final wave, P-LT; Fable F4):
 * `smoothstep(½ − 0.75/w, ½ + 0.75/w, lit)` for `w = ULTRA.nearFilter.edgeWiden`
 * — its slope at ½ is `w`, which undoes the widened disk's softer ramp, and it
 * maps 0 to 0 and 1 to 1 exactly — or the identity when `w ≤ 1`. Baked into
 * the patch text (a construction constant), so the rider materials that
 * mirror the filter need no uniform.
 */
function edgeSharpenGlsl(): string {
  const widen = ULTRA.nearFilter.edgeWiden;
  if (!(widen > 1)) return '\t\treturn lit;';
  return `\t\treturn smoothstep( ${glslFloat(0.5 - 0.75 / widen, 8)}, ${glslFloat(0.5 + 0.75 / widen, 8)}, lit );`;
}

/**
 * The near map's filter, unguarded: the fixed disk (`ultraDiskShadow`), the
 * edge reconstruction (`ultraEdgeSharpen`, `ultraNearEdgeShadow`) and the
 * widening constant. `diskShadowDeclarations` declares it for the ground,
 * its paint and the facades; `ultraNearFilterGlsl()` hands the same text to
 * any other patch that samples the near map (final wave: the rider, wheel
 * and cop materials, `ultraRuntime.ts`).
 *
 * **The edge reconstruction (final wave, P-LT; Fable F4, round 3 item 5).**
 * The fixed disk at the live 1.25 texels drew the residential rider's cast
 * shadow with a regular bead along its edge, one bead per shadow-map texel:
 * a caster's silhouette reaches the map as whole texels, and a kernel about
 * one texel wide reconstructs every texel corner as a bump (High's five taps
 * turned per pixel by screen-space noise dither the same bumps into grain,
 * which reads smooth at 1× and crawls in motion). Measured in a headless model
 * of the hardware compare (seven edge angles in the P-LT scratchpad;
 * `ultraMaterials.test.ts` `edgeModel` pins three of them), the
 * two remedies Fable offered do not remove it: turning the 16-tap disk per
 * fragment by a world-locked angle gives the same image to the eye (a 16-tap
 * Vogel disk is already nearly isotropic, so its turn changes nothing a bead
 * is made of), and a 4×4 bilinear grid at the same width has the same bead
 * energy as the disk. What removes a bead is a wider kernel — it estimates the
 * edge from more texel centres — and a wider kernel alone is a softer shadow.
 * So the ground takes the disk **`edgeWiden` (1.6) × wider** and restores the
 * edge's contrast with a smoothstep whose slope at ½ is 1.6: the high-pass
 * bead ripple of the ½ isoline falls from 0.071 to 0.041 texels (−42 %), and
 * the 20–80 % penumbra is 1.05 texels against 1.12 (a touch crisper, not
 * softer). In the game, the residential rider shadow's left edge deviates
 * 0.47 px from its 9-row mean, against 0.72 (U3) and 0.64 (High). No noise,
 * so it holds still in motion; the same 16 fetches. A
 * penumbra's own light is traded: a shadow narrower than about 1.5 texels
 * (4 cm — a wire, a thin rail) reads lighter than before, since the wider
 * disk never sees it whole. The planted `nearRadius 0` is still a hard
 * stair-step (radius 0 is one bilinear compare, and the curve only sharpens it).
 */
const NEAR_FILTER_GLSL = /* glsl */ `
	// ( x, y ) in the unit disk, z the tap's weight (the weights sum to 1).
	const vec3 ultraDisk[ ${DISK_TAPS.length} ] = vec3[ ${DISK_TAPS.length} ](
		${DISK_TAPS.map(([x, y, w]) => `vec3( ${glslFloat(x)}, ${glslFloat(y)}, ${glslFloat(w, 8)} )`).join(',\n\t\t')}
	);
	// The weighted sum of the disk's bilinear compares, \`radius\` texels out.
	float ultraDiskShadow( sampler2DShadow map, const in vec3 coord, const in vec2 size, const in float radius ) {
		vec2 ultraScale = radius / size;
		float sum = 0.0;
		for ( int i = 0; i < ${DISK_TAPS.length}; i ++ ) {
			sum += ultraDisk[ i ].z * texture( map, vec3( coord.xy + ultraDisk[ i ].xy * ultraScale, coord.z ) );
		}
		return sum;
	}
	// The edge reconstruction (ultraMaterials.ts, NEAR_FILTER_GLSL): the disk
	// ultraEdgeWiden x wider, its edge contrast restored by this curve.
	const float ultraEdgeWiden = ${glslFloat(Math.max(1, ULTRA.nearFilter.edgeWiden))};
	float ultraEdgeSharpen( const in float lit ) {
${edgeSharpenGlsl()}
	}
	// The near map at \`radius\` texels (the rig's live PCF radius), edge reconstructed.
	float ultraNearEdgeShadow( sampler2DShadow map, const in vec3 coord, const in vec2 size, const in float radius ) {
		return ultraEdgeSharpen( ultraDiskShadow( map, coord, size, radius * ultraEdgeWiden ) );
	}
`;

/**
 * The near map's filter as GLSL (final wave, P-LT): the fixed disk, the edge
 * reconstruction and `ultraNearEdgeShadow( map, coord, size, radius )`, for a
 * patch outside the Ultra families that samples the near map — the rider,
 * wheel and cop materials — so their self-shadow is filtered exactly as the
 * ground under them. Declare it once in the fragment (after `#include
 * <common>`, outside any function), and in `shadowmap_pars_fragment` put
 * `if ( frustumTest ) shadow = ultraNearEdgeShadow( shadowMap, shadowCoord.xyz,
 * shadowMapSize, shadowRadius );` just before the PCF `getShadow`'s first
 * `return mix( 1.0, shadow, shadowIntensity );`. Never inside an Ultra family
 * material: those declare it themselves.
 */
export function ultraNearFilterGlsl(): string {
  return NEAR_FILTER_GLSL;
}

/**
 * A28: the share of the far-caster test's disk (twice the screen kernel's
 * reach) that must see a far caster before the ground's screen kernel is
 * whole — small, so the kernel is whole across the widened penumbra's outer
 * half, where only a sliver of the reach is in the far caster's shade.
 */
const GROUND_KERNEL_FAR_CASTER_SHARE = 0.2;

/**
 * The ground's filter (`ultraGroundShadow`) as U5 shipped it and A29 ships it
 * again: the edge-reconstructed disk at the rig's own radius out to the
 * ramp's start, by its end the plain disk at the far spread — no screen
 * kernel, no far-caster disk.
 */
const GROUND_FILTER_PLAIN = /* glsl */ `
	// The ground's near map here: the edge-reconstructed disk at the rig's own
	// radius out to the ramp's start; by its end the plain disk at the far
	// spread, by view distance. Written as lit + (sharp - lit) x near share, so
	// a fully lit (or fully shaded) point is exactly 1 (or 0) all the way out.
	float ultraGroundShadow( sampler2DShadow map, const in vec3 coord, const in vec2 size, const in float nearRadius ) {
		float ultraRamp = smoothstep( ultraGroundShadowRamp.x, ultraGroundShadowRamp.y, length( vViewPosition ) );
		float ultraNear = nearRadius * ultraEdgeWiden;
		float ultraLit = ultraDiskShadow( map, coord, size, mix( ultraNear, max( ultraNear, ultraGroundShadowSpread ), ultraRamp ) );
		return ultraLit + ( ultraEdgeSharpen( ultraLit ) - ultraLit ) * ( 1.0 - ultraRamp );
	}
`;

/**
 * The same filter with A28's screen kernel (Trade 2): the kernel's globals,
 * the disk offset by it, and the PCSS far-caster test that gates it. Compiled
 * only into a program carrying `ULTRA_GROUND_SCREEN_KERNEL` (A29; none ships).
 */
const GROUND_FILTER_KERNEL = /* glsl */ `
	// A28 (Trade 2): the ground's screen kernel, written in main() before the
	// light loop (GROUND_SCREEN_KERNEL): the near map's UV per unit of the disk
	// (a disk of the kernel's radius in screen pixels, mapped through the
	// fragment's own derivatives), and the same disk's two axes in world metres
	// for the lift's lean (ultraFarShadeAround). Zero inside the ramp's start.
	mat2 ultraGroundScreenKernel = mat2( 0.0 );
	vec3 ultraGroundKernelX = vec3( 0.0 );
	vec3 ultraGroundKernelY = vec3( 0.0 );
	float ultraGroundKernelOn = 0.0;
	// ULTRA.nearFilter.groundScreenCasterMetres up the sun ray, in the near
	// rig's depth units (written per frame with the sun).
	uniform float ultraGroundPenumbraDepth;
	// The disk's weighted compares, \`radius\` texels out in light space plus the
	// screen kernel x \`kernel\`: the same 16 taps.
	float ultraGroundDiskShadow( sampler2DShadow map, const in vec3 coord, const in vec2 size, const in float radius, const in float kernel ) {
		vec2 ultraScale = radius / size;
		mat2 ultraScreen = ultraGroundScreenKernel * kernel;
		float sum = 0.0;
		for ( int i = 0; i < ${DISK_TAPS.length}; i ++ ) {
			vec2 ultraTap = ultraDisk[ i ].xy;
			sum += ultraDisk[ i ].z * texture( map, vec3( coord.xy + ultraTap * ultraScale + ultraScreen * ultraTap, coord.z ) );
		}
		return sum;
	}
	// The ground's near map here: the edge-reconstructed disk at the rig's own
	// radius out to the ramp's start; by its end the plain disk at the far
	// spread, by view distance, and past the screen ramp's start the screen
	// kernel as well where a far caster shades any of its reach (A28: the
	// same disk, twice as wide, compared ultraGroundPenumbraDepth nearer the
	// light - a PCSS blocker test). Written as lit + (sharp - lit) x near
	// share, so a fully lit (or fully shaded) point is exactly 1 (or 0) all
	// the way out.
	float ultraGroundShadow( sampler2DShadow map, const in vec3 coord, const in vec2 size, const in float nearRadius ) {
		float ultraRamp = smoothstep( ultraGroundShadowRamp.x, ultraGroundShadowRamp.y, length( vViewPosition ) );
		float ultraNear = nearRadius * ultraEdgeWiden;
		float ultraRadius = mix( ultraNear, max( ultraNear, ultraGroundShadowSpread ), ultraRamp );
		float ultraKernel = 0.0;
		if ( ultraGroundKernelOn > 0.5 ) {
			float ultraFarCaster = 1.0 - ultraGroundDiskShadow( map, vec3( coord.xy, coord.z - ultraGroundPenumbraDepth ), size, ultraRadius, 2.0 );
			ultraKernel = smoothstep( 0.0, ${glslFloat(GROUND_KERNEL_FAR_CASTER_SHARE, 4)}, ultraFarCaster );
		}
		float ultraLit = ultraGroundDiskShadow( map, coord, size, ultraRadius, ultraKernel );
		return ultraLit + ( ultraEdgeSharpen( ultraLit ) - ultraLit ) * ( 1.0 - ultraRamp );
	}
`;

/**
 * The facades' disk parts (unchanged by A28 and A29).
 */
const FACADE_DISK_DECLARATIONS = /* glsl */ `
#ifdef ULTRA_FACADE_RECEIVE
	uniform float ultraFacadeReceiveBias;
	uniform float ultraFacadeCasterDepth;
	// The shade here of casters more than ULTRA.facade.liftCasterMetres up the
	// sun ray, as getShadow last found it (FACADE_CAST_LIFT reads it).
	float ultraFacadeTallShade = 0.0;
	uniform vec2 ultraFacadeNlFade;
	uniform float ultraFacadeSpreadScale;
	uniform float ultraFacadeGrazeSpread;
	// The facade's disk radius: ultraFacadeSpreadScale x the rig's on a face
	// the sun meets at N.L >= 0.5, widening as the sun grazes, where a
	// texel's stair step stretches ~1/N.L down the wall. Final wave (P-LT):
	// past ULTRA.facade.farRampMetres of view distance it grows as the
	// ground's does, to farSpreadTexels at the shipped radius (a multiple of
	// the live radius, so the planted radius 0 stays hard); nearer, exactly
	// Wave 4's.
	float ultraFacadeShadowRadius( const in float radius ) {
		float ultraNL = saturate( dot( ultraShadeNormal, ultraSunDirection ) );
		float ultraNear = radius * ( ultraFacadeSpreadScale + ultraFacadeGrazeSpread * ( 1.0 - smoothstep( 0.0, 0.5, ultraNL ) ) );
		float ultraFar = max( ultraNear, radius * ${glslFloat(ULTRA.facade.farSpreadTexels / ULTRA.nearRadius)} );
		return mix( ultraNear, ultraFar, smoothstep( ${glslFloat(ULTRA.facade.farRampMetres[0])}, ${glslFloat(ULTRA.facade.farRampMetres[1])}, length( vViewPosition ) ) );
	}
#endif
`;

/**
 * The fixed-disk near-map filter the ground, its paint and the facades take
 * (Wave 4, R-L; gauntlet round 2 items 2b, 5 and 6), declared only for them.
 *
 * - **Ground and paint** (`ULTRA_GROUND`, the ground family's lighting
 *   define, and `ULTRA_GROUND_SHADOW` on markings, pothole ground and water):
 *   the edge-reconstructed disk (`NEAR_FILTER_GLSL`) at the rig's live PCF
 *   radius (`nearRadius`) near the camera; across `groundRampMetres` of view
 *   distance the radius grows to `ULTRA.nearFilter.groundFarSpreadTexels` and
 *   the reconstruction hands over to the plain disk, so a distant cast-shade
 *   edge softens as fog greys it (Wave 4) and the near edge has no beads
 *   (final wave). A29: U5's filter (`GROUND_FILTER_PLAIN`) unless
 *   `screenKernel` — only a material carrying `ULTRA_GROUND_SCREEN_KERNEL`,
 *   and none ships — which compiles A28's (`GROUND_FILTER_KERNEL`). Without
 *   it the text holds none of the kernel's globals, its far-caster disk or
 *   its uniform.
 * - **Facades** (`ULTRA_FACADE_RECEIVE`): the plain disk at the live radius ×
 *   the facade spread, with the receive bias and the grazing fade
 *   (`NEAR_FADE_RETURN`). Already 2.5–3.5 texels wide, so it has no beads to
 *   remove, and it is left exactly as Wave 4 measured it (the residential and
 *   steeple combing).
 */
function diskShadowDeclarations(screenKernel: boolean): string {
  return /* glsl */ `
#if defined( ULTRA_GROUND ) || defined( ULTRA_GROUND_SHADOW ) || defined( ULTRA_FACADE_RECEIVE )
${NEAR_FILTER_GLSL}
#endif
#if defined( ULTRA_GROUND ) || defined( ULTRA_GROUND_SHADOW )
	uniform float ultraGroundShadowSpread;
	uniform vec2 ultraGroundShadowRamp;${screenKernel ? GROUND_FILTER_KERNEL : GROUND_FILTER_PLAIN}#endif${FACADE_DISK_DECLARATIONS}`;
}

/**
 * Fragment declarations, after `#include <common>`: without the ground's
 * screen kernel (index 0, every shipped program since A29) and with it (1).
 */
const FRAGMENT_DECLARATIONS = [false, true].map((screenKernel) => /* glsl */ `
// ---- M39 Ultra (render/ultra/ultraMaterials.ts) ----
uniform float ultraNearFade;
uniform float ultraSpecAA;
uniform float ultraRoughnessFloor;
uniform float ultraFillSaturation;
uniform float ultraFillSunSaturation;
uniform float ultraFillHazeTint;
varying vec3 vUltraWorld;
#ifdef ULTRA_VEGETATION_WOOD
  varying float vUltraVegetationWood;
#endif
float ultraLeafResponse() {
  #ifdef ULTRA_VEGETATION_WOOD
    return 1.0 - vUltraVegetationWood;
  #else
    return 1.0;
  #endif
}

// 1 inside the unit box, easing to 0 across the outer \`band\` (UV units).
float ultraEdgeCoverage( const in vec2 coord, const in float band ) {
	float edge = min( min( coord.x, 1.0 - coord.x ), min( coord.y, 1.0 - coord.y ) );
	return band > 0.0 ? smoothstep( 0.0, band, edge ) : step( 0.0, edge );
}

// A line of \`width\` metres at \`dist\` metres, box-filtered over a pixel
// \`footprint\` metres wide: its coverage of the pixel, never wider than it is.
float ultraLineCoverage( const in float dist, const in float width, const in float footprint ) {
	float w = max( footprint, 1e-5 );
	float wide = max( width, w );
	return saturate( ( 0.5 * wide - dist ) / w + 0.5 ) * ( width / wide );
}

#if defined( ULTRA_FAR ) || defined( ULTRA_FOLIAGE ) || defined( ULTRA_FACADE_RECEIVE )
	uniform vec3 ultraSunDirection;
#endif

// The receiver's world normal for the far lookup, written in main() just
// before the direct-light loop (getShadow has no normal of its own).
vec3 ultraShadeNormal = vec3( 0.0, 1.0, 0.0 );

// The sun's shadow visibility here, as the patched getShadow last returned
// it (1 lit, 0 in shade; 1 when this material casts no shadow lookup). The
// fill's hue reads it after the light loop (FILL_CHROMA).
float ultraSunVisibility = 1.0;

#ifdef ULTRA_FAR
	uniform sampler2DShadow ultraFarMap;
	uniform mat4 ultraFarMatrix;
	uniform float ultraFarEnabled;
	uniform float ultraFarNormalOffset;
	uniform float ultraFarEdge;
	uniform float ultraFarSpread;
#endif

// The static far map's visibility here: 1 lit, 0 in a caster's shade.
// Outside the far box, or with no far map, it is 1, which leaves getShadow
// exactly the near map's.
//
// ultraFarVisibilityToward( m ) asks the same of the point m metres up the
// sun ray from here (Wave 4, R-L; the helper round 2's item 5 names): the
// same far-map texel, compared m metres nearer the sun, so it answers "does
// a static caster stand more than m metres above this point along the ray"
// (a building or a tree, not a kicker). At m = 0 it is ultraFarVisibility().
float ultraFarVisibilityToward( const in float towardSun ) {
	#ifdef ULTRA_FAR
		if ( ultraFarEnabled < 0.5 ) return 1.0;
		vec4 farCoord = ultraFarMatrix * vec4( vUltraWorld + ultraShadeNormal * ultraFarNormalOffset + ultraSunDirection * towardSun, 1.0 );
		// Four bilinear compare fetches (16 hardware taps) on a square
		// ultraFarSpread texels either side: a tent about three texels wide,
		// so the world-fitted map's 0.4-0.7 m texels do not stair-step. Explicit
		// LOD 0 because the caller may skip this call per fragment (the map
		// has no mips, so no derivative is wanted).
		vec2 farStep = ultraFarSpread / vec2( textureSize( ultraFarMap, 0 ) );
		float farZ = min( farCoord.z, 1.0 );
		float lit = 0.25 * (
			textureLod( ultraFarMap, vec3( farCoord.xy + vec2( - farStep.x, - farStep.y ), farZ ), 0.0 ) +
			textureLod( ultraFarMap, vec3( farCoord.xy + vec2( farStep.x, - farStep.y ), farZ ), 0.0 ) +
			textureLod( ultraFarMap, vec3( farCoord.xy + vec2( - farStep.x, farStep.y ), farZ ), 0.0 ) +
			textureLod( ultraFarMap, vec3( farCoord.xy + vec2( farStep.x, farStep.y ), farZ ), 0.0 ) );
		return mix( 1.0, lit, ultraEdgeCoverage( farCoord.xy, ultraFarEdge ) );
	#else
		return 1.0;
	#endif
}
float ultraFarVisibility() {
	return ultraFarVisibilityToward( 0.0 );
}
${diskShadowDeclarations(screenKernel)}
#if defined( ULTRA_GROUND ) || defined( ULTRA_CAVITY )
	uniform float ultraGroundSpec;
#endif
#if defined( ULTRA_AO ) || defined( ULTRA_BASE_AO )
	uniform float ultraContactStrength;
	uniform float ultraContactDirect;
	uniform float ultraContactFloor;
#endif
#ifdef ULTRA_AO
	varying float vUltraAo;
#endif
#ifdef ULTRA_BASE_AO
	uniform float ultraBaseAoFloor;
	uniform float ultraBaseAoMetres;
	varying float vUltraBaseHeight;
#endif
#ifdef ULTRA_BRICK
	uniform float ultraBrickModule;
	uniform float ultraBrickJoint;
	uniform float ultraBrickDarken;
	uniform vec2 ultraBrickFade;
#endif
#ifdef ULTRA_TILES
	uniform float ultraTilePitch;
	uniform float ultraTileTone;
	uniform float ultraTileFade;
#endif
#ifdef ULTRA_GLASS
	uniform float ultraGlassSpec;
	uniform float ultraGlassFloor;
	uniform float ultraGlassGroundReflect;
#endif
#ifdef ULTRA_FOLIAGE
	uniform float ultraFoliageWrap;
	uniform float ultraFoliageTransmission;
	uniform float ultraFoliageTransmissionPower;
	uniform float ultraFoliageSkyFill;
	uniform float ultraFoliageShadowSpread;
	uniform float ultraFoliageReceiveBias;

	// Foliage's own near-map filter (Wave 3, R-L): a fixed 3x3 tent of
	// hardware-PCF fetches ultraFoliageShadowSpread texels apart. three's PCF
	// is five taps turned per pixel by interleaved gradient noise; on the
	// serrated conifer tiers that dither drew blotchy, crawling teeth (round 1).
	// A fixed tent is noise-free and wider, so a tier's shade under the one
	// above is one soft band that holds still in motion.
	float ultraFoliageShadow( sampler2DShadow map, const in vec3 coord, const in vec2 size ) {
		vec2 stepUv = ultraFoliageShadowSpread / size;
		float sum = 0.0;
		for ( int j = - 1; j <= 1; j ++ ) {
			for ( int i = - 1; i <= 1; i ++ ) {
				float weight = ( 2.0 - abs( float( i ) ) ) * ( 2.0 - abs( float( j ) ) );
				sum += weight * texture( map, vec3( coord.xy + vec2( float( i ), float( j ) ) * stepUv, coord.z ) );
			}
		}
		return sum / 16.0;
	}
#endif
// The share of the environment this material takes (Wave 3, R-L): 1 on
// everything but the hazard-read families, whose faces must keep High's
// contrast against the ground (A11's obstacle-face gate). Per material.
uniform float ultraEnvResponse;
`);

/**
 * The near map's edge fade and the far map, inside the PCF `getShadow`
 * (§3.2, §3.4): the first `return mix( 1.0, shadow, shadowIntensity );` in
 * `shadowmap_pars_fragment` — the PCF variant, which is the one this renderer
 * compiles (`PCFShadowMap`).
 *
 * **One linear crossfade, `mix(far, near, nearCoverage)`.** Inside the near
 * box the near map alone rules; across its outer 12 % the near map fades out
 * *as* the far map fades in; beyond it (or past its far plane) the far map
 * alone. §3.4's formula applied the near fade here and the far term after the
 * light loop as `direct *= mix(far, 1, c)`; composed, the two give a point
 * both maps agree is in shade `c·(1 − c)` of the sun — a stripe up to 25 %
 * lit through continuous building shade in the middle of the band, the seam
 * T12's own acceptance check forbids. Blending the two visibilities before
 * they touch the light has no such dip and darkens nothing twice, and because
 * it multiplies `directLight.color` it shades the foliage transmission and
 * the specular exactly as it shades the diffuse.
 *
 * With no far map `ultraFarVisibility()` is 1, and with `ultraNearFade` 0
 * (an ordinary rig) the coverage is 1 inside the box and 0 outside, where
 * three's own shadow is 1 anyway — so the function is exactly three's.
 *
 * **Foliage (Wave 3, R-L)** replaces three's five dithered taps with its own
 * fixed tent (`ultraFoliageShadow`) and a *receive* bias along the light,
 * `ULTRA.foliage.receiveBiasMetres` in the near rig's depth units: a crown or
 * tier is not shadowed by its own surface within that distance of it — the
 * serration teeth and facet creases that speckled — while the tier above
 * (≥ 0.9 m away), the next tree and every building still shade it.
 *
 * **The ground and what lies on it (Wave 4, R-L; round 2 items 2b and 5)** —
 * `ULTRA_GROUND` (the ground family's lighting define) and
 * `ULTRA_GROUND_SHADOW` (road paint, pothole ground, water) — replace the
 * five dithered taps with a fixed 16-tap disk (`ultraDiskShadow`), radius the
 * rig's live `nearRadius` near the camera, growing to
 * `ULTRA.nearFilter.groundFarSpreadTexels` across `groundRampMetres` of view
 * distance: no per-pixel noise in a penumbra (the Switchback kicker's "wavy,
 * noisy" edge), and a distant cast-shade edge softens with the distance, so
 * the industrial slab's outline stops reading as a cut-out. Near the camera
 * the disk is `edgeWiden` × wider with its contrast restored
 * (`ultraGroundShadow`, final wave: the rider shadow's texel beads).
 *
 * **Facades (Wave 4, R-L; round 2 item 6)** — `ULTRA_FACADE_RECEIVE` — take
 * the same disk at the rig's radius, widened by `ULTRA.facade.grazeSpread` as
 * N·L falls under 0.5 (a texel's stair step stretches ≈ 1/(N·L) down a wall
 * the sun grazes), a receive bias along the light (`receiveBiasMetres`, under
 * every real facade shadow's distance: the 0.25 m soffit, the 0.08 m groove),
 * and the grazing fade: the sun eases to form shade over `nlFade` of N·L.
 * With the vertex stage's slope-scaled normal offset, that is the foliage's
 * receive treatment in facade terms; the shopfront soffit's penumbra on its
 * recessed band no longer combs. Caps, gables, furniture and blocks keep
 * three's taps.
 */
const NEAR_FADE_RETURN = /* glsl */ `#if defined( ULTRA_FOLIAGE )
				if ( frustumTest && ultraLeafResponse() > 0.5 ) shadow = ultraFoliageShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFoliageReceiveBias ), shadowMapSize );
			#elif defined( ULTRA_GROUND ) || defined( ULTRA_GROUND_SHADOW )
				if ( frustumTest ) shadow = ultraGroundShadow( shadowMap, shadowCoord.xyz, shadowMapSize, shadowRadius );
			#elif defined( ULTRA_FACADE_RECEIVE )
				if ( frustumTest ) shadow = ultraDiskShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFacadeReceiveBias ), shadowMapSize, ultraFacadeShadowRadius( shadowRadius ) );
			#endif
			#ifdef ULTRA_FACADE_LIFT
				// The shade of casters more than ultraFacadeCasterDepth up the sun
				// ray (FACADE_CAST_LIFT): the same disk, compared that far nearer
				// the sun, so the facade's own relief is not counted.
				float ultraTallNear = 0.0;
				if ( frustumTest && shadow < 1.0 ) ultraTallNear = 1.0 - ultraDiskShadow( shadowMap, vec3( shadowCoord.xy, shadowCoord.z - ultraFacadeCasterDepth ), shadowMapSize, ultraFacadeShadowRadius( shadowRadius ) );
			#endif
			float ultraNearCover = ultraEdgeCoverage( shadowCoord.xy, ultraNearFade ) * step( shadowCoord.z, 1.0 );
			float ultraFarLit = ultraNearCover < 1.0 ? ultraFarVisibility() : 1.0;
			ultraSunVisibility = mix( 1.0, mix( ultraFarLit, shadow, ultraNearCover ), shadowIntensity );
			#ifdef ULTRA_FACADE_RECEIVE
				ultraSunVisibility *= smoothstep( ultraFacadeNlFade.x, ultraFacadeNlFade.y, dot( ultraShadeNormal, ultraSunDirection ) );
			#endif
			#ifdef ULTRA_FACADE_LIFT
				ultraFacadeTallShade = mix( 1.0 - ultraFarLit, ultraTallNear, ultraNearCover ) * shadowIntensity;
			#endif
			return ultraSunVisibility;`;

/**
 * Foliage's direct term, in place of `RE_Direct_Physical`'s diffuse line
 * (§3.3): wrap diffuse, and back-light transmission
 * `0.22·directLight.color·pow(sat(dot(V, −L)), p)·diffuse`, with p
 * `ULTRA.foliage.transmissionPower` (4 at W4, 2 from the pre-R1 calibration). Both use
 * `directLight.color`, which three has already multiplied by the shadow, so
 * a tree in building shade gets neither — there is no shadow floor (judge
 * 3). Specular is untouched. Other families keep three's line verbatim.
 */
const FOLIAGE_DIRECT = /* glsl */ `
#ifdef ULTRA_FOLIAGE
	float ultraWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + ultraFoliageWrap ) / ( 1.0 + ultraFoliageWrap ) );
	reflectedLight.directDiffuse += mix( saturate(dot(geometryNormal, directLight.direction)), ultraWrapNL, ultraLeafResponse() ) * directLight.color * BRDF_Lambert( material.diffuseContribution );
	reflectedLight.directDiffuse += ultraLeafResponse() * ultraFoliageTransmission * directLight.color
		* pow( saturate( dot( geometryViewDir, - directLight.direction ) ), ultraFoliageTransmissionPower ) * material.diffuseContribution;
#else
	${A.directDiffuse}
#endif
`;

/**
 * Before `#include <lights_physical_fragment>`: the albedo edits, where
 * `diffuseColor` is final and both normals exist.
 */
const ALBEDO_EDITS = /* glsl */ `
#ifdef ULTRA_VEGETATION_WOOD
  roughnessFactor = mix(roughnessFactor, 0.95, vUltraVegetationWood);
#endif
#ifdef ULTRA_BRICK
	{
		// Running bond on the 2.8 m module, in world XZ: the lattice
		// \`groundNoise.pavingShade\` tones, so each joint bounds a slab.
		float ultraFootprint = length( fwidth( vUltraWorld.xz ) );
		float ultraRow = floor( vUltraWorld.z / ultraBrickModule );
		float ultraU = vUltraWorld.x / ultraBrickModule + ( mod( ultraRow, 2.0 ) < 0.5 ? 0.0 : 0.5 );
		float ultraV = vUltraWorld.z / ultraBrickModule;
		float ultraDx = ( 0.5 - abs( fract( ultraU ) - 0.5 ) ) * ultraBrickModule;
		float ultraDz = ( 0.5 - abs( fract( ultraV ) - 0.5 ) ) * ultraBrickModule;
		float ultraJoint = max(
			ultraLineCoverage( ultraDx, ultraBrickJoint, ultraFootprint ),
			ultraLineCoverage( ultraDz, ultraBrickJoint, ultraFootprint ) );
		ultraJoint *= 1.0 - smoothstep( ultraBrickFade.x, ultraBrickFade.y, ultraFootprint );
		// Final wave (P-GR): not under the wheel, where joints stream across the screen.
		ultraJoint *= smoothstep( ${glslFloat(ULTRA.brickJoints.nearFadeFootprintMetres[0])}, ${glslFloat(ULTRA.brickJoints.nearFadeFootprintMetres[1])}, ultraFootprint );
		diffuseColor.rgb *= 1.0 - ultraBrickDarken * ultraJoint;
	}
#endif
#ifdef ULTRA_TILES
	{
		// Tile courses on a roof's slopes (M39 section 4): a world-metric +/- tone stripe
		// along the slope, band-limited (a cosine) and faded by fwidth and by
		// distance, so it is a near-field cue that can never shimmer.
		vec3 ultraN = transformNormalByInverseViewMatrix( nonPerturbedNormal, viewMatrix );
		float ultraSlope = smoothstep( 0.05, 0.2, ultraN.y );
		float ultraSinPitch = max( sqrt( max( 1.0 - ultraN.y * ultraN.y, 0.0 ) ), 0.2 );
		float ultraAlong = vUltraWorld.y / ultraSinPitch / ultraTilePitch;
		float ultraFade = ( 1.0 - smoothstep( 0.2, 0.45, fwidth( ultraAlong ) ) )
			* ( 1.0 - smoothstep( 0.6 * ultraTileFade, ultraTileFade, length( vViewPosition ) ) );
		diffuseColor.rgb *= 1.0 + ultraTileTone * cos( 6.28318530718 * ultraAlong ) * ultraSlope * ultraFade;
	}
#endif
`;

/**
 * After `#include <lights_physical_fragment>`: the roughness floors (§2.2) —
 * the per-material floor (street metal 0.35), the glass floor on glass
 * texels, and the geometric specular-AA floor `k·|fwidth(n)|` against
 * sparkle on the new glossy surfaces at 60–120 m. They only ever raise
 * roughness.
 */
const ROUGHNESS_FLOORS = /* glsl */ `
{
	float ultraFloor = ultraRoughnessFloor;
	#if defined( ULTRA_GLASS ) && defined( USE_ROUGHNESSMAP )
		ultraFloor = mix( ultraFloor, max( ultraFloor, ultraGlassFloor ), texelRoughness.a );
	#endif
	material.roughness = min( max( material.roughness, max( ultraFloor, ultraSpecAA * length( fwidth( normal ) ) ) ), 1.0 );
}
`;

/**
 * Before `#include <lights_fragment_begin>`: the receiver's world normal for
 * the far map's lookup, which `getShadow` (called inside the light loop) has
 * no argument for. Foliage flips it toward the sun on faces that look away,
 * as its near-map lookup does in the vertex stage (`FOLIAGE_SHADOW_NORMAL`).
 */
const SHADE_NORMAL = /* glsl */ `
ultraShadeNormal = transformNormalByInverseViewMatrix( nonPerturbedNormal, viewMatrix );
#ifdef ULTRA_FOLIAGE
	if (ultraLeafResponse() > 0.5) ultraShadeNormal *= dot( ultraShadeNormal, ultraSunDirection ) < 0.0 ? - 1.0 : 1.0;
#endif
`;

/**
 * A28, Trade 2 (the industrial crest slab's hard across-road edges; A20's
 * "cannot be softened in light space"). Before `#include
 * <lights_fragment_begin>`, in uniform control flow, on the ground and what
 * lies on it only: the ground filter's **screen kernel**.
 *
 * **A29 (round 5): off, and compiled out.** Round 5 read the graded slab as
 * "a floating smudge with no caster" (five of five) and preferred U5's; this
 * block, the filter's far-caster disk (`GROUND_FILTER_KERNEL`) and the lift's
 * lean diagonals (`ultraGroundDetail.ts`) go only into a program carrying
 * `ULTRA_GROUND_SCREEN_KERNEL`, which the patch adds only while
 * `ULTRA.nearFilter.groundScreenKernel` is true (it is false). The code
 * stays, with its tests, for the record and the owner.
 *
 * **Why a light-space kernel cannot do it.** The ground disk's radius grows
 * with view distance in near-map texels, i.e. isotropically in metres. At a
 * grazing view one screen pixel spans far more ground along the view than
 * across it — on the crest at 30 m about 0.2 m of depth against 0.03 m across
 * the road, 7:1 — so a penumbra wide enough to grade the across-road edges
 * over a few pixels would smear the along-road edges over dozens.
 *
 * **What this does instead.** It defines the extra blur on the screen: a disk
 * of `ULTRA.nearFilter.groundScreenSpreadDegrees` angular radius (converted to
 * pixels by this fragment's own ray-direction derivative, so it is the same
 * angle at any drawing-buffer size), eased in over `groundScreenRampMetres`
 * of view distance, and mapped into the near map through the fragment's
 * screen derivatives of its shadow coordinate — the Jacobian of screen pixels
 * to light UV. `ultraGroundDiskShadow` adds it to each of its 16 taps, so an
 * edge at any angle to the camera is graded over the same few pixels; the
 * world-metre axes of the same disk go to the lift's lean
 * (`ultraFarShadeAround`, `ultraGroundDetail.ts`), so the lifted shade covers
 * the whole widened penumbra and draws no unlifted rim. Three bounds:
 *
 * - **Distance.** Nothing inside the ramp's start (the rider's shadow, every
 *   near edge): the kernel is exactly zero there.
 * - **Width.** Never more than `groundScreenMaxMetres` of ground along the
 *   pixel's longer axis, so a far strip of shade seen edge-on keeps its shape
 *   (at 45 m on the flat a pixel spans about a metre; uncapped, the canyon's
 *   6-pixel far strips washed to 0.84 × sunlit).
 * - **Occluder distance** (`ultraGroundShadow`): the kernel applies only
 *   where the near map finds a caster more than `groundScreenCasterMetres`
 *   above the receiver along the ray — a PCSS blocker test, the same disk
 *   twice as wide compared that much nearer the light. A building's shade
 *   far from its walls is graded; a tree's (crowns under 10 m), a lamp's, an
 *   obstacle's keep today's edge, so tree shade still grounds its tree
 *   (Trade 3: ungated, the slice's 21 m tree shadows blurred to 0.49 × the
 *   sunlit grass with the lift's grass share at 0.4).
 */
function groundScreenKernelGlsl(): string {
  const f = ULTRA.nearFilter;
  const radians = (f.groundScreenSpreadDegrees * Math.PI) / 180;
  return /* glsl */ `
#if ( defined( ULTRA_GROUND ) || defined( ULTRA_GROUND_SHADOW ) ) && defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
{
	// The angle a pixel subtends here: the view ray's own change per pixel.
	vec3 ultraRay = normalize( vViewPosition );
	float ultraPixelAngle = 0.5 * ( length( dFdx( ultraRay ) ) + length( dFdy( ultraRay ) ) );
	// ...and never more than groundScreenMaxMetres of ground along the pixel's
	// longer axis: a far strip seen edge-on (about a metre a pixel at 45 m on
	// the flat) keeps its shape.
	vec3 ultraFootX = dFdx( vUltraWorld );
	vec3 ultraFootY = dFdy( vUltraWorld );
	float ultraFootprint = max( length( ultraFootX ), length( ultraFootY ) );
	float ultraScreenRadius = min( ${glslFloat(radians, 8)} / max( ultraPixelAngle, 1e-7 ), ${glslFloat(f.groundScreenMaxMetres)} / max( ultraFootprint, 1e-4 ) )
		* smoothstep( ${glslFloat(f.groundScreenRampMetres[0])}, ${glslFloat(f.groundScreenRampMetres[1])}, length( vViewPosition ) );
	ultraGroundScreenKernel = mat2( dFdx( vDirectionalShadowCoord[ 0 ].xy ), dFdy( vDirectionalShadowCoord[ 0 ].xy ) ) * ultraScreenRadius;
	ultraGroundKernelX = ultraFootX * ultraScreenRadius;
	ultraGroundKernelY = ultraFootY * ultraScreenRadius;
	ultraGroundKernelOn = ultraScreenRadius > 0.0 ? 1.0 : 0.0;
}
#endif
`;
}
const GROUND_SCREEN_KERNEL = groundScreenKernelGlsl();

/**
 * Fable finding 8 (A28): the ground filter's near-map fetches per fragment,
 * as `diskShadowDeclarations` compiles them — each one bilinear hardware
 * depth compare. `disk` wherever the ground filter runs (the ground, its
 * paint, pothole ground and water, inside the near box); `farCaster` more
 * where the screen kernel is compiled (`ULTRA_GROUND_SCREEN_KERNEL`, which no
 * shipped program carries since A29) and on (past
 * `ULTRA.nearFilter.groundScreenRampMetres[0]`): its PCSS far-caster test,
 * the same disk again. The Ultra envelope prices
 * calls, triangles, programs and bytes, never per-fragment work, so
 * `tools/render-cost.mjs` prints this in the Ultra report. Pinned against the
 * compiled GLSL by `ultraMaterials.test.ts`.
 */
export function ultraGroundShadowFetches(): { readonly disk: number; readonly farCaster: number } {
  return { disk: DISK_TAPS.length, farCaster: DISK_TAPS.length };
}

/**
 * After `#include <lights_fragment_maps>`, where `iblIrradiance` — the
 * painted-sky environment's *diffuse* fill — is final (pre-R1 calibration,
 * `M39_ULTRA.md` §U2, "shade is navy").
 *
 * The painted zenith is a deep blue, so a face lit by the sky alone — the
 * whole canyon road once buildings cast — read dark navy. **In shade** the
 * fill is pulled toward its own luminance: it keeps `ULTRA.env.fillSaturation`
 * of its chroma, weighted by the face's sky share `(1 + n·up)/2`, so a
 * down-facing soffit keeps the warm ground bounce whole. The grey it is pulled
 * to leans `fillHazeTint` toward the venue's haze hue — the fog colour, which
 * is `horizonColour` by contract, so nothing is authored per venue: the
 * town's pale haze gives slightly cool shade, Switchback's warm haze a warm
 * fill. The hue is normalised to luminance 1 and every mix is affine, so the
 * fill's luminance — κ's calibration — is unchanged.
 *
 * **In sun** the fill keeps most of its sky hue, as High's hemisphere does: a
 * sunlit face's sun share (the shadow visibility the patched `getShadow` left
 * in `ultraSunVisibility`, times a steep ramp on N·L) moves the kept share to
 * `ULTRA.env.fillSunSaturation`. That is what keeps the sunlit road High's
 * faintly cool grey and sunlit grass and brick High's hue — a neutral fill
 * under a warm sun turned the road beige-neutral and cost the frame its
 * chroma (§8.3 "environment chroma ≥ High") — while the shade, where the fill
 * is all the light there is, stops being blue. Across a penumbra the
 * hue follows the shadow, which is the photographer's white balance, not a
 * seam: the fill is a small share of a sunlit face's light.
 *
 * The specular `radiance` keeps its colour on glossy surfaces — the painted
 * sky on glass, metal, water and the rider. On a rough one (roughness past
 * about 0.7) the reflection is a blur of the same sky as the fill; it keeps
 * the sky's luminance and takes the surface's own hue (Disney's specular
 * tint). High has no environment and reflects nothing, and at F0 0.04 a
 * sky-hued blur had greyed sunlit grass, field and brick and blued the road —
 * measured as frames under High's chroma (§8.3). Foliage then takes
 * `ULTRA.foliage.skyFill` of the fill (sky light through the canopy).
 */
const FILL_CHROMA = /* glsl */ `
#if defined( ULTRA_CAVITY ) && defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
	// A pothole's bowl sees the sky through its opening and nothing else: no
	// horizon, no ground bounce. Its fill is the up-facing face's, whatever
	// its bowl normal says, so the pit stays darker than the rim (the dipole).
	iblIrradiance = getIBLIrradiance( normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) );
#endif
{
	const vec3 ultraLuma = vec3( 0.2126, 0.7152, 0.0722 );
	vec3 ultraHue = vec3( 1.0 );
	#ifdef USE_FOG
		ultraHue = mix( ultraHue, fogColor / max( dot( fogColor, ultraLuma ), 1e-4 ), ultraFillHazeTint );
	#endif
	vec3 ultraFillNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
	float ultraSkyShare = saturate( 0.5 + 0.5 * ultraFillNormal.y );
	float ultraSunShare = 0.0;
	#if NUM_DIR_LIGHTS > 0
		ultraSunShare = ultraSunVisibility * smoothstep( 0.0, 0.25, dot( geometryNormal, directionalLights[ 0 ].direction ) );
	#endif
	float ultraKeep = mix( 1.0, mix( ultraFillSaturation, ultraFillSunSaturation, ultraSunShare ), ultraSkyShare );
	iblIrradiance = mix( dot( iblIrradiance, ultraLuma ) * ultraHue, iblIrradiance, ultraKeep );
	#if defined( RE_IndirectSpecular )
		// A rough surface's reflection is a blur of the same sky, and High
		// (with no environment) reflects nothing at all: at F0 0.04 a sky-hued
		// blur greyed sunlit grass, field and brick and bluer'd the road. So a
		// rough reflection keeps the sky's luminance and takes the surface's own
		// hue (Disney's specular tint): a grey road reflects grey, grass green.
		// Glossy glass, metal and water keep the painted sky's colour.
		float ultraRough = smoothstep( 0.6, 0.85, material.roughness );
		vec3 ultraSurfaceHue = material.diffuseColor / max( dot( material.diffuseColor, ultraLuma ), 1e-4 );
		radiance = mix( radiance, dot( radiance, ultraLuma ) * ultraSurfaceHue, ultraRough );
	#endif
	#ifdef ULTRA_FOLIAGE
		iblIrradiance *= mix(1.0, ultraFoliageSkyFill, ultraLeafResponse());
	#endif
	#if defined( ULTRA_GLASS ) && defined( USE_ROUGHNESSMAP ) && defined( RE_IndirectSpecular )
		// Street-level glazing looks down: its reflection ray points below the
		// horizon, into the environment's lower half: the ground bounce x beta,
		// a lifted warm grey brighter than any real street. At glassSpec that
		// washed the ground-floor panes out (round 1, pair-13). A reflection
		// under the horizon keeps ultraGlassGroundReflect of itself; upper
		// windows, which reflect the sky, are untouched.
		vec3 ultraReflect = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
		float ultraAbove = smoothstep( - 0.25, 0.05, ultraReflect.y );
		radiance *= mix( 1.0, mix( ultraGlassGroundReflect, 1.0, ultraAbove ), texelRoughness.a );
	#endif
	// The hazard-read families take less of the environment (per material, 1
	// elsewhere): a bollard or a tyre stack keeps High's dark face against the
	// ground it stands on.
	iblIrradiance *= ultraEnvResponse;
	#if defined( RE_IndirectSpecular )
		radiance *= ultraEnvResponse;
	#endif
}
`;

/**
 * The facade's cast-shade lift (final wave, P-LT; round 3 item 4, the slice's
 * facade-base "lump", 2 critics).
 *
 * **What the lump is.** The slice's street tree stands a few metres in front
 * of the right-hand block's sunlit plinth, and the sun throws the lower edge
 * of its crown onto the plinth: a peaked, crown-shaped patch of cast shade,
 * luma 39–47 on a plinth of 108 (0.44). High never draws it — the wall is
 * outside High's ±30 m map, and `u3-forms` (High's rig) has none — so it is
 * the near cascade's reach showing a real shadow. It reads as an object
 * because it is darker than any shade around it: the grass under the same
 * crown takes the ground's static-shade lift (A14, about 0.6–0.7 of sun), and
 * a facade in form shade reads 69 on this view, but a *sun-facing* facade in
 * cast shade kept only its indirect light, and near the base the metric base
 * AO takes a further quarter of that.
 *
 * **The lift — a floor at form shade.** Where a sun-facing facade
 * (`smoothstep(0, 0.25, N·L)`, the fill's own ramp) is in a *caster's*
 * shade, its indirect diffuse is raised by `1 + ULTRA.facade.castShadeLift ×
 * shade`, so cast shade on a face that would otherwise be sunlit reads about
 * at the facade's form-shade value. The same form as the ground's lift,
 * without its up-facing gate, its self-shade share or its bounce hue. Sunlit
 * faces and faces turned from the sun are untouched to the bit.
 *
 * **Which shade lifts.** Not the facade's own relief: a soffit's shadow line,
 * a reveal and a cap groove are T4's modelling and keep their darkness. The
 * patched `getShadow` samples the near map a second time, only where it
 * found shade, with the comparison moved `ULTRA.facade.liftCasterMetres`
 * (2 m) nearer the sun (`ultraFacadeCasterDepth`, the receive bias's trick):
 * an occluder within 2 m of the wall along the ray is its relief and is not
 * counted; a street tree's crown or the next building is. Beyond the near
 * map the far map's shade counts whole (it resolves no relief). Two gates
 * were tried first and dropped: the ground's `ultraTallCaster` (two
 * unfiltered far-map fetches, 0.445 m texels in town) and the far map's
 * filtered static shade — on the steeple view's rear block, a wall 60 m off
 * in the steeple building's shade, both drew the lift as faint diagonal
 * streaks, the far map's texels crossing the wall. The near map's own test
 * is as smooth as the shade it gates. Declared by `ULTRA_FACADE_LIFT` on the
 * facade family under `kit.lighting`; 0 programs (a define on a family that
 * already had its own key), 0 bytes, and 16 more compare fetches only on
 * facade fragments the near map shades.
 */
const FACADE_CAST_LIFT = /* glsl */ `
#ifdef ULTRA_FACADE_LIFT
	#if NUM_DIR_LIGHTS > 0
	{
		float ultraCastShade = ultraFacadeTallShade * smoothstep( 0.0, 0.25, dot( geometryNormal, directionalLights[ 0 ].direction ) );
		if ( ultraCastShade > 0.0 ) reflectedLight.indirectDiffuse *= 1.0 + ${glslFloat(ULTRA.facade.castShadeLift)} * ultraCastShade;
	}
	#endif
#endif
`;

/**
 * After `#include <aomap_fragment>` (three's own AO, the facade ORM's R, is
 * already applied): contact and base AO on *indirect* light, and the
 * response multipliers.
 *
 * AO is darken-only and clamped at `ULTRA.contact.floor`; specular occlusion
 * is three's own `computeSpecularOcclusion`. Direct light is untouched by
 * default (`contactDirectShare` 0) and never touched on the road
 * (`ULTRA_ROAD`), so the sunlit road cannot darken (§3.3, invariant 7).
 */
const AFTER_AO = /* glsl */ `
#if defined( ULTRA_AO ) || defined( ULTRA_BASE_AO )
	{
		float ultraOcclusion = 1.0;
		#ifdef ULTRA_AO
			ultraOcclusion *= 1.0 - ( 1.0 - saturate( vUltraAo ) ) * ultraContactStrength;
		#endif
		#ifdef ULTRA_BASE_AO
			float ultraBase = mix( ultraBaseAoFloor, 1.0, smoothstep( 0.0, ultraBaseAoMetres, vUltraBaseHeight ) );
			ultraOcclusion *= 1.0 - ( 1.0 - ultraBase ) * ultraContactStrength;
		#endif
		ultraOcclusion = clamp( ultraOcclusion, ultraContactFloor, 1.0 );
		reflectedLight.indirectDiffuse *= ultraOcclusion;
		float ultraDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( ultraDotNV, ultraOcclusion, material.roughness );
		#ifndef ULTRA_ROAD
			reflectedLight.directDiffuse *= mix( 1.0, ultraOcclusion, ultraContactDirect );
		#endif
	}
#endif
#ifdef ULTRA_GROUND
	reflectedLight.indirectSpecular *= ultraGroundSpec;
#endif
#ifdef ULTRA_CAVITY
	// Pothole ground is ground: the same sky-sheen share as the road beside it.
	reflectedLight.indirectSpecular *= ultraGroundSpec;
#endif
#if defined( ULTRA_GLASS ) && defined( USE_ROUGHNESSMAP )
	reflectedLight.indirectSpecular *= mix( 1.0, ultraGlassSpec, texelRoughness.a );
#endif
${FACADE_CAST_LIFT}`;

/** The vertex patch every lit Ultra material runs. */
export function patchUltraVertex(source: string): string {
  let out = replaceOnce(source, A.common, `${A.common}\n${VERTEX_DECLARATIONS}\n${RELIEF_DECLARATIONS}`, 'the vertex shader');
  out = replaceOnce(out, A.beginVertex, `${A.beginVertex}\n${RELIEF_VERTEX}`, 'the vertex shader');
  out = replaceOnce(out, A.projectVertex, `${A.projectVertex}\n${PROJECT_VERTEX}`, 'the vertex shader');
  out = inlineChunk(out, 'shadowmap_vertex', (text) =>
    replaceOnce(text, A.shadowNormal, `${A.shadowNormal}\n${FOLIAGE_SHADOW_NORMAL}`, 'shadowmap_vertex'));
  return out;
}

/**
 * The fragment patch every lit Ultra material runs. `screenKernel` (A29):
 * the material carries `ULTRA_GROUND_SCREEN_KERNEL` (`groundScreenKernelCompiled`),
 * so the ground's filter compiles A28's screen kernel; no shipped one does.
 */
export function patchUltraFragment(source: string, screenKernel = false): string {
  let out = replaceOnce(source, A.common, `${A.common}\n${FRAGMENT_DECLARATIONS[screenKernel ? 1 : 0]}`, 'the fragment shader');
  out = inlineChunk(out, 'shadowmap_pars_fragment', (text) =>
    replaceOnce(text, A.shadowReturn, NEAR_FADE_RETURN, 'shadowmap_pars_fragment'));
  out = inlineChunk(out, 'lights_physical_pars_fragment', (text) =>
    replaceOnce(text, A.directDiffuse, FOLIAGE_DIRECT, 'lights_physical_pars_fragment'));
  out = replaceOnce(
    out,
    A.physicalFragment,
    `${ALBEDO_EDITS}\n${A.physicalFragment}\n${ROUGHNESS_FLOORS}`,
    'the fragment shader',
  );
  out = replaceOnce(out, A.lightsBegin, `${SHADE_NORMAL}\n${screenKernel ? `${GROUND_SCREEN_KERNEL}\n` : ''}${A.lightsBegin}`, 'the fragment shader');
  out = replaceOnce(out, A.fragmentMaps, `${A.fragmentMaps}\n${FILL_CHROMA}`, 'the fragment shader');
  out = replaceOnce(out, A.aomap, `${A.aomap}\n${AFTER_AO}`, 'the fragment shader');
  return out;
}

/** The relief depth patch (vertex only; the depth fragment is three's). */
export function patchUltraDepthVertex(source: string): string {
  let out = replaceOnce(source, A.common, `${A.common}\n${RELIEF_DECLARATIONS}`, 'the depth vertex shader');
  out = replaceOnce(out, A.beginVertex, `${A.beginVertex}\n${RELIEF_VERTEX}`, 'the depth vertex shader');
  return out;
}

// ---------------------------------------------------------------------------
// Shared uniforms
// ---------------------------------------------------------------------------

/** The shared uniforms by name — what `createUltraShared` builds and the writers write. */
interface UltraUniforms {
  readonly ultraNearFade: THREE.IUniform<number>;
  readonly ultraSunDirection: THREE.IUniform<THREE.Vector3>;
  /** Never null (F-A3): the far map, or `emptyFarShadowMap()` without one (`ultraFarShadow.ts`). */
  readonly ultraFarMap: THREE.IUniform<THREE.DepthTexture>;
  readonly ultraFarMatrix: THREE.IUniform<THREE.Matrix4>;
  readonly ultraFarEnabled: THREE.IUniform<number>;
  readonly ultraFarNormalOffset: THREE.IUniform<number>;
  readonly ultraFarEdge: THREE.IUniform<number>;
  readonly ultraFarSpread: THREE.IUniform<number>;
  readonly ultraGroundSpec: THREE.IUniform<number>;
  readonly ultraGlassSpec: THREE.IUniform<number>;
  readonly ultraGlassFloor: THREE.IUniform<number>;
  readonly ultraWaterSpec: THREE.IUniform<number>;
  readonly ultraContactStrength: THREE.IUniform<number>;
  readonly ultraContactDirect: THREE.IUniform<number>;
  readonly ultraContactFloor: THREE.IUniform<number>;
  readonly ultraBaseAoFloor: THREE.IUniform<number>;
  readonly ultraBaseAoMetres: THREE.IUniform<number>;
  readonly ultraFoliageWrap: THREE.IUniform<number>;
  readonly ultraFoliageTransmission: THREE.IUniform<number>;
  readonly ultraFoliageTransmissionPower: THREE.IUniform<number>;
  readonly ultraFoliageSkyFill: THREE.IUniform<number>;
  readonly ultraFoliageShadowSpread: THREE.IUniform<number>;
  readonly ultraFoliageReceiveBias: THREE.IUniform<number>;
  /** Wave 4 (R-L): the ground's fixed-disk radius at the far end of its view-distance ramp, texels. */
  readonly ultraGroundShadowSpread: THREE.IUniform<number>;
  readonly ultraGroundShadowRamp: THREE.IUniform<THREE.Vector2>;
  /**
   * A28 (Trade 2): `ULTRA.nearFilter.groundScreenCasterMetres` of height, up
   * the sun ray, in the near rig's depth units — the ground screen kernel's
   * far-caster test. Written per frame with the sun (`updateUltraShared`).
   * A29: declared only by a program that compiles the kernel (none ships),
   * so three uploads it nowhere else.
   */
  readonly ultraGroundPenumbraDepth: THREE.IUniform<number>;
  /** Wave 4 (R-L): the facade's receive bias (the rig's depth units), slope-scaled normal offset and grazing fade. */
  readonly ultraFacadeReceiveBias: THREE.IUniform<number>;
  /** Final wave (P-LT): `ULTRA.facade.liftCasterMetres` in the rig's depth units, the facade lift's caster test. */
  readonly ultraFacadeCasterDepth: THREE.IUniform<number>;
  readonly ultraFacadeSlopeNormal: THREE.IUniform<number>;
  readonly ultraFacadeNlFade: THREE.IUniform<THREE.Vector2>;
  readonly ultraFacadeSpreadScale: THREE.IUniform<number>;
  readonly ultraFacadeGrazeSpread: THREE.IUniform<number>;
  readonly ultraGlassGroundReflect: THREE.IUniform<number>;
  readonly ultraSpecAA: THREE.IUniform<number>;
  readonly ultraFillSaturation: THREE.IUniform<number>;
  readonly ultraFillSunSaturation: THREE.IUniform<number>;
  readonly ultraFillHazeTint: THREE.IUniform<number>;
  readonly ultraBrickModule: THREE.IUniform<number>;
  readonly ultraBrickJoint: THREE.IUniform<number>;
  readonly ultraBrickDarken: THREE.IUniform<number>;
  readonly ultraBrickFade: THREE.IUniform<THREE.Vector2>;
  readonly ultraTilePitch: THREE.IUniform<number>;
  readonly ultraTileTone: THREE.IUniform<number>;
  readonly ultraTileFade: THREE.IUniform<number>;
  /** A9 (R-G): the dynamic rider/cop contact occluders, (x, z, radius, strength); fed per frame, read by the ground patch only. */
  readonly ultraContactPoints: THREE.IUniform<THREE.Vector4[]>;
  /** A28 (Trade 1): each contact slot's shade shape, (x, z, radius, strength) — compact, under the wheel and feet. */
  readonly ultraContactShade: THREE.IUniform<THREE.Vector4[]>;
  readonly ultraContactCount: THREE.IUniform<number>;
  /**
   * Final touch (post round 4): the A14/A20 static-shade lift at the camera and
   * at distance (`ULTRA.shade.lift`, `.liftFar`), read by the ground, paint and
   * block patches' `ultraShadeLiftGlsl`. Uniforms rather than compiled
   * constants so the owner can move them live on F4 (Trades 1 and 2); no
   * program is added, because every family that lifts already declares them.
   */
  readonly ultraShadeLift: THREE.IUniform<number>;
  readonly ultraShadeLiftFar: THREE.IUniform<number>;
}

/** The spec's caps on two live values (§3.3), held in code as well as on the sliders. */
const CONTACT_DIRECT_CAP = 0.3;
const FOLIAGE_TRANSMISSION_CAP = 0.22;

function uniformsOf(shared: UltraShared): UltraUniforms {
  return shared.uniforms as unknown as UltraUniforms;
}

/**
 * The uniforms every Ultra material shares (near-map fade, far map, the live
 * response values), at the `ULTRA` table's start values. Headless-safe:
 * nothing here needs a GL context, which is how W3/W6 build Ultra views under
 * `node --test`. One per Ultra world; the renderer writes it with
 * `updateUltraShared` (per solo frame) and `tuneUltraShared` (per F4 push).
 */
export function createUltraShared(): UltraShared {
  const uniforms: UltraUniforms = {
    // The Ultra rig's band until the first frame writes it.
    ultraNearFade: { value: ULTRA.near.fadeShare * 0.5 },
    ultraSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    // F-A3: never null — three would bind its never-uploaded empty depth
    // texture, and ANGLE rejects every draw of a program that declares it.
    ultraFarMap: { value: emptyFarShadowMap() },
    ultraFarMatrix: { value: new THREE.Matrix4() },
    ultraFarEnabled: { value: 0 },
    ultraFarNormalOffset: { value: 0 },
    ultraFarEdge: { value: 0 },
    ultraFarSpread: { value: ULTRA.farShadow.pcfSpreadTexels },
    ultraGroundSpec: { value: ULTRA.groundSpec },
    ultraGlassSpec: { value: ULTRA.glassSpec },
    ultraGlassFloor: { value: ULTRA.specular.glassRoughnessFloor },
    ultraWaterSpec: { value: ULTRA.waterSpec },
    ultraContactStrength: { value: ULTRA.contactStrength },
    ultraContactDirect: { value: ULTRA.contactDirectShare },
    ultraContactFloor: { value: ULTRA.contact.floor },
    ultraBaseAoFloor: { value: ULTRA.facade.baseAoFloor },
    ultraBaseAoMetres: { value: ULTRA.facade.baseAoMetres },
    ultraFoliageWrap: { value: ULTRA.foliageWrap },
    ultraFoliageTransmission: { value: ULTRA.foliageTransmission },
    ultraFoliageTransmissionPower: { value: ULTRA.foliage.transmissionPower },
    ultraFoliageSkyFill: { value: ULTRA.foliage.skyFill },
    ultraFoliageShadowSpread: { value: ULTRA.foliage.shadowSpreadTexels },
    // The Ultra rig's depth range until the first frame writes it.
    ultraFoliageReceiveBias: { value: ULTRA.foliage.receiveBiasMetres / (ULTRA.near.far - ULTRA.near.near) },
    ultraGroundShadowSpread: { value: ULTRA.nearFilter.groundFarSpreadTexels },
    ultraGroundShadowRamp: {
      value: new THREE.Vector2(ULTRA.nearFilter.groundRampMetres[0], ULTRA.nearFilter.groundRampMetres[1]),
    },
    // The Ultra rig's depth range and a zenith sun until the first frame writes it.
    ultraGroundPenumbraDepth: { value: ULTRA.nearFilter.groundScreenCasterMetres / (ULTRA.near.far - ULTRA.near.near) },
    // The Ultra rig's depth range until the first frame writes it, as foliage's.
    ultraFacadeReceiveBias: { value: ULTRA.facade.receiveBiasMetres / (ULTRA.near.far - ULTRA.near.near) },
    ultraFacadeCasterDepth: { value: ULTRA.facade.liftCasterMetres / (ULTRA.near.far - ULTRA.near.near) },
    ultraFacadeSlopeNormal: { value: ULTRA.facade.slopeNormalScale },
    ultraFacadeNlFade: { value: new THREE.Vector2(ULTRA.facade.nlFade[0], ULTRA.facade.nlFade[1]) },
    ultraFacadeSpreadScale: { value: ULTRA.facade.spreadScale },
    ultraFacadeGrazeSpread: { value: ULTRA.facade.grazeSpread },
    ultraGlassGroundReflect: { value: ULTRA.specular.glassGroundReflect },
    ultraSpecAA: { value: ULTRA.specAA },
    ultraFillSaturation: { value: ULTRA.env.fillSaturation },
    ultraFillSunSaturation: { value: ULTRA.env.fillSunSaturation },
    ultraFillHazeTint: { value: ULTRA.env.fillHazeTint },
    ultraBrickModule: { value: ULTRA.brickJoints.moduleMetres },
    ultraBrickJoint: { value: ULTRA.brickJoints.jointMetres },
    ultraBrickDarken: { value: ULTRA.brickJoints.darken },
    ultraBrickFade: {
      value: new THREE.Vector2(ULTRA.brickJoints.fadeFootprintMetres[0], ULTRA.brickJoints.fadeFootprintMetres[1]),
    },
    ultraTilePitch: { value: ULTRA.relief.tilePitch },
    ultraTileTone: { value: ULTRA.relief.tileTone },
    ultraTileFade: { value: ULTRA.relief.tileFadeMetres },
    // A9 (R-G, `ultraGroundDetail.ts` `ULTRA_CONTACT_SLOTS` × `ULTRA_CONTACT_VEC4_PER_SLOT`,
    // 4 × 2 since Wave 4's elliptical body pool): none until the runtime's first frame.
    ultraContactPoints: { value: Array.from({ length: ULTRA_CONTACT_SLOTS * ULTRA_CONTACT_VEC4_PER_SLOT }, () => new THREE.Vector4()) },
    // A28 (Trade 1): one vec4 a slot, the slot's shape in static shade.
    ultraContactShade: { value: Array.from({ length: ULTRA_CONTACT_SLOTS }, () => new THREE.Vector4()) },
    ultraContactCount: { value: 0 },
    ultraShadeLift: { value: ULTRA.shade.lift },
    ultraShadeLiftFar: { value: ULTRA.shade.liftFar },
  };
  return { uniforms: Object.freeze(uniforms) as unknown as UltraShared['uniforms'] };
}

/**
 * Per-frame shared state from the finalised near rig and the far map, called
 * from the renderer's Ultra frame hook only (§6.3 W5 `beforeSoloRender`).
 *
 * - The near fade band from the rig (0 on an ordinary rig, which turns the
 *   fade off — the `?ultrakit=-lighting` diagnostic keeps High's rig).
 * - The sun's world direction, for foliage's two-sided shadow lookup.
 * - The far map, its matrix, the receiver normal offset (one far texel) and
 *   its edge band (`ULTRA.farShadow.fadeMetres` in far-map UV), or "no far
 *   map" when there is none or it has not been built — `ultraFarEnabled` 0
 *   and the sampler bound to the uploaded empty far map, never `null`
 *   (F-A3: a program that declares a `sampler2DShadow` whose value is null
 *   is rejected by ANGLE at every draw; `emptyFarShadowMap`).
 */
export function updateUltraShared(
  shared: UltraShared,
  frame: { sun: THREE.DirectionalLight; rig: ShadowRig; far: UltraFarShadow | null },
): void {
  const u = uniformsOf(shared);
  u.ultraNearFade.value = nearFadeBand(frame.rig);
  // Foliage's receive bias in this rig's depth units (an orthographic box:
  // depth is linear, metres / (far − near)).
  const depthRange = frame.rig.far - frame.rig.near;
  u.ultraFoliageReceiveBias.value = depthRange > 0 ? ULTRA.foliage.receiveBiasMetres / depthRange : 0;
  u.ultraFacadeReceiveBias.value = depthRange > 0 ? ULTRA.facade.receiveBiasMetres / depthRange : 0;
  u.ultraFacadeCasterDepth.value = depthRange > 0 ? ULTRA.facade.liftCasterMetres / depthRange : 0;
  const direction = u.ultraSunDirection.value.subVectors(frame.sun.position, frame.sun.target.position);
  if (direction.lengthSq() > 0) direction.normalize();
  else direction.set(0, 1, 0);
  // A28: the ground screen kernel's far-caster height, along the ray (a lower
  // sun puts the same height farther up it), in this rig's depth units.
  u.ultraGroundPenumbraDepth.value = depthRange > 0
    ? ULTRA.nearFilter.groundScreenCasterMetres / Math.max(direction.y, 0.2) / depthRange : 0;

  const far = frame.far;
  if (far !== null && far.texture !== null && far.texelMetres > 0) {
    u.ultraFarMap.value = far.texture;
    u.ultraFarMatrix.value.copy(far.matrix);
    u.ultraFarEnabled.value = 1;
    u.ultraFarNormalOffset.value = far.texelMetres * ULTRA.farShadow.normalOffsetTexels;
    u.ultraFarEdge.value = ULTRA.farShadow.fadeMetres / (far.texelMetres * far.mapSize);
  } else {
    // F-A3: the uploaded empty far map, never null (`emptyFarShadowMap`);
    // `ultraFarEnabled` 0 keeps every lookup of it switched off.
    u.ultraFarMap.value = emptyFarShadowMap();
    u.ultraFarEnabled.value = 0;
    u.ultraFarNormalOffset.value = 0;
    u.ultraFarEdge.value = 0;
  }
}

/**
 * Push the F4-live response values into the shared uniforms (§3.3). Absolute
 * writes; the spec's two caps are held here as well as on the sliders
 * (`contactDirectShare ≤ 0.3`, `foliageTransmission ≤ 0.22`). The near bias,
 * normal bias and radius are the sun's, not uniforms (`shadowRigFor(…,
 * live)`), and κ and β are the fill's and the environment's. The static-shade
 * lift's two (final touch, post round 4) are written as they come, floored at
 * 0 (no lift).
 */
export function tuneUltraShared(shared: UltraShared, live: UltraLiveTuning): void {
  const u = uniformsOf(shared);
  u.ultraGroundSpec.value = Math.max(0, live.groundSpec);
  u.ultraGlassSpec.value = Math.max(0, live.glassSpec);
  u.ultraWaterSpec.value = Math.max(0, live.waterSpec);
  u.ultraContactStrength.value = Math.max(0, live.contactStrength);
  u.ultraContactDirect.value = Math.min(CONTACT_DIRECT_CAP, Math.max(0, live.contactDirectShare));
  u.ultraFoliageWrap.value = Math.max(0, live.foliageWrap);
  u.ultraFoliageTransmission.value = Math.min(FOLIAGE_TRANSMISSION_CAP, Math.max(0, live.foliageTransmission));
  u.ultraSpecAA.value = Math.max(0, live.specAA);
  u.ultraShadeLift.value = Math.max(0, live.shadeLift);
  u.ultraShadeLiftFar.value = Math.max(0, live.shadeLiftFar);
}

// ---------------------------------------------------------------------------
// Material factories
// ---------------------------------------------------------------------------

/** The patch families — one `customProgramCacheKey` each. */
export type UltraFamily =
  | 'ground'
  | 'block'
  | 'facade'
  | 'relief'
  | 'foliage'
  | 'furniture'
  | 'water'
  | 'marking'
  | 'hazard-ground';

/**
 * Bumped when the patch text changes, so a cached program can never outlive
 * its source. 3: Wave 3 (R-L) — foliage's own shadow filter and receive
 * bias, the per-material environment response, glass's ground reflection.
 * 4: Wave 4 (R-L) — the ground's and the facades' fixed-disk near filter,
 * the facade receive, and `ultraFarVisibilityToward`.
 * 5: final wave (P-LT) — the ground's edge reconstruction
 * (`ultraGroundShadow`) and the facade's cast-shade lift (`ULTRA_FACADE_LIFT`).
 * 6: final touch (post round 4) — the static-shade lift's amounts as the
 * shared `ultraShadeLift` / `ultraShadeLiftFar` uniforms, and its far-map
 * classification dilated (`ultraFarShadeAround`, `ultraGroundDetail.ts`).
 * 7: A28 (Codex's post-GU QA) — the ground filter's screen kernel
 * (`GROUND_SCREEN_KERNEL`, `ultraGroundDiskShadow`), the lift's lean by the
 * same kernel, and the lift's share by ground surface.
 * 8: A29 (round 5) — the screen kernel and its lean compiled out: U5's ground
 * filter again, unless a material carries `ULTRA_GROUND_SCREEN_KERNEL`.
 * The ground, paint and block patches chain onto these families' keys.
 */
const PATCH_VERSION = 9;

/** The program cache key a family's materials share. */
export function ultraProgramKey(family: UltraFamily | 'relief-depth'): string {
  return `m39-ultra-${family}-v${PATCH_VERSION}`;
}

/** Street metal's roughness floor (§2.2) for a metallic material, else none. */
function roughnessFloorFor(metalness: number): number {
  return metalness > 0 ? ULTRA.specular.metalRoughnessFloor : 0;
}

/**
 * Install the Ultra patch on a standard material: family defines, the shared
 * uniforms by reference, a per-material roughness floor, and one cache key
 * per family. The patch text depends only on the defines, so every material
 * sharing a key compiles the same source.
 *
 * `envResponse` (Wave 3, R-L; optional, 1 by default) is the per-material
 * share of the environment — diffuse fill and reflection — this material
 * takes: the part's `ULTRA.hazardRead` value on the hazard-read families, whose
 * obstacle faces must keep ≥ 0.8 × High's contrast (A11). A uniform, not a
 * define, so it adds no program.
 */
function installUltraPatch(
  material: THREE.MeshStandardMaterial,
  family: UltraFamily,
  defines: readonly string[],
  context: UltraBuildContext,
  roughnessFloor: number,
  envResponse = 1,
): THREE.MeshStandardMaterial {
  const next: Record<string, unknown> = { ...(material.defines ?? {}) };
  for (const name of defines) next[name] = '';
  // A29: the ground's screen kernel (A28, Trade 2) only while the tuning
  // turns it on (it does not), and only where the ground filter runs.
  if (ULTRA.nearFilter.groundScreenKernel && ('ULTRA_GROUND' in next || 'ULTRA_GROUND_SHADOW' in next)) {
    next[ULTRA_GROUND_SCREEN_KERNEL] = '';
  }
  material.defines = next;
  material.userData.ultraFamily = family;
  const floor: THREE.IUniform<number> = { value: roughnessFloor };
  const response: THREE.IUniform<number> = { value: envResponse };
  material.userData.ultraEnvResponse = envResponse;
  const shared = context.shared.uniforms;
  material.onBeforeCompile = (shader): void => {
    for (const name of Object.keys(shared)) shader.uniforms[name] = shared[name];
    shader.uniforms.ultraRoughnessFloor = floor;
    shader.uniforms.ultraEnvResponse = response;
    shader.vertexShader = patchUltraVertex(shader.vertexShader);
    shader.fragmentShader = patchUltraFragment(shader.fragmentShader, groundScreenKernelCompiled(material));
  };
  const key = ultraProgramKey(family);
  material.customProgramCacheKey = (): string => key;
  return material;
}

/**
 * Shared display additions take the world's established fill/chroma response.
 * Paving also takes its stone static-shade lift and ground shadow filter, but
 * has no terrain AO/edge attributes or extra detail maps. Preserve its owned
 * metre-scale pattern hook. The caller restores the original material on
 * ordinary tiers and disposes this clone; textures/uniforms remain borrowed.
 */
export function ultraSupplementMaterial(base: THREE.MeshStandardMaterial,
  context: UltraBuildContext, paving: boolean): THREE.MeshStandardMaterial {
  const material = base.clone();
  const prior = base.onBeforeCompile, priorKey = base.customProgramCacheKey();
  const defines = farDefines(context.recipe.ultra);
  if (paving && context.recipe.ultra.lighting) defines.push('ULTRA_GROUND');
  installUltraPatch(material, paving ? 'ground' : 'furniture', defines, context,
    roughnessFloorFor(base.metalness));
  if (paving) installUltraGroundPatch(material, {
    kind: groundDetailKind('stone'), edge: false, detail: null,
    shadeLift: context.recipe.ultra.lighting,
    dynamicContact: context.recipe.ultra.ground,
  });
  const compiled = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    compiled.call(material, shader, renderer);
  };
  material.customProgramCacheKey = () => `${key}/supplement/${priorKey}`;
  return material;
}

/** `ULTRA_FAR` when the kit builds the far map (T12, on by default on `ultra-full`). */
function farDefines(kit: UltraKit): string[] {
  return kit.farShadow ? ['ULTRA_FAR'] : [];
}

/**
 * Wave 4 (R-L, round 2 item 2b): the families that lie on the ground — road
 * paint, pothole ground, water — filter the near map as the ground does
 * (`ULTRA_GROUND` carries it there), so a cast-shade edge crossing a line or a
 * puddle keeps the road's softness. A lighting response: `kit.lighting`.
 */
function groundShadowDefines(kit: UltraKit): string[] {
  return kit.lighting ? ['ULTRA_GROUND_SHADOW'] : [];
}

/** Which prop parts each family takes (§3.3, §4). */
const FOLIAGE_PARTS: ReadonlySet<PartId> = new Set<PartId>(['crown', 'coniferFoliage', 'shrub']);
const FACADE_PARTS: ReadonlySet<PartId> = new Set<PartId>(['buildingBody', 'buildingLow', 'buildingTall']);
const RELIEF_ONLY_PARTS: ReadonlySet<PartId> = new Set<PartId>(['buildingCap', 'roofGable']);

/**
 * The hazard-read prop parts (Wave 3, R-L): what a rider must see *as an
 * obstacle* — the bollard's finial and the tyre stack. They take their
 * `ULTRA.hazardRead` share of the environment, so their faces keep
 * High's dark read against the ground (round 1: plaza bollards lifted from
 * 22 to 46 luma, A11's obstacle-face gate). Bollard posts and barriers are
 * collider blocks, whose family (`ultraBlockMaterial`) takes the same
 * `envResponse` argument.
 */
export const ULTRA_HAZARD_READ_PARTS: ReadonlySet<PartId> = new Set<PartId>(Object.keys(ULTRA.hazardRead) as PartId[]);

/** A prop part's share of the environment: its `ULTRA.hazardRead` value, else 1. */
export function ultraEnvResponseFor(part: PartId): number {
  const table = ULTRA.hazardRead as Readonly<Partial<Record<PartId, number>>>;
  return table[part] ?? 1;
}

/** The family a prop part is patched as. */
export function ultraPropFamily(part: PartId): UltraFamily {
  if (FOLIAGE_PARTS.has(part)) return 'foliage';
  if (FACADE_PARTS.has(part)) return 'facade';
  if (RELIEF_ONLY_PARTS.has(part)) return 'relief';
  return 'furniture';
}

/**
 * A prop part's material on an Ultra world.
 *
 * The ordinary literal from `render/props.ts` — white, the part's own
 * roughness and metalness, `vertexColors` for `instanceColor`, the atlas when
 * the part samples one — plus the family patch. A facade body that samples
 * the atlas, given the Ultra facade maps, wears the Ultra albedo copy (its
 * anisotropy) and the normal and ORM pages: the ORM page is the roughness,
 * metalness and AO map at once (G, B, R), so roughness and metalness are 1
 * and the page's texels are absolute; its A is the glass mask the patch
 * reads for the glass response.
 *
 * Relief (`ULTRA_RELIEF`) is declared only when `kit.buildings` — the Ultra
 * building builders are what attach `ultraRelief`.
 */
export function ultraPropMaterial(
  part: PartId,
  base: { roughness: number; metalness: number; map: THREE.Texture | null; vegetationWood?: boolean },
  context: UltraBuildContext,
  maps: UltraFacadeMaps | null,
): THREE.MeshStandardMaterial {
  const kit = context.recipe.ultra;
  const family = ultraPropFamily(part);
  const withMaps = family === 'facade' && maps !== null && base.map !== null;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: withMaps ? 1 : base.roughness,
    metalness: withMaps ? 1 : base.metalness,
    vertexColors: true,
    map: withMaps ? maps.albedo : base.map,
  });
  if (withMaps) {
    material.normalMap = maps.normal;
    material.roughnessMap = maps.orm;
    material.metalnessMap = maps.orm;
    material.aoMap = maps.orm;
  }

  const defines = farDefines(kit);
  if (family === 'foliage' && kit.lighting) defines.push('ULTRA_FOLIAGE');
  if (base.vegetationWood && family === 'foliage' && kit.lighting) defines.push('ULTRA_VEGETATION_WOOD');
  if ((family === 'facade' || family === 'relief') && kit.buildings) defines.push('ULTRA_RELIEF');
  if (family === 'facade') defines.push('ULTRA_BASE_AO');
  if (family === 'facade' && withMaps && kit.lighting) defines.push('ULTRA_GLASS');
  // Wave 4 (R-L, round 2 item 6): the facade's own receive — fixed disk,
  // receive bias along the light, slope-scaled normal offset, grazing fade.
  if (family === 'facade' && kit.lighting) defines.push('ULTRA_FACADE_RECEIVE');
  // Final wave (P-LT, round 3 item 4): cast shade on a sun-facing facade
  // lifts toward its form shade (`FACADE_CAST_LIFT`).
  if (family === 'facade' && kit.lighting) defines.push('ULTRA_FACADE_LIFT');
  if (part === 'roofGable') defines.push('ULTRA_TILES');

  const floor = withMaps ? 0 : roughnessFloorFor(base.metalness);
  const response = kit.lighting ? ultraEnvResponseFor(part) : 1;
  return installUltraPatch(material, family, defines, context, floor, response);
}

/**
 * The shadow-pass depth material for relief parts, mirroring the relief
 * vertex patch so recessed panes, grooves and fascias cast where they are
 * drawn (§4, and §0.3's rejection of "inward-only relief needs no
 * `customDepthMaterial`"). three's own shadow depth material is a default
 * `MeshDepthMaterial`; this is the same with the relief offset. three sets
 * its side, map and clipping from the colour material each shadow pass.
 */
export function ultraReliefDepthMaterial(context: UltraBuildContext): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial();
  material.defines = { ...(context.recipe.ultra.buildings ? { ULTRA_RELIEF: '' } : {}) };
  material.userData.ultraFamily = 'relief-depth';
  material.onBeforeCompile = (shader): void => {
    shader.vertexShader = patchUltraDepthVertex(shader.vertexShader);
  };
  const key = ultraProgramKey('relief-depth');
  material.customProgramCacheKey = (): string => key;
  return material;
}

/** Rank-1 surfaces (§4): the road, where contact AO never touches direct light. */
const ROAD_SURFACES: ReadonlySet<MaterialId> = new Set<MaterialId>(['pavement', 'roughPavement']);

/**
 * A heightfield surface group's (or the surround field's) material: the
 * ordinary `render/terrain.ts` ground material plus the ground patch.
 *
 * - Indirect specular × `groundSpec` (0.5): the road stays the calmest plane.
 * - Contact AO (`ultraAo`) when `kit.ground`.
 * - Brick joints on `brick` only, never on a road surface.
 * - `ULTRA_ROAD` on the rank-1 surfaces, which keeps contact AO off direct
 *   light there whatever `contactDirectShare` says.
 * - Then the ground's own patch (`ultraGroundDetail.ts`, pre-R1 ground
 *   pass): the per-fragment edge field (`ULTRA_EDGE`: `ultraEdge`,
 *   `ultraFillTint`, `ultraFillKind`) when `kit.ground && kit.edgeFill`, on
 *   the heightfield groups only — the field carries AO alone — and, given
 *   the view's `detail` maps under `kit.ground`, the surface detail
 *   (`ULTRA_DETAIL`), keyed per material by a uniform kind so it adds no
 *   program. The road's kind is none.
 * - Wave 3 (R-G), the same patch: the static-shade lift (`ULTRA_SHADE_LIFT`,
 *   `kit.lighting`, A7) — up-facing ground in a building's or tree's shade
 *   reads as daylight shade, the rider's own shadow keeps its darkness — and
 *   the rider/cop contact (`ULTRA_CONTACT_DYNAMIC`, `kit.ground`, A9) from
 *   the shared `ultraContactPoints` the runtime feeds every solo frame.
 */
export function ultraGroundMaterial(
  appearance: MaterialAppearance,
  surface: MaterialId | 'field',
  context: UltraBuildContext,
  detail: UltraGroundDetail | null = null,
): THREE.MeshStandardMaterial {
  const kit = context.recipe.ultra;
  const material = new THREE.MeshStandardMaterial({
    color: appearance.albedo,
    roughness: appearance.roughness,
    metalness: appearance.metalness,
    vertexColors: true,
  });
  const defines = farDefines(kit);
  if (kit.lighting) defines.push('ULTRA_GROUND');
  if (kit.ground) defines.push('ULTRA_AO');
  if (kit.ground && surface === 'brick') defines.push('ULTRA_BRICK');
  if (surface !== 'field' && ROAD_SURFACES.has(surface)) defines.push('ULTRA_ROAD');
  installUltraPatch(material, 'ground', defines, context, 0);
  return installUltraGroundPatch(material, {
    kind: groundDetailKind(surface === 'field' ? appearance.id : surface),
    edge: kit.ground && kit.edgeFill && surface !== 'field',
    detail: kit.ground ? detail : null,
    // Wave 3 (R-G): the static-shade lift is a lighting response (A7); the
    // rider/cop contact is grounding, with the rest of the contact AO (A9).
    shadeLift: kit.lighting,
    dynamicContact: kit.ground,
  });
}

/**
 * A collider-block material: the ordinary `render/terrain.ts` block material
 * plus the block patch — base AO (`ultraAo`) on indirect light when
 * `kit.blocks`, and the street-metal roughness floor on metal — and, under
 * `kit.lighting`, the block response (`ultraBlocks.ts`, Wave 3 R-G): faces
 * take a reduced share of the fill and sheen so steps, kickers and bollards
 * stay readable; tops take a smaller sheen share and the ground's lift.
 */
export function ultraBlockMaterial(
  appearance: MaterialAppearance,
  _material: MaterialId,
  context: UltraBuildContext,
): THREE.MeshStandardMaterial {
  const kit = context.recipe.ultra;
  const material = new THREE.MeshStandardMaterial({
    color: appearance.albedo,
    roughness: appearance.roughness,
    metalness: appearance.metalness,
    vertexColors: true,
  });
  const defines = farDefines(kit);
  if (kit.blocks) defines.push('ULTRA_AO');
  installUltraPatch(material, 'block', defines, context, roughnessFloorFor(appearance.metalness));
  // Wave 3 (R-G, round-1 items 1 and 7): tops take the ground's sheen share
  // and static-shade lift, vertical faces a reduced fill (`ultraBlocks.ts`).
  return kit.lighting ? installUltraBlockPatch(material) : material;
}

/**
 * Standing water (`render/hazards.ts`), T11.
 *
 * **An explicit `envMap`**, because a null `envMap` makes three overwrite the
 * per-material intensity with `scene.environmentIntensity` every draw
 * (`WebGLRenderer`, "material.envMap === null && scene.environment !== null").
 * The material follows `scene.environment` itself in `onBeforeRender` — so it
 * needs no hand-off from the renderer, and a torn-down environment takes the
 * water's with it — and sets `envMapIntensity = environmentIntensity ×
 * waterSpec`, the puddle's own share of the painted sky. three detects the
 * envMap change itself (`materialProperties.envMap`), so this costs no
 * `needsUpdate`.
 *
 * With `kit.lighting` off it keeps the scene's environment as every other
 * material does. Everything in `params` (the polygon offset included) is
 * kept.
 */
export function ultraWaterMaterial(
  params: THREE.MeshStandardMaterialParameters,
  context: UltraBuildContext,
): THREE.MeshStandardMaterial {
  const kit = context.recipe.ultra;
  const material = new THREE.MeshStandardMaterial(params);
  if (kit.lighting) {
    const waterSpec = uniformsOf(context.shared).ultraWaterSpec;
    material.onBeforeRender = (_renderer, scene): void => {
      const environment = scene.environment;
      if (material.envMap !== environment) material.envMap = environment;
      material.envMapIntensity = scene.environmentIntensity * waterSpec.value;
    };
  }
  return installUltraPatch(material, 'water', [...farDefines(kit), ...groundShadowDefines(kit)], context, 0);
}

/**
 * Road paint (`render/markings.ts`): environment fill, the near fade and the
 * far term — and, from the U2 stabilizer, the road's own light response
 * (`installUltraPaintPatch`): the static-shade lift under `kit.lighting` (A7)
 * and the rider/cop contact under `kit.ground` (A9), so a line keeps its
 * ratio to the road in a lifted canyon and inside the rider's pool.
 */
export function ultraMarkingMaterial(
  params: THREE.MeshStandardMaterialParameters,
  context: UltraBuildContext,
): THREE.MeshStandardMaterial {
  const kit = context.recipe.ultra;
  const material = installUltraPatch(
    new THREE.MeshStandardMaterial(params), 'marking', [...farDefines(kit), ...groundShadowDefines(kit)], context, 0,
  );
  return installUltraPaintPatch(material, { shadeLift: kit.lighting, dynamicContact: kit.ground });
}

/** Pothole ground (`render/hazards.ts`): environment fill, the near fade and the far term only. */
export function ultraHazardGroundMaterial(
  params: THREE.MeshStandardMaterialParameters,
  context: UltraBuildContext,
): THREE.MeshStandardMaterial {
  // `ULTRA_CAVITY` (pre-R1 calibration, §U2): the bowl's fill is the sky
  // through the opening, not its tilted normal's view of the horizon and the
  // bounce, which had lifted the pit and cut the rim/pit dipole under 0.9 ×.
  const defines = [...farDefines(context.recipe.ultra), ...groundShadowDefines(context.recipe.ultra)];
  if (context.recipe.ultra.lighting) defines.push('ULTRA_CAVITY');
  return installUltraPatch(new THREE.MeshStandardMaterial(params), 'hazard-ground', defines, context, 0);
}
