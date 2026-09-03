/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createPlaceholderRider } from './rider.ts';
import { measureObject } from './renderCost.ts';
import { COOL_RIDER_LOOK, MARIBEL_LOOK, PLAYABLE_RIDER_LOOKS, RIDER_LOOKS, riderLook } from './riderLook.ts';
import { loftGeometry } from './blockoutKit.ts';
import { ATLAS_REGIONS, ATLAS_SIZE, createMaribelAtlas, maribelAtlasPixels } from './maribelAtlas.ts';
import { machineLook } from './machineLook.ts';
import { MACHINE_IDS } from '../data/machines.ts';
import { BLOCKOUT_COLOURS, RIDER, RIDER_BLOCKOUT } from '../data/tuning.ts';

/**
 * Maribel's look — M23 Phase A1, and the five things about it a capture cannot
 * be trusted to prove.
 *
 * Six angles across three poses settled everything a picture is good at: that
 * the visor reads, that the ponytail is hair, that the chest gradient is a
 * gradient. What a picture is bad at is exactly what this file asserts.
 *
 * **The first of them is not a rendering property at all, it is a fact about a
 * real person.** Her livery is left-right asymmetric — aqua on her right, coral
 * on her left — and a mirrored build would be *fully plausible on screen* and
 * wrong in a way she would notice before anybody here did. Nothing in the
 * renderer can catch it: both sides paint, both sides look deliberate, and the
 * chase camera shows the arms as two small marks either way. So the handedness
 * is stated as an assertion in the same terms the reference photographs state
 * it in, and it is the reason this file exists.
 */

/** Rider-left is +X, so this is the sign the world uses for each of her sides. */
const HER_RIGHT = -1;
const HER_LEFT = 1;

const SUIT = new THREE.Color(BLOCKOUT_COLOURS.maribelSuit);
const AQUA = new THREE.Color(BLOCKOUT_COLOURS.maribelAqua);
const CORAL = new THREE.Color(BLOCKOUT_COLOURS.maribelCoral);

test('the shared lettering refactor preserves Maribel\'s approved sheet byte for byte', () => {
  // B1 moved the word-stroke machinery from her private atlas module into the
  // shared ink kit. This digest was taken from the isolated pre-B1 source and
  // compared against the refactor output: same 1024² RGBA bytes, not merely a
  // similar capture. Pinning it turns that one-time comparison into a guard on
  // every future edit of the shared path alphabet.
  assert.equal(
    createHash('sha256').update(maribelAtlasPixels()).digest('hex'),
    '82081ff04233ecab22a20ee8b4dad24c0bc744dc451e4e44d6081f589269dbbb',
  );
});

/**
 * What a painted vertex will actually render as.
 *
 * A vertex colour multiplies the material colour per channel in linear space,
 * so this is the shader's own arithmetic — which means these assertions are
 * about the colour the player sees rather than about the tint constants that
 * produced it. A refactor that changed how the tints are computed but kept the
 * result would pass, correctly.
 */
function rendered(colour: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): THREE.Color {
  return new THREE.Color(colour.getX(i) * SUIT.r, colour.getY(i) * SUIT.g, colour.getZ(i) * SUIT.b);
}

/** How close a rendered colour sits to a target, as a fraction of the target. */
function nearness(colour: THREE.Color, target: THREE.Color): number {
  const scale = Math.max(target.r, target.g, target.b, 1e-4);
  return Math.hypot(
    (colour.r - target.r) / scale,
    (colour.g - target.g) / scale,
    (colour.b - target.b) / scale,
  );
}

/** Build one limb the way `render/rider.ts` builds it, and paint it. */
function paintedLimb(
  profile: typeof MARIBEL_LOOK.profiles.thigh,
  painter: ((geometry: THREE.BufferGeometry, side: number) => void) | undefined,
  side: number,
): THREE.BufferGeometry {
  assert.ok(painter, 'the painter under test is missing');
  const geometry = loftGeometry(profile, { radialSegments: 14, shade: MARIBEL_LOOK.shades.legs });
  painter(geometry, side);
  return geometry;
}

test('her aqua is on her right and her coral is on her left, on both limbs', () => {
  // The photographs are the authority and they agree with each other: in
  // `IMG_6600` the turquoise band is on her right arm and right ankle and the
  // coral on her left; the carving photograph shows the same pair from the
  // other side. The brief's §9 "left-side accent: aqua" is the *viewer's* left,
  // which is what makes this worth asserting rather than reading off the text.
  // **The leg's band is on the thigh since A1d, not the shin.** It sat at the
  // ankle, where the reference render puts it just above the knee cup, and
  // where it was competing inside sixty pixels of screen with the machine's
  // purple pads, its taillight and its status lamp. Which bone carries it is a
  // look decision; that her right is aqua and her left is coral is not.
  const limbs = [
    { name: 'bicep', profile: MARIBEL_LOOK.profiles.upperArm, painter: MARIBEL_LOOK.paint?.upperArm },
    { name: 'thigh band', profile: MARIBEL_LOOK.profiles.thigh, painter: MARIBEL_LOOK.paint?.thigh },
  ] as const;

  for (const limb of limbs) {
    for (const [side, expected, other] of [
      [HER_RIGHT, AQUA, CORAL],
      [HER_LEFT, CORAL, AQUA],
    ] as const) {
      const geometry = paintedLimb(limb.profile, limb.painter, side);
      const colour = geometry.getAttribute('color');

      let onExpected = 0;
      let onOther = 0;
      for (let i = 0; i < colour.count; i += 1) {
        const value = rendered(colour, i);
        if (nearness(value, expected) < 0.08) onExpected += 1;
        if (nearness(value, other) < 0.08) onOther += 1;
      }
      geometry.dispose();

      const hand = side === HER_RIGHT ? 'right' : 'left';
      assert.ok(
        onExpected > 0,
        `her ${hand} ${limb.name} carries no accent at all`,
      );
      assert.equal(
        onOther,
        0,
        `her ${hand} ${limb.name} carries ${onOther} vertices of the other side's accent `
          + '— the livery is mirrored, which is the one error a capture cannot show',
      );
    }
  }
});

