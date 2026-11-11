// The 3D board: a glossy candy-tile wheel in a night-forest diorama, drawn with three.js.
// Uses the global THREE (r147) plus its EffectComposer / UnrealBloomPass add-ons.
(function (root) {
  'use strict';
  const THREE = root.THREE;
  if (!THREE) return;
  const Tex = root.WQTex;
  const Scenery = root.WQScenery;

  const BG = '#070a30';
  const GOLD = '#ffc928';
  const TAU = Math.PI * 2;
  const EMOJI_FONT = Tex.EMOJI_FONT;

  // Icon colours on each tile colour: [light, dark] steps of one tint.
  const ICON_TINT = [
    ['#ffffff', '#d6a2cc'], // pink: cream
    ['#a77bff', '#3a1f8c'], // cyan: purple
    ['#6cc46a', '#1d5a3a'], // yellow: green
    ['#f3e7ff', '#8a5ad0'], // violet: lilac
    ['#7b86a8', '#262d48'], // lime: slate
    ['#7a83a3', '#2a2f4a'], // orange: slate
    ['#ffd9a0', '#c06a20'], // blue: sand
    ['#7a72e0', '#241c70'], // mint: indigo
  ];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
  const colorOf = (hex) => new THREE.Color(hex);
  const mixCol = (a, b, t) => colorOf(a).lerp(colorOf(b), t);

  function canvasTex(source) {
    const tex = new THREE.CanvasTexture(source);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }

  function roundedRect(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  // A rounded slab lying on the XZ plane from y = 0 up to `height`.
  function slabGeo(w, height, bevel, corner) {
    const inner = w - bevel * 2;
    const g = new THREE.ExtrudeGeometry(roundedRect(inner, inner, w * (corner || 0.24)), {
      depth: Math.max(0.001, height - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 8,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0);
    return g;
  }

  // One segment of a ring (a wedge of the pie), lying flat.
  function wedgeGeo(inner, outer, angle, depth) {
    const s = new THREE.Shape();
    s.absarc(0, 0, outer, -angle / 2, angle / 2, false);
    s.absarc(0, 0, inner, angle / 2, -angle / 2, true);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 14 });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  function slotOffsets(k, radius) {
    if (k <= 1) return [[0, 0]];
    const out = [];
    for (let i = 0; i < k; i++) {
      const a = -Math.PI / 2 + (TAU * i) / k;
      out.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
    return out;
  }

  // Neon tube around the rim, colour sliding pink -> violet -> blue -> cyan.
  function neonRingGeo(radius, tube) {
    const geo = new THREE.TorusGeometry(radius, tube, 10, 220);
    geo.rotateX(Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const stops = ['#3d8bff', '#a35bff', '#ff5fd8', '#27d3ff', '#3d8bff'].map(colorOf);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = ((Math.atan2(pos.getZ(i), pos.getX(i)) + TAU) % TAU) / TAU;
      const f = t * 4;
      const k = Math.min(3, Math.floor(f));
      c.copy(stops[k]).lerp(stops[k + 1], f - k);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  function gemMaterial(power) {
    return new THREE.MeshStandardMaterial({ color: GOLD, emissive: colorOf('#ff9a00'), emissiveIntensity: power || 1.2, metalness: 0.35, roughness: 0.22, flatShading: true });
  }

  class BoardScene {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.hooks = hooks || {};
      this.ok = false;
      this.w = 1;
      this.h = 1;
      this.insets = { l: 0, r: 0, t: 0, b: 0 };
      this.cam = { yaw: 0, tilt: 1.02, zoom: 1 };
      this.camT = { yaw: 0, tilt: 1.02, zoom: 1 };
      this.fill = 1.0;
      this.mode = 'preview';
      this.glow = true;
      this.perfLevel = 0;
      this.maxDt = 0.05; // longest simulated step per frame (tests raise it)
      this.tweens = [];
      this.tiles = [];
      this.pickables = [];
      this.pawns = new Map();
      this.iconTex = new Map();
      this.owned = [];
      this.geoCache = new Map();
      this.floaters = [];
      this.ripples = [];
      this.choices = null;
      this.choiceMeshes = [];
      this.dimK = 0;
      this.dimTarget = 0;
      this.hoverId = -1;
      this.time = 0;
      this.layout = null;
      this.cats = [];
      this.fitR = 12;
      this.scenery = null;
      this.reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      try {
        this.init();
        this.ok = true;
      } catch (e) {
        console.error('3D setup failed', e);
        this.error = e;
      }
    }

    // ---------- setup ----------

    init() {
      THREE.ColorManagement.legacyMode = false;
      const cv = this.canvas;
      const r = (this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }));
      r.outputEncoding = THREE.sRGBEncoding;
      r.setClearColor(colorOf(BG), 1);
      const parent = cv.parentElement;
      this.w = Math.max(1, parent.clientWidth);
      this.h = Math.max(1, parent.clientHeight);
      const search = (root.location && root.location.search) || '';
      this.perfLocked = /[?&]q=(hi|lo)\b/.test(search); // test switches: fixed quality
      this.perfLevel = /[?&]q=lo\b/.test(search) ? 3 : 0;
      this.glow = this.perfLevel < 3;
      const q = this.chooseQuality();
      this.dpr = q.dpr;
      this.samples = q.samples;
      r.setPixelRatio(this.dpr);
      r.setSize(this.w, this.h, false);

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(colorOf('#0a1040'), 0.011);
      this.camera = new THREE.PerspectiveCamera(44, this.w / this.h, 1, 400);

      this.scene.add(new THREE.HemisphereLight(0x8fa0ff, 0x1a1450, 0.4));
      const key = new THREE.DirectionalLight(0xdfe6ff, 0.55);
      key.position.set(-10, 22, 12);
      this.scene.add(key);
      const back = new THREE.DirectionalLight(0x6a5cff, 0.45);
      back.position.set(12, 10, -14);
      this.scene.add(back);
      this.warm = [0, 1, 2].map(() => {
        const l = new THREE.PointLight(0xffa860, 1.3, 20, 2);
        l.position.set(0, -50, 0);
        this.scene.add(l);
        return l;
      });
      this.makeEnv();

      this.boardGroup = new THREE.Group();
      this.pawnGroup = new THREE.Group();
      this.fxGroup = new THREE.Group();
      this.scene.add(this.boardGroup, this.pawnGroup, this.fxGroup);

      this.makeDust();
      this.makeBursts();
      this.makeComposer();
      this.bindPointer();

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(parent);
      this.applyView();
      this.last = performance.now();
      const loop = (now) => {
        this.raf = requestAnimationFrame(loop);
        const ms = now - this.last;
        const dt = Math.min(this.maxDt, ms / 1000);
        this.last = now;
        this.watchFrame(ms);
        if (!this.paused) this.tick(dt);
      };
      this.raf = requestAnimationFrame(loop);
    }

    // Soft studio reflections so the candy tiles get glossy highlights.
    makeEnv() {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const s = new THREE.Scene();
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(40, 32, 16),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(vec3(0.02, 0.03, 0.14), vec3(0.12, 0.17, 0.5), h), 1.0); }',
        })
      );
      s.add(dome);
      const panel = (w, h, hex, x, y, z, k) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: colorOf(hex).multiplyScalar(k), side: THREE.DoubleSide }));
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        s.add(m);
      };
      panel(18, 9, '#ffffff', -14, 24, 12, 5);
      panel(5, 24, '#44ccff', 26, 8, -4, 4);
      panel(5, 22, '#ff55cc', -26, 6, -8, 4);
      panel(24, 4, '#ffffff', 0, 16, -28, 4);
      this.scene.environment = pm.fromScene(s, 0.03).texture;
      pm.dispose();
    }

    // Neon glow: only things brighter than white bloom, so the tiles keep bold,
    // saturated colour while their edges, rings and effects glow. The bright
    // pass judges the strongest channel so every hue glows the same amount.
    makeComposer() {
      const r = this.renderer;
      const size = new THREE.Vector2();
      r.getDrawingBufferSize(size);
      const hdr = r.capabilities.isWebGL2 && r.extensions.has('EXT_color_buffer_float');
      this.hdr = hdr;
      const hp = THREE.LuminosityHighPassShader;
      if (!hp.patched) {
        hp.fragmentShader = hp.fragmentShader.replace('float v = dot( texel.xyz, luma );', 'float v = max( texel.r, max( texel.g, texel.b ) );');
        hp.patched = true;
      }
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: this.samples });
      const c = (this.composer = new THREE.EffectComposer(r, rt));
      c.setPixelRatio(this.dpr);
      c.setSize(this.w, this.h);
      c.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.65, 0.55, hdr ? 1.02 : 0.9);
      c.addPass(this.bloom);
      c.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    }

    dotTexture() {
      if (!this._dot) this._dot = canvasTex(Tex.dot());
      return this._dot;
    }

    makeDust() {
      const n = 170;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      this.dustSpeed = new Float32Array(n);
      const pal = ['#ffd27a', '#7ad8ff', '#ff8ae0', '#b8ff7a'];
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 80;
        pos[i * 3 + 1] = Math.random() * 14;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
        const c = colorOf(pal[i % pal.length]);
        col[i * 3] = c.r * 0.9;
        col[i * 3 + 1] = c.g * 0.9;
        col[i * 3 + 2] = c.b * 0.9;
        this.dustSpeed[i] = 0.15 + Math.random() * 0.35;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.3, map: this.dotTexture(), vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
    }

    makeBursts() {
      const n = 720;
      this.bN = n;
      this.bPos = new Float32Array(n * 3).fill(0);
      this.bVel = new Float32Array(n * 3);
      this.bCol = new Float32Array(n * 3);
      this.bBase = new Float32Array(n * 3);
      this.bLife = new Float32Array(n);
      this.bMax = new Float32Array(n);
      this.bGrav = new Float32Array(n);
      for (let i = 0; i < n; i++) this.bPos[i * 3 + 1] = -200;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.bPos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.bCol, 3));
      this.bursts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.42, map: this.dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.bursts.frustumCulled = false;
      this.fxGroup.add(this.bursts);
      this.bCursor = 0;
    }

    // ---------- view ----------

    resize() {
      const p = this.canvas.parentElement;
      const w = Math.max(1, p.clientWidth);
      const h = Math.max(1, p.clientHeight);
      if (w === this.w && h === this.h) return;
      this.w = w;
      this.h = h;
      this.renderer.setSize(w, h, false);
      this.applyQuality();
      this.applyView();
    }

    // Pixel budget: keep the drawing buffer near 3 megapixels, and spend
    // anti-aliasing only where pixels are big enough for it to matter.
    chooseQuality() {
      const lvl = this.perfLevel || 0;
      const native = Math.min(root.devicePixelRatio || 1, 2);
      const px = Math.max(1, this.w * this.h);
      let dpr = Math.min(native, Math.max(1, Math.sqrt(3.0e6 / px)));
      if (lvl >= 1) dpr = Math.min(dpr, 1.25);
      if (lvl >= 2) dpr = 1;
      const gl2 = this.renderer.capabilities.isWebGL2;
      const samples = !gl2 || lvl >= 2 ? 0 : dpr <= 1.25 ? 4 : dpr <= 1.6 ? 2 : 0;
      return { dpr, samples };
    }

    applyQuality() {
      const q = this.chooseQuality();
      this.dpr = q.dpr;
      this.renderer.setPixelRatio(q.dpr);
      this.composer.setPixelRatio(q.dpr);
      this.composer.setSize(this.w, this.h);
      if (q.samples !== this.samples) {
        this.samples = q.samples;
        for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
          rt.samples = q.samples;
          rt.dispose();
        }
      }
    }

    // Slow device? Step the detail down: lower resolution, then no glow.
    watchFrame(ms) {
      if (this.perfLocked || document.hidden || ms <= 0 || ms > 250) return;
      this.perfAcc = (this.perfAcc || 0) + ms;
      this.perfN = (this.perfN || 0) + 1;
      if (this.perfN < 50) return;
      const avg = this.perfAcc / this.perfN;
      this.perfAcc = 0;
      this.perfN = 0;
      this.perfWindows = (this.perfWindows || 0) + 1;
      if (this.perfWindows < 2 || avg < 42 || this.perfLevel >= 3) return; // first window includes shader compiles
      this.perfLevel++;
      if (this.perfLevel >= 3) this.glow = false;
      else this.applyQuality();
      if (this.hooks.onQuality) this.hooks.onQuality(this.perfLevel);
    }

    // Keep the board centred in the part of the screen the interface leaves free.
    setInsets(ins) {
      this.insets = { l: ins.l || 0, r: ins.r || 0, t: ins.t || 0, b: ins.b || 0 };
      this.applyView();
    }

    applyView() {
      const i = this.insets;
      this.camera.aspect = this.w / this.h;
      const sy = this._shiftY || 0;
      this.camera.setViewOffset(this.w, this.h, -(i.l - i.r) / 2, -((i.t - i.b) / 2 + sy), this.w, this.h);
    }

    // Camera distance (and the vertical nudge that centres it) at which the
    // whole rim just fits the free part of the screen at this tilt.
    solveView(tilt) {
      const i = this.insets;
      const key = [tilt.toFixed(3), this.w, this.h, i.l, i.r, i.t, i.b, this.fitR].join('|');
      if (key === this._viewKey) return;
      this._viewKey = key;
      const W = this.w;
      const H = this.h;
      const fw = Math.max(240, W - i.l - i.r) * this.fill;
      const fh = Math.max(200, H - i.t - i.b) * this.fill;
      const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const aspect = W / H;
      const sinT = Math.sin(tilt);
      const cosT = Math.cos(tilt);
      const pts = [];
      for (let k = 0; k < 64; k++) {
        const a = (TAU * k) / 64;
        pts.push([this.fitR * Math.cos(a), 0.95, this.fitR * Math.sin(a)]);
      }
      const extent = (d) => {
        let x0 = 1e9;
        let x1 = -1e9;
        let y0 = 1e9;
        let y1 = -1e9;
        for (const p of pts) {
          const vy = p[1] - d * cosT;
          const vz = p[2] - d * sinT;
          const depth = -vy * cosT - vz * sinT;
          const sx = (p[0] / depth / (tanH * aspect)) * (W / 2);
          const sy = ((vy * sinT - vz * cosT) / depth / tanH) * (H / 2);
          if (sx < x0) x0 = sx;
          if (sx > x1) x1 = sx;
          if (sy < y0) y0 = sy;
          if (sy > y1) y1 = sy;
        }
        return { w: x1 - x0, h: y1 - y0, cy: (y0 + y1) / 2 };
      };
      let lo = this.fitR * 1.05;
      let hi = this.fitR * 24;
      for (let n = 0; n < 26; n++) {
        const mid = (lo + hi) / 2;
        const e = extent(mid);
        if (e.w <= fw && e.h <= fh) hi = mid;
        else lo = mid;
      }
      this._dist = hi;
      this._shiftY = extent(hi).cy; // px, up positive; moves the rim's centre onto the free area's centre
      this.applyView();
    }

    setMode(mode) {
      this.mode = mode;
      this.camT.tilt = mode === 'play' ? 0.98 : 1.02;
      this.camT.zoom = 1;
      if (mode === 'play') {
        this.cam.yaw = ((((this.cam.yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
        this.camT.yaw = 0;
      }
    }

    resetView() {
      this.cam.yaw = ((((this.cam.yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
      this.camT.yaw = 0;
      this.camT.tilt = this.mode === 'play' ? 0.98 : 1.02;
      this.camT.zoom = 1;
    }

    setGlow(on) {
      this.glow = !!on && !(this.perfLocked && this.perfLevel >= 3);
    }

    updateCamera(dt) {
      const c = this.cam;
      const t = this.camT;
      if (this.mode === 'preview' && !this.reduced && !this.userDragging) t.yaw += dt * 0.1;
      const k = 1 - Math.pow(0.002, dt);
      c.yaw += (t.yaw - c.yaw) * k;
      c.tilt += (t.tilt - c.tilt) * k;
      c.zoom += (t.zoom - c.zoom) * k;
      this.solveView(c.tilt);
      const sway = this.reduced || this.mode === 'preview' ? 0 : 1;
      const yaw = c.yaw + Math.sin(this.time * 0.35) * 0.018 * sway;
      const tilt = c.tilt + Math.sin(this.time * 0.27) * 0.008 * sway;
      const d = (this._dist || 30) * c.zoom;
      this.camera.position.set(d * Math.sin(tilt) * Math.sin(yaw), d * Math.cos(tilt), d * Math.sin(tilt) * Math.cos(yaw));
      this.camera.lookAt(0, 0, 0);
    }

    // ---------- board ----------

    geo(key, make) {
      let g = this.geoCache.get(key);
      if (!g) {
        g = make();
        this.geoCache.set(key, g);
      }
      return g;
    }

    // Embossed medallion for a topic's tile; cached per emoji and tint.
    iconTexture(emoji, index, natural) {
      const key = `${emoji}|${natural ? 'n' : index}`;
      let t = this.iconTex.get(key);
      if (!t) {
        const tint = ICON_TINT[index % ICON_TINT.length];
        t = canvasTex(Tex.tileIcon(emoji, tint[0], { light: tint[0], dark: tint[1], natural }));
        this.iconTex.set(key, t);
        if (this.iconTex.size > 48) {
          const first = this.iconTex.keys().next().value;
          this.iconTex.get(first).dispose();
          this.iconTex.delete(first);
        }
      }
      return t;
    }

    clearBoard() {
      const dispose = (obj) => {
        obj.traverse((o) => {
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        });
      };
      if (this.scenery) {
        this.boardGroup.remove(this.scenery.group);
        this.scenery.dispose();
        this.scenery = null;
      }
      dispose(this.boardGroup);
      this.boardGroup.clear();
      for (const g of this.geoCache.values()) g.dispose();
      this.geoCache.clear();
      for (const t of this.owned) t.dispose();
      this.owned = [];
      this.tiles = [];
      this.pickables = [];
      this.floaters = [];
      this.clearChoices();
    }

    // layout: from WQLayout.generate; cats: [{ emoji, color }]
    build(layout, cats) {
      this.layout = layout;
      this.cats = cats;
      this.clearBoard();
      const Rf = layout.R + 1.9; // floor radius, tile ring sits inside it
      this.floorR = Rf;
      this.fitR = Rf + 1.35;
      this._viewKey = '';
      this.buildPlatter(Rf);

      for (const node of layout.nodes) {
        if (node.type === 'hub') this.tiles[node.id] = this.buildHub();
        else this.tiles[node.id] = this.buildTile(node);
      }
      this.buildPegs();

      this.scenery = Scenery.create({ inner: Rf + 1.4 });
      this.boardGroup.add(this.scenery.group);
      this.warm.forEach((l, i) => {
        const p = this.scenery.lights[i];
        if (p) l.position.copy(p);
        else l.position.set(0, -50, 0);
      });

      // re-seat any pawns already on the board
      for (const p of this.pawns.values()) this.layoutNode(p.node, true);
    }

    buildPlatter(Rf) {
      const g = this.boardGroup;
      const L = this.layout;

      const floorTex = canvasTex(Tex.floor(Rf, L.n));
      this.owned.push(floorTex);
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(Rf + 0.1, 128),
        new THREE.MeshStandardMaterial({ map: floorTex, color: new THREE.Color(0.75, 0.75, 0.75), roughness: 0.34, metalness: 0.3, envMapIntensity: 0.3 })
      );
      floor.rotation.x = -Math.PI / 2;
      g.add(floor);

      // thick glossy wall around the dish
      const prof = [[Rf - 0.05, -0.7], [Rf - 0.05, 0.05], [Rf + 0.04, 0.5], [Rf + 0.18, 0.78], [Rf + 0.4, 0.9], [Rf + 1.0, 0.9], [Rf + 1.2, 0.82], [Rf + 1.34, 0.1], [Rf + 1.38, -0.7]].map((p) => new THREE.Vector2(p[0], p[1]));
      const wall = new THREE.Mesh(
        new THREE.LatheGeometry(prof, 200),
        new THREE.MeshPhysicalMaterial({ color: '#6a70b0', metalness: 0.55, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.9, side: THREE.DoubleSide })
      );
      g.add(wall);

      // the neon tube on its inner lip, plus a wider soft halo
      const neon = new THREE.Mesh(neonRingGeo(Rf + 0.2, 0.07), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.1, 2.1, 2.1) }));
      neon.position.y = 0.86;
      g.add(neon);
      const halo = new THREE.Mesh(neonRingGeo(Rf + 0.2, 0.26), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.6, 0.6, 0.6), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.y = 0.84;
      g.add(halo);
    }

    buildTile(node) {
      const L = this.layout;
      const isHQ = node.type === 'hq';
      const isRoll = node.type === 'roll';
      const sz = isHQ ? L.tileSize * 1.2 : L.tileSize;
      const h = isHQ ? 0.62 : 0.46;
      const hex = isRoll ? '#ffffff' : this.cats[node.cat].color;
      const col = colorOf(hex);

      const group = new THREE.Group();
      group.position.set(node.x, 0, node.z);
      const body = new THREE.Group();
      body.rotation.y = node.rotY;
      group.add(body);

      // Colour comes from the palette itself (no white mixed in) plus a little
      // emissive, so the candy stays vivid; the lights only shade it.
      const wallBase = isRoll ? colorOf('#5a4a6a') : col.clone().multiplyScalar(0.5);
      const capBase = isRoll ? colorOf('#d2a878') : isHQ ? mixCol(hex, '#ffffff', 0.08) : col.clone();
      const insetBase = isRoll ? colorOf('#7a6350') : col.clone().multiplyScalar(0.86);
      const emissive = colorOf(isRoll ? '#ffd27a' : hex);
      const eWall = 0.08;
      const eCap = isRoll ? 0.2 : 0.28;
      const eInset = isRoll ? 0.14 : 0.22;

      const wallMat = new THREE.MeshStandardMaterial({ color: wallBase.clone(), emissive, emissiveIntensity: eWall, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.4 });
      const capMat = new THREE.MeshPhysicalMaterial({ color: capBase.clone(), emissive, emissiveIntensity: eCap, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.4 });
      const insetMat = new THREE.MeshStandardMaterial({ color: insetBase.clone(), emissive, emissiveIntensity: eInset, roughness: 0.4, envMapIntensity: 0.4 });

      const wall = new THREE.Mesh(this.geo(`wall${sz.toFixed(3)}|${h}`, () => slabGeo(sz, h, 0.09, 0.26)), wallMat);
      const cap = new THREE.Mesh(this.geo(`cap${sz.toFixed(3)}`, () => slabGeo(sz * 0.95, 0.2, 0.07, 0.26)), capMat);
      cap.position.y = h - 0.08;
      const inset = new THREE.Mesh(this.geo(`ins${sz.toFixed(3)}`, () => slabGeo(sz * 0.7, 0.07, 0.025, 0.3)), insetMat);
      inset.position.y = h + 0.08;
      body.add(wall, cap, inset);
      const top = h + 0.16;

      const iconMat = new THREE.MeshBasicMaterial({ map: this.iconTexture(isRoll ? '🎲' : this.cats[node.cat].emoji, isRoll ? 0 : node.cat, isRoll), transparent: true, depthWrite: false });
      const es = sz * 0.74;
      const icon = new THREE.Mesh(this.geo(`icon${es.toFixed(3)}`, () => new THREE.PlaneGeometry(es, es)), iconMat);
      icon.rotation.x = -Math.PI / 2;
      icon.position.y = top + 0.012;
      group.add(icon);

      // coloured light pooling on the floor under the tile
      let glowMat = null;
      let glowBase = 0;
      if (!isRoll) {
        glowBase = isHQ ? 0.8 : 0.6;
        glowMat = new THREE.MeshBasicMaterial({ map: this.glowTexture(), color: col.clone().multiplyScalar(1.1), transparent: true, opacity: glowBase, depthWrite: false, blending: THREE.AdditiveBlending });
        const gl = new THREE.Mesh(this.geo(`glow${sz.toFixed(3)}`, () => new THREE.PlaneGeometry(sz * 2.1, sz * 2.1)), glowMat);
        gl.rotation.x = -Math.PI / 2;
        gl.position.y = 0.03;
        group.add(gl);
      }
      // glowing outline around the foot of special tiles
      if (isHQ || isRoll) {
        const lineMat = new THREE.MeshBasicMaterial({ color: colorOf(isRoll ? '#ffa32a' : '#fff0b8').multiplyScalar(1.7) });
        const line = new THREE.Mesh(this.geo(`line${sz.toFixed(3)}`, () => slabGeo(sz * 1.07, 0.08, 0.025, 0.26)), lineMat);
        line.position.y = 0.0;
        body.add(line);
      }

      for (const m of [wall, cap, inset, icon]) {
        m.userData.nodeId = node.id;
        this.pickables.push(m);
      }
      this.boardGroup.add(group);

      if (isHQ) {
        const angle = Math.min(TAU / L.n, 1.25) * 0.86;
        const wedge = new THREE.Mesh(
          this.geo(`wedge${L.n}`, () => wedgeGeo(0.22, 0.52, angle, 0.16)),
          new THREE.MeshStandardMaterial({ color: hex, emissive: col, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.25 })
        );
        wedge.position.set(node.x, top + 1.0, node.z);
        wedge.scale.setScalar(1.15);
        this.boardGroup.add(wedge);
        this.floaters.push({ mesh: wedge, y: top + 1.0, phase: node.cat * 1.3 });
      }
      return {
        node,
        group,
        mats: [
          { m: wallMat, base: wallBase, e: eWall },
          { m: capMat, base: capBase, e: eCap },
          { m: insetMat, base: insetBase, e: eInset },
        ],
        icon: iconMat,
        glow: glowMat,
        glowBase,
        top,
        size: sz,
        isChoice: false,
        hover: 0,
        k: 1,
      };
    }

    glowTexture() {
      if (!this._glow) this._glow = canvasTex(Tex.glow());
      return this._glow;
    }

    // Small pegs bridging the gaps between neighbouring spaces.
    buildPegs() {
      const L = this.layout;
      const items = [];
      for (const a of L.nodes) {
        for (const bId of a.next) {
          if (bId < a.id) continue;
          const b = L.nodes[bId];
          if (a.type === 'hub' || b.type === 'hub') continue;
          const sa = this.tiles[a.id].size;
          const sb = this.tiles[b.id].size;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dz);
          const gap = dist - (sa + sb) / 2;
          if (gap < 0.1) continue;
          items.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, len: gap + 0.16, ang: -Math.atan2(dz, dx) });
        }
      }
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: '#7c88d0', roughness: 0.4, metalness: 0.3, envMapIntensity: 0.8 }), items.length);
      const d = new THREE.Object3D();
      items.forEach((it, i) => {
        d.position.set(it.x, 0.22, it.z);
        d.rotation.set(0, it.ang, 0);
        d.scale.set(it.len, 1, 1);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.boardGroup.add(mesh);
    }

    buildHub() {
      const L = this.layout;
      const n = L.n;
      const hr = L.hubRadius;
      const g = new THREE.Group();
      const metal = new THREE.MeshPhysicalMaterial({ color: '#5d64a8', metalness: 0.6, roughness: 0.3, clearcoat: 0.7, envMapIntensity: 1.2 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(hr, hr + 0.16, 0.46, 72), metal);
      base.position.y = 0.23;
      g.add(base);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(hr - 0.08, 0.09, 10, 96), new THREE.MeshBasicMaterial({ color: colorOf('#3d9bff').multiplyScalar(2.2) }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.47;
      g.add(ring);
      const cats = this.cats;
      const cv = Tex.canvas(512);
      const ctx = cv.getContext('2d');
      const c = 256;
      ctx.fillStyle = '#0c1250';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (TAU * i) / n;
        ctx.fillStyle = cats[i].color;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, c * 0.96, a - Math.PI / n + 0.025, a + Math.PI / n - 0.025);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#0c1250';
      ctx.beginPath();
      ctx.arc(c, c, c * 0.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffd34a';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.5, 0, TAU);
      ctx.stroke();
      const tex = canvasTex(cv);
      this.owned.push(tex);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(hr - 0.12, 72), new THREE.MeshBasicMaterial({ map: tex }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.475;
      g.add(disc);

      const pts = [[0, 0], [0.42, 0], [0.42, 0.08], [0.2, 0.14], [0.1, 0.25], [0.1, 0.52], [0.22, 0.6], [0.46, 0.82], [0.56, 1.1], [0.55, 1.28], [0.48, 1.3], [0.47, 1.16], [0.38, 0.92], [0, 0.72]].map((p) => new THREE.Vector2(p[0], p[1]));
      const trophy = new THREE.Mesh(
        new THREE.LatheGeometry(pts, 28),
        new THREE.MeshStandardMaterial({ color: '#ffd34a', emissive: colorOf('#ff9d00'), emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.28, side: THREE.DoubleSide, envMapIntensity: 1.2 })
      );
      trophy.position.y = 0.48;
      trophy.scale.setScalar(0.8);
      g.add(trophy);
      this.trophy = trophy;

      for (const m of [base, disc, trophy]) {
        m.userData.nodeId = 0;
        this.pickables.push(m);
      }
      this.boardGroup.add(g);
      return { node: L.nodes[0], group: g, mats: [{ m: metal, base: colorOf('#5d64a8'), e: 0 }], icon: null, glow: null, glowBase: 0, top: 0.5, size: hr * 2, isChoice: false, hover: 0, k: 1, hub: true };
    }

    topOf(nodeId) {
      return this.tiles[nodeId] ? this.tiles[nodeId].top + 0.03 : 0.4;
    }

    setTileBrightness(tile, k) {
      if (Math.abs(tile.k - k) < 0.003) return;
      tile.k = k;
      for (const e of tile.mats) {
        e.m.color.copy(e.base).multiplyScalar(k);
        e.m.emissiveIntensity = e.e * k;
      }
      if (tile.icon) tile.icon.opacity = clamp(0.4 + 0.6 * k, 0, 1);
      if (tile.glow) tile.glow.opacity = tile.glowBase * clamp(k * 1.25 - 0.25, 0, 1.6);
    }

    // ---------- pawns ----------

    setPlayers(players) {
      for (const p of this.pawns.values()) {
        this.pawnGroup.remove(p.group);
        p.tex.dispose();
        p.group.traverse((o) => o.material && o.material.dispose && o.material.dispose());
      }
      this.pawns.clear();
      for (const pl of players) this.pawns.set(pl.id, this.makePawn(pl));
      this.layoutNode(0, true);
    }

    makePawn(pl) {
      const container = new THREE.Group();
      const hop = new THREE.Group();
      container.add(hop);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.55, 0.32, 44),
        new THREE.MeshPhysicalMaterial({ color: pl.color, emissive: colorOf(pl.color), emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.3, clearcoat: 0.6, envMapIntensity: 0.9 })
      );
      body.position.y = 0.16;
      hop.add(body);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 8;
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.1, 1.1, 1.1) }));
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.322;
      hop.add(top);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 32),
        new THREE.MeshBasicMaterial({ map: this.shadowTexture(), transparent: true, depthWrite: false, opacity: 0.75 })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      shadow.renderOrder = 2;
      container.add(shadow);

      // gold gem floating over the player whose turn it is
      const marker = new THREE.Group();
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), gemMaterial(1.3));
      gem.scale.set(1, 1.6, 1);
      gem.position.y = 1.7;
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.8, 40), new THREE.MeshBasicMaterial({ color: colorOf(pl.color).multiplyScalar(1.8), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.05;
      marker.add(gem, halo);
      marker.visible = false;
      container.add(marker);

      this.pawnGroup.add(container);
      const pawn = { id: pl.id, pl, group: container, hop, body, canvas, tex, shadow, marker, cone: gem, halo, node: 0, wedges: [], phase: Math.random() * 6, moving: false };
      this.drawPawn(pawn);
      return pawn;
    }

    shadowTexture() {
      if (!this._shadow) {
        const cv = Tex.canvas(64);
        const ctx = cv.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(0,0,0,0.85)');
        g.addColorStop(0.6, 'rgba(0,0,0,0.4)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        this._shadow = canvasTex(cv);
      }
      return this._shadow;
    }

    drawPawn(p) {
      const ctx = p.canvas.getContext('2d');
      const S = p.canvas.width;
      const c = S / 2;
      const cats = this.cats;
      const n = cats.length;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = '#080b2a';
      ctx.beginPath();
      ctx.arc(c, c, c - 2, 0, TAU);
      ctx.fill();
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (TAU * i) / n + 0.05;
        const a1 = -Math.PI / 2 + (TAU * (i + 1)) / n - 0.05;
        const earned = !!p.wedges[i];
        ctx.beginPath();
        ctx.arc(c, c, c - 8, a0, a1);
        ctx.arc(c, c, c - 54, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = earned ? cats[i].color : 'rgba(255,255,255,0.09)';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = earned ? '#ffffff' : cats[i].color + '88';
        ctx.stroke();
      }
      const grad = ctx.createRadialGradient(c, c * 0.8, 6, c, c, c - 60);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, p.pl.color);
      grad.addColorStop(1, p.pl.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, c - 62, 0, TAU);
      ctx.fill();
      ctx.font = `${Math.round(S * 0.33)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(p.pl.avatar, c, c + S * 0.02);
      p.tex.needsUpdate = true;
    }

    // flags: array of booleans per topic
    setWedges(id, flags) {
      const p = this.pawns.get(id);
      if (!p) return;
      p.wedges = flags.slice();
      this.drawPawn(p);
    }

    refreshPawns() {
      for (const p of this.pawns.values()) this.drawPawn(p);
    }

    setActive(id) {
      for (const p of this.pawns.values()) p.marker.visible = p.id === id;
    }

    setPawnNode(id, nodeId) {
      const p = this.pawns.get(id);
      if (!p) return;
      const old = p.node;
      p.node = nodeId;
      this.layoutNode(old, true);
      this.layoutNode(nodeId, true);
    }

    // Spread out the pawns sharing a space.
    layoutNode(nodeId, instant) {
      const here = [...this.pawns.values()].filter((p) => p.node === nodeId && !p.moving);
      const all = [...this.pawns.values()].filter((p) => p.node === nodeId);
      if (!this.layout || !here.length) return;
      const node = this.layout.nodes[nodeId];
      const offs = slotOffsets(all.length, nodeId === 0 ? 1.0 : 0.52);
      const sc = all.length > 1 ? 0.8 : 1;
      const y = this.topOf(nodeId);
      all.forEach((p, i) => {
        if (p.moving) return;
        const tx = node.x + offs[i][0];
        const tz = node.z + offs[i][1];
        if (instant) {
          p.group.position.set(tx, y, tz);
          p.group.scale.setScalar(sc);
        } else {
          const a = p.group.position.clone();
          const s0 = p.group.scale.x;
          this.tween(240, (e) => {
            p.group.position.set(lerp(a.x, tx, e), lerp(a.y, y, e), lerp(a.z, tz, e));
            p.group.scale.setScalar(lerp(s0, sc, e));
          }, easeOut);
        }
      });
    }

    async movePawn(id, path) {
      const p = this.pawns.get(id);
      if (!p) return;
      const from = p.node;
      p.moving = true;
      p.group.scale.setScalar(1);
      for (let i = 0; i < path.length; i++) {
        // Crossing the hub is one long hop over the trophy, not a landing on it.
        const over = this.layout.nodes[path[i]].type === 'hub' && i < path.length - 1;
        const stop = over ? i + 1 : i;
        const node = this.layout.nodes[path[stop]];
        const a = p.group.position.clone();
        const by = this.topOf(path[stop]);
        const peak = over ? 2.4 : 0.95;
        let rippled = !over;
        if (this.hooks.onHop) this.hooks.onHop(i, path.length);
        await this.tween(over ? 560 : i === 0 ? 300 : 240, (e, k) => {
          p.group.position.set(lerp(a.x, node.x, e), lerp(a.y, by, e), lerp(a.z, node.z, e));
          p.hop.position.y = Math.sin(Math.PI * k) * peak;
          const s = 1 - Math.sin(Math.PI * k) * 0.35;
          p.shadow.scale.setScalar(s);
          if (!rippled && k >= 0.5) {
            rippled = true;
            this.ripple(path[i], p.pl.color, 0.5);
          }
        }, easeInOut);
        i = stop;
        p.hop.position.y = 0;
        p.shadow.scale.setScalar(1);
        this.ripple(path[i], p.pl.color, 0.5);
        this.tween(200, (e) => {
          p.hop.scale.set(1 + (1 - e) * 0.18, 1 - (1 - e) * 0.28, 1 + (1 - e) * 0.18);
        }, easeOutBack);
      }
      p.node = path[path.length - 1];
      p.moving = false;
      this.layoutNode(from, false);
      this.layoutNode(p.node, false);
    }

    celebratePawn(id) {
      const p = this.pawns.get(id);
      if (!p) return Promise.resolve();
      p.celebrating = true;
      return this.tween(620, (e, k) => {
        p.hop.position.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.7 * (1 - k);
        p.hop.rotation.y = k * TAU * 2;
      }, (t) => t).then(() => {
        p.hop.rotation.y = 0;
        p.hop.position.y = 0;
        p.celebrating = false;
      });
    }

    // ---------- choices ----------

    // choices: Map of node id -> path
    showChoices(map) {
      this.clearChoices();
      this.choices = map;
      for (const nid of map.keys()) {
        const tile = this.tiles[nid];
        if (!tile) continue;
        tile.isChoice = true;
        const node = this.layout.nodes[nid];
        const r = tile.size * 0.5;
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.1, r * 1.34, 48),
          new THREE.MeshBasicMaterial({ color: colorOf('#ffffff').multiplyScalar(1.7), transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(node.x, tile.top + 0.07, node.z);
        const arrow = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), gemMaterial(1.3));
        arrow.scale.set(1, 1.6, 1);
        arrow.position.set(node.x, tile.top + 1.5, node.z);
        this.fxGroup.add(halo, arrow);
        this.choiceMeshes.push({ halo, arrow, y: tile.top + 1.5, phase: nid * 0.7 });
      }
      this.dimTarget = 1;
    }

    clearChoices() {
      for (const c of this.choiceMeshes) {
        this.fxGroup.remove(c.halo, c.arrow);
        c.halo.geometry.dispose();
        c.halo.material.dispose();
        c.arrow.geometry.dispose();
        c.arrow.material.dispose();
      }
      this.choiceMeshes = [];
      for (const t of this.tiles) if (t) t.isChoice = false;
      this.choices = null;
      this.dimTarget = 0;
      this.hidePath();
    }

    showPath(nodeId) {
      this.hidePath();
      const path = this.choices && this.choices.get(nodeId);
      if (!path) return;
      this.pathDots = [];
      path.slice(0, -1).forEach((nid) => {
        const n = this.layout.nodes[nid];
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshBasicMaterial({ color: colorOf(GOLD).multiplyScalar(1.7) }));
        // A dot on the hub would hide inside the trophy: float it above, where the pawn will fly.
        d.position.set(n.x, nid === this.layout.hub ? 2.1 : this.topOf(nid) + 0.25, n.z);
        this.fxGroup.add(d);
        this.pathDots.push(d);
      });
    }

    // Keyboard play: highlight one of the glowing spaces like a hover would.
    focusChoice(nodeId) {
      this.hoverId = nodeId;
      this.showPath(nodeId);
    }

    hidePath() {
      if (!this.pathDots) return;
      for (const d of this.pathDots) {
        this.fxGroup.remove(d);
        d.geometry.dispose();
        d.material.dispose();
      }
      this.pathDots = null;
    }

    // ---------- effects ----------

    ripple(nodeId, hex, power) {
      const node = this.layout && this.layout.nodes[nodeId];
      if (!node) return;
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.55, 40),
        new THREE.MeshBasicMaterial({ color: colorOf(hex).multiplyScalar(1.7), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(node.x, this.topOf(nodeId) + 0.06, node.z);
      this.fxGroup.add(m);
      this.ripples.push({ m, t: 0, life: 0.7, power: power || 1 });
    }

    burst(nodeId, hex, count, power) {
      const node = this.layout && this.layout.nodes[nodeId];
      if (!node) return;
      const col = colorOf(hex).multiplyScalar(1.6);
      const white = colorOf('#ffffff').multiplyScalar(1.6);
      for (let i = 0; i < (count || 60); i++) {
        const a = Math.random() * TAU;
        const sp = (2 + Math.random() * 5) * (power || 1);
        const c = Math.random() < 0.3 ? white : col;
        this.spawn(node.x, this.topOf(nodeId) + 0.4, node.z, Math.cos(a) * sp, 3 + Math.random() * 5 * (power || 1), Math.sin(a) * sp, c, 0.9 + Math.random() * 0.7, 9);
      }
    }

    confetti(ms) {
      this.confettiUntil = this.time + (ms || 3500) / 1000;
    }

    spawn(x, y, z, vx, vy, vz, color, life, grav) {
      const n = this.bN;
      for (let k = 0; k < n; k++) {
        const i = (this.bCursor + k) % n;
        if (this.bLife[i] <= 0) {
          this.bCursor = (i + 1) % n;
          this.bPos[i * 3] = x;
          this.bPos[i * 3 + 1] = y;
          this.bPos[i * 3 + 2] = z;
          this.bVel[i * 3] = vx;
          this.bVel[i * 3 + 1] = vy;
          this.bVel[i * 3 + 2] = vz;
          this.bBase[i * 3] = color.r;
          this.bBase[i * 3 + 1] = color.g;
          this.bBase[i * 3 + 2] = color.b;
          this.bLife[i] = life;
          this.bMax[i] = life;
          this.bGrav[i] = grav;
          return;
        }
      }
    }

    // ---------- tweens ----------

    tween(ms, fn, ease) {
      return new Promise((resolve) => this.tweens.push({ t: 0, ms, fn, ease: ease || easeInOut, resolve }));
    }

    runTweens(dt) {
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        tw.t += dt * 1000;
        const k = Math.min(1, tw.t / tw.ms);
        tw.fn(tw.ease(k), k);
        if (k >= 1) {
          this.tweens.splice(i, 1);
          tw.resolve();
        }
      }
    }

    // ---------- picking and camera input ----------

    pickNode(cx, cy) {
      const r = this.canvas.getBoundingClientRect();
      this._ndc = this._ndc || new THREE.Vector2();
      this._ray = this._ray || new THREE.Raycaster();
      this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      this._ray.setFromCamera(this._ndc, this.camera);
      const hit = this._ray.intersectObjects(this.pickables, false)[0];
      return hit ? hit.object.userData.nodeId : -1;
    }

    // Fingers are fat: accept a tap that lands close to a highlighted space.
    nearestChoice(cx, cy, maxPx) {
      if (!this.choices) return -1;
      const r = this.canvas.getBoundingClientRect();
      const v = this._v || (this._v = new THREE.Vector3());
      let best = -1;
      let bd = maxPx;
      for (const id of this.choices.keys()) {
        const n = this.layout.nodes[id];
        v.set(n.x, this.topOf(id), n.z).project(this.camera);
        const d = Math.hypot(r.left + (v.x * 0.5 + 0.5) * r.width - cx, r.top + (-v.y * 0.5 + 0.5) * r.height - cy);
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      return best;
    }

    bindPointer() {
      const cv = this.canvas;
      const ptrs = new Map();
      let drag = null;
      let pinch = null;
      cv.addEventListener('pointerdown', (e) => {
        try {
          cv.setPointerCapture(e.pointerId);
        } catch (err) {
          /* ignore */
        }
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 1) drag = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, t: performance.now() };
        else if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: this.camT.zoom };
          if (drag) drag.moved = true;
        }
      });
      cv.addEventListener('pointermove', (e) => {
        const pt = ptrs.get(e.pointerId);
        if (!pt) {
          this.hoverAt(e.clientX, e.clientY);
          return;
        }
        pt.x = e.clientX;
        pt.y = e.clientY;
        if (ptrs.size === 2 && pinch) {
          const [a, b] = [...ptrs.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          this.camT.zoom = clamp(pinch.z * (pinch.d / d), 0.55, 1.6);
        } else if (drag) {
          const dx = e.clientX - drag.lx;
          const dy = e.clientY - drag.ly;
          drag.lx = e.clientX;
          drag.ly = e.clientY;
          if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
          if (drag.moved) {
            this.userDragging = true;
            this.camT.yaw -= dx * 0.005;
            this.camT.tilt = clamp(this.camT.tilt - dy * 0.003, 0.25, 1.22);
          }
        }
      });
      const end = (e) => {
        const had = ptrs.has(e.pointerId);
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinch = null;
        if (had && drag && ptrs.size === 0) {
          if (!drag.moved && performance.now() - drag.t < 700 && e.type === 'pointerup') {
            let id = this.pickNode(e.clientX, e.clientY);
            if (this.choices && !this.choices.has(id)) {
              const near = this.nearestChoice(e.clientX, e.clientY, 36);
              if (near >= 0) id = near;
            }
            if (id >= 0 && this.hooks.onPick) this.hooks.onPick(id);
          }
          drag = null;
          this.userDragging = false;
        }
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('pointerleave', () => this.hoverAt(-1, -1));
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.camT.zoom = clamp(this.camT.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 1.6);
      }, { passive: false });
      cv.addEventListener('dblclick', () => this.resetView());
    }

    hoverAt(cx, cy) {
      const id = cx < 0 ? -1 : this.pickNode(cx, cy);
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.canvas.style.cursor = this.choices && this.choices.has(id) ? 'pointer' : id >= 0 ? 'help' : 'grab';
        if (this.choices && this.choices.has(id)) this.showPath(id);
        else this.hidePath();
      }
      if (this.hooks.onHover) this.hooks.onHover(id, cx, cy);
    }

    // ---------- frame ----------

    tick(dt) {
      this.time += dt;
      const t = this.time;
      this.runTweens(dt);
      this.updateCamera(dt);
      if (this.scenery) this.scenery.update(t);

      // dim everything but the choices while a destination is being picked
      this.dimK += (this.dimTarget - this.dimK) * (1 - Math.pow(0.001, dt));
      for (const tile of this.tiles) {
        if (!tile) continue;
        tile.hover += ((tile.node.id === this.hoverId ? 1 : 0) - tile.hover) * (1 - Math.pow(0.0005, dt));
        const dim = tile.isChoice ? 0 : this.dimK;
        this.setTileBrightness(tile, 1 - 0.58 * dim + tile.hover * 0.28);
      }
      for (const c of this.choiceMeshes) {
        const s = 1 + Math.sin(t * 6 + c.phase) * 0.07;
        c.halo.scale.set(s, s, s);
        c.halo.material.opacity = 0.65 + Math.sin(t * 6 + c.phase) * 0.3;
        c.arrow.position.y = c.y + Math.sin(t * 5 + c.phase) * 0.15;
        c.arrow.rotation.y = t * 2.2;
      }
      for (const f of this.floaters) {
        f.mesh.position.y = f.y + Math.sin(t * 1.6 + f.phase) * 0.12;
        f.mesh.rotation.y = t * 0.9 + f.phase;
      }
      if (this.trophy) this.trophy.rotation.y = t * 0.7;

      for (const p of this.pawns.values()) {
        if (!p.moving && !p.celebrating) p.hop.position.y = p.marker.visible ? 0.05 + Math.sin(t * 3 + p.phase) * 0.05 : 0;
        if (p.marker.visible) {
          p.cone.position.y = 1.65 + Math.sin(t * 4) * 0.14;
          p.cone.rotation.y = t * 2.2;
          const s = 1 + Math.sin(t * 5) * 0.08;
          p.halo.scale.set(s, s, s);
        }
      }

      // dust
      if (!this.reduced) {
        const pos = this.dust.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.array[i * 3 + 1] + this.dustSpeed[i] * dt;
          if (y > 14) y = 0.3;
          pos.array[i * 3 + 1] = y;
        }
        pos.needsUpdate = true;
      }

      // confetti spray
      if (this.confettiUntil && t < this.confettiUntil) {
        const pal = ['#ff3d9a', '#12e3ff', '#ffd21f', '#a35bff', '#9dff2e', '#ff7a1a'];
        for (let k = 0; k < 4; k++) {
          const R = this.fitR;
          this.spawn((Math.random() - 0.5) * R * 1.8, 9 + Math.random() * 3, (Math.random() - 0.5) * R * 1.4, (Math.random() - 0.5) * 2, -1 - Math.random() * 3, (Math.random() - 0.5) * 2, colorOf(pal[(Math.random() * pal.length) | 0]).multiplyScalar(1.4), 2.2 + Math.random(), 2.5);
        }
      }

      // particles
      const cArr = this.bursts.geometry.attributes.color;
      const pArr = this.bursts.geometry.attributes.position;
      for (let i = 0; i < this.bN; i++) {
        if (this.bLife[i] <= 0) continue;
        this.bLife[i] -= dt;
        if (this.bLife[i] <= 0) {
          this.bPos[i * 3 + 1] = -200;
          this.bCol[i * 3] = this.bCol[i * 3 + 1] = this.bCol[i * 3 + 2] = 0;
          continue;
        }
        this.bVel[i * 3 + 1] -= this.bGrav[i] * dt;
        this.bPos[i * 3] += this.bVel[i * 3] * dt;
        this.bPos[i * 3 + 1] += this.bVel[i * 3 + 1] * dt;
        this.bPos[i * 3 + 2] += this.bVel[i * 3 + 2] * dt;
        const f = Math.min(1, (this.bLife[i] / this.bMax[i]) * 1.6);
        this.bCol[i * 3] = this.bBase[i * 3] * f;
        this.bCol[i * 3 + 1] = this.bBase[i * 3 + 1] * f;
        this.bCol[i * 3 + 2] = this.bBase[i * 3 + 2] * f;
      }
      cArr.needsUpdate = true;
      pArr.needsUpdate = true;

      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.t += dt;
        const k = r.t / r.life;
        if (k >= 1) {
          this.fxGroup.remove(r.m);
          r.m.geometry.dispose();
          r.m.material.dispose();
          this.ripples.splice(i, 1);
          continue;
        }
        const s = 1 + easeOut(k) * 2.4 * r.power;
        r.m.scale.set(s, s, s);
        r.m.material.opacity = 0.9 * (1 - k);
      }

      if (this.glow) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
    }
  }

  root.WQScene = { BoardScene };
})(typeof window !== 'undefined' ? window : globalThis);
