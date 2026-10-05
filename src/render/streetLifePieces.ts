/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { Object3D } from 'three';
import { STREET_LIFE } from '../data/streetLife.ts';
import { WHEEL } from '../data/tuning.ts';
import type { LevelPlan } from '../level/plan.ts';
import { streetFronts, streetDoorOffset, type StreetFront } from '../level/streetFronts.ts';
import { collectStreetPavingPieces, type StreetPavingPieces } from './streetGroundView.ts';
import { decorShapes, DecorShape, countDecorDraws, type DecorDrawPlan,
  type DecorTexturePlan, type DecorAllocationPrice, decorSupplementPrice,
  type DecorSupplementPrice } from './decorShapePlan.ts';

export interface StreetLifePieces {
  readonly fronts: readonly StreetFront[];
  readonly panels: readonly DecorShape[];
  readonly batches: Readonly<Record<string, readonly DecorShape[]>>;
  readonly body: DecorShape;
  readonly head: DecorShape;
  readonly paving: StreetPavingPieces | null;
  readonly price: DecorAllocationPrice;
}

/** Original selector and shape emission, without geometry/material/texture/GPU
 * allocation. Saved operations retain the source's individual Float32 writes. */
export function collectStreetLifePieces(plan: LevelPlan): StreetLifePieces {
  const fronts = streetFronts(plan);
    const panels: DecorShape[] = [];
    const batches: Record<string, DecorShape[]> = { masonry: [], wood: [], metal: [], rubber: [], glass: [] };
    const transform = new Object3D();
    const local = new Object3D();
    const addShape = (front: StreetFront, geometry: DecorShape,
      x: number, y: number, z: number, hex: number, tilt = 0, yaw = 0, role = 'masonry'): void => {
      geometry.ensureIndex();
      local.position.set(x, y, z);
      local.rotation.set(tilt, yaw, 0);
      local.scale.setScalar(1);
      local.updateMatrix();
      transform.position.set(front.position.x, front.position.y, front.position.z);
      transform.rotation.set(0, front.yaw, 0);
      transform.updateMatrix();
      geometry.applyMatrix4(local.matrix).applyMatrix4(transform.matrix);
      geometry.setColour(hex);
      batches[role].push(geometry);
    };
    const addBox = (front: StreetFront, x: number, y: number, z: number,
      w: number, h: number, d: number, hex: number, tilt = 0, role = 'masonry'): void =>
      addShape(front, decorShapes.box(w, h, d), x, y, z, hex, tilt, 0, role);
    const accents = [0x315f57, 0x914e3d, 0x354f65];
    fronts.forEach((front, shop) => {
      const w = front.width, depth = STREET_LIFE.recessDepth;
      const accent = accents[shop];
      const door = streetDoorOffset(front);
      const side = (front.faceWidth - w) / 2;
      const wall = shop === 0 ? 0xc0ae8b : shop === 1 ? 0xb6b996 : 0xabb0a7;
      for (const sign of [-1, 1]) {
        addBox(front, sign * (w / 2 + side / 2), 2.15, -0.43, side, 4.3, 0.88, wall);
        addBox(front, sign * (w / 2 - 0.14), 1.49, -depth / 2, 0.28, 2.98, depth, wall);
      }
      addBox(front, 0, 3.60, -0.43, w, 1.40, 0.88, wall);
      // A full-face stone head band and side reveals tie the tenant bay to
      // the original upper storeys instead of ending it as a coloured insert.
      addBox(front, 0, 4.20, -0.01, front.faceWidth, 0.18, 0.22, 0x898779);
      for (const sign of [-1, 1]) {
        addBox(front, sign * (front.faceWidth / 2 - 0.09), 2.12, -0.02,
          0.18, 4.16, 0.18, 0x949282);
      }
      addBox(front, 0, 2.99, -depth / 2, w, 0.14, depth, 0x665f51);
      addBox(front, 0, 0.13, -0.18, front.faceWidth, 0.26, 0.40, 0x72766a);
      addBox(front, 0, 0.025, -depth / 2, w, 0.05, depth, 0x988e77);
      addBox(front, 0, 1.48, -depth + 0.04, w, 2.96, 0.08,
        shop === 0 ? 0x76644f : shop === 1 ? 0x71806a : 0x697a7b);
      // Floor joints and ceiling beams recede into the room. Real geometry
      // gives the opening a depth axis even when the street view is frontal.
      for (let row = 0; row < 4; row++) for (let column = 0; column < 10; column++) {
        addBox(front, -w / 2 + (column + 0.5) * w / 10, 0.056, -0.55 - row * 1.02,
          w / 10 - 0.035, 0.012, 0.98, (row + column) % 2 ? 0xa89d82 : 0x8d866f);
      }
      for (const z of [-0.65, -2.05, -3.6]) {
        addBox(front, 0, 2.84, z, w - 0.4, 0.16, 0.18, 0x91866b, 0, 'wood');
      }
      // Distinct portal rhythms: cafe timber bays, grocer's broad produce
      // window, and repair's deep industrial portal with a closed side panel.
      const piers = shop === 0 ? [-w * 0.48, -w * 0.12, w * 0.23, w * 0.48]
        : shop === 1 ? [-w * 0.48, -w * 0.23, w * 0.48] : [-w * 0.48, w * 0.48];
      for (const x of piers) {
        addBox(front, x, 1.48, -0.47, shop === 2 ? 0.44 : 0.27, 2.96, 1.06,
          shop === 0 ? 0x77553b : shop === 2 ? 0x8e8573 : accent, 0, shop === 0 ? 'wood' : 'masonry');
        addBox(front, x, 1.48, -0.01, shop === 2 ? 0.48 : 0.31, 2.96, 0.12, accent);
      }
      // A closed door is set a full metre behind the facade, with a clear
      // threshold, jambs and lintel. It does not invite walking into the solid.
      for (const x of [door - 0.76, door + 0.76]) {
        addBox(front, x, 1.39, -0.64, 0.16, 2.70, 1.34, wall);
        addBox(front, x, 1.39, -0.015, 0.20, 2.70, 0.11, accent);
      }
      addBox(front, door, 2.72, -0.64, 1.68, 0.18, 1.34, wall);
      addBox(front, door, 0.095, -0.64, 1.58, 0.19, 1.32, 0xc0b28e);
      addBox(front, door, 1.43, -1.26, 1.34, 2.42, 0.12, shop === 0 ? 0x62482f : 0x31494c, 0, 'wood');
      addBox(front, door, 1.70, -1.185, 1.07, 1.45, 0.025, 0x536a68);
      addBox(front, door + 0.45, 1.25, -1.12, 0.075, 0.38, 0.09, 0xc9b786, 0, 'metal');
      for (const y of [0.30, 2.81]) addBox(front, 0, y, -0.07, w, 0.13, 0.24, accent, 0, 'metal');
      // Closed window glass sits behind the real frames. One shared low-opacity
      // batch preserves the room depth while separating the street from it.
      const glassLeft = shop === 1 ? door + 0.88 : -w * 0.48 + 0.16;
      const glassRight = shop === 1 ? w * 0.48 - 0.16 : door - 0.88;
      const glassWidth = glassRight - glassLeft;
      if (glassWidth > 0) {
        addShape(front, decorShapes.plane(glassWidth, 2.29),
          (glassLeft + glassRight) / 2, 1.57, -0.035, 0x94b0ab, 0, 0, 'glass');
        for (const fraction of [0.24, 0.70]) {
          const reflection = decorShapes.plane(0.032, 0.91);
          reflection.rotateZ(-0.40);
          addShape(front, reflection, glassLeft + glassWidth * fraction, 1.97, -0.026,
            0xb0c3bc, 0, 0, 'glass');
        }
      }
      if (shop === 2) {
        const strip = (w * 0.22 - 1.68) / 2;
        for (const sign of [-1, 1]) {
          const x = door + sign * (0.84 + strip / 2);
          addBox(front, x, 1.47, -0.51, strip, 2.40, 0.12, 0x72818a, 0, 'metal');
          for (let y = 0.37; y < 2.6; y += 0.23) {
            addBox(front, x, y, -0.435, strip - 0.02, 0.027, 0.025, 0x52636d, 0, 'metal');
          }
        }
      }
      const signWidth = STREET_LIFE.signWidth;
      let signX = shop === 2 ? -w * 0.13 : 0;
      let nearestLamp = Infinity;
      for (const prop of plan.props ?? []) {
        if (prop.kind !== 'lampPost') continue;
        const dx = prop.position.x - front.position.x, dz = prop.position.z - front.position.z;
        const lateral = Math.cos(front.yaw) * dx - Math.sin(front.yaw) * dz;
        const depth = Math.sin(front.yaw) * dx + Math.cos(front.yaw) * dz;
        if (depth <= 0 || depth > STREET_LIFE.maximumStreetGap || Math.abs(lateral) > 2.8
          || Math.abs(lateral) >= nearestLamp) continue;
        nearestLamp = Math.abs(lateral);
        signX = -Math.sign(lateral || 1) * Math.min(STREET_LIFE.signAvoidanceOffset,
          front.faceWidth / 2 - (signWidth + 0.14) / 2 - 0.35);
      }
      addBox(front, signX, 3.76, -0.01, signWidth + 0.14, 1.05, 0.15, 0xe0cfaa);
      const panel = decorShapes.plane(signWidth, 0.94);
      panel.translate(signX, 3.76, 0.07);
      panel.remapV(2 - shop, 3);
      transform.position.set(front.position.x, front.position.y, front.position.z);
      transform.rotation.set(0, front.yaw, 0); transform.updateMatrix();
      panel.applyMatrix4(transform.matrix); panels.push(panel);
      // A shallow double-faced blade meets a moving rider's view along the
      // street. Its lower rim stays above 3.3 m; no reachable decorative solid
      // or original lamp is moved to manufacture a sightline.
      const bladeX = -w * 0.42;
      addBox(front, bladeX, 3.77, 1.30, 0.15, 0.90, 2.90, accent, 0, 'metal');
      addBox(front, bladeX, 4.14, 0.79, 0.08, 0.11, 1.73, 0x69796d, 0, 'metal');
      for (const direction of [-1, 1]) {
        const blade = decorShapes.plane(2.73, 0.73);
        blade.remapV(2 - shop, 3);
        blade.rotateY(direction * Math.PI / 2);
        blade.translate(bladeX + direction * 0.081, 3.77, 1.30);
        blade.applyMatrix4(transform.matrix);
        panels.push(blade);
      }
      if (shop === 1) {
        for (let stripe = 0; stripe < 16; stripe++) {
          const x = -w / 2 + (stripe + 0.5) * w / 16;
          addBox(front, x, 3.22, 0.32, w / 16, 0.055, 0.76, stripe % 2 ? 0xd9c6a1 : accent, 0.16);
          addBox(front, x, 3.10, 0.67, w / 16, 0.10, 0.05, stripe % 2 ? 0xd9c6a1 : accent);
        }
      } else if (shop === 0) {
        addBox(front, 0, 3.16, 0.20, w, 0.11, 0.52, accent);
      }
      for (const x of [-w * 0.40, w * 0.15]) {
        addBox(front, x, 2.30, -0.04, 0.018, 0.50, 0.012, 0x9ab4af, -0.10);
      }
      if (shop === 0) {
        // A customer table in front, service counter in the middle and a
        // back bar behind the clerks give the cafe three working layers.
        addBox(front, -w * 0.16, 0.55, -2.28, w * 0.59, 0.95, 0.76, 0x835939, 0, 'wood');
        addBox(front, -w * 0.16, 1.07, -2.28, w * 0.61, 0.09, 0.86, 0xbfa77a, 0, 'wood');
        // One small indoor houseplant marks the quiet seating area. Its pot and foliage
        // remain inside the protected room, clear of the table and service lane.
        const plantX = w * 0.19, plantZ = -1.59;
        addShape(front, decorShapes.cylinder(0.225, 0.17, 0.43, 10),
          plantX, 0.28, plantZ, 0x997358);
        addShape(front, decorShapes.cylinder(0.023, 0.032, 0.62, 6),
          plantX, 0.72, plantZ, 0x737954, 0, 0, 'wood');
        for (const [dx, y, dz, radius] of [[-0.13, 0.90, 0.015, 0.22], [0.12, 1.00, -0.05, 0.20],
          [-0.045, 1.17, 0.015, 0.18]] as const) {
          addShape(front, decorShapes.icosahedron(radius, 0), plantX + dx,
            y, plantZ + dz, 0x78865c);
        }
        for (const x of [-w * 0.37]) {
          addShape(front, decorShapes.cylinder(0.55, 0.55, 0.08, 12), x, 0.79, -0.99, 0x987249, 0, 0, 'wood');
          addBox(front, x, 0.41, -0.99, 0.10, 0.74, 0.10, 0x4b4c41, 0, 'metal');
          addShape(front, decorShapes.cylinder(0.13, 0.10, 0.21, 10), x + 0.12, 0.935, -0.99, 0xded0a8);
          addShape(front, decorShapes.torus(0.095, 0.025, 6, 12), x + 0.25, 0.94, -0.99, 0xded0a8);
          for (const offset of [-0.64, 0.64]) {
            addShape(front, decorShapes.cylinder(0.23, 0.23, 0.07, 10), x + offset, 0.51, -1.17, 0xa47a4c, 0, 0, 'wood');
            for (const leg of [-0.12, 0.12]) addBox(front, x + offset + leg, 0.28, -1.17,
              0.045, 0.40, 0.32, 0x4d5851, 0, 'metal');
          }
        }
        addBox(front, -w * 0.16, 0.68, -3.99, w * 0.62, 1.18, 0.62, 0x69523c, 0, 'wood');
        addBox(front, -w * 0.34, 1.52, -3.94, 1.35, 0.50, 0.43, 0x7c9696, 0, 'metal');
        addBox(front, -w * 0.34, 1.82, -3.94, 1.45, 0.09, 0.50, 0xc1c5b1, 0, 'metal');
        for (const x of [-w * 0.37, -w * 0.31]) addShape(front,
          decorShapes.cylinder(0.10, 0.08, 0.18, 8), x, 1.24, -2.05, 0xe5d2a5);
        // Keep the display beside the service lane: the worker's full body
        // turns behind the clear pane rather than disappearing behind pastries.
        addBox(front, -w * 0.03, 1.30, -2.28, 1.35, 0.38, 0.46, 0x9c835f, 0, 'wood');
        for (let i = 0; i < 5; i++) addShape(front, decorShapes.sphere(0.11, 8, 5),
          -w * 0.03 - 0.48 + i * 0.24, 1.56, -2.28, 0xd2a267);
        for (const y of [2.0, 2.46]) {
          addBox(front, -w * 0.12, y, -4.05, w * 0.60, 0.075, 0.44, 0xaa8658, 0, 'wood');
          for (let i = 0; i < 9; i++) addShape(front, decorShapes.cylinder(0.11, 0.10, 0.23, 8),
            -w * 0.37 + i * w * 0.065, y + 0.15, -4.03, 0xdac69c);
        }
        for (const x of [-w * 0.30, -w * 0.02]) {
          addBox(front, x, 2.63, -2.13, 0.022, 0.48, 0.022, 0x53564b, 0, 'metal');
          addShape(front, decorShapes.cone(0.30, 0.23, 12), x, 2.34, -2.13, 0xb29662, 0, 0, 'metal');
        }
      } else if (shop === 1) {
        for (let row = 0; row < 2; row++) for (let crate = 0; crate < 5; crate++) {
          const x = -w * 0.06 + crate * w * 0.10;
          const y = 0.43 + row * 0.28, z = -0.94 - row * 0.60;
          addBox(front, x, y, z, w * 0.091, 0.40, 0.50, 0x876241, 0, 'wood');
          addBox(front, x, y + 0.22, z + 0.23, w * 0.097, 0.08, 0.06, 0xc19a63, 0, 'wood');
          for (let fruit = 0; fruit < 5; fruit++) addShape(front, decorShapes.sphere(0.13, 8, 5),
            x - w * 0.032 + fruit * w * 0.016, y + 0.30 + (fruit % 2) * 0.045, z,
            crate % 2 ? 0xc07534 : 0x94a952);
        }
        addBox(front, w * 0.12, 0.93, -3.10, w * 0.58, 0.15, 0.72, 0xa8996f, 0, 'wood');
        for (const y of [1.43, 1.99, 2.53]) {
          addBox(front, w * 0.11, y, -4.03, w * 0.65, 0.085, 0.48, 0xa58b5b, 0, 'wood');
          for (let i = 0; i < 10; i++) addBox(front, -w * 0.16 + i * w * 0.06,
            y + 0.17, -4.02, 0.28, 0.26, 0.28, i % 3 ? 0xb8b983 : 0xb98253);
        }
      } else {
        addBox(front, -w * 0.30, 0.94, -2.13, w * 0.26, 0.11, 0.88, 0xaab9b9, 0, 'metal');
        for (const x of [-w * 0.41, -w * 0.19]) {
          addBox(front, x, 0.51, -2.13, 0.12, 0.80, 0.78, 0x4c626a, 0, 'metal');
        }
        addBox(front, -w * 0.31, 1.18, -2.13, 0.65, 0.34, 0.36, 0x967b52, 0, 'wood');
        addBox(front, -w * 0.15, 0.83, -4.02, w * 0.60, 1.43, 0.56, 0x415963, 0, 'metal');
        const cabinetColours = [0x536e78, 0x708780, 0x4b6571, 0x688187];
        for (let unit = 0; unit < 4; unit++) {
          const x = -w * 0.365 + unit * w * 0.143;
          addBox(front, x, 0.84, -3.71, w * 0.133, 1.31, 0.035, cabinetColours[unit], 0, 'metal');
          for (let drawer = 0; drawer < 5; drawer++) {
            const y = 0.31 + drawer * 0.25;
            addBox(front, x, y, -3.675, w * 0.127, 0.025, 0.025, 0x364e55, 0, 'metal');
            addBox(front, x, y + 0.12, -3.64, 0.24, 0.035, 0.045, 0xbac5b4, 0, 'metal');
          }
        }
        addBox(front, -w * 0.30, 0.90, -1.675, w * 0.26, 0.075, 0.035, 0x596e72, 0, 'metal');
        for (const x of [-w * 0.34, -w * 0.14]) addShape(front,
          decorShapes.torus(0.28, 0.065, 8, 20), x, 2.06, -4.09, 0x293b3e, 0, 0, 'rubber');
        for (let i = 0; i < 5; i++) {
          const x = w * 0.02 + i * 0.31;
          addBox(front, x, 2.03, -4.11, 0.045, 0.49, 0.045, 0xb8c5bd, 0, 'metal');
          addBox(front, x, 2.30, -4.11, 0.16, 0.07, 0.055, 0xb8c5bd, 0, 'metal');
        }
        // Workshop wheel shares the ridden tyre's scale. A low service stand
        // lifts it for work without turning the display into a human-size EUC.
        const tyreTube = WHEEL.tyreWidth / 2;
        addBox(front, w * 0.04, 0.18, -1.41, 0.44, 0.12, 0.54, 0x617875, 0, 'metal');
        addBox(front, w * 0.04, 0.32, -1.41, 0.09, 0.22, 0.13, 0x617875, 0, 'metal');
        addShape(front, decorShapes.torus(WHEEL.tyreDiameter / 2 - tyreTube,
          tyreTube, 8, 20), w * 0.04, 0.68, -1.41, 0x25383b, 0, 0, 'rubber');
        addBox(front, w * 0.04, 0.76, -1.41, 0.27, 0.39, 0.22, 0x91acad, 0, 'metal');
        addBox(front, w * 0.04, 0.75, -1.286, 0.18, 0.24, 0.025, 0xc0cab1);
        addBox(front, w * 0.04, 0.974, -1.41, 0.20, 0.045, 0.14, 0x4e6667, 0, 'rubber');
      }
    });
  const draws: DecorDrawPlan[] = [];
  const textures: DecorTexturePlan[] = [];
  const body = decorShapes.box(1, 1, 1), head = decorShapes.sphere(1, 8, 6);
  if (fronts.length) {
    for (const [role, pieces] of Object.entries(batches)) {
      if (pieces.length) draws.push({ key: `street-life-${role}`, materialKey: `street-life-${role}`, pieces });
    }
    draws.push({ key: 'street-life-shopfronts', materialKey: 'street-life-shopfronts', pieces: panels });
    const people = fronts.length * STREET_LIFE.peoplePerShop;
    draws.push({ key: 'street-life-indoor-bodies', materialKey: 'street-life-person',
      pieces: [body], instances: people * 12, instanceColors: true });
    draws.push({ key: 'street-life-indoor-heads', materialKey: 'street-life-person',
      pieces: [head], instances: people, instanceColors: true });
    textures.push({ key: 'original-street-shop-atlas', width: STREET_LIFE.atlasWidth,
      height: STREET_LIFE.atlasPageHeight * STREET_LIFE.storefronts, mipmaps: true });
  }
  const paving = collectStreetPavingPieces(plan);
  const base = countDecorDraws(draws, textures);
  const price: DecorAllocationPrice = paving ? { ...base,
    drawCalls: base.drawCalls + 1, colourTriangles: base.colourTriangles + paving.colourTriangles,
    geometryBytes: base.geometryBytes + paving.geometryBytes,
    geometryOwners: base.geometryOwners + 1, materialOwners: base.materialOwners + 1 } : base;
  return { fronts, panels, batches, body, head, paving, price };
}

export function countStreetLifeDecor(plan: LevelPlan,
  pieces: StreetLifePieces = collectStreetLifePieces(plan)): DecorSupplementPrice {
  return decorSupplementPrice(pieces.price);
}
