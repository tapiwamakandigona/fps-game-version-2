import * as THREE from 'three';
import { concreteTexture, roughnessNoise, metalTexture, crateTexture } from './textures.js';

export const ARENA_HALF = 24; // same footprint as the other arenas

// Third level: a night-time city rooftop. Open sky, low parapets with a distant
// neon skyline, HVAC units and a stairwell shed for cover, and a central
// helipad. Same interface as Warehouse/Foundry (colliders, solids, enemySpawns,
// lamps, playerSpawn, update, dispose).
export class Rooftop {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.name = 'ROOFTOP';
    this.colliders = [];
    this.solids = [];          // bullet-blocking meshes (curated raycast targets)
    this.enemySpawns = [];
    this.lamps = [];           // neon + beacon lights we pulse
    this.playerSpawn = new THREE.Vector3(0, 1.7, ARENA_HALF - 4);

    this._buildMaterials();
    this._buildShell();
    this._buildSkyline();
    this._buildProps();
    this._buildNeon();
    this._buildLights();
  }

  _buildMaterials() {
    this.matFloor = new THREE.MeshStandardMaterial({
      map: concreteTexture(8, '#23262d'), roughnessMap: roughnessNoise(8, 190),
      roughness: 0.92, metalness: 0.05, color: 0x9aa0ac,
    });
    this.matParapet = new THREE.MeshStandardMaterial({
      map: concreteTexture(4, '#2a2d34'), roughness: 0.9, metalness: 0.05, color: 0x8b919c,
    });
    this.matMetal = new THREE.MeshStandardMaterial({
      map: metalTexture(2, '#4a505c'), roughness: 0.5, metalness: 0.6, color: 0xbcc4d2,
    });
    this.matShed = new THREE.MeshStandardMaterial({
      map: concreteTexture(2, '#3a3e48'), roughness: 0.85, metalness: 0.1, color: 0xaab0bc,
    });
    this.matCrate = new THREE.MeshStandardMaterial({ map: crateTexture('#5a6a7c'), roughness: 0.7, metalness: 0.2, color: 0xc4cedc });
    this.matPad = new THREE.MeshStandardMaterial({
      map: concreteTexture(3, '#1d2026'), roughness: 0.95, metalness: 0.04, color: 0x7c828e,
    });
    this.matPadMark = new THREE.MeshBasicMaterial({ color: 0xffd257 });
    this.matPadMark.toneMapped = false;
    // Distant buildings: near-black slabs; windows are emissive dots.
    this.matTower = new THREE.MeshBasicMaterial({ color: 0x0b0e14 });
    this.matWin = new THREE.MeshBasicMaterial({ color: 0x9fc4ff });
    this.matWin.toneMapped = false;
    this.matNeonCyan = new THREE.MeshBasicMaterial({ color: 0x37f0ff });
    this.matNeonCyan.toneMapped = false;
    this.matNeonMag = new THREE.MeshBasicMaterial({ color: 0xff3fd4 });
    this.matNeonMag.toneMapped = false;
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

    // Low parapet walls you can see the skyline over...
    const t = 0.8, pH = 1.3, yC = pH / 2;
    this._box(H * 2, pH, t, 0, yC, -H, this.matParapet);
    this._box(H * 2, pH, t, 0, yC, H, this.matParapet);
    this._box(t, pH, H * 2, -H, yC, 0, this.matParapet);
    this._box(t, pH, H * 2, H, yC, 0, this.matParapet);
    // ...plus invisible tall barriers so nobody walks off the roof (colliders
    // only — not added to solids, so bullets sail out into the night).
    const wallH = 9;
    for (const [w, d, x, z] of [[H * 2, t, 0, -H], [H * 2, t, 0, H], [t, H * 2, -H, 0], [t, H * 2, H, 0]]) {
      const min = new THREE.Vector3(x - w / 2, 0, z - d / 2);
      const max = new THREE.Vector3(x + w / 2, wallH, z + d / 2);
      this.colliders.push(new THREE.Box3(min, max));
    }
  }

  // Distant tower silhouettes with lit windows — pure set dressing (no colliders).
  _buildSkyline() {
    const winGeo = new THREE.PlaneGeometry(0.9, 0.6);
    const rng = (a, b) => a + Math.random() * (b - a);
    const towers = [];
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + rng(-0.1, 0.1);
      const dist = rng(46, 72);
      towers.push({ x: Math.cos(ang) * dist, z: Math.sin(ang) * dist, w: rng(7, 13), h: rng(14, 34) });
    }
    // Batch all windows into one InstancedMesh (a few hundred quads, one draw call).
    const wins = [];
    for (const tw of towers) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(tw.w, tw.h, tw.w), this.matTower);
      tower.position.set(tw.x, tw.h / 2 - 6, tw.z); // sunk a bit: we're on a high roof
      this.root.add(tower);
      // Windows on the face pointing at the arena.
      const toward = Math.atan2(-tw.z, -tw.x);
      const cols = Math.floor(tw.w / 1.6), rows = Math.floor(tw.h / 1.5);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (Math.random() > 0.38) continue; // most windows dark at night
          const lx = -tw.w / 2 + 0.9 + c * 1.6, ly = -tw.h / 2 + 1.0 + r * 1.5;
          wins.push({ tower: tw, toward, lx, ly });
        }
      }
    }
    const inst = new THREE.InstancedMesh(winGeo, this.matWin, Math.max(1, wins.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < wins.length; i++) {
      const wn = wins[i];
      eu.set(0, wn.toward + Math.PI / 2, 0);
      q.setFromEuler(eu);
      const off = wn.tower.w / 2 + 0.06;
      p.set(
        wn.tower.x + Math.cos(wn.toward) * off + Math.cos(wn.toward + Math.PI / 2) * wn.lx,
        wn.tower.h / 2 - 6 + wn.ly + wn.tower.h / 2,
        wn.tower.z + Math.sin(wn.toward) * off + Math.sin(wn.toward + Math.PI / 2) * wn.lx,
      );
      m4.compose(p, q, s);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.root.add(inst);
  }

  _buildProps() {
    // Central helipad: a flat disc + yellow ring marking (no colliders, walkable).
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.08, 36), this.matPad);
    pad.position.set(0, 0.04, -2); pad.receiveShadow = true;
    this.root.add(pad); this.solids.push(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.0, 5.6, 40), this.matPadMark);
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.10, -2);
    this.root.add(ring);

    // Stairwell shed (big solid block, the main sightline breaker).
    this._box(7, 3.6, 5, -13, 1.8, -13, this.matShed, { shadow: true });
    // HVAC units + vent stacks for mid-field cover.
    this._box(4.5, 2.0, 2.6, 9, 1.0, -10, this.matMetal, { shadow: true });
    this._box(2.6, 2.0, 4.5, 13, 1.0, 6, this.matMetal, { shadow: true });
    this._box(4.0, 1.8, 2.4, -9, 0.9, 8, this.matMetal, { shadow: true });
    this._box(2.2, 2.8, 2.2, 4, 1.4, 13, this.matMetal, { shadow: true });
    this._box(2.2, 2.8, 2.2, -4, 1.4, -18, this.matMetal, { shadow: true });
    // Water tank on stubby legs (visual bulk + cover).
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.2, 18), this.matMetal);
    tank.position.set(16, 2.6, -16); tank.castShadow = true; tank.receiveShadow = true;
    this.root.add(tank);
    this.colliders.push(new THREE.Box3().setFromObject(tank));
    this.solids.push(tank);

    // Crate stacks (single InstancedMesh, same trick as the Foundry).
    const sc = 1.4;
    const spots = [[-6, 3], [7, 1], [-15, 2], [2, -14], [-2, 17], [15, 15], [-18, 16]];
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

    // Zombies climb over the edges and pour out of the stairwell.
    for (const p of [[-20, -20], [20, -20], [0, -21], [-21, 0], [21, 0], [-13, -10], [18, 18], [-20, 20]]) {
      this.enemySpawns.push(new THREE.Vector3(p[0], 0, p[1]));
    }
  }

  // Neon signage on the stairwell + parapet corners. These are the "lamps" we pulse.
  _buildNeon() {
    const add = (w, h, x, y, z, ry, mat, color) => {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      sign.position.set(x, y, z); sign.rotation.y = ry;
      this.root.add(sign);
      const pl = new THREE.PointLight(color, 18, 22, 2);
      pl.position.set(x, y, z + (Math.abs(ry) < 0.1 ? 1.2 : 0));
      this.root.add(pl);
      this.lamps.push(pl);
    };
    add(5.5, 1.1, -13, 3.0, -10.4, 0, this.matNeonCyan, 0x37f0ff);          // stairwell face
    add(3.5, 0.9, 23.5, 2.2, -12, -Math.PI / 2, this.matNeonMag, 0xff3fd4); // east parapet
    add(3.5, 0.9, -23.5, 2.2, 10, Math.PI / 2, this.matNeonCyan, 0x37f0ff); // west parapet
    // Red aviation beacon on the water tank (slow blink, handled in update()).
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    beaconMat.toneMapped = false;
    this._beaconMat = beaconMat;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), beaconMat);
    bulb.position.set(16, 4.5, -16);
    this.root.add(bulb);
    this._beacon = new THREE.PointLight(0xff2a2a, 0, 30, 2);
    this._beacon.position.set(16, 4.6, -16);
    this.root.add(this._beacon);
  }

  _buildLights() {
    this.root.add(new THREE.AmbientLight(0x5c6580, 3.4));
    this.root.add(new THREE.HemisphereLight(0x8498c0, 0x242832, 2.6));

    // Cold moonlight.
    const moon = new THREE.DirectionalLight(0xbdd2ff, 2.1);
    moon.position.set(-10, 22, 6);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const d = ARENA_HALF + 4;
    moon.shadow.camera.left = -d; moon.shadow.camera.right = d;
    moon.shadow.camera.top = d; moon.shadow.camera.bottom = -d;
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 60;
    moon.shadow.bias = -0.0004;
    this.root.add(moon); this.root.add(moon.target);

    // Warm rooftop floods so the play space reads clearly at night.
    for (const [x, z] of [[-8, -2], [10, 10], [0, -18], [14, -8], [-14, 12], [0, 4]]) {
      const pl = new THREE.PointLight(0xffe2b8, 34, 36, 2);
      pl.position.set(x, 6.5, z);
      this.root.add(pl);
    }
  }

  // Flicker the neon + blink the beacon.
  update(t) {
    for (let i = 0; i < this.lamps.length; i++) {
      this.lamps[i].intensity = 16 + Math.sin(t * 3.1 + i * 2.1) * 3 + (Math.random() < 0.02 ? -9 : 0);
    }
    if (this._beacon) {
      const on = (t % 2.2) < 0.18;
      this._beacon.intensity = on ? 30 : 0;
      this._beaconMat.color.setHex(on ? 0xff5a5a : 0x5a1010);
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh && o.dispose) o.dispose();
    });
    for (const m of [this.matFloor, this.matParapet, this.matMetal, this.matShed, this.matCrate,
      this.matPad, this.matPadMark, this.matTower, this.matWin, this.matNeonCyan, this.matNeonMag, this._beaconMat]) {
      if (m) m.dispose();
    }
    this.colliders.length = 0; this.solids.length = 0; this.enemySpawns.length = 0; this.lamps.length = 0;
  }
}
