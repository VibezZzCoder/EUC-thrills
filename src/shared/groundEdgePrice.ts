/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Shared pure storage/submission arithmetic. No runtime, meshes or imports. */
export interface GroundEdgePrice {
  readonly sourceVertices: number;
  readonly appendedVertices: number;
  readonly vertices: number;
  readonly sourceIndices: number;
  readonly indices: number;
  readonly sourceDrawGroups: number;
  readonly drawGroups: number;
  readonly addedColourTriangles: number;
  readonly addedColourDraws: number;
  /** Common position/normal/colour floats plus NET whole-index allocation.
   * Original anchors remain stored and are never declared free. */
  readonly commonGeometryBytes: number;
  readonly ordinaryAttributeBytes: number;
  readonly maximumUltraAttributeBytes: number;
}
export function groundEdgeIndexBytes(vertices: number, indices: number): number {
  if (!Number.isSafeInteger(vertices) || vertices < 0 || !Number.isSafeInteger(indices) || indices < 0) {
    throw new Error('Ground edge index counts must be finite safe nonnegative integers');
  }
  return indices * (vertices - 1 >= 65535 ? 4 : 2);
}
export function groundEdgePrice(input: Pick<GroundEdgePrice,
  'sourceVertices' | 'appendedVertices' | 'sourceIndices' | 'indices' | 'sourceDrawGroups' | 'drawGroups'>): GroundEdgePrice {
  const vertices = input.sourceVertices + input.appendedVertices;
  const out: GroundEdgePrice = { ...input, vertices,
    addedColourTriangles: (input.indices - input.sourceIndices) / 3,
    addedColourDraws: input.drawGroups - input.sourceDrawGroups,
    commonGeometryBytes: input.appendedVertices * 36 + groundEdgeIndexBytes(vertices, input.indices)
      - groundEdgeIndexBytes(input.sourceVertices, input.sourceIndices),
    ordinaryAttributeBytes: input.appendedVertices * 11,
    maximumUltraAttributeBytes: input.appendedVertices * 12 };
  assertGroundEdgePrice(out);
  return out;
}
export function assertGroundEdgePrice(price: GroundEdgePrice): void {
  for (const [key, value] of Object.entries(price)) {
    if (!Number.isSafeInteger(value) || (key !== 'addedColourDraws' && value < 0)) {
      throw new Error(`Ground edge price has invalid ${key}: ${value}`);
    }
  }
  if (price.vertices !== price.sourceVertices + price.appendedVertices
    || price.indices % 3 || price.sourceIndices % 3
    || price.addedColourTriangles !== (price.indices - price.sourceIndices) / 3
    || price.addedColourDraws !== price.drawGroups - price.sourceDrawGroups
    || price.commonGeometryBytes !== price.appendedVertices * 36 + groundEdgeIndexBytes(price.vertices, price.indices)
      - groundEdgeIndexBytes(price.sourceVertices, price.sourceIndices)
    || price.ordinaryAttributeBytes !== price.appendedVertices * 11
    || price.maximumUltraAttributeBytes !== price.appendedVertices * 12) {
    throw new Error('Ground edge price does not describe its emitted source counts');
  }
}
interface FrameCost { readonly drawCalls: number; readonly triangles: number }
interface ColourCost extends FrameCost {
  readonly colourTriangles: number;
  readonly frame: { readonly solo: FrameCost; readonly split: FrameCost; readonly quad: FrameCost };
}
/** Non-casting ground adds colour work once per pane and never props/shadows. */
export function withGroundEdgePrice<T extends ColourCost>(cost: T, price: GroundEdgePrice | null): T {
  if (!price) return cost;
  assertGroundEdgePrice(price);
  const frame = (old: FrameCost, views: number): FrameCost => ({
    drawCalls: old.drawCalls + price.addedColourDraws * views,
    triangles: old.triangles + price.addedColourTriangles * views });
  return { ...cost, drawCalls: cost.drawCalls + price.addedColourDraws,
    triangles: cost.triangles + price.addedColourTriangles,
    colourTriangles: cost.colourTriangles + price.addedColourTriangles,
    frame: { solo: frame(cost.frame.solo, 1), split: frame(cost.frame.split, 2), quad: frame(cost.frame.quad, 4) } };
}
