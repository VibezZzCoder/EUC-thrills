/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { POPULATION, POPULATION_OCCUPANT } from '../data/tuning.ts';
import { sweepPopulationHulls, type PopulationFootprint } from './population.ts';

/** A separate living-body speed cap: packmate walls-only fallbacks cannot erase it. */
export function populationYieldSpeed(
  body: PopulationFootprint, speed: number, aimHeadingY: number,
  actors: readonly PopulationFootprint[], brakingMetresPerSecondSquared: number,
): number | null {
  if (actors.length === 0) return null;
  const braking = Math.max(0.1, brakingMetresPerSecondSquared);
  const forwardSpeed = Math.max(0, speed);
  const horizon = Math.max(POPULATION.humanLookAheadSeconds,
    forwardSpeed / braking + POPULATION.copReactionSeconds);
  const distance = Math.max(POPULATION.copMinimumLookAheadMetres,
    forwardSpeed * forwardSpeed / (2 * braking) + forwardSpeed * POPULATION.copReactionSeconds
      + POPULATION.vehicleWaitingGapMetres);
  const finish = { ...body, x: body.x + Math.sin(aimHeadingY) * distance,
    z: body.z + Math.cos(aimHeadingY) * distance, headingY: aimHeadingY };
  let cap: number | null = null;
  for (const actor of actors) {
    // A moving body forecasts only its observed velocity. This is a reactive
    // speed request, never a collider, route, or permission to enter its space.
    // The controller's exact fixed-step hull sweep remains the physical gate.
    const future = { ...actor, x: actor.x + actor.velocityX * horizon,
      z: actor.z + actor.velocityZ * horizon };
    const hit = sweepPopulationHulls(actor, future, body, finish);
    if (!hit) continue;
    const start = sweepPopulationHulls(actor, actor, body, body);
    if (start?.initiallyOverlapping) {
      const relativeX = finish.x - body.x - actor.velocityX * horizon;
      const relativeZ = finish.z - body.z - actor.velocityZ * horizon;
      if (relativeX * hit.normalX + relativeZ * hit.normalZ > 0) continue;
    }
    const available = Math.max(0, hit.timeOfImpact * distance - POPULATION.vehicleWaitingGapMetres);
    const candidate = Math.sqrt(2 * braking * available);
    cap = cap === null ? candidate : Math.min(cap, candidate);
  }
  return cap;
}

/** Physical wheel/rider dimensions are independent of the rendered quality tier. */
export function populationYieldBody(view: { x: number; y: number; z: number; headingY: number; speed: number }): PopulationFootprint {
  return { x: view.x, z: view.z, headingY: view.headingY, minY: view.y,
    maxY: view.y + POPULATION_OCCUPANT.heightMetres,
    halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres,
    halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
    velocityX: Math.sin(view.headingY) * view.speed, velocityZ: Math.cos(view.headingY) * view.speed };
}
