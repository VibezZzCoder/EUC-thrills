/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The held paused view — performance pass 2026-10-17 (idle-audio, Design A).
 *
 * A settled player pause has nothing left to change on the canvas: the
 * simulation does not step, `alpha` is frozen, and every world animation
 * (street life, the population, squirrels, birds, pads, targets, gates,
 * particles) runs on the simulation clock. The exceptions are the riding
 * rig's two channels that count render calls (the paddle carry's put-down
 * and the falling flag, `RidingRig.settling`); `Game` makes a frame
 * non-holdable while any shown rig is still settling, so the hold begins
 * only after the arm is down. The baseline still redrew the same picture on
 * every animation frame. WebGL presents the drawing buffer only after a
 * clear or a draw into it (or a resize), so a frame that submits nothing
 * leaves the last presented picture on screen — the mechanism behind
 * three.js's "render on demand" with the default `preserveDrawingBuffer:
 * false`. `Game.render` keeps every CPU-side side effect and asks this gate
 * only whether to submit.
 *
 * The gate decides; `Game` describes the frame. A frame that is not holdable
 * (riding, menus that simulate, a synthetic `advance()` draw, covers, Ultra,
 * a lost context, a QA-frozen ride, a rig still settling) always draws and
 * re-arms the settle window, so the first `settleFrames` holdable frames
 * after any of them still draw. A change of drawing-buffer size, pixel
 * ratio, view count or seat count re-arms it too, and so does
 * `invalidate()` — the one call every write that can change the paused
 * picture makes (`Game`'s choke points; the census in
 * `pausedViewWiring.test.ts` keeps the QA bridge honest).
 *
 * **Future animated paused content** — a 3D pause-menu preview, a wall-clock
 * shader — must either call `invalidate()` on every change or make the frame
 * non-holdable. Holding it would freeze it.
 *
 * Pure: no DOM, no three, no imports. Erasable TypeScript only. The logic is
 * the performance pass's reference gate, verbatim, which its local parity
 * harness proved bit for bit against an independently written oracle;
 * `pausedView.test.ts` carries a second oracle and the negative controls.
 */

/** Why the held picture was released. Diagnostic text only. */
export type PausedViewReason =
  | 'start' | 'surface' | 'state' | 'options' | 'tuning' | 'pose' | 'world' | 'tier'
  | 'population' | 'reduced-motion' | 'visible' | 'context' | 'layout' | 'advance'
  | 'step' | 'bridge';

/** What `Game.render` knows about this frame, filled in place (never a literal per frame). */
export interface PausedViewFrame {
  /** A real frame in a state whose picture may be held (see `Game.admitPausedView`). */
  holdable: boolean;
  /** Drawing-buffer pixels (`canvas.width/height`) — a reallocated buffer is blank. */
  bufferWidth: number;
  bufferHeight: number;
  /** `WebGLRenderer.getPixelRatio()` — a zoom can keep the buffer size and still resize. */
  pixelRatio: number;
  /** Panes and seats — a re-tiled canvas or a rider who joined. */
  views: number;
  seats: number;
}

export interface PausedViewStats {
  /** Frames the gate let through to the GPU. */
  readonly drawn: number;
  /** Frames that submitted nothing and left the last picture on screen. */
  readonly held: number;
  /** Consecutive held frames ending at the latest one (0 when it drew). */
  readonly heldRun: number;
  readonly holding: boolean;
  readonly lastReason: PausedViewReason;
}

export class PausedViewGate {
  private readonly settleFrames: number;
  private owed: number;
  private width = -1;
  private height = -1;
  private ratio = -1;
  private views = -1;
  private seats = -1;
  private drawn = 0;
  private held = 0;
  private heldRun = 0;
  private reason: PausedViewReason = 'start';

  /**
   * @param settleFrames Holdable frames drawn after any event before the gate
   *   holds. At least one: zero would hold the transition frame itself.
   */
  constructor(settleFrames: number) {
    if (!Number.isInteger(settleFrames) || settleFrames < 1) {
      throw new Error(`PausedViewGate needs at least one settle frame, got ${settleFrames}`);
    }
    this.settleFrames = settleFrames;
    this.owed = settleFrames;
  }

  /** Something that can change the picture happened while it may be held. */
  invalidate(reason: PausedViewReason): void {
    this.owed = this.settleFrames;
    this.reason = reason;
  }

  /** True: submit this frame. False: leave the last presented picture on screen. */
  admit(frame: PausedViewFrame): boolean {
    if (
      frame.bufferWidth !== this.width || frame.bufferHeight !== this.height
      || frame.pixelRatio !== this.ratio || frame.views !== this.views || frame.seats !== this.seats
    ) {
      this.width = frame.bufferWidth;
      this.height = frame.bufferHeight;
      this.ratio = frame.pixelRatio;
      this.views = frame.views;
      this.seats = frame.seats;
      this.invalidate('surface');
    }
    if (!frame.holdable) {
      this.owed = this.settleFrames;
      this.heldRun = 0;
      this.drawn += 1;
      return true;
    }
    if (this.owed > 0) {
      this.owed -= 1;
      this.heldRun = 0;
      this.drawn += 1;
      return true;
    }
    this.held += 1;
    this.heldRun += 1;
    return false;
  }

  /** A fresh record for the QA bridge; allocates, so never per frame. */
  stats(): PausedViewStats {
    return {
      drawn: this.drawn,
      held: this.held,
      heldRun: this.heldRun,
      holding: this.heldRun > 0,
      lastReason: this.reason,
    };
  }
}
