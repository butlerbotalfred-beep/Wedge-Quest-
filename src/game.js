// Game flow: setup, turns, rules, saving.
(function (root) {
  'use strict';

  const L = root.WQLayout;
  const T = root.WQTheme;
  const UI = root.WQUI;
  const Sfx = root.WQSfx;
  const Q = root.WQQuestions;
  const { $, icon } = UI;

  const SETUP_KEY = 'wq:setup:v1';
  const GAME_KEY = 'wq:game:v1';
  const HELP_KEY = 'wq:helped';
  const CANCEL = { cancelled: true };
  const GOLD = '#ffc928';
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const store = {
    get(k) {
      try {
        return JSON.parse(root.localStorage.getItem(k));
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        root.localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        /* storage may be blocked */
      }
    },
    del(k) {
      try {
        root.localStorage.removeItem(k);
      } catch (e) {
        /* ignore */
      }
    },
  };

  const G = {
    cfg: null,
    scene: null,
    sample: null,
    mode: 'setup',
    token: 0,
    layout: null,
    cats: [],
    players: [],
    turn: 0,
    svc: null,
    missed: [],
    bannerFor: -1,
    pickResolve: null,
    pickOptions: null,
    wake: null,
  };
  root.WQGame = G; // handy for debugging and tests
  G.start = start;
  G.toSetup = toSetup;

  const alive = (tk) => tk === G.token;
  async function S(tk, p) {
    const v = await p;
    if (!alive(tk)) throw CANCEL;
    return v;
  }

  // ---------- setup data ----------

  function loadCfg() {
    const base = UI.defaultConfig();
    const s = store.get(SETUP_KEY);
    if (!s || typeof s !== 'object') return base;
    try {
      if (Number.isInteger(s.n)) base.n = clamp(s.n, 3, 8);
      if (Array.isArray(s.topics)) {
        s.topics.slice(0, 8).forEach((t, i) => {
          if (t && typeof t.name === 'string') base.topics[i] = { name: t.name.slice(0, 24), emoji: typeof t.emoji === 'string' && t.emoji ? t.emoji.slice(0, 8) : base.topics[i].emoji, manual: !!t.manual };
        });
      }
      if (Array.isArray(s.players) && s.players.length) {
        base.players = s.players.slice(0, 6).map((p, i) => ({
          name: String((p && p.name) || `Player ${i + 1}`).slice(0, 14),
          age: clamp(parseInt(p && p.age, 10) || 9, 4, 99),
          avatar: p && typeof p.avatar === 'string' && p.avatar ? p.avatar.slice(0, 8) : T.AVATARS[i % T.AVATARS.length],
        }));
      }
      if ([-1, 0, 1].includes(s.difficulty)) base.difficulty = s.difficulty;
      if (typeof s.sound === 'boolean') base.sound = s.sound;
      if (typeof s.glow === 'boolean') base.glow = s.glow;
      if (['auto', 'on', 'off'].includes(s.readAloud)) base.readAloud = s.readAloud;
      if (typeof s.voice === 'string') base.voice = s.voice.slice(0, 200);
      if (['slow', 'normal', 'fast'].includes(s.voiceSpeed)) base.voiceSpeed = s.voiceSpeed;
    } catch (e) {
      return UI.defaultConfig();
    }
    return base;
  }

  const makeCats = (cfg) => cfg.topics.slice(0, cfg.n).map((t, i) => ({ name: (t.name || '').trim() || `Topic ${i + 1}`, emoji: t.emoji || '⭐', color: T.PALETTE[i] }));

  let saveTimer = 0;
  function saveSetup() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(SETUP_KEY, G.cfg), 250);
  }

  // ---------- preview board behind the setup screen ----------

  function previewPlayers() {
    return G.cfg.players.map((p, i) => ({ id: i, color: T.PLAYER_COLORS[i % T.PLAYER_COLORS.length], avatar: p.avatar }));
  }

  function rebuildPreview() {
    G.layout = L.generate(G.cfg.n);
    G.cats = makeCats(G.cfg);
    G.scene.build(G.layout, G.cats);
    G.scene.setPlayers(previewPlayers());
    G.scene.setActive(null);
  }

  let previewTimer = 0;
  function onSetupChange(kind) {
    saveSetup();
    if (kind === 'n' || kind === 'emoji') {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(rebuildPreview, 120);
    } else if (kind === 'players') {
      G.scene.setPlayers(previewPlayers());
    } else if (kind === 'options') {
      Sfx.setMuted(!G.cfg.sound);
      G.scene.setGlow(G.cfg.glow);
    }
  }

  function applyInsets() {
    const s = G.scene;
    if (!s || !s.ok) return;
    // the scoreboard is a side column on wide screens and on phones held sideways
    const wide = root.matchMedia('(min-width: 900px), (max-height: 520px) and (min-width: 600px)').matches;
    if (G.mode === 'setup') {
      // side by side whenever the panel leaves room for a readable board
      if (root.innerWidth >= 860) s.setInsets({ l: UI.setup.panelWidth() + 36, r: 8, t: 8, b: 8 });
      else s.setInsets({ l: 0, r: 0, t: 0, b: 0 });
      return;
    }
    const top = $('#topbar').getBoundingClientRect();
    const side = $('#side').getBoundingClientRect();
    const dock = $('#dock').getBoundingClientRect();
    if (wide) {
      // The board runs a little under the glass panels and behind the die's pedestal, like a
      // full-screen scene with the interface floating over it.
      const ped = document.querySelector('.pedestal').getBoundingClientRect();
      s.setInsets({
        l: Math.round(side.right - side.width * 0.42),
        r: 0,
        t: Math.round(top.bottom - top.height * 0.1),
        b: Math.max(0, Math.round(root.innerHeight - ped.top - ped.height * 0.5)),
      });
    } else s.setInsets({ l: 0, r: 0, t: Math.max(top.bottom, side.bottom), b: root.innerHeight - dock.top });
  }

  function describeNode(id) {
    const n = G.layout && G.layout.nodes[id];
    if (!n) return null;
    if (n.type === 'hub') return '🏆 The hub: cross it any time, but land here with every wedge to win';
    if (n.type === 'roll') return '🎲 Roll again';
    const c = G.cats[n.cat];
    if (!c) return null;
    return `${c.emoji} ${c.name}${n.type === 'hq' ? ' · wedge space' : ''}`;
  }

  // ---------- starting and stopping ----------

  async function requestWake() {
    try {
      if (root.navigator.wakeLock && !G.wake) {
        G.wake = await root.navigator.wakeLock.request('screen');
        G.wake.addEventListener('release', () => {
          G.wake = null;
        });
      }
    } catch (e) {
      /* optional */
    }
  }

  function validSaved(s, layout) {
    return (
      s &&
      s.v === 1 &&
      s.cfg &&
      Array.isArray(s.players) &&
      s.players.length >= 1 &&
      s.players.every((p) => Array.isArray(p.wedges) && p.wedges.length === s.cfg.n && Number.isInteger(p.pos) && p.pos >= 0 && p.pos < layout.nodes.length && p.stats && Array.isArray(p.stats.by))
    );
  }

  function freshPlayers(cfg, layout, cats) {
    return cfg.players.map((p, i) => ({
      id: i,
      name: (p.name || '').trim() || `Player ${i + 1}`,
      age: p.age,
      avatar: p.avatar,
      color: T.PLAYER_COLORS[i % T.PLAYER_COLORS.length],
      pos: layout.hub,
      wedges: new Array(cfg.n).fill(false),
      level: 3,
      sc: 0,
      sw: 0,
      stats: { asked: 0, correct: 0, by: cats.map(() => ({ a: 0, c: 0 })) },
    }));
  }

  async function start(resume) {
    Sfx.unlock();
    const token = ++G.token;
    UI.cancelRoll();
    UI.stopSpeak();
    G.rolled = false;
    $('#ui').classList.remove('picking');
    // If Start is tapped before the AI check has answered, give it a moment so the game does not
    // begin in built-in mode by accident.
    if (G.aiCheck) {
      await Promise.race([G.aiCheck, delay(3000)]);
      if (token !== G.token) return;
    }
    const saved = resume ? store.get(GAME_KEY) : null;
    if (saved && saved.cfg) {
      const probe = L.generate(clamp(saved.cfg.n | 0, 3, 8));
      if (validSaved(saved, probe)) G.cfg = Object.assign(UI.defaultConfig(), saved.cfg);
    }
    const cfg = G.cfg;
    cfg.topics.slice(0, cfg.n).forEach((t, i) => {
      if (!String(t.name).trim()) t.name = T.TOPIC_IDEAS[i % T.TOPIC_IDEAS.length].name;
    });
    store.set(SETUP_KEY, cfg);
    Sfx.setMuted(!cfg.sound);

    G.layout = L.generate(cfg.n);
    G.cats = makeCats(cfg);
    const ok = saved && validSaved(saved, G.layout);
    G.players = ok ? saved.players : freshPlayers(cfg, G.layout, G.cats);
    G.turn = ok ? clamp(saved.turn | 0, 0, G.players.length - 1) : 0;
    G.missed = ok && Array.isArray(saved.missed) ? saved.missed : [];
    G.bannerFor = -1;
    G.pickResolve = null;
    G.pickOptions = null;

    UI.closeAllModals();
    const sc = G.scene;
    sc.build(G.layout, G.cats);
    sc.setPlayers(G.players.map((p) => ({ id: p.id, color: p.color, avatar: p.avatar })));
    G.players.forEach((p) => {
      sc.setWedges(p.id, p.wedges);
      sc.setPawnNode(p.id, p.pos);
    });
    sc.setMode('play');
    sc.setGlow(cfg.glow);

    if (G.svc) G.svc.dispose();
    G.svc = new Q.Service({ sample: G.sample, topics: G.cats, difficulty: cfg.difficulty, onStatus: UI.setAi });
    UI.setAi(G.svc.status());
    G.svc.warm(G.players); // first AI call: the permission prompt appears right after the Start tap

    G.mode = 'play';
    UI.setup.hide();
    UI.setHud(true);
    UI.renderLegend(G.cats);
    UI.renderPlayers(G.players, G.cats, G.players[G.turn].id);
    syncToolbar();
    applyInsets();
    requestWake();
    loop(token);
  }

  function toSetup() {
    G.token++;
    G.pickResolve = null;
    G.pickOptions = null;
    $('#ui').classList.remove('picking');
    UI.cancelRoll();
    if (G.svc) G.svc.dispose();
    UI.closeAllModals();
    UI.stopSpeak();
    UI.setHud(false);
    G.mode = 'setup';
    G.scene.clearChoices();
    G.scene.confettiUntil = 0;
    G.scene.setMode('preview');
    rebuildPreview();
    UI.setup.show(G.cfg, setupHooks);
    updateResume();
    applyInsets();
    UI.tip(null);
  }

  function updateResume() {
    const s = store.get(GAME_KEY);
    const probe = s && s.cfg ? L.generate(clamp(s.cfg.n | 0, 3, 8)) : null;
    if (s && probe && validSaved(s, probe)) {
      const got = s.players.reduce((n, p) => n + p.wedges.filter(Boolean).length, 0);
      UI.setup.setResume(`Continue last game · ${got} ${got === 1 ? 'wedge' : 'wedges'} won`);
    } else UI.setup.setResume('');
  }

  function save() {
    if (G.mode !== 'play') return;
    store.set(GAME_KEY, { v: 1, cfg: G.cfg, turn: G.turn, players: G.players, missed: G.missed.slice(-30), at: Date.now() });
  }

  // ---------- the turn loop ----------

  const wantsSpeech = (p) => G.cfg.readAloud === 'on' || (G.cfg.readAloud === 'auto' && p.age <= 7);
  // A voice that has to fetch its audio (the studio voice) gets a head start while the pawn is still hopping.
  function prepareVoice(p, qp) {
    if (qp && root.WQVoice && wantsSpeech(p)) qp.then((q) => root.WQVoice.prefetchQuestion(q)).catch(() => {});
  }
  const profileOf = (p) => ({ id: p.id, age: p.age, level: p.level });
  const nextPlayer = (p) => G.players[(G.players.indexOf(p) + 1) % G.players.length];

  async function loop(tk) {
    try {
      await S(tk, delay(450));
      if (!store.get(HELP_KEY)) {
        store.set(HELP_KEY, 1);
        await S(tk, UI.help());
      }
    } catch (e) {
      if (e === CANCEL) return;
    }
    for (;;) {
      if (!alive(tk)) return;
      const p = G.players[G.turn];
      try {
        G.scene.setActive(p.id);
        UI.renderPlayers(G.players, G.cats, p.id);
        if (G.bannerFor !== p.id) {
          G.bannerFor = p.id;
          if (G.players.length > 1) {
            Sfx.play('turn');
            if (wantsSpeech(p)) UI.say(`${p.name}, it's your turn!`);
            await S(tk, UI.banner(`${p.name}'s turn`, p.color, p.avatar));
          }
        }
        const r = await takeTurn(p, tk);
        if (!alive(tk)) return;
        if (r === 'win') {
          await finish(p, tk);
          return;
        }
        if (r === 'next') G.turn = (G.turn + 1) % G.players.length;
        save();
      } catch (e) {
        if (e === CANCEL) return;
        console.error(e);
        UI.toast('Something hiccuped. Moving on to the next turn.', 'bad');
        G.scene.clearChoices();
        G.turn = (G.turn + 1) % G.players.length;
        await delay(800);
      }
    }
  }

  async function takeTurn(p, tk) {
    const hasAll = p.wedges.every(Boolean);
    if (hasAll && p.pos === G.layout.hub) {
      UI.setPrompt(p, `${p.name}, one right answer wins!`, 'Final question');
      await S(tk, delay(800));
      return finalQuestion(p, tk);
    }
    UI.setPrompt(p, `${p.name}, roll the die!`, hasAll ? 'You have every wedge. Race to the hub!' : G.rolled ? '' : 'Tap the die or press Space');
    const n = await S(tk, UI.rollDie());
    G.rolled = true;
    const options = L.destinations(G.layout, p.pos, n, hasAll);
    if (!options.size) {
      UI.toast('No moves from there. Next player!');
      await S(tk, delay(900));
      return 'next';
    }
    UI.setPrompt(p, `You rolled a ${n}. Pick a glowing space.`, hasAll ? 'Reach the hub to win!' : options.size > 1 ? 'Hover a space to see its topic' : '');
    G.scene.showChoices(options);
    G.focusIdx = null;
    $('#ui').classList.add('picking'); // fade the side panels so every glowing space is in view
    let dest;
    if (options.size === 1) {
      dest = options.keys().next().value;
      await S(tk, delay(900));
    } else {
      G.pickOptions = options;
      dest = await S(tk, new Promise((res) => (G.pickResolve = res)));
      G.pickOptions = null;
    }
    G.scene.clearChoices();
    $('#ui').classList.remove('picking');
    const node = G.layout.nodes[dest];
    // Start writing the question now so it is ready when the pawn lands.
    const qp = node.type === 'cat' || node.type === 'hq' ? G.svc.next(profileOf(p), node.cat) : null;
    prepareVoice(p, qp);
    UI.setPrompt(p, '', '');
    await S(tk, G.scene.movePawn(p.id, options.get(dest)));
    p.pos = dest;
    UI.tip(null);
    Sfx.play('land');
    if (node.type === 'roll') {
      G.scene.burst(dest, GOLD, 40, 1);
      UI.toast('Roll again!', 'good');
      Sfx.play('levelup');
      await S(tk, delay(1000));
      return 'again';
    }
    if (node.type === 'hub') return finalQuestion(p, tk);
    return resolveQuestion(p, node, qp, tk);
  }

  function onAnswered(p, ci, correct, q, nodeId) {
    p.stats.asked++;
    p.stats.by[ci].a++;
    let note = '';
    if (correct) {
      p.stats.correct++;
      p.stats.by[ci].c++;
      p.sc++;
      p.sw = 0;
      if (p.sc >= 2 && p.level < 5) {
        p.level++;
        p.sc = 0;
        note = `Level up! ${p.name}'s questions are now a little trickier.`;
        setTimeout(() => Sfx.play('levelup'), 700);
      }
      G.scene.burst(nodeId, G.cats[ci].color, 55, 1);
      G.scene.ripple(nodeId, G.cats[ci].color, 1.2);
    } else {
      p.sw++;
      p.sc = 0;
      if (p.sw >= 2 && p.level > 1) {
        p.level--;
        p.sw = 0;
      }
      G.missed.push({ emoji: G.cats[ci].emoji, q: q.q, answer: q.choices[q.answer], fact: q.fact, who: p.name });
      if (G.missed.length > 40) G.missed.shift();
    }
    UI.renderPlayers(G.players, G.cats, p.id);
    return { note };
  }

  async function resolveQuestion(p, node, qp, tk) {
    const cat = G.cats[node.cat];
    const isWedge = node.type === 'hq' && !p.wedges[node.cat];
    const next = nextPlayer(p);
    const res = await S(
      tk,
      UI.ask({
        player: p,
        cat,
        tag: node.type === 'hq' ? (isWedge ? 'Wedge space' : 'Wedge space · already won') : null,
        qPromise: qp,
        speak: wantsSpeech(p),
        onAnswer: (correct, q) => onAnswered(p, node.cat, correct, q, node.id),
        label: (correct) => (correct ? (isWedge ? 'Claim your wedge' : 'Roll again') : G.players.length > 1 ? `Next: ${next.name}` : 'Continue'),
      })
    );
    if (res.correct) {
      if (isWedge) await awardWedge(p, node, tk);
      return 'again';
    }
    return 'next';
  }

  async function awardWedge(p, node, tk) {
    p.wedges[node.cat] = true;
    G.scene.setWedges(p.id, p.wedges);
    G.scene.burst(node.id, G.cats[node.cat].color, 120, 1.5);
    G.scene.ripple(node.id, G.cats[node.cat].color, 1.8);
    G.scene.celebratePawn(p.id);
    Sfx.play('wedge');
    UI.renderPlayers(G.players, G.cats, p.id);
    await S(tk, UI.celebrateWedge({ player: p, cat: G.cats[node.cat], cats: G.cats, count: p.wedges.filter(Boolean).length, total: G.cats.length }));
    if (p.wedges.every(Boolean)) {
      UI.toast(`${p.name} has every wedge! Race to the hub!`, 'good');
      await S(tk, delay(900));
    }
  }

  async function finalQuestion(p, tk) {
    const others = G.players.length > 1;
    let ci;
    if (others) ci = await S(tk, UI.pickTopic({ chooser: nextPlayer(p), target: p, cats: G.cats }));
    else ci = Math.floor(Math.random() * G.cats.length);
    const qp = G.svc.next(profileOf(p), ci);
    prepareVoice(p, qp);
    const next = nextPlayer(p);
    const res = await S(
      tk,
      UI.ask({
        player: p,
        cat: G.cats[ci],
        tag: 'Final question',
        qPromise: qp,
        speak: wantsSpeech(p),
        onAnswer: (correct, q) => onAnswered(p, ci, correct, q, G.layout.hub),
        label: (correct) => (correct ? 'Claim victory!' : others ? `Next: ${next.name}` : 'Try again'),
      })
    );
    return res.correct ? 'win' : 'next';
  }

  async function finish(p, tk) {
    store.del(GAME_KEY);
    Sfx.play('win');
    G.scene.confetti(5200);
    G.scene.celebratePawn(p.id);
    G.scene.burst(G.layout.hub, GOLD, 160, 1.8);
    await S(tk, delay(1100));
    const choice = await S(tk, UI.victory({ winner: p, players: G.players, cats: G.cats, missed: G.missed, speak: wantsSpeech(p) }));
    if (choice === 'again') start(false);
    else toSetup();
  }

  // ---------- toolbar ----------

  function syncToolbar() {
    const set = (id, on, ico, offIco) => {
      const b = $(id);
      b.classList.toggle('off', !on);
      b.setAttribute('aria-pressed', String(on));
      b.replaceChildren(icon(on ? ico : offIco || ico));
    };
    set('#btnSound', G.cfg.sound, 'sound', 'mute');
    set('#btnGlow', G.cfg.glow, 'glow');
    set('#btnSpeak', G.cfg.readAloud !== 'off', 'speak');
  }

  function setOption(key, val) {
    G.cfg[key] = val;
    if (key === 'sound') Sfx.setMuted(!val);
    if (key === 'glow') G.scene.setGlow(val);
    store.set(SETUP_KEY, G.cfg);
    syncToolbar();
  }

  function wireToolbar() {
    $('#btnSound').addEventListener('click', () => {
      setOption('sound', !G.cfg.sound);
      Sfx.play('click');
    });
    $('#btnGlow').addEventListener('click', () => setOption('glow', !G.cfg.glow));
    $('#btnSpeak').addEventListener('click', () => {
      setOption('readAloud', G.cfg.readAloud === 'off' ? 'on' : 'off');
      UI.toast(G.cfg.readAloud === 'off' ? 'Questions will not be read aloud' : 'Questions will be read aloud', '');
    });
    $('#btnHelp').replaceChildren(icon('help'));
    $('#btnHelp').addEventListener('click', () => UI.help());
    const full = $('#btnFull');
    full.replaceChildren(icon('full'));
    if (!document.fullscreenEnabled) full.hidden = true;
    full.addEventListener('click', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      } catch (e) {
        /* optional */
      }
    });
    $('#btnMenu').replaceChildren(icon('menu'));
    $('#btnMenu').addEventListener('click', () =>
      UI.menu({
        cfg: G.cfg,
        onSound: (v) => setOption('sound', v),
        onGlow: (v) => setOption('glow', v),
        onRead: (v) => setOption('readAloud', v),
        onVoice: () => store.set(SETUP_KEY, G.cfg),
        onView: () => G.scene.resetView(),
        onRestart: async () => {
          if (await UI.confirm({ title: 'Restart this game?', body: 'Everyone goes back to the hub and all wedges are cleared.', yes: 'Restart', no: 'Keep playing' })) start(false);
        },
        onSetup: async () => {
          if (await UI.confirm({ title: 'Go back to setup?', body: 'Your game is saved, and you can continue it from the setup screen.', yes: 'Back to setup', no: 'Keep playing' })) {
            save();
            toSetup();
          }
        },
      })
    );
  }

  // Keyboard play: arrows or Tab cycle through the glowing spaces, Enter moves there.
  function wireKeys() {
    document.addEventListener('keydown', (e) => {
      if (!G.pickOptions || !G.pickResolve || !$('#modal').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
      const ids = [...G.pickOptions.keys()];
      const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey);
      const prev = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
      if (next || prev) {
        e.preventDefault();
        const i = G.focusIdx === null || G.focusIdx === undefined ? (next ? 0 : ids.length - 1) : (G.focusIdx + (next ? 1 : -1) + ids.length) % ids.length;
        G.focusIdx = i;
        G.scene.focusChoice(ids[i]);
        const text = describeNode(ids[i]);
        UI.tip(text, root.innerWidth / 2 - 80, root.innerHeight * 0.16);
        UI.announce(`${text}. Press Enter to move here.`);
      } else if ((e.key === 'Enter' || e.key === ' ') && G.focusIdx !== null && G.focusIdx !== undefined) {
        e.preventDefault();
        const r = G.pickResolve;
        const id = ids[G.focusIdx];
        G.focusIdx = null;
        G.pickResolve = null;
        UI.tip(null);
        r(id);
      }
    });
  }

  // ---------- boot ----------

  const setupHooks = {
    onChange: onSetupChange,
    onStart: () => start(false),
    onResume: () => start(true),
  };

  async function detectAi() {
    UI.setup.setAi('checking', 'Checking for the AI Quizmaster…');
    // Home-server edition: the server holds the Claude key and writes the questions.
    const home = root.WQStudio;
    if (home) {
      const st = await home.ready;
      const ai = st.online && st.status ? st.status.ai : null;
      G.sample = ai && ai.enabled ? home.sample : null;
      if (G.sample) UI.setup.setAi('on', `AI Quizmaster ready. Claude (${ai.model}) on your home server writes each question for the player’s age.`);
      else if (st.online) UI.setup.setAi('off', 'No Claude API key is set on the home server, so the game will use its built-in question pack.');
      else UI.setup.setAi('off', 'The home server could not be reached, so the game will use its built-in question pack.');
      return;
    }
    let sample = null;
    try {
      if (root.claude && typeof root.claude.use === 'function') sample = await root.claude.use('sample');
    } catch (e) {
      sample = null;
    }
    G.sample = typeof sample === 'function' ? sample : null;
    if (G.sample) UI.setup.setAi('on', 'AI Quizmaster ready. Claude writes each question for the player’s age. You will be asked for permission once when the game starts.');
    else UI.setup.setAi('off', 'The AI Quizmaster is not available here, so the game will use its built-in question pack.');
  }

  function boot(data) {
    if (G.booted) return;
    G.booted = true;
    G.cfg = loadCfg();
    if (root.WQVoice) root.WQVoice.setPref({ uri: G.cfg.voice, speed: G.cfg.voiceSpeed });
    G.scene = new root.WQScene.BoardScene($('#gl'), {
      onPick(id) {
        if (G.pickOptions && G.pickResolve && G.pickOptions.has(id)) {
          const r = G.pickResolve;
          G.pickResolve = null;
          r(id);
        }
      },
      onHover(id, x, y) {
        if (id < 0 || G.mode === 'setup') UI.tip(null);
        else UI.tip(describeNode(id), x, y);
      },
      onHop(i) {
        Sfx.play('hop', i);
      },
      onQuality(level) {
        UI.toast(level >= 3 ? 'Neon glow turned off to keep things smooth' : 'Lowered the detail a little to keep things smooth');
        if (level >= 3) {
          G.cfg.glow = false;
          syncToolbar();
        }
      },
    });
    if (!G.scene.ok) {
      $('#fallback').hidden = false;
      return;
    }
    UI.initDie();
    wireToolbar();
    wireKeys();
    rebuildPreview();
    G.scene.setMode('preview');
    G.scene.setGlow(G.cfg.glow);
    Sfx.setMuted(!G.cfg.sound);
    UI.setup.show(G.cfg, setupHooks);
    updateResume();
    applyInsets();
    // Re-centre the board whenever the window (or the pane holding it) changes size.
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => applyInsets()).observe($('#ui'));
    else root.addEventListener('resize', () => requestAnimationFrame(applyInsets));
    G.aiCheck = detectAi();
    if (data && data.game && validSaved(data.game, L.generate(clamp((data.game.cfg || {}).n | 0, 3, 8)))) {
      store.set(GAME_KEY, data.game);
      updateResume();
    }
  }

  const hot = root.claude && root.claude.hot;
  try {
    if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ game: G.mode === 'play' ? { v: 1, cfg: G.cfg, turn: G.turn, players: G.players, missed: G.missed.slice(-30) } : null }));
  } catch (e) {
    /* hot reload hook is optional */
  }
  try {
    if (hot && typeof hot.ready === 'function') hot.ready(boot);
    else boot((hot && hot.data) || {});
  } catch (e) {
    boot({});
  }
})(typeof window !== 'undefined' ? window : globalThis);
