import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Owns the renderer, scene, camera and the post-processing chain that gives the
// "Concept A" cinematic look: ACES filmic tone mapping + sRGB output + bloom + fog.
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Clamp pixel ratio harder — 2x on a hi-DPI display means 4x the pixels and
    // is the single biggest perf cost. 1.5 looks crisp and runs much faster.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35; // brighter — level was reading too dark

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161b24);
    // Lighter haze so the warehouse reads clearly while keeping atmosphere.
    this.scene.fog = new THREE.FogExp2(0x1a2029, 0.009);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);
    this.camera.position.set(0, 1.7, 0);

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Half-resolution bloom target: much cheaper, visually near-identical.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
      0.5,  // strength (slightly lower so the scene isn't washed out)
      0.6,  // radius
      0.8   // threshold — only bright things (lights, muzzle) bloom
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
  }

  render() {
    this.composer.render();
  }
}
