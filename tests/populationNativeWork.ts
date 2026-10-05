/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Population transaction work per fixed step, counted in the page (POP-6/CP-5,
 * 2026-10-03). Shared by the native-step spec and any probe that needs the same
 * numbers from another build. It runs in the browser, so it may not import
 * anything or close over anything.
 */
export interface PopulationNativeWork {
  steps: number;
  /** Steps that started grounded and upright, the only ones the native path may take. */
  grounded: number;
  /** Controller prepares made during those steps. */
  groundedPrepares: number;
  /** `PopulationPhysicalCertificates.components` calls over every counted step. */
  components: number;
  /** Owners stepped natively at the transaction point. */
  native: number;
  /** Closest street-life actor centre seen from the rider. */
  minActorMetres: number;
  /** The parked vehicle the rider was stood against, in `held` mode. */
  heldAgainst: string | null;
  /** `neutral`: steps that started with seat 0 grounded and upright, another seat airborne or crashed, and no seat placing itself. */
  neutral: number;
  /** Seat 0's prepares during those steps. */
  neutralPrepares: number;
}

/**
 * `far` rides seat 0 out of the spawn yard and then counts a ride clear of
 * street life. `held` stands the rider 4 m from a parked vehicle's centre,
 * facing it, and counts a throttle held into it. `neutral` is `far` with a
 * second seat beside seat 0 that hops: an airborne seat makes the epoch select
 * from neutral candidates (PERF-R2-1, 2026-10-04).
 */
export function populationNativeWork(mode: 'far' | 'held' | 'neutral'): PopulationNativeWork {
  type Method = (...args: unknown[]) => unknown;
  type QaGame = {
    appState: { current: string };
    setAppState(state: string): void;
    loop: { setRunning(running: boolean): void };
    seats: { controller: { isGrounded: boolean; crashed: boolean; discontinuitySerial: number }; currentPose: { x: number; z: number } }[];
    setActionsFor(seat: number, actions: { throttle: number; steer: number; hop?: boolean }): void;
    spawnRider(): number;
    step(seconds: number): void;
    placeRider(position: { x: number; y: number; z: number }, headingY: number): void;
    population: { snapshot(): { actors: { id: string; kind: string; x: number; z: number; headingY: number }[] } };
    populationPhysicalCertificates: object;
    populationPreparedSteps: { native?: boolean }[];
  };
  const game = (window as unknown as { game: QaGame }).game;
  if (game.appState.current !== 'freeRide') game.setAppState('freeRide');
  game.loop.setRunning(false);
  const work: PopulationNativeWork = { steps: 0, grounded: 0, groundedPrepares: 0, components: 0, native: 0,
    minActorMetres: Infinity, heldAgainst: null, neutral: 0, neutralPrepares: 0 };
  if (mode === 'neutral') while (game.seats.length < 2) game.spawnRider();
  // Every seat rides seat 0's line; in `neutral` mode seat 1 also hops.
  const drive = (actions: { throttle: number; steer: number }, hop: boolean) => {
    for (let seat = 0; seat < game.seats.length; seat += 1) game.setActionsFor(seat, seat === 0 ? actions : { ...actions, hop });
  };
  if (mode === 'held') {
    // The first parked vehicle with a clear standing place 4 m off either
    // end; the living world refuses a placement that would overlap anything.
    for (const vehicle of game.population.snapshot().actors.filter(actor => actor.kind === 'parkedVehicle')) {
      for (const end of [1, -1]) {
        const heading = vehicle.headingY + (end > 0 ? 0 : Math.PI);
        try {
          game.placeRider({ x: vehicle.x + Math.sin(heading) * 4, y: 0, z: vehicle.z + Math.cos(heading) * 4 }, heading + Math.PI);
          work.heldAgainst = vehicle.id;
          break;
        } catch { /* occupied: try the other end or the next vehicle */ }
      }
      if (work.heldAgainst !== null) break;
    }
    if (work.heldAgainst === null) return work;
  } else {
    for (let index = 0; index < 600; index += 1) { drive({ throttle: 0.6, steer: 0 }, false); game.step(1 / 120); }
  }
  const controller = Object.getPrototypeOf(game.seats[0]!.controller) as Record<string, Method>;
  const certificates = Object.getPrototypeOf(game.populationPhysicalCertificates) as Record<string, Method>;
  const prepare = controller.prepareStep!, components = certificates.components!;
  let prepares = 0, seat0Prepares = 0;
  const seat0 = game.seats[0]!.controller;
  controller.prepareStep = function (this: unknown, ...args: unknown[]) {
    prepares += 1; if (this === seat0) seat0Prepares += 1;
    return prepare.apply(this, args);
  };
  certificates.components = function (this: unknown, ...args: unknown[]) { work.components += 1; return components.apply(this, args); };
  try {
    const steps = mode === 'held' ? 240 : 600;
    for (let index = 0; index < steps; index += 1) {
      drive(mode === 'held' ? { throttle: 0.8, steer: 0 } : { throttle: 0.6, steer: Math.sin(index / 120) * 0.15 }, index % 60 === 0);
      const rider = game.seats[0]!.controller, upright = rider.isGrounded && !rider.crashed, before = prepares;
      const airborne = game.seats.some(seat => !seat.controller.isGrounded || seat.controller.crashed);
      const serials = game.seats.map(seat => seat.controller.discontinuitySerial), seat0Before = seat0Prepares;
      game.step(1 / 120);
      work.steps += 1;
      if (upright) { work.grounded += 1; work.groundedPrepares += prepares - before; }
      if (upright && airborne && game.seats.every((seat, at) => seat.controller.discontinuitySerial === serials[at])) {
        work.neutral += 1; work.neutralPrepares += seat0Prepares - seat0Before;
      }
      work.native += game.populationPreparedSteps.filter(entry => entry.native === true).length;
      const pose = game.seats[0]!.currentPose;
      for (const actor of game.population.snapshot().actors)
        work.minActorMetres = Math.min(work.minActorMetres, Math.hypot(actor.x - pose.x, actor.z - pose.z));
    }
  } finally {
    controller.prepareStep = prepare; certificates.components = components;
  }
  return work;
}
