/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS as C } from '../data/tuning.ts';
import {
  loftGeometry, loftNormal, loftPoint, loftProfile, mergeGeometries, shaded, tintOver, vAtHeight,
} from './blockoutKit.ts';

/** Red Rider's kit only. Every detail is merged into a mesh the look already owns. */
export const RED_RIDER_TORSO = loftProfile([
  { y: -.010, halfWidth: .175, halfDepth: .136, square: 2.8 },
  { y: .018, halfWidth: .167, halfDepth: .130, square: 2.8 },
  { y: .050, halfWidth: .153, halfDepth: .126, square: 2.6 },
  { y: .155, halfWidth: .146, halfDepth: .118, square: 2.5 },
  { y: .290, halfWidth: .165, halfDepth: .136, z: .008, square: 2.6 },
  { y: .334, halfWidth: .169, halfDepth: .136, z: .008, square: 2.7 },
  { y: .340, halfWidth: .169, halfDepth: .136, z: .008, square: 2.7 },
  { y: .400, halfWidth: .170, halfDepth: .132, z: .006, square: 2.8 },
  { y: .438, halfWidth: .170, halfDepth: .127, z: .004, square: 2.9 },
  { y: .444, halfWidth: .170, halfDepth: .125, z: .004, square: 2.9 },
  { y: .470, halfWidth: .170, halfDepth: .112, z: .002, square: 2.9 },
  { y: .500, halfWidth: .158, halfDepth: .095, square: 2.7 },
  { y: .518, halfWidth: .143, halfDepth: .083, square: 2.6 },
  { y: .536, halfWidth: .115, halfDepth: .074, square: 2.5 },
  { y: .548, halfWidth: .075, halfDepth: .068, square: 2.3 },
]);

/** The chin leads the brow; the crown is rounded rather than a faceted ball. */
export const RED_RIDER_HELMET = loftProfile([
  { y: .080, halfWidth: .074, halfDepth: .091, z: .014, square: 2.6 },
  { y: .090, halfWidth: .092, halfDepth: .112, z: .022, square: 2.7 },
  { y: .110, halfWidth: .105, halfDepth: .130, z: .027, square: 2.8 },
  { y: .132, halfWidth: .113, halfDepth: .135, z: .024, square: 2.7 },
  { y: .146, halfWidth: .116, halfDepth: .132, z: .018, square: 2.5 },
  { y: .153, halfWidth: .118, halfDepth: .130, z: .014, square: 2.4 },
  { y: .166, halfWidth: .122, halfDepth: .130, z: .010, square: 2.35 },
  { y: .188, halfWidth: .125, halfDepth: .133, z: .005, square: 2.3 },
  { y: .215, halfWidth: .126, halfDepth: .135, z: .001, square: 2.25 },
  { y: .239, halfWidth: .125, halfDepth: .134, z: -.001, square: 2.2 },
  { y: .252, halfWidth: .123, halfDepth: .132, z: -.002, square: 2.18 },
  { y: .260, halfWidth: .121, halfDepth: .130, z: -.003, square: 2.16 },
  { y: .263, halfWidth: .120, halfDepth: .129, z: -.004, square: 2.15 },
  { y: .278, halfWidth: .113, halfDepth: .122, z: -.005, square: 2.12 },
  { y: .294, halfWidth: .103, halfDepth: .112, z: -.007, square: 2.1 },
  { y: .310, halfWidth: .087, halfDepth: .095, z: -.009, square: 2.08 },
  { y: .324, halfWidth: .066, halfDepth: .073, z: -.010, square: 2.05 },
  { y: .336, halfWidth: .041, halfDepth: .045, z: -.011, square: 2.02 },
  { y: .342, halfWidth: .018, halfDepth: .021, z: -.011, square: 2 },
  { y: .344, halfWidth: .0005, halfDepth: .0005, z: -.011, square: 2 },
]);

// The shell cut and glazing use the same rows. Their edge is under one seal.
const OPENING = [0, 0, 0, 0, 0, .88, 1.08, 1.10, 1.10, 1.08, .99, .76, 0, 0, 0, 0, 0, 0, 0, 0];
const FIRST = 4, LAST = 12;

