import * as THREE from 'three';
import { U } from '../core/globals';
import { clamp } from '../core/util';

export const POINT_VS=`attribute vec3 color; attribute float size; uniform float uPR; uniform float uHaze; varying vec3 vC;
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; float d=-mv.z;
  float s=size*uPR*clamp(260.0/max(d,1.0),0.6,3.0); gl_PointSize=max(s,1.5*uPR);
  vC=color*exp(-pow(d*uHaze*0.7,2.0))*min(1.0,s*s/(gl_PointSize*gl_PointSize)+0.35); }`;
export const POINT_FS=`uniform float uBlink; uniform float uUseBlink; varying vec3 vC; void main(){ vec2 p=gl_PointCoord-0.5; float r=dot(p,p)*4.0; float a=exp(-r*3.5);
  float b=mix(1.0,uBlink,uUseBlink); gl_FragColor=vec4(vC*a*b*3.0,1.0); }`;
export function pointsMat(blink=false){
  return new THREE.ShaderMaterial({uniforms:{uPR:U.pr,uHaze:U.haze,uBlink:U.blink,uUseBlink:{value:blink?1:0}},vertexShader:POINT_VS,fragmentShader:POINT_FS,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
}
export const PMAT:any={};
export function makePoints(pos,col,size,blink=false){
  const gm=new THREE.BufferGeometry(); gm.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); gm.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  gm.setAttribute('size',new THREE.Float32BufferAttribute(new Array(pos.length/3).fill(size),1));
  const key=blink?'b':'s'; PMAT[key]=PMAT[key]||pointsMat(blink);
  const p=new THREE.Points(gm,PMAT[key]); p.frustumCulled=false; return p;
}
