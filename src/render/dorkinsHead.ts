/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS } from '../data/tuning.ts';
import { loftGeometry, loftPoint, loftProfile, mergeGeometries, tintOver, vAtHeight } from './blockoutKit.ts';

const skin = BLOCKOUT_COLOURS.copSkin;
const skull = loftProfile([
  { y: .088, halfWidth: .050, halfDepth: .055, square: 2.4, z: .010 },
  { y: .116, halfWidth: .077, halfDepth: .090, square: 2.5, z: .014 },
  { y: .158, halfWidth: .101, halfDepth: .108, square: 2.5, z: .010 },
  { y: .207, halfWidth: .108, halfDepth: .114, square: 2.5, z: .004 },
  { y: .253, halfWidth: .103, halfDepth: .108, square: 2.4 },
  { y: .291, halfWidth: .085, halfDepth: .089, square: 2.3 },
  { y: .316, halfWidth: .045, halfDepth: .047, square: 2.2 },
  { y: .326, halfWidth: 0, halfDepth: 0 },
]);

// Section bounds for the rider look. The crown surface below also drops around
// the occiput and leaves the brow open independently of that lower rear edge.
export const DORKINS_CROWN = loftProfile([
  { y: .202, halfWidth: .112, halfDepth: .138, z: -.015 },
  { y: .249, halfWidth: .127, halfDepth: .151, z: -.012 },
  { y: .312, halfWidth: .090, halfDepth: .113, z: -.023 },
  { y: .349, halfWidth: 0, halfDepth: 0, z: -.030 },
]);

function painted(geometry: THREE.BufferGeometry, base: number, colour: number): THREE.BufferGeometry {
  const tint = tintOver(base, colour);
  const values = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < values.length; i += 3) values.set(tint, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

type Point = [number, number, number];

function bead(centre: Point, size: Point, colour: number): THREE.BufferGeometry {
  return painted(new THREE.SphereGeometry(1, 10, 6).scale(...size).translate(...centre), skin, colour);
}

function cord(path: Point[], radius: number, colour: number, segments: number, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path.map(p => new THREE.Vector3(...p)), closed);
  return painted(new THREE.TubeGeometry(curve, segments, radius, 5, closed), skin, colour);
}

function onFace(geometry: THREE.BufferGeometry, plane: number, lift = 0): THREE.BufferGeometry {
  const p = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), v = vAtHeight(skull, y);
    const j = Math.min(skull.length - 2, Math.floor(v)), t = v - j;
    const a = skull[j]!, b = skull[j + 1]!;
    const width = THREE.MathUtils.lerp(a.halfWidth, b.halfWidth, t);
    const square = THREE.MathUtils.lerp(a.square, b.square, t);
    const u = Math.acos(Math.sign(x) * Math.min(1, Math.abs(x / width)) ** (square / 2));
    loftPoint(skull, u, v, point);
    p.setZ(i, point.z + p.getZ(i) - plane + lift);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Re-sample two rings of the skin loft onto the hairline. Hair and scalp share
 * the same indexed surface all the way round, including under the back rim. */
function headAndHair(): THREE.BufferGeometry {
  const rows = 2 * skull.length;
  const guide = loftProfile(Array.from({ length: rows }, (_, y) => ({ y, halfWidth: .1, halfDepth: .1 })));
  const radial = 32;
  const g = loftGeometry(guide, { radialSegments: radial });
  const p = g.getAttribute('position'), c = g.getAttribute('color');
  const brown = tintOver(skin, 0x513622);
  const point = new THREE.Vector3();
  for (let row = 0; row < rows; row++) for (let col = 0; col < radial; col++) {
    const u = col * 2 * Math.PI / radial, front = Math.sin(u);
    const t = (front + 1) / 2;
    // Close-cropped rear hair curves up around the ear, then under the helmet.
    const hairline = .125 + .131 * t + .009 * Math.sin(Math.PI * t) ** 2;
    // Keep the jaw and cheek knees at their authored heights on both
    // sides of the hairline so the mouth and brows follow the drawn skin.
    const hair = row >= skull.length;
    const y = hair ? Math.max(hairline + .0015, skull[row - skull.length]!.y)
      : Math.min(hairline, skull[row]!.y);
    const i = row * radial + col;
    loftPoint(skull, u, vAtHeight(skull, y), point);
    // Above the liner the hidden scalp recedes inside the foam, including
    // below the vent wells at the forehead and temples.
    const covered = THREE.MathUtils.smoothstep(y, .215, .272);
    p.setXYZ(i, point.x * (1 - .17 * covered), y - .012 * covered, point.z * (1 - .17 * covered));
    if (hair) c.setXYZ(i, ...brown);
  }
  // The loft adds flat end centres after its wrap rows.
  p.setXYZ(rows * radial, 0, .088, .010);
  p.setXYZ(rows * radial + 1, 0, .314, 0);
  g.computeVertexNormals();
  return g;
}

