/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { DIAGNOSTICS, EUC } from '../data/tuning.ts';
import type { ActionSnapshot } from '../input/actions.ts';
import type { LoopStats } from '../app/loop.ts';
import type { EucSnapshot } from '../simulation/EucController.ts';
import type { AudioSnapshot } from '../audio/AudioEngine.ts';
import { wrapAngle } from '../shared/maths.ts';
import type { ProfileReport } from './profile.ts';
import { ensureDiagnosticStyles } from './panelStyles.ts';

/**
 * The debug overlay: what the simulation currently believes, in text.
 *
 * Half of the M1 exit question — *can I see the simulation's state?* — is
 * answered here, and the other half by the tuning panel.
 *
 * **A diagnostic that runs whether or not anyone is looking is part of the
 * frame budget** (master starter 16.2). Three things follow, and all three are
 * structural rather than a matter of remembering:
 *
 *   1. The DOM is built on first show, not at construction, so an unopened
 *      overlay is a boolean and nothing else.
 *   2. `shouldRefresh()` is public, so the *caller* can skip assembling the
 *      context object at all on the ~11 frames out of 12 that would be thrown
 *      away. Gating inside the widget would still pay for the report.
 *   3. Formatters are cached. `toFixed` is cheap; a fresh `Intl.NumberFormat`
 *      per call is not, and it is the classic way an overlay comes to cost
 *      more than the thing it measures.
 *
 * The context is a caller-owned mutable object, filled in place, so a visible
 * overlay does not allocate a fresh report every refresh either.
 */

export interface DebugContext {
  tick: number;
  simTimeSeconds: number;
  loop: LoopStats;
  actions: ActionSnapshot;
  consumed: Readonly<Record<string, number>>;
  euc: EucSnapshot;
  cameraMode: string;
  /** Spring-arm length actually in use, after any obstruction pull-in. */
  cameraDistance: number;
  cameraFov: number;
  cameraLookAhead: number;
  cameraBank: number;
  /** How far the camera is currently behind the heading, radians. */
  cameraYawLag: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  profile: ProfileReport;
  tuningOverrides: number;
  /** The audio model and context state (M8). */
  audio: AudioSnapshot;
}

const MS = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const COUNT = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const AXIS = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});

function flags(actions: ActionSnapshot): string {
  const active: string[] = [];
  if (actions.crouch) active.push('crouch');
  if (actions.hop) active.push('hop');
  if (actions.reset) active.push('reset');
  if (actions.cameraCycle) active.push('camera');
  if (actions.pause) active.push('pause');
  return active.length > 0 ? active.join(' ') : '—';
}

export class DebugOverlay {
  private readonly doc: Document;
  private root: HTMLElement | null = null;
  private values = new Map<string, HTMLElement>();
  private shown = false;
  private lastRefreshMs = -Infinity;
  private readonly refreshIntervalMs: number;

  constructor(doc: Document = document) {
    this.doc = doc;
    this.refreshIntervalMs = 1000 / DIAGNOSTICS.overlayRefreshHz;
  }

  get visible(): boolean {
    return this.shown;
  }

  toggle(): void {
    this.setVisible(!this.shown);
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    if (visible) {
      this.build();
      // Force the next update through, so opening the overlay does not show a
      // blank or stale panel for up to a fifth of a second.
      this.lastRefreshMs = -Infinity;
    }
    if (this.root) this.root.hidden = !visible;
  }

  /**
   * Whether enough time has passed to redraw. Call this before building the
   * context — that is the point of it being public.
   */
  shouldRefresh(nowMs: number): boolean {
    return this.shown && nowMs - this.lastRefreshMs >= this.refreshIntervalMs;
  }

