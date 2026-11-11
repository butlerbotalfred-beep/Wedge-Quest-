// The Quizmaster: asks Claude for age-matched multiple-choice questions,
// keeps a small deck per age band and topic so the game never waits long,
// and falls back to the built-in bank if the AI is unavailable.
(function (root) {
  'use strict';

  const Bank = typeof require === 'function' && typeof module !== 'undefined' ? require('./bank.js') : root.WQBank;

  const BANDS = [
    { id: 'a4', max: 6, grade: 'preschool to 1st grade', words: 12, guide: 'Preschool to first grade. Everyday things such as animals, colors, shapes, counting to 20, simple nature and food. Very short sentences and very simple words; the question may be read aloud to the player.' },
    { id: 'a7', max: 8, grade: '2nd to 3rd grade', words: 16, guide: 'Early elementary school (grades 2-3). Simple facts a curious 7 or 8 year old knows or can work out.' },
    { id: 'a9', max: 10, grade: '4th to 5th grade', words: 20, guide: 'Upper elementary school (grades 4-5).' },
    { id: 'a11', max: 12, grade: '6th to 7th grade', words: 24, guide: 'Middle school (grades 6-7).' },
    { id: 'a13', max: 15, grade: '8th to 10th grade', words: 28, guide: 'Early high school (grades 8-10).' },
    { id: 'a16', max: 17, grade: '11th to 12th grade', words: 30, guide: 'Late high school (grades 11-12).' },
    { id: 'ad', max: 200, grade: 'adult', words: 32, guide: 'Adult general-knowledge level: interesting rather than trivial.' },
  ];

  const LEVELS = {
    1: 'an easy warm-up; things most kids this age already know',
    2: 'fairly easy',
    3: 'medium; a good challenge for this age',
    4: 'hard; needs real knowledge or careful thinking',
    5: 'very hard; a stretch even for the top students of this age',
  };

  // Errors that will not go away by trying again: stop asking and use the built-in bank.
  // (The last five come from the home-server edition.)
  const FATAL = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired', 'tools_unavailable', 'no_key', 'bad_key', 'bad_model', 'billing', 'budget']);
  const MAX_CONCURRENT = 2;
  const WAIT_MS = 14000;
  const COOLDOWN_MS = 20000;

  const bandOf = (age) => BANDS.find((b) => age <= b.max) || BANDS[BANDS.length - 1];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const clean = (s, n) => String(s).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
  const str = (x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '');

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildPrompt(profile, topics, perTopic, avoid) {
    const band = profile.band;
    const out = [];
    out.push('You are the Quizmaster of a family trivia board game. Write multiple-choice questions for one player.');
    out.push('');
    out.push(`PLAYER: ${profile.age} years old (${band.grade}). Difficulty ${profile.level} of 5: ${LEVELS[profile.level]}.`);
    out.push(`AGE GUIDE: ${band.guide}`);
    out.push('');
    out.push(`TOPICS: write ${perTopic} question${perTopic > 1 ? 's' : ''} for each topic below. Go round the topics in this order, then repeat: ${topics.map((t) => t.id).join(', ')}`);
    for (const t of topics) out.push(`${t.id} = ${clean(t.name, 40)}`);
    const avoidLines = topics.filter((t) => avoid && avoid[t.id] && avoid[t.id].length).map((t) => `${t.id}: ${avoid[t.id].map((q) => clean(q, 90)).join(' | ')}`);
    if (avoidLines.length) {
      out.push('');
      out.push('ALREADY ASKED (do not repeat or closely paraphrase):');
      out.push(...avoidLines);
    }
    out.push('');
    out.push('RULES');
    out.push('- Each question has exactly 4 answer options: 1 correct and 3 wrong. The wrong answers must sound believable but be clearly wrong to someone who knows the subject. Never use "all of the above" or "none of the above". Do not give the answer away in the question.');
    out.push('- Only ask what you are completely sure about. Facts must be settled and timeless: no current records, prices, rankings, news or opinions.');
    out.push(`- Match the player's age: simple vocabulary for young players, at most ${band.words} words per question, answers at most 7 words each.`);
    out.push('- Make it fun and varied: mix who, what, where, why and "which one" questions and cover different parts of each topic. If a topic is a game, show, hobby or interest, ask about that thing directly. Keep everything family friendly.');
    out.push('- "f" is one friendly sentence (at most 22 words) that teaches something extra about the answer.');
    out.push('');
    out.push('OUTPUT: one JSON object per line and nothing else (no array, no code fences, no commentary), like this:');
    out.push('{"t":"c0","q":"question text","a":"the correct answer","w":["wrong 1","wrong 2","wrong 3"],"f":"fun fact"}');
    return out.join('\n');
  }

  // Pull every complete top-level {...} object out of streamed text, starting
  // at `from`. Tolerates code fences, arrays, pretty printing and chatter.
  // Returns the parsed objects and the offset just after the last complete one.
  function extractObjects(text, from) {
    const objects = [];
    let end = from || 0;
    let depth = 0;
    let start = -1;
    let inStr = false;
    let esc = false;
    for (let i = from || 0; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"' && depth > 0) inStr = true;
      else if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}' && depth > 0) {
        depth--;
        if (depth === 0) {
          try {
            objects.push(JSON.parse(text.slice(start, i + 1)));
          } catch (e) {
            /* skip a malformed object */
          }
          end = i + 1;
        }
      }
    }
    return { objects, end };
  }

  class Service {
    // opts: { sample, topics: [{name}], difficulty: -1|0|1, onStatus }
    constructor(opts) {
      this.sample = typeof opts.sample === 'function' ? opts.sample : null;
      this.topics = opts.topics;
      this.offset = opts.difficulty | 0;
      this.onStatus = opts.onStatus || null;
      this.decks = new Map();
      this.jobs = new Map();
      this.filled = new Set();
      this.lastKey = new Map();
      this.asked = new Set();
      this.recent = this.topics.map(() => []);
      this.aiOn = !!this.sample;
      this.reason = this.sample ? '' : 'unavailable';
      this.fails = 0;
      this.cooldownUntil = 0;
      this.urgent = 0;
      this.active = 0;
      this.waiting = [];
      this.waiters = new Set();
      this.ctl = typeof AbortController === 'function' ? new AbortController() : { signal: undefined, abort() {} };
      this.disposed = false;
    }

    profileOf(player) {
      return { age: player.age, level: clamp((player.level || 3) + this.offset, 1, 5), band: bandOf(player.age) };
    }

    keyOf(player) {
      const p = this.profileOf(player);
      return `${p.band.id}:${p.level}`;
    }

    deckOf(key) {
      let d = this.decks.get(key);
      if (!d) {
        d = this.topics.map(() => []);
        this.decks.set(key, d);
      }
      return d;
    }

    queued() {
      let n = 0;
      for (const d of this.decks.values()) for (const t of d) n += t.length;
      return n;
    }

    status() {
      return { ai: this.aiOn, busy: this.jobs.size > 0 || this.urgent > 0, ready: this.queued(), reason: this.reason };
    }

    emit() {
      for (const w of [...this.waiters]) w();
      if (this.onStatus && !this.disposed) this.onStatus(this.status());
    }

    waitChange(ms) {
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        this.waiters.add(done);
      });
    }

    acquire(urgent) {
      if (this.active < MAX_CONCURRENT) {
        this.active++;
        return Promise.resolve();
      }
      return new Promise((resolve) => (urgent ? this.waiting.unshift(resolve) : this.waiting.push(resolve)));
    }

    release() {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }

    // Start background generation for a player's age band for every topic
    // that has fewer than two questions in stock.
    warm(players) {
      for (const p of players) this.ensureJob(p);
    }

    ensureJob(player) {
      if (!this.aiOn || this.disposed) return;
      const key = this.keyOf(player);
      if (this.jobs.has(key) || Date.now() < this.cooldownUntil) return;
      const deck = this.deckOf(key);
      const low = [];
      deck.forEach((d, c) => {
        if (d.length < 2) low.push(c);
      });
      if (!low.length) return;
      const first = !this.filled.has(key);
      const perTopic = low.length === this.topics.length ? 2 : 3;
      const job = this.generate(player, low, perTopic, first ? 'quick' : 'default', false)
        .catch((e) => this.noteError(e))
        .finally(() => {
          this.filled.add(key);
          this.jobs.delete(key);
          this.emit();
        });
      this.jobs.set(key, job);
      this.emit();
    }

    async generate(player, cats, perTopic, tier, urgent) {
      const profile = this.profileOf(player);
      const key = this.keyOf(player);
      const deck = this.deckOf(key);
      const topics = cats.map((c) => ({ id: `c${c}`, name: this.topics[c].name }));
      const avoid = {};
      for (const c of cats) avoid[`c${c}`] = this.recent[c].slice(-8);
      const prompt = buildPrompt(profile, topics, perTopic, avoid);
      const state = { offset: 0, got: 0 };
      const eat = (text) => {
        if (this.disposed || typeof text !== 'string') return;
        const r = extractObjects(text, state.offset);
        state.offset = r.end;
        for (const obj of r.objects) {
          const item = this.normalize(obj);
          if (item) {
            deck[item.cat].push(item);
            state.got++;
            this.emit();
          }
        }
      };
      await this.acquire(urgent);
      let res;
      try {
        res = await this.sample(prompt, { modelTier: tier, cache: false, signal: this.ctl.signal, onText: (u) => eat(u.text) });
      } catch (e) {
        if (e && e.text) eat(e.text);
        throw e;
      } finally {
        this.release();
      }
      eat(res && res.text);
      if (!state.got) throw { code: 'invalid_json', message: 'no usable questions in the reply' };
      this.fails = 0;
      return state.got;
    }

    normalize(obj) {
      if (!obj || typeof obj !== 'object') return null;
      const t = obj.t !== undefined ? obj.t : obj.topic;
      const cat = typeof t === 'number' ? t : parseInt(String(t).replace(/\D/g, ''), 10);
      if (!Number.isInteger(cat) || cat < 0 || cat >= this.topics.length) return null;
      const q = str(obj.q !== undefined ? obj.q : obj.question);
      const a = str(obj.a !== undefined ? obj.a : obj.correct !== undefined ? obj.correct : obj.answer);
      let w = obj.w || obj.wrong || obj.wrongs || obj.distractors;
      if (!Array.isArray(w)) return null;
      const seen = new Set([a.toLowerCase()]);
      w = w
        .map(str)
        .filter((x) => x && x.length <= 90 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
        .slice(0, 3);
      if (q.length < 8 || q.length > 260 || !a || a.length > 90 || w.length < 3) return null;
      const key = norm(q);
      if (this.asked.has(key)) return null;
      this.asked.add(key);
      this.recent[cat].push(q);
      if (this.recent[cat].length > 24) this.recent[cat].shift();
      return { cat, q, a, w, f: str(obj.f !== undefined ? obj.f : obj.fact).slice(0, 220) };
    }

    noteError(e) {
      const code = e && e.code;
      if (code === 'cancelled' || this.disposed) return;
      if (FATAL.has(code)) {
        this.aiOn = false;
        this.reason = code;
      } else {
        this.fails++;
        this.cooldownUntil = Date.now() + COOLDOWN_MS;
        if (this.fails >= 4) {
          this.aiOn = false;
          this.reason = code || 'errors';
        }
      }
      this.emit();
    }

    // Resolve the next question for a player on a topic. Never rejects.
    async next(player, cat) {
      const key = this.keyOf(player);
      const own = this.deckOf(key)[cat];
      let deck = own;
      if (this.aiOn) {
        this.ensureJob(player);
        // Just changed level and the new stock is still being written: use the
        // previous level's questions rather than making the player wait.
        if (!own.length && !this.filled.has(key)) {
          const prev = this.lastKey.get(player.id);
          if (prev && prev !== key && this.decks.has(prev) && this.decks.get(prev)[cat].length) deck = this.decks.get(prev)[cat];
        }
        if (deck === own) {
          const t0 = Date.now();
          while (!own.length && this.aiOn && this.jobs.has(key) && Date.now() - t0 < WAIT_MS) await this.waitChange(1500);
          if (!own.length && this.aiOn && !this.disposed) {
            this.urgent++;
            this.emit();
            try {
              await this.generate(player, [cat], 1, 'quick', true);
            } catch (e) {
              this.noteError(e);
            } finally {
              this.urgent--;
              this.emit();
            }
          }
        }
      }
      const item = deck.shift();
      if (item) {
        if (deck === own) this.lastKey.set(player.id, key);
        this.ensureJob(player);
        return this.finish(item, 'ai');
      }
      return this.fromBank(player, cat);
    }

    fromBank(player, cat) {
      const row = Bank.pick(this.topics[cat].name, player.age, this.asked);
      this.asked.add(norm(row.q));
      return this.finish({ cat, q: row.q, a: row.a, w: row.w, f: row.f, generic: row.generic }, 'bank');
    }

    finish(item, source) {
      const choices = shuffle([item.a, ...item.w]);
      return { cat: item.cat, q: item.q, choices, answer: choices.indexOf(item.a), fact: item.f || '', source, generic: !!item.generic };
    }

    dispose() {
      this.disposed = true;
      this.aiOn = false;
      try {
        this.ctl.abort();
      } catch (e) {
        /* ignore */
      }
      for (const w of [...this.waiters]) w();
    }
  }

  const api = { Service, buildPrompt, extractObjects, bandOf, BANDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WQQuestions = api;
})(typeof window !== 'undefined' ? window : globalThis);
