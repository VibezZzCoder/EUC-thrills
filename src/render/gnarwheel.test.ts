/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { CHARACTERS, rideStyleFor } from '../data/riders.ts';
import { machineForCharacter } from '../data/machines.ts';
import { SOBER_STYLE } from '../data/rideStyles.ts';
import { BLOCKOUT_COLOURS as C, WHEEL, RIDER_BLOCKOUT as B } from '../data/tuning.ts';
import { GNARWHEEL_LOGO_ASPECT, GNARWHEEL_LOGO_HEIGHT, GNARWHEEL_LOGO_WIDTH,
  GNARWHEEL_LOGO_PNG_BASE64, GNARWHEEL_LOGO_SHA256 } from '../data/gnarwheelLogoAsset.ts';
import { createPose } from '../simulation/EucController.ts';
import { bytesFromBase64, decodePng, inflate } from './pngDecode.ts';
import { validateStrictPng } from './pngStrict.ts';
import { createPlaceholderRider } from './rider.ts';
import { createRidingRig } from './ridingRig.ts';
import { createGhostRider } from './ghostRider.ts';
import { measureObject } from './renderCost.ts';
import { GNARWHEEL_LOOK, gnarwheelCamera, GNARWHEEL_PRINTS, GNARWHEEL_FOREARM } from './gnarwheelLook.ts';
import { GNARWHEEL_MACHINE_LOOK } from './gnarwheelMachineLook.ts';
import { GNARWHEEL_REGIONS, gnarwheelMarkRaster, gnarwheelAtlasPixels } from './gnarwheelAtlas.ts';
import { inkSheet, linearFromHex, toSrgbBytes } from './inkKit.ts';

test('Gnarwheel is the eleventh playable appearance, with his own machine and sober ride', () => {
  assert.equal(CHARACTERS[10]?.id, 'gnarwheel');
  assert.equal(CHARACTERS[10]?.crashVoice, 'gnarwheel');
  assert.equal(machineForCharacter('gnarwheel'), 'gnarwheel');
  assert.equal(rideStyleFor('gnarwheel'), SOBER_STYLE);
});

test('the supplied logo has the pinned hash, strict container and independently verified decoder', () => {
  const bytes = bytesFromBase64(GNARWHEEL_LOGO_PNG_BASE64);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), GNARWHEEL_LOGO_SHA256);
  const png = validateStrictPng(bytes);
  assert.equal(png.width, GNARWHEEL_LOGO_WIDTH);
  assert.equal(png.height, GNARWHEEL_LOGO_HEIGHT);
  assert.ok(png.chunks.every(chunk => ['IHDR','IDAT','IEND'].includes(chunk)));
  const reference = zlib.inflateSync(png.idat, { info: true }) as unknown as
    { buffer: Buffer; engine: { bytesWritten: number } };
  assert.equal(reference.engine.bytesWritten, png.idat.length);
  assert.deepEqual(Buffer.from(inflate(png.idat, reference.buffer.length)), reference.buffer);
  const image = decodePng(bytes);
  assert.equal(image.rgba.length, png.width * png.height * 4);
  assert.equal(GNARWHEEL_LOGO_ASPECT, 1499/375);
});

test('background preparation preserves every source ink RGB and its distressed gaps (private master only)', t => {
  const source = 'references/Gnarwheel/Gnarwheel submitted files/GnarWheel Gnarwheel.png';
  if (!existsSync(source)) { t.skip('Private master is not distributed'); return; }
  const original = decodePng(new Uint8Array(readFileSync(source)));
  const derived = decodePng(bytesFromBase64(GNARWHEEL_LOGO_PNG_BASE64));
  for (let y = 0; y < derived.height; y += 1) for (let x = 0; x < derived.width; x += 1) {
    const a = ((y+814)*original.width+x+195)*4, b = (y*derived.width+x)*4;
    assert.deepEqual(derived.rgba.slice(b,b+3), original.rgba.slice(a,a+3));
    assert.equal(derived.rgba[b+3], Math.max(...original.rgba.slice(a,a+3)) > 2 ? 255 : 0);
  }
});

