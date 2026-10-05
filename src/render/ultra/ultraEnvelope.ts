/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The provisional Ultra envelope — M39 (`docs/M39_ULTRA.md` §5, package W7).
 *
 * **Render-side, never `data/renderCost.ts`.** Contract 1 still governs the
 * ordinary solo/phone frame and Contracts 2–3 the couch; `PART_COSTS` and
 * generator admission never see a number here (invariant 3, PLANS §39.6: a
 * phone that opts into Ultra opts into *this* envelope, and that heavier frame
 * is never reported as passing Contract 1). `src/architecture.test.ts` keeps
 * the word out of `level/`, `simulation/` and the admission data by scan.
 *
 * **Final wave (P-TL, 2026-09-23; A21, A22).** The byte ceilings are
 * re-settled on the honest ledger (the sky's background cube, Fable F3), and
 * the main-chunk ceiling on the measured build (Fable F2); see the two
 * fields' comments and `M39_ULTRA.md` §5.
 *
 * **Settled (U3 stabilizer, 2026-09-23; `M39_ULTRA.md` §5, "Envelope
 * settle").** Each triangle and draw-call ceiling is the lower of §5's
 * provisional value and the measured corpus worst × 1.10, rounded up to the
 * next whole unit — never an arbitrary doubling of an old limit. The corpus
 * is `ultraCost.test.ts`'s: the six worlds §5 names plus `euc-1` … `euc-24`,
 * each on the rung it lands on (every one lands on `ultra-full`, and the test
 * holds that). The worst were `euc-18` (solo 146 calls / 937,354 triangles),
 * every town (33 prop calls), `euc-12` (418,824 prop triangles, so §5's
 * 450,000 is the lower and stays) and `euc-12` again for the far depth render
 * as drawn (21 calls / 226,436 triangles, A16's slot lid included).
 * The first seven fields are the refusal axes (`UltraEnvelopeAxis`); the rest
 * are enforced by `tests/m39-ultra.spec.ts`, by `ultraCost.test.ts` on the
 * model, or reported, as each comment says.
 *
 * **Which axes admission can judge before anything is built.** `judgeUltra`
 * (`ultraCost.ts`) prices six of the seven from the plan and the rung —
 * `soloDraws`, `soloTriangles`, `propDraws`, `propTriangles`, `bytes` (the
 * ledger arithmetic of `ultraTargetBytes`) and `shadowMap`. `programs` is a
 * fact about the compiled scene and only exists after the first Ultra frame,
 * so it is held live by the spec (`renderer.ultraReport().programs ≤ 76`),
 * never guessed at admission.
 */
import type { UltraEnvelopeAxis } from './ultraTypes.ts';

const MIB = 1024 * 1024;

export const ULTRA_ENVELOPE = Object.freeze({
  // -- Refusal axes (`judgeUltra`) -------------------------------------------
  /**
   * Solo frame, model, all passes, full `NON_LEVEL_RESERVE` (144 / 130,236).
   * §5's 190 / 1,100,000, settled to the corpus worst × 1.10: 146 → 161 and
   * 937,354 → 1,031,090. Re-settled 2026-09-23 (M39 Part P, R-1, the q209
   * raise): the solo reserve now wears the pack of three cop trims (+52 calls,
   * +3,618 triangles on every world), so the corpus worst became 198 calls
   * (`euc`; every town reads 198) and 940,972 triangles (`euc-18`), × 1.10
   * rounded up → 218 and 1,035,070. The draw axis is above §5's 190 by the
   * owner's authorised budget raise; the level half of every frame is
   * unchanged. Re-settled 2026-09-24 (M39 Part P QA r2): the reserve now
   * counts the two particle fields live (+2 calls, no triangles), so the
   * corpus worst is 200 calls and × 1.10 → 220; triangles unchanged, and
   * every world's admission is unchanged (its price and the ceiling both
   * moved by the same 2).
   */
  soloDraws: 220,
  soloTriangles: 1_035_070,
  /**
   * The Ultra prop family, colour + shadow. §5's 46 settled to 33 × 1.10 →
   * 37; 418,824 × 1.10 is above §5's 450,000, which stays.
   */
  propDraws: 37,
  propTriangles: 450_000,
  /**
   * Ultra-owned GPU bytes, steady. §5's provisional 200 MiB (near 128 + far
   * 20 + env 6 + sky 10.7 + facade 12 + attributes ≤ 8 ≈ 185 MiB) was
   * amended to 214 MiB (stabilizer, 2026-09-23: far map 3072 and the ground
   * detail maps), and is **re-settled to 244 MiB by A22** (final wave, P-TL,
   * under the coordinator's ≤ 256 MiB authorization): the Fable pass (F3)
   * found the ledger missing three's background cube of the sky, 32 MiB at
   * 1024 a face, colour only now that Ultra builds it without a depth buffer.
   * The model at the judge buffer is near 128 + far 45 + environment 6 + sky
   * 10.67 + sky cube 32 + facade 12 + ground detail 1.67 + attribute budget 8
   * = 255,153,480 B (243.33 MiB); the ceiling is that rounded up to the MiB —
   * never more. A buffer under 2,000,000 px (a phone) models 2048 / 2048
   * maps and ≈ 122.3 MiB (A22, F5).
   */
  bytes: 244 * MIB,
  /** Fixed shipped Full paths and retained High↔Full caches: 76 enumerated
   * source slots (environment R22, 2026-10-03). Includes all existing riders,
   * wheels, shadow/background internals. Runtime-only; admission remains null.
   * Derivation: docs/ENVIRONMENT_UPGRADE.md and frozen R21 program ledger.
   * Arbitrary diagnostic compile histories and activation peaks are separate. */
  programs: 76,
  /** Near shadow map edge, read back after the first frame. */
  shadowMap: 4096,

  // -- Enforced by the spec, by the model's tests, or reported ---------------
  /** Far shadow map edge (only with `farShadow`). 2048 in §5; 3072 by the same amendment as `bytes`. */
  farShadowMap: 3072,
  /**
   * The activation-only far depth render (only with `farShadow`), as drawn.
   * §5's 60 / 450,000, settled to the corpus worst × 1.10: 21 → 24 and
   * 226,436 → 249,080. "As drawn" includes A16's slot lid, the cap bucket
   * drawn once more into the far map on a world with a slot
   * (`ultraBuildings.installUltraSlotFarCaster`), which the model's far pass
   * (the layer-5 set) does not count; `ultraCost.test.ts` bounds the model
   * plus that lid on the whole corpus and measures the lid on the six worlds.
   */
  farDepthDraws: 24,
  farDepthTriangles: 249_080,
  /** PMREM build, activation only: about this many quad draws. */
  pmremDraws: 20,
  /** Steady scene renders per frame: one near shadow + one colour. */
  steadySceneRenders: 2,
  /** No post chain: zero full-screen passes, zero per-frame render targets. */
  fullScreenPasses: 0,
  perFrameTargets: 0,
  /**
   * Switch allocation peak (PMREM ping-pong transient; old map disposed
   * first). §5's 216 MiB was steady + 16; amended with `bytes` to 224 MiB,
   * and re-settled with it by A22 to **254 MiB**: the model's steady
   * (243.33) plus its 10 MiB transient (PMREM ping-pong 6 + the half-float
   * source 4), rounded up to the MiB.
   */
  peakSwitchBytes: 254 * MIB,
  /**
   * The ground and block attribute budget inside `bytes` (§5: "ground/block
   * attributes ≤ 8"). W6 chooses the packing and reports what a built view
   * actually holds (`TerrainView.ultra.bytes`); until a world is built, the
   * model charges this whole budget, which is the conservative direction.
   */
  attributeBytes: 8 * MIB,
  /**
   * Drawing buffer: ≤ the pixel budget **and** ratio ≤ High's; canvas MSAA ≤ 4.
   * §5's 4,096,000 (the Air's native 2560×1600) became **5,184,000** by A26:
   * the retina pair measured Ultra 1.33–1.41× softer than High on the Air's
   * default "looks like 1440×900" mode at 4.1 MP and 1.01–1.04× at 5.18 MP,
   * which is the pixel count High already draws there. Equal to
   * `ULTRA.pixelBudget` by `ultraCost.test.ts`; the map sizes and the byte
   * model are unchanged (both buffers are over A22's 2 MP line).
   */
  drawingBufferPixels: 5_184_000,
  msaaSamples: 4,
  /** Activation (paint + build + PMREM + far + compile), **recorded, report only**. */
  activationTargetMs: 2000,
  /**
   * Code: main chunk growth over the pre-Ultra build, raw bytes; the whole
   * Pages package. §5's +96 KiB was never measured; the Fable pass (F2)
   * measured +170,692 B (+166.7 KiB) with every Ultra module in the main
   * graph, and **A21** kept them there and ruled the ceiling to be the
   * measured growth plus 10 %, rounded up to the KiB, settled once on the
   * quiet final tree. The U4 stabilizer measured +182,884 B (+178.6 KiB), so
   * the ceiling was 197 KiB (201,728 B). A28's code went past it, and the
   * final A28 stabilizer re-settled it once by the same rule on the quiet
   * repaired tree: +203,601 B (+198.8 KiB) measured, so 219 KiB
   * (224,256 B). M39 Part P (the chase rule with two faces) then added
   * 59,110 B to the same main chunk — the instrument prices the whole chunk
   * against the pre-Ultra build — and it was re-settled once more by the same
   * rule on the final Part P tree (2026-09-25, budget raises authorised by the
   * owner): +265,916 B (+259.7 KiB) measured, so **286 KiB (292,864 B)**.
   * `tools/ultra-bundle.mjs` builds and measures it; journey 12 of
   * `tests/m39-ultra.spec.ts` holds it.
   */
  mainChunkGrowthBytes: 286 * 1024,
  pagesPackageBytes: 8 * MIB,
  /** `safetyDemotions` must read 0 in every spec. */
  safetyDemotions: 0,
} satisfies Record<UltraEnvelopeAxis, number> & Record<string, number>);

/**
 * The seven refusal axes, in the order a refusal names the first one
 * breached. The order is the §5 table's, so a world that breaches two axes
 * is refused for the frame before the prop family, and for the prop family
 * before the bytes.
 */
export const ULTRA_ENVELOPE_AXES: readonly UltraEnvelopeAxis[] = Object.freeze([
  'soloDraws',
  'soloTriangles',
  'propDraws',
  'propTriangles',
  'bytes',
  'programs',
  'shadowMap',
]);