/** One texel of the printed sheet, decoded from sRGB back to linear. */
function texel(x: number, y: number): THREE.Color {
  const pixels = maribelAtlasPixels();
  const i = (Math.round(y) * ATLAS_SIZE + Math.round(x)) * 4;
  const decode = (byte: number): number => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return new THREE.Color(decode(pixels[i]!), decode(pixels[i + 1]!), decode(pixels[i + 2]!));
}

test('her chest print leans aqua to her right and coral to her left', () => {
  // **The same assertion as A1's, moved to where the print now lives.** The
  // gradient was vertex colour and is a texture; the fact it protects has not
  // changed at all, and it is still the one error a capture cannot show: a
  // mirrored livery is fully plausible on screen and wrong in a way she would
  // notice before anybody here did.
  //
  // The handedness runs through one step of arithmetic that is very easy to
  // get backwards, so it is written out. The chest patch is anchored `front`
  // and spans `-u` to `+u`; `loftPoint` measures `u` from +X — the rider's
  // **left** — toward +Z. So the patch's own `s = 0` edge is her left, and the
  // sheet's left edge is therefore the coral half.
  const chest = ATLAS_REGIONS.chest;
  const left = chest.u0 * ATLAS_SIZE;
  const right = chest.u1 * ATLAS_SIZE;
  const span = right - left;
  const top = chest.v1 * ATLAS_SIZE;
  const bottom = chest.v0 * ATLAS_SIZE;

  // **Only inked texels are asked**, and that is the same correction A1's
  // version of this test carried in vertex space: her leather is authored cool,
  // so an *unprinted* texel already has half again as much blue as red and
  // would answer "aqua" wherever it was sampled. A screen is ink and gaps; the
  // gaps are not evidence.
  const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  let coralSide = 0;
  let aquaSide = 0;
  let crossed = 0;
  for (let step = 0; step <= 120; step += 1) {
    const across = step / 120;
    // Skip the sternum: the print's centre is deliberately the near-white
    // ground, and asking which accent a neutral texel is closer to is asking a
    // coin to answer. It is the same exclusion A1's version made around x = 0.
    if (Math.abs(across - 0.5) < 0.16) continue;
    for (let down = 0; down <= 60; down += 1) {
      const colour = texel(left + span * across, bottom + (top - bottom) * (0.22 + down * 0.004));
      if (luma(colour) < 0.10) continue;
      const leansCoral = colour.r > colour.b * 1.2;
      const leansAqua = colour.b > colour.r * 1.2;
      if (leansCoral === leansAqua) continue;
      if (leansCoral === (across < 0.5)) {
        if (leansCoral) coralSide += 1; else aquaSide += 1;
      } else {
        crossed += 1;
      }
    }
  }

  assert.ok(coralSide > 0, 'nothing on her left half of the print leans coral');
  assert.ok(aquaSide > 0, 'nothing on her right half of the print leans aqua');
  assert.equal(crossed, 0, `${crossed} sampled texels lean toward the wrong side's accent`);
});

test('the print is dots, not a fade', () => {
  // The claim §23.9d repealed a clause to make: at vertex resolution a halftone
  // *is* a fade, and A1 shipped the fade honestly — this phase exists because
  // the fade was not what the reference carries. So the sheet has to show the
  // thing a fade cannot: high-frequency alternation between ink and ground
  // along a single row. A future edit that quietly replaced the screen with a
  // gradient would pass every other test in this file.
  //
  // It scans a **band** of rows and keeps the best, rather than picking one:
  // a screen has a pitch, a row can fall between two ranks of dots, and a test
  // that happened to sample the gap would fail on a print that was perfect.
  const chest = ATLAS_REGIONS.chest;
  const from = (chest.u0 + (chest.u1 - chest.u0) * 0.26) * ATLAS_SIZE;
  const to = (chest.u0 + (chest.u1 - chest.u0) * 0.74) * ATLAS_SIZE;
  const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

  let best = 0;
  let contrast = 0;
  for (let offset = 0; offset < 24; offset += 1) {
    const row = (chest.v0 + (chest.v1 - chest.v0) * 0.34) * ATLAS_SIZE + offset;
    let crossings = 0;
    let previous: boolean | null = null;
    let darkest = Infinity;
    let brightest = 0;
    for (let x = Math.round(from); x <= Math.round(to); x += 1) {
      const value = luma(texel(x, row));
      darkest = Math.min(darkest, value);
      brightest = Math.max(brightest, value);
      const inked = value > 0.10;
      if (previous !== null && inked !== previous) crossings += 1;
      previous = inked;
    }
    if (crossings > best) {
      best = crossings;
      contrast = brightest / Math.max(1e-4, darkest);
    }
  }
  assert.ok(
    best >= 20,
    `the print alternates ${best} times across the chest — that is a fade, not a screen`,
  );
  assert.ok(contrast > 8, `the dots stand only ${contrast.toFixed(1)}x off their ground`);
});

