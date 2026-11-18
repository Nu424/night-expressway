// 車内（とボンネット）の陰影。
// 街灯1つ1つを点光源として扱い、「その光がガラスの開口を通って届くか」を解析的に判定する。
// これにより、街灯を通過するたびに屋根やピラーの影がダッシュボードの上を流れる。
#define NL 8
uniform vec3 uLampPos[NL];   // 車体座標（原点=運転者の目、-z が前）
uniform vec3 uLampCol[NL];   // 色×照度
uniform vec3 uAmb;           // 環境光（周囲の明るさの平均）
uniform vec3 uBase; uniform float uSpec; uniform float uGloss; uniform float uOutside; uniform float uGrain;
uniform vec3 uGlow;          // メーターの照り返し
uniform sampler2D uMap; uniform float uUseMap; uniform float uEmissive;
uniform float uWet;
varying vec3 vP; varying vec3 vN; varying vec2 vUv;

float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float band(float x,float a,float b,float s){ return smoothstep(a-s,a+s,x)*(1.0-smoothstep(b-s,b+s,x)); }

// 開口の透過率: 点 p から光源 L へ向かう線分が、フロントガラス・左右の窓のいずれかを通るか
float aperture(vec3 p,vec3 L){
  vec3 d=L-p; float tr=0.0;
  // フロントガラス: (y=-0.36,z=-1.20) と (y=0.44,z=-0.42) を結ぶ傾いた面
  const vec3 B=vec3(0.0,-0.36,-1.20); const vec3 R=vec3(0.0,0.7161,0.6980); const vec3 N=vec3(0.0,0.6980,-0.7161);
  float dn=dot(N,d);
  if(abs(dn)>1e-4){ float t=dot(N,B-p)/dn; if(t>0.0){ vec3 q=p+d*t; float v=dot(q-B,R)/1.117;
    float xl=mix(-1.20,-1.08,v), xr=mix(0.59,0.50,v);
    tr=max(tr,band(v,0.0,1.0,0.035)*band(q.x,xl,xr,0.03)); } }
  // 右の窓（運転席側）と左の窓
  if(d.x>1e-4){ float t=(0.58-p.x)/d.x; if(t>0.0){ vec3 q=p+d*t; tr=max(tr,band(q.y,-0.14,0.42,0.03)*band(q.z,-0.72,0.30,0.05)); } }
  if(d.x<-1e-4){ float t=(-1.16-p.x)/d.x; if(t>0.0){ vec3 q=p+d*t; tr=max(tr,band(q.y,-0.14,0.42,0.03)*band(q.z,-0.72,0.30,0.05)); } }
  return tr;
}

void main(){
  vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
  vec3 V=normalize(cameraPosition-vP);
  vec3 base=uBase; if(uUseMap>0.5) base*=texture2D(uMap,vUv).rgb;
  base*=1.0+(hash(floor(vP*420.0))-0.5)*uGrain;
  vec3 col=base*uAmb;
  float spec=uSpec*(1.0+uWet*2.0);
  for(int i=0;i<NL;i++){
    vec3 Lv=uLampPos[i]-vP; vec3 Ld=normalize(Lv);
    float tr=mix(aperture(vP,uLampPos[i]),1.0,uOutside);
    float nl=max(dot(N,Ld),0.0);
    vec3 H=normalize(Ld+V);
    col+=uLampCol[i]*tr*(base*nl+spec*pow(max(dot(N,H),0.0),uGloss)*step(0.0,nl));
  }
  // 塗装面（ボンネット）: 空の明るさが浅い角度で映り込む
  if(uOutside>0.5){ float fr=pow(1.0-max(dot(N,V),0.0),4.0); col+=uAmb*fr*(0.18+0.3*uWet); }
  // メーターの淡い照り返し
  vec3 g=vP-vec3(0.0,-0.31,-0.80); col+=uGlow*base*4.0/(1.0+dot(g,g)*60.0)*(1.0-uOutside);
  if(uEmissive>0.0) col=texture2D(uMap,vUv).rgb*uEmissive+col*0.15;
  gl_FragColor=vec4(col,1.0);
}
