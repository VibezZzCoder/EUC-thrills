/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The chase room's two cards, as words — M39 Part P (`docs/PLANS.md`
 * §39.6b.3b "Sound, HUD, card, records", q222, q225, q227; the solo face's
 * card lines from §39.6b.3 and q213).
 *
 * **Pure builders, no DOM.** `app/Game.ts` reads `ChaseRoomState` and
 * `ChaseRoomResult` (`simulation/chase.ts`) and resolves each outlaw index to
 * the seat riding it and that seat's roster name; this file owns every word
 * the room is then told. It is M12 Phase 4's split once more — the composition
 * root knows who is where, the screen knows what a row says — and it is why
 * the room card and the results card can be pinned by `node --test` instead of
 * by a four-pane browser spec.
 *
 * Two surfaces read these:
 *
 *   - **the room card** (`chaseRoomCard` → `IdlePane.setChaseRoom`), the
 *     three-seat couch's empty quadrant, read at a glance while the round runs;
 *   - **the results card** (`chaseRoomResults` → `Menus.setResults`), one card
 *     over every pane like the fight's and the race's (§9o's N-way card).
 *
 * The solo card stays `Game.buildChaseResults`; it takes two lines from here
 * (`CHASE_TOUCH_NOTE`, `oneCopBestNote`) so the words it shares with the room
 * are written once.
 */

import { COP_CHARACTER } from '../data/riders.ts';
import type { OutlawStatus } from '../simulation/chase.ts';
import { formatChaseClock, formatRunTime } from './hudModel.ts';
import type { IdlePaneRow } from './idlePane.ts';
import type { ResultsRow, ResultsTable, ResultsView } from './menus.ts';

// -- Inputs Game fills --------------------------------------------------------

/**
 * One outlaw as the room's cards need him — one per outlaw index k, in outlaw
 * order (the order is not the ranking; the builders rank).
 *
 * `status`, `survived` and `place` are the referee's own
 * (`ChaseRoomState.outlaws[k]` while the round runs, `ChaseRoomResult.outlaws[k]`
 * at the end). `seat` and `name` are Game's map: the seat index riding outlaw
 * k, and `characterSpec(seat.character).name`.
 */
export interface ChaseCardOutlaw {
  /** 0-based seat index of the human riding this outlaw. */
  readonly seat: number;
  /** His roster name, whole — the cards read standing still abbreviate nothing (§9o). */
  readonly name: string;
  readonly status: OutlawStatus;
  /** Seconds standing: `endedAt ?? elapsed` while running, the referee's `survived` at the end. */
  readonly survived: number;
  /** 1-based shared place (q86), 0 while the round runs. */
  readonly place: number;
}

/**
 * The cop slot as the room's cards need it (q215, q227).
 *
 * One slot whatever fills it: a human seat, or a CPU pack of
 * `cpuPackSize(outlaws, false)` identical Dorkinses (q211 — the force, not
 * three characters), so the busts are summed over every pursuer in the slot.
 */
export interface ChaseCardCop {
  /** The seat holding Officer Dorkins (`seatRole(...) === 'cop'`), or −1 for the CPU pack. */
  readonly seat: number;
  /** Σ `PursuerState.busts` (or `ChaseRoomResult.pursuers[p].busts`) over the slot. */
  readonly busts: number;
}

/** The room card's input — `ChaseRoomState`, resolved to seats (`IdlePane.setChaseRoom`). */
export interface ChaseRoomCardView {
  readonly phase: 'idle' | 'countdown' | 'running' | 'ended';
  /** `ChaseRoomState.remaining`. */
  readonly remaining: number;
  readonly outlaws: readonly ChaseCardOutlaw[];
  readonly cop: ChaseCardCop;
}

/** The room results card's input — `ChaseRoomResult`, resolved to seats. */
export interface ChaseRoomResultsInput {
  /** `ChaseRoomResult.seconds`: the room clock at the end. */
  readonly seconds: number;
  /** `ChaseRoomResult.bellSeconds`: the bell the round was held to (q217). */
  readonly bellSeconds: number;
  /** `ChaseRoomResult.swept`: every outlaw down before the bell. */
  readonly swept: boolean;
  /** `ChaseRoomResult.escaped`: outlaws standing at the bell. */
  readonly escaped: number;
  readonly outlaws: readonly ChaseCardOutlaw[];
  readonly cop: ChaseCardCop;
  /** The route's seed when the world is a fresh route (`levelId === 'generated'`), else ''. */
  readonly seed: string;
}

// -- Shared words -------------------------------------------------------------

/**
 * The touch note — §39.6b.3's wording, for the solo card and the room's.
 *
 * "An officer" rather than a name since Part P, because the solo face has
 * three of them and the player may not know which one he rode into; M24's
 * rule (touching a cop is an instant bust) is unchanged.
 */
export const CHASE_TOUCH_NOTE = 'You touched an officer — that is an instant bust';

/** The room's note, in the words every other couch card uses (§9o). */
export const COUCH_CHASE_NOT_SAVED = 'Couch chases are not saved';

/**
 * The q213 line: the old one-cop best, shown and never compared.
 *
 * A pre-Part-P best was ridden against one Dorkins and cannot be compared
 * with a run against three (q208), so the solo card's figures read the
 * three-cop best and this one note keeps the old row visible: `Best against
 * one cop: 5:00.00, escaped`. Null when there is no such best, so the card
 * carries no line at all — the notes slot is `ResultsView.notes`, and Game
 * pushes this after the diagnostic/persistence notes and before the outcome
 * notes. `formatRunTime` because the card's own `Best on this route` row
 * spells a best that way, and two spellings of one kind of number on one card
 * is the defect §9k keeps finding.
 */
export function oneCopBestNote(
  best: { readonly seconds: number; readonly escaped: boolean } | null,
): string | null {
  if (best === null) return null;
  return `Best against one cop: ${formatRunTime(best.seconds)}${best.escaped ? ', escaped' : ''}`;
}

/** The cop's own name on a card — q227: whose hands, or the CPU's. */
export function chaseCopLabel(cop: ChaseCardCop): string {
  return cop.seat >= 0 ? `${COP_CHARACTER.name} (P${cop.seat + 1})` : `${COP_CHARACTER.name} (CPU)`;
}

/** One through three, spelled — the room holds at most three outlaws (`CHASE.roomSize − 1`). */
const COUNT_WORDS: readonly string[] = Object.freeze(['No', 'One', 'Two', 'Three']);

/**
 * The room's verdict, without the time — the room card's title at the end and
 * the head of the results headline.
 *
 * - **Every outlaw down, all of them busted:** `Officer Dorkins busted
 *   everyone` (q217: the cop wins by sweeping before the bell), or
 *   `Officer Dorkins busted <name>` when there was only one of him (q228's
 *   1v1), for the escape's own reason below (QA r2).
 * - **Every outlaw down, but somebody gave up or strayed:** `Nobody got away`.
 *   A sweep the cop did not make whole is still his win on the headline, but
 *   the sentence must not credit him with a bust the referee gave nobody
 *   (q225).
 * - **Everyone standing at the bell:** `Everyone got away`, or the outlaw's
 *   own name when there was only one of him (q228's 1v1), because "everyone"
 *   is one person there.
 * - **Otherwise:** `Two outlaws got away`, the plan's own words.
 */
export function chaseRoomVerdict(
  outlaws: readonly ChaseCardOutlaw[],
  cop: ChaseCardCop,
  escaped: number,
): string {
  if (escaped <= 0) {
    if (cop.busts >= outlaws.length && outlaws.length > 0) {
      // q228's 1v1: "everyone" is one person there — the escape branch's own rule.
      return outlaws.length === 1
        ? `${COP_CHARACTER.name} busted ${outlaws[0].name}`
        : `${COP_CHARACTER.name} busted everyone`;
    }
    return 'Nobody got away';
  }
  if (escaped >= outlaws.length) {
    return outlaws.length === 1 ? `${outlaws[0].name} got away` : 'Everyone got away';
  }
  const count = COUNT_WORDS[escaped] ?? `${escaped}`;
  return `${count} ${escaped === 1 ? 'outlaw' : 'outlaws'} got away`;
}

/**
 * The room's ranking — outlaws by time standing, the escaped sharing first
 * place (q86), seat order the stated display tie-break (§9o's own words for
 * the race and the fight).
 *
 * The referee's `place` is used whenever it is set. A zero (a card drawn
 * before the referee has swept its places) is ranked here by the same rule the
 * referee applies, so a caller that hands the state over one step early still
 * gets an honest order rather than a column of zeroes.
 */
export function rankChaseOutlaws(outlaws: readonly ChaseCardOutlaw[]): { readonly place: number; readonly outlaw: ChaseCardOutlaw }[] {
  const score = (outlaw: ChaseCardOutlaw): number =>
    outlaw.status === 'escaped' || outlaw.status === 'standing' ? Number.POSITIVE_INFINITY : outlaw.survived;
  const placed = outlaws.map((outlaw) => {
    if (outlaw.place > 0) return { place: outlaw.place, outlaw };
    const mine = score(outlaw);
    let ahead = 0;
    for (const other of outlaws) if (score(other) > mine) ahead += 1;
    return { place: ahead + 1, outlaw };
  });
  return placed.sort((a, b) => a.place - b.place || a.outlaw.seat - b.outlaw.seat);
}

// -- The room card (the three-seat idle quadrant) -----------------------------

/**
 * One outlaw's line on the room card: his state and the time that goes with
 * it. `Riding · 2:14` is the clock he has survived so far; every other state
 * is the moment it ended. `formatChaseClock`, whole seconds, so the card
 * changes at most once a second (`IdlePane.setCard` writes only on change).
 */
function roomCardState(outlaw: ChaseCardOutlaw): string {
  const at = formatChaseClock(outlaw.survived);
  switch (outlaw.status) {
    case 'standing': return `Riding · ${at}`;
    case 'escaped': return `Got away · ${at}`;
    case 'gaveUp': return `Gave up · ${at}`;
    case 'strayed': return `Out of bounds · ${at}`;
    // Caught and touched are both a bust (M24's touch rule); how is the
    // results card's detail, not the scoreboard's.
    default: return `Busted · ${at}`;
  }
}

/**
 * The room card — M39 Part P (§39.6b.3b: "the clock, every outlaw's state and
 * time, the cop's busts").
 *
 * The three-seat quadrant's fourth use, on `setMatchStandings`' own argument:
 * each pane's lane is written from that seat's point of view, and this is the
 * room's. Titles by phase, as the fight's card has them:
 *
 *   - **countdown** (and idle) — `Getting ready`;
 *   - **running** — `4:12 left`, the bell's deadline, ceiled like every
 *     deadline on screen;
 *   - **ended** — the verdict (`chaseRoomVerdict`), without the time the
 *     results card will carry.
 *
 * Rows in seat order while the round runs — a list that re-sorted itself as
 * outlaws went down would be rows changing places in a card somebody glances
 * at (§9o) — and in the referee's shared places once it has ended, where the
 * ranking is the point. The cop's row is last, named per q227.
 *
 * The caller mutes the card's announcer exactly as the fight does
 * (`IdlePane.setAnnouncing(false)`): a clock row that changes every second in
 * a polite live region would be read aloud every second.
 */
export function chaseRoomCard(view: ChaseRoomCardView): { readonly title: string; readonly rows: readonly IdlePaneRow[] } {
  const ended = view.phase === 'ended';
  const escaped = view.outlaws.filter((outlaw) => outlaw.status === 'escaped').length;
  const title = ended
    ? chaseRoomVerdict(view.outlaws, view.cop, escaped)
    : view.phase === 'running'
      ? `${formatDeadlineClock(view.remaining)} left`
      : 'Getting ready';
  const order = ended
    ? rankChaseOutlaws(view.outlaws)
    : [...view.outlaws]
      .sort((a, b) => a.seat - b.seat)
      .map((outlaw) => ({ place: 0, outlaw }));
  const rows: IdlePaneRow[] = order.map(({ place, outlaw }) => ({
    label: ended ? `${place}. ${outlaw.name}` : outlaw.name,
    value: roomCardState(outlaw),
  }));
  rows.push({
    label: chaseCopLabel(view.cop),
    value: `Busts ${view.cop.busts} of ${view.outlaws.length}`,
  });
  return { title, rows };
}

/** `formatDeadline`'s ceiling, for the running title (a deadline never reads zero early). */
function formatDeadlineClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
  return formatChaseClock(safe);
}

