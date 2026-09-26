/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Material,
  Mesh,
  Object3D,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { bootAtTier, bootToTitle, collectErrors } from './harness.ts';
import type { QualityLevel } from '../src/app/options.ts';
import { describeRefusal } from '../src/app/renderTier.ts';
import { PROP_SIZES } from '../src/data/props.ts';
import { RENDER_BUDGET_SPLIT } from '../src/data/renderCost.ts';
import { LIGHTING, ULTRA } from '../src/data/tuning.ts';
import { FOREST_HEIGHTS, FOREST_SHADOW_STAND } from '../src/level/parkDressing.ts';
import { SWITCHBACK_SUN } from '../src/level/switchbackLevel.ts';
import { ULTRA_ENVELOPE } from '../src/render/ultra/ultraEnvelope.ts';
import { EMPTY_FAR_SHADOW_BYTES } from '../src/render/ultra/ultraFarShadow.ts';
import { ultraShadowMapSizesFor } from '../src/render/ultra/ultraShadowSizes.ts';
import type { UltraFaultStage, UltraReport } from '../src/render/ultra/ultraTypes.ts';

/**
 * M39 — Ultra graphics, in a real browser (`docs/M39_ULTRA.md` §6.3 W9,
 * `docs/PLANS.md` §39.6).
 *
 * **What this file is for.** Ultra's maths, lifecycle and wording are proved
 * headlessly — `render/ultra/*.test.ts`, `levelLifecycle.test.ts`,
 * `renderTier.test.ts`, `menus.test.ts`, `ordinaryParity.test.ts`. None of
 * those can see a GPU, a frame, a click or a lost context. The sixteen journeys
 * below are the claims only a browser can settle:
 *
 *   1. a saved Ultra boots Ultra, and the live frame is inside the model and
 *      the model is inside the envelope, at the three core town views and at
 *      Switchback (§5 enforcement layer 4);
 *   2. High → Ultra → High, three times, gives back a byte-identical High
 *      frame, the same rig and a resource plateau (§3.6's browser proof);
 *   3. quality never reaches the simulation: the plan, its digest, the saved
 *      record and ghost are untouched by a tier change, and a 300-step scripted
 *      ride is identical at High, at Ultra and with tier changes mid-ride
 *      (invariant 4);
 *   4. a couch gets ordinary High before its first split frame, with no Ultra
 *      resource in it and no safety demotion; a one-seat remnant stays High;
 *      the session's end gives Ultra back (invariant 11, q201);
 *   5. the title toggle and Settings are one preference with one truth, the
 *      toggle's return-tier memory works, a Settings tier clears Ultra, and a
 *      couch's pause Settings neither offers Ultra nor lets a pad reach it;
 *   6. `?presentation=` says it is overriding and never labels an ordinary
 *      frame Ultra;
 *   7. `?ultrafault=<stage>` lands on High at every stage, says why in the
 *      player's words, and Settings is still there to recover with — and a
 *      build that throws *inside* the Ultra terrain build on a title or
 *      Settings switch leaves the ordinary world standing (Fable F1);
 *   8. a context loss and restore under Ultra comes back lit — the facade and
 *      glass are not black — with no error;
 *   9. the Ultra pixel cap holds through an F4 write, a seat spawn and
 *      despawn, a resize and a world swap (T0, q206 untouched); on a
 *      phone-sized buffer the shadow maps are sized from it (A22, Fable F5);
 *  10. a Settings round trip in the middle of a Trick Run keeps it eligible;
 *  11. no Switchback landing pad is inside a cast shadow under Ultra — the
 *      `m36_4.spec.ts:764` predicate, re-run on Ultra's own built casters;
 *  12. an ordinary boot requests nothing Ultra-only and its ledger reads 0,
 *      and the built main chunk grows within A21's ceiling (Fable F2);
 *  13. on every Ultra kit without a far map — `?ultrakit=-farShadow` and
 *      `ultra-lit`'s kit — the rider, the wheel and the cop are drawn with no
 *      GL error, and a switch between a far-map rung and one without in one
 *      session keeps them drawn (A28, Fable F-A1);
 *  14. a world with nothing on the static layer builds no far map on the full
 *      kit, and every program that declares the far map's shadow sampler — the
 *      ground, the facades, the foliage — is still drawn with no GL error,
 *      before and after a context restore (A28, F-A3);
 *  15. a context loss and restore under Ultra raises no GL error, and the
 *      restored frame is the pre-loss one where the rebuilt resources show —
 *      road and facade in shade (the environment and the far map), the sky
 *      (the background cube), the frame with the sun off — with the PMREM
 *      read back texel for texel; each rebuild planted out, and the old
 *      release order planted back, fails its own check (A28, FE);
 *  16. after a context restore, on every tier, no later path deletes a WebGL
 *      object of the lost context — quality changes both ways, the title, a
 *      rider swap, a couch seat, world swaps, Ultra's exit and re-entry, a
 *      second restore — every frame after them draws, and three's pre-loss
 *      bookkeeping becomes unreachable; with the loss-time release planted
 *      out, the same paths read the old failure (A28 follow-up, CL).
 *
 * **How it looks at the scene.** Ultra meshes keep the ordinary `level-props-*`
 * names (§4), so a name cannot say whether a frame is Ultra. `ultraFootprint`
 * reads what only an Ultra build leaves behind: a `scene.environment`, a near
 * map over 2048, `ultra*` geometry attributes, objects on the static layer 5,
 * materials carrying a per-material patch, relief depth materials and props
 * that receive shadow. Every "ordinary" assertion below is that footprint
 * being empty; every Ultra frame is required to show it (journeys 1 and 2), so
 * the empty reading is never a probe that cannot see.
 *
 * **Pace.** One worker, 1920 × 1080 at DPR 1 (journey 9 alone runs the Air's
 * larger scaled mode, 1680 × 1050 at DPR 2, where A26's 5,184,000 px budget
 * binds, and a phone-sized buffer):
 *
 *     node tools/run-tests.mjs browser tests/m39-ultra.spec.ts --project=chromium --workers=1
 *
 * Nothing here reads a frame interval or a frame rate (`AGENTS.md`; PLANS
 * §39.6: no agent FPS claim). Activation timings are *logged* from
 * `ultraReport().timings` as the report-only figures §5 names.
 */

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

test.beforeEach(() => {
  // An Ultra activation builds a world's worth of geometry, a PMREM, a far
  // map and a 4096 cascade; several journeys build more than one.
  test.slow();
});

// ---------------------------------------------------------------------------
// Worlds, views and where the frames go
// ---------------------------------------------------------------------------

/** The curated player launch: the r6 town ring, seed `euc` — the heaviest shipped world. */
const TOWN = '';
const TOWN_PLAN = 'generated-r6-euc';
const SLICE = 'level=slice';
const PARK = 'level=switchback';
const PARK_PLAN = 'switchback-r4';

/** A place on a segment, as `tools/ultra-compare.mjs` places its views. */
interface ViewPlacement {
  readonly name: string;
  readonly segment: string;
  /** Metres along the segment's arc from its entry; negative counts back from its exit. */
  readonly at: number;
  /** Fixed steps after placement, nothing held: the rider balances, the camera settles. */
  readonly steps: number;
}

/** The three U0 core views (PLANS §39.6's street junction, vegetated edge, shaded contact). */
const CORE_VIEWS: readonly ViewPlacement[] = [
  { name: 'town-commercial-junction', segment: 'city-commercial-main-street', at: -34, steps: 90 },
  { name: 'town-vegetated-edge', segment: 'trailhead@9', at: 16, steps: 90 },
  { name: 'town-shaded-contact', segment: 'park-gate@6', at: 30, steps: 90 },
];
const COMMERCIAL = CORE_VIEWS[0];
const PARK_VIEW: ViewPlacement = { name: 'switchback-park', segment: 'timber', at: 12, steps: 90 };

/**
 * Where the frames land: `M39_SHOTS`, **repo-relative by default** (invariant
 * 15 — a scratchpad path carries the machine's account name, and the exporter
 * refuses a tree containing one). A `spec/` folder of its own, so a run never
 * overwrites the U0 references or a capture set beside it.
 */
const SHOTS = `${process.env.M39_SHOTS ?? 'test-results/m39/ultra'}/spec`;

async function keepShot(testInfo: TestInfo, name: string, body: Buffer): Promise<void> {
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, body);
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

// ---------------------------------------------------------------------------
// The in-page probes
// ---------------------------------------------------------------------------

/** What only an Ultra build leaves in the scene (see the file comment). */
interface UltraFootprint {
  readonly environment: boolean;
  readonly environmentIntensity: number;
  /** `sun.shadow.mapSize.x`: what was asked for. */
  readonly shadowMapSize: number;
  /** The allocated map's width: what three actually built (0 before the first frame). */
  readonly shadowMapReadBack: number;
  /** The painted sky: `scene.background` on an ordinary frame, the rig's painting under Ultra (A22, F3). */
  readonly skyWidth: number;
  readonly skyHeight: number;
  readonly skyAnisotropy: number;
  /**
   * The face edge of a cube hung as `scene.background` — the Ultra sky's
   * colour-only background cube (A22, Fable F3) — or 0 when the background
   * is the equirect painting itself, as on every ordinary frame.
   */
  readonly backgroundCube: number;
  /** Distinct geometry attribute names beginning `ultra` (§4: `ultraAo`, `ultraRelief` …). */
  readonly ultraAttributes: readonly string[];
  /** Objects enabled on `ULTRA_STATIC_LAYER` (5), the far map's casters. */
  readonly staticLayerObjects: number;
  /** Materials whose `onBeforeCompile`, cache key or `onBeforeRender` is not three's own. */
  readonly patchedMaterials: number;
  /** Meshes carrying a `customDepthMaterial` (the relief depth material, §4). */
  readonly customDepthMeshes: number;
  /** `level-props-*` meshes that receive shadow; ordinary props never do. */
  readonly receivingProps: number;
  /** Building, cap and gable buckets in the scene, so "no relief" can be told from "no buildings". */
  readonly buildingBuckets: number;
}

