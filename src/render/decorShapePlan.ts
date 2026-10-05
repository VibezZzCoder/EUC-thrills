/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** GPU-free primitive emission records. The finite topology cases below are the
 * constructors currently used by the three decor owners, pinned to three 0.185.1.
 * Geometry realization replays every recorded operation in its original order;
 * transforms are not combined, because that would change Float32 rounding. */
export type DecorPrimitive = 'box' | 'plane' | 'cylinder' | 'cone' | 'sphere'
  | 'torus' | 'icosahedron' | 'depot-cab' | 'quad';

export type DecorShapeOperation =
  | { readonly kind: 'translate'; readonly values: readonly number[] }
  | { readonly kind: 'rotateX' | 'rotateY' | 'rotateZ'; readonly angle: number }
  | { readonly kind: 'matrix'; readonly values: readonly number[] }
  | { readonly kind: 'quaternion'; readonly values: readonly number[] }
  | { readonly kind: 'drop-uv' | 'ensure-index' }
  | { readonly kind: 'colour'; readonly hex: number }
  | { readonly kind: 'remap-v'; readonly offset: number; readonly divisor: number };

export interface DecorShapeTopology {
  readonly vertices: number;
  readonly indices: number;
  readonly maximumIndex: number;
  readonly indexed: boolean;
  readonly uv: boolean;
  readonly colour: boolean;
}

function segments(value: number, minimum = 1): number {
  const result = Math.floor(value);
  if (!Number.isSafeInteger(result) || result < minimum) throw new Error('Unsupported decor primitive segmentation');
  return result;
}

/** Mutable only while an owner emits a piece. Admission and allocation consume
 * the same completed records; callers must not change them between the two. */
export class DecorShape {
  readonly operations: DecorShapeOperation[] = [];
  readonly primitive: DecorPrimitive;
  readonly parameters: readonly number[];
  readonly vertices?: readonly (readonly number[])[];
  constructor(primitive: DecorPrimitive, parameters: readonly number[],
    vertices?: readonly (readonly number[])[]) {
    this.primitive = primitive; this.parameters = parameters; this.vertices = vertices;
  }