function tint(g: THREE.BufferGeometry, base: number, target: number, strength = 1): THREE.BufferGeometry {
  const t = tintOver(base, target, strength), c = g.getAttribute('color');
  for (let i = 0; i < c.count; i++) c.setXYZ(i, ...t);
  return g;
}

function buffer(p: number[], c: number[], uv: number[], ix: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix); g.computeVertexNormals();
  return g;
}

function sealCurve(): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  for (let r = FIRST; r <= LAST; r++) {
    points.push(loftPoint(RED_RIDER_HELMET, Math.PI / 2 - OPENING[r]!, r, new THREE.Vector3()));
  }
  for (let r = LAST - 1; r > FIRST; r--) {
    points.push(loftPoint(RED_RIDER_HELMET, Math.PI / 2 + OPENING[r]!, r, new THREE.Vector3()));
  }
  return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}

/** A real opening, a shallow inner wall and a rubber gasket inside the shell. */
export function redRiderHelmet(): THREE.BufferGeometry {
  const radial = 64, columns = radial + 1, rows = RED_RIDER_HELMET.length;
  const positions: number[] = [], colours: number[] = [], uv: number[] = [], ix: number[] = [];
  const p = new THREE.Vector3();
  for (let layer = 0; layer < 2; layer++) for (let r = 0; r < rows; r++) for (let k = 0; k < columns; k++) {
    const a = Math.PI / 2 + OPENING[r]! + (Math.PI * 2 - 2 * OPENING[r]!) * k / radial;
    loftPoint(RED_RIDER_HELMET, a, r, p);
    if (layer) { p.x *= .96; p.z = RED_RIDER_HELMET[r]!.z + (p.z - RED_RIDER_HELMET[r]!.z) * .96; }
    positions.push(p.x, p.y, p.z); uv.push(k / radial, r / (rows - 1));
    const rearExhaust = r >= 7 && r <= 8 && Math.sin(a) < -.85;
    const shade = layer ? .24 : rearExhaust ? .58 : 1;
    colours.push(shade, shade, shade);
  }
  const at = (l: number, r: number, k: number): number => l * rows * columns + r * columns + k;
  const q = (a: number, b: number, c: number, d: number, reverse = false): void => {
    if (reverse) ix.push(a, c, b, a, d, c); else ix.push(a, b, c, a, c, d);
  };
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < radial; k++) {
    q(at(0, r, k), at(0, r + 1, k), at(0, r + 1, k + 1), at(0, r, k + 1));
    q(at(1, r, k), at(1, r + 1, k), at(1, r + 1, k + 1), at(1, r, k + 1), true);
  }
  for (let r = 0; r < rows - 1; r++) {
    q(at(0, r, 0), at(1, r, 0), at(1, r + 1, 0), at(0, r + 1, 0));
    q(at(0, r, radial), at(1, r, radial), at(1, r + 1, radial), at(0, r + 1, radial), true);
  }
  for (let k = 0; k < radial; k++) {
    q(at(0, 0, k), at(0, 0, k + 1), at(1, 0, k + 1), at(1, 0, k));
    q(at(0, rows - 1, k), at(0, rows - 1, k + 1), at(1, rows - 1, k + 1), at(1, rows - 1, k), true);
  }
  const parts = [buffer(positions, colours, uv, ix)];
  parts.push(tint(shaded(new THREE.TubeGeometry(sealCurve(), 96, .0032, 6, true)), C.redRiderHelmet, C.redRiderGear, .65));
  // The chin intake is flush and tucked under the glazing, not a tab on the cheek.
  parts.push(tint(shaded(new THREE.SphereGeometry(1, 20, 8).scale(.030, .005, .002).translate(0, .121, .160)), C.redRiderHelmet, C.redRiderGear, .6));
  return mergeGeometries(parts);
}

