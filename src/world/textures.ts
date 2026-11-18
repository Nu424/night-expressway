import * as THREE from 'three';
import { TUNNEL_NAMES } from '../core/globals';
import { FONT } from '../core/util';
import { canvas } from '../render/renderer';
import { P } from './path';

export function canvasTex(w,h,draw,srgb=true){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const x=c.getContext('2d'); draw(x,w,h);
  const t=new THREE.CanvasTexture(c); if(srgb) t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=8; t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
export function rrect(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
export let TEX:any={};
export function makeBaseTextures(){
  TEX.asphalt=canvasTex(256,256,(x,w,h)=>{
    const id=x.createImageData(w,h);
    for(let i=0;i<w*h;i++){let v=118+(Math.random()-0.5)*50; if(Math.random()<0.03) v+=50; id.data[i*4]=v;id.data[i*4+1]=v;id.data[i*4+2]=v*1.02;id.data[i*4+3]=255;}
    x.putImageData(id,0,0);
    x.globalAlpha=0.035; x.fillStyle='#000';
    for(let i=0;i<14;i++){x.fillRect(Math.random()*w,0,4+Math.random()*10,h);}
  });
  TEX.concrete=canvasTex(256,256,(x,w,h)=>{
    // コンクリート: 細かな粒と大きなむら、雨だれの淡い筋。板目に見える強い線は入れない。
    x.fillStyle='#8a8a86';x.fillRect(0,0,w,h);
    const id=x.getImageData(0,0,w,h);
    for(let i=0;i<w*h;i++){const n=(Math.random()-0.5)*18; for(let k=0;k<3;k++) id.data[i*4+k]+=n;}
    x.putImageData(id,0,0);
    for(let i=0;i<26;i++){ const cx=Math.random()*w, cy=Math.random()*h, r=20+Math.random()*50; const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
      const c=Math.random()<0.5?'40,40,40':'190,190,185'; g.addColorStop(0,`rgba(${c},0.10)`); g.addColorStop(1,`rgba(${c},0)`); x.fillStyle=g; x.fillRect(cx-r,cy-r,r*2,r*2); }
    for(let i=0;i<7;i++){ const y=Math.random()*h, t=3+Math.random()*9, len=w*(0.3+Math.random()*0.6); const g=x.createLinearGradient(0,0,len,0);
      g.addColorStop(0,'rgba(30,30,30,0.16)'); g.addColorStop(1,'rgba(30,30,30,0)'); x.fillStyle=g; x.fillRect(0,y,len,t); }
    x.globalAlpha=0.35;x.fillStyle='#3a3a3a';x.fillRect(0,0,w,2);
  });
  TEX.tile=canvasTex(256,256,(x,w,h)=>{
    x.fillStyle='#d8d4c8';x.fillRect(0,0,w,h);
    x.strokeStyle='#8a877e';x.lineWidth=3;
    for(let i=0;i<=4;i++){x.beginPath();x.moveTo(0,i*64);x.lineTo(w,i*64);x.stroke();}
    for(let i=0;i<=2;i++){x.beginPath();x.moveTo(i*128,0);x.lineTo(i*128,h);x.stroke();}
    const id=x.getImageData(0,0,w,h);
    for(let i=0;i<w*h;i++){const n=(Math.random()-0.5)*14; for(let k=0;k<3;k++) id.data[i*4+k]+=n;}
    x.putImageData(id,0,0);
  });
  TEX.dash=canvasTex(4,64,(x,w,h)=>{x.clearRect(0,0,w,h);x.fillStyle='#fff';x.fillRect(0,0,w,Math.round(h*0.4));},false);
  TEX.dash.wrapS=TEX.dash.wrapT=THREE.RepeatWrapping;
}

export function drawSign(x,w,h,sg){
  x.fillStyle='#0d6b40';x.fillRect(0,0,w,h);
  x.strokeStyle='#f2f2ee';x.lineWidth=9;rrect(x,16,16,w-32,h-32,20);x.stroke();
  x.textBaseline='middle';
  if(sg.badge){
    x.fillStyle='#fff';rrect(x,46,40,sg.badge.length>1?130:96,84,14);x.fill();
    x.fillStyle='#0d6b40';x.font=`900 60px ${FONT}`;x.textAlign='center';x.fillText(sg.badge,46+(sg.badge.length>1?65:48),84);
    x.fillStyle='#fff';x.textAlign='left';x.font=`700 62px ${FONT}`;x.fillText(sg.title,sg.badge.length>1?200:166,84);
  } else if(sg.exit){
    x.fillStyle='#fff';rrect(x,46,40,250,84,14);x.fill();
    x.fillStyle='#0d6b40';x.font=`900 54px ${FONT}`;x.textAlign='center';x.fillText('出口 EXIT',171,84);
  } else if(sg.title){
    x.fillStyle='#fff';x.textAlign='left';x.font=`700 62px ${FONT}`;x.fillText(sg.title,54,84);
  }
  sg.rows.forEach((r,i)=>{
    const y=196+i*108;
    x.fillStyle='#fff';x.textAlign='left';x.font=`700 78px ${FONT}`;x.fillText(r[0],70,y);
    const wj=x.measureText(r[0]).width;
    x.font=`400 38px ${FONT}`;x.fillText(r[1],90+wj,y+10);
  });
  if(sg.dist){x.font=`700 64px ${FONT}`;x.textAlign='right';x.fillStyle='#fff';x.fillText(sg.dist,w-56,h-62);}
  else {
    x.fillStyle='#fff';x.beginPath();const ax=w-110,ay=h-150;
    x.moveTo(ax,ay-70);x.lineTo(ax+46,ay-10);x.lineTo(ax+16,ay-10);x.lineTo(ax+16,ay+60);x.lineTo(ax-16,ay+60);x.lineTo(ax-16,ay-10);x.lineTo(ax-46,ay-10);x.closePath();x.fill();
  }
}
export const SIGNS=[
  {badge:'C1',title:'都芯環状線',rows:[['銀坂','Ginzaka'],['霞ヶ原','Kasumigahara']]},
  {badge:'B',title:'湾港線',rows:[['羽根田空港','Haneta Airport'],['横濱浦','Yokohamaura']]},
  {badge:'11',title:'台浜線',rows:[['お台浜','Odaihama'],['有明洲','Ariakesu']]},
  {badge:'4',title:'新宿場線',rows:[['新宿場','Shinjukuba'],['中原道','Nakahara Expwy']]},
  {badge:'3',title:'渋原線',rows:[['渋原','Shibuhara'],['東湘道','Tosho Expwy']]},
  {badge:'6',title:'向洲線',rows:[['箱碕','Hakosaki'],['向洲','Mukosu']]},
  {badge:'C2',title:'外郭環状線',rows:[['池野袋','Ikenobukuro'],['葛浜','Kuzuhama']]},
  {exit:true,rows:[['芝之浦','Shibanoura']],dist:'500m'},
  {exit:true,rows:[['汐見留','Shiomidome']],dist:'1km'},
  {title:'浜碕橋 JCT',rows:[['オーロラブリッジ','Aurora Bridge']],dist:'1km'},
];
export const LED_TEXTS=[['この先','渋滞なし'],['C1 外回り','順調'],['車間距離','確保'],['湾港線','流れています'],['事故多発','注意'],['所要時間','新宿場 12分'],['速度','落とせ']];
export function ledTex(lines,color='#ffa630'){
  return canvasTex(768,192,(x,w,h)=>{
    x.fillStyle='#050505';x.fillRect(0,0,w,h);
    const lw=128,lh=32; const c=document.createElement('canvas');c.width=lw;c.height=lh;const cx=c.getContext('2d');
    cx.fillStyle='#000';cx.fillRect(0,0,lw,lh);cx.fillStyle='#fff';cx.textBaseline='middle';cx.textAlign='center';
    cx.font=`700 13px ${FONT}`;cx.fillText(lines[0],lw/2,8.5);cx.fillText(lines[1],lw/2,24);
    const d=cx.getImageData(0,0,lw,lh).data;const sx=w/lw,sy=h/lh;
    for(let j=0;j<lh;j++)for(let i=0;i<lw;i++){const v=d[(j*lw+i)*4];
      x.fillStyle=v>110?color:'#1a1208';x.beginPath();x.arc(i*sx+sx/2,j*sy+sy/2,sx*0.36,0,7);x.fill();}
  });
}
export function makeSignTextures(){
  TEX.signs=SIGNS.map(sg=>canvasTex(1024,420,(x,w,h)=>drawSign(x,w,h,sg)));
  TEX.leds=LED_TEXTS.map(l=>ledTex(l));
  TEX.ledRain=ledTex(['雨天','速度注意']);
  TEX.ledTunnel=ledTex(['トンネル内','車線変更禁止']);
  TEX.speed=canvasTex(256,256,(x,w,h)=>{x.clearRect(0,0,w,h);x.fillStyle='#d01818';x.beginPath();x.arc(128,128,124,0,7);x.fill();
    x.fillStyle='#f4f4f4';x.beginPath();x.arc(128,128,96,0,7);x.fill();x.fillStyle='#1d3d9c';x.font=`700 118px ${FONT}`;x.textAlign='center';x.textBaseline='middle';x.fillText('60',128,136);});
  TEX.exitSign=canvasTex(256,128,(x,w,h)=>{x.fillStyle='#0f9a4a';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.font=`900 48px ${FONT}`;x.textAlign='center';x.textBaseline='middle';x.fillText('非常口',w/2,50);x.font=`700 24px ${FONT}`;x.fillText('EMERGENCY EXIT',w/2,98);});
  TEX.tunnelPlates={};
  for(const n of TUNNEL_NAMES){TEX.tunnelPlates[n[0]]=canvasTex(1024,220,(x,w,h)=>{x.fillStyle='#24252a';x.fillRect(0,0,w,h);x.strokeStyle='#bbb';x.lineWidth=6;x.strokeRect(10,10,w-20,h-20);
    x.fillStyle='#f1f1f1';x.textAlign='center';x.textBaseline='middle';x.font=`700 100px ${FONT}`;x.fillText(n[0],w/2,92);x.font=`400 38px ${FONT}`;x.fillText(n[1],w/2,172);});}
  const BB=[['ホテル 月見','#ff5a8a'],['BAR','#59d0ff'],['P 駐車場','#4ea3ff'],['24H','#ffd25a'],['カラオケ','#ff7ae0'],['ラーメン','#ff9a3d'],['居酒屋','#ffcf6a'],['不動産','#9cff7a'],['歯科','#7ae8ff']];
  TEX.billboards=BB.map(([t,c])=>canvasTex(512,200,(x,w,h)=>{x.fillStyle='#07070a';x.fillRect(0,0,w,h);x.strokeStyle=c;x.lineWidth=6;x.shadowColor=c;x.shadowBlur=24;x.strokeRect(14,14,w-28,h-28);
    x.fillStyle=c;x.font=`900 ${t.length>4?78:104}px ${FONT}`;x.textAlign='center';x.textBaseline='middle';x.fillText(t,w/2,h/2+6);x.shadowBlur=0;x.fillStyle='#fff';x.globalAlpha=0.55;x.fillText(t,w/2,h/2+6);}));
}
