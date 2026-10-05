/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from '../level/generateRoute.ts';
import { environmentAudioEmitters } from './environmentAudio.ts';
import { withStreetGround } from './streetGround.ts';

test('world sounds follow sparse actual trades and stay inside original protecting building bodies', () => {
  for (const seed of ['euc', 'corner', 'city', 'rider']) {
    const plan = withStreetGround(generateLevel({ seed }).plan), before = JSON.stringify(plan);
    const emitters = environmentAudioEmitters(plan);
    assert.deepEqual(emitters.map(emitter => emitter.kind), ['cafe', 'workshop', 'industrial']);
    assert.equal(new Set(emitters.map(emitter => emitter.id)).size, emitters.length);
    for (const emitter of emitters) {
      assert.ok(plan.solids?.some(body => {
        const dx = emitter.x - body.centre.x, dz = emitter.z - body.centre.z;
        const x = Math.cos(body.rotationY) * dx - Math.sin(body.rotationY) * dz;
        const z = Math.sin(body.rotationY) * dx + Math.cos(body.rotationY) * dz;
        return Math.abs(x) < body.halfExtents.x && Math.abs(z) < body.halfExtents.z
          && Math.abs(emitter.y - body.centre.y) < body.halfExtents.y;
      }), `${seed}: sound has a real protected host`);
    }
    assert.equal(JSON.stringify(plan), before);
    assert.deepEqual(environmentAudioEmitters(plan), emitters);
    assert.deepEqual(environmentAudioEmitters({ ...plan, props: [] }), []);
    assert.deepEqual(environmentAudioEmitters({ ...plan, solids: [] }), []);
    assert.deepEqual(environmentAudioEmitters({ ...plan, props: plan.props?.map(prop =>
      prop.kind === 'building' ? { ...prop, look: 'residential' as const } : prop) }), []);
  }
});
