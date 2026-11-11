// Reading questions aloud with the best voice available.
//
// Two kinds of voice take part. The browser's own voices (always there, quality
// varies) are ranked: Natural / Premium / Enhanced first, novelty voices never.
// An "engine" is an outside voice source that can be plugged in, such as the
// studio voice on a home server; its voices rank above everything else. If an
// engine cannot speak (server down, still loading) the browser voice steps in.
// The text is cleaned so maths and units are spoken properly, and read in short
// chunks with natural pauses.
(function (root) {
  'use strict';

  const synth = root.speechSynthesis;
  const browserOk = !!(synth && root.SpeechSynthesisUtterance);
  let voices = [];
  const subs = new Set();
  const engines = new Set();
  const pref = { uri: '', speed: 'normal' };
  let token = 0;

  const RATE = { slow: 0.84, normal: 0.96, fast: 1.1 };
  const TIER_SCORE = { studio: 150, natural: 90, premium: 80, enhanced: 62, network: 45, standard: 20 };
  const TIER_LABEL = { studio: 'Studio', natural: 'Natural', premium: 'Premium', enhanced: 'Enhanced', network: 'Online', standard: 'Standard' };
  // old robotic or joke voices that ship with some systems
  const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Princess|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
  const NICE = /\b(samantha|ava|allison|zoe|evan|nicky|aria|jenny|emma|libby|sonia|serena|daniel|karen|moira|tessa|alex|susan|joelle|noelle|natasha|michelle)\b/i;

  function notify() {
    subs.forEach((f) => f());
  }

  function load() {
    if (!browserOk) return;
    voices = synth.getVoices() || [];
    notify();
  }
  if (browserOk) {
    load();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', load);
    else synth.onvoiceschanged = load;
    setTimeout(load, 300);
    setTimeout(load, 1500);
  }

  function tier(v) {
    const n = `${v.name} ${v.voiceURI || ''}`;
    if (/natural|neural/i.test(n)) return 'natural';
    if (/premium/i.test(n)) return 'premium';
    if (/enhanced|siri/i.test(n)) return 'enhanced';
    if (/google/i.test(n) || v.localService === false) return 'network';
    return 'standard';
  }

  function score(v) {
    let s = TIER_SCORE[tier(v)];
    const lang = (v.lang || '').replace('_', '-').toLowerCase();
    const mine = ((root.navigator && root.navigator.language) || 'en-US').toLowerCase();
    if (lang === mine) s += 12;
    else if (lang.split('-')[0] === mine.split('-')[0]) s += 6;
    if (/^en-(us|gb)/.test(lang)) s += 4;
    if (/desktop/i.test(v.name)) s -= 12;
    if (NICE.test(v.name)) s += 6;
    return s;
  }

  // The browser's English voices, best first. (The game is in English.)
  function browserList() {
    let pool = voices.filter((v) => /^en([-_]|$)/i.test(v.lang) && !NOVELTY.test(v.name));
    if (!pool.length) pool = voices.filter((v) => !NOVELTY.test(v.name));
    return pool
      .map((v) => ({ uri: v.voiceURI, name: v.name.replace(/^(Microsoft|Google)\s+/i, '$1 '), lang: v.lang, tier: tier(v), label: TIER_LABEL[tier(v)], score: score(v), voice: v }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  // Voices offered by plugged-in engines: { uri, name, lang, score, ... }.
  function engineList() {
    const out = [];
    engines.forEach((e) => {
      let own = [];
      try {
        own = e.voices() || [];
      } catch (err) {
        /* a broken engine simply offers nothing */
      }
      own.forEach((v) => out.push(Object.assign({ tier: 'studio', label: TIER_LABEL.studio, voice: null }, v, { engine: e })));
    });
    return out;
  }

  function list() {
    return engineList()
      .concat(browserList())
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  function best() {
    return list()[0] || null;
  }

  function pick(all) {
    if (pref.uri) {
      const hit = all.find((x) => x.uri === pref.uri);
      if (hit) return hit;
    }
    return all[0] || null;
  }

  // The voice that will speak: the family's pick if still available, else the best.
  function current() {
    return pick(list());
  }

  // Say things the way people say them.
  function speakable(text) {
    return String(text)
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}‍]/gu, '')
      .replace(/(\d)\s*[×xX]\s*(?=\d)/g, '$1 times ')
      .replace(/÷/g, ' divided by ')
      .replace(/(\d)\s*[−–-]\s*(?=\d)/g, '$1 minus ')
      .replace(/(\d)\s*\+\s*(?=\d)/g, '$1 plus ')
      .replace(/\s=\s/g, ' equals ')
      .replace(/²/g, ' squared')
      .replace(/³/g, ' cubed')
      .replace(/°\s*C\b/g, ' degrees Celsius')
      .replace(/°\s*F\b/g, ' degrees Fahrenheit')
      .replace(/(\d)\s*%/g, '$1 percent')
      .replace(/(\d)\s*km\/h\b/gi, '$1 kilometers per hour')
      .replace(/(\d)\s*mph\b/gi, '$1 miles per hour')
      .replace(/(\d)\s*km\b/gi, '$1 kilometers')
      .replace(/(\d)\s*kg\b/gi, '$1 kilograms')
      .replace(/(\d)\s*cm\b/gi, '$1 centimeters')
      .replace(/(\d)\s*mm\b/gi, '$1 millimeters')
      .replace(/\bvs\.?\s/gi, 'versus ')
      .replace(/\be\.g\./gi, 'for example')
      .replace(/\bi\.e\./gi, 'that is')
      .replace(/\betc\./gi, 'et cetera')
      .replace(/&/g, ' and ')
      .replace(/[*_#`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Short pieces keep every engine happy (some cut off long utterances).
  function chunk(text) {
    const out = [];
    const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text];
    for (let s of sentences) {
      s = s.trim();
      while (s.length > 190) {
        let cut = Math.max(s.lastIndexOf(', ', 170), s.lastIndexOf('; ', 170), s.lastIndexOf(' ', 170));
        if (cut < 60) cut = 170;
        out.push(s.slice(0, cut + 1).trim());
        s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    }
    return out;
  }

  // parts: strings to speak, and numbers meaning "pause this many milliseconds".
  // Becomes a queue of cleaned, short strings and pauses.
  function buildQueue(parts) {
    const queue = [];
    for (const p of [].concat(parts)) {
      if (typeof p === 'number') queue.push(p);
      else if (p) chunk(speakable(p)).forEach((c) => queue.push(c));
    }
    return queue;
  }

  function stop() {
    token++;
    if (browserOk) {
      try {
        synth.cancel();
      } catch (e) {
        /* ignore */
      }
    }
    engines.forEach((e) => {
      try {
        e.stop();
      } catch (err) {
        /* ignore */
      }
    });
  }

  function sayBrowser(queue, tk) {
    if (!browserOk) return Promise.resolve();
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (tk !== token || i >= queue.length) return resolve();
        const item = queue[i++];
        if (typeof item === 'number') {
          setTimeout(next, item);
          return;
        }
        const u = new root.SpeechSynthesisUtterance(item);
        const cur = pick(browserList());
        if (cur) {
          u.voice = cur.voice;
          u.lang = cur.voice.lang;
        } else u.lang = 'en-US';
        u.rate = RATE[pref.speed] || RATE.normal;
        u.pitch = 1.03;
        u.volume = 1;
        u.onend = next;
        u.onerror = next;
        try {
          synth.speak(u);
        } catch (e) {
          next();
        }
      };
      // some browsers drop a speak() that comes straight after cancel()
      setTimeout(() => {
        try {
          synth.resume();
        } catch (e) {
          /* ignore */
        }
        next();
      }, 60);
    });
  }

  function say(parts) {
    stop();
    const tk = token;
    const queue = buildQueue(parts);
    const cur = current();
    if (cur && cur.engine) {
      // Start the engine in this same call: browsers only let audio begin from a tap.
      let run;
      try {
        run = Promise.resolve(cur.engine.say(queue, { voice: cur, speed: pref.speed, alive: () => tk === token }));
      } catch (e) {
        run = Promise.reject(e);
      }
      return run.catch(() => (tk === token ? sayBrowser(queue, tk) : undefined));
    }
    return sayBrowser(queue, tk);
  }

  function questionParts(q) {
    const parts = [q.q, 380];
    q.choices.forEach((c, i) => {
      parts.push(`${'ABCD'[i]}, ${c}.`);
      parts.push(i === 2 ? 140 : 190);
    });
    return parts;
  }

  // A question read the way a quiz host would.
  function question(q) {
    return say(questionParts(q));
  }

  // Get the audio ready ahead of time when the voice needs to fetch it.
  function prefetch(parts) {
    const cur = current();
    if (!cur || !cur.engine || typeof cur.engine.prefetch !== 'function') return;
    try {
      cur.engine.prefetch(buildQueue(parts), { voice: cur, speed: pref.speed });
    } catch (e) {
      /* a failed prefetch only means the audio is fetched when it is needed */
    }
  }

  // Platform-specific advice for getting a nicer voice.
  function tip() {
    const cur = current();
    for (const e of engines) {
      const note = typeof e.note === 'function' ? e.note(!!(cur && cur.engine === e)) : '';
      if (note) return note;
    }
    const ua = (root.navigator && root.navigator.userAgent) || '';
    if (!browserOk) return 'This browser cannot read aloud.';
    if (cur && (cur.tier === 'natural' || cur.tier === 'premium')) return 'Using a natural-sounding voice.';
    if (/iPhone|iPad|iPod/.test(ua)) return 'For a more natural voice: Settings, Accessibility, Spoken Content, Voices, then download an Enhanced or Premium English voice.';
    if (/Mac/.test(ua)) return 'For a much more natural voice: System Settings, Accessibility, Spoken Content, System voice, Manage Voices, then download a Premium voice such as Ava or Zoe. Reload this page afterwards.';
    if (/Windows/.test(ua)) return 'For a much more natural voice, open this page in Microsoft Edge, which includes Natural voices such as Aria and Jenny.';
    if (/Android/.test(ua)) return 'For a more natural voice, install or update Speech Services by Google in your Android settings.';
    return 'Your device has standard voices only. A Natural or Premium voice sounds much better where available.';
  }

  root.WQVoice = {
    get supported() {
      return browserOk || engineList().length > 0;
    },
    list,
    best,
    current,
    say,
    question,
    prefetch,
    prefetchQuestion(q) {
      prefetch(questionParts(q));
    },
    stop,
    speakable,
    tip,
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    // Plug in a voice engine: { voices(), say(queue, opts), stop(), prefetch?(queue, opts), note?(isCurrent) }.
    addEngine(engine) {
      engines.add(engine);
      notify();
      return () => {
        engines.delete(engine);
        notify();
      };
    },
    notify,
    setPref(p) {
      if (typeof p.uri === 'string') pref.uri = p.uri;
      if (RATE[p.speed]) pref.speed = p.speed;
    },
    getPref: () => ({ uri: pref.uri, speed: pref.speed }),
    tierLabel: (t) => TIER_LABEL[t] || t,
    _setVoices(v) {
      voices = v; // tests only
    },
    _chunk: chunk,
  };
})(typeof window !== 'undefined' ? window : globalThis);