test('UV orientation reorders pixels only and the atlas has a matching cloth edge', () => {
  const original = decodePng(bytesFromBase64(GNARWHEEL_LOGO_PNG_BASE64));
  const mirrored = gnarwheelMarkRaster('mirror');
  for (const [x,y] of [[0,0],[97,106],[401,241],[1498,374]]) {
    const a=(y*original.width+x)*4, b=(y*original.width+original.width-1-x)*4;
    assert.deepEqual(mirrored.rgba.slice(a,a+4),original.rgba.slice(b,b+4));
  }
  for (const turn of ['left','right'] as const) {
    const raster = gnarwheelMarkRaster(turn);
    assert.equal(raster.width, original.height); assert.equal(raster.height, original.width);
    // A permutation may not create, omit or recolour an ink texel.
    assert.equal(raster.rgba.reduce((sum,value)=>sum+value,0), original.rgba.reduce((sum,value)=>sum+value,0));
  }
  const sleeveRaster = gnarwheelMarkRaster('right');
  for (const [x,y] of [[45,203],[199,907],[303,1234]]) {
    const target = (y*sleeveRaster.width+x)*4;
    const source = ((original.height-1-x)*original.width+original.width-1-y)*4;
    assert.deepEqual(sleeveRaster.rgba.slice(target,target+4),original.rgba.slice(source,source+4),
      'outboard sleeve U compensation must preserve physical glyph handedness');
  }
  const pixels = gnarwheelAtlasPixels(GNARWHEEL_FOREARM);
  // Left outer arm lies on the loft seam; right outer arm is half a wrap
  // away. The physical fields must match after that half-wrap, including
  // the ink crossing the left seam, rather than riding separate plates.
  for (let y=284; y<508; y++) for (let x=0; x<248; x++) {
    const left=(y*512+4+x)*4, right=(y*512+260+(x+124)%248)*4;
    assert.deepEqual(pixels.slice(left,left+4),pixels.slice(right,right+4));
  }
  const sample = (x:number,y:number) => Array.from(pixels.slice((y*512+x)*4,(y*512+x)*4+3));
  const plain=sample(239,274);
  const print = linearFromHex(C.gnarwheelPrint);
  const sleeve = toSrgbBytes(inkSheet(1, 1, linearFromHex(C.gnarwheelTrouser)
    .map((value, i) => value / print[i]!) as unknown as readonly [number, number, number]));
  let inkTexels=0;
  for (let y=284;y<508;y++) for(let x=4;x<252;x++) {
    if(sample(x,y).some((value,i)=>value> sleeve[i]!+20)) inkTexels++;
  }
  assert.ok(inkTexels>150,'wrapped sleeves must contain visible source ink');
  for (const [name, p] of Object.entries(GNARWHEEL_REGIONS)) {
    const expected = name.startsWith('forearm') || name==='limb' ? Array.from(sleeve.slice(0, 3)) : plain;
    assert.deepEqual(sample(Math.round(p.u0*512), Math.round(p.v0*512)),expected);
  }
  assert.notDeepEqual(Array.from(sleeve.slice(0, 3)),plain,'limb and torso tones are distinct');
  assert.equal(GNARWHEEL_PRINTS.length,2);
  assert.equal(C.gnarwheelCloth,GNARWHEEL_LOOK.materials.body.colour);
});

test('every mapped triangle stays on one atlas page; camera and hood stay in ghost silhouette', () => {
  const rider=createPlaceholderRider(GNARWHEEL_LOOK);
  const pages=Object.values(GNARWHEEL_REGIONS);
  let mapped=0;
  try {
    rider.root.traverse(node=> {
      if (!(node instanceof THREE.Mesh) || !(node.material as THREE.MeshStandardMaterial).map) return;
      mapped+=1; const uv=node.geometry.getAttribute('uv'), index=node.geometry.getIndex();
      const count=index?.count??uv.count;
      for(let i=0;i<count;i+=3) {
        const corners=[0,1,2].map(k=>index?.getX(i+k)??i+k);
        assert.ok(pages.some(page=>corners.every(v=>uv.getX(v)>=page.u0-1e-6 && uv.getX(v)<=page.u1+1e-6
          && uv.getY(v)>=page.v0-1e-6 && uv.getY(v)<=page.v1+1e-6)),node.name);
      }
    });
    assert.equal(mapped,10);
    for(const name of ['rider-gnarwheel-hood']) {
      assert.ok((rider.root.getObjectByName(name) as THREE.Mesh).castShadow,name);
    }
  } finally { rider.dispose(); }
  const ghost=createGhostRider(GNARWHEEL_LOOK,GNARWHEEL_MACHINE_LOOK);
  try {
    ghost.setVisible(true);
    assert.ok(ghost.group.getObjectByName('ghost-rider-gnarwheel-hood')?.visible);
    let cameraPresent=false;
    ghost.group.traverse(node=> { if (node instanceof THREE.Mesh && node.visible) {
      node.geometry.computeBoundingBox();
      if(node.parent?.name.includes('rider-neck') && node.geometry.boundingBox!.max.z>.23) cameraPresent=true;
    } });
    assert.ok(cameraPresent,'ghost keeps the camera in its helmet buffer');
  } finally { ghost.dispose(); }
});