  translate(x: number, y: number, z: number): this {
    this.operations.push({ kind: 'translate', values: [x, y, z] }); return this;
  }
  rotateX(angle: number): this { this.operations.push({ kind: 'rotateX', angle }); return this; }
  rotateY(angle: number): this { this.operations.push({ kind: 'rotateY', angle }); return this; }
  rotateZ(angle: number): this { this.operations.push({ kind: 'rotateZ', angle }); return this; }
  applyMatrix4(matrix: { readonly elements: readonly number[] }): this {
    if (matrix.elements.length !== 16) throw new Error('Decor matrix must have sixteen components');
    this.operations.push({ kind: 'matrix', values: [...matrix.elements] }); return this;
  }
  applyQuaternion(value: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }): this {
    this.operations.push({ kind: 'quaternion', values: [value.x, value.y, value.z, value.w] }); return this;
  }
  deleteAttribute(name: 'uv'): this {
    if (name !== 'uv') throw new Error('Unsupported decor attribute removal');
    this.operations.push({ kind: 'drop-uv' }); return this;
  }
  ensureIndex(): this { this.operations.push({ kind: 'ensure-index' }); return this; }
  setColour(hex: number): this { this.operations.push({ kind: 'colour', hex }); return this; }
  remapV(offset: number, divisor: number): this {
    this.operations.push({ kind: 'remap-v', offset, divisor }); return this;
  }

  topology(): DecorShapeTopology {
    let vertices: number, indices: number, indexed = true, uv = true;
    const p = this.parameters;
    switch (this.primitive) {
      case 'box': vertices = 24; indices = 36; break;
      case 'plane': vertices = 4; indices = 6; break;
      case 'cylinder': {
        const radial = segments(p[3]);
        // All emitted cylinders use the source constructor's one height row,
        // closed end caps and full circumference. A zero cone tip omits both
        // its torso triangle and its cap; it is not a degenerate full cylinder.
        const positiveEnds = Number(p[0] > 0) + Number(p[1] > 0);
        if (positiveEnds === 0) throw new Error('Unsupported decor cylinder with no positive radius');
        vertices = 2 * (radial + 1) + positiveEnds * (2 * radial + 1);
        indices = positiveEnds * radial * 6;
        break;
      }
      case 'cone': {
        const radial = segments(p[2]);
        if (!(p[0] > 0)) throw new Error('Unsupported decor cone radius');
        vertices = 4 * radial + 3; indices = radial * 6; break;
      }
      case 'sphere': {
        const width = Math.max(3, segments(p[1])), height = Math.max(2, segments(p[2]));
        vertices = (width + 1) * (height + 1); indices = 6 * width * (height - 1); break;
      }
      case 'torus': {
        const radial = segments(p[2]), tubular = segments(p[3]);
        vertices = (radial + 1) * (tubular + 1); indices = 6 * radial * tubular; break;
      }
      case 'icosahedron': {
        if (p[1] !== 0) throw new Error('Only the installed detail-zero decor icosahedron is priced');
        vertices = 60; indices = 0; indexed = false; break;
      }
      case 'depot-cab': {
        // A specific simple six-edge contour, no holes, one depth step and no
        // bevel. ExtrudeGeometry emits two four-triangle lids plus twelve side
        // triangles as independent vertices. Unsupported contours fail closed.
        const expected = [[-0.83, 0.87], [-0.83, 1.28], [-0.38, 1.48],
          [-0.10, 2.46], [0.80, 2.46], [0.80, 0.87]];
        if (!this.vertices || this.vertices.length !== expected.length
          || this.vertices.some((point, index) => point.length !== 2
            || point[0] !== expected[index][0] || point[1] !== expected[index][1])) {
          throw new Error('Unpriced depot cab contour');
        }
        vertices = 60; indices = 0; indexed = false; break;
      }
      case 'quad': {
        if (!this.vertices || this.vertices.length !== 4 || this.vertices.some(point => point.length !== 3)) {
          throw new Error('Decor quad requires four source vertices');
        }
        vertices = 4; indices = 6; uv = false; break;
      }
    }
    let colour = false;
    for (const operation of this.operations) {
      if (operation.kind === 'drop-uv') uv = false;
      else if (operation.kind === 'colour') colour = true;
      else if (operation.kind === 'ensure-index' && !indexed) { indexed = true; indices = vertices; }
      else if (operation.kind === 'remap-v' && !uv) throw new Error('Decor UV remap after removal');
    }
    return { vertices, indices, maximumIndex: indexed ? vertices - 1 : -1, indexed, uv, colour };
  }
}

/** Deliberately limited constructor arities: a new segmentation or sweep must
 * add its own exact topology rule instead of inheriting a stale allowance. */
export const decorShapes = Object.freeze({
  box: (width: number, height: number, depth: number): DecorShape => new DecorShape('box', [width, height, depth]),
  plane: (width: number, height: number): DecorShape => new DecorShape('plane', [width, height]),
  cylinder: (top: number, bottom: number, height: number, radial: number): DecorShape =>
    new DecorShape('cylinder', [top, bottom, height, radial]),
  cone: (radius: number, height: number, radial: number): DecorShape => new DecorShape('cone', [radius, height, radial]),
  sphere: (radius: number, width: number, height: number): DecorShape => new DecorShape('sphere', [radius, width, height]),
  torus: (radius: number, tube: number, radial: number, tubular: number): DecorShape =>
    new DecorShape('torus', [radius, tube, radial, tubular]),
  icosahedron: (radius: number, detail: number): DecorShape => new DecorShape('icosahedron', [radius, detail]),
  depotCab: (vertices: readonly (readonly number[])[], depth: number): DecorShape =>
    new DecorShape('depot-cab', [depth], vertices.map(point => [...point])),
  quad: (vertices: readonly { readonly x: number; readonly y: number; readonly z: number }[]): DecorShape =>
    new DecorShape('quad', [], vertices.map(point => [point.x, point.y, point.z])),
});