/** Opaque smoked glass, curved round the face and recessed under the gasket. */
export function redRiderVisor(): THREE.BufferGeometry {
  const columns = 48, rows = 32, positions: number[] = [], colours: number[] = [], uv: number[] = [], ix: number[] = [];
  const seal = sealCurve(), edge = new THREE.Vector3(), centre = new THREE.Vector3();
  const add = (x: number, y: number, z: number, s: number, t: number): void => {
    positions.push(x, y, z); uv.push(s, t);
    const shade = .90 + .45 * t; colours.push(shade, shade, shade);
  };
  seal.getPointAt(0, edge); add(0, edge.y, edge.z - .001, .5, 0);
  for (let row = 1; row < rows; row++) {
    const t = row / rows; seal.getPointAt(t * .5, edge);
    loftPoint(RED_RIDER_HELMET, Math.PI / 2, vAtHeight(RED_RIDER_HELMET, edge.y), centre);
    for (let k = 0; k <= columns; k++) {
      const s = k / columns, across = 1 - 2 * s;
      add(edge.x * across, edge.y, edge.z - .001 + (centre.z - edge.z - .002) * (1 - across * across), s, t);
    }
  }
  const top = positions.length / 3; seal.getPointAt(.5, edge); add(0, edge.y, edge.z - .001, .5, 1);
  const at = (r: number, k: number): number => 1 + (r - 1) * (columns + 1) + k;
  for (let k = 0; k < columns; k++) {
    ix.push(0, at(1, k), at(1, k + 1));
    for (let row = 1; row < rows - 1; row++) {
      const a = at(row, k), b = at(row + 1, k); ix.push(a, b, b + 1, a, b + 1, a + 1);
    }
    ix.push(at(rows - 1, k), top, at(rows - 1, k + 1));
  }
  return buffer(positions, colours, uv, ix);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, shade = 1): THREE.BufferGeometry {
  const corner = Math.min(w, h) * .12, shape = new THREE.Shape();
  shape.moveTo(-w / 2 + corner, -h / 2); shape.lineTo(w / 2 - corner, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + corner); shape.lineTo(w / 2, h / 2 - corner);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - corner, h / 2); shape.lineTo(-w / 2 + corner, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - corner); shape.lineTo(-w / 2, -h / 2 + corner);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + corner, -h / 2);
  const bevel = Math.min(.0015, d * .25);
  return shaded(new THREE.ExtrudeGeometry(shape, { depth: d - 2 * bevel, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 3 }).translate(x, y, z - d / 2 + bevel), shade);
}

/** The reference mounts one small camera to the rider's own left (+X). */
export function redRiderCamera(): THREE.BufferGeometry {
  const x = .043, y = .283, z = .164;
  const parts = [box(.056, .072, .026, x, y, z, .88)];
  // Rubber face remains off-black against the darker shell and textile webbing.
  parts.push(tint(box(.049, .064, .002, x, y, .178), C.redRiderArmour, C.redRiderGear, 1.8));
  // A U clip actually wraps the sternum bridge, with its slot left open.
  parts.push(tint(box(.030, .007, .016, x, .335, .154), C.redRiderArmour, C.redRiderGear, 2.0));
  for (const side of [-1, 1]) parts.push(tint(box(.006, .020, .016, x + side * .012, .326, .154), C.redRiderArmour, C.redRiderGear, 1.5));
  parts.push(tint(box(.027, .015, .011, x, .323, .174), C.redRiderArmour, C.redRiderGear, 2.0));
  // Lens well and raised lip: the glass is behind the lip's foremost surface.
  const lensY = y + .014, lensX = x + .005;
  parts.push(shaded(new THREE.CylinderGeometry(.0112, .0112, .006, 24, 1, true).rotateX(Math.PI / 2).translate(lensX, lensY, .182), .5));
  const rim = tint(shaded(new THREE.TorusGeometry(.0112, .0021, 8, 28).translate(lensX, lensY, .185)), C.redRiderArmour, C.redRiderGear, 3.2);
  const rp = rim.getAttribute('position'), rc = rim.getAttribute('color');
  for (let i = 0; i < rp.count; i++) {
    const angle = Math.atan2(rp.getY(i) - lensY, rp.getX(i) - lensX);
    const abrasion = .85 + .15 * Math.sin(angle * 7 + .6) ** 2 + .12 * Math.max(0, Math.sin(angle));
    rc.setXYZ(i, rc.getX(i) * abrasion, rc.getY(i) * abrasion, rc.getZ(i) * abrasion);
  }
  parts.push(rim);
  parts.push(tint(shaded(new THREE.CircleGeometry(.0094, 28).translate(lensX, lensY, .182)), C.redRiderArmour, C.redRiderVisor, .65));
  // A small cool sky reflection on the recessed glass, below the worn graphite lip.
  parts.push(tint(shaded(new THREE.SphereGeometry(1, 10, 6).scale(.0024, .0014, .0003).translate(lensX - .0035, lensY + .003, .1825)), C.redRiderArmour, C.coolVisor, .38));
  parts.push(box(.022, .011, .0018, x - .005, y - .018, .1795, .55));
  return mergeGeometries(parts);
}

