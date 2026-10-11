/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { BARKS, POPULATION_AUTHORING, POPULATION_OCCUPANT } from '../data/tuning.ts';
import type { PopulationPresentationPose } from '../simulation/population.ts';

/**
 * Who asks a rider what, and when — the pedestrian question barks (M42,
 * `docs/PLANS.md` §42.2h and §42.3e).
 *
 * **Pure.** No DOM, no three, no `Math.random`, and only a type import from
 * `simulation/`: it reads the population's presentation endpoints the way the
 * renderer does and never touches `PopulationSimulation` — no heading change
 * for a person, no pause, no record. Fed once per drawn frame by
 * `app/Game.ts` with the frame's own `hudSeconds`, so pause freezes it and
 * `advance()` drives it deterministically.
 *
 * The pipeline is three pieces: this model decides the candidate and the
 * bubble; `app/barkView.ts` projects them with the pane's camera after the
 * pass is drawn and says whether the candidate is **seen** (start band, its
 * predicted path, depth, a clear ray) and whether a shown bubble is still in
 * the display band; `ui/hud.ts` draws the bubble. A candidate is rolled only
 * once the view says it is seen, so a bark nobody could see costs nothing.
 */

/**
 * The owner's five lines, then two more from the same thread and two of
 * his own.
 *
 * Asked for by a Facebook commenter on the owner's 2026-10-05 post and
 * promised publicly the same day (FEEDBACK-TRIAGE §7, 2026-10-08). Lines six
 * and seven are what other riders in that thread said pedestrians ask them;
 * the eighth and ninth are ones the owner remembers hearing himself. All four
 * were added by the owner on 2026-10-10. Credited only as "a Facebook
 * commenter", never by name.
 */
export const BARK_LINES: readonly string[] = Object.freeze([
  'How fast does it go?',
  'How much was it?',
  'Can I try?',
  'Did you make it?',
  'What is that called?',
  'Is it difficult to ride?',
  "I'd hurt myself on that thing.",
  'Are you from the future?',
  'How long did it take to learn?',
]);

/** What the model reads from one population row. Index i is the same actor in both endpoint arrays. */
export type BarkActor = Pick<PopulationPresentationPose,
  'id' | 'kind' | 'x' | 'y' | 'z' | 'headingY' | 'speedMetresPerSecond' | 'activity'>;

/** One drawn frame for one seat. Game reuses one mutable record per seat. */
export interface BarkFrame {
  /** Simulation seconds drawn since the last frame: `Game.render`'s local `hudSeconds`. */
  dt: number;
  /** The seat's controller; a different object resets the model. */
  controller: object | null;
  /** The installed world (the population owner); a different object resets the model. */
  world: object | null;
  /** The seat's drawn pose. Heading zero along +Z, positive toward +X; speed signed along it. */
  x: number;
  z: number;
  headingY: number;
  speed: number;
  /** `controller.crashed`. */
  crashed: boolean;
  /** `!controller.isGrounded`. */
  airborne: boolean;
  /** `controller.discontinuitySerial`; a change zeroes the ridden distance. */
  discontinuitySerial: number;
  /** The mode table and the seat (pause, spectating, a caught outlaw, the runtime switch). False suspends: the bubble ends, every clock is kept. */
  modeAllows: boolean;
  /** The siren is near (`app/barkQuiet.ts`). Suppresses and ends, without a reset. */
  quiet: boolean;
  previous: readonly BarkActor[];
  current: readonly BarkActor[];
  alpha: number;
}

/** A shared room fact: the last line any seat showed, so two panes never echo. */
export class BarkRoom {
  lastLine = -1;
  /** Test hook only (the QA bridge's `setBarksEnabled(on, true)`): every roll passes. */
  forceChance = false;
  /** Test hook only: every roll fails, so the decline memory stays testable while the chances are 1. */
  forceDecline = false;
  /** Whose bubble set `lastLine`, so a refund only undoes its own write. */
  lastToken = 0;
  lastBefore = -1;
  private tokens = 0;

  nextToken(): number {
    this.tokens += 1;
    return this.tokens;
  }