/** The composed rig — every value §3.6's exact restore rewrites. */
interface RigState {
  readonly exposure: number;
  readonly toneMapping: number;
  readonly outputColorSpace: string;
  readonly environment: boolean;
  readonly environmentIntensity: number;
  readonly sun: {
    readonly intensity: number;
    readonly colour: number;
    readonly castShadow: boolean;
    readonly mapSize: number;
    readonly bias: number;
    readonly normalBias: number;
    readonly radius: number;
    readonly shadowIntensity: number;
    readonly camera: {
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
      readonly near: number;
      readonly far: number;
    };
    readonly offset: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly hemisphere: { readonly intensity: number; readonly sky: number; readonly ground: number };
  readonly fog: { readonly colour: number; readonly near: number; readonly far: number };
  readonly sky: {
    readonly width: number;
    readonly height: number;
    readonly anisotropy: number;
    readonly bytes: number;
    readonly digest: number;
  };
  readonly pixelRatio: number;
}

interface Placed {
  readonly ok: boolean;
  readonly reason: string;
  readonly planId: string;
  readonly x: number;
  readonly z: number;
  readonly headingY: number;
  readonly surface: string;
}

/** What one steady frame drew, counted by wrapping three's own entry points. */
interface SteadyFrame {
  /** `WebGLRenderer.render` calls in the frame: one per view, and nothing else. */
  readonly renders: number;
  /** Distinct non-null render targets bound in the frame. */
  readonly targets: number;
  /** Whether every one of them was the near shadow map. */
  readonly onlyShadowMap: boolean;
  readonly live: { readonly drawCalls: number; readonly triangles: number };
}

/** The title toggle and the Settings select, as the DOM has them. */
interface QualityUi {
  readonly togglePresent: boolean;
  readonly pressed: string | null;
  readonly disabled: boolean | null;
  readonly kind: string | null;
  readonly state: string | null;
  readonly selectValue: string | null;
  readonly ultraOptionDisabled: boolean | null;
  readonly readout: string | null;
  readonly readoutHidden: boolean | null;
}

/** The first frame drawn with more than one view, as `armSplitProbe` caught it. */
interface SplitFrame {
  readonly views: number;
  readonly tier: 'ultra' | 'ordinary';
  readonly footprint: UltraFootprint;
  readonly recipe: string | null;
  readonly demotions: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface UltraProbes {
  footprint(): UltraFootprint;
  rig(): RigState;
  place(view: ViewPlacement): Placed;
  steadyFrame(): SteadyFrame;
  qualityUi(): QualityUi;
  facadeRects(limit: number): ScreenRect[];
  armSplitProbe(): void;
  /** Take `planRef` from the installed plan now. */
  rememberPlan(): void;
  /** The plan installed when the probes were (or at `rememberPlan`) — `===` is the "same plan" claim. */
  planRef: unknown;
  split: SplitFrame | null;
}

declare global {
  interface Window {
    m39: UltraProbes;
    m39PlanDigest?: (plan: unknown) => string;
  }
}

/**
 * Install `window.m39`. Runs in the page, so it imports nothing and closes
 * over nothing from this file; installed again after every navigation.
 */
function installUltraProbes(): void {
  const game = window.game;

  const sunLight = (): DirectionalLight => {
    const found: DirectionalLight[] = [];
    game.renderer.scene.traverse((object: Object3D) => {
      if ((object as DirectionalLight).isDirectionalLight === true) found.push(object as DirectionalLight);
    });
    if (found.length !== 1) throw new Error(`expected one directional light, found ${found.length}`);
    return found[0];
  };

  /**
   * The deepest prototype that defines `onBeforeCompile` — three's `Material`
   * itself, even under a subclass that overrides it — so a patch installed by
   * assignment *or* by a subclass method is told apart from three's no-op.
   */
  const materialRoot = (material: Material): Record<string, unknown> | null => {
    let proto = Object.getPrototypeOf(material) as object | null;
    let root: object | null = null;
    while (proto !== null) {
      if (Object.prototype.hasOwnProperty.call(proto, 'onBeforeCompile')) root = proto;
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    return root as Record<string, unknown> | null;
  };
  /**
   * The painted sky. On an ordinary frame it is `scene.background` itself.
   * Under Ultra (A22, Fable F3) the background is the painting's colour-only
   * cube, which the runtime bakes and hangs so three never builds its own
   * depth-buffered one, and the painting is read from the renderer's rig.
   */
  const backgroundCubeEdge = (): number => {
    const background = game.renderer.scene.background as (Texture & { isCubeTexture?: boolean }) | null;
    if (background === null || background.isCubeTexture !== true) return 0;
    const faces = background.image as readonly { width?: number }[] | null;
    return Array.isArray(faces) ? faces[0]?.width ?? 0 : 0;
  };
  const paintedSky = (): Texture | null => {
    const background = game.renderer.scene.background as (Texture & { isCubeTexture?: boolean }) | null;
    if (background === null || background.isCubeTexture !== true) return background;
    return (game.renderer as unknown as { lighting: { sky: { texture: Texture } } }).lighting.sky.texture;
  };
  const isPatched = (material: Material): boolean => {
    const root = materialRoot(material);
    if (root === null) return false;
    const own = material as unknown as Record<string, unknown>;
    return own.onBeforeCompile !== root.onBeforeCompile
      || own.customProgramCacheKey !== root.customProgramCacheKey
      || own.onBeforeRender !== root.onBeforeRender;
  };

  const footprint = (): UltraFootprint => {
    const scene = game.renderer.scene;
    const sun = sunLight();
    const names = new Set<string>();
    const materials = new Set<Material>();
    let staticLayerObjects = 0;
    let patchedMaterials = 0;
    let customDepthMeshes = 0;
    let receivingProps = 0;
    let buildingBuckets = 0;
    scene.traverse((object: Object3D) => {
      // `ULTRA_STATIC_LAYER` is 5 (`render/ultra/ultraRecipe.ts`).
      if ((object.layers.mask & (1 << 5)) !== 0) staticLayerObjects += 1;
      const mesh = object as Mesh;
      if (mesh.isMesh !== true) return;
      for (const name of Object.keys(mesh.geometry?.attributes ?? {})) {
        if (/^ultra/i.test(name)) names.add(name);
      }
      if (mesh.customDepthMaterial !== undefined) customDepthMeshes += 1;
      if (mesh.name.startsWith('level-props-') && mesh.receiveShadow) receivingProps += 1;
      if (/^level-props-(building|roofGable)/.test(mesh.name)) buildingBuckets += 1;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (material === undefined || material === null || materials.has(material)) continue;
        materials.add(material);
        if (isPatched(material)) patchedMaterials += 1;
      }
    });
    const background = paintedSky();
    const image = (background?.image ?? null) as { width?: number; height?: number } | null;
    return {
      environment: scene.environment !== null,
      environmentIntensity: scene.environmentIntensity,
      shadowMapSize: sun.shadow.mapSize.x,
      shadowMapReadBack: sun.shadow.map?.width ?? 0,
      skyWidth: image?.width ?? 0,
      skyHeight: image?.height ?? 0,
      skyAnisotropy: background?.anisotropy ?? 0,
      backgroundCube: backgroundCubeEdge(),
      ultraAttributes: [...names].sort(),
      staticLayerObjects,
      patchedMaterials,
      customDepthMeshes,
      receivingProps,
      buildingBuckets,
    };
  };

  const rig = (): RigState => {
    const renderer = game.renderer;
    const three = renderer.renderer;
    const scene = renderer.scene;
    const sun = sunLight();
    const fills: HemisphereLight[] = [];
    scene.traverse((object: Object3D) => {
      if ((object as HemisphereLight).isHemisphereLight === true) fills.push(object as HemisphereLight);
    });
    if (fills.length !== 1) throw new Error(`expected one hemisphere light, found ${fills.length}`);
    const fill = fills[0];
    const fog = scene.fog as Fog;
    const background = paintedSky() as Texture;
    const image = background.image as { width: number; height: number; data: ArrayLike<number> };
    // `m36_4.spec.ts`'s sky digest: every 997th byte, a prime stride through
    // every band of the painting — enough to tell two paintings apart.
    let digest = 0;
    for (let i = 0; i < image.data.length; i += 997) digest = (digest * 31 + image.data[i]) % 2_147_483_647;
    const camera = sun.shadow.camera as unknown as {
      left: number; right: number; top: number; bottom: number; near: number; far: number;
    };
    return {
      exposure: three.toneMappingExposure,
      toneMapping: three.toneMapping as number,
      outputColorSpace: three.outputColorSpace as string,
      environment: scene.environment !== null,
      environmentIntensity: scene.environmentIntensity,
      sun: {
        intensity: sun.intensity,
        colour: sun.color.getHex(),
        castShadow: sun.castShadow,
        mapSize: sun.shadow.mapSize.x,
        bias: sun.shadow.bias,
        normalBias: sun.shadow.normalBias,
        radius: sun.shadow.radius,
        shadowIntensity: sun.shadow.intensity,
        camera: {
          left: camera.left,
          right: camera.right,
          top: camera.top,
          bottom: camera.bottom,
          near: camera.near,
          far: camera.far,
        },
        offset: {
          x: sun.position.x - sun.target.position.x,
          y: sun.position.y - sun.target.position.y,
          z: sun.position.z - sun.target.position.z,
        },
      },
      hemisphere: { intensity: fill.intensity, sky: fill.color.getHex(), ground: fill.groundColor.getHex() },
      fog: { colour: fog.color.getHex(), near: fog.near, far: fog.far },
      sky: {
        width: image.width,
        height: image.height,
        anisotropy: background.anisotropy,
        bytes: image.data.length,
        digest,
      },
      pixelRatio: three.getPixelRatio(),
    };
  };

  /**
   * Stand the rider on a view and settle, frozen — `ultra-compare.mjs`'s
   * `arrangeInPage` arithmetic exactly (the arc's heading turns linearly;
   * forward is (sin h, cos h)), so a frame here is a frame from the U0 table.
   */
  const place = (view: ViewPlacement): Placed => {
    const plan = game.levelPlan;
    game.loop.setRunning(false);
    game.clearActions();
    const segment = plan.segments.find((each) => each.id === view.segment);
    if (segment === undefined) {
      return {
        ok: false, reason: `no segment "${view.segment}" on ${plan.id}`, planId: plan.id,
        x: 0, z: 0, headingY: 0, surface: '',
      };
    }
    const turn = segment.exit.headingY - segment.entry.headingY;
    const dx = segment.exit.position.x - segment.entry.position.x;
    const dz = segment.exit.position.z - segment.entry.position.z;
    const chord = Math.hypot(dx, dz);
    const length = Math.abs(turn) < 1e-9 ? chord : (chord * (turn / 2)) / Math.sin(turn / 2);
    const s = Math.min(length, Math.max(0, view.at < 0 ? length + view.at : view.at));
    const curvature = length > 0 ? turn / length : 0;
    const h0 = segment.entry.headingY;
    let x = segment.entry.position.x + Math.sin(h0) * s;
    let z = segment.entry.position.z + Math.cos(h0) * s;
    let headingY = h0;
    if (Math.abs(curvature) >= 1e-9) {
      headingY = h0 + curvature * s;
      x = segment.entry.position.x + (Math.cos(h0) - Math.cos(headingY)) / curvature;
      z = segment.entry.position.z + (Math.sin(headingY) - Math.sin(h0)) / curvature;
    }
    const ground = game.sampleGround(x, z);
    game.placeRider({ x, y: ground.height, z }, headingY);
    game.clearActions();
    game.advance(view.steps);
    return { ok: true, reason: '', planId: plan.id, x, z, headingY, surface: ground.surface };
  };

  /**
   * One `advance(1)` with three's `render` and `setRenderTarget` counted —
   * §5's "1 near-shadow + 1 colour; 0 FS passes; 0 per-frame render targets"
   * as a measurement. The shadow pass binds the near map through the same
   * `setRenderTarget`, so it is the one target a steady frame may bind.
   */
  const steadyFrame = (): SteadyFrame => {
    const three = game.renderer.renderer;
    const host = three as unknown as {
      render: WebGLRenderer['render'];
      setRenderTarget: WebGLRenderer['setRenderTarget'];
    };
    const ownRender = Object.prototype.hasOwnProperty.call(three, 'render');
    const ownTarget = Object.prototype.hasOwnProperty.call(three, 'setRenderTarget');
    const render = host.render;
    const setRenderTarget = host.setRenderTarget;
    let renders = 0;
    const targets = new Set<unknown>();
    host.render = (...args: Parameters<WebGLRenderer['render']>): void => {
      renders += 1;
      render.apply(three, args);
    };
    host.setRenderTarget = (...args: Parameters<WebGLRenderer['setRenderTarget']>): void => {
      if (args[0] !== null && args[0] !== undefined) targets.add(args[0]);
      setRenderTarget.apply(three, args);
    };
    try {
      game.advance(1);
    } finally {
      if (ownRender) host.render = render;
      else Reflect.deleteProperty(three, 'render');
      if (ownTarget) host.setRenderTarget = setRenderTarget;
      else Reflect.deleteProperty(three, 'setRenderTarget');
    }
    const map = sunLight().shadow.map;
    const live = game.snapshot().render;
    return {
      renders,
      targets: targets.size,
      onlyShadowMap: [...targets].every((target) => target === map),
      live: { drawCalls: live.drawCalls, triangles: live.triangles },
    };
  };

  const qualityUi = (): QualityUi => {
    const toggle = document.querySelector<HTMLButtonElement>('.euc-menu--title [data-menu="ultra"]');
    const select = document.querySelector<HTMLSelectElement>('[data-option="quality"]');
    const option = document.querySelector<HTMLOptionElement>('[data-option="quality"] option[value="ultra"]');
    const readout = document.querySelector<HTMLElement>('[data-readout="quality-state"]');
    return {
      togglePresent: toggle !== null,
      pressed: toggle?.getAttribute('aria-pressed') ?? null,
      disabled: toggle === null ? null : toggle.disabled,
      kind: toggle?.dataset.ultraState ?? null,
      state: toggle?.querySelector('[data-ultra-text]')?.textContent?.trim() ?? null,
      selectValue: select?.value ?? null,
      ultraOptionDisabled: option === null ? null : option.disabled,
      readout: readout?.textContent?.trim() ?? null,
      readoutHidden: readout === null ? null : readout.hidden,
    };
  };

  /**
   * The largest on-screen facade boxes, in CSS pixels, each shrunk to its
   * inner 60 % — the windows and walls of the buildings nearest the camera,
   * wherever the view happens to put them. Found by projecting each
   * facade instance's box through the live camera, so the region follows the
   * scene rather than a hand-picked pixel rectangle.
   */
  const facadeRects = (limit: number): ScreenRect[] => {
    const renderer = game.renderer;
    const camera = renderer.camera;
    camera.updateMatrixWorld();
    const v = camera.matrixWorldInverse.elements;
    const p = camera.projectionMatrix.elements;
    const canvas = renderer.renderer.domElement.getBoundingClientRect();
    const found: { rect: ScreenRect; area: number }[] = [];
    renderer.scene.traverse((object: Object3D) => {
      const mesh = object as InstancedMesh;
      if (mesh.isInstancedMesh !== true || !/^level-props-building(Body|Low|Tall)$/.test(mesh.name)) return;
      const position = mesh.geometry.getAttribute('position');
      let minX = Infinity; let minY = Infinity; let minZ = Infinity;
      let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
      for (let i = 0; i < position.count; i += 1) {
        minX = Math.min(minX, position.getX(i)); maxX = Math.max(maxX, position.getX(i));
        minY = Math.min(minY, position.getY(i)); maxY = Math.max(maxY, position.getY(i));
        minZ = Math.min(minZ, position.getZ(i)); maxZ = Math.max(maxZ, position.getZ(i));
      }
      mesh.updateMatrixWorld(true);
      const w = mesh.matrixWorld.elements;
      const instances = mesh.instanceMatrix.array;
      for (let index = 0; index < mesh.count; index += 1) {
        const e: number[] = new Array(16).fill(0);
        for (let column = 0; column < 4; column += 1) {
          for (let row = 0; row < 4; row += 1) {
            let sum = 0;
            for (let k = 0; k < 4; k += 1) sum += w[k * 4 + row] * instances[index * 16 + column * 4 + k];
            e[column * 4 + row] = sum;
          }
        }
        // A block beside the rider can reach back past the camera; its corners
        // in front of the camera still outline the part of it on screen, so a
        // box counts when at least half of its corners are in front.
        let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity;
        let inFront = 0;
        for (const cx of [minX, maxX]) {
          for (const cy of [minY, maxY]) {
            for (const cz of [minZ, maxZ]) {
              const x = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
              const y = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
              const z = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
              const ex = v[0] * x + v[4] * y + v[8] * z + v[12];
              const ey = v[1] * x + v[5] * y + v[9] * z + v[13];
              const ez = v[2] * x + v[6] * y + v[10] * z + v[14];
              const clipX = p[0] * ex + p[4] * ey + p[8] * ez + p[12];
              const clipY = p[1] * ex + p[5] * ey + p[9] * ez + p[13];
              const clipW = p[3] * ex + p[7] * ey + p[11] * ez + p[15];
              if (clipW <= 0.05) continue;
              inFront += 1;
              const sx = canvas.left + ((clipX / clipW + 1) / 2) * canvas.width;
              const sy = canvas.top + ((1 - clipY / clipW) / 2) * canvas.height;
              left = Math.min(left, sx); right = Math.max(right, sx);
              top = Math.min(top, sy); bottom = Math.max(bottom, sy);
            }
          }
        }
        if (inFront < 4) continue;
        left = Math.max(canvas.left, left); right = Math.min(canvas.right, right);
        top = Math.max(canvas.top, top); bottom = Math.min(canvas.bottom, bottom);
        const width = right - left;
        const height = bottom - top;
        if (width < 40 || height < 40) continue;
        found.push({
          rect: {
            x: Math.round(left + width * 0.2),
            y: Math.round(top + height * 0.2),
            width: Math.round(width * 0.6),
            height: Math.round(height * 0.6),
          },
          area: width * height,
        });
      }
    });
    return found.sort((a, b) => b.area - a.area).slice(0, limit).map((each) => each.rect);
  };

  const probes: UltraProbes = {
    footprint,
    rig,
    place,
    steadyFrame,
    qualityUi,
    facadeRects,
    planRef: game.levelPlan,
    split: null,
    rememberPlan(): void {
      probes.planRef = game.levelPlan;
    },
    /**
     * Record the first frame drawn with more than one view: the tier, the
     * footprint and the recipe as the first split pass starts, and the frame's
     * counters when its last pass ends. Wraps the one renderer instance's
     * `renderView`, which `Game.render` calls once per view.
     */
    armSplitProbe(): void {
      const renderer = game.renderer;
      const original = renderer.renderView.bind(renderer);
      let pending: Omit<SplitFrame, 'drawCalls' | 'triangles'> | null = null;
      renderer.renderView = (view: number): void => {
        const views = renderer.viewCount;
        if (probes.split === null && pending === null && views > 1 && view === 0) {
          pending = {
            views,
            tier: renderer.effectiveTier(),
            footprint: footprint(),
            recipe: renderer.presentation()?.recipe.id ?? null,
            demotions: renderer.ultraReport().safetyDemotions,
          };
        }
        original(view);
        if (pending !== null && view === views - 1) {
          const info = renderer.renderer.info.render;
          probes.split = { ...pending, drawCalls: info.calls, triangles: info.triangles };
          pending = null;
        }
      };
    },
  };
  window.m39 = probes;
}

async function installProbes(page: Page): Promise<void> {
  await page.evaluate(installUltraProbes);
}

/**
 * The real `planDigest`, loaded into the page as a module the dev server
 * compiles — `ultra-compare.mjs`'s route to the same function the headless
 * suite pins plans with. (The browser digest differs from Node's for the same
 * plan, M39 U0 caveat, so digests are only ever compared within the page.)
 */
async function installPlanDigest(page: Page): Promise<void> {
  await page.addScriptTag({
    type: 'module',
    content: "import { planDigest } from '/src/level/planDigest.ts'; window.m39PlanDigest = planDigest;",
  });
  await page.waitForFunction(() => typeof window.m39PlanDigest === 'function', undefined, { timeout: 30_000 });
}

/** Everything the game and the renderer say about the tier, in one round trip. */
function tierFacts(page: Page) {
  return page.evaluate(() => {
    const game = window.game;
    const renderer = game.renderer;
    const snapshot = game.snapshot();
    const report = renderer.ultraReport();
    const presentation = renderer.presentation();
    return {
      requestedOption: snapshot.options.quality,
      quality: {
        requested: snapshot.quality.requested,
        effective: snapshot.quality.effective,
        reason: snapshot.quality.reason,
        multiplayer: snapshot.quality.multiplayer,
        ultraOffered: snapshot.quality.ultraOffered,
        recipe: snapshot.quality.recipe,
      },
      effectiveTier: renderer.effectiveTier(),
      report,
      tierCapFinite: Number.isFinite(report.drawingBuffer.tierCap),
      presentation: presentation === null ? null : {
        recipe: presentation.recipe.id,
        solo: { drawCalls: presentation.cost.frame.solo.drawCalls, triangles: presentation.cost.frame.solo.triangles },
        tier: presentation.tier.effective,
        refusal: presentation.tier.refusal,
        ultraReported: presentation.ultra !== null,
      },
      planId: game.levelPlan.id,
      views: renderer.viewCount,
      footprint: window.m39.footprint(),
    };
  });
}
type TierFacts = Awaited<ReturnType<typeof tierFacts>>;

// ---------------------------------------------------------------------------
// Shared expectations
// ---------------------------------------------------------------------------

/** No Ultra resource anywhere in the scene (see `UltraFootprint`). */
function expectOrdinaryFootprint(footprint: UltraFootprint, where: string): void {
  expect(footprint.environment, `${where}: scene.environment is set on an ordinary frame`).toBe(false);
  expect(footprint.environmentIntensity, `${where}: environmentIntensity was not restored`).toBe(1);
  expect(footprint.shadowMapSize, `${where}: the near map is larger than High's`)
    .toBeLessThanOrEqual(LIGHTING.shadowMapSize);
  expect(footprint.shadowMapReadBack, `${where}: an allocated near map is larger than High's`)
    .toBeLessThanOrEqual(LIGHTING.shadowMapSize);
  expect(footprint.skyWidth, `${where}: the sky is not the ordinary painting`).toBe(LIGHTING.skyTextureWidth);
  expect(footprint.skyHeight).toBe(LIGHTING.skyTextureHeight);
  expect(footprint.skyAnisotropy, `${where}: the sky kept Ultra's anisotropy`).toBe(1);
  expect(footprint.backgroundCube, `${where}: the Ultra sky's background cube is still hung`).toBe(0);
  expect(footprint.ultraAttributes, `${where}: Ultra geometry attributes are in the scene`).toEqual([]);
  expect(footprint.staticLayerObjects, `${where}: objects are on the far map's static layer`).toBe(0);
  expect(footprint.patchedMaterials, `${where}: patched (Ultra) materials are in the scene`).toBe(0);
  expect(footprint.customDepthMeshes, `${where}: relief depth materials are in the scene`).toBe(0);
  expect(footprint.receivingProps, `${where}: props receive shadow`).toBe(0);
}

/**
 * The renderer and the game agree the frame is ordinary: the ledger at zero,
 * no Ultra rig, report or cost, the ordinary sky and no tier cap — and the
 * scene with no Ultra footprint. `presentation()` names what was built, and
 * it is never an Ultra rung.
 */
function expectOrdinaryState(facts: TierFacts, where: string): void {
  expect(facts.effectiveTier, `${where}: the renderer says Ultra`).toBe('ordinary');
  expect(facts.quality.effective, `${where}: the game says Ultra`).not.toBe('ultra');
  expect(facts.report.active).toBe(false);
  expect(facts.report.kit).toBeNull();
  expect(facts.report.cost).toBeNull();
  expect(facts.report.targets).toEqual([]);
  expect(facts.report.bytes, `${where}: the Ultra ledger is not empty`).toEqual({ steady: 0, peakSwitch: 0 });
  expect(facts.report.shadow).toBeNull();
  expect(facts.report.farShadow).toBeNull();
  expect(facts.report.environment).toBeNull();
  expect(facts.report.sky.width).toBe(LIGHTING.skyTextureWidth);
  expect(facts.report.safetyDemotions, `${where}: a safety demotion happened`).toBe(0);
  expect(facts.tierCapFinite, `${where}: the Ultra pixel cap is still on`).toBe(false);
  expect(facts.presentation, `${where}: no presentation`).not.toBeNull();
  expect(facts.presentation?.recipe ?? '', `${where}: an ordinary frame is described as an Ultra rung`)
    .not.toMatch(/^ultra-/);
  expect(facts.presentation?.tier).toBe('ordinary');
  expect(facts.quality.recipe).toBe(facts.presentation?.recipe);
  expectOrdinaryFootprint(facts.footprint, where);
}

/**
 * The game, the renderer and the scene all say Ultra — and the scene shows
 * what the kit says it built. This is also the positive control for every
 * empty footprint in this file.
 */
function expectUltraState(facts: TierFacts, where: string): void {
  expect(facts.report.refusal, `${where}: Ultra refused (${JSON.stringify(facts.report.refusal)})`).toBeNull();
  expect(facts.effectiveTier, `${where}: the renderer is not drawing Ultra`).toBe('ultra');
  expect(facts.report.active).toBe(true);
  expect(facts.report.requested).toBe(true);
  expect(facts.quality.requested).toBe('ultra');
  expect(facts.quality.effective).toBe('ultra');
  expect(facts.quality.reason).toBeNull();
  expect(facts.report.recipe).toMatch(/^ultra-(full|lit)$/);
  // One recipe, however it is asked for: the renderer's report, what it says
  // it built, and the game's snapshot.
  expect(facts.presentation?.recipe).toBe(facts.report.recipe);
  expect(facts.quality.recipe).toBe(facts.report.recipe);
  expect(facts.presentation?.tier).toBe('ultra');
  expect(facts.presentation?.refusal ?? null).toBeNull();
  expect(facts.presentation?.ultraReported).toBe(true);
  expect(facts.report.safetyDemotions, `${where}: a safety demotion happened`).toBe(0);
  expect(facts.tierCapFinite, `${where}: the Ultra pixel cap is off`).toBe(true);

  const kit = facts.report.kit;
  expect(kit, `${where}: an active Ultra report names no kit`).not.toBeNull();
  if (kit === null) return;
  expect(kit.ao, 'T13 is reserved (§2.4)').toBe(false);
  const footprint = facts.footprint;
  if (kit.lighting) {
    expect(footprint.environment, `${where}: no painted-sky environment (T1)`).toBe(true);
    expect(facts.report.environment).not.toBeNull();
    expect(facts.report.shadow, `${where}: no Ultra near rig`).not.toBeNull();
    expect(footprint.receivingProps, `${where}: props do not receive (T2)`).toBeGreaterThan(0);
    expect(footprint.skyWidth, `${where}: the Ultra sky is not hung (T8)`).toBe(ULTRA.sky.width);
    // A22 (Fable F3): drawn through its own colour-only cube, which the
    // ledger and the model's `sky-background-cube` row count.
    expect(footprint.backgroundCube, `${where}: the Ultra sky is not drawn through its background cube`)
      .toBe(ULTRA.sky.height);
    expect(footprint.skyAnisotropy).toBeGreaterThanOrEqual(1);
    expect(footprint.skyAnisotropy).toBeLessThanOrEqual(ULTRA.sky.anisotropy);
  }
  if (kit.ground) {
    expect(footprint.ultraAttributes.length, `${where}: no Ultra ground attributes (T5)`).toBeGreaterThan(0);
  }
  expect(footprint.staticLayerObjects, `${where}: nothing on the static layer`).toBeGreaterThan(0);
  expect(footprint.patchedMaterials, `${where}: no Ultra material patches`).toBeGreaterThan(0);
  if (kit.buildings && footprint.buildingBuckets > 0) {
    expect(footprint.customDepthMeshes, `${where}: no relief depth material (T4)`).toBeGreaterThan(0);
  }
  if (kit.farShadow) expect(facts.report.farShadow, `${where}: no far map (T12)`).not.toBeNull();
  else expect(facts.report.farShadow).toBeNull();
}

/** §5's envelope, on the report and on one measured steady frame. */
function expectInsideEnvelope(report: UltraReport, frame: SteadyFrame, where: string): void {
  const cost = report.cost;
  expect(cost, `${where}: an active Ultra world with no model`).not.toBeNull();
  if (cost === null) return;
  // live ≤ model ≤ envelope — the §5 enforcement layer 4 chain.
  expect(frame.live.drawCalls, `${where}: live draw calls above the model`).toBeLessThanOrEqual(cost.solo.drawCalls);
  expect(frame.live.triangles, `${where}: live triangles above the model`).toBeLessThanOrEqual(cost.solo.triangles);
  expect(cost.solo.drawCalls, `${where}: model draw calls above the envelope`)
    .toBeLessThanOrEqual(ULTRA_ENVELOPE.soloDraws);
  expect(cost.solo.triangles, `${where}: model triangles above the envelope`)
    .toBeLessThanOrEqual(ULTRA_ENVELOPE.soloTriangles);
  expect(cost.props.drawCalls).toBeLessThanOrEqual(ULTRA_ENVELOPE.propDraws);
  expect(cost.props.triangles).toBeLessThanOrEqual(ULTRA_ENVELOPE.propTriangles);

  // The pass list: two every-frame scene passes, near shadow and colour, and
  // only activation work besides (§2.3).
  const everyFrame = cost.passes.filter((pass) => pass.when === 'every-frame');
  expect(everyFrame.length).toBeLessThanOrEqual(ULTRA_ENVELOPE.steadySceneRenders);
  for (const pass of everyFrame) expect(['near-shadow', 'colour']).toContain(pass.name);
  for (const pass of cost.passes.filter((each) => each.when === 'activation')) {
    expect(['far-shadow-build', 'pmrem-build']).toContain(pass.name);
    if (pass.name === 'far-shadow-build') {
      expect(pass.drawCalls).toBeLessThanOrEqual(ULTRA_ENVELOPE.farDepthDraws);
      expect(pass.triangles).toBeLessThanOrEqual(ULTRA_ENVELOPE.farDepthTriangles);
    }
  }
  // And measured: one colour render and no target but the near map.
  expect(frame.renders, `${where}: ${frame.renders} scene renders in one steady frame`).toBe(1);
  expect(frame.targets, `${where}: ${frame.targets} render targets bound in one steady frame`)
    .toBeLessThanOrEqual(1);
  expect(frame.onlyShadowMap, `${where}: a steady frame bound a target that is not the near map`).toBe(true);

  // Bytes, programs, maps and pixels.
  expect(report.bytes.steady, `${where}: the ledger is empty on an active world`).toBeGreaterThan(0);
  expect(report.bytes.steady, `${where}: steady bytes above the envelope`).toBeLessThanOrEqual(ULTRA_ENVELOPE.bytes);
  expect(report.bytes.peakSwitch).toBeLessThanOrEqual(ULTRA_ENVELOPE.peakSwitchBytes);
  expect(report.programs, `${where}: ${report.programs} live programs`).toBeLessThanOrEqual(ULTRA_ENVELOPE.programs);
  expect(report.safetyDemotions).toBe(ULTRA_ENVELOPE.safetyDemotions);
  const targetBytes = report.targets.reduce((sum, target) => sum + target.bytes, 0);
  expect(targetBytes).toBeLessThanOrEqual(ULTRA_ENVELOPE.bytes);
  for (const target of report.targets) expect(target.samples).toBeLessThanOrEqual(ULTRA_ENVELOPE.msaaSamples);
  if (report.shadow !== null) {
    expect(report.shadow.mapSizeReadBack, `${where}: the near map three built`).toBe(report.shadow.mapSize);
    expect(report.shadow.mapSizeReadBack).toBeLessThanOrEqual(ULTRA_ENVELOPE.shadowMap);
  }
  if (report.farShadow !== null) {
    expect(report.farShadow.mapSize).toBeLessThanOrEqual(ULTRA_ENVELOPE.farShadowMap);
    expect(report.farShadow.texelMetres).toBeGreaterThan(0);
  }
  const buffer = report.drawingBuffer;
  expect(buffer.width * buffer.height, `${where}: drawing buffer above the pixel budget`)
    .toBeLessThanOrEqual(ULTRA_ENVELOPE.drawingBufferPixels);
}

/** The Settings readouts W2 words (§6.3 W2). Either apostrophe is accepted. */
const READOUT = {
  multiplayer: 'Single player only — this session uses High',
  override: 'Diagnostic override — using High',
  refused: (reason: string): RegExp =>
    new RegExp(`^Ultra couldn[’']t start here — using High \\(${escapeRegExp(reason)}\\)$`),
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Two real animation frames — a pad poll, a claim window's priming frame. */
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
}

/** Press Escape and let the one-shot land (`m38.spec.ts`'s helper: pause is claimed in a step). */
async function pauseWithEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game.advance(2));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
}

async function waitForState(page: Page, state: string): Promise<void> {
  await page.waitForFunction((wanted) => window.game.snapshot().app.state === wanted, state);
}

// -- Pads: `m27.spec.ts`'s recipe (the whole real Gamepad API path) -----------

const PAD_A = 0;
const PAD_LEFT = 14;
const PAD_RIGHT = 15;

type FakePad = { index: number; connected: boolean; buttons: { pressed: boolean; value: number }[] };

async function fakePads(page: Page, count: number): Promise<void> {
  await page.addInitScript((wanted) => {
    const pads = Array.from({ length: wanted }, (_unused, index) => ({
      index,
      id: `fake standard pad ${index}`,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    }));
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    navigator.getGamepads = () => pads.map((pad) => (pad.connected ? pad : null)) as never;
  }, count);
}

/** Press and release one button on one pad, a real frame apart. */
async function pulsePad(page: Page, padIndex: number, button: number): Promise<void> {
  await page.evaluate(async ({ at, which }) => {
    const pads = (window as unknown as { fakePads: FakePad[] }).fakePads;
    const pad = pads.find((entry) => entry.index === at);
    if (pad === undefined) throw new Error(`no fake pad ${at}`);
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[which].pressed = true;
    pad.buttons[which].value = 1;
    await frame();
    pad.buttons[which].pressed = false;
    pad.buttons[which].value = 0;
    await frame();
  }, { at: padIndex, which: button });
}

/**
 * Seat pad 0 and the keyboard on the join panel and start the couch's free
 * ride — `m25.spec.ts`'s "the join panel seats a pad and the keyboard" path,
 * pressed the way two people press it.
 */
async function startCouchRide(page: Page): Promise<void> {
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await waitForState(page, 'couchJoin');
  await twoFrames(page);
  await pulsePad(page, 0, PAD_A);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().couch.ready);
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await waitForState(page, 'freeRide');
}

// ===========================================================================
// Journey 1 — a saved Ultra boots Ultra, inside its envelope
// ===========================================================================

/** Place, measure one steady frame, and read every tier fact at that pose. */
async function ultraFrameAt(page: Page, view: ViewPlacement) {
  const placed = await page.evaluate((at) => window.m39.place(at), view);
  expect(placed.ok, placed.reason).toBe(true);
  const frame = await page.evaluate(() => window.m39.steadyFrame());
  const facts = await tierFacts(page);
  const gl = await page.evaluate(() => {
    const three = window.game.renderer.renderer;
    const context = three.getContext();
    return {
      samples: context.getParameter(context.SAMPLES) as number,
      antialias: context.getContextAttributes()?.antialias ?? false,
      dpr: window.devicePixelRatio,
      maxPixelRatio: window.game.tuning.get('RENDER.maxPixelRatio'),
    };
  });
  return { placed, frame, facts, gl };
}

function expectUltraFrame(measured: Awaited<ReturnType<typeof ultraFrameAt>>, where: string): void {
  const { frame, facts, gl } = measured;
  expectUltraState(facts, where);
  expectInsideEnvelope(facts.report, frame, where);
  // The presentation's solo frame is Ultra's own model, not the ordinary one.
  expect(facts.presentation?.solo).toEqual(facts.report.cost?.solo);
  // T0 and §2.2: never more pixels than High would draw, one AA strategy.
  const highRatio = Math.min(gl.dpr, Math.max(0.5, gl.maxPixelRatio));
  expect(facts.report.drawingBuffer.ratio, `${where}: Ultra draws at a higher ratio than High`)
    .toBeLessThanOrEqual(highRatio);
  expect(gl.antialias, 'the canvas lost its MSAA').toBe(true);
  expect(gl.samples).toBeLessThanOrEqual(ULTRA_ENVELOPE.msaaSamples);
  console.log(`[m39-ultra] ${where}: ${facts.report.recipe}; live ${frame.live.drawCalls} calls / `
    + `${frame.live.triangles} tri; model ${facts.report.cost?.solo.drawCalls} / ${facts.report.cost?.solo.triangles}; `
    + `props ${facts.report.cost?.props.drawCalls} / ${facts.report.cost?.props.triangles}; `
    + `steady ${(facts.report.bytes.steady / 1048576).toFixed(1)} MiB; programs ${facts.report.programs}; `
    + `buffer ${facts.report.drawingBuffer.width}x${facts.report.drawingBuffer.height}; `
    + `activation ms ${JSON.stringify(facts.report.timings)}`);
}

test('journey 1: a saved Ultra boots Ultra on the town, and every core view is live ≤ model ≤ envelope', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootAtTier(page, TOWN, 'ultra');
  await installProbes(page);

  const booted = await tierFacts(page);
  expect(booted.planId).toBe(TOWN_PLAN);
  expect(booted.requestedOption, 'the saved preference is the request').toBe('ultra');
  expectUltraState(booted, 'the town at boot');
  // The title entrance says what is drawn: pressed, and "On" because it is.
  expect(await page.evaluate(() => window.m39.qualityUi())).toMatchObject({
    togglePresent: true, pressed: 'true', kind: 'on', state: 'On', disabled: false, selectValue: 'ultra',
  });

  for (const view of CORE_VIEWS) {
    const measured = await ultraFrameAt(page, view);
    expectUltraFrame(measured, view.name);
    await keepShot(testInfo, `j1-${view.name}-ultra`, await page.screenshot());
  }
  expect(errors).toEqual([]);
});

