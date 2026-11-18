import './style.css';
import * as THREE from 'three';
import { audioFrame, radio, setRoadName, sound } from './audio/index';
import { Radio, radioParams } from './audio/radio';
import { Sound } from './audio/sound';
import { updateCamera } from './car/camera';
import { icam, iscene, makeInterior, mirrorRT, rearCam, updateInterior } from './car/interior';
import { AHEAD, BEHIND, CH, FOG_COLOR, U } from './core/globals';
import { settings } from './core/settings';
import { dbg, state } from './core/state';
import { perf, togglePerf, updatePerfHud } from './debug/perf';
import { clamp, lerp, params, rr } from './core/util';
import { makeDebug, setDebug, updateDebug } from './debug/birdseye';
import { autoscale, autoscaleTick, gpuBegin, gpuEnd, initAutoscale, loadHint } from './render/autoscale';
import { finalU, interiorPass, makePost, post, renderFrame, resizePost } from './render/post';
import { makeReflRT, reflRT, renderReflection } from './render/reflection';
import { PR, camera, hemi, quality, renderer, scene } from './render/renderer';
import { makeTraffic, renderTraffic } from './traffic/carRender';
import { TYPES, _f, _f2, cars, ego, newCar, updateTraffic } from './traffic/traffic';
import { applyAA, setView } from './ui/controls';
import { updateDrops } from './weather/drops';
import { makeRain, rainDisp, rainLines } from './weather/rain';
import { updateWeather } from './weather/weather';
import { animated, buildChunk, chunks, disposeChunk } from './world/chunks';
import { ground, makeWorld, planes, respawnPlane, sky, skyline, skylineLights, waterPoints } from './world/environment';
import { makeSharedGeometry } from './world/geometry';
import { lightAt } from './world/lighting';
import { MAT, makeMaterials } from './world/materials';
import { P, ensurePath, frameAt, sections, trimPath } from './world/path';
import { makeBaseTextures, makeSignTextures } from './world/textures';