/**
 * Photo: broad padded rider-left diagonal; narrow, nearly vertical rider-right
 * webbing with its lower anchor well outboard. Neither route is mirrored.
 * Values are [surface angle, torso height, physical width], metres.
 */
export const RED_RIDER_HARNESS_ROUTE = Object.freeze([
  // Front of the wrap. The broad web behind the camera continues down and
  // out to the waist adjuster. Both ends of this strap meet the same belt.
  [Math.PI / 2 - .62, .195, .056],
  [Math.PI / 2 - .53, .224, .062],
  [Math.PI / 2 - .38, .258, .064],
  [Math.PI / 2 - .24, .295, .057],
  [Math.PI / 2 - .15, .325, .052],
  [Math.PI / 2 - .32, .360, .065],
  [Math.PI / 2 - .56, .405, .074],
  [Math.PI / 2 - .79, .460, .070],
  [.45, .500, .063],
  [0, .516, .055],
  [-.45, .500, .045],
  [-.85, .460, .035],
  [-1.05, .400, .032],
  [-1.10, .310, .030],
  [-1.10, .202, .030],
] as const);
export const RED_RIDER_RIGHT_HARNESS_ROUTE = Object.freeze([
  [Math.PI / 2 + .72, .325, .023],
  [Math.PI / 2 + .71, .375, .023],
  [Math.PI / 2 + .67, .430, .024],
  [Math.PI / 2 + .60, .475, .026],
  [Math.PI - .45, .500, .028],
  [Math.PI, .516, .030],
  [Math.PI + .45, .500, .030],
  [Math.PI + .85, .460, .030],
  [Math.PI + 1.05, .400, .030],
  [Math.PI + 1.10, .310, .030],
  [Math.PI + 1.10, .202, .030],
] as const);
/** The red insert is open above the ribs. The lower side web flares into the belt. */
export const RED_RIDER_SIDE_RETURN = Object.freeze([
  [.43, .492, .012], [.14, .460, .013], [-.04, .420, .013], [-.08, .370, .013], [-.12, .326, .013],
  [-.13, .290, .026], [-.10, .248, .044], [-.04, .199, .059],
] as const);
export const RED_RIDER_HARNESS_ROUTES = [RED_RIDER_HARNESS_ROUTE, RED_RIDER_RIGHT_HARNESS_ROUTE, RED_RIDER_SIDE_RETURN] as const;