  reset(): void {
    this.lastLine = -1;
    this.lastToken = 0;
    this.lastBefore = -1;
  }
}

export interface BarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface BarkPending {
  /** Index into this frame's endpoint arrays. */
  actorIndex: number;
  actorId: string;
  /** The person's head + `anchorLiftMetres`, interpolated. */
  anchor: BarkPoint;
  /** v_person − v_rider, m/s, for the view's prediction. */
  relativeVelocity: BarkPoint;
}

export interface BarkOutput {
  /** A bubble exists (shown or fading). */
  visible: boolean;
  actorId: string | null;
  lineIndex: number;
  text: string;
  anchor: BarkPoint;
  /** Seconds since the bubble started. */
  age: number;
  opacity: number;
  /** The anchor left the display band: the bubble fades where it last stood and ends. */
  leaving: boolean;
  /** The candidate the view should test this frame, or null. */
  pending: BarkPending | null;
}

const PEOPLE: ReadonlySet<string> = new Set(['walker', 'jogger', 'social', 'worker']);

/**
 * How near a seat must be to a person at the moment they turn `impacted` to
 * count as the one who touched them: the two prisms' corner-to-corner centre
 * distance (the rider's occupant half-diagonal plus a pedestrian's), plus a
 * margin. ≈ 1.8 m with the shipped values.
 */
const HIT_RADIUS_METRES = Math.hypot(POPULATION_OCCUPANT.halfWidthMetres, POPULATION_OCCUPANT.halfLengthMetres)
  + Math.SQRT2 * POPULATION_AUTHORING.pedestrianRadiusMetres
  + BARKS.hitMarginMetres;

const ANCHOR_HEIGHT_METRES = POPULATION_AUTHORING.actorHeightMetres + BARKS.anchorLiftMetres;

interface PersonMemory {
  /** No bark from this person before this clock: `personMemorySeconds` after their bubble. */
  memoryUntil: number;
  /** A failed roll: 30 s. */
  declineUntil: number;
  /** This seat struck them: 10 s. */
  touchedUntil: number;
  /** Seen in the start band but behind a wall: not offered to the view again before this clock. */
  occludedUntil: number;
  /** Seconds continuously ineligible; Infinity for somebody never seen. */
  ineligibleFor: number;
  /** Has been outside the pass box and stop radius by the exit margin since the encounter closed. */
  wasOutside: boolean;
  encounterOpen: boolean;
  rolled: boolean;
  encounterIndex: number;
  stop: boolean;
  wasImpacted: boolean;
  /** The clock this memory was last touched, so absent people can be forgotten. */
  seenAt: number;
}

/**
 * FNV-1a, 32 bits, then murmur3's `fmix32` — the deterministic choice and
 * roll. Never `Math.random`. The finaliser matters: bare FNV-1a barely moves
 * its high bits, or the fraction of its low ones, when only the last
 * characters change (the counters at the end of the key), so one person met
 * again rolled nearly the same number every time.
 */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Interpolate actor `index` into `out`; false when the arrays disagree on who is at `index`. */
function actorAt(frame: BarkFrame, index: number, out: BarkPoint): BarkActor | null {
  const current = frame.current[index];
  if (current === undefined) return null;
  const previous = frame.previous[index];
  const alpha = Number.isFinite(frame.alpha) ? Math.min(1, Math.max(0, frame.alpha)) : 1;
  if (previous !== undefined && previous.id === current.id) {
    out.x = previous.x + (current.x - previous.x) * alpha;
    out.y = previous.y + (current.y - previous.y) * alpha;
    out.z = previous.z + (current.z - previous.z) * alpha;
  } else {
    out.x = current.x;
    out.y = current.y;
    out.z = current.z;
  }
  return current;
}

/** A person at (x, z) heading `headingY` faces (targetX, targetZ): the eligibility's `facingDot` test. */
function faces(x: number, z: number, headingY: number, targetX: number, targetZ: number): boolean {
  const dx = targetX - x;
  const dz = targetZ - z;
  const distance = Math.hypot(dx, dz);
  return distance > 1e-6 && (dx * Math.sin(headingY) + dz * Math.cos(headingY)) / distance > BARKS.facingDot;
}

