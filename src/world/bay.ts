import * as THREE from 'three';
import { CH, SPC, STEP, U } from '../core/globals';
import { R, V3, clamp, rr } from '../core/util';
import { animated } from './chunks';
import { GEO, propM, tubeAlong, unitBox } from './geometry';
import { MAT } from './materials';
import { S } from './path';
import { makePoints } from './points';

export function cableY(sec,ls,deckY){
  if(ls<sec.a1||ls>sec.a2) return null;
  const top=78, low=3.2;
  if(ls<sec.t1){ const x=(ls-sec.a1)/(sec.t1-sec.a1); return deckY+1.5+(top-1.5)*Math.pow(x,1.7); }
  if(ls>sec.t2){ const x=(sec.a2-ls)/(sec.a2-sec.t2); return deckY+1.5+(top-1.5)*Math.pow(x,1.7); }
  const x=(ls-sec.mid)/((sec.t2-sec.t1)/2); return deckY+low+(top-low)*x*x;
}
export function buildBay(g,own,sec,ls0,i0,i1){
  // towers
  for(const t of [sec.t1,sec.t2]){
    if(t>=ls0 && t<ls0+CH){
      const a=S(Math.round((sec.start+t)/STEP)); const dy=a.y;
      const parts=[propM(a,-13.4,0,3.6,dy+78,4.6,0,true).clone(),propM(a,13.4,0,3.6,dy+78,4.6,0,true).clone(),
        propM(a,0,dy-6.5,30.4,3.2,3.8,0,true).clone(),propM(a,0,dy+36,27,2.6,3.0,0,true).clone(),propM(a,0,dy+72,27,4.2,3.4,0,true).clone()];
      const im=new THREE.InstancedMesh(unitBox,MAT.tower,parts.length); parts.forEach((M,k)=>im.setMatrixAt(k,M)); im.matrixAutoUpdate=false; g.add(im);
      const rl=[propM(a,-13.4,dy+78.6,1.2,1.2,1.2,0,true).clone(),propM(a,13.4,dy+78.6,1.2,1.2,1.2,0,true).clone()];
      const rm=new THREE.InstancedMesh(GEO.dot,MAT.redBlink,2); rl.forEach((M,k)=>rm.setMatrixAt(k,M)); rm.matrixAutoUpdate=false; g.add(rm);
      // tower floodlight glow strips
      const fl=[propM(a,-13.4,dy+2,3.7,0.5,4.7,0,true).clone(),propM(a,13.4,dy+2,3.7,0.5,4.7,0,true).clone()];
      const fm=new THREE.InstancedMesh(unitBox,MAT.cableLight,2); fl.forEach((M,k)=>fm.setMatrixAt(k,M)); fm.matrixAutoUpdate=false; g.add(fm);
    }
  }
  // cables
  const lights=[],susp=[];
  for(const side of [-1,1]){
    const pts=[];
    for(let j=0;j<=SPC;j+=2){
      const a=S(i0+j); const ls=a.s-sec.start; const cy=cableY(sec,ls,a.y); if(cy===null) continue;
      pts.push(new V3(a.x+a.rx*13.4*side,cy,a.z+a.rz*13.4*side));
      if(j%4===0) lights.push(propM(a,13.4*side,cy-a.y+0.9,0.55,0.55,0.55).clone());
      if(j%5===0 && cy-a.y>3) susp.push(propM(a,13.4*side,0.9,0.12,cy-a.y-0.9,0.12).clone());
    }
    if(pts.length>1){ const tg=tubeAlong(pts,0.45); own.push(tg); const m=new THREE.Mesh(tg,MAT.cable); m.matrixAutoUpdate=false; g.add(m); }
  }
  if(lights.length){ const lm=new THREE.InstancedMesh(GEO.sphere,MAT.cableLight,lights.length); lights.forEach((M,k)=>lm.setMatrixAt(k,M)); lm.matrixAutoUpdate=false; g.add(lm); }
  if(susp.length){ const sm=new THREE.InstancedMesh(unitBox,MAT.cable,susp.length); susp.forEach((M,k)=>sm.setMatrixAt(k,M)); sm.matrixAutoUpdate=false; g.add(sm); }
  // ships
  if(ls0>sec.a1 && ls0<sec.a2 && R()<0.5){
    const a=S(i0+25); const side=R()<0.5?-1:1; const u=side*rr(250,1100);
    const cx=a.x+a.rx*u, cz=a.z+a.rz*u;
    const pts=[],cols=[];
    const n=6+((R()*6)|0); const ang=R()*6.28;
    for(let k=0;k<n;k++){ const t=(k/(n-1)-0.5)*rr(40,90); pts.push(cx+Math.cos(ang)*t,rr(3,7),cz+Math.sin(ang)*t); cols.push(1.0,0.82,0.55); }
    pts.push(cx,14,cz); cols.push(1,1,1);
    pts.push(cx+Math.cos(ang)*30,9,cz+Math.sin(ang)*30); cols.push(1,0.1,0.05);
    g.add(makePoints(pts,cols,5));
  }
  // ferris wheel near the far shore
  if(ls0===Math.floor(sec.mid/100)*100){
    const a=S(i0+25); const u=-(980); const cx=a.x+a.rx*u, cz=a.z+a.rz*u;
    g.add(makeFerris(cx,cz,-a.h+0.4));
  }
  // cranes at approaches
  if(ls0===Math.max(100,Math.floor((sec.a1-350)/100)*100) ){
    for(let k=0;k<3;k++){ const a=S(i0+k*15); g.add(makeCrane(a,-rr(260,420),R()*6.28)); }
  }
}