/** A closed ribbon follows the torso itself across every shoulder transition. */
export function redRiderHarness(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rows = 128, columns = 6;
  const surface = (u: number, y: number): THREE.Vector3 => loftPoint(RED_RIDER_TORSO, u, vAtHeight(RED_RIDER_TORSO, y), new THREE.Vector3());
  for (const [index, knots] of RED_RIDER_HARNESS_ROUTES.entries()) {
    const route = new THREE.CatmullRomCurve3(knots.map(([u, y, width]) => new THREE.Vector3(u, y, width)));
    const positions: number[] = [], colours: number[] = [], uv: number[] = [], ix: number[] = [];
    for (let layer = 0; layer < 2; layer++) for (let row = 0; row <= rows; row++) {
      const t = row / rows, knot = route.getPoint(t), before = route.getPoint(Math.max(0, t - .0001)), after = route.getPoint(Math.min(1, t + .0001));
      const angle = knot.x, y = knot.y;
      const normal = loftNormal(RED_RIDER_TORSO, angle, vAtHeight(RED_RIDER_TORSO, y), new THREE.Vector3());
      const tangent = surface(after.x, after.y).sub(surface(before.x, before.y)).normalize();
      const lateral = tangent.cross(normal).normalize();
      const du = surface(angle + .001, y).sub(surface(angle - .001, y)).multiplyScalar(500);
      const dy = surface(angle, y + .0001).sub(surface(angle, y - .0001)).multiplyScalar(5000);
      const a = du.dot(du), b = du.dot(dy), c = dy.dot(dy), d = a * c - b * b;
      const lu = (du.dot(lateral) * c - dy.dot(lateral) * b) / d;
      const ly = (dy.dot(lateral) * a - du.dot(lateral) * b) / d;
      for (let column = 0; column <= columns; column++) {
        const across = column / columns * 2 - 1, offset = across * knot.z * .5;
        const u = angle + lu * offset, height = y + ly * offset;
        const p = surface(u, height), n = loftNormal(RED_RIDER_TORSO, u, vAtHeight(RED_RIDER_TORSO, height), new THREE.Vector3());
        const padded = index === 0 && angle > -.02 && y > .322;
        const lowerWeb = index === 0 && y < .322 && angle > 0;
        // Sink the tip under the waist band. At the camera the web still rides
        // ahead of the perforated protector. Its slight crown catches side light.
        const beltTuck = lowerWeb ? .0014 * (1 - THREE.MathUtils.smoothstep(y, .200, .218)) : 0;
        const lift = layer ? .001 : .005 - beltTuck + (padded ? .0055 : .0015) * (1 - across * across);
        p.addScaledVector(n, lift); positions.push(p.x, p.y, p.z); uv.push(column / columns, t);
        const weave = lowerWeb ? .10 * Math.cos(across * 3 * Math.PI) : 0;
        const shade = layer ? .65 : .86 + .14 * (1 - across * across) + weave;
        colours.push(shade, shade, shade);
      }
    }
    const at = (layer: number, row: number, column: number): number => layer * (rows + 1) * (columns + 1) + row * (columns + 1) + column;
    const quad = (a: number, b: number, c: number, d: number): void => { ix.push(a, b, c, a, c, d); };
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      quad(at(0, row, column), at(0, row, column + 1), at(0, row + 1, column + 1), at(0, row + 1, column));
      quad(at(1, row, column), at(1, row + 1, column), at(1, row + 1, column + 1), at(1, row, column + 1));
    }
    for (let row = 0; row < rows; row++) {
      quad(at(0, row, 0), at(0, row + 1, 0), at(1, row + 1, 0), at(1, row, 0));
      quad(at(0, row, columns), at(1, row, columns), at(1, row + 1, columns), at(0, row + 1, columns));
    }
    for (let column = 0; column < columns; column++) {
      quad(at(0, 0, column), at(1, 0, column), at(1, 0, column + 1), at(0, 0, column + 1));
      quad(at(0, rows, column), at(0, rows, column + 1), at(1, rows, column + 1), at(1, rows, column));
    }
    parts.push(buffer(positions, colours, uv, ix));
  }
  const adjuster = surface(Math.PI / 2 + .60, .475);
  const adjusterNormal = loftNormal(RED_RIDER_TORSO, Math.PI / 2 + .60, vAtHeight(RED_RIDER_TORSO, .475), new THREE.Vector3());
  const frameParts: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    frameParts.push(tint(box(.029, .005, .005, 0, sign * .013, 0), C.redRiderArmour, C.redRiderGear, 1.25));
    frameParts.push(tint(box(.005, .026, .005, sign * .012, 0, 0), C.redRiderArmour, C.redRiderGear, 1.25));
  }
  adjuster.addScaledVector(adjusterNormal, .009);
  parts.push(mergeGeometries(frameParts).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), adjusterNormal))
    .translate(adjuster.x, adjuster.y, adjuster.z));
  return mergeGeometries(parts);
}

