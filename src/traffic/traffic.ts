import * as THREE from 'three';
import { LANES, LANES_OPP, U } from '../core/globals';
import { R, V3, clamp, lerp, pick, rr, sstep } from '../core/util';
import { frameAt, secAt } from '../world/path';

export const TYPES=[
  {k:'sedan',w:1.78,h:1.45,l:4.7,p:0.32},{k:'compact',w:1.48,h:1.62,l:3.4,p:0.15},{k:'minivan',w:1.8,h:1.9,l:4.8,p:0.15},
  {k:'taxi',w:1.7,h:1.52,l:4.6,p:0.1},{k:'truck',w:2.45,h:3.3,l:9.5,p:0.17},{k:'bus',w:2.5,h:3.2,l:11,p:0.04},{k:'van',w:1.7,h:2.0,l:4.7,p:0.07}];
export const PAINTS=[[0.72,0.72,0.7],[0.75,0.74,0.72],[0.02,0.02,0.022],[0.03,0.03,0.035],[0.36,0.37,0.38],[0.18,0.19,0.2],[0.03,0.05,0.12],[0.25,0.03,0.03],[0.6,0.58,0.52]];
export const MAXCARS=64;
export const cars=[];
export const ego:any={s:60,v:19,v0:19.5,lane:0,u:LANES[0],lc:-1,lcFrom:0,signal:0,signalT:0,lastLC:0,isEgo:true,dir:1,l:4.6,acc:0,brake:0,v0t:0};
export function newCar(dir,lane,s,v0){
  let r=R(),t=TYPES[0]; for(const T of TYPES){ if(r<T.p){t=T;break;} r-=T.p; }
  const c={dir,lane,s,v:v0,v0,type:t,l:t.l,u:dir>0?LANES[lane]:LANES_OPP[lane],lc:-1,lcFrom:lane,brake:0,acc:0,
    paint: t.k==='taxi'? pick([[0.02,0.02,0.025],[0.03,0.06,0.12],[0.55,0.45,0.05]]) : t.k==='truck'? [0.62,0.63,0.62] : t.k==='bus'? [0.5,0.5,0.48] : pick(PAINTS),
    cab: pick([[0.6,0.6,0.6],[0.1,0.2,0.4],[0.25,0.05,0.05],[0.65,0.65,0.62]]), lcCool:rr(3,10), brakeTap:0, passed:false};
  cars.push(c); return c;
}
export function occupies(c,lane){ return c.lane===lane || (c.lc>=0 && c.lcFrom===lane); }
export function leaderOf(X,lane){
  let best=null,bd=1e9;
  const all=X.dir>0?sameDir:oppDir;
  for(const Y of all){ if(Y===X||!occupies(Y,lane)) continue; const d=(Y.s-X.s)*X.dir; if(d>0&&d<bd){bd=d;best=Y;} }
  return best;
}
export function followerOf(X,lane){
  let best=null,bd=1e9;
  for(const Y of sameDir){ if(Y===X||!occupies(Y,lane)) continue; const d=X.s-Y.s; if(d>0&&d<bd){bd=d;best=Y;} }
  return best;
}
export function idm(v,v0,gap,dv){
  const a=1.1,b=2.2,s0=6,T=1.35;
  const ss=s0+Math.max(0,v*T+v*dv/(2*Math.sqrt(a*b)));
  return a*(1-Math.pow(v/Math.max(v0,1),4)-(gap<1e8?(ss/Math.max(gap,0.5))**2:0));
}
export let sameDir=[],oppDir=[];
export const _f:any={},_f2:any={};
export function laneChangeOK(X,target){
  const L=leaderOfLaneAt(X,target), F=followerOf(X,target);
  const ga=L?(L.s-X.s)-(L.l+X.l)/2:1e9, gb=F?(X.s-F.s)-(F.l+X.l)/2:1e9;
  return ga>30 && gb>(F? Math.max(14,(F.v-X.v)*4+14):0);
}
export function leaderOfLaneAt(X,lane){ let best=null,bd=1e9; for(const Y of sameDir){ if(Y===X||!occupies(Y,lane)) continue; const d=Y.s-X.s; if(d>-0.5&&d<bd){bd=d;best=Y;} } return best; }

