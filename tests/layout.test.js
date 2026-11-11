const assert = require('assert');
const L = require('../src/layout.js');

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

for (let n = L.MIN_TOPICS; n <= L.MAX_TOPICS; n++) {
  const lay = L.generate(n);
  const { nodes } = lay;
  const tag = `n=${n}`;

  ok(lay.hub === 0 && nodes[0].type === 'hub', `${tag} hub is node 0`);
  ok(nodes[lay.hub].next.length === n, `${tag} hub touches every spoke`);

  const hq = nodes.filter((x) => x.type === 'hq');
  ok(hq.length === n, `${tag} one wedge space per topic`);
  hq.forEach((x) => ok(x.next.length === 3, `${tag} wedge space has rim x2 + spoke`));
  ok(hq.every((x, i) => x.cat === i), `${tag} wedge space topics in order`);

  // symmetric adjacency, no self links
  nodes.forEach((a) => a.next.forEach((b) => {
    ok(b !== a.id, `${tag} no self link`);
    ok(nodes[b].next.includes(a.id), `${tag} links are symmetric`);
  }));

  // connected
  const seen = new Set([0]); const q = [0];
  for (let i = 0; i < q.length; i++) nodes[q[i]].next.forEach((m) => { if (!seen.has(m)) { seen.add(m); q.push(m); } });
  ok(seen.size === nodes.length, `${tag} board is connected`);

  // topics: every ordinary space has one, touching spaces differ
  nodes.forEach((a) => {
    if (a.type === 'cat' || a.type === 'hq') ok(Number.isInteger(a.cat) && a.cat >= 0 && a.cat < n, `${tag} topic in range`);
    if (a.cat === null) return;
    a.next.forEach((b) => { if (nodes[b].cat !== null) ok(nodes[b].cat !== a.cat, `${tag} neighbours ${a.id}/${b} share topic ${a.cat}`); });
  });
  const counts = new Array(n).fill(0);
  nodes.forEach((a) => { if (a.cat !== null) counts[a.cat]++; });
  ok(Math.min(...counts) >= 0.7 * Math.max(...counts), `${tag} topics roughly balanced ${counts}`);

  // spaces never overlap
  let minD = Infinity;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
    if (i === 0) continue; // hub drawn bigger, checked below
    minD = Math.min(minD, d);
  }
  ok(minD >= lay.tileSize * 1.12, `${tag} tiles overlap: min distance ${minD.toFixed(2)} vs size ${lay.tileSize.toFixed(2)}`);
  nodes.slice(1).forEach((a) => ok(Math.hypot(a.x, a.z) >= lay.hubRadius + lay.tileSize / 2 + 0.3, `${tag} tile ${a.id} crowds the hub`));
  ok(nodes.filter((a) => a.type === 'roll').length >= n, `${tag} has roll-again spaces`);

  // movement
  for (const canHub of [false, true]) {
    for (const a of nodes) {
      if (a.type === 'hub') continue;
      for (let r = 1; r <= 6; r++) {
        const d = L.destinations(lay, a.id, r, canHub);
        ok(d.size > 0, `${tag} node ${a.id} stuck on roll ${r} canHub=${canHub}`);
        for (const [dest, path] of d) {
          ok(path[path.length - 1] === dest, 'path ends at destination');
          ok(path.length <= r, 'path no longer than roll');
          if (nodes[dest].type !== 'hub') ok(path.length === r, `${tag} exact length ${path.length} vs ${r}`);
          let prev = a.id;
          path.forEach((id, k) => {
            ok(nodes[prev].next.includes(id), 'consecutive path nodes are linked');
            if (k >= 1) ok(path[k - 1] !== (k >= 2 ? path[k - 2] : a.id) || false, 'no reversal');
            prev = id;
          });
          if (!canHub) ok(nodes[dest].type !== 'hub', 'cannot finish on the hub without wedges');
        }
      }
    }
  }

  // crossing the hub
  const hubIn = (path) => path.slice(0, -1).includes(lay.hub);
  for (const a of nodes) {
    if (a.type === 'hub') continue;
    for (let r = 1; r <= 6; r++) {
      // with every wedge the move ends the moment the hub is reached, so nothing crosses it
      for (const path of L.destinations(lay, a.id, r, true).values()) ok(!hubIn(path), `${tag} node ${a.id} crosses the hub on a ${r} with every wedge`);
      // without, a piece may cross: once, in along one spoke and out along another
      for (const path of L.destinations(lay, a.id, r, false).values()) {
        if (!hubIn(path)) continue;
        const k = path.indexOf(lay.hub);
        const before = k === 0 ? a.id : path[k - 1];
        ok(path.filter((x) => x === lay.hub).length === 1, `${tag} crosses the hub twice`);
        ok(nodes[before].ring === 'spoke' && nodes[path[k + 1]].ring === 'spoke', `${tag} hub entered or left off a spoke`);
        ok(nodes[before].spoke !== nodes[path[k + 1]].spoke, `${tag} turned back at the hub`);
      }
    }
  }
  // from j steps out on a spoke, a roll of r > j reaches the first r - j spaces of every other spoke
  for (let s = 0; s < n; s++) {
    for (let j = 1; j <= lay.K; j++) {
      for (let r = j + 1; r <= Math.min(6, j + lay.K); r++) {
        const d = L.destinations(lay, lay.spokes[s][j - 1], r, false);
        for (let t = 0; t < n; t++) {
          if (t === s) continue;
          const want = lay.spokes[t][r - j - 1];
          ok(d.has(want), `${tag} spoke ${s} step ${j} with a ${r} cannot cross to spoke ${t}`);
          const path = d.get(want);
          ok(path.length === r && path[j - 1] === lay.hub, `${tag} route to spoke ${t} goes over the hub`);
        }
      }
    }
  }
  // the reported case: six topics, three steps out on a spoke, a roll of 4
  if (n === 6) {
    const d = L.destinations(lay, lay.spokes[0][2], 4, false);
    for (let t = 1; t < n; t++) ok(d.has(lay.spokes[t][0]), 'a 4 from 3 steps out reaches every other spoke');
    ok(d.size === 7 && !d.has(lay.hub) && !d.has(lay.spokes[0][0]), `a 4 from 3 steps out has 7 choices, got ${d.size}`);
  }

  // leaving the hub
  for (let r = 1; r <= 6; r++) {
    const d = L.destinations(lay, lay.hub, r, false);
    ok(d.size > 0 && ![...d.keys()].includes(lay.hub), `${tag} can leave hub with ${r}`);
  }
  // hub entry
  for (const a of nodes) {
    if (a.type === 'hub') continue;
    const dist = L.hubDistance(lay, a.id);
    ok(dist > 0, `${tag} hub distance`);
    const d = L.destinations(lay, a.id, 6, true);
    // straight-in routes exist for spoke spaces within 6
    if (a.ring === 'spoke' && dist <= 6) ok(d.has(lay.hub), `${tag} spoke ${a.id} (dist ${dist}) can reach hub on a 6`);
  }
  console.log(`n=${n}: ${nodes.length} spaces, rim ${lay.rim.length}, K=${lay.K}, R=${lay.R.toFixed(2)}, r1=${lay.r1.toFixed(2)}, tile=${lay.tileSize.toFixed(2)}, topics ${counts}`);
}
console.log(`\nAll ${checks} layout checks passed`);
