// 建物の外壁と窓。
// 近くでは窓1枚ごとに「部屋の箱」へ視線を飛ばして天井・床・壁を塗り分け（走行に合わせて視差が出る）、
// 遠くでは平均色に落としてちらつきを防ぐ。
uniform float uTime; uniform vec3 uHazeCol; uniform float uHaze; uniform float uAppear; uniform float uWinGain; uniform float uFar;
uniform float uCityLit; uniform float uCityGain; uniform float uDawn;
varying vec3 vObj; varying vec3 vN; varying vec3 vSeed; varying vec3 vSize; varying vec3 vW; varying vec3 vVd;
float hash13(vec3 p3){ p3=fract(p3*0.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }

// 部屋の内側の色。q: 窓内の位置(0..1), d: 視線(窓の幅・高さ・奥行きで正規化, d.z>0 が奥)
vec3 room(vec2 q,vec3 d,vec3 wc,float r,float office){
  vec3 inv=1.0/(abs(d)+1e-4);
  float tx=(d.x>0.0?1.0-q.x:q.x)*inv.x, ty=(d.y>0.0?1.0-q.y:q.y)*inv.y, tz=inv.z;
  float t=min(tx,min(ty,tz)); vec3 p=vec3(q,0.0)+d*t;
  float fall=mix(1.0,0.55,p.z);
  if(tz<=tx&&tz<=ty){                       // 奥の壁: 棚や掲示物のむら
    float s=hash13(vec3(floor(p.x*4.0),floor(p.y*3.0),r*91.0));
    return wc*(0.34+0.26*s)*fall;
  }
  if(ty<tx){
    if(d.y>0.0){                            // 天井: 照明の列
      float strip=mix(0.55,1.0,step(0.5,fract(p.z*(office>0.5?3.0:1.5)+r)))*mix(0.8,1.0,step(0.15,fract(p.x*2.0)));
      return wc*0.95*strip*fall;
    }
    return wc*0.2*fall;                     // 床
  }
  return wc*0.4*fall;                       // 横の壁
}

void main(){
  vec3 n=normalize(vN);
  float style=floor(vSeed.z*3.999);
  float seed=floor(vSeed.x*997.0);
  float litFrac=clamp(vSeed.y*uCityLit*(1.0-0.6*uDawn),0.0,1.0);
  vec3 day=vec3(0.80,0.90,1.10)*(1.0+uDawn*7.0);   // 夜明けの空の明るさが外壁に乗る
  float gain=uWinGain*uCityGain;
  vec3 col;
  float d=length(vW-cameraPosition);
  if(n.y>0.5){
    col=vec3(0.010,0.010,0.013)*day;
    vec2 q=abs(vObj.xz)/(vSize.xz*0.5); float e=max(q.x,q.y);
    col+=vec3(0.02,0.017,0.014)*step(0.93,e);                                   // 屋上の縁
    float mech=step(0.72,hash13(vec3(floor(vObj.xz/6.0),seed)))*step(e,0.8);    // 屋上設備
    col+=vec3(0.006)*mech;
  } else if(n.y<-0.5){ col=vec3(0.0); }
  else {
    float hc,fwid,face,dT,dN;
    if(abs(n.x)>0.5){ float sg=sign(n.x); hc=vObj.z*sg; fwid=vSize.z; face=n.x>0.0?1.0:2.0; dT=vVd.z*sg; dN=-vVd.x*sg; }
    else { float sg=sign(n.z); hc=-vObj.x*sg; fwid=vSize.x; face=n.z>0.0?3.0:4.0; dT=-vVd.x*sg; dN=-vVd.z*sg; }
    hc+=fwid*0.5;
    // 様式: 0=オフィス(横長窓) 1=集合住宅 2=ガラスの高層 3=雑居ビル
    vec2 cs = style<0.5? vec2(3.2,3.7) : style<1.5? vec2(3.6,2.9) : style<2.5? vec2(1.8,4.0) : vec2(2.6,3.3);
    vec2 g=vec2(hc,vObj.y-1.2)/cs;
    vec2 id=floor(g); vec2 f=fract(g);
    vec2 fw=fwidth(g);
    float pxs=max(fw.x,fw.y);
    vec2 lo = style<0.5? vec2(0.04,0.30) : style<1.5? vec2(0.20,0.24) : style<2.5? vec2(0.07,0.10) : vec2(0.16,0.26);
    vec2 hi = style<0.5? vec2(0.96,0.84) : style<1.5? vec2(0.80,0.76) : style<2.5? vec2(0.93,0.93) : vec2(0.84,0.80);
    vec2 aa=fw*0.8+0.001;
    float win=smoothstep(lo.x-aa.x,lo.x+aa.x,f.x)*smoothstep(hi.x+aa.x,hi.x-aa.x,f.x)*smoothstep(lo.y-aa.y,lo.y+aa.y,f.y)*smoothstep(hi.y+aa.y,hi.y-aa.y,f.y);
    float cov=(hi.x-lo.x)*(hi.y-lo.y);
    float r1=hash13(vec3(id.x,id.y,seed+face*7.13));
    float r2=hash13(vec3(floor(id.x/5.0),id.y,seed*0.37+face));
    float r3=hash13(vec3(id.y,id.x,seed+3.1));
    float r4=hash13(vec3(id.x+17.0,id.y-5.0,seed*1.7));
    float lit; vec3 wc; float office=0.0;
    if(style<0.5){ lit=step(r2,litFrac*0.9)*step(0.18,r1); wc=mix(vec3(0.74,0.86,1.0),vec3(1.0,0.88,0.72),step(0.55,hash13(vec3(id.y,seed,2.0)))); office=1.0; }
    else if(style<1.5){ lit=step(r1,litFrac*0.55); wc= r3<0.70? vec3(1.0,0.66,0.36) : (r3<0.9? vec3(1.0,0.84,0.66) : vec3(0.5,0.65,1.0)); }
    else if(style<2.5){ lit=step(r1,litFrac*0.4)*step(r2,0.75); wc=mix(vec3(0.8,0.88,1.0),vec3(1.0,0.9,0.76),step(0.7,r3)); office=1.0; }
    else { lit=step(r1,litFrac*0.75); wc= r3<0.5? vec3(1.0,0.74,0.46) : r3<0.76? vec3(0.76,0.88,1.0) : r3<0.88? vec3(1.0,0.56,0.6) : vec3(0.62,0.95,0.8); }
    if(vObj.y<1.2 || vObj.y>vSize.y-1.0) { lit=0.0; win=0.0; }
    // 明るさは大半が控えめ、ごく一部だけ明るい
    float inten=(0.16+0.95*r3*r3)*gain;
    // 外壁: 様式と種で色味を変え、階ごとの帯を入れる。足元は街の明かりで少し明るい。
    vec3 tone= style<0.5? vec3(0.020,0.020,0.022) : style<1.5? vec3(0.026,0.022,0.019) : style<2.5? vec3(0.008,0.011,0.016) : vec3(0.022,0.021,0.022);
    tone*=(0.7+0.6*fract(seed*0.618))*mix(vec3(1.0),day,step(0.001,uDawn));
    float bandY=smoothstep(0.0,0.06+aa.y,f.y)*smoothstep(1.0,0.94-aa.y,f.y);
    vec3 facade=tone*mix(0.72,1.0,bandY);
    facade+=vec3(0.05,0.032,0.016)*exp(-vObj.y/7.0);
    // 消えている窓: 空と街明かりをうっすら映すガラス
    vec3 vd=normalize(vVd);
    float fres=pow(1.0-clamp(dN/length(vVd),0.0,1.0),3.0);
    vec3 dark=vec3(0.004,0.006,0.010)+uHazeCol*0.35*fres*(0.5+0.5*clamp(vd.y+0.6,0.0,1.0));
    vec3 wcol=dark;
    if(lit>0.5){
      vec2 q=clamp((f-lo)/(hi-lo),0.0,1.0);
      vec3 rd=vec3(dT/(cs.x*(hi.x-lo.x)),vVd.y/(cs.y*(hi.y-lo.y)),max(dN,1e-3)/(office>0.5?6.0:3.6));
      vec3 rc=room(q,rd,wc,r1,office);
      // ブラインドやカーテン: 上から一部を覆う。覆われた所は拡散した淡い光。
      float cover=step(r4,0.42)*(0.25+0.7*fract(r4*7.3));
      float bl=smoothstep(1.0-cover-0.02,1.0-cover+0.02,q.y);
      rc=mix(rc,wc*(0.42+0.1*sin(q.y*90.0)),bl);
      // 窓枠の桟
      float mull=office>0.5? smoothstep(0.035,0.02,abs(fract(q.x*3.0)-0.5)-0.47+0.035) : smoothstep(0.03,0.015,abs(q.x-0.5));
      rc*=1.0-0.75*clamp(mull,0.0,1.0);
      wcol=rc*inten*2.0;
    }
    vec3 detail=mix(facade,wcol,win);
    vec3 avg=facade*(1.0-cov)+cov*(dark*(1.0-litFrac*0.5)+wc*(0.34*gain)*litFrac*(style<0.5?0.74:style<1.5?0.55:style<2.5?0.3:0.75));
    float farK=smoothstep(0.3*uFar,1.0*uFar,pxs);
    col=mix(detail,avg,farK);
    if(style>0.5&&style<1.5&&face<1.5){                                         // 集合住宅の共用廊下灯
      float cl=smoothstep(0.07+aa.x,0.07,abs(f.x-0.5))*smoothstep(0.09+aa.y,0.09,abs(f.y-0.88));
      col+=mix(vec3(1.0,0.95,0.85)*1.6*cl,vec3(1.0,0.95,0.85)*0.022,farK)*step(1.2,vObj.y)*uCityGain;
    }
    if(vSeed.y>0.8 && vSize.y>70.0){ float e=min(hc,fwid-hc); col+=vec3(0.7,0.85,1.0)*1.6*smoothstep(0.45,0.0,e)*(0.7+0.3*sin(uTime*0.4+seed))*uCityGain; }
    if(vSize.y>90.0 && vObj.y>vSize.y-3.0 && vSeed.x>0.5) col+=vec3(1.0,0.88,0.7)*0.9*uCityGain;
  }
  float fog=1.0-exp(-pow(d*uHaze,2.0));
  col=mix(col,uHazeCol,fog);
  col=mix(uHazeCol*min(1.0,d/400.0),col,uAppear);
  gl_FragColor=vec4(col,1.0);
}
