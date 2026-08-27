/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { ActionState } from './actions.ts';
import type { GamepadRouting } from './gamepad.ts';
import type { RiderSource } from './riderSource.ts';

/**
 * Which device is talking, as a value that can be a map key — M25 Phase 4.
 *
 * The keyboard is one device however many keys it has (q65: no
 * two-players-one-keyboard in stage 1), and a pad is identified by the slot
 * `navigator.getGamepads()` lists it in, which the Gamepad API defines as
 * equal to the pad's own `index`. A template-literal type rather than a
 * struct because the only thing this identity is ever used for is lookup, and
 * a struct key would need a comparison function nobody would remember to use.
 *
 * Touch is deliberately absent. It never joins a couch session (§25.5 Phase
 * 4), so it has no seat to be claimed to and stays wired to seat 0 for the
 * whole of its life.
 */
export type DeviceId = 'keyboard' | `pad:${number}`;

/** The keyboard, as one claimable unit. */
export const KEYBOARD_DEVICE: DeviceId = 'keyboard';

/** The pad in poll slot `index`, as a claimable device. */
export function padDeviceId(index: number): DeviceId {
  return `pad:${index}`;
}

/**
 * The inverse of `padDeviceId` — which pad this device id names, or `null` for
 * the keyboard.
 *
 * **Here rather than at the one call site that needs it**, because an encoding
 * and its inverse are one decision: the day `pad:N` gains a prefix or a
 * separator, both halves are on the same screen and either both change or the
 * build fails. A `slice(4)` written wherever a pad number happened to be
 * wanted is the version that silently starts returning `NaN`.
 */
export function padIndexOf(device: DeviceId): number | null {
  if (device === KEYBOARD_DEVICE) return null;
  const index = Number(device.slice('pad:'.length));
  return Number.isInteger(index) ? index : null;
}

export interface InputRouterOptions {
  /**
   * Fired when the keyboard's seat changes, with the state it should write
   * into from now on.
   *
   * The keyboard is re-*pointed* rather than consulted per event, because it
   * writes from DOM handlers that fire between frames and a sink resolved at
   * event time could change under a keydown/keyup pair — the one way to leave
   * a key held on a seat nobody is clearing. One seat at a time is also the
   * whole of the keyboard's routing, which is why it needs no equivalent of
   * `sinkForPad`.
   */
  onKeyboardSeat?(state: ActionState, rides: boolean): void;
  /**
   * Fired when a claim is made, released, swapped, or left waiting for a
   * device — so a panel can redraw without polling.
   */
  onClaimsChange?(): void;
}

/**
 * Which device drives which seat — M25 Phase 4 (docs/PLANS.md §25.5).
 *
 * The other half of the seam §25.3 named. A `RiderSource` is `sample` +
 * `consume` and nothing else, because reading intent is all a seat is
 * entitled to do; **everything else about a device — where its intent lands,
 * when it is cleared, what happens when it is unplugged — is this class's**,
 * and until Phase 4 it lived as a bare `ActionState[]` beside the seats with
 * a comment saying so.
 *
 * Three rules hold the design together:
 *
 *   1. **Single-player semantics are the no-claims case, not a branch.** With
 *      no claims, the first standard pad drives seat 0 and every device
 *      cooperates on seat 0 — which is exactly what the game did before this
 *      class existed. There is no "couch mode" flag anywhere in here; a couch
 *      session is simply a session that has made claims.
 *   2. **A seat is never dissolved by hardware.** A claimed pad that vanishes
 *      leaves its seat *awaiting* a device rather than unclaimed, so a flat
 *      battery pauses the game and asks for a pad instead of quietly handing
 *      the second player's rider to nobody. The next fresh confirm press from
 *      any unclaimed pad fills the awaiting seat first — which is what makes
 *      "the same or a replacement pad" one code path.
 *   3. **Claims are session-only.** Nothing here is written to `GameOptions`
 *      or to storage: which body is holding which pad is not a preference,
 *      and a claim restored from last week would seat a player who is not in
 *      the room.
 */
