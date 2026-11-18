import * as THREE from 'three';

export const V3 = THREE.Vector3;
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export const _seedP=new URLSearchParams(location.search).get('seed');
export const SEED=_seedP?parseInt(_seedP):(Math.random()*2**31)|0;
export const R = mulberry32(SEED);
export const rr=(a,b)=>a+(b-a)*R();
export const pick=a=>a[(R()*a.length)|0];
export const clamp=(x,a,b)=>x<a?a:x>b?b:x;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
export const FONT='"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
export const params=new URLSearchParams(location.search);