// -- The results card (q222) --------------------------------------------------

/**
 * The room card's table, in the chase's own words (M26 Phase 6's lesson).
 *
 * `Place` over a row header that is place and rider in one (`1. Trollina`,
 * §9o's convention; the Rider column is not separately headed), `Time` — how
 * long he stood, the referee's `survived` — and a fourth column, `Result`,
 * saying how it ended. The comparison column stays empty and zero-width: a
 * couch compares nothing (§9k), and `data-compare` false is what the
 * stylesheet's four-row tier keys off (§9o, "a fourth row is a fit problem").
 */
export const CHASE_ROOM_TABLE: ResultsTable = Object.freeze({
  caption: 'Chase summary',
  label: 'Place',
  value: 'Time',
  delta: '',
  extra: 'Result',
});

/**
 * How one outlaw's round ended, in the Result column — with who busted him
 * (q222), or `Gave up` (q225).
 *
 * **`Dorkins`, not `Officer Dorkins`**, and the reason is a measurement: the
 * fourth column is a third of a 38rem card (≈ 160 px of text), and `Busted by
 * Officer Dorkins` is ≈ 210 px of bold figure type — a wrapped cell is a
 * taller row on the card whose fourth-row fit is already tiered (§9o). The
 * headline and the cop's own row carry the full name; this is the same
 * officer, said short where the column is narrow.
 */
