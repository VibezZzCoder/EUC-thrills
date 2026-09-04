/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, FX } from './tuning.ts';
// `render/groundNoise.ts` imports nothing, which is what lets a data test reach
// across to it without dragging three.js into `node --test`.
import { EDGE_ENCROACH, maxLuminanceGain } from '../render/groundNoise.ts';
import {
  HAZARD_SURFACE_IDS,
  MATERIALS,
  SURFACES,
  SURFACE_IDS,
  TERRAIN_SURFACE_IDS,
  materialAppearance,
  surfaceProperties,
  type MaterialId,
} from './surfaces.ts';

/**
 * Table completeness, which `AGENTS.md` names as headless territory.
 *
 * Three of the six gameplay properties have no consumer before M5, M6, and M8.
 * That is exactly why they are tested now: a surface added later without a
 * particle or a tyre voice throws no dust and makes no sound, and neither
 * failure produces an error — the wheel just rides over silence.
 */

/** Every id the type union declares. Written out so a new one fails here. */
const DECLARED_IDS = [
  'pavement',
  'roughPavement',
  'brick',
  'grass',
  'gravel',
  'dirt',
  'wood',
  'spill',
] as const;

test('every surface docs/PLANS.md §4.3 names is in the table, and no others', () => {
  assert.deepEqual([...SURFACE_IDS].sort(), [...DECLARED_IDS].sort());
});

test('every surface declares every property, including the ones nothing reads yet', () => {
  for (const id of SURFACE_IDS) {
    const surface = SURFACES[id];
    assert.equal(surface.id, id, `${id} carries the wrong id`);
    assert.ok(surface.label.length > 0, `${id} has no label`);

    assert.ok(
      Number.isFinite(surface.rollingResistance) && surface.rollingResistance >= 0,
      `${id} needs a non-negative rolling resistance`,
    );
    assert.ok(
      surface.grip > 0 && surface.grip <= 1,
      `${id} grip must be in (0, 1] — pavement is the 1.0 reference`,
    );
    assert.ok(
      surface.roughnessAmplitude >= 0 && surface.roughnessAmplitude < 0.15,
      `${id} roughness amplitude is out of range`,
    );
    assert.ok(
      surface.roughnessWavelength > 0.2,
      `${id} needs a roughness wavelength the suspension can respond to`,
    );

    // M5, M8, M6. Declared now so a later surface cannot arrive mute.
    assert.ok(surface.particle.length > 0, `${id} has no particle family (M5)`);
    // **And the family has to have a colour, or it is `none` with extra steps.**
    // `render/Renderer.ts` looks the id up in `FX.particleColours` and returns
    // silently when it finds nothing — which is exactly right for `none` and is
    // a surface that quietly throws nothing for every other value. M13 Phase 2
    // added `splash` and this is the guard that would have caught forgetting
    // its colour, in the one place a reader is already checking the row.
    assert.ok(
      surface.particle === 'none'
        || (FX.particleColours as Partial<Record<string, number>>)[surface.particle] !== undefined,
      `${id} throws "${surface.particle}", which has no colour in FX.particleColours`,
    );
    assert.ok(surface.tyreAudio.length > 0, `${id} has no tyre voice (M8)`);
    assert.ok(
      Number.isFinite(surface.wobbleInjection) && surface.wobbleInjection >= 0,
      `${id} has no wobble injection coefficient (M6)`,
    );

    assert.ok(
      MATERIALS[surface.material] !== undefined,
      `${id} points at material "${surface.material}", which does not exist`,
    );
  }
});

test('pavement is the reference surface both scales are anchored to', () => {
  assert.equal(SURFACES.pavement.grip, 1.0);
  // The M2 controller shipped exactly one rolling resistance for exactly one
  // surface: 0.35 m/s^2. The surface table has to reproduce it, or M4 silently
  // retunes the ride the owner already accepted on the ground he accepted it
  // on. Written as a literal rather than read from `EUC` on purpose — the
  // constant moved into this table, so there is nothing left to compare it to
  // and this line is the record of where it came from.
  assert.equal(SURFACES.pavement.rollingResistance, 0.35);
});

