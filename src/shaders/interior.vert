varying vec3 vP; varying vec3 vN; varying vec2 vUv;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); vUv=uv;
  gl_Position=projectionMatrix*viewMatrix*wp;
}
