// 建物（インスタンス化した箱）。色属性は [乱数の種, 点灯率, 様式] として使う。
varying vec3 vObj; varying vec3 vN; varying vec3 vSeed; varying vec3 vSize; varying vec3 vW; varying vec3 vVd;
void main(){
  vec3 sc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
  vSize=sc; vObj=position*sc; vN=normal;
  #ifdef USE_INSTANCING_COLOR
  vSeed=instanceColor;
  #else
  vSeed=vec3(0.5);
  #endif
  vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0); vW=wp.xyz;
  // 視線を建物のローカル座標へ（窓の奥行き表現に使う）
  mat3 rot=mat3(instanceMatrix[0].xyz/sc.x,instanceMatrix[1].xyz/sc.y,instanceMatrix[2].xyz/sc.z);
  vVd=transpose(rot)*(wp.xyz-cameraPosition);
  gl_Position=projectionMatrix*viewMatrix*wp;
}
