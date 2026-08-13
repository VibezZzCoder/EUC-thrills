/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MATERIALS } from '../data/surfaces.ts';
import {
  COURSE_MOTTLE,
  EDGE_ENCROACH,
  FIELD_MOTTLE,
  encroachAt,
  groundTint,
  linearFromSrgbHex,
  maxLuminanceGain,
  mixColours,
  pavingShade,
  rebaseTint,
  type GroundTint,
  type MottleProfile,
} from './groundNoise.ts';

/**
 * The ground mottle, checked headlessly.
 *
 * `groundNoise.ts` imports nothing, which is the point: the look pass's only
 * arithmetic can be pinned here at `node --test` instead of in a screenshot
 * somebody has to look at closely. What a test can prove is determinism,
 * bounds, and the *ordering* between surfaces and between scales. Whether the
 * result reads as dirt is a browser judgement at gameplay scale and always
 * will be.
 */

const GREY: GroundTint = { r: 0.202, g: 0.202, b: 0.202 };

function tint(
  cellX: number,
  cellZ: number,
  mottle: number,
  base: GroundTint = GREY,
  profile: MottleProfile = COURSE_MOTTLE,
): GroundTint {
  const out: GroundTint = { r: 0, g: 0, b: 0 };
  return groundTint(cellX, cellZ, cellX + 0.5, cellZ + 0.5, mottle, base, profile, out);
}

function luminance(colour: GroundTint): number {
  return 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
}

/**
 * How bright a cell lands, as a multiple of the material's own albedo.
 *
 * The tint is a per-channel *multiplier*, so its luminance is not the cell's
 * luminance — the albedo has to be applied first. Getting this wrong once
 * produced a ratio of five, which is a unit error rather than a mottle.
 */
function relativeLuminance(base: GroundTint, colour: GroundTint): number {
  return luminance({ r: base.r * colour.r, g: base.g * colour.g, b: base.b * colour.b })
    / luminance(base);
}

test('the same cell gets the same tint every time it is asked', () => {
  // `DESIGN.md` §4 rule 3. A ground that differs between boots makes every
  // visual regression capture meaningless, so this is the load-bearing one.
  for (const [x, z] of [[0, 0], [17, -43], [-260, 311], [1, 1]] as const) {
    const first = tint(x, z, 0.2);
    const second = tint(x, z, 0.2);
    assert.deepEqual(first, second, `cell ${x},${z} is not deterministic`);
  }
});

test('the tint is flat across a cell and different in the next one', () => {
  // Per cell, not per vertex — the caller hands all four corners one answer, so
  // what has to be true here is that neighbouring cells actually disagree.
  let differing = 0;
  for (let x = 0; x < 40; x += 1) {
    const here = tint(x, 0, 0.2);
    const next = tint(x + 1, 0, 0.2);
    if (Math.abs(luminance(here) - luminance(next)) > 1e-4) differing += 1;
  }
  assert.equal(differing, 40, 'adjacent cells must not share a tone');
});

test('a flat material comes back near its own albedo, never negative', () => {
  // The tint is a multiplier, so the mean has to sit at 1 or the whole palette
  // shifts. Checked as an average over a patch large enough to contain several
  // periods of the slowest layer.
  for (const id of ['pavement', 'grass', 'brick', 'gravel'] as const) {
    const material = MATERIALS[id];
    const base: GroundTint = { r: 0, g: 0, b: 0 };
    linearFromSrgbHex(material.albedo, base);

    let sum = 0;
    let count = 0;
    let low = Number.POSITIVE_INFINITY;
    for (let z = -150; z <= 150; z += 3) {
      for (let x = -150; x <= 150; x += 3) {
        const colour = tint(x, z, material.mottle, base);
        assert.ok(colour.r >= 0 && colour.g >= 0 && colour.b >= 0, `${id} went negative`);
        const relative = relativeLuminance(base, colour);
        sum += relative;
        count += 1;
        if (relative < low) low = relative;
      }
    }
    const mean = sum / count;
    assert.ok(Math.abs(mean - 1) < 0.02, `${id} averages ${mean.toFixed(3)} of its albedo`);
    // And it never crushes: `DESIGN.md` §2's floor is 0.03 linear luminance.
    assert.ok(
      luminance(base) * low > 0.03,
      `${id}'s darkest cell lands at ${(luminance(base) * low).toFixed(3)} linear`,
    );
  }
});