test('journey 1: a saved Ultra boots Ultra at Switchback, live ≤ model ≤ envelope', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootAtTier(page, PARK, 'ultra');
  await installProbes(page);
  const measured = await ultraFrameAt(page, PARK_VIEW);
  expect(measured.placed.planId).toBe(PARK_PLAN);
  expectUltraFrame(measured, PARK_VIEW.name);
  await keepShot(testInfo, `j1-${PARK_VIEW.name}-ultra`, await page.screenshot());
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 2 — High → Ultra → High, three times, byte for byte
// ===========================================================================

test('journey 2: High → Ultra → High three times gives back the same High frame byte for byte, and the GPU plateaus', async ({ page }, testInfo) => {
  // **§3.6's browser proof**, on `m36_4.spec.ts:327`'s pattern: the same
  // camera, the same rider, the same frozen loop, and two PNGs compared byte
  // for byte. A teardown that left anything behind — an exposure a hundredth
  // off, a sky repainted from the wrong tier, a near map at 4096, a patched
  // material — moves thousands of pixels, and no visual comparison would catch
  // all of it. The Ultra frame between is the positive control: a comparison
  // that cannot see a difference proves nothing.
  const errors = collectErrors(page);
  await bootAtTier(page, TOWN, 'high');
  await installProbes(page);

  const settle = async (): Promise<void> => {
    const placed = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
    expect(placed.ok, placed.reason).toBe(true);
  };
  const resources = () => page.evaluate(() => window.game.resources());
  const rig = () => page.evaluate(() => window.m39.rig());

  await settle();
  const before = {
    png: await page.screenshot(),
    rig: await rig(),
    resources: await resources(),
    facts: await tierFacts(page),
  };
  expectOrdinaryState(before.facts, 'the fresh High frame');
  expect(before.facts.quality.effective).toBe('high');
  expect(before.rig.sun.mapSize).toBe(LIGHTING.shadowMapSize);
  await keepShot(testInfo, 'j2-high-before', before.png);

  const returns: typeof before.resources[] = [];
  const ultraPrograms: number[] = [];
  for (let round = 1; round <= 3; round += 1) {
    await page.evaluate(() => window.game.setOptions({ quality: 'ultra' }));
    await settle();
    const ultraPng = await page.screenshot();
    const ultra = await tierFacts(page);
    expectUltraState(ultra, `round ${round} at Ultra`);
    ultraPrograms.push(ultra.report.programs);
    expect(Buffer.compare(before.png, ultraPng), `round ${round}: the Ultra frame is the High frame`).not.toBe(0);
    if (round === 1) await keepShot(testInfo, 'j2-ultra-round-1', ultraPng);

    await page.evaluate(() => window.game.setOptions({ quality: 'high' }));
    await settle();
    const backPng = await page.screenshot();
    const back = await tierFacts(page);
    expectOrdinaryState(back, `round ${round} back at High`);
    expect(back.quality.effective).toBe('high');
    expect(back.presentation?.recipe, `round ${round}: a different ordinary recipe came back`)
      .toBe(before.facts.presentation?.recipe);
    expect(await rig(), `round ${round}: the ordinary rig was not rewritten exactly`).toEqual(before.rig);
    if (Buffer.compare(before.png, backPng) !== 0) await keepShot(testInfo, `j2-high-after-round-${round}-DIFF`, backPng);
    expect(Buffer.compare(before.png, backPng), `round ${round}: High came back different`).toBe(0);
    returns.push(await resources());
  }

  console.log(`[m39-ultra] plateau: before ${JSON.stringify(before.resources)}; `
    + `after each round ${JSON.stringify(returns)}`);
  for (const [index, counts] of returns.entries()) {
    const where = `after round ${index + 1}`;
    expect(counts.lights, where).toBe(before.resources.lights);
    expect(counts.sceneObjects, where).toBe(before.resources.sceneObjects);
    expect(counts.textures, where).toBe(before.resources.textures);
    expect(counts.programs, where).toBe(before.resources.programs);
    // Geometries plateau: the first return may legitimately settle, the
    // later ones may not climb (invariant 10's reading of a plateau).
    expect(counts.geometries, where).toBe(returns[0].geometries);
  }

  // Fable N2: the Ultra side plateaus too, at the count of a *first* entry —
  // one with no High frame behind it. Before the entry release (activation
  // step 4b) every entry after High frames also held the ordinary variants
  // of the rider, wheel, cop and other materials outside the world (the
  // re-verify read 25 against 22 on the slice). The reference is the same
  // town and view booted straight into Ultra.
  await bootAtTier(page, TOWN, 'ultra');
  await installProbes(page);
  await settle();
  const first = await tierFacts(page);
  expectUltraState(first, 'booted straight into Ultra');
  console.log(`[m39-ultra] Ultra programs: first entry ${first.report.programs}; `
    + `after High, each round ${JSON.stringify(ultraPrograms)}`);
  expect(ultraPrograms, 'an entry after High holds a different program set from a first entry')
    .toEqual(ultraPrograms.map(() => first.report.programs));
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 3 — quality never reaches the simulation
// ===========================================================================

/** The saved record and ghost: every `euc-thrills.v1.*` key but the options record, raw. */
function storedIdentity(page: Page) {
  return page.evaluate(() => {
    const game = window.game;
    const stored: [string, string][] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key === null || !key.startsWith('euc-thrills.v1.') || key === 'euc-thrills.v1.options') continue;
      stored.push([key, window.localStorage.getItem(key) ?? '']);
    }
    stored.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const digest = window.m39PlanDigest;
    return {
      planId: game.levelPlan.id,
      digest: digest === undefined ? null : digest(game.levelPlan),
      samePlanObject: game.levelPlan === window.m39.planRef,
      record: { ...game.snapshot().record },
      stored,
    };
  });
}

test('journey 3: the plan, its digest, the saved record and the ghost are untouched by every tier change', async ({ page }) => {
  const errors = collectErrors(page);
  await bootAtTier(page, SLICE, 'high', { ride: false });
  await installProbes(page);
  await installPlanDigest(page);

  // A record and a ghost to protect, filed at High the way `m10.spec.ts`
  // files one: arm a time trial and cross every gate by placement.
  await page.evaluate(() => window.game.clearRecords());
  const gates = await page.evaluate(() => window.game.levelPlan.checkpoints.map((gate) => ({
    centre: { x: gate.centre.x, y: gate.centre.y, z: gate.centre.z },
    headingY: gate.headingY,
  })));
  expect(gates.length).toBeGreaterThan(1);
  await page.evaluate(() => window.game.startTimeTrial());
  for (const gate of gates) {
    await page.evaluate(({ centre, headingY }) => {
      window.game.placeRider({ x: centre.x, y: centre.y, z: centre.z }, headingY);
      window.game.advance(2);
      window.game.advance(60);
    }, gate);
  }
  await page.evaluate(() => {
    window.game.advance(300);
    // The plan the record was filed on is the one every tier must keep.
    window.m39.rememberPlan();
  });
  const filed = await storedIdentity(page);
  expect(filed.samePlanObject).toBe(true);
  expect(filed.digest, 'planDigest did not load in the page').not.toBeNull();
  expect(filed.record.totalSeconds, 'no record was filed to protect').not.toBeNull();
  expect(filed.record.hasGhost, 'no ghost was filed to protect').toBe(true);
  expect(filed.stored.length).toBeGreaterThan(0);

  for (const tier of ['ultra', 'high', 'ultra', 'medium', 'low', 'high'] as const) {
    // One task: the tier change and the readings either side of it, so no
    // animation frame can step the world between them. Invariant 4: a tier
    // change never steps, places or rebuilds the simulation.
    const change = await page.evaluate((wanted) => {
      const game = window.game;
      const plan = game.levelPlan;
      const tick = game.snapshot().tick;
      const euc = JSON.stringify(game.snapshot().euc);
      game.setOptions({ quality: wanted });
      const after = game.snapshot();
      return {
        planReplaced: game.levelPlan !== plan,
        ticked: after.tick !== tick,
        eucMoved: JSON.stringify(after.euc) !== euc,
        effective: after.quality.effective,
        rendererTier: game.renderer.effectiveTier(),
      };
    }, tier);
    expect(change.planReplaced, `→ ${tier}: the plan object was replaced`).toBe(false);
    expect(change.ticked, `→ ${tier}: the tier change stepped the simulation`).toBe(false);
    expect(change.eucMoved, `→ ${tier}: the tier change moved the rider`).toBe(false);
    expect(change.effective, `→ ${tier}: the slice did not draw what was asked`).toBe(tier);
    expect(change.rendererTier).toBe(tier === 'ultra' ? 'ultra' : 'ordinary');

    const now = await storedIdentity(page);
    expect(now.samePlanObject, `→ ${tier}`).toBe(true);
    expect(now.planId, `→ ${tier}`).toBe(filed.planId);
    expect(now.digest, `→ ${tier}: the plan digest moved`).toBe(filed.digest);
    expect(now.record, `→ ${tier}: the record moved`).toEqual(filed.record);
    expect(now.stored, `→ ${tier}: saved records or ghosts were rewritten`).toEqual(filed.stored);
  }
  expect(errors).toEqual([]);
});

/**
 * The scripted ride: 300 fixed steps with a straight, a carve, a charged hop
 * and its landing, and a hard brake — enough of the controller to show up any
 * render-side influence on the simulation.
 */
const RIDE = [
  { actions: { throttle: 1, steer: 0 }, steps: 100 },
  { actions: { throttle: 1, steer: 0.6 }, steps: 50 },
  { actions: { throttle: 0.4, steer: 0, crouch: true }, steps: 40 },
  { actions: { throttle: 0.4, steer: 0, crouch: true, hop: true }, steps: 4 },
  { actions: { throttle: 0.4, steer: 0, crouch: false, hop: false }, steps: 56 },
  { actions: { throttle: -1, steer: -0.3, crouch: false, hop: false }, steps: 50 },
] as const;

/**
 * Ride `RIDE` from the spawn on a freshly booted, never-stepped world.
 * `switchTiers`, when given, is applied between segments — the tier changes
 * mid-ride, through the options store as a player's Settings press would.
 */
async function scriptedRide(page: Page, switchTiers: readonly QualityLevel[] | null) {
  return page.evaluate(({ script, tiers }) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    const spawn = game.levelPlan.spawn;
    game.placeRider({ x: spawn.position.x, y: spawn.position.y, z: spawn.position.z }, spawn.headingY);
    const tick0 = game.snapshot().tick;
    const segments: { tick: number; euc: unknown; record: unknown }[] = [];
    const drawnAt: string[] = [];
    script.forEach((segment, index) => {
      if (tiers !== null) {
        game.setOptions({ quality: tiers[index % tiers.length] });
        drawnAt.push(game.renderer.effectiveTier());
      }
      game.setActions({ ...segment.actions });
      game.advance(segment.steps);
      const snapshot = game.snapshot();
      segments.push({ tick: snapshot.tick - tick0, euc: snapshot.euc, record: snapshot.record });
    });
    game.clearActions();
    return {
      tick0,
      planId: game.levelPlan.id,
      tier: game.renderer.effectiveTier(),
      drawnAt,
      segments,
    };
  }, { script: RIDE.map((segment) => ({ actions: { ...segment.actions }, steps: segment.steps })), tiers: switchTiers });
}

test('journey 3: a 300-step scripted ride is identical at High, at Ultra, and with tier changes mid-ride', async ({ page }) => {
  // Four boots of the town, each frozen from its first frame so every ride
  // starts from the same never-stepped world (`bootAtTier`'s freezeAtStart).
  // The second High boot is the **control**: if two High rides disagree, the
  // ride is not deterministic across boots and this journey cannot judge
  // Ultra — the message says so rather than blaming the tier.
  const errors = collectErrors(page);
  const rides: Record<string, Awaited<ReturnType<typeof scriptedRide>>> = {};
  for (const [name, tier, switches] of [
    ['high', 'high', null],
    ['high-control', 'high', null],
    ['ultra', 'ultra', null],
    ['switching', 'high', ['ultra', 'high', 'ultra', 'low', 'ultra', 'high']],
  ] as const) {
    await bootAtTier(page, TOWN, tier, { freezeAtStart: true });
    rides[name] = await scriptedRide(page, switches);
  }

  const high = rides.high;
  expect(high.planId).toBe(TOWN_PLAN);
  expect(high.segments.at(-1)?.tick).toBe(300);
  expect(rides['high-control'].segments, 'two High boots rode differently: the ride is not deterministic '
    + 'across boots, so a High/Ultra difference below would say nothing about Ultra').toEqual(high.segments);

  expect(rides.ultra.tier, 'the Ultra boot did not ride at Ultra').toBe('ultra');
  expect(rides.ultra.tick0, 'the two boots did not start their rides at the same tick').toBe(high.tick0);
  expect(rides.ultra.planId).toBe(high.planId);
  expect(rides.ultra.segments, 'the ride at Ultra differs from the ride at High').toEqual(high.segments);

  expect(rides.switching.drawnAt).toEqual(['ultra', 'ordinary', 'ultra', 'ordinary', 'ultra', 'ordinary']);
  expect(rides.switching.segments, 'changing tier mid-ride changed the ride').toEqual(high.segments);
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 4 — the couch is High from its first split frame
// ===========================================================================

test('journey 4: a saved Ultra hands a couch High before its first split frame, and the session end gives Ultra back', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootAtTier(page, TOWN, 'ultra', { ride: false });
  await installProbes(page);
  await page.waitForFunction(() => window.game.snapshot().couch.available && window.game.snapshot().input.pads === 1);
  expectUltraState(await tierFacts(page), 'the title before the couch');

  await page.evaluate(() => window.m39.armSplitProbe());
  // The join panel is `openCouch`, and its first line is the tier: Ultra has
  // gone before the guest's rig or any split exists.
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await waitForState(page, 'couchJoin');
  const joining = await tierFacts(page);
  expect(joining.quality).toMatchObject({ requested: 'ultra', effective: 'high', multiplayer: true, ultraOffered: false });
  expect(joining.quality.reason).not.toBeNull();
  expect(joining.requestedOption, 'the couch overwrote the saved preference').toBe('ultra');
  expectOrdinaryState(joining, 'the join panel');
  await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
  await waitForState(page, 'title');
  expectUltraState(await tierFacts(page), 'the title after Back from the join panel');

  await startCouchRide(page);
  await page.waitForFunction(() => window.m39.split !== null, undefined, { timeout: 30_000 });
  const split = await page.evaluate(() => window.m39.split);
  expect(split).not.toBeNull();
  if (split === null) return;
  expect(split.views).toBeGreaterThan(1);
  expect(split.tier, 'the first split frame was drawn at Ultra').toBe('ordinary');
  expect(split.recipe ?? '', 'the first split frame was built with an Ultra rung').not.toMatch(/^ultra-/);
  expect(split.demotions, 'the split was reached by a safety demotion').toBe(0);
  expectOrdinaryFootprint(split.footprint, 'the first split frame');
  // Contract 2's frame, which is what "no Ultra buckets" costs.
  expect(split.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxDrawCalls);
  expect(split.triangles).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxTriangles);

  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.advance(120);
  });
  const riding = await tierFacts(page);
  expect(riding.views).toBe(2);
  expect(riding.quality).toMatchObject({ requested: 'ultra', effective: 'high', multiplayer: true });
  expectOrdinaryState(riding, 'the couch ride');
  await keepShot(testInfo, 'j4-couch-split-high', await page.screenshot());

  // Quit to the title: the session ends there, and a saved Ultra comes back.
  await pauseWithEscape(page);
  await page.locator('.euc-menu--pause [data-menu="quit"]').click();
  await waitForState(page, 'title');
  await page.waitForFunction(() => window.game.renderer.viewCount === 1);
  const after = await tierFacts(page);
  expect(after.quality).toMatchObject({ requested: 'ultra', effective: 'ultra', multiplayer: false, ultraOffered: true });
  expectUltraState(after, 'the title after the couch');
  expect(errors).toEqual([]);
});

test('journey 4: a one-seat remnant of a multiplayer session stays High until the session ends', async ({ page }) => {
  // Through the QA bridge, which raises the session exactly as a couch seat
  // does (`renderTier.ts:multiplayerAfter`, 'seat-spawn'). PLANS §39.6: "a
  // one-seat remnant of a couch session remains multiplayer until that
  // session ends" — so one view, and still High.
  const errors = collectErrors(page);
  await bootAtTier(page, SLICE, 'ultra');
  await installProbes(page);
  expectUltraState(await tierFacts(page), 'solo');

  await page.evaluate(() => window.m39.armSplitProbe());
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.spawnSecondRider();
    game.advance(2);
  });
  const split = await page.evaluate(() => window.m39.split);
  expect(split, 'no split frame was drawn').not.toBeNull();
  if (split === null) return;
  expect(split.tier).toBe('ordinary');
  expect(split.demotions).toBe(0);
  expectOrdinaryFootprint(split.footprint, 'the first two-seat frame');

  await page.evaluate(() => {
    const game = window.game;
    game.despawnSecondRider();
    game.advance(120);
  });
  const remnant = await tierFacts(page);
  expect(remnant.views).toBe(1);
  expect(remnant.quality).toMatchObject({ requested: 'ultra', effective: 'high', multiplayer: true, ultraOffered: false });
  expectOrdinaryState(remnant, 'the one-seat remnant');

  // The title ends the session; Ultra is rebuilt, and survives the ride's return.
  await page.evaluate(() => {
    const game = window.game;
    game.setAppState('paused');
    game.setAppState('title');
  });
  expectUltraState(await tierFacts(page), 'the title that ended the session');
  await page.evaluate(() => {
    window.game.setAppState('freeRide');
    window.game.loop.setRunning(false);
    window.game.advance(30);
  });
  const solo = await tierFacts(page);
  expect(solo.quality.multiplayer).toBe(false);
  expectUltraState(solo, 'solo again');
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 5 — one preference, two entrances
// ===========================================================================

/** Poll until both entrances show `expected`, then return the game's facts. */
async function expectEntrances(page: Page, expected: {
  requested: QualityLevel;
  state: 'On' | 'Off' | 'Using High' | 'Single player only';
}, where: string): Promise<TierFacts> {
  const pressed = expected.requested === 'ultra' ? 'true' : 'false';
  await expect.poll(() => page.evaluate(() => window.m39.qualityUi()), { message: where, timeout: 15_000 })
    .toMatchObject({ pressed, state: expected.state, selectValue: expected.requested });
  const facts = await tierFacts(page);
  expect(facts.requestedOption, where).toBe(expected.requested);
  expect(facts.quality.requested, where).toBe(expected.requested);
  return facts;
}

async function openSettingsFromTitle(page: Page): Promise<void> {
  await page.locator('.euc-menu--title [data-menu="settings"]').click();
  await waitForState(page, 'settings');
}

async function backToTitle(page: Page): Promise<void> {
  await page.locator('.euc-menu--settings [data-menu="back"]').click();
  await waitForState(page, 'title');
}

test('journey 5: the title toggle and Settings are one preference, the toggle remembers the tier it came from, and a Settings tier clears Ultra', async ({ page }) => {
  const errors = collectErrors(page);
  await bootAtTier(page, SLICE, 'medium', { ride: false });
  await installProbes(page);
  const toggle = page.locator('.euc-menu--title [data-menu="ultra"]');
  const select = page.locator('[data-option="quality"]');

  let facts = await expectEntrances(page, { requested: 'medium', state: 'Off' }, 'a Medium boot');
  expect(facts.quality.effective).toBe('medium');

  // On from Medium, and Settings agrees at once.
  await toggle.click();
  facts = await expectEntrances(page, { requested: 'ultra', state: 'On' }, 'the toggle on');
  expectUltraState(facts, 'the toggle on');
  // Off again: back to the tier it came from, not to High.
  await toggle.click();
  facts = await expectEntrances(page, { requested: 'medium', state: 'Off' }, 'the toggle off');
  expect(facts.quality.effective).toBe('medium');
  expectOrdinaryState(facts, 'the toggle off');

  // On, then a Settings tier: that choice turns the shortcut off.
  await toggle.click();
  await expectEntrances(page, { requested: 'ultra', state: 'On' }, 'the toggle on again');
  await openSettingsFromTitle(page);
  await expect(select).toHaveValue('ultra');
  await expect(page.locator('[data-readout="quality-state"]')).toBeHidden();
  await select.selectOption('low');
  facts = await expectEntrances(page, { requested: 'low', state: 'Off' }, 'Low chosen in Settings');
  expect(facts.quality.effective).toBe('low');
  expectOrdinaryState(facts, 'Low chosen in Settings');
  await backToTitle(page);

  // The memory follows whichever entrance made the last ordinary choice.
  await toggle.click();
  await expectEntrances(page, { requested: 'ultra', state: 'On' }, 'the toggle on from Low');
  await toggle.click();
  await expectEntrances(page, { requested: 'low', state: 'Off' }, 'the toggle back to Low');

  // Ultra chosen *in Settings* records the tier it left, for the toggle to return to.
  await openSettingsFromTitle(page);
  await select.selectOption('ultra');
  await expectEntrances(page, { requested: 'ultra', state: 'On' }, 'Ultra chosen in Settings');
  await backToTitle(page);
  await toggle.click();
  await expectEntrances(page, { requested: 'low', state: 'Off' }, 'the toggle off after a Settings Ultra');

  // Saved, and the memory is the session's: a reload keeps Ultra, and the
  // toggle then returns to High because this session remembers nothing.
  await toggle.click();
  await expectEntrances(page, { requested: 'ultra', state: 'On' }, 'Ultra before the reload');
  await bootToTitle(page, SLICE);
  await installProbes(page);
  facts = await expectEntrances(page, { requested: 'ultra', state: 'On' }, 'Ultra after the reload');
  expectUltraState(facts, 'Ultra after the reload');
  await page.locator('.euc-menu--title [data-menu="ultra"]').click();
  await expectEntrances(page, { requested: 'high', state: 'Off' }, 'the toggle off with no memory');
  expect(errors).toEqual([]);
});

