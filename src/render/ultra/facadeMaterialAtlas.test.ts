/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { BUILDING_FACADE } from '../../data/props.ts';
import { ULTRA } from '../../data/tuning.ts';
import { FACADE_ATLAS_SIZE, FACADE_PAGES, FACADE_PAGE_IDS, paintFacadeAtlas, type FacadePageId } from '../facadeAtlas.ts';
import {
  createUltraFacadeMaps,
  facadeCompanionLayout,
  isAlbedoGlass,
  paintFacadeCompanions,
  paintFacadeNormal,
  paintFacadeOrm,
} from './facadeMaterialAtlas.ts';

/**
 * The facade atlas's Ultra companions — M39 T4 (`docs/M39_ULTRA.md` §4,
 * package W6): 1024² normal and ORM pages on the albedo's own page rects,
 * with painted mip chains.
 *
 * What a test can hold is the contract every consumer relies on: the pages
 * land where `FACADE_PAGES` says, the gutters edge-extend so no mip averages
 * a page into its neighbour, the normals are unit vectors that flatten with
 * distance, the roughness only rises down the chain (the Toksvig promise that
 * keeps glass from sparkling at 60–120 m), and the glass mask is the albedo's
 * glass, texel for texel. Whether a reveal reads as a reveal from the chase
 * camera is the gauntlet's question.
 */

const SIZE = ULTRA.facade.mapSize;
const SCALE = SIZE / FACADE_ATLAS_SIZE;
const painted = paintFacadeCompanions(SIZE);

function decodeNormal(level: Uint8Array, texel: number): [number, number, number] {
  return [level[texel * 4] / 255 * 2 - 1, level[texel * 4 + 1] / 255 * 2 - 1, level[texel * 4 + 2] / 255 * 2 - 1];
}

function pageLayout(id: FacadePageId): ReturnType<typeof facadeCompanionLayout>[number] {
  return facadeCompanionLayout(SIZE).find((page) => page.id === id)!;
}

test('every page sits on the albedo\'s own rect, with the gutter the tuning table names', () => {
  const layout = facadeCompanionLayout(SIZE);
  assert.deepEqual(layout.map((page) => page.id), [...FACADE_PAGE_IDS]);
  for (const page of layout) {
    const rect = FACADE_PAGES[page.id];
    assert.equal(page.interior.x0 / SIZE, rect.u0, `${page.id} u0`);
    assert.equal(page.interior.y0 / SIZE, rect.v0, `${page.id} v0`);
    assert.equal(page.interior.x1 / SIZE, rect.u1, `${page.id} u1`);
    assert.equal(page.interior.y1 / SIZE, rect.v1, `${page.id} v1`);
    assert.equal(page.interior.x0 - page.cell.x0, ULTRA.facade.gutterTexels);
    assert.equal(page.cell.y1 - page.interior.y1, ULTRA.facade.gutterTexels);
  }
  // The cells tile the sheet exactly.
  const covered = new Uint8Array(SIZE * SIZE);
  for (const page of layout) {
    for (let y = page.cell.y0; y < page.cell.y1; y += 1) {
      for (let x = page.cell.x0; x < page.cell.x1; x += 1) covered[y * SIZE + x] += 1;
    }
  }
  assert.ok(covered.every((count) => count === 1), 'the cells overlap or leave a hole');
  assert.throws(() => facadeCompanionLayout(768), RangeError);
});

test('both chains run from the full size to one texel, RGBA8 at every level', () => {
  for (const chain of [painted.normal, painted.orm]) {
    assert.equal(chain.length, Math.log2(SIZE) + 1);
    chain.forEach((level, index) => {
      const edge = SIZE >> index;
      assert.equal(level.length, edge * edge * 4, `level ${index}`);
    });
  }
});

test('painting is deterministic, and the cached chains are the painted ones', () => {
  const again = paintFacadeCompanions(SIZE);
  for (let level = 0; level < painted.normal.length; level += 1) {
    assert.deepEqual(again.normal[level], painted.normal[level]);
    assert.deepEqual(again.orm[level], painted.orm[level]);
  }
  assert.deepEqual(paintFacadeNormal(SIZE)[0], painted.normal[0]);
  assert.equal(paintFacadeNormal(SIZE), paintFacadeNormal(SIZE), 'the chain is repainted per call');
  assert.deepEqual(paintFacadeOrm(SIZE)[3], painted.orm[3]);
});

test('the gutters copy the edges, so no mip averages one page into the next', () => {
  for (const chain of [painted.normal, painted.orm]) {
    const level = chain[0];
    for (const page of facadeCompanionLayout(SIZE)) {
      for (let y = page.cell.y0; y < page.cell.y1; y += 1) {
        const sy = Math.min(page.interior.y1 - 1, Math.max(page.interior.y0, y));
        for (let x = page.cell.x0; x < page.cell.x1; x += 1) {
          const sx = Math.min(page.interior.x1 - 1, Math.max(page.interior.x0, x));
          if (sx === x && sy === y) continue;
          for (let channel = 0; channel < 4; channel += 1) {
            if (level[(y * SIZE + x) * 4 + channel] !== level[(sy * SIZE + sx) * 4 + channel]) {
              assert.fail(`${page.id} gutter (${x}, ${y}) channel ${channel} is not its edge`);
            }
          }
        }
      }
    }
  }
});