/**
 * One seat's barks. One per seat, plus one shared `BarkRoom`.
 *
 * Call `update(frame)` once per drawn frame, then — after the pane is drawn and the
 * view has projected `output.pending` and the visible bubble —
 * `reportView(pendingQualified, bubbleInBand, room)`.
 */
export class BarkModel {
  readonly seat: number;
  readonly output: BarkOutput = {
    visible: false,
    actorId: null,
    lineIndex: -1,
    text: '',
    anchor: { x: 0, y: 0, z: 0 },
    age: 0,
    opacity: 0,
    leaving: false,
    pending: null,
  };

  private readonly pendingSlot: BarkPending = {
    actorIndex: -1,
    actorId: '',
    anchor: { x: 0, y: 0, z: 0 },
    relativeVelocity: { x: 0, y: 0, z: 0 },
  };
  private readonly scratch: BarkPoint = { x: 0, y: 0, z: 0 };
  private readonly people = new Map<string, PersonMemory>();

  private controllerRef: object | null = null;
  private worldRef: object | null = null;
  private serial = Number.NaN;
  private idle = true;

  /** The seat's own clock, the sum of every `dt` it was handed. */
  private clock = 0;
  private ridden = 0;
  private stillSeconds = 0;
  private stopArmed = true;
  private stopX = 0;
  private stopZ = 0;
  private wasCrashed = false;
  private recoveryUntil = -Infinity;
  private cooldownUntil = -Infinity;
  private encounters = 0;
  /**
   * Rolls this seat has made, ever: part of every roll's key, so a person met
   * again after their memory lapsed rolls afresh. Like `encounters`, it
   * survives `reset()` and every person's memory.
   */
  private rolls = 0;
  /** This seat's last `BARKS.seatRecentLines` lines, newest first; kept across `reset()`. */
  private readonly recentLines: number[] = [];
  /** `recentLines` before the live bubble's line was added, for a refund. */
  private readonly recentBefore: number[] = [];
  private cursor = -1;
  private riderX = 0;
  private riderZ = 0;

  // -- The bubble ------------------------------------------------------------
  private bubbleActive = false;
  private bubbleActorIndex = -1;
  private bubbleShown = 0;
  private bubbleLeaveAge = 0;
  private bubbleToken = 0;
  /** Where the rider was when the live bubble was asked: an asker facing it has not turned away. */
  private askedX = 0;
  private askedZ = 0;
  private cooldownBefore = -Infinity;
  private stopArmedBefore = true;
  /** The room the live bubble wrote its line into, for a refund. */
  private pendingRoom: BarkRoom | null = null;

  constructor(seat: number) {
    this.seat = seat;
  }

  /** Metres this seat has ridden since its last placement (QA and tests). */
  get riddenMetres(): number {
    return this.ridden;
  }

  /** Encounters opened so far (tests: the encounter edge). */
  get encounterCount(): number {
    return this.encounters;
  }

  /**
   * A new controller or world: forget everything but the recent lines, which
   * keep "never twice in a row" across the change, and the encounter and roll
   * counters, which keep the rolls fresh.
   */
  reset(): void {
    if (this.bubbleActive) this.endBubble();
    this.people.clear();
    this.ridden = 0;
    this.stillSeconds = 0;
    this.stopArmed = true;
    this.wasCrashed = false;
    this.recoveryUntil = -Infinity;
    this.cooldownUntil = -Infinity;
    this.cursor = -1;
    this.output.pending = null;
    this.idle = true;
  }

  /**
   * The mode refuses barks for now (pause, a menu over the ride, spectating,
   * a caught outlaw, the runtime switch): the bubble ends (under 0.8 s shown
   * it refunds, as ever) and nothing is offered. Everything else is kept as
   * it stands — the seat cooldown, each person's memory, decline and touch,
   * every encounter (a rolled one stays rolled) and the ridden distance — so
   * a pause can neither clear a cooldown, nor let the same person ask again,
   * nor buy a second roll. The clock keeps the frame's own time: a paused
   * frame draws no simulation seconds, so a pause stands still, while time a
   * spectator watches the world go by still runs the cooldowns down. A
   * placement meanwhile still zeroes the ridden distance on the first frame
   * back (the serial is compared then, not here).
   */
  private suspend(): void {
    if (this.bubbleActive) this.endBubble();
    this.output.pending = null;
    this.idle = true;
  }

