/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Exact coordinator diagnostic fixture: 03-07-12-818Z-4f392f7f, parked row429. */
import { createPose } from './EucController.ts';
export function recordedClearParkedReaction() {
  const before = Object.assign(createPose(), {"x":0,"y":0,"z":0.19966716346410107,"headingY":-0.15,"rollAngle":0,"riderRoll":0,"riderPitch":0,"riderLookYaw":-0.07818398134933846,"riderTurnTwist":0,"technicalTurn":0,"reverseBlend":0.01806176408931317,"wheelPitch":0,"wheelSpin":0.7986686538564043,"groundPitch":0,"groundRoll":0,"suspensionOffset":0.0018700204021662018,"restFactor":0,"speed":0,"crouch":0,"tuck":0,"attack":0,"carveStance":0,"airBlend":0,"airHeight":0,"groundY":0,"pedalStrike":0,"wobble":0,"wobbleFootCorrection":0,"wobbleYaw":0,"wobbleRoll":0,"wobbleSway":-0.3090169943749476,"wobbleFight":0,"alert":0,"crashBlend":0,"crashForward":0,"crashLateral":0,"crashDrop":0,"crashTumble":0,"crashRoll":0,"wheelCrashLean":0,"wheelCrashSpin":0,"wheelCrashPop":0,"ragdollBlend":0,"recoverBlend":1,"tiltBack":0,"styleSway":0,"styleYaw":0,"styleRoll":0,"styleStumble":0});
  const after = Object.assign(createPose(), before, {"suspensionOffset":0.001864912061873216,"reverseBlend":0.02181544462844194,"wobbleSway":-0.15643446504023112});
  after.ragdoll = before.ragdoll.slice();
  return { before, after };
}