test('journey 5: a couch pause Settings neither offers Ultra nor lets a pad reach it, and never overwrites the saved Ultra', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootAtTier(page, SLICE, 'ultra', { ride: false });
  await installProbes(page);
  await page.waitForFunction(() => window.game.snapshot().couch.available && window.game.snapshot().input.pads === 1);
  await startCouchRide(page);

  await pauseWithEscape(page);
  await page.locator('.euc-menu--pause [data-menu="settings"]').click();
  await waitForState(page, 'settings');

  // Disabled, never removed or deselected: the select still shows the saved
  // Ultra, the readout says why this session is High, and the title's toggle
  // (on its hidden panel) is disabled with the same words.
  const ui = await page.evaluate(() => window.m39.qualityUi());
  expect(ui).toMatchObject({
    ultraOptionDisabled: true,
    selectValue: 'ultra',
    readoutHidden: false,
    readout: READOUT.multiplayer,
    disabled: true,
    kind: 'unavailable',
    state: 'Single player only',
    pressed: 'true',
  });
  const couch = await tierFacts(page);
  expect(couch.quality).toMatchObject({ requested: 'ultra', effective: 'high', multiplayer: true, ultraOffered: false });
  expect(couch.requestedOption).toBe('ultra');
  expectOrdinaryState(couch, 'the couch pause Settings');

  // The pad: Right from the saved Ultra goes nowhere (it is the last option),
  // Left is the player choosing High, and from there Right cannot step onto
  // the disabled Ultra and A's wrapping lap goes round without landing on it.
  const quality = () => page.evaluate(() => ({
    saved: window.game.snapshot().options.quality,
    shown: (document.querySelector('[data-option="quality"]') as HTMLSelectElement).value,
    effective: window.game.snapshot().quality.effective,
  }));
  await page.locator('[data-option="quality"]').focus();
  await pulsePad(page, 0, PAD_RIGHT);
  expect(await quality(), 'a pad Right moved the saved Ultra').toMatchObject({ saved: 'ultra', shown: 'ultra' });
  await pulsePad(page, 0, PAD_LEFT);
  expect(await quality()).toMatchObject({ saved: 'high', shown: 'high', effective: 'high' });
  await pulsePad(page, 0, PAD_RIGHT);
  expect(await quality(), 'a pad Right stepped onto the disabled Ultra').toMatchObject({ saved: 'high', shown: 'high' });
  const lap: string[] = [];
  for (let press = 0; press < 5; press += 1) {
    await pulsePad(page, 0, PAD_A);
    const now = await quality();
    lap.push(now.saved);
    // Ordinary tiers keep working exactly as today in couch (invariant 18).
    expect(now.effective).toBe(now.saved);
  }
  expect(lap, `the pad's A lap reached Ultra: ${lap.join(' → ')}`).not.toContain('ultra');
  expect(new Set(lap)).toEqual(new Set(['low', 'medium', 'high']));
  expect(await page.evaluate(() => window.game.snapshot().quality.ultraOffered)).toBe(false);
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 6 — a diagnostic override says so
// ===========================================================================

for (const recipe of ['enhanced', 'baseline'] as const) {
  test(`journey 6: ?presentation=${recipe} under a saved Ultra draws ${recipe}, reports the override, and never says Ultra`, async ({ page }) => {
    const errors = collectErrors(page);
    await bootAtTier(page, `presentation=${recipe}`, 'ultra', { ride: false });
    await installProbes(page);

    const facts = await tierFacts(page);
    expect(facts.planId).toBe(TOWN_PLAN);
    // The intent stands (the renderer does the refusing) and the reason is the override.
    expect(facts.report.requested).toBe(true);
    expect(facts.report.refusal).toEqual({ kind: 'presentation-override', recipe });
    expect(facts.presentation?.refusal).toEqual({ kind: 'presentation-override', recipe });
    expect(facts.presentation?.recipe, 'the override did not build what it named').toBe(recipe);
    expect(facts.quality).toMatchObject({ requested: 'ultra', effective: 'high', multiplayer: false });
    expect(facts.quality.reason ?? '').toContain('presentation');
    expectOrdinaryState(facts, `?presentation=${recipe}`);

    await expect.poll(() => page.evaluate(() => window.m39.qualityUi())).toMatchObject({
      pressed: 'true', kind: 'fallback', state: 'Using High', disabled: false, selectValue: 'ultra',
    });
    await openSettingsFromTitle(page);
    await expect(page.locator('[data-readout="quality-state"]')).toBeVisible();
    await expect(page.locator('[data-readout="quality-state"]')).toHaveText(READOUT.override);
    await backToTitle(page);
    expect(errors).toEqual([]);
  });
}

// ===========================================================================
// Journey 7 — every activation failure lands on High, and says why
// ===========================================================================

const FAULT_STAGES: readonly UltraFaultStage[] = [
  'build', 'sky', 'environment', 'shadow', 'far-shadow', 'shader', 'gl-error',
];

for (const stage of FAULT_STAGES) {
  test(`journey 7: ?ultrafault=${stage} falls back to High with its reason, and Settings is there to recover with`, async ({ page }) => {
    const errors = collectErrors(page);
    // The far map is built only where the rung asks for it; the kit switch
    // makes that true whatever the tuning pass decides for
    // `ULTRA.farShadow.enabled` (a bare switch name turns it on).
    const query = stage === 'far-shadow'
      ? `${SLICE}&ultrafault=${stage}&ultrakit=farShadow`
      : `${SLICE}&ultrafault=${stage}`;
    await bootAtTier(page, query, 'ultra', { ride: false });
    await installProbes(page);

    const reason = describeRefusal({ kind: 'setup-failed', stage, message: '' });
    const facts = await tierFacts(page);
    expect(facts.report.refusal, `the refusal does not name ${stage}`).toMatchObject({ kind: 'setup-failed', stage });
    expect(facts.quality).toMatchObject({ requested: 'ultra', effective: 'high', reason, multiplayer: false });
    expect(facts.requestedOption, 'a failed start overwrote the saved preference').toBe('ultra');
    // Truthfully High: the teardown left nothing, the ledger is empty.
    expectOrdinaryState(facts, `?ultrafault=${stage}`);

    await expect.poll(() => page.evaluate(() => window.m39.qualityUi())).toMatchObject({
      pressed: 'true', kind: 'fallback', state: 'Using High', disabled: false,
    });
    await openSettingsFromTitle(page);
    await expect(page.locator('[data-option="quality"]')).toHaveValue('ultra');
    await expect(page.locator('[data-readout="quality-state"]')).toBeVisible();
    await expect(page.locator('[data-readout="quality-state"]')).toHaveText(READOUT.refused(reason));
    await backToTitle(page);

    // Session-sticky: off and on again does not try again.
    const toggle = page.locator('.euc-menu--title [data-menu="ultra"]');
    await toggle.click();
    await expectEntrances(page, { requested: 'high', state: 'Off' }, 'the toggle off after a failure');
    await toggle.click();
    const again = await expectEntrances(page, { requested: 'ultra', state: 'Using High' }, 'the toggle on again');
    expect(again.report.refusal).toMatchObject({ kind: 'setup-failed', stage });
    expectOrdinaryState(again, `?ultrafault=${stage}, asked again`);

    // And the game is playable: the ride starts and draws.
    await page.locator('.euc-menu--title [data-menu="start"]').click();
    await waitForState(page, 'freeRide');
    const drawn = await page.evaluate(() => {
      window.game.loop.setRunning(false);
      window.game.advance(30);
      return window.game.snapshot().render.drawCalls;
    });
    expect(drawn).toBeGreaterThan(0);
    expectOrdinaryState(await tierFacts(page), `riding after ?ultrafault=${stage}`);
    expect(errors).toEqual([]);
  });
}

/**
 * Fable F1: a builder exception on the **reconcile** path. `?ultrafault=build`
 * throws inside the Ultra terrain build, after the renderer has disposed the
 * ordinary world it was replacing — the state a real builder exception on an
 * unseen generated plan leaves. Before the repair, a Settings or title switch
 * then left no world installed while the readout said "Using High", and
 * `Game.render` threw every frame on `currentTerrain()`. The ordinary world
 * must be standing, identical to the one before the switch, and the ride must
 * draw with no error.
 */
async function installedWorld(page: Page) {
  return page.evaluate(() => {
    const renderer = window.game.renderer;
    try {
      const terrain = renderer.currentTerrain();
      return {
        installed: true as const,
        recipe: terrain.recipe as string,
        inScene: terrain.group.parent !== null,
        children: terrain.group.children.length,
        cellsDrawn: terrain.cellsDrawn,
        triangles: terrain.triangles,
        ultra: terrain.ultra !== null,
      };
    } catch (error) {
      return { installed: false as const, error: String(error) };
    }
  });
}

for (const entrance of ['title', 'settings'] as const) {
  test(`journey 7: a build that throws inside the Ultra terrain build on a ${entrance} switch leaves the ordinary world standing (F1)`, async ({ page }) => {
    const errors = collectErrors(page);
    await bootAtTier(page, `${SLICE}&ultrafault=build`, 'high', { ride: false });
    await installProbes(page);

    // A High boot never asks for Ultra, so the planted fault has not fired.
    const before = await tierFacts(page);
    expectOrdinaryState(before, 'a High boot with a planted build fault');
    expect(before.report.refusal).toBeNull();
    const worldBefore = await installedWorld(page);
    expect(worldBefore, 'no world after an ordinary boot').toMatchObject({ installed: true, inScene: true, ultra: false });

    if (entrance === 'title') {
      await page.locator('.euc-menu--title [data-menu="ultra"]').click();
    } else {
      await openSettingsFromTitle(page);
      await page.locator('[data-option="quality"]').selectOption('ultra');
    }
    const after = await expectEntrances(page, { requested: 'ultra', state: 'Using High' }, `Ultra asked for from ${entrance}`);
    expect(after.report.refusal, 'the refusal does not name the build').toMatchObject({ kind: 'setup-failed', stage: 'build' });
    expect(after.report.active).toBe(false);
    expect(after.quality).toMatchObject({ requested: 'ultra', effective: 'high', multiplayer: false });
    expect(after.quality.reason).toBe(describeRefusal({ kind: 'setup-failed', stage: 'build', message: '' }));
    expectOrdinaryState(after, `the failed ${entrance} switch`);
    // The same ordinary world as before the switch, built again and in the scene.
    const worldAfter = await installedWorld(page);
    expect(worldAfter, 'the failed activation left no world installed').toMatchObject({ installed: true, inScene: true, ultra: false });
    expect(worldAfter).toEqual(worldBefore);
    expect(after.presentation?.recipe, 'the report names a recipe that is not drawn').toBe(worldBefore.installed ? worldBefore.recipe : '');
    expect(after.presentation?.solo).toEqual(before.presentation?.solo);
    if (entrance === 'settings') {
      await expect(page.locator('[data-readout="quality-state"]')).toBeVisible();
      await expect(page.locator('[data-readout="quality-state"]')).toHaveText(
        READOUT.refused(describeRefusal({ kind: 'setup-failed', stage: 'build', message: '' })));
      await backToTitle(page);
    }

    // Frames draw at the title and on the ride, with no error.
    await twoFrames(page);
    await page.locator('.euc-menu--title [data-menu="start"]').click();
    await waitForState(page, 'freeRide');
    const drawn = await page.evaluate(() => {
      window.game.loop.setRunning(false);
      window.game.advance(30);
      return window.game.snapshot().render;
    });
    expect(drawn.drawCalls).toBeGreaterThan(0);
    expect(drawn.triangles).toBeGreaterThan(0);
    expectOrdinaryState(await tierFacts(page), `riding after the failed ${entrance} switch`);
    expect(errors).toEqual([]);
  });
}

/**
 * A28 C1 (Codex's post-GU QA): GPU errors reach the fallback. Each `gl-*`
 * plant raises a genuine GL error on the live context after one allocation
 * stage. Before the repair the first frame drained every pending error, so
 * the sky's was discarded (Codex probe 1), and refused only OUT_OF_MEMORY, so
 * an INVALID_FRAMEBUFFER_OPERATION left Ultra on (probe 2). Now both refuse on
 * `gl-error` with the stage and the code worded, the report keeps what was
 * read, and the frame is truthfully High; a code that does not refuse
 * (INVALID_ENUM) is kept against its stage and Ultra stays on.
 */
const GL_PLANT_CASES = [
  {
    plant: 'gl-sky', stage: 'sky', code: 0x0506, name: 'INVALID_FRAMEBUFFER_OPERATION',
    words: 'after the Ultra sky background cube', refuses: true,
  },
  {
    plant: 'gl-framebuffer', stage: 'first-frame', code: 0x0506, name: 'INVALID_FRAMEBUFFER_OPERATION',
    words: 'after the first Ultra frame', refuses: true,
  },
  {
    plant: 'gl-enum', stage: 'environment', code: 0x0500, name: 'INVALID_ENUM',
    words: '', refuses: false,
  },
] as const;

for (const { plant, stage, code, name, words, refuses } of GL_PLANT_CASES) {
  const outcome = refuses ? 'refuses to High with its stage and code' : 'is kept while Ultra stays on';
  test(`journey 7: ?ultrafault=${plant} — a real ${name} after the ${stage} stage ${outcome} (A28 C1)`, async ({ page }) => {
    const errors = collectErrors(page);
    await bootAtTier(page, `${SLICE}&ultrafault=${plant}`, 'ultra', { ride: false });
    await installProbes(page);

    const facts = await tierFacts(page);
    // Exactly the plant after the stale drain: the positive control that a
    // real activation on this GPU raises nothing else at any stage it reached,
    // and that every Ultra target it checked is framebuffer-complete.
    expect(
      facts.report.glErrors.filter((finding) => finding.stage !== 'stale'),
      `the ${name} raised after ${stage} was not kept against it, alone`,
    ).toEqual([{ stage, code, name, target: null, refuses }]);
    if (!refuses) {
      expectUltraState(facts, `?ultrafault=${plant}`);
      expect(errors).toEqual([]);
      return;
    }

    expect(facts.report.refusal, 'the refusal is not the GPU error').toMatchObject({ kind: 'setup-failed', stage: 'gl-error' });
    const message = facts.report.refusal?.kind === 'setup-failed' ? facts.report.refusal.message : '';
    expect(message).toContain(`${name} (0x0506) ${words}`);
    const reason = describeRefusal({ kind: 'setup-failed', stage: 'gl-error', message: '' });
    expect(facts.quality).toMatchObject({ requested: 'ultra', effective: 'high', reason, multiplayer: false });
    expect(facts.requestedOption, 'a failed start overwrote the saved preference').toBe('ultra');
    expectOrdinaryState(facts, `?ultrafault=${plant}`);

    // And the game is playable on High: the ride starts and draws.
    await page.locator('.euc-menu--title [data-menu="start"]').click();
    await waitForState(page, 'freeRide');
    const drawn = await page.evaluate(() => {
      window.game.loop.setRunning(false);
      window.game.advance(30);
      return window.game.snapshot().render.drawCalls;
    });
    expect(drawn).toBeGreaterThan(0);
    expectOrdinaryState(await tierFacts(page), `riding after ?ultrafault=${plant}`);
    expect(errors).toEqual([]);
  });
}

// ===========================================================================
// Journey 8 — a lost context comes back lit
// ===========================================================================

/** Mean luma and dark share (Rec.709 on sRGB bytes, `ultra-compare.mjs`'s measure) per region. */
async function regionStats(page: Page, png: Buffer, rects: readonly ScreenRect[]) {
  return page.evaluate(async ({ source, regions }) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('no 2d context');
    context.drawImage(image, 0, 0);
    const measure = (x: number, y: number, width: number, height: number) => {
      const { data } = context.getImageData(x, y, Math.max(1, width), Math.max(1, height));
      let sum = 0;
      let dark = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sum += luma;
        if (luma < 12) dark += 1;
        count += 1;
      }
      return { mean: sum / count, dark: dark / count };
    };
    return {
      frame: measure(0, 0, canvas.width, canvas.height),
      regions: regions.map((rect) => measure(rect.x, rect.y, rect.width, rect.height)),
    };
  }, { source: `data:image/png;base64,${png.toString('base64')}`, regions: [...rects] });
}

test('journey 8: a context loss and restore under Ultra comes back lit — facades and glass are not black — with no error', async ({ page }, testInfo) => {
  // The browser's own report of a forced loss is the mechanism, not a defect
  // (`stability.spec.ts`), so exactly those lines are set aside and nothing
  // else is: a WebGL error from a restore that half-worked still fails here.
  const errors = collectErrors(page);
  await bootAtTier(page, TOWN, 'ultra');
  await installProbes(page);

  const placed = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
  expect(placed.ok, placed.reason).toBe(true);
  const before = await tierFacts(page);
  expectUltraState(before, 'before the loss');
  const rects = await page.evaluate(() => window.m39.facadeRects(3));
  expect(rects.length, 'no facade is in the commercial view').toBeGreaterThan(0);
  const beforePng = await page.screenshot();
  await keepShot(testInfo, 'j8-ultra-before-loss', beforePng);

  await page.evaluate(() => {
    const context = window.game.renderer.renderer.getContext();
    const extension = context.getExtension('WEBGL_lose_context');
    (window as unknown as { m39Lose: unknown }).m39Lose = extension;
    extension?.loseContext();
  });
  await page.waitForFunction(() => window.game.snapshot().contextLost === true);
  await page.evaluate(() => {
    (window as unknown as { m39Lose: { restoreContext(): void } }).m39Lose.restoreContext();
  });
  await page.waitForFunction(() => window.game.snapshot().contextLost === false);
  await page.waitForFunction(() => window.game.snapshot().loop.running === true);

  const again = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
  expect(again.ok, again.reason).toBe(true);
  const after = await tierFacts(page);
  expectUltraState(after, 'after the restore');
  // The two resources that held *rendered* content were rebuilt (§6.3 W5).
  expect(after.report.environment, 'no environment after the restore').not.toBeNull();
  if (before.report.farShadow !== null) {
    expect(after.report.farShadow?.builtAtMs ?? 0, 'the far map was not rebuilt after the restore')
      .toBeGreaterThan(before.report.farShadow.builtAtMs);
  }
  const afterPng = await page.screenshot();
  await keepShot(testInfo, 'j8-ultra-after-restore', afterPng);

  const was = await regionStats(page, beforePng, rects);
  const now = await regionStats(page, afterPng, rects);
  console.log(`[m39-ultra] restore: frame ${JSON.stringify(was.frame)} → ${JSON.stringify(now.frame)}; `
    + `facades ${JSON.stringify(was.regions)} → ${JSON.stringify(now.regions)}; `
    + `byte-identical ${Buffer.compare(beforePng, afterPng) === 0}`);
  for (const [index, region] of now.regions.entries()) {
    const reference = was.regions[index];
    expect(reference.mean, `facade ${index} was already black before the loss`).toBeGreaterThan(20);
    expect(region.mean, `facade ${index} is black after the restore`).toBeGreaterThan(20);
    expect(region.mean, `facade ${index} lost its light: ${reference.mean.toFixed(1)} → ${region.mean.toFixed(1)}`)
      .toBeGreaterThanOrEqual(reference.mean * 0.9);
    expect(region.dark).toBeLessThanOrEqual(reference.dark + 0.05);
  }
  expect(now.frame.dark, 'the restored frame went dark').toBeLessThanOrEqual(was.frame.dark + 0.02);

  const mechanism = /CONTEXT_LOST_WEBGL|context lost|context restored/i;
  expect(errors.filter((line) => !mechanism.test(line))).toEqual([]);
});

// ===========================================================================
// Journey 9 — the pixel cap holds (the owner's Air shape)
// ===========================================================================

async function pixelState(page: Page) {
  return page.evaluate(() => {
    const game = window.game;
    const renderer = game.renderer;
    const three = renderer.renderer;
    const canvas = three.domElement;
    const report = renderer.ultraReport();
    return {
      dpr: window.devicePixelRatio,
      maxPixelRatio: game.tuning.get('RENDER.maxPixelRatio'),
      css: { width: canvas.clientWidth, height: canvas.clientHeight },
      buffer: { width: canvas.width, height: canvas.height },
      ratio: three.getPixelRatio(),
      reportRatio: report.drawingBuffer.ratio,
      tierCapFinite: Number.isFinite(report.drawingBuffer.tierCap),
      tierCap: Number.isFinite(report.drawingBuffer.tierCap) ? report.drawingBuffer.tierCap : -1,
      tier: renderer.effectiveTier(),
      demotions: report.safetyDemotions,
      views: renderer.viewCount,
    };
  });
}

/**
 * T0 (§2.1): on Ultra the ratio is `min(dpr, maxPixelRatio, √(budget / css))`
 * and the buffer is inside the budget; on any ordinary frame the cap is off
 * and the ratio is High's. Either way it is never above High's.
 */
function expectPixelCap(state: Awaited<ReturnType<typeof pixelState>>, where: string): void {
  const highRatio = Math.min(state.dpr, Math.max(0.5, state.maxPixelRatio));
  expect(state.ratio, `${where}: above High's ratio`).toBeLessThanOrEqual(highRatio + 1e-12);
  expect(state.reportRatio).toBe(state.ratio);
  expect(state.demotions, `${where}: a safety demotion happened`).toBe(0);
  if (state.tier === 'ultra') {
    const cap = Math.sqrt(ULTRA.pixelBudget / (state.css.width * state.css.height));
    expect(state.tierCapFinite, `${where}: Ultra without its cap`).toBe(true);
    expect(state.tierCap).toBeCloseTo(cap, 9);
    expect(state.ratio, `${where}: the ratio is not min(dpr, cap, cap-term)`).toBeCloseTo(Math.min(highRatio, cap), 9);
    expect(state.buffer.width * state.buffer.height, `${where}: ${state.buffer.width}x${state.buffer.height}`)
      .toBeLessThanOrEqual(ULTRA_ENVELOPE.drawingBufferPixels);
  } else {
    expect(state.tierCapFinite, `${where}: the Ultra cap is on an ordinary frame`).toBe(false);
    expect(state.ratio).toBeCloseTo(highRatio, 9);
  }
}

async function resizeTo(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(
    ({ w, h }) => window.game.renderer.viewport().width === w && window.game.renderer.viewport().height === h,
    { w: width, h: height },
  );
  await twoFrames(page);
}

test.describe('journey 9 on the Air’s larger scaled mode (1680 × 1050 at DPR 2)', () => {
  // A26 raised the budget to 5,184,000 px, the Air's default "looks like
  // 1440 × 900" retina buffer, so the budget no longer binds there (Ultra
  // draws High's own 2880 × 1800, checked in the resize loop below). Its
  // larger scaled mode is where it binds, so the "holds" below stay live.
  test.use({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });

  test('journey 9: the Ultra pixel cap holds through an F4 write, a seat spawn and despawn, resizes and a world swap', async ({ page }) => {
    const errors = collectErrors(page);
    await bootAtTier(page, SLICE, 'ultra');
    await installProbes(page);

    // The cap binds here — High would draw 3360 × 2100, Ultra 2880 × 1800 —
    // so every "holds" below is a live cap, not a vacuous one.
    let state = await pixelState(page);
    expect(state.tier).toBe('ultra');
    expect(state.dpr).toBe(2);
    expectPixelCap(state, 'boot');
    expect(state.ratio, 'the budget did not bind on the Air shape').toBeLessThan(Math.min(state.dpr, state.maxPixelRatio));
    expect(state.buffer.width * state.buffer.height).toBeGreaterThanOrEqual(ULTRA.pixelBudget * 0.99);

    // The q206 road: `applyTuning` pushes `setMaxPixelRatio` on every F4 write.
    // The cap is a separate term, so no write can lift it (q206 itself stays unfixed).
    for (const value of [3, 1.5]) {
      await page.evaluate((ratio) => window.game.tuning.set('RENDER.maxPixelRatio', ratio), value);
      await twoFrames(page);
      expectPixelCap(await pixelState(page), `maxPixelRatio ${value}`);
    }
    await page.evaluate(() => window.game.tuning.reset('RENDER.maxPixelRatio'));
    await twoFrames(page);
    expectPixelCap(await pixelState(page), 'maxPixelRatio reset');

    // A seat spawn is a multiplayer session: High, cap off, no demotion…
    await page.evaluate(() => {
      window.game.loop.setRunning(false);
      window.game.spawnSecondRider();
      window.game.advance(2);
    });
    await twoFrames(page);
    state = await pixelState(page);
    expect(state.tier).toBe('ordinary');
    expect(state.views).toBe(2);
    expectPixelCap(state, 'two seats');
    // …the remnant stays High…
    await page.evaluate(() => {
      window.game.despawnSecondRider();
      window.game.advance(2);
    });
    await twoFrames(page);
    state = await pixelState(page);
    expect(state.tier).toBe('ordinary');
    expectPixelCap(state, 'the one-seat remnant');
    // …and the session's end brings Ultra and its cap back.
    await page.evaluate(() => {
      const game = window.game;
      game.setAppState('paused');
      game.setAppState('title');
      game.setAppState('freeRide');
      game.loop.setRunning(false);
      game.advance(2);
    });
    await twoFrames(page);
    state = await pixelState(page);
    expect(state.tier).toBe('ultra');
    expectPixelCap(state, 'after the session');

    // Resizes: the cap is recomputed for the new box; where the budget no
    // longer binds, Ultra draws High's ratio and not one pixel more.
    for (const [width, height] of [[1920, 1200], [800, 600], [1440, 900], [1680, 1050]] as const) {
      await resizeTo(page, width, height);
      state = await pixelState(page);
      expect(state.tier).toBe('ultra');
      expectPixelCap(state, `${width}x${height}`);
      if (width === 1440) {
        // A26: the Air's default mode draws High's own retina buffer on Ultra.
        expect(state.ratio, 'Ultra below High on the Air\'s default mode').toBe(2);
        expect([state.buffer.width, state.buffer.height]).toEqual([2880, 1800]);
      }
    }

    // A world swap through the game (`installLevel`, which replays
    // `applyTuning`): BelVar is judged on its own, lands on a rung, and the
    // cap holds there too.
    // From the title, as m23 does: free ride → track day is not a transition
    // `APP_STATE_SPECS` allows, and a refused entrance swaps nothing.
    await page.evaluate(() => {
      window.game.setAppState('title');
      window.game.startTrackDay();
      window.game.loop.setRunning(false);
      window.game.advance(2);
    });
    await twoFrames(page);
    const swapped = await tierFacts(page);
    expect(swapped.planId).toBe('belvar-r1');
    expectUltraState(swapped, 'BelVar after the swap');
    expectPixelCap(await pixelState(page), 'BelVar');
    await page.evaluate(() => window.game.endTrackDay());
    expect(errors).toEqual([]);
  });
});

/**
 * A22 (Fable F5): the near and far maps are sized from the drawing buffer at
 * activation, by `ultraShadowMapSizesFor` — the rule the cost model prices
 * with, imported here too. A phone in landscape (844 × 390 CSS at DPR 3,
 * which the renderer caps at 2: 1688 × 780, 1.32 MP) is under the 2,000,000 px
 * at which the 4096 / 3072 maps stand, so both are 2048. The ledger stays at
 * or under the model at that buffer, and inside the envelope.
 */
test.describe('journey 9 on a phone-sized buffer (844 × 390 at DPR 3)', () => {
  test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });

  test('journey 9: on a phone-sized buffer the Ultra shadow maps follow the buffer rule — 2048 near, 2048 far', async ({ page }) => {
    const errors = collectErrors(page);
    await bootAtTier(page, SLICE, 'ultra', { ride: false });
    await installProbes(page);
    await twoFrames(page);

    const facts = await tierFacts(page);
    expectUltraState(facts, 'Ultra on a phone-sized buffer');
    const state = await pixelState(page);
    expectPixelCap(state, 'Ultra on a phone-sized buffer');
    expect(state.buffer.width * state.buffer.height, 'the buffer is not phone-sized').toBeLessThan(2_000_000);

    const report = facts.report;
    const expected = ultraShadowMapSizesFor(report.drawingBuffer.width, report.drawingBuffer.height);
    expect(expected, 'the rule gives a phone buffer the full maps').toEqual({ near: 2048, far: 2048 });
    expect(report.shadow, 'no Ultra near rig').not.toBeNull();
    expect(report.shadow?.mapSize, 'the near rig is not sized by the buffer rule').toBe(expected.near);
    expect(report.shadow?.mapSizeReadBack, 'the near map three built').toBe(expected.near);
    if (report.kit?.farShadow) {
      expect(report.farShadow?.mapSize, 'the far map is not sized by the buffer rule').toBe(expected.far);
    }
    const target = (name: string) => report.targets.find((each) => each.name === name);
    expect(target('near-shadow')?.width).toBe(expected.near);
    if (report.kit?.farShadow) expect(target('far-shadow')?.width).toBe(expected.far);
    // A22 (F3): the background cube is in the ledger's model, colour only.
    expect(target('sky-background-cube')?.width).toBe(ULTRA.sky.height);

    const modelled = report.targets.reduce((sum, each) => sum + each.bytes, 0);
    console.log(`[m39-ultra] phone buffer ${report.drawingBuffer.width}x${report.drawingBuffer.height}: `
      + `near ${report.shadow?.mapSize}, far ${report.farShadow?.mapSize ?? 'off'}; ledger `
      + `${(report.bytes.steady / 1048576).toFixed(2)} MiB against the model's ${(modelled / 1048576).toFixed(2)} MiB`);
    expect(report.bytes.steady, 'the ledger holds more than the model at this buffer').toBeLessThanOrEqual(modelled);
    expect(report.bytes.steady).toBeLessThanOrEqual(ULTRA_ENVELOPE.bytes);
    expect(report.bytes.peakSwitch).toBeLessThanOrEqual(ULTRA_ENVELOPE.peakSwitchBytes);

    // The sizes are re-chosen when a resize leaves their band (P-RT; N1's
    // hysteresis: up at 2,000,000 px, back down only below 1,800,000): a
    // tablet-sized window (1280 × 800 CSS → 2560 × 1600 at the DPR-2 cap)
    // takes the full maps, and back down the small ones again. Both ends are
    // far outside the band, so the fresh rule names what each must hold.
    const mapsAt = async (width: number, height: number) => {
      await resizeTo(page, width, height);
      await expect.poll(async () => {
        const live = await page.evaluate(() => window.game.renderer.ultraReport());
        const want = ultraShadowMapSizesFor(live.drawingBuffer.width, live.drawingBuffer.height);
        return live.shadow?.mapSizeReadBack === want.near
          && (live.kit?.farShadow !== true || live.farShadow?.mapSize === want.far);
      }, { message: `the maps did not follow a resize to ${width}×${height}`, timeout: 15_000 }).toBe(true);
      return page.evaluate(() => window.game.renderer.ultraReport());
    };
    const large = await mapsAt(1280, 800);
    expect(large.drawingBuffer.width * large.drawingBuffer.height).toBeGreaterThanOrEqual(2_000_000);
    expect(large.shadow?.mapSize).toBe(ULTRA.near.mapSize);
    if (large.kit?.farShadow) expect(large.farShadow?.mapSize).toBe(ULTRA.farShadow.mapSize);
    expect(large.bytes.steady).toBeLessThanOrEqual(large.targets.reduce((sum, each) => sum + each.bytes, 0));
    const small = await mapsAt(844, 390);
    expect(small.shadow?.mapSize).toBe(2048);
    if (small.kit?.farShadow) expect(small.farShadow?.mapSize).toBe(2048);
    expect(small.bytes.steady, 'a map left behind by the round trip').toBeLessThanOrEqual(modelled);
    expect(small.safetyDemotions).toBe(0);
    expect(errors).toEqual([]);
  });
});