test('model uses the existing draw budget, circular tyre and an attached three-dimensional camera', () => {
  const rider=createPlaceholderRider(GNARWHEEL_LOOK), rig=createRidingRig(GNARWHEEL_LOOK,GNARWHEEL_MACHINE_LOOK);
  try {
    const cost=measureObject(rider.root); assert.ok(cost.totalDrawCalls<=40); assert.ok(cost.totalTriangles<=23484);
    const wheel=rig.euc.tyre; assert.deepEqual(wheel.scale.toArray(),[1,1,1]);
    wheel.geometry.computeBoundingBox(); const bounds=wheel.geometry.boundingBox!;
    assert.ok(Math.abs(bounds.max.x-bounds.min.x-WHEEL.tyreDiameter)<.002);
    assert.ok(Math.abs(bounds.max.z-bounds.min.z-WHEEL.tyreDiameter)<.002);
    assert.ok(GNARWHEEL_MACHINE_LOOK.top.kind==='saddle');
    assert.ok(GNARWHEEL_MACHINE_LOOK.top.profile.at(-1)!.y<=.650);
    const camera=gnarwheelCamera(); camera.computeBoundingBox();
    assert.ok(camera.boundingBox!.min.z<.12,'bracket must enter chin shell');
    assert.ok(camera.boundingBox!.max.z>.23,'lens must project beyond housing'); camera.dispose();
    const pose=createPose();
    for(const sign of [-1,1]) for(const crouch of [0,.45,.9]) {
      pose.rollAngle=sign*.64; pose.riderRoll=sign*.78; pose.crouch=crouch;
      pose.carveStance=.8; pose.technicalTurn=sign*.7; pose.riderPitch=.3;
      rig.setTrickPose(.8,sign); rig.apply(pose); rig.group.updateMatrixWorld(true);
      rig.group.traverse(node=> {
        assert.ok(node.matrixWorld.elements.every(Number.isFinite),node.name);
        if (node instanceof THREE.Mesh) {
          const p=node.geometry.getAttribute('position');
          assert.ok(Array.from(p.array).every(Number.isFinite),node.name);
        }
      });
    }
  } finally { rider.dispose(); rig.dispose(); }
});

test('Gnarwheel shoe uppers meet their soles along the heel and toe', () => {
  const rider=createPlaceholderRider(GNARWHEEL_LOOK);
  const soleTop=-B.ankleAbovePedal+.018;
  try {
    rider.root.updateMatrixWorld(true);
    for(const side of ['left','right']) {
      const boot=rider.root.getObjectByName(`rider-boot-${side}`) as THREE.Mesh;
      (boot.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;
      for(const z of [-.090,-.040,.025,.080,.130]) {
        // A point just above the tread must be within the shoe, rather than
        // in the background-visible cavity between two tangent volumes.
        const origin=new THREE.Vector3(.004,soleTop+.0005,z).applyMatrix4(boot.matrixWorld);
        const direction=new THREE.Vector3(0,1,0).transformDirection(boot.matrixWorld);
        const hits=new THREE.Raycaster(origin,direction).intersectObject(boot,false);
        const crossings=new Set(hits.map(hit=>Math.round(hit.distance*1e6)));
        assert.ok(crossings.size>0 && crossings.size%2===1,`${side} shoe opens above sole at z=${z}`);
      }
    }
  } finally { rider.dispose(); }
});