export function makeCrane(a,u,yaw){
  const grp=new THREE.Group();
  const x=a.x+a.rx*u, z=a.z+a.rz*u;
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,yaw,0));
  const parts=[[[-8,0,-6],[1.2,40,1.2]],[[8,0,-6],[1.2,40,1.2]],[[-8,0,6],[1.2,40,1.2]],[[8,0,6],[1.2,40,1.2]],[[0,40,0],[18,3,14]],[[0,44,-20],[3,2.5,90]]];
  const im=new THREE.InstancedMesh(unitBox,MAT.tower,parts.length);
  parts.forEach(([o,sz],k)=>{const p=new V3(...o).applyQuaternion(q);im.setMatrixAt(k,new THREE.Matrix4().compose(new V3(x+p.x,p.y,z+p.z),q,new V3(...sz)));});
  grp.add(im);
  const rp=[];for(const o of [[0,46.6,-64],[0,46.6,24],[0,43.5,0]]){const p=new V3(...o).applyQuaternion(q);rp.push(x+p.x,p.y,z+p.z);}
  grp.add(makePoints(rp,[1,0.1,0.05,1,0.1,0.05,1,0.1,0.05],7,true));
  return grp;
}
export function makeFerris(cx,cz,yaw){
  const grp=new THREE.Group(); grp.position.set(cx,0,cz); grp.rotation.y=yaw;
  const Rw=52, Hc=64;
  const wheel=new THREE.Group(); wheel.position.y=Hc; grp.add(wheel);
  const pos=[],ang=[];
  const seg=128;
  for(const zz of [-2.5,2.5]) for(let i=0;i<seg;i++){const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2;pos.push(Math.cos(a0)*Rw,Math.sin(a0)*Rw,zz,Math.cos(a1)*Rw,Math.sin(a1)*Rw,zz);ang.push(a0,a1);}
  for(let i=0;i<32;i++){const a=i/32*Math.PI*2;pos.push(0,0,0,Math.cos(a)*Rw,Math.sin(a)*Rw,0);ang.push(a,a);}
  const gm=new THREE.BufferGeometry(); gm.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); gm.setAttribute('ang',new THREE.Float32BufferAttribute(ang,1));
  const mat=new THREE.ShaderMaterial({uniforms:{uTime:U.time},vertexShader:`attribute float ang; varying float vA; varying float vR; void main(){vA=ang; vR=length(position.xy); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform float uTime; varying float vA; varying float vR;
      vec3 hsv(float h){ vec3 k=clamp(abs(fract(h+vec3(0.,2.,1.)/3.)*6.-3.)-1.,0.,1.); return k; }
      void main(){ float m=mod(floor(uTime/12.0),3.0); vec3 c;
        if(m<0.5) c=hsv(vA/6.2831+uTime*0.05);
        else if(m<1.5) c=mix(vec3(1.0,0.85,0.6),vec3(0.4,0.6,1.0),step(0.5,fract(vA*2.546+uTime*0.3)));
        else c=hsv(vR/60.0-uTime*0.1);
        gl_FragColor=vec4(c*2.6,1.0); }`});
  wheel.add(new THREE.LineSegments(gm,mat));
  const legs=new THREE.InstancedMesh(unitBox,MAT.tower,2);
  legs.setMatrixAt(0,new THREE.Matrix4().compose(new V3(-12,0,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,-0.18)),new V3(1.5,Hc+2,1.5)));
  legs.setMatrixAt(1,new THREE.Matrix4().compose(new V3(12,0,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,0.18)),new V3(1.5,Hc+2,1.5)));
  grp.add(legs);
  grp.userData.tick=(t)=>{wheel.rotation.z=t*0.02;};
  animated.push(grp);
  return grp;
}
