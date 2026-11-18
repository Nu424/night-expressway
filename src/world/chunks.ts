import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sound } from '../audio/sound';
import { CH, SPC, STEP, U } from '../core/globals';
import { state } from '../core/state';
import { R, SEED, V3, clamp, mulberry32, pick, rr } from '../core/util';
import { scene } from '../render/renderer';
import { panel } from '../ui/controls';
import { buildBay } from './bay';
import { ground } from './environment';
import { GEO, centerBox, flatStrips, inst, lin, polyStrips, propM, sweep, unitBox } from './geometry';
import { lightAt } from './lighting';
import { MAT, buildingMat } from './materials';
import { P, S, isEnc } from './path';

export const chunks=new Map();
export const animated=[]; // objects with .tick(t)
export function clearOfRoad(x,z,halfDepth,halfDiag,sC){
  for(let s=Math.max(sC-900,P.first*STEP);s<=sC+900;s+=6){
    const a=S(Math.round(s/STEP)); if(!a) break;
    const dx=a.x-x,dz=a.z-z, d2=dx*dx+dz*dz;
    const need=Math.abs(s-sC)<50?halfDepth+12:halfDiag+15;
    if(d2<need*need) return false;
  }
  return true;
}
export function footprintClear(cx,cz,hw,hd,yawW,sC,margin){
  const c=Math.cos(yawW), sn=Math.sin(yawW); const reach=Math.hypot(hw,hd)+margin;
  for(let ss=Math.max(sC-1100,P.first*STEP); ss<=sC+1100; ss+=3){
    const a=S(Math.round(ss/STEP)); if(!a) break;
    const px=a.x-cx, pz=a.z-cz; if(px*px+pz*pz>reach*reach) continue;
    const lx=px*c-pz*sn, lz=px*sn+pz*c;
    const dx=Math.max(Math.abs(lx)-hw,0), dz=Math.max(Math.abs(lz)-hd,0);
    if(dx*dx+dz*dz<margin*margin) return false;
  }
  return true;
}
export function chunkRng(ci,k=0){ return mulberry32((ci*2654435761+k*97+SEED*31)>>>0); }
export const opPlan=new Map();
export function overpassFor(ci){
  if(ci<0) return null;
  if(opPlan.has(ci)) return opPlan.get(ci);
  const a0=S(ci*SPC), am=S(ci*SPC+SPC/2); if(!a0||!am||ci*SPC<P.first) return null;
  const sec=a0.sec, ls0=a0.s-sec.start; const rg=chunkRng(ci,7);
  let plan=null;
  if(sec.type==='city' && ls0>300 && ls0<sec.len-300 && a0.y>9 && rg()<0.12){
    const th=(rg()<0.5?1:-1)*(1.05+rg()*0.45);
    const dir=new V3(Math.sin(am.h-th),0,-Math.cos(am.h-th)); const L=700;
    plan={a:am,th,dir,L,seg:[am.x-dir.x*L/2,am.z-dir.z*L/2,am.x+dir.x*L/2,am.z+dir.z*L/2]};
  }
  opPlan.set(ci,plan); return plan;
}
export function segDist(px,pz,ax,az,bx,bz){const vx=bx-ax,vz=bz-az;const t=clamp(((px-ax)*vx+(pz-az)*vz)/(vx*vx+vz*vz),0,1);return Math.hypot(px-ax-vx*t,pz-az-vz*t);}

