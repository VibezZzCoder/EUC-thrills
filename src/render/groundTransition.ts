/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { SURFACES, materialAppearance, type MaterialId } from '../data/surfaces.ts';
import { SHARED_GROUND } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import { groundHazardMask, groundPrecisePatchMask } from './groundBoundaryPolicy.ts';

const materialCodes = ['grass', 'dirt', 'gravel', 'pavement', 'roughPavement', 'brick', 'concrete', 'wood'] as const;
const code = (id: MaterialId) => materialCodes.indexOf(id as typeof materialCodes[number]) + 1;

/** Exact source-cell neighbours, two four-bit ids per byte. Protected ground
 * has zero channels; a precise driveway, spill or hole never borrows a tint
 * from the coarse grid below it. This paints albedo, never geometry/surfaces. */
export function paintGroundTransitions(plan: LevelPlan): Uint8Array {
  const field = plan.heightfield, columns = field.columns - 1, rows = field.rows - 1;
  const out = new Uint8Array(columns * rows * 4);
  const excluded = groundPrecisePatchMask(plan, groundHazardMask(plan));
  const at = (x: number, z: number): number => x < 0 || z < 0 || x >= columns || z >= rows
    ? 0 : excluded[z * columns + x] ? 0 : code(SURFACES[field.surfaces[z * columns + x]].material);
  for (let z = 0; z < rows; z++) for (let x = 0; x < columns; x++) {
    const own = at(x, z), p = (z * columns + x) * 4;
    if (!own) continue;
    out[p] = at(x - 1, z) + 16 * at(x + 1, z);
    out[p + 1] = at(x, z - 1) + 16 * at(x, z + 1);
    out[p + 2] = own; out[p + 3] = 255;
  }
  return out;
}

export function createGroundTransitions(plan: LevelPlan) {
  const field = plan.heightfield, columns = field.columns - 1, rows = field.rows - 1;
  const pixels = paintGroundTransitions(plan);
  const texture = new THREE.DataTexture(pixels, columns, rows);
  texture.name = 'shared-ground-neighbourhood'; texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  let disposed = false;
  const colours = materialCodes.map(id => new THREE.Color(plan.palette?.[id] ?? materialAppearance(id).albedo));
  // These values are captured with the generated GLSL. Distinct live world
  // owners must not share a program whose origin or colour literals differ.
  const programCacheKey = JSON.stringify([field.originX.toFixed(8), field.originZ.toFixed(8),
    field.spacing.toFixed(8), columns.toFixed(1), rows.toFixed(1),
    colours.slice(0, 5).map(c => [c.r.toFixed(8), c.g.toFixed(8), c.b.toFixed(8)])]);
  return {
    texture, bytes: pixels.byteLength, programCacheKey,
    fragment(id: MaterialId, cover: string): string {
      const own = code(id);
      // Public hard paving keeps its crisp boundary. Natural surfaces share
      // a narrow worn shoulder; asphalt receives subtle aggregate weathering.
      if (own < 1 || own > 5) return '';
      const colour = colours[own - 1];
      const literals = colours.slice(0, 5).map((c, i) =>
        `${i === 0 ? 'if' : 'else if'} (transitionCode < ${(i + 1.5).toFixed(1)}) transitionTone = vec3(${c.r.toFixed(8)},${c.g.toFixed(8)},${c.b.toFixed(8)});`).join('\n');
      return /* glsl */ `
vec2 transitionGrid = (vSharedGroundWorld - vec2(${field.originX.toFixed(8)},${field.originZ.toFixed(8)})) / ${field.spacing.toFixed(8)};
vec2 transitionCell = floor(transitionGrid), transitionLocal = fract(transitionGrid);
vec4 transitionData = floor(texture2D(sharedGroundNeighbours, (transitionCell + 0.5) / vec2(${columns.toFixed(1)},${rows.toFixed(1)})) * 255.0 + 0.5);
float transitionInside = step(0.0, transitionCell.x) * step(0.0, transitionCell.y)
  * (1.0 - step(${columns.toFixed(1)},transitionCell.x)) * (1.0 - step(${rows.toFixed(1)},transitionCell.y))
  * (1.0 - step(0.5,abs(transitionData.b - ${own.toFixed(1)}))) * (1.0 - ${cover});
vec4 transitionCodes = vec4(mod(transitionData.r,16.0),floor(transitionData.r/16.0),mod(transitionData.g,16.0),floor(transitionData.g/16.0));
vec4 transitionDistances = vec4(transitionLocal.x,1.0-transitionLocal.x,transitionLocal.y,1.0-transitionLocal.y) * ${field.spacing.toFixed(8)};
for (int transitionEdge=0; transitionEdge<4; transitionEdge++) {
  float transitionCode = transitionCodes[transitionEdge];
  float transitionDistance = transitionDistances[transitionEdge];
  float transitionWidth = min(${SHARED_GROUND.shoulderMetres.toFixed(8)},${(field.spacing * 0.2).toFixed(8)})
    * (0.78 + 0.22 * sin(vSharedGroundWorld.x * 11.7 + vSharedGroundWorld.y * 7.3));
  float transitionWeight = (1.0-smoothstep(0.0,transitionWidth,transitionDistance)) * transitionInside
    * step(0.5,transitionCode) * (1.0-step(5.5,transitionCode))
    * step(0.5,abs(transitionCode-${own.toFixed(1)}));
  vec3 transitionTone = vec3(1.0);
  ${literals}
  // The road stays readable: its shoulder is slight, while natural edges
  // receive the stronger soil/aggregate blend within their original region.
  diffuseColor.rgb *= mix(vec3(1.0),clamp(transitionTone / vec3(${colour.r.toFixed(8)},${colour.g.toFixed(8)},${colour.b.toFixed(8)}),vec3(0.55),vec3(1.55)),
    transitionWeight * ${own <= 3 ? '0.38' : '0.12'});
}
`;
    },
    dispose() { if (!disposed) { disposed = true; texture.dispose(); } },
  };
}
