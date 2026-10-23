/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from './plan.ts';
import { createQuayGeometrySteps, QUAY_SPAWN } from './quayQuarter.ts';
import { withQuayActivity } from './quayActivity.ts';
import { PREPARATION_SLICE, runSteps, type Steps } from '../shared/preparationSteps.ts';

/** The link key stays `euclaude`; revision 2 is Quay Quarter (§45), shown to players as Wheelhouse Wharf (2026-10-22). */
export const EUCLAUDE_PLAN_ID='euclaude-r2';
export const EUCLAUDE_SPAWN=QUAY_SPAWN;
export function createEuclaudeLevel(hazardProbeMetres?:number,targetProbeMetres?:number):LevelPlan {
 return runSteps(createEuclaudeLevelSteps(hazardProbeMetres,targetProbeMetres));
}
export function* createEuclaudeLevelSteps(_hazardProbeMetres?:number,_targetProbeMetres?:number):Steps<LevelPlan>{
 // Authored venue has no hazard/target probe authoring; diagnostic URL fields do not decorate its stunts.
 const geometry=yield* createQuayGeometrySteps(true,true);yield PREPARATION_SLICE;
 return withQuayActivity(geometry);
}