export function buildChunk(ci){
  const g=new THREE.Group(); g.matrixAutoUpdate=false;
  const i0=ci*SPC, i1=i0+SPC;
  const a0=S(i0), am=S(i0+SPC/2), sec=a0.sec, ls0=a0.s-sec.start, s0=a0.s;
  const enc=isEnc(sec,ls0);
  const own=[]; const appearMats=[];
  const add=(o)=>{ if(o){ g.add(o); o.matrixAutoUpdate=false; o.updateMatrix(); } return o; };
  const batches=new Map();
  const mesh=(geo,mat)=>{ if(!batches.has(mat)) batches.set(mat,[]); batches.get(mat).push(geo); };
  const minY=Math.min(a0.y,am.y,S(i1).y);

  if(enc){
    /* ---------------- tunnel interior ---------------- */
    mesh(sweep(i0,i1,flatStrips(lin(-10.4,0.4,8),0),{}),MAT.road);
    const marks=[[-8.0,MAT.mark],[-1.0,MAT.mark]];
    for(const [u,m] of marks) mesh(sweep(i0,i1,[[u-0.08,0.02,u+0.08,0.02]],{uS:1,vS:0.05}),m);
    mesh(sweep(i0,i1,[[-4.58,0.02,-4.42,0.02]],{}),MAT.markYellow);
    mesh(sweep(i0,i1,[[-4.18,0.02,-4.02,0.02]],{}),MAT.markYellow);
    mesh(sweep(i0,i1,[[0.4,0,0.4,3.2],[-10.4,3.2,-10.4,0]],{uS:0.83,vS:0.5}),MAT.tile);
    mesh(sweep(i0,i1,polyStrips([[0.4,3.2],[0.1,5.6],[-1.7,7.0],[-8.5,7.0],[-10.1,5.6],[-10.4,3.2]]),{}),MAT.tunnelUpper);
    // exterior shell (both tubes)
    mesh(sweep(i0,i1,[[-11.3,-1.2,-11.3,8.2],[-11.3,8.2,11.4,8.2],[11.4,8.2,11.4,-1.2]],{bake:0}),MAT.darkConcrete);
    // lamps every 4 m on two lines
    const lm=[];
    for(let k=0;k<CH/4;k++){ const a=S(i0+k*2); lm.push(propM(a,-10.12,5.55,1,1,1).clone()); lm.push(propM(a,0.12,5.55,1,1,1).clone()); }
    add(inst(GEO.tunnelLamp,MAT.tunnelLamp[sec.lamp],lm));
    // jet fans
    if(ci%2===0){ const a=S(i0+20); const fm=[propM(a,-6.6,6.25,1,1,1).clone(),propM(a,-3.6,6.25,1,1,1).clone()];
      const lc=lightAt(a.s,-5,6); const fmat=new THREE.MeshStandardMaterial({color:0x222225,roughness:0.6,metalness:0.5,emissive:new THREE.Color().setRGB(lc[0]*0.06,lc[1]*0.06,lc[2]*0.06)});
      own.push(fmat); add(inst(GEO.jetFan,fmat,fm)); }
    // emergency exit sign + red fire hydrant lamps + green guide lights
    const red=[],grn=[];
    for(let k=0;k<2;k++){ const a=S(i0+k*25); red.push(propM(a,-10.33,1.9,0.15,0.22,0.22).clone()); }
    for(let k=0;k<4;k++){ const a=S(i0+k*12+6); grn.push(propM(a,-10.34,0.9,0.1,0.12,0.45).clone()); }
    add(inst(GEO.dot,MAT.redSteady,red)); add(inst(GEO.dot,MAT.green,grn));
    { const a=S(i0+30); const pm=new THREE.Mesh(GEO.plane,MAT.exitSign); pm.matrix.copy(propM(a,-10.36,2.7,1.3,0.65,1,Math.PI/2)); pm.matrixAutoUpdate=false; g.add(pm); }
    if(ls0===sec.encStart){ // portal
      const a=a0;
      const pm=[propM(a,-4.95,7.0,13.2,2.6,0.8).clone(),propM(a,-11.1,-1,0.8,10.6,0.8).clone(),propM(a,1.0,-1,1.4,10.6,0.8).clone(),propM(a,6.5,-1,9.8,10.6,0.8).clone()];
      add(inst(centerBox,MAT.concrete,[]));
      const portal=new THREE.InstancedMesh(unitBox,new THREE.MeshStandardMaterial({color:0x3a3a3c,roughness:0.95}),pm.length);
      pm.forEach((M,k)=>portal.setMatrixAt(k,M)); add(portal);
      const plate=new THREE.Mesh(GEO.plane,MAT.plates[sec.name[0]]);
      plate.matrix.copy(propM(a,-4.95,8.25,6.4,1.38,1,0)).multiply(new THREE.Matrix4().makeTranslation(0,0,0.45)); plate.matrixAutoUpdate=false; g.add(plate);
      const led=new THREE.Mesh(GEO.plane,MAT.ledTunnel); const al=S(i0+20); led.matrix.copy(propM(al,-4.9,5.6,4.0,1.0,1,0)); led.matrixAutoUpdate=false; g.add(led);
    }
  } else {
    /* ---------------- open road deck ---------------- */
    const bay=sec.type==='bay';
    mesh(sweep(i0,i1,flatStrips(lin(-9.6,-0.5,7),0),{}),MAT.road);
    mesh(sweep(i0,i1,flatStrips(lin(0.5,9.6,7),0),{}),MAT.road);
    for(const u of [-8.0,-1.0,1.0,8.0]) mesh(sweep(i0,i1,[[u-0.08,0.02,u+0.08,0.02]],{}),MAT.mark);
    for(const u of [-4.5,4.5]) mesh(sweep(i0,i1,[[u-0.075,0.02,u+0.075,0.02]],{uS:1,vS:0.05}),MAT.markDash);
    // median barrier
    mesh(sweep(i0,i1,[[-0.5,0,-0.28,0.85],[-0.28,0.85,0.28,0.85],[0.28,0.85,0.5,0]],{}),MAT.concrete);
    // outer parapets incl. deck edge
    const ph=bay?0.9:1.1;
    mesh(sweep(i0,i1,[[-9.6,ph,-9.6,0],[-9.95,ph,-9.6,ph],[-9.95,-2.4,-9.95,ph]],{}),MAT.concrete);
    mesh(sweep(i0,i1,[[9.6,0,9.6,ph],[9.6,ph,9.95,ph],[9.95,ph,9.95,-2.4]],{}),MAT.concrete);
    mesh(sweep(i0,i1,[[9.95,-2.4,-9.95,-2.4]],{bake:0}),MAT.darkConcrete);
    if(bay){
      mesh(sweep(i0,i1,[[-9.7,1.28,-9.7,1.2],[9.7,1.2,9.7,1.28]],{bake:0.3}),MAT.rail);
    }
    // sound wall (occasional, left side)
    if(sec.type==='city' && R()<0.14 && ci%3!==0){
      const gw=sweep(i0,i1,[[-9.8,ph,-9.8,3.8]],{bake:0}); own.push(gw); add(new THREE.Mesh(gw,MAT.soundWall));
      const posts=[]; for(let k=0;k<SPC;k+=2){ posts.push(propM(S(i0+k),-9.85,ph,0.12,2.7,0.12).clone()); } add(inst(unitBox,MAT.metal,posts));
    }
    // street lamps
    const posts=[],heads=[];
    for(const f of sec.fam){
      const k0=Math.ceil((s0-f.off)/f.sp), k1=Math.floor((s0+CH-0.01-f.off)/f.sp);
      for(let k=k0;k<=k1;k++){
        const sl=k*f.sp+f.off; const a=S(Math.round(sl/STEP));
        if(sec.type==='tunnel' && sl-sec.start>=sec.encStart-20 && sl-sec.start<sec.encEnd+20) continue;
        if(bay){ if(f.u<0){ posts.push(propM(a,0,0.85,1,1,1).clone()); } heads.push(propM(a,f.u,f.h-0.1,1,1,1).clone()); }
        else { const left=f.u<0; posts.push(propM(a,left?-9.78:9.78,ph,1,1,1,left?0:Math.PI).clone()); heads.push(propM(a,f.u,f.h-0.1,1,1,1).clone()); }
      }
    }
    add(inst(bay?GEO.lampPostDouble:GEO.lampPost,MAT.metal,posts));
    add(inst(GEO.lampHead,MAT.lampHead[sec.lamp],heads));
    // delineators (white on left edge, orange on median side)
    const dl=[],dc=[];
    for(let k=0;k<SPC;k+=5){ const a=S(i0+k);
      dl.push(propM(a,-9.55,ph-0.25,0.06,0.1,0.1).clone()); dc.push([1.0,1.0,0.95]);
      dl.push(propM(a,-0.42,0.62,0.06,0.1,0.1).clone()); dc.push([1.0,0.45,0.05]);
      dl.push(propM(a,9.55,ph-0.25,0.06,0.1,0.1).clone()); dc.push([1.0,1.0,0.95]);
    }
    add(inst(GEO.dot,MAT.reflector,dl,dc));
    // expansion joints
    const jsp=bay?100:40, jt=[];
    for(let k=Math.ceil(s0/jsp);k*jsp<s0+CH;k++){ const a=S(Math.round(k*jsp/STEP)); if(a.y>4) jt.push(propM(a,0,0.012,19.2,0.02,0.32).clone()); }
    add(inst(unitBox,MAT.joint,jt));
    // piers
    if(!bay || ls0<sec.a1-100 || ls0>sec.a2+50){
      const cols=[],caps=[];
      for(let k=Math.ceil(s0/40);k*40<s0+CH;k++){ const a=S(Math.round(k*40/STEP)); const top=a.y-2.4; if(top<2) continue;
        cols.push(propM(a,0,0,2.4,top-1.6,2.4,0,true).clone()); caps.push(propM(a,0,top-1.6,20,1.6,2.2,0,true).clone()); }
      add(inst(unitBox,MAT.darkConcrete,cols)); add(inst(unitBox,MAT.darkConcrete,caps));
    }
    // ground level street lamps under the elevated road
    if(sec.type==='city' && minY>9){
      const gl=[]; for(let k=0;k<SPC;k+=15){ const a=S(i0+k); gl.push(propM(a,-15,6.5,0.7,0.25,0.4,0,true).clone()); gl.push(propM(a,15,6.5,0.7,0.25,0.4,0,true).clone()); }
      add(inst(GEO.dot,MAT.groundLamp,gl));
    }
    // signage
    if(sec.type==='city' && ls0>200 && R()<0.32){ buildGantry(g,own,S(i0+25),R()<0.25?'led':'sign'); }
    else if(sec.type==='tunnel' && ls0===sec.encStart-400){ buildGantry(g,own,S(i0+25),'sign'); }
    if(R()<0.22){ const a=S(i0+10); const sp=new THREE.Mesh(GEO.plane,MAT.speed); sp.matrix.copy(propM(a,-10.4,3.2,1.2,1.2,1,0).multiply(new THREE.Matrix4().makeRotationY(0))); sp.matrixAutoUpdate=false; g.add(sp);
      add(inst(unitBox,MAT.metal,[propM(a,-10.4,0,0.08,3.2,0.08).clone()])); }
    if(sec.type==='tunnel' && ls0===sec.encEnd){ // exit portal (seen in mirror / looking back)
      const pm=[propM(a0,-4.95,7.0,13.2,2.6,0.8).clone(),propM(a0,-11.1,-1,0.8,10.6,0.8).clone(),propM(a0,1.0,-1,1.4,10.6,0.8).clone(),propM(a0,6.5,-1,9.8,10.6,0.8).clone()];
      const portal=new THREE.InstancedMesh(unitBox,new THREE.MeshStandardMaterial({color:0x3a3a3c,roughness:0.95}),pm.length);
      pm.forEach((M,k)=>portal.setMatrixAt(k,M)); add(portal);
    }
    { const op=overpassFor(ci); if(op) buildOverpass(g,own,op); }
    if(bay) buildBay(g,own,sec,ls0,i0,i1);
  }

  /* ---------------- buildings ---------------- */
  const nearCity = sec.type==='city' || (sec.type==='tunnel' && !enc) || (sec.type==='bay' && (ls0<sec.a1-250 || ls0>sec.a2+150));
  if(nearCity && !enc){
    const bm=[],bc=[],roofR=[],bbs=[];
    const obst=[]; for(let k=-5;k<=5;k++){ const op=overpassFor(ci+k); if(op) obst.push([...op.seg,11]); }
    const dens = sec.type==='city'?1: sec.type==='tunnel'?0.6:0.45;
    const layers=[[16,30,7,10,40,12,70],[45,230,11,18,50,20,130],[230,900,12,28,70,30,190]];
    for(const side of [-1,1]){
      for(const [ua,ub,cnt,fa,fb,ha,hb] of layers){
        const n=Math.round(cnt*dens*rr(0.7,1.2));
        for(let k=0;k<n;k++){
          const j=(R()*SPC)|0; const a=S(i0+j);
          const w=rr(fa,fb), dpt=rr(fa,fb)*(ua>40?1:0.8);
          let h=ha*Math.pow(hb/ha,Math.pow(R(),1.6)); if(R()<0.06 && ua>40) h*=1.8;
          const u=side*(rr(ua,ub)+w/2);
          const yaw=(R()-0.5)*0.3;
          const cx=a.x+a.rx*u, cz=a.z+a.rz*u;
          if(!footprintClear(cx,cz,w/2,dpt/2,-a.h+yaw,a.s,14.5)) continue;
          let bad=false; for(const o of obst){ if(segDist(cx,cz,o[0],o[1],o[2],o[3])<Math.hypot(w,dpt)/2+o[4]){bad=true;break;} } if(bad) continue;
          bm.push(propM(a,u,0,w,h,dpt,yaw,true).clone());
          const style = h>90? (R()<0.6?2:0) : pick([0,0,1,1,1,3,3]);
          bc.push([R(),rr(0.25,0.85),(style+0.5)/4]);
          if(h>45){ const top=h+0.5; for(const sx of [-0.45,0.45]) roofR.push(propM(a,u+sx*w*side,top,0.9,0.9,0.9,yaw,true).clone()); }
          if(ua<50 && h<45 && R()<0.16){ bbs.push({a,u,h,w,side,yaw}); }
        }
      }
    }
    const mat=buildingMat(); mat.uniforms.uAppear.value=0; appearMats.push(mat);
    const im=inst(unitBox,mat,bm,bc); if(im){ add(im); }
    add(inst(GEO.dot,MAT.redBlink,roofR));
    for(const b of bbs){
      const bb=new THREE.Mesh(GEO.plane,pick(MAT.billboards));
      bb.matrix.copy(propM(b.a,b.u-b.side*b.w*0.3,b.h+2.6,9,3.5,1,b.side<0?0.7:-0.7,true)); bb.matrixAutoUpdate=false; g.add(bb);
      add(inst(unitBox,MAT.metal,[propM(b.a,b.u-b.side*b.w*0.3,b.h,0.3,0.9,0.3,0,true).clone()]));
    }
  }
  for(const [mat,geos] of batches){ const mg=geos.length>1?mergeGeometries(geos):geos[0]; if(geos.length>1) geos.forEach(q=>q.dispose()); own.push(mg); add(new THREE.Mesh(mg,mat)); }
  g.updateMatrixWorld(true);
  scene.add(g);
  return {ci,g,own,appearMats,born:U.time.value};
}

