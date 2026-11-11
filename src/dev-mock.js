// Local testing only (never published): a stand-in for the Claude runtime's
// `sample` capability. It streams questions from the built-in bank with delays.
//   ?fail=not_granted   reject every call with that error code
//   ?speed=4            run the fake latency faster
(function () {
  const params = new URLSearchParams(location.search);
  const fail = params.get('fail');
  const speed = +params.get('speed') || 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms / speed));
  const used = new Set();

  async function sample(prompt, o) {
    window.__sampleCalls = (window.__sampleCalls || 0) + 1;
    await sleep(900);
    if (fail) throw { code: fail, message: 'mock failure' };
    const topics = [...prompt.matchAll(/^(c\d+) = (.+)$/gm)].map((m) => ({ id: m[1], name: m[2] }));
    const per = +/write (\d+) question/.exec(prompt)[1];
    const age = +/(\d+) years old/.exec(prompt)[1];
    let text = '';
    for (let k = 0; k < per; k++) {
      for (const t of topics) {
        const row = WQBank.pick(t.name, age, used);
        used.add(WQBank.norm(row.q));
        const line = JSON.stringify({ t: t.id, q: row.q, a: row.a, w: row.w, f: row.f });
        await sleep(300);
        text += line + '\n';
        if (o && o.onText) o.onText({ text, delta: line + '\n' });
      }
    }
    return { text, truncated: false };
  }
  window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
})();
