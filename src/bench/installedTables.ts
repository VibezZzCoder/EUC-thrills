/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { EUC } from '../data/tuning.ts';
import {
  COAST_STEPS,
  ON_TIME_STEPS,
  STEP_SECONDS,
  apexStepsBeforeLip,
  runTrial,
  stepUpLimit,
  type BenchCharge,
  type BenchTable,
  type BenchWheel,
  type Fixture,
  type TrialResult,
  type TrialScript,
} from './jumpBench.ts';
import {
  INSTALLED_FEATURES,
  bypassFixture,
  installedFeature,
  installedFixture,
  lapDistance,
  reverseFixture,
  type InstalledFeature,
} from './installedPark.ts';

/**
 * The installed feature windows — M36 Phase 2's measurement pass.
 *
 * §36.4: "Phase 0 must attach an actual pass/fail interval to each constructed
 * candidate, on both wheel presets, before Phase 1 fixes its dimensions;
 * **Phase 2 repeats it on the installed geometry**." T1–T10 measure fixtures.
 * T11–T14 measure `createSwitchbackLevel()` — the plan the game boots, with the
 * hillside under it, the blocks settled onto it and the corridor's own width —
 * through the same `runTrial` driver and the same press semantics.
 *
 * Every row here is a speed AT THE LIP. An installed trial is placed on the
 * feature's own corridor a few metres short of the edge, already at the speed
 * under test (`TrialScript.startMph`), and the throttle law holds it there; the
 * separate question of what speed the approach can *deliver* is T11b's, and it
 * is the reason the kicker's landing hill is sixteen metres long.
 *
 * §36.4 requires each record to carry: feature id, entry and merge locations,
 * surface ids, actual lip/landing/catch heights, launch and landing normals,
 * the measured speed interval with interior samples, hop charge, the
 * early/on-time/late input interval, travel and heading error, flight time and
 * landing footprint, controller tier, speed loss and crash result, braking and
 * settling room, and the bypass time over the same endpoints. T11 carries the
 * first ten, T12 the timing interval, T13 the misses and T14 the bypass.
 */

/** A running tally of what a table cost, so the report can add it up. */
class Tally {
  trials = 0;
  steps = 0;

  run(fixture: Fixture, wheel: BenchWheel, script: TrialScript): TrialResult {
    const result = runTrial(fixture, wheel, script);
    this.trials += 1;
    this.steps += result.steps;
    return result;
  }
}

/** The presets a playable installed window is measured on. */
const WHEELS: readonly BenchWheel[] = ['shipped65', 'diagnostic50'];

const mphText = (value: number): string => value.toFixed(2);
const metres = (value: number): string => value.toFixed(3);
const seconds = (value: number): string => value.toFixed(3);

function wheelShort(wheel: BenchWheel): string {
  return wheel === 'shipped65' ? '65' : '50';
}

/** A measurement that only exists when the wheel actually flew and landed. */
function ifLanded(result: TrialResult, render: (result: TrialResult) => string): string {
  return result.landings.length === 0 ? '—' : render(result);
}

/** The press lead an on-time trial uses for this feature and charge, steps. */
function onTimeLead(feature: InstalledFeature, charge: BenchCharge): number {
  return feature.press === 'apex' ? apexStepsBeforeLip(charge) : ON_TIME_STEPS;
}

/** Every trial an installed table rides, scripted the same way. */
function ride(
  tally: Tally,
  feature: InstalledFeature,
  wheel: BenchWheel,
  mph: number,
  options: {
    readonly charge?: BenchCharge;
    readonly lead?: number | null;
    readonly lateralOffset?: number;
    readonly spinTap?: 'left' | 'right';
    readonly bypass?: boolean;
    /**
     * Let the run coast from its start speed instead of holding it.
     *
     * T14's comparison needs it: with the throttle holding a target, a landing's
     * speed loss is refunded within a few steps and the shortcut and the bypass
     * take the same time to the metre. Coasting from one starting state is what
     * §36.8 Phase 2 means by "equal starting state" — the feature's landings are
     * then paid for out of the same energy the bypass keeps.
     */
    readonly coast?: boolean;
    /** Stop at `compareEndS` — the last straight — instead of at the window's end. */
    readonly compare?: boolean;
    /**
     * Steps the coast runs past the last touchdown before the trial stops.
     *
     * Defaults to the effectively unbounded figure below, which is what makes
     * every installed row ride to its feature's merge. A row whose rider
     * *cannot* reach the merge has to say so itself — see the spin rows.
     */
    readonly coastSteps?: number;
  } = {},
): TrialResult {
  const charge = options.charge ?? 'none';
  const lead = options.lead === undefined ? onTimeLead(feature, charge) : options.lead;
  const scoped = options.compare === true && feature.compareEndS !== undefined
    ? { ...feature, endS: feature.compareEndS }
    : feature;
  const fixture = options.bypass === true ? bypassFixture(scoped) : installedFixture(scoped);
  return tally.run(fixture, wheel, {
    targetMph: options.coast === true ? null : mph,
    startMph: mph,
    lipS: feature.lipS,
    hop: lead === null ? 'none' : { stepsFromLip: lead },
    charge,
    holdThrottle: options.coast !== true,
    // Every installed trial runs to the feature's merge, so "settling room" and
    // "bypass time over the same endpoints" are the same clock for every row.
    coastSteps: options.coastSteps ?? 1_000_000,
    maxSteps: 6000,
    rideThroughCrash: true,
    ...(options.lateralOffset === undefined ? {} : { lateralOffset: options.lateralOffset }),
    ...(options.spinTap === undefined ? {} : { spinTap: options.spinTap }),
  });
}

