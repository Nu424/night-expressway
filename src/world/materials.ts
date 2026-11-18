import * as THREE from 'three';
import BUILD_VS from '../shaders/building.vert?raw';
import BUILD_FS from '../shaders/building.frag?raw';
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
    sh.fragmentShader='float wetH(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\nfloat wetNoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(wetH(i),wetH(i+vec2(1.0,0.0)),f.x),mix(wetH(i+vec2(0.0,1.0)),wetH(i+vec2(1.0,1.0)),f.x),f.y); }\nuniform float uWet;\nuniform sampler2D uRefl;\nuniform float uReflRoad;\nvarying vec3 vBake;\nvarying vec4 vRuv;\nvarying vec3 vWp;\n'+
      sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        diffuseColor.rgb*=mix(1.0,${(1-wetDark).toFixed(3)},uWet);
        totalEmissiveRadiance+=vBake*diffuseColor.rgb*${gain.toFixed(3)};
        ${refl?`
        if(uReflRoad>0.5 && uWet>0.01){
          // 濡れた路面: 鏡像を手前方向へ引き伸ばして光条にする。画素ごとに採取位置をずらし、縞を粒状感に変える。
          vec2 ruv=vRuv.xy/vRuv.w;
          float n1=wetNoise(vWp.xz*1.9), n2=wetNoise(vWp.xz*0.21+vec2(7.3,2.1));
          float puddle=smoothstep(0.50,0.74,n2);
          float rough=mix(1.0,0.22,puddle);
          float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
          vec3 rc=vec3(0.0); float ws=0.0;
          for(int k=0;k<8;k++){ float tt=(float(k)+jit)/8.0; float w=1.0-tt*0.8;
            rc+=texture2D(uRefl,ruv+vec2((n1-0.5)*0.012*rough*(0.3+tt),tt*0.20*rough)).rgb*w; ws+=w; }
          rc=max(rc/ws-vec3(0.035),vec3(0.0));
          float cv=clamp(normalize(cameraPosition-vWp).y,0.0,1.0);
          float fres=0.12+0.88*pow(1.0-cv,4.0);
          totalEmissiveRadiance+=rc*uWet*(0.5+0.7*puddle)*fres;
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
  MAT.signs=TEX.signs.map(t=>new THREE.MeshBasicMaterial({map:t,color:new THREE.Color().setRGB(0.95,0.95,0.95)}));
  MAT.signBack=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.1,0.1,0.11),roughness:0.8});
  MAT.leds=TEX.leds.map(t=>new THREE.MeshBasicMaterial({map:t,color:new THREE.Color().setRGB(2.2,2.2,2.2)}));
  MAT.ledRain=new THREE.MeshBasicMaterial({map:TEX.ledRain,color:new THREE.Color().setRGB(2.2,2.2,2.2)});
  MAT.ledTunnel=new THREE.MeshBasicMaterial({map:TEX.ledTunnel,color:new THREE.Color().setRGB(2.2,2.2,2.2)});
  MAT.speed=new THREE.MeshBasicMaterial({map:TEX.speed,transparent:true,alphaTest:0.4,color:new THREE.Color().setRGB(0.16,0.16,0.16)});
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
    fragmentShader:`varying float vD; varying vec3 vC; void main(){ float k=smoothstep(180.0,8.0,vD); gl_FragColor=vec4(vC*(0.05+k*k*0.9),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
}

/* 建物シェーダ（インスタンス化した箱に、手続き的な窓を描く） */
export function buildingMat(haze=FOG_DENS,winGain=0.7,far=1){
  return new THREE.ShaderMaterial({
    uniforms:{uTime:U.time,uHazeCol:U.hazeCol,uHaze:{value:haze},uAppear:{value:1},uWinGain:{value:winGain},uFar:{value:far},uCityLit:U.cityLit,uCityGain:U.cityGain,uDawn:U.dawn},
    vertexShader:BUILD_VS,fragmentShader:BUILD_FS
  });
}
