import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, lerp } from '../core/util';
import { lightAt } from './lighting';
import { S } from './path';

export const unitBox=new THREE.BoxGeometry(1,1,1).translate(0,0.5,0);
export const centerBox=new THREE.BoxGeometry(1,1,1);
export const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_s=new V3(),_p=new V3(),_e=new THREE.Euler();
export function propM(a,u,y,sx,sy,sz,yaw=0,abs=false){
  _q.setFromEuler(_e.set(0,-a.h+yaw,0));
  _p.set(a.x+a.rx*u,(abs?0:a.y)+y,a.z+a.rz*u);
  _s.set(sx,sy,sz);
  return _m.compose(_p,_q,_s);
}
export function inst(geo,mat,list,colors?){
  if(!list.length) return null;
  const m=new THREE.InstancedMesh(geo,mat,list.length);
  list.forEach((M,i)=>m.setMatrixAt(i,M));
  if(colors){ const c=new THREE.Color(); colors.forEach((v,i)=>{c.setRGB(v[0],v[1],v[2]);m.setColorAt(i,c);}); }
  m.computeBoundingSphere();
  return m;
}
export const _L2=[0,0,0];
export function sweep(i0,i1,strips,opt:any={}){
  const ns=i1-i0+1, nv=strips.length*ns*2;
  const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),uv=new Float32Array(nv*2),bk=new Float32Array(nv*3);
  const idx=[]; let v=0;
  const uS=opt.uS??0.25, vS=opt.vS??0.25, bs=opt.bake??1;
  for(const st of strips){
    const [u1,y1,u2,y2]=st; const du=u2-u1, dy=y2-y1, L=Math.hypot(du,dy)||1;
    const nu=-dy/L, ny=du/L;
    const base=v;
    for(let j=0;j<ns;j++){
      const a=S(i0+j);
      for(let e=0;e<2;e++){
        const u=e?u2:u1, y=e?y2:y1;
        pos[v*3]=a.x+a.rx*u; pos[v*3+1]=a.y+y; pos[v*3+2]=a.z+a.rz*u;
        nor[v*3]=a.rx*nu; nor[v*3+1]=ny; nor[v*3+2]=a.rz*nu;
        uv[v*2]=(st[4]??0)+(e?L:0)*uS; uv[v*2+1]=a.s*vS;
        if(bs>0){ lightAt(a.s,u+nu*0.3,y+ny*0.3,_L2); bk[v*3]=_L2[0]*bs; bk[v*3+1]=_L2[1]*bs; bk[v*3+2]=_L2[2]*bs; }
        v++;
      }
    }
    for(let j=0;j<ns-1;j++){ const A=base+j*2,B=A+1,C=A+2,D=A+3; idx.push(A,B,C,B,D,C); }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setAttribute('bake',new THREE.BufferAttribute(bk,3));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
export function lin(a,b,n){const r=[];for(let i=0;i<=n;i++)r.push(lerp(a,b,i/n));return r;}
export function flatStrips(us,y){const r=[];for(let i=0;i<us.length-1;i++)r.push([us[i],y,us[i+1],y]);return r;}
export function polyStrips(pts){const r=[];for(let i=0;i<pts.length-1;i++)r.push([pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]]);return r;}
export function tubeAlong(pts,r){ // square tube along polyline of V3
  const n=pts.length; const pos=[],idx=[];
  const up=new V3(0,1,0),t=new V3(),a=new V3(),b=new V3();
  for(let i=0;i<n;i++){
    t.subVectors(pts[Math.min(n-1,i+1)],pts[Math.max(0,i-1)]).normalize();
    a.crossVectors(t,up).normalize(); b.crossVectors(a,t).normalize();
    for(let k=0;k<4;k++){const an=k*Math.PI/2+Math.PI/4;const ca=Math.cos(an)*r,sa=Math.sin(an)*r;
      pos.push(pts[i].x+a.x*ca+b.x*sa,pts[i].y+a.y*ca+b.y*sa,pts[i].z+a.z*ca+b.z*sa);}
  }
  for(let i=0;i<n-1;i++)for(let k=0;k<4;k++){const k2=(k+1)%4;const A=i*4+k,B=i*4+k2,C=(i+1)*4+k,D=(i+1)*4+k2;idx.push(A,C,B,B,C,D);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeBoundingSphere();return g;
}
export let GEO:any={};
export function makeSharedGeometry(){
  const pole=new THREE.BoxGeometry(0.22,9.2,0.22).translate(0,4.6,0);
  const arm=new THREE.BoxGeometry(2.5,0.14,0.14).translate(1.25,9.0,0);
  GEO.lampPost=mergeGeometries([pole,arm]);
  const pole2=new THREE.BoxGeometry(0.26,12.2,0.26).translate(0,6.1,0);
  const arm2=new THREE.BoxGeometry(5.9,0.14,0.14).translate(0,12.0,0);
  GEO.lampPostDouble=mergeGeometries([pole2,arm2]);
  GEO.lampHead=new THREE.BoxGeometry(0.95,0.18,0.42);
  GEO.tunnelLamp=new THREE.BoxGeometry(0.22,0.16,1.35);
  GEO.jetFan=new THREE.CylinderGeometry(0.62,0.62,4.2,14,1).rotateX(Math.PI/2);
  GEO.dot=new THREE.BoxGeometry(1,1,1);
  GEO.sphere=new THREE.IcosahedronGeometry(1,1);
  GEO.plane=new THREE.PlaneGeometry(1,1);
}
