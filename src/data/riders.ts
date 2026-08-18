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

/**
 * Every rider the game ships, as an id the store and the URL can carry.
 *
 * **`cop` is in this union and deliberately not in `CHARACTERS`** — M18. He is
 * a rider in every sense the renderer cares about (a look, a rig, a crash
 * voice) and is not a rider the *player* may be, so the two lists part company
 * here for the first time: `CHARACTERS` is the roster the chooser walks and the
 * options store coerces against, and this union is every look that exists.
 * Folding him into the roster would put "Officer Dorkins" on the rider-select
 * screen and, worse, would make him a legal saved value in `GameOptions` — a
 * player who picked him once would be the cop in free ride forever.
 */
export type CharacterId = PlayableCharacterId | 'cop';

/**
 * The riders the player may actually be.
 *
 * Its own type rather than a runtime filter, so a screen that has to describe
 * every choosable rider — `ui/menus.ts`' portrait table — still fails to
 * compile when a rider is added and it is not, while remaining unable to
 * describe the cop it must never offer. `GameOptions.character` is this type
 * for the same reason: a saved record can no longer *say* `cop` even in
 * principle.
 */
export type PlayableCharacterId = 'cool-rider' | 'trollina' | 'red-rider' | 'adonisb2';

/**
 * Which recorded crash one-shot a rider comes with.
 *
 * Kept separate from `CharacterId` on purpose: `src/audio/` may never import
 * from `data/riders.ts` or anywhere else in the app, so the audio layer
 * declares its own `CrashVoiceId` and this field is the map between the two.
 * Two riders could legitimately share a voice; a rider without one could not.
 */
export type CrashVoiceId = 'cool-rider' | 'trollina' | 'red-rider' | 'adonisb2';

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
 * A rider the chooser may offer — a `CharacterSpec` narrowed at its id.
 *
 * The narrowing is what lets `ui/menus.ts` index its portrait table by
 * `character.id` and still fail to compile when a rider is added without one.
 */
export interface PlayableCharacterSpec extends CharacterSpec {
  readonly id: PlayableCharacterId;
}

/**
 * Cool Rider first, and that ordering is load-bearing rather than alphabetical:
 * he is the default, he is what a new player rides, and the chooser reads
 * left-to-right.
 */
export const CHARACTERS: readonly PlayableCharacterSpec[] = Object.freeze([
  Object.freeze({
    id: 'cool-rider' as PlayableCharacterId,
    name: 'Cool Rider',
    blurb: 'Black moto gear, reflective blue, full-face lid. Rides like he has nothing to prove.',
    swatch: '#2f7fe8',
    crashVoice: 'cool-rider' as CrashVoiceId,
  }),
  Object.freeze({
    id: 'trollina' as PlayableCharacterId,
    name: 'Trollina',
    blurb: 'Wild magenta hair, a skater dress over black tights, knee pads and a grin. '
      + 'Started life as a joke drawing and refused to leave.',
    swatch: '#ff3fb4',
    crashVoice: 'trollina' as CrashVoiceId,
  }),
  /**
   * Red Rider — M19, and the one rider in this table who is a **real person**.
   *
   * He asked to be in the game and the owner said yes, both in public; the
   * permission evidence, the reference photograph and the stills of his own
   * customized wheel are held under `references/red-rider/` and are excluded
   * from every build. `NOTICE.md` records him as represented **with his
   * permission** rather than as an original creation, which is the one line
   * that separates him from the two entries above.
   *
   * Nothing about that changes what this table is allowed to hold. He is a
   * look and a crash voice like anybody else here, he is bit-identical to ride
   * (§13 q3), and the swatch below is a card colour rather than an albedo —
   * `BLOCKOUT_COLOURS.redRider*` are the values the sun actually falls on, and
   * they are deeper than this for the reasons written beside them.
   */
  Object.freeze({
    id: 'red-rider' as PlayableCharacterId,
    name: 'Red Rider',
    blurb: 'Gloss red lid, dark visor, red over black armour, and a wheel he built to match. '
      + 'A real rider, in the game because he asked.',
    swatch: '#e03a3a',
    crashVoice: 'red-rider' as CrashVoiceId,
  }),
  /**
   * Adonisb2 — M22, and the second **real person** in this table.
   *
   * Where Red Rider was asked-and-agreed in public, this rider *initiated*: he
   * messaged the owner asking to have his avatar added so he could share the
   * game, supplied the reference photograph, chose this name himself when
   * asked — the spelling is exactly what he typed (`docs/PLANS.md` §22.1) —
   * and uploaded EUC recordings to Freesound for the project's use. The
   * permission evidence lives under `references/guest-rider/` and is excluded
   * from every build; `NOTICE.md` gains his entry in M22 Phase 4.
   *
   * **His crash is his own fall.** M22 Phase 3, and it took the fork §22.8
   * listed last rather than first: the Freesound upload was still in
   * moderation, so the owner asked him directly and he sent the files — a
   * narrow grant for this game, recorded in `NOTICE.md`. What ships is 3.4 s
   * of that recording, cut and levelled by `tools/make-crash-adonisb2.mjs`,
   * with nothing removed, substituted or generated. He is the first rider here
   * whose crash is a recording of *him* crashing.
   *
   * The swatch is a card colour, not an albedo: the values the sun falls on
   * are `BLOCKOUT_COLOURS.adonisb2*`, picked with the neon-green ACES caveat
   * written beside them.
   */
  Object.freeze({
    id: 'adonisb2' as PlayableCharacterId,
    name: 'Adonisb2',
    blurb: 'Black kit under big neon-green guards, a mirrored visor, and a wheel that glares back. '
      + 'A real rider, in the game so he could share it.',
    swatch: '#72ec16',
    crashVoice: 'adonisb2' as CrashVoiceId,
  }),
]);

