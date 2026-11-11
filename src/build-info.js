// Which build this page is. The build puts the version, date and commit in `window.WQ_BUILD` just
// above this file; the game menu shows the line and the home server reports the same three values.
(function (root) {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function day(iso) {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso || '');
    return m && MONTHS[m[2] - 1] ? `${Number(m[3])} ${MONTHS[m[2] - 1]} ${m[1]}` : iso || '';
  }

  // "Wedge Quest 1.0.1 · 11 Nov 2026 · abc1234"
  function line(b) {
    if (!b || !b.version) return 'Wedge Quest (unknown build)';
    return ['Wedge Quest ' + b.version, day(b.date), b.commit].filter(Boolean).join(' · ');
  }

  function same(a, b) {
    return !!a && !!b && a.version === b.version && a.date === b.date && a.commit === b.commit;
  }

  root.WQBuild = { line, same, current: () => root.WQ_BUILD || null };
})(typeof window !== 'undefined' ? window : globalThis);