// ===========================================================================
// Journey 10 — a Settings round trip mid Trick Run keeps it eligible
// ===========================================================================

test('journey 10: Settings round trips to Ultra and back in the middle of a Trick Run keep it eligible, and it files', async ({ page }) => {
  // A tier change is not a teleport, a tuning write or a world swap
  // (invariant 4), so §38.5's eligibility latch must not fall — and the proof
  // that it did not is the run filing a best at the end.
  const errors = collectErrors(page);
  await bootAtTier(page, PARK, 'high', { ride: false });
  await installProbes(page);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator('.euc-menu--title [data-menu="trick-run"]').click();
  await waitForState(page, 'trickRun');

  const run = () => page.evaluate(() => {
    const game = window.game;
    const snapshot = game.snapshot();
    return {
      state: snapshot.app.state,
      phase: snapshot.trickRun.phase,
      elapsed: snapshot.trickRun.elapsedSteps,
      eligible: snapshot.trickRun.eligible,
      completed: snapshot.trickRun.completed,
      wasRecord: snapshot.trickRun.wasRecord,
      overrides: game.tuning.overrideCount(),
      samePlan: game.levelPlan === window.m39.planRef,
      effective: snapshot.quality.effective,
      best: game.trickRecords.best(game.levelPlan.id)?.score ?? null,
    };
  });

  // The world the run was armed on is the one every round trip must keep.
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.m39.rememberPlan();
  });
  expect((await run()).eligible).toBe(true);

  for (const tier of ['ultra', 'high', 'ultra'] as const) {
    await page.evaluate(() => {
      window.game.loop.setRunning(false);
      window.game.advance(600);
    });
    await pauseWithEscape(page);
    const paused = await run();
    await page.locator('.euc-menu--pause [data-menu="settings"]').click();
    await waitForState(page, 'settings');
    await page.locator('[data-option="quality"]').selectOption(tier);
    await expect.poll(async () => (await run()).effective, { message: `Settings → ${tier}` }).toBe(tier);
    const changed = await run();
    expect(changed.samePlan, `→ ${tier}: the world was reinstalled`).toBe(true);
    expect(changed.elapsed, `→ ${tier}: the clock aged behind Settings`).toBe(paused.elapsed);
    expect(changed.eligible, `→ ${tier}: the tier change disqualified the attempt`).toBe(true);
    expect(changed.overrides, `→ ${tier}: the tier change wrote live tuning`).toBe(0);
    await page.keyboard.press('Escape');
    await waitForState(page, 'paused');
    await page.locator('.euc-menu--pause [data-menu="resume"]').click();
    await waitForState(page, 'trickRun');
    const resumed = await run();
    expect(resumed.phase).toBe(paused.phase);
    expect(resumed.eligible).toBe(true);
    expect(resumed.effective).toBe(tier);
  }

  // Run the clock out at Ultra, with one charged hop to score (`m38.spec.ts`).
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(120);
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  });
  const finished = await run();
  expect(finished.completed).toBe(true);
  expect(finished.eligible).toBe(true);
  expect(finished.wasRecord, 'an eligible first run at Ultra did not file a best').toBe(true);
  expect(finished.best).not.toBeNull();
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 11 — Switchback's landings stay out of cast shadow under Ultra
// ===========================================================================

/** The widest thing each canopy kind carries, metres at scale 1 — `m36_4.spec.ts`'s table. */
const CANOPY_RADIUS: Readonly<Record<'conifer' | 'broadleafTree', number>> = {
  conifer: Math.max(...PROP_SIZES.conifer.tiers.map((tier) => tier.radius)),
  broadleafTree: PROP_SIZES.broadleafTree.crownRadius,
};

/** The part buckets that may *start* casting under Ultra (§4: buildings, caps, gables). */
const ULTRA_NEW_CASTERS: ReadonlySet<string> = new Set([
  'buildingBody', 'buildingLow', 'buildingTall', 'buildingCap', 'roofGable',
]);
/** The canopy buckets the predicate is about. */
const CANOPY_PARTS: ReadonlySet<string> = new Set(['crown', 'coniferFoliage']);

interface Caster { readonly x: number; readonly z: number; readonly radius: number; readonly reach: number }

/**
 * `m36_4.spec.ts:764`'s predicate, as a pure function: a sample point is in
 * a caster's shadow when it lies down-sun of the caster, within its radius of
 * the shadow's axis, and no further than its reach.
 */
function padShade(pad: { readonly id: string; readonly points: readonly { x: number; z: number }[] },
  casters: readonly Caster[], azimuth: number) {
  const dx = -Math.sin(azimuth);
  const dz = -Math.cos(azimuth);
  let hits = 0;
  let margin = Infinity;
  let worst = { x: 0, z: 0 };
  for (const point of pad.points) {
    for (const caster of casters) {
      const vx = point.x - caster.x;
      const vz = point.z - caster.z;
      const along = vx * dx + vz * dz;
      if (along < 0) continue;
      const off = Math.abs(vx * dz - vz * dx);
      if (off > caster.radius) continue;
      const short = along - caster.reach;
      if (short < margin) { margin = short; worst = point; }
      if (short <= 0) hits += 1;
    }
  }
  return { id: pad.id, samples: pad.points.length, hits, margin: Number.isFinite(margin) ? margin : -1, worst };
}

/** Every casting prop instance in the scene, with its built radius and height above the ground. */
interface BuiltCasters {
  readonly casting: readonly string[];
  readonly live: readonly { part: string; x: number; z: number; radius: number; height: number }[];
}

/**
 * Read every casting `level-props-*` instance off the live scene: its part,
 * where it stands, the furthest any of its vertices reaches from its own axis
 * and how high its top stands above the ground there. Runs in the page.
 */
function builtCasters(): BuiltCasters {
  const game = window.game;
  const casting = new Set<string>();
  const live: { part: string; x: number; z: number; radius: number; height: number }[] = [];
  game.renderer.scene.traverse((object: Object3D) => {
    const mesh = object as InstancedMesh;
    if (mesh.isInstancedMesh !== true || !mesh.name.startsWith('level-props-') || !mesh.castShadow) return;
    const part = mesh.name.slice('level-props-'.length);
    casting.add(part);
    mesh.updateMatrixWorld(true);
    const w = mesh.matrixWorld.elements;
    const instances = mesh.instanceMatrix.array;
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < mesh.count; index += 1) {
      // World × instance, column-major as three stores both.
      const e: number[] = new Array(16).fill(0);
      for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
          let sum = 0;
          for (let k = 0; k < 4; k += 1) sum += w[k * 4 + row] * instances[index * 16 + column * 4 + k];
          e[column * 4 + row] = sum;
        }
      }
      let top = -Infinity;
      let radius = 0;
      for (let v = 0; v < position.count; v += 1) {
        const x = position.getX(v);
        const y = position.getY(v);
        const z = position.getZ(v);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        top = Math.max(top, wy);
        radius = Math.max(radius, Math.hypot(wx - e[12], wz - e[14]));
      }
      const ground = game.sampleGround(e[12], e[14]).height;
      live.push({ part, x: e[12], z: e[14], radius, height: top - ground });
    }
  });
  return { casting: [...casting].sort(), live };
}

test("journey 11: no Switchback landing pad is inside a cast shadow under Ultra — the m36_4 predicate on Ultra's own casters", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootAtTier(page, PARK, 'ultra');
  await installProbes(page);
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.advance(60);
  });
  const facts = await tierFacts(page);
  expect(facts.planId).toBe(PARK_PLAN);
  expectUltraState(facts, 'Switchback');

  // Invariant 9 under Ultra: the park's sacred bearing is the light's.
  const bearing = await page.evaluate(() => {
    const offset = window.m39.rig().sun.offset;
    return {
      azimuth: Math.atan2(offset.x, offset.z),
      elevation: Math.atan2(offset.y, Math.hypot(offset.x, offset.z)),
    };
  });
  expect(bearing.azimuth).toBeCloseTo(SWITCHBACK_SUN.azimuth, 6);
  expect(bearing.elevation).toBeCloseTo(SWITCHBACK_SUN.elevation, 6);

  // The pads' technical band (m36_4's sampling, every 2 m down every landing
  // corridor, at the technical line and 2 m either side) and the plan's
  // canopy, read off the plan the Ultra game installed.
  const evidence = await page.evaluate(({ technicalT }) => {
    const game = window.game;
    const padIds = game.levelPlan.segments
      .filter((segment) => /landing|table|runout|shelf-pad|terrace-drop|timber-steps|crest-down/.test(segment.id))
      .map((segment) => segment.id);
    const pads = padIds.map((id) => {
      const spine = window.qa.routePoints([id], 2);
      const points: { x: number; z: number }[] = [];
      for (let i = 0; i < spine.length; i += 1) {
        const next = spine[Math.min(i + 1, spine.length - 1)];
        const previous = spine[Math.max(i - 1, 0)];
        const ax = next.x - previous.x;
        const az = next.z - previous.z;
        const span = Math.hypot(ax, az) || 1;
        for (const t of [technicalT - 2, technicalT, technicalT + 2]) {
          points.push({ x: spine[i].x + (az / span) * t, z: spine[i].z - (ax / span) * t });
        }
      }
      return { id, points };
    });
    const planCanopy = (game.levelPlan.props ?? [])
      .filter((prop) => prop.kind === 'conifer' || prop.kind === 'broadleafTree')
      .map((prop) => ({
        kind: prop.kind as 'conifer' | 'broadleafTree',
        x: prop.position.x,
        z: prop.position.z,
        scale: prop.scale,
      }));
    return { pads, planCanopy };
  }, { technicalT: 4.25 });

  // Every casting instance as built, at Ultra and then at High.
  const ultraBuilt = await page.evaluate(builtCasters);
  await page.evaluate(() => window.game.setOptions({ quality: 'high' }));
  const highBuilt = await page.evaluate(builtCasters);
  expect(await page.evaluate(() => window.game.renderer.effectiveTier())).toBe('ordinary');

  // Ultra adds casters only where §4 says it may (buildings, caps, gables —
  // none of which the park has).
  const added = ultraBuilt.casting.filter((part) => !highBuilt.casting.includes(part));
  for (const part of added) {
    expect(ULTRA_NEW_CASTERS.has(part), `Ultra made "${part}" cast, which §4 never allows`).toBe(true);
  }

  const perMetre = 1 / Math.tan(SWITCHBACK_SUN.elevation);
  const planCasters: Caster[] = evidence.planCanopy.map((tree) => ({
    x: tree.x,
    z: tree.z,
    radius: CANOPY_RADIUS[tree.kind] * tree.scale,
    reach: (FOREST_HEIGHTS[tree.kind] * tree.scale + FOREST_SHADOW_STAND) * perMetre,
  }));
  const asCasters = (built: BuiltCasters, parts: readonly string[]): Caster[] => built.live
    .filter((caster) => CANOPY_PARTS.has(caster.part) || parts.includes(caster.part))
    .map((caster) => ({
      x: caster.x,
      z: caster.z,
      radius: caster.radius,
      reach: (caster.height + FOREST_SHADOW_STAND) * perMetre,
    }));
  const ultraCasters = asCasters(ultraBuilt, added);
  const highCasters = asCasters(highBuilt, []);
  expect(ultraCasters.length, 'no casting canopy was built under Ultra').toBeGreaterThan(100);
  expect(ultraCasters.length, 'Ultra built a different number of canopy instances')
    .toBe(highCasters.length + ultraBuilt.live.filter((caster) => added.includes(caster.part)).length);

  expect(evidence.pads.length).toBeGreaterThan(4);
  for (const pad of evidence.pads) {
    // The m36_4 predicate exactly — the kit's radii and heights — on the plan
    // the Ultra game installed.
    const planned = padShade(pad, planCasters, SWITCHBACK_SUN.azimuth);
    // The same predicate on what was actually built, vertex by vertex: at High
    // as the reference, at Ultra as the claim. The kit's disc is a model and
    // a real crown's lobes can reach past it, so the built reading is judged
    // against High's own rather than against zero: Ultra's re-formed canopy
    // may not throw shade on a pad that High's does not.
    const high = padShade(pad, highCasters, SWITCHBACK_SUN.azimuth);
    const ultra = padShade(pad, ultraCasters, SWITCHBACK_SUN.azimuth);
    console.log(`[m39-ultra] ${pad.id}: kit canopy ${planned.hits} hits (margin ${planned.margin.toFixed(1)} m); `
      + `built at High ${high.hits} (margin ${high.margin.toFixed(1)} m); `
      + `built at Ultra ${ultra.hits} (margin ${ultra.margin.toFixed(1)} m)`);
    expect(planned.samples).toBeGreaterThan(6);
    expect(planned.hits, `${pad.id}: the plan's canopy shades it`).toBe(0);
    expect(planned.margin, `no canopy stands up-sun of ${pad.id} at all`).toBeGreaterThan(0);
    expect(ultra.hits, `${pad.id}: Ultra's built canopy shades ${ultra.hits} samples, High's ${high.hits}; `
      + `nearest near (${ultra.worst.x.toFixed(1)}, ${ultra.worst.z.toFixed(1)})`).toBeLessThanOrEqual(high.hits);
    if (high.hits > 0) {
      console.log(`[m39-ultra] note: ${pad.id} is already shaded by High's built canopy (${high.hits} samples) — `
        + 'a kit-radius question for the ordinary game, not an Ultra regression');
    }
  }

  // A landing under Ultra, for the GU pack.
  await page.evaluate(() => window.game.setOptions({ quality: 'ultra' }));
  const placed = await page.evaluate(() => window.m39.place({
    name: 'kicker-landing', segment: 'kicker-landing', at: 0, steps: 90,
  }));
  expect(placed.ok, placed.reason).toBe(true);
  await keepShot(testInfo, 'j11-switchback-kicker-landing-ultra', await page.screenshot());
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 12 — an ordinary boot asks for nothing Ultra-only
// ===========================================================================

/**
 * The Ultra modules the source loads **lazily**: every dynamic `import()`
 * whose specifier names Ultra, read from `src/` (comments stripped, type-only
 * `typeof import()` queries skipped). An ordinary boot must not request one.
 * Empty while all Ultra code is in the main graph — A21 kept it there — so
 * the per-chunk check below bites only the day a chunk is split out. What the
 * main graph costs is measured on a real build by the last journey 12
 * (Fable F2: this check was the only "chunk" check, and it never ran).
 */