test('the low-frequency layers carry more of the variation than the metre grid', () => {
  // The M7.5 change, stated as a number. At M4 the metre-scale layer was the
  // whole mottle, which made the grid the single loudest feature on screen and
  // read as a debug overlay. It now has to be a minority of the total, or
  // nothing has actually changed.
  for (const profile of [COURSE_MOTTLE, FIELD_MOTTLE]) {
    const smooth = profile.midWeight + profile.coarseWeight;
    assert.ok(
      smooth > profile.cellWeight * 1.5,
      `the smooth layers (${smooth}) must dominate the per-cell one (${profile.cellWeight})`,
    );
    // But the speed cue must still exist. A metre-scale layer under about a
    // fifth of the total stops being something the eye can track at 15 m/s.
    assert.ok(
      profile.cellWeight / (profile.cellWeight + smooth) > 0.2,
      'the per-cell speed cue has been turned down too far',
    );
  }
});

test('the surround field varies at a coarser scale than the course', () => {
  // `DESIGN.md` §4 and §5: the change of scale at the course boundary is the
  // feature that separates open ground from managed ground. Its own patches are
  // already eight metres, so its smooth layers have to move out proportionally
  // or the boundary stops reading.
  assert.ok(FIELD_MOTTLE.midMetres > COURSE_MOTTLE.midMetres * 4);
  assert.ok(FIELD_MOTTLE.coarseMetres > COURSE_MOTTLE.coarseMetres * 4);
  assert.ok(FIELD_MOTTLE.hueMetres > COURSE_MOTTLE.hueMetres * 4);
});

test('grass still varies visibly harder than pavement', () => {
  // The amplitudes carry surface identity (`DESIGN.md` §4). Measured as the
  // spread of relative luminance over the same patch of ground, so a change to
  // the layer weights cannot quietly collapse the two together.
  const spread = (mottle: number): number => {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let z = -60; z <= 60; z += 1) {
      for (let x = -60; x <= 60; x += 1) {
        const relative = relativeLuminance(GREY, tint(x, z, mottle));
        if (relative < low) low = relative;
        if (relative > high) high = relative;
      }
    }
    return high - low;
  };

  const grass = spread(MATERIALS.grass.mottle);
  const pavement = spread(MATERIALS.pavement.mottle);
  assert.ok(
    grass > pavement * 2,
    `grass spreads ${grass.toFixed(3)} against pavement's ${pavement.toFixed(3)}`,
  );
});

test('hue and saturation move without taking a surface off its own colour', () => {
  // Layers 4 and 5 exist because a pure luminance jitter reads as lighting
  // rather than as material. They must still be small enough that grass never
  // stops being green.
  const base: GroundTint = { r: 0, g: 0, b: 0 };
  linearFromSrgbHex(MATERIALS.grass.albedo, base);

  let chromatic = 0;
  for (let z = -80; z <= 80; z += 2) {
    for (let x = -80; x <= 80; x += 2) {
      const colour = tint(x, z, MATERIALS.grass.mottle, base);
      // Green has to stay the dominant channel on every cell of grass.
      assert.ok(
        colour.g * base.g > colour.r * base.r && colour.g * base.g > colour.b * base.b,
        `grass stopped being green at ${x},${z}`,
      );
      // The channels are not all the same multiplier, which is the whole point.
      if (Math.abs(colour.r - colour.b) > 1e-3) chromatic += 1;
    }
  }
  assert.ok(chromatic > 0, 'the tint is still purely a luminance jitter');
});

test('the luminance bound the palette rule is checked against actually holds', () => {
  // `maxLuminanceGain` is what `data/surfaces.test.ts` uses to keep the kerb
  // readable against a *mottled* road rather than against the table value. A
  // bound that is not a bound would let that rule pass while the screen shows
  // otherwise.
  for (const id of ['pavement', 'roughPavement', 'brick', 'grass'] as const) {
    const material = MATERIALS[id];
    const base: GroundTint = { r: 0, g: 0, b: 0 };
    linearFromSrgbHex(material.albedo, base);
    const bound = maxLuminanceGain(material.mottle);

    let highest = 0;
    for (let z = -200; z <= 200; z += 1) {
      for (let x = -200; x <= 200; x += 1) {
        const relative = relativeLuminance(base, tint(x, z, material.mottle, base));
        if (relative > highest) highest = relative;
      }
    }
    assert.ok(highest <= bound, `${id} reached ${highest.toFixed(4)} past its bound ${bound}`);
  }
});

