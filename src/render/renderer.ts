import * as THREE from 'three';
import { FOG_COLOR, FOG_DENS, U } from '../core/globals';

export const canvas=document.getElementById('c');
export const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',stencil:false});
/** 'auto' = 自動解像度 / 'high' = 100%固定 / 'low' = 軽量（60%・反射とミラーなし） */
export let quality='auto';
export function setQuality(q){ quality=q; }
export let PR=Math.min(window.devicePixelRatio||1,1.5);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.setClearColor(0x000000,1);
U.pr.value=PR;

export const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(FOG_COLOR.clone(),FOG_DENS);
export const camera=new THREE.PerspectiveCamera(56,innerWidth/innerHeight,0.3,9500);
scene.add(camera);
export const hemi=new THREE.HemisphereLight(new THREE.Color().setRGB(0.05,0.05,0.08),new THREE.Color().setRGB(0.03,0.025,0.02),1.0);
scene.add(hemi);
export const headlight=new THREE.SpotLight(new THREE.Color().setRGB(1,0.95,0.88),140,140,0.55,0.7,2);
/** 車体に固定するものの親。頭を回してもヘッドライトが一緒に回らないよう、車内と同じ逆変換を掛ける。 */
export const carRig=new THREE.Group(); carRig.matrixAutoUpdate=false; camera.add(carRig);
headlight.position.set(0,-0.5,0); carRig.add(headlight); carRig.add(headlight.target); headlight.target.position.set(0,-2.2,-30);
