// 車内（とボンネット）の頂点シェーダ。
// 街灯1つ1つを点光源として扱い、「その光がガラスの開口を通って届くか」を解析的に判定する。
// これにより、街灯を通過するたびに屋根やピラーの影がダッシュボードの上を流れる。
// 画素ごとに計算すると内蔵GPUには重いので、照度は頂点で求めて補間する（ダッシュボードは細かい格子にしてある）。
#define NL 6
uniform vec3 uLampPos[NL];   // 車体座標（原点=運転者の目、-z が前）
uniform vec3 uLampCol[NL];   // 色×照度
uniform float uOutside;
varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying vec3 vLit;

float band(float x,float a,float b,float s){ return smoothstep(a-s,a+s,x)*(1.0-smoothstep(b-s,b+s,x)); }
// 開口の透過率: 点 p から光源 L へ向かう線分が、フロントガラス・左右の窓のいずれかを通るか
float aperture(vec3 p,vec3 L){
  vec3 d=L-p; float tr=0.0;
  // フロントガラス: (y=-0.36,z=-1.20) と (y=0.44,z=-0.42) を結ぶ傾いた面
  const vec3 B=vec3(0.0,-0.36,-1.20); const vec3 R=vec3(0.0,0.7161,0.6980); const vec3 N=vec3(0.0,0.6980,-0.7161);
  float dn=dot(N,d);
  if(abs(dn)>1e-4){ float t=dot(N,B-p)/dn; if(t>0.0){ vec3 q=p+d*t; float v=dot(q-B,R)/1.117;
    float xl=mix(-1.20,-1.08,v), xr=mix(0.59,0.50,v);
    tr=max(tr,band(v,0.0,1.0,0.045)*band(q.x,xl,xr,0.04)); } }
  // 右の窓（運転席側）と左の窓
  if(d.x>1e-4){ float t=(0.58-p.x)/d.x; if(t>0.0){ vec3 q=p+d*t; tr=max(tr,band(q.y,-0.14,0.42,0.04)*band(q.z,-0.72,0.30,0.06)); } }
  if(d.x<-1e-4){ float t=(-1.16-p.x)/d.x; if(t>0.0){ vec3 q=p+d*t; tr=max(tr,band(q.y,-0.14,0.42,0.04)*band(q.z,-0.72,0.30,0.06)); } }
  return tr;
}

void main(){
  // 車内はカメラの子なので、視点座標がそのまま車体座標になる
  vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; vN=normalize(normalMatrix*normal); vUv=uv;
  vec3 lit=vec3(0.0);
  if(uOutside<0.5){
    for(int i=0;i<NL;i++){
      vec3 Ld=normalize(uLampPos[i]-vP);
      // 面の向きは両面扱い（薄い板が多いので、裏から当たる光も少し拾う）
      float nl=abs(dot(vN,Ld))*0.6+0.4*max(dot(vN,Ld),0.0);
      lit+=uLampCol[i]*aperture(vP,uLampPos[i])*nl;
    }
  }
  vLit=lit;
  gl_Position=projectionMatrix*mv;
}
