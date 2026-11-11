// In-game interface: scoreboard, die, question card, dialogs.
(function (root) {
  'use strict';

  const UI = root.WQUI;
  const Sfx = root.WQSfx;
  const { $, h, icon, hexA, lighten } = UI;
  const TAU = Math.PI * 2;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const PRAISE = ['Correct!', 'Nailed it!', 'Brilliant!', 'You got it!', 'Boom!', 'Smart cookie!', 'Yes!'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------- speech (see voice.js) ----------

  UI.say = function (parts) {
    return root.WQVoice ? root.WQVoice.say(parts) : Promise.resolve();
  };
  UI.speak = UI.say;
  UI.stopSpeak = function () {
    if (root.WQVoice) root.WQVoice.stop();
  };

  // ---------- HUD ----------

  UI.setHud = function (on) {
    for (const id of ['topbar', 'side', 'dock']) {
      const el = $('#' + id);
      if (el) el.hidden = !on;
    }
  };

  function pieSvg(cats, flags) {
    const n = cats.length;
    const pt = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    let out = '';
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (TAU * i) / n + 0.05;
      const a1 = -Math.PI / 2 + (TAU * (i + 1)) / n - 0.05;
      const d = `M ${pt(47, a0)} A 47 47 0 0 1 ${pt(47, a1)} L ${pt(25, a1)} A 25 25 0 0 0 ${pt(25, a0)} Z`;
      const on = flags[i];
      out += `<path d="${d}" fill="${on ? cats[i].color : 'rgba(8,12,60,0.55)'}" stroke="${on ? '#fff' : cats[i].color}" stroke-opacity="${on ? 0.95 : 0.85}" stroke-width="${on ? 2.5 : 3}"${on ? ' class="lit"' : ''}/>`;
    }
    const s = document.createElement('span');
    s.className = 'pie';
    s.innerHTML = `<svg viewBox="-50 -50 100 100" aria-hidden="true">${out}</svg>`;
    return s;
  }
  UI.pieSvg = pieSvg;

  UI.renderPlayers = function (players, cats, activeId) {
    const host = $('#players');
    if (!host) return;
    host.replaceChildren(
      ...players.map((p) => {
        const got = p.wedges.filter(Boolean).length;
        const acc = p.stats.asked ? `${p.stats.correct} of ${p.stats.asked} right` : 'No questions yet';
        return h(
          'div',
          { class: 'pcard' + (p.id === activeId ? ' active' : ''), '--pc': p.color, '--pc-glow': hexA(p.color, 0.5), 'data-id': p.id },
          h('div', { class: 'avatar', text: p.avatar }),
          h('div', { class: 'pinfo' }, h('div', { class: 'pname', text: p.name }), h('div', { class: 'pmeta' }, h('span', { class: 'pm-age', text: `Age ${p.age} · ` }), `Lv ${p.level}`), h('div', { class: 'pacc', text: acc })),
          h('div', { class: 'pwedges' }, pieSvg(cats, p.wedges), h('span', { class: 'pcount' }, h('b', { text: got }), `/${cats.length}`))
        );
      })
    );
  };

  UI.renderLegend = function (cats) {
    const host = $('#legend');
    if (!host) return;
    host.replaceChildren(
      ...cats.map((c) => h('span', { class: 'lg', '--c': c.color }, h('i', { class: 'lg-dot' }), h('span', { class: 'lg-e', text: c.emoji }), h('span', { class: 'lg-n', text: c.name })))
    );
  };

  UI.setPrompt = function (player, text, sub) {
    const el = $('#prompt');
    if (!el) return;
    el.replaceChildren(
      ...[
        text && player ? h('span', { class: 'pr-av', '--pc': player.color, text: player.avatar }) : null,
        text ? h('span', { class: 'pr-text' }, h('strong', { text }), sub ? h('small', { text: sub }) : null) : null,
      ].filter(Boolean)
    );
    UI.announce(text + (sub ? '. ' + sub : ''));
  };

  // Why the AI Quizmaster switched itself off (only the home-server edition has these reasons).
  const AI_OFF = {
    no_key: 'No Claude API key is set on the home server, so the game is using its built-in question pack.',
    bad_key: 'Claude did not accept the API key on the home server, so the game is using its built-in question pack.',
    bad_model: 'Claude does not know the model name set on the home server, so the game is using its built-in question pack.',
    billing: 'The Anthropic account behind the API key has no credit left, so the game is using its built-in question pack.',
    budget: 'The daily question limit on the home server was reached, so the game is using its built-in question pack for now.',
    network: 'The home server could not reach Claude, so the game is using its built-in question pack.',
  };

  UI.setAi = function (s) {
    const chip = $('#aiChip');
    const txt = $('#aiText');
    if (!chip || !txt) return;
    chip.className = 'chip ' + (s.ai ? (s.busy ? 'busy' : 'on') : 'off');
    txt.textContent = s.ai ? (s.busy ? `AI Quizmaster writing${s.ready ? ' · ' + s.ready + ' ready' : '…'}` : `AI Quizmaster · ${s.ready} ready`) : 'Built-in questions';
    chip.title = s.ai ? 'Questions are written by Claude for each player\'s age.' : AI_OFF[s.reason] || 'The AI Quizmaster is not available right now, so the game uses its built-in question pack.';
  };

  UI.banner = function (text, color, avatar) {
    const el = h('div', { class: 'banner', '--c': color || '#ffd21f' }, avatar ? h('span', { class: 'banner-av', text: avatar }) : null, h('span', { text }));
    $('#ui').append(el);
    setTimeout(() => el.remove(), 1500);
    return delay(900);
  };

  // ---------- the die ----------

  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const ORIENT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, -180] };
  let rx = -24;
  let ry = 32;
  let cube = null;

  UI.initDie = function () {
    const die = $('#die');
    cube = h('div', { class: 'cube' });
    for (let f = 1; f <= 6; f++) {
      const face = h('div', { class: 'face f' + f });
      for (let c = 0; c < 9; c++) face.append(h('i', { class: PIPS[f].includes(c) ? 'pip' : 'pip off' }));
      cube.append(face);
    }
    die.replaceChildren(cube);
    cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  };

  let rollCleanup = null;

  // Drop a pending roll (new game, back to setup) without resolving it.
  UI.cancelRoll = function () {
    if (rollCleanup) rollCleanup();
    rollCleanup = null;
    const die = $('#die');
    if (die) {
      die.classList.remove('ready', 'rolling', 'landed');
      die.disabled = true;
    }
  };

  UI.rollDie = function () {
    UI.cancelRoll();
    return new Promise((resolve) => {
      const die = $('#die');
      die.disabled = false;
      die.classList.add('ready');
      let used = false;
      const key = (e) => {
        if ((e.key === ' ' || e.key === 'Enter') && $('#modal').hidden && $('#setup').hidden) {
          e.preventDefault();
          go();
        }
      };
      const cleanup = () => {
        die.removeEventListener('click', go);
        document.removeEventListener('keydown', key);
      };
      rollCleanup = cleanup;
      function go() {
        if (used) return;
        used = true;
        cleanup();
        rollCleanup = null;
        die.classList.remove('ready');
        die.disabled = true;
        const v = 1 + Math.floor(Math.random() * 6);
        Sfx.play('roll');
        const o = ORIENT[v];
        rx = Math.ceil((rx + 540) / 360) * 360 + o[0];
        ry = Math.ceil((ry + 720) / 360) * 360 + o[1];
        cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
        die.classList.add('rolling');
        setTimeout(() => {
          die.classList.remove('rolling');
          die.classList.add('landed');
          Sfx.play('land');
          setTimeout(() => die.classList.remove('landed'), 450);
          resolve(v);
        }, 1250);
      }
      die.addEventListener('click', go);
      document.addEventListener('keydown', key);
    });
  };

  // ---------- question card ----------

  // Faint topic symbols scattered over the card, like the maths signs behind a maths question.
  const DECOR = [[56, 4, -12], [70, 20, 10], [84, 6, 16], [40, 30, -8], [90, 34, -16], [62, 44, 8], [26, 8, 12]];

  // o: { player, cat, tag, qPromise, speak, onAnswer(correct, q) -> {note}, label(correct) }
  UI.ask = function (o) {
    return new Promise((resolve) => {
      const V = root.WQVoice;
      const c = o.cat.color;
      const speakBtn = h('button', { class: 'qspeak', type: 'button', 'aria-label': 'Read the question aloud', disabled: true }, icon('speak'));
      const srcTag = h('span', { class: 'qsrc', hidden: true });
      const head = h(
        'header',
        { class: 'qhead' },
        h('span', { class: 'qicon', 'aria-hidden': 'true', text: o.cat.emoji }),
        h('div', { class: 'qmeta' }, h('div', { class: 'qcat', text: o.cat.name }), h('div', { class: 'qwho' }, h('span', { text: `${o.player.avatar} ${o.player.name} · Lv ${o.player.level}` }), srcTag)),
        o.tag ? h('span', { class: 'qtag', text: o.tag }) : null,
        speakBtn
      );
      const decor = h('div', { class: 'qdecor', 'aria-hidden': 'true' }, DECOR.map(([x, y, r]) => h('span', { style: `left:${x}%;top:${y}%;--r:${r}deg`, text: o.cat.emoji })));
      const loadText = h('p', { text: 'The Quizmaster is writing a question just for you…' });
      const main = h('div', { class: 'qmain' }, h('div', { class: 'qload' }, h('div', { class: 'orbs' }, h('i'), h('i'), h('i')), loadText));
      const mascot = h('div', { class: 'qmascot', 'aria-hidden': 'true' }, h('span', { class: 'm-bulb', text: '💡' }), h('span', { class: 'm-face', text: o.player.avatar }), h('div', { class: 'm-board' }, h('span', { text: '?' })));
      const foot = h('footer', { class: 'qfoot', hidden: true });
      const card = h(
        'article',
        { class: 'qcard', '--cat': c, '--cat-2': lighten(c, 0.4), '--cat-soft': hexA(c, 0.16), '--cat-glow': hexA(c, 0.55) },
        head,
        h('div', { class: 'qbody' }, decor, main, mascot),
        foot
      );
      let answered = false;
      let buttons = [];
      let q = null;
      let keyHandler = null;
      // If the card is torn down (restart, back to setup) drop its key listener and voice.
      const m = UI.modal(card, {
        dismissable: false,
        label: `${o.cat.name} question for ${o.player.name}`,
        cls: 'q',
        onClose: () => {
          if (keyHandler) document.removeEventListener('keydown', keyHandler);
          clearTimeout(slow);
          UI.stopSpeak();
        },
      });
      Sfx.play('pop');
      const slow = setTimeout(() => { loadText.textContent = 'Still writing… good questions take a moment.'; }, 6000);

      const readAloud = () => {
        if (q && V) V.question(q);
      };
      speakBtn.addEventListener('click', readAloud);

      function choose(i) {
        if (answered || !q) return;
        answered = true;
        UI.stopSpeak();
        document.removeEventListener('keydown', keyHandler);
        const correct = i === q.answer;
        buttons.forEach((b, k) => {
          b.disabled = true;
          if (k === q.answer) b.classList.add('correct');
          else if (k === i) b.classList.add('wrong');
          else b.classList.add('dim');
        });
        Sfx.play(correct ? 'correct' : 'wrong');
        const extra = (o.onAnswer && o.onAnswer(correct, q)) || {};
        const praise = correct ? pick(PRAISE) : 'Not quite!';
        const verdict = h('div', { class: 'verdict ' + (correct ? 'good' : 'bad') },
          h('span', { class: 'v-mark', 'aria-hidden': 'true', text: correct ? '✓' : '✗' }),
          h('div', null,
            h('strong', { text: praise }),
            correct ? null : h('span', { class: 'v-ans', text: ` The answer is ${q.choices[q.answer]}.` })
          )
        );
        const cont = h('button', { class: 'btn primary', type: 'button', onclick: () => { m.close(); resolve({ correct, chosen: i, q }); } }, o.label ? o.label(correct) : 'Continue');
        foot.replaceChildren(
          ...[
            verdict,
            q.fact ? h('p', { class: 'fact' }, h('b', { text: 'Did you know? ' }), q.fact) : null,
            extra.note ? h('p', { class: 'note', text: extra.note }) : null,
            cont,
          ].filter(Boolean)
        );
        foot.hidden = false;
        UI.announce((correct ? 'Correct. ' : 'Not quite. The answer is ' + q.choices[q.answer] + '. ') + (q.fact || ''));
        // Players who are not reading yet hear the verdict and the fun fact too.
        if (o.speak && V) V.say([praise, 160, correct ? '' : `The answer is ${q.choices[q.answer]}.`, 300, q.fact ? `Did you know? ${q.fact}` : '']);
        setTimeout(() => {
          cont.focus({ preventScroll: true });
          foot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 80);
      }

      o.qPromise.then((question) => {
        clearTimeout(slow);
        q = question;
        UI.lastQuestion = q; // for tests
        const list = h('div', { class: 'answers', role: 'group', 'aria-label': 'Answers' });
        buttons = q.choices.map((t, i) => h('button', { class: 'ans', type: 'button', onclick: () => choose(i) }, h('span', { class: 'key', text: 'ABCD'[i] }), h('span', { class: 'txt', text: t })));
        list.append(...buttons);
        main.replaceChildren(h('p', { class: 'qtext', text: q.q }), list);
        speakBtn.disabled = false;
        srcTag.textContent = q.source === 'bank' ? (q.generic ? 'General question' : 'Built-in') : '✨ AI-written';
        srcTag.hidden = false;
        keyHandler = (e) => {
          const k = e.key.toLowerCase();
          if (k.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
          const i = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
          if (i >= 0) choose(i);
        };
        document.addEventListener('keydown', keyHandler);
        if (o.speak) readAloud();
        buttons[0].focus({ preventScroll: true });
      });
    });
  };

  // ---------- topic picker for the final question ----------

  UI.pickTopic = function (o) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (i) => {
        if (done) return;
        done = true;
        m.close();
        resolve(i);
      };
      const grid = h('div', { class: 'topic-grid' },
        o.cats.map((c, i) => h('button', { class: 'topic-btn', type: 'button', '--c': c.color, '--c-glow': hexA(c.color, 0.5), onclick: () => finish(i) }, h('span', { class: 'te', text: c.emoji }), h('span', { text: c.name })))
      );
      const card = h('div', { class: 'sheet' },
        h('p', { class: 'eyebrow', text: 'Final question' }),
        h('h2', { class: 'sheet-title', text: `${o.chooser.name}, pick a topic for ${o.target.name}` }),
        h('p', { class: 'sheet-body', text: `${o.target.name} has every wedge! One right answer wins the game.` }),
        grid,
        h('div', { class: 'sheet-actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(Math.floor(Math.random() * o.cats.length)) }, icon('shuffle'), 'Surprise us'))
      );
      const m = UI.modal(card, { dismissable: false, label: 'Pick the final topic' });
      Sfx.play('turn');
    });
  };

  // ---------- wedge earned ----------

  UI.celebrateWedge = function (o) {
    return new Promise((resolve) => {
      const flags = o.cats.map((_, i) => !!o.player.wedges[i]);
      const card = h('div', { class: 'wedge-pop', '--cat': o.cat.color, '--cat-glow': hexA(o.cat.color, 0.6) },
        h('div', { class: 'wp-ring' }, h('span', { class: 'wp-emoji', text: o.cat.emoji }), pieSvg(o.cats, flags)),
        h('p', { class: 'eyebrow', text: 'Wedge earned' }),
        h('h2', { class: 'wp-title', text: o.cat.name }),
        h('p', { class: 'wp-sub', text: `${o.player.name} now has ${o.count} of ${o.total}` })
      );
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        m.close();
        resolve();
      };
      const m = UI.modal(card, { cls: 'celebrate', label: 'Wedge earned', onClose: finish });
      setTimeout(finish, 2400);
    });
  };

  // ---------- victory ----------

  UI.victory = function (o) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        m.close();
        resolve(v);
      };
      const ranked = o.players.slice().sort((a, b) => (b === o.winner) - (a === o.winner) || b.wedges.filter(Boolean).length - a.wedges.filter(Boolean).length);
      const rows = ranked.map((p) => {
        const pct = p.stats.asked ? Math.round((100 * p.stats.correct) / p.stats.asked) : 0;
        return h('li', { class: 'vrow' + (p === o.winner ? ' win' : ''), '--pc': p.color },
          h('span', { class: 'avatar', text: p.avatar }),
          h('span', { class: 'vname', text: p.name }),
          pieSvg(o.cats, p.wedges),
          h('span', { class: 'vbar' }, h('i', { style: `width:${pct}%` })),
          h('span', { class: 'vpct', text: `${p.stats.correct}/${p.stats.asked}` })
        );
      });
      const missed = o.missed.slice(-8);
      const review = missed.length
        ? h('details', { class: 'review' },
            h('summary', null, `Worth remembering (${missed.length})`),
            h('ul', null, missed.map((x) => h('li', null, h('span', { class: 'rv-e', text: x.emoji }), h('div', null, h('strong', { text: x.q }), h('span', { text: ` ${x.answer}. ` }), x.fact ? h('em', { text: x.fact }) : null)))))
        : null;
      const card = h('div', { class: 'sheet victory', '--pc': o.winner.color, '--pc-glow': hexA(o.winner.color, 0.6) },
        h('div', { class: 'crown' }, h('span', { class: 'v-av', text: o.winner.avatar }), h('span', { class: 'v-crown', text: '👑' })),
        h('p', { class: 'eyebrow', text: 'Champion' }),
        h('h2', { class: 'v-title', text: `${o.winner.name} wins!` }),
        h('ul', { class: 'vlist' }, rows),
        review,
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => finish('setup') }, 'Change setup'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => finish('again') }, 'Play again'))
      );
      const m = UI.modal(card, { dismissable: false, label: `${o.winner.name} wins`, cls: 'victory-wrap' });
      if (o.speak && root.WQVoice) root.WQVoice.say([`${o.winner.name} wins! Congratulations!`]);
    });
  };

  // ---------- menu and help ----------

  UI.help = function () {
    return new Promise((resolve) => {
      const steps = [
        ['Roll the die', 'Tap the die, then pick any glowing space that is exactly that many steps away. You can turn corners and cross the middle, but not go back.'],
        ['Answer the question', 'The color of the space sets the topic. Questions are made for your age and get harder as you do well.'],
        ['Right answer = roll again', 'Wrong answer passes the turn. Spaces with the dice icon give a free roll.'],
        ['Win wedges', 'Land on a big wedge space and answer correctly to earn that topic’s wedge.'],
        ['Finish at the hub', 'With every wedge, race to the center. Everyone else picks your topic. One right answer wins!'],
      ];
      const card = h('div', { class: 'sheet' },
        h('p', { class: 'eyebrow', text: 'How to play' }),
        h('ol', { class: 'howto' }, steps.map(([t, d]) => h('li', null, h('strong', { text: t }), h('span', { text: d })))),
        h('p', { class: 'sheet-body dim', text: 'Tip: drag the board to turn it, scroll or pinch to zoom, hover a space to see its topic. Arrow keys and Enter work too.' }),
        h('div', { class: 'sheet-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => m.close(), text: 'Got it' }))
      );
      const m = UI.modal(card, { label: 'How to play', onClose: resolve });
    });
  };

  // hooks: { cfg, onSound, onGlow, onRead, onVoice, onView, onRestart, onSetup }
  UI.menu = function (hk) {
    const cfg = hk.cfg;
    const mk = (id, label, get, set) =>
      h('label', { class: 'toggle', for: id }, h('input', { type: 'checkbox', id, class: 'switch', checked: get() ? true : null, onchange: (e) => set(e.target.checked) }), h('span', { class: 'track' }), h('span', { class: 'toggle-label', text: label }));
    const card = h('div', { class: 'sheet' },
      h('h2', { class: 'sheet-title', text: 'Game menu' }),
      h('div', { class: 'menu-list' },
        h('div', { class: 'opt-row toggles' }, mk('mSound', 'Sound effects', () => cfg.sound, hk.onSound), mk('mGlow', 'Neon glow', () => cfg.glow, hk.onGlow)),
        h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: 'Read questions aloud' }), UI.seg([['auto', 'Young kids'], ['on', 'Always'], ['off', 'Never']], () => cfg.readAloud, (v) => hk.onRead(v))),
        UI.voiceControls(cfg, () => hk.onVoice && hk.onVoice())
      ),
      h('div', { class: 'sheet-actions stack' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { m.close(); UI.help(); } }, 'How to play'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { m.close(); hk.onView(); } }, 'Reset the camera'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { m.close(); hk.onRestart(); } }, 'Restart this game'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { m.close(); hk.onSetup(); } }, 'Change players and topics'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => m.close() }, 'Back to the game'))
    );
    const m = UI.modal(card, { label: 'Game menu', onClose: () => UI.stopSpeak() });
  };
})(typeof window !== 'undefined' ? window : globalThis);
