/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { crashFor, type SampleBank } from './sink.ts';

const APPROVED = 'dda0cf3b706bd4fbb0dca2ed837a4bb52cafd10b06e77f20f077b03b283d4392';
test('Gnarwheel runtime crash is the exact approved WAV, unedited', () => {
  const file=readFileSync('assets/live/audio/crash_gnarwheel.wav');
  assert.equal(createHash('sha256').update(file).digest('hex'),APPROVED);
  assert.equal(file.toString('ascii',0,4),'RIFF');
  const chunks:string[]=[]; let dataBytes=0, rate=0, channels=0, bits=0;
  for(let at=12;at+8<=file.length;) {
    const kind=file.toString('ascii',at,at+4),size=file.readUInt32LE(at+4); chunks.push(kind);
    if(kind==='fmt ') { channels=file.readUInt16LE(at+10);rate=file.readUInt32LE(at+12);bits=file.readUInt16LE(at+22); }
    if(kind==='data')dataBytes=size;
    at+=8+size+(size%2);
  }
  assert.deepEqual(chunks,['fmt ','data']);
  assert.equal(dataBytes/(channels*bits/8*rate),3.4);
});
test('private approval and source bytes agree where the private audition exists', t=> {
  const folder=join('assets','work','audio'),source=join(folder,'crash_gnarwheel_e_v4.wav');
  if(!existsSync(source)){t.skip('Private audition is not distributed');return;}
  const review=JSON.parse(readFileSync(join(folder,'gnarwheel','review-v4.json'),'utf8'));
  assert.equal(review.sha256,APPROVED);
  assert.deepEqual(readFileSync(source),readFileSync('assets/live/audio/crash_gnarwheel.wav'));
});
test('a crash cue selects Gnarwheel buffer independently of the other riders', ()=> {
  const his={} as AudioBuffer,other={} as AudioBuffer;
  const bank={crashGnarwheel:his,crash:other,crashWyldist:other} as SampleBank;
  assert.equal(crashFor('gnarwheel',bank),his);
  assert.equal(crashFor('cool-rider',bank),other);
  assert.equal(crashFor('wyldist',bank),other);
});