/**
 * Officer Dorkins — M18's chase cop, and the one character nobody may pick.
 *
 * The name and the look are the owner's answer to `docs/PLANS.md` §13 q23
 * (2026-08-13), taken from a reference image he states is AI-generated and
 * original: **not a real officer, and no real force's insignia**. What the
 * build takes from it is a palette and a read — white helmet, hi-vis yellow
 * over navy, a blue-and-white chequer band, navy shorts, black knee pads. The
 * chequer is the generic police-marking idiom rather than anybody's mark, and
 * the badge is an original shape (`AGENTS.md`, "Use fictional manufacturers and
 * original designs").
 *
 * He carries a `swatch` and a `blurb` like the others because the results
 * screen and the chase entrance name him, not because a card exists to click.
 * The crash voice is Cool Rider's until dedicated lines exist, which q23
 * explicitly allows.
 */
export const COP_CHARACTER: CharacterSpec = Object.freeze({
  id: 'cop' as CharacterId,
  name: 'Officer Dorkins',
  blurb: 'Hi-vis over navy, white lid, moustache, and a paddle. '
    + 'Believes the road is for going the speed limit on.',
  swatch: '#ffd83d',
  crashVoice: 'cool-rider' as CrashVoiceId,
});

/**
 * Every look the renderer can build, playable or not.
 *
 * `render/renderCost.ts` measures this list rather than `CHARACTERS`: a budget
 * that never measured the cop would be a budget that does not know about the
 * mode it has to survive.
 */
export const ALL_CHARACTERS: readonly CharacterSpec[] =
  Object.freeze([...CHARACTERS, COP_CHARACTER]);

export const CHARACTER_IDS: readonly PlayableCharacterId[] =
  Object.freeze(CHARACTERS.map((character) => character.id));

export const DEFAULT_CHARACTER: PlayableCharacterId = 'cool-rider';

/**
 * Look a rider up, falling back to the default rather than throwing.
 *
 * The fallback is not defensiveness: a saved options record is hostile input
 * (`app/options.ts` coerces every field on the way in), and a rider id that
 * came out of a browser store belonging to an older build has to resolve to
 * *somebody* or the game boots to no rider at all.
 */
export function characterSpec(id: CharacterId): CharacterSpec {
  return ALL_CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}

/**
 * Is this a rider the player may choose?
 *
 * The one predicate that keeps the cop out of the chooser and out of the saved
 * options record. `app/options.ts` coerces against `CHARACTER_IDS`, which is
 * the same answer said as a list; this exists so a call site that has an id
 * rather than a list can ask the question in one word.
 */
export function isPlayableCharacter(id: CharacterId): id is PlayableCharacterId {
  return (CHARACTER_IDS as readonly CharacterId[]).includes(id);
}
