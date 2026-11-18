import * as THREE from 'three';
import { FOG_DENS, LAMP_COLORS, U } from '../core/globals';
import { R, clamp } from '../core/util';
import { TEX } from './textures';

export const dummyTex=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1); dummyTex.needsUpdate=true;
U.reflTex.value=dummyTex;
export function bakedMat({color=[1,1,1],map=null,rough=0.85,metal=0,gain=1,wetDark=0.45,refl=false,alphaTest=0,side=THREE.FrontSide,key='b'}){
  const m=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(color[0],color[1],color[2]),map,roughness:rough,metalness:metal,alphaTest,side});
  m.onBeforeCompile=sh=>{
    sh.uniforms.uWet=U.wet; sh.uniforms.uRefl=U.reflTex; sh.uniforms.uTexMat=U.texMat; sh.uniforms.uReflRoad=U.reflRoad;
    sh.vertexShader='attribute vec3 bake;\nvarying vec3 vBake;\nvarying vec4 vRuv;\nvarying vec3 vWp;\nuniform mat4 uTexMat;\n'+
      sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n vec4 wpp=modelMatrix*vec4(transformed,1.0); vWp=wpp.xyz; vRuv=uTexMat*wpp; vBake=bake;');
    sh.fragmentShader='uniform float uWet;\nuniform sampler2D uRefl;\nuniform float uReflRoad;\nvarying vec3 vBake;\nvarying vec4 vRuv;\nvarying vec3 vWp;\n'+
      sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        diffuseColor.rgb*=mix(1.0,${(1-wetDark).toFixed(3)},uWet);
        totalEmissiveRadiance+=vBake*diffuseColor.rgb*${gain.toFixed(3)};
        ${refl?`
        if(uReflRoad>0.5 && uWet>0.01){
          vec2 ruv=vRuv.xy/vRuv.w;
          vec2 cell=floor(vWp.xz*vec2(2.3,0.9));
          float n1=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453)-0.5;
          float n2=fract(sin(dot(floor(vWp.xz*vec2(0.7,3.1)),vec2(39.34,11.13)))*24634.63)-0.5;
          ruv.x+=(n1*0.6+n2*0.4)*0.006;
          vec3 rc=vec3(0.0);
          for(int k=-1;k<11;k++){ rc+=texture2D(uRefl,ruv+vec2((n2)*0.004*float(k),float(k)*0.026)).rgb; }
          rc*=1.0/12.0;
          rc=max(rc-vec3(0.06),vec3(0.0));
          float cv=clamp(normalize(cameraPosition-vWp).y,0.0,1.0);
          float fres=0.15+0.85*pow(1.0-cv,4.0);
          totalEmissiveRadiance+=rc*uWet*0.42*fres;
        }`:''}`);
  };
  m.customProgramCacheKey=()=>key+(refl?'R':'')+gain+wetDark;
  return m;
}
export let MAT:any={};
export function makeMaterials(){
  TEX.asphalt.repeat.set(1,1);
  MAT.road=bakedMat({color:[0.13,0.13,0.135],map:TEX.asphalt,rough:0.9,refl:true,key:'road'});
  MAT.concrete=bakedMat({color:[0.28,0.28,0.27],map:TEX.concrete,rough:0.95,wetDark:0.3,key:'conc'});
  MAT.tile=bakedMat({color:[0.62,0.6,0.55],map:TEX.tile,rough:0.6,wetDark:0,key:'tile'});
  MAT.tunnelUpper=bakedMat({color:[0.13,0.13,0.13],map:TEX.concrete,rough:0.95,wetDark:0,key:'tup'});
  MAT.mark=bakedMat({color:[0.85,0.85,0.82],rough:0.7,wetDark:0.2,key:'mark'});
  MAT.markDash=bakedMat({color:[0.85,0.85,0.82],map:TEX.dash,rough:0.7,wetDark:0.2,alphaTest:0.5,key:'mdash'});
  MAT.markYellow=bakedMat({color:[0.95,0.55,0.08],rough:0.7,wetDark:0.2,key:'my'});
  MAT.rail=bakedMat({color:[0.12,0.13,0.14],rough:0.5,metal:0.3,wetDark:0,key:'rail'});
  MAT.darkConcrete=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.05,0.05,0.05),roughness:1});
  MAT.metal=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.12,0.12,0.13),roughness:0.6,metalness:0.4,side:THREE.DoubleSide});
  MAT.joint=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.25,0.25,0.27),roughness:0.35,metalness:0.8});
  MAT.lampHead={};
  for(const k in LAMP_COLORS){const c=LAMP_COLORS[k];MAT.lampHead[k]=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(c[0]*9,c[1]*9,c[2]*9)});}
  MAT.tunnelLamp={};
  for(const k in LAMP_COLORS){const c=LAMP_COLORS[k];MAT.tunnelLamp[k]=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(c[0]*7,c[1]*7,c[2]*7)});}
  MAT.groundLamp=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(5,2.6,1.0)});
  MAT.redBlink=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(6,0.2,0.1)});
  MAT.redSteady=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(4,0.12,0.06)});
  MAT.green=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0.3,3,0.8)});
  MAT.cableLight=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(6,6,5.4)});
  MAT.tower=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0.20,0.22,0.26)});
  MAT.cable=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0.14,0.15,0.17)});
  MAT.soundWall=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0.05,0.07,0.08),transparent:true,opacity:0.45,side:THREE.DoubleSide,depthWrite:false});
  MAT.signs=TEX.signs.map(t=>new THREE.MeshBasicMaterial({map:t,color:new THREE.Color().setRGB(1.25,1.25,1.25)}));
  MAT.signBack=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.1,0.1,0.11),roughness:0.8});
  MAT.leds=TEX.leds.map(t=>new THREE.MeshBasicMaterial({map:t,color:new THREE.Color().setRGB(2.2,2.2,2.2)}));
  MAT.ledRain=new THREE.MeshBasicMaterial({map:TEX.ledRain,color:new THREE.Color().setRGB(2.2,2.2,2.2)});
  MAT.ledTunnel=new THREE.MeshBasicMaterial({map:TEX.ledTunnel,color:new THREE.Color().setRGB(2.2,2.2,2.2)});
  MAT.speed=new THREE.MeshBasicMaterial({map:TEX.speed,transparent:true,alphaTest:0.4,color:new THREE.Color().setRGB(0.6,0.6,0.6)});
  MAT.exitSign=new THREE.MeshBasicMaterial({map:TEX.exitSign,color:new THREE.Color().setRGB(1.8,1.8,1.8)});
  MAT.billboards=TEX.billboards.map(t=>new THREE.MeshBasicMaterial({map:t,color:new THREE.Color().setRGB(2.4,2.4,2.4)}));
  MAT.plates={};for(const k in TEX.tunnelPlates) MAT.plates[k]=new THREE.MeshBasicMaterial({map:TEX.tunnelPlates[k],color:new THREE.Color().setRGB(0.9,0.85,0.8)});
  MAT.reflector=new THREE.ShaderMaterial({
    uniforms:{uCol:{value:new THREE.Color()}},
    vertexShader:`varying float vD; varying vec3 vC; void main(){ vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0); vD=length(wp.xyz-cameraPosition);
      #ifdef USE_INSTANCING_COLOR
      vC=instanceColor;
      #else
      vC=vec3(1.0);
      #endif
      gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader:`varying float vD; varying vec3 vC; void main(){ float k=smoothstep(180.0,8.0,vD); gl_FragColor=vec4(vC*(0.15+k*3.2),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
}

/* building shader (instanced boxes, procedural windows) */
export const BUILD_VS=`
varying vec3 vObj; varying vec3 vN; varying vec3 vSeed; varying vec3 vSize; varying vec3 vW;
void main(){
  vec3 sc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
  vSize=sc; vObj=position*sc; vN=normal;
  #ifdef USE_INSTANCING_COLOR
  vSeed=instanceColor;
  #else
  vSeed=vec3(0.5);
  #endif
  vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0); vW=wp.xyz;
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;
export const BUILD_FS=`
uniform float uTime; uniform vec3 uHazeCol; uniform float uHaze; uniform float uAppear; uniform float uWinGain; uniform float uFar;
varying vec3 vObj; varying vec3 vN; varying vec3 vSeed; varying vec3 vSize; varying vec3 vW;
float hash13(vec3 p3){ p3=fract(p3*0.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec3 n=normalize(vN);
  float style=floor(vSeed.z*3.999);
  float seed=floor(vSeed.x*997.0);
  float litFrac=vSeed.y;
  vec3 col;
  float d=length(vW-cameraPosition);
  if(n.y>0.5){
    col=vec3(0.010,0.010,0.013);
    if(vSize.y>60.0){ vec2 q=abs(vObj.xz)/(vSize.xz*0.5); float e=max(q.x,q.y); col+=vec3(0.03,0.025,0.02)*step(0.9,e); }
  } else if(n.y<-0.5){ col=vec3(0.0); }
  else {
    float hc; float fwid; float face;
    if(abs(n.x)>0.5){ hc=vObj.z*sign(n.x); fwid=vSize.z; face=n.x>0.0?1.0:2.0; }
    else { hc=-vObj.x*sign(n.z); fwid=vSize.x; face=n.z>0.0?3.0:4.0; }
    hc+=fwid*0.5;
    vec2 cs = style<0.5? vec2(3.2,3.7) : style<1.5? vec2(3.6,2.9) : style<2.5? vec2(1.8,4.0) : vec2(2.6,3.3);
    vec2 g=vec2(hc,vObj.y-1.2)/cs;
    vec2 id=floor(g); vec2 f=fract(g);
    vec2 fw=fwidth(g);
    float pxs=max(fw.x,fw.y);
    vec2 lo = style<0.5? vec2(0.03,0.28) : style<1.5? vec2(0.18,0.22) : style<2.5? vec2(0.08,0.12) : vec2(0.15,0.25);
    vec2 hi = style<0.5? vec2(0.97,0.86) : style<1.5? vec2(0.82,0.78) : style<2.5? vec2(0.92,0.92) : vec2(0.85,0.80);
    vec2 aa=fw*0.8+0.001;
    float win=smoothstep(lo.x-aa.x,lo.x+aa.x,f.x)*smoothstep(hi.x+aa.x,hi.x-aa.x,f.x)*smoothstep(lo.y-aa.y,lo.y+aa.y,f.y)*smoothstep(hi.y+aa.y,hi.y-aa.y,f.y);
    float cov=(hi.x-lo.x)*(hi.y-lo.y);
    float r1=hash13(vec3(id.x,id.y,seed+face*7.13));
    float r2=hash13(vec3(floor(id.x/5.0),id.y,seed*0.37+face));
    float r3=hash13(vec3(id.y,id.x,seed+3.1));
    float lit; vec3 wc;
    if(style<0.5){ lit=step(r2,litFrac)*step(0.12,r1); wc=mix(vec3(0.72,0.84,1.0),vec3(1.0,0.9,0.75),step(0.6,r3)); }
    else if(style<1.5){ lit=step(r1,litFrac*0.8); wc= r3<0.72? vec3(1.0,0.64,0.34) : (r3<0.9? vec3(1.0,0.85,0.68) : vec3(0.45,0.6,1.0)); }
    else if(style<2.5){ lit=step(r1,litFrac*0.5); wc=vec3(0.8,0.88,1.0); }
    else { lit=step(r1,litFrac); wc= r3<0.55? vec3(1.0,0.74,0.45) : r3<0.8? vec3(0.75,0.88,1.0) : r3<0.9? vec3(1.0,0.6,0.62) : vec3(0.65,0.95,0.8); }
    float inten=(0.55+0.8*r3)*uWinGain;
    if(vObj.y<1.2 || vObj.y>vSize.y-1.0) { lit=0.0; win*=0.0; }
    vec3 facade= (style>1.5&&style<2.5) ? vec3(0.007,0.010,0.015) : vec3(0.013,0.012,0.013);
    vec3 dark=vec3(0.006,0.008,0.012);
    vec3 wcol=mix(dark,wc*inten,lit)*(0.8+0.4*f.y);
    vec3 detail=mix(facade,wcol,win);
    vec3 avg=facade*(1.0-cov)+cov*(dark*(1.0-litFrac*0.6)+wc*(0.95*uWinGain)*litFrac*0.55);
    float farK=smoothstep(0.3*uFar,1.0*uFar,pxs);
    col=mix(detail,avg,farK);
    if(style>0.5&&style<1.5&&face<1.5){
      float cl=smoothstep(0.07+aa.x,0.07,abs(f.x-0.5))*smoothstep(0.09+aa.y,0.09,abs(f.y-0.88));
      col+=mix(vec3(1.0,0.95,0.85)*2.2*cl,vec3(1.0,0.95,0.85)*0.03,farK);
    }
    if(vSeed.y>0.8 && vSize.y>70.0){ float e=min(hc,fwid-hc); col+=vec3(0.7,0.85,1.0)*2.2*smoothstep(0.5,0.0,e)*(0.7+0.3*sin(uTime*0.4+seed)); }
    if(vSize.y>90.0 && vObj.y>vSize.y-3.0 && vSeed.x>0.5) col+=vec3(1.0,0.88,0.7)*1.1;
    col+=vec3(0.05,0.03,0.015)*exp(-vObj.y/6.0);
  }
  float fog=1.0-exp(-pow(d*uHaze,2.0));
  col=mix(col,uHazeCol,fog);
  col=mix(uHazeCol*min(1.0,d/400.0),col,uAppear);
  gl_FragColor=vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function buildingMat(haze=FOG_DENS,winGain=0.7,far=1){
  return new THREE.ShaderMaterial({
    uniforms:{uTime:U.time,uHazeCol:U.hazeCol,uHaze:{value:haze},uAppear:{value:1},uWinGain:{value:winGain},uFar:{value:far}},
    vertexShader:BUILD_VS,fragmentShader:BUILD_FS
  });
}
