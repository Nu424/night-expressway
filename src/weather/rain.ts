import * as THREE from 'three';
import { R, V3 } from '../core/util';
import { scene } from '../render/renderer';

export let rainLines;
export const rainDisp=new V3();
export function makeRain(){
  const N=5000; const pos=new Float32Array(N*2*3), seed=new Float32Array(N*2*4);
  for(let i=0;i<N;i++){ const x=R(),y=R(),z=R(),s=R(); for(let e=0;e<2;e++){ seed.set([x,y,z,e],(i*2+e)*4); } }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('seed',new THREE.BufferAttribute(seed,4));
  rainLines=new THREE.LineSegments(g,new THREE.ShaderMaterial({
    uniforms:{uDisp:{value:rainDisp},uVel:{value:new V3()},uAmt:{value:0},uLight:{value:new THREE.Color()}},
    vertexShader:`attribute vec4 seed; uniform vec3 uDisp; uniform vec3 uVel; varying float vA;
      void main(){ vec3 box=vec3(44.0,26.0,64.0);
        vec3 p=mod(seed.xyz*box+uDisp,box)-box*0.5; p.y+=4.0;
        vec3 wp=cameraPosition+p - uVel*0.022*seed.w;
        vA=(1.0-smoothstep(10.0,32.0,length(p)))*(0.35+0.65*fract(seed.x*91.7));
        gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.0); }`,
    fragmentShader:`uniform float uAmt; uniform vec3 uLight; varying float vA; void main(){ gl_FragColor=vec4(uLight*vA*uAmt,1.0); }`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  rainLines.frustumCulled=false; scene.add(rainLines);
}
