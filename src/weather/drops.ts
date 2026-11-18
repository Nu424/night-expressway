import * as THREE from 'three';
import { sound } from '../audio/sound';
import { camState, dbg, state, tune } from '../core/state';
import { R, lerp, rr, sstep } from '../core/util';
import { dropsCtx, dropsPass, dropsTex } from '../render/post';
import { ego } from '../traffic/traffic';

export let drops=[];
let dryFrames=999;
export function clearDrops(){ drops=[]; }
export const PIV=[[280,375],[615,375]], BL=[[50,300],[50,335]];
export function wiperAngle(ph){ // phase 0..1 → angle (rad, math coords, y up)
  const a0=Math.PI*0.985, a1=Math.PI*0.53;
  const x= ph<0.5? sstep(0,0.5,ph) : 1-sstep(0.5,1,ph);
  return lerp(a0,a1,x);
}
export function updateDrops(dt){
  const amt=state.rain;
  if(amt>0.02 && state.view!=='clean' && state.tunnel<0.5 && !dbg.on){
    const rate=amt*110*(0.5+ego.v/30)*tune.drops;
    let n=rate*dt; while(n>0){ if(R()<n) drops.push({x:R()*640,y:R()*360,r:rr(1.2,4.8)*(R()<0.08?1.8:1),life:0,max:rr(2.5,6.5)}); n-=1; }
  }
  // 水滴の動き: 大きい粒ほど走行風で上へ・外側へ流れる。引っかかりながら動くので、速さを粒ごとにゆらす。
  const vUp=ego.v*0.9;
  const age= state.rain>0.05?1:2.5;
  for(const d of drops){ d.life+=dt*age;
    if(d.r>2.3){ d.slip=(d.slip??R())+dt*(0.6+d.r*0.2); const go=0.35+0.65*Math.max(0,Math.sin(d.slip*3.1+d.x)); const v=vUp*dt*(d.r/6)*go;
      d.y-=v; d.x+=(d.x-320)/320*v*0.4; if(d.r>3.4) d.r-=dt*0.12; } }
  drops=drops.filter(d=>d.life<d.max && d.y>-12 && d.x>-12 && d.x<652);
  if(drops.length>900) drops.splice(0,drops.length-900);
  // wipers
  const wiping= tune.wiper!=='off' && (state.rain>0.08 || state.wiperPhase>0) || state.wiperPhase>0;
  if(wiping){
    if(tune.wiper!=='off' && state.wiperPause>1e8) state.wiperPause=0;
    if(state.wiperPause>0){ state.wiperPause-=dt; }
    else {
      const prev=state.wiperPhase; state.wiperPhase+=dt/1.15;
      if(prev<0.5 && state.wiperPhase>=0.5) sound.wiper();
      if(state.wiperPhase>=1){ state.wiperPhase=0; state.wiperPause= tune.wiper==='fast'?0: tune.wiper==='slow'?3.2: state.rain>0.65?0: state.rain>0.3?0.9: 3.2; if(tune.wiper==='off') state.wiperPause=1e9; if(state.rain<0.08) state.wiperPhase=0; }
    }
  }
  const ang=wiperAngle(state.wiperPhase);
  const wiped=[];
  for(let k=0;k<2;k++){
    const pa=state.wiperAng[k], na=ang; state.wiperAng[k]=na;
    if(Math.abs(pa-na)>1e-5){
      if(Math.abs(camState.yaw)>0.5) continue;
      const lo=Math.min(pa,na)-0.03, hi=Math.max(pa,na)+0.03; wiped.push([k,lo,hi]);
      drops=drops.filter(d=>{ const dx=d.x-PIV[k][0], dy=PIV[k][1]-d.y; const r=Math.hypot(dx,dy), a=Math.atan2(dy,dx); return !(r>BL[k][0]&&r<BL[k][1]&&a>=lo&&a<=hi); });
    }
  }
  // 描画: 毎フレーム全消去せず少しずつ薄めるので、流れた跡が水の筋として残る。ワイパーが通った扇形だけは拭き取る。
  if(drops.length===0 && dryFrames>90){ /* 乾ききったらテクスチャを更新しない */ } else {
  dryFrames= drops.length===0 ? dryFrames+1 : 0;
  const x=dropsCtx;
  x.globalCompositeOperation='destination-out'; x.globalAlpha=1; x.fillStyle='rgba(0,0,0,0.085)'; x.fillRect(0,0,640,360);
  x.fillStyle='rgba(0,0,0,1)';
  for(const [k,lo,hi] of wiped){ const [cx,cy]=PIV[k]; x.beginPath(); x.arc(cx,cy,BL[k][1],-hi,-lo); x.arc(cx,cy,BL[k][0],-lo,-hi,true); x.closePath(); x.fill(); }
  x.globalCompositeOperation='source-over';
  for(const d of drops){ const gr=x.createRadialGradient(d.x-d.r*0.25,d.y-d.r*0.3,0,d.x,d.y,d.r); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.6,'rgba(255,255,255,0.65)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    x.globalAlpha=1-sstep(d.max-1.4,d.max,d.life); x.fillStyle=gr; x.beginPath(); x.ellipse(d.x,d.y,d.r*(0.7+0.3*x.globalAlpha),d.r*(0.95+ (d.r>2.3?0.25:0))*(0.7+0.3*x.globalAlpha),0,0,7); x.fill(); }
  x.globalAlpha=1;
  dropsTex.needsUpdate=true;
  }
  const asp=innerWidth/innerHeight;
  const toUV=(px,py)=>[px/640*asp,1-py/360];
  const seg=(k)=>{ const [cx,cy]=PIV[k]; const a=state.wiperAng[k]; const r0=BL[k][0], r1=BL[k][1];
    const p0=toUV(cx+Math.cos(a)*r0, cy-Math.sin(a)*r0), p1=toUV(cx+Math.cos(a)*r1, cy-Math.sin(a)*r1); return new THREE.Vector4(p0[0],p0[1],p1[0],p1[1]); };
  dropsPass.uniforms.uW1.value.copy(seg(0)); dropsPass.uniforms.uW2.value.copy(seg(1));
  { const a=toUV(PIV[0][0],PIV[0][1]), b=toUV(PIV[1][0],PIV[1][1]); dropsPass.uniforms.uP1.value.set(a[0],a[1]); dropsPass.uniforms.uP2.value.set(b[0],b[1]); }
  dropsPass.uniforms.uAspect.value=asp;
  // ワイパーはフロントガラスのもの。横や後ろを向いているときは描かない。
  const frontal= state.view!=='clean' && Math.abs(camState.yaw)<0.5;
  dropsPass.uniforms.uWipe.value= (frontal && !dbg.on && (state.wiperPhase>0.001 && state.wiperPhase<0.999))?1:0;
  dropsPass.uniforms.uAmt.value= !dbg.on&&(drops.length>0||state.rain>0.01) ? 1:0;
  dropsPass.uniforms.uFilm.value= state.rain*0.25*(state.tunnel<0.5?1:0);
}
