// Small synthesized sound effects (no audio files). Starts on the first tap.
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;

  // The audio context, made on first use. Sound effects respect the mute switch;
  // the voice does not, so it asks for the context directly.
  function make() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) {
        ctx = null;
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function ensure() {
    return muted ? null : make();
  }

  function tone(f, t0, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const peak = o.gain || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise(t0, dur, o) {
    o = o || {};
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = o.freq || 1800;
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const SOUNDS = {
    click: (t) => tone(680, t, 0.06, { type: 'triangle', gain: 0.12 }),
    pop: (t) => tone(420, t, 0.12, { type: 'sine', gain: 0.18, to: 760 }),
    roll: (t) => {
      for (let i = 0; i < 9; i++) noise(t + i * 0.115 + Math.random() * 0.03, 0.06, { gain: 0.2, freq: 900 + Math.random() * 1900, q: 2 });
    },
    land: (t) => {
      tone(190, t, 0.2, { gain: 0.32, to: 90 });
      noise(t, 0.08, { gain: 0.12, freq: 600 });
    },
    hop: (t, i) => tone(420 + (i || 0) * 50, t, 0.11, { type: 'square', gain: 0.06, to: 650 + (i || 0) * 50 }),
    turn: (t) => {
      tone(494, t, 0.09, { type: 'triangle', gain: 0.14 });
      tone(740, t + 0.09, 0.14, { type: 'triangle', gain: 0.14 });
    },
    correct: (t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.085, 0.24, { type: 'triangle', gain: 0.2 })),
    wrong: (t) => {
      tone(220, t, 0.3, { type: 'sawtooth', gain: 0.12, to: 110 });
      tone(165, t + 0.13, 0.34, { type: 'sawtooth', gain: 0.11, to: 82 });
    },
    levelup: (t) => [392, 523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(f, t + i * 0.06, 0.18, { type: 'square', gain: 0.07 })),
    wedge: (t) => {
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => tone(f, t + i * 0.07, 0.4, { type: 'triangle', gain: 0.17 }));
      tone(261.6, t, 0.9, { gain: 0.16 });
    },
    win: (t) => {
      const notes = [523.25, 523.25, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.5];
      const times = [0, 0.14, 0.28, 0.42, 0.7, 0.98, 1.12, 1.4];
      notes.forEach((f, i) => tone(f, t + times[i], i === 7 ? 0.9 : 0.24, { type: 'triangle', gain: 0.2 }));
      [261.6, 329.6, 392].forEach((f) => tone(f, t + 1.4, 1, { gain: 0.1 }));
    },
  };

  root.WQSfx = {
    unlock: make, // a tap unlocks audio for the voice too, even when effects are switched off
    context: make,
    play(name, arg) {
      const c = ensure();
      if (!c || !SOUNDS[name]) return;
      try {
        SOUNDS[name](c.currentTime + 0.01, arg);
      } catch (e) {
        /* ignore audio errors */
      }
    },
    setMuted(m) {
      muted = !!m;
    },
    isMuted: () => muted,
  };
})(typeof window !== 'undefined' ? window : globalThis);
