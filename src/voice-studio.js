// The studio voice (Wedge Quest Studio edition only).
//
// Speech is made by a voice model on the home server and arrives as short WAV
// clips. Each clip is decoded and placed on the audio clock one after another,
// so the pauses between question, choices and answers are exact and playback
// never stutters while the next clip is still being made. Plugs into WQVoice as
// an engine; when the server cannot speak the browser's own voice steps in.
(function (root) {
  'use strict';

  const SPEED = { slow: 0.88, normal: 1.0, fast: 1.15 };
  const CACHE_MAX = 24;

  function decode(ctx, data) {
    return new Promise((resolve, reject) => {
      try {
        // older Safari only has the callback form
        const p = ctx.decodeAudioData(data, resolve, reject);
        if (p && typeof p.catch === 'function') p.catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  // deps: { fetch, context() -> AudioContext, tts() -> the server's voice status or null, down() }
  function create(deps) {
    const call = (...args) => (deps.fetch || root.fetch).apply(root, args);
    const cache = new Map(); // key -> Promise<AudioBuffer>, oldest first
    let session = 0; // bumps on stop: running playbacks give up
    let chain = 0; // bumps on stop: background fetching of the rest of a clip list stops
    let sources = [];
    let out = null;
    let outCtx = null;

    const status = () => deps.tts() || null;
    const isReady = () => {
      const t = status();
      return !!(t && t.state === 'ready' && t.voices && t.voices.length);
    };

    function voices() {
      const t = status();
      if (!isReady()) return [];
      return t.voices.map((v, i) => ({
        uri: 'studio:' + v.id,
        id: v.id,
        name: v.label || v.name,
        lang: v.lang,
        score: v.id === t.default ? 150 : 140 - i,
      }));
    }

    function note(isCurrent) {
      const t = status();
      if (!t) return '';
      if (t.state === 'downloading') return `The studio voice is downloading on the home server (${Math.round((t.progress || 0) * 100)}%). Until it is ready this device's own voice is used.`;
      if (t.state === 'loading') return "The studio voice is starting up on the home server. Until it is ready this device's own voice is used.";
      if (t.state === 'error') return "The studio voice could not start on the home server, so this device's own voice is used.";
      if (t.state === 'ready' && isCurrent) return 'Using the studio voice on your home server.';
      return '';
    }

    // One clip, from the cache if we already have it (or are already fetching it).
    function clip(text, o) {
      const speed = SPEED[o.speed] || 1;
      const key = `${o.voice.id}|${speed}|${text}`;
      let p = cache.get(key);
      if (p) {
        cache.delete(key); // most recently used goes last
        cache.set(key, p);
        return p;
      }
      const ctx = deps.context();
      if (!ctx) return Promise.reject(new Error('no audio output'));
      p = call('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: o.voice.id, speed }),
      })
        .then((r) => {
          if (!r.ok) throw new Error('voice answered ' + r.status);
          return r.arrayBuffer();
        })
        .then((data) => decode(ctx, data));
      cache.set(key, p);
      p.catch(() => {
        if (cache.get(key) === p) cache.delete(key);
      });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return p;
    }

    // Fetch the clips of a queue one after another, in order, so the server never
    // works on a later clip before an earlier one is done.
    function fetchAhead(queue, o) {
      const id = ++chain;
      const texts = queue.filter((x) => typeof x === 'string');
      let i = 0;
      const next = () => {
        if (id !== chain || i >= texts.length) return;
        clip(texts[i++], o).then(next, next);
      };
      next();
    }

    function stop() {
      session++;
      chain++;
      const old = sources;
      sources = [];
      old.forEach((s) => {
        try {
          s.onended = null;
          s.stop();
        } catch (e) {
          /* already finished */
        }
      });
    }

    function output(ctx) {
      if (!out || outCtx !== ctx) {
        out = ctx.createGain();
        out.gain.value = 1;
        out.connect(ctx.destination);
        outCtx = ctx;
      }
      return out;
    }

    // Resolve once the audio clock has reached `t` (or playback was stopped).
    function until(ctx, t, mine) {
      return new Promise((resolve) => {
        const give = Date.now() + Math.max(0, t - ctx.currentTime) * 1000 + 4000; // a paused page must not hang us
        const tick = () => {
          const left = t - ctx.currentTime;
          if (mine !== session || left <= 0.02 || Date.now() > give) return resolve();
          setTimeout(tick, Math.min(250, left * 1000 + 15));
        };
        tick();
      });
    }

    // queue: cleaned strings and pauses in milliseconds. Rejects only if nothing could be played.
    async function say(queue, o) {
      const ctx = deps.context(); // made inside the tap that asked for speech, before any waiting
      if (!ctx) throw new Error('no audio output');
      const mine = ++session;
      fetchAhead(queue, o);
      let t = 0;
      let played = false;
      for (const item of queue) {
        if (mine !== session) return;
        if (typeof item === 'number') {
          t += item / 1000;
          continue;
        }
        let buf;
        try {
          buf = await clip(item, o);
        } catch (e) {
          if (!played) {
            if (deps.down) deps.down();
            throw e;
          }
          continue; // a later clip failed: skip it rather than stop mid-question
        }
        if (mine !== session) return;
        const start = Math.max(t, ctx.currentTime + (played ? 0.005 : 0.04));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(output(ctx));
        src.onended = () => {
          sources = sources.filter((s) => s !== src);
        };
        src.start(start);
        sources.push(src);
        t = start + buf.duration;
        played = true;
      }
      if (played) await until(ctx, t, mine);
    }

    function prefetch(queue, o) {
      fetchAhead(queue, o);
    }

    return { voices, say, stop, prefetch, note, _cache: cache };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { create, SPEED };
  else if (root.WQVoice && root.WQStudio) {
    const S = root.WQStudio;
    const engine = create({
      context: () => (root.WQSfx && root.WQSfx.context ? root.WQSfx.context() : null),
      tts: () => {
        const st = S.state();
        return st.online && st.status ? st.status.tts : null;
      },
      down: () => S.markDown(),
    });
    root.WQVoice.addEngine(engine);
    S.onChange(() => root.WQVoice.notify());
  }
})(typeof window !== 'undefined' ? window : globalThis);