function lazyUltraModules(): string[] {
  const root = 'src';
  if (!existsSync(root)) throw new Error(`run from the repository root: no ${root}/ here`);
  const found = new Set<string>();
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const source = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const match of source.matchAll(/(?<!typeof\s+)\bimport\s*\(\s*(['"`])([^'"`]+)\1/g)) {
        const specifier = match[2];
        if (/ultra/i.test(specifier)) found.add(specifier.split('/').pop() ?? specifier);
      }
    }
  };
  walk(root);
  return [...found].sort();
}

for (const tier of ['high', 'low'] as const) {
  test(`journey 12: an ordinary ${tier} boot requests no Ultra-only resource or chunk, and its ledger reads 0`, async ({ page }) => {
    const errors = collectErrors(page);
    const requests: { url: string; type: string }[] = [];
    page.on('request', (request) => requests.push({ url: request.url(), type: request.resourceType() }));
    await bootAtTier(page, TOWN, tier);
    await installProbes(page);
    const placed = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
    expect(placed.ok, placed.reason).toBe(true);

    const facts = await tierFacts(page);
    expect(facts.quality).toMatchObject({ requested: tier, effective: tier, reason: null, multiplayer: false, ultraOffered: true });
    expectOrdinaryState(facts, `an ordinary ${tier} boot`);
    // Never asked for, so never reported: no refusal, no request, no timings.
    expect(facts.report.requested).toBe(false);
    expect(facts.report.refusal).toBeNull();
    expect(facts.presentation?.refusal ?? null).toBeNull();
    expect(facts.presentation?.ultraReported, 'presentation() carries an Ultra report nobody asked for').toBe(false);
    expect(facts.report.timings).toEqual({ buildMs: 0, skyMs: 0, envMs: 0, farMs: 0, compileMs: 0 });

    const lazy = lazyUltraModules();
    const pathOf = (url: string): string => {
      try { return new URL(url).pathname; } catch { return url; }
    };
    const ultraModules = requests.filter((request) => /\/render\/ultra\//.test(pathOf(request.url)));
    console.log(`[m39-ultra] ${tier} boot: ${requests.length} requests; ${ultraModules.length} Ultra modules in the `
      + `main graph (priced on a real build below); lazy Ultra chunks in source: ${lazy.length === 0 ? 'none' : lazy.join(', ')}`);
    for (const name of lazy) {
      expect(requests.filter((request) => pathOf(request.url).endsWith(`/${name}`)).map((request) => request.url),
        `an ordinary boot loaded the lazy Ultra chunk ${name}`).toEqual([]);
    }
    // T13's placeholder is imported by nothing, and no post-processing addon exists.
    expect(requests.filter((request) => /ultraAo/i.test(pathOf(request.url))).map((request) => request.url)).toEqual([]);
    expect(requests.filter((request) => /GTAOPass|EffectComposer|OutputPass|examples[/_]jsm|three[/_]addons/i
      .test(request.url)).map((request) => request.url)).toEqual([]);
    // Ultra is code-painted: an asset or data request naming it is a leak.
    expect(requests
      .filter((request) => !['script', 'document', 'stylesheet'].includes(request.type) && /ultra/i.test(request.url))
      .map((request) => request.url)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

/**
 * A21 (Fable F2): the main chunk, measured on a real `github-pages` build
 * rather than inferred. `tools/ultra-bundle.mjs` runs `vite build --mode
 * github-pages` (what `npm run build:pages` builds, without the typecheck)
 * into this test's output folder, finds the entry chunk `index.html` loads,
 * and judges its growth over the recorded pre-Ultra chunk against
 * `ULTRA_ENVELOPE.mainChunkGrowthBytes` (A21, re-settled on the final M39
 * Part P tree: the measured +259.7 KiB + 10 %, 286 KiB; the chunk carries
 * Part P's code as well as Ultra's) and the whole output against
 * `pagesPackageBytes` (8 MiB). This
 * spec already runs inside the validation lock, so the build is one more step
 * of the same heavy job.
 */
test('journey 12: the built main chunk grows within A21\'s ceiling, and the build output fits the Pages budget', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const out = testInfo.outputPath('pages-build');
  const run = spawnSync(process.execPath, ['tools/ultra-bundle.mjs', '--json', '--out', out], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 5 * 60_000,
  });
  const line = run.stdout.trim().split('\n').pop() ?? '';
  expect(line.startsWith('{'), `the build did not report (exit ${run.status}):\n${run.stderr}`).toBe(true);
  const result = JSON.parse(line) as {
    measured: { entry: { path: string; bytes: number; gzipBytes: number }; otherChunks: { path: string; bytes: number }[]; buildBytes: number };
    baseline: { chunk: string; mainChunkBytes: number };
    rows: { name: string; value: number; ceiling: number; pass: boolean }[];
    pass: boolean;
  };
  await testInfo.attach('ultra-bundle.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  const growth = result.rows.find((row) => row.name === 'main chunk growth')!;
  const output = result.rows.find((row) => row.name === 'build output')!;
  console.log(`[m39-ultra] main chunk ${result.measured.entry.path} ${result.measured.entry.bytes} B `
    + `(gzip ${result.measured.entry.gzipBytes}) against the pre-Ultra ${result.baseline.mainChunkBytes} B: `
    + `+${growth.value} B of +${growth.ceiling}; build output ${output.value} B of ${output.ceiling}`);
  expect(result.measured.entry.path).toMatch(/^assets\/index-[\w-]+\.js$/);
  expect(growth.ceiling).toBe(ULTRA_ENVELOPE.mainChunkGrowthBytes);
  expect(output.ceiling).toBe(ULTRA_ENVELOPE.pagesPackageBytes);
  expect(growth.value, 'the main chunk grew past A21\'s ceiling').toBeLessThanOrEqual(growth.ceiling);
  expect(output.value, 'the build output is over the Pages budget').toBeLessThanOrEqual(output.ceiling);
  // Every Ultra module is in the main graph by A21's decision: with no lazy
  // import in the source, the build holds no Ultra chunk beside the main one.
  // (A split-out chunk would show here, and the ordinary-boot journeys above
  // would then check it is never requested.)
  if (lazyUltraModules().length === 0) {
    expect(result.measured.otherChunks.filter((chunk) => /ultra/i.test(chunk.path)).map((chunk) => chunk.path)).toEqual([]);
  }
  expect(result.pass).toBe(true);
  expect(run.status).toBe(0);
});

// ===========================================================================
// Journey 13 — no far map, and the rider is still drawn (A28, Fable F-A1)
// ===========================================================================

/** What `riderDraw` found in one frozen frame: the rider rig's own colour, and the GL error flags. */
interface RiderDraw {
  readonly found: boolean;
  /** The rig's projected box in drawing-buffer pixels (origin bottom left, as `readPixels` reads). */
  readonly box: ScreenRect;
  /** Pixels of the box whose colour changes when the rig's colour writes are off: the rider's own colour. */
  readonly riderPixels: number;
  /** The same count between two renders with the colour writes off: the probe's own noise. */
  readonly noisePixels: number;
  /** Error flags pending when the call began: every frame the loop drew since the last read. */
  readonly pendingErrors: readonly number[];
  /** Error flags raised by the call's own three renders. */
  readonly frameErrors: readonly number[];
  /** The rig's distinct materials, and how many of their current programs declare the light's far sampler. */
  readonly materials: number;
  readonly farSamplerPrograms: number;
}

const GL_INVALID_OPERATION = 0x0502;

/**
 * Fable F-A1's measurement. Three back-to-back renders of the same frozen
 * frame, each read with `readPixels` in the same task: as held; with every
 * rider-rig material's `colorWrite` off (its depth, its shadow and every other
 * draw unchanged); and that again. The first pair differs exactly where the
 * rider's colour landed — a draw ANGLE rejects lands nothing, so the rider
 * Fable found invisible counts 0 — and the second pair is the probe's noise.
 * The rig's box is its meshes' bounding boxes through the live camera. The GL
 * error flags are drained before (all the loop drew since the last read) and
 * after. Which held programs declare the light's far sampler is read from
 * three's own record of each material's current program.
 *
 * `rigName` picks the rig (the cop is `cop-rider`, the pack's patrols
 * `cop2-rider` and `cop3-rider`, M39 Part P). With `aim`, the three
 * renders look at that rig from 5 m in front of it, on the line from the
 * player's rig (the chase camera looks ahead, and the cop rides behind), and
 * the camera is put back after.
 */
function riderDraw(page: Page, rigName = 'riding-rig', aim = false): Promise<RiderDraw> {
  return page.evaluate(({ name, aimAt }) => {
    const game = window.game;
    const renderer = game.renderer;
    const three = renderer.renderer;
    const gl = three.getContext();
    const drain = (): number[] => {
      const codes: number[] = [];
      for (let i = 0; i < 16; i += 1) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        codes.push(code);
      }
      return codes;
    };
    const pendingErrors = drain();
    const rig = renderer.scene.getObjectByName(name);
    if (rig === undefined || !rig.visible) {
      return {
        found: false, box: { x: 0, y: 0, width: 0, height: 0 }, riderPixels: 0, noisePixels: 0,
        pendingErrors, frameErrors: [], materials: 0, farSamplerPrograms: 0,
      };
    }
    const camera = renderer.camera;
    // three's Vector3, from an instance the page already holds (the spec imports nothing into the page).
    const Vector = camera.position.constructor as new () => Vector3;
    const corner = new Vector();
    const savedPosition = camera.position.clone();
    const savedQuaternion = camera.quaternion.clone();
    if (aimAt) {
      const target = new Vector();
      const from = new Vector();
      // A cop's scene child stays put; his posed rig is `<prefix>riding-rig` inside it (`m18.spec.ts`),
      // the prefix being the child's name less `rider` (`cop-`, `cop2-`, `cop3-`).
      const prefix = name.endsWith('-rider') ? name.slice(0, -'rider'.length) : '';
      (rig.getObjectByName(`${prefix}riding-rig`) ?? rig).getWorldPosition(target);
      renderer.scene.getObjectByName('riding-rig')?.getWorldPosition(from);
      const toward = from.sub(target).setY(0);
      if (toward.lengthSq() < 1e-6) toward.set(0, 0, 1);
      toward.normalize().multiplyScalar(5);
      camera.position.copy(target).add(toward).setY(target.y + 1.8);
      camera.lookAt(target.x, target.y + 0.9, target.z);
    }
    camera.updateMatrixWorld();
    rig.updateMatrixWorld(true);
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    let left = Infinity; let right = -Infinity; let bottom = Infinity; let top = -Infinity;
    const materials = new Set<Material>();
    rig.traverseVisible((node: Object3D) => {
      const mesh = node as Mesh;
      if (mesh.isMesh !== true) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
      if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (bounds === null) return;
      for (const cx of [bounds.min.x, bounds.max.x]) {
        for (const cy of [bounds.min.y, bounds.max.y]) {
          for (const cz of [bounds.min.z, bounds.max.z]) {
            corner.set(cx, cy, cz).applyMatrix4(mesh.matrixWorld).project(camera);
            const px = ((corner.x + 1) / 2) * width;
            const py = ((corner.y + 1) / 2) * height;
            left = Math.min(left, px); right = Math.max(right, px);
            bottom = Math.min(bottom, py); top = Math.max(top, py);
          }
        }
      }
    });
    const x = Math.max(0, Math.floor(left));
    const y = Math.max(0, Math.floor(bottom));
    const w = Math.max(0, Math.min(width, Math.ceil(right)) - x);
    const h = Math.max(0, Math.min(height, Math.ceil(top)) - y);
    const read = (): Uint8Array => {
      renderer.render();
      const pixels = new Uint8Array(w * h * 4);
      if (w > 0 && h > 0) gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const differing = (a: Uint8Array, b: Uint8Array): number => {
      let count = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > 12) count += 1;
      }
      return count;
    };
    const held = read();
    const written = new Map<Material, boolean>();
    materials.forEach((material) => {
      written.set(material, material.colorWrite);
      material.colorWrite = false;
    });
    let hidden: Uint8Array = new Uint8Array(0);
    let again: Uint8Array = new Uint8Array(0);
    try {
      hidden = read();
      again = read();
    } finally {
      written.forEach((value, material) => { material.colorWrite = value; });
      camera.position.copy(savedPosition);
      camera.quaternion.copy(savedQuaternion);
      camera.updateMatrixWorld();
    }
    const frameErrors = drain();
    let farSamplerPrograms = 0;
    materials.forEach((material) => {
      const record = three.properties.get(material) as { currentProgram?: { getUniforms(): { map: Record<string, unknown> } } };
      if (record.currentProgram?.getUniforms().map.ultraRiderFarMap !== undefined) farSamplerPrograms += 1;
    });
    return {
      found: true, box: { x, y, width: w, height: h }, riderPixels: differing(held, hidden), noisePixels: differing(hidden, again),
      pendingErrors, frameErrors, materials: materials.size, farSamplerPrograms,
    };
  }, { name: rigName, aimAt: aim });
}

/**
 * The rider is drawn, and nothing drew with an error: no flag since the last
 * read and none from the probe's own renders; the probe's noise is nil and the
 * rider's own colour covers a real share of its box. `far` says whether the
 * held programs must carry the light's sampler (exactly when a far map exists).
 */
function expectRiderDrawn(draw: RiderDraw, far: boolean, where: string): void {
  expect(draw.found, `${where}: no riding rig in the scene`).toBe(true);
  expect(draw.pendingErrors, `${where}: GL errors in the frames the loop drew`).toEqual([]);
  expect(draw.frameErrors, `${where}: GL errors in the probe's renders`).toEqual([]);
  expect(draw.noisePixels, `${where}: the probe sees change with nothing changed`).toBe(0);
  const area = draw.box.width * draw.box.height;
  expect(area, `${where}: the rider's box is off screen`).toBeGreaterThan(10_000);
  expect(draw.riderPixels, `${where}: the rider is not drawn (${draw.riderPixels} of ${area} px)`).toBeGreaterThan(0.2 * area);
  expect(draw.materials).toBeGreaterThan(0);
  if (far) expect(draw.farSamplerPrograms, `${where}: the light is not compiled with a far map`).toBeGreaterThan(0);
  else expect(draw.farSamplerPrograms, `${where}: a held program declares the far sampler with no far map`).toBe(0);
  console.log(`[m39-ultra] ${where}: rider ${draw.riderPixels} of ${area} px in its box; `
    + `${draw.farSamplerPrograms} of ${draw.materials} held programs with the far sampler`);
}

/** One loop-free frame at a time, reading the GL error flags after each. */
async function errorsPerFrame(page: Page, frames: number): Promise<number[][]> {
  return page.evaluate((count) => {
    const gl = window.game.renderer.renderer.getContext();
    const out: number[][] = [];
    for (let frame = 0; frame < count; frame += 1) {
      window.game.advance(1);
      const codes: number[] = [];
      for (let i = 0; i < 16; i += 1) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        codes.push(code);
      }
      out.push(codes);
    }
    return out;
  }, frames);
}

/** Switch the kit in the session, as a `?ultrakit=` change would at the next reconcile, and settle two frames. */
async function switchKit(page: Page, override: { farShadow?: boolean; forms?: boolean } | null): Promise<TierFacts> {
  await page.evaluate((next) => {
    const renderer = window.game.renderer;
    renderer.setUltraWanted(true, next);
    renderer.reconcileUltra();
    window.game.advance(2);
  }, override);
  return tierFacts(page);
}

test('journey 13: with no far map the rider and wheel are drawn with no GL error, and a switch to a far map and back keeps them drawn (F-A1)', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootAtTier(page, 'ultrakit=-farShadow', 'ultra');
  await installProbes(page);

  // The -farShadow rung: Ultra, no far map, inside its envelope.
  const measured = await ultraFrameAt(page, COMMERCIAL);
  expectUltraFrame(measured, 'commercial, -farShadow');
  expect(measured.facts.report.kit?.farShadow).toBe(false);
  expect(measured.facts.report.farShadow).toBeNull();
  expect(measured.facts.report.glErrors ?? [], 'the activation recorded GL errors').toEqual([]);
  const noFar = await riderDraw(page);
  expectRiderDrawn(noFar, false, 'commercial, -farShadow');
  expect(await errorsPerFrame(page, 4), 'a frame raised a GL error').toEqual([[], [], [], []]);
  await keepShot(testInfo, 'j13-commercial-no-far-map', await page.screenshot());
  const programs = measured.facts.report.programs;

  // Into the full kit in the same session: the held rider, wheel and cop
  // materials carry over and re-key for the far map (the light is on here —
  // the commercial rider stands in static shade).
  const full = await switchKit(page, null);
  expectUltraState(full, 'commercial, switched to the far map');
  expect(full.report.farShadow, 'no far map after the switch').not.toBeNull();
  const withFar = await riderDraw(page);
  expectRiderDrawn(withFar, true, 'commercial, switched to the far map');
  expect(await errorsPerFrame(page, 2)).toEqual([[], []]);
  expect(full.report.programs).toBeLessThanOrEqual(ULTRA_ENVELOPE.programs);
  console.log(`[m39-ultra] programs: no far map ${programs}, switched to the far map ${full.report.programs}`);

  // And back: the far variants are released, not kept beside the new ones.
  const back = await switchKit(page, { farShadow: false });
  expectUltraState(back, 'commercial, switched back to no far map');
  expect(back.report.farShadow).toBeNull();
  const again = await riderDraw(page);
  expectRiderDrawn(again, false, 'commercial, switched back to no far map');
  expect(await errorsPerFrame(page, 2)).toEqual([[], []]);
  expect(back.report.programs, 'programs after a round trip through the far map').toBe(programs);
  expect(back.report.programs).toBeLessThanOrEqual(ULTRA_ENVELOPE.programs);
  expect(errors).toEqual([]);

  // The failing control: the pre-repair hold — the light and its far sampler
  // compiled with no far map — planted on the same materials. The probe must
  // see the rider vanish and the draws rejected; then the real hold comes back.
  await page.evaluate(async () => {
    const url = '/src/render/ultra/ultraRiderShadow.ts';
    const patches = await import(/* @vite-ignore */ url) as {
      patchRiderShadowFragment(source: string): string;
      patchRiderLightVertex(source: string): string;
      patchRiderLightFragment(source: string): string;
      riderLightUniforms(source: () => null): Record<string, unknown>;
    };
    const off = patches.riderLightUniforms(() => null);
    const saved: [Material, Material['onBeforeCompile'], Material['customProgramCacheKey']][] = [];
    window.game.renderer.scene.getObjectByName('riding-rig')?.traverse((node: Object3D) => {
      const mesh = node as Mesh;
      if (mesh.isMesh !== true) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (saved.some((entry) => entry[0] === material)) continue;
        saved.push([material, material.onBeforeCompile, material.customProgramCacheKey]);
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = patches.patchRiderShadowFragment(shader.fragmentShader);
          shader.vertexShader = patches.patchRiderLightVertex(shader.vertexShader);
          shader.fragmentShader = patches.patchRiderLightFragment(shader.fragmentShader);
          Object.assign(shader.uniforms, off);
        };
        material.customProgramCacheKey = () => 'm39-f-a1-planted';
        material.needsUpdate = true;
      }
    });
    (window as unknown as { m39Planted: typeof saved }).m39Planted = saved;
  });
  const planted = await riderDraw(page);
  expect(planted.farSamplerPrograms, 'the plant did not compile the far sampler').toBeGreaterThan(0);
  expect([...planted.pendingErrors, ...planted.frameErrors], 'the planted defect raised no INVALID_OPERATION')
    .toContain(GL_INVALID_OPERATION);
  expect(planted.riderPixels, 'the probe still sees a rider whose draws are rejected')
    .toBeLessThan(0.05 * noFar.riderPixels);
  console.log(`[m39-ultra] planted pre-repair hold: rider ${planted.riderPixels} px (healthy ${noFar.riderPixels}); `
    + `errors ${JSON.stringify([...planted.pendingErrors, ...planted.frameErrors])}`);
  await page.evaluate(() => {
    const saved = (window as unknown as { m39Planted: [Material, Material['onBeforeCompile'], Material['customProgramCacheKey']][] }).m39Planted;
    for (const [material, compile, key] of saved) {
      material.dispose();
      material.onBeforeCompile = compile;
      material.customProgramCacheKey = key;
      material.needsUpdate = true;
    }
  });
  const healed = await riderDraw(page);
  expect(healed.frameErrors).toEqual([]);
  expect(healed.riderPixels).toBeGreaterThan(0.2 * healed.box.width * healed.box.height);
});

test('journey 13: on ultra-lit\'s kit (no far map, enhanced forms) the rider, the wheel and the cop are drawn with no GL error (F-A1)', async ({ page }) => {
  const errors = collectErrors(page);
  await bootAtTier(page, 'ultrakit=-farShadow,-forms', 'ultra');
  await installProbes(page);
  const measured = await ultraFrameAt(page, COMMERCIAL);
  expectUltraFrame(measured, 'commercial, ultra-lit kit');
  // `ULTRA_LIT`'s kit switch for switch (only its id differs from this rung's).
  expect(measured.facts.report.kit).toMatchObject({ forms: false, farShadow: false, lighting: true, buildings: true, ground: true });
  expect(measured.facts.report.farShadow).toBeNull();
  const drawn = await riderDraw(page);
  expectRiderDrawn(drawn, false, 'commercial, ultra-lit kit');
  expect(await errorsPerFrame(page, 3)).toEqual([[], [], []]);
  expect(errors).toEqual([]);
});

test('journey 13: in a chase on ultra-lit\'s kit the cop and the rider are drawn with no GL error (F-A1)', async ({ page }) => {
  // The cop takes the same hold, and F-A1 found him invisible too. A chase
  // needs a generated route (`Game.chaseAvailable`), so this is `m18.spec.ts`'s.
  const errors = collectErrors(page);
  // From the title, as `m18.spec.ts` enters it (free ride does not lead to a chase).
  await bootAtTier(page, 'level=generated&seed=route-41&ultrakit=-farShadow,-forms', 'ultra', { ride: false });
  await installProbes(page);
  await page.evaluate(() => { window.game.startChase(); });
  await waitForState(page, 'chase');
  // Stand still and let him close in; the probe's renders then look at him.
  const gap = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    for (let i = 0; i < 60 && game.snapshot().chase.copGap > 12; i += 1) game.advance(10);
    return game.snapshot().chase.copGap;
  });
  expect(gap, 'the cop never closed in').toBeLessThanOrEqual(12);
  const chase = await tierFacts(page);
  expectUltraState(chase, 'the chase, ultra-lit kit');
  expect(chase.report.kit).toMatchObject({ forms: false, farShadow: false });
  expect(chase.report.farShadow).toBeNull();
  const cop = await riderDraw(page, 'cop-rider', true);
  expectRiderDrawn(cop, false, `the cop at ${gap.toFixed(1)} m, ultra-lit kit`);
  // M39 Part P: the two patrols, parked at their posts, draw on the same hold,
  // and every trim of the pack receives on Ultra as the tail does.
  for (const patrol of ['cop2-rider', 'cop3-rider']) {
    expectRiderDrawn(await riderDraw(page, patrol, true), false, `the patrol ${patrol}, ultra-lit kit`);
  }
  const receiving = await page.evaluate(() => ['cop-rider', 'cop2-rider', 'cop3-rider'].map((name) => {
    const child = window.game.renderer.scene.getObjectByName(name);
    let meshes = 0;
    let receive = 0;
    child?.traverse((node) => {
      if ((node as Mesh).isMesh !== true) return;
      meshes += 1;
      if (node.receiveShadow) receive += 1;
    });
    return { name, visible: child?.visible ?? false, meshes, receive };
  }));
  for (const trim of receiving) {
    expect(trim.visible, `${trim.name} is not shown in the solo chase`).toBe(true);
    expect(trim.meshes, `${trim.name} has no meshes`).toBeGreaterThan(0);
    expect(trim.receive, `${trim.name} does not receive on Ultra`).toBe(trim.meshes);
  }
  expectRiderDrawn(await riderDraw(page), false, 'the rider in the chase, ultra-lit kit');
  expect(await errorsPerFrame(page, 3)).toEqual([[], [], []]);
  expect(errors).toEqual([]);
});

// ===========================================================================
// Journey 14 — a world with nothing on the static layer still draws (A28, F-A3)
// ===========================================================================

/**
 * What `farDraw` found in one frozen frame: the far-map programs' own colour,
 * what the far map's sampler is bound to, and the GL error flags.
 */
interface FarDraw {
  /** Distinct scene materials whose current program declares the far map's `sampler2DShadow`, and those programs. */
  readonly farMaterials: number;
  readonly farPrograms: number;
  /** The shared `ultraFarMap` uniform after the frame hook wrote it; null is three's never-uploaded empty depth texture. */
  readonly bound: {
    readonly name: string;
    readonly depth: boolean;
    readonly compare: number;
    readonly width: number;
    readonly height: number;
  } | null;
  /** Buffer pixels whose colour changes when those materials' colour writes are off: what they drew. */
  readonly drawnPixels: number;
  /** The same over the lower half of the buffer (the ground, in a chase view), and that half's area. */
  readonly drawnLower: number;
  readonly lowerArea: number;
  /** The same count between two renders with the colour writes off: the probe's own noise. */
  readonly noisePixels: number;
  /** One road point in front of the rider, off his box: its surface, its pixel, and its colour drawn and hidden. */
  readonly road: {
    readonly surface: string;
    readonly metres: number;
    readonly x: number;
    readonly y: number;
    readonly drawn: readonly number[];
    readonly hidden: readonly number[];
  } | null;
  readonly pendingErrors: readonly number[];
  readonly frameErrors: readonly number[];
}

/**
 * F-A3's measurement, `riderDraw`'s method over the whole world. Three renders
 * of the same frozen frame, each read in the same task: as drawn; with the
 * colour writes off on every material whose program declares the far map's
 * sampler (their depth, their shadows and every other draw unchanged); and
 * that again. The first pair differs exactly where those programs drew — a
 * draw ANGLE rejects lands nothing, so a world whose far sampler is bound to
 * three's never-uploaded depth texture counts 0 — and the second pair is the
 * probe's noise. The class is read from three's own record of each material's
 * current program, so the probe measures exactly the programs at risk.
 */
function farDraw(page: Page): Promise<FarDraw> {
  return page.evaluate(() => {
    const game = window.game;
    const renderer = game.renderer;
    const three = renderer.renderer;
    const gl = three.getContext();
    const drain = (): number[] => {
      const codes: number[] = [];
      for (let i = 0; i < 16; i += 1) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        codes.push(code);
      }
      return codes;
    };
    const pendingErrors = drain();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const read = (): Uint8Array => {
      renderer.render();
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const held = read();

    const materials = new Set<Material>();
    const programs = new Set<unknown>();
    renderer.scene.traverse((node: Object3D) => {
      const mesh = node as Mesh;
      if (mesh.isMesh !== true) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const record = three.properties.get(material) as {
          currentProgram?: { getUniforms(): { map: Record<string, unknown> } };
        };
        const program = record.currentProgram;
        if (program !== undefined && program.getUniforms().map.ultraFarMap !== undefined) {
          materials.add(material);
          programs.add(program);
        }
      }
    });
    const shared = (renderer as unknown as {
      ultra: { shared: { uniforms: Record<string, { value: unknown }> } | null };
    }).ultra.shared;
    const value = (shared?.uniforms.ultraFarMap?.value ?? null) as
      (Texture & { isDepthTexture?: boolean; compareFunction?: number | null }) | null;
    const image = (value?.image ?? null) as { width?: number; height?: number } | null;
    const bound = value === null ? null : {
      name: value.name,
      depth: value.isDepthTexture === true,
      compare: value.compareFunction ?? 0,
      width: image?.width ?? 0,
      height: image?.height ?? 0,
    };

    // A road point in front of the rider and beside his line, off his box.
    const camera = renderer.camera;
    camera.updateMatrixWorld();
    const Vector = camera.position.constructor as new () => Vector3;
    const rig = renderer.scene.getObjectByName('riding-rig');
    let riderBox = { left: 0, right: -1, bottom: 0, top: -1 };
    let road: { surface: string; metres: number; x: number; y: number } | null = null;
    if (rig !== undefined) {
      rig.updateMatrixWorld(true);
      const corner = new Vector();
      let left = Infinity; let right = -Infinity; let bottom = Infinity; let top = -Infinity;
      rig.traverseVisible((node: Object3D) => {
        const mesh = node as Mesh;
        if (mesh.isMesh !== true) return;
        if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox;
        if (bounds === null) return;
        for (const cx of [bounds.min.x, bounds.max.x]) {
          for (const cy of [bounds.min.y, bounds.max.y]) {
            for (const cz of [bounds.min.z, bounds.max.z]) {
              corner.set(cx, cy, cz).applyMatrix4(mesh.matrixWorld).project(camera);
              left = Math.min(left, ((corner.x + 1) / 2) * width);
              right = Math.max(right, ((corner.x + 1) / 2) * width);
              bottom = Math.min(bottom, ((corner.y + 1) / 2) * height);
              top = Math.max(top, ((corner.y + 1) / 2) * height);
            }
          }
        }
      });
      riderBox = { left, right, bottom, top };
      const at = new Vector();
      rig.getWorldPosition(at);
      const ahead = new Vector();
      ahead.copy(at).sub(camera.position).setY(0);
      if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, 1);
      ahead.normalize();
      const point = new Vector();
      for (const [metres, side] of [[10, 1.5], [10, -1.5], [7, 2], [7, -2], [14, 0], [5, 2.5], [5, -2.5]]) {
        const x = at.x + ahead.x * metres + ahead.z * side;
        const z = at.z + ahead.z * metres - ahead.x * side;
        const ground = game.sampleGround(x, z);
        if (!/pavement/i.test(ground.surface)) continue;
        point.set(x, ground.height, z).project(camera);
        const px = Math.round(((point.x + 1) / 2) * width);
        const py = Math.round(((point.y + 1) / 2) * height);
        if (px < 2 || py < 2 || px > width - 3 || py > height - 3) continue;
        if (px >= riderBox.left - 4 && px <= riderBox.right + 4 && py >= riderBox.bottom - 4 && py <= riderBox.top + 4) continue;
        road = { surface: ground.surface, metres, x: px, y: py };
        break;
      }
    }

    const written = new Map<Material, boolean>();
    materials.forEach((material) => {
      written.set(material, material.colorWrite);
      material.colorWrite = false;
    });
    let hidden: Uint8Array = new Uint8Array(0);
    let again: Uint8Array = new Uint8Array(0);
    try {
      hidden = read();
      again = read();
    } finally {
      written.forEach((was, material) => { material.colorWrite = was; });
    }
    const frameErrors = drain();

    const changed = (a: Uint8Array, b: Uint8Array, i: number): boolean =>
      Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 12;
    let drawnPixels = 0;
    let drawnLower = 0;
    let noisePixels = 0;
    const lowerRows = Math.floor(height / 2);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const i = (row * width + column) * 4;
        if (changed(held, hidden, i)) {
          drawnPixels += 1;
          if (row < lowerRows) drawnLower += 1;
        }
        if (changed(hidden, again, i)) noisePixels += 1;
      }
    }
    const colour = (pixels: Uint8Array, x: number, y: number): number[] => {
      const i = (y * width + x) * 4;
      return [pixels[i], pixels[i + 1], pixels[i + 2]];
    };
    return {
      farMaterials: materials.size,
      farPrograms: programs.size,
      bound,
      drawnPixels,
      drawnLower,
      lowerArea: lowerRows * width,
      noisePixels,
      road: road === null ? null : { ...road, drawn: colour(held, road.x, road.y), hidden: colour(hidden, road.x, road.y) },
      pendingErrors,
      frameErrors,
    };
  });
}

/**
 * Every program that declares the far map's sampler drew, and nothing drew
 * with an error: no flag since the last read and none from the probe's own
 * renders, no noise, the lower half of the frame is theirs, and the road point
 * is their colour. The sampler is bound to an uploaded 1×1 compare depth
 * texture whose compare always passes (lit), never three's empty one.
 */
function expectFarDrawn(draw: FarDraw, where: string): void {
  console.log(`[m39-ultra] ${where}: ${draw.farMaterials} materials / ${draw.farPrograms} programs declare the far `
    + `sampler; bound ${JSON.stringify(draw.bound)}; drawn ${draw.drawnPixels} px, lower half `
    + `${draw.drawnLower} of ${draw.lowerArea}; noise ${draw.noisePixels}; road ${JSON.stringify(draw.road)}; `
    + `errors ${JSON.stringify([...draw.pendingErrors, ...draw.frameErrors])}`);
  expect(draw.farMaterials, `${where}: no program declares the far sampler (the probe would measure nothing)`)
    .toBeGreaterThan(0);
  expect(draw.pendingErrors, `${where}: GL errors in the frames the loop drew`).toEqual([]);
  expect(draw.frameErrors, `${where}: GL errors in the probe's renders`).toEqual([]);
  expect(draw.noisePixels, `${where}: the probe sees change with nothing changed`).toBe(0);
  expect(draw.drawnLower, `${where}: the ground is not drawn (${draw.drawnLower} of ${draw.lowerArea} px)`)
    .toBeGreaterThan(0.5 * draw.lowerArea);
  expect(draw.road, `${where}: no road point in front of the rider`).not.toBeNull();
  if (draw.road !== null) {
    const delta = Math.max(...draw.road.drawn.map((value, index) => Math.abs(value - draw.road!.hidden[index])));
    expect(delta, `${where}: the road pixel is not the road's colour`).toBeGreaterThan(12);
  }
  expect(draw.bound, `${where}: the far sampler is bound null (three's never-uploaded depth texture)`).not.toBeNull();
  expect(draw.bound?.depth).toBe(true);
  expect(draw.bound?.name).toBe('ultra-far-shadow-empty');
  // three's `AlwaysCompare`: every lookup answers lit, whatever the texel holds.
  expect(draw.bound?.compare).toBe(519);
  expect([draw.bound?.width, draw.bound?.height]).toEqual([1, 1]);
}

/** The full kit on the installed world, as journey 13 switches it — with nothing joining the static layer while it builds. */
async function switchToFullWithEmptyStaticLayer(page: Page): Promise<TierFacts> {
  await page.evaluate(() => {
    // three's `Layers`, from an instance the page already holds. While this is
    // installed nothing can join `ULTRA_STATIC_LAYER` (5): the props and the
    // blocks call `layers.enable(5)` as they are built (`render/props.ts`,
    // `render/terrain.ts`), so the rebuilt world has no static caster at all,
    // and `UltraFarShadow.build` takes its own "nothing on layer 5" return.
    const proto = Object.getPrototypeOf(window.game.renderer.camera.layers) as { enable(channel: number): void };
    const enable = proto.enable;
    (window as unknown as { m39LayersEnable: typeof enable }).m39LayersEnable = enable;
    proto.enable = function enableExceptStatic(this: unknown, channel: number): void {
      if (channel !== 5) enable.call(this, channel);
    };
  });
  try {
    return await switchKit(page, null);
  } finally {
    await page.evaluate(() => {
      const proto = Object.getPrototypeOf(window.game.renderer.camera.layers) as { enable(channel: number): void };
      proto.enable = (window as unknown as { m39LayersEnable: (channel: number) => void }).m39LayersEnable;
    });
  }
}

