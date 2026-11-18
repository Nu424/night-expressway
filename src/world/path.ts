import { tune } from '../core/state';
import { LAMP_COLORS, STEP, TUNNEL_NAMES } from '../core/globals';
import { R, clamp, lerp, pick, rr } from '../core/util';

export const sections=[]; let secEnd=0;
/** 都市区間の合間に挟む区間。先頭ほど長く出ていない。初期の並びは、旧版（トンネル→湾岸の交互）と同じ出方になるようにしてある。 */
const recent=['tunnel','bay','industrial','jct'];
export const JCT_NAMES=['箱芝JCT','辰海JCT','大井田JCT','江戸浜JCT','浮島橋JCT'];
export function addSection(){
  const prev=sections.length?sections[sections.length-1].type:null;
  let type;
  if(!prev) type='city';
  else if(prev!=='city') type='city';
  else { // ルートの好み: 乱数の消費回数は変えず、選ぶ確率だけを動かす
    const r=R(), pref=tune.route, last=recent[recent.length-1];
    if(recent.includes(pref)) type = last===pref ? (r<0.15?recent[0]:pref) : (r<0.97?pref:recent[0]);
    else type = r<0.88?recent[0]:recent[1];
    recent.splice(recent.indexOf(type),1); recent.push(type); }
  let len;
  if(type==='city') len = prev? Math.round(rr(18,28)*(tune.route==='city'?1.8:tune.route==='auto'?1:0.6))*100 : 2400;
  else if(type==='tunnel') len = Math.round(rr(17,24))*100;
  else if(type==='industrial') len = Math.round(rr(24,30))*100;
  else if(type==='jct') len = Math.round(rr(24,26))*100;
  else len = Math.round(rr(27,32))*100;
  const sec:any={type,start:secEnd,len,end:secEnd+len,id:sections.length,
    baseY:rr(13,19),phase:rr(0,6.28),
    lamp: type==='city'?pick(['sodium','warm','warm','white']): type==='tunnel'?pick(['sodium','sodium','warm']): type==='industrial'?pick(['sodium','sodium','white']):pick(['white','warm'])};
  if(type==='tunnel'){ sec.encStart=700; sec.encEnd=len-100; sec.name=pick(TUNNEL_NAMES); }
  if(type==='bay'){ const mid=Math.round(len/200)*100; sec.mid=mid; sec.t1=mid-400; sec.t2=mid+400; sec.a1=sec.t1-360; sec.a2=sec.t2+360; }
  if(type==='industrial'){ sec.wa=400; sec.wb=Math.round(len*0.55/100)*100; }   // 左手が運河になる範囲
  if(type==='jct'){ sec.mid=Math.round(len/200)*100; sec.name=JCT_NAMES[sec.id%JCT_NAMES.length]; }
  sec.lampOwn=sec.lamp; if(tune.lamp!=='auto') sec.lamp=tune.lamp;
  sec.col=LAMP_COLORS[sec.lamp];
  sec.fam = (type==='bay'||type==='jct')
    ? [{sp:50,off:0,u:-2.9,h:12,I:1.4},{sp:50,off:0,u:2.9,h:12,I:1.4}]
    : [{sp:40,off:0,u:-7.3,h:10,I:1.6},{sp:40,off:20,u:7.3,h:10,I:1.6}];
  sections.push(sec); secEnd+=len;
}
export let _secC=null;
export function secAt(s){
  if(_secC && s>=_secC.start && s<_secC.end) return _secC;
  while(secEnd<=s+1) addSection();
  for(let i=sections.length-1;i>=0;i--) if(sections[i].start<=s){_secC=sections[i];return _secC;}
  return sections[0];
}
/** 区間内の位置 l に街灯を立てないなら true（トンネル内、JCT の交差道路の真下） */
export function lampSkip(sec,l){ return sec.type==='tunnel' ? (l>=sec.encStart-20 && l<sec.encEnd+20) : sec.type==='jct' ? Math.abs(l-sec.mid)<16 : false; }
export function isEnc(sec,ls){return sec.type==='tunnel' && ls>=sec.encStart && ls<sec.encEnd;}

