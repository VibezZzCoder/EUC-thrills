/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { DISTRICT_EXTERIOR } from '../data/tuning.ts';
import { PROP_COLOURS } from '../data/props.ts';
import { positionHash01 } from '../shared/maths.ts';
import type { Prop } from '../level/plan.ts';
import type { DistrictExteriorAppearance } from './districtExterior.ts';
import { exteriorComposition, type ExteriorFinish } from './districtExteriorSites.ts';

/** Shared appearance owner, separate from layout/geometry. Existing wall,
 * roof and foliage palette values supply the colour; no light is introduced. */
export function createDistrictExteriorAppearance(): Pick<DistrictExteriorAppearance, 'materials' | 'colourFor'>
  & { readonly materialOwners: number; dispose(): void } {
  const roles = ['masonry','frame','roofEdge','planting','entry','glazing'] as const;
  const materials = Object.fromEntries(roles.map(role => [role,
    new THREE.MeshStandardMaterial({ vertexColors: true, ...DISTRICT_EXTERIOR[role] })])) as Record<ExteriorFinish, THREE.MeshStandardMaterial>;
  const colours = new Map<Prop, Record<ExteriorFinish, readonly [number, number, number]>>();
  let disposed = false;
  return { materials, materialOwners: roles.length,
    colourFor(prop, finish) {
      let cached = colours.get(prop);
      if (!cached) {
        const pieces = exteriorComposition(prop), body = pieces[0];
        if (!body) throw new Error('Exterior appearance needs an actual building composition');
        const roof = pieces.find(piece => piece.part === 'roofGable') ?? pieces[pieces.length - 1];
        const rgb = (hex: number, scale: number): [number, number, number] =>
          new THREE.Color(hex).multiplyScalar(scale).toArray() as [number, number, number];
        const entryIndex = Math.floor(positionHash01(prop.position.x, prop.position.z, 683)
          * DISTRICT_EXTERIOR.entryColours.length);
        cached = { masonry: rgb(body.tone, body.jitter * DISTRICT_EXTERIOR.wallTone),
          frame: rgb(PROP_COLOURS.buildingPale, DISTRICT_EXTERIOR.frameTone),
          roofEdge: rgb(roof.tone, roof.jitter * DISTRICT_EXTERIOR.roofTone),
          planting: rgb(PROP_COLOURS.shrubFoliage, DISTRICT_EXTERIOR.plantingTone),
          entry: rgb(DISTRICT_EXTERIOR.entryColours[entryIndex], 1), glazing: rgb(DISTRICT_EXTERIOR.glazingColour, 1) };
        colours.set(prop, cached);
      }
      return cached[finish];
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const material of Object.values(materials)) material.dispose();
      colours.clear();
    },
  };
}