  update(context: DebugContext, nowMs: number): void {
    if (!this.shown || !this.root) return;
    this.lastRefreshMs = nowMs;

    const loop = context.loop;
    this.set('tick', COUNT.format(context.tick));
    this.set('simtime', `${MS.format(context.simTimeSeconds)} s`);
    this.set('state', loop.running ? 'running' : 'FROZEN');
    this.set(
      'scheduler',
      loop.timerFallback ? 'timer fallback' : `raf${loop.firstFrameMs === null ? ' (pending)' : ''}`,
      loop.timerFallback,
    );
    this.set(
      'firstframe',
      loop.firstFrameMs === null ? '—' : `${MS.format(loop.firstFrameMs)} ms`,
    );
    this.set('frames', `${COUNT.format(loop.frames)} (${COUNT.format(loop.syntheticFrames)} synthetic)`);
    this.set('steps', `${COUNT.format(loop.stepsLastFrame)} this frame`);
    this.set('dropped', COUNT.format(loop.droppedSteps), loop.droppedSteps > 0);
    this.set('alpha', MS.format(loop.alpha));

    this.set('throttle', AXIS.format(context.actions.throttle));
    this.set('steer', AXIS.format(context.actions.steer));
    this.set('actions', flags(context.actions));
    this.set(
      'consumed',
      Object.entries(context.consumed)
        .map(([name, count]) => `${name} ${count}`)
        .join('  '),
    );

    // The ride. From M2 this is the authoritative answer to "what is the wheel
    // actually doing", and the thing an owner tuning with F4 open reads.
    const euc = context.euc;
    this.set('ridestate', euc.state);
    this.set('speed', `${MS.format(euc.speedKph)} km/h  (${MS.format(euc.speed)} m/s)`);
    this.set(
      'ridepos',
      `${MS.format(euc.position.x)}, ${MS.format(euc.position.y)}, ${MS.format(euc.position.z)}`,
    );
    this.set('heading', `${MS.format(wrapAngle(euc.headingY))} rad`);
    this.set(
      'lean',
      `${MS.format(euc.leanPitch)} force  (rider ${MS.format(euc.riderPitch)}, `
        + `wheel ${MS.format(euc.wheelPitch)})`,
    );
    this.set('longitudinal', `${MS.format(euc.longitudinalAccel)} m/s²`);
    // Four numbers because M30 made them four: the wheel's bank, the lean the
    // cornering *force* asks for (`riderLean`), the share of it the upper body
    // takes, and — from Phase 3b — how settled the bank is, which is what
    // decides whether the body is on the schedule at all. The first three are
    // equal in pairs on the shipped build and come apart when the wheel
    // saturates (§30.7) or the F4 share leaves 1.0; the fourth is 1 in a held
    // carve and falls to 0 through a flick, which is the row to watch while
    // tuning the settle sliders. Called `force` rather than `lean` because the
    // row above already spends that word on the fore-aft `leanPitch`.
    this.set(
      'roll',
      `${MS.format(euc.rollAngle)} rad  (force ${MS.format(euc.riderLean)}`
        + `, upper ${MS.format(euc.riderRoll)}, settle ${MS.format(euc.leanSettle)})`,
    );
    this.set(
      'lateral',
      `${MS.format(euc.lateralAccel)} m/s²  yaw ${MS.format(euc.yawRate)} rad/s`
        + (euc.lateralLimited ? '  LIMIT' : ''),
      euc.lateralLimited,
    );
    this.set('ridden', `${COUNT.format(euc.distanceTravelled)} m`);
    this.set('look', `${MS.format(euc.riderLookYaw)} rad`);

    // The ground. From M4 this is what the exit question is asked against, so
    // it reports the values the ride actually used rather than the table's.
    this.set(
      'surface',
      `${euc.surface}${euc.offCourse ? ' (off course)' : ''}`
        + `${euc.grounded ? '' : '  AIRBORNE'}`,
      !euc.grounded,
    );
    this.set(
      'resistance',
      `${MS.format(euc.rollingResistance)} m/s²  grip ${MS.format(euc.lateralLimitG)} g`,
    );
    this.set(
      'slope',
      `${MS.format(euc.slope)} rad  (${MS.format(euc.slopeAccel)} m/s²)`,
    );
    this.set(
      'suspension',
      `${MS.format(euc.suspensionOffset * 100)} cm travel`
        + `  (${MS.format(euc.suspensionCompression * 100)} cm closed)`,
    );
    this.set(
      'contact',
      euc.blocked
        ? `BLOCKED  impact ${MS.format(euc.collisionImpact)} m/s`
        : euc.lastStepUp > 0
          ? `step up ${MS.format(euc.lastStepUp * 100)} cm`
          : euc.curbAhead !== 0
            ? `${MS.format(euc.curbAhead * 100)} cm ahead`
            : 'clear',
      euc.blocked,
    );

    // Hop, air, landing, pedal strike. From M5 this is what an owner tuning
    // the hop with F4 open reads, and the exit question — *is hopping a curb
    // satisfying enough that I do it for no reason?* — is answered against it.
    this.set(
      'air',
      euc.grounded
        ? euc.compressing
          ? `compressing (charge ${MS.format(euc.hopCharge)})`
          : `grounded  charge ${MS.format(euc.crouchCharge)}`
        : `${MS.format(euc.airHeight * 100)} cm up  apex ${MS.format(euc.airApex * 100)} cm  `
          + `${MS.format(euc.airTime)} s  v ${MS.format(euc.verticalVelocity)} m/s`,
      !euc.grounded,
    );
    this.set(
      'airaim',
      `${COUNT.format(euc.hops)} hops  yaw off travel ${MS.format(euc.airMisalignment)} rad`,
    );
    this.set(
      'landing',
      euc.landingQuality === 'none'
        ? '—'
        : `${euc.landingQuality}  impact ${MS.format(euc.landingImpact)} m/s  `
          + `off ${MS.format(euc.landingMisalignment)} rad  score ${MS.format(euc.landingScore)}  `
          + `-${MS.format(euc.landingSpeedLoss * 100)}%  (${COUNT.format(euc.landings)})`,
      euc.landingQuality === 'wobble' || euc.landingQuality === 'crash',
    );
    this.set(
      'pedal',
      euc.pedalStrike === 0
        ? `clear (${MS.format(euc.pedalClearance)} rad)`
        : `SCRAPING ${MS.format(Math.abs(euc.pedalStrike))} rad past `
          + `${MS.format(euc.pedalClearance)} on the ${euc.pedalStrike > 0 ? 'left' : 'right'}`,
      euc.pedalStrike !== 0,
    );

    // Wobble, power, and crash. From M6 this is what the exit question — *do I
    // understand what went wrong?* — is asked against, and until audio (M8) and
    // the HUD (M9) arrive it is the only place the ladder's first two rungs are
    // spelled out in words. The machine's own status light carries them in the
    // world; this carries the numbers behind it.
    this.set(
      'wobble',
      `${MS.format(euc.wobbleEnergy)} energy  ${MS.format(euc.wobbleYaw)} rad  `
        + `${euc.wobbleRate >= 0 ? '+' : ''}${MS.format(euc.wobbleRate)}/s`,
      euc.wobbleEnergy >= EUC.wobbleStateEnergy,
    );
    this.set(
      'wobblesmooth',
      `${MS.format(euc.wobbleSmoothness)} input  `
        + `${MS.format(euc.wobbleFootCorrection)} feet`,
    );
    this.set(
      'power',
      `${MS.format(euc.loadFactor)} load  ${euc.powerStage}`
        + (euc.tiltBack > 0 ? `  tilt-back ${MS.format(euc.tiltBack)}` : ''),
      euc.powerStage === 'warn' || euc.powerStage === 'tiltBack',
    );
    this.set(
      'crash',
      euc.crashed
        ? `${euc.crashMotion} from ${euc.crashCause}  ${MS.format(euc.crashTime)} s  `
          + `${euc.recoveryReady ? 'recovery ready' : 'holding'}`
        : euc.invulnerable > 0
          ? `recovering — invulnerable ${MS.format(euc.invulnerable)} s`
          : euc.crashes === 0
            ? '—'
            : `${COUNT.format(euc.crashes)} so far (last: ${euc.crashMotion} `
              + `from ${euc.crashCause})`,
      euc.crashed,
    );
    this.set(
      'safespot',
      `${MS.format(euc.safePosition.x)}, ${MS.format(euc.safePosition.z)}  `
        + `heading ${MS.format(wrapAngle(euc.safeHeading))} rad`,
    );

    // The camera. From M3 this is the second thing an owner tuning with F4
    // open reads, because every value here is one a slider moves.
    this.set('camera', context.cameraMode);
    this.set(
      'camarm',
      `${MS.format(context.cameraDistance)} m  fov ${MS.format(context.cameraFov)} rad`,
    );
    this.set(
      'camaim',
      `${MS.format(context.cameraLookAhead)} m ahead  bank ${MS.format(context.cameraBank)} rad`,
    );
    this.set('camlag', `${MS.format(context.cameraYawLag)} rad behind heading`);

    this.set('viewport', `${context.viewportWidth}x${context.viewportHeight} @${context.pixelRatio}x`);
    this.set('draws', `${COUNT.format(context.drawCalls)} draws  ${COUNT.format(context.triangles)} tris`);
    this.set(
      'gpu',
      `${COUNT.format(context.geometries)} geo  ${COUNT.format(context.textures)} tex  `
        + `${COUNT.format(context.programs)} prog`,
    );

    const profile = context.profile;
    this.set(
      'simms',
      `p50 ${MS.format(profile.simMs.p50)}  p95 ${MS.format(profile.simMs.p95)}  `
        + `p99 ${MS.format(profile.simMs.p99)}`,
    );
    this.set(
      'renderms',
      `p50 ${MS.format(profile.renderMs.p50)}  p95 ${MS.format(profile.renderMs.p95)}  `
        + `p99 ${MS.format(profile.renderMs.p99)}`,
    );
    this.set(
      'window',
      `${COUNT.format(profile.sampled)} real frames`
        + (profile.syntheticExcluded > 0
          ? `, ${COUNT.format(profile.syntheticExcluded)} synthetic excluded`
          : ''),
    );

    // Audio (M8). The exit question is *does the wheel sound alive, and is the
    // right thing the loudest thing* — and the second half is a balance
    // question that cannot be answered by listening alone once four voices are
    // moving at once. These are the numbers behind what is being heard, and
    // they are reported whether or not there is a context, because "no sound"
    // has at least four different causes and they are worth telling apart.
    const audio = context.audio;
    this.set(
      'audiostate',
      audio.supported
        ? `${audio.contextState}${audio.armed ? '' : ' (awaiting a gesture)'}`
          + `${audio.armed && !audio.samplesLoaded ? '  samples loading' : ''}`
          + `${audio.muted ? '  MUTED' : ''}`
        : 'no Web Audio in this browser',
      !audio.supported || audio.muted || (audio.armed && !audio.samplesLoaded),
    );
    this.set(
      'audiomix',
      `bed ${MS.format(audio.bedGain)}  duck ${MS.format(audio.duck)}`
        + `  master ${MS.format(audio.volumes.master)}`,
      audio.duck > 0.05,
    );
    this.set(
      'audiomotor',
      `${COUNT.format(audio.motorHz)} Hz  gain ${MS.format(audio.motorGain)}`
        + `  cut ${COUNT.format(audio.motorCutoffHz)} Hz`
        + (audio.regenGain > 0.01 ? `  REGEN Q ${MS.format(audio.motorQ)}` : ''),
      audio.regenGain > 0.01,
    );
    this.set(
      'audioworld',
      `wind ${MS.format(audio.windGain)}  tyre ${MS.format(audio.tyreGain)}`
        + `  ${audio.tyreVoice || '—'}`
        + (audio.scrapeGain > 0.01 ? `  scrape ${MS.format(audio.scrapeGain)}` : ''),
    );
    this.set(
      'audiovoices',
      `${COUNT.format(audio.voices)} live  ${COUNT.format(audio.permanentNodes)} nodes`
        + (audio.droppedVoices > 0 ? `  ${COUNT.format(audio.droppedVoices)} DROPPED` : ''),
      audio.droppedVoices > 0,
    );
    this.set(
      'audioplayed',
      Object.entries(audio.played)
        .map(([kind, count]) => `${kind} ${count}`)
        .join('  '),
    );

    this.set(
      'overrides',
      context.tuningOverrides === 0
        ? 'none'
        : `${COUNT.format(context.tuningOverrides)} active`,
      context.tuningOverrides > 0,
    );
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
    this.values.clear();
    this.shown = false;
  }

