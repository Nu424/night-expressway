import { icam, rearCam } from './interior';
import { LANES, U } from '../core/globals';
import { camState, dbg, state } from '../core/state';
import { clamp, lerp , V3 } from '../core/util';
import { camera } from '../render/renderer';
import { _f2, ego } from '../traffic/traffic';
const _v1=new V3();
import { frameAt } from '../world/path';

export function updateCamera(dt,f){
  if(dbg.on){
    const tx=f.x+f.rx*ego.u, tz=f.z+f.rz*ego.u, ty=f.y;
    const wy=f.h+dbg.yaw; const cp=Math.cos(dbg.pitch);
    camera.position.set(tx-Math.sin(wy)*cp*dbg.dist, ty+Math.sin(dbg.pitch)*dbg.dist, tz+Math.cos(wy)*cp*dbg.dist);
    camera.up.set(0,1,0); camera.lookAt(tx,ty,tz); camera.updateMatrixWorld();
    rearCam.position.copy(camera.position); rearCam.updateMatrixWorld();
    return;
  }
  const u=ego.u+0.38;
  const camY=f.y+1.22+state.bump;
  const px=f.x+f.rx*u, pz=f.z+f.rz*u;
  // head bob/noise
  const t=U.time.value;
  const nx=Math.sin(t*1.7)*0.004+Math.sin(t*3.9)*0.002, ny=Math.sin(t*2.3)*0.003+Math.sin(t*6.1+1)*0.0015*(ego.v/20);
  camera.position.set(px+nx,camY+ny,pz);
  const la=10+ego.v*0.55;
  const f2=frameAt(ego.s+la,_f2);
  const uT= ego.lc>=0? lerp(ego.u,LANES[ego.lane],0.5)+0.38 : u;
  const tgt=_v1.set(f2.x+f2.rx*uT,f2.y+1.0,f2.z+f2.rz*uT);
  if(!camState.init){camState.look.copy(tgt);camState.init=true;}
  camState.look.lerp(tgt,1-Math.exp(-dt*6));
  camera.up.set(0,1,0);
  camera.lookAt(camState.look);
  const k=(f2.h-f.h)/la; const rollT=clamp(-k*ego.v*ego.v*0.02,-0.025,0.025);
  camState.roll+= (rollT-camState.roll)*(1-Math.exp(-dt*2));
  camera.rotateZ(camState.roll);
  camera.updateMatrixWorld();
  // rear cam
  rearCam.position.set(f.x+f.rx*(ego.u-0.05),f.y+1.3,f.z+f.rz*(ego.u-0.05));
  rearCam.lookAt(f.x-f.dx*40+f.rx*(ego.u-0.05),f.y+0.6,f.z-f.dz*40+f.rz*(ego.u-0.05));
  rearCam.updateMatrixWorld();
}