  update(frame: BarkFrame): BarkOutput {
    if (frame.controller !== this.controllerRef || frame.world !== this.worldRef) {
      this.reset();
      this.controllerRef = frame.controller;
      this.worldRef = frame.world;
      this.serial = frame.discontinuitySerial;
    }
    const dt = Number.isFinite(frame.dt) && frame.dt > 0 ? frame.dt : 0;
    this.clock += dt;
    if (!frame.modeAllows) {
      if (!this.idle) this.suspend();
      return this.output;
    }
    this.idle = false;

    const now = this.clock;
    this.riderX = frame.x;
    this.riderZ = frame.z;

    if (frame.discontinuitySerial !== this.serial) {
      // A reset, a placement or a respawn: the rider has not ridden here yet.
      this.serial = frame.discontinuitySerial;
      this.ridden = 0;
      this.stillSeconds = 0;
      this.stopArmed = true;
    }
    const speed = Math.abs(Number.isFinite(frame.speed) ? frame.speed : 0);
    this.ridden += speed * dt;

    if (frame.crashed) {
      this.wasCrashed = true;
    } else if (this.wasCrashed) {
      this.wasCrashed = false;
      this.recoveryUntil = now + BARKS.recoveryQuietSeconds;
    }

    if (speed < BARKS.stopMaximumSpeed) this.stillSeconds += dt;
    else this.stillSeconds = 0;
    if (!this.stopArmed && (speed > BARKS.stopRearmSpeed
      || Math.hypot(frame.x - this.stopX, frame.z - this.stopZ) >= BARKS.stopRearmMetres)) {
      this.stopArmed = true;
    }

    if (this.bubbleActive) this.advanceBubble(frame, dt);
    // The siren, or the asked rider wiping out ("never while the seat is
    // crashed", PLANS §42.2h, covers a bubble already up): it fades from where
    // it stands, and refunds if it was shown under 0.8 s.
    if (this.bubbleActive && (frame.quiet || frame.crashed) && !this.output.leaving) this.beginLeaving();

    // -- Eligibility -----------------------------------------------------------
    const seatBlocked = frame.quiet || frame.crashed || frame.airborne
      || now < this.recoveryUntil
      || this.ridden < BARKS.minimumRiddenMetres
      || now < this.cooldownUntil
      || this.bubbleActive;
    const forwardX = Math.sin(frame.headingY);
    const forwardZ = Math.cos(frame.headingY);
    const [aheadMin, aheadMax] = BARKS.passAheadMetres;
    const margin = BARKS.encounterExitMarginMetres;
    const passing = speed >= BARKS.stopMaximumSpeed && speed <= BARKS.passMaximumSpeed;
    const stopped = this.stopArmed && this.stillSeconds >= BARKS.stopDwellSeconds;
    const count = frame.current.length;
    let pick = -1;
    let pickRank = Infinity;

    for (let index = 0; index < count; index += 1) {
      const actor = actorAt(frame, index, this.scratch);
      if (actor === null || !PEOPLE.has(actor.kind)) continue;
      let memory = this.people.get(actor.id);
      if (memory === undefined) {
        memory = {
          memoryUntil: -Infinity, declineUntil: -Infinity, touchedUntil: -Infinity, occludedUntil: -Infinity,
          ineligibleFor: Infinity, wasOutside: true, encounterOpen: false, rolled: false,
          encounterIndex: 0, stop: false, wasImpacted: false, seenAt: now,
        };
        this.people.set(actor.id, memory);
      }
      memory.seenAt = now;

      const dx = this.scratch.x - frame.x;
      const dz = this.scratch.z - frame.z;
      const distance = Math.hypot(dx, dz);
      const impacted = actor.activity === 'impacted';
      if (impacted && !memory.wasImpacted && distance <= HIT_RADIUS_METRES) {
        memory.touchedUntil = now + BARKS.hitMemorySeconds;
      }
      memory.wasImpacted = impacted;

      const ahead = dx * forwardX + dz * forwardZ;
      const lateral = Math.abs(dx * forwardZ - dz * forwardX);
      const facing = faces(this.scratch.x, this.scratch.z, actor.headingY, frame.x, frame.z);
      const inPass = passing && ahead >= aheadMin && ahead <= aheadMax && lateral <= BARKS.passLateralMetres;
      const inStop = stopped && distance <= BARKS.stopRadiusMetres;
      const outside = !(ahead >= aheadMin - margin && ahead <= aheadMax + margin && lateral <= BARKS.passLateralMetres + margin)
        && distance > BARKS.stopRadiusMetres + margin;
      const personBlocked = impacted || now < memory.memoryUntil || now < memory.declineUntil
        || now < memory.touchedUntil;
      const eligible = !seatBlocked && !personBlocked && facing && (inPass || inStop);

      if (eligible) {
        if (!memory.encounterOpen && (memory.ineligibleFor >= BARKS.encounterGapSeconds || memory.wasOutside)) {
          this.encounters += 1;
          memory.encounterOpen = true;
          memory.rolled = false;
          memory.wasOutside = false;
          memory.encounterIndex = this.encounters;
          memory.stop = inStop;
        }
        memory.ineligibleFor = 0;
        if (inStop && !memory.rolled) memory.stop = true;
        if (memory.encounterOpen && !memory.rolled && now >= memory.occludedUntil) {
          // Round-robin from the last candidate tested, so one that never
          // qualifies (behind a wall, say) cannot starve its neighbours. One
          // whose camera ray just hit a wall sits out its short hold, so the
          // view casts one occlusion ray per hold rather than one per frame.
          const rank = (((index - this.cursor - 1) % count) + count) % count;
          if (rank < pickRank) {
            pickRank = rank;
            pick = index;
          }
        }
      } else {
        memory.ineligibleFor += dt;
        if (outside) memory.wasOutside = true;
        if (memory.encounterOpen && (memory.ineligibleFor >= BARKS.encounterGapSeconds || memory.wasOutside)) {
          memory.encounterOpen = false;
        }
      }
    }

    if (pick >= 0) {
      const actor = actorAt(frame, pick, this.pendingSlot.anchor)!;
      this.cursor = pick;
      this.pendingSlot.actorIndex = pick;
      this.pendingSlot.actorId = actor.id;
      this.pendingSlot.anchor.y += ANCHOR_HEIGHT_METRES;
      const personSpeed = Number.isFinite(actor.speedMetresPerSecond) ? actor.speedMetresPerSecond : 0;
      const riderSpeed = Number.isFinite(frame.speed) ? frame.speed : 0;
      this.pendingSlot.relativeVelocity.x = personSpeed * Math.sin(actor.headingY) - riderSpeed * forwardX;
      this.pendingSlot.relativeVelocity.y = 0;
      this.pendingSlot.relativeVelocity.z = personSpeed * Math.cos(actor.headingY) - riderSpeed * forwardZ;
      this.output.pending = this.pendingSlot;
    } else {
      this.output.pending = null;
    }

    // Forget people who left the world (a respawned population, a swap the
    // world identity did not catch) once their longest memory has lapsed.
    if (this.people.size > 4 * Math.max(1, count)) this.forgetStale(now);

    return this.output;
  }