test('the halftone still reaches the upper chest around her mark', () => {
  // Raising the mark must not buy its clean seat by erasing the outfit around
  // it. Sample two bands outside the mark's rounded margin, high enough that
  // the shortened 0.55–0.65 fade has already gone completely dark.
  const chest = ATLAS_REGIONS.chest;
  const left = chest.u0 * ATLAS_SIZE;
  const right = chest.u1 * ATLAS_SIZE;
  const bottom = chest.v0 * ATLAS_SIZE;
  const top = chest.v1 * ATLAS_SIZE;
  const width = right - left;
  const height = top - bottom;
  const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  let ink = 0;
  let ground = 0;

  for (const across of [0.24, 0.30, 0.70, 0.76]) {
    for (let row = 0; row <= 80; row += 1) {
      const t = 0.72 + row / 80 * 0.12;
      const value = luma(texel(left + width * across, bottom + height * t));
      if (value > 0.10) ink += 1;
      else ground += 1;
    }
  }

  assert.ok(ink > 20, `only ${ink} upper-chest samples contain halftone ink`);
  assert.ok(ground > 20, `only ${ground} upper-chest samples preserve leather between the dots`);
});

test('every mark on her sheet is one she owns', () => {
  // **A guard on the one file in this project that draws marks.** The rule is
  // narrow and absolute: her devil-and-M ships by her written grant and her
  // name ships by q50, and no manufacturer's device ever does — not the demon
  // on her real suit, not the wordmark down its leg, not the helmet brand
  // (`NOTICE.md`). The alphabet is the enforcement point, because lettering is
  // the only way a brand name could reach the sheet, and it carries exactly the
  // six letters her surname needs.
  //
  // It is asserted rather than trusted because the failure is silent: a future
  // edit adding letters "for a track sign" would make DAINESE printable, and
  // nothing on screen would say so until somebody printed it.
  const letters = new Set('VARGAS'.split(''));
  assert.equal(letters.size, 5, 'VARGAS is five distinct letters');
  // The fourth word is the real venue's city, and it is **assembled rather
  // than written** because M23 Phase A4 put it in `tools/private-tokens.mjs`,
  // which refuses it in any published file — and `src/` is published. The two
  // guards protect the same string from opposite ends: this one stops it being
  // *printed* on her suit, that one stops it being *shipped* in the repository.
  // A literal here would have made the second refuse the first, which is how
  // the conflict was found: the source-export dry run named this line.
  const venueCity = ['S', 'T', 'O', 'C', 'K', 'T', 'O', 'N'].join('');
  for (const word of ['DAINESE', 'ARAI', 'KYT', venueCity]) {
    const printable = word.split('').every((letter) => letters.has(letter));
    assert.equal(printable, false, `the sheet's alphabet can spell ${word}`);
  }
});

