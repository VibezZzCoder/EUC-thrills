/*!
 * EUC Thrills
 * EUC Thrills — original work by VibezZzCoder (https://github.com/VibezZzCoder). Source: https://github.com/VibezZzCoder/EUC-thrills
 * Play: https://vibezzzcoder.github.io/EUC-thrills/
 * Copyright (c) 2026 VibezZzCoder.
 * Code MIT; original game assets CC-BY-4.0. See LICENSE and NOTICE.md.
 *
 * Forks are welcome and the licence allows them. Keep this notice: it is
 * the condition the MIT licence attaches to every copy, and it is how the
 * work stays traceable to the person who did it.
 */(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function t(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=t(s);fetch(s.href,r)}})();/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const eh="185",pm=0,Hh=1,mm=2,Dr=1,gm=2,Tr=3,ts=0,fn=1,Ti=2,Pi=0,Js=1,Gh=2,Vh=3,Wh=4,bm=5,ds=100,vm=101,xm=102,Sm=103,_m=104,Mm=200,ym=201,wm=202,Em=203,Kl=204,Ql=205,Tm=206,Am=207,Rm=208,Cm=209,Pm=210,Lm=211,Im=212,Dm=213,km=214,Jl=0,jl=1,ec=2,ir=3,tc=4,nc=5,ic=6,sc=7,gf=0,Fm=1,Um=2,ci=0,bf=1,vf=2,xf=3,th=4,Sf=5,_f=6,Mf=7,yf=300,_s=301,sr=302,Wa=303,Uo=304,Mo=306,co=1e3,ai=1001,rc=1002,$t=1003,Nm=1004,Kr=1005,Zt=1006,No=1007,Ki=1008,_n=1009,wf=1010,Ef=1011,Or=1012,nh=1013,di=1014,Yn=1015,Di=1016,ih=1017,sh=1018,zr=1020,Tf=35902,Af=35899,Rf=1021,Cf=1022,Ln=1023,ki=1026,ps=1027,rh=1028,ah=1029,Ms=1030,oh=1031,lh=1033,Xa=33776,Ya=33777,qa=33778,$a=33779,ac=35840,oc=35841,lc=35842,cc=35843,hc=36196,uc=37492,dc=37496,fc=37488,pc=37489,ho=37490,mc=37491,gc=37808,bc=37809,vc=37810,xc=37811,Sc=37812,_c=37813,Mc=37814,yc=37815,wc=37816,Ec=37817,Tc=37818,Ac=37819,Rc=37820,Cc=37821,Pc=36492,Lc=36494,Ic=36495,Dc=36283,kc=36284,uo=36285,Fc=36286,Om=3200,Uc=0,zm=1,Zi="",un="srgb",fo="srgb-linear",po="linear",pt="srgb",Cs=7680,Xh=519,Bm=512,Hm=513,Gm=514,ch=515,Vm=516,Wm=517,hh=518,Xm=519,Yh=35044,qh=35048,$h="300 es",oi=2e3,Br=2001;function Ym(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function mo(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function qm(){const i=mo("canvas");return i.style.display="block",i}const Zh={};function Kh(...i){const e="THREE."+i.shift();console.log(e,...i)}function Pf(i){const e=i[0];if(typeof e=="string"&&e.startsWith("TSL:")){const t=i[1];t&&t.isStackTrace?i[0]+=" "+t.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function ze(...i){i=Pf(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...i)}}function ct(...i){i=Pf(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...i)}}function js(...i){const e=i.join(" ");e in Zh||(Zh[e]=!0,ze(...i))}function $m(i,e,t){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(e,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}const Zm={[Jl]:jl,[ec]:ic,[tc]:sc,[ir]:nc,[jl]:Jl,[ic]:ec,[sc]:tc,[nc]:ir};class ys{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){const n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){const n=this._listeners;if(n===void 0)return;const s=n[e];if(s!==void 0){const r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const n=t[e.type];if(n!==void 0){e.target=this;const s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,e);e.target=null}}}const Jt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let Qh=1234567;const kr=Math.PI/180,Hr=180/Math.PI;function cr(){const i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Jt[i&255]+Jt[i>>8&255]+Jt[i>>16&255]+Jt[i>>24&255]+"-"+Jt[e&255]+Jt[e>>8&255]+"-"+Jt[e>>16&15|64]+Jt[e>>24&255]+"-"+Jt[t&63|128]+Jt[t>>8&255]+"-"+Jt[t>>16&255]+Jt[t>>24&255]+Jt[n&255]+Jt[n>>8&255]+Jt[n>>16&255]+Jt[n>>24&255]).toLowerCase()}function st(i,e,t){return Math.max(e,Math.min(t,i))}function uh(i,e){return(i%e+e)%e}function Km(i,e,t,n,s){return n+(i-e)*(s-n)/(t-e)}function Qm(i,e,t){return i!==e?(t-i)/(e-i):0}function Fr(i,e,t){return(1-t)*i+t*e}function Jm(i,e,t,n){return Fr(i,e,1-Math.exp(-t*n))}function jm(i,e=1){return e-Math.abs(uh(i,e*2)-e)}function eg(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*(3-2*i))}function tg(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*i*(i*(i*6-15)+10))}function ng(i,e){return i+Math.floor(Math.random()*(e-i+1))}function ig(i,e){return i+Math.random()*(e-i)}function sg(i){return i*(.5-Math.random())}function rg(i){i!==void 0&&(Qh=i);let e=Qh+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function ag(i){return i*kr}function og(i){return i*Hr}function lg(i){return(i&i-1)===0&&i!==0}function cg(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function hg(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function ug(i,e,t,n,s){const r=Math.cos,a=Math.sin,o=r(t/2),l=a(t/2),c=r((e+n)/2),u=a((e+n)/2),d=r((e-n)/2),h=a((e-n)/2),f=r((n-e)/2),m=a((n-e)/2);switch(s){case"XYX":i.set(o*u,l*d,l*h,o*c);break;case"YZY":i.set(l*h,o*u,l*d,o*c);break;case"ZXZ":i.set(l*d,l*h,o*u,o*c);break;case"XZX":i.set(o*u,l*m,l*f,o*c);break;case"YXY":i.set(l*f,o*u,l*m,o*c);break;case"ZYZ":i.set(l*m,l*f,o*u,o*c);break;default:ze("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function qs(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function rn(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}const Nc={DEG2RAD:kr,RAD2DEG:Hr,generateUUID:cr,clamp:st,euclideanModulo:uh,mapLinear:Km,inverseLerp:Qm,lerp:Fr,damp:Jm,pingpong:jm,smoothstep:eg,smootherstep:tg,randInt:ng,randFloat:ig,randFloatSpread:sg,seededRandom:rg,degToRad:ag,radToDeg:og,isPowerOfTwo:lg,ceilPowerOfTwo:cg,floorPowerOfTwo:hg,setQuaternionFromProperEuler:ug,normalize:rn,denormalize:qs};class tt{static{tt.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,n=this.y,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6],this.y=s[1]*t+s[4]*n+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=st(this.x,e.x,t.x),this.y=st(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=st(this.x,e,t),this.y=st(this.y,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(st(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(st(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const n=Math.cos(t),s=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*s+e.x,this.y=r*s+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Mn{constructor(e=0,t=0,n=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=s}static slerpFlat(e,t,n,s,r,a,o){let l=n[s+0],c=n[s+1],u=n[s+2],d=n[s+3],h=r[a+0],f=r[a+1],m=r[a+2],v=r[a+3];if(d!==v||l!==h||c!==f||u!==m){let p=l*h+c*f+u*m+d*v;p<0&&(h=-h,f=-f,m=-m,v=-v,p=-p);let b=1-o;if(p<.9995){const M=Math.acos(p),T=Math.sin(M);b=Math.sin(b*M)/T,o=Math.sin(o*M)/T,l=l*b+h*o,c=c*b+f*o,u=u*b+m*o,d=d*b+v*o}else{l=l*b+h*o,c=c*b+f*o,u=u*b+m*o,d=d*b+v*o;const M=1/Math.sqrt(l*l+c*c+u*u+d*d);l*=M,c*=M,u*=M,d*=M}}e[t]=l,e[t+1]=c,e[t+2]=u,e[t+3]=d}static multiplyQuaternionsFlat(e,t,n,s,r,a){const o=n[s],l=n[s+1],c=n[s+2],u=n[s+3],d=r[a],h=r[a+1],f=r[a+2],m=r[a+3];return e[t]=o*m+u*d+l*f-c*h,e[t+1]=l*m+u*h+c*d-o*f,e[t+2]=c*m+u*f+o*h-l*d,e[t+3]=u*m-o*d-l*h-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,s){return this._x=e,this._y=t,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const n=e._x,s=e._y,r=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(n/2),u=o(s/2),d=o(r/2),h=l(n/2),f=l(s/2),m=l(r/2);switch(a){case"XYZ":this._x=h*u*d+c*f*m,this._y=c*f*d-h*u*m,this._z=c*u*m+h*f*d,this._w=c*u*d-h*f*m;break;case"YXZ":this._x=h*u*d+c*f*m,this._y=c*f*d-h*u*m,this._z=c*u*m-h*f*d,this._w=c*u*d+h*f*m;break;case"ZXY":this._x=h*u*d-c*f*m,this._y=c*f*d+h*u*m,this._z=c*u*m+h*f*d,this._w=c*u*d-h*f*m;break;case"ZYX":this._x=h*u*d-c*f*m,this._y=c*f*d+h*u*m,this._z=c*u*m-h*f*d,this._w=c*u*d+h*f*m;break;case"YZX":this._x=h*u*d+c*f*m,this._y=c*f*d+h*u*m,this._z=c*u*m-h*f*d,this._w=c*u*d-h*f*m;break;case"XZY":this._x=h*u*d-c*f*m,this._y=c*f*d-h*u*m,this._z=c*u*m+h*f*d,this._w=c*u*d+h*f*m;break;default:ze("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const n=t/2,s=Math.sin(n);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,n=t[0],s=t[4],r=t[8],a=t[1],o=t[5],l=t[9],c=t[2],u=t[6],d=t[10],h=n+o+d;if(h>0){const f=.5/Math.sqrt(h+1);this._w=.25/f,this._x=(u-l)*f,this._y=(r-c)*f,this._z=(a-s)*f}else if(n>o&&n>d){const f=2*Math.sqrt(1+n-o-d);this._w=(u-l)/f,this._x=.25*f,this._y=(s+a)/f,this._z=(r+c)/f}else if(o>d){const f=2*Math.sqrt(1+o-n-d);this._w=(r-c)/f,this._x=(s+a)/f,this._y=.25*f,this._z=(l+u)/f}else{const f=2*Math.sqrt(1+d-n-o);this._w=(a-s)/f,this._x=(r+c)/f,this._y=(l+u)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(st(this.dot(e),-1,1)))}rotateTowards(e,t){const n=this.angleTo(e);if(n===0)return this;const s=Math.min(1,t/n);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const n=e._x,s=e._y,r=e._z,a=e._w,o=t._x,l=t._y,c=t._z,u=t._w;return this._x=n*u+a*o+s*c-r*l,this._y=s*u+a*l+r*o-n*c,this._z=r*u+a*c+n*l-s*o,this._w=a*u-n*o-s*l-r*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,s=e._y,r=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,s=-s,r=-r,a=-a,o=-o);let l=1-t;if(o<.9995){const c=Math.acos(o),u=Math.sin(c);l=Math.sin(l*c)/u,t=Math.sin(t*c)/u,this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(e),s*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class F{static{F.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Jh.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Jh.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*s,this.y=r[1]*t+r[4]*n+r[7]*s,this.z=r[2]*t+r[5]*n+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(e){const t=this.x,n=this.y,s=this.z,r=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*s-o*n),u=2*(o*t-r*s),d=2*(r*n-a*t);return this.x=t+l*c+a*d-o*u,this.y=n+l*u+o*c-r*d,this.z=s+l*d+r*u-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*s,this.y=r[1]*t+r[5]*n+r[9]*s,this.z=r[2]*t+r[6]*n+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=st(this.x,e.x,t.x),this.y=st(this.y,e.y,t.y),this.z=st(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=st(this.x,e,t),this.y=st(this.y,e,t),this.z=st(this.z,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(st(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const n=e.x,s=e.y,r=e.z,a=t.x,o=t.y,l=t.z;return this.x=s*l-r*o,this.y=r*a-n*l,this.z=n*o-s*a,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Oo.copy(this).projectOnVector(e),this.sub(Oo)}reflect(e){return this.sub(Oo.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(st(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y,s=this.z-e.z;return t*t+n*n+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){const s=Math.sin(t)*e;return this.x=s*Math.sin(n),this.y=Math.cos(t)*e,this.z=s*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const Oo=new F,Jh=new Mn;class We{static{We.prototype.isMatrix3=!0}constructor(e,t,n,s,r,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c)}set(e,t,n,s,r,a,o,l,c){const u=this.elements;return u[0]=e,u[1]=s,u[2]=o,u[3]=t,u[4]=r,u[5]=l,u[6]=n,u[7]=a,u[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],u=n[4],d=n[7],h=n[2],f=n[5],m=n[8],v=s[0],p=s[3],b=s[6],M=s[1],T=s[4],x=s[7],A=s[2],y=s[5],E=s[8];return r[0]=a*v+o*M+l*A,r[3]=a*p+o*T+l*y,r[6]=a*b+o*x+l*E,r[1]=c*v+u*M+d*A,r[4]=c*p+u*T+d*y,r[7]=c*b+u*x+d*E,r[2]=h*v+f*M+m*A,r[5]=h*p+f*T+m*y,r[8]=h*b+f*x+m*E,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8];return t*a*u-t*o*c-n*r*u+n*o*l+s*r*c-s*a*l}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8],d=u*a-o*c,h=o*l-u*r,f=c*r-a*l,m=t*d+n*h+s*f;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);const v=1/m;return e[0]=d*v,e[1]=(s*c-u*n)*v,e[2]=(o*n-s*a)*v,e[3]=h*v,e[4]=(u*t-s*l)*v,e[5]=(s*r-o*t)*v,e[6]=f*v,e[7]=(n*l-c*t)*v,e[8]=(a*t-n*r)*v,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,s,r,a,o){const l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+e,-s*c,s*l,-s*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return js("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(zo.makeScale(e,t)),this}rotate(e){return js("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(zo.makeRotation(-e)),this}translate(e,t){return js("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(zo.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<9;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const zo=new We,jh=new We().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),eu=new We().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function dg(){const i={enabled:!0,workingColorSpace:fo,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===pt&&(s.r=Li(s.r),s.g=Li(s.g),s.b=Li(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===pt&&(s.r=er(s.r),s.g=er(s.g),s.b=er(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Zi?po:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return js("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return js("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[fo]:{primaries:e,whitePoint:n,transfer:po,toXYZ:jh,fromXYZ:eu,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:un},outputColorSpaceConfig:{drawingBufferColorSpace:un}},[un]:{primaries:e,whitePoint:n,transfer:pt,toXYZ:jh,fromXYZ:eu,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:un}}}),i}const rt=dg();function Li(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function er(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}let Ps;class fg{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Ps===void 0&&(Ps=mo("canvas")),Ps.width=e.width,Ps.height=e.height;const s=Ps.getContext("2d");e instanceof ImageData?s.putImageData(e,0,0):s.drawImage(e,0,0,e.width,e.height),n=Ps}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=mo("canvas");t.width=e.width,t.height=e.height;const n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);const s=n.getImageData(0,0,e.width,e.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=Li(r[a]/255)*255;return n.putImageData(s,0,0),t}else if(e.data){const t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(Li(t[n]/255)*255):t[n]=Li(t[n]);return{data:t,width:e.width,height:e.height}}else return ze("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let pg=0;class dh{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:pg++}),this.uuid=cr(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push(Bo(s[a].image)):r.push(Bo(s[a]))}else r=Bo(s);n.url=r}return t||(e.images[this.uuid]=n),n}}function Bo(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?fg.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(ze("Texture: Unable to serialize Texture."),{})}let mg=0;const Ho=new F;class ln extends ys{constructor(e=ln.DEFAULT_IMAGE,t=ln.DEFAULT_MAPPING,n=ai,s=ai,r=Zt,a=Ki,o=Ln,l=_n,c=ln.DEFAULT_ANISOTROPY,u=Zi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:mg++}),this.uuid=cr(),this.name="",this.source=new dh(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new tt(0,0),this.repeat=new tt(1,1),this.center=new tt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new We,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Ho).x}get height(){return this.source.getSize(Ho).y}get depth(){return this.source.getSize(Ho).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const n=e[t];if(n===void 0){ze(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){ze(`Texture.setValues(): property '${t}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==yf)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case co:e.x=e.x-Math.floor(e.x);break;case ai:e.x=e.x<0?0:1;break;case rc:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case co:e.y=e.y-Math.floor(e.y);break;case ai:e.y=e.y<0?0:1;break;case rc:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}ln.DEFAULT_IMAGE=null;ln.DEFAULT_MAPPING=yf;ln.DEFAULT_ANISOTROPY=1;class At{static{At.prototype.isVector4=!0}constructor(e=0,t=0,n=0,s=1){this.x=e,this.y=t,this.z=n,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,s){return this.x=e,this.y=t,this.z=n,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*s+a[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,s,r;const l=e.elements,c=l[0],u=l[4],d=l[8],h=l[1],f=l[5],m=l[9],v=l[2],p=l[6],b=l[10];if(Math.abs(u-h)<.01&&Math.abs(d-v)<.01&&Math.abs(m-p)<.01){if(Math.abs(u+h)<.1&&Math.abs(d+v)<.1&&Math.abs(m+p)<.1&&Math.abs(c+f+b-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const T=(c+1)/2,x=(f+1)/2,A=(b+1)/2,y=(u+h)/4,E=(d+v)/4,g=(m+p)/4;return T>x&&T>A?T<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(T),s=y/n,r=E/n):x>A?x<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(x),n=y/s,r=g/s):A<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(A),n=E/r,s=g/r),this.set(n,s,r,t),this}let M=Math.sqrt((p-m)*(p-m)+(d-v)*(d-v)+(h-u)*(h-u));return Math.abs(M)<.001&&(M=1),this.x=(p-m)/M,this.y=(d-v)/M,this.z=(h-u)/M,this.w=Math.acos((c+f+b-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=st(this.x,e.x,t.x),this.y=st(this.y,e.y,t.y),this.z=st(this.z,e.z,t.z),this.w=st(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=st(this.x,e,t),this.y=st(this.y,e,t),this.z=st(this.z,e,t),this.w=st(this.w,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(st(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class gg extends ys{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Zt,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new At(0,0,e,t),this.scissorTest=!1,this.viewport=new At(0,0,e,t),this.textures=[];const s={width:e,height:t,depth:n.depth},r=new ln(s),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){const t={minFilter:Zt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=e,this.textures[s].image.height=t,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const s=Object.assign({},e.textures[t].image);this.textures[t].source=new dh(s)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class hi extends gg{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}}class Lf extends ln{constructor(e=null,t=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=$t,this.minFilter=$t,this.wrapR=ai,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class bg extends ln{constructor(e=null,t=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=$t,this.minFilter=$t,this.wrapR=ai,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class at{static{at.prototype.isMatrix4=!0}constructor(e,t,n,s,r,a,o,l,c,u,d,h,f,m,v,p){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c,u,d,h,f,m,v,p)}set(e,t,n,s,r,a,o,l,c,u,d,h,f,m,v,p){const b=this.elements;return b[0]=e,b[4]=t,b[8]=n,b[12]=s,b[1]=r,b[5]=a,b[9]=o,b[13]=l,b[2]=c,b[6]=u,b[10]=d,b[14]=h,b[3]=f,b[7]=m,b[11]=v,b[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new at().fromArray(this.elements)}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){const t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();const t=this.elements,n=e.elements,s=1/Ls.setFromMatrixColumn(e,0).length(),r=1/Ls.setFromMatrixColumn(e,1).length(),a=1/Ls.setFromMatrixColumn(e,2).length();return t[0]=n[0]*s,t[1]=n[1]*s,t[2]=n[2]*s,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,n=e.x,s=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(s),c=Math.sin(s),u=Math.cos(r),d=Math.sin(r);if(e.order==="XYZ"){const h=a*u,f=a*d,m=o*u,v=o*d;t[0]=l*u,t[4]=-l*d,t[8]=c,t[1]=f+m*c,t[5]=h-v*c,t[9]=-o*l,t[2]=v-h*c,t[6]=m+f*c,t[10]=a*l}else if(e.order==="YXZ"){const h=l*u,f=l*d,m=c*u,v=c*d;t[0]=h+v*o,t[4]=m*o-f,t[8]=a*c,t[1]=a*d,t[5]=a*u,t[9]=-o,t[2]=f*o-m,t[6]=v+h*o,t[10]=a*l}else if(e.order==="ZXY"){const h=l*u,f=l*d,m=c*u,v=c*d;t[0]=h-v*o,t[4]=-a*d,t[8]=m+f*o,t[1]=f+m*o,t[5]=a*u,t[9]=v-h*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){const h=a*u,f=a*d,m=o*u,v=o*d;t[0]=l*u,t[4]=m*c-f,t[8]=h*c+v,t[1]=l*d,t[5]=v*c+h,t[9]=f*c-m,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){const h=a*l,f=a*c,m=o*l,v=o*c;t[0]=l*u,t[4]=v-h*d,t[8]=m*d+f,t[1]=d,t[5]=a*u,t[9]=-o*u,t[2]=-c*u,t[6]=f*d+m,t[10]=h-v*d}else if(e.order==="XZY"){const h=a*l,f=a*c,m=o*l,v=o*c;t[0]=l*u,t[4]=-d,t[8]=c*u,t[1]=h*d+v,t[5]=a*u,t[9]=f*d-m,t[2]=m*d-f,t[6]=o*u,t[10]=v*d+h}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(vg,e,xg)}lookAt(e,t,n){const s=this.elements;return gn.subVectors(e,t),gn.lengthSq()===0&&(gn.z=1),gn.normalize(),zi.crossVectors(n,gn),zi.lengthSq()===0&&(Math.abs(n.z)===1?gn.x+=1e-4:gn.z+=1e-4,gn.normalize(),zi.crossVectors(n,gn)),zi.normalize(),Qr.crossVectors(gn,zi),s[0]=zi.x,s[4]=Qr.x,s[8]=gn.x,s[1]=zi.y,s[5]=Qr.y,s[9]=gn.y,s[2]=zi.z,s[6]=Qr.z,s[10]=gn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],u=n[1],d=n[5],h=n[9],f=n[13],m=n[2],v=n[6],p=n[10],b=n[14],M=n[3],T=n[7],x=n[11],A=n[15],y=s[0],E=s[4],g=s[8],_=s[12],R=s[1],C=s[5],I=s[9],k=s[13],z=s[2],D=s[6],V=s[10],L=s[14],X=s[3],ee=s[7],Y=s[11],J=s[15];return r[0]=a*y+o*R+l*z+c*X,r[4]=a*E+o*C+l*D+c*ee,r[8]=a*g+o*I+l*V+c*Y,r[12]=a*_+o*k+l*L+c*J,r[1]=u*y+d*R+h*z+f*X,r[5]=u*E+d*C+h*D+f*ee,r[9]=u*g+d*I+h*V+f*Y,r[13]=u*_+d*k+h*L+f*J,r[2]=m*y+v*R+p*z+b*X,r[6]=m*E+v*C+p*D+b*ee,r[10]=m*g+v*I+p*V+b*Y,r[14]=m*_+v*k+p*L+b*J,r[3]=M*y+T*R+x*z+A*X,r[7]=M*E+T*C+x*D+A*ee,r[11]=M*g+T*I+x*V+A*Y,r[15]=M*_+T*k+x*L+A*J,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[4],s=e[8],r=e[12],a=e[1],o=e[5],l=e[9],c=e[13],u=e[2],d=e[6],h=e[10],f=e[14],m=e[3],v=e[7],p=e[11],b=e[15],M=l*f-c*h,T=o*f-c*d,x=o*h-l*d,A=a*f-c*u,y=a*h-l*u,E=a*d-o*u;return t*(v*M-p*T+b*x)-n*(m*M-p*A+b*y)+s*(m*T-v*A+b*E)-r*(m*x-v*y+p*E)}determinantAffine(){const e=this.elements,t=e[0],n=e[4],s=e[8],r=e[1],a=e[5],o=e[9],l=e[2],c=e[6],u=e[10];return t*(a*u-o*c)-n*(r*u-o*l)+s*(r*c-a*l)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){const s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=n),this}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8],d=e[9],h=e[10],f=e[11],m=e[12],v=e[13],p=e[14],b=e[15],M=t*o-n*a,T=t*l-s*a,x=t*c-r*a,A=n*l-s*o,y=n*c-r*o,E=s*c-r*l,g=u*v-d*m,_=u*p-h*m,R=u*b-f*m,C=d*p-h*v,I=d*b-f*v,k=h*b-f*p,z=M*k-T*I+x*C+A*R-y*_+E*g;if(z===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const D=1/z;return e[0]=(o*k-l*I+c*C)*D,e[1]=(s*I-n*k-r*C)*D,e[2]=(v*E-p*y+b*A)*D,e[3]=(h*y-d*E-f*A)*D,e[4]=(l*R-a*k-c*_)*D,e[5]=(t*k-s*R+r*_)*D,e[6]=(p*x-m*E-b*T)*D,e[7]=(u*E-h*x+f*T)*D,e[8]=(a*I-o*R+c*g)*D,e[9]=(n*R-t*I-r*g)*D,e[10]=(m*y-v*x+b*M)*D,e[11]=(d*x-u*y-f*M)*D,e[12]=(o*_-a*C-l*g)*D,e[13]=(t*C-n*_+s*g)*D,e[14]=(v*T-m*A-p*M)*D,e[15]=(u*A-d*T+h*M)*D,this}scale(e){const t=this.elements,n=e.x,s=e.y,r=e.z;return t[0]*=n,t[4]*=s,t[8]*=r,t[1]*=n,t[5]*=s,t[9]*=r,t[2]*=n,t[6]*=s,t[10]*=r,t[3]*=n,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,s))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const n=Math.cos(t),s=Math.sin(t),r=1-n,a=e.x,o=e.y,l=e.z,c=r*a,u=r*o;return this.set(c*a+n,c*o-s*l,c*l+s*o,0,c*o+s*l,u*o+n,u*l-s*a,0,c*l-s*o,u*l+s*a,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,s,r,a){return this.set(1,n,r,0,e,1,a,0,t,s,1,0,0,0,0,1),this}compose(e,t,n){const s=this.elements,r=t._x,a=t._y,o=t._z,l=t._w,c=r+r,u=a+a,d=o+o,h=r*c,f=r*u,m=r*d,v=a*u,p=a*d,b=o*d,M=l*c,T=l*u,x=l*d,A=n.x,y=n.y,E=n.z;return s[0]=(1-(v+b))*A,s[1]=(f+x)*A,s[2]=(m-T)*A,s[3]=0,s[4]=(f-x)*y,s[5]=(1-(h+b))*y,s[6]=(p+M)*y,s[7]=0,s[8]=(m+T)*E,s[9]=(p-M)*E,s[10]=(1-(h+v))*E,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,n){const s=this.elements;e.x=s[12],e.y=s[13],e.z=s[14];const r=this.determinantAffine();if(r===0)return n.set(1,1,1),t.identity(),this;let a=Ls.set(s[0],s[1],s[2]).length();const o=Ls.set(s[4],s[5],s[6]).length(),l=Ls.set(s[8],s[9],s[10]).length();r<0&&(a=-a),Nn.copy(this);const c=1/a,u=1/o,d=1/l;return Nn.elements[0]*=c,Nn.elements[1]*=c,Nn.elements[2]*=c,Nn.elements[4]*=u,Nn.elements[5]*=u,Nn.elements[6]*=u,Nn.elements[8]*=d,Nn.elements[9]*=d,Nn.elements[10]*=d,t.setFromRotationMatrix(Nn),n.x=a,n.y=o,n.z=l,this}makePerspective(e,t,n,s,r,a,o=oi,l=!1){const c=this.elements,u=2*r/(t-e),d=2*r/(n-s),h=(t+e)/(t-e),f=(n+s)/(n-s);let m,v;if(l)m=r/(a-r),v=a*r/(a-r);else if(o===oi)m=-(a+r)/(a-r),v=-2*a*r/(a-r);else if(o===Br)m=-a/(a-r),v=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=u,c[4]=0,c[8]=h,c[12]=0,c[1]=0,c[5]=d,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=v,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,s,r,a,o=oi,l=!1){const c=this.elements,u=2/(t-e),d=2/(n-s),h=-(t+e)/(t-e),f=-(n+s)/(n-s);let m,v;if(l)m=1/(a-r),v=a/(a-r);else if(o===oi)m=-2/(a-r),v=-(a+r)/(a-r);else if(o===Br)m=-1/(a-r),v=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=u,c[4]=0,c[8]=0,c[12]=h,c[1]=0,c[5]=d,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=m,c[14]=v,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<16;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}const Ls=new F,Nn=new at,vg=new F(0,0,0),xg=new F(1,1,1),zi=new F,Qr=new F,gn=new F,tu=new at,nu=new Mn;class ns{constructor(e=0,t=0,n=0,s=ns.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,s=this._order){return this._x=e,this._y=t,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){const s=e.elements,r=s[0],a=s[4],o=s[8],l=s[1],c=s[5],u=s[9],d=s[2],h=s[6],f=s[10];switch(t){case"XYZ":this._y=Math.asin(st(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,f),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(h,c),this._z=0);break;case"YXZ":this._x=Math.asin(-st(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(st(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-st(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(h,f),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(st(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,c),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-st(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(h,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-u,f),this._y=0);break;default:ze("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return tu.makeRotationFromQuaternion(e),this.setFromRotationMatrix(tu,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return nu.setFromEuler(this),this.setFromQuaternion(nu,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}ns.DEFAULT_ORDER="XYZ";class If{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let Sg=0;const iu=new F,Is=new Mn,bi=new at,Jr=new F,pr=new F,_g=new F,Mg=new Mn,su=new F(1,0,0),ru=new F(0,1,0),au=new F(0,0,1),ou={type:"added"},yg={type:"removed"},Ds={type:"childadded",child:null},Go={type:"childremoved",child:null};class Yt extends ys{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Sg++}),this.uuid=cr(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=Yt.DEFAULT_UP.clone();const e=new F,t=new ns,n=new Mn,s=new F(1,1,1);function r(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new at},normalMatrix:{value:new We}}),this.matrix=new at,this.matrixWorld=new at,this.matrixAutoUpdate=Yt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=Yt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new If,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Is.setFromAxisAngle(e,t),this.quaternion.multiply(Is),this}rotateOnWorldAxis(e,t){return Is.setFromAxisAngle(e,t),this.quaternion.premultiply(Is),this}rotateX(e){return this.rotateOnAxis(su,e)}rotateY(e){return this.rotateOnAxis(ru,e)}rotateZ(e){return this.rotateOnAxis(au,e)}translateOnAxis(e,t){return iu.copy(e).applyQuaternion(this.quaternion),this.position.add(iu.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(su,e)}translateY(e){return this.translateOnAxis(ru,e)}translateZ(e){return this.translateOnAxis(au,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(bi.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Jr.copy(e):Jr.set(e,t,n);const s=this.parent;this.updateWorldMatrix(!0,!1),pr.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?bi.lookAt(pr,Jr,this.up):bi.lookAt(Jr,pr,this.up),this.quaternion.setFromRotationMatrix(bi),s&&(bi.extractRotation(s.matrixWorld),Is.setFromRotationMatrix(bi),this.quaternion.premultiply(Is.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(ct("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(ou),Ds.child=e,this.dispatchEvent(Ds),Ds.child=null):ct("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(yg),Go.child=e,this.dispatchEvent(Go),Go.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),bi.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),bi.multiply(e.parent.matrixWorld)),e.applyMatrix4(bi),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(ou),Ds.child=e,this.dispatchEvent(Ds),Ds.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,s=this.children.length;n<s;n++){const a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);const s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(pr,e,_g),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(pr,Mg,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const e=this.pivot;if(e!==null){const t=e.x,n=e.y,s=e.z,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*s,r[13]+=n-r[1]*t-r[5]*n-r[9]*s,r[14]+=s-r[2]*t-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){const s=this.parent;if(e===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){const r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(e){const t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(e),s.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,u=l.length;c<u;c++){const d=l[c];r(e.shapes,d)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(e.materials,this.material[l]));s.material=o}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];s.animations.push(r(e.animations,l))}}if(t){const o=a(e.geometries),l=a(e.materials),c=a(e.textures),u=a(e.images),d=a(e.shapes),h=a(e.skeletons),f=a(e.animations),m=a(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),u.length>0&&(n.images=u),d.length>0&&(n.shapes=d),h.length>0&&(n.skeletons=h),f.length>0&&(n.animations=f),m.length>0&&(n.nodes=m)}return n.object=s,n;function a(o){const l=[];for(const c in o){const u=o[c];delete u.metadata,l.push(u)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){const s=e.children[n];this.add(s.clone())}return this}}Yt.DEFAULT_UP=new F(0,1,0);Yt.DEFAULT_MATRIX_AUTO_UPDATE=!0;Yt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class kt extends Yt{constructor(){super(),this.isGroup=!0,this.type="Group"}}const wg={type:"move"};class Vo{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new kt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new kt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new F,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new F),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new kt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new F,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new F,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let s=null,r=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(const v of e.hand.values()){const p=t.getJointPose(v,n),b=this._getHandJoint(c,v);p!==null&&(b.matrix.fromArray(p.transform.matrix),b.matrix.decompose(b.position,b.rotation,b.scale),b.matrixWorldNeedsUpdate=!0,b.jointRadius=p.radius),b.visible=p!==null}const u=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],h=u.position.distanceTo(d.position),f=.02,m=.005;c.inputState.pinching&&h>f+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&h<=f-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:e,target:this})));o!==null&&(s=t.getPose(e.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(wg)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const n=new kt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}const Df={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Bi={h:0,s:0,l:0},jr={h:0,s:0,l:0};function Wo(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}class Ve{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){const s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=un){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,rt.colorSpaceToWorking(this,t),this}setRGB(e,t,n,s=rt.workingColorSpace){return this.r=e,this.g=t,this.b=n,rt.colorSpaceToWorking(this,s),this}setHSL(e,t,n,s=rt.workingColorSpace){if(e=uh(e,1),t=st(t,0,1),n=st(n,0,1),t===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+t):n+t-n*t,a=2*n-r;this.r=Wo(a,r,e+1/3),this.g=Wo(a,r,e),this.b=Wo(a,r,e-1/3)}return rt.colorSpaceToWorking(this,s),this}setStyle(e,t=un){function n(r){r!==void 0&&parseFloat(r)<1&&ze("Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r;const a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:ze("Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){const r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(r,16),t);ze("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=un){const n=Df[e.toLowerCase()];return n!==void 0?this.setHex(n,t):ze("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Li(e.r),this.g=Li(e.g),this.b=Li(e.b),this}copyLinearToSRGB(e){return this.r=er(e.r),this.g=er(e.g),this.b=er(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=un){return rt.workingToColorSpace(jt.copy(this),e),Math.round(st(jt.r*255,0,255))*65536+Math.round(st(jt.g*255,0,255))*256+Math.round(st(jt.b*255,0,255))}getHexString(e=un){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=rt.workingColorSpace){rt.workingToColorSpace(jt.copy(this),t);const n=jt.r,s=jt.g,r=jt.b,a=Math.max(n,s,r),o=Math.min(n,s,r);let l,c;const u=(o+a)/2;if(o===a)l=0,c=0;else{const d=a-o;switch(c=u<=.5?d/(a+o):d/(2-a-o),a){case n:l=(s-r)/d+(s<r?6:0);break;case s:l=(r-n)/d+2;break;case r:l=(n-s)/d+4;break}l/=6}return e.h=l,e.s=c,e.l=u,e}getRGB(e,t=rt.workingColorSpace){return rt.workingToColorSpace(jt.copy(this),t),e.r=jt.r,e.g=jt.g,e.b=jt.b,e}getStyle(e=un){rt.workingToColorSpace(jt.copy(this),e);const t=jt.r,n=jt.g,s=jt.b;return e!==un?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(e,t,n){return this.getHSL(Bi),this.setHSL(Bi.h+e,Bi.s+t,Bi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Bi),e.getHSL(jr);const n=Fr(Bi.h,jr.h,t),s=Fr(Bi.s,jr.s,t),r=Fr(Bi.l,jr.l,t);return this.setHSL(n,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,n=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*s,this.g=r[1]*t+r[4]*n+r[7]*s,this.b=r[2]*t+r[5]*n+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const jt=new Ve;Ve.NAMES=Df;class fh{constructor(e,t=1,n=1e3){this.isFog=!0,this.name="",this.color=new Ve(e),this.near=t,this.far=n}clone(){return new fh(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class Eg extends Yt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new ns,this.environmentIntensity=1,this.environmentRotation=new ns,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}const On=new F,vi=new F,Xo=new F,xi=new F,ks=new F,Fs=new F,lu=new F,Yo=new F,qo=new F,$o=new F,Zo=new At,Ko=new At,Qo=new At;class Wn{constructor(e=new F,t=new F,n=new F){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,s){s.subVectors(n,t),On.subVectors(e,t),s.cross(On);const r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,n,s,r){On.subVectors(s,t),vi.subVectors(n,t),Xo.subVectors(e,t);const a=On.dot(On),o=On.dot(vi),l=On.dot(Xo),c=vi.dot(vi),u=vi.dot(Xo),d=a*c-o*o;if(d===0)return r.set(0,0,0),null;const h=1/d,f=(c*l-o*u)*h,m=(a*u-o*l)*h;return r.set(1-f-m,m,f)}static containsPoint(e,t,n,s){return this.getBarycoord(e,t,n,s,xi)===null?!1:xi.x>=0&&xi.y>=0&&xi.x+xi.y<=1}static getInterpolation(e,t,n,s,r,a,o,l){return this.getBarycoord(e,t,n,s,xi)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,xi.x),l.addScaledVector(a,xi.y),l.addScaledVector(o,xi.z),l)}static getInterpolatedAttribute(e,t,n,s,r,a){return Zo.setScalar(0),Ko.setScalar(0),Qo.setScalar(0),Zo.fromBufferAttribute(e,t),Ko.fromBufferAttribute(e,n),Qo.fromBufferAttribute(e,s),a.setScalar(0),a.addScaledVector(Zo,r.x),a.addScaledVector(Ko,r.y),a.addScaledVector(Qo,r.z),a}static isFrontFacing(e,t,n,s){return On.subVectors(n,t),vi.subVectors(e,t),On.cross(vi).dot(s)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,s){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,n,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return On.subVectors(this.c,this.b),vi.subVectors(this.a,this.b),On.cross(vi).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return Wn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return Wn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,s,r){return Wn.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}containsPoint(e){return Wn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return Wn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const n=this.a,s=this.b,r=this.c;let a,o;ks.subVectors(s,n),Fs.subVectors(r,n),Yo.subVectors(e,n);const l=ks.dot(Yo),c=Fs.dot(Yo);if(l<=0&&c<=0)return t.copy(n);qo.subVectors(e,s);const u=ks.dot(qo),d=Fs.dot(qo);if(u>=0&&d<=u)return t.copy(s);const h=l*d-u*c;if(h<=0&&l>=0&&u<=0)return a=l/(l-u),t.copy(n).addScaledVector(ks,a);$o.subVectors(e,r);const f=ks.dot($o),m=Fs.dot($o);if(m>=0&&f<=m)return t.copy(r);const v=f*c-l*m;if(v<=0&&c>=0&&m<=0)return o=c/(c-m),t.copy(n).addScaledVector(Fs,o);const p=u*m-f*d;if(p<=0&&d-u>=0&&f-m>=0)return lu.subVectors(r,s),o=(d-u)/(d-u+(f-m)),t.copy(s).addScaledVector(lu,o);const b=1/(p+v+h);return a=v*b,o=h*b,t.copy(n).addScaledVector(ks,a).addScaledVector(Fs,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class ws{constructor(e=new F(1/0,1/0,1/0),t=new F(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(zn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(zn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const n=zn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const n=e.geometry;if(n!==void 0){const r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,zn):zn.fromBufferAttribute(r,a),zn.applyMatrix4(e.matrixWorld),this.expandByPoint(zn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),ea.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),ea.copy(n.boundingBox)),ea.applyMatrix4(e.matrixWorld),this.union(ea)}const s=e.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,zn),zn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(mr),ta.subVectors(this.max,mr),Us.subVectors(e.a,mr),Ns.subVectors(e.b,mr),Os.subVectors(e.c,mr),Hi.subVectors(Ns,Us),Gi.subVectors(Os,Ns),ss.subVectors(Us,Os);let t=[0,-Hi.z,Hi.y,0,-Gi.z,Gi.y,0,-ss.z,ss.y,Hi.z,0,-Hi.x,Gi.z,0,-Gi.x,ss.z,0,-ss.x,-Hi.y,Hi.x,0,-Gi.y,Gi.x,0,-ss.y,ss.x,0];return!Jo(t,Us,Ns,Os,ta)||(t=[1,0,0,0,1,0,0,0,1],!Jo(t,Us,Ns,Os,ta))?!1:(na.crossVectors(Hi,Gi),t=[na.x,na.y,na.z],Jo(t,Us,Ns,Os,ta))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,zn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(zn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Si[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Si[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Si[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Si[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Si[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Si[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Si[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Si[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Si),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const Si=[new F,new F,new F,new F,new F,new F,new F,new F],zn=new F,ea=new ws,Us=new F,Ns=new F,Os=new F,Hi=new F,Gi=new F,ss=new F,mr=new F,ta=new F,na=new F,rs=new F;function Jo(i,e,t,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){rs.fromArray(i,r);const o=s.x*Math.abs(rs.x)+s.y*Math.abs(rs.y)+s.z*Math.abs(rs.z),l=e.dot(rs),c=t.dot(rs),u=n.dot(rs);if(Math.max(-Math.max(l,c,u),Math.min(l,c,u))>o)return!1}return!0}const Ht=new F,ia=new tt;let Tg=0;class pn extends ys{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Tg++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=Yh,this.updateRanges=[],this.gpuType=Yn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[n+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)ia.fromBufferAttribute(this,t),ia.applyMatrix3(e),this.setXY(t,ia.x,ia.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Ht.fromBufferAttribute(this,t),Ht.applyMatrix3(e),this.setXYZ(t,Ht.x,Ht.y,Ht.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Ht.fromBufferAttribute(this,t),Ht.applyMatrix4(e),this.setXYZ(t,Ht.x,Ht.y,Ht.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Ht.fromBufferAttribute(this,t),Ht.applyNormalMatrix(e),this.setXYZ(t,Ht.x,Ht.y,Ht.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Ht.fromBufferAttribute(this,t),Ht.transformDirection(e),this.setXYZ(t,Ht.x,Ht.y,Ht.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=qs(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=rn(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=qs(t,this.array)),t}setX(e,t){return this.normalized&&(t=rn(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=qs(t,this.array)),t}setY(e,t){return this.normalized&&(t=rn(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=qs(t,this.array)),t}setZ(e,t){return this.normalized&&(t=rn(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=qs(t,this.array)),t}setW(e,t){return this.normalized&&(t=rn(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=rn(t,this.array),n=rn(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,s){return e*=this.itemSize,this.normalized&&(t=rn(t,this.array),n=rn(n,this.array),s=rn(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e*=this.itemSize,this.normalized&&(t=rn(t,this.array),n=rn(n,this.array),s=rn(s,this.array),r=rn(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==Yh&&(e.usage=this.usage),e}dispose(){this.dispatchEvent({type:"dispose"})}}class kf extends pn{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class Ff extends pn{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class Je extends pn{constructor(e,t,n){super(new Float32Array(e),t,n)}}const Ag=new ws,gr=new F,jo=new F;class Es{constructor(e=new F,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const n=this.center;t!==void 0?n.copy(t):Ag.setFromPoints(e).getCenter(n);let s=0;for(let r=0,a=e.length;r<a;r++)s=Math.max(s,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;gr.subVectors(e,this.center);const t=gr.lengthSq();if(t>this.radius*this.radius){const n=Math.sqrt(t),s=(n-this.radius)*.5;this.center.addScaledVector(gr,s/n),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(jo.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(gr.copy(e.center).add(jo)),this.expandByPoint(gr.copy(e.center).sub(jo))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}let Rg=0;const An=new at,el=new Yt,zs=new F,bn=new ws,br=new ws,Xt=new F;class Ut extends ys{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Rg++}),this.uuid=cr(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Ym(e)?Ff:kf)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new We().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}const s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return An.makeRotationFromQuaternion(e),this.applyMatrix4(An),this}rotateX(e){return An.makeRotationX(e),this.applyMatrix4(An),this}rotateY(e){return An.makeRotationY(e),this.applyMatrix4(An),this}rotateZ(e){return An.makeRotationZ(e),this.applyMatrix4(An),this}translate(e,t,n){return An.makeTranslation(e,t,n),this.applyMatrix4(An),this}scale(e,t,n){return An.makeScale(e,t,n),this.applyMatrix4(An),this}lookAt(e){return el.lookAt(e),el.updateMatrix(),this.applyMatrix4(el.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(zs).negate(),this.translate(zs.x,zs.y,zs.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const n=[];for(let s=0,r=e.length;s<r;s++){const a=e[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Je(n,3))}else{const n=Math.min(e.length,t.count);for(let s=0;s<n;s++){const r=e[s];t.setXYZ(s,r.x,r.y,r.z||0)}e.length>t.count&&ze("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new ws);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){ct("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new F(-1/0,-1/0,-1/0),new F(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,s=t.length;n<s;n++){const r=t[n];bn.setFromBufferAttribute(r),this.morphTargetsRelative?(Xt.addVectors(this.boundingBox.min,bn.min),this.boundingBox.expandByPoint(Xt),Xt.addVectors(this.boundingBox.max,bn.max),this.boundingBox.expandByPoint(Xt)):(this.boundingBox.expandByPoint(bn.min),this.boundingBox.expandByPoint(bn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&ct('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Es);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){ct("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new F,1/0);return}if(e){const n=this.boundingSphere.center;if(bn.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){const o=t[r];br.setFromBufferAttribute(o),this.morphTargetsRelative?(Xt.addVectors(bn.min,br.min),bn.expandByPoint(Xt),Xt.addVectors(bn.max,br.max),bn.expandByPoint(Xt)):(bn.expandByPoint(br.min),bn.expandByPoint(br.max))}bn.getCenter(n);let s=0;for(let r=0,a=e.count;r<a;r++)Xt.fromBufferAttribute(e,r),s=Math.max(s,n.distanceToSquared(Xt));if(t)for(let r=0,a=t.length;r<a;r++){const o=t[r],l=this.morphTargetsRelative;for(let c=0,u=o.count;c<u;c++)Xt.fromBufferAttribute(o,c),l&&(zs.fromBufferAttribute(e,c),Xt.add(zs)),s=Math.max(s,n.distanceToSquared(Xt))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&ct('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){ct("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=t.position,s=t.normal,r=t.uv;let a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new pn(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));const o=[],l=[];for(let g=0;g<n.count;g++)o[g]=new F,l[g]=new F;const c=new F,u=new F,d=new F,h=new tt,f=new tt,m=new tt,v=new F,p=new F;function b(g,_,R){c.fromBufferAttribute(n,g),u.fromBufferAttribute(n,_),d.fromBufferAttribute(n,R),h.fromBufferAttribute(r,g),f.fromBufferAttribute(r,_),m.fromBufferAttribute(r,R),u.sub(c),d.sub(c),f.sub(h),m.sub(h);const C=1/(f.x*m.y-m.x*f.y);isFinite(C)&&(v.copy(u).multiplyScalar(m.y).addScaledVector(d,-f.y).multiplyScalar(C),p.copy(d).multiplyScalar(f.x).addScaledVector(u,-m.x).multiplyScalar(C),o[g].add(v),o[_].add(v),o[R].add(v),l[g].add(p),l[_].add(p),l[R].add(p))}let M=this.groups;M.length===0&&(M=[{start:0,count:e.count}]);for(let g=0,_=M.length;g<_;++g){const R=M[g],C=R.start,I=R.count;for(let k=C,z=C+I;k<z;k+=3)b(e.getX(k+0),e.getX(k+1),e.getX(k+2))}const T=new F,x=new F,A=new F,y=new F;function E(g){A.fromBufferAttribute(s,g),y.copy(A);const _=o[g];T.copy(_),T.sub(A.multiplyScalar(A.dot(_))).normalize(),x.crossVectors(y,_);const C=x.dot(l[g])<0?-1:1;a.setXYZW(g,T.x,T.y,T.z,C)}for(let g=0,_=M.length;g<_;++g){const R=M[g],C=R.start,I=R.count;for(let k=C,z=C+I;k<z;k+=3)E(e.getX(k+0)),E(e.getX(k+1)),E(e.getX(k+2))}this._transformed=!0}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==t.count)n=new pn(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let h=0,f=n.count;h<f;h++)n.setXYZ(h,0,0,0);const s=new F,r=new F,a=new F,o=new F,l=new F,c=new F,u=new F,d=new F;if(e)for(let h=0,f=e.count;h<f;h+=3){const m=e.getX(h+0),v=e.getX(h+1),p=e.getX(h+2);s.fromBufferAttribute(t,m),r.fromBufferAttribute(t,v),a.fromBufferAttribute(t,p),u.subVectors(a,r),d.subVectors(s,r),u.cross(d),o.fromBufferAttribute(n,m),l.fromBufferAttribute(n,v),c.fromBufferAttribute(n,p),o.add(u),l.add(u),c.add(u),n.setXYZ(m,o.x,o.y,o.z),n.setXYZ(v,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let h=0,f=t.count;h<f;h+=3)s.fromBufferAttribute(t,h+0),r.fromBufferAttribute(t,h+1),a.fromBufferAttribute(t,h+2),u.subVectors(a,r),d.subVectors(s,r),u.cross(d),n.setXYZ(h+0,u.x,u.y,u.z),n.setXYZ(h+1,u.x,u.y,u.z),n.setXYZ(h+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Xt.fromBufferAttribute(e,t),Xt.normalize(),e.setXYZ(t,Xt.x,Xt.y,Xt.z)}toNonIndexed(){function e(o,l){const c=o.array,u=o.itemSize,d=o.normalized,h=new c.constructor(l.length*u);let f=0,m=0;for(let v=0,p=l.length;v<p;v++){o.isInterleavedBufferAttribute?f=l[v]*o.data.stride+o.offset:f=l[v]*u;for(let b=0;b<u;b++)h[m++]=c[f++]}return new pn(h,u,d)}if(this.index===null)return ze("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new Ut,n=this.index.array,s=this.attributes;for(const o in s){const l=s[o],c=e(l,n);t.setAttribute(o,c)}const r=this.morphAttributes;for(const o in r){const l=[],c=r[o];for(let u=0,d=c.length;u<d;u++){const h=c[u],f=e(h,n);l.push(f)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const n=this.attributes;for(const l in n){const c=n[l];e.data.attributes[l]=c.toJSON(e.data)}const s={};let r=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],u=[];for(let d=0,h=c.length;d<h;d++){const f=c[d];u.push(f.toJSON(e.data))}u.length>0&&(s[l]=u,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const n=e.index;n!==null&&this.setIndex(n.clone());const s=e.attributes;for(const c in s){const u=s[c];this.setAttribute(c,u.clone(t))}const r=e.morphAttributes;for(const c in r){const u=[],d=r[c];for(let h=0,f=d.length;h<f;h++)u.push(d[h].clone(t));this.morphAttributes[c]=u}this.morphTargetsRelative=e.morphTargetsRelative;const a=e.groups;for(let c=0,u=a.length;c<u;c++){const d=a[c];this.addGroup(d.start,d.count,d.materialIndex)}const o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}let Cg=0;class hr extends ys{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Cg++}),this.uuid=cr(),this.name="",this.type="Material",this.blending=Js,this.side=ts,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Kl,this.blendDst=Ql,this.blendEquation=ds,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ve(0,0,0),this.blendAlpha=0,this.depthFunc=ir,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Xh,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Cs,this.stencilZFail=Cs,this.stencilZPass=Cs,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const n=e[t];if(n===void 0){ze(`Material: parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){ze(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Js&&(n.blending=this.blending),this.side!==ts&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==Kl&&(n.blendSrc=this.blendSrc),this.blendDst!==Ql&&(n.blendDst=this.blendDst),this.blendEquation!==ds&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==ir&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==Xh&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Cs&&(n.stencilFail=this.stencilFail),this.stencilZFail!==Cs&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==Cs&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){const a=[];for(const o in r){const l=r[o];delete l.metadata,a.push(l)}return a}if(t){const r=s(e.textures),a=s(e.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new Ve().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let n=e.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new tt().fromArray(n)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new tt().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let n=null;if(t!==null){const s=t.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}const _i=new F,tl=new F,sa=new F,Vi=new F,nl=new F,ra=new F,il=new F;class Uf{constructor(e=new F,t=new F(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,_i)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=_i.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(_i.copy(this.origin).addScaledVector(this.direction,t),_i.distanceToSquared(e))}distanceSqToSegment(e,t,n,s){tl.copy(e).add(t).multiplyScalar(.5),sa.copy(t).sub(e).normalize(),Vi.copy(this.origin).sub(tl);const r=e.distanceTo(t)*.5,a=-this.direction.dot(sa),o=Vi.dot(this.direction),l=-Vi.dot(sa),c=Vi.lengthSq(),u=Math.abs(1-a*a);let d,h,f,m;if(u>0)if(d=a*l-o,h=a*o-l,m=r*u,d>=0)if(h>=-m)if(h<=m){const v=1/u;d*=v,h*=v,f=d*(d+a*h+2*o)+h*(a*d+h+2*l)+c}else h=r,d=Math.max(0,-(a*h+o)),f=-d*d+h*(h+2*l)+c;else h=-r,d=Math.max(0,-(a*h+o)),f=-d*d+h*(h+2*l)+c;else h<=-m?(d=Math.max(0,-(-a*r+o)),h=d>0?-r:Math.min(Math.max(-r,-l),r),f=-d*d+h*(h+2*l)+c):h<=m?(d=0,h=Math.min(Math.max(-r,-l),r),f=h*(h+2*l)+c):(d=Math.max(0,-(a*r+o)),h=d>0?r:Math.min(Math.max(-r,-l),r),f=-d*d+h*(h+2*l)+c);else h=a>0?-r:r,d=Math.max(0,-(a*h+o)),f=-d*d+h*(h+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(tl).addScaledVector(sa,h),f}intersectSphere(e,t){_i.subVectors(e.center,this.origin);const n=_i.dot(this.direction),s=_i.dot(_i)-n*n,r=e.radius*e.radius;if(s>r)return null;const a=Math.sqrt(r-s),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){const n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,s,r,a,o,l;const c=1/this.direction.x,u=1/this.direction.y,d=1/this.direction.z,h=this.origin;return c>=0?(n=(e.min.x-h.x)*c,s=(e.max.x-h.x)*c):(n=(e.max.x-h.x)*c,s=(e.min.x-h.x)*c),u>=0?(r=(e.min.y-h.y)*u,a=(e.max.y-h.y)*u):(r=(e.max.y-h.y)*u,a=(e.min.y-h.y)*u),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),d>=0?(o=(e.min.z-h.z)*d,l=(e.max.z-h.z)*d):(o=(e.max.z-h.z)*d,l=(e.min.z-h.z)*d),n>l||o>s)||((o>n||n!==n)&&(n=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,t)}intersectsBox(e){return this.intersectBox(e,_i)!==null}intersectTriangle(e,t,n,s,r){nl.subVectors(t,e),ra.subVectors(n,e),il.crossVectors(nl,ra);let a=this.direction.dot(il),o;if(a>0){if(s)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Vi.subVectors(this.origin,e);const l=o*this.direction.dot(ra.crossVectors(Vi,ra));if(l<0)return null;const c=o*this.direction.dot(nl.cross(Vi));if(c<0||l+c>a)return null;const u=-o*Vi.dot(il);return u<0?null:this.at(u/a,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class yo extends hr{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ve(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ns,this.combine=gf,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const cu=new at,as=new Uf,aa=new Es,hu=new F,oa=new F,la=new F,ca=new F,sl=new F,ha=new F,uu=new F,ua=new F;class ht extends Yt{constructor(e=new Ut,t=new yo){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){const n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(s,e);const o=this.morphTargetInfluences;if(r&&o){ha.set(0,0,0);for(let l=0,c=r.length;l<c;l++){const u=o[l],d=r[l];u!==0&&(sl.fromBufferAttribute(d,e),a?ha.addScaledVector(sl,u):ha.addScaledVector(sl.sub(t),u))}t.add(ha)}return t}raycast(e,t){const n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),aa.copy(n.boundingSphere),aa.applyMatrix4(r),as.copy(e.ray).recast(e.near),!(aa.containsPoint(as.origin)===!1&&(as.intersectSphere(aa,hu)===null||as.origin.distanceToSquared(hu)>(e.far-e.near)**2))&&(cu.copy(r).invert(),as.copy(e.ray).applyMatrix4(cu),!(n.boundingBox!==null&&as.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,as)))}_computeIntersections(e,t,n){let s;const r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,u=r.attributes.uv1,d=r.attributes.normal,h=r.groups,f=r.drawRange;if(o!==null)if(Array.isArray(a))for(let m=0,v=h.length;m<v;m++){const p=h[m],b=a[p.materialIndex],M=Math.max(p.start,f.start),T=Math.min(o.count,Math.min(p.start+p.count,f.start+f.count));for(let x=M,A=T;x<A;x+=3){const y=o.getX(x),E=o.getX(x+1),g=o.getX(x+2);s=da(this,b,e,n,c,u,d,y,E,g),s&&(s.faceIndex=Math.floor(x/3),s.face.materialIndex=p.materialIndex,t.push(s))}}else{const m=Math.max(0,f.start),v=Math.min(o.count,f.start+f.count);for(let p=m,b=v;p<b;p+=3){const M=o.getX(p),T=o.getX(p+1),x=o.getX(p+2);s=da(this,a,e,n,c,u,d,M,T,x),s&&(s.faceIndex=Math.floor(p/3),t.push(s))}}else if(l!==void 0)if(Array.isArray(a))for(let m=0,v=h.length;m<v;m++){const p=h[m],b=a[p.materialIndex],M=Math.max(p.start,f.start),T=Math.min(l.count,Math.min(p.start+p.count,f.start+f.count));for(let x=M,A=T;x<A;x+=3){const y=x,E=x+1,g=x+2;s=da(this,b,e,n,c,u,d,y,E,g),s&&(s.faceIndex=Math.floor(x/3),s.face.materialIndex=p.materialIndex,t.push(s))}}else{const m=Math.max(0,f.start),v=Math.min(l.count,f.start+f.count);for(let p=m,b=v;p<b;p+=3){const M=p,T=p+1,x=p+2;s=da(this,a,e,n,c,u,d,M,T,x),s&&(s.faceIndex=Math.floor(p/3),t.push(s))}}}}function Pg(i,e,t,n,s,r,a,o){let l;if(e.side===fn?l=n.intersectTriangle(a,r,s,!0,o):l=n.intersectTriangle(s,r,a,e.side===ts,o),l===null)return null;ua.copy(o),ua.applyMatrix4(i.matrixWorld);const c=t.ray.origin.distanceTo(ua);return c<t.near||c>t.far?null:{distance:c,point:ua.clone(),object:i}}function da(i,e,t,n,s,r,a,o,l,c){i.getVertexPosition(o,oa),i.getVertexPosition(l,la),i.getVertexPosition(c,ca);const u=Pg(i,e,t,n,oa,la,ca,uu);if(u){const d=new F;Wn.getBarycoord(uu,oa,la,ca,d),s&&(u.uv=Wn.getInterpolatedAttribute(s,o,l,c,d,new tt)),r&&(u.uv1=Wn.getInterpolatedAttribute(r,o,l,c,d,new tt)),a&&(u.normal=Wn.getInterpolatedAttribute(a,o,l,c,d,new F),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));const h={a:o,b:l,c,normal:new F,materialIndex:0};Wn.getNormal(oa,la,ca,h.normal),u.face=h,u.barycoord=d}return u}class ph extends ln{constructor(e=null,t=1,n=1,s,r,a,o,l,c=$t,u=$t,d,h){super(null,a,o,l,c,u,s,r,d,h),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class du extends pn{constructor(e,t,n,s=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const Bs=new at,fu=new at,fa=[],pu=new ws,Lg=new at,vr=new ht,xr=new Es;class Nf extends ht{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new du(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<n;s++)this.setMatrixAt(s,Lg)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new ws),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Bs),pu.copy(e.boundingBox).applyMatrix4(Bs),this.boundingBox.union(pu)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Es),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Bs),xr.copy(e.boundingSphere).applyMatrix4(Bs),this.boundingSphere.union(xr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const n=t.morphTargetInfluences,s=this.morphTexture.source.data.data,r=n.length+1,a=e*r+1;for(let o=0;o<n.length;o++)n[o]=s[a+o]}raycast(e,t){const n=this.matrixWorld,s=this.count;if(vr.geometry=this.geometry,vr.material=this.material,vr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),xr.copy(this.boundingSphere),xr.applyMatrix4(n),e.ray.intersectsSphere(xr)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,Bs),fu.multiplyMatrices(n,Bs),vr.matrixWorld=fu,vr.raycast(e,fa);for(let a=0,o=fa.length;a<o;a++){const l=fa[a];l.instanceId=r,l.object=this,t.push(l)}fa.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new du(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){const n=t.morphTargetInfluences,s=n.length+1;this.morphTexture===null&&(this.morphTexture=new ph(new Float32Array(s*this.count),s,this.count,rh,Yn));const r=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=s*e;return r[l]=o,r.set(n,l+1),this}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const rl=new F,Ig=new F,Dg=new We;class us{constructor(e=new F(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,s){return this.normal.set(e,t,n),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){const s=rl.subVectors(n,t).cross(Ig.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){const s=e.delta(rl),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const a=-(e.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(s,a)}intersectsLine(e){const t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const n=t||Dg.getNormalMatrix(e),s=this.coplanarPoint(rl).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const os=new Es,kg=new tt(.5,.5),pa=new F;class mh{constructor(e=new us,t=new us,n=new us,s=new us,r=new us,a=new us){this.planes=[e,t,n,s,r,a]}set(e,t,n,s,r,a){const o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(e){const t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=oi,n=!1){const s=this.planes,r=e.elements,a=r[0],o=r[1],l=r[2],c=r[3],u=r[4],d=r[5],h=r[6],f=r[7],m=r[8],v=r[9],p=r[10],b=r[11],M=r[12],T=r[13],x=r[14],A=r[15];if(s[0].setComponents(c-a,f-u,b-m,A-M).normalize(),s[1].setComponents(c+a,f+u,b+m,A+M).normalize(),s[2].setComponents(c+o,f+d,b+v,A+T).normalize(),s[3].setComponents(c-o,f-d,b-v,A-T).normalize(),n)s[4].setComponents(l,h,p,x).normalize(),s[5].setComponents(c-l,f-h,b-p,A-x).normalize();else if(s[4].setComponents(c-l,f-h,b-p,A-x).normalize(),t===oi)s[5].setComponents(c+l,f+h,b+p,A+x).normalize();else if(t===Br)s[5].setComponents(l,h,p,x).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),os.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),os.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(os)}intersectsSprite(e){os.center.set(0,0,0);const t=kg.distanceTo(e.center);return os.radius=.7071067811865476+t,os.applyMatrix4(e.matrixWorld),this.intersectsSphere(os)}intersectsSphere(e){const t=this.planes,n=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(e){const t=this.planes;for(let n=0;n<6;n++){const s=t[n];if(pa.x=s.normal.x>0?e.max.x:e.min.x,pa.y=s.normal.y>0?e.max.y:e.min.y,pa.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(pa)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Of extends hr{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Ve(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const mu=new at,Oc=new Uf,ma=new Es,ga=new F;class Fg extends Yt{constructor(e=new Ut,t=new Of){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){const n=this.geometry,s=this.matrixWorld,r=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),ma.copy(n.boundingSphere),ma.applyMatrix4(s),ma.radius+=r,e.ray.intersectsSphere(ma)===!1)return;mu.copy(s).invert(),Oc.copy(e.ray).applyMatrix4(mu);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,d=n.attributes.position;if(c!==null){const h=Math.max(0,a.start),f=Math.min(c.count,a.start+a.count);for(let m=h,v=f;m<v;m++){const p=c.getX(m);ga.fromBufferAttribute(d,p),gu(ga,p,l,s,e,t,this)}}else{const h=Math.max(0,a.start),f=Math.min(d.count,a.start+a.count);for(let m=h,v=f;m<v;m++)ga.fromBufferAttribute(d,m),gu(ga,m,l,s,e,t,this)}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function gu(i,e,t,n,s,r,a){const o=Oc.distanceSqToPoint(i);if(o<t){const l=new F;Oc.closestPointToPoint(i,l),l.applyMatrix4(n);const c=s.ray.origin.distanceTo(l);if(c<s.near||c>s.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}class zf extends ln{constructor(e=[],t=_s,n,s,r,a,o,l,c,u){super(e,t,n,s,r,a,o,l,c,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class rr extends ln{constructor(e,t,n=di,s,r,a,o=$t,l=$t,c,u=ki,d=1){if(u!==ki&&u!==ps)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const h={width:e,height:t,depth:d};super(h,s,r,a,o,l,u,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new dh(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}class Ug extends rr{constructor(e,t=di,n=_s,s,r,a=$t,o=$t,l,c=ki){const u={width:e,height:e,depth:1},d=[u,u,u,u,u,u];super(e,e,t,n,s,r,a,o,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class Bf extends ln{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class In extends Ut{constructor(e=1,t=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};const o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);const l=[],c=[],u=[],d=[];let h=0,f=0;m("z","y","x",-1,-1,n,t,e,a,r,0),m("z","y","x",1,-1,n,t,-e,a,r,1),m("x","z","y",1,1,e,n,t,s,a,2),m("x","z","y",1,-1,e,n,-t,s,a,3),m("x","y","z",1,-1,e,t,n,s,r,4),m("x","y","z",-1,-1,e,t,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new Je(c,3)),this.setAttribute("normal",new Je(u,3)),this.setAttribute("uv",new Je(d,2));function m(v,p,b,M,T,x,A,y,E,g,_){const R=x/E,C=A/g,I=x/2,k=A/2,z=y/2,D=E+1,V=g+1;let L=0,X=0;const ee=new F;for(let Y=0;Y<V;Y++){const J=Y*C-k;for(let te=0;te<D;te++){const Te=te*R-I;ee[v]=Te*M,ee[p]=J*T,ee[b]=z,c.push(ee.x,ee.y,ee.z),ee[v]=0,ee[p]=0,ee[b]=y>0?1:-1,u.push(ee.x,ee.y,ee.z),d.push(te/E),d.push(1-Y/g),L+=1}}for(let Y=0;Y<g;Y++)for(let J=0;J<E;J++){const te=h+J+D*Y,Te=h+J+D*(Y+1),Oe=h+(J+1)+D*(Y+1),q=h+(J+1)+D*Y;l.push(te,Te,q),l.push(Te,Oe,q),X+=6}o.addGroup(f,X,_),f+=X,h+=L}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new In(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class ii extends Ut{constructor(e=1,t=1,n=1,s=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};const c=this;s=Math.floor(s),r=Math.floor(r);const u=[],d=[],h=[],f=[];let m=0;const v=[],p=n/2;let b=0;M(),a===!1&&(e>0&&T(!0),t>0&&T(!1)),this.setIndex(u),this.setAttribute("position",new Je(d,3)),this.setAttribute("normal",new Je(h,3)),this.setAttribute("uv",new Je(f,2));function M(){const x=new F,A=new F;let y=0;const E=(t-e)/n;for(let g=0;g<=r;g++){const _=[],R=g/r,C=R*(t-e)+e;for(let I=0;I<=s;I++){const k=I/s,z=k*l+o,D=Math.sin(z),V=Math.cos(z);A.x=C*D,A.y=-R*n+p,A.z=C*V,d.push(A.x,A.y,A.z),x.set(D,E,V).normalize(),h.push(x.x,x.y,x.z),f.push(k,1-R),_.push(m++)}v.push(_)}for(let g=0;g<s;g++)for(let _=0;_<r;_++){const R=v[_][g],C=v[_+1][g],I=v[_+1][g+1],k=v[_][g+1];(e>0||_!==0)&&(u.push(R,C,k),y+=3),(t>0||_!==r-1)&&(u.push(C,I,k),y+=3)}c.addGroup(b,y,0),b+=y}function T(x){const A=m,y=new tt,E=new F;let g=0;const _=x===!0?e:t,R=x===!0?1:-1;for(let I=1;I<=s;I++)d.push(0,p*R,0),h.push(0,R,0),f.push(.5,.5),m++;const C=m;for(let I=0;I<=s;I++){const z=I/s*l+o,D=Math.cos(z),V=Math.sin(z);E.x=_*V,E.y=p*R,E.z=_*D,d.push(E.x,E.y,E.z),h.push(0,R,0),y.x=D*.5+.5,y.y=V*.5*R+.5,f.push(y.x,y.y),m++}for(let I=0;I<s;I++){const k=A+I,z=C+I;x===!0?u.push(z,z+1,k):u.push(z+1,z,k),g+=3}c.addGroup(b,g,x===!0?1:2),b+=g}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ii(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class gh extends ii{constructor(e=1,t=1,n=32,s=1,r=!1,a=0,o=Math.PI*2){super(0,e,t,n,s,r,a,o),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:s,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(e){return new gh(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class bh extends Ut{constructor(e=[],t=[],n=1,s=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:n,detail:s};const r=[],a=[];o(s),c(n),u(),this.setAttribute("position",new Je(r,3)),this.setAttribute("normal",new Je(r.slice(),3)),this.setAttribute("uv",new Je(a,2)),s===0?this.computeVertexNormals():this.normalizeNormals();function o(M){const T=new F,x=new F,A=new F;for(let y=0;y<t.length;y+=3)f(t[y+0],T),f(t[y+1],x),f(t[y+2],A),l(T,x,A,M)}function l(M,T,x,A){const y=A+1,E=[];for(let g=0;g<=y;g++){E[g]=[];const _=M.clone().lerp(x,g/y),R=T.clone().lerp(x,g/y),C=y-g;for(let I=0;I<=C;I++)I===0&&g===y?E[g][I]=_:E[g][I]=_.clone().lerp(R,I/C)}for(let g=0;g<y;g++)for(let _=0;_<2*(y-g)-1;_++){const R=Math.floor(_/2);_%2===0?(h(E[g][R+1]),h(E[g+1][R]),h(E[g][R])):(h(E[g][R+1]),h(E[g+1][R+1]),h(E[g+1][R]))}}function c(M){const T=new F;for(let x=0;x<r.length;x+=3)T.x=r[x+0],T.y=r[x+1],T.z=r[x+2],T.normalize().multiplyScalar(M),r[x+0]=T.x,r[x+1]=T.y,r[x+2]=T.z}function u(){const M=new F;for(let T=0;T<r.length;T+=3){M.x=r[T+0],M.y=r[T+1],M.z=r[T+2];const x=p(M)/2/Math.PI+.5,A=b(M)/Math.PI+.5;a.push(x,1-A)}m(),d()}function d(){for(let M=0;M<a.length;M+=6){const T=a[M+0],x=a[M+2],A=a[M+4],y=Math.max(T,x,A),E=Math.min(T,x,A);y>.9&&E<.1&&(T<.2&&(a[M+0]+=1),x<.2&&(a[M+2]+=1),A<.2&&(a[M+4]+=1))}}function h(M){r.push(M.x,M.y,M.z)}function f(M,T){const x=M*3;T.x=e[x+0],T.y=e[x+1],T.z=e[x+2]}function m(){const M=new F,T=new F,x=new F,A=new F,y=new tt,E=new tt,g=new tt;for(let _=0,R=0;_<r.length;_+=9,R+=6){M.set(r[_+0],r[_+1],r[_+2]),T.set(r[_+3],r[_+4],r[_+5]),x.set(r[_+6],r[_+7],r[_+8]),y.set(a[R+0],a[R+1]),E.set(a[R+2],a[R+3]),g.set(a[R+4],a[R+5]),A.copy(M).add(T).add(x).divideScalar(3);const C=p(A);v(y,R+0,M,C),v(E,R+2,T,C),v(g,R+4,x,C)}}function v(M,T,x,A){A<0&&M.x===1&&(a[T]=M.x-1),x.x===0&&x.z===0&&(a[T]=A/2/Math.PI+.5)}function p(M){return Math.atan2(M.z,-M.x)}function b(M){return Math.atan2(-M.y,Math.sqrt(M.x*M.x+M.z*M.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new bh(e.vertices,e.indices,e.radius,e.detail)}}class vh extends bh{constructor(e=1,t=0){const n=(1+Math.sqrt(5))/2,s=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(s,r,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new vh(e.radius,e.detail)}}class Xr extends Ut{constructor(e=1,t=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:s};const r=e/2,a=t/2,o=Math.floor(n),l=Math.floor(s),c=o+1,u=l+1,d=e/o,h=t/l,f=[],m=[],v=[],p=[];for(let b=0;b<u;b++){const M=b*h-a;for(let T=0;T<c;T++){const x=T*d-r;m.push(x,-M,0),v.push(0,0,1),p.push(T/o),p.push(1-b/l)}}for(let b=0;b<l;b++)for(let M=0;M<o;M++){const T=M+c*b,x=M+c*(b+1),A=M+1+c*(b+1),y=M+1+c*b;f.push(T,x,y),f.push(x,A,y)}this.setIndex(f),this.setAttribute("position",new Je(m,3)),this.setAttribute("normal",new Je(v,3)),this.setAttribute("uv",new Je(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Xr(e.width,e.height,e.widthSegments,e.heightSegments)}}function ar(i){const e={};for(const t in i){e[t]={};for(const n in i[t]){const s=i[t][n];if(bu(s))s.isRenderTargetTexture?(ze("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=s.clone();else if(Array.isArray(s))if(bu(s[0])){const r=[];for(let a=0,o=s.length;a<o;a++)r[a]=s[a].clone();e[t][n]=r}else e[t][n]=s.slice();else e[t][n]=s}}return e}function on(i){const e={};for(let t=0;t<i.length;t++){const n=ar(i[t]);for(const s in n)e[s]=n[s]}return e}function bu(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function Ng(i){const e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function Hf(i){const e=i.getRenderTarget();return e===null?i.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:rt.workingColorSpace}const Og={clone:ar,merge:on};var zg=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Bg=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class fi extends hr{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=zg,this.fragmentShader=Bg,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=ar(e.uniforms),this.uniformsGroups=Ng(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const s in this.uniforms){const a=this.uniforms[s].value;a&&a.isTexture?t.uniforms[s]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[s]={type:"m4",value:a.toArray()}:t.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const n={};for(const s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(const n in e.uniforms){const s=e.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=t[s.value]||null;break;case"c":this.uniforms[n].value=new Ve().setHex(s.value);break;case"v2":this.uniforms[n].value=new tt().fromArray(s.value);break;case"v3":this.uniforms[n].value=new F().fromArray(s.value);break;case"v4":this.uniforms[n].value=new At().fromArray(s.value);break;case"m3":this.uniforms[n].value=new We().fromArray(s.value);break;case"m4":this.uniforms[n].value=new at().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(const n in e.extensions)this.extensions[n]=e.extensions[n];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}}class Hg extends fi{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class nn extends hr{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ve(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ve(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Uc,this.normalScale=new tt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ns,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class Gg extends hr{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Om,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Vg extends hr{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}class Gf extends Yt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Ve(e),this.intensity=t}dispose(){this.dispatchEvent({type:"dispose"})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}}class Wg extends Gf{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Yt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ve(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){const t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}}const al=new at,vu=new F,xu=new F;class Xg{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new tt(512,512),this.mapType=_n,this.map=null,this.mapPass=null,this.matrix=new at,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new mh,this._frameExtents=new tt(1,1),this._viewportCount=1,this._viewports=[new At(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,n=this.matrix;vu.setFromMatrixPosition(e.matrixWorld),t.position.copy(vu),xu.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(xu),t.updateMatrixWorld(),al.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(al,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===Br||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(al)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}const ba=new F,va=new Mn,Jn=new F;class Vf extends Yt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new at,this.projectionMatrix=new at,this.projectionMatrixInverse=new at,this.coordinateSystem=oi,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(ba,va,Jn),Jn.x===1&&Jn.y===1&&Jn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(ba,va,Jn.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(ba,va,Jn),Jn.x===1&&Jn.y===1&&Jn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(ba,va,Jn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const Wi=new F,Su=new tt,_u=new tt;class Pn extends Vf{constructor(e=50,t=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=Hr*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(kr*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Hr*2*Math.atan(Math.tan(kr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Wi.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Wi.x,Wi.y).multiplyScalar(-e/Wi.z),Wi.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Wi.x,Wi.y).multiplyScalar(-e/Wi.z)}getViewSize(e,t){return this.getViewBounds(e,Su,_u),t.subVectors(_u,Su)}setViewOffset(e,t,n,s,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(kr*.5*this.fov)/this.zoom,n=2*t,s=this.aspect*n,r=-.5*s;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*s/l,t-=a.offsetY*n/c,s*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class xh extends Vf{constructor(e=-1,t=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2;let r=n-e,a=n+e,o=s+t,l=s-t;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=u*this.view.offsetY,l=o-u*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}class Yg extends Xg{constructor(){super(new xh(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class qg extends Gf{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Yt.DEFAULT_UP),this.updateMatrix(),this.target=new Yt,this.shadow=new Yg}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}}const Hs=-90,Gs=1;class $g extends Yt{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const s=new Pn(Hs,Gs,e,t);s.layers=this.layers,this.add(s);const r=new Pn(Hs,Gs,e,t);r.layers=this.layers,this.add(r);const a=new Pn(Hs,Gs,e,t);a.layers=this.layers,this.add(a);const o=new Pn(Hs,Gs,e,t);o.layers=this.layers,this.add(o);const l=new Pn(Hs,Gs,e,t);l.layers=this.layers,this.add(l);const c=new Pn(Hs,Gs,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[n,s,r,a,o,l]=t;for(const c of t)this.remove(c);if(e===oi)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Br)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[r,a,o,l,c,u]=this.children,d=e.getRenderTarget(),h=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),m=e.xr.enabled;e.xr.enabled=!1;const v=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let p=!1;e.isWebGLRenderer===!0?p=e.state.buffers.depth.getReversed():p=e.reversedDepthBuffer,e.setRenderTarget(n,0,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,r),e.setRenderTarget(n,1,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(n,4,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=v,e.setRenderTarget(n,5,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,u),e.setRenderTarget(d,h,f),e.xr.enabled=m,n.texture.needsPMREMUpdate=!0}}class Zg extends Pn{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}class Wf{static{Wf.prototype.isMatrix2=!0}constructor(e,t,n,s){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,s){const r=this.elements;return r[0]=e,r[2]=t,r[1]=n,r[3]=s,this}}function Mu(i,e,t,n){const s=Kg(n);switch(t){case Rf:return i*e;case rh:return i*e/s.components*s.byteLength;case ah:return i*e/s.components*s.byteLength;case Ms:return i*e*2/s.components*s.byteLength;case oh:return i*e*2/s.components*s.byteLength;case Cf:return i*e*3/s.components*s.byteLength;case Ln:return i*e*4/s.components*s.byteLength;case lh:return i*e*4/s.components*s.byteLength;case Xa:case Ya:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case qa:case $a:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case oc:case cc:return Math.max(i,16)*Math.max(e,8)/4;case ac:case lc:return Math.max(i,8)*Math.max(e,8)/2;case hc:case uc:case fc:case pc:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case dc:case ho:case mc:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case gc:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case bc:return Math.floor((i+4)/5)*Math.floor((e+3)/4)*16;case vc:return Math.floor((i+4)/5)*Math.floor((e+4)/5)*16;case xc:return Math.floor((i+5)/6)*Math.floor((e+4)/5)*16;case Sc:return Math.floor((i+5)/6)*Math.floor((e+5)/6)*16;case _c:return Math.floor((i+7)/8)*Math.floor((e+4)/5)*16;case Mc:return Math.floor((i+7)/8)*Math.floor((e+5)/6)*16;case yc:return Math.floor((i+7)/8)*Math.floor((e+7)/8)*16;case wc:return Math.floor((i+9)/10)*Math.floor((e+4)/5)*16;case Ec:return Math.floor((i+9)/10)*Math.floor((e+5)/6)*16;case Tc:return Math.floor((i+9)/10)*Math.floor((e+7)/8)*16;case Ac:return Math.floor((i+9)/10)*Math.floor((e+9)/10)*16;case Rc:return Math.floor((i+11)/12)*Math.floor((e+9)/10)*16;case Cc:return Math.floor((i+11)/12)*Math.floor((e+11)/12)*16;case Pc:case Lc:case Ic:return Math.ceil(i/4)*Math.ceil(e/4)*16;case Dc:case kc:return Math.ceil(i/4)*Math.ceil(e/4)*8;case uo:case Fc:return Math.ceil(i/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Kg(i){switch(i){case _n:case wf:return{byteLength:1,components:1};case Or:case Ef:case Di:return{byteLength:2,components:1};case ih:case sh:return{byteLength:2,components:4};case di:case nh:case Yn:return{byteLength:4,components:1};case Tf:case Af:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:eh}}));typeof window<"u"&&(window.__THREE__?ze("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=eh);/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */function Xf(){let i=null,e=!1,t=null,n=null;function s(r,a){t(r,a),n=i.requestAnimationFrame(s)}return{start:function(){e!==!0&&t!==null&&i!==null&&(n=i.requestAnimationFrame(s),e=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){i=r}}}function Qg(i){const e=new WeakMap;function t(o,l){const c=o.array,u=o.usage,d=c.byteLength,h=i.createBuffer();i.bindBuffer(l,h),i.bufferData(l,c,u),o.onUploadCallback();let f;if(c instanceof Float32Array)f=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=i.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?f=i.HALF_FLOAT:f=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=i.SHORT;else if(c instanceof Uint32Array)f=i.UNSIGNED_INT;else if(c instanceof Int32Array)f=i.INT;else if(c instanceof Int8Array)f=i.BYTE;else if(c instanceof Uint8Array)f=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:h,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:d}}function n(o,l,c){const u=l.array,d=l.updateRanges;if(i.bindBuffer(c,o),d.length===0)i.bufferSubData(c,0,u);else{d.sort((f,m)=>f.start-m.start);let h=0;for(let f=1;f<d.length;f++){const m=d[h],v=d[f];v.start<=m.start+m.count+1?m.count=Math.max(m.count,v.start+v.count-m.start):(++h,d[h]=v)}d.length=h+1;for(let f=0,m=d.length;f<m;f++){const v=d[f];i.bufferSubData(c,v.start*u.BYTES_PER_ELEMENT,u,v.start,v.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=e.get(o);l&&(i.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const u=e.get(o);(!u||u.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:s,remove:r,update:a}}var Jg=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,jg=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,e0=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,t0=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,n0=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,i0=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,s0=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,r0=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,a0=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,o0=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,l0=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,c0=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,h0=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,u0=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,d0=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,f0=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,p0=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,m0=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,g0=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,b0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,v0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,x0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,S0=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,_0=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,M0=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,y0=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,w0=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,E0=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,T0=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,A0=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,R0="gl_FragColor = linearToOutputTexel( gl_FragColor );",C0=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,P0=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,L0=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,I0=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,D0=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,k0=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,F0=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,U0=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,N0=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,O0=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,z0=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,B0=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,H0=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,G0=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,V0=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,W0=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,X0=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Y0=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,q0=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,$0=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Z0=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,K0=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Q0=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,J0=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,j0=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,eb=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,tb=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,nb=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,ib=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,sb=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,rb=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,ab=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,ob=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,lb=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,cb=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,hb=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,ub=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,db=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,fb=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,pb=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,mb=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,gb=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,bb=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,vb=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,xb=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Sb=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,_b=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Mb=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,yb=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,wb=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Eb=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Tb=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Ab=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,Rb=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Cb=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Pb=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Lb=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Ib=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Db=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,kb=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,Fb=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Ub=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Nb=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Ob=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,zb=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Bb=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Hb=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Gb=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Vb=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Wb=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Xb=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,Yb=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,qb=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,$b=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Zb=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Kb=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,Qb=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const Jb=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,jb=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ev=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,tv=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,nv=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,iv=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,sv=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,rv=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,av=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,ov=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,lv=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,cv=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,hv=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,uv=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,dv=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,fv=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,pv=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,mv=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,gv=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,bv=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,vv=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,xv=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Sv=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,_v=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Mv=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,yv=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,wv=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ev=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Tv=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Av=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Rv=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Cv=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Pv=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Lv=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ke={alphahash_fragment:Jg,alphahash_pars_fragment:jg,alphamap_fragment:e0,alphamap_pars_fragment:t0,alphatest_fragment:n0,alphatest_pars_fragment:i0,aomap_fragment:s0,aomap_pars_fragment:r0,batching_pars_vertex:a0,batching_vertex:o0,begin_vertex:l0,beginnormal_vertex:c0,bsdfs:h0,iridescence_fragment:u0,bumpmap_pars_fragment:d0,clipping_planes_fragment:f0,clipping_planes_pars_fragment:p0,clipping_planes_pars_vertex:m0,clipping_planes_vertex:g0,color_fragment:b0,color_pars_fragment:v0,color_pars_vertex:x0,color_vertex:S0,common:_0,cube_uv_reflection_fragment:M0,defaultnormal_vertex:y0,displacementmap_pars_vertex:w0,displacementmap_vertex:E0,emissivemap_fragment:T0,emissivemap_pars_fragment:A0,colorspace_fragment:R0,colorspace_pars_fragment:C0,envmap_fragment:P0,envmap_common_pars_fragment:L0,envmap_pars_fragment:I0,envmap_pars_vertex:D0,envmap_physical_pars_fragment:W0,envmap_vertex:k0,fog_vertex:F0,fog_pars_vertex:U0,fog_fragment:N0,fog_pars_fragment:O0,gradientmap_pars_fragment:z0,lightmap_pars_fragment:B0,lights_lambert_fragment:H0,lights_lambert_pars_fragment:G0,lights_pars_begin:V0,lights_toon_fragment:X0,lights_toon_pars_fragment:Y0,lights_phong_fragment:q0,lights_phong_pars_fragment:$0,lights_physical_fragment:Z0,lights_physical_pars_fragment:K0,lights_fragment_begin:Q0,lights_fragment_maps:J0,lights_fragment_end:j0,lightprobes_pars_fragment:eb,logdepthbuf_fragment:tb,logdepthbuf_pars_fragment:nb,logdepthbuf_pars_vertex:ib,logdepthbuf_vertex:sb,map_fragment:rb,map_pars_fragment:ab,map_particle_fragment:ob,map_particle_pars_fragment:lb,metalnessmap_fragment:cb,metalnessmap_pars_fragment:hb,morphinstance_vertex:ub,morphcolor_vertex:db,morphnormal_vertex:fb,morphtarget_pars_vertex:pb,morphtarget_vertex:mb,normal_fragment_begin:gb,normal_fragment_maps:bb,normal_pars_fragment:vb,normal_pars_vertex:xb,normal_vertex:Sb,normalmap_pars_fragment:_b,clearcoat_normal_fragment_begin:Mb,clearcoat_normal_fragment_maps:yb,clearcoat_pars_fragment:wb,iridescence_pars_fragment:Eb,opaque_fragment:Tb,packing:Ab,premultiplied_alpha_fragment:Rb,project_vertex:Cb,dithering_fragment:Pb,dithering_pars_fragment:Lb,roughnessmap_fragment:Ib,roughnessmap_pars_fragment:Db,shadowmap_pars_fragment:kb,shadowmap_pars_vertex:Fb,shadowmap_vertex:Ub,shadowmask_pars_fragment:Nb,skinbase_vertex:Ob,skinning_pars_vertex:zb,skinning_vertex:Bb,skinnormal_vertex:Hb,specularmap_fragment:Gb,specularmap_pars_fragment:Vb,tonemapping_fragment:Wb,tonemapping_pars_fragment:Xb,transmission_fragment:Yb,transmission_pars_fragment:qb,uv_pars_fragment:$b,uv_pars_vertex:Zb,uv_vertex:Kb,worldpos_vertex:Qb,background_vert:Jb,background_frag:jb,backgroundCube_vert:ev,backgroundCube_frag:tv,cube_vert:nv,cube_frag:iv,depth_vert:sv,depth_frag:rv,distance_vert:av,distance_frag:ov,equirect_vert:lv,equirect_frag:cv,linedashed_vert:hv,linedashed_frag:uv,meshbasic_vert:dv,meshbasic_frag:fv,meshlambert_vert:pv,meshlambert_frag:mv,meshmatcap_vert:gv,meshmatcap_frag:bv,meshnormal_vert:vv,meshnormal_frag:xv,meshphong_vert:Sv,meshphong_frag:_v,meshphysical_vert:Mv,meshphysical_frag:yv,meshtoon_vert:wv,meshtoon_frag:Ev,points_vert:Tv,points_frag:Av,shadow_vert:Rv,shadow_frag:Cv,sprite_vert:Pv,sprite_frag:Lv},xe={common:{diffuse:{value:new Ve(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new We},alphaMap:{value:null},alphaMapTransform:{value:new We},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new We}},envmap:{envMap:{value:null},envMapRotation:{value:new We},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new We}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new We}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new We},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new We},normalScale:{value:new tt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new We},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new We}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new We}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new We}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ve(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new F},probesMax:{value:new F},probesResolution:{value:new F}},points:{diffuse:{value:new Ve(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new We},alphaTest:{value:0},uvTransform:{value:new We}},sprite:{diffuse:{value:new Ve(16777215)},opacity:{value:1},center:{value:new tt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new We},alphaMap:{value:null},alphaMapTransform:{value:new We},alphaTest:{value:0}}},si={basic:{uniforms:on([xe.common,xe.specularmap,xe.envmap,xe.aomap,xe.lightmap,xe.fog]),vertexShader:Ke.meshbasic_vert,fragmentShader:Ke.meshbasic_frag},lambert:{uniforms:on([xe.common,xe.specularmap,xe.envmap,xe.aomap,xe.lightmap,xe.emissivemap,xe.bumpmap,xe.normalmap,xe.displacementmap,xe.fog,xe.lights,{emissive:{value:new Ve(0)},envMapIntensity:{value:1}}]),vertexShader:Ke.meshlambert_vert,fragmentShader:Ke.meshlambert_frag},phong:{uniforms:on([xe.common,xe.specularmap,xe.envmap,xe.aomap,xe.lightmap,xe.emissivemap,xe.bumpmap,xe.normalmap,xe.displacementmap,xe.fog,xe.lights,{emissive:{value:new Ve(0)},specular:{value:new Ve(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ke.meshphong_vert,fragmentShader:Ke.meshphong_frag},standard:{uniforms:on([xe.common,xe.envmap,xe.aomap,xe.lightmap,xe.emissivemap,xe.bumpmap,xe.normalmap,xe.displacementmap,xe.roughnessmap,xe.metalnessmap,xe.fog,xe.lights,{emissive:{value:new Ve(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ke.meshphysical_vert,fragmentShader:Ke.meshphysical_frag},toon:{uniforms:on([xe.common,xe.aomap,xe.lightmap,xe.emissivemap,xe.bumpmap,xe.normalmap,xe.displacementmap,xe.gradientmap,xe.fog,xe.lights,{emissive:{value:new Ve(0)}}]),vertexShader:Ke.meshtoon_vert,fragmentShader:Ke.meshtoon_frag},matcap:{uniforms:on([xe.common,xe.bumpmap,xe.normalmap,xe.displacementmap,xe.fog,{matcap:{value:null}}]),vertexShader:Ke.meshmatcap_vert,fragmentShader:Ke.meshmatcap_frag},points:{uniforms:on([xe.points,xe.fog]),vertexShader:Ke.points_vert,fragmentShader:Ke.points_frag},dashed:{uniforms:on([xe.common,xe.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ke.linedashed_vert,fragmentShader:Ke.linedashed_frag},depth:{uniforms:on([xe.common,xe.displacementmap]),vertexShader:Ke.depth_vert,fragmentShader:Ke.depth_frag},normal:{uniforms:on([xe.common,xe.bumpmap,xe.normalmap,xe.displacementmap,{opacity:{value:1}}]),vertexShader:Ke.meshnormal_vert,fragmentShader:Ke.meshnormal_frag},sprite:{uniforms:on([xe.sprite,xe.fog]),vertexShader:Ke.sprite_vert,fragmentShader:Ke.sprite_frag},background:{uniforms:{uvTransform:{value:new We},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ke.background_vert,fragmentShader:Ke.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new We}},vertexShader:Ke.backgroundCube_vert,fragmentShader:Ke.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ke.cube_vert,fragmentShader:Ke.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ke.equirect_vert,fragmentShader:Ke.equirect_frag},distance:{uniforms:on([xe.common,xe.displacementmap,{referencePosition:{value:new F},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ke.distance_vert,fragmentShader:Ke.distance_frag},shadow:{uniforms:on([xe.lights,xe.fog,{color:{value:new Ve(0)},opacity:{value:1}}]),vertexShader:Ke.shadow_vert,fragmentShader:Ke.shadow_frag}};si.physical={uniforms:on([si.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new We},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new We},clearcoatNormalScale:{value:new tt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new We},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new We},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new We},sheen:{value:0},sheenColor:{value:new Ve(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new We},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new We},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new We},transmissionSamplerSize:{value:new tt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new We},attenuationDistance:{value:0},attenuationColor:{value:new Ve(0)},specularColor:{value:new Ve(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new We},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new We},anisotropyVector:{value:new tt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new We}}]),vertexShader:Ke.meshphysical_vert,fragmentShader:Ke.meshphysical_frag};const xa={r:0,b:0,g:0},Iv=new at,Yf=new We;Yf.set(-1,0,0,0,1,0,0,0,1);function Dv(i,e,t,n,s,r){const a=new Ve(0);let o=s===!0?0:1,l,c,u=null,d=0,h=null;function f(M){let T=M.isScene===!0?M.background:null;if(T&&T.isTexture){const x=M.backgroundBlurriness>0;T=e.get(T,x)}return T}function m(M){let T=!1;const x=f(M);x===null?p(a,o):x&&x.isColor&&(p(x,1),T=!0);const A=i.xr.getEnvironmentBlendMode();A==="additive"?t.buffers.color.setClear(0,0,0,1,r):A==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(i.autoClear||T)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function v(M,T){const x=f(T);x&&(x.isCubeTexture||x.mapping===Mo)?(c===void 0&&(c=new ht(new In(1,1,1),new fi({name:"BackgroundCubeMaterial",uniforms:ar(si.backgroundCube.uniforms),vertexShader:si.backgroundCube.vertexShader,fragmentShader:si.backgroundCube.fragmentShader,side:fn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(A,y,E){this.matrixWorld.copyPosition(E.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=x,c.material.uniforms.backgroundBlurriness.value=T.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=T.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(Iv.makeRotationFromEuler(T.backgroundRotation)).transpose(),x.isCubeTexture&&x.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Yf),c.material.toneMapped=rt.getTransfer(x.colorSpace)!==pt,(u!==x||d!==x.version||h!==i.toneMapping)&&(c.material.needsUpdate=!0,u=x,d=x.version,h=i.toneMapping),c.layers.enableAll(),M.unshift(c,c.geometry,c.material,0,0,null)):x&&x.isTexture&&(l===void 0&&(l=new ht(new Xr(2,2),new fi({name:"BackgroundMaterial",uniforms:ar(si.background.uniforms),vertexShader:si.background.vertexShader,fragmentShader:si.background.fragmentShader,side:ts,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=x,l.material.uniforms.backgroundIntensity.value=T.backgroundIntensity,l.material.toneMapped=rt.getTransfer(x.colorSpace)!==pt,x.matrixAutoUpdate===!0&&x.updateMatrix(),l.material.uniforms.uvTransform.value.copy(x.matrix),(u!==x||d!==x.version||h!==i.toneMapping)&&(l.material.needsUpdate=!0,u=x,d=x.version,h=i.toneMapping),l.layers.enableAll(),M.unshift(l,l.geometry,l.material,0,0,null))}function p(M,T){M.getRGB(xa,Hf(i)),t.buffers.color.setClear(xa.r,xa.g,xa.b,T,r)}function b(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(M,T=1){a.set(M),o=T,p(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(M){o=M,p(a,o)},render:m,addToRenderList:v,dispose:b}}function kv(i,e){const t=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=h(null);let r=s,a=!1;function o(C,I,k,z,D){let V=!1;const L=d(C,z,k,I);r!==L&&(r=L,c(r.object)),V=f(C,z,k,D),V&&m(C,z,k,D),D!==null&&e.update(D,i.ELEMENT_ARRAY_BUFFER),(V||a)&&(a=!1,x(C,I,k,z),D!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,e.get(D).buffer))}function l(){return i.createVertexArray()}function c(C){return i.bindVertexArray(C)}function u(C){return i.deleteVertexArray(C)}function d(C,I,k,z){const D=z.wireframe===!0;let V=n[I.id];V===void 0&&(V={},n[I.id]=V);const L=C.isInstancedMesh===!0?C.id:0;let X=V[L];X===void 0&&(X={},V[L]=X);let ee=X[k.id];ee===void 0&&(ee={},X[k.id]=ee);let Y=ee[D];return Y===void 0&&(Y=h(l()),ee[D]=Y),Y}function h(C){const I=[],k=[],z=[];for(let D=0;D<t;D++)I[D]=0,k[D]=0,z[D]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:I,enabledAttributes:k,attributeDivisors:z,object:C,attributes:{},index:null}}function f(C,I,k,z){const D=r.attributes,V=I.attributes;let L=0;const X=k.getAttributes();for(const ee in X)if(X[ee].location>=0){const J=D[ee];let te=V[ee];if(te===void 0&&(ee==="instanceMatrix"&&C.instanceMatrix&&(te=C.instanceMatrix),ee==="instanceColor"&&C.instanceColor&&(te=C.instanceColor)),J===void 0||J.attribute!==te||te&&J.data!==te.data)return!0;L++}return r.attributesNum!==L||r.index!==z}function m(C,I,k,z){const D={},V=I.attributes;let L=0;const X=k.getAttributes();for(const ee in X)if(X[ee].location>=0){let J=V[ee];J===void 0&&(ee==="instanceMatrix"&&C.instanceMatrix&&(J=C.instanceMatrix),ee==="instanceColor"&&C.instanceColor&&(J=C.instanceColor));const te={};te.attribute=J,J&&J.data&&(te.data=J.data),D[ee]=te,L++}r.attributes=D,r.attributesNum=L,r.index=z}function v(){const C=r.newAttributes;for(let I=0,k=C.length;I<k;I++)C[I]=0}function p(C){b(C,0)}function b(C,I){const k=r.newAttributes,z=r.enabledAttributes,D=r.attributeDivisors;k[C]=1,z[C]===0&&(i.enableVertexAttribArray(C),z[C]=1),D[C]!==I&&(i.vertexAttribDivisor(C,I),D[C]=I)}function M(){const C=r.newAttributes,I=r.enabledAttributes;for(let k=0,z=I.length;k<z;k++)I[k]!==C[k]&&(i.disableVertexAttribArray(k),I[k]=0)}function T(C,I,k,z,D,V,L){L===!0?i.vertexAttribIPointer(C,I,k,D,V):i.vertexAttribPointer(C,I,k,z,D,V)}function x(C,I,k,z){v();const D=z.attributes,V=k.getAttributes(),L=I.defaultAttributeValues;for(const X in V){const ee=V[X];if(ee.location>=0){let Y=D[X];if(Y===void 0&&(X==="instanceMatrix"&&C.instanceMatrix&&(Y=C.instanceMatrix),X==="instanceColor"&&C.instanceColor&&(Y=C.instanceColor)),Y!==void 0){const J=Y.normalized,te=Y.itemSize,Te=e.get(Y);if(Te===void 0)continue;const Oe=Te.buffer,q=Te.type,G=Te.bytesPerElement,ne=q===i.INT||q===i.UNSIGNED_INT||Y.gpuType===nh;if(Y.isInterleavedBufferAttribute){const re=Y.data,le=re.stride,ve=Y.offset;if(re.isInstancedInterleavedBuffer){for(let Se=0;Se<ee.locationSize;Se++)b(ee.location+Se,re.meshPerAttribute);C.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=re.meshPerAttribute*re.count)}else for(let Se=0;Se<ee.locationSize;Se++)p(ee.location+Se);i.bindBuffer(i.ARRAY_BUFFER,Oe);for(let Se=0;Se<ee.locationSize;Se++)T(ee.location+Se,te/ee.locationSize,q,J,le*G,(ve+te/ee.locationSize*Se)*G,ne)}else{if(Y.isInstancedBufferAttribute){for(let re=0;re<ee.locationSize;re++)b(ee.location+re,Y.meshPerAttribute);C.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=Y.meshPerAttribute*Y.count)}else for(let re=0;re<ee.locationSize;re++)p(ee.location+re);i.bindBuffer(i.ARRAY_BUFFER,Oe);for(let re=0;re<ee.locationSize;re++)T(ee.location+re,te/ee.locationSize,q,J,te*G,te/ee.locationSize*re*G,ne)}}else if(L!==void 0){const J=L[X];if(J!==void 0)switch(J.length){case 2:i.vertexAttrib2fv(ee.location,J);break;case 3:i.vertexAttrib3fv(ee.location,J);break;case 4:i.vertexAttrib4fv(ee.location,J);break;default:i.vertexAttrib1fv(ee.location,J)}}}}M()}function A(){_();for(const C in n){const I=n[C];for(const k in I){const z=I[k];for(const D in z){const V=z[D];for(const L in V)u(V[L].object),delete V[L];delete z[D]}}delete n[C]}}function y(C){if(n[C.id]===void 0)return;const I=n[C.id];for(const k in I){const z=I[k];for(const D in z){const V=z[D];for(const L in V)u(V[L].object),delete V[L];delete z[D]}}delete n[C.id]}function E(C){for(const I in n){const k=n[I];for(const z in k){const D=k[z];if(D[C.id]===void 0)continue;const V=D[C.id];for(const L in V)u(V[L].object),delete V[L];delete D[C.id]}}}function g(C){for(const I in n){const k=n[I],z=C.isInstancedMesh===!0?C.id:0,D=k[z];if(D!==void 0){for(const V in D){const L=D[V];for(const X in L)u(L[X].object),delete L[X];delete D[V]}delete k[z],Object.keys(k).length===0&&delete n[I]}}}function _(){R(),a=!0,r!==s&&(r=s,c(r.object))}function R(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:_,resetDefaultState:R,dispose:A,releaseStatesOfGeometry:y,releaseStatesOfObject:g,releaseStatesOfProgram:E,initAttributes:v,enableAttribute:p,disableUnusedAttributes:M}}function Fv(i,e,t){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),t.update(c,n,1)}function a(l,c,u){u!==0&&(i.drawArraysInstanced(n,l,c,u),t.update(c,n,u))}function o(l,c,u){if(u===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,u);let h=0;for(let f=0;f<u;f++)h+=c[f];t.update(h,n,1)}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o}function Uv(i,e,t,n){let s;function r(){if(s!==void 0)return s;if(e.has("EXT_texture_filter_anisotropic")===!0){const E=e.get("EXT_texture_filter_anisotropic");s=i.getParameter(E.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(E){return!(E!==Ln&&n.convert(E)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(E){const g=E===Di&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(E!==_n&&n.convert(E)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&E!==Yn&&!g)}function l(E){if(E==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";E="mediump"}return E==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp";const u=l(c);u!==c&&(ze("WebGLRenderer:",c,"not supported, using",u,"instead."),c=u);const d=t.logarithmicDepthBuffer===!0,h=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control");t.reversedDepthBuffer===!0&&h===!1&&ze("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const f=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),m=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=i.getParameter(i.MAX_TEXTURE_SIZE),p=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),b=i.getParameter(i.MAX_VERTEX_ATTRIBS),M=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),T=i.getParameter(i.MAX_VARYING_VECTORS),x=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),A=i.getParameter(i.MAX_SAMPLES),y=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:h,maxTextures:f,maxVertexTextures:m,maxTextureSize:v,maxCubemapSize:p,maxAttributes:b,maxVertexUniforms:M,maxVaryings:T,maxFragmentUniforms:x,maxSamples:A,samples:y}}function Nv(i){const e=this;let t=null,n=0,s=!1,r=!1;const a=new us,o=new We,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,h){const f=d.length!==0||h||n!==0||s;return s=h,n=d.length,f},this.beginShadows=function(){r=!0,u(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,h){t=u(d,h,0)},this.setState=function(d,h,f){const m=d.clippingPlanes,v=d.clipIntersection,p=d.clipShadows,b=i.get(d);if(!s||m===null||m.length===0||r&&!p)r?u(null):c();else{const M=r?0:n,T=M*4;let x=b.clippingState||null;l.value=x,x=u(m,h,T,f);for(let A=0;A!==T;++A)x[A]=t[A];b.clippingState=x,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=M}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function u(d,h,f,m){const v=d!==null?d.length:0;let p=null;if(v!==0){if(p=l.value,m!==!0||p===null){const b=f+v*4,M=h.matrixWorldInverse;o.getNormalMatrix(M),(p===null||p.length<b)&&(p=new Float32Array(b));for(let T=0,x=f;T!==v;++T,x+=4)a.copy(d[T]).applyMatrix4(M,o),a.normal.toArray(p,x),p[x+3]=a.constant}l.value=p,l.needsUpdate=!0}return e.numPlanes=v,e.numIntersection=0,p}}const Qi=4,yu=[.125,.215,.35,.446,.526,.582],fs=20,Ov=256,Sr=new xh,wu=new Ve;let ol=null,ll=0,cl=0,hl=!1;const zv=new F;class Eu{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,s=100,r={}){const{size:a=256,position:o=zv}=r;ol=this._renderer.getRenderTarget(),ll=this._renderer.getActiveCubeFace(),cl=this._renderer.getActiveMipmapLevel(),hl=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,n,s,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Ru(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Au(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(ol,ll,cl),this._renderer.xr.enabled=hl,e.scissorTest=!1,Vs(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===_s||e.mapping===sr?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),ol=this._renderer.getRenderTarget(),ll=this._renderer.getActiveCubeFace(),cl=this._renderer.getActiveMipmapLevel(),hl=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Zt,minFilter:Zt,generateMipmaps:!1,type:Di,format:Ln,colorSpace:fo,depthBuffer:!1},s=Tu(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Tu(e,t,n);const{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Bv(r)),this._blurMaterial=Gv(r,e,t),this._ggxMaterial=Hv(r,e,t)}return s}_compileMaterial(e){const t=new ht(new Ut,e);this._renderer.compile(t,Sr)}_sceneToCubeUV(e,t,n,s,r){const l=new Pn(90,1,t,n),c=[1,-1,1,1,1,1],u=[1,1,1,-1,-1,-1],d=this._renderer,h=d.autoClear,f=d.toneMapping;d.getClearColor(wu),d.toneMapping=ci,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(s),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new ht(new In,new yo({name:"PMREM.Background",side:fn,depthWrite:!1,depthTest:!1})));const v=this._backgroundBox,p=v.material;let b=!1;const M=e.background;M?M.isColor&&(p.color.copy(M),e.background=null,b=!0):(p.color.copy(wu),b=!0);for(let T=0;T<6;T++){const x=T%3;x===0?(l.up.set(0,c[T],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+u[T],r.y,r.z)):x===1?(l.up.set(0,0,c[T]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+u[T],r.z)):(l.up.set(0,c[T],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+u[T]));const A=this._cubeSize;Vs(s,x*A,T>2?A:0,A,A),d.setRenderTarget(s),b&&d.render(v,l),d.render(e,l)}d.toneMapping=f,d.autoClear=h,e.background=M}_textureToCubeUV(e,t){const n=this._renderer,s=e.mapping===_s||e.mapping===sr;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Ru()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Au());const r=s?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;const o=r.uniforms;o.envMap.value=e;const l=this._cubeSize;Vs(t,0,0,3*l,2*l),n.setRenderTarget(t),n.render(a,Sr)}_applyPMREM(e){const t=this._renderer,n=t.autoClear;t.autoClear=!1;const s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(e,r-1,r);t.autoClear=n}_applyGGXFilter(e,t,n){const s=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),u=t/(this._lodMeshes.length-1),d=Math.sqrt(c*c-u*u),h=0+c*1.25,f=d*h,{_lodMax:m}=this,v=this._sizeLods[n],p=3*v*(n>m-Qi?n-m+Qi:0),b=4*(this._cubeSize-v);l.envMap.value=e.texture,l.roughness.value=f,l.mipInt.value=m-t,Vs(r,p,b,3*v,2*v),s.setRenderTarget(r),s.render(o,Sr),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=m-n,Vs(e,p,b,3*v,2*v),s.setRenderTarget(e),s.render(o,Sr)}_blur(e,t,n,s,r){const a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,s,"latitudinal",r),this._halfBlur(a,e,n,n,s,"longitudinal",r)}_halfBlur(e,t,n,s,r,a,o){const l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&ct("blur direction must be either latitudinal or longitudinal!");const u=3,d=this._lodMeshes[s];d.material=c;const h=c.uniforms,f=this._sizeLods[n]-1,m=isFinite(r)?Math.PI/(2*f):2*Math.PI/(2*fs-1),v=r/m,p=isFinite(r)?1+Math.floor(u*v):fs;p>fs&&ze(`sigmaRadians, ${r}, is too large and will clip, as it requested ${p} samples when the maximum is set to ${fs}`);const b=[];let M=0;for(let E=0;E<fs;++E){const g=E/v,_=Math.exp(-g*g/2);b.push(_),E===0?M+=_:E<p&&(M+=2*_)}for(let E=0;E<b.length;E++)b[E]=b[E]/M;h.envMap.value=e.texture,h.samples.value=p,h.weights.value=b,h.latitudinal.value=a==="latitudinal",o&&(h.poleAxis.value=o);const{_lodMax:T}=this;h.dTheta.value=m,h.mipInt.value=T-n;const x=this._sizeLods[s],A=3*x*(s>T-Qi?s-T+Qi:0),y=4*(this._cubeSize-x);Vs(t,A,y,3*x,2*x),l.setRenderTarget(t),l.render(d,Sr)}}function Bv(i){const e=[],t=[],n=[];let s=i;const r=i-Qi+1+yu.length;for(let a=0;a<r;a++){const o=Math.pow(2,s);e.push(o);let l=1/o;a>i-Qi?l=yu[a-i+Qi-1]:a===0&&(l=0),t.push(l);const c=1/(o-2),u=-c,d=1+c,h=[u,u,d,u,d,d,u,u,d,d,u,d],f=6,m=6,v=3,p=2,b=1,M=new Float32Array(v*m*f),T=new Float32Array(p*m*f),x=new Float32Array(b*m*f);for(let y=0;y<f;y++){const E=y%3*2/3-1,g=y>2?0:-1,_=[E,g,0,E+2/3,g,0,E+2/3,g+1,0,E,g,0,E+2/3,g+1,0,E,g+1,0];M.set(_,v*m*y),T.set(h,p*m*y);const R=[y,y,y,y,y,y];x.set(R,b*m*y)}const A=new Ut;A.setAttribute("position",new pn(M,v)),A.setAttribute("uv",new pn(T,p)),A.setAttribute("faceIndex",new pn(x,b)),n.push(new ht(A,null)),s>Qi&&s--}return{lodMeshes:n,sizeLods:e,sigmas:t}}function Tu(i,e,t){const n=new hi(i,e,t);return n.texture.mapping=Mo,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Vs(i,e,t,n,s){i.viewport.set(e,t,n,s),i.scissor.set(e,t,n,s)}function Hv(i,e,t){return new fi({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Ov,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:wo(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Pi,depthTest:!1,depthWrite:!1})}function Gv(i,e,t){const n=new Float32Array(fs),s=new F(0,1,0);return new fi({name:"SphericalGaussianBlur",defines:{n:fs,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:wo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Pi,depthTest:!1,depthWrite:!1})}function Au(){return new fi({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:wo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Pi,depthTest:!1,depthWrite:!1})}function Ru(){return new fi({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:wo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Pi,depthTest:!1,depthWrite:!1})}function wo(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}class qf extends hi{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const n={width:e,height:e,depth:1},s=[n,n,n,n,n,n];this.texture=new zf(s),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new In(5,5,5),r=new fi({name:"CubemapFromEquirect",uniforms:ar(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:fn,blending:Pi});r.uniforms.tEquirect.value=t;const a=new ht(s,r),o=t.minFilter;return t.minFilter===Ki&&(t.minFilter=Zt),new $g(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,s=!0){const r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,s);e.setRenderTarget(r)}}function Vv(i){let e=new WeakMap,t=new WeakMap,n=null;function s(h,f=!1){return h==null?null:f?a(h):r(h)}function r(h){if(h&&h.isTexture){const f=h.mapping;if(f===Wa||f===Uo)if(e.has(h)){const m=e.get(h).texture;return o(m,h.mapping)}else{const m=h.image;if(m&&m.height>0){const v=new qf(m.height);return v.fromEquirectangularTexture(i,h),e.set(h,v),h.addEventListener("dispose",c),o(v.texture,h.mapping)}else return null}}return h}function a(h){if(h&&h.isTexture){const f=h.mapping,m=f===Wa||f===Uo,v=f===_s||f===sr;if(m||v){let p=t.get(h);const b=p!==void 0?p.texture.pmremVersion:0;if(h.isRenderTargetTexture&&h.pmremVersion!==b)return n===null&&(n=new Eu(i)),p=m?n.fromEquirectangular(h,p):n.fromCubemap(h,p),p.texture.pmremVersion=h.pmremVersion,t.set(h,p),p.texture;if(p!==void 0)return p.texture;{const M=h.image;return m&&M&&M.height>0||v&&M&&l(M)?(n===null&&(n=new Eu(i)),p=m?n.fromEquirectangular(h):n.fromCubemap(h),p.texture.pmremVersion=h.pmremVersion,t.set(h,p),h.addEventListener("dispose",u),p.texture):null}}}return h}function o(h,f){return f===Wa?h.mapping=_s:f===Uo&&(h.mapping=sr),h}function l(h){let f=0;const m=6;for(let v=0;v<m;v++)h[v]!==void 0&&f++;return f===m}function c(h){const f=h.target;f.removeEventListener("dispose",c);const m=e.get(f);m!==void 0&&(e.delete(f),m.dispose())}function u(h){const f=h.target;f.removeEventListener("dispose",u);const m=t.get(f);m!==void 0&&(t.delete(f),m.dispose())}function d(){e=new WeakMap,t=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:d}}function Wv(i){const e={};function t(n){if(e[n]!==void 0)return e[n];const s=i.getExtension(n);return e[n]=s,s}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){const s=t(n);return s===null&&js("WebGLRenderer: "+n+" extension not supported."),s}}}function Xv(i,e,t,n){const s={},r=new WeakMap;function a(d){const h=d.target;h.index!==null&&e.remove(h.index);for(const m in h.attributes)e.remove(h.attributes[m]);h.removeEventListener("dispose",a),delete s[h.id];const f=r.get(h);f&&(e.remove(f),r.delete(h)),n.releaseStatesOfGeometry(h),h.isInstancedBufferGeometry===!0&&delete h._maxInstanceCount,t.memory.geometries--}function o(d,h){return s[h.id]===!0||(h.addEventListener("dispose",a),s[h.id]=!0,t.memory.geometries++),h}function l(d){const h=d.attributes;for(const f in h)e.update(h[f],i.ARRAY_BUFFER)}function c(d){const h=[],f=d.index,m=d.attributes.position;let v=0;if(m===void 0)return;if(f!==null){const M=f.array;v=f.version;for(let T=0,x=M.length;T<x;T+=3){const A=M[T+0],y=M[T+1],E=M[T+2];h.push(A,y,y,E,E,A)}}else{const M=m.array;v=m.version;for(let T=0,x=M.length/3-1;T<x;T+=3){const A=T+0,y=T+1,E=T+2;h.push(A,y,y,E,E,A)}}const p=new(m.count>=65535?Ff:kf)(h,1);p.version=v;const b=r.get(d);b&&e.remove(b),r.set(d,p)}function u(d){const h=r.get(d);if(h){const f=d.index;f!==null&&h.version<f.version&&c(d)}else c(d);return r.get(d)}return{get:o,update:l,getWireframeAttribute:u}}function Yv(i,e,t){let n;function s(d){n=d}let r,a;function o(d){r=d.type,a=d.bytesPerElement}function l(d,h){i.drawElements(n,h,r,d*a),t.update(h,n,1)}function c(d,h,f){f!==0&&(i.drawElementsInstanced(n,h,r,d*a,f),t.update(h,n,f))}function u(d,h,f){if(f===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,h,0,r,d,0,f);let v=0;for(let p=0;p<f;p++)v+=h[p];t.update(v,n,1)}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=u}function qv(i){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(t.calls++,a){case i.TRIANGLES:t.triangles+=o*(r/3);break;case i.LINES:t.lines+=o*(r/2);break;case i.LINE_STRIP:t.lines+=o*(r-1);break;case i.LINE_LOOP:t.lines+=o*r;break;case i.POINTS:t.points+=o*r;break;default:ct("WebGLInfo: Unknown draw mode:",a);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:n}}function $v(i,e,t){const n=new WeakMap,s=new At;function r(a,o,l){const c=a.morphTargetInfluences,u=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=u!==void 0?u.length:0;let h=n.get(o);if(h===void 0||h.count!==d){let _=function(){E.dispose(),n.delete(o),o.removeEventListener("dispose",_)};h!==void 0&&h.texture.dispose();const f=o.morphAttributes.position!==void 0,m=o.morphAttributes.normal!==void 0,v=o.morphAttributes.color!==void 0,p=o.morphAttributes.position||[],b=o.morphAttributes.normal||[],M=o.morphAttributes.color||[];let T=0;f===!0&&(T=1),m===!0&&(T=2),v===!0&&(T=3);let x=o.attributes.position.count*T,A=1;x>e.maxTextureSize&&(A=Math.ceil(x/e.maxTextureSize),x=e.maxTextureSize);const y=new Float32Array(x*A*4*d),E=new Lf(y,x,A,d);E.type=Yn,E.needsUpdate=!0;const g=T*4;for(let R=0;R<d;R++){const C=p[R],I=b[R],k=M[R],z=x*A*4*R;for(let D=0;D<C.count;D++){const V=D*g;f===!0&&(s.fromBufferAttribute(C,D),y[z+V+0]=s.x,y[z+V+1]=s.y,y[z+V+2]=s.z,y[z+V+3]=0),m===!0&&(s.fromBufferAttribute(I,D),y[z+V+4]=s.x,y[z+V+5]=s.y,y[z+V+6]=s.z,y[z+V+7]=0),v===!0&&(s.fromBufferAttribute(k,D),y[z+V+8]=s.x,y[z+V+9]=s.y,y[z+V+10]=s.z,y[z+V+11]=k.itemSize===4?s.w:1)}}h={count:d,texture:E,size:new tt(x,A)},n.set(o,h),o.addEventListener("dispose",_)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",a.morphTexture,t);else{let f=0;for(let v=0;v<c.length;v++)f+=c[v];const m=o.morphTargetsRelative?1:1-f;l.getUniforms().setValue(i,"morphTargetBaseInfluence",m),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",h.texture,t),l.getUniforms().setValue(i,"morphTargetsTextureSize",h.size)}return{update:r}}function Zv(i,e,t,n,s){let r=new WeakMap;function a(c){const u=s.render.frame,d=c.geometry,h=e.get(c,d);if(r.get(h)!==u&&(e.update(h),r.set(h,u)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==u&&(t.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,u))),c.isSkinnedMesh){const f=c.skeleton;r.get(f)!==u&&(f.update(),r.set(f,u))}return h}function o(){r=new WeakMap}function l(c){const u=c.target;u.removeEventListener("dispose",l),n.releaseStatesOfObject(u),t.remove(u.instanceMatrix),u.instanceColor!==null&&t.remove(u.instanceColor)}return{update:a,dispose:o}}const Kv={[bf]:"LINEAR_TONE_MAPPING",[vf]:"REINHARD_TONE_MAPPING",[xf]:"CINEON_TONE_MAPPING",[th]:"ACES_FILMIC_TONE_MAPPING",[_f]:"AGX_TONE_MAPPING",[Mf]:"NEUTRAL_TONE_MAPPING",[Sf]:"CUSTOM_TONE_MAPPING"};function Qv(i,e,t,n,s,r){const a=new hi(e,t,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,depthTexture:s?new rr(e,t):void 0}),o=new hi(e,t,{type:Di,depthBuffer:!1,stencilBuffer:!1}),l=new Ut;l.setAttribute("position",new Je([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new Je([0,2,0,0,2,0],2));const c=new Hg({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),u=new ht(l,c),d=new xh(-1,1,1,-1,0,1);let h=null,f=null,m=!1,v,p=null,b=[],M=!1;this.setSize=function(T,x){a.setSize(T,x),o.setSize(T,x);for(let A=0;A<b.length;A++){const y=b[A];y.setSize&&y.setSize(T,x)}},this.setEffects=function(T){b=T,M=b.length>0&&b[0].isRenderPass===!0;const x=a.width,A=a.height;for(let y=0;y<b.length;y++){const E=b[y];E.setSize&&E.setSize(x,A)}},this.begin=function(T,x){if(m||T.toneMapping===ci&&b.length===0)return!1;if(p=x,x!==null){const A=x.width,y=x.height;(a.width!==A||a.height!==y)&&this.setSize(A,y)}return M===!1&&T.setRenderTarget(a),v=T.toneMapping,T.toneMapping=ci,!0},this.hasRenderPass=function(){return M},this.end=function(T,x){T.toneMapping=v,m=!0;let A=a,y=o;for(let E=0;E<b.length;E++){const g=b[E];if(g.enabled!==!1&&(g.render(T,y,A,x),g.needsSwap!==!1)){const _=A;A=y,y=_}}if(h!==T.outputColorSpace||f!==T.toneMapping){h=T.outputColorSpace,f=T.toneMapping,c.defines={},rt.getTransfer(h)===pt&&(c.defines.SRGB_TRANSFER="");const E=Kv[f];E&&(c.defines[E]=""),c.needsUpdate=!0}c.uniforms.tDiffuse.value=A.texture,T.setRenderTarget(p),T.render(u,d),p=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){a.depthTexture&&a.depthTexture.dispose(),a.dispose(),o.dispose(),l.dispose(),c.dispose()}}const $f=new ln,zc=new rr(1,1),Zf=new Lf,Kf=new bg,Qf=new zf,Cu=[],Pu=[],Lu=new Float32Array(16),Iu=new Float32Array(9),Du=new Float32Array(4);function ur(i,e,t){const n=i[0];if(n<=0||n>0)return i;const s=e*t;let r=Cu[s];if(r===void 0&&(r=new Float32Array(s),Cu[s]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,i[a].toArray(r,o)}return r}function Vt(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function Wt(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function Eo(i,e){let t=Pu[e];t===void 0&&(t=new Int32Array(e),Pu[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function Jv(i,e){const t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function jv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Vt(t,e))return;i.uniform2fv(this.addr,e),Wt(t,e)}}function ex(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Vt(t,e))return;i.uniform3fv(this.addr,e),Wt(t,e)}}function tx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Vt(t,e))return;i.uniform4fv(this.addr,e),Wt(t,e)}}function nx(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(Vt(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),Wt(t,e)}else{if(Vt(t,n))return;Du.set(n),i.uniformMatrix2fv(this.addr,!1,Du),Wt(t,n)}}function ix(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(Vt(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),Wt(t,e)}else{if(Vt(t,n))return;Iu.set(n),i.uniformMatrix3fv(this.addr,!1,Iu),Wt(t,n)}}function sx(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(Vt(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),Wt(t,e)}else{if(Vt(t,n))return;Lu.set(n),i.uniformMatrix4fv(this.addr,!1,Lu),Wt(t,n)}}function rx(i,e){const t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function ax(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Vt(t,e))return;i.uniform2iv(this.addr,e),Wt(t,e)}}function ox(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Vt(t,e))return;i.uniform3iv(this.addr,e),Wt(t,e)}}function lx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Vt(t,e))return;i.uniform4iv(this.addr,e),Wt(t,e)}}function cx(i,e){const t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function hx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Vt(t,e))return;i.uniform2uiv(this.addr,e),Wt(t,e)}}function ux(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Vt(t,e))return;i.uniform3uiv(this.addr,e),Wt(t,e)}}function dx(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Vt(t,e))return;i.uniform4uiv(this.addr,e),Wt(t,e)}}function fx(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(zc.compareFunction=t.isReversedDepthBuffer()?hh:ch,r=zc):r=$f,t.setTexture2D(e||r,s)}function px(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture3D(e||Kf,s)}function mx(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTextureCube(e||Qf,s)}function gx(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2DArray(e||Zf,s)}function bx(i){switch(i){case 5126:return Jv;case 35664:return jv;case 35665:return ex;case 35666:return tx;case 35674:return nx;case 35675:return ix;case 35676:return sx;case 5124:case 35670:return rx;case 35667:case 35671:return ax;case 35668:case 35672:return ox;case 35669:case 35673:return lx;case 5125:return cx;case 36294:return hx;case 36295:return ux;case 36296:return dx;case 35678:case 36198:case 36298:case 36306:case 35682:return fx;case 35679:case 36299:case 36307:return px;case 35680:case 36300:case 36308:case 36293:return mx;case 36289:case 36303:case 36311:case 36292:return gx}}function vx(i,e){i.uniform1fv(this.addr,e)}function xx(i,e){const t=ur(e,this.size,2);i.uniform2fv(this.addr,t)}function Sx(i,e){const t=ur(e,this.size,3);i.uniform3fv(this.addr,t)}function _x(i,e){const t=ur(e,this.size,4);i.uniform4fv(this.addr,t)}function Mx(i,e){const t=ur(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function yx(i,e){const t=ur(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function wx(i,e){const t=ur(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function Ex(i,e){i.uniform1iv(this.addr,e)}function Tx(i,e){i.uniform2iv(this.addr,e)}function Ax(i,e){i.uniform3iv(this.addr,e)}function Rx(i,e){i.uniform4iv(this.addr,e)}function Cx(i,e){i.uniform1uiv(this.addr,e)}function Px(i,e){i.uniform2uiv(this.addr,e)}function Lx(i,e){i.uniform3uiv(this.addr,e)}function Ix(i,e){i.uniform4uiv(this.addr,e)}function Dx(i,e,t){const n=this.cache,s=e.length,r=Eo(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));let a;this.type===i.SAMPLER_2D_SHADOW?a=zc:a=$f;for(let o=0;o!==s;++o)t.setTexture2D(e[o]||a,r[o])}function kx(i,e,t){const n=this.cache,s=e.length,r=Eo(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));for(let a=0;a!==s;++a)t.setTexture3D(e[a]||Kf,r[a])}function Fx(i,e,t){const n=this.cache,s=e.length,r=Eo(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));for(let a=0;a!==s;++a)t.setTextureCube(e[a]||Qf,r[a])}function Ux(i,e,t){const n=this.cache,s=e.length,r=Eo(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));for(let a=0;a!==s;++a)t.setTexture2DArray(e[a]||Zf,r[a])}function Nx(i){switch(i){case 5126:return vx;case 35664:return xx;case 35665:return Sx;case 35666:return _x;case 35674:return Mx;case 35675:return yx;case 35676:return wx;case 5124:case 35670:return Ex;case 35667:case 35671:return Tx;case 35668:case 35672:return Ax;case 35669:case 35673:return Rx;case 5125:return Cx;case 36294:return Px;case 36295:return Lx;case 36296:return Ix;case 35678:case 36198:case 36298:case 36306:case 35682:return Dx;case 35679:case 36299:case 36307:return kx;case 35680:case 36300:case 36308:case 36293:return Fx;case 36289:case 36303:case 36311:case 36292:return Ux}}class Ox{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=bx(t.type)}}class zx{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Nx(t.type)}}class Bx{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){const s=this.seq;for(let r=0,a=s.length;r!==a;++r){const o=s[r];o.setValue(e,t[o.id],n)}}}const ul=/(\w+)(\])?(\[|\.)?/g;function ku(i,e){i.seq.push(e),i.map[e.id]=e}function Hx(i,e,t){const n=i.name,s=n.length;for(ul.lastIndex=0;;){const r=ul.exec(n),a=ul.lastIndex;let o=r[1];const l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===s){ku(t,c===void 0?new Ox(o,i,e):new zx(o,i,e));break}else{let d=t.map[o];d===void 0&&(d=new Bx(o),ku(t,d)),t=d}}}class Za{constructor(e,t){this.seq=[],this.map={};const n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=e.getActiveUniform(t,a),l=e.getUniformLocation(t,o.name);Hx(o,l,this)}const s=[],r=[];for(const a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?s.push(a):r.push(a);s.length>0&&(this.seq=s.concat(r))}setValue(e,t,n,s){const r=this.map[t];r!==void 0&&r.setValue(e,n,s)}setOptional(e,t,n){const s=t[n];s!==void 0&&this.setValue(e,n,s)}static upload(e,t,n,s){for(let r=0,a=t.length;r!==a;++r){const o=t[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,s)}}static seqWithValue(e,t){const n=[];for(let s=0,r=e.length;s!==r;++s){const a=e[s];a.id in t&&n.push(a)}return n}}function Fu(i,e,t){const n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}const Gx=37297;let Vx=0;function Wx(i,e){const t=i.split(`
`),n=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let a=s;a<r;a++){const o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}const Uu=new We;function Xx(i){rt._getMatrix(Uu,rt.workingColorSpace,i);const e=`mat3( ${Uu.elements.map(t=>t.toFixed(4))} )`;switch(rt.getTransfer(i)){case po:return[e,"LinearTransferOETF"];case pt:return[e,"sRGBTransferOETF"];default:return ze("WebGLProgram: Unsupported color space: ",i),[e,"LinearTransferOETF"]}}function Nu(i,e,t){const n=i.getShaderParameter(e,i.COMPILE_STATUS),r=(i.getShaderInfoLog(e)||"").trim();if(n&&r==="")return"";const a=/ERROR: 0:(\d+)/.exec(r);if(a){const o=parseInt(a[1]);return t.toUpperCase()+`

`+r+`

`+Wx(i.getShaderSource(e),o)}else return r}function Yx(i,e){const t=Xx(e);return[`vec4 ${i}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const qx={[bf]:"Linear",[vf]:"Reinhard",[xf]:"Cineon",[th]:"ACESFilmic",[_f]:"AgX",[Mf]:"Neutral",[Sf]:"Custom"};function $x(i,e){const t=qx[e];return t===void 0?(ze("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const Sa=new F;function Zx(){rt.getLuminanceCoefficients(Sa);const i=Sa.x.toFixed(4),e=Sa.y.toFixed(4),t=Sa.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Kx(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Ar).join(`
`)}function Qx(i){const e=[];for(const t in i){const n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function Jx(i,e){const t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){const r=i.getActiveAttrib(e,s),a=r.name;let o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),t[a]={type:r.type,location:i.getAttribLocation(e,a),locationSize:o}}return t}function Ar(i){return i!==""}function Ou(i,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function zu(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const jx=/^[ \t]*#include +<([\w\d./]+)>/gm;function Bc(i){return i.replace(jx,tS)}const eS=new Map;function tS(i,e){let t=Ke[e];if(t===void 0){const n=eS.get(e);if(n!==void 0)t=Ke[n],ze('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">")}return Bc(t)}const nS=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Bu(i){return i.replace(nS,iS)}function iS(i,e,t,n){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function Hu(i){let e=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?e+=`
#define HIGH_PRECISION`:i.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}const sS={[Dr]:"SHADOWMAP_TYPE_PCF",[Tr]:"SHADOWMAP_TYPE_VSM"};function rS(i){return sS[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const aS={[_s]:"ENVMAP_TYPE_CUBE",[sr]:"ENVMAP_TYPE_CUBE",[Mo]:"ENVMAP_TYPE_CUBE_UV"};function oS(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":aS[i.envMapMode]||"ENVMAP_TYPE_CUBE"}const lS={[sr]:"ENVMAP_MODE_REFRACTION"};function cS(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":lS[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}const hS={[gf]:"ENVMAP_BLENDING_MULTIPLY",[Fm]:"ENVMAP_BLENDING_MIX",[Um]:"ENVMAP_BLENDING_ADD"};function uS(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":hS[i.combine]||"ENVMAP_BLENDING_NONE"}function dS(i){const e=i.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function fS(i,e,t,n){const s=i.getContext(),r=t.defines;let a=t.vertexShader,o=t.fragmentShader;const l=rS(t),c=oS(t),u=cS(t),d=uS(t),h=dS(t),f=Kx(t),m=Qx(r),v=s.createProgram();let p,b,M=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(Ar).join(`
`),p.length>0&&(p+=`
`),b=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(Ar).join(`
`),b.length>0&&(b+=`
`)):(p=[Hu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Ar).join(`
`),b=[Hu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+u:"",t.envMap?"#define "+d:"",h?"#define CUBEUV_TEXEL_WIDTH "+h.texelWidth:"",h?"#define CUBEUV_TEXEL_HEIGHT "+h.texelHeight:"",h?"#define CUBEUV_MAX_MIP "+h.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==ci?"#define TONE_MAPPING":"",t.toneMapping!==ci?Ke.tonemapping_pars_fragment:"",t.toneMapping!==ci?$x("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ke.colorspace_pars_fragment,Yx("linearToOutputTexel",t.outputColorSpace),Zx(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Ar).join(`
`)),a=Bc(a),a=Ou(a,t),a=zu(a,t),o=Bc(o),o=Ou(o,t),o=zu(o,t),a=Bu(a),o=Bu(o),t.isRawShaderMaterial!==!0&&(M=`#version 300 es
`,p=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,b=["#define varying in",t.glslVersion===$h?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===$h?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+b);const T=M+p+a,x=M+b+o,A=Fu(s,s.VERTEX_SHADER,T),y=Fu(s,s.FRAGMENT_SHADER,x);s.attachShader(v,A),s.attachShader(v,y),t.index0AttributeName!==void 0?s.bindAttribLocation(v,0,t.index0AttributeName):t.hasPositionAttribute===!0&&s.bindAttribLocation(v,0,"position"),s.linkProgram(v);function E(C){if(i.debug.checkShaderErrors){const I=s.getProgramInfoLog(v)||"",k=s.getShaderInfoLog(A)||"",z=s.getShaderInfoLog(y)||"",D=I.trim(),V=k.trim(),L=z.trim();let X=!0,ee=!0;if(s.getProgramParameter(v,s.LINK_STATUS)===!1)if(X=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,v,A,y);else{const Y=Nu(s,A,"vertex"),J=Nu(s,y,"fragment");ct("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(v,s.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+D+`
`+Y+`
`+J)}else D!==""?ze("WebGLProgram: Program Info Log:",D):(V===""||L==="")&&(ee=!1);ee&&(C.diagnostics={runnable:X,programLog:D,vertexShader:{log:V,prefix:p},fragmentShader:{log:L,prefix:b}})}s.deleteShader(A),s.deleteShader(y),g=new Za(s,v),_=Jx(s,v)}let g;this.getUniforms=function(){return g===void 0&&E(this),g};let _;this.getAttributes=function(){return _===void 0&&E(this),_};let R=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return R===!1&&(R=s.getProgramParameter(v,Gx)),R},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(v),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Vx++,this.cacheKey=e,this.usedTimes=1,this.program=v,this.vertexShader=A,this.fragmentShader=y,this}let pS=0;class mS{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){const s=this._getShaderCacheForMaterial(e);return s.has(t)===!1&&(s.add(t),t.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){const t=this.shaderCache;let n=t.get(e);return n===void 0&&(n=new gS(e),t.set(e,n)),n}}class gS{constructor(e){this.id=pS++,this.code=e,this.usedTimes=0}}function bS(i){return i===Ms||i===ho||i===uo}function vS(i,e,t,n,s,r){const a=new If,o=new mS,l=new Set,c=[],u=new Map,d=n.logarithmicDepthBuffer;let h=n.precision;const f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(g){return l.add(g),g===0?"uv":`uv${g}`}function v(g,_,R,C,I,k){const z=C.fog,D=I.geometry,V=g.isMeshStandardMaterial||g.isMeshLambertMaterial||g.isMeshPhongMaterial?C.environment:null,L=g.isMeshStandardMaterial||g.isMeshLambertMaterial&&!g.envMap||g.isMeshPhongMaterial&&!g.envMap,X=e.get(g.envMap||V,L),ee=X&&X.mapping===Mo?X.image.height:null,Y=f[g.type];g.precision!==null&&(h=n.getMaxPrecision(g.precision),h!==g.precision&&ze("WebGLProgram.getParameters:",g.precision,"not supported, using",h,"instead."));const J=D.morphAttributes.position||D.morphAttributes.normal||D.morphAttributes.color,te=J!==void 0?J.length:0;let Te=0;D.morphAttributes.position!==void 0&&(Te=1),D.morphAttributes.normal!==void 0&&(Te=2),D.morphAttributes.color!==void 0&&(Te=3);let Oe,q,G,ne;if(Y){const Pe=si[Y];Oe=Pe.vertexShader,q=Pe.fragmentShader}else{Oe=g.vertexShader,q=g.fragmentShader;const Pe=o.getVertexShaderStage(g),Pt=o.getFragmentShaderStage(g);o.update(g,Pe,Pt),G=Pe.id,ne=Pt.id}const re=i.getRenderTarget(),le=i.state.buffers.depth.getReversed(),ve=I.isInstancedMesh===!0,Se=I.isBatchedMesh===!0,je=!!g.map,Ie=!!g.matcap,nt=!!X,Ge=!!g.aoMap,$e=!!g.lightMap,dt=!!g.bumpMap&&g.wireframe===!1,ot=!!g.normalMap,Mt=!!g.displacementMap,Rt=!!g.emissiveMap,wt=!!g.metalnessMap,Ct=!!g.roughnessMap,O=g.anisotropy>0,Kt=g.clearcoat>0,ut=g.dispersion>0,P=g.iridescence>0,S=g.sheen>0,H=g.transmission>0,$=O&&!!g.anisotropyMap,ie=Kt&&!!g.clearcoatMap,ce=Kt&&!!g.clearcoatNormalMap,me=Kt&&!!g.clearcoatRoughnessMap,se=P&&!!g.iridescenceMap,W=P&&!!g.iridescenceThicknessMap,pe=S&&!!g.sheenColorMap,Ce=S&&!!g.sheenRoughnessMap,de=!!g.specularMap,ue=!!g.specularColorMap,De=!!g.specularIntensityMap,Ne=H&&!!g.transmissionMap,He=H&&!!g.thicknessMap,U=!!g.gradientMap,ge=!!g.alphaMap,ae=g.alphaTest>0,be=!!g.alphaHash,ye=!!g.extensions;let oe=ci;g.toneMapped&&(re===null||re.isXRRenderTarget===!0)&&(oe=i.toneMapping);const ke={shaderID:Y,shaderType:g.type,shaderName:g.name,vertexShader:Oe,fragmentShader:q,defines:g.defines,customVertexShaderID:G,customFragmentShaderID:ne,isRawShaderMaterial:g.isRawShaderMaterial===!0,glslVersion:g.glslVersion,precision:h,batching:Se,batchingColor:Se&&I._colorsTexture!==null,instancing:ve,instancingColor:ve&&I.instanceColor!==null,instancingMorph:ve&&I.morphTexture!==null,outputColorSpace:re===null?i.outputColorSpace:re.isXRRenderTarget===!0?re.texture.colorSpace:rt.workingColorSpace,alphaToCoverage:!!g.alphaToCoverage,map:je,matcap:Ie,envMap:nt,envMapMode:nt&&X.mapping,envMapCubeUVHeight:ee,aoMap:Ge,lightMap:$e,bumpMap:dt,normalMap:ot,displacementMap:Mt,emissiveMap:Rt,normalMapObjectSpace:ot&&g.normalMapType===zm,normalMapTangentSpace:ot&&g.normalMapType===Uc,packedNormalMap:ot&&g.normalMapType===Uc&&bS(g.normalMap.format),metalnessMap:wt,roughnessMap:Ct,anisotropy:O,anisotropyMap:$,clearcoat:Kt,clearcoatMap:ie,clearcoatNormalMap:ce,clearcoatRoughnessMap:me,dispersion:ut,iridescence:P,iridescenceMap:se,iridescenceThicknessMap:W,sheen:S,sheenColorMap:pe,sheenRoughnessMap:Ce,specularMap:de,specularColorMap:ue,specularIntensityMap:De,transmission:H,transmissionMap:Ne,thicknessMap:He,gradientMap:U,opaque:g.transparent===!1&&g.blending===Js&&g.alphaToCoverage===!1,alphaMap:ge,alphaTest:ae,alphaHash:be,combine:g.combine,mapUv:je&&m(g.map.channel),aoMapUv:Ge&&m(g.aoMap.channel),lightMapUv:$e&&m(g.lightMap.channel),bumpMapUv:dt&&m(g.bumpMap.channel),normalMapUv:ot&&m(g.normalMap.channel),displacementMapUv:Mt&&m(g.displacementMap.channel),emissiveMapUv:Rt&&m(g.emissiveMap.channel),metalnessMapUv:wt&&m(g.metalnessMap.channel),roughnessMapUv:Ct&&m(g.roughnessMap.channel),anisotropyMapUv:$&&m(g.anisotropyMap.channel),clearcoatMapUv:ie&&m(g.clearcoatMap.channel),clearcoatNormalMapUv:ce&&m(g.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:me&&m(g.clearcoatRoughnessMap.channel),iridescenceMapUv:se&&m(g.iridescenceMap.channel),iridescenceThicknessMapUv:W&&m(g.iridescenceThicknessMap.channel),sheenColorMapUv:pe&&m(g.sheenColorMap.channel),sheenRoughnessMapUv:Ce&&m(g.sheenRoughnessMap.channel),specularMapUv:de&&m(g.specularMap.channel),specularColorMapUv:ue&&m(g.specularColorMap.channel),specularIntensityMapUv:De&&m(g.specularIntensityMap.channel),transmissionMapUv:Ne&&m(g.transmissionMap.channel),thicknessMapUv:He&&m(g.thicknessMap.channel),alphaMapUv:ge&&m(g.alphaMap.channel),vertexTangents:!!D.attributes.tangent&&(ot||O),vertexNormals:!!D.attributes.normal,vertexColors:g.vertexColors,vertexAlphas:g.vertexColors===!0&&!!D.attributes.color&&D.attributes.color.itemSize===4,pointsUvs:I.isPoints===!0&&!!D.attributes.uv&&(je||ge),fog:!!z,useFog:g.fog===!0,fogExp2:!!z&&z.isFogExp2,flatShading:g.wireframe===!1&&(g.flatShading===!0||D.attributes.normal===void 0&&ot===!1&&(g.isMeshLambertMaterial||g.isMeshPhongMaterial||g.isMeshStandardMaterial||g.isMeshPhysicalMaterial)),sizeAttenuation:g.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:le,skinning:I.isSkinnedMesh===!0,hasPositionAttribute:D.attributes.position!==void 0,morphTargets:D.morphAttributes.position!==void 0,morphNormals:D.morphAttributes.normal!==void 0,morphColors:D.morphAttributes.color!==void 0,morphTargetsCount:te,morphTextureStride:Te,numDirLights:_.directional.length,numPointLights:_.point.length,numSpotLights:_.spot.length,numSpotLightMaps:_.spotLightMap.length,numRectAreaLights:_.rectArea.length,numHemiLights:_.hemi.length,numDirLightShadows:_.directionalShadowMap.length,numPointLightShadows:_.pointShadowMap.length,numSpotLightShadows:_.spotShadowMap.length,numSpotLightShadowsWithMaps:_.numSpotLightShadowsWithMaps,numLightProbes:_.numLightProbes,numLightProbeGrids:k.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:g.dithering,shadowMapEnabled:i.shadowMap.enabled&&R.length>0,shadowMapType:i.shadowMap.type,toneMapping:oe,decodeVideoTexture:je&&g.map.isVideoTexture===!0&&rt.getTransfer(g.map.colorSpace)===pt,decodeVideoTextureEmissive:Rt&&g.emissiveMap.isVideoTexture===!0&&rt.getTransfer(g.emissiveMap.colorSpace)===pt,premultipliedAlpha:g.premultipliedAlpha,doubleSided:g.side===Ti,flipSided:g.side===fn,useDepthPacking:g.depthPacking>=0,depthPacking:g.depthPacking||0,index0AttributeName:g.index0AttributeName,extensionClipCullDistance:ye&&g.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(ye&&g.extensions.multiDraw===!0||Se)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:g.customProgramCacheKey()};return ke.vertexUv1s=l.has(1),ke.vertexUv2s=l.has(2),ke.vertexUv3s=l.has(3),l.clear(),ke}function p(g){const _=[];if(g.shaderID?_.push(g.shaderID):(_.push(g.customVertexShaderID),_.push(g.customFragmentShaderID)),g.defines!==void 0)for(const R in g.defines)_.push(R),_.push(g.defines[R]);return g.isRawShaderMaterial===!1&&(b(_,g),M(_,g),_.push(i.outputColorSpace)),_.push(g.customProgramCacheKey),_.join()}function b(g,_){g.push(_.precision),g.push(_.outputColorSpace),g.push(_.envMapMode),g.push(_.envMapCubeUVHeight),g.push(_.mapUv),g.push(_.alphaMapUv),g.push(_.lightMapUv),g.push(_.aoMapUv),g.push(_.bumpMapUv),g.push(_.normalMapUv),g.push(_.displacementMapUv),g.push(_.emissiveMapUv),g.push(_.metalnessMapUv),g.push(_.roughnessMapUv),g.push(_.anisotropyMapUv),g.push(_.clearcoatMapUv),g.push(_.clearcoatNormalMapUv),g.push(_.clearcoatRoughnessMapUv),g.push(_.iridescenceMapUv),g.push(_.iridescenceThicknessMapUv),g.push(_.sheenColorMapUv),g.push(_.sheenRoughnessMapUv),g.push(_.specularMapUv),g.push(_.specularColorMapUv),g.push(_.specularIntensityMapUv),g.push(_.transmissionMapUv),g.push(_.thicknessMapUv),g.push(_.combine),g.push(_.fogExp2),g.push(_.sizeAttenuation),g.push(_.morphTargetsCount),g.push(_.morphAttributeCount),g.push(_.numDirLights),g.push(_.numPointLights),g.push(_.numSpotLights),g.push(_.numSpotLightMaps),g.push(_.numHemiLights),g.push(_.numRectAreaLights),g.push(_.numDirLightShadows),g.push(_.numPointLightShadows),g.push(_.numSpotLightShadows),g.push(_.numSpotLightShadowsWithMaps),g.push(_.numLightProbes),g.push(_.shadowMapType),g.push(_.toneMapping),g.push(_.numClippingPlanes),g.push(_.numClipIntersection),g.push(_.depthPacking)}function M(g,_){a.disableAll(),_.instancing&&a.enable(0),_.instancingColor&&a.enable(1),_.instancingMorph&&a.enable(2),_.matcap&&a.enable(3),_.envMap&&a.enable(4),_.normalMapObjectSpace&&a.enable(5),_.normalMapTangentSpace&&a.enable(6),_.clearcoat&&a.enable(7),_.iridescence&&a.enable(8),_.alphaTest&&a.enable(9),_.vertexColors&&a.enable(10),_.vertexAlphas&&a.enable(11),_.vertexUv1s&&a.enable(12),_.vertexUv2s&&a.enable(13),_.vertexUv3s&&a.enable(14),_.vertexTangents&&a.enable(15),_.anisotropy&&a.enable(16),_.alphaHash&&a.enable(17),_.batching&&a.enable(18),_.dispersion&&a.enable(19),_.batchingColor&&a.enable(20),_.gradientMap&&a.enable(21),_.packedNormalMap&&a.enable(22),_.vertexNormals&&a.enable(23),g.push(a.mask),a.disableAll(),_.fog&&a.enable(0),_.useFog&&a.enable(1),_.flatShading&&a.enable(2),_.logarithmicDepthBuffer&&a.enable(3),_.reversedDepthBuffer&&a.enable(4),_.skinning&&a.enable(5),_.morphTargets&&a.enable(6),_.morphNormals&&a.enable(7),_.morphColors&&a.enable(8),_.premultipliedAlpha&&a.enable(9),_.shadowMapEnabled&&a.enable(10),_.doubleSided&&a.enable(11),_.flipSided&&a.enable(12),_.useDepthPacking&&a.enable(13),_.dithering&&a.enable(14),_.transmission&&a.enable(15),_.sheen&&a.enable(16),_.opaque&&a.enable(17),_.pointsUvs&&a.enable(18),_.decodeVideoTexture&&a.enable(19),_.decodeVideoTextureEmissive&&a.enable(20),_.alphaToCoverage&&a.enable(21),_.numLightProbeGrids>0&&a.enable(22),_.hasPositionAttribute&&a.enable(23),g.push(a.mask)}function T(g){const _=f[g.type];let R;if(_){const C=si[_];R=Og.clone(C.uniforms)}else R=g.uniforms;return R}function x(g,_){let R=u.get(_);return R!==void 0?++R.usedTimes:(R=new fS(i,_,g,s),c.push(R),u.set(_,R)),R}function A(g){if(--g.usedTimes===0){const _=c.indexOf(g);c[_]=c[c.length-1],c.pop(),u.delete(g.cacheKey),g.destroy()}}function y(g){o.remove(g)}function E(){o.dispose()}return{getParameters:v,getProgramCacheKey:p,getUniforms:T,acquireProgram:x,releaseProgram:A,releaseShaderCache:y,programs:c,dispose:E}}function xS(){let i=new WeakMap;function e(a){return i.has(a)}function t(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,l){i.get(a)[o]=l}function r(){i=new WeakMap}return{has:e,get:t,remove:n,update:s,dispose:r}}function SS(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.materialVariant!==e.materialVariant?i.materialVariant-e.materialVariant:i.z!==e.z?i.z-e.z:i.id-e.id}function Gu(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function Vu(){const i=[];let e=0;const t=[],n=[],s=[];function r(){e=0,t.length=0,n.length=0,s.length=0}function a(h){let f=0;return h.isInstancedMesh&&(f+=2),h.isSkinnedMesh&&(f+=1),f}function o(h,f,m,v,p,b){let M=i[e];return M===void 0?(M={id:h.id,object:h,geometry:f,material:m,materialVariant:a(h),groupOrder:v,renderOrder:h.renderOrder,z:p,group:b},i[e]=M):(M.id=h.id,M.object=h,M.geometry=f,M.material=m,M.materialVariant=a(h),M.groupOrder=v,M.renderOrder=h.renderOrder,M.z=p,M.group=b),e++,M}function l(h,f,m,v,p,b){const M=o(h,f,m,v,p,b);m.transmission>0?n.push(M):m.transparent===!0?s.push(M):t.push(M)}function c(h,f,m,v,p,b){const M=o(h,f,m,v,p,b);m.transmission>0?n.unshift(M):m.transparent===!0?s.unshift(M):t.unshift(M)}function u(h,f,m){t.length>1&&t.sort(h||SS),n.length>1&&n.sort(f||Gu),s.length>1&&s.sort(f||Gu),m&&(t.reverse(),n.reverse(),s.reverse())}function d(){for(let h=e,f=i.length;h<f;h++){const m=i[h];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:t,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:d,sort:u}}function _S(){let i=new WeakMap;function e(n,s){const r=i.get(n);let a;return r===void 0?(a=new Vu,i.set(n,[a])):s>=r.length?(a=new Vu,r.push(a)):a=r[s],a}function t(){i=new WeakMap}return{get:e,dispose:t}}function MS(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new F,color:new Ve};break;case"SpotLight":t={position:new F,direction:new F,color:new Ve,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new F,color:new Ve,distance:0,decay:0};break;case"HemisphereLight":t={direction:new F,skyColor:new Ve,groundColor:new Ve};break;case"RectAreaLight":t={color:new Ve,position:new F,halfWidth:new F,halfHeight:new F};break}return i[e.id]=t,t}}}function yS(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new tt};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new tt};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new tt,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}let wS=0;function ES(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function TS(i){const e=new MS,t=yS(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new F);const s=new F,r=new at,a=new at;function o(c){let u=0,d=0,h=0;for(let _=0;_<9;_++)n.probe[_].set(0,0,0);let f=0,m=0,v=0,p=0,b=0,M=0,T=0,x=0,A=0,y=0,E=0;c.sort(ES);for(let _=0,R=c.length;_<R;_++){const C=c[_],I=C.color,k=C.intensity,z=C.distance;let D=null;if(C.shadow&&C.shadow.map&&(C.shadow.map.texture.format===Ms?D=C.shadow.map.texture:D=C.shadow.map.depthTexture||C.shadow.map.texture),C.isAmbientLight)u+=I.r*k,d+=I.g*k,h+=I.b*k;else if(C.isLightProbe){for(let V=0;V<9;V++)n.probe[V].addScaledVector(C.sh.coefficients[V],k);E++}else if(C.isDirectionalLight){const V=e.get(C);if(V.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){const L=C.shadow,X=t.get(C);X.shadowIntensity=L.intensity,X.shadowBias=L.bias,X.shadowNormalBias=L.normalBias,X.shadowRadius=L.radius,X.shadowMapSize=L.mapSize,n.directionalShadow[f]=X,n.directionalShadowMap[f]=D,n.directionalShadowMatrix[f]=C.shadow.matrix,M++}n.directional[f]=V,f++}else if(C.isSpotLight){const V=e.get(C);V.position.setFromMatrixPosition(C.matrixWorld),V.color.copy(I).multiplyScalar(k),V.distance=z,V.coneCos=Math.cos(C.angle),V.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),V.decay=C.decay,n.spot[v]=V;const L=C.shadow;if(C.map&&(n.spotLightMap[A]=C.map,A++,L.updateMatrices(C),C.castShadow&&y++),n.spotLightMatrix[v]=L.matrix,C.castShadow){const X=t.get(C);X.shadowIntensity=L.intensity,X.shadowBias=L.bias,X.shadowNormalBias=L.normalBias,X.shadowRadius=L.radius,X.shadowMapSize=L.mapSize,n.spotShadow[v]=X,n.spotShadowMap[v]=D,x++}v++}else if(C.isRectAreaLight){const V=e.get(C);V.color.copy(I).multiplyScalar(k),V.halfWidth.set(C.width*.5,0,0),V.halfHeight.set(0,C.height*.5,0),n.rectArea[p]=V,p++}else if(C.isPointLight){const V=e.get(C);if(V.color.copy(C.color).multiplyScalar(C.intensity),V.distance=C.distance,V.decay=C.decay,C.castShadow){const L=C.shadow,X=t.get(C);X.shadowIntensity=L.intensity,X.shadowBias=L.bias,X.shadowNormalBias=L.normalBias,X.shadowRadius=L.radius,X.shadowMapSize=L.mapSize,X.shadowCameraNear=L.camera.near,X.shadowCameraFar=L.camera.far,n.pointShadow[m]=X,n.pointShadowMap[m]=D,n.pointShadowMatrix[m]=C.shadow.matrix,T++}n.point[m]=V,m++}else if(C.isHemisphereLight){const V=e.get(C);V.skyColor.copy(C.color).multiplyScalar(k),V.groundColor.copy(C.groundColor).multiplyScalar(k),n.hemi[b]=V,b++}}p>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=xe.LTC_FLOAT_1,n.rectAreaLTC2=xe.LTC_FLOAT_2):(n.rectAreaLTC1=xe.LTC_HALF_1,n.rectAreaLTC2=xe.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=d,n.ambient[2]=h;const g=n.hash;(g.directionalLength!==f||g.pointLength!==m||g.spotLength!==v||g.rectAreaLength!==p||g.hemiLength!==b||g.numDirectionalShadows!==M||g.numPointShadows!==T||g.numSpotShadows!==x||g.numSpotMaps!==A||g.numLightProbes!==E)&&(n.directional.length=f,n.spot.length=v,n.rectArea.length=p,n.point.length=m,n.hemi.length=b,n.directionalShadow.length=M,n.directionalShadowMap.length=M,n.pointShadow.length=T,n.pointShadowMap.length=T,n.spotShadow.length=x,n.spotShadowMap.length=x,n.directionalShadowMatrix.length=M,n.pointShadowMatrix.length=T,n.spotLightMatrix.length=x+A-y,n.spotLightMap.length=A,n.numSpotLightShadowsWithMaps=y,n.numLightProbes=E,g.directionalLength=f,g.pointLength=m,g.spotLength=v,g.rectAreaLength=p,g.hemiLength=b,g.numDirectionalShadows=M,g.numPointShadows=T,g.numSpotShadows=x,g.numSpotMaps=A,g.numLightProbes=E,n.version=wS++)}function l(c,u){let d=0,h=0,f=0,m=0,v=0;const p=u.matrixWorldInverse;for(let b=0,M=c.length;b<M;b++){const T=c[b];if(T.isDirectionalLight){const x=n.directional[d];x.direction.setFromMatrixPosition(T.matrixWorld),s.setFromMatrixPosition(T.target.matrixWorld),x.direction.sub(s),x.direction.transformDirection(p),d++}else if(T.isSpotLight){const x=n.spot[f];x.position.setFromMatrixPosition(T.matrixWorld),x.position.applyMatrix4(p),x.direction.setFromMatrixPosition(T.matrixWorld),s.setFromMatrixPosition(T.target.matrixWorld),x.direction.sub(s),x.direction.transformDirection(p),f++}else if(T.isRectAreaLight){const x=n.rectArea[m];x.position.setFromMatrixPosition(T.matrixWorld),x.position.applyMatrix4(p),a.identity(),r.copy(T.matrixWorld),r.premultiply(p),a.extractRotation(r),x.halfWidth.set(T.width*.5,0,0),x.halfHeight.set(0,T.height*.5,0),x.halfWidth.applyMatrix4(a),x.halfHeight.applyMatrix4(a),m++}else if(T.isPointLight){const x=n.point[h];x.position.setFromMatrixPosition(T.matrixWorld),x.position.applyMatrix4(p),h++}else if(T.isHemisphereLight){const x=n.hemi[v];x.direction.setFromMatrixPosition(T.matrixWorld),x.direction.transformDirection(p),v++}}}return{setup:o,setupView:l,state:n}}function Wu(i){const e=new TS(i),t=[],n=[],s=[];function r(h){d.camera=h,t.length=0,n.length=0,s.length=0}function a(h){t.push(h)}function o(h){n.push(h)}function l(h){s.push(h)}function c(){e.setup(t)}function u(h){e.setupView(t,h)}const d={lightsArray:t,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:d,setupLights:c,setupLightsView:u,pushLight:a,pushShadow:o,pushLightProbeGrid:l}}function AS(i){let e=new WeakMap;function t(s,r=0){const a=e.get(s);let o;return a===void 0?(o=new Wu(i),e.set(s,[o])):r>=a.length?(o=new Wu(i),a.push(o)):o=a[r],o}function n(){e=new WeakMap}return{get:t,dispose:n}}const RS=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,CS=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,PS=[new F(1,0,0),new F(-1,0,0),new F(0,1,0),new F(0,-1,0),new F(0,0,1),new F(0,0,-1)],LS=[new F(0,-1,0),new F(0,-1,0),new F(0,0,1),new F(0,0,-1),new F(0,-1,0),new F(0,-1,0)],Xu=new at,_r=new F,dl=new F;function IS(i,e,t){let n=new mh;const s=new tt,r=new tt,a=new At,o=new Gg,l=new Vg,c={},u=t.maxTextureSize,d={[ts]:fn,[fn]:ts,[Ti]:Ti},h=new fi({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new tt},radius:{value:4}},vertexShader:RS,fragmentShader:CS}),f=h.clone();f.defines.HORIZONTAL_PASS=1;const m=new Ut;m.setAttribute("position",new pn(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const v=new ht(m,h),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Dr;let b=this.type;this.render=function(y,E,g){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||y.length===0)return;this.type===gm&&(ze("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=Dr);const _=i.getRenderTarget(),R=i.getActiveCubeFace(),C=i.getActiveMipmapLevel(),I=i.state;I.setBlending(Pi),I.buffers.depth.getReversed()===!0?I.buffers.color.setClear(0,0,0,0):I.buffers.color.setClear(1,1,1,1),I.buffers.depth.setTest(!0),I.setScissorTest(!1);const k=b!==this.type;k&&E.traverse(function(z){z.material&&(Array.isArray(z.material)?z.material.forEach(D=>D.needsUpdate=!0):z.material.needsUpdate=!0)});for(let z=0,D=y.length;z<D;z++){const V=y[z],L=V.shadow;if(L===void 0){ze("WebGLShadowMap:",V,"has no shadow.");continue}if(L.autoUpdate===!1&&L.needsUpdate===!1)continue;s.copy(L.mapSize);const X=L.getFrameExtents();s.multiply(X),r.copy(L.mapSize),(s.x>u||s.y>u)&&(s.x>u&&(r.x=Math.floor(u/X.x),s.x=r.x*X.x,L.mapSize.x=r.x),s.y>u&&(r.y=Math.floor(u/X.y),s.y=r.y*X.y,L.mapSize.y=r.y));const ee=i.state.buffers.depth.getReversed();if(L.camera._reversedDepth=ee,L.map===null||k===!0){if(L.map!==null&&(L.map.depthTexture!==null&&(L.map.depthTexture.dispose(),L.map.depthTexture=null),L.map.dispose()),this.type===Tr){if(V.isPointLight){ze("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}L.map=new hi(s.x,s.y,{format:Ms,type:Di,minFilter:Zt,magFilter:Zt,generateMipmaps:!1}),L.map.texture.name=V.name+".shadowMap",L.map.depthTexture=new rr(s.x,s.y,Yn),L.map.depthTexture.name=V.name+".shadowMapDepth",L.map.depthTexture.format=ki,L.map.depthTexture.compareFunction=null,L.map.depthTexture.minFilter=$t,L.map.depthTexture.magFilter=$t}else V.isPointLight?(L.map=new qf(s.x),L.map.depthTexture=new Ug(s.x,di)):(L.map=new hi(s.x,s.y),L.map.depthTexture=new rr(s.x,s.y,di)),L.map.depthTexture.name=V.name+".shadowMap",L.map.depthTexture.format=ki,this.type===Dr?(L.map.depthTexture.compareFunction=ee?hh:ch,L.map.depthTexture.minFilter=Zt,L.map.depthTexture.magFilter=Zt):(L.map.depthTexture.compareFunction=null,L.map.depthTexture.minFilter=$t,L.map.depthTexture.magFilter=$t);L.camera.updateProjectionMatrix()}const Y=L.map.isWebGLCubeRenderTarget?6:1;for(let J=0;J<Y;J++){if(L.map.isWebGLCubeRenderTarget)i.setRenderTarget(L.map,J),i.clear();else{J===0&&(i.setRenderTarget(L.map),i.clear());const te=L.getViewport(J);a.set(r.x*te.x,r.y*te.y,r.x*te.z,r.y*te.w),I.viewport(a)}if(V.isPointLight){const te=L.camera,Te=L.matrix,Oe=V.distance||te.far;Oe!==te.far&&(te.far=Oe,te.updateProjectionMatrix()),_r.setFromMatrixPosition(V.matrixWorld),te.position.copy(_r),dl.copy(te.position),dl.add(PS[J]),te.up.copy(LS[J]),te.lookAt(dl),te.updateMatrixWorld(),Te.makeTranslation(-_r.x,-_r.y,-_r.z),Xu.multiplyMatrices(te.projectionMatrix,te.matrixWorldInverse),L._frustum.setFromProjectionMatrix(Xu,te.coordinateSystem,te.reversedDepth)}else L.updateMatrices(V);n=L.getFrustum(),x(E,g,L.camera,V,this.type)}L.isPointLightShadow!==!0&&this.type===Tr&&M(L,g),L.needsUpdate=!1}b=this.type,p.needsUpdate=!1,i.setRenderTarget(_,R,C)};function M(y,E){const g=e.update(v);h.defines.VSM_SAMPLES!==y.blurSamples&&(h.defines.VSM_SAMPLES=y.blurSamples,f.defines.VSM_SAMPLES=y.blurSamples,h.needsUpdate=!0,f.needsUpdate=!0),y.mapPass===null&&(y.mapPass=new hi(s.x,s.y,{format:Ms,type:Di})),h.uniforms.shadow_pass.value=y.map.depthTexture,h.uniforms.resolution.value=y.mapSize,h.uniforms.radius.value=y.radius,i.setRenderTarget(y.mapPass),i.clear(),i.renderBufferDirect(E,null,g,h,v,null),f.uniforms.shadow_pass.value=y.mapPass.texture,f.uniforms.resolution.value=y.mapSize,f.uniforms.radius.value=y.radius,i.setRenderTarget(y.map),i.clear(),i.renderBufferDirect(E,null,g,f,v,null)}function T(y,E,g,_){let R=null;const C=g.isPointLight===!0?y.customDistanceMaterial:y.customDepthMaterial;if(C!==void 0)R=C;else if(R=g.isPointLight===!0?l:o,i.localClippingEnabled&&E.clipShadows===!0&&Array.isArray(E.clippingPlanes)&&E.clippingPlanes.length!==0||E.displacementMap&&E.displacementScale!==0||E.alphaMap&&E.alphaTest>0||E.map&&E.alphaTest>0||E.alphaToCoverage===!0){const I=R.uuid,k=E.uuid;let z=c[I];z===void 0&&(z={},c[I]=z);let D=z[k];D===void 0&&(D=R.clone(),z[k]=D,E.addEventListener("dispose",A)),R=D}if(R.visible=E.visible,R.wireframe=E.wireframe,_===Tr?R.side=E.shadowSide!==null?E.shadowSide:E.side:R.side=E.shadowSide!==null?E.shadowSide:d[E.side],R.alphaMap=E.alphaMap,R.alphaTest=E.alphaToCoverage===!0?.5:E.alphaTest,R.map=E.map,R.clipShadows=E.clipShadows,R.clippingPlanes=E.clippingPlanes,R.clipIntersection=E.clipIntersection,R.displacementMap=E.displacementMap,R.displacementScale=E.displacementScale,R.displacementBias=E.displacementBias,R.wireframeLinewidth=E.wireframeLinewidth,R.linewidth=E.linewidth,g.isPointLight===!0&&R.isMeshDistanceMaterial===!0){const I=i.properties.get(R);I.light=g}return R}function x(y,E,g,_,R){if(y.visible===!1)return;if(y.layers.test(E.layers)&&(y.isMesh||y.isLine||y.isPoints)&&(y.castShadow||y.receiveShadow&&R===Tr)&&(!y.frustumCulled||n.intersectsObject(y))){y.modelViewMatrix.multiplyMatrices(g.matrixWorldInverse,y.matrixWorld);const k=e.update(y),z=y.material;if(Array.isArray(z)){const D=k.groups;for(let V=0,L=D.length;V<L;V++){const X=D[V],ee=z[X.materialIndex];if(ee&&ee.visible){const Y=T(y,ee,_,R);y.onBeforeShadow(i,y,E,g,k,Y,X),i.renderBufferDirect(g,null,k,Y,y,X),y.onAfterShadow(i,y,E,g,k,Y,X)}}}else if(z.visible){const D=T(y,z,_,R);y.onBeforeShadow(i,y,E,g,k,D,null),i.renderBufferDirect(g,null,k,D,y,null),y.onAfterShadow(i,y,E,g,k,D,null)}}const I=y.children;for(let k=0,z=I.length;k<z;k++)x(I[k],E,g,_,R)}function A(y){y.target.removeEventListener("dispose",A);for(const g in c){const _=c[g],R=y.target.uuid;R in _&&(_[R].dispose(),delete _[R])}}}function DS(i,e){function t(){let U=!1;const ge=new At;let ae=null;const be=new At(0,0,0,0);return{setMask:function(ye){ae!==ye&&!U&&(i.colorMask(ye,ye,ye,ye),ae=ye)},setLocked:function(ye){U=ye},setClear:function(ye,oe,ke,Pe,Pt){Pt===!0&&(ye*=Pe,oe*=Pe,ke*=Pe),ge.set(ye,oe,ke,Pe),be.equals(ge)===!1&&(i.clearColor(ye,oe,ke,Pe),be.copy(ge))},reset:function(){U=!1,ae=null,be.set(-1,0,0,0)}}}function n(){let U=!1,ge=!1,ae=null,be=null,ye=null;return{setReversed:function(oe){if(ge!==oe){const ke=e.get("EXT_clip_control");oe?ke.clipControlEXT(ke.LOWER_LEFT_EXT,ke.ZERO_TO_ONE_EXT):ke.clipControlEXT(ke.LOWER_LEFT_EXT,ke.NEGATIVE_ONE_TO_ONE_EXT),ge=oe;const Pe=ye;ye=null,this.setClear(Pe)}},getReversed:function(){return ge},setTest:function(oe){oe?re(i.DEPTH_TEST):le(i.DEPTH_TEST)},setMask:function(oe){ae!==oe&&!U&&(i.depthMask(oe),ae=oe)},setFunc:function(oe){if(ge&&(oe=Zm[oe]),be!==oe){switch(oe){case Jl:i.depthFunc(i.NEVER);break;case jl:i.depthFunc(i.ALWAYS);break;case ec:i.depthFunc(i.LESS);break;case ir:i.depthFunc(i.LEQUAL);break;case tc:i.depthFunc(i.EQUAL);break;case nc:i.depthFunc(i.GEQUAL);break;case ic:i.depthFunc(i.GREATER);break;case sc:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}be=oe}},setLocked:function(oe){U=oe},setClear:function(oe){ye!==oe&&(ye=oe,ge&&(oe=1-oe),i.clearDepth(oe))},reset:function(){U=!1,ae=null,be=null,ye=null,ge=!1}}}function s(){let U=!1,ge=null,ae=null,be=null,ye=null,oe=null,ke=null,Pe=null,Pt=null;return{setTest:function(xt){U||(xt?re(i.STENCIL_TEST):le(i.STENCIL_TEST))},setMask:function(xt){ge!==xt&&!U&&(i.stencilMask(xt),ge=xt)},setFunc:function(xt,Zn,Kn){(ae!==xt||be!==Zn||ye!==Kn)&&(i.stencilFunc(xt,Zn,Kn),ae=xt,be=Zn,ye=Kn)},setOp:function(xt,Zn,Kn){(oe!==xt||ke!==Zn||Pe!==Kn)&&(i.stencilOp(xt,Zn,Kn),oe=xt,ke=Zn,Pe=Kn)},setLocked:function(xt){U=xt},setClear:function(xt){Pt!==xt&&(i.clearStencil(xt),Pt=xt)},reset:function(){U=!1,ge=null,ae=null,be=null,ye=null,oe=null,ke=null,Pe=null,Pt=null}}}const r=new t,a=new n,o=new s,l=new WeakMap,c=new WeakMap;let u={},d={},h={},f=new WeakMap,m=[],v=null,p=!1,b=null,M=null,T=null,x=null,A=null,y=null,E=null,g=new Ve(0,0,0),_=0,R=!1,C=null,I=null,k=null,z=null,D=null;const V=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let L=!1,X=0;const ee=i.getParameter(i.VERSION);ee.indexOf("WebGL")!==-1?(X=parseFloat(/^WebGL (\d)/.exec(ee)[1]),L=X>=1):ee.indexOf("OpenGL ES")!==-1&&(X=parseFloat(/^OpenGL ES (\d)/.exec(ee)[1]),L=X>=2);let Y=null,J={};const te=i.getParameter(i.SCISSOR_BOX),Te=i.getParameter(i.VIEWPORT),Oe=new At().fromArray(te),q=new At().fromArray(Te);function G(U,ge,ae,be){const ye=new Uint8Array(4),oe=i.createTexture();i.bindTexture(U,oe),i.texParameteri(U,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(U,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let ke=0;ke<ae;ke++)U===i.TEXTURE_3D||U===i.TEXTURE_2D_ARRAY?i.texImage3D(ge,0,i.RGBA,1,1,be,0,i.RGBA,i.UNSIGNED_BYTE,ye):i.texImage2D(ge+ke,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,ye);return oe}const ne={};ne[i.TEXTURE_2D]=G(i.TEXTURE_2D,i.TEXTURE_2D,1),ne[i.TEXTURE_CUBE_MAP]=G(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),ne[i.TEXTURE_2D_ARRAY]=G(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),ne[i.TEXTURE_3D]=G(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),re(i.DEPTH_TEST),a.setFunc(ir),dt(!1),ot(Hh),re(i.CULL_FACE),Ge(Pi);function re(U){u[U]!==!0&&(i.enable(U),u[U]=!0)}function le(U){u[U]!==!1&&(i.disable(U),u[U]=!1)}function ve(U,ge){return h[U]!==ge?(i.bindFramebuffer(U,ge),h[U]=ge,U===i.DRAW_FRAMEBUFFER&&(h[i.FRAMEBUFFER]=ge),U===i.FRAMEBUFFER&&(h[i.DRAW_FRAMEBUFFER]=ge),!0):!1}function Se(U,ge){let ae=m,be=!1;if(U){ae=f.get(ge),ae===void 0&&(ae=[],f.set(ge,ae));const ye=U.textures;if(ae.length!==ye.length||ae[0]!==i.COLOR_ATTACHMENT0){for(let oe=0,ke=ye.length;oe<ke;oe++)ae[oe]=i.COLOR_ATTACHMENT0+oe;ae.length=ye.length,be=!0}}else ae[0]!==i.BACK&&(ae[0]=i.BACK,be=!0);be&&i.drawBuffers(ae)}function je(U){return v!==U?(i.useProgram(U),v=U,!0):!1}const Ie={[ds]:i.FUNC_ADD,[vm]:i.FUNC_SUBTRACT,[xm]:i.FUNC_REVERSE_SUBTRACT};Ie[Sm]=i.MIN,Ie[_m]=i.MAX;const nt={[Mm]:i.ZERO,[ym]:i.ONE,[wm]:i.SRC_COLOR,[Kl]:i.SRC_ALPHA,[Pm]:i.SRC_ALPHA_SATURATE,[Rm]:i.DST_COLOR,[Tm]:i.DST_ALPHA,[Em]:i.ONE_MINUS_SRC_COLOR,[Ql]:i.ONE_MINUS_SRC_ALPHA,[Cm]:i.ONE_MINUS_DST_COLOR,[Am]:i.ONE_MINUS_DST_ALPHA,[Lm]:i.CONSTANT_COLOR,[Im]:i.ONE_MINUS_CONSTANT_COLOR,[Dm]:i.CONSTANT_ALPHA,[km]:i.ONE_MINUS_CONSTANT_ALPHA};function Ge(U,ge,ae,be,ye,oe,ke,Pe,Pt,xt){if(U===Pi){p===!0&&(le(i.BLEND),p=!1);return}if(p===!1&&(re(i.BLEND),p=!0),U!==bm){if(U!==b||xt!==R){if((M!==ds||A!==ds)&&(i.blendEquation(i.FUNC_ADD),M=ds,A=ds),xt)switch(U){case Js:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Gh:i.blendFunc(i.ONE,i.ONE);break;case Vh:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Wh:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:ct("WebGLState: Invalid blending: ",U);break}else switch(U){case Js:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Gh:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Vh:ct("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Wh:ct("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:ct("WebGLState: Invalid blending: ",U);break}T=null,x=null,y=null,E=null,g.set(0,0,0),_=0,b=U,R=xt}return}ye=ye||ge,oe=oe||ae,ke=ke||be,(ge!==M||ye!==A)&&(i.blendEquationSeparate(Ie[ge],Ie[ye]),M=ge,A=ye),(ae!==T||be!==x||oe!==y||ke!==E)&&(i.blendFuncSeparate(nt[ae],nt[be],nt[oe],nt[ke]),T=ae,x=be,y=oe,E=ke),(Pe.equals(g)===!1||Pt!==_)&&(i.blendColor(Pe.r,Pe.g,Pe.b,Pt),g.copy(Pe),_=Pt),b=U,R=!1}function $e(U,ge){U.side===Ti?le(i.CULL_FACE):re(i.CULL_FACE);let ae=U.side===fn;ge&&(ae=!ae),dt(ae),U.blending===Js&&U.transparent===!1?Ge(Pi):Ge(U.blending,U.blendEquation,U.blendSrc,U.blendDst,U.blendEquationAlpha,U.blendSrcAlpha,U.blendDstAlpha,U.blendColor,U.blendAlpha,U.premultipliedAlpha),a.setFunc(U.depthFunc),a.setTest(U.depthTest),a.setMask(U.depthWrite),r.setMask(U.colorWrite);const be=U.stencilWrite;o.setTest(be),be&&(o.setMask(U.stencilWriteMask),o.setFunc(U.stencilFunc,U.stencilRef,U.stencilFuncMask),o.setOp(U.stencilFail,U.stencilZFail,U.stencilZPass)),Rt(U.polygonOffset,U.polygonOffsetFactor,U.polygonOffsetUnits),U.alphaToCoverage===!0?re(i.SAMPLE_ALPHA_TO_COVERAGE):le(i.SAMPLE_ALPHA_TO_COVERAGE)}function dt(U){C!==U&&(U?i.frontFace(i.CW):i.frontFace(i.CCW),C=U)}function ot(U){U!==pm?(re(i.CULL_FACE),U!==I&&(U===Hh?i.cullFace(i.BACK):U===mm?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):le(i.CULL_FACE),I=U}function Mt(U){U!==k&&(L&&i.lineWidth(U),k=U)}function Rt(U,ge,ae){U?(re(i.POLYGON_OFFSET_FILL),(z!==ge||D!==ae)&&(z=ge,D=ae,a.getReversed()&&(ge=-ge),i.polygonOffset(ge,ae))):le(i.POLYGON_OFFSET_FILL)}function wt(U){U?re(i.SCISSOR_TEST):le(i.SCISSOR_TEST)}function Ct(U){U===void 0&&(U=i.TEXTURE0+V-1),Y!==U&&(i.activeTexture(U),Y=U)}function O(U,ge,ae){ae===void 0&&(Y===null?ae=i.TEXTURE0+V-1:ae=Y);let be=J[ae];be===void 0&&(be={type:void 0,texture:void 0},J[ae]=be),(be.type!==U||be.texture!==ge)&&(Y!==ae&&(i.activeTexture(ae),Y=ae),i.bindTexture(U,ge||ne[U]),be.type=U,be.texture=ge)}function Kt(){const U=J[Y];U!==void 0&&U.type!==void 0&&(i.bindTexture(U.type,null),U.type=void 0,U.texture=void 0)}function ut(){try{i.compressedTexImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function P(){try{i.compressedTexImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function S(){try{i.texSubImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function H(){try{i.texSubImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function $(){try{i.compressedTexSubImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function ie(){try{i.compressedTexSubImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function ce(){try{i.texStorage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function me(){try{i.texStorage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function se(){try{i.texImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function W(){try{i.texImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function pe(U){return d[U]!==void 0?d[U]:i.getParameter(U)}function Ce(U,ge){d[U]!==ge&&(i.pixelStorei(U,ge),d[U]=ge)}function de(U){Oe.equals(U)===!1&&(i.scissor(U.x,U.y,U.z,U.w),Oe.copy(U))}function ue(U){q.equals(U)===!1&&(i.viewport(U.x,U.y,U.z,U.w),q.copy(U))}function De(U,ge){let ae=c.get(ge);ae===void 0&&(ae=new WeakMap,c.set(ge,ae));let be=ae.get(U);be===void 0&&(be=i.getUniformBlockIndex(ge,U.name),ae.set(U,be))}function Ne(U,ge){const be=c.get(ge).get(U);l.get(ge)!==be&&(i.uniformBlockBinding(ge,be,U.__bindingPointIndex),l.set(ge,be))}function He(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),u={},d={},Y=null,J={},h={},f=new WeakMap,m=[],v=null,p=!1,b=null,M=null,T=null,x=null,A=null,y=null,E=null,g=new Ve(0,0,0),_=0,R=!1,C=null,I=null,k=null,z=null,D=null,Oe.set(0,0,i.canvas.width,i.canvas.height),q.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:re,disable:le,bindFramebuffer:ve,drawBuffers:Se,useProgram:je,setBlending:Ge,setMaterial:$e,setFlipSided:dt,setCullFace:ot,setLineWidth:Mt,setPolygonOffset:Rt,setScissorTest:wt,activeTexture:Ct,bindTexture:O,unbindTexture:Kt,compressedTexImage2D:ut,compressedTexImage3D:P,texImage2D:se,texImage3D:W,pixelStorei:Ce,getParameter:pe,updateUBOMapping:De,uniformBlockBinding:Ne,texStorage2D:ce,texStorage3D:me,texSubImage2D:S,texSubImage3D:H,compressedTexSubImage2D:$,compressedTexSubImage3D:ie,scissor:de,viewport:ue,reset:He}}function kS(i,e,t,n,s,r,a){const o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new tt,u=new WeakMap,d=new Set;let h;const f=new WeakMap;let m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function v(P,S){return m?new OffscreenCanvas(P,S):mo("canvas")}function p(P,S,H){let $=1;const ie=ut(P);if((ie.width>H||ie.height>H)&&($=H/Math.max(ie.width,ie.height)),$<1)if(typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&P instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&P instanceof ImageBitmap||typeof VideoFrame<"u"&&P instanceof VideoFrame){const ce=Math.floor($*ie.width),me=Math.floor($*ie.height);h===void 0&&(h=v(ce,me));const se=S?v(ce,me):h;return se.width=ce,se.height=me,se.getContext("2d").drawImage(P,0,0,ce,me),ze("WebGLRenderer: Texture has been resized from ("+ie.width+"x"+ie.height+") to ("+ce+"x"+me+")."),se}else return"data"in P&&ze("WebGLRenderer: Image in DataTexture is too big ("+ie.width+"x"+ie.height+")."),P;return P}function b(P){return P.generateMipmaps}function M(P){i.generateMipmap(P)}function T(P){return P.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:P.isWebGL3DRenderTarget?i.TEXTURE_3D:P.isWebGLArrayRenderTarget||P.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function x(P,S,H,$,ie,ce=!1){if(P!==null){if(i[P]!==void 0)return i[P];ze("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+P+"'")}let me;$&&(me=e.get("EXT_texture_norm16"),me||ze("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let se=S;if(S===i.RED&&(H===i.FLOAT&&(se=i.R32F),H===i.HALF_FLOAT&&(se=i.R16F),H===i.UNSIGNED_BYTE&&(se=i.R8),H===i.UNSIGNED_SHORT&&me&&(se=me.R16_EXT),H===i.SHORT&&me&&(se=me.R16_SNORM_EXT)),S===i.RED_INTEGER&&(H===i.UNSIGNED_BYTE&&(se=i.R8UI),H===i.UNSIGNED_SHORT&&(se=i.R16UI),H===i.UNSIGNED_INT&&(se=i.R32UI),H===i.BYTE&&(se=i.R8I),H===i.SHORT&&(se=i.R16I),H===i.INT&&(se=i.R32I)),S===i.RG&&(H===i.FLOAT&&(se=i.RG32F),H===i.HALF_FLOAT&&(se=i.RG16F),H===i.UNSIGNED_BYTE&&(se=i.RG8),H===i.UNSIGNED_SHORT&&me&&(se=me.RG16_EXT),H===i.SHORT&&me&&(se=me.RG16_SNORM_EXT)),S===i.RG_INTEGER&&(H===i.UNSIGNED_BYTE&&(se=i.RG8UI),H===i.UNSIGNED_SHORT&&(se=i.RG16UI),H===i.UNSIGNED_INT&&(se=i.RG32UI),H===i.BYTE&&(se=i.RG8I),H===i.SHORT&&(se=i.RG16I),H===i.INT&&(se=i.RG32I)),S===i.RGB_INTEGER&&(H===i.UNSIGNED_BYTE&&(se=i.RGB8UI),H===i.UNSIGNED_SHORT&&(se=i.RGB16UI),H===i.UNSIGNED_INT&&(se=i.RGB32UI),H===i.BYTE&&(se=i.RGB8I),H===i.SHORT&&(se=i.RGB16I),H===i.INT&&(se=i.RGB32I)),S===i.RGBA_INTEGER&&(H===i.UNSIGNED_BYTE&&(se=i.RGBA8UI),H===i.UNSIGNED_SHORT&&(se=i.RGBA16UI),H===i.UNSIGNED_INT&&(se=i.RGBA32UI),H===i.BYTE&&(se=i.RGBA8I),H===i.SHORT&&(se=i.RGBA16I),H===i.INT&&(se=i.RGBA32I)),S===i.RGB&&(H===i.UNSIGNED_SHORT&&me&&(se=me.RGB16_EXT),H===i.SHORT&&me&&(se=me.RGB16_SNORM_EXT),H===i.UNSIGNED_INT_5_9_9_9_REV&&(se=i.RGB9_E5),H===i.UNSIGNED_INT_10F_11F_11F_REV&&(se=i.R11F_G11F_B10F)),S===i.RGBA){const W=ce?po:rt.getTransfer(ie);H===i.FLOAT&&(se=i.RGBA32F),H===i.HALF_FLOAT&&(se=i.RGBA16F),H===i.UNSIGNED_BYTE&&(se=W===pt?i.SRGB8_ALPHA8:i.RGBA8),H===i.UNSIGNED_SHORT&&me&&(se=me.RGBA16_EXT),H===i.SHORT&&me&&(se=me.RGBA16_SNORM_EXT),H===i.UNSIGNED_SHORT_4_4_4_4&&(se=i.RGBA4),H===i.UNSIGNED_SHORT_5_5_5_1&&(se=i.RGB5_A1)}return(se===i.R16F||se===i.R32F||se===i.RG16F||se===i.RG32F||se===i.RGBA16F||se===i.RGBA32F)&&e.get("EXT_color_buffer_float"),se}function A(P,S){let H;return P?S===null||S===di||S===zr?H=i.DEPTH24_STENCIL8:S===Yn?H=i.DEPTH32F_STENCIL8:S===Or&&(H=i.DEPTH24_STENCIL8,ze("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):S===null||S===di||S===zr?H=i.DEPTH_COMPONENT24:S===Yn?H=i.DEPTH_COMPONENT32F:S===Or&&(H=i.DEPTH_COMPONENT16),H}function y(P,S){return b(P)===!0||P.isFramebufferTexture&&P.minFilter!==$t&&P.minFilter!==Zt?Math.log2(Math.max(S.width,S.height))+1:P.mipmaps!==void 0&&P.mipmaps.length>0?P.mipmaps.length:P.isCompressedTexture&&Array.isArray(P.image)?S.mipmaps.length:1}function E(P){const S=P.target;S.removeEventListener("dispose",E),_(S),S.isVideoTexture&&u.delete(S),S.isHTMLTexture&&d.delete(S)}function g(P){const S=P.target;S.removeEventListener("dispose",g),C(S)}function _(P){const S=n.get(P);if(S.__webglInit===void 0)return;const H=P.source,$=f.get(H);if($){const ie=$[S.__cacheKey];ie.usedTimes--,ie.usedTimes===0&&R(P),Object.keys($).length===0&&f.delete(H)}n.remove(P)}function R(P){const S=n.get(P);i.deleteTexture(S.__webglTexture);const H=P.source,$=f.get(H);delete $[S.__cacheKey],a.memory.textures--}function C(P){const S=n.get(P);if(P.depthTexture&&(P.depthTexture.dispose(),n.remove(P.depthTexture)),P.isWebGLCubeRenderTarget)for(let $=0;$<6;$++){if(Array.isArray(S.__webglFramebuffer[$]))for(let ie=0;ie<S.__webglFramebuffer[$].length;ie++)i.deleteFramebuffer(S.__webglFramebuffer[$][ie]);else i.deleteFramebuffer(S.__webglFramebuffer[$]);S.__webglDepthbuffer&&i.deleteRenderbuffer(S.__webglDepthbuffer[$])}else{if(Array.isArray(S.__webglFramebuffer))for(let $=0;$<S.__webglFramebuffer.length;$++)i.deleteFramebuffer(S.__webglFramebuffer[$]);else i.deleteFramebuffer(S.__webglFramebuffer);if(S.__webglDepthbuffer&&i.deleteRenderbuffer(S.__webglDepthbuffer),S.__webglMultisampledFramebuffer&&i.deleteFramebuffer(S.__webglMultisampledFramebuffer),S.__webglColorRenderbuffer)for(let $=0;$<S.__webglColorRenderbuffer.length;$++)S.__webglColorRenderbuffer[$]&&i.deleteRenderbuffer(S.__webglColorRenderbuffer[$]);S.__webglDepthRenderbuffer&&i.deleteRenderbuffer(S.__webglDepthRenderbuffer)}const H=P.textures;for(let $=0,ie=H.length;$<ie;$++){const ce=n.get(H[$]);ce.__webglTexture&&(i.deleteTexture(ce.__webglTexture),a.memory.textures--),n.remove(H[$])}n.remove(P)}let I=0;function k(){I=0}function z(){return I}function D(P){I=P}function V(){const P=I;return P>=s.maxTextures&&ze("WebGLTextures: Trying to use "+P+" texture units while this GPU supports only "+s.maxTextures),I+=1,P}function L(P){const S=[];return S.push(P.wrapS),S.push(P.wrapT),S.push(P.wrapR||0),S.push(P.magFilter),S.push(P.minFilter),S.push(P.anisotropy),S.push(P.internalFormat),S.push(P.format),S.push(P.type),S.push(P.generateMipmaps),S.push(P.premultiplyAlpha),S.push(P.flipY),S.push(P.unpackAlignment),S.push(P.colorSpace),S.join()}function X(P,S){const H=n.get(P);if(P.isVideoTexture&&O(P),P.isRenderTargetTexture===!1&&P.isExternalTexture!==!0&&P.version>0&&H.__version!==P.version){const $=P.image;if($===null)ze("WebGLRenderer: Texture marked for update but no image data found.");else if($.complete===!1)ze("WebGLRenderer: Texture marked for update but image is incomplete");else{le(H,P,S);return}}else P.isExternalTexture&&(H.__webglTexture=P.sourceTexture?P.sourceTexture:null);t.bindTexture(i.TEXTURE_2D,H.__webglTexture,i.TEXTURE0+S)}function ee(P,S){const H=n.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&H.__version!==P.version){le(H,P,S);return}else P.isExternalTexture&&(H.__webglTexture=P.sourceTexture?P.sourceTexture:null);t.bindTexture(i.TEXTURE_2D_ARRAY,H.__webglTexture,i.TEXTURE0+S)}function Y(P,S){const H=n.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&H.__version!==P.version){le(H,P,S);return}t.bindTexture(i.TEXTURE_3D,H.__webglTexture,i.TEXTURE0+S)}function J(P,S){const H=n.get(P);if(P.isCubeDepthTexture!==!0&&P.version>0&&H.__version!==P.version){ve(H,P,S);return}t.bindTexture(i.TEXTURE_CUBE_MAP,H.__webglTexture,i.TEXTURE0+S)}const te={[co]:i.REPEAT,[ai]:i.CLAMP_TO_EDGE,[rc]:i.MIRRORED_REPEAT},Te={[$t]:i.NEAREST,[Nm]:i.NEAREST_MIPMAP_NEAREST,[Kr]:i.NEAREST_MIPMAP_LINEAR,[Zt]:i.LINEAR,[No]:i.LINEAR_MIPMAP_NEAREST,[Ki]:i.LINEAR_MIPMAP_LINEAR},Oe={[Bm]:i.NEVER,[Xm]:i.ALWAYS,[Hm]:i.LESS,[ch]:i.LEQUAL,[Gm]:i.EQUAL,[hh]:i.GEQUAL,[Vm]:i.GREATER,[Wm]:i.NOTEQUAL};function q(P,S){if(S.type===Yn&&e.has("OES_texture_float_linear")===!1&&(S.magFilter===Zt||S.magFilter===No||S.magFilter===Kr||S.magFilter===Ki||S.minFilter===Zt||S.minFilter===No||S.minFilter===Kr||S.minFilter===Ki)&&ze("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(P,i.TEXTURE_WRAP_S,te[S.wrapS]),i.texParameteri(P,i.TEXTURE_WRAP_T,te[S.wrapT]),(P===i.TEXTURE_3D||P===i.TEXTURE_2D_ARRAY)&&i.texParameteri(P,i.TEXTURE_WRAP_R,te[S.wrapR]),i.texParameteri(P,i.TEXTURE_MAG_FILTER,Te[S.magFilter]),i.texParameteri(P,i.TEXTURE_MIN_FILTER,Te[S.minFilter]),S.compareFunction&&(i.texParameteri(P,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(P,i.TEXTURE_COMPARE_FUNC,Oe[S.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(S.magFilter===$t||S.minFilter!==Kr&&S.minFilter!==Ki||S.type===Yn&&e.has("OES_texture_float_linear")===!1)return;if(S.anisotropy>1||n.get(S).__currentAnisotropy){const H=e.get("EXT_texture_filter_anisotropic");i.texParameterf(P,H.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(S.anisotropy,s.getMaxAnisotropy())),n.get(S).__currentAnisotropy=S.anisotropy}}}function G(P,S){let H=!1;P.__webglInit===void 0&&(P.__webglInit=!0,S.addEventListener("dispose",E));const $=S.source;let ie=f.get($);ie===void 0&&(ie={},f.set($,ie));const ce=L(S);if(ce!==P.__cacheKey){ie[ce]===void 0&&(ie[ce]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,H=!0),ie[ce].usedTimes++;const me=ie[P.__cacheKey];me!==void 0&&(ie[P.__cacheKey].usedTimes--,me.usedTimes===0&&R(S)),P.__cacheKey=ce,P.__webglTexture=ie[ce].texture}return H}function ne(P,S,H){return Math.floor(Math.floor(P/H)/S)}function re(P,S,H,$){const ce=P.updateRanges;if(ce.length===0)t.texSubImage2D(i.TEXTURE_2D,0,0,0,S.width,S.height,H,$,S.data);else{ce.sort((Ce,de)=>Ce.start-de.start);let me=0;for(let Ce=1;Ce<ce.length;Ce++){const de=ce[me],ue=ce[Ce],De=de.start+de.count,Ne=ne(ue.start,S.width,4),He=ne(de.start,S.width,4);ue.start<=De+1&&Ne===He&&ne(ue.start+ue.count-1,S.width,4)===Ne?de.count=Math.max(de.count,ue.start+ue.count-de.start):(++me,ce[me]=ue)}ce.length=me+1;const se=t.getParameter(i.UNPACK_ROW_LENGTH),W=t.getParameter(i.UNPACK_SKIP_PIXELS),pe=t.getParameter(i.UNPACK_SKIP_ROWS);t.pixelStorei(i.UNPACK_ROW_LENGTH,S.width);for(let Ce=0,de=ce.length;Ce<de;Ce++){const ue=ce[Ce],De=Math.floor(ue.start/4),Ne=Math.ceil(ue.count/4),He=De%S.width,U=Math.floor(De/S.width),ge=Ne,ae=1;t.pixelStorei(i.UNPACK_SKIP_PIXELS,He),t.pixelStorei(i.UNPACK_SKIP_ROWS,U),t.texSubImage2D(i.TEXTURE_2D,0,He,U,ge,ae,H,$,S.data)}P.clearUpdateRanges(),t.pixelStorei(i.UNPACK_ROW_LENGTH,se),t.pixelStorei(i.UNPACK_SKIP_PIXELS,W),t.pixelStorei(i.UNPACK_SKIP_ROWS,pe)}}function le(P,S,H){let $=i.TEXTURE_2D;(S.isDataArrayTexture||S.isCompressedArrayTexture)&&($=i.TEXTURE_2D_ARRAY),S.isData3DTexture&&($=i.TEXTURE_3D);const ie=G(P,S),ce=S.source;t.bindTexture($,P.__webglTexture,i.TEXTURE0+H);const me=n.get(ce);if(ce.version!==me.__version||ie===!0){if(t.activeTexture(i.TEXTURE0+H),(typeof ImageBitmap<"u"&&S.image instanceof ImageBitmap)===!1){const ae=rt.getPrimaries(rt.workingColorSpace),be=S.colorSpace===Zi?null:rt.getPrimaries(S.colorSpace),ye=S.colorSpace===Zi||ae===be?i.NONE:i.BROWSER_DEFAULT_WEBGL;t.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,S.flipY),t.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),t.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,ye)}t.pixelStorei(i.UNPACK_ALIGNMENT,S.unpackAlignment);let W=p(S.image,!1,s.maxTextureSize);W=Kt(S,W);const pe=r.convert(S.format,S.colorSpace),Ce=r.convert(S.type);let de=x(S.internalFormat,pe,Ce,S.normalized,S.colorSpace,S.isVideoTexture);q($,S);let ue;const De=S.mipmaps,Ne=S.isVideoTexture!==!0,He=me.__version===void 0||ie===!0,U=ce.dataReady,ge=y(S,W);if(S.isDepthTexture)de=A(S.format===ps,S.type),He&&(Ne?t.texStorage2D(i.TEXTURE_2D,1,de,W.width,W.height):t.texImage2D(i.TEXTURE_2D,0,de,W.width,W.height,0,pe,Ce,null));else if(S.isDataTexture)if(De.length>0){Ne&&He&&t.texStorage2D(i.TEXTURE_2D,ge,de,De[0].width,De[0].height);for(let ae=0,be=De.length;ae<be;ae++)ue=De[ae],Ne?U&&t.texSubImage2D(i.TEXTURE_2D,ae,0,0,ue.width,ue.height,pe,Ce,ue.data):t.texImage2D(i.TEXTURE_2D,ae,de,ue.width,ue.height,0,pe,Ce,ue.data);S.generateMipmaps=!1}else Ne?(He&&t.texStorage2D(i.TEXTURE_2D,ge,de,W.width,W.height),U&&re(S,W,pe,Ce)):t.texImage2D(i.TEXTURE_2D,0,de,W.width,W.height,0,pe,Ce,W.data);else if(S.isCompressedTexture)if(S.isCompressedArrayTexture){Ne&&He&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ge,de,De[0].width,De[0].height,W.depth);for(let ae=0,be=De.length;ae<be;ae++)if(ue=De[ae],S.format!==Ln)if(pe!==null)if(Ne){if(U)if(S.layerUpdates.size>0){const ye=Mu(ue.width,ue.height,S.format,S.type);for(const oe of S.layerUpdates){const ke=ue.data.subarray(oe*ye/ue.data.BYTES_PER_ELEMENT,(oe+1)*ye/ue.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ae,0,0,oe,ue.width,ue.height,1,pe,ke)}S.clearLayerUpdates()}else t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ae,0,0,0,ue.width,ue.height,W.depth,pe,ue.data)}else t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,ae,de,ue.width,ue.height,W.depth,0,ue.data,0,0);else ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Ne?U&&t.texSubImage3D(i.TEXTURE_2D_ARRAY,ae,0,0,0,ue.width,ue.height,W.depth,pe,Ce,ue.data):t.texImage3D(i.TEXTURE_2D_ARRAY,ae,de,ue.width,ue.height,W.depth,0,pe,Ce,ue.data)}else{Ne&&He&&t.texStorage2D(i.TEXTURE_2D,ge,de,De[0].width,De[0].height);for(let ae=0,be=De.length;ae<be;ae++)ue=De[ae],S.format!==Ln?pe!==null?Ne?U&&t.compressedTexSubImage2D(i.TEXTURE_2D,ae,0,0,ue.width,ue.height,pe,ue.data):t.compressedTexImage2D(i.TEXTURE_2D,ae,de,ue.width,ue.height,0,ue.data):ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Ne?U&&t.texSubImage2D(i.TEXTURE_2D,ae,0,0,ue.width,ue.height,pe,Ce,ue.data):t.texImage2D(i.TEXTURE_2D,ae,de,ue.width,ue.height,0,pe,Ce,ue.data)}else if(S.isDataArrayTexture)if(Ne){if(He&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ge,de,W.width,W.height,W.depth),U)if(S.layerUpdates.size>0){const ae=Mu(W.width,W.height,S.format,S.type);for(const be of S.layerUpdates){const ye=W.data.subarray(be*ae/W.data.BYTES_PER_ELEMENT,(be+1)*ae/W.data.BYTES_PER_ELEMENT);t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,be,W.width,W.height,1,pe,Ce,ye)}S.clearLayerUpdates()}else t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,W.width,W.height,W.depth,pe,Ce,W.data)}else t.texImage3D(i.TEXTURE_2D_ARRAY,0,de,W.width,W.height,W.depth,0,pe,Ce,W.data);else if(S.isData3DTexture)Ne?(He&&t.texStorage3D(i.TEXTURE_3D,ge,de,W.width,W.height,W.depth),U&&t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,W.width,W.height,W.depth,pe,Ce,W.data)):t.texImage3D(i.TEXTURE_3D,0,de,W.width,W.height,W.depth,0,pe,Ce,W.data);else if(S.isFramebufferTexture){if(He)if(Ne)t.texStorage2D(i.TEXTURE_2D,ge,de,W.width,W.height);else{let ae=W.width,be=W.height;for(let ye=0;ye<ge;ye++)t.texImage2D(i.TEXTURE_2D,ye,de,ae,be,0,pe,Ce,null),ae>>=1,be>>=1}}else if(S.isHTMLTexture){if("texElementImage2D"in i){const ae=i.canvas;if(ae.hasAttribute("layoutsubtree")||ae.setAttribute("layoutsubtree","true"),W.parentNode!==ae){ae.appendChild(W),d.add(S),ae.onpaint=be=>{const ye=be.changedElements;for(const oe of d)ye.includes(oe.image)&&(oe.needsUpdate=!0)},ae.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,W);else{const ye=i.RGBA,oe=i.RGBA,ke=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,ye,oe,ke,W)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(De.length>0){if(Ne&&He){const ae=ut(De[0]);t.texStorage2D(i.TEXTURE_2D,ge,de,ae.width,ae.height)}for(let ae=0,be=De.length;ae<be;ae++)ue=De[ae],Ne?U&&t.texSubImage2D(i.TEXTURE_2D,ae,0,0,pe,Ce,ue):t.texImage2D(i.TEXTURE_2D,ae,de,pe,Ce,ue);S.generateMipmaps=!1}else if(Ne){if(He){const ae=ut(W);t.texStorage2D(i.TEXTURE_2D,ge,de,ae.width,ae.height)}U&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,pe,Ce,W)}else t.texImage2D(i.TEXTURE_2D,0,de,pe,Ce,W);b(S)&&M($),me.__version=ce.version,S.onUpdate&&S.onUpdate(S)}P.__version=S.version}function ve(P,S,H){if(S.image.length!==6)return;const $=G(P,S),ie=S.source;t.bindTexture(i.TEXTURE_CUBE_MAP,P.__webglTexture,i.TEXTURE0+H);const ce=n.get(ie);if(ie.version!==ce.__version||$===!0){t.activeTexture(i.TEXTURE0+H);const me=rt.getPrimaries(rt.workingColorSpace),se=S.colorSpace===Zi?null:rt.getPrimaries(S.colorSpace),W=S.colorSpace===Zi||me===se?i.NONE:i.BROWSER_DEFAULT_WEBGL;t.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,S.flipY),t.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),t.pixelStorei(i.UNPACK_ALIGNMENT,S.unpackAlignment),t.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,W);const pe=S.isCompressedTexture||S.image[0].isCompressedTexture,Ce=S.image[0]&&S.image[0].isDataTexture,de=[];for(let oe=0;oe<6;oe++)!pe&&!Ce?de[oe]=p(S.image[oe],!0,s.maxCubemapSize):de[oe]=Ce?S.image[oe].image:S.image[oe],de[oe]=Kt(S,de[oe]);const ue=de[0],De=r.convert(S.format,S.colorSpace),Ne=r.convert(S.type),He=x(S.internalFormat,De,Ne,S.normalized,S.colorSpace),U=S.isVideoTexture!==!0,ge=ce.__version===void 0||$===!0,ae=ie.dataReady;let be=y(S,ue);q(i.TEXTURE_CUBE_MAP,S);let ye;if(pe){U&&ge&&t.texStorage2D(i.TEXTURE_CUBE_MAP,be,He,ue.width,ue.height);for(let oe=0;oe<6;oe++){ye=de[oe].mipmaps;for(let ke=0;ke<ye.length;ke++){const Pe=ye[ke];S.format!==Ln?De!==null?U?ae&&t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke,0,0,Pe.width,Pe.height,De,Pe.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke,He,Pe.width,Pe.height,0,Pe.data):ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke,0,0,Pe.width,Pe.height,De,Ne,Pe.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke,He,Pe.width,Pe.height,0,De,Ne,Pe.data)}}}else{if(ye=S.mipmaps,U&&ge){ye.length>0&&be++;const oe=ut(de[0]);t.texStorage2D(i.TEXTURE_CUBE_MAP,be,He,oe.width,oe.height)}for(let oe=0;oe<6;oe++)if(Ce){U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,0,0,de[oe].width,de[oe].height,De,Ne,de[oe].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,He,de[oe].width,de[oe].height,0,De,Ne,de[oe].data);for(let ke=0;ke<ye.length;ke++){const Pt=ye[ke].image[oe].image;U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke+1,0,0,Pt.width,Pt.height,De,Ne,Pt.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke+1,He,Pt.width,Pt.height,0,De,Ne,Pt.data)}}else{U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,0,0,De,Ne,de[oe]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,He,De,Ne,de[oe]);for(let ke=0;ke<ye.length;ke++){const Pe=ye[ke];U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke+1,0,0,De,Ne,Pe.image[oe]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,ke+1,He,De,Ne,Pe.image[oe])}}}b(S)&&M(i.TEXTURE_CUBE_MAP),ce.__version=ie.version,S.onUpdate&&S.onUpdate(S)}P.__version=S.version}function Se(P,S,H,$,ie,ce){const me=r.convert(H.format,H.colorSpace),se=r.convert(H.type),W=x(H.internalFormat,me,se,H.normalized,H.colorSpace),pe=n.get(S),Ce=n.get(H);if(Ce.__renderTarget=S,!pe.__hasExternalTextures){const de=Math.max(1,S.width>>ce),ue=Math.max(1,S.height>>ce);ie===i.TEXTURE_3D||ie===i.TEXTURE_2D_ARRAY?t.texImage3D(ie,ce,W,de,ue,S.depth,0,me,se,null):t.texImage2D(ie,ce,W,de,ue,0,me,se,null)}t.bindFramebuffer(i.FRAMEBUFFER,P),Ct(S)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,$,ie,Ce.__webglTexture,0,wt(S)):(ie===i.TEXTURE_2D||ie>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&ie<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,$,ie,Ce.__webglTexture,ce),t.bindFramebuffer(i.FRAMEBUFFER,null)}function je(P,S,H){if(i.bindRenderbuffer(i.RENDERBUFFER,P),S.depthBuffer){const $=S.depthTexture,ie=$&&$.isDepthTexture?$.type:null,ce=A(S.stencilBuffer,ie),me=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;Ct(S)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,wt(S),ce,S.width,S.height):H?i.renderbufferStorageMultisample(i.RENDERBUFFER,wt(S),ce,S.width,S.height):i.renderbufferStorage(i.RENDERBUFFER,ce,S.width,S.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,me,i.RENDERBUFFER,P)}else{const $=S.textures;for(let ie=0;ie<$.length;ie++){const ce=$[ie],me=r.convert(ce.format,ce.colorSpace),se=r.convert(ce.type),W=x(ce.internalFormat,me,se,ce.normalized,ce.colorSpace);Ct(S)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,wt(S),W,S.width,S.height):H?i.renderbufferStorageMultisample(i.RENDERBUFFER,wt(S),W,S.width,S.height):i.renderbufferStorage(i.RENDERBUFFER,W,S.width,S.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Ie(P,S,H){const $=S.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(i.FRAMEBUFFER,P),!(S.depthTexture&&S.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const ie=n.get(S.depthTexture);if(ie.__renderTarget=S,(!ie.__webglTexture||S.depthTexture.image.width!==S.width||S.depthTexture.image.height!==S.height)&&(S.depthTexture.image.width=S.width,S.depthTexture.image.height=S.height,S.depthTexture.needsUpdate=!0),$){if(ie.__webglInit===void 0&&(ie.__webglInit=!0,S.depthTexture.addEventListener("dispose",E)),ie.__webglTexture===void 0){ie.__webglTexture=i.createTexture(),t.bindTexture(i.TEXTURE_CUBE_MAP,ie.__webglTexture),q(i.TEXTURE_CUBE_MAP,S.depthTexture);const pe=r.convert(S.depthTexture.format),Ce=r.convert(S.depthTexture.type);let de;S.depthTexture.format===ki?de=i.DEPTH_COMPONENT24:S.depthTexture.format===ps&&(de=i.DEPTH24_STENCIL8);for(let ue=0;ue<6;ue++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ue,0,de,S.width,S.height,0,pe,Ce,null)}}else X(S.depthTexture,0);const ce=ie.__webglTexture,me=wt(S),se=$?i.TEXTURE_CUBE_MAP_POSITIVE_X+H:i.TEXTURE_2D,W=S.depthTexture.format===ps?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(S.depthTexture.format===ki)Ct(S)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,W,se,ce,0,me):i.framebufferTexture2D(i.FRAMEBUFFER,W,se,ce,0);else if(S.depthTexture.format===ps)Ct(S)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,W,se,ce,0,me):i.framebufferTexture2D(i.FRAMEBUFFER,W,se,ce,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function nt(P){const S=n.get(P),H=P.isWebGLCubeRenderTarget===!0;if(S.__boundDepthTexture!==P.depthTexture){const $=P.depthTexture;if(S.__depthDisposeCallback&&S.__depthDisposeCallback(),$){const ie=()=>{delete S.__boundDepthTexture,delete S.__depthDisposeCallback,$.removeEventListener("dispose",ie)};$.addEventListener("dispose",ie),S.__depthDisposeCallback=ie}S.__boundDepthTexture=$}if(P.depthTexture&&!S.__autoAllocateDepthBuffer)if(H)for(let $=0;$<6;$++)Ie(S.__webglFramebuffer[$],P,$);else{const $=P.texture.mipmaps;$&&$.length>0?Ie(S.__webglFramebuffer[0],P,0):Ie(S.__webglFramebuffer,P,0)}else if(H){S.__webglDepthbuffer=[];for(let $=0;$<6;$++)if(t.bindFramebuffer(i.FRAMEBUFFER,S.__webglFramebuffer[$]),S.__webglDepthbuffer[$]===void 0)S.__webglDepthbuffer[$]=i.createRenderbuffer(),je(S.__webglDepthbuffer[$],P,!1);else{const ie=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,ce=S.__webglDepthbuffer[$];i.bindRenderbuffer(i.RENDERBUFFER,ce),i.framebufferRenderbuffer(i.FRAMEBUFFER,ie,i.RENDERBUFFER,ce)}}else{const $=P.texture.mipmaps;if($&&$.length>0?t.bindFramebuffer(i.FRAMEBUFFER,S.__webglFramebuffer[0]):t.bindFramebuffer(i.FRAMEBUFFER,S.__webglFramebuffer),S.__webglDepthbuffer===void 0)S.__webglDepthbuffer=i.createRenderbuffer(),je(S.__webglDepthbuffer,P,!1);else{const ie=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,ce=S.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,ce),i.framebufferRenderbuffer(i.FRAMEBUFFER,ie,i.RENDERBUFFER,ce)}}t.bindFramebuffer(i.FRAMEBUFFER,null)}function Ge(P,S,H){const $=n.get(P);S!==void 0&&Se($.__webglFramebuffer,P,P.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),H!==void 0&&nt(P)}function $e(P){const S=P.texture,H=n.get(P),$=n.get(S);P.addEventListener("dispose",g);const ie=P.textures,ce=P.isWebGLCubeRenderTarget===!0,me=ie.length>1;if(me||($.__webglTexture===void 0&&($.__webglTexture=i.createTexture()),$.__version=S.version,a.memory.textures++),ce){H.__webglFramebuffer=[];for(let se=0;se<6;se++)if(S.mipmaps&&S.mipmaps.length>0){H.__webglFramebuffer[se]=[];for(let W=0;W<S.mipmaps.length;W++)H.__webglFramebuffer[se][W]=i.createFramebuffer()}else H.__webglFramebuffer[se]=i.createFramebuffer()}else{if(S.mipmaps&&S.mipmaps.length>0){H.__webglFramebuffer=[];for(let se=0;se<S.mipmaps.length;se++)H.__webglFramebuffer[se]=i.createFramebuffer()}else H.__webglFramebuffer=i.createFramebuffer();if(me)for(let se=0,W=ie.length;se<W;se++){const pe=n.get(ie[se]);pe.__webglTexture===void 0&&(pe.__webglTexture=i.createTexture(),a.memory.textures++)}if(P.samples>0&&Ct(P)===!1){H.__webglMultisampledFramebuffer=i.createFramebuffer(),H.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,H.__webglMultisampledFramebuffer);for(let se=0;se<ie.length;se++){const W=ie[se];H.__webglColorRenderbuffer[se]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,H.__webglColorRenderbuffer[se]);const pe=r.convert(W.format,W.colorSpace),Ce=r.convert(W.type),de=x(W.internalFormat,pe,Ce,W.normalized,W.colorSpace,P.isXRRenderTarget===!0),ue=wt(P);i.renderbufferStorageMultisample(i.RENDERBUFFER,ue,de,P.width,P.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+se,i.RENDERBUFFER,H.__webglColorRenderbuffer[se])}i.bindRenderbuffer(i.RENDERBUFFER,null),P.depthBuffer&&(H.__webglDepthRenderbuffer=i.createRenderbuffer(),je(H.__webglDepthRenderbuffer,P,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(ce){t.bindTexture(i.TEXTURE_CUBE_MAP,$.__webglTexture),q(i.TEXTURE_CUBE_MAP,S);for(let se=0;se<6;se++)if(S.mipmaps&&S.mipmaps.length>0)for(let W=0;W<S.mipmaps.length;W++)Se(H.__webglFramebuffer[se][W],P,S,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+se,W);else Se(H.__webglFramebuffer[se],P,S,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+se,0);b(S)&&M(i.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(me){for(let se=0,W=ie.length;se<W;se++){const pe=ie[se],Ce=n.get(pe);let de=i.TEXTURE_2D;(P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(de=P.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(de,Ce.__webglTexture),q(de,pe),Se(H.__webglFramebuffer,P,pe,i.COLOR_ATTACHMENT0+se,de,0),b(pe)&&M(de)}t.unbindTexture()}else{let se=i.TEXTURE_2D;if((P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(se=P.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(se,$.__webglTexture),q(se,S),S.mipmaps&&S.mipmaps.length>0)for(let W=0;W<S.mipmaps.length;W++)Se(H.__webglFramebuffer[W],P,S,i.COLOR_ATTACHMENT0,se,W);else Se(H.__webglFramebuffer,P,S,i.COLOR_ATTACHMENT0,se,0);b(S)&&M(se),t.unbindTexture()}P.depthBuffer&&nt(P)}function dt(P){const S=P.textures;for(let H=0,$=S.length;H<$;H++){const ie=S[H];if(b(ie)){const ce=T(P),me=n.get(ie).__webglTexture;t.bindTexture(ce,me),M(ce),t.unbindTexture()}}}const ot=[],Mt=[];function Rt(P){if(P.samples>0){if(Ct(P)===!1){const S=P.textures,H=P.width,$=P.height;let ie=i.COLOR_BUFFER_BIT;const ce=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,me=n.get(P),se=S.length>1;if(se)for(let pe=0;pe<S.length;pe++)t.bindFramebuffer(i.FRAMEBUFFER,me.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+pe,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,me.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+pe,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,me.__webglMultisampledFramebuffer);const W=P.texture.mipmaps;W&&W.length>0?t.bindFramebuffer(i.DRAW_FRAMEBUFFER,me.__webglFramebuffer[0]):t.bindFramebuffer(i.DRAW_FRAMEBUFFER,me.__webglFramebuffer);for(let pe=0;pe<S.length;pe++){if(P.resolveDepthBuffer&&(P.depthBuffer&&(ie|=i.DEPTH_BUFFER_BIT),P.stencilBuffer&&P.resolveStencilBuffer&&(ie|=i.STENCIL_BUFFER_BIT)),se){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,me.__webglColorRenderbuffer[pe]);const Ce=n.get(S[pe]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,Ce,0)}i.blitFramebuffer(0,0,H,$,0,0,H,$,ie,i.NEAREST),l===!0&&(ot.length=0,Mt.length=0,ot.push(i.COLOR_ATTACHMENT0+pe),P.depthBuffer&&P.resolveDepthBuffer===!1&&(ot.push(ce),Mt.push(ce),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,Mt)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,ot))}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),se)for(let pe=0;pe<S.length;pe++){t.bindFramebuffer(i.FRAMEBUFFER,me.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+pe,i.RENDERBUFFER,me.__webglColorRenderbuffer[pe]);const Ce=n.get(S[pe]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,me.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+pe,i.TEXTURE_2D,Ce,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,me.__webglMultisampledFramebuffer)}else if(P.depthBuffer&&P.resolveDepthBuffer===!1&&l){const S=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[S])}}}function wt(P){return Math.min(s.maxSamples,P.samples)}function Ct(P){const S=n.get(P);return P.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&S.__useRenderToTexture!==!1}function O(P){const S=a.render.frame;u.get(P)!==S&&(u.set(P,S),P.update())}function Kt(P,S){const H=P.colorSpace,$=P.format,ie=P.type;return P.isCompressedTexture===!0||P.isVideoTexture===!0||H!==fo&&H!==Zi&&(rt.getTransfer(H)===pt?($!==Ln||ie!==_n)&&ze("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):ct("WebGLTextures: Unsupported texture color space:",H)),S}function ut(P){return typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement?(c.width=P.naturalWidth||P.width,c.height=P.naturalHeight||P.height):typeof VideoFrame<"u"&&P instanceof VideoFrame?(c.width=P.displayWidth,c.height=P.displayHeight):(c.width=P.width,c.height=P.height),c}this.allocateTextureUnit=V,this.resetTextureUnits=k,this.getTextureUnits=z,this.setTextureUnits=D,this.setTexture2D=X,this.setTexture2DArray=ee,this.setTexture3D=Y,this.setTextureCube=J,this.rebindTextures=Ge,this.setupRenderTarget=$e,this.updateRenderTargetMipmap=dt,this.updateMultisampleRenderTarget=Rt,this.setupDepthRenderbuffer=nt,this.setupFrameBufferTexture=Se,this.useMultisampledRTT=Ct,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function FS(i,e){function t(n,s=Zi){let r;const a=rt.getTransfer(s);if(n===_n)return i.UNSIGNED_BYTE;if(n===ih)return i.UNSIGNED_SHORT_4_4_4_4;if(n===sh)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Tf)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Af)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===wf)return i.BYTE;if(n===Ef)return i.SHORT;if(n===Or)return i.UNSIGNED_SHORT;if(n===nh)return i.INT;if(n===di)return i.UNSIGNED_INT;if(n===Yn)return i.FLOAT;if(n===Di)return i.HALF_FLOAT;if(n===Rf)return i.ALPHA;if(n===Cf)return i.RGB;if(n===Ln)return i.RGBA;if(n===ki)return i.DEPTH_COMPONENT;if(n===ps)return i.DEPTH_STENCIL;if(n===rh)return i.RED;if(n===ah)return i.RED_INTEGER;if(n===Ms)return i.RG;if(n===oh)return i.RG_INTEGER;if(n===lh)return i.RGBA_INTEGER;if(n===Xa||n===Ya||n===qa||n===$a)if(a===pt)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Xa)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Ya)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===qa)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===$a)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Xa)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Ya)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===qa)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===$a)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===ac||n===oc||n===lc||n===cc)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===ac)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===oc)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===lc)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===cc)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===hc||n===uc||n===dc||n===fc||n===pc||n===ho||n===mc)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===hc||n===uc)return a===pt?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===dc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===fc)return r.COMPRESSED_R11_EAC;if(n===pc)return r.COMPRESSED_SIGNED_R11_EAC;if(n===ho)return r.COMPRESSED_RG11_EAC;if(n===mc)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===gc||n===bc||n===vc||n===xc||n===Sc||n===_c||n===Mc||n===yc||n===wc||n===Ec||n===Tc||n===Ac||n===Rc||n===Cc)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===gc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===bc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===vc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===xc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Sc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===_c)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Mc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===yc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===wc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===Ec)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Tc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Ac)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Rc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Cc)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Pc||n===Lc||n===Ic)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===Pc)return a===pt?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Lc)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Ic)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Dc||n===kc||n===uo||n===Fc)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===Dc)return r.COMPRESSED_RED_RGTC1_EXT;if(n===kc)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===uo)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Fc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===zr?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:t}}const US=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,NS=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class OS{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const n=new Bf(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,n=new fi({vertexShader:US,fragmentShader:NS,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new ht(new Xr(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class zS extends ys{constructor(e,t){super();const n=this;let s=null,r=1,a=null,o="local-floor",l=1,c=null,u=null,d=null,h=null,f=null,m=null;const v=typeof XRWebGLBinding<"u",p=new OS,b={},M=t.getContextAttributes();let T=null,x=null;const A=[],y=[],E=new tt;let g=null;const _=new Pn;_.viewport=new At;const R=new Pn;R.viewport=new At;const C=[_,R],I=new Zg;let k=null,z=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(G){let ne=A[G];return ne===void 0&&(ne=new Vo,A[G]=ne),ne.getTargetRaySpace()},this.getControllerGrip=function(G){let ne=A[G];return ne===void 0&&(ne=new Vo,A[G]=ne),ne.getGripSpace()},this.getHand=function(G){let ne=A[G];return ne===void 0&&(ne=new Vo,A[G]=ne),ne.getHandSpace()};function D(G){const ne=y.indexOf(G.inputSource);if(ne===-1)return;const re=A[ne];re!==void 0&&(re.update(G.inputSource,G.frame,c||a),re.dispatchEvent({type:G.type,data:G.inputSource}))}function V(){s.removeEventListener("select",D),s.removeEventListener("selectstart",D),s.removeEventListener("selectend",D),s.removeEventListener("squeeze",D),s.removeEventListener("squeezestart",D),s.removeEventListener("squeezeend",D),s.removeEventListener("end",V),s.removeEventListener("inputsourceschange",L);for(let G=0;G<A.length;G++){const ne=y[G];ne!==null&&(y[G]=null,A[G].disconnect(ne))}k=null,z=null,p.reset();for(const G in b)delete b[G];e.setRenderTarget(T),f=null,h=null,d=null,s=null,x=null,q.stop(),n.isPresenting=!1,e.setPixelRatio(g),e.setSize(E.width,E.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(G){r=G,n.isPresenting===!0&&ze("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(G){o=G,n.isPresenting===!0&&ze("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(G){c=G},this.getBaseLayer=function(){return h!==null?h:f},this.getBinding=function(){return d===null&&v&&(d=new XRWebGLBinding(s,t)),d},this.getFrame=function(){return m},this.getSession=function(){return s},this.setSession=async function(G){if(s=G,s!==null){if(T=e.getRenderTarget(),s.addEventListener("select",D),s.addEventListener("selectstart",D),s.addEventListener("selectend",D),s.addEventListener("squeeze",D),s.addEventListener("squeezestart",D),s.addEventListener("squeezeend",D),s.addEventListener("end",V),s.addEventListener("inputsourceschange",L),M.xrCompatible!==!0&&await t.makeXRCompatible(),g=e.getPixelRatio(),e.getSize(E),v&&"createProjectionLayer"in XRWebGLBinding.prototype){let re=null,le=null,ve=null;M.depth&&(ve=M.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,re=M.stencil?ps:ki,le=M.stencil?zr:di);const Se={colorFormat:t.RGBA8,depthFormat:ve,scaleFactor:r};d=this.getBinding(),h=d.createProjectionLayer(Se),s.updateRenderState({layers:[h]}),e.setPixelRatio(1),e.setSize(h.textureWidth,h.textureHeight,!1),x=new hi(h.textureWidth,h.textureHeight,{format:Ln,type:_n,depthTexture:new rr(h.textureWidth,h.textureHeight,le,void 0,void 0,void 0,void 0,void 0,void 0,re),stencilBuffer:M.stencil,colorSpace:e.outputColorSpace,samples:M.antialias?4:0,resolveDepthBuffer:h.ignoreDepthValues===!1,resolveStencilBuffer:h.ignoreDepthValues===!1})}else{const re={antialias:M.antialias,alpha:!0,depth:M.depth,stencil:M.stencil,framebufferScaleFactor:r};f=new XRWebGLLayer(s,t,re),s.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),x=new hi(f.framebufferWidth,f.framebufferHeight,{format:Ln,type:_n,colorSpace:e.outputColorSpace,stencilBuffer:M.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}x.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await s.requestReferenceSpace(o),q.setContext(s),q.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function L(G){for(let ne=0;ne<G.removed.length;ne++){const re=G.removed[ne],le=y.indexOf(re);le>=0&&(y[le]=null,A[le].disconnect(re))}for(let ne=0;ne<G.added.length;ne++){const re=G.added[ne];let le=y.indexOf(re);if(le===-1){for(let Se=0;Se<A.length;Se++)if(Se>=y.length){y.push(re),le=Se;break}else if(y[Se]===null){y[Se]=re,le=Se;break}if(le===-1)break}const ve=A[le];ve&&ve.connect(re)}}const X=new F,ee=new F;function Y(G,ne,re){X.setFromMatrixPosition(ne.matrixWorld),ee.setFromMatrixPosition(re.matrixWorld);const le=X.distanceTo(ee),ve=ne.projectionMatrix.elements,Se=re.projectionMatrix.elements,je=ve[14]/(ve[10]-1),Ie=ve[14]/(ve[10]+1),nt=(ve[9]+1)/ve[5],Ge=(ve[9]-1)/ve[5],$e=(ve[8]-1)/ve[0],dt=(Se[8]+1)/Se[0],ot=je*$e,Mt=je*dt,Rt=le/(-$e+dt),wt=Rt*-$e;if(ne.matrixWorld.decompose(G.position,G.quaternion,G.scale),G.translateX(wt),G.translateZ(Rt),G.matrixWorld.compose(G.position,G.quaternion,G.scale),G.matrixWorldInverse.copy(G.matrixWorld).invert(),ve[10]===-1)G.projectionMatrix.copy(ne.projectionMatrix),G.projectionMatrixInverse.copy(ne.projectionMatrixInverse);else{const Ct=je+Rt,O=Ie+Rt,Kt=ot-wt,ut=Mt+(le-wt),P=nt*Ie/O*Ct,S=Ge*Ie/O*Ct;G.projectionMatrix.makePerspective(Kt,ut,P,S,Ct,O),G.projectionMatrixInverse.copy(G.projectionMatrix).invert()}}function J(G,ne){ne===null?G.matrixWorld.copy(G.matrix):G.matrixWorld.multiplyMatrices(ne.matrixWorld,G.matrix),G.matrixWorldInverse.copy(G.matrixWorld).invert()}this.updateCamera=function(G){if(s===null)return;let ne=G.near,re=G.far;p.texture!==null&&(p.depthNear>0&&(ne=p.depthNear),p.depthFar>0&&(re=p.depthFar)),I.near=R.near=_.near=ne,I.far=R.far=_.far=re,(k!==I.near||z!==I.far)&&(s.updateRenderState({depthNear:I.near,depthFar:I.far}),k=I.near,z=I.far),I.layers.mask=G.layers.mask|6,_.layers.mask=I.layers.mask&-5,R.layers.mask=I.layers.mask&-3;const le=G.parent,ve=I.cameras;J(I,le);for(let Se=0;Se<ve.length;Se++)J(ve[Se],le);ve.length===2?Y(I,_,R):I.projectionMatrix.copy(_.projectionMatrix),te(G,I,le)};function te(G,ne,re){re===null?G.matrix.copy(ne.matrixWorld):(G.matrix.copy(re.matrixWorld),G.matrix.invert(),G.matrix.multiply(ne.matrixWorld)),G.matrix.decompose(G.position,G.quaternion,G.scale),G.updateMatrixWorld(!0),G.projectionMatrix.copy(ne.projectionMatrix),G.projectionMatrixInverse.copy(ne.projectionMatrixInverse),G.isPerspectiveCamera&&(G.fov=Hr*2*Math.atan(1/G.projectionMatrix.elements[5]),G.zoom=1)}this.getCamera=function(){return I},this.getFoveation=function(){if(!(h===null&&f===null))return l},this.setFoveation=function(G){l=G,h!==null&&(h.fixedFoveation=G),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=G)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(I)},this.getCameraTexture=function(G){return b[G]};let Te=null;function Oe(G,ne){if(u=ne.getViewerPose(c||a),m=ne,u!==null){const re=u.views;f!==null&&(e.setRenderTargetFramebuffer(x,f.framebuffer),e.setRenderTarget(x));let le=!1;re.length!==I.cameras.length&&(I.cameras.length=0,le=!0);for(let Ie=0;Ie<re.length;Ie++){const nt=re[Ie];let Ge=null;if(f!==null)Ge=f.getViewport(nt);else{const dt=d.getViewSubImage(h,nt);Ge=dt.viewport,Ie===0&&(e.setRenderTargetTextures(x,dt.colorTexture,dt.depthStencilTexture),e.setRenderTarget(x))}let $e=C[Ie];$e===void 0&&($e=new Pn,$e.layers.enable(Ie),$e.viewport=new At,C[Ie]=$e),$e.matrix.fromArray(nt.transform.matrix),$e.matrix.decompose($e.position,$e.quaternion,$e.scale),$e.projectionMatrix.fromArray(nt.projectionMatrix),$e.projectionMatrixInverse.copy($e.projectionMatrix).invert(),$e.viewport.set(Ge.x,Ge.y,Ge.width,Ge.height),Ie===0&&(I.matrix.copy($e.matrix),I.matrix.decompose(I.position,I.quaternion,I.scale)),le===!0&&I.cameras.push($e)}const ve=s.enabledFeatures;if(ve&&ve.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&v){d=n.getBinding();const Ie=d.getDepthInformation(re[0]);Ie&&Ie.isValid&&Ie.texture&&p.init(Ie,s.renderState)}if(ve&&ve.includes("camera-access")&&v){e.state.unbindTexture(),d=n.getBinding();for(let Ie=0;Ie<re.length;Ie++){const nt=re[Ie].camera;if(nt){let Ge=b[nt];Ge||(Ge=new Bf,b[nt]=Ge);const $e=d.getCameraImage(nt);Ge.sourceTexture=$e}}}}for(let re=0;re<A.length;re++){const le=y[re],ve=A[re];le!==null&&ve!==void 0&&ve.update(le,ne,c||a)}Te&&Te(G,ne),ne.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ne}),m=null}const q=new Xf;q.setAnimationLoop(Oe),this.setAnimationLoop=function(G){Te=G},this.dispose=function(){}}}const BS=new at,Jf=new We;Jf.set(-1,0,0,0,1,0,0,0,1);function HS(i,e){function t(p,b){p.matrixAutoUpdate===!0&&p.updateMatrix(),b.value.copy(p.matrix)}function n(p,b){b.color.getRGB(p.fogColor.value,Hf(i)),b.isFog?(p.fogNear.value=b.near,p.fogFar.value=b.far):b.isFogExp2&&(p.fogDensity.value=b.density)}function s(p,b,M,T,x){b.isNodeMaterial?b.uniformsNeedUpdate=!1:b.isMeshBasicMaterial?r(p,b):b.isMeshLambertMaterial?(r(p,b),b.envMap&&(p.envMapIntensity.value=b.envMapIntensity)):b.isMeshToonMaterial?(r(p,b),d(p,b)):b.isMeshPhongMaterial?(r(p,b),u(p,b),b.envMap&&(p.envMapIntensity.value=b.envMapIntensity)):b.isMeshStandardMaterial?(r(p,b),h(p,b),b.isMeshPhysicalMaterial&&f(p,b,x)):b.isMeshMatcapMaterial?(r(p,b),m(p,b)):b.isMeshDepthMaterial?r(p,b):b.isMeshDistanceMaterial?(r(p,b),v(p,b)):b.isMeshNormalMaterial?r(p,b):b.isLineBasicMaterial?(a(p,b),b.isLineDashedMaterial&&o(p,b)):b.isPointsMaterial?l(p,b,M,T):b.isSpriteMaterial?c(p,b):b.isShadowMaterial?(p.color.value.copy(b.color),p.opacity.value=b.opacity):b.isShaderMaterial&&(b.uniformsNeedUpdate=!1)}function r(p,b){p.opacity.value=b.opacity,b.color&&p.diffuse.value.copy(b.color),b.emissive&&p.emissive.value.copy(b.emissive).multiplyScalar(b.emissiveIntensity),b.map&&(p.map.value=b.map,t(b.map,p.mapTransform)),b.alphaMap&&(p.alphaMap.value=b.alphaMap,t(b.alphaMap,p.alphaMapTransform)),b.bumpMap&&(p.bumpMap.value=b.bumpMap,t(b.bumpMap,p.bumpMapTransform),p.bumpScale.value=b.bumpScale,b.side===fn&&(p.bumpScale.value*=-1)),b.normalMap&&(p.normalMap.value=b.normalMap,t(b.normalMap,p.normalMapTransform),p.normalScale.value.copy(b.normalScale),b.side===fn&&p.normalScale.value.negate()),b.displacementMap&&(p.displacementMap.value=b.displacementMap,t(b.displacementMap,p.displacementMapTransform),p.displacementScale.value=b.displacementScale,p.displacementBias.value=b.displacementBias),b.emissiveMap&&(p.emissiveMap.value=b.emissiveMap,t(b.emissiveMap,p.emissiveMapTransform)),b.specularMap&&(p.specularMap.value=b.specularMap,t(b.specularMap,p.specularMapTransform)),b.alphaTest>0&&(p.alphaTest.value=b.alphaTest);const M=e.get(b),T=M.envMap,x=M.envMapRotation;T&&(p.envMap.value=T,p.envMapRotation.value.setFromMatrix4(BS.makeRotationFromEuler(x)).transpose(),T.isCubeTexture&&T.isRenderTargetTexture===!1&&p.envMapRotation.value.premultiply(Jf),p.reflectivity.value=b.reflectivity,p.ior.value=b.ior,p.refractionRatio.value=b.refractionRatio),b.lightMap&&(p.lightMap.value=b.lightMap,p.lightMapIntensity.value=b.lightMapIntensity,t(b.lightMap,p.lightMapTransform)),b.aoMap&&(p.aoMap.value=b.aoMap,p.aoMapIntensity.value=b.aoMapIntensity,t(b.aoMap,p.aoMapTransform))}function a(p,b){p.diffuse.value.copy(b.color),p.opacity.value=b.opacity,b.map&&(p.map.value=b.map,t(b.map,p.mapTransform))}function o(p,b){p.dashSize.value=b.dashSize,p.totalSize.value=b.dashSize+b.gapSize,p.scale.value=b.scale}function l(p,b,M,T){p.diffuse.value.copy(b.color),p.opacity.value=b.opacity,p.size.value=b.size*M,p.scale.value=T*.5,b.map&&(p.map.value=b.map,t(b.map,p.uvTransform)),b.alphaMap&&(p.alphaMap.value=b.alphaMap,t(b.alphaMap,p.alphaMapTransform)),b.alphaTest>0&&(p.alphaTest.value=b.alphaTest)}function c(p,b){p.diffuse.value.copy(b.color),p.opacity.value=b.opacity,p.rotation.value=b.rotation,b.map&&(p.map.value=b.map,t(b.map,p.mapTransform)),b.alphaMap&&(p.alphaMap.value=b.alphaMap,t(b.alphaMap,p.alphaMapTransform)),b.alphaTest>0&&(p.alphaTest.value=b.alphaTest)}function u(p,b){p.specular.value.copy(b.specular),p.shininess.value=Math.max(b.shininess,1e-4)}function d(p,b){b.gradientMap&&(p.gradientMap.value=b.gradientMap)}function h(p,b){p.metalness.value=b.metalness,b.metalnessMap&&(p.metalnessMap.value=b.metalnessMap,t(b.metalnessMap,p.metalnessMapTransform)),p.roughness.value=b.roughness,b.roughnessMap&&(p.roughnessMap.value=b.roughnessMap,t(b.roughnessMap,p.roughnessMapTransform)),b.envMap&&(p.envMapIntensity.value=b.envMapIntensity)}function f(p,b,M){p.ior.value=b.ior,b.sheen>0&&(p.sheenColor.value.copy(b.sheenColor).multiplyScalar(b.sheen),p.sheenRoughness.value=b.sheenRoughness,b.sheenColorMap&&(p.sheenColorMap.value=b.sheenColorMap,t(b.sheenColorMap,p.sheenColorMapTransform)),b.sheenRoughnessMap&&(p.sheenRoughnessMap.value=b.sheenRoughnessMap,t(b.sheenRoughnessMap,p.sheenRoughnessMapTransform))),b.clearcoat>0&&(p.clearcoat.value=b.clearcoat,p.clearcoatRoughness.value=b.clearcoatRoughness,b.clearcoatMap&&(p.clearcoatMap.value=b.clearcoatMap,t(b.clearcoatMap,p.clearcoatMapTransform)),b.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=b.clearcoatRoughnessMap,t(b.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),b.clearcoatNormalMap&&(p.clearcoatNormalMap.value=b.clearcoatNormalMap,t(b.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(b.clearcoatNormalScale),b.side===fn&&p.clearcoatNormalScale.value.negate())),b.dispersion>0&&(p.dispersion.value=b.dispersion),b.iridescence>0&&(p.iridescence.value=b.iridescence,p.iridescenceIOR.value=b.iridescenceIOR,p.iridescenceThicknessMinimum.value=b.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=b.iridescenceThicknessRange[1],b.iridescenceMap&&(p.iridescenceMap.value=b.iridescenceMap,t(b.iridescenceMap,p.iridescenceMapTransform)),b.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=b.iridescenceThicknessMap,t(b.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),b.transmission>0&&(p.transmission.value=b.transmission,p.transmissionSamplerMap.value=M.texture,p.transmissionSamplerSize.value.set(M.width,M.height),b.transmissionMap&&(p.transmissionMap.value=b.transmissionMap,t(b.transmissionMap,p.transmissionMapTransform)),p.thickness.value=b.thickness,b.thicknessMap&&(p.thicknessMap.value=b.thicknessMap,t(b.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=b.attenuationDistance,p.attenuationColor.value.copy(b.attenuationColor)),b.anisotropy>0&&(p.anisotropyVector.value.set(b.anisotropy*Math.cos(b.anisotropyRotation),b.anisotropy*Math.sin(b.anisotropyRotation)),b.anisotropyMap&&(p.anisotropyMap.value=b.anisotropyMap,t(b.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=b.specularIntensity,p.specularColor.value.copy(b.specularColor),b.specularColorMap&&(p.specularColorMap.value=b.specularColorMap,t(b.specularColorMap,p.specularColorMapTransform)),b.specularIntensityMap&&(p.specularIntensityMap.value=b.specularIntensityMap,t(b.specularIntensityMap,p.specularIntensityMapTransform))}function m(p,b){b.matcap&&(p.matcap.value=b.matcap)}function v(p,b){const M=e.get(b).light;p.referencePosition.value.setFromMatrixPosition(M.matrixWorld),p.nearDistance.value=M.shadow.camera.near,p.farDistance.value=M.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function GS(i,e,t,n){let s={},r={},a=[];const o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(x,A){const y=A.program;n.uniformBlockBinding(x,y)}function c(x,A){let y=s[x.id];y===void 0&&(p(x),y=u(x),s[x.id]=y,x.addEventListener("dispose",M));const E=A.program;n.updateUBOMapping(x,E);const g=e.render.frame;r[x.id]!==g&&(h(x),r[x.id]=g)}function u(x){const A=d();x.__bindingPointIndex=A;const y=i.createBuffer(),E=x.__size,g=x.usage;return i.bindBuffer(i.UNIFORM_BUFFER,y),i.bufferData(i.UNIFORM_BUFFER,E,g),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,A,y),y}function d(){for(let x=0;x<o;x++)if(a.indexOf(x)===-1)return a.push(x),x;return ct("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function h(x){const A=s[x.id],y=x.uniforms,E=x.__cache;i.bindBuffer(i.UNIFORM_BUFFER,A);for(let g=0,_=y.length;g<_;g++){const R=y[g];if(Array.isArray(R))for(let C=0,I=R.length;C<I;C++)f(R[C],g,C,E);else f(R,g,0,E)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function f(x,A,y,E){if(v(x,A,y,E)===!0){const g=x.__offset,_=x.value;if(Array.isArray(_)){let R=0;for(let C=0;C<_.length;C++){const I=_[C],k=b(I);m(I,x.__data,R),typeof I!="number"&&typeof I!="boolean"&&!I.isMatrix3&&!ArrayBuffer.isView(I)&&(R+=k.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(_,x.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,g,x.__data)}}function m(x,A,y){typeof x=="number"||typeof x=="boolean"?A[0]=x:x.isMatrix3?(A[0]=x.elements[0],A[1]=x.elements[1],A[2]=x.elements[2],A[3]=0,A[4]=x.elements[3],A[5]=x.elements[4],A[6]=x.elements[5],A[7]=0,A[8]=x.elements[6],A[9]=x.elements[7],A[10]=x.elements[8],A[11]=0):ArrayBuffer.isView(x)?A.set(new x.constructor(x.buffer,x.byteOffset,A.length)):x.toArray(A,y)}function v(x,A,y,E){const g=x.value,_=A+"_"+y;if(E[_]===void 0)return typeof g=="number"||typeof g=="boolean"?E[_]=g:ArrayBuffer.isView(g)?E[_]=g.slice():E[_]=g.clone(),!0;{const R=E[_];if(typeof g=="number"||typeof g=="boolean"){if(R!==g)return E[_]=g,!0}else{if(ArrayBuffer.isView(g))return!0;if(R.equals(g)===!1)return R.copy(g),!0}}return!1}function p(x){const A=x.uniforms;let y=0;const E=16;for(let _=0,R=A.length;_<R;_++){const C=Array.isArray(A[_])?A[_]:[A[_]];for(let I=0,k=C.length;I<k;I++){const z=C[I],D=Array.isArray(z.value)?z.value:[z.value];for(let V=0,L=D.length;V<L;V++){const X=D[V],ee=b(X),Y=y%E,J=Y%ee.boundary,te=Y+J;y+=J,te!==0&&E-te<ee.storage&&(y+=E-te),z.__data=new Float32Array(ee.storage/Float32Array.BYTES_PER_ELEMENT),z.__offset=y,y+=ee.storage}}}const g=y%E;return g>0&&(y+=E-g),x.__size=y,x.__cache={},this}function b(x){const A={boundary:0,storage:0};return typeof x=="number"||typeof x=="boolean"?(A.boundary=4,A.storage=4):x.isVector2?(A.boundary=8,A.storage=8):x.isVector3||x.isColor?(A.boundary=16,A.storage=12):x.isVector4?(A.boundary=16,A.storage=16):x.isMatrix3?(A.boundary=48,A.storage=48):x.isMatrix4?(A.boundary=64,A.storage=64):x.isTexture?ze("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(x)?(A.boundary=16,A.storage=x.byteLength):ze("WebGLRenderer: Unsupported uniform value type.",x),A}function M(x){const A=x.target;A.removeEventListener("dispose",M);const y=a.indexOf(A.__bindingPointIndex);a.splice(y,1),i.deleteBuffer(s[A.id]),delete s[A.id],delete r[A.id]}function T(){for(const x in s)i.deleteBuffer(s[x]);a=[],s={},r={}}return{bind:l,update:c,dispose:T}}const VS=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let jn=null;function WS(){return jn===null&&(jn=new ph(VS,16,16,Ms,Di),jn.name="DFG_LUT",jn.minFilter=Zt,jn.magFilter=Zt,jn.wrapS=ai,jn.wrapT=ai,jn.generateMipmaps=!1,jn.needsUpdate=!0),jn}class XS{constructor(e={}){const{canvas:t=qm(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:h=!1,outputBufferType:f=_n}=e;this.isWebGLRenderer=!0;let m;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=n.getContextAttributes().alpha}else m=a;const v=f,p=new Set([lh,oh,ah]),b=new Set([_n,di,Or,zr,ih,sh]),M=new Uint32Array(4),T=new Int32Array(4),x=new F;let A=null,y=null;const E=[],g=[];let _=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=ci,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const R=this;let C=!1,I=null,k=null,z=null,D=null;this._outputColorSpace=un;let V=0,L=0,X=null,ee=-1,Y=null;const J=new At,te=new At;let Te=null;const Oe=new Ve(0);let q=0,G=t.width,ne=t.height,re=1,le=null,ve=null;const Se=new At(0,0,G,ne),je=new At(0,0,G,ne);let Ie=!1;const nt=new mh;let Ge=!1,$e=!1;const dt=new at,ot=new F,Mt=new At,Rt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let wt=!1;function Ct(){return X===null?re:1}let O=n;function Kt(w,B){return t.getContext(w,B)}try{const w={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:u,failIfMajorPerformanceCaveat:d};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${eh}`),t.addEventListener("webglcontextlost",Pt,!1),t.addEventListener("webglcontextrestored",xt,!1),t.addEventListener("webglcontextcreationerror",Zn,!1),O===null){const B="webgl2";if(O=Kt(B,w),O===null)throw Kt(B)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(w){throw ct("WebGLRenderer: "+w.message),w}let ut,P,S,H,$,ie,ce,me,se,W,pe,Ce,de,ue,De,Ne,He,U,ge,ae,be,ye,oe;function ke(){ut=new Wv(O),ut.init(),be=new FS(O,ut),P=new Uv(O,ut,e,be),S=new DS(O,ut),P.reversedDepthBuffer&&h&&S.buffers.depth.setReversed(!0),k=O.createFramebuffer(),z=O.createFramebuffer(),D=O.createFramebuffer(),H=new qv(O),$=new xS,ie=new kS(O,ut,S,$,P,be,H),ce=new Vv(R),me=new Qg(O),ye=new kv(O,me),se=new Xv(O,me,H,ye),W=new Zv(O,se,me,ye,H),U=new $v(O,P,ie),De=new Nv($),pe=new vS(R,ce,ut,P,ye,De),Ce=new HS(R,$),de=new _S,ue=new AS(ut),He=new Dv(R,ce,S,W,m,l),Ne=new IS(R,W,P),oe=new GS(O,H,P,S),ge=new Fv(O,ut,H),ae=new Yv(O,ut,H),H.programs=pe.programs,R.capabilities=P,R.extensions=ut,R.properties=$,R.renderLists=de,R.shadowMap=Ne,R.state=S,R.info=H}ke(),v!==_n&&(_=new Qv(v,t.width,t.height,o,s,r));const Pe=new zS(R,O);this.xr=Pe,this.getContext=function(){return O},this.getContextAttributes=function(){return O.getContextAttributes()},this.forceContextLoss=function(){const w=ut.get("WEBGL_lose_context");w&&w.loseContext()},this.forceContextRestore=function(){const w=ut.get("WEBGL_lose_context");w&&w.restoreContext()},this.getPixelRatio=function(){return re},this.setPixelRatio=function(w){w!==void 0&&(re=w,this.setSize(G,ne,!1))},this.getSize=function(w){return w.set(G,ne)},this.setSize=function(w,B,Q=!0){if(Pe.isPresenting){ze("WebGLRenderer: Can't change size while VR device is presenting.");return}G=w,ne=B,t.width=Math.floor(w*re),t.height=Math.floor(B*re),Q===!0&&(t.style.width=w+"px",t.style.height=B+"px"),_!==null&&_.setSize(t.width,t.height),this.setViewport(0,0,w,B)},this.getDrawingBufferSize=function(w){return w.set(G*re,ne*re).floor()},this.setDrawingBufferSize=function(w,B,Q){G=w,ne=B,re=Q,t.width=Math.floor(w*Q),t.height=Math.floor(B*Q),this.setViewport(0,0,w,B)},this.setEffects=function(w){if(v===_n){ct("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(w){for(let B=0;B<w.length;B++)if(w[B].isOutputPass===!0){ze("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}_.setEffects(w||[])},this.getCurrentViewport=function(w){return w.copy(J)},this.getViewport=function(w){return w.copy(Se)},this.setViewport=function(w,B,Q,Z){w.isVector4?Se.set(w.x,w.y,w.z,w.w):Se.set(w,B,Q,Z),S.viewport(J.copy(Se).multiplyScalar(re).round())},this.getScissor=function(w){return w.copy(je)},this.setScissor=function(w,B,Q,Z){w.isVector4?je.set(w.x,w.y,w.z,w.w):je.set(w,B,Q,Z),S.scissor(te.copy(je).multiplyScalar(re).round())},this.getScissorTest=function(){return Ie},this.setScissorTest=function(w){S.setScissorTest(Ie=w)},this.setOpaqueSort=function(w){le=w},this.setTransparentSort=function(w){ve=w},this.getClearColor=function(w){return w.copy(He.getClearColor())},this.setClearColor=function(){He.setClearColor(...arguments)},this.getClearAlpha=function(){return He.getClearAlpha()},this.setClearAlpha=function(){He.setClearAlpha(...arguments)},this.clear=function(w=!0,B=!0,Q=!0){let Z=0;if(w){let K=!1;if(X!==null){const Me=X.texture.format;K=p.has(Me)}if(K){const Me=X.texture.type,Re=b.has(Me),_e=He.getClearColor(),Le=He.getClearAlpha(),Fe=_e.r,Ye=_e.g,et=_e.b;Re?(M[0]=Fe,M[1]=Ye,M[2]=et,M[3]=Le,O.clearBufferuiv(O.COLOR,0,M)):(T[0]=Fe,T[1]=Ye,T[2]=et,T[3]=Le,O.clearBufferiv(O.COLOR,0,T))}else Z|=O.COLOR_BUFFER_BIT}B&&(Z|=O.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),Q&&(Z|=O.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),Z!==0&&O.clear(Z)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(w){w.setRenderer(this),I=w},this.dispose=function(){t.removeEventListener("webglcontextlost",Pt,!1),t.removeEventListener("webglcontextrestored",xt,!1),t.removeEventListener("webglcontextcreationerror",Zn,!1),He.dispose(),de.dispose(),ue.dispose(),$.dispose(),ce.dispose(),W.dispose(),ye.dispose(),oe.dispose(),pe.dispose(),Pe.dispose(),Pe.removeEventListener("sessionstart",Dh),Pe.removeEventListener("sessionend",kh),is.stop()};function Pt(w){w.preventDefault(),Kh("WebGLRenderer: Context Lost."),C=!0}function xt(){Kh("WebGLRenderer: Context Restored."),C=!1;const w=H.autoReset,B=Ne.enabled,Q=Ne.autoUpdate,Z=Ne.needsUpdate,K=Ne.type;ke(),H.autoReset=w,Ne.enabled=B,Ne.autoUpdate=Q,Ne.needsUpdate=Z,Ne.type=K}function Zn(w){ct("WebGLRenderer: A WebGL context could not be created. Reason: ",w.statusMessage)}function Kn(w){const B=w.target;B.removeEventListener("dispose",Kn),om(B)}function om(w){lm(w),$.remove(w)}function lm(w){const B=$.get(w).programs;B!==void 0&&(B.forEach(function(Q){pe.releaseProgram(Q)}),w.isShaderMaterial&&pe.releaseShaderCache(w))}this.renderBufferDirect=function(w,B,Q,Z,K,Me){B===null&&(B=Rt);const Re=K.isMesh&&K.matrixWorld.determinantAffine()<0,_e=um(w,B,Q,Z,K);S.setMaterial(Z,Re);let Le=Q.index,Fe=1;if(Z.wireframe===!0){if(Le=se.getWireframeAttribute(Q),Le===void 0)return;Fe=2}const Ye=Q.drawRange,et=Q.attributes.position;let Ue=Ye.start*Fe,mt=(Ye.start+Ye.count)*Fe;Me!==null&&(Ue=Math.max(Ue,Me.start*Fe),mt=Math.min(mt,(Me.start+Me.count)*Fe)),Le!==null?(Ue=Math.max(Ue,0),mt=Math.min(mt,Le.count)):et!=null&&(Ue=Math.max(Ue,0),mt=Math.min(mt,et.count));const Nt=mt-Ue;if(Nt<0||Nt===1/0)return;ye.setup(K,Z,_e,Q,Le);let Lt,bt=ge;if(Le!==null&&(Lt=me.get(Le),bt=ae,bt.setIndex(Lt)),K.isMesh)Z.wireframe===!0?(S.setLineWidth(Z.wireframeLinewidth*Ct()),bt.setMode(O.LINES)):bt.setMode(O.TRIANGLES);else if(K.isLine){let Qt=Z.linewidth;Qt===void 0&&(Qt=1),S.setLineWidth(Qt*Ct()),K.isLineSegments?bt.setMode(O.LINES):K.isLineLoop?bt.setMode(O.LINE_LOOP):bt.setMode(O.LINE_STRIP)}else K.isPoints?bt.setMode(O.POINTS):K.isSprite&&bt.setMode(O.TRIANGLES);if(K.isBatchedMesh)if(ut.get("WEBGL_multi_draw"))bt.renderMultiDraw(K._multiDrawStarts,K._multiDrawCounts,K._multiDrawCount);else{const Qt=K._multiDrawStarts,Ae=K._multiDrawCounts,mn=K._multiDrawCount,lt=Le?me.get(Le).bytesPerElement:1,Tn=$.get(Z).currentProgram.getUniforms();for(let Qn=0;Qn<mn;Qn++)Tn.setValue(O,"_gl_DrawID",Qn),bt.render(Qt[Qn]/lt,Ae[Qn])}else if(K.isInstancedMesh)bt.renderInstances(Ue,Nt,K.count);else if(Q.isInstancedBufferGeometry){const Qt=Q._maxInstanceCount!==void 0?Q._maxInstanceCount:1/0,Ae=Math.min(Q.instanceCount,Qt);bt.renderInstances(Ue,Nt,Ae)}else bt.render(Ue,Nt)};function Ih(w,B,Q){w.transparent===!0&&w.side===Ti&&w.forceSinglePass===!1?(w.side=fn,w.needsUpdate=!0,Zr(w,B,Q),w.side=ts,w.needsUpdate=!0,Zr(w,B,Q),w.side=Ti):Zr(w,B,Q)}this.compile=function(w,B,Q=null){Q===null&&(Q=w),y=ue.get(Q),y.init(B),g.push(y),Q.traverseVisible(function(K){K.isLight&&K.layers.test(B.layers)&&(y.pushLight(K),K.castShadow&&y.pushShadow(K))}),w!==Q&&w.traverseVisible(function(K){K.isLight&&K.layers.test(B.layers)&&(y.pushLight(K),K.castShadow&&y.pushShadow(K))}),y.setupLights();const Z=new Set;return w.traverse(function(K){if(!(K.isMesh||K.isPoints||K.isLine||K.isSprite))return;const Me=K.material;if(Me)if(Array.isArray(Me))for(let Re=0;Re<Me.length;Re++){const _e=Me[Re];Ih(_e,Q,K),Z.add(_e)}else Ih(Me,Q,K),Z.add(Me)}),y=g.pop(),Z},this.compileAsync=function(w,B,Q=null){const Z=this.compile(w,B,Q);return new Promise(K=>{function Me(){if(Z.forEach(function(Re){$.get(Re).currentProgram.isReady()&&Z.delete(Re)}),Z.size===0){K(w);return}setTimeout(Me,10)}ut.get("KHR_parallel_shader_compile")!==null?Me():setTimeout(Me,10)})};let ko=null;function cm(w){ko&&ko(w)}function Dh(){is.stop()}function kh(){is.start()}const is=new Xf;is.setAnimationLoop(cm),typeof self<"u"&&is.setContext(self),this.setAnimationLoop=function(w){ko=w,Pe.setAnimationLoop(w),w===null?is.stop():is.start()},Pe.addEventListener("sessionstart",Dh),Pe.addEventListener("sessionend",kh),this.render=function(w,B){if(B!==void 0&&B.isCamera!==!0){ct("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(C===!0)return;I!==null&&I.renderStart(w,B);const Q=Pe.enabled===!0&&Pe.isPresenting===!0,Z=_!==null&&(X===null||Q)&&_.begin(R,X);if(w.matrixWorldAutoUpdate===!0&&w.updateMatrixWorld(),B.parent===null&&B.matrixWorldAutoUpdate===!0&&B.updateMatrixWorld(),Pe.enabled===!0&&Pe.isPresenting===!0&&(_===null||_.isCompositing()===!1)&&(Pe.cameraAutoUpdate===!0&&Pe.updateCamera(B),B=Pe.getCamera()),w.isScene===!0&&w.onBeforeRender(R,w,B,X),y=ue.get(w,g.length),y.init(B),y.state.textureUnits=ie.getTextureUnits(),g.push(y),dt.multiplyMatrices(B.projectionMatrix,B.matrixWorldInverse),nt.setFromProjectionMatrix(dt,oi,B.reversedDepth),$e=this.localClippingEnabled,Ge=De.init(this.clippingPlanes,$e),A=de.get(w,E.length),A.init(),E.push(A),Pe.enabled===!0&&Pe.isPresenting===!0){const Re=R.xr.getDepthSensingMesh();Re!==null&&Fo(Re,B,-1/0,R.sortObjects)}Fo(w,B,0,R.sortObjects),A.finish(),R.sortObjects===!0&&A.sort(le,ve,B.reversedDepth),wt=Pe.enabled===!1||Pe.isPresenting===!1||Pe.hasDepthSensing()===!1,wt&&He.addToRenderList(A,w),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Ge===!0&&De.beginShadows();const K=y.state.shadowsArray;if(Ne.render(K,w,B),Ge===!0&&De.endShadows(),(Z&&_.hasRenderPass())===!1){const Re=A.opaque,_e=A.transmissive;if(y.setupLights(),B.isArrayCamera){const Le=B.cameras;if(_e.length>0)for(let Fe=0,Ye=Le.length;Fe<Ye;Fe++){const et=Le[Fe];Uh(Re,_e,w,et)}wt&&He.render(w);for(let Fe=0,Ye=Le.length;Fe<Ye;Fe++){const et=Le[Fe];Fh(A,w,et,et.viewport)}}else _e.length>0&&Uh(Re,_e,w,B),wt&&He.render(w),Fh(A,w,B)}X!==null&&L===0&&(ie.updateMultisampleRenderTarget(X),ie.updateRenderTargetMipmap(X)),Z&&_.end(R),w.isScene===!0&&w.onAfterRender(R,w,B),ye.resetDefaultState(),ee=-1,Y=null,g.pop(),g.length>0?(y=g[g.length-1],ie.setTextureUnits(y.state.textureUnits),Ge===!0&&De.setGlobalState(R.clippingPlanes,y.state.camera)):y=null,E.pop(),E.length>0?A=E[E.length-1]:A=null,I!==null&&I.renderEnd()};function Fo(w,B,Q,Z){if(w.visible===!1)return;if(w.layers.test(B.layers)){if(w.isGroup)Q=w.renderOrder;else if(w.isLOD)w.autoUpdate===!0&&w.update(B);else if(w.isLightProbeGrid)y.pushLightProbeGrid(w);else if(w.isLight)y.pushLight(w),w.castShadow&&y.pushShadow(w);else if(w.isSprite){if(!w.frustumCulled||nt.intersectsSprite(w)){Z&&Mt.setFromMatrixPosition(w.matrixWorld).applyMatrix4(dt);const Re=W.update(w),_e=w.material;_e.visible&&A.push(w,Re,_e,Q,Mt.z,null)}}else if((w.isMesh||w.isLine||w.isPoints)&&(!w.frustumCulled||nt.intersectsObject(w))){const Re=W.update(w),_e=w.material;if(Z&&(w.boundingSphere!==void 0?(w.boundingSphere===null&&w.computeBoundingSphere(),Mt.copy(w.boundingSphere.center)):(Re.boundingSphere===null&&Re.computeBoundingSphere(),Mt.copy(Re.boundingSphere.center)),Mt.applyMatrix4(w.matrixWorld).applyMatrix4(dt)),Array.isArray(_e)){const Le=Re.groups;for(let Fe=0,Ye=Le.length;Fe<Ye;Fe++){const et=Le[Fe],Ue=_e[et.materialIndex];Ue&&Ue.visible&&A.push(w,Re,Ue,Q,Mt.z,et)}}else _e.visible&&A.push(w,Re,_e,Q,Mt.z,null)}}const Me=w.children;for(let Re=0,_e=Me.length;Re<_e;Re++)Fo(Me[Re],B,Q,Z)}function Fh(w,B,Q,Z){const{opaque:K,transmissive:Me,transparent:Re}=w;y.setupLightsView(Q),Ge===!0&&De.setGlobalState(R.clippingPlanes,Q),Z&&S.viewport(J.copy(Z)),K.length>0&&$r(K,B,Q),Me.length>0&&$r(Me,B,Q),Re.length>0&&$r(Re,B,Q),S.buffers.depth.setTest(!0),S.buffers.depth.setMask(!0),S.buffers.color.setMask(!0),S.setPolygonOffset(!1)}function Uh(w,B,Q,Z){if((Q.isScene===!0?Q.overrideMaterial:null)!==null)return;if(y.state.transmissionRenderTarget[Z.id]===void 0){const Ue=ut.has("EXT_color_buffer_half_float")||ut.has("EXT_color_buffer_float");y.state.transmissionRenderTarget[Z.id]=new hi(1,1,{generateMipmaps:!0,type:Ue?Di:_n,minFilter:Ki,samples:Math.max(4,P.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:rt.workingColorSpace})}const Me=y.state.transmissionRenderTarget[Z.id],Re=Z.viewport||J;Me.setSize(Re.z*R.transmissionResolutionScale,Re.w*R.transmissionResolutionScale);const _e=R.getRenderTarget(),Le=R.getActiveCubeFace(),Fe=R.getActiveMipmapLevel();R.setRenderTarget(Me),R.getClearColor(Oe),q=R.getClearAlpha(),q<1&&R.setClearColor(16777215,.5),R.clear(),wt&&He.render(Q);const Ye=R.toneMapping;R.toneMapping=ci;const et=Z.viewport;if(Z.viewport!==void 0&&(Z.viewport=void 0),y.setupLightsView(Z),Ge===!0&&De.setGlobalState(R.clippingPlanes,Z),$r(w,Q,Z),ie.updateMultisampleRenderTarget(Me),ie.updateRenderTargetMipmap(Me),ut.has("WEBGL_multisampled_render_to_texture")===!1){let Ue=!1;for(let mt=0,Nt=B.length;mt<Nt;mt++){const Lt=B[mt],{object:bt,geometry:Qt,material:Ae,group:mn}=Lt;if(Ae.side===Ti&&bt.layers.test(Z.layers)){const lt=Ae.side;Ae.side=fn,Ae.needsUpdate=!0,Nh(bt,Q,Z,Qt,Ae,mn),Ae.side=lt,Ae.needsUpdate=!0,Ue=!0}}Ue===!0&&(ie.updateMultisampleRenderTarget(Me),ie.updateRenderTargetMipmap(Me))}R.setRenderTarget(_e,Le,Fe),R.setClearColor(Oe,q),et!==void 0&&(Z.viewport=et),R.toneMapping=Ye}function $r(w,B,Q){const Z=B.isScene===!0?B.overrideMaterial:null;for(let K=0,Me=w.length;K<Me;K++){const Re=w[K],{object:_e,geometry:Le,group:Fe}=Re;let Ye=Re.material;Ye.allowOverride===!0&&Z!==null&&(Ye=Z),_e.layers.test(Q.layers)&&Nh(_e,B,Q,Le,Ye,Fe)}}function Nh(w,B,Q,Z,K,Me){w.onBeforeRender(R,B,Q,Z,K,Me),w.modelViewMatrix.multiplyMatrices(Q.matrixWorldInverse,w.matrixWorld),w.normalMatrix.getNormalMatrix(w.modelViewMatrix),K.onBeforeRender(R,B,Q,Z,w,Me),K.transparent===!0&&K.side===Ti&&K.forceSinglePass===!1?(K.side=fn,K.needsUpdate=!0,R.renderBufferDirect(Q,B,Z,K,w,Me),K.side=ts,K.needsUpdate=!0,R.renderBufferDirect(Q,B,Z,K,w,Me),K.side=Ti):R.renderBufferDirect(Q,B,Z,K,w,Me),w.onAfterRender(R,B,Q,Z,K,Me)}function Zr(w,B,Q){B.isScene!==!0&&(B=Rt);const Z=$.get(w),K=y.state.lights,Me=y.state.shadowsArray,Re=K.state.version,_e=pe.getParameters(w,K.state,Me,B,Q,y.state.lightProbeGridArray),Le=pe.getProgramCacheKey(_e);let Fe=Z.programs;Z.environment=w.isMeshStandardMaterial||w.isMeshLambertMaterial||w.isMeshPhongMaterial?B.environment:null,Z.fog=B.fog;const Ye=w.isMeshStandardMaterial||w.isMeshLambertMaterial&&!w.envMap||w.isMeshPhongMaterial&&!w.envMap;Z.envMap=ce.get(w.envMap||Z.environment,Ye),Z.envMapRotation=Z.environment!==null&&w.envMap===null?B.environmentRotation:w.envMapRotation,Fe===void 0&&(w.addEventListener("dispose",Kn),Fe=new Map,Z.programs=Fe);let et=Fe.get(Le);if(et!==void 0){if(Z.currentProgram===et&&Z.lightsStateVersion===Re)return zh(w,_e),et}else _e.uniforms=pe.getUniforms(w),I!==null&&w.isNodeMaterial&&I.build(w,Q,_e),w.onBeforeCompile(_e,R),et=pe.acquireProgram(_e,Le),Fe.set(Le,et),Z.uniforms=_e.uniforms;const Ue=Z.uniforms;return(!w.isShaderMaterial&&!w.isRawShaderMaterial||w.clipping===!0)&&(Ue.clippingPlanes=De.uniform),zh(w,_e),Z.needsLights=fm(w),Z.lightsStateVersion=Re,Z.needsLights&&(Ue.ambientLightColor.value=K.state.ambient,Ue.lightProbe.value=K.state.probe,Ue.directionalLights.value=K.state.directional,Ue.directionalLightShadows.value=K.state.directionalShadow,Ue.spotLights.value=K.state.spot,Ue.spotLightShadows.value=K.state.spotShadow,Ue.rectAreaLights.value=K.state.rectArea,Ue.ltc_1.value=K.state.rectAreaLTC1,Ue.ltc_2.value=K.state.rectAreaLTC2,Ue.pointLights.value=K.state.point,Ue.pointLightShadows.value=K.state.pointShadow,Ue.hemisphereLights.value=K.state.hemi,Ue.directionalShadowMatrix.value=K.state.directionalShadowMatrix,Ue.spotLightMatrix.value=K.state.spotLightMatrix,Ue.spotLightMap.value=K.state.spotLightMap,Ue.pointShadowMatrix.value=K.state.pointShadowMatrix),Z.lightProbeGrid=y.state.lightProbeGridArray.length>0,Z.currentProgram=et,Z.uniformsList=null,et}function Oh(w){if(w.uniformsList===null){const B=w.currentProgram.getUniforms();w.uniformsList=Za.seqWithValue(B.seq,w.uniforms)}return w.uniformsList}function zh(w,B){const Q=$.get(w);Q.outputColorSpace=B.outputColorSpace,Q.batching=B.batching,Q.batchingColor=B.batchingColor,Q.instancing=B.instancing,Q.instancingColor=B.instancingColor,Q.instancingMorph=B.instancingMorph,Q.skinning=B.skinning,Q.morphTargets=B.morphTargets,Q.morphNormals=B.morphNormals,Q.morphColors=B.morphColors,Q.morphTargetsCount=B.morphTargetsCount,Q.numClippingPlanes=B.numClippingPlanes,Q.numIntersection=B.numClipIntersection,Q.vertexAlphas=B.vertexAlphas,Q.vertexTangents=B.vertexTangents,Q.toneMapping=B.toneMapping}function hm(w,B){if(w.length===0)return null;if(w.length===1)return w[0].texture!==null?w[0]:null;x.setFromMatrixPosition(B.matrixWorld);for(let Q=0,Z=w.length;Q<Z;Q++){const K=w[Q];if(K.texture!==null&&K.boundingBox.containsPoint(x))return K}return null}function um(w,B,Q,Z,K){B.isScene!==!0&&(B=Rt),ie.resetTextureUnits();const Me=B.fog,Re=Z.isMeshStandardMaterial||Z.isMeshLambertMaterial||Z.isMeshPhongMaterial?B.environment:null,_e=X===null?R.outputColorSpace:X.isXRRenderTarget===!0?X.texture.colorSpace:rt.workingColorSpace,Le=Z.isMeshStandardMaterial||Z.isMeshLambertMaterial&&!Z.envMap||Z.isMeshPhongMaterial&&!Z.envMap,Fe=ce.get(Z.envMap||Re,Le),Ye=Z.vertexColors===!0&&!!Q.attributes.color&&Q.attributes.color.itemSize===4,et=!!Q.attributes.tangent&&(!!Z.normalMap||Z.anisotropy>0),Ue=!!Q.morphAttributes.position,mt=!!Q.morphAttributes.normal,Nt=!!Q.morphAttributes.color;let Lt=ci;Z.toneMapped&&(X===null||X.isXRRenderTarget===!0)&&(Lt=R.toneMapping);const bt=Q.morphAttributes.position||Q.morphAttributes.normal||Q.morphAttributes.color,Qt=bt!==void 0?bt.length:0,Ae=$.get(Z),mn=y.state.lights;if(Ge===!0&&($e===!0||w!==Y)){const St=w===Y&&Z.id===ee;De.setState(Z,w,St)}let lt=!1;Z.version===Ae.__version?(Ae.needsLights&&Ae.lightsStateVersion!==mn.state.version||Ae.outputColorSpace!==_e||K.isBatchedMesh&&Ae.batching===!1||!K.isBatchedMesh&&Ae.batching===!0||K.isBatchedMesh&&Ae.batchingColor===!0&&K.colorTexture===null||K.isBatchedMesh&&Ae.batchingColor===!1&&K.colorTexture!==null||K.isInstancedMesh&&Ae.instancing===!1||!K.isInstancedMesh&&Ae.instancing===!0||K.isSkinnedMesh&&Ae.skinning===!1||!K.isSkinnedMesh&&Ae.skinning===!0||K.isInstancedMesh&&Ae.instancingColor===!0&&K.instanceColor===null||K.isInstancedMesh&&Ae.instancingColor===!1&&K.instanceColor!==null||K.isInstancedMesh&&Ae.instancingMorph===!0&&K.morphTexture===null||K.isInstancedMesh&&Ae.instancingMorph===!1&&K.morphTexture!==null||Ae.envMap!==Fe||Z.fog===!0&&Ae.fog!==Me||Ae.numClippingPlanes!==void 0&&(Ae.numClippingPlanes!==De.numPlanes||Ae.numIntersection!==De.numIntersection)||Ae.vertexAlphas!==Ye||Ae.vertexTangents!==et||Ae.morphTargets!==Ue||Ae.morphNormals!==mt||Ae.morphColors!==Nt||Ae.toneMapping!==Lt||Ae.morphTargetsCount!==Qt||!!Ae.lightProbeGrid!=y.state.lightProbeGridArray.length>0)&&(lt=!0):(lt=!0,Ae.__version=Z.version);let Tn=Ae.currentProgram;lt===!0&&(Tn=Zr(Z,B,K),I&&Z.isNodeMaterial&&I.onUpdateProgram(Z,Tn,Ae));let Qn=!1,Ui=!1,As=!1;const vt=Tn.getUniforms(),Ot=Ae.uniforms;if(S.useProgram(Tn.program)&&(Qn=!0,Ui=!0,As=!0),Z.id!==ee&&(ee=Z.id,Ui=!0),Ae.needsLights){const St=hm(y.state.lightProbeGridArray,K);Ae.lightProbeGrid!==St&&(Ae.lightProbeGrid=St,Ui=!0)}if(Qn||Y!==w){S.buffers.depth.getReversed()&&w.reversedDepth!==!0&&(w._reversedDepth=!0,w.updateProjectionMatrix()),vt.setValue(O,"projectionMatrix",w.projectionMatrix),vt.setValue(O,"viewMatrix",w.matrixWorldInverse);const Oi=vt.map.cameraPosition;Oi!==void 0&&Oi.setValue(O,ot.setFromMatrixPosition(w.matrixWorld)),P.logarithmicDepthBuffer&&vt.setValue(O,"logDepthBufFC",2/(Math.log(w.far+1)/Math.LN2)),(Z.isMeshPhongMaterial||Z.isMeshToonMaterial||Z.isMeshLambertMaterial||Z.isMeshBasicMaterial||Z.isMeshStandardMaterial||Z.isShaderMaterial)&&vt.setValue(O,"isOrthographic",w.isOrthographicCamera===!0),Y!==w&&(Y=w,Ui=!0,As=!0)}if(Ae.needsLights&&(mn.state.directionalShadowMap.length>0&&vt.setValue(O,"directionalShadowMap",mn.state.directionalShadowMap,ie),mn.state.spotShadowMap.length>0&&vt.setValue(O,"spotShadowMap",mn.state.spotShadowMap,ie),mn.state.pointShadowMap.length>0&&vt.setValue(O,"pointShadowMap",mn.state.pointShadowMap,ie)),K.isSkinnedMesh){vt.setOptional(O,K,"bindMatrix"),vt.setOptional(O,K,"bindMatrixInverse");const St=K.skeleton;St&&(St.boneTexture===null&&St.computeBoneTexture(),vt.setValue(O,"boneTexture",St.boneTexture,ie))}K.isBatchedMesh&&(vt.setOptional(O,K,"batchingTexture"),vt.setValue(O,"batchingTexture",K._matricesTexture,ie),vt.setOptional(O,K,"batchingIdTexture"),vt.setValue(O,"batchingIdTexture",K._indirectTexture,ie),vt.setOptional(O,K,"batchingColorTexture"),K._colorsTexture!==null&&vt.setValue(O,"batchingColorTexture",K._colorsTexture,ie));const Ni=Q.morphAttributes;if((Ni.position!==void 0||Ni.normal!==void 0||Ni.color!==void 0)&&U.update(K,Q,Tn),(Ui||Ae.receiveShadow!==K.receiveShadow)&&(Ae.receiveShadow=K.receiveShadow,vt.setValue(O,"receiveShadow",K.receiveShadow)),(Z.isMeshStandardMaterial||Z.isMeshLambertMaterial||Z.isMeshPhongMaterial)&&Z.envMap===null&&B.environment!==null&&(Ot.envMapIntensity.value=B.environmentIntensity),Ot.dfgLUT!==void 0&&(Ot.dfgLUT.value=WS()),Ui){if(vt.setValue(O,"toneMappingExposure",R.toneMappingExposure),Ae.needsLights&&dm(Ot,As),Me&&Z.fog===!0&&Ce.refreshFogUniforms(Ot,Me),Ce.refreshMaterialUniforms(Ot,Z,re,ne,y.state.transmissionRenderTarget[w.id]),Ae.needsLights&&Ae.lightProbeGrid){const St=Ae.lightProbeGrid;Ot.probesSH.value=St.texture,Ot.probesMin.value.copy(St.boundingBox.min),Ot.probesMax.value.copy(St.boundingBox.max),Ot.probesResolution.value.copy(St.resolution)}Za.upload(O,Oh(Ae),Ot,ie)}if(Z.isShaderMaterial&&Z.uniformsNeedUpdate===!0&&(Za.upload(O,Oh(Ae),Ot,ie),Z.uniformsNeedUpdate=!1),Z.isSpriteMaterial&&vt.setValue(O,"center",K.center),vt.setValue(O,"modelViewMatrix",K.modelViewMatrix),vt.setValue(O,"normalMatrix",K.normalMatrix),vt.setValue(O,"modelMatrix",K.matrixWorld),Z.uniformsGroups!==void 0){const St=Z.uniformsGroups;for(let Oi=0,Rs=St.length;Oi<Rs;Oi++){const Bh=St[Oi];oe.update(Bh,Tn),oe.bind(Bh,Tn)}}return Tn}function dm(w,B){w.ambientLightColor.needsUpdate=B,w.lightProbe.needsUpdate=B,w.directionalLights.needsUpdate=B,w.directionalLightShadows.needsUpdate=B,w.pointLights.needsUpdate=B,w.pointLightShadows.needsUpdate=B,w.spotLights.needsUpdate=B,w.spotLightShadows.needsUpdate=B,w.rectAreaLights.needsUpdate=B,w.hemisphereLights.needsUpdate=B}function fm(w){return w.isMeshLambertMaterial||w.isMeshToonMaterial||w.isMeshPhongMaterial||w.isMeshStandardMaterial||w.isShadowMaterial||w.isShaderMaterial&&w.lights===!0}this.getActiveCubeFace=function(){return V},this.getActiveMipmapLevel=function(){return L},this.getRenderTarget=function(){return X},this.setRenderTargetTextures=function(w,B,Q){const Z=$.get(w);Z.__autoAllocateDepthBuffer=w.resolveDepthBuffer===!1,Z.__autoAllocateDepthBuffer===!1&&(Z.__useRenderToTexture=!1),$.get(w.texture).__webglTexture=B,$.get(w.depthTexture).__webglTexture=Z.__autoAllocateDepthBuffer?void 0:Q,Z.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(w,B){const Q=$.get(w);Q.__webglFramebuffer=B,Q.__useDefaultFramebuffer=B===void 0},this.setRenderTarget=function(w,B=0,Q=0){X=w,V=B,L=Q;let Z=null,K=!1,Me=!1;if(w){const _e=$.get(w);if(_e.__useDefaultFramebuffer!==void 0){S.bindFramebuffer(O.FRAMEBUFFER,_e.__webglFramebuffer),J.copy(w.viewport),te.copy(w.scissor),Te=w.scissorTest,S.viewport(J),S.scissor(te),S.setScissorTest(Te),ee=-1;return}else if(_e.__webglFramebuffer===void 0)ie.setupRenderTarget(w);else if(_e.__hasExternalTextures)ie.rebindTextures(w,$.get(w.texture).__webglTexture,$.get(w.depthTexture).__webglTexture);else if(w.depthBuffer){const Ye=w.depthTexture;if(_e.__boundDepthTexture!==Ye){if(Ye!==null&&$.has(Ye)&&(w.width!==Ye.image.width||w.height!==Ye.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");ie.setupDepthRenderbuffer(w)}}const Le=w.texture;(Le.isData3DTexture||Le.isDataArrayTexture||Le.isCompressedArrayTexture)&&(Me=!0);const Fe=$.get(w).__webglFramebuffer;w.isWebGLCubeRenderTarget?(Array.isArray(Fe[B])?Z=Fe[B][Q]:Z=Fe[B],K=!0):w.samples>0&&ie.useMultisampledRTT(w)===!1?Z=$.get(w).__webglMultisampledFramebuffer:Array.isArray(Fe)?Z=Fe[Q]:Z=Fe,J.copy(w.viewport),te.copy(w.scissor),Te=w.scissorTest}else J.copy(Se).multiplyScalar(re).floor(),te.copy(je).multiplyScalar(re).floor(),Te=Ie;if(Q!==0&&(Z=k),S.bindFramebuffer(O.FRAMEBUFFER,Z)&&S.drawBuffers(w,Z),S.viewport(J),S.scissor(te),S.setScissorTest(Te),K){const _e=$.get(w.texture);O.framebufferTexture2D(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_CUBE_MAP_POSITIVE_X+B,_e.__webglTexture,Q)}else if(Me){const _e=B;for(let Le=0;Le<w.textures.length;Le++){const Fe=$.get(w.textures[Le]);O.framebufferTextureLayer(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0+Le,Fe.__webglTexture,Q,_e)}}else if(w!==null&&Q!==0){const _e=$.get(w.texture);O.framebufferTexture2D(O.FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_2D,_e.__webglTexture,Q)}ee=-1},this.readRenderTargetPixels=function(w,B,Q,Z,K,Me,Re,_e=0){if(!(w&&w.isWebGLRenderTarget)){ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Le=$.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&Re!==void 0&&(Le=Le[Re]),Le){S.bindFramebuffer(O.FRAMEBUFFER,Le);try{const Fe=w.textures[_e],Ye=Fe.format,et=Fe.type;if(w.textures.length>1&&O.readBuffer(O.COLOR_ATTACHMENT0+_e),!P.textureFormatReadable(Ye)){ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!P.textureTypeReadable(et)){ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}B>=0&&B<=w.width-Z&&Q>=0&&Q<=w.height-K&&O.readPixels(B,Q,Z,K,be.convert(Ye),be.convert(et),Me)}finally{const Fe=X!==null?$.get(X).__webglFramebuffer:null;S.bindFramebuffer(O.FRAMEBUFFER,Fe)}}},this.readRenderTargetPixelsAsync=async function(w,B,Q,Z,K,Me,Re,_e=0){if(!(w&&w.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Le=$.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&Re!==void 0&&(Le=Le[Re]),Le)if(B>=0&&B<=w.width-Z&&Q>=0&&Q<=w.height-K){S.bindFramebuffer(O.FRAMEBUFFER,Le);const Fe=w.textures[_e],Ye=Fe.format,et=Fe.type;if(w.textures.length>1&&O.readBuffer(O.COLOR_ATTACHMENT0+_e),!P.textureFormatReadable(Ye))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!P.textureTypeReadable(et))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const Ue=O.createBuffer();O.bindBuffer(O.PIXEL_PACK_BUFFER,Ue),O.bufferData(O.PIXEL_PACK_BUFFER,Me.byteLength,O.STREAM_READ),O.readPixels(B,Q,Z,K,be.convert(Ye),be.convert(et),0);const mt=X!==null?$.get(X).__webglFramebuffer:null;S.bindFramebuffer(O.FRAMEBUFFER,mt);const Nt=O.fenceSync(O.SYNC_GPU_COMMANDS_COMPLETE,0);return O.flush(),await $m(O,Nt,4),O.bindBuffer(O.PIXEL_PACK_BUFFER,Ue),O.getBufferSubData(O.PIXEL_PACK_BUFFER,0,Me),O.deleteBuffer(Ue),O.deleteSync(Nt),Me}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(w,B=null,Q=0){const Z=Math.pow(2,-Q),K=Math.floor(w.image.width*Z),Me=Math.floor(w.image.height*Z),Re=B!==null?B.x:0,_e=B!==null?B.y:0;ie.setTexture2D(w,0),O.copyTexSubImage2D(O.TEXTURE_2D,Q,0,0,Re,_e,K,Me),S.unbindTexture()},this.copyTextureToTexture=function(w,B,Q=null,Z=null,K=0,Me=0){let Re,_e,Le,Fe,Ye,et,Ue,mt,Nt;const Lt=w.isCompressedTexture?w.mipmaps[Me]:w.image;if(Q!==null)Re=Q.max.x-Q.min.x,_e=Q.max.y-Q.min.y,Le=Q.isBox3?Q.max.z-Q.min.z:1,Fe=Q.min.x,Ye=Q.min.y,et=Q.isBox3?Q.min.z:0;else{const Ot=Math.pow(2,-K);Re=Math.floor(Lt.width*Ot),_e=Math.floor(Lt.height*Ot),w.isDataArrayTexture?Le=Lt.depth:w.isData3DTexture?Le=Math.floor(Lt.depth*Ot):Le=1,Fe=0,Ye=0,et=0}Z!==null?(Ue=Z.x,mt=Z.y,Nt=Z.z):(Ue=0,mt=0,Nt=0);const bt=be.convert(B.format),Qt=be.convert(B.type);let Ae;B.isData3DTexture?(ie.setTexture3D(B,0),Ae=O.TEXTURE_3D):B.isDataArrayTexture||B.isCompressedArrayTexture?(ie.setTexture2DArray(B,0),Ae=O.TEXTURE_2D_ARRAY):(ie.setTexture2D(B,0),Ae=O.TEXTURE_2D),S.activeTexture(O.TEXTURE0),S.pixelStorei(O.UNPACK_FLIP_Y_WEBGL,B.flipY),S.pixelStorei(O.UNPACK_PREMULTIPLY_ALPHA_WEBGL,B.premultiplyAlpha),S.pixelStorei(O.UNPACK_ALIGNMENT,B.unpackAlignment);const mn=S.getParameter(O.UNPACK_ROW_LENGTH),lt=S.getParameter(O.UNPACK_IMAGE_HEIGHT),Tn=S.getParameter(O.UNPACK_SKIP_PIXELS),Qn=S.getParameter(O.UNPACK_SKIP_ROWS),Ui=S.getParameter(O.UNPACK_SKIP_IMAGES);S.pixelStorei(O.UNPACK_ROW_LENGTH,Lt.width),S.pixelStorei(O.UNPACK_IMAGE_HEIGHT,Lt.height),S.pixelStorei(O.UNPACK_SKIP_PIXELS,Fe),S.pixelStorei(O.UNPACK_SKIP_ROWS,Ye),S.pixelStorei(O.UNPACK_SKIP_IMAGES,et);const As=w.isDataArrayTexture||w.isData3DTexture,vt=B.isDataArrayTexture||B.isData3DTexture;if(w.isDepthTexture){const Ot=$.get(w),Ni=$.get(B),St=$.get(Ot.__renderTarget),Oi=$.get(Ni.__renderTarget);S.bindFramebuffer(O.READ_FRAMEBUFFER,St.__webglFramebuffer),S.bindFramebuffer(O.DRAW_FRAMEBUFFER,Oi.__webglFramebuffer);for(let Rs=0;Rs<Le;Rs++)As&&(O.framebufferTextureLayer(O.READ_FRAMEBUFFER,O.COLOR_ATTACHMENT0,$.get(w).__webglTexture,K,et+Rs),O.framebufferTextureLayer(O.DRAW_FRAMEBUFFER,O.COLOR_ATTACHMENT0,$.get(B).__webglTexture,Me,Nt+Rs)),O.blitFramebuffer(Fe,Ye,Re,_e,Ue,mt,Re,_e,O.DEPTH_BUFFER_BIT,O.NEAREST);S.bindFramebuffer(O.READ_FRAMEBUFFER,null),S.bindFramebuffer(O.DRAW_FRAMEBUFFER,null)}else if(K!==0||w.isRenderTargetTexture||$.has(w)){const Ot=$.get(w),Ni=$.get(B);S.bindFramebuffer(O.READ_FRAMEBUFFER,z),S.bindFramebuffer(O.DRAW_FRAMEBUFFER,D);for(let St=0;St<Le;St++)As?O.framebufferTextureLayer(O.READ_FRAMEBUFFER,O.COLOR_ATTACHMENT0,Ot.__webglTexture,K,et+St):O.framebufferTexture2D(O.READ_FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_2D,Ot.__webglTexture,K),vt?O.framebufferTextureLayer(O.DRAW_FRAMEBUFFER,O.COLOR_ATTACHMENT0,Ni.__webglTexture,Me,Nt+St):O.framebufferTexture2D(O.DRAW_FRAMEBUFFER,O.COLOR_ATTACHMENT0,O.TEXTURE_2D,Ni.__webglTexture,Me),K!==0?O.blitFramebuffer(Fe,Ye,Re,_e,Ue,mt,Re,_e,O.COLOR_BUFFER_BIT,O.NEAREST):vt?O.copyTexSubImage3D(Ae,Me,Ue,mt,Nt+St,Fe,Ye,Re,_e):O.copyTexSubImage2D(Ae,Me,Ue,mt,Fe,Ye,Re,_e);S.bindFramebuffer(O.READ_FRAMEBUFFER,null),S.bindFramebuffer(O.DRAW_FRAMEBUFFER,null)}else vt?w.isDataTexture||w.isData3DTexture?O.texSubImage3D(Ae,Me,Ue,mt,Nt,Re,_e,Le,bt,Qt,Lt.data):B.isCompressedArrayTexture?O.compressedTexSubImage3D(Ae,Me,Ue,mt,Nt,Re,_e,Le,bt,Lt.data):O.texSubImage3D(Ae,Me,Ue,mt,Nt,Re,_e,Le,bt,Qt,Lt):w.isDataTexture?O.texSubImage2D(O.TEXTURE_2D,Me,Ue,mt,Re,_e,bt,Qt,Lt.data):w.isCompressedTexture?O.compressedTexSubImage2D(O.TEXTURE_2D,Me,Ue,mt,Lt.width,Lt.height,bt,Lt.data):O.texSubImage2D(O.TEXTURE_2D,Me,Ue,mt,Re,_e,bt,Qt,Lt);S.pixelStorei(O.UNPACK_ROW_LENGTH,mn),S.pixelStorei(O.UNPACK_IMAGE_HEIGHT,lt),S.pixelStorei(O.UNPACK_SKIP_PIXELS,Tn),S.pixelStorei(O.UNPACK_SKIP_ROWS,Qn),S.pixelStorei(O.UNPACK_SKIP_IMAGES,Ui),Me===0&&B.generateMipmaps&&O.generateMipmap(Ae),S.unbindTexture()},this.initRenderTarget=function(w){$.get(w).__webglFramebuffer===void 0&&ie.setupRenderTarget(w)},this.initTexture=function(w){w.isCubeTexture?ie.setTextureCube(w,0):w.isData3DTexture?ie.setTexture3D(w,0):w.isDataArrayTexture||w.isCompressedArrayTexture?ie.setTexture2DArray(w,0):ie.setTexture2D(w,0),S.unbindTexture()},this.resetState=function(){V=0,L=0,X=null,S.reset(),ye.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return oi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=rt._getDrawingBufferColorSpace(e),t.unpackColorSpace=rt._getUnpackColorSpace()}}function _t(i){if(i!==null&&typeof i=="object"){for(const e of Object.getOwnPropertyNames(i))_t(i[e]);Object.freeze(i)}return i}const Gr=_t({pavement:{id:"pavement",albedo:7961470,roughness:.95,metalness:0,mottle:.075,encroach:0},roughPavement:{id:"roughPavement",albedo:7171692,roughness:.98,metalness:0,mottle:.12,encroach:.22},brick:{id:"brick",albedo:7295046,roughness:.88,metalness:0,mottle:.13,encroach:0,paving:{module:2.8,contrast:.06}},grass:{id:"grass",albedo:4415292,roughness:1,metalness:0,mottle:.2,encroach:1},gravel:{id:"gravel",albedo:7894126,roughness:1,metalness:0,mottle:.19,encroach:.65},dirt:{id:"dirt",albedo:6838858,roughness:.98,metalness:0,mottle:.17,encroach:.75},wood:{id:"wood",albedo:6378307,roughness:.72,metalness:0,mottle:.11,encroach:0},concrete:{id:"concrete",albedo:9605773,roughness:.92,metalness:0,mottle:.04,encroach:0},stone:{id:"stone",albedo:8420212,roughness:.9,metalness:0,mottle:.06,encroach:0},metal:{id:"metal",albedo:5921374,roughness:.45,metalness:.65,mottle:0,encroach:0}}),wn=_t({pavement:{id:"pavement",label:"pavement",rollingResistance:.35,grip:1,roughnessAmplitude:.004,roughnessWavelength:3,particle:"none",tyreAudio:"tyre-smooth",wobbleInjection:0,material:"pavement"},roughPavement:{id:"roughPavement",label:"rough pavement",rollingResistance:.85,grip:.92,roughnessAmplitude:.02,roughnessWavelength:2.2,particle:"none",tyreAudio:"tyre-coarse",wobbleInjection:.35,material:"roughPavement"},brick:{id:"brick",label:"brick",rollingResistance:.55,grip:.96,roughnessAmplitude:.012,roughnessWavelength:1.6,particle:"none",tyreAudio:"tyre-brick",wobbleInjection:.18,material:"brick"},grass:{id:"grass",label:"grass",rollingResistance:2.8,grip:.7,roughnessAmplitude:.032,roughnessWavelength:2.6,particle:"grassClipping",tyreAudio:"tyre-grass",wobbleInjection:.55,material:"grass"},gravel:{id:"gravel",label:"gravel",rollingResistance:1.9,grip:.58,roughnessAmplitude:.04,roughnessWavelength:1.9,particle:"dust",tyreAudio:"tyre-gravel",wobbleInjection:.85,material:"gravel"},dirt:{id:"dirt",label:"dirt",rollingResistance:1.1,grip:.8,roughnessAmplitude:.026,roughnessWavelength:3.1,particle:"dust",tyreAudio:"tyre-dirt",wobbleInjection:.45,material:"dirt"},wood:{id:"wood",label:"wood bridge",rollingResistance:.45,grip:.86,roughnessAmplitude:.01,roughnessWavelength:2.4,particle:"splinter",tyreAudio:"tyre-wood",wobbleInjection:.15,material:"wood"}}),jf=_t(Object.keys(wn));function Sh(i){return wn[i]??wn.pavement}function Ss(i){return Gr[i]??Gr.pavement}const it={tyreDiameter:.5,tyreWidth:.075,shellHeight:.62,shellWidth:.22,shellLength:.52,shellCapFraction:.42,pedalHeight:.16,pedalSpan:.52,pedalLength:.26,pedalThickness:.022,padHeight:.2,padLength:.3,padThickness:.035,padCentreHeight:.44,suspensionTravel:.085},ms={height:1.75,hipHeight:.92},he={ankleAbovePedal:.06,shinLength:.38,thighLength:.4,stanceHalfWidth:.185,legThickness:.115,bootLength:.24,bootHeight:.075,torsoLength:.5,torsoWidth:.34,torsoDepth:.27,torsoRestPitch:.1,carveReactionFullRoll:.64,carveSquatMax:.065,carveInsideHipDropMax:.085,carveInsideKneeOpen:.45,loadReactionFullPitch:.7,accelHipShiftMax:.08,brakeHipShiftMax:.15,accelSquatMax:.03,brakeSquatMax:.09,headStabilizationFactor:.65,headStabilizationMax:.55,armAsymmetrySplay:.03,armAsymmetryForward:.035,armBrakeForward:.055,armAccelBack:.035,armLoadSplay:.03,armCarveOutsideSplay:.055,armCarveOutsideRise:.045,armCarveInsideTuck:.03,shoulderHalfWidth:.175,upperArmLength:.28,forearmLength:.26,armThickness:.085,armSplay:.115,armHangFraction:.93,handForward:.12,neckLength:.09,helmetRadius:.125,restFootOutboard:.3,restFootBack:.05,restHipHeight:.8,restHipShift:.1,restWheelLean:.1,crouchHipDrop:.17,tuckHipDrop:.16,tuckTorsoPitch:.5,tuckTorsoPitchMax:.95,squatMax:.3,tuckArmBack:.115,tuckArmSplay:.025,tuckArmDrop:.045,tuckHeadStabilization:.92,tuckHeadStabilizationMax:.45,airArmSplay:.045,airArmRise:.03,pedalStrikeFootLift:.022,airHeadDown:.2,wobbleHipDrop:.055,wobbleArmSplay:.075,wobbleArmRise:.03,wobbleFootAdjust:.025,wobbleHipCounterYaw:.55,wobbleWheelRock:2.2,wobbleTorsoLevel:.65,crashArmSplay:.13,crashArmRise:.16,crashFootOutboard:.24},gs={gravity:9.81},j={maxLeanPitch:.5,leanResponseSeconds:.14,leanRateLimit:3,leanToAccel:16,brakeAuthority:22,dragCoefficient:.032,stoppedSpeed:.05,reverseEntrySpeed:.6,reverseEngageSeconds:.35,maxReverseSpeed:2.2,yawRateLow:2.4,yawRateHigh:.85,carveSpeed:9,maxLateralG:.75,rollResponseSeconds:.11,riderUpperBodyRollFactor:.18,maxRiderPitch:.7,riderCruisePitchFactor:.18,riderAccelerationPitchGain:.1,riderPitchResponseSeconds:.08,wheelPitchFactor:.45,riderLookIntoTurn:.42,riderLookResponseSeconds:.16,riderSlopeLeanFactor:1,riderSlopeLeanFullSpeed:1.5,restDelaySeconds:.75,restResponseSeconds:.3,restReleaseSeconds:.12,hopCompressSeconds:.09,hopLaunchSpeed:3,hopChargeSeconds:.4,hopChargeHeightBonus:.4,hopSuspensionRebound:.35,suspensionPreload:.055,airYawFactor:.25,airDragFactor:.18,airPitchAuthority:.16,airPitchResponseSeconds:.18,airTuck:.3,crouchHeldAmount:.55,crouchResponseSeconds:.07,landingAbsorbSeconds:.3,landingImpactReference:5,landingMisalignReference:.8,landingSurfaceWeight:.3,landingRoughnessReference:.04,landingHeavyScore:1,landingWobbleScore:1.8,landingCrashScore:2.8,landingSpeedLossPerScore:.2,landingMaxSpeedLoss:.75,landingStateSeconds:.18,landingSuspensionKick:.16,pedalStrikeDecel:38,pedalStrikeJolt:.22,pedalStrikeGraceAngle:.055,pedalStrikeReferenceDepth:.12,wobbleFrequencyHz:4,wobbleMaxYaw:.1,wobbleCrashEnergy:1,wobbleDampingAggressive:.55,wobbleDampingSmooth:2.4,wobbleSmoothThrottle:.35,wobbleSmoothSteerSeconds:.3,wobbleSmoothResponseSeconds:.25,wobbleFootCorrectionStart:.3,wobbleFootCorrectionDamping:1,wobbleFootCorrectionResponseSeconds:.12,wobbleMasterGain:0,wobbleComfortSpeed:15.5,wobbleSpeedGain:.35,wobbleSurfaceGain:.012,wobbleSteerReversalGain:1.1,wobbleReversalMemorySeconds:.45,wobblePedalStrikeGain:2.5,wobbleCurbGain:3,wobbleLandingGain:.55,wobbleStateEnergy:.35,powerComfortSpeed:11.5,powerLimitSpeed:17,powerSlopeLoad:4,powerAccelLoad:.25,powerLandingLoad:.55,powerLandingDecaySeconds:1.4,powerResponseSeconds:.55,powerReliefSeconds:1.2,powerNoticeLoad:.6,powerWarnLoad:.82,powerTiltBackLoad:1,powerTiltBackRelease:.8,tiltBackLeanBack:.06,tiltBackEngageSeconds:.35,tiltBackReleaseSeconds:.5,tiltBackPedalPitch:.18,crashWheelDecel:2.2,obstacleCrashSpeed:3.5,crashWheelFallSeconds:.85,crashWheelLean:1.45,crashRecoverEarliestSeconds:2.5,crashRecoverAutoSeconds:3.6,crashRecoverSpeedFactor:.35,crashSafeDelaySeconds:.8,crashSafeWobbleCeiling:.25,crashInvulnerableSeconds:.9,crashRecoverBlendSeconds:.45,crashStepOffSpeed:3,crashRunOutSpeed:9,crashSeparationForward:2.1,crashSeparationLateral:1.3,crashSeparationSeconds:.85,crashTumbleHz:2,crashTumbleDampSeconds:.55,crashTumbleRoll:.45,crashTumblePitch:.16,crashTumbleBounce:.09,crashRiderDrop:.12,crashRiderTumble:.28,crashSideFallDrop:.1,crashSideFallRoll:1.35},Be={sunElevation:.96,sunAzimuth:2.36,sunDistance:60,sunColour:16774374,sunIntensity:2.6,skyColour:10339562,groundBounceColour:11709335,hemisphereIntensity:1.1,horizonColour:12375790,skyTextureWidth:1024,skyTextureHeight:512,skyZenithColour:5804760,skyGradientExponent:.62,skySunColour:16773852,skySunCoreSpread:.055,skySunGlowSpread:.34,skySunGlowStrength:.75,skySunHorizonWarmth:.3,skySunHorizonSpread:1.05,skySunHorizonPeak:.2,skyCloudLitColour:16645887,skyCloudShadeColour:12175578,skyCloudCoverage:.46,skyCloudSoftness:.26,skyCloudScale:.55,skyCloudHorizonFade:.045,fogNear:120,fogFar:470,exposure:1,shadowMapSize:2048,shadowRadius:30,shadowBias:-5e-4,shadowNormalBias:.02},Ze={fovAtRest:1.13,fovAtSpeed:1.36,distanceAtRest:4.2,distanceAtSpeed:6,targetHeightOffset:.35,speedReference:15,armHeight:1.95,lookAheadSeconds:.22,lookAheadMax:3.6,lookAheadResponseSeconds:.35,distanceResponseSeconds:.55,fovResponseSeconds:.7,yawLagAtRest:.42,yawLagAtSpeed:.14,bankFactor:.15,bankMaxRadians:.1,bankResponseSeconds:.18,obstructionRadius:.35,obstructionMinDistance:1.6,obstructionPullInSeconds:.05,obstructionRestoreSeconds:.55,airHeightFollow:.35,airHeightResponseSeconds:.1,landingRestoreSeconds:.45,landingDipPerImpact:.028,landingDipMax:.14,landingDipRecoverSeconds:.42,crashDistance:8.6,crashArmHeight:2.35,crashFov:1.3,crashFrameSeconds:.45,crashRestoreSeconds:.35,near:.1,far:500},Et={curbThreshold:.04,stepUpPedalFactor:1.35,curbImpactPerMetre:20,wallScrubDecel:42,feelerDistance:.55,dropLaunchThreshold:.05,suspensionFrequencyHz:2.6,suspensionDamping:.42,groundTiltResponseSeconds:.09,maxGroundTilt:.6,groundTiltPitchFollow:0,groundTiltRollFollow:.25,rollingResistanceScale:1,surroundMargin:480,surroundCellSize:8,surroundBackstopHalfExtent:340,surroundBackstopDrop:.08},Ft={shell:4870232,tyre:2303015,pad:2829617,pedal:10133672,accent:2060256,headlight:16773328,taillight:16720435,statusNormal:3134315,statusNotice:16765503,statusWarn:16747039,statusCritical:16723759,riderSuit:4672339,riderPanel:3112936,riderHelmet:5264734,riderVisor:2237739,riderBoot:3356220,ghost:9426175,gate:3112936,gatePassed:1719398,gateFinish:16765503},Qe={sparkCount:96,sparkRatePerSecond:150,sparkLifeSeconds:.4,sparkSpeed:2.4,sparkSpread:.55,sparkGravity:11,sparkSize:.09,sparkColour:16766089,sparkIntensity:2,sparkFadeColour:3805700,dustCount:96,dustPerLanding:22,dustLifeSeconds:.62,dustSpeed:2.2,dustSpread:.9,dustGravity:2.2,dustSize:.14,particleColours:{dust:12562069,grassClipping:7311196,grit:10130828,splinter:9073752},statusLightWidth:.1,statusLightHeight:.028,statusLightDepth:.012,statusCalmIntensity:.55,statusAlarmIntensity:2.6,statusNoticeHz:1.6,statusCriticalHz:6,statusPulseDepth:.55,statusBootIntensity:5,statusBootColour:13625855},N={bedTrim:.55,transientTrim:.85,limiterThresholdDb:-6,limiterKneeDb:6,limiterRatio:12,limiterAttackSeconds:.004,limiterReleaseSeconds:.18,paramGlideSeconds:.018,modelStepSeconds:1/60,speedReference:15,motorPolePairs:15,motorIdleHz:22,motorMaxHz:240,motorSingHarmonic:3,motorAirHarmonic:6,motorIdleLevel:0,motorLoadLevel:0,motorSingLevel:0,motorSingCurve:.7,motorSingIdleShare:.55,motorAirLevel:0,motorAirCurve:1.6,motorCutoffAtRest:220,motorCutoffAtSpeed:1500,motorLoadBrighten:2.2,motorFilterQ:.7,motorResponseSeconds:.07,airSpinFactor:1.28,airDriveFactor:.45,regenHarmonic:2,regenLevel:0,regenResonance:3,regenCutoffFactor:.45,regenResponseSeconds:.1,windOnsetSpeed:9,windLevel:.17,windExponent:1.7,windCutoffAtRest:240,windCutoffAtSpeed:1200,windQ:.4,windResponseSeconds:.22,windAirBoost:1.3,tyreLevel:.44,tyreReferenceSpeed:9,tyreStandstillLevel:0,tyreCrossfadeSeconds:.2,tyreCutoffRise:1.25,tyreGrainGain:.85,tyreGrainReference:.35,tyreResponseSeconds:.05,tyreVoices:{"tyre-smooth":{centreHz:1750,q:.6,level:.15,lowHz:180,lowLevel:.16,grain:.1,sample:0,sampleRate:1,toko:.55},"tyre-gravel":{centreHz:1380,q:.35,level:.19,lowHz:260,lowLevel:.42,grain:1,sample:1,sampleRate:1.12,toko:0},"tyre-coarse":{centreHz:1080,q:.5,level:.26,lowHz:240,lowLevel:.34,grain:.45,sample:0,sampleRate:1,toko:.45},"tyre-brick":{centreHz:850,q:1.1,level:.21,lowHz:220,lowLevel:.3,grain:.35,sample:0,sampleRate:1,toko:.35},"tyre-grass":{centreHz:640,q:.4,level:.13,lowHz:140,lowLevel:.32,grain:.5,sample:0,sampleRate:1,toko:0},"tyre-dirt":{centreHz:490,q:.5,level:.13,lowHz:200,lowLevel:.36,grain:.55,sample:1,sampleRate:1,toko:0},"tyre-wood":{centreHz:330,q:2.4,level:.3,lowHz:130,lowLevel:.48,grain:.75,sample:0,sampleRate:1,toko:0}},tyreSampleRateAtRest:.94,tyreSampleRateAtSpeed:1.1,tyreSampleTrim:3,windSampleTrim:2.3,tokoSampleTrim:1.6,scrapeLevel:.1,scrapeCentreHz:1100,scrapeQ:3,scrapeFullOverlap:.04,scrapeReferenceSpeed:6,scrapeResponseSeconds:.03,scrapeRingLevel:.08,scrapeRingHz:880,beepLevel:0,beepSeconds:.075,beepAttackSeconds:.009,beepReleaseSeconds:.034,beepCutoffHz:2600,beepDoubleGapSeconds:.105,noticeHz:784,noticePeriodSeconds:1.3,noticeLevel:.16,warnHz:1046,warnPeriodSeconds:.6,warnLevel:.25,tiltBackHz:1320,tiltBackPeriodSeconds:.3,tiltBackLevel:.29,wobbleToneLevel:.22,wobbleToneLowHz:140,wobbleToneHighHz:300,wobbleToneResponseSeconds:.12,hopLevel:.2,hopThumpFromHz:150,hopThumpToHz:60,hopThumpSeconds:.14,hopNoiseHz:900,hopNoiseSeconds:.09,landingLevel:.36,landingThumpFromHz:190,landingThumpToHz:55,landingThumpSeconds:.2,landingNoiseSeconds:.16,landingMinScale:.28,curbLevel:.46,curbThumpFromHz:260,curbThumpToHz:80,curbThumpSeconds:.12,curbNoiseHz:1800,curbNoiseSeconds:.07,curbImpactReference:6,impactRetriggerSeconds:.14,crashLevel:.8,crashThumpFromHz:130,crashThumpToHz:38,crashThumpSeconds:.42,crashNoiseHz:1200,crashNoiseSeconds:.55,crashSampleTrim:.85,crashSampleRateSpread:.05,recoverLevel:0,recoverLowHz:660,recoverHighHz:990,recoverSeconds:.2,duckAttackSeconds:.03,duckReleaseSeconds:.3,duckNotice:.2,duckWarn:.34,duckTiltBack:.54,duckHop:.1,duckLanding:.2,duckCurb:.26,duckCrash:.55,duckCrashReleaseSeconds:1.1,crashedBedGain:.3,crashedBedSeconds:.18},Rr={hz:120,maxStepsPerFrame:5,firstFrameProbeMs:900,fallbackIntervalMs:16},ep={maxPixelRatio:2},ti={actionBufferSeconds:.15,gamepadStickDeadZone:.18,gamepadTriggerThreshold:.08,menuStickThreshold:.5,menuRepeatDelaySeconds:.42,menuRepeatIntervalSeconds:.14,touchStickTravelPx:84,touchStickDeadZonePx:5,touchStickCurve:1.35},_h={overlayRefreshHz:5,sampleWindow:240},Ka={orbitRate:.22,distanceFactor:.72,heightFactor:1.9,targetHeightFactor:.72},qe={startRunupMetres:18,gateWidthMargin:2.4,gateHalfDepth:1.8,gateHalfHeight:1.6,ghostSampleHz:20,ghostMaxSeconds:420,ghostPositionStep:.01,ghostAngleStep:.005,ghostOpacity:.42,splitHoldSeconds:2.6,resultsDelaySeconds:1.4,gateDrawnMaxHalfWidth:10,gateWideMarkerHalfWidth:5.5,gateFlareSeconds:.4,gateFlareIntensity:5,recordEpsilonSeconds:.01},YS=_t({WHEEL:it,RIDER:ms,RIDER_BLOCKOUT:he,PHYSICS:gs,EUC:j,TERRAIN:Et,LIGHTING:Be,CAMERA:Ze,INSPECTION_CAMERA:Ka,BLOCKOUT_COLOURS:Ft,FX:Qe,AUDIO:N,CHALLENGE:qe,SIMULATION:Rr,RENDER:ep,INPUT:ti,DIAGNOSTICS:_h,SURFACES:wn,MATERIALS:Gr}),qS=_t([{path:"EUC.maxLeanPitch",group:"Ride — power",label:"Force lean",unit:"rad",min:.1,max:.8,step:.005,note:"Force-demand lean at full throttle. Drive force is proportional to its sine, so raising this raises acceleration and top speed together. The rendered rider pose has its own transient controls below."},{path:"EUC.leanToAccel",group:"Ride — power",label:"Drive authority",unit:"m/s²",min:4,max:40,step:.25,note:"Acceleration per unit of sin(lean). With drag fixed, this sets both how hard the wheel pulls away and where it tops out."},{path:"EUC.brakeAuthority",group:"Ride — power",label:"Brake authority",unit:"m/s²",min:4,max:50,step:.25,note:"Used instead of drive authority whenever lean opposes travel. Keep it above drive authority: a wheel stops far harder than it pulls."},{path:"EUC.leanResponseSeconds",group:"Ride — power",label:"Lean response",unit:"s",min:.02,max:.6,step:.005,note:"Time constant for lean chasing the input. The single strongest control over whether the game feels crisp or soggy."},{path:"EUC.leanRateLimit",group:"Ride — power",label:"Lean rate limit",unit:"rad/s",min:.5,max:12,step:.1,note:"Ceiling on how fast lean may change. Shapes the onset of a slammed key without slowing an ordinary input."},{path:"EUC.maxRiderPitch",group:"Ride — power",label:"Rider pitch limit",unit:"rad",min:.1,max:.8,step:.005,note:"Largest fore-aft action pose, on top of the relaxed torso pitch. Launch and hard braking may reach it; steady cruising should not."},{path:"EUC.riderCruisePitchFactor",group:"Ride — power",label:"Cruise lean",unit:"×",min:0,max:1,step:.01,note:"Fraction of force lean retained in the steady visual pose. Lower values bring the rider nearer upright once acceleration tapers."},{path:"EUC.riderAccelerationPitchGain",group:"Ride — power",label:"Accel lean gain",unit:"rad/(m/s²)",min:0,max:.12,step:.002,note:"Extra rendered pitch per unit of active acceleration or braking. This is what makes the strong pose transient instead of speed-held."},{path:"EUC.riderPitchResponseSeconds",group:"Ride — power",label:"Rider pitch response",unit:"s",min:.02,max:.6,step:.005,note:"Time constant for the rendered fore-aft pose. It does not change the force curve or the user-approved wheel/lower-body side angle."},{path:"EUC.riderSlopeLeanFactor",group:"Ride — power",label:"Slope lean",unit:"×",min:0,max:2,step:.05,note:"Rider lean into the hill per radian of gradient. 1.0 is the physical equilibrium for holding a slope; 0 stands them bolt upright on every hill."},{path:"EUC.dragCoefficient",group:"Ride — power",label:"Drag",unit:"1/m",min:.005,max:.15,step:.001,note:"Quadratic drag. Top speed emerges from this against drive authority rather than being clamped, so lowering it raises top speed without touching how the wheel launches."},{path:"EUC.hopLaunchSpeed",group:"Ride — hop & air",label:"Hop launch",unit:"m/s",min:.5,max:6,step:.05,note:"Vertical speed at take-off, uncharged. Height is v²/2g, so 3.0 m/s is a 0.46 m hop and 0.61 s of air. Judge it by the air time, not the height: that is what the chase camera actually shows."},{path:"EUC.hopCompressSeconds",group:"Ride — hop & air",label:"Compression",unit:"s",min:0,max:.35,step:.005,note:"Dwell between the press and the impulse, during which the rider crouches and the suspension loads. Zero fires instantly and looks like a teleport; too long and the hop stops answering the key."},{path:"EUC.hopChargeHeightBonus",group:"Ride — hop & air",label:"Crouch bonus",unit:"×height",min:0,max:1.2,step:.02,note:"Extra height from holding Shift before the press. This is the whole skill in the hop — zero makes every hop identical."},{path:"EUC.airYawFactor",group:"Ride — hop & air",label:"Air steering",unit:"×",min:0,max:1,step:.01,note:"Fraction of ground yaw authority in the air. It turns the wheel, never the travel direction, so it can only fix your alignment for the landing — which is exactly what it is for."},{path:"EUC.pedalStrikeDecel",group:"Ride — hop & air",label:"Pedal scrape",unit:"m/s²/rad",min:0,max:150,step:1,note:"Speed cost while a pedal is on the ground, per radian past the clearance angle. Clearance itself is derived from the wheel, not set here: a full-lock carve on pavement is meant to scrape."},{path:"EUC.landingImpactReference",group:"Ride — landing",label:"Impact reference",unit:"m/s",min:1,max:15,step:.1,note:"Closing speed along the surface normal that scores a full point. Lower it to make landings punishing; raise it to make them forgiving."},{path:"EUC.landingSpeedLossPerScore",group:"Ride — landing",label:"Landing cost",unit:"×/point",min:0,max:.6,step:.01,note:"Fraction of speed lost per point of score above clean. The misaligned part of the velocity is already scrubbed before this, so a sideways landing is paid for twice."},{path:"CAMERA.airHeightFollow",group:"Ride — landing",label:"Camera air follow",unit:"×",min:0,max:1,step:.05,note:"How much of the hop the camera takes with the rider. 1 is the pre-M5 behaviour and throws the horizon upward; 0 pins the camera to the take-off height and lets the rider leave the frame."},{path:"CAMERA.landingDipMax",group:"Ride — landing",label:"Landing dip",unit:"m",min:0,max:.4,step:.01,note:"Ceiling on the camera drop a landing produces. One smooth decaying impulse, never oscillation. Set it to zero if any camera motion on impact is unwelcome."},{path:"EUC.wobbleDampingAggressive",group:"Ride — wobble",label:"Passive damping",unit:"1/s",min:.05,max:3,step:.05,note:"Baseline damping while the player is still hard on the throttle or steering. Active foot correction and easing-off damping stack on top."},{path:"EUC.wobbleDampingSmooth",group:"Ride — wobble",label:"Damping (easing off)",unit:"1/s",min:.1,max:8,step:.1,note:"Extra input-driven damping once the rider eases off and steers smoothly. It stacks with Cool Rider’s automatic foot correction."},{path:"EUC.wobbleFootCorrectionDamping",group:"Ride — wobble",label:"Foot correction",unit:"1/s",min:0,max:8,step:.1,note:"Automatic damping from Cool Rider adjusting their feet after a mistake. Zero removes the experienced-rider assist; easing still works."},{path:"EUC.wobbleMaxYaw",group:"Ride — wobble",label:"Wobble amplitude",unit:"rad",min:0,max:.3,step:.005,note:"Yaw deviation at the crash threshold. It is added to the direction the wheel actually travels, so this is how far the line weaves — not a decoration on top of a straight one."},{path:"EUC.wobbleFrequencyHz",group:"Ride — wobble",label:"Wobble rate",unit:"Hz",min:1,max:9,step:.1,note:"Oscillation frequency. Real speed wobble is 3-5 Hz. Slower reads as a swerve the rider chose; faster disappears into the camera lag."},{path:"EUC.wobbleSurfaceGain",group:"Ride — wobble",label:"Surface injection",unit:"/s per m/s",min:0,max:.15,step:.005,note:"Wobble fed by the surface, per unit of its own wobble injection per m/s ridden. Pavement injects nothing at any speed whatever this says; gravel is the surface to judge it on."},{path:"EUC.wobbleSteerReversalGain",group:"Ride — wobble",label:"Reversal injection",unit:"/rad",min:0,max:3,step:.05,note:"Wobble injected when the steering flips, per radian of lean thrown away at full speed. Easing through neutral first costs almost nothing, which is the skill this rewards."},{path:"EUC.wobbleMasterGain",group:"Ride — wobble",label:"Wobble enabled",unit:"0..1",min:0,max:1,step:.05,note:"Master gate on every wobble energy source. Zero by owner decision (2026-08-02): the mechanic works but is not fun yet, and stays off until a non-disruptive redesign. One is the full QA-hardened M6 behaviour; between scales every injection."},{path:"EUC.wobbleReversalMemorySeconds",group:"Ride — wobble",label:"Reversal memory",unit:"s",min:.05,max:1.5,step:.05,note:"How long a released carve stays chargeable to a reversal. Human fingers take 80-200 ms to get from one key to the other; shorter than that here and only a test script can ever trigger the reversal."},{path:"EUC.powerComfortSpeed",group:"Ride — power",label:"Power comfort speed",unit:"m/s",min:4,max:18,step:.25,note:"Speed at which the wheel starts spending its headroom. Lower it and the wheel warns earlier; take it under about 8 and tilt-back starts reaching into ordinary flat riding."},{path:"EUC.powerSlopeLoad",group:"Ride — power",label:"Climb load",unit:"×",min:0,max:5,step:.05,note:"Load per unit of gradient while climbing. This is what makes a hill expensive rather than merely slow, and it is the main route to tilt-back on the proving ground."},{path:"EUC.powerTiltBackLoad",group:"Ride — power",label:"Tilt-back at",unit:"load",min:.3,max:1.6,step:.01,note:"Load at which the wheel stops answering the throttle and tilts back. Flat-out on flat pavement produces about 0.66, so anything above that keeps the accepted flat ride untouched."},{path:"EUC.tiltBackLeanBack",group:"Ride — power",label:"Tilt-back strength",unit:"rad",min:0,max:.4,step:.005,note:"How far past neutral tilt-back holds the force lean. Zero merely cuts the throttle; larger values brake against the rider until the load falls."},{path:"EUC.obstacleCrashSpeed",group:"Ride — crash",label:"Obstacle crash speed",unit:"m/s",min:1,max:12,step:.25,note:"Normal speed into a solid face that takes the rider off. Shallow scrapes spend only their into-wall component, so they can stay below this while carrying speed along the obstacle."},{path:"EUC.crashRecoverSpeedFactor",group:"Ride — crash",label:"Recovery speed",unit:"×",min:0,max:1,step:.05,note:"Fraction of the pre-crash speed the rider is restored with. Zero is a full stop, like quick reset; the default keeps the run moving so a crash costs a couple of seconds rather than a re-launch."},{path:"EUC.crashRecoverAutoSeconds",group:"Ride — crash",label:"Auto recovery",unit:"s",min:.4,max:4,step:.05,note:"How long the crash runs before the rider is restored without being asked. Any riding input recovers earlier. Long values are realistic and, per the motion reference, exactly wrong for this game."},{path:"CAMERA.crashDistance",group:"Ride — crash",label:"Crash framing",unit:"m",min:4,max:16,step:.2,note:"Arm length the camera eases to during a crash. It has to hold both the rider and a wheel that is still rolling away from them."},{path:"TERRAIN.rollingResistanceScale",group:"Terrain — surfaces",label:"Surface drag",unit:"×",min:0,max:3,step:.01,note:"Scales every surface’s rolling resistance together. Raise it to make the ground matter more in general before tuning any one surface below."},{path:"SURFACES.pavement.rollingResistance",group:"Terrain — surfaces",label:"Pavement drag",unit:"m/s²",min:0,max:4,step:.01,note:"The reference surface. 0.35 is the single value M2 shipped, so the ride the owner accepted is this slider left alone."},{path:"SURFACES.grass.rollingResistance",group:"Terrain — surfaces",label:"Grass drag",unit:"m/s²",min:0,max:6,step:.05,note:"The other half of the M4 gate. Top speed on grass falls as the square root of what is left of drive authority after this."},{path:"SURFACES.grass.grip",group:"Terrain — surfaces",label:"Grass grip",unit:"×",min:.2,max:1,step:.01,note:"Multiplies the lateral limit on grass. Lower values make the same corner run wider and the wheel lean less — felt, not seen."},{path:"SURFACES.gravel.rollingResistance",group:"Terrain — surfaces",label:"Gravel drag",unit:"m/s²",min:0,max:6,step:.05,note:"Gravel should cost less speed than grass and more grip. Tune the pair against each other, not in isolation."},{path:"SURFACES.gravel.grip",group:"Terrain — surfaces",label:"Gravel grip",unit:"×",min:.2,max:1,step:.01,note:"The loosest surface in the slice. This is what makes the descent ask for wider lines than the climb did."},{path:"SURFACES.grass.roughnessAmplitude",group:"Terrain — surfaces",label:"Grass roughness",unit:"m",min:0,max:.12,step:.002,note:"How far the surface texture pushes the suspension. Visible as the rider working over the ground; zero makes grass feel like a carpet."},{path:"TERRAIN.curbImpactPerMetre",group:"Terrain — contact",label:"Kerb cost",unit:"(m/s)/m",min:0,max:60,step:.5,note:"Speed lost per metre of step mounted. At 20 a 0.15 m kerb costs 3 m/s — enough that hopping it will be worth learning at M5."},{path:"TERRAIN.suspensionFrequencyHz",group:"Terrain — contact",label:"Suspension rate",unit:"Hz",min:.8,max:8,step:.05,note:"The spring’s own frequency. Roughness excites it at speed divided by the surface wavelength, so raising this quietens the ride at speed."},{path:"TERRAIN.suspensionDamping",group:"Terrain — contact",label:"Suspension damping",unit:"ζ",min:.05,max:1.5,step:.01,note:"Damping ratio. Below about 0.3 the wheel pogos after a bump; above 1 it stops moving at all and the surfaces stop reading apart."},{path:"TERRAIN.groundTiltPitchFollow",group:"Terrain — contact",label:"Rig pitch follow",unit:"×",min:0,max:1,step:.05,note:"How much of the hill’s fore-aft tilt the rig visually adopts. Zero is the EUC truth — the firmware holds the pedals level to gravity; 1 is the M4 skateboard behaviour the owner rejected."},{path:"TERRAIN.groundTiltRollFollow",group:"Terrain — contact",label:"Rig roll follow",unit:"×",min:0,max:1,step:.05,note:"How much of a cross-slope the rig visually adopts. A small value keeps the tyre reading grounded on side slopes without laying the rider over with the hill."},{path:"EUC.yawRateLow",group:"Ride — carve",label:"Yaw at rest",unit:"rad/s",min:.2,max:5,step:.05,note:"Turn authority at a standstill. High on purpose — pivoting on the spot is something the wheel is genuinely good at."},{path:"EUC.yawRateHigh",group:"Ride — carve",label:"Yaw at speed",unit:"rad/s",min:.1,max:3,step:.05,note:"Turn authority at and above carve speed. Keep it below yaw at rest or high-speed steering becomes twitchy."},{path:"EUC.carveSpeed",group:"Ride — carve",label:"Carve speed",unit:"m/s",min:2,max:25,step:.25,note:"Speed at which yaw authority has fully decayed to its high-speed value."},{path:"EUC.maxLateralG",group:"Ride — carve",label:"Lateral limit",unit:"g",min:.2,max:1.6,step:.01,note:"The ceiling on cornering acceleration, and the reason a fast turn goes wide. Also sets the lean angle at the limit: atan(this)."},{path:"EUC.rollResponseSeconds",group:"Ride — carve",label:"Roll response",unit:"s",min:.02,max:.6,step:.005,note:"Time constant for the wheel rolling into a carve. Shorter than the lean response so a turn bites immediately."},{path:"EUC.riderUpperBodyRollFactor",group:"Ride — carve",label:"Upper-body roll",unit:"×",min:0,max:1,step:.01,note:"Fraction of wheel roll retained above the hips. A low value lets the bent inside knee and shallow squat keep the shoulders near level."},{path:"EUC.wheelPitchFactor",group:"Ride — carve",label:"Wheel pitch",unit:"×",min:0,max:1,step:.01,note:"Fraction of the rider’s rendered fore-aft pitch that the wheel itself takes. Zero makes acceleration invisible on the wheel."},{path:"LIGHTING.exposure",group:"Lighting",label:"Exposure",unit:"×",min:.3,max:2,step:.01,note:"ACES tone-mapping exposure. Lighting is one coupled system — move this, the sun, and the fill one at a time."},{path:"LIGHTING.sunIntensity",group:"Lighting",label:"Sun",unit:"",min:0,max:6,step:.05,note:"Directional key light. The only shadow caster."},{path:"LIGHTING.hemisphereIntensity",group:"Lighting",label:"Sky fill",unit:"",min:0,max:3,step:.05,note:"Hemisphere fill. Too low and undersides become voids; too high and nothing reads as sitting on the ground."},{path:"EUC.riderLookIntoTurn",group:"Ride — carve",label:"Look into turn",unit:"rad",min:0,max:1,step:.01,note:"How far the head turns toward the corner at full lock. Zero makes the rider stare straight ahead through every carve."},{path:"CAMERA.distanceAtRest",group:"Camera",label:"Arm at rest",unit:"m",min:2,max:10,step:.05,note:"Spring-arm length at a standstill. Together with the value below this is half the speed expression; the other half is field of view."},{path:"CAMERA.distanceAtSpeed",group:"Camera",label:"Arm at speed",unit:"m",min:2,max:14,step:.05,note:"Spring-arm length at the reference speed. Keep it above the rest value or accelerating pulls the camera in, which reads as braking."},{path:"CAMERA.armHeight",group:"Camera",label:"Arm height",unit:"m",min:.8,max:5,step:.05,note:"Height of the camera above the contact patch. Raising it looks further down onto the ground; lowering it exaggerates speed and hides terrain, which the priority order says loses."},{path:"CAMERA.fovAtRest",group:"Camera",label:"FOV at rest",unit:"rad",min:.6,max:1.8,step:.01,note:"Vertical field of view at a standstill. Eased toward the value below with speed — the strongest speed cue available, and the easiest one to make somebody ill with."},{path:"CAMERA.fovAtSpeed",group:"Camera",label:"FOV at speed",unit:"rad",min:.6,max:2,step:.01,note:"Vertical field of view at the reference speed. A wide gap between the two is the strongest speed sensation and the fastest route to motion sickness; move it a little at a time."},{path:"CAMERA.lookAheadSeconds",group:"Camera",label:"Look-ahead",unit:"s",min:0,max:.8,step:.01,note:'How far ahead the camera aims, in seconds of travel. This is what answers "can I see where I am going"; zero aims at the rider.'},{path:"CAMERA.yawLagAtRest",group:"Camera",label:"Yaw lag at rest",unit:"s",min:.02,max:1.2,step:.01,note:"Follow time constant at a standstill. Long on purpose: the wheel pivots at 2.4 rad/s down there and a tight camera would whip."},{path:"CAMERA.yawLagAtSpeed",group:"Camera",label:"Yaw lag at speed",unit:"s",min:.02,max:1.2,step:.01,note:"Follow time constant at the reference speed. Keep it below the rest value — locked-in at speed, forgiving when manoeuvring."},{path:"CAMERA.bankFactor",group:"Camera",label:"Bank",unit:"×",min:0,max:.6,step:.01,note:"Camera roll as a fraction of the wheel’s lean, into the corner and capped. Raising it tilts the horizon, which costs terrain readability — and uncapped bank is a motion-sickness trap."},{path:"INSPECTION_CAMERA.orbitRate",group:"Camera",label:"Inspection orbit",unit:"rad/s",min:0,max:1.5,step:.01,note:"Rate of the diagnostic orbit reached with C. Zero holds a fixed angle for a screenshot. Never an acceptance view."},{path:"SIMULATION.maxStepsPerFrame",group:"Loop",label:"Max catch-up steps",unit:"steps",min:1,max:12,step:1,note:"Catch-up ceiling per frame. Lower it to see the loop deliberately drop time instead of spiralling."},{path:"RENDER.maxPixelRatio",group:"Render",label:"Pixel ratio cap",unit:"×",min:.5,max:3,step:.05,note:"Device-pixel ceiling. Changing only this must not be treated as a viewport change."},{path:"AUDIO.bedTrim",group:"Audio",label:"Ride bed trim",unit:"×",min:0,max:1,step:.01,note:"Everything the wheel and the world make — motor, wind, tyre, scrape — against warnings and impacts, which are trimmed separately. Lower it if the beeps have to shout."},{path:"AUDIO.motorPolePairs",group:"Audio",label:"Motor pole pairs",unit:"",min:1,max:30,step:1,note:"Multiplies wheel rotation to reach the electrical fundamental. The single number that decides whether it sounds like a hub motor or like an engine. 15 puts top speed near 143 Hz, where a real wheel sits."},{path:"AUDIO.motorIdleLevel",group:"Audio",label:"Motor idle hum",unit:"",min:0,max:.4,step:.01,note:"The fundamental at zero load — the parked hum. Zero since rule 5: a real EUC is nearly silent, and the owner asked for that silence. 0.09 restores the measured second-pass hum."},{path:"AUDIO.motorLoadLevel",group:"Audio",label:"Motor load response",unit:"",min:0,max:.8,step:.01,note:"How much louder the fundamental gets between coasting and full demand. This is what makes the motor answer the throttle rather than merely track the speedometer."},{path:"AUDIO.motorSingLevel",group:"Audio",label:"Motor third harmonic",unit:"",min:0,max:.6,step:.01,note:"The exact third harmonic at the reference speed — the body of the motor. Raise it for a more present machine; it cannot growl, because it is locked to the fundamental rather than detuned against it."},{path:"AUDIO.motorAirLevel",group:"Audio",label:"Motor sixth harmonic",unit:"",min:0,max:.6,step:.01,note:"The top of the turbine, arriving late so that it means speed rather than motion. This is the partial that says 15 m/s is not 8 m/s from inside the machine, as the wind says it from outside."},{path:"AUDIO.regenLevel",group:"Audio",label:"Regen braking",unit:"",min:0,max:.6,step:.01,note:"The octave partial under the braking filter sweep. It is what makes slowing down a different event from speeding up."},{path:"AUDIO.motorLoadBrighten",group:"Audio",label:"Load brightness",unit:"×",min:1,max:5,step:.05,note:"How far full load opens the motor filter. This is where working hard is heard — an electric motor under load brightens, it does not chug, and a modulated sub-octave here is what a lawnmower sounds like."},{path:"AUDIO.windLevel",group:"Audio",label:"Wind",unit:"",min:0,max:.8,step:.01,note:'The approved howl loop, rising faster than linearly with speed — with the motor silent this is the whole speed voice. The owner set its ceiling by ear: "not too loud or it will be annoying".'},{path:"AUDIO.tyreLevel",group:"Audio",label:"Tyre",unit:"",min:0,max:.9,step:.01,note:"Master level over the per-surface voices. Raise it to make surface changes more obvious; the relative voices keep their proportions."},{path:"AUDIO.beepLevel",group:"Audio",label:"Warning beeps",unit:"",min:0,max:1,step:.05,note:"Master over the whole power-ladder beep set, silenced by owner decision — arcade, not sim; the HUD light still climbs the ladder. 1 restores all three rungs exactly as they shipped in the second pass."},{path:"AUDIO.tiltBackLevel",group:"Audio",label:"Tilt-back beep",unit:"",min:0,max:.8,step:.01,note:"The top rung of the power ladder, under the Warning beeps master. It should be unmissable without being painful — if it needs to go above about 0.5, duck harder instead."},{path:"AUDIO.duckTiltBack",group:"Audio",label:"Tilt-back duck",unit:"",min:0,max:.9,step:.01,note:'How far the ride bed drops while the top warning sounds. This, not the beep level, is the real answer to "is the right thing the loudest thing?"'}]);function $S(i,e){let t=i;for(const n of e.split(".")){if(t===null||typeof t!="object")return;t=t[n]}return typeof t=="number"?t:void 0}class ZS{specs;defaults=new Map;overrideValues=new Map;listeners=new Set;constructor(e=qS,t=YS){this.specs=e;for(const n of e){const s=$S(t,n.path);if(s===void 0||!Number.isFinite(s))throw new Error(`Tunable "${n.path}" does not resolve to a finite number in the tuning root.`);this.defaults.set(n.path,s)}}views(){return this.specs.map(e=>({spec:e,value:this.get(e.path),defaultValue:this.defaults.get(e.path)??0,overridden:this.overrideValues.has(e.path)}))}specFor(e){return this.specs.find(t=>t.path===e)}get(e){const t=this.overrideValues.get(e);if(t!==void 0)return t;const n=this.defaults.get(e);if(n===void 0)throw new Error(`"${e}" is not a registered tunable.`);return n}defaultOf(e){const t=this.defaults.get(e);if(t===void 0)throw new Error(`"${e}" is not a registered tunable.`);return t}set(e,t){const n=this.specFor(e);if(!n)throw new Error(`"${e}" is not a registered tunable.`);if(!Number.isFinite(t))throw new Error(`"${e}" was given a non-finite value.`);const s=Math.min(n.max,Math.max(n.min,t)),r=this.get(e);return s===this.defaultOf(e)?this.overrideValues.delete(e):this.overrideValues.set(e,s),s!==r&&this.emit(e,s),s}reset(e){if(e!==void 0){if(!this.overrideValues.has(e))return;this.overrideValues.delete(e),this.emit(e,this.get(e));return}const t=[...this.overrideValues.keys()];this.overrideValues.clear();for(const n of t)this.emit(n,this.get(n))}overrides(){const e={};for(const[t,n]of this.overrideValues)e[t]=n;return e}overrideCount(){return this.overrideValues.size}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear(),this.overrideValues.clear()}emit(e,t){for(const n of[...this.listeners])n(e,t)}}function gt(i,e,t){return i<e?e:i>t?t:i}function Tt(i){return gt(i,0,1)}function yt(i,e,t){return i+(e-i)*t}function Xe(i,e,t,n,s){if(s<=0)return i;const r=t>0?1-Math.exp(-s/t):1,a=n*s,o=gt((e-i)*r,-a,a);return i+o}function go(i){const e=(i+Math.PI)%(Math.PI*2);return(e<=0?e+Math.PI*2:e)-Math.PI}function KS(i){return i>0?1:i<0?-1:0}function tp(i,e,t){let n=Math.round(i*100)*374761393+Math.round(e*100)*668265263+t*1442695041|0;return n=Math.imul(n^n>>>13,1274126177),n=n^n>>>16,(n>>>0)/4294967296}const QS=.22,JS=1,_a=3;function jS(i){const e=new kt;if(e.name="checkpoint-gates",e.visible=!1,i.length===0)return{group:e,gates:0,drawCalls:0,triangles:0,get visible(){return e.visible},setVisible(g){e.visible=g},setProgress(){},flare(){},step(){},dispose(){e.removeFromParent()}};const t=new In(1,1,1);t.translate(0,.5,0);const n=t.getAttribute("position").count;t.setAttribute("color",new Je(new Array(n*3).fill(1),3));const s=(t.getIndex()?.count??n)/3,r=new yo({color:16777215,vertexColors:!0}),a=i.length*_a,o=new Nf(t,r,a);o.name="checkpoint-gate-bars",o.castShadow=!1,o.receiveShadow=!1,o.raycast=()=>{};const l=[],c=new Map,u=new at,d=new at,h=new at,f=new F,m=new Mn,v=new F,p=new F(0,1,0);i.forEach((g,_)=>{const R=g.halfExtents.x,C=g.halfExtents.y,I=R<=qe.gateDrawnMaxHalfWidth,k=I?R:qe.gateWideMarkerHalfWidth,z=g.centre.y-C,D=C*2,V=QS,L=C*JS;f.set(g.centre.x,z,g.centre.z),m.setFromAxisAngle(p,g.headingY),v.setScalar(1),h.compose(f,m,v);const X=_*_a,ee=[];for(const J of[1,-1]){I?(d.makeScale(V,D+L,V),d.setPosition(J*(R+V/2),-L,0)):(d.makeScale(0,0,0),d.setPosition(0,D,0)),u.multiplyMatrices(h,d);const te=J>0?0:1;o.setMatrixAt(X+te,u),ee[te]=u.clone()}d.makeScale(k*2+V*2,V,V),d.setPosition(0,D,0),u.multiplyMatrices(h,d),o.setMatrixAt(X+2,u),ee[2]=u.clone();const Y={kind:g.kind,routeIndex:g.routeIndex,firstInstance:X,transforms:ee,flare:0};l.push(Y),c.set(g.routeIndex,Y)}),o.instanceMatrix.needsUpdate=!0,o.computeBoundingSphere(),e.add(o);const b=new Ve,M=new Ve,T=new Ve;let x=i[0]?.routeIndex??-1;const A=new at().makeScale(0,0,0),y=()=>{for(const g of l){const _=g.routeIndex===x,R=g.kind==="finish"&&x===l.length,C=_||R||g.flare>0;for(let I=0;I<_a;I+=1)o.setMatrixAt(g.firstInstance+I,C?g.transforms[I]:A)}o.instanceMatrix.needsUpdate=!0},E=()=>{for(const g of l){const _=g.kind==="finish"?Ft.gateFinish:x>=0&&g.routeIndex<x?Ft.gatePassed:Ft.gate;b.setHex(_),g.flare>0?(M.setHex(Qe.statusBootColour).multiplyScalar(qe.gateFlareIntensity),T.copy(b).lerp(M,g.flare)):T.copy(b);for(let R=0;R<_a;R+=1)o.setColorAt(g.firstInstance+R,T)}o.instanceColor!==null&&(o.instanceColor.needsUpdate=!0)};return E(),y(),{group:e,gates:l.length,drawCalls:1,triangles:s*a,get visible(){return e.visible},setVisible(g){e.visible=g},setProgress(g){g!==x&&(x=g,E(),y())},flare(g){const _=c.get(g);_!==void 0&&(_.flare=1,E(),y())},step(g){if(g<=0)return;let _=!1;for(const R of l)R.flare<=0||(R.flare=Tt(R.flare-g/qe.gateFlareSeconds),_=!0);_&&(E(),y())},dispose(){o.dispose(),t.dispose(),r.dispose(),e.clear(),e.removeFromParent()}}}const Yu=Math.PI*2,e_=.63,t_=.78,n_=-.81,i_=.59,s_=.37,r_=1.7,a_=.62,o_=.38;function fl(i,e,t,n){if(t<=0||n<=0)return 0;const s=(i*e_+e*t_)/n*Yu,r=(i*n_+e*i_)/(n*s_)*Yu+r_;return t*(a_*Math.sin(s)+o_*Math.sin(r))}function bo(){return{height:0,normal:{x:0,y:1,z:0},surface:"pavement",offCourse:!1}}function l_(i,e){e.height=i.height,e.normal.x=i.normal.x,e.normal.y=i.normal.y,e.normal.z=i.normal.z,e.surface=i.surface,e.offCourse=i.offCourse}function c_(){const i={};for(const e of jf){const t=wn[e];i[e]={rollingResistance:t.rollingResistance,grip:t.grip,roughnessAmplitude:t.roughnessAmplitude,roughnessWavelength:t.roughnessWavelength,wobbleInjection:t.wobbleInjection}}return i}function h_(){return{gravity:gs.gravity,wheelRadius:it.tyreDiameter/2,maxLeanPitch:j.maxLeanPitch,leanResponseSeconds:j.leanResponseSeconds,leanRateLimit:j.leanRateLimit,leanToAccel:j.leanToAccel,brakeAuthority:j.brakeAuthority,dragCoefficient:j.dragCoefficient,stoppedSpeed:j.stoppedSpeed,reverseEntrySpeed:j.reverseEntrySpeed,reverseEngageSeconds:j.reverseEngageSeconds,maxReverseSpeed:j.maxReverseSpeed,yawRateLow:j.yawRateLow,yawRateHigh:j.yawRateHigh,carveSpeed:j.carveSpeed,maxLateralG:j.maxLateralG,rollResponseSeconds:j.rollResponseSeconds,riderUpperBodyRollFactor:j.riderUpperBodyRollFactor,maxRiderPitch:j.maxRiderPitch,riderCruisePitchFactor:j.riderCruisePitchFactor,riderAccelerationPitchGain:j.riderAccelerationPitchGain,riderPitchResponseSeconds:j.riderPitchResponseSeconds,wheelPitchFactor:j.wheelPitchFactor,riderLookIntoTurn:j.riderLookIntoTurn,riderLookResponseSeconds:j.riderLookResponseSeconds,riderSlopeLeanFactor:j.riderSlopeLeanFactor,riderSlopeLeanFullSpeed:j.riderSlopeLeanFullSpeed,restDelaySeconds:j.restDelaySeconds,restResponseSeconds:j.restResponseSeconds,restReleaseSeconds:j.restReleaseSeconds,rollingResistanceScale:Et.rollingResistanceScale,curbThreshold:Et.curbThreshold,maxStepUp:it.pedalHeight*Et.stepUpPedalFactor,curbImpactPerMetre:Et.curbImpactPerMetre,wallScrubDecel:Et.wallScrubDecel,obstacleCrashSpeed:j.obstacleCrashSpeed,feelerDistance:Et.feelerDistance,suspensionFrequencyHz:Et.suspensionFrequencyHz,suspensionDamping:Et.suspensionDamping,suspensionTravel:it.suspensionTravel,groundTiltResponseSeconds:Et.groundTiltResponseSeconds,maxGroundTilt:Et.maxGroundTilt,groundTiltPitchFollow:Et.groundTiltPitchFollow,groundTiltRollFollow:Et.groundTiltRollFollow,hopCompressSeconds:j.hopCompressSeconds,hopLaunchSpeed:j.hopLaunchSpeed,hopChargeSeconds:j.hopChargeSeconds,hopChargeHeightBonus:j.hopChargeHeightBonus,hopSuspensionRebound:j.hopSuspensionRebound,suspensionPreload:j.suspensionPreload,airYawFactor:j.airYawFactor,airDragFactor:j.airDragFactor,airPitchAuthority:j.airPitchAuthority,airPitchResponseSeconds:j.airPitchResponseSeconds,airTuck:j.airTuck,crouchHeldAmount:j.crouchHeldAmount,crouchResponseSeconds:j.crouchResponseSeconds,landingAbsorbSeconds:j.landingAbsorbSeconds,dropLaunchThreshold:Et.dropLaunchThreshold,landingImpactReference:j.landingImpactReference,landingMisalignReference:j.landingMisalignReference,landingSurfaceWeight:j.landingSurfaceWeight,landingRoughnessReference:j.landingRoughnessReference,landingHeavyScore:j.landingHeavyScore,landingWobbleScore:j.landingWobbleScore,landingCrashScore:j.landingCrashScore,landingSpeedLossPerScore:j.landingSpeedLossPerScore,landingMaxSpeedLoss:j.landingMaxSpeedLoss,landingStateSeconds:j.landingStateSeconds,landingSuspensionKick:j.landingSuspensionKick,pedalHeight:it.pedalHeight,pedalHalfSpan:it.pedalSpan/2,pedalStrikeDecel:j.pedalStrikeDecel,pedalStrikeGraceAngle:j.pedalStrikeGraceAngle,pedalStrikeJolt:j.pedalStrikeJolt,wobbleMasterGain:j.wobbleMasterGain,wobbleFrequencyHz:j.wobbleFrequencyHz,wobbleMaxYaw:j.wobbleMaxYaw,wobbleCrashEnergy:j.wobbleCrashEnergy,wobbleDampingAggressive:j.wobbleDampingAggressive,wobbleDampingSmooth:j.wobbleDampingSmooth,wobbleSmoothThrottle:j.wobbleSmoothThrottle,wobbleSmoothSteerSeconds:j.wobbleSmoothSteerSeconds,wobbleSmoothResponseSeconds:j.wobbleSmoothResponseSeconds,wobbleFootCorrectionStart:j.wobbleFootCorrectionStart,wobbleFootCorrectionDamping:j.wobbleFootCorrectionDamping,wobbleFootCorrectionResponseSeconds:j.wobbleFootCorrectionResponseSeconds,wobbleComfortSpeed:j.wobbleComfortSpeed,wobbleSpeedGain:j.wobbleSpeedGain,wobbleSurfaceGain:j.wobbleSurfaceGain,wobbleSteerReversalGain:j.wobbleSteerReversalGain,wobbleReversalMemorySeconds:j.wobbleReversalMemorySeconds,wobblePedalStrikeGain:j.wobblePedalStrikeGain,wobbleCurbGain:j.wobbleCurbGain,wobbleLandingGain:j.wobbleLandingGain,wobbleStateEnergy:j.wobbleStateEnergy,powerComfortSpeed:j.powerComfortSpeed,powerLimitSpeed:j.powerLimitSpeed,powerSlopeLoad:j.powerSlopeLoad,powerAccelLoad:j.powerAccelLoad,powerLandingLoad:j.powerLandingLoad,powerLandingDecaySeconds:j.powerLandingDecaySeconds,powerResponseSeconds:j.powerResponseSeconds,powerReliefSeconds:j.powerReliefSeconds,powerNoticeLoad:j.powerNoticeLoad,powerWarnLoad:j.powerWarnLoad,powerTiltBackLoad:j.powerTiltBackLoad,powerTiltBackRelease:j.powerTiltBackRelease,tiltBackLeanBack:j.tiltBackLeanBack,tiltBackEngageSeconds:j.tiltBackEngageSeconds,tiltBackReleaseSeconds:j.tiltBackReleaseSeconds,tiltBackPedalPitch:j.tiltBackPedalPitch,crashWheelDecel:j.crashWheelDecel,crashWheelFallSeconds:j.crashWheelFallSeconds,crashWheelLean:j.crashWheelLean,crashRecoverEarliestSeconds:j.crashRecoverEarliestSeconds,crashRecoverAutoSeconds:j.crashRecoverAutoSeconds,crashRecoverSpeedFactor:j.crashRecoverSpeedFactor,crashSafeDelaySeconds:j.crashSafeDelaySeconds,crashSafeWobbleCeiling:j.crashSafeWobbleCeiling,crashInvulnerableSeconds:j.crashInvulnerableSeconds,crashRecoverBlendSeconds:j.crashRecoverBlendSeconds,crashStepOffSpeed:j.crashStepOffSpeed,crashRunOutSpeed:j.crashRunOutSpeed,crashSeparationForward:j.crashSeparationForward,crashSeparationLateral:j.crashSeparationLateral,crashSeparationSeconds:j.crashSeparationSeconds,crashRiderDrop:j.crashRiderDrop,crashRiderTumble:j.crashRiderTumble,crashSideFallDrop:j.crashSideFallDrop,crashSideFallRoll:j.crashSideFallRoll,crashTumbleHz:j.crashTumbleHz,crashTumbleDampSeconds:j.crashTumbleDampSeconds,crashTumbleRoll:j.crashTumbleRoll,crashTumblePitch:j.crashTumblePitch,crashTumbleBounce:j.crashTumbleBounce}}function Qa(){return{x:0,y:0,z:0,headingY:0,rollAngle:0,riderRoll:0,riderPitch:0,riderLookYaw:0,wheelPitch:0,wheelSpin:0,groundPitch:0,groundRoll:0,suspensionOffset:0,restFactor:0,speed:0,crouch:0,tuck:0,airBlend:0,airHeight:0,groundY:0,pedalStrike:0,wobble:0,wobbleFootCorrection:0,wobbleYaw:0,alert:0,crashBlend:0,crashForward:0,crashLateral:0,crashDrop:0,crashTumble:0,crashRoll:0,wheelCrashLean:0,recoverBlend:1,tiltBack:0}}function pl(i,e){e.x=i.x,e.y=i.y,e.z=i.z,e.headingY=i.headingY,e.rollAngle=i.rollAngle,e.riderRoll=i.riderRoll,e.riderPitch=i.riderPitch,e.riderLookYaw=i.riderLookYaw,e.wheelPitch=i.wheelPitch,e.wheelSpin=i.wheelSpin,e.groundPitch=i.groundPitch,e.groundRoll=i.groundRoll,e.suspensionOffset=i.suspensionOffset,e.restFactor=i.restFactor,e.speed=i.speed,e.crouch=i.crouch,e.tuck=i.tuck,e.airBlend=i.airBlend,e.airHeight=i.airHeight,e.groundY=i.groundY,e.pedalStrike=i.pedalStrike,e.wobble=i.wobble,e.wobbleFootCorrection=i.wobbleFootCorrection,e.wobbleYaw=i.wobbleYaw,e.alert=i.alert,e.crashBlend=i.crashBlend,e.crashForward=i.crashForward,e.crashLateral=i.crashLateral,e.crashDrop=i.crashDrop,e.crashTumble=i.crashTumble,e.crashRoll=i.crashRoll,e.wheelCrashLean=i.wheelCrashLean,e.recoverBlend=i.recoverBlend,e.tiltBack=i.tiltBack}class qu{tuning;surfaces;sampler;spawn;x=0;y=0;z=0;headingY=0;speed=0;leanPitch=0;riderPitch=0;slopeLean=0;riderLookYaw=0;longitudinalAccel=0;rollAngle=0;yawRate=0;lateralAccel=0;lateralLimited=!1;wheelSpin=0;distanceTravelled=0;reversing=!1;reverseHold=0;restHold=0;restFactor=0;grounded=!0;surface="pavement";state="mounted";ground=bo();probe=bo();slope=0;slopeAccel=0;rollingResistance=0;lateralLimitG=0;groundPitch=0;groundRoll=0;suspensionOffset=0;suspensionVelocity=0;suspensionCompression=0;curbAhead=0;lastStepUp=0;blocked=!1;collisionImpact=0;offCourse=!1;airborne=!1;verticalVelocity=0;airDirX=0;airDirZ=1;groundY=0;airTime=0;airApex=0;compressTimer=0;compressing=!1;crouchHold=0;hopCharge=0;hopWasHeld=!1;hops=0;crouch=0;tuck=0;absorb=0;airBlend=0;airPitch=0;landingTimer=0;landingQuality="none";landingImpact=0;landingMisalignment=0;landingScore=0;landingSpeedLoss=0;landings=0;pedalStrike=0;pedalClearance=0;justTookOff=!1;justTouchedDown=!1;wobbleEnergy=0;wobblePhase=0;wobbleYaw=0;wobbleRate=0;wobbleSmoothness=0;wobbleFootCorrection=0;steerSign=0;steerHold=0;committedSteerSign=0;committedRoll=0;loadFactor=0;powerStage="normal";landingLoad=0;tiltBack=0;tiltBackLatched=!1;crashing=!1;crashCause="none";crashMotion="none";crashTime=0;crashes=0;crashSpeed=0;crashSide=1;crashBlend=0;wheelCrashLean=0;recoverTimer=0;invulnerableTimer=0;safeX=0;safeZ=0;safeHeading=0;safeHold=0;constructor(e,t={}){this.sampler=e,this.tuning={...h_(),...t.tuning},this.surfaces={...c_(),...t.surfaces},this.spawn=t.spawn??{position:{x:0,y:0,z:0},headingY:0},this.reset()}setTuning(e){Object.assign(this.tuning,e)}setSurfaceResponse(e,t){const n=this.surfaces[e];n!==void 0&&Object.assign(n,t)}reset(e){e&&(this.spawn=e),this.x=this.spawn.position.x,this.z=this.spawn.position.z,this.headingY=this.spawn.headingY,this.speed=0,this.leanPitch=0,this.riderPitch=0,this.slopeLean=0,this.riderLookYaw=0,this.longitudinalAccel=0,this.rollAngle=0,this.yawRate=0,this.lateralAccel=0,this.lateralLimited=!1,this.wheelSpin=0,this.distanceTravelled=0,this.reversing=!1,this.reverseHold=0,this.restHold=0,this.restFactor=0,this.state="mounted",this.slope=0,this.slopeAccel=0,this.suspensionOffset=0,this.suspensionVelocity=0,this.suspensionCompression=0,this.curbAhead=0,this.lastStepUp=0,this.blocked=!1,this.collisionImpact=0,this.airborne=!1,this.verticalVelocity=0,this.airDirX=Math.sin(this.headingY),this.airDirZ=Math.cos(this.headingY),this.airTime=0,this.airApex=0,this.compressTimer=0,this.compressing=!1,this.crouchHold=0,this.hopCharge=0,this.hopWasHeld=!1,this.hops=0,this.crouch=0,this.tuck=0,this.absorb=0,this.airBlend=0,this.airPitch=0,this.landingTimer=0,this.landingQuality="none",this.landingImpact=0,this.landingMisalignment=0,this.landingScore=0,this.landingSpeedLoss=0,this.landings=0,this.pedalStrike=0,this.justTookOff=!1,this.justTouchedDown=!1,this.crashes=0,this.clearInstability(),this.crashCause="none",this.crashMotion="none",this.safeX=this.x,this.safeZ=this.z,this.safeHeading=this.headingY,this.safeHold=0,this.sampler.sampleGround(this.x,this.z,this.ground),this.y=this.ground.height,this.groundY=this.ground.height,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.grounded=!0,this.pedalClearance=Math.atan2(this.tuning.pedalHeight,this.tuning.pedalHalfSpan);const t=this.surfaceResponse();this.rollingResistance=t.rollingResistance*this.tuning.rollingResistanceScale,this.lateralLimitG=this.tuning.maxLateralG*t.grip,this.writeGroundTilt(1),this.suspensionOffset=fl(this.x,this.z,t.roughnessAmplitude,t.roughnessWavelength)}step(e,t){if(e<=0)return;const n=this.tuning,s=gt(Ku(t.throttle),-1,1),r=gt(Ku(t.steer),-1,1);if(this.justTookOff=!1,this.justTouchedDown=!1,this.collisionImpact=0,this.crashing){this.stepCrash(e,s,r,t.crouch);return}const a=this.speed,o=this.surfaceResponse(),l=Math.sin(this.headingY),c=Math.cos(this.headingY);this.stepHop(e,t);const u=this.airborne;this.stepPower(e);const d=yt(n.maxLeanPitch,-n.tiltBackLeanBack,this.tiltBack);this.leanPitch=Xe(this.leanPitch,u?0:Math.min(s*n.maxLeanPitch,d),n.leanResponseSeconds,n.leanRateLimit,e);const h=Math.sin(this.leanPitch),f=Math.abs(h)<.01,m=!u&&!f&&h*this.speed<0&&Math.abs(this.speed)>n.stoppedSpeed,v=u?0:(m?n.brakeAuthority:n.leanToAccel)*h;this.slopeAccel=u?0:$u(this.ground.normal,l,c,n.gravity),this.slope=this.slopeAccel===0?0:Math.asin(gt(-this.slopeAccel/n.gravity,-1,1));let p=this.speed+(v+this.slopeAccel)*e;this.rollingResistance=u?0:o.rollingResistance*n.rollingResistanceScale;const M=(n.dragCoefficient*(u?n.airDragFactor:1)*p*p+this.rollingResistance)*e;if(p>0?p=Math.max(0,p-M):p<0&&(p=Math.min(0,p+M)),u)this.reverseHold=0;else if(this.reversing)this.reverseHold=0,p=Math.max(p,-n.maxReverseSpeed),s>=0&&p>=-n.stoppedSpeed&&(this.reversing=!1,p<0&&(p=0));else{const te=s<-.01;te&&Math.abs(this.speed)<=n.reverseEntrySpeed?this.reverseHold+=e:this.reverseHold=0,this.reverseHold>=n.reverseEngageSeconds&&te&&(this.reversing=!0),p<0&&(p=0)}const T=Tt(Math.abs(p)/n.carveSpeed),x=yt(n.yawRateLow,n.yawRateHigh,T),A=-r*x*(u?n.airYawFactor:1);this.lateralLimitG=n.maxLateralG*o.grip;const y=this.lateralLimitG*n.gravity;let E=u?0:p*A,g=A,_=!1;if(!u&&Math.abs(E)>y&&(_=!0,E=KS(E)*y,g=E/p),this.yawRate=g,this.lateralAccel=E,this.lateralLimited=_,this.headingY+=g*e,this.rollAngle=Xe(this.rollAngle,Math.atan(E/n.gravity),n.rollResponseSeconds,1/0,e),this.updatePedalStrike(u),this.pedalStrike!==0){const te=n.pedalStrikeDecel*Math.abs(this.pedalStrike)*e;p=p>0?Math.max(0,p-te):Math.min(0,p+te)}this.stepWobble(e,s,r,p,u,o);const R=u?0:s>0?Math.max(0,this.longitudinalAccel):s<0?Math.min(0,this.longitudinalAccel):0,C=u?0:gt(this.leanPitch*n.riderCruisePitchFactor+R*n.riderAccelerationPitchGain,-n.maxRiderPitch,n.maxRiderPitch);this.riderPitch=Xe(this.riderPitch,C,n.riderPitchResponseSeconds,n.leanRateLimit,e),this.airPitch=Xe(this.airPitch,u?s*n.airPitchAuthority:0,n.airPitchResponseSeconds,1/0,e);const I=this.slope*n.riderSlopeLeanFactor*Tt(Math.abs(this.speed)/Math.max(1e-6,n.riderSlopeLeanFullSpeed));this.slopeLean=Xe(this.slopeLean,I,n.groundTiltResponseSeconds,1/0,e),this.riderLookYaw=Xe(this.riderLookYaw,-r*n.riderLookIntoTurn,n.riderLookResponseSeconds,1/0,e);const k=this.y;u&&(this.verticalVelocity-=n.gravity*e,this.y+=this.verticalVelocity*e,this.airTime+=e);const z=this.headingY+this.wobbleYaw,D=u?this.airDirX:Math.sin(z),V=u?this.airDirZ:Math.cos(z),L=p*e,X=this.advance(D*L,V*L,e,p,u);p=X.speed,this.collisionImpact=X.impactSpeed,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.groundY=this.ground.height,this.lastStepUp>0&&this.injectWobble(this.lastStepUp*n.wobbleCurbGain);let ee=!1;u?this.y<=this.groundY&&this.verticalVelocity<=0?(p=this.land(p,this.surfaceResponse()),ee=!0):this.y-this.groundY>this.airApex&&(this.airApex=this.y-this.groundY):X.excess<-n.dropLaunchThreshold?this.leaveGround(k,p*Math.sin(this.slope),D,V):this.y=this.groundY,this.grounded=!this.airborne,this.speed=p,this.longitudinalAccel=ee?0:(p-a)/e,this.wheelSpin+=(X.keptX*D+X.keptZ*V)/n.wheelRadius,this.distanceTravelled+=X.distance,this.writeGroundTilt(e),this.stepCrouch(e,t),this.stepSuspension(e,o),this.readFeeler(Math.sin(this.headingY),Math.cos(this.headingY)),this.airBlend=Xe(this.airBlend,this.airborne?1:0,n.crouchResponseSeconds,1/0,e),this.invulnerableTimer>0?this.invulnerableTimer=Math.max(0,this.invulnerableTimer-e):this.collisionImpact>=n.obstacleCrashSpeed?this.beginCrash("obstacle",p):this.wobbleEnergy>=n.wobbleCrashEnergy?this.beginCrash(this.pedalStrike!==0?"pedalStrike":"wobble",p):ee&&this.landingQuality==="crash"&&this.beginCrash("landing",p),this.landingTimer>0&&(this.landingTimer=Math.max(0,this.landingTimer-e)),this.recoverTimer>0&&(this.recoverTimer=Math.max(0,this.recoverTimer-e)),this.crashing?this.state="crashing":this.airborne?this.state="airborne":this.compressing?this.state="compressing":this.recoverTimer>0?this.state="recovering":this.landingTimer>0?this.state="landing":this.tiltBackLatched?this.state="tiltBack":m?this.state="braking":this.pedalStrike!==0?this.state="pedalStrike":this.wobbleEnergy>=n.wobbleStateEnergy?this.state="wobbling":Math.abs(p)<=n.stoppedSpeed&&!this.reversing?this.state="mounted":f?this.state="coasting":this.state="rolling";const Y=this.state==="mounted"&&Math.abs(s)<.01&&Math.abs(r)<.01;this.restHold=Y?this.restHold+e:0;const J=this.restHold>=n.restDelaySeconds;this.restFactor=Xe(this.restFactor,J?1:0,J?n.restResponseSeconds:n.restReleaseSeconds,1/0,e),this.updateSafePosition(e)}updateSafePosition(e){const t=this.tuning;if(!(this.grounded&&!this.crashing&&!this.offCourse&&!this.blocked&&!this.compressing&&this.wobbleEnergy<t.crashSafeWobbleCeiling&&this.tiltBack<1e-6&&Math.abs(this.speed)>t.stoppedSpeed)){this.safeHold=0;return}this.safeHold=Math.min(this.safeHold+e,t.crashSafeDelaySeconds),!(this.safeHold<t.crashSafeDelaySeconds)&&(this.safeX=this.x,this.safeZ=this.z,this.safeHeading=this.headingY)}stepPower(e){const t=this.tuning;this.landingLoad=Xe(this.landingLoad,0,t.powerLandingDecaySeconds,1/0,e);const n=Math.abs(this.speed),s=Tt((n-t.powerComfortSpeed)/Math.max(1e-6,t.powerLimitSpeed-t.powerComfortSpeed)),r=Math.max(0,Math.sin(this.slope))*t.powerSlopeLoad*Tt(n/Math.max(1e-6,t.powerLimitSpeed)),a=Math.max(0,this.longitudinalAccel)/Math.max(1e-6,t.leanToAccel)*t.powerAccelLoad,o=this.airborne?this.landingLoad:s+r+a+this.landingLoad;this.loadFactor=Xe(this.loadFactor,o,o>this.loadFactor?t.powerResponseSeconds:t.powerReliefSeconds,1/0,e),this.tiltBackLatched?this.loadFactor<t.powerTiltBackLoad*t.powerTiltBackRelease&&(this.tiltBackLatched=!1):this.loadFactor>=t.powerTiltBackLoad&&(this.tiltBackLatched=!0),this.tiltBack=Xe(this.tiltBack,this.tiltBackLatched?1:0,this.tiltBackLatched?t.tiltBackEngageSeconds:t.tiltBackReleaseSeconds,1/0,e),this.powerStage=this.tiltBackLatched?"tiltBack":this.loadFactor>=t.powerWarnLoad?"warn":this.loadFactor>=t.powerNoticeLoad?"notice":"normal"}stepWobble(e,t,n,s,r,a){const o=this.tuning,l=this.wobbleEnergy,c=Math.abs(n)<.01?0:n>0?1:-1;c!==this.steerSign?(c!==0&&this.committedSteerSign===-c&&!r&&this.injectWobble(Math.abs(this.committedRoll)*o.wobbleSteerReversalGain*Tt(Math.abs(s)/Math.max(1e-6,o.carveSpeed))),this.steerSign=c,this.steerHold=0):this.steerHold+=e,c!==0&&(this.committedSteerSign=c),c!==0?this.committedRoll=this.rollAngle:this.committedRoll=Xe(this.committedRoll,0,o.wobbleReversalMemorySeconds,1/0,e);const u=Math.abs(t)<=o.wobbleSmoothThrottle&&this.steerHold>=o.wobbleSmoothSteerSeconds?1:0;this.wobbleSmoothness=Xe(this.wobbleSmoothness,u,o.wobbleSmoothResponseSeconds,1/0,e);const d=!r&&this.wobbleEnergy>=o.wobbleFootCorrectionStart?1:0;if(this.wobbleFootCorrection=Xe(this.wobbleFootCorrection,d,o.wobbleFootCorrectionResponseSeconds,1/0,e),this.invulnerableTimer>0){this.wobbleEnergy=0,this.wobblePhase=0,this.wobbleYaw=0,this.wobbleRate=0,this.wobbleFootCorrection=0;return}if(!r){const p=Math.max(0,Math.abs(s)-o.wobbleComfortSpeed)*o.wobbleSpeedGain+a.wobbleInjection*Math.abs(s)*o.wobbleSurfaceGain+Math.abs(this.pedalStrike)*o.wobblePedalStrikeGain;this.wobbleEnergy+=p*Tt(o.wobbleMasterGain)*e}const h=yt(o.wobbleDampingAggressive,o.wobbleDampingSmooth,this.wobbleSmoothness)+this.wobbleFootCorrection*o.wobbleFootCorrectionDamping;this.wobbleEnergy=Math.max(0,this.wobbleEnergy-h*this.wobbleEnergy*e),this.wobbleRate=(this.wobbleEnergy-l)/e,this.wobblePhase+=2*Math.PI*o.wobbleFrequencyHz*e,this.wobblePhase>=2*Math.PI&&(this.wobblePhase-=2*Math.PI);const f=Tt((this.wobbleEnergy-o.wobbleStateEnergy)/Math.max(1e-6,o.wobbleCrashEnergy-o.wobbleStateEnergy)),m=o.wobbleMaxYaw*f;this.wobbleYaw=r?0:m*Math.sin(this.wobblePhase)}injectWobble(e){!(e>0)||this.crashing||this.invulnerableTimer>0||(this.wobbleEnergy+=e*Tt(this.tuning.wobbleMasterGain))}beginCrash(e,t){const n=this.tuning;this.crashing=!0,this.crashCause=e,this.crashSpeed=Math.abs(t),this.crashes+=1,this.crashTime=0,this.crashBlend=0,this.wheelCrashLean=0,this.recoverTimer=0,this.state="crashing",this.crashMotion=e==="pedalStrike"||e==="obstacle"||this.crashSpeed>n.crashRunOutSpeed?"sideFall":this.crashSpeed>n.crashStepOffSpeed?"runOut":"stepOff",this.crashSide=this.pedalStrike!==0?Math.sign(this.pedalStrike):this.rollAngle!==0?Math.sign(this.rollAngle):1,this.leanPitch=0,this.compressing=!1,this.compressTimer=0,this.crouchHold=0,this.hopCharge=0,this.hopWasHeld=!1,this.reversing=!1,this.reverseHold=0,this.restHold=0,this.restFactor=0,this.yawRate=0,this.lateralAccel=0,this.lateralLimited=!1,this.pedalStrike=0,this.tiltBackLatched=!1,this.wobbleEnergy=0,this.wobblePhase=0,this.wobbleYaw=0,this.wobbleRate=0,this.wobbleSmoothness=0,this.wobbleFootCorrection=0}stepCrash(e,t,n,s){const r=this.tuning;this.crashTime+=e;const a=this.surfaceResponse(),o=Math.sin(this.headingY),l=Math.cos(this.headingY);this.slopeAccel=$u(this.ground.normal,o,l,r.gravity),this.slope=this.slopeAccel===0?0:Math.asin(gt(-this.slopeAccel/r.gravity,-1,1)),this.rollingResistance=a.rollingResistance*r.rollingResistanceScale;let c=this.speed+this.slopeAccel*e;const u=(r.crashWheelDecel+this.rollingResistance+r.dragCoefficient*c*c)*e;c>0?c=Math.max(0,c-u):c<0&&(c=Math.min(0,c+u));const d=c*e,h=this.advance(o*d,l*d,e,c,!1);c=h.speed,this.speed=c,this.longitudinalAccel=0,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.groundY=this.ground.height,this.y=this.groundY,this.grounded=!0,this.wheelSpin+=(h.keptX*o+h.keptZ*l)/r.wheelRadius,this.distanceTravelled+=h.distance,this.writeGroundTilt(e),this.stepSuspension(e,a),this.crashBlend=Xe(this.crashBlend,1,r.crashSeparationSeconds,1/0,e),this.wheelCrashLean=Xe(this.wheelCrashLean,r.crashWheelLean,r.crashWheelFallSeconds,1/0,e),this.rollAngle=Xe(this.rollAngle,0,r.rollResponseSeconds,1/0,e),this.riderPitch=Xe(this.riderPitch,0,r.riderPitchResponseSeconds,1/0,e),this.slopeLean=Xe(this.slopeLean,0,r.groundTiltResponseSeconds,1/0,e),this.airPitch=Xe(this.airPitch,0,r.airPitchResponseSeconds,1/0,e),this.riderLookYaw=Xe(this.riderLookYaw,0,r.riderLookResponseSeconds,1/0,e),this.crouch=Xe(this.crouch,0,r.crouchResponseSeconds,1/0,e),this.tuck=Xe(this.tuck,0,r.crouchResponseSeconds,1/0,e),this.absorb=Xe(this.absorb,0,r.landingAbsorbSeconds,1/0,e),this.airBlend=Xe(this.airBlend,0,r.crouchResponseSeconds,1/0,e),this.tiltBack=Xe(this.tiltBack,0,r.tiltBackReleaseSeconds,1/0,e),this.loadFactor=Xe(this.loadFactor,0,r.powerReliefSeconds,1/0,e),this.landingLoad=Xe(this.landingLoad,0,r.powerLandingDecaySeconds,1/0,e),this.powerStage="normal",this.landingTimer=0,this.state="crashing";const f=Math.abs(t)>.01||Math.abs(n)>.01||s;(this.crashTime>=r.crashRecoverEarliestSeconds&&f||this.crashTime>=r.crashRecoverAutoSeconds)&&this.respawn()}respawn(){const e=this.tuning,t=this.crashSpeed*e.crashRecoverSpeedFactor;this.x=this.safeX,this.z=this.safeZ,this.headingY=this.safeHeading,this.speed=t,this.leanPitch=0,this.riderPitch=0,this.slopeLean=0,this.riderLookYaw=0,this.longitudinalAccel=0,this.rollAngle=0,this.yawRate=0,this.lateralAccel=0,this.lateralLimited=!1,this.reversing=!1,this.reverseHold=0,this.restHold=0,this.restFactor=0,this.blocked=!1,this.collisionImpact=0,this.lastStepUp=0,this.curbAhead=0,this.slope=0,this.slopeAccel=0,this.airborne=!1,this.verticalVelocity=0,this.airTime=0,this.airApex=0,this.airDirX=Math.sin(this.headingY),this.airDirZ=Math.cos(this.headingY),this.airPitch=0,this.airBlend=0,this.compressing=!1,this.compressTimer=0,this.crouchHold=0,this.hopCharge=0,this.hopWasHeld=!1,this.crouch=0,this.tuck=0,this.absorb=0,this.landingTimer=0,this.pedalStrike=0,this.clearInstability(),this.invulnerableTimer=e.crashInvulnerableSeconds,this.recoverTimer=e.crashRecoverBlendSeconds,this.safeHold=0,this.state="recovering",this.sampler.sampleGround(this.x,this.z,this.ground),this.y=this.ground.height,this.groundY=this.ground.height,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.grounded=!0;const n=this.surfaceResponse();this.rollingResistance=n.rollingResistance*e.rollingResistanceScale,this.lateralLimitG=e.maxLateralG*n.grip,this.writeGroundTilt(1),this.suspensionVelocity=0,this.suspensionCompression=0,this.suspensionOffset=fl(this.x,this.z,n.roughnessAmplitude,n.roughnessWavelength)}clearInstability(){this.wobbleEnergy=0,this.wobblePhase=0,this.wobbleYaw=0,this.wobbleRate=0,this.wobbleSmoothness=0,this.wobbleFootCorrection=0,this.steerSign=0,this.steerHold=0,this.committedSteerSign=0,this.committedRoll=0,this.loadFactor=0,this.landingLoad=0,this.powerStage="normal",this.tiltBack=0,this.tiltBackLatched=!1,this.crashing=!1,this.crashTime=0,this.crashBlend=0,this.crashSpeed=0,this.crashSide=1,this.wheelCrashLean=0,this.recoverTimer=0,this.invulnerableTimer=0}advance(e,t,n,s,r){const a=this.tuning;this.blocked=!1,this.lastStepUp=0;const o=r?0:a.maxStepUp;if(e===0&&t===0)return this.sampler.sampleGround(this.x,this.z,this.ground),{speed:s,distance:0,excess:0,keptX:0,keptZ:0,impactSpeed:0};const l=this.excessAt(e,t,r),c=r||!this.obstacleWithinWheelRadius(e,t);if(l<=o&&c){this.commit(e,t,!0);let y=s;if(!r&&l>a.curbThreshold){this.lastStepUp=l;const E=l*a.curbImpactPerMetre;y=s>0?Math.max(0,s-E):Math.min(0,s+E)}return{speed:y,distance:Math.hypot(e,t),excess:l,keptX:e,keptZ:t,impactSpeed:0}}this.blocked=!0;const u=this.excessAt(e,0,r),d=this.excessAt(0,t,r),h=u<=o&&(r||!this.obstacleWithinWheelRadius(e,0)),f=d<=o&&(r||!this.obstacleWithinWheelRadius(0,t));let m=0,v=0,p=0;h&&(!f||Math.abs(e)>=Math.abs(t))?(m=e,p=u):f&&(v=t,p=d),m===0&&v===0?this.sampler.sampleGround(this.x,this.z,this.ground):this.commit(m,v,!1);const b=Math.hypot(e,t),M=Math.hypot(m,v),T=b>0?Tt(1-M/b):1,x=a.wallScrubDecel*T*T*n;return{speed:s>0?Math.max(0,s-x):Math.min(0,s+x),distance:M,excess:p,keptX:m,keptZ:v,impactSpeed:r?0:Math.abs(s)*T}}obstacleWithinWheelRadius(e,t){const n=this.sampler.raycastObstacle;if(n===void 0||Math.hypot(e,t)===0)return!1;const r=this.ground.normal,a=r.y>1e-4?-(r.x*e+r.z*t)/r.y:0,o=Math.hypot(e,a,t)+this.tuning.wheelRadius,l=n.call(this.sampler,{x:this.x,y:this.y+this.tuning.maxStepUp+1e-6,z:this.z},{x:e,y:a,z:t},o);return l!==null&&l<=o}excessAt(e,t,n=!1){if(this.sampler.sampleGround(this.x+e,this.z+t,this.probe),n)return this.probe.height-this.y;const s=this.ground.normal,r=s.y>1e-4?-(s.x*e+s.z*t)/s.y:0;return this.probe.height-this.y-r}commit(e,t,n){this.x+=e,this.z+=t,n?l_(this.probe,this.ground):this.sampler.sampleGround(this.x,this.z,this.ground)}writeGroundTilt(e){const t=this.tuning,n=this.ground.normal,s=Math.cos(this.headingY),r=Math.sin(this.headingY),a=s*n.x-r*n.z,o=r*n.x+s*n.z,l=gt(Math.asin(gt(o,-1,1)),-t.maxGroundTilt,t.maxGroundTilt)*t.groundTiltPitchFollow,c=gt(Math.atan2(-a,Math.max(1e-4,n.y)),-t.maxGroundTilt,t.maxGroundTilt)*t.groundTiltRollFollow;if(e>=1){this.groundPitch=l,this.groundRoll=c;return}this.groundPitch=Xe(this.groundPitch,l,t.groundTiltResponseSeconds,1/0,e),this.groundRoll=Xe(this.groundRoll,c,t.groundTiltResponseSeconds,1/0,e)}stepSuspension(e,t){const n=this.tuning,s=this.airborne?0:this.crouch*n.suspensionPreload,r=fl(this.x,this.z,t.roughnessAmplitude,t.roughnessWavelength)-s,a=2*Math.PI*n.suspensionFrequencyHz,o=-a*a*(this.suspensionOffset-r)-2*n.suspensionDamping*a*this.suspensionVelocity;this.suspensionVelocity+=o*e,this.suspensionOffset+=this.suspensionVelocity*e;const l=n.suspensionTravel;this.suspensionOffset>l?(this.suspensionOffset=l,this.suspensionVelocity>0&&(this.suspensionVelocity=0)):this.suspensionOffset<-l&&(this.suspensionOffset=-l,this.suspensionVelocity<0&&(this.suspensionVelocity=0)),this.suspensionCompression=r-this.suspensionOffset}readFeeler(e,t){const n=this.tuning.feelerDistance,s=e*n,r=t*n,a=this.excessAt(s,r);this.curbAhead=Math.abs(a)>this.tuning.curbThreshold?a:0}stepHop(e,t){const n=this.tuning,s=t.hop&&!this.hopWasHeld;if(this.hopWasHeld=t.hop,this.airborne){this.compressTimer=0,this.compressing=!1,this.crouchHold=0;return}if(this.compressing){this.compressTimer=Math.max(0,this.compressTimer-e),this.compressTimer===0&&this.launchHop();return}if(s){this.hopCharge=Tt(this.crouchHold/Math.max(1e-6,n.hopChargeSeconds)),this.compressing=!0,this.compressTimer=n.hopCompressSeconds,this.crouchHold=0,this.compressTimer<=0&&this.launchHop();return}t.crouch?this.crouchHold=Math.min(this.crouchHold+e,n.hopChargeSeconds):this.crouchHold=0}launchHop(){const e=this.tuning,t=e.hopLaunchSpeed*Math.sqrt(1+e.hopChargeHeightBonus*this.hopCharge);this.leaveGround(this.y,t+this.speed*Math.sin(this.slope),0,0),this.compressing=!1,this.compressTimer=0,this.crouchHold=0,this.hops+=1,this.suspensionVelocity+=t*e.hopSuspensionRebound}leaveGround(e,t,n,s){const r=Math.hypot(n,s);r>1e-9?(this.airDirX=n/r,this.airDirZ=s/r):(this.airDirX=Math.sin(this.headingY),this.airDirZ=Math.cos(this.headingY)),this.y=e,this.verticalVelocity=t,this.airborne=!0,this.grounded=!1,this.airTime=0,this.airApex=0,this.justTookOff=!0}land(e,t){const n=this.tuning,s=this.ground.normal,r=Math.sin(this.headingY),a=Math.cos(this.headingY),o=e*this.airDirX,l=e*this.airDirZ,c=Math.max(0,-(o*s.x+this.verticalVelocity*s.y+l*s.z)),u=gt(this.airDirX*r+this.airDirZ*a,-1,1),d=Math.acos(u),h=c/Math.max(1e-6,n.landingImpactReference)+d/Math.max(1e-6,n.landingMisalignReference)+n.landingSurfaceWeight*(t.roughnessAmplitude/Math.max(1e-6,n.landingRoughnessReference)),f=gt((h-n.landingHeavyScore)*n.landingSpeedLossPerScore,0,n.landingMaxSpeedLoss);return this.landingQuality=h>=n.landingCrashScore?"crash":h>=n.landingWobbleScore?"wobble":h>=n.landingHeavyScore?"heavy":"clean",this.landingImpact=c,this.landingMisalignment=d,this.landingScore=h,this.landingSpeedLoss=f,this.landings+=1,this.landingTimer=n.landingStateSeconds,this.justTouchedDown=!0,this.y=this.groundY,this.verticalVelocity=0,this.airborne=!1,this.grounded=!0,this.airTime=0,this.airApex=0,this.suspensionVelocity-=c*n.landingSuspensionKick,this.absorb=Tt(c/Math.max(1e-6,n.landingImpactReference)),this.landingQuality!=="crash"&&this.injectWobble((h-n.landingHeavyScore)*n.wobbleLandingGain),this.landingLoad=Math.min(this.landingLoad+c/Math.max(1e-6,n.landingImpactReference)*n.powerLandingLoad,n.powerLandingLoad*2),e*u*(1-f)}updatePedalStrike(e){const t=this.tuning,n=this.pedalStrike;this.pedalClearance=Math.atan2(t.pedalHeight,t.pedalHalfSpan);const s=Math.abs(this.rollAngle)-this.pedalClearance-t.pedalStrikeGraceAngle;if(e||s<=0){this.pedalStrike=0;return}this.pedalStrike=this.rollAngle>0?s:-s,n===0&&(this.suspensionVelocity+=t.pedalStrikeJolt)}stepCrouch(e,t){const n=this.tuning,s=!this.airborne&&t.crouch,r=!this.compressing&&s,a=this.compressing?1:this.airborne?n.airTuck:r?n.crouchHeldAmount:0;this.crouch=Xe(this.crouch,a,n.crouchResponseSeconds,1/0,e),this.absorb=Xe(this.absorb,0,n.landingAbsorbSeconds,1/0,e),this.tuck=Xe(this.tuck,s?1:0,n.crouchResponseSeconds,1/0,e)}surfaceResponse(){return this.surfaces[this.surface]??this.surfaces.pavement}get tookOff(){return this.justTookOff}get canAcceptHop(){return!this.airborne&&!this.compressing&&!this.crashing}get crashed(){return this.crashing}get touchedDown(){return this.justTouchedDown}get lastLandingImpact(){return this.landingImpact}get lastLandingQuality(){return this.landingQuality}get pedalStrikeDepth(){return this.pedalStrike}get currentSurface(){return this.surface}get lastHopCharge(){return this.hopCharge}get powerLoad(){return this.loadFactor}get offRoute(){return this.offCourse}get powerWarning(){return this.powerStage}get wobbleLevel(){return Tt(this.wobbleEnergy/Math.max(1e-6,this.tuning.wobbleCrashEnergy))}get obstacleImpact(){return this.collisionImpact}writePose(e){const t=this.tuning,n=this.tiltBack*t.tiltBackPedalPitch;e.x=this.x,e.y=this.y,e.z=this.z,e.headingY=this.headingY,e.rollAngle=this.rollAngle,e.riderRoll=this.rollAngle*this.tuning.riderUpperBodyRollFactor,e.riderPitch=this.riderPitch+this.slopeLean+this.airPitch-n,e.riderLookYaw=this.riderLookYaw,e.wheelPitch=this.riderPitch*t.wheelPitchFactor+this.airPitch-n,e.wheelSpin=this.wheelSpin,e.groundPitch=this.groundPitch,e.groundRoll=this.groundRoll,e.suspensionOffset=this.suspensionOffset,e.restFactor=this.restFactor,e.speed=this.speed,e.crouch=Tt(this.crouch+this.absorb),e.tuck=this.tuck,e.airBlend=this.airBlend,e.airHeight=this.y-this.groundY,e.groundY=this.groundY,e.pedalStrike=this.pedalStrike,e.wobble=Tt(this.wobbleEnergy/Math.max(1e-6,t.wobbleCrashEnergy)),e.wobbleFootCorrection=this.wobbleFootCorrection,e.wobbleYaw=this.wobbleYaw,e.alert=Math.max(Zu(this.wobbleEnergy,[t.wobbleStateEnergy*.5,t.wobbleStateEnergy,t.wobbleCrashEnergy]),Zu(this.loadFactor,[t.powerNoticeLoad,t.powerWarnLoad,t.powerTiltBackLoad])),e.tiltBack=this.tiltBack,e.recoverBlend=Tt(1-this.recoverTimer/Math.max(1e-6,t.crashRecoverBlendSeconds));const s=this.crashBlend;if(e.crashBlend=s,s<=0){e.crashForward=0,e.crashLateral=0,e.crashDrop=0,e.crashTumble=0,e.crashRoll=0,e.wheelCrashLean=0;return}const r=this.crashMotion==="sideFall",a=this.crashCause==="obstacle"?0:r?.5:this.crashMotion==="runOut"?1:.35,o=r?1:this.crashMotion==="stepOff"?.5:.18;e.crashForward=t.crashSeparationForward*a*s,e.crashLateral=this.crashSide*t.crashSeparationLateral*o*s;const l=Math.sin(2*Math.PI*t.crashTumbleHz*this.crashTime)*Math.exp(-this.crashTime/Math.max(1e-6,t.crashTumbleDampSeconds)),c=t.crashTumbleBounce*Math.max(0,l)*s;r?(e.crashDrop=t.crashSideFallDrop*s-c,e.crashTumble=0,e.crashRoll=this.crashSide*(t.crashSideFallRoll*s+t.crashTumbleRoll*l*s)):(e.crashDrop=t.crashRiderDrop*s-c*.5,e.crashTumble=(t.crashRiderTumble+t.crashTumblePitch*l)*s,e.crashRoll=0),e.wheelCrashLean=this.crashSide*this.wheelCrashLean}snapshot(){const e=this.tuning,t=this.tiltBack*e.tiltBackPedalPitch;return{state:this.state,position:{x:this.x,y:this.y,z:this.z},headingY:this.headingY,speed:this.speed,speedKph:this.speed*3.6,longitudinalAccel:this.longitudinalAccel,leanPitch:this.leanPitch,riderPitch:this.riderPitch+this.slopeLean+this.airPitch-t,slopeLean:this.slopeLean,restFactor:this.restFactor,riderLookYaw:this.riderLookYaw,wheelPitch:this.riderPitch*e.wheelPitchFactor+this.airPitch-t,rollAngle:this.rollAngle,riderRoll:this.rollAngle*e.riderUpperBodyRollFactor,yawRate:this.yawRate,lateralAccel:this.lateralAccel,lateralLimited:this.lateralLimited,reversing:this.reversing,grounded:this.grounded,surface:this.surface,wheelSpin:this.wheelSpin,distanceTravelled:this.distanceTravelled,offCourse:this.offCourse,groundNormal:{...this.ground.normal},slope:this.slope,slopeAccel:this.slopeAccel,rollingResistance:this.rollingResistance,lateralLimitG:this.lateralLimitG,suspensionOffset:this.suspensionOffset,suspensionCompression:this.suspensionCompression,curbAhead:this.curbAhead,lastStepUp:this.lastStepUp,blocked:this.blocked,collisionImpact:this.collisionImpact,compressing:this.compressing,hopCharge:this.hopCharge,crouchCharge:Tt(this.crouchHold/Math.max(1e-6,this.tuning.hopChargeSeconds)),hops:this.hops,verticalVelocity:this.verticalVelocity,airHeight:this.y-this.groundY,airApex:this.airApex,airTime:this.airTime,airMisalignment:this.airborne?Math.acos(gt(this.airDirX*Math.sin(this.headingY)+this.airDirZ*Math.cos(this.headingY),-1,1)):0,landingQuality:this.landingQuality,landingImpact:this.landingImpact,landingMisalignment:this.landingMisalignment,landingScore:this.landingScore,landingSpeedLoss:this.landingSpeedLoss,landings:this.landings,pedalStrike:this.pedalStrike,pedalClearance:this.pedalClearance,wobbleEnergy:this.wobbleEnergy,wobbleYaw:this.wobbleYaw,wobbleRate:this.wobbleRate,wobbleSmoothness:this.wobbleSmoothness,wobbleFootCorrection:this.wobbleFootCorrection,loadFactor:this.loadFactor,powerStage:this.powerStage,tiltBack:this.tiltBack,crashed:this.crashing,crashCause:this.crashCause,crashMotion:this.crashMotion,crashTime:this.crashing?this.crashTime:0,crashes:this.crashes,recoveryReady:this.crashing&&this.crashTime>=e.crashRecoverEarliestSeconds,invulnerable:this.invulnerableTimer,safePosition:{x:this.safeX,y:0,z:this.safeZ},safeHeading:this.safeHeading}}}function $u(i,e,t,n){const s=e*i.x+t*i.z;if(s===0)return 0;const r=e-s*i.x,a=-s*i.y,o=t-s*i.z,l=Math.hypot(r,a,o);return l<=1e-6?0:-n*(a/l)}function Zu(i,e){if(!(i>0)||e.length===0)return 0;const t=1/e.length;let n=0;for(let s=0;s<e.length;s+=1){const r=Math.max(e[s],n+1e-6);if(i<r)return(s+(i-n)/(r-n))*t;n=r}return 1}function Ku(i){return Number.isFinite(i)?i:0}function Fn(i){if(i.length<2)throw new Error("a loft profile needs at least two rings");const t=(i[0].y<=i[i.length-1].y?i:[...i].reverse()).map(n=>({y:n.y,halfWidth:n.halfWidth,halfDepth:n.halfDepth,z:n.z??0,x:n.x??0,square:n.square??2}));for(let n=1;n<t.length;n+=1)if(!(t[n].y>t[n-1].y))throw new Error(`loft ring ${n} does not rise above ring ${n-1}`);return t}function u_(i,e){const t=i.length-1,n=Math.min(Math.max(e,0),t),s=Math.min(Math.floor(n),t-1),r=n-s,a=i[s],o=i[s+1];return{y:a.y+(o.y-a.y)*r,halfWidth:a.halfWidth+(o.halfWidth-a.halfWidth)*r,halfDepth:a.halfDepth+(o.halfDepth-a.halfDepth)*r,z:a.z+(o.z-a.z)*r,x:a.x+(o.x-a.x)*r,square:a.square+(o.square-a.square)*r}}function Gt(i,e){const t=i.length-1;if(e<=i[0].y)return 0;if(e>=i[t].y)return t;for(let n=1;n<=t;n+=1){const s=i[n];if(e<=s.y){const r=i[n-1];return n-1+(e-r.y)/(s.y-r.y)}}return t}function bs(i,e,t,n){const s=u_(i,t),r=2/s.square,a=Math.cos(e),o=Math.sin(e);return n.set(s.x+s.halfWidth*Math.sign(a)*Math.abs(a)**r,s.y,s.z+s.halfDepth*Math.sign(o)*Math.abs(o)**r)}const Qu=new F,Ju=new F,Ma=new F,ya=new F;function np(i,e,t,n){const a=i.length-1;bs(i,e+.001,t,Ma),bs(i,e-.001,t,ya),Qu.subVectors(Ma,ya);const o=Math.min(t+.001,a),l=Math.max(t-.001,0);bs(i,e,o,Ma),bs(i,e,l,ya),Ju.subVectors(Ma,ya),n.crossVectors(Ju,Qu);const c=n.length();return c<1e-9?n.set(0,t>a-t?1:-1,0):n.multiplyScalar(1/c)}function ml(i){return i.halfWidth<1e-4&&i.halfDepth<1e-4}function Cn(i,e={}){const t=Math.max(3,Math.round(e.radialSegments??16)),n=Math.max(0,Math.round(e.subdivisions??0)),s=e.shade??1,r=[];for(let v=0;v<i.length-1;v+=1)for(let p=0;p<=n;p+=1)r.push(v+p/(n+1));r.push(i.length-1);const a=[],o=[],l=[],c=new F,u=ml(i[0]),d=ml(i[i.length-1]);for(const v of r)for(let p=0;p<t;p+=1)bs(i,p/t*Math.PI*2,v,c),a.push(c.x,c.y,c.z),o.push(s,s,s);const h=(v,p)=>v*t+p%t;for(let v=0;v<r.length-1;v+=1)for(let p=0;p<t;p+=1){const b=h(v,p),M=h(v,p+1),T=h(v+1,p+1),x=h(v+1,p);l.push(b,x,M,M,x,T)}const f=(v,p,b)=>{if(ml(p))return;const M=a.length/3;a.push(p.x,p.y,p.z),o.push(s,s,s);for(let T=0;T<t;T+=1){const x=h(v,T),A=h(v,T+1);b?l.push(M,A,x):l.push(M,x,A)}};(e.capBottom??!0)&&!u&&f(0,i[0],!1),(e.capTop??!0)&&!d&&f(r.length-1,i[i.length-1],!0);const m=new Ut;return m.setAttribute("position",new Je(a,3)),m.setAttribute("color",new Je(o,3)),m.setIndex(l),m.computeVertexNormals(),m}function $i(i,e){const t=Math.max(1,Math.round(e.uSegments??8)),n=Math.max(1,Math.round(e.vSegments??4)),s=e.lift??.01,r=e.sink??-.006,a=e.skew??0,o=e.taper??0,l=e.shade??1,c=[],u=[],d=[],h=new F,f=new F,m=(g,_,R)=>{const C=c.length/3;return bs(i,g,_,h),np(i,g,_,f),c.push(h.x+f.x*R,h.y+f.y*R,h.z+f.z*R),u.push(l,l,l),C},v=(g,_)=>{const R=e.u0+(e.u1-e.u0)*g,C=(e.v0+e.v1)/2+a*(g-.5),I=(e.v1-e.v0)/2*(1-o*Math.abs(g-.5)*2);return[R,C+I*(_*2-1)]},p=[],b=[];for(let g=0;g<=t;g+=1){const _=[],R=[];for(let C=0;C<=n;C+=1){const[I,k]=v(g/t,C/n);_.push(m(I,k,s)),R.push(m(I,k,r))}p.push(_),b.push(R)}for(let g=0;g<t;g+=1)for(let _=0;_<n;_+=1){const R=p[g][_],C=p[g+1][_],I=p[g+1][_+1],k=p[g][_+1];d.push(R,k,C,C,k,I);const z=b[g][_],D=b[g+1][_],V=b[g+1][_+1],L=b[g][_+1];d.push(z,D,L,D,V,L)}const M=(g,_,R)=>{for(let C=0;C<g.length-1;C+=1){const I=c.length/3;for(const k of[g[C],g[C+1],_[C+1],_[C]])c.push(c[k*3],c[k*3+1],c[k*3+2]),u.push(l,l,l);R?d.push(I,I+2,I+1,I,I+3,I+2):d.push(I,I+1,I+2,I,I+2,I+3)}},T=p.map(g=>g[0]),x=b.map(g=>g[0]),A=p.map(g=>g[n]),y=b.map(g=>g[n]);if(M(T,x,!1),M(A,y,!0),M(p[0],b[0],!0),M(p[t],b[t],!1),(e.u1-e.u0)*(e.v1-e.v0)<0)for(let g=0;g<d.length;g+=3){const _=d[g+1];d[g+1]=d[g+2],d[g+2]=_}const E=new Ut;return E.setAttribute("position",new Je(c,3)),E.setAttribute("color",new Je(u,3)),E.setIndex(d),E.computeVertexNormals(),E}function Hn(i,e=1){const t=i.getAttribute("position").count,n=new Float32Array(t*3).fill(e);return i.setAttribute("color",new pn(n,3)),i}function Ai(i){if(i.length===0)throw new Error("nothing to merge");const e=[],t=[],n=[],s=[];for(const a of i){const o=a.getAttribute("position"),l=a.getAttribute("normal"),c=a.getAttribute("color");if(!l)throw new Error("a merged geometry needs normals");if(!c)throw new Error("a merged geometry needs a color attribute; see shaded()");const u=e.length/3;for(let h=0;h<o.count;h+=1)e.push(o.getX(h),o.getY(h),o.getZ(h)),t.push(l.getX(h),l.getY(h),l.getZ(h)),n.push(c.getX(h),c.getY(h),c.getZ(h));const d=a.getIndex();if(d)for(let h=0;h<d.count;h+=1)s.push(d.getX(h)+u);else for(let h=0;h<o.count;h+=1)s.push(h+u);a.dispose()}const r=new Ut;return r.setAttribute("position",new Je(e,3)),r.setAttribute("normal",new Je(t,3)),r.setAttribute("color",new Je(n,3)),r.setIndex(s),r}function To(i,e,t=[],n={}){const s=n.flatten??.92,r=n.square??2.3,[a,o,l]=e,c=m=>m<.5?a+(o-a)*(m/.5):o+(l-o)*((m-.5)/.5),u=[],d=(m,v=1)=>{const p=c(Math.min(Math.max(m,0),1))*v;u.push({y:-m*i,halfWidth:p,halfDepth:p*s,square:r})};d(0);const h=new Set([.25,.5,.75]);for(const m of t)h.add(m-.018),h.add(m+.018);const f=[...h].filter(m=>m>.02&&m<.97).sort((m,v)=>m-v);for(const m of f){const v=t.some(p=>Math.abs(m-p)<.02);d(m,v?m<t.find(p=>Math.abs(m-p)<.02)?1.05:.95:1)}if(n.roundEnd??!0){const m=c(1);for(const[v,p]of[[.5,.86],[.85,.54],[1,0]])u.push({y:-i-m*.55*v,halfWidth:m*p,halfDepth:m*p*s,square:r})}else d(1);return Fn(u)}const wa=[Ft.statusNormal,Ft.statusNotice,Ft.statusWarn,Ft.statusCritical],Sn=it.tyreDiameter/2,d_=it.tyreWidth/2,tr=Sn,f_=it.shellHeight-tr,Mh=it.shellWidth/2,p_=it.shellLength/2,Hc=1-it.shellCapFraction,m_=i=>tr+f_*i,Ea=i=>Hc*i,gl=i=>Hc+(1-Hc)*i,ls=(i,e,t,n)=>({y:m_(i),halfWidth:Mh*e,halfDepth:p_*t,square:n}),yi=Fn([ls(Ea(0),.47,.57,2.5),ls(Ea(.38),.87,.85,3),ls(Ea(.78),1,.977,3.2),ls(Ea(1),1,1,3.2),ls(gl(.32),.94,.94,2.9),ls(gl(.58),.8,.83,2.5),ls(gl(.78),.58,.65,2.3)]),Ta=yi[yi.length-1].y,cs=(i,e)=>({y:i*d_,halfWidth:e,halfDepth:e}),g_=Fn([cs(-1,Sn*.824),cs(-.62,Sn*.928),cs(-.3,Sn*.986),cs(0,Sn),cs(.3,Sn*.986),cs(.62,Sn*.928),cs(1,Sn*.824)]),ip=it.padThickness*.8,b_=it.padLength/2,v_=it.padHeight/2,x_=Mh+it.padThickness-ip,hs=(i,e,t,n)=>({y:i*v_,halfWidth:ip*e,halfDepth:b_*t,square:n}),S_=Fn([hs(-1,.34,.68,2.4),hs(-.8,.92,.87,2.9),hs(-.22,1,1,3.2),hs(.16,.97,.99,3.2),hs(.55,.86,.93,2.9),hs(.86,.6,.78,2.6),hs(1,.3,.62,2.3)]),Ji=(it.pedalSpan-it.shellWidth)/4,vs=it.pedalLength/2,$s=it.pedalThickness/2,__=Fn([{y:-$s,halfWidth:Ji*.88,halfDepth:vs*.89,square:4},{y:-$s*.45,halfWidth:Ji*.985,halfDepth:vs*.985,square:6},{y:$s*.45,halfWidth:Ji,halfDepth:vs,square:6},{y:$s,halfWidth:Ji*.9,halfDepth:vs*.91,square:4}]),M_=Fn([{y:-Qe.statusLightHeight/2,halfWidth:Qe.statusLightWidth*.38,halfDepth:Qe.statusLightDepth*.32,square:3},{y:-Qe.statusLightHeight*.18,halfWidth:Qe.statusLightWidth*.5,halfDepth:Qe.statusLightDepth*.5,square:4.5},{y:Qe.statusLightHeight*.18,halfWidth:Qe.statusLightWidth*.5,halfDepth:Qe.statusLightDepth*.5,square:4.5},{y:Qe.statusLightHeight/2,halfWidth:Qe.statusLightWidth*.38,halfDepth:Qe.statusLightDepth*.32,square:3}]),bl=.086,Gc=.02,vl=tr+it.suspensionTravel,ju=Gc+.006,ed=.075,y_=3,w_=4.6,td=.5,E_=.55,T_=.42,A_=1.14,R_=.72;function C_(){const i=new kt;i.name="euc-blockout";const e=[],t=[],n=Y=>(e.push(Y),Y),s=Y=>(t.push(Y),Y),r=s(new nn({color:Ft.shell,roughness:.45,metalness:.1,vertexColors:!0})),a=s(new nn({color:Ft.tyre,roughness:.92,metalness:0,vertexColors:!0})),o=s(new nn({color:Ft.pad,roughness:.85,metalness:0,vertexColors:!0})),l=s(new nn({color:Ft.pedal,roughness:.55,metalness:.75,vertexColors:!0})),c=s(new nn({color:16777215,emissive:Ft.headlight,emissiveIntensity:1.4,roughness:.3,vertexColors:!0})),u=s(new nn({color:5246996,emissive:Ft.taillight,emissiveIntensity:1.1,roughness:.4,vertexColors:!0})),d=s(new nn({color:Ft.accent,emissive:1855388,emissiveIntensity:.35,roughness:.35,metalness:.2,vertexColors:!0})),h=Y=>(Y.castShadow=!0,Y),f=Y=>{const{from:J,to:te,...Te}=Y;return $i(yi,{...Te,v0:Gt(yi,J),v1:Gt(yi,te)})},m=new kt;m.name="euc-body",i.add(m);const v=Cn(g_,{radialSegments:20,capBottom:!1,capTop:!1}),p=Hn(new ii(Sn*.828,Sn*.828,it.tyreWidth,20),y_),b=Hn(new ii(Sn*.46,Sn*.46,it.tyreWidth+.016,16),w_),M=new ht(n(Ai([v,p,b])),a);M.rotation.z=Math.PI/2,M.position.y=Sn,M.castShadow=!0,M.receiveShadow=!0,M.name="euc-tyre",i.add(M);const x=[Hn(new ii(.016,.016,bl*2+.018,12)).rotateZ(Math.PI/2).translate(0,tr,0)];for(const Y of[-1,1])x.push(Hn(new ii(Gc,Gc,vl-tr,10)).translate(Y*bl,(tr+vl)/2,0));const A=h(new ht(n(Ai(x)),l));A.name="euc-suspension",i.add(A);const y=[Cn(yi,{radialSegments:20})],E=Ta+(it.shellHeight-Ta)*.62;for(const Y of[-.064,.064])y.push(Hn(new In(.03,E-Ta,.022),td).translate(0,(Ta+E)/2,Y));y.push(Hn(new In(.038,it.shellHeight-E,.166),td).translate(0,(E+it.shellHeight)/2,0));for(const Y of[-1,1])y.push(Hn(new ii(ju,ju,ed,10),E_).translate(Y*bl,vl+ed/2-.002,0));const g=h(new ht(n(Ai(y)),r));g.receiveShadow=!0,g.name="euc-shell",m.add(g);const _=[];for(const Y of[0,Math.PI])_.push(f({u0:Y-.55,u1:Y+.55,from:.545,to:.575,lift:.005,sink:-.01,uSegments:8,vSegments:2}));_.push(f({u0:Math.PI/2-.62,u1:Math.PI/2+.62,from:.43,to:.468,lift:.005,sink:-.01,uSegments:8,vSegments:2,taper:.35}));const R=new ht(n(Ai(_)),d);R.name="euc-accent",m.add(R);for(const Y of[-1,1]){const J=h(new ht(n(Cn(S_,{radialSegments:12})),o));J.position.set(Y*x_,it.padCentreHeight,0),J.name=`euc-pad-${Y>0?"left":"right"}`,m.add(J)}for(const Y of[-1,1]){const J=[Cn(__,{radialSegments:14}),Hn(new In(Ji*1.4,.005,vs*1.36),T_).translate(0,$s,0),Hn(new In(.01,.019,vs*1.46),A_).translate(Y*Ji*.93,$s*.4,0),Hn(new ii(.011,.011,vs*.44,8),R_).rotateX(Math.PI/2).translate(-Y*Ji*.96,0,0)],te=h(new ht(n(Ai(J)),l));te.position.set(Y*(Mh+Ji),it.pedalHeight,0),te.receiveShadow=!0,te.name=`euc-pedal-${Y>0?"left":"right"}`,m.add(te)}const C=new ht(n(f({u0:Math.PI/2-.44,u1:Math.PI/2+.44,from:.502,to:.53,lift:.004,sink:-.012,uSegments:6,vSegments:2,taper:.4})),c);C.name="euc-headlight",m.add(C);const I=new ht(n(f({u0:-Math.PI/2-.26,u1:-Math.PI/2+.26,from:.5,to:.521,lift:.004,sink:-.012,uSegments:6,vSegments:2,taper:.45})),u);I.name="euc-taillight",m.add(I);const k=s(new nn({color:1053206,emissive:Ft.statusNormal,emissiveIntensity:Qe.statusCalmIntensity,roughness:.35,metalness:.1,vertexColors:!0})),z=new ht(n(Cn(M_,{radialSegments:12})),k);z.name="euc-status-light";const D=Gt(yi,.556),V=bs(yi,-Math.PI/2,D,new F),L=np(yi,-Math.PI/2,D,new F);z.position.copy(V).addScaledVector(L,Qe.statusLightDepth*.42),z.rotation.x=-.55,m.add(z);const X=new Ve,ee=new Ve;return{group:i,tyre:M,body:m,statusLight:z,setStatus(Y,J,te=0){const Te=Tt(Y)*(wa.length-1),Oe=Math.min(wa.length-2,Math.floor(Te));X.setHex(wa[Oe]),ee.setHex(wa[Oe+1]),k.emissive.copy(X).lerp(ee,Te-Oe);const q=Tt(Y),G=yt(Qe.statusNoticeHz,Qe.statusCriticalHz,q),ne=q<=0?1:1-Qe.statusPulseDepth*q*(.5-.5*Math.cos(2*Math.PI*G*J));k.emissiveIntensity=yt(Qe.statusCalmIntensity,Qe.statusAlarmIntensity,q)*ne;const re=Tt(te);re>0&&(X.setHex(Qe.statusBootColour),k.emissive.lerp(X,re),k.emissiveIntensity=Math.max(k.emissiveIntensity,Qe.statusBootIntensity*re))},dispose(){for(const Y of e)Y.dispose();for(const Y of t)Y.dispose();e.length=0,t.length=0,i.removeFromParent()}}}function P_(){return{rollAngle:0,riderPitch:0,torsoPitch:0,lookYaw:0,restFactor:0,groundY:0,crouch:0,tuck:0,airBlend:0,falling:!1,pedalStrike:0,wobble:0,wobbleFootCorrection:0,wobbleYaw:0,crash:0}}const nd=new F(0,-1,0),id=new F(0,0,1),xl=new F,Aa=new F,Mr=new F,Sl=new F,sd=new F,rd=new Mn;function Ra(i,e,t){xl.copy(i.target).sub(i.origin);const n=xl.length();if(n<1e-9){e.identity(),t.identity();return}Aa.copy(xl).multiplyScalar(1/n);const s=Math.min(Math.max((i.upperLength**2-i.lowerLength**2+n**2)/(2*n),-i.upperLength),i.upperLength),r=Math.sqrt(Math.max(0,i.upperLength**2-s**2));Mr.copy(i.bendToward).addScaledVector(Aa,-i.bendToward.dot(Aa)),Mr.lengthSq()<1e-12&&Mr.set(0,0,1),Mr.normalize(),Sl.copy(i.origin).addScaledVector(Aa,s).addScaledVector(Mr,r),e.setFromUnitVectors(nd,sd.copy(Sl).sub(i.origin).normalize()),rd.copy(e).invert(),t.setFromUnitVectors(nd,sd.copy(i.target).sub(Sl).normalize().applyQuaternion(rd))}const cn=he.torsoWidth/2,hn=he.torsoDepth/2,Mi=Fn([{y:-.01,halfWidth:1.03*cn,halfDepth:1.01*hn,square:2.8},{y:.018,halfWidth:.98*cn,halfDepth:.96*hn,square:2.8},{y:.05,halfWidth:.9*cn,halfDepth:.93*hn,square:2.6},{y:.155,halfWidth:.86*cn,halfDepth:.87*hn,square:2.5},{y:.29,halfWidth:.97*cn,halfDepth:1.01*hn,square:2.6,z:.008},{y:.4,halfWidth:1*cn,halfDepth:.98*hn,square:2.9,z:.006},{y:.47,halfWidth:1*cn,halfDepth:.9*hn,square:3.1,z:.002},{y:.5,halfWidth:.93*cn,halfDepth:.82*hn,square:2.9},{y:.528,halfWidth:.74*cn,halfDepth:.66*hn,square:2.5},{y:.548,halfWidth:.44*cn,halfDepth:.5*hn,square:2.3}]),L_=Fn([{y:-.088,halfWidth:.76*cn,halfDepth:.8*hn,square:2.6},{y:-.055,halfWidth:.92*cn,halfDepth:.91*hn,square:2.7},{y:-.02,halfWidth:.97*cn,halfDepth:.95*hn,square:2.7},{y:.03,halfWidth:.93*cn,halfDepth:.9*hn,square:2.6}]),I_=To(he.thighLength,[.079,.072,.061],[.3,.62],{flatten:.94,square:2.4}),ad=To(he.shinLength,[.064,.058,.046],[.42],{flatten:.92,square:2.4}),od=To(he.upperArmLength,[.058,.05,.043],[.55],{flatten:.95,square:2.3}),ld=To(he.forearmLength,[.047,.041,.033],[.45],{flatten:.94,square:2.3}),D_=Fn([{y:-.048,halfWidth:.07,halfDepth:.068,square:2.4},{y:-.01,halfWidth:.062,halfDepth:.06,square:2.3},{y:.05,halfWidth:.055,halfDepth:.053,square:2.2},{y:.098,halfWidth:.052,halfDepth:.05,square:2.2}]),en=Fn([{y:.088,halfWidth:.07,halfDepth:.08,square:2.3,z:.012},{y:.118,halfWidth:.104,halfDepth:.116,square:2.5,z:.012},{y:.158,halfWidth:.119,halfDepth:.13,square:2.6,z:.008},{y:.215,halfWidth:.124,halfDepth:.133,square:2.5,z:.004},{y:.268,halfWidth:.113,halfDepth:.119,square:2.3},{y:.308,halfWidth:.084,halfDepth:.088,square:2.2},{y:.336,halfWidth:.04,halfDepth:.042,square:2.2},{y:.348,halfWidth:0,halfDepth:0}]),k_=Fn([{y:-.098,halfWidth:.03,halfDepth:.026,square:2.4},{y:-.08,halfWidth:.052,halfDepth:.04,square:2.7},{y:-.035,halfWidth:.062,halfDepth:.047,square:2.9},{y:.02,halfWidth:.064,halfDepth:.04,square:2.9},{y:.082,halfWidth:.06,halfDepth:.031,square:2.9},{y:.122,halfWidth:.043,halfDepth:.022,square:2.6},{y:.142,halfWidth:.014,halfDepth:.009,square:2.4}]),F_=Fn([{y:0,halfWidth:.04,halfDepth:.035,square:2.6},{y:-.022,halfWidth:.046,halfDepth:.04,square:2.8},{y:-.04,halfWidth:.041,halfDepth:.037,square:2.8},{y:-.082,halfWidth:.039,halfDepth:.034,square:2.9},{y:-.098,halfWidth:.023,halfDepth:.02,square:2.6},{y:-.105,halfWidth:0,halfDepth:0}]),_l=.86,U_=1.14,N_=.72,O_=.78;function Ml(i){return i>0?0:Math.PI}function z_(){const i=new kt;i.name="rider-blockout";const e=[],t=[],n=q=>(e.push(q),q),s=q=>(t.push(q),q),r=s(new nn({color:Ft.riderSuit,roughness:.82,metalness:0,vertexColors:!0})),a=s(new nn({color:Ft.riderPanel,roughness:.26,metalness:.18,emissive:928856,emissiveIntensity:.55,vertexColors:!0})),o=s(new nn({color:Ft.riderHelmet,roughness:.35,metalness:.05,vertexColors:!0})),l=s(new nn({color:Ft.riderVisor,roughness:.12,metalness:.35,vertexColors:!0})),c=s(new nn({color:Ft.riderBoot,roughness:.7,metalness:0,vertexColors:!0})),u=q=>(q.castShadow=!0,q),d=(q,G,ne)=>{const re=new ht(n(Cn(q,{radialSegments:14,shade:ne})),G);return u(re)},h=(q,G)=>{const{from:ne,to:re,...le}=G;return $i(q,{...le,v0:Gt(q,ne),v1:Gt(q,re)})},f=(q,G)=>{const ne=new ht(n(Ai(G)),a);return ne.name=q,ne},m=he.torsoWidth*.26,v=it.pedalHeight+he.ankleAbovePedal,p=[],b=[],M=new Mn,T=new Mn;for(const q of[-1,1]){const G=q>0?"left":"right",ne=new kt;ne.name=`rider-hip-${G}`,ne.position.set(q*m,ms.hipHeight,0);const re=new F(q*he.stanceHalfWidth,v,0);Ra({origin:ne.position,target:re,upperLength:he.thighLength,lowerLength:he.shinLength,bendToward:id},M,T),ne.quaternion.copy(M),ne.add(d(I_,r,_l));const le=new kt;le.name=`rider-knee-${G}`,le.position.y=-he.thighLength,le.quaternion.copy(T),le.add(d(ad,r,_l)),ne.add(le);const ve=new kt;ve.name=`rider-ankle-${G}`,ve.position.y=-he.shinLength,ve.quaternion.copy(M).multiply(T).invert(),le.add(ve);const Se=-he.ankleAbovePedal+.018,je=Cn(k_,{radialSegments:12}).rotateX(Math.PI/2).translate(0,Se+.047,0),Ie=Hn(new In(.13,.018,he.bootLength*.94),N_).translate(0,Se-.009,.018),nt=u(new ht(n(Ai([je,Ie])),c));ve.add(nt),le.add(f(`rider-knee-pad-${G}`,[h(ad,{u0:Math.PI/2-.66,u1:Math.PI/2+.66,from:-.078,to:-.016,uSegments:5,vSegments:3,lift:.012,taper:.3})])),i.add(ne),p.push({side:q,hip:ne,knee:le,ankle:ve,target:re,lastDrop:0,lastShift:0,lastOpen:0,lastLift:0,lastFootAdjust:0})}const x=new kt;x.name="rider-pelvis",x.position.y=ms.hipHeight,i.add(x);const A=Cn(Mi,{radialSegments:24}),y=Cn(L_,{radialSegments:24,shade:_l}),E=$i(Mi,{u0:Math.PI/2,u1:Math.PI/2+Math.PI*2,v0:Gt(Mi,.502),v1:Gt(Mi,.545),uSegments:20,vSegments:2,lift:.011,shade:U_}),g=u(new ht(n(Ai([A,y,E])),r));x.add(g);const _=he.torsoLength;x.add(u(f("rider-shoulder-panels",[-1,1].map(q=>{const G=Ml(q);return h(Mi,{u0:G-.72,u1:G+.72,from:.395,to:.512,uSegments:7,vSegments:4,lift:.011,taper:.34})}))));const R=Gt(Mi,.33)-Gt(Mi,.395);x.add(f("rider-jacket-panels",[...[-1,1].map(q=>h(Mi,{u0:Math.PI/2+q*.1,u1:Math.PI/2+q*.92,from:.3,to:.352,uSegments:6,vSegments:2,lift:.01,skew:R,taper:.25})),h(Mi,{u0:-Math.PI/2-.6,u1:-Math.PI/2+.6,from:.205,to:.492,uSegments:7,vSegments:5,lift:.01,taper:.16})]));for(const q of[-1,1]){const G=q>0?"left":"right",ne=new kt;ne.name=`rider-shoulder-${G}`,ne.position.set(q*he.shoulderHalfWidth,_,0);const re=q<0,le=he.upperArmLength+he.forearmLength,ve=he.shoulderHalfWidth+he.armSplay+(re?he.armAsymmetrySplay:0),Se=new F(q*ve,_-le*he.armHangFraction,he.handForward+(re?he.armAsymmetryForward:0)),je=new F(0,0,-1);Ra({origin:ne.position,target:Se,upperLength:he.upperArmLength,lowerLength:he.forearmLength,bendToward:je},M,T),ne.quaternion.copy(M),ne.add(d(od,r,1)),ne.add(f(`rider-sleeve-${G}`,[h(od,{u0:Ml(q)-.92,u1:Ml(q)+.92,from:-.245,to:.002,uSegments:6,vSegments:5,lift:.009,taper:.22})]));const Ie=new kt;Ie.name=`rider-elbow-${G}`,Ie.position.y=-he.upperArmLength,Ie.quaternion.copy(T),Ie.add(d(ld,r,1)),Ie.add(f(`rider-elbow-pad-${G}`,[h(ld,{u0:-Math.PI/2-.62,u1:-Math.PI/2+.62,from:-.058,to:-.004,uSegments:5,vSegments:3,lift:.011,taper:.3})])),ne.add(Ie);const nt=u(new ht(n(Cn(F_,{radialSegments:10})),c));nt.name=`rider-hand-${G}`,nt.position.y=-he.forearmLength+.012,Ie.add(nt),x.add(ne),b.push({side:q,shoulder:ne,elbow:Ie,baseTarget:Se,target:Se.clone(),baseSplay:ve,bendToward:je,lastSplay:0,lastForward:0,lastRise:0})}const C=new kt;C.name="rider-neck",C.position.y=_,x.add(C);const I=u(new ht(n(Cn(D_,{radialSegments:12,shade:O_})),r));C.add(I);const k=Cn(en,{radialSegments:20}),z=$i(en,{u0:Math.PI/2-.7,u1:Math.PI/2+.7,v0:Gt(en,.098),v1:Gt(en,.15),uSegments:6,vSegments:3,lift:.015,taper:.42}),D=$i(en,{u0:Math.PI/2-.86,u1:Math.PI/2+.86,v0:Gt(en,.236),v1:Gt(en,.256),uSegments:7,vSegments:1,lift:.011,taper:.3}),V=$i(en,{u0:-Math.PI/2-.78,u1:-Math.PI/2+.78,v0:Gt(en,.15),v1:Gt(en,.206),uSegments:8,vSegments:3,lift:.012,taper:.62,shade:1.05}),L=$i(en,{u0:Math.PI/2,u1:Math.PI/2+Math.PI*2,v0:Gt(en,.09),v1:Gt(en,.113),uSegments:18,vSegments:1,lift:.004,shade:1.08}),X=u(new ht(n(Ai([k,z,D,V,L])),o));C.add(X);const ee=new ht(n($i(en,{u0:Math.PI/2-.8,u1:Math.PI/2+.8,v0:Gt(en,.172),v1:Gt(en,.234),uSegments:9,vSegments:3,lift:.007,sink:-.014,taper:.22})),l);C.add(ee),x.rotation.x=he.torsoRestPitch;const Y=new F,J=new Mn,te=new Mn,Te=new F;let Oe=0;return{root:i,pelvis:x,neck:C,applyStanceReaction(q){const{rollAngle:G,riderPitch:ne,lookYaw:re,groundY:le}=q,ve=Math.min(1,Math.abs(G)/he.carveReactionFullRoll),Se=Math.sign(G),je=gt(q.restFactor,0,1),Ie=Math.max(je,gt(q.crash,0,1)),nt=Ie>1e-6||Math.abs(Ie-Oe)>1e-6;Oe=Ie;const Ge=gt(q.crouch,0,1)*(1-je),$e=gt(q.airBlend,0,1)*(1-je),dt=gt(q.tuck,0,1)*(1-je)*(1-gt(q.crash,0,1)),ot=gt(q.crash,0,1),Rt=Tt((gt(q.wobble,0,1)-j.wobbleStateEnergy)/Math.max(1e-6,1-j.wobbleStateEnergy))*(1-je)*(1-ot),wt=gt(q.wobbleFootCorrection,0,1)*(1-je)*(1-ot),Ct=Tt((q.wobble-j.wobbleStateEnergy)/Math.max(1e-6,j.wobbleCrashEnergy-j.wobbleStateEnergy)),O=j.wobbleMaxYaw*Math.max(1e-6,Ct),Kt=O>0?gt(q.wobbleYaw/O,-1,1):0,ut=Math.sign(q.pedalStrike),P=Math.min(1,Math.abs(q.pedalStrike)/j.pedalStrikeReferenceDepth)*he.pedalStrikeFootLift,S=gt(ne/he.loadReactionFullPitch,-1,1),H=Math.max(0,S),$=Math.max(0,-S),ie=H*he.accelHipShiftMax-$*he.brakeHipShiftMax,ce=Math.min(he.squatMax,he.carveSquatMax*ve+H*he.accelSquatMax+$*he.brakeSquatMax+Ge*he.crouchHipDrop+dt*he.tuckHipDrop+Rt*he.wobbleHipDrop),me=Math.min(he.tuckTorsoPitchMax,q.torsoPitch+dt*he.tuckTorsoPitch);x.rotation.x=me,x.position.x=he.restHipShift*je,x.position.y=yt(ms.hipHeight-ce,he.restHipHeight,Ie),x.position.z=ie*(1-Ie),x.rotation.y=-q.wobbleYaw*he.wobbleHipCounterYaw*Rt;for(const W of p){const pe=Se!==0&&Math.sign(W.side)===Se,Ce=ce+(pe?he.carveInsideHipDropMax*ve:0),de=pe?he.carveInsideKneeOpen*ve:0,ue=ut!==0&&Math.sign(W.side)===ut?P:0,De=-W.side*Kt*wt*he.wobbleFootAdjust;if(!nt&&Math.abs(Ce-W.lastDrop)<1e-6&&Math.abs(ie-W.lastShift)<1e-6&&Math.abs(de-W.lastOpen)<1e-6&&Math.abs(ue-W.lastLift)<1e-6&&Math.abs(De-W.lastFootAdjust)<1e-6)continue;W.lastDrop=Ce,W.lastShift=ie,W.lastOpen=de,W.lastLift=ue,W.lastFootAdjust=De,W.hip.position.x=W.side*m+he.restHipShift*je,W.hip.position.y=yt(ms.hipHeight-Ce,he.restHipHeight,Ie),W.hip.position.z=ie*(1-Ie);const Ne=W.side>0?je:0,He=Math.max(Ne,ot),U=ot>Ne?W.side*he.crashFootOutboard:he.restFootOutboard;Te.set(yt(W.target.x,U,He),yt(W.target.y+ue,he.ankleAbovePedal+le,He),yt(W.target.z+De,-he.restFootBack,He)),Ra({origin:W.hip.position,target:Te,upperLength:he.thighLength,lowerLength:he.shinLength,bendToward:de>0?Y.set(Math.sign(W.side)*de,0,1).normalize():id},J,te),W.hip.quaternion.copy(J),W.knee.quaternion.copy(te),W.ankle.quaternion.copy(J).multiply(te).invert()}for(const W of b){const pe=Se!==0&&Math.sign(W.side)===Se,Ce=(H+$)*he.armLoadSplay+ve*(pe?-he.armCarveInsideTuck:he.armCarveOutsideSplay)+$e*he.airArmSplay+Rt*he.wobbleArmSplay+ot*he.crashArmSplay+dt*he.tuckArmSplay,de=$*he.armBrakeForward-H*he.armAccelBack-dt*he.tuckArmBack,ue=(pe?0:ve*he.armCarveOutsideRise)+$e*he.airArmRise+Rt*he.wobbleArmRise-dt*he.tuckArmDrop+ot*he.crashArmRise;Math.abs(Ce-W.lastSplay)<1e-6&&Math.abs(de-W.lastForward)<1e-6&&Math.abs(ue-W.lastRise)<1e-6||(W.lastSplay=Ce,W.lastForward=de,W.lastRise=ue,W.target.set(Math.sign(W.side)*(W.baseSplay+Ce),W.baseTarget.y+ue,W.baseTarget.z+de),Ra({origin:W.shoulder.position,target:W.target,upperLength:he.upperArmLength,lowerLength:he.forearmLength,bendToward:W.bendToward},J,te),W.shoulder.quaternion.copy(J),W.elbow.quaternion.copy(te))}const se=me-q.torsoPitch;C.rotation.x=-gt((ne+he.torsoRestPitch)*he.headStabilizationFactor,-he.headStabilizationMax,he.headStabilizationMax)-gt(se*he.tuckHeadStabilization,0,he.tuckHeadStabilizationMax)-(q.falling?$e*he.airHeadDown:0),C.rotation.y=re},dispose(){for(const q of e)q.dispose();for(const q of t)q.dispose();e.length=0,t.length=0,i.removeFromParent()}}}function sp(){const i=new kt;i.name="riding-rig";const e=new kt;e.name="riding-ground-pivot",i.add(e);const t=new kt;t.name="riding-lean-pivot",e.add(t);const n=C_(),s=z_();t.add(n.group),t.add(s.root);const r=P_();let a=0;return{group:i,groundPivot:e,leanPivot:t,euc:n,rider:s,apply(o){i.position.set(o.x,o.y,o.z),i.rotation.y=o.headingY+o.wobbleYaw,e.rotation.x=o.groundPitch,e.rotation.z=o.groundRoll;const l=o.wobbleYaw*he.wobbleWheelRock;t.rotation.z=-o.rollAngle-l,t.rotation.x=o.wheelPitch,n.body.position.y=o.suspensionOffset,s.root.position.set(o.crashLateral,o.suspensionOffset-o.crashDrop,o.crashForward),s.root.rotation.set(o.crashTumble,0,o.crashRoll),n.tyre.rotation.x=o.wheelSpin,n.group.rotation.z=he.restWheelLean*o.restFactor-o.wheelCrashLean,s.pelvis.rotation.z=-(o.riderRoll-o.rollAngle)+l*he.wobbleTorsoLevel,r.rollAngle=o.rollAngle,r.riderPitch=o.riderPitch,r.torsoPitch=o.riderPitch-o.wheelPitch+he.torsoRestPitch,r.lookYaw=o.riderLookYaw,r.restFactor=o.restFactor,r.groundY=-o.suspensionOffset,r.crouch=o.crouch,r.tuck=o.tuck,r.airBlend=o.airBlend,r.falling=o.airHeight>0&&o.airHeight<a,a=o.airHeight,r.pedalStrike=o.pedalStrike,r.wobble=o.wobble,r.wobbleFootCorrection=o.wobbleFootCorrection,r.wobbleYaw=o.wobbleYaw,r.crash=o.crashBlend,s.applyStanceReaction(r)},applyStatus(o,l,c=0){n.setStatus(o,l,c)},dispose(){n.dispose(),s.dispose(),i.removeFromParent()}}}function B_(i,e,t){const n=e*(it.pedalSpan/2),s=it.pedalHeight+i.suspensionOffset,r=Math.cos(i.rollAngle),a=Math.sin(i.rollAngle),o=n*r+s*a,l=s*r-n*a,c=Math.cos(i.headingY),u=Math.sin(i.headingY);return t.set(i.x+o*c,i.y+l,i.z-o*u)}function H_(){const i=new kt;i.name="ghost-rider",i.visible=!1;const e=sp();i.add(e.group),e.group.traverse(d=>{d.name!==""&&(d.name=`ghost-${d.name}`)});const t=new yo({color:Ft.ghost,transparent:!0,opacity:qe.ghostOpacity,depthWrite:!1,depthTest:!0,fog:!0}),n=()=>{};let s=0,r=0;e.group.traverse(d=>{if(d.isMesh!==!0)return;const h=d,f=h.castShadow;if(h.castShadow=!1,h.receiveShadow=!1,h.raycast=n,h.material=t,!f){h.visible=!1;return}s+=1;const m=h.geometry,v=m.getIndex();r+=(v!==null?v.count:m.getAttribute("position").count)/3});const a=Qa();let o=null,l=0,c=0;const u=it.tyreDiameter/2;return{group:i,get drawCalls(){return s},get triangles(){return r},get visible(){return i.visible},setVisible(d){i.visible=d},apply(d){const h=o,f=h===null||d.t<h?0:d.t-h;(h===null||d.t<h)&&(l=0,c=0),o=d.t,a.x=d.x,a.y=d.y,a.z=d.z,a.headingY=d.headingY,a.rollAngle=d.rollAngle,a.speed=d.speed,a.groundY=d.groundY,a.crouch=d.crouch,a.riderRoll=d.rollAngle*j.riderUpperBodyRollFactor,l+=d.speed*f/u,a.wheelSpin=l;const m=Math.max(0,d.y-d.groundY),v=m>qe.ghostPositionStep;a.airHeight=m,c=Xe(c,v?1:0,j.crouchResponseSeconds,1/0,f),a.airBlend=c,a.tuck=v?0:d.crouch,e.apply(a)},dispose(){e.dispose(),t.dispose(),i.clear(),i.removeFromParent()}}}function Ca(i,e){let t=i*374761393+e*668265263|0;return t=t^t>>>13|0,t=Math.imul(t,1274126177)|0,t=(t^t>>>16)>>>0,t/4294967296}function cd(i){const{capacity:e}=i,t=new Float32Array(e*3),n=new Float32Array(e*3),s=new Float32Array(e),r=new Float32Array(e),a=new Float32Array(e),o=new Float32Array(e),l=new Float32Array(e),c=new Float32Array(e*3),u=new Float32Array(e*3),d=new Ut,h=new pn(t,3),f=new pn(n,3);h.setUsage(qh),f.setUsage(qh),d.setAttribute("position",h),d.setAttribute("color",f),d.setDrawRange(0,0),d.boundingSphere=new Es(new F,1/0);const m=new Of({size:i.size,sizeAttenuation:!0,vertexColors:!0,transparent:!0,depthWrite:!1,fog:!0}),v=new Fg(d,m);v.name=i.name,v.visible=!1,v.frustumCulled=!1;const p=new Ve,b=new Ve;let M=0,T=0,x=0;const A=(y,E)=>{const g=y*3;n[g]=u[g]+(c[g]-u[g])*E,n[g+1]=u[g+1]+(c[g+1]-u[g+1])*E,n[g+2]=u[g+2]+(c[g+2]-u[g+2])*E};return{points:v,get live(){return M},emit(y){const E=Math.min(Math.max(0,Math.floor(y.count)),e);if(E===0||!(y.lifeSeconds>0))return;p.set(y.colour),y.intensity!==void 0&&y.intensity!==1&&p.multiplyScalar(y.intensity),b.set(y.fadeTo??i.fadeTo);const g=Math.hypot(y.axisX,y.axisY,y.axisZ),_=g>1e-9?y.axisX/g:0,R=g>1e-9?y.axisY/g:1,C=g>1e-9?y.axisZ/g:0,I=Math.abs(R)<.9?0:1,k=Math.abs(R)<.9?1:0;let z=R*0-C*k,D=C*I-_*0,V=_*k-R*I;const L=Math.hypot(z,D,V)||1;z/=L,D/=L,V/=L;const X=R*V-C*D,ee=C*z-_*V,Y=_*D-R*z;for(let J=0;J<E;J+=1){T+=1;let te;M<e?(te=M,M+=1):(te=x,x=(x+1)%e);const Te=Ca(T,1)*Math.PI*2,Oe=Math.sqrt(Ca(T,2))*y.spread,q=y.speed*(.55+.45*Ca(T,3)),G=Math.sin(Oe),ne=Math.cos(Oe),re=z*Math.cos(Te)+X*Math.sin(Te),le=D*Math.cos(Te)+ee*Math.sin(Te),ve=V*Math.cos(Te)+Y*Math.sin(Te),Se=te*3;t[Se]=y.x,t[Se+1]=y.y,t[Se+2]=y.z,s[te]=(_*ne+re*G)*q,r[te]=(R*ne+le*G)*q,a[te]=(C*ne+ve*G)*q,l[te]=y.lifeSeconds*(.65+.35*Ca(T,4)),o[te]=l[te],c[Se]=p.r,c[Se+1]=p.g,c[Se+2]=p.b,u[Se]=b.r,u[Se+1]=b.g,u[Se+2]=b.b,A(te,1)}v.visible=!0,h.needsUpdate=!0,f.needsUpdate=!0,d.setDrawRange(0,M)},step(y){if(M===0||y<=0)return;let E=0;for(let g=0;g<M;g+=1){const _=o[g]-y;if(_<=0)continue;r[g]-=i.gravity*y;const R=g*3,C=t[R]+s[g]*y,I=t[R+1]+r[g]*y,k=t[R+2]+a[g]*y,z=E*3;t[z]=C,t[z+1]=I,t[z+2]=k,s[E]=s[g],r[E]=r[g],a[E]=a[g],o[E]=_,l[E]=l[g],c[z]=c[R],c[z+1]=c[R+1],c[z+2]=c[R+2],u[z]=u[R],u[z+1]=u[R+1],u[z+2]=u[R+2],A(E,_/l[E]),E+=1}M=E,x=0,v.visible=M>0,d.setDrawRange(0,M),h.needsUpdate=!0,f.needsUpdate=!0},clear(){M=0,x=0,T=0,v.visible=!1,d.setDrawRange(0,0)},dispose(){d.dispose(),m.dispose(),v.removeFromParent()}}}function G_(i,e){const t=Math.cos(e);return{x:Math.sin(i)*t,y:Math.sin(e),z:Math.cos(i)*t}}function yl(i){return i<=.04045?i/12.92:((i+.055)/1.055)**2.4}function wl(i){return i<=.0031308?i*12.92:1.055*i**(1/2.4)-.055}function yr(i){return{r:yl((i>>16&255)/255),g:yl((i>>8&255)/255),b:yl((i&255)/255)}}function Pa(i,e){let t=Math.imul(i|0,668265261)^Math.imul(e|0,374761393);return t=Math.imul(t^t>>>15,725569117),t^=t>>>13,(t>>>0)/4294967295}function vo(i){return i*i*(3-2*i)}function V_(i,e){const t=Math.floor(i),n=Math.floor(e),s=vo(i-t),r=vo(e-n),a=Pa(t,n),o=Pa(t+1,n),l=Pa(t,n+1),c=Pa(t+1,n+1);return(a+(o-a)*s)*(1-r)+(l+(c-l)*s)*r}function W_(i,e){let t=0,n=.5,s=0,r=1;for(let a=0;a<4;a+=1)t+=V_(i*r,e*r)*n,s+=n,n*=.5,r*=2.07;return t/s}function X_(i){const{width:e,height:t}=i,n=new Uint8ClampedArray(e*t*4),s=yr(i.zenithColour),r=yr(i.horizonColour),a=yr(i.sunColour),o=yr(i.cloudLitColour),l=yr(i.cloudShadeColour),c=G_(i.sunAzimuth,i.sunElevation),u=Math.max(i.cloudHorizonFade,.001);let d=0;for(let h=0;h<t;h+=1){const f=(h+.5)/t,m=Math.PI*(f-.5),v=Math.sin(m),p=Math.cos(m),b=Math.max(0,v)**i.gradientExponent,M=r.r+(s.r-r.r)*b,T=r.g+(s.g-r.g)*b,x=r.b+(s.b-r.b)*b,A=v<=u?0:vo(Math.min(1,(v-u)/(u*4+1e-6))),y=1/Math.max(v,u);for(let E=0;E<e;E+=1){const g=(E+.5)/e,_=Math.PI*2*(g-.5),R=Math.cos(_)*p,C=Math.sin(_)*p;let I=M,k=T,z=x;if(i.sunHorizonWarmth>0&&v>0){const Y=Math.hypot(R,C)||1e-6,J=Math.hypot(c.x,c.z)||1e-6,te=(R*c.x+C*c.z)/(Y*J),Te=Math.acos(Math.max(-1,Math.min(1,te))),Oe=Math.exp(-((Te/i.sunHorizonSpread)**2)),q=v/Math.max(i.sunHorizonPeak,1e-4),G=q*Math.exp(1-q),ne=i.sunHorizonWarmth*Oe*G;ne>.001&&(I+=(a.r-I)*ne,k+=(a.g-k)*ne,z+=(a.b-z)*ne)}if(A>0){const Y=R*y,J=C*y,te=W_(Y*i.cloudScale,J*i.cloudScale),Te=1-i.cloudCoverage,Oe=Math.max(0,Math.min(1,(te-Te)/Math.max(i.cloudSoftness,1e-4)))*A;if(Oe>0){const q=Math.min(1,(te-Te)/.35),G=l.r+(o.r-l.r)*q,ne=l.g+(o.g-l.g)*q,re=l.b+(o.b-l.b)*q,le=vo(Oe);I+=(G-I)*le,k+=(ne-k)*le,z+=(re-z)*le}}const D=Math.max(-1,Math.min(1,R*c.x+v*c.y+C*c.z)),V=Math.acos(D),L=Math.exp(-((V/i.sunCoreSpread)**2)),X=Math.exp(-((V/i.sunGlowSpread)**2))*i.sunGlowStrength,ee=Math.min(1,L+X*.5);if(ee>.001){const Y=1+L*3;I+=(a.r*Y-I)*ee,k+=(a.g*Y-k)*ee,z+=(a.b*Y-z)*ee}n[d]=wl(Math.max(0,Math.min(1,I)))*255,n[d+1]=wl(Math.max(0,Math.min(1,k)))*255,n[d+2]=wl(Math.max(0,Math.min(1,z)))*255,n[d+3]=255,d+=4}}return n}function Y_(){const i=Be.skyTextureWidth,e=Be.skyTextureHeight,t=X_({width:i,height:e,zenithColour:Be.skyZenithColour,horizonColour:Be.horizonColour,gradientExponent:Be.skyGradientExponent,sunAzimuth:Be.sunAzimuth,sunElevation:Be.sunElevation,sunColour:Be.skySunColour,sunCoreSpread:Be.skySunCoreSpread,sunGlowSpread:Be.skySunGlowSpread,sunGlowStrength:Be.skySunGlowStrength,sunHorizonWarmth:Be.skySunHorizonWarmth,sunHorizonSpread:Be.skySunHorizonSpread,sunHorizonPeak:Be.skySunHorizonPeak,cloudLitColour:Be.skyCloudLitColour,cloudShadeColour:Be.skyCloudShadeColour,cloudCoverage:Be.skyCloudCoverage,cloudSoftness:Be.skyCloudSoftness,cloudScale:Be.skyCloudScale,cloudHorizonFade:Be.skyCloudHorizonFade}),n=new ph(t,i,e,Ln);return n.name="sky",n.mapping=Wa,n.colorSpace=un,n.wrapS=co,n.wrapT=ai,n.magFilter=Zt,n.minFilter=Ki,n.generateMipmaps=!0,n.anisotropy=1,n.needsUpdate=!0,{texture:n,dispose(){n.dispose()}}}function hd(i,e){return i.originX+e*i.spacing}function q_(i){const e=i.heightfield,t=Et.surroundCellSize,n=e.originX-Et.surroundMargin,s=e.originZ-Et.surroundMargin,r=(e.columns-1)*e.spacing+Et.surroundMargin*2,a=(e.rows-1)*e.spacing+Et.surroundMargin*2,o=Math.ceil(r/t),l=Math.ceil(a/t),c=new Uint8Array(o*l).fill(1),u=(h,f)=>{const m=Math.floor((h-n)/t),v=Math.floor((f-s)/t);return m<0||v<0||m>=o||v>=l?-1:v*o+m};for(let h=0;h<e.rows;h+=1){const f=e.originZ+h*e.spacing;for(let m=0;m<e.columns;m+=1){const v=e.heights[h*e.columns+m],p=h<e.rows-1&&m<e.columns-1?e.surfaces[h*(e.columns-1)+m]:i.surround.surface;if(v===i.surround.height&&p===i.surround.surface)continue;for(const M of[-e.spacing,e.spacing])for(const T of[-e.spacing,e.spacing]){const x=u(hd(e,m)+M,f+T);x>=0&&(c[x]=0)}const b=u(hd(e,m),f);b>=0&&(c[b]=0)}}let d=0;for(const h of c)h===1&&(d+=1);return{columns:o,rows:l,minX:n,minZ:s,cell:t,patchesDrawn:d,patch:(h,f)=>c[f*o+h]===1,covers(h,f){const m=u(e.originX+(h+.5)*e.spacing,e.originZ+(f+.5)*e.spacing);return m<0||c[m]===1}}}function rp(i){const e=i.heightfield,t=q_(i),n=e.columns-1,s=e.rows-1,r=(l,c)=>e.heights[c*e.columns+l],a=new Map;let o=0;for(let l=0;l<s;l+=1)for(let c=0;c<n;c+=1){const u=l*n+c,d=e.surfaces[u];if(t.covers(c,l)&&d===i.surround.surface&&r(c,l)===i.surround.height&&r(c+1,l)===i.surround.height&&r(c,l+1)===i.surround.height&&r(c+1,l+1)===i.surround.height)continue;let h=a.get(d);h===void 0&&(h=[],a.set(d,h)),h.push(u),o+=1}return{coverage:t,bySurface:a,cellsDrawn:o}}const ud=_t({road:{albedo:11645098,wear:.16},path:{albedo:9079173,wear:.26}}),ui=_t({centreWidth:.16,edgeWidth:.13,barWidth:.42,dashLength:3,dashGap:4.5,lift:.015,sampleStep:1.25,minRunLength:2,colliderClearance:.15,maxDrawCalls:2,maxTriangles:12e3}),$_=_t(["pavement","roughPavement","brick","wood"]);function Z_(i){return i==="centre"?ui.centreWidth:i==="bar"?ui.barWidth:ui.edgeWidth}_t(["broadleafTree","treeCanopy","conifer","shrub","lampPost","bench","litterBin","bollardCap","signpost","fenceBay","building"]);const wi=_t({broadleafFoliage:4480059,coniferFoliage:3755320,shrubFoliage:5138242,lampHead:12763061,signPlate:5859456,buildingPale:10789791,buildingWarm:9998472,buildingCool:8685709,buildingCap:7368557}),El=_t([wi.buildingPale,wi.buildingWarm,wi.buildingCool]),an=_t({foliage:.16,structure:.07,building:.12}),fe=_t({broadleafTree:{trunkRadiusTop:.19,trunkRadiusBase:.3,trunkHeight:3.1,trunkSides:6,crownRadius:2.45,crownHeight:3.4,crownCentre:4.6,upperRadius:1.55,upperCentre:6.3,upperOffset:.75},conifer:{tiers:[{radius:2.2,height:4.3,base:-.25},{radius:1.55,height:3.5,base:2.6},{radius:.95,height:2.7,base:5.2}],tierSides:6},shrub:{radius:.95,scaleX:1.15,scaleY:.78,scaleZ:.95,centre:.62},lampPost:{postRadius:.085,postHeight:4.6,postSides:6,armLength:.95,armThickness:.1,headWidth:.52,headHeight:.2,headDepth:.34,headReach:.95},bench:{length:1.85,seatHeight:.46,seatThickness:.09,seatDepth:.46,backHeight:.4,backThickness:.08,legThickness:.09},litterBin:{radiusTop:.27,radiusBase:.22,height:.82,sides:8,rimHeight:.07},bollardCap:{radius:.135,scaleY:.72},signpost:{postRadius:.055,postHeight:2.45,postSides:6,plateWidth:1.05,plateHeight:.32,plateThickness:.06,plateCentre:2.1,lowerWidth:.72,lowerHeight:.26,lowerCentre:1.68},fenceBay:{length:2.4,postWidth:.11,postHeight:1.02,railThickness:.05,railHeight:.09,railUpper:.88,railLower:.5},building:{capHeight:.75,capOversail:.45,towerWidthFraction:.46,towerHeightFraction:.22}}),Ei=_t({broadleafTree:{shape:"circle",radius:fe.broadleafTree.trunkRadiusBase},treeCanopy:{shape:"circle",radius:0},conifer:{shape:"circle",radius:Math.max(...fe.conifer.tiers.map(i=>i.radius))},shrub:{shape:"circle",radius:fe.shrub.radius*Math.max(fe.shrub.scaleX,fe.shrub.scaleZ)},lampPost:{shape:"circle",radius:fe.lampPost.postRadius*1.35},bench:{shape:"box",halfX:fe.bench.length/2,halfZ:fe.bench.seatDepth/2},litterBin:{shape:"circle",radius:fe.litterBin.radiusTop*1.12},bollardCap:{shape:"circle",radius:0},signpost:{shape:"circle",radius:fe.signpost.plateWidth},fenceBay:{shape:"box",halfX:fe.fenceBay.postWidth/2,halfZ:fe.fenceBay.length/2},building:{shape:"box",halfX:.5,halfZ:.5}}),ap=_t({broadleafTree:{shape:"circle",radius:fe.broadleafTree.crownRadius},treeCanopy:{shape:"circle",radius:fe.broadleafTree.crownRadius},conifer:Ei.conifer,shrub:Ei.shrub,lampPost:{shape:"circle",radius:fe.lampPost.headReach+fe.lampPost.headDepth/2},bench:Ei.bench,litterBin:Ei.litterBin,bollardCap:{shape:"circle",radius:fe.bollardCap.radius},signpost:Ei.signpost,fenceBay:Ei.fenceBay,building:{shape:"box",halfX:.5,halfZ:.5}}),K_=_t({broadleafTree:{bottom:0,top:Math.max(fe.broadleafTree.trunkHeight,fe.broadleafTree.crownCentre+fe.broadleafTree.crownHeight/2,fe.broadleafTree.upperCentre+fe.broadleafTree.upperRadius*.85)},treeCanopy:{bottom:fe.broadleafTree.crownCentre-fe.broadleafTree.crownHeight/2,top:Math.max(fe.broadleafTree.crownCentre+fe.broadleafTree.crownHeight/2,fe.broadleafTree.upperCentre+fe.broadleafTree.upperRadius*.85)},conifer:{bottom:Math.min(...fe.conifer.tiers.map(i=>i.base)),top:Math.max(...fe.conifer.tiers.map(i=>i.base+i.height))},shrub:{bottom:fe.shrub.centre-fe.shrub.radius*fe.shrub.scaleY,top:fe.shrub.centre+fe.shrub.radius*fe.shrub.scaleY},lampPost:{bottom:0,top:fe.lampPost.postHeight},bench:{bottom:0,top:fe.bench.seatHeight+fe.bench.backHeight},litterBin:{bottom:0,top:fe.litterBin.height+fe.litterBin.rimHeight},bollardCap:{bottom:-fe.bollardCap.radius*fe.bollardCap.scaleY,top:fe.bollardCap.radius*fe.bollardCap.scaleY},signpost:{bottom:0,top:fe.signpost.postHeight},fenceBay:{bottom:0,top:fe.fenceBay.postHeight},building:{bottom:0,top:1}}),Xi=.886,Q_=_t({broadleafTree:{halfX:fe.broadleafTree.trunkRadiusBase*Xi,halfZ:fe.broadleafTree.trunkRadiusBase*Xi,height:fe.broadleafTree.trunkHeight,surface:"wood",occludes:!1},treeCanopy:null,conifer:{halfX:.55,halfZ:.55,height:Math.max(...fe.conifer.tiers.map(i=>i.base+i.height)),surface:"wood",occludes:!1},shrub:null,lampPost:{halfX:fe.lampPost.postRadius*Xi,halfZ:fe.lampPost.postRadius*Xi,height:fe.lampPost.postHeight,surface:"pavement",occludes:!1},bench:{halfX:fe.bench.length/2,halfZ:fe.bench.seatDepth/2,height:fe.bench.seatHeight+fe.bench.backHeight,surface:"wood",occludes:!1},litterBin:{halfX:fe.litterBin.radiusTop*Xi,halfZ:fe.litterBin.radiusTop*Xi,height:fe.litterBin.height+fe.litterBin.rimHeight,surface:"pavement",occludes:!1},bollardCap:null,signpost:{halfX:fe.signpost.postRadius*Xi,halfZ:fe.signpost.postRadius*Xi,height:fe.signpost.postHeight,surface:"pavement",occludes:!1},fenceBay:{halfX:fe.fenceBay.postWidth/2,halfZ:fe.fenceBay.length/2,height:fe.fenceBay.postHeight,surface:"wood",occludes:!1},building:{halfX:.5,halfZ:.5,height:1,surface:"pavement",occludes:!0}}),J_=.6,j_=.15,yn=_t({lowFloors:4,highFloors:11,highRiseHeight:26,minFloorHeight:2,maxFloorHeight:7,glazing:.55,glassTint:{r:.42,g:.46,b:.58},solidGroundFloor:!0});_t({maxDrawCalls:32,maxTriangles:9e4,maxTrianglesPerProp:60});const Ts=7,eM=.6,tM=6;function yh(i){return{x:Math.sin(i),z:Math.cos(i)}}function qn(i){return{x:Math.cos(i),z:-Math.sin(i)}}function Ao(i){return i>0?-Math.PI/2:Math.PI/2}function nM(i,e,t,n){return Math.atan2(e*t-i*n,i*t+e*n)}function op(i){return i*i*(3-2*i)}function iM(i){return 6*i*(1-i)}function lp(i,e){const t=i.climb??0;if(t===0)return 0;const n=i.length>0?Math.min(1,Math.max(0,e/i.length)):0;return t*(i.linearClimb===!0?n:op(n))}function or(i,e){const t=i.climb??0;if(t===0||i.length<=0)return 0;const n=Math.min(1,Math.max(0,e/i.length)),s=i.linearClimb===!0?t/i.length:t/i.length*iM(n);return s===0?0:Math.atan(s)}function sM(i,e){if(i.length<=0)return 0;const t=Math.min(tM,i.length/3);if(t<=0)return 1;const n=Math.min(1,Math.max(0,e/t)),s=Math.min(1,Math.max(0,(i.length-e)/t));return op(Math.min(n,s))}function rM(i,e,t){const n=i.crown??0,s=i.crossSlope??0;if(n===0&&s===0)return 0;const r=i.halfWidth,a=r>0?Math.min(r,Math.max(-r,t)):0,o=r>0?a/r:0,l=(-n*o*o+Math.tan(s)*a)*sM(i,e);return l===0?0:l}function Yr(i,e,t,n){return i.position.y+lp(e,t)+rM(e,t,n)}function dr(i,e,t){return i.headingY+(e.curvature??0)*t}function En(i,e,t){const n=e.curvature??0,s=i.headingY,r=i.position.y+lp(e,t);if(n===0){const o=yh(s);return{x:i.position.x+o.x*t,y:r,z:i.position.z+o.z*t}}const a=s+n*t;return{x:i.position.x+(Math.cos(s)-Math.cos(a))/n,y:r,z:i.position.z+(Math.sin(a)-Math.sin(s))/n}}function dd(i,e){const t=[];let n={...e.position},s=e.headingY;for(const r of i){const a={position:{...n},headingY:s,surface:r.surface,halfWidth:r.halfWidth,gradient:or(r,0)},o=En(a,r,r.length),l={position:o,headingY:dr(a,r,r.length),surface:r.surface,halfWidth:r.halfWidth,gradient:or(r,r.length)};t.push({spec:r,entry:a,exit:l,...aM(a,r)}),n={...o},s=l.headingY}return t}function li(i,e){const t=dd(i.main,e),n=new Map;for(const s of t){if(n.has(s.spec.id))throw new Error(`duplicate segment id "${s.spec.id}"`);n.set(s.spec.id,s)}for(const s of i.branches??[]){const r=n.get(s.from);if(r===void 0)throw new Error(`branch from unknown or not-yet-placed segment "${s.from}"`);const a=Math.min(r.spec.length,Math.max(0,s.atDistance??r.spec.length)),o=s.lateralOffset??0,l=dr(r.entry,r.spec,a),c=En(r.entry,r.spec,a),u=qn(l),d={position:{x:c.x+u.x*o,y:Yr(r.entry,r.spec,a,o)+(s.elevationOffset??0),z:c.z+u.z*o},headingY:l+(s.headingOffset??0)};for(const h of dd(s.specs,d)){if(n.has(h.spec.id))throw new Error(`duplicate segment id "${h.spec.id}"`);n.set(h.spec.id,h),t.push(h)}}return t}function aM(i,e){const t=e.halfWidth+(e.shoulder??Ts);let n=1/0,s=-1/0,r=1/0,a=-1/0;const o=24;for(let l=0;l<=o;l+=1){const c=En(i,e,e.length*l/o);c.x<n&&(n=c.x),c.x>s&&(s=c.x),c.z<r&&(r=c.z),c.z>a&&(a=c.z)}return{minX:n-t,maxX:s+t,minZ:r-t,maxZ:a+t}}function Dn(i,e,t){if(e<i.minX||e>i.maxX||t<i.minZ||t>i.maxZ)return null;const{spec:n,entry:s}=i,r=n.curvature??0;let a,o;if(r===0){const d=e-s.position.x,h=t-s.position.z,f=yh(s.headingY),m=qn(s.headingY);a=d*f.x+h*f.z,o=d*m.x+h*m.z}else{const d=qn(s.headingY),h=s.position.x+d.x/r,f=s.position.z+d.z/r,m=e-h,v=t-f,p=Math.hypot(m,v),b=s.position.x-h,M=s.position.z-f;a=nM(b,M,m,v)/r,o=Math.sign(r)*(1/Math.abs(r)-p)}const l=Math.min(n.length,Math.max(0,a)),c=Math.max(0,Math.abs(o)-n.halfWidth),u=Math.max(0,-a,a-n.length);return{s:l,t:o,outside:Math.hypot(c,u),height:Yr(s,n,l,o)}}function Vc(i,e){const t=i.bands;if(t!==void 0)for(const n of t){const s=Math.min(n.from,n.to),r=Math.max(n.from,n.to);if(e>=s&&e<r)return n.surface}return i.surface}function oM(i){const{spec:e,entry:t}=i,n=e.props??[],s=[];for(const r of n){const a=dr(t,e,r.s),o=En(t,e,r.s),l=qn(a);s.push({kind:r.kind,x:o.x+l.x*r.t,z:o.z+l.z*r.t,rotationY:a+(r.yaw??0),scale:r.scale??1,...r.size===void 0?{}:{size:{...r.size}},lift:r.lift??0,...r.onCollider===!0?{onCollider:!0,baseY:Yr(t,e,r.s,r.t)}:{}})}return s}function lM(i,e=ui.sampleStep){const{spec:t,entry:n}=i,s=t.markings??[],r=[],a=(o,l)=>{const c=dr(n,t,o),u=En(n,t,o),d=qn(c);return{x:u.x+d.x*l,z:u.z+d.z*l}};for(const o of s){if(o.path.length<2)continue;const l=[a(o.path[0].s,o.path[0].t)];for(let c=1;c<o.path.length;c+=1){const u=o.path[c-1],d=o.path[c],h=Math.hypot(d.s-u.s,d.t-u.t),f=Math.max(1,Math.ceil(h/e));for(let m=1;m<=f;m+=1){const v=m/f;l.push(a(u.s+(d.s-u.s)*v,u.t+(d.t-u.t)*v))}}r.push({points:l,width:Z_(o.role),dash:o.broken===!0?ui.dashLength:0,gap:o.broken===!0?ui.dashGap:0,paint:o.paint??"road"})}return r}function cM(i){const{spec:e,entry:t}=i,n=e.blocks??[],s=[];for(const r of n){const a=dr(t,e,r.s),o=En(t,e,r.s),l=qn(a),c=r.depth??eM,u=Yr(t,e,r.s,r.t);s.push({centre:{x:o.x+l.x*r.t,y:u+(r.height-c)/2,z:o.z+l.z*r.t},halfExtents:{x:r.halfLateral,y:(r.height+c)/2,z:r.halfAlong},rotationY:a,surface:r.surface,...r.appearance===void 0?{}:{appearance:r.appearance}})}return s}const hM=Math.PI*35/180,uM=1;function dM(i){return i<0?0:i>1?1:i}function fM(i){return i*i*(3-2*i)}function fd(i,e,t){let n=null;for(const s of i){const r=Dn(s,e,t);r!==null&&(n===null||r.outside<n.outside||r.outside===n.outside&&Math.abs(r.t)<Math.abs(n.t))&&(n={segment:s,outside:r.outside,t:r.t,height:r.height})}return n}function pM(i){return Array.isArray(i)?{main:i}:i}function wh(i,e){const t=e.spacing??uM,n=li(pM(i),e.spawn);if(n.length===0)throw new Error("a level plan needs at least one segment");let s=1/0,r=-1/0,a=1/0,o=-1/0;for(const L of n)L.minX<s&&(s=L.minX),L.maxX>r&&(r=L.maxX),L.minZ<a&&(a=L.minZ),L.maxZ>o&&(o=L.maxZ);const l=t*2,c=Math.floor((s-l)/t)*t,u=Math.floor((a-l)/t)*t,d=Math.ceil((r+l-c)/t)+1,h=Math.ceil((o+l-u)/t)+1,f=new Array(d*h);for(let L=0;L<h;L+=1){const X=u+L*t;for(let ee=0;ee<d;ee+=1){const Y=c+ee*t,J=fd(n,Y,X);if(J===null){f[L*d+ee]=e.surround.height;continue}const te=J.segment.spec.shoulder??Ts,Te=te>0?1-fM(dM(J.outside/te)):0;f[L*d+ee]=e.surround.height+(J.height-e.surround.height)*Te}}const m=d-1,v=h-1,p=new Array(m*v);for(let L=0;L<v;L+=1){const X=u+(L+.5)*t;for(let ee=0;ee<m;ee+=1){const Y=c+(ee+.5)*t,J=fd(n,Y,X);p[L*m+ee]=J!==null&&J.outside===0?Vc(J.segment.spec,J.t):e.surround.surface}}const b={originX:c,originZ:u,spacing:t,columns:d,rows:h,heights:f,surfaces:p},M=n.map(L=>({id:L.spec.id,entry:L.entry,exit:L.exit,colliders:cM(L).map(X=>e.settleBlocks===!0?LM(b,e.surround,X):X)})),T=n.flatMap(oM),x=new Set(T),A=M.flatMap(L=>L.colliders),E=[...T,...e.props??[]].filter(L=>L.onCollider===!0||!wM(n,L,L.kind==="building"?e.buildingStandBack??cp:void 0)).filter(L=>L.onCollider===!0||!RM(b,e.surround,A,L)),g=[];for(const L of E)L.kind==="building"&&(g.some(X=>EM(X,L)||x.has(X)&&x.has(L)&&AM(X,L)>j_)||g.push(L));const _=E.filter(L=>L.kind==="building"?g.includes(L):L.onCollider===!0||!kM(g,L,J_)),R=e.settleProps===!0,C=R?_.filter(L=>L.onCollider===!0||L.kind==="building"||dp(b,e.surround,L).slope<=hM):_,k=PM(b,e.surround,C).map(L=>DM(b,e.surround,L,R)),z=[];for(const L of k){const X=mM(L);X!==null&&z.push(X)}const D=[];for(const L of n)for(const X of lM(L))D.push(...xM(n,A,b,e.surround,X));const V=gM(n,b,e.surround,e.checkpoints);return{id:e.id,spawn:{position:{...e.spawn.position},headingY:e.spawn.headingY},surround:{...e.surround},heightfield:b,segments:M,checkpoints:V,...k.length===0?{}:{props:k},...z.length===0?{}:{solids:z},...D.length===0?{}:{markings:D}}}function mM(i){const e=Q_[i.kind];if(e===null)return null;const t=i.kind==="building"?i.size??{x:12,y:18,z:12}:{x:1,y:1,z:1},n=e.halfX*i.scale*t.x,s=e.halfZ*i.scale*t.z,r=e.height*i.scale*t.y;return{centre:{x:i.position.x,y:i.position.y+r/2,z:i.position.z},halfExtents:{x:n,y:r/2,z:s},rotationY:i.rotationY,surface:e.surface,...e.occludes?{}:{occludes:!1}}}function gM(i,e,t,n){if(n===void 0||n.length===0)return[];bM(n);const s=new Map(i.map(r=>[r.spec.id,r]));return n.map((r,a)=>{const o=s.get(r.segment);if(o===void 0)throw new Error(`checkpoint "${r.id}" is authored on segment "${r.segment}", which the graph never places`);if(!Number.isFinite(r.s)||r.s<0||r.s>o.spec.length)throw new Error(`checkpoint "${r.id}" sits at s=${r.s} on "${r.segment}", which is ${o.spec.length} m long`);const l=dr(o.entry,o.spec,r.s),c=En(o.entry,o.spec,r.s),u={x:o.spec.halfWidth+qe.gateWidthMargin,y:qe.gateHalfHeight,z:qe.gateHalfDepth};return{id:r.id,centre:{x:c.x,y:vM(e,t,c.x,c.z,l,o.spec.halfWidth)+qe.gateHalfHeight,z:c.z},halfExtents:u,headingY:l,routeIndex:a,kind:r.kind,label:r.label}})}function bM(i){if(i.length<2)throw new Error("a timed route needs at least a start and a finish");const e=new Set;i.forEach((t,n)=>{if(e.has(t.id))throw new Error(`duplicate checkpoint id "${t.id}"`);e.add(t.id);const s=n===0?"start":n===i.length-1?"finish":"split";if(t.kind!==s)throw new Error(`checkpoint "${t.id}" is a ${t.kind} at route index ${n}, where a ${s} belongs`)})}function vM(i,e,t,n,s,r){const a=qn(s),o=yh(s),l=qe.gateHalfDepth,c=i.spacing/4,u=Math.max(2,Math.ceil(r*2/c)),d=Math.max(2,Math.ceil(l*2/c));let h=1/0;for(let f=0;f<=u;f+=1){const m=-r+r*2*f/u;for(let v=0;v<=d;v+=1){const p=-l+l*2*v/d;h=Math.min(h,pi(i,e,t+a.x*m+o.x*p,n+a.z*m+o.z*p))}}return h}function xM(i,e,t,n,s){const r=[];let a=[];const o=()=>{a.length>=2&&yM(a)>=ui.minRunLength&&r.push({points:a,width:s.width,dash:s.dash,gap:s.gap,paint:s.paint}),a=[]};for(let l=0;l<s.points.length;l+=1){const c=s.points[l],u=s.points[Math.max(0,l-1)],d=s.points[Math.min(s.points.length-1,l+1)],h=d.x-u.x,f=d.z-u.z,m=Math.hypot(h,f),v=m>1e-9?f/m:0,p=m>1e-9?-h/m:0,b=s.width/2;if(![-b,0,b].every(T=>SM(i,e,t,n,c.x+v*T,c.z+p*T))){o();continue}a.push({x:c.x,y:pi(t,n,c.x,c.z)+ui.lift,z:c.z})}return o(),r}function SM(i,e,t,n,s,r){let a=!1;for(const o of i){const l=Dn(o,s,r);if(l!==null&&l.outside===0){a=!0;break}}if(!a||!$_.includes(MM(t,n,s,r)))return!1;for(const o of e)if(_M(o,s,r,ui.colliderClearance))return!1;return!0}function _M(i,e,t,n){const s=e-i.centre.x,r=t-i.centre.z,a=Math.cos(i.rotationY),o=Math.sin(i.rotationY),l=a*s-o*r,c=o*s+a*r;return Math.abs(l)<=i.halfExtents.x+n&&Math.abs(c)<=i.halfExtents.z+n}function MM(i,e,t,n){const s=Math.floor((t-i.originX)/i.spacing),r=Math.floor((n-i.originZ)/i.spacing);return s<0||r<0||s>=i.columns-1||r>=i.rows-1?e.surface:i.surfaces[r*(i.columns-1)+s]}function yM(i){let e=0;for(let t=1;t<i.length;t+=1)e+=Math.hypot(i[t].x-i[t-1].x,i[t].z-i[t-1].z);return e}const cp=.5;function wM(i,e,t=cp){const n=[[e.x,e.z]],s=Ei[e.kind];if(s.shape==="circle"){const r=s.radius*e.scale;for(let a=0;a<16&&r>0;a+=1){const o=a/16*Math.PI*2;n.push([e.x+Math.cos(o)*r,e.z+Math.sin(o)*r])}}else{const r=Math.cos(e.rotationY),a=Math.sin(e.rotationY),o=(e.size?.x??s.halfX*2)*e.scale/2,l=(e.size?.z??s.halfZ*2)*e.scale/2;for(const[c,u]of[[-o,-l],[0,-l],[o,-l],[-o,0],[o,0],[-o,l],[0,l],[o,l]])n.push([e.x+r*c+a*u,e.z-a*c+r*u])}for(const[r,a]of n)for(const o of i){const l=Dn(o,r,a);if(l!==null&&l.outside<t)return!0}return!1}function EM(i,e){const t=(n,s)=>{const r=Math.cos(n.rotationY),a=Math.sin(n.rotationY),o=s.x-n.x,l=s.z-n.z;return Math.abs(r*o-a*l)<=(n.size?.x??12)/2*n.scale&&Math.abs(a*o+r*l)<=(n.size?.z??12)/2*n.scale};return t(i,e)||t(e,i)}function Vr(i,e=!0){const t=(e?ap:Ei)[i.kind];return t.shape==="circle"?{shape:"circle",x:i.x,z:i.z,radius:t.radius*i.scale}:{shape:"box",x:i.x,z:i.z,rotationY:i.rotationY,halfX:(i.size?.x??t.halfX*2)*i.scale/2,halfZ:(i.size?.z??t.halfZ*2)*i.scale/2}}function TM(i){return{shape:"box",x:i.centre.x,z:i.centre.z,rotationY:i.rotationY,halfX:i.halfExtents.x,halfZ:i.halfExtents.z}}function hp(i,e){const t=[[Math.cos(i.rotationY),-Math.sin(i.rotationY)],[Math.sin(i.rotationY),Math.cos(i.rotationY)],[Math.cos(e.rotationY),-Math.sin(e.rotationY)],[Math.sin(e.rotationY),Math.cos(e.rotationY)]];let n=1/0;for(const[s,r]of t){const a=Math.abs((e.x-i.x)*s+(e.z-i.z)*r),o=i.halfX*Math.abs(Math.cos(i.rotationY)*s-Math.sin(i.rotationY)*r)+i.halfZ*Math.abs(Math.sin(i.rotationY)*s+Math.cos(i.rotationY)*r),l=e.halfX*Math.abs(Math.cos(e.rotationY)*s-Math.sin(e.rotationY)*r)+e.halfZ*Math.abs(Math.sin(e.rotationY)*s+Math.cos(e.rotationY)*r),c=o+l-a;if(c<=1e-9)return 0;n=Math.min(n,c)}return n}function pd(i,e){const t=i.x-e.x,n=i.z-e.z,s=Math.cos(e.rotationY),r=Math.sin(e.rotationY),a=s*t-r*n,o=r*t+s*n,l=Math.min(e.halfX,Math.max(-e.halfX,a)),c=Math.min(e.halfZ,Math.max(-e.halfZ,o));return Math.hypot(a-l,o-c)<i.radius-1e-9}function up(i,e){return i.shape==="circle"&&e.shape==="circle"?Math.hypot(i.x-e.x,i.z-e.z)<i.radius+e.radius-1e-9:i.shape==="circle"?pd(i,e):e.shape==="circle"?pd(e,i):hp(i,e)>0}function AM(i,e){const t=Vr(i,!1),n=Vr(e,!1),s=Math.min(t.halfX*2,t.halfZ*2,n.halfX*2,n.halfZ*2);return s>0?hp(t,n)/s:0}function Wc(i,e,t){const n=pi(i,e,t.x,t.z)+t.lift,s=K_[t.kind];return{bottom:n+s.bottom*t.scale,top:n+s.top*t.scale}}function RM(i,e,t,n){const s=Vr(n),r=Wc(i,e,n);for(const a of t){if(n.kind==="shrub"&&a.appearance==="wood"&&a.halfExtents.x<=.35&&a.halfExtents.z<=.35)continue;const o=a.centre.y-a.halfExtents.y,l=a.centre.y+a.halfExtents.y;if(!(Math.min(r.top,l)-Math.max(r.bottom,o)<=.02)&&up(s,TM(a)))return!0}return!1}function Tl(i){return i==="signpost"?5:i==="lampPost"?4:i==="bench"?3:i==="litterBin"?2:i==="fenceBay"?1:0}function CM(i,e,t,n){if(t.kind==="fenceBay"&&n.kind==="fenceBay")return!1;const s=Wc(i,e,t),r=Wc(i,e,n);return Math.min(s.top,r.top)-Math.max(s.bottom,r.bottom)<=.02?!1:up(Vr(t),Vr(n))}function PM(i,e,t){const n=t.filter(o=>o.kind==="building"||o.onCollider===!0),s=t.filter(o=>o.kind!=="building"&&o.onCollider!==!0).map((o,l)=>({prop:o,index:l})).sort((o,l)=>Tl(l.prop.kind)-Tl(o.prop.kind)||o.index-l.index),r=new Set(n),a=[];for(const{prop:o}of s)a.some(l=>CM(i,e,o,l))||(r.add(o),Tl(o.kind)>0&&a.push(o));return t.filter(o=>r.has(o))}function LM(i,e,t){const n=t.centre.y-t.halfExtents.y,s=t.centre.y+t.halfExtents.y,r=i.spacing/2,a=Math.max(2,Math.ceil(t.halfExtents.x*2/r)),o=Math.max(2,Math.ceil(t.halfExtents.z*2/r)),l=Math.cos(t.rotationY),c=Math.sin(t.rotationY);let u=n;for(let d=0;d<=a;d+=1){const h=-t.halfExtents.x+t.halfExtents.x*2*d/a;for(let f=0;f<=o;f+=1){const m=-t.halfExtents.z+t.halfExtents.z*2*f/o,v=pi(i,e,t.centre.x+l*h+c*m,t.centre.z-c*h+l*m);v<u&&(u=v)}}return u>=n?t:{...t,centre:{...t.centre,y:(s+u)/2},halfExtents:{...t.halfExtents,y:(s-u)/2}}}function IM(i,e,t){const n=t.size??{x:12,z:12},s=n.x*t.scale/2,r=n.z*t.scale/2,a=i.spacing/2,o=Math.max(2,Math.ceil(s*2/a)),l=Math.max(2,Math.ceil(r*2/a)),c=Math.cos(t.rotationY),u=Math.sin(t.rotationY);let d=pi(i,e,t.x,t.z)+t.lift;for(let h=0;h<=o;h+=1){const f=-s+s*2*h/o;for(let m=0;m<=l;m+=1){const v=-r+r*2*m/l,p=t.x+c*f+u*v,b=t.z-u*f+c*v;d=Math.min(d,pi(i,e,p,b)+t.lift)}}return d}function dp(i,e,t){const n=Ei[t.kind],s=n.shape==="circle"?n.radius*t.scale:Math.max(n.halfX,n.halfZ)*t.scale,r=pi(i,e,t.x,t.z);if(s<=0)return{lowest:r,slope:0};let a=r,o=r;const l=Math.cos(t.rotationY),c=Math.sin(t.rotationY);for(let u=0;u<8;u+=1){const d=u/8*Math.PI*2,h=Math.cos(d)*s,f=Math.sin(d)*s,m=pi(i,e,t.x+l*h+c*f,t.z-c*h+l*f);m<a&&(a=m),m>o&&(o=m)}return{lowest:a,slope:Math.atan((o-a)/(2*s))}}function DM(i,e,t,n=!1){const s=pi(i,e,t.x,t.z)+t.lift;if(t.kind!=="building"){const o=!n||t.onCollider===!0?n&&t.baseY!==void 0?t.baseY+t.lift:s:dp(i,e,t).lowest+t.lift;return{kind:t.kind,position:{x:t.x,y:o,z:t.z},rotationY:t.rotationY,scale:t.scale,...t.size===void 0?{}:{size:{...t.size}}}}const r=IM(i,e,t),a=t.size??{x:12,y:18,z:12};return{kind:t.kind,position:{x:t.x,y:r,z:t.z},rotationY:t.rotationY,scale:t.scale,size:{...a,y:a.y+(s-r)/t.scale}}}function kM(i,e,t){const n=ap[e.kind];for(const s of i){if(s===e)continue;const r=Math.max(.1,(s.size?.x??12)/2*s.scale+t),a=Math.max(.1,(s.size?.z??12)/2*s.scale+t),o=Math.cos(s.rotationY),l=Math.sin(s.rotationY),c=e.x-s.x,u=e.z-s.z,d=o*c-l*u,h=l*c+o*u;if(n.shape==="circle"){const R=n.radius*e.scale,C=Math.min(r,Math.max(-r,d)),I=Math.min(a,Math.max(-a,h));if(Math.hypot(d-C,h-I)<=R)return!0;continue}const f=(e.size?.x??n.halfX*2)*e.scale/2,m=(e.size?.z??n.halfZ*2)*e.scale/2,v=e.rotationY-s.rotationY,p=Math.cos(v),b=Math.sin(v),M=Math.abs(p),T=Math.abs(b),x=f*M+m*T,A=f*T+m*M;if(Math.abs(d)>r+x||Math.abs(h)>a+A)continue;const y=r*M+a*T,E=r*T+a*M,g=p*d-b*h,_=b*d+p*h;if(!(Math.abs(g)>f+y)&&!(Math.abs(_)>m+E))return!0}return!1}function pi(i,e,t,n){const s=i.originX+(i.columns-1)*i.spacing,r=i.originZ+(i.rows-1)*i.spacing;if(t<i.originX||t>s||n<i.originZ||n>r)return e.height;const a=(t-i.originX)/i.spacing,o=(n-i.originZ)/i.spacing,l=Math.min(i.columns-2,Math.max(0,Math.floor(a))),c=Math.min(i.rows-2,Math.max(0,Math.floor(o))),u=a-l,d=o-c,h=c*i.columns+l,f=i.heights[h],m=i.heights[h+i.columns+1];if(d<u){const p=i.heights[h+1];return f+(p-f)*u+(m-p)*d}const v=i.heights[h+i.columns];return f+(m-v)*u+(v-f)*d}function FM(){return{positions:[],normals:[],colors:[],indices:[]}}function fp(i){const e=new Array(i.length);e[0]=0;for(let t=1;t<i.length;t+=1){const n=i[t-1],s=i[t];e[t]=e[t-1]+Math.hypot(s.x-n.x,s.z-n.z)}return e}function pp(i,e,t){if(i<=0)return[];if(e<=0||t<=0)return[{from:0,to:i}];const n=e+t,s=Math.max(1,Math.round((i+t)/n)),r=s*e+(s-1)*t,a=(i-r)/2,o=[];for(let l=0;l<s;l+=1){const c=a+l*n,u=Math.max(0,c),d=Math.min(i,c+e);d-u>1e-6&&o.push({from:u,to:d})}return o}const UM=1.25;function mp(i){return Math.max(2,Math.ceil(i/UM)+1)}function NM(i,e,t){if(i.length<2)return 0;const s=fp(i)[i.length-1];if(s<=0)return 0;let r=0;for(const a of pp(s,e,t))r+=mp(a.to-a.from)-1;return r}function Al(i,e,t,n){const s=i.length-1;if(t<=0){n.x=i[0].x,n.y=i[0].y,n.z=i[0].z;return}if(t>=e[s]){n.x=i[s].x,n.y=i[s].y,n.z=i[s].z;return}let r=1;for(;r<s&&e[r]<t;)r+=1;const a=e[r]-e[r-1],o=a>1e-9?(t-e[r-1])/a:0,l=i[r-1],c=i[r];n.x=l.x+(c.x-l.x)*o,n.y=l.y+(c.y-l.y)*o,n.z=l.z+(c.z-l.z)*o}function OM(i,e,t){let n=Math.imul(Math.round(i*20),374761393)+Math.imul(Math.round(e*20),668265263)+1013904223|0;n=Math.imul(n^n>>>13,1274126177)|0,n=n^n>>>16;const r=(n>>>0)/4294967296*2-1;return 1+r*Math.abs(r)*t}function zM(i,e,t,n,s,r,a,o){if(i.length<2||e<=0)return 0;const l=fp(i),c=l[i.length-1];if(c<=0)return 0;const u=pp(c,t,n),d={x:0,y:0,z:0};let h=0;for(const f of u){const m=f.to-f.from,v=mp(m),p=a.positions.length/3;for(let b=0;b<v;b+=1){const M=f.from+m*b/(v-1);Al(i,l,M,d);const T=Math.max(f.from,M-.35),x=Math.min(f.to,M+.35),A={x:0,y:0,z:0},y={x:0,y:0,z:0};Al(i,l,T,A),Al(i,l,x,y);let E=y.x-A.x,g=y.z-A.z;const _=Math.hypot(E,g);_<1e-9?(E=0,g=1):(E/=_,g/=_);const R=g,C=-E,I=OM(d.x,d.z,r);for(const k of[1,-1]){const z=d.x+R*e*k,D=d.z+C*e*k;a.positions.push(z,o?.(z,D)??d.y,D),a.normals.push(0,1,0),a.colors.push(s.r*I,s.g*I,s.b*I)}}for(let b=0;b<v-1;b+=1){const M=p+b*2;a.indices.push(M,M+1,M+2,M+1,M+3,M+2),h+=2}}return h}function BM(i){const e=new kt;e.name="level-markings";const t=i.markings??[],n=FM(),s=new Ve;let r=0,a=0;for(const u of t){const d=ud[u.paint]??ud.road;s.setHex(d.albedo),r+=zM(u.points,u.width/2,u.dash,u.gap,{r:s.r,g:s.g,b:s.b},d.wear,n,(h,f)=>pi(i.heightfield,i.surround,h,f)+ui.lift);for(let h=1;h<u.points.length;h+=1)a+=Math.hypot(u.points[h].x-u.points[h-1].x,u.points[h].z-u.points[h-1].z)}if(n.indices.length===0)return{group:e,runs:0,triangles:0,drawCalls:0,paintedLength:0,dispose(){e.removeFromParent()}};const o=new Ut;o.setAttribute("position",new Je(n.positions,3)),o.setAttribute("normal",new Je(n.normals,3)),o.setAttribute("color",new Je(n.colors,3)),o.setIndex(n.indices),o.computeBoundingSphere();const l=new nn({color:16777215,roughness:.82,metalness:0,vertexColors:!0});l.polygonOffset=!0,l.polygonOffsetFactor=-2,l.polygonOffsetUnits=-2;const c=new ht(o,l);return c.name="level-markings-paint",c.castShadow=!1,c.receiveShadow=!0,e.add(c),{group:e,runs:t.length,triangles:r,drawCalls:1,paintedLength:a,dispose(){o.dispose(),l.dispose(),e.clear(),e.removeFromParent()}}}const wr=Ss("wood"),vn=Ss("metal"),md={trunk:{build:()=>{const i=fe.broadleafTree;return Er(i.trunkRadiusTop,i.trunkRadiusBase,i.trunkHeight,i.trunkSides,0)},albedo:wr.albedo,roughness:.95,metalness:0,tint:an.structure,castShadow:!0},crown:{build:()=>{const i=fe.broadleafTree,e=i.crownRadius;return Yi([La(e,1,i.crownHeight/(2*e),.92,0,i.crownCentre,0),La(i.upperRadius,1,.85,1,i.upperOffset,i.upperCentre,-.3)])},albedo:wi.broadleafFoliage,roughness:1,metalness:0,tint:an.foliage,castShadow:!0},coniferFoliage:{build:()=>Yi(fe.conifer.tiers.map(i=>VM(i.radius,i.height,fe.conifer.tierSides,i.base))),albedo:wi.coniferFoliage,roughness:1,metalness:0,tint:an.foliage,castShadow:!0},shrub:{build:()=>{const i=fe.shrub;return La(i.radius,i.scaleX,i.scaleY,i.scaleZ,0,i.centre,0)},albedo:wi.shrubFoliage,roughness:1,metalness:0,tint:an.foliage,castShadow:!0},lampPost:{build:()=>{const i=fe.lampPost;return Yi([Er(i.postRadius,i.postRadius*1.35,i.postHeight,i.postSides,0),ei(i.armThickness,i.armThickness,i.armLength,0,i.postHeight-i.armThickness/2,i.armLength/2)])},albedo:vn.albedo,roughness:vn.roughness,metalness:vn.metalness,tint:an.structure,castShadow:!0},lampHead:{build:()=>{const i=fe.lampPost;return ei(i.headWidth,i.headHeight,i.headDepth,0,i.postHeight-i.armThickness-i.headHeight/2,i.headReach)},albedo:wi.lampHead,roughness:.55,metalness:.1,tint:an.structure,castShadow:!1},benchWood:{build:()=>{const i=fe.bench;return Yi([ei(i.length,i.seatThickness,i.seatDepth,0,i.seatHeight,0),ei(i.length,i.backHeight,i.backThickness,0,i.seatHeight+i.backHeight/2,-i.seatDepth/2+i.backThickness/2)])},albedo:wr.albedo,roughness:wr.roughness,metalness:0,tint:an.structure,castShadow:!0},benchMetal:{build:()=>{const i=fe.bench;return Yi([1,-1].map(e=>ei(i.legThickness,i.seatHeight,i.seatDepth*.8,e*(i.length/2-i.legThickness),i.seatHeight/2,0)))},albedo:vn.albedo,roughness:vn.roughness,metalness:vn.metalness,tint:an.structure,castShadow:!0},litterBin:{build:()=>{const i=fe.litterBin;return Yi([Er(i.radiusTop,i.radiusBase,i.height,i.sides,0),Er(i.radiusTop*1.12,i.radiusTop*1.12,i.rimHeight,i.sides,i.height)])},albedo:vn.albedo,roughness:.6,metalness:.5,tint:an.structure,castShadow:!0},bollardCap:{build:()=>{const i=fe.bollardCap;return La(i.radius,1,i.scaleY,1,0,0,0)},albedo:vn.albedo,roughness:vn.roughness,metalness:vn.metalness,tint:an.structure,castShadow:!1},signPost:{build:()=>{const i=fe.signpost;return Er(i.postRadius,i.postRadius,i.postHeight,i.postSides,0)},albedo:vn.albedo,roughness:vn.roughness,metalness:vn.metalness,tint:an.structure,castShadow:!0},signPlate:{build:()=>{const i=fe.signpost;return Yi([ei(i.plateWidth,i.plateHeight,i.plateThickness,i.plateWidth/2-i.postRadius,i.plateCentre,0),ei(i.lowerWidth,i.lowerHeight,i.plateThickness,i.lowerWidth/2-i.postRadius,i.lowerCentre,0)])},albedo:wi.signPlate,roughness:.5,metalness:.15,tint:an.structure,castShadow:!1},fenceBay:{build:()=>{const i=fe.fenceBay;return Yi([ei(i.postWidth,i.postHeight,i.postWidth,0,i.postHeight/2,0),...[i.railUpper,i.railLower].map(e=>ei(i.railThickness,i.railHeight,i.length,0,e,0))])},albedo:wr.albedo,roughness:wr.roughness,metalness:0,tint:an.structure,castShadow:!0},buildingBody:{build:()=>gd(yn.lowFloors),albedo:16777215,roughness:.92,metalness:0,tint:0,castShadow:!1},buildingTall:{build:()=>gd(yn.highFloors),albedo:16777215,roughness:.92,metalness:0,tint:0,castShadow:!1},buildingCap:{build:()=>ei(1,1,1,0,.5,0),albedo:wi.buildingCap,roughness:.9,metalness:0,tint:an.structure,castShadow:!1}},HM={broadleafTree:["trunk","crown"],treeCanopy:["crown"],conifer:["coniferFoliage"],shrub:["shrub"],lampPost:["lampPost","lampHead"],bench:["benchWood","benchMetal"],litterBin:["litterBin"],bollardCap:["bollardCap"],signpost:["signPost","signPlate"],fenceBay:["fenceBay"]};function Ro(i){const e=i.index===null?i:i.toNonIndexed();return e!==i&&i.dispose(),e.deleteAttribute("uv"),e.computeVertexNormals(),e}function GM(i){if(i.getAttribute("color")===void 0){const e=i.getAttribute("position").count;i.setAttribute("color",new Je(new Array(e*3).fill(1),3))}return i.computeBoundingSphere(),i}function Yi(i){const e=[],t=[];for(const s of i){const r=s.getAttribute("position"),a=s.getAttribute("normal");for(let o=0;o<r.count;o+=1)e.push(r.getX(o),r.getY(o),r.getZ(o)),t.push(a.getX(o),a.getY(o),a.getZ(o));s.dispose()}const n=new Ut;return n.setAttribute("position",new Je(e,3)),n.setAttribute("normal",new Je(t,3)),n}function ei(i,e,t,n,s,r){return Ro(new In(i,e,t)).translate(n,s,r)}function Er(i,e,t,n,s){return Ro(new ii(i,e,t,n,1,!1)).translate(0,s+t/2,0)}function VM(i,e,t,n){return Ro(new gh(i,e,t,1,!1)).translate(0,n+e/2,0)}function gd(i){const e=[],t=[],n=[],s=yn.glassTint,r=.5,a=[[-r,-r],[-r,r],[r,r],[r,-r]],o=(h,f,m,v,p,b,M,T,x)=>{const A=[[h,p,f],[m,p,v],[m,b,v],[h,p,f],[m,b,v],[h,b,f]];for(const[y,E,g]of A)e.push(y,E,g),t.push(M,0,T),n.push(x.r,x.g,x.b)},l={r:1,g:1,b:1},c=1/i,u=1-yn.glazing;for(let h=0;h<4;h+=1){const[f,m]=a[h],[v,p]=a[(h+1)%4],b=-(p-m),M=v-f;for(let T=0;T<i;T+=1){const x=T*c;if(!(T>0||!yn.solidGroundFloor)){o(f,m,v,p,x,x+c,b,M,l);continue}const y=x+c*u;o(f,m,v,p,x,y,b,M,l),o(f,m,v,p,y,x+c,b,M,s)}}for(const[h,f]of[[1,1],[0,-1]]){const m=f>0?[[-r,-r],[-r,r],[r,r],[r,-r]]:[[-r,-r],[r,-r],[r,r],[-r,r]],[v,p,b,M]=m;for(const[T,x]of[v,p,b,v,b,M])e.push(T,h,x),t.push(0,f,0),n.push(1,1,1)}const d=new Ut;return d.setAttribute("position",new Je(e,3)),d.setAttribute("normal",new Je(t,3)),d.setAttribute("color",new Je(n,3)),d}function La(i,e,t,n,s,r,a){return Ro(new vh(i,0)).scale(e,t,n).translate(s,r,a)}const Ia=tp;function WM(i){const e=new kt;e.name="level-props";const t=i.props??[],n=new Map,s=new at,r=new at,a=new at,o=new Mn,l=new F(0,1,0),c=new F,u=new F,d=new Ve,h=(E,g,_)=>{let R=n.get(E);R===void 0&&(R={matrices:[],colours:[]},n.set(E,R));for(const C of g.elements)R.matrices.push(C);R.colours.push(_.r,_.g,_.b)},f=(E,g,_)=>{const R=md[E];if(d.setHex(R.albedo),R.tint>0){const C=1+(Ia(g.position.x,g.position.z,_)*2-1)*R.tint;d.multiplyScalar(C)}return d};for(const E of t){c.set(E.position.x,E.position.y,E.position.z),o.setFromAxisAngle(l,E.rotationY),u.setScalar(E.scale),s.compose(c,o,u);const g=HM[E.kind];if(g!==void 0){for(const k of g)h(k,s,f(k,E,11));continue}const _=E.size??{x:12,y:18,z:12},R=fe.building,C=k=>k>=yn.highRiseHeight?"buildingTall":"buildingBody";d.setHex(El[Math.floor(Ia(E.position.x,E.position.z,3)*El.length)%El.length]),d.multiplyScalar(1+(Ia(E.position.x,E.position.z,5)*2-1)*an.building);const I=d.clone();if(h(C(_.y),a.multiplyMatrices(s,r.makeScale(_.x,_.y,_.z)),I),r.makeScale(_.x+R.capOversail,R.capHeight,_.z+R.capOversail),r.setPosition(0,_.y,0),h("buildingCap",a.multiplyMatrices(s,r),f("buildingCap",E,7)),Ia(E.position.x,E.position.z,9)>.55){const k=_.y*R.towerHeightFraction,z=C(k),D=z==="buildingTall"?yn.highFloors:yn.lowFloors;if(k/D<yn.minFloorHeight)continue;r.makeScale(_.x*R.towerWidthFraction,k,_.z*R.towerWidthFraction),r.setPosition(0,_.y+R.capHeight,0),h(z,a.multiplyMatrices(s,r),I)}}const m=[],v=[],p=[];let b=0,M=0,T=0,x=0,A=0;const y=new at;for(const[E,g]of n){const _=md[E],R=g.colours.length/3;if(R===0)continue;const C=GM(_.build()),I=new nn({color:16777215,roughness:_.roughness,metalness:_.metalness,vertexColors:!0}),k=new Nf(C,I,R);k.name=`level-props-${E}`,k.castShadow=_.castShadow,k.receiveShadow=!1;for(let D=0;D<R;D+=1)y.fromArray(g.matrices,D*16),k.setMatrixAt(D,y),d.setRGB(g.colours[D*3],g.colours[D*3+1],g.colours[D*3+2]),k.setColorAt(D,d);k.instanceMatrix.needsUpdate=!0,k.instanceColor!==null&&(k.instanceColor.needsUpdate=!0),k.computeBoundingSphere(),e.add(k),p.push(k),m.push(C),v.push(I);const z=C.getAttribute("position").count/3*R;b+=R,M+=z,T+=1,_.castShadow&&(A+=1,x+=z)}return{group:e,props:t.length,instances:b,drawCalls:T,triangles:M,shadowDrawCalls:A,shadowTriangles:x,dispose(){for(const E of p)E.dispose();for(const E of m)E.dispose();for(const E of v)E.dispose();p.length=0,m.length=0,v.length=0,e.clear(),e.removeFromParent()}}}const XM={cellWeight:.52,midMetres:5.7,midWeight:.52,coarseMetres:27,coarseWeight:.5,hueMetres:19,hueWeight:.4,satMetres:41,satWeight:.4},YM={cellWeight:.36,midMetres:37,midWeight:.58,coarseMetres:145,coarseWeight:.57,hueMetres:96,hueWeight:.6,satWeight:.45,satMetres:210},Xc={maxBlend:.36,patchMetres:5.5};function qM(i,e,t,n,s,r){if(s<=0)return 0;const a=Cr(t,n,Xc.patchMetres,15639,.83)*.5+.5,o=xs(i,e,r);return s*Xc.maxBlend*a*(.35+.65*o)}function $M(i,e,t,n){return n.r=i.r+(e.r-i.r)*t,n.g=i.g+(e.g-i.g)*t,n.b=i.b+(e.b-i.b)*t,n}function ZM(i,e,t){return i.r*=t.r>1e-6?e.r/t.r:1,i.g*=t.g>1e-6?e.g/t.g:1,i.b*=t.b>1e-6?e.b/t.b:1,i}function KM(i,e,t){const n=Math.floor(e/t.module),s=Math.floor(i/t.module+((n&1)===0?0:.5)),r=xs(s,n,31583)*2-1;return 1+r*Math.abs(r)*t.contrast}function xs(i,e,t){let n=Math.imul(i|0,374761393)+Math.imul(e|0,668265263)+Math.imul(t,2147483647)|0;return n=Math.imul(n^n>>>13,1274126177)|0,n=Math.imul(n^n>>>15,1540483477)|0,n=n^n>>>16,(n>>>0)/4294967296}function bd(i){return i*i*i*(i*(i*6-15)+10)}function vd(i,e,t,n,s){const r=Math.cos(s),a=Math.sin(s),o=(i*r-e*a)/t,l=(i*a+e*r)/t,c=Math.floor(o),u=Math.floor(l),d=bd(o-c),h=bd(l-u),f=xs(c,u,n),m=xs(c+1,u,n),v=xs(c,u+1,n),p=xs(c+1,u+1,n),b=f+(m-f)*d,M=v+(p-v)*d;return(b+(M-b)*h)*2-1}function Cr(i,e,t,n,s){return vd(i,e,t,n,s)*.68+vd(i,e,t*.37,n^40503,s+1.1)*.32}function QM(i,e,t){return .2126*i+.7152*e+.0722*t}function gp(i,e,t,n,s,r,a,o){const l=xs(i,e,20973)*2-1,c=l*Math.abs(l),u=Cr(t,n,a.midMetres,12190,.61),d=Cr(t,n,a.coarseMetres,31549,2.19),h=1+s*(c*a.cellWeight+u*a.midWeight+d*a.coarseWeight),f=Cr(t,n,a.hueMetres,7239,1.37)*s*a.hueWeight,m=QM(r.r,r.g,r.b),v=1+Cr(t,n,a.satMetres,27361,2.83)*s*a.satWeight;return o.r=Rl(r.r,m,v)*h*(1+f),o.g=Rl(r.g,m,v)*h*(1+f*.34),o.b=Rl(r.b,m,v)*h*(1-f),o}function Rl(i,e,t){return i<1e-4?1:Math.max(0,t+e/i*(1-t))}function Eh(i,e){return e.r=((i>>16&255)/255)**2.2,e.g=((i>>8&255)/255)**2.2,e.b=((i&255)/255)**2.2,e}function Pr(i,e,t){return i.heights[t*i.columns+e]}function JM(){const i=new Map;for(const e of Object.keys(wn)){const t=Ss(wn[e].material),n={r:1,g:1,b:1};Eh(t.albedo,n),i.set(e,{encroach:t.encroach,linear:n})}return i}function jM(i,e,t,n){const s=Pr(i,Math.max(0,e-1),t),r=Pr(i,Math.min(i.columns-1,e+1),t),a=Pr(i,e,Math.max(0,t-1)),o=Pr(i,e,Math.min(i.rows-1,t+1)),l=(Math.min(i.columns-1,e+1)-Math.max(0,e-1))*i.spacing,c=(Math.min(i.rows-1,t+1)-Math.max(0,t-1))*i.spacing;n.set(l>0?-(r-s)/l:0,1,c>0?-(o-a)/c:0).normalize()}function Ja(i,e){return new nn({color:i.albedo,roughness:i.roughness,metalness:i.metalness,vertexColors:e})}function ey(i){const e=new kt;e.name="level-terrain";const t=[],n=[],s=i.heightfield,r=Ss(wn[i.surround.surface].material);let a=i.surround.height;for(const Y of s.heights)Y<a&&(a=Y);const o=new Xr(Et.surroundBackstopHalfExtent*2,Et.surroundBackstopHalfExtent*2),l=Ja(r,!1);l.polygonOffset=!0,l.polygonOffsetFactor=2,l.polygonOffsetUnits=2;const c=new ht(o,l);c.rotation.x=-Math.PI/2,c.position.y=a-Et.surroundBackstopDrop,c.name="level-surround",e.add(c),t.push(o),n.push(l);const{coverage:u,bySurface:d,cellsDrawn:h}=rp(i),f=ty(i,r,u);e.add(f.mesh),t.push(f.geometry),n.push(f.material);const m=s.columns-1,v=s.rows-1,p=[],b=[],M=[],T=[],x=[],A=new F,y=(Y,J,te)=>{const Te=p.length/3;return p.push(s.originX+Y*s.spacing,Pr(s,Y,J),s.originZ+J*s.spacing),jM(s,Y,J,A),b.push(A.x,A.y,A.z),M.push(te.r,te.g,te.b),Te},E={r:1,g:1,b:1},g={r:1,g:1,b:1},_={r:1,g:1,b:1},R={r:0,g:0,b:0},C=JM();for(const[Y,J]of d){const te=Ss(wn[Y]?.material??"pavement");Eh(te.albedo,g);const Te=C.get(Y);for(const Oe of J){const q=Math.floor(Oe/m),G=Oe-q*m,ne=s.originX+(G+.5)*s.spacing,re=s.originZ+(q+.5)*s.spacing;let le=0;R.r=0,R.g=0,R.b=0;for(let Ge=0;Ge<4;Ge+=1){const $e=G+(Ge===0?-1:Ge===1?1:0),dt=q+(Ge===2?-1:Ge===3?1:0);if($e<0||dt<0||$e>=m||dt>=v)continue;const ot=C.get(s.surfaces[dt*m+$e]);if(ot===void 0||ot.encroach<=(Te?.encroach??0))continue;const Mt=qM(G,q,ne,re,ot.encroach,689+Ge);Mt<=0||(le+=Mt,R.r+=ot.linear.r*Mt,R.g+=ot.linear.g*Mt,R.b+=ot.linear.b*Mt)}let ve=g;if(le>0&&(R.r/=le,R.g/=le,R.b/=le,ve=$M(g,R,Math.min(Xc.maxBlend,le),_)),gp(G,q,ne,re,te.mottle,ve,XM,E),le>0&&ZM(E,ve,g),te.paving!==void 0){const Ge=KM(ne,re,te.paving);E.r*=Ge,E.g*=Ge,E.b*=Ge}const Se=y(G,q,E),je=y(G+1,q,E),Ie=y(G,q+1,E),nt=y(G+1,q+1,E);T.push(Se,Ie,je,je,Ie,nt)}x.push(Ja(te,!0))}const I=new Ut;I.setAttribute("position",new Je(p,3)),I.setAttribute("normal",new Je(b,3)),I.setAttribute("color",new Je(M,3)),I.setIndex(T);let k=0,z=0;for(const Y of d.values()){const J=Y.length*6;I.addGroup(k,J,z),k+=J,z+=1}I.computeBoundingSphere();const D=new ht(I,x);D.receiveShadow=!0,D.castShadow=!1,D.name="level-heightfield",e.add(D),t.push(I),n.push(...x);const V=new Map;for(const Y of i.segments)for(const J of Y.colliders){const te=J.appearance??wn[J.surface].material,Te=V.get(te);Te===void 0?V.set(te,[J]):Te.push(J)}let L=0;for(const[Y,J]of V){const te=Ss(Y),Te=[],Oe=[],q=[];for(const le of J)ny(le,Te,Oe,q);const G=new Ut;G.setAttribute("position",new Je(Te,3)),G.setAttribute("normal",new Je(Oe,3)),G.setIndex(q),G.computeBoundingSphere();const ne=Ja(te,!1),re=new ht(G,ne);re.castShadow=!0,re.receiveShadow=!0,re.name=`level-blocks-${Y}`,e.add(re),t.push(G),n.push(ne),L+=q.length/3}const X=WM(i);e.add(X.group);const ee=BM(i);return e.add(ee.group),{group:e,cellsDrawn:h,markings:ee,triangles:T.length/3+L+f.triangles+2+X.triangles+ee.triangles,setSurroundCentre(Y,J){c.position.x=Y,c.position.z=J},dispose(){X.dispose(),ee.dispose();for(const Y of t)Y.dispose();for(const Y of n)Y.dispose();t.length=0,n.length=0,e.removeFromParent()}}}function ty(i,e,t){const{cell:n,columns:s,rows:r,minX:a,minZ:o}=t,l=[],c=[],u=[],d=[],h=i.surround.height,f={r:1,g:1,b:1},m={r:1,g:1,b:1};Eh(e.albedo,m);for(let M=0;M<r;M+=1)for(let T=0;T<s;T+=1){if(!t.patch(T,M))continue;const x=a+T*n,A=o+M*n;gp(T+7919,M+104729,x+n*.5,A+n*.5,e.mottle,m,YM,f);const y=l.length/3;for(const[E,g]of[[0,0],[1,0],[0,1],[1,1]])l.push(x+E*n,h,A+g*n),c.push(0,1,0),u.push(f.r,f.g,f.b);d.push(y,y+2,y+1,y+1,y+2,y+3)}const v=new Ut;v.setAttribute("position",new Je(l,3)),v.setAttribute("normal",new Je(c,3)),v.setAttribute("color",new Je(u,3)),v.setIndex(d),v.computeBoundingSphere();const p=Ja(e,!0);p.polygonOffset=!0,p.polygonOffsetFactor=1,p.polygonOffsetUnits=1;const b=new ht(v,p);return b.receiveShadow=!0,b.name="level-field",{mesh:b,geometry:v,material:p,triangles:d.length/3}}function ny(i,e,t,n){const{centre:s,halfExtents:r}=i,a=Math.cos(i.rotationY),o=Math.sin(i.rotationY),l=(u,d,h)=>[s.x+a*u+o*h,s.y+d,s.z-o*u+a*h],c=[{normal:[0,1,0],corners:[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]},{normal:[0,-1,0],corners:[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]},{normal:[1,0,0],corners:[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]},{normal:[-1,0,0],corners:[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]},{normal:[0,0,1],corners:[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]},{normal:[0,0,-1],corners:[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]}];for(const u of c){const d=e.length/3,[h,f,m]=u.normal,v=a*h+o*m,p=-o*h+a*m;for(const[b,M,T]of u.corners){const[x,A,y]=l(b*r.x,M*r.y,T*r.z);e.push(x,A,y),t.push(v,f,p)}n.push(d,d+1,d+2,d,d+2,d+3)}}const iy=j.pedalStrikeReferenceDepth,sy=Qe.particleColours;class ry{renderer;scene;camera;sun;hemisphere;disposables=[];terrain=null;gates=null;checkpointsVisible=!1;nextCheckpointIndex=-1;ghost;sparks;dust;sky;sunOffset=new F;lastWidth=0;lastHeight=0;lastPixelRatio=0;contextCallbacks=null;maxPixelRatio=ep.maxPixelRatio;sparkDebt=0;constructor(e){this.renderer=new XS({canvas:e,antialias:!0,powerPreference:"high-performance"}),this.renderer.outputColorSpace=un,this.renderer.toneMapping=th,this.renderer.toneMappingExposure=Be.exposure,this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=Dr,this.scene=new Eg,this.sky=Y_(),this.scene.background=this.sky.texture,this.scene.fog=new fh(Be.horizonColour,Be.fogNear,Be.fogFar),this.camera=new Pn(Nc.radToDeg(Ze.fovAtRest),1,Ze.near,Ze.far),this.hemisphere=new Wg(Be.skyColour,Be.groundBounceColour,Be.hemisphereIntensity),this.scene.add(this.hemisphere),this.sun=new qg(Be.sunColour,Be.sunIntensity);const t=Math.cos(Be.sunElevation)*Be.sunDistance;this.sunOffset.set(Math.sin(Be.sunAzimuth)*t,Math.sin(Be.sunElevation)*Be.sunDistance,Math.cos(Be.sunAzimuth)*t),this.sun.position.copy(this.sunOffset),this.sun.castShadow=!0,this.sun.shadow.mapSize.setScalar(Be.shadowMapSize),this.sun.shadow.bias=Be.shadowBias,this.sun.shadow.normalBias=Be.shadowNormalBias;const n=this.sun.shadow.camera;n.left=-Be.shadowRadius,n.right=Be.shadowRadius,n.top=Be.shadowRadius,n.bottom=-Be.shadowRadius,n.near=1,n.far=Be.sunDistance*2,n.updateProjectionMatrix(),this.scene.add(this.sun),this.scene.add(this.sun.target),this.sparks=cd({name:"fx-sparks",capacity:Qe.sparkCount,size:Qe.sparkSize,gravity:Qe.sparkGravity,fadeTo:Qe.sparkFadeColour}),this.dust=cd({name:"fx-dust",capacity:Qe.dustCount,size:Qe.dustSize,gravity:Qe.dustGravity,fadeTo:Be.horizonColour}),this.scene.add(this.sparks.points),this.scene.add(this.dust.points),this.ghost=H_(),this.scene.add(this.ghost.group),e.addEventListener("webglcontextlost",this.onContextLost),e.addEventListener("webglcontextrestored",this.onContextRestored)}emitSparks(e,t,n,s,r,a,o){const l=Math.min(1,s/iy);if(l<=0||o<=0)return;this.sparkDebt+=Qe.sparkRatePerSecond*l*o;const c=Math.floor(this.sparkDebt);if(c<=0)return;this.sparkDebt-=c;const u=r*Math.cos(a),d=r*-Math.sin(a);this.sparks.emit({x:e,y:t,z:n,count:c,speed:Qe.sparkSpeed*(.5+.5*l),spread:Qe.sparkSpread,axisX:u-Math.sin(a)*.6,axisY:.35,axisZ:d-Math.cos(a)*.6,lifeSeconds:Qe.sparkLifeSeconds,colour:Qe.sparkColour,intensity:Qe.sparkIntensity})}emitLandingParticles(e,t,n,s,r){const a=Sh(s),o=sy[a.particle];if(o===void 0)return;const l=Math.min(1,Math.max(0,r)),c=Math.round(Qe.dustPerLanding*l);c<=0||this.dust.emit({x:e,y:t,z:n,count:c,speed:Qe.dustSpeed*(.4+.6*l),spread:Math.PI*.5,axisX:0,axisY:1,axisZ:0,lifeSeconds:Qe.dustLifeSeconds,colour:o,fadeTo:Ss(a.material).albedo})}stepParticles(e){this.sparks.step(e),this.dust.step(e)}clearParticles(){this.sparks.clear(),this.dust.clear(),this.sparkDebt=0}particleCounts(){return{sparks:this.sparks.live,dust:this.dust.live}}setLevel(e){this.terrain?.dispose();const t=ey(e);this.terrain=t,this.scene.add(t.group),this.gates?.dispose();const n=jS(e.checkpoints);return this.gates=n,this.scene.add(n.group),n.setProgress(this.nextCheckpointIndex),n.setVisible(this.checkpointsVisible),t}setCheckpointsVisible(e){this.checkpointsVisible=e,this.gates?.setVisible(e)}setCheckpointProgress(e){this.nextCheckpointIndex=e,this.gates?.setProgress(e)}flareCheckpoint(e){this.gates?.flare(e)}stepCheckpoints(e){this.gates?.step(e)}setGhostVisible(e){this.ghost.setVisible(e)}applyGhost(e){this.ghost.apply(e)}challengeCosts(){return{gateDrawCalls:this.gates?.visible===!0?this.gates.drawCalls:0,gateTriangles:this.gates?.visible===!0?this.gates.triangles:0,ghostDrawCalls:this.ghost.visible?this.ghost.drawCalls:0,ghostTriangles:this.ghost.visible?this.ghost.triangles:0}}setContextLossCallbacks(e){this.contextCallbacks=e}onContextLost=e=>{e.preventDefault(),this.contextCallbacks?.onLost()};onContextRestored=()=>{this.contextCallbacks?.onRestored()};resize(){const e=this.renderer.domElement,t=e.clientWidth,n=e.clientHeight,s=Math.min(window.devicePixelRatio,this.maxPixelRatio);if(t===0||n===0)return{layoutChanged:!1,width:this.lastWidth,height:this.lastHeight};const r=t!==this.lastWidth||n!==this.lastHeight,a=s!==this.lastPixelRatio;return!r&&!a?{layoutChanged:!1,width:t,height:n}:(this.lastWidth=t,this.lastHeight=n,this.lastPixelRatio=s,this.renderer.setPixelRatio(s),this.renderer.setSize(t,n,!1),r&&(this.camera.aspect=t/n,this.camera.updateProjectionMatrix()),{layoutChanged:r,width:t,height:n})}applyLighting(e){e.exposure!==void 0&&(this.renderer.toneMappingExposure=e.exposure),e.sunIntensity!==void 0&&(this.sun.intensity=e.sunIntensity),e.hemisphereIntensity!==void 0&&(this.hemisphere.intensity=e.hemisphereIntensity)}setShadowFocus(e,t,n){this.sun.target.position.set(e,t,n),this.sun.position.set(e+this.sunOffset.x,t+this.sunOffset.y,n+this.sunOffset.z)}setFieldOfView(e){const t=Nc.radToDeg(e);this.camera.fov!==t&&(this.camera.fov=t,this.camera.updateProjectionMatrix())}setMaxPixelRatio(e){const t=Math.max(.5,e);t!==this.maxPixelRatio&&(this.maxPixelRatio=t,this.resize())}setQuality(e,t){const n=e!=="low";this.sun.castShadow!==n&&(this.sun.castShadow=n);const s=e==="high"?Be.shadowMapSize:Be.shadowMapSize/2;n&&this.sun.shadow.mapSize.x!==s&&(this.sun.shadow.mapSize.setScalar(s),this.sun.shadow.map?.dispose(),this.sun.shadow.map=null);const r=e==="high"?t:e==="medium"?1.5:1;this.setMaxPixelRatio(Math.min(t,r))}viewport(){return{width:this.lastWidth,height:this.lastHeight,pixelRatio:this.lastPixelRatio}}render(){this.renderer.render(this.scene,this.camera)}dispose(){const e=this.renderer.domElement;e.removeEventListener("webglcontextlost",this.onContextLost),e.removeEventListener("webglcontextrestored",this.onContextRestored),this.terrain?.dispose(),this.terrain=null,this.gates?.dispose(),this.gates=null,this.ghost.dispose(),this.scene.background=null,this.sky.dispose(),this.sparks.dispose(),this.dust.dispose();for(const t of this.disposables)t.dispose();this.disposables.length=0,this.sun.shadow.dispose(),this.sun.dispose(),this.hemisphere.dispose(),this.renderer.dispose()}}function ay(){return{anchorHeight:ms.hipHeight+Ze.targetHeightOffset,armHeight:Ze.armHeight,distanceAtRest:Ze.distanceAtRest,distanceAtSpeed:Ze.distanceAtSpeed,distanceResponseSeconds:Ze.distanceResponseSeconds,fovAtRest:Ze.fovAtRest,fovAtSpeed:Ze.fovAtSpeed,fovResponseSeconds:Ze.fovResponseSeconds,speedReference:Ze.speedReference,lookAheadSeconds:Ze.lookAheadSeconds,lookAheadMax:Ze.lookAheadMax,lookAheadResponseSeconds:Ze.lookAheadResponseSeconds,yawLagAtRest:Ze.yawLagAtRest,yawLagAtSpeed:Ze.yawLagAtSpeed,bankFactor:Ze.bankFactor,bankMaxRadians:Ze.bankMaxRadians,bankResponseSeconds:Ze.bankResponseSeconds,obstructionRadius:Ze.obstructionRadius,obstructionMinDistance:Ze.obstructionMinDistance,obstructionPullInSeconds:Ze.obstructionPullInSeconds,obstructionRestoreSeconds:Ze.obstructionRestoreSeconds,airHeightFollow:Ze.airHeightFollow,airHeightResponseSeconds:Ze.airHeightResponseSeconds,landingRestoreSeconds:Ze.landingRestoreSeconds,landingDipPerImpact:Ze.landingDipPerImpact,landingDipMax:Ze.landingDipMax,landingDipRecoverSeconds:Ze.landingDipRecoverSeconds,crashDistance:Ze.crashDistance,crashArmHeight:Ze.crashArmHeight,crashFov:Ze.crashFov,crashFrameSeconds:Ze.crashFrameSeconds,crashRestoreSeconds:Ze.crashRestoreSeconds}}function Cl(){return{yaw:0,distance:Ze.distanceAtRest,armDistance:Ze.distanceAtRest,fov:Ze.fovAtRest,bank:0,lookAhead:0,heightLag:0,dip:0,crashFrame:0}}function Pl(i,e){e.yaw=i.yaw,e.distance=i.distance,e.armDistance=i.armDistance,e.fov=i.fov,e.bank=i.bank,e.lookAhead=i.lookAhead,e.heightLag=i.heightLag,e.dip=i.dip,e.crashFrame=i.crashFrame}function oy(i,e,t,n){n.yaw=yt(i.yaw,e.yaw,t),n.distance=yt(i.distance,e.distance,t),n.armDistance=yt(i.armDistance,e.armDistance,t),n.fov=yt(i.fov,e.fov,t),n.bank=yt(i.bank,e.bank,t),n.lookAhead=yt(i.lookAhead,e.lookAhead,t),n.heightLag=yt(i.heightLag,e.heightLag,t),n.dip=yt(i.dip,e.dip,t),n.crashFrame=yt(i.crashFrame,e.crashFrame,t)}function ly(){return{positionX:0,positionY:0,positionZ:0,targetX:0,targetY:0,targetZ:0,fov:Ze.fovAtRest,roll:0}}function cy(i,e){return gt(-i*e.bankFactor,-e.bankMaxRadians,e.bankMaxRadians)}class hy{tuning;yaw=0;distance;armDistance;fov;bank=0;lookAhead=0;heightLag=0;dip=0;crashFrame=0;probe=null;probeOrigin={x:0,y:0,z:0};probeDirection={x:0,y:0,z:0};constructor(e={}){this.tuning={...ay(),...e.tuning},this.distance=this.tuning.distanceAtRest,this.armDistance=this.tuning.distanceAtRest,this.fov=this.tuning.fovAtRest}setTuning(e){Object.assign(this.tuning,e)}setOcclusionProbe(e){this.probe=e}reset(e){this.yaw=e.headingY,this.distance=this.tuning.distanceAtRest,this.armDistance=this.tuning.distanceAtRest,this.fov=this.tuning.fovAtRest,this.bank=0,this.lookAhead=0,this.heightLag=0,this.dip=0,this.crashFrame=0}landingImpulse(e){const t=this.tuning;e>0&&(this.dip=Math.min(t.landingDipMax,this.dip+e*t.landingDipPerImpact))}step(e,t){if(e<=0)return;const n=this.tuning,s=Tt(Math.abs(t.speed)/n.speedReference);this.crashFrame=Xe(this.crashFrame,t.crashed?1:0,t.crashed?n.crashFrameSeconds:n.crashRestoreSeconds,1/0,e);const r=(1-this.crashFrame)*gt(Math.max(0,t.speed)*n.lookAheadSeconds,0,n.lookAheadMax);this.lookAhead=Xe(this.lookAhead,r,n.lookAheadResponseSeconds,1/0,e),this.distance=Xe(this.distance,yt(yt(n.distanceAtRest,n.distanceAtSpeed,s),n.crashDistance,this.crashFrame),n.distanceResponseSeconds,1/0,e),this.fov=Xe(this.fov,yt(yt(n.fovAtRest,n.fovAtSpeed,s),n.crashFov,this.crashFrame),n.fovResponseSeconds,1/0,e),this.yaw=Xe(this.yaw,t.headingY,yt(n.yawLagAtRest,n.yawLagAtSpeed,s),1/0,e),this.bank=Xe(this.bank,cy(t.rollAngle,n),n.bankResponseSeconds,1/0,e),this.heightLag=Xe(this.heightLag,t.airborne?Math.max(0,t.y-t.groundY)*(1-n.airHeightFollow):0,t.airborne?n.airHeightResponseSeconds:n.landingRestoreSeconds,1/0,e),this.dip=Xe(this.dip,0,n.landingDipRecoverSeconds,1/0,e);const a=this.clearance(t),o=Math.max(n.obstructionMinDistance,Math.min(this.distance,a)),l=o<this.armDistance?n.obstructionPullInSeconds:n.obstructionRestoreSeconds;this.armDistance=Xe(this.armDistance,o,l,1/0,e)}writeState(e){e.yaw=this.yaw,e.distance=this.distance,e.armDistance=this.armDistance,e.fov=this.fov,e.bank=this.bank,e.lookAhead=this.lookAhead,e.heightLag=this.heightLag,e.dip=this.dip,e.crashFrame=this.crashFrame}clearance(e){if(this.probe===null)return 1/0;const t=this.tuning,n=e.y-this.heightLag+t.anchorHeight,s=e.x-Math.sin(this.yaw)*this.distance,r=e.y+t.armHeight,a=e.z-Math.cos(this.yaw)*this.distance,o=s-e.x,l=r-n,c=a-e.z,u=Math.hypot(o,l,c);if(u<=1e-6)return 1/0;this.probeOrigin.x=e.x,this.probeOrigin.y=n,this.probeOrigin.z=e.z,this.probeDirection.x=o,this.probeDirection.y=l,this.probeDirection.z=c;const d=this.probe(this.probeOrigin,this.probeDirection,u);return d===null?1/0:Math.max(0,d-t.obstructionRadius)*(this.distance/u)}}function uy(i,e,t,n){const s=e.y-i.heightLag+t.anchorHeight-i.dip,r=i.distance>1e-6?i.armDistance/i.distance:1,a=yt(t.armHeight,t.crashArmHeight,i.crashFrame);n.positionX=e.x-Math.sin(i.yaw)*i.armDistance,n.positionY=s+(a-t.anchorHeight)*r,n.positionZ=e.z-Math.cos(i.yaw)*i.armDistance,n.targetX=e.x+Math.sin(e.headingY)*i.lookAhead,n.targetY=s,n.targetZ=e.z+Math.cos(e.headingY)*i.lookAhead,n.fov=i.fov,n.roll=i.bank}const xd=_t(["trunk","crown","coniferFoliage","shrub","lampPost","lampHead","benchWood","benchMetal","litterBin","bollardCap","signPost","signPlate","fenceBay","buildingBody","buildingTall","buildingCap"]),bp=_t({trunk:{triangles:24,castsShadow:!0},crown:{triangles:40,castsShadow:!0},coniferFoliage:{triangles:36,castsShadow:!0},shrub:{triangles:20,castsShadow:!0},lampPost:{triangles:36,castsShadow:!0},lampHead:{triangles:12,castsShadow:!1},benchWood:{triangles:24,castsShadow:!0},benchMetal:{triangles:24,castsShadow:!0},litterBin:{triangles:64,castsShadow:!0},bollardCap:{triangles:20,castsShadow:!1},signPost:{triangles:24,castsShadow:!0},signPlate:{triangles:24,castsShadow:!1},fenceBay:{triangles:36,castsShadow:!0},buildingBody:{triangles:60,castsShadow:!1},buildingTall:{triangles:172,castsShadow:!1},buildingCap:{triangles:12,castsShadow:!1}}),dy=_t({broadleafTree:["trunk","crown"],treeCanopy:["crown"],conifer:["coniferFoliage"],shrub:["shrub"],lampPost:["lampPost","lampHead"],bench:["benchWood","benchMetal"],litterBin:["litterBin"],bollardCap:["bollardCap"],signpost:["signPost","signPlate"],fenceBay:["fenceBay"]}),fy={y:18};function vp(i){return i>=yn.highRiseHeight?"buildingTall":"buildingBody"}function py(i,e,t){if(tp(e,t,9)<=.55)return null;const n=i.y*fe.building.towerHeightFraction,s=vp(n),r=s==="buildingTall"?yn.highFloors:yn.lowFloors;return n/r<yn.minFloorHeight?null:s}function my(i,e=new Map){const t=a=>{e.set(a,(e.get(a)??0)+1)},n=dy[i.kind];if(n!==void 0){for(const a of n)t(a);return e}const s=i.size??fy;t(vp(s.y)),t("buildingCap");const r=py(s,i.position.x,i.position.z);return r!==null&&t(r),e}const Gn=_t({trianglesPerCollider:12,trianglesPerTerrainCell:2,trianglesPerFieldPatch:2,backstopDrawCalls:1,backstopTriangles:2,fieldDrawCalls:1,markingDrawCalls:1,trianglesPerMarkingQuad:2}),Ll=_t({drawCalls:83,triangles:20766}),Lr=_t({maxDrawCalls:150,maxTriangles:4e5});(()=>{let i=Object.keys(wn).length+Object.keys(Gr).length+xd.length+Gn.markingDrawCalls+Gn.fieldDrawCalls+Gn.backstopDrawCalls,e=Object.keys(Gr).length;for(const t of xd)bp[t].castsShadow&&(e+=1);return i+e})();function gy(i){return i.appearance??wn[i.surface].material}function by(i){const{bySurface:e,cellsDrawn:t,coverage:n}=rp(i),s=[...e.keys()];let r=s.length+Gn.backstopDrawCalls+Gn.fieldDrawCalls,a=t*Gn.trianglesPerTerrainCell+n.patchesDrawn*Gn.trianglesPerFieldPatch+Gn.backstopTriangles,o=0,l=0;const c=new Map;for(const h of i.segments)for(const f of h.colliders){const m=gy(f);c.set(m,(c.get(m)??0)+1)}for(const h of c.values()){const f=h*Gn.trianglesPerCollider;r+=1,a+=f,o+=1,l+=f}const u=new Map;for(const h of i.props??[])my(h,u);for(const[h,f]of u){const m=bp[h],v=m.triangles*f;r+=1,a+=v,m.castsShadow&&(o+=1,l+=v)}let d=0;for(const h of i.markings??[])d+=NM(h.points,h.dash,h.gap);return d>0&&(r+=Gn.markingDrawCalls,a+=d*Gn.trianglesPerMarkingQuad),{drawCalls:r+o,triangles:a+l,colourDrawCalls:r,shadowDrawCalls:o,colourTriangles:a,shadowTriangles:l,cellsDrawn:t,fieldPatches:n.patchesDrawn,surfaces:s,blockMaterials:[...c.keys()],partInstances:u,markingQuads:d}}function xp(i){const e=by(i),t={drawCalls:e.drawCalls+Ll.drawCalls,triangles:e.triangles+Ll.triangles},n=[];return t.drawCalls>Lr.maxDrawCalls&&n.push(`${t.drawCalls} draw calls against a ceiling of ${Lr.maxDrawCalls} (${e.drawCalls} from the level, ${Ll.drawCalls} reserved for the rider, ghost, gates and particles)`),t.triangles>Lr.maxTriangles&&n.push(`${t.triangles} triangles against a ceiling of ${Lr.maxTriangles} (${e.cellsDrawn} ground cells, ${e.fieldPatches} surround patches, ${e.markingQuads} paint quads)`),{ok:n.length===0,frame:t,level:e,breaches:n}}const Ur=.15,vy=.3,Sp=1.05,xy=.15,Sy=4,ja=36,eo=24,to=50,Ci=34,lr=16,Ii=i=>Math.PI*i/2,_y=2*Ci+eo-2*lr,My=to-ja,no=9,io=22,Il=_y-no-io,fr={riverside:.02445321044266501,riversideLower:.014970690955080213,gravelSpur:.02882828760562427,trailhead:.01105736715874174,returnClimb:-.008477012636065782,returnPlaza:-.004179113767108547},Sd=59.71861586702758,yy=31.946767110627512,$n=3.4,_p=3.2,_d=.3,wy=4.2;function mi(i,e,t,n,s){return Array.from({length:s},(r,a)=>({s:t+a*n,t:e,halfAlong:_d,halfLateral:_d,height:wy,surface:i,appearance:"wood"}))}function Vn(i,e){let t=Math.round(i*71)*374761393+Math.round(e*100)*668265263|0;return t=Math.imul(t^t>>>13,1274126177),t=t^t>>>16,(t>>>0)/4294967296}function nr(i,e){return Vn(i,e)*2-1}function Ee(i,e,t,n,s,r={}){const a=r.vary??.14;return Array.from({length:s},(o,l)=>{const c=t+l*n,u=c+e*3.7;return{s:c,t:e+(r.wander??0)*nr(u,11),kind:i,yaw:r.yaw??Vn(u,23)*Math.PI*2,scale:(r.scale??1)*(1+a*nr(u,37)),...r.lift===void 0?{}:{lift:r.lift},...r.onCollider===!0?{onCollider:!0}:{}}})}function gi(i,e,t,n){return Ee("treeCanopy",i,e,t,n,{scale:1.05,vary:.16,onCollider:!0})}const Ey=2.4;function qr(i,e,t){return Ee("fenceBay",i,e,Ey,t,{yaw:0,vary:.02})}function ft(i,e,t,n){return Ee("lampPost",i,e,t,n,{yaw:Ao(i),vary:.03})}function dn(i,e){return[{s:e,t:i,kind:"bench",yaw:Ao(i),scale:1},{s:e+2.6,t:i+Math.sign(i)*.4,kind:"litterBin",yaw:0,scale:1}]}function kn(i,e){return{s:i,t:e,kind:"signpost",yaw:Ao(e),scale:1}}function Bt(i,e,t,n=0){return{s:i,t:e,kind:"building",yaw:n,scale:1,size:t}}const Ty=.8;function Un(i,e="road"){return{path:[{s:0,t:0},{s:i,t:0}],role:"centre",broken:!0,paint:e}}function Fi(i,e,t="road"){const n=e-Ty;return[n,-n].map(s=>({path:[{s:0,t:s},{s:i,t:s}],role:"edge",paint:t}))}function Mp(i,e,t="road"){return{path:[{s:i,t:-e},{s:i,t:e}],role:"bar",paint:t}}function yp(){const i=Ii(lr);return[.18,.5,.82].map(e=>({s:i*e,t:-5.2,halfAlong:3.5,halfLateral:1.6,height:$n,surface:"roughPavement",appearance:"stone"}))}const Ay={id:"plaza",length:54,halfWidth:17,surface:"brick",shoulder:9,blocks:[...[-9,-6.2,6.2,9].flatMap(i=>[12,20].map(e=>({s:e,t:i,halfAlong:.09,halfLateral:.09,height:.9,surface:"brick",appearance:"metal"}))),{s:31,t:11.5,halfAlong:5,halfLateral:1.2,height:.85,surface:"brick",appearance:"stone"},...[-13.5,13.5].flatMap(i=>[24,38].map(e=>({s:e,t:i,halfAlong:1.1,halfLateral:.3,height:.45,surface:"brick",appearance:"wood"}))),...[1,-1].map(i=>({s:50,t:i*(4.5+5.5),halfAlong:_p,halfLateral:5.5,height:$n,surface:"brick",appearance:"stone"}))],props:[...[-9,-6.2,6.2,9].flatMap(i=>[12,20].map(e=>({s:e,t:i,kind:"bollardCap",yaw:0,scale:1,lift:.9,onCollider:!0}))),...ft(19.5,6,12,4),...ft(-19.5,6,12,4),...dn(20.5,12),...dn(20.5,34),...dn(-20.5,12),...dn(-20.5,34),...Ee("shrub",11.5,27,4,3,{wander:.3,scale:.62,lift:.85,onCollider:!0}),...Ee("broadleafTree",24,4,9,6,{wander:1.2}),...Ee("broadleafTree",-24,8,9,5,{wander:1.2}),kn(22,19)],markings:[Mp(46.5,4.2)]},Ry={id:"boulevard-north",length:62,curvature:1/95,halfWidth:9,crown:.1,surface:"pavement",shoulder:7,blocks:[...mi("pavement",12.5,8,16,3)],props:[...gi(12.5,8,16,3),...ft(-11,6,20,3),...Ee("broadleafTree",-15.5,14,20,3,{wander:1.5}),...Ee("shrub",18.5,10,9,6,{wander:1.6,scale:1.15}),...dn(-11.5,26),kn(4,11.5),Bt(20,-27,{x:17,y:14,z:26}),Bt(50,-26,{x:14,y:19,z:20})],markings:[Un(62),...Fi(62,9)]},Cy={id:"boulevard-bend",length:66,curvature:-1/95,halfWidth:9,crown:.1,surface:"pavement",shoulder:7,blocks:[{s:34,t:0,halfAlong:7,halfLateral:1.8,height:Ur,surface:"pavement",appearance:"concrete"},...[28.5,39.5].map(i=>({s:i,t:0,halfAlong:.09,halfLateral:.09,height:Ur+.9,surface:"pavement",appearance:"metal"})),...mi("pavement",-12.5,10,18,3)],props:[...[28.5,39.5].map(i=>({s:i,t:0,kind:"bollardCap",yaw:0,scale:1,lift:Ur+.9,onCollider:!0})),...gi(-12.5,10,18,3),...ft(11,8,22,3),...Ee("broadleafTree",15.5,18,22,2,{wander:1.5}),...Ee("shrub",-16.5,8,8,7,{wander:1.8,scale:1.1}),...dn(11.5,40),Bt(18,26,{x:16,y:17,z:24}),Bt(52,27,{x:13,y:12,z:18}),Bt(30,-26,{x:18,y:21,z:22})],markings:[Un(66),...Fi(66,9)]},Py={id:"curb-run",length:72,curvature:-1/150,halfWidth:8.5,crown:.08,surface:"pavement",shoulder:7,blocks:[...[13,38,61].map((i,e)=>({s:i,t:-6.6,halfAlong:[10,11,8][e],halfLateral:2.4,height:Ur,surface:"pavement",appearance:"concrete"})),...mi("pavement",12,12,20,3)],props:[...gi(12,12,20,3),...ft(-11,10,24,3),...qr(-13,5,25),...Ee("shrub",-16,8,7,8,{wander:1.5}),...Ee("broadleafTree",16.5,16,18,3,{wander:1.6}),Bt(24,26,{x:20,y:15,z:30}),Bt(60,27,{x:15,y:22,z:20})],markings:[Un(72),{path:[{s:0,t:7.7},{s:72,t:7.7}],role:"edge"},{path:[{s:0,t:-3.35},{s:72,t:-3.35}],role:"edge"}]},Ly={id:"fork",length:26,halfWidth:11,surface:"roughPavement",shoulder:7,blocks:[{s:20,t:14,halfAlong:8,halfLateral:4,height:$n,surface:"roughPavement",appearance:"stone"}],props:[kn(6,12),kn(10,-12),...ft(13,4,18,2),...ft(-13,6,16,2),Bt(20,25,{x:19,y:16,z:17})],markings:[Mp(3.5,9.5)]},Iy={id:"road-lead",length:ja,halfWidth:8.5,crown:.08,surface:"pavement",shoulder:7,blocks:[{s:18,t:13.5,halfAlong:17,halfLateral:4,height:$n,surface:"pavement",appearance:"stone"}],props:[Bt(10,25,{x:15,y:21,z:16}),Bt(28,26,{x:17,y:15,z:18}),...ft(-11,8,18,2),...Ee("shrub",-14,6,8,4,{wander:1.4})],markings:[Un(ja),...Fi(ja,8.5)]},Dy={id:"road-corner-a",length:Ii(Ci),curvature:-1/Ci,halfWidth:8.5,crown:.08,climb:-.42,surface:"pavement",shoulder:7,blocks:[...mi("pavement",11.5,8,12,4)],props:[...gi(11.5,8,12,4),...ft(-11.5,10,16,3),...Ee("shrub",-15,6,7,6,{wander:1.5}),Bt(14,24,{x:18,y:18,z:20}),Bt(40,25,{x:16,y:13,z:24})],markings:[Un(Ii(Ci)),...Fi(Ii(Ci),8.5)]},ky={id:"road-cross",length:eo,halfWidth:8.5,crown:.08,climb:-.12,surface:"pavement",shoulder:7,blocks:[{s:12,t:-13.5,halfAlong:11,halfLateral:4,height:$n,surface:"pavement",appearance:"stone"}],props:[Bt(12,-25,{x:16,y:20,z:22}),...ft(11,6,14,2),...Ee("shrub",14,4,6,4,{wander:1.2})],markings:[Un(eo),...Fi(eo,8.5)]},Fy={id:"road-corner-b",length:Ii(Ci),curvature:-1/Ci,halfWidth:8.5,crown:.08,climb:-.24,surface:"pavement",shoulder:7,blocks:[...mi("pavement",11.5,8,12,4)],props:[...gi(11.5,8,12,4),...ft(-11.5,8,16,3),...Ee("shrub",15,8,8,5,{wander:1.5}),Bt(16,-24,{x:17,y:16,z:21}),Bt(42,-25,{x:14,y:23,z:18})],markings:[Un(Ii(Ci)),...Fi(Ii(Ci),8.5)]},Uy={id:"road-in",length:to,halfWidth:8.5,crown:.06,climb:-.12,surface:"pavement",shoulder:7,blocks:[{s:26,t:13.5,halfAlong:24,halfLateral:4,height:$n,surface:"pavement",appearance:"stone"}],props:[Bt(14,25,{x:18,y:19,z:24}),Bt(40,26,{x:15,y:14,z:22}),...ft(-11,8,15,3),...qr(-12.5,6,15),...Ee("shrub",-15,10,8,5,{wander:1.4}),kn(44,-10.5)],markings:[Un(to),...Fi(to,8.5)]},Ny={id:"park-gate",length:Sd,halfWidth:8,climb:-2.6,surface:"pavement",shoulder:12,bands:[{from:5.2,to:8,surface:"grass"},{from:-8,to:-5.2,surface:"grass"}],blocks:[...[1,-1].map(i=>({s:12,t:i*(2.4+4.2),halfAlong:_p,halfLateral:4.2,height:$n,surface:"pavement",appearance:"stone"})),...mi("pavement",9.5,20,7,3),...mi("pavement",-9.5,23,7,3)],props:[...gi(9.5,20,7,3),...gi(-9.5,23,7,3),...ft(9.5,6,0,1),...ft(-9.5,6,0,1),...Ee("broadleafTree",13.5,26,11,3,{wander:1.6}),...Ee("broadleafTree",-13.5,30,11,3,{wander:1.6}),...Ee("conifer",18,18,13,3,{wander:2}),...Ee("conifer",-18,24,13,3,{wander:2}),...Ee("shrub",11,16,6,7,{wander:1.4,scale:1.1}),...Ee("shrub",-11,19,6,7,{wander:1.4,scale:1.1}),...dn(-10.5,34),kn(8,9.5)],markings:[Un(Sd,"path")]},Oy={id:"riverside",length:78,curvature:fr.riverside,halfWidth:4.6,climb:-2,surface:"pavement",shoulder:11,bands:[{from:3.2,to:5.4,surface:"grass"},{from:-5.4,to:-3.2,surface:"grass"}],blocks:[...mi("pavement",7,12,15,5)],props:[...gi(7,12,15,5),...qr(-6.4,6,27),...ft(-8.5,14,26,3),...dn(8,22),...dn(8,62),...Ee("conifer",12,6,12,6,{wander:2.4}),...Ee("conifer",-12,10,14,5,{wander:2.4}),...Ee("shrub",9,8,5,13,{wander:1.6,scale:1.2}),...Ee("shrub",-9.5,12,7,9,{wander:1.6,scale:1.2})],markings:[Un(78,"path")]},zy={id:"ford-in",length:15,halfWidth:5.4,climb:-.55,surface:"dirt",shoulder:10,blocks:[{s:15,t:0,halfAlong:15,halfLateral:3.2,height:.55,depth:1.5,surface:"wood",appearance:"wood"},...[1,-1].map(i=>({s:15,t:i*3.05,halfAlong:14,halfLateral:.12,height:1.1,surface:"wood",appearance:"wood"}))],props:[kn(3,7),...Ee("shrub",7.5,2,3.5,4,{wander:1.2,scale:1.3}),...Ee("shrub",-7.5,3,3.5,4,{wander:1.2,scale:1.3}),...Ee("conifer",12,4,9,2,{wander:2})]},By={id:"ford-out",length:15,halfWidth:5.4,climb:.55,surface:"dirt",shoulder:10,props:[...Ee("shrub",7.5,2,3.5,4,{wander:1.2,scale:1.3}),...Ee("shrub",-7.5,3,3.5,4,{wander:1.2,scale:1.3}),...Ee("conifer",-12,5,9,2,{wander:2})]},Hy={id:"riverside-lower",length:56,curvature:fr.riversideLower,halfWidth:5.4,climb:-1.2,surface:"pavement",shoulder:11,bands:[{from:3.2,to:5.4,surface:"grass"},{from:-5.4,to:-3.2,surface:"grass"}],blocks:[...mi("pavement",-7,8,16,4)],props:[...gi(-7,8,16,4),...qr(6.4,5,20),...ft(8.5,12,22,2),...dn(-8,30),...Ee("conifer",-11.5,6,13,4,{wander:2.4}),...Ee("conifer",12,9,13,4,{wander:2.4}),...Ee("shrub",-9.5,7,6,8,{wander:1.6,scale:1.2})]},Gy={id:"gravel-spur",length:60,curvature:fr.gravelSpur,halfWidth:6.5,climb:.9,surface:"gravel",shoulder:10,blocks:[{s:30,t:8.4,halfAlong:1.4,halfLateral:1.1,height:.85,surface:"gravel",appearance:"stone"}],props:[kn(6,8.5),...Ee("conifer",10,6,11,5,{wander:2.6}),...Ee("conifer",-10,10,11,5,{wander:2.6}),...Ee("shrub",8,8,7,7,{wander:1.8,scale:1.25}),...Ee("shrub",-8,5,7,7,{wander:1.8,scale:1.25})]},Vy={id:"trailhead",length:66,curvature:fr.trailhead,halfWidth:4.6,climb:.8,surface:"dirt",shoulder:10,blocks:[...[16,22,28,44,50,56].map((i,e)=>({s:i,t:e%2===0?-.8:.9,halfAlong:.18,halfLateral:2.6,height:.1,surface:"dirt",appearance:"wood"})),{s:34,t:-2.2,halfAlong:.75,halfLateral:.75,height:.3,surface:"dirt",appearance:"stone"},{s:64,t:2,halfAlong:.6,halfLateral:.6,height:.18,surface:"dirt",appearance:"stone"}],props:[...Ee("conifer",7.5,4,7,9,{wander:1.8}),...Ee("conifer",-7.5,8,7,8,{wander:1.8}),...Ee("conifer",12,6,11,5,{wander:2.6,scale:1.15}),...Ee("conifer",-12,12,11,4,{wander:2.6,scale:1.15}),...Ee("shrub",6,5,5,12,{wander:1.2,scale:1.2}),...Ee("shrub",-6,7,5,11,{wander:1.2,scale:1.2}),kn(4,6)]},Wy={id:"berm",length:34,curvature:1/26,halfWidth:4.6,crossSlope:-.2,surface:"dirt",shoulder:10,props:[...Ee("conifer",8,4,8,4,{wander:1.8}),...Ee("shrub",6.5,6,5,6,{wander:1.2,scale:1.2}),...Ee("conifer",-13,6,10,3,{wander:2.4,scale:1.1})]},Xy={id:"kicker-run",length:34,halfWidth:4.4,climb:Sp,surface:"dirt",shoulder:5,blocks:[{s:34,t:0,halfAlong:Sy,halfLateral:3,height:xy,depth:1.9,surface:"dirt",appearance:"dirt"}],props:[...Ee("conifer",-11,6,10,3,{wander:2}),...Ee("shrub",-8,4,7,4,{wander:1.4,scale:1.2}),...Ee("conifer",20,8,11,2,{wander:2.4})]},Yy={id:"kicker-land",length:yy,halfWidth:5.4,surface:"dirt",shoulder:5,blocks:[{s:24,t:7.4,halfAlong:1.2,halfLateral:1,height:.9,surface:"dirt",appearance:"stone"}],props:[...Ee("conifer",-11,5,9,3,{wander:2}),...Ee("conifer",-16,12,11,2,{wander:2.4,scale:1.15}),...Ee("shrub",-8.5,8,7,4,{wander:1.4,scale:1.2})]},qy={id:"return-climb",length:42,curvature:fr.returnClimb,halfWidth:7,climb:5,surface:"roughPavement",shoulder:7,blocks:[{s:21,t:-10.5,halfAlong:20,halfLateral:3,height:$n,surface:"roughPavement",appearance:"stone"}],props:[...ft(9,6,14,3),...Ee("conifer",13,4,12,2,{wander:2}),...Ee("broadleafTree",12,30,12,2,{wander:1.6}),Bt(14,-21,{x:16,y:13,z:20}),Bt(34,-22,{x:14,y:18,z:16})],markings:[Un(42),...Fi(41.7,7).map(i=>({...i,path:i.path.map(e=>({...e,s:e.s+.3}))}))]},$y={id:"return-plaza",length:40,curvature:fr.returnPlaza,halfWidth:7,surface:"roughPavement",shoulder:7,props:[...ft(9.5,8,14,3),...ft(-9.5,14,14,2),...Ee("broadleafTree",13,6,13,3,{wander:1.6}),...Ee("broadleafTree",-13,12,13,2,{wander:1.6}),...dn(10,22),Bt(20,24,{x:15,y:16,z:22}),Bt(12,-24,{x:17,y:12,z:18})],markings:[Un(40),...Fi(40,7)]},Zy={id:"alley-mouth",length:Ii(lr),curvature:-1/lr,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...yp()],props:[...ft(-7.4,6,12,2),...Ee("shrub",7.5,8,7,3,{wander:1.2})]},Ky={id:"alley-upper",length:io,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...[1,-1].map(i=>({s:io/2,t:i*4.6,halfAlong:io/2,halfLateral:1.6,height:$n,surface:"roughPavement",appearance:"stone"}))],props:[...ft(7.2,5,12,2),...ft(-7.2,11,0,1),kn(11,6.9)]},Qy={id:"alley-steps",length:no,linearClimb:!0,climb:-.8999999999999999,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...[0,1,2].map(i=>({s:1.5+i*3,t:0,halfAlong:1.5,halfLateral:2.9,height:vy/2,surface:"roughPavement",appearance:"concrete"})),...[1,-1].map(i=>({s:no/2,t:i*4.6,halfAlong:no/2,halfLateral:1.6,height:$n,surface:"roughPavement",appearance:"stone"}))],props:[...ft(-7.2,4.5,0,1)]},Jy={id:"alley-run",length:Il,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...[1,-1].map(i=>({s:Il/2,t:i*4.6,halfAlong:Il/2,halfLateral:1.6,height:$n,surface:"roughPavement",appearance:"stone"}))],props:[...ft(7.2,6,14,2),...ft(-7.2,20,0,1)]},jy={id:"alley-dog",length:Ii(lr),curvature:-1/lr,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...yp()],props:[...ft(-7.4,8,12,2),...Ee("shrub",7.5,6,8,3,{wander:1.2})]},e1={id:"alley-exit",length:My,halfWidth:3.2,surface:"roughPavement",shoulder:3,blocks:[{s:3,t:0,halfAlong:.9,halfLateral:3.2,height:Ur,surface:"roughPavement",appearance:"concrete"}],props:[...ft(6.5,4,0,1),...Ee("shrub",-6.5,5,5,2,{wander:1})]},t1={id:"alley-ledge",length:22,halfWidth:2.2,surface:"brick",shoulder:0,blocks:[{s:21,t:0,halfAlong:1,halfLateral:2.2,height:.8,surface:"brick",appearance:"stone"}],props:[...ft(3.8,5,11,2),{s:18,t:-3.4,kind:"litterBin",yaw:0,scale:1}]},n1={id:"drain-run",length:74,curvature:1/300,halfWidth:2.6,crown:-.55,surface:"pavement",shoulder:1.6,props:[...qr(4.4,3,29),...Ee("shrub",-4.6,6,6,11,{wander:1,scale:1.15}),kn(4,-4.4)]},i1={id:"terrace",length:52,halfWidth:9,surface:"brick",shoulder:6,blocks:[{s:26,t:3.4,halfAlong:20,halfLateral:.55,height:.2,surface:"brick",appearance:"stone"},{s:26,t:-3.4,halfAlong:20,halfLateral:.55,height:.34,surface:"brick",appearance:"concrete"},...mi("brick",8,8,12,4)],props:[...gi(8,8,12,4),...ft(12.5,8,16,3),...ft(-12.5,14,16,2),...dn(-11,14),...dn(-11,34),...dn(11.5,26),...Ee("shrub",-14,6,6,7,{wander:1.4,scale:1.15}),...Ee("broadleafTree",-17,10,14,3,{wander:1.5}),kn(5,11.5)]},wp=13,Co=26,s1=Math.acos(1-wp/(2*Co)),Ep=s1*Co,r1={id:"chicken-lead",length:12,halfWidth:3,surface:"dirt",shoulder:4},a1={id:"chicken-in",length:Ep,curvature:-1/Co,halfWidth:3,surface:"dirt",shoulder:4,props:[...Ee("conifer",9,3,8,2,{wander:1.6})]},o1={id:"chicken-out",length:Ep,curvature:1/Co,halfWidth:3,surface:"dirt",shoulder:4,props:[...Ee("conifer",9.5,4,9,2,{wander:1.6}),...Ee("shrub",7,3,6,3,{wander:1.2,scale:1.2})]},l1=[Ay,Ry,Cy,Py,Ly,Iy,Dy,ky,Fy,Uy,Ny,Oy,zy,By,Hy,Gy,Vy,Wy,Xy],c1=[{from:"kicker-run",elevationOffset:-Sp,specs:[Yy,qy,$y]},{from:"kicker-run",atDistance:0,lateralOffset:wp,specs:[r1,a1,o1]},{from:"fork",specs:[Zy,Ky,Qy,Jy,jy,e1]},{from:"alley-upper",atDistance:14,lateralOffset:6.6,elevationOffset:.55,headingOffset:.1,specs:[t1]},{from:"boulevard-north",atDistance:6,lateralOffset:34,elevationOffset:-1,headingOffset:.06,specs:[n1]},{from:"plaza",atDistance:24,lateralOffset:21,headingOffset:1.35,specs:[i1]}],Yc={main:l1,branches:c1},h1={minX:-180,maxX:89,minZ:-28,maxZ:331},ji=h1,u1=(ji.minX+ji.maxX)/2,d1=(ji.minZ+ji.maxZ)/2,f1=9,Da=15;function p1(i){const e=[];for(let n=ji.minX-40;n<=ji.maxX+40;n+=Da)for(let s=ji.minZ-40;s<=ji.maxZ+40;s+=Da){const r=Vn(n,s);if(r>.46)continue;const a=n+nr(n+1.7,s)*Da*.42,o=s+nr(n,s+3.1)*Da*.42;let l=!0;for(const d of i){const h=Dn(d,a,o);if(h!==null&&h.outside<f1){l=!1;break}}if(!l)continue;const c=a<-30&&o<215,u=r<.13?"shrub":c?r<.4?"conifer":"broadleafTree":r<.42?"broadleafTree":"conifer";e.push({kind:u,x:a,z:o,rotationY:Vn(a,o)*Math.PI*2,scale:(u==="shrub"?1.25:1.05)*(1+.22*nr(a+5,o)),lift:0})}return e}const Md=88,m1=268,g1=318;function b1(){const i=[];for(let e=0;e<Md;e+=1){const t=e/Md*Math.PI*2,n=1+.22*nr(e,3),s=u1+Math.sin(t)*m1*n,r=d1+Math.cos(t)*g1*n;if(!(Math.sin(t)>-.15||Math.cos(t)>.55)){i.push({kind:Vn(e,7)>.35?"conifer":"broadleafTree",x:s,z:r,rotationY:Vn(e,11)*Math.PI*2,scale:2.6+1.4*Vn(e,13),lift:0});continue}const o=14+46*Vn(e,17)**1.7,l=14+22*Vn(e,19);i.push({kind:"building",x:s,z:r,rotationY:Vn(e,23)*Math.PI*2,scale:1,size:{x:l,y:o,z:l*(.7+.6*Vn(e,29))},lift:0})}return i}const v1=[{index:1,name:"City plaza start",teaches:"accelerate, brake, carve safely",segments:["plaza"]},{index:2,name:"Boulevard",teaches:"carving at speed",segments:["boulevard-north","boulevard-bend"]},{index:3,name:"Curb run",teaches:"hop up to cut a corner",segments:["curb-run"]},{index:4,name:"The fork",teaches:"route choice with real risk",segments:["fork","road-lead","road-corner-a","road-cross","road-corner-b","road-in","alley-mouth","alley-upper","alley-steps","alley-run","alley-dog","alley-exit"]},{index:5,name:"Park gate",teaches:"the city to park transition",segments:["park-gate"]},{index:6,name:"Riverside path",teaches:"corner-cutting across grass costs grip",segments:["riverside","ford-in","ford-out","riverside-lower"]},{index:7,name:"Gravel spur",teaches:"wider turns on loose ground",segments:["gravel-spur"]},{index:8,name:"Trailhead",teaches:"terrain reading, momentum as a tool",segments:["trailhead","berm"]},{index:9,name:"The kicker",teaches:"the satisfying jump, and commitment",segments:["kicker-run","kicker-land","chicken-lead","chicken-in","chicken-out"]},{index:10,name:"Return climb",teaches:"hill power and loop closure",segments:["return-climb","return-plaza"]}],x1=["alley-mouth","alley-upper","alley-steps","alley-run","alley-dog","alley-exit"],Tp=[{id:"start",segment:"plaza",s:50,kind:"start",label:"Start"},{id:"curb-run",segment:"curb-run",s:25,kind:"split",label:"Curb run"},{id:"park-gate",segment:"park-gate",s:18,kind:"split",label:"Park gate"},{id:"gravel-spur",segment:"gravel-spur",s:20,kind:"split",label:"Gravel spur"},{id:"kicker",segment:"kicker-land",s:18,kind:"split",label:"The kicker"},{id:"finish",segment:"return-plaza",s:34,kind:"finish",label:"Finish"}],yd={position:{x:0,y:0,z:0},headingY:0};function Ap(){const i=li(Yc,yd);return wh(Yc,{id:"m7-slice",spawn:yd,surround:{height:0,surface:"grass"},props:[...p1(i),...b1()],checkpoints:Tp,settleBlocks:!0})}const Xn=Yc,wd={cells:0,colliders:0,props:0,markingQuads:0,triangles:0};function Ed(i,e){return{cells:i.cells+e.cells,colliders:i.colliders+e.colliders,props:i.props+e.props,markingQuads:i.markingQuads+e.markingQuads,triangles:i.triangles+e.triangles}}const S1={plaza:{cells:2560,colliders:15,props:38,markingQuads:7,triangles:8694},"boulevard-north":{cells:3008,colliders:3,props:19,markingQuads:121,triangles:7790},"boulevard-bend":{cells:3144,colliders:6,props:18,markingQuads:125,triangles:7942},"curb-run":{cells:3080,colliders:6,props:41,markingQuads:144,triangles:9348},fork:{cells:768,colliders:1,props:3,markingQuads:16,triangles:1844},"road-lead":{cells:1440,colliders:1,props:8,markingQuads:71,triangles:3518},"road-corner-a":{cells:2640,colliders:4,props:15,markingQuads:103,triangles:6538},"road-cross":{cells:1440,colliders:1,props:6,markingQuads:48,triangles:3328},"road-corner-b":{cells:2640,colliders:4,props:13,markingQuads:103,triangles:6426},"road-in":{cells:2304,colliders:1,props:25,markingQuads:99,triangles:6506},"park-gate":{cells:3520,colliders:8,props:34,markingQuads:25,triangles:9834},riverside:{cells:3696,colliders:5,props:68,markingQuads:31,triangles:12098},"ford-in":{cells:1152,colliders:3,props:9,markingQuads:0,triangles:2832},"ford-out":{cells:1152,colliders:0,props:9,markingQuads:0,triangles:2728},"riverside-lower":{cells:3200,colliders:4,props:43,markingQuads:0,triangles:9472},"gravel-spur":{cells:3280,colliders:1,props:11,markingQuads:0,triangles:7248},trailhead:{cells:3216,colliders:8,props:26,markingQuads:0,triangles:8240},berm:{cells:1648,colliders:0,props:13,markingQuads:0,triangles:4040},"kicker-run":{cells:1152,colliders:1,props:9,markingQuads:0,triangles:2848},"kicker-land":{cells:960,colliders:1,props:9,markingQuads:0,triangles:2464},"return-climb":{cells:2112,colliders:1,props:8,markingQuads:78,triangles:5128},"return-plaza":{cells:1344,colliders:0,props:10,markingQuads:77,triangles:3790},"chicken-lead":{cells:256,colliders:0,props:0,markingQuads:0,triangles:512},"chicken-in":{cells:448,colliders:0,props:2,markingQuads:0,triangles:1040},"chicken-out":{cells:448,colliders:0,props:5,markingQuads:0,triangles:1160},"alley-mouth":{cells:672,colliders:3,props:3,markingQuads:0,triangles:1536},"alley-upper":{cells:448,colliders:2,props:0,markingQuads:0,triangles:944},"alley-steps":{cells:322,colliders:5,props:0,markingQuads:0,triangles:764},"alley-run":{cells:560,colliders:2,props:0,markingQuads:0,triangles:1168},"alley-dog":{cells:672,colliders:3,props:3,markingQuads:0,triangles:1536},"alley-exit":{cells:256,colliders:1,props:3,markingQuads:0,triangles:700},"alley-ledge":{cells:256,colliders:1,props:3,markingQuads:0,triangles:832},"drain-run":{cells:1545,colliders:0,props:36,markingQuads:0,triangles:5490},terrace:{cells:1792,colliders:6,props:25,markingQuads:0,triangles:5836},"link-road-straight":{cells:1728,colliders:0,props:0,markingQuads:0,triangles:3456},"link-road-bend-left":{cells:1968,colliders:0,props:0,markingQuads:0,triangles:3936},"link-road-bend-right":{cells:1904,colliders:0,props:0,markingQuads:0,triangles:3808},"link-road-rise":{cells:2016,colliders:0,props:0,markingQuads:0,triangles:4032},"link-road-fall":{cells:2016,colliders:0,props:0,markingQuads:0,triangles:4032},"link-path-straight":{cells:1152,colliders:0,props:0,markingQuads:0,triangles:2304},"link-path-bend-left":{cells:1088,colliders:0,props:0,markingQuads:0,triangles:2176},"link-path-bend-right":{cells:960,colliders:0,props:0,markingQuads:0,triangles:1920},"link-path-fall":{cells:2128,colliders:0,props:0,markingQuads:0,triangles:4256},"link-trail-straight":{cells:640,colliders:0,props:0,markingQuads:0,triangles:1280},"link-trail-bend-left":{cells:768,colliders:0,props:0,markingQuads:0,triangles:1536},"link-trail-bend-right":{cells:896,colliders:0,props:0,markingQuads:0,triangles:1792},"link-gravel-straight":{cells:960,colliders:0,props:0,markingQuads:0,triangles:1920},"link-rough-straight":{cells:768,colliders:0,props:0,markingQuads:0,triangles:1536},"link-rough-rise":{cells:1664,colliders:0,props:0,markingQuads:0,triangles:3328}};function qc(i){const e=S1[i];if(e===void 0)throw new Error(`no measured render cost for "${i}". Run node tools/render-cost.mjs and add the row, or the generator cannot pre-screen a route containing it.`);return e}const _1={road:{surface:"pavement",halfWidth:8.5,crown:.08,shoulder:7},path:{surface:"pavement",halfWidth:5.4,shoulder:11},trail:{surface:"dirt",halfWidth:4.6,shoulder:10},gravel:{surface:"gravel",halfWidth:6.5,shoulder:10},rough:{surface:"roughPavement",halfWidth:7,shoulder:7}},Ws={road:40,path:32,trail:26};function sn(i,e,t,n={}){return{id:i,length:t,..._1[e],...n}}const Rp=[sn("link-road-straight","road",40),sn("link-road-bend-left","road",40,{curvature:1/Ws.road}),sn("link-road-bend-right","road",40,{curvature:-1/Ws.road}),sn("link-road-rise","road",40,{climb:2.4}),sn("link-road-fall","road",40,{climb:-2.4}),sn("link-path-straight","path",40),sn("link-path-bend-left","path",40,{curvature:1/Ws.path}),sn("link-path-bend-right","path",40,{curvature:-1/Ws.path}),sn("link-path-fall","path",40,{climb:-1.8}),sn("link-trail-straight","trail",36),sn("link-trail-bend-left","trail",36,{curvature:1/Ws.trail}),sn("link-trail-bend-right","trail",36,{curvature:-1/Ws.trail}),sn("link-gravel-straight","gravel",36),sn("link-rough-straight","rough",36),sn("link-rough-rise","rough",36,{climb:2})],Po=new Map;for(const i of Xn.main)Po.set(i.id,i);for(const i of Xn.branches??[])for(const e of i.specs)Po.set(e.id,e);const M1=[...Xn.main,...(Xn.branches??[]).flatMap(i=>i.specs)];function y1(i){const e=Po.get(i);if(e===void 0)throw new Error(`the slice does not author a segment "${i}"`);return e}function tn(...i){return i.map(y1)}const w1=[{id:"plaza",beat:1,role:"required",main:tn("plaza"),branches:[{from:"plaza",atDistance:24,lateralOffset:21,headingOffset:1.35,specs:tn("terrace"),kind:"optional",name:"low walls to ride"}]},{id:"boulevard",beat:2,role:"required",main:tn("boulevard-north","boulevard-bend"),branches:[{from:"boulevard-north",atDistance:6,lateralOffset:34,elevationOffset:-1,headingOffset:.06,specs:tn("drain-run"),kind:"optional",name:"drainage channel"}]},{id:"curb-run",beat:3,role:"required",main:tn("curb-run")},{id:"fork",beat:4,role:"required",main:tn("fork","road-lead","road-corner-a","road-cross","road-corner-b","road-in"),branches:[{from:"fork",specs:tn(...x1),kind:"optional",name:"alley shortcut"},{from:"alley-upper",atDistance:14,lateralOffset:6.6,elevationOffset:.55,headingOffset:.1,specs:tn("alley-ledge"),kind:"optional",name:"alley-only ledge"}]},{id:"park-gate",beat:5,role:"required",main:tn("park-gate")},{id:"riverside",beat:6,role:"required",main:tn("riverside","ford-in","ford-out","riverside-lower")},{id:"gravel-spur",beat:7,role:"required",main:tn("gravel-spur")},{id:"trailhead",beat:8,role:"required",main:tn("trailhead","berm")},{id:"kicker",beat:9,role:"required",main:tn("kicker-run"),branches:[{from:"kicker-run",elevationOffset:-1.05,specs:tn("kicker-land"),kind:"through",name:"the landing"},{from:"kicker-run",atDistance:0,lateralOffset:13,specs:tn("chicken-lead","chicken-in","chicken-out"),kind:"optional",name:"chicken line"}],exitSegment:"kicker-land"},{id:"return",beat:10,role:"required",main:tn("return-climb","return-plaza")},...Rp.map(i=>({id:i.id,beat:null,role:"connector",main:[i]}))],Cp=new Map;for(const i of v1)Cp.set(i.index,{name:i.name,teaches:i.teaches});function E1(i,e=!1){const t=(i.branches??[]).filter(n=>!e||n.kind==="through").map(n=>({from:n.from,...n.atDistance===void 0?{}:{atDistance:n.atDistance},...n.lateralOffset===void 0?{}:{lateralOffset:n.lateralOffset},...n.elevationOffset===void 0?{}:{elevationOffset:n.elevationOffset},...n.headingOffset===void 0?{}:{headingOffset:n.headingOffset},specs:n.specs}));return{main:i.main,...t.length>0?{branches:t}:{}}}function T1(i){const e=i.exitSegment??i.main[i.main.length-1].id,t=li(E1(i),{position:{x:0,y:0,z:0},headingY:0}),n=t[0],s=t.find(u=>u.spec.id===e);if(s===void 0)throw new Error(`piece "${i.id}" has no segment "${e}"`);let r=wd,a=wd;const o=new Set([...i.main.map(u=>u.id),...(i.branches??[]).filter(u=>u.kind==="through").flatMap(u=>u.specs.map(d=>d.id))]);for(const u of t){const d=qc(u.spec.id);r=Ed(r,d),o.has(u.spec.id)&&(a=Ed(a,d))}let l=0;for(const u of t)o.has(u.spec.id)&&(l+=u.spec.length);const c=i.beat===null?null:Cp.get(i.beat);return{id:i.id,beat:i.beat,name:c?.name??i.id,teaches:c?.teaches??(i.role==="connector"?"a neutral join":"curiosity off the route"),role:i.role,main:i.main,branches:i.branches??[],exitSegment:e,entry:{surface:n.entry.surface,halfWidth:n.entry.halfWidth,gradient:or(n.spec,0)},exit:{surface:s.exit.surface,halfWidth:s.exit.halfWidth,gradient:or(s.spec,s.spec.length)},length:l,headingChange:s.exit.headingY,climb:s.exit.position.y,cost:r,throughCost:a}}const Th=w1.map(T1);new Map(Th.map(i=>[i.id,i]));const Lo=Th.filter(i=>i.beat!==null).sort((i,e)=>(i.beat??0)-(e.beat??0)),Pp=Th.filter(i=>i.role==="connector");function Td(i,e,t={}){const n=c=>`${c}@${e}`,s=i.main.map(c=>({...c,id:n(c.id)})),r=c=>({from:n(c.from),...c.atDistance===void 0?{}:{atDistance:c.atDistance},...c.lateralOffset===void 0?{}:{lateralOffset:c.lateralOffset},...c.elevationOffset===void 0?{}:{elevationOffset:c.elevationOffset},...c.headingOffset===void 0?{}:{headingOffset:c.headingOffset},specs:c.specs.map(u=>({...u,id:n(u.id)}))}),a=[];t.attachTo!==void 0&&a.push({from:t.attachTo,specs:s});for(const c of i.branches)c.kind==="through"&&a.push(r(c));const o=t.dropOptional===!0?[]:i.branches.filter(c=>c.kind==="optional").map(c=>({name:c.name,branch:r(c),ids:c.specs.map(u=>n(u.id))})),l=[...i.main.map(c=>n(c.id)),...i.branches.filter(c=>c.kind==="through").flatMap(c=>c.specs.map(u=>n(u.id)))];return{piece:i,instance:e,main:t.attachTo===void 0?s:[],branches:a,optional:o,exitSegmentId:n(i.exitSegment),throughIds:l}}const A1=(()=>{const i=new Map,e=(n,s)=>{let r=i.get(n);r===void 0&&(r=new Set,i.set(n,r)),r.add(s)},t=[Xn.main];for(const n of Xn.branches??[]){const s=Po.get(n.from);s!==void 0&&t.push([s,...n.specs])}for(const n of t)for(let s=1;s<n.length;s+=1)e(n[s-1].surface,n[s].surface);for(const n of[...M1,...Rp])e(n.surface,n.surface);return i})();function Lp(i,e){return A1.get(i)?.has(e)===!0}const Dl={minHalfWidthRatio:.5,maxGradientDelta:Math.PI/180};function R1(i,e){const t=[];Lp(i.surface,e.surface)||t.push(`${i.surface} into ${e.surface} is a transition the slice never makes`);const n=Math.min(i.halfWidth,e.halfWidth)/Math.max(i.halfWidth,e.halfWidth);n<Dl.minHalfWidthRatio&&t.push(`${i.halfWidth} m into ${e.halfWidth} m half-width is a ${(n*100).toFixed(0)}% step, past the ${(Dl.minHalfWidthRatio*100).toFixed(0)}% floor`);const s=Math.abs(i.gradient-e.gradient);return s>Dl.maxGradientDelta&&t.push(`a ${(s*180/Math.PI).toFixed(1)}° crease at the socket, which the controller reads as a step rather than a slope`),t}function Ad(i,e){return R1(i.exit,e.entry).length===0}const Zs=Lo.reduce((i,e)=>i+e.length,0),Ks={actorRadius:it.pedalSpan/2,margin:it.tyreDiameter,get minGap(){return this.actorRadius*2+this.margin},get maxStepUp(){return it.pedalHeight*Et.stepUpPedalFactor}},Nr={get driveAccel(){return j.leanToAccel*Math.sin(j.maxLeanPitch)},get topSpeed(){return Math.sqrt(this.driveAccel/j.dragCoefficient)},get lateralAccel(){return j.maxLateralG*gs.gravity},get stallGradient(){return Math.asin(Math.min(1,this.driveAccel/gs.gravity))},get maxRequiredGradient(){return this.stallGradient/2},get hopAirtime(){const i=j.hopLaunchSpeed**2/(2*gs.gravity)*(1+j.hopChargeHeightBonus);return 2*Math.sqrt(2*i/gs.gravity)},hopDistanceAt(i){return i*this.hopAirtime},curveSpeedLimit(i){const e=Math.abs(i);return e<1e-9?1/0:Math.sqrt(this.lateralAccel/e)}},xo=6.71;function C1(i,e){const t=new Map(i.map(r=>[r.spec.id,r])),n=new Map;let s=0;for(const r of e){const a=t.get(r);if(a===void 0)continue;const{spec:o}=a,l=wn[o.surface],c=Math.min(Nr.topSpeed,Nr.curveSpeedLimit(o.curvature??0)),u=Math.max(1,Math.ceil(o.length/2)),d=o.length/u;for(let h=0;h<u;h+=1){const f=(h+.5)*d,m=or(o,f),v=Nr.driveAccel-j.dragCoefficient*s*s-l.rollingResistance*Et.rollingResistanceScale-gs.gravity*Math.sin(m),p=s*s+2*v*d;s=p<=0?0:Math.sqrt(p),s>c&&(s=c)}n.set(r,s)}return n}function P1(i,e,t){const n=Math.cos(i.rotationY),s=Math.sin(i.rotationY),r=e-i.centre.x,a=t-i.centre.z,o=r*n-a*s,l=r*s+a*n;return Math.abs(o)<=i.halfExtents.x&&Math.abs(l)<=i.halfExtents.z}function L1(i){const e=[],t=new Map(i.placed.map(u=>[u.spec.id,u])),n=Ks.minGap,s=Ks.maxStepUp,r=[];for(const u of i.plan.segments)r.push(...u.colliders);r.push(...i.plan.solids??[]);const a=12,o=new Map,l=(u,d)=>`${Math.floor(u/a)},${Math.floor(d/a)}`;for(const u of r){const d=Math.hypot(u.halfExtents.x,u.halfExtents.z);for(let h=u.centre.x-d;h<=u.centre.x+d+a;h+=a)for(let f=u.centre.z-d;f<=u.centre.z+d+a;f+=a){const m=l(h,f),v=o.get(m);v===void 0?o.set(m,[u]):v.push(u)}}const c=.25;for(const u of i.throughIds){const d=t.get(u);if(d===void 0)continue;const{spec:h,entry:f}=d,m=Math.max(2,Math.ceil(h.length/3));for(let v=0;v<=m;v+=1){const p=h.length*v/m,b=En(f,h,p),M=f.headingY+(h.curvature??0)*p,T=qn(M);let x=0,A=0;for(let y=-h.halfWidth;y<=h.halfWidth;y+=c){const E=b.x+T.x*y,g=b.z+T.z*y,_=Yr(f,h,p,y);let R=!1;for(const C of o.get(l(E,g))??[])if(!(C.centre.y+C.halfExtents.y<=_+s)&&P1(C,E,g)){R=!0;break}A=R?0:A+c,A>x&&(x=A)}if(x<n)return e.push({contract:"clearance",detail:`${u} is pinched to ${x.toFixed(2)} m of clear lane ${p.toFixed(0)} m in, under the ${n.toFixed(2)} m the machine needs (${(Ks.actorRadius*2).toFixed(2)} m of pedal span plus ${Ks.margin.toFixed(2)} m to aim with)`}),e}}return e}function I1(i){return i>=Zs?[]:[{contract:"run-length",detail:`the required route is ${i.toFixed(0)} m with every optional branch dropped, under the ${Zs.toFixed(0)} m the hand-authored slice manages`}]}function D1(i,e){const t=[],n=new Map(i.placed.map(s=>[s.spec.id,s]));for(const s of i.jumps){const r=n.get(s.lipId),a=n.get(s.landingId);if(r===void 0||a===void 0){t.push({contract:"landable",detail:`${s.name} has no lip or no landing`});continue}const o=En(r.entry,r.spec,r.spec.length),l=a.entry.position,c=Math.hypot(l.x-o.x,l.z-o.z),u=e.get(s.lipId)??0,d=Nr.hopDistanceAt(u);c>d&&t.push({contract:"landable",detail:`${s.name}: a ${c.toFixed(1)} m gap arrived at ${u.toFixed(1)} m/s, which carries ${d.toFixed(1)} m`})}return t}function k1(i){const e=[],t=new Map(i.placed.map(n=>[n.spec.id,n]));for(const n of i.shortcuts){const s=t.get(n.exitId),r=t.get(n.rejoinId);if(s===void 0||r===void 0){e.push({contract:"reconnect",detail:`${n.name} names a segment the route does not contain`});continue}const a=En(s.entry,s.spec,s.spec.length),l=Dn(r,a.x,a.z)?.outside??1/0;l>Ks.minGap&&e.push({contract:"reconnect",detail:`${n.name} ends ${l.toFixed(1)} m outside ${n.rejoinId}, so it is a dead end rather than a shortcut`})}return e}const $c=.4;function F1(i){const e=[],t=i.placed;for(let n=0;n<t.length;n+=1)for(let s=n+1;s<t.length;s+=1){const r=t[n],a=t[s],o=i.pieceOf.get(r.spec.id),l=i.pieceOf.get(a.spec.id);if(o!==void 0&&o===l||i.adjacency.get(r.spec.id)?.has(a.spec.id)===!0||r.maxX<a.minX||a.maxX<r.minX||r.maxZ<a.minZ||a.maxZ<r.minZ)continue;const c=Math.max(4,Math.ceil(r.spec.length/2));for(let u=0;u<=c;u+=1){const d=r.spec.length*u/c,h=En(r.entry,r.spec,d),f=r.entry.headingY+(r.spec.curvature??0)*d,m=qn(f);for(const v of[0,-r.spec.halfWidth,r.spec.halfWidth]){const p=h.x+m.x*v,b=h.z+m.z*v,M=Dn(r,p,b),T=Dn(a,p,b);if(M===null||T===null||M.outside>0||T.outside>0)continue;const x=Math.abs(M.height-T.height);if(x>$c)return e.push({contract:"seam",detail:`${r.spec.id} and ${a.spec.id} share ground at (${p.toFixed(1)}, ${b.toFixed(1)}) but disagree about its height by ${x.toFixed(2)} m — a ledge across a corridor, worse than the ${$c.toFixed(2)} m the hand-authored slice's own worst join makes`}),e}}}return e}const Zc=Math.atan($c/.5),ri=14;function U1(i){const e=i.placed;let t=0,n=null;for(let s=0;s<e.length;s+=1)for(let r=s+1;r<e.length;r+=1){const a=e[s],o=e[r],l=i.pieceOf.get(a.spec.id),c=i.pieceOf.get(o.spec.id);if(l!==void 0&&l===c||i.adjacency.get(a.spec.id)?.has(o.spec.id)===!0||a.maxX<o.minX-ri||o.maxX<a.minX-ri||a.maxZ<o.minZ-ri||o.maxZ<a.minZ-ri)continue;const u=Math.max(6,Math.ceil(a.spec.length/2));for(let d=0;d<=u;d+=1){const h=a.spec.length*d/u,f=En(a.entry,a.spec,h),m=a.entry.headingY+(a.spec.curvature??0)*h,v=qn(m);for(const p of[-a.spec.halfWidth,a.spec.halfWidth]){const b=f.x+v.x*p,M=f.z+v.z*p,T=Dn(a,b,M),x=Dn(o,b,M);if(T===null||x===null||x.outside>ri)continue;const A=Math.atan(Math.abs(T.height-x.height)/Math.max(x.outside,.5));A<=t||(t=A,A>Zc&&(n={contract:"bank",detail:`${a.spec.id} runs ${x.outside.toFixed(1)} m from ${o.spec.id} and ${Math.abs(T.height-x.height).toFixed(1)} m above it at (${b.toFixed(0)}, ${M.toFixed(0)}) — a ${(A*180/Math.PI).toFixed(0)}° face where the ground between them should be, past the ${(Zc*180/Math.PI).toFixed(0)}° a shoulder can make`}))}}}return{failures:n===null?[]:[n],steepest:t}}const So=Math.PI*52/180;function N1(i){const e=new Set(i.throughIds),t=i.plan.surround.height;let n=0,s=null;for(const r of i.placed){if(!e.has(r.spec.id))continue;const a=r.spec.shoulder??Ts;for(const o of[r.entry,r.exit]){const l=Math.abs(o.position.y-t),c=Math.atan(l/Math.max(a,.5));c<=n||(n=c,c>So&&(s={contract:"shoulder",detail:`${r.spec.id} sits ${l.toFixed(1)} m off the surround behind a ${a} m shoulder — a ${(c*180/Math.PI).toFixed(0)}° bank rather than the ${(So*180/Math.PI).toFixed(0)}° the slice's own steepest makes`}))}}return{failures:s===null?[]:[s],steepest:n}}function O1(i){const e=new Map(i.placed.map(r=>[r.spec.id,r])),t=Nr.maxRequiredGradient;let n=0,s="";for(const r of i.throughIds){const a=e.get(r);if(a===void 0)continue;const o=Math.max(1,Math.ceil(a.spec.length/2));for(let l=0;l<=o;l+=1){const c=Math.abs(or(a.spec,a.spec.length*l/o));c>n&&(n=c,s=r)}}return n<=t?{failures:[],steepest:n}:{failures:[{contract:"gradient",detail:`${s} reaches ${(n*180/Math.PI).toFixed(1)}°, past the ${(t*180/Math.PI).toFixed(1)}° the wheel can climb with half its authority still in hand`}],steepest:n}}function z1(i){const e=i.plan.surround.height;let t=0,n="";for(const s of i.placed)for(const r of[s.entry,s.exit]){const a=Math.abs(r.position.y-e);a>t&&(t=a,n=s.spec.id)}return t<=xo?{failures:[],drift:t}:{failures:[{contract:"elevation",detail:`${n} sits ${t.toFixed(1)} m from the surround, past the ${xo} m the hand-authored slice spends — every shoulder beyond that is an embankment rather than a bank`}],drift:t}}function B1(i){const e=[],t=new Map(i.placed.map(n=>[n.spec.id,n]));for(let n=1;n<i.throughIds.length;n+=1){const s=t.get(i.throughIds[n-1]),r=t.get(i.throughIds[n]);if(s===void 0||r===void 0)continue;const a=Vc(s.spec,0),o=Vc(r.spec,0);Lp(a,o)||e.push({contract:"surface",detail:`${s.spec.id} lays ${a} into ${r.spec.id}'s ${o}, a transition the slice never makes`})}return e}function Rd(i){const e=new Map(i.placed.map(u=>[u.spec.id,u]));let t=0;for(const u of i.throughIds)t+=e.get(u)?.spec.length??0;const n=C1(i.placed,i.throughIds),s=O1(i),r=z1(i),a=U1(i),o=N1(i),l=[...L1(i),...I1(t),...D1(i,n),...k1(i),...F1(i),...a.failures,...o.failures,...s.failures,...B1(i),...r.failures],c=xp(i.plan);for(const u of c.breaches)l.push({contract:"render-budget",detail:u});return{valid:l.length===0,failures:l,requiredLength:t,steepestRequiredGradient:s.steepest,worstElevationDrift:r.drift,speedProfile:n}}const ka=2166136261,Fa=16777619;function H1(i){let e=ka,t=ka^2654435769,n=ka^2246822507,s=ka^3266489909;for(let a=0;a<i.length;a+=1){const o=i.charCodeAt(a);e=Math.imul(e^o,Fa),t=Math.imul(t^o+a,Fa),n=Math.imul(n^(o^a<<3),Fa),s=Math.imul(s^o+(a<<5),Fa)}const r=a=>(a>>>0).toString(16).padStart(8,"0");return r(e)+r(t)+r(n)+r(s)}const Ah=["route","terrain","dressing","surfaces"];function G1(i){let e=i+2654435769|0,t=e;return t=Math.imul(t^t>>>16,569420461),t=Math.imul(t^t>>>15,1935289751),t=t^t>>>15,{value:(t>>>0)/4294967296,state:e}}function V1(i,e){const t=H1(`${e}/${i}`);let n=Number.parseInt(t.slice(0,8),16)|0,s=0;const r=()=>{const a=G1(n);return n=a.state,s+=1,a.value};return{domain:i,next:r,int:a=>a<=0?0:Math.floor(r()*a)%a,range:(a,o)=>a+r()*(o-a),pick(a){if(a.length===0)throw new Error(`${i}: nothing to pick from`);return a[Math.floor(r()*a.length)%a.length]},weighted(a,o){if(a.length===0)throw new Error(`${i}: nothing to pick from`);let l=0;for(const u of a){const d=o(u);if(!(d>=0)||!Number.isFinite(d))throw new Error(`${i}: a weight of ${d} is not a weight`);l+=d}if(l<=0)throw new Error(`${i}: every candidate weighs nothing`);let c=r()*l;for(const u of a)if(c-=o(u),c<0)return u;return a[a.length-1]},get draws(){return s}}}function Cd(i){const e=typeof i=="string"?{seed:i}:i,t={};for(const n of Ah)t[n]=V1(n,e.overrides?.[n]??e.seed);return t}function W1(i){const e=typeof i=="string"?{seed:i}:i,t=Ah.filter(n=>e.overrides?.[n]!==void 0).map(n=>`${n}=${e.overrides?.[n]??""}`);return t.length===0?e.seed:`${e.seed}[${t.join(",")}]`}function X1(i,e){const t=typeof i=="string"?{seed:i}:i;if(e===0)return t;const n=t.overrides?.route??t.seed;return{...t,overrides:{...t.overrides,route:`${n}#${e}`}}}const Rn={maxAttempts:12,maxPieces:40,unusedBeatWeight:6,usedBeatWeight:1,connectorWeight:1.4,maxBeatUses:2,optionalKeepChance:.7,checkpointCount:Tp.length},Pd=Lr.maxTriangles*1.25,Y1=Ks.maxStepUp,ni={position:{x:0,y:0,z:0},headingY:0};function Ld(i,e,t){for(const n of e){if(n.spec.id===i.spec.id||t.get(i.spec.id)?.has(n.spec.id)===!0||i.maxX<n.minX-ri||n.maxX<i.minX-ri||i.maxZ<n.minZ-ri||n.maxZ<i.minZ-ri)continue;const s=Math.max(4,Math.ceil(i.spec.length/3));for(let r=0;r<=s;r+=1){const a=i.spec.length*r/s,o=En(i.entry,i.spec,a),l=i.entry.headingY+(i.spec.curvature??0)*a,c=qn(l);for(const u of[0,-i.spec.halfWidth,i.spec.halfWidth]){const d=o.x+c.x*u,h=o.z+c.z*u,f=Dn(i,d,h),m=Dn(n,d,h);if(f===null||m===null||m.outside>ri)continue;const v=Math.abs(f.height-m.height);if(f.outside===0&&m.outside===0){if(v>Y1)return!0;continue}if(Math.atan(v/Math.max(m.outside,.5))>Zc)return!0}}}return!1}const q1=(()=>{const i=new Map;for(const e of Pp){const t=e.main[0].id.split("-").slice(0,2).join("-"),n=i.get(t)??[],s=e.main[0].climb??0;n.includes(s)||n.push(s),i.set(t,n)}for(const e of i.values())e.sort((t,n)=>t-n);return i})(),$1=Pp.filter(i=>(i.main[0].climb??0)===0);function Z1(i,e){const t=e(),n=e();if(t<.3)return;const s=i.halfWidth,r=s*(.62+n*.26),a=i.surface==="dirt"||i.surface==="gravel"||t<.65?"grass":"gravel";return[{from:r,to:s,surface:a},{from:-s,to:-r,surface:a}]}function K1(i,e){const t=i.surface==="pavement"||i.surface==="roughPavement",n=t?["lampPost","broadleafTree","bench","litterBin","shrub"]:["conifer","broadleafTree","shrub","shrub"],s=(o,l,c)=>o==="bench"||o==="lampPost"||o==="signpost"?Ao(l):c*Math.PI*2,r=[],a=t?14:11;for(let o=a*.5;o<i.length;o+=a)for(const l of[1,-1]){if(e()>.62)continue;const c=n[Math.floor(e()*n.length)%n.length],u=l*(i.halfWidth+1.2+e()*1.4);r.push({s:o+(e()-.5)*a*.6,t:u,kind:c,yaw:s(c,u,e()),scale:.85+e()*.4})}return r}function Rh(i){const e=[],t=n=>{for(let s=0;s<n.length;s+=1){const r=n[s];r.id.startsWith("link-")&&e.push({spec:r,replace:a=>{n[s]=a}})}};t(i.main);for(const n of i.branches)t(n.specs);return e}function Q1(i,e,t){const n=Rh(i);for(const s of n){const r=s.spec.id.split("@")[0].split("-").slice(0,2).join("-"),a=q1.get(r);if(a===void 0||a.length===0)continue;const c=(li(i,ni).find(d=>d.spec.id===s.spec.id)?.entry.position.y??0)-t,u=e.weighted([...a],d=>{const h=Math.abs(c+d),f=Math.abs(c);return 1+Math.max(0,f-xo*.4)/xo*6*(h<f?1:0)});s.replace({...s.spec,climb:u})}}function J1(i,e,t,n){const s=new Set;for(let r=0;r<e.length+1;r+=1){const a=li(i,ni),o=new Set(a.map(c=>c.spec.id));let l=!1;for(const c of e){if(i.branches.indexOf(c.branch)<0)continue;const u=!o.has(c.branch.from),d=!u&&a.some(h=>{if(!c.ids.includes(h.spec.id))return!1;const f=h.spec.shoulder??Ts;return[h.entry,h.exit].some(m=>Math.atan(Math.abs(m.position.y-n)/Math.max(f,.5))>So)});if(!(!u&&!d)){i.branches.splice(i.branches.indexOf(c.branch),1);for(const h of c.ids){s.add(h);const f=t.indexOf(h);f>=0&&t.splice(f,1)}l=!0}}if(!l)break}}function j1(i,e){for(const t of Rh(i)){const n=Z1(t.spec,()=>e.next());t.replace(n===void 0?t.spec:{...t.spec,bands:n})}}function ew(i,e){for(const t of Rh(i)){const n=K1(t.spec,()=>e.next());t.replace(n.length===0?t.spec:{...t.spec,props:n})}}function tw(i){const e=i.route,t=i.terrain,n=i.surfaces,s=i.dressing,r={main:[],branches:[]},a=new Map,o=new Map,l=[],c=[],u=[],d=[],h=[],f=new Map,m=[];let v=[],p=0,b=0,M=null,T=null,x;const A=(y,E)=>{a.has(y)||a.set(y,new Set),a.has(E)||a.set(E,new Set),a.get(y).add(E),a.get(E).add(y)};for(let y=0;y<Rn.maxPieces;y+=1){const E=M,g=Lo.filter(L=>E===null?L.entry.halfWidth>=7:!Ad(E,L)||L.id===T?!1:(f.get(L.id)??0)<Rn.maxBeatUses),_=E===null?[]:$1.filter(L=>Ad(E,L));if(g.length===0&&_.length===0)return{route:null,reason:`nothing in the library can follow ${E?.id??"the start"} — a library gap rather than an unlucky seed`};const C=g.length>0&&(_.length===0||e.next()>Rn.connectorWeight/(Rn.connectorWeight+3))?g:_,I=L=>{if(E===null)return L.entry.halfWidth**2;if(L.role==="connector")return Rn.connectorWeight;const X=f.get(L.id)??0;return X===0?Rn.unusedBeatWeight:Rn.usedBeatWeight/X},k=[...C],z=[];for(;k.length>0;){const L=e.weighted(k,I);z.push(L),k.splice(k.indexOf(L),1)}let D=null;for(const L of z){const X=`${y}`,ee=Td(L,X,{attachTo:x,dropOptional:!0}),Y=[...ee.main],J=[...ee.branches],te={main:r.main.length===0?Y:r.main,branches:r.main.length===0?[...r.branches,...J]:[...r.branches,...J]},Te=li(te,ni),Oe=Te.filter(le=>!v.some(ve=>ve.spec.id===le.spec.id)),q=new Map;for(const[le,ve]of a)q.set(le,new Set(ve));const G=(le,ve)=>{q.has(le)||q.set(le,new Set),q.has(ve)||q.set(ve,new Set),q.get(le).add(ve),q.get(ve).add(le)},ne=Oe.map(le=>le.spec.id);for(let le=1;le<ne.length;le+=1)G(ne[le-1],ne[le]);for(const le of ne)x!==void 0&&G(x,le);if(!Oe.some(le=>Ld(le,Te.filter(ve=>ve.spec.id!==le.spec.id),q))){D={piece:L,instance:X,segments:Oe,main:Y,branches:J,exitSegmentId:ee.exitSegmentId,throughIds:ee.throughIds,optional:Td(L,X,{attachTo:x}).optional};break}}if(D===null){if(p>=Zs)break;return{route:null,reason:`the route boxed itself in after ${l.length} pieces and ${p.toFixed(0)} m: every legal continuation from ${M?.name??"the start"} would cross ground already laid`}}r.main.length===0&&(r.main=D.main),r.branches.push(...D.branches);const V=D.segments.map(L=>L.spec.id);for(let L=1;L<V.length;L+=1)A(V[L-1],V[L]);if(x!==void 0)for(const L of V)A(x,L);v=li(r,ni);for(const L of D.throughIds)c.push(L),p+=v.find(X=>X.spec.id===L)?.spec.length??0,b+=qc(L.split("@")[0]).triangles;D.piece.id==="kicker"&&d.push({name:`the kicker (${D.instance})`,lipId:`kicker-run@${D.instance}`,landingId:`kicker-land@${D.instance}`});for(const L of D.optional){if(e.next()>Rn.optionalKeepChance||!v.some(q=>q.spec.id===L.branch.from))continue;const X={main:r.main,branches:[...r.branches,L.branch]},ee=li(X,ni),Y=ee.filter(q=>L.ids.includes(q.spec.id)),J=new Map;for(const[q,G]of a)J.set(q,new Set(G));const te=[L.branch.from,...L.ids];for(let q=1;q<te.length;q+=1)J.has(te[q-1])||J.set(te[q-1],new Set),J.has(te[q])||J.set(te[q],new Set),J.get(te[q-1]).add(te[q]),J.get(te[q]).add(te[q-1]);if(!(Y.some(q=>Ld(q,ee.filter(G=>G.spec.id!==q.spec.id),J))||Y.some(q=>{const G=q.spec.shoulder??Ts;return[q.entry,q.exit].some(ne=>Math.atan(Math.abs(ne.position.y-ni.position.y)/Math.max(G,.5))>So)}))){r.branches.push(L.branch),m.push({branch:L.branch,ids:L.ids}),v=ee,u.push(...L.ids);for(let q=1;q<te.length;q+=1)A(te[q-1],te[q]);for(const q of L.ids)b+=qc(q.split("@")[0]).triangles;L.name==="alley shortcut"&&h.push({name:`alley (${D.instance})`,fromId:L.branch.from,exitId:L.ids[L.ids.length-1],rejoinId:D.exitSegmentId})}}for(const L of v)o.has(L.spec.id)||o.set(L.spec.id,`${D.piece.id}@${D.instance}`);if(l.push({piece:D.piece,instance:D.instance,exitSegmentId:D.exitSegmentId,throughIds:D.throughIds,optionalIds:D.optional.flatMap(L=>L.ids),shortcuts:[],jumps:[]}),D.piece.beat!==null&&(f.set(D.piece.id,(f.get(D.piece.id)??0)+1),T=D.piece.id),x=D.exitSegmentId,M=D.piece,b>Pd)return{route:null,reason:`the pre-screen put the route past ${Pd.toFixed(0)} triangles before it was even rasterised`};if(p>=Zs&&D.piece.beat!==null)break}return p<Zs?{route:null,reason:`the route reached the ${Rn.maxPieces}-piece ceiling at only ${p.toFixed(0)} m, short of the ${Zs.toFixed(0)} m floor`}:(Q1(r,t,ni.position.y),J1(r,m,u,ni.position.y),j1(r,n),ew(r,s),v=li(r,ni),{reason:"",route:{graph:r,placed:v,pieces:l,throughIds:c,optionalIds:u,jumps:d,shortcuts:h,adjacency:a,pieceOf:o,requiredLength:p}})}const Ip=Ts;function nw(i,e,t){let n=1/0;for(const s of i){const r=Dn(s,e,t);if(r===null)continue;const a=r.outside-(s.spec.shoulder??Ts);a<n&&(n=a)}return n}function iw(i,e){let t=1/0,n=-1/0,s=1/0,r=-1/0;for(const f of i)t=Math.min(t,f.minX),n=Math.max(n,f.maxX),s=Math.min(s,f.minZ),r=Math.max(r,f.maxZ);const a=(t+n)/2,o=(s+r)/2,l=(n-t)/2+90,c=(r-s)/2+90,u=[],d=72;for(let f=0;f<d;f+=1){const m=f/d*Math.PI*2+e()*.06,v=14+e()*46,p=10+e()*16,b=p*(.7+e()*.6),M=e()*Math.PI,T=Math.hypot(p,b)/2;let x=!1;for(let A=0;A<6&&!x;A+=1){const y=1+e()*.55+A*.22,E=a+Math.cos(m)*l*y,g=o+Math.sin(m)*c*y;nw(i,E,g)-T<Ip||(u.push({kind:"building",x:E,z:g,rotationY:M,scale:1,lift:0,size:{x:p,y:v,z:b}}),x=!0)}}const h=26;for(let f=t-40;f<n+40;f+=h)for(let m=s-40;m<r+40;m+=h){if(e()>.4)continue;const v=e()>.55?"conifer":e()>.4?"broadleafTree":"shrub";u.push({kind:v,x:f+e()*h,z:m+e()*h,rotationY:e()*Math.PI*2,scale:.8+e()*.5,lift:0})}return u}function sw(i,e){const t=new Map(i.map(o=>[o.spec.id,o])),n=[];let s=0;for(const o of e){const l=t.get(o);l!==void 0&&(n.push({id:o,from:s,length:l.spec.length}),s+=l.spec.length)}if(n.length===0||s<=0)return[];const r=Math.min(Rn.checkpointCount,n.length),a=[];for(let o=0;o<r;o+=1){const l=s*(.04+.92*o/Math.max(1,r-1)),c=n.find(d=>l<d.from+d.length)??n[n.length-1],u=Math.min(c.length-4,Math.max(4,l-c.from));a.push({id:o===0?"start":o===r-1?"finish":`split-${o}`,segment:c.id,s:u,kind:o===0?"start":o===r-1?"finish":"split",label:o===0?"Start":o===r-1?"Finish":`Split ${o}`})}return a}function rw(){const i=Ap(),e=li(Xn,{position:{x:0,y:0,z:0},headingY:0}),t=new Map,n=(o,l)=>{t.has(o)||t.set(o,new Set),t.has(l)||t.set(l,new Set),t.get(o).add(l),t.get(l).add(o)};for(let o=1;o<Xn.main.length;o+=1)n(Xn.main[o-1].id,Xn.main[o].id);for(const o of Xn.branches??[]){const l=[o.from,...o.specs.map(c=>c.id)];for(let c=1;c<l.length;c+=1)n(l[c-1],l[c])}const s=["alley-mouth","alley-upper","alley-steps","alley-run","alley-dog","alley-exit","alley-ledge","chicken-lead","chicken-in","chicken-out","drain-run","terrace"],r=new Set(s),a=e.map(o=>o.spec.id).filter(o=>!r.has(o));return{plan:i,placed:e,throughIds:a,optionalIds:s,jumps:[{name:"the kicker",lipId:"kicker-run",landingId:"kicker-land"}],shortcuts:[{name:"the alley",fromId:"fork",exitId:"alley-exit",rejoinId:"road-in"}],adjacency:t,pieceOf:aw}}const aw=(()=>{const i=new Map;for(const e of Lo)for(const t of[...e.main,...e.branches.flatMap(n=>n.specs)])i.set(t.id,e.id);return i})();function Dp(i){const e=W1(i),t=[];for(let a=0;a<Rn.maxAttempts;a+=1){const o=Cd(X1(i,a)),l=tw(o),c=l.route;if(c===null){t.push({attempt:a,reasons:[l.reason]});continue}const u=wh(c.graph,{id:`generated-${e}`,spawn:ni,surround:{height:0,surface:"grass"},props:iw(c.placed,()=>o.dressing.next()).map(m=>({...m})),checkpoints:sw(c.placed,c.throughIds),settleProps:!0,settleBlocks:!0,buildingStandBack:Ip}),d={plan:u,placed:c.placed,throughIds:c.throughIds,optionalIds:c.optionalIds,jumps:c.jumps,shortcuts:c.shortcuts,adjacency:c.adjacency,pieceOf:c.pieceOf},h=Rd(d);if(!h.valid){t.push({attempt:a,reasons:h.failures.map(m=>m.detail)});continue}const f=Dd(d);return{plan:u,layout:d,report:{seed:e,draws:Id(o),attempts:a+1,rejections:t,usedFallback:!1,verdict:h,beats:c.pieces.filter(m=>m.piece.beat!==null).map(m=>m.piece.name),requiredLength:h.requiredLength,optionalSegments:c.optionalIds.length,drawCallsPredicted:f.drawCalls,trianglesPredicted:f.triangles}}}const n=rw(),s=Rd(n),r=Dd(n);return{plan:n.plan,layout:n,report:{seed:e,draws:Id(Cd(i)),attempts:Rn.maxAttempts,rejections:t,usedFallback:!0,verdict:s,beats:Lo.map(a=>a.name),requiredLength:s.requiredLength,optionalSegments:n.optionalIds.length,drawCallsPredicted:r.drawCalls,trianglesPredicted:r.triangles}}}function Id(i){const e={};for(const t of Ah)e[t]=i[t].draws;return e}function Dd(i){return xp(i.plan).frame}const ow=1.6,kl=7.2,kd=2.5,Fd=2,lw=[{id:"pad",length:180,halfWidth:40,surface:"pavement",shoulder:8},{id:"plaza",length:44,halfWidth:15,surface:"brick",shoulder:8,blocks:[...[-6,-3.5,3.5,6].map(i=>({s:14,t:i,halfAlong:.09,halfLateral:.09,height:.9,surface:"brick",appearance:"metal"})),{s:26,t:9,halfAlong:4.5,halfLateral:1.1,height:.85,surface:"brick",appearance:"stone"},{s:38,t:ow+kl,halfAlong:kd,halfLateral:kl,height:Fd,surface:"brick",appearance:"stone"},{s:38,t:-8.8,halfAlong:kd,halfLateral:kl,height:Fd,surface:"brick",appearance:"stone"}]},{id:"boulevard",length:86,halfWidth:9,surface:"pavement",shoulder:7,blocks:[{s:43,t:-7,halfAlong:35,halfLateral:2,height:.15,surface:"pavement",appearance:"concrete"}]},{id:"sweep",length:63,curvature:1/40,halfWidth:9,surface:"pavement",shoulder:7,bands:[{from:4.5,to:9,surface:"grass"},{from:-9,to:-5.5,surface:"grass"}]},{id:"climb",length:54,climb:7,halfWidth:8,surface:"roughPavement",shoulder:7},{id:"crest",length:22,halfWidth:8,surface:"roughPavement",shoulder:7,blocks:[{s:11,t:7.4,halfAlong:9,halfLateral:.5,height:1,surface:"roughPavement",appearance:"stone"}]},{id:"descent",length:50,climb:-7,halfWidth:8,surface:"gravel",shoulder:7},{id:"trail",length:50,curvature:-1/50,halfWidth:5.5,surface:"dirt",shoulder:6,blocks:[{s:18,t:-1.8,halfAlong:.7,halfLateral:.7,height:.3,surface:"dirt",appearance:"stone"},{s:32,t:2.2,halfAlong:.6,halfLateral:.6,height:.18,surface:"dirt",appearance:"stone"}]},{id:"bridge",length:16,halfWidth:3.5,surface:"wood",shoulder:4,blocks:[...[-3.4,3.4].map(i=>({s:8,t:i,halfAlong:8,halfLateral:.12,height:.9,surface:"wood",appearance:"wood"}))]},{id:"return",length:40,halfWidth:8,surface:"pavement",shoulder:7}];function cw(){return wh(lw,{id:"m4-proving-ground",spawn:{position:{x:0,y:0,z:0},headingY:0},surround:{height:0,surface:"grass"}})}const Wr="slice",_o="euc",Kc={slice:Ap,proving:cw,generated:i=>Dp(i).plan};function hw(i){return i!=null&&Object.hasOwn(Kc,i)}function Fl(i=Wr,e=_o){return(Kc[i]??Kc[Wr])(e)}function uw(i){const e=new URLSearchParams(i).get("level");return hw(e)?e:Wr}function dw(i){const e=new URLSearchParams(i).get("seed");if(e===null)return _o;const t=Ch(e);return t.length>0?t:_o}const kp=24;function Ch(i){return i.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,kp).replace(/^-+|-+$/g,"")}function Ul(i){const e=Ch(i);if(e.length===0)return{ok:!1,seed:e,refusal:"blank"};const t=Dp(e);return t.report.usedFallback?{ok:!1,seed:e,refusal:"no-route"}:{ok:!0,seed:e,plan:t.plan}}const so=["amber","brisk","copper","dusty","ember","fern","glass","harbour","ivory","jetty","kestrel","lantern","marble","nimbus","opal","pewter","quarry","rust","slate","tidal","umber","velvet","willow","zephyr"],ro=["arch","bay","cove","drift","edge","fall","gate","hill","isle","junction","kerb","lane","mill","nook","orchard","pier","quay","ridge","span","tower","underpass","vault","wharf","yard"];function fw(i){const e=Math.abs(Math.trunc(i)),t=so[e%so.length],n=Math.floor(e/so.length),s=ro[n%ro.length],r=Math.floor(n/ro.length)%100;return r===0?`${t}-${s}`:`${t}-${s}-${r}`}const pw=so.length*ro.length*100,Fp=["hop","reset","cameraCycle","pause","muteAudio"],mw=Object.freeze({throttle:0,steer:0,crouch:!1,hop:!1,reset:!1,cameraCycle:!1,pause:!1,muteAudio:!1});function Ua(i){return Number.isFinite(i)?Math.min(1,Math.max(-1,i)):0}function Ud(i,e){return Math.abs(i)>=Math.abs(e)?i:e}class gw{bufferSeconds;held=new Map;latched=new Map;axes=new Map;scriptedThrottle=null;scriptedSteer=null;scriptedCrouch=!1;constructor(e=ti.actionBufferSeconds){this.bufferSeconds=e}setHeld(e,t,n="keyboard"){let s=this.held.get(e);if(!s){if(!t)return;s=new Set,this.held.set(e,s)}t?s.add(n):s.delete(n)}isHeld(e){const t=this.held.get(e);return t!==void 0&&t.size>0}setAxes(e,t,n){let s=this.axes.get(e);s||(s={throttle:0,steer:0},this.axes.set(e,s)),s.throttle=Ua(t),s.steer=Ua(n)}clearDevice(e){for(const t of this.held.values())t.delete(e);this.axes.delete(e)}press(e,t){this.latched.set(e,t)}isPending(e,t){const n=this.latched.get(e);return n===void 0?!1:t-n>this.bufferSeconds?(this.latched.delete(e),!1):!0}consume(e,t){return this.isPending(e,t)?(this.latched.delete(e),!0):!1}setScripted(e,t){e.throttle!==void 0&&(this.scriptedThrottle=Ua(e.throttle)),e.steer!==void 0&&(this.scriptedSteer=Ua(e.steer)),e.crouch!==void 0&&(this.scriptedCrouch=e.crouch);for(const n of Fp){const s=e[n];s===!0?this.press(n,t):s===!1&&this.latched.delete(n)}}clearPending(){this.latched.clear()}clearDevices(){this.held.clear(),this.latched.clear(),this.axes.clear()}clearScripted(){this.scriptedThrottle=null,this.scriptedSteer=null,this.scriptedCrouch=!1}clearAll(){this.held.clear(),this.latched.clear(),this.axes.clear(),this.clearScripted()}sample(e){let t=(this.isHeld("accelerate")?1:0)-(this.isHeld("brake")?1:0),n=(this.isHeld("steerRight")?1:0)-(this.isHeld("steerLeft")?1:0);for(const s of this.axes.values())t=Ud(t,s.throttle),n=Ud(n,s.steer);return{throttle:this.scriptedThrottle??t,steer:this.scriptedSteer??n,crouch:this.isHeld("crouch")||this.scriptedCrouch,hop:this.isPending("hop",e),reset:this.isPending("reset",e),cameraCycle:this.isPending("cameraCycle",e),pause:this.isPending("pause",e),muteAudio:this.isPending("muteAudio",e)}}}const ao=Object.freeze([Object.freeze({action:"accelerate",kind:"held",label:"Accelerate",defaults:Object.freeze(["KeyW","ArrowUp"])}),Object.freeze({action:"brake",kind:"held",label:"Brake / reverse",defaults:Object.freeze(["KeyS","ArrowDown"])}),Object.freeze({action:"steerLeft",kind:"held",label:"Carve left",defaults:Object.freeze(["KeyA","ArrowLeft"])}),Object.freeze({action:"steerRight",kind:"held",label:"Carve right",defaults:Object.freeze(["KeyD","ArrowRight"])}),Object.freeze({action:"hop",kind:"pressed",label:"Hop",defaults:Object.freeze(["Space"])}),Object.freeze({action:"crouch",kind:"held",label:"Crouch / charge hop",defaults:Object.freeze(["ShiftLeft","ShiftRight"])}),Object.freeze({action:"cameraCycle",kind:"pressed",label:"Camera view",defaults:Object.freeze(["KeyC"])}),Object.freeze({action:"muteAudio",kind:"pressed",label:"Mute",defaults:Object.freeze(["KeyM"])}),Object.freeze({action:"reset",kind:"pressed",label:"Quick reset",defaults:Object.freeze(["KeyR"])})]),bw="Escape",Up=Object.freeze(new Set(["Escape","F3","F4","Tab"])),vw=Object.freeze({F3:"toggleOverlay",F4:"toggleTuningPanel"}),xw=Object.freeze(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","F3","F4"]),Sw=Object.freeze(["PageUp","PageDown","Home","End","Backspace","Enter","NumpadEnter"]);function Ph(i={}){const e={},t={},n=new Set(xw);for(const s of ao){const r=i[s.action]??s.defaults;for(const a of r)Up.has(a)||(delete e[a],delete t[a],s.kind==="held"?e[a]=s.action:t[a]=s.action,Sw.includes(a)&&n.add(a))}return t[bw]="pause",{held:Object.freeze(e),pressed:Object.freeze(t),suppress:n}}function _w(i){return i.startsWith("Key")?i.slice(3):i.startsWith("Digit")?i.slice(5):i.startsWith("Numpad")?`Num ${i.slice(6)}`:i.startsWith("Arrow")?`${i.slice(5)} arrow`:{Space:"Space",ShiftLeft:"Left shift",ShiftRight:"Right shift",ControlLeft:"Left ctrl",ControlRight:"Right ctrl",AltLeft:"Left alt",AltRight:"Right alt",Escape:"Esc",Backquote:"`",Minus:"-",Equal:"=",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Semicolon:";",Quote:"'",Comma:",",Period:".",Slash:"/"}[i]??i}const Lh=Ph();Lh.held;Lh.pressed;Lh.suppress;function Mw(i){if(!(i instanceof HTMLElement))return!1;if(i.isContentEditable)return!0;const e=i.tagName;return e==="INPUT"||e==="TEXTAREA"||e==="SELECT"}class yw{state;options;target;heldCodes=new Map;tables=Ph();constructor(e,t,n=window){this.state=e,this.options=t,this.target=n,n.addEventListener("keydown",this.onKeyDown),n.addEventListener("keyup",this.onKeyUp),n.addEventListener("blur",this.onBlur),n.document.addEventListener("visibilitychange",this.onVisibilityChange)}setBindings(e){this.reset(),this.tables=e}dispose(){this.target.removeEventListener("keydown",this.onKeyDown),this.target.removeEventListener("keyup",this.onKeyUp),this.target.removeEventListener("blur",this.onBlur),this.target.document.removeEventListener("visibilitychange",this.onVisibilityChange)}onKeyDown=e=>{if(Mw(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;const t=vw[e.code];if(t){e.repeat||this.options.onDebugAction?.(t),this.tables.suppress.has(e.code)&&e.preventDefault();return}const n=this.tables.held[e.code];if(n){let r=this.heldCodes.get(n);r||(r=new Set,this.heldCodes.set(n,r)),r.add(e.code),this.state.setHeld(n,!0),this.tables.suppress.has(e.code)&&e.preventDefault();return}const s=this.tables.pressed[e.code];s&&(e.repeat||this.state.press(s,this.options.now()),this.tables.suppress.has(e.code)&&e.preventDefault())};onKeyUp=e=>{const t=this.tables.held[e.code];if(!t)return;const n=this.heldCodes.get(t);n&&(n.delete(e.code),n.size>0)||this.state.setHeld(t,!1)};reset(){this.heldCodes.clear(),this.state.clearAll()}onBlur=()=>{this.reset(),this.options.onInputReset?.("blur")};onVisibilityChange=()=>{this.target.document.visibilityState==="hidden"&&(this.reset(),this.options.onInputReset?.("hidden"))}}const qt=Object.freeze({a:0,b:1,x:2,y:3,leftShoulder:4,rightShoulder:5,leftTrigger:6,rightTrigger:7,select:8,start:9,leftStick:10,rightStick:11,dpadUp:12,dpadDown:13,dpadLeft:14,dpadRight:15,guide:16}),Nd=17,ww=0,Ew=1,Tw="standard",Na=Object.freeze(["up","down","left","right"]),Aw=0,Rw=1,Cw=2,Pw=3,Xs=Object.freeze({stickDeadZone:.18,triggerThreshold:.08,menuRepeatDelaySeconds:.42,menuRepeatIntervalSeconds:.14,menuStickThreshold:.5});function Lw(i,e){return i>e?Math.min(1,(i-e)/(1-e))/i:0}function Od(i,e){return i>e?Math.min(1,(i-e)/(1-e)):0}function Iw(i,e){return Math.abs(i)>=Math.abs(e)?i:e}function zd(i){return i.mapping===Tw}function Bn(i,e){const t=i[e];return t!==void 0&&t.pressed===!0}function Bd(i,e){const t=i[e];if(t===void 0)return 0;const n=t.value;return!Number.isFinite(n)||n<=0?t.pressed?1:0:n}function Hd(i,e){const t=i[e];return t!==void 0&&Number.isFinite(t)?t:0}function Oa(i,e){return i===void 0||!Number.isFinite(i)?e:Math.min(.9,Math.max(0,i))}function Gd(i,e){return i===void 0||!Number.isFinite(i)||i<0?e:i}class Dw{state;options;target;source;stickDeadZone;triggerThreshold;menuRepeatDelaySeconds;menuRepeatIntervalSeconds;menuStickThreshold;activeIndex=-1;priming=!1;menuMode=!1;enabled=!0;previousButtons=new Uint8Array(Nd);menuDirectionHeld=new Uint8Array(Na.length);menuRepeatAt=new Float64Array(Na.length);constructor(e,t,n=window,s=navigator){this.state=e,this.options=t,this.target=n,this.source=s,this.stickDeadZone=Oa(t.stickDeadZone,Xs.stickDeadZone),this.triggerThreshold=Oa(t.triggerThreshold,Xs.triggerThreshold),this.menuStickThreshold=Oa(t.menuStickThreshold,Xs.menuStickThreshold),this.menuRepeatDelaySeconds=Gd(t.menuRepeatDelaySeconds,Xs.menuRepeatDelaySeconds),this.menuRepeatIntervalSeconds=Gd(t.menuRepeatIntervalSeconds,Xs.menuRepeatIntervalSeconds),n.addEventListener("gamepadconnected",this.onGamepadConnected),n.addEventListener("gamepaddisconnected",this.onGamepadDisconnected)}get connected(){return this.activeIndex>=0}setEnabled(e){this.enabled!==e&&(this.enabled=e,e||(this.activeIndex=-1,this.state.clearDevice("gamepad")))}setDeadZone(e){this.stickDeadZone=Oa(e,Xs.stickDeadZone)}dispose(){this.target.removeEventListener("gamepadconnected",this.onGamepadConnected),this.target.removeEventListener("gamepaddisconnected",this.onGamepadDisconnected),this.activeIndex=-1,this.state.clearDevice("gamepad")}setMenuMode(e){this.menuMode!==e&&(this.menuMode=e,e&&this.state.clearDevice("gamepad"))}poll(e=this.options.now()){const t=this.resolvePad();if(t===null)return;const n=t.buttons,s=Hd(t.axes,ww),r=Hd(t.axes,Ew),a=Lw(Math.hypot(s,r),this.stickDeadZone),o=s*a,l=-r*a,c=Od(Bd(n,qt.rightTrigger),this.triggerThreshold)-Od(Bd(n,qt.leftTrigger),this.triggerThreshold);this.updateMenu(e,o,l,n),this.menuMode||this.updateRide(e,Iw(l,c),o,n);for(let u=0;u<Nd;u+=1)this.previousButtons[u]=Bn(n,u)?1:0;this.priming=!1}resolvePad(){if(!this.enabled)return null;const e=this.source.getGamepads();if(this.activeIndex>=0){const t=e[this.activeIndex];if(t!=null&&t.connected&&zd(t))return t;this.releasePad()}for(let t=0;t<e.length;t+=1){const n=e[t];if(!(n==null||!n.connected||!zd(n)))return this.adopt(t),n}return null}adopt(e){this.activeIndex=e,this.priming=!0,this.previousButtons.fill(0),this.menuDirectionHeld.fill(0),this.options.onConnectionChange?.(!0)}releasePad(){this.activeIndex=-1,this.priming=!1,this.previousButtons.fill(0),this.menuDirectionHeld.fill(0),this.state.clearDevice("gamepad"),this.options.onConnectionChange?.(!1)}updateRide(e,t,n,s){this.state.setAxes("gamepad",t,n),this.state.setHeld("accelerate",Bn(s,qt.dpadUp),"gamepad"),this.state.setHeld("brake",Bn(s,qt.dpadDown),"gamepad"),this.state.setHeld("steerLeft",Bn(s,qt.dpadLeft),"gamepad"),this.state.setHeld("steerRight",Bn(s,qt.dpadRight),"gamepad"),this.state.setHeld("crouch",Bn(s,qt.leftShoulder),"gamepad"),!this.priming&&(this.rose(s,qt.a)&&this.state.press("hop",e),this.rose(s,qt.x)&&this.state.press("reset",e),this.rose(s,qt.y)&&this.state.press("cameraCycle",e),this.rose(s,qt.start)&&this.state.press("pause",e))}updateMenu(e,t,n,s){const r=Math.abs(n)>=Math.abs(t),a=this.menuStickThreshold;this.updateMenuDirection(Aw,e,Bn(s,qt.dpadUp)||r&&n>=a),this.updateMenuDirection(Rw,e,Bn(s,qt.dpadDown)||r&&n<=-a),this.updateMenuDirection(Cw,e,Bn(s,qt.dpadLeft)||!r&&t<=-a),this.updateMenuDirection(Pw,e,Bn(s,qt.dpadRight)||!r&&t>=a),this.rose(s,qt.a)&&this.emitMenu("confirm"),this.rose(s,qt.b)&&this.emitMenu("back")}updateMenuDirection(e,t,n){if(!n){this.menuDirectionHeld[e]=0;return}const s=this.menuDirectionHeld[e]===1;if(this.menuDirectionHeld[e]=1,!s){this.menuRepeatAt[e]=t+this.menuRepeatDelaySeconds,this.emitMenu(Na[e]);return}t<this.menuRepeatAt[e]||(this.menuRepeatAt[e]=t+this.menuRepeatIntervalSeconds,this.emitMenu(Na[e]))}emitMenu(e){this.priming||this.options.onMenuAction?.(e)}rose(e,t){return Bn(e,t)&&this.previousButtons[t]===0}onGamepadConnected=()=>{this.activeIndex>=0||this.resolvePad()};onGamepadDisconnected=e=>{e.gamepad.index===this.activeIndex&&this.releasePad()}}const za=Object.freeze({stickTravelPx:84,stickDeadZonePx:5,stickCurve:1.35});function Nl(i,e){return i===void 0||!Number.isFinite(i)||i<=0?e:i}function Vd(i,e,t,n){if(!Number.isFinite(i))return 0;const s=Math.abs(i);if(!(s>t))return 0;const r=Math.max(1,e-t),a=Math.min(1,(s-t)/r),o=n===1?a:Math.pow(a,n);return i<0?-o:o}class kw{state;options;stickTravelPx;stickDeadZonePx;stickCurve;enabled=!1;stickPointer=null;stickOriginX=0;stickOriginY=0;throttleValue=0;steerValue=0;buttonPointers=new Map;constructor(e,t){this.state=e,this.options=t,this.stickTravelPx=Nl(t.stickTravelPx,za.stickTravelPx),this.stickDeadZonePx=Nl(t.stickDeadZonePx,za.stickDeadZonePx),this.stickCurve=t.stickCurve!==void 0&&Number.isFinite(t.stickCurve)&&t.stickCurve>0?t.stickCurve:za.stickCurve}get throttle(){return this.throttleValue}get steer(){return this.steerValue}get active(){return this.enabled}setEnabled(e){this.enabled!==e&&(this.enabled=e,e||this.reset())}setScale(e){const t=Number.isFinite(e)&&e>0?e:1;this.stickTravelPx=Nl(this.options.stickTravelPx,za.stickTravelPx)*t}stickStart(e,t,n){return!this.enabled||this.stickPointer!==null?!1:(this.stickPointer=e,this.stickOriginX=t,this.stickOriginY=n,this.writeStick(0,0),!0)}stickMove(e,t,n){if(!this.enabled||this.stickPointer!==e)return;const s=Vd(t-this.stickOriginX,this.stickTravelPx,this.stickDeadZonePx,this.stickCurve),r=Vd(this.stickOriginY-n,this.stickTravelPx,this.stickDeadZonePx,this.stickCurve);this.writeStick(r,s)}stickEnd(e){return this.stickPointer!==e?!1:(this.stickPointer=null,this.writeStick(0,0),!0)}buttonDown(e,t){return!this.enabled||e==="stick"||this.buttonPointers.has(e)?!1:(this.buttonPointers.set(e,t),e==="crouch"?this.state.setHeld("crouch",!0,"touch"):this.state.press("hop",this.options.now()),!0)}buttonUp(e,t){this.buttonPointers.get(e)===t&&(this.buttonPointers.delete(e),e==="crouch"&&this.state.setHeld("crouch",!1,"touch"))}releasePointer(e){for(const[t,n]of this.buttonPointers)if(n===e)return this.buttonUp(t,e),t;return this.stickEnd(e)?"stick":null}tap(e){this.enabled&&this.state.press(e,this.options.now())}reset(){this.stickPointer=null,this.buttonPointers.clear(),this.writeStick(0,0),this.state.clearDevice("touch")}dispose(){this.reset()}writeStick(e,t){this.state.setAxes("touch",e,t),!(e===this.throttleValue&&t===this.steerValue)&&(this.throttleValue=e,this.steerValue=t,this.options.onStickChange?.(e,t))}}const Fw=new Set(["crouch","hop"]),Uw=`
<div class="euc-touch__layer">
  <div class="euc-touch__stick" data-touch-stick data-active="false" aria-hidden="true">
    <span class="euc-touch__stick-hint euc-touch__stick-hint--left"></span>
    <span class="euc-touch__stick-hint euc-touch__stick-hint--right"></span>
    <span class="euc-touch__stick-hint euc-touch__stick-hint--up"></span>
    <span class="euc-touch__stick-hint euc-touch__stick-hint--down"></span>
    <span class="euc-touch__knob"></span>
  </div>
</div>

<div class="euc-touch__zone euc-touch__zone--stick" data-touch="stick"
     aria-label="Ride stick: push up to accelerate, down to brake or reverse, and sideways to carve"></div>

<div class="euc-touch__actions">
  <button type="button" class="euc-touch__button euc-touch__button--hop" data-touch="hop"
          aria-label="Hop, like Space on a keyboard">
    <span class="euc-touch__glyph" aria-hidden="true">HOP</span>
  </button>
  <button type="button" class="euc-touch__button euc-touch__button--crouch" data-touch="crouch"
          aria-label="Crouch and charge a bigger hop, like Shift on a keyboard">
    <span class="euc-touch__glyph" aria-hidden="true">CHARGE</span>
  </button>
</div>

<div class="euc-touch__system">
  <button type="button" class="euc-touch__chip" data-touch-tap="pause" aria-label="Pause">II</button>
  <button type="button" class="euc-touch__chip" data-touch-tap="reset"
          aria-label="Quick reset back to the start">RESET</button>
  <button type="button" class="euc-touch__chip" data-touch-tap="cameraCycle"
          aria-label="Change camera view">VIEW</button>
</div>
`;class Nw{root;stick;input;options;active=!1;sawTouch=!1;pressedElements=new Map;constructor(e){this.options=e,this.input=e.input;const t=document.createElement("div");t.className="euc-touch euc-ui",t.hidden=!0,t.dataset.side="right",t.innerHTML=Uw,t.addEventListener("pointerdown",this.onPointerDown),t.addEventListener("contextmenu",this.onContextMenu),t.addEventListener("click",this.onClick),window.addEventListener("pointermove",this.onPointerMove,{passive:!0}),window.addEventListener("pointerup",this.onPointerUp,{passive:!0}),window.addEventListener("pointercancel",this.onPointerCancel,{passive:!0}),window.addEventListener("lostpointercapture",this.onLostPointerCapture,{passive:!0}),window.addEventListener("blur",this.onBlur),document.addEventListener("visibilitychange",this.onVisibilityChange),window.addEventListener("pointerdown",this.onWindowPointerDown,{passive:!0,capture:!0}),(e.parent??document.body).appendChild(t),this.root=t,this.stick=t.querySelector("[data-touch-stick]")}get visible(){return this.active}get touchSeen(){return this.sawTouch}setActive(e){this.active!==e&&(this.active=e,this.root.hidden=!e,this.input.setEnabled(e),e||this.reset())}reset(){this.input.reset(),this.releaseStick();for(const e of this.pressedElements.values())e.removeAttribute("data-pressed");this.pressedElements.clear()}setSwapSides(e){this.root.dataset.side=e?"left":"right"}setScale(e){const t=Number.isFinite(e)&&e>0?e:1;this.root.style.setProperty("--euc-touch-scale",String(t))}showStick(e,t){this.root.style.setProperty("--euc-touch-throttle",String(e)),this.root.style.setProperty("--euc-touch-steer",String(t))}dispose(){this.root.removeEventListener("pointerdown",this.onPointerDown),this.root.removeEventListener("contextmenu",this.onContextMenu),this.root.removeEventListener("click",this.onClick),window.removeEventListener("pointermove",this.onPointerMove),window.removeEventListener("pointerup",this.onPointerUp),window.removeEventListener("pointercancel",this.onPointerCancel),window.removeEventListener("lostpointercapture",this.onLostPointerCapture),window.removeEventListener("blur",this.onBlur),document.removeEventListener("visibilitychange",this.onVisibilityChange),window.removeEventListener("pointerdown",this.onWindowPointerDown,{capture:!0}),this.pressedElements.clear(),this.root.remove()}onWindowPointerDown=e=>{this.sawTouch||e.pointerType!=="touch"||(this.sawTouch=!0,this.options.onFirstTouch?.())};onPointerDown=e=>{const t=this.elementFor(e.target);if(t===null)return;const n=t.dataset.touch;e.preventDefault();let s=!1;if(n==="stick"?e.pointerType!=="mouse"&&(s=this.input.stickStart(e.pointerId,e.clientX,e.clientY),s&&this.anchorStick(e.clientX,e.clientY)):Fw.has(n)&&(s=this.input.buttonDown(n,e.pointerId),s&&(t.setAttribute("data-pressed","true"),this.pressedElements.set(e.pointerId,t))),!!s)try{t.setPointerCapture(e.pointerId)}catch{}};onPointerMove=e=>{this.input.stickMove(e.pointerId,e.clientX,e.clientY)};onPointerUp=e=>{this.endPointer(e.pointerId)};onPointerCancel=e=>{this.endPointer(e.pointerId)};onLostPointerCapture=e=>{this.endPointer(e.pointerId)};onBlur=()=>{this.reset()};onVisibilityChange=()=>{document.visibilityState==="hidden"&&this.reset()};endPointer(e){const t=this.input.releasePointer(e);if(t===null)return;if(t==="stick"){this.releaseStick();return}const n=this.pressedElements.get(e);n!==void 0&&(n.removeAttribute("data-pressed"),this.pressedElements.delete(e))}onClick=e=>{const t=e.target;if(!(t instanceof HTMLElement))return;const n=t.closest("[data-touch-tap]")?.dataset.touchTap;n==="pause"?this.input.tap("pause"):n==="reset"?this.input.tap("reset"):n==="cameraCycle"&&this.input.tap("cameraCycle")};onContextMenu=e=>{e.preventDefault()};anchorStick(e,t){this.root.style.setProperty("--euc-touch-x",String(Math.round(e))),this.root.style.setProperty("--euc-touch-y",String(Math.round(t))),this.stick.dataset.active="true"}releaseStick(){this.stick.dataset.active="false",this.root.style.setProperty("--euc-touch-throttle","0"),this.root.style.setProperty("--euc-touch-steer","0")}elementFor(e){return e instanceof HTMLElement?e.closest("[data-touch]"):null}}const Ow=8,Wd=256,zw=.5,Bw=8,Hw=512;class Xd{colliders;field;surround;maxX;maxZ;gridOriginX;gridOriginZ;gridCell;gridColumns;gridRows;gridStarts;gridItems;stamps;stamp=0;constructor(e){this.colliders=[...e.segments.flatMap(h=>h.colliders),...e.solids??[]].map(h=>{const f=Math.cos(h.rotationY),m=Math.sin(h.rotationY),v=Math.abs(f)*h.halfExtents.x+Math.abs(m)*h.halfExtents.z,p=Math.abs(m)*h.halfExtents.x+Math.abs(f)*h.halfExtents.z;return{collider:h,cos:f,sin:m,minX:h.centre.x-v,maxX:h.centre.x+v,minZ:h.centre.z-p,maxZ:h.centre.z+p,occludes:h.occludes!==!1}}),this.field=e.heightfield,this.surround=e.surround,this.maxX=this.field.originX+(this.field.columns-1)*this.field.spacing,this.maxZ=this.field.originZ+(this.field.rows-1)*this.field.spacing;let t=1/0,n=-1/0,s=1/0,r=-1/0;for(const h of this.colliders)h.minX<t&&(t=h.minX),h.maxX>n&&(n=h.maxX),h.minZ<s&&(s=h.minZ),h.maxZ>r&&(r=h.maxZ);this.colliders.length===0&&(t=0,n=0,s=0,r=0);const a=Math.max(n-t,1e-6),o=Math.max(r-s,1e-6);this.gridCell=Math.max(Ow,a/Wd,o/Wd),this.gridOriginX=t,this.gridOriginZ=s,this.gridColumns=Math.max(1,Math.ceil(a/this.gridCell)),this.gridRows=Math.max(1,Math.ceil(o/this.gridCell));const l=this.gridColumns*this.gridRows,c=new Int32Array(l);let u=0;for(const h of this.colliders)u+=this.eachCell(h,f=>{c[f]+=1});this.gridStarts=new Int32Array(l+1);for(let h=0;h<l;h+=1)this.gridStarts[h+1]=this.gridStarts[h]+c[h];this.gridItems=new Int32Array(u);const d=Int32Array.from(this.gridStarts.subarray(0,l));for(let h=0;h<this.colliders.length;h+=1)this.eachCell(this.colliders[h],f=>{this.gridItems[d[f]]=h,d[f]+=1});this.stamps=new Int32Array(this.colliders.length)}get colliderCount(){return this.colliders.length}sampleGround(e,t,n){this.sampleField(e,t,n);const s=this.cellAt(e,t),r=this.gridStarts[s+1];for(let a=this.gridStarts[s];a<r;a+=1){const{collider:o,cos:l,sin:c}=this.colliders[this.gridItems[a]],u=e-o.centre.x,d=t-o.centre.z,h=l*u-c*d,f=c*u+l*d;if(Math.abs(h)>o.halfExtents.x||Math.abs(f)>o.halfExtents.z)continue;const m=o.centre.y+o.halfExtents.y;m<=n.height||(n.height=m,n.surface=o.surface,n.normal.x=0,n.normal.y=1,n.normal.z=0,n.offCourse=!1)}return n}eachCell(e,t){const n=this.columnAt(e.minX),s=this.columnAt(e.maxX),r=this.rowAt(e.minZ),a=this.rowAt(e.maxZ);let o=0;for(let l=r;l<=a;l+=1)for(let c=n;c<=s;c+=1)t(l*this.gridColumns+c),o+=1;return o}columnAt(e){const t=Math.floor((e-this.gridOriginX)/this.gridCell);return t<0?0:t>=this.gridColumns?this.gridColumns-1:t}rowAt(e){const t=Math.floor((e-this.gridOriginZ)/this.gridCell);return t<0?0:t>=this.gridRows?this.gridRows-1:t}cellAt(e,t){return this.rowAt(t)*this.gridColumns+this.columnAt(e)}raycast(e,t,n){const s=Math.hypot(t.x,t.y,t.z);if(s===0||!(n>0)||!Number.isFinite(n))return null;const r=t.x/s,a=t.y/s,o=t.z/s;let l=this.raycastTerrain(e,r,a,o,n);const c=this.raycastPreparedBoxes(e,r,a,o,n,!0);return c!==null&&(l===null||c<l)&&(l=c),l}raycastObstacle(e,t,n){const s=Math.hypot(t.x,t.y,t.z);return s===0||!(n>0)||!Number.isFinite(n)?null:this.raycastPreparedBoxes(e,t.x/s,t.y/s,t.z/s,n,!1)}raycastPreparedBoxes(e,t,n,s,r,a){const o=e.x+t*r,l=e.z+s*r,c=this.columnAt(Math.min(e.x,o)),u=this.columnAt(Math.max(e.x,o)),d=this.rowAt(Math.min(e.z,l)),h=this.rowAt(Math.max(e.z,l));this.stamp+=1;const f=this.stamp;let m=null;for(let v=d;v<=h;v+=1){const p=v*this.gridColumns;for(let b=c;b<=u;b+=1){const M=p+b,T=this.gridStarts[M+1];for(let x=this.gridStarts[M];x<T;x+=1){const A=this.gridItems[x];if(this.stamps[A]===f)continue;this.stamps[A]=f;const y=this.colliders[A];if(a&&!y.occludes)continue;const E=Gw(e,t,n,s,y,r);E!==null&&(m===null||E<m)&&(m=E)}}}return m}sampleField(e,t,n){const s=this.field;if(e<s.originX||e>this.maxX||t<s.originZ||t>this.maxZ){n.height=this.surround.height,n.surface=this.surround.surface,n.normal.x=0,n.normal.y=1,n.normal.z=0,n.offCourse=!0;return}const r=(e-s.originX)/s.spacing,a=(t-s.originZ)/s.spacing,o=Math.min(s.columns-2,Math.max(0,Math.floor(r))),l=Math.min(s.rows-2,Math.max(0,Math.floor(a))),c=r-o,u=a-l,d=l*s.columns+o,h=s.heights[d],f=s.heights[d+1],m=s.heights[d+s.columns],v=s.heights[d+s.columns+1];let p,b,M;u<c?(p=f-h,b=v-f,M=h+p*c+b*u):(p=v-m,b=m-h,M=h+p*c+b*u);const T=p===0?0:-p/s.spacing,x=b===0?0:-b/s.spacing,A=1/Math.hypot(T,1,x);n.height=M,n.normal.x=T===0?0:T*A,n.normal.y=A,n.normal.z=x===0?0:x*A,n.surface=s.surfaces[l*(s.columns-1)+o],n.offCourse=!1}heightAt(e,t){const n=this.field;if(e<n.originX||e>this.maxX||t<n.originZ||t>this.maxZ)return this.surround.height;const s=(e-n.originX)/n.spacing,r=(t-n.originZ)/n.spacing,a=Math.min(n.columns-2,Math.max(0,Math.floor(s))),o=Math.min(n.rows-2,Math.max(0,Math.floor(r))),l=s-a,c=r-o,u=o*n.columns+a,d=n.heights[u];if(c<l){const m=n.heights[u+1],v=n.heights[u+n.columns+1];return d+(m-d)*l+(v-m)*c}const h=n.heights[u+n.columns],f=n.heights[u+n.columns+1];return d+(f-h)*l+(h-d)*c}raycastTerrain(e,t,n,s,r){if(e.y<=this.heightAt(e.x,e.z))return 0;const a=Math.max(this.field.spacing*zw,r/Hw);let o=0;for(let l=a;;l+=a){const c=Math.min(l,r),u=this.heightAt(e.x+t*c,e.z+s*c);if(e.y+n*c<=u){let d=o,h=c;for(let f=0;f<Bw;f+=1){const m=(d+h)/2,v=this.heightAt(e.x+t*m,e.z+s*m);e.y+n*m<=v?h=m:d=m}return h}if(c>=r)return null;o=c}}}function Gw(i,e,t,n,s,r){const{collider:a,cos:o,sin:l}=s,{centre:c,halfExtents:u}=a,d=i.x-c.x,h=i.z-c.z,f=o*d-l*h,m=l*d+o*h,v=i.y-c.y,p=o*e-l*n,b=l*e+o*n;let M=0,T=r;const x=[[f,p,u.x],[v,t,u.y],[m,b,u.z]];for(const[A,y,E]of x){if(y===0){if(A<-E||A>E)return null;continue}const g=1/y;let _=(-E-A)*g,R=(E-A)*g;if(_>R&&([_,R]=[R,_]),_>M&&(M=_),R<T&&(T=R),M>T)return null}return M}function Vw(i){return new Set(i.heightfield.surfaces)}function Ww(i,e,t){return Number.isNaN(i)||i<e?e:i>t?t:i}function Dt(i){return Ww(i,0,1)}function xn(i,e,t){return i+(e-i)*t}function zt(i,e,t,n){return n<=0?i:t<=0?e:i+(e-i)*(1-Math.exp(-n/t))}function Yd(i,e,t,n,s){if(t===e)return n;const r=Dt((i-e)/(t-e));return n+(s-n)*r}function qd(i){const e=Dt(i);return e*e}function Ol(i,e,t=!1){return t?0:qd(i.master)*qd(i[e])}function $d(i,e,t,n,s){const r=Dt(e),a=r>i?t:n;return Dt(zt(i,r,a,s))}function Zd(i){return 1-Dt(i)}function Xw(i,e){return e<=0?0:Math.abs(i)/(2*Math.PI*e)}function Yw(){return{speed:0,throttle:0,load:0,powerStage:"normal",surface:"pavement",grounded:!0,suspensionSpeed:0,scrape:0,wobble:0,crashed:!1,idle:!1}}function Kd(){return{voiceId:"",gain:0,centreHz:1e3,q:1,lowHz:200,lowGain:0,sampleGain:0,tokoGain:0,sampleRate:1,tokoRate:0}}function qw(){return{bedGain:0,duck:0,crashDuck:0,motorHz:N.motorIdleHz,motorDriveGain:0,motorSingHz:N.motorIdleHz*N.motorSingHarmonic,motorSingGain:0,motorAirHz:N.motorIdleHz*N.motorAirHarmonic,motorAirGain:0,motorCutoffHz:N.motorCutoffAtRest,motorQ:N.motorFilterQ,regenHz:N.motorIdleHz*N.regenHarmonic,regenGain:0,windGain:0,windCutoffHz:N.windCutoffAtRest,tyre:[Kd(),Kd()],tyreActive:0,scrapeGain:0,scrapeCentreHz:N.scrapeCentreHz,scrapeRingHz:N.scrapeRingHz,scrapeRingGain:0,wobbleHz:N.wobbleToneLowHz,wobbleGain:0}}function $w(){return{kind:"hop",bus:"sfx",gain:0,delaySeconds:0,thumpFromHz:0,thumpToHz:0,thumpSeconds:0,noiseHz:0,noiseQ:1,noiseSeconds:0,toneHz:0,toneSeconds:0}}const Qd=8;function Zw(){return{bedTrim:N.bedTrim,motorPolePairs:N.motorPolePairs,motorIdleLevel:N.motorIdleLevel,motorLoadLevel:N.motorLoadLevel,motorSingLevel:N.motorSingLevel,motorAirLevel:N.motorAirLevel,motorLoadBrighten:N.motorLoadBrighten,regenLevel:N.regenLevel,windLevel:N.windLevel,tyreLevel:N.tyreLevel,beepLevel:N.beepLevel,tiltBackLevel:N.tiltBackLevel,duckTiltBack:N.duckTiltBack}}const Kw=it.tyreDiameter*.5;class Qw{frame=qw();cues=Array.from({length:Qd},$w);cueCount=0;tuning=Zw();slotVoice=["",""];slotEnvelope=[0,0];slotCorrection=[1,1];activeSlot=0;currentSurface="";beepStage="normal";beepTimer=0;beepDuckHold=0;duck=0;crashDuck=0;transientDuck=0;crashedBed=1;idleGain=0;wasCrashed=!1;crashing=!1;impactHold=0;lastImpactScale=0;motorHz=N.motorIdleHz;motorGain=0;singGain=0;airGain=0;motorCutoff=N.motorCutoffAtRest;motorQ=N.motorFilterQ;regenGain=0;windGain=0;windCutoff=N.windCutoffAtRest;tyreSpeedGain=0;tyreGrain=0;scrapeGain=0;wobbleGain=0;wobbleHz=N.wobbleToneLowHz;setTuning(e){this.tuning={...this.tuning,...e}}reset(){this.slotVoice[0]="",this.slotVoice[1]="",this.slotEnvelope[0]=0,this.slotEnvelope[1]=0,this.slotCorrection[0]=1,this.slotCorrection[1]=1,this.activeSlot=0,this.currentSurface="",this.beepStage="normal",this.beepTimer=0,this.beepDuckHold=0,this.duck=0,this.crashDuck=0,this.transientDuck=0,this.crashedBed=1,this.wasCrashed=!1,this.crashing=!1,this.impactHold=0,this.lastImpactScale=0,this.motorHz=N.motorIdleHz,this.motorGain=0,this.singGain=0,this.airGain=0,this.motorCutoff=N.motorCutoffAtRest,this.motorQ=N.motorFilterQ,this.regenGain=0,this.windGain=0,this.windCutoff=N.windCutoffAtRest,this.tyreSpeedGain=0,this.tyreGrain=0,this.scrapeGain=0,this.wobbleGain=0,this.wobbleHz=N.wobbleToneLowHz,this.cueCount=0}update(e,t){const n=e>0?e:0;return this.updateTyreSlots(n,t),this.updateMotor(n,t),this.updateWind(n,t),this.updateScrape(n,t),this.updateWobble(n,t),this.updateWarnings(n,t),this.updateBed(n,t),this.impactHold=Math.max(0,this.impactHold-n),this.frame}clearCues(){this.cueCount=0}hop(e){const t=this.claimCue();t&&(t.kind="hop",t.bus="sfx",t.gain=N.hopLevel*xn(.7,1,Dt(e)),t.delaySeconds=0,t.thumpFromHz=N.hopThumpFromHz,t.thumpToHz=N.hopThumpToHz,t.thumpSeconds=N.hopThumpSeconds,t.noiseHz=N.hopNoiseHz,t.noiseQ=1.1,t.noiseSeconds=N.hopNoiseSeconds,t.toneHz=0,t.toneSeconds=0,this.demandTransientDuck(N.duckHop))}landing(e,t){const n=this.claimCue();if(!n)return;const s=xn(N.landingMinScale,1,Dt(e)),r=Jw(t);n.kind="landing",n.bus="sfx",n.gain=N.landingLevel*s,n.delaySeconds=0,n.thumpFromHz=N.landingThumpFromHz,n.thumpToHz=N.landingThumpToHz,n.thumpSeconds=N.landingThumpSeconds,n.noiseHz=r.centreHz,n.noiseQ=r.q,n.noiseSeconds=N.landingNoiseSeconds,n.toneHz=0,n.toneSeconds=0,this.demandTransientDuck(N.duckLanding*Dt(e))}impact(e){const t=Dt(e/N.curbImpactReference);if(t<=.02||this.crashing||this.impactHold>0&&t<this.lastImpactScale*1.5)return;const n=this.claimCue();n&&(this.impactHold=N.impactRetriggerSeconds,this.lastImpactScale=t,n.kind="curb",n.bus="sfx",n.gain=N.curbLevel*t,n.delaySeconds=0,n.thumpFromHz=N.curbThumpFromHz,n.thumpToHz=N.curbThumpToHz,n.thumpSeconds=N.curbThumpSeconds,n.noiseHz=N.curbNoiseHz,n.noiseQ=1.4,n.noiseSeconds=N.curbNoiseSeconds,n.toneHz=0,n.toneSeconds=0,this.demandTransientDuck(N.duckCurb*t))}crash(e){const t=this.claimCue();if(!t)return;const n=xn(.55,1,Dt(Math.abs(e)/N.speedReference));t.kind="crash",t.bus="sfx",t.gain=N.crashLevel*n,t.delaySeconds=0,t.thumpFromHz=N.crashThumpFromHz,t.thumpToHz=N.crashThumpToHz,t.thumpSeconds=N.crashThumpSeconds,t.noiseHz=N.crashNoiseHz,t.noiseQ=.5,t.noiseSeconds=N.crashNoiseSeconds,t.toneHz=0,t.toneSeconds=0,this.crashing=!0,this.crashDuck=Math.max(this.crashDuck,N.duckCrash)}recover(){for(let e=0;e<2;e+=1){const t=this.claimCue();if(!t)return;t.kind="recover",t.bus="ui",t.gain=N.recoverLevel,t.delaySeconds=e*N.recoverSeconds*.55,t.thumpFromHz=0,t.thumpToHz=0,t.thumpSeconds=0,t.noiseHz=0,t.noiseQ=1,t.noiseSeconds=0,t.toneHz=e===0?N.recoverLowHz:N.recoverHighHz,t.toneSeconds=N.recoverSeconds}}claimCue(){if(this.cueCount>=Qd)return null;const e=this.cues[this.cueCount];return this.cueCount+=1,e}demandTransientDuck(e){this.transientDuck=Math.max(this.transientDuck,Dt(e))}updateTyreSlots(e,t){if(t.surface!==this.currentSurface){const o=Sh(t.surface).tyreAudio;if(this.currentSurface==="")this.activeSlot=0,this.slotVoice[0]=o,this.slotVoice[1]="";else{const l=this.slotEnvelope[0]<=this.slotEnvelope[1]?0:1,c=this.slotVoice[l];if(c!==""&&this.slotEnvelope[l]>1e-4){const u=Jd(c)*this.slotCorrection[l],d=Jd(o);this.slotCorrection[l]=Math.min(25,Math.max(.04,u/d))}else this.slotCorrection[l]=1;this.slotVoice[l]=o,this.activeSlot=l}this.currentSurface=t.surface}this.slotEnvelope[0]=zt(this.slotEnvelope[0],this.activeSlot===0&&this.slotVoice[0]!==""?1:0,N.tyreCrossfadeSeconds,e),this.slotEnvelope[1]=zt(this.slotEnvelope[1],this.activeSlot===1&&this.slotVoice[1]!==""?1:0,N.tyreCrossfadeSeconds,e),this.slotCorrection[0]=zt(this.slotCorrection[0],1,N.tyreCrossfadeSeconds*.5,e),this.slotCorrection[1]=zt(this.slotCorrection[1],1,N.tyreCrossfadeSeconds*.5,e);const n=t.grounded?Yd(Math.abs(t.speed),0,N.tyreReferenceSpeed,N.tyreStandstillLevel,1):0;this.tyreSpeedGain=zt(this.tyreSpeedGain,n,N.tyreResponseSeconds,e);const s=t.grounded?Dt(Math.abs(t.suspensionSpeed)/N.tyreGrainReference):0;this.tyreGrain=zt(this.tyreGrain,s,N.tyreResponseSeconds*2,e),this.frame.tyreActive=this.activeSlot;const r=Math.hypot(this.slotEnvelope[0],this.slotEnvelope[1]),a=Dt(Math.abs(t.speed)/N.speedReference);this.resolveTyreSlot(0,r,a),this.resolveTyreSlot(1,r,a)}resolveTyreSlot(e,t,n){const s=this.frame.tyre[e],r=this.slotVoice[e];if(s.voiceId=r,r===""){s.gain=0,s.sampleGain=0,s.tokoGain=0;return}const a=N.tyreVoices[r]??N.tyreVoices["tyre-smooth"],o=t>1e-4?this.slotEnvelope[e]/t:0,l=1+a.grain*N.tyreGrainGain*this.tyreGrain,c=this.tuning.tyreLevel*a.level*this.tyreSpeedGain*l*o*this.slotCorrection[e];s.gain=c*(1-a.sample-a.toko),s.sampleGain=c*a.sample*N.tyreSampleTrim,s.tokoGain=c*a.toko*N.tokoSampleTrim,s.sampleRate=a.sampleRate*xn(N.tyreSampleRateAtRest,N.tyreSampleRateAtSpeed,n),s.tokoRate=n*N.speedReference/N.tyreReferenceSpeed,s.centreHz=a.centreHz*xn(1,N.tyreCutoffRise,n),s.q=a.q,s.lowHz=a.lowHz,s.lowGain=a.lowLevel}updateMotor(e,t){const n=this.tuning,s=this.frame,r=t.grounded?1:N.airSpinFactor,a=Math.min(N.motorMaxHz,Math.max(N.motorIdleHz,Xw(t.speed,Kw)*n.motorPolePairs*r));this.motorHz=zt(this.motorHz,a,N.motorResponseSeconds,e);const o=Math.max(t.throttle>0?t.throttle:0,Dt(t.load)),l=t.grounded?1:N.airDriveFactor,c=(n.motorIdleLevel+n.motorLoadLevel*o)*l;this.motorGain=zt(this.motorGain,c,N.motorResponseSeconds,e);const u=Dt(Math.abs(t.speed)/N.speedReference);this.singGain=zt(this.singGain,n.motorSingLevel*xn(N.motorSingIdleShare,1,u**N.motorSingCurve),N.motorResponseSeconds,e),this.airGain=zt(this.airGain,n.motorAirLevel*u**N.motorAirCurve,N.motorResponseSeconds,e);const d=t.throttle<0&&Math.abs(t.speed)>.5?-t.throttle:0,h=xn(N.motorCutoffAtRest,N.motorCutoffAtSpeed,u)*xn(1,n.motorLoadBrighten,o)*xn(1,N.regenCutoffFactor,d);this.motorCutoff=zt(this.motorCutoff,h,N.motorResponseSeconds,e),this.motorQ=zt(this.motorQ,xn(N.motorFilterQ,N.regenResonance,d),N.regenResponseSeconds,e),s.motorHz=this.motorHz,s.motorDriveGain=this.motorGain,s.motorSingHz=this.motorHz*N.motorSingHarmonic,s.motorSingGain=this.singGain,s.motorAirHz=this.motorHz*N.motorAirHarmonic,s.motorAirGain=this.airGain,s.motorCutoffHz=this.motorCutoff,s.motorQ=this.motorQ,this.regenGain=zt(this.regenGain,n.regenLevel*d*xn(.4,1,u),N.regenResponseSeconds,e),s.regenHz=this.motorHz*N.regenHarmonic,s.regenGain=this.regenGain}updateWind(e,t){const n=this.tuning,s=Yd(Math.abs(t.speed),N.windOnsetSpeed,N.speedReference,0,1),r=t.grounded?1:N.windAirBoost;this.windGain=zt(this.windGain,n.windLevel*s**N.windExponent*r,N.windResponseSeconds,e),this.windCutoff=zt(this.windCutoff,xn(N.windCutoffAtRest,N.windCutoffAtSpeed,s),N.windResponseSeconds,e),this.frame.windGain=this.windGain,this.frame.windCutoffHz=this.windCutoff}updateScrape(e,t){const n=Dt(Math.abs(t.scrape)/N.scrapeFullOverlap),s=Dt(Math.abs(t.speed)/N.scrapeReferenceSpeed),r=t.grounded?N.scrapeLevel*n*s:0;this.scrapeGain=zt(this.scrapeGain,r,N.scrapeResponseSeconds,e),this.frame.scrapeGain=this.scrapeGain,this.frame.scrapeCentreHz=N.scrapeCentreHz,this.frame.scrapeRingHz=N.scrapeRingHz,this.frame.scrapeRingGain=this.scrapeGain*N.scrapeRingLevel}updateWobble(e,t){const n=Dt(t.wobble);this.wobbleGain=zt(this.wobbleGain,N.wobbleToneLevel*n,N.wobbleToneResponseSeconds,e),this.wobbleHz=zt(this.wobbleHz,xn(N.wobbleToneLowHz,N.wobbleToneHighHz,n),N.wobbleToneResponseSeconds,e),this.frame.wobbleGain=this.wobbleGain,this.frame.wobbleHz=this.wobbleHz}updateWarnings(e,t){const n=this.beepPattern(t.powerStage);if(t.powerStage!==this.beepStage&&(this.beepStage=t.powerStage,this.beepTimer=0),n===null||t.idle||t.crashed){this.beepTimer=0,this.beepDuckHold=Math.max(0,this.beepDuckHold-e);return}this.beepTimer-=e,this.beepTimer<=0&&(this.beepTimer+=n.periodSeconds,this.beepTimer<=0&&(this.beepTimer=n.periodSeconds),this.emitBeep(n,0),n.double&&this.emitBeep(n,N.beepDoubleGapSeconds),this.beepDuckHold=N.beepSeconds*2.2+(n.double?N.beepDoubleGapSeconds:0)),this.beepDuckHold=Math.max(0,this.beepDuckHold-e)}emitBeep(e,t){const n=this.claimCue();n&&(n.kind="beep",n.bus="ui",n.gain=e.level,n.delaySeconds=t,n.thumpFromHz=0,n.thumpToHz=0,n.thumpSeconds=0,n.noiseHz=0,n.noiseQ=1,n.noiseSeconds=0,n.toneHz=e.hz,n.toneSeconds=N.beepSeconds)}beepPattern(e){const t=this.tuning.beepLevel;if(t<=0)return null;switch(e){case"notice":return{hz:N.noticeHz,periodSeconds:N.noticePeriodSeconds,level:N.noticeLevel*t,duck:N.duckNotice,double:!1};case"warn":return{hz:N.warnHz,periodSeconds:N.warnPeriodSeconds,level:N.warnLevel*t,duck:N.duckWarn,double:!0};case"tiltBack":return{hz:N.tiltBackHz,periodSeconds:N.tiltBackPeriodSeconds,level:this.tuning.tiltBackLevel*t,duck:this.tuning.duckTiltBack,double:!1};default:return null}}updateBed(e,t){const n=this.beepPattern(t.powerStage),s=n!==null&&this.beepDuckHold>0?n.duck:0;this.transientDuck=Math.max(0,this.transientDuck-e/Math.max(1e-6,N.duckReleaseSeconds)),this.duck=$d(this.duck,Math.max(s,this.transientDuck),N.duckAttackSeconds,N.duckReleaseSeconds,e),this.crashDuck=$d(this.crashDuck,0,N.duckAttackSeconds,N.duckCrashReleaseSeconds,e),this.crashedBed=zt(this.crashedBed,t.crashed?N.crashedBedGain:1,N.crashedBedSeconds,e),this.idleGain=zt(this.idleGain,t.idle?0:1,.05,e),this.wasCrashed&&!t.crashed&&this.recover(),this.wasCrashed=t.crashed,this.crashing=t.crashed,this.frame.duck=this.duck,this.frame.crashDuck=this.crashDuck,this.frame.bedGain=this.tuning.bedTrim*Zd(this.duck)*Zd(this.crashDuck)*this.crashedBed*this.idleGain}}function Jw(i){const e=Sh(i).tyreAudio;return N.tyreVoices[e]??N.tyreVoices["tyre-smooth"]}function Jd(i){const e=N.tyreVoices[i]??N.tyreVoices["tyre-smooth"];return e.level*(1-e.sample-e.toko+e.sample*N.tyreSampleTrim+e.toko*N.tokoSampleTrim)}const jw=3;function eE(i){let e=(i|0)===0?2654435769:i|0;return()=>(e^=e<<13,e^=e>>>17,e^=e<<5,(e>>>0)/2147483648-1)}function tE(){return{b0:0,b1:0,b2:0,b3:0,b4:0,b5:0,b6:0}}function nE(i,e){i.b0=.99886*i.b0+e*.0555179,i.b1=.99332*i.b1+e*.0750759,i.b2=.969*i.b2+e*.153852,i.b3=.8665*i.b3+e*.3104856,i.b4=.55*i.b4+e*.5329522,i.b5=-.7616*i.b5-e*.016898;const t=i.b0+i.b1+i.b2+i.b3+i.b4+i.b5+i.b6+e*.5362;return i.b6=e*.115926,t*.11}function jd(i,e,t="white"){const n=i.length;if(n===0)return;const s=Math.min(2048,Math.max(1,Math.floor(n/8))),r=eE(e),a=tE(),o=new Float32Array(n+s);for(let l=0;l<o.length;l+=1){const c=r();o[l]=t==="pink"?nE(a,c):c}for(let l=0;l<n;l+=1)i[l]=o[l];for(let l=0;l<s;l+=1){const c=l/s;i[l]=o[n+l]*(1-c)+o[l]*c}iE(i)}function iE(i){let e=0;for(let n=0;n<i.length;n+=1){const s=Math.abs(i[n]);s>e&&(e=s)}if(e<=1e-9)return;const t=1/e;for(let n=0;n<i.length;n+=1)i[n]*=t}const sE=24,qi=1e-4;class rE{context;permanent=[];permanentSources=[];voices=new Set;droppedVoices=0;master;limiter;sfxBus;uiBus;musicBus;bed;transientTrim;motorDrive;motorSing;motorAir;regen;motorFilter;windFilter;windGain;windNoise;tyre;bank=null;crashIndex=0;crashSamplePlays=0;scrapeFilter;scrapeGain;scrapeRingLow;scrapeRingGain;wobble;whiteBuffer;pinkBuffer;burstIndex=0;analyser=null;analyserData=null;spectrumData=null;disposed=!1;constructor(e){this.context=e;const t=e.sampleRate,n=Math.max(1,Math.floor(t*jw));this.whiteBuffer=e.createBuffer(1,n,t),jd(this.whiteBuffer.getChannelData(0),24301,"white"),this.pinkBuffer=e.createBuffer(1,n,t),jd(this.pinkBuffer.getChannelData(0),12648430,"pink"),this.limiter=this.keep(e.createDynamicsCompressor()),this.limiter.threshold.value=N.limiterThresholdDb,this.limiter.knee.value=N.limiterKneeDb,this.limiter.ratio.value=N.limiterRatio,this.limiter.attack.value=N.limiterAttackSeconds,this.limiter.release.value=N.limiterReleaseSeconds,this.limiter.connect(e.destination),this.master=this.keep(e.createGain()),this.master.gain.value=1,this.master.connect(this.limiter),this.sfxBus=this.keep(e.createGain()),this.uiBus=this.keep(e.createGain()),this.musicBus=this.keep(e.createGain()),this.sfxBus.connect(this.master),this.uiBus.connect(this.master),this.musicBus.connect(this.master),this.bed=this.keep(e.createGain()),this.bed.gain.value=0,this.bed.connect(this.sfxBus),this.transientTrim=this.keep(e.createGain()),this.transientTrim.gain.value=N.transientTrim,this.transientTrim.connect(this.sfxBus),this.motorFilter=this.keep(e.createBiquadFilter()),this.motorFilter.type="lowpass",this.motorFilter.frequency.value=N.motorCutoffAtRest,this.motorFilter.Q.value=N.motorFilterQ,this.motorFilter.connect(this.bed),this.motorDrive=this.createPartial("sine",N.motorIdleHz,this.motorFilter),this.motorSing=this.createPartial("triangle",N.motorIdleHz*N.motorSingHarmonic,this.motorFilter),this.motorAir=this.createPartial("sine",N.motorIdleHz*N.motorAirHarmonic,this.motorFilter),this.regen=this.createPartial("sine",N.motorIdleHz*N.regenHarmonic,this.motorFilter),this.windFilter=this.keep(e.createBiquadFilter()),this.windFilter.type="bandpass",this.windFilter.frequency.value=N.windCutoffAtRest,this.windFilter.Q.value=N.windQ,this.windGain=this.keep(e.createGain()),this.windGain.gain.value=0,this.windFilter.connect(this.windGain),this.windGain.connect(this.bed),this.windNoise=this.createLoop(this.pinkBuffer,this.windFilter),this.tyre=[this.createTyreSlot(),this.createTyreSlot()],this.scrapeFilter=this.keep(e.createBiquadFilter()),this.scrapeFilter.type="bandpass",this.scrapeFilter.frequency.value=N.scrapeCentreHz,this.scrapeFilter.Q.value=N.scrapeQ,this.scrapeGain=this.keep(e.createGain()),this.scrapeGain.gain.value=0,this.scrapeFilter.connect(this.scrapeGain),this.scrapeGain.connect(this.bed),this.createLoop(this.whiteBuffer,this.scrapeFilter),this.scrapeRingGain=this.keep(e.createGain()),this.scrapeRingGain.gain.value=0,this.scrapeRingGain.connect(this.bed),this.scrapeRingLow=this.keep(e.createOscillator()),this.scrapeRingLow.type="sine",this.scrapeRingLow.frequency.value=N.scrapeRingHz,this.scrapeRingLow.connect(this.scrapeRingGain),this.startSource(this.scrapeRingLow),this.wobble=this.createPartial("triangle",N.wobbleToneLowHz,this.bed)}get counts(){return{permanentNodes:this.permanent.length,voices:this.voices.size,droppedVoices:this.droppedVoices,crashSamplePlays:this.crashSamplePlays}}get samplesLoaded(){return this.bank!==null}setSampleBank(e){if(this.disposed||this.bank!==null)return;this.bank=e;for(let n=0;n<2;n+=1){const s=this.tyre[n],r=this.keep(this.context.createBufferSource());r.buffer=e.tyreOffroad,r.loop=!0,r.connect(s.sampleGain),this.permanentSources.push(r),r.start(0,n===0?0:e.tyreOffroad.duration/2),s.sample=r;const a=this.keep(this.context.createBufferSource());a.buffer=e.tyreSolid,a.loop=!0,a.connect(s.tokoGain),this.permanentSources.push(a),a.start(0,n===0?0:e.tyreSolid.duration/2),s.toko=a}this.windNoise.stop(),this.windNoise.disconnect();const t=this.keep(this.context.createGain());t.gain.value=N.windSampleTrim,t.connect(this.windFilter),this.createLoop(e.windHowl,t)}setBusGains(e,t,n){if(this.disposed)return;const s=this.context.currentTime;this.glide(this.sfxBus.gain,e,s),this.glide(this.uiBus.gain,t,s),this.glide(this.musicBus.gain,n,s)}applyFrame(e){if(this.disposed)return;const t=this.context.currentTime,n=e.bedGain;this.glide(this.bed.gain,n,t),this.glide(this.motorDrive.osc.frequency,e.motorHz,t),this.glide(this.motorDrive.gain.gain,e.motorDriveGain,t),this.glide(this.motorSing.osc.frequency,e.motorSingHz,t),this.glide(this.motorSing.gain.gain,e.motorSingGain,t),this.glide(this.motorAir.osc.frequency,e.motorAirHz,t),this.glide(this.motorAir.gain.gain,e.motorAirGain,t),this.glide(this.regen.osc.frequency,e.regenHz,t),this.glide(this.regen.gain.gain,e.regenGain,t),this.glide(this.motorFilter.frequency,e.motorCutoffHz,t),this.glide(this.motorFilter.Q,e.motorQ,t),this.glide(this.windGain.gain,e.windGain,t),this.glide(this.windFilter.frequency,e.windCutoffHz,t);for(let s=0;s<2;s+=1){const r=this.tyre[s],a=e.tyre[s];this.glide(r.bandGain.gain,a.gain,t),this.glide(r.band.frequency,a.centreHz,t),this.glide(r.band.Q,a.q,t),this.glide(r.bodyGain.gain,a.gain*a.lowGain,t),this.glide(r.body.frequency,a.lowHz,t),this.glide(r.sampleGain.gain,a.sampleGain,t),r.sample&&this.glide(r.sample.playbackRate,a.sampleRate,t),this.glide(r.tokoGain.gain,a.tokoGain,t),r.toko&&this.glide(r.toko.playbackRate,a.tokoRate,t)}this.glide(this.scrapeGain.gain,e.scrapeGain,t),this.glide(this.scrapeFilter.frequency,e.scrapeCentreHz,t),this.glide(this.scrapeRingGain.gain,e.scrapeRingGain,t),this.glide(this.scrapeRingLow.frequency,e.scrapeRingHz,t),this.glide(this.wobble.osc.frequency,e.wobbleHz,t),this.glide(this.wobble.gain.gain,e.wobbleGain,t)}play(e){if(this.disposed)return;if(this.voices.size>=sE){this.droppedVoices+=1;return}const t=this.context.currentTime+Math.max(0,e.delaySeconds),n=e.bus==="ui"?this.uiBus:this.transientTrim;if(e.kind==="crash"&&this.bank){this.playCrashSample(this.bank.crash,e,t,n);return}e.toneSeconds>0&&e.toneHz>0&&this.playTone(e,t,n),e.thumpSeconds>0&&e.thumpFromHz>0&&this.playThump(e,t,n),e.noiseSeconds>0&&e.noiseHz>0&&this.playBurst(e,t,n)}outputLevel(){if(this.disposed)return 0;const e=this.tapAnalyser(),t=this.analyserData;if(!e||!t)return 0;e.getFloatTimeDomainData(t);let n=0;for(let s=0;s<t.length;s+=1)n+=t[s]*t[s];return Math.sqrt(n/t.length)}outputSpectrum(){if(this.disposed)return null;const e=this.tapAnalyser(),t=this.spectrumData;return!e||!t?null:(e.getFloatFrequencyData(t),{binHz:this.context.sampleRate/e.fftSize,db:t})}tapAnalyser(){if(this.disposed)return null;if(!this.analyser){const e=this.keep(this.context.createAnalyser());e.fftSize=2048,e.smoothingTimeConstant=.6,this.limiter.connect(e),this.analyser=e,this.analyserData=new Float32Array(new ArrayBuffer(e.fftSize*4)),this.spectrumData=new Float32Array(new ArrayBuffer(e.frequencyBinCount*4))}return this.analyser}stopAllVoices(){for(const e of[...this.voices])try{e.stop()}catch{}}dispose(){if(!this.disposed){this.disposed=!0,this.stopAllVoices(),this.voices.clear();for(const e of this.permanentSources){try{e.stop()}catch{}e.onended=null}for(const e of this.permanent)e.disconnect();this.permanent.length=0,this.permanentSources.length=0,this.analyser=null,this.analyserData=null,this.spectrumData=null}}keep(e){return this.permanent.push(e),e}startSource(e){return this.permanentSources.push(e),e.start(),e}createPartial(e,t,n){const s=this.keep(this.context.createOscillator());s.type=e,s.frequency.value=t;const r=this.keep(this.context.createGain());return r.gain.value=0,s.connect(r),r.connect(n),this.startSource(s),{osc:s,gain:r}}createLoop(e,t){const n=this.keep(this.context.createBufferSource());return n.buffer=e,n.loop=!0,n.connect(t),this.startSource(n),n}createTyreSlot(){const e=this.context,t=this.keep(e.createBiquadFilter());t.type="bandpass",t.frequency.value=1e3,t.Q.value=1;const n=this.keep(e.createGain());n.gain.value=0,t.connect(n),n.connect(this.bed);const s=this.keep(e.createBiquadFilter());s.type="lowpass",s.frequency.value=200,s.Q.value=.7;const r=this.keep(e.createGain());r.gain.value=0,s.connect(r),r.connect(this.bed);const a=this.keep(e.createBufferSource());a.buffer=this.pinkBuffer,a.loop=!0,a.connect(t),a.connect(s),this.startSource(a);const o=this.keep(e.createGain());o.gain.value=0,o.connect(this.bed);const l=this.keep(e.createGain());return l.gain.value=0,l.connect(this.bed),{source:a,band:t,bandGain:n,body:s,bodyGain:r,sampleGain:o,tokoGain:l,sample:null,toko:null}}playCrashSample(e,t,n,s){const r=this.context,a=r.createBufferSource();a.buffer=e;const o=this.crashIndex%3===0?0:this.crashIndex%3===1?1:-1;this.crashIndex+=1;const l=1+N.crashSampleRateSpread*o;a.playbackRate.value=l;const c=r.createGain(),u=t.gain*N.crashSampleTrim;c.gain.setValueAtTime(qi,n),c.gain.linearRampToValueAtTime(u,n+.008),a.connect(c),c.connect(s),this.launch(a,n,n+e.duration/l+.05,[c]),this.crashSamplePlays+=1}playTone(e,t,n){const s=this.context,r=s.createOscillator();r.type="square",r.frequency.setValueAtTime(e.toneHz,t);const a=s.createBiquadFilter();a.type="lowpass",a.frequency.value=N.beepCutoffHz;const o=s.createGain(),l=t+e.toneSeconds;o.gain.setValueAtTime(qi,t),o.gain.linearRampToValueAtTime(e.gain,t+N.beepAttackSeconds),o.gain.setValueAtTime(e.gain,l),o.gain.exponentialRampToValueAtTime(qi,l+N.beepReleaseSeconds),r.connect(a),a.connect(o),o.connect(n),this.launch(r,t,l+N.beepReleaseSeconds,[a,o])}playThump(e,t,n){const s=this.context,r=s.createOscillator();r.type="sine",r.frequency.setValueAtTime(e.thumpFromHz,t),r.frequency.exponentialRampToValueAtTime(Math.max(qi,e.thumpToHz),t+e.thumpSeconds);const a=s.createGain();a.gain.setValueAtTime(qi,t),a.gain.linearRampToValueAtTime(e.gain,t+.004),a.gain.exponentialRampToValueAtTime(qi,t+e.thumpSeconds),r.connect(a),a.connect(n),this.launch(r,t,t+e.thumpSeconds,[a])}playBurst(e,t,n){const s=this.context,r=s.createBufferSource();r.buffer=this.whiteBuffer;const a=s.createBiquadFilter();a.type="bandpass",a.frequency.value=e.noiseHz,a.Q.value=e.noiseQ;const o=s.createGain();o.gain.setValueAtTime(qi,t),o.gain.linearRampToValueAtTime(e.gain,t+.005),o.gain.exponentialRampToValueAtTime(qi,t+e.noiseSeconds),r.connect(a),a.connect(o),o.connect(n),this.burstIndex+=1;const l=this.whiteBuffer.duration,c=this.burstIndex*.317%Math.max(.001,l-e.noiseSeconds);this.launchAt(r,t,c,t+e.noiseSeconds,[a,o])}launch(e,t,n,s){this.register(e,s),e.start(t),e.stop(n)}launchAt(e,t,n,s,r){this.register(e,r),e.start(t,n),e.stop(s)}register(e,t){this.voices.add(e),e.onended=()=>{this.voices.delete(e),e.disconnect();for(const n of t)n.disconnect();e.onended=null}}glide(e,t,n){Number.isFinite(t)&&e.setTargetAtTime(t,n,N.paramGlideSeconds)}}const ef=["pointerdown","keydown","touchstart","touchend","click"],aE=600;function tf(){if(typeof window>"u")return null;const i=window;return i.AudioContext??i.webkitAudioContext??null}class oE{director=new Qw;input=Yw();target;context=null;sink=null;listening=!1;disposed=!1;wantSuspended=!1;volumes=lE;muted=!1;sampleData=null;samplesRequested=!1;decodeStarted=!1;played={hop:0,landing:0,curb:0,crash:0,recover:0,beep:0};constructor(e=typeof window>"u"?null:window){this.target=e,this.listenForGesture()}get supported(){return tf()!==null}get armed(){return this.sink!==null}arm(){if(this.disposed||this.sink!==null)return;const e=tf();if(e){try{const t=this.context??new e;this.context=t,this.sink=new rE(t),this.applyVolumes(),t.addEventListener("statechange",this.onStateChange),this.kick()}catch{this.sink=null;return}this.installSamples()}}kick(){const e=this.context;if(!(!e||this.disposed||this.wantSuspended)&&e.state!=="closed"){if(e.state==="running"){this.stopListeningForGesture();return}e.resume().then(()=>{!this.disposed&&e.state==="running"&&this.stopListeningForGesture()},()=>{})}}onStateChange=()=>{const e=this.context;if(!(!e||this.disposed)){if(e.state==="running"){this.stopListeningForGesture();return}e.state==="closed"||this.wantSuspended||(e.resume().catch(()=>{}),this.listenForGesture())}};setSampleUrls(e){this.disposed||this.samplesRequested||(this.samplesRequested=!0,(async()=>{try{const[t,n,s,r]=await Promise.all([fetch(e.tyreOffroad).then(a=>a.arrayBuffer()),fetch(e.tyreSolid).then(a=>a.arrayBuffer()),fetch(e.windHowl).then(a=>a.arrayBuffer()),fetch(e.crash).then(a=>a.arrayBuffer())]);if(this.disposed)return;this.sampleData={tyreOffroad:t,tyreSolid:n,windHowl:s,crash:r},this.installSamples()}catch{}})())}installSamples(){const e=this.context,t=this.sampleData;!e||!this.sink||!t||this.decodeStarted||this.disposed||(this.decodeStarted=!0,(async()=>{try{const[n,s,r,a]=await Promise.all([e.decodeAudioData(t.tyreOffroad),e.decodeAudioData(t.tyreSolid),e.decodeAudioData(t.windHowl),e.decodeAudioData(t.crash)]);if(this.disposed)return;const o={tyreOffroad:n,tyreSolid:s,windHowl:r,crash:a};this.sink?.setSampleBank(o)}catch{}finally{this.sampleData=null}})())}setVolumes(e){this.volumes={master:Dt(e.master??this.volumes.master),sfx:Dt(e.sfx??this.volumes.sfx),ui:Dt(e.ui??this.volumes.ui),music:Dt(e.music??this.volumes.music)},this.applyVolumes()}setMuted(e){this.muted=e,this.applyVolumes()}toggleMuted(){return this.setMuted(!this.muted),this.muted}setTuning(e){this.director.setTuning(e)}update(e){if(this.disposed)return;let t=Number.isFinite(e)?Math.max(0,e):0,n=0;do{const s=Math.min(t,N.modelStepSeconds);t-=s,n+=1,this.director.update(s,this.input);for(let r=0;r<this.director.cueCount;r+=1){const a=this.director.cues[r];this.played[a.kind]+=1,this.sink?.play(a)}this.director.clearCues()}while(t>1e-9&&n<aE);this.sink?.applyFrame(this.director.frame)}hop(e){this.director.hop(e)}landing(e,t){this.director.landing(e,t)}impact(e){this.director.impact(e)}crash(e){this.director.crash(e)}reset(){this.director.reset(),this.sink?.stopAllVoices()}setSuspended(e){this.wantSuspended=e;const t=this.context;if(!(!t||this.disposed)){if(e){t.state==="running"&&t.suspend().catch(()=>{});return}t.state==="closed"||t.state==="running"||(t.resume().catch(()=>{}),this.listenForGesture())}}outputLevel(){return this.sink?.outputLevel()??0}outputSpectrum(){return this.sink?.outputSpectrum()??null}snapshot(){const e=this.director.frame,t=this.sink?.counts,[n,s]=e.tyre;return{supported:this.supported,armed:this.armed,contextState:this.context?.state??"unavailable",muted:this.muted,volumes:this.volumes,sampleRate:this.context?.sampleRate??0,permanentNodes:t?.permanentNodes??0,samplesLoaded:this.sink?.samplesLoaded??!1,voices:t?.voices??0,droppedVoices:t?.droppedVoices??0,played:{...this.played},crashSamplePlays:t?.crashSamplePlays??0,bedGain:e.bedGain,duck:e.duck,motorHz:e.motorHz,motorGain:e.motorDriveGain,motorCutoffHz:e.motorCutoffHz,motorQ:e.motorQ,regenGain:e.regenGain,windGain:e.windGain,tyreGain:n.gain+n.sampleGain+n.tokoGain+s.gain+s.sampleGain+s.tokoGain,tyreVoice:e.tyre[e.tyreActive].voiceId,scrapeGain:e.scrapeGain,wobbleGain:e.wobbleGain}}dispose(){if(this.disposed)return;this.disposed=!0,this.stopListeningForGesture(),this.sink?.dispose(),this.sink=null;const e=this.context;this.context=null,e&&(e.removeEventListener("statechange",this.onStateChange),e.state!=="closed"&&e.close().catch(()=>{}))}applyVolumes(){this.sink&&this.sink.setBusGains(Ol(this.volumes,"sfx",this.muted),Ol(this.volumes,"ui",this.muted),Ol(this.volumes,"music",this.muted))}listenForGesture(){if(!(!this.target||this.listening)){this.listening=!0;for(const e of ef)this.target.addEventListener(e,this.onGesture,{capture:!0,passive:!0})}}stopListeningForGesture(){if(!(!this.target||!this.listening)){this.listening=!1;for(const e of ef)this.target.removeEventListener(e,this.onGesture,{capture:!0})}}onGesture=()=>{this.arm(),this.kick()}}const lE=Object.freeze({master:1,sfx:1,ui:1,music:.7}),cE=""+new URL("tyre_offroad_loop-C2A8IYgc.wav",import.meta.url).href,hE=""+new URL("tyre_solid_loop-Bnkdbldc.wav",import.meta.url).href,uE=""+new URL("wind_howl_loop-DoSne_ZV.wav",import.meta.url).href,dE=""+new URL("crash_wipeout-TJe-08nm.wav",import.meta.url).href,fE={tyreOffroad:cE,tyreSolid:hE,windHowl:uE,crash:dE};function pE(){return{now:()=>performance.now(),requestFrame:i=>requestAnimationFrame(i),cancelFrame:i=>cancelAnimationFrame(i),setTimer:(i,e)=>window.setTimeout(i,e),clearTimer:i=>window.clearTimeout(i)}}class mE{stepSeconds;scheduler;callbacks;maxStepsPerFrame=Rr.maxStepsPerFrame;accumulator=0;lastTimeMs=0;startedAtMs=0;alpha=0;running=!0;mode="idle";timerFallback=!1;firstFrameMs=null;frameHandle=0;timerHandle=0;probeHandle=0;frames=0;syntheticFrames=0;steps=0;droppedSteps=0;stepsLastFrame=0;constructor(e,t){this.callbacks=e,this.scheduler=t,this.stepSeconds=1/Rr.hz}start(){this.mode==="idle"&&(this.mode="raf",this.startedAtMs=this.scheduler.now(),this.lastTimeMs=this.startedAtMs,this.accumulator=0,this.frameHandle=this.scheduler.requestFrame(this.onAnimationFrame),this.probeHandle=this.scheduler.setTimer(this.onProbeExpired,Rr.firstFrameProbeMs))}setRunning(e){this.running!==e&&(this.running=e,e&&this.resetTime())}isRunning(){return this.running}resetTime(){this.lastTimeMs=this.scheduler.now(),this.accumulator=0}setMaxStepsPerFrame(e){this.maxStepsPerFrame=Math.max(1,Math.floor(e))}advance(e){if(this.mode==="stopped")return;const t=Number.isFinite(e)?Math.max(0,Math.floor(e)):0,n=this.scheduler.now();for(let o=0;o<t;o+=1)this.callbacks.step(this.stepSeconds);const s=this.scheduler.now()-n;this.steps+=t,this.stepsLastFrame=t,this.accumulator=0,this.alpha=1,this.lastTimeMs=this.scheduler.now();const r=this.scheduler.now();this.callbacks.render(1,!0);const a=this.scheduler.now()-r;this.frames+=1,this.syntheticFrames+=1,this.callbacks.onFrameSampled?.({simMs:s,renderMs:a,steps:t,synthetic:!0})}stats(){return{frames:this.frames,syntheticFrames:this.syntheticFrames,steps:this.steps,droppedSteps:this.droppedSteps,stepsLastFrame:this.stepsLastFrame,running:this.running,mode:this.mode,alpha:this.alpha,accumulatorSeconds:this.accumulator,timerFallback:this.timerFallback,firstFrameMs:this.firstFrameMs}}dispose(){this.mode="stopped",this.frameHandle&&this.scheduler.cancelFrame(this.frameHandle),this.timerHandle&&this.scheduler.clearTimer(this.timerHandle),this.probeHandle&&this.scheduler.clearTimer(this.probeHandle),this.frameHandle=0,this.timerHandle=0,this.probeHandle=0}onAnimationFrame=e=>{this.mode==="raf"&&(this.probeHandle&&(this.scheduler.clearTimer(this.probeHandle),this.probeHandle=0,this.firstFrameMs=Math.max(0,e-this.startedAtMs)),this.frameHandle=this.scheduler.requestFrame(this.onAnimationFrame),this.runFrame(e))};onProbeExpired=()=>{this.probeHandle=0,this.mode==="raf"&&(this.frameHandle&&this.scheduler.cancelFrame(this.frameHandle),this.frameHandle=0,this.mode="timer",this.timerFallback=!0,this.resetTime(),this.scheduleTimer())};onTimerTick=()=>{this.timerHandle=0,this.mode==="timer"&&(this.scheduleTimer(),this.runFrame(this.scheduler.now()))};scheduleTimer(){this.timerHandle=this.scheduler.setTimer(this.onTimerTick,Rr.fallbackIntervalMs)}runFrame(e){const t=Math.max(0,e-this.lastTimeMs)/1e3;this.lastTimeMs=e,this.callbacks.beforeFrame?.(e);let n=0,s=0;if(this.running){this.accumulator+=t;const o=this.scheduler.now();for(;this.accumulator>=this.stepSeconds&&n<this.maxStepsPerFrame;)this.callbacks.step(this.stepSeconds),this.accumulator-=this.stepSeconds,n+=1;if(s=this.scheduler.now()-o,this.accumulator>=this.stepSeconds){const l=Math.floor(this.accumulator/this.stepSeconds);this.droppedSteps+=l,this.accumulator-=l*this.stepSeconds}this.accumulator<0&&(this.accumulator=0),this.alpha=this.accumulator/this.stepSeconds}this.steps+=n,this.stepsLastFrame=n,this.frames+=1;const r=this.scheduler.now();this.callbacks.render(this.alpha,!1);const a=this.scheduler.now()-r;this.callbacks.onFrameSampled?.({simMs:s,renderMs:a,steps:n,synthetic:!1})}}const gE=Object.freeze({p50:0,p95:0,p99:0,worst:0});function zl(i,e,t){if(e===0)return 0;const n=Math.ceil(t*e)-1;return i[Math.min(e-1,Math.max(0,n))]}class bE{capacity;sim;render;scratch;writeIndex=0;count=0;saturated=!1;syntheticExcluded=0;steps=0;constructor(e=_h.sampleWindow){this.capacity=Math.max(1,Math.floor(e)),this.sim=new Float64Array(this.capacity),this.render=new Float64Array(this.capacity),this.scratch=new Float64Array(this.capacity)}begin(){this.writeIndex=0,this.count=0,this.saturated=!1,this.syntheticExcluded=0,this.steps=0,this.sim.fill(0),this.render.fill(0)}record(e){if(this.steps+=e.steps,e.synthetic){this.syntheticExcluded+=1;return}this.sim[this.writeIndex]=e.simMs,this.render[this.writeIndex]=e.renderMs,this.writeIndex=(this.writeIndex+1)%this.capacity,this.count<this.capacity?this.count+=1:this.saturated=!0}report(){return{sampled:this.count,syntheticExcluded:this.syntheticExcluded,saturated:this.saturated,simMs:this.percentiles(this.sim),renderMs:this.percentiles(this.render),steps:this.steps}}percentiles(e){if(this.count===0)return gE;for(let n=0;n<this.count;n+=1)this.scratch[n]=e[n];const t=this.scratch.subarray(0,this.count);return t.sort(),{p50:zl(t,this.count,.5),p95:zl(t,this.count,.95),p99:zl(t,this.count,.99),worst:t[this.count-1]}}}const nf="euc-diagnostics-style",vE=`
.euc-diag {
  position: fixed;
  z-index: 30;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #dfe6ef;
  background: rgba(10, 14, 19, 0.82);
  border: 1px solid rgba(140, 165, 195, 0.28);
  border-radius: 8px;
  backdrop-filter: blur(6px);
  padding: 0.6rem 0.75rem;
  max-height: calc(100vh - 2rem);
  overflow: auto;
  overscroll-behavior: contain;
}

.euc-diag[hidden] { display: none; }

.euc-diag h2 {
  margin: 0 0 0.5rem;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8fa3bb;
  font-weight: 600;
}

.euc-diag h3 {
  margin: 0.7rem 0 0.3rem;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6f8098;
  font-weight: 600;
}

.euc-diag h3:first-of-type { margin-top: 0.2rem; }

#euc-debug-overlay {
  top: 1rem;
  left: 1rem;
  width: 20rem;
  pointer-events: none;
}

#euc-tuning-panel {
  top: 1rem;
  right: 1rem;
  width: 20.5rem;
}

/* Both tools are useful together, including in the narrow viewport used by
   browser QA. Below the width where they fit side by side, give each half of
   the screen and its own scroll area instead of letting the tuning panel hide
   the authoritative state underneath it. */
@media (max-width: 45rem) {
  #euc-debug-overlay,
  #euc-tuning-panel {
    width: calc(100vw - 2rem);
    max-height: calc(50vh - 1.5rem);
  }

  #euc-tuning-panel {
    top: auto;
    bottom: 1rem;
  }
}

.euc-diag dl {
  display: grid;
  grid-template-columns: 8.5rem 1fr;
  gap: 0.1rem 0.6rem;
  margin: 0;
}

.euc-diag dt { color: #8395ab; }
.euc-diag dd { margin: 0; font-variant-numeric: tabular-nums; }
.euc-diag dd.warn { color: #ffc46b; }

.euc-tunable {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin: 0 0 0.35rem;
}

.euc-tunable label { grid-column: 1 / 2; color: #b9c6d6; }
.euc-tunable output {
  grid-column: 2 / 3;
  font-variant-numeric: tabular-nums;
  color: #dfe6ef;
  min-width: 4.5rem;
  text-align: right;
}
.euc-tunable .euc-revert {
  grid-column: 3 / 4;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border-radius: 4px;
  border: 1px solid rgba(140, 165, 195, 0.3);
  background: transparent;
  color: #8395ab;
  cursor: pointer;
  visibility: hidden;
}
.euc-tunable.is-overridden .euc-revert { visibility: visible; }
.euc-tunable.is-overridden label { color: #7ec8ff; }
.euc-tunable input[type="range"] {
  grid-column: 1 / 4;
  width: 100%;
  margin: 0;
  accent-color: #1f6fe0;
}

.euc-diag .euc-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.7rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgba(140, 165, 195, 0.22);
}

.euc-diag button {
  font: inherit;
  padding: 0.25rem 0.55rem;
  border-radius: 5px;
  border: 1px solid rgba(140, 165, 195, 0.35);
  background: rgba(31, 111, 224, 0.16);
  color: #dfe6ef;
  cursor: pointer;
}

.euc-diag button:hover { background: rgba(31, 111, 224, 0.3); }
.euc-diag button:focus-visible { outline: 2px solid #7ec8ff; outline-offset: 2px; }

.euc-diag .euc-note {
  margin: 0.55rem 0 0;
  color: #7b8ca3;
  font-size: 11px;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .euc-diag { backdrop-filter: none; }
}
`;function Np(i=document){if(i.getElementById(nf))return;const e=i.createElement("style");e.id=nf,e.textContent=vE,i.head.appendChild(e)}const we=new Intl.NumberFormat("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}),It=new Intl.NumberFormat("en-GB",{maximumFractionDigits:0}),sf=new Intl.NumberFormat("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:"always"});function xE(i){const e=[];return i.crouch&&e.push("crouch"),i.hop&&e.push("hop"),i.reset&&e.push("reset"),i.cameraCycle&&e.push("camera"),i.pause&&e.push("pause"),e.length>0?e.join(" "):"—"}class SE{doc;root=null;values=new Map;shown=!1;lastRefreshMs=-1/0;refreshIntervalMs;constructor(e=document){this.doc=e,this.refreshIntervalMs=1e3/_h.overlayRefreshHz}get visible(){return this.shown}toggle(){this.setVisible(!this.shown)}setVisible(e){this.shown=e,e&&(this.build(),this.lastRefreshMs=-1/0),this.root&&(this.root.hidden=!e)}shouldRefresh(e){return this.shown&&e-this.lastRefreshMs>=this.refreshIntervalMs}update(e,t){if(!this.shown||!this.root)return;this.lastRefreshMs=t;const n=e.loop;this.set("tick",It.format(e.tick)),this.set("simtime",`${we.format(e.simTimeSeconds)} s`),this.set("state",n.running?"running":"FROZEN"),this.set("scheduler",n.timerFallback?"timer fallback":`raf${n.firstFrameMs===null?" (pending)":""}`,n.timerFallback),this.set("firstframe",n.firstFrameMs===null?"—":`${we.format(n.firstFrameMs)} ms`),this.set("frames",`${It.format(n.frames)} (${It.format(n.syntheticFrames)} synthetic)`),this.set("steps",`${It.format(n.stepsLastFrame)} this frame`),this.set("dropped",It.format(n.droppedSteps),n.droppedSteps>0),this.set("alpha",we.format(n.alpha)),this.set("throttle",sf.format(e.actions.throttle)),this.set("steer",sf.format(e.actions.steer)),this.set("actions",xE(e.actions)),this.set("consumed",Object.entries(e.consumed).map(([o,l])=>`${o} ${l}`).join("  "));const s=e.euc;this.set("ridestate",s.state),this.set("speed",`${we.format(s.speedKph)} km/h  (${we.format(s.speed)} m/s)`),this.set("ridepos",`${we.format(s.position.x)}, ${we.format(s.position.y)}, ${we.format(s.position.z)}`),this.set("heading",`${we.format(go(s.headingY))} rad`),this.set("lean",`${we.format(s.leanPitch)} force  (rider ${we.format(s.riderPitch)}, wheel ${we.format(s.wheelPitch)})`),this.set("longitudinal",`${we.format(s.longitudinalAccel)} m/s²`),this.set("roll",`${we.format(s.rollAngle)} rad  (upper ${we.format(s.riderRoll)})`),this.set("lateral",`${we.format(s.lateralAccel)} m/s²  yaw ${we.format(s.yawRate)} rad/s`+(s.lateralLimited?"  LIMIT":""),s.lateralLimited),this.set("ridden",`${It.format(s.distanceTravelled)} m`),this.set("look",`${we.format(s.riderLookYaw)} rad`),this.set("surface",`${s.surface}${s.offCourse?" (off course)":""}${s.grounded?"":"  AIRBORNE"}`,!s.grounded),this.set("resistance",`${we.format(s.rollingResistance)} m/s²  grip ${we.format(s.lateralLimitG)} g`),this.set("slope",`${we.format(s.slope)} rad  (${we.format(s.slopeAccel)} m/s²)`),this.set("suspension",`${we.format(s.suspensionOffset*100)} cm travel  (${we.format(s.suspensionCompression*100)} cm closed)`),this.set("contact",s.blocked?`BLOCKED  impact ${we.format(s.collisionImpact)} m/s`:s.lastStepUp>0?`step up ${we.format(s.lastStepUp*100)} cm`:s.curbAhead!==0?`${we.format(s.curbAhead*100)} cm ahead`:"clear",s.blocked),this.set("air",s.grounded?s.compressing?`compressing (charge ${we.format(s.hopCharge)})`:`grounded  charge ${we.format(s.crouchCharge)}`:`${we.format(s.airHeight*100)} cm up  apex ${we.format(s.airApex*100)} cm  ${we.format(s.airTime)} s  v ${we.format(s.verticalVelocity)} m/s`,!s.grounded),this.set("airaim",`${It.format(s.hops)} hops  yaw off travel ${we.format(s.airMisalignment)} rad`),this.set("landing",s.landingQuality==="none"?"—":`${s.landingQuality}  impact ${we.format(s.landingImpact)} m/s  off ${we.format(s.landingMisalignment)} rad  score ${we.format(s.landingScore)}  -${we.format(s.landingSpeedLoss*100)}%  (${It.format(s.landings)})`,s.landingQuality==="wobble"||s.landingQuality==="crash"),this.set("pedal",s.pedalStrike===0?`clear (${we.format(s.pedalClearance)} rad)`:`SCRAPING ${we.format(Math.abs(s.pedalStrike))} rad past ${we.format(s.pedalClearance)} on the ${s.pedalStrike>0?"left":"right"}`,s.pedalStrike!==0),this.set("wobble",`${we.format(s.wobbleEnergy)} energy  ${we.format(s.wobbleYaw)} rad  ${s.wobbleRate>=0?"+":""}${we.format(s.wobbleRate)}/s`,s.wobbleEnergy>=j.wobbleStateEnergy),this.set("wobblesmooth",`${we.format(s.wobbleSmoothness)} input  ${we.format(s.wobbleFootCorrection)} feet`),this.set("power",`${we.format(s.loadFactor)} load  ${s.powerStage}`+(s.tiltBack>0?`  tilt-back ${we.format(s.tiltBack)}`:""),s.powerStage==="warn"||s.powerStage==="tiltBack"),this.set("crash",s.crashed?`${s.crashMotion} from ${s.crashCause}  ${we.format(s.crashTime)} s  ${s.recoveryReady?"recovery ready":"holding"}`:s.invulnerable>0?`recovering — invulnerable ${we.format(s.invulnerable)} s`:s.crashes===0?"—":`${It.format(s.crashes)} so far (last: ${s.crashMotion} from ${s.crashCause})`,s.crashed),this.set("safespot",`${we.format(s.safePosition.x)}, ${we.format(s.safePosition.z)}  heading ${we.format(go(s.safeHeading))} rad`),this.set("camera",e.cameraMode),this.set("camarm",`${we.format(e.cameraDistance)} m  fov ${we.format(e.cameraFov)} rad`),this.set("camaim",`${we.format(e.cameraLookAhead)} m ahead  bank ${we.format(e.cameraBank)} rad`),this.set("camlag",`${we.format(e.cameraYawLag)} rad behind heading`),this.set("viewport",`${e.viewportWidth}x${e.viewportHeight} @${e.pixelRatio}x`),this.set("draws",`${It.format(e.drawCalls)} draws  ${It.format(e.triangles)} tris`),this.set("gpu",`${It.format(e.geometries)} geo  ${It.format(e.textures)} tex  ${It.format(e.programs)} prog`);const r=e.profile;this.set("simms",`p50 ${we.format(r.simMs.p50)}  p95 ${we.format(r.simMs.p95)}  p99 ${we.format(r.simMs.p99)}`),this.set("renderms",`p50 ${we.format(r.renderMs.p50)}  p95 ${we.format(r.renderMs.p95)}  p99 ${we.format(r.renderMs.p99)}`),this.set("window",`${It.format(r.sampled)} real frames`+(r.syntheticExcluded>0?`, ${It.format(r.syntheticExcluded)} synthetic excluded`:""));const a=e.audio;this.set("audiostate",a.supported?`${a.contextState}${a.armed?"":" (awaiting a gesture)"}${a.armed&&!a.samplesLoaded?"  samples loading":""}${a.muted?"  MUTED":""}`:"no Web Audio in this browser",!a.supported||a.muted||a.armed&&!a.samplesLoaded),this.set("audiomix",`bed ${we.format(a.bedGain)}  duck ${we.format(a.duck)}  master ${we.format(a.volumes.master)}`,a.duck>.05),this.set("audiomotor",`${It.format(a.motorHz)} Hz  gain ${we.format(a.motorGain)}  cut ${It.format(a.motorCutoffHz)} Hz`+(a.regenGain>.01?`  REGEN Q ${we.format(a.motorQ)}`:""),a.regenGain>.01),this.set("audioworld",`wind ${we.format(a.windGain)}  tyre ${we.format(a.tyreGain)}  ${a.tyreVoice||"—"}`+(a.scrapeGain>.01?`  scrape ${we.format(a.scrapeGain)}`:"")),this.set("audiovoices",`${It.format(a.voices)} live  ${It.format(a.permanentNodes)} nodes`+(a.droppedVoices>0?`  ${It.format(a.droppedVoices)} DROPPED`:""),a.droppedVoices>0),this.set("audioplayed",Object.entries(a.played).map(([o,l])=>`${o} ${l}`).join("  ")),this.set("overrides",e.tuningOverrides===0?"none":`${It.format(e.tuningOverrides)} active`,e.tuningOverrides>0)}dispose(){this.root?.remove(),this.root=null,this.values.clear(),this.shown=!1}set(e,t,n=!1){const s=this.values.get(e);s&&(s.textContent!==t&&(s.textContent=t),s.classList.toggle("warn",n))}build(){if(this.root)return;Np(this.doc);const e=this.doc.createElement("section");e.id="euc-debug-overlay",e.className="euc-diag",e.setAttribute("aria-hidden","true");const t=this.doc.createElement("h2");t.textContent="Debug — F3",e.appendChild(t);const n=[["Loop",[["tick","tick"],["simtime","sim time"],["state","state"],["scheduler","scheduler"],["firstframe","first frame"],["frames","frames"],["steps","steps"],["dropped","dropped steps"],["alpha","alpha"]]],["Input",[["throttle","throttle"],["steer","steer"],["actions","held / pending"],["consumed","consumed"]]],["Ride",[["ridestate","state"],["speed","speed"],["ridepos","position"],["heading","heading"],["lean","lean"],["longitudinal","longitudinal"],["roll","roll"],["lateral","lateral"],["ridden","ridden"],["look","look into turn"]]],["Ground",[["surface","surface"],["resistance","resistance"],["slope","slope"],["suspension","suspension"],["contact","contact"]]],["Air",[["air","hop / flight"],["airaim","aim"],["landing","last landing"],["pedal","pedal"]]],["Risk",[["wobble","wobble"],["wobblesmooth","recovery"],["power","power"],["crash","crash"],["safespot","safe spot"]]],["Camera",[["camera","mode"],["camarm","arm"],["camaim","aim"],["camlag","yaw lag"]]],["Render",[["viewport","viewport"],["draws","scene"],["gpu","gpu objects"]]],["Timing (our code only)",[["simms","sim ms"],["renderms","render ms"],["window","window"]]],["Audio",[["audiostate","context"],["audiomix","mix"],["audiomotor","motor"],["audioworld","world"],["audiovoices","voices"],["audioplayed","one-shots"]]],["Tuning",[["overrides","overrides"]]]];for(const[r,a]of n){const o=this.doc.createElement("h3");o.textContent=r,e.appendChild(o);const l=this.doc.createElement("dl");for(const[c,u]of a){const d=this.doc.createElement("dt");d.textContent=u;const h=this.doc.createElement("dd");h.dataset.field=c,h.textContent="—",l.append(d,h),this.values.set(c,h)}e.appendChild(l)}const s=this.doc.createElement("p");s.className="euc-note",s.textContent="No frame-rate figure here on purpose: an automated or unfocused tab has its own cadence. Frame interval comes from a human at a focused window.",e.appendChild(s),this.doc.body.appendChild(e),this.root=e}}class _E{doc;tuning;root=null;rows=[];shown=!1;unsubscribe=null;status=null;constructor(e,t=document){this.tuning=e,this.doc=t}get visible(){return this.shown}toggle(){this.setVisible(!this.shown)}setVisible(e){this.shown=e,e&&(this.build(),this.syncAll()),this.root&&(this.root.hidden=!e)}dispose(){this.unsubscribe?.(),this.unsubscribe=null,this.root?.remove(),this.root=null,this.rows=[],this.status=null,this.shown=!1}syncAll(){for(const e of this.rows)this.syncRow(e);this.updateStatus()}syncRow(e){const t=this.tuning.get(e.path),n=this.tuning.overrides()[e.path]!==void 0,s=String(Number(t.toFixed(4))),r=e.unit?`${s} ${e.unit}`:s;e.slider.value!==String(t)&&(e.slider.value=String(t)),e.output.value!==r&&(e.output.value=r),e.wrapper.classList.toggle("is-overridden",n)}updateStatus(){if(!this.status)return;const e=this.tuning.overrideCount();this.status.textContent=e===0?"No overrides. Values shown are the defaults in src/data/tuning.ts.":`${e} override${e===1?"":"s"} active — session only. Copy them into src/data/tuning.ts to keep them.`}build(){if(this.root)return;Np(this.doc);const e=this.doc.createElement("section");e.id="euc-tuning-panel",e.className="euc-diag",e.setAttribute("aria-label","Tuning panel");const t=this.doc.createElement("h2");t.textContent="Tuning — F4",e.appendChild(t);let n="";for(const l of this.tuning.views()){if(l.spec.group!==n){n=l.spec.group;const v=this.doc.createElement("h3");v.textContent=n,e.appendChild(v)}const c=this.doc.createElement("div");c.className="euc-tunable",c.dataset.path=l.spec.path,c.title=`${l.spec.path} — ${l.spec.note}`;const u=`euc-tunable-${l.spec.path.replace(/\W+/g,"-")}`,d=this.doc.createElement("label");d.htmlFor=u,d.textContent=l.spec.label;const h=this.doc.createElement("output");h.htmlFor=u;const f=this.doc.createElement("button");f.type="button",f.className="euc-revert",f.textContent="⤺",f.title=`Reset to the default, ${l.defaultValue}`,f.addEventListener("click",()=>{this.tuning.reset(l.spec.path)});const m=this.doc.createElement("input");m.type="range",m.id=u,m.min=String(l.spec.min),m.max=String(l.spec.max),m.step=String(l.spec.step),m.value=String(l.value),m.addEventListener("input",()=>{this.tuning.set(l.spec.path,Number(m.value))}),c.append(d,h,f,m),e.appendChild(c),this.rows.push({path:l.spec.path,unit:l.spec.unit,wrapper:c,slider:m,output:h})}const s=this.doc.createElement("div");s.className="euc-actions";const r=this.doc.createElement("button");r.type="button",r.textContent="Reset all",r.addEventListener("click",()=>{this.tuning.reset()});const a=this.doc.createElement("button");a.type="button",a.textContent="Copy overrides",a.addEventListener("click",()=>{const l=JSON.stringify(this.tuning.overrides(),null,2);console.info(`[tuning] overrides
`+l),this.doc.defaultView?.navigator?.clipboard?.writeText(l).catch(()=>{})}),s.append(r,a),e.appendChild(s);const o=this.doc.createElement("p");o.className="euc-note",e.appendChild(o),this.status=o,this.doc.body.appendChild(e),this.root=e,this.unsubscribe=this.tuning.onChange(l=>{const c=this.rows.find(u=>u.path===l);c&&this.syncRow(c),this.updateStatus()})}}class ME{options;root=null;action=null;constructor(e){this.options=e}get visible(){return this.root!==null&&!this.root.hidden}show(){const e=this.ensureDom();e.hidden&&(e.hidden=!1,e.style.display="grid",this.options.role==="alert"&&this.action?.focus())}hide(){this.root&&(this.root.hidden=!0,this.root.style.display="none")}dispose(){this.root?.remove(),this.root=null,this.action=null}ensureDom(){if(this.root)return this.root;const e=document.createElement("div");e.id=this.options.id,e.setAttribute("role",this.options.role),e.hidden=!0,Object.assign(e.style,{position:"fixed",inset:"0",display:"none",placeContent:"center",justifyItems:"center",gap:"0.75rem",padding:"2rem",textAlign:"center",background:"rgba(9, 12, 16, 0.62)",color:"#eef2f7",fontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',zIndex:"30",pointerEvents:"none"});const t=document.createElement("div");t.textContent=this.options.title,Object.assign(t.style,{fontSize:"1.6rem",fontWeight:"800",letterSpacing:"0.12em",textTransform:"uppercase"}),e.appendChild(t);const n=document.createElement("p");if(n.textContent=this.options.message,Object.assign(n.style,{margin:"0",maxWidth:"38ch",color:"#97a3b4",fontSize:"0.95rem",lineHeight:"1.5"}),e.appendChild(n),this.options.actionLabel&&this.options.onAction){const s=document.createElement("button");s.type="button",s.textContent=this.options.actionLabel,Object.assign(s.style,{marginTop:"0.5rem",padding:"0.6rem 1.4rem",border:"none",borderRadius:"0.4rem",background:"#1f6fe0",color:"#ffffff",font:"inherit",fontWeight:"600",cursor:"pointer",pointerEvents:"auto"}),s.addEventListener("click",this.options.onAction),e.appendChild(s),this.action=s}return document.body.appendChild(e),this.root=e,e}}const oo="euc-thrills.v1.",Bl=`${oo}probe`;function yE(){try{return typeof globalThis>"u"?null:globalThis.localStorage??null}catch{return null}}class wE{failure;store;memory=new Map;constructor(e=yE()){if(e===null){this.store=null,this.failure="unavailable";return}let t=null;try{e.setItem(Bl,"ok"),e.getItem(Bl)!=="ok"&&(t="discarded"),e.removeItem(Bl)}catch{t="blocked"}this.failure=t,this.store=t===null?e:null}degraded=!1;get persistent(){return this.store!==null&&!this.degraded}read(e){const t=oo+e,n=this.memory.get(t);if(n!==void 0)return n;if(this.store===null)return null;try{return this.store.getItem(t)}catch{return null}}write(e,t){const n=oo+e;if(this.memory.set(n,t),this.store===null||this.degraded)return!1;try{return this.store.setItem(n,t),this.store.getItem(n)!==t?(this.degraded=!0,!1):!0}catch{return!1}}remove(e){const t=oo+e;if(this.memory.delete(t),this.store!==null)try{this.store.removeItem(t)}catch{}}readJson(e,t){const n=this.read(e);if(n===null)return null;let s;try{s=JSON.parse(n)}catch{return this.remove(e),null}const r=t(s);return r===null&&this.remove(e),r}writeJson(e,t){let n;try{n=JSON.stringify(t)}catch{return!1}return this.write(e,n)}}const Op=["low","medium","high"],zp=["kph","mph"],Bp=["auto","on","off"],Hp=.8,Gp=1.4,Vp=Object.freeze({quality:"high",fieldOfViewTrim:0,speedUnit:"kph",volumeMaster:1,volumeSfx:1,volumeUi:1,volumeMusic:1,muted:!1,bindings:Object.freeze({}),gamepadEnabled:!0,gamepadDeadZone:.18,touchControls:"auto",touchSwapSides:!1,touchScale:1,seenPrompts:Object.freeze([])}),Hl="options";function Ba(i){return Number.isFinite(i)?i<0?0:i>1?1:i:0}function Gl(i,e,t,n){return Number.isFinite(i)?i<e?e:i>t?t:i:n}const Wp=-8,Xp=12;function Vl(i,e=Vp){const t=typeof i=="object"&&i!==null?i:{},n=Op.includes(t.quality)?t.quality:e.quality;return Object.freeze({quality:n,fieldOfViewTrim:typeof t.fieldOfViewTrim=="number"?Gl(t.fieldOfViewTrim,Wp,Xp,e.fieldOfViewTrim):e.fieldOfViewTrim,speedUnit:zp.includes(t.speedUnit)?t.speedUnit:e.speedUnit,volumeMaster:typeof t.volumeMaster=="number"?Ba(t.volumeMaster):e.volumeMaster,volumeSfx:typeof t.volumeSfx=="number"?Ba(t.volumeSfx):e.volumeSfx,volumeUi:typeof t.volumeUi=="number"?Ba(t.volumeUi):e.volumeUi,volumeMusic:typeof t.volumeMusic=="number"?Ba(t.volumeMusic):e.volumeMusic,muted:typeof t.muted=="boolean"?t.muted:e.muted,bindings:EE(t.bindings,e.bindings),gamepadEnabled:typeof t.gamepadEnabled=="boolean"?t.gamepadEnabled:e.gamepadEnabled,gamepadDeadZone:typeof t.gamepadDeadZone=="number"?Gl(t.gamepadDeadZone,0,.5,e.gamepadDeadZone):e.gamepadDeadZone,touchControls:Bp.includes(t.touchControls)?t.touchControls:e.touchControls,touchSwapSides:typeof t.touchSwapSides=="boolean"?t.touchSwapSides:e.touchSwapSides,touchScale:typeof t.touchScale=="number"?Gl(t.touchScale,Hp,Gp,e.touchScale):e.touchScale,seenPrompts:Array.isArray(t.seenPrompts)?Object.freeze(t.seenPrompts.filter(s=>typeof s=="string")):e.seenPrompts})}function EE(i,e){if(typeof i!="object"||i===null)return e;const t={};for(const[n,s]of Object.entries(i)){if(!Array.isArray(s))continue;const r=s.filter(a=>typeof a=="string"&&a.length>0&&a.length<=32);t[n]=Object.freeze(r)}return Yp(t,e)?e:Object.freeze(t)}function Yp(i,e){const t=new Set([...Object.keys(i),...Object.keys(e)]);for(const n of t){const s=i[n],r=e[n];if(s===void 0||r===void 0||s.length!==r.length)return!1;for(let a=0;a<s.length;a+=1)if(s[a]!==r[a])return!1}return!0}class TE{storage;listeners=new Set;defaults;options;constructor(e,t={}){this.storage=e,this.defaults=Vl(t,Vp),this.options=this.storage.readJson(Hl,n=>Vl(n,this.defaults))??this.defaults}get current(){return this.options}get persistent(){return this.storage.persistent}set(e){const t=Vl({...this.options,...e},this.options);if(!rf(t,this.options)){this.options=t,this.storage.writeJson(Hl,t);for(const n of this.listeners)n(t)}}reset(){if(!rf(this.defaults,this.options)){this.options=this.defaults,this.storage.writeJson(Hl,this.defaults);for(const e of this.listeners)e(this.defaults)}}markPromptSeen(e){this.options.seenPrompts.includes(e)||this.set({seenPrompts:[...this.options.seenPrompts,e]})}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear()}}function rf(i,e){if(i.quality!==e.quality||i.fieldOfViewTrim!==e.fieldOfViewTrim||i.speedUnit!==e.speedUnit||i.volumeMaster!==e.volumeMaster||i.volumeSfx!==e.volumeSfx||i.volumeUi!==e.volumeUi||i.volumeMusic!==e.volumeMusic||i.muted!==e.muted||i.gamepadEnabled!==e.gamepadEnabled||i.gamepadDeadZone!==e.gamepadDeadZone||i.touchControls!==e.touchControls||i.touchSwapSides!==e.touchSwapSides||i.touchScale!==e.touchScale||i.seenPrompts.length!==e.seenPrompts.length)return!1;for(let t=0;t<i.seenPrompts.length;t+=1)if(i.seenPrompts[t]!==e.seenPrompts[t])return!1;return Yp(i.bindings,e.bindings)}const qp=0,$p=1,Zp=2,Kp=3,Qp=4,Jp=5,jp=6,em=7,tm=8,Ri=9,nm=.001,AE=[nm,qe.ghostPositionStep,qe.ghostPositionStep,qe.ghostPositionStep,qe.ghostPositionStep,qe.ghostAngleStep,qe.ghostAngleStep,qe.ghostPositionStep,qe.ghostPositionStep],es=2**31,Qc=qe.ghostMaxSeconds+1,Io=240,RE=Math.ceil(Qc*Io)+2,CE=64;function PE(i){return Number.isFinite(i.x)&&Number.isFinite(i.y)&&Number.isFinite(i.z)&&Number.isFinite(i.groundY)&&Number.isFinite(i.headingY)&&Number.isFinite(i.rollAngle)&&Number.isFinite(i.speed)&&Number.isFinite(i.crouch)}class LE{interval;maxSeconds;maxSamples;samples=[];nextSampleTime=0;lastTime=-1;stopped=!1;constructor(e={}){const t=e.sampleHz??qe.ghostSampleHz,n=Number.isFinite(t)&&t>0&&t<=Io?t:qe.ghostSampleHz;this.interval=1/n;const s=e.maxSeconds??qe.ghostMaxSeconds;this.maxSeconds=Number.isFinite(s)&&s>0?s:qe.ghostMaxSeconds,this.maxSamples=Math.ceil(this.maxSeconds*n)+2}reset(){this.samples=[],this.nextSampleTime=0,this.lastTime=-1,this.stopped=!1}record(e,t){if(!this.stopped&&!(!Number.isFinite(e)||e<0)){if(e>this.maxSeconds){this.stopped=!0;return}if(!(e<this.nextSampleTime)&&!(e<=this.lastTime)&&PE(t)){if(this.samples.length>=this.maxSamples){this.stopped=!0;return}this.samples.push({t:e,x:t.x,y:t.y,z:t.z,groundY:t.groundY,headingY:t.headingY,rollAngle:t.rollAngle,speed:t.speed,crouch:t.crouch}),this.lastTime=e,this.nextSampleTime=(Math.round(e/this.interval)+1)*this.interval}}}get sampleCount(){return this.samples.length}get truncated(){return this.stopped}finish(e,t){if(this.stopped||this.samples.length===0||typeof e!="string"||e.length===0||!Number.isFinite(t)||t<0)return null;const n=this.samples;this.samples=[];const s=n[n.length-1],r=Math.max(t,s.t);return r>s.t&&n.push({t:r,x:s.x,y:s.y,z:s.z,groundY:s.groundY,headingY:s.headingY,rollAngle:s.rollAngle,speed:s.speed,crouch:s.crouch}),Object.freeze({levelId:e,totalSeconds:r,samples:Object.freeze(n)})}}const IE=Object.freeze([]);class Wl{samples;total;constructor(e){this.samples=e===null?IE:e.samples,this.total=e===null?0:e.totalSeconds}get totalSeconds(){return this.total}get hasTrack(){return this.samples.length>0}sample(e,t){const n=this.samples,s=n.length;if(s===0||!Number.isFinite(e))return!1;const r=n[0],a=n[s-1];if(e<r.t||e>a.t)return!1;if(s===1)return kE(r,t),!0;let o=0,l=s-1;for(;l-o>1;){const f=o+l>>1;n[f].t<=e?o=f:l=f}const c=n[o],u=n[l],d=u.t-c.t,h=d>0?(e-c.t)/d:0;return t.t=e,t.x=c.x+(u.x-c.x)*h,t.y=c.y+(u.y-c.y)*h,t.z=c.z+(u.z-c.z)*h,t.groundY=c.groundY+(u.groundY-c.groundY)*h,t.headingY=c.headingY+(u.headingY-c.headingY)*h,t.rollAngle=c.rollAngle+(u.rollAngle-c.rollAngle)*h,t.speed=c.speed+(u.speed-c.speed)*h,t.crouch=c.crouch+(u.crouch-c.crouch)*h,!0}}function DE(){return{t:0,x:0,y:0,z:0,groundY:0,headingY:0,rollAngle:0,speed:0,crouch:0}}function kE(i,e){e.t=i.t,e.x=i.x,e.y=i.y,e.z=i.z,e.groundY=i.groundY,e.headingY=i.headingY,e.rollAngle=i.rollAngle,e.speed=i.speed,e.crouch=i.crouch}function FE(i,e,t){if(!Number.isFinite(i))return t;const n=Math.round(i/e);return n>es?es:n<-es?-es:n}function UE(i){const e=i.samples,t=e.length,n=new Array(t*Ri),s=new Float64Array(Ri),r=new Float64Array(Ri);for(let a=0,o=0;a<t;a+=1,o+=Ri){const l=e[a];r[qp]=l.t,r[$p]=l.x,r[Zp]=l.y,r[Kp]=l.z,r[Qp]=l.groundY,r[Jp]=l.headingY,r[jp]=l.rollAngle,r[em]=l.speed,r[tm]=l.crouch;for(let c=0;c<Ri;c+=1){const u=s[c],d=FE(r[c],AE[c],u);n[o+c]=d-u,s[c]=d}}return Object.freeze({v:1,level:i.levelId,hz:NE(e),total:OE(Math.max(0,i.totalSeconds),3),n:t,data:n})}function NE(i){const e=i.length;if(e<2)return qe.ghostSampleHz;const t=i[e-1].t-i[0].t;if(!(t>0))return qe.ghostSampleHz;const n=(e-1)/t;return!Number.isFinite(n)||n<=0?qe.ghostSampleHz:Math.min(Io,Math.ceil(n*100)/100)}function OE(i,e){const t=10**e;return Math.round(i*t)/t}function im(i){if(typeof i!="object"||i===null||Array.isArray(i))return null;const e=i;if(e.v!==1)return null;const t=e.level;if(typeof t!="string"||t.length===0||t.length>CE)return null;const n=e.hz;if(typeof n!="number"||!Number.isFinite(n)||n<=0||n>Io)return null;const s=e.total;if(typeof s!="number"||!Number.isFinite(s)||s<0||s>Qc)return null;const r=e.n;if(typeof r!="number"||!Number.isInteger(r)||r<1||r>RE)return null;const a=e.data;if(!Array.isArray(a)||a.length!==r*Ri||r>Math.ceil(s*n)+2)return null;const o=new Array(r),l=new Float64Array(Ri);let c=-1/0;for(let u=0,d=0;u<r;u+=1,d+=Ri){for(let f=0;f<Ri;f+=1){const m=a[d+f];if(typeof m!="number"||!Number.isInteger(m)||m<-es||m>es)return null;const v=l[f]+m;if(v<-es||v>es)return null;l[f]=v}const h=l[qp]*nm;if(!(h>c)||h<0||h>Qc)return null;c=h,o[u]={t:h,x:l[$p]*qe.ghostPositionStep,y:l[Zp]*qe.ghostPositionStep,z:l[Kp]*qe.ghostPositionStep,groundY:l[Qp]*qe.ghostPositionStep,headingY:l[Jp]*qe.ghostAngleStep,rollAngle:l[jp]*qe.ghostAngleStep,speed:l[em]*qe.ghostPositionStep,crouch:l[tm]*qe.ghostPositionStep}}return Object.freeze({levelId:t,totalSeconds:Math.max(s,c),samples:Object.freeze(o)})}const Ys="records";function Do(){return Object.create(null)}const af=Object.freeze({routes:Object.freeze(Do())}),Ha=Object.freeze([]),sm=64,zE=64,BE=40,HE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;function GE(i,e){return!Number.isFinite(i)||i<=0?!1:e===null||!Number.isFinite(e)?!0:i<e-qe.recordEpsilonSeconds}function VE(i){const e=typeof i=="object"&&i!==null?i:{},t=typeof e.routes=="object"&&e.routes!==null?e.routes:{},n=Do();for(const[s,r]of Object.entries(t)){if(s.length===0||s.length>sm)continue;const a=rm(s,r);a!==null&&(n[s]=a)}return Object.freeze({routes:Object.freeze(n)})}function rm(i,e){if(typeof e!="object"||e===null)return null;const t=e,n=t.totalSeconds;return typeof n!="number"||!Number.isFinite(n)||n<=0?null:Object.freeze({levelId:i,totalSeconds:n,splits:WE(t.splits,n),setAt:typeof t.setAt=="string"&&t.setAt.length<=BE&&HE.test(t.setAt)?t.setAt:"",ghost:XE(t.ghost,i)})}function WE(i,e){if(!Array.isArray(i)||i.length===0||i.length>zE||i[0]!==0||i[i.length-1]!==e)return Ha;const t=[];let n=0;for(const s of i){if(typeof s!="number"||!Number.isFinite(s)||s<n||s>e)return Ha;t.push(s),n=s}return Object.freeze(t)}function XE(i,e){if(typeof i!="object"||i===null)return null;const t=i;if(t.v!==1||t.level!==e)return null;const n=t.hz,s=t.total,r=t.n;if(typeof n!="number"||!Number.isFinite(n)||n<=0||typeof s!="number"||!Number.isFinite(s)||s<=0||typeof r!="number"||!Number.isInteger(r)||r<0||!Array.isArray(t.data))return null;const a=[];for(const o of t.data){if(typeof o!="number"||!Number.isFinite(o))return null;a.push(o)}return im(t)===null?null:Object.freeze({v:1,level:e,hz:n,total:s,n:r,data:Object.freeze(a)})}function am(i,e,t){const n=Do();for(const[s,r]of Object.entries(i.routes))n[s]=r;return n[e]=t,Object.freeze({routes:Object.freeze(n)})}function YE(i){return Object.values(i.routes).filter(e=>e.ghost!==null).sort((e,t)=>{const n=Date.parse(e.setAt),s=Date.parse(t.setAt),r=Number.isFinite(n)?n:Number.NEGATIVE_INFINITY,a=Number.isFinite(s)?s:Number.NEGATIVE_INFINITY;return r-a||e.levelId.localeCompare(t.levelId)}).map(e=>e.levelId)}function qE(i,e){const t=i.routes[e];return t===void 0||t.ghost===null?i:am(i,e,Object.freeze({...t,ghost:null}))}function of(i){return Object.keys(i.routes).length}class $E{storage;listeners=new Set;records;lastWriteHeld=!0;constructor(e){this.storage=e,this.records=this.storage.readJson(Ys,VE)??af}get current(){return this.records}get persistent(){return this.storage.persistent&&this.lastWriteHeld}best(e){return this.records.routes[e]??null}submit(e){const t=e.levelId;if(typeof t!="string"||t.length===0||t.length>sm)return!1;const n=this.best(t);if(!GE(e.totalSeconds,n===null?null:n.totalSeconds))return!1;const s=rm(t,e);return s===null?!1:(this.records=am(this.records,t,s),this.persist(),this.announce(),!0)}clearLevel(e){if(this.best(e)===null)return;const t=Do();for(const[n,s]of Object.entries(this.records.routes))n!==e&&(t[n]=s);this.records=Object.freeze({routes:Object.freeze(t)}),of(this.records)===0?this.storage.remove(Ys):this.storage.writeJson(Ys,this.records),this.announce()}clearAll(){of(this.records)!==0&&(this.records=af,this.storage.remove(Ys),this.announce())}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear()}persist(){if(this.storage.writeJson(Ys,this.records)){this.lastWriteHeld=!0;return}let e=this.records;for(const t of YE(this.records))if(e=qE(e,t),this.storage.writeJson(Ys,e)){this.records=e,this.lastWriteHeld=!0;return}this.lastWriteHeld=!1}announce(){for(const e of this.listeners)e(this.records)}}const ZE=["freeRide","challenge"];function lf(i){return ZE.includes(i)}const Ga=Object.freeze({boot:Object.freeze({id:"boot",simulates:!1,acceptsRideInput:!1,showsHud:!1,showsMenu:!1,resetsInput:!1,successors:Object.freeze(["loading"])}),loading:Object.freeze({id:"loading",simulates:!1,acceptsRideInput:!1,showsHud:!1,showsMenu:!1,resetsInput:!1,successors:Object.freeze(["title"])}),title:Object.freeze({id:"title",simulates:!0,acceptsRideInput:!1,showsHud:!1,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["freeRide","challenge","settings","routes"])}),settings:Object.freeze({id:"settings",simulates:!0,acceptsRideInput:!1,showsHud:!1,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["title","paused"])}),routes:Object.freeze({id:"routes",simulates:!0,acceptsRideInput:!1,showsHud:!1,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["title","freeRide","challenge"])}),freeRide:Object.freeze({id:"freeRide",simulates:!0,acceptsRideInput:!0,showsHud:!0,showsMenu:!1,resetsInput:!0,successors:Object.freeze(["paused","title"])}),challenge:Object.freeze({id:"challenge",simulates:!0,acceptsRideInput:!0,showsHud:!0,showsMenu:!1,resetsInput:!0,successors:Object.freeze(["paused","results","title"])}),paused:Object.freeze({id:"paused",simulates:!1,acceptsRideInput:!1,showsHud:!0,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["freeRide","challenge","settings","title"])}),results:Object.freeze({id:"results",simulates:!0,acceptsRideInput:!1,showsHud:!1,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["challenge","title"])})});class KE{state;settingsOrigin="title";rideOrigin="freeRide";listeners=new Set;constructor(e="boot"){this.state=e}get current(){return this.state}get spec(){return Ga[this.state]}get settingsReturn(){return this.settingsOrigin}get rideReturn(){return this.rideOrigin}get riding(){return lf(this.state)}get simulates(){return this.spec.simulates}get acceptsRideInput(){return this.spec.acceptsRideInput}get showsMenu(){return this.spec.showsMenu}get showsHud(){return this.spec.showsHud}canGoTo(e){return Ga[this.state].successors.includes(e)}goTo(e){if(e===this.state||!this.canGoTo(e))return!1;const t=Ga[this.state];e==="settings"&&(this.settingsOrigin=this.state),lf(this.state)&&(this.rideOrigin=this.state),this.state=e;const n=Ga[e];for(const s of this.listeners)s(n,t);return!0}exitSettings(){return this.state!=="settings"?!1:this.goTo(this.settingsOrigin)}resumeRide(){return this.state!=="paused"?!1:this.goTo(this.rideOrigin)}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear()}}const Xl=Object.freeze([]);function cf(i,e,t,n){if(Math.abs(t-i.centre.y)>i.halfExtents.y)return!1;const s=e-i.centre.x,r=n-i.centre.z,a=Math.cos(i.headingY),o=Math.sin(i.headingY),l=a*s-o*r;if(Math.abs(l)>i.halfExtents.x)return!1;const c=o*s+a*r;return Math.abs(c)<=i.halfExtents.z}class hf{levelId;checkpoints;available_;reference=null;referenceAligned=!1;phase_="idle";elapsed=0;next=0;splits=[];legs=[];lastSplit=0;deltaToRecord=null;lastX=0;lastY=0;lastZ=0;positioned=!1;topSpeed=0;landings=0;cleanLandings=0;crashes=0;wasCrashed=!1;finished=null;constructor(e,t){this.levelId=e,this.checkpoints=Object.freeze([...t].sort((s,r)=>s.routeIndex-r.routeIndex));const n=this.checkpoints.length;this.available_=n>=2&&this.checkpoints[0].kind==="start"&&this.checkpoints[n-1].kind==="finish"}get available(){return this.available_}get state(){const t=this.phase_==="armed"||this.phase_==="running"?this.checkpoints[this.next]:void 0;return{phase:this.phase_,elapsed:this.elapsed,nextIndex:t?t.routeIndex:-1,nextLabel:t?t.label:"",passed:this.splits.length,total:this.checkpoints.length,splits:this.splits,legs:this.legs,deltaToRecord:this.deltaToRecord,distanceToNext:t&&this.positioned?Math.hypot(this.lastX-t.centre.x,this.lastY-t.centre.y,this.lastZ-t.centre.z):1/0}}setReference(e){if(e===null||!Number.isFinite(e.totalSeconds)){this.reference=null,this.referenceAligned=!1,this.deltaToRecord=null;return}this.reference=e;const t=e.splits;this.referenceAligned=t.length===this.checkpoints.length&&t.every(n=>Number.isFinite(n))&&t.every((n,s)=>s===0||n>=t[s-1])&&t[0]===0&&t[t.length-1]===e.totalSeconds,this.referenceAligned||(this.deltaToRecord=null)}arm(){this.available_&&(this.clear(),this.phase_="armed")}abandon(){this.clear(),this.phase_="idle"}restart(){this.phase_!=="idle"&&(this.clear(),this.phase_="armed")}step(e,t){if(this.lastX=t.x,this.lastY=t.y,this.lastZ=t.z,this.positioned=!0,this.phase_==="armed"){const a=this.checkpoints[this.next];return cf(a,t.x,t.y,t.z)?(this.phase_="running",this.elapsed=0,this.wasCrashed=t.crashed,[this.cross(a,0)]):Xl}if(this.phase_!=="running")return Xl;this.elapsed+=e;const n=Math.abs(t.speed);n>this.topSpeed&&(this.topSpeed=n),t.landed&&(this.landings+=1,t.landingClean&&(this.cleanLandings+=1)),t.crashed&&!this.wasCrashed&&(this.crashes+=1),this.wasCrashed=t.crashed;const s=this.checkpoints[this.next];if(!cf(s,t.x,t.y,t.z))return Xl;const r=this.cross(s,this.elapsed);return s.kind==="finish"&&this.finish(),[r]}result(){return this.finished}cross(e,t){const n=this.next,s=n===0?0:t-this.lastSplit;this.splits.push(t),this.legs.push(s),this.lastSplit=t,this.next+=1;let r=null,a=null;if(n>0&&this.reference!==null&&this.referenceAligned){const o=this.reference.splits;a=t-o[n],r=s-(o[n]-o[n-1]),this.deltaToRecord=a}return{kind:e.kind,checkpointId:e.id,routeIndex:e.routeIndex,label:e.label,elapsed:t,legSeconds:s,legDelta:r,totalDelta:a}}finish(){this.phase_="finished";const e=this.reference!==null?this.reference.totalSeconds:null;this.finished=Object.freeze({levelId:this.levelId,totalSeconds:this.elapsed,splits:Object.freeze([...this.splits]),legs:Object.freeze([...this.legs]),labels:Object.freeze(this.checkpoints.map(t=>t.label)),topSpeed:this.topSpeed,landings:this.landings,cleanLandings:this.cleanLandings,crashes:this.crashes,beatRecord:e===null||this.elapsed<e-qe.recordEpsilonSeconds,previousBest:e})}clear(){this.elapsed=0,this.next=0,this.splits.length=0,this.legs.length=0,this.lastSplit=0,this.deltaToRecord=null,this.topSpeed=0,this.landings=0,this.cleanLandings=0,this.crashes=0,this.wasCrashed=!1,this.finished=null}}const QE=`
<div class="euc-hud__objective">
  <div class="euc-hud__objective-line" data-hud="objective"></div>
  <div class="euc-hud__off-route" data-hud="off-route" hidden>Off route</div>
</div>

<div class="euc-hud__challenge" data-hud="challenge" hidden>
  <div class="euc-hud__timer" data-hud="timer">0:00.00</div>
  <div class="euc-hud__splits" data-hud="splits" data-ahead="false" hidden>
    <span class="euc-hud__split-label" data-hud="split-label"></span>
    <span class="euc-hud__split-delta" data-hud="split-delta"></span>
  </div>
</div>

<div class="euc-hud__speed">
  <span class="euc-hud__speed-value" data-hud="speed">0</span>
  <span class="euc-hud__speed-unit" data-hud="unit">km/h</span>
  <span class="euc-hud__reverse" data-hud="reverse" hidden>Reverse</span>
</div>

<div class="euc-hud__cues">
  <div class="euc-hud__warning" data-hud="warning" role="status" aria-live="polite" hidden></div>
  <div class="euc-hud__prompt" data-hud="prompt" hidden>
    <span data-hud="prompt-text"></span>
    <button type="button" class="euc-hud__prompt-dismiss" data-hud="prompt-dismiss"
            aria-label="Dismiss this hint">&times;</button>
  </div>
</div>
`,JE=Object.freeze({kph:"km/h",mph:"mph"});class jE{root;nodes={};options;lastSpeed="";lastUnit="";lastReverse=!1;lastObjective="";lastWarningLabel="";lastWarningLevel="";lastOffRoute=!1;lastPrompt="";lastChallengeVisible=!1;lastRunTime="";lastSplitLabel="";lastSplitDelta="";lastSplitAhead="";constructor(e={}){this.options=e;const t=document.createElement("div");t.className="euc-hud euc-ui",t.hidden=!0,t.innerHTML=QE;for(const n of t.querySelectorAll("[data-hud]")){const s=n.dataset.hud;s!==void 0&&(this.nodes[s]=n)}this.nodes["prompt-dismiss"]?.addEventListener("click",this.onDismiss),(e.parent??document.body).appendChild(t),this.root=t}get visible(){return!this.root.hidden}setTouchLayout(e){const t=e?"true":"false";this.root.dataset.touch!==t&&(this.root.dataset.touch=t)}setVisible(e){this.root.hidden=!e}update(e,t){e.speed!==this.lastSpeed&&(this.nodes.speed.textContent=e.speed,this.lastSpeed=e.speed);const n=JE[e.speedUnit];n!==this.lastUnit&&(this.nodes.unit.textContent=n,this.lastUnit=n),e.reversing!==this.lastReverse&&(this.nodes.reverse.hidden=!e.reversing,this.lastReverse=e.reversing),e.objective!==this.lastObjective&&(this.nodes.objective.textContent=e.objective,this.lastObjective=e.objective),e.warningLabel!==this.lastWarningLabel&&(this.nodes.warning.textContent=e.warningLabel,this.nodes.warning.hidden=e.warningLabel==="",this.lastWarningLabel=e.warningLabel),e.warning!==this.lastWarningLevel&&(this.nodes.warning.dataset.level=e.warning,this.lastWarningLevel=e.warning),e.offRoute!==this.lastOffRoute&&(this.nodes["off-route"].hidden=!e.offRoute,this.lastOffRoute=e.offRoute),t!==this.lastPrompt&&(this.nodes["prompt-text"].textContent=t,this.nodes.prompt.hidden=t==="",this.lastPrompt=t),this.writeChallenge(e.challenge)}writeChallenge(e){if(e.visible!==this.lastChallengeVisible&&(this.nodes.challenge.hidden=!e.visible,this.lastChallengeVisible=e.visible),!e.visible)return;e.time!==this.lastRunTime&&(this.nodes.timer.textContent=e.time,this.lastRunTime=e.time),e.splitLabel!==this.lastSplitLabel&&(this.nodes["split-label"].textContent=e.splitLabel,this.nodes.splits.hidden=e.splitLabel==="",this.lastSplitLabel=e.splitLabel),e.splitDelta!==this.lastSplitDelta&&(this.nodes["split-delta"].textContent=e.splitDelta,this.lastSplitDelta=e.splitDelta);const t=e.ahead?"true":"false";t!==this.lastSplitAhead&&(this.nodes.splits.dataset.ahead=t,this.lastSplitAhead=t)}dispose(){this.nodes["prompt-dismiss"]?.removeEventListener("click",this.onDismiss),this.root.remove()}onDismiss=()=>{this.options.onDismissPrompt?.()}}const eT=.7,tT=1.1,nT=.5,iT=3.6,sT=2.236936,rT="Ride to the start line";function aT(i){if(!Number.isFinite(i)||i<0)return"";const e=i>=100?10:5;return`${Math.round(i/e)*e} m`}function oT(i){if(!Number.isFinite(i))return"";let e=i;for(;e>Math.PI;)e-=Math.PI*2;for(;e<=-Math.PI;)e+=Math.PI*2;const t=Math.round(e/(Math.PI/4));return t===0?"↑":t===1?"↖":t===2?"←":t===3?"↙":Math.abs(t)===4?"↓":t===-3?"↘":t===-2?"→":"↗"}const lT=Object.freeze({visible:!1,time:"0:00.00",splitLabel:"",splitDelta:"",ahead:!1});function Qs(i){const e=Number.isFinite(i)&&i>0?i:0,t=Math.round(e*100),n=Math.floor(t/6e3),s=Math.floor(t/100)%60,r=t%100;return`${n}:${uf(s)}.${uf(r)}`}function uf(i){return i<10?`0${i}`:String(i)}function Jc(i){if(!Number.isFinite(i))return"";const e=Math.round(i*100),t=(Math.abs(e)/100).toFixed(2);return e===0?t:e<0?`−${t}`:`+${t}`}const cT=Object.freeze({none:"",notice:"Working hard",warn:"Ease off",tiltBack:"Tilt-back — slow down"});function jc(i,e){const t=Math.abs(i)*(e==="mph"?sT:iT),n=Math.round(t);return n===0?"0":String(n)}function hT(i){return i==="tiltBack"?"tiltBack":i==="warn"?"warn":i==="notice"?"notice":"none"}class uT{speedUnit;objective;warning="none";warningSince=Number.NEGATIVE_INFINITY;offRoute=!1;offRouteSince=Number.NEGATIVE_INFINITY;onRouteSince=Number.NEGATIVE_INFINITY;splitLabel="";splitDelta=null;splitSince=Number.NEGATIVE_INFINITY;constructor(e={}){this.speedUnit=e.speedUnit??"kph",this.objective=e.objective??""}setSpeedUnit(e){this.speedUnit=e}setObjective(e){this.objective=e}reset(){this.resetCues(),this.splitLabel="",this.splitDelta=null,this.splitSince=Number.NEGATIVE_INFINITY}resetCues(){this.warning="none",this.warningSince=Number.NEGATIVE_INFINITY,this.offRoute=!1,this.offRouteSince=Number.NEGATIVE_INFINITY,this.onRouteSince=Number.NEGATIVE_INFINITY}update(e,t){if(t.crashed)return this.resetCues(),this.onRouteSince=e,{speed:jc(t.speed,this.speedUnit),speedUnit:this.speedUnit,reversing:!1,objective:this.objectiveFor(t.challenge),warning:"none",warningLabel:"",offRoute:!1,challenge:this.challengeView(e,t.challenge)};const n=hT(t.powerStage);df(n)>df(this.warning)?(this.warning=n,this.warningSince=e):n===this.warning?this.warningSince=e:e-this.warningSince>=eT&&(this.warning=n,this.warningSince=e),t.offCourse&&!this.offRoute?e-this.onRouteSince>=nT&&(this.offRoute=!0,this.offRouteSince=e):!t.offCourse&&this.offRoute?e-this.offRouteSince>=tT&&(this.offRoute=!1,this.onRouteSince=e):t.offCourse?this.offRouteSince=e:this.onRouteSince=e;const s=t.tiltBack>.02?"tiltBack":this.warning;return{speed:jc(t.speed,this.speedUnit),speedUnit:this.speedUnit,reversing:t.speed<-.1,objective:this.objectiveFor(t.challenge),warning:s,warningLabel:cT[s],offRoute:this.offRoute,challenge:this.challengeView(e,t.challenge)}}objectiveFor(e){if(e===void 0||e.phase==="idle")return this.objective;const t=aT(e.distanceMetres),n=oT(e.directionRadians),s=n===""?"":`${n} `,r=t===""?"":` · ${t}`;if(e.phase==="armed")return`${s}${rT}${r}`;if(e.phase==="running"){const a=Math.max(0,e.total-1),o=a>0&&e.passed>0?` · ${Math.min(e.passed,a)}/${a}`:"";return`${s}${e.nextLabel}${o}${r}`}return""}challengeView(e,t){if(t===void 0||t.phase==="idle")return this.splitLabel="",this.splitDelta=null,this.splitSince=Number.NEGATIVE_INFINITY,lT;if(t.phase==="armed"&&t.split===null&&(this.splitLabel="",this.splitDelta=null,this.splitSince=Number.NEGATIVE_INFINITY),t.split!==null&&(this.splitLabel=t.split.label,this.splitDelta=t.split.delta,this.splitSince=e),!(this.splitLabel!==""&&e-this.splitSince<qe.splitHoldSeconds))return{visible:!0,time:Qs(t.elapsed),splitLabel:"",splitDelta:"",ahead:!1};const s=this.splitDelta;return{visible:!0,time:Qs(t.elapsed),splitLabel:this.splitLabel,splitDelta:s===null?"Best":Jc(s),ahead:s===null||Math.round(s*100)<0}}}function df(i){return i==="tiltBack"?3:i==="warn"?2:i==="notice"?1:0}const dT=Object.freeze({auto:"Automatic",on:"Always show",off:"Never show"}),fT=`
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-title-heading">
  <h1 class="euc-menu__title" id="euc-title-heading">EUC&nbsp;<span class="accent">THRILLS</span></h1>
  <p class="euc-menu__tagline">One wheel. Total freedom. Ride anywhere.</p>
  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="start">Start ride</button>
    <button type="button" class="euc-button" data-menu="challenge">Time trial</button>
    <button type="button" class="euc-button" data-menu="routes">Fresh route</button>
    <button type="button" class="euc-button" data-menu="settings">Settings</button>
  </div>
  <p class="euc-world" data-menu="world"></p>
  <p class="euc-controls-note">Riding as <strong>Cool Rider</strong>.</p>
</div>
`;function pT(i){return`
<div class="euc-menu__panel euc-routes" role="dialog" aria-modal="true"
     aria-labelledby="euc-routes-heading">
  <h2 class="euc-menu__title euc-routes__heading" id="euc-routes-heading">Fresh route</h2>
  <p class="euc-menu__tagline">
    A seed builds a whole route. The same seed always builds the same one, so a
    route worth riding is a route worth sending to somebody.
  </p>

  <div class="euc-routes__entry">
    <label class="euc-field__label" for="euc-seed">Seed</label>
    <input id="euc-seed" class="euc-seed" type="text" data-menu="seed"
           maxlength="${i}"
           autocomplete="off" autocapitalize="none" autocorrect="off"
           spellcheck="false" enterkeyhint="go"
           aria-describedby="euc-routes-status"
           placeholder="ember-quay" />
    <button type="button" class="euc-button euc-routes__pick" data-menu="surprise">
      Surprise me
    </button>
  </div>

  <p class="euc-routes__status" id="euc-routes-status" data-menu="route-status"
     role="status" data-tone="idle"></p>

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="ride-route">
      Ride this route
    </button>
    <button type="button" class="euc-button" data-menu="trial-route">Time trial on it</button>
  </div>

  <div class="euc-routes__loaded">
    <p class="euc-world" data-menu="world"></p>
    <div class="euc-menu__actions">
      <button type="button" class="euc-button" data-menu="copy-link" hidden>
        Copy a link to the route above
      </button>
      <button type="button" class="euc-button euc-button--quiet" data-menu="ride-city" hidden>
        Go back to the hand-built city
      </button>
    </div>
  </div>

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--quiet" data-menu="routes-back">Back</button>
  </div>
</div>
`}const mT=`
<div class="euc-menu__panel euc-results" role="dialog" aria-modal="true"
     aria-labelledby="euc-results-heading" data-menu="results-panel" data-record="false">
  <h2 class="euc-menu__title euc-results__heading" id="euc-results-heading"
      data-menu="results-heading">Run complete</h2>

  <div class="euc-results__summary">
    <div class="euc-results__stat">
      <span class="euc-results__caption">This run</span>
      <span class="euc-results__total" data-menu="results-total">0:00.00</span>
    </div>
    <div class="euc-results__stat">
      <span class="euc-results__caption">Best</span>
      <span class="euc-results__best" data-menu="results-best">—</span>
      <span class="euc-results__delta" data-menu="results-delta" data-ahead="false"></span>
    </div>
  </div>

  <table class="euc-results__table">
    <caption class="euc-results__caption">Splits</caption>
    <thead>
      <tr>
        <th scope="col">Checkpoint</th>
        <th scope="col">Time</th>
        <th scope="col">vs best</th>
      </tr>
    </thead>
    <tbody data-menu="results-rows"></tbody>
  </table>

  <ul class="euc-results__notes" data-menu="results-notes" hidden></ul>

  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="retry">Ride it again</button>
    <button type="button" class="euc-button" data-menu="results-title">Back to title</button>
  </div>
</div>
`,gT=`
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-pause-heading">
  <h2 class="euc-menu__title" id="euc-pause-heading">Paused</h2>
  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="resume">Resume</button>
    <button type="button" class="euc-button" data-menu="settings">Settings</button>
    <button type="button" class="euc-button euc-button--quiet" data-menu="quit">Quit to title</button>
  </div>
  <p class="euc-world" data-menu="world"></p>
  <p class="euc-controls-note">Escape resumes.</p>
</div>
`;class bT{callbacks;parent;title;pause;settings;results;routes;seedField;screen="none";returnFocus=null;listening=null;options;constructor(e,t){this.callbacks=t.callbacks,this.parent=t.parent??document.body,this.options=e,this.title=this.mount("euc-menu--title",fT),this.pause=this.mount("euc-menu--pause",gT),this.settings=this.mount("euc-menu--settings",this.settingsTemplate()),this.results=this.mount("euc-menu--results",mT),this.routes=this.mount("euc-menu--routes",pT(t.seedMaxLength)),this.seedField=this.routes.querySelector('[data-menu="seed"]'),this.parent.addEventListener("click",this.onClick),this.settings.addEventListener("input",this.onInput),this.seedField?.addEventListener("keydown",this.onSeedKeyDown),window.addEventListener("keydown",this.onKeyDown,!0),this.sync(e)}get current(){return this.screen}show(e){if(e===this.screen)return;if(this.screen==="none"&&e!=="none"){const n=document.activeElement;this.returnFocus=n instanceof HTMLElement?n:null}if(this.stopListening(),this.title.hidden=e!=="title",this.pause.hidden=e!=="pause",this.settings.hidden=e!=="settings",this.results.hidden=e!=="results",this.routes.hidden=e!=="routes",this.screen=e,e==="none"){this.returnFocus?.focus(),this.returnFocus=null;return}this.focusFirst(this.panelFor(e))}sync(e){this.options=e,this.setValue("fieldOfViewTrim",e.fieldOfViewTrim),this.setText("fieldOfViewTrim-value",`${e.fieldOfViewTrim>0?"+":""}${e.fieldOfViewTrim}°`),this.setSelect("quality",e.quality),this.setSelect("speedUnit",e.speedUnit),this.setValue("volumeMaster",Math.round(e.volumeMaster*100)),this.setText("volumeMaster-value",`${Math.round(e.volumeMaster*100)}%`),this.setValue("volumeSfx",Math.round(e.volumeSfx*100)),this.setText("volumeSfx-value",`${Math.round(e.volumeSfx*100)}%`),this.setValue("volumeUi",Math.round(e.volumeUi*100)),this.setText("volumeUi-value",`${Math.round(e.volumeUi*100)}%`),this.setChecked("muted",e.muted),this.setChecked("gamepadEnabled",e.gamepadEnabled),this.setValue("gamepadDeadZone",Math.round(e.gamepadDeadZone*100)),this.setText("gamepadDeadZone-value",`${Math.round(e.gamepadDeadZone*100)}%`),this.setSelect("touchControls",e.touchControls),this.setChecked("touchSwapSides",e.touchSwapSides),this.setValue("touchScale",Math.round(e.touchScale*100)),this.setText("touchScale-value",`${Math.round(e.touchScale*100)}%`),this.renderBindings()}setPersistenceWarning(e){const t=this.settings.querySelector('[data-menu="persistence"]');t&&(t.hidden=e)}setResults(e){const t=this.results.querySelector('[data-menu="results-panel"]');t&&(t.dataset.record=e.isRecord?"true":"false"),this.setResultsText("results-heading",e.heading),this.setResultsText("results-total",e.total),this.setResultsText("results-best",e.best),this.setResultsText("results-delta",e.deltaToBest);const n=this.results.querySelector('[data-menu="results-delta"]');n&&(n.dataset.ahead=e.ahead?"true":"false");const s=this.results.querySelector('[data-menu="results-rows"]');if(s){s.textContent="";for(const a of e.rows){const o=document.createElement("tr"),l=document.createElement("th");l.scope="row",l.className="euc-results__row-label",l.textContent=a.label,o.appendChild(l);const c=document.createElement("td");c.className="euc-results__row-time",c.textContent=a.time,o.appendChild(c);const u=document.createElement("td");u.className="euc-results__row-delta",u.dataset.ahead=a.ahead?"true":"false",u.textContent=a.delta,o.appendChild(u),s.appendChild(o)}}const r=this.results.querySelector('[data-menu="results-notes"]');if(r){r.textContent="";for(const a of e.notes){const o=document.createElement("li");o.textContent=a,r.appendChild(o)}r.hidden=e.notes.length===0}}setChallengeAvailable(e){const t=this.title.querySelector('[data-menu="challenge"]');t&&(t.hidden=!e);const n=this.routes.querySelector('[data-menu="trial-route"]');n&&(n.hidden=!e)}get seed(){return this.seedField?.value??""}setSeed(e){this.seedField&&this.seedField.value!==e&&(this.seedField.value=e)}setWorld(e){const t=e.generated?`Fresh route · ${e.seed}`:"The hand-built city — the route everything else is measured against.";for(const r of[this.title,this.pause,this.routes]){const a=r.querySelector('[data-menu="world"]');a&&a.textContent!==t&&(a.textContent=t),a&&(a.dataset.generated=e.generated?"true":"false")}const n=this.routes.querySelector('[data-menu="ride-city"]');n&&(n.hidden=!e.generated);const s=this.routes.querySelector('[data-menu="copy-link"]');s&&(s.hidden=!e.generated)}setRouteStatus(e){const t=this.routes.querySelector('[data-menu="route-status"]');if(!t)return;const[n,s]=vT(e);t.textContent!==s&&(t.textContent=s),t.dataset.tone=n}setGamepadStatus(e){const t=this.settings.querySelector('[data-menu="gamepad-status"]');t&&(t.textContent=e==="connected"?"Gamepad connected. The keyboard keeps working at the same time.":e==="disabled"?"Gamepad input is switched off. Tick the box to use a pad.":"No gamepad detected. Connect one and press a button to wake it.")}setTouchStatus(e){const t=this.settings.querySelector('[data-menu="touch-status"]');t&&(t.textContent=e==="shown"?"On-screen controls are showing. A keyboard or pad keeps working alongside them.":e==="forced"?"On-screen controls are always shown, on every device.":e==="disabled"?"On-screen controls are switched off. This device needs a keyboard or a pad.":"Automatic: the controls appear on a touchscreen, or the first time you touch this screen.")}dispose(){this.parent.removeEventListener("click",this.onClick),this.settings.removeEventListener("input",this.onInput),this.seedField?.removeEventListener("keydown",this.onSeedKeyDown),window.removeEventListener("keydown",this.onKeyDown,!0),this.title.remove(),this.pause.remove(),this.settings.remove(),this.results.remove(),this.routes.remove()}mount(e,t){const n=document.createElement("div");return n.className=`euc-menu euc-ui ${e}`,n.hidden=!0,n.innerHTML=t,this.parent.appendChild(n),n}panelFor(e){return e==="title"?this.title:e==="pause"?this.pause:e==="settings"?this.settings:e==="results"?this.results:e==="routes"?this.routes:null}focusFirst(e){e?.querySelector(Yl())?.focus()}onClick=e=>{const t=e.target;if(!(t instanceof HTMLElement))return;const n=t.closest("[data-binding-set]");if(n){this.startListening(n.dataset.bindingSet);return}const s=t.closest("[data-binding-clear]");if(s){this.assign(s.dataset.bindingClear,[]);return}const r=t.closest("[data-menu]")?.dataset.menu;r!==void 0&&(r==="start"?this.callbacks.onStartRide():r==="challenge"?this.callbacks.onStartChallenge():r==="resume"?this.callbacks.onResume():r==="settings"?this.callbacks.onOpenSettings():r==="back"?this.callbacks.onCloseSettings():r==="quit"?this.callbacks.onQuitToTitle():r==="reset"?this.callbacks.onResetOptions():r==="retry"?this.callbacks.onRetryChallenge():r==="results-title"?this.callbacks.onResultsToTitle():r==="routes"?this.callbacks.onOpenRoutes():r==="routes-back"?this.callbacks.onCloseRoutes():r==="ride-route"?this.callbacks.onRideRoute(this.seed):r==="trial-route"?this.callbacks.onTimeTrialRoute(this.seed):r==="surprise"?this.callbacks.onSurpriseSeed():r==="ride-city"?this.callbacks.onRideTheCity():r==="copy-link"&&this.callbacks.onCopyLink())};onSeedKeyDown=e=>{e.key==="Enter"&&(e.preventDefault(),this.callbacks.onRideRoute(this.seed))};onInput=e=>{const t=e.target;if(!(t instanceof HTMLInputElement)&&!(t instanceof HTMLSelectElement))return;const n=t.dataset.option;if(n===void 0)return;if(t instanceof HTMLInputElement&&t.type==="checkbox"){this.callbacks.onChange({[n]:t.checked});return}if(n==="quality"||n==="speedUnit"||n==="touchControls"){this.callbacks.onChange({[n]:t.value});return}const s=Number(t.value),r=n==="gamepadDeadZone"||n==="touchScale"||n.startsWith("volume");this.callbacks.onChange({[n]:r?s/100:s})};onKeyDown=e=>{if(this.listening!==null){e.preventDefault(),e.stopPropagation(),e.code==="Escape"?this.stopListening():Up.has(e.code)?this.stopListening():this.assign(this.listening,[e.code]);return}if(this.screen!=="none"){if(e.code==="Escape"){if(this.screen==="settings")this.callbacks.onCloseSettings();else if(this.screen==="pause")this.callbacks.onResume();else if(this.screen==="routes")this.callbacks.onCloseRoutes();else return;e.preventDefault(),e.stopImmediatePropagation();return}e.code==="Tab"&&this.trapFocus(e)}};trapFocus(e){const t=this.panelFor(this.screen);if(!t)return;const n=[...t.querySelectorAll(Yl())].filter(o=>o.offsetParent!==null||o===document.activeElement);if(n.length===0)return;const s=n[0],r=n[n.length-1],a=document.activeElement;e.shiftKey&&a===s?(e.preventDefault(),r.focus()):!e.shiftKey&&a===r&&(e.preventDefault(),s.focus())}navigate(e){const t=this.panelFor(this.screen);if(!t)return;const n=[...t.querySelectorAll(Yl())].filter(l=>l.offsetParent!==null);if(n.length===0)return;const s=document.activeElement;if((e==="left"||e==="right")&&s instanceof HTMLElement&&this.adjustControl(s,e==="right"?1:-1))return;const r=n.indexOf(s),a=e==="up"||e==="left"?-1:1,o=r<0?a>0?0:n.length-1:(r+a+n.length)%n.length;n[o].focus(),n[o].scrollIntoView({block:"nearest"})}confirm(){const e=document.activeElement;if(this.seedField!==null&&e===this.seedField){this.callbacks.onRideRoute(this.seed);return}e instanceof HTMLElement&&e.click()}adjustControl(e,t){if(e instanceof HTMLInputElement&&e.type==="range")return t>0?e.stepUp():e.stepDown(),e.dispatchEvent(new Event("input",{bubbles:!0})),!0;if(e instanceof HTMLInputElement&&e.type==="checkbox")return e.checked=t>0,e.dispatchEvent(new Event("input",{bubbles:!0})),!0;if(e instanceof HTMLSelectElement){const n=Math.max(0,Math.min(e.options.length-1,e.selectedIndex+t));return n!==e.selectedIndex&&(e.selectedIndex=n,e.dispatchEvent(new Event("input",{bubbles:!0}))),!0}return!1}startListening(e){this.stopListening(),this.listening=e;const t=this.settings.querySelector(`[data-binding-row="${e}"]`);t&&(t.dataset.listening="true");const n=this.settings.querySelector(`[data-binding-set="${e}"]`);n&&(n.textContent="Press a key")}stopListening(){if(this.listening===null)return;const e=this.listening;this.listening=null;const t=this.settings.querySelector(`[data-binding-row="${e}"]`);t&&(t.dataset.listening="false");const n=this.settings.querySelector(`[data-binding-set="${e}"]`);n&&(n.textContent="Change")}assign(e,t){const n={...this.options.bindings};n[e]=t;for(const s of ao){if(s.action===e)continue;const r=this.options.bindings[s.action]??s.defaults,a=r.filter(o=>!t.includes(o));a.length!==r.length&&(n[s.action]=a)}this.stopListening(),this.callbacks.onChange({bindings:n})}renderBindings(){for(const e of ao){const t=this.settings.querySelector(`[data-binding-keys="${e.action}"]`);if(!t)continue;const n=this.options.bindings[e.action]??e.defaults;if(t.textContent="",n.length===0){const s=document.createElement("span");s.className="euc-key euc-key--empty",s.textContent="Unbound",t.appendChild(s);continue}for(const s of n){const r=document.createElement("span");r.className="euc-key",r.textContent=_w(s),t.appendChild(r)}}}input(e){return this.settings.querySelector(`[data-option="${e}"]`)}setValue(e,t){const n=this.input(e);n&&n.value!==String(t)&&(n.value=String(t))}setChecked(e,t){const n=this.input(e);n&&n.checked!==t&&(n.checked=t)}setSelect(e,t){const n=this.settings.querySelector(`[data-option="${e}"]`);n&&n.value!==t&&(n.value=t)}setText(e,t){const n=this.settings.querySelector(`[data-readout="${e}"]`);n&&n.textContent!==t&&(n.textContent=t)}setResultsText(e,t){const n=this.results.querySelector(`[data-menu="${e}"]`);n&&n.textContent!==t&&(n.textContent=t)}settingsTemplate(){const e=Op.map(r=>`<option value="${r}">${r[0].toUpperCase()}${r.slice(1)}</option>`).join(""),t=zp.map(r=>`<option value="${r}">${r==="kph"?"km/h":"mph"}</option>`).join(""),n=Bp.map(r=>`<option value="${r}">${dT[r]}</option>`).join(""),s=ao.map(r=>`
      <div class="euc-binding" data-binding-row="${r.action}" data-listening="false">
        <span id="euc-bind-${r.action}">${r.label}</span>
        <span class="euc-binding__keys" data-binding-keys="${r.action}"></span>
        <span>
          <button type="button" class="euc-button euc-binding__set"
                  data-binding-set="${r.action}"
                  aria-describedby="euc-bind-${r.action}">Change</button>
          <button type="button" class="euc-button euc-binding__set euc-button--quiet"
                  data-binding-clear="${r.action}"
                  aria-label="Clear the keys bound to ${r.label}">Clear</button>
        </span>
      </div>`).join("");return`
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-settings-heading">
  <h2 class="euc-menu__title" id="euc-settings-heading">Settings</h2>

  <div class="euc-settings">
    <p class="euc-settings__status" data-menu="persistence" hidden>
      This browser will not let the game save settings, so these changes last
      until you close the tab.
    </p>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Display</legend>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-quality">Quality</label>
        <select id="euc-opt-quality" data-option="quality">${e}</select>
        <span class="euc-field__value"></span>
        <p class="euc-field__note">
          Lower settings reduce resolution and shadow detail. The ride itself is
          identical at every setting.
        </p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-fov">Field of view</label>
        <input id="euc-opt-fov" type="range" min="${Wp}" max="${Xp}" step="1"
               data-option="fieldOfViewTrim" />
        <span class="euc-field__value" data-readout="fieldOfViewTrim-value">0°</span>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-units">Speed units</label>
        <select id="euc-opt-units" data-option="speedUnit">${t}</select>
        <span class="euc-field__value"></span>
      </div>
    </fieldset>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Audio</legend>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-master">Master</label>
        <input id="euc-opt-master" type="range" min="0" max="100" step="5"
               data-option="volumeMaster" />
        <span class="euc-field__value" data-readout="volumeMaster-value">100%</span>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-sfx">Ride and effects</label>
        <input id="euc-opt-sfx" type="range" min="0" max="100" step="5" data-option="volumeSfx" />
        <span class="euc-field__value" data-readout="volumeSfx-value">100%</span>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-ui">Warnings</label>
        <input id="euc-opt-ui" type="range" min="0" max="100" step="5" data-option="volumeUi" />
        <span class="euc-field__value" data-readout="volumeUi-value">100%</span>
        <p class="euc-field__note">
          Kept separate from the ride so the wheel can still tell you it is
          about to give up with everything else turned down.
        </p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-muted">Mute everything</label>
        <input id="euc-opt-muted" type="checkbox" data-option="muted" />
        <span class="euc-field__value">M</span>
      </div>
    </fieldset>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Controls</legend>
      <div class="euc-bindings">${s}</div>
      <p class="euc-controls-note">
        Escape always pauses and cannot be reassigned. F3 and F4 open the
        developer overlays.
      </p>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-pad">Gamepad</label>
        <input id="euc-opt-pad" type="checkbox" data-option="gamepadEnabled" />
        <span class="euc-field__value"></span>
        <p class="euc-controls-note" data-menu="gamepad-status"></p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-deadzone">Stick dead zone</label>
        <input id="euc-opt-deadzone" type="range" min="0" max="50" step="1"
               data-option="gamepadDeadZone" />
        <span class="euc-field__value" data-readout="gamepadDeadZone-value">18%</span>
      </div>
    </fieldset>

    <fieldset class="euc-settings__group">
      <legend class="euc-settings__legend">Touch controls</legend>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-touch">On-screen controls</label>
        <select id="euc-opt-touch" data-option="touchControls">${n}</select>
        <span class="euc-field__value"></span>
        <p class="euc-controls-note" data-menu="touch-status"></p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-touch-side">Left-handed layout</label>
        <input id="euc-opt-touch-side" type="checkbox" data-option="touchSwapSides" />
        <span class="euc-field__value"></span>
        <p class="euc-field__note">
          Puts the ride stick under your right thumb and CHARGE / HOP under your left.
        </p>
      </div>

      <div class="euc-field">
        <label class="euc-field__label" for="euc-opt-touch-size">Control size</label>
        <input id="euc-opt-touch-size" type="range" min="${Math.round(Hp*100)}"
               max="${Math.round(Gp*100)}" step="5" data-option="touchScale" />
        <span class="euc-field__value" data-readout="touchScale-value">100%</span>
        <p class="euc-field__note">
          Sizes the controls and both stick axes together, so a bigger stick
          is a gentler one rather than a twitchier one.
        </p>
      </div>
    </fieldset>

    <div class="euc-menu__actions">
      <button type="button" class="euc-button euc-button--primary" data-menu="back">Back</button>
      <button type="button" class="euc-button euc-button--quiet" data-menu="reset">
        Reset everything to defaults
      </button>
    </div>
  </div>
</div>
`}}function vT(i){return i.kind==="building"?["busy",`Building ${i.seed}…`]:i.kind==="ready"?["ready",`${i.seed} is ready to ride.`]:i.kind==="blank"?["refused","Type a seed, or choose Surprise me."]:i.kind==="no-route"?["refused",`${i.seed} doesn’t make a route. Try another seed.`]:i.kind==="copied"?["ready","Link copied. Anyone who opens it rides this route."]:i.kind==="copy-failed"?["refused",`This browser wouldn’t let the game copy it. The link is ${i.link}`]:["idle",""]}function Yl(){return'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'}const ff=["ride","brake","hop"],xT=.9,ST=.45,_T=.3,ql=.5,MT=1.5,yT=.8,pf=1.6,wT=25,ET=Object.freeze({ride:Object.freeze({keyboard:"Hold W to ride — A and D to carve",gamepad:"Right trigger to ride — left stick to carve",touch:"Push the stick up to ride — sideways to carve"}),brake:Object.freeze({keyboard:"Hold S to brake",gamepad:"Left trigger to brake",touch:"Pull the stick down to brake"}),hop:Object.freeze({keyboard:"Space to hop a kerb",gamepad:"A to hop a kerb",touch:"Tap HOP to jump — hold CHARGE first for a bigger one"})});class TT{seen;active=null;shownAt=0;eligibleAt=Number.NEGATIVE_INFINITY;started=!1;seenChanged=!1;stopped=!1;accelerateHeld=0;carveHeld=0;brakeHeld=0;hopSeen=!1;constructor(e=[]){this.seen=new Set(e)}get finished(){return ff.every(e=>this.seen.has(e))}restart(e=[]){this.seen.clear();for(const t of e)this.seen.add(t);this.active=null,this.stopped=!1,this.started=!1,this.seenChanged=!1,this.accelerateHeld=0,this.carveHeld=0,this.brakeHeld=0,this.hopSeen=!1}get current(){return this.active}dismiss(){const e=this.active;return e===null?null:(this.seen.add(e),this.seenChanged=!0,this.active=null,this.stopped=!0,e)}takeSeenChanged(){const e=this.seenChanged;return this.seenChanged=!1,e}update(e,t,n){if(!n.riding||this.finished||this.stopped)return this.active=null,this.eligibleAt=e+(this.started?pf:0),{prompt:null,text:"",completed:null};if(this.started||(this.started=!0,this.eligibleAt=e+yT),n.crashed)return{prompt:null,text:"",completed:null};this.record(t,n);let s=null;this.active===null?e>=this.eligibleAt&&this.show(this.nextPrompt(),e):this.satisfied(this.active)?s=this.finish(e):e-this.shownAt>=wT&&(s=this.finish(e),this.stopped=!0);const r=this.active;return{prompt:r,text:r===null?"":ET[r][n.device],completed:s}}seenPrompts(){return[...this.seen]}nextPrompt(){for(const e of ff)if(!this.seen.has(e)){if(this.satisfied(e)){this.seen.add(e),this.seenChanged=!0;continue}return e}return null}show(e,t){e!==null&&(this.active=e,this.shownAt=t)}finish(e){const t=this.active;return t===null?null:(this.seen.add(t),this.seenChanged=!0,this.active=null,this.eligibleAt=e+pf,t)}record(e,t){e<=0||(t.throttle>ql&&(this.accelerateHeld+=e),Math.abs(t.steer)>ql&&(this.carveHeld+=e),t.throttle<-ql&&Math.abs(t.speed)>MT&&(this.brakeHeld+=e),t.hopped&&(this.hopSeen=!0))}satisfied(e){return e==="ride"?this.accelerateHeld>=xT&&this.carveHeld>=ST:e==="brake"?this.brakeHeld>=_T:this.hopSeen}}const $l=["chase","orbit"],AT=Object.freeze([]);class RT{renderer;loop;tuning;levelPlan;controller;audio;options;appState;challenge;records;terrain;terrainView;levelId;seed="";routeStatus={kind:"idle"};pendingRoute=null;pendingRouteFrames=0;rig;actionState;keyboard;gamepad;touch;touchControls;coarsePointer;profiler;overlay;panel;stopTuningListener;stopOptionsListener;stopStateListener;hud;hudModel;menus;onboarding;promptDevice="keyboard";hudView;hudPrompt=null;ghostRecorder=new LE;ghostPlayer=new Wl(null);ghostSample=DE();resultsIn=0;pendingSplit=null;lastResult=null;lastResultWasRecord=!1;lastResultGhostDropped=!1;lastResultPreviousSplits=[];tick=0;simTimeSeconds=0;layoutChanges=0;pageHidden=typeof document<"u"&&document.visibilityState==="hidden";contextLost=!1;contextNotice;previousPose=Qa();currentPose=Qa();renderPose=Qa();chase;previousCamera=Cl();currentCamera=Cl();renderCamera=Cl();chaseView=ly();chaseInput={x:0,y:0,z:0,headingY:0,rollAngle:0,speed:0,groundY:0,airborne:!1,crashed:!1};scriptedOcclusion=null;strikePoint=new F;orbitAngle=0;previousOrbitAngle=0;cameraMode="chase";consumed={hop:0,reset:0,cameraCycle:0,pause:0,muteAudio:0};audioStepSeconds=0;lastFrameMs=-1;frameSeconds=0;wasCrashed=!1;lastThrottle=0;lastSteer=0;hudStepSeconds=0;hoppedSinceHudUpdate=!1;fieldOfViewTrimRadians=0;appliedOptions=null;lastSuspensionOffset=0;debugContext={tick:0,simTimeSeconds:0,loop:{},actions:{},consumed:this.consumed,euc:{},cameraMode:"chase",cameraDistance:0,cameraFov:0,cameraLookAhead:0,cameraBank:0,cameraYawLag:0,viewportWidth:0,viewportHeight:0,pixelRatio:0,drawCalls:0,triangles:0,geometries:0,textures:0,programs:0,profile:{},tuningOverrides:0,audio:{}};constructor(e,t=Wr,n=_o){this.tuning=new ZS;const s=new wE;this.options=new TE(s),this.records=new $E(s),this.appState=new KE,this.renderer=new ry(e);const r=t==="generated"?Ul(n):null;r!==null&&r.ok?(this.levelId="generated",this.seed=r.seed,this.levelPlan=r.plan):(this.levelId=t==="generated"?Wr:t,this.levelPlan=Fl(this.levelId,n),r!==null&&(this.routeStatus={kind:"no-route",seed:r.seed})),this.terrain=new Xd(this.levelPlan),this.terrainView=this.renderer.setLevel(this.levelPlan),this.controller=new qu(this.terrain,{spawn:this.levelPlan.spawn}),this.challenge=new hf(this.levelPlan.id,this.levelPlan.checkpoints),this.rig=sp(),this.renderer.scene.add(this.rig.group),this.audio=new oE,this.audio.setSampleUrls(fE),this.chase=new hy,this.chase.setOcclusionProbe((a,o,l)=>this.terrain.raycast(a,o,l)),this.syncPoses(),this.actionState=new gw,this.profiler=new bE,this.overlay=new SE,this.panel=new _E(this.tuning),this.hudModel=new uT({speedUnit:this.options.current.speedUnit}),this.hudView=this.hudModel.update(0,{speed:0,powerStage:"normal",tiltBack:0,offCourse:!1,crashed:!1}),this.hud=new jE({onDismissPrompt:()=>this.dismissPrompt()}),this.onboarding=new TT(this.options.current.seenPrompts),this.menus=new bT(this.options.current,{callbacks:{onStartRide:()=>this.goTo("freeRide"),onResume:()=>{this.appState.resumeRide()},onOpenSettings:()=>this.goTo("settings"),onCloseSettings:()=>{this.appState.exitSettings()},onQuitToTitle:()=>{this.resetRider(),this.goTo("title")},onChange:a=>this.options.set(a),onResetOptions:()=>this.resetOptions(),onStartChallenge:()=>this.startChallenge(),onRetryChallenge:()=>this.startChallenge(),onResultsToTitle:()=>{this.resetRider(),this.goTo("title")},onOpenRoutes:()=>this.openRoutes(),onCloseRoutes:()=>this.closeRoutes(),onRideRoute:a=>this.requestFreshRoute(a,!1),onTimeTrialRoute:a=>this.requestFreshRoute(a,!0),onSurpriseSeed:()=>this.surpriseSeed(),onRideTheCity:()=>this.rideTheCity(),onCopyLink:()=>this.copyWorldLink()},seedMaxLength:kp}),this.menus.setPersistenceWarning(this.options.persistent),this.menus.setChallengeAvailable(this.challenge.available),this.publishWorld(),this.menus.setRouteStatus(this.routeStatus),this.routeStatus.kind==="no-route"&&this.syncWorldUrl(),this.contextNotice=new ME({id:"euc-context-notice",role:"alert",title:"Graphics interrupted",message:"The browser took the graphics context away — usually a GPU reset or the machine waking up. The game is paused while it waits for the context to come back. If nothing happens, reload.",actionLabel:"Reload the game",onAction:()=>window.location.reload()}),this.renderer.setContextLossCallbacks({onLost:()=>this.handleContextLost(),onRestored:()=>this.handleContextRestored()}),this.loop=new mE({beforeFrame:this.beforeFrame,step:this.step,render:this.render,onFrameSampled:this.onFrameSampled},pE()),this.keyboard=new yw(this.actionState,{now:()=>this.simTimeSeconds,onDebugAction:a=>{a==="toggleOverlay"?this.overlay.toggle():this.panel.toggle()},onInputReset:()=>this.loop.resetTime()}),this.gamepad=new Dw(this.actionState,{now:()=>this.simTimeSeconds,stickDeadZone:ti.gamepadStickDeadZone,triggerThreshold:ti.gamepadTriggerThreshold,menuStickThreshold:ti.menuStickThreshold,menuRepeatDelaySeconds:ti.menuRepeatDelaySeconds,menuRepeatIntervalSeconds:ti.menuRepeatIntervalSeconds,onConnectionChange:a=>{a?this.promptDevice="gamepad":this.updateTouchControls(),this.updateGamepadStatus()},onMenuAction:a=>this.handleMenuAction(a)}),this.touch=new kw(this.actionState,{now:()=>this.simTimeSeconds,stickTravelPx:ti.touchStickTravelPx,stickDeadZonePx:ti.touchStickDeadZonePx,stickCurve:ti.touchStickCurve,onStickChange:(a,o)=>this.touchControls.showStick(a,o)}),this.touchControls=new Nw({input:this.touch,onFirstTouch:()=>{this.updateTouchControls(),this.updateTouchStatus()}}),this.coarsePointer=typeof window.matchMedia=="function"?window.matchMedia("(pointer: coarse)"):null,this.coarsePointer?.addEventListener("change",this.onPointerKindChange),document.addEventListener("visibilitychange",this.onVisibilityChange),this.stopTuningListener=this.tuning.onChange(()=>this.applyTuning()),this.stopOptionsListener=this.options.onChange(a=>this.applyOptions(a)),this.stopStateListener=this.appState.onChange(a=>this.enterState(a.id)),this.applyTuning(),this.applyOptions(this.options.current),this.enterState(this.appState.current),this.renderer.resize()}start(){this.profiler.begin(),this.appState.goTo("loading"),this.appState.goTo("title"),this.loop.start()}applyDebugQuery(e){const t=new URLSearchParams(e);t.get("debug")==="1"&&this.overlay.setVisible(!0),t.get("panel")==="1"&&this.panel.setVisible(!0)}advance(e){this.loop.advance(e)}buildLevel(e,t){return Fl(e,t)}setActions(e){this.actionState.setScripted(e,this.simTimeSeconds)}clearActions(){this.actionState.clearScripted()}setOcclusion(e){if(this.scriptedOcclusion=e,e===null){this.chase.setOcclusionProbe((t,n,s)=>this.terrain.raycast(t,n,s));return}this.chase.setOcclusionProbe((t,n,s)=>e<=s?e:null)}placeRider(e,t){this.controller.reset({position:e,headingY:t}),this.syncPoses(),this.renderer.clearParticles()}sampleGround(e,t){const n=bo();return this.terrain.sampleGround(e,t,n),{height:n.height,normal:{...n.normal},surface:n.surface,offCourse:n.offCourse}}snapshot(){const e=this.renderer.renderer.info;return{tick:this.tick,simTimeSeconds:this.simTimeSeconds,loop:this.loop.stats(),actions:this.actionState.sample(this.simTimeSeconds),consumed:{...this.consumed},euc:this.controller.snapshot(),camera:{mode:this.cameraMode,orbitAngle:this.orbitAngle,yaw:this.currentCamera.yaw,distance:this.currentCamera.distance,armDistance:this.currentCamera.armDistance,fov:this.currentCamera.fov,bank:this.currentCamera.bank,lookAhead:this.currentCamera.lookAhead,heightLag:this.currentCamera.heightLag,dip:this.currentCamera.dip,crashFrame:this.currentCamera.crashFrame,scriptedOcclusion:this.scriptedOcclusion!==null},particles:this.renderer.particleCounts(),viewport:this.renderer.viewport(),render:{drawCalls:e.render.calls,triangles:e.render.triangles},resources:this.resources(),tuning:{overrides:this.tuning.overrides(),overrideCount:this.tuning.overrideCount(),exposure:this.renderer.renderer.toneMappingExposure,fieldOfView:this.renderer.camera.fov},debug:{overlayVisible:this.overlay.visible,panelVisible:this.panel.visible},levelPlanId:this.levelPlan.id,level:{segments:this.levelPlan.segments.length,colliders:this.levelPlan.segments.reduce((t,n)=>t+n.colliders.length,0),solids:this.levelPlan.solids?.length??0,cellsDrawn:this.terrainView.cellsDrawn,triangles:this.terrainView.triangles,surfaces:[...Vw(this.levelPlan)].sort()},layoutChanges:this.layoutChanges,paused:this.appState.current==="paused",contextLost:this.contextLost,audio:this.audio.snapshot(),app:{state:this.appState.current,menu:this.menus.current,acceptsRideInput:this.appState.acceptsRideInput,simulates:this.appState.simulates},hud:{...this.hudView,prompt:this.hudPrompt,visible:this.hud.visible},options:{...this.options.current,persistent:this.options.persistent},gamepadConnected:this.gamepad.connected,touch:{visible:this.touchControls.visible,wanted:this.touchWanted,throttle:this.touch.throttle,steer:this.touch.steer,promptDevice:this.promptDevice},challenge:{...this.challenge.state,available:this.challenge.available,resultsIn:this.resultsIn,recordedSamples:this.ghostRecorder.sampleCount},record:(()=>{const t=this.records.best(this.levelPlan.id);return{totalSeconds:t?.totalSeconds??null,splits:t?.splits??[],hasGhost:t?.ghost!=null,persistent:this.records.persistent}})(),world:{levelId:this.levelId,seed:this.seed,generated:this.levelId==="generated",link:this.worldLink()},route:{status:this.routeStatus.kind,seed:"seed"in this.routeStatus?this.routeStatus.seed:"",pending:this.pendingRoute!==null}}}setAppState(e){return this.goTo(e)}setOptions(e){this.options.set(e)}startTimeTrial(){this.startChallenge()}clearRecords(){this.records.clearAll(),this.loadRecordReference()}resetOptions(){this.options.reset(),this.onboarding.restart(this.options.current.seenPrompts)}optionsPersist(){return this.options.persistent}startChallenge(){this.challenge.available&&(this.resetChallengeRider(),this.loadRecordReference(),this.challenge.arm(),this.renderer.setCheckpointProgress(this.challenge.state.nextIndex),this.ghostRecorder.reset(),this.resultsIn=0,this.pendingSplit=null,this.lastResult=null,this.goTo("challenge"))}loadRecordReference(){const e=this.records.best(this.levelPlan.id);this.challenge.setReference(e===null?null:{totalSeconds:e.totalSeconds,splits:e.splits}),this.ghostPlayer=new Wl(e?.ghost?im(e.ghost):null)}stepChallenge(e){if(this.appState.current!=="challenge")return;if(this.resultsIn>0&&(this.resultsIn-=e,this.resultsIn<=0)){this.resultsIn=0,this.goTo("results");return}const t=this.currentPose,n=this.challenge.step(e,{x:t.x,y:t.y,z:t.z,speed:t.speed,landed:this.controller.touchedDown,landingClean:this.controller.lastLandingQuality==="clean",crashed:this.controller.crashed}),s=this.challenge.state;this.renderer.setCheckpointProgress(s.phase==="finished"?s.total:s.nextIndex),this.renderer.stepCheckpoints(e),s.phase==="running"&&this.ghostRecorder.record(s.elapsed,{x:t.x,y:t.y,z:t.z,groundY:t.groundY,headingY:t.headingY,rollAngle:t.rollAngle,speed:t.speed,crouch:t.crouch});for(const r of n)this.handleChallengeEvent(r)}handleChallengeEvent(e){this.renderer.flareCheckpoint(e.routeIndex),e.kind==="split"?this.pendingSplit={label:e.label,delta:e.totalDelta}:e.kind==="finish"&&(this.pendingSplit=null,this.finishRun())}finishRun(){const e=this.challenge.result();if(e===null)return;this.lastResult=e;const t=this.records.best(this.levelPlan.id);this.lastResultPreviousSplits=t!==null&&t.splits.length===e.splits.length?t.splits:[];const n=this.ghostRecorder.finish(this.levelPlan.id,e.totalSeconds),s={levelId:this.levelPlan.id,totalSeconds:e.totalSeconds,splits:e.splits,setAt:new Date().toISOString(),ghost:n===null?null:UE(n)};this.lastResultWasRecord=this.records.submit(s);const r=this.records.best(this.levelPlan.id);this.lastResultGhostDropped=this.lastResultWasRecord&&s.ghost!==null&&(r===null||r.ghost===null),this.resultsIn=qe.resultsDelaySeconds}buildResultsView(){const e=this.lastResult;if(e===null)return{heading:"Run complete",isRecord:!1,total:Qs(0),best:"—",deltaToBest:"",ahead:!1,rows:[],notes:[]};const t=this.lastResultWasRecord,n=e.previousBest,s=this.lastResultPreviousSplits,r=[];for(let l=1;l<e.splits.length;l+=1){const c=l<s.length?e.splits[l]-s[l]:null;r.push({label:e.labels[l]??`Checkpoint ${l}`,time:Qs(e.splits[l]),delta:c===null?"":Jc(c),ahead:c===null||Math.round(c*100)<0})}const a=this.options.current.speedUnit,o=[`Top speed ${jc(e.topSpeed,a)} ${a==="mph"?"mph":"km/h"}`];return e.landings>0&&o.push(`Clean landings ${e.cleanLandings} of ${e.landings}`),e.crashes>0&&o.push(e.crashes===1?"One crash":`${e.crashes} crashes`),this.levelId==="generated"&&o.push(`Route seed ${this.seed}`),this.lastResultGhostDropped&&o.push("Replay not saved — storage full"),this.records.persistent||o.push("This browser will not save times after you close the tab"),{heading:t?"New record":"Run complete",isRecord:t,total:Qs(e.totalSeconds),best:n===null?"—":Qs(n),deltaToBest:n===null?"":Jc(e.totalSeconds-n),ahead:n===null||Math.round((e.totalSeconds-n)*100)<0,rows:r,notes:o}}openRoutes(){this.goTo("routes")&&(this.levelId==="generated"?(this.menus.setSeed(this.seed),this.setRouteStatus({kind:"ready",seed:this.seed})):this.routeStatus.kind==="no-route"?(this.menus.setSeed(this.routeStatus.seed),this.setRouteStatus(this.routeStatus)):(this.menus.setSeed(""),this.setRouteStatus({kind:"idle"})))}closeRoutes(){this.pendingRoute!==null&&(this.pendingRoute=null,this.pendingRouteFrames=0,this.levelId==="generated"?(this.menus.setSeed(this.seed),this.setRouteStatus({kind:"ready",seed:this.seed})):this.setRouteStatus({kind:"idle"})),this.goTo("title")}requestFreshRoute(e,t){if(this.pendingRoute!==null)return;const n=Ch(e);if(n.length===0){this.setRouteStatus({kind:"blank"});return}if(this.levelId==="generated"&&n===this.seed){this.menus.setSeed(n),this.rideLoadedWorld(t);return}this.menus.setSeed(n),this.beginRouteWork({kind:"seed",seed:n,timed:t},{kind:"building",seed:n})}surpriseSeed(){this.pendingRoute===null&&this.beginRouteWork({kind:"surprise"},{kind:"building",seed:"a fresh route"})}rideTheCity(){this.pendingRoute===null&&(this.levelId!=="slice"&&this.installLevel("slice","",Fl("slice")),this.setRouteStatus({kind:"idle"}),this.goTo("title"))}copyWorldLink(){const e=this.worldLink(),t=navigator.clipboard;if(t===void 0){this.setRouteStatus({kind:"copy-failed",link:e});return}t.writeText(e).then(()=>this.setRouteStatus({kind:"copied"}),()=>this.setRouteStatus({kind:"copy-failed",link:e}))}beginRouteWork(e,t){this.pendingRoute=e,this.pendingRouteFrames=1,this.setRouteStatus(t)}resolveFreshRoute(){const e=this.pendingRoute;if(this.pendingRoute=null,e===null)return;if(e.kind==="surprise"){for(let n=0;n<4;n+=1){const s=fw(Math.floor(Math.random()*pw));if(s===this.seed)continue;const r=Ul(s);if(r.ok){this.installLevel("generated",r.seed,r.plan),this.menus.setSeed(r.seed),this.setRouteStatus({kind:"ready",seed:r.seed});return}}this.setRouteStatus({kind:"blank"});return}const t=Ul(e.seed);if(!t.ok){this.setRouteStatus({kind:"no-route",seed:e.seed});return}this.installLevel("generated",t.seed,t.plan),this.setRouteStatus({kind:"ready",seed:t.seed}),this.rideLoadedWorld(e.timed)}rideLoadedWorld(e){e?this.startChallenge():this.goTo("freeRide")}installLevel(e,t,n){this.challenge.state.phase!=="idle"&&this.challenge.abandon(),this.ghostRecorder.reset(),this.ghostPlayer=new Wl(null),this.renderer.setGhostVisible(!1),this.resultsIn=0,this.pendingSplit=null,this.lastResult=null,this.lastResultPreviousSplits=[],this.levelId=e,this.seed=t,this.levelPlan=n,this.terrainView=this.renderer.setLevel(n),this.terrain=new Xd(n),this.controller=new qu(this.terrain,{spawn:n.spawn}),this.challenge=new hf(n.id,n.checkpoints),this.applyTuning(),this.menus.setChallengeAvailable(this.challenge.available),this.renderer.setCheckpointProgress(this.challenge.state.nextIndex),this.resetRider(),this.publishWorld(),this.syncWorldUrl()}publishWorld(){this.menus.setWorld({generated:this.levelId==="generated",seed:this.seed})}syncWorldUrl(){typeof window>"u"||!window.history||window.history.replaceState(null,"",this.worldLink())}worldLink(){const e=new URL(window.location.href);return this.levelId==="slice"?(e.searchParams.delete("level"),e.searchParams.delete("seed")):this.levelId==="generated"?(e.searchParams.set("level","generated"),e.searchParams.set("seed",this.seed)):(e.searchParams.set("level",this.levelId),e.searchParams.delete("seed")),e.toString()}setRouteStatus(e){this.routeStatus=e,this.menus.setRouteStatus(e)}armAudio(){this.audio.arm()}setVolumes(e){this.options.set({...e.master===void 0?{}:{volumeMaster:e.master},...e.sfx===void 0?{}:{volumeSfx:e.sfx},...e.ui===void 0?{}:{volumeUi:e.ui},...e.music===void 0?{}:{volumeMusic:e.music}})}setMuted(e){this.options.set({muted:e})}audioSnapshot(){return this.audio.snapshot()}audioLevel(){return this.audio.outputLevel()}audioSpectrum(){const e=this.audio.outputSpectrum();return e?{binHz:e.binHz,db:Array.from(e.db)}:null}resources(){const e=this.renderer.renderer.info.memory,t=this.renderer.renderer.info.programs?.length??0;let n=0,s=0;return this.renderer.scene.traverse(r=>{n+=1,r.isLight===!0&&(s+=1)}),{geometries:e.geometries,textures:e.textures,programs:t,sceneObjects:n,lights:s}}profileBegin(){this.profiler.begin()}profile(){return this.profiler.report()}setOverlayVisible(e){this.overlay.setVisible(e)}setTuningPanelVisible(e){this.panel.setVisible(e)}dispose(){this.loop.dispose(),this.keyboard.dispose(),this.gamepad.dispose(),this.touch.dispose(),this.touchControls.dispose(),this.coarsePointer?.removeEventListener("change",this.onPointerKindChange),document.removeEventListener("visibilitychange",this.onVisibilityChange),this.audio.dispose(),this.stopTuningListener(),this.stopOptionsListener(),this.stopStateListener(),this.overlay.dispose(),this.panel.dispose(),this.hud.dispose(),this.menus.dispose(),this.appState.dispose(),this.options.dispose(),this.records.dispose(),this.contextNotice.dispose(),this.tuning.dispose(),this.rig.dispose(),this.renderer.dispose()}beforeFrame=e=>{this.frameSeconds=this.lastFrameMs<0?0:Math.min(.25,Math.max(0,e-this.lastFrameMs)/1e3),this.lastFrameMs=e,this.gamepad.poll(this.simTimeSeconds),this.pendingRoute!==null&&(this.pendingRouteFrames>0?this.pendingRouteFrames-=1:this.resolveFreshRoute()),this.renderer.resize().layoutChanged&&(this.layoutChanges+=1,this.actionState.clearDevices(),this.touchControls.reset(),this.loop.resetTime())};step=e=>{this.tick+=1,this.simTimeSeconds+=e,this.audioStepSeconds+=e,this.hudStepSeconds+=e;const t=this.appState.acceptsRideInput,n=t?this.actionState.sample(this.simTimeSeconds):mw;let s=!1,r=!1;for(const c of t?Fp:AT)c==="hop"&&!this.controller.canAcceptHop||this.actionState.consume(c,this.simTimeSeconds)&&(this.consumed[c]+=1,c==="hop"&&(r=!0),c==="reset"&&(this.challenge.state.phase!=="idle"?this.resetChallengeRider():this.resetRider(),this.challenge.restart(),this.ghostRecorder.reset(),this.pendingSplit=null,this.resultsIn=0,s=!0),c==="cameraCycle"&&this.cycleCamera(),c==="pause"&&this.goTo("paused"),c==="muteAudio"&&this.options.set({muted:!this.options.current.muted}));if(s)return;const a=n.hop===r?n:{...n,hop:r};if(this.lastThrottle=a.throttle,this.lastSteer=a.steer,pl(this.currentPose,this.previousPose),this.controller.step(e,a),this.controller.writePose(this.currentPose),this.controller.touchedDown){const c=this.controller.lastLandingImpact;this.chase.landingImpulse(c),this.renderer.emitLandingParticles(this.currentPose.x,this.currentPose.y,this.currentPose.z,this.controller.currentSurface,c/j.landingImpactReference),this.audio.landing(c/j.landingImpactReference,this.controller.currentSurface)}const o=this.controller.pedalStrikeDepth;if(o!==0){const c=o>0?1:-1;B_(this.currentPose,c,this.strikePoint),this.renderer.emitSparks(this.strikePoint.x,this.strikePoint.y,this.strikePoint.z,Math.abs(o),c,this.currentPose.headingY,e)}this.renderer.stepParticles(e),this.controller.tookOff&&(this.audio.hop(this.controller.lastHopCharge),this.hoppedSinceHudUpdate=!0);const l=this.controller.obstacleImpact;l>0&&this.audio.impact(l),this.controller.crashed!==this.wasCrashed&&(this.controller.crashed&&this.audio.crash(this.currentPose.speed),this.wasCrashed=this.controller.crashed),this.stepChallenge(e),Pl(this.currentCamera,this.previousCamera),this.chase.step(e,this.readChaseInput(this.currentPose)),this.chase.writeState(this.currentCamera),this.previousOrbitAngle=this.orbitAngle,this.orbitAngle+=this.tuning.get("INSPECTION_CAMERA.orbitRate")*e};readChaseInput(e){const t=this.chaseInput;return t.x=e.x,t.y=e.y,t.z=e.z,t.headingY=e.headingY,t.rollAngle=e.rollAngle,t.speed=e.speed,t.groundY=e.groundY,t.airborne=e.y-e.groundY>1e-6,t.crashed=e.crashBlend>1e-6,t}render=e=>{const t=this.renderPose,n=this.previousPose,s=this.currentPose;t.x=n.x+(s.x-n.x)*e,t.y=n.y+(s.y-n.y)*e,t.z=n.z+(s.z-n.z)*e,t.headingY=n.headingY+(s.headingY-n.headingY)*e,t.rollAngle=n.rollAngle+(s.rollAngle-n.rollAngle)*e,t.riderRoll=n.riderRoll+(s.riderRoll-n.riderRoll)*e,t.riderPitch=n.riderPitch+(s.riderPitch-n.riderPitch)*e,t.riderLookYaw=n.riderLookYaw+(s.riderLookYaw-n.riderLookYaw)*e,t.wheelPitch=n.wheelPitch+(s.wheelPitch-n.wheelPitch)*e,t.wheelSpin=n.wheelSpin+(s.wheelSpin-n.wheelSpin)*e,t.groundPitch=n.groundPitch+(s.groundPitch-n.groundPitch)*e,t.groundRoll=n.groundRoll+(s.groundRoll-n.groundRoll)*e,t.suspensionOffset=n.suspensionOffset+(s.suspensionOffset-n.suspensionOffset)*e,t.restFactor=n.restFactor+(s.restFactor-n.restFactor)*e,t.speed=n.speed+(s.speed-n.speed)*e,t.crouch=n.crouch+(s.crouch-n.crouch)*e,t.tuck=n.tuck+(s.tuck-n.tuck)*e,t.airBlend=n.airBlend+(s.airBlend-n.airBlend)*e,t.airHeight=n.airHeight+(s.airHeight-n.airHeight)*e,t.groundY=n.groundY+(s.groundY-n.groundY)*e,t.pedalStrike=n.pedalStrike+(s.pedalStrike-n.pedalStrike)*e,t.wobble=n.wobble+(s.wobble-n.wobble)*e,t.wobbleFootCorrection=n.wobbleFootCorrection+(s.wobbleFootCorrection-n.wobbleFootCorrection)*e,t.wobbleYaw=n.wobbleYaw+(s.wobbleYaw-n.wobbleYaw)*e,t.alert=n.alert+(s.alert-n.alert)*e,t.tiltBack=n.tiltBack+(s.tiltBack-n.tiltBack)*e,t.crashBlend=n.crashBlend+(s.crashBlend-n.crashBlend)*e,t.crashForward=n.crashForward+(s.crashForward-n.crashForward)*e,t.crashLateral=n.crashLateral+(s.crashLateral-n.crashLateral)*e,t.crashDrop=n.crashDrop+(s.crashDrop-n.crashDrop)*e,t.crashTumble=n.crashTumble+(s.crashTumble-n.crashTumble)*e,t.crashRoll=n.crashRoll+(s.crashRoll-n.crashRoll)*e,t.wheelCrashLean=n.wheelCrashLean+(s.wheelCrashLean-n.wheelCrashLean)*e,t.recoverBlend=n.recoverBlend+(s.recoverBlend-n.recoverBlend)*e,this.rig.apply(t),this.rig.applyStatus(t.alert,this.simTimeSeconds,1-t.recoverBlend),this.renderer.setShadowFocus(t.x,t.y,t.z),this.terrainView.setSurroundCentre(t.x,t.z),this.placeCamera(t,e),this.updateAudio(t),this.updateHud(t),this.updateGhost(),this.renderer.render()};updateHud(e){const t=this.appState.acceptsRideInput,n=this.challenge.state;this.hudView=this.hudModel.update(this.simTimeSeconds,{speed:e.speed,powerStage:this.controller.powerWarning,tiltBack:e.tiltBack,offCourse:this.controller.offRoute,crashed:e.crashBlend>1e-6,challenge:n.phase==="idle"?void 0:{phase:n.phase,elapsed:n.elapsed,nextLabel:n.nextLabel,passed:n.passed,total:n.total,directionRadians:this.directionToCheckpoint(n.nextIndex,e),distanceMetres:n.distanceToNext,split:this.takePendingSplit()}});const s=this.onboarding.update(this.simTimeSeconds,this.hudStepSeconds,{riding:t,throttle:this.lastThrottle,steer:this.lastSteer,speed:e.speed,hopped:this.hoppedSinceHudUpdate,crashed:e.crashBlend>1e-6,device:this.promptDevice});this.hudStepSeconds=0,this.hoppedSinceHudUpdate=!1,this.hudPrompt=s.prompt,this.persistSeenPrompts(),this.hud.visible&&this.hud.update(this.hudView,s.text)}updateGhost(){if(this.appState.current!=="challenge"||!this.ghostPlayer.hasTrack){this.renderer.setGhostVisible(!1);return}const e=this.challenge.state;if(e.phase!=="running"||!this.ghostPlayer.sample(e.elapsed,this.ghostSample)){this.renderer.setGhostVisible(!1);return}this.renderer.setGhostVisible(!0),this.renderer.applyGhost(this.ghostSample)}takePendingSplit(){const e=this.pendingSplit;return this.pendingSplit=null,e}updateAudio(e){const t=this.audio.input;t.speed=e.speed,t.throttle=this.lastThrottle,t.load=this.controller.powerLoad,t.powerStage=this.controller.powerWarning,t.surface=this.controller.currentSurface,t.grounded=e.y-e.groundY<=1e-6;const n=!this.appState.acceptsRideInput||this.contextLost,s=this.audioStepSeconds>0?this.audioStepSeconds:n?this.frameSeconds:0;t.suspensionSpeed=s>0?(e.suspensionOffset-this.lastSuspensionOffset)/s:0,this.lastSuspensionOffset=e.suspensionOffset,t.scrape=Math.abs(e.pedalStrike),t.wobble=e.wobble,t.crashed=e.crashBlend>1e-6,t.idle=n,this.audio.update(s),this.audioStepSeconds=0}placeCamera(e,t){const n=this.renderer.camera;if(this.cameraMode==="orbit"){const r=this.previousOrbitAngle+(this.orbitAngle-this.previousOrbitAngle)*t,a=Ze.distanceAtRest*Ka.distanceFactor;n.position.set(e.x+Math.sin(r)*a,e.y+it.shellHeight*Ka.heightFactor,e.z+Math.cos(r)*a),n.up.set(0,1,0),n.lookAt(e.x,e.y+ms.hipHeight*Ka.targetHeightFactor,e.z),this.renderer.setFieldOfView(this.chase.tuning.fovAtRest);return}oy(this.previousCamera,this.currentCamera,t,this.renderCamera);const s=this.chaseView;uy(this.renderCamera,this.readChaseInput(e),this.chase.tuning,s),n.position.set(s.positionX,s.positionY,s.positionZ),n.up.set(0,1,0),n.lookAt(s.targetX,s.targetY,s.targetZ),s.roll!==0&&n.rotateZ(-s.roll),this.renderer.setFieldOfView(s.fov+this.fieldOfViewTrimRadians)}onFrameSampled=e=>{this.profiler.record(e);const t=performance.now();if(!this.overlay.shouldRefresh(t))return;const n=this.debugContext,s=this.renderer.renderer.info,r=this.renderer.viewport();n.tick=this.tick,n.simTimeSeconds=this.simTimeSeconds,n.loop=this.loop.stats(),n.actions=this.actionState.sample(this.simTimeSeconds),n.euc=this.controller.snapshot(),n.cameraMode=this.cameraMode,n.cameraDistance=this.currentCamera.armDistance,n.cameraFov=this.currentCamera.fov,n.cameraLookAhead=this.currentCamera.lookAhead,n.cameraBank=this.currentCamera.bank,n.cameraYawLag=go(this.currentPose.headingY-this.currentCamera.yaw),n.viewportWidth=r.width,n.viewportHeight=r.height,n.pixelRatio=r.pixelRatio,n.drawCalls=s.render.calls,n.triangles=s.render.triangles,n.geometries=s.memory.geometries,n.textures=s.memory.textures,n.programs=s.programs?.length??0,n.profile=this.profiler.report(),n.tuningOverrides=this.tuning.overrideCount(),n.audio=this.audio.snapshot(),this.overlay.update(n,t)};resetRider(){this.resetRiderTo(this.levelPlan.spawn)}resetChallengeRider(){const e=this.levelPlan.checkpoints.find(r=>r.kind==="start");if(e===void 0){this.resetRider();return}const t=e.centre.x-Math.sin(e.headingY)*qe.startRunupMetres,n=e.centre.z-Math.cos(e.headingY)*qe.startRunupMetres,s=bo();this.terrain.sampleGround(t,n,s),this.resetRiderTo({position:{x:t,y:s.height,z:n},headingY:e.headingY})}resetRiderTo(e){this.controller.reset(e),this.syncPoses(),this.orbitAngle=0,this.previousOrbitAngle=0,this.renderer.clearParticles(),this.audio.reset(),this.lastThrottle=0,this.lastSteer=0,this.lastSuspensionOffset=0,this.wasCrashed=!1,this.hudModel.reset()}directionToCheckpoint(e,t){if(e<0)return Number.NaN;const n=this.levelPlan.checkpoints.find(s=>s.routeIndex===e);return n===void 0?Number.NaN:go(Math.atan2(n.centre.x-t.x,n.centre.z-t.z)-t.headingY)}cycleCamera(){const e=($l.indexOf(this.cameraMode)+1)%$l.length;this.cameraMode=$l[e]}goTo(e){return this.appState.goTo(e)}enterState(e){const t=this.appState.spec;t.resetsInput&&(this.keyboard.reset(),this.loop.resetTime());const n=e==="challenge"||e==="results"||(e==="paused"||e==="settings")&&this.challenge.state.phase!=="idle";this.renderer.setCheckpointsVisible(n),n||this.renderer.setGhostVisible(!1),(e==="title"||e==="freeRide")&&this.challenge.state.phase!=="idle"&&(this.challenge.abandon(),this.ghostRecorder.reset(),this.resultsIn=0,this.pendingSplit=null),e==="results"&&this.menus.setResults(this.buildResultsView()),this.hud.setVisible(t.showsHud),this.menus.show(CT(e)),this.gamepad.setMenuMode(t.showsMenu),this.updateTouchControls(),t.acceptsRideInput||this.hudModel.reset(),this.updateRunning()}handleMenuAction(e){if(this.appState.showsMenu){if(e==="up"||e==="down"||e==="left"||e==="right"){this.menus.navigate(e);return}if(e==="confirm"){this.menus.confirm();return}e==="back"&&(this.appState.current==="settings"?this.appState.exitSettings():this.appState.current==="routes"?this.closeRoutes():this.appState.current==="paused"&&this.appState.resumeRide())}}get touchWanted(){const e=this.options.current.touchControls;return e==="off"?!1:e==="on"?!0:(this.coarsePointer?.matches??!1)||this.touchControls.touchSeen}updateTouchControls(){const e=this.touchWanted;this.touchControls.setActive(e&&this.appState.acceptsRideInput),this.hud.setTouchLayout(e),this.gamepad.connected||(this.promptDevice=e?"touch":"keyboard")}updateTouchStatus(){const e=this.options.current.touchControls;this.menus.setTouchStatus(e==="off"?"disabled":e==="on"?"forced":this.touchWanted?"shown":"waiting")}updateGamepadStatus(){this.menus.setGamepadStatus(this.options.current.gamepadEnabled?this.gamepad.connected?"connected":"searching":"disabled")}dismissPrompt(){this.onboarding.dismiss(),this.persistSeenPrompts()}persistSeenPrompts(){this.onboarding.takeSeenChanged()&&this.options.set({seenPrompts:this.onboarding.seenPrompts()})}handleContextLost(){this.contextLost=!0,this.appState.current==="paused"&&this.appState.resumeRide(),this.keyboard.reset(),this.contextNotice.show(),this.updateRunning()}onPointerKindChange=()=>{this.updateTouchControls(),this.updateTouchStatus()};onVisibilityChange=()=>{const e=document.visibilityState==="hidden";this.audio.setSuspended(e),this.pageHidden=e,this.updateRunning()};handleContextRestored(){this.contextLost=!1,this.contextNotice.hide(),this.keyboard.reset(),this.updateRunning()}updateRunning(){this.loop.setRunning(this.appState.simulates&&!this.contextLost&&!this.pageHidden)}syncPoses(){this.controller.writePose(this.currentPose),pl(this.currentPose,this.previousPose),pl(this.currentPose,this.renderPose),this.rig.apply(this.renderPose),this.chase.reset(this.readChaseInput(this.currentPose)),this.chase.writeState(this.currentCamera),Pl(this.currentCamera,this.previousCamera),Pl(this.currentCamera,this.renderCamera)}applyTuning(){this.renderer.applyLighting({exposure:this.tuning.get("LIGHTING.exposure"),sunIntensity:this.tuning.get("LIGHTING.sunIntensity"),hemisphereIntensity:this.tuning.get("LIGHTING.hemisphereIntensity")}),this.renderer.setMaxPixelRatio(this.tuning.get("RENDER.maxPixelRatio")),this.loop.setMaxStepsPerFrame(this.tuning.get("SIMULATION.maxStepsPerFrame")),this.pushCameraTuning(),this.controller.setTuning({maxLeanPitch:this.tuning.get("EUC.maxLeanPitch"),leanResponseSeconds:this.tuning.get("EUC.leanResponseSeconds"),leanRateLimit:this.tuning.get("EUC.leanRateLimit"),leanToAccel:this.tuning.get("EUC.leanToAccel"),brakeAuthority:this.tuning.get("EUC.brakeAuthority"),dragCoefficient:this.tuning.get("EUC.dragCoefficient"),rollingResistanceScale:this.tuning.get("TERRAIN.rollingResistanceScale"),curbImpactPerMetre:this.tuning.get("TERRAIN.curbImpactPerMetre"),suspensionFrequencyHz:this.tuning.get("TERRAIN.suspensionFrequencyHz"),suspensionDamping:this.tuning.get("TERRAIN.suspensionDamping"),yawRateLow:this.tuning.get("EUC.yawRateLow"),yawRateHigh:this.tuning.get("EUC.yawRateHigh"),carveSpeed:this.tuning.get("EUC.carveSpeed"),maxLateralG:this.tuning.get("EUC.maxLateralG"),rollResponseSeconds:this.tuning.get("EUC.rollResponseSeconds"),riderUpperBodyRollFactor:this.tuning.get("EUC.riderUpperBodyRollFactor"),maxRiderPitch:this.tuning.get("EUC.maxRiderPitch"),riderCruisePitchFactor:this.tuning.get("EUC.riderCruisePitchFactor"),riderAccelerationPitchGain:this.tuning.get("EUC.riderAccelerationPitchGain"),riderPitchResponseSeconds:this.tuning.get("EUC.riderPitchResponseSeconds"),wheelPitchFactor:this.tuning.get("EUC.wheelPitchFactor"),riderLookIntoTurn:this.tuning.get("EUC.riderLookIntoTurn"),riderSlopeLeanFactor:this.tuning.get("EUC.riderSlopeLeanFactor"),groundTiltPitchFollow:this.tuning.get("TERRAIN.groundTiltPitchFollow"),groundTiltRollFollow:this.tuning.get("TERRAIN.groundTiltRollFollow"),hopLaunchSpeed:this.tuning.get("EUC.hopLaunchSpeed"),hopCompressSeconds:this.tuning.get("EUC.hopCompressSeconds"),hopChargeHeightBonus:this.tuning.get("EUC.hopChargeHeightBonus"),airYawFactor:this.tuning.get("EUC.airYawFactor"),pedalStrikeDecel:this.tuning.get("EUC.pedalStrikeDecel"),landingImpactReference:this.tuning.get("EUC.landingImpactReference"),landingSpeedLossPerScore:this.tuning.get("EUC.landingSpeedLossPerScore"),wobbleMasterGain:this.tuning.get("EUC.wobbleMasterGain"),wobbleReversalMemorySeconds:this.tuning.get("EUC.wobbleReversalMemorySeconds"),wobbleDampingAggressive:this.tuning.get("EUC.wobbleDampingAggressive"),wobbleDampingSmooth:this.tuning.get("EUC.wobbleDampingSmooth"),wobbleFootCorrectionDamping:this.tuning.get("EUC.wobbleFootCorrectionDamping"),wobbleMaxYaw:this.tuning.get("EUC.wobbleMaxYaw"),wobbleFrequencyHz:this.tuning.get("EUC.wobbleFrequencyHz"),wobbleSurfaceGain:this.tuning.get("EUC.wobbleSurfaceGain"),wobbleSteerReversalGain:this.tuning.get("EUC.wobbleSteerReversalGain"),powerComfortSpeed:this.tuning.get("EUC.powerComfortSpeed"),powerSlopeLoad:this.tuning.get("EUC.powerSlopeLoad"),powerTiltBackLoad:this.tuning.get("EUC.powerTiltBackLoad"),tiltBackLeanBack:this.tuning.get("EUC.tiltBackLeanBack"),obstacleCrashSpeed:this.tuning.get("EUC.obstacleCrashSpeed"),crashRecoverSpeedFactor:this.tuning.get("EUC.crashRecoverSpeedFactor"),crashRecoverAutoSeconds:this.tuning.get("EUC.crashRecoverAutoSeconds")}),this.audio.setTuning({bedTrim:this.tuning.get("AUDIO.bedTrim"),motorPolePairs:this.tuning.get("AUDIO.motorPolePairs"),motorIdleLevel:this.tuning.get("AUDIO.motorIdleLevel"),motorLoadLevel:this.tuning.get("AUDIO.motorLoadLevel"),motorSingLevel:this.tuning.get("AUDIO.motorSingLevel"),motorAirLevel:this.tuning.get("AUDIO.motorAirLevel"),motorLoadBrighten:this.tuning.get("AUDIO.motorLoadBrighten"),regenLevel:this.tuning.get("AUDIO.regenLevel"),windLevel:this.tuning.get("AUDIO.windLevel"),beepLevel:this.tuning.get("AUDIO.beepLevel"),tyreLevel:this.tuning.get("AUDIO.tyreLevel"),tiltBackLevel:this.tuning.get("AUDIO.tiltBackLevel"),duckTiltBack:this.tuning.get("AUDIO.duckTiltBack")});for(const e of jf){const t={};for(const n of["rollingResistance","grip","roughnessAmplitude"]){const s=`SURFACES.${e}.${n}`;this.tuning.specFor(s)!==void 0&&(t[n]=this.tuning.get(s))}Object.keys(t).length>0&&this.controller.setSurfaceResponse(e,t)}}applyOptions(e){const t=this.appliedOptions;(t===null||e.quality!==t.quality)&&this.renderer.setQuality(e.quality,this.tuning.get("RENDER.maxPixelRatio")),(t===null||e.volumeMaster!==t.volumeMaster||e.volumeSfx!==t.volumeSfx||e.volumeUi!==t.volumeUi||e.volumeMusic!==t.volumeMusic)&&this.audio.setVolumes({master:e.volumeMaster,sfx:e.volumeSfx,ui:e.volumeUi,music:e.volumeMusic}),(t===null||e.muted!==t.muted)&&this.audio.setMuted(e.muted),(t===null||e.bindings!==t.bindings)&&this.keyboard.setBindings(Ph(e.bindings)),(t===null||e.gamepadEnabled!==t.gamepadEnabled)&&(this.gamepad.setEnabled(e.gamepadEnabled),this.updateGamepadStatus()),(t===null||e.gamepadDeadZone!==t.gamepadDeadZone)&&this.gamepad.setDeadZone(e.gamepadDeadZone),(t===null||e.touchControls!==t.touchControls)&&(this.updateTouchControls(),this.updateTouchStatus()),(t===null||e.touchSwapSides!==t.touchSwapSides)&&this.touchControls.setSwapSides(e.touchSwapSides),(t===null||e.touchScale!==t.touchScale)&&(this.touchControls.setScale(e.touchScale),this.touch.setScale(e.touchScale)),(t===null||e.fieldOfViewTrim!==t.fieldOfViewTrim)&&(this.fieldOfViewTrimRadians=Nc.degToRad(e.fieldOfViewTrim)),(t===null||e.speedUnit!==t.speedUnit)&&this.hudModel.setSpeedUnit(e.speedUnit),this.menus.sync(e),this.appliedOptions=e}pushCameraTuning(){this.chase.setTuning({distanceAtRest:this.tuning.get("CAMERA.distanceAtRest"),distanceAtSpeed:this.tuning.get("CAMERA.distanceAtSpeed"),armHeight:this.tuning.get("CAMERA.armHeight"),fovAtRest:this.tuning.get("CAMERA.fovAtRest"),fovAtSpeed:this.tuning.get("CAMERA.fovAtSpeed"),lookAheadSeconds:this.tuning.get("CAMERA.lookAheadSeconds"),yawLagAtRest:this.tuning.get("CAMERA.yawLagAtRest"),yawLagAtSpeed:this.tuning.get("CAMERA.yawLagAtSpeed"),bankFactor:this.tuning.get("CAMERA.bankFactor"),airHeightFollow:this.tuning.get("CAMERA.airHeightFollow"),landingDipMax:this.tuning.get("CAMERA.landingDipMax"),crashDistance:this.tuning.get("CAMERA.crashDistance")})}}function CT(i){return i==="title"?"title":i==="paused"?"pause":i==="settings"?"settings":i==="results"?"results":i==="routes"?"routes":"none"}const Ir=Object.freeze({title:"EUC Thrills",author:"VibezZzCoder",authorUrl:"https://github.com/VibezZzCoder",repositoryUrl:"https://github.com/VibezZzCoder/EUC-thrills",homepageUrl:"https://vibezzzcoder.github.io/EUC-thrills/",year:"2026",licence:"MIT",assetLicence:"CC-BY-4.0"});function PT(){return`${Ir.title} — original work by ${Ir.author} (${Ir.authorUrl}). Source: ${Ir.repositoryUrl}`}const Va=document.getElementById("boot"),mf=document.getElementById("boot-status"),Zl=document.getElementById("boot-error");function lo(i,e){const t=e instanceof Error?`${i}

${e.message}`:i;Zl&&(Zl.textContent=t,Zl.hidden=!1),mf&&(mf.textContent="Could not start");const n=document.getElementById("boot-track");n&&(n.hidden=!0),console.error(i,e)}function LT(){try{const i=document.createElement("canvas");return!!(i.getContext("webgl2")??i.getContext("webgl"))}catch{return!1}}function IT(){if(!Va)return;Va.classList.add("is-dismissed");const i=()=>{Va.hidden=!0};Va.addEventListener("transitionend",i,{once:!0}),window.setTimeout(i,400)}function DT(){console.info(`${PT()} · Play: ${Ir.homepageUrl}`)}function kT(){const i=document.getElementById("viewport");if(!(i instanceof HTMLCanvasElement)){lo("The rendering surface is missing from the page.");return}if(!LT()){lo("EUC Thrills needs WebGL, and this browser could not provide it. Try updating the browser, or enabling hardware acceleration in its settings.");return}let e;try{e=new RT(i,uw(window.location.search),dw(window.location.search))}catch(n){lo("EUC Thrills could not start.",n);return}e.applyDebugQuery(window.location.search);const t=()=>{window.removeEventListener("pagehide",t),e.dispose()};window.addEventListener("pagehide",t),window.game=e,e.start(),IT()}DT();try{kT()}catch(i){lo("EUC Thrills failed to start.",i)}