export const P={first:0,arr:[],h:0,k:0,kT:0,kTimer:0,x:0,z:0,y:16,slope:0};
export function genSample(){
  const i=P.first+P.arr.length, s=i*STEP;
  const sec=secAt(s), ls=s-sec.start;
  P.kTimer-=STEP;
  if(P.kTimer<=0){
    const maxK = sec.type==='city'?1/230 : sec.type==='tunnel'?1/420 : sec.type==='industrial'?1/650 : sec.type==='jct'?1/900 : 1/2600;
    let t = R()<0.25?0:rr(0.35,1)*maxK*(R()<0.5?-1:1);
    if(P.h>0.55) t=-Math.abs(t)-maxK*0.3;
    if(P.h<-0.55) t=Math.abs(t)+maxK*0.3;
    P.kT=t; P.kTimer=rr(140,420);
  }
  let kT=P.kT;
  if(sec.type==='bay' && ls>sec.a1-250 && ls<sec.a2+250) kT=0;
  if(sec.type==='jct' && Math.abs(ls-sec.mid)<1020) kT=0;
  P.k+=clamp(kT-P.k,-0.00005*STEP,0.00005*STEP);
  let ty;
  if(sec.type==='city') ty=sec.baseY+3.5*Math.sin(ls/260+sec.phase);
  else if(sec.type==='tunnel') ty=1.0;
  else if(sec.type==='industrial') ty=12+1.5*Math.sin(ls/300+sec.phase);
  else if(sec.type==='jct') ty=22;
  else ty=42;
  const desired=clamp((ty-P.y)*0.02,-0.045,0.045);
  P.slope+=clamp(desired-P.slope,-0.0009*STEP,0.0009*STEP);
  const a={i,s,x:P.x,y:P.y,z:P.z,h:P.h,slope:P.slope,sec,ls,enc:isEnc(sec,ls),
    dx:Math.sin(P.h),dz:-Math.cos(P.h),rx:Math.cos(P.h),rz:Math.sin(P.h)};
  P.arr.push(a);
  P.h+=P.k*STEP;
  P.x+=Math.sin(P.h)*STEP; P.z+=-Math.cos(P.h)*STEP; P.y+=P.slope*STEP;
}
export function S(i){ if(i<P.first) i=P.first; return P.arr[i-P.first]; }
export function ensurePath(s){ while((P.first+P.arr.length-1)*STEP<s) genSample(); }
export function trimPath(s){ const n=Math.floor(s/STEP)-P.first; if(n>0){P.arr.splice(0,n);P.first+=n;} }
export function frameAt(s,o){
  const fi=s/STEP; let i=Math.floor(fi); let t=fi-i;
  if(i<P.first){i=P.first;t=0;}
  const a=S(i), b=S(i+1)||a;
  o.x=lerp(a.x,b.x,t); o.y=lerp(a.y,b.y,t); o.z=lerp(a.z,b.z,t);
  o.h=lerp(a.h,b.h,t); o.slope=lerp(a.slope,b.slope,t);
  o.dx=Math.sin(o.h); o.dz=-Math.cos(o.h); o.rx=Math.cos(o.h); o.rz=Math.sin(o.h);
  o.sec=a.sec; o.enc=a.enc; o.ls=s-a.sec.start;
  return o;
}

/** 街灯の色を全区間で切り替える（'auto' は区間ごとの元の色）。照明は頂点に焼き込んであるので、呼んだ側でチャンクを作り直す。 */
export function setLampOverride(k){ tune.lamp=k; for(const sec of sections){ sec.lamp= k==='auto'?sec.lampOwn:k; sec.col=LAMP_COLORS[sec.lamp]; } }