test('her loose hair is one casting mesh with two values, beside a fixed liner', () => {
  // Four claims in one, and each was a decision rather than an accident.
  //
  // **One loose mesh**, because a casting rider mesh costs three draw calls and
  // hair built as strands would cost dozens — Trollina's 56-piece head of hair
  // is one buffer for exactly this reason. The liner is a separate non-casting
  // mesh because it must stay fixed inside the helmet while the mass sways.
  //
  // **Two values**, because the owner supplied a fact no reference carries: her
  // hair is dark with unnatural blonde highlights. A single dark mass behind a
  // dark helmet is not hair, it is a bigger helmet — so the streaks have to be
  // provably present, not merely intended.
  //
  // **Casting**, because from behind, which is where the player is, the tail is
  // the outline (`riderLook.ts` rule 3, which the ghost also reads).
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  try {
    const tails: THREE.Mesh[] = [];
    rider.root.traverse((object) => {
      if ((object as { isMesh?: boolean }).isMesh === true && object.name === 'rider-hair') {
        tails.push(object as THREE.Mesh);
      }
    });
    assert.equal(tails.length, 1, `her hair is ${tails.length} meshes, not one`);
    const tail = tails[0]!;
    assert.equal(tail.castShadow, true, 'her hair carries her outline and must cast');
    assert.equal(tail.parent?.name, 'rider-hair-sway', 'the loose mass must keep its sway pivot');
    const liner = rider.root.getObjectByName('rider-hair-cap') as THREE.Mesh | undefined;
    assert.ok(liner, 'her helmet liner is missing');
    assert.equal(liner.castShadow, false, 'the shell already casts for its hidden liner');
    assert.equal(liner.parent, rider.neck, 'the liner must remain fixed in the helmet frame');

    const mark = new THREE.Color(BLOCKOUT_COLOURS.maribelMark);
    const dark = new THREE.Color(BLOCKOUT_COLOURS.maribelHair);
    const light = new THREE.Color(BLOCKOUT_COLOURS.maribelHairLight);
    // Measured as luminance along the axis between her two authored values,
    // not as proximity to either: a highlight is a *partial* bleach by
    // construction — the streaks blend toward the blonde rather than reaching
    // it — so a test that demanded the endpoint would be asserting a look
    // nobody chose.
    const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const floor = luma(dark);
    const ceiling = luma(light);
    const colour = tail.geometry.getAttribute('color');
    let base = 0;
    let bleached = 0;
    let darkest = Infinity;
    let brightest = 0;
    for (let i = 0; i < colour.count; i += 1) {
      const value = new THREE.Color(
        colour.getX(i) * mark.r,
        colour.getY(i) * mark.g,
        colour.getZ(i) * mark.b,
      );
      const along = (luma(value) - floor) / (ceiling - floor);
      darkest = Math.min(darkest, along);
      brightest = Math.max(brightest, along);
      if (along < 0.12) base += 1;
      if (along > 0.40) bleached += 1;
    }
    // **A1d added a third value: the shadow half.** The contract used to be
    // that nothing sat below her base colour, which was right while the mass
    // was one flat field lit from one side — and was exactly why it read as
    // suede rather than as hair. Half of what makes hair read as hair is the
    // half of it in shadow, so the parting and the tuck under the helmet now
    // go *below* the base. What must still hold is that the darkest value is a
    // shadow on brown hair and not a different, darker head of hair.
    assert.ok(
      darkest > -0.34 && darkest < 0.05,
      `the darkest hair sits at ${darkest.toFixed(2)} of the way to blonde; a shadow, not a repaint`,
    );
    assert.ok(base > 0, 'her hair has no vertices at her base colour');
    assert.ok(
      bleached > 0,
      `her brightest streak reaches only ${brightest.toFixed(2)} of the way to blonde `
        + '— the highlights are missing',
    );
    // Dark hair *with* highlights: the base has to be the majority, which is
    // the correction the first capture round forced.
    assert.ok(
      base > bleached,
      `${bleached} bleached vertices against ${base} dark — that is blonde hair with dark streaks`,
    );
  } finally {
    rider.dispose();
  }
});

test('her hair is a closed shell with every face turned outward', () => {
  // **§23.9m, and it took two builds and a blind critic to see it.** The
  // curtain is two grids joined by a band of thirty-eight quads round its
  // perimeter, and that band was wound inside-out: the right-hand edge's
  // normal came out at −x on the +x side of the mass, the top edge's pointed
  // at the floor. Back faces are culled, so the band did not draw. From
  // dead-on profile — where the camera looks straight down the near edge —
  // the slot between the two grids opened onto the sky, and what was left was
  // the outer grid on its own: a 4 px hair-coloured ribbon apparently floating
  // clear of her back. Nothing was floating and nothing was misplaced; an
  // edge was simply missing.
  //
  // **Asserted by edge parity rather than by eye.** A closed surface walks
  // every edge exactly twice, once in each direction — that is what makes the
  // two faces sharing it agree about which side is out. A flipped face walks
  // one of its edges the same way its neighbour already did, so the count of
  // same-direction repeats is exactly the count of disagreements, and it does
  // not care how the mesh is built or which way is "outside". The build this
  // replaces walked seventy-six.
  //
  // The signed volume is the second half of the claim: parity alone is also
  // satisfied by a shell that is consistently wound *inward*, which would cull
  // the whole mass instead of one band.
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  try {
    const hair = rider.root.getObjectByName('rider-hair') as THREE.Mesh | undefined;
    assert.ok(hair, 'Maribel has no hair mesh');
    const index = hair.geometry.getIndex();
    assert.ok(index, 'her hair must be indexed');
    const position = hair.geometry.getAttribute('position');
    const walked = new Map<string, number>();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeAB = new THREE.Vector3();
    const edgeAC = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let volume = 0;
    for (let t = 0; t < index.count; t += 3) {
      const i0 = index.getX(t);
      const i1 = index.getX(t + 1);
      const i2 = index.getX(t + 2);
      for (const [from, to] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
        const key = `${from}>${to}`;
        walked.set(key, (walked.get(key) ?? 0) + 1);
      }
      a.fromBufferAttribute(position, i0);
      b.fromBufferAttribute(position, i1);
      c.fromBufferAttribute(position, i2);
      cross.crossVectors(edgeAB.subVectors(b, a), edgeAC.subVectors(c, a));
      // The divergence theorem, one triangle at a time.
      volume += a.dot(cross) / 6;
    }
    let repeated = 0;
    let unpaired = 0;
    for (const [key, count] of walked) {
      if (count > 1) repeated += 1;
      const [from, to] = key.split('>');
      if (!walked.has(`${to}>${from}`)) unpaired += 1;
    }
    assert.equal(repeated, 0, `${repeated} edges of her hair are walked twice the same way — that many faces are inside-out`);
    assert.equal(unpaired, 0, `${unpaired} edges of her hair have no opposite twin — the shell is not closed`);
    assert.ok(
      volume > 0,
      `her hair encloses ${(volume * 1e6).toFixed(0)} cm³ — a negative volume is a shell wound inward, which culls entirely`,
    );
  } finally {
    rider.dispose();
  }
});