test('journey 14: a world with nothing on the static layer builds no far map, and its far-sampling programs are still drawn with no GL error, also after a context restore (F-A3)', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  // The world first comes up without a far map (journey 13's rung), so the
  // switch below is a real re-activation that rebuilds the world.
  await bootAtTier(page, 'ultrakit=-farShadow', 'ultra');
  await installProbes(page);
  const placed = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
  expect(placed.ok, placed.reason).toBe(true);
  const lit = await tierFacts(page);
  expectUltraState(lit, 'commercial, -farShadow');

  // The full kit, whose ground, block, paint, water, facade, foliage and
  // furniture programs all declare the far sampler, on a world with no caster.
  const full = await switchToFullWithEmptyStaticLayer(page);
  expect(full.report.refusal).toBeNull();
  expect(full.report.active).toBe(true);
  expect(full.effectiveTier).toBe('ultra');
  expect(full.report.recipe).toBe('ultra-full');
  expect(full.report.kit?.farShadow).toBe(true);
  expect(full.footprint.staticLayerObjects, 'the static layer is not empty').toBe(0);
  expect(full.report.farShadow, 'a far map was built with nothing to fit').toBeNull();
  console.log(`[m39-ultra] no static caster: programs ${full.report.programs}; ledger ${full.report.bytes.steady} B `
    + `(-farShadow ${lit.report.bytes.steady} B, +${full.report.bytes.steady - lit.report.bytes.steady}); `
    + `activation GL ${JSON.stringify(full.report.glErrors)}`);
  expect(full.report.programs).toBeLessThanOrEqual(ULTRA_ENVELOPE.programs);
  // The ledger: the same world and buffers as the -farShadow rung, plus the empty far map.
  expect(full.report.bytes.steady - lit.report.bytes.steady, 'the empty far map is not in the ledger')
    .toBe(EMPTY_FAR_SHADOW_BYTES);

  const again = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
  expect(again.ok, again.reason).toBe(true);
  const drawn = await farDraw(page);
  expectFarDrawn(drawn, 'commercial, full kit, no static caster');
  expect(full.report.glErrors ?? [], 'the activation\'s first frame raised a GL error').toEqual([]);
  expect(await errorsPerFrame(page, 4), 'a frame raised a GL error').toEqual([[], [], [], []]);
  expectRiderDrawn(await riderDraw(page), false, 'the rider, full kit, no static caster');
  await keepShot(testInfo, 'j14-commercial-no-static-caster', await page.screenshot());

  // The failing control: the pre-repair binding — the far map's uniform null,
  // so three binds its never-uploaded empty depth texture — on the same
  // programs. The probe must see them vanish and the draws rejected. (The
  // frozen loop still draws a frame each animation frame, so the plant's
  // window leaves flags behind; putting it back drains them in the same task.)
  await page.evaluate(() => {
    const shared = (window.game.renderer as unknown as {
      ultra: { shared: { uniforms: Record<string, { value: unknown }> } };
    }).ultra.shared;
    const uniform = shared.uniforms.ultraFarMap;
    (window as unknown as { m39FarValue: unknown }).m39FarValue = uniform.value;
    Object.defineProperty(uniform, 'value', {
      configurable: true,
      get: () => null,
      set: () => undefined,
    });
  });
  const planted = await farDraw(page);
  const plantWindow = await page.evaluate(() => {
    const shared = (window.game.renderer as unknown as {
      ultra: { shared: { uniforms: Record<string, { value: unknown }> } };
    }).ultra.shared;
    const uniform = shared.uniforms.ultraFarMap as { value?: unknown };
    delete uniform.value;
    uniform.value = (window as unknown as { m39FarValue: unknown }).m39FarValue;
    const gl = window.game.renderer.renderer.getContext();
    const codes: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      const code = gl.getError();
      if (code === gl.NO_ERROR) break;
      codes.push(code);
    }
    return codes;
  });
  console.log(`[m39-ultra] planted null far sampler: drawn ${planted.drawnPixels} px (healthy ${drawn.drawnPixels}), `
    + `lower ${planted.drawnLower}; errors ${JSON.stringify([...planted.pendingErrors, ...planted.frameErrors])}; `
    + `left by the plant's window ${JSON.stringify(plantWindow)}`);
  expect(planted.bound, 'the plant did not reach the uniform').toBeNull();
  expect([...planted.pendingErrors, ...planted.frameErrors], 'the planted defect raised no INVALID_OPERATION')
    .toContain(GL_INVALID_OPERATION);
  expect(planted.drawnPixels, 'the probe still sees programs whose draws are rejected')
    .toBeLessThan(0.05 * drawn.drawnPixels);
  const healed = await farDraw(page);
  expectFarDrawn(healed, 'commercial, the plant removed');

  // A context loss and restore on the same world: the far build runs again,
  // finds nothing again, and the fallback is uploaded again on the new context.
  await page.evaluate(() => {
    const context = window.game.renderer.renderer.getContext();
    const extension = context.getExtension('WEBGL_lose_context');
    (window as unknown as { m39Lose: unknown }).m39Lose = extension;
    extension?.loseContext();
  });
  await page.waitForFunction(() => window.game.snapshot().contextLost === true);
  await page.evaluate(() => {
    // The restore's own flags, read at the end of its event (after three's and
    // the renderer's listeners, which were added first), so they are told
    // apart from the flags of any frame drawn after it.
    const canvas = window.game.renderer.renderer.domElement;
    const flags = window as unknown as { m39RestoreFlags: number[] | null };
    flags.m39RestoreFlags = null;
    canvas.addEventListener('webglcontextrestored', () => {
      const gl = window.game.renderer.renderer.getContext();
      const codes: number[] = [];
      for (let i = 0; i < 16; i += 1) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        codes.push(code);
      }
      flags.m39RestoreFlags = codes;
    }, { once: true });
    (window as unknown as { m39Lose: { restoreContext(): void } }).m39Lose.restoreContext();
  });
  await page.waitForFunction(() => window.game.snapshot().contextLost === false);
  await page.waitForFunction(() => window.game.snapshot().loop.running === true);
  const restoreFlags = await page.evaluate(() => (window as unknown as { m39RestoreFlags: number[] | null }).m39RestoreFlags);
  console.log(`[m39-ultra] flags left by the restore event itself: ${JSON.stringify(restoreFlags)}`);
  // Nothing is set aside (A28, FE): Ultra releases what the restore rebuilds
  // while the context is lost, so the restore deletes no pre-loss object and
  // raises no error at all (journey 15 plants the old order as its control).
  expect(restoreFlags, 'the restore event never ran the flag reader').not.toBeNull();
  expect(restoreFlags, 'the restore event raised a GL error').toEqual([]);
  const restored = await tierFacts(page);
  expect(restored.report.active, 'Ultra did not survive the restore').toBe(true);
  expect(restored.report.recipe).toBe('ultra-full');
  expect(restored.report.farShadow).toBeNull();
  expect(restored.footprint.staticLayerObjects).toBe(0);
  const back = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
  expect(back.ok, back.reason).toBe(true);
  expectFarDrawn(await farDraw(page), 'commercial, no static caster, after a context restore');
  expect(await errorsPerFrame(page, 2)).toEqual([[], []]);
  await keepShot(testInfo, 'j14-commercial-no-static-caster-restored', await page.screenshot());

  const mechanism = /CONTEXT_LOST_WEBGL|context lost|context restored/i;
  expect(errors.filter((line) => !mechanism.test(line))).toEqual([]);
});

// ===========================================================================
// Journey 15 — a context restore under Ultra raises nothing and changes nothing (A28, FE)
// ===========================================================================

/**
 * The pixel classes journey 15 compares — where each resource the restore
 * rebuilds shows in the frame:
 *
 * - `roadShade`: pavement and road in shade in front of the rider — the
 *   environment's indirect light and the far map's static shade;
 * - `facadeShade`: the building bodies' shaded pixels — the environment;
 * - `sky`: every pixel the background draws — the sky's background cube.
 *
 * "In shade" is measured, not assumed: a pixel whose luma moves by 2 or less
 * when the sun's intensity goes to 0, so what lights it is the environment
 * (and the Ultra shade lift, which reads the far map). "Sky" is a pixel that
 * turns exactly magenta when the background is a magenta colour.
 */
type RestoreClass = 'roadShade' | 'facadeShade' | 'sky';
const RESTORE_CLASSES: readonly RestoreClass[] = ['roadShade', 'facadeShade', 'sky'];

interface RestoreReference {
  readonly size: readonly number[];
  /** Pixels that differ between two renders of the frozen frame: the probe's own noise. */
  readonly noise: number;
  readonly counts: Readonly<Record<RestoreClass, number>>;
  readonly luma: Readonly<Record<RestoreClass, number>>;
  readonly lumaSunOff: Readonly<Record<RestoreClass, number>>;
  /** The PMREM target's texels as read back (RGBA float), and their mean. */
  readonly envTexels: number;
  readonly envMean: number;
  readonly probeErrors: readonly number[];
}

interface ClassDelta {
  readonly pixels: number;
  /** Mean over the class of each pixel's largest channel difference, 0–255. */
  readonly meanAbs: number;
  readonly max: number;
  /** Share of the class whose largest channel difference is over 2. */
  readonly shareOver2: number;
  readonly lumaBefore: number;
  readonly lumaAfter: number;
}

interface RestoreComparison {
  /** GL flags left by the frames the loop drew since the restore. */
  readonly pending: readonly number[];
  readonly lit: Readonly<Record<RestoreClass, ClassDelta>>;
  /** The same classes with the sun off: indirect light only, the environment's whole share. */
  readonly sunOff: Readonly<Record<RestoreClass, ClassDelta>>;
  readonly framePixelsChanged: number;
  /** The rebuilt PMREM against the pre-loss one, texel for texel; null when none is hung. */
  readonly env: { readonly max: number; readonly mean: number } | null;
  readonly probeErrors: readonly number[];
}

interface RestoreProbe {
  reference(): RestoreReference;
  compare(): RestoreComparison;
}

declare global {
  interface Window {
    m39Restore: RestoreProbe;
  }
}

/**
 * Install `window.m39Restore`. Runs in the page (imports nothing, closes over
 * nothing here), on the frozen loop: every read is a render of the same frame
 * followed by `readPixels` in the same task, as `farDraw` reads.
 */
function installRestoreProbe(): void {
  const game = window.game;
  const renderer = game.renderer;
  const three = renderer.renderer;
  const gl = three.getContext() as WebGL2RenderingContext;
  const rig = (renderer as unknown as {
    lighting: { environment: { target?: { width: number; height: number } } | null };
  }).lighting;
  const drain = (): number[] => {
    const codes: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      const code = gl.getError();
      if (code === gl.NO_ERROR) break;
      codes.push(code);
    }
    return codes;
  };
  const read = (): Uint8Array => {
    renderer.render();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const sun = (): DirectionalLight => {
    let found: DirectionalLight | null = null;
    renderer.scene.traverse((object: Object3D) => {
      if ((object as DirectionalLight).isDirectionalLight === true) found = object as DirectionalLight;
    });
    if (found === null) throw new Error('no sun');
    return found;
  };
  const readSunOff = (): Uint8Array => {
    const light = sun();
    const intensity = light.intensity;
    light.intensity = 0;
    try {
      return read();
    } finally {
      light.intensity = intensity;
    }
  };
  /** The PMREM target, RGBA float (EXT_color_buffer_float, which Ultra's half-float probe implies). */
  const readEnvironment = (): Float32Array | null => {
    const target = rig.environment?.target;
    if (target === undefined) return null;
    const previous = three.getRenderTarget();
    const face = three.getActiveCubeFace();
    const level = three.getActiveMipmapLevel();
    three.setRenderTarget(target as unknown as Parameters<WebGLRenderer['setRenderTarget']>[0]);
    try {
      const texels = new Float32Array(target.width * target.height * 4);
      gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texels);
      return texels;
    } finally {
      three.setRenderTarget(previous, face, level);
    }
  };
  const luma = (pixels: Uint8Array, i: number): number => 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
  const meanLuma = (pixels: Uint8Array, list: readonly number[]): number =>
    list.length === 0 ? 0 : list.reduce((sum, i) => sum + luma(pixels, i), 0) / list.length;

  let held: Uint8Array | null = null;
  let heldSunOff: Uint8Array | null = null;
  let heldEnvironment: Float32Array | null = null;
  let classes: Record<RestoreClass, number[]> | null = null;

  const reference = (): RestoreReference => {
    drain();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const lit = read();
    const again = read();
    const dark = readSunOff();
    const scene = renderer.scene;
    const background = scene.background;
    const Colour = (scene.fog as Fog).color.constructor as new (r: number, g: number, b: number) => Fog['color'];
    scene.background = new Colour(1, 0, 1);
    let magenta: Uint8Array;
    try {
      magenta = read();
    } finally {
      scene.background = background;
    }
    let noise = 0;
    for (let i = 0; i < lit.length; i += 4) {
      if (lit[i] !== again[i] || lit[i + 1] !== again[i + 1] || lit[i + 2] !== again[i + 2]) noise += 1;
    }
    const isSky = (i: number): boolean => magenta[i] === 255 && magenta[i + 1] === 0 && magenta[i + 2] === 255;
    const inShade = (i: number): boolean => !isSky(i) && luma(lit, i) > 3 && luma(lit, i) - luma(dark, i) <= 2;

    const sky: number[] = [];
    for (let i = 0; i < lit.length; i += 4) if (isSky(i)) sky.push(i);

    // Facade bodies: `facadeRects` is CSS pixels from the top; readPixels rows count from the bottom.
    const facadeShade: number[] = [];
    const seenFacade = new Set<number>();
    const canvas = three.domElement.getBoundingClientRect();
    const sx = width / canvas.width;
    const sy = height / canvas.height;
    for (const rect of window.m39.facadeRects(8)) {
      for (let y = Math.max(0, Math.floor(rect.y * sy)); y < Math.min(height, Math.ceil((rect.y + rect.height) * sy)); y += 1) {
        for (let x = Math.max(0, Math.floor(rect.x * sx)); x < Math.min(width, Math.ceil((rect.x + rect.width) * sx)); x += 1) {
          const i = ((height - 1 - y) * width + x) * 4;
          if (!seenFacade.has(i) && inShade(i)) {
            seenFacade.add(i);
            facadeShade.push(i);
          }
        }
      }
    }

    // Road in shade: pavement and road points on a grid ahead of the rider, 5×5 texels round each.
    const camera = renderer.camera;
    camera.updateMatrixWorld();
    const Vector = camera.position.constructor as new () => Vector3;
    const rider = scene.getObjectByName('riding-rig');
    if (rider === undefined) throw new Error('no riding rig');
    const at = new Vector();
    rider.getWorldPosition(at);
    const ahead = new Vector().copy(at).sub(camera.position).setY(0);
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, 1);
    ahead.normalize();
    const point = new Vector();
    const roadShade: number[] = [];
    const seenRoad = new Set<number>();
    for (let metres = 3; metres <= 45; metres += 1.5) {
      for (let side = -8; side <= 8; side += 1) {
        const x = at.x + ahead.x * metres + ahead.z * side;
        const z = at.z + ahead.z * metres - ahead.x * side;
        const ground = game.sampleGround(x, z);
        if (!/pavement|road/i.test(ground.surface)) continue;
        point.set(x, ground.height, z).project(camera);
        const px = Math.round(((point.x + 1) / 2) * width);
        const py = Math.round(((point.y + 1) / 2) * height);
        if (px < 3 || py < 3 || px > width - 4 || py > height - 4) continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const i = ((py + dy) * width + (px + dx)) * 4;
            if (!seenRoad.has(i) && inShade(i)) {
              seenRoad.add(i);
              roadShade.push(i);
            }
          }
        }
      }
    }

    held = lit;
    heldSunOff = dark;
    heldEnvironment = readEnvironment();
    classes = { roadShade, facadeShade, sky };
    const environment = heldEnvironment;
    let envSum = 0;
    if (environment !== null) for (let i = 0; i < environment.length; i += 1) envSum += environment[i];
    const table = (pixels: Uint8Array): Record<RestoreClass, number> => ({
      roadShade: meanLuma(pixels, roadShade),
      facadeShade: meanLuma(pixels, facadeShade),
      sky: meanLuma(pixels, sky),
    });
    return {
      size: [width, height],
      noise,
      counts: { roadShade: roadShade.length, facadeShade: facadeShade.length, sky: sky.length },
      luma: table(lit),
      lumaSunOff: table(dark),
      envTexels: environment?.length ?? 0,
      envMean: environment === null || environment.length === 0 ? 0 : envSum / environment.length,
      probeErrors: drain(),
    };
  };

  const delta = (before: Uint8Array, after: Uint8Array, list: readonly number[]): ClassDelta => {
    let sum = 0;
    let max = 0;
    let over = 0;
    for (const i of list) {
      const d = Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2]));
      sum += d;
      if (d > max) max = d;
      if (d > 2) over += 1;
    }
    const pixels = list.length;
    return {
      pixels,
      meanAbs: pixels === 0 ? 0 : sum / pixels,
      max,
      shareOver2: pixels === 0 ? 0 : over / pixels,
      lumaBefore: meanLuma(before, list),
      lumaAfter: meanLuma(after, list),
    };
  };

  const compare = (): RestoreComparison => {
    if (held === null || heldSunOff === null || classes === null) throw new Error('no reference taken');
    const pending = drain();
    const lit = read();
    const dark = readSunOff();
    const environment = readEnvironment();
    let changed = 0;
    for (let i = 0; i < lit.length; i += 4) {
      if (lit[i] !== held[i] || lit[i + 1] !== held[i + 1] || lit[i + 2] !== held[i + 2]) changed += 1;
    }
    let env: RestoreComparison['env'] = null;
    if (environment !== null && heldEnvironment !== null && environment.length === heldEnvironment.length) {
      let max = 0;
      let sum = 0;
      for (let i = 0; i < environment.length; i += 1) {
        max = Math.max(max, Math.abs(environment[i] - heldEnvironment[i]));
        sum += environment[i];
      }
      env = { max, mean: sum / environment.length };
    }
    const reference = classes;
    const before = held;
    const beforeDark = heldSunOff;
    const table = (a: Uint8Array, b: Uint8Array): Record<RestoreClass, ClassDelta> => ({
      roadShade: delta(a, b, reference.roadShade),
      facadeShade: delta(a, b, reference.facadeShade),
      sky: delta(a, b, reference.sky),
    });
    return {
      pending,
      lit: table(before, lit),
      sunOff: table(beforeDark, dark),
      framePixelsChanged: changed,
      env,
      probeErrors: drain(),
    };
  };

  window.m39Restore = { reference, compare };
}

/**
 * What one loss and restore planted:
 *
 * - `none`: the real thing;
 * - `old-order`: the fix planted out — `UltraRuntime.onContextLost` and the
 *   renderer's walk (`releaseLostContext`, CL, which reaches the same three
 *   targets through the scene) both do nothing, so the restore disposes the
 *   pre-loss environment and far map on the new context, as it did before
 *   A28 FE (the flag check's control);
 * - `no-walk`: only the renderer's walk planted out — the tree before the CL
 *   follow-up, whose later paths delete the lost context's objects (journey
 *   16's control);
 * - `environment`, `sky-cube`, `far-map`: that one rebuild skipped, so the
 *   restored frame keeps whatever the lost context left (each class's control).
 */
type RestorePlant = 'none' | 'old-order' | 'no-walk' | 'environment' | 'sky-cube' | 'far-map';

/**
 * Lose the context and restore it, with `plant` in place from before the
 * loss until the end of the restore event. Returns the GL flags read while
 * the context was lost, and the ones the restore event left — read at its
 * end, after three's and the renderer's own listeners (added first), before
 * any frame could draw.
 */
async function loseAndRestore(page: Page, plant: RestorePlant): Promise<{ lost: number[]; restored: number[] | null }> {
  await page.evaluate((which) => {
    const renderer = window.game.renderer as unknown as {
      renderer: WebGLRenderer;
      ultra: Record<string, unknown> & { skyBackground: Record<string, unknown> | null };
      lighting: Record<string, unknown> & { refreshUltra(rebuild: boolean): void };
    };
    const undo: (() => void)[] = [];
    const plantOn = (host: Record<string, unknown>, name: string, value: unknown): void => {
      const own = Object.prototype.hasOwnProperty.call(host, name);
      const previous = host[name];
      host[name] = value;
      undo.push(() => {
        if (own) host[name] = previous;
        else delete host[name];
      });
    };
    if (which === 'old-order') plantOn(renderer.ultra, 'onContextLost', () => undefined);
    if (which === 'old-order' || which === 'no-walk') {
      plantOn(renderer as unknown as Record<string, unknown>, 'releaseLostContext', () => undefined);
    }
    if (which === 'environment') {
      const rig = renderer.lighting;
      const refresh = rig.refreshUltra;
      plantOn(rig, 'refreshUltra', () => refresh.call(rig, false));
    }
    if (which === 'sky-cube') {
      if (renderer.ultra.skyBackground === null) throw new Error('no background cube to plant on');
      plantOn(renderer.ultra.skyBackground, 'rebake', () => undefined);
    }
    if (which === 'far-map') plantOn(renderer.ultra, 'buildFar', () => undefined);

    const canvas = renderer.renderer.domElement;
    const flags = window as unknown as { m39RestoreFlags: number[] | null };
    flags.m39RestoreFlags = null;
    canvas.addEventListener('webglcontextrestored', () => {
      const gl = renderer.renderer.getContext();
      const codes: number[] = [];
      for (let i = 0; i < 16; i += 1) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        codes.push(code);
      }
      flags.m39RestoreFlags = codes;
      for (const step of undo.reverse()) step();
    }, { once: true });
    const extension = renderer.renderer.getContext().getExtension('WEBGL_lose_context');
    (window as unknown as { m39Lose: unknown }).m39Lose = extension;
    extension?.loseContext();
  }, plant);
  await page.waitForFunction(() => window.game.snapshot().contextLost === true);
  const lost = await page.evaluate(() => {
    const gl = window.game.renderer.renderer.getContext();
    const codes: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      const code = gl.getError();
      if (code === gl.NO_ERROR) break;
      codes.push(code);
    }
    return codes;
  });
  await page.evaluate(() => {
    (window as unknown as { m39Lose: { restoreContext(): void } }).m39Lose.restoreContext();
  });
  await page.waitForFunction(() => window.game.snapshot().contextLost === false);
  await page.waitForFunction(() => window.game.snapshot().loop.running === true);
  const restored = await page.evaluate(() => (window as unknown as { m39RestoreFlags: number[] | null }).m39RestoreFlags);
  return { lost, restored };
}

/** WebGL's own report of a lost context, which `getError` answers once after the loss. */
const GL_CONTEXT_LOST_WEBGL = 0x9242;

/** Within the probe's noise: the restored class is the pre-loss one. */
function sameAsBefore(delta: ClassDelta): boolean {
  return delta.meanAbs <= 0.5 && delta.shareOver2 <= 0.005;
}

function logComparison(label: string, cycle: { lost: number[]; restored: number[] | null }, compared: RestoreComparison): void {
  const cells = (table: Readonly<Record<RestoreClass, ClassDelta>>): string => RESTORE_CLASSES
    .map((name) => `${name} ${table[name].lumaBefore.toFixed(2)}→${table[name].lumaAfter.toFixed(2)} `
      + `|Δ| ${table[name].meanAbs.toFixed(3)} max ${table[name].max} >2 ${(100 * table[name].shareOver2).toFixed(2)}%`)
    .join('; ');
  console.log(`[m39-ultra] restore (${label}): lost ${JSON.stringify(cycle.lost)}, restore event ${JSON.stringify(cycle.restored)}; `
    + `frame px changed ${compared.framePixelsChanged}; env ${JSON.stringify(compared.env)}; lit: ${cells(compared.lit)}; `
    + `sun off: ${cells(compared.sunOff)}; probe GL ${JSON.stringify([...compared.pending, ...compared.probeErrors])}`);
}

/** A real restore: no GL flag, every class and the PMREM as before the loss. */
function expectRestoredAsBefore(cycle: { lost: number[]; restored: number[] | null }, compared: RestoreComparison, where: string): void {
  expect(cycle.lost.filter((code) => code !== GL_CONTEXT_LOST_WEBGL), `${where}: the loss raised a GL error`).toEqual([]);
  expect(cycle.restored, `${where}: the restore event never ran the flag reader`).not.toBeNull();
  expect(cycle.restored, `${where}: the restore event raised a GL error`).toEqual([]);
  expect(compared.pending, `${where}: a frame after the restore raised a GL error`).toEqual([]);
  expect(compared.probeErrors, `${where}: the probe's own renders raised a GL error`).toEqual([]);
  for (const name of RESTORE_CLASSES) {
    expect(sameAsBefore(compared.lit[name]), `${where}: ${name} is not the pre-loss frame: ${JSON.stringify(compared.lit[name])}`).toBe(true);
    expect(sameAsBefore(compared.sunOff[name]), `${where}: ${name} with the sun off is not the pre-loss frame: ${JSON.stringify(compared.sunOff[name])}`).toBe(true);
  }
  expect(compared.env, `${where}: no environment to read back after the restore`).not.toBeNull();
  expect(compared.env?.max ?? Infinity, `${where}: the rebuilt PMREM is not the pre-loss one`).toBeLessThanOrEqual(1e-3);
}