/** Front chest coordinates at even physical spacing, not clustered loft angles. */
function chestPoint(x: number, y: number, lift: number): THREE.Vector3 {
  const v = vAtHeight(RED_RIDER_TORSO, y), i = Math.min(Math.floor(v), RED_RIDER_TORSO.length - 2), f = v - i;
  const a = RED_RIDER_TORSO[i]!, b = RED_RIDER_TORSO[i + 1]!;
  const halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * f, square = a.square + (b.square - a.square) * f;
  const c = Math.sign(x) * Math.min(.999, Math.abs(x / halfWidth)) ** (square / 2);
  const u = Math.acos(c), p = loftPoint(RED_RIDER_TORSO, u, v, new THREE.Vector3());
  return p.addScaledVector(loftNormal(RED_RIDER_TORSO, u, v, new THREE.Vector3()), lift);
}

/** A red protective field tapering up to the collar, with broad shallow vents. */
export function redRiderChestPlate(): THREE.BufferGeometry {
  const positions: number[] = [], colours: number[] = [], uv: number[] = [], ix: number[] = [];
  const cols = 9, rows = 14, bottom = .235, height = .292;
  const halfWidth = (y: number): number => y < .40 ? .105 + (y - bottom) * .09 : .120 - (y - .40) * .43;
  const add = (x: number, y: number, lift: number, shade: number): number => {
    const p = chestPoint(x, y, lift), t = tintOver(C.redRiderArmour, C.redRiderSuit, shade);
    const at = positions.length / 3; positions.push(p.x, p.y, p.z); colours.push(...t); uv.push(x, y); return at;
  };
  // Each cell has a genuine open top around its elliptical recess. The dark
  // bottom stays above the textile, and the wall drops below the red plate.
  const boundary = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
  for (let row = 0; row < rows; row++) for (let column = 0; column < cols; column++) {
    const y0 = bottom + height * row / rows, y1 = bottom + height * (row + 1) / rows, yc = (y0 + y1) / 2;
    const s0 = column / cols * 2 - 1, s1 = (column + 1) / cols * 2 - 1, sc = (s0 + s1) / 2;
    const xc = sc * halfWidth(yc), outer: number[] = [], rim: number[] = [], well: number[] = [];
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = boundary[k]!, y = dy > 0 ? y1 : dy < 0 ? y0 : yc;
      const x = (dx > 0 ? s1 : dx < 0 ? s0 : sc) * halfWidth(y);
      outer.push(add(x, y, .0038, 1.02));
      const angle = k * Math.PI / 4;
      const hx = xc + Math.cos(angle) * .0040, hy = yc + Math.sin(angle) * .0026;
      rim.push(add(hx, hy, .0040, 1.04)); well.push(add(hx * .998, hy, .0009, .30));
    }
    const centre = add(xc, yc, .0009, .13);
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8;
      ix.push(outer[k]!, outer[n]!, rim[n]!, outer[k]!, rim[n]!, rim[k]!);
      ix.push(rim[k]!, rim[n]!, well[n]!, rim[k]!, well[n]!, well[k]!);
      ix.push(centre, well[k]!, well[n]!);
    }
  }
  const g = buffer(positions, colours, uv, ix);
  return g;
}