// ---------------------------------------------------------------------------
// M7.5 stage 4 — the edge, and the plaza's paving
// ---------------------------------------------------------------------------

test('encroachment is bounded by the ceiling the palette rule is checked against', () => {
  // `data/surfaces.test.ts` proves no pair of surfaces can blend past the kerb
  // rule *given this bound*, so the bound has to be real.
  let highest = 0;
  for (let z = -120; z <= 120; z += 1) {
    for (let x = -120; x <= 120; x += 1) {
      for (let side = 0; side < 4; side += 1) {
        const amount = encroachAt(x, z, x + 0.5, z + 0.5, 1, 0x2b1 + side);
        assert.ok(amount >= 0, `encroachment went negative at ${x},${z}`);
        if (amount > highest) highest = amount;
      }
    }
  }
  assert.ok(highest <= EDGE_ENCROACH.maxBlend, `encroachment reached ${highest}`);
  // And it has to actually get near it somewhere, or the ceiling is fiction and
  // the edge never frays.
  assert.ok(highest > EDGE_ENCROACH.maxBlend * 0.7, `encroachment only reached ${highest}`);
});

test('a material that does not creep contributes nothing at all', () => {
  assert.equal(encroachAt(3, 4, 3.5, 4.5, 0, 0x2b1), 0);
});

test('encroachment scales with the neighbour, so grass beats gravel everywhere', () => {
  for (let x = 0; x < 40; x += 1) {
    const grass = encroachAt(x, 7, x + 0.5, 7.5, 1.0, 0x2b1);
    const gravel = encroachAt(x, 7, x + 0.5, 7.5, 0.65, 0x2b1);
    assert.ok(gravel <= grass, `gravel out-crept grass at ${x}`);
  }
});

test('the edge is patchy rather than dithered, and never uniform', () => {
  // Two failures this rules out at once: a smooth field alone feathers the whole
  // boundary evenly, which is a blur; a per-cell hash alone is salt and pepper
  // along a line. What it has to produce is runs of adjacent cells that agree.
  const along = Array.from({ length: 90 }, (_v, i) => encroachAt(i, 0, i + 0.5, 0.5, 1, 0x2b1));
  const mean = along.reduce((sum, v) => sum + v, 0) / along.length;
  let runs = 0;
  for (let index = 1; index < along.length; index += 1) {
    if ((along[index] > mean) !== (along[index - 1] > mean)) runs += 1;
  }
  assert.ok(runs > 4, `only ${runs} changes along 90 cells — the edge is uniform`);
  assert.ok(runs < 60, `${runs} changes along 90 cells — the edge is dithered`);
});

test('encroachment is deterministic, like every other layer here', () => {
  assert.equal(encroachAt(11, -4, 11.5, -3.5, 1, 0x2b1), encroachAt(11, -4, 11.5, -3.5, 1, 0x2b1));
  assert.notEqual(encroachAt(11, -4, 11.5, -3.5, 1, 0x2b1), encroachAt(11, -4, 11.5, -3.5, 1, 0x2b2));
});

test('a mix stays between the two colours it mixes', () => {
  const a: GroundTint = { r: 0.2, g: 0.3, b: 0.1 };
  const b: GroundTint = { r: 0.05, g: 0.11, b: 0.04 };
  const out: GroundTint = { r: 0, g: 0, b: 0 };
  for (const amount of [0, 0.25, 0.5, 1]) {
    mixColours(a, b, amount, out);
    for (const channel of ['r', 'g', 'b'] as const) {
      const low = Math.min(a[channel], b[channel]);
      const high = Math.max(a[channel], b[channel]);
      assert.ok(out[channel] >= low - 1e-9 && out[channel] <= high + 1e-9);
    }
  }
  mixColours(a, b, 0, out);
  assert.deepEqual(out, a);
});

