/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { GROUND_BOUNDARY, GROUND_PAVING } from '../data/tuning.ts';
import { SURFACES, materialAppearance } from '../data/surfaces.ts';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { edgeFillForGrid, edgeSignedDistance, fillTint, type EdgeFillField } from './groundBoundary.ts';
import { groundBoundaryPolicy, groundEdgeCapCells, groundDrivableCapCells,
  groundHazardMask, groundPrecisePatchMask, GROUND_DRIVABLE_MATERIALS } from './groundBoundaryPolicy.ts';
import { createSharedBoundaryTint } from './sharedBoundaryTint.ts';
import { sharedGroundCode } from './sharedGroundCodes.ts';
import { withSharedGroundContours } from './sharedGroundContours.ts';
import { PREPARATION_SLICE, runSteps, type Steps } from '../shared/preparationSteps.ts';
import { preparedBoundaryFill } from './preparedBoundaryFill.ts';
import type { PreparedGroundEdges } from './sharedGroundEdgePlan.ts';

export const GROUND_BOUNDARY_ATTRIBUTES = Object.freeze({
  edge: 'groundBoundaryEdge', tint: 'groundBoundaryTint', mode: 'groundBoundaryMode',
});

function boundaryData(plan: LevelPlan,
  drawn: ReadonlyMap<string, readonly number[]>): { fill: EdgeFillField; excluded: Uint8Array } {
  const field = plan.heightfield, columns = field.columns - 1;
  const cap = groundEdgeCapCells(field.spacing);
  const excluded = groundPrecisePatchMask(plan, groundHazardMask(plan));
  const fill = edgeFillForGrid({ columns, rows: field.rows - 1, surfaces: field.surfaces },
    drawn as ReadonlyMap<SurfaceId, readonly number[]>,
    groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(field.spacing))),
    excluded);
  // The legacy isolated-corner chamfer always covers half a cell. At wider
  // future spacings that could exceed the metre cap; leave that cell alone.
  // Ultra keeps its historical arithmetic/output, including this omission.
  const cells = new Map(fill.cells);
  let removed = 0;
  for (const [cell, filled] of cells) {
    const material = SURFACES[field.surfaces[cell]]?.material ?? 'pavement';
    const allowed = GROUND_DRIVABLE_MATERIALS.has(material) ? fill.drivableCapCells : fill.capCells;
    if (filled.pocket === 'chamfer' && allowed < 0.5) { cells.delete(cell); removed++; }
  }
  if (!removed) return { fill, excluded };
  return { fill: { ...fill, cells, lines: [...cells.values()].reduce((sum, cell) => sum + cell.lines.length, 0),
    pockets: { chain: fill.pockets.chain, chamfer: fill.pockets.chamfer - removed },
    dropped: fill.dropped + removed }, excluded };
}

export function ordinaryBoundaryField(plan: LevelPlan,
  drawn: ReadonlyMap<string, readonly number[]>): EdgeFillField {
  return boundaryData(plan, drawn).fill;
}

/**
 * Value equality for the reuse check, failing closed. The policy it compares is
 * rebuilt on every call (`groundBoundaryPolicy`), so identity would never reuse;
 * equal means the same prototype and, recursively, the same own keys in the same
 * order (plain objects and arrays), the same entries in the same iteration order
 * (Maps: keys and values; Sets: members), and `Object.is` for everything else.
 * Any other object kind (typed array, Date, class instance) is equal only to
 * itself, so a value this cannot see inside never admits a stale fill. Exported
 * for its negative controls (`preparedBoundaryFill.test.ts`).
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const prototype = Object.getPrototypeOf(a);
  if (prototype !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Map || a instanceof Set) {
    const other = b as Map<unknown, unknown> | Set<unknown>;
    if (a.size !== other.size) return false;
    const theirs = other.entries();
    for (const [key, value] of a.entries()) {
      const next = theirs.next();
      if (next.done || !sameValue(key, next.value[0]) || !sameValue(value, next.value[1])) return false;
    }
    return true;
  }
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  if (keys.length !== other.length) return false;
  for (let index = 0; index < keys.length; index++) {
    if (keys[index] !== other[index]
      || !sameValue((a as Record<string, unknown>)[keys[index]], (b as Record<string, unknown>)[keys[index]])) return false;
  }
  return true;
}
function sameDrawn(a: ReadonlyMap<string, readonly number[]>, b: ReadonlyMap<string, readonly number[]>): boolean {
  if (a.size !== b.size) return false;
  const other = b.entries();
  for (const [surface, cells] of a) {
    const next = other.next();
    if (next.done || next.value[0] !== surface || next.value[1].length !== cells.length) return false;
    const mine = next.value[1];
    for (let index = 0; index < cells.length; index++) if (!Object.is(cells[index], mine[index])) return false;
  }
  return true;
}
/**
 * The preparation's fill and contours when this build asks the identical
 * question (`preparedBoundaryFill.ts`), else null and the caller computes.
 * Identical means: the same plan, heightfield, surface array, hazards and patch
 * lists, grid shape and spacing; an equal drawn census in the same order; an
 * equal policy; an equal protected mask; and caps at which `boundaryData`
 * deletes no chamfer, so its fill is `edgeFillForGrid`'s own answer.
 */
