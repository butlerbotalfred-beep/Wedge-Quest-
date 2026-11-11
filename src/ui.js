// Interface helpers and the setup screen.
(function (root) {
  'use strict';

  const T = root.WQTheme;
  const UI = (root.WQUI = root.WQUI || {});

  const $ = (sel, el) => (el || document).querySelector(sel);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k.startsWith('--')) el.style.setProperty(k, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function lighten(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(c + (255 - c) * t);
    return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
  }

  // Stroke icons, 24x24. Static markup only.
  const ICONS = {
    sound: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    mute: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9 5 6m0-6-5 6"/>',
    glow: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    speak: '<path d="M4 4h16v12H8l-4 4V4z"/><path d="M8 9h8M8 12h5"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    view: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  };
  function icon(name) {
    const s = document.createElement('span');
    s.className = 'ico';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return s;
  }

  // ---------- toasts, tooltip, announcements ----------

  UI.toast = function (msg, kind) {
    const host = $('#toasts');
    if (!host) return;
    const el = h('div', { class: 'toast ' + (kind || '') }, msg);
    host.append(el);
    setTimeout(() => el.classList.add('out'), 2300);
    setTimeout(() => el.remove(), 2800);
    while (host.children.length > 3) host.firstChild.remove();
  };

  UI.announce = function (msg) {
    const live = $('#live');
    if (live) live.textContent = msg;
  };

  UI.tip = function (text, x, y) {
    const el = $('#tip');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.hidden = false;
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 14)) + 'px';
    el.style.top = Math.max(8, Math.min(innerHeight - hgt - 8, y + 16)) + 'px';
  };

  // ---------- modal stack ----------

  const stack = [];
  UI.modal = function (card, opts) {
    opts = opts || {};
    const host = $('#modal');
    const overlay = h('div', { class: 'overlay ' + (opts.cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label || 'Dialog' }, card);
    const entry = { overlay, dismissable: opts.dismissable !== false, onClose: opts.onClose };
    host.hidden = false;
    host.append(overlay);
    stack.push(entry);
    if (entry.dismissable) {
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) close();
      });
    }
    function close() {
      const i = stack.indexOf(entry);
      if (i < 0) return;
      stack.splice(i, 1);
      overlay.classList.add('leaving');
      setTimeout(() => {
        overlay.remove();
        if (!stack.length) host.hidden = true;
      }, 160);
      if (entry.onClose) entry.onClose();
    }
    entry.close = close;
    return { close, overlay };
  };

  UI.closeAllModals = function () {
    for (const e of [...stack]) e.close();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) {
      const top = stack[stack.length - 1];
      if (top.dismissable) top.close();
    }
  });

  UI.confirm = function (o) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        m.close();
        resolve(v);
      };
      const card = h('div', { class: 'sheet small' }, h('h2', { class: 'sheet-title', text: o.title }), h('p', { class: 'sheet-body', text: o.body }), h('div', { class: 'sheet-actions' }, h('button', { class: 'btn ghost', onclick: () => finish(false), text: o.no || 'Cancel' }), h('button', { class: 'btn primary', onclick: () => finish(true), text: o.yes || 'OK' })));
      const m = UI.modal(card, { label: o.title, onClose: () => finish(false) });
    });
  };

  // ---------- setup screen ----------

  const FALLBACK_EMOJI = ['⭐', '🎯', '🌟', '💫', '🔮', '🧩', '🎲', '🪄'];
  const ideaFor = (name) => T.TOPIC_IDEAS.find((i) => i.name.toLowerCase() === String(name).trim().toLowerCase());

  UI.defaultConfig = function () {
    return {
      n: 6,
      topics: T.DEFAULT_TOPICS.map((name, i) => ({ name, emoji: (ideaFor(name) || {}).emoji || FALLBACK_EMOJI[i], manual: false })),
      players: [
        { name: 'Player 1', age: 9, avatar: T.AVATARS[0] },
        { name: 'Player 2', age: 38, avatar: T.AVATARS[1] },
      ],
      difficulty: 0,
      sound: true,
      glow: true,
      readAloud: 'auto',
      voice: '',
      voiceSpeed: 'normal',
    };
  };

  // A row of exclusive choices (pressed button = current value).
  function segControl(options, get, set) {
    const wrap = h('div', { class: 'seg', role: 'group' });
    const paint = () => [...wrap.children].forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === get())));
    options.forEach(([val, label]) => wrap.append(h('button', { class: 'seg-btn', type: 'button', onclick: () => { set(val); paint(); } }, label)));
    paint();
    return wrap;
  }
  UI.seg = segControl;

  // Voice picker, speed and a "Try it" button. Shared by setup and the game menu.
  const PREVIEW = ["Hi, I'm your Quizmaster! Which planet is known as the Red Planet?", 350, 'A, Venus.', 180, 'B, Mars.', 180, 'C, Jupiter.'];
  let voiceSeq = 0;
  const liveVoiceBoxes = new Set();
  let voiceWatching = false;
  UI.voiceControls = function (cfg, onChange) {
    const V = root.WQVoice;
    const box = h('div', { class: 'voice-box' });
    if (!V || !V.supported) {
      box.append(h('p', { class: 'voice-note', text: 'Reading aloud is not available in this browser.' }));
      return box;
    }
    const id = `voiceSel${++voiceSeq}`;
    const sel = h('select', {
      class: 'select',
      id,
      'aria-label': 'Reading voice',
      onchange: (e) => {
        cfg.voice = e.target.value;
        V.setPref({ uri: cfg.voice });
        if (onChange) onChange();
      },
    });
    const note = h('p', { class: 'voice-note' });
    const fill = () => {
      const list = V.list();
      const cur = V.current();
      sel.replaceChildren(
        h('option', { value: '', text: cur ? `Best available: ${cur.name}` : 'Default voice' }),
        ...list.map((x) => h('option', { value: x.uri, text: `${x.name} · ${x.label}` }))
      );
      sel.value = list.some((x) => x.uri === cfg.voice) ? cfg.voice : '';
      note.textContent = V.tip();
    };
    fill();
    // Voices can arrive late; refresh every picker that is still on screen.
    liveVoiceBoxes.add({ box, fill });
    if (!voiceWatching) {
      voiceWatching = true;
      V.onChange(() => {
        for (const e of [...liveVoiceBoxes]) {
          if (e.box.isConnected) e.fill();
          else liveVoiceBoxes.delete(e);
        }
      });
    }
    box.append(
      h('div', { class: 'opt-row' },
        h('label', { class: 'opt-label', for: id, text: 'Reading voice' }),
        h('div', { class: 'voice-pick' }, sel, h('button', { class: 'btn ghost small', type: 'button', onclick: () => V.say(PREVIEW) }, icon('speak'), 'Try it'))
      ),
      h('div', { class: 'opt-row' },
        h('span', { class: 'opt-label', text: 'Speed' }),
        segControl([['slow', 'Slower'], ['normal', 'Normal'], ['fast', 'Faster']], () => cfg.voiceSpeed, (v) => {
          cfg.voiceSpeed = v;
          V.setPref({ speed: v });
          if (onChange) onChange();
          V.say(['Which planet is known as the Red Planet?']);
        })
      ),
      note
    );
    return box;
  };

  UI.setup = (function () {
    let cfg = null;
    let hooks = {};
    let activeSlot = 0;
    let popClose = null;
    const refs = {};

    function change(kind) {
      if (hooks.onChange) hooks.onChange(kind);
    }

    function closePop() {
      if (popClose) popClose();
      popClose = null;
    }

    function openEmojiPop(anchor, current, onPick) {
      closePop();
      const pop = h('div', { class: 'emoji-pop', role: 'listbox', 'aria-label': 'Pick an icon' });
      for (const e of T.EMOJI_CHOICES) {
        pop.append(
          h('button', { class: 'emoji-opt' + (e === current ? ' on' : ''), type: 'button', 'aria-label': e, onclick: () => { onPick(e); closePop(); } }, e)
        );
      }
      refs.panel.append(pop);
      const pr = refs.panel.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(pr.width - pop.offsetWidth - 8, ar.left - pr.left));
      let top = ar.bottom - pr.top + 6;
      if (top + pop.offsetHeight > pr.height - 8) top = Math.max(8, ar.top - pr.top - pop.offsetHeight - 6);
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
      const outside = (ev) => {
        if (!pop.contains(ev.target) && ev.target !== anchor) closePop();
      };
      setTimeout(() => document.addEventListener('pointerdown', outside), 0);
      popClose = () => {
        document.removeEventListener('pointerdown', outside);
        pop.remove();
      };
    }

    function renderPlayers() {
      const ul = refs.players;
      ul.replaceChildren();
      cfg.players.forEach((p, i) => {
        const color = T.PLAYER_COLORS[i % T.PLAYER_COLORS.length];
        const age = h('input', {
          class: 'age-input',
          type: 'number',
          inputmode: 'numeric',
          min: 4,
          max: 99,
          value: p.age,
          id: `age${i}`,
          'aria-label': `${p.name} age`,
          oninput: (e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) {
              p.age = Math.max(4, Math.min(99, v));
              change('players');
            }
          },
          onblur: (e) => {
            e.target.value = p.age;
          },
        });
        const bump = (d) => {
          p.age = Math.max(4, Math.min(99, p.age + d));
          age.value = p.age;
          change('players');
        };
        ul.append(
          h(
            'li',
            { class: 'prow', '--pc': color },
            h('button', {
              class: 'pav',
              type: 'button',
              'aria-label': `Change avatar for ${p.name}`,
              onclick: (e) => {
                openEmojiPop(e.currentTarget, p.avatar, (em) => {
                  p.avatar = em;
                  renderPlayers();
                  change('players');
                });
              },
            }, p.avatar),
            h('input', { class: 'pin', id: `pname${i}`, type: 'text', maxlength: 14, value: p.name, placeholder: `Player ${i + 1}`, 'aria-label': `Player ${i + 1} name`, oninput: (e) => { p.name = e.target.value; change('players'); } }),
            h('div', { class: 'age' },
              h('button', { class: 'step', type: 'button', 'aria-label': 'Younger', onclick: () => bump(-1) }, icon('minus')),
              age,
              h('button', { class: 'step', type: 'button', 'aria-label': 'Older', onclick: () => bump(1) }, icon('plus')),
              h('span', { class: 'yrs', text: 'yrs' })
            ),
            h('button', {
              class: 'x',
              type: 'button',
              'aria-label': `Remove ${p.name}`,
              disabled: cfg.players.length <= 1,
              onclick: () => {
                cfg.players.splice(i, 1);
                renderPlayers();
                change('players');
              },
            }, icon('close'))
          )
        );
      });
      refs.addPlayer.hidden = cfg.players.length >= 6;
    }

    function renderTopics() {
      const ul = refs.topics;
      ul.replaceChildren();
      refs.nVal.textContent = cfg.n;
      refs.nMinus.disabled = cfg.n <= 3;
      refs.nPlus.disabled = cfg.n >= 8;
      for (let i = 0; i < cfg.n; i++) {
        const t = cfg.topics[i];
        const color = T.PALETTE[i];
        const input = h('input', {
          class: 'tname',
          id: `topic${i}`,
          type: 'text',
          maxlength: 24,
          value: t.name,
          placeholder: 'Any topic…',
          'aria-label': `Topic ${i + 1}`,
          onfocus: () => {
            activeSlot = i;
            refs.topics.querySelectorAll('.tcard').forEach((c, k) => c.classList.toggle('active', k === i));
          },
          oninput: (e) => {
            t.name = e.target.value;
            if (!t.manual) {
              const idea = ideaFor(t.name);
              const em = idea ? idea.emoji : FALLBACK_EMOJI[i];
              if (em !== t.emoji) {
                t.emoji = em;
                card.querySelector('.temoji').textContent = em;
                change('emoji');
              }
            }
            change('topic');
            renderIdeas();
          },
        });
        const card = h(
          'li',
          { class: 'tcard' + (i === activeSlot ? ' active' : ''), '--c': color },
          h('button', {
            class: 'temoji',
            type: 'button',
            'aria-label': `Change icon for topic ${i + 1}`,
            onclick: (e) => {
              const btn = e.currentTarget;
              openEmojiPop(btn, t.emoji, (em) => {
                t.emoji = em;
                t.manual = true;
                btn.textContent = em;
                change('emoji');
              });
            },
          }, t.emoji),
          input
        );
        ul.append(card);
      }
      renderIdeas();
    }

    function renderIdeas() {
      const used = new Set(cfg.topics.slice(0, cfg.n).map((t) => t.name.trim().toLowerCase()));
      refs.ideas.replaceChildren(
        ...T.TOPIC_IDEAS.filter((i) => !used.has(i.name.toLowerCase())).map((i) =>
          h('button', {
            class: 'idea',
            type: 'button',
            onclick: () => {
              const slot = Math.min(activeSlot, cfg.n - 1);
              cfg.topics[slot] = { name: i.name, emoji: i.emoji, manual: false };
              activeSlot = (slot + 1) % cfg.n;
              renderTopics();
              change('emoji');
              change('topic');
            },
          }, `${i.emoji} ${i.name}`)
        )
      );
    }

    function shuffleTopics() {
      const pool = T.TOPIC_IDEAS.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      for (let i = 0; i < 8; i++) cfg.topics[i] = { name: pool[i].name, emoji: pool[i].emoji, manual: false };
      renderTopics();
      change('emoji');
      change('topic');
    }

    const seg = segControl;

    function toggle(id, label, get, set) {
      const input = h('input', { type: 'checkbox', id, class: 'switch', checked: get() ? true : null, onchange: (e) => set(e.target.checked) });
      return h('label', { class: 'toggle', for: id }, input, h('span', { class: 'track' }), h('span', { class: 'toggle-label', text: label }));
    }

    function build() {
      refs.players = h('ul', { class: 'players' });
      refs.addPlayer = h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
        const i = cfg.players.length;
        const used = new Set(cfg.players.map((p) => p.avatar));
        cfg.players.push({ name: `Player ${i + 1}`, age: 10, avatar: T.AVATARS.find((a) => !used.has(a)) || T.AVATARS[i % T.AVATARS.length] });
        renderPlayers();
        change('players');
      } }, icon('plus'), 'Add player');
      refs.nVal = h('output', { class: 'n-val', for: 'nMinus nPlus' });
      refs.nMinus = h('button', { class: 'step big', id: 'nMinus', type: 'button', 'aria-label': 'Fewer wedges', onclick: () => { cfg.n = Math.max(3, cfg.n - 1); activeSlot = Math.min(activeSlot, cfg.n - 1); renderTopics(); change('n'); } }, icon('minus'));
      refs.nPlus = h('button', { class: 'step big', id: 'nPlus', type: 'button', 'aria-label': 'More wedges', onclick: () => { cfg.n = Math.min(8, cfg.n + 1); renderTopics(); change('n'); } }, icon('plus'));
      refs.topics = h('ul', { class: 'topics' });
      refs.ideas = h('div', { class: 'ideas' });
      refs.start = h('button', { class: 'btn primary big', type: 'button', onclick: () => hooks.onStart && hooks.onStart() }, 'Start game');
      refs.resume = h('button', { class: 'btn ghost', type: 'button', hidden: true, onclick: () => hooks.onResume && hooks.onResume() }, 'Continue last game');
      refs.ai = h('p', { class: 'ai-note' });

      refs.scroll = h(
        'div',
        { class: 'setup-scroll' },
        h('header', { class: 'logo' },
          h('div', { class: 'logo-row' }, h('span', { class: 'brand-mark big', 'aria-hidden': 'true' }), h('h1', { class: 'logo-text' }, h('span', { class: 'l1', text: 'Wedge' }), h('span', { class: 'l2', text: 'Quest' }))),
          h('p', { class: 'tag', text: 'Roll, race around the board and win a wedge in every topic. Every question is written for the player answering it.' })
        ),
        h('section', { class: 'block' },
          h('div', { class: 'block-head' }, h('h2', { text: 'Players' }), h('span', { class: 'hint', text: 'Set real ages. Questions match each one.' })),
          refs.players,
          refs.addPlayer
        ),
        h('section', { class: 'block' },
          h('div', { class: 'block-head' }, h('h2', { text: 'Board' })),
          h('div', { class: 'wedge-row' },
            h('div', { class: 'wedge-label' }, h('strong', { text: 'Wedges' }), h('span', { text: 'One topic for each' })),
            h('div', { class: 'stepper' }, refs.nMinus, refs.nVal, refs.nPlus)
          ),
          refs.topics,
          h('div', { class: 'ideas-head' }, h('span', { text: 'Tap an idea to drop it into the highlighted slot' }), h('button', { class: 'btn ghost small', type: 'button', onclick: shuffleTopics }, icon('shuffle'), 'Surprise me')),
          refs.ideas
        ),
        h('section', { class: 'block' },
          h('div', { class: 'block-head' }, h('h2', { text: 'Game feel' })),
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: 'Question difficulty' }),
            seg([[-1, 'Easier'], [0, 'Just right'], [1, 'Harder']], () => cfg.difficulty, (v) => { cfg.difficulty = v; change('options'); })),
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: 'Read questions aloud' }),
            seg([['auto', 'Young kids'], ['on', 'Always'], ['off', 'Never']], () => cfg.readAloud, (v) => { cfg.readAloud = v; change('options'); })),
          UI.voiceControls(cfg, () => change('options')),
          h('div', { class: 'opt-row toggles' },
            toggle('optSound', 'Sound effects', () => cfg.sound, (v) => { cfg.sound = v; change('options'); }),
            toggle('optGlow', 'Neon glow', () => cfg.glow, (v) => { cfg.glow = v; change('options'); }))
        )
      );

      refs.panel = h('div', { class: 'setup-panel' }, refs.scroll, h('footer', { class: 'setup-foot' }, h('div', { class: 'foot-buttons' }, refs.start, refs.resume), refs.ai));
      refs.root = $('#setup');
      refs.root.replaceChildren(refs.panel);
      refs.scroll.addEventListener('scroll', closePop, { passive: true });
    }

    return {
      show(config, hk) {
        cfg = config;
        hooks = hk || {};
        if (!refs.panel) build();
        renderPlayers();
        renderTopics();
        refs.root.hidden = false;
        refs.root.classList.remove('leaving');
      },
      hide() {
        closePop();
        refs.root.classList.add('leaving');
        setTimeout(() => {
          if (refs.root.classList.contains('leaving')) refs.root.hidden = true;
        }, 260);
      },
      refresh() {
        if (!refs.panel) return;
        renderPlayers();
        renderTopics();
      },
      setResume(label) {
        if (!refs.resume) return;
        refs.resume.hidden = !label;
        if (label) refs.resume.textContent = label;
      },
      setAi(state, text) {
        if (!refs.ai) return;
        refs.ai.className = 'ai-note ' + state;
        refs.ai.textContent = text;
      },
      panelWidth() {
        return refs.panel ? refs.panel.getBoundingClientRect().width : 0;
      },
    };
  })();

  UI.$ = $;
  UI.h = h;
  UI.icon = icon;
  UI.hexA = hexA;
  UI.lighten = lighten;
})(typeof window !== 'undefined' ? window : globalThis);