/** White commuter lid with an integral foam lip. Each opening has a rounded
 * rolled edge, a recessed charcoal wall and a dark base below the shell. */
export function dorkinsHelmet(): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colours: number[] = [], indices: number[] = [];
  const white = BLOCKOUT_COLOURS.copHelmet;
  // Longitudinal ribs run from forehead to nape. A narrow transverse
  // bridge over the crown separates the forward and rear banks of vents.
  const surface = (u: number, v: number, inset: number): THREE.Vector3 => {
    const side = Math.sin(u), along = Math.sin(v), cross = Math.cos(v);
    const height = Math.cos(u) * cross;
    const rim = .219 + .026 * along;
    return new THREE.Vector3((.129 - inset) * side * cross,
      rim + (.124 - inset) * height - .56 * inset,
      -.015 + (.155 - inset) * along - .008 * height);
  };
  const vertex = (u: number, v: number, inset: number, colour: number): number => {
    const pt = surface(u, v, inset);
    const across = surface(u + .001, v, inset).sub(surface(u - .001, v, inset));
    const along = surface(u, v + .001, inset).sub(surface(u, v - .001, inset));
    const n = along.cross(across).normalize();
    if (Math.abs(Math.cos(v)) < 1e-6) n.set(0, 0, Math.sign(v));
    const index = positions.length / 3;
    positions.push(pt.x, pt.y, pt.z); normals.push(n.x, n.y, n.z);
    colours.push(...tintOver(white, colour));
    return index;
  };
  const join = (outer: number[], inner: number[]): void => {
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      indices.push(outer[i]!, inner[i]!, outer[j]!, outer[j]!, inner[i]!, inner[j]!);
    }
  };
  const samples = 16;
  // In this parameterisation lowering v goes towards the nape. Keeping the
  // high sides lower than the central ribs makes the lid sit around the head.
  for (let channel = 0; channel < 6; channel++) for (const end of [-1, 1]) {
    const centre = -Math.PI / 2 + (channel + .5) * Math.PI / 6;
    const middle = end * Math.PI / 4;
    const rings: number[][] = [[], [], [], []];
    for (let i = 0; i < samples; i++) {
      const angle = i * 2 * Math.PI / samples + Math.PI / 4;
      const x = Math.cos(angle), y = Math.sin(angle), extent = Math.max(Math.abs(x), Math.abs(y));
      const dx = x / extent, dy = y / extent;
      const rx = Math.sign(x) * Math.abs(x) ** .72, ry = Math.sign(y) * Math.abs(y) ** .78;
      const width = .145 + .012 * Math.cos(centre);
      const length = .48 - .085 * Math.abs(Math.sin(centre));
      const rake = .040 * Math.sin(centre) * ry * end;
      rings[0]!.push(vertex(centre + Math.PI / 12 * dx, middle + Math.PI / 4 * dy, 0, white));
      rings[1]!.push(vertex(centre + width * rx + rake, middle + length * ry, 0, white));
      rings[2]!.push(vertex(centre + (width - .022) * rx + rake, middle + (length - .025) * ry, .003, 0x8f9493));
      rings[3]!.push(vertex(centre + (width - .036) * rx + rake, middle + (length - .049) * ry, .011, 0x252b30));
    }
    for (let i = 1; i < rings.length; i++) join(rings[i - 1]!, rings[i]!);
    const floor = vertex(centre, middle, .013, 0x24292b);
    for (let i = 0; i < samples; i++) indices.push(rings[3]![i]!, floor, rings[3]![(i + 1) % samples]!);
  }
  // The opening wraps the entire head. Follow the exact shell-edge samples
  // down to the rubber binding and then back to the inset underside.
  const outline: [number, number][] = [];
  const nearCorner = (1 - Math.tan(Math.PI / 8)) / 2;
  for (const side of [-1, 1]) for (let half = 0; half < 2; half++) {
    for (const f of [0, nearCorner, .5, 1 - nearCorner]) {
      outline.push([side * Math.PI / 2, side * (Math.PI / 2 - (half + f) * Math.PI / 2)]);
    }
  }
  const bands: number[][] = [];
  for (const [drop, inset, colour] of [[0, 0, white], [.004, 0, 0x656963],
    [.010, .003, 0x34383a], [.014, .013, 0x34383a]] as const) {
    bands.push(outline.map(([u, v]) => {
      const i = vertex(u, v, inset, colour);
      positions[3 * i + 1]! -= drop;
      normals.splice(3 * i, 3, Math.sin(u) * Math.cos(v), 0, Math.sin(v));
      return i;
    }));
  }
  for (let i = 1; i < bands.length; i++) join(bands[i - 1]!, bands[i]!);
  const underside = positions.length / 3;
  positions.push(0, .204, -.015); normals.push(0, -1, 0); colours.push(...tintOver(white, 0x34383a));
  for (let i = 0; i < outline.length; i++) indices.push(bands[3]![i]!, underside, bands[3]![(i + 1) % outline.length]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  g.setIndex(indices);
  return g;
}