export let frameN=0;
let sleepShown=0; const sleepVeil=document.getElementById('sleepVeil')!;
/** 眠りに落ちたあとは描画を止めて電力を節約する */
export function isAsleep(){ return state.sleepEnd>0 && state.sleepFade>=0.999; }
let wasEnc=false;
const _vel=new THREE.Vector3();
let lastSecId=-1;
export let waterNear=false, lastWaterS=-1e9;
export const sameDirPrev=new Map();
export function update(dt){
  U.time.value+=dt;
  const t=U.time.value;
  ensurePath(ego.s+AHEAD+1100);
  // chunks
  const cA=Math.floor((ego.s-BEHIND)/CH), cB=Math.floor((ego.s+AHEAD)/CH);
  let built= rebuildBudget>0 ? -3 : 0; if(rebuildBudget>0) rebuildBudget--;
  for(let ci=Math.max(0,cA);ci<=cB;ci++){ if(!chunks.has(ci) && built<1){ const t0=performance.now(); chunks.set(ci,buildChunk(ci)); perf.chunk(performance.now()-t0); built++; } }
  for(const [ci,c] of chunks){ if(ci<cA||ci>cB+1){ disposeChunk(c); chunks.delete(ci); } else for(const m of c.appearMats){ m.uniforms.uAppear.value=Math.min(1,(t-c.born)/2.5); } }
  trimPath(ego.s-1200);
  // traffic & ego
  const prevS=ego.s;
  updateTraffic(dt);
  const f=frameAt(ego.s,_f);
  // joints
  const jsp=f.sec.type==='bay'?100:40;
  if(!f.enc && f.y>4 && Math.floor(ego.s/jsp)!==Math.floor(prevS/jsp)){ sound.joint(ego.v); radio?.joint(); state.bumpV+=0.05; setTimeout(()=>{state.bumpV+=0.035;},2700/Math.max(ego.v,3)); }
  state.bumpV+= (-state.bump*160 - state.bumpV*14)*dt; state.bump+=state.bumpV*dt;
  // passing sounds
  for(const c of cars){
    const rel=c.s-ego.s;
    const prev=sameDirPrev.get(c);
    if(prev!==undefined && Math.sign(prev)!==Math.sign(rel) && Math.abs(rel)<30){
      const big=c.type.k==='truck'||c.type.k==='bus';
      if(c.dir<0){ if(state.tunnel<0.5) sound.whoosh(0.75,(big?0.22:0.1),big?1.3:0.9); }
      else if(c.lane!==ego.lane) sound.whoosh(c.lane>ego.lane?0.5:-0.5,big?0.18:0.08,1.6);
    }
    sameDirPrev.set(c,rel);
  }
  if(sameDirPrev.size>200){ for(const k of sameDirPrev.keys()) if(!cars.includes(k)) sameDirPrev.delete(k); }
  // blinker
  if(ego.blink){ const ph=Math.floor(t*2.8); if(ph!==state.blinkPh){ state.blinkPh=ph; sound.tick(ph%2===0); } }
  // tunnel state
  if(f.enc && !wasEnc) sound.whump();
  wasEnc=f.enc;
  state.tunnel+= ((f.enc?1:0)-state.tunnel)*(1-Math.exp(-dt*2.5));
  updateWeather(dt);
  // 時間の流れ: 深夜から夜明けへ
  { const m=state.dawnMode; const el=t-state.dawnStart;
    const target= m==='dawn60'?clamp(el/3600,0,1): m==='dawn20'?clamp(el/1200,0,1): m==='dawn'?0.75:0;
    state.dawn+= (target-state.dawn)*(1-Math.exp(-dt*0.25));
    const d=state.dawn, open=1-state.tunnel; U.dawn.value=d;
    U.hazeCol.value.setRGB(lerp(FOG_COLOR.r,0.40,d),lerp(FOG_COLOR.g,0.36,d),lerp(FOG_COLOR.b,0.40,d)); (scene.fog as THREE.FogExp2).color.copy(U.hazeCol.value);
    hemi.color.setRGB(0.05+0.75*d*open,0.05+0.95*d*open,0.08+1.35*d*open); hemi.groundColor.setRGB(0.03+0.4*d*open,0.025+0.36*d*open,0.02+0.34*d*open); }
  // スリープタイマー: 最後の3分で音と画面をゆっくり落とす
  if(state.sleepEnd>0){ const remain=(state.sleepEnd-performance.now())/1000; state.sleepFade=clamp(1-remain/180,0,1); }
  else state.sleepFade+=(0-state.sleepFade)*(1-Math.exp(-dt*2));
  if(Math.abs(state.sleepFade-sleepShown)>0.002){ sleepShown=state.sleepFade; sleepVeil.style.opacity=String(Math.pow(sleepShown,1.4)); sound.setDuck(1-sleepShown);
    sleepVeil.style.pointerEvents= sleepShown>0.5?'auto':'none'; }
  // 目の順応: 明るい場所（トンネル内など）ではゆっくり絞り、暗い場所では開く
  { const La=lightAt(ego.s,ego.u,1.4); const lum=(La[0]+La[1]+La[2])/3;
    const target=clamp(1.22-0.30*Math.log2(1+lum*2.2),0.62,1.25);
    state.exposure+=(lerp(1,target,state.adapt)-state.exposure)*(1-Math.exp(-dt*(target<state.exposure?1.1:0.45))); }
  updateCamera(dt,f);
  if(dbg.on) updateDebug(dt,f);
  // world-following objects
  sky.position.copy(camera.position);
  ground.position.set(camera.position.x,0,camera.position.z);
  skyline.position.set(camera.position.x,0,camera.position.z);
  skylineLights.position.copy(skyline.position);
  U.blink.value= (t%1.5)<0.75 ? 1:0.08;
  MAT.redBlink.color.setRGB(6*U.blink.value,0.2*U.blink.value,0.1*U.blink.value);
  for(const a of animated) a.userData.tick&&a.userData.tick(t);
  // planes
  const pa=planes.mesh.geometry.attributes; let k=0;
  for(const pl of planes){
    if(!pl.alive || Math.hypot(pl.x-camera.position.x,pl.z-camera.position.z)>6500) respawnPlane(pl,camera.position.x,camera.position.z);
    pl.x+=pl.vx*dt; pl.z+=pl.vz*dt; pl.y=Math.max(150,pl.y+pl.vy*dt);
    const hx=pl.vx/80, hz=pl.vz/80; const sx=-hz*16, sz=hx*16;
    const strobe=((t+pl.ph)%1.3)<0.06||(((t+pl.ph)%1.3)>0.16&&((t+pl.ph)%1.3)<0.2);
    const beacon=((t+pl.ph*0.7)%1.0)<0.12;
    const L=[[pl.x+sx,pl.y,pl.z+sz,1,0.1,0.05],[pl.x-sx,pl.y,pl.z-sz,0.1,1,0.3],[pl.x,pl.y+2,pl.z,beacon?1.6:0,beacon?0.1:0,0],[pl.x,pl.y,pl.z,strobe?3:0.25,strobe?3:0.22,strobe?3:0.2]];
    for(const q of L){ pa.position.array.set(q.slice(0,3),k*3); pa.color.array.set(q.slice(3),k*3); k++; }
  }
  pa.position.needsUpdate=true; pa.color.needsUpdate=true;
  // rain
  const vel=_vel.set(f.dx*ego.v,0,f.dz*ego.v);
  rainDisp.x+=-vel.x*dt+Math.sin(t*0.3)*0.6*dt; rainDisp.y+=-11*dt; rainDisp.z+=-vel.z*dt;
  rainLines.material.uniforms.uVel.value.set(-vel.x,-11,-vel.z);
  rainLines.material.uniforms.uAmt.value=state.rain*(1-state.tunnel);
  const L0=lightAt(ego.s,ego.u,4); rainLines.material.uniforms.uLight.value.setRGB(0.05+L0[0]*0.12,0.05+L0[1]*0.12,0.06+L0[2]*0.12);
  rainLines.visible=state.rain>0.01;
  // 車内: 街灯の光とメーター
  updateInterior(dt);
  if(f.sec.id!==lastSecId){ lastSecId=f.sec.id; const sc=f.sec;
    setRoadName(sc.type==='tunnel'?sc.name[0]: sc.type==='bay'?'湾港線 オーロラブリッジ':'C1 都芯環状線'); }
  updateDrops(dt);
  renderTraffic();
  audioFrame({v:ego.v,acc:ego.acc,tunnel:state.tunnel,wet:state.wet,rain:state.rain*(1-state.tunnel),dt});
  // water / reflection points
  if(Math.abs(ego.s-lastWaterS)>60){ waterNear=waterPoints(); lastWaterS=ego.s; }
}
/** 生成済みの道路をすべて作り直す。近い所から順に、数フレームかけて再生成される。 */
export function rebuildWorld(){ for(const c of chunks.values()) disposeChunk(c); chunks.clear(); rebuildBudget=40; }
let rebuildBudget=0;
export function render(){
  frameN++;
  gpuBegin();
  const useRefl = quality!=='low' && settings.get<boolean>('gfx.reflect');
  if(useRefl && waterNear && camera.position.y>8){ U.reflWater.value=1; U.reflRoad.value=0; renderReflection(0.0); }
  else if(useRefl && state.wet>0.04 && !waterNear && !dbg.on){ U.reflWater.value=0; U.reflRoad.value=1; const f=frameAt(ego.s,_f2); renderReflection(f.y+0.02); }
  else { U.reflWater.value=0; U.reflRoad.value=0; }
  if(state.view==='interior' && !dbg.on && !dbg.noMirror && quality!=='low' && settings.get<boolean>('gfx.mirror') && frameN%2===0){
    const saved=U.reflRoad.value; U.reflRoad.value=0; rainLines.visible=false;
    renderer.setRenderTarget(mirrorRT); renderer.clear(); renderer.render(scene,rearCam); renderer.setRenderTarget(null);
    U.reflRoad.value=saved; rainLines.visible=state.rain>0.01;
  }
  finalU.uExposure.value=state.exposureBase*state.exposure;
  renderFrame();
  gpuEnd();
}
export function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setPixelRatio(PR); renderer.setSize(w,h);
  camera.aspect=w/h; camera.updateProjectionMatrix(); icam.aspect=w/h; icam.updateProjectionMatrix();
  resizePost();
  if(reflRT) reflRT.setSize(Math.round(w*PR*post.scale*0.5),Math.round(h*PR*post.scale*0.5));
  U.pr.value=PR*post.scale;
}
addEventListener('resize',resize);
export async function boot(){
  try{ await Promise.race([Promise.all([document.fonts.load(`700 40px "Noto Sans JP"`),document.fonts.load(`900 40px "Noto Sans JP"`),document.fonts.load(`400 40px "Noto Sans JP"`)]),new Promise(r=>setTimeout(r,2500))]); }catch(e){}
  makeBaseTextures(); makeSignTextures(); makeMaterials(); makeSharedGeometry();
  makeWorld(); makeTraffic(); makeRain(); makeInterior(); makePost(); makeDebug();
  makeReflRT();
  resize();
  ensurePath(ego.s+AHEAD+1100);
  const cA=Math.floor((ego.s-BEHIND)/CH), cB=Math.floor((ego.s+AHEAD)/CH);
  for(let ci=Math.max(0,cA);ci<=cB;ci++) chunks.set(ci,buildChunk(ci));
  for(const c of chunks.values()) c.born=-10;
  // seed traffic
  for(let i=0;i<12;i++){ const lane=i%2; newCar(1,lane,ego.s+60+i*85+rr(-15,15),(lane?21:18.5)+rr(-1,1)); }
  for(let i=0;i<10;i++){ newCar(-1,i%2,ego.s+80+i*140+rr(-20,20),rr(18,22)); }
  waterNear=waterPoints();
  initAutoscale(); if(!params.has('frames')) loadHint(); autoscale.onChange=s=>{ post.scale=s; resize(); }; autoscale.onTier=applyAA;
  settings.applyAll();
  if(params.has('rain')){ state.weatherMode='rain'; state.rain=0.9; state.wet=1; document.getElementById('bWeather').textContent='天気: 雨'; }
  if(params.has('skip')) { const s=parseFloat(params.get('skip')); ego.s=s; ensurePath(ego.s+AHEAD+1100); for(const c of chunks.values()) disposeChunk(c); chunks.clear(); cars.length=0;
    const cA2=Math.floor((ego.s-BEHIND)/CH), cB2=Math.floor((ego.s+AHEAD)/CH); for(let ci=cA2;ci<=cB2;ci++) chunks.set(ci,buildChunk(ci)); for(const c of chunks.values()) c.born=-10; waterNear=waterPoints(); }
  if(params.has('clean')) setView('clean');
  if(params.has('debug')) setDebug(true);
  if(params.has('perf')) togglePerf(true);
  (window as any).__pathArr=()=>P.arr; (window as any).__dbg={radioNow:()=>radio?`${radio.station().name} / ${radio.title}`:'(未開始)',Radio,radioParams,Sound,THREE,iscene,TYPES,newCar,ego,sections,state,cars,chunks,U,renderer,scene,settings,dbg,post,finalU,interiorPass,autoscale,get world(){return {sky,ground,skyline,skylineLights};}}; (window as any).__perf=perf;
  const go=document.getElementById('go') as HTMLButtonElement; go.disabled=false; go.textContent='▶  出発';
  let last=performance.now()/1000;
  const loop=()=>{ requestAnimationFrame(loop); const nowMs=performance.now(); const now=nowMs/1000; perf.frame(nowMs); autoscaleTick((now-last)*1000); const dt=Math.min(0.05,now-last); last=now;
    update(dt); if(!isAsleep()) render(); perf.cpu(performance.now()-nowMs); updatePerfHud(dt); };
  if(params.has('frames')){ // deterministic stepping for testing
    const n=parseInt(params.get('frames')); for(let i=0;i<n;i++) update(1/30); render(); (window as any).__ready=true;
    (window as any).__step=(k,d=1/30)=>{ for(let i=0;i<k;i++) update(d); render(); };
  } else loop();
}
boot();
