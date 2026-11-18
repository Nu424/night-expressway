import { sstep } from '../core/util';
import { lampSkip, secAt } from './path';

export const _L=[0,0,0];
export function lightAt(s,u,y,out=_L){
  const sec=secAt(s), ls=s-sec.start, c=sec.col;
  out[0]=out[1]=out[2]=0.018;
  if(sec.type==='tunnel' && ls>=sec.encStart-1 && ls<=sec.encEnd+1 && u<1.3){
    const d1=(u+10.1)**2+(y-5.5)**2, d2=(u-0.1)**2+(y-5.5)**2;
    let b=2.4/(1+d1/9)+2.4/(1+d2/9)+0.3;
    b*=1+0.16*Math.cos(s*Math.PI*0.5);
    b*=1+1.6*sstep(140,0,ls-sec.encStart)+0.7*sstep(90,0,sec.encEnd-ls);
    out[0]+=c[0]*b; out[1]+=c[1]*b; out[2]+=c[2]*b;
    return out;
  }
  let e=0;
  if(sec.type==='jct' && Math.abs(ls-sec.mid)<40){   // 交差道路の桁下照明
    for(const lu of [-6.2,-2.6,2.6,6.2]){ const ds=ls-sec.mid, du=u-lu, dy=y-8.5; e+=Math.min(0.9,0.5*8.5*8.5*8.5/Math.pow(ds*ds*0.5+du*du+dy*dy+1,1.5)); } }
  for(const f of sec.fam){
    const k0=Math.ceil((s-60-f.off)/f.sp), k1=Math.floor((s+60-f.off)/f.sp);
    for(let k=k0;k<=k1;k++){
      const sl=k*f.sp+f.off;
      if(lampSkip(sec,sl-sec.start)) continue;
      const ds=s-sl, du=u-f.u, dy=y-f.h;
      const d2=ds*ds+du*du+dy*dy+1;
      e+=Math.min(f.I*1.25, f.I*f.h*f.h*f.h/Math.pow(d2,1.5));
    }
  }
  out[0]+=c[0]*e; out[1]+=c[1]*e; out[2]+=c[2]*e;
  return out;
}
