/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Pure closed-interval rectangular support. Imports nothing. All interior
 * maxima of a|cos h|+b|sin h| occur at ±atan2(b,a)+k*pi. */
export function rectangularYawSupport(a: number, b: number, low: number, high: number): number {
  // Scalar checks and loop: this runs several times per anticipation span.
  if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(low) && Number.isFinite(high)) || a < 0 || b < 0 || low > high)
    throw new RangeError('Invalid continuous rectangular yaw support');
  let maximum = Math.max(a * Math.abs(Math.cos(low)) + b * Math.abs(Math.sin(low)),
    a * Math.abs(Math.cos(high)) + b * Math.abs(Math.sin(high)));
  const peak = Math.atan2(b, a);
  for (let sign = -1; sign <= 1; sign += 2) {
    const first = sign * peak + Math.ceil((low - sign * peak) / Math.PI) * Math.PI;
    if (first <= high) maximum = Math.max(maximum, Math.hypot(a, b));
  }
  return maximum;
}
