/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact storage contract for corner-sharing distance packs. No Three/GPU.
 * Near P/N/C corners remain allocated verbatim; all three draws own indices.
 * Count-derived bytes are checked against actual emitted typed-array lengths. */
export interface VegetationPackedCounts {
  readonly near: number;
  readonly middle: number;
  readonly far: number;
}
export interface VegetationPackedPrice {
  readonly attributeVertices: number;
  readonly attributeBytes: number;
  readonly indexCount: number;
  readonly indexElementBytes: 2 | 4;
  readonly indexBytes: number;
  readonly geometryBytes: number;
}
export function vegetationPackedPrice(levels: VegetationPackedCounts, semanticBytesPerVertex: 0 | 4 = 0): VegetationPackedPrice {
  if (![levels.near, levels.middle, levels.far].every(value => Number.isSafeInteger(value) && value > 0))
    throw new Error('Invalid distance triangle counts');
  const attributeVertices = levels.near * 3, indexCount = (levels.near + levels.middle + levels.far) * 3;
  if (!Number.isSafeInteger(attributeVertices) || !Number.isSafeInteger(indexCount)
    || attributeVertices > 0xffff_ffff || indexCount > 0xffff_ffff)
    throw new Error('Distance arrays exceed Uint32 addressing');
  // 65,536 corners have maximum index65,535 and still fit Uint16.
  const indexElementBytes = attributeVertices <= 0x1_0000 ? 2 : 4;
  if (semanticBytesPerVertex !== 0 && semanticBytesPerVertex !== 4) throw new Error('Unsupported semantic storage');
  const attributeBytes = attributeVertices * (9 * Float32Array.BYTES_PER_ELEMENT + semanticBytesPerVertex);
  const indexBytes = indexCount * indexElementBytes;
  return Object.freeze({ attributeVertices, attributeBytes, indexCount, indexElementBytes,
    indexBytes, geometryBytes: attributeBytes + indexBytes });
}
