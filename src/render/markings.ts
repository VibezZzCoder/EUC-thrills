/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { MARKINGS, MARKING_PAINTS } from '../data/markings.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import type { LevelPlan } from '../level/plan.ts';
import { appendMarking, createRibbonTarget } from '../shared/markingRibbon.ts';

/**
 * The world's road paint, built from the `LevelPlan` and from nothing else.
 *
 * M7.5 stage 4. The slice's roads were geometrically complete, crowned, kerbed,
 * and dressed, and they still read as *corridors of grey* rather than as roads,
 * because the one thing every real road has and none of these had was paint.
 *
 * **All of it is one mesh and one draw call.** The two paints in
 * `data/markings.ts` differ by vertex colour rather than by material — the same
 * arrangement `render/props.ts` uses to put a hundred differently-toned trees in
 * one instanced mesh, and it is why adding the park's duller paint alongside the
 * city's cost nothing.
 *
 * Two things it deliberately does not do:
 *
 * - **It never casts a shadow**, and it always receives one. Paint is not a
 *   thing standing on the road, it is the road; a 16 cm strip 15 mm up casting
 *   into a 2048 cascade would produce a dashed grey line beside every dashed
 *   white one. Receiving matters more than it sounds: an unlit strip would keep
 *   its full brightness through a tree's shadow and read as glowing.
 * - **It asks the plan's heightfield about each finished edge vertex.** The
 *   level builder resolves and clips the centreline, but a crowned or sloped
 *   road puts the two ribbon edges at different heights. Sampling the same
 *   `LevelPlan` here keeps the visible paint on the visible road without making
 *   the renderer a gameplay authority.
 */

export interface MarkingsView {
  readonly group: THREE.Group;
  /** Painted runs in the plan, after the builder's clipping. */
  readonly runs: number;
  readonly triangles: number;
  /** Colour-pass draw calls. One, unless there is no paint at all. */
  readonly drawCalls: number;
  /** Total painted length, metres. For the budget and for the tests. */
  readonly paintedLength: number;
  dispose(): void;
}

export function createMarkings(plan: LevelPlan): MarkingsView {
  const group = new THREE.Group();
  group.name = 'level-markings';

  const markings = plan.markings ?? [];
  const target = createRibbonTarget();
  const colour = new THREE.Color();
  let triangles = 0;
  let paintedLength = 0;

  for (const marking of markings) {
    const paint = MARKING_PAINTS[marking.paint] ?? MARKING_PAINTS.road;
    // `setHex` decodes sRGB to linear on its own. A second conversion here
    // would land the paint at about a seventh of its authored reflectance —
    // `DESIGN.md` §6b, and the trap this project has now walked into five
    // times in five different files.
    colour.setHex(paint.albedo);
    triangles += appendMarking(
      marking.points,
      marking.width / 2,
      marking.dash,
      marking.gap,
      { r: colour.r, g: colour.g, b: colour.b },
      paint.wear,
      target,
      (x, z) => fieldHeightAt(plan.heightfield, plan.surround, x, z) + MARKINGS.lift,
    );
    for (let index = 1; index < marking.points.length; index += 1) {
      paintedLength += Math.hypot(
        marking.points[index].x - marking.points[index - 1].x,
        marking.points[index].z - marking.points[index - 1].z,
      );
    }
  }

  if (target.indices.length === 0) {
    return {
      group,
      runs: 0,
      triangles: 0,
      drawCalls: 0,
      paintedLength: 0,
      dispose(): void { group.removeFromParent(); },
    };
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(target.colors, 3));
  geometry.setIndex(target.indices);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0,
    // The paint's own tone and its wear both travel on the vertex colour, which
    // is what keeps two paints and every scuffed metre of them in one material.
    vertexColors: true,
  });
  // Belt and braces against z-fighting, and both halves are needed. The 15 mm
  // lift alone loses at a hundred metres, where the depth buffer's resolution
  // is coarser than the gap; the polygon offset alone loses on a mesh whose
  // vertices only exist every metre, because between two samples the ground can
  // rise above a straight line drawn across them.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'level-markings-paint';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);

  return {
    group,
    runs: markings.length,
    triangles,
    drawCalls: 1,
    paintedLength,

    dispose(): void {
      geometry.dispose();
      material.dispose();
      group.clear();
      group.removeFromParent();
    },
  };
}
