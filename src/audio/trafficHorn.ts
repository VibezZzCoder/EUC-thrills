/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { POPULATION_AUTHORING } from '../data/tuning.ts';
import { clamp01 } from './mix.ts';

/**
 * Traffic horns: a van that has been held up by a rider standing in its lane
 * says so (owner, 2026-10-21).
 *
 * **Presentation only, and read-only.** The population already makes a vehicle
 * wait — indefinitely — for a rider or cop body in its path; nothing here
 * changes that, steers anything round anybody, or reaches back into the
 * simulation. This model is handed the same presented population rows every
 * pane draws and the presented rider positions, and from those alone decides
 * that a vehicle is *stopped with a rider in the box ahead of its nose*. The
 * horn is the audible face of a wait the simulation was already doing.
 *
 * **Timed on the population's own fixed-step clock** (`clockSeconds`), not on
 * wall time or the render frame, so `advance(n)` reaches the same honks every
 * run, a paused game (whose clock stops) holds its patience exactly where it
 * was, and a QA-frozen loop makes no sound it did not already owe. Menus, a
 * pause card and a hidden tab are silent through `active`, and leaving any of
 * them starts every vehicle's patience from zero — nobody is honked at the
 * instant they unpause.
 *
 * **Deterministic variation.** Each vehicle's pitch, interval and toot lengths
 * come from a hash of its id and how many times it has honked, never from
 * `Math.random`, so two vehicles are two different horns and the same vehicle
 * is always the same horn, growing a little more impatient each time.
 *
 * **Never nagging** (2026-10-22). Only a seated player is honked at: a CPU cop
 * parked or asleep in a lane is waited for in silence, and so is a player
 * standing beyond him. One wait says at most `maximumHonksPerWait` things —
 * polite, then leaning on it — and then the horn has given up on every player
 * who held it up in that wait: it stays quiet for as long as the vehicle stands,
 * however often they step out and back in, until it moves again or a player it
 * has not yet honked at becomes what it is waiting for. That player gets a wait
 * of their own, from zero patience and the polite double toot. So a stop costs
 * at most four honks per player, and a player who stays gets silence.
 *
 * Fixed storage: one cue ring and one record per tracked vehicle; `observe`
 * allocates nothing once a vehicle has been seen.
 */

/** Plain tuning numbers. Not options: no player setting reaches this file. */
export const TRAFFIC_HORN = Object.freeze({
  /** A vehicle at or under this speed counts as standing, m/s. */
  stoppedSpeedMetresPerSecond: 0.25,
  /** Held this long, stopped, with a rider ahead, before the first honk. */
  patienceSeconds: 3,
  /** A rider may leave the box for this long without the patience resetting. */
  clearGraceSeconds: 0.5,
  /** Repeat spacing while still blocked, seconds (deterministic per honk). */
  repeatMinSeconds: 4,
  repeatMaxSeconds: 6,
  /** Nose distance from the vehicle origin: the population hull's own half length. */
  noseMetres: POPULATION_AUTHORING.vehicleHalfLengthMetres,
  /** The "in front of it" box, measured from the nose along the travel direction. */
  boxAheadMetres: 8,
  boxHalfWidthMetres: 1.6,
  /** A rider on a bridge overhead, or a pad flight, is not in the lane. */
  boxHalfHeightMetres: 2.5,
  /** Where the sound comes from: the grille, above the tyre contact. */
  sourceHeightMetres: 0.9,
  /** Linear peak before the transient trim, at or inside `nearMetres`. */
  peakGain: 0.2,
  nearMetres: 6,
  /** Inverse-distance falloff, then a smooth fade to zero across this band. */
  fadeStartMetres: 30,
  farMetres: 60,
  /** Below this a honk is not built at all. */
  minimumGain: 0.004,
  /** Stereo placement ceiling for a single-seat listener; split panes stay centred. */
  maximumPan: 0.5,
  /** Lowpass brightness at the near distance and at the far edge (air), Hz. */
  brightNearHz: 1900,
  brightFarHz: 950,
  /** Fundamental bands, Hz: a car's horn sits above a service van's. */
  trafficLowHz: 360,
  trafficHighHz: 480,
  serviceLowHz: 300,
  serviceHighHz: 380,
  /** The second note: a major or a minor third above, per vehicle. */
  majorThird: 1.25,
  minorThird: 1.19,
  /** The polite double toot. */
  shortTootSeconds: 0.13,
  gapSeconds: 0.1,
  lastTootSeconds: 0.17,
  /** The longest the final toot grows to as patience runs out. */
  impatientLastTootSeconds: 0.6,
  /** Honks until full impatience. */
  impatienceHonks: 3,
  /** Honks one wait may make; the last of them is the fully impatient one. */
  maximumHonksPerWait: 4,
  /** Honks one observation may start; the rest wait one frame. */
  maximumHonksPerObserve: 2,
  /** A clock jump larger than this is a world swap or rewind, not time passing. */
  maximumClockJumpSeconds: 10,
});