/** Retained camera, perforated chest armour, rear tailoring and waist free end. */
export function redRiderTorsoDetails(): THREE.BufferGeometry {
  const parts = [redRiderCamera(), redRiderChestPlate()];
  const point = (angle: number, y: number): THREE.Vector3 => {
    const p = loftPoint(RED_RIDER_TORSO, angle, vAtHeight(RED_RIDER_TORSO, y), new THREE.Vector3());
    p.z += Math.sin(angle) > 0 ? .0015 : -.0015; return p;
  };
  for (const anchor of [-Math.PI / 2]) {
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) path.push(point(anchor - .43 + .86 * i / 24, .442 - .012 * Math.sin(Math.PI * i / 24)));
    parts.push(tint(shaded(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 32, .0016, 5, false)), C.redRiderArmour, C.redRiderSuit, .53));
    for (const side of [-1, 1]) {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) path.push(point(anchor + side * .31, .344 + .084 * i / 12));
      parts.push(tint(shaded(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 16, .0011, 5, false)), C.redRiderArmour, C.redRiderSuit, .60));
    }
  }
  // The loose end is clipped at the left waist and falls clear of the red hem.
  const from = chestPoint(.098, .201, .011), to = chestPoint(.076, .031, .022);
  const along = to.clone().sub(from), middle = from.clone().add(to).multiplyScalar(.5);
  const tail = shaded(new THREE.BoxGeometry(.014, along.length(), .0025));
  tail.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize()));
  tail.translate(middle.x, middle.y, middle.z);
  parts.push(tint(tail, C.redRiderArmour, C.redRiderGear, 1.25));
  parts.push(tint(box(.035, .015, .008, from.x, from.y, from.z), C.redRiderArmour, C.redRiderGear, 2.0));
  return mergeGeometries(parts);
}

export function paintRedRiderTorso(g: THREE.BufferGeometry): void {
  const p = g.getAttribute('position'), c = g.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = Math.abs(p.getX(i)), z = p.getZ(i);
    const panel = y > .34 && y < .439 && x < .115;
    const flank = x > .13 && y > .20 && y < .45;
    const shade = panel ? (z > 0 ? 1.08 : .97) : flank ? .82 : 1;
    c.setXYZ(i, c.getX(i) * shade, c.getY(i) * shade, c.getZ(i) * shade);
  }
}

/** A rounded impact shell with its entire inner rim buried in the sleeve. */
export function redRiderArmour(kind: 'elbow' | 'knee'): THREE.BufferGeometry {
  const knee = kind === 'knee', direction = knee ? 1 : -1;
  const cup = loftGeometry(loftProfile([
    { y: knee ? -.104 : -.076, halfWidth: .026, halfDepth: .010, z: direction * .044, square: 2.5 },
    { y: knee ? -.090 : -.065, halfWidth: knee ? .054 : .045, halfDepth: .024, z: direction * .047, square: 2.5 },
    { y: knee ? -.052 : -.036, halfWidth: knee ? .061 : .049, halfDepth: .032, z: direction * .048, square: 2.4 },
    { y: knee ? -.018 : -.008, halfWidth: knee ? .053 : .043, halfDepth: .025, z: direction * .046, square: 2.5 },
    { y: knee ? -.004 : .004, halfWidth: .025, halfDepth: .010, z: direction * .041, square: 2.5 },
  ]), { radialSegments: 28, subdivisions: 2, shade: 1.15 });
  const plate = loftGeometry(loftProfile([
    { y: knee ? -.245 : -.186, halfWidth: .018, halfDepth: .007, z: direction * .040, square: 3 },
    { y: knee ? -.234 : -.178, halfWidth: knee ? .037 : .028, halfDepth: .014, z: direction * .043, square: 3 },
    { y: knee ? -.170 : -.126, halfWidth: knee ? .042 : .033, halfDepth: .021, z: direction * .046, square: 3.2 },
    { y: knee ? -.142 : -.106, halfWidth: knee ? .039 : .031, halfDepth: .015, z: direction * .043, square: 3 },
    { y: knee ? -.136 : -.100, halfWidth: .024, halfDepth: .007, z: direction * .039, square: 3 },
  ]), { radialSegments: 24, subdivisions: 2, shade: 1.22 });
  const p = plate.getAttribute('position'), c = plate.getAttribute('color');
  const red = tintOver(C.redRiderArmour, C.redRiderHelmet, .72);
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getX(i)) < (knee ? .006 : .004) && p.getZ(i) * direction > .053) c.setXYZ(i, ...red);
  }
  return mergeGeometries([cup, plate]);
}