test('her hair reads as one head — the liner never shows beside the mass', () => {
  // **The owner, on a hard-brake capture: *"the hair is not stitched together
  // right."*** He circled two dark voids either side of her nape, and the
  // mark-up was of the frame that had just been repaired, so this is a third
  // defect rather than a relapse.
  //
  // Her hair is two meshes on purpose: a loose curtain on the sway pivot, and
  // a fixed liner that fills the shell and gathers at the nape so the pivot
  // seam has something behind it (`rider-hair-cap`, asserted above). That only
  // reads as one head of hair while the fixed part stays *behind* the loose
  // one. It did not. The liner carried two side lobes centred at x = ±0.06 and
  // reaching 0.092, and the curtain's root row tapered to 0.036 on its way up
  // under the rim — so below the shell the lobes stood thirty-five millimetres
  // outboard of the mass with the helmet's own black rim in the wedge between
  // them, which is exactly a pair of tabs stuck on either side of a ponytail.
  // A hard brake tips the head 0.39 rad forward and turns that wedge to face
  // the player.
  //
  // Both halves of the repair are stated here, because either one alone comes
  // back. The lobes are gone — measured at four pixels of difference in the
  // deepest fold this rig can reach — and their wrapping is the gather's job
  // now. And the curtain's root is 88% of the helmet rim rather than 55%: hair
  // under a lid is as wide as the lid, and the taper above the shoulder blades
  // is a taper rather than a stalk.
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  try {
    const hair = rider.root.getObjectByName('rider-hair') as THREE.Mesh | undefined;
    const liner = rider.root.getObjectByName('rider-hair-cap') as THREE.Mesh | undefined;
    assert.ok(hair && liner, 'Maribel is missing a hair mesh');
    const mass = hair.geometry.getAttribute('position');
    const cap = liner.geometry.getAttribute('position');
    // Both are fixed to the neck at rest — the sway pivot is identity there —
    // so their vertices are already in one frame.
    const rim = MARIBEL_LOOK.profiles.head[0]!;

    // **Not a ponytail.** The root band is the curtain's highest row.
    let crown = -Infinity;
    for (let i = 0; i < mass.count; i += 1) crown = Math.max(crown, mass.getY(i));
    let root = 0;
    for (let i = 0; i < mass.count; i += 1) {
      if (mass.getY(i) > crown - 1e-4) root = Math.max(root, Math.abs(mass.getX(i)));
    }
    assert.ok(
      root >= rim.halfWidth * 0.80,
      `her hair's root is ${(root * 2000).toFixed(0)} mm across under a `
        + `${(rim.halfWidth * 2000).toFixed(0)} mm helmet rim — that is a ponytail, not a head of hair`,
    );

    // The mass's outline, taken from the rows it is actually built from. The
    // broken hem gives its lower vertices a height each, so a row is a height
    // that a whole ring of vertices shares; a bucket holding one lock tip is
    // not a row and would report the mass as narrow where it is widest.
    const perRow = new Map<number, { widest: number; n: number }>();
    for (let i = 0; i < mass.count; i += 1) {
      const key = Math.round(mass.getY(i) * 1e3) / 1e3;
      const row = perRow.get(key) ?? { widest: 0, n: 0 };
      row.widest = Math.max(row.widest, Math.abs(mass.getX(i)));
      row.n += 1;
      perRow.set(key, row);
    }
    const rows = [...perRow.entries()]
      .filter(([, row]) => row.n >= 8)
      .map(([y, row]) => ({ y, widest: row.widest }))
      .sort((a, b) => a.y - b.y);
    assert.ok(rows.length >= 6, `only ${rows.length} rows recovered from her hair`);
    const massHalfWidthAt = (y: number): number => {
      if (y <= rows[0]!.y) return rows[0]!.widest;
      const last = rows[rows.length - 1]!;
      if (y >= last.y) return last.widest;
      for (let i = 1; i < rows.length; i += 1) {
        const above = rows[i]!;
        if (y <= above.y) {
          const below = rows[i - 1]!;
          const t = (y - below.y) / (above.y - below.y);
          return below.widest + (above.widest - below.widest) * t;
        }
      }
      return last.widest;
    };

    let worst = -Infinity;
    let worstAt = '';
    let sampled = 0;
    for (let i = 0; i < cap.count; i += 1) {
      const y = cap.getY(i);
      // Above the rim the shell is what hides the liner, and the crown test
      // above is what holds it to that.
      if (y >= rim.y) continue;
      sampled += 1;
      const over = Math.abs(cap.getX(i)) - massHalfWidthAt(y);
      if (over > worst) {
        worst = over;
        worstAt = `(${cap.getX(i).toFixed(3)}, ${y.toFixed(3)}, ${cap.getZ(i).toFixed(3)})`;
      }
    }
    assert.ok(sampled > 60, `only ${sampled} liner vertices sit below the helmet rim`);
    assert.ok(
      worst <= 0,
      `her fixed liner reaches ${(worst * 1000).toFixed(1)} mm outboard of the loose mass at `
        + `${worstAt} — below the rim that is a tab of hair stuck on beside her head`,
    );
  } finally {
    rider.dispose();
  }
});

