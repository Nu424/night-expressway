import * as THREE from 'three';
import { STEP, U } from '../core/globals';
import { R, V3, clamp, pick, rr } from '../core/util';
import { scene } from '../render/renderer';
import { cars, ego } from '../traffic/traffic';
import { inst, unitBox } from './geometry';
import { buildingMat } from './materials';
import { S, sections } from './path';
import { makePoints, pointsMat } from './points';

export let sky, ground, skyline, skylineLights, planes;
export const WATER_N=48;
export function makeWorld(){
  sky=new THREE.Mesh(new THREE.SphereGeometry(8500,48,24),new THREE.ShaderMaterial({
    uniforms:{uTime:U.time,uRain:U.rain,uDawn:U.dawn},side:THREE.BackSide,depthWrite:false,fog:false,
    vertexShader:`varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
    fragmentShader:`uniform float uTime; uniform float uRain; uniform float uDawn; varying vec3 vDir;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
      void main(){ vec3 d=normalize(vDir); float e=d.y;
        vec3 zen=vec3(0.0025,0.0035,0.010), hor=vec3(0.085,0.058,0.062);
        float t=pow(clamp(e,0.0,1.0),0.42);
        vec3 c=mix(hor,zen,t);
        float cl=0.0;
        if(e>0.0){
          vec2 uv=d.xz/(e+0.12)*1.3+vec2(uTime*0.004,uTime*0.002);
          float n=fbm(uv);
          cl=smoothstep(0.42-uRain*0.32,0.88,n);
          vec3 cc=mix(vec3(0.075,0.05,0.045),vec3(0.03,0.025,0.03),t)*(1.0+uRain*0.5);
          c=mix(c,cc,cl*0.85);
          vec2 sg=floor(d.xz/(e+0.3)*260.0);
          float st=step(0.9975,h21(sg))*smoothstep(0.15,0.6,e)*(1.0-cl)*(1.0-uRain)*clamp(1.0-uDawn*1.6,0.0,1.0);
          c+=vec3(0.5,0.55,0.7)*st*0.25;
          // 月: 薄雲ごしににじむ
          vec3 md=normalize(vec3(-0.46,0.36,-0.81)); float ma=dot(d,md);
          float disc=smoothstep(0.99994,0.99997,ma); float halo=exp(-(1.0-ma)*900.0)*0.10+exp(-(1.0-ma)*90.0)*0.035;
          c+=vec3(1.0,0.96,0.86)*(disc*0.9*(1.0-cl*0.85)+halo*(1.0-cl*0.4))*(1.0-uRain)*(1.0-uDawn*0.7);
          c+=vec3(0.05,0.032,0.022)*cl*(1.0-t)*0.6;
        }
        c=mix(c,mix(hor*1.25,vec3(0.05,0.045,0.05),t),uRain*0.55);
        if(uDawn>0.001){   // 夜明け: 東の地平から色づき、天頂は深い青へ
          float az=dot(normalize(d.xz+vec2(1e-5)),normalize(vec2(0.55,-0.83)))*0.5+0.5;
          vec3 dz=mix(vec3(0.015,0.035,0.10),vec3(0.13,0.26,0.50),uDawn);
          vec3 dh=mix(vec3(0.10,0.07,0.12),vec3(0.95,0.60,0.40),uDawn)*mix(0.45,1.0,az*az);
          vec3 dc=mix(dh,dz,pow(clamp(e,0.0,1.0),0.5));
          dc=mix(dc,dc*0.55+dh*0.25,cl*0.7);
          dc=mix(dc,vec3(dot(dc,vec3(0.33)))*0.8,uRain*0.7);
          c=mix(c,dc,smoothstep(0.0,0.6,uDawn));
        }
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder=-10; sky.frustumCulled=false; scene.add(sky);

  const wpts=[]; for(let i=0;i<WATER_N;i++) wpts.push(new V3(0,0,-1));
  ground=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000,1,1).rotateX(-Math.PI/2),new THREE.ShaderMaterial({
    uniforms:{uTime:U.time,uWater:{value:wpts},uWaterN:{value:0},uRefl:U.reflTex,uTexMat:U.texMat,uReflWater:U.reflWater,uHazeCol:U.hazeCol,uHaze:U.haze,uWet:U.wet,uRain:U.rain,uDawn:U.dawn},
    vertexShader:`uniform mat4 uTexMat; varying vec3 vW; varying vec4 vR; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vR=uTexMat*wp; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader:`uniform float uTime; uniform vec3 uWater[${WATER_N}]; uniform int uWaterN; uniform sampler2D uRefl; uniform float uReflWater; uniform vec3 uHazeCol; uniform float uHaze; uniform float uWet; uniform float uRain; uniform float uDawn;
      varying vec3 vW; varying vec4 vR;
      float h12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y); }
      float glow(vec2 d, float r, float px){ float rr=max(r,px*0.9); return exp(-dot(d,d)/(rr*rr))*(r*r)/(rr*rr); }
      void main(){
        vec2 p=vW.xz; float dist=length(vW-cameraPosition);
        float wm=0.0;
        for(int i=0;i<${WATER_N};i++){ if(i>=uWaterN) break; vec3 w=uWater[i]; float l=length(p-w.xy); wm=max(wm,1.0-smoothstep(w.z-160.0,w.z,l)); }
        float px=max(fwidth(p.x),fwidth(p.y));
        // ---- land
        vec2 q=mat2(0.94,-0.34,0.34,0.94)*p;
        vec2 bs=vec2(110.0,86.0);
        vec2 cf=mod(q,bs);
        float dz=min(cf.y,bs.y-cf.y), dx=min(cf.x,bs.x-cf.x);
        float street=1.0-smoothstep(4.5,5.5+px,min(dx,dz));
        vec3 land=vec3(0.009,0.008,0.009)+street*vec3(0.03,0.022,0.015);
        vec3 lampC=vec3(1.0,0.55,0.22);
        // lamps along streets
        vec2 la=vec2(mod(q.x,30.0)-15.0, min(abs(cf.y-5.5),abs(cf.y-bs.y+5.5)));
        vec2 lb=vec2(min(abs(cf.x-5.5),abs(cf.x-bs.x+5.5)), mod(q.y,30.0)-15.0);
        vec3 L=lampC*(glow(la,0.9,px)+glow(lb,0.9,px))*2.0;
        // lamp pools
        L+=lampC*0.05*(exp(-dot(la,la)/60.0)+exp(-dot(lb,lb)/60.0));
        // moving cars along streets
        float sidA=floor((q.y+bs.y*0.5)/bs.y), sidB=floor((q.x+bs.x*0.5)/bs.x);
        float yy=mod(q.y+bs.y*0.5,bs.y)-bs.y*0.5, xx=mod(q.x+bs.x*0.5,bs.x)-bs.x*0.5;
        float spA=7.0+6.0*h12(vec2(sidA,3.1)), spB=7.0+6.0*h12(vec2(sidB,7.7));
        float c1=mod(q.x+uTime*spA+h12(vec2(sidA,1.0))*90.0,63.0)-31.5;
        float c2=mod(q.x-uTime*spA*0.9+h12(vec2(sidA,2.0))*90.0,51.0)-25.5;
        float c3=mod(q.y+uTime*spB+h12(vec2(sidB,1.0))*90.0,57.0)-28.5;
        float c4=mod(q.y-uTime*spB*0.9+h12(vec2(sidB,2.0))*90.0,71.0)-35.5;
        L+=vec3(1.0,0.12,0.05)*glow(vec2(c1,yy+1.8),0.6,px)*2.2+vec3(1.0,0.95,0.85)*glow(vec2(c2,yy-1.8),0.6,px)*2.6;
        L+=vec3(1.0,0.12,0.05)*glow(vec2(xx+1.8,c3),0.6,px)*2.2+vec3(1.0,0.95,0.85)*glow(vec2(xx-1.8,c4),0.6,px)*2.6;
        // houses' windows
        vec2 hc=floor(q/7.0); vec2 hf=fract(q/7.0)-0.5;
        float hr=h12(hc*1.37);
        float inBlock=1.0-street;
        L+=mix(vec3(1.0,0.7,0.4),vec3(0.7,0.85,1.0),step(0.7,h12(hc+9.1)))*step(hr,0.16)*glow(hf*7.0,0.8,px)*0.6*inBlock;
        land+=L;
        land*=mix(1.0,0.75,uWet);
        land+=vec3(0.035,0.04,0.052)*uDawn*(0.6+0.4*street);
        // ---- water
        vec3 water=vec3(0.003,0.005,0.009);
        vec3 V=normalize(cameraPosition-vW);
        float F=0.03+0.97*pow(1.0-clamp(V.y,0.0,1.0),5.0);
        float n1=vn(p*0.06+vec2(uTime*0.11,uTime*0.07)), n2=vn(p*0.06*1.7-vec2(uTime*0.09,-uTime*0.12));
        vec2 off=(vec2(n1,n2)-0.5)*0.05*clamp(140.0/dist,0.08,1.0);
        if(uReflWater>0.5){
          vec2 ruv=vR.xy/vR.w+off*vec2(0.3,1.0);
          vec3 rc=vec3(0.0);
          for(int k=0;k<6;k++) rc+=texture2D(uRefl,ruv+vec2(0.0,float(k)*0.007)).rgb;
          water+=rc/6.0*(0.25+F*1.1);
        } else water+=uHazeCol*F*0.9;
        water+=vec3(0.02,0.025,0.03)*pow(max(n1*n2,0.0),3.0)*F;
        water+=vec3(0.10,0.15,0.24)*uDawn*(0.25+F);
        // shore lights
        float shore=smoothstep(0.0,0.3,wm)*smoothstep(0.75,0.35,wm);
        vec3 col=mix(land,water,smoothstep(0.35,0.55,wm));
        col+=vec3(1.0,0.6,0.25)*shore*0.25;
        float fog=1.0-exp(-pow(dist*uHaze,2.0));
        col=mix(col,uHazeCol,fog);
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  ground.frustumCulled=false; scene.add(ground);

  // skyline ring
  const N=1700, mats=[], cols=[];
  const clusters=[]; for(let i=0;i<7;i++) clusters.push(R()*Math.PI*2);
  for(let i=0;i<N;i++){
    const ang=R()*Math.PI*2; const r=rr(1950,4600);
    let near=0; for(const c of clusters){ let da=Math.abs(((ang-c+Math.PI*3)%(Math.PI*2))-Math.PI); near=Math.max(near,1-da/0.22); }
    const h=near>0? rr(40,110)+near*rr(60,200) : 15*Math.pow(10,R()*0.9);
    const w=rr(25,70), d=rr(25,70);
    mats.push(new THREE.Matrix4().compose(new V3(Math.cos(ang)*r,0,Math.sin(ang)*r),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,R()*3,0)),new V3(w,h,d)));
    cols.push([R(),rr(0.35,0.9),((h>100?(R()<0.6?2:0):pick([0,1,1,3]))+0.5)/4]);
  }
  skyline=inst(unitBox,buildingMat(0.00016,1.4,3.5),mats,cols); skyline.frustumCulled=false; scene.add(skyline);
  // skyline red aviation lights + generic broadcast towers
  const rp=[],rc=[];
  mats.forEach(m=>{const p=new V3(),q=new THREE.Quaternion(),s=new V3();m.decompose(p,q,s); if(s.y>90){rp.push(p.x,s.y+2,p.z);rc.push(1,0.08,0.04);}});
  for(let k=0;k<2;k++){
    const ang=clusters[k]+0.1, r=3000+k*600; const x=Math.cos(ang)*r, z=Math.sin(ang)*r;
    const hgt=k===0?330:600;
    for(let j=0;j<60;j++){ const t=j/59; const yy=t*hgt; const w=(1-t)*(k===0?40:18)+2;
      for(const [ox,oz] of [[-1,-1],[1,-1],[1,1],[-1,1]]){ rp.push(x+ox*w*0.5,yy,z+oz*w*0.5); if(k===0) rc.push(1.0,0.42,0.12); else rc.push(0.55,0.75,1.0); } }
    rp.push(x,hgt+4,z); rc.push(1,0.1,0.05);
  }
  skylineLights=makePoints(rp,rc,4,false);
  skylineLights.material=pointsMat(false);
  scene.add(skylineLights);
  // planes
  planes=[];
  const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(4*4*3),3));
  pg.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(4*4*3),3)); pg.setAttribute('size',new THREE.Float32BufferAttribute(new Float32Array(16).fill(3.2),1));
  const pp=new THREE.Points(pg,pointsMat(false)); pp.frustumCulled=false; scene.add(pp);
  for(let i=0;i<4;i++) planes.push({x:0,y:0,z:0,vx:0,vz:0,ph:R()*10,alive:false});
  planes.mesh=pp;
}
export function respawnPlane(pl,cx,cz){
  const a=R()*Math.PI*2, r=rr(2500,5000);
  pl.x=cx+Math.cos(a)*r; pl.z=cz+Math.sin(a)*r; pl.y=rr(500,1300);
  const h=a+Math.PI+rr(-0.6,0.6); const sp=rr(60,85); pl.vx=Math.cos(h)*sp; pl.vz=Math.sin(h)*sp; pl.vy=-rr(0,2.5); pl.alive=true;
}
export function waterPoints(){
  const arr=ground.material.uniforms.uWater.value; let n=0;
  const cand=[];
  for(const sec of sections){ if(sec.type!=='bay') continue; if(sec.end<ego.s-4000||sec.start>ego.s+4000) continue;
    for(let ls=sec.a1-150; ls<=sec.a2+150; ls+=110){ const s=sec.start+ls; const a=S(Math.round(s/STEP)); if(!a) continue; cand.push([a.x,a.z,Math.abs(s-ego.s)]); } }
  cand.sort((p,q)=>p[2]-q[2]);
  for(const c of cand){ if(n>=WATER_N) break; arr[n].set(c[0],c[1],1700); n++; }
  ground.material.uniforms.uWaterN.value=n;
  return cand.length && cand[0][2]<3200;
}
