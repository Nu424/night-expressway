// ブルーム縮小: 13タップ。初段だけ閾値と輝度による重み付け（強い点光源のちらつき防止）を行う。
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uFirst; uniform float uThreshold; uniform float uKnee;
varying vec2 vUv;
float luma(vec3 c){ return dot(c,vec3(0.2126,0.7152,0.0722)); }
vec3 pre(vec3 c){
  c=min(c,vec3(48.0));
  float l=luma(c); float soft=clamp(l-uThreshold+uKnee,0.0,2.0*uKnee); soft=soft*soft/(4.0*uKnee+1e-4);
  return c*max(soft,l-uThreshold)/max(l,1e-4);
}
vec3 box(vec3 a,vec3 b,vec3 c,vec3 d){
  if(uFirst>0.5){ a=pre(a); b=pre(b); c=pre(c); d=pre(d);
    float wa=1.0/(1.0+0.12*luma(a)), wb=1.0/(1.0+0.12*luma(b)), wc=1.0/(1.0+0.12*luma(c)), wd=1.0/(1.0+0.12*luma(d));
    return (a*wa+b*wb+c*wc+d*wd)/(wa+wb+wc+wd); }
  return (a+b+c+d)*0.25;
}
#define T(x,y) texture2D(tSrc,vUv+uTexel*vec2(x,y)).rgb
void main(){
  vec3 a=T(-2.,-2.), b=T(0.,-2.), c=T(2.,-2.);
  vec3 d=T(-2.,0.),  e=T(0.,0.),  f=T(2.,0.);
  vec3 g=T(-2.,2.),  h=T(0.,2.),  i=T(2.,2.);
  vec3 j=T(-1.,-1.), k=T(1.,-1.), l=T(-1.,1.), m=T(1.,1.);
  vec3 col=box(j,k,l,m)*0.5+(box(a,b,d,e)+box(b,c,e,f)+box(d,e,g,h)+box(e,f,h,i))*0.125;
  gl_FragColor=vec4(max(col,vec3(0.0)),1.0);
}