  /**
   * The view's verdict for this frame, after the pane was drawn.
   *
   * `pendingQualified`: the candidate in `output.pending` was seen — in the
   * start band now and along its predicted path, deeper than the rider, with
   * a clear ray (null when no candidate was tested). The roll happens here,
   * once per encounter. `bubbleInBand`: the visible bubble's anchor is still
   * in the display band and the HUD could place it near its anchor (null when
   * no bubble was projected). `occluded`: the candidate was in the start band
   * but the camera ray hit a wall, so it sits out `occlusionHoldSeconds`
   * before the view tests it — and casts a ray — again. `askerHidden`: the
   * shown bubble's asker is in band but another body hides their head; like
   * a turn-away, that ends the bubble only once it has been read
   * (`minimumReadableSeconds`, owner round 2) — somebody stepping through
   * the line of sight no longer snatches a bubble away mid-sentence.
   */
  reportView(
    pendingQualified: boolean | null, bubbleInBand: boolean | null, room: BarkRoom, occluded = false, askerHidden = false,
  ): void {
    if (this.bubbleActive && !this.output.leaving && (bubbleInBand === false
      || (askerHidden && this.output.age >= BARKS.minimumReadableSeconds))) this.beginLeaving();

    const pending = this.output.pending;
    if (pending === null || this.bubbleActive) return;
    const memory = this.people.get(pending.actorId);
    if (memory === undefined || !memory.encounterOpen || memory.rolled) return;
    if (pendingQualified !== true) {
      if (occluded) memory.occludedUntil = this.clock + BARKS.occlusionHoldSeconds;
      return;
    }
    memory.rolled = true;
    this.output.pending = null;

    this.rolls += 1;
    const roll = hash32(`${this.seat}|${pending.actorId}|${memory.encounterIndex}|${this.rolls}`);
    const chance = memory.stop ? BARKS.stopChance : BARKS.passChance;
    if (room.forceDecline || (!room.forceChance && (roll & 0xffff) / 0x10000 >= chance)) {
      memory.declineUntil = this.clock + BARKS.declineMemorySeconds;
      return;
    }

    // The line: none of this seat's recent lines, never the room's last.
    // `seatRecentLines` + 1 < BARK_LINES.length, so at least one line is always allowed.
    let allowed = 0;
    for (let line = 0; line < BARK_LINES.length; line += 1) {
      if (!this.lineBlocked(line, room)) allowed += 1;
    }
    let choice = (roll >>> 16) % Math.max(1, allowed);
    let lineIndex = 0;
    for (let line = 0; line < BARK_LINES.length; line += 1) {
      if (this.lineBlocked(line, room)) continue;
      if (choice === 0) {
        lineIndex = line;
        break;
      }
      choice -= 1;
    }

    this.bubbleActive = true;
    this.bubbleActorIndex = pending.actorIndex;
    this.bubbleShown = 0;
    this.bubbleLeaveAge = 0;
    this.askedX = this.riderX;
    this.askedZ = this.riderZ;
    this.output.visible = true;
    this.output.actorId = pending.actorId;
    this.output.lineIndex = lineIndex;
    this.output.text = BARK_LINES[lineIndex];
    this.output.anchor.x = pending.anchor.x;
    this.output.anchor.y = pending.anchor.y;
    this.output.anchor.z = pending.anchor.z;
    this.output.age = 0;
    this.output.opacity = 1;
    this.output.leaving = false;

    this.cooldownBefore = this.cooldownUntil;
    this.cooldownUntil = this.clock + BARKS.seatCooldownSeconds;
    memory.memoryUntil = this.clock + BARKS.personMemorySeconds;
    this.recentBefore.length = 0;
    for (const line of this.recentLines) this.recentBefore.push(line);
    this.recentLines.unshift(lineIndex);
    if (this.recentLines.length > BARKS.seatRecentLines) this.recentLines.length = BARKS.seatRecentLines;
    this.bubbleToken = room.nextToken();
    room.lastBefore = room.lastLine;
    room.lastLine = lineIndex;
    room.lastToken = this.bubbleToken;
    this.stopArmedBefore = this.stopArmed;
    if (memory.stop) {
      this.stopArmed = false;
      this.stopX = this.riderX;
      this.stopZ = this.riderZ;
    }
    this.pendingRoom = room;
  }

