import * as THREE from 'three';
import { AHEAD, BEHIND, CH, SPC, STEP } from '../core/globals';
import { dbg, state } from '../core/state';
import { clamp, lerp } from '../core/util';
import { interiorPass } from '../render/post';
import { canvas, headlight, scene } from '../render/renderer';
import { cars, ego } from '../traffic/traffic';
import { clearDrops } from '../weather/drops';
import { chunks } from '../world/chunks';
import { P, S, sections } from '../world/path';

export const SEC_COL={city:[1.0,0.72,0.3],tunnel:[1.0,0.3,0.75],bay:[0.3,0.75,1.0]};
export const SEC_JP={city:'都市高架',tunnel:'トンネル',bay:'湾岸・橋'};
export function makeDebug(){
  dbg.group=new THREE.Group(); dbg.group.visible=false; scene.add(dbg.group);
  const NP=2400;
  const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(NP*3),3)); lg.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(NP*3),3));
  dbg.path=new THREE.Line(lg,new THREE.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,fog:false,toneMapped:false}));
  dbg.path.frustumCulled=false; dbg.path.renderOrder=50; dbg.group.add(dbg.path);
  dbg.beads=new THREE.Points(lg,new THREE.PointsMaterial({size:5,sizeAttenuation:false,vertexColors:true,depthTest:false,transparent:true,fog:false,toneMapped:false}));
  dbg.beads.frustumCulled=false; dbg.beads.renderOrder=50; dbg.group.add(dbg.beads);
  const NT=120;
  const tg=new THREE.BufferGeometry(); tg.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(NT*2*3),3)); tg.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(NT*2*3),3));
  dbg.ticks=new THREE.LineSegments(tg,new THREE.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,fog:false,toneMapped:false}));
  dbg.ticks.frustumCulled=false; dbg.ticks.renderOrder=51; dbg.group.add(dbg.ticks);
  dbg.ego=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.8,5.2).translate(0,0.9,0),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0.2,3,3),fog:false,toneMapped:false}));
  dbg.group.add(dbg.ego);
  dbg.beacon=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.6,60,8).translate(0,30,0),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0.1,1.5,1.5),fog:false,toneMapped:false,transparent:true,opacity:0.6,depthTest:false}));
  dbg.group.add(dbg.beacon);
  dbg.el=document.getElementById('dbgInfo');
  canvas.addEventListener('pointerdown',e=>{ if(!dbg.on) return; dbg.drag={x:e.clientX,y:e.clientY}; document.body.classList.add('dragging'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove',e=>{ if(!dbg.on||!dbg.drag) return; dbg.yaw-= (e.clientX-dbg.drag.x)*0.006; dbg.pitch=clamp(dbg.pitch+(e.clientY-dbg.drag.y)*0.005,0.08,1.52); dbg.drag={x:e.clientX,y:e.clientY}; });
  canvas.addEventListener('pointerup',()=>{ dbg.drag=null; document.body.classList.remove('dragging'); });
  canvas.addEventListener('wheel',e=>{ if(!dbg.on) return; e.preventDefault(); dbg.dist=clamp(dbg.dist*Math.exp(e.deltaY*0.0012),25,4200); },{passive:false});
}
export function setDebug(on){
  dbg.on=on; dbg.group.visible=on; document.body.classList.toggle('debug',on);
  dbg.el.style.display=on?'block':'none';
  document.getElementById('bDebug').textContent=on?'運転席へ':'俯瞰';
  interiorPass.enabled= !on && state.view==='interior';
  headlight.intensity=on?0:140;
  if(on) clearDrops();
}
export function updateDebug(dt,f){
  dbg.fps=lerp(dbg.fps,1/Math.max(dt,1e-3),0.05);
  dbg.ego.position.set(f.x+f.rx*ego.u,f.y,f.z+f.rz*ego.u); dbg.ego.rotation.set(0,-f.h,0);
  dbg.beacon.position.copy(dbg.ego.position); dbg.beacon.scale.y=Math.max(1,dbg.dist/400);
  dbg.t-=dt; if(dbg.t>0) return; dbg.t=0.25;
  // path line (everything generated, every 2 samples)
  const pa=dbg.path.geometry.attributes; let n=0; const NP=pa.count;
  const stepI=Math.max(1,Math.ceil(P.arr.length/NP));
  for(let i=0;i<P.arr.length && n<NP;i+=stepI){ const a=P.arr[i]; const c=SEC_COL[a.sec.type]; const gen=chunks.has(Math.floor(a.i/SPC));
    const k=gen?1.6:0.45; pa.position.setXYZ(n,a.x,a.y+4,a.z); pa.color.setXYZ(n,c[0]*k,c[1]*k,c[2]*k); n++; }
  dbg.path.geometry.setDrawRange(0,n); pa.position.needsUpdate=true; pa.color.needsUpdate=true;
  // chunk boundary ticks
  const ta=dbg.ticks.geometry.attributes; let m=0; const keys=[...chunks.keys()].sort((a,b)=>a-b);
  const lastK=keys[keys.length-1];
  for(const ci of keys.concat([lastK+1])){ if(m>=ta.count-1) break; const a=S(ci*SPC); if(!a) continue;
    const w= ci===lastK+1?60:24; const col= ci===lastK+1?[3,0.3,0.3]:[0.9,0.9,1.0];
    ta.position.setXYZ(m,a.x-a.rx*w,a.y+4,a.z-a.rz*w); ta.color.setXYZ(m,...col); m++;
    ta.position.setXYZ(m,a.x+a.rx*w,a.y+4,a.z+a.rz*w); ta.color.setXYZ(m,...col); m++; }
  dbg.ticks.geometry.setDrawRange(0,m); ta.position.needsUpdate=true; ta.color.needsUpdate=true;
  const sec=f.sec; const nextSecs=sections.filter(q=>q.end>ego.s).slice(0,4);
  const sw=t=>`<span class="sw" style="background:rgb(${SEC_COL[t].map(v=>Math.round(Math.min(1,v)*255)).join(',')})"></span>`;
  dbg.el.innerHTML=
`<b>俯瞰デバッグ</b>   ドラッグ: 回転 / ホイール: ズーム / B: 戻る
走行距離   ${(ego.s/1000).toFixed(2)} km    速度 ${(ego.v*3.6).toFixed(0)} km/h    車線 ${ego.lane?'追越':'走行'}
現在区間   ${sw(sec.type)}${SEC_JP[sec.type]}  ${Math.round(f.ls)} / ${sec.len} m
生成済み   チャンク ${chunks.size} 個 (${CH}m 単位)  後方 ${BEHIND}m 〜 前方 ${AHEAD}m
道路データ 前方 ${Math.round((P.first+P.arr.length)*STEP-ego.s)} m 先まで
車両       ${cars.filter(c=>c.dir>0).length} 台 同方向 / ${cars.filter(c=>c.dir<0).length} 台 対向
天気       雨 ${(state.rain*100).toFixed(0)}%  路面 ${(state.wet*100).toFixed(0)}%
FPS        ${dbg.fps.toFixed(0)}
この先     ${nextSecs.map(q=>sw(q.type)+SEC_JP[q.type]+' '+((q.start-ego.s)>0?'+'+Math.round(q.start-ego.s)+'m':'走行中')).join('   ')}
<span style="opacity:.6">白線 = チャンク境界 / 赤線 = 生成の最前線 / 暗い線 = 生成待ちの道路</span>`;
}
