import * as THREE from 'three';
import { concreteTexture, roughnessNoise, metalTexture, crateTexture } from './textures.js';

export const ARENA_HALF = 24; // arena spans -24..24 on X and Z

// Builds the single level: an enclosed industrial warehouse. Returns colliders
// (Box3[]) used by the player & enemies, plus spawn data.
export class Warehouse {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];        // THREE.Box3[]
    this.enemySpawns = [];      // THREE.Vector3[]
    this.lamps = [];            // fl:cker-able point lights
    this.playerSpawn = new THREE.Vector3(0, 1.7, ARENA_HALF - 4);

    this._buildMaterials();
    this._buildShell();
    this._buildProps();
    this._buildLights();
  }

  _buildMaterials() {
    const floorTex = concreteTexture(8, '#41464e');
    const floorRough = roughnessNoise(8, 150);
    this.matFloor = new THREE.MeshStandardMaterial({
      map: floorTex, roughnessMap: floorRough, roughness: 0.78, metalness: 0.1, color: 0xc2c8d0,
    });
    this.matWall = new THREE.MeshStandardMaterial({
      map: concreteTexture(6, '#4c525c'), roughnessMap: roughnessNoise(6, 170), roughness: 0.9, metalness: 0.05,
      color: 0xc8ccd2,
    });
    this.matMetal = new THREE.MeshStandardMaterial({
      map: metalTexture(2, '#54585f'), roughness: 0.45, metalness: 0.85,
    });
    this.matCrate = new THREE.MeshStandardMaterial({ map: crateTexture('#7a5a32'), roughness: 0.8, metalness: 0.05 });
    this.matContainer = new THREE.MeshStandardMaterial({
      map: metalTexture(1, '#7a3b2e'), roughness: 0.55, metalness: 0.7, color: 0xff8a6a,
    });
  }

  // mesh helper that also registers an AABB collider.
  // shadow defaults OFF — only props that visibly benefit (crates, containers)
  // cast shadows, which keeps the shadow pass cheap.
  _box(w, h, d, x, y, z, mat, { collide = true, shadow = false } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collide) {
      const box = new THREE.Box3().setFromObject(mesh);
      this.colliders.push(box);
    }
    return mesh;
  }

  _buildShell() {
    const H = ARENA_HALF;
    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), this.matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), this.matWall);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 9;
    this.scene.add(ceil);

    // Outer walls (thickness 1, height 9)
    const t = 1, wallH = 9, yC = wallH / 2;
    this._box(H * 2, wallH, t, 0, yC, -H, this.matWall); // back (-z)
    this._box(H * 2, wallH, t, 0, yC, H, this.matWall);  // front (+z)
    this._box(t, wallH, H * 2, -H, yC, 0, this.matWall); // left (-x)
    this._box(t, wallH, H * 2, H, yC, 0, this.matWall);  // right (+x)
  }

  _buildProps() {
    // Structural pillars (metal) in a grid — also good cover.
    for (const x of [-12, 12]) {
      for (const z of [-12, 0, 12]) {
        this._box(1.4, 9, 1.4, x, 4.5, z, this.matMetal);
      }
    }

    // Shipping containers (big cover) along the sides.
    this._container(-17, -8, 0);
    this._container(17, 6, Math.PI);
    this._container(-6, -18, Math.PI / 2);

    // Crate stacks scattered as cover.
    const crateSpots = [
      [-4, 4], [6, -2], [10, 10], [-10, 8], [2, 14], [-14, -2], [14, -10], [0, -6],
    ];
    for (const [x, z] of crateSpots) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const s = 1.4;
        this._box(s, s, s, x + (Math.random() - 0.5) * 0.4, s / 2 + i * s, z + (Math.random() - 0.5) * 0.4, this.matCrate, { shadow: true });
      }
    }

    // Enemy spawn points (far half of the arena + corners).
    for (const p of [[-20, -20], [20, -20], [0, -21], [-21, 0], [21, 0], [-18, -10], [18, -10]]) {
      this.enemySpawns.push(new THREE.Vector3(p[0], 0, p[1]));
    }
  }

  _container(x, z, rotY) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 4), this.matContainer);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    g.position.set(x, 2.5, z);
    g.rotation.y = rotY;
    this.scene.add(g);
    g.updateMatrixWorld(true);
    body.updateMatrixWorld(true);
    // World-space AABB of the rotated container.
    this.colliders.push(new THREE.Box3().setFromObject(body));
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x4a5468, 0.95));
    const hemi = new THREE.HemisphereLight(0x9aa6bf, 0x2a2e36, 0.85);
    this.scene.add(hemi);

    // Key directional light (cold skylight through the roof) — casts shadows.
    const sun = new THREE.DirectionalLight(0xcfe0ff, 1.5);
    sun.position.set(10, 20, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); // 1024 instead of 2048 — big perf win
    const d = ARENA_HALF + 4;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(sun.target);

    // Warm hanging lamp fixtures — emissive disc + point light (these bloom).
    const lampPositions = [[-10, -10], [10, -10], [0, 2], [-10, 10], [10, 10]];
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb866, emissiveIntensity: 3.5 });
    for (const [x, z] of lampPositions) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 16), lampMat);
      disc.position.set(x, 8.3, z);
      this.scene.add(disc);
      const pl = new THREE.PointLight(0xffc080, 22, 30, 2);
      pl.position.set(x, 7.9, z);
      pl.castShadow = false;
      this.scene.add(pl);
      this.lamps.push(pl);
    }

    // A bright cold accent at the spawn end to draw the eye down the warehouse.
    const accent = new THREE.PointLight(0x9cc3ff, 12, 32, 2);
    accent.position.set(0, 6, -ARENA_HALF + 4);
    this.scene.add(accent);
  }

  // subtle lamp flicker for atmosphere
  update(t) {
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      l.intensity = 21 + Math.sin(t * 6 + i * 1.7) * 0.8 + (Math.random() < 0.02 ? -6 : 0);
    }
  }
}