export function updateTraffic(dt){
  const sec=secAt(ego.s);
  sameDir=cars.filter(c=>c.dir>0); sameDir.push(ego); oppDir=cars.filter(c=>c.dir<0);
  // accelerations
  for(const X of sameDir.concat(oppDir)){
    let acc=1e9;
    const lanes=X.lc>=0?[X.lane,X.lcFrom]:[X.lane];
    for(const ln of lanes){ const L=leaderOf(X,ln); const gap=L?Math.abs(L.s-X.s)-(L.l+X.l)/2:1e9; acc=Math.min(acc,idm(X.v,X.v0,gap,L?X.v-L.v:0)); }
    if(X.brakeTap>0){ X.brakeTap-=dt; acc=Math.min(acc,-0.8); }
    else if(!X.isEgo && R()<dt*0.02) X.brakeTap=rr(0.6,1.8);
    acc=clamp(acc,-7,1.4);
    X.acc=acc; X.v=Math.max(0,X.v+acc*dt); X.s+=X.v*dt*X.dir;
    X.brake = acc<-0.5?1: Math.max(0,(X.brake||0)-dt*3);
    if(X.lc>=0){ X.lc+=dt/(X.isEgo?4.2:3.4); if(X.lc>=1){X.lc=-1;} }
    const lanesArr=X.dir>0?LANES:LANES_OPP;
    const tgt=lanesArr[X.lane];
    X.u = X.lc>=0? lerp(lanesArr[X.lcFrom],tgt,sstep(0,1,X.lc)) : tgt;
  }
  // npc lane changes
  for(const X of cars){
    if(X.dir<0||X.lc>=0) continue;
    X.lcCool-=dt; if(X.lcCool>0) continue;
    X.lcCool=rr(2,6);
    const f=frameAt(X.s,_f2); if(f.enc) continue;
    const L=leaderOf(X,X.lane);
    const other=1-X.lane;
    if(L && (L.s-X.s)<55 && L.v<X.v0-2 && laneChangeOK(X,other)) { X.lcFrom=X.lane; X.lane=other; X.lc=0; continue; }
    if(X.lane===1 && R()<0.25 && laneChangeOK(X,0)){ X.lcFrom=1; X.lane=0; X.lc=0; }
  }
  // ego desired speed
  ego.v0t-=dt; if(ego.v0t<=0){ ego.v0t=rr(15,40); const base=sec.type==='city'?70:sec.type==='tunnel'?66:82; ego.v0=(base+rr(-5,6))/3.6; }
  // ego lane change logic
  const ef=frameAt(ego.s,_f2);
  ego.signalT=Math.max(0,ego.signalT-dt);
  if(ego.signal && ego.signalT<=0 && ego.lc<0){
    const target=ego.lane+ego.signal*(-1)*-1; // signal: +1 right, -1 left ; lane1 is right
    const tl=ego.signal>0?1:0;
    if(tl!==ego.lane && laneChangeOK(ego,tl) && !ef.enc){ ego.lcFrom=ego.lane; ego.lane=tl; ego.lc=0; ego.lastLC=U.time.value; }
    ego.signal=0;
  }
  if(ego.lc>=0 && ego.lc<0.85) ego.blink=true; else if(ego.lc<0 && !ego.signal) ego.blink=false;
  if(!ego.signal && ego.lc<0 && U.time.value-ego.lastLC>9 && !ef.enc){
    const L=leaderOf(ego,ego.lane);
    if(ego.lane===0 && L && (L.s-ego.s)<70 && L.v<ego.v0-2.2 && laneChangeOK(ego,1)){ ego.signal=1; ego.signalT=2.6; ego.blink=true; }
    else if(ego.lane===1 && U.time.value-ego.lastLC>14 && laneChangeOK(ego,0)){ const L0=leaderOfLaneAt(ego,0); if(!L0||(L0.s-ego.s)>90||L0.v>ego.v0-1){ ego.signal=-1; ego.signalT=2.6; ego.blink=true; } }
  }
  // spawn/despawn
  for(let i=cars.length-1;i>=0;i--){ const c=cars[i];
    if(c.dir>0 && (c.s<ego.s-280||c.s>ego.s+1300)) cars.splice(i,1);
    else if(c.dir<0 && c.s<ego.s-220) cars.splice(i,1); }
  const want=sec.type==='tunnel'?5:sec.type==='bay'?6:7;
  for(const lane of [0,1]){
    const inLane=cars.filter(c=>c.dir>0&&c.lane===lane);
    if(inLane.length<want && cars.length<MAXCARS-2){
      const ahead=R()<0.72;
      const s= ahead? ego.s+rr(850,1150) : ego.s-rr(230,270);
      const v0 = ahead? ego.v0-rr(0.5,5)+lane*1.5 : ego.v0+rr(2.5,7);
      if(inLane.every(c=>Math.abs(c.s-s)>40) && Math.abs(ego.s-s)>40) newCar(1,lane,s,Math.max(13,v0));
    }
    const opp=cars.filter(c=>c.dir<0&&c.lane===lane);
    if(opp.length<(sec.type==='tunnel'?3:6) && cars.length<MAXCARS-2){
      const s=ego.s+rr(1350,1600);
      if(opp.every(c=>Math.abs(c.s-s)>45)) newCar(-1,lane,s,rr(17,23)+lane*1.5);
    }
  }
}