  private set(key: string, text: string, warn = false): void {
    const element = this.values.get(key);
    if (!element) return;
    // Writing an unchanged string still invalidates layout in some engines.
    if (element.textContent !== text) element.textContent = text;
    element.classList.toggle('warn', warn);
  }

  private build(): void {
    if (this.root) return;
    ensureDiagnosticStyles(this.doc);

    const root = this.doc.createElement('section');
    root.id = 'euc-debug-overlay';
    root.className = 'euc-diag';
    root.setAttribute('aria-hidden', 'true');

    const heading = this.doc.createElement('h2');
    heading.textContent = 'Debug — F3';
    root.appendChild(heading);

    const groups: [string, [string, string][]][] = [
      ['Loop', [
        ['tick', 'tick'],
        ['simtime', 'sim time'],
        ['state', 'state'],
        ['scheduler', 'scheduler'],
        ['firstframe', 'first frame'],
        ['frames', 'frames'],
        ['steps', 'steps'],
        ['dropped', 'dropped steps'],
        ['alpha', 'alpha'],
      ]],
      ['Input', [
        ['throttle', 'throttle'],
        ['steer', 'steer'],
        ['actions', 'held / pending'],
        ['consumed', 'consumed'],
      ]],
      ['Ride', [
        ['ridestate', 'state'],
        ['speed', 'speed'],
        ['ridepos', 'position'],
        ['heading', 'heading'],
        ['lean', 'lean'],
        ['longitudinal', 'longitudinal'],
        ['roll', 'roll'],
        ['lateral', 'lateral'],
        ['ridden', 'ridden'],
        ['look', 'look into turn'],
      ]],
      ['Ground', [
        ['surface', 'surface'],
        ['resistance', 'resistance'],
        ['slope', 'slope'],
        ['suspension', 'suspension'],
        ['contact', 'contact'],
      ]],
      ['Air', [
        ['air', 'hop / flight'],
        ['airaim', 'aim'],
        ['landing', 'last landing'],
        ['pedal', 'pedal'],
      ]],
      ['Risk', [
        ['wobble', 'wobble'],
        ['wobblesmooth', 'recovery'],
        ['power', 'power'],
        ['crash', 'crash'],
        ['safespot', 'safe spot'],
      ]],
      ['Camera', [
        ['camera', 'mode'],
        ['camarm', 'arm'],
        ['camaim', 'aim'],
        ['camlag', 'yaw lag'],
      ]],
      ['Render', [
        ['viewport', 'viewport'],
        ['draws', 'scene'],
        ['gpu', 'gpu objects'],
      ]],
      ['Timing (our code only)', [
        ['simms', 'sim ms'],
        ['renderms', 'render ms'],
        ['window', 'window'],
      ]],
      ['Audio', [
        ['audiostate', 'context'],
        ['audiomix', 'mix'],
        ['audiomotor', 'motor'],
        ['audioworld', 'world'],
        ['audiovoices', 'voices'],
        ['audioplayed', 'one-shots'],
      ]],
      ['Tuning', [['overrides', 'overrides']]],
    ];

    for (const [title, rows] of groups) {
      const groupHeading = this.doc.createElement('h3');
      groupHeading.textContent = title;
      root.appendChild(groupHeading);

      const list = this.doc.createElement('dl');
      for (const [key, label] of rows) {
        const term = this.doc.createElement('dt');
        term.textContent = label;
        const value = this.doc.createElement('dd');
        value.dataset.field = key;
        value.textContent = '—';
        list.append(term, value);
        this.values.set(key, value);
      }
      root.appendChild(list);
    }

    const note = this.doc.createElement('p');
    note.className = 'euc-note';
    note.textContent = 'No frame-rate figure here on purpose: an automated or '
      + 'unfocused tab has its own cadence. Frame interval comes from a human '
      + 'at a focused window.';
    root.appendChild(note);

    this.doc.body.appendChild(root);
    this.root = root;
  }
}
