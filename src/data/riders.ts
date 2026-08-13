/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The roster — who the player can ride as, as plain data.
 *
 * **This file exists because a second rider does.** `src/app/appState.ts` has
 * carried a note since 2026-08-05 saying a rider-select state "returns when a
 * second rider does"; Trollina is that second rider, and this is the table both
 * the chooser and the renderer read.
 *
 * Three rules bound what may live here, and all three come from AGENTS.md:
 *
 *   - **Plain data, no `three`.** `data/` is imported by `simulation/`, and
 *     invariant 1 forbids a `three` import reaching that layer. So this file
 *     holds ids, names, prose and CSS colours; the *geometry* of a look lives
 *     in `render/riderLook.ts`, which may import the blockout kit, and the
 *     albedo values live with every other colour in `data/tuning.ts`.
 *   - **Appearance only.** A rider is a look and a crash voice. Nothing here
 *     is a physical quantity, nothing here reaches `simulation/`, and the two
 *     riders are bit-identical to ride. That is what lets the choice live in
 *     `GameOptions` at all without breaching the options firewall (invariant 5)
 *     — see the note beside `GameOptions.character`.
 *   - **A rider is not level identity.** The choice never enters a `LevelPlan`
 *     id, a `RouteRecord`, or an encoded ghost. A personal best records *where*
 *     a run happened, not who was on the wheel, and folding a rider into that
 *     key would orphan every existing time the first time somebody switched.
 *
 * If a rider ever needs to *ride* differently, none of the above holds and it
 * is not a change to this file: a physical quantity belongs in `data/tuning.ts`
 * where it is the same for every player, and the owner has to open it
 * (`docs/PLANS.md` §13 q3).
 */

/** Every rider the game ships, as an id the store and the URL can carry. */
export type CharacterId = 'cool-rider' | 'trollina';

/**
 * Which recorded crash one-shot a rider comes with.
 *
 * Kept separate from `CharacterId` on purpose: `src/audio/` may never import
 * from `data/riders.ts` or anywhere else in the app, so the audio layer
 * declares its own `CrashVoiceId` and this field is the map between the two.
 * Two riders could legitimately share a voice; a rider without one could not.
 */
export type CrashVoiceId = 'cool-rider' | 'trollina';

export interface CharacterSpec {
  readonly id: CharacterId;
  /** The name shown on the title screen and the chooser. */
  readonly name: string;
  /** One line under the name. Says who they are, not what they do. */
  readonly blurb: string;
  /**
   * The character's own colour, as a CSS value for the chooser's card.
   *
   * **Not `--accent`.** That token is simultaneously the primary button fill,
   * the word THRILLS, and the global focus ring (`DESIGN.md` §9), so rebinding
   * it per rider would recolour focus itself. These become their own tokens.
   * The albedo the *renderer* uses is a separate value in
   * `BLOCKOUT_COLOURS` — a card swatch is lit by nothing and a rider is lit by
   * the sun, so the two are picked against different backgrounds and are never
   * the same number.
   */
  readonly swatch: string;
  readonly crashVoice: CrashVoiceId;
}

/**
 * Cool Rider first, and that ordering is load-bearing rather than alphabetical:
 * he is the default, he is what a new player rides, and the chooser reads
 * left-to-right.
 */
export const CHARACTERS: readonly CharacterSpec[] = Object.freeze([
  Object.freeze({
    id: 'cool-rider' as CharacterId,
    name: 'Cool Rider',
    blurb: 'Black moto gear, reflective blue, full-face lid. Rides like he has nothing to prove.',
    swatch: '#2f7fe8',
    crashVoice: 'cool-rider' as CrashVoiceId,
  }),
  Object.freeze({
    id: 'trollina' as CharacterId,
    name: 'Trollina',
    blurb: 'Wild magenta hair, a skater dress over black tights, knee pads and a grin. '
      + 'Started life as a joke drawing and refused to leave.',
    swatch: '#ff3fb4',
    crashVoice: 'trollina' as CrashVoiceId,
  }),
]);

export const CHARACTER_IDS: readonly CharacterId[] =
  Object.freeze(CHARACTERS.map((character) => character.id));

export const DEFAULT_CHARACTER: CharacterId = 'cool-rider';

/**
 * Look a rider up, falling back to the default rather than throwing.
 *
 * The fallback is not defensiveness: a saved options record is hostile input
 * (`app/options.ts` coerces every field on the way in), and a rider id that
 * came out of a browser store belonging to an older build has to resolve to
 * *somebody* or the game boots to no rider at all.
 */
export function characterSpec(id: CharacterId): CharacterSpec {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}