test('every normal is a unit vector facing out of the wall, at every level', () => {
  painted.normal.forEach((level, index) => {
    const count = level.length / 4;
    for (let texel = 0; texel < count; texel += 1) {
      const [x, y, z] = decodeNormal(level, texel);
      const length = Math.hypot(x, y, z);
      if (Math.abs(length - 1) > 0.02) assert.fail(`level ${index} texel ${texel} has length ${length}`);
      if (z <= 0.3) assert.fail(`level ${index} texel ${texel} leans past the wall plane (z ${z})`);
      if (level[texel * 4 + 3] !== 255) assert.fail('normal alpha is not 255');
    }
  });
});

test('the mips flatten with distance: the far facade is a plane', () => {
  let previous = -Infinity;
  painted.normal.forEach((level, index) => {
    let sum = 0;
    const count = level.length / 4;
    for (let texel = 0; texel < count; texel += 1) sum += decodeNormal(level, texel)[2];
    const mean = sum / count;
    assert.ok(mean >= previous - 1e-3, `level ${index} is less flat (${mean}) than the level above (${previous})`);
    previous = mean;
  });
  assert.ok(previous > 0.99, `the last level is not flat (${previous})`);
  const first = painted.normal[0];
  let tilted = 0;
  for (let texel = 0; texel < first.length / 4; texel += 1) if (decodeNormal(first, texel)[2] < 0.95) tilted += 1;
  assert.ok(tilted > (SIZE * SIZE) / 100, 'the full-size page carries almost no relief');
});

test('the relief faces the right way: jambs into the opening, the head down, the sill up', () => {
  // The glass page's first glazed group, found from the albedo: its left jamb
  // faces +u, its right jamb −u, its head (the page's top) faces down, its sill up.
  const albedo = paintFacadeAtlas({ glassTint: BUILDING_FACADE.glassTint });
  const page = pageLayout('glass');
  const level = painted.normal[0];
  const midY = Math.floor((page.interior.y0 + page.interior.y1) / 2);
  let left = -1;
  let right = -1;
  for (let x = page.interior.x0; x < page.interior.x1; x += 1) {
    const glass = isAlbedoGlass(albedo, Math.floor(x / SCALE), Math.floor(midY / SCALE));
    if (glass && left < 0) left = x;
    if (!glass && left >= 0) { right = x - 1; break; }
  }
  assert.ok(left > page.interior.x0 && right > left, 'no glazed group found on the glass page');
  assert.ok(decodeNormal(level, midY * SIZE + left)[0] > 0.2, 'the left jamb does not face into the opening');
  assert.ok(decodeNormal(level, midY * SIZE + right)[0] < -0.2, 'the right jamb does not face into the opening');
  const midX = Math.floor((left + right) / 2);
  assert.ok(decodeNormal(level, (page.interior.y1 - 1) * SIZE + midX)[1] < -0.2, 'the head does not face down');
  assert.ok(decodeNormal(level, page.interior.y0 * SIZE + midX)[1] > 0.2, 'the sill does not face up');
  // The plain page is flat, unoccluded, wall-rough and not glass — a face
  // wearing it is a face with no map at all.
  const plain = pageLayout('plain');
  const orm = painted.orm[0];
  const wall = Math.round(ULTRA.facade.wallRoughness * 255);
  for (let y = plain.interior.y0; y < plain.interior.y1; y += 7) {
    for (let x = plain.interior.x0; x < plain.interior.x1; x += 7) {
      const texel = y * SIZE + x;
      assert.deepEqual([...level.subarray(texel * 4, texel * 4 + 4)], [128, 128, 255, 255]);
      assert.deepEqual([...orm.subarray(texel * 4, texel * 4 + 4)], [255, wall, 0, 0]);
    }
  }
});