test('the loose surfaces are slower and looser than the paved ones', () => {
  // The whole of M4's exit question, stated as an ordering rather than as a
  // magnitude — magnitudes are the owner's to tune with F4.
  for (const loose of ['grass', 'gravel', 'dirt'] as const) {
    assert.ok(
      SURFACES[loose].rollingResistance > SURFACES.pavement.rollingResistance,
      `${loose} must cost more speed than pavement`,
    );
    assert.ok(
      SURFACES[loose].grip < SURFACES.pavement.grip,
      `${loose} must corner wider than pavement`,
    );
    assert.ok(
      SURFACES[loose].roughnessAmplitude > SURFACES.pavement.roughnessAmplitude,
      `${loose} must be rougher than pavement`,
    );
  }
});

test('grass is meaningfully slower than pavement, not marginally', () => {
  // Top speed is where drive authority balances drag plus rolling resistance.
  // Stated as arithmetic rather than as a magic number so the check survives a
  // tuning change to any of the three inputs.
  const drive = EUC.leanToAccel * Math.sin(EUC.maxLeanPitch);
  const topSpeed = (rollingResistance: number): number => (
    Math.sqrt(Math.max(0, drive - rollingResistance) / EUC.dragCoefficient)
  );

  const pavement = topSpeed(SURFACES.pavement.rollingResistance);
  const grass = topSpeed(SURFACES.grass.rollingResistance);

  // 29.06 m/s — the shipped 65 mph wheel (M30 Phase 4; 22.3 and 50 mph before
  // it, and the band moved with the wheel rather than being widened to cover
  // both). Stated as a band because the point is that the *arithmetic* still
  // lands on the wheel this project ships, not that any one digit is fixed.
  assert.ok(pavement > 28.5 && pavement < 29.5, `pavement top speed drifted to ${pavement}`);
  // Under 10% and the owner cannot feel it with their eyes shut, which is the
  // gate this milestone is judged by.
  assert.ok(
    grass < pavement * 0.9,
    `grass tops out at ${grass.toFixed(2)} against pavement's ${pavement.toFixed(2)} — too close`,
  );
});

test('every material is legible rather than realistically dark', () => {
  // The M0 and M2 lesson, as an assertion: a value picked by eye as "dark grey"
  // lands near 0.02 linear and crushes to a featureless silhouette under ACES.
  for (const id of Object.keys(MATERIALS) as MaterialId[]) {
    const material = MATERIALS[id];
    const srgb = [
      (material.albedo >> 16) & 0xff,
      (material.albedo >> 8) & 0xff,
      material.albedo & 0xff,
    ].map((channel) => channel / 255);
    const linear = srgb.map((channel) => channel ** 2.2);
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];

    assert.ok(
      luminance > 0.03,
      `${id} is ${luminance.toFixed(3)} linear — it will crush under ACES`,
    );
    assert.ok(luminance < 0.6, `${id} is ${luminance.toFixed(3)} linear — it will blow out`);
    assert.ok(material.roughness > 0 && material.roughness <= 1, `${id} roughness out of range`);
    assert.ok(material.metalness >= 0 && material.metalness <= 1, `${id} metalness out of range`);
    assert.ok(material.mottle >= 0 && material.mottle < 0.4, `${id} mottle out of range`);
  }
});

test('kerb concrete is lighter than every road surface it borders', () => {
  // A kerb the player cannot see before they hit it is a kerb that reads as an
  // unexplained speed loss. This is a readability rule, not a taste one.
  const luminance = (hex: number): number => (
    0.2126 * (((hex >> 16) & 0xff) / 255) ** 2.2
    + 0.7152 * (((hex >> 8) & 0xff) / 255) ** 2.2
    + 0.0722 * ((hex & 0xff) / 255) ** 2.2
  );
  for (const id of ['pavement', 'roughPavement', 'brick'] as const) {
    assert.ok(
      luminance(MATERIALS.concrete.albedo) > luminance(MATERIALS[id].albedo) * 1.25,
      `concrete does not read apart from ${id}`,
    );
  }
});

