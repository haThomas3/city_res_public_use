/** Renderer, lights, optional bloom post-processing and resize handling. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CameraRig } from './camera';
import type { Theme } from './daylight';

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  rig: CameraRig;
  size: { width: number; height: number };
  applyTheme(theme: Theme): void;
  render(): void;
  onResize(fn: () => void): void;
}

export function createScene(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  opts: { lowPower: boolean; shadows: boolean; radius: number; maxHeight: number },
): SceneCtx {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !opts.lowPower,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (opts.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  const rig = new CameraRig(opts.radius, opts.maxHeight);

  const hemi = new THREE.HemisphereLight('#ffffff', '#8a7f6a', 1.2);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.castShadow = opts.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -opts.radius * 1.15;
  sc.right = sc.top = opts.radius * 1.15;
  sc.near = 1;
  sc.far = 200;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);

  let composer: EffectComposer | undefined;
  let bloom: UnrealBloomPass | undefined;
  if (!opts.lowPower) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, rig.camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const size = { width: 1, height: 1 };
  const resizeListeners: (() => void)[] = [];
  const resize = () => {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    size.width = w;
    size.height = h;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    rig.setAspect(w / h);
    rig.apply();
    resizeListeners.forEach((fn) => fn());
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  return {
    renderer,
    scene,
    rig,
    size,
    applyTheme(theme) {
      scene.background = theme.water.clone();
      hemi.color.copy(theme.hemiSky);
      hemi.groundColor.copy(theme.hemiGround);
      hemi.intensity = theme.hemiIntensity;
      sun.color.copy(theme.sunColor);
      sun.intensity = theme.sunIntensity;
      sun.position.copy(theme.sunDir).multiplyScalar(60);
      sun.target.position.set(0, 0, 0);
      if (bloom) bloom.strength = theme.bloom;
    },
    render() {
      if (composer) composer.render();
      else renderer.render(scene, rig.camera);
    },
    onResize(fn) {
      resizeListeners.push(fn);
    },
  };
}