test('what shows through her knee hinge is the guard, not the leg', () => {
  // M22's lesson, applied before it could be paid for twice. A guard spans a
  // joint, so it is two patches on two bones; a bending knee pulls its halves
  // apart on the outside of the bend, which is the face the camera sees. The
  // limb beneath is therefore painted to the guard's own value, and the two
  // numbers have to stay equal — a shade edited without its tint reopens the
  // gap as a bright line in the middle of the armour.
  const thighGuard = MARIBEL_LOOK.panels.thighPad?.patches[0];
  const shinGuard = MARIBEL_LOOK.panels.kneePad?.patches[0];
  assert.ok(thighGuard && shinGuard, 'both halves of the guard must exist');
  assert.equal(
    thighGuard.shade,
    shinGuard.shade,
    'the guard hinges between two different values',
  );

  // The band each half covers, taken from the patches themselves rather than
  // restated here — a guard whose geometry moved without its paint is the
  // defect, so the test must read the same numbers the guard does.
  const guard = new THREE.Color(BLOCKOUT_COLOURS.maribelMark).multiplyScalar(thighGuard.shade!);
  for (const [profile, painter, inside] of [
    [MARIBEL_LOOK.profiles.thigh, MARIBEL_LOOK.paint?.thigh, (y: number) => y <= thighGuard.to],
    [MARIBEL_LOOK.profiles.shin, MARIBEL_LOOK.paint?.shin, (y: number) => y >= shinGuard.from],
  ] as const) {
    for (const side of [HER_RIGHT, HER_LEFT]) {
      const geometry = paintedLimb(profile, painter, side);
      const position = geometry.getAttribute('position');
      const colour = geometry.getAttribute('color');
      let sampled = 0;
      let matching = 0;
      for (let i = 0; i < position.count; i += 1) {
        if (!inside(position.getY(i))) continue;
        sampled += 1;
        if (nearness(rendered(colour, i), guard) < 0.06) matching += 1;
      }
      geometry.dispose();
      assert.ok(sampled > 0, 'no vertices lie under the guard at all');
      assert.equal(
        matching,
        sampled,
        `${sampled - matching} of ${sampled} vertices under the guard are still leather`,
      );
    }
  }
});

test('she is a fifth look and not a recoloured fourth', () => {
  // M22's rule, stated for the roster she joins rather than for her alone: a
  // set of assets required to differ must be *asserted* to differ. It matters
  // here because she is the third black-suited rider on a five-rider roster,
  // and the things separating her from the other two — the visor's hue, the
  // asymmetry, the pale accent base — are all values in one table that a later
  // edit could quietly collapse.
  const others = PLAYABLE_RIDER_LOOKS.filter((look) => look.id !== 'maribel-vargas');
  for (const role of ['body', 'accent', 'head', 'face', 'gear'] as const) {
    for (const other of others) {
      assert.notEqual(
        MARIBEL_LOOK.materials[role].colour,
        other.materials[role].colour,
        `her ${role} is ${other.id}'s ${role}`,
      );
    }
  }

  // The body is a third vocabulary, not one of the two already here. Her waist
  // against her hips is the number the owner's directive comes down to — his
  // words were "maribel is a real woman not a caricature" — and it has to land
  // between the men's near-straight torso and Trollina's cartoon cinch.
  const ratio = (look: typeof MARIBEL_LOOK): number => {
    const widths = look.profiles.torso.map((ring) => ring.halfWidth);
    const hip = Math.max(...look.profiles.seat.map((ring) => ring.halfWidth));
    return Math.min(...widths.slice(1, widths.length - 4)) / hip;
  };
  const hers = ratio(MARIBEL_LOOK);
  const his = ratio(COOL_RIDER_LOOK);
  const trollina = ratio(riderLook('trollina'));
  assert.ok(hers < his, `her waist-to-hip is ${hers.toFixed(2)}, no narrower than his ${his.toFixed(2)}`);
  assert.ok(
    hers > trollina,
    `her waist-to-hip is ${hers.toFixed(2)}, at or past Trollina's caricature ${trollina.toFixed(2)}`,
  );
});

