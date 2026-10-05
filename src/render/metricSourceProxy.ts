/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R19 SOURCE-ONLY PROPOSAL. Intended target: src/render/metricSourceProxy.ts.
 * The original Ultra emitter remains the near/far shadow owner. Selected
 * source bodies/roofs are colour-discarded by one byte flag and one branch.
 * No opening array, null sampler, new material or depth shader is introduced. */
import * as THREE from 'three';
export const METRIC_PROXY_ATTRIBUTE = 'metricColourProxy';

function replaceOnce(source: string, anchor: string, replacement: string): string {
  if (source.split(anchor).length !== 2) throw new Error(`Metric proxy shader anchor drift: ${anchor}`);
  return source.replace(anchor, replacement);
}

/** Invoke only on an existing original-source bucket containing proxy flags.
 * Flag values are 0 or 255 in a normalized Uint8Array, one byte per instance.
 * The source geometry/material/near custom depth/far custom depth are retained;
 * this patch applies to the colour material only. Do not call on metric shells. */
export function installMetricSourceProxy(material: THREE.MeshStandardMaterial): void {
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${previousKey}/metric-source-proxy-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>',
      '#include <common>\nattribute float metricColourProxy;\nvarying float vMetricColourProxy;');
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\nvMetricColourProxy = metricColourProxy;');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vMetricColourProxy;');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\nif (vMetricColourProxy > 0.5) discard;');
  };
}

/** Byte model and allocated data use the same source-bucket emission flags. */
export function metricSourceProxyAttribute(flags: readonly boolean[]): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(Uint8Array.from(flags, flag => flag ? 255 : 0), 1, true);
}
