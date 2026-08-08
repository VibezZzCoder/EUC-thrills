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
 */const gc="185",np=0,th=1,ip=2,vr=1,sp=2,dr=3,Wi=0,un=1,di=2,bi=0,zs=1,nh=2,ih=3,sh=4,rp=5,ts=100,ap=101,op=102,lp=103,cp=104,hp=200,up=201,dp=202,fp=203,gl=204,vl=205,pp=206,mp=207,gp=208,vp=209,bp=210,_p=211,Sp=212,xp=213,Mp=214,bl=0,_l=1,Sl=2,Ws=3,xl=4,Ml=5,yl=6,wl=7,_d=0,yp=1,wp=2,Kn=0,Sd=1,xd=2,Md=3,vc=4,yd=5,wd=6,Ed=7,Td=300,cs=301,Xs=302,xa=303,ao=304,$a=306,Oa=1e3,$n=1001,El=1002,$t=1003,Ep=1004,Cr=1005,Zt=1006,oo=1007,zi=1008,_n=1009,Ad=1010,Rd=1011,Sr=1012,bc=1013,ei=1014,kn=1015,xi=1016,_c=1017,Sc=1018,xr=1020,Cd=35902,Pd=35899,Ld=1021,Dd=1022,En=1023,Mi=1026,is=1027,xc=1028,Mc=1029,hs=1030,yc=1031,wc=1033,Ma=33776,ya=33777,wa=33778,Ea=33779,Tl=35840,Al=35841,Rl=35842,Cl=35843,Pl=36196,Ll=37492,Dl=37496,Il=37488,Fl=37489,za=37490,Ul=37491,Nl=37808,kl=37809,Ol=37810,zl=37811,Bl=37812,Hl=37813,Gl=37814,Vl=37815,Wl=37816,Xl=37817,Yl=37818,ql=37819,$l=37820,Zl=37821,Kl=36492,Jl=36494,Ql=36495,jl=36283,ec=36284,Ba=36285,tc=36286,Tp=3200,nc=0,Ap=1,Oi="",cn="srgb",Ha="srgb-linear",Ga="linear",pt="srgb",_s=7680,rh=519,Rp=512,Cp=513,Pp=514,Ec=515,Lp=516,Dp=517,Tc=518,Ip=519,ah=35044,oh=35048,lh="300 es",Zn=2e3,Mr=2001;function Fp(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function Va(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Up(){const i=Va("canvas");return i.style.display="block",i}const ch={};function hh(...i){const e="THREE."+i.shift();console.log(e,...i)}function Id(i){const e=i[0];if(typeof e=="string"&&e.startsWith("TSL:")){const t=i[1];t&&t.isStackTrace?i[0]+=" "+t.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function ze(...i){i=Id(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...i)}}function ct(...i){i=Id(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...i)}}function Bs(...i){const e=i.join(" ");e in ch||(ch[e]=!0,ze(...i))}function Np(i,e,t){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(e,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}const kp={[bl]:_l,[Sl]:yl,[xl]:wl,[Ws]:Ml,[_l]:bl,[yl]:Sl,[wl]:xl,[Ml]:Ws};class fs{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){const n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){const n=this._listeners;if(n===void 0)return;const s=n[e];if(s!==void 0){const r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const n=t[e.type];if(n!==void 0){e.target=this;const s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,e);e.target=null}}}const Qt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let uh=1234567;const br=Math.PI/180,yr=180/Math.PI;function Zs(){const i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Qt[i&255]+Qt[i>>8&255]+Qt[i>>16&255]+Qt[i>>24&255]+"-"+Qt[e&255]+Qt[e>>8&255]+"-"+Qt[e>>16&15|64]+Qt[e>>24&255]+"-"+Qt[t&63|128]+Qt[t>>8&255]+"-"+Qt[t>>16&255]+Qt[t>>24&255]+Qt[n&255]+Qt[n>>8&255]+Qt[n>>16&255]+Qt[n>>24&255]).toLowerCase()}function it(i,e,t){return Math.max(e,Math.min(t,i))}function Ac(i,e){return(i%e+e)%e}function Op(i,e,t,n,s){return n+(i-e)*(s-n)/(t-e)}function zp(i,e,t){return i!==e?(t-i)/(e-i):0}function _r(i,e,t){return(1-t)*i+t*e}function Bp(i,e,t,n){return _r(i,e,1-Math.exp(-t*n))}function Hp(i,e=1){return e-Math.abs(Ac(i,e*2)-e)}function Gp(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*(3-2*i))}function Vp(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*i*(i*(i*6-15)+10))}function Wp(i,e){return i+Math.floor(Math.random()*(e-i+1))}function Xp(i,e){return i+Math.random()*(e-i)}function Yp(i){return i*(.5-Math.random())}function qp(i){i!==void 0&&(uh=i);let e=uh+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function $p(i){return i*br}function Zp(i){return i*yr}function Kp(i){return(i&i-1)===0&&i!==0}function Jp(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function Qp(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function jp(i,e,t,n,s){const r=Math.cos,a=Math.sin,o=r(t/2),l=a(t/2),c=r((e+n)/2),u=a((e+n)/2),d=r((e-n)/2),h=a((e-n)/2),f=r((n-e)/2),v=a((n-e)/2);switch(s){case"XYX":i.set(o*u,l*d,l*h,o*c);break;case"YZY":i.set(l*h,o*u,l*d,o*c);break;case"ZXZ":i.set(l*d,l*h,o*u,o*c);break;case"XZX":i.set(o*u,l*v,l*f,o*c);break;case"YXY":i.set(l*f,o*u,l*v,o*c);break;case"ZYZ":i.set(l*v,l*f,o*u,o*c);break;default:ze("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function Ns(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function nn(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}const ic={DEG2RAD:br,RAD2DEG:yr,generateUUID:Zs,clamp:it,euclideanModulo:Ac,mapLinear:Op,inverseLerp:zp,lerp:_r,damp:Bp,pingpong:Hp,smoothstep:Gp,smootherstep:Vp,randInt:Wp,randFloat:Xp,randFloatSpread:Yp,seededRandom:qp,degToRad:$p,radToDeg:Zp,isPowerOfTwo:Kp,ceilPowerOfTwo:Jp,floorPowerOfTwo:Qp,setQuaternionFromProperEuler:jp,normalize:nn,denormalize:Ns};class tt{static{tt.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,n=this.y,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6],this.y=s[1]*t+s[4]*n+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=it(this.x,e.x,t.x),this.y=it(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=it(this.x,e,t),this.y=it(this.y,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(it(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(it(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const n=Math.cos(t),s=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*s+e.x,this.y=r*s+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Sn{constructor(e=0,t=0,n=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=s}static slerpFlat(e,t,n,s,r,a,o){let l=n[s+0],c=n[s+1],u=n[s+2],d=n[s+3],h=r[a+0],f=r[a+1],v=r[a+2],_=r[a+3];if(d!==_||l!==h||c!==f||u!==v){let p=l*h+c*f+u*v+d*_;p<0&&(h=-h,f=-f,v=-v,_=-_,p=-p);let g=1-o;if(p<.9995){const M=Math.acos(p),T=Math.sin(M);g=Math.sin(g*M)/T,o=Math.sin(o*M)/T,l=l*g+h*o,c=c*g+f*o,u=u*g+v*o,d=d*g+_*o}else{l=l*g+h*o,c=c*g+f*o,u=u*g+v*o,d=d*g+_*o;const M=1/Math.sqrt(l*l+c*c+u*u+d*d);l*=M,c*=M,u*=M,d*=M}}e[t]=l,e[t+1]=c,e[t+2]=u,e[t+3]=d}static multiplyQuaternionsFlat(e,t,n,s,r,a){const o=n[s],l=n[s+1],c=n[s+2],u=n[s+3],d=r[a],h=r[a+1],f=r[a+2],v=r[a+3];return e[t]=o*v+u*d+l*f-c*h,e[t+1]=l*v+u*h+c*d-o*f,e[t+2]=c*v+u*f+o*h-l*d,e[t+3]=u*v-o*d-l*h-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,s){return this._x=e,this._y=t,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const n=e._x,s=e._y,r=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(n/2),u=o(s/2),d=o(r/2),h=l(n/2),f=l(s/2),v=l(r/2);switch(a){case"XYZ":this._x=h*u*d+c*f*v,this._y=c*f*d-h*u*v,this._z=c*u*v+h*f*d,this._w=c*u*d-h*f*v;break;case"YXZ":this._x=h*u*d+c*f*v,this._y=c*f*d-h*u*v,this._z=c*u*v-h*f*d,this._w=c*u*d+h*f*v;break;case"ZXY":this._x=h*u*d-c*f*v,this._y=c*f*d+h*u*v,this._z=c*u*v+h*f*d,this._w=c*u*d-h*f*v;break;case"ZYX":this._x=h*u*d-c*f*v,this._y=c*f*d+h*u*v,this._z=c*u*v-h*f*d,this._w=c*u*d+h*f*v;break;case"YZX":this._x=h*u*d+c*f*v,this._y=c*f*d+h*u*v,this._z=c*u*v-h*f*d,this._w=c*u*d-h*f*v;break;case"XZY":this._x=h*u*d-c*f*v,this._y=c*f*d-h*u*v,this._z=c*u*v+h*f*d,this._w=c*u*d+h*f*v;break;default:ze("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const n=t/2,s=Math.sin(n);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,n=t[0],s=t[4],r=t[8],a=t[1],o=t[5],l=t[9],c=t[2],u=t[6],d=t[10],h=n+o+d;if(h>0){const f=.5/Math.sqrt(h+1);this._w=.25/f,this._x=(u-l)*f,this._y=(r-c)*f,this._z=(a-s)*f}else if(n>o&&n>d){const f=2*Math.sqrt(1+n-o-d);this._w=(u-l)/f,this._x=.25*f,this._y=(s+a)/f,this._z=(r+c)/f}else if(o>d){const f=2*Math.sqrt(1+o-n-d);this._w=(r-c)/f,this._x=(s+a)/f,this._y=.25*f,this._z=(l+u)/f}else{const f=2*Math.sqrt(1+d-n-o);this._w=(a-s)/f,this._x=(r+c)/f,this._y=(l+u)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(it(this.dot(e),-1,1)))}rotateTowards(e,t){const n=this.angleTo(e);if(n===0)return this;const s=Math.min(1,t/n);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const n=e._x,s=e._y,r=e._z,a=e._w,o=t._x,l=t._y,c=t._z,u=t._w;return this._x=n*u+a*o+s*c-r*l,this._y=s*u+a*l+r*o-n*c,this._z=r*u+a*c+n*l-s*o,this._w=a*u-n*o-s*l-r*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,s=e._y,r=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,s=-s,r=-r,a=-a,o=-o);let l=1-t;if(o<.9995){const c=Math.acos(o),u=Math.sin(c);l=Math.sin(l*c)/u,t=Math.sin(t*c)/u,this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(e),s*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class I{static{I.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(dh.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(dh.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*s,this.y=r[1]*t+r[4]*n+r[7]*s,this.z=r[2]*t+r[5]*n+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(e){const t=this.x,n=this.y,s=this.z,r=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*s-o*n),u=2*(o*t-r*s),d=2*(r*n-a*t);return this.x=t+l*c+a*d-o*u,this.y=n+l*u+o*c-r*d,this.z=s+l*d+r*u-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*s,this.y=r[1]*t+r[5]*n+r[9]*s,this.z=r[2]*t+r[6]*n+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=it(this.x,e.x,t.x),this.y=it(this.y,e.y,t.y),this.z=it(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=it(this.x,e,t),this.y=it(this.y,e,t),this.z=it(this.z,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(it(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const n=e.x,s=e.y,r=e.z,a=t.x,o=t.y,l=t.z;return this.x=s*l-r*o,this.y=r*a-n*l,this.z=n*o-s*a,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return lo.copy(this).projectOnVector(e),this.sub(lo)}reflect(e){return this.sub(lo.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(it(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y,s=this.z-e.z;return t*t+n*n+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){const s=Math.sin(t)*e;return this.x=s*Math.sin(n),this.y=Math.cos(t)*e,this.z=s*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const lo=new I,dh=new Sn;class We{static{We.prototype.isMatrix3=!0}constructor(e,t,n,s,r,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c)}set(e,t,n,s,r,a,o,l,c){const u=this.elements;return u[0]=e,u[1]=s,u[2]=o,u[3]=t,u[4]=r,u[5]=l,u[6]=n,u[7]=a,u[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],u=n[4],d=n[7],h=n[2],f=n[5],v=n[8],_=s[0],p=s[3],g=s[6],M=s[1],T=s[4],S=s[7],R=s[2],y=s[5],E=s[8];return r[0]=a*_+o*M+l*R,r[3]=a*p+o*T+l*y,r[6]=a*g+o*S+l*E,r[1]=c*_+u*M+d*R,r[4]=c*p+u*T+d*y,r[7]=c*g+u*S+d*E,r[2]=h*_+f*M+v*R,r[5]=h*p+f*T+v*y,r[8]=h*g+f*S+v*E,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8];return t*a*u-t*o*c-n*r*u+n*o*l+s*r*c-s*a*l}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8],d=u*a-o*c,h=o*l-u*r,f=c*r-a*l,v=t*d+n*h+s*f;if(v===0)return this.set(0,0,0,0,0,0,0,0,0);const _=1/v;return e[0]=d*_,e[1]=(s*c-u*n)*_,e[2]=(o*n-s*a)*_,e[3]=h*_,e[4]=(u*t-s*l)*_,e[5]=(s*r-o*t)*_,e[6]=f*_,e[7]=(n*l-c*t)*_,e[8]=(a*t-n*r)*_,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,s,r,a,o){const l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+e,-s*c,s*l,-s*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return Bs("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(co.makeScale(e,t)),this}rotate(e){return Bs("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(co.makeRotation(-e)),this}translate(e,t){return Bs("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(co.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<9;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const co=new We,fh=new We().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),ph=new We().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function em(){const i={enabled:!0,workingColorSpace:Ha,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===pt&&(s.r=_i(s.r),s.g=_i(s.g),s.b=_i(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===pt&&(s.r=Hs(s.r),s.g=Hs(s.g),s.b=Hs(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Oi?Ga:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return Bs("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return Bs("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[Ha]:{primaries:e,whitePoint:n,transfer:Ga,toXYZ:fh,fromXYZ:ph,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:cn},outputColorSpaceConfig:{drawingBufferColorSpace:cn}},[cn]:{primaries:e,whitePoint:n,transfer:pt,toXYZ:fh,fromXYZ:ph,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:cn}}}),i}const st=em();function _i(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Hs(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}let Ss;class tm{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Ss===void 0&&(Ss=Va("canvas")),Ss.width=e.width,Ss.height=e.height;const s=Ss.getContext("2d");e instanceof ImageData?s.putImageData(e,0,0):s.drawImage(e,0,0,e.width,e.height),n=Ss}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=Va("canvas");t.width=e.width,t.height=e.height;const n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);const s=n.getImageData(0,0,e.width,e.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=_i(r[a]/255)*255;return n.putImageData(s,0,0),t}else if(e.data){const t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(_i(t[n]/255)*255):t[n]=_i(t[n]);return{data:t,width:e.width,height:e.height}}else return ze("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let nm=0;class Rc{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:nm++}),this.uuid=Zs(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push(ho(s[a].image)):r.push(ho(s[a]))}else r=ho(s);n.url=r}return t||(e.images[this.uuid]=n),n}}function ho(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?tm.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(ze("Texture: Unable to serialize Texture."),{})}let im=0;const uo=new I;class an extends fs{constructor(e=an.DEFAULT_IMAGE,t=an.DEFAULT_MAPPING,n=$n,s=$n,r=Zt,a=zi,o=En,l=_n,c=an.DEFAULT_ANISOTROPY,u=Oi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:im++}),this.uuid=Zs(),this.name="",this.source=new Rc(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new tt(0,0),this.repeat=new tt(1,1),this.center=new tt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new We,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(uo).x}get height(){return this.source.getSize(uo).y}get depth(){return this.source.getSize(uo).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const n=e[t];if(n===void 0){ze(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){ze(`Texture.setValues(): property '${t}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Td)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Oa:e.x=e.x-Math.floor(e.x);break;case $n:e.x=e.x<0?0:1;break;case El:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case Oa:e.y=e.y-Math.floor(e.y);break;case $n:e.y=e.y<0?0:1;break;case El:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}an.DEFAULT_IMAGE=null;an.DEFAULT_MAPPING=Td;an.DEFAULT_ANISOTROPY=1;class Et{static{Et.prototype.isVector4=!0}constructor(e=0,t=0,n=0,s=1){this.x=e,this.y=t,this.z=n,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,s){return this.x=e,this.y=t,this.z=n,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*s+a[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,s,r;const l=e.elements,c=l[0],u=l[4],d=l[8],h=l[1],f=l[5],v=l[9],_=l[2],p=l[6],g=l[10];if(Math.abs(u-h)<.01&&Math.abs(d-_)<.01&&Math.abs(v-p)<.01){if(Math.abs(u+h)<.1&&Math.abs(d+_)<.1&&Math.abs(v+p)<.1&&Math.abs(c+f+g-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const T=(c+1)/2,S=(f+1)/2,R=(g+1)/2,y=(u+h)/4,E=(d+_)/4,m=(v+p)/4;return T>S&&T>R?T<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(T),s=y/n,r=E/n):S>R?S<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(S),n=y/s,r=m/s):R<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(R),n=E/r,s=m/r),this.set(n,s,r,t),this}let M=Math.sqrt((p-v)*(p-v)+(d-_)*(d-_)+(h-u)*(h-u));return Math.abs(M)<.001&&(M=1),this.x=(p-v)/M,this.y=(d-_)/M,this.z=(h-u)/M,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=it(this.x,e.x,t.x),this.y=it(this.y,e.y,t.y),this.z=it(this.z,e.z,t.z),this.w=it(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=it(this.x,e,t),this.y=it(this.y,e,t),this.z=it(this.z,e,t),this.w=it(this.w,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(it(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class sm extends fs{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Zt,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new Et(0,0,e,t),this.scissorTest=!1,this.viewport=new Et(0,0,e,t),this.textures=[];const s={width:e,height:t,depth:n.depth},r=new an(s),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){const t={minFilter:Zt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=e,this.textures[s].image.height=t,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const s=Object.assign({},e.textures[t].image);this.textures[t].source=new Rc(s)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Jn extends sm{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}}class Fd extends an{constructor(e=null,t=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=$t,this.minFilter=$t,this.wrapR=$n,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class rm extends an{constructor(e=null,t=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=$t,this.minFilter=$t,this.wrapR=$n,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class rt{static{rt.prototype.isMatrix4=!0}constructor(e,t,n,s,r,a,o,l,c,u,d,h,f,v,_,p){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c,u,d,h,f,v,_,p)}set(e,t,n,s,r,a,o,l,c,u,d,h,f,v,_,p){const g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=s,g[1]=r,g[5]=a,g[9]=o,g[13]=l,g[2]=c,g[6]=u,g[10]=d,g[14]=h,g[3]=f,g[7]=v,g[11]=_,g[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new rt().fromArray(this.elements)}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){const t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();const t=this.elements,n=e.elements,s=1/xs.setFromMatrixColumn(e,0).length(),r=1/xs.setFromMatrixColumn(e,1).length(),a=1/xs.setFromMatrixColumn(e,2).length();return t[0]=n[0]*s,t[1]=n[1]*s,t[2]=n[2]*s,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,n=e.x,s=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(s),c=Math.sin(s),u=Math.cos(r),d=Math.sin(r);if(e.order==="XYZ"){const h=a*u,f=a*d,v=o*u,_=o*d;t[0]=l*u,t[4]=-l*d,t[8]=c,t[1]=f+v*c,t[5]=h-_*c,t[9]=-o*l,t[2]=_-h*c,t[6]=v+f*c,t[10]=a*l}else if(e.order==="YXZ"){const h=l*u,f=l*d,v=c*u,_=c*d;t[0]=h+_*o,t[4]=v*o-f,t[8]=a*c,t[1]=a*d,t[5]=a*u,t[9]=-o,t[2]=f*o-v,t[6]=_+h*o,t[10]=a*l}else if(e.order==="ZXY"){const h=l*u,f=l*d,v=c*u,_=c*d;t[0]=h-_*o,t[4]=-a*d,t[8]=v+f*o,t[1]=f+v*o,t[5]=a*u,t[9]=_-h*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){const h=a*u,f=a*d,v=o*u,_=o*d;t[0]=l*u,t[4]=v*c-f,t[8]=h*c+_,t[1]=l*d,t[5]=_*c+h,t[9]=f*c-v,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){const h=a*l,f=a*c,v=o*l,_=o*c;t[0]=l*u,t[4]=_-h*d,t[8]=v*d+f,t[1]=d,t[5]=a*u,t[9]=-o*u,t[2]=-c*u,t[6]=f*d+v,t[10]=h-_*d}else if(e.order==="XZY"){const h=a*l,f=a*c,v=o*l,_=o*c;t[0]=l*u,t[4]=-d,t[8]=c*u,t[1]=h*d+_,t[5]=a*u,t[9]=f*d-v,t[2]=v*d-f,t[6]=o*u,t[10]=_*d+h}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(am,e,om)}lookAt(e,t,n){const s=this.elements;return pn.subVectors(e,t),pn.lengthSq()===0&&(pn.z=1),pn.normalize(),Ai.crossVectors(n,pn),Ai.lengthSq()===0&&(Math.abs(n.z)===1?pn.x+=1e-4:pn.z+=1e-4,pn.normalize(),Ai.crossVectors(n,pn)),Ai.normalize(),Pr.crossVectors(pn,Ai),s[0]=Ai.x,s[4]=Pr.x,s[8]=pn.x,s[1]=Ai.y,s[5]=Pr.y,s[9]=pn.y,s[2]=Ai.z,s[6]=Pr.z,s[10]=pn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],u=n[1],d=n[5],h=n[9],f=n[13],v=n[2],_=n[6],p=n[10],g=n[14],M=n[3],T=n[7],S=n[11],R=n[15],y=s[0],E=s[4],m=s[8],x=s[12],A=s[1],C=s[5],L=s[9],F=s[13],z=s[2],D=s[6],H=s[10],G=s[14],K=s[3],ne=s[7],X=s[11],j=s[15];return r[0]=a*y+o*A+l*z+c*K,r[4]=a*E+o*C+l*D+c*ne,r[8]=a*m+o*L+l*H+c*X,r[12]=a*x+o*F+l*G+c*j,r[1]=u*y+d*A+h*z+f*K,r[5]=u*E+d*C+h*D+f*ne,r[9]=u*m+d*L+h*H+f*X,r[13]=u*x+d*F+h*G+f*j,r[2]=v*y+_*A+p*z+g*K,r[6]=v*E+_*C+p*D+g*ne,r[10]=v*m+_*L+p*H+g*X,r[14]=v*x+_*F+p*G+g*j,r[3]=M*y+T*A+S*z+R*K,r[7]=M*E+T*C+S*D+R*ne,r[11]=M*m+T*L+S*H+R*X,r[15]=M*x+T*F+S*G+R*j,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[4],s=e[8],r=e[12],a=e[1],o=e[5],l=e[9],c=e[13],u=e[2],d=e[6],h=e[10],f=e[14],v=e[3],_=e[7],p=e[11],g=e[15],M=l*f-c*h,T=o*f-c*d,S=o*h-l*d,R=a*f-c*u,y=a*h-l*u,E=a*d-o*u;return t*(_*M-p*T+g*S)-n*(v*M-p*R+g*y)+s*(v*T-_*R+g*E)-r*(v*S-_*y+p*E)}determinantAffine(){const e=this.elements,t=e[0],n=e[4],s=e[8],r=e[1],a=e[5],o=e[9],l=e[2],c=e[6],u=e[10];return t*(a*u-o*c)-n*(r*u-o*l)+s*(r*c-a*l)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){const s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=n),this}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],u=e[8],d=e[9],h=e[10],f=e[11],v=e[12],_=e[13],p=e[14],g=e[15],M=t*o-n*a,T=t*l-s*a,S=t*c-r*a,R=n*l-s*o,y=n*c-r*o,E=s*c-r*l,m=u*_-d*v,x=u*p-h*v,A=u*g-f*v,C=d*p-h*_,L=d*g-f*_,F=h*g-f*p,z=M*F-T*L+S*C+R*A-y*x+E*m;if(z===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const D=1/z;return e[0]=(o*F-l*L+c*C)*D,e[1]=(s*L-n*F-r*C)*D,e[2]=(_*E-p*y+g*R)*D,e[3]=(h*y-d*E-f*R)*D,e[4]=(l*A-a*F-c*x)*D,e[5]=(t*F-s*A+r*x)*D,e[6]=(p*S-v*E-g*T)*D,e[7]=(u*E-h*S+f*T)*D,e[8]=(a*L-o*A+c*m)*D,e[9]=(n*A-t*L-r*m)*D,e[10]=(v*y-_*S+g*M)*D,e[11]=(d*S-u*y-f*M)*D,e[12]=(o*x-a*C-l*m)*D,e[13]=(t*C-n*x+s*m)*D,e[14]=(_*T-v*R-p*M)*D,e[15]=(u*R-d*T+h*M)*D,this}scale(e){const t=this.elements,n=e.x,s=e.y,r=e.z;return t[0]*=n,t[4]*=s,t[8]*=r,t[1]*=n,t[5]*=s,t[9]*=r,t[2]*=n,t[6]*=s,t[10]*=r,t[3]*=n,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,s))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const n=Math.cos(t),s=Math.sin(t),r=1-n,a=e.x,o=e.y,l=e.z,c=r*a,u=r*o;return this.set(c*a+n,c*o-s*l,c*l+s*o,0,c*o+s*l,u*o+n,u*l-s*a,0,c*l-s*o,u*l+s*a,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,s,r,a){return this.set(1,n,r,0,e,1,a,0,t,s,1,0,0,0,0,1),this}compose(e,t,n){const s=this.elements,r=t._x,a=t._y,o=t._z,l=t._w,c=r+r,u=a+a,d=o+o,h=r*c,f=r*u,v=r*d,_=a*u,p=a*d,g=o*d,M=l*c,T=l*u,S=l*d,R=n.x,y=n.y,E=n.z;return s[0]=(1-(_+g))*R,s[1]=(f+S)*R,s[2]=(v-T)*R,s[3]=0,s[4]=(f-S)*y,s[5]=(1-(h+g))*y,s[6]=(p+M)*y,s[7]=0,s[8]=(v+T)*E,s[9]=(p-M)*E,s[10]=(1-(h+_))*E,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,n){const s=this.elements;e.x=s[12],e.y=s[13],e.z=s[14];const r=this.determinantAffine();if(r===0)return n.set(1,1,1),t.identity(),this;let a=xs.set(s[0],s[1],s[2]).length();const o=xs.set(s[4],s[5],s[6]).length(),l=xs.set(s[8],s[9],s[10]).length();r<0&&(a=-a),Pn.copy(this);const c=1/a,u=1/o,d=1/l;return Pn.elements[0]*=c,Pn.elements[1]*=c,Pn.elements[2]*=c,Pn.elements[4]*=u,Pn.elements[5]*=u,Pn.elements[6]*=u,Pn.elements[8]*=d,Pn.elements[9]*=d,Pn.elements[10]*=d,t.setFromRotationMatrix(Pn),n.x=a,n.y=o,n.z=l,this}makePerspective(e,t,n,s,r,a,o=Zn,l=!1){const c=this.elements,u=2*r/(t-e),d=2*r/(n-s),h=(t+e)/(t-e),f=(n+s)/(n-s);let v,_;if(l)v=r/(a-r),_=a*r/(a-r);else if(o===Zn)v=-(a+r)/(a-r),_=-2*a*r/(a-r);else if(o===Mr)v=-a/(a-r),_=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=u,c[4]=0,c[8]=h,c[12]=0,c[1]=0,c[5]=d,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=v,c[14]=_,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,s,r,a,o=Zn,l=!1){const c=this.elements,u=2/(t-e),d=2/(n-s),h=-(t+e)/(t-e),f=-(n+s)/(n-s);let v,_;if(l)v=1/(a-r),_=a/(a-r);else if(o===Zn)v=-2/(a-r),_=-(a+r)/(a-r);else if(o===Mr)v=-1/(a-r),_=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=u,c[4]=0,c[8]=0,c[12]=h,c[1]=0,c[5]=d,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=v,c[14]=_,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<16;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}const xs=new I,Pn=new rt,am=new I(0,0,0),om=new I(1,1,1),Ai=new I,Pr=new I,pn=new I,mh=new rt,gh=new Sn;class Xi{constructor(e=0,t=0,n=0,s=Xi.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,s=this._order){return this._x=e,this._y=t,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){const s=e.elements,r=s[0],a=s[4],o=s[8],l=s[1],c=s[5],u=s[9],d=s[2],h=s[6],f=s[10];switch(t){case"XYZ":this._y=Math.asin(it(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,f),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(h,c),this._z=0);break;case"YXZ":this._x=Math.asin(-it(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(it(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-it(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(h,f),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(it(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-u,c),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-it(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(h,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-u,f),this._y=0);break;default:ze("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return mh.makeRotationFromQuaternion(e),this.setFromRotationMatrix(mh,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return gh.setFromEuler(this),this.setFromQuaternion(gh,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}Xi.DEFAULT_ORDER="XYZ";class Ud{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let lm=0;const vh=new I,Ms=new Sn,si=new rt,Lr=new I,er=new I,cm=new I,hm=new Sn,bh=new I(1,0,0),_h=new I(0,1,0),Sh=new I(0,0,1),xh={type:"added"},um={type:"removed"},ys={type:"childadded",child:null},fo={type:"childremoved",child:null};class Yt extends fs{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:lm++}),this.uuid=Zs(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=Yt.DEFAULT_UP.clone();const e=new I,t=new Xi,n=new Sn,s=new I(1,1,1);function r(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new rt},normalMatrix:{value:new We}}),this.matrix=new rt,this.matrixWorld=new rt,this.matrixAutoUpdate=Yt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=Yt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Ud,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Ms.setFromAxisAngle(e,t),this.quaternion.multiply(Ms),this}rotateOnWorldAxis(e,t){return Ms.setFromAxisAngle(e,t),this.quaternion.premultiply(Ms),this}rotateX(e){return this.rotateOnAxis(bh,e)}rotateY(e){return this.rotateOnAxis(_h,e)}rotateZ(e){return this.rotateOnAxis(Sh,e)}translateOnAxis(e,t){return vh.copy(e).applyQuaternion(this.quaternion),this.position.add(vh.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(bh,e)}translateY(e){return this.translateOnAxis(_h,e)}translateZ(e){return this.translateOnAxis(Sh,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(si.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Lr.copy(e):Lr.set(e,t,n);const s=this.parent;this.updateWorldMatrix(!0,!1),er.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?si.lookAt(er,Lr,this.up):si.lookAt(Lr,er,this.up),this.quaternion.setFromRotationMatrix(si),s&&(si.extractRotation(s.matrixWorld),Ms.setFromRotationMatrix(si),this.quaternion.premultiply(Ms.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(ct("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(xh),ys.child=e,this.dispatchEvent(ys),ys.child=null):ct("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(um),fo.child=e,this.dispatchEvent(fo),fo.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),si.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),si.multiply(e.parent.matrixWorld)),e.applyMatrix4(si),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(xh),ys.child=e,this.dispatchEvent(ys),ys.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,s=this.children.length;n<s;n++){const a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);const s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(er,e,cm),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(er,hm,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const e=this.pivot;if(e!==null){const t=e.x,n=e.y,s=e.z,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*s,r[13]+=n-r[1]*t-r[5]*n-r[9]*s,r[14]+=s-r[2]*t-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){const s=this.parent;if(e===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){const r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(e){const t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(e),s.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,u=l.length;c<u;c++){const d=l[c];r(e.shapes,d)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(e.materials,this.material[l]));s.material=o}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];s.animations.push(r(e.animations,l))}}if(t){const o=a(e.geometries),l=a(e.materials),c=a(e.textures),u=a(e.images),d=a(e.shapes),h=a(e.skeletons),f=a(e.animations),v=a(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),u.length>0&&(n.images=u),d.length>0&&(n.shapes=d),h.length>0&&(n.skeletons=h),f.length>0&&(n.animations=f),v.length>0&&(n.nodes=v)}return n.object=s,n;function a(o){const l=[];for(const c in o){const u=o[c];delete u.metadata,l.push(u)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){const s=e.children[n];this.add(s.clone())}return this}}Yt.DEFAULT_UP=new I(0,1,0);Yt.DEFAULT_MATRIX_AUTO_UPDATE=!0;Yt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class It extends Yt{constructor(){super(),this.isGroup=!0,this.type="Group"}}const dm={type:"move"};class po{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new It,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new It,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new I,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new I),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new It,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new I,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new I,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let s=null,r=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(const _ of e.hand.values()){const p=t.getJointPose(_,n),g=this._getHandJoint(c,_);p!==null&&(g.matrix.fromArray(p.transform.matrix),g.matrix.decompose(g.position,g.rotation,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=p.radius),g.visible=p!==null}const u=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],h=u.position.distanceTo(d.position),f=.02,v=.005;c.inputState.pinching&&h>f+v?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&h<=f-v&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:e,target:this})));o!==null&&(s=t.getPose(e.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(dm)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const n=new It;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}const Nd={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Ri={h:0,s:0,l:0},Dr={h:0,s:0,l:0};function mo(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}class Ve{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){const s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=cn){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,st.colorSpaceToWorking(this,t),this}setRGB(e,t,n,s=st.workingColorSpace){return this.r=e,this.g=t,this.b=n,st.colorSpaceToWorking(this,s),this}setHSL(e,t,n,s=st.workingColorSpace){if(e=Ac(e,1),t=it(t,0,1),n=it(n,0,1),t===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+t):n+t-n*t,a=2*n-r;this.r=mo(a,r,e+1/3),this.g=mo(a,r,e),this.b=mo(a,r,e-1/3)}return st.colorSpaceToWorking(this,s),this}setStyle(e,t=cn){function n(r){r!==void 0&&parseFloat(r)<1&&ze("Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r;const a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:ze("Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){const r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(r,16),t);ze("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=cn){const n=Nd[e.toLowerCase()];return n!==void 0?this.setHex(n,t):ze("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=_i(e.r),this.g=_i(e.g),this.b=_i(e.b),this}copyLinearToSRGB(e){return this.r=Hs(e.r),this.g=Hs(e.g),this.b=Hs(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=cn){return st.workingToColorSpace(jt.copy(this),e),Math.round(it(jt.r*255,0,255))*65536+Math.round(it(jt.g*255,0,255))*256+Math.round(it(jt.b*255,0,255))}getHexString(e=cn){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=st.workingColorSpace){st.workingToColorSpace(jt.copy(this),t);const n=jt.r,s=jt.g,r=jt.b,a=Math.max(n,s,r),o=Math.min(n,s,r);let l,c;const u=(o+a)/2;if(o===a)l=0,c=0;else{const d=a-o;switch(c=u<=.5?d/(a+o):d/(2-a-o),a){case n:l=(s-r)/d+(s<r?6:0);break;case s:l=(r-n)/d+2;break;case r:l=(n-s)/d+4;break}l/=6}return e.h=l,e.s=c,e.l=u,e}getRGB(e,t=st.workingColorSpace){return st.workingToColorSpace(jt.copy(this),t),e.r=jt.r,e.g=jt.g,e.b=jt.b,e}getStyle(e=cn){st.workingToColorSpace(jt.copy(this),e);const t=jt.r,n=jt.g,s=jt.b;return e!==cn?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(e,t,n){return this.getHSL(Ri),this.setHSL(Ri.h+e,Ri.s+t,Ri.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Ri),e.getHSL(Dr);const n=_r(Ri.h,Dr.h,t),s=_r(Ri.s,Dr.s,t),r=_r(Ri.l,Dr.l,t);return this.setHSL(n,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,n=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*s,this.g=r[1]*t+r[4]*n+r[7]*s,this.b=r[2]*t+r[5]*n+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const jt=new Ve;Ve.NAMES=Nd;class Cc{constructor(e,t=1,n=1e3){this.isFog=!0,this.name="",this.color=new Ve(e),this.near=t,this.far=n}clone(){return new Cc(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class fm extends Yt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Xi,this.environmentIntensity=1,this.environmentRotation=new Xi,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}const Ln=new I,ri=new I,go=new I,ai=new I,ws=new I,Es=new I,Mh=new I,vo=new I,bo=new I,_o=new I,So=new Et,xo=new Et,Mo=new Et;class Nn{constructor(e=new I,t=new I,n=new I){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,s){s.subVectors(n,t),Ln.subVectors(e,t),s.cross(Ln);const r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,n,s,r){Ln.subVectors(s,t),ri.subVectors(n,t),go.subVectors(e,t);const a=Ln.dot(Ln),o=Ln.dot(ri),l=Ln.dot(go),c=ri.dot(ri),u=ri.dot(go),d=a*c-o*o;if(d===0)return r.set(0,0,0),null;const h=1/d,f=(c*l-o*u)*h,v=(a*u-o*l)*h;return r.set(1-f-v,v,f)}static containsPoint(e,t,n,s){return this.getBarycoord(e,t,n,s,ai)===null?!1:ai.x>=0&&ai.y>=0&&ai.x+ai.y<=1}static getInterpolation(e,t,n,s,r,a,o,l){return this.getBarycoord(e,t,n,s,ai)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,ai.x),l.addScaledVector(a,ai.y),l.addScaledVector(o,ai.z),l)}static getInterpolatedAttribute(e,t,n,s,r,a){return So.setScalar(0),xo.setScalar(0),Mo.setScalar(0),So.fromBufferAttribute(e,t),xo.fromBufferAttribute(e,n),Mo.fromBufferAttribute(e,s),a.setScalar(0),a.addScaledVector(So,r.x),a.addScaledVector(xo,r.y),a.addScaledVector(Mo,r.z),a}static isFrontFacing(e,t,n,s){return Ln.subVectors(n,t),ri.subVectors(e,t),Ln.cross(ri).dot(s)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,s){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,n,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Ln.subVectors(this.c,this.b),ri.subVectors(this.a,this.b),Ln.cross(ri).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return Nn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return Nn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,s,r){return Nn.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}containsPoint(e){return Nn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return Nn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const n=this.a,s=this.b,r=this.c;let a,o;ws.subVectors(s,n),Es.subVectors(r,n),vo.subVectors(e,n);const l=ws.dot(vo),c=Es.dot(vo);if(l<=0&&c<=0)return t.copy(n);bo.subVectors(e,s);const u=ws.dot(bo),d=Es.dot(bo);if(u>=0&&d<=u)return t.copy(s);const h=l*d-u*c;if(h<=0&&l>=0&&u<=0)return a=l/(l-u),t.copy(n).addScaledVector(ws,a);_o.subVectors(e,r);const f=ws.dot(_o),v=Es.dot(_o);if(v>=0&&f<=v)return t.copy(r);const _=f*c-l*v;if(_<=0&&c>=0&&v<=0)return o=c/(c-v),t.copy(n).addScaledVector(Es,o);const p=u*v-f*d;if(p<=0&&d-u>=0&&f-v>=0)return Mh.subVectors(r,s),o=(d-u)/(d-u+(f-v)),t.copy(s).addScaledVector(Mh,o);const g=1/(p+_+h);return a=_*g,o=h*g,t.copy(n).addScaledVector(ws,a).addScaledVector(Es,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class ps{constructor(e=new I(1/0,1/0,1/0),t=new I(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Dn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Dn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const n=Dn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const n=e.geometry;if(n!==void 0){const r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,Dn):Dn.fromBufferAttribute(r,a),Dn.applyMatrix4(e.matrixWorld),this.expandByPoint(Dn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Ir.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Ir.copy(n.boundingBox)),Ir.applyMatrix4(e.matrixWorld),this.union(Ir)}const s=e.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Dn),Dn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(tr),Fr.subVectors(this.max,tr),Ts.subVectors(e.a,tr),As.subVectors(e.b,tr),Rs.subVectors(e.c,tr),Ci.subVectors(As,Ts),Pi.subVectors(Rs,As),qi.subVectors(Ts,Rs);let t=[0,-Ci.z,Ci.y,0,-Pi.z,Pi.y,0,-qi.z,qi.y,Ci.z,0,-Ci.x,Pi.z,0,-Pi.x,qi.z,0,-qi.x,-Ci.y,Ci.x,0,-Pi.y,Pi.x,0,-qi.y,qi.x,0];return!yo(t,Ts,As,Rs,Fr)||(t=[1,0,0,0,1,0,0,0,1],!yo(t,Ts,As,Rs,Fr))?!1:(Ur.crossVectors(Ci,Pi),t=[Ur.x,Ur.y,Ur.z],yo(t,Ts,As,Rs,Fr))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Dn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Dn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(oi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),oi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),oi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),oi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),oi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),oi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),oi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),oi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(oi),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const oi=[new I,new I,new I,new I,new I,new I,new I,new I],Dn=new I,Ir=new ps,Ts=new I,As=new I,Rs=new I,Ci=new I,Pi=new I,qi=new I,tr=new I,Fr=new I,Ur=new I,$i=new I;function yo(i,e,t,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){$i.fromArray(i,r);const o=s.x*Math.abs($i.x)+s.y*Math.abs($i.y)+s.z*Math.abs($i.z),l=e.dot($i),c=t.dot($i),u=n.dot($i);if(Math.max(-Math.max(l,c,u),Math.min(l,c,u))>o)return!1}return!0}const Bt=new I,Nr=new tt;let pm=0;class dn extends fs{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:pm++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=ah,this.updateRanges=[],this.gpuType=kn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[n+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Nr.fromBufferAttribute(this,t),Nr.applyMatrix3(e),this.setXY(t,Nr.x,Nr.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Bt.fromBufferAttribute(this,t),Bt.applyMatrix3(e),this.setXYZ(t,Bt.x,Bt.y,Bt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Bt.fromBufferAttribute(this,t),Bt.applyMatrix4(e),this.setXYZ(t,Bt.x,Bt.y,Bt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Bt.fromBufferAttribute(this,t),Bt.applyNormalMatrix(e),this.setXYZ(t,Bt.x,Bt.y,Bt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Bt.fromBufferAttribute(this,t),Bt.transformDirection(e),this.setXYZ(t,Bt.x,Bt.y,Bt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Ns(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=nn(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Ns(t,this.array)),t}setX(e,t){return this.normalized&&(t=nn(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Ns(t,this.array)),t}setY(e,t){return this.normalized&&(t=nn(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Ns(t,this.array)),t}setZ(e,t){return this.normalized&&(t=nn(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Ns(t,this.array)),t}setW(e,t){return this.normalized&&(t=nn(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=nn(t,this.array),n=nn(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,s){return e*=this.itemSize,this.normalized&&(t=nn(t,this.array),n=nn(n,this.array),s=nn(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e*=this.itemSize,this.normalized&&(t=nn(t,this.array),n=nn(n,this.array),s=nn(s,this.array),r=nn(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==ah&&(e.usage=this.usage),e}dispose(){this.dispatchEvent({type:"dispose"})}}class kd extends dn{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class Od extends dn{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class Qe extends dn{constructor(e,t,n){super(new Float32Array(e),t,n)}}const mm=new ps,nr=new I,wo=new I;class ms{constructor(e=new I,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const n=this.center;t!==void 0?n.copy(t):mm.setFromPoints(e).getCenter(n);let s=0;for(let r=0,a=e.length;r<a;r++)s=Math.max(s,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;nr.subVectors(e,this.center);const t=nr.lengthSq();if(t>this.radius*this.radius){const n=Math.sqrt(t),s=(n-this.radius)*.5;this.center.addScaledVector(nr,s/n),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(wo.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(nr.copy(e.center).add(wo)),this.expandByPoint(nr.copy(e.center).sub(wo))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}let gm=0;const Mn=new rt,Eo=new Yt,Cs=new I,mn=new ps,ir=new ps,Xt=new I;class Ut extends fs{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:gm++}),this.uuid=Zs(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Fp(e)?Od:kd)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new We().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}const s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return Mn.makeRotationFromQuaternion(e),this.applyMatrix4(Mn),this}rotateX(e){return Mn.makeRotationX(e),this.applyMatrix4(Mn),this}rotateY(e){return Mn.makeRotationY(e),this.applyMatrix4(Mn),this}rotateZ(e){return Mn.makeRotationZ(e),this.applyMatrix4(Mn),this}translate(e,t,n){return Mn.makeTranslation(e,t,n),this.applyMatrix4(Mn),this}scale(e,t,n){return Mn.makeScale(e,t,n),this.applyMatrix4(Mn),this}lookAt(e){return Eo.lookAt(e),Eo.updateMatrix(),this.applyMatrix4(Eo.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Cs).negate(),this.translate(Cs.x,Cs.y,Cs.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const n=[];for(let s=0,r=e.length;s<r;s++){const a=e[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Qe(n,3))}else{const n=Math.min(e.length,t.count);for(let s=0;s<n;s++){const r=e[s];t.setXYZ(s,r.x,r.y,r.z||0)}e.length>t.count&&ze("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new ps);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){ct("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new I(-1/0,-1/0,-1/0),new I(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,s=t.length;n<s;n++){const r=t[n];mn.setFromBufferAttribute(r),this.morphTargetsRelative?(Xt.addVectors(this.boundingBox.min,mn.min),this.boundingBox.expandByPoint(Xt),Xt.addVectors(this.boundingBox.max,mn.max),this.boundingBox.expandByPoint(Xt)):(this.boundingBox.expandByPoint(mn.min),this.boundingBox.expandByPoint(mn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&ct('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ms);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){ct("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new I,1/0);return}if(e){const n=this.boundingSphere.center;if(mn.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){const o=t[r];ir.setFromBufferAttribute(o),this.morphTargetsRelative?(Xt.addVectors(mn.min,ir.min),mn.expandByPoint(Xt),Xt.addVectors(mn.max,ir.max),mn.expandByPoint(Xt)):(mn.expandByPoint(ir.min),mn.expandByPoint(ir.max))}mn.getCenter(n);let s=0;for(let r=0,a=e.count;r<a;r++)Xt.fromBufferAttribute(e,r),s=Math.max(s,n.distanceToSquared(Xt));if(t)for(let r=0,a=t.length;r<a;r++){const o=t[r],l=this.morphTargetsRelative;for(let c=0,u=o.count;c<u;c++)Xt.fromBufferAttribute(o,c),l&&(Cs.fromBufferAttribute(e,c),Xt.add(Cs)),s=Math.max(s,n.distanceToSquared(Xt))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&ct('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){ct("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=t.position,s=t.normal,r=t.uv;let a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new dn(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));const o=[],l=[];for(let m=0;m<n.count;m++)o[m]=new I,l[m]=new I;const c=new I,u=new I,d=new I,h=new tt,f=new tt,v=new tt,_=new I,p=new I;function g(m,x,A){c.fromBufferAttribute(n,m),u.fromBufferAttribute(n,x),d.fromBufferAttribute(n,A),h.fromBufferAttribute(r,m),f.fromBufferAttribute(r,x),v.fromBufferAttribute(r,A),u.sub(c),d.sub(c),f.sub(h),v.sub(h);const C=1/(f.x*v.y-v.x*f.y);isFinite(C)&&(_.copy(u).multiplyScalar(v.y).addScaledVector(d,-f.y).multiplyScalar(C),p.copy(d).multiplyScalar(f.x).addScaledVector(u,-v.x).multiplyScalar(C),o[m].add(_),o[x].add(_),o[A].add(_),l[m].add(p),l[x].add(p),l[A].add(p))}let M=this.groups;M.length===0&&(M=[{start:0,count:e.count}]);for(let m=0,x=M.length;m<x;++m){const A=M[m],C=A.start,L=A.count;for(let F=C,z=C+L;F<z;F+=3)g(e.getX(F+0),e.getX(F+1),e.getX(F+2))}const T=new I,S=new I,R=new I,y=new I;function E(m){R.fromBufferAttribute(s,m),y.copy(R);const x=o[m];T.copy(x),T.sub(R.multiplyScalar(R.dot(x))).normalize(),S.crossVectors(y,x);const C=S.dot(l[m])<0?-1:1;a.setXYZW(m,T.x,T.y,T.z,C)}for(let m=0,x=M.length;m<x;++m){const A=M[m],C=A.start,L=A.count;for(let F=C,z=C+L;F<z;F+=3)E(e.getX(F+0)),E(e.getX(F+1)),E(e.getX(F+2))}this._transformed=!0}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==t.count)n=new dn(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let h=0,f=n.count;h<f;h++)n.setXYZ(h,0,0,0);const s=new I,r=new I,a=new I,o=new I,l=new I,c=new I,u=new I,d=new I;if(e)for(let h=0,f=e.count;h<f;h+=3){const v=e.getX(h+0),_=e.getX(h+1),p=e.getX(h+2);s.fromBufferAttribute(t,v),r.fromBufferAttribute(t,_),a.fromBufferAttribute(t,p),u.subVectors(a,r),d.subVectors(s,r),u.cross(d),o.fromBufferAttribute(n,v),l.fromBufferAttribute(n,_),c.fromBufferAttribute(n,p),o.add(u),l.add(u),c.add(u),n.setXYZ(v,o.x,o.y,o.z),n.setXYZ(_,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let h=0,f=t.count;h<f;h+=3)s.fromBufferAttribute(t,h+0),r.fromBufferAttribute(t,h+1),a.fromBufferAttribute(t,h+2),u.subVectors(a,r),d.subVectors(s,r),u.cross(d),n.setXYZ(h+0,u.x,u.y,u.z),n.setXYZ(h+1,u.x,u.y,u.z),n.setXYZ(h+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Xt.fromBufferAttribute(e,t),Xt.normalize(),e.setXYZ(t,Xt.x,Xt.y,Xt.z)}toNonIndexed(){function e(o,l){const c=o.array,u=o.itemSize,d=o.normalized,h=new c.constructor(l.length*u);let f=0,v=0;for(let _=0,p=l.length;_<p;_++){o.isInterleavedBufferAttribute?f=l[_]*o.data.stride+o.offset:f=l[_]*u;for(let g=0;g<u;g++)h[v++]=c[f++]}return new dn(h,u,d)}if(this.index===null)return ze("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new Ut,n=this.index.array,s=this.attributes;for(const o in s){const l=s[o],c=e(l,n);t.setAttribute(o,c)}const r=this.morphAttributes;for(const o in r){const l=[],c=r[o];for(let u=0,d=c.length;u<d;u++){const h=c[u],f=e(h,n);l.push(f)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const n=this.attributes;for(const l in n){const c=n[l];e.data.attributes[l]=c.toJSON(e.data)}const s={};let r=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],u=[];for(let d=0,h=c.length;d<h;d++){const f=c[d];u.push(f.toJSON(e.data))}u.length>0&&(s[l]=u,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const n=e.index;n!==null&&this.setIndex(n.clone());const s=e.attributes;for(const c in s){const u=s[c];this.setAttribute(c,u.clone(t))}const r=e.morphAttributes;for(const c in r){const u=[],d=r[c];for(let h=0,f=d.length;h<f;h++)u.push(d[h].clone(t));this.morphAttributes[c]=u}this.morphTargetsRelative=e.morphTargetsRelative;const a=e.groups;for(let c=0,u=a.length;c<u;c++){const d=a[c];this.addGroup(d.start,d.count,d.materialIndex)}const o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}let vm=0;class Ks extends fs{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:vm++}),this.uuid=Zs(),this.name="",this.type="Material",this.blending=zs,this.side=Wi,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=gl,this.blendDst=vl,this.blendEquation=ts,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ve(0,0,0),this.blendAlpha=0,this.depthFunc=Ws,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=rh,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=_s,this.stencilZFail=_s,this.stencilZPass=_s,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const n=e[t];if(n===void 0){ze(`Material: parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){ze(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==zs&&(n.blending=this.blending),this.side!==Wi&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==gl&&(n.blendSrc=this.blendSrc),this.blendDst!==vl&&(n.blendDst=this.blendDst),this.blendEquation!==ts&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Ws&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==rh&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==_s&&(n.stencilFail=this.stencilFail),this.stencilZFail!==_s&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==_s&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){const a=[];for(const o in r){const l=r[o];delete l.metadata,a.push(l)}return a}if(t){const r=s(e.textures),a=s(e.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new Ve().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let n=e.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new tt().fromArray(n)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new tt().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let n=null;if(t!==null){const s=t.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}const li=new I,To=new I,kr=new I,Li=new I,Ao=new I,Or=new I,Ro=new I;class zd{constructor(e=new I,t=new I(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,li)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=li.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(li.copy(this.origin).addScaledVector(this.direction,t),li.distanceToSquared(e))}distanceSqToSegment(e,t,n,s){To.copy(e).add(t).multiplyScalar(.5),kr.copy(t).sub(e).normalize(),Li.copy(this.origin).sub(To);const r=e.distanceTo(t)*.5,a=-this.direction.dot(kr),o=Li.dot(this.direction),l=-Li.dot(kr),c=Li.lengthSq(),u=Math.abs(1-a*a);let d,h,f,v;if(u>0)if(d=a*l-o,h=a*o-l,v=r*u,d>=0)if(h>=-v)if(h<=v){const _=1/u;d*=_,h*=_,f=d*(d+a*h+2*o)+h*(a*d+h+2*l)+c}else h=r,d=Math.max(0,-(a*h+o)),f=-d*d+h*(h+2*l)+c;else h=-r,d=Math.max(0,-(a*h+o)),f=-d*d+h*(h+2*l)+c;else h<=-v?(d=Math.max(0,-(-a*r+o)),h=d>0?-r:Math.min(Math.max(-r,-l),r),f=-d*d+h*(h+2*l)+c):h<=v?(d=0,h=Math.min(Math.max(-r,-l),r),f=h*(h+2*l)+c):(d=Math.max(0,-(a*r+o)),h=d>0?r:Math.min(Math.max(-r,-l),r),f=-d*d+h*(h+2*l)+c);else h=a>0?-r:r,d=Math.max(0,-(a*h+o)),f=-d*d+h*(h+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(To).addScaledVector(kr,h),f}intersectSphere(e,t){li.subVectors(e.center,this.origin);const n=li.dot(this.direction),s=li.dot(li)-n*n,r=e.radius*e.radius;if(s>r)return null;const a=Math.sqrt(r-s),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){const n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,s,r,a,o,l;const c=1/this.direction.x,u=1/this.direction.y,d=1/this.direction.z,h=this.origin;return c>=0?(n=(e.min.x-h.x)*c,s=(e.max.x-h.x)*c):(n=(e.max.x-h.x)*c,s=(e.min.x-h.x)*c),u>=0?(r=(e.min.y-h.y)*u,a=(e.max.y-h.y)*u):(r=(e.max.y-h.y)*u,a=(e.min.y-h.y)*u),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),d>=0?(o=(e.min.z-h.z)*d,l=(e.max.z-h.z)*d):(o=(e.max.z-h.z)*d,l=(e.min.z-h.z)*d),n>l||o>s)||((o>n||n!==n)&&(n=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,t)}intersectsBox(e){return this.intersectBox(e,li)!==null}intersectTriangle(e,t,n,s,r){Ao.subVectors(t,e),Or.subVectors(n,e),Ro.crossVectors(Ao,Or);let a=this.direction.dot(Ro),o;if(a>0){if(s)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Li.subVectors(this.origin,e);const l=o*this.direction.dot(Or.crossVectors(Li,Or));if(l<0)return null;const c=o*this.direction.dot(Ao.cross(Li));if(c<0||l+c>a)return null;const u=-o*Li.dot(Ro);return u<0?null:this.at(u/a,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Za extends Ks{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ve(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Xi,this.combine=_d,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const yh=new rt,Zi=new zd,zr=new ms,wh=new I,Br=new I,Hr=new I,Gr=new I,Co=new I,Vr=new I,Eh=new I,Wr=new I;class ht extends Yt{constructor(e=new Ut,t=new Za){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){const n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(s,e);const o=this.morphTargetInfluences;if(r&&o){Vr.set(0,0,0);for(let l=0,c=r.length;l<c;l++){const u=o[l],d=r[l];u!==0&&(Co.fromBufferAttribute(d,e),a?Vr.addScaledVector(Co,u):Vr.addScaledVector(Co.sub(t),u))}t.add(Vr)}return t}raycast(e,t){const n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),zr.copy(n.boundingSphere),zr.applyMatrix4(r),Zi.copy(e.ray).recast(e.near),!(zr.containsPoint(Zi.origin)===!1&&(Zi.intersectSphere(zr,wh)===null||Zi.origin.distanceToSquared(wh)>(e.far-e.near)**2))&&(yh.copy(r).invert(),Zi.copy(e.ray).applyMatrix4(yh),!(n.boundingBox!==null&&Zi.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,Zi)))}_computeIntersections(e,t,n){let s;const r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,u=r.attributes.uv1,d=r.attributes.normal,h=r.groups,f=r.drawRange;if(o!==null)if(Array.isArray(a))for(let v=0,_=h.length;v<_;v++){const p=h[v],g=a[p.materialIndex],M=Math.max(p.start,f.start),T=Math.min(o.count,Math.min(p.start+p.count,f.start+f.count));for(let S=M,R=T;S<R;S+=3){const y=o.getX(S),E=o.getX(S+1),m=o.getX(S+2);s=Xr(this,g,e,n,c,u,d,y,E,m),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=p.materialIndex,t.push(s))}}else{const v=Math.max(0,f.start),_=Math.min(o.count,f.start+f.count);for(let p=v,g=_;p<g;p+=3){const M=o.getX(p),T=o.getX(p+1),S=o.getX(p+2);s=Xr(this,a,e,n,c,u,d,M,T,S),s&&(s.faceIndex=Math.floor(p/3),t.push(s))}}else if(l!==void 0)if(Array.isArray(a))for(let v=0,_=h.length;v<_;v++){const p=h[v],g=a[p.materialIndex],M=Math.max(p.start,f.start),T=Math.min(l.count,Math.min(p.start+p.count,f.start+f.count));for(let S=M,R=T;S<R;S+=3){const y=S,E=S+1,m=S+2;s=Xr(this,g,e,n,c,u,d,y,E,m),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=p.materialIndex,t.push(s))}}else{const v=Math.max(0,f.start),_=Math.min(l.count,f.start+f.count);for(let p=v,g=_;p<g;p+=3){const M=p,T=p+1,S=p+2;s=Xr(this,a,e,n,c,u,d,M,T,S),s&&(s.faceIndex=Math.floor(p/3),t.push(s))}}}}function bm(i,e,t,n,s,r,a,o){let l;if(e.side===un?l=n.intersectTriangle(a,r,s,!0,o):l=n.intersectTriangle(s,r,a,e.side===Wi,o),l===null)return null;Wr.copy(o),Wr.applyMatrix4(i.matrixWorld);const c=t.ray.origin.distanceTo(Wr);return c<t.near||c>t.far?null:{distance:c,point:Wr.clone(),object:i}}function Xr(i,e,t,n,s,r,a,o,l,c){i.getVertexPosition(o,Br),i.getVertexPosition(l,Hr),i.getVertexPosition(c,Gr);const u=bm(i,e,t,n,Br,Hr,Gr,Eh);if(u){const d=new I;Nn.getBarycoord(Eh,Br,Hr,Gr,d),s&&(u.uv=Nn.getInterpolatedAttribute(s,o,l,c,d,new tt)),r&&(u.uv1=Nn.getInterpolatedAttribute(r,o,l,c,d,new tt)),a&&(u.normal=Nn.getInterpolatedAttribute(a,o,l,c,d,new I),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));const h={a:o,b:l,c,normal:new I,materialIndex:0};Nn.getNormal(Br,Hr,Gr,h.normal),u.face=h,u.barycoord=d}return u}class Pc extends an{constructor(e=null,t=1,n=1,s,r,a,o,l,c=$t,u=$t,d,h){super(null,a,o,l,c,u,s,r,d,h),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Th extends dn{constructor(e,t,n,s=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const Ps=new rt,Ah=new rt,Yr=[],Rh=new ps,_m=new rt,sr=new ht,rr=new ms;class Bd extends ht{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new Th(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<n;s++)this.setMatrixAt(s,_m)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new ps),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Ps),Rh.copy(e.boundingBox).applyMatrix4(Ps),this.boundingBox.union(Rh)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new ms),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Ps),rr.copy(e.boundingSphere).applyMatrix4(Ps),this.boundingSphere.union(rr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const n=t.morphTargetInfluences,s=this.morphTexture.source.data.data,r=n.length+1,a=e*r+1;for(let o=0;o<n.length;o++)n[o]=s[a+o]}raycast(e,t){const n=this.matrixWorld,s=this.count;if(sr.geometry=this.geometry,sr.material=this.material,sr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),rr.copy(this.boundingSphere),rr.applyMatrix4(n),e.ray.intersectsSphere(rr)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,Ps),Ah.multiplyMatrices(n,Ps),sr.matrixWorld=Ah,sr.raycast(e,Yr);for(let a=0,o=Yr.length;a<o;a++){const l=Yr[a];l.instanceId=r,l.object=this,t.push(l)}Yr.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new Th(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){const n=t.morphTargetInfluences,s=n.length+1;this.morphTexture===null&&(this.morphTexture=new Pc(new Float32Array(s*this.count),s,this.count,xc,kn));const r=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=s*e;return r[l]=o,r.set(n,l+1),this}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const Po=new I,Sm=new I,xm=new We;class es{constructor(e=new I(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,s){return this.normal.set(e,t,n),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){const s=Po.subVectors(n,t).cross(Sm.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){const s=e.delta(Po),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const a=-(e.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(s,a)}intersectsLine(e){const t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const n=t||xm.getNormalMatrix(e),s=this.coplanarPoint(Po).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const Ki=new ms,Mm=new tt(.5,.5),qr=new I;class Lc{constructor(e=new es,t=new es,n=new es,s=new es,r=new es,a=new es){this.planes=[e,t,n,s,r,a]}set(e,t,n,s,r,a){const o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(e){const t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=Zn,n=!1){const s=this.planes,r=e.elements,a=r[0],o=r[1],l=r[2],c=r[3],u=r[4],d=r[5],h=r[6],f=r[7],v=r[8],_=r[9],p=r[10],g=r[11],M=r[12],T=r[13],S=r[14],R=r[15];if(s[0].setComponents(c-a,f-u,g-v,R-M).normalize(),s[1].setComponents(c+a,f+u,g+v,R+M).normalize(),s[2].setComponents(c+o,f+d,g+_,R+T).normalize(),s[3].setComponents(c-o,f-d,g-_,R-T).normalize(),n)s[4].setComponents(l,h,p,S).normalize(),s[5].setComponents(c-l,f-h,g-p,R-S).normalize();else if(s[4].setComponents(c-l,f-h,g-p,R-S).normalize(),t===Zn)s[5].setComponents(c+l,f+h,g+p,R+S).normalize();else if(t===Mr)s[5].setComponents(l,h,p,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Ki.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Ki.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Ki)}intersectsSprite(e){Ki.center.set(0,0,0);const t=Mm.distanceTo(e.center);return Ki.radius=.7071067811865476+t,Ki.applyMatrix4(e.matrixWorld),this.intersectsSphere(Ki)}intersectsSphere(e){const t=this.planes,n=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(e){const t=this.planes;for(let n=0;n<6;n++){const s=t[n];if(qr.x=s.normal.x>0?e.max.x:e.min.x,qr.y=s.normal.y>0?e.max.y:e.min.y,qr.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(qr)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Hd extends Ks{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Ve(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const Ch=new rt,sc=new zd,$r=new ms,Zr=new I;class ym extends Yt{constructor(e=new Ut,t=new Hd){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){const n=this.geometry,s=this.matrixWorld,r=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),$r.copy(n.boundingSphere),$r.applyMatrix4(s),$r.radius+=r,e.ray.intersectsSphere($r)===!1)return;Ch.copy(s).invert(),sc.copy(e.ray).applyMatrix4(Ch);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,d=n.attributes.position;if(c!==null){const h=Math.max(0,a.start),f=Math.min(c.count,a.start+a.count);for(let v=h,_=f;v<_;v++){const p=c.getX(v);Zr.fromBufferAttribute(d,p),Ph(Zr,p,l,s,e,t,this)}}else{const h=Math.max(0,a.start),f=Math.min(d.count,a.start+a.count);for(let v=h,_=f;v<_;v++)Zr.fromBufferAttribute(d,v),Ph(Zr,v,l,s,e,t,this)}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function Ph(i,e,t,n,s,r,a){const o=sc.distanceSqToPoint(i);if(o<t){const l=new I;sc.closestPointToPoint(i,l),l.applyMatrix4(n);const c=s.ray.origin.distanceTo(l);if(c<s.near||c>s.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}class Gd extends an{constructor(e=[],t=cs,n,s,r,a,o,l,c,u){super(e,t,n,s,r,a,o,l,c,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Ys extends an{constructor(e,t,n=ei,s,r,a,o=$t,l=$t,c,u=Mi,d=1){if(u!==Mi&&u!==is)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const h={width:e,height:t,depth:d};super(h,s,r,a,o,l,u,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Rc(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}class wm extends Ys{constructor(e,t=ei,n=cs,s,r,a=$t,o=$t,l,c=Mi){const u={width:e,height:e,depth:1},d=[u,u,u,u,u,u];super(e,e,t,n,s,r,a,o,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class Vd extends an{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class Tn extends Ut{constructor(e=1,t=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};const o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);const l=[],c=[],u=[],d=[];let h=0,f=0;v("z","y","x",-1,-1,n,t,e,a,r,0),v("z","y","x",1,-1,n,t,-e,a,r,1),v("x","z","y",1,1,e,n,t,s,a,2),v("x","z","y",1,-1,e,n,-t,s,a,3),v("x","y","z",1,-1,e,t,n,s,r,4),v("x","y","z",-1,-1,e,t,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new Qe(c,3)),this.setAttribute("normal",new Qe(u,3)),this.setAttribute("uv",new Qe(d,2));function v(_,p,g,M,T,S,R,y,E,m,x){const A=S/E,C=R/m,L=S/2,F=R/2,z=y/2,D=E+1,H=m+1;let G=0,K=0;const ne=new I;for(let X=0;X<H;X++){const j=X*C-F;for(let ie=0;ie<D;ie++){const Ae=ie*A-L;ne[_]=Ae*M,ne[p]=j*T,ne[g]=z,c.push(ne.x,ne.y,ne.z),ne[_]=0,ne[p]=0,ne[g]=y>0?1:-1,u.push(ne.x,ne.y,ne.z),d.push(ie/E),d.push(1-X/m),G+=1}}for(let X=0;X<m;X++)for(let j=0;j<E;j++){const ie=h+j+D*X,Ae=h+j+D*(X+1),Oe=h+(j+1)+D*(X+1),se=h+(j+1)+D*X;l.push(ie,Ae,se),l.push(Ae,Oe,se),K+=6}o.addGroup(f,K,x),f+=K,h+=G}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Tn(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class Yn extends Ut{constructor(e=1,t=1,n=1,s=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};const c=this;s=Math.floor(s),r=Math.floor(r);const u=[],d=[],h=[],f=[];let v=0;const _=[],p=n/2;let g=0;M(),a===!1&&(e>0&&T(!0),t>0&&T(!1)),this.setIndex(u),this.setAttribute("position",new Qe(d,3)),this.setAttribute("normal",new Qe(h,3)),this.setAttribute("uv",new Qe(f,2));function M(){const S=new I,R=new I;let y=0;const E=(t-e)/n;for(let m=0;m<=r;m++){const x=[],A=m/r,C=A*(t-e)+e;for(let L=0;L<=s;L++){const F=L/s,z=F*l+o,D=Math.sin(z),H=Math.cos(z);R.x=C*D,R.y=-A*n+p,R.z=C*H,d.push(R.x,R.y,R.z),S.set(D,E,H).normalize(),h.push(S.x,S.y,S.z),f.push(F,1-A),x.push(v++)}_.push(x)}for(let m=0;m<s;m++)for(let x=0;x<r;x++){const A=_[x][m],C=_[x+1][m],L=_[x+1][m+1],F=_[x][m+1];(e>0||x!==0)&&(u.push(A,C,F),y+=3),(t>0||x!==r-1)&&(u.push(C,L,F),y+=3)}c.addGroup(g,y,0),g+=y}function T(S){const R=v,y=new tt,E=new I;let m=0;const x=S===!0?e:t,A=S===!0?1:-1;for(let L=1;L<=s;L++)d.push(0,p*A,0),h.push(0,A,0),f.push(.5,.5),v++;const C=v;for(let L=0;L<=s;L++){const z=L/s*l+o,D=Math.cos(z),H=Math.sin(z);E.x=x*H,E.y=p*A,E.z=x*D,d.push(E.x,E.y,E.z),h.push(0,A,0),y.x=D*.5+.5,y.y=H*.5*A+.5,f.push(y.x,y.y),v++}for(let L=0;L<s;L++){const F=R+L,z=C+L;S===!0?u.push(z,z+1,F):u.push(z+1,z,F),m+=3}c.addGroup(g,m,S===!0?1:2),g+=m}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Yn(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class Dc extends Yn{constructor(e=1,t=1,n=32,s=1,r=!1,a=0,o=Math.PI*2){super(0,e,t,n,s,r,a,o),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:s,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(e){return new Dc(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class Ic extends Ut{constructor(e=[],t=[],n=1,s=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:n,detail:s};const r=[],a=[];o(s),c(n),u(),this.setAttribute("position",new Qe(r,3)),this.setAttribute("normal",new Qe(r.slice(),3)),this.setAttribute("uv",new Qe(a,2)),s===0?this.computeVertexNormals():this.normalizeNormals();function o(M){const T=new I,S=new I,R=new I;for(let y=0;y<t.length;y+=3)f(t[y+0],T),f(t[y+1],S),f(t[y+2],R),l(T,S,R,M)}function l(M,T,S,R){const y=R+1,E=[];for(let m=0;m<=y;m++){E[m]=[];const x=M.clone().lerp(S,m/y),A=T.clone().lerp(S,m/y),C=y-m;for(let L=0;L<=C;L++)L===0&&m===y?E[m][L]=x:E[m][L]=x.clone().lerp(A,L/C)}for(let m=0;m<y;m++)for(let x=0;x<2*(y-m)-1;x++){const A=Math.floor(x/2);x%2===0?(h(E[m][A+1]),h(E[m+1][A]),h(E[m][A])):(h(E[m][A+1]),h(E[m+1][A+1]),h(E[m+1][A]))}}function c(M){const T=new I;for(let S=0;S<r.length;S+=3)T.x=r[S+0],T.y=r[S+1],T.z=r[S+2],T.normalize().multiplyScalar(M),r[S+0]=T.x,r[S+1]=T.y,r[S+2]=T.z}function u(){const M=new I;for(let T=0;T<r.length;T+=3){M.x=r[T+0],M.y=r[T+1],M.z=r[T+2];const S=p(M)/2/Math.PI+.5,R=g(M)/Math.PI+.5;a.push(S,1-R)}v(),d()}function d(){for(let M=0;M<a.length;M+=6){const T=a[M+0],S=a[M+2],R=a[M+4],y=Math.max(T,S,R),E=Math.min(T,S,R);y>.9&&E<.1&&(T<.2&&(a[M+0]+=1),S<.2&&(a[M+2]+=1),R<.2&&(a[M+4]+=1))}}function h(M){r.push(M.x,M.y,M.z)}function f(M,T){const S=M*3;T.x=e[S+0],T.y=e[S+1],T.z=e[S+2]}function v(){const M=new I,T=new I,S=new I,R=new I,y=new tt,E=new tt,m=new tt;for(let x=0,A=0;x<r.length;x+=9,A+=6){M.set(r[x+0],r[x+1],r[x+2]),T.set(r[x+3],r[x+4],r[x+5]),S.set(r[x+6],r[x+7],r[x+8]),y.set(a[A+0],a[A+1]),E.set(a[A+2],a[A+3]),m.set(a[A+4],a[A+5]),R.copy(M).add(T).add(S).divideScalar(3);const C=p(R);_(y,A+0,M,C),_(E,A+2,T,C),_(m,A+4,S,C)}}function _(M,T,S,R){R<0&&M.x===1&&(a[T]=M.x-1),S.x===0&&S.z===0&&(a[T]=R/2/Math.PI+.5)}function p(M){return Math.atan2(M.z,-M.x)}function g(M){return Math.atan2(-M.y,Math.sqrt(M.x*M.x+M.z*M.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Ic(e.vertices,e.indices,e.radius,e.detail)}}class Fc extends Ic{constructor(e=1,t=0){const n=(1+Math.sqrt(5))/2,s=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(s,r,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new Fc(e.radius,e.detail)}}class Er extends Ut{constructor(e=1,t=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:s};const r=e/2,a=t/2,o=Math.floor(n),l=Math.floor(s),c=o+1,u=l+1,d=e/o,h=t/l,f=[],v=[],_=[],p=[];for(let g=0;g<u;g++){const M=g*h-a;for(let T=0;T<c;T++){const S=T*d-r;v.push(S,-M,0),_.push(0,0,1),p.push(T/o),p.push(1-g/l)}}for(let g=0;g<l;g++)for(let M=0;M<o;M++){const T=M+c*g,S=M+c*(g+1),R=M+1+c*(g+1),y=M+1+c*g;f.push(T,S,y),f.push(S,R,y)}this.setIndex(f),this.setAttribute("position",new Qe(v,3)),this.setAttribute("normal",new Qe(_,3)),this.setAttribute("uv",new Qe(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Er(e.width,e.height,e.widthSegments,e.heightSegments)}}function qs(i){const e={};for(const t in i){e[t]={};for(const n in i[t]){const s=i[t][n];if(Lh(s))s.isRenderTargetTexture?(ze("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=s.clone();else if(Array.isArray(s))if(Lh(s[0])){const r=[];for(let a=0,o=s.length;a<o;a++)r[a]=s[a].clone();e[t][n]=r}else e[t][n]=s.slice();else e[t][n]=s}}return e}function rn(i){const e={};for(let t=0;t<i.length;t++){const n=qs(i[t]);for(const s in n)e[s]=n[s]}return e}function Lh(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function Em(i){const e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function Wd(i){const e=i.getRenderTarget();return e===null?i.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:st.workingColorSpace}const Tm={clone:qs,merge:rn};var Am=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Rm=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class ti extends Ks{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Am,this.fragmentShader=Rm,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=qs(e.uniforms),this.uniformsGroups=Em(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const s in this.uniforms){const a=this.uniforms[s].value;a&&a.isTexture?t.uniforms[s]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[s]={type:"m4",value:a.toArray()}:t.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const n={};for(const s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(const n in e.uniforms){const s=e.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=t[s.value]||null;break;case"c":this.uniforms[n].value=new Ve().setHex(s.value);break;case"v2":this.uniforms[n].value=new tt().fromArray(s.value);break;case"v3":this.uniforms[n].value=new I().fromArray(s.value);break;case"v4":this.uniforms[n].value=new Et().fromArray(s.value);break;case"m3":this.uniforms[n].value=new We().fromArray(s.value);break;case"m4":this.uniforms[n].value=new rt().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(const n in e.extensions)this.extensions[n]=e.extensions[n];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}}class Cm extends ti{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class tn extends Ks{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ve(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ve(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=nc,this.normalScale=new tt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Xi,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class Pm extends Ks{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Tp,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Lm extends Ks{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}class Xd extends Yt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Ve(e),this.intensity=t}dispose(){this.dispatchEvent({type:"dispose"})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}}class Dm extends Xd{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Yt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ve(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){const t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}}const Lo=new rt,Dh=new I,Ih=new I;class Im{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new tt(512,512),this.mapType=_n,this.map=null,this.mapPass=null,this.matrix=new rt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Lc,this._frameExtents=new tt(1,1),this._viewportCount=1,this._viewports=[new Et(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,n=this.matrix;Dh.setFromMatrixPosition(e.matrixWorld),t.position.copy(Dh),Ih.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Ih),t.updateMatrixWorld(),Lo.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Lo,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===Mr||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Lo)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}const Kr=new I,Jr=new Sn,Gn=new I;class Yd extends Yt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new rt,this.projectionMatrix=new rt,this.projectionMatrixInverse=new rt,this.coordinateSystem=Zn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Kr,Jr,Gn),Gn.x===1&&Gn.y===1&&Gn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Kr,Jr,Gn.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Kr,Jr,Gn),Gn.x===1&&Gn.y===1&&Gn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Kr,Jr,Gn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const Di=new I,Fh=new tt,Uh=new tt;class wn extends Yd{constructor(e=50,t=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=yr*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(br*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return yr*2*Math.atan(Math.tan(br*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Di.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Di.x,Di.y).multiplyScalar(-e/Di.z),Di.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Di.x,Di.y).multiplyScalar(-e/Di.z)}getViewSize(e,t){return this.getViewBounds(e,Fh,Uh),t.subVectors(Uh,Fh)}setViewOffset(e,t,n,s,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(br*.5*this.fov)/this.zoom,n=2*t,s=this.aspect*n,r=-.5*s;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*s/l,t-=a.offsetY*n/c,s*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class Uc extends Yd{constructor(e=-1,t=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2;let r=n-e,a=n+e,o=s+t,l=s-t;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=u*this.view.offsetY,l=o-u*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}class Fm extends Im{constructor(){super(new Uc(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Um extends Xd{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Yt.DEFAULT_UP),this.updateMatrix(),this.target=new Yt,this.shadow=new Fm}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}}const Ls=-90,Ds=1;class Nm extends Yt{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const s=new wn(Ls,Ds,e,t);s.layers=this.layers,this.add(s);const r=new wn(Ls,Ds,e,t);r.layers=this.layers,this.add(r);const a=new wn(Ls,Ds,e,t);a.layers=this.layers,this.add(a);const o=new wn(Ls,Ds,e,t);o.layers=this.layers,this.add(o);const l=new wn(Ls,Ds,e,t);l.layers=this.layers,this.add(l);const c=new wn(Ls,Ds,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[n,s,r,a,o,l]=t;for(const c of t)this.remove(c);if(e===Zn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Mr)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[r,a,o,l,c,u]=this.children,d=e.getRenderTarget(),h=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),v=e.xr.enabled;e.xr.enabled=!1;const _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let p=!1;e.isWebGLRenderer===!0?p=e.state.buffers.depth.getReversed():p=e.reversedDepthBuffer,e.setRenderTarget(n,0,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,r),e.setRenderTarget(n,1,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(n,4,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=_,e.setRenderTarget(n,5,s),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,u),e.setRenderTarget(d,h,f),e.xr.enabled=v,n.texture.needsPMREMUpdate=!0}}class km extends wn{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}class qd{static{qd.prototype.isMatrix2=!0}constructor(e,t,n,s){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,s){const r=this.elements;return r[0]=e,r[2]=t,r[1]=n,r[3]=s,this}}function Nh(i,e,t,n){const s=Om(n);switch(t){case Ld:return i*e;case xc:return i*e/s.components*s.byteLength;case Mc:return i*e/s.components*s.byteLength;case hs:return i*e*2/s.components*s.byteLength;case yc:return i*e*2/s.components*s.byteLength;case Dd:return i*e*3/s.components*s.byteLength;case En:return i*e*4/s.components*s.byteLength;case wc:return i*e*4/s.components*s.byteLength;case Ma:case ya:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case wa:case Ea:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case Al:case Cl:return Math.max(i,16)*Math.max(e,8)/4;case Tl:case Rl:return Math.max(i,8)*Math.max(e,8)/2;case Pl:case Ll:case Il:case Fl:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case Dl:case za:case Ul:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case Nl:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case kl:return Math.floor((i+4)/5)*Math.floor((e+3)/4)*16;case Ol:return Math.floor((i+4)/5)*Math.floor((e+4)/5)*16;case zl:return Math.floor((i+5)/6)*Math.floor((e+4)/5)*16;case Bl:return Math.floor((i+5)/6)*Math.floor((e+5)/6)*16;case Hl:return Math.floor((i+7)/8)*Math.floor((e+4)/5)*16;case Gl:return Math.floor((i+7)/8)*Math.floor((e+5)/6)*16;case Vl:return Math.floor((i+7)/8)*Math.floor((e+7)/8)*16;case Wl:return Math.floor((i+9)/10)*Math.floor((e+4)/5)*16;case Xl:return Math.floor((i+9)/10)*Math.floor((e+5)/6)*16;case Yl:return Math.floor((i+9)/10)*Math.floor((e+7)/8)*16;case ql:return Math.floor((i+9)/10)*Math.floor((e+9)/10)*16;case $l:return Math.floor((i+11)/12)*Math.floor((e+9)/10)*16;case Zl:return Math.floor((i+11)/12)*Math.floor((e+11)/12)*16;case Kl:case Jl:case Ql:return Math.ceil(i/4)*Math.ceil(e/4)*16;case jl:case ec:return Math.ceil(i/4)*Math.ceil(e/4)*8;case Ba:case tc:return Math.ceil(i/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Om(i){switch(i){case _n:case Ad:return{byteLength:1,components:1};case Sr:case Rd:case xi:return{byteLength:2,components:1};case _c:case Sc:return{byteLength:2,components:4};case ei:case bc:case kn:return{byteLength:4,components:1};case Cd:case Pd:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:gc}}));typeof window<"u"&&(window.__THREE__?ze("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=gc);/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */function $d(){let i=null,e=!1,t=null,n=null;function s(r,a){t(r,a),n=i.requestAnimationFrame(s)}return{start:function(){e!==!0&&t!==null&&i!==null&&(n=i.requestAnimationFrame(s),e=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){i=r}}}function zm(i){const e=new WeakMap;function t(o,l){const c=o.array,u=o.usage,d=c.byteLength,h=i.createBuffer();i.bindBuffer(l,h),i.bufferData(l,c,u),o.onUploadCallback();let f;if(c instanceof Float32Array)f=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=i.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?f=i.HALF_FLOAT:f=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=i.SHORT;else if(c instanceof Uint32Array)f=i.UNSIGNED_INT;else if(c instanceof Int32Array)f=i.INT;else if(c instanceof Int8Array)f=i.BYTE;else if(c instanceof Uint8Array)f=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:h,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:d}}function n(o,l,c){const u=l.array,d=l.updateRanges;if(i.bindBuffer(c,o),d.length===0)i.bufferSubData(c,0,u);else{d.sort((f,v)=>f.start-v.start);let h=0;for(let f=1;f<d.length;f++){const v=d[h],_=d[f];_.start<=v.start+v.count+1?v.count=Math.max(v.count,_.start+_.count-v.start):(++h,d[h]=_)}d.length=h+1;for(let f=0,v=d.length;f<v;f++){const _=d[f];i.bufferSubData(c,_.start*u.BYTES_PER_ELEMENT,u,_.start,_.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=e.get(o);l&&(i.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const u=e.get(o);(!u||u.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:s,remove:r,update:a}}var Bm=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Hm=`#ifdef USE_ALPHAHASH
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
#endif`,Gm=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Vm=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Wm=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Xm=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Ym=`#ifdef USE_AOMAP
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
#endif`,qm=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,$m=`#ifdef USE_BATCHING
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
#endif`,Zm=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Km=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Jm=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Qm=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,jm=`#ifdef USE_IRIDESCENCE
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
#endif`,eg=`#ifdef USE_BUMPMAP
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
#endif`,tg=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,ng=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,ig=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,sg=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,rg=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,ag=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,og=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,lg=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,cg=`#define PI 3.141592653589793
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
} // validated`,hg=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,ug=`vec3 transformedNormal = objectNormal;
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
#endif`,dg=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,fg=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,pg=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,mg=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,gg="gl_FragColor = linearToOutputTexel( gl_FragColor );",vg=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,bg=`#ifdef USE_ENVMAP
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
#endif`,_g=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Sg=`#ifdef USE_ENVMAP
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
#endif`,xg=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Mg=`#ifdef USE_ENVMAP
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
#endif`,yg=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,wg=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Eg=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Tg=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Ag=`#ifdef USE_GRADIENTMAP
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
}`,Rg=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Cg=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Pg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Lg=`uniform bool receiveShadow;
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
#include <lightprobes_pars_fragment>`,Dg=`#ifdef USE_ENVMAP
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
#endif`,Ig=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Fg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Ug=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Ng=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,kg=`PhysicalMaterial material;
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
#endif`,Og=`uniform sampler2D dfgLUT;
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
}`,zg=`
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
#endif`,Bg=`#if defined( RE_IndirectDiffuse )
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
#endif`,Hg=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Gg=`#ifdef USE_LIGHT_PROBES_GRID
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
#endif`,Vg=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Wg=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Xg=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Yg=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,qg=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,$g=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Zg=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,Kg=`#if defined( USE_POINTS_UV )
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
#endif`,Jg=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Qg=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,jg=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,e0=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,t0=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,n0=`#ifdef USE_MORPHTARGETS
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
#endif`,i0=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,s0=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,r0=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,a0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,o0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,l0=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,c0=`#ifdef USE_NORMALMAP
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
#endif`,h0=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,u0=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,d0=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,f0=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,p0=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,m0=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,g0=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,v0=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,b0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,_0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,S0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,x0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,M0=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,y0=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,w0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,E0=`float getShadowMask() {
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
}`,T0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,A0=`#ifdef USE_SKINNING
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
#endif`,R0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,C0=`#ifdef USE_SKINNING
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
#endif`,P0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,L0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,D0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,I0=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,F0=`#ifdef USE_TRANSMISSION
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
#endif`,U0=`#ifdef USE_TRANSMISSION
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
#endif`,N0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,k0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,O0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,z0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const B0=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,H0=`uniform sampler2D t2D;
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
}`,G0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,V0=`#ifdef ENVMAP_TYPE_CUBE
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
}`,W0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,X0=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Y0=`#include <common>
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
}`,q0=`#if DEPTH_PACKING == 3200
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
}`,$0=`#define DISTANCE
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
}`,Z0=`#define DISTANCE
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
}`,K0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,J0=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Q0=`uniform float scale;
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
}`,j0=`uniform vec3 diffuse;
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
}`,ev=`#include <common>
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
}`,tv=`uniform vec3 diffuse;
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
}`,nv=`#define LAMBERT
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
}`,iv=`#define LAMBERT
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
}`,sv=`#define MATCAP
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
}`,rv=`#define MATCAP
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
}`,av=`#define NORMAL
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
}`,ov=`#define NORMAL
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
}`,lv=`#define PHONG
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
}`,cv=`#define PHONG
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
}`,hv=`#define STANDARD
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
}`,uv=`#define STANDARD
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
}`,dv=`#define TOON
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
}`,fv=`#define TOON
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
}`,pv=`uniform float size;
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
}`,mv=`uniform vec3 diffuse;
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
}`,gv=`#include <common>
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
}`,vv=`uniform vec3 color;
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
}`,bv=`uniform float rotation;
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
}`,_v=`uniform vec3 diffuse;
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
}`,Ke={alphahash_fragment:Bm,alphahash_pars_fragment:Hm,alphamap_fragment:Gm,alphamap_pars_fragment:Vm,alphatest_fragment:Wm,alphatest_pars_fragment:Xm,aomap_fragment:Ym,aomap_pars_fragment:qm,batching_pars_vertex:$m,batching_vertex:Zm,begin_vertex:Km,beginnormal_vertex:Jm,bsdfs:Qm,iridescence_fragment:jm,bumpmap_pars_fragment:eg,clipping_planes_fragment:tg,clipping_planes_pars_fragment:ng,clipping_planes_pars_vertex:ig,clipping_planes_vertex:sg,color_fragment:rg,color_pars_fragment:ag,color_pars_vertex:og,color_vertex:lg,common:cg,cube_uv_reflection_fragment:hg,defaultnormal_vertex:ug,displacementmap_pars_vertex:dg,displacementmap_vertex:fg,emissivemap_fragment:pg,emissivemap_pars_fragment:mg,colorspace_fragment:gg,colorspace_pars_fragment:vg,envmap_fragment:bg,envmap_common_pars_fragment:_g,envmap_pars_fragment:Sg,envmap_pars_vertex:xg,envmap_physical_pars_fragment:Dg,envmap_vertex:Mg,fog_vertex:yg,fog_pars_vertex:wg,fog_fragment:Eg,fog_pars_fragment:Tg,gradientmap_pars_fragment:Ag,lightmap_pars_fragment:Rg,lights_lambert_fragment:Cg,lights_lambert_pars_fragment:Pg,lights_pars_begin:Lg,lights_toon_fragment:Ig,lights_toon_pars_fragment:Fg,lights_phong_fragment:Ug,lights_phong_pars_fragment:Ng,lights_physical_fragment:kg,lights_physical_pars_fragment:Og,lights_fragment_begin:zg,lights_fragment_maps:Bg,lights_fragment_end:Hg,lightprobes_pars_fragment:Gg,logdepthbuf_fragment:Vg,logdepthbuf_pars_fragment:Wg,logdepthbuf_pars_vertex:Xg,logdepthbuf_vertex:Yg,map_fragment:qg,map_pars_fragment:$g,map_particle_fragment:Zg,map_particle_pars_fragment:Kg,metalnessmap_fragment:Jg,metalnessmap_pars_fragment:Qg,morphinstance_vertex:jg,morphcolor_vertex:e0,morphnormal_vertex:t0,morphtarget_pars_vertex:n0,morphtarget_vertex:i0,normal_fragment_begin:s0,normal_fragment_maps:r0,normal_pars_fragment:a0,normal_pars_vertex:o0,normal_vertex:l0,normalmap_pars_fragment:c0,clearcoat_normal_fragment_begin:h0,clearcoat_normal_fragment_maps:u0,clearcoat_pars_fragment:d0,iridescence_pars_fragment:f0,opaque_fragment:p0,packing:m0,premultiplied_alpha_fragment:g0,project_vertex:v0,dithering_fragment:b0,dithering_pars_fragment:_0,roughnessmap_fragment:S0,roughnessmap_pars_fragment:x0,shadowmap_pars_fragment:M0,shadowmap_pars_vertex:y0,shadowmap_vertex:w0,shadowmask_pars_fragment:E0,skinbase_vertex:T0,skinning_pars_vertex:A0,skinning_vertex:R0,skinnormal_vertex:C0,specularmap_fragment:P0,specularmap_pars_fragment:L0,tonemapping_fragment:D0,tonemapping_pars_fragment:I0,transmission_fragment:F0,transmission_pars_fragment:U0,uv_pars_fragment:N0,uv_pars_vertex:k0,uv_vertex:O0,worldpos_vertex:z0,background_vert:B0,background_frag:H0,backgroundCube_vert:G0,backgroundCube_frag:V0,cube_vert:W0,cube_frag:X0,depth_vert:Y0,depth_frag:q0,distance_vert:$0,distance_frag:Z0,equirect_vert:K0,equirect_frag:J0,linedashed_vert:Q0,linedashed_frag:j0,meshbasic_vert:ev,meshbasic_frag:tv,meshlambert_vert:nv,meshlambert_frag:iv,meshmatcap_vert:sv,meshmatcap_frag:rv,meshnormal_vert:av,meshnormal_frag:ov,meshphong_vert:lv,meshphong_frag:cv,meshphysical_vert:hv,meshphysical_frag:uv,meshtoon_vert:dv,meshtoon_frag:fv,points_vert:pv,points_frag:mv,shadow_vert:gv,shadow_frag:vv,sprite_vert:bv,sprite_frag:_v},be={common:{diffuse:{value:new Ve(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new We},alphaMap:{value:null},alphaMapTransform:{value:new We},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new We}},envmap:{envMap:{value:null},envMapRotation:{value:new We},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new We}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new We}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new We},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new We},normalScale:{value:new tt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new We},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new We}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new We}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new We}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ve(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new I},probesMax:{value:new I},probesResolution:{value:new I}},points:{diffuse:{value:new Ve(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new We},alphaTest:{value:0},uvTransform:{value:new We}},sprite:{diffuse:{value:new Ve(16777215)},opacity:{value:1},center:{value:new tt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new We},alphaMap:{value:null},alphaMapTransform:{value:new We},alphaTest:{value:0}}},qn={basic:{uniforms:rn([be.common,be.specularmap,be.envmap,be.aomap,be.lightmap,be.fog]),vertexShader:Ke.meshbasic_vert,fragmentShader:Ke.meshbasic_frag},lambert:{uniforms:rn([be.common,be.specularmap,be.envmap,be.aomap,be.lightmap,be.emissivemap,be.bumpmap,be.normalmap,be.displacementmap,be.fog,be.lights,{emissive:{value:new Ve(0)},envMapIntensity:{value:1}}]),vertexShader:Ke.meshlambert_vert,fragmentShader:Ke.meshlambert_frag},phong:{uniforms:rn([be.common,be.specularmap,be.envmap,be.aomap,be.lightmap,be.emissivemap,be.bumpmap,be.normalmap,be.displacementmap,be.fog,be.lights,{emissive:{value:new Ve(0)},specular:{value:new Ve(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ke.meshphong_vert,fragmentShader:Ke.meshphong_frag},standard:{uniforms:rn([be.common,be.envmap,be.aomap,be.lightmap,be.emissivemap,be.bumpmap,be.normalmap,be.displacementmap,be.roughnessmap,be.metalnessmap,be.fog,be.lights,{emissive:{value:new Ve(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ke.meshphysical_vert,fragmentShader:Ke.meshphysical_frag},toon:{uniforms:rn([be.common,be.aomap,be.lightmap,be.emissivemap,be.bumpmap,be.normalmap,be.displacementmap,be.gradientmap,be.fog,be.lights,{emissive:{value:new Ve(0)}}]),vertexShader:Ke.meshtoon_vert,fragmentShader:Ke.meshtoon_frag},matcap:{uniforms:rn([be.common,be.bumpmap,be.normalmap,be.displacementmap,be.fog,{matcap:{value:null}}]),vertexShader:Ke.meshmatcap_vert,fragmentShader:Ke.meshmatcap_frag},points:{uniforms:rn([be.points,be.fog]),vertexShader:Ke.points_vert,fragmentShader:Ke.points_frag},dashed:{uniforms:rn([be.common,be.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ke.linedashed_vert,fragmentShader:Ke.linedashed_frag},depth:{uniforms:rn([be.common,be.displacementmap]),vertexShader:Ke.depth_vert,fragmentShader:Ke.depth_frag},normal:{uniforms:rn([be.common,be.bumpmap,be.normalmap,be.displacementmap,{opacity:{value:1}}]),vertexShader:Ke.meshnormal_vert,fragmentShader:Ke.meshnormal_frag},sprite:{uniforms:rn([be.sprite,be.fog]),vertexShader:Ke.sprite_vert,fragmentShader:Ke.sprite_frag},background:{uniforms:{uvTransform:{value:new We},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ke.background_vert,fragmentShader:Ke.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new We}},vertexShader:Ke.backgroundCube_vert,fragmentShader:Ke.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ke.cube_vert,fragmentShader:Ke.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ke.equirect_vert,fragmentShader:Ke.equirect_frag},distance:{uniforms:rn([be.common,be.displacementmap,{referencePosition:{value:new I},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ke.distance_vert,fragmentShader:Ke.distance_frag},shadow:{uniforms:rn([be.lights,be.fog,{color:{value:new Ve(0)},opacity:{value:1}}]),vertexShader:Ke.shadow_vert,fragmentShader:Ke.shadow_frag}};qn.physical={uniforms:rn([qn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new We},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new We},clearcoatNormalScale:{value:new tt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new We},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new We},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new We},sheen:{value:0},sheenColor:{value:new Ve(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new We},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new We},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new We},transmissionSamplerSize:{value:new tt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new We},attenuationDistance:{value:0},attenuationColor:{value:new Ve(0)},specularColor:{value:new Ve(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new We},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new We},anisotropyVector:{value:new tt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new We}}]),vertexShader:Ke.meshphysical_vert,fragmentShader:Ke.meshphysical_frag};const Qr={r:0,b:0,g:0},Sv=new rt,Zd=new We;Zd.set(-1,0,0,0,1,0,0,0,1);function xv(i,e,t,n,s,r){const a=new Ve(0);let o=s===!0?0:1,l,c,u=null,d=0,h=null;function f(M){let T=M.isScene===!0?M.background:null;if(T&&T.isTexture){const S=M.backgroundBlurriness>0;T=e.get(T,S)}return T}function v(M){let T=!1;const S=f(M);S===null?p(a,o):S&&S.isColor&&(p(S,1),T=!0);const R=i.xr.getEnvironmentBlendMode();R==="additive"?t.buffers.color.setClear(0,0,0,1,r):R==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(i.autoClear||T)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function _(M,T){const S=f(T);S&&(S.isCubeTexture||S.mapping===$a)?(c===void 0&&(c=new ht(new Tn(1,1,1),new ti({name:"BackgroundCubeMaterial",uniforms:qs(qn.backgroundCube.uniforms),vertexShader:qn.backgroundCube.vertexShader,fragmentShader:qn.backgroundCube.fragmentShader,side:un,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(R,y,E){this.matrixWorld.copyPosition(E.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=S,c.material.uniforms.backgroundBlurriness.value=T.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=T.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(Sv.makeRotationFromEuler(T.backgroundRotation)).transpose(),S.isCubeTexture&&S.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Zd),c.material.toneMapped=st.getTransfer(S.colorSpace)!==pt,(u!==S||d!==S.version||h!==i.toneMapping)&&(c.material.needsUpdate=!0,u=S,d=S.version,h=i.toneMapping),c.layers.enableAll(),M.unshift(c,c.geometry,c.material,0,0,null)):S&&S.isTexture&&(l===void 0&&(l=new ht(new Er(2,2),new ti({name:"BackgroundMaterial",uniforms:qs(qn.background.uniforms),vertexShader:qn.background.vertexShader,fragmentShader:qn.background.fragmentShader,side:Wi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=S,l.material.uniforms.backgroundIntensity.value=T.backgroundIntensity,l.material.toneMapped=st.getTransfer(S.colorSpace)!==pt,S.matrixAutoUpdate===!0&&S.updateMatrix(),l.material.uniforms.uvTransform.value.copy(S.matrix),(u!==S||d!==S.version||h!==i.toneMapping)&&(l.material.needsUpdate=!0,u=S,d=S.version,h=i.toneMapping),l.layers.enableAll(),M.unshift(l,l.geometry,l.material,0,0,null))}function p(M,T){M.getRGB(Qr,Wd(i)),t.buffers.color.setClear(Qr.r,Qr.g,Qr.b,T,r)}function g(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(M,T=1){a.set(M),o=T,p(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(M){o=M,p(a,o)},render:v,addToRenderList:_,dispose:g}}function Mv(i,e){const t=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=h(null);let r=s,a=!1;function o(C,L,F,z,D){let H=!1;const G=d(C,z,F,L);r!==G&&(r=G,c(r.object)),H=f(C,z,F,D),H&&v(C,z,F,D),D!==null&&e.update(D,i.ELEMENT_ARRAY_BUFFER),(H||a)&&(a=!1,S(C,L,F,z),D!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,e.get(D).buffer))}function l(){return i.createVertexArray()}function c(C){return i.bindVertexArray(C)}function u(C){return i.deleteVertexArray(C)}function d(C,L,F,z){const D=z.wireframe===!0;let H=n[L.id];H===void 0&&(H={},n[L.id]=H);const G=C.isInstancedMesh===!0?C.id:0;let K=H[G];K===void 0&&(K={},H[G]=K);let ne=K[F.id];ne===void 0&&(ne={},K[F.id]=ne);let X=ne[D];return X===void 0&&(X=h(l()),ne[D]=X),X}function h(C){const L=[],F=[],z=[];for(let D=0;D<t;D++)L[D]=0,F[D]=0,z[D]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:L,enabledAttributes:F,attributeDivisors:z,object:C,attributes:{},index:null}}function f(C,L,F,z){const D=r.attributes,H=L.attributes;let G=0;const K=F.getAttributes();for(const ne in K)if(K[ne].location>=0){const j=D[ne];let ie=H[ne];if(ie===void 0&&(ne==="instanceMatrix"&&C.instanceMatrix&&(ie=C.instanceMatrix),ne==="instanceColor"&&C.instanceColor&&(ie=C.instanceColor)),j===void 0||j.attribute!==ie||ie&&j.data!==ie.data)return!0;G++}return r.attributesNum!==G||r.index!==z}function v(C,L,F,z){const D={},H=L.attributes;let G=0;const K=F.getAttributes();for(const ne in K)if(K[ne].location>=0){let j=H[ne];j===void 0&&(ne==="instanceMatrix"&&C.instanceMatrix&&(j=C.instanceMatrix),ne==="instanceColor"&&C.instanceColor&&(j=C.instanceColor));const ie={};ie.attribute=j,j&&j.data&&(ie.data=j.data),D[ne]=ie,G++}r.attributes=D,r.attributesNum=G,r.index=z}function _(){const C=r.newAttributes;for(let L=0,F=C.length;L<F;L++)C[L]=0}function p(C){g(C,0)}function g(C,L){const F=r.newAttributes,z=r.enabledAttributes,D=r.attributeDivisors;F[C]=1,z[C]===0&&(i.enableVertexAttribArray(C),z[C]=1),D[C]!==L&&(i.vertexAttribDivisor(C,L),D[C]=L)}function M(){const C=r.newAttributes,L=r.enabledAttributes;for(let F=0,z=L.length;F<z;F++)L[F]!==C[F]&&(i.disableVertexAttribArray(F),L[F]=0)}function T(C,L,F,z,D,H,G){G===!0?i.vertexAttribIPointer(C,L,F,D,H):i.vertexAttribPointer(C,L,F,z,D,H)}function S(C,L,F,z){_();const D=z.attributes,H=F.getAttributes(),G=L.defaultAttributeValues;for(const K in H){const ne=H[K];if(ne.location>=0){let X=D[K];if(X===void 0&&(K==="instanceMatrix"&&C.instanceMatrix&&(X=C.instanceMatrix),K==="instanceColor"&&C.instanceColor&&(X=C.instanceColor)),X!==void 0){const j=X.normalized,ie=X.itemSize,Ae=e.get(X);if(Ae===void 0)continue;const Oe=Ae.buffer,se=Ae.type,V=Ae.bytesPerElement,te=se===i.INT||se===i.UNSIGNED_INT||X.gpuType===bc;if(X.isInterleavedBufferAttribute){const re=X.data,ge=re.stride,Ce=X.offset;if(re.isInstancedInterleavedBuffer){for(let _e=0;_e<ne.locationSize;_e++)g(ne.location+_e,re.meshPerAttribute);C.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=re.meshPerAttribute*re.count)}else for(let _e=0;_e<ne.locationSize;_e++)p(ne.location+_e);i.bindBuffer(i.ARRAY_BUFFER,Oe);for(let _e=0;_e<ne.locationSize;_e++)T(ne.location+_e,ie/ne.locationSize,se,j,ge*V,(Ce+ie/ne.locationSize*_e)*V,te)}else{if(X.isInstancedBufferAttribute){for(let re=0;re<ne.locationSize;re++)g(ne.location+re,X.meshPerAttribute);C.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=X.meshPerAttribute*X.count)}else for(let re=0;re<ne.locationSize;re++)p(ne.location+re);i.bindBuffer(i.ARRAY_BUFFER,Oe);for(let re=0;re<ne.locationSize;re++)T(ne.location+re,ie/ne.locationSize,se,j,ie*V,ie/ne.locationSize*re*V,te)}}else if(G!==void 0){const j=G[K];if(j!==void 0)switch(j.length){case 2:i.vertexAttrib2fv(ne.location,j);break;case 3:i.vertexAttrib3fv(ne.location,j);break;case 4:i.vertexAttrib4fv(ne.location,j);break;default:i.vertexAttrib1fv(ne.location,j)}}}}M()}function R(){x();for(const C in n){const L=n[C];for(const F in L){const z=L[F];for(const D in z){const H=z[D];for(const G in H)u(H[G].object),delete H[G];delete z[D]}}delete n[C]}}function y(C){if(n[C.id]===void 0)return;const L=n[C.id];for(const F in L){const z=L[F];for(const D in z){const H=z[D];for(const G in H)u(H[G].object),delete H[G];delete z[D]}}delete n[C.id]}function E(C){for(const L in n){const F=n[L];for(const z in F){const D=F[z];if(D[C.id]===void 0)continue;const H=D[C.id];for(const G in H)u(H[G].object),delete H[G];delete D[C.id]}}}function m(C){for(const L in n){const F=n[L],z=C.isInstancedMesh===!0?C.id:0,D=F[z];if(D!==void 0){for(const H in D){const G=D[H];for(const K in G)u(G[K].object),delete G[K];delete D[H]}delete F[z],Object.keys(F).length===0&&delete n[L]}}}function x(){A(),a=!0,r!==s&&(r=s,c(r.object))}function A(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:x,resetDefaultState:A,dispose:R,releaseStatesOfGeometry:y,releaseStatesOfObject:m,releaseStatesOfProgram:E,initAttributes:_,enableAttribute:p,disableUnusedAttributes:M}}function yv(i,e,t){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),t.update(c,n,1)}function a(l,c,u){u!==0&&(i.drawArraysInstanced(n,l,c,u),t.update(c,n,u))}function o(l,c,u){if(u===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,u);let h=0;for(let f=0;f<u;f++)h+=c[f];t.update(h,n,1)}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o}function wv(i,e,t,n){let s;function r(){if(s!==void 0)return s;if(e.has("EXT_texture_filter_anisotropic")===!0){const E=e.get("EXT_texture_filter_anisotropic");s=i.getParameter(E.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(E){return!(E!==En&&n.convert(E)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(E){const m=E===xi&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(E!==_n&&n.convert(E)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&E!==kn&&!m)}function l(E){if(E==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";E="mediump"}return E==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp";const u=l(c);u!==c&&(ze("WebGLRenderer:",c,"not supported, using",u,"instead."),c=u);const d=t.logarithmicDepthBuffer===!0,h=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control");t.reversedDepthBuffer===!0&&h===!1&&ze("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const f=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),v=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=i.getParameter(i.MAX_TEXTURE_SIZE),p=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),g=i.getParameter(i.MAX_VERTEX_ATTRIBS),M=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),T=i.getParameter(i.MAX_VARYING_VECTORS),S=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),R=i.getParameter(i.MAX_SAMPLES),y=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:h,maxTextures:f,maxVertexTextures:v,maxTextureSize:_,maxCubemapSize:p,maxAttributes:g,maxVertexUniforms:M,maxVaryings:T,maxFragmentUniforms:S,maxSamples:R,samples:y}}function Ev(i){const e=this;let t=null,n=0,s=!1,r=!1;const a=new es,o=new We,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,h){const f=d.length!==0||h||n!==0||s;return s=h,n=d.length,f},this.beginShadows=function(){r=!0,u(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,h){t=u(d,h,0)},this.setState=function(d,h,f){const v=d.clippingPlanes,_=d.clipIntersection,p=d.clipShadows,g=i.get(d);if(!s||v===null||v.length===0||r&&!p)r?u(null):c();else{const M=r?0:n,T=M*4;let S=g.clippingState||null;l.value=S,S=u(v,h,T,f);for(let R=0;R!==T;++R)S[R]=t[R];g.clippingState=S,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=M}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function u(d,h,f,v){const _=d!==null?d.length:0;let p=null;if(_!==0){if(p=l.value,v!==!0||p===null){const g=f+_*4,M=h.matrixWorldInverse;o.getNormalMatrix(M),(p===null||p.length<g)&&(p=new Float32Array(g));for(let T=0,S=f;T!==_;++T,S+=4)a.copy(d[T]).applyMatrix4(M,o),a.normal.toArray(p,S),p[S+3]=a.constant}l.value=p,l.needsUpdate=!0}return e.numPlanes=_,e.numIntersection=0,p}}const Bi=4,kh=[.125,.215,.35,.446,.526,.582],ns=20,Tv=256,ar=new Uc,Oh=new Ve;let Do=null,Io=0,Fo=0,Uo=!1;const Av=new I;class zh{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,s=100,r={}){const{size:a=256,position:o=Av}=r;Do=this._renderer.getRenderTarget(),Io=this._renderer.getActiveCubeFace(),Fo=this._renderer.getActiveMipmapLevel(),Uo=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,n,s,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Gh(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Hh(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Do,Io,Fo),this._renderer.xr.enabled=Uo,e.scissorTest=!1,Is(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===cs||e.mapping===Xs?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Do=this._renderer.getRenderTarget(),Io=this._renderer.getActiveCubeFace(),Fo=this._renderer.getActiveMipmapLevel(),Uo=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Zt,minFilter:Zt,generateMipmaps:!1,type:xi,format:En,colorSpace:Ha,depthBuffer:!1},s=Bh(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Bh(e,t,n);const{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Rv(r)),this._blurMaterial=Pv(r,e,t),this._ggxMaterial=Cv(r,e,t)}return s}_compileMaterial(e){const t=new ht(new Ut,e);this._renderer.compile(t,ar)}_sceneToCubeUV(e,t,n,s,r){const l=new wn(90,1,t,n),c=[1,-1,1,1,1,1],u=[1,1,1,-1,-1,-1],d=this._renderer,h=d.autoClear,f=d.toneMapping;d.getClearColor(Oh),d.toneMapping=Kn,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(s),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new ht(new Tn,new Za({name:"PMREM.Background",side:un,depthWrite:!1,depthTest:!1})));const _=this._backgroundBox,p=_.material;let g=!1;const M=e.background;M?M.isColor&&(p.color.copy(M),e.background=null,g=!0):(p.color.copy(Oh),g=!0);for(let T=0;T<6;T++){const S=T%3;S===0?(l.up.set(0,c[T],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+u[T],r.y,r.z)):S===1?(l.up.set(0,0,c[T]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+u[T],r.z)):(l.up.set(0,c[T],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+u[T]));const R=this._cubeSize;Is(s,S*R,T>2?R:0,R,R),d.setRenderTarget(s),g&&d.render(_,l),d.render(e,l)}d.toneMapping=f,d.autoClear=h,e.background=M}_textureToCubeUV(e,t){const n=this._renderer,s=e.mapping===cs||e.mapping===Xs;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Gh()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Hh());const r=s?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;const o=r.uniforms;o.envMap.value=e;const l=this._cubeSize;Is(t,0,0,3*l,2*l),n.setRenderTarget(t),n.render(a,ar)}_applyPMREM(e){const t=this._renderer,n=t.autoClear;t.autoClear=!1;const s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(e,r-1,r);t.autoClear=n}_applyGGXFilter(e,t,n){const s=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),u=t/(this._lodMeshes.length-1),d=Math.sqrt(c*c-u*u),h=0+c*1.25,f=d*h,{_lodMax:v}=this,_=this._sizeLods[n],p=3*_*(n>v-Bi?n-v+Bi:0),g=4*(this._cubeSize-_);l.envMap.value=e.texture,l.roughness.value=f,l.mipInt.value=v-t,Is(r,p,g,3*_,2*_),s.setRenderTarget(r),s.render(o,ar),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=v-n,Is(e,p,g,3*_,2*_),s.setRenderTarget(e),s.render(o,ar)}_blur(e,t,n,s,r){const a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,s,"latitudinal",r),this._halfBlur(a,e,n,n,s,"longitudinal",r)}_halfBlur(e,t,n,s,r,a,o){const l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&ct("blur direction must be either latitudinal or longitudinal!");const u=3,d=this._lodMeshes[s];d.material=c;const h=c.uniforms,f=this._sizeLods[n]-1,v=isFinite(r)?Math.PI/(2*f):2*Math.PI/(2*ns-1),_=r/v,p=isFinite(r)?1+Math.floor(u*_):ns;p>ns&&ze(`sigmaRadians, ${r}, is too large and will clip, as it requested ${p} samples when the maximum is set to ${ns}`);const g=[];let M=0;for(let E=0;E<ns;++E){const m=E/_,x=Math.exp(-m*m/2);g.push(x),E===0?M+=x:E<p&&(M+=2*x)}for(let E=0;E<g.length;E++)g[E]=g[E]/M;h.envMap.value=e.texture,h.samples.value=p,h.weights.value=g,h.latitudinal.value=a==="latitudinal",o&&(h.poleAxis.value=o);const{_lodMax:T}=this;h.dTheta.value=v,h.mipInt.value=T-n;const S=this._sizeLods[s],R=3*S*(s>T-Bi?s-T+Bi:0),y=4*(this._cubeSize-S);Is(t,R,y,3*S,2*S),l.setRenderTarget(t),l.render(d,ar)}}function Rv(i){const e=[],t=[],n=[];let s=i;const r=i-Bi+1+kh.length;for(let a=0;a<r;a++){const o=Math.pow(2,s);e.push(o);let l=1/o;a>i-Bi?l=kh[a-i+Bi-1]:a===0&&(l=0),t.push(l);const c=1/(o-2),u=-c,d=1+c,h=[u,u,d,u,d,d,u,u,d,d,u,d],f=6,v=6,_=3,p=2,g=1,M=new Float32Array(_*v*f),T=new Float32Array(p*v*f),S=new Float32Array(g*v*f);for(let y=0;y<f;y++){const E=y%3*2/3-1,m=y>2?0:-1,x=[E,m,0,E+2/3,m,0,E+2/3,m+1,0,E,m,0,E+2/3,m+1,0,E,m+1,0];M.set(x,_*v*y),T.set(h,p*v*y);const A=[y,y,y,y,y,y];S.set(A,g*v*y)}const R=new Ut;R.setAttribute("position",new dn(M,_)),R.setAttribute("uv",new dn(T,p)),R.setAttribute("faceIndex",new dn(S,g)),n.push(new ht(R,null)),s>Bi&&s--}return{lodMeshes:n,sizeLods:e,sigmas:t}}function Bh(i,e,t){const n=new Jn(i,e,t);return n.texture.mapping=$a,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Is(i,e,t,n,s){i.viewport.set(e,t,n,s),i.scissor.set(e,t,n,s)}function Cv(i,e,t){return new ti({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Tv,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Ka(),fragmentShader:`

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
		`,blending:bi,depthTest:!1,depthWrite:!1})}function Pv(i,e,t){const n=new Float32Array(ns),s=new I(0,1,0);return new ti({name:"SphericalGaussianBlur",defines:{n:ns,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Ka(),fragmentShader:`

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
		`,blending:bi,depthTest:!1,depthWrite:!1})}function Hh(){return new ti({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Ka(),fragmentShader:`

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
		`,blending:bi,depthTest:!1,depthWrite:!1})}function Gh(){return new ti({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Ka(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:bi,depthTest:!1,depthWrite:!1})}function Ka(){return`

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
	`}class Kd extends Jn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const n={width:e,height:e,depth:1},s=[n,n,n,n,n,n];this.texture=new Gd(s),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},s=new Tn(5,5,5),r=new ti({name:"CubemapFromEquirect",uniforms:qs(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:un,blending:bi});r.uniforms.tEquirect.value=t;const a=new ht(s,r),o=t.minFilter;return t.minFilter===zi&&(t.minFilter=Zt),new Nm(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,s=!0){const r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,s);e.setRenderTarget(r)}}function Lv(i){let e=new WeakMap,t=new WeakMap,n=null;function s(h,f=!1){return h==null?null:f?a(h):r(h)}function r(h){if(h&&h.isTexture){const f=h.mapping;if(f===xa||f===ao)if(e.has(h)){const v=e.get(h).texture;return o(v,h.mapping)}else{const v=h.image;if(v&&v.height>0){const _=new Kd(v.height);return _.fromEquirectangularTexture(i,h),e.set(h,_),h.addEventListener("dispose",c),o(_.texture,h.mapping)}else return null}}return h}function a(h){if(h&&h.isTexture){const f=h.mapping,v=f===xa||f===ao,_=f===cs||f===Xs;if(v||_){let p=t.get(h);const g=p!==void 0?p.texture.pmremVersion:0;if(h.isRenderTargetTexture&&h.pmremVersion!==g)return n===null&&(n=new zh(i)),p=v?n.fromEquirectangular(h,p):n.fromCubemap(h,p),p.texture.pmremVersion=h.pmremVersion,t.set(h,p),p.texture;if(p!==void 0)return p.texture;{const M=h.image;return v&&M&&M.height>0||_&&M&&l(M)?(n===null&&(n=new zh(i)),p=v?n.fromEquirectangular(h):n.fromCubemap(h),p.texture.pmremVersion=h.pmremVersion,t.set(h,p),h.addEventListener("dispose",u),p.texture):null}}}return h}function o(h,f){return f===xa?h.mapping=cs:f===ao&&(h.mapping=Xs),h}function l(h){let f=0;const v=6;for(let _=0;_<v;_++)h[_]!==void 0&&f++;return f===v}function c(h){const f=h.target;f.removeEventListener("dispose",c);const v=e.get(f);v!==void 0&&(e.delete(f),v.dispose())}function u(h){const f=h.target;f.removeEventListener("dispose",u);const v=t.get(f);v!==void 0&&(t.delete(f),v.dispose())}function d(){e=new WeakMap,t=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:d}}function Dv(i){const e={};function t(n){if(e[n]!==void 0)return e[n];const s=i.getExtension(n);return e[n]=s,s}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){const s=t(n);return s===null&&Bs("WebGLRenderer: "+n+" extension not supported."),s}}}function Iv(i,e,t,n){const s={},r=new WeakMap;function a(d){const h=d.target;h.index!==null&&e.remove(h.index);for(const v in h.attributes)e.remove(h.attributes[v]);h.removeEventListener("dispose",a),delete s[h.id];const f=r.get(h);f&&(e.remove(f),r.delete(h)),n.releaseStatesOfGeometry(h),h.isInstancedBufferGeometry===!0&&delete h._maxInstanceCount,t.memory.geometries--}function o(d,h){return s[h.id]===!0||(h.addEventListener("dispose",a),s[h.id]=!0,t.memory.geometries++),h}function l(d){const h=d.attributes;for(const f in h)e.update(h[f],i.ARRAY_BUFFER)}function c(d){const h=[],f=d.index,v=d.attributes.position;let _=0;if(v===void 0)return;if(f!==null){const M=f.array;_=f.version;for(let T=0,S=M.length;T<S;T+=3){const R=M[T+0],y=M[T+1],E=M[T+2];h.push(R,y,y,E,E,R)}}else{const M=v.array;_=v.version;for(let T=0,S=M.length/3-1;T<S;T+=3){const R=T+0,y=T+1,E=T+2;h.push(R,y,y,E,E,R)}}const p=new(v.count>=65535?Od:kd)(h,1);p.version=_;const g=r.get(d);g&&e.remove(g),r.set(d,p)}function u(d){const h=r.get(d);if(h){const f=d.index;f!==null&&h.version<f.version&&c(d)}else c(d);return r.get(d)}return{get:o,update:l,getWireframeAttribute:u}}function Fv(i,e,t){let n;function s(d){n=d}let r,a;function o(d){r=d.type,a=d.bytesPerElement}function l(d,h){i.drawElements(n,h,r,d*a),t.update(h,n,1)}function c(d,h,f){f!==0&&(i.drawElementsInstanced(n,h,r,d*a,f),t.update(h,n,f))}function u(d,h,f){if(f===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,h,0,r,d,0,f);let _=0;for(let p=0;p<f;p++)_+=h[p];t.update(_,n,1)}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=u}function Uv(i){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(t.calls++,a){case i.TRIANGLES:t.triangles+=o*(r/3);break;case i.LINES:t.lines+=o*(r/2);break;case i.LINE_STRIP:t.lines+=o*(r-1);break;case i.LINE_LOOP:t.lines+=o*r;break;case i.POINTS:t.points+=o*r;break;default:ct("WebGLInfo: Unknown draw mode:",a);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:n}}function Nv(i,e,t){const n=new WeakMap,s=new Et;function r(a,o,l){const c=a.morphTargetInfluences,u=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=u!==void 0?u.length:0;let h=n.get(o);if(h===void 0||h.count!==d){let x=function(){E.dispose(),n.delete(o),o.removeEventListener("dispose",x)};h!==void 0&&h.texture.dispose();const f=o.morphAttributes.position!==void 0,v=o.morphAttributes.normal!==void 0,_=o.morphAttributes.color!==void 0,p=o.morphAttributes.position||[],g=o.morphAttributes.normal||[],M=o.morphAttributes.color||[];let T=0;f===!0&&(T=1),v===!0&&(T=2),_===!0&&(T=3);let S=o.attributes.position.count*T,R=1;S>e.maxTextureSize&&(R=Math.ceil(S/e.maxTextureSize),S=e.maxTextureSize);const y=new Float32Array(S*R*4*d),E=new Fd(y,S,R,d);E.type=kn,E.needsUpdate=!0;const m=T*4;for(let A=0;A<d;A++){const C=p[A],L=g[A],F=M[A],z=S*R*4*A;for(let D=0;D<C.count;D++){const H=D*m;f===!0&&(s.fromBufferAttribute(C,D),y[z+H+0]=s.x,y[z+H+1]=s.y,y[z+H+2]=s.z,y[z+H+3]=0),v===!0&&(s.fromBufferAttribute(L,D),y[z+H+4]=s.x,y[z+H+5]=s.y,y[z+H+6]=s.z,y[z+H+7]=0),_===!0&&(s.fromBufferAttribute(F,D),y[z+H+8]=s.x,y[z+H+9]=s.y,y[z+H+10]=s.z,y[z+H+11]=F.itemSize===4?s.w:1)}}h={count:d,texture:E,size:new tt(S,R)},n.set(o,h),o.addEventListener("dispose",x)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",a.morphTexture,t);else{let f=0;for(let _=0;_<c.length;_++)f+=c[_];const v=o.morphTargetsRelative?1:1-f;l.getUniforms().setValue(i,"morphTargetBaseInfluence",v),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",h.texture,t),l.getUniforms().setValue(i,"morphTargetsTextureSize",h.size)}return{update:r}}function kv(i,e,t,n,s){let r=new WeakMap;function a(c){const u=s.render.frame,d=c.geometry,h=e.get(c,d);if(r.get(h)!==u&&(e.update(h),r.set(h,u)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==u&&(t.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,u))),c.isSkinnedMesh){const f=c.skeleton;r.get(f)!==u&&(f.update(),r.set(f,u))}return h}function o(){r=new WeakMap}function l(c){const u=c.target;u.removeEventListener("dispose",l),n.releaseStatesOfObject(u),t.remove(u.instanceMatrix),u.instanceColor!==null&&t.remove(u.instanceColor)}return{update:a,dispose:o}}const Ov={[Sd]:"LINEAR_TONE_MAPPING",[xd]:"REINHARD_TONE_MAPPING",[Md]:"CINEON_TONE_MAPPING",[vc]:"ACES_FILMIC_TONE_MAPPING",[wd]:"AGX_TONE_MAPPING",[Ed]:"NEUTRAL_TONE_MAPPING",[yd]:"CUSTOM_TONE_MAPPING"};function zv(i,e,t,n,s,r){const a=new Jn(e,t,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,depthTexture:s?new Ys(e,t):void 0}),o=new Jn(e,t,{type:xi,depthBuffer:!1,stencilBuffer:!1}),l=new Ut;l.setAttribute("position",new Qe([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new Qe([0,2,0,0,2,0],2));const c=new Cm({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),u=new ht(l,c),d=new Uc(-1,1,1,-1,0,1);let h=null,f=null,v=!1,_,p=null,g=[],M=!1;this.setSize=function(T,S){a.setSize(T,S),o.setSize(T,S);for(let R=0;R<g.length;R++){const y=g[R];y.setSize&&y.setSize(T,S)}},this.setEffects=function(T){g=T,M=g.length>0&&g[0].isRenderPass===!0;const S=a.width,R=a.height;for(let y=0;y<g.length;y++){const E=g[y];E.setSize&&E.setSize(S,R)}},this.begin=function(T,S){if(v||T.toneMapping===Kn&&g.length===0)return!1;if(p=S,S!==null){const R=S.width,y=S.height;(a.width!==R||a.height!==y)&&this.setSize(R,y)}return M===!1&&T.setRenderTarget(a),_=T.toneMapping,T.toneMapping=Kn,!0},this.hasRenderPass=function(){return M},this.end=function(T,S){T.toneMapping=_,v=!0;let R=a,y=o;for(let E=0;E<g.length;E++){const m=g[E];if(m.enabled!==!1&&(m.render(T,y,R,S),m.needsSwap!==!1)){const x=R;R=y,y=x}}if(h!==T.outputColorSpace||f!==T.toneMapping){h=T.outputColorSpace,f=T.toneMapping,c.defines={},st.getTransfer(h)===pt&&(c.defines.SRGB_TRANSFER="");const E=Ov[f];E&&(c.defines[E]=""),c.needsUpdate=!0}c.uniforms.tDiffuse.value=R.texture,T.setRenderTarget(p),T.render(u,d),p=null,v=!1},this.isCompositing=function(){return v},this.dispose=function(){a.depthTexture&&a.depthTexture.dispose(),a.dispose(),o.dispose(),l.dispose(),c.dispose()}}const Jd=new an,rc=new Ys(1,1),Qd=new Fd,jd=new rm,ef=new Gd,Vh=[],Wh=[],Xh=new Float32Array(16),Yh=new Float32Array(9),qh=new Float32Array(4);function Js(i,e,t){const n=i[0];if(n<=0||n>0)return i;const s=e*t;let r=Vh[s];if(r===void 0&&(r=new Float32Array(s),Vh[s]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,i[a].toArray(r,o)}return r}function Vt(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function Wt(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function Ja(i,e){let t=Wh[e];t===void 0&&(t=new Int32Array(e),Wh[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function Bv(i,e){const t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function Hv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Vt(t,e))return;i.uniform2fv(this.addr,e),Wt(t,e)}}function Gv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Vt(t,e))return;i.uniform3fv(this.addr,e),Wt(t,e)}}function Vv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Vt(t,e))return;i.uniform4fv(this.addr,e),Wt(t,e)}}function Wv(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(Vt(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),Wt(t,e)}else{if(Vt(t,n))return;qh.set(n),i.uniformMatrix2fv(this.addr,!1,qh),Wt(t,n)}}function Xv(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(Vt(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),Wt(t,e)}else{if(Vt(t,n))return;Yh.set(n),i.uniformMatrix3fv(this.addr,!1,Yh),Wt(t,n)}}function Yv(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(Vt(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),Wt(t,e)}else{if(Vt(t,n))return;Xh.set(n),i.uniformMatrix4fv(this.addr,!1,Xh),Wt(t,n)}}function qv(i,e){const t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function $v(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Vt(t,e))return;i.uniform2iv(this.addr,e),Wt(t,e)}}function Zv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Vt(t,e))return;i.uniform3iv(this.addr,e),Wt(t,e)}}function Kv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Vt(t,e))return;i.uniform4iv(this.addr,e),Wt(t,e)}}function Jv(i,e){const t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function Qv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Vt(t,e))return;i.uniform2uiv(this.addr,e),Wt(t,e)}}function jv(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Vt(t,e))return;i.uniform3uiv(this.addr,e),Wt(t,e)}}function eb(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Vt(t,e))return;i.uniform4uiv(this.addr,e),Wt(t,e)}}function tb(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(rc.compareFunction=t.isReversedDepthBuffer()?Tc:Ec,r=rc):r=Jd,t.setTexture2D(e||r,s)}function nb(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture3D(e||jd,s)}function ib(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTextureCube(e||ef,s)}function sb(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2DArray(e||Qd,s)}function rb(i){switch(i){case 5126:return Bv;case 35664:return Hv;case 35665:return Gv;case 35666:return Vv;case 35674:return Wv;case 35675:return Xv;case 35676:return Yv;case 5124:case 35670:return qv;case 35667:case 35671:return $v;case 35668:case 35672:return Zv;case 35669:case 35673:return Kv;case 5125:return Jv;case 36294:return Qv;case 36295:return jv;case 36296:return eb;case 35678:case 36198:case 36298:case 36306:case 35682:return tb;case 35679:case 36299:case 36307:return nb;case 35680:case 36300:case 36308:case 36293:return ib;case 36289:case 36303:case 36311:case 36292:return sb}}function ab(i,e){i.uniform1fv(this.addr,e)}function ob(i,e){const t=Js(e,this.size,2);i.uniform2fv(this.addr,t)}function lb(i,e){const t=Js(e,this.size,3);i.uniform3fv(this.addr,t)}function cb(i,e){const t=Js(e,this.size,4);i.uniform4fv(this.addr,t)}function hb(i,e){const t=Js(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function ub(i,e){const t=Js(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function db(i,e){const t=Js(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function fb(i,e){i.uniform1iv(this.addr,e)}function pb(i,e){i.uniform2iv(this.addr,e)}function mb(i,e){i.uniform3iv(this.addr,e)}function gb(i,e){i.uniform4iv(this.addr,e)}function vb(i,e){i.uniform1uiv(this.addr,e)}function bb(i,e){i.uniform2uiv(this.addr,e)}function _b(i,e){i.uniform3uiv(this.addr,e)}function Sb(i,e){i.uniform4uiv(this.addr,e)}function xb(i,e,t){const n=this.cache,s=e.length,r=Ja(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));let a;this.type===i.SAMPLER_2D_SHADOW?a=rc:a=Jd;for(let o=0;o!==s;++o)t.setTexture2D(e[o]||a,r[o])}function Mb(i,e,t){const n=this.cache,s=e.length,r=Ja(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));for(let a=0;a!==s;++a)t.setTexture3D(e[a]||jd,r[a])}function yb(i,e,t){const n=this.cache,s=e.length,r=Ja(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));for(let a=0;a!==s;++a)t.setTextureCube(e[a]||ef,r[a])}function wb(i,e,t){const n=this.cache,s=e.length,r=Ja(t,s);Vt(n,r)||(i.uniform1iv(this.addr,r),Wt(n,r));for(let a=0;a!==s;++a)t.setTexture2DArray(e[a]||Qd,r[a])}function Eb(i){switch(i){case 5126:return ab;case 35664:return ob;case 35665:return lb;case 35666:return cb;case 35674:return hb;case 35675:return ub;case 35676:return db;case 5124:case 35670:return fb;case 35667:case 35671:return pb;case 35668:case 35672:return mb;case 35669:case 35673:return gb;case 5125:return vb;case 36294:return bb;case 36295:return _b;case 36296:return Sb;case 35678:case 36198:case 36298:case 36306:case 35682:return xb;case 35679:case 36299:case 36307:return Mb;case 35680:case 36300:case 36308:case 36293:return yb;case 36289:case 36303:case 36311:case 36292:return wb}}class Tb{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=rb(t.type)}}class Ab{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Eb(t.type)}}class Rb{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){const s=this.seq;for(let r=0,a=s.length;r!==a;++r){const o=s[r];o.setValue(e,t[o.id],n)}}}const No=/(\w+)(\])?(\[|\.)?/g;function $h(i,e){i.seq.push(e),i.map[e.id]=e}function Cb(i,e,t){const n=i.name,s=n.length;for(No.lastIndex=0;;){const r=No.exec(n),a=No.lastIndex;let o=r[1];const l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===s){$h(t,c===void 0?new Tb(o,i,e):new Ab(o,i,e));break}else{let d=t.map[o];d===void 0&&(d=new Rb(o),$h(t,d)),t=d}}}class Ta{constructor(e,t){this.seq=[],this.map={};const n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=e.getActiveUniform(t,a),l=e.getUniformLocation(t,o.name);Cb(o,l,this)}const s=[],r=[];for(const a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?s.push(a):r.push(a);s.length>0&&(this.seq=s.concat(r))}setValue(e,t,n,s){const r=this.map[t];r!==void 0&&r.setValue(e,n,s)}setOptional(e,t,n){const s=t[n];s!==void 0&&this.setValue(e,n,s)}static upload(e,t,n,s){for(let r=0,a=t.length;r!==a;++r){const o=t[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,s)}}static seqWithValue(e,t){const n=[];for(let s=0,r=e.length;s!==r;++s){const a=e[s];a.id in t&&n.push(a)}return n}}function Zh(i,e,t){const n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}const Pb=37297;let Lb=0;function Db(i,e){const t=i.split(`
`),n=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let a=s;a<r;a++){const o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}const Kh=new We;function Ib(i){st._getMatrix(Kh,st.workingColorSpace,i);const e=`mat3( ${Kh.elements.map(t=>t.toFixed(4))} )`;switch(st.getTransfer(i)){case Ga:return[e,"LinearTransferOETF"];case pt:return[e,"sRGBTransferOETF"];default:return ze("WebGLProgram: Unsupported color space: ",i),[e,"LinearTransferOETF"]}}function Jh(i,e,t){const n=i.getShaderParameter(e,i.COMPILE_STATUS),r=(i.getShaderInfoLog(e)||"").trim();if(n&&r==="")return"";const a=/ERROR: 0:(\d+)/.exec(r);if(a){const o=parseInt(a[1]);return t.toUpperCase()+`

`+r+`

`+Db(i.getShaderSource(e),o)}else return r}function Fb(i,e){const t=Ib(e);return[`vec4 ${i}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const Ub={[Sd]:"Linear",[xd]:"Reinhard",[Md]:"Cineon",[vc]:"ACESFilmic",[wd]:"AgX",[Ed]:"Neutral",[yd]:"Custom"};function Nb(i,e){const t=Ub[e];return t===void 0?(ze("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const jr=new I;function kb(){st.getLuminanceCoefficients(jr);const i=jr.x.toFixed(4),e=jr.y.toFixed(4),t=jr.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Ob(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(fr).join(`
`)}function zb(i){const e=[];for(const t in i){const n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function Bb(i,e){const t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){const r=i.getActiveAttrib(e,s),a=r.name;let o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),t[a]={type:r.type,location:i.getAttribLocation(e,a),locationSize:o}}return t}function fr(i){return i!==""}function Qh(i,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function jh(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const Hb=/^[ \t]*#include +<([\w\d./]+)>/gm;function ac(i){return i.replace(Hb,Vb)}const Gb=new Map;function Vb(i,e){let t=Ke[e];if(t===void 0){const n=Gb.get(e);if(n!==void 0)t=Ke[n],ze('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">")}return ac(t)}const Wb=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function eu(i){return i.replace(Wb,Xb)}function Xb(i,e,t,n){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function tu(i){let e=`precision ${i.precision} float;
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
#define LOW_PRECISION`),e}const Yb={[vr]:"SHADOWMAP_TYPE_PCF",[dr]:"SHADOWMAP_TYPE_VSM"};function qb(i){return Yb[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const $b={[cs]:"ENVMAP_TYPE_CUBE",[Xs]:"ENVMAP_TYPE_CUBE",[$a]:"ENVMAP_TYPE_CUBE_UV"};function Zb(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":$b[i.envMapMode]||"ENVMAP_TYPE_CUBE"}const Kb={[Xs]:"ENVMAP_MODE_REFRACTION"};function Jb(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":Kb[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}const Qb={[_d]:"ENVMAP_BLENDING_MULTIPLY",[yp]:"ENVMAP_BLENDING_MIX",[wp]:"ENVMAP_BLENDING_ADD"};function jb(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":Qb[i.combine]||"ENVMAP_BLENDING_NONE"}function e_(i){const e=i.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function t_(i,e,t,n){const s=i.getContext(),r=t.defines;let a=t.vertexShader,o=t.fragmentShader;const l=qb(t),c=Zb(t),u=Jb(t),d=jb(t),h=e_(t),f=Ob(t),v=zb(r),_=s.createProgram();let p,g,M=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v].filter(fr).join(`
`),p.length>0&&(p+=`
`),g=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v].filter(fr).join(`
`),g.length>0&&(g+=`
`)):(p=[tu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(fr).join(`
`),g=[tu(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,v,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+u:"",t.envMap?"#define "+d:"",h?"#define CUBEUV_TEXEL_WIDTH "+h.texelWidth:"",h?"#define CUBEUV_TEXEL_HEIGHT "+h.texelHeight:"",h?"#define CUBEUV_MAX_MIP "+h.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Kn?"#define TONE_MAPPING":"",t.toneMapping!==Kn?Ke.tonemapping_pars_fragment:"",t.toneMapping!==Kn?Nb("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ke.colorspace_pars_fragment,Fb("linearToOutputTexel",t.outputColorSpace),kb(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(fr).join(`
`)),a=ac(a),a=Qh(a,t),a=jh(a,t),o=ac(o),o=Qh(o,t),o=jh(o,t),a=eu(a),o=eu(o),t.isRawShaderMaterial!==!0&&(M=`#version 300 es
`,p=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,g=["#define varying in",t.glslVersion===lh?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===lh?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+g);const T=M+p+a,S=M+g+o,R=Zh(s,s.VERTEX_SHADER,T),y=Zh(s,s.FRAGMENT_SHADER,S);s.attachShader(_,R),s.attachShader(_,y),t.index0AttributeName!==void 0?s.bindAttribLocation(_,0,t.index0AttributeName):t.hasPositionAttribute===!0&&s.bindAttribLocation(_,0,"position"),s.linkProgram(_);function E(C){if(i.debug.checkShaderErrors){const L=s.getProgramInfoLog(_)||"",F=s.getShaderInfoLog(R)||"",z=s.getShaderInfoLog(y)||"",D=L.trim(),H=F.trim(),G=z.trim();let K=!0,ne=!0;if(s.getProgramParameter(_,s.LINK_STATUS)===!1)if(K=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,_,R,y);else{const X=Jh(s,R,"vertex"),j=Jh(s,y,"fragment");ct("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(_,s.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+D+`
`+X+`
`+j)}else D!==""?ze("WebGLProgram: Program Info Log:",D):(H===""||G==="")&&(ne=!1);ne&&(C.diagnostics={runnable:K,programLog:D,vertexShader:{log:H,prefix:p},fragmentShader:{log:G,prefix:g}})}s.deleteShader(R),s.deleteShader(y),m=new Ta(s,_),x=Bb(s,_)}let m;this.getUniforms=function(){return m===void 0&&E(this),m};let x;this.getAttributes=function(){return x===void 0&&E(this),x};let A=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return A===!1&&(A=s.getProgramParameter(_,Pb)),A},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(_),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Lb++,this.cacheKey=e,this.usedTimes=1,this.program=_,this.vertexShader=R,this.fragmentShader=y,this}let n_=0;class i_{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){const s=this._getShaderCacheForMaterial(e);return s.has(t)===!1&&(s.add(t),t.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){const t=this.shaderCache;let n=t.get(e);return n===void 0&&(n=new s_(e),t.set(e,n)),n}}class s_{constructor(e){this.id=n_++,this.code=e,this.usedTimes=0}}function r_(i){return i===hs||i===za||i===Ba}function a_(i,e,t,n,s,r){const a=new Ud,o=new i_,l=new Set,c=[],u=new Map,d=n.logarithmicDepthBuffer;let h=n.precision;const f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function v(m){return l.add(m),m===0?"uv":`uv${m}`}function _(m,x,A,C,L,F){const z=C.fog,D=L.geometry,H=m.isMeshStandardMaterial||m.isMeshLambertMaterial||m.isMeshPhongMaterial?C.environment:null,G=m.isMeshStandardMaterial||m.isMeshLambertMaterial&&!m.envMap||m.isMeshPhongMaterial&&!m.envMap,K=e.get(m.envMap||H,G),ne=K&&K.mapping===$a?K.image.height:null,X=f[m.type];m.precision!==null&&(h=n.getMaxPrecision(m.precision),h!==m.precision&&ze("WebGLProgram.getParameters:",m.precision,"not supported, using",h,"instead."));const j=D.morphAttributes.position||D.morphAttributes.normal||D.morphAttributes.color,ie=j!==void 0?j.length:0;let Ae=0;D.morphAttributes.position!==void 0&&(Ae=1),D.morphAttributes.normal!==void 0&&(Ae=2),D.morphAttributes.color!==void 0&&(Ae=3);let Oe,se,V,te;if(X){const Pe=qn[X];Oe=Pe.vertexShader,se=Pe.fragmentShader}else{Oe=m.vertexShader,se=m.fragmentShader;const Pe=o.getVertexShaderStage(m),Rt=o.getFragmentShaderStage(m);o.update(m,Pe,Rt),V=Pe.id,te=Rt.id}const re=i.getRenderTarget(),ge=i.state.buffers.depth.getReversed(),Ce=L.isInstancedMesh===!0,_e=L.isBatchedMesh===!0,je=!!m.map,De=!!m.matcap,nt=!!K,Ge=!!m.aoMap,$e=!!m.lightMap,dt=!!m.bumpMap&&m.wireframe===!1,ot=!!m.normalMap,xt=!!m.displacementMap,Tt=!!m.emissiveMap,yt=!!m.metalnessMap,At=!!m.roughnessMap,k=m.anisotropy>0,Kt=m.clearcoat>0,ut=m.dispersion>0,P=m.iridescence>0,b=m.sheen>0,B=m.transmission>0,Y=k&&!!m.anisotropyMap,J=Kt&&!!m.clearcoatMap,le=Kt&&!!m.clearcoatNormalMap,pe=Kt&&!!m.clearcoatRoughnessMap,ee=P&&!!m.iridescenceMap,W=P&&!!m.iridescenceThicknessMap,de=b&&!!m.sheenColorMap,Re=b&&!!m.sheenRoughnessMap,ue=!!m.specularMap,he=!!m.specularColorMap,Ie=!!m.specularIntensityMap,ke=B&&!!m.transmissionMap,He=B&&!!m.thicknessMap,U=!!m.gradientMap,me=!!m.alphaMap,ae=m.alphaTest>0,ve=!!m.alphaHash,Me=!!m.extensions;let oe=Kn;m.toneMapped&&(re===null||re.isXRRenderTarget===!0)&&(oe=i.toneMapping);const Fe={shaderID:X,shaderType:m.type,shaderName:m.name,vertexShader:Oe,fragmentShader:se,defines:m.defines,customVertexShaderID:V,customFragmentShaderID:te,isRawShaderMaterial:m.isRawShaderMaterial===!0,glslVersion:m.glslVersion,precision:h,batching:_e,batchingColor:_e&&L._colorsTexture!==null,instancing:Ce,instancingColor:Ce&&L.instanceColor!==null,instancingMorph:Ce&&L.morphTexture!==null,outputColorSpace:re===null?i.outputColorSpace:re.isXRRenderTarget===!0?re.texture.colorSpace:st.workingColorSpace,alphaToCoverage:!!m.alphaToCoverage,map:je,matcap:De,envMap:nt,envMapMode:nt&&K.mapping,envMapCubeUVHeight:ne,aoMap:Ge,lightMap:$e,bumpMap:dt,normalMap:ot,displacementMap:xt,emissiveMap:Tt,normalMapObjectSpace:ot&&m.normalMapType===Ap,normalMapTangentSpace:ot&&m.normalMapType===nc,packedNormalMap:ot&&m.normalMapType===nc&&r_(m.normalMap.format),metalnessMap:yt,roughnessMap:At,anisotropy:k,anisotropyMap:Y,clearcoat:Kt,clearcoatMap:J,clearcoatNormalMap:le,clearcoatRoughnessMap:pe,dispersion:ut,iridescence:P,iridescenceMap:ee,iridescenceThicknessMap:W,sheen:b,sheenColorMap:de,sheenRoughnessMap:Re,specularMap:ue,specularColorMap:he,specularIntensityMap:Ie,transmission:B,transmissionMap:ke,thicknessMap:He,gradientMap:U,opaque:m.transparent===!1&&m.blending===zs&&m.alphaToCoverage===!1,alphaMap:me,alphaTest:ae,alphaHash:ve,combine:m.combine,mapUv:je&&v(m.map.channel),aoMapUv:Ge&&v(m.aoMap.channel),lightMapUv:$e&&v(m.lightMap.channel),bumpMapUv:dt&&v(m.bumpMap.channel),normalMapUv:ot&&v(m.normalMap.channel),displacementMapUv:xt&&v(m.displacementMap.channel),emissiveMapUv:Tt&&v(m.emissiveMap.channel),metalnessMapUv:yt&&v(m.metalnessMap.channel),roughnessMapUv:At&&v(m.roughnessMap.channel),anisotropyMapUv:Y&&v(m.anisotropyMap.channel),clearcoatMapUv:J&&v(m.clearcoatMap.channel),clearcoatNormalMapUv:le&&v(m.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:pe&&v(m.clearcoatRoughnessMap.channel),iridescenceMapUv:ee&&v(m.iridescenceMap.channel),iridescenceThicknessMapUv:W&&v(m.iridescenceThicknessMap.channel),sheenColorMapUv:de&&v(m.sheenColorMap.channel),sheenRoughnessMapUv:Re&&v(m.sheenRoughnessMap.channel),specularMapUv:ue&&v(m.specularMap.channel),specularColorMapUv:he&&v(m.specularColorMap.channel),specularIntensityMapUv:Ie&&v(m.specularIntensityMap.channel),transmissionMapUv:ke&&v(m.transmissionMap.channel),thicknessMapUv:He&&v(m.thicknessMap.channel),alphaMapUv:me&&v(m.alphaMap.channel),vertexTangents:!!D.attributes.tangent&&(ot||k),vertexNormals:!!D.attributes.normal,vertexColors:m.vertexColors,vertexAlphas:m.vertexColors===!0&&!!D.attributes.color&&D.attributes.color.itemSize===4,pointsUvs:L.isPoints===!0&&!!D.attributes.uv&&(je||me),fog:!!z,useFog:m.fog===!0,fogExp2:!!z&&z.isFogExp2,flatShading:m.wireframe===!1&&(m.flatShading===!0||D.attributes.normal===void 0&&ot===!1&&(m.isMeshLambertMaterial||m.isMeshPhongMaterial||m.isMeshStandardMaterial||m.isMeshPhysicalMaterial)),sizeAttenuation:m.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:ge,skinning:L.isSkinnedMesh===!0,hasPositionAttribute:D.attributes.position!==void 0,morphTargets:D.morphAttributes.position!==void 0,morphNormals:D.morphAttributes.normal!==void 0,morphColors:D.morphAttributes.color!==void 0,morphTargetsCount:ie,morphTextureStride:Ae,numDirLights:x.directional.length,numPointLights:x.point.length,numSpotLights:x.spot.length,numSpotLightMaps:x.spotLightMap.length,numRectAreaLights:x.rectArea.length,numHemiLights:x.hemi.length,numDirLightShadows:x.directionalShadowMap.length,numPointLightShadows:x.pointShadowMap.length,numSpotLightShadows:x.spotShadowMap.length,numSpotLightShadowsWithMaps:x.numSpotLightShadowsWithMaps,numLightProbes:x.numLightProbes,numLightProbeGrids:F.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:m.dithering,shadowMapEnabled:i.shadowMap.enabled&&A.length>0,shadowMapType:i.shadowMap.type,toneMapping:oe,decodeVideoTexture:je&&m.map.isVideoTexture===!0&&st.getTransfer(m.map.colorSpace)===pt,decodeVideoTextureEmissive:Tt&&m.emissiveMap.isVideoTexture===!0&&st.getTransfer(m.emissiveMap.colorSpace)===pt,premultipliedAlpha:m.premultipliedAlpha,doubleSided:m.side===di,flipSided:m.side===un,useDepthPacking:m.depthPacking>=0,depthPacking:m.depthPacking||0,index0AttributeName:m.index0AttributeName,extensionClipCullDistance:Me&&m.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Me&&m.extensions.multiDraw===!0||_e)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:m.customProgramCacheKey()};return Fe.vertexUv1s=l.has(1),Fe.vertexUv2s=l.has(2),Fe.vertexUv3s=l.has(3),l.clear(),Fe}function p(m){const x=[];if(m.shaderID?x.push(m.shaderID):(x.push(m.customVertexShaderID),x.push(m.customFragmentShaderID)),m.defines!==void 0)for(const A in m.defines)x.push(A),x.push(m.defines[A]);return m.isRawShaderMaterial===!1&&(g(x,m),M(x,m),x.push(i.outputColorSpace)),x.push(m.customProgramCacheKey),x.join()}function g(m,x){m.push(x.precision),m.push(x.outputColorSpace),m.push(x.envMapMode),m.push(x.envMapCubeUVHeight),m.push(x.mapUv),m.push(x.alphaMapUv),m.push(x.lightMapUv),m.push(x.aoMapUv),m.push(x.bumpMapUv),m.push(x.normalMapUv),m.push(x.displacementMapUv),m.push(x.emissiveMapUv),m.push(x.metalnessMapUv),m.push(x.roughnessMapUv),m.push(x.anisotropyMapUv),m.push(x.clearcoatMapUv),m.push(x.clearcoatNormalMapUv),m.push(x.clearcoatRoughnessMapUv),m.push(x.iridescenceMapUv),m.push(x.iridescenceThicknessMapUv),m.push(x.sheenColorMapUv),m.push(x.sheenRoughnessMapUv),m.push(x.specularMapUv),m.push(x.specularColorMapUv),m.push(x.specularIntensityMapUv),m.push(x.transmissionMapUv),m.push(x.thicknessMapUv),m.push(x.combine),m.push(x.fogExp2),m.push(x.sizeAttenuation),m.push(x.morphTargetsCount),m.push(x.morphAttributeCount),m.push(x.numDirLights),m.push(x.numPointLights),m.push(x.numSpotLights),m.push(x.numSpotLightMaps),m.push(x.numHemiLights),m.push(x.numRectAreaLights),m.push(x.numDirLightShadows),m.push(x.numPointLightShadows),m.push(x.numSpotLightShadows),m.push(x.numSpotLightShadowsWithMaps),m.push(x.numLightProbes),m.push(x.shadowMapType),m.push(x.toneMapping),m.push(x.numClippingPlanes),m.push(x.numClipIntersection),m.push(x.depthPacking)}function M(m,x){a.disableAll(),x.instancing&&a.enable(0),x.instancingColor&&a.enable(1),x.instancingMorph&&a.enable(2),x.matcap&&a.enable(3),x.envMap&&a.enable(4),x.normalMapObjectSpace&&a.enable(5),x.normalMapTangentSpace&&a.enable(6),x.clearcoat&&a.enable(7),x.iridescence&&a.enable(8),x.alphaTest&&a.enable(9),x.vertexColors&&a.enable(10),x.vertexAlphas&&a.enable(11),x.vertexUv1s&&a.enable(12),x.vertexUv2s&&a.enable(13),x.vertexUv3s&&a.enable(14),x.vertexTangents&&a.enable(15),x.anisotropy&&a.enable(16),x.alphaHash&&a.enable(17),x.batching&&a.enable(18),x.dispersion&&a.enable(19),x.batchingColor&&a.enable(20),x.gradientMap&&a.enable(21),x.packedNormalMap&&a.enable(22),x.vertexNormals&&a.enable(23),m.push(a.mask),a.disableAll(),x.fog&&a.enable(0),x.useFog&&a.enable(1),x.flatShading&&a.enable(2),x.logarithmicDepthBuffer&&a.enable(3),x.reversedDepthBuffer&&a.enable(4),x.skinning&&a.enable(5),x.morphTargets&&a.enable(6),x.morphNormals&&a.enable(7),x.morphColors&&a.enable(8),x.premultipliedAlpha&&a.enable(9),x.shadowMapEnabled&&a.enable(10),x.doubleSided&&a.enable(11),x.flipSided&&a.enable(12),x.useDepthPacking&&a.enable(13),x.dithering&&a.enable(14),x.transmission&&a.enable(15),x.sheen&&a.enable(16),x.opaque&&a.enable(17),x.pointsUvs&&a.enable(18),x.decodeVideoTexture&&a.enable(19),x.decodeVideoTextureEmissive&&a.enable(20),x.alphaToCoverage&&a.enable(21),x.numLightProbeGrids>0&&a.enable(22),x.hasPositionAttribute&&a.enable(23),m.push(a.mask)}function T(m){const x=f[m.type];let A;if(x){const C=qn[x];A=Tm.clone(C.uniforms)}else A=m.uniforms;return A}function S(m,x){let A=u.get(x);return A!==void 0?++A.usedTimes:(A=new t_(i,x,m,s),c.push(A),u.set(x,A)),A}function R(m){if(--m.usedTimes===0){const x=c.indexOf(m);c[x]=c[c.length-1],c.pop(),u.delete(m.cacheKey),m.destroy()}}function y(m){o.remove(m)}function E(){o.dispose()}return{getParameters:_,getProgramCacheKey:p,getUniforms:T,acquireProgram:S,releaseProgram:R,releaseShaderCache:y,programs:c,dispose:E}}function o_(){let i=new WeakMap;function e(a){return i.has(a)}function t(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,l){i.get(a)[o]=l}function r(){i=new WeakMap}return{has:e,get:t,remove:n,update:s,dispose:r}}function l_(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.materialVariant!==e.materialVariant?i.materialVariant-e.materialVariant:i.z!==e.z?i.z-e.z:i.id-e.id}function nu(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function iu(){const i=[];let e=0;const t=[],n=[],s=[];function r(){e=0,t.length=0,n.length=0,s.length=0}function a(h){let f=0;return h.isInstancedMesh&&(f+=2),h.isSkinnedMesh&&(f+=1),f}function o(h,f,v,_,p,g){let M=i[e];return M===void 0?(M={id:h.id,object:h,geometry:f,material:v,materialVariant:a(h),groupOrder:_,renderOrder:h.renderOrder,z:p,group:g},i[e]=M):(M.id=h.id,M.object=h,M.geometry=f,M.material=v,M.materialVariant=a(h),M.groupOrder=_,M.renderOrder=h.renderOrder,M.z=p,M.group=g),e++,M}function l(h,f,v,_,p,g){const M=o(h,f,v,_,p,g);v.transmission>0?n.push(M):v.transparent===!0?s.push(M):t.push(M)}function c(h,f,v,_,p,g){const M=o(h,f,v,_,p,g);v.transmission>0?n.unshift(M):v.transparent===!0?s.unshift(M):t.unshift(M)}function u(h,f,v){t.length>1&&t.sort(h||l_),n.length>1&&n.sort(f||nu),s.length>1&&s.sort(f||nu),v&&(t.reverse(),n.reverse(),s.reverse())}function d(){for(let h=e,f=i.length;h<f;h++){const v=i[h];if(v.id===null)break;v.id=null,v.object=null,v.geometry=null,v.material=null,v.group=null}}return{opaque:t,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:d,sort:u}}function c_(){let i=new WeakMap;function e(n,s){const r=i.get(n);let a;return r===void 0?(a=new iu,i.set(n,[a])):s>=r.length?(a=new iu,r.push(a)):a=r[s],a}function t(){i=new WeakMap}return{get:e,dispose:t}}function h_(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new I,color:new Ve};break;case"SpotLight":t={position:new I,direction:new I,color:new Ve,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new I,color:new Ve,distance:0,decay:0};break;case"HemisphereLight":t={direction:new I,skyColor:new Ve,groundColor:new Ve};break;case"RectAreaLight":t={color:new Ve,position:new I,halfWidth:new I,halfHeight:new I};break}return i[e.id]=t,t}}}function u_(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new tt};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new tt};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new tt,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}let d_=0;function f_(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function p_(i){const e=new h_,t=u_(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new I);const s=new I,r=new rt,a=new rt;function o(c){let u=0,d=0,h=0;for(let x=0;x<9;x++)n.probe[x].set(0,0,0);let f=0,v=0,_=0,p=0,g=0,M=0,T=0,S=0,R=0,y=0,E=0;c.sort(f_);for(let x=0,A=c.length;x<A;x++){const C=c[x],L=C.color,F=C.intensity,z=C.distance;let D=null;if(C.shadow&&C.shadow.map&&(C.shadow.map.texture.format===hs?D=C.shadow.map.texture:D=C.shadow.map.depthTexture||C.shadow.map.texture),C.isAmbientLight)u+=L.r*F,d+=L.g*F,h+=L.b*F;else if(C.isLightProbe){for(let H=0;H<9;H++)n.probe[H].addScaledVector(C.sh.coefficients[H],F);E++}else if(C.isDirectionalLight){const H=e.get(C);if(H.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){const G=C.shadow,K=t.get(C);K.shadowIntensity=G.intensity,K.shadowBias=G.bias,K.shadowNormalBias=G.normalBias,K.shadowRadius=G.radius,K.shadowMapSize=G.mapSize,n.directionalShadow[f]=K,n.directionalShadowMap[f]=D,n.directionalShadowMatrix[f]=C.shadow.matrix,M++}n.directional[f]=H,f++}else if(C.isSpotLight){const H=e.get(C);H.position.setFromMatrixPosition(C.matrixWorld),H.color.copy(L).multiplyScalar(F),H.distance=z,H.coneCos=Math.cos(C.angle),H.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),H.decay=C.decay,n.spot[_]=H;const G=C.shadow;if(C.map&&(n.spotLightMap[R]=C.map,R++,G.updateMatrices(C),C.castShadow&&y++),n.spotLightMatrix[_]=G.matrix,C.castShadow){const K=t.get(C);K.shadowIntensity=G.intensity,K.shadowBias=G.bias,K.shadowNormalBias=G.normalBias,K.shadowRadius=G.radius,K.shadowMapSize=G.mapSize,n.spotShadow[_]=K,n.spotShadowMap[_]=D,S++}_++}else if(C.isRectAreaLight){const H=e.get(C);H.color.copy(L).multiplyScalar(F),H.halfWidth.set(C.width*.5,0,0),H.halfHeight.set(0,C.height*.5,0),n.rectArea[p]=H,p++}else if(C.isPointLight){const H=e.get(C);if(H.color.copy(C.color).multiplyScalar(C.intensity),H.distance=C.distance,H.decay=C.decay,C.castShadow){const G=C.shadow,K=t.get(C);K.shadowIntensity=G.intensity,K.shadowBias=G.bias,K.shadowNormalBias=G.normalBias,K.shadowRadius=G.radius,K.shadowMapSize=G.mapSize,K.shadowCameraNear=G.camera.near,K.shadowCameraFar=G.camera.far,n.pointShadow[v]=K,n.pointShadowMap[v]=D,n.pointShadowMatrix[v]=C.shadow.matrix,T++}n.point[v]=H,v++}else if(C.isHemisphereLight){const H=e.get(C);H.skyColor.copy(C.color).multiplyScalar(F),H.groundColor.copy(C.groundColor).multiplyScalar(F),n.hemi[g]=H,g++}}p>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=be.LTC_FLOAT_1,n.rectAreaLTC2=be.LTC_FLOAT_2):(n.rectAreaLTC1=be.LTC_HALF_1,n.rectAreaLTC2=be.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=d,n.ambient[2]=h;const m=n.hash;(m.directionalLength!==f||m.pointLength!==v||m.spotLength!==_||m.rectAreaLength!==p||m.hemiLength!==g||m.numDirectionalShadows!==M||m.numPointShadows!==T||m.numSpotShadows!==S||m.numSpotMaps!==R||m.numLightProbes!==E)&&(n.directional.length=f,n.spot.length=_,n.rectArea.length=p,n.point.length=v,n.hemi.length=g,n.directionalShadow.length=M,n.directionalShadowMap.length=M,n.pointShadow.length=T,n.pointShadowMap.length=T,n.spotShadow.length=S,n.spotShadowMap.length=S,n.directionalShadowMatrix.length=M,n.pointShadowMatrix.length=T,n.spotLightMatrix.length=S+R-y,n.spotLightMap.length=R,n.numSpotLightShadowsWithMaps=y,n.numLightProbes=E,m.directionalLength=f,m.pointLength=v,m.spotLength=_,m.rectAreaLength=p,m.hemiLength=g,m.numDirectionalShadows=M,m.numPointShadows=T,m.numSpotShadows=S,m.numSpotMaps=R,m.numLightProbes=E,n.version=d_++)}function l(c,u){let d=0,h=0,f=0,v=0,_=0;const p=u.matrixWorldInverse;for(let g=0,M=c.length;g<M;g++){const T=c[g];if(T.isDirectionalLight){const S=n.directional[d];S.direction.setFromMatrixPosition(T.matrixWorld),s.setFromMatrixPosition(T.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(p),d++}else if(T.isSpotLight){const S=n.spot[f];S.position.setFromMatrixPosition(T.matrixWorld),S.position.applyMatrix4(p),S.direction.setFromMatrixPosition(T.matrixWorld),s.setFromMatrixPosition(T.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(p),f++}else if(T.isRectAreaLight){const S=n.rectArea[v];S.position.setFromMatrixPosition(T.matrixWorld),S.position.applyMatrix4(p),a.identity(),r.copy(T.matrixWorld),r.premultiply(p),a.extractRotation(r),S.halfWidth.set(T.width*.5,0,0),S.halfHeight.set(0,T.height*.5,0),S.halfWidth.applyMatrix4(a),S.halfHeight.applyMatrix4(a),v++}else if(T.isPointLight){const S=n.point[h];S.position.setFromMatrixPosition(T.matrixWorld),S.position.applyMatrix4(p),h++}else if(T.isHemisphereLight){const S=n.hemi[_];S.direction.setFromMatrixPosition(T.matrixWorld),S.direction.transformDirection(p),_++}}}return{setup:o,setupView:l,state:n}}function su(i){const e=new p_(i),t=[],n=[],s=[];function r(h){d.camera=h,t.length=0,n.length=0,s.length=0}function a(h){t.push(h)}function o(h){n.push(h)}function l(h){s.push(h)}function c(){e.setup(t)}function u(h){e.setupView(t,h)}const d={lightsArray:t,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:d,setupLights:c,setupLightsView:u,pushLight:a,pushShadow:o,pushLightProbeGrid:l}}function m_(i){let e=new WeakMap;function t(s,r=0){const a=e.get(s);let o;return a===void 0?(o=new su(i),e.set(s,[o])):r>=a.length?(o=new su(i),a.push(o)):o=a[r],o}function n(){e=new WeakMap}return{get:t,dispose:n}}const g_=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,v_=`uniform sampler2D shadow_pass;
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
}`,b_=[new I(1,0,0),new I(-1,0,0),new I(0,1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1)],__=[new I(0,-1,0),new I(0,-1,0),new I(0,0,1),new I(0,0,-1),new I(0,-1,0),new I(0,-1,0)],ru=new rt,or=new I,ko=new I;function S_(i,e,t){let n=new Lc;const s=new tt,r=new tt,a=new Et,o=new Pm,l=new Lm,c={},u=t.maxTextureSize,d={[Wi]:un,[un]:Wi,[di]:di},h=new ti({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new tt},radius:{value:4}},vertexShader:g_,fragmentShader:v_}),f=h.clone();f.defines.HORIZONTAL_PASS=1;const v=new Ut;v.setAttribute("position",new dn(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const _=new ht(v,h),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=vr;let g=this.type;this.render=function(y,E,m){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||y.length===0)return;this.type===sp&&(ze("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=vr);const x=i.getRenderTarget(),A=i.getActiveCubeFace(),C=i.getActiveMipmapLevel(),L=i.state;L.setBlending(bi),L.buffers.depth.getReversed()===!0?L.buffers.color.setClear(0,0,0,0):L.buffers.color.setClear(1,1,1,1),L.buffers.depth.setTest(!0),L.setScissorTest(!1);const F=g!==this.type;F&&E.traverse(function(z){z.material&&(Array.isArray(z.material)?z.material.forEach(D=>D.needsUpdate=!0):z.material.needsUpdate=!0)});for(let z=0,D=y.length;z<D;z++){const H=y[z],G=H.shadow;if(G===void 0){ze("WebGLShadowMap:",H,"has no shadow.");continue}if(G.autoUpdate===!1&&G.needsUpdate===!1)continue;s.copy(G.mapSize);const K=G.getFrameExtents();s.multiply(K),r.copy(G.mapSize),(s.x>u||s.y>u)&&(s.x>u&&(r.x=Math.floor(u/K.x),s.x=r.x*K.x,G.mapSize.x=r.x),s.y>u&&(r.y=Math.floor(u/K.y),s.y=r.y*K.y,G.mapSize.y=r.y));const ne=i.state.buffers.depth.getReversed();if(G.camera._reversedDepth=ne,G.map===null||F===!0){if(G.map!==null&&(G.map.depthTexture!==null&&(G.map.depthTexture.dispose(),G.map.depthTexture=null),G.map.dispose()),this.type===dr){if(H.isPointLight){ze("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}G.map=new Jn(s.x,s.y,{format:hs,type:xi,minFilter:Zt,magFilter:Zt,generateMipmaps:!1}),G.map.texture.name=H.name+".shadowMap",G.map.depthTexture=new Ys(s.x,s.y,kn),G.map.depthTexture.name=H.name+".shadowMapDepth",G.map.depthTexture.format=Mi,G.map.depthTexture.compareFunction=null,G.map.depthTexture.minFilter=$t,G.map.depthTexture.magFilter=$t}else H.isPointLight?(G.map=new Kd(s.x),G.map.depthTexture=new wm(s.x,ei)):(G.map=new Jn(s.x,s.y),G.map.depthTexture=new Ys(s.x,s.y,ei)),G.map.depthTexture.name=H.name+".shadowMap",G.map.depthTexture.format=Mi,this.type===vr?(G.map.depthTexture.compareFunction=ne?Tc:Ec,G.map.depthTexture.minFilter=Zt,G.map.depthTexture.magFilter=Zt):(G.map.depthTexture.compareFunction=null,G.map.depthTexture.minFilter=$t,G.map.depthTexture.magFilter=$t);G.camera.updateProjectionMatrix()}const X=G.map.isWebGLCubeRenderTarget?6:1;for(let j=0;j<X;j++){if(G.map.isWebGLCubeRenderTarget)i.setRenderTarget(G.map,j),i.clear();else{j===0&&(i.setRenderTarget(G.map),i.clear());const ie=G.getViewport(j);a.set(r.x*ie.x,r.y*ie.y,r.x*ie.z,r.y*ie.w),L.viewport(a)}if(H.isPointLight){const ie=G.camera,Ae=G.matrix,Oe=H.distance||ie.far;Oe!==ie.far&&(ie.far=Oe,ie.updateProjectionMatrix()),or.setFromMatrixPosition(H.matrixWorld),ie.position.copy(or),ko.copy(ie.position),ko.add(b_[j]),ie.up.copy(__[j]),ie.lookAt(ko),ie.updateMatrixWorld(),Ae.makeTranslation(-or.x,-or.y,-or.z),ru.multiplyMatrices(ie.projectionMatrix,ie.matrixWorldInverse),G._frustum.setFromProjectionMatrix(ru,ie.coordinateSystem,ie.reversedDepth)}else G.updateMatrices(H);n=G.getFrustum(),S(E,m,G.camera,H,this.type)}G.isPointLightShadow!==!0&&this.type===dr&&M(G,m),G.needsUpdate=!1}g=this.type,p.needsUpdate=!1,i.setRenderTarget(x,A,C)};function M(y,E){const m=e.update(_);h.defines.VSM_SAMPLES!==y.blurSamples&&(h.defines.VSM_SAMPLES=y.blurSamples,f.defines.VSM_SAMPLES=y.blurSamples,h.needsUpdate=!0,f.needsUpdate=!0),y.mapPass===null&&(y.mapPass=new Jn(s.x,s.y,{format:hs,type:xi})),h.uniforms.shadow_pass.value=y.map.depthTexture,h.uniforms.resolution.value=y.mapSize,h.uniforms.radius.value=y.radius,i.setRenderTarget(y.mapPass),i.clear(),i.renderBufferDirect(E,null,m,h,_,null),f.uniforms.shadow_pass.value=y.mapPass.texture,f.uniforms.resolution.value=y.mapSize,f.uniforms.radius.value=y.radius,i.setRenderTarget(y.map),i.clear(),i.renderBufferDirect(E,null,m,f,_,null)}function T(y,E,m,x){let A=null;const C=m.isPointLight===!0?y.customDistanceMaterial:y.customDepthMaterial;if(C!==void 0)A=C;else if(A=m.isPointLight===!0?l:o,i.localClippingEnabled&&E.clipShadows===!0&&Array.isArray(E.clippingPlanes)&&E.clippingPlanes.length!==0||E.displacementMap&&E.displacementScale!==0||E.alphaMap&&E.alphaTest>0||E.map&&E.alphaTest>0||E.alphaToCoverage===!0){const L=A.uuid,F=E.uuid;let z=c[L];z===void 0&&(z={},c[L]=z);let D=z[F];D===void 0&&(D=A.clone(),z[F]=D,E.addEventListener("dispose",R)),A=D}if(A.visible=E.visible,A.wireframe=E.wireframe,x===dr?A.side=E.shadowSide!==null?E.shadowSide:E.side:A.side=E.shadowSide!==null?E.shadowSide:d[E.side],A.alphaMap=E.alphaMap,A.alphaTest=E.alphaToCoverage===!0?.5:E.alphaTest,A.map=E.map,A.clipShadows=E.clipShadows,A.clippingPlanes=E.clippingPlanes,A.clipIntersection=E.clipIntersection,A.displacementMap=E.displacementMap,A.displacementScale=E.displacementScale,A.displacementBias=E.displacementBias,A.wireframeLinewidth=E.wireframeLinewidth,A.linewidth=E.linewidth,m.isPointLight===!0&&A.isMeshDistanceMaterial===!0){const L=i.properties.get(A);L.light=m}return A}function S(y,E,m,x,A){if(y.visible===!1)return;if(y.layers.test(E.layers)&&(y.isMesh||y.isLine||y.isPoints)&&(y.castShadow||y.receiveShadow&&A===dr)&&(!y.frustumCulled||n.intersectsObject(y))){y.modelViewMatrix.multiplyMatrices(m.matrixWorldInverse,y.matrixWorld);const F=e.update(y),z=y.material;if(Array.isArray(z)){const D=F.groups;for(let H=0,G=D.length;H<G;H++){const K=D[H],ne=z[K.materialIndex];if(ne&&ne.visible){const X=T(y,ne,x,A);y.onBeforeShadow(i,y,E,m,F,X,K),i.renderBufferDirect(m,null,F,X,y,K),y.onAfterShadow(i,y,E,m,F,X,K)}}}else if(z.visible){const D=T(y,z,x,A);y.onBeforeShadow(i,y,E,m,F,D,null),i.renderBufferDirect(m,null,F,D,y,null),y.onAfterShadow(i,y,E,m,F,D,null)}}const L=y.children;for(let F=0,z=L.length;F<z;F++)S(L[F],E,m,x,A)}function R(y){y.target.removeEventListener("dispose",R);for(const m in c){const x=c[m],A=y.target.uuid;A in x&&(x[A].dispose(),delete x[A])}}}function x_(i,e){function t(){let U=!1;const me=new Et;let ae=null;const ve=new Et(0,0,0,0);return{setMask:function(Me){ae!==Me&&!U&&(i.colorMask(Me,Me,Me,Me),ae=Me)},setLocked:function(Me){U=Me},setClear:function(Me,oe,Fe,Pe,Rt){Rt===!0&&(Me*=Pe,oe*=Pe,Fe*=Pe),me.set(Me,oe,Fe,Pe),ve.equals(me)===!1&&(i.clearColor(Me,oe,Fe,Pe),ve.copy(me))},reset:function(){U=!1,ae=null,ve.set(-1,0,0,0)}}}function n(){let U=!1,me=!1,ae=null,ve=null,Me=null;return{setReversed:function(oe){if(me!==oe){const Fe=e.get("EXT_clip_control");oe?Fe.clipControlEXT(Fe.LOWER_LEFT_EXT,Fe.ZERO_TO_ONE_EXT):Fe.clipControlEXT(Fe.LOWER_LEFT_EXT,Fe.NEGATIVE_ONE_TO_ONE_EXT),me=oe;const Pe=Me;Me=null,this.setClear(Pe)}},getReversed:function(){return me},setTest:function(oe){oe?re(i.DEPTH_TEST):ge(i.DEPTH_TEST)},setMask:function(oe){ae!==oe&&!U&&(i.depthMask(oe),ae=oe)},setFunc:function(oe){if(me&&(oe=kp[oe]),ve!==oe){switch(oe){case bl:i.depthFunc(i.NEVER);break;case _l:i.depthFunc(i.ALWAYS);break;case Sl:i.depthFunc(i.LESS);break;case Ws:i.depthFunc(i.LEQUAL);break;case xl:i.depthFunc(i.EQUAL);break;case Ml:i.depthFunc(i.GEQUAL);break;case yl:i.depthFunc(i.GREATER);break;case wl:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}ve=oe}},setLocked:function(oe){U=oe},setClear:function(oe){Me!==oe&&(Me=oe,me&&(oe=1-oe),i.clearDepth(oe))},reset:function(){U=!1,ae=null,ve=null,Me=null,me=!1}}}function s(){let U=!1,me=null,ae=null,ve=null,Me=null,oe=null,Fe=null,Pe=null,Rt=null;return{setTest:function(_t){U||(_t?re(i.STENCIL_TEST):ge(i.STENCIL_TEST))},setMask:function(_t){me!==_t&&!U&&(i.stencilMask(_t),me=_t)},setFunc:function(_t,zn,Bn){(ae!==_t||ve!==zn||Me!==Bn)&&(i.stencilFunc(_t,zn,Bn),ae=_t,ve=zn,Me=Bn)},setOp:function(_t,zn,Bn){(oe!==_t||Fe!==zn||Pe!==Bn)&&(i.stencilOp(_t,zn,Bn),oe=_t,Fe=zn,Pe=Bn)},setLocked:function(_t){U=_t},setClear:function(_t){Rt!==_t&&(i.clearStencil(_t),Rt=_t)},reset:function(){U=!1,me=null,ae=null,ve=null,Me=null,oe=null,Fe=null,Pe=null,Rt=null}}}const r=new t,a=new n,o=new s,l=new WeakMap,c=new WeakMap;let u={},d={},h={},f=new WeakMap,v=[],_=null,p=!1,g=null,M=null,T=null,S=null,R=null,y=null,E=null,m=new Ve(0,0,0),x=0,A=!1,C=null,L=null,F=null,z=null,D=null;const H=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let G=!1,K=0;const ne=i.getParameter(i.VERSION);ne.indexOf("WebGL")!==-1?(K=parseFloat(/^WebGL (\d)/.exec(ne)[1]),G=K>=1):ne.indexOf("OpenGL ES")!==-1&&(K=parseFloat(/^OpenGL ES (\d)/.exec(ne)[1]),G=K>=2);let X=null,j={};const ie=i.getParameter(i.SCISSOR_BOX),Ae=i.getParameter(i.VIEWPORT),Oe=new Et().fromArray(ie),se=new Et().fromArray(Ae);function V(U,me,ae,ve){const Me=new Uint8Array(4),oe=i.createTexture();i.bindTexture(U,oe),i.texParameteri(U,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(U,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let Fe=0;Fe<ae;Fe++)U===i.TEXTURE_3D||U===i.TEXTURE_2D_ARRAY?i.texImage3D(me,0,i.RGBA,1,1,ve,0,i.RGBA,i.UNSIGNED_BYTE,Me):i.texImage2D(me+Fe,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,Me);return oe}const te={};te[i.TEXTURE_2D]=V(i.TEXTURE_2D,i.TEXTURE_2D,1),te[i.TEXTURE_CUBE_MAP]=V(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),te[i.TEXTURE_2D_ARRAY]=V(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),te[i.TEXTURE_3D]=V(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),re(i.DEPTH_TEST),a.setFunc(Ws),dt(!1),ot(th),re(i.CULL_FACE),Ge(bi);function re(U){u[U]!==!0&&(i.enable(U),u[U]=!0)}function ge(U){u[U]!==!1&&(i.disable(U),u[U]=!1)}function Ce(U,me){return h[U]!==me?(i.bindFramebuffer(U,me),h[U]=me,U===i.DRAW_FRAMEBUFFER&&(h[i.FRAMEBUFFER]=me),U===i.FRAMEBUFFER&&(h[i.DRAW_FRAMEBUFFER]=me),!0):!1}function _e(U,me){let ae=v,ve=!1;if(U){ae=f.get(me),ae===void 0&&(ae=[],f.set(me,ae));const Me=U.textures;if(ae.length!==Me.length||ae[0]!==i.COLOR_ATTACHMENT0){for(let oe=0,Fe=Me.length;oe<Fe;oe++)ae[oe]=i.COLOR_ATTACHMENT0+oe;ae.length=Me.length,ve=!0}}else ae[0]!==i.BACK&&(ae[0]=i.BACK,ve=!0);ve&&i.drawBuffers(ae)}function je(U){return _!==U?(i.useProgram(U),_=U,!0):!1}const De={[ts]:i.FUNC_ADD,[ap]:i.FUNC_SUBTRACT,[op]:i.FUNC_REVERSE_SUBTRACT};De[lp]=i.MIN,De[cp]=i.MAX;const nt={[hp]:i.ZERO,[up]:i.ONE,[dp]:i.SRC_COLOR,[gl]:i.SRC_ALPHA,[bp]:i.SRC_ALPHA_SATURATE,[gp]:i.DST_COLOR,[pp]:i.DST_ALPHA,[fp]:i.ONE_MINUS_SRC_COLOR,[vl]:i.ONE_MINUS_SRC_ALPHA,[vp]:i.ONE_MINUS_DST_COLOR,[mp]:i.ONE_MINUS_DST_ALPHA,[_p]:i.CONSTANT_COLOR,[Sp]:i.ONE_MINUS_CONSTANT_COLOR,[xp]:i.CONSTANT_ALPHA,[Mp]:i.ONE_MINUS_CONSTANT_ALPHA};function Ge(U,me,ae,ve,Me,oe,Fe,Pe,Rt,_t){if(U===bi){p===!0&&(ge(i.BLEND),p=!1);return}if(p===!1&&(re(i.BLEND),p=!0),U!==rp){if(U!==g||_t!==A){if((M!==ts||R!==ts)&&(i.blendEquation(i.FUNC_ADD),M=ts,R=ts),_t)switch(U){case zs:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case nh:i.blendFunc(i.ONE,i.ONE);break;case ih:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case sh:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:ct("WebGLState: Invalid blending: ",U);break}else switch(U){case zs:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case nh:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case ih:ct("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case sh:ct("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:ct("WebGLState: Invalid blending: ",U);break}T=null,S=null,y=null,E=null,m.set(0,0,0),x=0,g=U,A=_t}return}Me=Me||me,oe=oe||ae,Fe=Fe||ve,(me!==M||Me!==R)&&(i.blendEquationSeparate(De[me],De[Me]),M=me,R=Me),(ae!==T||ve!==S||oe!==y||Fe!==E)&&(i.blendFuncSeparate(nt[ae],nt[ve],nt[oe],nt[Fe]),T=ae,S=ve,y=oe,E=Fe),(Pe.equals(m)===!1||Rt!==x)&&(i.blendColor(Pe.r,Pe.g,Pe.b,Rt),m.copy(Pe),x=Rt),g=U,A=!1}function $e(U,me){U.side===di?ge(i.CULL_FACE):re(i.CULL_FACE);let ae=U.side===un;me&&(ae=!ae),dt(ae),U.blending===zs&&U.transparent===!1?Ge(bi):Ge(U.blending,U.blendEquation,U.blendSrc,U.blendDst,U.blendEquationAlpha,U.blendSrcAlpha,U.blendDstAlpha,U.blendColor,U.blendAlpha,U.premultipliedAlpha),a.setFunc(U.depthFunc),a.setTest(U.depthTest),a.setMask(U.depthWrite),r.setMask(U.colorWrite);const ve=U.stencilWrite;o.setTest(ve),ve&&(o.setMask(U.stencilWriteMask),o.setFunc(U.stencilFunc,U.stencilRef,U.stencilFuncMask),o.setOp(U.stencilFail,U.stencilZFail,U.stencilZPass)),Tt(U.polygonOffset,U.polygonOffsetFactor,U.polygonOffsetUnits),U.alphaToCoverage===!0?re(i.SAMPLE_ALPHA_TO_COVERAGE):ge(i.SAMPLE_ALPHA_TO_COVERAGE)}function dt(U){C!==U&&(U?i.frontFace(i.CW):i.frontFace(i.CCW),C=U)}function ot(U){U!==np?(re(i.CULL_FACE),U!==L&&(U===th?i.cullFace(i.BACK):U===ip?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):ge(i.CULL_FACE),L=U}function xt(U){U!==F&&(G&&i.lineWidth(U),F=U)}function Tt(U,me,ae){U?(re(i.POLYGON_OFFSET_FILL),(z!==me||D!==ae)&&(z=me,D=ae,a.getReversed()&&(me=-me),i.polygonOffset(me,ae))):ge(i.POLYGON_OFFSET_FILL)}function yt(U){U?re(i.SCISSOR_TEST):ge(i.SCISSOR_TEST)}function At(U){U===void 0&&(U=i.TEXTURE0+H-1),X!==U&&(i.activeTexture(U),X=U)}function k(U,me,ae){ae===void 0&&(X===null?ae=i.TEXTURE0+H-1:ae=X);let ve=j[ae];ve===void 0&&(ve={type:void 0,texture:void 0},j[ae]=ve),(ve.type!==U||ve.texture!==me)&&(X!==ae&&(i.activeTexture(ae),X=ae),i.bindTexture(U,me||te[U]),ve.type=U,ve.texture=me)}function Kt(){const U=j[X];U!==void 0&&U.type!==void 0&&(i.bindTexture(U.type,null),U.type=void 0,U.texture=void 0)}function ut(){try{i.compressedTexImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function P(){try{i.compressedTexImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function b(){try{i.texSubImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function B(){try{i.texSubImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function Y(){try{i.compressedTexSubImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function J(){try{i.compressedTexSubImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function le(){try{i.texStorage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function pe(){try{i.texStorage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function ee(){try{i.texImage2D(...arguments)}catch(U){ct("WebGLState:",U)}}function W(){try{i.texImage3D(...arguments)}catch(U){ct("WebGLState:",U)}}function de(U){return d[U]!==void 0?d[U]:i.getParameter(U)}function Re(U,me){d[U]!==me&&(i.pixelStorei(U,me),d[U]=me)}function ue(U){Oe.equals(U)===!1&&(i.scissor(U.x,U.y,U.z,U.w),Oe.copy(U))}function he(U){se.equals(U)===!1&&(i.viewport(U.x,U.y,U.z,U.w),se.copy(U))}function Ie(U,me){let ae=c.get(me);ae===void 0&&(ae=new WeakMap,c.set(me,ae));let ve=ae.get(U);ve===void 0&&(ve=i.getUniformBlockIndex(me,U.name),ae.set(U,ve))}function ke(U,me){const ve=c.get(me).get(U);l.get(me)!==ve&&(i.uniformBlockBinding(me,ve,U.__bindingPointIndex),l.set(me,ve))}function He(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),u={},d={},X=null,j={},h={},f=new WeakMap,v=[],_=null,p=!1,g=null,M=null,T=null,S=null,R=null,y=null,E=null,m=new Ve(0,0,0),x=0,A=!1,C=null,L=null,F=null,z=null,D=null,Oe.set(0,0,i.canvas.width,i.canvas.height),se.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:re,disable:ge,bindFramebuffer:Ce,drawBuffers:_e,useProgram:je,setBlending:Ge,setMaterial:$e,setFlipSided:dt,setCullFace:ot,setLineWidth:xt,setPolygonOffset:Tt,setScissorTest:yt,activeTexture:At,bindTexture:k,unbindTexture:Kt,compressedTexImage2D:ut,compressedTexImage3D:P,texImage2D:ee,texImage3D:W,pixelStorei:Re,getParameter:de,updateUBOMapping:Ie,uniformBlockBinding:ke,texStorage2D:le,texStorage3D:pe,texSubImage2D:b,texSubImage3D:B,compressedTexSubImage2D:Y,compressedTexSubImage3D:J,scissor:ue,viewport:he,reset:He}}function M_(i,e,t,n,s,r,a){const o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new tt,u=new WeakMap,d=new Set;let h;const f=new WeakMap;let v=!1;try{v=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function _(P,b){return v?new OffscreenCanvas(P,b):Va("canvas")}function p(P,b,B){let Y=1;const J=ut(P);if((J.width>B||J.height>B)&&(Y=B/Math.max(J.width,J.height)),Y<1)if(typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&P instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&P instanceof ImageBitmap||typeof VideoFrame<"u"&&P instanceof VideoFrame){const le=Math.floor(Y*J.width),pe=Math.floor(Y*J.height);h===void 0&&(h=_(le,pe));const ee=b?_(le,pe):h;return ee.width=le,ee.height=pe,ee.getContext("2d").drawImage(P,0,0,le,pe),ze("WebGLRenderer: Texture has been resized from ("+J.width+"x"+J.height+") to ("+le+"x"+pe+")."),ee}else return"data"in P&&ze("WebGLRenderer: Image in DataTexture is too big ("+J.width+"x"+J.height+")."),P;return P}function g(P){return P.generateMipmaps}function M(P){i.generateMipmap(P)}function T(P){return P.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:P.isWebGL3DRenderTarget?i.TEXTURE_3D:P.isWebGLArrayRenderTarget||P.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function S(P,b,B,Y,J,le=!1){if(P!==null){if(i[P]!==void 0)return i[P];ze("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+P+"'")}let pe;Y&&(pe=e.get("EXT_texture_norm16"),pe||ze("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let ee=b;if(b===i.RED&&(B===i.FLOAT&&(ee=i.R32F),B===i.HALF_FLOAT&&(ee=i.R16F),B===i.UNSIGNED_BYTE&&(ee=i.R8),B===i.UNSIGNED_SHORT&&pe&&(ee=pe.R16_EXT),B===i.SHORT&&pe&&(ee=pe.R16_SNORM_EXT)),b===i.RED_INTEGER&&(B===i.UNSIGNED_BYTE&&(ee=i.R8UI),B===i.UNSIGNED_SHORT&&(ee=i.R16UI),B===i.UNSIGNED_INT&&(ee=i.R32UI),B===i.BYTE&&(ee=i.R8I),B===i.SHORT&&(ee=i.R16I),B===i.INT&&(ee=i.R32I)),b===i.RG&&(B===i.FLOAT&&(ee=i.RG32F),B===i.HALF_FLOAT&&(ee=i.RG16F),B===i.UNSIGNED_BYTE&&(ee=i.RG8),B===i.UNSIGNED_SHORT&&pe&&(ee=pe.RG16_EXT),B===i.SHORT&&pe&&(ee=pe.RG16_SNORM_EXT)),b===i.RG_INTEGER&&(B===i.UNSIGNED_BYTE&&(ee=i.RG8UI),B===i.UNSIGNED_SHORT&&(ee=i.RG16UI),B===i.UNSIGNED_INT&&(ee=i.RG32UI),B===i.BYTE&&(ee=i.RG8I),B===i.SHORT&&(ee=i.RG16I),B===i.INT&&(ee=i.RG32I)),b===i.RGB_INTEGER&&(B===i.UNSIGNED_BYTE&&(ee=i.RGB8UI),B===i.UNSIGNED_SHORT&&(ee=i.RGB16UI),B===i.UNSIGNED_INT&&(ee=i.RGB32UI),B===i.BYTE&&(ee=i.RGB8I),B===i.SHORT&&(ee=i.RGB16I),B===i.INT&&(ee=i.RGB32I)),b===i.RGBA_INTEGER&&(B===i.UNSIGNED_BYTE&&(ee=i.RGBA8UI),B===i.UNSIGNED_SHORT&&(ee=i.RGBA16UI),B===i.UNSIGNED_INT&&(ee=i.RGBA32UI),B===i.BYTE&&(ee=i.RGBA8I),B===i.SHORT&&(ee=i.RGBA16I),B===i.INT&&(ee=i.RGBA32I)),b===i.RGB&&(B===i.UNSIGNED_SHORT&&pe&&(ee=pe.RGB16_EXT),B===i.SHORT&&pe&&(ee=pe.RGB16_SNORM_EXT),B===i.UNSIGNED_INT_5_9_9_9_REV&&(ee=i.RGB9_E5),B===i.UNSIGNED_INT_10F_11F_11F_REV&&(ee=i.R11F_G11F_B10F)),b===i.RGBA){const W=le?Ga:st.getTransfer(J);B===i.FLOAT&&(ee=i.RGBA32F),B===i.HALF_FLOAT&&(ee=i.RGBA16F),B===i.UNSIGNED_BYTE&&(ee=W===pt?i.SRGB8_ALPHA8:i.RGBA8),B===i.UNSIGNED_SHORT&&pe&&(ee=pe.RGBA16_EXT),B===i.SHORT&&pe&&(ee=pe.RGBA16_SNORM_EXT),B===i.UNSIGNED_SHORT_4_4_4_4&&(ee=i.RGBA4),B===i.UNSIGNED_SHORT_5_5_5_1&&(ee=i.RGB5_A1)}return(ee===i.R16F||ee===i.R32F||ee===i.RG16F||ee===i.RG32F||ee===i.RGBA16F||ee===i.RGBA32F)&&e.get("EXT_color_buffer_float"),ee}function R(P,b){let B;return P?b===null||b===ei||b===xr?B=i.DEPTH24_STENCIL8:b===kn?B=i.DEPTH32F_STENCIL8:b===Sr&&(B=i.DEPTH24_STENCIL8,ze("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):b===null||b===ei||b===xr?B=i.DEPTH_COMPONENT24:b===kn?B=i.DEPTH_COMPONENT32F:b===Sr&&(B=i.DEPTH_COMPONENT16),B}function y(P,b){return g(P)===!0||P.isFramebufferTexture&&P.minFilter!==$t&&P.minFilter!==Zt?Math.log2(Math.max(b.width,b.height))+1:P.mipmaps!==void 0&&P.mipmaps.length>0?P.mipmaps.length:P.isCompressedTexture&&Array.isArray(P.image)?b.mipmaps.length:1}function E(P){const b=P.target;b.removeEventListener("dispose",E),x(b),b.isVideoTexture&&u.delete(b),b.isHTMLTexture&&d.delete(b)}function m(P){const b=P.target;b.removeEventListener("dispose",m),C(b)}function x(P){const b=n.get(P);if(b.__webglInit===void 0)return;const B=P.source,Y=f.get(B);if(Y){const J=Y[b.__cacheKey];J.usedTimes--,J.usedTimes===0&&A(P),Object.keys(Y).length===0&&f.delete(B)}n.remove(P)}function A(P){const b=n.get(P);i.deleteTexture(b.__webglTexture);const B=P.source,Y=f.get(B);delete Y[b.__cacheKey],a.memory.textures--}function C(P){const b=n.get(P);if(P.depthTexture&&(P.depthTexture.dispose(),n.remove(P.depthTexture)),P.isWebGLCubeRenderTarget)for(let Y=0;Y<6;Y++){if(Array.isArray(b.__webglFramebuffer[Y]))for(let J=0;J<b.__webglFramebuffer[Y].length;J++)i.deleteFramebuffer(b.__webglFramebuffer[Y][J]);else i.deleteFramebuffer(b.__webglFramebuffer[Y]);b.__webglDepthbuffer&&i.deleteRenderbuffer(b.__webglDepthbuffer[Y])}else{if(Array.isArray(b.__webglFramebuffer))for(let Y=0;Y<b.__webglFramebuffer.length;Y++)i.deleteFramebuffer(b.__webglFramebuffer[Y]);else i.deleteFramebuffer(b.__webglFramebuffer);if(b.__webglDepthbuffer&&i.deleteRenderbuffer(b.__webglDepthbuffer),b.__webglMultisampledFramebuffer&&i.deleteFramebuffer(b.__webglMultisampledFramebuffer),b.__webglColorRenderbuffer)for(let Y=0;Y<b.__webglColorRenderbuffer.length;Y++)b.__webglColorRenderbuffer[Y]&&i.deleteRenderbuffer(b.__webglColorRenderbuffer[Y]);b.__webglDepthRenderbuffer&&i.deleteRenderbuffer(b.__webglDepthRenderbuffer)}const B=P.textures;for(let Y=0,J=B.length;Y<J;Y++){const le=n.get(B[Y]);le.__webglTexture&&(i.deleteTexture(le.__webglTexture),a.memory.textures--),n.remove(B[Y])}n.remove(P)}let L=0;function F(){L=0}function z(){return L}function D(P){L=P}function H(){const P=L;return P>=s.maxTextures&&ze("WebGLTextures: Trying to use "+P+" texture units while this GPU supports only "+s.maxTextures),L+=1,P}function G(P){const b=[];return b.push(P.wrapS),b.push(P.wrapT),b.push(P.wrapR||0),b.push(P.magFilter),b.push(P.minFilter),b.push(P.anisotropy),b.push(P.internalFormat),b.push(P.format),b.push(P.type),b.push(P.generateMipmaps),b.push(P.premultiplyAlpha),b.push(P.flipY),b.push(P.unpackAlignment),b.push(P.colorSpace),b.join()}function K(P,b){const B=n.get(P);if(P.isVideoTexture&&k(P),P.isRenderTargetTexture===!1&&P.isExternalTexture!==!0&&P.version>0&&B.__version!==P.version){const Y=P.image;if(Y===null)ze("WebGLRenderer: Texture marked for update but no image data found.");else if(Y.complete===!1)ze("WebGLRenderer: Texture marked for update but image is incomplete");else{ge(B,P,b);return}}else P.isExternalTexture&&(B.__webglTexture=P.sourceTexture?P.sourceTexture:null);t.bindTexture(i.TEXTURE_2D,B.__webglTexture,i.TEXTURE0+b)}function ne(P,b){const B=n.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&B.__version!==P.version){ge(B,P,b);return}else P.isExternalTexture&&(B.__webglTexture=P.sourceTexture?P.sourceTexture:null);t.bindTexture(i.TEXTURE_2D_ARRAY,B.__webglTexture,i.TEXTURE0+b)}function X(P,b){const B=n.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&B.__version!==P.version){ge(B,P,b);return}t.bindTexture(i.TEXTURE_3D,B.__webglTexture,i.TEXTURE0+b)}function j(P,b){const B=n.get(P);if(P.isCubeDepthTexture!==!0&&P.version>0&&B.__version!==P.version){Ce(B,P,b);return}t.bindTexture(i.TEXTURE_CUBE_MAP,B.__webglTexture,i.TEXTURE0+b)}const ie={[Oa]:i.REPEAT,[$n]:i.CLAMP_TO_EDGE,[El]:i.MIRRORED_REPEAT},Ae={[$t]:i.NEAREST,[Ep]:i.NEAREST_MIPMAP_NEAREST,[Cr]:i.NEAREST_MIPMAP_LINEAR,[Zt]:i.LINEAR,[oo]:i.LINEAR_MIPMAP_NEAREST,[zi]:i.LINEAR_MIPMAP_LINEAR},Oe={[Rp]:i.NEVER,[Ip]:i.ALWAYS,[Cp]:i.LESS,[Ec]:i.LEQUAL,[Pp]:i.EQUAL,[Tc]:i.GEQUAL,[Lp]:i.GREATER,[Dp]:i.NOTEQUAL};function se(P,b){if(b.type===kn&&e.has("OES_texture_float_linear")===!1&&(b.magFilter===Zt||b.magFilter===oo||b.magFilter===Cr||b.magFilter===zi||b.minFilter===Zt||b.minFilter===oo||b.minFilter===Cr||b.minFilter===zi)&&ze("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(P,i.TEXTURE_WRAP_S,ie[b.wrapS]),i.texParameteri(P,i.TEXTURE_WRAP_T,ie[b.wrapT]),(P===i.TEXTURE_3D||P===i.TEXTURE_2D_ARRAY)&&i.texParameteri(P,i.TEXTURE_WRAP_R,ie[b.wrapR]),i.texParameteri(P,i.TEXTURE_MAG_FILTER,Ae[b.magFilter]),i.texParameteri(P,i.TEXTURE_MIN_FILTER,Ae[b.minFilter]),b.compareFunction&&(i.texParameteri(P,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(P,i.TEXTURE_COMPARE_FUNC,Oe[b.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(b.magFilter===$t||b.minFilter!==Cr&&b.minFilter!==zi||b.type===kn&&e.has("OES_texture_float_linear")===!1)return;if(b.anisotropy>1||n.get(b).__currentAnisotropy){const B=e.get("EXT_texture_filter_anisotropic");i.texParameterf(P,B.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(b.anisotropy,s.getMaxAnisotropy())),n.get(b).__currentAnisotropy=b.anisotropy}}}function V(P,b){let B=!1;P.__webglInit===void 0&&(P.__webglInit=!0,b.addEventListener("dispose",E));const Y=b.source;let J=f.get(Y);J===void 0&&(J={},f.set(Y,J));const le=G(b);if(le!==P.__cacheKey){J[le]===void 0&&(J[le]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,B=!0),J[le].usedTimes++;const pe=J[P.__cacheKey];pe!==void 0&&(J[P.__cacheKey].usedTimes--,pe.usedTimes===0&&A(b)),P.__cacheKey=le,P.__webglTexture=J[le].texture}return B}function te(P,b,B){return Math.floor(Math.floor(P/B)/b)}function re(P,b,B,Y){const le=P.updateRanges;if(le.length===0)t.texSubImage2D(i.TEXTURE_2D,0,0,0,b.width,b.height,B,Y,b.data);else{le.sort((Re,ue)=>Re.start-ue.start);let pe=0;for(let Re=1;Re<le.length;Re++){const ue=le[pe],he=le[Re],Ie=ue.start+ue.count,ke=te(he.start,b.width,4),He=te(ue.start,b.width,4);he.start<=Ie+1&&ke===He&&te(he.start+he.count-1,b.width,4)===ke?ue.count=Math.max(ue.count,he.start+he.count-ue.start):(++pe,le[pe]=he)}le.length=pe+1;const ee=t.getParameter(i.UNPACK_ROW_LENGTH),W=t.getParameter(i.UNPACK_SKIP_PIXELS),de=t.getParameter(i.UNPACK_SKIP_ROWS);t.pixelStorei(i.UNPACK_ROW_LENGTH,b.width);for(let Re=0,ue=le.length;Re<ue;Re++){const he=le[Re],Ie=Math.floor(he.start/4),ke=Math.ceil(he.count/4),He=Ie%b.width,U=Math.floor(Ie/b.width),me=ke,ae=1;t.pixelStorei(i.UNPACK_SKIP_PIXELS,He),t.pixelStorei(i.UNPACK_SKIP_ROWS,U),t.texSubImage2D(i.TEXTURE_2D,0,He,U,me,ae,B,Y,b.data)}P.clearUpdateRanges(),t.pixelStorei(i.UNPACK_ROW_LENGTH,ee),t.pixelStorei(i.UNPACK_SKIP_PIXELS,W),t.pixelStorei(i.UNPACK_SKIP_ROWS,de)}}function ge(P,b,B){let Y=i.TEXTURE_2D;(b.isDataArrayTexture||b.isCompressedArrayTexture)&&(Y=i.TEXTURE_2D_ARRAY),b.isData3DTexture&&(Y=i.TEXTURE_3D);const J=V(P,b),le=b.source;t.bindTexture(Y,P.__webglTexture,i.TEXTURE0+B);const pe=n.get(le);if(le.version!==pe.__version||J===!0){if(t.activeTexture(i.TEXTURE0+B),(typeof ImageBitmap<"u"&&b.image instanceof ImageBitmap)===!1){const ae=st.getPrimaries(st.workingColorSpace),ve=b.colorSpace===Oi?null:st.getPrimaries(b.colorSpace),Me=b.colorSpace===Oi||ae===ve?i.NONE:i.BROWSER_DEFAULT_WEBGL;t.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,b.flipY),t.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),t.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Me)}t.pixelStorei(i.UNPACK_ALIGNMENT,b.unpackAlignment);let W=p(b.image,!1,s.maxTextureSize);W=Kt(b,W);const de=r.convert(b.format,b.colorSpace),Re=r.convert(b.type);let ue=S(b.internalFormat,de,Re,b.normalized,b.colorSpace,b.isVideoTexture);se(Y,b);let he;const Ie=b.mipmaps,ke=b.isVideoTexture!==!0,He=pe.__version===void 0||J===!0,U=le.dataReady,me=y(b,W);if(b.isDepthTexture)ue=R(b.format===is,b.type),He&&(ke?t.texStorage2D(i.TEXTURE_2D,1,ue,W.width,W.height):t.texImage2D(i.TEXTURE_2D,0,ue,W.width,W.height,0,de,Re,null));else if(b.isDataTexture)if(Ie.length>0){ke&&He&&t.texStorage2D(i.TEXTURE_2D,me,ue,Ie[0].width,Ie[0].height);for(let ae=0,ve=Ie.length;ae<ve;ae++)he=Ie[ae],ke?U&&t.texSubImage2D(i.TEXTURE_2D,ae,0,0,he.width,he.height,de,Re,he.data):t.texImage2D(i.TEXTURE_2D,ae,ue,he.width,he.height,0,de,Re,he.data);b.generateMipmaps=!1}else ke?(He&&t.texStorage2D(i.TEXTURE_2D,me,ue,W.width,W.height),U&&re(b,W,de,Re)):t.texImage2D(i.TEXTURE_2D,0,ue,W.width,W.height,0,de,Re,W.data);else if(b.isCompressedTexture)if(b.isCompressedArrayTexture){ke&&He&&t.texStorage3D(i.TEXTURE_2D_ARRAY,me,ue,Ie[0].width,Ie[0].height,W.depth);for(let ae=0,ve=Ie.length;ae<ve;ae++)if(he=Ie[ae],b.format!==En)if(de!==null)if(ke){if(U)if(b.layerUpdates.size>0){const Me=Nh(he.width,he.height,b.format,b.type);for(const oe of b.layerUpdates){const Fe=he.data.subarray(oe*Me/he.data.BYTES_PER_ELEMENT,(oe+1)*Me/he.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ae,0,0,oe,he.width,he.height,1,de,Fe)}b.clearLayerUpdates()}else t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ae,0,0,0,he.width,he.height,W.depth,de,he.data)}else t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,ae,ue,he.width,he.height,W.depth,0,he.data,0,0);else ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else ke?U&&t.texSubImage3D(i.TEXTURE_2D_ARRAY,ae,0,0,0,he.width,he.height,W.depth,de,Re,he.data):t.texImage3D(i.TEXTURE_2D_ARRAY,ae,ue,he.width,he.height,W.depth,0,de,Re,he.data)}else{ke&&He&&t.texStorage2D(i.TEXTURE_2D,me,ue,Ie[0].width,Ie[0].height);for(let ae=0,ve=Ie.length;ae<ve;ae++)he=Ie[ae],b.format!==En?de!==null?ke?U&&t.compressedTexSubImage2D(i.TEXTURE_2D,ae,0,0,he.width,he.height,de,he.data):t.compressedTexImage2D(i.TEXTURE_2D,ae,ue,he.width,he.height,0,he.data):ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):ke?U&&t.texSubImage2D(i.TEXTURE_2D,ae,0,0,he.width,he.height,de,Re,he.data):t.texImage2D(i.TEXTURE_2D,ae,ue,he.width,he.height,0,de,Re,he.data)}else if(b.isDataArrayTexture)if(ke){if(He&&t.texStorage3D(i.TEXTURE_2D_ARRAY,me,ue,W.width,W.height,W.depth),U)if(b.layerUpdates.size>0){const ae=Nh(W.width,W.height,b.format,b.type);for(const ve of b.layerUpdates){const Me=W.data.subarray(ve*ae/W.data.BYTES_PER_ELEMENT,(ve+1)*ae/W.data.BYTES_PER_ELEMENT);t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,ve,W.width,W.height,1,de,Re,Me)}b.clearLayerUpdates()}else t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,W.width,W.height,W.depth,de,Re,W.data)}else t.texImage3D(i.TEXTURE_2D_ARRAY,0,ue,W.width,W.height,W.depth,0,de,Re,W.data);else if(b.isData3DTexture)ke?(He&&t.texStorage3D(i.TEXTURE_3D,me,ue,W.width,W.height,W.depth),U&&t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,W.width,W.height,W.depth,de,Re,W.data)):t.texImage3D(i.TEXTURE_3D,0,ue,W.width,W.height,W.depth,0,de,Re,W.data);else if(b.isFramebufferTexture){if(He)if(ke)t.texStorage2D(i.TEXTURE_2D,me,ue,W.width,W.height);else{let ae=W.width,ve=W.height;for(let Me=0;Me<me;Me++)t.texImage2D(i.TEXTURE_2D,Me,ue,ae,ve,0,de,Re,null),ae>>=1,ve>>=1}}else if(b.isHTMLTexture){if("texElementImage2D"in i){const ae=i.canvas;if(ae.hasAttribute("layoutsubtree")||ae.setAttribute("layoutsubtree","true"),W.parentNode!==ae){ae.appendChild(W),d.add(b),ae.onpaint=ve=>{const Me=ve.changedElements;for(const oe of d)Me.includes(oe.image)&&(oe.needsUpdate=!0)},ae.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,W);else{const Me=i.RGBA,oe=i.RGBA,Fe=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,Me,oe,Fe,W)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(Ie.length>0){if(ke&&He){const ae=ut(Ie[0]);t.texStorage2D(i.TEXTURE_2D,me,ue,ae.width,ae.height)}for(let ae=0,ve=Ie.length;ae<ve;ae++)he=Ie[ae],ke?U&&t.texSubImage2D(i.TEXTURE_2D,ae,0,0,de,Re,he):t.texImage2D(i.TEXTURE_2D,ae,ue,de,Re,he);b.generateMipmaps=!1}else if(ke){if(He){const ae=ut(W);t.texStorage2D(i.TEXTURE_2D,me,ue,ae.width,ae.height)}U&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,de,Re,W)}else t.texImage2D(i.TEXTURE_2D,0,ue,de,Re,W);g(b)&&M(Y),pe.__version=le.version,b.onUpdate&&b.onUpdate(b)}P.__version=b.version}function Ce(P,b,B){if(b.image.length!==6)return;const Y=V(P,b),J=b.source;t.bindTexture(i.TEXTURE_CUBE_MAP,P.__webglTexture,i.TEXTURE0+B);const le=n.get(J);if(J.version!==le.__version||Y===!0){t.activeTexture(i.TEXTURE0+B);const pe=st.getPrimaries(st.workingColorSpace),ee=b.colorSpace===Oi?null:st.getPrimaries(b.colorSpace),W=b.colorSpace===Oi||pe===ee?i.NONE:i.BROWSER_DEFAULT_WEBGL;t.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,b.flipY),t.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),t.pixelStorei(i.UNPACK_ALIGNMENT,b.unpackAlignment),t.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,W);const de=b.isCompressedTexture||b.image[0].isCompressedTexture,Re=b.image[0]&&b.image[0].isDataTexture,ue=[];for(let oe=0;oe<6;oe++)!de&&!Re?ue[oe]=p(b.image[oe],!0,s.maxCubemapSize):ue[oe]=Re?b.image[oe].image:b.image[oe],ue[oe]=Kt(b,ue[oe]);const he=ue[0],Ie=r.convert(b.format,b.colorSpace),ke=r.convert(b.type),He=S(b.internalFormat,Ie,ke,b.normalized,b.colorSpace),U=b.isVideoTexture!==!0,me=le.__version===void 0||Y===!0,ae=J.dataReady;let ve=y(b,he);se(i.TEXTURE_CUBE_MAP,b);let Me;if(de){U&&me&&t.texStorage2D(i.TEXTURE_CUBE_MAP,ve,He,he.width,he.height);for(let oe=0;oe<6;oe++){Me=ue[oe].mipmaps;for(let Fe=0;Fe<Me.length;Fe++){const Pe=Me[Fe];b.format!==En?Ie!==null?U?ae&&t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe,0,0,Pe.width,Pe.height,Ie,Pe.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe,He,Pe.width,Pe.height,0,Pe.data):ze("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe,0,0,Pe.width,Pe.height,Ie,ke,Pe.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe,He,Pe.width,Pe.height,0,Ie,ke,Pe.data)}}}else{if(Me=b.mipmaps,U&&me){Me.length>0&&ve++;const oe=ut(ue[0]);t.texStorage2D(i.TEXTURE_CUBE_MAP,ve,He,oe.width,oe.height)}for(let oe=0;oe<6;oe++)if(Re){U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,0,0,ue[oe].width,ue[oe].height,Ie,ke,ue[oe].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,He,ue[oe].width,ue[oe].height,0,Ie,ke,ue[oe].data);for(let Fe=0;Fe<Me.length;Fe++){const Rt=Me[Fe].image[oe].image;U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe+1,0,0,Rt.width,Rt.height,Ie,ke,Rt.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe+1,He,Rt.width,Rt.height,0,Ie,ke,Rt.data)}}else{U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,0,0,Ie,ke,ue[oe]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,He,Ie,ke,ue[oe]);for(let Fe=0;Fe<Me.length;Fe++){const Pe=Me[Fe];U?ae&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe+1,0,0,Ie,ke,Pe.image[oe]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Fe+1,He,Ie,ke,Pe.image[oe])}}}g(b)&&M(i.TEXTURE_CUBE_MAP),le.__version=J.version,b.onUpdate&&b.onUpdate(b)}P.__version=b.version}function _e(P,b,B,Y,J,le){const pe=r.convert(B.format,B.colorSpace),ee=r.convert(B.type),W=S(B.internalFormat,pe,ee,B.normalized,B.colorSpace),de=n.get(b),Re=n.get(B);if(Re.__renderTarget=b,!de.__hasExternalTextures){const ue=Math.max(1,b.width>>le),he=Math.max(1,b.height>>le);J===i.TEXTURE_3D||J===i.TEXTURE_2D_ARRAY?t.texImage3D(J,le,W,ue,he,b.depth,0,pe,ee,null):t.texImage2D(J,le,W,ue,he,0,pe,ee,null)}t.bindFramebuffer(i.FRAMEBUFFER,P),At(b)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Y,J,Re.__webglTexture,0,yt(b)):(J===i.TEXTURE_2D||J>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&J<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,Y,J,Re.__webglTexture,le),t.bindFramebuffer(i.FRAMEBUFFER,null)}function je(P,b,B){if(i.bindRenderbuffer(i.RENDERBUFFER,P),b.depthBuffer){const Y=b.depthTexture,J=Y&&Y.isDepthTexture?Y.type:null,le=R(b.stencilBuffer,J),pe=b.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;At(b)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,yt(b),le,b.width,b.height):B?i.renderbufferStorageMultisample(i.RENDERBUFFER,yt(b),le,b.width,b.height):i.renderbufferStorage(i.RENDERBUFFER,le,b.width,b.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,pe,i.RENDERBUFFER,P)}else{const Y=b.textures;for(let J=0;J<Y.length;J++){const le=Y[J],pe=r.convert(le.format,le.colorSpace),ee=r.convert(le.type),W=S(le.internalFormat,pe,ee,le.normalized,le.colorSpace);At(b)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,yt(b),W,b.width,b.height):B?i.renderbufferStorageMultisample(i.RENDERBUFFER,yt(b),W,b.width,b.height):i.renderbufferStorage(i.RENDERBUFFER,W,b.width,b.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function De(P,b,B){const Y=b.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(i.FRAMEBUFFER,P),!(b.depthTexture&&b.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const J=n.get(b.depthTexture);if(J.__renderTarget=b,(!J.__webglTexture||b.depthTexture.image.width!==b.width||b.depthTexture.image.height!==b.height)&&(b.depthTexture.image.width=b.width,b.depthTexture.image.height=b.height,b.depthTexture.needsUpdate=!0),Y){if(J.__webglInit===void 0&&(J.__webglInit=!0,b.depthTexture.addEventListener("dispose",E)),J.__webglTexture===void 0){J.__webglTexture=i.createTexture(),t.bindTexture(i.TEXTURE_CUBE_MAP,J.__webglTexture),se(i.TEXTURE_CUBE_MAP,b.depthTexture);const de=r.convert(b.depthTexture.format),Re=r.convert(b.depthTexture.type);let ue;b.depthTexture.format===Mi?ue=i.DEPTH_COMPONENT24:b.depthTexture.format===is&&(ue=i.DEPTH24_STENCIL8);for(let he=0;he<6;he++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+he,0,ue,b.width,b.height,0,de,Re,null)}}else K(b.depthTexture,0);const le=J.__webglTexture,pe=yt(b),ee=Y?i.TEXTURE_CUBE_MAP_POSITIVE_X+B:i.TEXTURE_2D,W=b.depthTexture.format===is?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(b.depthTexture.format===Mi)At(b)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,W,ee,le,0,pe):i.framebufferTexture2D(i.FRAMEBUFFER,W,ee,le,0);else if(b.depthTexture.format===is)At(b)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,W,ee,le,0,pe):i.framebufferTexture2D(i.FRAMEBUFFER,W,ee,le,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function nt(P){const b=n.get(P),B=P.isWebGLCubeRenderTarget===!0;if(b.__boundDepthTexture!==P.depthTexture){const Y=P.depthTexture;if(b.__depthDisposeCallback&&b.__depthDisposeCallback(),Y){const J=()=>{delete b.__boundDepthTexture,delete b.__depthDisposeCallback,Y.removeEventListener("dispose",J)};Y.addEventListener("dispose",J),b.__depthDisposeCallback=J}b.__boundDepthTexture=Y}if(P.depthTexture&&!b.__autoAllocateDepthBuffer)if(B)for(let Y=0;Y<6;Y++)De(b.__webglFramebuffer[Y],P,Y);else{const Y=P.texture.mipmaps;Y&&Y.length>0?De(b.__webglFramebuffer[0],P,0):De(b.__webglFramebuffer,P,0)}else if(B){b.__webglDepthbuffer=[];for(let Y=0;Y<6;Y++)if(t.bindFramebuffer(i.FRAMEBUFFER,b.__webglFramebuffer[Y]),b.__webglDepthbuffer[Y]===void 0)b.__webglDepthbuffer[Y]=i.createRenderbuffer(),je(b.__webglDepthbuffer[Y],P,!1);else{const J=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,le=b.__webglDepthbuffer[Y];i.bindRenderbuffer(i.RENDERBUFFER,le),i.framebufferRenderbuffer(i.FRAMEBUFFER,J,i.RENDERBUFFER,le)}}else{const Y=P.texture.mipmaps;if(Y&&Y.length>0?t.bindFramebuffer(i.FRAMEBUFFER,b.__webglFramebuffer[0]):t.bindFramebuffer(i.FRAMEBUFFER,b.__webglFramebuffer),b.__webglDepthbuffer===void 0)b.__webglDepthbuffer=i.createRenderbuffer(),je(b.__webglDepthbuffer,P,!1);else{const J=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,le=b.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,le),i.framebufferRenderbuffer(i.FRAMEBUFFER,J,i.RENDERBUFFER,le)}}t.bindFramebuffer(i.FRAMEBUFFER,null)}function Ge(P,b,B){const Y=n.get(P);b!==void 0&&_e(Y.__webglFramebuffer,P,P.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),B!==void 0&&nt(P)}function $e(P){const b=P.texture,B=n.get(P),Y=n.get(b);P.addEventListener("dispose",m);const J=P.textures,le=P.isWebGLCubeRenderTarget===!0,pe=J.length>1;if(pe||(Y.__webglTexture===void 0&&(Y.__webglTexture=i.createTexture()),Y.__version=b.version,a.memory.textures++),le){B.__webglFramebuffer=[];for(let ee=0;ee<6;ee++)if(b.mipmaps&&b.mipmaps.length>0){B.__webglFramebuffer[ee]=[];for(let W=0;W<b.mipmaps.length;W++)B.__webglFramebuffer[ee][W]=i.createFramebuffer()}else B.__webglFramebuffer[ee]=i.createFramebuffer()}else{if(b.mipmaps&&b.mipmaps.length>0){B.__webglFramebuffer=[];for(let ee=0;ee<b.mipmaps.length;ee++)B.__webglFramebuffer[ee]=i.createFramebuffer()}else B.__webglFramebuffer=i.createFramebuffer();if(pe)for(let ee=0,W=J.length;ee<W;ee++){const de=n.get(J[ee]);de.__webglTexture===void 0&&(de.__webglTexture=i.createTexture(),a.memory.textures++)}if(P.samples>0&&At(P)===!1){B.__webglMultisampledFramebuffer=i.createFramebuffer(),B.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,B.__webglMultisampledFramebuffer);for(let ee=0;ee<J.length;ee++){const W=J[ee];B.__webglColorRenderbuffer[ee]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,B.__webglColorRenderbuffer[ee]);const de=r.convert(W.format,W.colorSpace),Re=r.convert(W.type),ue=S(W.internalFormat,de,Re,W.normalized,W.colorSpace,P.isXRRenderTarget===!0),he=yt(P);i.renderbufferStorageMultisample(i.RENDERBUFFER,he,ue,P.width,P.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+ee,i.RENDERBUFFER,B.__webglColorRenderbuffer[ee])}i.bindRenderbuffer(i.RENDERBUFFER,null),P.depthBuffer&&(B.__webglDepthRenderbuffer=i.createRenderbuffer(),je(B.__webglDepthRenderbuffer,P,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(le){t.bindTexture(i.TEXTURE_CUBE_MAP,Y.__webglTexture),se(i.TEXTURE_CUBE_MAP,b);for(let ee=0;ee<6;ee++)if(b.mipmaps&&b.mipmaps.length>0)for(let W=0;W<b.mipmaps.length;W++)_e(B.__webglFramebuffer[ee][W],P,b,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+ee,W);else _e(B.__webglFramebuffer[ee],P,b,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+ee,0);g(b)&&M(i.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(pe){for(let ee=0,W=J.length;ee<W;ee++){const de=J[ee],Re=n.get(de);let ue=i.TEXTURE_2D;(P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(ue=P.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(ue,Re.__webglTexture),se(ue,de),_e(B.__webglFramebuffer,P,de,i.COLOR_ATTACHMENT0+ee,ue,0),g(de)&&M(ue)}t.unbindTexture()}else{let ee=i.TEXTURE_2D;if((P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(ee=P.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(ee,Y.__webglTexture),se(ee,b),b.mipmaps&&b.mipmaps.length>0)for(let W=0;W<b.mipmaps.length;W++)_e(B.__webglFramebuffer[W],P,b,i.COLOR_ATTACHMENT0,ee,W);else _e(B.__webglFramebuffer,P,b,i.COLOR_ATTACHMENT0,ee,0);g(b)&&M(ee),t.unbindTexture()}P.depthBuffer&&nt(P)}function dt(P){const b=P.textures;for(let B=0,Y=b.length;B<Y;B++){const J=b[B];if(g(J)){const le=T(P),pe=n.get(J).__webglTexture;t.bindTexture(le,pe),M(le),t.unbindTexture()}}}const ot=[],xt=[];function Tt(P){if(P.samples>0){if(At(P)===!1){const b=P.textures,B=P.width,Y=P.height;let J=i.COLOR_BUFFER_BIT;const le=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,pe=n.get(P),ee=b.length>1;if(ee)for(let de=0;de<b.length;de++)t.bindFramebuffer(i.FRAMEBUFFER,pe.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+de,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,pe.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+de,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,pe.__webglMultisampledFramebuffer);const W=P.texture.mipmaps;W&&W.length>0?t.bindFramebuffer(i.DRAW_FRAMEBUFFER,pe.__webglFramebuffer[0]):t.bindFramebuffer(i.DRAW_FRAMEBUFFER,pe.__webglFramebuffer);for(let de=0;de<b.length;de++){if(P.resolveDepthBuffer&&(P.depthBuffer&&(J|=i.DEPTH_BUFFER_BIT),P.stencilBuffer&&P.resolveStencilBuffer&&(J|=i.STENCIL_BUFFER_BIT)),ee){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,pe.__webglColorRenderbuffer[de]);const Re=n.get(b[de]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,Re,0)}i.blitFramebuffer(0,0,B,Y,0,0,B,Y,J,i.NEAREST),l===!0&&(ot.length=0,xt.length=0,ot.push(i.COLOR_ATTACHMENT0+de),P.depthBuffer&&P.resolveDepthBuffer===!1&&(ot.push(le),xt.push(le),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,xt)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,ot))}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),ee)for(let de=0;de<b.length;de++){t.bindFramebuffer(i.FRAMEBUFFER,pe.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+de,i.RENDERBUFFER,pe.__webglColorRenderbuffer[de]);const Re=n.get(b[de]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,pe.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+de,i.TEXTURE_2D,Re,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,pe.__webglMultisampledFramebuffer)}else if(P.depthBuffer&&P.resolveDepthBuffer===!1&&l){const b=P.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[b])}}}function yt(P){return Math.min(s.maxSamples,P.samples)}function At(P){const b=n.get(P);return P.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&b.__useRenderToTexture!==!1}function k(P){const b=a.render.frame;u.get(P)!==b&&(u.set(P,b),P.update())}function Kt(P,b){const B=P.colorSpace,Y=P.format,J=P.type;return P.isCompressedTexture===!0||P.isVideoTexture===!0||B!==Ha&&B!==Oi&&(st.getTransfer(B)===pt?(Y!==En||J!==_n)&&ze("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):ct("WebGLTextures: Unsupported texture color space:",B)),b}function ut(P){return typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement?(c.width=P.naturalWidth||P.width,c.height=P.naturalHeight||P.height):typeof VideoFrame<"u"&&P instanceof VideoFrame?(c.width=P.displayWidth,c.height=P.displayHeight):(c.width=P.width,c.height=P.height),c}this.allocateTextureUnit=H,this.resetTextureUnits=F,this.getTextureUnits=z,this.setTextureUnits=D,this.setTexture2D=K,this.setTexture2DArray=ne,this.setTexture3D=X,this.setTextureCube=j,this.rebindTextures=Ge,this.setupRenderTarget=$e,this.updateRenderTargetMipmap=dt,this.updateMultisampleRenderTarget=Tt,this.setupDepthRenderbuffer=nt,this.setupFrameBufferTexture=_e,this.useMultisampledRTT=At,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function y_(i,e){function t(n,s=Oi){let r;const a=st.getTransfer(s);if(n===_n)return i.UNSIGNED_BYTE;if(n===_c)return i.UNSIGNED_SHORT_4_4_4_4;if(n===Sc)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Cd)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Pd)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Ad)return i.BYTE;if(n===Rd)return i.SHORT;if(n===Sr)return i.UNSIGNED_SHORT;if(n===bc)return i.INT;if(n===ei)return i.UNSIGNED_INT;if(n===kn)return i.FLOAT;if(n===xi)return i.HALF_FLOAT;if(n===Ld)return i.ALPHA;if(n===Dd)return i.RGB;if(n===En)return i.RGBA;if(n===Mi)return i.DEPTH_COMPONENT;if(n===is)return i.DEPTH_STENCIL;if(n===xc)return i.RED;if(n===Mc)return i.RED_INTEGER;if(n===hs)return i.RG;if(n===yc)return i.RG_INTEGER;if(n===wc)return i.RGBA_INTEGER;if(n===Ma||n===ya||n===wa||n===Ea)if(a===pt)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Ma)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===ya)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===wa)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Ea)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Ma)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===ya)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===wa)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Ea)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Tl||n===Al||n===Rl||n===Cl)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Tl)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Al)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Rl)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Cl)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Pl||n===Ll||n===Dl||n===Il||n===Fl||n===za||n===Ul)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Pl||n===Ll)return a===pt?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Dl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===Il)return r.COMPRESSED_R11_EAC;if(n===Fl)return r.COMPRESSED_SIGNED_R11_EAC;if(n===za)return r.COMPRESSED_RG11_EAC;if(n===Ul)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===Nl||n===kl||n===Ol||n===zl||n===Bl||n===Hl||n===Gl||n===Vl||n===Wl||n===Xl||n===Yl||n===ql||n===$l||n===Zl)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===Nl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===kl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Ol)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===zl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Bl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Hl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Gl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Vl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Wl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===Xl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Yl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===ql)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===$l)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Zl)return a===pt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Kl||n===Jl||n===Ql)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===Kl)return a===pt?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Jl)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Ql)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===jl||n===ec||n===Ba||n===tc)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===jl)return r.COMPRESSED_RED_RGTC1_EXT;if(n===ec)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Ba)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===tc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===xr?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:t}}const w_=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,E_=`
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

}`;class T_{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const n=new Vd(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,n=new ti({vertexShader:w_,fragmentShader:E_,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new ht(new Er(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class A_ extends fs{constructor(e,t){super();const n=this;let s=null,r=1,a=null,o="local-floor",l=1,c=null,u=null,d=null,h=null,f=null,v=null;const _=typeof XRWebGLBinding<"u",p=new T_,g={},M=t.getContextAttributes();let T=null,S=null;const R=[],y=[],E=new tt;let m=null;const x=new wn;x.viewport=new Et;const A=new wn;A.viewport=new Et;const C=[x,A],L=new km;let F=null,z=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(V){let te=R[V];return te===void 0&&(te=new po,R[V]=te),te.getTargetRaySpace()},this.getControllerGrip=function(V){let te=R[V];return te===void 0&&(te=new po,R[V]=te),te.getGripSpace()},this.getHand=function(V){let te=R[V];return te===void 0&&(te=new po,R[V]=te),te.getHandSpace()};function D(V){const te=y.indexOf(V.inputSource);if(te===-1)return;const re=R[te];re!==void 0&&(re.update(V.inputSource,V.frame,c||a),re.dispatchEvent({type:V.type,data:V.inputSource}))}function H(){s.removeEventListener("select",D),s.removeEventListener("selectstart",D),s.removeEventListener("selectend",D),s.removeEventListener("squeeze",D),s.removeEventListener("squeezestart",D),s.removeEventListener("squeezeend",D),s.removeEventListener("end",H),s.removeEventListener("inputsourceschange",G);for(let V=0;V<R.length;V++){const te=y[V];te!==null&&(y[V]=null,R[V].disconnect(te))}F=null,z=null,p.reset();for(const V in g)delete g[V];e.setRenderTarget(T),f=null,h=null,d=null,s=null,S=null,se.stop(),n.isPresenting=!1,e.setPixelRatio(m),e.setSize(E.width,E.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(V){r=V,n.isPresenting===!0&&ze("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(V){o=V,n.isPresenting===!0&&ze("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(V){c=V},this.getBaseLayer=function(){return h!==null?h:f},this.getBinding=function(){return d===null&&_&&(d=new XRWebGLBinding(s,t)),d},this.getFrame=function(){return v},this.getSession=function(){return s},this.setSession=async function(V){if(s=V,s!==null){if(T=e.getRenderTarget(),s.addEventListener("select",D),s.addEventListener("selectstart",D),s.addEventListener("selectend",D),s.addEventListener("squeeze",D),s.addEventListener("squeezestart",D),s.addEventListener("squeezeend",D),s.addEventListener("end",H),s.addEventListener("inputsourceschange",G),M.xrCompatible!==!0&&await t.makeXRCompatible(),m=e.getPixelRatio(),e.getSize(E),_&&"createProjectionLayer"in XRWebGLBinding.prototype){let re=null,ge=null,Ce=null;M.depth&&(Ce=M.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,re=M.stencil?is:Mi,ge=M.stencil?xr:ei);const _e={colorFormat:t.RGBA8,depthFormat:Ce,scaleFactor:r};d=this.getBinding(),h=d.createProjectionLayer(_e),s.updateRenderState({layers:[h]}),e.setPixelRatio(1),e.setSize(h.textureWidth,h.textureHeight,!1),S=new Jn(h.textureWidth,h.textureHeight,{format:En,type:_n,depthTexture:new Ys(h.textureWidth,h.textureHeight,ge,void 0,void 0,void 0,void 0,void 0,void 0,re),stencilBuffer:M.stencil,colorSpace:e.outputColorSpace,samples:M.antialias?4:0,resolveDepthBuffer:h.ignoreDepthValues===!1,resolveStencilBuffer:h.ignoreDepthValues===!1})}else{const re={antialias:M.antialias,alpha:!0,depth:M.depth,stencil:M.stencil,framebufferScaleFactor:r};f=new XRWebGLLayer(s,t,re),s.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),S=new Jn(f.framebufferWidth,f.framebufferHeight,{format:En,type:_n,colorSpace:e.outputColorSpace,stencilBuffer:M.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await s.requestReferenceSpace(o),se.setContext(s),se.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function G(V){for(let te=0;te<V.removed.length;te++){const re=V.removed[te],ge=y.indexOf(re);ge>=0&&(y[ge]=null,R[ge].disconnect(re))}for(let te=0;te<V.added.length;te++){const re=V.added[te];let ge=y.indexOf(re);if(ge===-1){for(let _e=0;_e<R.length;_e++)if(_e>=y.length){y.push(re),ge=_e;break}else if(y[_e]===null){y[_e]=re,ge=_e;break}if(ge===-1)break}const Ce=R[ge];Ce&&Ce.connect(re)}}const K=new I,ne=new I;function X(V,te,re){K.setFromMatrixPosition(te.matrixWorld),ne.setFromMatrixPosition(re.matrixWorld);const ge=K.distanceTo(ne),Ce=te.projectionMatrix.elements,_e=re.projectionMatrix.elements,je=Ce[14]/(Ce[10]-1),De=Ce[14]/(Ce[10]+1),nt=(Ce[9]+1)/Ce[5],Ge=(Ce[9]-1)/Ce[5],$e=(Ce[8]-1)/Ce[0],dt=(_e[8]+1)/_e[0],ot=je*$e,xt=je*dt,Tt=ge/(-$e+dt),yt=Tt*-$e;if(te.matrixWorld.decompose(V.position,V.quaternion,V.scale),V.translateX(yt),V.translateZ(Tt),V.matrixWorld.compose(V.position,V.quaternion,V.scale),V.matrixWorldInverse.copy(V.matrixWorld).invert(),Ce[10]===-1)V.projectionMatrix.copy(te.projectionMatrix),V.projectionMatrixInverse.copy(te.projectionMatrixInverse);else{const At=je+Tt,k=De+Tt,Kt=ot-yt,ut=xt+(ge-yt),P=nt*De/k*At,b=Ge*De/k*At;V.projectionMatrix.makePerspective(Kt,ut,P,b,At,k),V.projectionMatrixInverse.copy(V.projectionMatrix).invert()}}function j(V,te){te===null?V.matrixWorld.copy(V.matrix):V.matrixWorld.multiplyMatrices(te.matrixWorld,V.matrix),V.matrixWorldInverse.copy(V.matrixWorld).invert()}this.updateCamera=function(V){if(s===null)return;let te=V.near,re=V.far;p.texture!==null&&(p.depthNear>0&&(te=p.depthNear),p.depthFar>0&&(re=p.depthFar)),L.near=A.near=x.near=te,L.far=A.far=x.far=re,(F!==L.near||z!==L.far)&&(s.updateRenderState({depthNear:L.near,depthFar:L.far}),F=L.near,z=L.far),L.layers.mask=V.layers.mask|6,x.layers.mask=L.layers.mask&-5,A.layers.mask=L.layers.mask&-3;const ge=V.parent,Ce=L.cameras;j(L,ge);for(let _e=0;_e<Ce.length;_e++)j(Ce[_e],ge);Ce.length===2?X(L,x,A):L.projectionMatrix.copy(x.projectionMatrix),ie(V,L,ge)};function ie(V,te,re){re===null?V.matrix.copy(te.matrixWorld):(V.matrix.copy(re.matrixWorld),V.matrix.invert(),V.matrix.multiply(te.matrixWorld)),V.matrix.decompose(V.position,V.quaternion,V.scale),V.updateMatrixWorld(!0),V.projectionMatrix.copy(te.projectionMatrix),V.projectionMatrixInverse.copy(te.projectionMatrixInverse),V.isPerspectiveCamera&&(V.fov=yr*2*Math.atan(1/V.projectionMatrix.elements[5]),V.zoom=1)}this.getCamera=function(){return L},this.getFoveation=function(){if(!(h===null&&f===null))return l},this.setFoveation=function(V){l=V,h!==null&&(h.fixedFoveation=V),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=V)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(L)},this.getCameraTexture=function(V){return g[V]};let Ae=null;function Oe(V,te){if(u=te.getViewerPose(c||a),v=te,u!==null){const re=u.views;f!==null&&(e.setRenderTargetFramebuffer(S,f.framebuffer),e.setRenderTarget(S));let ge=!1;re.length!==L.cameras.length&&(L.cameras.length=0,ge=!0);for(let De=0;De<re.length;De++){const nt=re[De];let Ge=null;if(f!==null)Ge=f.getViewport(nt);else{const dt=d.getViewSubImage(h,nt);Ge=dt.viewport,De===0&&(e.setRenderTargetTextures(S,dt.colorTexture,dt.depthStencilTexture),e.setRenderTarget(S))}let $e=C[De];$e===void 0&&($e=new wn,$e.layers.enable(De),$e.viewport=new Et,C[De]=$e),$e.matrix.fromArray(nt.transform.matrix),$e.matrix.decompose($e.position,$e.quaternion,$e.scale),$e.projectionMatrix.fromArray(nt.projectionMatrix),$e.projectionMatrixInverse.copy($e.projectionMatrix).invert(),$e.viewport.set(Ge.x,Ge.y,Ge.width,Ge.height),De===0&&(L.matrix.copy($e.matrix),L.matrix.decompose(L.position,L.quaternion,L.scale)),ge===!0&&L.cameras.push($e)}const Ce=s.enabledFeatures;if(Ce&&Ce.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&_){d=n.getBinding();const De=d.getDepthInformation(re[0]);De&&De.isValid&&De.texture&&p.init(De,s.renderState)}if(Ce&&Ce.includes("camera-access")&&_){e.state.unbindTexture(),d=n.getBinding();for(let De=0;De<re.length;De++){const nt=re[De].camera;if(nt){let Ge=g[nt];Ge||(Ge=new Vd,g[nt]=Ge);const $e=d.getCameraImage(nt);Ge.sourceTexture=$e}}}}for(let re=0;re<R.length;re++){const ge=y[re],Ce=R[re];ge!==null&&Ce!==void 0&&Ce.update(ge,te,c||a)}Ae&&Ae(V,te),te.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:te}),v=null}const se=new $d;se.setAnimationLoop(Oe),this.setAnimationLoop=function(V){Ae=V},this.dispose=function(){}}}const R_=new rt,tf=new We;tf.set(-1,0,0,0,1,0,0,0,1);function C_(i,e){function t(p,g){p.matrixAutoUpdate===!0&&p.updateMatrix(),g.value.copy(p.matrix)}function n(p,g){g.color.getRGB(p.fogColor.value,Wd(i)),g.isFog?(p.fogNear.value=g.near,p.fogFar.value=g.far):g.isFogExp2&&(p.fogDensity.value=g.density)}function s(p,g,M,T,S){g.isNodeMaterial?g.uniformsNeedUpdate=!1:g.isMeshBasicMaterial?r(p,g):g.isMeshLambertMaterial?(r(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshToonMaterial?(r(p,g),d(p,g)):g.isMeshPhongMaterial?(r(p,g),u(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshStandardMaterial?(r(p,g),h(p,g),g.isMeshPhysicalMaterial&&f(p,g,S)):g.isMeshMatcapMaterial?(r(p,g),v(p,g)):g.isMeshDepthMaterial?r(p,g):g.isMeshDistanceMaterial?(r(p,g),_(p,g)):g.isMeshNormalMaterial?r(p,g):g.isLineBasicMaterial?(a(p,g),g.isLineDashedMaterial&&o(p,g)):g.isPointsMaterial?l(p,g,M,T):g.isSpriteMaterial?c(p,g):g.isShadowMaterial?(p.color.value.copy(g.color),p.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function r(p,g){p.opacity.value=g.opacity,g.color&&p.diffuse.value.copy(g.color),g.emissive&&p.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(p.map.value=g.map,t(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,t(g.alphaMap,p.alphaMapTransform)),g.bumpMap&&(p.bumpMap.value=g.bumpMap,t(g.bumpMap,p.bumpMapTransform),p.bumpScale.value=g.bumpScale,g.side===un&&(p.bumpScale.value*=-1)),g.normalMap&&(p.normalMap.value=g.normalMap,t(g.normalMap,p.normalMapTransform),p.normalScale.value.copy(g.normalScale),g.side===un&&p.normalScale.value.negate()),g.displacementMap&&(p.displacementMap.value=g.displacementMap,t(g.displacementMap,p.displacementMapTransform),p.displacementScale.value=g.displacementScale,p.displacementBias.value=g.displacementBias),g.emissiveMap&&(p.emissiveMap.value=g.emissiveMap,t(g.emissiveMap,p.emissiveMapTransform)),g.specularMap&&(p.specularMap.value=g.specularMap,t(g.specularMap,p.specularMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest);const M=e.get(g),T=M.envMap,S=M.envMapRotation;T&&(p.envMap.value=T,p.envMapRotation.value.setFromMatrix4(R_.makeRotationFromEuler(S)).transpose(),T.isCubeTexture&&T.isRenderTargetTexture===!1&&p.envMapRotation.value.premultiply(tf),p.reflectivity.value=g.reflectivity,p.ior.value=g.ior,p.refractionRatio.value=g.refractionRatio),g.lightMap&&(p.lightMap.value=g.lightMap,p.lightMapIntensity.value=g.lightMapIntensity,t(g.lightMap,p.lightMapTransform)),g.aoMap&&(p.aoMap.value=g.aoMap,p.aoMapIntensity.value=g.aoMapIntensity,t(g.aoMap,p.aoMapTransform))}function a(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,g.map&&(p.map.value=g.map,t(g.map,p.mapTransform))}function o(p,g){p.dashSize.value=g.dashSize,p.totalSize.value=g.dashSize+g.gapSize,p.scale.value=g.scale}function l(p,g,M,T){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.size.value=g.size*M,p.scale.value=T*.5,g.map&&(p.map.value=g.map,t(g.map,p.uvTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,t(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function c(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.rotation.value=g.rotation,g.map&&(p.map.value=g.map,t(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,t(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function u(p,g){p.specular.value.copy(g.specular),p.shininess.value=Math.max(g.shininess,1e-4)}function d(p,g){g.gradientMap&&(p.gradientMap.value=g.gradientMap)}function h(p,g){p.metalness.value=g.metalness,g.metalnessMap&&(p.metalnessMap.value=g.metalnessMap,t(g.metalnessMap,p.metalnessMapTransform)),p.roughness.value=g.roughness,g.roughnessMap&&(p.roughnessMap.value=g.roughnessMap,t(g.roughnessMap,p.roughnessMapTransform)),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)}function f(p,g,M){p.ior.value=g.ior,g.sheen>0&&(p.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),p.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(p.sheenColorMap.value=g.sheenColorMap,t(g.sheenColorMap,p.sheenColorMapTransform)),g.sheenRoughnessMap&&(p.sheenRoughnessMap.value=g.sheenRoughnessMap,t(g.sheenRoughnessMap,p.sheenRoughnessMapTransform))),g.clearcoat>0&&(p.clearcoat.value=g.clearcoat,p.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(p.clearcoatMap.value=g.clearcoatMap,t(g.clearcoatMap,p.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,t(g.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(p.clearcoatNormalMap.value=g.clearcoatNormalMap,t(g.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===un&&p.clearcoatNormalScale.value.negate())),g.dispersion>0&&(p.dispersion.value=g.dispersion),g.iridescence>0&&(p.iridescence.value=g.iridescence,p.iridescenceIOR.value=g.iridescenceIOR,p.iridescenceThicknessMinimum.value=g.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=g.iridescenceThicknessRange[1],g.iridescenceMap&&(p.iridescenceMap.value=g.iridescenceMap,t(g.iridescenceMap,p.iridescenceMapTransform)),g.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=g.iridescenceThicknessMap,t(g.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),g.transmission>0&&(p.transmission.value=g.transmission,p.transmissionSamplerMap.value=M.texture,p.transmissionSamplerSize.value.set(M.width,M.height),g.transmissionMap&&(p.transmissionMap.value=g.transmissionMap,t(g.transmissionMap,p.transmissionMapTransform)),p.thickness.value=g.thickness,g.thicknessMap&&(p.thicknessMap.value=g.thicknessMap,t(g.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=g.attenuationDistance,p.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(p.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(p.anisotropyMap.value=g.anisotropyMap,t(g.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=g.specularIntensity,p.specularColor.value.copy(g.specularColor),g.specularColorMap&&(p.specularColorMap.value=g.specularColorMap,t(g.specularColorMap,p.specularColorMapTransform)),g.specularIntensityMap&&(p.specularIntensityMap.value=g.specularIntensityMap,t(g.specularIntensityMap,p.specularIntensityMapTransform))}function v(p,g){g.matcap&&(p.matcap.value=g.matcap)}function _(p,g){const M=e.get(g).light;p.referencePosition.value.setFromMatrixPosition(M.matrixWorld),p.nearDistance.value=M.shadow.camera.near,p.farDistance.value=M.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function P_(i,e,t,n){let s={},r={},a=[];const o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(S,R){const y=R.program;n.uniformBlockBinding(S,y)}function c(S,R){let y=s[S.id];y===void 0&&(p(S),y=u(S),s[S.id]=y,S.addEventListener("dispose",M));const E=R.program;n.updateUBOMapping(S,E);const m=e.render.frame;r[S.id]!==m&&(h(S),r[S.id]=m)}function u(S){const R=d();S.__bindingPointIndex=R;const y=i.createBuffer(),E=S.__size,m=S.usage;return i.bindBuffer(i.UNIFORM_BUFFER,y),i.bufferData(i.UNIFORM_BUFFER,E,m),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,R,y),y}function d(){for(let S=0;S<o;S++)if(a.indexOf(S)===-1)return a.push(S),S;return ct("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function h(S){const R=s[S.id],y=S.uniforms,E=S.__cache;i.bindBuffer(i.UNIFORM_BUFFER,R);for(let m=0,x=y.length;m<x;m++){const A=y[m];if(Array.isArray(A))for(let C=0,L=A.length;C<L;C++)f(A[C],m,C,E);else f(A,m,0,E)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function f(S,R,y,E){if(_(S,R,y,E)===!0){const m=S.__offset,x=S.value;if(Array.isArray(x)){let A=0;for(let C=0;C<x.length;C++){const L=x[C],F=g(L);v(L,S.__data,A),typeof L!="number"&&typeof L!="boolean"&&!L.isMatrix3&&!ArrayBuffer.isView(L)&&(A+=F.storage/Float32Array.BYTES_PER_ELEMENT)}}else v(x,S.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,m,S.__data)}}function v(S,R,y){typeof S=="number"||typeof S=="boolean"?R[0]=S:S.isMatrix3?(R[0]=S.elements[0],R[1]=S.elements[1],R[2]=S.elements[2],R[3]=0,R[4]=S.elements[3],R[5]=S.elements[4],R[6]=S.elements[5],R[7]=0,R[8]=S.elements[6],R[9]=S.elements[7],R[10]=S.elements[8],R[11]=0):ArrayBuffer.isView(S)?R.set(new S.constructor(S.buffer,S.byteOffset,R.length)):S.toArray(R,y)}function _(S,R,y,E){const m=S.value,x=R+"_"+y;if(E[x]===void 0)return typeof m=="number"||typeof m=="boolean"?E[x]=m:ArrayBuffer.isView(m)?E[x]=m.slice():E[x]=m.clone(),!0;{const A=E[x];if(typeof m=="number"||typeof m=="boolean"){if(A!==m)return E[x]=m,!0}else{if(ArrayBuffer.isView(m))return!0;if(A.equals(m)===!1)return A.copy(m),!0}}return!1}function p(S){const R=S.uniforms;let y=0;const E=16;for(let x=0,A=R.length;x<A;x++){const C=Array.isArray(R[x])?R[x]:[R[x]];for(let L=0,F=C.length;L<F;L++){const z=C[L],D=Array.isArray(z.value)?z.value:[z.value];for(let H=0,G=D.length;H<G;H++){const K=D[H],ne=g(K),X=y%E,j=X%ne.boundary,ie=X+j;y+=j,ie!==0&&E-ie<ne.storage&&(y+=E-ie),z.__data=new Float32Array(ne.storage/Float32Array.BYTES_PER_ELEMENT),z.__offset=y,y+=ne.storage}}}const m=y%E;return m>0&&(y+=E-m),S.__size=y,S.__cache={},this}function g(S){const R={boundary:0,storage:0};return typeof S=="number"||typeof S=="boolean"?(R.boundary=4,R.storage=4):S.isVector2?(R.boundary=8,R.storage=8):S.isVector3||S.isColor?(R.boundary=16,R.storage=12):S.isVector4?(R.boundary=16,R.storage=16):S.isMatrix3?(R.boundary=48,R.storage=48):S.isMatrix4?(R.boundary=64,R.storage=64):S.isTexture?ze("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(S)?(R.boundary=16,R.storage=S.byteLength):ze("WebGLRenderer: Unsupported uniform value type.",S),R}function M(S){const R=S.target;R.removeEventListener("dispose",M);const y=a.indexOf(R.__bindingPointIndex);a.splice(y,1),i.deleteBuffer(s[R.id]),delete s[R.id],delete r[R.id]}function T(){for(const S in s)i.deleteBuffer(s[S]);a=[],s={},r={}}return{bind:l,update:c,dispose:T}}const L_=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let Vn=null;function D_(){return Vn===null&&(Vn=new Pc(L_,16,16,hs,xi),Vn.name="DFG_LUT",Vn.minFilter=Zt,Vn.magFilter=Zt,Vn.wrapS=$n,Vn.wrapT=$n,Vn.generateMipmaps=!1,Vn.needsUpdate=!0),Vn}class I_{constructor(e={}){const{canvas:t=Up(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:h=!1,outputBufferType:f=_n}=e;this.isWebGLRenderer=!0;let v;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");v=n.getContextAttributes().alpha}else v=a;const _=f,p=new Set([wc,yc,Mc]),g=new Set([_n,ei,Sr,xr,_c,Sc]),M=new Uint32Array(4),T=new Int32Array(4),S=new I;let R=null,y=null;const E=[],m=[];let x=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Kn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const A=this;let C=!1,L=null,F=null,z=null,D=null;this._outputColorSpace=cn;let H=0,G=0,K=null,ne=-1,X=null;const j=new Et,ie=new Et;let Ae=null;const Oe=new Ve(0);let se=0,V=t.width,te=t.height,re=1,ge=null,Ce=null;const _e=new Et(0,0,V,te),je=new Et(0,0,V,te);let De=!1;const nt=new Lc;let Ge=!1,$e=!1;const dt=new rt,ot=new I,xt=new Et,Tt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let yt=!1;function At(){return K===null?re:1}let k=n;function Kt(w,O){return t.getContext(w,O)}try{const w={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:u,failIfMajorPerformanceCaveat:d};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${gc}`),t.addEventListener("webglcontextlost",Rt,!1),t.addEventListener("webglcontextrestored",_t,!1),t.addEventListener("webglcontextcreationerror",zn,!1),k===null){const O="webgl2";if(k=Kt(O,w),k===null)throw Kt(O)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(w){throw ct("WebGLRenderer: "+w.message),w}let ut,P,b,B,Y,J,le,pe,ee,W,de,Re,ue,he,Ie,ke,He,U,me,ae,ve,Me,oe;function Fe(){ut=new Dv(k),ut.init(),ve=new y_(k,ut),P=new wv(k,ut,e,ve),b=new x_(k,ut),P.reversedDepthBuffer&&h&&b.buffers.depth.setReversed(!0),F=k.createFramebuffer(),z=k.createFramebuffer(),D=k.createFramebuffer(),B=new Uv(k),Y=new o_,J=new M_(k,ut,b,Y,P,ve,B),le=new Lv(A),pe=new zm(k),Me=new Mv(k,pe),ee=new Iv(k,pe,B,Me),W=new kv(k,ee,pe,Me,B),U=new Nv(k,P,J),Ie=new Ev(Y),de=new a_(A,le,ut,P,Me,Ie),Re=new C_(A,Y),ue=new c_,he=new m_(ut),He=new xv(A,le,b,W,v,l),ke=new S_(A,W,P),oe=new P_(k,B,P,b),me=new yv(k,ut,B),ae=new Fv(k,ut,B),B.programs=de.programs,A.capabilities=P,A.extensions=ut,A.properties=Y,A.renderLists=ue,A.shadowMap=ke,A.state=b,A.info=B}Fe(),_!==_n&&(x=new zv(_,t.width,t.height,o,s,r));const Pe=new A_(A,k);this.xr=Pe,this.getContext=function(){return k},this.getContextAttributes=function(){return k.getContextAttributes()},this.forceContextLoss=function(){const w=ut.get("WEBGL_lose_context");w&&w.loseContext()},this.forceContextRestore=function(){const w=ut.get("WEBGL_lose_context");w&&w.restoreContext()},this.getPixelRatio=function(){return re},this.setPixelRatio=function(w){w!==void 0&&(re=w,this.setSize(V,te,!1))},this.getSize=function(w){return w.set(V,te)},this.setSize=function(w,O,Z=!0){if(Pe.isPresenting){ze("WebGLRenderer: Can't change size while VR device is presenting.");return}V=w,te=O,t.width=Math.floor(w*re),t.height=Math.floor(O*re),Z===!0&&(t.style.width=w+"px",t.style.height=O+"px"),x!==null&&x.setSize(t.width,t.height),this.setViewport(0,0,w,O)},this.getDrawingBufferSize=function(w){return w.set(V*re,te*re).floor()},this.setDrawingBufferSize=function(w,O,Z){V=w,te=O,re=Z,t.width=Math.floor(w*Z),t.height=Math.floor(O*Z),this.setViewport(0,0,w,O)},this.setEffects=function(w){if(_===_n){ct("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(w){for(let O=0;O<w.length;O++)if(w[O].isOutputPass===!0){ze("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}x.setEffects(w||[])},this.getCurrentViewport=function(w){return w.copy(j)},this.getViewport=function(w){return w.copy(_e)},this.setViewport=function(w,O,Z,q){w.isVector4?_e.set(w.x,w.y,w.z,w.w):_e.set(w,O,Z,q),b.viewport(j.copy(_e).multiplyScalar(re).round())},this.getScissor=function(w){return w.copy(je)},this.setScissor=function(w,O,Z,q){w.isVector4?je.set(w.x,w.y,w.z,w.w):je.set(w,O,Z,q),b.scissor(ie.copy(je).multiplyScalar(re).round())},this.getScissorTest=function(){return De},this.setScissorTest=function(w){b.setScissorTest(De=w)},this.setOpaqueSort=function(w){ge=w},this.setTransparentSort=function(w){Ce=w},this.getClearColor=function(w){return w.copy(He.getClearColor())},this.setClearColor=function(){He.setClearColor(...arguments)},this.getClearAlpha=function(){return He.getClearAlpha()},this.setClearAlpha=function(){He.setClearAlpha(...arguments)},this.clear=function(w=!0,O=!0,Z=!0){let q=0;if(w){let $=!1;if(K!==null){const xe=K.texture.format;$=p.has(xe)}if($){const xe=K.texture.type,Te=g.has(xe),Se=He.getClearColor(),Le=He.getClearAlpha(),Ue=Se.r,Ye=Se.g,et=Se.b;Te?(M[0]=Ue,M[1]=Ye,M[2]=et,M[3]=Le,k.clearBufferuiv(k.COLOR,0,M)):(T[0]=Ue,T[1]=Ye,T[2]=et,T[3]=Le,k.clearBufferiv(k.COLOR,0,T))}else q|=k.COLOR_BUFFER_BIT}O&&(q|=k.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),Z&&(q|=k.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),q!==0&&k.clear(q)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(w){w.setRenderer(this),L=w},this.dispose=function(){t.removeEventListener("webglcontextlost",Rt,!1),t.removeEventListener("webglcontextrestored",_t,!1),t.removeEventListener("webglcontextcreationerror",zn,!1),He.dispose(),ue.dispose(),he.dispose(),Y.dispose(),le.dispose(),W.dispose(),Me.dispose(),oe.dispose(),de.dispose(),Pe.dispose(),Pe.removeEventListener("sessionstart",qc),Pe.removeEventListener("sessionend",$c),Yi.stop()};function Rt(w){w.preventDefault(),hh("WebGLRenderer: Context Lost."),C=!0}function _t(){hh("WebGLRenderer: Context Restored."),C=!1;const w=B.autoReset,O=ke.enabled,Z=ke.autoUpdate,q=ke.needsUpdate,$=ke.type;Fe(),B.autoReset=w,ke.enabled=O,ke.autoUpdate=Z,ke.needsUpdate=q,ke.type=$}function zn(w){ct("WebGLRenderer: A WebGL context could not be created. Reason: ",w.statusMessage)}function Bn(w){const O=w.target;O.removeEventListener("dispose",Bn),Zf(O)}function Zf(w){Kf(w),Y.remove(w)}function Kf(w){const O=Y.get(w).programs;O!==void 0&&(O.forEach(function(Z){de.releaseProgram(Z)}),w.isShaderMaterial&&de.releaseShaderCache(w))}this.renderBufferDirect=function(w,O,Z,q,$,xe){O===null&&(O=Tt);const Te=$.isMesh&&$.matrixWorld.determinantAffine()<0,Se=jf(w,O,Z,q,$);b.setMaterial(q,Te);let Le=Z.index,Ue=1;if(q.wireframe===!0){if(Le=ee.getWireframeAttribute(Z),Le===void 0)return;Ue=2}const Ye=Z.drawRange,et=Z.attributes.position;let Ne=Ye.start*Ue,mt=(Ye.start+Ye.count)*Ue;xe!==null&&(Ne=Math.max(Ne,xe.start*Ue),mt=Math.min(mt,(xe.start+xe.count)*Ue)),Le!==null?(Ne=Math.max(Ne,0),mt=Math.min(mt,Le.count)):et!=null&&(Ne=Math.max(Ne,0),mt=Math.min(mt,et.count));const Nt=mt-Ne;if(Nt<0||Nt===1/0)return;Me.setup($,q,Se,Z,Le);let Ct,vt=me;if(Le!==null&&(Ct=pe.get(Le),vt=ae,vt.setIndex(Ct)),$.isMesh)q.wireframe===!0?(b.setLineWidth(q.wireframeLinewidth*At()),vt.setMode(k.LINES)):vt.setMode(k.TRIANGLES);else if($.isLine){let Jt=q.linewidth;Jt===void 0&&(Jt=1),b.setLineWidth(Jt*At()),$.isLineSegments?vt.setMode(k.LINES):$.isLineLoop?vt.setMode(k.LINE_LOOP):vt.setMode(k.LINE_STRIP)}else $.isPoints?vt.setMode(k.POINTS):$.isSprite&&vt.setMode(k.TRIANGLES);if($.isBatchedMesh)if(ut.get("WEBGL_multi_draw"))vt.renderMultiDraw($._multiDrawStarts,$._multiDrawCounts,$._multiDrawCount);else{const Jt=$._multiDrawStarts,Ee=$._multiDrawCounts,fn=$._multiDrawCount,lt=Le?pe.get(Le).bytesPerElement:1,xn=Y.get(q).currentProgram.getUniforms();for(let Hn=0;Hn<fn;Hn++)xn.setValue(k,"_gl_DrawID",Hn),vt.render(Jt[Hn]/lt,Ee[Hn])}else if($.isInstancedMesh)vt.renderInstances(Ne,Nt,$.count);else if(Z.isInstancedBufferGeometry){const Jt=Z._maxInstanceCount!==void 0?Z._maxInstanceCount:1/0,Ee=Math.min(Z.instanceCount,Jt);vt.renderInstances(Ne,Nt,Ee)}else vt.render(Ne,Nt)};function Yc(w,O,Z){w.transparent===!0&&w.side===di&&w.forceSinglePass===!1?(w.side=un,w.needsUpdate=!0,Rr(w,O,Z),w.side=Wi,w.needsUpdate=!0,Rr(w,O,Z),w.side=di):Rr(w,O,Z)}this.compile=function(w,O,Z=null){Z===null&&(Z=w),y=he.get(Z),y.init(O),m.push(y),Z.traverseVisible(function($){$.isLight&&$.layers.test(O.layers)&&(y.pushLight($),$.castShadow&&y.pushShadow($))}),w!==Z&&w.traverseVisible(function($){$.isLight&&$.layers.test(O.layers)&&(y.pushLight($),$.castShadow&&y.pushShadow($))}),y.setupLights();const q=new Set;return w.traverse(function($){if(!($.isMesh||$.isPoints||$.isLine||$.isSprite))return;const xe=$.material;if(xe)if(Array.isArray(xe))for(let Te=0;Te<xe.length;Te++){const Se=xe[Te];Yc(Se,Z,$),q.add(Se)}else Yc(xe,Z,$),q.add(xe)}),y=m.pop(),q},this.compileAsync=function(w,O,Z=null){const q=this.compile(w,O,Z);return new Promise($=>{function xe(){if(q.forEach(function(Te){Y.get(Te).currentProgram.isReady()&&q.delete(Te)}),q.size===0){$(w);return}setTimeout(xe,10)}ut.get("KHR_parallel_shader_compile")!==null?xe():setTimeout(xe,10)})};let so=null;function Jf(w){so&&so(w)}function qc(){Yi.stop()}function $c(){Yi.start()}const Yi=new $d;Yi.setAnimationLoop(Jf),typeof self<"u"&&Yi.setContext(self),this.setAnimationLoop=function(w){so=w,Pe.setAnimationLoop(w),w===null?Yi.stop():Yi.start()},Pe.addEventListener("sessionstart",qc),Pe.addEventListener("sessionend",$c),this.render=function(w,O){if(O!==void 0&&O.isCamera!==!0){ct("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(C===!0)return;L!==null&&L.renderStart(w,O);const Z=Pe.enabled===!0&&Pe.isPresenting===!0,q=x!==null&&(K===null||Z)&&x.begin(A,K);if(w.matrixWorldAutoUpdate===!0&&w.updateMatrixWorld(),O.parent===null&&O.matrixWorldAutoUpdate===!0&&O.updateMatrixWorld(),Pe.enabled===!0&&Pe.isPresenting===!0&&(x===null||x.isCompositing()===!1)&&(Pe.cameraAutoUpdate===!0&&Pe.updateCamera(O),O=Pe.getCamera()),w.isScene===!0&&w.onBeforeRender(A,w,O,K),y=he.get(w,m.length),y.init(O),y.state.textureUnits=J.getTextureUnits(),m.push(y),dt.multiplyMatrices(O.projectionMatrix,O.matrixWorldInverse),nt.setFromProjectionMatrix(dt,Zn,O.reversedDepth),$e=this.localClippingEnabled,Ge=Ie.init(this.clippingPlanes,$e),R=ue.get(w,E.length),R.init(),E.push(R),Pe.enabled===!0&&Pe.isPresenting===!0){const Te=A.xr.getDepthSensingMesh();Te!==null&&ro(Te,O,-1/0,A.sortObjects)}ro(w,O,0,A.sortObjects),R.finish(),A.sortObjects===!0&&R.sort(ge,Ce,O.reversedDepth),yt=Pe.enabled===!1||Pe.isPresenting===!1||Pe.hasDepthSensing()===!1,yt&&He.addToRenderList(R,w),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Ge===!0&&Ie.beginShadows();const $=y.state.shadowsArray;if(ke.render($,w,O),Ge===!0&&Ie.endShadows(),(q&&x.hasRenderPass())===!1){const Te=R.opaque,Se=R.transmissive;if(y.setupLights(),O.isArrayCamera){const Le=O.cameras;if(Se.length>0)for(let Ue=0,Ye=Le.length;Ue<Ye;Ue++){const et=Le[Ue];Kc(Te,Se,w,et)}yt&&He.render(w);for(let Ue=0,Ye=Le.length;Ue<Ye;Ue++){const et=Le[Ue];Zc(R,w,et,et.viewport)}}else Se.length>0&&Kc(Te,Se,w,O),yt&&He.render(w),Zc(R,w,O)}K!==null&&G===0&&(J.updateMultisampleRenderTarget(K),J.updateRenderTargetMipmap(K)),q&&x.end(A),w.isScene===!0&&w.onAfterRender(A,w,O),Me.resetDefaultState(),ne=-1,X=null,m.pop(),m.length>0?(y=m[m.length-1],J.setTextureUnits(y.state.textureUnits),Ge===!0&&Ie.setGlobalState(A.clippingPlanes,y.state.camera)):y=null,E.pop(),E.length>0?R=E[E.length-1]:R=null,L!==null&&L.renderEnd()};function ro(w,O,Z,q){if(w.visible===!1)return;if(w.layers.test(O.layers)){if(w.isGroup)Z=w.renderOrder;else if(w.isLOD)w.autoUpdate===!0&&w.update(O);else if(w.isLightProbeGrid)y.pushLightProbeGrid(w);else if(w.isLight)y.pushLight(w),w.castShadow&&y.pushShadow(w);else if(w.isSprite){if(!w.frustumCulled||nt.intersectsSprite(w)){q&&xt.setFromMatrixPosition(w.matrixWorld).applyMatrix4(dt);const Te=W.update(w),Se=w.material;Se.visible&&R.push(w,Te,Se,Z,xt.z,null)}}else if((w.isMesh||w.isLine||w.isPoints)&&(!w.frustumCulled||nt.intersectsObject(w))){const Te=W.update(w),Se=w.material;if(q&&(w.boundingSphere!==void 0?(w.boundingSphere===null&&w.computeBoundingSphere(),xt.copy(w.boundingSphere.center)):(Te.boundingSphere===null&&Te.computeBoundingSphere(),xt.copy(Te.boundingSphere.center)),xt.applyMatrix4(w.matrixWorld).applyMatrix4(dt)),Array.isArray(Se)){const Le=Te.groups;for(let Ue=0,Ye=Le.length;Ue<Ye;Ue++){const et=Le[Ue],Ne=Se[et.materialIndex];Ne&&Ne.visible&&R.push(w,Te,Ne,Z,xt.z,et)}}else Se.visible&&R.push(w,Te,Se,Z,xt.z,null)}}const xe=w.children;for(let Te=0,Se=xe.length;Te<Se;Te++)ro(xe[Te],O,Z,q)}function Zc(w,O,Z,q){const{opaque:$,transmissive:xe,transparent:Te}=w;y.setupLightsView(Z),Ge===!0&&Ie.setGlobalState(A.clippingPlanes,Z),q&&b.viewport(j.copy(q)),$.length>0&&Ar($,O,Z),xe.length>0&&Ar(xe,O,Z),Te.length>0&&Ar(Te,O,Z),b.buffers.depth.setTest(!0),b.buffers.depth.setMask(!0),b.buffers.color.setMask(!0),b.setPolygonOffset(!1)}function Kc(w,O,Z,q){if((Z.isScene===!0?Z.overrideMaterial:null)!==null)return;if(y.state.transmissionRenderTarget[q.id]===void 0){const Ne=ut.has("EXT_color_buffer_half_float")||ut.has("EXT_color_buffer_float");y.state.transmissionRenderTarget[q.id]=new Jn(1,1,{generateMipmaps:!0,type:Ne?xi:_n,minFilter:zi,samples:Math.max(4,P.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:st.workingColorSpace})}const xe=y.state.transmissionRenderTarget[q.id],Te=q.viewport||j;xe.setSize(Te.z*A.transmissionResolutionScale,Te.w*A.transmissionResolutionScale);const Se=A.getRenderTarget(),Le=A.getActiveCubeFace(),Ue=A.getActiveMipmapLevel();A.setRenderTarget(xe),A.getClearColor(Oe),se=A.getClearAlpha(),se<1&&A.setClearColor(16777215,.5),A.clear(),yt&&He.render(Z);const Ye=A.toneMapping;A.toneMapping=Kn;const et=q.viewport;if(q.viewport!==void 0&&(q.viewport=void 0),y.setupLightsView(q),Ge===!0&&Ie.setGlobalState(A.clippingPlanes,q),Ar(w,Z,q),J.updateMultisampleRenderTarget(xe),J.updateRenderTargetMipmap(xe),ut.has("WEBGL_multisampled_render_to_texture")===!1){let Ne=!1;for(let mt=0,Nt=O.length;mt<Nt;mt++){const Ct=O[mt],{object:vt,geometry:Jt,material:Ee,group:fn}=Ct;if(Ee.side===di&&vt.layers.test(q.layers)){const lt=Ee.side;Ee.side=un,Ee.needsUpdate=!0,Jc(vt,Z,q,Jt,Ee,fn),Ee.side=lt,Ee.needsUpdate=!0,Ne=!0}}Ne===!0&&(J.updateMultisampleRenderTarget(xe),J.updateRenderTargetMipmap(xe))}A.setRenderTarget(Se,Le,Ue),A.setClearColor(Oe,se),et!==void 0&&(q.viewport=et),A.toneMapping=Ye}function Ar(w,O,Z){const q=O.isScene===!0?O.overrideMaterial:null;for(let $=0,xe=w.length;$<xe;$++){const Te=w[$],{object:Se,geometry:Le,group:Ue}=Te;let Ye=Te.material;Ye.allowOverride===!0&&q!==null&&(Ye=q),Se.layers.test(Z.layers)&&Jc(Se,O,Z,Le,Ye,Ue)}}function Jc(w,O,Z,q,$,xe){w.onBeforeRender(A,O,Z,q,$,xe),w.modelViewMatrix.multiplyMatrices(Z.matrixWorldInverse,w.matrixWorld),w.normalMatrix.getNormalMatrix(w.modelViewMatrix),$.onBeforeRender(A,O,Z,q,w,xe),$.transparent===!0&&$.side===di&&$.forceSinglePass===!1?($.side=un,$.needsUpdate=!0,A.renderBufferDirect(Z,O,q,$,w,xe),$.side=Wi,$.needsUpdate=!0,A.renderBufferDirect(Z,O,q,$,w,xe),$.side=di):A.renderBufferDirect(Z,O,q,$,w,xe),w.onAfterRender(A,O,Z,q,$,xe)}function Rr(w,O,Z){O.isScene!==!0&&(O=Tt);const q=Y.get(w),$=y.state.lights,xe=y.state.shadowsArray,Te=$.state.version,Se=de.getParameters(w,$.state,xe,O,Z,y.state.lightProbeGridArray),Le=de.getProgramCacheKey(Se);let Ue=q.programs;q.environment=w.isMeshStandardMaterial||w.isMeshLambertMaterial||w.isMeshPhongMaterial?O.environment:null,q.fog=O.fog;const Ye=w.isMeshStandardMaterial||w.isMeshLambertMaterial&&!w.envMap||w.isMeshPhongMaterial&&!w.envMap;q.envMap=le.get(w.envMap||q.environment,Ye),q.envMapRotation=q.environment!==null&&w.envMap===null?O.environmentRotation:w.envMapRotation,Ue===void 0&&(w.addEventListener("dispose",Bn),Ue=new Map,q.programs=Ue);let et=Ue.get(Le);if(et!==void 0){if(q.currentProgram===et&&q.lightsStateVersion===Te)return jc(w,Se),et}else Se.uniforms=de.getUniforms(w),L!==null&&w.isNodeMaterial&&L.build(w,Z,Se),w.onBeforeCompile(Se,A),et=de.acquireProgram(Se,Le),Ue.set(Le,et),q.uniforms=Se.uniforms;const Ne=q.uniforms;return(!w.isShaderMaterial&&!w.isRawShaderMaterial||w.clipping===!0)&&(Ne.clippingPlanes=Ie.uniform),jc(w,Se),q.needsLights=tp(w),q.lightsStateVersion=Te,q.needsLights&&(Ne.ambientLightColor.value=$.state.ambient,Ne.lightProbe.value=$.state.probe,Ne.directionalLights.value=$.state.directional,Ne.directionalLightShadows.value=$.state.directionalShadow,Ne.spotLights.value=$.state.spot,Ne.spotLightShadows.value=$.state.spotShadow,Ne.rectAreaLights.value=$.state.rectArea,Ne.ltc_1.value=$.state.rectAreaLTC1,Ne.ltc_2.value=$.state.rectAreaLTC2,Ne.pointLights.value=$.state.point,Ne.pointLightShadows.value=$.state.pointShadow,Ne.hemisphereLights.value=$.state.hemi,Ne.directionalShadowMatrix.value=$.state.directionalShadowMatrix,Ne.spotLightMatrix.value=$.state.spotLightMatrix,Ne.spotLightMap.value=$.state.spotLightMap,Ne.pointShadowMatrix.value=$.state.pointShadowMatrix),q.lightProbeGrid=y.state.lightProbeGridArray.length>0,q.currentProgram=et,q.uniformsList=null,et}function Qc(w){if(w.uniformsList===null){const O=w.currentProgram.getUniforms();w.uniformsList=Ta.seqWithValue(O.seq,w.uniforms)}return w.uniformsList}function jc(w,O){const Z=Y.get(w);Z.outputColorSpace=O.outputColorSpace,Z.batching=O.batching,Z.batchingColor=O.batchingColor,Z.instancing=O.instancing,Z.instancingColor=O.instancingColor,Z.instancingMorph=O.instancingMorph,Z.skinning=O.skinning,Z.morphTargets=O.morphTargets,Z.morphNormals=O.morphNormals,Z.morphColors=O.morphColors,Z.morphTargetsCount=O.morphTargetsCount,Z.numClippingPlanes=O.numClippingPlanes,Z.numIntersection=O.numClipIntersection,Z.vertexAlphas=O.vertexAlphas,Z.vertexTangents=O.vertexTangents,Z.toneMapping=O.toneMapping}function Qf(w,O){if(w.length===0)return null;if(w.length===1)return w[0].texture!==null?w[0]:null;S.setFromMatrixPosition(O.matrixWorld);for(let Z=0,q=w.length;Z<q;Z++){const $=w[Z];if($.texture!==null&&$.boundingBox.containsPoint(S))return $}return null}function jf(w,O,Z,q,$){O.isScene!==!0&&(O=Tt),J.resetTextureUnits();const xe=O.fog,Te=q.isMeshStandardMaterial||q.isMeshLambertMaterial||q.isMeshPhongMaterial?O.environment:null,Se=K===null?A.outputColorSpace:K.isXRRenderTarget===!0?K.texture.colorSpace:st.workingColorSpace,Le=q.isMeshStandardMaterial||q.isMeshLambertMaterial&&!q.envMap||q.isMeshPhongMaterial&&!q.envMap,Ue=le.get(q.envMap||Te,Le),Ye=q.vertexColors===!0&&!!Z.attributes.color&&Z.attributes.color.itemSize===4,et=!!Z.attributes.tangent&&(!!q.normalMap||q.anisotropy>0),Ne=!!Z.morphAttributes.position,mt=!!Z.morphAttributes.normal,Nt=!!Z.morphAttributes.color;let Ct=Kn;q.toneMapped&&(K===null||K.isXRRenderTarget===!0)&&(Ct=A.toneMapping);const vt=Z.morphAttributes.position||Z.morphAttributes.normal||Z.morphAttributes.color,Jt=vt!==void 0?vt.length:0,Ee=Y.get(q),fn=y.state.lights;if(Ge===!0&&($e===!0||w!==X)){const St=w===X&&q.id===ne;Ie.setState(q,w,St)}let lt=!1;q.version===Ee.__version?(Ee.needsLights&&Ee.lightsStateVersion!==fn.state.version||Ee.outputColorSpace!==Se||$.isBatchedMesh&&Ee.batching===!1||!$.isBatchedMesh&&Ee.batching===!0||$.isBatchedMesh&&Ee.batchingColor===!0&&$.colorTexture===null||$.isBatchedMesh&&Ee.batchingColor===!1&&$.colorTexture!==null||$.isInstancedMesh&&Ee.instancing===!1||!$.isInstancedMesh&&Ee.instancing===!0||$.isSkinnedMesh&&Ee.skinning===!1||!$.isSkinnedMesh&&Ee.skinning===!0||$.isInstancedMesh&&Ee.instancingColor===!0&&$.instanceColor===null||$.isInstancedMesh&&Ee.instancingColor===!1&&$.instanceColor!==null||$.isInstancedMesh&&Ee.instancingMorph===!0&&$.morphTexture===null||$.isInstancedMesh&&Ee.instancingMorph===!1&&$.morphTexture!==null||Ee.envMap!==Ue||q.fog===!0&&Ee.fog!==xe||Ee.numClippingPlanes!==void 0&&(Ee.numClippingPlanes!==Ie.numPlanes||Ee.numIntersection!==Ie.numIntersection)||Ee.vertexAlphas!==Ye||Ee.vertexTangents!==et||Ee.morphTargets!==Ne||Ee.morphNormals!==mt||Ee.morphColors!==Nt||Ee.toneMapping!==Ct||Ee.morphTargetsCount!==Jt||!!Ee.lightProbeGrid!=y.state.lightProbeGridArray.length>0)&&(lt=!0):(lt=!0,Ee.__version=q.version);let xn=Ee.currentProgram;lt===!0&&(xn=Rr(q,O,$),L&&q.isNodeMaterial&&L.onUpdateProgram(q,xn,Ee));let Hn=!1,wi=!1,vs=!1;const bt=xn.getUniforms(),kt=Ee.uniforms;if(b.useProgram(xn.program)&&(Hn=!0,wi=!0,vs=!0),q.id!==ne&&(ne=q.id,wi=!0),Ee.needsLights){const St=Qf(y.state.lightProbeGridArray,$);Ee.lightProbeGrid!==St&&(Ee.lightProbeGrid=St,wi=!0)}if(Hn||X!==w){b.buffers.depth.getReversed()&&w.reversedDepth!==!0&&(w._reversedDepth=!0,w.updateProjectionMatrix()),bt.setValue(k,"projectionMatrix",w.projectionMatrix),bt.setValue(k,"viewMatrix",w.matrixWorldInverse);const Ti=bt.map.cameraPosition;Ti!==void 0&&Ti.setValue(k,ot.setFromMatrixPosition(w.matrixWorld)),P.logarithmicDepthBuffer&&bt.setValue(k,"logDepthBufFC",2/(Math.log(w.far+1)/Math.LN2)),(q.isMeshPhongMaterial||q.isMeshToonMaterial||q.isMeshLambertMaterial||q.isMeshBasicMaterial||q.isMeshStandardMaterial||q.isShaderMaterial)&&bt.setValue(k,"isOrthographic",w.isOrthographicCamera===!0),X!==w&&(X=w,wi=!0,vs=!0)}if(Ee.needsLights&&(fn.state.directionalShadowMap.length>0&&bt.setValue(k,"directionalShadowMap",fn.state.directionalShadowMap,J),fn.state.spotShadowMap.length>0&&bt.setValue(k,"spotShadowMap",fn.state.spotShadowMap,J),fn.state.pointShadowMap.length>0&&bt.setValue(k,"pointShadowMap",fn.state.pointShadowMap,J)),$.isSkinnedMesh){bt.setOptional(k,$,"bindMatrix"),bt.setOptional(k,$,"bindMatrixInverse");const St=$.skeleton;St&&(St.boneTexture===null&&St.computeBoneTexture(),bt.setValue(k,"boneTexture",St.boneTexture,J))}$.isBatchedMesh&&(bt.setOptional(k,$,"batchingTexture"),bt.setValue(k,"batchingTexture",$._matricesTexture,J),bt.setOptional(k,$,"batchingIdTexture"),bt.setValue(k,"batchingIdTexture",$._indirectTexture,J),bt.setOptional(k,$,"batchingColorTexture"),$._colorsTexture!==null&&bt.setValue(k,"batchingColorTexture",$._colorsTexture,J));const Ei=Z.morphAttributes;if((Ei.position!==void 0||Ei.normal!==void 0||Ei.color!==void 0)&&U.update($,Z,xn),(wi||Ee.receiveShadow!==$.receiveShadow)&&(Ee.receiveShadow=$.receiveShadow,bt.setValue(k,"receiveShadow",$.receiveShadow)),(q.isMeshStandardMaterial||q.isMeshLambertMaterial||q.isMeshPhongMaterial)&&q.envMap===null&&O.environment!==null&&(kt.envMapIntensity.value=O.environmentIntensity),kt.dfgLUT!==void 0&&(kt.dfgLUT.value=D_()),wi){if(bt.setValue(k,"toneMappingExposure",A.toneMappingExposure),Ee.needsLights&&ep(kt,vs),xe&&q.fog===!0&&Re.refreshFogUniforms(kt,xe),Re.refreshMaterialUniforms(kt,q,re,te,y.state.transmissionRenderTarget[w.id]),Ee.needsLights&&Ee.lightProbeGrid){const St=Ee.lightProbeGrid;kt.probesSH.value=St.texture,kt.probesMin.value.copy(St.boundingBox.min),kt.probesMax.value.copy(St.boundingBox.max),kt.probesResolution.value.copy(St.resolution)}Ta.upload(k,Qc(Ee),kt,J)}if(q.isShaderMaterial&&q.uniformsNeedUpdate===!0&&(Ta.upload(k,Qc(Ee),kt,J),q.uniformsNeedUpdate=!1),q.isSpriteMaterial&&bt.setValue(k,"center",$.center),bt.setValue(k,"modelViewMatrix",$.modelViewMatrix),bt.setValue(k,"normalMatrix",$.normalMatrix),bt.setValue(k,"modelMatrix",$.matrixWorld),q.uniformsGroups!==void 0){const St=q.uniformsGroups;for(let Ti=0,bs=St.length;Ti<bs;Ti++){const eh=St[Ti];oe.update(eh,xn),oe.bind(eh,xn)}}return xn}function ep(w,O){w.ambientLightColor.needsUpdate=O,w.lightProbe.needsUpdate=O,w.directionalLights.needsUpdate=O,w.directionalLightShadows.needsUpdate=O,w.pointLights.needsUpdate=O,w.pointLightShadows.needsUpdate=O,w.spotLights.needsUpdate=O,w.spotLightShadows.needsUpdate=O,w.rectAreaLights.needsUpdate=O,w.hemisphereLights.needsUpdate=O}function tp(w){return w.isMeshLambertMaterial||w.isMeshToonMaterial||w.isMeshPhongMaterial||w.isMeshStandardMaterial||w.isShadowMaterial||w.isShaderMaterial&&w.lights===!0}this.getActiveCubeFace=function(){return H},this.getActiveMipmapLevel=function(){return G},this.getRenderTarget=function(){return K},this.setRenderTargetTextures=function(w,O,Z){const q=Y.get(w);q.__autoAllocateDepthBuffer=w.resolveDepthBuffer===!1,q.__autoAllocateDepthBuffer===!1&&(q.__useRenderToTexture=!1),Y.get(w.texture).__webglTexture=O,Y.get(w.depthTexture).__webglTexture=q.__autoAllocateDepthBuffer?void 0:Z,q.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(w,O){const Z=Y.get(w);Z.__webglFramebuffer=O,Z.__useDefaultFramebuffer=O===void 0},this.setRenderTarget=function(w,O=0,Z=0){K=w,H=O,G=Z;let q=null,$=!1,xe=!1;if(w){const Se=Y.get(w);if(Se.__useDefaultFramebuffer!==void 0){b.bindFramebuffer(k.FRAMEBUFFER,Se.__webglFramebuffer),j.copy(w.viewport),ie.copy(w.scissor),Ae=w.scissorTest,b.viewport(j),b.scissor(ie),b.setScissorTest(Ae),ne=-1;return}else if(Se.__webglFramebuffer===void 0)J.setupRenderTarget(w);else if(Se.__hasExternalTextures)J.rebindTextures(w,Y.get(w.texture).__webglTexture,Y.get(w.depthTexture).__webglTexture);else if(w.depthBuffer){const Ye=w.depthTexture;if(Se.__boundDepthTexture!==Ye){if(Ye!==null&&Y.has(Ye)&&(w.width!==Ye.image.width||w.height!==Ye.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");J.setupDepthRenderbuffer(w)}}const Le=w.texture;(Le.isData3DTexture||Le.isDataArrayTexture||Le.isCompressedArrayTexture)&&(xe=!0);const Ue=Y.get(w).__webglFramebuffer;w.isWebGLCubeRenderTarget?(Array.isArray(Ue[O])?q=Ue[O][Z]:q=Ue[O],$=!0):w.samples>0&&J.useMultisampledRTT(w)===!1?q=Y.get(w).__webglMultisampledFramebuffer:Array.isArray(Ue)?q=Ue[Z]:q=Ue,j.copy(w.viewport),ie.copy(w.scissor),Ae=w.scissorTest}else j.copy(_e).multiplyScalar(re).floor(),ie.copy(je).multiplyScalar(re).floor(),Ae=De;if(Z!==0&&(q=F),b.bindFramebuffer(k.FRAMEBUFFER,q)&&b.drawBuffers(w,q),b.viewport(j),b.scissor(ie),b.setScissorTest(Ae),$){const Se=Y.get(w.texture);k.framebufferTexture2D(k.FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_CUBE_MAP_POSITIVE_X+O,Se.__webglTexture,Z)}else if(xe){const Se=O;for(let Le=0;Le<w.textures.length;Le++){const Ue=Y.get(w.textures[Le]);k.framebufferTextureLayer(k.FRAMEBUFFER,k.COLOR_ATTACHMENT0+Le,Ue.__webglTexture,Z,Se)}}else if(w!==null&&Z!==0){const Se=Y.get(w.texture);k.framebufferTexture2D(k.FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_2D,Se.__webglTexture,Z)}ne=-1},this.readRenderTargetPixels=function(w,O,Z,q,$,xe,Te,Se=0){if(!(w&&w.isWebGLRenderTarget)){ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Le=Y.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&Te!==void 0&&(Le=Le[Te]),Le){b.bindFramebuffer(k.FRAMEBUFFER,Le);try{const Ue=w.textures[Se],Ye=Ue.format,et=Ue.type;if(w.textures.length>1&&k.readBuffer(k.COLOR_ATTACHMENT0+Se),!P.textureFormatReadable(Ye)){ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!P.textureTypeReadable(et)){ct("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}O>=0&&O<=w.width-q&&Z>=0&&Z<=w.height-$&&k.readPixels(O,Z,q,$,ve.convert(Ye),ve.convert(et),xe)}finally{const Ue=K!==null?Y.get(K).__webglFramebuffer:null;b.bindFramebuffer(k.FRAMEBUFFER,Ue)}}},this.readRenderTargetPixelsAsync=async function(w,O,Z,q,$,xe,Te,Se=0){if(!(w&&w.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Le=Y.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&Te!==void 0&&(Le=Le[Te]),Le)if(O>=0&&O<=w.width-q&&Z>=0&&Z<=w.height-$){b.bindFramebuffer(k.FRAMEBUFFER,Le);const Ue=w.textures[Se],Ye=Ue.format,et=Ue.type;if(w.textures.length>1&&k.readBuffer(k.COLOR_ATTACHMENT0+Se),!P.textureFormatReadable(Ye))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!P.textureTypeReadable(et))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const Ne=k.createBuffer();k.bindBuffer(k.PIXEL_PACK_BUFFER,Ne),k.bufferData(k.PIXEL_PACK_BUFFER,xe.byteLength,k.STREAM_READ),k.readPixels(O,Z,q,$,ve.convert(Ye),ve.convert(et),0);const mt=K!==null?Y.get(K).__webglFramebuffer:null;b.bindFramebuffer(k.FRAMEBUFFER,mt);const Nt=k.fenceSync(k.SYNC_GPU_COMMANDS_COMPLETE,0);return k.flush(),await Np(k,Nt,4),k.bindBuffer(k.PIXEL_PACK_BUFFER,Ne),k.getBufferSubData(k.PIXEL_PACK_BUFFER,0,xe),k.deleteBuffer(Ne),k.deleteSync(Nt),xe}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(w,O=null,Z=0){const q=Math.pow(2,-Z),$=Math.floor(w.image.width*q),xe=Math.floor(w.image.height*q),Te=O!==null?O.x:0,Se=O!==null?O.y:0;J.setTexture2D(w,0),k.copyTexSubImage2D(k.TEXTURE_2D,Z,0,0,Te,Se,$,xe),b.unbindTexture()},this.copyTextureToTexture=function(w,O,Z=null,q=null,$=0,xe=0){let Te,Se,Le,Ue,Ye,et,Ne,mt,Nt;const Ct=w.isCompressedTexture?w.mipmaps[xe]:w.image;if(Z!==null)Te=Z.max.x-Z.min.x,Se=Z.max.y-Z.min.y,Le=Z.isBox3?Z.max.z-Z.min.z:1,Ue=Z.min.x,Ye=Z.min.y,et=Z.isBox3?Z.min.z:0;else{const kt=Math.pow(2,-$);Te=Math.floor(Ct.width*kt),Se=Math.floor(Ct.height*kt),w.isDataArrayTexture?Le=Ct.depth:w.isData3DTexture?Le=Math.floor(Ct.depth*kt):Le=1,Ue=0,Ye=0,et=0}q!==null?(Ne=q.x,mt=q.y,Nt=q.z):(Ne=0,mt=0,Nt=0);const vt=ve.convert(O.format),Jt=ve.convert(O.type);let Ee;O.isData3DTexture?(J.setTexture3D(O,0),Ee=k.TEXTURE_3D):O.isDataArrayTexture||O.isCompressedArrayTexture?(J.setTexture2DArray(O,0),Ee=k.TEXTURE_2D_ARRAY):(J.setTexture2D(O,0),Ee=k.TEXTURE_2D),b.activeTexture(k.TEXTURE0),b.pixelStorei(k.UNPACK_FLIP_Y_WEBGL,O.flipY),b.pixelStorei(k.UNPACK_PREMULTIPLY_ALPHA_WEBGL,O.premultiplyAlpha),b.pixelStorei(k.UNPACK_ALIGNMENT,O.unpackAlignment);const fn=b.getParameter(k.UNPACK_ROW_LENGTH),lt=b.getParameter(k.UNPACK_IMAGE_HEIGHT),xn=b.getParameter(k.UNPACK_SKIP_PIXELS),Hn=b.getParameter(k.UNPACK_SKIP_ROWS),wi=b.getParameter(k.UNPACK_SKIP_IMAGES);b.pixelStorei(k.UNPACK_ROW_LENGTH,Ct.width),b.pixelStorei(k.UNPACK_IMAGE_HEIGHT,Ct.height),b.pixelStorei(k.UNPACK_SKIP_PIXELS,Ue),b.pixelStorei(k.UNPACK_SKIP_ROWS,Ye),b.pixelStorei(k.UNPACK_SKIP_IMAGES,et);const vs=w.isDataArrayTexture||w.isData3DTexture,bt=O.isDataArrayTexture||O.isData3DTexture;if(w.isDepthTexture){const kt=Y.get(w),Ei=Y.get(O),St=Y.get(kt.__renderTarget),Ti=Y.get(Ei.__renderTarget);b.bindFramebuffer(k.READ_FRAMEBUFFER,St.__webglFramebuffer),b.bindFramebuffer(k.DRAW_FRAMEBUFFER,Ti.__webglFramebuffer);for(let bs=0;bs<Le;bs++)vs&&(k.framebufferTextureLayer(k.READ_FRAMEBUFFER,k.COLOR_ATTACHMENT0,Y.get(w).__webglTexture,$,et+bs),k.framebufferTextureLayer(k.DRAW_FRAMEBUFFER,k.COLOR_ATTACHMENT0,Y.get(O).__webglTexture,xe,Nt+bs)),k.blitFramebuffer(Ue,Ye,Te,Se,Ne,mt,Te,Se,k.DEPTH_BUFFER_BIT,k.NEAREST);b.bindFramebuffer(k.READ_FRAMEBUFFER,null),b.bindFramebuffer(k.DRAW_FRAMEBUFFER,null)}else if($!==0||w.isRenderTargetTexture||Y.has(w)){const kt=Y.get(w),Ei=Y.get(O);b.bindFramebuffer(k.READ_FRAMEBUFFER,z),b.bindFramebuffer(k.DRAW_FRAMEBUFFER,D);for(let St=0;St<Le;St++)vs?k.framebufferTextureLayer(k.READ_FRAMEBUFFER,k.COLOR_ATTACHMENT0,kt.__webglTexture,$,et+St):k.framebufferTexture2D(k.READ_FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_2D,kt.__webglTexture,$),bt?k.framebufferTextureLayer(k.DRAW_FRAMEBUFFER,k.COLOR_ATTACHMENT0,Ei.__webglTexture,xe,Nt+St):k.framebufferTexture2D(k.DRAW_FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_2D,Ei.__webglTexture,xe),$!==0?k.blitFramebuffer(Ue,Ye,Te,Se,Ne,mt,Te,Se,k.COLOR_BUFFER_BIT,k.NEAREST):bt?k.copyTexSubImage3D(Ee,xe,Ne,mt,Nt+St,Ue,Ye,Te,Se):k.copyTexSubImage2D(Ee,xe,Ne,mt,Ue,Ye,Te,Se);b.bindFramebuffer(k.READ_FRAMEBUFFER,null),b.bindFramebuffer(k.DRAW_FRAMEBUFFER,null)}else bt?w.isDataTexture||w.isData3DTexture?k.texSubImage3D(Ee,xe,Ne,mt,Nt,Te,Se,Le,vt,Jt,Ct.data):O.isCompressedArrayTexture?k.compressedTexSubImage3D(Ee,xe,Ne,mt,Nt,Te,Se,Le,vt,Ct.data):k.texSubImage3D(Ee,xe,Ne,mt,Nt,Te,Se,Le,vt,Jt,Ct):w.isDataTexture?k.texSubImage2D(k.TEXTURE_2D,xe,Ne,mt,Te,Se,vt,Jt,Ct.data):w.isCompressedTexture?k.compressedTexSubImage2D(k.TEXTURE_2D,xe,Ne,mt,Ct.width,Ct.height,vt,Ct.data):k.texSubImage2D(k.TEXTURE_2D,xe,Ne,mt,Te,Se,vt,Jt,Ct);b.pixelStorei(k.UNPACK_ROW_LENGTH,fn),b.pixelStorei(k.UNPACK_IMAGE_HEIGHT,lt),b.pixelStorei(k.UNPACK_SKIP_PIXELS,xn),b.pixelStorei(k.UNPACK_SKIP_ROWS,Hn),b.pixelStorei(k.UNPACK_SKIP_IMAGES,wi),xe===0&&O.generateMipmaps&&k.generateMipmap(Ee),b.unbindTexture()},this.initRenderTarget=function(w){Y.get(w).__webglFramebuffer===void 0&&J.setupRenderTarget(w)},this.initTexture=function(w){w.isCubeTexture?J.setTextureCube(w,0):w.isData3DTexture?J.setTexture3D(w,0):w.isDataArrayTexture||w.isCompressedArrayTexture?J.setTexture2DArray(w,0):J.setTexture2D(w,0),b.unbindTexture()},this.resetState=function(){H=0,G=0,K=null,b.reset(),Me.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Zn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=st._getDrawingBufferColorSpace(e),t.unpackColorSpace=st._getUnpackColorSpace()}}function Ht(i){if(i!==null&&typeof i=="object"){for(const e of Object.getOwnPropertyNames(i))Ht(i[e]);Object.freeze(i)}return i}const oc=Ht({pavement:{id:"pavement",albedo:7961470,roughness:.95,metalness:0,mottle:.075,encroach:0},roughPavement:{id:"roughPavement",albedo:7171692,roughness:.98,metalness:0,mottle:.12,encroach:.22},brick:{id:"brick",albedo:7295046,roughness:.88,metalness:0,mottle:.13,encroach:0,paving:{module:2.8,contrast:.06}},grass:{id:"grass",albedo:4415292,roughness:1,metalness:0,mottle:.2,encroach:1},gravel:{id:"gravel",albedo:7894126,roughness:1,metalness:0,mottle:.19,encroach:.65},dirt:{id:"dirt",albedo:6838858,roughness:.98,metalness:0,mottle:.17,encroach:.75},wood:{id:"wood",albedo:6378307,roughness:.72,metalness:0,mottle:.11,encroach:0},concrete:{id:"concrete",albedo:9605773,roughness:.92,metalness:0,mottle:.04,encroach:0},stone:{id:"stone",albedo:8420212,roughness:.9,metalness:0,mottle:.06,encroach:0},metal:{id:"metal",albedo:5921374,roughness:.45,metalness:.65,mottle:0,encroach:0}}),Qn=Ht({pavement:{id:"pavement",label:"pavement",rollingResistance:.35,grip:1,roughnessAmplitude:.004,roughnessWavelength:3,particle:"none",tyreAudio:"tyre-smooth",wobbleInjection:0,material:"pavement"},roughPavement:{id:"roughPavement",label:"rough pavement",rollingResistance:.85,grip:.92,roughnessAmplitude:.02,roughnessWavelength:2.2,particle:"none",tyreAudio:"tyre-coarse",wobbleInjection:.35,material:"roughPavement"},brick:{id:"brick",label:"brick",rollingResistance:.55,grip:.96,roughnessAmplitude:.012,roughnessWavelength:1.6,particle:"none",tyreAudio:"tyre-brick",wobbleInjection:.18,material:"brick"},grass:{id:"grass",label:"grass",rollingResistance:2.8,grip:.7,roughnessAmplitude:.032,roughnessWavelength:2.6,particle:"grassClipping",tyreAudio:"tyre-grass",wobbleInjection:.55,material:"grass"},gravel:{id:"gravel",label:"gravel",rollingResistance:1.9,grip:.58,roughnessAmplitude:.04,roughnessWavelength:1.9,particle:"dust",tyreAudio:"tyre-gravel",wobbleInjection:.85,material:"gravel"},dirt:{id:"dirt",label:"dirt",rollingResistance:1.1,grip:.8,roughnessAmplitude:.026,roughnessWavelength:3.1,particle:"dust",tyreAudio:"tyre-dirt",wobbleInjection:.45,material:"dirt"},wood:{id:"wood",label:"wood bridge",rollingResistance:.45,grip:.86,roughnessAmplitude:.01,roughnessWavelength:2.4,particle:"splinter",tyreAudio:"tyre-wood",wobbleInjection:.15,material:"wood"}}),nf=Ht(Object.keys(Qn));function Nc(i){return Qn[i]??Qn.pavement}function ls(i){return oc[i]??oc.pavement}const at={tyreDiameter:.5,tyreWidth:.075,shellHeight:.62,shellWidth:.22,shellLength:.52,shellCapFraction:.42,pedalHeight:.16,pedalSpan:.52,pedalLength:.26,pedalThickness:.022,padHeight:.2,padLength:.3,padThickness:.035,padCentreHeight:.44,suspensionTravel:.085},ss={height:1.75,hipHeight:.92},ce={ankleAbovePedal:.06,shinLength:.38,thighLength:.4,stanceHalfWidth:.185,legThickness:.115,bootLength:.24,bootHeight:.075,torsoLength:.5,torsoWidth:.34,torsoDepth:.27,torsoRestPitch:.1,carveReactionFullRoll:.64,carveSquatMax:.065,carveInsideHipDropMax:.085,carveInsideKneeOpen:.45,loadReactionFullPitch:.7,accelHipShiftMax:.08,brakeHipShiftMax:.15,accelSquatMax:.03,brakeSquatMax:.09,headStabilizationFactor:.65,headStabilizationMax:.55,armAsymmetrySplay:.03,armAsymmetryForward:.035,armBrakeForward:.055,armAccelBack:.035,armLoadSplay:.03,armCarveOutsideSplay:.055,armCarveOutsideRise:.045,armCarveInsideTuck:.03,shoulderHalfWidth:.175,upperArmLength:.28,forearmLength:.26,armThickness:.085,armSplay:.115,armHangFraction:.93,handForward:.12,neckLength:.09,helmetRadius:.125,restFootOutboard:.3,restFootBack:.05,restHipHeight:.8,restHipShift:.1,restWheelLean:.1,crouchHipDrop:.17,tuckHipDrop:.16,tuckTorsoPitch:.5,tuckTorsoPitchMax:.95,squatMax:.3,tuckArmBack:.115,tuckArmSplay:.025,tuckArmDrop:.045,tuckHeadStabilization:.92,tuckHeadStabilizationMax:.45,airArmSplay:.045,airArmRise:.03,pedalStrikeFootLift:.022,airHeadDown:.2,wobbleHipDrop:.055,wobbleArmSplay:.075,wobbleArmRise:.03,wobbleFootAdjust:.025,wobbleHipCounterYaw:.55,wobbleWheelRock:2.2,wobbleTorsoLevel:.65,crashArmSplay:.13,crashArmRise:.16,crashFootOutboard:.24},sf={gravity:9.81},Q={maxLeanPitch:.5,leanResponseSeconds:.14,leanRateLimit:3,leanToAccel:16,brakeAuthority:22,dragCoefficient:.032,stoppedSpeed:.05,reverseEntrySpeed:.6,reverseEngageSeconds:.35,maxReverseSpeed:2.2,yawRateLow:2.4,yawRateHigh:.85,carveSpeed:9,maxLateralG:.75,rollResponseSeconds:.11,riderUpperBodyRollFactor:.18,maxRiderPitch:.7,riderCruisePitchFactor:.18,riderAccelerationPitchGain:.1,riderPitchResponseSeconds:.08,wheelPitchFactor:.45,riderLookIntoTurn:.42,riderLookResponseSeconds:.16,riderSlopeLeanFactor:1,riderSlopeLeanFullSpeed:1.5,restDelaySeconds:.75,restResponseSeconds:.3,restReleaseSeconds:.12,hopCompressSeconds:.09,hopLaunchSpeed:3,hopChargeSeconds:.4,hopChargeHeightBonus:.4,hopSuspensionRebound:.35,suspensionPreload:.055,airYawFactor:.25,airDragFactor:.18,airPitchAuthority:.16,airPitchResponseSeconds:.18,airTuck:.3,crouchHeldAmount:.55,crouchResponseSeconds:.07,landingAbsorbSeconds:.3,landingImpactReference:5,landingMisalignReference:.8,landingSurfaceWeight:.3,landingRoughnessReference:.04,landingHeavyScore:1,landingWobbleScore:1.8,landingCrashScore:2.8,landingSpeedLossPerScore:.2,landingMaxSpeedLoss:.75,landingStateSeconds:.18,landingSuspensionKick:.16,pedalStrikeDecel:38,pedalStrikeJolt:.22,pedalStrikeGraceAngle:.055,pedalStrikeReferenceDepth:.12,wobbleFrequencyHz:4,wobbleMaxYaw:.1,wobbleCrashEnergy:1,wobbleDampingAggressive:.55,wobbleDampingSmooth:2.4,wobbleSmoothThrottle:.35,wobbleSmoothSteerSeconds:.3,wobbleSmoothResponseSeconds:.25,wobbleFootCorrectionStart:.3,wobbleFootCorrectionDamping:1,wobbleFootCorrectionResponseSeconds:.12,wobbleMasterGain:0,wobbleComfortSpeed:15.5,wobbleSpeedGain:.35,wobbleSurfaceGain:.012,wobbleSteerReversalGain:1.1,wobbleReversalMemorySeconds:.45,wobblePedalStrikeGain:2.5,wobbleCurbGain:3,wobbleLandingGain:.55,wobbleStateEnergy:.35,powerComfortSpeed:11.5,powerLimitSpeed:17,powerSlopeLoad:4,powerAccelLoad:.25,powerLandingLoad:.55,powerLandingDecaySeconds:1.4,powerResponseSeconds:.55,powerReliefSeconds:1.2,powerNoticeLoad:.6,powerWarnLoad:.82,powerTiltBackLoad:1,powerTiltBackRelease:.8,tiltBackLeanBack:.06,tiltBackEngageSeconds:.35,tiltBackReleaseSeconds:.5,tiltBackPedalPitch:.18,crashWheelDecel:2.2,obstacleCrashSpeed:3.5,crashWheelFallSeconds:.85,crashWheelLean:1.45,crashRecoverEarliestSeconds:2.5,crashRecoverAutoSeconds:3.6,crashRecoverSpeedFactor:.35,crashSafeDelaySeconds:.8,crashSafeWobbleCeiling:.25,crashInvulnerableSeconds:.9,crashRecoverBlendSeconds:.45,crashStepOffSpeed:3,crashRunOutSpeed:9,crashSeparationForward:2.1,crashSeparationLateral:1.3,crashSeparationSeconds:.85,crashTumbleHz:2,crashTumbleDampSeconds:.55,crashTumbleRoll:.45,crashTumblePitch:.16,crashTumbleBounce:.09,crashRiderDrop:.12,crashRiderTumble:.28,crashSideFallDrop:.1,crashSideFallRoll:1.35},Be={sunElevation:.96,sunAzimuth:2.36,sunDistance:60,sunColour:16774374,sunIntensity:2.6,skyColour:10339562,groundBounceColour:11709335,hemisphereIntensity:1.1,horizonColour:12375790,skyTextureWidth:1024,skyTextureHeight:512,skyZenithColour:5804760,skyGradientExponent:.62,skySunColour:16773852,skySunCoreSpread:.055,skySunGlowSpread:.34,skySunGlowStrength:.75,skySunHorizonWarmth:.3,skySunHorizonSpread:1.05,skySunHorizonPeak:.2,skyCloudLitColour:16645887,skyCloudShadeColour:12175578,skyCloudCoverage:.46,skyCloudSoftness:.26,skyCloudScale:.55,skyCloudHorizonFade:.045,fogNear:120,fogFar:470,exposure:1,shadowMapSize:2048,shadowRadius:30,shadowBias:-5e-4,shadowNormalBias:.02},Ze={fovAtRest:1.13,fovAtSpeed:1.36,distanceAtRest:4.2,distanceAtSpeed:6,targetHeightOffset:.35,speedReference:15,armHeight:1.95,lookAheadSeconds:.22,lookAheadMax:3.6,lookAheadResponseSeconds:.35,distanceResponseSeconds:.55,fovResponseSeconds:.7,yawLagAtRest:.42,yawLagAtSpeed:.14,bankFactor:.15,bankMaxRadians:.1,bankResponseSeconds:.18,obstructionRadius:.35,obstructionMinDistance:1.6,obstructionPullInSeconds:.05,obstructionRestoreSeconds:.55,airHeightFollow:.35,airHeightResponseSeconds:.1,landingRestoreSeconds:.45,landingDipPerImpact:.028,landingDipMax:.14,landingDipRecoverSeconds:.42,crashDistance:8.6,crashArmHeight:2.35,crashFov:1.3,crashFrameSeconds:.45,crashRestoreSeconds:.35,near:.1,far:500},Lt={curbThreshold:.04,stepUpPedalFactor:1.35,curbImpactPerMetre:20,wallScrubDecel:42,feelerDistance:.55,dropLaunchThreshold:.05,suspensionFrequencyHz:2.6,suspensionDamping:.42,groundTiltResponseSeconds:.09,maxGroundTilt:.6,groundTiltPitchFollow:0,groundTiltRollFollow:.25,rollingResistanceScale:1,surroundMargin:480,surroundCellSize:8,surroundBackstopHalfExtent:340,surroundBackstopDrop:.08},Ft={shell:4870232,tyre:2303015,pad:2829617,pedal:10133672,accent:2060256,headlight:16773328,taillight:16720435,statusNormal:3134315,statusNotice:16765503,statusWarn:16747039,statusCritical:16723759,riderSuit:4672339,riderPanel:3112936,riderHelmet:5264734,riderVisor:2237739,riderBoot:3356220,ghost:9426175,gate:3112936,gatePassed:1719398,gateFinish:16765503},Je={sparkCount:96,sparkRatePerSecond:150,sparkLifeSeconds:.4,sparkSpeed:2.4,sparkSpread:.55,sparkGravity:11,sparkSize:.09,sparkColour:16766089,sparkIntensity:2,sparkFadeColour:3805700,dustCount:96,dustPerLanding:22,dustLifeSeconds:.62,dustSpeed:2.2,dustSpread:.9,dustGravity:2.2,dustSize:.14,particleColours:{dust:12562069,grassClipping:7311196,grit:10130828,splinter:9073752},statusLightWidth:.1,statusLightHeight:.028,statusLightDepth:.012,statusCalmIntensity:.55,statusAlarmIntensity:2.6,statusNoticeHz:1.6,statusCriticalHz:6,statusPulseDepth:.55,statusBootIntensity:5,statusBootColour:13625855},N={bedTrim:.55,transientTrim:.85,limiterThresholdDb:-6,limiterKneeDb:6,limiterRatio:12,limiterAttackSeconds:.004,limiterReleaseSeconds:.18,paramGlideSeconds:.018,modelStepSeconds:1/60,speedReference:15,motorPolePairs:15,motorIdleHz:22,motorMaxHz:240,motorSingHarmonic:3,motorAirHarmonic:6,motorIdleLevel:0,motorLoadLevel:0,motorSingLevel:0,motorSingCurve:.7,motorSingIdleShare:.55,motorAirLevel:0,motorAirCurve:1.6,motorCutoffAtRest:220,motorCutoffAtSpeed:1500,motorLoadBrighten:2.2,motorFilterQ:.7,motorResponseSeconds:.07,airSpinFactor:1.28,airDriveFactor:.45,regenHarmonic:2,regenLevel:0,regenResonance:3,regenCutoffFactor:.45,regenResponseSeconds:.1,windOnsetSpeed:9,windLevel:.17,windExponent:1.7,windCutoffAtRest:240,windCutoffAtSpeed:1200,windQ:.4,windResponseSeconds:.22,windAirBoost:1.3,tyreLevel:.44,tyreReferenceSpeed:9,tyreStandstillLevel:0,tyreCrossfadeSeconds:.2,tyreCutoffRise:1.25,tyreGrainGain:.85,tyreGrainReference:.35,tyreResponseSeconds:.05,tyreVoices:{"tyre-smooth":{centreHz:1750,q:.6,level:.15,lowHz:180,lowLevel:.16,grain:.1,sample:0,sampleRate:1,toko:.55},"tyre-gravel":{centreHz:1380,q:.35,level:.19,lowHz:260,lowLevel:.42,grain:1,sample:1,sampleRate:1.12,toko:0},"tyre-coarse":{centreHz:1080,q:.5,level:.26,lowHz:240,lowLevel:.34,grain:.45,sample:0,sampleRate:1,toko:.45},"tyre-brick":{centreHz:850,q:1.1,level:.21,lowHz:220,lowLevel:.3,grain:.35,sample:0,sampleRate:1,toko:.35},"tyre-grass":{centreHz:640,q:.4,level:.13,lowHz:140,lowLevel:.32,grain:.5,sample:0,sampleRate:1,toko:0},"tyre-dirt":{centreHz:490,q:.5,level:.13,lowHz:200,lowLevel:.36,grain:.55,sample:1,sampleRate:1,toko:0},"tyre-wood":{centreHz:330,q:2.4,level:.3,lowHz:130,lowLevel:.48,grain:.75,sample:0,sampleRate:1,toko:0}},tyreSampleRateAtRest:.94,tyreSampleRateAtSpeed:1.1,tyreSampleTrim:3,windSampleTrim:2.3,tokoSampleTrim:1.6,scrapeLevel:.1,scrapeCentreHz:1100,scrapeQ:3,scrapeFullOverlap:.04,scrapeReferenceSpeed:6,scrapeResponseSeconds:.03,scrapeRingLevel:.08,scrapeRingHz:880,beepLevel:0,beepSeconds:.075,beepAttackSeconds:.009,beepReleaseSeconds:.034,beepCutoffHz:2600,beepDoubleGapSeconds:.105,noticeHz:784,noticePeriodSeconds:1.3,noticeLevel:.16,warnHz:1046,warnPeriodSeconds:.6,warnLevel:.25,tiltBackHz:1320,tiltBackPeriodSeconds:.3,tiltBackLevel:.29,wobbleToneLevel:.22,wobbleToneLowHz:140,wobbleToneHighHz:300,wobbleToneResponseSeconds:.12,hopLevel:.2,hopThumpFromHz:150,hopThumpToHz:60,hopThumpSeconds:.14,hopNoiseHz:900,hopNoiseSeconds:.09,landingLevel:.36,landingThumpFromHz:190,landingThumpToHz:55,landingThumpSeconds:.2,landingNoiseSeconds:.16,landingMinScale:.28,curbLevel:.46,curbThumpFromHz:260,curbThumpToHz:80,curbThumpSeconds:.12,curbNoiseHz:1800,curbNoiseSeconds:.07,curbImpactReference:6,impactRetriggerSeconds:.14,crashLevel:.8,crashThumpFromHz:130,crashThumpToHz:38,crashThumpSeconds:.42,crashNoiseHz:1200,crashNoiseSeconds:.55,crashSampleTrim:.85,crashSampleRateSpread:.05,recoverLevel:0,recoverLowHz:660,recoverHighHz:990,recoverSeconds:.2,duckAttackSeconds:.03,duckReleaseSeconds:.3,duckNotice:.2,duckWarn:.34,duckTiltBack:.54,duckHop:.1,duckLanding:.2,duckCurb:.26,duckCrash:.55,duckCrashReleaseSeconds:1.1,crashedBedGain:.3,crashedBedSeconds:.18},pr={hz:120,maxStepsPerFrame:5,firstFrameProbeMs:900,fallbackIntervalMs:16},rf={maxPixelRatio:2},Xn={actionBufferSeconds:.15,gamepadStickDeadZone:.18,gamepadTriggerThreshold:.08,menuStickThreshold:.5,menuRepeatDelaySeconds:.42,menuRepeatIntervalSeconds:.14,touchStickTravelPx:84,touchStickDeadZonePx:5,touchStickCurve:1.35},kc={overlayRefreshHz:5,sampleWindow:240},Aa={orbitRate:.22,distanceFactor:.72,heightFactor:1.9,targetHeightFactor:.72},qe={startRunupMetres:18,gateWidthMargin:2.4,gateHalfDepth:1.8,gateHalfHeight:1.6,ghostSampleHz:20,ghostMaxSeconds:420,ghostPositionStep:.01,ghostAngleStep:.005,ghostOpacity:.42,splitHoldSeconds:2.6,resultsDelaySeconds:1.4,gateDrawnMaxHalfWidth:10,gateWideMarkerHalfWidth:5.5,gateFlareSeconds:.4,gateFlareIntensity:5,recordEpsilonSeconds:.01},F_=Ht({WHEEL:at,RIDER:ss,RIDER_BLOCKOUT:ce,PHYSICS:sf,EUC:Q,TERRAIN:Lt,LIGHTING:Be,CAMERA:Ze,INSPECTION_CAMERA:Aa,BLOCKOUT_COLOURS:Ft,FX:Je,AUDIO:N,CHALLENGE:qe,SIMULATION:pr,RENDER:rf,INPUT:Xn,DIAGNOSTICS:kc,SURFACES:Qn,MATERIALS:oc}),U_=Ht([{path:"EUC.maxLeanPitch",group:"Ride — power",label:"Force lean",unit:"rad",min:.1,max:.8,step:.005,note:"Force-demand lean at full throttle. Drive force is proportional to its sine, so raising this raises acceleration and top speed together. The rendered rider pose has its own transient controls below."},{path:"EUC.leanToAccel",group:"Ride — power",label:"Drive authority",unit:"m/s²",min:4,max:40,step:.25,note:"Acceleration per unit of sin(lean). With drag fixed, this sets both how hard the wheel pulls away and where it tops out."},{path:"EUC.brakeAuthority",group:"Ride — power",label:"Brake authority",unit:"m/s²",min:4,max:50,step:.25,note:"Used instead of drive authority whenever lean opposes travel. Keep it above drive authority: a wheel stops far harder than it pulls."},{path:"EUC.leanResponseSeconds",group:"Ride — power",label:"Lean response",unit:"s",min:.02,max:.6,step:.005,note:"Time constant for lean chasing the input. The single strongest control over whether the game feels crisp or soggy."},{path:"EUC.leanRateLimit",group:"Ride — power",label:"Lean rate limit",unit:"rad/s",min:.5,max:12,step:.1,note:"Ceiling on how fast lean may change. Shapes the onset of a slammed key without slowing an ordinary input."},{path:"EUC.maxRiderPitch",group:"Ride — power",label:"Rider pitch limit",unit:"rad",min:.1,max:.8,step:.005,note:"Largest fore-aft action pose, on top of the relaxed torso pitch. Launch and hard braking may reach it; steady cruising should not."},{path:"EUC.riderCruisePitchFactor",group:"Ride — power",label:"Cruise lean",unit:"×",min:0,max:1,step:.01,note:"Fraction of force lean retained in the steady visual pose. Lower values bring the rider nearer upright once acceleration tapers."},{path:"EUC.riderAccelerationPitchGain",group:"Ride — power",label:"Accel lean gain",unit:"rad/(m/s²)",min:0,max:.12,step:.002,note:"Extra rendered pitch per unit of active acceleration or braking. This is what makes the strong pose transient instead of speed-held."},{path:"EUC.riderPitchResponseSeconds",group:"Ride — power",label:"Rider pitch response",unit:"s",min:.02,max:.6,step:.005,note:"Time constant for the rendered fore-aft pose. It does not change the force curve or the user-approved wheel/lower-body side angle."},{path:"EUC.riderSlopeLeanFactor",group:"Ride — power",label:"Slope lean",unit:"×",min:0,max:2,step:.05,note:"Rider lean into the hill per radian of gradient. 1.0 is the physical equilibrium for holding a slope; 0 stands them bolt upright on every hill."},{path:"EUC.dragCoefficient",group:"Ride — power",label:"Drag",unit:"1/m",min:.005,max:.15,step:.001,note:"Quadratic drag. Top speed emerges from this against drive authority rather than being clamped, so lowering it raises top speed without touching how the wheel launches."},{path:"EUC.hopLaunchSpeed",group:"Ride — hop & air",label:"Hop launch",unit:"m/s",min:.5,max:6,step:.05,note:"Vertical speed at take-off, uncharged. Height is v²/2g, so 3.0 m/s is a 0.46 m hop and 0.61 s of air. Judge it by the air time, not the height: that is what the chase camera actually shows."},{path:"EUC.hopCompressSeconds",group:"Ride — hop & air",label:"Compression",unit:"s",min:0,max:.35,step:.005,note:"Dwell between the press and the impulse, during which the rider crouches and the suspension loads. Zero fires instantly and looks like a teleport; too long and the hop stops answering the key."},{path:"EUC.hopChargeHeightBonus",group:"Ride — hop & air",label:"Crouch bonus",unit:"×height",min:0,max:1.2,step:.02,note:"Extra height from holding Shift before the press. This is the whole skill in the hop — zero makes every hop identical."},{path:"EUC.airYawFactor",group:"Ride — hop & air",label:"Air steering",unit:"×",min:0,max:1,step:.01,note:"Fraction of ground yaw authority in the air. It turns the wheel, never the travel direction, so it can only fix your alignment for the landing — which is exactly what it is for."},{path:"EUC.pedalStrikeDecel",group:"Ride — hop & air",label:"Pedal scrape",unit:"m/s²/rad",min:0,max:150,step:1,note:"Speed cost while a pedal is on the ground, per radian past the clearance angle. Clearance itself is derived from the wheel, not set here: a full-lock carve on pavement is meant to scrape."},{path:"EUC.landingImpactReference",group:"Ride — landing",label:"Impact reference",unit:"m/s",min:1,max:15,step:.1,note:"Closing speed along the surface normal that scores a full point. Lower it to make landings punishing; raise it to make them forgiving."},{path:"EUC.landingSpeedLossPerScore",group:"Ride — landing",label:"Landing cost",unit:"×/point",min:0,max:.6,step:.01,note:"Fraction of speed lost per point of score above clean. The misaligned part of the velocity is already scrubbed before this, so a sideways landing is paid for twice."},{path:"CAMERA.airHeightFollow",group:"Ride — landing",label:"Camera air follow",unit:"×",min:0,max:1,step:.05,note:"How much of the hop the camera takes with the rider. 1 is the pre-M5 behaviour and throws the horizon upward; 0 pins the camera to the take-off height and lets the rider leave the frame."},{path:"CAMERA.landingDipMax",group:"Ride — landing",label:"Landing dip",unit:"m",min:0,max:.4,step:.01,note:"Ceiling on the camera drop a landing produces. One smooth decaying impulse, never oscillation. Set it to zero if any camera motion on impact is unwelcome."},{path:"EUC.wobbleDampingAggressive",group:"Ride — wobble",label:"Passive damping",unit:"1/s",min:.05,max:3,step:.05,note:"Baseline damping while the player is still hard on the throttle or steering. Active foot correction and easing-off damping stack on top."},{path:"EUC.wobbleDampingSmooth",group:"Ride — wobble",label:"Damping (easing off)",unit:"1/s",min:.1,max:8,step:.1,note:"Extra input-driven damping once the rider eases off and steers smoothly. It stacks with Cool Rider’s automatic foot correction."},{path:"EUC.wobbleFootCorrectionDamping",group:"Ride — wobble",label:"Foot correction",unit:"1/s",min:0,max:8,step:.1,note:"Automatic damping from Cool Rider adjusting their feet after a mistake. Zero removes the experienced-rider assist; easing still works."},{path:"EUC.wobbleMaxYaw",group:"Ride — wobble",label:"Wobble amplitude",unit:"rad",min:0,max:.3,step:.005,note:"Yaw deviation at the crash threshold. It is added to the direction the wheel actually travels, so this is how far the line weaves — not a decoration on top of a straight one."},{path:"EUC.wobbleFrequencyHz",group:"Ride — wobble",label:"Wobble rate",unit:"Hz",min:1,max:9,step:.1,note:"Oscillation frequency. Real speed wobble is 3-5 Hz. Slower reads as a swerve the rider chose; faster disappears into the camera lag."},{path:"EUC.wobbleSurfaceGain",group:"Ride — wobble",label:"Surface injection",unit:"/s per m/s",min:0,max:.15,step:.005,note:"Wobble fed by the surface, per unit of its own wobble injection per m/s ridden. Pavement injects nothing at any speed whatever this says; gravel is the surface to judge it on."},{path:"EUC.wobbleSteerReversalGain",group:"Ride — wobble",label:"Reversal injection",unit:"/rad",min:0,max:3,step:.05,note:"Wobble injected when the steering flips, per radian of lean thrown away at full speed. Easing through neutral first costs almost nothing, which is the skill this rewards."},{path:"EUC.wobbleMasterGain",group:"Ride — wobble",label:"Wobble enabled",unit:"0..1",min:0,max:1,step:.05,note:"Master gate on every wobble energy source. Zero by owner decision (2026-08-02): the mechanic works but is not fun yet, and stays off until a non-disruptive redesign. One is the full QA-hardened M6 behaviour; between scales every injection."},{path:"EUC.wobbleReversalMemorySeconds",group:"Ride — wobble",label:"Reversal memory",unit:"s",min:.05,max:1.5,step:.05,note:"How long a released carve stays chargeable to a reversal. Human fingers take 80-200 ms to get from one key to the other; shorter than that here and only a test script can ever trigger the reversal."},{path:"EUC.powerComfortSpeed",group:"Ride — power",label:"Power comfort speed",unit:"m/s",min:4,max:18,step:.25,note:"Speed at which the wheel starts spending its headroom. Lower it and the wheel warns earlier; take it under about 8 and tilt-back starts reaching into ordinary flat riding."},{path:"EUC.powerSlopeLoad",group:"Ride — power",label:"Climb load",unit:"×",min:0,max:5,step:.05,note:"Load per unit of gradient while climbing. This is what makes a hill expensive rather than merely slow, and it is the main route to tilt-back on the proving ground."},{path:"EUC.powerTiltBackLoad",group:"Ride — power",label:"Tilt-back at",unit:"load",min:.3,max:1.6,step:.01,note:"Load at which the wheel stops answering the throttle and tilts back. Flat-out on flat pavement produces about 0.66, so anything above that keeps the accepted flat ride untouched."},{path:"EUC.tiltBackLeanBack",group:"Ride — power",label:"Tilt-back strength",unit:"rad",min:0,max:.4,step:.005,note:"How far past neutral tilt-back holds the force lean. Zero merely cuts the throttle; larger values brake against the rider until the load falls."},{path:"EUC.obstacleCrashSpeed",group:"Ride — crash",label:"Obstacle crash speed",unit:"m/s",min:1,max:12,step:.25,note:"Normal speed into a solid face that takes the rider off. Shallow scrapes spend only their into-wall component, so they can stay below this while carrying speed along the obstacle."},{path:"EUC.crashRecoverSpeedFactor",group:"Ride — crash",label:"Recovery speed",unit:"×",min:0,max:1,step:.05,note:"Fraction of the pre-crash speed the rider is restored with. Zero is a full stop, like quick reset; the default keeps the run moving so a crash costs a couple of seconds rather than a re-launch."},{path:"EUC.crashRecoverAutoSeconds",group:"Ride — crash",label:"Auto recovery",unit:"s",min:.4,max:4,step:.05,note:"How long the crash runs before the rider is restored without being asked. Any riding input recovers earlier. Long values are realistic and, per the motion reference, exactly wrong for this game."},{path:"CAMERA.crashDistance",group:"Ride — crash",label:"Crash framing",unit:"m",min:4,max:16,step:.2,note:"Arm length the camera eases to during a crash. It has to hold both the rider and a wheel that is still rolling away from them."},{path:"TERRAIN.rollingResistanceScale",group:"Terrain — surfaces",label:"Surface drag",unit:"×",min:0,max:3,step:.01,note:"Scales every surface’s rolling resistance together. Raise it to make the ground matter more in general before tuning any one surface below."},{path:"SURFACES.pavement.rollingResistance",group:"Terrain — surfaces",label:"Pavement drag",unit:"m/s²",min:0,max:4,step:.01,note:"The reference surface. 0.35 is the single value M2 shipped, so the ride the owner accepted is this slider left alone."},{path:"SURFACES.grass.rollingResistance",group:"Terrain — surfaces",label:"Grass drag",unit:"m/s²",min:0,max:6,step:.05,note:"The other half of the M4 gate. Top speed on grass falls as the square root of what is left of drive authority after this."},{path:"SURFACES.grass.grip",group:"Terrain — surfaces",label:"Grass grip",unit:"×",min:.2,max:1,step:.01,note:"Multiplies the lateral limit on grass. Lower values make the same corner run wider and the wheel lean less — felt, not seen."},{path:"SURFACES.gravel.rollingResistance",group:"Terrain — surfaces",label:"Gravel drag",unit:"m/s²",min:0,max:6,step:.05,note:"Gravel should cost less speed than grass and more grip. Tune the pair against each other, not in isolation."},{path:"SURFACES.gravel.grip",group:"Terrain — surfaces",label:"Gravel grip",unit:"×",min:.2,max:1,step:.01,note:"The loosest surface in the slice. This is what makes the descent ask for wider lines than the climb did."},{path:"SURFACES.grass.roughnessAmplitude",group:"Terrain — surfaces",label:"Grass roughness",unit:"m",min:0,max:.12,step:.002,note:"How far the surface texture pushes the suspension. Visible as the rider working over the ground; zero makes grass feel like a carpet."},{path:"TERRAIN.curbImpactPerMetre",group:"Terrain — contact",label:"Kerb cost",unit:"(m/s)/m",min:0,max:60,step:.5,note:"Speed lost per metre of step mounted. At 20 a 0.15 m kerb costs 3 m/s — enough that hopping it will be worth learning at M5."},{path:"TERRAIN.suspensionFrequencyHz",group:"Terrain — contact",label:"Suspension rate",unit:"Hz",min:.8,max:8,step:.05,note:"The spring’s own frequency. Roughness excites it at speed divided by the surface wavelength, so raising this quietens the ride at speed."},{path:"TERRAIN.suspensionDamping",group:"Terrain — contact",label:"Suspension damping",unit:"ζ",min:.05,max:1.5,step:.01,note:"Damping ratio. Below about 0.3 the wheel pogos after a bump; above 1 it stops moving at all and the surfaces stop reading apart."},{path:"TERRAIN.groundTiltPitchFollow",group:"Terrain — contact",label:"Rig pitch follow",unit:"×",min:0,max:1,step:.05,note:"How much of the hill’s fore-aft tilt the rig visually adopts. Zero is the EUC truth — the firmware holds the pedals level to gravity; 1 is the M4 skateboard behaviour the owner rejected."},{path:"TERRAIN.groundTiltRollFollow",group:"Terrain — contact",label:"Rig roll follow",unit:"×",min:0,max:1,step:.05,note:"How much of a cross-slope the rig visually adopts. A small value keeps the tyre reading grounded on side slopes without laying the rider over with the hill."},{path:"EUC.yawRateLow",group:"Ride — carve",label:"Yaw at rest",unit:"rad/s",min:.2,max:5,step:.05,note:"Turn authority at a standstill. High on purpose — pivoting on the spot is something the wheel is genuinely good at."},{path:"EUC.yawRateHigh",group:"Ride — carve",label:"Yaw at speed",unit:"rad/s",min:.1,max:3,step:.05,note:"Turn authority at and above carve speed. Keep it below yaw at rest or high-speed steering becomes twitchy."},{path:"EUC.carveSpeed",group:"Ride — carve",label:"Carve speed",unit:"m/s",min:2,max:25,step:.25,note:"Speed at which yaw authority has fully decayed to its high-speed value."},{path:"EUC.maxLateralG",group:"Ride — carve",label:"Lateral limit",unit:"g",min:.2,max:1.6,step:.01,note:"The ceiling on cornering acceleration, and the reason a fast turn goes wide. Also sets the lean angle at the limit: atan(this)."},{path:"EUC.rollResponseSeconds",group:"Ride — carve",label:"Roll response",unit:"s",min:.02,max:.6,step:.005,note:"Time constant for the wheel rolling into a carve. Shorter than the lean response so a turn bites immediately."},{path:"EUC.riderUpperBodyRollFactor",group:"Ride — carve",label:"Upper-body roll",unit:"×",min:0,max:1,step:.01,note:"Fraction of wheel roll retained above the hips. A low value lets the bent inside knee and shallow squat keep the shoulders near level."},{path:"EUC.wheelPitchFactor",group:"Ride — carve",label:"Wheel pitch",unit:"×",min:0,max:1,step:.01,note:"Fraction of the rider’s rendered fore-aft pitch that the wheel itself takes. Zero makes acceleration invisible on the wheel."},{path:"LIGHTING.exposure",group:"Lighting",label:"Exposure",unit:"×",min:.3,max:2,step:.01,note:"ACES tone-mapping exposure. Lighting is one coupled system — move this, the sun, and the fill one at a time."},{path:"LIGHTING.sunIntensity",group:"Lighting",label:"Sun",unit:"",min:0,max:6,step:.05,note:"Directional key light. The only shadow caster."},{path:"LIGHTING.hemisphereIntensity",group:"Lighting",label:"Sky fill",unit:"",min:0,max:3,step:.05,note:"Hemisphere fill. Too low and undersides become voids; too high and nothing reads as sitting on the ground."},{path:"EUC.riderLookIntoTurn",group:"Ride — carve",label:"Look into turn",unit:"rad",min:0,max:1,step:.01,note:"How far the head turns toward the corner at full lock. Zero makes the rider stare straight ahead through every carve."},{path:"CAMERA.distanceAtRest",group:"Camera",label:"Arm at rest",unit:"m",min:2,max:10,step:.05,note:"Spring-arm length at a standstill. Together with the value below this is half the speed expression; the other half is field of view."},{path:"CAMERA.distanceAtSpeed",group:"Camera",label:"Arm at speed",unit:"m",min:2,max:14,step:.05,note:"Spring-arm length at the reference speed. Keep it above the rest value or accelerating pulls the camera in, which reads as braking."},{path:"CAMERA.armHeight",group:"Camera",label:"Arm height",unit:"m",min:.8,max:5,step:.05,note:"Height of the camera above the contact patch. Raising it looks further down onto the ground; lowering it exaggerates speed and hides terrain, which the priority order says loses."},{path:"CAMERA.fovAtRest",group:"Camera",label:"FOV at rest",unit:"rad",min:.6,max:1.8,step:.01,note:"Vertical field of view at a standstill. Eased toward the value below with speed — the strongest speed cue available, and the easiest one to make somebody ill with."},{path:"CAMERA.fovAtSpeed",group:"Camera",label:"FOV at speed",unit:"rad",min:.6,max:2,step:.01,note:"Vertical field of view at the reference speed. A wide gap between the two is the strongest speed sensation and the fastest route to motion sickness; move it a little at a time."},{path:"CAMERA.lookAheadSeconds",group:"Camera",label:"Look-ahead",unit:"s",min:0,max:.8,step:.01,note:'How far ahead the camera aims, in seconds of travel. This is what answers "can I see where I am going"; zero aims at the rider.'},{path:"CAMERA.yawLagAtRest",group:"Camera",label:"Yaw lag at rest",unit:"s",min:.02,max:1.2,step:.01,note:"Follow time constant at a standstill. Long on purpose: the wheel pivots at 2.4 rad/s down there and a tight camera would whip."},{path:"CAMERA.yawLagAtSpeed",group:"Camera",label:"Yaw lag at speed",unit:"s",min:.02,max:1.2,step:.01,note:"Follow time constant at the reference speed. Keep it below the rest value — locked-in at speed, forgiving when manoeuvring."},{path:"CAMERA.bankFactor",group:"Camera",label:"Bank",unit:"×",min:0,max:.6,step:.01,note:"Camera roll as a fraction of the wheel’s lean, into the corner and capped. Raising it tilts the horizon, which costs terrain readability — and uncapped bank is a motion-sickness trap."},{path:"INSPECTION_CAMERA.orbitRate",group:"Camera",label:"Inspection orbit",unit:"rad/s",min:0,max:1.5,step:.01,note:"Rate of the diagnostic orbit reached with C. Zero holds a fixed angle for a screenshot. Never an acceptance view."},{path:"SIMULATION.maxStepsPerFrame",group:"Loop",label:"Max catch-up steps",unit:"steps",min:1,max:12,step:1,note:"Catch-up ceiling per frame. Lower it to see the loop deliberately drop time instead of spiralling."},{path:"RENDER.maxPixelRatio",group:"Render",label:"Pixel ratio cap",unit:"×",min:.5,max:3,step:.05,note:"Device-pixel ceiling. Changing only this must not be treated as a viewport change."},{path:"AUDIO.bedTrim",group:"Audio",label:"Ride bed trim",unit:"×",min:0,max:1,step:.01,note:"Everything the wheel and the world make — motor, wind, tyre, scrape — against warnings and impacts, which are trimmed separately. Lower it if the beeps have to shout."},{path:"AUDIO.motorPolePairs",group:"Audio",label:"Motor pole pairs",unit:"",min:1,max:30,step:1,note:"Multiplies wheel rotation to reach the electrical fundamental. The single number that decides whether it sounds like a hub motor or like an engine. 15 puts top speed near 143 Hz, where a real wheel sits."},{path:"AUDIO.motorIdleLevel",group:"Audio",label:"Motor idle hum",unit:"",min:0,max:.4,step:.01,note:"The fundamental at zero load — the parked hum. Zero since rule 5: a real EUC is nearly silent, and the owner asked for that silence. 0.09 restores the measured second-pass hum."},{path:"AUDIO.motorLoadLevel",group:"Audio",label:"Motor load response",unit:"",min:0,max:.8,step:.01,note:"How much louder the fundamental gets between coasting and full demand. This is what makes the motor answer the throttle rather than merely track the speedometer."},{path:"AUDIO.motorSingLevel",group:"Audio",label:"Motor third harmonic",unit:"",min:0,max:.6,step:.01,note:"The exact third harmonic at the reference speed — the body of the motor. Raise it for a more present machine; it cannot growl, because it is locked to the fundamental rather than detuned against it."},{path:"AUDIO.motorAirLevel",group:"Audio",label:"Motor sixth harmonic",unit:"",min:0,max:.6,step:.01,note:"The top of the turbine, arriving late so that it means speed rather than motion. This is the partial that says 15 m/s is not 8 m/s from inside the machine, as the wind says it from outside."},{path:"AUDIO.regenLevel",group:"Audio",label:"Regen braking",unit:"",min:0,max:.6,step:.01,note:"The octave partial under the braking filter sweep. It is what makes slowing down a different event from speeding up."},{path:"AUDIO.motorLoadBrighten",group:"Audio",label:"Load brightness",unit:"×",min:1,max:5,step:.05,note:"How far full load opens the motor filter. This is where working hard is heard — an electric motor under load brightens, it does not chug, and a modulated sub-octave here is what a lawnmower sounds like."},{path:"AUDIO.windLevel",group:"Audio",label:"Wind",unit:"",min:0,max:.8,step:.01,note:'The approved howl loop, rising faster than linearly with speed — with the motor silent this is the whole speed voice. The owner set its ceiling by ear: "not too loud or it will be annoying".'},{path:"AUDIO.tyreLevel",group:"Audio",label:"Tyre",unit:"",min:0,max:.9,step:.01,note:"Master level over the per-surface voices. Raise it to make surface changes more obvious; the relative voices keep their proportions."},{path:"AUDIO.beepLevel",group:"Audio",label:"Warning beeps",unit:"",min:0,max:1,step:.05,note:"Master over the whole power-ladder beep set, silenced by owner decision — arcade, not sim; the HUD light still climbs the ladder. 1 restores all three rungs exactly as they shipped in the second pass."},{path:"AUDIO.tiltBackLevel",group:"Audio",label:"Tilt-back beep",unit:"",min:0,max:.8,step:.01,note:"The top rung of the power ladder, under the Warning beeps master. It should be unmissable without being painful — if it needs to go above about 0.5, duck harder instead."},{path:"AUDIO.duckTiltBack",group:"Audio",label:"Tilt-back duck",unit:"",min:0,max:.9,step:.01,note:'How far the ride bed drops while the top warning sounds. This, not the beep level, is the real answer to "is the right thing the loudest thing?"'}]);function N_(i,e){let t=i;for(const n of e.split(".")){if(t===null||typeof t!="object")return;t=t[n]}return typeof t=="number"?t:void 0}class k_{specs;defaults=new Map;overrideValues=new Map;listeners=new Set;constructor(e=U_,t=F_){this.specs=e;for(const n of e){const s=N_(t,n.path);if(s===void 0||!Number.isFinite(s))throw new Error(`Tunable "${n.path}" does not resolve to a finite number in the tuning root.`);this.defaults.set(n.path,s)}}views(){return this.specs.map(e=>({spec:e,value:this.get(e.path),defaultValue:this.defaults.get(e.path)??0,overridden:this.overrideValues.has(e.path)}))}specFor(e){return this.specs.find(t=>t.path===e)}get(e){const t=this.overrideValues.get(e);if(t!==void 0)return t;const n=this.defaults.get(e);if(n===void 0)throw new Error(`"${e}" is not a registered tunable.`);return n}defaultOf(e){const t=this.defaults.get(e);if(t===void 0)throw new Error(`"${e}" is not a registered tunable.`);return t}set(e,t){const n=this.specFor(e);if(!n)throw new Error(`"${e}" is not a registered tunable.`);if(!Number.isFinite(t))throw new Error(`"${e}" was given a non-finite value.`);const s=Math.min(n.max,Math.max(n.min,t)),r=this.get(e);return s===this.defaultOf(e)?this.overrideValues.delete(e):this.overrideValues.set(e,s),s!==r&&this.emit(e,s),s}reset(e){if(e!==void 0){if(!this.overrideValues.has(e))return;this.overrideValues.delete(e),this.emit(e,this.get(e));return}const t=[...this.overrideValues.keys()];this.overrideValues.clear();for(const n of t)this.emit(n,this.get(n))}overrides(){const e={};for(const[t,n]of this.overrideValues)e[t]=n;return e}overrideCount(){return this.overrideValues.size}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear(),this.overrideValues.clear()}emit(e,t){for(const n of[...this.listeners])n(e,t)}}function gt(i,e,t){return i<e?e:i>t?t:i}function wt(i){return gt(i,0,1)}function Mt(i,e,t){return i+(e-i)*t}function Xe(i,e,t,n,s){if(s<=0)return i;const r=t>0?1-Math.exp(-s/t):1,a=n*s,o=gt((e-i)*r,-a,a);return i+o}function Wa(i){const e=(i+Math.PI)%(Math.PI*2);return(e<=0?e+Math.PI*2:e)-Math.PI}function O_(i){return i>0?1:i<0?-1:0}const z_=.22,B_=1,ea=3;function H_(i){const e=new It;if(e.name="checkpoint-gates",e.visible=!1,i.length===0)return{group:e,gates:0,drawCalls:0,triangles:0,get visible(){return e.visible},setVisible(m){e.visible=m},setProgress(){},flare(){},step(){},dispose(){e.removeFromParent()}};const t=new Tn(1,1,1);t.translate(0,.5,0);const n=t.getAttribute("position").count;t.setAttribute("color",new Qe(new Array(n*3).fill(1),3));const s=(t.getIndex()?.count??n)/3,r=new Za({color:16777215,vertexColors:!0}),a=i.length*ea,o=new Bd(t,r,a);o.name="checkpoint-gate-bars",o.castShadow=!1,o.receiveShadow=!1,o.raycast=()=>{};const l=[],c=new Map,u=new rt,d=new rt,h=new rt,f=new I,v=new Sn,_=new I,p=new I(0,1,0);i.forEach((m,x)=>{const A=m.halfExtents.x,C=m.halfExtents.y,L=A<=qe.gateDrawnMaxHalfWidth,F=L?A:qe.gateWideMarkerHalfWidth,z=m.centre.y-C,D=C*2,H=z_,G=C*B_;f.set(m.centre.x,z,m.centre.z),v.setFromAxisAngle(p,m.headingY),_.setScalar(1),h.compose(f,v,_);const K=x*ea,ne=[];for(const j of[1,-1]){L?(d.makeScale(H,D+G,H),d.setPosition(j*(A+H/2),-G,0)):(d.makeScale(0,0,0),d.setPosition(0,D,0)),u.multiplyMatrices(h,d);const ie=j>0?0:1;o.setMatrixAt(K+ie,u),ne[ie]=u.clone()}d.makeScale(F*2+H*2,H,H),d.setPosition(0,D,0),u.multiplyMatrices(h,d),o.setMatrixAt(K+2,u),ne[2]=u.clone();const X={kind:m.kind,routeIndex:m.routeIndex,firstInstance:K,transforms:ne,flare:0};l.push(X),c.set(m.routeIndex,X)}),o.instanceMatrix.needsUpdate=!0,o.computeBoundingSphere(),e.add(o);const g=new Ve,M=new Ve,T=new Ve;let S=i[0]?.routeIndex??-1;const R=new rt().makeScale(0,0,0),y=()=>{for(const m of l){const x=m.routeIndex===S,A=m.kind==="finish"&&S===l.length,C=x||A||m.flare>0;for(let L=0;L<ea;L+=1)o.setMatrixAt(m.firstInstance+L,C?m.transforms[L]:R)}o.instanceMatrix.needsUpdate=!0},E=()=>{for(const m of l){const x=m.kind==="finish"?Ft.gateFinish:S>=0&&m.routeIndex<S?Ft.gatePassed:Ft.gate;g.setHex(x),m.flare>0?(M.setHex(Je.statusBootColour).multiplyScalar(qe.gateFlareIntensity),T.copy(g).lerp(M,m.flare)):T.copy(g);for(let A=0;A<ea;A+=1)o.setColorAt(m.firstInstance+A,T)}o.instanceColor!==null&&(o.instanceColor.needsUpdate=!0)};return E(),y(),{group:e,gates:l.length,drawCalls:1,triangles:s*a,get visible(){return e.visible},setVisible(m){e.visible=m},setProgress(m){m!==S&&(S=m,E(),y())},flare(m){const x=c.get(m);x!==void 0&&(x.flare=1,E(),y())},step(m){if(m<=0)return;let x=!1;for(const A of l)A.flare<=0||(A.flare=wt(A.flare-m/qe.gateFlareSeconds),x=!0);x&&(E(),y())},dispose(){o.dispose(),t.dispose(),r.dispose(),e.clear(),e.removeFromParent()}}}const au=Math.PI*2,G_=.63,V_=.78,W_=-.81,X_=.59,Y_=.37,q_=1.7,$_=.62,Z_=.38;function Oo(i,e,t,n){if(t<=0||n<=0)return 0;const s=(i*G_+e*V_)/n*au,r=(i*W_+e*X_)/(n*Y_)*au+q_;return t*($_*Math.sin(s)+Z_*Math.sin(r))}function Xa(){return{height:0,normal:{x:0,y:1,z:0},surface:"pavement",offCourse:!1}}function K_(i,e){e.height=i.height,e.normal.x=i.normal.x,e.normal.y=i.normal.y,e.normal.z=i.normal.z,e.surface=i.surface,e.offCourse=i.offCourse}function J_(){const i={};for(const e of nf){const t=Qn[e];i[e]={rollingResistance:t.rollingResistance,grip:t.grip,roughnessAmplitude:t.roughnessAmplitude,roughnessWavelength:t.roughnessWavelength,wobbleInjection:t.wobbleInjection}}return i}function Q_(){return{gravity:sf.gravity,wheelRadius:at.tyreDiameter/2,maxLeanPitch:Q.maxLeanPitch,leanResponseSeconds:Q.leanResponseSeconds,leanRateLimit:Q.leanRateLimit,leanToAccel:Q.leanToAccel,brakeAuthority:Q.brakeAuthority,dragCoefficient:Q.dragCoefficient,stoppedSpeed:Q.stoppedSpeed,reverseEntrySpeed:Q.reverseEntrySpeed,reverseEngageSeconds:Q.reverseEngageSeconds,maxReverseSpeed:Q.maxReverseSpeed,yawRateLow:Q.yawRateLow,yawRateHigh:Q.yawRateHigh,carveSpeed:Q.carveSpeed,maxLateralG:Q.maxLateralG,rollResponseSeconds:Q.rollResponseSeconds,riderUpperBodyRollFactor:Q.riderUpperBodyRollFactor,maxRiderPitch:Q.maxRiderPitch,riderCruisePitchFactor:Q.riderCruisePitchFactor,riderAccelerationPitchGain:Q.riderAccelerationPitchGain,riderPitchResponseSeconds:Q.riderPitchResponseSeconds,wheelPitchFactor:Q.wheelPitchFactor,riderLookIntoTurn:Q.riderLookIntoTurn,riderLookResponseSeconds:Q.riderLookResponseSeconds,riderSlopeLeanFactor:Q.riderSlopeLeanFactor,riderSlopeLeanFullSpeed:Q.riderSlopeLeanFullSpeed,restDelaySeconds:Q.restDelaySeconds,restResponseSeconds:Q.restResponseSeconds,restReleaseSeconds:Q.restReleaseSeconds,rollingResistanceScale:Lt.rollingResistanceScale,curbThreshold:Lt.curbThreshold,maxStepUp:at.pedalHeight*Lt.stepUpPedalFactor,curbImpactPerMetre:Lt.curbImpactPerMetre,wallScrubDecel:Lt.wallScrubDecel,obstacleCrashSpeed:Q.obstacleCrashSpeed,feelerDistance:Lt.feelerDistance,suspensionFrequencyHz:Lt.suspensionFrequencyHz,suspensionDamping:Lt.suspensionDamping,suspensionTravel:at.suspensionTravel,groundTiltResponseSeconds:Lt.groundTiltResponseSeconds,maxGroundTilt:Lt.maxGroundTilt,groundTiltPitchFollow:Lt.groundTiltPitchFollow,groundTiltRollFollow:Lt.groundTiltRollFollow,hopCompressSeconds:Q.hopCompressSeconds,hopLaunchSpeed:Q.hopLaunchSpeed,hopChargeSeconds:Q.hopChargeSeconds,hopChargeHeightBonus:Q.hopChargeHeightBonus,hopSuspensionRebound:Q.hopSuspensionRebound,suspensionPreload:Q.suspensionPreload,airYawFactor:Q.airYawFactor,airDragFactor:Q.airDragFactor,airPitchAuthority:Q.airPitchAuthority,airPitchResponseSeconds:Q.airPitchResponseSeconds,airTuck:Q.airTuck,crouchHeldAmount:Q.crouchHeldAmount,crouchResponseSeconds:Q.crouchResponseSeconds,landingAbsorbSeconds:Q.landingAbsorbSeconds,dropLaunchThreshold:Lt.dropLaunchThreshold,landingImpactReference:Q.landingImpactReference,landingMisalignReference:Q.landingMisalignReference,landingSurfaceWeight:Q.landingSurfaceWeight,landingRoughnessReference:Q.landingRoughnessReference,landingHeavyScore:Q.landingHeavyScore,landingWobbleScore:Q.landingWobbleScore,landingCrashScore:Q.landingCrashScore,landingSpeedLossPerScore:Q.landingSpeedLossPerScore,landingMaxSpeedLoss:Q.landingMaxSpeedLoss,landingStateSeconds:Q.landingStateSeconds,landingSuspensionKick:Q.landingSuspensionKick,pedalHeight:at.pedalHeight,pedalHalfSpan:at.pedalSpan/2,pedalStrikeDecel:Q.pedalStrikeDecel,pedalStrikeGraceAngle:Q.pedalStrikeGraceAngle,pedalStrikeJolt:Q.pedalStrikeJolt,wobbleMasterGain:Q.wobbleMasterGain,wobbleFrequencyHz:Q.wobbleFrequencyHz,wobbleMaxYaw:Q.wobbleMaxYaw,wobbleCrashEnergy:Q.wobbleCrashEnergy,wobbleDampingAggressive:Q.wobbleDampingAggressive,wobbleDampingSmooth:Q.wobbleDampingSmooth,wobbleSmoothThrottle:Q.wobbleSmoothThrottle,wobbleSmoothSteerSeconds:Q.wobbleSmoothSteerSeconds,wobbleSmoothResponseSeconds:Q.wobbleSmoothResponseSeconds,wobbleFootCorrectionStart:Q.wobbleFootCorrectionStart,wobbleFootCorrectionDamping:Q.wobbleFootCorrectionDamping,wobbleFootCorrectionResponseSeconds:Q.wobbleFootCorrectionResponseSeconds,wobbleComfortSpeed:Q.wobbleComfortSpeed,wobbleSpeedGain:Q.wobbleSpeedGain,wobbleSurfaceGain:Q.wobbleSurfaceGain,wobbleSteerReversalGain:Q.wobbleSteerReversalGain,wobbleReversalMemorySeconds:Q.wobbleReversalMemorySeconds,wobblePedalStrikeGain:Q.wobblePedalStrikeGain,wobbleCurbGain:Q.wobbleCurbGain,wobbleLandingGain:Q.wobbleLandingGain,wobbleStateEnergy:Q.wobbleStateEnergy,powerComfortSpeed:Q.powerComfortSpeed,powerLimitSpeed:Q.powerLimitSpeed,powerSlopeLoad:Q.powerSlopeLoad,powerAccelLoad:Q.powerAccelLoad,powerLandingLoad:Q.powerLandingLoad,powerLandingDecaySeconds:Q.powerLandingDecaySeconds,powerResponseSeconds:Q.powerResponseSeconds,powerReliefSeconds:Q.powerReliefSeconds,powerNoticeLoad:Q.powerNoticeLoad,powerWarnLoad:Q.powerWarnLoad,powerTiltBackLoad:Q.powerTiltBackLoad,powerTiltBackRelease:Q.powerTiltBackRelease,tiltBackLeanBack:Q.tiltBackLeanBack,tiltBackEngageSeconds:Q.tiltBackEngageSeconds,tiltBackReleaseSeconds:Q.tiltBackReleaseSeconds,tiltBackPedalPitch:Q.tiltBackPedalPitch,crashWheelDecel:Q.crashWheelDecel,crashWheelFallSeconds:Q.crashWheelFallSeconds,crashWheelLean:Q.crashWheelLean,crashRecoverEarliestSeconds:Q.crashRecoverEarliestSeconds,crashRecoverAutoSeconds:Q.crashRecoverAutoSeconds,crashRecoverSpeedFactor:Q.crashRecoverSpeedFactor,crashSafeDelaySeconds:Q.crashSafeDelaySeconds,crashSafeWobbleCeiling:Q.crashSafeWobbleCeiling,crashInvulnerableSeconds:Q.crashInvulnerableSeconds,crashRecoverBlendSeconds:Q.crashRecoverBlendSeconds,crashStepOffSpeed:Q.crashStepOffSpeed,crashRunOutSpeed:Q.crashRunOutSpeed,crashSeparationForward:Q.crashSeparationForward,crashSeparationLateral:Q.crashSeparationLateral,crashSeparationSeconds:Q.crashSeparationSeconds,crashRiderDrop:Q.crashRiderDrop,crashRiderTumble:Q.crashRiderTumble,crashSideFallDrop:Q.crashSideFallDrop,crashSideFallRoll:Q.crashSideFallRoll,crashTumbleHz:Q.crashTumbleHz,crashTumbleDampSeconds:Q.crashTumbleDampSeconds,crashTumbleRoll:Q.crashTumbleRoll,crashTumblePitch:Q.crashTumblePitch,crashTumbleBounce:Q.crashTumbleBounce}}function Ra(){return{x:0,y:0,z:0,headingY:0,rollAngle:0,riderRoll:0,riderPitch:0,riderLookYaw:0,wheelPitch:0,wheelSpin:0,groundPitch:0,groundRoll:0,suspensionOffset:0,restFactor:0,speed:0,crouch:0,tuck:0,airBlend:0,airHeight:0,groundY:0,pedalStrike:0,wobble:0,wobbleFootCorrection:0,wobbleYaw:0,alert:0,crashBlend:0,crashForward:0,crashLateral:0,crashDrop:0,crashTumble:0,crashRoll:0,wheelCrashLean:0,recoverBlend:1,tiltBack:0}}function zo(i,e){e.x=i.x,e.y=i.y,e.z=i.z,e.headingY=i.headingY,e.rollAngle=i.rollAngle,e.riderRoll=i.riderRoll,e.riderPitch=i.riderPitch,e.riderLookYaw=i.riderLookYaw,e.wheelPitch=i.wheelPitch,e.wheelSpin=i.wheelSpin,e.groundPitch=i.groundPitch,e.groundRoll=i.groundRoll,e.suspensionOffset=i.suspensionOffset,e.restFactor=i.restFactor,e.speed=i.speed,e.crouch=i.crouch,e.tuck=i.tuck,e.airBlend=i.airBlend,e.airHeight=i.airHeight,e.groundY=i.groundY,e.pedalStrike=i.pedalStrike,e.wobble=i.wobble,e.wobbleFootCorrection=i.wobbleFootCorrection,e.wobbleYaw=i.wobbleYaw,e.alert=i.alert,e.crashBlend=i.crashBlend,e.crashForward=i.crashForward,e.crashLateral=i.crashLateral,e.crashDrop=i.crashDrop,e.crashTumble=i.crashTumble,e.crashRoll=i.crashRoll,e.wheelCrashLean=i.wheelCrashLean,e.recoverBlend=i.recoverBlend,e.tiltBack=i.tiltBack}class j_{tuning;surfaces;sampler;spawn;x=0;y=0;z=0;headingY=0;speed=0;leanPitch=0;riderPitch=0;slopeLean=0;riderLookYaw=0;longitudinalAccel=0;rollAngle=0;yawRate=0;lateralAccel=0;lateralLimited=!1;wheelSpin=0;distanceTravelled=0;reversing=!1;reverseHold=0;restHold=0;restFactor=0;grounded=!0;surface="pavement";state="mounted";ground=Xa();probe=Xa();slope=0;slopeAccel=0;rollingResistance=0;lateralLimitG=0;groundPitch=0;groundRoll=0;suspensionOffset=0;suspensionVelocity=0;suspensionCompression=0;curbAhead=0;lastStepUp=0;blocked=!1;collisionImpact=0;offCourse=!1;airborne=!1;verticalVelocity=0;airDirX=0;airDirZ=1;groundY=0;airTime=0;airApex=0;compressTimer=0;compressing=!1;crouchHold=0;hopCharge=0;hopWasHeld=!1;hops=0;crouch=0;tuck=0;absorb=0;airBlend=0;airPitch=0;landingTimer=0;landingQuality="none";landingImpact=0;landingMisalignment=0;landingScore=0;landingSpeedLoss=0;landings=0;pedalStrike=0;pedalClearance=0;justTookOff=!1;justTouchedDown=!1;wobbleEnergy=0;wobblePhase=0;wobbleYaw=0;wobbleRate=0;wobbleSmoothness=0;wobbleFootCorrection=0;steerSign=0;steerHold=0;committedSteerSign=0;committedRoll=0;loadFactor=0;powerStage="normal";landingLoad=0;tiltBack=0;tiltBackLatched=!1;crashing=!1;crashCause="none";crashMotion="none";crashTime=0;crashes=0;crashSpeed=0;crashSide=1;crashBlend=0;wheelCrashLean=0;recoverTimer=0;invulnerableTimer=0;safeX=0;safeZ=0;safeHeading=0;safeHold=0;constructor(e,t={}){this.sampler=e,this.tuning={...Q_(),...t.tuning},this.surfaces={...J_(),...t.surfaces},this.spawn=t.spawn??{position:{x:0,y:0,z:0},headingY:0},this.reset()}setTuning(e){Object.assign(this.tuning,e)}setSurfaceResponse(e,t){const n=this.surfaces[e];n!==void 0&&Object.assign(n,t)}reset(e){e&&(this.spawn=e),this.x=this.spawn.position.x,this.z=this.spawn.position.z,this.headingY=this.spawn.headingY,this.speed=0,this.leanPitch=0,this.riderPitch=0,this.slopeLean=0,this.riderLookYaw=0,this.longitudinalAccel=0,this.rollAngle=0,this.yawRate=0,this.lateralAccel=0,this.lateralLimited=!1,this.wheelSpin=0,this.distanceTravelled=0,this.reversing=!1,this.reverseHold=0,this.restHold=0,this.restFactor=0,this.state="mounted",this.slope=0,this.slopeAccel=0,this.suspensionOffset=0,this.suspensionVelocity=0,this.suspensionCompression=0,this.curbAhead=0,this.lastStepUp=0,this.blocked=!1,this.collisionImpact=0,this.airborne=!1,this.verticalVelocity=0,this.airDirX=Math.sin(this.headingY),this.airDirZ=Math.cos(this.headingY),this.airTime=0,this.airApex=0,this.compressTimer=0,this.compressing=!1,this.crouchHold=0,this.hopCharge=0,this.hopWasHeld=!1,this.hops=0,this.crouch=0,this.tuck=0,this.absorb=0,this.airBlend=0,this.airPitch=0,this.landingTimer=0,this.landingQuality="none",this.landingImpact=0,this.landingMisalignment=0,this.landingScore=0,this.landingSpeedLoss=0,this.landings=0,this.pedalStrike=0,this.justTookOff=!1,this.justTouchedDown=!1,this.crashes=0,this.clearInstability(),this.crashCause="none",this.crashMotion="none",this.safeX=this.x,this.safeZ=this.z,this.safeHeading=this.headingY,this.safeHold=0,this.sampler.sampleGround(this.x,this.z,this.ground),this.y=this.ground.height,this.groundY=this.ground.height,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.grounded=!0,this.pedalClearance=Math.atan2(this.tuning.pedalHeight,this.tuning.pedalHalfSpan);const t=this.surfaceResponse();this.rollingResistance=t.rollingResistance*this.tuning.rollingResistanceScale,this.lateralLimitG=this.tuning.maxLateralG*t.grip,this.writeGroundTilt(1),this.suspensionOffset=Oo(this.x,this.z,t.roughnessAmplitude,t.roughnessWavelength)}step(e,t){if(e<=0)return;const n=this.tuning,s=gt(cu(t.throttle),-1,1),r=gt(cu(t.steer),-1,1);if(this.justTookOff=!1,this.justTouchedDown=!1,this.collisionImpact=0,this.crashing){this.stepCrash(e,s,r,t.crouch);return}const a=this.speed,o=this.surfaceResponse(),l=Math.sin(this.headingY),c=Math.cos(this.headingY);this.stepHop(e,t);const u=this.airborne;this.stepPower(e);const d=Mt(n.maxLeanPitch,-n.tiltBackLeanBack,this.tiltBack);this.leanPitch=Xe(this.leanPitch,u?0:Math.min(s*n.maxLeanPitch,d),n.leanResponseSeconds,n.leanRateLimit,e);const h=Math.sin(this.leanPitch),f=Math.abs(h)<.01,v=!u&&!f&&h*this.speed<0&&Math.abs(this.speed)>n.stoppedSpeed,_=u?0:(v?n.brakeAuthority:n.leanToAccel)*h;this.slopeAccel=u?0:ou(this.ground.normal,l,c,n.gravity),this.slope=this.slopeAccel===0?0:Math.asin(gt(-this.slopeAccel/n.gravity,-1,1));let p=this.speed+(_+this.slopeAccel)*e;this.rollingResistance=u?0:o.rollingResistance*n.rollingResistanceScale;const M=(n.dragCoefficient*(u?n.airDragFactor:1)*p*p+this.rollingResistance)*e;if(p>0?p=Math.max(0,p-M):p<0&&(p=Math.min(0,p+M)),u)this.reverseHold=0;else if(this.reversing)this.reverseHold=0,p=Math.max(p,-n.maxReverseSpeed),s>=0&&p>=-n.stoppedSpeed&&(this.reversing=!1,p<0&&(p=0));else{const ie=s<-.01;ie&&Math.abs(this.speed)<=n.reverseEntrySpeed?this.reverseHold+=e:this.reverseHold=0,this.reverseHold>=n.reverseEngageSeconds&&ie&&(this.reversing=!0),p<0&&(p=0)}const T=wt(Math.abs(p)/n.carveSpeed),S=Mt(n.yawRateLow,n.yawRateHigh,T),R=-r*S*(u?n.airYawFactor:1);this.lateralLimitG=n.maxLateralG*o.grip;const y=this.lateralLimitG*n.gravity;let E=u?0:p*R,m=R,x=!1;if(!u&&Math.abs(E)>y&&(x=!0,E=O_(E)*y,m=E/p),this.yawRate=m,this.lateralAccel=E,this.lateralLimited=x,this.headingY+=m*e,this.rollAngle=Xe(this.rollAngle,Math.atan(E/n.gravity),n.rollResponseSeconds,1/0,e),this.updatePedalStrike(u),this.pedalStrike!==0){const ie=n.pedalStrikeDecel*Math.abs(this.pedalStrike)*e;p=p>0?Math.max(0,p-ie):Math.min(0,p+ie)}this.stepWobble(e,s,r,p,u,o);const A=u?0:s>0?Math.max(0,this.longitudinalAccel):s<0?Math.min(0,this.longitudinalAccel):0,C=u?0:gt(this.leanPitch*n.riderCruisePitchFactor+A*n.riderAccelerationPitchGain,-n.maxRiderPitch,n.maxRiderPitch);this.riderPitch=Xe(this.riderPitch,C,n.riderPitchResponseSeconds,n.leanRateLimit,e),this.airPitch=Xe(this.airPitch,u?s*n.airPitchAuthority:0,n.airPitchResponseSeconds,1/0,e);const L=this.slope*n.riderSlopeLeanFactor*wt(Math.abs(this.speed)/Math.max(1e-6,n.riderSlopeLeanFullSpeed));this.slopeLean=Xe(this.slopeLean,L,n.groundTiltResponseSeconds,1/0,e),this.riderLookYaw=Xe(this.riderLookYaw,-r*n.riderLookIntoTurn,n.riderLookResponseSeconds,1/0,e);const F=this.y;u&&(this.verticalVelocity-=n.gravity*e,this.y+=this.verticalVelocity*e,this.airTime+=e);const z=this.headingY+this.wobbleYaw,D=u?this.airDirX:Math.sin(z),H=u?this.airDirZ:Math.cos(z),G=p*e,K=this.advance(D*G,H*G,e,p,u);p=K.speed,this.collisionImpact=K.impactSpeed,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.groundY=this.ground.height,this.lastStepUp>0&&this.injectWobble(this.lastStepUp*n.wobbleCurbGain);let ne=!1;u?this.y<=this.groundY&&this.verticalVelocity<=0?(p=this.land(p,this.surfaceResponse()),ne=!0):this.y-this.groundY>this.airApex&&(this.airApex=this.y-this.groundY):K.excess<-n.dropLaunchThreshold?this.leaveGround(F,p*Math.sin(this.slope),D,H):this.y=this.groundY,this.grounded=!this.airborne,this.speed=p,this.longitudinalAccel=ne?0:(p-a)/e,this.wheelSpin+=(K.keptX*D+K.keptZ*H)/n.wheelRadius,this.distanceTravelled+=K.distance,this.writeGroundTilt(e),this.stepCrouch(e,t),this.stepSuspension(e,o),this.readFeeler(Math.sin(this.headingY),Math.cos(this.headingY)),this.airBlend=Xe(this.airBlend,this.airborne?1:0,n.crouchResponseSeconds,1/0,e),this.invulnerableTimer>0?this.invulnerableTimer=Math.max(0,this.invulnerableTimer-e):this.collisionImpact>=n.obstacleCrashSpeed?this.beginCrash("obstacle",p):this.wobbleEnergy>=n.wobbleCrashEnergy?this.beginCrash(this.pedalStrike!==0?"pedalStrike":"wobble",p):ne&&this.landingQuality==="crash"&&this.beginCrash("landing",p),this.landingTimer>0&&(this.landingTimer=Math.max(0,this.landingTimer-e)),this.recoverTimer>0&&(this.recoverTimer=Math.max(0,this.recoverTimer-e)),this.crashing?this.state="crashing":this.airborne?this.state="airborne":this.compressing?this.state="compressing":this.recoverTimer>0?this.state="recovering":this.landingTimer>0?this.state="landing":this.tiltBackLatched?this.state="tiltBack":v?this.state="braking":this.pedalStrike!==0?this.state="pedalStrike":this.wobbleEnergy>=n.wobbleStateEnergy?this.state="wobbling":Math.abs(p)<=n.stoppedSpeed&&!this.reversing?this.state="mounted":f?this.state="coasting":this.state="rolling";const X=this.state==="mounted"&&Math.abs(s)<.01&&Math.abs(r)<.01;this.restHold=X?this.restHold+e:0;const j=this.restHold>=n.restDelaySeconds;this.restFactor=Xe(this.restFactor,j?1:0,j?n.restResponseSeconds:n.restReleaseSeconds,1/0,e),this.updateSafePosition(e)}updateSafePosition(e){const t=this.tuning;if(!(this.grounded&&!this.crashing&&!this.offCourse&&!this.blocked&&!this.compressing&&this.wobbleEnergy<t.crashSafeWobbleCeiling&&this.tiltBack<1e-6&&Math.abs(this.speed)>t.stoppedSpeed)){this.safeHold=0;return}this.safeHold=Math.min(this.safeHold+e,t.crashSafeDelaySeconds),!(this.safeHold<t.crashSafeDelaySeconds)&&(this.safeX=this.x,this.safeZ=this.z,this.safeHeading=this.headingY)}stepPower(e){const t=this.tuning;this.landingLoad=Xe(this.landingLoad,0,t.powerLandingDecaySeconds,1/0,e);const n=Math.abs(this.speed),s=wt((n-t.powerComfortSpeed)/Math.max(1e-6,t.powerLimitSpeed-t.powerComfortSpeed)),r=Math.max(0,Math.sin(this.slope))*t.powerSlopeLoad*wt(n/Math.max(1e-6,t.powerLimitSpeed)),a=Math.max(0,this.longitudinalAccel)/Math.max(1e-6,t.leanToAccel)*t.powerAccelLoad,o=this.airborne?this.landingLoad:s+r+a+this.landingLoad;this.loadFactor=Xe(this.loadFactor,o,o>this.loadFactor?t.powerResponseSeconds:t.powerReliefSeconds,1/0,e),this.tiltBackLatched?this.loadFactor<t.powerTiltBackLoad*t.powerTiltBackRelease&&(this.tiltBackLatched=!1):this.loadFactor>=t.powerTiltBackLoad&&(this.tiltBackLatched=!0),this.tiltBack=Xe(this.tiltBack,this.tiltBackLatched?1:0,this.tiltBackLatched?t.tiltBackEngageSeconds:t.tiltBackReleaseSeconds,1/0,e),this.powerStage=this.tiltBackLatched?"tiltBack":this.loadFactor>=t.powerWarnLoad?"warn":this.loadFactor>=t.powerNoticeLoad?"notice":"normal"}stepWobble(e,t,n,s,r,a){const o=this.tuning,l=this.wobbleEnergy,c=Math.abs(n)<.01?0:n>0?1:-1;c!==this.steerSign?(c!==0&&this.committedSteerSign===-c&&!r&&this.injectWobble(Math.abs(this.committedRoll)*o.wobbleSteerReversalGain*wt(Math.abs(s)/Math.max(1e-6,o.carveSpeed))),this.steerSign=c,this.steerHold=0):this.steerHold+=e,c!==0&&(this.committedSteerSign=c),c!==0?this.committedRoll=this.rollAngle:this.committedRoll=Xe(this.committedRoll,0,o.wobbleReversalMemorySeconds,1/0,e);const u=Math.abs(t)<=o.wobbleSmoothThrottle&&this.steerHold>=o.wobbleSmoothSteerSeconds?1:0;this.wobbleSmoothness=Xe(this.wobbleSmoothness,u,o.wobbleSmoothResponseSeconds,1/0,e);const d=!r&&this.wobbleEnergy>=o.wobbleFootCorrectionStart?1:0;if(this.wobbleFootCorrection=Xe(this.wobbleFootCorrection,d,o.wobbleFootCorrectionResponseSeconds,1/0,e),this.invulnerableTimer>0){this.wobbleEnergy=0,this.wobblePhase=0,this.wobbleYaw=0,this.wobbleRate=0,this.wobbleFootCorrection=0;return}if(!r){const p=Math.max(0,Math.abs(s)-o.wobbleComfortSpeed)*o.wobbleSpeedGain+a.wobbleInjection*Math.abs(s)*o.wobbleSurfaceGain+Math.abs(this.pedalStrike)*o.wobblePedalStrikeGain;this.wobbleEnergy+=p*wt(o.wobbleMasterGain)*e}const h=Mt(o.wobbleDampingAggressive,o.wobbleDampingSmooth,this.wobbleSmoothness)+this.wobbleFootCorrection*o.wobbleFootCorrectionDamping;this.wobbleEnergy=Math.max(0,this.wobbleEnergy-h*this.wobbleEnergy*e),this.wobbleRate=(this.wobbleEnergy-l)/e,this.wobblePhase+=2*Math.PI*o.wobbleFrequencyHz*e,this.wobblePhase>=2*Math.PI&&(this.wobblePhase-=2*Math.PI);const f=wt((this.wobbleEnergy-o.wobbleStateEnergy)/Math.max(1e-6,o.wobbleCrashEnergy-o.wobbleStateEnergy)),v=o.wobbleMaxYaw*f;this.wobbleYaw=r?0:v*Math.sin(this.wobblePhase)}injectWobble(e){!(e>0)||this.crashing||this.invulnerableTimer>0||(this.wobbleEnergy+=e*wt(this.tuning.wobbleMasterGain))}beginCrash(e,t){const n=this.tuning;this.crashing=!0,this.crashCause=e,this.crashSpeed=Math.abs(t),this.crashes+=1,this.crashTime=0,this.crashBlend=0,this.wheelCrashLean=0,this.recoverTimer=0,this.state="crashing",this.crashMotion=e==="pedalStrike"||e==="obstacle"||this.crashSpeed>n.crashRunOutSpeed?"sideFall":this.crashSpeed>n.crashStepOffSpeed?"runOut":"stepOff",this.crashSide=this.pedalStrike!==0?Math.sign(this.pedalStrike):this.rollAngle!==0?Math.sign(this.rollAngle):1,this.leanPitch=0,this.compressing=!1,this.compressTimer=0,this.crouchHold=0,this.hopCharge=0,this.hopWasHeld=!1,this.reversing=!1,this.reverseHold=0,this.restHold=0,this.restFactor=0,this.yawRate=0,this.lateralAccel=0,this.lateralLimited=!1,this.pedalStrike=0,this.tiltBackLatched=!1,this.wobbleEnergy=0,this.wobblePhase=0,this.wobbleYaw=0,this.wobbleRate=0,this.wobbleSmoothness=0,this.wobbleFootCorrection=0}stepCrash(e,t,n,s){const r=this.tuning;this.crashTime+=e;const a=this.surfaceResponse(),o=Math.sin(this.headingY),l=Math.cos(this.headingY);this.slopeAccel=ou(this.ground.normal,o,l,r.gravity),this.slope=this.slopeAccel===0?0:Math.asin(gt(-this.slopeAccel/r.gravity,-1,1)),this.rollingResistance=a.rollingResistance*r.rollingResistanceScale;let c=this.speed+this.slopeAccel*e;const u=(r.crashWheelDecel+this.rollingResistance+r.dragCoefficient*c*c)*e;c>0?c=Math.max(0,c-u):c<0&&(c=Math.min(0,c+u));const d=c*e,h=this.advance(o*d,l*d,e,c,!1);c=h.speed,this.speed=c,this.longitudinalAccel=0,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.groundY=this.ground.height,this.y=this.groundY,this.grounded=!0,this.wheelSpin+=(h.keptX*o+h.keptZ*l)/r.wheelRadius,this.distanceTravelled+=h.distance,this.writeGroundTilt(e),this.stepSuspension(e,a),this.crashBlend=Xe(this.crashBlend,1,r.crashSeparationSeconds,1/0,e),this.wheelCrashLean=Xe(this.wheelCrashLean,r.crashWheelLean,r.crashWheelFallSeconds,1/0,e),this.rollAngle=Xe(this.rollAngle,0,r.rollResponseSeconds,1/0,e),this.riderPitch=Xe(this.riderPitch,0,r.riderPitchResponseSeconds,1/0,e),this.slopeLean=Xe(this.slopeLean,0,r.groundTiltResponseSeconds,1/0,e),this.airPitch=Xe(this.airPitch,0,r.airPitchResponseSeconds,1/0,e),this.riderLookYaw=Xe(this.riderLookYaw,0,r.riderLookResponseSeconds,1/0,e),this.crouch=Xe(this.crouch,0,r.crouchResponseSeconds,1/0,e),this.tuck=Xe(this.tuck,0,r.crouchResponseSeconds,1/0,e),this.absorb=Xe(this.absorb,0,r.landingAbsorbSeconds,1/0,e),this.airBlend=Xe(this.airBlend,0,r.crouchResponseSeconds,1/0,e),this.tiltBack=Xe(this.tiltBack,0,r.tiltBackReleaseSeconds,1/0,e),this.loadFactor=Xe(this.loadFactor,0,r.powerReliefSeconds,1/0,e),this.landingLoad=Xe(this.landingLoad,0,r.powerLandingDecaySeconds,1/0,e),this.powerStage="normal",this.landingTimer=0,this.state="crashing";const f=Math.abs(t)>.01||Math.abs(n)>.01||s;(this.crashTime>=r.crashRecoverEarliestSeconds&&f||this.crashTime>=r.crashRecoverAutoSeconds)&&this.respawn()}respawn(){const e=this.tuning,t=this.crashSpeed*e.crashRecoverSpeedFactor;this.x=this.safeX,this.z=this.safeZ,this.headingY=this.safeHeading,this.speed=t,this.leanPitch=0,this.riderPitch=0,this.slopeLean=0,this.riderLookYaw=0,this.longitudinalAccel=0,this.rollAngle=0,this.yawRate=0,this.lateralAccel=0,this.lateralLimited=!1,this.reversing=!1,this.reverseHold=0,this.restHold=0,this.restFactor=0,this.blocked=!1,this.collisionImpact=0,this.lastStepUp=0,this.curbAhead=0,this.slope=0,this.slopeAccel=0,this.airborne=!1,this.verticalVelocity=0,this.airTime=0,this.airApex=0,this.airDirX=Math.sin(this.headingY),this.airDirZ=Math.cos(this.headingY),this.airPitch=0,this.airBlend=0,this.compressing=!1,this.compressTimer=0,this.crouchHold=0,this.hopCharge=0,this.hopWasHeld=!1,this.crouch=0,this.tuck=0,this.absorb=0,this.landingTimer=0,this.pedalStrike=0,this.clearInstability(),this.invulnerableTimer=e.crashInvulnerableSeconds,this.recoverTimer=e.crashRecoverBlendSeconds,this.safeHold=0,this.state="recovering",this.sampler.sampleGround(this.x,this.z,this.ground),this.y=this.ground.height,this.groundY=this.ground.height,this.surface=this.ground.surface,this.offCourse=this.ground.offCourse,this.grounded=!0;const n=this.surfaceResponse();this.rollingResistance=n.rollingResistance*e.rollingResistanceScale,this.lateralLimitG=e.maxLateralG*n.grip,this.writeGroundTilt(1),this.suspensionVelocity=0,this.suspensionCompression=0,this.suspensionOffset=Oo(this.x,this.z,n.roughnessAmplitude,n.roughnessWavelength)}clearInstability(){this.wobbleEnergy=0,this.wobblePhase=0,this.wobbleYaw=0,this.wobbleRate=0,this.wobbleSmoothness=0,this.wobbleFootCorrection=0,this.steerSign=0,this.steerHold=0,this.committedSteerSign=0,this.committedRoll=0,this.loadFactor=0,this.landingLoad=0,this.powerStage="normal",this.tiltBack=0,this.tiltBackLatched=!1,this.crashing=!1,this.crashTime=0,this.crashBlend=0,this.crashSpeed=0,this.crashSide=1,this.wheelCrashLean=0,this.recoverTimer=0,this.invulnerableTimer=0}advance(e,t,n,s,r){const a=this.tuning;this.blocked=!1,this.lastStepUp=0;const o=r?0:a.maxStepUp;if(e===0&&t===0)return this.sampler.sampleGround(this.x,this.z,this.ground),{speed:s,distance:0,excess:0,keptX:0,keptZ:0,impactSpeed:0};const l=this.excessAt(e,t,r),c=r||!this.obstacleWithinWheelRadius(e,t);if(l<=o&&c){this.commit(e,t,!0);let y=s;if(!r&&l>a.curbThreshold){this.lastStepUp=l;const E=l*a.curbImpactPerMetre;y=s>0?Math.max(0,s-E):Math.min(0,s+E)}return{speed:y,distance:Math.hypot(e,t),excess:l,keptX:e,keptZ:t,impactSpeed:0}}this.blocked=!0;const u=this.excessAt(e,0,r),d=this.excessAt(0,t,r),h=u<=o&&(r||!this.obstacleWithinWheelRadius(e,0)),f=d<=o&&(r||!this.obstacleWithinWheelRadius(0,t));let v=0,_=0,p=0;h&&(!f||Math.abs(e)>=Math.abs(t))?(v=e,p=u):f&&(_=t,p=d),v===0&&_===0?this.sampler.sampleGround(this.x,this.z,this.ground):this.commit(v,_,!1);const g=Math.hypot(e,t),M=Math.hypot(v,_),T=g>0?wt(1-M/g):1,S=a.wallScrubDecel*T*T*n;return{speed:s>0?Math.max(0,s-S):Math.min(0,s+S),distance:M,excess:p,keptX:v,keptZ:_,impactSpeed:r?0:Math.abs(s)*T}}obstacleWithinWheelRadius(e,t){const n=this.sampler.raycastObstacle;if(n===void 0||Math.hypot(e,t)===0)return!1;const r=this.ground.normal,a=r.y>1e-4?-(r.x*e+r.z*t)/r.y:0,o=Math.hypot(e,a,t)+this.tuning.wheelRadius,l=n.call(this.sampler,{x:this.x,y:this.y+this.tuning.maxStepUp+1e-6,z:this.z},{x:e,y:a,z:t},o);return l!==null&&l<=o}excessAt(e,t,n=!1){if(this.sampler.sampleGround(this.x+e,this.z+t,this.probe),n)return this.probe.height-this.y;const s=this.ground.normal,r=s.y>1e-4?-(s.x*e+s.z*t)/s.y:0;return this.probe.height-this.y-r}commit(e,t,n){this.x+=e,this.z+=t,n?K_(this.probe,this.ground):this.sampler.sampleGround(this.x,this.z,this.ground)}writeGroundTilt(e){const t=this.tuning,n=this.ground.normal,s=Math.cos(this.headingY),r=Math.sin(this.headingY),a=s*n.x-r*n.z,o=r*n.x+s*n.z,l=gt(Math.asin(gt(o,-1,1)),-t.maxGroundTilt,t.maxGroundTilt)*t.groundTiltPitchFollow,c=gt(Math.atan2(-a,Math.max(1e-4,n.y)),-t.maxGroundTilt,t.maxGroundTilt)*t.groundTiltRollFollow;if(e>=1){this.groundPitch=l,this.groundRoll=c;return}this.groundPitch=Xe(this.groundPitch,l,t.groundTiltResponseSeconds,1/0,e),this.groundRoll=Xe(this.groundRoll,c,t.groundTiltResponseSeconds,1/0,e)}stepSuspension(e,t){const n=this.tuning,s=this.airborne?0:this.crouch*n.suspensionPreload,r=Oo(this.x,this.z,t.roughnessAmplitude,t.roughnessWavelength)-s,a=2*Math.PI*n.suspensionFrequencyHz,o=-a*a*(this.suspensionOffset-r)-2*n.suspensionDamping*a*this.suspensionVelocity;this.suspensionVelocity+=o*e,this.suspensionOffset+=this.suspensionVelocity*e;const l=n.suspensionTravel;this.suspensionOffset>l?(this.suspensionOffset=l,this.suspensionVelocity>0&&(this.suspensionVelocity=0)):this.suspensionOffset<-l&&(this.suspensionOffset=-l,this.suspensionVelocity<0&&(this.suspensionVelocity=0)),this.suspensionCompression=r-this.suspensionOffset}readFeeler(e,t){const n=this.tuning.feelerDistance,s=e*n,r=t*n,a=this.excessAt(s,r);this.curbAhead=Math.abs(a)>this.tuning.curbThreshold?a:0}stepHop(e,t){const n=this.tuning,s=t.hop&&!this.hopWasHeld;if(this.hopWasHeld=t.hop,this.airborne){this.compressTimer=0,this.compressing=!1,this.crouchHold=0;return}if(this.compressing){this.compressTimer=Math.max(0,this.compressTimer-e),this.compressTimer===0&&this.launchHop();return}if(s){this.hopCharge=wt(this.crouchHold/Math.max(1e-6,n.hopChargeSeconds)),this.compressing=!0,this.compressTimer=n.hopCompressSeconds,this.crouchHold=0,this.compressTimer<=0&&this.launchHop();return}t.crouch?this.crouchHold=Math.min(this.crouchHold+e,n.hopChargeSeconds):this.crouchHold=0}launchHop(){const e=this.tuning,t=e.hopLaunchSpeed*Math.sqrt(1+e.hopChargeHeightBonus*this.hopCharge);this.leaveGround(this.y,t+this.speed*Math.sin(this.slope),0,0),this.compressing=!1,this.compressTimer=0,this.crouchHold=0,this.hops+=1,this.suspensionVelocity+=t*e.hopSuspensionRebound}leaveGround(e,t,n,s){const r=Math.hypot(n,s);r>1e-9?(this.airDirX=n/r,this.airDirZ=s/r):(this.airDirX=Math.sin(this.headingY),this.airDirZ=Math.cos(this.headingY)),this.y=e,this.verticalVelocity=t,this.airborne=!0,this.grounded=!1,this.airTime=0,this.airApex=0,this.justTookOff=!0}land(e,t){const n=this.tuning,s=this.ground.normal,r=Math.sin(this.headingY),a=Math.cos(this.headingY),o=e*this.airDirX,l=e*this.airDirZ,c=Math.max(0,-(o*s.x+this.verticalVelocity*s.y+l*s.z)),u=gt(this.airDirX*r+this.airDirZ*a,-1,1),d=Math.acos(u),h=c/Math.max(1e-6,n.landingImpactReference)+d/Math.max(1e-6,n.landingMisalignReference)+n.landingSurfaceWeight*(t.roughnessAmplitude/Math.max(1e-6,n.landingRoughnessReference)),f=gt((h-n.landingHeavyScore)*n.landingSpeedLossPerScore,0,n.landingMaxSpeedLoss);return this.landingQuality=h>=n.landingCrashScore?"crash":h>=n.landingWobbleScore?"wobble":h>=n.landingHeavyScore?"heavy":"clean",this.landingImpact=c,this.landingMisalignment=d,this.landingScore=h,this.landingSpeedLoss=f,this.landings+=1,this.landingTimer=n.landingStateSeconds,this.justTouchedDown=!0,this.y=this.groundY,this.verticalVelocity=0,this.airborne=!1,this.grounded=!0,this.airTime=0,this.airApex=0,this.suspensionVelocity-=c*n.landingSuspensionKick,this.absorb=wt(c/Math.max(1e-6,n.landingImpactReference)),this.landingQuality!=="crash"&&this.injectWobble((h-n.landingHeavyScore)*n.wobbleLandingGain),this.landingLoad=Math.min(this.landingLoad+c/Math.max(1e-6,n.landingImpactReference)*n.powerLandingLoad,n.powerLandingLoad*2),e*u*(1-f)}updatePedalStrike(e){const t=this.tuning,n=this.pedalStrike;this.pedalClearance=Math.atan2(t.pedalHeight,t.pedalHalfSpan);const s=Math.abs(this.rollAngle)-this.pedalClearance-t.pedalStrikeGraceAngle;if(e||s<=0){this.pedalStrike=0;return}this.pedalStrike=this.rollAngle>0?s:-s,n===0&&(this.suspensionVelocity+=t.pedalStrikeJolt)}stepCrouch(e,t){const n=this.tuning,s=!this.airborne&&t.crouch,r=!this.compressing&&s,a=this.compressing?1:this.airborne?n.airTuck:r?n.crouchHeldAmount:0;this.crouch=Xe(this.crouch,a,n.crouchResponseSeconds,1/0,e),this.absorb=Xe(this.absorb,0,n.landingAbsorbSeconds,1/0,e),this.tuck=Xe(this.tuck,s?1:0,n.crouchResponseSeconds,1/0,e)}surfaceResponse(){return this.surfaces[this.surface]??this.surfaces.pavement}get tookOff(){return this.justTookOff}get canAcceptHop(){return!this.airborne&&!this.compressing&&!this.crashing}get crashed(){return this.crashing}get touchedDown(){return this.justTouchedDown}get lastLandingImpact(){return this.landingImpact}get lastLandingQuality(){return this.landingQuality}get pedalStrikeDepth(){return this.pedalStrike}get currentSurface(){return this.surface}get lastHopCharge(){return this.hopCharge}get powerLoad(){return this.loadFactor}get offRoute(){return this.offCourse}get powerWarning(){return this.powerStage}get wobbleLevel(){return wt(this.wobbleEnergy/Math.max(1e-6,this.tuning.wobbleCrashEnergy))}get obstacleImpact(){return this.collisionImpact}writePose(e){const t=this.tuning,n=this.tiltBack*t.tiltBackPedalPitch;e.x=this.x,e.y=this.y,e.z=this.z,e.headingY=this.headingY,e.rollAngle=this.rollAngle,e.riderRoll=this.rollAngle*this.tuning.riderUpperBodyRollFactor,e.riderPitch=this.riderPitch+this.slopeLean+this.airPitch-n,e.riderLookYaw=this.riderLookYaw,e.wheelPitch=this.riderPitch*t.wheelPitchFactor+this.airPitch-n,e.wheelSpin=this.wheelSpin,e.groundPitch=this.groundPitch,e.groundRoll=this.groundRoll,e.suspensionOffset=this.suspensionOffset,e.restFactor=this.restFactor,e.speed=this.speed,e.crouch=wt(this.crouch+this.absorb),e.tuck=this.tuck,e.airBlend=this.airBlend,e.airHeight=this.y-this.groundY,e.groundY=this.groundY,e.pedalStrike=this.pedalStrike,e.wobble=wt(this.wobbleEnergy/Math.max(1e-6,t.wobbleCrashEnergy)),e.wobbleFootCorrection=this.wobbleFootCorrection,e.wobbleYaw=this.wobbleYaw,e.alert=Math.max(lu(this.wobbleEnergy,[t.wobbleStateEnergy*.5,t.wobbleStateEnergy,t.wobbleCrashEnergy]),lu(this.loadFactor,[t.powerNoticeLoad,t.powerWarnLoad,t.powerTiltBackLoad])),e.tiltBack=this.tiltBack,e.recoverBlend=wt(1-this.recoverTimer/Math.max(1e-6,t.crashRecoverBlendSeconds));const s=this.crashBlend;if(e.crashBlend=s,s<=0){e.crashForward=0,e.crashLateral=0,e.crashDrop=0,e.crashTumble=0,e.crashRoll=0,e.wheelCrashLean=0;return}const r=this.crashMotion==="sideFall",a=this.crashCause==="obstacle"?0:r?.5:this.crashMotion==="runOut"?1:.35,o=r?1:this.crashMotion==="stepOff"?.5:.18;e.crashForward=t.crashSeparationForward*a*s,e.crashLateral=this.crashSide*t.crashSeparationLateral*o*s;const l=Math.sin(2*Math.PI*t.crashTumbleHz*this.crashTime)*Math.exp(-this.crashTime/Math.max(1e-6,t.crashTumbleDampSeconds)),c=t.crashTumbleBounce*Math.max(0,l)*s;r?(e.crashDrop=t.crashSideFallDrop*s-c,e.crashTumble=0,e.crashRoll=this.crashSide*(t.crashSideFallRoll*s+t.crashTumbleRoll*l*s)):(e.crashDrop=t.crashRiderDrop*s-c*.5,e.crashTumble=(t.crashRiderTumble+t.crashTumblePitch*l)*s,e.crashRoll=0),e.wheelCrashLean=this.crashSide*this.wheelCrashLean}snapshot(){const e=this.tuning,t=this.tiltBack*e.tiltBackPedalPitch;return{state:this.state,position:{x:this.x,y:this.y,z:this.z},headingY:this.headingY,speed:this.speed,speedKph:this.speed*3.6,longitudinalAccel:this.longitudinalAccel,leanPitch:this.leanPitch,riderPitch:this.riderPitch+this.slopeLean+this.airPitch-t,slopeLean:this.slopeLean,restFactor:this.restFactor,riderLookYaw:this.riderLookYaw,wheelPitch:this.riderPitch*e.wheelPitchFactor+this.airPitch-t,rollAngle:this.rollAngle,riderRoll:this.rollAngle*e.riderUpperBodyRollFactor,yawRate:this.yawRate,lateralAccel:this.lateralAccel,lateralLimited:this.lateralLimited,reversing:this.reversing,grounded:this.grounded,surface:this.surface,wheelSpin:this.wheelSpin,distanceTravelled:this.distanceTravelled,offCourse:this.offCourse,groundNormal:{...this.ground.normal},slope:this.slope,slopeAccel:this.slopeAccel,rollingResistance:this.rollingResistance,lateralLimitG:this.lateralLimitG,suspensionOffset:this.suspensionOffset,suspensionCompression:this.suspensionCompression,curbAhead:this.curbAhead,lastStepUp:this.lastStepUp,blocked:this.blocked,collisionImpact:this.collisionImpact,compressing:this.compressing,hopCharge:this.hopCharge,crouchCharge:wt(this.crouchHold/Math.max(1e-6,this.tuning.hopChargeSeconds)),hops:this.hops,verticalVelocity:this.verticalVelocity,airHeight:this.y-this.groundY,airApex:this.airApex,airTime:this.airTime,airMisalignment:this.airborne?Math.acos(gt(this.airDirX*Math.sin(this.headingY)+this.airDirZ*Math.cos(this.headingY),-1,1)):0,landingQuality:this.landingQuality,landingImpact:this.landingImpact,landingMisalignment:this.landingMisalignment,landingScore:this.landingScore,landingSpeedLoss:this.landingSpeedLoss,landings:this.landings,pedalStrike:this.pedalStrike,pedalClearance:this.pedalClearance,wobbleEnergy:this.wobbleEnergy,wobbleYaw:this.wobbleYaw,wobbleRate:this.wobbleRate,wobbleSmoothness:this.wobbleSmoothness,wobbleFootCorrection:this.wobbleFootCorrection,loadFactor:this.loadFactor,powerStage:this.powerStage,tiltBack:this.tiltBack,crashed:this.crashing,crashCause:this.crashCause,crashMotion:this.crashMotion,crashTime:this.crashing?this.crashTime:0,crashes:this.crashes,recoveryReady:this.crashing&&this.crashTime>=e.crashRecoverEarliestSeconds,invulnerable:this.invulnerableTimer,safePosition:{x:this.safeX,y:0,z:this.safeZ},safeHeading:this.safeHeading}}}function ou(i,e,t,n){const s=e*i.x+t*i.z;if(s===0)return 0;const r=e-s*i.x,a=-s*i.y,o=t-s*i.z,l=Math.hypot(r,a,o);return l<=1e-6?0:-n*(a/l)}function lu(i,e){if(!(i>0)||e.length===0)return 0;const t=1/e.length;let n=0;for(let s=0;s<e.length;s+=1){const r=Math.max(e[s],n+1e-6);if(i<r)return(s+(i-n)/(r-n))*t;n=r}return 1}function cu(i){return Number.isFinite(i)?i:0}function Rn(i){if(i.length<2)throw new Error("a loft profile needs at least two rings");const t=(i[0].y<=i[i.length-1].y?i:[...i].reverse()).map(n=>({y:n.y,halfWidth:n.halfWidth,halfDepth:n.halfDepth,z:n.z??0,x:n.x??0,square:n.square??2}));for(let n=1;n<t.length;n+=1)if(!(t[n].y>t[n-1].y))throw new Error(`loft ring ${n} does not rise above ring ${n-1}`);return t}function eS(i,e){const t=i.length-1,n=Math.min(Math.max(e,0),t),s=Math.min(Math.floor(n),t-1),r=n-s,a=i[s],o=i[s+1];return{y:a.y+(o.y-a.y)*r,halfWidth:a.halfWidth+(o.halfWidth-a.halfWidth)*r,halfDepth:a.halfDepth+(o.halfDepth-a.halfDepth)*r,z:a.z+(o.z-a.z)*r,x:a.x+(o.x-a.x)*r,square:a.square+(o.square-a.square)*r}}function Gt(i,e){const t=i.length-1;if(e<=i[0].y)return 0;if(e>=i[t].y)return t;for(let n=1;n<=t;n+=1){const s=i[n];if(e<=s.y){const r=i[n-1];return n-1+(e-r.y)/(s.y-r.y)}}return t}function rs(i,e,t,n){const s=eS(i,t),r=2/s.square,a=Math.cos(e),o=Math.sin(e);return n.set(s.x+s.halfWidth*Math.sign(a)*Math.abs(a)**r,s.y,s.z+s.halfDepth*Math.sign(o)*Math.abs(o)**r)}const hu=new I,uu=new I,ta=new I,na=new I;function af(i,e,t,n){const a=i.length-1;rs(i,e+.001,t,ta),rs(i,e-.001,t,na),hu.subVectors(ta,na);const o=Math.min(t+.001,a),l=Math.max(t-.001,0);rs(i,e,o,ta),rs(i,e,l,na),uu.subVectors(ta,na),n.crossVectors(uu,hu);const c=n.length();return c<1e-9?n.set(0,t>a-t?1:-1,0):n.multiplyScalar(1/c)}function Bo(i){return i.halfWidth<1e-4&&i.halfDepth<1e-4}function yn(i,e={}){const t=Math.max(3,Math.round(e.radialSegments??16)),n=Math.max(0,Math.round(e.subdivisions??0)),s=e.shade??1,r=[];for(let _=0;_<i.length-1;_+=1)for(let p=0;p<=n;p+=1)r.push(_+p/(n+1));r.push(i.length-1);const a=[],o=[],l=[],c=new I,u=Bo(i[0]),d=Bo(i[i.length-1]);for(const _ of r)for(let p=0;p<t;p+=1)rs(i,p/t*Math.PI*2,_,c),a.push(c.x,c.y,c.z),o.push(s,s,s);const h=(_,p)=>_*t+p%t;for(let _=0;_<r.length-1;_+=1)for(let p=0;p<t;p+=1){const g=h(_,p),M=h(_,p+1),T=h(_+1,p+1),S=h(_+1,p);l.push(g,S,M,M,S,T)}const f=(_,p,g)=>{if(Bo(p))return;const M=a.length/3;a.push(p.x,p.y,p.z),o.push(s,s,s);for(let T=0;T<t;T+=1){const S=h(_,T),R=h(_,T+1);g?l.push(M,R,S):l.push(M,S,R)}};(e.capBottom??!0)&&!u&&f(0,i[0],!1),(e.capTop??!0)&&!d&&f(r.length-1,i[i.length-1],!0);const v=new Ut;return v.setAttribute("position",new Qe(a,3)),v.setAttribute("color",new Qe(o,3)),v.setIndex(l),v.computeVertexNormals(),v}function Ni(i,e){const t=Math.max(1,Math.round(e.uSegments??8)),n=Math.max(1,Math.round(e.vSegments??4)),s=e.lift??.01,r=e.sink??-.006,a=e.skew??0,o=e.taper??0,l=e.shade??1,c=[],u=[],d=[],h=new I,f=new I,v=(m,x,A)=>{const C=c.length/3;return rs(i,m,x,h),af(i,m,x,f),c.push(h.x+f.x*A,h.y+f.y*A,h.z+f.z*A),u.push(l,l,l),C},_=(m,x)=>{const A=e.u0+(e.u1-e.u0)*m,C=(e.v0+e.v1)/2+a*(m-.5),L=(e.v1-e.v0)/2*(1-o*Math.abs(m-.5)*2);return[A,C+L*(x*2-1)]},p=[],g=[];for(let m=0;m<=t;m+=1){const x=[],A=[];for(let C=0;C<=n;C+=1){const[L,F]=_(m/t,C/n);x.push(v(L,F,s)),A.push(v(L,F,r))}p.push(x),g.push(A)}for(let m=0;m<t;m+=1)for(let x=0;x<n;x+=1){const A=p[m][x],C=p[m+1][x],L=p[m+1][x+1],F=p[m][x+1];d.push(A,F,C,C,F,L);const z=g[m][x],D=g[m+1][x],H=g[m+1][x+1],G=g[m][x+1];d.push(z,D,G,D,H,G)}const M=(m,x,A)=>{for(let C=0;C<m.length-1;C+=1){const L=c.length/3;for(const F of[m[C],m[C+1],x[C+1],x[C]])c.push(c[F*3],c[F*3+1],c[F*3+2]),u.push(l,l,l);A?d.push(L,L+2,L+1,L,L+3,L+2):d.push(L,L+1,L+2,L,L+2,L+3)}},T=p.map(m=>m[0]),S=g.map(m=>m[0]),R=p.map(m=>m[n]),y=g.map(m=>m[n]);if(M(T,S,!1),M(R,y,!0),M(p[0],g[0],!0),M(p[t],g[t],!1),(e.u1-e.u0)*(e.v1-e.v0)<0)for(let m=0;m<d.length;m+=3){const x=d[m+1];d[m+1]=d[m+2],d[m+2]=x}const E=new Ut;return E.setAttribute("position",new Qe(c,3)),E.setAttribute("color",new Qe(u,3)),E.setIndex(d),E.computeVertexNormals(),E}function Fn(i,e=1){const t=i.getAttribute("position").count,n=new Float32Array(t*3).fill(e);return i.setAttribute("color",new dn(n,3)),i}function fi(i){if(i.length===0)throw new Error("nothing to merge");const e=[],t=[],n=[],s=[];for(const a of i){const o=a.getAttribute("position"),l=a.getAttribute("normal"),c=a.getAttribute("color");if(!l)throw new Error("a merged geometry needs normals");if(!c)throw new Error("a merged geometry needs a color attribute; see shaded()");const u=e.length/3;for(let h=0;h<o.count;h+=1)e.push(o.getX(h),o.getY(h),o.getZ(h)),t.push(l.getX(h),l.getY(h),l.getZ(h)),n.push(c.getX(h),c.getY(h),c.getZ(h));const d=a.getIndex();if(d)for(let h=0;h<d.count;h+=1)s.push(d.getX(h)+u);else for(let h=0;h<o.count;h+=1)s.push(h+u);a.dispose()}const r=new Ut;return r.setAttribute("position",new Qe(e,3)),r.setAttribute("normal",new Qe(t,3)),r.setAttribute("color",new Qe(n,3)),r.setIndex(s),r}function Qa(i,e,t=[],n={}){const s=n.flatten??.92,r=n.square??2.3,[a,o,l]=e,c=v=>v<.5?a+(o-a)*(v/.5):o+(l-o)*((v-.5)/.5),u=[],d=(v,_=1)=>{const p=c(Math.min(Math.max(v,0),1))*_;u.push({y:-v*i,halfWidth:p,halfDepth:p*s,square:r})};d(0);const h=new Set([.25,.5,.75]);for(const v of t)h.add(v-.018),h.add(v+.018);const f=[...h].filter(v=>v>.02&&v<.97).sort((v,_)=>v-_);for(const v of f){const _=t.some(p=>Math.abs(v-p)<.02);d(v,_?v<t.find(p=>Math.abs(v-p)<.02)?1.05:.95:1)}if(n.roundEnd??!0){const v=c(1);for(const[_,p]of[[.5,.86],[.85,.54],[1,0]])u.push({y:-i-v*.55*_,halfWidth:v*p,halfDepth:v*p*s,square:r})}else d(1);return Rn(u)}const ia=[Ft.statusNormal,Ft.statusNotice,Ft.statusWarn,Ft.statusCritical],bn=at.tyreDiameter/2,tS=at.tyreWidth/2,Gs=bn,nS=at.shellHeight-Gs,Oc=at.shellWidth/2,iS=at.shellLength/2,lc=1-at.shellCapFraction,sS=i=>Gs+nS*i,sa=i=>lc*i,Ho=i=>lc+(1-lc)*i,Ji=(i,e,t,n)=>({y:sS(i),halfWidth:Oc*e,halfDepth:iS*t,square:n}),hi=Rn([Ji(sa(0),.47,.57,2.5),Ji(sa(.38),.87,.85,3),Ji(sa(.78),1,.977,3.2),Ji(sa(1),1,1,3.2),Ji(Ho(.32),.94,.94,2.9),Ji(Ho(.58),.8,.83,2.5),Ji(Ho(.78),.58,.65,2.3)]),ra=hi[hi.length-1].y,Qi=(i,e)=>({y:i*tS,halfWidth:e,halfDepth:e}),rS=Rn([Qi(-1,bn*.824),Qi(-.62,bn*.928),Qi(-.3,bn*.986),Qi(0,bn),Qi(.3,bn*.986),Qi(.62,bn*.928),Qi(1,bn*.824)]),of=at.padThickness*.8,aS=at.padLength/2,oS=at.padHeight/2,lS=Oc+at.padThickness-of,ji=(i,e,t,n)=>({y:i*oS,halfWidth:of*e,halfDepth:aS*t,square:n}),cS=Rn([ji(-1,.34,.68,2.4),ji(-.8,.92,.87,2.9),ji(-.22,1,1,3.2),ji(.16,.97,.99,3.2),ji(.55,.86,.93,2.9),ji(.86,.6,.78,2.6),ji(1,.3,.62,2.3)]),Hi=(at.pedalSpan-at.shellWidth)/4,as=at.pedalLength/2,ks=at.pedalThickness/2,hS=Rn([{y:-ks,halfWidth:Hi*.88,halfDepth:as*.89,square:4},{y:-ks*.45,halfWidth:Hi*.985,halfDepth:as*.985,square:6},{y:ks*.45,halfWidth:Hi,halfDepth:as,square:6},{y:ks,halfWidth:Hi*.9,halfDepth:as*.91,square:4}]),uS=Rn([{y:-Je.statusLightHeight/2,halfWidth:Je.statusLightWidth*.38,halfDepth:Je.statusLightDepth*.32,square:3},{y:-Je.statusLightHeight*.18,halfWidth:Je.statusLightWidth*.5,halfDepth:Je.statusLightDepth*.5,square:4.5},{y:Je.statusLightHeight*.18,halfWidth:Je.statusLightWidth*.5,halfDepth:Je.statusLightDepth*.5,square:4.5},{y:Je.statusLightHeight/2,halfWidth:Je.statusLightWidth*.38,halfDepth:Je.statusLightDepth*.32,square:3}]),Go=.086,cc=.02,Vo=Gs+at.suspensionTravel,du=cc+.006,fu=.075,dS=3,fS=4.6,pu=.5,pS=.55,mS=.42,gS=1.14,vS=.72;function bS(){const i=new It;i.name="euc-blockout";const e=[],t=[],n=X=>(e.push(X),X),s=X=>(t.push(X),X),r=s(new tn({color:Ft.shell,roughness:.45,metalness:.1,vertexColors:!0})),a=s(new tn({color:Ft.tyre,roughness:.92,metalness:0,vertexColors:!0})),o=s(new tn({color:Ft.pad,roughness:.85,metalness:0,vertexColors:!0})),l=s(new tn({color:Ft.pedal,roughness:.55,metalness:.75,vertexColors:!0})),c=s(new tn({color:16777215,emissive:Ft.headlight,emissiveIntensity:1.4,roughness:.3,vertexColors:!0})),u=s(new tn({color:5246996,emissive:Ft.taillight,emissiveIntensity:1.1,roughness:.4,vertexColors:!0})),d=s(new tn({color:Ft.accent,emissive:1855388,emissiveIntensity:.35,roughness:.35,metalness:.2,vertexColors:!0})),h=X=>(X.castShadow=!0,X),f=X=>{const{from:j,to:ie,...Ae}=X;return Ni(hi,{...Ae,v0:Gt(hi,j),v1:Gt(hi,ie)})},v=new It;v.name="euc-body",i.add(v);const _=yn(rS,{radialSegments:20,capBottom:!1,capTop:!1}),p=Fn(new Yn(bn*.828,bn*.828,at.tyreWidth,20),dS),g=Fn(new Yn(bn*.46,bn*.46,at.tyreWidth+.016,16),fS),M=new ht(n(fi([_,p,g])),a);M.rotation.z=Math.PI/2,M.position.y=bn,M.castShadow=!0,M.receiveShadow=!0,M.name="euc-tyre",i.add(M);const S=[Fn(new Yn(.016,.016,Go*2+.018,12)).rotateZ(Math.PI/2).translate(0,Gs,0)];for(const X of[-1,1])S.push(Fn(new Yn(cc,cc,Vo-Gs,10)).translate(X*Go,(Gs+Vo)/2,0));const R=h(new ht(n(fi(S)),l));R.name="euc-suspension",i.add(R);const y=[yn(hi,{radialSegments:20})],E=ra+(at.shellHeight-ra)*.62;for(const X of[-.064,.064])y.push(Fn(new Tn(.03,E-ra,.022),pu).translate(0,(ra+E)/2,X));y.push(Fn(new Tn(.038,at.shellHeight-E,.166),pu).translate(0,(E+at.shellHeight)/2,0));for(const X of[-1,1])y.push(Fn(new Yn(du,du,fu,10),pS).translate(X*Go,Vo+fu/2-.002,0));const m=h(new ht(n(fi(y)),r));m.receiveShadow=!0,m.name="euc-shell",v.add(m);const x=[];for(const X of[0,Math.PI])x.push(f({u0:X-.55,u1:X+.55,from:.545,to:.575,lift:.005,sink:-.01,uSegments:8,vSegments:2}));x.push(f({u0:Math.PI/2-.62,u1:Math.PI/2+.62,from:.43,to:.468,lift:.005,sink:-.01,uSegments:8,vSegments:2,taper:.35}));const A=new ht(n(fi(x)),d);A.name="euc-accent",v.add(A);for(const X of[-1,1]){const j=h(new ht(n(yn(cS,{radialSegments:12})),o));j.position.set(X*lS,at.padCentreHeight,0),j.name=`euc-pad-${X>0?"left":"right"}`,v.add(j)}for(const X of[-1,1]){const j=[yn(hS,{radialSegments:14}),Fn(new Tn(Hi*1.4,.005,as*1.36),mS).translate(0,ks,0),Fn(new Tn(.01,.019,as*1.46),gS).translate(X*Hi*.93,ks*.4,0),Fn(new Yn(.011,.011,as*.44,8),vS).rotateX(Math.PI/2).translate(-X*Hi*.96,0,0)],ie=h(new ht(n(fi(j)),l));ie.position.set(X*(Oc+Hi),at.pedalHeight,0),ie.receiveShadow=!0,ie.name=`euc-pedal-${X>0?"left":"right"}`,v.add(ie)}const C=new ht(n(f({u0:Math.PI/2-.44,u1:Math.PI/2+.44,from:.502,to:.53,lift:.004,sink:-.012,uSegments:6,vSegments:2,taper:.4})),c);C.name="euc-headlight",v.add(C);const L=new ht(n(f({u0:-Math.PI/2-.26,u1:-Math.PI/2+.26,from:.5,to:.521,lift:.004,sink:-.012,uSegments:6,vSegments:2,taper:.45})),u);L.name="euc-taillight",v.add(L);const F=s(new tn({color:1053206,emissive:Ft.statusNormal,emissiveIntensity:Je.statusCalmIntensity,roughness:.35,metalness:.1,vertexColors:!0})),z=new ht(n(yn(uS,{radialSegments:12})),F);z.name="euc-status-light";const D=Gt(hi,.556),H=rs(hi,-Math.PI/2,D,new I),G=af(hi,-Math.PI/2,D,new I);z.position.copy(H).addScaledVector(G,Je.statusLightDepth*.42),z.rotation.x=-.55,v.add(z);const K=new Ve,ne=new Ve;return{group:i,tyre:M,body:v,statusLight:z,setStatus(X,j,ie=0){const Ae=wt(X)*(ia.length-1),Oe=Math.min(ia.length-2,Math.floor(Ae));K.setHex(ia[Oe]),ne.setHex(ia[Oe+1]),F.emissive.copy(K).lerp(ne,Ae-Oe);const se=wt(X),V=Mt(Je.statusNoticeHz,Je.statusCriticalHz,se),te=se<=0?1:1-Je.statusPulseDepth*se*(.5-.5*Math.cos(2*Math.PI*V*j));F.emissiveIntensity=Mt(Je.statusCalmIntensity,Je.statusAlarmIntensity,se)*te;const re=wt(ie);re>0&&(K.setHex(Je.statusBootColour),F.emissive.lerp(K,re),F.emissiveIntensity=Math.max(F.emissiveIntensity,Je.statusBootIntensity*re))},dispose(){for(const X of e)X.dispose();for(const X of t)X.dispose();e.length=0,t.length=0,i.removeFromParent()}}}function _S(){return{rollAngle:0,riderPitch:0,torsoPitch:0,lookYaw:0,restFactor:0,groundY:0,crouch:0,tuck:0,airBlend:0,falling:!1,pedalStrike:0,wobble:0,wobbleFootCorrection:0,wobbleYaw:0,crash:0}}const mu=new I(0,-1,0),gu=new I(0,0,1),Wo=new I,aa=new I,lr=new I,Xo=new I,vu=new I,bu=new Sn;function oa(i,e,t){Wo.copy(i.target).sub(i.origin);const n=Wo.length();if(n<1e-9){e.identity(),t.identity();return}aa.copy(Wo).multiplyScalar(1/n);const s=Math.min(Math.max((i.upperLength**2-i.lowerLength**2+n**2)/(2*n),-i.upperLength),i.upperLength),r=Math.sqrt(Math.max(0,i.upperLength**2-s**2));lr.copy(i.bendToward).addScaledVector(aa,-i.bendToward.dot(aa)),lr.lengthSq()<1e-12&&lr.set(0,0,1),lr.normalize(),Xo.copy(i.origin).addScaledVector(aa,s).addScaledVector(lr,r),e.setFromUnitVectors(mu,vu.copy(Xo).sub(i.origin).normalize()),bu.copy(e).invert(),t.setFromUnitVectors(mu,vu.copy(i.target).sub(Xo).normalize().applyQuaternion(bu))}const on=ce.torsoWidth/2,ln=ce.torsoDepth/2,ci=Rn([{y:-.01,halfWidth:1.03*on,halfDepth:1.01*ln,square:2.8},{y:.018,halfWidth:.98*on,halfDepth:.96*ln,square:2.8},{y:.05,halfWidth:.9*on,halfDepth:.93*ln,square:2.6},{y:.155,halfWidth:.86*on,halfDepth:.87*ln,square:2.5},{y:.29,halfWidth:.97*on,halfDepth:1.01*ln,square:2.6,z:.008},{y:.4,halfWidth:1*on,halfDepth:.98*ln,square:2.9,z:.006},{y:.47,halfWidth:1*on,halfDepth:.9*ln,square:3.1,z:.002},{y:.5,halfWidth:.93*on,halfDepth:.82*ln,square:2.9},{y:.528,halfWidth:.74*on,halfDepth:.66*ln,square:2.5},{y:.548,halfWidth:.44*on,halfDepth:.5*ln,square:2.3}]),SS=Rn([{y:-.088,halfWidth:.76*on,halfDepth:.8*ln,square:2.6},{y:-.055,halfWidth:.92*on,halfDepth:.91*ln,square:2.7},{y:-.02,halfWidth:.97*on,halfDepth:.95*ln,square:2.7},{y:.03,halfWidth:.93*on,halfDepth:.9*ln,square:2.6}]),xS=Qa(ce.thighLength,[.079,.072,.061],[.3,.62],{flatten:.94,square:2.4}),_u=Qa(ce.shinLength,[.064,.058,.046],[.42],{flatten:.92,square:2.4}),Su=Qa(ce.upperArmLength,[.058,.05,.043],[.55],{flatten:.95,square:2.3}),xu=Qa(ce.forearmLength,[.047,.041,.033],[.45],{flatten:.94,square:2.3}),MS=Rn([{y:-.048,halfWidth:.07,halfDepth:.068,square:2.4},{y:-.01,halfWidth:.062,halfDepth:.06,square:2.3},{y:.05,halfWidth:.055,halfDepth:.053,square:2.2},{y:.098,halfWidth:.052,halfDepth:.05,square:2.2}]),en=Rn([{y:.088,halfWidth:.07,halfDepth:.08,square:2.3,z:.012},{y:.118,halfWidth:.104,halfDepth:.116,square:2.5,z:.012},{y:.158,halfWidth:.119,halfDepth:.13,square:2.6,z:.008},{y:.215,halfWidth:.124,halfDepth:.133,square:2.5,z:.004},{y:.268,halfWidth:.113,halfDepth:.119,square:2.3},{y:.308,halfWidth:.084,halfDepth:.088,square:2.2},{y:.336,halfWidth:.04,halfDepth:.042,square:2.2},{y:.348,halfWidth:0,halfDepth:0}]),yS=Rn([{y:-.098,halfWidth:.03,halfDepth:.026,square:2.4},{y:-.08,halfWidth:.052,halfDepth:.04,square:2.7},{y:-.035,halfWidth:.062,halfDepth:.047,square:2.9},{y:.02,halfWidth:.064,halfDepth:.04,square:2.9},{y:.082,halfWidth:.06,halfDepth:.031,square:2.9},{y:.122,halfWidth:.043,halfDepth:.022,square:2.6},{y:.142,halfWidth:.014,halfDepth:.009,square:2.4}]),wS=Rn([{y:0,halfWidth:.04,halfDepth:.035,square:2.6},{y:-.022,halfWidth:.046,halfDepth:.04,square:2.8},{y:-.04,halfWidth:.041,halfDepth:.037,square:2.8},{y:-.082,halfWidth:.039,halfDepth:.034,square:2.9},{y:-.098,halfWidth:.023,halfDepth:.02,square:2.6},{y:-.105,halfWidth:0,halfDepth:0}]),Yo=.86,ES=1.14,TS=.72,AS=.78;function qo(i){return i>0?0:Math.PI}function RS(){const i=new It;i.name="rider-blockout";const e=[],t=[],n=se=>(e.push(se),se),s=se=>(t.push(se),se),r=s(new tn({color:Ft.riderSuit,roughness:.82,metalness:0,vertexColors:!0})),a=s(new tn({color:Ft.riderPanel,roughness:.26,metalness:.18,emissive:928856,emissiveIntensity:.55,vertexColors:!0})),o=s(new tn({color:Ft.riderHelmet,roughness:.35,metalness:.05,vertexColors:!0})),l=s(new tn({color:Ft.riderVisor,roughness:.12,metalness:.35,vertexColors:!0})),c=s(new tn({color:Ft.riderBoot,roughness:.7,metalness:0,vertexColors:!0})),u=se=>(se.castShadow=!0,se),d=(se,V,te)=>{const re=new ht(n(yn(se,{radialSegments:14,shade:te})),V);return u(re)},h=(se,V)=>{const{from:te,to:re,...ge}=V;return Ni(se,{...ge,v0:Gt(se,te),v1:Gt(se,re)})},f=(se,V)=>{const te=new ht(n(fi(V)),a);return te.name=se,te},v=ce.torsoWidth*.26,_=at.pedalHeight+ce.ankleAbovePedal,p=[],g=[],M=new Sn,T=new Sn;for(const se of[-1,1]){const V=se>0?"left":"right",te=new It;te.name=`rider-hip-${V}`,te.position.set(se*v,ss.hipHeight,0);const re=new I(se*ce.stanceHalfWidth,_,0);oa({origin:te.position,target:re,upperLength:ce.thighLength,lowerLength:ce.shinLength,bendToward:gu},M,T),te.quaternion.copy(M),te.add(d(xS,r,Yo));const ge=new It;ge.name=`rider-knee-${V}`,ge.position.y=-ce.thighLength,ge.quaternion.copy(T),ge.add(d(_u,r,Yo)),te.add(ge);const Ce=new It;Ce.name=`rider-ankle-${V}`,Ce.position.y=-ce.shinLength,Ce.quaternion.copy(M).multiply(T).invert(),ge.add(Ce);const _e=-ce.ankleAbovePedal+.018,je=yn(yS,{radialSegments:12}).rotateX(Math.PI/2).translate(0,_e+.047,0),De=Fn(new Tn(.13,.018,ce.bootLength*.94),TS).translate(0,_e-.009,.018),nt=u(new ht(n(fi([je,De])),c));Ce.add(nt),ge.add(f(`rider-knee-pad-${V}`,[h(_u,{u0:Math.PI/2-.66,u1:Math.PI/2+.66,from:-.078,to:-.016,uSegments:5,vSegments:3,lift:.012,taper:.3})])),i.add(te),p.push({side:se,hip:te,knee:ge,ankle:Ce,target:re,lastDrop:0,lastShift:0,lastOpen:0,lastLift:0,lastFootAdjust:0})}const S=new It;S.name="rider-pelvis",S.position.y=ss.hipHeight,i.add(S);const R=yn(ci,{radialSegments:24}),y=yn(SS,{radialSegments:24,shade:Yo}),E=Ni(ci,{u0:Math.PI/2,u1:Math.PI/2+Math.PI*2,v0:Gt(ci,.502),v1:Gt(ci,.545),uSegments:20,vSegments:2,lift:.011,shade:ES}),m=u(new ht(n(fi([R,y,E])),r));S.add(m);const x=ce.torsoLength;S.add(u(f("rider-shoulder-panels",[-1,1].map(se=>{const V=qo(se);return h(ci,{u0:V-.72,u1:V+.72,from:.395,to:.512,uSegments:7,vSegments:4,lift:.011,taper:.34})}))));const A=Gt(ci,.33)-Gt(ci,.395);S.add(f("rider-jacket-panels",[...[-1,1].map(se=>h(ci,{u0:Math.PI/2+se*.1,u1:Math.PI/2+se*.92,from:.3,to:.352,uSegments:6,vSegments:2,lift:.01,skew:A,taper:.25})),h(ci,{u0:-Math.PI/2-.6,u1:-Math.PI/2+.6,from:.205,to:.492,uSegments:7,vSegments:5,lift:.01,taper:.16})]));for(const se of[-1,1]){const V=se>0?"left":"right",te=new It;te.name=`rider-shoulder-${V}`,te.position.set(se*ce.shoulderHalfWidth,x,0);const re=se<0,ge=ce.upperArmLength+ce.forearmLength,Ce=ce.shoulderHalfWidth+ce.armSplay+(re?ce.armAsymmetrySplay:0),_e=new I(se*Ce,x-ge*ce.armHangFraction,ce.handForward+(re?ce.armAsymmetryForward:0)),je=new I(0,0,-1);oa({origin:te.position,target:_e,upperLength:ce.upperArmLength,lowerLength:ce.forearmLength,bendToward:je},M,T),te.quaternion.copy(M),te.add(d(Su,r,1)),te.add(f(`rider-sleeve-${V}`,[h(Su,{u0:qo(se)-.92,u1:qo(se)+.92,from:-.245,to:.002,uSegments:6,vSegments:5,lift:.009,taper:.22})]));const De=new It;De.name=`rider-elbow-${V}`,De.position.y=-ce.upperArmLength,De.quaternion.copy(T),De.add(d(xu,r,1)),De.add(f(`rider-elbow-pad-${V}`,[h(xu,{u0:-Math.PI/2-.62,u1:-Math.PI/2+.62,from:-.058,to:-.004,uSegments:5,vSegments:3,lift:.011,taper:.3})])),te.add(De);const nt=u(new ht(n(yn(wS,{radialSegments:10})),c));nt.name=`rider-hand-${V}`,nt.position.y=-ce.forearmLength+.012,De.add(nt),S.add(te),g.push({side:se,shoulder:te,elbow:De,baseTarget:_e,target:_e.clone(),baseSplay:Ce,bendToward:je,lastSplay:0,lastForward:0,lastRise:0})}const C=new It;C.name="rider-neck",C.position.y=x,S.add(C);const L=u(new ht(n(yn(MS,{radialSegments:12,shade:AS})),r));C.add(L);const F=yn(en,{radialSegments:20}),z=Ni(en,{u0:Math.PI/2-.7,u1:Math.PI/2+.7,v0:Gt(en,.098),v1:Gt(en,.15),uSegments:6,vSegments:3,lift:.015,taper:.42}),D=Ni(en,{u0:Math.PI/2-.86,u1:Math.PI/2+.86,v0:Gt(en,.236),v1:Gt(en,.256),uSegments:7,vSegments:1,lift:.011,taper:.3}),H=Ni(en,{u0:-Math.PI/2-.78,u1:-Math.PI/2+.78,v0:Gt(en,.15),v1:Gt(en,.206),uSegments:8,vSegments:3,lift:.012,taper:.62,shade:1.05}),G=Ni(en,{u0:Math.PI/2,u1:Math.PI/2+Math.PI*2,v0:Gt(en,.09),v1:Gt(en,.113),uSegments:18,vSegments:1,lift:.004,shade:1.08}),K=u(new ht(n(fi([F,z,D,H,G])),o));C.add(K);const ne=new ht(n(Ni(en,{u0:Math.PI/2-.8,u1:Math.PI/2+.8,v0:Gt(en,.172),v1:Gt(en,.234),uSegments:9,vSegments:3,lift:.007,sink:-.014,taper:.22})),l);C.add(ne),S.rotation.x=ce.torsoRestPitch;const X=new I,j=new Sn,ie=new Sn,Ae=new I;let Oe=0;return{root:i,pelvis:S,neck:C,applyStanceReaction(se){const{rollAngle:V,riderPitch:te,lookYaw:re,groundY:ge}=se,Ce=Math.min(1,Math.abs(V)/ce.carveReactionFullRoll),_e=Math.sign(V),je=gt(se.restFactor,0,1),De=Math.max(je,gt(se.crash,0,1)),nt=De>1e-6||Math.abs(De-Oe)>1e-6;Oe=De;const Ge=gt(se.crouch,0,1)*(1-je),$e=gt(se.airBlend,0,1)*(1-je),dt=gt(se.tuck,0,1)*(1-je)*(1-gt(se.crash,0,1)),ot=gt(se.crash,0,1),Tt=wt((gt(se.wobble,0,1)-Q.wobbleStateEnergy)/Math.max(1e-6,1-Q.wobbleStateEnergy))*(1-je)*(1-ot),yt=gt(se.wobbleFootCorrection,0,1)*(1-je)*(1-ot),At=wt((se.wobble-Q.wobbleStateEnergy)/Math.max(1e-6,Q.wobbleCrashEnergy-Q.wobbleStateEnergy)),k=Q.wobbleMaxYaw*Math.max(1e-6,At),Kt=k>0?gt(se.wobbleYaw/k,-1,1):0,ut=Math.sign(se.pedalStrike),P=Math.min(1,Math.abs(se.pedalStrike)/Q.pedalStrikeReferenceDepth)*ce.pedalStrikeFootLift,b=gt(te/ce.loadReactionFullPitch,-1,1),B=Math.max(0,b),Y=Math.max(0,-b),J=B*ce.accelHipShiftMax-Y*ce.brakeHipShiftMax,le=Math.min(ce.squatMax,ce.carveSquatMax*Ce+B*ce.accelSquatMax+Y*ce.brakeSquatMax+Ge*ce.crouchHipDrop+dt*ce.tuckHipDrop+Tt*ce.wobbleHipDrop),pe=Math.min(ce.tuckTorsoPitchMax,se.torsoPitch+dt*ce.tuckTorsoPitch);S.rotation.x=pe,S.position.x=ce.restHipShift*je,S.position.y=Mt(ss.hipHeight-le,ce.restHipHeight,De),S.position.z=J*(1-De),S.rotation.y=-se.wobbleYaw*ce.wobbleHipCounterYaw*Tt;for(const W of p){const de=_e!==0&&Math.sign(W.side)===_e,Re=le+(de?ce.carveInsideHipDropMax*Ce:0),ue=de?ce.carveInsideKneeOpen*Ce:0,he=ut!==0&&Math.sign(W.side)===ut?P:0,Ie=-W.side*Kt*yt*ce.wobbleFootAdjust;if(!nt&&Math.abs(Re-W.lastDrop)<1e-6&&Math.abs(J-W.lastShift)<1e-6&&Math.abs(ue-W.lastOpen)<1e-6&&Math.abs(he-W.lastLift)<1e-6&&Math.abs(Ie-W.lastFootAdjust)<1e-6)continue;W.lastDrop=Re,W.lastShift=J,W.lastOpen=ue,W.lastLift=he,W.lastFootAdjust=Ie,W.hip.position.x=W.side*v+ce.restHipShift*je,W.hip.position.y=Mt(ss.hipHeight-Re,ce.restHipHeight,De),W.hip.position.z=J*(1-De);const ke=W.side>0?je:0,He=Math.max(ke,ot),U=ot>ke?W.side*ce.crashFootOutboard:ce.restFootOutboard;Ae.set(Mt(W.target.x,U,He),Mt(W.target.y+he,ce.ankleAbovePedal+ge,He),Mt(W.target.z+Ie,-ce.restFootBack,He)),oa({origin:W.hip.position,target:Ae,upperLength:ce.thighLength,lowerLength:ce.shinLength,bendToward:ue>0?X.set(Math.sign(W.side)*ue,0,1).normalize():gu},j,ie),W.hip.quaternion.copy(j),W.knee.quaternion.copy(ie),W.ankle.quaternion.copy(j).multiply(ie).invert()}for(const W of g){const de=_e!==0&&Math.sign(W.side)===_e,Re=(B+Y)*ce.armLoadSplay+Ce*(de?-ce.armCarveInsideTuck:ce.armCarveOutsideSplay)+$e*ce.airArmSplay+Tt*ce.wobbleArmSplay+ot*ce.crashArmSplay+dt*ce.tuckArmSplay,ue=Y*ce.armBrakeForward-B*ce.armAccelBack-dt*ce.tuckArmBack,he=(de?0:Ce*ce.armCarveOutsideRise)+$e*ce.airArmRise+Tt*ce.wobbleArmRise-dt*ce.tuckArmDrop+ot*ce.crashArmRise;Math.abs(Re-W.lastSplay)<1e-6&&Math.abs(ue-W.lastForward)<1e-6&&Math.abs(he-W.lastRise)<1e-6||(W.lastSplay=Re,W.lastForward=ue,W.lastRise=he,W.target.set(Math.sign(W.side)*(W.baseSplay+Re),W.baseTarget.y+he,W.baseTarget.z+ue),oa({origin:W.shoulder.position,target:W.target,upperLength:ce.upperArmLength,lowerLength:ce.forearmLength,bendToward:W.bendToward},j,ie),W.shoulder.quaternion.copy(j),W.elbow.quaternion.copy(ie))}const ee=pe-se.torsoPitch;C.rotation.x=-gt((te+ce.torsoRestPitch)*ce.headStabilizationFactor,-ce.headStabilizationMax,ce.headStabilizationMax)-gt(ee*ce.tuckHeadStabilization,0,ce.tuckHeadStabilizationMax)-(se.falling?$e*ce.airHeadDown:0),C.rotation.y=re},dispose(){for(const se of e)se.dispose();for(const se of t)se.dispose();e.length=0,t.length=0,i.removeFromParent()}}}function lf(){const i=new It;i.name="riding-rig";const e=new It;e.name="riding-ground-pivot",i.add(e);const t=new It;t.name="riding-lean-pivot",e.add(t);const n=bS(),s=RS();t.add(n.group),t.add(s.root);const r=_S();let a=0;return{group:i,groundPivot:e,leanPivot:t,euc:n,rider:s,apply(o){i.position.set(o.x,o.y,o.z),i.rotation.y=o.headingY+o.wobbleYaw,e.rotation.x=o.groundPitch,e.rotation.z=o.groundRoll;const l=o.wobbleYaw*ce.wobbleWheelRock;t.rotation.z=-o.rollAngle-l,t.rotation.x=o.wheelPitch,n.body.position.y=o.suspensionOffset,s.root.position.set(o.crashLateral,o.suspensionOffset-o.crashDrop,o.crashForward),s.root.rotation.set(o.crashTumble,0,o.crashRoll),n.tyre.rotation.x=o.wheelSpin,n.group.rotation.z=ce.restWheelLean*o.restFactor-o.wheelCrashLean,s.pelvis.rotation.z=-(o.riderRoll-o.rollAngle)+l*ce.wobbleTorsoLevel,r.rollAngle=o.rollAngle,r.riderPitch=o.riderPitch,r.torsoPitch=o.riderPitch-o.wheelPitch+ce.torsoRestPitch,r.lookYaw=o.riderLookYaw,r.restFactor=o.restFactor,r.groundY=-o.suspensionOffset,r.crouch=o.crouch,r.tuck=o.tuck,r.airBlend=o.airBlend,r.falling=o.airHeight>0&&o.airHeight<a,a=o.airHeight,r.pedalStrike=o.pedalStrike,r.wobble=o.wobble,r.wobbleFootCorrection=o.wobbleFootCorrection,r.wobbleYaw=o.wobbleYaw,r.crash=o.crashBlend,s.applyStanceReaction(r)},applyStatus(o,l,c=0){n.setStatus(o,l,c)},dispose(){n.dispose(),s.dispose(),i.removeFromParent()}}}function CS(i,e,t){const n=e*(at.pedalSpan/2),s=at.pedalHeight+i.suspensionOffset,r=Math.cos(i.rollAngle),a=Math.sin(i.rollAngle),o=n*r+s*a,l=s*r-n*a,c=Math.cos(i.headingY),u=Math.sin(i.headingY);return t.set(i.x+o*c,i.y+l,i.z-o*u)}function PS(){const i=new It;i.name="ghost-rider",i.visible=!1;const e=lf();i.add(e.group),e.group.traverse(d=>{d.name!==""&&(d.name=`ghost-${d.name}`)});const t=new Za({color:Ft.ghost,transparent:!0,opacity:qe.ghostOpacity,depthWrite:!1,depthTest:!0,fog:!0}),n=()=>{};let s=0,r=0;e.group.traverse(d=>{if(d.isMesh!==!0)return;const h=d,f=h.castShadow;if(h.castShadow=!1,h.receiveShadow=!1,h.raycast=n,h.material=t,!f){h.visible=!1;return}s+=1;const v=h.geometry,_=v.getIndex();r+=(_!==null?_.count:v.getAttribute("position").count)/3});const a=Ra();let o=null,l=0,c=0;const u=at.tyreDiameter/2;return{group:i,get drawCalls(){return s},get triangles(){return r},get visible(){return i.visible},setVisible(d){i.visible=d},apply(d){const h=o,f=h===null||d.t<h?0:d.t-h;(h===null||d.t<h)&&(l=0,c=0),o=d.t,a.x=d.x,a.y=d.y,a.z=d.z,a.headingY=d.headingY,a.rollAngle=d.rollAngle,a.speed=d.speed,a.groundY=d.groundY,a.crouch=d.crouch,a.riderRoll=d.rollAngle*Q.riderUpperBodyRollFactor,l+=d.speed*f/u,a.wheelSpin=l;const v=Math.max(0,d.y-d.groundY),_=v>qe.ghostPositionStep;a.airHeight=v,c=Xe(c,_?1:0,Q.crouchResponseSeconds,1/0,f),a.airBlend=c,a.tuck=_?0:d.crouch,e.apply(a)},dispose(){e.dispose(),t.dispose(),i.clear(),i.removeFromParent()}}}function la(i,e){let t=i*374761393+e*668265263|0;return t=t^t>>>13|0,t=Math.imul(t,1274126177)|0,t=(t^t>>>16)>>>0,t/4294967296}function Mu(i){const{capacity:e}=i,t=new Float32Array(e*3),n=new Float32Array(e*3),s=new Float32Array(e),r=new Float32Array(e),a=new Float32Array(e),o=new Float32Array(e),l=new Float32Array(e),c=new Float32Array(e*3),u=new Float32Array(e*3),d=new Ut,h=new dn(t,3),f=new dn(n,3);h.setUsage(oh),f.setUsage(oh),d.setAttribute("position",h),d.setAttribute("color",f),d.setDrawRange(0,0),d.boundingSphere=new ms(new I,1/0);const v=new Hd({size:i.size,sizeAttenuation:!0,vertexColors:!0,transparent:!0,depthWrite:!1,fog:!0}),_=new ym(d,v);_.name=i.name,_.visible=!1,_.frustumCulled=!1;const p=new Ve,g=new Ve;let M=0,T=0,S=0;const R=(y,E)=>{const m=y*3;n[m]=u[m]+(c[m]-u[m])*E,n[m+1]=u[m+1]+(c[m+1]-u[m+1])*E,n[m+2]=u[m+2]+(c[m+2]-u[m+2])*E};return{points:_,get live(){return M},emit(y){const E=Math.min(Math.max(0,Math.floor(y.count)),e);if(E===0||!(y.lifeSeconds>0))return;p.set(y.colour),y.intensity!==void 0&&y.intensity!==1&&p.multiplyScalar(y.intensity),g.set(y.fadeTo??i.fadeTo);const m=Math.hypot(y.axisX,y.axisY,y.axisZ),x=m>1e-9?y.axisX/m:0,A=m>1e-9?y.axisY/m:1,C=m>1e-9?y.axisZ/m:0,L=Math.abs(A)<.9?0:1,F=Math.abs(A)<.9?1:0;let z=A*0-C*F,D=C*L-x*0,H=x*F-A*L;const G=Math.hypot(z,D,H)||1;z/=G,D/=G,H/=G;const K=A*H-C*D,ne=C*z-x*H,X=x*D-A*z;for(let j=0;j<E;j+=1){T+=1;let ie;M<e?(ie=M,M+=1):(ie=S,S=(S+1)%e);const Ae=la(T,1)*Math.PI*2,Oe=Math.sqrt(la(T,2))*y.spread,se=y.speed*(.55+.45*la(T,3)),V=Math.sin(Oe),te=Math.cos(Oe),re=z*Math.cos(Ae)+K*Math.sin(Ae),ge=D*Math.cos(Ae)+ne*Math.sin(Ae),Ce=H*Math.cos(Ae)+X*Math.sin(Ae),_e=ie*3;t[_e]=y.x,t[_e+1]=y.y,t[_e+2]=y.z,s[ie]=(x*te+re*V)*se,r[ie]=(A*te+ge*V)*se,a[ie]=(C*te+Ce*V)*se,l[ie]=y.lifeSeconds*(.65+.35*la(T,4)),o[ie]=l[ie],c[_e]=p.r,c[_e+1]=p.g,c[_e+2]=p.b,u[_e]=g.r,u[_e+1]=g.g,u[_e+2]=g.b,R(ie,1)}_.visible=!0,h.needsUpdate=!0,f.needsUpdate=!0,d.setDrawRange(0,M)},step(y){if(M===0||y<=0)return;let E=0;for(let m=0;m<M;m+=1){const x=o[m]-y;if(x<=0)continue;r[m]-=i.gravity*y;const A=m*3,C=t[A]+s[m]*y,L=t[A+1]+r[m]*y,F=t[A+2]+a[m]*y,z=E*3;t[z]=C,t[z+1]=L,t[z+2]=F,s[E]=s[m],r[E]=r[m],a[E]=a[m],o[E]=x,l[E]=l[m],c[z]=c[A],c[z+1]=c[A+1],c[z+2]=c[A+2],u[z]=u[A],u[z+1]=u[A+1],u[z+2]=u[A+2],R(E,x/l[E]),E+=1}M=E,S=0,_.visible=M>0,d.setDrawRange(0,M),h.needsUpdate=!0,f.needsUpdate=!0},clear(){M=0,S=0,T=0,_.visible=!1,d.setDrawRange(0,0)},dispose(){d.dispose(),v.dispose(),_.removeFromParent()}}}function LS(i,e){const t=Math.cos(e);return{x:Math.sin(i)*t,y:Math.sin(e),z:Math.cos(i)*t}}function $o(i){return i<=.04045?i/12.92:((i+.055)/1.055)**2.4}function Zo(i){return i<=.0031308?i*12.92:1.055*i**(1/2.4)-.055}function cr(i){return{r:$o((i>>16&255)/255),g:$o((i>>8&255)/255),b:$o((i&255)/255)}}function ca(i,e){let t=Math.imul(i|0,668265261)^Math.imul(e|0,374761393);return t=Math.imul(t^t>>>15,725569117),t^=t>>>13,(t>>>0)/4294967295}function Ya(i){return i*i*(3-2*i)}function DS(i,e){const t=Math.floor(i),n=Math.floor(e),s=Ya(i-t),r=Ya(e-n),a=ca(t,n),o=ca(t+1,n),l=ca(t,n+1),c=ca(t+1,n+1);return(a+(o-a)*s)*(1-r)+(l+(c-l)*s)*r}function IS(i,e){let t=0,n=.5,s=0,r=1;for(let a=0;a<4;a+=1)t+=DS(i*r,e*r)*n,s+=n,n*=.5,r*=2.07;return t/s}function FS(i){const{width:e,height:t}=i,n=new Uint8ClampedArray(e*t*4),s=cr(i.zenithColour),r=cr(i.horizonColour),a=cr(i.sunColour),o=cr(i.cloudLitColour),l=cr(i.cloudShadeColour),c=LS(i.sunAzimuth,i.sunElevation),u=Math.max(i.cloudHorizonFade,.001);let d=0;for(let h=0;h<t;h+=1){const f=(h+.5)/t,v=Math.PI*(f-.5),_=Math.sin(v),p=Math.cos(v),g=Math.max(0,_)**i.gradientExponent,M=r.r+(s.r-r.r)*g,T=r.g+(s.g-r.g)*g,S=r.b+(s.b-r.b)*g,R=_<=u?0:Ya(Math.min(1,(_-u)/(u*4+1e-6))),y=1/Math.max(_,u);for(let E=0;E<e;E+=1){const m=(E+.5)/e,x=Math.PI*2*(m-.5),A=Math.cos(x)*p,C=Math.sin(x)*p;let L=M,F=T,z=S;if(i.sunHorizonWarmth>0&&_>0){const X=Math.hypot(A,C)||1e-6,j=Math.hypot(c.x,c.z)||1e-6,ie=(A*c.x+C*c.z)/(X*j),Ae=Math.acos(Math.max(-1,Math.min(1,ie))),Oe=Math.exp(-((Ae/i.sunHorizonSpread)**2)),se=_/Math.max(i.sunHorizonPeak,1e-4),V=se*Math.exp(1-se),te=i.sunHorizonWarmth*Oe*V;te>.001&&(L+=(a.r-L)*te,F+=(a.g-F)*te,z+=(a.b-z)*te)}if(R>0){const X=A*y,j=C*y,ie=IS(X*i.cloudScale,j*i.cloudScale),Ae=1-i.cloudCoverage,Oe=Math.max(0,Math.min(1,(ie-Ae)/Math.max(i.cloudSoftness,1e-4)))*R;if(Oe>0){const se=Math.min(1,(ie-Ae)/.35),V=l.r+(o.r-l.r)*se,te=l.g+(o.g-l.g)*se,re=l.b+(o.b-l.b)*se,ge=Ya(Oe);L+=(V-L)*ge,F+=(te-F)*ge,z+=(re-z)*ge}}const D=Math.max(-1,Math.min(1,A*c.x+_*c.y+C*c.z)),H=Math.acos(D),G=Math.exp(-((H/i.sunCoreSpread)**2)),K=Math.exp(-((H/i.sunGlowSpread)**2))*i.sunGlowStrength,ne=Math.min(1,G+K*.5);if(ne>.001){const X=1+G*3;L+=(a.r*X-L)*ne,F+=(a.g*X-F)*ne,z+=(a.b*X-z)*ne}n[d]=Zo(Math.max(0,Math.min(1,L)))*255,n[d+1]=Zo(Math.max(0,Math.min(1,F)))*255,n[d+2]=Zo(Math.max(0,Math.min(1,z)))*255,n[d+3]=255,d+=4}}return n}function US(){const i=Be.skyTextureWidth,e=Be.skyTextureHeight,t=FS({width:i,height:e,zenithColour:Be.skyZenithColour,horizonColour:Be.horizonColour,gradientExponent:Be.skyGradientExponent,sunAzimuth:Be.sunAzimuth,sunElevation:Be.sunElevation,sunColour:Be.skySunColour,sunCoreSpread:Be.skySunCoreSpread,sunGlowSpread:Be.skySunGlowSpread,sunGlowStrength:Be.skySunGlowStrength,sunHorizonWarmth:Be.skySunHorizonWarmth,sunHorizonSpread:Be.skySunHorizonSpread,sunHorizonPeak:Be.skySunHorizonPeak,cloudLitColour:Be.skyCloudLitColour,cloudShadeColour:Be.skyCloudShadeColour,cloudCoverage:Be.skyCloudCoverage,cloudSoftness:Be.skyCloudSoftness,cloudScale:Be.skyCloudScale,cloudHorizonFade:Be.skyCloudHorizonFade}),n=new Pc(t,i,e,En);return n.name="sky",n.mapping=xa,n.colorSpace=cn,n.wrapS=Oa,n.wrapT=$n,n.magFilter=Zt,n.minFilter=zi,n.generateMipmaps=!0,n.anisotropy=1,n.needsUpdate=!0,{texture:n,dispose(){n.dispose()}}}const yu=Ht({road:{albedo:11645098,wear:.16},path:{albedo:9079173,wear:.26}}),jn=Ht({centreWidth:.16,edgeWidth:.13,barWidth:.42,dashLength:3,dashGap:4.5,lift:.015,sampleStep:1.25,minRunLength:2,colliderClearance:.15,maxDrawCalls:2,maxTriangles:12e3}),NS=Ht(["pavement","roughPavement","brick","wood"]);function kS(i){return i==="centre"?jn.centreWidth:i==="bar"?jn.barWidth:jn.edgeWidth}Ht(["broadleafTree","treeCanopy","conifer","shrub","lampPost","bench","litterBin","bollardCap","signpost","fenceBay","building"]);const ui=Ht({broadleafFoliage:4480059,coniferFoliage:3755320,shrubFoliage:5138242,lampHead:12763061,signPlate:5859456,buildingPale:10789791,buildingWarm:9998472,buildingCool:8685709,buildingCap:7368557}),Ko=Ht([ui.buildingPale,ui.buildingWarm,ui.buildingCool]),sn=Ht({foliage:.16,structure:.07,building:.12}),fe=Ht({broadleafTree:{trunkRadiusTop:.19,trunkRadiusBase:.3,trunkHeight:3.1,trunkSides:6,crownRadius:2.45,crownHeight:3.4,crownCentre:4.6,upperRadius:1.55,upperCentre:6.3,upperOffset:.75},conifer:{tiers:[{radius:2.2,height:4.3,base:.45},{radius:1.55,height:3.5,base:3.3},{radius:.95,height:2.7,base:5.9}],tierSides:6},shrub:{radius:.95,scaleX:1.15,scaleY:.78,scaleZ:.95,centre:.62},lampPost:{postRadius:.085,postHeight:4.6,postSides:6,armLength:.95,armThickness:.1,headWidth:.52,headHeight:.2,headDepth:.34,headReach:.95},bench:{length:1.85,seatHeight:.46,seatThickness:.09,seatDepth:.46,backHeight:.4,backThickness:.08,legThickness:.09},litterBin:{radiusTop:.27,radiusBase:.22,height:.82,sides:8,rimHeight:.07},bollardCap:{radius:.135,scaleY:.72},signpost:{postRadius:.055,postHeight:2.45,postSides:6,plateWidth:1.05,plateHeight:.32,plateThickness:.06,plateCentre:2.1,lowerWidth:.72,lowerHeight:.26,lowerCentre:1.68},fenceBay:{length:2.4,postWidth:.11,postHeight:1.02,railThickness:.05,railHeight:.09,railUpper:.88,railLower:.5},building:{capHeight:.75,capOversail:.45,towerWidthFraction:.46,towerHeightFraction:.22}}),ki=Ht({broadleafTree:{shape:"circle",radius:fe.broadleafTree.trunkRadiusBase},treeCanopy:{shape:"circle",radius:0},conifer:{shape:"circle",radius:Math.max(...fe.conifer.tiers.map(i=>i.radius))},shrub:{shape:"circle",radius:fe.shrub.radius*Math.max(fe.shrub.scaleX,fe.shrub.scaleZ)},lampPost:{shape:"circle",radius:fe.lampPost.postRadius*1.35},bench:{shape:"box",halfX:fe.bench.length/2,halfZ:fe.bench.seatDepth/2},litterBin:{shape:"circle",radius:fe.litterBin.radiusTop*1.12},bollardCap:{shape:"circle",radius:0},signpost:{shape:"circle",radius:fe.signpost.plateWidth},fenceBay:{shape:"box",halfX:fe.fenceBay.postWidth/2,halfZ:fe.fenceBay.length/2},building:{shape:"box",halfX:.5,halfZ:.5}}),cf=Ht({broadleafTree:{shape:"circle",radius:fe.broadleafTree.crownRadius},treeCanopy:{shape:"circle",radius:fe.broadleafTree.crownRadius},conifer:ki.conifer,shrub:ki.shrub,lampPost:{shape:"circle",radius:fe.lampPost.headReach+fe.lampPost.headDepth/2},bench:ki.bench,litterBin:ki.litterBin,bollardCap:{shape:"circle",radius:fe.bollardCap.radius},signpost:ki.signpost,fenceBay:ki.fenceBay,building:{shape:"box",halfX:.5,halfZ:.5}}),OS=Ht({broadleafTree:{bottom:0,top:Math.max(fe.broadleafTree.trunkHeight,fe.broadleafTree.crownCentre+fe.broadleafTree.crownHeight/2,fe.broadleafTree.upperCentre+fe.broadleafTree.upperRadius*.85)},treeCanopy:{bottom:fe.broadleafTree.crownCentre-fe.broadleafTree.crownHeight/2,top:Math.max(fe.broadleafTree.crownCentre+fe.broadleafTree.crownHeight/2,fe.broadleafTree.upperCentre+fe.broadleafTree.upperRadius*.85)},conifer:{bottom:Math.min(...fe.conifer.tiers.map(i=>i.base)),top:Math.max(...fe.conifer.tiers.map(i=>i.base+i.height))},shrub:{bottom:fe.shrub.centre-fe.shrub.radius*fe.shrub.scaleY,top:fe.shrub.centre+fe.shrub.radius*fe.shrub.scaleY},lampPost:{bottom:0,top:fe.lampPost.postHeight},bench:{bottom:0,top:fe.bench.seatHeight+fe.bench.backHeight},litterBin:{bottom:0,top:fe.litterBin.height+fe.litterBin.rimHeight},bollardCap:{bottom:-fe.bollardCap.radius*fe.bollardCap.scaleY,top:fe.bollardCap.radius*fe.bollardCap.scaleY},signpost:{bottom:0,top:fe.signpost.postHeight},fenceBay:{bottom:0,top:fe.fenceBay.postHeight},building:{bottom:0,top:1}}),Ii=.886,zS=Ht({broadleafTree:{halfX:fe.broadleafTree.trunkRadiusBase*Ii,halfZ:fe.broadleafTree.trunkRadiusBase*Ii,height:fe.broadleafTree.trunkHeight,surface:"wood",occludes:!1},treeCanopy:null,conifer:{halfX:.55,halfZ:.55,height:8.6,surface:"wood",occludes:!1},shrub:null,lampPost:{halfX:fe.lampPost.postRadius*Ii,halfZ:fe.lampPost.postRadius*Ii,height:fe.lampPost.postHeight,surface:"pavement",occludes:!1},bench:{halfX:fe.bench.length/2,halfZ:fe.bench.seatDepth/2,height:fe.bench.seatHeight+fe.bench.backHeight,surface:"wood",occludes:!1},litterBin:{halfX:fe.litterBin.radiusTop*Ii,halfZ:fe.litterBin.radiusTop*Ii,height:fe.litterBin.height+fe.litterBin.rimHeight,surface:"pavement",occludes:!1},bollardCap:null,signpost:{halfX:fe.signpost.postRadius*Ii,halfZ:fe.signpost.postRadius*Ii,height:fe.signpost.postHeight,surface:"pavement",occludes:!1},fenceBay:{halfX:fe.fenceBay.postWidth/2,halfZ:fe.fenceBay.length/2,height:fe.fenceBay.postHeight,surface:"wood",occludes:!1},building:{halfX:.5,halfZ:.5,height:1,surface:"pavement",occludes:!0}}),BS=.6,HS=.15,gi=Ht({lowFloors:4,highFloors:11,highRiseHeight:26,minFloorHeight:2,maxFloorHeight:7,glazing:.55,glassTint:{r:.42,g:.46,b:.58},solidGroundFloor:!0});Ht({maxDrawCalls:32,maxTriangles:9e4,maxTrianglesPerProp:60});const hf=7,GS=.6,VS=6;function zc(i){return{x:Math.sin(i),z:Math.cos(i)}}function us(i){return{x:Math.cos(i),z:-Math.sin(i)}}function WS(i,e,t,n){return Math.atan2(e*t-i*n,i*t+e*n)}function uf(i){return i*i*(3-2*i)}function XS(i){return 6*i*(1-i)}function df(i,e){const t=i.climb??0;if(t===0)return 0;const n=i.length>0?Math.min(1,Math.max(0,e/i.length)):0;return t*(i.linearClimb===!0?n:uf(n))}function wu(i,e){const t=i.climb??0;if(t===0||i.length<=0)return 0;const n=Math.min(1,Math.max(0,e/i.length)),s=i.linearClimb===!0?t/i.length:t/i.length*XS(n);return s===0?0:Math.atan(s)}function YS(i,e){if(i.length<=0)return 0;const t=Math.min(VS,i.length/3);if(t<=0)return 1;const n=Math.min(1,Math.max(0,e/t)),s=Math.min(1,Math.max(0,(i.length-e)/t));return uf(Math.min(n,s))}function qS(i,e,t){const n=i.crown??0,s=i.crossSlope??0;if(n===0&&s===0)return 0;const r=i.halfWidth,a=r>0?Math.min(r,Math.max(-r,t)):0,o=r>0?a/r:0,l=(-n*o*o+Math.tan(s)*a)*YS(i,e);return l===0?0:l}function Bc(i,e,t,n){return i.position.y+df(e,t)+qS(e,t,n)}function Qs(i,e,t){return i.headingY+(e.curvature??0)*t}function gs(i,e,t){const n=e.curvature??0,s=i.headingY,r=i.position.y+df(e,t);if(n===0){const o=zc(s);return{x:i.position.x+o.x*t,y:r,z:i.position.z+o.z*t}}const a=s+n*t;return{x:i.position.x+(Math.cos(s)-Math.cos(a))/n,y:r,z:i.position.z+(Math.sin(a)-Math.sin(s))/n}}function Eu(i,e){const t=[];let n={...e.position},s=e.headingY;for(const r of i){const a={position:{...n},headingY:s,surface:r.surface,halfWidth:r.halfWidth,gradient:wu(r,0)},o=gs(a,r,r.length),l={position:o,headingY:Qs(a,r,r.length),surface:r.surface,halfWidth:r.halfWidth,gradient:wu(r,r.length)};t.push({spec:r,entry:a,exit:l,...$S(a,r)}),n={...o},s=l.headingY}return t}function ff(i,e){const t=Eu(i.main,e),n=new Map;for(const s of t){if(n.has(s.spec.id))throw new Error(`duplicate segment id "${s.spec.id}"`);n.set(s.spec.id,s)}for(const s of i.branches??[]){const r=n.get(s.from);if(r===void 0)throw new Error(`branch from unknown or not-yet-placed segment "${s.from}"`);const a=Math.min(r.spec.length,Math.max(0,s.atDistance??r.spec.length)),o=s.lateralOffset??0,l=Qs(r.entry,r.spec,a),c=gs(r.entry,r.spec,a),u=us(l),d={position:{x:c.x+u.x*o,y:Bc(r.entry,r.spec,a,o)+(s.elevationOffset??0),z:c.z+u.z*o},headingY:l+(s.headingOffset??0)};for(const h of Eu(s.specs,d)){if(n.has(h.spec.id))throw new Error(`duplicate segment id "${h.spec.id}"`);n.set(h.spec.id,h),t.push(h)}}return t}function $S(i,e){const t=e.halfWidth+(e.shoulder??hf);let n=1/0,s=-1/0,r=1/0,a=-1/0;const o=24;for(let l=0;l<=o;l+=1){const c=gs(i,e,e.length*l/o);c.x<n&&(n=c.x),c.x>s&&(s=c.x),c.z<r&&(r=c.z),c.z>a&&(a=c.z)}return{minX:n-t,maxX:s+t,minZ:r-t,maxZ:a+t}}function ja(i,e,t){if(e<i.minX||e>i.maxX||t<i.minZ||t>i.maxZ)return null;const{spec:n,entry:s}=i,r=n.curvature??0;let a,o;if(r===0){const d=e-s.position.x,h=t-s.position.z,f=zc(s.headingY),v=us(s.headingY);a=d*f.x+h*f.z,o=d*v.x+h*v.z}else{const d=us(s.headingY),h=s.position.x+d.x/r,f=s.position.z+d.z/r,v=e-h,_=t-f,p=Math.hypot(v,_),g=s.position.x-h,M=s.position.z-f;a=WS(g,M,v,_)/r,o=Math.sign(r)*(1/Math.abs(r)-p)}const l=Math.min(n.length,Math.max(0,a)),c=Math.max(0,Math.abs(o)-n.halfWidth),u=Math.max(0,-a,a-n.length);return{s:l,t:o,outside:Math.hypot(c,u),height:Bc(s,n,l,o)}}function ZS(i,e){const t=i.bands;if(t!==void 0)for(const n of t){const s=Math.min(n.from,n.to),r=Math.max(n.from,n.to);if(e>=s&&e<r)return n.surface}return i.surface}function KS(i){const{spec:e,entry:t}=i,n=e.props??[],s=[];for(const r of n){const a=Qs(t,e,r.s),o=gs(t,e,r.s),l=us(a);s.push({kind:r.kind,x:o.x+l.x*r.t,z:o.z+l.z*r.t,rotationY:a+(r.yaw??0),scale:r.scale??1,...r.size===void 0?{}:{size:{...r.size}},lift:r.lift??0,...r.onCollider===!0?{onCollider:!0}:{}})}return s}function JS(i,e=jn.sampleStep){const{spec:t,entry:n}=i,s=t.markings??[],r=[],a=(o,l)=>{const c=Qs(n,t,o),u=gs(n,t,o),d=us(c);return{x:u.x+d.x*l,z:u.z+d.z*l}};for(const o of s){if(o.path.length<2)continue;const l=[a(o.path[0].s,o.path[0].t)];for(let c=1;c<o.path.length;c+=1){const u=o.path[c-1],d=o.path[c],h=Math.hypot(d.s-u.s,d.t-u.t),f=Math.max(1,Math.ceil(h/e));for(let v=1;v<=f;v+=1){const _=v/f;l.push(a(u.s+(d.s-u.s)*_,u.t+(d.t-u.t)*_))}}r.push({points:l,width:kS(o.role),dash:o.broken===!0?jn.dashLength:0,gap:o.broken===!0?jn.dashGap:0,paint:o.paint??"road"})}return r}function QS(i){const{spec:e,entry:t}=i,n=e.blocks??[],s=[];for(const r of n){const a=Qs(t,e,r.s),o=gs(t,e,r.s),l=us(a),c=r.depth??GS,u=Bc(t,e,r.s,r.t);s.push({centre:{x:o.x+l.x*r.t,y:u+(r.height-c)/2,z:o.z+l.z*r.t},halfExtents:{x:r.halfLateral,y:(r.height+c)/2,z:r.halfAlong},rotationY:a,surface:r.surface,...r.appearance===void 0?{}:{appearance:r.appearance}})}return s}const jS=1;function ex(i){return i<0?0:i>1?1:i}function tx(i){return i*i*(3-2*i)}function Tu(i,e,t){let n=null;for(const s of i){const r=ja(s,e,t);r!==null&&(n===null||r.outside<n.outside||r.outside===n.outside&&Math.abs(r.t)<Math.abs(n.t))&&(n={segment:s,outside:r.outside,t:r.t,height:r.height})}return n}function nx(i){return Array.isArray(i)?{main:i}:i}function pf(i,e){const t=e.spacing??jS,n=ff(nx(i),e.spawn);if(n.length===0)throw new Error("a level plan needs at least one segment");let s=1/0,r=-1/0,a=1/0,o=-1/0;for(const D of n)D.minX<s&&(s=D.minX),D.maxX>r&&(r=D.maxX),D.minZ<a&&(a=D.minZ),D.maxZ>o&&(o=D.maxZ);const l=t*2,c=Math.floor((s-l)/t)*t,u=Math.floor((a-l)/t)*t,d=Math.ceil((r+l-c)/t)+1,h=Math.ceil((o+l-u)/t)+1,f=new Array(d*h);for(let D=0;D<h;D+=1){const H=u+D*t;for(let G=0;G<d;G+=1){const K=c+G*t,ne=Tu(n,K,H);if(ne===null){f[D*d+G]=e.surround.height;continue}const X=ne.segment.spec.shoulder??hf,j=X>0?1-tx(ex(ne.outside/X)):0;f[D*d+G]=e.surround.height+(ne.height-e.surround.height)*j}}const v=d-1,_=h-1,p=new Array(v*_);for(let D=0;D<_;D+=1){const H=u+(D+.5)*t;for(let G=0;G<v;G+=1){const K=c+(G+.5)*t,ne=Tu(n,K,H);p[D*v+G]=ne!==null&&ne.outside===0?ZS(ne.segment.spec,ne.t):e.surround.surface}}const g={originX:c,originZ:u,spacing:t,columns:d,rows:h,heights:f,surfaces:p},M=n.map(D=>({id:D.spec.id,entry:D.entry,exit:D.exit,colliders:QS(D)})),T=n.flatMap(KS),S=new Set(T),R=M.flatMap(D=>D.colliders),E=[...T,...e.props??[]].filter(D=>D.onCollider===!0||!fx(n,D)).filter(D=>D.onCollider===!0||!vx(g,e.surround,R,D)),m=[];for(const D of E)D.kind==="building"&&(m.some(H=>px(H,D)||S.has(H)&&S.has(D)&&gx(H,D)>HS)||m.push(D));const x=E.filter(D=>D.kind==="building"?m.includes(D):D.onCollider===!0||!Mx(m,D,BS)),C=_x(g,e.surround,x).map(D=>xx(g,e.surround,D)),L=[];for(const D of C){const H=ix(D);H!==null&&L.push(H)}const F=[];for(const D of n)for(const H of JS(D))F.push(...ox(n,R,g,e.surround,H));const z=sx(n,g,e.surround,e.checkpoints);return{id:e.id,spawn:{position:{...e.spawn.position},headingY:e.spawn.headingY},surround:{...e.surround},heightfield:g,segments:M,checkpoints:z,...C.length===0?{}:{props:C},...L.length===0?{}:{solids:L},...F.length===0?{}:{markings:F}}}function ix(i){const e=zS[i.kind];if(e===null)return null;const t=i.kind==="building"?i.size??{x:12,y:18,z:12}:{x:1,y:1,z:1},n=e.halfX*i.scale*t.x,s=e.halfZ*i.scale*t.z,r=e.height*i.scale*t.y;return{centre:{x:i.position.x,y:i.position.y+r/2,z:i.position.z},halfExtents:{x:n,y:r/2,z:s},rotationY:i.rotationY,surface:e.surface,...e.occludes?{}:{occludes:!1}}}function sx(i,e,t,n){if(n===void 0||n.length===0)return[];rx(n);const s=new Map(i.map(r=>[r.spec.id,r]));return n.map((r,a)=>{const o=s.get(r.segment);if(o===void 0)throw new Error(`checkpoint "${r.id}" is authored on segment "${r.segment}", which the graph never places`);if(!Number.isFinite(r.s)||r.s<0||r.s>o.spec.length)throw new Error(`checkpoint "${r.id}" sits at s=${r.s} on "${r.segment}", which is ${o.spec.length} m long`);const l=Qs(o.entry,o.spec,r.s),c=gs(o.entry,o.spec,r.s),u={x:o.spec.halfWidth+qe.gateWidthMargin,y:qe.gateHalfHeight,z:qe.gateHalfDepth};return{id:r.id,centre:{x:c.x,y:ax(e,t,c.x,c.z,l,o.spec.halfWidth)+qe.gateHalfHeight,z:c.z},halfExtents:u,headingY:l,routeIndex:a,kind:r.kind,label:r.label}})}function rx(i){if(i.length<2)throw new Error("a timed route needs at least a start and a finish");const e=new Set;i.forEach((t,n)=>{if(e.has(t.id))throw new Error(`duplicate checkpoint id "${t.id}"`);e.add(t.id);const s=n===0?"start":n===i.length-1?"finish":"split";if(t.kind!==s)throw new Error(`checkpoint "${t.id}" is a ${t.kind} at route index ${n}, where a ${s} belongs`)})}function ax(i,e,t,n,s,r){const a=us(s),o=zc(s),l=qe.gateHalfDepth,c=i.spacing/4,u=Math.max(2,Math.ceil(r*2/c)),d=Math.max(2,Math.ceil(l*2/c));let h=1/0;for(let f=0;f<=u;f+=1){const v=-r+r*2*f/u;for(let _=0;_<=d;_+=1){const p=-l+l*2*_/d;h=Math.min(h,ds(i,e,t+a.x*v+o.x*p,n+a.z*v+o.z*p))}}return h}function ox(i,e,t,n,s){const r=[];let a=[];const o=()=>{a.length>=2&&ux(a)>=jn.minRunLength&&r.push({points:a,width:s.width,dash:s.dash,gap:s.gap,paint:s.paint}),a=[]};for(let l=0;l<s.points.length;l+=1){const c=s.points[l],u=s.points[Math.max(0,l-1)],d=s.points[Math.min(s.points.length-1,l+1)],h=d.x-u.x,f=d.z-u.z,v=Math.hypot(h,f),_=v>1e-9?f/v:0,p=v>1e-9?-h/v:0,g=s.width/2;if(![-g,0,g].every(T=>lx(i,e,t,n,c.x+_*T,c.z+p*T))){o();continue}a.push({x:c.x,y:ds(t,n,c.x,c.z)+jn.lift,z:c.z})}return o(),r}function lx(i,e,t,n,s,r){let a=!1;for(const o of i){const l=ja(o,s,r);if(l!==null&&l.outside===0){a=!0;break}}if(!a||!NS.includes(hx(t,n,s,r)))return!1;for(const o of e)if(cx(o,s,r,jn.colliderClearance))return!1;return!0}function cx(i,e,t,n){const s=e-i.centre.x,r=t-i.centre.z,a=Math.cos(i.rotationY),o=Math.sin(i.rotationY),l=a*s-o*r,c=o*s+a*r;return Math.abs(l)<=i.halfExtents.x+n&&Math.abs(c)<=i.halfExtents.z+n}function hx(i,e,t,n){const s=Math.floor((t-i.originX)/i.spacing),r=Math.floor((n-i.originZ)/i.spacing);return s<0||r<0||s>=i.columns-1||r>=i.rows-1?e.surface:i.surfaces[r*(i.columns-1)+s]}function ux(i){let e=0;for(let t=1;t<i.length;t+=1)e+=Math.hypot(i[t].x-i[t-1].x,i[t].z-i[t-1].z);return e}const dx=.5;function fx(i,e){const t=[[e.x,e.z]],n=ki[e.kind];if(n.shape==="circle"){const s=n.radius*e.scale;for(let r=0;r<16&&s>0;r+=1){const a=r/16*Math.PI*2;t.push([e.x+Math.cos(a)*s,e.z+Math.sin(a)*s])}}else{const s=Math.cos(e.rotationY),r=Math.sin(e.rotationY),a=(e.size?.x??n.halfX*2)*e.scale/2,o=(e.size?.z??n.halfZ*2)*e.scale/2;for(const[l,c]of[[-a,-o],[0,-o],[a,-o],[-a,0],[a,0],[-a,o],[0,o],[a,o]])t.push([e.x+s*l+r*c,e.z-r*l+s*c])}for(const[s,r]of t)for(const a of i){const o=ja(a,s,r);if(o!==null&&o.outside<dx)return!0}return!1}function px(i,e){const t=(n,s)=>{const r=Math.cos(n.rotationY),a=Math.sin(n.rotationY),o=s.x-n.x,l=s.z-n.z;return Math.abs(r*o-a*l)<=(n.size?.x??12)/2*n.scale&&Math.abs(a*o+r*l)<=(n.size?.z??12)/2*n.scale};return t(i,e)||t(e,i)}function wr(i,e=!0){const t=(e?cf:ki)[i.kind];return t.shape==="circle"?{shape:"circle",x:i.x,z:i.z,radius:t.radius*i.scale}:{shape:"box",x:i.x,z:i.z,rotationY:i.rotationY,halfX:(i.size?.x??t.halfX*2)*i.scale/2,halfZ:(i.size?.z??t.halfZ*2)*i.scale/2}}function mx(i){return{shape:"box",x:i.centre.x,z:i.centre.z,rotationY:i.rotationY,halfX:i.halfExtents.x,halfZ:i.halfExtents.z}}function mf(i,e){const t=[[Math.cos(i.rotationY),-Math.sin(i.rotationY)],[Math.sin(i.rotationY),Math.cos(i.rotationY)],[Math.cos(e.rotationY),-Math.sin(e.rotationY)],[Math.sin(e.rotationY),Math.cos(e.rotationY)]];let n=1/0;for(const[s,r]of t){const a=Math.abs((e.x-i.x)*s+(e.z-i.z)*r),o=i.halfX*Math.abs(Math.cos(i.rotationY)*s-Math.sin(i.rotationY)*r)+i.halfZ*Math.abs(Math.sin(i.rotationY)*s+Math.cos(i.rotationY)*r),l=e.halfX*Math.abs(Math.cos(e.rotationY)*s-Math.sin(e.rotationY)*r)+e.halfZ*Math.abs(Math.sin(e.rotationY)*s+Math.cos(e.rotationY)*r),c=o+l-a;if(c<=1e-9)return 0;n=Math.min(n,c)}return n}function Au(i,e){const t=i.x-e.x,n=i.z-e.z,s=Math.cos(e.rotationY),r=Math.sin(e.rotationY),a=s*t-r*n,o=r*t+s*n,l=Math.min(e.halfX,Math.max(-e.halfX,a)),c=Math.min(e.halfZ,Math.max(-e.halfZ,o));return Math.hypot(a-l,o-c)<i.radius-1e-9}function gf(i,e){return i.shape==="circle"&&e.shape==="circle"?Math.hypot(i.x-e.x,i.z-e.z)<i.radius+e.radius-1e-9:i.shape==="circle"?Au(i,e):e.shape==="circle"?Au(e,i):mf(i,e)>0}function gx(i,e){const t=wr(i,!1),n=wr(e,!1),s=Math.min(t.halfX*2,t.halfZ*2,n.halfX*2,n.halfZ*2);return s>0?mf(t,n)/s:0}function hc(i,e,t){const n=ds(i,e,t.x,t.z)+t.lift,s=OS[t.kind];return{bottom:n+s.bottom*t.scale,top:n+s.top*t.scale}}function vx(i,e,t,n){const s=wr(n),r=hc(i,e,n);for(const a of t){if(n.kind==="shrub"&&a.appearance==="wood"&&a.halfExtents.x<=.35&&a.halfExtents.z<=.35)continue;const o=a.centre.y-a.halfExtents.y,l=a.centre.y+a.halfExtents.y;if(!(Math.min(r.top,l)-Math.max(r.bottom,o)<=.02)&&gf(s,mx(a)))return!0}return!1}function Jo(i){return i==="signpost"?5:i==="lampPost"?4:i==="bench"?3:i==="litterBin"?2:i==="fenceBay"?1:0}function bx(i,e,t,n){if(t.kind==="fenceBay"&&n.kind==="fenceBay")return!1;const s=hc(i,e,t),r=hc(i,e,n);return Math.min(s.top,r.top)-Math.max(s.bottom,r.bottom)<=.02?!1:gf(wr(t),wr(n))}function _x(i,e,t){const n=t.filter(o=>o.kind==="building"||o.onCollider===!0),s=t.filter(o=>o.kind!=="building"&&o.onCollider!==!0).map((o,l)=>({prop:o,index:l})).sort((o,l)=>Jo(l.prop.kind)-Jo(o.prop.kind)||o.index-l.index),r=new Set(n),a=[];for(const{prop:o}of s)a.some(l=>bx(i,e,o,l))||(r.add(o),Jo(o.kind)>0&&a.push(o));return t.filter(o=>r.has(o))}function Sx(i,e,t){const n=t.size??{x:12,z:12},s=n.x*t.scale/2,r=n.z*t.scale/2,a=i.spacing/2,o=Math.max(2,Math.ceil(s*2/a)),l=Math.max(2,Math.ceil(r*2/a)),c=Math.cos(t.rotationY),u=Math.sin(t.rotationY);let d=ds(i,e,t.x,t.z)+t.lift;for(let h=0;h<=o;h+=1){const f=-s+s*2*h/o;for(let v=0;v<=l;v+=1){const _=-r+r*2*v/l,p=t.x+c*f+u*_,g=t.z-u*f+c*_;d=Math.min(d,ds(i,e,p,g)+t.lift)}}return d}function xx(i,e,t){const n=ds(i,e,t.x,t.z)+t.lift;if(t.kind!=="building")return{kind:t.kind,position:{x:t.x,y:n,z:t.z},rotationY:t.rotationY,scale:t.scale,...t.size===void 0?{}:{size:{...t.size}}};const s=Sx(i,e,t),r=t.size??{x:12,y:18,z:12};return{kind:t.kind,position:{x:t.x,y:s,z:t.z},rotationY:t.rotationY,scale:t.scale,size:{...r,y:r.y+(n-s)/t.scale}}}function Mx(i,e,t){const n=cf[e.kind];for(const s of i){if(s===e)continue;const r=Math.max(.1,(s.size?.x??12)/2*s.scale+t),a=Math.max(.1,(s.size?.z??12)/2*s.scale+t),o=Math.cos(s.rotationY),l=Math.sin(s.rotationY),c=e.x-s.x,u=e.z-s.z,d=o*c-l*u,h=l*c+o*u;if(n.shape==="circle"){const A=n.radius*e.scale,C=Math.min(r,Math.max(-r,d)),L=Math.min(a,Math.max(-a,h));if(Math.hypot(d-C,h-L)<=A)return!0;continue}const f=(e.size?.x??n.halfX*2)*e.scale/2,v=(e.size?.z??n.halfZ*2)*e.scale/2,_=e.rotationY-s.rotationY,p=Math.cos(_),g=Math.sin(_),M=Math.abs(p),T=Math.abs(g),S=f*M+v*T,R=f*T+v*M;if(Math.abs(d)>r+S||Math.abs(h)>a+R)continue;const y=r*M+a*T,E=r*T+a*M,m=p*d-g*h,x=g*d+p*h;if(!(Math.abs(m)>f+y)&&!(Math.abs(x)>v+E))return!0}return!1}function ds(i,e,t,n){const s=i.originX+(i.columns-1)*i.spacing,r=i.originZ+(i.rows-1)*i.spacing;if(t<i.originX||t>s||n<i.originZ||n>r)return e.height;const a=(t-i.originX)/i.spacing,o=(n-i.originZ)/i.spacing,l=Math.min(i.columns-2,Math.max(0,Math.floor(a))),c=Math.min(i.rows-2,Math.max(0,Math.floor(o))),u=a-l,d=o-c,h=c*i.columns+l,f=i.heights[h],v=i.heights[h+i.columns+1];if(d<u){const p=i.heights[h+1];return f+(p-f)*u+(v-p)*d}const _=i.heights[h+i.columns];return f+(v-_)*u+(_-f)*d}function yx(){return{positions:[],normals:[],colors:[],indices:[]}}function wx(i){const e=new Array(i.length);e[0]=0;for(let t=1;t<i.length;t+=1){const n=i[t-1],s=i[t];e[t]=e[t-1]+Math.hypot(s.x-n.x,s.z-n.z)}return e}function Ex(i,e,t){if(i<=0)return[];if(e<=0||t<=0)return[{from:0,to:i}];const n=e+t,s=Math.max(1,Math.round((i+t)/n)),r=s*e+(s-1)*t,a=(i-r)/2,o=[];for(let l=0;l<s;l+=1){const c=a+l*n,u=Math.max(0,c),d=Math.min(i,c+e);d-u>1e-6&&o.push({from:u,to:d})}return o}function Qo(i,e,t,n){const s=i.length-1;if(t<=0){n.x=i[0].x,n.y=i[0].y,n.z=i[0].z;return}if(t>=e[s]){n.x=i[s].x,n.y=i[s].y,n.z=i[s].z;return}let r=1;for(;r<s&&e[r]<t;)r+=1;const a=e[r]-e[r-1],o=a>1e-9?(t-e[r-1])/a:0,l=i[r-1],c=i[r];n.x=l.x+(c.x-l.x)*o,n.y=l.y+(c.y-l.y)*o,n.z=l.z+(c.z-l.z)*o}function Tx(i,e,t){let n=Math.imul(Math.round(i*20),374761393)+Math.imul(Math.round(e*20),668265263)+1013904223|0;n=Math.imul(n^n>>>13,1274126177)|0,n=n^n>>>16;const r=(n>>>0)/4294967296*2-1;return 1+r*Math.abs(r)*t}function Ax(i,e,t,n,s,r,a,o){if(i.length<2||e<=0)return 0;const l=wx(i),c=l[i.length-1];if(c<=0)return 0;const u=Ex(c,t,n),d={x:0,y:0,z:0};let h=0;for(const f of u){const v=f.to-f.from,_=Math.max(2,Math.ceil(v/1.25)+1),p=a.positions.length/3;for(let g=0;g<_;g+=1){const M=f.from+v*g/(_-1);Qo(i,l,M,d);const T=Math.max(f.from,M-.35),S=Math.min(f.to,M+.35),R={x:0,y:0,z:0},y={x:0,y:0,z:0};Qo(i,l,T,R),Qo(i,l,S,y);let E=y.x-R.x,m=y.z-R.z;const x=Math.hypot(E,m);x<1e-9?(E=0,m=1):(E/=x,m/=x);const A=m,C=-E,L=Tx(d.x,d.z,r);for(const F of[1,-1]){const z=d.x+A*e*F,D=d.z+C*e*F;a.positions.push(z,o?.(z,D)??d.y,D),a.normals.push(0,1,0),a.colors.push(s.r*L,s.g*L,s.b*L)}}for(let g=0;g<_-1;g+=1){const M=p+g*2;a.indices.push(M,M+1,M+2,M+1,M+3,M+2),h+=2}}return h}function Rx(i){const e=new It;e.name="level-markings";const t=i.markings??[],n=yx(),s=new Ve;let r=0,a=0;for(const u of t){const d=yu[u.paint]??yu.road;s.setHex(d.albedo),r+=Ax(u.points,u.width/2,u.dash,u.gap,{r:s.r,g:s.g,b:s.b},d.wear,n,(h,f)=>ds(i.heightfield,i.surround,h,f)+jn.lift);for(let h=1;h<u.points.length;h+=1)a+=Math.hypot(u.points[h].x-u.points[h-1].x,u.points[h].z-u.points[h-1].z)}if(n.indices.length===0)return{group:e,runs:0,triangles:0,drawCalls:0,paintedLength:0,dispose(){e.removeFromParent()}};const o=new Ut;o.setAttribute("position",new Qe(n.positions,3)),o.setAttribute("normal",new Qe(n.normals,3)),o.setAttribute("color",new Qe(n.colors,3)),o.setIndex(n.indices),o.computeBoundingSphere();const l=new tn({color:16777215,roughness:.82,metalness:0,vertexColors:!0});l.polygonOffset=!0,l.polygonOffsetFactor=-2,l.polygonOffsetUnits=-2;const c=new ht(o,l);return c.name="level-markings-paint",c.castShadow=!1,c.receiveShadow=!0,e.add(c),{group:e,runs:t.length,triangles:r,drawCalls:1,paintedLength:a,dispose(){o.dispose(),l.dispose(),e.clear(),e.removeFromParent()}}}const hr=ls("wood"),gn=ls("metal"),Ru={trunk:{build:()=>{const i=fe.broadleafTree;return ur(i.trunkRadiusTop,i.trunkRadiusBase,i.trunkHeight,i.trunkSides,0)},albedo:hr.albedo,roughness:.95,metalness:0,tint:sn.structure,castShadow:!0},crown:{build:()=>{const i=fe.broadleafTree,e=i.crownRadius;return Fi([ha(e,1,i.crownHeight/(2*e),.92,0,i.crownCentre,0),ha(i.upperRadius,1,.85,1,i.upperOffset,i.upperCentre,-.3)])},albedo:ui.broadleafFoliage,roughness:1,metalness:0,tint:sn.foliage,castShadow:!0},coniferFoliage:{build:()=>Fi(fe.conifer.tiers.map(i=>Lx(i.radius,i.height,fe.conifer.tierSides,i.base))),albedo:ui.coniferFoliage,roughness:1,metalness:0,tint:sn.foliage,castShadow:!0},shrub:{build:()=>{const i=fe.shrub;return ha(i.radius,i.scaleX,i.scaleY,i.scaleZ,0,i.centre,0)},albedo:ui.shrubFoliage,roughness:1,metalness:0,tint:sn.foliage,castShadow:!0},lampPost:{build:()=>{const i=fe.lampPost;return Fi([ur(i.postRadius,i.postRadius*1.35,i.postHeight,i.postSides,0),Wn(i.armThickness,i.armThickness,i.armLength,0,i.postHeight-i.armThickness/2,i.armLength/2)])},albedo:gn.albedo,roughness:gn.roughness,metalness:gn.metalness,tint:sn.structure,castShadow:!0},lampHead:{build:()=>{const i=fe.lampPost;return Wn(i.headWidth,i.headHeight,i.headDepth,0,i.postHeight-i.armThickness-i.headHeight/2,i.headReach)},albedo:ui.lampHead,roughness:.55,metalness:.1,tint:sn.structure,castShadow:!1},benchWood:{build:()=>{const i=fe.bench;return Fi([Wn(i.length,i.seatThickness,i.seatDepth,0,i.seatHeight,0),Wn(i.length,i.backHeight,i.backThickness,0,i.seatHeight+i.backHeight/2,-i.seatDepth/2+i.backThickness/2)])},albedo:hr.albedo,roughness:hr.roughness,metalness:0,tint:sn.structure,castShadow:!0},benchMetal:{build:()=>{const i=fe.bench;return Fi([1,-1].map(e=>Wn(i.legThickness,i.seatHeight,i.seatDepth*.8,e*(i.length/2-i.legThickness),i.seatHeight/2,0)))},albedo:gn.albedo,roughness:gn.roughness,metalness:gn.metalness,tint:sn.structure,castShadow:!0},litterBin:{build:()=>{const i=fe.litterBin;return Fi([ur(i.radiusTop,i.radiusBase,i.height,i.sides,0),ur(i.radiusTop*1.12,i.radiusTop*1.12,i.rimHeight,i.sides,i.height)])},albedo:gn.albedo,roughness:.6,metalness:.5,tint:sn.structure,castShadow:!0},bollardCap:{build:()=>{const i=fe.bollardCap;return ha(i.radius,1,i.scaleY,1,0,0,0)},albedo:gn.albedo,roughness:gn.roughness,metalness:gn.metalness,tint:sn.structure,castShadow:!1},signPost:{build:()=>{const i=fe.signpost;return ur(i.postRadius,i.postRadius,i.postHeight,i.postSides,0)},albedo:gn.albedo,roughness:gn.roughness,metalness:gn.metalness,tint:sn.structure,castShadow:!0},signPlate:{build:()=>{const i=fe.signpost;return Fi([Wn(i.plateWidth,i.plateHeight,i.plateThickness,i.plateWidth/2-i.postRadius,i.plateCentre,0),Wn(i.lowerWidth,i.lowerHeight,i.plateThickness,i.lowerWidth/2-i.postRadius,i.lowerCentre,0)])},albedo:ui.signPlate,roughness:.5,metalness:.15,tint:sn.structure,castShadow:!1},fenceBay:{build:()=>{const i=fe.fenceBay;return Fi([Wn(i.postWidth,i.postHeight,i.postWidth,0,i.postHeight/2,0),...[i.railUpper,i.railLower].map(e=>Wn(i.railThickness,i.railHeight,i.length,0,e,0))])},albedo:hr.albedo,roughness:hr.roughness,metalness:0,tint:sn.structure,castShadow:!0},buildingBody:{build:()=>Cu(gi.lowFloors),albedo:16777215,roughness:.92,metalness:0,tint:0,castShadow:!1},buildingTall:{build:()=>Cu(gi.highFloors),albedo:16777215,roughness:.92,metalness:0,tint:0,castShadow:!1},buildingCap:{build:()=>Wn(1,1,1,0,.5,0),albedo:ui.buildingCap,roughness:.9,metalness:0,tint:sn.structure,castShadow:!1}},Cx={broadleafTree:["trunk","crown"],treeCanopy:["crown"],conifer:["coniferFoliage"],shrub:["shrub"],lampPost:["lampPost","lampHead"],bench:["benchWood","benchMetal"],litterBin:["litterBin"],bollardCap:["bollardCap"],signpost:["signPost","signPlate"],fenceBay:["fenceBay"]};function eo(i){const e=i.index===null?i:i.toNonIndexed();return e!==i&&i.dispose(),e.deleteAttribute("uv"),e.computeVertexNormals(),e}function Px(i){if(i.getAttribute("color")===void 0){const e=i.getAttribute("position").count;i.setAttribute("color",new Qe(new Array(e*3).fill(1),3))}return i.computeBoundingSphere(),i}function Fi(i){const e=[],t=[];for(const s of i){const r=s.getAttribute("position"),a=s.getAttribute("normal");for(let o=0;o<r.count;o+=1)e.push(r.getX(o),r.getY(o),r.getZ(o)),t.push(a.getX(o),a.getY(o),a.getZ(o));s.dispose()}const n=new Ut;return n.setAttribute("position",new Qe(e,3)),n.setAttribute("normal",new Qe(t,3)),n}function Wn(i,e,t,n,s,r){return eo(new Tn(i,e,t)).translate(n,s,r)}function ur(i,e,t,n,s){return eo(new Yn(i,e,t,n,1,!1)).translate(0,s+t/2,0)}function Lx(i,e,t,n){return eo(new Dc(i,e,t,1,!1)).translate(0,n+e/2,0)}function Cu(i){const e=[],t=[],n=[],s=gi.glassTint,r=.5,a=[[-r,-r],[-r,r],[r,r],[r,-r]],o=(h,f,v,_,p,g,M,T,S)=>{const R=[[h,p,f],[v,p,_],[v,g,_],[h,p,f],[v,g,_],[h,g,f]];for(const[y,E,m]of R)e.push(y,E,m),t.push(M,0,T),n.push(S.r,S.g,S.b)},l={r:1,g:1,b:1},c=1/i,u=1-gi.glazing;for(let h=0;h<4;h+=1){const[f,v]=a[h],[_,p]=a[(h+1)%4],g=-(p-v),M=_-f;for(let T=0;T<i;T+=1){const S=T*c;if(!(T>0||!gi.solidGroundFloor)){o(f,v,_,p,S,S+c,g,M,l);continue}const y=S+c*u;o(f,v,_,p,S,y,g,M,l),o(f,v,_,p,y,S+c,g,M,s)}}for(const[h,f]of[[1,1],[0,-1]]){const v=f>0?[[-r,-r],[-r,r],[r,r],[r,-r]]:[[-r,-r],[r,-r],[r,r],[-r,r]],[_,p,g,M]=v;for(const[T,S]of[_,p,g,_,g,M])e.push(T,h,S),t.push(0,f,0),n.push(1,1,1)}const d=new Ut;return d.setAttribute("position",new Qe(e,3)),d.setAttribute("normal",new Qe(t,3)),d.setAttribute("color",new Qe(n,3)),d}function ha(i,e,t,n,s,r,a){return eo(new Fc(i,0)).scale(e,t,n).translate(s,r,a)}function ua(i,e,t){let n=Math.round(i*100)*374761393+Math.round(e*100)*668265263+t*1442695041|0;return n=Math.imul(n^n>>>13,1274126177),n=n^n>>>16,(n>>>0)/4294967296}function Dx(i){const e=new It;e.name="level-props";const t=i.props??[],n=new Map,s=new rt,r=new rt,a=new rt,o=new Sn,l=new I(0,1,0),c=new I,u=new I,d=new Ve,h=(E,m,x)=>{let A=n.get(E);A===void 0&&(A={matrices:[],colours:[]},n.set(E,A));for(const C of m.elements)A.matrices.push(C);A.colours.push(x.r,x.g,x.b)},f=(E,m,x)=>{const A=Ru[E];if(d.setHex(A.albedo),A.tint>0){const C=1+(ua(m.position.x,m.position.z,x)*2-1)*A.tint;d.multiplyScalar(C)}return d};for(const E of t){c.set(E.position.x,E.position.y,E.position.z),o.setFromAxisAngle(l,E.rotationY),u.setScalar(E.scale),s.compose(c,o,u);const m=Cx[E.kind];if(m!==void 0){for(const F of m)h(F,s,f(F,E,11));continue}const x=E.size??{x:12,y:18,z:12},A=fe.building,C=F=>F>=gi.highRiseHeight?"buildingTall":"buildingBody";d.setHex(Ko[Math.floor(ua(E.position.x,E.position.z,3)*Ko.length)%Ko.length]),d.multiplyScalar(1+(ua(E.position.x,E.position.z,5)*2-1)*sn.building);const L=d.clone();if(h(C(x.y),a.multiplyMatrices(s,r.makeScale(x.x,x.y,x.z)),L),r.makeScale(x.x+A.capOversail,A.capHeight,x.z+A.capOversail),r.setPosition(0,x.y,0),h("buildingCap",a.multiplyMatrices(s,r),f("buildingCap",E,7)),ua(E.position.x,E.position.z,9)>.55){const F=x.y*A.towerHeightFraction,z=C(F),D=z==="buildingTall"?gi.highFloors:gi.lowFloors;if(F/D<gi.minFloorHeight)continue;r.makeScale(x.x*A.towerWidthFraction,F,x.z*A.towerWidthFraction),r.setPosition(0,x.y+A.capHeight,0),h(z,a.multiplyMatrices(s,r),L)}}const v=[],_=[],p=[];let g=0,M=0,T=0,S=0,R=0;const y=new rt;for(const[E,m]of n){const x=Ru[E],A=m.colours.length/3;if(A===0)continue;const C=Px(x.build()),L=new tn({color:16777215,roughness:x.roughness,metalness:x.metalness,vertexColors:!0}),F=new Bd(C,L,A);F.name=`level-props-${E}`,F.castShadow=x.castShadow,F.receiveShadow=!1;for(let D=0;D<A;D+=1)y.fromArray(m.matrices,D*16),F.setMatrixAt(D,y),d.setRGB(m.colours[D*3],m.colours[D*3+1],m.colours[D*3+2]),F.setColorAt(D,d);F.instanceMatrix.needsUpdate=!0,F.instanceColor!==null&&(F.instanceColor.needsUpdate=!0),F.computeBoundingSphere(),e.add(F),p.push(F),v.push(C),_.push(L);const z=C.getAttribute("position").count/3*A;g+=A,M+=z,T+=1,x.castShadow&&(R+=1,S+=z)}return{group:e,props:t.length,instances:g,drawCalls:T,triangles:M,shadowDrawCalls:R,shadowTriangles:S,dispose(){for(const E of p)E.dispose();for(const E of v)E.dispose();for(const E of _)E.dispose();p.length=0,v.length=0,_.length=0,e.clear(),e.removeFromParent()}}}const Ix={cellWeight:.52,midMetres:5.7,midWeight:.52,coarseMetres:27,coarseWeight:.5,hueMetres:19,hueWeight:.4,satMetres:41,satWeight:.4},Fx={cellWeight:.36,midMetres:37,midWeight:.58,coarseMetres:145,coarseWeight:.57,hueMetres:96,hueWeight:.6,satWeight:.45,satMetres:210},uc={maxBlend:.36,patchMetres:5.5};function Ux(i,e,t,n,s,r){if(s<=0)return 0;const a=mr(t,n,uc.patchMetres,15639,.83)*.5+.5,o=os(i,e,r);return s*uc.maxBlend*a*(.35+.65*o)}function Nx(i,e,t,n){return n.r=i.r+(e.r-i.r)*t,n.g=i.g+(e.g-i.g)*t,n.b=i.b+(e.b-i.b)*t,n}function kx(i,e,t){return i.r*=t.r>1e-6?e.r/t.r:1,i.g*=t.g>1e-6?e.g/t.g:1,i.b*=t.b>1e-6?e.b/t.b:1,i}function Ox(i,e,t){const n=Math.floor(e/t.module),s=Math.floor(i/t.module+((n&1)===0?0:.5)),r=os(s,n,31583)*2-1;return 1+r*Math.abs(r)*t.contrast}function os(i,e,t){let n=Math.imul(i|0,374761393)+Math.imul(e|0,668265263)+Math.imul(t,2147483647)|0;return n=Math.imul(n^n>>>13,1274126177)|0,n=Math.imul(n^n>>>15,1540483477)|0,n=n^n>>>16,(n>>>0)/4294967296}function Pu(i){return i*i*i*(i*(i*6-15)+10)}function Lu(i,e,t,n,s){const r=Math.cos(s),a=Math.sin(s),o=(i*r-e*a)/t,l=(i*a+e*r)/t,c=Math.floor(o),u=Math.floor(l),d=Pu(o-c),h=Pu(l-u),f=os(c,u,n),v=os(c+1,u,n),_=os(c,u+1,n),p=os(c+1,u+1,n),g=f+(v-f)*d,M=_+(p-_)*d;return(g+(M-g)*h)*2-1}function mr(i,e,t,n,s){return Lu(i,e,t,n,s)*.68+Lu(i,e,t*.37,n^40503,s+1.1)*.32}function zx(i,e,t){return .2126*i+.7152*e+.0722*t}function vf(i,e,t,n,s,r,a,o){const l=os(i,e,20973)*2-1,c=l*Math.abs(l),u=mr(t,n,a.midMetres,12190,.61),d=mr(t,n,a.coarseMetres,31549,2.19),h=1+s*(c*a.cellWeight+u*a.midWeight+d*a.coarseWeight),f=mr(t,n,a.hueMetres,7239,1.37)*s*a.hueWeight,v=zx(r.r,r.g,r.b),_=1+mr(t,n,a.satMetres,27361,2.83)*s*a.satWeight;return o.r=jo(r.r,v,_)*h*(1+f),o.g=jo(r.g,v,_)*h*(1+f*.34),o.b=jo(r.b,v,_)*h*(1-f),o}function jo(i,e,t){return i<1e-4?1:Math.max(0,t+e/i*(1-t))}function Hc(i,e){return e.r=((i>>16&255)/255)**2.2,e.g=((i>>8&255)/255)**2.2,e.b=((i&255)/255)**2.2,e}function pi(i,e,t){return i.heights[t*i.columns+e]}function Bx(){const i=new Map;for(const e of Object.keys(Qn)){const t=ls(Qn[e].material),n={r:1,g:1,b:1};Hc(t.albedo,n),i.set(e,{encroach:t.encroach,linear:n})}return i}function Hx(i,e,t,n){const s=pi(i,Math.max(0,e-1),t),r=pi(i,Math.min(i.columns-1,e+1),t),a=pi(i,e,Math.max(0,t-1)),o=pi(i,e,Math.min(i.rows-1,t+1)),l=(Math.min(i.columns-1,e+1)-Math.max(0,e-1))*i.spacing,c=(Math.min(i.rows-1,t+1)-Math.max(0,t-1))*i.spacing;n.set(l>0?-(r-s)/l:0,1,c>0?-(o-a)/c:0).normalize()}function Ca(i,e){return new tn({color:i.albedo,roughness:i.roughness,metalness:i.metalness,vertexColors:e})}function Gx(i){const e=new It;e.name="level-terrain";const t=[],n=[],s=i.heightfield,r=ls(Qn[i.surround.surface].material);let a=i.surround.height;for(const X of s.heights)X<a&&(a=X);const o=new Er(Lt.surroundBackstopHalfExtent*2,Lt.surroundBackstopHalfExtent*2),l=Ca(r,!1);l.polygonOffset=!0,l.polygonOffsetFactor=2,l.polygonOffsetUnits=2;const c=new ht(o,l);c.rotation.x=-Math.PI/2,c.position.y=a-Lt.surroundBackstopDrop,c.name="level-surround",e.add(c),t.push(o),n.push(l);const u=Vx(i),d=Wx(i,r,u);e.add(d.mesh),t.push(d.geometry),n.push(d.material);const h=s.columns-1,f=s.rows-1,v=new Map;let _=0;for(let X=0;X<f;X+=1)for(let j=0;j<h;j+=1){const ie=X*h+j,Ae=s.surfaces[ie];if(u.covers(j,X)&&Ae===i.surround.surface&&pi(s,j,X)===i.surround.height&&pi(s,j+1,X)===i.surround.height&&pi(s,j,X+1)===i.surround.height&&pi(s,j+1,X+1)===i.surround.height)continue;let Oe=v.get(Ae);Oe===void 0&&(Oe=[],v.set(Ae,Oe)),Oe.push(ie),_+=1}const p=[],g=[],M=[],T=[],S=[],R=new I,y=(X,j,ie)=>{const Ae=p.length/3;return p.push(s.originX+X*s.spacing,pi(s,X,j),s.originZ+j*s.spacing),Hx(s,X,j,R),g.push(R.x,R.y,R.z),M.push(ie.r,ie.g,ie.b),Ae},E={r:1,g:1,b:1},m={r:1,g:1,b:1},x={r:1,g:1,b:1},A={r:0,g:0,b:0},C=Bx();for(const[X,j]of v){const ie=ls(Qn[X]?.material??"pavement");Hc(ie.albedo,m);const Ae=C.get(X);for(const Oe of j){const se=Math.floor(Oe/h),V=Oe-se*h,te=s.originX+(V+.5)*s.spacing,re=s.originZ+(se+.5)*s.spacing;let ge=0;A.r=0,A.g=0,A.b=0;for(let Ge=0;Ge<4;Ge+=1){const $e=V+(Ge===0?-1:Ge===1?1:0),dt=se+(Ge===2?-1:Ge===3?1:0);if($e<0||dt<0||$e>=h||dt>=f)continue;const ot=C.get(s.surfaces[dt*h+$e]);if(ot===void 0||ot.encroach<=(Ae?.encroach??0))continue;const xt=Ux(V,se,te,re,ot.encroach,689+Ge);xt<=0||(ge+=xt,A.r+=ot.linear.r*xt,A.g+=ot.linear.g*xt,A.b+=ot.linear.b*xt)}let Ce=m;if(ge>0&&(A.r/=ge,A.g/=ge,A.b/=ge,Ce=Nx(m,A,Math.min(uc.maxBlend,ge),x)),vf(V,se,te,re,ie.mottle,Ce,Ix,E),ge>0&&kx(E,Ce,m),ie.paving!==void 0){const Ge=Ox(te,re,ie.paving);E.r*=Ge,E.g*=Ge,E.b*=Ge}const _e=y(V,se,E),je=y(V+1,se,E),De=y(V,se+1,E),nt=y(V+1,se+1,E);T.push(_e,De,je,je,De,nt)}S.push(Ca(ie,!0))}const L=new Ut;L.setAttribute("position",new Qe(p,3)),L.setAttribute("normal",new Qe(g,3)),L.setAttribute("color",new Qe(M,3)),L.setIndex(T);let F=0,z=0;for(const X of v.values()){const j=X.length*6;L.addGroup(F,j,z),F+=j,z+=1}L.computeBoundingSphere();const D=new ht(L,S);D.receiveShadow=!0,D.castShadow=!1,D.name="level-heightfield",e.add(D),t.push(L),n.push(...S);const H=new Map;for(const X of i.segments)for(const j of X.colliders){const ie=j.appearance??Qn[j.surface].material,Ae=H.get(ie);Ae===void 0?H.set(ie,[j]):Ae.push(j)}let G=0;for(const[X,j]of H){const ie=ls(X),Ae=[],Oe=[],se=[];for(const ge of j)Xx(ge,Ae,Oe,se);const V=new Ut;V.setAttribute("position",new Qe(Ae,3)),V.setAttribute("normal",new Qe(Oe,3)),V.setIndex(se),V.computeBoundingSphere();const te=Ca(ie,!1),re=new ht(V,te);re.castShadow=!0,re.receiveShadow=!0,re.name=`level-blocks-${X}`,e.add(re),t.push(V),n.push(te),G+=se.length/3}const K=Dx(i);e.add(K.group);const ne=Rx(i);return e.add(ne.group),{group:e,cellsDrawn:_,markings:ne,triangles:T.length/3+G+d.triangles+2+K.triangles+ne.triangles,setSurroundCentre(X,j){c.position.x=X,c.position.z=j},dispose(){K.dispose(),ne.dispose();for(const X of t)X.dispose();for(const X of n)X.dispose();t.length=0,n.length=0,e.removeFromParent()}}}function Vx(i){const e=i.heightfield,t=Lt.surroundCellSize,n=e.originX-Lt.surroundMargin,s=e.originZ-Lt.surroundMargin,r=(e.columns-1)*e.spacing+Lt.surroundMargin*2,a=(e.rows-1)*e.spacing+Lt.surroundMargin*2,o=Math.ceil(r/t),l=Math.ceil(a/t),c=new Uint8Array(o*l).fill(1),u=(d,h)=>{const f=Math.floor((d-n)/t),v=Math.floor((h-s)/t);return f<0||v<0||f>=o||v>=l?-1:v*o+f};for(let d=0;d<e.rows;d+=1){const h=e.originZ+d*e.spacing;for(let f=0;f<e.columns;f+=1){const v=e.heights[d*e.columns+f],_=d<e.rows-1&&f<e.columns-1?e.surfaces[d*(e.columns-1)+f]:i.surround.surface;if(v===i.surround.height&&_===i.surround.surface)continue;for(const g of[-e.spacing,e.spacing])for(const M of[-e.spacing,e.spacing]){const T=u(Du(e,f)+g,h+M);T>=0&&(c[T]=0)}const p=u(Du(e,f),h);p>=0&&(c[p]=0)}}return{columns:o,rows:l,minX:n,minZ:s,cell:t,patch:(d,h)=>c[h*o+d]===1,covers(d,h){const f=u(e.originX+(d+.5)*e.spacing,e.originZ+(h+.5)*e.spacing);return f<0||c[f]===1}}}function Du(i,e){return i.originX+e*i.spacing}function Wx(i,e,t){const{cell:n,columns:s,rows:r,minX:a,minZ:o}=t,l=[],c=[],u=[],d=[],h=i.surround.height,f={r:1,g:1,b:1},v={r:1,g:1,b:1};Hc(e.albedo,v);for(let M=0;M<r;M+=1)for(let T=0;T<s;T+=1){if(!t.patch(T,M))continue;const S=a+T*n,R=o+M*n;vf(T+7919,M+104729,S+n*.5,R+n*.5,e.mottle,v,Fx,f);const y=l.length/3;for(const[E,m]of[[0,0],[1,0],[0,1],[1,1]])l.push(S+E*n,h,R+m*n),c.push(0,1,0),u.push(f.r,f.g,f.b);d.push(y,y+2,y+1,y+1,y+2,y+3)}const _=new Ut;_.setAttribute("position",new Qe(l,3)),_.setAttribute("normal",new Qe(c,3)),_.setAttribute("color",new Qe(u,3)),_.setIndex(d),_.computeBoundingSphere();const p=Ca(e,!0);p.polygonOffset=!0,p.polygonOffsetFactor=1,p.polygonOffsetUnits=1;const g=new ht(_,p);return g.receiveShadow=!0,g.name="level-field",{mesh:g,geometry:_,material:p,triangles:d.length/3}}function Xx(i,e,t,n){const{centre:s,halfExtents:r}=i,a=Math.cos(i.rotationY),o=Math.sin(i.rotationY),l=(u,d,h)=>[s.x+a*u+o*h,s.y+d,s.z-o*u+a*h],c=[{normal:[0,1,0],corners:[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]},{normal:[0,-1,0],corners:[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]},{normal:[1,0,0],corners:[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]},{normal:[-1,0,0],corners:[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]},{normal:[0,0,1],corners:[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]},{normal:[0,0,-1],corners:[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]}];for(const u of c){const d=e.length/3,[h,f,v]=u.normal,_=a*h+o*v,p=-o*h+a*v;for(const[g,M,T]of u.corners){const[S,R,y]=l(g*r.x,M*r.y,T*r.z);e.push(S,R,y),t.push(_,f,p)}n.push(d,d+1,d+2,d,d+2,d+3)}}const Yx=Q.pedalStrikeReferenceDepth,qx=Je.particleColours;class $x{renderer;scene;camera;sun;hemisphere;disposables=[];terrain=null;gates=null;checkpointsVisible=!1;nextCheckpointIndex=-1;ghost;sparks;dust;sky;sunOffset=new I;lastWidth=0;lastHeight=0;lastPixelRatio=0;contextCallbacks=null;maxPixelRatio=rf.maxPixelRatio;sparkDebt=0;constructor(e){this.renderer=new I_({canvas:e,antialias:!0,powerPreference:"high-performance"}),this.renderer.outputColorSpace=cn,this.renderer.toneMapping=vc,this.renderer.toneMappingExposure=Be.exposure,this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=vr,this.scene=new fm,this.sky=US(),this.scene.background=this.sky.texture,this.scene.fog=new Cc(Be.horizonColour,Be.fogNear,Be.fogFar),this.camera=new wn(ic.radToDeg(Ze.fovAtRest),1,Ze.near,Ze.far),this.hemisphere=new Dm(Be.skyColour,Be.groundBounceColour,Be.hemisphereIntensity),this.scene.add(this.hemisphere),this.sun=new Um(Be.sunColour,Be.sunIntensity);const t=Math.cos(Be.sunElevation)*Be.sunDistance;this.sunOffset.set(Math.sin(Be.sunAzimuth)*t,Math.sin(Be.sunElevation)*Be.sunDistance,Math.cos(Be.sunAzimuth)*t),this.sun.position.copy(this.sunOffset),this.sun.castShadow=!0,this.sun.shadow.mapSize.setScalar(Be.shadowMapSize),this.sun.shadow.bias=Be.shadowBias,this.sun.shadow.normalBias=Be.shadowNormalBias;const n=this.sun.shadow.camera;n.left=-Be.shadowRadius,n.right=Be.shadowRadius,n.top=Be.shadowRadius,n.bottom=-Be.shadowRadius,n.near=1,n.far=Be.sunDistance*2,n.updateProjectionMatrix(),this.scene.add(this.sun),this.scene.add(this.sun.target),this.sparks=Mu({name:"fx-sparks",capacity:Je.sparkCount,size:Je.sparkSize,gravity:Je.sparkGravity,fadeTo:Je.sparkFadeColour}),this.dust=Mu({name:"fx-dust",capacity:Je.dustCount,size:Je.dustSize,gravity:Je.dustGravity,fadeTo:Be.horizonColour}),this.scene.add(this.sparks.points),this.scene.add(this.dust.points),this.ghost=PS(),this.scene.add(this.ghost.group),e.addEventListener("webglcontextlost",this.onContextLost),e.addEventListener("webglcontextrestored",this.onContextRestored)}emitSparks(e,t,n,s,r,a,o){const l=Math.min(1,s/Yx);if(l<=0||o<=0)return;this.sparkDebt+=Je.sparkRatePerSecond*l*o;const c=Math.floor(this.sparkDebt);if(c<=0)return;this.sparkDebt-=c;const u=r*Math.cos(a),d=r*-Math.sin(a);this.sparks.emit({x:e,y:t,z:n,count:c,speed:Je.sparkSpeed*(.5+.5*l),spread:Je.sparkSpread,axisX:u-Math.sin(a)*.6,axisY:.35,axisZ:d-Math.cos(a)*.6,lifeSeconds:Je.sparkLifeSeconds,colour:Je.sparkColour,intensity:Je.sparkIntensity})}emitLandingParticles(e,t,n,s,r){const a=Nc(s),o=qx[a.particle];if(o===void 0)return;const l=Math.min(1,Math.max(0,r)),c=Math.round(Je.dustPerLanding*l);c<=0||this.dust.emit({x:e,y:t,z:n,count:c,speed:Je.dustSpeed*(.4+.6*l),spread:Math.PI*.5,axisX:0,axisY:1,axisZ:0,lifeSeconds:Je.dustLifeSeconds,colour:o,fadeTo:ls(a.material).albedo})}stepParticles(e){this.sparks.step(e),this.dust.step(e)}clearParticles(){this.sparks.clear(),this.dust.clear(),this.sparkDebt=0}particleCounts(){return{sparks:this.sparks.live,dust:this.dust.live}}setLevel(e){this.terrain?.dispose();const t=Gx(e);this.terrain=t,this.scene.add(t.group),this.gates?.dispose();const n=H_(e.checkpoints);return this.gates=n,this.scene.add(n.group),n.setProgress(this.nextCheckpointIndex),n.setVisible(this.checkpointsVisible),t}setCheckpointsVisible(e){this.checkpointsVisible=e,this.gates?.setVisible(e)}setCheckpointProgress(e){this.nextCheckpointIndex=e,this.gates?.setProgress(e)}flareCheckpoint(e){this.gates?.flare(e)}stepCheckpoints(e){this.gates?.step(e)}setGhostVisible(e){this.ghost.setVisible(e)}applyGhost(e){this.ghost.apply(e)}challengeCosts(){return{gateDrawCalls:this.gates?.visible===!0?this.gates.drawCalls:0,gateTriangles:this.gates?.visible===!0?this.gates.triangles:0,ghostDrawCalls:this.ghost.visible?this.ghost.drawCalls:0,ghostTriangles:this.ghost.visible?this.ghost.triangles:0}}setContextLossCallbacks(e){this.contextCallbacks=e}onContextLost=e=>{e.preventDefault(),this.contextCallbacks?.onLost()};onContextRestored=()=>{this.contextCallbacks?.onRestored()};resize(){const e=this.renderer.domElement,t=e.clientWidth,n=e.clientHeight,s=Math.min(window.devicePixelRatio,this.maxPixelRatio);if(t===0||n===0)return{layoutChanged:!1,width:this.lastWidth,height:this.lastHeight};const r=t!==this.lastWidth||n!==this.lastHeight,a=s!==this.lastPixelRatio;return!r&&!a?{layoutChanged:!1,width:t,height:n}:(this.lastWidth=t,this.lastHeight=n,this.lastPixelRatio=s,this.renderer.setPixelRatio(s),this.renderer.setSize(t,n,!1),r&&(this.camera.aspect=t/n,this.camera.updateProjectionMatrix()),{layoutChanged:r,width:t,height:n})}applyLighting(e){e.exposure!==void 0&&(this.renderer.toneMappingExposure=e.exposure),e.sunIntensity!==void 0&&(this.sun.intensity=e.sunIntensity),e.hemisphereIntensity!==void 0&&(this.hemisphere.intensity=e.hemisphereIntensity)}setShadowFocus(e,t,n){this.sun.target.position.set(e,t,n),this.sun.position.set(e+this.sunOffset.x,t+this.sunOffset.y,n+this.sunOffset.z)}setFieldOfView(e){const t=ic.radToDeg(e);this.camera.fov!==t&&(this.camera.fov=t,this.camera.updateProjectionMatrix())}setMaxPixelRatio(e){const t=Math.max(.5,e);t!==this.maxPixelRatio&&(this.maxPixelRatio=t,this.resize())}setQuality(e,t){const n=e!=="low";this.sun.castShadow!==n&&(this.sun.castShadow=n);const s=e==="high"?Be.shadowMapSize:Be.shadowMapSize/2;n&&this.sun.shadow.mapSize.x!==s&&(this.sun.shadow.mapSize.setScalar(s),this.sun.shadow.map?.dispose(),this.sun.shadow.map=null);const r=e==="high"?t:e==="medium"?1.5:1;this.setMaxPixelRatio(Math.min(t,r))}viewport(){return{width:this.lastWidth,height:this.lastHeight,pixelRatio:this.lastPixelRatio}}render(){this.renderer.render(this.scene,this.camera)}dispose(){const e=this.renderer.domElement;e.removeEventListener("webglcontextlost",this.onContextLost),e.removeEventListener("webglcontextrestored",this.onContextRestored),this.terrain?.dispose(),this.terrain=null,this.gates?.dispose(),this.gates=null,this.ghost.dispose(),this.scene.background=null,this.sky.dispose(),this.sparks.dispose(),this.dust.dispose();for(const t of this.disposables)t.dispose();this.disposables.length=0,this.sun.shadow.dispose(),this.sun.dispose(),this.hemisphere.dispose(),this.renderer.dispose()}}function Zx(){return{anchorHeight:ss.hipHeight+Ze.targetHeightOffset,armHeight:Ze.armHeight,distanceAtRest:Ze.distanceAtRest,distanceAtSpeed:Ze.distanceAtSpeed,distanceResponseSeconds:Ze.distanceResponseSeconds,fovAtRest:Ze.fovAtRest,fovAtSpeed:Ze.fovAtSpeed,fovResponseSeconds:Ze.fovResponseSeconds,speedReference:Ze.speedReference,lookAheadSeconds:Ze.lookAheadSeconds,lookAheadMax:Ze.lookAheadMax,lookAheadResponseSeconds:Ze.lookAheadResponseSeconds,yawLagAtRest:Ze.yawLagAtRest,yawLagAtSpeed:Ze.yawLagAtSpeed,bankFactor:Ze.bankFactor,bankMaxRadians:Ze.bankMaxRadians,bankResponseSeconds:Ze.bankResponseSeconds,obstructionRadius:Ze.obstructionRadius,obstructionMinDistance:Ze.obstructionMinDistance,obstructionPullInSeconds:Ze.obstructionPullInSeconds,obstructionRestoreSeconds:Ze.obstructionRestoreSeconds,airHeightFollow:Ze.airHeightFollow,airHeightResponseSeconds:Ze.airHeightResponseSeconds,landingRestoreSeconds:Ze.landingRestoreSeconds,landingDipPerImpact:Ze.landingDipPerImpact,landingDipMax:Ze.landingDipMax,landingDipRecoverSeconds:Ze.landingDipRecoverSeconds,crashDistance:Ze.crashDistance,crashArmHeight:Ze.crashArmHeight,crashFov:Ze.crashFov,crashFrameSeconds:Ze.crashFrameSeconds,crashRestoreSeconds:Ze.crashRestoreSeconds}}function el(){return{yaw:0,distance:Ze.distanceAtRest,armDistance:Ze.distanceAtRest,fov:Ze.fovAtRest,bank:0,lookAhead:0,heightLag:0,dip:0,crashFrame:0}}function tl(i,e){e.yaw=i.yaw,e.distance=i.distance,e.armDistance=i.armDistance,e.fov=i.fov,e.bank=i.bank,e.lookAhead=i.lookAhead,e.heightLag=i.heightLag,e.dip=i.dip,e.crashFrame=i.crashFrame}function Kx(i,e,t,n){n.yaw=Mt(i.yaw,e.yaw,t),n.distance=Mt(i.distance,e.distance,t),n.armDistance=Mt(i.armDistance,e.armDistance,t),n.fov=Mt(i.fov,e.fov,t),n.bank=Mt(i.bank,e.bank,t),n.lookAhead=Mt(i.lookAhead,e.lookAhead,t),n.heightLag=Mt(i.heightLag,e.heightLag,t),n.dip=Mt(i.dip,e.dip,t),n.crashFrame=Mt(i.crashFrame,e.crashFrame,t)}function Jx(){return{positionX:0,positionY:0,positionZ:0,targetX:0,targetY:0,targetZ:0,fov:Ze.fovAtRest,roll:0}}function Qx(i,e){return gt(-i*e.bankFactor,-e.bankMaxRadians,e.bankMaxRadians)}class jx{tuning;yaw=0;distance;armDistance;fov;bank=0;lookAhead=0;heightLag=0;dip=0;crashFrame=0;probe=null;probeOrigin={x:0,y:0,z:0};probeDirection={x:0,y:0,z:0};constructor(e={}){this.tuning={...Zx(),...e.tuning},this.distance=this.tuning.distanceAtRest,this.armDistance=this.tuning.distanceAtRest,this.fov=this.tuning.fovAtRest}setTuning(e){Object.assign(this.tuning,e)}setOcclusionProbe(e){this.probe=e}reset(e){this.yaw=e.headingY,this.distance=this.tuning.distanceAtRest,this.armDistance=this.tuning.distanceAtRest,this.fov=this.tuning.fovAtRest,this.bank=0,this.lookAhead=0,this.heightLag=0,this.dip=0,this.crashFrame=0}landingImpulse(e){const t=this.tuning;e>0&&(this.dip=Math.min(t.landingDipMax,this.dip+e*t.landingDipPerImpact))}step(e,t){if(e<=0)return;const n=this.tuning,s=wt(Math.abs(t.speed)/n.speedReference);this.crashFrame=Xe(this.crashFrame,t.crashed?1:0,t.crashed?n.crashFrameSeconds:n.crashRestoreSeconds,1/0,e);const r=(1-this.crashFrame)*gt(Math.max(0,t.speed)*n.lookAheadSeconds,0,n.lookAheadMax);this.lookAhead=Xe(this.lookAhead,r,n.lookAheadResponseSeconds,1/0,e),this.distance=Xe(this.distance,Mt(Mt(n.distanceAtRest,n.distanceAtSpeed,s),n.crashDistance,this.crashFrame),n.distanceResponseSeconds,1/0,e),this.fov=Xe(this.fov,Mt(Mt(n.fovAtRest,n.fovAtSpeed,s),n.crashFov,this.crashFrame),n.fovResponseSeconds,1/0,e),this.yaw=Xe(this.yaw,t.headingY,Mt(n.yawLagAtRest,n.yawLagAtSpeed,s),1/0,e),this.bank=Xe(this.bank,Qx(t.rollAngle,n),n.bankResponseSeconds,1/0,e),this.heightLag=Xe(this.heightLag,t.airborne?Math.max(0,t.y-t.groundY)*(1-n.airHeightFollow):0,t.airborne?n.airHeightResponseSeconds:n.landingRestoreSeconds,1/0,e),this.dip=Xe(this.dip,0,n.landingDipRecoverSeconds,1/0,e);const a=this.clearance(t),o=Math.max(n.obstructionMinDistance,Math.min(this.distance,a)),l=o<this.armDistance?n.obstructionPullInSeconds:n.obstructionRestoreSeconds;this.armDistance=Xe(this.armDistance,o,l,1/0,e)}writeState(e){e.yaw=this.yaw,e.distance=this.distance,e.armDistance=this.armDistance,e.fov=this.fov,e.bank=this.bank,e.lookAhead=this.lookAhead,e.heightLag=this.heightLag,e.dip=this.dip,e.crashFrame=this.crashFrame}clearance(e){if(this.probe===null)return 1/0;const t=this.tuning,n=e.y-this.heightLag+t.anchorHeight,s=e.x-Math.sin(this.yaw)*this.distance,r=e.y+t.armHeight,a=e.z-Math.cos(this.yaw)*this.distance,o=s-e.x,l=r-n,c=a-e.z,u=Math.hypot(o,l,c);if(u<=1e-6)return 1/0;this.probeOrigin.x=e.x,this.probeOrigin.y=n,this.probeOrigin.z=e.z,this.probeDirection.x=o,this.probeDirection.y=l,this.probeDirection.z=c;const d=this.probe(this.probeOrigin,this.probeDirection,u);return d===null?1/0:Math.max(0,d-t.obstructionRadius)*(this.distance/u)}}function eM(i,e,t,n){const s=e.y-i.heightLag+t.anchorHeight-i.dip,r=i.distance>1e-6?i.armDistance/i.distance:1,a=Mt(t.armHeight,t.crashArmHeight,i.crashFrame);n.positionX=e.x-Math.sin(i.yaw)*i.armDistance,n.positionY=s+(a-t.anchorHeight)*r,n.positionZ=e.z-Math.cos(i.yaw)*i.armDistance,n.targetX=e.x+Math.sin(e.headingY)*i.lookAhead,n.targetY=s,n.targetZ=e.z+Math.cos(e.headingY)*i.lookAhead,n.fov=i.fov,n.roll=i.bank}const tM=1.6,nl=7.2,Iu=2.5,Fu=2,nM=[{id:"pad",length:180,halfWidth:40,surface:"pavement",shoulder:8},{id:"plaza",length:44,halfWidth:15,surface:"brick",shoulder:8,blocks:[...[-6,-3.5,3.5,6].map(i=>({s:14,t:i,halfAlong:.09,halfLateral:.09,height:.9,surface:"brick",appearance:"metal"})),{s:26,t:9,halfAlong:4.5,halfLateral:1.1,height:.85,surface:"brick",appearance:"stone"},{s:38,t:tM+nl,halfAlong:Iu,halfLateral:nl,height:Fu,surface:"brick",appearance:"stone"},{s:38,t:-8.8,halfAlong:Iu,halfLateral:nl,height:Fu,surface:"brick",appearance:"stone"}]},{id:"boulevard",length:86,halfWidth:9,surface:"pavement",shoulder:7,blocks:[{s:43,t:-7,halfAlong:35,halfLateral:2,height:.15,surface:"pavement",appearance:"concrete"}]},{id:"sweep",length:63,curvature:1/40,halfWidth:9,surface:"pavement",shoulder:7,bands:[{from:4.5,to:9,surface:"grass"},{from:-9,to:-5.5,surface:"grass"}]},{id:"climb",length:54,climb:7,halfWidth:8,surface:"roughPavement",shoulder:7},{id:"crest",length:22,halfWidth:8,surface:"roughPavement",shoulder:7,blocks:[{s:11,t:7.4,halfAlong:9,halfLateral:.5,height:1,surface:"roughPavement",appearance:"stone"}]},{id:"descent",length:50,climb:-7,halfWidth:8,surface:"gravel",shoulder:7},{id:"trail",length:50,curvature:-1/50,halfWidth:5.5,surface:"dirt",shoulder:6,blocks:[{s:18,t:-1.8,halfAlong:.7,halfLateral:.7,height:.3,surface:"dirt",appearance:"stone"},{s:32,t:2.2,halfAlong:.6,halfLateral:.6,height:.18,surface:"dirt",appearance:"stone"}]},{id:"bridge",length:16,halfWidth:3.5,surface:"wood",shoulder:4,blocks:[...[-3.4,3.4].map(i=>({s:8,t:i,halfAlong:8,halfLateral:.12,height:.9,surface:"wood",appearance:"wood"}))]},{id:"return",length:40,halfWidth:8,surface:"pavement",shoulder:7}];function iM(){return pf(nM,{id:"m4-proving-ground",spawn:{position:{x:0,y:0,z:0},headingY:0},surround:{height:0,surface:"grass"}})}const Gc=.15,sM=.3,bf=1.05,rM=.15,aM=4,Pa=36,La=24,Da=50,vi=34,$s=16,Si=i=>Math.PI*i/2,oM=2*vi+La-2*$s,lM=Da-Pa,Ia=9,Fa=22,il=oM-Ia-Fa,js={riverside:.02445321044266501,riversideLower:.014970690955080213,gravelSpur:.02882828760562427,trailhead:.01105736715874174,returnClimb:-.008477012636065782,returnPlaza:-.004179113767108547},Uu=59.71861586702758,cM=31.946767110627512,On=3.4,_f=3.2,Nu=.3,hM=4.2;function ni(i,e,t,n,s){return Array.from({length:s},(r,a)=>({s:t+a*n,t:e,halfAlong:Nu,halfLateral:Nu,height:hM,surface:i,appearance:"wood"}))}function Un(i,e){let t=Math.round(i*71)*374761393+Math.round(e*100)*668265263|0;return t=Math.imul(t^t>>>13,1274126177),t=t^t>>>16,(t>>>0)/4294967296}function Vs(i,e){return Un(i,e)*2-1}function Vc(i){return i>0?-Math.PI/2:Math.PI/2}function we(i,e,t,n,s,r={}){const a=r.vary??.14;return Array.from({length:s},(o,l)=>{const c=t+l*n,u=c+e*3.7;return{s:c,t:e+(r.wander??0)*Vs(u,11),kind:i,yaw:r.yaw??Un(u,23)*Math.PI*2,scale:(r.scale??1)*(1+a*Vs(u,37)),...r.lift===void 0?{}:{lift:r.lift},...r.onCollider===!0?{onCollider:!0}:{}}})}function ii(i,e,t,n){return we("treeCanopy",i,e,t,n,{scale:1.05,vary:.16,onCollider:!0})}const uM=2.4;function Tr(i,e,t){return we("fenceBay",i,e,uM,t,{yaw:0,vary:.02})}function ft(i,e,t,n){return we("lampPost",i,e,t,n,{yaw:Vc(i),vary:.03})}function hn(i,e){return[{s:e,t:i,kind:"bench",yaw:Vc(i),scale:1},{s:e+2.6,t:i+Math.sign(i)*.4,kind:"litterBin",yaw:0,scale:1}]}function An(i,e){return{s:i,t:e,kind:"signpost",yaw:Vc(e),scale:1}}function zt(i,e,t,n=0){return{s:i,t:e,kind:"building",yaw:n,scale:1,size:t}}const dM=.8;function Cn(i,e="road"){return{path:[{s:0,t:0},{s:i,t:0}],role:"centre",broken:!0,paint:e}}function yi(i,e,t="road"){const n=e-dM;return[n,-n].map(s=>({path:[{s:0,t:s},{s:i,t:s}],role:"edge",paint:t}))}function Sf(i,e,t="road"){return{path:[{s:i,t:-e},{s:i,t:e}],role:"bar",paint:t}}function xf(){const i=Si($s);return[.18,.5,.82].map(e=>({s:i*e,t:-5.2,halfAlong:3.5,halfLateral:1.6,height:On,surface:"roughPavement",appearance:"stone"}))}const fM={id:"plaza",length:54,halfWidth:17,surface:"brick",shoulder:9,blocks:[...[-9,-6.2,6.2,9].flatMap(i=>[12,20].map(e=>({s:e,t:i,halfAlong:.09,halfLateral:.09,height:.9,surface:"brick",appearance:"metal"}))),{s:31,t:11.5,halfAlong:5,halfLateral:1.2,height:.85,surface:"brick",appearance:"stone"},...[-13.5,13.5].flatMap(i=>[24,38].map(e=>({s:e,t:i,halfAlong:1.1,halfLateral:.3,height:.45,surface:"brick",appearance:"wood"}))),...[1,-1].map(i=>({s:50,t:i*(4.5+5.5),halfAlong:_f,halfLateral:5.5,height:On,surface:"brick",appearance:"stone"}))],props:[...[-9,-6.2,6.2,9].flatMap(i=>[12,20].map(e=>({s:e,t:i,kind:"bollardCap",yaw:0,scale:1,lift:.9,onCollider:!0}))),...ft(19.5,6,12,4),...ft(-19.5,6,12,4),...hn(20.5,12),...hn(20.5,34),...hn(-20.5,12),...hn(-20.5,34),...we("shrub",11.5,27,4,3,{wander:.3,scale:.62,lift:.85,onCollider:!0}),...we("broadleafTree",24,4,9,6,{wander:1.2}),...we("broadleafTree",-24,8,9,5,{wander:1.2}),An(22,19)],markings:[Sf(46.5,4.2)]},pM={id:"boulevard-north",length:62,curvature:1/95,halfWidth:9,crown:.1,surface:"pavement",shoulder:7,blocks:[...ni("pavement",12.5,8,16,3)],props:[...ii(12.5,8,16,3),...ft(-11,6,20,3),...we("broadleafTree",-15.5,14,20,3,{wander:1.5}),...we("shrub",18.5,10,9,6,{wander:1.6,scale:1.15}),...hn(-11.5,26),An(4,11.5),zt(20,-27,{x:17,y:14,z:26}),zt(50,-26,{x:14,y:19,z:20})],markings:[Cn(62),...yi(62,9)]},mM={id:"boulevard-bend",length:66,curvature:-1/95,halfWidth:9,crown:.1,surface:"pavement",shoulder:7,blocks:[{s:34,t:0,halfAlong:7,halfLateral:1.8,height:Gc,surface:"pavement",appearance:"concrete"},...ni("pavement",-12.5,10,18,3)],props:[...ii(-12.5,10,18,3),...ft(11,8,22,3),...we("broadleafTree",15.5,18,22,2,{wander:1.5}),...we("shrub",-16.5,8,8,7,{wander:1.8,scale:1.1}),...hn(11.5,40),zt(18,26,{x:16,y:17,z:24}),zt(52,27,{x:13,y:12,z:18}),zt(30,-26,{x:18,y:21,z:22})],markings:[Cn(66),...yi(66,9)]},gM={id:"curb-run",length:72,curvature:-1/150,halfWidth:8.5,crown:.08,surface:"pavement",shoulder:7,blocks:[...[13,38,61].map((i,e)=>({s:i,t:-6.6,halfAlong:[10,11,8][e],halfLateral:2.4,height:Gc,surface:"pavement",appearance:"concrete"})),...ni("pavement",12,12,20,3)],props:[...ii(12,12,20,3),...ft(-11,10,24,3),...Tr(-13,5,25),...we("shrub",-16,8,7,8,{wander:1.5}),...we("broadleafTree",16.5,16,18,3,{wander:1.6}),zt(24,26,{x:20,y:15,z:30}),zt(60,27,{x:15,y:22,z:20})],markings:[Cn(72),{path:[{s:0,t:7.7},{s:72,t:7.7}],role:"edge"},{path:[{s:0,t:-3.35},{s:72,t:-3.35}],role:"edge"}]},vM={id:"fork",length:26,halfWidth:11,surface:"roughPavement",shoulder:7,blocks:[{s:20,t:14,halfAlong:8,halfLateral:4,height:On,surface:"roughPavement",appearance:"stone"}],props:[An(6,12),An(10,-12),...ft(13,4,18,2),...ft(-13,6,16,2),zt(20,25,{x:19,y:16,z:17})],markings:[Sf(3.5,9.5)]},bM={id:"road-lead",length:Pa,halfWidth:8.5,crown:.08,surface:"pavement",shoulder:7,blocks:[{s:18,t:13.5,halfAlong:17,halfLateral:4,height:On,surface:"pavement",appearance:"stone"}],props:[zt(10,25,{x:15,y:21,z:16}),zt(28,26,{x:17,y:15,z:18}),...ft(-11,8,18,2),...we("shrub",-14,6,8,4,{wander:1.4})],markings:[Cn(Pa),...yi(Pa,8.5)]},_M={id:"road-corner-a",length:Si(vi),curvature:-1/vi,halfWidth:8.5,crown:.08,climb:-.42,surface:"pavement",shoulder:7,blocks:[...ni("pavement",11.5,8,12,4)],props:[...ii(11.5,8,12,4),...ft(-11.5,10,16,3),...we("shrub",-15,6,7,6,{wander:1.5}),zt(14,24,{x:18,y:18,z:20}),zt(40,25,{x:16,y:13,z:24})],markings:[Cn(Si(vi)),...yi(Si(vi),8.5)]},SM={id:"road-cross",length:La,halfWidth:8.5,crown:.08,climb:-.12,surface:"pavement",shoulder:7,blocks:[{s:12,t:-13.5,halfAlong:11,halfLateral:4,height:On,surface:"pavement",appearance:"stone"}],props:[zt(12,-25,{x:16,y:20,z:22}),...ft(11,6,14,2),...we("shrub",14,4,6,4,{wander:1.2})],markings:[Cn(La),...yi(La,8.5)]},xM={id:"road-corner-b",length:Si(vi),curvature:-1/vi,halfWidth:8.5,crown:.08,climb:-.24,surface:"pavement",shoulder:7,blocks:[...ni("pavement",11.5,8,12,4)],props:[...ii(11.5,8,12,4),...ft(-11.5,8,16,3),...we("shrub",15,8,8,5,{wander:1.5}),zt(16,-24,{x:17,y:16,z:21}),zt(42,-25,{x:14,y:23,z:18})],markings:[Cn(Si(vi)),...yi(Si(vi),8.5)]},MM={id:"road-in",length:Da,halfWidth:8.5,crown:.06,climb:-.12,surface:"pavement",shoulder:7,blocks:[{s:26,t:13.5,halfAlong:24,halfLateral:4,height:On,surface:"pavement",appearance:"stone"}],props:[zt(14,25,{x:18,y:19,z:24}),zt(40,26,{x:15,y:14,z:22}),...ft(-11,8,15,3),...Tr(-12.5,6,15),...we("shrub",-15,10,8,5,{wander:1.4}),An(44,-10.5)],markings:[Cn(Da),...yi(Da,8.5)]},yM={id:"park-gate",length:Uu,halfWidth:8,climb:-2.6,surface:"pavement",shoulder:12,bands:[{from:5.2,to:8,surface:"grass"},{from:-8,to:-5.2,surface:"grass"}],blocks:[...[1,-1].map(i=>({s:12,t:i*(2.4+4.2),halfAlong:_f,halfLateral:4.2,height:On,surface:"pavement",appearance:"stone"})),...ni("pavement",9.5,20,7,3),...ni("pavement",-9.5,23,7,3)],props:[...ii(9.5,20,7,3),...ii(-9.5,23,7,3),...ft(9.5,6,0,1),...ft(-9.5,6,0,1),...we("broadleafTree",13.5,26,11,3,{wander:1.6}),...we("broadleafTree",-13.5,30,11,3,{wander:1.6}),...we("conifer",18,18,13,3,{wander:2}),...we("conifer",-18,24,13,3,{wander:2}),...we("shrub",11,16,6,7,{wander:1.4,scale:1.1}),...we("shrub",-11,19,6,7,{wander:1.4,scale:1.1}),...hn(-10.5,34),An(8,9.5)],markings:[Cn(Uu,"path")]},wM={id:"riverside",length:78,curvature:js.riverside,halfWidth:4.6,climb:-2,surface:"pavement",shoulder:11,bands:[{from:3.2,to:5.4,surface:"grass"},{from:-5.4,to:-3.2,surface:"grass"}],blocks:[...ni("pavement",7,12,15,5)],props:[...ii(7,12,15,5),...Tr(-6.4,6,27),...ft(-8.5,14,26,3),...hn(8,22),...hn(8,62),...we("conifer",12,6,12,6,{wander:2.4}),...we("conifer",-12,10,14,5,{wander:2.4}),...we("shrub",9,8,5,13,{wander:1.6,scale:1.2}),...we("shrub",-9.5,12,7,9,{wander:1.6,scale:1.2})],markings:[Cn(78,"path")]},EM={id:"ford-in",length:15,halfWidth:5.4,climb:-.55,surface:"dirt",shoulder:10,blocks:[{s:15,t:0,halfAlong:15,halfLateral:3.2,height:.55,depth:1.5,surface:"wood",appearance:"wood"},...[1,-1].map(i=>({s:15,t:i*3.05,halfAlong:14,halfLateral:.12,height:1.1,surface:"wood",appearance:"wood"}))],props:[An(3,7),...we("shrub",7.5,2,3.5,4,{wander:1.2,scale:1.3}),...we("shrub",-7.5,3,3.5,4,{wander:1.2,scale:1.3}),...we("conifer",12,4,9,2,{wander:2})]},TM={id:"ford-out",length:15,halfWidth:5.4,climb:.55,surface:"dirt",shoulder:10,props:[...we("shrub",7.5,2,3.5,4,{wander:1.2,scale:1.3}),...we("shrub",-7.5,3,3.5,4,{wander:1.2,scale:1.3}),...we("conifer",-12,5,9,2,{wander:2})]},AM={id:"riverside-lower",length:56,curvature:js.riversideLower,halfWidth:5.4,climb:-1.2,surface:"pavement",shoulder:11,bands:[{from:3.2,to:5.4,surface:"grass"},{from:-5.4,to:-3.2,surface:"grass"}],blocks:[...ni("pavement",-7,8,16,4)],props:[...ii(-7,8,16,4),...Tr(6.4,5,20),...ft(8.5,12,22,2),...hn(-8,30),...we("conifer",-11.5,6,13,4,{wander:2.4}),...we("conifer",12,9,13,4,{wander:2.4}),...we("shrub",-9.5,7,6,8,{wander:1.6,scale:1.2})]},RM={id:"gravel-spur",length:60,curvature:js.gravelSpur,halfWidth:6.5,climb:.9,surface:"gravel",shoulder:10,blocks:[{s:30,t:8.4,halfAlong:1.4,halfLateral:1.1,height:.85,surface:"gravel",appearance:"stone"}],props:[An(6,8.5),...we("conifer",10,6,11,5,{wander:2.6}),...we("conifer",-10,10,11,5,{wander:2.6}),...we("shrub",8,8,7,7,{wander:1.8,scale:1.25}),...we("shrub",-8,5,7,7,{wander:1.8,scale:1.25})]},CM={id:"trailhead",length:66,curvature:js.trailhead,halfWidth:4.6,climb:.8,surface:"dirt",shoulder:10,blocks:[...[16,22,28,44,50,56].map((i,e)=>({s:i,t:e%2===0?-.8:.9,halfAlong:.18,halfLateral:2.6,height:.1,surface:"dirt",appearance:"wood"})),{s:34,t:-2.2,halfAlong:.75,halfLateral:.75,height:.3,surface:"dirt",appearance:"stone"},{s:64,t:2,halfAlong:.6,halfLateral:.6,height:.18,surface:"dirt",appearance:"stone"}],props:[...we("conifer",7.5,4,7,9,{wander:1.8}),...we("conifer",-7.5,8,7,8,{wander:1.8}),...we("conifer",12,6,11,5,{wander:2.6,scale:1.15}),...we("conifer",-12,12,11,4,{wander:2.6,scale:1.15}),...we("shrub",6,5,5,12,{wander:1.2,scale:1.2}),...we("shrub",-6,7,5,11,{wander:1.2,scale:1.2}),An(4,6)]},PM={id:"berm",length:34,curvature:1/26,halfWidth:4.6,crossSlope:-.2,surface:"dirt",shoulder:10,props:[...we("conifer",8,4,8,4,{wander:1.8}),...we("shrub",6.5,6,5,6,{wander:1.2,scale:1.2}),...we("conifer",-13,6,10,3,{wander:2.4,scale:1.1})]},LM={id:"kicker-run",length:34,halfWidth:4.4,climb:bf,surface:"dirt",shoulder:5,blocks:[{s:34,t:0,halfAlong:aM,halfLateral:3,height:rM,depth:1.9,surface:"dirt",appearance:"dirt"}],props:[...we("conifer",-11,6,10,3,{wander:2}),...we("shrub",-8,4,7,4,{wander:1.4,scale:1.2}),...we("conifer",20,8,11,2,{wander:2.4})]},DM={id:"kicker-land",length:cM,halfWidth:5.4,surface:"dirt",shoulder:5,blocks:[{s:24,t:7.4,halfAlong:1.2,halfLateral:1,height:.9,surface:"dirt",appearance:"stone"}],props:[...we("conifer",-11,5,9,3,{wander:2}),...we("conifer",-16,12,11,2,{wander:2.4,scale:1.15}),...we("shrub",-8.5,8,7,4,{wander:1.4,scale:1.2})]},IM={id:"return-climb",length:42,curvature:js.returnClimb,halfWidth:7,climb:5,surface:"roughPavement",shoulder:7,blocks:[{s:21,t:-10.5,halfAlong:20,halfLateral:3,height:On,surface:"roughPavement",appearance:"stone"}],props:[...ft(9,6,14,3),...we("conifer",13,4,12,2,{wander:2}),...we("broadleafTree",12,30,12,2,{wander:1.6}),zt(14,-21,{x:16,y:13,z:20}),zt(34,-22,{x:14,y:18,z:16})],markings:[Cn(42),...yi(41.7,7).map(i=>({...i,path:i.path.map(e=>({...e,s:e.s+.3}))}))]},FM={id:"return-plaza",length:40,curvature:js.returnPlaza,halfWidth:7,surface:"roughPavement",shoulder:7,props:[...ft(9.5,8,14,3),...ft(-9.5,14,14,2),...we("broadleafTree",13,6,13,3,{wander:1.6}),...we("broadleafTree",-13,12,13,2,{wander:1.6}),...hn(10,22),zt(20,24,{x:15,y:16,z:22}),zt(12,-24,{x:17,y:12,z:18})],markings:[Cn(40),...yi(40,7)]},UM={id:"alley-mouth",length:Si($s),curvature:-1/$s,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...xf()],props:[...ft(-7.4,6,12,2),...we("shrub",7.5,8,7,3,{wander:1.2})]},NM={id:"alley-upper",length:Fa,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...[1,-1].map(i=>({s:Fa/2,t:i*4.6,halfAlong:Fa/2,halfLateral:1.6,height:On,surface:"roughPavement",appearance:"stone"}))],props:[...ft(7.2,5,12,2),...ft(-7.2,11,0,1),An(11,6.9)]},kM={id:"alley-steps",length:Ia,linearClimb:!0,climb:-.8999999999999999,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...[0,1,2].map(i=>({s:1.5+i*3,t:0,halfAlong:1.5,halfLateral:2.9,height:sM/2,surface:"roughPavement",appearance:"concrete"})),...[1,-1].map(i=>({s:Ia/2,t:i*4.6,halfAlong:Ia/2,halfLateral:1.6,height:On,surface:"roughPavement",appearance:"stone"}))],props:[...ft(-7.2,4.5,0,1)]},OM={id:"alley-run",length:il,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...[1,-1].map(i=>({s:il/2,t:i*4.6,halfAlong:il/2,halfLateral:1.6,height:On,surface:"roughPavement",appearance:"stone"}))],props:[...ft(7.2,6,14,2),...ft(-7.2,20,0,1)]},zM={id:"alley-dog",length:Si($s),curvature:-1/$s,halfWidth:2.9,surface:"roughPavement",shoulder:2,blocks:[...xf()],props:[...ft(-7.4,8,12,2),...we("shrub",7.5,6,8,3,{wander:1.2})]},BM={id:"alley-exit",length:lM,halfWidth:3.2,surface:"roughPavement",shoulder:3,blocks:[{s:3,t:0,halfAlong:.9,halfLateral:3.2,height:Gc,surface:"roughPavement",appearance:"concrete"}],props:[...ft(6.5,4,0,1),...we("shrub",-6.5,5,5,2,{wander:1})]},HM={id:"alley-ledge",length:22,halfWidth:2.2,surface:"brick",shoulder:0,blocks:[{s:21,t:0,halfAlong:1,halfLateral:2.2,height:.8,surface:"brick",appearance:"stone"}],props:[...ft(3.8,5,11,2),{s:18,t:-3.4,kind:"litterBin",yaw:0,scale:1}]},GM={id:"drain-run",length:74,curvature:1/300,halfWidth:2.6,crown:-.55,surface:"pavement",shoulder:1.6,props:[...Tr(4.4,3,29),...we("shrub",-4.6,6,6,11,{wander:1,scale:1.15}),An(4,-4.4)]},VM={id:"terrace",length:52,halfWidth:9,surface:"brick",shoulder:6,blocks:[{s:26,t:3.4,halfAlong:20,halfLateral:.55,height:.2,surface:"brick",appearance:"stone"},{s:26,t:-3.4,halfAlong:20,halfLateral:.55,height:.34,surface:"brick",appearance:"concrete"},...ni("brick",8,8,12,4)],props:[...ii(8,8,12,4),...ft(12.5,8,16,3),...ft(-12.5,14,16,2),...hn(-11,14),...hn(-11,34),...hn(11.5,26),...we("shrub",-14,6,6,7,{wander:1.4,scale:1.15}),...we("broadleafTree",-17,10,14,3,{wander:1.5}),An(5,11.5)]},Mf=13,to=26,WM=Math.acos(1-Mf/(2*to)),yf=WM*to,XM={id:"chicken-lead",length:12,halfWidth:3,surface:"dirt",shoulder:4},YM={id:"chicken-in",length:yf,curvature:-1/to,halfWidth:3,surface:"dirt",shoulder:4,props:[...we("conifer",9,3,8,2,{wander:1.6})]},qM={id:"chicken-out",length:yf,curvature:1/to,halfWidth:3,surface:"dirt",shoulder:4,props:[...we("conifer",9.5,4,9,2,{wander:1.6}),...we("shrub",7,3,6,3,{wander:1.2,scale:1.2})]},$M=[fM,pM,mM,gM,vM,bM,_M,SM,xM,MM,yM,wM,EM,TM,AM,RM,CM,PM,LM],ZM=[{from:"kicker-run",elevationOffset:-bf,specs:[DM,IM,FM]},{from:"kicker-run",atDistance:0,lateralOffset:Mf,specs:[XM,YM,qM]},{from:"fork",specs:[UM,NM,kM,OM,zM,BM]},{from:"alley-upper",atDistance:14,lateralOffset:6.6,elevationOffset:.55,headingOffset:.1,specs:[HM]},{from:"boulevard-north",atDistance:6,lateralOffset:34,elevationOffset:-1,headingOffset:.06,specs:[GM]},{from:"plaza",atDistance:24,lateralOffset:21,headingOffset:1.35,specs:[VM]}],ku={main:$M,branches:ZM},KM={minX:-180,maxX:89,minZ:-28,maxZ:331},Gi=KM,JM=(Gi.minX+Gi.maxX)/2,QM=(Gi.minZ+Gi.maxZ)/2,jM=9,da=15;function ey(i){const e=[];for(let n=Gi.minX-40;n<=Gi.maxX+40;n+=da)for(let s=Gi.minZ-40;s<=Gi.maxZ+40;s+=da){const r=Un(n,s);if(r>.46)continue;const a=n+Vs(n+1.7,s)*da*.42,o=s+Vs(n,s+3.1)*da*.42;let l=!0;for(const d of i){const h=ja(d,a,o);if(h!==null&&h.outside<jM){l=!1;break}}if(!l)continue;const c=a<-30&&o<215,u=r<.13?"shrub":c?r<.4?"conifer":"broadleafTree":r<.42?"broadleafTree":"conifer";e.push({kind:u,x:a,z:o,rotationY:Un(a,o)*Math.PI*2,scale:(u==="shrub"?1.25:1.05)*(1+.22*Vs(a+5,o)),lift:0})}return e}const Ou=88,ty=268,ny=318;function iy(){const i=[];for(let e=0;e<Ou;e+=1){const t=e/Ou*Math.PI*2,n=1+.22*Vs(e,3),s=JM+Math.sin(t)*ty*n,r=QM+Math.cos(t)*ny*n;if(!(Math.sin(t)>-.15||Math.cos(t)>.55)){i.push({kind:Un(e,7)>.35?"conifer":"broadleafTree",x:s,z:r,rotationY:Un(e,11)*Math.PI*2,scale:2.6+1.4*Un(e,13),lift:0});continue}const o=14+46*Un(e,17)**1.7,l=14+22*Un(e,19);i.push({kind:"building",x:s,z:r,rotationY:Un(e,23)*Math.PI*2,scale:1,size:{x:l,y:o,z:l*(.7+.6*Un(e,29))},lift:0})}return i}const sy=[{id:"start",segment:"plaza",s:50,kind:"start",label:"Start"},{id:"curb-run",segment:"curb-run",s:25,kind:"split",label:"Curb run"},{id:"park-gate",segment:"park-gate",s:18,kind:"split",label:"Park gate"},{id:"gravel-spur",segment:"gravel-spur",s:20,kind:"split",label:"Gravel spur"},{id:"kicker",segment:"kicker-land",s:18,kind:"split",label:"The kicker"},{id:"finish",segment:"return-plaza",s:34,kind:"finish",label:"Finish"}],zu={position:{x:0,y:0,z:0},headingY:0};function ry(){const i=ff(ku,zu);return pf(ku,{id:"m7-slice",spawn:zu,surround:{height:0,surface:"grass"},props:[...ey(i),...iy()],checkpoints:sy})}const qa="slice",dc={slice:ry,proving:iM};function ay(i){return i!=null&&i in dc}function oy(i=qa){return(dc[i]??dc[qa])()}function ly(i){const e=new URLSearchParams(i).get("level");return ay(e)?e:qa}const wf=["hop","reset","cameraCycle","pause","muteAudio"],cy=Object.freeze({throttle:0,steer:0,crouch:!1,hop:!1,reset:!1,cameraCycle:!1,pause:!1,muteAudio:!1});function fa(i){return Number.isFinite(i)?Math.min(1,Math.max(-1,i)):0}function Bu(i,e){return Math.abs(i)>=Math.abs(e)?i:e}class hy{bufferSeconds;held=new Map;latched=new Map;axes=new Map;scriptedThrottle=null;scriptedSteer=null;scriptedCrouch=!1;constructor(e=Xn.actionBufferSeconds){this.bufferSeconds=e}setHeld(e,t,n="keyboard"){let s=this.held.get(e);if(!s){if(!t)return;s=new Set,this.held.set(e,s)}t?s.add(n):s.delete(n)}isHeld(e){const t=this.held.get(e);return t!==void 0&&t.size>0}setAxes(e,t,n){let s=this.axes.get(e);s||(s={throttle:0,steer:0},this.axes.set(e,s)),s.throttle=fa(t),s.steer=fa(n)}clearDevice(e){for(const t of this.held.values())t.delete(e);this.axes.delete(e)}press(e,t){this.latched.set(e,t)}isPending(e,t){const n=this.latched.get(e);return n===void 0?!1:t-n>this.bufferSeconds?(this.latched.delete(e),!1):!0}consume(e,t){return this.isPending(e,t)?(this.latched.delete(e),!0):!1}setScripted(e,t){e.throttle!==void 0&&(this.scriptedThrottle=fa(e.throttle)),e.steer!==void 0&&(this.scriptedSteer=fa(e.steer)),e.crouch!==void 0&&(this.scriptedCrouch=e.crouch);for(const n of wf){const s=e[n];s===!0?this.press(n,t):s===!1&&this.latched.delete(n)}}clearPending(){this.latched.clear()}clearDevices(){this.held.clear(),this.latched.clear(),this.axes.clear()}clearScripted(){this.scriptedThrottle=null,this.scriptedSteer=null,this.scriptedCrouch=!1}clearAll(){this.held.clear(),this.latched.clear(),this.axes.clear(),this.clearScripted()}sample(e){let t=(this.isHeld("accelerate")?1:0)-(this.isHeld("brake")?1:0),n=(this.isHeld("steerRight")?1:0)-(this.isHeld("steerLeft")?1:0);for(const s of this.axes.values())t=Bu(t,s.throttle),n=Bu(n,s.steer);return{throttle:this.scriptedThrottle??t,steer:this.scriptedSteer??n,crouch:this.isHeld("crouch")||this.scriptedCrouch,hop:this.isPending("hop",e),reset:this.isPending("reset",e),cameraCycle:this.isPending("cameraCycle",e),pause:this.isPending("pause",e),muteAudio:this.isPending("muteAudio",e)}}}const Ua=Object.freeze([Object.freeze({action:"accelerate",kind:"held",label:"Accelerate",defaults:Object.freeze(["KeyW","ArrowUp"])}),Object.freeze({action:"brake",kind:"held",label:"Brake / reverse",defaults:Object.freeze(["KeyS","ArrowDown"])}),Object.freeze({action:"steerLeft",kind:"held",label:"Carve left",defaults:Object.freeze(["KeyA","ArrowLeft"])}),Object.freeze({action:"steerRight",kind:"held",label:"Carve right",defaults:Object.freeze(["KeyD","ArrowRight"])}),Object.freeze({action:"hop",kind:"pressed",label:"Hop",defaults:Object.freeze(["Space"])}),Object.freeze({action:"crouch",kind:"held",label:"Crouch / charge hop",defaults:Object.freeze(["ShiftLeft","ShiftRight"])}),Object.freeze({action:"cameraCycle",kind:"pressed",label:"Camera view",defaults:Object.freeze(["KeyC"])}),Object.freeze({action:"muteAudio",kind:"pressed",label:"Mute",defaults:Object.freeze(["KeyM"])}),Object.freeze({action:"reset",kind:"pressed",label:"Quick reset",defaults:Object.freeze(["KeyR"])})]),uy="Escape",Ef=Object.freeze(new Set(["Escape","F3","F4","Tab"])),dy=Object.freeze({F3:"toggleOverlay",F4:"toggleTuningPanel"}),fy=Object.freeze(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","F3","F4"]),py=Object.freeze(["PageUp","PageDown","Home","End","Backspace","Enter","NumpadEnter"]);function Wc(i={}){const e={},t={},n=new Set(fy);for(const s of Ua){const r=i[s.action]??s.defaults;for(const a of r)Ef.has(a)||(delete e[a],delete t[a],s.kind==="held"?e[a]=s.action:t[a]=s.action,py.includes(a)&&n.add(a))}return t[uy]="pause",{held:Object.freeze(e),pressed:Object.freeze(t),suppress:n}}function my(i){return i.startsWith("Key")?i.slice(3):i.startsWith("Digit")?i.slice(5):i.startsWith("Numpad")?`Num ${i.slice(6)}`:i.startsWith("Arrow")?`${i.slice(5)} arrow`:{Space:"Space",ShiftLeft:"Left shift",ShiftRight:"Right shift",ControlLeft:"Left ctrl",ControlRight:"Right ctrl",AltLeft:"Left alt",AltRight:"Right alt",Escape:"Esc",Backquote:"`",Minus:"-",Equal:"=",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Semicolon:";",Quote:"'",Comma:",",Period:".",Slash:"/"}[i]??i}const Xc=Wc();Xc.held;Xc.pressed;Xc.suppress;function gy(i){if(!(i instanceof HTMLElement))return!1;if(i.isContentEditable)return!0;const e=i.tagName;return e==="INPUT"||e==="TEXTAREA"||e==="SELECT"}class vy{state;options;target;heldCodes=new Map;tables=Wc();constructor(e,t,n=window){this.state=e,this.options=t,this.target=n,n.addEventListener("keydown",this.onKeyDown),n.addEventListener("keyup",this.onKeyUp),n.addEventListener("blur",this.onBlur),n.document.addEventListener("visibilitychange",this.onVisibilityChange)}setBindings(e){this.reset(),this.tables=e}dispose(){this.target.removeEventListener("keydown",this.onKeyDown),this.target.removeEventListener("keyup",this.onKeyUp),this.target.removeEventListener("blur",this.onBlur),this.target.document.removeEventListener("visibilitychange",this.onVisibilityChange)}onKeyDown=e=>{if(gy(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;const t=dy[e.code];if(t){e.repeat||this.options.onDebugAction?.(t),this.tables.suppress.has(e.code)&&e.preventDefault();return}const n=this.tables.held[e.code];if(n){let r=this.heldCodes.get(n);r||(r=new Set,this.heldCodes.set(n,r)),r.add(e.code),this.state.setHeld(n,!0),this.tables.suppress.has(e.code)&&e.preventDefault();return}const s=this.tables.pressed[e.code];s&&(e.repeat||this.state.press(s,this.options.now()),this.tables.suppress.has(e.code)&&e.preventDefault())};onKeyUp=e=>{const t=this.tables.held[e.code];if(!t)return;const n=this.heldCodes.get(t);n&&(n.delete(e.code),n.size>0)||this.state.setHeld(t,!1)};reset(){this.heldCodes.clear(),this.state.clearAll()}onBlur=()=>{this.reset(),this.options.onInputReset?.("blur")};onVisibilityChange=()=>{this.target.document.visibilityState==="hidden"&&(this.reset(),this.options.onInputReset?.("hidden"))}}const qt=Object.freeze({a:0,b:1,x:2,y:3,leftShoulder:4,rightShoulder:5,leftTrigger:6,rightTrigger:7,select:8,start:9,leftStick:10,rightStick:11,dpadUp:12,dpadDown:13,dpadLeft:14,dpadRight:15,guide:16}),Hu=17,by=0,_y=1,Sy="standard",pa=Object.freeze(["up","down","left","right"]),xy=0,My=1,yy=2,wy=3,Fs=Object.freeze({stickDeadZone:.18,triggerThreshold:.08,menuRepeatDelaySeconds:.42,menuRepeatIntervalSeconds:.14,menuStickThreshold:.5});function Ey(i,e){return i>e?Math.min(1,(i-e)/(1-e))/i:0}function Gu(i,e){return i>e?Math.min(1,(i-e)/(1-e)):0}function Ty(i,e){return Math.abs(i)>=Math.abs(e)?i:e}function Vu(i){return i.mapping===Sy}function In(i,e){const t=i[e];return t!==void 0&&t.pressed===!0}function Wu(i,e){const t=i[e];if(t===void 0)return 0;const n=t.value;return!Number.isFinite(n)||n<=0?t.pressed?1:0:n}function Xu(i,e){const t=i[e];return t!==void 0&&Number.isFinite(t)?t:0}function ma(i,e){return i===void 0||!Number.isFinite(i)?e:Math.min(.9,Math.max(0,i))}function Yu(i,e){return i===void 0||!Number.isFinite(i)||i<0?e:i}class Ay{state;options;target;source;stickDeadZone;triggerThreshold;menuRepeatDelaySeconds;menuRepeatIntervalSeconds;menuStickThreshold;activeIndex=-1;priming=!1;menuMode=!1;enabled=!0;previousButtons=new Uint8Array(Hu);menuDirectionHeld=new Uint8Array(pa.length);menuRepeatAt=new Float64Array(pa.length);constructor(e,t,n=window,s=navigator){this.state=e,this.options=t,this.target=n,this.source=s,this.stickDeadZone=ma(t.stickDeadZone,Fs.stickDeadZone),this.triggerThreshold=ma(t.triggerThreshold,Fs.triggerThreshold),this.menuStickThreshold=ma(t.menuStickThreshold,Fs.menuStickThreshold),this.menuRepeatDelaySeconds=Yu(t.menuRepeatDelaySeconds,Fs.menuRepeatDelaySeconds),this.menuRepeatIntervalSeconds=Yu(t.menuRepeatIntervalSeconds,Fs.menuRepeatIntervalSeconds),n.addEventListener("gamepadconnected",this.onGamepadConnected),n.addEventListener("gamepaddisconnected",this.onGamepadDisconnected)}get connected(){return this.activeIndex>=0}setEnabled(e){this.enabled!==e&&(this.enabled=e,e||(this.activeIndex=-1,this.state.clearDevice("gamepad")))}setDeadZone(e){this.stickDeadZone=ma(e,Fs.stickDeadZone)}dispose(){this.target.removeEventListener("gamepadconnected",this.onGamepadConnected),this.target.removeEventListener("gamepaddisconnected",this.onGamepadDisconnected),this.activeIndex=-1,this.state.clearDevice("gamepad")}setMenuMode(e){this.menuMode!==e&&(this.menuMode=e,e&&this.state.clearDevice("gamepad"))}poll(e=this.options.now()){const t=this.resolvePad();if(t===null)return;const n=t.buttons,s=Xu(t.axes,by),r=Xu(t.axes,_y),a=Ey(Math.hypot(s,r),this.stickDeadZone),o=s*a,l=-r*a,c=Gu(Wu(n,qt.rightTrigger),this.triggerThreshold)-Gu(Wu(n,qt.leftTrigger),this.triggerThreshold);this.updateMenu(e,o,l,n),this.menuMode||this.updateRide(e,Ty(l,c),o,n);for(let u=0;u<Hu;u+=1)this.previousButtons[u]=In(n,u)?1:0;this.priming=!1}resolvePad(){if(!this.enabled)return null;const e=this.source.getGamepads();if(this.activeIndex>=0){const t=e[this.activeIndex];if(t!=null&&t.connected&&Vu(t))return t;this.releasePad()}for(let t=0;t<e.length;t+=1){const n=e[t];if(!(n==null||!n.connected||!Vu(n)))return this.adopt(t),n}return null}adopt(e){this.activeIndex=e,this.priming=!0,this.previousButtons.fill(0),this.menuDirectionHeld.fill(0),this.options.onConnectionChange?.(!0)}releasePad(){this.activeIndex=-1,this.priming=!1,this.previousButtons.fill(0),this.menuDirectionHeld.fill(0),this.state.clearDevice("gamepad"),this.options.onConnectionChange?.(!1)}updateRide(e,t,n,s){this.state.setAxes("gamepad",t,n),this.state.setHeld("accelerate",In(s,qt.dpadUp),"gamepad"),this.state.setHeld("brake",In(s,qt.dpadDown),"gamepad"),this.state.setHeld("steerLeft",In(s,qt.dpadLeft),"gamepad"),this.state.setHeld("steerRight",In(s,qt.dpadRight),"gamepad"),this.state.setHeld("crouch",In(s,qt.leftShoulder),"gamepad"),!this.priming&&(this.rose(s,qt.a)&&this.state.press("hop",e),this.rose(s,qt.x)&&this.state.press("reset",e),this.rose(s,qt.y)&&this.state.press("cameraCycle",e),this.rose(s,qt.start)&&this.state.press("pause",e))}updateMenu(e,t,n,s){const r=Math.abs(n)>=Math.abs(t),a=this.menuStickThreshold;this.updateMenuDirection(xy,e,In(s,qt.dpadUp)||r&&n>=a),this.updateMenuDirection(My,e,In(s,qt.dpadDown)||r&&n<=-a),this.updateMenuDirection(yy,e,In(s,qt.dpadLeft)||!r&&t<=-a),this.updateMenuDirection(wy,e,In(s,qt.dpadRight)||!r&&t>=a),this.rose(s,qt.a)&&this.emitMenu("confirm"),this.rose(s,qt.b)&&this.emitMenu("back")}updateMenuDirection(e,t,n){if(!n){this.menuDirectionHeld[e]=0;return}const s=this.menuDirectionHeld[e]===1;if(this.menuDirectionHeld[e]=1,!s){this.menuRepeatAt[e]=t+this.menuRepeatDelaySeconds,this.emitMenu(pa[e]);return}t<this.menuRepeatAt[e]||(this.menuRepeatAt[e]=t+this.menuRepeatIntervalSeconds,this.emitMenu(pa[e]))}emitMenu(e){this.priming||this.options.onMenuAction?.(e)}rose(e,t){return In(e,t)&&this.previousButtons[t]===0}onGamepadConnected=()=>{this.activeIndex>=0||this.resolvePad()};onGamepadDisconnected=e=>{e.gamepad.index===this.activeIndex&&this.releasePad()}}const ga=Object.freeze({stickTravelPx:84,stickDeadZonePx:5,stickCurve:1.35});function sl(i,e){return i===void 0||!Number.isFinite(i)||i<=0?e:i}function qu(i,e,t,n){if(!Number.isFinite(i))return 0;const s=Math.abs(i);if(!(s>t))return 0;const r=Math.max(1,e-t),a=Math.min(1,(s-t)/r),o=n===1?a:Math.pow(a,n);return i<0?-o:o}class Ry{state;options;stickTravelPx;stickDeadZonePx;stickCurve;enabled=!1;stickPointer=null;stickOriginX=0;stickOriginY=0;throttleValue=0;steerValue=0;buttonPointers=new Map;constructor(e,t){this.state=e,this.options=t,this.stickTravelPx=sl(t.stickTravelPx,ga.stickTravelPx),this.stickDeadZonePx=sl(t.stickDeadZonePx,ga.stickDeadZonePx),this.stickCurve=t.stickCurve!==void 0&&Number.isFinite(t.stickCurve)&&t.stickCurve>0?t.stickCurve:ga.stickCurve}get throttle(){return this.throttleValue}get steer(){return this.steerValue}get active(){return this.enabled}setEnabled(e){this.enabled!==e&&(this.enabled=e,e||this.reset())}setScale(e){const t=Number.isFinite(e)&&e>0?e:1;this.stickTravelPx=sl(this.options.stickTravelPx,ga.stickTravelPx)*t}stickStart(e,t,n){return!this.enabled||this.stickPointer!==null?!1:(this.stickPointer=e,this.stickOriginX=t,this.stickOriginY=n,this.writeStick(0,0),!0)}stickMove(e,t,n){if(!this.enabled||this.stickPointer!==e)return;const s=qu(t-this.stickOriginX,this.stickTravelPx,this.stickDeadZonePx,this.stickCurve),r=qu(this.stickOriginY-n,this.stickTravelPx,this.stickDeadZonePx,this.stickCurve);this.writeStick(r,s)}stickEnd(e){return this.stickPointer!==e?!1:(this.stickPointer=null,this.writeStick(0,0),!0)}buttonDown(e,t){return!this.enabled||e==="stick"||this.buttonPointers.has(e)?!1:(this.buttonPointers.set(e,t),e==="crouch"?this.state.setHeld("crouch",!0,"touch"):this.state.press("hop",this.options.now()),!0)}buttonUp(e,t){this.buttonPointers.get(e)===t&&(this.buttonPointers.delete(e),e==="crouch"&&this.state.setHeld("crouch",!1,"touch"))}releasePointer(e){for(const[t,n]of this.buttonPointers)if(n===e)return this.buttonUp(t,e),t;return this.stickEnd(e)?"stick":null}tap(e){this.enabled&&this.state.press(e,this.options.now())}reset(){this.stickPointer=null,this.buttonPointers.clear(),this.writeStick(0,0),this.state.clearDevice("touch")}dispose(){this.reset()}writeStick(e,t){this.state.setAxes("touch",e,t),!(e===this.throttleValue&&t===this.steerValue)&&(this.throttleValue=e,this.steerValue=t,this.options.onStickChange?.(e,t))}}const Cy=new Set(["crouch","hop"]),Py=`
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
`;class Ly{root;stick;input;options;active=!1;sawTouch=!1;pressedElements=new Map;constructor(e){this.options=e,this.input=e.input;const t=document.createElement("div");t.className="euc-touch euc-ui",t.hidden=!0,t.dataset.side="right",t.innerHTML=Py,t.addEventListener("pointerdown",this.onPointerDown),t.addEventListener("contextmenu",this.onContextMenu),t.addEventListener("click",this.onClick),window.addEventListener("pointermove",this.onPointerMove,{passive:!0}),window.addEventListener("pointerup",this.onPointerUp,{passive:!0}),window.addEventListener("pointercancel",this.onPointerCancel,{passive:!0}),window.addEventListener("lostpointercapture",this.onLostPointerCapture,{passive:!0}),window.addEventListener("blur",this.onBlur),document.addEventListener("visibilitychange",this.onVisibilityChange),window.addEventListener("pointerdown",this.onWindowPointerDown,{passive:!0,capture:!0}),(e.parent??document.body).appendChild(t),this.root=t,this.stick=t.querySelector("[data-touch-stick]")}get visible(){return this.active}get touchSeen(){return this.sawTouch}setActive(e){this.active!==e&&(this.active=e,this.root.hidden=!e,this.input.setEnabled(e),e||this.reset())}reset(){this.input.reset(),this.releaseStick();for(const e of this.pressedElements.values())e.removeAttribute("data-pressed");this.pressedElements.clear()}setSwapSides(e){this.root.dataset.side=e?"left":"right"}setScale(e){const t=Number.isFinite(e)&&e>0?e:1;this.root.style.setProperty("--euc-touch-scale",String(t))}showStick(e,t){this.root.style.setProperty("--euc-touch-throttle",String(e)),this.root.style.setProperty("--euc-touch-steer",String(t))}dispose(){this.root.removeEventListener("pointerdown",this.onPointerDown),this.root.removeEventListener("contextmenu",this.onContextMenu),this.root.removeEventListener("click",this.onClick),window.removeEventListener("pointermove",this.onPointerMove),window.removeEventListener("pointerup",this.onPointerUp),window.removeEventListener("pointercancel",this.onPointerCancel),window.removeEventListener("lostpointercapture",this.onLostPointerCapture),window.removeEventListener("blur",this.onBlur),document.removeEventListener("visibilitychange",this.onVisibilityChange),window.removeEventListener("pointerdown",this.onWindowPointerDown,{capture:!0}),this.pressedElements.clear(),this.root.remove()}onWindowPointerDown=e=>{this.sawTouch||e.pointerType!=="touch"||(this.sawTouch=!0,this.options.onFirstTouch?.())};onPointerDown=e=>{const t=this.elementFor(e.target);if(t===null)return;const n=t.dataset.touch;e.preventDefault();let s=!1;if(n==="stick"?e.pointerType!=="mouse"&&(s=this.input.stickStart(e.pointerId,e.clientX,e.clientY),s&&this.anchorStick(e.clientX,e.clientY)):Cy.has(n)&&(s=this.input.buttonDown(n,e.pointerId),s&&(t.setAttribute("data-pressed","true"),this.pressedElements.set(e.pointerId,t))),!!s)try{t.setPointerCapture(e.pointerId)}catch{}};onPointerMove=e=>{this.input.stickMove(e.pointerId,e.clientX,e.clientY)};onPointerUp=e=>{this.endPointer(e.pointerId)};onPointerCancel=e=>{this.endPointer(e.pointerId)};onLostPointerCapture=e=>{this.endPointer(e.pointerId)};onBlur=()=>{this.reset()};onVisibilityChange=()=>{document.visibilityState==="hidden"&&this.reset()};endPointer(e){const t=this.input.releasePointer(e);if(t===null)return;if(t==="stick"){this.releaseStick();return}const n=this.pressedElements.get(e);n!==void 0&&(n.removeAttribute("data-pressed"),this.pressedElements.delete(e))}onClick=e=>{const t=e.target;if(!(t instanceof HTMLElement))return;const n=t.closest("[data-touch-tap]")?.dataset.touchTap;n==="pause"?this.input.tap("pause"):n==="reset"?this.input.tap("reset"):n==="cameraCycle"&&this.input.tap("cameraCycle")};onContextMenu=e=>{e.preventDefault()};anchorStick(e,t){this.root.style.setProperty("--euc-touch-x",String(Math.round(e))),this.root.style.setProperty("--euc-touch-y",String(Math.round(t))),this.stick.dataset.active="true"}releaseStick(){this.stick.dataset.active="false",this.root.style.setProperty("--euc-touch-throttle","0"),this.root.style.setProperty("--euc-touch-steer","0")}elementFor(e){return e instanceof HTMLElement?e.closest("[data-touch]"):null}}const Dy=8,$u=256,Iy=.5,Fy=8,Uy=512;class Ny{colliders;field;surround;maxX;maxZ;gridOriginX;gridOriginZ;gridCell;gridColumns;gridRows;gridStarts;gridItems;stamps;stamp=0;constructor(e){this.colliders=[...e.segments.flatMap(h=>h.colliders),...e.solids??[]].map(h=>{const f=Math.cos(h.rotationY),v=Math.sin(h.rotationY),_=Math.abs(f)*h.halfExtents.x+Math.abs(v)*h.halfExtents.z,p=Math.abs(v)*h.halfExtents.x+Math.abs(f)*h.halfExtents.z;return{collider:h,cos:f,sin:v,minX:h.centre.x-_,maxX:h.centre.x+_,minZ:h.centre.z-p,maxZ:h.centre.z+p,occludes:h.occludes!==!1}}),this.field=e.heightfield,this.surround=e.surround,this.maxX=this.field.originX+(this.field.columns-1)*this.field.spacing,this.maxZ=this.field.originZ+(this.field.rows-1)*this.field.spacing;let t=1/0,n=-1/0,s=1/0,r=-1/0;for(const h of this.colliders)h.minX<t&&(t=h.minX),h.maxX>n&&(n=h.maxX),h.minZ<s&&(s=h.minZ),h.maxZ>r&&(r=h.maxZ);this.colliders.length===0&&(t=0,n=0,s=0,r=0);const a=Math.max(n-t,1e-6),o=Math.max(r-s,1e-6);this.gridCell=Math.max(Dy,a/$u,o/$u),this.gridOriginX=t,this.gridOriginZ=s,this.gridColumns=Math.max(1,Math.ceil(a/this.gridCell)),this.gridRows=Math.max(1,Math.ceil(o/this.gridCell));const l=this.gridColumns*this.gridRows,c=new Int32Array(l);let u=0;for(const h of this.colliders)u+=this.eachCell(h,f=>{c[f]+=1});this.gridStarts=new Int32Array(l+1);for(let h=0;h<l;h+=1)this.gridStarts[h+1]=this.gridStarts[h]+c[h];this.gridItems=new Int32Array(u);const d=Int32Array.from(this.gridStarts.subarray(0,l));for(let h=0;h<this.colliders.length;h+=1)this.eachCell(this.colliders[h],f=>{this.gridItems[d[f]]=h,d[f]+=1});this.stamps=new Int32Array(this.colliders.length)}get colliderCount(){return this.colliders.length}sampleGround(e,t,n){this.sampleField(e,t,n);const s=this.cellAt(e,t),r=this.gridStarts[s+1];for(let a=this.gridStarts[s];a<r;a+=1){const{collider:o,cos:l,sin:c}=this.colliders[this.gridItems[a]],u=e-o.centre.x,d=t-o.centre.z,h=l*u-c*d,f=c*u+l*d;if(Math.abs(h)>o.halfExtents.x||Math.abs(f)>o.halfExtents.z)continue;const v=o.centre.y+o.halfExtents.y;v<=n.height||(n.height=v,n.surface=o.surface,n.normal.x=0,n.normal.y=1,n.normal.z=0,n.offCourse=!1)}return n}eachCell(e,t){const n=this.columnAt(e.minX),s=this.columnAt(e.maxX),r=this.rowAt(e.minZ),a=this.rowAt(e.maxZ);let o=0;for(let l=r;l<=a;l+=1)for(let c=n;c<=s;c+=1)t(l*this.gridColumns+c),o+=1;return o}columnAt(e){const t=Math.floor((e-this.gridOriginX)/this.gridCell);return t<0?0:t>=this.gridColumns?this.gridColumns-1:t}rowAt(e){const t=Math.floor((e-this.gridOriginZ)/this.gridCell);return t<0?0:t>=this.gridRows?this.gridRows-1:t}cellAt(e,t){return this.rowAt(t)*this.gridColumns+this.columnAt(e)}raycast(e,t,n){const s=Math.hypot(t.x,t.y,t.z);if(s===0||!(n>0)||!Number.isFinite(n))return null;const r=t.x/s,a=t.y/s,o=t.z/s;let l=this.raycastTerrain(e,r,a,o,n);const c=this.raycastPreparedBoxes(e,r,a,o,n,!0);return c!==null&&(l===null||c<l)&&(l=c),l}raycastObstacle(e,t,n){const s=Math.hypot(t.x,t.y,t.z);return s===0||!(n>0)||!Number.isFinite(n)?null:this.raycastPreparedBoxes(e,t.x/s,t.y/s,t.z/s,n,!1)}raycastPreparedBoxes(e,t,n,s,r,a){const o=e.x+t*r,l=e.z+s*r,c=this.columnAt(Math.min(e.x,o)),u=this.columnAt(Math.max(e.x,o)),d=this.rowAt(Math.min(e.z,l)),h=this.rowAt(Math.max(e.z,l));this.stamp+=1;const f=this.stamp;let v=null;for(let _=d;_<=h;_+=1){const p=_*this.gridColumns;for(let g=c;g<=u;g+=1){const M=p+g,T=this.gridStarts[M+1];for(let S=this.gridStarts[M];S<T;S+=1){const R=this.gridItems[S];if(this.stamps[R]===f)continue;this.stamps[R]=f;const y=this.colliders[R];if(a&&!y.occludes)continue;const E=ky(e,t,n,s,y,r);E!==null&&(v===null||E<v)&&(v=E)}}}return v}sampleField(e,t,n){const s=this.field;if(e<s.originX||e>this.maxX||t<s.originZ||t>this.maxZ){n.height=this.surround.height,n.surface=this.surround.surface,n.normal.x=0,n.normal.y=1,n.normal.z=0,n.offCourse=!0;return}const r=(e-s.originX)/s.spacing,a=(t-s.originZ)/s.spacing,o=Math.min(s.columns-2,Math.max(0,Math.floor(r))),l=Math.min(s.rows-2,Math.max(0,Math.floor(a))),c=r-o,u=a-l,d=l*s.columns+o,h=s.heights[d],f=s.heights[d+1],v=s.heights[d+s.columns],_=s.heights[d+s.columns+1];let p,g,M;u<c?(p=f-h,g=_-f,M=h+p*c+g*u):(p=_-v,g=v-h,M=h+p*c+g*u);const T=p===0?0:-p/s.spacing,S=g===0?0:-g/s.spacing,R=1/Math.hypot(T,1,S);n.height=M,n.normal.x=T===0?0:T*R,n.normal.y=R,n.normal.z=S===0?0:S*R,n.surface=s.surfaces[l*(s.columns-1)+o],n.offCourse=!1}heightAt(e,t){const n=this.field;if(e<n.originX||e>this.maxX||t<n.originZ||t>this.maxZ)return this.surround.height;const s=(e-n.originX)/n.spacing,r=(t-n.originZ)/n.spacing,a=Math.min(n.columns-2,Math.max(0,Math.floor(s))),o=Math.min(n.rows-2,Math.max(0,Math.floor(r))),l=s-a,c=r-o,u=o*n.columns+a,d=n.heights[u];if(c<l){const v=n.heights[u+1],_=n.heights[u+n.columns+1];return d+(v-d)*l+(_-v)*c}const h=n.heights[u+n.columns],f=n.heights[u+n.columns+1];return d+(f-h)*l+(h-d)*c}raycastTerrain(e,t,n,s,r){if(e.y<=this.heightAt(e.x,e.z))return 0;const a=Math.max(this.field.spacing*Iy,r/Uy);let o=0;for(let l=a;;l+=a){const c=Math.min(l,r),u=this.heightAt(e.x+t*c,e.z+s*c);if(e.y+n*c<=u){let d=o,h=c;for(let f=0;f<Fy;f+=1){const v=(d+h)/2,_=this.heightAt(e.x+t*v,e.z+s*v);e.y+n*v<=_?h=v:d=v}return h}if(c>=r)return null;o=c}}}function ky(i,e,t,n,s,r){const{collider:a,cos:o,sin:l}=s,{centre:c,halfExtents:u}=a,d=i.x-c.x,h=i.z-c.z,f=o*d-l*h,v=l*d+o*h,_=i.y-c.y,p=o*e-l*n,g=l*e+o*n;let M=0,T=r;const S=[[f,p,u.x],[_,t,u.y],[v,g,u.z]];for(const[R,y,E]of S){if(y===0){if(R<-E||R>E)return null;continue}const m=1/y;let x=(-E-R)*m,A=(E-R)*m;if(x>A&&([x,A]=[A,x]),x>M&&(M=x),A<T&&(T=A),M>T)return null}return M}function Oy(i){return new Set(i.heightfield.surfaces)}function zy(i,e,t){return Number.isNaN(i)||i<e?e:i>t?t:i}function Dt(i){return zy(i,0,1)}function vn(i,e,t){return i+(e-i)*t}function Ot(i,e,t,n){return n<=0?i:t<=0?e:i+(e-i)*(1-Math.exp(-n/t))}function Zu(i,e,t,n,s){if(t===e)return n;const r=Dt((i-e)/(t-e));return n+(s-n)*r}function Ku(i){const e=Dt(i);return e*e}function rl(i,e,t=!1){return t?0:Ku(i.master)*Ku(i[e])}function Ju(i,e,t,n,s){const r=Dt(e),a=r>i?t:n;return Dt(Ot(i,r,a,s))}function Qu(i){return 1-Dt(i)}function By(i,e){return e<=0?0:Math.abs(i)/(2*Math.PI*e)}function Hy(){return{speed:0,throttle:0,load:0,powerStage:"normal",surface:"pavement",grounded:!0,suspensionSpeed:0,scrape:0,wobble:0,crashed:!1,idle:!1}}function ju(){return{voiceId:"",gain:0,centreHz:1e3,q:1,lowHz:200,lowGain:0,sampleGain:0,tokoGain:0,sampleRate:1,tokoRate:0}}function Gy(){return{bedGain:0,duck:0,crashDuck:0,motorHz:N.motorIdleHz,motorDriveGain:0,motorSingHz:N.motorIdleHz*N.motorSingHarmonic,motorSingGain:0,motorAirHz:N.motorIdleHz*N.motorAirHarmonic,motorAirGain:0,motorCutoffHz:N.motorCutoffAtRest,motorQ:N.motorFilterQ,regenHz:N.motorIdleHz*N.regenHarmonic,regenGain:0,windGain:0,windCutoffHz:N.windCutoffAtRest,tyre:[ju(),ju()],tyreActive:0,scrapeGain:0,scrapeCentreHz:N.scrapeCentreHz,scrapeRingHz:N.scrapeRingHz,scrapeRingGain:0,wobbleHz:N.wobbleToneLowHz,wobbleGain:0}}function Vy(){return{kind:"hop",bus:"sfx",gain:0,delaySeconds:0,thumpFromHz:0,thumpToHz:0,thumpSeconds:0,noiseHz:0,noiseQ:1,noiseSeconds:0,toneHz:0,toneSeconds:0}}const ed=8;function Wy(){return{bedTrim:N.bedTrim,motorPolePairs:N.motorPolePairs,motorIdleLevel:N.motorIdleLevel,motorLoadLevel:N.motorLoadLevel,motorSingLevel:N.motorSingLevel,motorAirLevel:N.motorAirLevel,motorLoadBrighten:N.motorLoadBrighten,regenLevel:N.regenLevel,windLevel:N.windLevel,tyreLevel:N.tyreLevel,beepLevel:N.beepLevel,tiltBackLevel:N.tiltBackLevel,duckTiltBack:N.duckTiltBack}}const Xy=at.tyreDiameter*.5;class Yy{frame=Gy();cues=Array.from({length:ed},Vy);cueCount=0;tuning=Wy();slotVoice=["",""];slotEnvelope=[0,0];slotCorrection=[1,1];activeSlot=0;currentSurface="";beepStage="normal";beepTimer=0;beepDuckHold=0;duck=0;crashDuck=0;transientDuck=0;crashedBed=1;idleGain=0;wasCrashed=!1;crashing=!1;impactHold=0;lastImpactScale=0;motorHz=N.motorIdleHz;motorGain=0;singGain=0;airGain=0;motorCutoff=N.motorCutoffAtRest;motorQ=N.motorFilterQ;regenGain=0;windGain=0;windCutoff=N.windCutoffAtRest;tyreSpeedGain=0;tyreGrain=0;scrapeGain=0;wobbleGain=0;wobbleHz=N.wobbleToneLowHz;setTuning(e){this.tuning={...this.tuning,...e}}reset(){this.slotVoice[0]="",this.slotVoice[1]="",this.slotEnvelope[0]=0,this.slotEnvelope[1]=0,this.slotCorrection[0]=1,this.slotCorrection[1]=1,this.activeSlot=0,this.currentSurface="",this.beepStage="normal",this.beepTimer=0,this.beepDuckHold=0,this.duck=0,this.crashDuck=0,this.transientDuck=0,this.crashedBed=1,this.wasCrashed=!1,this.crashing=!1,this.impactHold=0,this.lastImpactScale=0,this.motorHz=N.motorIdleHz,this.motorGain=0,this.singGain=0,this.airGain=0,this.motorCutoff=N.motorCutoffAtRest,this.motorQ=N.motorFilterQ,this.regenGain=0,this.windGain=0,this.windCutoff=N.windCutoffAtRest,this.tyreSpeedGain=0,this.tyreGrain=0,this.scrapeGain=0,this.wobbleGain=0,this.wobbleHz=N.wobbleToneLowHz,this.cueCount=0}update(e,t){const n=e>0?e:0;return this.updateTyreSlots(n,t),this.updateMotor(n,t),this.updateWind(n,t),this.updateScrape(n,t),this.updateWobble(n,t),this.updateWarnings(n,t),this.updateBed(n,t),this.impactHold=Math.max(0,this.impactHold-n),this.frame}clearCues(){this.cueCount=0}hop(e){const t=this.claimCue();t&&(t.kind="hop",t.bus="sfx",t.gain=N.hopLevel*vn(.7,1,Dt(e)),t.delaySeconds=0,t.thumpFromHz=N.hopThumpFromHz,t.thumpToHz=N.hopThumpToHz,t.thumpSeconds=N.hopThumpSeconds,t.noiseHz=N.hopNoiseHz,t.noiseQ=1.1,t.noiseSeconds=N.hopNoiseSeconds,t.toneHz=0,t.toneSeconds=0,this.demandTransientDuck(N.duckHop))}landing(e,t){const n=this.claimCue();if(!n)return;const s=vn(N.landingMinScale,1,Dt(e)),r=qy(t);n.kind="landing",n.bus="sfx",n.gain=N.landingLevel*s,n.delaySeconds=0,n.thumpFromHz=N.landingThumpFromHz,n.thumpToHz=N.landingThumpToHz,n.thumpSeconds=N.landingThumpSeconds,n.noiseHz=r.centreHz,n.noiseQ=r.q,n.noiseSeconds=N.landingNoiseSeconds,n.toneHz=0,n.toneSeconds=0,this.demandTransientDuck(N.duckLanding*Dt(e))}impact(e){const t=Dt(e/N.curbImpactReference);if(t<=.02||this.crashing||this.impactHold>0&&t<this.lastImpactScale*1.5)return;const n=this.claimCue();n&&(this.impactHold=N.impactRetriggerSeconds,this.lastImpactScale=t,n.kind="curb",n.bus="sfx",n.gain=N.curbLevel*t,n.delaySeconds=0,n.thumpFromHz=N.curbThumpFromHz,n.thumpToHz=N.curbThumpToHz,n.thumpSeconds=N.curbThumpSeconds,n.noiseHz=N.curbNoiseHz,n.noiseQ=1.4,n.noiseSeconds=N.curbNoiseSeconds,n.toneHz=0,n.toneSeconds=0,this.demandTransientDuck(N.duckCurb*t))}crash(e){const t=this.claimCue();if(!t)return;const n=vn(.55,1,Dt(Math.abs(e)/N.speedReference));t.kind="crash",t.bus="sfx",t.gain=N.crashLevel*n,t.delaySeconds=0,t.thumpFromHz=N.crashThumpFromHz,t.thumpToHz=N.crashThumpToHz,t.thumpSeconds=N.crashThumpSeconds,t.noiseHz=N.crashNoiseHz,t.noiseQ=.5,t.noiseSeconds=N.crashNoiseSeconds,t.toneHz=0,t.toneSeconds=0,this.crashing=!0,this.crashDuck=Math.max(this.crashDuck,N.duckCrash)}recover(){for(let e=0;e<2;e+=1){const t=this.claimCue();if(!t)return;t.kind="recover",t.bus="ui",t.gain=N.recoverLevel,t.delaySeconds=e*N.recoverSeconds*.55,t.thumpFromHz=0,t.thumpToHz=0,t.thumpSeconds=0,t.noiseHz=0,t.noiseQ=1,t.noiseSeconds=0,t.toneHz=e===0?N.recoverLowHz:N.recoverHighHz,t.toneSeconds=N.recoverSeconds}}claimCue(){if(this.cueCount>=ed)return null;const e=this.cues[this.cueCount];return this.cueCount+=1,e}demandTransientDuck(e){this.transientDuck=Math.max(this.transientDuck,Dt(e))}updateTyreSlots(e,t){if(t.surface!==this.currentSurface){const o=Nc(t.surface).tyreAudio;if(this.currentSurface==="")this.activeSlot=0,this.slotVoice[0]=o,this.slotVoice[1]="";else{const l=this.slotEnvelope[0]<=this.slotEnvelope[1]?0:1,c=this.slotVoice[l];if(c!==""&&this.slotEnvelope[l]>1e-4){const u=td(c)*this.slotCorrection[l],d=td(o);this.slotCorrection[l]=Math.min(25,Math.max(.04,u/d))}else this.slotCorrection[l]=1;this.slotVoice[l]=o,this.activeSlot=l}this.currentSurface=t.surface}this.slotEnvelope[0]=Ot(this.slotEnvelope[0],this.activeSlot===0&&this.slotVoice[0]!==""?1:0,N.tyreCrossfadeSeconds,e),this.slotEnvelope[1]=Ot(this.slotEnvelope[1],this.activeSlot===1&&this.slotVoice[1]!==""?1:0,N.tyreCrossfadeSeconds,e),this.slotCorrection[0]=Ot(this.slotCorrection[0],1,N.tyreCrossfadeSeconds*.5,e),this.slotCorrection[1]=Ot(this.slotCorrection[1],1,N.tyreCrossfadeSeconds*.5,e);const n=t.grounded?Zu(Math.abs(t.speed),0,N.tyreReferenceSpeed,N.tyreStandstillLevel,1):0;this.tyreSpeedGain=Ot(this.tyreSpeedGain,n,N.tyreResponseSeconds,e);const s=t.grounded?Dt(Math.abs(t.suspensionSpeed)/N.tyreGrainReference):0;this.tyreGrain=Ot(this.tyreGrain,s,N.tyreResponseSeconds*2,e),this.frame.tyreActive=this.activeSlot;const r=Math.hypot(this.slotEnvelope[0],this.slotEnvelope[1]),a=Dt(Math.abs(t.speed)/N.speedReference);this.resolveTyreSlot(0,r,a),this.resolveTyreSlot(1,r,a)}resolveTyreSlot(e,t,n){const s=this.frame.tyre[e],r=this.slotVoice[e];if(s.voiceId=r,r===""){s.gain=0,s.sampleGain=0,s.tokoGain=0;return}const a=N.tyreVoices[r]??N.tyreVoices["tyre-smooth"],o=t>1e-4?this.slotEnvelope[e]/t:0,l=1+a.grain*N.tyreGrainGain*this.tyreGrain,c=this.tuning.tyreLevel*a.level*this.tyreSpeedGain*l*o*this.slotCorrection[e];s.gain=c*(1-a.sample-a.toko),s.sampleGain=c*a.sample*N.tyreSampleTrim,s.tokoGain=c*a.toko*N.tokoSampleTrim,s.sampleRate=a.sampleRate*vn(N.tyreSampleRateAtRest,N.tyreSampleRateAtSpeed,n),s.tokoRate=n*N.speedReference/N.tyreReferenceSpeed,s.centreHz=a.centreHz*vn(1,N.tyreCutoffRise,n),s.q=a.q,s.lowHz=a.lowHz,s.lowGain=a.lowLevel}updateMotor(e,t){const n=this.tuning,s=this.frame,r=t.grounded?1:N.airSpinFactor,a=Math.min(N.motorMaxHz,Math.max(N.motorIdleHz,By(t.speed,Xy)*n.motorPolePairs*r));this.motorHz=Ot(this.motorHz,a,N.motorResponseSeconds,e);const o=Math.max(t.throttle>0?t.throttle:0,Dt(t.load)),l=t.grounded?1:N.airDriveFactor,c=(n.motorIdleLevel+n.motorLoadLevel*o)*l;this.motorGain=Ot(this.motorGain,c,N.motorResponseSeconds,e);const u=Dt(Math.abs(t.speed)/N.speedReference);this.singGain=Ot(this.singGain,n.motorSingLevel*vn(N.motorSingIdleShare,1,u**N.motorSingCurve),N.motorResponseSeconds,e),this.airGain=Ot(this.airGain,n.motorAirLevel*u**N.motorAirCurve,N.motorResponseSeconds,e);const d=t.throttle<0&&Math.abs(t.speed)>.5?-t.throttle:0,h=vn(N.motorCutoffAtRest,N.motorCutoffAtSpeed,u)*vn(1,n.motorLoadBrighten,o)*vn(1,N.regenCutoffFactor,d);this.motorCutoff=Ot(this.motorCutoff,h,N.motorResponseSeconds,e),this.motorQ=Ot(this.motorQ,vn(N.motorFilterQ,N.regenResonance,d),N.regenResponseSeconds,e),s.motorHz=this.motorHz,s.motorDriveGain=this.motorGain,s.motorSingHz=this.motorHz*N.motorSingHarmonic,s.motorSingGain=this.singGain,s.motorAirHz=this.motorHz*N.motorAirHarmonic,s.motorAirGain=this.airGain,s.motorCutoffHz=this.motorCutoff,s.motorQ=this.motorQ,this.regenGain=Ot(this.regenGain,n.regenLevel*d*vn(.4,1,u),N.regenResponseSeconds,e),s.regenHz=this.motorHz*N.regenHarmonic,s.regenGain=this.regenGain}updateWind(e,t){const n=this.tuning,s=Zu(Math.abs(t.speed),N.windOnsetSpeed,N.speedReference,0,1),r=t.grounded?1:N.windAirBoost;this.windGain=Ot(this.windGain,n.windLevel*s**N.windExponent*r,N.windResponseSeconds,e),this.windCutoff=Ot(this.windCutoff,vn(N.windCutoffAtRest,N.windCutoffAtSpeed,s),N.windResponseSeconds,e),this.frame.windGain=this.windGain,this.frame.windCutoffHz=this.windCutoff}updateScrape(e,t){const n=Dt(Math.abs(t.scrape)/N.scrapeFullOverlap),s=Dt(Math.abs(t.speed)/N.scrapeReferenceSpeed),r=t.grounded?N.scrapeLevel*n*s:0;this.scrapeGain=Ot(this.scrapeGain,r,N.scrapeResponseSeconds,e),this.frame.scrapeGain=this.scrapeGain,this.frame.scrapeCentreHz=N.scrapeCentreHz,this.frame.scrapeRingHz=N.scrapeRingHz,this.frame.scrapeRingGain=this.scrapeGain*N.scrapeRingLevel}updateWobble(e,t){const n=Dt(t.wobble);this.wobbleGain=Ot(this.wobbleGain,N.wobbleToneLevel*n,N.wobbleToneResponseSeconds,e),this.wobbleHz=Ot(this.wobbleHz,vn(N.wobbleToneLowHz,N.wobbleToneHighHz,n),N.wobbleToneResponseSeconds,e),this.frame.wobbleGain=this.wobbleGain,this.frame.wobbleHz=this.wobbleHz}updateWarnings(e,t){const n=this.beepPattern(t.powerStage);if(t.powerStage!==this.beepStage&&(this.beepStage=t.powerStage,this.beepTimer=0),n===null||t.idle||t.crashed){this.beepTimer=0,this.beepDuckHold=Math.max(0,this.beepDuckHold-e);return}this.beepTimer-=e,this.beepTimer<=0&&(this.beepTimer+=n.periodSeconds,this.beepTimer<=0&&(this.beepTimer=n.periodSeconds),this.emitBeep(n,0),n.double&&this.emitBeep(n,N.beepDoubleGapSeconds),this.beepDuckHold=N.beepSeconds*2.2+(n.double?N.beepDoubleGapSeconds:0)),this.beepDuckHold=Math.max(0,this.beepDuckHold-e)}emitBeep(e,t){const n=this.claimCue();n&&(n.kind="beep",n.bus="ui",n.gain=e.level,n.delaySeconds=t,n.thumpFromHz=0,n.thumpToHz=0,n.thumpSeconds=0,n.noiseHz=0,n.noiseQ=1,n.noiseSeconds=0,n.toneHz=e.hz,n.toneSeconds=N.beepSeconds)}beepPattern(e){const t=this.tuning.beepLevel;if(t<=0)return null;switch(e){case"notice":return{hz:N.noticeHz,periodSeconds:N.noticePeriodSeconds,level:N.noticeLevel*t,duck:N.duckNotice,double:!1};case"warn":return{hz:N.warnHz,periodSeconds:N.warnPeriodSeconds,level:N.warnLevel*t,duck:N.duckWarn,double:!0};case"tiltBack":return{hz:N.tiltBackHz,periodSeconds:N.tiltBackPeriodSeconds,level:this.tuning.tiltBackLevel*t,duck:this.tuning.duckTiltBack,double:!1};default:return null}}updateBed(e,t){const n=this.beepPattern(t.powerStage),s=n!==null&&this.beepDuckHold>0?n.duck:0;this.transientDuck=Math.max(0,this.transientDuck-e/Math.max(1e-6,N.duckReleaseSeconds)),this.duck=Ju(this.duck,Math.max(s,this.transientDuck),N.duckAttackSeconds,N.duckReleaseSeconds,e),this.crashDuck=Ju(this.crashDuck,0,N.duckAttackSeconds,N.duckCrashReleaseSeconds,e),this.crashedBed=Ot(this.crashedBed,t.crashed?N.crashedBedGain:1,N.crashedBedSeconds,e),this.idleGain=Ot(this.idleGain,t.idle?0:1,.05,e),this.wasCrashed&&!t.crashed&&this.recover(),this.wasCrashed=t.crashed,this.crashing=t.crashed,this.frame.duck=this.duck,this.frame.crashDuck=this.crashDuck,this.frame.bedGain=this.tuning.bedTrim*Qu(this.duck)*Qu(this.crashDuck)*this.crashedBed*this.idleGain}}function qy(i){const e=Nc(i).tyreAudio;return N.tyreVoices[e]??N.tyreVoices["tyre-smooth"]}function td(i){const e=N.tyreVoices[i]??N.tyreVoices["tyre-smooth"];return e.level*(1-e.sample-e.toko+e.sample*N.tyreSampleTrim+e.toko*N.tokoSampleTrim)}const $y=3;function Zy(i){let e=(i|0)===0?2654435769:i|0;return()=>(e^=e<<13,e^=e>>>17,e^=e<<5,(e>>>0)/2147483648-1)}function Ky(){return{b0:0,b1:0,b2:0,b3:0,b4:0,b5:0,b6:0}}function Jy(i,e){i.b0=.99886*i.b0+e*.0555179,i.b1=.99332*i.b1+e*.0750759,i.b2=.969*i.b2+e*.153852,i.b3=.8665*i.b3+e*.3104856,i.b4=.55*i.b4+e*.5329522,i.b5=-.7616*i.b5-e*.016898;const t=i.b0+i.b1+i.b2+i.b3+i.b4+i.b5+i.b6+e*.5362;return i.b6=e*.115926,t*.11}function nd(i,e,t="white"){const n=i.length;if(n===0)return;const s=Math.min(2048,Math.max(1,Math.floor(n/8))),r=Zy(e),a=Ky(),o=new Float32Array(n+s);for(let l=0;l<o.length;l+=1){const c=r();o[l]=t==="pink"?Jy(a,c):c}for(let l=0;l<n;l+=1)i[l]=o[l];for(let l=0;l<s;l+=1){const c=l/s;i[l]=o[n+l]*(1-c)+o[l]*c}Qy(i)}function Qy(i){let e=0;for(let n=0;n<i.length;n+=1){const s=Math.abs(i[n]);s>e&&(e=s)}if(e<=1e-9)return;const t=1/e;for(let n=0;n<i.length;n+=1)i[n]*=t}const jy=24,Ui=1e-4;class ew{context;permanent=[];permanentSources=[];voices=new Set;droppedVoices=0;master;limiter;sfxBus;uiBus;musicBus;bed;transientTrim;motorDrive;motorSing;motorAir;regen;motorFilter;windFilter;windGain;windNoise;tyre;bank=null;crashIndex=0;crashSamplePlays=0;scrapeFilter;scrapeGain;scrapeRingLow;scrapeRingGain;wobble;whiteBuffer;pinkBuffer;burstIndex=0;analyser=null;analyserData=null;spectrumData=null;disposed=!1;constructor(e){this.context=e;const t=e.sampleRate,n=Math.max(1,Math.floor(t*$y));this.whiteBuffer=e.createBuffer(1,n,t),nd(this.whiteBuffer.getChannelData(0),24301,"white"),this.pinkBuffer=e.createBuffer(1,n,t),nd(this.pinkBuffer.getChannelData(0),12648430,"pink"),this.limiter=this.keep(e.createDynamicsCompressor()),this.limiter.threshold.value=N.limiterThresholdDb,this.limiter.knee.value=N.limiterKneeDb,this.limiter.ratio.value=N.limiterRatio,this.limiter.attack.value=N.limiterAttackSeconds,this.limiter.release.value=N.limiterReleaseSeconds,this.limiter.connect(e.destination),this.master=this.keep(e.createGain()),this.master.gain.value=1,this.master.connect(this.limiter),this.sfxBus=this.keep(e.createGain()),this.uiBus=this.keep(e.createGain()),this.musicBus=this.keep(e.createGain()),this.sfxBus.connect(this.master),this.uiBus.connect(this.master),this.musicBus.connect(this.master),this.bed=this.keep(e.createGain()),this.bed.gain.value=0,this.bed.connect(this.sfxBus),this.transientTrim=this.keep(e.createGain()),this.transientTrim.gain.value=N.transientTrim,this.transientTrim.connect(this.sfxBus),this.motorFilter=this.keep(e.createBiquadFilter()),this.motorFilter.type="lowpass",this.motorFilter.frequency.value=N.motorCutoffAtRest,this.motorFilter.Q.value=N.motorFilterQ,this.motorFilter.connect(this.bed),this.motorDrive=this.createPartial("sine",N.motorIdleHz,this.motorFilter),this.motorSing=this.createPartial("triangle",N.motorIdleHz*N.motorSingHarmonic,this.motorFilter),this.motorAir=this.createPartial("sine",N.motorIdleHz*N.motorAirHarmonic,this.motorFilter),this.regen=this.createPartial("sine",N.motorIdleHz*N.regenHarmonic,this.motorFilter),this.windFilter=this.keep(e.createBiquadFilter()),this.windFilter.type="bandpass",this.windFilter.frequency.value=N.windCutoffAtRest,this.windFilter.Q.value=N.windQ,this.windGain=this.keep(e.createGain()),this.windGain.gain.value=0,this.windFilter.connect(this.windGain),this.windGain.connect(this.bed),this.windNoise=this.createLoop(this.pinkBuffer,this.windFilter),this.tyre=[this.createTyreSlot(),this.createTyreSlot()],this.scrapeFilter=this.keep(e.createBiquadFilter()),this.scrapeFilter.type="bandpass",this.scrapeFilter.frequency.value=N.scrapeCentreHz,this.scrapeFilter.Q.value=N.scrapeQ,this.scrapeGain=this.keep(e.createGain()),this.scrapeGain.gain.value=0,this.scrapeFilter.connect(this.scrapeGain),this.scrapeGain.connect(this.bed),this.createLoop(this.whiteBuffer,this.scrapeFilter),this.scrapeRingGain=this.keep(e.createGain()),this.scrapeRingGain.gain.value=0,this.scrapeRingGain.connect(this.bed),this.scrapeRingLow=this.keep(e.createOscillator()),this.scrapeRingLow.type="sine",this.scrapeRingLow.frequency.value=N.scrapeRingHz,this.scrapeRingLow.connect(this.scrapeRingGain),this.startSource(this.scrapeRingLow),this.wobble=this.createPartial("triangle",N.wobbleToneLowHz,this.bed)}get counts(){return{permanentNodes:this.permanent.length,voices:this.voices.size,droppedVoices:this.droppedVoices,crashSamplePlays:this.crashSamplePlays}}get samplesLoaded(){return this.bank!==null}setSampleBank(e){if(this.disposed||this.bank!==null)return;this.bank=e;for(let n=0;n<2;n+=1){const s=this.tyre[n],r=this.keep(this.context.createBufferSource());r.buffer=e.tyreOffroad,r.loop=!0,r.connect(s.sampleGain),this.permanentSources.push(r),r.start(0,n===0?0:e.tyreOffroad.duration/2),s.sample=r;const a=this.keep(this.context.createBufferSource());a.buffer=e.tyreSolid,a.loop=!0,a.connect(s.tokoGain),this.permanentSources.push(a),a.start(0,n===0?0:e.tyreSolid.duration/2),s.toko=a}this.windNoise.stop(),this.windNoise.disconnect();const t=this.keep(this.context.createGain());t.gain.value=N.windSampleTrim,t.connect(this.windFilter),this.createLoop(e.windHowl,t)}setBusGains(e,t,n){if(this.disposed)return;const s=this.context.currentTime;this.glide(this.sfxBus.gain,e,s),this.glide(this.uiBus.gain,t,s),this.glide(this.musicBus.gain,n,s)}applyFrame(e){if(this.disposed)return;const t=this.context.currentTime,n=e.bedGain;this.glide(this.bed.gain,n,t),this.glide(this.motorDrive.osc.frequency,e.motorHz,t),this.glide(this.motorDrive.gain.gain,e.motorDriveGain,t),this.glide(this.motorSing.osc.frequency,e.motorSingHz,t),this.glide(this.motorSing.gain.gain,e.motorSingGain,t),this.glide(this.motorAir.osc.frequency,e.motorAirHz,t),this.glide(this.motorAir.gain.gain,e.motorAirGain,t),this.glide(this.regen.osc.frequency,e.regenHz,t),this.glide(this.regen.gain.gain,e.regenGain,t),this.glide(this.motorFilter.frequency,e.motorCutoffHz,t),this.glide(this.motorFilter.Q,e.motorQ,t),this.glide(this.windGain.gain,e.windGain,t),this.glide(this.windFilter.frequency,e.windCutoffHz,t);for(let s=0;s<2;s+=1){const r=this.tyre[s],a=e.tyre[s];this.glide(r.bandGain.gain,a.gain,t),this.glide(r.band.frequency,a.centreHz,t),this.glide(r.band.Q,a.q,t),this.glide(r.bodyGain.gain,a.gain*a.lowGain,t),this.glide(r.body.frequency,a.lowHz,t),this.glide(r.sampleGain.gain,a.sampleGain,t),r.sample&&this.glide(r.sample.playbackRate,a.sampleRate,t),this.glide(r.tokoGain.gain,a.tokoGain,t),r.toko&&this.glide(r.toko.playbackRate,a.tokoRate,t)}this.glide(this.scrapeGain.gain,e.scrapeGain,t),this.glide(this.scrapeFilter.frequency,e.scrapeCentreHz,t),this.glide(this.scrapeRingGain.gain,e.scrapeRingGain,t),this.glide(this.scrapeRingLow.frequency,e.scrapeRingHz,t),this.glide(this.wobble.osc.frequency,e.wobbleHz,t),this.glide(this.wobble.gain.gain,e.wobbleGain,t)}play(e){if(this.disposed)return;if(this.voices.size>=jy){this.droppedVoices+=1;return}const t=this.context.currentTime+Math.max(0,e.delaySeconds),n=e.bus==="ui"?this.uiBus:this.transientTrim;if(e.kind==="crash"&&this.bank){this.playCrashSample(this.bank.crash,e,t,n);return}e.toneSeconds>0&&e.toneHz>0&&this.playTone(e,t,n),e.thumpSeconds>0&&e.thumpFromHz>0&&this.playThump(e,t,n),e.noiseSeconds>0&&e.noiseHz>0&&this.playBurst(e,t,n)}outputLevel(){if(this.disposed)return 0;const e=this.tapAnalyser(),t=this.analyserData;if(!e||!t)return 0;e.getFloatTimeDomainData(t);let n=0;for(let s=0;s<t.length;s+=1)n+=t[s]*t[s];return Math.sqrt(n/t.length)}outputSpectrum(){if(this.disposed)return null;const e=this.tapAnalyser(),t=this.spectrumData;return!e||!t?null:(e.getFloatFrequencyData(t),{binHz:this.context.sampleRate/e.fftSize,db:t})}tapAnalyser(){if(this.disposed)return null;if(!this.analyser){const e=this.keep(this.context.createAnalyser());e.fftSize=2048,e.smoothingTimeConstant=.6,this.limiter.connect(e),this.analyser=e,this.analyserData=new Float32Array(new ArrayBuffer(e.fftSize*4)),this.spectrumData=new Float32Array(new ArrayBuffer(e.frequencyBinCount*4))}return this.analyser}stopAllVoices(){for(const e of[...this.voices])try{e.stop()}catch{}}dispose(){if(!this.disposed){this.disposed=!0,this.stopAllVoices(),this.voices.clear();for(const e of this.permanentSources){try{e.stop()}catch{}e.onended=null}for(const e of this.permanent)e.disconnect();this.permanent.length=0,this.permanentSources.length=0,this.analyser=null,this.analyserData=null,this.spectrumData=null}}keep(e){return this.permanent.push(e),e}startSource(e){return this.permanentSources.push(e),e.start(),e}createPartial(e,t,n){const s=this.keep(this.context.createOscillator());s.type=e,s.frequency.value=t;const r=this.keep(this.context.createGain());return r.gain.value=0,s.connect(r),r.connect(n),this.startSource(s),{osc:s,gain:r}}createLoop(e,t){const n=this.keep(this.context.createBufferSource());return n.buffer=e,n.loop=!0,n.connect(t),this.startSource(n),n}createTyreSlot(){const e=this.context,t=this.keep(e.createBiquadFilter());t.type="bandpass",t.frequency.value=1e3,t.Q.value=1;const n=this.keep(e.createGain());n.gain.value=0,t.connect(n),n.connect(this.bed);const s=this.keep(e.createBiquadFilter());s.type="lowpass",s.frequency.value=200,s.Q.value=.7;const r=this.keep(e.createGain());r.gain.value=0,s.connect(r),r.connect(this.bed);const a=this.keep(e.createBufferSource());a.buffer=this.pinkBuffer,a.loop=!0,a.connect(t),a.connect(s),this.startSource(a);const o=this.keep(e.createGain());o.gain.value=0,o.connect(this.bed);const l=this.keep(e.createGain());return l.gain.value=0,l.connect(this.bed),{source:a,band:t,bandGain:n,body:s,bodyGain:r,sampleGain:o,tokoGain:l,sample:null,toko:null}}playCrashSample(e,t,n,s){const r=this.context,a=r.createBufferSource();a.buffer=e;const o=this.crashIndex%3===0?0:this.crashIndex%3===1?1:-1;this.crashIndex+=1;const l=1+N.crashSampleRateSpread*o;a.playbackRate.value=l;const c=r.createGain(),u=t.gain*N.crashSampleTrim;c.gain.setValueAtTime(Ui,n),c.gain.linearRampToValueAtTime(u,n+.008),a.connect(c),c.connect(s),this.launch(a,n,n+e.duration/l+.05,[c]),this.crashSamplePlays+=1}playTone(e,t,n){const s=this.context,r=s.createOscillator();r.type="square",r.frequency.setValueAtTime(e.toneHz,t);const a=s.createBiquadFilter();a.type="lowpass",a.frequency.value=N.beepCutoffHz;const o=s.createGain(),l=t+e.toneSeconds;o.gain.setValueAtTime(Ui,t),o.gain.linearRampToValueAtTime(e.gain,t+N.beepAttackSeconds),o.gain.setValueAtTime(e.gain,l),o.gain.exponentialRampToValueAtTime(Ui,l+N.beepReleaseSeconds),r.connect(a),a.connect(o),o.connect(n),this.launch(r,t,l+N.beepReleaseSeconds,[a,o])}playThump(e,t,n){const s=this.context,r=s.createOscillator();r.type="sine",r.frequency.setValueAtTime(e.thumpFromHz,t),r.frequency.exponentialRampToValueAtTime(Math.max(Ui,e.thumpToHz),t+e.thumpSeconds);const a=s.createGain();a.gain.setValueAtTime(Ui,t),a.gain.linearRampToValueAtTime(e.gain,t+.004),a.gain.exponentialRampToValueAtTime(Ui,t+e.thumpSeconds),r.connect(a),a.connect(n),this.launch(r,t,t+e.thumpSeconds,[a])}playBurst(e,t,n){const s=this.context,r=s.createBufferSource();r.buffer=this.whiteBuffer;const a=s.createBiquadFilter();a.type="bandpass",a.frequency.value=e.noiseHz,a.Q.value=e.noiseQ;const o=s.createGain();o.gain.setValueAtTime(Ui,t),o.gain.linearRampToValueAtTime(e.gain,t+.005),o.gain.exponentialRampToValueAtTime(Ui,t+e.noiseSeconds),r.connect(a),a.connect(o),o.connect(n),this.burstIndex+=1;const l=this.whiteBuffer.duration,c=this.burstIndex*.317%Math.max(.001,l-e.noiseSeconds);this.launchAt(r,t,c,t+e.noiseSeconds,[a,o])}launch(e,t,n,s){this.register(e,s),e.start(t),e.stop(n)}launchAt(e,t,n,s,r){this.register(e,r),e.start(t,n),e.stop(s)}register(e,t){this.voices.add(e),e.onended=()=>{this.voices.delete(e),e.disconnect();for(const n of t)n.disconnect();e.onended=null}}glide(e,t,n){Number.isFinite(t)&&e.setTargetAtTime(t,n,N.paramGlideSeconds)}}const id=["pointerdown","keydown","touchstart"],tw=600;function sd(){if(typeof window>"u")return null;const i=window;return i.AudioContext??i.webkitAudioContext??null}class nw{director=new Yy;input=Hy();target;context=null;sink=null;listening=!1;disposed=!1;volumes=iw;muted=!1;sampleData=null;samplesRequested=!1;decodeStarted=!1;played={hop:0,landing:0,curb:0,crash:0,recover:0,beep:0};constructor(e=typeof window>"u"?null:window){this.target=e,this.listenForGesture()}get supported(){return sd()!==null}get armed(){return this.sink!==null}arm(){if(this.disposed||this.sink!==null)return;const e=sd();if(e){try{const t=this.context??new e;this.context=t,this.sink=new ew(t),this.applyVolumes(),t.resume().catch(()=>{})}catch{this.sink=null;return}this.stopListeningForGesture(),this.installSamples()}}setSampleUrls(e){this.disposed||this.samplesRequested||(this.samplesRequested=!0,(async()=>{try{const[t,n,s,r]=await Promise.all([fetch(e.tyreOffroad).then(a=>a.arrayBuffer()),fetch(e.tyreSolid).then(a=>a.arrayBuffer()),fetch(e.windHowl).then(a=>a.arrayBuffer()),fetch(e.crash).then(a=>a.arrayBuffer())]);if(this.disposed)return;this.sampleData={tyreOffroad:t,tyreSolid:n,windHowl:s,crash:r},this.installSamples()}catch{}})())}installSamples(){const e=this.context,t=this.sampleData;!e||!this.sink||!t||this.decodeStarted||this.disposed||(this.decodeStarted=!0,(async()=>{try{const[n,s,r,a]=await Promise.all([e.decodeAudioData(t.tyreOffroad),e.decodeAudioData(t.tyreSolid),e.decodeAudioData(t.windHowl),e.decodeAudioData(t.crash)]);if(this.disposed)return;const o={tyreOffroad:n,tyreSolid:s,windHowl:r,crash:a};this.sink?.setSampleBank(o)}catch{}finally{this.sampleData=null}})())}setVolumes(e){this.volumes={master:Dt(e.master??this.volumes.master),sfx:Dt(e.sfx??this.volumes.sfx),ui:Dt(e.ui??this.volumes.ui),music:Dt(e.music??this.volumes.music)},this.applyVolumes()}setMuted(e){this.muted=e,this.applyVolumes()}toggleMuted(){return this.setMuted(!this.muted),this.muted}setTuning(e){this.director.setTuning(e)}update(e){if(this.disposed)return;let t=Number.isFinite(e)?Math.max(0,e):0,n=0;do{const s=Math.min(t,N.modelStepSeconds);t-=s,n+=1,this.director.update(s,this.input);for(let r=0;r<this.director.cueCount;r+=1){const a=this.director.cues[r];this.played[a.kind]+=1,this.sink?.play(a)}this.director.clearCues()}while(t>1e-9&&n<tw);this.sink?.applyFrame(this.director.frame)}hop(e){this.director.hop(e)}landing(e,t){this.director.landing(e,t)}impact(e){this.director.impact(e)}crash(e){this.director.crash(e)}reset(){this.director.reset(),this.sink?.stopAllVoices()}setSuspended(e){const t=this.context;if(!(!t||this.disposed)){if(e){t.state==="running"&&t.suspend().catch(()=>{});return}t.state==="suspended"&&t.resume().catch(()=>{})}}outputLevel(){return this.sink?.outputLevel()??0}outputSpectrum(){return this.sink?.outputSpectrum()??null}snapshot(){const e=this.director.frame,t=this.sink?.counts,[n,s]=e.tyre;return{supported:this.supported,armed:this.armed,contextState:this.context?.state??"unavailable",muted:this.muted,volumes:this.volumes,sampleRate:this.context?.sampleRate??0,permanentNodes:t?.permanentNodes??0,samplesLoaded:this.sink?.samplesLoaded??!1,voices:t?.voices??0,droppedVoices:t?.droppedVoices??0,played:{...this.played},crashSamplePlays:t?.crashSamplePlays??0,bedGain:e.bedGain,duck:e.duck,motorHz:e.motorHz,motorGain:e.motorDriveGain,motorCutoffHz:e.motorCutoffHz,motorQ:e.motorQ,regenGain:e.regenGain,windGain:e.windGain,tyreGain:n.gain+n.sampleGain+n.tokoGain+s.gain+s.sampleGain+s.tokoGain,tyreVoice:e.tyre[e.tyreActive].voiceId,scrapeGain:e.scrapeGain,wobbleGain:e.wobbleGain}}dispose(){if(this.disposed)return;this.disposed=!0,this.stopListeningForGesture(),this.sink?.dispose(),this.sink=null;const e=this.context;this.context=null,e&&e.state!=="closed"&&e.close().catch(()=>{})}applyVolumes(){this.sink&&this.sink.setBusGains(rl(this.volumes,"sfx",this.muted),rl(this.volumes,"ui",this.muted),rl(this.volumes,"music",this.muted))}listenForGesture(){if(!(!this.target||this.listening)){this.listening=!0;for(const e of id)this.target.addEventListener(e,this.onGesture,{capture:!0,passive:!0})}}stopListeningForGesture(){if(!(!this.target||!this.listening)){this.listening=!1;for(const e of id)this.target.removeEventListener(e,this.onGesture,{capture:!0})}}onGesture=()=>{this.arm()}}const iw=Object.freeze({master:1,sfx:1,ui:1,music:.7}),sw=""+new URL("tyre_offroad_loop-C2A8IYgc.wav",import.meta.url).href,rw=""+new URL("tyre_solid_loop-Bnkdbldc.wav",import.meta.url).href,aw=""+new URL("wind_howl_loop-DoSne_ZV.wav",import.meta.url).href,ow=""+new URL("crash_wipeout-TJe-08nm.wav",import.meta.url).href,lw={tyreOffroad:sw,tyreSolid:rw,windHowl:aw,crash:ow};function cw(){return{now:()=>performance.now(),requestFrame:i=>requestAnimationFrame(i),cancelFrame:i=>cancelAnimationFrame(i),setTimer:(i,e)=>window.setTimeout(i,e),clearTimer:i=>window.clearTimeout(i)}}class hw{stepSeconds;scheduler;callbacks;maxStepsPerFrame=pr.maxStepsPerFrame;accumulator=0;lastTimeMs=0;startedAtMs=0;alpha=0;running=!0;mode="idle";timerFallback=!1;firstFrameMs=null;frameHandle=0;timerHandle=0;probeHandle=0;frames=0;syntheticFrames=0;steps=0;droppedSteps=0;stepsLastFrame=0;constructor(e,t){this.callbacks=e,this.scheduler=t,this.stepSeconds=1/pr.hz}start(){this.mode==="idle"&&(this.mode="raf",this.startedAtMs=this.scheduler.now(),this.lastTimeMs=this.startedAtMs,this.accumulator=0,this.frameHandle=this.scheduler.requestFrame(this.onAnimationFrame),this.probeHandle=this.scheduler.setTimer(this.onProbeExpired,pr.firstFrameProbeMs))}setRunning(e){this.running!==e&&(this.running=e,e&&this.resetTime())}isRunning(){return this.running}resetTime(){this.lastTimeMs=this.scheduler.now(),this.accumulator=0}setMaxStepsPerFrame(e){this.maxStepsPerFrame=Math.max(1,Math.floor(e))}advance(e){if(this.mode==="stopped")return;const t=Number.isFinite(e)?Math.max(0,Math.floor(e)):0,n=this.scheduler.now();for(let o=0;o<t;o+=1)this.callbacks.step(this.stepSeconds);const s=this.scheduler.now()-n;this.steps+=t,this.stepsLastFrame=t,this.accumulator=0,this.alpha=1,this.lastTimeMs=this.scheduler.now();const r=this.scheduler.now();this.callbacks.render(1,!0);const a=this.scheduler.now()-r;this.frames+=1,this.syntheticFrames+=1,this.callbacks.onFrameSampled?.({simMs:s,renderMs:a,steps:t,synthetic:!0})}stats(){return{frames:this.frames,syntheticFrames:this.syntheticFrames,steps:this.steps,droppedSteps:this.droppedSteps,stepsLastFrame:this.stepsLastFrame,running:this.running,mode:this.mode,alpha:this.alpha,accumulatorSeconds:this.accumulator,timerFallback:this.timerFallback,firstFrameMs:this.firstFrameMs}}dispose(){this.mode="stopped",this.frameHandle&&this.scheduler.cancelFrame(this.frameHandle),this.timerHandle&&this.scheduler.clearTimer(this.timerHandle),this.probeHandle&&this.scheduler.clearTimer(this.probeHandle),this.frameHandle=0,this.timerHandle=0,this.probeHandle=0}onAnimationFrame=e=>{this.mode==="raf"&&(this.probeHandle&&(this.scheduler.clearTimer(this.probeHandle),this.probeHandle=0,this.firstFrameMs=Math.max(0,e-this.startedAtMs)),this.frameHandle=this.scheduler.requestFrame(this.onAnimationFrame),this.runFrame(e))};onProbeExpired=()=>{this.probeHandle=0,this.mode==="raf"&&(this.frameHandle&&this.scheduler.cancelFrame(this.frameHandle),this.frameHandle=0,this.mode="timer",this.timerFallback=!0,this.resetTime(),this.scheduleTimer())};onTimerTick=()=>{this.timerHandle=0,this.mode==="timer"&&(this.scheduleTimer(),this.runFrame(this.scheduler.now()))};scheduleTimer(){this.timerHandle=this.scheduler.setTimer(this.onTimerTick,pr.fallbackIntervalMs)}runFrame(e){const t=Math.max(0,e-this.lastTimeMs)/1e3;this.lastTimeMs=e,this.callbacks.beforeFrame?.(e);let n=0,s=0;if(this.running){this.accumulator+=t;const o=this.scheduler.now();for(;this.accumulator>=this.stepSeconds&&n<this.maxStepsPerFrame;)this.callbacks.step(this.stepSeconds),this.accumulator-=this.stepSeconds,n+=1;if(s=this.scheduler.now()-o,this.accumulator>=this.stepSeconds){const l=Math.floor(this.accumulator/this.stepSeconds);this.droppedSteps+=l,this.accumulator-=l*this.stepSeconds}this.accumulator<0&&(this.accumulator=0),this.alpha=this.accumulator/this.stepSeconds}this.steps+=n,this.stepsLastFrame=n,this.frames+=1;const r=this.scheduler.now();this.callbacks.render(this.alpha,!1);const a=this.scheduler.now()-r;this.callbacks.onFrameSampled?.({simMs:s,renderMs:a,steps:n,synthetic:!1})}}const uw=Object.freeze({p50:0,p95:0,p99:0,worst:0});function al(i,e,t){if(e===0)return 0;const n=Math.ceil(t*e)-1;return i[Math.min(e-1,Math.max(0,n))]}class dw{capacity;sim;render;scratch;writeIndex=0;count=0;saturated=!1;syntheticExcluded=0;steps=0;constructor(e=kc.sampleWindow){this.capacity=Math.max(1,Math.floor(e)),this.sim=new Float64Array(this.capacity),this.render=new Float64Array(this.capacity),this.scratch=new Float64Array(this.capacity)}begin(){this.writeIndex=0,this.count=0,this.saturated=!1,this.syntheticExcluded=0,this.steps=0,this.sim.fill(0),this.render.fill(0)}record(e){if(this.steps+=e.steps,e.synthetic){this.syntheticExcluded+=1;return}this.sim[this.writeIndex]=e.simMs,this.render[this.writeIndex]=e.renderMs,this.writeIndex=(this.writeIndex+1)%this.capacity,this.count<this.capacity?this.count+=1:this.saturated=!0}report(){return{sampled:this.count,syntheticExcluded:this.syntheticExcluded,saturated:this.saturated,simMs:this.percentiles(this.sim),renderMs:this.percentiles(this.render),steps:this.steps}}percentiles(e){if(this.count===0)return uw;for(let n=0;n<this.count;n+=1)this.scratch[n]=e[n];const t=this.scratch.subarray(0,this.count);return t.sort(),{p50:al(t,this.count,.5),p95:al(t,this.count,.95),p99:al(t,this.count,.99),worst:t[this.count-1]}}}const rd="euc-diagnostics-style",fw=`
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
`;function Tf(i=document){if(i.getElementById(rd))return;const e=i.createElement("style");e.id=rd,e.textContent=fw,i.head.appendChild(e)}const ye=new Intl.NumberFormat("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}),Pt=new Intl.NumberFormat("en-GB",{maximumFractionDigits:0}),ad=new Intl.NumberFormat("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:"always"});function pw(i){const e=[];return i.crouch&&e.push("crouch"),i.hop&&e.push("hop"),i.reset&&e.push("reset"),i.cameraCycle&&e.push("camera"),i.pause&&e.push("pause"),e.length>0?e.join(" "):"—"}class mw{doc;root=null;values=new Map;shown=!1;lastRefreshMs=-1/0;refreshIntervalMs;constructor(e=document){this.doc=e,this.refreshIntervalMs=1e3/kc.overlayRefreshHz}get visible(){return this.shown}toggle(){this.setVisible(!this.shown)}setVisible(e){this.shown=e,e&&(this.build(),this.lastRefreshMs=-1/0),this.root&&(this.root.hidden=!e)}shouldRefresh(e){return this.shown&&e-this.lastRefreshMs>=this.refreshIntervalMs}update(e,t){if(!this.shown||!this.root)return;this.lastRefreshMs=t;const n=e.loop;this.set("tick",Pt.format(e.tick)),this.set("simtime",`${ye.format(e.simTimeSeconds)} s`),this.set("state",n.running?"running":"FROZEN"),this.set("scheduler",n.timerFallback?"timer fallback":`raf${n.firstFrameMs===null?" (pending)":""}`,n.timerFallback),this.set("firstframe",n.firstFrameMs===null?"—":`${ye.format(n.firstFrameMs)} ms`),this.set("frames",`${Pt.format(n.frames)} (${Pt.format(n.syntheticFrames)} synthetic)`),this.set("steps",`${Pt.format(n.stepsLastFrame)} this frame`),this.set("dropped",Pt.format(n.droppedSteps),n.droppedSteps>0),this.set("alpha",ye.format(n.alpha)),this.set("throttle",ad.format(e.actions.throttle)),this.set("steer",ad.format(e.actions.steer)),this.set("actions",pw(e.actions)),this.set("consumed",Object.entries(e.consumed).map(([o,l])=>`${o} ${l}`).join("  "));const s=e.euc;this.set("ridestate",s.state),this.set("speed",`${ye.format(s.speedKph)} km/h  (${ye.format(s.speed)} m/s)`),this.set("ridepos",`${ye.format(s.position.x)}, ${ye.format(s.position.y)}, ${ye.format(s.position.z)}`),this.set("heading",`${ye.format(Wa(s.headingY))} rad`),this.set("lean",`${ye.format(s.leanPitch)} force  (rider ${ye.format(s.riderPitch)}, wheel ${ye.format(s.wheelPitch)})`),this.set("longitudinal",`${ye.format(s.longitudinalAccel)} m/s²`),this.set("roll",`${ye.format(s.rollAngle)} rad  (upper ${ye.format(s.riderRoll)})`),this.set("lateral",`${ye.format(s.lateralAccel)} m/s²  yaw ${ye.format(s.yawRate)} rad/s`+(s.lateralLimited?"  LIMIT":""),s.lateralLimited),this.set("ridden",`${Pt.format(s.distanceTravelled)} m`),this.set("look",`${ye.format(s.riderLookYaw)} rad`),this.set("surface",`${s.surface}${s.offCourse?" (off course)":""}${s.grounded?"":"  AIRBORNE"}`,!s.grounded),this.set("resistance",`${ye.format(s.rollingResistance)} m/s²  grip ${ye.format(s.lateralLimitG)} g`),this.set("slope",`${ye.format(s.slope)} rad  (${ye.format(s.slopeAccel)} m/s²)`),this.set("suspension",`${ye.format(s.suspensionOffset*100)} cm travel  (${ye.format(s.suspensionCompression*100)} cm closed)`),this.set("contact",s.blocked?`BLOCKED  impact ${ye.format(s.collisionImpact)} m/s`:s.lastStepUp>0?`step up ${ye.format(s.lastStepUp*100)} cm`:s.curbAhead!==0?`${ye.format(s.curbAhead*100)} cm ahead`:"clear",s.blocked),this.set("air",s.grounded?s.compressing?`compressing (charge ${ye.format(s.hopCharge)})`:`grounded  charge ${ye.format(s.crouchCharge)}`:`${ye.format(s.airHeight*100)} cm up  apex ${ye.format(s.airApex*100)} cm  ${ye.format(s.airTime)} s  v ${ye.format(s.verticalVelocity)} m/s`,!s.grounded),this.set("airaim",`${Pt.format(s.hops)} hops  yaw off travel ${ye.format(s.airMisalignment)} rad`),this.set("landing",s.landingQuality==="none"?"—":`${s.landingQuality}  impact ${ye.format(s.landingImpact)} m/s  off ${ye.format(s.landingMisalignment)} rad  score ${ye.format(s.landingScore)}  -${ye.format(s.landingSpeedLoss*100)}%  (${Pt.format(s.landings)})`,s.landingQuality==="wobble"||s.landingQuality==="crash"),this.set("pedal",s.pedalStrike===0?`clear (${ye.format(s.pedalClearance)} rad)`:`SCRAPING ${ye.format(Math.abs(s.pedalStrike))} rad past ${ye.format(s.pedalClearance)} on the ${s.pedalStrike>0?"left":"right"}`,s.pedalStrike!==0),this.set("wobble",`${ye.format(s.wobbleEnergy)} energy  ${ye.format(s.wobbleYaw)} rad  ${s.wobbleRate>=0?"+":""}${ye.format(s.wobbleRate)}/s`,s.wobbleEnergy>=Q.wobbleStateEnergy),this.set("wobblesmooth",`${ye.format(s.wobbleSmoothness)} input  ${ye.format(s.wobbleFootCorrection)} feet`),this.set("power",`${ye.format(s.loadFactor)} load  ${s.powerStage}`+(s.tiltBack>0?`  tilt-back ${ye.format(s.tiltBack)}`:""),s.powerStage==="warn"||s.powerStage==="tiltBack"),this.set("crash",s.crashed?`${s.crashMotion} from ${s.crashCause}  ${ye.format(s.crashTime)} s  ${s.recoveryReady?"recovery ready":"holding"}`:s.invulnerable>0?`recovering — invulnerable ${ye.format(s.invulnerable)} s`:s.crashes===0?"—":`${Pt.format(s.crashes)} so far (last: ${s.crashMotion} from ${s.crashCause})`,s.crashed),this.set("safespot",`${ye.format(s.safePosition.x)}, ${ye.format(s.safePosition.z)}  heading ${ye.format(Wa(s.safeHeading))} rad`),this.set("camera",e.cameraMode),this.set("camarm",`${ye.format(e.cameraDistance)} m  fov ${ye.format(e.cameraFov)} rad`),this.set("camaim",`${ye.format(e.cameraLookAhead)} m ahead  bank ${ye.format(e.cameraBank)} rad`),this.set("camlag",`${ye.format(e.cameraYawLag)} rad behind heading`),this.set("viewport",`${e.viewportWidth}x${e.viewportHeight} @${e.pixelRatio}x`),this.set("draws",`${Pt.format(e.drawCalls)} draws  ${Pt.format(e.triangles)} tris`),this.set("gpu",`${Pt.format(e.geometries)} geo  ${Pt.format(e.textures)} tex  ${Pt.format(e.programs)} prog`);const r=e.profile;this.set("simms",`p50 ${ye.format(r.simMs.p50)}  p95 ${ye.format(r.simMs.p95)}  p99 ${ye.format(r.simMs.p99)}`),this.set("renderms",`p50 ${ye.format(r.renderMs.p50)}  p95 ${ye.format(r.renderMs.p95)}  p99 ${ye.format(r.renderMs.p99)}`),this.set("window",`${Pt.format(r.sampled)} real frames`+(r.syntheticExcluded>0?`, ${Pt.format(r.syntheticExcluded)} synthetic excluded`:""));const a=e.audio;this.set("audiostate",a.supported?`${a.contextState}${a.armed?"":" (awaiting a gesture)"}${a.armed&&!a.samplesLoaded?"  samples loading":""}${a.muted?"  MUTED":""}`:"no Web Audio in this browser",!a.supported||a.muted||a.armed&&!a.samplesLoaded),this.set("audiomix",`bed ${ye.format(a.bedGain)}  duck ${ye.format(a.duck)}  master ${ye.format(a.volumes.master)}`,a.duck>.05),this.set("audiomotor",`${Pt.format(a.motorHz)} Hz  gain ${ye.format(a.motorGain)}  cut ${Pt.format(a.motorCutoffHz)} Hz`+(a.regenGain>.01?`  REGEN Q ${ye.format(a.motorQ)}`:""),a.regenGain>.01),this.set("audioworld",`wind ${ye.format(a.windGain)}  tyre ${ye.format(a.tyreGain)}  ${a.tyreVoice||"—"}`+(a.scrapeGain>.01?`  scrape ${ye.format(a.scrapeGain)}`:"")),this.set("audiovoices",`${Pt.format(a.voices)} live  ${Pt.format(a.permanentNodes)} nodes`+(a.droppedVoices>0?`  ${Pt.format(a.droppedVoices)} DROPPED`:""),a.droppedVoices>0),this.set("audioplayed",Object.entries(a.played).map(([o,l])=>`${o} ${l}`).join("  ")),this.set("overrides",e.tuningOverrides===0?"none":`${Pt.format(e.tuningOverrides)} active`,e.tuningOverrides>0)}dispose(){this.root?.remove(),this.root=null,this.values.clear(),this.shown=!1}set(e,t,n=!1){const s=this.values.get(e);s&&(s.textContent!==t&&(s.textContent=t),s.classList.toggle("warn",n))}build(){if(this.root)return;Tf(this.doc);const e=this.doc.createElement("section");e.id="euc-debug-overlay",e.className="euc-diag",e.setAttribute("aria-hidden","true");const t=this.doc.createElement("h2");t.textContent="Debug — F3",e.appendChild(t);const n=[["Loop",[["tick","tick"],["simtime","sim time"],["state","state"],["scheduler","scheduler"],["firstframe","first frame"],["frames","frames"],["steps","steps"],["dropped","dropped steps"],["alpha","alpha"]]],["Input",[["throttle","throttle"],["steer","steer"],["actions","held / pending"],["consumed","consumed"]]],["Ride",[["ridestate","state"],["speed","speed"],["ridepos","position"],["heading","heading"],["lean","lean"],["longitudinal","longitudinal"],["roll","roll"],["lateral","lateral"],["ridden","ridden"],["look","look into turn"]]],["Ground",[["surface","surface"],["resistance","resistance"],["slope","slope"],["suspension","suspension"],["contact","contact"]]],["Air",[["air","hop / flight"],["airaim","aim"],["landing","last landing"],["pedal","pedal"]]],["Risk",[["wobble","wobble"],["wobblesmooth","recovery"],["power","power"],["crash","crash"],["safespot","safe spot"]]],["Camera",[["camera","mode"],["camarm","arm"],["camaim","aim"],["camlag","yaw lag"]]],["Render",[["viewport","viewport"],["draws","scene"],["gpu","gpu objects"]]],["Timing (our code only)",[["simms","sim ms"],["renderms","render ms"],["window","window"]]],["Audio",[["audiostate","context"],["audiomix","mix"],["audiomotor","motor"],["audioworld","world"],["audiovoices","voices"],["audioplayed","one-shots"]]],["Tuning",[["overrides","overrides"]]]];for(const[r,a]of n){const o=this.doc.createElement("h3");o.textContent=r,e.appendChild(o);const l=this.doc.createElement("dl");for(const[c,u]of a){const d=this.doc.createElement("dt");d.textContent=u;const h=this.doc.createElement("dd");h.dataset.field=c,h.textContent="—",l.append(d,h),this.values.set(c,h)}e.appendChild(l)}const s=this.doc.createElement("p");s.className="euc-note",s.textContent="No frame-rate figure here on purpose: an automated or unfocused tab has its own cadence. Frame interval comes from a human at a focused window.",e.appendChild(s),this.doc.body.appendChild(e),this.root=e}}class gw{doc;tuning;root=null;rows=[];shown=!1;unsubscribe=null;status=null;constructor(e,t=document){this.tuning=e,this.doc=t}get visible(){return this.shown}toggle(){this.setVisible(!this.shown)}setVisible(e){this.shown=e,e&&(this.build(),this.syncAll()),this.root&&(this.root.hidden=!e)}dispose(){this.unsubscribe?.(),this.unsubscribe=null,this.root?.remove(),this.root=null,this.rows=[],this.status=null,this.shown=!1}syncAll(){for(const e of this.rows)this.syncRow(e);this.updateStatus()}syncRow(e){const t=this.tuning.get(e.path),n=this.tuning.overrides()[e.path]!==void 0,s=String(Number(t.toFixed(4))),r=e.unit?`${s} ${e.unit}`:s;e.slider.value!==String(t)&&(e.slider.value=String(t)),e.output.value!==r&&(e.output.value=r),e.wrapper.classList.toggle("is-overridden",n)}updateStatus(){if(!this.status)return;const e=this.tuning.overrideCount();this.status.textContent=e===0?"No overrides. Values shown are the defaults in src/data/tuning.ts.":`${e} override${e===1?"":"s"} active — session only. Copy them into src/data/tuning.ts to keep them.`}build(){if(this.root)return;Tf(this.doc);const e=this.doc.createElement("section");e.id="euc-tuning-panel",e.className="euc-diag",e.setAttribute("aria-label","Tuning panel");const t=this.doc.createElement("h2");t.textContent="Tuning — F4",e.appendChild(t);let n="";for(const l of this.tuning.views()){if(l.spec.group!==n){n=l.spec.group;const _=this.doc.createElement("h3");_.textContent=n,e.appendChild(_)}const c=this.doc.createElement("div");c.className="euc-tunable",c.dataset.path=l.spec.path,c.title=`${l.spec.path} — ${l.spec.note}`;const u=`euc-tunable-${l.spec.path.replace(/\W+/g,"-")}`,d=this.doc.createElement("label");d.htmlFor=u,d.textContent=l.spec.label;const h=this.doc.createElement("output");h.htmlFor=u;const f=this.doc.createElement("button");f.type="button",f.className="euc-revert",f.textContent="⤺",f.title=`Reset to the default, ${l.defaultValue}`,f.addEventListener("click",()=>{this.tuning.reset(l.spec.path)});const v=this.doc.createElement("input");v.type="range",v.id=u,v.min=String(l.spec.min),v.max=String(l.spec.max),v.step=String(l.spec.step),v.value=String(l.value),v.addEventListener("input",()=>{this.tuning.set(l.spec.path,Number(v.value))}),c.append(d,h,f,v),e.appendChild(c),this.rows.push({path:l.spec.path,unit:l.spec.unit,wrapper:c,slider:v,output:h})}const s=this.doc.createElement("div");s.className="euc-actions";const r=this.doc.createElement("button");r.type="button",r.textContent="Reset all",r.addEventListener("click",()=>{this.tuning.reset()});const a=this.doc.createElement("button");a.type="button",a.textContent="Copy overrides",a.addEventListener("click",()=>{const l=JSON.stringify(this.tuning.overrides(),null,2);console.info(`[tuning] overrides
`+l),this.doc.defaultView?.navigator?.clipboard?.writeText(l).catch(()=>{})}),s.append(r,a),e.appendChild(s);const o=this.doc.createElement("p");o.className="euc-note",e.appendChild(o),this.status=o,this.doc.body.appendChild(e),this.root=e,this.unsubscribe=this.tuning.onChange(l=>{const c=this.rows.find(u=>u.path===l);c&&this.syncRow(c),this.updateStatus()})}}class vw{options;root=null;action=null;constructor(e){this.options=e}get visible(){return this.root!==null&&!this.root.hidden}show(){const e=this.ensureDom();e.hidden&&(e.hidden=!1,e.style.display="grid",this.options.role==="alert"&&this.action?.focus())}hide(){this.root&&(this.root.hidden=!0,this.root.style.display="none")}dispose(){this.root?.remove(),this.root=null,this.action=null}ensureDom(){if(this.root)return this.root;const e=document.createElement("div");e.id=this.options.id,e.setAttribute("role",this.options.role),e.hidden=!0,Object.assign(e.style,{position:"fixed",inset:"0",display:"none",placeContent:"center",justifyItems:"center",gap:"0.75rem",padding:"2rem",textAlign:"center",background:"rgba(9, 12, 16, 0.62)",color:"#eef2f7",fontFamily:'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',zIndex:"30",pointerEvents:"none"});const t=document.createElement("div");t.textContent=this.options.title,Object.assign(t.style,{fontSize:"1.6rem",fontWeight:"800",letterSpacing:"0.12em",textTransform:"uppercase"}),e.appendChild(t);const n=document.createElement("p");if(n.textContent=this.options.message,Object.assign(n.style,{margin:"0",maxWidth:"38ch",color:"#97a3b4",fontSize:"0.95rem",lineHeight:"1.5"}),e.appendChild(n),this.options.actionLabel&&this.options.onAction){const s=document.createElement("button");s.type="button",s.textContent=this.options.actionLabel,Object.assign(s.style,{marginTop:"0.5rem",padding:"0.6rem 1.4rem",border:"none",borderRadius:"0.4rem",background:"#1f6fe0",color:"#ffffff",font:"inherit",fontWeight:"600",cursor:"pointer",pointerEvents:"auto"}),s.addEventListener("click",this.options.onAction),e.appendChild(s),this.action=s}return document.body.appendChild(e),this.root=e,e}}const Na="euc-thrills.v1.",ol=`${Na}probe`;function bw(){try{return typeof globalThis>"u"?null:globalThis.localStorage??null}catch{return null}}class _w{failure;store;memory=new Map;constructor(e=bw()){if(e===null){this.store=null,this.failure="unavailable";return}let t=null;try{e.setItem(ol,"ok"),e.getItem(ol)!=="ok"&&(t="discarded"),e.removeItem(ol)}catch{t="blocked"}this.failure=t,this.store=t===null?e:null}degraded=!1;get persistent(){return this.store!==null&&!this.degraded}read(e){const t=Na+e,n=this.memory.get(t);if(n!==void 0)return n;if(this.store===null)return null;try{return this.store.getItem(t)}catch{return null}}write(e,t){const n=Na+e;if(this.memory.set(n,t),this.store===null||this.degraded)return!1;try{return this.store.setItem(n,t),this.store.getItem(n)!==t?(this.degraded=!0,!1):!0}catch{return!1}}remove(e){const t=Na+e;if(this.memory.delete(t),this.store!==null)try{this.store.removeItem(t)}catch{}}readJson(e,t){const n=this.read(e);if(n===null)return null;let s;try{s=JSON.parse(n)}catch{return this.remove(e),null}const r=t(s);return r===null&&this.remove(e),r}writeJson(e,t){let n;try{n=JSON.stringify(t)}catch{return!1}return this.write(e,n)}}const Af=["low","medium","high"],Rf=["kph","mph"],Cf=["auto","on","off"],Pf=.8,Lf=1.4,Df=Object.freeze({quality:"high",fieldOfViewTrim:0,speedUnit:"kph",volumeMaster:1,volumeSfx:1,volumeUi:1,volumeMusic:1,muted:!1,bindings:Object.freeze({}),gamepadEnabled:!0,gamepadDeadZone:.18,touchControls:"auto",touchSwapSides:!1,touchScale:1,seenPrompts:Object.freeze([])}),ll="options";function va(i){return Number.isFinite(i)?i<0?0:i>1?1:i:0}function cl(i,e,t,n){return Number.isFinite(i)?i<e?e:i>t?t:i:n}const If=-8,Ff=12;function hl(i,e=Df){const t=typeof i=="object"&&i!==null?i:{},n=Af.includes(t.quality)?t.quality:e.quality;return Object.freeze({quality:n,fieldOfViewTrim:typeof t.fieldOfViewTrim=="number"?cl(t.fieldOfViewTrim,If,Ff,e.fieldOfViewTrim):e.fieldOfViewTrim,speedUnit:Rf.includes(t.speedUnit)?t.speedUnit:e.speedUnit,volumeMaster:typeof t.volumeMaster=="number"?va(t.volumeMaster):e.volumeMaster,volumeSfx:typeof t.volumeSfx=="number"?va(t.volumeSfx):e.volumeSfx,volumeUi:typeof t.volumeUi=="number"?va(t.volumeUi):e.volumeUi,volumeMusic:typeof t.volumeMusic=="number"?va(t.volumeMusic):e.volumeMusic,muted:typeof t.muted=="boolean"?t.muted:e.muted,bindings:Sw(t.bindings,e.bindings),gamepadEnabled:typeof t.gamepadEnabled=="boolean"?t.gamepadEnabled:e.gamepadEnabled,gamepadDeadZone:typeof t.gamepadDeadZone=="number"?cl(t.gamepadDeadZone,0,.5,e.gamepadDeadZone):e.gamepadDeadZone,touchControls:Cf.includes(t.touchControls)?t.touchControls:e.touchControls,touchSwapSides:typeof t.touchSwapSides=="boolean"?t.touchSwapSides:e.touchSwapSides,touchScale:typeof t.touchScale=="number"?cl(t.touchScale,Pf,Lf,e.touchScale):e.touchScale,seenPrompts:Array.isArray(t.seenPrompts)?Object.freeze(t.seenPrompts.filter(s=>typeof s=="string")):e.seenPrompts})}function Sw(i,e){if(typeof i!="object"||i===null)return e;const t={};for(const[n,s]of Object.entries(i)){if(!Array.isArray(s))continue;const r=s.filter(a=>typeof a=="string"&&a.length>0&&a.length<=32);t[n]=Object.freeze(r)}return Uf(t,e)?e:Object.freeze(t)}function Uf(i,e){const t=new Set([...Object.keys(i),...Object.keys(e)]);for(const n of t){const s=i[n],r=e[n];if(s===void 0||r===void 0||s.length!==r.length)return!1;for(let a=0;a<s.length;a+=1)if(s[a]!==r[a])return!1}return!0}class xw{storage;listeners=new Set;defaults;options;constructor(e,t={}){this.storage=e,this.defaults=hl(t,Df),this.options=this.storage.readJson(ll,n=>hl(n,this.defaults))??this.defaults}get current(){return this.options}get persistent(){return this.storage.persistent}set(e){const t=hl({...this.options,...e},this.options);if(!od(t,this.options)){this.options=t,this.storage.writeJson(ll,t);for(const n of this.listeners)n(t)}}reset(){if(!od(this.defaults,this.options)){this.options=this.defaults,this.storage.writeJson(ll,this.defaults);for(const e of this.listeners)e(this.defaults)}}markPromptSeen(e){this.options.seenPrompts.includes(e)||this.set({seenPrompts:[...this.options.seenPrompts,e]})}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear()}}function od(i,e){if(i.quality!==e.quality||i.fieldOfViewTrim!==e.fieldOfViewTrim||i.speedUnit!==e.speedUnit||i.volumeMaster!==e.volumeMaster||i.volumeSfx!==e.volumeSfx||i.volumeUi!==e.volumeUi||i.volumeMusic!==e.volumeMusic||i.muted!==e.muted||i.gamepadEnabled!==e.gamepadEnabled||i.gamepadDeadZone!==e.gamepadDeadZone||i.touchControls!==e.touchControls||i.touchSwapSides!==e.touchSwapSides||i.touchScale!==e.touchScale||i.seenPrompts.length!==e.seenPrompts.length)return!1;for(let t=0;t<i.seenPrompts.length;t+=1)if(i.seenPrompts[t]!==e.seenPrompts[t])return!1;return Uf(i.bindings,e.bindings)}const Nf=0,kf=1,Of=2,zf=3,Bf=4,Hf=5,Gf=6,Vf=7,Wf=8,mi=9,Xf=.001,Mw=[Xf,qe.ghostPositionStep,qe.ghostPositionStep,qe.ghostPositionStep,qe.ghostPositionStep,qe.ghostAngleStep,qe.ghostAngleStep,qe.ghostPositionStep,qe.ghostPositionStep],Vi=2**31,fc=qe.ghostMaxSeconds+1,no=240,yw=Math.ceil(fc*no)+2,ww=64;function Ew(i){return Number.isFinite(i.x)&&Number.isFinite(i.y)&&Number.isFinite(i.z)&&Number.isFinite(i.groundY)&&Number.isFinite(i.headingY)&&Number.isFinite(i.rollAngle)&&Number.isFinite(i.speed)&&Number.isFinite(i.crouch)}class Tw{interval;maxSeconds;maxSamples;samples=[];nextSampleTime=0;lastTime=-1;stopped=!1;constructor(e={}){const t=e.sampleHz??qe.ghostSampleHz,n=Number.isFinite(t)&&t>0&&t<=no?t:qe.ghostSampleHz;this.interval=1/n;const s=e.maxSeconds??qe.ghostMaxSeconds;this.maxSeconds=Number.isFinite(s)&&s>0?s:qe.ghostMaxSeconds,this.maxSamples=Math.ceil(this.maxSeconds*n)+2}reset(){this.samples=[],this.nextSampleTime=0,this.lastTime=-1,this.stopped=!1}record(e,t){if(!this.stopped&&!(!Number.isFinite(e)||e<0)){if(e>this.maxSeconds){this.stopped=!0;return}if(!(e<this.nextSampleTime)&&!(e<=this.lastTime)&&Ew(t)){if(this.samples.length>=this.maxSamples){this.stopped=!0;return}this.samples.push({t:e,x:t.x,y:t.y,z:t.z,groundY:t.groundY,headingY:t.headingY,rollAngle:t.rollAngle,speed:t.speed,crouch:t.crouch}),this.lastTime=e,this.nextSampleTime=(Math.round(e/this.interval)+1)*this.interval}}}get sampleCount(){return this.samples.length}get truncated(){return this.stopped}finish(e,t){if(this.stopped||this.samples.length===0||typeof e!="string"||e.length===0||!Number.isFinite(t)||t<0)return null;const n=this.samples;this.samples=[];const s=n[n.length-1],r=Math.max(t,s.t);return r>s.t&&n.push({t:r,x:s.x,y:s.y,z:s.z,groundY:s.groundY,headingY:s.headingY,rollAngle:s.rollAngle,speed:s.speed,crouch:s.crouch}),Object.freeze({levelId:e,totalSeconds:r,samples:Object.freeze(n)})}}const Aw=Object.freeze([]);class ld{samples;total;constructor(e){this.samples=e===null?Aw:e.samples,this.total=e===null?0:e.totalSeconds}get totalSeconds(){return this.total}get hasTrack(){return this.samples.length>0}sample(e,t){const n=this.samples,s=n.length;if(s===0||!Number.isFinite(e))return!1;const r=n[0],a=n[s-1];if(e<r.t||e>a.t)return!1;if(s===1)return Cw(r,t),!0;let o=0,l=s-1;for(;l-o>1;){const f=o+l>>1;n[f].t<=e?o=f:l=f}const c=n[o],u=n[l],d=u.t-c.t,h=d>0?(e-c.t)/d:0;return t.t=e,t.x=c.x+(u.x-c.x)*h,t.y=c.y+(u.y-c.y)*h,t.z=c.z+(u.z-c.z)*h,t.groundY=c.groundY+(u.groundY-c.groundY)*h,t.headingY=c.headingY+(u.headingY-c.headingY)*h,t.rollAngle=c.rollAngle+(u.rollAngle-c.rollAngle)*h,t.speed=c.speed+(u.speed-c.speed)*h,t.crouch=c.crouch+(u.crouch-c.crouch)*h,!0}}function Rw(){return{t:0,x:0,y:0,z:0,groundY:0,headingY:0,rollAngle:0,speed:0,crouch:0}}function Cw(i,e){e.t=i.t,e.x=i.x,e.y=i.y,e.z=i.z,e.groundY=i.groundY,e.headingY=i.headingY,e.rollAngle=i.rollAngle,e.speed=i.speed,e.crouch=i.crouch}function Pw(i,e,t){if(!Number.isFinite(i))return t;const n=Math.round(i/e);return n>Vi?Vi:n<-Vi?-Vi:n}function Lw(i){const e=i.samples,t=e.length,n=new Array(t*mi),s=new Float64Array(mi),r=new Float64Array(mi);for(let a=0,o=0;a<t;a+=1,o+=mi){const l=e[a];r[Nf]=l.t,r[kf]=l.x,r[Of]=l.y,r[zf]=l.z,r[Bf]=l.groundY,r[Hf]=l.headingY,r[Gf]=l.rollAngle,r[Vf]=l.speed,r[Wf]=l.crouch;for(let c=0;c<mi;c+=1){const u=s[c],d=Pw(r[c],Mw[c],u);n[o+c]=d-u,s[c]=d}}return Object.freeze({v:1,level:i.levelId,hz:Dw(e),total:Iw(Math.max(0,i.totalSeconds),3),n:t,data:n})}function Dw(i){const e=i.length;if(e<2)return qe.ghostSampleHz;const t=i[e-1].t-i[0].t;if(!(t>0))return qe.ghostSampleHz;const n=(e-1)/t;return!Number.isFinite(n)||n<=0?qe.ghostSampleHz:Math.min(no,Math.ceil(n*100)/100)}function Iw(i,e){const t=10**e;return Math.round(i*t)/t}function Yf(i){if(typeof i!="object"||i===null||Array.isArray(i))return null;const e=i;if(e.v!==1)return null;const t=e.level;if(typeof t!="string"||t.length===0||t.length>ww)return null;const n=e.hz;if(typeof n!="number"||!Number.isFinite(n)||n<=0||n>no)return null;const s=e.total;if(typeof s!="number"||!Number.isFinite(s)||s<0||s>fc)return null;const r=e.n;if(typeof r!="number"||!Number.isInteger(r)||r<1||r>yw)return null;const a=e.data;if(!Array.isArray(a)||a.length!==r*mi||r>Math.ceil(s*n)+2)return null;const o=new Array(r),l=new Float64Array(mi);let c=-1/0;for(let u=0,d=0;u<r;u+=1,d+=mi){for(let f=0;f<mi;f+=1){const v=a[d+f];if(typeof v!="number"||!Number.isInteger(v)||v<-Vi||v>Vi)return null;const _=l[f]+v;if(_<-Vi||_>Vi)return null;l[f]=_}const h=l[Nf]*Xf;if(!(h>c)||h<0||h>fc)return null;c=h,o[u]={t:h,x:l[kf]*qe.ghostPositionStep,y:l[Of]*qe.ghostPositionStep,z:l[zf]*qe.ghostPositionStep,groundY:l[Bf]*qe.ghostPositionStep,headingY:l[Hf]*qe.ghostAngleStep,rollAngle:l[Gf]*qe.ghostAngleStep,speed:l[Vf]*qe.ghostPositionStep,crouch:l[Wf]*qe.ghostPositionStep}}return Object.freeze({levelId:t,totalSeconds:Math.max(s,c),samples:Object.freeze(o)})}const Us="records";function io(){return Object.create(null)}const cd=Object.freeze({routes:Object.freeze(io())}),ba=Object.freeze([]),qf=64,Fw=64,Uw=40,Nw=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;function kw(i,e){return!Number.isFinite(i)||i<=0?!1:e===null||!Number.isFinite(e)?!0:i<e-qe.recordEpsilonSeconds}function Ow(i){const e=typeof i=="object"&&i!==null?i:{},t=typeof e.routes=="object"&&e.routes!==null?e.routes:{},n=io();for(const[s,r]of Object.entries(t)){if(s.length===0||s.length>qf)continue;const a=$f(s,r);a!==null&&(n[s]=a)}return Object.freeze({routes:Object.freeze(n)})}function $f(i,e){if(typeof e!="object"||e===null)return null;const t=e,n=t.totalSeconds;return typeof n!="number"||!Number.isFinite(n)||n<=0?null:Object.freeze({levelId:i,totalSeconds:n,splits:zw(t.splits,n),setAt:typeof t.setAt=="string"&&t.setAt.length<=Uw&&Nw.test(t.setAt)?t.setAt:"",ghost:Bw(t.ghost,i)})}function zw(i,e){if(!Array.isArray(i)||i.length===0||i.length>Fw||i[0]!==0||i[i.length-1]!==e)return ba;const t=[];let n=0;for(const s of i){if(typeof s!="number"||!Number.isFinite(s)||s<n||s>e)return ba;t.push(s),n=s}return Object.freeze(t)}function Bw(i,e){if(typeof i!="object"||i===null)return null;const t=i;if(t.v!==1||t.level!==e)return null;const n=t.hz,s=t.total,r=t.n;if(typeof n!="number"||!Number.isFinite(n)||n<=0||typeof s!="number"||!Number.isFinite(s)||s<=0||typeof r!="number"||!Number.isInteger(r)||r<0||!Array.isArray(t.data))return null;const a=[];for(const o of t.data){if(typeof o!="number"||!Number.isFinite(o))return null;a.push(o)}return Yf(t)===null?null:Object.freeze({v:1,level:e,hz:n,total:s,n:r,data:Object.freeze(a)})}function hd(i,e,t){const n=io();for(const[s,r]of Object.entries(i.routes))n[s]=r;return n[e]=t,Object.freeze({routes:Object.freeze(n)})}function ud(i){return Object.keys(i.routes).length}class Hw{storage;listeners=new Set;records;lastWriteHeld=!0;constructor(e){this.storage=e,this.records=this.storage.readJson(Us,Ow)??cd}get current(){return this.records}get persistent(){return this.storage.persistent&&this.lastWriteHeld}best(e){return this.records.routes[e]??null}submit(e){const t=e.levelId;if(typeof t!="string"||t.length===0||t.length>qf)return!1;const n=this.best(t);if(!kw(e.totalSeconds,n===null?null:n.totalSeconds))return!1;const s=$f(t,e);return s===null?!1:(this.records=hd(this.records,t,s),this.persist(t,s),this.announce(),!0)}clearLevel(e){if(this.best(e)===null)return;const t=io();for(const[n,s]of Object.entries(this.records.routes))n!==e&&(t[n]=s);this.records=Object.freeze({routes:Object.freeze(t)}),ud(this.records)===0?this.storage.remove(Us):this.storage.writeJson(Us,this.records),this.announce()}clearAll(){ud(this.records)!==0&&(this.records=cd,this.storage.remove(Us),this.announce())}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear()}persist(e,t){if(this.storage.writeJson(Us,this.records)){this.lastWriteHeld=!0;return}if(t.ghost===null){this.lastWriteHeld=!1;return}const n=Object.freeze({...t,ghost:null}),s=hd(this.records,e,n);this.storage.writeJson(Us,s)?(this.records=s,this.lastWriteHeld=!0):this.lastWriteHeld=!1}announce(){for(const e of this.listeners)e(this.records)}}const Gw=["freeRide","challenge"];function dd(i){return Gw.includes(i)}const _a=Object.freeze({boot:Object.freeze({id:"boot",simulates:!1,acceptsRideInput:!1,showsHud:!1,showsMenu:!1,resetsInput:!1,successors:Object.freeze(["loading"])}),loading:Object.freeze({id:"loading",simulates:!1,acceptsRideInput:!1,showsHud:!1,showsMenu:!1,resetsInput:!1,successors:Object.freeze(["title"])}),title:Object.freeze({id:"title",simulates:!0,acceptsRideInput:!1,showsHud:!1,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["freeRide","challenge","settings"])}),settings:Object.freeze({id:"settings",simulates:!0,acceptsRideInput:!1,showsHud:!1,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["title","paused"])}),freeRide:Object.freeze({id:"freeRide",simulates:!0,acceptsRideInput:!0,showsHud:!0,showsMenu:!1,resetsInput:!0,successors:Object.freeze(["paused","title"])}),challenge:Object.freeze({id:"challenge",simulates:!0,acceptsRideInput:!0,showsHud:!0,showsMenu:!1,resetsInput:!0,successors:Object.freeze(["paused","results","title"])}),paused:Object.freeze({id:"paused",simulates:!1,acceptsRideInput:!1,showsHud:!0,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["freeRide","challenge","settings","title"])}),results:Object.freeze({id:"results",simulates:!0,acceptsRideInput:!1,showsHud:!1,showsMenu:!0,resetsInput:!0,successors:Object.freeze(["challenge","title"])})});class Vw{state;settingsOrigin="title";rideOrigin="freeRide";listeners=new Set;constructor(e="boot"){this.state=e}get current(){return this.state}get spec(){return _a[this.state]}get settingsReturn(){return this.settingsOrigin}get rideReturn(){return this.rideOrigin}get riding(){return dd(this.state)}get simulates(){return this.spec.simulates}get acceptsRideInput(){return this.spec.acceptsRideInput}get showsMenu(){return this.spec.showsMenu}get showsHud(){return this.spec.showsHud}canGoTo(e){return _a[this.state].successors.includes(e)}goTo(e){if(e===this.state||!this.canGoTo(e))return!1;const t=_a[this.state];e==="settings"&&(this.settingsOrigin=this.state),dd(this.state)&&(this.rideOrigin=this.state),this.state=e;const n=_a[e];for(const s of this.listeners)s(n,t);return!0}exitSettings(){return this.state!=="settings"?!1:this.goTo(this.settingsOrigin)}resumeRide(){return this.state!=="paused"?!1:this.goTo(this.rideOrigin)}onChange(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}dispose(){this.listeners.clear()}}const ul=Object.freeze([]);function fd(i,e,t,n){if(Math.abs(t-i.centre.y)>i.halfExtents.y)return!1;const s=e-i.centre.x,r=n-i.centre.z,a=Math.cos(i.headingY),o=Math.sin(i.headingY),l=a*s-o*r;if(Math.abs(l)>i.halfExtents.x)return!1;const c=o*s+a*r;return Math.abs(c)<=i.halfExtents.z}class Ww{levelId;checkpoints;available_;reference=null;referenceAligned=!1;phase_="idle";elapsed=0;next=0;splits=[];legs=[];lastSplit=0;deltaToRecord=null;lastX=0;lastY=0;lastZ=0;positioned=!1;topSpeed=0;landings=0;cleanLandings=0;crashes=0;wasCrashed=!1;finished=null;constructor(e,t){this.levelId=e,this.checkpoints=Object.freeze([...t].sort((s,r)=>s.routeIndex-r.routeIndex));const n=this.checkpoints.length;this.available_=n>=2&&this.checkpoints[0].kind==="start"&&this.checkpoints[n-1].kind==="finish"}get available(){return this.available_}get state(){const t=this.phase_==="armed"||this.phase_==="running"?this.checkpoints[this.next]:void 0;return{phase:this.phase_,elapsed:this.elapsed,nextIndex:t?t.routeIndex:-1,nextLabel:t?t.label:"",passed:this.splits.length,total:this.checkpoints.length,splits:this.splits,legs:this.legs,deltaToRecord:this.deltaToRecord,distanceToNext:t&&this.positioned?Math.hypot(this.lastX-t.centre.x,this.lastY-t.centre.y,this.lastZ-t.centre.z):1/0}}setReference(e){if(e===null||!Number.isFinite(e.totalSeconds)){this.reference=null,this.referenceAligned=!1,this.deltaToRecord=null;return}this.reference=e;const t=e.splits;this.referenceAligned=t.length===this.checkpoints.length&&t.every(n=>Number.isFinite(n))&&t.every((n,s)=>s===0||n>=t[s-1])&&t[0]===0&&t[t.length-1]===e.totalSeconds,this.referenceAligned||(this.deltaToRecord=null)}arm(){this.available_&&(this.clear(),this.phase_="armed")}abandon(){this.clear(),this.phase_="idle"}restart(){this.phase_!=="idle"&&(this.clear(),this.phase_="armed")}step(e,t){if(this.lastX=t.x,this.lastY=t.y,this.lastZ=t.z,this.positioned=!0,this.phase_==="armed"){const a=this.checkpoints[this.next];return fd(a,t.x,t.y,t.z)?(this.phase_="running",this.elapsed=0,this.wasCrashed=t.crashed,[this.cross(a,0)]):ul}if(this.phase_!=="running")return ul;this.elapsed+=e;const n=Math.abs(t.speed);n>this.topSpeed&&(this.topSpeed=n),t.landed&&(this.landings+=1,t.landingClean&&(this.cleanLandings+=1)),t.crashed&&!this.wasCrashed&&(this.crashes+=1),this.wasCrashed=t.crashed;const s=this.checkpoints[this.next];if(!fd(s,t.x,t.y,t.z))return ul;const r=this.cross(s,this.elapsed);return s.kind==="finish"&&this.finish(),[r]}result(){return this.finished}cross(e,t){const n=this.next,s=n===0?0:t-this.lastSplit;this.splits.push(t),this.legs.push(s),this.lastSplit=t,this.next+=1;let r=null,a=null;if(n>0&&this.reference!==null&&this.referenceAligned){const o=this.reference.splits;a=t-o[n],r=s-(o[n]-o[n-1]),this.deltaToRecord=a}return{kind:e.kind,checkpointId:e.id,routeIndex:e.routeIndex,label:e.label,elapsed:t,legSeconds:s,legDelta:r,totalDelta:a}}finish(){this.phase_="finished";const e=this.reference!==null?this.reference.totalSeconds:null;this.finished=Object.freeze({levelId:this.levelId,totalSeconds:this.elapsed,splits:Object.freeze([...this.splits]),legs:Object.freeze([...this.legs]),labels:Object.freeze(this.checkpoints.map(t=>t.label)),topSpeed:this.topSpeed,landings:this.landings,cleanLandings:this.cleanLandings,crashes:this.crashes,beatRecord:e===null||this.elapsed<e-qe.recordEpsilonSeconds,previousBest:e})}clear(){this.elapsed=0,this.next=0,this.splits.length=0,this.legs.length=0,this.lastSplit=0,this.deltaToRecord=null,this.topSpeed=0,this.landings=0,this.cleanLandings=0,this.crashes=0,this.wasCrashed=!1,this.finished=null}}const Xw=`
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
`,Yw=Object.freeze({kph:"km/h",mph:"mph"});class qw{root;nodes={};options;lastSpeed="";lastUnit="";lastReverse=!1;lastObjective="";lastWarningLabel="";lastWarningLevel="";lastOffRoute=!1;lastPrompt="";lastChallengeVisible=!1;lastRunTime="";lastSplitLabel="";lastSplitDelta="";lastSplitAhead="";constructor(e={}){this.options=e;const t=document.createElement("div");t.className="euc-hud euc-ui",t.hidden=!0,t.innerHTML=Xw;for(const n of t.querySelectorAll("[data-hud]")){const s=n.dataset.hud;s!==void 0&&(this.nodes[s]=n)}this.nodes["prompt-dismiss"]?.addEventListener("click",this.onDismiss),(e.parent??document.body).appendChild(t),this.root=t}get visible(){return!this.root.hidden}setTouchLayout(e){const t=e?"true":"false";this.root.dataset.touch!==t&&(this.root.dataset.touch=t)}setVisible(e){this.root.hidden=!e}update(e,t){e.speed!==this.lastSpeed&&(this.nodes.speed.textContent=e.speed,this.lastSpeed=e.speed);const n=Yw[e.speedUnit];n!==this.lastUnit&&(this.nodes.unit.textContent=n,this.lastUnit=n),e.reversing!==this.lastReverse&&(this.nodes.reverse.hidden=!e.reversing,this.lastReverse=e.reversing),e.objective!==this.lastObjective&&(this.nodes.objective.textContent=e.objective,this.lastObjective=e.objective),e.warningLabel!==this.lastWarningLabel&&(this.nodes.warning.textContent=e.warningLabel,this.nodes.warning.hidden=e.warningLabel==="",this.lastWarningLabel=e.warningLabel),e.warning!==this.lastWarningLevel&&(this.nodes.warning.dataset.level=e.warning,this.lastWarningLevel=e.warning),e.offRoute!==this.lastOffRoute&&(this.nodes["off-route"].hidden=!e.offRoute,this.lastOffRoute=e.offRoute),t!==this.lastPrompt&&(this.nodes["prompt-text"].textContent=t,this.nodes.prompt.hidden=t==="",this.lastPrompt=t),this.writeChallenge(e.challenge)}writeChallenge(e){if(e.visible!==this.lastChallengeVisible&&(this.nodes.challenge.hidden=!e.visible,this.lastChallengeVisible=e.visible),!e.visible)return;e.time!==this.lastRunTime&&(this.nodes.timer.textContent=e.time,this.lastRunTime=e.time),e.splitLabel!==this.lastSplitLabel&&(this.nodes["split-label"].textContent=e.splitLabel,this.nodes.splits.hidden=e.splitLabel==="",this.lastSplitLabel=e.splitLabel),e.splitDelta!==this.lastSplitDelta&&(this.nodes["split-delta"].textContent=e.splitDelta,this.lastSplitDelta=e.splitDelta);const t=e.ahead?"true":"false";t!==this.lastSplitAhead&&(this.nodes.splits.dataset.ahead=t,this.lastSplitAhead=t)}dispose(){this.nodes["prompt-dismiss"]?.removeEventListener("click",this.onDismiss),this.root.remove()}onDismiss=()=>{this.options.onDismissPrompt?.()}}const $w=.7,Zw=1.1,Kw=.5,Jw=3.6,Qw=2.236936,jw="Ride to the start line";function e1(i){if(!Number.isFinite(i)||i<0)return"";const e=i>=100?10:5;return`${Math.round(i/e)*e} m`}function t1(i){if(!Number.isFinite(i))return"";let e=i;for(;e>Math.PI;)e-=Math.PI*2;for(;e<=-Math.PI;)e+=Math.PI*2;const t=Math.round(e/(Math.PI/4));return t===0?"↑":t===1?"↖":t===2?"←":t===3?"↙":Math.abs(t)===4?"↓":t===-3?"↘":t===-2?"→":"↗"}const n1=Object.freeze({visible:!1,time:"0:00.00",splitLabel:"",splitDelta:"",ahead:!1});function Os(i){const e=Number.isFinite(i)&&i>0?i:0,t=Math.round(e*100),n=Math.floor(t/6e3),s=Math.floor(t/100)%60,r=t%100;return`${n}:${pd(s)}.${pd(r)}`}function pd(i){return i<10?`0${i}`:String(i)}function pc(i){if(!Number.isFinite(i))return"";const e=Math.round(i*100),t=(Math.abs(e)/100).toFixed(2);return e===0?t:e<0?`−${t}`:`+${t}`}const i1=Object.freeze({none:"",notice:"Working hard",warn:"Ease off",tiltBack:"Tilt-back — slow down"});function mc(i,e){const t=Math.abs(i)*(e==="mph"?Qw:Jw),n=Math.round(t);return n===0?"0":String(n)}function s1(i){return i==="tiltBack"?"tiltBack":i==="warn"?"warn":i==="notice"?"notice":"none"}class r1{speedUnit;objective;warning="none";warningSince=Number.NEGATIVE_INFINITY;offRoute=!1;offRouteSince=Number.NEGATIVE_INFINITY;onRouteSince=Number.NEGATIVE_INFINITY;splitLabel="";splitDelta=null;splitSince=Number.NEGATIVE_INFINITY;constructor(e={}){this.speedUnit=e.speedUnit??"kph",this.objective=e.objective??""}setSpeedUnit(e){this.speedUnit=e}setObjective(e){this.objective=e}reset(){this.resetCues(),this.splitLabel="",this.splitDelta=null,this.splitSince=Number.NEGATIVE_INFINITY}resetCues(){this.warning="none",this.warningSince=Number.NEGATIVE_INFINITY,this.offRoute=!1,this.offRouteSince=Number.NEGATIVE_INFINITY,this.onRouteSince=Number.NEGATIVE_INFINITY}update(e,t){if(t.crashed)return this.resetCues(),this.onRouteSince=e,{speed:mc(t.speed,this.speedUnit),speedUnit:this.speedUnit,reversing:!1,objective:this.objectiveFor(t.challenge),warning:"none",warningLabel:"",offRoute:!1,challenge:this.challengeView(e,t.challenge)};const n=s1(t.powerStage);md(n)>md(this.warning)?(this.warning=n,this.warningSince=e):n===this.warning?this.warningSince=e:e-this.warningSince>=$w&&(this.warning=n,this.warningSince=e),t.offCourse&&!this.offRoute?e-this.onRouteSince>=Kw&&(this.offRoute=!0,this.offRouteSince=e):!t.offCourse&&this.offRoute?e-this.offRouteSince>=Zw&&(this.offRoute=!1,this.onRouteSince=e):t.offCourse?this.offRouteSince=e:this.onRouteSince=e;const s=t.tiltBack>.02?"tiltBack":this.warning;return{speed:mc(t.speed,this.speedUnit),speedUnit:this.speedUnit,reversing:t.speed<-.1,objective:this.objectiveFor(t.challenge),warning:s,warningLabel:i1[s],offRoute:this.offRoute,challenge:this.challengeView(e,t.challenge)}}objectiveFor(e){if(e===void 0||e.phase==="idle")return this.objective;const t=e1(e.distanceMetres),n=t1(e.directionRadians),s=n===""?"":`${n} `,r=t===""?"":` · ${t}`;if(e.phase==="armed")return`${s}${jw}${r}`;if(e.phase==="running"){const a=Math.max(0,e.total-1),o=a>0&&e.passed>0?` · ${Math.min(e.passed,a)}/${a}`:"";return`${s}${e.nextLabel}${o}${r}`}return""}challengeView(e,t){if(t===void 0||t.phase==="idle")return this.splitLabel="",this.splitDelta=null,this.splitSince=Number.NEGATIVE_INFINITY,n1;if(t.phase==="armed"&&t.split===null&&(this.splitLabel="",this.splitDelta=null,this.splitSince=Number.NEGATIVE_INFINITY),t.split!==null&&(this.splitLabel=t.split.label,this.splitDelta=t.split.delta,this.splitSince=e),!(this.splitLabel!==""&&e-this.splitSince<qe.splitHoldSeconds))return{visible:!0,time:Os(t.elapsed),splitLabel:"",splitDelta:"",ahead:!1};const s=this.splitDelta;return{visible:!0,time:Os(t.elapsed),splitLabel:this.splitLabel,splitDelta:s===null?"Best":pc(s),ahead:s===null||Math.round(s*100)<0}}}function md(i){return i==="tiltBack"?3:i==="warn"?2:i==="notice"?1:0}const a1=Object.freeze({auto:"Automatic",on:"Always show",off:"Never show"}),o1=`
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-title-heading">
  <h1 class="euc-menu__title" id="euc-title-heading">EUC&nbsp;<span class="accent">THRILLS</span></h1>
  <p class="euc-menu__tagline">One wheel. Total freedom. Ride anywhere.</p>
  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="start">Start ride</button>
    <button type="button" class="euc-button" data-menu="challenge">Time trial</button>
    <button type="button" class="euc-button" data-menu="settings">Settings</button>
  </div>
  <p class="euc-controls-note">Riding as <strong>Cool Rider</strong>.</p>
</div>
`,l1=`
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
`,c1=`
<div class="euc-menu__panel" role="dialog" aria-modal="true" aria-labelledby="euc-pause-heading">
  <h2 class="euc-menu__title" id="euc-pause-heading">Paused</h2>
  <div class="euc-menu__actions">
    <button type="button" class="euc-button euc-button--primary" data-menu="resume">Resume</button>
    <button type="button" class="euc-button" data-menu="settings">Settings</button>
    <button type="button" class="euc-button euc-button--quiet" data-menu="quit">Quit to title</button>
  </div>
  <p class="euc-controls-note">Escape resumes.</p>
</div>
`;class h1{callbacks;parent;title;pause;settings;results;screen="none";returnFocus=null;listening=null;options;constructor(e,t){this.callbacks=t.callbacks,this.parent=t.parent??document.body,this.options=e,this.title=this.mount("euc-menu--title",o1),this.pause=this.mount("euc-menu--pause",c1),this.settings=this.mount("euc-menu--settings",this.settingsTemplate()),this.results=this.mount("euc-menu--results",l1),this.parent.addEventListener("click",this.onClick),this.settings.addEventListener("input",this.onInput),window.addEventListener("keydown",this.onKeyDown,!0),this.sync(e)}get current(){return this.screen}show(e){if(e===this.screen)return;if(this.screen==="none"&&e!=="none"){const n=document.activeElement;this.returnFocus=n instanceof HTMLElement?n:null}if(this.stopListening(),this.title.hidden=e!=="title",this.pause.hidden=e!=="pause",this.settings.hidden=e!=="settings",this.results.hidden=e!=="results",this.screen=e,e==="none"){this.returnFocus?.focus(),this.returnFocus=null;return}this.focusFirst(this.panelFor(e))}sync(e){this.options=e,this.setValue("fieldOfViewTrim",e.fieldOfViewTrim),this.setText("fieldOfViewTrim-value",`${e.fieldOfViewTrim>0?"+":""}${e.fieldOfViewTrim}°`),this.setSelect("quality",e.quality),this.setSelect("speedUnit",e.speedUnit),this.setValue("volumeMaster",Math.round(e.volumeMaster*100)),this.setText("volumeMaster-value",`${Math.round(e.volumeMaster*100)}%`),this.setValue("volumeSfx",Math.round(e.volumeSfx*100)),this.setText("volumeSfx-value",`${Math.round(e.volumeSfx*100)}%`),this.setValue("volumeUi",Math.round(e.volumeUi*100)),this.setText("volumeUi-value",`${Math.round(e.volumeUi*100)}%`),this.setChecked("muted",e.muted),this.setChecked("gamepadEnabled",e.gamepadEnabled),this.setValue("gamepadDeadZone",Math.round(e.gamepadDeadZone*100)),this.setText("gamepadDeadZone-value",`${Math.round(e.gamepadDeadZone*100)}%`),this.setSelect("touchControls",e.touchControls),this.setChecked("touchSwapSides",e.touchSwapSides),this.setValue("touchScale",Math.round(e.touchScale*100)),this.setText("touchScale-value",`${Math.round(e.touchScale*100)}%`),this.renderBindings()}setPersistenceWarning(e){const t=this.settings.querySelector('[data-menu="persistence"]');t&&(t.hidden=e)}setResults(e){const t=this.results.querySelector('[data-menu="results-panel"]');t&&(t.dataset.record=e.isRecord?"true":"false"),this.setResultsText("results-heading",e.heading),this.setResultsText("results-total",e.total),this.setResultsText("results-best",e.best),this.setResultsText("results-delta",e.deltaToBest);const n=this.results.querySelector('[data-menu="results-delta"]');n&&(n.dataset.ahead=e.ahead?"true":"false");const s=this.results.querySelector('[data-menu="results-rows"]');if(s){s.textContent="";for(const a of e.rows){const o=document.createElement("tr"),l=document.createElement("th");l.scope="row",l.className="euc-results__row-label",l.textContent=a.label,o.appendChild(l);const c=document.createElement("td");c.className="euc-results__row-time",c.textContent=a.time,o.appendChild(c);const u=document.createElement("td");u.className="euc-results__row-delta",u.dataset.ahead=a.ahead?"true":"false",u.textContent=a.delta,o.appendChild(u),s.appendChild(o)}}const r=this.results.querySelector('[data-menu="results-notes"]');if(r){r.textContent="";for(const a of e.notes){const o=document.createElement("li");o.textContent=a,r.appendChild(o)}r.hidden=e.notes.length===0}}setChallengeAvailable(e){const t=this.title.querySelector('[data-menu="challenge"]');t&&(t.hidden=!e)}setGamepadStatus(e){const t=this.settings.querySelector('[data-menu="gamepad-status"]');t&&(t.textContent=e==="connected"?"Gamepad connected. The keyboard keeps working at the same time.":e==="disabled"?"Gamepad input is switched off. Tick the box to use a pad.":"No gamepad detected. Connect one and press a button to wake it.")}setTouchStatus(e){const t=this.settings.querySelector('[data-menu="touch-status"]');t&&(t.textContent=e==="shown"?"On-screen controls are showing. A keyboard or pad keeps working alongside them.":e==="forced"?"On-screen controls are always shown, on every device.":e==="disabled"?"On-screen controls are switched off. This device needs a keyboard or a pad.":"Automatic: the controls appear on a touchscreen, or the first time you touch this screen.")}dispose(){this.parent.removeEventListener("click",this.onClick),this.settings.removeEventListener("input",this.onInput),window.removeEventListener("keydown",this.onKeyDown,!0),this.title.remove(),this.pause.remove(),this.settings.remove(),this.results.remove()}mount(e,t){const n=document.createElement("div");return n.className=`euc-menu euc-ui ${e}`,n.hidden=!0,n.innerHTML=t,this.parent.appendChild(n),n}panelFor(e){return e==="title"?this.title:e==="pause"?this.pause:e==="settings"?this.settings:e==="results"?this.results:null}focusFirst(e){e?.querySelector(dl())?.focus()}onClick=e=>{const t=e.target;if(!(t instanceof HTMLElement))return;const n=t.closest("[data-binding-set]");if(n){this.startListening(n.dataset.bindingSet);return}const s=t.closest("[data-binding-clear]");if(s){this.assign(s.dataset.bindingClear,[]);return}const r=t.closest("[data-menu]")?.dataset.menu;r!==void 0&&(r==="start"?this.callbacks.onStartRide():r==="challenge"?this.callbacks.onStartChallenge():r==="resume"?this.callbacks.onResume():r==="settings"?this.callbacks.onOpenSettings():r==="back"?this.callbacks.onCloseSettings():r==="quit"?this.callbacks.onQuitToTitle():r==="reset"?this.callbacks.onResetOptions():r==="retry"?this.callbacks.onRetryChallenge():r==="results-title"&&this.callbacks.onResultsToTitle())};onInput=e=>{const t=e.target;if(!(t instanceof HTMLInputElement)&&!(t instanceof HTMLSelectElement))return;const n=t.dataset.option;if(n===void 0)return;if(t instanceof HTMLInputElement&&t.type==="checkbox"){this.callbacks.onChange({[n]:t.checked});return}if(n==="quality"||n==="speedUnit"||n==="touchControls"){this.callbacks.onChange({[n]:t.value});return}const s=Number(t.value),r=n==="gamepadDeadZone"||n==="touchScale"||n.startsWith("volume");this.callbacks.onChange({[n]:r?s/100:s})};onKeyDown=e=>{if(this.listening!==null){e.preventDefault(),e.stopPropagation(),e.code==="Escape"?this.stopListening():Ef.has(e.code)?this.stopListening():this.assign(this.listening,[e.code]);return}if(this.screen!=="none"){if(e.code==="Escape"){if(this.screen==="settings")this.callbacks.onCloseSettings();else if(this.screen==="pause")this.callbacks.onResume();else return;e.preventDefault(),e.stopImmediatePropagation();return}e.code==="Tab"&&this.trapFocus(e)}};trapFocus(e){const t=this.panelFor(this.screen);if(!t)return;const n=[...t.querySelectorAll(dl())].filter(o=>o.offsetParent!==null||o===document.activeElement);if(n.length===0)return;const s=n[0],r=n[n.length-1],a=document.activeElement;e.shiftKey&&a===s?(e.preventDefault(),r.focus()):!e.shiftKey&&a===r&&(e.preventDefault(),s.focus())}navigate(e){const t=this.panelFor(this.screen);if(!t)return;const n=[...t.querySelectorAll(dl())].filter(l=>l.offsetParent!==null);if(n.length===0)return;const s=document.activeElement;if((e==="left"||e==="right")&&s instanceof HTMLElement&&this.adjustControl(s,e==="right"?1:-1))return;const r=n.indexOf(s),a=e==="up"||e==="left"?-1:1,o=r<0?a>0?0:n.length-1:(r+a+n.length)%n.length;n[o].focus(),n[o].scrollIntoView({block:"nearest"})}adjustControl(e,t){if(e instanceof HTMLInputElement&&e.type==="range")return t>0?e.stepUp():e.stepDown(),e.dispatchEvent(new Event("input",{bubbles:!0})),!0;if(e instanceof HTMLInputElement&&e.type==="checkbox")return e.checked=t>0,e.dispatchEvent(new Event("input",{bubbles:!0})),!0;if(e instanceof HTMLSelectElement){const n=Math.max(0,Math.min(e.options.length-1,e.selectedIndex+t));return n!==e.selectedIndex&&(e.selectedIndex=n,e.dispatchEvent(new Event("input",{bubbles:!0}))),!0}return!1}startListening(e){this.stopListening(),this.listening=e;const t=this.settings.querySelector(`[data-binding-row="${e}"]`);t&&(t.dataset.listening="true");const n=this.settings.querySelector(`[data-binding-set="${e}"]`);n&&(n.textContent="Press a key")}stopListening(){if(this.listening===null)return;const e=this.listening;this.listening=null;const t=this.settings.querySelector(`[data-binding-row="${e}"]`);t&&(t.dataset.listening="false");const n=this.settings.querySelector(`[data-binding-set="${e}"]`);n&&(n.textContent="Change")}assign(e,t){const n={...this.options.bindings};n[e]=t;for(const s of Ua){if(s.action===e)continue;const r=this.options.bindings[s.action]??s.defaults,a=r.filter(o=>!t.includes(o));a.length!==r.length&&(n[s.action]=a)}this.stopListening(),this.callbacks.onChange({bindings:n})}renderBindings(){for(const e of Ua){const t=this.settings.querySelector(`[data-binding-keys="${e.action}"]`);if(!t)continue;const n=this.options.bindings[e.action]??e.defaults;if(t.textContent="",n.length===0){const s=document.createElement("span");s.className="euc-key euc-key--empty",s.textContent="Unbound",t.appendChild(s);continue}for(const s of n){const r=document.createElement("span");r.className="euc-key",r.textContent=my(s),t.appendChild(r)}}}input(e){return this.settings.querySelector(`[data-option="${e}"]`)}setValue(e,t){const n=this.input(e);n&&n.value!==String(t)&&(n.value=String(t))}setChecked(e,t){const n=this.input(e);n&&n.checked!==t&&(n.checked=t)}setSelect(e,t){const n=this.settings.querySelector(`[data-option="${e}"]`);n&&n.value!==t&&(n.value=t)}setText(e,t){const n=this.settings.querySelector(`[data-readout="${e}"]`);n&&n.textContent!==t&&(n.textContent=t)}setResultsText(e,t){const n=this.results.querySelector(`[data-menu="${e}"]`);n&&n.textContent!==t&&(n.textContent=t)}settingsTemplate(){const e=Af.map(r=>`<option value="${r}">${r[0].toUpperCase()}${r.slice(1)}</option>`).join(""),t=Rf.map(r=>`<option value="${r}">${r==="kph"?"km/h":"mph"}</option>`).join(""),n=Cf.map(r=>`<option value="${r}">${a1[r]}</option>`).join(""),s=Ua.map(r=>`
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
        <input id="euc-opt-fov" type="range" min="${If}" max="${Ff}" step="1"
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
        <input id="euc-opt-touch-size" type="range" min="${Math.round(Pf*100)}"
               max="${Math.round(Lf*100)}" step="5" data-option="touchScale" />
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
`}}function dl(){return'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'}const gd=["ride","brake","hop"],u1=.9,d1=.45,f1=.3,fl=.5,p1=1.5,m1=.8,vd=1.6,g1=25,v1=Object.freeze({ride:Object.freeze({keyboard:"Hold W to ride — A and D to carve",gamepad:"Right trigger to ride — left stick to carve",touch:"Push the stick up to ride — sideways to carve"}),brake:Object.freeze({keyboard:"Hold S to brake",gamepad:"Left trigger to brake",touch:"Pull the stick down to brake"}),hop:Object.freeze({keyboard:"Space to hop a kerb",gamepad:"A to hop a kerb",touch:"Tap HOP to jump — hold CHARGE first for a bigger one"})});class b1{seen;active=null;shownAt=0;eligibleAt=Number.NEGATIVE_INFINITY;started=!1;seenChanged=!1;stopped=!1;accelerateHeld=0;carveHeld=0;brakeHeld=0;hopSeen=!1;constructor(e=[]){this.seen=new Set(e)}get finished(){return gd.every(e=>this.seen.has(e))}restart(e=[]){this.seen.clear();for(const t of e)this.seen.add(t);this.active=null,this.stopped=!1,this.started=!1,this.seenChanged=!1,this.accelerateHeld=0,this.carveHeld=0,this.brakeHeld=0,this.hopSeen=!1}get current(){return this.active}dismiss(){const e=this.active;return e===null?null:(this.seen.add(e),this.seenChanged=!0,this.active=null,this.stopped=!0,e)}takeSeenChanged(){const e=this.seenChanged;return this.seenChanged=!1,e}update(e,t,n){if(!n.riding||this.finished||this.stopped)return this.active=null,this.eligibleAt=e+(this.started?vd:0),{prompt:null,text:"",completed:null};if(this.started||(this.started=!0,this.eligibleAt=e+m1),n.crashed)return{prompt:null,text:"",completed:null};this.record(t,n);let s=null;this.active===null?e>=this.eligibleAt&&this.show(this.nextPrompt(),e):this.satisfied(this.active)?s=this.finish(e):e-this.shownAt>=g1&&(s=this.finish(e),this.stopped=!0);const r=this.active;return{prompt:r,text:r===null?"":v1[r][n.device],completed:s}}seenPrompts(){return[...this.seen]}nextPrompt(){for(const e of gd)if(!this.seen.has(e)){if(this.satisfied(e)){this.seen.add(e),this.seenChanged=!0;continue}return e}return null}show(e,t){e!==null&&(this.active=e,this.shownAt=t)}finish(e){const t=this.active;return t===null?null:(this.seen.add(t),this.seenChanged=!0,this.active=null,this.eligibleAt=e+vd,t)}record(e,t){e<=0||(t.throttle>fl&&(this.accelerateHeld+=e),Math.abs(t.steer)>fl&&(this.carveHeld+=e),t.throttle<-fl&&Math.abs(t.speed)>p1&&(this.brakeHeld+=e),t.hopped&&(this.hopSeen=!0))}satisfied(e){return e==="ride"?this.accelerateHeld>=u1&&this.carveHeld>=d1:e==="brake"?this.brakeHeld>=f1:this.hopSeen}}const pl=["chase","orbit"],_1=Object.freeze([]);class S1{renderer;loop;tuning;levelPlan;controller;audio;options;appState;challenge;records;terrain;terrainView;rig;actionState;keyboard;gamepad;touch;touchControls;coarsePointer;profiler;overlay;panel;stopTuningListener;stopOptionsListener;stopStateListener;hud;hudModel;menus;onboarding;promptDevice="keyboard";hudView;hudPrompt=null;ghostRecorder=new Tw;ghostPlayer=new ld(null);ghostSample=Rw();resultsIn=0;pendingSplit=null;lastResult=null;lastResultWasRecord=!1;lastResultGhostDropped=!1;lastResultPreviousSplits=[];tick=0;simTimeSeconds=0;layoutChanges=0;pageHidden=typeof document<"u"&&document.visibilityState==="hidden";contextLost=!1;contextNotice;previousPose=Ra();currentPose=Ra();renderPose=Ra();chase;previousCamera=el();currentCamera=el();renderCamera=el();chaseView=Jx();chaseInput={x:0,y:0,z:0,headingY:0,rollAngle:0,speed:0,groundY:0,airborne:!1,crashed:!1};scriptedOcclusion=null;strikePoint=new I;orbitAngle=0;previousOrbitAngle=0;cameraMode="chase";consumed={hop:0,reset:0,cameraCycle:0,pause:0,muteAudio:0};audioStepSeconds=0;lastFrameMs=-1;frameSeconds=0;wasCrashed=!1;lastThrottle=0;lastSteer=0;hudStepSeconds=0;hoppedSinceHudUpdate=!1;fieldOfViewTrimRadians=0;appliedOptions=null;lastSuspensionOffset=0;debugContext={tick:0,simTimeSeconds:0,loop:{},actions:{},consumed:this.consumed,euc:{},cameraMode:"chase",cameraDistance:0,cameraFov:0,cameraLookAhead:0,cameraBank:0,cameraYawLag:0,viewportWidth:0,viewportHeight:0,pixelRatio:0,drawCalls:0,triangles:0,geometries:0,textures:0,programs:0,profile:{},tuningOverrides:0,audio:{}};constructor(e,t=qa){this.tuning=new k_;const n=new _w;this.options=new xw(n),this.records=new Hw(n),this.appState=new Vw,this.renderer=new $x(e),this.levelPlan=oy(t),this.terrain=new Ny(this.levelPlan),this.terrainView=this.renderer.setLevel(this.levelPlan),this.controller=new j_(this.terrain,{spawn:this.levelPlan.spawn}),this.challenge=new Ww(this.levelPlan.id,this.levelPlan.checkpoints),this.rig=lf(),this.renderer.scene.add(this.rig.group),this.audio=new nw,this.audio.setSampleUrls(lw),this.chase=new jx,this.chase.setOcclusionProbe((s,r,a)=>this.terrain.raycast(s,r,a)),this.syncPoses(),this.actionState=new hy,this.profiler=new dw,this.overlay=new mw,this.panel=new gw(this.tuning),this.hudModel=new r1({speedUnit:this.options.current.speedUnit}),this.hudView=this.hudModel.update(0,{speed:0,powerStage:"normal",tiltBack:0,offCourse:!1,crashed:!1}),this.hud=new qw({onDismissPrompt:()=>this.dismissPrompt()}),this.onboarding=new b1(this.options.current.seenPrompts),this.menus=new h1(this.options.current,{callbacks:{onStartRide:()=>this.goTo("freeRide"),onResume:()=>{this.appState.resumeRide()},onOpenSettings:()=>this.goTo("settings"),onCloseSettings:()=>{this.appState.exitSettings()},onQuitToTitle:()=>{this.resetRider(),this.goTo("title")},onChange:s=>this.options.set(s),onResetOptions:()=>this.resetOptions(),onStartChallenge:()=>this.startChallenge(),onRetryChallenge:()=>this.startChallenge(),onResultsToTitle:()=>{this.resetRider(),this.goTo("title")}}}),this.menus.setPersistenceWarning(this.options.persistent),this.menus.setChallengeAvailable(this.challenge.available),this.contextNotice=new vw({id:"euc-context-notice",role:"alert",title:"Graphics interrupted",message:"The browser took the graphics context away — usually a GPU reset or the machine waking up. The game is paused while it waits for the context to come back. If nothing happens, reload.",actionLabel:"Reload the game",onAction:()=>window.location.reload()}),this.renderer.setContextLossCallbacks({onLost:()=>this.handleContextLost(),onRestored:()=>this.handleContextRestored()}),this.loop=new hw({beforeFrame:this.beforeFrame,step:this.step,render:this.render,onFrameSampled:this.onFrameSampled},cw()),this.keyboard=new vy(this.actionState,{now:()=>this.simTimeSeconds,onDebugAction:s=>{s==="toggleOverlay"?this.overlay.toggle():this.panel.toggle()},onInputReset:()=>this.loop.resetTime()}),this.gamepad=new Ay(this.actionState,{now:()=>this.simTimeSeconds,stickDeadZone:Xn.gamepadStickDeadZone,triggerThreshold:Xn.gamepadTriggerThreshold,menuStickThreshold:Xn.menuStickThreshold,menuRepeatDelaySeconds:Xn.menuRepeatDelaySeconds,menuRepeatIntervalSeconds:Xn.menuRepeatIntervalSeconds,onConnectionChange:s=>{s?this.promptDevice="gamepad":this.updateTouchControls(),this.updateGamepadStatus()},onMenuAction:s=>this.handleMenuAction(s)}),this.touch=new Ry(this.actionState,{now:()=>this.simTimeSeconds,stickTravelPx:Xn.touchStickTravelPx,stickDeadZonePx:Xn.touchStickDeadZonePx,stickCurve:Xn.touchStickCurve,onStickChange:(s,r)=>this.touchControls.showStick(s,r)}),this.touchControls=new Ly({input:this.touch,onFirstTouch:()=>{this.updateTouchControls(),this.updateTouchStatus()}}),this.coarsePointer=typeof window.matchMedia=="function"?window.matchMedia("(pointer: coarse)"):null,this.coarsePointer?.addEventListener("change",this.onPointerKindChange),document.addEventListener("visibilitychange",this.onVisibilityChange),this.stopTuningListener=this.tuning.onChange(()=>this.applyTuning()),this.stopOptionsListener=this.options.onChange(s=>this.applyOptions(s)),this.stopStateListener=this.appState.onChange(s=>this.enterState(s.id)),this.applyTuning(),this.applyOptions(this.options.current),this.enterState(this.appState.current),this.renderer.resize()}start(){this.profiler.begin(),this.appState.goTo("loading"),this.appState.goTo("title"),this.loop.start()}applyDebugQuery(e){const t=new URLSearchParams(e);t.get("debug")==="1"&&this.overlay.setVisible(!0),t.get("panel")==="1"&&this.panel.setVisible(!0)}advance(e){this.loop.advance(e)}setActions(e){this.actionState.setScripted(e,this.simTimeSeconds)}clearActions(){this.actionState.clearScripted()}setOcclusion(e){if(this.scriptedOcclusion=e,e===null){this.chase.setOcclusionProbe((t,n,s)=>this.terrain.raycast(t,n,s));return}this.chase.setOcclusionProbe((t,n,s)=>e<=s?e:null)}placeRider(e,t){this.controller.reset({position:e,headingY:t}),this.syncPoses(),this.renderer.clearParticles()}sampleGround(e,t){const n=Xa();return this.terrain.sampleGround(e,t,n),{height:n.height,normal:{...n.normal},surface:n.surface,offCourse:n.offCourse}}snapshot(){const e=this.renderer.renderer.info;return{tick:this.tick,simTimeSeconds:this.simTimeSeconds,loop:this.loop.stats(),actions:this.actionState.sample(this.simTimeSeconds),consumed:{...this.consumed},euc:this.controller.snapshot(),camera:{mode:this.cameraMode,orbitAngle:this.orbitAngle,yaw:this.currentCamera.yaw,distance:this.currentCamera.distance,armDistance:this.currentCamera.armDistance,fov:this.currentCamera.fov,bank:this.currentCamera.bank,lookAhead:this.currentCamera.lookAhead,heightLag:this.currentCamera.heightLag,dip:this.currentCamera.dip,crashFrame:this.currentCamera.crashFrame,scriptedOcclusion:this.scriptedOcclusion!==null},particles:this.renderer.particleCounts(),viewport:this.renderer.viewport(),render:{drawCalls:e.render.calls,triangles:e.render.triangles},resources:this.resources(),tuning:{overrides:this.tuning.overrides(),overrideCount:this.tuning.overrideCount(),exposure:this.renderer.renderer.toneMappingExposure,fieldOfView:this.renderer.camera.fov},debug:{overlayVisible:this.overlay.visible,panelVisible:this.panel.visible},levelPlanId:this.levelPlan.id,level:{segments:this.levelPlan.segments.length,colliders:this.levelPlan.segments.reduce((t,n)=>t+n.colliders.length,0),solids:this.levelPlan.solids?.length??0,cellsDrawn:this.terrainView.cellsDrawn,triangles:this.terrainView.triangles,surfaces:[...Oy(this.levelPlan)].sort()},layoutChanges:this.layoutChanges,paused:this.appState.current==="paused",contextLost:this.contextLost,audio:this.audio.snapshot(),app:{state:this.appState.current,menu:this.menus.current,acceptsRideInput:this.appState.acceptsRideInput,simulates:this.appState.simulates},hud:{...this.hudView,prompt:this.hudPrompt,visible:this.hud.visible},options:{...this.options.current,persistent:this.options.persistent},gamepadConnected:this.gamepad.connected,touch:{visible:this.touchControls.visible,wanted:this.touchWanted,throttle:this.touch.throttle,steer:this.touch.steer,promptDevice:this.promptDevice},challenge:{...this.challenge.state,available:this.challenge.available,resultsIn:this.resultsIn,recordedSamples:this.ghostRecorder.sampleCount},record:(()=>{const t=this.records.best(this.levelPlan.id);return{totalSeconds:t?.totalSeconds??null,splits:t?.splits??[],hasGhost:t?.ghost!=null,persistent:this.records.persistent}})()}}setAppState(e){return this.goTo(e)}setOptions(e){this.options.set(e)}startTimeTrial(){this.startChallenge()}clearRecords(){this.records.clearAll(),this.loadRecordReference()}resetOptions(){this.options.reset(),this.onboarding.restart(this.options.current.seenPrompts)}optionsPersist(){return this.options.persistent}startChallenge(){this.challenge.available&&(this.resetChallengeRider(),this.loadRecordReference(),this.challenge.arm(),this.renderer.setCheckpointProgress(this.challenge.state.nextIndex),this.ghostRecorder.reset(),this.resultsIn=0,this.pendingSplit=null,this.lastResult=null,this.goTo("challenge"))}loadRecordReference(){const e=this.records.best(this.levelPlan.id);this.challenge.setReference(e===null?null:{totalSeconds:e.totalSeconds,splits:e.splits}),this.ghostPlayer=new ld(e?.ghost?Yf(e.ghost):null)}stepChallenge(e){if(this.appState.current!=="challenge")return;if(this.resultsIn>0&&(this.resultsIn-=e,this.resultsIn<=0)){this.resultsIn=0,this.goTo("results");return}const t=this.currentPose,n=this.challenge.step(e,{x:t.x,y:t.y,z:t.z,speed:t.speed,landed:this.controller.touchedDown,landingClean:this.controller.lastLandingQuality==="clean",crashed:this.controller.crashed}),s=this.challenge.state;this.renderer.setCheckpointProgress(s.phase==="finished"?s.total:s.nextIndex),this.renderer.stepCheckpoints(e),s.phase==="running"&&this.ghostRecorder.record(s.elapsed,{x:t.x,y:t.y,z:t.z,groundY:t.groundY,headingY:t.headingY,rollAngle:t.rollAngle,speed:t.speed,crouch:t.crouch});for(const r of n)this.handleChallengeEvent(r)}handleChallengeEvent(e){this.renderer.flareCheckpoint(e.routeIndex),e.kind==="split"?this.pendingSplit={label:e.label,delta:e.totalDelta}:e.kind==="finish"&&(this.pendingSplit=null,this.finishRun())}finishRun(){const e=this.challenge.result();if(e===null)return;this.lastResult=e;const t=this.records.best(this.levelPlan.id);this.lastResultPreviousSplits=t!==null&&t.splits.length===e.splits.length?t.splits:[];const n=this.ghostRecorder.finish(this.levelPlan.id,e.totalSeconds),s={levelId:this.levelPlan.id,totalSeconds:e.totalSeconds,splits:e.splits,setAt:new Date().toISOString(),ghost:n===null?null:Lw(n)};this.lastResultWasRecord=this.records.submit(s);const r=this.records.best(this.levelPlan.id);this.lastResultGhostDropped=this.lastResultWasRecord&&s.ghost!==null&&(r===null||r.ghost===null),this.resultsIn=qe.resultsDelaySeconds}buildResultsView(){const e=this.lastResult;if(e===null)return{heading:"Run complete",isRecord:!1,total:Os(0),best:"—",deltaToBest:"",ahead:!1,rows:[],notes:[]};const t=this.lastResultWasRecord,n=e.previousBest,s=this.lastResultPreviousSplits,r=[];for(let l=1;l<e.splits.length;l+=1){const c=l<s.length?e.splits[l]-s[l]:null;r.push({label:e.labels[l]??`Checkpoint ${l}`,time:Os(e.splits[l]),delta:c===null?"":pc(c),ahead:c===null||Math.round(c*100)<0})}const a=this.options.current.speedUnit,o=[`Top speed ${mc(e.topSpeed,a)} ${a==="mph"?"mph":"km/h"}`];return e.landings>0&&o.push(`Clean landings ${e.cleanLandings} of ${e.landings}`),e.crashes>0&&o.push(e.crashes===1?"One crash":`${e.crashes} crashes`),this.lastResultGhostDropped&&o.push("Replay not saved — storage full"),this.records.persistent||o.push("This browser will not save times after you close the tab"),{heading:t?"New record":"Run complete",isRecord:t,total:Os(e.totalSeconds),best:n===null?"—":Os(n),deltaToBest:n===null?"":pc(e.totalSeconds-n),ahead:n===null||Math.round((e.totalSeconds-n)*100)<0,rows:r,notes:o}}armAudio(){this.audio.arm()}setVolumes(e){this.options.set({...e.master===void 0?{}:{volumeMaster:e.master},...e.sfx===void 0?{}:{volumeSfx:e.sfx},...e.ui===void 0?{}:{volumeUi:e.ui},...e.music===void 0?{}:{volumeMusic:e.music}})}setMuted(e){this.options.set({muted:e})}audioSnapshot(){return this.audio.snapshot()}audioLevel(){return this.audio.outputLevel()}audioSpectrum(){const e=this.audio.outputSpectrum();return e?{binHz:e.binHz,db:Array.from(e.db)}:null}resources(){const e=this.renderer.renderer.info.memory,t=this.renderer.renderer.info.programs?.length??0;let n=0,s=0;return this.renderer.scene.traverse(r=>{n+=1,r.isLight===!0&&(s+=1)}),{geometries:e.geometries,textures:e.textures,programs:t,sceneObjects:n,lights:s}}profileBegin(){this.profiler.begin()}profile(){return this.profiler.report()}setOverlayVisible(e){this.overlay.setVisible(e)}setTuningPanelVisible(e){this.panel.setVisible(e)}dispose(){this.loop.dispose(),this.keyboard.dispose(),this.gamepad.dispose(),this.touch.dispose(),this.touchControls.dispose(),this.coarsePointer?.removeEventListener("change",this.onPointerKindChange),document.removeEventListener("visibilitychange",this.onVisibilityChange),this.audio.dispose(),this.stopTuningListener(),this.stopOptionsListener(),this.stopStateListener(),this.overlay.dispose(),this.panel.dispose(),this.hud.dispose(),this.menus.dispose(),this.appState.dispose(),this.options.dispose(),this.records.dispose(),this.contextNotice.dispose(),this.tuning.dispose(),this.rig.dispose(),this.renderer.dispose()}beforeFrame=e=>{this.frameSeconds=this.lastFrameMs<0?0:Math.min(.25,Math.max(0,e-this.lastFrameMs)/1e3),this.lastFrameMs=e,this.gamepad.poll(this.simTimeSeconds),this.renderer.resize().layoutChanged&&(this.layoutChanges+=1,this.actionState.clearDevices(),this.touchControls.reset(),this.loop.resetTime())};step=e=>{this.tick+=1,this.simTimeSeconds+=e,this.audioStepSeconds+=e,this.hudStepSeconds+=e;const t=this.appState.acceptsRideInput,n=t?this.actionState.sample(this.simTimeSeconds):cy;let s=!1,r=!1;for(const c of t?wf:_1)c==="hop"&&!this.controller.canAcceptHop||this.actionState.consume(c,this.simTimeSeconds)&&(this.consumed[c]+=1,c==="hop"&&(r=!0),c==="reset"&&(this.challenge.state.phase!=="idle"?this.resetChallengeRider():this.resetRider(),this.challenge.restart(),this.ghostRecorder.reset(),this.pendingSplit=null,this.resultsIn=0,s=!0),c==="cameraCycle"&&this.cycleCamera(),c==="pause"&&this.goTo("paused"),c==="muteAudio"&&this.options.set({muted:!this.options.current.muted}));if(s)return;const a=n.hop===r?n:{...n,hop:r};if(this.lastThrottle=a.throttle,this.lastSteer=a.steer,zo(this.currentPose,this.previousPose),this.controller.step(e,a),this.controller.writePose(this.currentPose),this.controller.touchedDown){const c=this.controller.lastLandingImpact;this.chase.landingImpulse(c),this.renderer.emitLandingParticles(this.currentPose.x,this.currentPose.y,this.currentPose.z,this.controller.currentSurface,c/Q.landingImpactReference),this.audio.landing(c/Q.landingImpactReference,this.controller.currentSurface)}const o=this.controller.pedalStrikeDepth;if(o!==0){const c=o>0?1:-1;CS(this.currentPose,c,this.strikePoint),this.renderer.emitSparks(this.strikePoint.x,this.strikePoint.y,this.strikePoint.z,Math.abs(o),c,this.currentPose.headingY,e)}this.renderer.stepParticles(e),this.controller.tookOff&&(this.audio.hop(this.controller.lastHopCharge),this.hoppedSinceHudUpdate=!0);const l=this.controller.obstacleImpact;l>0&&this.audio.impact(l),this.controller.crashed!==this.wasCrashed&&(this.controller.crashed&&this.audio.crash(this.currentPose.speed),this.wasCrashed=this.controller.crashed),this.stepChallenge(e),tl(this.currentCamera,this.previousCamera),this.chase.step(e,this.readChaseInput(this.currentPose)),this.chase.writeState(this.currentCamera),this.previousOrbitAngle=this.orbitAngle,this.orbitAngle+=this.tuning.get("INSPECTION_CAMERA.orbitRate")*e};readChaseInput(e){const t=this.chaseInput;return t.x=e.x,t.y=e.y,t.z=e.z,t.headingY=e.headingY,t.rollAngle=e.rollAngle,t.speed=e.speed,t.groundY=e.groundY,t.airborne=e.y-e.groundY>1e-6,t.crashed=e.crashBlend>1e-6,t}render=e=>{const t=this.renderPose,n=this.previousPose,s=this.currentPose;t.x=n.x+(s.x-n.x)*e,t.y=n.y+(s.y-n.y)*e,t.z=n.z+(s.z-n.z)*e,t.headingY=n.headingY+(s.headingY-n.headingY)*e,t.rollAngle=n.rollAngle+(s.rollAngle-n.rollAngle)*e,t.riderRoll=n.riderRoll+(s.riderRoll-n.riderRoll)*e,t.riderPitch=n.riderPitch+(s.riderPitch-n.riderPitch)*e,t.riderLookYaw=n.riderLookYaw+(s.riderLookYaw-n.riderLookYaw)*e,t.wheelPitch=n.wheelPitch+(s.wheelPitch-n.wheelPitch)*e,t.wheelSpin=n.wheelSpin+(s.wheelSpin-n.wheelSpin)*e,t.groundPitch=n.groundPitch+(s.groundPitch-n.groundPitch)*e,t.groundRoll=n.groundRoll+(s.groundRoll-n.groundRoll)*e,t.suspensionOffset=n.suspensionOffset+(s.suspensionOffset-n.suspensionOffset)*e,t.restFactor=n.restFactor+(s.restFactor-n.restFactor)*e,t.speed=n.speed+(s.speed-n.speed)*e,t.crouch=n.crouch+(s.crouch-n.crouch)*e,t.tuck=n.tuck+(s.tuck-n.tuck)*e,t.airBlend=n.airBlend+(s.airBlend-n.airBlend)*e,t.airHeight=n.airHeight+(s.airHeight-n.airHeight)*e,t.groundY=n.groundY+(s.groundY-n.groundY)*e,t.pedalStrike=n.pedalStrike+(s.pedalStrike-n.pedalStrike)*e,t.wobble=n.wobble+(s.wobble-n.wobble)*e,t.wobbleFootCorrection=n.wobbleFootCorrection+(s.wobbleFootCorrection-n.wobbleFootCorrection)*e,t.wobbleYaw=n.wobbleYaw+(s.wobbleYaw-n.wobbleYaw)*e,t.alert=n.alert+(s.alert-n.alert)*e,t.tiltBack=n.tiltBack+(s.tiltBack-n.tiltBack)*e,t.crashBlend=n.crashBlend+(s.crashBlend-n.crashBlend)*e,t.crashForward=n.crashForward+(s.crashForward-n.crashForward)*e,t.crashLateral=n.crashLateral+(s.crashLateral-n.crashLateral)*e,t.crashDrop=n.crashDrop+(s.crashDrop-n.crashDrop)*e,t.crashTumble=n.crashTumble+(s.crashTumble-n.crashTumble)*e,t.crashRoll=n.crashRoll+(s.crashRoll-n.crashRoll)*e,t.wheelCrashLean=n.wheelCrashLean+(s.wheelCrashLean-n.wheelCrashLean)*e,t.recoverBlend=n.recoverBlend+(s.recoverBlend-n.recoverBlend)*e,this.rig.apply(t),this.rig.applyStatus(t.alert,this.simTimeSeconds,1-t.recoverBlend),this.renderer.setShadowFocus(t.x,t.y,t.z),this.terrainView.setSurroundCentre(t.x,t.z),this.placeCamera(t,e),this.updateAudio(t),this.updateHud(t),this.updateGhost(),this.renderer.render()};updateHud(e){const t=this.appState.acceptsRideInput,n=this.challenge.state;this.hudView=this.hudModel.update(this.simTimeSeconds,{speed:e.speed,powerStage:this.controller.powerWarning,tiltBack:e.tiltBack,offCourse:this.controller.offRoute,crashed:e.crashBlend>1e-6,challenge:n.phase==="idle"?void 0:{phase:n.phase,elapsed:n.elapsed,nextLabel:n.nextLabel,passed:n.passed,total:n.total,directionRadians:this.directionToCheckpoint(n.nextIndex,e),distanceMetres:n.distanceToNext,split:this.takePendingSplit()}});const s=this.onboarding.update(this.simTimeSeconds,this.hudStepSeconds,{riding:t,throttle:this.lastThrottle,steer:this.lastSteer,speed:e.speed,hopped:this.hoppedSinceHudUpdate,crashed:e.crashBlend>1e-6,device:this.promptDevice});this.hudStepSeconds=0,this.hoppedSinceHudUpdate=!1,this.hudPrompt=s.prompt,this.persistSeenPrompts(),this.hud.visible&&this.hud.update(this.hudView,s.text)}updateGhost(){if(this.appState.current!=="challenge"||!this.ghostPlayer.hasTrack){this.renderer.setGhostVisible(!1);return}const e=this.challenge.state;if(e.phase!=="running"||!this.ghostPlayer.sample(e.elapsed,this.ghostSample)){this.renderer.setGhostVisible(!1);return}this.renderer.setGhostVisible(!0),this.renderer.applyGhost(this.ghostSample)}takePendingSplit(){const e=this.pendingSplit;return this.pendingSplit=null,e}updateAudio(e){const t=this.audio.input;t.speed=e.speed,t.throttle=this.lastThrottle,t.load=this.controller.powerLoad,t.powerStage=this.controller.powerWarning,t.surface=this.controller.currentSurface,t.grounded=e.y-e.groundY<=1e-6;const n=!this.appState.acceptsRideInput||this.contextLost,s=this.audioStepSeconds>0?this.audioStepSeconds:n?this.frameSeconds:0;t.suspensionSpeed=s>0?(e.suspensionOffset-this.lastSuspensionOffset)/s:0,this.lastSuspensionOffset=e.suspensionOffset,t.scrape=Math.abs(e.pedalStrike),t.wobble=e.wobble,t.crashed=e.crashBlend>1e-6,t.idle=n,this.audio.update(s),this.audioStepSeconds=0}placeCamera(e,t){const n=this.renderer.camera;if(this.cameraMode==="orbit"){const r=this.previousOrbitAngle+(this.orbitAngle-this.previousOrbitAngle)*t,a=Ze.distanceAtRest*Aa.distanceFactor;n.position.set(e.x+Math.sin(r)*a,e.y+at.shellHeight*Aa.heightFactor,e.z+Math.cos(r)*a),n.up.set(0,1,0),n.lookAt(e.x,e.y+ss.hipHeight*Aa.targetHeightFactor,e.z),this.renderer.setFieldOfView(this.chase.tuning.fovAtRest);return}Kx(this.previousCamera,this.currentCamera,t,this.renderCamera);const s=this.chaseView;eM(this.renderCamera,this.readChaseInput(e),this.chase.tuning,s),n.position.set(s.positionX,s.positionY,s.positionZ),n.up.set(0,1,0),n.lookAt(s.targetX,s.targetY,s.targetZ),s.roll!==0&&n.rotateZ(-s.roll),this.renderer.setFieldOfView(s.fov+this.fieldOfViewTrimRadians)}onFrameSampled=e=>{this.profiler.record(e);const t=performance.now();if(!this.overlay.shouldRefresh(t))return;const n=this.debugContext,s=this.renderer.renderer.info,r=this.renderer.viewport();n.tick=this.tick,n.simTimeSeconds=this.simTimeSeconds,n.loop=this.loop.stats(),n.actions=this.actionState.sample(this.simTimeSeconds),n.euc=this.controller.snapshot(),n.cameraMode=this.cameraMode,n.cameraDistance=this.currentCamera.armDistance,n.cameraFov=this.currentCamera.fov,n.cameraLookAhead=this.currentCamera.lookAhead,n.cameraBank=this.currentCamera.bank,n.cameraYawLag=Wa(this.currentPose.headingY-this.currentCamera.yaw),n.viewportWidth=r.width,n.viewportHeight=r.height,n.pixelRatio=r.pixelRatio,n.drawCalls=s.render.calls,n.triangles=s.render.triangles,n.geometries=s.memory.geometries,n.textures=s.memory.textures,n.programs=s.programs?.length??0,n.profile=this.profiler.report(),n.tuningOverrides=this.tuning.overrideCount(),n.audio=this.audio.snapshot(),this.overlay.update(n,t)};resetRider(){this.resetRiderTo(this.levelPlan.spawn)}resetChallengeRider(){const e=this.levelPlan.checkpoints.find(r=>r.kind==="start");if(e===void 0){this.resetRider();return}const t=e.centre.x-Math.sin(e.headingY)*qe.startRunupMetres,n=e.centre.z-Math.cos(e.headingY)*qe.startRunupMetres,s=Xa();this.terrain.sampleGround(t,n,s),this.resetRiderTo({position:{x:t,y:s.height,z:n},headingY:e.headingY})}resetRiderTo(e){this.controller.reset(e),this.syncPoses(),this.orbitAngle=0,this.previousOrbitAngle=0,this.renderer.clearParticles(),this.audio.reset(),this.lastThrottle=0,this.lastSteer=0,this.lastSuspensionOffset=0,this.wasCrashed=!1,this.hudModel.reset()}directionToCheckpoint(e,t){if(e<0)return Number.NaN;const n=this.levelPlan.checkpoints.find(s=>s.routeIndex===e);return n===void 0?Number.NaN:Wa(Math.atan2(n.centre.x-t.x,n.centre.z-t.z)-t.headingY)}cycleCamera(){const e=(pl.indexOf(this.cameraMode)+1)%pl.length;this.cameraMode=pl[e]}goTo(e){return this.appState.goTo(e)}enterState(e){const t=this.appState.spec;t.resetsInput&&(this.keyboard.reset(),this.loop.resetTime());const n=e==="challenge"||e==="results"||(e==="paused"||e==="settings")&&this.challenge.state.phase!=="idle";this.renderer.setCheckpointsVisible(n),n||this.renderer.setGhostVisible(!1),(e==="title"||e==="freeRide")&&this.challenge.state.phase!=="idle"&&(this.challenge.abandon(),this.ghostRecorder.reset(),this.resultsIn=0,this.pendingSplit=null),e==="results"&&this.menus.setResults(this.buildResultsView()),this.hud.setVisible(t.showsHud),this.menus.show(x1(e)),this.gamepad.setMenuMode(t.showsMenu),this.updateTouchControls(),t.acceptsRideInput||this.hudModel.reset(),this.updateRunning()}handleMenuAction(e){if(this.appState.showsMenu){if(e==="up"||e==="down"||e==="left"||e==="right"){this.menus.navigate(e);return}if(e==="confirm"){const t=document.activeElement;t instanceof HTMLElement&&t.click();return}e==="back"&&(this.appState.current==="settings"?this.appState.exitSettings():this.appState.current==="paused"&&this.appState.resumeRide())}}get touchWanted(){const e=this.options.current.touchControls;return e==="off"?!1:e==="on"?!0:(this.coarsePointer?.matches??!1)||this.touchControls.touchSeen}updateTouchControls(){const e=this.touchWanted;this.touchControls.setActive(e&&this.appState.acceptsRideInput),this.hud.setTouchLayout(e),this.gamepad.connected||(this.promptDevice=e?"touch":"keyboard")}updateTouchStatus(){const e=this.options.current.touchControls;this.menus.setTouchStatus(e==="off"?"disabled":e==="on"?"forced":this.touchWanted?"shown":"waiting")}updateGamepadStatus(){this.menus.setGamepadStatus(this.options.current.gamepadEnabled?this.gamepad.connected?"connected":"searching":"disabled")}dismissPrompt(){this.onboarding.dismiss(),this.persistSeenPrompts()}persistSeenPrompts(){this.onboarding.takeSeenChanged()&&this.options.set({seenPrompts:this.onboarding.seenPrompts()})}handleContextLost(){this.contextLost=!0,this.appState.current==="paused"&&this.appState.resumeRide(),this.keyboard.reset(),this.contextNotice.show(),this.updateRunning()}onPointerKindChange=()=>{this.updateTouchControls(),this.updateTouchStatus()};onVisibilityChange=()=>{const e=document.visibilityState==="hidden";this.audio.setSuspended(e),this.pageHidden=e,this.updateRunning()};handleContextRestored(){this.contextLost=!1,this.contextNotice.hide(),this.keyboard.reset(),this.updateRunning()}updateRunning(){this.loop.setRunning(this.appState.simulates&&!this.contextLost&&!this.pageHidden)}syncPoses(){this.controller.writePose(this.currentPose),zo(this.currentPose,this.previousPose),zo(this.currentPose,this.renderPose),this.rig.apply(this.renderPose),this.chase.reset(this.readChaseInput(this.currentPose)),this.chase.writeState(this.currentCamera),tl(this.currentCamera,this.previousCamera),tl(this.currentCamera,this.renderCamera)}applyTuning(){this.renderer.applyLighting({exposure:this.tuning.get("LIGHTING.exposure"),sunIntensity:this.tuning.get("LIGHTING.sunIntensity"),hemisphereIntensity:this.tuning.get("LIGHTING.hemisphereIntensity")}),this.renderer.setMaxPixelRatio(this.tuning.get("RENDER.maxPixelRatio")),this.loop.setMaxStepsPerFrame(this.tuning.get("SIMULATION.maxStepsPerFrame")),this.pushCameraTuning(),this.controller.setTuning({maxLeanPitch:this.tuning.get("EUC.maxLeanPitch"),leanResponseSeconds:this.tuning.get("EUC.leanResponseSeconds"),leanRateLimit:this.tuning.get("EUC.leanRateLimit"),leanToAccel:this.tuning.get("EUC.leanToAccel"),brakeAuthority:this.tuning.get("EUC.brakeAuthority"),dragCoefficient:this.tuning.get("EUC.dragCoefficient"),rollingResistanceScale:this.tuning.get("TERRAIN.rollingResistanceScale"),curbImpactPerMetre:this.tuning.get("TERRAIN.curbImpactPerMetre"),suspensionFrequencyHz:this.tuning.get("TERRAIN.suspensionFrequencyHz"),suspensionDamping:this.tuning.get("TERRAIN.suspensionDamping"),yawRateLow:this.tuning.get("EUC.yawRateLow"),yawRateHigh:this.tuning.get("EUC.yawRateHigh"),carveSpeed:this.tuning.get("EUC.carveSpeed"),maxLateralG:this.tuning.get("EUC.maxLateralG"),rollResponseSeconds:this.tuning.get("EUC.rollResponseSeconds"),riderUpperBodyRollFactor:this.tuning.get("EUC.riderUpperBodyRollFactor"),maxRiderPitch:this.tuning.get("EUC.maxRiderPitch"),riderCruisePitchFactor:this.tuning.get("EUC.riderCruisePitchFactor"),riderAccelerationPitchGain:this.tuning.get("EUC.riderAccelerationPitchGain"),riderPitchResponseSeconds:this.tuning.get("EUC.riderPitchResponseSeconds"),wheelPitchFactor:this.tuning.get("EUC.wheelPitchFactor"),riderLookIntoTurn:this.tuning.get("EUC.riderLookIntoTurn"),riderSlopeLeanFactor:this.tuning.get("EUC.riderSlopeLeanFactor"),groundTiltPitchFollow:this.tuning.get("TERRAIN.groundTiltPitchFollow"),groundTiltRollFollow:this.tuning.get("TERRAIN.groundTiltRollFollow"),hopLaunchSpeed:this.tuning.get("EUC.hopLaunchSpeed"),hopCompressSeconds:this.tuning.get("EUC.hopCompressSeconds"),hopChargeHeightBonus:this.tuning.get("EUC.hopChargeHeightBonus"),airYawFactor:this.tuning.get("EUC.airYawFactor"),pedalStrikeDecel:this.tuning.get("EUC.pedalStrikeDecel"),landingImpactReference:this.tuning.get("EUC.landingImpactReference"),landingSpeedLossPerScore:this.tuning.get("EUC.landingSpeedLossPerScore"),wobbleMasterGain:this.tuning.get("EUC.wobbleMasterGain"),wobbleReversalMemorySeconds:this.tuning.get("EUC.wobbleReversalMemorySeconds"),wobbleDampingAggressive:this.tuning.get("EUC.wobbleDampingAggressive"),wobbleDampingSmooth:this.tuning.get("EUC.wobbleDampingSmooth"),wobbleFootCorrectionDamping:this.tuning.get("EUC.wobbleFootCorrectionDamping"),wobbleMaxYaw:this.tuning.get("EUC.wobbleMaxYaw"),wobbleFrequencyHz:this.tuning.get("EUC.wobbleFrequencyHz"),wobbleSurfaceGain:this.tuning.get("EUC.wobbleSurfaceGain"),wobbleSteerReversalGain:this.tuning.get("EUC.wobbleSteerReversalGain"),powerComfortSpeed:this.tuning.get("EUC.powerComfortSpeed"),powerSlopeLoad:this.tuning.get("EUC.powerSlopeLoad"),powerTiltBackLoad:this.tuning.get("EUC.powerTiltBackLoad"),tiltBackLeanBack:this.tuning.get("EUC.tiltBackLeanBack"),obstacleCrashSpeed:this.tuning.get("EUC.obstacleCrashSpeed"),crashRecoverSpeedFactor:this.tuning.get("EUC.crashRecoverSpeedFactor"),crashRecoverAutoSeconds:this.tuning.get("EUC.crashRecoverAutoSeconds")}),this.audio.setTuning({bedTrim:this.tuning.get("AUDIO.bedTrim"),motorPolePairs:this.tuning.get("AUDIO.motorPolePairs"),motorIdleLevel:this.tuning.get("AUDIO.motorIdleLevel"),motorLoadLevel:this.tuning.get("AUDIO.motorLoadLevel"),motorSingLevel:this.tuning.get("AUDIO.motorSingLevel"),motorAirLevel:this.tuning.get("AUDIO.motorAirLevel"),motorLoadBrighten:this.tuning.get("AUDIO.motorLoadBrighten"),regenLevel:this.tuning.get("AUDIO.regenLevel"),windLevel:this.tuning.get("AUDIO.windLevel"),beepLevel:this.tuning.get("AUDIO.beepLevel"),tyreLevel:this.tuning.get("AUDIO.tyreLevel"),tiltBackLevel:this.tuning.get("AUDIO.tiltBackLevel"),duckTiltBack:this.tuning.get("AUDIO.duckTiltBack")});for(const e of nf){const t={};for(const n of["rollingResistance","grip","roughnessAmplitude"]){const s=`SURFACES.${e}.${n}`;this.tuning.specFor(s)!==void 0&&(t[n]=this.tuning.get(s))}Object.keys(t).length>0&&this.controller.setSurfaceResponse(e,t)}}applyOptions(e){const t=this.appliedOptions;(t===null||e.quality!==t.quality)&&this.renderer.setQuality(e.quality,this.tuning.get("RENDER.maxPixelRatio")),(t===null||e.volumeMaster!==t.volumeMaster||e.volumeSfx!==t.volumeSfx||e.volumeUi!==t.volumeUi||e.volumeMusic!==t.volumeMusic)&&this.audio.setVolumes({master:e.volumeMaster,sfx:e.volumeSfx,ui:e.volumeUi,music:e.volumeMusic}),(t===null||e.muted!==t.muted)&&this.audio.setMuted(e.muted),(t===null||e.bindings!==t.bindings)&&this.keyboard.setBindings(Wc(e.bindings)),(t===null||e.gamepadEnabled!==t.gamepadEnabled)&&(this.gamepad.setEnabled(e.gamepadEnabled),this.updateGamepadStatus()),(t===null||e.gamepadDeadZone!==t.gamepadDeadZone)&&this.gamepad.setDeadZone(e.gamepadDeadZone),(t===null||e.touchControls!==t.touchControls)&&(this.updateTouchControls(),this.updateTouchStatus()),(t===null||e.touchSwapSides!==t.touchSwapSides)&&this.touchControls.setSwapSides(e.touchSwapSides),(t===null||e.touchScale!==t.touchScale)&&(this.touchControls.setScale(e.touchScale),this.touch.setScale(e.touchScale)),(t===null||e.fieldOfViewTrim!==t.fieldOfViewTrim)&&(this.fieldOfViewTrimRadians=ic.degToRad(e.fieldOfViewTrim)),(t===null||e.speedUnit!==t.speedUnit)&&this.hudModel.setSpeedUnit(e.speedUnit),this.menus.sync(e),this.appliedOptions=e}pushCameraTuning(){this.chase.setTuning({distanceAtRest:this.tuning.get("CAMERA.distanceAtRest"),distanceAtSpeed:this.tuning.get("CAMERA.distanceAtSpeed"),armHeight:this.tuning.get("CAMERA.armHeight"),fovAtRest:this.tuning.get("CAMERA.fovAtRest"),fovAtSpeed:this.tuning.get("CAMERA.fovAtSpeed"),lookAheadSeconds:this.tuning.get("CAMERA.lookAheadSeconds"),yawLagAtRest:this.tuning.get("CAMERA.yawLagAtRest"),yawLagAtSpeed:this.tuning.get("CAMERA.yawLagAtSpeed"),bankFactor:this.tuning.get("CAMERA.bankFactor"),airHeightFollow:this.tuning.get("CAMERA.airHeightFollow"),landingDipMax:this.tuning.get("CAMERA.landingDipMax"),crashDistance:this.tuning.get("CAMERA.crashDistance")})}}function x1(i){return i==="title"?"title":i==="paused"?"pause":i==="settings"?"settings":i==="results"?"results":"none"}const gr=Object.freeze({title:"EUC Thrills",author:"VibezZzCoder",authorUrl:"https://github.com/VibezZzCoder",repositoryUrl:"https://github.com/VibezZzCoder/EUC-thrills",homepageUrl:"https://vibezzzcoder.github.io/EUC-thrills/",year:"2026",licence:"MIT",assetLicence:"CC-BY-4.0"});function M1(){return`${gr.title} — original work by ${gr.author} (${gr.authorUrl}). Source: ${gr.repositoryUrl}`}const Sa=document.getElementById("boot"),bd=document.getElementById("boot-status"),ml=document.getElementById("boot-error");function ka(i,e){const t=e instanceof Error?`${i}

${e.message}`:i;ml&&(ml.textContent=t,ml.hidden=!1),bd&&(bd.textContent="Could not start");const n=document.getElementById("boot-track");n&&(n.hidden=!0),console.error(i,e)}function y1(){try{const i=document.createElement("canvas");return!!(i.getContext("webgl2")??i.getContext("webgl"))}catch{return!1}}function w1(){if(!Sa)return;Sa.classList.add("is-dismissed");const i=()=>{Sa.hidden=!0};Sa.addEventListener("transitionend",i,{once:!0}),window.setTimeout(i,400)}function E1(){console.info(`${M1()} · Play: ${gr.homepageUrl}`)}function T1(){const i=document.getElementById("viewport");if(!(i instanceof HTMLCanvasElement)){ka("The rendering surface is missing from the page.");return}if(!y1()){ka("EUC Thrills needs WebGL, and this browser could not provide it. Try updating the browser, or enabling hardware acceleration in its settings.");return}let e;try{e=new S1(i,ly(window.location.search))}catch(n){ka("EUC Thrills could not start.",n);return}e.applyDebugQuery(window.location.search);const t=()=>{window.removeEventListener("pagehide",t),e.dispose()};window.addEventListener("pagehide",t),window.game=e,e.start(),w1()}E1();try{T1()}catch(i){ka("EUC Thrills failed to start.",i)}
