/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { DecorShape } from './decorShapePlan.ts';

/** Allocation stage only. Count/admission never calls this function. */
export function createDecorShapeGeometry(shape: DecorShape): THREE.BufferGeometry {
  const p = shape.parameters;
  let geometry: THREE.BufferGeometry;
  switch (shape.primitive) {
    case 'box': geometry = new THREE.BoxGeometry(p[0], p[1], p[2]); break;
    case 'plane': geometry = new THREE.PlaneGeometry(p[0], p[1]); break;
    case 'cylinder': geometry = new THREE.CylinderGeometry(p[0], p[1], p[2], p[3]); break;
    case 'cone': geometry = new THREE.ConeGeometry(p[0], p[1], p[2]); break;
    case 'sphere': geometry = new THREE.SphereGeometry(p[0], p[1], p[2]); break;
    case 'torus': geometry = new THREE.TorusGeometry(p[0], p[1], p[2], p[3]); break;
    case 'icosahedron': geometry = new THREE.IcosahedronGeometry(p[0], p[1]); break;
    case 'depot-cab': {
      const profile = new THREE.Shape();
      shape.vertices!.forEach(([x, y], index) => index === 0 ? profile.moveTo(x, y) : profile.lineTo(x, y));
      profile.closePath();
      geometry = new THREE.ExtrudeGeometry(profile, { depth: p[0], bevelEnabled: false, steps: 1 });
      break;
    }
    case 'quad': {
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(shape.vertices!.flatMap(point => [...point]), 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals(); break;
    }
  }
  for (const operation of shape.operations) {
    switch (operation.kind) {
      case 'translate': geometry.translate(operation.values[0], operation.values[1], operation.values[2]); break;
      case 'rotateX': geometry.rotateX(operation.angle); break;
      case 'rotateY': geometry.rotateY(operation.angle); break;
      case 'rotateZ': geometry.rotateZ(operation.angle); break;
      case 'matrix': geometry.applyMatrix4(new THREE.Matrix4().fromArray(operation.values)); break;
      case 'quaternion': geometry.applyQuaternion(new THREE.Quaternion(operation.values[0], operation.values[1],
        operation.values[2], operation.values[3])); break;
      case 'drop-uv': geometry.deleteAttribute('uv'); break;
      case 'ensure-index':
        if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
        break;
      case 'colour': {
        const colours = new Float32Array(geometry.getAttribute('position').count * 3);
        const colour = new THREE.Color().setHex(operation.hex);
        for (let index = 0; index < colours.length; index += 3) colour.toArray(colours, index);
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3)); break;
      }
      case 'remap-v': {
        const uv = geometry.getAttribute('uv');
        for (let index = 0; index < uv.count; index++) uv.setY(index, (uv.getY(index) + operation.offset) / operation.divisor);
        break;
      }
    }
  }
  return geometry;
}