  private advanceBubble(frame: BarkFrame, dt: number): void {
    const output = this.output;
    // Follow the person. The arrays are stable between frames; a mismatch is
    // a respawned or swapped population, searched once and ended if gone.
    let index = this.bubbleActorIndex;
    if (frame.current[index]?.id !== output.actorId) {
      index = -1;
      for (let i = 0; i < frame.current.length; i += 1) {
        if (frame.current[i].id === output.actorId) {
          index = i;
          break;
        }
      }
      if (index < 0) {
        this.endBubble();
        return;
      }
      this.bubbleActorIndex = index;
    }
    actorAt(frame, index, output.anchor);
    output.anchor.y += ANCHOR_HEIGHT_METRES;
    // Knocked down mid-question: no bark rides a hit, so the bubble fades from
    // where it is (and refunds if it was shown under 0.8 s).
    if (frame.current[index].activity === 'impacted' && !output.leaving) this.beginLeaving();
    // The asker turns away or walks off (critic-people r3 N1, R18): once they
    // face neither the rider nor the spot the rider was asked from — the
    // eligibility's own `facingDot` test — the bubble fades like one leaving
    // the display band. The spot keeps a pass: a rider riding on past an
    // asker does not turn them away (their face is still to the camera, and
    // the display band ends that one). Never before the bubble has been read:
    // `minimumReadableSeconds` at full opacity first (owner round 2).
    if (!output.leaving && output.age >= BARKS.minimumReadableSeconds) {
      const headingY = frame.current[index].headingY;
      if (!faces(output.anchor.x, output.anchor.z, headingY, frame.x, frame.z)
        && !faces(output.anchor.x, output.anchor.z, headingY, this.askedX, this.askedZ)) this.beginLeaving();
    }

    output.age += dt;
    if (output.leaving) {
      this.bubbleLeaveAge += dt;
      output.opacity = Math.max(0, 1 - this.bubbleLeaveAge / BARKS.fadeSeconds);
      if (this.bubbleLeaveAge >= BARKS.fadeSeconds) this.endBubble();
      return;
    }
    this.bubbleShown = Math.min(output.age, BARKS.lifetimeSeconds);
    if (output.age < BARKS.lifetimeSeconds) {
      output.opacity = 1;
      return;
    }
    const fading = output.age - BARKS.lifetimeSeconds;
    output.opacity = Math.max(0, 1 - fading / BARKS.fadeSeconds);
    if (fading >= BARKS.fadeSeconds) this.endBubble();
  }