/** What a trial is worth saying in one cell: the tier, or what went wrong. */
function verdict(result: TrialResult): string {
  if (result.crashed) {
    return result.recoveredAfterSteps >= 0
      ? `${result.crashCause} → rode on after ${seconds(result.recoveredAfterSteps * STEP_SECONDS)} s`
      : `${result.crashCause} (no recovery seen)`;
  }
  if (result.landings.length === 0) {
    if (result.blockedSteps > 0) return 'bonk, stayed up';
    if (!result.reachedEnd) return 'never left the ground';
    return result.launched === 'none'
      ? 'rolled through, never left the ground'
      : 'flew past the feature\'s own corridor';
  }
  return '—';
}

const CHARGES: readonly { readonly id: BenchCharge | 'no-hop'; readonly label: string }[] = [
  { id: 'no-hop', label: 'no hop' },
  { id: 'none', label: 'hop' },
  { id: 'half', label: 'hop + half' },
  { id: 'full', label: 'hop + full' },
];

/**
 * T11 — every installed feature's window, both presets, on the built park.
 *
 * `landed at` is metres past the lip, which is the number that decides how much
 * feature is left in front of the touchdown; `settling` is the metres of
 * corridor between the touchdown and the merge this trial stops at, which is
 * §36.4's "braking/settling room". `landings` is the count of separate
 * touchdowns, and it is the whole of the rhythm and staircase claims.
 */