function preparedFillFor(plan: LevelPlan, drawn: ReadonlyMap<string, readonly number[]>,
  prepared: PreparedGroundEdges | null): { fill: EdgeFillField; excluded: Uint8Array } | null {
  if (!prepared || prepared.source !== plan) return null;
  const handoff = preparedBoundaryFill(prepared), field = plan.heightfield;
  if (!handoff || handoff.plan !== plan || handoff.heightfield !== field || handoff.surfaces !== field.surfaces
    || handoff.columns !== field.columns || handoff.rows !== field.rows || !Object.is(handoff.spacing, field.spacing)
    || handoff.hazards !== plan.hazards || handoff.patches !== plan.groundSurfacePatches) return null;
  if (!(handoff.original.capCells >= 0.5 && handoff.original.drivableCapCells >= 0.5)) return null;
  if (!sameDrawn(handoff.drawn, drawn)) return null;
  const cap = groundEdgeCapCells(field.spacing);
  if (!sameValue(handoff.policy, groundBoundaryPolicy(cap, Math.min(cap, groundDrivableCapCells(field.spacing))))) return null;
  const excluded = groundPrecisePatchMask(plan, groundHazardMask(plan));
  if (excluded.length !== handoff.protectedCells.length) return null;
  for (let cell = 0; cell < excluded.length; cell++) if (excluded[cell] !== handoff.protectedCells[cell]) return null;
  return { fill: handoff.contour, excluded };
}

/** The ordinary tier's albedo-only edge treatment. No AO, normals, maps or samplers.
 * `prepared` is the admitted shared-edge preparation, if any: inside the same
 * construction scope its fill and contours are reused when every input matches. */
