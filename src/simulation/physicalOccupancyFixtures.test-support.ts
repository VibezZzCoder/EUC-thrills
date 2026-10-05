/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { createPose } from './EucController.ts';

/** Exact preserved native controller frame; no mesh/test module import. */
type TestPose = Omit<ReturnType<typeof createPose>, 'ragdoll'> & { ragdoll: Float32Array | Float64Array };
export function recordedDrunkard90CrashPose(): TestPose {
  return Object.assign(createPose(), {
    z: 31.63506726478276, wheelSpin: 126.54026905913103,
    suspensionOffset: -0.00033322566258938693, speed: 29.065786564084053,
    crashBlend: 0.6824305751252547, crashForward: 0.7165521038815175,
    crashLateral: 0.8871597476628312, crashDrop: 0.06824305751252548,
    crashRoll: 0.905161178267115, wheelCrashLean: 0.9895243339316194,
    wheelCrashSpin: -3.9652238467217407, ragdollBlend: 1,
    ragdoll: Float32Array.from([
      0.41067034006118774, 0.14000000059604645, 6.036489963531494,
      0.4061499238014221, 0.14000000059604645, 6.536549091339111,
      0.40287554264068604, 0.11999999731779099, 6.755771160125732,
      0.4907739460468292, 0.10000000149011612, 6.0373759269714355,
      0.32362088561058044, 0.15729959309101105, 6.035799980163574,
      0.5799219608306885, 0.1128053367137909, 6.537757396697998,
      0.23066532611846924, 0.13714304566383362, 6.534643650054932,
      0.5156385898590088, 0.05273155868053436, 7.066773891448975,
      0.39426666498184204, 0.05271805077791214, 7.0377349853515625,
      0.2285277545452118, 0.07237642258405685, 6.760343074798584,
      0.41662195324897766, 0.09258371591567993, 6.718786239624023,
    ]),
  });
}

export function collapsedRecordedCrashPose() {
  const p = recordedDrunkard90CrashPose();
  for (let i = 1; i < 11; i += 1) for (let axis = 0; axis < 3; axis += 1) p.ragdoll[i * 3 + axis] = p.ragdoll[axis];
  return p;
}
