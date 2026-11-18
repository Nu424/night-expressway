import * as THREE from 'three';
import { V3 } from '../core/util';
import { scene } from '../render/renderer';

export const iscene=new THREE.Scene();
export const icam=new THREE.PerspectiveCamera(56,innerWidth/innerHeight,0.02,10);
export let iAmb, iMats=[], mirrorMesh, blinkLamp, mirrorRT, rearCam;
export function makeInterior(){
  iAmb=new THREE.AmbientLight(0xffffff,0.5); iscene.add(iAmb);
  const top=new THREE.DirectionalLight(0xffffff,0.25); top.position.set(0.3,1,-0.4); iscene.add(top);
  const dm=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.028,0.028,0.03),roughness:0.85});
  const pm=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.02,0.02,0.022),roughness:0.7});
  iMats.push(dm,pm);
  // dashboard: a slab whose top edge sits low in the frame
  const dash=new THREE.Shape(); dash.moveTo(-2.2,0); dash.lineTo(1.4,0); dash.lineTo(1.4,0.55); dash.bezierCurveTo(0.6,0.62,-0.6,0.62,-2.2,0.5); dash.closePath();
  const dg=new THREE.ExtrudeGeometry(dash,{depth:0.8,bevelEnabled:false}); dg.rotateX(-Math.PI/2); dg.translate(0,-1.22,-0.35);
  const dmesh=new THREE.Mesh(dg,dm); iscene.add(dmesh);
  // meter hood
  const hood=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.24,0.5,24,1,false,0,Math.PI).rotateZ(Math.PI/2).rotateY(Math.PI/2),dm);
  hood.position.set(0.0,-0.47,-0.62); hood.scale.set(1.2,0.35,1); iscene.add(hood);
  // windshield header
  const hdr=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.2,0.9),pm); hdr.position.set(-0.4,0.565,-0.42); hdr.rotation.x=-0.12; iscene.add(hdr);
  // A pillars
  const mkPillar=(b,t,w)=>{const g=new THREE.BoxGeometry(w,1,0.06); const m=new THREE.Mesh(g,pm); const bv=new V3(...b), tv=new V3(...t);
    m.position.copy(bv).add(tv).multiplyScalar(0.5); const dir=tv.clone().sub(bv); m.scale.y=dir.length(); m.quaternion.setFromUnitVectors(new V3(0,1,0),dir.normalize()); iscene.add(m);};
  mkPillar([0.80,-0.42,-1.0],[0.47,0.6,-0.34],0.085);
  mkPillar([-1.02,-0.42,-1.0],[-0.82,0.55,-0.38],0.13);
  // rear-view mirror
  mirrorRT=new THREE.WebGLRenderTarget(384,112,{type:THREE.HalfFloatType});
  rearCam=new THREE.PerspectiveCamera(26,384/112,0.5,3000); scene.add(rearCam);
  const mirMat=new THREE.ShaderMaterial({uniforms:{t:{value:mirrorRT.texture}},vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D t; varying vec2 vUv; void main(){ vec2 u=vec2(1.0-vUv.x,vUv.y); vec3 c=texture2D(t,u).rgb*0.85; vec2 e=abs(vUv-0.5)*2.0; c*=1.0-pow(max(e.x,e.y),6.0)*0.6; gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const mirShape=new THREE.Shape(); const mw=0.25,mh=0.068,rr2=0.028;
  mirShape.moveTo(-mw/2+rr2,-mh/2); mirShape.lineTo(mw/2-rr2,-mh/2); mirShape.quadraticCurveTo(mw/2,-mh/2,mw/2,-mh/2+rr2); mirShape.lineTo(mw/2,mh/2-rr2); mirShape.quadraticCurveTo(mw/2,mh/2,mw/2-rr2,mh/2);
  mirShape.lineTo(-mw/2+rr2,mh/2); mirShape.quadraticCurveTo(-mw/2,mh/2,-mw/2,mh/2-rr2); mirShape.lineTo(-mw/2,-mh/2+rr2); mirShape.quadraticCurveTo(-mw/2,-mh/2,-mw/2+rr2,-mh/2);
  const mg=new THREE.ShapeGeometry(mirShape); const uvA=mg.attributes.uv; const pA=mg.attributes.position; for(let i=0;i<uvA.count;i++){uvA.setXY(i,pA.getX(i)/mw+0.5,pA.getY(i)/mh+0.5);}
  mirrorMesh=new THREE.Mesh(mg,mirMat); mirrorMesh.position.set(-0.40,0.27,-0.78); mirrorMesh.rotation.set(0.05,0.28,0); iscene.add(mirrorMesh);
  const housing=new THREE.Mesh(new THREE.BoxGeometry(mw+0.02,mh+0.02,0.04),pm); housing.position.set(0,0,-0.025); mirrorMesh.add(housing);
  const stem=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.12,0.02),pm); stem.position.set(0.0,0.08,-0.04); mirrorMesh.add(stem);
  // meter glow reflecting on glass + blinker indicator
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(0.55,0.12),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0.012,0.022,0.04),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  blinkLamp=new THREE.Mesh(new THREE.PlaneGeometry(0.03,0.012),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(0,0,0),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  blinkLamp.position.set(0.05,-0.36,-0.95); iscene.add(blinkLamp);
}
