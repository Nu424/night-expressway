// 車内（とボンネット）の画素シェーダ。車内の照度は頂点側で計算済み（vLit）。
// ボンネットだけは、街灯の映り込み（鋭いハイライト）を画素ごとに計算する。
#define NL 6
uniform vec3 uLampPos[NL]; uniform vec3 uLampCol[NL];
uniform vec3 uAmb;           // 環境光（周囲の明るさの平均）
uniform vec3 uBase; uniform float uSpec; uniform float uGloss; uniform float uOutside; uniform float uGrain;
uniform vec3 uGlow;          // メーターの照り返し
uniform sampler2D uMap; uniform float uUseMap; uniform float uEmissive;
uniform float uWet; uniform vec3 uEye;
varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying vec3 vLit;

float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }

void main(){
  vec3 col;
  if(uEmissive>0.0){ col=texture2D(uMap,vUv).rgb*uEmissive; }
  else {
    vec3 base=uBase; if(uUseMap>0.5) base*=texture2D(uMap,vUv).rgb;
    if(uGrain>0.0) base*=1.0+(hash(floor(vP*420.0))-0.5)*uGrain;
    col=base*(uAmb+vLit);
    if(uOutside>0.5){
      vec3 N=normalize(vN); if(!gl_FrontFacing) N=-N;
      vec3 V=normalize(uEye-vP);
      float spec=uSpec*(1.0+uWet*2.0);
      for(int i=0;i<NL;i++){
        vec3 Ld=normalize(uLampPos[i]-vP); float nl=max(dot(N,Ld),0.0);
        col+=uLampCol[i]*(base*nl+spec*pow(max(dot(N,normalize(Ld+V)),0.0),uGloss)*step(0.0,nl));
      }
      col+=uAmb*pow(1.0-max(dot(N,V),0.0),4.0)*(0.18+0.3*uWet);   // 浅い角度で空が映る
    } else {
      vec3 g=vP-vec3(0.0,-0.31,-0.80); col+=uGlow*base*4.0/(1.0+dot(g,g)*60.0);   // メーターの淡い照り返し
    }
  }
  gl_FragColor=vec4(col,1.0);
}
