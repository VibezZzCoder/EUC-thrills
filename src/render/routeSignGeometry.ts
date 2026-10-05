/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { PROP_SIZES } from '../data/props.ts';
import { ROUTE_SIGN_FACE, type RouteSignWord } from '../data/routeSigns.ts';
import { wordStrokes, type LetterPoint } from '../shared/letterPaths.ts';

/** The exact native stroke calls remain visible to the owned-word audit. */
function label(word: RouteSignWord, height: number): LetterPoint[][] {
  switch (word) {
    case 'TECH': return wordStrokes('TECH', height, { tracking: 0.10 });
    case 'SAFE': return wordStrokes('SAFE', height, { tracking: 0.10 });
    case 'AIR': return wordStrokes('AIR', height, { tracking: 0.10 });
  }
}

export interface RouteInkStroke {
  readonly points: readonly LetterPoint[];
  readonly width: number;
  readonly row: 'upper' | 'lower';
  readonly kind: 'label' | 'arrow';
}

/** Centre both boards on their original pole, with the rear face touching the
 * front of the pole. The old centred face ran THROUGH the pole and obscured
 * letters. Larger route boards fit the unchanged circular source reservation. */
export function routeSignPlateGeometry(): THREE.BufferGeometry {
  const shape = PROP_SIZES.signpost;
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  for (const [width, centre] of [[ROUTE_SIGN_FACE.upperWidth, ROUTE_SIGN_FACE.upperCentre],
    [ROUTE_SIGN_FACE.lowerWidth, ROUTE_SIGN_FACE.lowerCentre]] as const) {
    const box = new THREE.BoxGeometry(width, ROUTE_SIGN_FACE.height, shape.plateThickness);
    const triangles = box.toNonIndexed();
    triangles.translate(0, centre, shape.postRadius + shape.plateThickness / 2);
    positions.push(...triangles.getAttribute('position').array);
    normals.push(...triangles.getAttribute('normal').array);
    uv.push(...triangles.getAttribute('uv').array);
    triangles.dispose(); box.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Screen-readable strokes on the +Z face. Upper chooses LEFT; SAFE RIGHT. */
export function routeSignStrokes(upper: 'TECH' | 'AIR'): readonly RouteInkStroke[] {
  const strokes: RouteInkStroke[] = [];
  const row = (word: RouteSignWord, name: 'upper' | 'lower', side: -1 | 1) => {
    const large = name === 'upper';
    const height = ROUTE_SIGN_FACE.letterHeight;
    const y = large ? ROUTE_SIGN_FACE.upperCentre : ROUTE_SIGN_FACE.lowerCentre;
    const widthOfPlate = large ? ROUTE_SIGN_FACE.upperWidth : ROUTE_SIGN_FACE.lowerWidth;
    const left = -widthOfPlate / 2 + ROUTE_SIGN_FACE.horizontalMargin;
    const width = ROUTE_SIGN_FACE.strokeWidth;
    for (const stroke of label(word, height)) strokes.push({
      row: name, kind: 'label', width,
      points: stroke.map(([x, down]): LetterPoint => [left + x, y + height / 2 - down]),
    });
    const x = ROUTE_SIGN_FACE.arrowCentreX;
    const tip: LetterPoint = [x + side * ROUTE_SIGN_FACE.arrowHalfRun,
      y + ROUTE_SIGN_FACE.arrowHalfRise];
    const tail: LetterPoint = [x - side * ROUTE_SIGN_FACE.arrowHalfRun,
      y - ROUTE_SIGN_FACE.arrowHalfRise];
    const barb = ROUTE_SIGN_FACE.arrowBarb;
    strokes.push({ row: name, kind: 'arrow', width: width * 1.15, points: [tail, tip] });
    strokes.push({ row: name, kind: 'arrow', width: width * 1.15,
      points: [[tip[0] - side * barb, tip[1]], tip, [tip[0], tip[1] - barb]] });
  };
  row(upper, 'upper', -1);
  row('SAFE', 'lower', 1);
  return strokes;
}

/** One immutable template for TECH/SAFE and one AIR/SAFE; no painter/material.
 * Add these to createProps' existing buckets and resource arrays. The caller
 * owns reflectance, roughness and disposal of the shared materials. */
export function routeSignInkGeometry(upper: 'TECH' | 'AIR'): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  const uv: number[] = [];
  const z = PROP_SIZES.signpost.postRadius + PROP_SIZES.signpost.plateThickness + 0.002;
  const vertex = (x: number, y: number) => {
    positions.push(x, y, z); normals.push(0, 0, 1);
    colours.push(1, 1, 1); uv.push(0, 0);
  };
  for (const stroke of routeSignStrokes(upper)) {
    for (let index = 1; index < stroke.points.length; index += 1) {
      const a = stroke.points[index - 1]!, b = stroke.points[index]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!(length > 0)) throw new Error('zero-length route-sign stroke');
      const dx = -(b[1] - a[1]) / length * stroke.width / 2;
      const dy = (b[0] - a[0]) / length * stroke.width / 2;
      // a-right, b-right, b-left is outward on the readable +Z face.
      vertex(a[0] - dx, a[1] - dy); vertex(b[0] - dx, b[1] - dy); vertex(b[0] + dx, b[1] + dy);
      vertex(a[0] - dx, a[1] - dy); vertex(b[0] + dx, b[1] + dy); vertex(a[0] + dx, a[1] + dy);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function routeSignInkCost(upper: 'TECH' | 'AIR') {
  const legs = routeSignStrokes(upper).reduce((sum, stroke) => sum + stroke.points.length - 1, 0);
  return { triangles: legs * 2, geometryBytes: legs * 2 * 3 * 11 * 4 };
}
