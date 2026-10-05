/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { MARKINGS } from '../data/markings.ts';
import type { SegmentMarking } from './segments.ts';

/** Existing city-road paint grammar for an explicitly authored road connector.
 * Callers decide road purpose; pavement alone does not grant lane markings.
 * This changes no corridor, surface, collider, route choice or random stream.
 */
export function roadConnectorMarkings(length: number, halfWidth: number): SegmentMarking[] {
  // Match the slice's 0.8 m edge inset. Two centimetres at each socket avoids
  // the exact-end floating-point clip documented in DESIGN.md §6g.
  const socketInset = 0.02;
  const edgeInset = 0.8;
  const from = socketInset;
  const to = length - socketInset;
  if (to - from < MARKINGS.minRunLength || halfWidth <= edgeInset) return [];
  const offset = halfWidth - edgeInset;
  return [
    { path: [{ s: from, t: 0 }, { s: to, t: 0 }], role: 'centre', broken: true, paint: 'road' },
    ...[offset, -offset].map((t): SegmentMarking => ({
      path: [{ s: from, t }, { s: to, t }], role: 'edge', paint: 'road',
    })),
  ];
}