export class InputRouter implements GamepadRouting {
  private readonly states: ActionState[];
  private readonly options: InputRouterOptions;

  /** device → seat. Absent means "cooperating on seat 0" (rule 1). */
  private readonly claims = new Map<DeviceId, number>();

  /**
   * Seats whose claimed device has gone missing (rule 2).
   *
   * Separate from `claims` rather than a null entry in it, because the two
   * questions a caller asks are different: `seatFor` wants "is this device
   * spoken for", and claim-by-press wants "is a seat waiting for a body". A
   * sentinel would make both read the same and mean different things.
   */
  private readonly awaiting = new Set<number>();

  /**
   * Whether a claim window is open.
   *
   * Claim-by-press is refused outside one on purpose: A is confirm and Start
   * is pause during a ride, and a device that could claim a seat at any
   * moment would turn either of those into a silent re-seat.
   */
  private claimWindow = false;

  constructor(seatZero: ActionState, options: InputRouterOptions = {}) {
    this.states = [seatZero];
    this.options = options;
  }

  get seatCount(): number {
    return this.states.length;
  }

  /** The concrete input object behind a seat. Lifecycle, not seat, territory. */
  stateFor(seat: number): ActionState {
    const state = this.states[seat];
    if (state === undefined) {
      throw new Error(`no such seat: ${seat} (seats: ${this.states.length})`);
    }
    return state;
  }

  /** The same object, narrowed to what a seat is allowed to see (§25.3). */
  sourceFor(seat: number): RiderSource {
    return this.stateFor(seat);
  }

  /**
   * Seat a new rider's input and hand back their index.
   *
   * A device-less `ActionState`, which is what makes the seat scripted by
   * construction rather than by a second class: `setScripted` is the only
   * thing that writes it until a device claims the seat, and `sample` /
   * `consume` behave exactly as they do for the player either way.
   */
  addSeat(): number {
    this.states.push(new ActionState());
    // The table just stopped being single-player, which is the whole of what
    // `keyboardRides` asks about.
    this.pointKeyboard();
    return this.states.length - 1;
  }

  /**
   * Drop the last seat, and every claim that pointed at it.
   *
   * The claims go rather than sliding down a seat: a device claimed to the
   * rider who just left has no opinion about the rider who stayed, and
   * inheriting one would hand the player's wheel to whoever was holding the
   * guest's pad.
   */
  removeSeat(): void {
    if (this.states.length < 2) throw new Error('seat 0 cannot be removed');
    const index = this.states.length - 1;
    this.states.length = index;
    // **A seat that was waiting for a device stops waiting when the rider it
    // was holding a place for leaves.** Counted as a change rather than dropped
    // silently, or the settings line goes on saying Player 2's pad is
    // disconnected after there is no Player 2 — a status about a seat that no
    // longer exists, which nothing can clear.
    let changed = this.awaiting.delete(index);
    for (const [device, seat] of this.claims) {
      if (seat !== index) continue;
      this.claims.delete(device);
      changed = true;
    }
    // **And the keyboard is told what just happened to it.** Deleting its claim
    // is only half the move: its layer holds a sink, and the sink it holds is
    // the `ActionState` of a seat that has just left the table — so without
    // this the keys go on writing into an object nothing samples, and the
    // player is left with a keyboard that does nothing at all. `keyboardSeat`
    // reads 0 again the moment the claim is gone, which is why this runs after
    // the deletion and not before it.
    //
    // Unconditional since M25 Phase 5 QA, where it was guarded on the
    // keyboard's own claim having moved: the callback now also carries
    // `keyboardRides`, and dropping back to a single seat restores the
    // keyboard's ride intent even when nothing it held ever changed hands.
    this.pointKeyboard();
    if (changed) this.claimsChanged();
  }

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------

