/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Public measurements for the six Quay Quarter lines. Plain data, metres. */
export { QUAY_PADS as EUCLAUDE_LAUNCH_PADS, QUAY_PAD_INSET as EUCLAUDE_ROOF_PAD_INSET } from './quayQuarter.ts';
export const EUCLAUDE_ROOF_TOP=11;
export const QUAY_LINES=[
 {id:'L1',name:'Warehouse roofs',entry:{x:-74,z:-60,heading:0},landings:2,hopLip:null,stopAxis:'z',stopLimit:53},
 {id:'L2',name:'Three-step pocket',entry:{x:24,z:0,heading:0},landings:1,hopLip:null,stopAxis:'z',stopLimit:45},
 {id:'L3',name:'Park pair',entry:{x:10,z:-42,heading:Math.PI/2},landings:2,hopLip:null,stopAxis:'x',stopLimit:91},
 {id:'L4',name:'Grand stair descent',entry:{x:42,z:0,heading:0},landings:1,hopLip:12,stopAxis:'z',stopLimit:44},
 {id:'L5',name:'Waterfront pair',entry:{x:-76,z:78,heading:Math.PI/2},landings:2,hopLip:null,stopAxis:'x',stopLimit:24},
 {id:'L6',name:'Return kicker',entry:{x:-30,z:39,heading:Math.PI},landings:1,hopLip:-7,stopAxis:'z',stopLimit:-58},
] as const;
export const QUAY_GAPS=[{id:'opener',lip:-11,landing:-7,designSpeed:13,padId:'quay-roof-1'},
 {id:'finale',lip:17,landing:25,designSpeed:19.5,padId:'quay-roof-2'}] as const;