test('the kerb still reads apart from a road at its brightest mottled cell', () => {
  // The rule above compares two flat table values, and that stopped being the
  // whole question at M7.5: the road the player sees is its albedo times the
  // mottle stack, and the mottle gained layers. A road bright patch that closes
  // on the kerb is the same unreadable kerb the rule exists to prevent, so the
  // check is against the brightest cell the ground can produce.
  //
  // Pavement is the tight one — it is the lightest road and the kerb is only
  // 48% above it — which is exactly why this is asserted rather than assumed.
  const luminance = (hex: number): number => (
    0.2126 * (((hex >> 16) & 0xff) / 255) ** 2.2
    + 0.7152 * (((hex >> 8) & 0xff) / 255) ** 2.2
    + 0.0722 * ((hex & 0xff) / 255) ** 2.2
  );
  for (const id of ['pavement', 'roughPavement', 'brick'] as const) {
    const brightest = luminance(MATERIALS[id].albedo) * maxLuminanceGain(MATERIALS[id].mottle);
    assert.ok(
      luminance(MATERIALS.concrete.albedo) > brightest * 1.25,
      `concrete does not read apart from ${id} at its brightest`,
    );
  }
});

test('an unknown surface falls back rather than throwing inside the step', () => {
  const unknown = 'asphalt' as never;
  assert.equal(surfaceProperties(unknown).id, 'pavement');
  assert.equal(materialAppearance(unknown).id, 'pavement');
});

test('the tables are frozen, so an override cannot rewrite a default', () => {
  assert.throws(() => {
    (SURFACES.grass as { grip: number }).grip = 0.1;
  });
  assert.throws(() => {
    (MATERIALS.grass as { albedo: number }).albedo = 0;
  });
});

// ---------------------------------------------------------------------------
// M7.5 stage 4 — the edge, and the paving
// ---------------------------------------------------------------------------

const linearOf = (hex: number): [number, number, number] => ([
  (((hex >> 16) & 0xff) / 255) ** 2.2,
  (((hex >> 8) & 0xff) / 255) ** 2.2,
  ((hex & 0xff) / 255) ** 2.2,
]);