  /**
   * Where a pad's ride intent goes — the `GamepadRouting` contract.
   *
   * `order` is the pad's position among the usable pads in this scan, and it
   * is what expresses rule 1 without a branch on session type: with no pad
   * claimed, the first standard pad is seat 0's and the rest are read for
   * menus only, which is the adopt-one behaviour M9 shipped. Once any pad is
   * claimed, order stops mattering and identity takes over — an unclaimed pad
   * in a couch session drives nobody, because the alternative is a spectator's
   * controller steering a player.
   */
  sinkForPad(padIndex: number, order: number): ActionState | null {
    if (!this.hasPadClaim) return order === 0 ? this.states[0] : null;
    const seat = this.claims.get(padDeviceId(padIndex));
    return seat === undefined ? null : (this.states[seat] ?? null);
  }

  /** The seat the keyboard writes into. Seat 0 unless it has been claimed. */
  get keyboardSeat(): number {
    return this.claims.get(KEYBOARD_DEVICE) ?? 0;
  }

  /**
   * Whether the keyboard's *ride* intent reaches the seat above at all — M25
   * Phase 5 QA, and the other half of `sinkForPad`'s rule.
   *
   * That method already refuses a spectator's pad ("an unclaimed pad in a
   * couch session drives nobody, because the alternative is a spectator's
   * controller steering a player"). The rule was written once and applied to
   * one device: the keyboard kept falling through to seat 0 whatever else was
   * claimed, so on a two-pad couch anyone brushing the keys drove Player 1.
   * The owner found it with two controllers plugged in.
   *
   * **Keyed on the seat count, not on "any claim exists".** Those differ in
   * exactly one place and it is a place the game reaches: `Game.closeCouch`
   * clears claims *before* despawning the guest, and between those two
   * statements a claim can still stand over a table that is about to be one
   * seat again. Asking about seats instead makes single player unreachable by
   * this rule at all — with one seat the answer is always true, which is the
   * M9 behaviour every existing pad spec is written against — and keeps the
   * promise `removeSeat` documents, that a player is never left holding a
   * keyboard that does nothing.
   *
   * Ride intent only. Pause and mute are the machine's, not a seat's, and go
   * on working from a keyboard that is driving nobody — see
   * `GLOBAL_PRESSED_ACTIONS`.
   */
  get keyboardRides(): boolean {
    if (this.states.length < 2) return true;
    return this.claims.has(KEYBOARD_DEVICE);
  }

  private get hasPadClaim(): boolean {
    for (const device of this.claims.keys()) if (device !== KEYBOARD_DEVICE) return true;
    return false;
  }

  // -------------------------------------------------------------------------
  // Claims
  // -------------------------------------------------------------------------

  get claiming(): boolean {
    return this.claimWindow;
  }

  /**
   * Open the claim window.
   *
   * The *fresh press edge* half of claim-by-press (§25.5 Phase 4) is not
   * here: it belongs to the device layers, because only they can tell a
   * button that has just gone down from one that was already held when the
   * panel opened. The caller primes them — `GamepadInput.primeAll()` — in the
   * same breath as this call, and the keyboard gets it for free because a
   * held key delivers only auto-repeats, which its layer already filters.
   */
  openClaims(): void {
    if (this.claimWindow) return;
    this.claimWindow = true;
    this.claimsChanged();
  }

  closeClaims(): void {
    if (!this.claimWindow) return;
    this.claimWindow = false;
    this.claimsChanged();
  }

  /**
   * A device pressed confirm. Seat it, if there is a seat to give it.
   *
   * "Whoever presses first claims" (q65), made total: a seat left waiting by
   * an unplugged pad is filled before an empty one, so the rejoin case and
   * the first-claim case are the same press. A device that already holds a
   * seat is a no-op rather than a re-seat — the player leaning on A to
   * confirm something else must not shuffle the couch.
   */
  claimPress(device: DeviceId): boolean {
    const seat = this.seatToClaim(device);
    if (seat === null) return false;

    this.claims.set(device, seat);
    this.awaiting.delete(seat);
    this.afterSeatChange();
    return true;
  }