test('journey 15: a context loss and restore under Ultra raises no GL error, and the restored frame is the pre-loss one in shade, in the sky and with the sun off (A28, FE)', async ({ page }) => {
  const errors = collectErrors(page);
  await bootAtTier(page, TOWN, 'ultra');
  await installProbes(page);
  await page.evaluate(installRestoreProbe);
  const placed = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
  expect(placed.ok, placed.reason).toBe(true);
  const before = await tierFacts(page);
  expectUltraState(before, 'commercial, before the loss');
  expect(before.report.recipe).toBe('ultra-full');
  // The three resources the restore rebuilds are all here to be compared.
  expect(before.report.environment, 'no environment before the loss').not.toBeNull();
  expect(before.report.farShadow, 'no far map before the loss').not.toBeNull();
  expect(before.footprint.backgroundCube, 'no background cube before the loss').toBeGreaterThan(0);

  const reference = await page.evaluate(() => window.m39Restore.reference());
  console.log(`[m39-ultra] restore reference: ${JSON.stringify(reference)}`);
  expect(reference.noise, 'two renders of the frozen frame differ').toBe(0);
  expect(reference.probeErrors).toEqual([]);
  expect(reference.counts.roadShade, 'too little road in shade to judge').toBeGreaterThan(500);
  expect(reference.counts.facadeShade, 'too little facade in shade to judge').toBeGreaterThan(5000);
  expect(reference.counts.sky, 'too little sky to judge').toBeGreaterThan(5000);
  // Shade with the sun off keeps its light: the environment (and the lift) light it.
  expect(reference.lumaSunOff.roadShade, 'the road in shade is black with the sun off').toBeGreaterThan(20);
  expect(reference.lumaSunOff.facadeShade, 'the facades in shade are black with the sun off').toBeGreaterThan(20);
  expect(reference.envTexels, 'the PMREM was not read back').toBeGreaterThan(0);
  expect(reference.envMean, 'the PMREM read back black').toBeGreaterThan(0.05);

  const cycle = async (plant: RestorePlant): Promise<{ cycle: { lost: number[]; restored: number[] | null }; compared: RestoreComparison }> => {
    const result = await loseAndRestore(page, plant);
    const again = await page.evaluate((view) => window.m39.place(view), COMMERCIAL);
    expect(again.ok, again.reason).toBe(true);
    const compared = await page.evaluate(() => window.m39Restore.compare());
    logComparison(plant, result, compared);
    return { cycle: result, compared };
  };

  // The real restore.
  const real = await cycle('none');
  expectRestoredAsBefore(real.cycle, real.compared, 'the restore');
  const restored = await tierFacts(page);
  expectUltraState(restored, 'commercial, after the restore');
  expect(restored.report.farShadow?.builtAtMs ?? 0, 'the far map was not rebuilt').toBeGreaterThan(before.report.farShadow?.builtAtMs ?? 0);
  expect(restored.report.environment).not.toBeNull();
  expect(restored.footprint.backgroundCube).toBe(before.footprint.backgroundCube);

  // The flag check's control: the old order (the pre-loss environment and far
  // map deleted on the restored context) raises exactly the old error, and
  // changes no pixel — a rejected delete frees and binds nothing.
  const old = await cycle('old-order');
  expect(old.cycle.restored, 'the old order no longer raises INVALID_OPERATION: the flag check cannot fail')
    .toEqual([GL_INVALID_OPERATION]);
  for (const name of RESTORE_CLASSES) expect(sameAsBefore(old.compared.lit[name]), `old order: ${name}`).toBe(true);

  // Each class's control: skip one rebuild, and the class that shows it fails.
  const noEnvironment = await cycle('environment');
  expect(noEnvironment.cycle.restored).toEqual([]);
  expect(noEnvironment.compared.env, 'the environment control still hung an environment').toBeNull();
  expect(noEnvironment.compared.lit.roadShade.meanAbs, 'a missing environment went unseen on the road in shade').toBeGreaterThan(10);
  expect(noEnvironment.compared.lit.facadeShade.meanAbs, 'a missing environment went unseen on the facades').toBeGreaterThan(10);
  expect(sameAsBefore(noEnvironment.compared.lit.sky), 'the sky moved without its cube moving').toBe(true);

  const noSkyCube = await cycle('sky-cube');
  expect(noSkyCube.cycle.restored).toEqual([]);
  expect(noSkyCube.compared.lit.sky.meanAbs, 'an unbaked background cube went unseen in the sky').toBeGreaterThan(10);
  expect(sameAsBefore(noSkyCube.compared.lit.roadShade), 'the road moved without the environment moving').toBe(true);
  expect(sameAsBefore(noSkyCube.compared.lit.facadeShade)).toBe(true);

  const noFarMap = await cycle('far-map');
  expect(noFarMap.cycle.restored).toEqual([]);
  expect((await tierFacts(page)).report.farShadow, 'the far-map control still built one').toBeNull();
  expect(sameAsBefore(noFarMap.compared.lit.roadShade), 'a missing far map went unseen on the road in shade').toBe(false);
  expect(sameAsBefore(noFarMap.compared.lit.sky)).toBe(true);

  // And a real restore after all of them puts everything back.
  const recovered = await cycle('none');
  expectRestoredAsBefore(recovered.cycle, recovered.compared, 'the restore after the controls');
  expect(await errorsPerFrame(page, 3), 'a frame after the restores raised a GL error').toEqual([[], [], []]);
  expectUltraState(await tierFacts(page), 'commercial, after the controls');

  const mechanism = /CONTEXT_LOST_WEBGL|context lost|context restored/i;
  expect(errors.filter((line) => !mechanism.test(line))).toEqual([]);
});

// ===========================================================================
// Journey 16 — after a restore, no later path deletes the lost context's objects (A28 follow-up, CL)
// ===========================================================================

/** What one step did to the GL, and the frame drawn after it (`installGlWatch`). */
interface GlStep {
  /** `delete*` calls the step made. */
  readonly deletes: number;
  /** Rejected deletes by method: each a WebGL object of the lost context deleted on the restored one. */
  readonly rejected: Readonly<Record<string, number>>;
  /** Every other code the step raised, and the frame's. */
  readonly codes: readonly number[];
  /** The frame after the step: draw calls, distinct colours on a 64 × 36 grid, and the grid's lit share. */
  readonly frame: { readonly calls: number; readonly distinct: number; readonly lit: number };
}

interface GlWatch {
  /** Drain and return what is pending, then count from here. */
  begin(): number[];
  /** Draw a frame, read it, and return what the step did. */
  end(): GlStep;
}

declare global {
  interface Window {
    m39GlWatch: GlWatch;
    m39OldBookkeeping?: Record<string, WeakRef<object>>;
  }
}

/**
 * Install `window.m39GlWatch`. Runs in the page. Every `delete*` method of the
 * context is wrapped **on the instance** — three calls them through the same
 * object, so the own property shadows the prototype's — and, between `begin`
 * and `end` only, drains the flags before and after each call, so a code the
 * call raised is a rejected delete and is counted by method (GL keeps one flag
 * per code, so a flag read at the end of a step would say "something" once).
 * Outside a step the wrappers pass straight through.
 */
function installGlWatch(): void {
  const renderer = window.game.renderer;
  const gl = renderer.renderer.getContext() as WebGL2RenderingContext;
  const methods = gl as unknown as Record<string, (...args: unknown[]) => unknown>;
  const drain = (): number[] => {
    const codes: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      const code = gl.getError();
      if (code === gl.NO_ERROR) break;
      codes.push(code);
    }
    return codes;
  };
  let armed = false;
  let deletes = 0;
  let rejected: Record<string, number> = {};
  let codes: number[] = [];
  const names = [
    'deleteBuffer', 'deleteFramebuffer', 'deleteProgram', 'deleteQuery', 'deleteRenderbuffer', 'deleteSampler',
    'deleteShader', 'deleteSync', 'deleteTexture', 'deleteTransformFeedback', 'deleteVertexArray',
  ];
  for (const name of names) {
    const original = methods[name];
    if (typeof original !== 'function') continue;
    methods[name] = (...args: unknown[]): unknown => {
      if (!armed) return original.apply(gl, args);
      codes.push(...drain());
      const result = original.apply(gl, args);
      deletes += 1;
      if (drain().length > 0) rejected[name] = (rejected[name] ?? 0) + 1;
      return result;
    };
  }
  window.m39GlWatch = {
    begin(): number[] {
      const pending = drain();
      armed = true;
      deletes = 0;
      rejected = {};
      codes = [];
      return pending;
    },
    end(): GlStep {
      codes.push(...drain());
      renderer.render();
      const calls = renderer.renderer.info.render.calls;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      codes.push(...drain());
      armed = false;
      const seen = new Set<number>();
      let lit = 0;
      for (let row = 0; row < 36; row += 1) {
        for (let column = 0; column < 64; column += 1) {
          const x = Math.floor(((column + 0.5) * width) / 64);
          const y = Math.floor(((row + 0.5) * height) / 36);
          const i = (y * width + x) * 4;
          seen.add(((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3));
          if (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2] > 10) lit += 1;
        }
      }
      return { deletes, rejected: { ...rejected }, codes: [...codes], frame: { calls, distinct: seen.size, lit: lit / (64 * 36) } };
    },
  };
}

type Step = GlStep & { readonly label: string; readonly pending: readonly number[] };

/** Run `action` between `begin` and `end`, logging what it did. */
async function glStep(page: Page, label: string, action: () => Promise<unknown>): Promise<Step> {
  const pending = await page.evaluate(() => window.m39GlWatch.begin());
  await action();
  const step = { label, pending, ...(await page.evaluate(() => window.m39GlWatch.end())) };
  const rejected = Object.values(step.rejected).reduce((sum, n) => sum + n, 0);
  console.log(`[m39-ultra] cl: ${label}: ${step.deletes} deletes, ${rejected} rejected ${JSON.stringify(step.rejected)}; `
    + `codes ${JSON.stringify(step.codes)}; pending ${JSON.stringify(pending)}; frame ${JSON.stringify(step.frame)}`);
  return step;
}

/** A step after a restore: nothing pending, no rejected delete, no code, and a drawn frame. */
function expectCleanStep(step: Step): void {
  const where = step.label;
  expect(step.pending, `${where}: a GL flag was pending before the step`).toEqual([]);
  expect(step.rejected, `${where}: the step deleted WebGL objects of the lost context`).toEqual({});
  expect(step.codes, `${where}: the step or the frame after it raised a GL error`).toEqual([]);
  expect(step.frame.calls, `${where}: the frame after the step drew nothing`).toBeGreaterThan(0);
  expect(step.frame.distinct, `${where}: the frame after the step is flat`).toBeGreaterThan(24);
  expect(step.frame.lit, `${where}: the frame after the step is dark`).toBeGreaterThan(0.5);
}

/** A real loss and restore: only WebGL's own report at the loss, nothing at the restore, then a clean first frame. */
async function restoreClean(page: Page, label: string, steps: Step[]): Promise<void> {
  const cycle = await loseAndRestore(page, 'none');
  expect(cycle.lost.filter((code) => code !== GL_CONTEXT_LOST_WEBGL), `${label}: the loss raised a GL error`).toEqual([]);
  expect(cycle.restored, `${label}: the restore event raised a GL error`).toEqual([]);
  await page.evaluate(() => window.game.loop.setRunning(false));
  const first = await glStep(page, `${label}: the first frame`, async () => undefined);
  expectCleanStep(first);
  steps.push(first);
}

/** The city's plan id: the `slice` venue (`m36_5.spec.ts`). */
const CITY_PLAN = 'm7-slice';

/**
 * The paths, each taken the way a player takes it: the QA bridge for the
 * state machine and the options (as the journeys above), the fresh-route
 * panel's venue row for a world swap (`m36_5.spec.ts`'s press).
 */
const paths = (page: Page) => ({
  quality: (level: QualityLevel) => () => page.evaluate((wanted) => {
    window.game.setOptions({ quality: wanted });
    window.game.advance(2);
  }, level),
  titleAndBack: () => () => page.evaluate(() => {
    const game = window.game;
    game.setAppState('paused');
    game.setAppState('title');
    game.setAppState('freeRide');
    game.loop.setRunning(false);
    game.advance(2);
  }),
  rider: (character: string) => () => page.evaluate((id) => {
    window.game.setOptions({ character: id as never });
    window.game.advance(2);
  }, character),
  couch: () => () => page.evaluate(() => {
    const game = window.game;
    game.spawnSecondRider();
    game.advance(2);
    game.despawnSecondRider();
    game.advance(2);
    // The session ends at the title: a saved Ultra comes back there.
    game.setAppState('paused');
    game.setAppState('title');
    game.setAppState('freeRide');
    game.loop.setRunning(false);
    game.advance(2);
  }),
  /** The town (a world with no lap) → BelVar's track day: the mode brings its world. */
  trackDay: () => () => page.evaluate(() => {
    const game = window.game;
    game.setAppState('title');
    game.startTrackDay();
    game.loop.setRunning(false);
    game.advance(2);
  }),
  /** BelVar's track day → Switchback's trick run: the park's own look, so a new sky too. */
  trickRun: () => () => page.evaluate(() => {
    const game = window.game;
    game.endTrackDay();
    game.startTrickRun();
    game.loop.setRunning(false);
    game.advance(2);
  }),
  /** Any ride → the title → Fresh route → a venue press → free ride on it. */
  venue: (id: 'slice' | 'track' | 'switchback', plan: string) => async () => {
    await page.evaluate(() => {
      if (window.game.snapshot().app.state !== 'title') window.game.setAppState('title');
    });
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
    await page.locator(`.euc-menu--routes [data-menu="venue"][data-venue="${id}"]`).click();
    await page.waitForFunction((wanted) => window.game.levelPlan.id === wanted, plan);
    await page.evaluate(() => {
      const game = window.game;
      game.setAppState('freeRide');
      game.loop.setRunning(false);
      game.advance(2);
    });
  },
});

async function planAndTier(page: Page): Promise<{ plan: string; tier: string; glErrors: readonly unknown[] }> {
  return page.evaluate(() => {
    const renderer = window.game.renderer;
    return {
      plan: window.game.levelPlan.id,
      tier: renderer.effectiveTier(),
      glErrors: renderer.ultraReport().glErrors,
    };
  });
}

/** WebGL's and Ultra's own warnings: a rejected delete prints one, and so does an Ultra stage that read a GL error. */
function collectGlWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && /WebGL|gl\.getError/.test(message.text())) warnings.push(message.text());
  });
  return warnings;
}

/**
 * Take a step and hold it to `expectCleanStep`; a step that should have
 * disposed something (`disposes`) must also have made a delete, so a path
 * that silently did nothing cannot pass for a clean one.
 */
async function cleanStep(page: Page, steps: Step[], label: string, action: () => Promise<unknown>, disposes: boolean): Promise<Step> {
  const step = await glStep(page, label, action);
  steps.push(step);
  expectCleanStep(step);
  if (disposes) expect(step.deletes, `${label}: the path disposed nothing — it did not run`).toBeGreaterThan(0);
  return step;
}

test('journey 16: after a context restore no later path deletes an object of the lost context on an ordinary tier — quality both ways, the title, a rider swap, a couch seat, world swaps — every frame draws, and three\'s pre-loss bookkeeping becomes unreachable (A28 follow-up, CL)', async ({ page }) => {
  const errors = collectErrors(page);
  const warnings = collectGlWarnings(page);
  await bootAtTier(page, TOWN, 'high');
  await page.evaluate(installGlWatch);
  await page.evaluate(() => window.game.loop.setRunning(false));
  const go = paths(page);
  const steps: Step[] = [];
  const run = (label: string, action: () => Promise<unknown>, disposes = true): Promise<Step> =>
    cleanStep(page, steps, label, action, disposes);
  const plan = async (): Promise<string> => (await planAndTier(page)).plan;

  // The bookkeeping three builds before the first loss, held weakly.
  await page.evaluate(() => {
    const three = window.game.renderer.renderer as unknown as Record<string, object>;
    window.m39OldBookkeeping = Object.fromEntries(
      ['properties', 'info', 'shadowMap', 'state', 'renderLists'].map((name) => [name, new WeakRef(three[name])]),
    );
  });

  // High: the quality ladder down and back up, right after a restore.
  await restoreClean(page, 'High', steps);
  await run('High → Medium', go.quality('medium'));
  await run('Medium → Low', go.quality('low'));
  await run('Low → High', go.quality('high'));

  // High: the title, a rider swap, a couch seat, three world swaps.
  await restoreClean(page, 'High again', steps);
  await run('ride → title → ride', go.titleAndBack(), false);
  await run('a rider swap (the rig and the ghost rebuilt)', go.rider('trollina'));
  await run('a couch seat in and out', go.couch());
  await run('the town → BelVar (track day)', go.trackDay());
  expect(await plan()).toBe('belvar-r1');
  await run('BelVar → Switchback (trick run, a new sky)', go.trickRun());
  expect(await plan()).toBe(PARK_PLAN);
  await run('Switchback → the city (a venue press, the sky back)', go.venue('slice', CITY_PLAN));

  // Low and Medium: a restore on each, then a world swap and a step up.
  await run('→ Low', go.quality('low'));
  await restoreClean(page, 'Low', steps);
  await run('the city → BelVar at Low', go.venue('track', 'belvar-r1'));
  await run('Low → Medium', go.quality('medium'));
  await restoreClean(page, 'Medium', steps);
  await run('BelVar → Switchback at Medium', go.venue('switchback', PARK_PLAN));
  await run('Medium → High', go.quality('high'));

  // Two losses and restores back to back, then a world swap.
  await restoreClean(page, 'High, twice (1)', steps);
  await restoreClean(page, 'High, twice (2)', steps);
  await run('Switchback → the city after two restores', go.venue('slice', CITY_PLAN));

  // Nothing holds three's pre-loss bookkeeping any more.
  const cdp = await page.context().newCDPSession(page);
  for (let pass = 0; pass < 2; pass += 1) {
    await cdp.send('HeapProfiler.collectGarbage');
    await twoFrames(page);
  }
  const alive = await page.evaluate(() => Object.entries(window.m39OldBookkeeping ?? {})
    .filter(([, ref]) => ref.deref() !== undefined)
    .map(([name]) => name));
  expect(alive, 'three\'s pre-loss bookkeeping is still reachable').toEqual([]);

  expect(warnings, 'a WebGL warning was printed').toEqual([]);
  const mechanism = /CONTEXT_LOST_WEBGL|context lost|context restored/i;
  expect(errors.filter((line) => !mechanism.test(line))).toEqual([]);
});

test('journey 16: after a context restore under Ultra no later path deletes an object of the lost context — world swaps, the exit and the way back, a couch seat, Ultra ↔ Low, a second restore — and no activation records a GL error (A28 follow-up, CL)', async ({ page }) => {
  const errors = collectErrors(page);
  const warnings = collectGlWarnings(page);
  await bootAtTier(page, TOWN, 'high');
  await installProbes(page);
  await page.evaluate(installGlWatch);
  await page.evaluate(() => window.game.loop.setRunning(false));
  const go = paths(page);
  const steps: Step[] = [];
  const run = async (label: string, action: () => Promise<unknown>, tier: 'ultra' | 'ordinary'): Promise<void> => {
    await cleanStep(page, steps, label, action, true);
    const facts = await planAndTier(page);
    expect(facts.tier, `${label}: the tier`).toBe(tier);
    expect(facts.glErrors, `${label}: the Ultra activation recorded a GL error`).toEqual([]);
  };

  // Entering Ultra right after a restore on High.
  await restoreClean(page, 'High', steps);
  await run('High → Ultra', go.quality('ultra'), 'ultra');
  expectUltraState(await tierFacts(page), 'Ultra after a restore on High');

  // Under Ultra: a restore, then world swaps — FE's `stale` and `far-shadow` stages.
  await restoreClean(page, 'Ultra', steps);
  await run('the town → BelVar at Ultra', go.trackDay(), 'ultra');
  expect((await planAndTier(page)).plan).toBe('belvar-r1');
  await run('BelVar → Switchback at Ultra (trick run, a new sky)', go.trickRun(), 'ultra');
  expect((await planAndTier(page)).plan).toBe(PARK_PLAN);

  // A restore, then the exit and the way back.
  await restoreClean(page, 'Ultra again', steps);
  await run('Ultra → High (the exit)', go.quality('high'), 'ordinary');
  await run('High → Ultra (re-entry)', go.quality('ultra'), 'ultra');

  // Two losses and restores back to back, then a world swap.
  await restoreClean(page, 'Ultra, twice (1)', steps);
  await restoreClean(page, 'Ultra, twice (2)', steps);
  await run('Switchback → the city at Ultra after two restores', go.venue('slice', CITY_PLAN), 'ultra');

  // A restore, then a couch seat: the multiplayer demotion, and Ultra back at the session's end.
  await restoreClean(page, 'Ultra before a couch seat', steps);
  await run('a couch seat in and out under a saved Ultra', go.couch(), 'ultra');

  // Ultra ↔ Low, each right after a restore.
  await restoreClean(page, 'Ultra before Low', steps);
  await run('Ultra → Low', go.quality('low'), 'ordinary');
  await restoreClean(page, 'Low before Ultra', steps);
  await run('Low → Ultra', go.quality('ultra'), 'ultra');
  expectUltraState(await tierFacts(page), 'Ultra at the end');

  expect(warnings, 'a WebGL or Ultra GL warning was printed').toEqual([]);
  const mechanism = /CONTEXT_LOST_WEBGL|context lost|context restored/i;
  expect(errors.filter((line) => !mechanism.test(line))).toEqual([]);
});

test('journey 16 (control): with the renderer\'s release planted out, the same paths delete the lost context\'s objects again, an Ultra swap records it, and the old bookkeeping stays reachable (A28 follow-up, CL)', async ({ page }) => {
  // The tree before CL: Ultra's own release (FE) stands, the renderer's walk
  // is planted out for the loss. The paths above must then read the old
  // failure, or their checks could not see it.
  const warnings = collectGlWarnings(page);
  await bootAtTier(page, TOWN, 'high');
  await page.evaluate(installGlWatch);
  await page.evaluate(() => window.game.loop.setRunning(false));
  const go = paths(page);
  const total = (step: Step): number => Object.values(step.rejected).reduce((sum, n) => sum + n, 0);
  await page.evaluate(() => {
    window.m39OldBookkeeping = { properties: new WeakRef(window.game.renderer.renderer.properties as unknown as object) };
  });
  const cycle = await loseAndRestore(page, 'no-walk');
  expect(cycle.restored, 'a High restore deletes nothing, with or without the walk').toEqual([]);
  await page.evaluate(() => window.game.loop.setRunning(false));
  const quality = await glStep(page, 'control: High → Medium', go.quality('medium'));
  expect(quality.rejected.deleteTexture ?? 0, 'the pre-loss shadow map was not deleted on the restored context')
    .toBeGreaterThan(0);
  const swap = await glStep(page, 'control: the town → BelVar', go.trackDay());
  expect(total(swap), 'the pre-loss world was not deleted on the restored context').toBeGreaterThan(100);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await twoFrames(page);
  await cdp.send('HeapProfiler.collectGarbage');
  expect(await page.evaluate(() => window.m39OldBookkeeping?.properties.deref() !== undefined),
    'the memory check cannot fail: the old bookkeeping died with the walk planted out').toBe(true);
  expect(warnings.some((line) => /does not belong to this context/.test(line)), 'WebGL printed no rejected delete')
    .toBe(true);

  // Under Ultra the next world swap's activation records it (FE's residual:
  // the watch is not armed, so the activation's own stage reads see the
  // flag), and after another restore the exit deletes the lost Ultra world.
  await bootAtTier(page, TOWN, 'ultra');
  await page.evaluate(installGlWatch);
  await page.evaluate(() => window.game.loop.setRunning(false));
  await loseAndRestore(page, 'no-walk');
  await page.evaluate(() => window.game.loop.setRunning(false));
  await go.trackDay()();
  const swapped = await planAndTier(page);
  console.log(`[m39-ultra] cl: control: the town → BelVar at Ultra records ${JSON.stringify(swapped.glErrors)}`);
  expect(swapped.tier).toBe('ultra');
  expect(swapped.glErrors.map((finding) => (finding as { code: number }).code), 'the Ultra swap recorded no INVALID_OPERATION')
    .toContain(GL_INVALID_OPERATION);
  await loseAndRestore(page, 'no-walk');
  await page.evaluate(() => window.game.loop.setRunning(false));
  const exit = await glStep(page, 'control: Ultra → High (the exit)', go.quality('high'));
  expect(total(exit), 'the pre-loss Ultra world was not deleted at the exit').toBeGreaterThan(100);
});