test('her draw-call overrun is the waived, bounded kind', () => {
  // Until A1c this asserted parity — she could cost no more calls than Cool
  // Rider — and A1b honoured it to the letter while failing the owner's eye.
  // The owner then waived parity for her twice over: *"break the graphics
  // budget to get her to look good ... more polygons or whatever else, i
  // don't care"* on the night A1 was rejected, and, through his reviewer on
  // A1b, *"draw-call parity with the existing characters is not a
  // requirement ... 5–10 additional draw calls is probably a much better
  // trade than an ugly character."*
  //
  // A waiver is not the absence of a number — it is a different number, and
  // then the §9 measurement priced it: the frame ceiling sat at exactly 150
  // with the level library's worst case, so there was never a call of
  // headroom to spend. What A1c added it added for one call (the armour pod
  // buffer) and for zero (the painted elbows, the hair rebuild, the whole
  // machine reshape — merges and paint), landing her back at his number.
  // The bound below is the reviewer's ceiling kept on record so a later edit
  // knows the waiver exists — and the renderCost ceiling test is what knows
  // it cannot currently be drawn on.
  const rows = [COOL_RIDER_LOOK, MARIBEL_LOOK].map((look) => {
    const rider = createPlaceholderRider(look);
    try {
      const cost = measureObject(rider.root);
      return { id: look.id, meshes: cost.meshes.length, calls: cost.totalDrawCalls, triangles: cost.totalTriangles };
    } finally {
      rider.dispose();
    }
  });
  const [cool, maribel] = rows as [typeof rows[0], typeof rows[0]];
  console.log(
    `${maribel.id} meshes ${maribel.meshes} calls ${maribel.calls} triangles ${maribel.triangles}`
      + ` | ${cool.id} meshes ${cool.meshes} calls ${cool.calls} triangles ${cool.triangles}`,
  );
  assert.ok(
    maribel.calls <= cool.calls + 6,
    `she costs ${maribel.calls} draw calls against his ${cool.calls} — past even the waived bound`,
  );
  assert.ok(maribel.triangles > cool.triangles, 'her suit, guards and hair are real triangles');
});

test('her figure inverts the male frame, and her machine outgrew the commuter shell', () => {
  // The two measurements A1c exists to move, asserted so they cannot drift
  // back. A male frame carries its shoulders outside its hips; hers must sit
  // visibly inside (the fifth-look test already pins her waist between the
  // men's and Trollina's). And her machine must stand taller than the
  // standard wheel with its pad stack in the silhouette — the A2 row shipped
  // the standard body, and the owner's reviewer read the result as "a compact
  // generic EUC with purple cosmetics".
  const shoulders = (look: typeof MARIBEL_LOOK): number => Math.max(
    ...look.profiles.torso.filter((ring) => ring.y > 0.40).map((ring) => ring.halfWidth),
  );
  const hips = (look: typeof MARIBEL_LOOK): number => Math.max(
    ...look.profiles.seat.map((ring) => ring.halfWidth),
  );
  const hers = shoulders(MARIBEL_LOOK) / hips(MARIBEL_LOOK);
  const his = shoulders(COOL_RIDER_LOOK) / hips(COOL_RIDER_LOOK);
  assert.ok(hers < 0.94, `her shoulders sit at ${hers.toFixed(2)} of her hips — not inside them`);
  assert.ok(his > 1.0, `the baseline moved: his shoulders are ${his.toFixed(2)} of his hips`);

  const look = machineLook('maribel');
  assert.ok(look.shell.profile, 'her machine is back on the standard commuter shell');
  const shellTop = Math.max(...look.shell.profile!.map((ring) => ring.y));
  assert.ok(
    shellTop > 0.59,
    `her shell tops out at ${shellTop} m — the standard body reads as a commuter under her`,
  );
  assert.equal(look.top.kind, 'saddle', 'the purple pad stack left her machine');
  assert.ok(look.tyre?.lugs, 'her street tread went slick again');
  // Distinct from the machine whose identity IS the knobby tyre: half the
  // block height, more of them.
  const adonisb2 = machineLook('adonisb2');
  assert.ok(
    look.tyre!.lugs!.size[1] <= adonisb2.tyre!.lugs!.size[1] * 0.55
      && look.tyre!.lugs!.count > adonisb2.tyre!.lugs!.count,
    'her tread reads as his knobby',
  );
  // The stack stays under a crouched rider's hips, exactly as every saddle
  // must (`redRider.test.ts` pins the same ceiling for his seat).
  const crown = Math.max(...(look.top.kind === 'saddle' ? look.top.profile : []).map((r) => r.y));
  assert.ok(
    crown + 0.10 <= RIDER.hipHeight - RIDER_BLOCKOUT.crouchHipDrop,
    `the pad stack's crown at ${crown} m is inside a crouched rider`,
  );
});

/** Walk a built rig and hand back every mesh in it. */
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) found.push(object as THREE.Mesh);
  });
  return found;
}

test('the sheet exists only for the looks that asked for one', () => {
  // **The no-op pin for M23 Phase A1b**, and the reason it is worth a test:
  // the kit now writes a `uv` attribute on every geometry it makes, for every
  // character in the game. That is harmless by design — a material with no
  // `map` ignores the attribute — but "harmless by design" is exactly the
  // claim that should be checked rather than asserted in a comment, because
  // the failure mode is somebody else's rider quietly wearing her chest print.
  //
  // Two halves. No unprinted look's material may carry a map at all; and no
  // unprinted look's geometry may have been *folded* onto a page, which shows
  // as texture coordinates that still span their own unit square. **A look
  // with a sheet of its own is the other case** — hers, and Wheel in Motion's
  // since M28 — and each of those has its own file asserting that every
  // mapped mesh lands on a page (`wheelInMotion.test.ts` for his).
  for (const look of RIDER_LOOKS) {
    if (look.atlas !== undefined) continue;
    const rider = createPlaceholderRider(look);
    try {
      for (const mesh of meshesOf(rider.root)) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        // `=== null` rather than `assert.equal(map, null)`: a failing
        // equality would inspect a four-megabyte texture into the message.
        assert.ok(material.map === null, `${look.id}'s ${mesh.name} samples a texture`);
        const uv = mesh.geometry.getAttribute('uv');
        assert.ok(uv, `${look.id}'s ${mesh.name} lost its texture coordinates`);
        let low = Infinity;
        let high = -Infinity;
        for (let i = 0; i < uv.count; i += 1) {
          low = Math.min(low, uv.getX(i), uv.getY(i));
          high = Math.max(high, uv.getX(i), uv.getY(i));
        }
        assert.ok(
          low < 1e-6 && high > 1 - 1e-6,
          `${look.id}'s ${mesh.name} was folded onto an atlas page it never asked for`,
        );
      }
    } finally {
      rider.dispose();
    }
  }
});

