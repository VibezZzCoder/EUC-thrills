/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from './plan.ts';

/**
 * A canonical, exact digest of a `LevelPlan` — the instrument M12 is measured
 * with.
 *
 * Two questions in this milestone are the same question wearing different
 * clothes. **Phase 1** must prove that extracting the slice's beats into a
 * library changed the emitted plan *not at all*; **Phase 2** must prove that a
 * seed produces the same plan on every run and that reseeding one domain leaves
 * the others untouched. Both are "is this plan the same plan", asked of a
 * structure with roughly a hundred and twenty thousand heightfield samples in
 * it, and neither is answerable by eye.
 *
 * `assert.deepStrictEqual` answers it perfectly for two plans held in memory at
 * once. What it cannot do is answer it across a *code change*, because the
 * reference plan stops existing the moment the code that built it is edited. A
 * digest is a reference that survives the edit: the number below is what the
 * slice emitted before the extraction, and it is checked into the test.
 *
 * ## Why not `JSON.stringify`
 *
 * Three of its behaviours are wrong for this job, and each one would make the
 * digest agree with a plan that is not deep-equal:
 *
 *   1. **Key order is insertion order.** Two objects with the same entries
 *      written in a different order are deep-equal and stringify differently,
 *      so a refactor that builds a collider's fields in another sequence would
 *      report a false change. Keys are sorted here.
 *   2. **`-0` serialises as `0`.** This codebase carries explicit negative-zero
 *      guards in `segments.ts` precisely because `-0` compares equal to `0` and
 *      is *not* deep-equal to it. A digest that cannot see the difference
 *      cannot police the guards. `-0` is written as `-0` below.
 *   3. **`undefined` disappears from objects but becomes `null` in arrays**,
 *      which conflates a present-but-undefined optional with an absent one.
 *      Absent and present-undefined are deep-*strict*-unequal, so both are
 *      distinguished here.
 *
 * `String(number)` is used for every finite value because it is the shortest
 * representation that round-trips exactly, so two different doubles can never
 * share a spelling.
 *
 * ## The hash
 *
 * Four interleaved 32-bit FNV-1a lanes, concatenated into 128 bits. Pure
 * integer arithmetic through `Math.imul`, which keeps a one-and-a-half-megabyte
 * canonical string inside a few milliseconds — a BigInt implementation of the
 * same function is three orders of magnitude slower and this runs inside a seed
 * sweep. A 128-bit digest is a regression guard, not a security primitive: it is
 * paired with a real `deepStrictEqual` wherever both plans exist at once, and it
 * stands alone only across a code change, where nothing else can stand at all.
 *
 * Nothing here may import three.js (invariant 1).
 */

/** A structural census of a plan. Cheap to read, and the first thing to diff. */
export interface PlanSummary {
  readonly id: string;
  readonly segments: number;
  readonly colliders: number;
  readonly solids: number;
  readonly softBodies: number;
  readonly props: number;
  readonly markings: number;
  readonly markingPoints: number;
  readonly checkpoints: number;
  readonly hazards: number;
  readonly targets: number;
  readonly samples: number;
  readonly cells: number;
  readonly columns: number;
  readonly rows: number;
}

export function planSummary(plan: LevelPlan): PlanSummary {
  let colliders = 0;
  for (const segment of plan.segments) colliders += segment.colliders.length;
  let markingPoints = 0;
  for (const marking of plan.markings ?? []) markingPoints += marking.points.length;

  const field = plan.heightfield;
  return {
    id: plan.id,
    segments: plan.segments.length,
    colliders,
    solids: (plan.solids ?? []).length,
    softBodies: (plan.softBodies ?? []).length,
    props: (plan.props ?? []).length,
    markings: (plan.markings ?? []).length,
    markingPoints,
    checkpoints: plan.checkpoints.length,
    hazards: (plan.hazards ?? []).length,
    targets: (plan.targets ?? []).length,
    samples: field.heights.length,
    cells: field.surfaces.length,
    columns: field.columns,
    rows: field.rows,
  };
}

/** How a single value is spelled. Exact, and never two spellings for one value. */
function writeValue(value: unknown, out: string[]): void {
  if (value === null) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'undefined':
      // Distinct from absence, which is written by the object branch below.
      out.push('undef');
      return;
    case 'number':
      // `Object.is` is the only test that separates -0 from 0.
      out.push(Object.is(value, -0) ? '-0' : String(value));
      return;
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'string':
      // Quoted and escaped so a string cannot impersonate the framing below.
      out.push(JSON.stringify(value));
      return;
    case 'bigint':
      out.push(`${value}n`);
      return;
    default:
      break;
  }

  if (Array.isArray(value)) {
    out.push('[');
    for (const entry of value) {
      writeValue(entry, out);
      out.push(',');
    }
    out.push(']');
    return;
  }

  if (typeof value === 'object') {
    // Sorted, so insertion order cannot change the digest of a deep-equal
    // object. Absent keys simply do not appear; a present key holding
    // `undefined` appears with the `undef` marker above.
    const keys = Object.keys(value as Record<string, unknown>).sort();
    out.push('{');
    for (const key of keys) {
      out.push(JSON.stringify(key), ':');
      writeValue((value as Record<string, unknown>)[key], out);
      out.push(',');
    }
    out.push('}');
    return;
  }

  // A function or a symbol in a LevelPlan is a bug rather than a value to hash,
  // and it is worth failing loudly here rather than digesting it as a constant.
  throw new Error(`a LevelPlan cannot contain a ${typeof value}`);
}

/**
 * The plan as one canonical string.
 *
 * Exported because a failing digest is useless on its own: when the guarantee
 * breaks, the two strings are what a test diffs to say *where*.
 */
export function canonicalPlanString(plan: LevelPlan): string {
  const out: string[] = [];
  writeValue(plan as unknown, out);
  return out.join('');
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Four 32-bit FNV-1a lanes over one string, as 32 lowercase hex characters. */
export function hash128(text: string): string {
  let a = FNV_OFFSET;
  let b = FNV_OFFSET ^ 0x9e3779b9;
  let c = FNV_OFFSET ^ 0x85ebca6b;
  let d = FNV_OFFSET ^ 0xc2b2ae35;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // Each lane takes the character mixed with the index in a different way, so
    // the four lanes cannot degenerate into four copies of one hash.
    a = Math.imul(a ^ code, FNV_PRIME);
    b = Math.imul(b ^ (code + index), FNV_PRIME);
    c = Math.imul(c ^ (code ^ (index << 3)), FNV_PRIME);
    d = Math.imul(d ^ (code + (index << 5)), FNV_PRIME);
  }

  const hex = (value: number): string => (value >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b) + hex(c) + hex(d);
}

/**
 * The digest of a plan. Equal digests mean equal plans, to 128 bits.
 *
 * The canonical string is thrown away rather than returned, because on a slice
 * -sized plan it is well over a megabyte and a sweep builds hundreds of them.
 */
export function planDigest(plan: LevelPlan): string {
  return hash128(canonicalPlanString(plan));
}