const lumOf = (hex: number): number => {
  const [r, g, b] = linearOf(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('only the loose and the rough creep, and turf creeps hardest of all', () => {
  // The ordering *is* the rule: colour travels from the higher value to the
  // lower, so this table decides which way every boundary in the world frays.
  for (const laid of ['pavement', 'brick', 'wood', 'concrete', 'stone', 'metal', 'signalRed'] as const) {
    assert.equal(MATERIALS[laid].encroach, 0, `${laid} is laid or built and must not spread`);
  }
  assert.equal(MATERIALS.grass.encroach, 1, 'grass is the reference the others are set against');
  for (const loose of ['dirt', 'gravel'] as const) {
    assert.ok(
      MATERIALS[loose].encroach > 0 && MATERIALS[loose].encroach < MATERIALS.grass.encroach,
      `${loose} must creep, and less than grass`,
    );
  }
  // Grit off a coarse surface onto a smooth one, and nothing stronger — a road
  // frontage that frayed like a meadow would read as neglect rather than wear.
  assert.ok(
    MATERIALS.roughPavement.encroach > 0
    && MATERIALS.roughPavement.encroach < MATERIALS.gravel.encroach / 2,
    'rough pavement creeps, faintly',
  );
});

test('nothing creeps onto a surface that creeps at least as hard', () => {
  // The renderer only blends when the neighbour is strictly higher. Two
  // surfaces at the same value would leave a boundary un-softened rather than
  // fighting over it, which is correct but easy to create by accident.
  for (const id of SURFACE_IDS) {
    const value = MATERIALS[SURFACES[id].material].encroach;
    assert.ok(value >= 0 && value <= 1, `${id} encroachment out of range`);
  }
});

test('no amount of encroachment can hide a kerb', () => {
  // `DESIGN.md` §3 keeps kerb concrete 25% above every road it borders, and
  // stage 2 already had to restate that against the road's brightest *mottled*
  // cell rather than its table value. Stage 4 adds two more ways a road cell can
  // brighten: it can take up to `EDGE_ENCROACH.maxBlend` of a neighbour's colour,
  // and a paved surface can carry a paving module. The rule is asserted against
  // the worst case all three produce together, over every neighbour that could
  // actually reach it.
  const kerb = lumOf(MATERIALS.concrete.albedo);

  for (const road of ['pavement', 'roughPavement', 'brick'] as const) {
    const material = MATERIALS[road];
    const paving = 1 + (material.paving?.contrast ?? 0);

    for (const neighbour of SURFACE_IDS) {
      const other = MATERIALS[SURFACES[neighbour].material];
      if (other.encroach <= material.encroach) continue;

      // The blend is per channel on the linear albedos; take its luminance.
      const [ar, ag, ab] = linearOf(material.albedo);
      const [br, bg, bb] = linearOf(other.albedo);
      const t = EDGE_ENCROACH.maxBlend;
      const blended = 0.2126 * (ar + (br - ar) * t)
        + 0.7152 * (ag + (bg - ag) * t)
        + 0.0722 * (ab + (bb - ab) * t);

      const brightest = blended * maxLuminanceGain(material.mottle) * paving;
      assert.ok(
        kerb > brightest * 1.25,
        `${road} beside ${neighbour} reaches ${brightest.toFixed(4)}, against a kerb at ${kerb.toFixed(4)}`,
      );
    }
  }
});

test('the plaza is the one laid surface, and its module is not the cell grid', () => {
  const paved = SURFACE_IDS.filter((id) => MATERIALS[SURFACES[id].material].paving !== undefined);
  assert.deepEqual(paved, ['brick'], 'only the plaza is laid');

  const paving = MATERIALS.brick.paving!;
  // A whole multiple of the one-metre heightfield cell would re-phase the
  // module onto the very lattice §4b exists to break up, and the module has to
  // be large enough for a slab to be a slab from six metres away.
  assert.ok(Math.abs(paving.module % 1) > 0.2, `a ${paving.module} m module lines up with the cell grid`);
  assert.ok(paving.module > 1.5 && paving.module < 5, 'a plaza slab is metres, not centimetres');
  assert.ok(paving.contrast > 0 && paving.contrast < 0.12, 'paving contrast is a hint, not a tiling');
});

// ---------------------------------------------------------------------------
// M13 Phase 1 — the spill, and the split it forced
// ---------------------------------------------------------------------------

test('the terrain palette and the hazard surfaces partition the table exactly', () => {
  // The property that makes the split safe to build coverage guards on. A
  // surface added to neither list would be declared, tuned, given a voice, and
  // then required by nothing and painted by nothing — which is precisely the
  // silent death `sliceLevel.test.ts` and `provingGround.test.ts` exist to
  // prevent, and narrowing them to the terrain half is what would have let it
  // through. Overlap is checked as well as coverage: a surface in both lists
  // would satisfy the coverage guard and still be paintable as a hazard.
  const terrain = new Set(TERRAIN_SURFACE_IDS);
  const hazard = new Set(HAZARD_SURFACE_IDS);

  assert.equal(terrain.size, TERRAIN_SURFACE_IDS.length, 'the terrain list repeats itself');
  assert.equal(hazard.size, HAZARD_SURFACE_IDS.length, 'the hazard list repeats itself');
  for (const id of SURFACE_IDS) {
    assert.ok(
      terrain.has(id) !== hazard.has(id),
      `${id} is in ${terrain.has(id) ? 'both lists' : 'neither list'}`,
    );
  }
  assert.equal(
    terrain.size + hazard.size,
    SURFACE_IDS.length,
    'a list names an id the table does not have',
  );

  // And the seven the slice was built from are still the seven, so a hazard
  // cannot be quietly promoted into the palette every level must cover.
  assert.equal(TERRAIN_SURFACE_IDS.length, 7);
  assert.deepEqual([...HAZARD_SURFACE_IDS], ['spill']);
});

test('the spill holds the table\'s only non-zero wobble injection', () => {
  // **The load-bearing claim of the whole milestone.** `docs/PLANS.md` §4.5 and
  // `EUC.wobbleMasterGain`'s note both rest on it: with no continuous
  // background source, any wobble energy at all means the rider hit something
  // they could see, so the oscillator can drop its visibility threshold and a
  // weave can never become the permanent state of riding a rough surface. A
  // second non-zero row would undo that quietly — the ride would simply start
  // weaving on gravel again, with nothing failing.
  for (const id of SURFACE_IDS) {
    const expected = id === 'spill';
    assert.equal(
      SURFACES[id].wobbleInjection > 0,
      expected,
      expected
        ? 'the spill must inject, or M13 has no trigger that is ground'
        : `${id} injects wobble — M13 replaced the trigger set with hazards the `
          + 'rider can see and choose to avoid, and ground they merely chose is not one',
    );
  }
});

test('the spill is a threat with a door, not an execution', () => {
  // The one number M13 Phase 1 rests on, asserted as behaviour rather than as a
  // literal. `EucController.stepWobble` integrates
  // `injection × speed × wobbleSurfaceGain` against damping proportional to the
  // energy, so a puddle is an approach to a ceiling rather than an impulse.
  // These are that ceiling; the arithmetic is written out beside the surface.
  const rate = SURFACES.spill.wobbleInjection * EUC.wobbleSurfaceGain; // per metre
  // Automatic foot correction joins whichever input damping is in force, and it
  // is on for all of this: it engages below the state threshold and never lets
  // go while the rider is in trouble.
  const driving = EUC.wobbleDampingAggressive + EUC.wobbleFootCorrectionDamping;
  const eased = EUC.wobbleDampingSmooth + EUC.wobbleFootCorrectionDamping;
  const ceiling = (speed: number, damping: number): number => (rate * speed) / damping;
  const cruise = 12;

  assert.ok(
    ceiling(cruise, driving) > EUC.wobbleCrashEnergy,
    `driving through water at ${cruise} m/s tops out at `
      + `${ceiling(cruise, driving).toFixed(2)}, under the ${EUC.wobbleCrashEnergy} crash `
      + 'energy — the owner\'s §13 q8 "if the rider does not reduce speed to correct it, '
      + 'they crash" would be unreachable, and the spill would be scenery',
  );
  assert.ok(
    ceiling(cruise, eased) < EUC.wobbleCrashEnergy,
    'easing off must be a genuine correction at cruising speed, or the puddle is a '
      + 'death sentence served on contact',
  );
  assert.ok(
    ceiling(cruise, eased) > EUC.wobbleStateEnergy,
    'and it must not be a cure: water still has to weave a rider who respects it, '
      + 'or the correction is "ignore the hazard"',
  );

  // "Reduce speed" is only an instruction if there is a speed to reduce *to*.
  const safeSpeed = driving / rate;
  assert.ok(
    safeSpeed < cruise && safeSpeed > EUC.hazardCrashSpeed,
    `no puddle can crash a rider under ${safeSpeed.toFixed(1)} m/s — that has to sit below `
      + 'ordinary cruising, or slowing down buys nothing, and above the speed a deep pothole '
      + 'is already fatal at, or the two hazards ask for speeds that cannot both be ridden',
  );

  // Early on the decay term is negligible and both the injection and the
  // distance travelled scale with speed, so the distance at which the state
  // threshold arrives is very nearly speed-independent: it is a property of how
  // big the puddle is, which is the property a player can actually read.
  const metresToWobble = EUC.wobbleStateEnergy / rate;
  assert.ok(
    metresToWobble > 1 && metresToWobble < 5,
    `water announces itself after ${metresToWobble.toFixed(1)} m — under a metre it is a `
      + 'trigger rather than a surface, and past five a puddle can be crossed with nothing '
      + 'to recover from',
  );
});
