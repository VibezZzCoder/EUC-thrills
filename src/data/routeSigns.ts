/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Owned route labels. These describe the park's existing choices. */
export const ROUTE_SIGN_WORDS = Object.freeze(['TECH', 'SAFE', 'AIR'] as const);
export type RouteSignWord = (typeof ROUTE_SIGN_WORDS)[number];
export type RouteSignSide = -1 | 1;

/** Metres. Route labels use the original 1.05 m circular sign reservation,
 * rather than the narrow, unlettered fingerpost boards. Both boards remain
 * below the original pole top and above its original lower-board bottom. */
export const ROUTE_SIGN_FACE = Object.freeze({
  upperWidth: 1.88,
  lowerWidth: 1.74,
  height: 0.40,
  upperCentre: 2.21,
  lowerCentre: 1.79,
  letterHeight: 0.28,
  strokeWidth: 0.033,
  horizontalMargin: 0.09,
  arrowCentreX: 0.56,
  arrowHalfRun: 0.13,
  arrowHalfRise: 0.10,
  arrowBarb: 0.09,
});

export interface RouteSignFace {
  readonly word: RouteSignWord;
  /** Screen direction: -1 left, +1 right, from the arriving rider. */
  readonly side: RouteSignSide;
}

/** Render-only annotation of an existing pole. Never used for solidity. */
export interface RouteSign {
  readonly feature: string;
  readonly propIndex: number;
  /** World yaw of the readable +Z face, aimed at the actual approach. */
  readonly rotationY: number;
  readonly upper: RouteSignFace;
  readonly lower: RouteSignFace;
  readonly approach: { readonly x: number; readonly z: number; readonly headingY: number };
  readonly approachDistance: number;
  readonly commitDistance: number;
  /** Both choices remain on the same closed lap. Positive t is rider LEFT. */
  readonly technicalT: number;
  readonly safeT: number;
}
