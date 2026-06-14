import * as THREE from 'three';
import { concreteTexture, roughnessNoise, metalTexture, crateTexture } from './textures.js';

export const ARENA_HALF = 24; // same footprint as the warehouse

// Second level: a molten steel foundry. Dark riveted steel with glowing magma
// channels cut into the floor for atmosphere + warm light. Same interface as
// Warehouse (colliders, enemySpawns, lamps, playerSpawn, update, dispose).
export class Foundry {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.name = 'FOUNDRY';
    this.colliders = [];
    this.solids = [];          // bullet-blocking meshes (curated raycast targets)
    this.enemySpawns = [];
    this.lamps = [];           // magma glow lights we pulse
    this.playerSpawn = new THREE.Vector3(0, 1.7, ARENA_HALF - 4);

    this._buildMaterials();
    this._buildShell();
    this._buildMagma();
    this._buildProps();
    this._buildLights();
  }

  _buildMaterials() {
    this.matFloor = new THREE.MeshStandardMaterial({
      map: metalTexture(8, '#2a2622'), roughnessMap: roughnessNoise(8, 150),
      roughness: 0.62, metalness: 0.85, color: 0x6a6258,
    });
    this.matWall = new THREE.MeshStandardMaterial({
      map: metalTexture(6, '#322a24'), roughnessMap: roughnessNoise(6, 170),
      roughness: 0.7, metalness: 0.75, color: 0x6f655c,
    });
    this.matMetal = new THREE.MeshStandardMaterial({
      map: metalTexture(2, '#3a342e'), roughness: 0.4, metalness: 0.9, color: 0x8a8076,
    });
    this.matFurnace = new THREE.MeshStandardMaterial({
      map: metalTexture(1, '#4a2018'), roughness: 0.5, metalness: 0.7, color: 0xb06a4a,
      emissive: 0x3a0e00, emissiveIntensity: 0.6,
    });
    this.matCrate = new THREE.MeshStandardMaterial({ map: crateTexture('#6a4a2a'), roughness: 0.7, metalness: 0.2, color: 0xb8b0a4 });
    this.matMagma = new THREE.MeshBasicMaterial({ color: 0xff7a1e });
    this.matMagma.toneMapped = false; // let it blow out + bloom
  }

  _box(w, h, d, x, y, z, mat, { collide = true, shadow = false } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    this.root.add(mesh);
    if (collide) { this.colliders.push(new THREE.Box3().setFromObject(mesh)); this.solids.push(mesh); }
    return mesh;
  }

  _buildShell() {
    const H = ARENA_HALF;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), this.matFloor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.root.add(floor);
    this.solids.push(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), this.matWall);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 9;
    this.root.add(ceil);
    this.solids.push(ceil);

    const t = 1, wallH = 9, yC = wallH / 2;
    this._box(H * 2, wallH, t, 0, yC, -H, this.matWall);
    this._box(H * 2, wallH, t, 0, yC, H, this.matWall);
    this._box(t, wallH, H * 2, -H, yC, 0, this.matWall);
    this._box(t, wallH, H * 2, H, yC, 0, this.matWall);
  }

  // Glowing magma channels cut into the floor — visual only (no colliders), each
  // backed by a warm point light. These bloom and light the room warmly.
  _buildMagma() {
    const strips = [
      { w: 44, d: 2.2, x: 0, z: -6 },
      { w: 2.2, d: 26, x: -14, z: 2 },
      { w: 2.2, d: 26, x: 14, z: 2 },
      { w: 16, d: 2.2, x: 0, z: 10 },
    ];
    for (const s of strips) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), this.matMagma);
      m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.03, s.z);
      this.root.add(m);
      // Fewer, brighter, longer-range warm lights along each channel — same warm
      // coverage with ~half the dynamic lights (cheaper on mobile GPUs).
      const steps = Math.max(1, Math.round(Math.max(s.w, s.d) / 22));
      for (let i = 0; i < steps; i++) {
        const f = steps === 1 ? 0.5 : i / (steps - 1);
        const lx = s.w > s.d ? s.x - s.w / 2 + f * s.w : s.x;
        const lz = s.d > s.w ? s.z - s.d / 2 + f * s.d : s.z;
        const pl = new THREE.PointLight(0xff6a1e, 13, 26, 2);
        pl.position.set(lx, 1.0, lz);
        this.root.add(pl);
        this.lamps.push(pl);
      }
    }
  }

  _buildProps() {
    // Tall furnace stacks in the corners (glowing, good cover).
    for (const [x, z] of [[-17, -16], [17, -16], [-17, 14], [17, 14]]) {
      this._box(4, 9, 4, x, 4.5, z, this.matFurnace, { shadow: true });
    }
    // Heavy machine blocks / girders mid-field.
    this._box(6, 2.4, 2, -8, 1.2, 9, this.matMetal, { shadow: true });
    this._box(2, 2.4, 6, 8, 1.2, -2, this.matMetal, { shadow: true });
    this._box(3, 3.2, 3, 0, 1.6, 10, this.matMetal, { shadow: true });

    // Crate cover stacks (single InstancedMesh).
    const sc = 1.4;
    const spots = [[-6, 2], [6, 6], [11, 12], [-11, -4], [3, -12], [-3, 14], [12, -8]];
    const pos = [];
    for (const [x, z] of spots) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        pos.push(new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, sc / 2 + i * sc, z + (Math.random() - 0.5) * 0.4));
      }
    }
    const geo = new THREE.BoxGeometry(sc, sc, sc);
    const crates = new THREE.InstancedMesh(geo, this.matCrate, pos.length);
    crates.castShadow = true; crates.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const half = new THREE.Vector3(sc / 2, sc / 2, sc / 2);
    for (let i = 0; i < pos.length; i++) {
      m4.makeTranslation(pos[i].x, pos[i].y, pos[i].z);
      crates.setMatrixAt(i, m4);
      this.colliders.push(new THREE.Box3(pos[i].clone().sub(half), pos[i].clone().add(half)));
    }
    crates.instanceMatrix.needsUpdate = true;
    this.root.add(crates);
    this.solids.push(crates);

    for (const p of [[-20, -20], [20, -20], [0, -21], [-21, 0], [21, 0], [-18, -12], [18, -12]]) {
      this.enemySpawns.push(new THREE.Vector3(p[0], 0, p[1]));
    }
  }

  _buildLights() {
    this.root.add(new THREE.AmbientLight(0x6a5a4c, 1.5));
    this.root.add(new THREE.HemisphereLight(0xcaa472, 0x3a2c20, 1.25));

    const sun = new THREE.DirectionalLight(0xffe8cc, 1.7);
    sun.position.set(8, 20, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const d = ARENA_HALF + 4;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0004;
    this.root.add(sun); this.root.add(sun.target);

    // Cold overhead work-lamps for visibility (and to contrast the magma).
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xdfeeff, emissive: 0xaecbff, emissiveIntensity: 3.6 });
    for (const [x, z] of [[-11, -12], [11, -12], [0, 0], [-11, 14], [11, 14], [0, -20], [0, 20]]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 16), lampMat);
      disc.position.set(x, 8.3, z);
      this.root.add(disc);
      const pl = new THREE.PointLight(0xcfe2ff, 26, 32, 2);
      pl.position.set(x, 7.9, z);
      this.root.add(pl);
    }
  }

  // Pulse the magma glow.
  update(t) {
    for (let i = 0; i < this.lamps.length; i++) {
      this.lamps[i].intensity = 12 + Math.sin(t * 2.4 + i * 0.9) * 2.6 + (Math.random() < 0.03 ? 2.5 : 0);
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh && o.dispose) o.dispose();
    });
    for (const m of [this.matFloor, this.matWall, this.matMetal, this.matFurnace, this.matCrate, this.matMagma]) {
      if (m) m.dispose();
    }
    this.colliders.length = 0; this.solids.length = 0; this.enemySpawns.length = 0; this.lamps.length = 0;
  }
}