test('the glass mask is the albedo\'s glass, texel for texel, and glass is glossy where walls are not', () => {
  const albedo = paintFacadeAtlas({ glassTint: BUILDING_FACADE.glassTint });
  const orm = painted.orm[0];
  const glassRoughness = Math.round(ULTRA.specular.glassRoughness * 255);
  let glassTexels = 0;
  for (const page of facadeCompanionLayout(SIZE)) {
    for (let y = page.interior.y0; y < page.interior.y1; y += 1) {
      for (let x = page.interior.x0; x < page.interior.x1; x += 1) {
        const glass = isAlbedoGlass(albedo, Math.floor(x / SCALE), Math.floor(y / SCALE));
        const texel = y * SIZE + x;
        const mask = orm[texel * 4 + 3];
        if (mask !== (glass ? 255 : 0)) assert.fail(`${page.id} (${x}, ${y}): mask ${mask}, albedo glass ${glass}`);
        if (glass) {
          glassTexels += 1;
          const roughness = orm[texel * 4 + 1];
          if (roughness !== glassRoughness && roughness !== Math.round(ULTRA.specular.metalRoughnessFloor * 255)) {
            assert.fail(`${page.id} glass texel roughness ${roughness}`);
          }
        } else if (orm[texel * 4 + 1] < Math.round(ULTRA.facade.spandrelRoughness * 255)) {
          assert.fail(`${page.id} (${x}, ${y}) wall is glossier than a spandrel`);
        }
        if (orm[texel * 4 + 2] !== 0) assert.fail('a facade texel is metal');
        if (orm[texel * 4] < 255 * 0.6 - 1) assert.fail('occlusion fell below its floor');
      }
    }
  }
  assert.ok(glassTexels > (SIZE * SIZE) / 10, 'the sheet carries little glass');
  // And the pages without glass carry none.
  for (const id of ['plain', 'spandrel', 'ground', 'groundLow'] as const) {
    const page = pageLayout(id);
    for (let y = page.interior.y0; y < page.interior.y1; y += 3) {
      for (let x = page.interior.x0; x < page.interior.x1; x += 3) {
        assert.equal(orm[(y * SIZE + x) * 4 + 3], 0, `${id} carries glass`);
      }
    }
  }
});

test('roughness only rises down the chain — Toksvig, floored at the mean underneath', () => {
  let previous = -Infinity;
  painted.orm.forEach((level, index) => {
    let sum = 0;
    const count = level.length / 4;
    for (let texel = 0; texel < count; texel += 1) sum += level[texel * 4 + 1];
    const mean = sum / count;
    assert.ok(mean >= previous - 0.5, `level ${index} mean roughness ${mean} fell below ${previous}`);
    previous = mean;
  });
  // Per texel: each parent is at least the mean of its four children, to a
  // byte of rounding.
  for (let index = 1; index < painted.orm.length; index += 1) {
    const parent = painted.orm[index];
    const child = painted.orm[index - 1];
    const edge = SIZE >> index;
    const childEdge = edge * 2;
    for (let y = 0; y < edge; y += 1) {
      for (let x = 0; x < edge; x += 1) {
        let sum = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          sum += child[((2 * y + dy) * childEdge + 2 * x + dx) * 4 + 1];
        }
        const value = parent[(y * edge + x) * 4 + 1];
        // Roughness is stored as α'^(1/2) and averaged as α'², so compare in α'².
        const parentA2 = (value / 255) ** 4;
        let childA2 = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          childA2 += (child[((2 * y + dy) * childEdge + 2 * x + dx) * 4 + 1] / 255) ** 4 / 4;
        }
        if (parentA2 + 0.02 < childA2) assert.fail(`level ${index} (${x}, ${y}) dropped: ${value} under ${sum / 4}`);
      }
    }
  }
  // Where glass meets a pier, the disagreeing normals lift the glass's
  // roughness well above the pane's own by the time the pier is a texel wide.
  const glassRoughness = ULTRA.specular.glassRoughness;
  const mid = painted.orm[3];
  let raised = 0;
  for (let texel = 0; texel < mid.length / 4; texel += 1) {
    if (mid[texel * 4 + 3] > 200 && mid[texel * 4 + 1] / 255 > glassRoughness + 0.1) raised += 1;
  }
  assert.ok(raised > 0, 'no mostly-glass texel was raised at level 3');
});

test('one view\'s maps: its own albedo copy with anisotropy, data chains, and an honest byte count', () => {
  const pixels = paintFacadeAtlas({ glassTint: BUILDING_FACADE.glassTint });
  for (const [max, expected] of [[1, 1], [8, 8], [32, ULTRA.facade.anisotropyCap]] as const) {
    const maps = createUltraFacadeMaps(max);
    try {
      assert.equal(maps.albedo.anisotropy, expected);
      assert.deepEqual(maps.albedo.image.data, pixels.data, 'the albedo copy is not the ordinary atlas');
      assert.equal(maps.albedo.colorSpace, THREE.SRGBColorSpace);
      for (const texture of [maps.normal, maps.orm]) {
        assert.equal(texture.colorSpace, THREE.NoColorSpace, `${texture.name} would be decoded as colour`);
        assert.equal(texture.generateMipmaps, false);
        assert.equal(texture.mipmaps.length, Math.log2(SIZE) + 1);
        assert.equal(texture.image.width, SIZE);
      }
      const chainBytes = (chain: readonly Uint8Array[]): number => chain.reduce((sum, level) => sum + level.byteLength, 0);
      assert.equal(
        maps.bytes,
        Math.round((FACADE_ATLAS_SIZE * FACADE_ATLAS_SIZE * 16) / 3) + chainBytes(paintFacadeNormal(SIZE)) + chainBytes(paintFacadeOrm(SIZE)),
      );
      assert.ok(maps.bytes < 13 * 1024 * 1024, `${maps.bytes} bytes is over the §5 facade line`);
    } finally {
      let disposed = 0;
      for (const texture of [maps.albedo, maps.normal, maps.orm]) texture.addEventListener('dispose', () => { disposed += 1; });
      maps.dispose();
      assert.equal(disposed, 3, 'a texture outlived its view');
    }
  }
});
