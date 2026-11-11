// Canvas-drawn textures for the 3D board: embossed tile icons, the floor, soft glows.
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

  const canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h || w;
    return c;
  };

  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  // A pressed-in medallion with a duotone, embossed copy of the emoji on it.
  // The emoji keeps its inner detail (eyes, windows) as light and dark steps of
  // a single tint, so every topic reads as part of the same candy set.
  function tileIcon(emoji, tint, opts) {
    opts = opts || {};
    const S = 256;
    const out = canvas(S);
    const ctx = out.getContext('2d');
    const c = S / 2;
    const R = S * 0.45;

    // medallion
    ctx.save();
    ctx.shadowColor = 'rgba(10,8,50,0.4)';
    ctx.shadowBlur = S * 0.05;
    ctx.shadowOffsetY = S * 0.03;
    const g = ctx.createLinearGradient(0, c - R, 0, c + R);
    g.addColorStop(0, opts.coinTop || 'rgba(255,255,255,0.22)');
    g.addColorStop(1, opts.coinBottom || 'rgba(10,10,60,0.28)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = S * 0.022;
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.arc(c, c, R - S * 0.012, 0, TAU);
    ctx.stroke();

    // emoji, then recolor by brightness
    const src = canvas(S);
    const sctx = src.getContext('2d');
    sctx.font = `${Math.round(S * 0.5)}px ${EMOJI_FONT}`;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText(emoji, c, c + S * 0.035);
    if (opts.natural) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = S * 0.03;
      ctx.shadowOffsetY = S * 0.025;
      ctx.drawImage(src, 0, 0);
      ctx.restore();
      return out;
    }
    const img = sctx.getImageData(0, 0, S, S);
    const d = img.data;
    const dark = hex(opts.dark || '#2a2060');
    const light = hex(opts.light || tint);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const t = Math.min(1, Math.max(0, 0.08 + l * 1.05));
      d[i] = dark[0] + (light[0] - dark[0]) * t;
      d[i + 1] = dark[1] + (light[1] - dark[1]) * t;
      d[i + 2] = dark[2] + (light[2] - dark[2]) * t;
    }
    sctx.putImageData(img, 0, 0);

    // light edge up-left, then the icon with a soft drop shadow
    const sil = canvas(S);
    const ictx = sil.getContext('2d');
    ictx.drawImage(src, 0, 0);
    ictx.globalCompositeOperation = 'source-in';
    ictx.fillStyle = '#ffffff';
    ictx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(sil, -S * 0.007, -S * 0.012);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(10,6,50,0.5)';
    ctx.shadowBlur = S * 0.025;
    ctx.shadowOffsetY = S * 0.022;
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    return out;
  }

  // The dark glossy floor: soft vignette, polar paving, a few stars.
  function floor(radius, spokes) {
    const S = 1024;
    const cv = canvas(S);
    const ctx = cv.getContext('2d');
    const c = S / 2;
    const s = c / radius;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, '#1a2270');
    g.addColorStop(0.55, '#0f1650');
    g.addColorStop(1, '#0a0f3e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // polar paving
    ctx.strokeStyle = 'rgba(120,140,255,0.11)';
    ctx.lineWidth = 2;
    const rings = 9;
    for (let k = 1; k <= rings; k++) {
      ctx.beginPath();
      ctx.arc(c, c, (c * k) / rings, 0, TAU);
      ctx.stroke();
    }
    const n = spokes * 6;
    for (let i = 0; i < n; i++) {
      const a = (TAU * i) / n;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * c * 0.1, c + Math.sin(a) * c * 0.1);
      ctx.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      ctx.stroke();
    }
    // lighter streaks, like reflections on glass
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const streak = ctx.createLinearGradient(0, 0, S, S);
    streak.addColorStop(0.3, 'rgba(120,150,255,0)');
    streak.addColorStop(0.45, 'rgba(120,150,255,0.07)');
    streak.addColorStop(0.55, 'rgba(120,150,255,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    // stars
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * TAU;
      const r = Math.sqrt(rnd()) * c * 0.98;
      const size = 1 + rnd() * 2.2;
      ctx.fillStyle = `rgba(190,210,255,${0.25 + rnd() * 0.5})`;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, size, 0, TAU);
      ctx.fill();
    }
    return cv;
  }

  // Soft rounded glow that pools coloured light under a tile.
  function glow() {
    const S = 128;
    const cv = canvas(S);
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return cv;
  }

  function dot() {
    const S = 64;
    const cv = canvas(S);
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return cv;
  }

  root.WQTex = { tileIcon, floor, glow, dot, canvas, hex, EMOJI_FONT };
})(typeof window !== 'undefined' ? window : globalThis);
