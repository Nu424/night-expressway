/* ============================================================
   描画パイプライン
     シーン(HDR, MSAA) → 車内を重ね描き → ブルーム(縮小/拡大の連鎖) → 最終合成(1パス)
   全画面パスを最小限にし、内蔵GPUでも回るようにしている。
   ============================================================ */
import * as THREE from 'three';
import { iscene } from '../car/interior';
import { U } from '../core/globals';
import { PR, camera, renderer, scene } from './renderer';
import VERT from '../shaders/fullscreen.vert?raw';
import DOWN from '../shaders/bloom_down.frag?raw';
import UP from '../shaders/bloom_up.frag?raw';
import FINAL from '../shaders/final.frag?raw';

const BLOOM_LEVELS = 6;

export let dropsCanvas: HTMLCanvasElement, dropsCtx: CanvasRenderingContext2D, dropsTex: THREE.CanvasTexture;
export let sceneRT: THREE.WebGLRenderTarget;
let downRT: THREE.WebGLRenderTarget[] = [], upRT: THREE.WebGLRenderTarget[] = [];
let downMat: THREE.ShaderMaterial, upMat: THREE.ShaderMaterial, finalMat: THREE.ShaderMaterial;
let quad: THREE.Mesh; const fsScene = new THREE.Scene(); const fsCam = new THREE.Camera();

/** 外から切り替える描画オプション */
export const post = { bloom: true, bloomSpread: 1.0, bloomLowGain: 1.45, scale: 1, samples: 0, fxaa: true };
/** 車内の重ね描き。視点切替と俯瞰デバッグから操作する。 */
export const interiorPass = { enabled: true };
/** 水滴・ワイパーの uniform。weather/drops.ts が書き込む。 */
export const dropsPass: { uniforms: Record<string, THREE.IUniform> } = { uniforms: {} };
/** 最終合成の uniform（露出・色調整など） */
export let finalU: Record<string, THREE.IUniform> = {};

function fsMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}
function blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
  quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam);
}
function hdrTarget(w: number, h: number, samples = 0, depth = false) {
  const rt = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { type: THREE.HalfFloatType, samples, depthBuffer: depth, stencilBuffer: false });
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false;
  return rt;
}

/** 車内の材質に「アルファ=0」を書かせ、最終合成で車外と区別できるようにする */
export function markInterior(root: THREE.Object3D) {
  root.traverse((o: any) => {
    const m = o.material as THREE.Material & { fragmentShader?: string }; if (!m || m.userData.interiorMarked) return;
    m.userData.interiorMarked = true;
    if (m.blending === THREE.AdditiveBlending) return;
    if ((m as any).isShaderMaterial) m.fragmentShader = m.fragmentShader!.replace(/\}\s*$/, '  gl_FragColor.a=0.0;\n}');
    else {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a=0.0;'); };
    }
    m.needsUpdate = true;
  });
}

export function makePost() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  quad = new THREE.Mesh(geo); quad.frustumCulled = false; fsScene.add(quad);

  dropsCanvas = document.createElement('canvas'); dropsCanvas.width = 640; dropsCanvas.height = 360; dropsCtx = dropsCanvas.getContext('2d')!;
  dropsTex = new THREE.CanvasTexture(dropsCanvas);

  downMat = fsMaterial(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uThreshold: { value: 1.1 }, uKnee: { value: 0.5 } });
  upMat = fsMaterial(UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uSpread: { value: 1 }, uLowGain: { value: 1 } });
  finalU = {
    tScene: { value: null }, tBloom: { value: null }, tDrops: { value: dropsTex },
    uTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) }, uAmt: { value: 0 }, uW1: { value: new THREE.Vector4() }, uW2: { value: new THREE.Vector4() },
    uAspect: { value: 16 / 9 }, uWipe: { value: 0 }, uFilm: { value: 0 },
    uBloom: { value: 0.09 }, uExposure: { value: 1.05 }, uTime: U.time, uRes: { value: new THREE.Vector2(1, 1) },
    uFxaa: { value: 0 }, uSceneTexel: { value: new THREE.Vector2() },
    uCA: { value: 0.0016 }, uVignette: { value: 0.75 }, uGrain: { value: 0.028 }, uWarmth: { value: 1 }, uSaturation: { value: 1 }, uContrast: { value: 1 },
  };
  finalMat = fsMaterial(FINAL, finalU);
  dropsPass.uniforms = finalU;
  markInterior(iscene);
  resizePost();
}

export function resizePost() {
  if (!finalMat) return;
  const w = Math.round(innerWidth * PR * post.scale), h = Math.round(innerHeight * PR * post.scale);
  if (sceneRT && sceneRT.width === w && sceneRT.height === h && sceneRT.samples === post.samples) { finalU.uRes.value.set(innerWidth * PR, innerHeight * PR); return; }
  sceneRT?.dispose(); for (const r of downRT) r.dispose(); for (const r of upRT) r.dispose();
  sceneRT = hdrTarget(w, h, post.samples, true);
  downRT = []; upRT = [];
  let bw = w >> 1, bh = h >> 1;
  for (let i = 0; i < BLOOM_LEVELS; i++) { downRT.push(hdrTarget(bw, bh)); if (i < BLOOM_LEVELS - 1) upRT.push(hdrTarget(bw, bh)); bw >>= 1; bh >>= 1; }
  finalU.uRes.value.set(innerWidth * PR, innerHeight * PR);
  U.pr.value = PR * post.scale;
  U.proj.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

export function renderFrame() {
  const autoClear = renderer.autoClear; renderer.autoClear = false;
  renderer.setRenderTarget(sceneRT); renderer.clear();
  iscene.visible = interiorPass.enabled;
  renderer.render(scene, camera);

  if (post.bloom && finalU.uBloom.value > 0) {
    let src: THREE.Texture = sceneRT.texture, sw = sceneRT.width, sh = sceneRT.height;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      downMat.uniforms.tSrc.value = src; downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh); downMat.uniforms.uFirst.value = i === 0 ? 1 : 0;
      blit(downMat, downRT[i]); src = downRT[i].texture; sw = downRT[i].width; sh = downRT[i].height;
    }
    let low = downRT[BLOOM_LEVELS - 1];
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      upMat.uniforms.tLow.value = low.texture; upMat.uniforms.tHigh.value = downRT[i].texture;
      upMat.uniforms.uTexel.value.set(1 / low.width, 1 / low.height); upMat.uniforms.uSpread.value = post.bloomSpread; upMat.uniforms.uLowGain.value = post.bloomLowGain;
      blit(upMat, upRT[i]); low = upRT[i];
    }
    finalU.tBloom.value = low.texture;
  } else finalU.tBloom.value = null;

  finalU.tScene.value = sceneRT.texture; finalU.uFxaa.value = post.fxaa ? 1 : 0; finalU.uSceneTexel.value.set(1 / sceneRT.width, 1 / sceneRT.height);
  blit(finalMat, null);
  renderer.autoClear = autoClear;
}