test('rebasing a tint lands the cell on exactly the colour it blended to', () => {
  // The property the whole edge blend rests on: the vertex colour multiplies the
  // *material* albedo, so a cell that blended toward its neighbour has to end up
  // at the blended colour once that multiplication has happened.
  const material: GroundTint = { r: 0.202, g: 0.202, b: 0.202 };
  const neighbour: GroundTint = { r: 0.055, g: 0.115, b: 0.042 };
  const effective: GroundTint = { r: 0, g: 0, b: 0 };
  mixColours(material, neighbour, 0.3, effective);

  const tint: GroundTint = { r: 1, g: 1, b: 1 };
  groundTint(4, 9, 4.5, 9.5, 0.075, effective, COURSE_MOTTLE, tint);
  const mottled = { r: tint.r * effective.r, g: tint.g * effective.g, b: tint.b * effective.b };
  rebaseTint(tint, effective, material);

  for (const channel of ['r', 'g', 'b'] as const) {
    const rendered = tint[channel] * material[channel];
    assert.ok(
      Math.abs(rendered - mottled[channel]) < 1e-9,
      `${channel} rendered ${rendered} against ${mottled[channel]}`,
    );
  }
});

test('a zero channel cannot be rebased into infinity', () => {
  const tint: GroundTint = { r: 1, g: 1, b: 1 };
  rebaseTint(tint, { r: 0.2, g: 0.2, b: 0.2 }, { r: 0, g: 0.2, b: 0.2 });
  assert.ok(Number.isFinite(tint.r) && tint.r === 1);
});

test('paving stays inside its own contrast, and mostly near the surface tone', () => {
  const paving = { module: 2.8, contrast: 0.06 };
  let extreme = 0;
  let near = 0;
  let total = 0;
  for (let z = -60; z < 60; z += 0.7) {
    for (let x = -60; x < 60; x += 0.7) {
      const shade = pavingShade(x, z, paving);
      const deviation = Math.abs(shade - 1);
      assert.ok(deviation <= paving.contrast + 1e-9, `paving reached ${shade}`);
      if (deviation > extreme) extreme = deviation;
      if (deviation < paving.contrast * 0.25) near += 1;
      total += 1;
    }
  }
  assert.ok(extreme > paving.contrast * 0.6, 'paving never varies — the plaza is flat');
  // Squared about zero, the same distribution rule §4b applies to the per-cell
  // mottle: most modules sit at the surface's own tone, so a plaza reads as
  // paving rather than as the checkerboard stage 2 spent itself removing.
  assert.ok(near / total > 0.4, `only ${((near / total) * 100).toFixed(0)}% of modules are quiet`);
});

test('alternate paving courses are offset, so no joint line runs across the square', () => {
  // **The running bond is the whole reason a regular module is allowed here at
  // all**, so it has to be tested as a property of the joints rather than of
  // the tones. A first version of this compared two modules in the same column
  // of adjacent courses and asserted they differed — which they do in a stack
  // bond too, because the hash takes the row. It proved nothing, and a mutation
  // that laid the paving in a stack bond passed it.
  //
  // What a running bond actually means: a joint in one course lands in the
  // *middle* of a module in the next. So at an even course's own module
  // boundary the tone must change, and at that same x the odd course's must
  // not.
  const paving = { module: 2.8, contrast: 0.06 };
  const epsilon = 0.01;
  let carried = 0;
  for (let index = -8; index <= 8; index += 1) {
    const boundary = index * paving.module;
    const evenBefore = pavingShade(boundary - epsilon, paving.module * 0.5, paving);
    const evenAfter = pavingShade(boundary + epsilon, paving.module * 0.5, paving);
    assert.notEqual(evenBefore, evenAfter, `no joint at x=${boundary} in its own course`);

    const oddBefore = pavingShade(boundary - epsilon, paving.module * 1.5, paving);
    const oddAfter = pavingShade(boundary + epsilon, paving.module * 1.5, paving);
    if (oddBefore !== oddAfter) carried += 1;
  }
  assert.equal(carried, 0, 'a joint line ran straight through into the next course');
});

test('paving is world-locked and deterministic', () => {
  const paving = { module: 2.8, contrast: 0.06 };
  assert.equal(pavingShade(12.3, -7.1, paving), pavingShade(12.3, -7.1, paving));
  assert.equal(pavingShade(12.3, -7.1, paving), pavingShade(12.3 + 2.8 * 0, -7.1, paving));
  assert.notEqual(pavingShade(12.3, -7.1, paving), pavingShade(12.3 + 2.8, -7.1, paving));
});
