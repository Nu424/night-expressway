// ブルーム拡大: 3x3 テントフィルタで1段粗い層を広げ、同じ解像度の縮小結果に足す。
uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uSpread; uniform float uLowGain;
varying vec2 vUv;
void main(){
  vec2 d=uTexel*uSpread;
  vec3 s=texture2D(tLow,vUv).rgb*4.0;
  s+=(texture2D(tLow,vUv+vec2(d.x,0.)).rgb+texture2D(tLow,vUv-vec2(d.x,0.)).rgb+texture2D(tLow,vUv+vec2(0.,d.y)).rgb+texture2D(tLow,vUv-vec2(0.,d.y)).rgb)*2.0;
  s+=texture2D(tLow,vUv+d).rgb+texture2D(tLow,vUv-d).rgb+texture2D(tLow,vUv+vec2(d.x,-d.y)).rgb+texture2D(tLow,vUv+vec2(-d.x,d.y)).rgb;
  gl_FragColor=vec4(texture2D(tHigh,vUv).rgb+s*(uLowGain/16.0),1.0);
}