  /**
   * Would a confirm from this device seat somebody, right now? — M25 Phase 5.
   *
   * **The question the join panel has to ask before it lets the browser turn
   * the same press into a button click.** Enter on a focused control is a
   * click and a claim at the same time, and one of the two has to give way;
   * which one depends entirely on whether the press is going to claim
   * anything, so the panel asks the only thing that knows.
   *
   * It shares `seatToClaim` with `claimPress` rather than restating its
   * conditions, and that is the whole reason it exists as a method here
   * instead of as an expression in `app/Game.ts`: a suppression rule that
   * agreed with the claim rule *today* would be a suppression rule that
   * silently stopped agreeing. The most visible way it could go wrong is an
   * open window with no seat left to fill — which a mid-ride pad rejoin
   * leaves behind, because nothing closes that window — where a keyboard
   * holding no seat would otherwise have had Enter swallowed in every menu
   * for the rest of the session.
   */
  wouldClaim(device: DeviceId): boolean {
    return this.seatToClaim(device) !== null;
  }

  /** Which seat a confirm from this device would take, or `null` for none. */
  private seatToClaim(device: DeviceId): number | null {
    if (!this.claimWindow) return null;
    if (this.claims.has(device)) return null;
    return this.nextSeatToFill();
  }

  private nextSeatToFill(): number | null {
    let waiting: number | null = null;
    for (const seat of this.awaiting) {
      if (waiting === null || seat < waiting) waiting = seat;
    }
    if (waiting !== null) return waiting;

    const taken = new Set(this.claims.values());
    for (let seat = 0; seat < this.states.length; seat += 1) {
      if (!taken.has(seat)) return seat;
    }
    return null;
  }

  /**
   * Release a seat's device, from the panel's Unclaim.
   *
   * The seat's own input is cleared with it: a device unclaimed mid-push
   * would otherwise leave its last stick reading held on a seat nothing is
   * writing to any more, which is `clearDevice`'s original reason one level
   * up.
   */
  unclaim(seat: number): boolean {
    let released: DeviceId | null = null;
    for (const [device, at] of this.claims) {
      if (at === seat) released = device;
    }
    const wasAwaiting = this.awaiting.delete(seat);
    if (released === null) {
      if (wasAwaiting) this.claimsChanged();
      return wasAwaiting;
    }
    this.claims.delete(released);
    this.stateFor(seat).clearDevices();
    this.afterSeatChange();
    return true;
  }

  /**
   * Swap the seats of the claimed devices, from the panel's Swap.
   *
   * Written as a reversal of the claimed seats in seat order rather than as
   * "exchange the two", so it stays meaningful the day a third seat exists
   * instead of throwing or silently doing half the job. With two devices it
   * is the exchange the panel offers.
   */
  swap(): boolean {
    const claimed = [...this.claims.entries()].sort((a, b) => a[1] - b[1]);
    if (claimed.length < 2) return false;
    for (let i = 0; i < claimed.length; i += 1) {
      const [device] = claimed[i];
      const [, seat] = claimed[claimed.length - 1 - i];
      this.claims.set(device, seat);
    }
    // Every swapped seat is cleared, for `unclaim`'s reason and one more: the
    // two riders have exchanged bodies, and a throttle held by the pad that
    // was seat 0's must not carry over into seat 1's first step.
    for (const [, seat] of claimed) this.stateFor(seat).clearDevices();
    this.pointKeyboard();
    this.claimsChanged();
    return true;
  }