export function dorkinsFace(): THREE.BufferGeometry {
  const pieces = [headAndHair()];
  const frame = 0x4c4034, strap = 0x393638, moustache = 0x54371c;
  for (const side of [-1, 1]) {
    const mirror = (p: Point): Point => [side * p[0], p[1], p[2]];
    const mirrorPath = (knots: Point[]): Point[] => knots.map(mirror);
    const temple: Point[] = [[.082, .204, .100], [.093, .205, .085], [.108, .205, .056],
      [.113, .203, .030], [.113, .201, .009], [.111, .197, -.007], [.108, .183, -.012]];
    const rim: Point[] = [[.010, .201, .126], [.016, .212, .127], [.044, .217, .121],
      [.071, .214, .110], temple[0]!, [.077, .188, .103], [.060, .183, .114],
      [.036, .182, .123], [.015, .187, .127]];
    pieces.push(cord(rim.map(mirror), .00265, frame, 28, true));
    pieces.push(cord(temple.map(mirror), .0028, frame, 13));
    pieces.push(onFace(bead(mirror([.043, .200, .114]), [.020, .0085, .0065], 0xe7d2b3), .114));
    pieces.push(onFace(bead(mirror([.040, .1995, .120]), [.0060, .0065, .0028], 0x493827), .120, .005));
    pieces.push(onFace(bead(mirror([.039, .200, .122]), [.0030, .0042, .0013], 0x221d1b), .122, .007));
    pieces.push(onFace(cord(mirrorPath([[.019, .222, 0],[.038, .226, 0],[.058, .226, 0],[.074, .220, 0]]), .0038, moustache, 8), 0, .001));
    pieces.push(bead(mirror([.103, .180, .004]), [.014, .025, .018], skin));
    pieces.push(bead(mirror([.114, .181, .005]), [.0035, .014, .0085], 0xb17a57));
    // Two helmet straps straddle the ear and meet at a single cheek junction.
    const junction: Point = [.100, .157, .018];
    pieces.push(cord(mirrorPath([[.097, .232, .069],[.105, .210, .055],[.106, .183, .038],junction]), .0045, strap, 9));
    pieces.push(cord(mirrorPath([[.095, .216, -.079],[.112, .187, -.045],[.108, .169, -.019],junction]), .0042, strap, 9));
    pieces.push(cord(mirrorPath([junction,[.093, .140, .039],[.075, .119, .058],[.047, .101, .061],[0, .091, .055]]), .0044, strap, 10));
    pieces.push(onFace(bead(mirror([.029, .148, 0]), [.036, .010, .010], moustache), 0, .002));
  }
  pieces.push(cord([[-.012, .202, .126],[-.006, .205, .130],[0, .206, .131],[.006, .205, .130],[.012, .202, .126]], .00265, frame, 8));
  pieces.push(onFace(bead([0, .184, 0], [.012, .022, .014], skin), 0, .001));
  pieces.push(onFace(bead([0, .169, 0], [.017, .012, .014], skin), 0, .007));
  pieces.push(onFace(cord([[-.030, .129, 0],[-.017, .125, 0],[0, .124, 0],[.017, .126, 0],[.029, .131, 0]], .0023, 0x703f30, 12), 0, .001));
  return mergeGeometries(pieces);
}