/** Structurally the presented population row (`render/populationView.ts`). */
export interface TrafficHornVehicle {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** +Z forward at zero; forward is (sin, cos). */
  readonly headingY: number;
  readonly speedMetresPerSecond: number;
  readonly activity: string;
  readonly activityPhase: number;
  readonly backing: boolean;
}

/** A presented rider or cop position. */
export interface TrafficHornBody {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One honk, fully resolved. Filled in place in a fixed ring. */
export interface TrafficHornCue {
  vehicleId: string;
  /** Source position, metres. */
  x: number;
  y: number;
  z: number;
  /** To the nearest listening seat. */
  distanceMetres: number;
  /** Linear, distance attenuation included. */
  gain: number;
  /** -1 left .. 1 right. */
  pan: number;
  /** The two notes, Hz. Constant for a vehicle. */
  lowHz: number;
  highHz: number;
  /** Lowpass cutoff, Hz: closer is brighter. */
  brightnessHz: number;
  /** 2 or 3. */
  toots: number;
  /** Every toot but the last. */
  shortTootSeconds: number;
  gapSeconds: number;
  lastTootSeconds: number;
  /** 0 on the first honk, 1 once patience is gone. */
  urgency: number;
  /** How many honks this vehicle has made in this wait, before this one. */
  honkIndex: number;
}

function createCue(): TrafficHornCue {
  return {
    vehicleId: '', x: 0, y: 0, z: 0, distanceMetres: 0, gain: 0, pan: 0, lowHz: 0, highHz: 0,
    brightnessHz: 0, toots: 2, shortTootSeconds: 0, gapSeconds: 0, lastTootSeconds: 0, urgency: 0, honkIndex: 0,
  };
}

interface VehicleBook {
  /** A wait is in progress (patience running or spent). */
  waiting: boolean;
  /** The last observation found a rider ahead; time only accrues between two that did. */
  aheadLast: boolean;
  /** Seconds stopped with a rider ahead, on the population clock. */
  blockedSeconds: number;
  /** Seconds the box has been empty while the patience is still held. */
  clearSeconds: number;
  /** Population clock of the next honk, or NaN before the first. */
  nextHonkAt: number;
  /** Honks in this wait. Kept while the box is briefly empty; the stop has not ended. */
  honks: number;
  /** Seats (bit per seat) that have been what it waited for, in this wait. */
  waitSeats: number;
  /** Seats it has given up on for the rest of this stop: honked out, then quiet. */
  spentSeats: number;
  /** Sign of the last real movement: a van that was backing waits looking back. */
  travelSign: 1 | -1;
  /** The observation generation that last saw this vehicle. */
  seen: number;
  /** Per-vehicle constants, from the id hash. */
  readonly lowHz: number;
  readonly highHz: number;
  readonly hash: number;
}

/** FNV-1a, 32-bit. Stable across runs and engines. */
export function hornHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A unit value from a 32-bit hash and a small salt; integer mixing only. */
function unit(hash: number, salt: number): number {
  let value = (hash ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 4294967296;
}

const isHornVehicle = (kind: string): boolean => kind === 'trafficVehicle' || kind === 'serviceVehicle';
/** Half the length an actor takes up along a lane: the population's own hull sizes. */
const occupiedHalfLength = (kind: string): number => isHornVehicle(kind) || kind === 'parkedVehicle'
  ? POPULATION_AUTHORING.vehicleHalfLengthMetres
  : kind === 'fictionalEuc' ? POPULATION_AUTHORING.riderRadiusMetres : POPULATION_AUTHORING.pedestrianRadiusMetres;

/**
 * Distance attenuation: unity inside `nearMetres`, inverse distance beyond, and
 * a smooth fade to exactly zero across `fadeStartMetres`..`farMetres`.
 */
export function hornAttenuation(distanceMetres: number, tuning = TRAFFIC_HORN): number {
  if (!Number.isFinite(distanceMetres) || distanceMetres >= tuning.farMetres) return 0;
  const inverse = distanceMetres <= tuning.nearMetres ? 1 : tuning.nearMetres / distanceMetres;
  const t = clamp01((distanceMetres - tuning.fadeStartMetres) / (tuning.farMetres - tuning.fadeStartMetres));
  return inverse * (1 - t * t * (3 - 2 * t));
}

/**
 * Is `body` inside the box ahead of this vehicle's nose, in its travel
 * direction? Exported for the tests and the browser check; pure.
 */
export function bodyAhead(vehicle: TrafficHornVehicle, body: TrafficHornBody, travelSign: 1 | -1,
  tuning = TRAFFIC_HORN): boolean {
  return Number.isFinite(distanceAhead(vehicle, body, travelSign, tuning));
}

/** Metres from the nose to `body` when it is in the box, NaN otherwise. */
function distanceAhead(vehicle: TrafficHornVehicle, body: TrafficHornBody, travelSign: 1 | -1,
  tuning: typeof TRAFFIC_HORN): number {
  const forwardX = Math.sin(vehicle.headingY) * travelSign, forwardZ = Math.cos(vehicle.headingY) * travelSign;
  const dx = body.x - vehicle.x, dz = body.z - vehicle.z;
  const along = dx * forwardX + dz * forwardZ - tuning.noseMetres;
  if (!(along >= 0 && along <= tuning.boxAheadMetres)) return Number.NaN;
  const lateral = dx * forwardZ - dz * forwardX;
  if (!(Math.abs(lateral) <= tuning.boxHalfWidthMetres)) return Number.NaN;
  return Math.abs(body.y - vehicle.y) <= tuning.boxHalfHeightMetres ? along : Number.NaN;
}

export class TrafficHornModel {
  /** The honks the last `observe` started. Read `cueCount` entries from 0. */
  readonly cues: readonly TrafficHornCue[];
  cueCount = 0;
  /** Vehicles currently stopped with a player ahead (patience running, or given up). */
  blockedVehicles = 0;
  /** Of those, vehicles that have given up on the player ahead: quiet until they move. */
  quietVehicles = 0;

  private readonly tuning: typeof TRAFFIC_HORN;
  private readonly ring: TrafficHornCue[];
  private readonly books = new Map<string, VehicleBook>();
  /** Which way each vehicle last travelled. A pause forgets every wait but
   * keeps this, so a van stopped while reversing still watches its tail. */
  private readonly directions = new Map<string, 1 | -1>();
  private lastClock = Number.NaN;
  private generation = 0;

  constructor(tuning: typeof TRAFFIC_HORN = TRAFFIC_HORN) {
    this.tuning = tuning;
    this.ring = Array.from({ length: tuning.maximumHonksPerObserve }, createCue);
    this.cues = this.ring;
  }

  /** Vehicles with a record. Bounded by the population's own vehicle count. */
  get trackedVehicles(): number { return this.books.size; }

  /** Forget everything: a world swap, a quick reset, a parked tab. */
  reset(): void {
    this.directions.clear();
    this.forgetWaits();
  }

  /** Forget every wait — a menu, a pause — but not which way vehicles travel. */
  private forgetWaits(): void {
    this.books.clear();
    this.lastClock = Number.NaN;
    this.cueCount = 0;
    this.blockedVehicles = 0;
    this.quietVehicles = 0;
  }

  /**
   * One presented frame. `vehicles` is every presented population row — only
   * traffic and service vehicles honk, but anyone standing between a nose and
   * a rider is what that vehicle is really waiting for. `bodies` are every
   * rider (seats first, then any placed cops); the first `listenerCount` of
   * them are the seats — the players, the only riders ever honked at, and the
   * ears the honk is attenuated for. Bodies after them (CPU cops) are in the
   * way like anyone else, and never honked at. `listenerHeadingY` places the honk left/right for a lone seat; with more
   * than one pane there is no single "left", so it is centred.
   */
  observe(
    clockSeconds: number,
    vehicles: readonly TrafficHornVehicle[],
    bodies: readonly TrafficHornBody[],
    listenerCount: number,
    listenerHeadingY: number,
    active: boolean,
  ): void {
    this.cueCount = 0;
    if (!active || !Number.isFinite(clockSeconds)) {
      if (this.books.size > 0 || Number.isFinite(this.lastClock)) this.forgetWaits();
      return;
    }
    let step = Number.isFinite(this.lastClock) ? clockSeconds - this.lastClock : 0;
    if (step < 0 || step > this.tuning.maximumClockJumpSeconds) {
      this.reset();
      step = 0;
    }
    this.lastClock = clockSeconds;
    const generation = (this.generation = (this.generation + 1) | 0);
    const tuning = this.tuning;
    // One bit per seat in a wait's books; four players is the couch's ceiling.
    const seats = Math.min(Math.max(0, listenerCount | 0), bodies.length, 30);
    let blocked = 0, quiet = 0, seen = 0;

    for (let index = 0; index < vehicles.length; index += 1) {
      const vehicle = vehicles[index];
      if (!isHornVehicle(vehicle.kind)) continue;
      let book = this.books.get(vehicle.id);
      if (!book) {
        const hash = hornHash(vehicle.id);
        const service = vehicle.kind === 'serviceVehicle';
        const lowHz = service
          ? tuning.serviceLowHz + (tuning.serviceHighHz - tuning.serviceLowHz) * unit(hash, 0)
          : tuning.trafficLowHz + (tuning.trafficHighHz - tuning.trafficLowHz) * unit(hash, 0);
        const third = unit(hash, 1) < 0.5 ? tuning.majorThird : tuning.minorThird;
        book = { waiting: false, aheadLast: false, blockedSeconds: 0, clearSeconds: 0, nextHonkAt: Number.NaN,
          honks: 0, waitSeats: 0, spentSeats: 0, travelSign: this.directions.get(vehicle.id) ?? 1, seen: generation, lowHz, highHz: lowHz * third, hash };
        this.books.set(vehicle.id, book);
      }
      book.seen = generation;
      seen += 1;

      const speed = vehicle.speedMetresPerSecond;
      const moving = !(Math.abs(speed) <= tuning.stoppedSpeedMetresPerSecond);
      if (moving) {
        // Moving again: the wait is over, whatever caused it.
        book.travelSign = speed < 0 ? -1 : 1;
        if (this.directions.get(vehicle.id) !== book.travelSign) this.directions.set(vehicle.id, book.travelSign);
        this.clear(book);
        continue;
      }
      // A knocked vehicle, a parked one, or a scheduled stop is not being held
      // up. A scheduled stop is a running pause clock: the population reports
      // its progress as the waiting phase, strictly between 0 and 1, and a wait
      // with no pause left (held only by something in the way) reads 1.
      const scheduledPause = vehicle.activity === 'waiting'
        && vehicle.activityPhase > 1e-6 && vehicle.activityPhase < 0.999;
      const seat = scheduledPause || vehicle.activity === 'impacted' || vehicle.activity === 'parked'
        ? -1 : this.seatWaitedFor(vehicle, index, vehicles, bodies, seats, book.travelSign);
      // A player it has already honked out this stop: it still waits for them,
      // and has nothing more to say to them.
      const spent = seat >= 0 && (book.spentSeats & (1 << seat)) !== 0;
      if (seat < 0 || spent) {
        book.aheadLast = false;
        if (book.waiting) {
          book.clearSeconds += step;
          // The patience lapses; the wait's honk count and its seats do not.
          if (book.clearSeconds > tuning.clearGraceSeconds) this.lapse(book);
        }
        if (seat >= 0 || book.waiting) blocked += 1;
        if (spent) quiet += 1;
        continue;
      }
      book.waitSeats |= 1 << seat;
      // Time accrues only between two observations that both found a player:
      // the first one starts the wait at zero rather than crediting the whole
      // interval since a frame in which the van was still rolling.
      if (book.waiting && book.aheadLast) book.blockedSeconds += step;
      book.waiting = true;
      book.aheadLast = true;
      book.clearSeconds = 0;
      blocked += 1;
      if (book.blockedSeconds < tuning.patienceSeconds) continue;
      if (Number.isNaN(book.nextHonkAt)) book.nextHonkAt = clockSeconds;
      if (clockSeconds < book.nextHonkAt || this.cueCount >= this.ring.length) continue;
      if (this.emit(vehicle, book, bodies, listenerCount, listenerHeadingY)) {
        const urgency = Math.min(1, book.honks / tuning.impatienceHonks);
        const spread = unit(book.hash, 100 + book.honks) * (1 - 0.4 * urgency);
        book.nextHonkAt = clockSeconds + tuning.repeatMinSeconds
          + (tuning.repeatMaxSeconds - tuning.repeatMinSeconds) * spread;
        book.honks += 1;
      } else {
        // Out of earshot: keep the rhythm without a sound, so walking up to a
        // van that has been honking does not make it honk the instant you arrive.
        book.nextHonkAt = clockSeconds + tuning.repeatMinSeconds;
        book.honks += 1;
      }
      if (book.honks >= tuning.maximumHonksPerWait) {
        // Said all it will: everyone this wait was about is let be until the
        // vehicle moves. A player it has not honked at yet starts a new wait.
        book.spentSeats |= book.waitSeats;
        book.waitSeats = 0;
        book.honks = 0;
        this.lapse(book);
      }
    }
    this.blockedVehicles = blocked;
    this.quietVehicles = quiet;
    // A vehicle the population no longer has (a world swap that kept the clock).
    if (this.books.size > seen) {
      for (const [id, book] of this.books) if (book.seen !== generation) this.books.delete(id);
    }
    if (this.directions.size > this.books.size) {
      for (const id of this.directions.keys()) if (!this.books.has(id)) this.directions.delete(id);
    }
  }

  /**
   * The seat whose player is in the box with nothing nearer, or -1. The second
   * car in a queue behind a waiting van is waiting for the van, not for the
   * rider beyond it, and does not honk through it; a van stopped for someone on
   * foot crossing in front of it is waiting for them, not honking at them or at
   * the rider beyond — and the same for a CPU cop standing in the lane.
   */
  private seatWaitedFor(vehicle: TrafficHornVehicle, self: number, vehicles: readonly TrafficHornVehicle[],
    bodies: readonly TrafficHornBody[], seats: number, travelSign: 1 | -1): number {
    const tuning = this.tuning;
    let nearest = Number.POSITIVE_INFINITY, nearestBody = -1;
    for (let index = 0; index < bodies.length; index += 1) {
      const along = distanceAhead(vehicle, bodies[index], travelSign, tuning);
      if (along < nearest) { nearest = along; nearestBody = index; }
    }
    // Nobody in the box, or a CPU cop first in it: waited for in silence.
    if (nearestBody < 0 || nearestBody >= seats) return -1;
    const forwardX = Math.sin(vehicle.headingY) * travelSign, forwardZ = Math.cos(vehicle.headingY) * travelSign;
    for (let index = 0; index < vehicles.length; index += 1) {
      if (index === self) continue;
      const other = vehicles[index];
      const dx = other.x - vehicle.x, dz = other.z - vehicle.z;
      // The other actor's centre and near end, measured from this one's nose.
      const centre = dx * forwardX + dz * forwardZ - tuning.noseMetres;
      const near = centre - occupiedHalfLength(other.kind);
      if (!(centre > 0 && near < nearest)) continue;
      if (Math.abs(dx * forwardZ - dz * forwardX) <= tuning.boxHalfWidthMetres
        && Math.abs(other.y - vehicle.y) <= tuning.boxHalfHeightMetres) return -1;
    }
    return nearestBody;
  }

  /** The patience is over; the stop is not, so what this wait has said stands. */
  private lapse(book: VehicleBook): void {
    book.waiting = false;
    book.aheadLast = false;
    book.blockedSeconds = 0;
    book.clearSeconds = 0;
    book.nextHonkAt = Number.NaN;
  }

  /** The vehicle moved: the stop is over, and everyone starts with a clean slate. */
  private clear(book: VehicleBook): void {
    this.lapse(book);
    book.honks = 0;
    book.waitSeats = 0;
    book.spentSeats = 0;
  }

  /** Resolve one honk into the ring. False when nobody could hear it. */
  private emit(vehicle: TrafficHornVehicle, book: VehicleBook, bodies: readonly TrafficHornBody[],
    listenerCount: number, listenerHeadingY: number): boolean {
    const tuning = this.tuning;
    const sign = book.travelSign;
    const x = vehicle.x + Math.sin(vehicle.headingY) * sign * tuning.noseMetres;
    const z = vehicle.z + Math.cos(vehicle.headingY) * sign * tuning.noseMetres;
    const y = vehicle.y + tuning.sourceHeightMetres;
    let nearest = Number.POSITIVE_INFINITY, nearestIndex = -1;
    const listeners = Math.min(Math.max(0, listenerCount | 0), bodies.length);
    for (let index = 0; index < listeners; index += 1) {
      const body = bodies[index];
      const distance = Math.hypot(body.x - x, body.y - y, body.z - z);
      if (distance < nearest) { nearest = distance; nearestIndex = index; }
    }
    const gain = tuning.peakGain * hornAttenuation(nearest, tuning);
    if (!(gain >= tuning.minimumGain)) return false;

    let pan = 0;
    if (listeners === 1 && nearestIndex === 0 && Number.isFinite(listenerHeadingY) && nearest > 1e-3) {
      const body = bodies[0];
      // Right of a listener facing (sin h, cos h) is (-cos h, sin h): +X is left.
      const rightX = -Math.cos(listenerHeadingY), rightZ = Math.sin(listenerHeadingY);
      const horizontal = Math.hypot(x - body.x, z - body.z);
      if (horizontal > 1e-3) {
        pan = ((x - body.x) * rightX + (z - body.z) * rightZ) / horizontal * tuning.maximumPan;
      }
    }

    const honk = book.honks;
    const urgency = Math.min(1, honk / tuning.impatienceHonks);
    const jitter = (salt: number, amount: number): number => 1 + (unit(book.hash, salt * 1000 + honk) * 2 - 1) * amount;
    // Polite at first: two short toots. Then the second stretches; from the
    // third honk on, either short-short-long or a long leaning double.
    const triple = honk >= 2 && (honk === 2 || unit(book.hash, 7000 + honk) < 0.5);
    const lastBase = tuning.lastTootSeconds + (tuning.impatientLastTootSeconds - tuning.lastTootSeconds) * urgency;

    const cue = this.ring[this.cueCount];
    this.cueCount += 1;
    cue.vehicleId = vehicle.id;
    cue.x = x; cue.y = y; cue.z = z;
    cue.distanceMetres = nearest;
    cue.gain = gain;
    cue.pan = Math.max(-1, Math.min(1, pan));
    cue.lowHz = book.lowHz;
    cue.highHz = book.highHz;
    const far = clamp01((nearest - tuning.nearMetres) / (tuning.farMetres - tuning.nearMetres));
    cue.brightnessHz = tuning.brightNearHz + (tuning.brightFarHz - tuning.brightNearHz) * far;
    cue.toots = triple ? 3 : 2;
    cue.shortTootSeconds = tuning.shortTootSeconds * jitter(1, 0.1);
    cue.gapSeconds = tuning.gapSeconds * jitter(2, 0.15) * (1 - 0.2 * urgency);
    cue.lastTootSeconds = Math.min(tuning.impatientLastTootSeconds, lastBase * jitter(3, 0.1));
    cue.urgency = urgency;
    cue.honkIndex = honk;
    return true;
  }
}