export function tableParkWindows(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const feature of INSTALLED_FEATURES) {
    for (const wheel of WHEELS) {
      for (const mph of feature.speeds) {
        for (const charge of CHARGES) {
          const result = ride(tally, feature, wheel, mph, {
            charge: charge.id === 'no-hop' ? 'none' : charge.id,
            lead: charge.id === 'no-hop' ? null : undefined,
          });
          const settling = result.landings.length === 0
            ? '—'
            : metres(feature.endS - result.landings[result.landings.length - 1].s);
          rows.push([
            feature.id, wheelShort(wheel), `${mph}`, charge.label,
            ifLanded(result, (r) => mphText(r.takeoffMph)),
            result.launched,
            result.takeoffCharge.toFixed(3),
            ifLanded(result, (r) => seconds(r.flightSeconds)),
            ifLanded(result, (r) => metres(r.flightMetres)),
            ifLanded(result, (r) => metres(r.touchdownS - feature.lipS)),
            ifLanded(result, (r) => metres(r.apexMetres)),
            result.landingTier,
            ifLanded(result, (r) => r.landingScore.toFixed(4)),
            result.landedOn,
            `${result.landings.length}`,
            ifLanded(result, (r) => mphText(r.speedLossMph)),
            settling,
            verdict(result),
          ]);
        }
      }
    }
  }

  return {
    id: 'T11',
    title: 'T11 — installed feature windows on `createSwitchbackLevel()`',
    geometry: INSTALLED_FEATURES.flatMap((feature) => [
      `**${feature.id}** — ${feature.label}; corridors ${feature.segments.join(' → ')};`
      + ` lip at lap s = ${feature.lipS.toFixed(1)} m, merge at ${feature.endS.toFixed(1)} m;`
      + ` technical line t = +${feature.technicalT.toFixed(2)} m, bypass t =`
      + ` ${feature.bypassT.toFixed(2)} m; launch grade ${feature.launchGrade.toFixed(2)}%,`
      + ` landing grade ${feature.landingGrade.toFixed(2)}%`,
      ...feature.geometry.map((line) => `  - ${line}`),
    ]),
    notes: [
      'Input names describe the requested hold. `actual charge` is the fraction latched at takeoff;'
        + ' a short installed run-up can launch before a full hold reaches 1.000.',
      'Every trial is placed on the feature\'s own corridor at the stated lip speed and the'
        + ' throttle holds it there, so the speed column is the speed at the lip and not the'
        + ' speed a run-up happened to reach (§36.4). What the approach can actually deliver'
        + ' is T11b.',
      `On-time is \`${ON_TIME_STEPS}\` steps before the lip for a feature the rider LEAVES and`
        + ` \`apexStepsBeforeLip\` — ${apexStepsBeforeLip('none')} / ${apexStepsBeforeLip('half')}`
        + ` / ${apexStepsBeforeLip('full')} steps — for one they have to MOUNT, so the apex`
        + ' arrives at the face.',
      `\`landed on\` is the fixture's own answer: **deck** is a declared top, **catch** is the`
        + ' ground inside the feature\'s span, **other** is past the merge.',
      `Tiers: clean < ${EUC.landingHeavyScore} ≤ heavy < ${EUC.landingWobbleScore} ≤ wobble <`
        + ` ${EUC.landingCrashScore} ≤ crash. A crash recovers in place after`
        + ` ${EUC.crashRecoverAutoSeconds} s at ${EUC.crashRecoverSpeedFactor} of its speed —`
        + ' no reset, no teleport — and the verdict column says when it did.',
    ],
    columns: ['feature', 'wheel', 'lip mph target', 'input', 'lip mph', 'launch', 'actual charge', 'air s',
      'air m', 'landed at m', 'apex m', 'tier', 'score', 'landed on', 'touchdowns',
      'speed lost mph', 'settling m', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** The speeds the approach itself can deliver to a lip, for T11b. */
const APPROACH_ENTRIES = [10, 20, 28.7];

/**
 * T11b — what the approach can actually deliver to the kicker's lip.
 *
 * The one feature whose window has to be read against an attainable speed
 * rather than a swept one, because the table's length is derived from it: the
 * longest flight the lip can throw is a fully charged hop at the fastest speed
 * `kicker-approach` and `kicker-rise` can produce out of the R16 hairpin in
 * front of them, and the table has to be longer than that plus a run-out.
 */
export function tableInstalledApproach(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const kicker = INSTALLED_FEATURES.find((feature) => feature.id === 'kicker');
  if (kicker === undefined) throw new Error('the park has no kicker');

  const approach: InstalledFeature = {
    ...kicker,
    segments: ['kicker-approach', 'kicker-rise', ...kicker.segments],
    // The hairpin's exit socket: 24 m of approach, 18 m of rise and the 6 m
    // take-off pitch before the lip.
    spawnS: kicker.lipS - 48,
  };

  for (const wheel of WHEELS) {
    for (const entry of APPROACH_ENTRIES) {
      for (const charge of ['none', 'full'] as const) {
        const result = tally.run(installedFixture(approach), wheel, {
          // Full throttle the whole way: the question is the ceiling.
          targetMph: 200,
          startMph: entry,
          lipS: approach.lipS,
          hop: { stepsFromLip: ON_TIME_STEPS },
          charge,
          coastSteps: 1_000_000,
          maxSteps: 6000,
          rideThroughCrash: true,
        });
        rows.push([
          wheelShort(wheel), `${entry}`, charge === 'full' ? 'hop + full' : 'hop',
          ifLanded(result, (r) => mphText(r.takeoffMph)),
          ifLanded(result, (r) => seconds(r.flightSeconds)),
          ifLanded(result, (r) => metres(r.touchdownS - approach.lipS)),
          ifLanded(result, (r) => metres(r.apexMetres)),
          result.landingTier, ifLanded(result, (r) => r.landingScore.toFixed(4)),
          verdict(result),
        ]);
      }
    }
  }

  return {
    id: 'T11b',
    title: 'T11b — the kicker approach: what speed the corridor can deliver to the lip',
    geometry: [
      '48 m of run-up inside the park: `kicker-approach` (24 m at −4%) and `kicker-rise`'
        + ' (18 m, eased +2.5 m) and the 6 m take-off pitch, at full throttle from the'
        + ' stated hairpin exit speed.',
      'R16 at `EUC.maxLateralG` × the M30 hang is about 28.7 mph, so the top entry row is'
        + ' the fastest a rider can leave `rhythm-turn` at all.',
    ],
    notes: [
      '**This is the row the landing hill\'s length is derived from.** The longest flight'
        + ' the lip can throw is the fully charged hop in the last row of each preset, and'
        + ' the 30% face of `kicker-landing` runs from 16 m to 32 m past the lip so that'
        + ' flight is still on it at touchdown, with the 12.5% flare and the run-out'
        + ' beyond for anything faster than the approach can deliver.',
    ],
    columns: ['wheel', 'hairpin exit mph', 'input', 'lip mph', 'air s', 'landed at m', 'apex m',
      'tier', 'score', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** Which piece of the clearing a kicker touchdown came down on, by distance past the lip. */
function kickerLandedWhere(pastLip: number): string {
  if (pastLip < 0) return 'before lip';
  if (pastLip <= 12) return 'table';
  if (pastLip <= 16) return 'brow';
  if (pastLip <= 32) return 'landing face';
  if (pastLip <= 36) return 'flare';
  return 'run-out';
}

/** The four scripts the big jump owes a number for, and where each is measured against. */
const BIG_JUMP_SCRIPTS: readonly {
  readonly label: string;
  readonly mph: number;
  readonly charge: BenchCharge;
  readonly hop: boolean;
}[] = [
  { label: 'the sign\'s 50 mph, full crouch requested', mph: 50, charge: 'full', hop: true },
  { label: 'the sign\'s 50 mph, no hop', mph: 50, charge: 'none', hop: false },
  { label: '10 mph under, full crouch requested', mph: 40, charge: 'full', hop: true },
  { label: '10 mph over, full crouch requested', mph: 60, charge: 'full', hop: true },
];

/**
 * T11c — the big jump, in the four rows the owner's ask is measured by.
 *
 * The owner's first rides (2026-09-12): "a lot of the jumps are tame ... add
 * at least a big one". T11 sweeps the kicker as it sweeps every feature; this
 * is the same geometry read as an answer to that sentence, on both presets —
 * the signed speed charged and unhopped, ten under, ten over — beside the
 * fastest lip speed the approach can actually deliver (T11b's top entry), which
 * is the row a player on the shipped wheel will really ride.
 *
 * "Big" is flight metres and airtime. The old table capped a fully charged
 * hop at 15.47 m and 0.758 s from the fastest reachable lip speed; the rows
 * here are what the landing hill buys, and the tier column is what it costs.
 */
export function tableBigJump(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];
  const kicker = installedFeature('kicker');
  const approach: InstalledFeature = {
    ...kicker,
    segments: ['kicker-approach', 'kicker-rise', ...kicker.segments],
    spawnS: kicker.lipS - 48,
  };

  for (const wheel of WHEELS) {
    for (const script of BIG_JUMP_SCRIPTS) {
      // The lip-only fixture has insufficient run-up to fill the charge at
      // high speed. Use the real approach and report the latched fraction.
      const result = ride(tally, approach, wheel, script.mph, {
        charge: script.charge,
        lead: script.hop ? undefined : null,
      });
      rows.push([
        wheelShort(wheel), script.label,
        result.takeoffCharge.toFixed(3),
        ifLanded(result, (r) => mphText(r.takeoffMph)),
        ifLanded(result, (r) => seconds(r.flightSeconds)),
        ifLanded(result, (r) => metres(r.flightMetres)),
        ifLanded(result, (r) => metres(r.touchdownS - kicker.lipS)),
        ifLanded(result, (r) => kickerLandedWhere(r.touchdownS - kicker.lipS)),
        ifLanded(result, (r) => metres(r.apexMetres)),
        result.landingTier,
        ifLanded(result, (r) => r.landingScore.toFixed(4)),
        ifLanded(result, (r) => mphText(r.speedLossMph)),
        result.reachedEnd ? 'rode on to the merge' : `stopped at s = ${metres(result.finalS)}`,
        verdict(result),
      ]);
    }
    // The reachable row: full throttle from the hairpin's own ceiling.
    const result = tally.run(installedFixture(approach), wheel, {
      targetMph: 200,
      startMph: APPROACH_ENTRIES[APPROACH_ENTRIES.length - 1],
      lipS: approach.lipS,
      hop: { stepsFromLip: ON_TIME_STEPS },
      charge: 'full',
      coastSteps: 1_000_000,
      maxSteps: 6000,
      rideThroughCrash: true,
    });
    rows.push([
      wheelShort(wheel), 'what the approach delivers from the hairpin, fully charged',
      result.takeoffCharge.toFixed(3),
      ifLanded(result, (r) => mphText(r.takeoffMph)),
      ifLanded(result, (r) => seconds(r.flightSeconds)),
      ifLanded(result, (r) => metres(r.flightMetres)),
      ifLanded(result, (r) => metres(r.touchdownS - kicker.lipS)),
      ifLanded(result, (r) => kickerLandedWhere(r.touchdownS - kicker.lipS)),
      ifLanded(result, (r) => metres(r.apexMetres)),
      result.landingTier,
      ifLanded(result, (r) => r.landingScore.toFixed(4)),
      ifLanded(result, (r) => mphText(r.speedLossMph)),
      result.reachedEnd ? 'rode on to the merge' : `stopped at s = ${metres(result.finalS)}`,
      verdict(result),
    ]);
  }

  return {
    id: 'T11c',
    title: 'T11c — the big jump: the owner\'s four rows, and the reachable one',
    geometry: kicker.geometry.map((line) => line),
    notes: [
      'These rows start 48 m before the lip so the shipped wheel can fill its charge.'
        + ' Read actual charge and lip speed alongside the requested input. An overspeed'
        + ' diagnostic wheel may fail on the approach; a touchdown before the lip is not'
        + ' a measurement of the kicker landing.',
      '**The fact the shape is built on.** `EucController.land` scores impact as the closing'
        + ' speed along the *surface normal* — `-(vx·nx + vy·ny + vz·nz)` — so on a face'
        + ' that is already running away from the rider the horizontal speed comes OFF the'
        + ' hit. A flight coming down at 8 m/s is a wobble on the flat, heavy on 12.5% and'
        + ' clean on 30% at 45 mph; what no face can absorb is a flight that has fallen'
        + ' further than the ground beneath it, which is why the twelve-metre table stays'
        + ' in front of the hill and holds the trajectory up until the charged fast flight'
        + ' is past the brow.',
      '`apex` is the wheel\'s greatest height above the ground beneath it. The launch is a'
        + ' level block, so a hop leaves at its own speed and nothing else — the bigness is'
        + ' all in how far below the lip the landing is (0.65 m at the face\'s head, 5.45 m'
        + ' at its foot), not in a higher arc. A hop taken ON a gradient would carry the'
        + ' slope\'s vertical rate too (`launchHop`), but the heightfield rounds a crest'
        + ' over one 1.5 m cell and the bonus lands wherever in that cell the last grounded'
        + ' step falls; it was measured and rejected for the same reason §36.2 item 3'
        + ' refuses a fold.',
      '`landed on` names the piece of the clearing by distance past the lip: the table'
        + ' (0–12 m), the brow (12–16), the 30% landing face (16–32), the flare (32–36),'
        + ' the run-out.',
      'Sixty is ten over the sign and past what T11b says the approach can deliver; its'
        + ' rows are the over-speed end of the window rather than a line a rider reaches.'
        + ' On the `?mph=50` wheel a no-hop trial placed at 60 is already past that'
        + ' wheel\'s own 49.4 mph cutout.',
    ],
    columns: ['wheel', 'script', 'actual charge', 'lip mph', 'air s', 'air m', 'landed at m', 'landed on',
      'apex m', 'tier', 'score', 'speed lost mph', 'exit', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** The press offsets T12 sweeps, in steps relative to the on-time lead. */
const TIMINGS: readonly { readonly label: string; readonly offset: number }[] = [
  { label: 'early (−0.20 s)', offset: 24 },
  { label: 'early (−0.10 s)', offset: 12 },
  { label: 'on time', offset: 0 },
  { label: 'late (+0.10 s)', offset: -12 },
  { label: 'late (+0.20 s)', offset: -24 },
];

/**
 * T12 — the early/on-time/late press interval, per feature and per preset.
 *
 * §36.4 asks every feature record to carry one. The press is delivered exactly
 * as `app/Game.ts` delivers one, so a press that arrives on an illegal step
 * waits in the `INPUT.actionBufferSeconds` buffer and either fires late or
 * lapses — and the `hop press` column says which happened, which is the
 * difference between "pressed early" and "pressed too early".
 */
export function tableInstalledTiming(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const feature of INSTALLED_FEATURES) {
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const charge: BenchCharge = feature.press === 'apex' ? 'full' : 'none';
    for (const wheel of WHEELS) {
      for (const timing of TIMINGS) {
        const result = ride(tally, feature, wheel, mph, {
          charge,
          lead: onTimeLead(feature, charge) + timing.offset,
        });
        rows.push([
          feature.id, wheelShort(wheel), `${mph}`, charge, timing.label,
          `${onTimeLead(feature, charge) + timing.offset}`,
          result.hopFired,
          ifLanded(result, (r) => r.launched),
          ifLanded(result, (r) => metres(r.touchdownS - feature.lipS)),
          result.landingTier,
          ifLanded(result, (r) => r.landingScore.toFixed(4)),
          result.landedOn,
          verdict(result),
        ]);
      }
    }
  }

  return {
    id: 'T12',
    title: 'T12 — the installed press window: early, on time, late',
    geometry: [],
    notes: [
      'One speed per feature — the middle of its own sweep — and the charge the feature is'
        + ' about: full for the two a rider has to mount, none for the seven they leave.',
      '`hop press` is `on-request` when the step was legal, `buffered` when the press waited'
        + ' in the action buffer and fired later, and `expired` when it lapsed unfired.',
    ],
    columns: ['feature', 'wheel', 'lip mph', 'charge', 'timing', 'lead steps', 'hop press',
      'launch', 'landed at m', 'tier', 'score', 'landed on', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/**
 * T13 — the misses: both lateral, the reverse approach, and the recovery.
 *
 * §36.4: "At least one credible outside-window miss must demonstrate a readable
 * consequence and a recoverable exit. Verify under-speed, over-speed, no-hop,
 * partial charge, both lateral misses, reverse approach". Under-speed,
 * over-speed, no-hop and partial charge are the four `input` rows and the two
 * end speeds of T11; the lateral pair and the reverse approach are here, and so
 * is the answer to "and then what happened", which T11 only has room to name.
 */
export function tableInstalledMisses(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const feature of INSTALLED_FEATURES) {
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const charge: BenchCharge = feature.press === 'apex' ? 'full' : 'none';
    for (const wheel of WHEELS) {
      for (const offset of [1.2, -1.2]) {
        const result = ride(tally, feature, wheel, mph, {
          charge, lateralOffset: offset, compare: true,
        });
        rows.push([
          feature.id, wheelShort(wheel), `${mph}`,
          `${offset > 0 ? '+' : ''}${offset.toFixed(1)} m ${offset > 0 ? 'left' : 'right'}`,
          ifLanded(result, (r) => metres(r.touchdownS - feature.lipS)),
          ifLanded(result, (r) => metres(r.touchdownT)),
          result.landingTier,
          ifLanded(result, (r) => r.landingScore.toFixed(4)),
          result.landedOn,
          `${result.blockedSteps}`,
          result.reachedEnd ? 'reached the merge' : `stopped at s = ${metres(result.finalS)}`,
          verdict(result),
        ]);
      }
      if (feature.id === 'kicker') {
        // **The kicker's own credible misses.** Two of them, because the big
        // jump has two ways to be wrong. The first is geometric: a hop from the
        // FAR end of the twelve-metre table rather than from the lip, which is
        // what a rider who rolls the lip and then hops late does — the flight
        // starts at the brow with no face under it, and comes down on the 30%
        // hill from a shallower, later arc. The second is speed: ten miles an
        // hour over the sign, charged and not. T11b says the approach cannot
        // deliver 60 mph to the lip, so these rows are the over-speed end §36.4
        // asks every window to publish, measured past the reachable band rather
        // than inside it.
        const farEnd = feature.lipS + 12;
        // Spawned two metres past the lip, ON the table: a trial placed at the
        // lip's own edge rolls off the 0.15 m face first and reports that drop
        // as its flight instead of the late hop.
        const late = { ...feature, lipS: farEnd, spawnS: farEnd - 10 };
        for (const charge2 of ['none', 'full'] as const) {
          const result = ride(tally, late, wheel, 40, { charge: charge2, compare: true });
          rows.push([
            feature.id, wheelShort(wheel), '40',
            `hop off the TABLE's far end, ${charge2 === 'full' ? 'full charge' : 'no charge'}`,
            ifLanded(result, (r) => metres(r.touchdownS - farEnd)),
            ifLanded(result, (r) => metres(r.touchdownT)),
            result.landingTier,
            ifLanded(result, (r) => r.landingScore.toFixed(4)),
            result.landedOn,
            `${result.blockedSteps}`,
            result.reachedEnd ? 'reached the merge' : `stopped at s = ${metres(result.finalS)}`,
            verdict(result),
          ]);
        }
        for (const charge2 of ['none', 'full'] as const) {
          const result = ride(tally, feature, wheel, 60, { charge: charge2, compare: true });
          rows.push([
            feature.id, wheelShort(wheel), '60',
            `10 mph over the sign, ${charge2 === 'full' ? 'full charge' : 'no charge'}`,
            ifLanded(result, (r) => metres(r.touchdownS - feature.lipS)),
            ifLanded(result, (r) => metres(r.touchdownT)),
            result.landingTier,
            ifLanded(result, (r) => r.landingScore.toFixed(4)),
            result.landedOn,
            `${result.blockedSteps}`,
            result.reachedEnd ? 'reached the merge' : `stopped at s = ${metres(result.finalS)}`,
            verdict(result),
          ]);
        }
      }
      if (feature.spin === true) {
        for (const [direction, spinMph] of [
          ['left', mph], ['right', mph],
          // And the over-speed end, which is the spin line's own failing bound:
          // a 180 landed at 25 mph exits fakie at a speed past
          // `EUC.maxReverseSpeed`, and the wheel spends the pad shedding it.
          ['left', 25],
        ] as const) {
          // **The spin rows stop when the landing has settled, not at the
          // merge.** Every other installed row rides until its progress
          // reaches the feature's `endS`, and the 1,000,000-step coast above
          // exists so that it can. A 180 cannot get there: the rider lands
          // fakie, the throttle law then holds the target speed in the
          // direction the wheel now FACES, and the trial turns round and rides
          // back up the lap — so `s >= endS` never fires and the row ran the
          // full 6,000-step ceiling, fifty simulated seconds, off the park and
          // into the woods. It met one broadleaf at (114.7, 84.1) and printed
          // thousands of `blocked steps` beside a clean 180 — and this table's
          // own note calls `blocked` "the bonk signature", so the row read as
          // if the trick bonked (p4-dressing open issue 1, M36 Phase 6).
          // `COAST_STEPS` is the bench's own settling window and covers the
          // `SPEED_AFTER_STEPS` read that the fakie exit column is; the
          // landing, its tier, its score, the exit speed and the heading are
          // all fixed long before it expires.
          const result = ride(tally, feature, wheel, spinMph, {
            charge, spinTap: direction, compare: true, coastSteps: COAST_STEPS,
          });
          rows.push([
            feature.id, wheelShort(wheel), `${spinMph}`, `180 tapped ${direction}`,
            ifLanded(result, (r) => metres(r.touchdownS - feature.lipS)),
            ifLanded(result, (r) => metres(r.touchdownT)),
            result.landingTier,
            ifLanded(result, (r) => r.landingScore.toFixed(4)),
            result.reversing ? `fakie at ${mphText(Math.abs(result.speedAfterMph))} mph` : 'forward',
            `${result.blockedSteps}`,
            `heading ${(result.headingChange * (180 / Math.PI)).toFixed(1)}°`,
            verdict(result),
          ]);
        }
      }
    }
  }

  return {
    id: 'T13',
    title: 'T13 — installed misses: both lateral, the 180 and its fakie exit',
    geometry: [],
    notes: [
      '`+1.2 m left` walks the line into the feature\'s outer half and `−1.2 m right` walks it'
        + ' off the inner edge toward the bypass; every feature\'s block is 0.9 m or more clear'
        + ' of the centreline, so the right-hand miss is the one that rolls past.',
      '`blocked` counts the steps the controller refused part of a move into something solid,'
        + ' which is the bonk signature.',
      `A crash is recoverable without a reset: the controller respawns in place after`
        + ` ${EUC.crashRecoverAutoSeconds} s at ${EUC.crashRecoverSpeedFactor} of its speed, and`
        + ' the trial keeps riding — `reached the merge` in the second-to-last column is that'
        + ' claim measured rather than asserted.',
    ],
    columns: ['feature', 'wheel', 'lip mph', 'line', 'landed at m', 'landed t m', 'tier', 'score',
      'landed on', 'blocked steps', 'exit', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/** The two stepped descents, and where a rider coming back up meets them. */
const REVERSE_CASES: readonly {
  readonly id: string;
  readonly fromS: number;
  readonly metres: number;
  readonly face: string;
}[] = [
  {
    id: 'rhythm',
    fromS: lapDistance('rock-rhythm', 38),
    metres: 14,
    face: 'the bottom terrace, 0.50 m',
  },
  {
    id: 'stairs',
    fromS: lapDistance('timber-steps', 9),
    metres: 9,
    face: 'the bottom tread, 0.30 m',
  },
];

/**
 * T13b — the stepped descents from below, on the blocks and on the ramp beside.
 *
 * §36.4: "A stepped descent is a wall from below: reuse the
 * `RouteBlocker.facing` meaning, verify directional geometry, and give free
 * riders a ramp back up." Nothing here is a one-way collider — the risers are
 * the same solid blocks from both sides, and what refuses a rider coming up is
 * their height against `TERRAIN.stepUpPedalFactor × WHEEL.pedalHeight`
 * (0.216 m). The ramp back up is the other lateral half of the same corridor,
 * which is the bypass, and it is a plain gradient in both directions.
 */
export function tableInstalledReverse(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const reverse of REVERSE_CASES) {
    const feature = installedFeature(reverse.id);
    for (const wheel of WHEELS) {
      for (const mph of [5, 8, 12]) {
        for (const line of ['feature', 'bypass'] as const) {
          const t = line === 'feature' ? feature.technicalT : feature.bypassT;
          const result = tally.run(
            reverseFixture(feature, { fromS: reverse.fromS, metres: reverse.metres, t }),
            wheel,
            {
              targetMph: mph,
              startMph: mph,
              lipS: null,
              hop: 'none',
              charge: 'none',
              holdThrottle: true,
              coastSteps: 1_000_000,
              maxSteps: 4000,
              rideThroughCrash: true,
            },
          );
          rows.push([
            reverse.id, wheelShort(wheel), `${mph}`, line, reverse.face,
            `${result.blockedSteps}`,
            result.reachedEnd ? 'CLIMBED IT' : 'refused at the face',
            metres(Math.abs(result.finalS - reverse.fromS)),
            mphText(result.finalMph),
            verdict(result),
          ]);
        }
      }
    }
  }

  return {
    id: 'T13b',
    title: 'T13b — the stepped descents ridden from below, and the ramp beside them',
    geometry: REVERSE_CASES.map((reverse) =>
      `**${reverse.id}** — entered at lap s = ${reverse.fromS.toFixed(1)} m facing back up the`
      + ` hill, ${reverse.metres} m of corridor to climb, first face ${reverse.face}`),
    notes: [
      '`CLIMBED IT` means the rider reached the top of the stated stretch. On the feature line'
        + ' that would mean a stepped descent had failed to be a wall; on the bypass line it is'
        + ' the ramp back up §36.4 asks for, and it is the same ground in both directions.',
      'No `RouteBlocker` and no one-way collider is involved. The risers are the same solid'
        + ' boxes from both sides and their height is the whole of the mechanism.',
    ],
    columns: ['feature', 'wheel', 'mph', 'line', 'first face up', 'blocked steps', 'result',
      'metres climbed', 'exit mph', 'verdict'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/**
 * T14 — the bypass, over the same endpoints and with the same starting state.
 *
 * §36.8 Phase 2: "Ride the shortcut/bypass pairs with equal starting state and
 * the same merge endpoint, including the following braking/settling zone." Both
 * runs start at the same lap distance and the same speed and stop at the same
 * merge; the only difference is which lateral half they are on, which is what
 * principle 1 says a bypass IS.
 */
export function tableInstalledBypass(): BenchTable {
  const tally = new Tally();
  const rows: string[][] = [];

  for (const feature of INSTALLED_FEATURES) {
    const mph = feature.speeds[Math.floor(feature.speeds.length / 2)];
    const charge: BenchCharge = feature.press === 'apex' ? 'full' : 'none';
    for (const wheel of WHEELS) {
      const technical = ride(tally, feature, wheel, mph, { charge, compare: true });
      const bypass = ride(tally, feature, wheel, mph, { bypass: true, lead: null, compare: true });
      const span = (feature.compareEndS ?? feature.endS) - feature.spawnS;
      const lost = technical.landings.reduce(
        (total, landing) => total + (landing.takeoffMph - Math.abs(landing.speedAfterMph)),
        0,
      );
      rows.push([
        feature.id, wheelShort(wheel), `${mph}`, metres(span),
        seconds(technical.steps * STEP_SECONDS),
        seconds(bypass.steps * STEP_SECONDS),
        seconds((technical.steps - bypass.steps) * STEP_SECONDS),
        `${technical.landings.length}`, `${bypass.landings.length}`,
        technical.landingTier, bypass.landings.length === 0 ? 'never left the ground' : bypass.landingTier,
        mphText(lost),
        mphText(technical.finalMph), mphText(bypass.finalMph),
        bypass.crashed ? `bypass crashed: ${bypass.crashCause}` : 'bypass clean',
      ]);
    }
  }

  return {
    id: 'T14',
    title: 'T14 — the bypass against the feature, same start, same merge',
    geometry: [],
    notes: [
      'Both runs are placed at the same lap distance, at the same speed, and ride to the same'
        + ' merge with the throttle holding that speed; the technical run takes the feature'
        + ' line and presses the hop, the bypass run takes the other lateral half and never'
        + ' presses anything.',
      '**The throttle law refunds a landing almost as fast as it is paid**, which is what the'
        + ' near-zero differences mean and is a fact about a 65 mph motor rather than about'
        + ' the layout: the feature costs the speed in the `speed lost` column and the wheel'
        + ' buys it straight back. A negative difference is the feature being quicker.',
      'The honest reading of this table is that neither line is a shortcut. Nothing here'
        + ' rewards skipping a feature and nothing punishes taking one, which is what a venue'
        + ' whose lap times are not yet scored can claim; §36.6\'s events are Phase 3\'s.',
      'The bypass\'s touchdown count is the claim §36.3 turns on — the right half of every'
        + ' corridor carries nothing, so a bypass that left the ground would mean a fold had'
        + ' launched it.',
    ],
    columns: ['feature', 'wheel', 'mph', 'span m', 'feature s', 'bypass s', 'difference s',
      'feature touchdowns', 'bypass touchdowns', 'feature tier', 'bypass tier',
      'feature speed lost mph', 'feature exit mph', 'bypass exit mph', 'note'],
    rows,
    trials: tally.trials,
    simulatedSteps: tally.steps,
  };
}

/**
 * T15 — the tabletop's own sweep: what face height a table landing stays clean at.
 *
 * The measurement the kicker's 0.15 m face was chosen from, kept because it is
 * the evidence for a number in `switchbackLevel.ts` and because it is the only
 * row in this report that says what the *failing* side looks like.
 */
export function tableTabletopFaces(): BenchTable {
  const rows: string[][] = [];
  const launch = EUC.hopLaunchSpeed * Math.sqrt(1 + EUC.hopChargeHeightBonus);
  const surface = 0.3 * (0.026 / 0.04);

  for (const face of [0.10, 0.12, 0.15, 0.18, 0.20, 0.25]) {
    // Closing speed on a level table is the launch speed the impulse bought,
    // with the face's own fall added under it — the flight starts on top of the
    // lip and ends `face` metres lower, and nothing else about it matters.
    const impact = Math.sqrt(launch * launch + 2 * 9.81 * face);
    const score = impact / EUC.landingImpactReference + surface;
    rows.push([
      metres(face), mphText(impact), score.toFixed(4),
      score >= EUC.landingHeavyScore ? 'heavy' : 'clean',
      (EUC.landingHeavyScore - score).toFixed(4),
    ]);
  }

  return {
    id: 'T15',
    title: 'T15 — the tabletop face: where a fully charged landing stops being clean',
    geometry: [
      `fully charged hop launch speed ${EUC.hopLaunchSpeed} × √(1 +`
      + ` ${EUC.hopChargeHeightBonus}) = ${launch.toFixed(4)} m/s`,
      `dirt's own contribution to every landing score: ${surface.toFixed(4)}`,
    ],
    notes: [
      '**Closed form, and the installed sweep agrees with it.** A flight that begins and ends'
        + ' at one height lands at the speed it launched with; a lip face `h` above a level'
        + ' table adds `2gh` under the square root and nothing else. The measured installed'
        + ' rows in T11 are 0.9729 at 0.15 m against the 0.9737 this predicts.',
      'The park\'s kicker is authored at 0.15 m, which is the last row with more than two'
        + ' hundredths of margin.',
    ],
    columns: ['lip face m', 'closing speed m/s', 'score', 'tier', 'margin to heavy'],
    rows,
    trials: 0,
    simulatedSteps: 0,
  };
}

/** Every installed table, in report order. Built once; each call re-measures. */
export function installedTables(): readonly BenchTable[] {
  return [
    tableParkWindows(),
    tableInstalledApproach(),
    tableBigJump(),
    tableInstalledTiming(),
    tableInstalledMisses(),
    tableInstalledReverse(),
    tableInstalledBypass(),
    tableTabletopFaces(),
  ];
}

/** The step the wheel can mount, quoted where an installed note needs it. */
export const INSTALLED_STEP_UP_LIMIT = stepUpLimit();