  /**
   * Forget every claim — the end of a couch session.
   *
   * Back to rule 1: every device cooperates on seat 0 again, which is the
   * single-player game and not a special case of it.
   */
  clearClaims(): void {
    if (this.claims.size === 0 && this.awaiting.size === 0) return;
    this.claims.clear();
    this.awaiting.clear();
    for (const state of this.states) state.clearDevices();
    this.pointKeyboard();
    this.claimsChanged();
  }

  /**
   * A device has gone. Returns the seat left waiting, or null if nobody was
   * holding it.
   *
   * The claim is released and the *seat* is remembered (rule 2). Releasing
   * the device id is what lets a different pad — a replacement, or the same
   * one re-enumerated into another slot, which is what a re-plug usually
   * looks like — rejoin by pressing a button rather than by matching an
   * identity the player cannot see.
   */
  noteDeviceLost(device: DeviceId): number | null {
    const seat = this.claims.get(device);
    if (seat === undefined) return null;
    this.claims.delete(device);
    this.awaiting.add(seat);
    this.afterSeatChange();
    return seat;
  }

  /** The device holding a seat, or null while it is empty or waiting. */
  deviceFor(seat: number): DeviceId | null {
    for (const [device, at] of this.claims) if (at === seat) return device;
    return null;
  }

  /** The seat a device holds, or null if it holds none. */
  seatFor(device: DeviceId): number | null {
    return this.claims.get(device) ?? null;
  }

  /** Whether this seat is waiting for a device to come back (rule 2). */
  isAwaiting(seat: number): boolean {
    return this.awaiting.has(seat);
  }

  /**
   * The lowest seat waiting for a device, or null while none is.
   *
   * The lowest rather than the most recent, so the status line and
   * claim-by-press name the same seat: two pads dying in the wrong order must
   * not have the screen asking for one and the next press filling the other.
   */
  get awaitingSeat(): number | null {
    let lowest: number | null = null;
    for (const seat of this.awaiting) {
      if (lowest === null || seat < lowest) lowest = seat;
    }
    return lowest;
  }

  /** Every seat's device, indexed by seat. `null` for empty *and* waiting. */
  claimList(): readonly (DeviceId | null)[] {
    return this.states.map((_state, seat) => this.deviceFor(seat));
  }

  // -------------------------------------------------------------------------
  // Lifecycle — the M9 input-reset contracts, applied to every seat
  // -------------------------------------------------------------------------

  /**
   * The layout-change reset (master starter 8.2), for every seat.
   *
   * Every seat, because the window moved under both players' hands. Written
   * as a loop rather than as seat 0 plus a note, which is the shape the whole
   * of Phase 4 is: a contract that held for the player holds for each rider.
   */
  clearDevices(): void {
    for (const state of this.states) state.clearDevices();
  }

  /** Focus loss and visibility hiding: everything, for every seat. */
  clearAll(): void {
    for (const state of this.states) state.clearAll();
  }

  /** Hand the axes back to the devices, for every seat. */
  clearScripted(): void {
    for (const state of this.states) state.clearScripted();
  }

  /** Drop buffered one-shots without touching held state, for every seat. */
  clearPending(): void {
    for (const state of this.states) state.clearPending();
  }

  /**
   * **Takes no device since M25 Phase 5 QA.** It used to re-point the keyboard
   * only for the keyboard's own claim, which was right while the callback
   * carried nothing but a sink — the sink cannot move unless the keyboard
   * moved. It now also carries `keyboardRides`, and *that* changes when
   * somebody else's pad takes a seat, so there is no seat change the keyboard
   * layer can be left out of. `setSink` early-returns on an unchanged state,
   * so the extra calls cost a comparison.
   */
  private afterSeatChange(): void {
    this.pointKeyboard();
    this.claimsChanged();
  }

  private pointKeyboard(): void {
    this.options.onKeyboardSeat?.(this.stateFor(this.keyboardSeat), this.keyboardRides);
  }

  private claimsChanged(): void {
    this.options.onClaimsChange?.();
  }
}
