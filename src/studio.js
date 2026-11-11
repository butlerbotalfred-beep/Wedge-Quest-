// The link to the home server (Wedge Quest Studio edition only).
//
// The page is served by the server, so everything is a same-origin request:
//   GET  /api/status   what the server can do: Claude questions, the studio voice
//   POST /api/ask      Claude writes questions; the API key stays on the server
// `sample` has the same shape as the Claude runtime's `sample`, so the Quizmaster
// uses it unchanged.
(function (root) {
  'use strict';

  function create(deps) {
    const call = (...args) => (deps.fetch || root.fetch).apply(root, args);
    const subs = new Set();
    let st = { online: false, status: null };
    let timer = 0;

    function set(next) {
      st = next;
      subs.forEach((f) => f(st));
    }

    function schedule(ms) {
      clearTimeout(timer);
      if (ms === undefined) {
        const tts = st.status && st.status.tts;
        if (!st.online) ms = 10000;
        else if (tts && (tts.state === 'downloading' || tts.state === 'loading')) ms = 1500;
        else ms = 30000;
      }
      timer = setTimeout(refresh, ms);
      if (timer && timer.unref) timer.unref();
    }

    async function refresh() {
      try {
        const r = await call('/api/status', { cache: 'no-store' });
        const s = r.ok ? await r.json() : null;
        if (!s || s.app !== 'wedge-quest-studio') throw new Error('not a Wedge Quest Studio server');
        set({ online: true, status: s });
      } catch (e) {
        set({ online: false, status: st.status });
      }
      schedule();
      return st;
    }

    // Claude has been asked for questions: stream the reply as it is written.
    async function sample(prompt, o) {
      o = o || {};
      let resp;
      try {
        resp = await call('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, tier: o.modelTier === 'quick' ? 'quick' : 'default' }),
          signal: o.signal,
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'cancelled' };
        throw { code: 'network', message: 'Could not reach the home server.' };
      }
      if (!resp.ok) {
        let body = {};
        try {
          body = await resp.json();
        } catch (e) {
          /* not JSON */
        }
        throw { code: body.code || 'server_error', message: body.msg || `The home server answered ${resp.status}.` };
      }

      let text = '';
      let truncated = false;
      let failure = null;
      const handle = (line) => {
        let ev;
        try {
          ev = JSON.parse(line);
        } catch (e) {
          return;
        }
        if (ev.t === 'd' && typeof ev.x === 'string') {
          text += ev.x;
          if (o.onText) o.onText({ text, delta: ev.x });
        } else if (ev.t === 'end') truncated = ev.stop === 'max_tokens';
        else if (ev.t === 'err') failure = { code: ev.code || 'error', message: ev.msg || 'Claude could not write the questions.' };
      };

      try {
        if (resp.body && typeof resp.body.getReader === 'function') {
          const reader = resp.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (line) handle(line);
            }
          }
          buf += dec.decode();
          if (buf.trim()) handle(buf.trim());
        } else {
          (await resp.text()).split('\n').forEach((line) => line.trim() && handle(line.trim()));
        }
      } catch (e) {
        if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'cancelled', text };
        throw { code: 'network', message: 'The connection to the home server dropped.', text };
      }
      if (failure) throw Object.assign(failure, { text });
      return { text, truncated };
    }

    return {
      ready: null, // set below
      refresh,
      sample,
      state: () => st,
      onChange(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
      },
      // A request failed: treat the server as away until the next successful check.
      markDown() {
        set({ online: false, status: st.status });
        schedule(5000);
      },
      stop() {
        clearTimeout(timer);
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  else {
    const api = create({});
    api.ready = api.refresh();
    root.WQStudio = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