export interface DecorDrawPlan {
  readonly key: string;
  readonly materialKey: string;
  readonly pieces: readonly DecorShape[];
  /** Absent for an ordinary mesh, present even for a zero-count InstancedMesh. */
  readonly instances?: number;
  readonly instanceColors?: boolean;
  /** The source fan adds its shared colour after merging, not on every piece. */
  readonly colourAfterMerge?: number;
}
export interface DecorTexturePlan {
  readonly key: string; readonly width: number; readonly height: number; readonly mipmaps: boolean;
}
export interface DecorAllocationPrice {
  readonly drawCalls: number; readonly colourTriangles: number;
  /** Resident vertex + index buffers, excluding separately owned instance data. */
  readonly geometryBytes: number; readonly instanceBytes: number;
  readonly textureBytes: number; readonly reportTextureBytes: number;
  readonly geometryOwners: number; readonly materialOwners: number;
  readonly textureOwners: number; readonly shadowDrawCalls: 0;
}

/** Public supplement count vocabulary used by complete presentation admission. */
export interface DecorSupplementPrice {
  readonly colourDraws: number; readonly shadowDraws: 0;
  readonly colourTriangles: number; readonly shadowTriangles: 0;
  readonly geometryBytes: number; readonly instanceBytes: number; readonly textureBytes: number;
}
export function decorSupplementPrice(price: DecorAllocationPrice): DecorSupplementPrice {
  return { colourDraws: price.drawCalls, shadowDraws: 0, colourTriangles: price.colourTriangles,
    shadowTriangles: 0, geometryBytes: price.geometryBytes, instanceBytes: price.instanceBytes,
    textureBytes: price.textureBytes };
}

export function rgbaTextureBytes(width: number, height: number, mipmaps: boolean): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid decor texture dimensions');
  }
  let bytes = 0;
  for (;;) {
    bytes += width * height * 4;
    if (!mipmaps || (width === 1 && height === 1)) return bytes;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  }
}

/** Exact merged index width follows BufferGeometry.setIndex(array): values at
 * 65535 already require Uint32 for primitive-restart compatibility. Merges keep
 * source vertices (including primitive seams); they do not weld the pieces. */
export function countDecorDraws(draws: readonly DecorDrawPlan[], textures: readonly DecorTexturePlan[] = []): DecorAllocationPrice {
  let colourTriangles = 0, geometryBytes = 0, instanceBytes = 0;
  const materials = new Set<string>();
  for (const draw of draws) {
    if (!draw.pieces.length) throw new Error('Empty decor draw batch');
    let vertices = 0, indices = 0, maximumIndex = -1;
    const first = draw.pieces[0].topology();
    const colour = draw.colourAfterMerge !== undefined || first.colour;
    for (const piece of draw.pieces) {
      const current = piece.topology();
      if (current.indexed !== first.indexed || current.uv !== first.uv
        || current.colour !== first.colour) throw new Error(`Incompatible decor pieces in ${draw.key}`);
      if (current.indexed) maximumIndex = Math.max(maximumIndex, vertices + current.maximumIndex);
      vertices += current.vertices; indices += current.indices;
    }
    const count = draw.instances ?? 1;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid decor instance count');
    geometryBytes += vertices * (24 + Number(first.uv) * 8 + Number(colour) * 12)
      + indices * (maximumIndex >= 65535 ? 4 : 2);
    colourTriangles += (first.indexed ? indices : vertices) / 3 * count;
    if (draw.instances !== undefined) instanceBytes += count * (64 + Number(draw.instanceColors === true) * 12);
    materials.add(draw.materialKey);
  }
  let textureBytes = 0, reportTextureBytes = 0;
  const textureKeys = new Set<string>();
  for (const texture of textures) {
    if (textureKeys.has(texture.key)) throw new Error('A decor texture owner was counted twice');
    textureKeys.add(texture.key);
    textureBytes += rgbaTextureBytes(texture.width, texture.height, texture.mipmaps);
    // Preserve the installed report's explicit mip allowance for parity checks.
    reportTextureBytes += Math.ceil(texture.width * texture.height * 4 * (texture.mipmaps ? 4 / 3 : 1));
  }
  return { drawCalls: draws.length, colourTriangles, geometryBytes, instanceBytes,
    textureBytes, reportTextureBytes, geometryOwners: draws.length,
    materialOwners: materials.size, textureOwners: textures.length, shadowDrawCalls: 0 };
}
