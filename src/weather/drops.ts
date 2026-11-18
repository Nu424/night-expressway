import * as THREE from 'three';
import { sound } from '../audio/sound';
import { dbg, state } from '../core/state';
import { R, lerp, rr, sstep } from '../core/util';
import { dropsCtx, dropsPass, dropsTex } from '../render/post';
import { ego } from '../traffic/traffic';

export let drops=[];
let dropsEmpty=false;
export function clearDrops(){ drops=[]; }
export const PIV=[[280,375],[615,375]], BL=[[50,300],[50,335]];
export function wiperAngle(ph){ // phase 0..1 → angle (rad, math coords, y up)
  const a0=Math.PI*0.985, a1=Math.PI*0.53;
  const x= ph<0.5? sstep(0,0.5,ph) : 1-sstep(0.5,1,ph);
  return lerp(a0,a1,x);
}
export function updateDrops(dt){
  const amt=state.rain;
  if(amt>0.02 && state.view==='interior' && state.tunnel<0.5 && !dbg.on){
    const rate=amt*110*(0.5+ego.v/30);
    let n=rate*dt; while(n>0){ if(R()<n) drops.push({x:R()*640,y:R()*360,r:rr(1.2,4.8)*(R()<0.08?1.8:1),life:0,max:rr(2.5,6.5)}); n-=1; }
  }
  const vUp=ego.v*0.9;
  const age= state.rain>0.05?1:2.5;
  for(const d of drops){ d.life+=dt*age; if(d.r>3.2) d.y-=vUp*dt*(d.r/6); }
  drops=drops.filter(d=>d.life<d.max && d.y>-12);
  if(drops.length>900) drops.splice(0,drops.length-900);
  // wipers
  const wiping= state.rain>0.08 || state.wiperPhase>0;
  if(wiping){
    if(state.wiperPause>0){ state.wiperPause-=dt; }
    else {
      const prev=state.wiperPhase; state.wiperPhase+=dt/1.15;
      if(prev<0.5 && state.wiperPhase>=0.5) sound.wiper();
      if(state.wiperPhase>=1){ state.wiperPhase=0; state.wiperPause= state.rain>0.65?0: state.rain>0.3?0.9: 3.2; if(state.rain<0.08) state.wiperPhase=0; }
    }
  }
  const ang=wiperAngle(state.wiperPhase);
  for(let k=0;k<2;k++){
    const pa=state.wiperAng[k], na=ang; state.wiperAng[k]=na;
    if(Math.abs(pa-na)>1e-5){
      const lo=Math.min(pa,na)-0.03, hi=Math.max(pa,na)+0.03;
      drops=drops.filter(d=>{ const dx=d.x-PIV[k][0], dy=PIV[k][1]-d.y; const r=Math.hypot(dx,dy), a=Math.atan2(dy,dx); return !(r>BL[k][0]&&r<BL[k][1]&&a>=lo&&a<=hi); });
    }
  }
  // draw
  if(drops.length===0 && dropsEmpty){ /* 乾いている間はテクスチャを更新しない */ } else {
  dropsEmpty=drops.length===0;
  const x=dropsCtx; x.clearRect(0,0,640,360);
  for(const d of drops){ const gr=x.createRadialGradient(d.x-d.r*0.25,d.y-d.r*0.3,0,d.x,d.y,d.r); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.6,'rgba(255,255,255,0.65)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    x.globalAlpha=1-sstep(d.max-1.4,d.max,d.life); x.fillStyle=gr; x.beginPath(); x.ellipse(d.x,d.y,d.r*(0.7+0.3*x.globalAlpha),d.r*0.9*(0.7+0.3*x.globalAlpha),0,0,7); x.fill(); }
  x.globalAlpha=1;
  dropsTex.needsUpdate=true;
  }
  const asp=innerWidth/innerHeight;
  const toUV=(px,py)=>[px/640*asp,1-py/360];
  const seg=(k)=>{ const [cx,cy]=PIV[k]; const a=state.wiperAng[k]; const r0=BL[k][0]*0.4, r1=BL[k][1];
    const p0=toUV(cx+Math.cos(a)*r0, cy-Math.sin(a)*r0), p1=toUV(cx+Math.cos(a)*r1, cy-Math.sin(a)*r1); return new THREE.Vector4(p0[0],p0[1],p1[0],p1[1]); };
  dropsPass.uniforms.uW1.value.copy(seg(0)); dropsPass.uniforms.uW2.value.copy(seg(1));
  dropsPass.uniforms.uAspect.value=asp;
  dropsPass.uniforms.uWipe.value= (state.view==='interior' && !dbg.on && (state.wiperPhase>0.001 && state.wiperPhase<0.999))?1:0;
  dropsPass.uniforms.uAmt.value= !dbg.on&&(drops.length>0||state.rain>0.01) ? 1:0;
  dropsPass.uniforms.uFilm.value= state.rain*0.25*(state.tunnel<0.5?1:0);
}