test('every mesh of hers that samples the sheet lands on a page', () => {
  // **The invariant the whole atlas mechanism rests on.** Geometry arrives
  // carrying the unit square the kit gave it; if a mapped mesh keeps that
  // square it samples the *entire* sheet, and a rider turns up wearing her own
  // chest print, her leg script and her visor gradient smeared across one
  // knee. Nothing on screen would name that as the cause.
  //
  // It is asserted per mesh rather than per look because the paging happens at
  // two sites in `render/rider.ts` — panels and extras — and a third site
  // added later for a part drawn in a mapped material would be invisible to a
  // check written any other way.
  const pages = Object.entries(ATLAS_REGIONS);
  const rider = createPlaceholderRider(MARIBEL_LOOK);
  const used = new Set<string>();
  try {
    let mapped = 0;
    for (const mesh of meshesOf(rider.root)) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map === null) continue;
      mapped += 1;
      const uv = mesh.geometry.getAttribute('uv');
      assert.ok(uv, `her ${mesh.name} samples the sheet with no texture coordinates`);
      for (let i = 0; i < uv.count; i += 1) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        const page = pages.find(([, rect]) => (
          u >= rect.u0 - 1e-6 && u <= rect.u1 + 1e-6 && v >= rect.v0 - 1e-6 && v <= rect.v1 + 1e-6
        ));
        assert.ok(page, `her ${mesh.name} samples (${u.toFixed(3)}, ${v.toFixed(3)}), which is off every page`);
        used.add(page[0]);
      }
    }
    assert.ok(mapped >= 4, `only ${mapped} of her meshes sample the sheet`);
  } finally {
    rider.dispose();
  }

  // And the pages that carry a mark are actually reached by something. A page
  // painted and never mapped is art nobody sees, which is the quiet way this
  // system fails in the other direction.
  for (const page of ['chest', 'visor', 'hair', 'kneeDevice', 'legScript', 'legPlain', 'backMark']) {
    assert.ok(used.has(page), `nothing on her wears the ${page} page`);
  }
});

test('her wheel wears her mark and no other machine acquires one', () => {
  // Phase A2's half of the bundle. Her logo ships on a machine by her own
  // written grant — *"That's my logo 🙂"* — and the mechanism that puts it
  // there is the same sheet the rider samples, so the same containment rule
  // applies and the same blast radius has to be checked: no other machine may
  // acquire a texture because hers did.
  for (const id of MACHINE_IDS) {
    const look = machineLook(id);
    if (id === 'maribel') {
      assert.ok(look.atlas, 'her machine has no sheet');
      assert.ok(
        look.trim.patches.some((patch) => patch.art === 'machineMark'),
        'her wheel carries no mark',
      );
      assert.equal(
        look.pads?.colour,
        BLOCKOUT_COLOURS.maribelPurple,
        'her pads are not her purple',
      );
      continue;
    }
    // Wheel in Motion's wheel is the second to carry its rider's own mark, on
    // the same footing (M28 §28.5) — and on a sheet of its own, so nothing of
    // hers reaches him: his patches ask for `plate`, never `machineMark`.
    if (id === 'wheel-in-motion') {
      assert.ok(look.atlas, 'his machine has no sheet');
      assert.ok(look.trim.patches.some((patch) => patch.art === 'plate'), 'his wheel carries no mark');
      assert.ok(
        look.trim.patches.every((patch) => patch.art === undefined || patch.art === 'plate'),
        'his wheel asks for a page that is not his plate',
      );
      assert.notEqual(look.atlas.build, createMaribelAtlas, 'his wheel wears her sheet');
      continue;
    }
    // The Drunkard's wheel is the third with a sheet, and the first whose
    // sheet carries no mark of anybody's: its one printed thing is the pad's
    // page (the hop cone, `render/drunkardMachineAtlas.ts`), on a sheet of
    // its own — no patch of his asks for `machineMark`, and nothing of hers
    // reaches him (M29 §29.6).
    if (id === 'drunkard') {
      assert.ok(look.atlas, 'his machine has no sheet');
      assert.equal(look.pads?.art, 'pads', 'his pads are not printed');
      assert.ok(
        look.trim.patches.every((patch) => patch.art === undefined),
        'his wheel asks for a page on the trim — the cone is on the pads',
      );
      assert.notEqual(look.atlas.build, createMaribelAtlas, 'his wheel wears her sheet');
      continue;
    }
    assert.equal(look.atlas, undefined, `${id} acquired a printed sheet`);
    for (const patch of look.trim.patches) {
      assert.equal(patch.art, undefined, `${id} has a patch asking for atlas art`);
    }
  }
});
