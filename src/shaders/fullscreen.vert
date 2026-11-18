// 画面全体を覆う1枚の三角形
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
