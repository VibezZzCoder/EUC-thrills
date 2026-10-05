/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Bounded commercial dressing; no route admission, physical or option fields. */
export const STREET_LIFE = Object.freeze({
  storefronts: 3,
  peoplePerShop: 2,
  atlasWidth: 1024,
  atlasPageHeight: 256,
  frontageHeight: 4.3,
  frontageMaxWidth: 14,
  /** Interior is inside the existing solid; only closed display bays are visible. */
  recessDepth: 4.4,
  facadeSkin: 0.12,
  canopyBottom: 3.05,
  canopyProjection: 0.75,
  /** Elevated tenant blades, metres; separate from the lower awning envelope. */
  bladeProjection: 2.75,
  bladeBottom: 3.30,
  /** Sparse frontage, facing a straight paved street with a clear approach. */
  minimumSpacing: 38,
  maximumStreetGap: 20,
  gesturePeriodSeconds: 9,
  signWidth: 3.76,
  /** Move the mounted wordmark away from an existing central lamp, metres. */
  signAvoidanceOffset: 3,
});

/** Original shop names, deliberately added to the path-lettering allowance. */
export const STREET_SHOP_WORDS = Object.freeze(['COFFEE', 'GROCER', 'REPAIR'] as const);
