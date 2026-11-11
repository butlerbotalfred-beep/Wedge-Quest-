// The night-forest diorama around the board: low-poly ground, trees, rocks,
// a ruined tower and glowing lanterns. Everything repeated is instanced.
(function (root) {
  'use strict';
  const THREE = root.THREE;
  if (!THREE) return;

  const TAU = Math.PI * 2;
  const GROUND_Y = -0.6;

  function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const noise = (x, z) => Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27) + 0.5 * Math.sin(x * 0.83 + z * 0.67) + 0.25 * Math.cos(x * 1.9 - z * 1.4);

  // opts: { inner: radius of the board's outer edge }
  function create(opts) {
    const inner = opts.inner;
    const flat = inner + 1.6;
    const g = new THREE.Group();
    const own = [];
    const R = rng(23);
    const groundAt = (x, z) => GROUND_Y + noise(x, z) * 0.55 * smooth(flat, flat + 12, Math.hypot(x, z)) + 0.0;

    // ground
    const geo = new THREE.PlaneGeometry(260, 260, 84, 84);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const deep = new THREE.Color('#091c2e');
    const moss = new THREE.Color('#14472f');
    const grass = new THREE.Color('#2a6a38');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const n = noise(x * 1.7, z * 1.7);
      const h = noise(x, z) * 0.55 * smooth(flat, flat + 12, r);
      pos.setY(i, GROUND_Y + h);
      const t = smooth(flat, flat + 18, r);
      c.copy(deep).lerp(moss, t * (0.5 + 0.5 * Math.sin(n * 2.2))).lerp(grass, t * Math.max(0, n) * 0.35);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    g.add(new THREE.Mesh(geo, groundMat));
    own.push(geo, groundMat);

    // scattered spots, away from each other and from the board
    const spots = [];
    const place = (minR, maxR, spacing, tries, a0, a1) => {
      for (let k = 0; k < tries; k++) {
        const a = a0 === undefined ? R() * TAU : a0 + R() * (a1 - a0);
        const r = inner + minR + Math.pow(R(), 1.25) * (maxR - minR);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < spacing)) continue;
        const s = { x, z, y: groundAt(x, z), a: R() * TAU, k: R() };
        spots.push(s);
        return s;
      }
      return null;
    };

    const dummy = new THREE.Object3D();
    const instanced = (geometry, material, items, colors) => {
      const m = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach((it, i) => {
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
        dummy.scale.set(it.sx, it.sy, it.sz);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        if (colors) m.setColorAt(i, c.set(colors[i]));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.frustumCulled = false;
      g.add(m);
      own.push(geometry, material);
      return m;
    };

    // trees: round bushy ones and a few pines
    const round = [];
    const pines = [];
    for (let i = 0; i < 70; i++) {
      const s = place(2.6, 40, 2.9, 12);
      if (!s) continue;
      (s.k < 0.72 ? round : pines).push(s);
    }
    // a taller backdrop of trees behind the board so they rise above its far edge on screen
    for (let i = 0; i < 26; i++) {
      const s = place(2.4, 9, 2.6, 14, -2.75, -0.4);
      if (s) {
        s.big = true;
        round.push(s);
      }
    }
    const greens = ['#1b6b45', '#237a47', '#2f8a46', '#2a7a3a', '#5f9a2e', '#215f4a', '#3a8a3a'];
    const trunks = [];
    const low = [];
    const top = [];
    const lowC = [];
    const topC = [];
    const fairy = [];
    round.forEach((s) => {
      const k = s.big ? 1.3 + R() * 0.9 : 0.85 + R() * 0.9;
      if (R() < 0.55) {
        for (let j = 0; j < 3; j++) {
          const a = R() * TAU;
          fairy.push({ x: s.x + Math.cos(a) * 1.5 * k, y: s.y + (1.5 + R() * 1.4) * k, z: s.z + Math.sin(a) * 1.5 * k, sx: 1, sy: 1, sz: 1 });
        }
      }
      trunks.push({ x: s.x, y: s.y + 0.7 * k, z: s.z, sx: k, sy: k, sz: k });
      low.push({ x: s.x, y: s.y + 1.9 * k, z: s.z, ry: s.a, sx: 1.55 * k, sy: 1.2 * k, sz: 1.55 * k });
      top.push({ x: s.x + (R() - 0.5) * 0.4, y: s.y + 3.0 * k, z: s.z + (R() - 0.5) * 0.4, ry: s.a, sx: 1.05 * k, sy: 0.95 * k, sz: 1.05 * k });
      const gc = greens[(R() * greens.length) | 0];
      lowC.push(gc);
      topC.push(greens[(R() * greens.length) | 0]);
    });
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b3b34', roughness: 0.9, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true, emissive: new THREE.Color('#145a36'), emissiveIntensity: 0.6 });
    instanced(new THREE.CylinderGeometry(0.16, 0.26, 1.5, 6), trunkMat, trunks);
    instanced(new THREE.IcosahedronGeometry(1, 1), leafMat, low, lowC);
    instanced(new THREE.IcosahedronGeometry(1, 1), leafMat.clone(), top, topC);
    if (fairy.length) instanced(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc66a').multiplyScalar(2.6) }), fairy);

    if (pines.length) {
      const pineTrunk = [];
      const cone1 = [];
      const cone2 = [];
      const pc = [];
      pines.forEach((s) => {
        const k = 0.9 + R() * 0.9;
        pineTrunk.push({ x: s.x, y: s.y + 0.6 * k, z: s.z, sx: 0.8 * k, sy: k, sz: 0.8 * k });
        cone1.push({ x: s.x, y: s.y + 1.9 * k, z: s.z, ry: s.a, sx: 1.25 * k, sy: 1.6 * k, sz: 1.25 * k });
        cone2.push({ x: s.x, y: s.y + 3.1 * k, z: s.z, ry: s.a, sx: 0.9 * k, sy: 1.4 * k, sz: 0.9 * k });
        pc.push(['#14604a', '#1a6f55', '#1f7a5c'][(R() * 3) | 0]);
      });
      instanced(new THREE.CylinderGeometry(0.14, 0.22, 1.2, 6), trunkMat.clone(), pineTrunk);
      const coneGeo = new THREE.ConeGeometry(1, 1.8, 7);
      instanced(coneGeo, leafMat.clone(), cone1, pc);
      instanced(coneGeo.clone(), leafMat.clone(), cone2, pc);
    }

    // rocks
    const rocks = [];
    const rockC = [];
    for (let i = 0; i < 34; i++) {
      const s = place(1.8, 34, 2.2, 10);
      if (!s) continue;
      const k = 0.5 + R() * 1.5;
      rocks.push({ x: s.x, y: s.y + 0.25 * k, z: s.z, rx: R() * 0.6, ry: s.a, rz: R() * 0.6, sx: k * (0.8 + R() * 0.6), sy: k * 0.65, sz: k * (0.8 + R() * 0.6) });
      rockC.push(['#5a6aa8', '#4a5190', '#7b78c0', '#3f4a80'][(R() * 4) | 0]);
    }
    instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, flatShading: true }), rocks, rockC);

    // a ruined tower with a lit window, back right, and a low wall back left
    const stone = new THREE.MeshStandardMaterial({ color: '#b39a76', roughness: 0.85, flatShading: true });
    const win = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc25a').multiplyScalar(2.4) });
    const tower = (a, r, h) => {
      const x = Math.cos(a) * (inner + r);
      const z = Math.sin(a) * (inner + r);
      const y = groundAt(x, z);
      const t = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 2.6), stone);
      body.position.y = h / 2;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.5, 3.1), stone);
      cap.position.y = h + 0.1;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), win);
      w.position.set(0, h * 0.62, 1.31);
      t.add(body, cap, w);
      t.position.set(x, y, z);
      t.rotation.y = -a + Math.PI / 2;
      g.add(t);
      own.push(body.geometry, cap.geometry, w.geometry);
    };
    tower(-0.62, 12, 4.2);
    tower(-2.55, 15, 3.2);

    // lanterns on posts
    const lantern = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(2.8) });
    const postMat = new THREE.MeshStandardMaterial({ color: '#3a2a4a', roughness: 0.8 });
    const lights = [];
    const lanternMeshes = [];
    const lanternAngles = [-0.45, -1.0, 0.25, 0.95, 2.2, 2.85, 3.5, 4.1, 5.35, -1.55, -2.05, -2.5, 1.55, 0.6];
    lanternAngles.forEach((a, i) => {
      const r = inner + 2.4 + (i % 3) * 1.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = groundAt(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.7, 6), postMat);
      post.position.set(x, y + 0.85, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lantern);
      bulb.position.set(x, y + 1.85, z);
      g.add(post, bulb);
      lanternMeshes.push(bulb);
      if (i < 3) lights.push(new THREE.Vector3(x, y + 2.2, z));
      own.push(post.geometry, bulb.geometry);
    });
    own.push(stone, win, lantern, postMat);

    return {
      group: g,
      lights,
      update(t) {
        lanternMeshes.forEach((m, i) => {
          const s = 1 + Math.sin(t * 2.3 + i * 1.7) * 0.07;
          m.scale.setScalar(s);
        });
      },
      dispose() {
        g.traverse((o) => {
          if (o.isMesh && o.material && o.material.dispose) o.material.dispose();
        });
        own.forEach((o) => o && o.dispose && o.dispose());
      },
    };
  }

  root.WQScenery = { create, GROUND_Y };
})(typeof window !== 'undefined' ? window : globalThis);
