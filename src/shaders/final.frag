// 最終合成: フロントガラスの水滴・ワイパー → ブルーム加算 → トーンマップ → 色調整・周辺減光・粒状感。
// シーンのアルファは「車外=1 / 車内=0」。水滴とワイパーは車外の画素にだけ掛ける。
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tDrops;
uniform vec2 uTexel;          // 水滴テクスチャの1画素
uniform float uAmt; uniform vec4 uW1; uniform vec4 uW2; uniform float uAspect; uniform float uWipe; uniform float uFilm;
uniform float uBloom; uniform float uExposure; uniform float uTime; uniform vec2 uRes;
uniform float uFxaa; uniform vec2 uSceneTexel;
uniform float uCA; uniform float uVignette; uniform float uGrain; uniform float uWarmth; uniform float uSaturation; uniform float uContrast;
varying vec2 vUv;

float segD(vec2 p,vec2 a,vec2 b){ vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
vec3 RRTAndODTFit(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 aces(vec3 color){
  const mat3 inM=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
  const mat3 outM=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
  color*=uExposure/0.6; color=inM*color; color=RRTAndODTFit(color); color=outM*color; return clamp(color,0.0,1.0);
}
vec3 toSRGB(vec3 c){ return mix(pow(c,vec3(0.41666))*1.055-vec3(0.055),c*12.92,vec3(lessThanEqual(c,vec3(0.0031308)))); }

// ---- FXAA: 明暗差の大きい輪郭だけを、輪郭の向きに沿ってぼかす。
// 強い光源の縁が残らないよう、明るさを圧縮した空間で平均する。
vec4 tm(vec2 uv){ vec4 c=texture2D(tScene,uv); c.rgb/=1.0+max(c.r,max(c.g,c.b)); return c; }
float fl(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }
vec4 fxaa(vec2 uv){
  vec2 t=uSceneTexel;
  vec4 m=tm(uv);
  float lNW=fl(tm(uv+vec2(-1.,-1.)*t).rgb), lNE=fl(tm(uv+vec2(1.,-1.)*t).rgb), lSW=fl(tm(uv+vec2(-1.,1.)*t).rgb), lSE=fl(tm(uv+vec2(1.,1.)*t).rgb), lM=fl(m.rgb);
  float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE))), lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
  vec4 r=m;
  if(lMax-lMin>max(0.010,lMax*0.11)){
    vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),(lNW+lSW)-(lNE+lSE));
    float red=max((lNW+lNE+lSW+lSE)*0.03125,1.0/128.0);
    dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+red),-8.0,8.0)*t;
    vec4 a=0.5*(tm(uv+dir*(1.0/3.0-0.5))+tm(uv+dir*(2.0/3.0-0.5)));
    vec4 b=a*0.5+0.25*(tm(uv-dir*0.5)+tm(uv+dir*0.5));
    float lB=fl(b.rgb);
    r=(lB<lMin||lB>lMax)?a:b;
  }
  r.rgb/=max(1.0-max(r.r,max(r.g,r.b)),1e-3);
  return r;
}

void main(){
  vec2 uv=vUv; vec2 c=uv-0.5; float r2=dot(c,c);
  float ca=uCA*r2*4.0;
  vec4 base= uFxaa>0.5 ? fxaa(uv) : texture2D(tScene,uv);
  float caW= uFxaa>0.5 ? smoothstep(0.02,0.16,r2) : 1.0;   // FXAA 時、色ずれは画面の外側だけに掛ける
  vec3 col=vec3(mix(base.r,texture2D(tScene,uv-c*ca).r,caW),base.g,mix(base.b,texture2D(tScene,uv+c*ca).b,caW));
  float ext=smoothstep(0.2,0.6,base.a);
  if(uAmt>0.001 && ext>0.001){
    vec3 w=col;
    if(uFilm>0.001){ vec3 b=vec3(0.0); for(int i=0;i<6;i++){ float a=float(i)*1.047; b+=texture2D(tScene,uv+vec2(cos(a),sin(a))*0.003).rgb; } w=mix(w,b/6.0,uFilm*0.7); }
    float h=texture2D(tDrops,uv).a;
    if(h>0.01){
      float hx=texture2D(tDrops,uv+vec2(uTexel.x,0.)).a-texture2D(tDrops,uv-vec2(uTexel.x,0.)).a;
      float hy=texture2D(tDrops,uv+vec2(0.,uTexel.y)).a-texture2D(tDrops,uv-vec2(0.,uTexel.y)).a;
      vec2 off=-vec2(hx,hy)*0.11;
      vec3 dc=texture2D(tScene,uv+off).rgb*0.4+texture2D(tScene,uv+off*1.5+vec2(0.002,0.)).rgb*0.3+texture2D(tScene,uv+off*0.6-vec2(0.,0.002)).rgb*0.3;
      float m=smoothstep(0.05,0.45,h);
      w=mix(w,dc*1.2+0.006,m);
      w+=vec3(0.035)*smoothstep(0.08,0.2,h)*(1.0-smoothstep(0.2,0.45,h))*clamp(-hy*8.0+0.3,0.0,1.0);
    }
    col=mix(col,w,ext);
  }
  if(uWipe>0.5 && ext>0.001){
    vec2 p=vec2(uv.x*uAspect,uv.y);
    float d=min(segD(p,uW1.xy,uW1.zw),segD(p,uW2.xy,uW2.zw));
    col=mix(col,vec3(0.003),(1.0-smoothstep(0.004,0.0075,d))*ext);
  }
  col+=texture2D(tBloom,uv).rgb*uBloom;
  col=toSRGB(aces(col));
  // ---- ここから表示色空間での調整
  col=col*0.975+vec3(0.005,0.006,0.010);
  float l=dot(col,vec3(0.33));
  col=mix(col,col*vec3(1.0+0.03*uWarmth,1.0,1.0-0.04*uWarmth),smoothstep(0.3,0.9,l));
  col=mix(vec3(dot(col,vec3(0.2126,0.7152,0.0722))),col,uSaturation);
  col=(col-0.5)*uContrast+0.5;
  col*=1.0-r2*uVignette;
  col+=(hash(floor(uv*uRes)+fract(uTime*17.13)*91.0)-0.5)*uGrain;
  gl_FragColor=vec4(col,1.0);
}