function resultCell(outlaw: ChaseCardOutlaw): string {
  switch (outlaw.status) {
    case 'escaped': return 'Got away';
    case 'gaveUp': return 'Gave up';
    case 'strayed': return 'Out of bounds';
    case 'touched': return 'Touched Dorkins';
    case 'caught': return 'Busted by Dorkins';
    // A standing outlaw on a results card is a caller handing the state over
    // before the bell swept it; say what is true rather than invent an end.
    default: return 'Riding';
  }
}

/**
 * The room's results card — M39 Part P (q222, q225, q227).
 *
 * One card over every pane, the fight's and the race's shape (§9o):
 *
 *   - **The headline is the room's verdict** — `Officer Dorkins busted
 *     everyone — 3:12` (the sweep's moment, floored), `Two outlaws got away`,
 *     `Everyone got away`. No partial credit on the headline (§39.6b.3b); the
 *     cop's row carries his.
 *   - **The two summary figures are the rules the round was held under**, as
 *     the race's (`Laps`, the winner's clock) and the fight's (`Riders`,
 *     `Knockdowns to win`) are: `Outlaws` and `To survive`, the bell.
 *   - **Rows: the outlaws ranked by time standing, the escaped sharing first
 *     place** (q86, no tie-break invented — seat order is display only), each
 *     with how he went out; **then the cop's row**, `Officer Dorkins (P3)` for a
 *     human (q227) or `Officer Dorkins (CPU)` for the pack, the round's time and
 *     `Busted 2 of 3`.
 *   - **Notes:** the route seed on a fresh route, and `Couch chases are not
 *     saved` — `finishChase` files nothing for a couch (`Game.couchSession`).
 *     A touch is said in its row (`Touched Dorkins`), not in a third note.
 *
 * "You" is not a word this card can say: it is one card over every pane, and
 * four people read it at once. Every seat wears a distinct rider (q68), so the
 * rider's name on each row *is* that seat's mark, and the one row whose name
 * does not say who holds it — Officer Dorkins — says so in brackets (q227).
 *
 * `isRecord` false and no delta: nothing is compared (§9k).
 */