export function buildGantry(g,own,a,kind){
  const parts=[propM(a,-10.5,0,0.45,7.6,0.45,0,false).clone(),propM(a,0,0.85,0.45,6.75,0.45).clone()];
  const beam=propM(a,-5.25,7.2,11.2,0.5,0.5).clone();
  const im=new THREE.InstancedMesh(unitBox,MAT.metal,3); im.setMatrixAt(0,parts[0]); im.setMatrixAt(1,parts[1]); im.setMatrixAt(2,beam);
  im.matrixAutoUpdate=false; g.add(im);
  const panel=new THREE.Mesh(GEO.plane, kind==='led'? (state.rainTarget>0.5?MAT.ledRain:pick(MAT.leds)) : pick(MAT.signs));
  const w=kind==='led'?6.4:8.6, h=kind==='led'?1.6:3.52;
  panel.matrix.copy(propM(a,-4.9,7.0-h/2+ (kind==='led'?0.2:0),w,h,1,0)); panel.matrixAutoUpdate=false; g.add(panel);
  const back=new THREE.Mesh(GEO.plane,MAT.signBack); back.matrix.copy(propM(a,-4.9,7.0-h/2+ (kind==='led'?0.2:0),w,h,1,Math.PI)).multiply(new THREE.Matrix4().makeTranslation(0,0,0.06)); back.matrixAutoUpdate=false; g.add(back);
  const lamps=[]; for(let k=0;k<3;k++) lamps.push(propM(a,-7.6+k*2.7,7.0-h-0.15+0.3,0.5,0.08,0.25).clone());
  const lm=new THREE.InstancedMesh(GEO.dot,MAT.cableLight,lamps.length); lamps.forEach((M,k)=>lm.setMatrixAt(k,M)); lm.matrixAutoUpdate=false; g.add(lm);
}

