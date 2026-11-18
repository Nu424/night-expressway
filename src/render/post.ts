import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { icam, iscene } from '../car/interior';
import { clamp } from '../core/util';
import { PR, camera, canvas, renderer, scene } from './renderer';

export let composer, mainPass, dropsPass, interiorPass, bloomPass, gradePass;
export const DropsShader={
  uniforms:{tDiffuse:{value:null},tDrops:{value:null},uTexel:{value:new THREE.Vector2(1/640,1/360)},uAmt:{value:0},uW1:{value:new THREE.Vector4()},uW2:{value:new THREE.Vector4()},uAspect:{value:16/9},uWipe:{value:0},uFilm:{value:0}},
  vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tDiffuse; uniform sampler2D tDrops; uniform vec2 uTexel; uniform float uAmt; uniform vec4 uW1; uniform vec4 uW2; uniform float uAspect; uniform float uWipe; uniform float uFilm;
    varying vec2 vUv;
    float segD(vec2 p,vec2 a,vec2 b){ vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
    void main(){
      vec3 col=texture2D(tDiffuse,vUv).rgb;
      if(uAmt>0.001){
        if(uFilm>0.001){ vec3 b=vec3(0.0); for(int i=0;i<6;i++){ float a=float(i)*1.047; b+=texture2D(tDiffuse,vUv+vec2(cos(a),sin(a))*0.003).rgb; } col=mix(col,b/6.0,uFilm*0.7); }
        float h=texture2D(tDrops,vUv).a;
        if(h>0.01){
          float hx=texture2D(tDrops,vUv+vec2(uTexel.x,0.)).a-texture2D(tDrops,vUv-vec2(uTexel.x,0.)).a;
          float hy=texture2D(tDrops,vUv+vec2(0.,uTexel.y)).a-texture2D(tDrops,vUv-vec2(0.,uTexel.y)).a;
          vec2 off=-vec2(hx,hy)*0.11;
          vec3 dc=texture2D(tDiffuse,vUv+off).rgb*0.4+texture2D(tDiffuse,vUv+off*1.5+vec2(0.002,0.)).rgb*0.3+texture2D(tDiffuse,vUv+off*0.6-vec2(0.,0.002)).rgb*0.3;
          float m=smoothstep(0.05,0.45,h);
          col=mix(col,dc*1.2+0.006,m);
          col+=vec3(0.035)*smoothstep(0.08,0.2,h)*(1.0-smoothstep(0.2,0.45,h))*clamp(-hy*8.0+0.3,0.0,1.0);
        }
      }
      if(uWipe>0.5){
        vec2 p=vec2(vUv.x*uAspect,vUv.y);
        float d=min(segD(p,uW1.xy,uW1.zw),segD(p,uW2.xy,uW2.zw));
        float blade=1.0-smoothstep(0.004,0.0075,d);
        col=mix(col,vec3(0.003),blade);
      }
      gl_FragColor=vec4(col,1.0);
    }`
};
export const GradeShader={
  uniforms:{tDiffuse:{value:null},uTime:{value:0},uRes:{value:new THREE.Vector2(1,1)}},
  vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 uv=vUv; vec2 c=uv-0.5; float r2=dot(c,c);
      float ca=0.0016*r2*4.0;
      vec3 col; col.r=texture2D(tDiffuse,uv-c*ca).r; col.g=texture2D(tDiffuse,uv).g; col.b=texture2D(tDiffuse,uv+c*ca).b;
      col=col*0.975+vec3(0.005,0.006,0.010);
      col=mix(col,col*vec3(1.03,1.0,0.96),smoothstep(0.3,0.9,dot(col,vec3(0.33))));
      col*=1.0-r2*0.75;
      float g=h(floor(uv*uRes)+fract(uTime*17.13)*91.0);
      col+=(g-0.5)*0.028;
      gl_FragColor=vec4(col,1.0); }`
};
export let dropsCanvas, dropsCtx, dropsTex;
export function makePost(){
  const w=innerWidth,h=innerHeight;
  const rt=new THREE.WebGLRenderTarget(w*PR,h*PR,{type:THREE.HalfFloatType});
  composer=new EffectComposer(renderer,rt);
  composer.setPixelRatio(PR); composer.setSize(w,h);
  mainPass=new RenderPass(scene,camera); composer.addPass(mainPass);
  dropsCanvas=document.createElement('canvas'); dropsCanvas.width=640; dropsCanvas.height=360; dropsCtx=dropsCanvas.getContext('2d');
  dropsTex=new THREE.CanvasTexture(dropsCanvas);
  dropsPass=new ShaderPass(DropsShader); dropsPass.uniforms.tDrops.value=dropsTex; composer.addPass(dropsPass);
  interiorPass=new RenderPass(iscene,icam); interiorPass.clear=false; interiorPass.clearDepth=true; composer.addPass(interiorPass);
  bloomPass=new UnrealBloomPass(new THREE.Vector2(w,h),0.55,0.35,0.95); composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  gradePass=new ShaderPass(GradeShader); composer.addPass(gradePass);
}
