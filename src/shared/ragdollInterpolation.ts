/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** An inactive particle block has no authority during crash entry/recovery. */
export function ragdollInterpolationBlock<T extends ArrayLike<number>>(
  fromBlend: number, toBlend: number, from: T, to: T, endpoint: 0 | 1,
): T {
  if (fromBlend <= 0 && toBlend > 0) return to;
  if (fromBlend > 0 && toBlend <= 0) return from;
  return endpoint === 0 ? from : to;
}