export function ordinaryBoundaryAttributes(plan: LevelPlan,
  drawn: ReadonlyMap<string, readonly number[]>, colors: readonly number[], sharedSurface = false,
  prepared: PreparedGroundEdges | null = null): {
    attributes: readonly [string, THREE.BufferAttribute][];
    bytes: number; filledCells: number; fillLines: number;
  } {
  return runSteps(ordinaryBoundaryAttributesSteps(plan, drawn, colors, sharedSurface, prepared));
}
/** `ordinaryBoundaryAttributes` as slices (`shared/preparationSteps.ts`). */
export function* ordinaryBoundaryAttributesSteps(plan: LevelPlan,
  drawn: ReadonlyMap<string, readonly number[]>, colors: readonly number[], sharedSurface = false,
  prepared: PreparedGroundEdges | null = null): Steps<{
    attributes: readonly [string, THREE.BufferAttribute][];
    bytes: number; filledCells: number; fillLines: number;
  }> {
  const field = plan.heightfield, columns = field.columns - 1;
  const reused = sharedSurface ? preparedFillFor(plan, drawn, prepared) : null;
  let fill: EdgeFillField, excluded: Uint8Array;
  if (reused) {
    ({ fill, excluded } = reused);
  } else {
    const data = boundaryData(plan, drawn);
    excluded = data.excluded;
    yield PREPARATION_SLICE;
    fill = sharedSurface ? withSharedGroundContours(plan, drawn, data.fill) : data.fill;
  }
  yield PREPARATION_SLICE;
  const first = new Int32Array(columns * (field.rows - 1)).fill(-1);
  let vertices = 0;
  for (const cells of drawn.values()) for (const cell of cells) { first[cell] = vertices; vertices += 4; }
  const edge = new Uint16Array(vertices * 2).fill(THREE.DataUtils.toHalfFloat(GROUND_BOUNDARY.sentinel));
  const tone = new Uint16Array(vertices * 3).fill(THREE.DataUtils.toHalfFloat(1));
  const mode = new Uint8Array(vertices);
  // The existing byte carries material flags as well as the two boundary bits.
  // Protected cells retain the exact neutral encoding, including brick cells.
  yield PREPARATION_SLICE;
  for (const cells of drawn.values()) for (const cell of cells) {
    if (!excluded[cell] && SURFACES[field.surfaces[cell]]?.material === 'brick') {
      mode.fill(8, first[cell], first[cell] + 4);
    }
  }
  const linear = new Map<SurfaceId, THREE.Color>();
  const albedo = (surface: SurfaceId): THREE.Color => {
    let color = linear.get(surface);
    if (!color) {
      const material = SURFACES[surface]?.material ?? 'pavement';
      color = new THREE.Color(plan.palette?.[material] ?? materialAppearance(material).albedo);
      linear.set(surface, color);
    }
    return color;
  };
  const source = { r: 1, g: 1, b: 1 }, own = { r: 1, g: 1, b: 1 }, tint = { r: 1, g: 1, b: 1 };
  const sharedTint = sharedSurface ? createSharedBoundaryTint(plan) : null;
  yield PREPARATION_SLICE;
  for (const [cell, filled] of fill.cells) {
    const at = first[cell], from = first[filled.source];
    if (at < 0 || from < 0) throw new Error('Ground boundary references an undrawn tile');
    source.r = colors[from * 3]; source.g = colors[from * 3 + 1]; source.b = colors[from * 3 + 2];
    own.r = colors[at * 3]; own.g = colors[at * 3 + 1]; own.b = colors[at * 3 + 2];
    fillTint(albedo(field.surfaces[cell]), own, albedo(filled.towards), source, tint);
    const rgb = [tint.r, tint.g, tint.b].map(THREE.DataUtils.toHalfFloat);
    const bits = (filled.mode === 'intersection' && filled.lines.length > 1 ? 1 : 0)
      + (filled.round === true ? 2 : 0)
      + (SURFACES[filled.towards]?.material === 'brick' ? 4 : 0)
      + mode[at]
      + (sharedSurface ? sharedGroundCode(SURFACES[filled.towards].material) * 16 : 0);
    const row = Math.floor(cell / columns), column = cell - row * columns;
    for (let corner = 0; corner < 4; corner++) {
      const vertex = at + corner;
      for (let index = 0; index < filled.lines.length && index < 2; index++) {
        edge[vertex * 2 + index] = THREE.DataUtils.toHalfFloat(edgeSignedDistance(filled.lines[index],
          column + (corner & 1), row + (corner >> 1)) * (filled.distanceScale ?? 1));
      }
      if (sharedSurface) {
        sharedTint!(field.surfaces[cell], filled.towards,
          column + (corner & 1), row + (corner >> 1), tint);
        tone[vertex * 3] = THREE.DataUtils.toHalfFloat(tint.r);
        tone[vertex * 3 + 1] = THREE.DataUtils.toHalfFloat(tint.g);
        tone[vertex * 3 + 2] = THREE.DataUtils.toHalfFloat(tint.b);
      } else {
        for (let channel = 0; channel < 3; channel++) tone[vertex * 3 + channel] = rgb[channel];
      }
      mode[vertex] = bits;
    }
  }
  return { attributes: [
    [GROUND_BOUNDARY_ATTRIBUTES.edge, new THREE.Float16BufferAttribute(edge, 2)],
    [GROUND_BOUNDARY_ATTRIBUTES.tint, new THREE.Float16BufferAttribute(tone, 3)],
    [GROUND_BOUNDARY_ATTRIBUTES.mode, new THREE.Uint8BufferAttribute(mode, 1, false)],
  ], bytes: edge.byteLength + tone.byteLength + mode.byteLength,
  filledCells: fill.cells.size, fillLines: fill.lines };
}