export function buildOverpass(g,own,op){
  const a=op.a, th=op.th;
  const hx=-a.h+th;
  const cy=a.y+10.5;
  const cxv=Math.sin(-hx)*-1, czv=-Math.cos(-hx); // direction of crossing road (forward of rotated frame)
  const dir=new V3(Math.sin(a.h-th),0,-Math.cos(a.h-th));
  const L=700, W=13;
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-(a.h-th),0));
  const center=new V3(a.x,cy,a.z);
  const mk=(off,sz,yo,mat)=>{const m=new THREE.Mesh(centerBox,mat);m.matrix.compose(new V3(center.x+off.x,cy+yo,center.z+off.z),q,sz);m.matrixAutoUpdate=false;g.add(m);};
  const side=new V3(dir.z,0,-dir.x);
  mk(new V3(),new V3(W,2.2,L),0,MAT.darkConcrete);
  mk(side.clone().multiplyScalar(W/2),new V3(0.3,1.2,L),1.7,MAT.concrete);
  mk(side.clone().multiplyScalar(-W/2),new V3(0.3,1.2,L),1.7,MAT.concrete);
  const heads=[],cols=[];
  for(let t=-L/2+10;t<L/2;t+=34){
    const p=center.clone().addScaledVector(dir,t);
    heads.push(new THREE.Matrix4().compose(new V3(p.x+side.x*4,cy+9,p.z+side.z*4),q,new V3(1,0.2,0.5)));
    if(Math.abs(t)>18 && Math.round(t)%2===0) cols.push(new THREE.Matrix4().compose(new V3(p.x,0,p.z),q,new V3(2.2,cy-1.1,2.2)));
  }
  const hm=new THREE.InstancedMesh(GEO.lampHead,MAT.lampHead.sodium,heads.length); heads.forEach((M,k)=>hm.setMatrixAt(k,M)); hm.matrixAutoUpdate=false; g.add(hm);
  const cm=new THREE.InstancedMesh(unitBox,MAT.darkConcrete,cols.length); cols.forEach((M,k)=>cm.setMatrixAt(k,M)); cm.matrixAutoUpdate=false; g.add(cm);
}
export function disposeChunk(c){
  scene.remove(c.g);
  for(const o of c.own) if(o&&o.dispose) o.dispose();
  c.g.traverse(o=>{ if(o.isInstancedMesh) o.dispose(); if(o.isPoints||o.isLineSegments) o.geometry.dispose(); const i=animated.indexOf(o); if(i>=0) animated.splice(i,1); });
  for(const m of c.appearMats) m.dispose();
}