  /**
   * Fade out from the opacity the bubble has now. A bubble already in its
   * end-of-life fade carries on down; restarting from full would brighten it
   * again — a strobe, which DESIGN §9 rules out.
   */
  private beginLeaving(): void {
    this.output.leaving = true;
    const opacity = Math.min(1, Math.max(0, this.output.opacity));
    this.bubbleLeaveAge = (1 - opacity) * BARKS.fadeSeconds;
    this.bubbleShown = Math.min(this.output.age, BARKS.lifetimeSeconds);
  }

  private endBubble(): void {
    if (this.bubbleShown < BARKS.minimumShownSeconds) {
      // Seen too briefly to count: the cooldown is given back and the line
      // does not become the last line. The person's own memory stays spent,
      // so they cannot pop straight back up.
      this.cooldownUntil = this.cooldownBefore;
      this.recentLines.length = 0;
      for (const line of this.recentBefore) this.recentLines.push(line);
      this.stopArmed = this.stopArmedBefore || this.stopArmed;
      const room = this.pendingRoom;
      if (room !== null && room.lastToken === this.bubbleToken) {
        room.lastLine = room.lastBefore;
        room.lastToken = 0;
      }
    }
    this.pendingRoom = null;
    this.bubbleActive = false;
    this.bubbleActorIndex = -1;
    this.bubbleShown = 0;
    this.bubbleLeaveAge = 0;
    const output = this.output;
    output.visible = false;
    output.actorId = null;
    output.lineIndex = -1;
    output.text = '';
    output.age = 0;
    output.opacity = 0;
    output.leaving = false;
  }

  /** One of this seat's recent lines, or the room's last: not offered. */
  private lineBlocked(line: number, room: BarkRoom): boolean {
    return line === room.lastLine || this.recentLines.includes(line);
  }

  private forgetStale(now: number): void {
    for (const [id, memory] of this.people) {
      const lapsed = now - memory.seenAt > BARKS.personMemorySeconds
        && now >= memory.memoryUntil && now >= memory.declineUntil && now >= memory.touchedUntil;
      if (lapsed) this.people.delete(id);
    }
  }
}