/** All anchors are pinned in headless tests against the installed Three shader. */
export const GROUND_BOUNDARY_ANCHORS = Object.freeze({
  common: '#include <common>', begin: '#include <begin_vertex>', color: '#include <color_fragment>',
});
const declarations = `varying vec2 vGroundBoundaryEdge;
varying vec3 vGroundBoundaryTint;
varying float vGroundBoundaryMode;
varying vec2 vGroundPavingWorld;`;
const knee = GROUND_BOUNDARY.kneeRoundCells;
const paving = GROUND_PAVING;
export const GROUND_BOUNDARY_FRAGMENT = /* glsl */ `
float boundaryBits = mod(vGroundBoundaryMode, 4.0);
float boundaryRound = step(1.5, boundaryBits);
float boundaryMode = boundaryBits - 2.0 * boundaryRound;
float boundaryA = saturate(vGroundBoundaryEdge.x / max(fwidth(vGroundBoundaryEdge.x), 1e-6) + 0.5);
float boundaryB = saturate(vGroundBoundaryEdge.y / max(fwidth(vGroundBoundaryEdge.y), 1e-6) + 0.5);
float boundaryCover = mix(max(boundaryA, boundaryB), min(boundaryA, boundaryB), boundaryMode);
float boundaryH = max(${knee.toFixed(8)} - abs(vGroundBoundaryEdge.x - vGroundBoundaryEdge.y), 0.0) / ${Math.max(knee, 1e-6).toFixed(8)};
float boundaryD = max(vGroundBoundaryEdge.x, vGroundBoundaryEdge.y) + boundaryH * boundaryH * ${(knee * 0.25).toFixed(8)};
float boundaryRounded = saturate(boundaryD / max(fwidth(boundaryD), 1e-6) + 0.5);
boundaryCover = mix(boundaryCover, boundaryRounded, boundaryRound);
diffuseColor.rgb *= mix(vec3(1.0), vGroundBoundaryTint, boundaryCover);
// Derivatives precede the material branch, so every fragment in a quad participates.
float pavingFootprint = length(abs(dFdx(vGroundPavingWorld)) + abs(dFdy(vGroundPavingWorld)));
float pavingOwn = step(7.5, vGroundBoundaryMode);
float pavingFill = mod(floor(vGroundBoundaryMode / 4.0), 2.0);
float pavingCover = mix(pavingOwn, pavingFill, boundaryCover);
if (pavingCover > 0.0) {
  float pavingRow = floor(vGroundPavingWorld.y / ${paving.widthMetres.toFixed(8)});
  float pavingU = vGroundPavingWorld.x / ${paving.lengthMetres.toFixed(8)} + mod(pavingRow, 2.0) * 0.5;
  vec2 pavingUv = vec2(pavingU, vGroundPavingWorld.y / ${paving.widthMetres.toFixed(8)});
  vec2 pavingDistance = min(fract(pavingUv), 1.0 - fract(pavingUv))
    * vec2(${paving.lengthMetres.toFixed(8)}, ${paving.widthMetres.toFixed(8)});
  float pavingHalfPixel = max(pavingFootprint * 0.5, 1e-5);
  vec2 pavingJoint = 1.0 - smoothstep(vec2(${(paving.jointMetres * 0.5).toFixed(8)} - pavingHalfPixel),
    vec2(${(paving.jointMetres * 0.5).toFixed(8)} + pavingHalfPixel), pavingDistance);
  float pavingResolved = 1.0 - smoothstep(${paving.fadeStartMetres.toFixed(8)}, ${paving.fadeEndMetres.toFixed(8)}, pavingFootprint);
  float pavingTileTone = mod(floor(pavingU) + 2.0 * mod(pavingRow, 2.0), 3.0) - 1.0;
  float pavingTone = (1.0 + pavingTileTone * ${paving.toneVariation.toFixed(8)} * pavingResolved)
    * (1.0 - max(pavingJoint.x, pavingJoint.y) * ${paving.jointDarken.toFixed(8)} * pavingResolved);
  diffuseColor.rgb *= mix(1.0, pavingTone, pavingCover);
}`;

export function installOrdinaryGroundBoundary(material: THREE.MeshStandardMaterial, paving = true, sharedSurface = false): void {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${key}/ordinary-ground-boundary-v2${paving ? '' : '/shared-paving'}${sharedSurface ? '/material-bits' : ''}`;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    const a = GROUND_BOUNDARY_ANCHORS;
    for (const [source, anchor] of [[shader.vertexShader, a.common], [shader.vertexShader, a.begin],
      [shader.fragmentShader, a.common], [shader.fragmentShader, a.color]]) {
      if (source.split(anchor).length !== 2) throw new Error(`Ground boundary shader anchor changed: ${anchor}`);
    }
    shader.vertexShader = shader.vertexShader.replace(a.common, `${a.common}\n${declarations}
attribute vec2 groundBoundaryEdge;
attribute vec3 groundBoundaryTint;
attribute float groundBoundaryMode;`).replace(a.begin, `${a.begin}
vGroundBoundaryEdge = groundBoundaryEdge;
vGroundBoundaryTint = groundBoundaryTint;
vGroundBoundaryMode = groundBoundaryMode;
vGroundPavingWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader.replace(a.common, `${a.common}\n${declarations}`)
      .replace(a.color, `${a.color}\n${(paving ? GROUND_BOUNDARY_FRAGMENT
        : GROUND_BOUNDARY_FRAGMENT.split('// Derivatives precede')[0])
        .replaceAll('vGroundBoundaryMode', sharedSurface ? 'mod(vGroundBoundaryMode, 16.0)' : 'vGroundBoundaryMode')}`);
  };
}