export function chaseRoomResults(input: ChaseRoomResultsInput): ResultsView {
  const verdict = chaseRoomVerdict(input.outlaws, input.cop, input.escaped);
  // The sweep's moment belongs on the headline because it is the cop's whole
  // score; a round that ran to the bell ended at the bell, which the summary
  // figure already says.
  const heading = input.escaped <= 0 ? `${verdict} — ${formatChaseClock(input.seconds)}` : verdict;

  const rows: ResultsRow[] = rankChaseOutlaws(input.outlaws).map(({ place, outlaw }) => ({
    label: `${place}. ${outlaw.name}`,
    time: formatRunTime(outlaw.survived),
    delta: '',
    extra: resultCell(outlaw),
    ahead: outlaw.status === 'escaped',
  }));
  rows.push({
    label: chaseCopLabel(input.cop),
    time: formatRunTime(input.seconds),
    delta: '',
    extra: `Busted ${input.cop.busts} of ${input.outlaws.length}`,
    ahead: input.escaped <= 0,
  });

  // **Two notes at most, and no touch line** — measured, not preferred. The
  // four-row card with the fourth column and a five-offer chooser is the
  // tallest panel in the game, and a third note is 18 px of it (1000 x 560,
  // DESIGN §9q; P6 notes in `docs/M39_CHASE.md`). The Result cell already says `Touched
  // Dorkins`, which is the fact; the solo card's sentence explaining the rule
  // (`CHASE_TOUCH_NOTE`) is for a player alone with a heading that says only
  // `Busted`.
  const notes: string[] = [];
  if (input.seed !== '') notes.push(`Route seed ${input.seed}`);
  notes.push(COUCH_CHASE_NOT_SAVED);

  return {
    heading,
    isRecord: false,
    totalCaption: 'Outlaws',
    bestCaption: 'To survive',
    total: `${input.outlaws.length}`,
    best: formatChaseClock(input.bellSeconds),
    deltaToBest: '',
    ahead: false,
    table: CHASE_ROOM_TABLE,
    rows,
    notes,
  };
}
