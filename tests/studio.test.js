// Home-server edition: the bridge to the server, the studio voice engine, and how
// they plug into the Quizmaster and the voice. Everything runs against fakes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// A browser with speech synthesis, set up before voice.js is loaded.
const spoken = [];
globalThis.SpeechSynthesisUtterance = function (text) {
  this.text = text;
};
globalThis.speechSynthesis = {
  getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'Samantha' }],
  speak(u) {
    spoken.push(u.text);
    setTimeout(() => u.onend && u.onend(), 1);
  },
  cancel() {},
  resume() {},
  addEventListener() {},
};

const Studio = require('../src/studio.js');
const VoiceStudio = require('../src/voice-studio.js');
const Q = require('../src/questions.js');
require('../src/voice.js');
const V = globalThis.WQVoice;

let checks = 0;
const eq = (a, b, m) => { checks++; assert.deepStrictEqual(a, b, m); };
const ok = (c, m) => { checks++; assert.ok(c, m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, m) => { checks++; assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`); };

const STATUS = (over) => Object.assign({
  app: 'wedge-quest-studio', version: '1.0.0',
  ai: { enabled: true, model: 'claude-opus-5-5', reason: null },
  tts: { engine: 'kokoro', state: 'ready', progress: 1, default: 'af_heart', voices: [
    { id: 'af_heart', name: 'Heart', lang: 'en-US', label: 'Heart · American, female' },
    { id: 'bf_emma', name: 'Emma', lang: 'en-GB', label: 'Emma · British, female' },
  ] },
}, over);

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// An NDJSON reply cut into awkward pieces (including inside a multi-byte character).
function ndjsonReply(events, cut = 7) {
  const bytes = new TextEncoder().encode(events.map((e) => JSON.stringify(e) + '\n').join(''));
  const stream = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += cut) c.enqueue(bytes.slice(i, i + cut));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const LINE = (t, q) => JSON.stringify({ t, q, a: 'Mars', w: ['Venus', 'Jupiter', 'Saturn'], f: 'Red because of iron "rust" ✨ é' });

(async () => {
  // ---------- the bridge: status ----------
  {
    const calls = [];
    const s = Studio.create({ fetch: async (url, o) => { calls.push([url, o]); return json(STATUS()); } });
    const st = await s.refresh();
    eq([st.online, st.status.ai.model], [true, 'claude-opus-5-5']);
    eq(calls[0][0], '/api/status');
    s.stop();

    const other = Studio.create({ fetch: async () => json({ app: 'something-else' }) });
    eq((await other.refresh()).online, false, 'a different server is not ours');
    const html = Studio.create({ fetch: async () => new Response('<html>nope</html>', { status: 200 }) });
    eq((await html.refresh()).online, false, 'a page that is not JSON is not ours');
    const down = Studio.create({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
    eq((await down.refresh()).online, false);
    [other, html, down].forEach((x) => x.stop());

    let n = 0;
    const flaky = Studio.create({ fetch: async () => (n++ === 0 ? json(STATUS()) : (() => { throw new TypeError('x'); })()) });
    await flaky.refresh();
    const seen = [];
    flaky.onChange((x) => seen.push(x.online));
    await flaky.refresh();
    eq(seen, [false]);
    eq(flaky.state().status.app, 'wedge-quest-studio', 'the last good status is kept for reference');
    flaky.markDown();
    flaky.stop();
  }

  // ---------- the bridge: streaming questions ----------
  {
    let sent;
    const events = [{ t: 'd', x: LINE('c0', 'Which planet is known as the Red Planet?') + '\n' }, { t: 'd', x: LINE('c1', 'Café question ✨?') + '\n' }, { t: 'end', stop: 'end_turn', in: 100, out: 50 }];
    const s = Studio.create({ fetch: async (url, o) => { sent = [url, o]; return ndjsonReply(events, 5); } });
    const seen = [];
    const res = await s.sample('PROMPT TEXT', { modelTier: 'quick', cache: false, onText: (u) => seen.push(u) });
    eq(sent[0], '/api/ask');
    eq(sent[1].method, 'POST');
    eq(JSON.parse(sent[1].body), { prompt: 'PROMPT TEXT', tier: 'quick' });
    eq(res.truncated, false);
    ok(res.text.endsWith('\n') && res.text.split('\n').filter(Boolean).length === 2, 'both lines arrived');
    ok(seen.length === 2 && seen[1].text === res.text && seen[1].text.startsWith(seen[0].text), 'onText carries the whole text so far');
    eq(seen[0].delta, events[0].x);
    ok(res.text.includes('✨ é'), 'multi-byte characters survive being cut in pieces');
    await s.sample('P', { modelTier: 'default' });
    eq(JSON.parse(sent[1].body).tier, 'default');
    await s.sample('P');
    eq(JSON.parse(sent[1].body).tier, 'default');

    const cut = Studio.create({ fetch: async () => ndjsonReply([{ t: 'd', x: 'abc' }, { t: 'end', stop: 'max_tokens' }]) });
    eq((await cut.sample('P')).truncated, true);
  }

  // ---------- the bridge: errors ----------
  {
    const rejects = async (sample, code, extra) => {
      let err;
      try { await sample(); } catch (e) { err = e; }
      checks++;
      assert.ok(err, 'should have rejected');
      eq(err.code, code);
      if (extra) extra(err);
    };
    const mk = (f) => Studio.create({ fetch: f });
    await rejects(() => mk(async () => json({ code: 'bad_key', msg: 'Claude did not accept the API key.' }, 502)).sample('P'), 'bad_key', (e) => eq(e.message, 'Claude did not accept the API key.'));
    await rejects(() => mk(async () => json({ code: 'no_key', msg: 'none' }, 503)).sample('P'), 'no_key');
    await rejects(() => mk(async () => json({ code: 'budget', msg: 'limit' }, 429)).sample('P'), 'budget');
    await rejects(() => mk(async () => new Response('Bad gateway', { status: 502 })).sample('P'), 'server_error');
    await rejects(() => mk(async () => { throw new TypeError('Failed to fetch'); }).sample('P'), 'network');
    await rejects(() => mk(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }).sample('P'), 'cancelled');
    await rejects(
      () => mk(async () => ndjsonReply([{ t: 'd', x: 'partial ' }, { t: 'err', code: 'unavailable', msg: 'Claude is having a problem right now.' }])).sample('P'),
      'unavailable',
      (e) => eq(e.text, 'partial ', 'what arrived before the failure is passed along'),
    );
    let delivered = false; // the first read gets a chunk, the second finds the connection gone
    const dropped = new ReadableStream({ pull(c) { if (delivered) c.error(new TypeError('network error')); else { delivered = true; c.enqueue(new TextEncoder().encode('{"t":"d","x":"half"}\n')); } } }, { highWaterMark: 0 });
    await rejects(() => mk(async () => new Response(dropped)).sample('P'), 'network', (e) => eq(e.text, 'half'));
  }

  // ---------- the Quizmaster with the bridge as its sample ----------
  {
    const topics = [{ name: 'Space' }, { name: 'Animals' }];
    const prompt = Q.buildPrompt({ age: 8, level: 3, band: Q.bandOf(8) }, [{ id: 'c0', name: 'Space' }, { id: 'c1', name: 'Animals' }], 2, {});
    const server = fs.readFileSync(path.join(__dirname, '../studio/server.py'), 'utf8');
    const start = /PROMPT_START = "([^"]+)"/.exec(server)[1];
    ok(prompt.startsWith(start), 'the server accepts the prompts the game writes');

    const good = Studio.create({ fetch: async () => ndjsonReply([{ t: 'd', x: LINE('c0', 'Which planet is known as the Red Planet?') + '\n' + LINE('c1', 'Which animal is the tallest on land?') + '\n' }, { t: 'end', stop: 'end_turn' }]) });
    const svc = new Q.Service({ sample: good.sample, topics, difficulty: 0 });
    const q = await svc.next({ id: 1, age: 8, level: 3 }, 0);
    eq([q.source, q.q, q.choices.length], ['ai', 'Which planet is known as the Red Planet?', 4]);
    svc.dispose();

    for (const code of ['bad_key', 'no_key', 'bad_model', 'billing', 'budget']) {
      const bad = Studio.create({ fetch: async () => json({ code, msg: 'x' }, 502) });
      const s2 = new Q.Service({ sample: bad.sample, topics, difficulty: 0 });
      const got = await s2.next({ id: 1, age: 8, level: 3 }, 0);
      eq([got.source, s2.status().ai, s2.status().reason], ['bank', false, code], `${code} switches to the built-in pack for good`);
      s2.dispose();
    }
    let hits = 0;
    const wobbly = Studio.create({ fetch: async () => { hits++; return json({ code: 'unavailable', msg: 'x' }, 502); } });
    const s3 = new Q.Service({ sample: wobbly.sample, topics, difficulty: 0 });
    const got3 = await s3.next({ id: 1, age: 8, level: 3 }, 0);
    eq([got3.source, s3.status().ai], ['bank', true], 'a passing problem falls back for one question but keeps trying later');
    ok(hits >= 1);
    s3.dispose();
  }

  // ---------- the studio voice engine on a fake audio clock ----------
  const makeWorld = (opts = {}) => {
    const t0 = Date.now();
    const world = { fetches: [], inFlight: 0, maxInFlight: 0, scheduled: [], stopped: 0, down: 0, speed: 60 };
    const ctx = {
      get currentTime() { return ((Date.now() - t0) / 1000) * world.speed; },
      destination: {},
      createGain() { return { gain: { value: 0 }, connect() {} }; },
      createBufferSource() {
        const src = { connect() {}, start(when) { world.scheduled.push({ text: src.buffer.text, when, end: when + src.buffer.duration }); }, stop() { world.stopped++; }, onended: null };
        return src;
      },
      // the fake "WAV" is just the text; its length decides how long the clip is
      decodeAudioData(data, ok2) { const text = new TextDecoder().decode(data); setTimeout(() => ok2({ text, duration: text.length / 10 }), 0); },
    };
    world.ctx = ctx;
    world.tts = STATUS().tts;
    world.engine = VoiceStudio.create({
      context: () => ctx,
      tts: () => world.tts,
      down: () => world.down++,
      fetch: async (url, o) => {
        const body = JSON.parse(o.body);
        world.fetches.push(body);
        world.inFlight++;
        world.maxInFlight = Math.max(world.maxInFlight, world.inFlight);
        await sleep(opts.latency || 3);
        world.inFlight--;
        if (opts.fail && opts.fail(body)) return new Response('no', { status: 503 });
        return new Response(new TextEncoder().encode(body.text), { status: 200 });
      },
    });
    return world;
  };
  const voice = (id = 'af_heart') => ({ id, name: 'Heart' });

  {
    const w = makeWorld();
    eq(w.engine.voices().map((v) => [v.uri, v.score, v.name]), [['studio:af_heart', 150, 'Heart · American, female'], ['studio:bf_emma', 139, 'Emma · British, female']]);
    for (const state of ['downloading', 'loading', 'error', 'off']) {
      w.tts = Object.assign({}, STATUS().tts, { state, progress: 0.42 });
      eq(w.engine.voices(), [], `no voices while ${state}`);
    }
    w.tts = null;
    eq(w.engine.voices(), [], 'no voices when the server is away');

    w.tts = Object.assign({}, STATUS().tts, { state: 'downloading', progress: 0.42 });
    ok(/downloading.*42%/.test(w.engine.note(false)), w.engine.note(false));
    w.tts = Object.assign({}, STATUS().tts, { state: 'loading' });
    ok(/starting up/.test(w.engine.note(false)));
    w.tts = Object.assign({}, STATUS().tts, { state: 'error' });
    ok(/could not start/.test(w.engine.note(false)));
    w.tts = STATUS().tts;
    eq([w.engine.note(false), /Using the studio voice/.test(w.engine.note(true))], ['', true]);
    w.tts = null;
    eq(w.engine.note(true), '');
  }

  {
    // clips are played back to back, with the requested pauses
    const w = makeWorld();
    const Q1 = 'Which planet is red?'; // 20 chars -> 2.0 s
    const A = 'A, Venus.'; // 9 chars -> 0.9 s
    const B = 'B, Mars.'; // 8 chars -> 0.8 s
    const t0 = w.ctx.currentTime;
    await w.engine.say([Q1, 380, A, 190, B], { voice: voice(), speed: 'normal' });
    eq(w.scheduled.map((s) => s.text), [Q1, A, B]);
    const [s1, s2, s3] = w.scheduled;
    ok(s1.when >= t0 + 0.04 - 1e-9 && s1.when < t0 + 5, 'starts almost immediately');
    near(s2.when, s1.end + 0.38, 'pause after the question');
    near(s3.when, s2.end + 0.19, 'pause between choices');
    eq(w.maxInFlight, 1, 'the server is asked for one clip at a time, in order');
    eq(w.fetches.map((f) => [f.voice, f.speed]), [['af_heart', 1], ['af_heart', 1], ['af_heart', 1]]);
    ok(w.ctx.currentTime >= s3.end - 0.05, 'say() finishes when the last clip has played');

    // the same words again: no new requests
    const n = w.fetches.length;
    await w.engine.say([Q1, 380, A], { voice: voice(), speed: 'normal' });
    eq(w.fetches.length, n, 'clips are cached');
    // a different speed or voice is a different clip
    await w.engine.say([A], { voice: voice('bf_emma'), speed: 'slow' });
    eq(w.fetches[w.fetches.length - 1], { text: A, voice: 'bf_emma', speed: 0.88 });
    await w.engine.say([B], { voice: voice(), speed: 'fast' });
    eq(w.fetches[w.fetches.length - 1].speed, 1.15);
  }

  {
    // prefetch warms the cache so playback starts at once
    const w = makeWorld({ latency: 8 });
    const q = ['One two three.', 380, 'A, Venus.'];
    w.engine.prefetch(q, { voice: voice(), speed: 'normal' });
    await sleep(60);
    eq(w.fetches.length, 2, 'everything was fetched ahead, in order');
    eq(w.fetches.map((f) => f.text), ['One two three.', 'A, Venus.']);
    const run = w.engine.say(q, { voice: voice(), speed: 'normal' });
    await sleep(10);
    eq(w.scheduled.length, 2, 'both clips were placed on the audio clock at once, with no waiting for the server');
    await run;
    eq(w.fetches.length, 2, 'no repeat requests');
  }

  {
    // stopping silences what is playing and stops fetching what has not started
    const w = makeWorld({ latency: 15 });
    const q = ['This is the first clip of the list.', 100, 'Second clip here.', 100, 'Third clip there.', 100, 'Fourth clip too.'];
    const run = w.engine.say(q, { voice: voice(), speed: 'normal' });
    await sleep(25);
    w.engine.stop();
    await run;
    eq(w.stopped >= 1, true, 'the clip that had started was stopped');
    await sleep(80);
    ok(w.fetches.length < 4, `later clips were not fetched after stop (${w.fetches.length})`);
    ok(w.scheduled.length <= 1, 'nothing more was scheduled after stop');
  }

  {
    // a failure before anything played is reported (so the browser voice can step in); later ones are skipped
    const w = makeWorld({ fail: (b) => b.text.startsWith('Bad') });
    let err;
    try { await w.engine.say(['Bad first clip.', 100, 'Good one.'], { voice: voice(), speed: 'normal' }); } catch (e) { err = e; }
    ok(err, 'rejects when the first clip fails');
    eq(w.down, 1, 'the bridge is told the server is not answering');
    eq(w.scheduled.length, 0);

    const w2 = makeWorld({ fail: (b) => b.text.startsWith('Bad') });
    await w2.engine.say(['Good first.', 100, 'Bad second clip.', 100, 'Good third.'], { voice: voice(), speed: 'normal' });
    eq(w2.scheduled.map((s) => s.text), ['Good first.', 'Good third.'], 'a failed later clip is skipped');
    eq(w2.down, 0);
    // failures are not cached: the next try asks again
    const before = w2.fetches.length;
    await w2.engine.say(['Bad second clip.'], { voice: voice(), speed: 'normal' }).catch(() => {});
    ok(w2.fetches.length > before);
  }

  {
    const w = makeWorld();
    for (let i = 0; i < 40; i++) await w.engine.say([`Clip number ${i}.`], { voice: voice(), speed: 'normal' });
    ok(w.engine._cache.size <= 24, `cache is bounded (${w.engine._cache.size})`);
    const noAudio = VoiceStudio.create({ context: () => null, tts: () => STATUS().tts });
    let e2;
    try { await noAudio.say(['Hi'], { voice: voice(), speed: 'normal' }); } catch (e) { e2 = e; }
    ok(e2, 'no audio output means the engine cannot speak');
  }

  // ---------- WQVoice with an engine plugged in ----------
  {
    const w = makeWorld();
    const calls = [];
    let behave = 'ok';
    const engine = Object.assign({}, w.engine, {
      say(queue, o) { calls.push({ queue, speed: o.speed, voice: o.voice.id, alive: o.alive }); return behave === 'ok' ? Promise.resolve() : Promise.reject(new Error('server away')); },
      prefetch(queue, o) { calls.push({ prefetch: queue, voice: o.voice.id }); },
    });
    let changes = 0;
    V.onChange(() => changes++);
    const remove = V.addEngine(engine);
    eq(changes >= 1, true, 'adding an engine tells the pickers');

    const all = V.list();
    eq(all.map((v) => v.name), ['Heart · American, female', 'Emma · British, female', 'Samantha'], 'studio voices rank first');
    eq([all[0].tier, all[0].label, V.current().uri, V.best().uri], ['studio', 'Studio', 'studio:af_heart', 'studio:af_heart']);
    V.setPref({ uri: 'studio:bf_emma', speed: 'slow' });
    eq(V.current().uri, 'studio:bf_emma', 'the family pick is honoured');
    V.setPref({ uri: 'Samantha' });
    eq(V.current().name, 'Samantha', 'a browser voice can still be chosen');
    V.setPref({ uri: 'studio:gone' });
    eq(V.current().uri, 'studio:af_heart', 'a voice that is gone falls back to the best');

    V.setPref({ uri: '', speed: 'fast' });
    await V.say(['What is 7 × 8?', 380, 'A, 56.']);
    eq(calls[0].queue, ['What is 7 times 8?', 380, 'A, 56.'], 'text is cleaned before the engine sees it');
    eq([calls[0].speed, calls[0].voice, calls[0].alive()], ['fast', 'af_heart', true]);
    V.stop();
    eq(calls[0].alive(), false, 'stop() ends the utterance');

    V.prefetchQuestion({ q: 'Which planet?', choices: ['Venus', 'Mars', 'Jupiter', 'Saturn'] });
    eq(calls[calls.length - 1].prefetch.filter((x) => typeof x === 'string'), ['Which planet?', 'A, Venus.', 'B, Mars.', 'C, Jupiter.', 'D, Saturn.']);

    // the server goes away: the browser voice steps in
    spoken.length = 0;
    behave = 'fail';
    await V.say(['Hello there.']);
    eq(spoken, ['Hello there.'], 'falls back to the browser voice');

    // with a browser voice chosen, the engine is not used and not prefetched for
    V.setPref({ uri: 'Samantha' });
    const n = calls.length;
    behave = 'ok';
    await V.say(['Browser voice please.']);
    V.prefetchQuestion({ q: 'Q?', choices: ['a', 'b', 'c', 'd'] });
    eq(calls.length, n);
    ok(spoken.includes('Browser voice please.'));

    w.tts = Object.assign({}, STATUS().tts, { state: 'downloading', progress: 0.5 });
    engine.note = w.engine.note;
    ok(/downloading/.test(V.tip()), 'the picker explains a voice that is still on its way');
    w.tts = STATUS().tts;
    V.setPref({ uri: '' });
    ok(/studio voice/i.test(V.tip()));

    remove();
    eq(V.list().map((v) => v.name), ['Samantha'], 'removing the engine removes its voices');
  }

  // a browser with no speech of its own can still read aloud through an engine
  {
    const code = `
      const VS = require(${JSON.stringify(path.join(__dirname, '../src/voice-studio.js'))});
      require(${JSON.stringify(path.join(__dirname, '../src/voice.js'))});
      const V = globalThis.WQVoice;
      const before = V.supported;
      V.addEngine({ voices: () => [{ uri: 'studio:a', name: 'A', lang: 'en-US', score: 150 }], say: () => Promise.resolve(), stop() {} });
      console.log(JSON.stringify([before, V.supported]));
    `;
    eq(JSON.parse(execFileSync(process.execPath, ['-e', code]).toString()), [false, true]);
  }

  console.log(`All ${checks} home-server edition checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
