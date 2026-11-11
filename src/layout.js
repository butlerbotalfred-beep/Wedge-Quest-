// Board geometry and movement rules. Pure functions: no DOM, no WebGL.
//
// The board is a wheel: a rim of spaces with one wedge space per topic,
// a spoke of spaces from every wedge space in to a hub at the centre.
// World units are scene units on the XZ plane; the first wedge space sits
// at the top of the screen (negative Z).
(function (root) {
  'use strict';

  const TILE_PITCH = 1.9;
  const HUB_RADIUS = 1.7;
  // Normal spaces between two wedge spaces on the rim, by number of topics.
  const RIM_GAP = { 3: 6, 4: 6, 5: 5, 6: 5, 7: 4, 8: 4 };

  const MIN_TOPICS = 3;
  const MAX_TOPICS = 8;

  function generate(n) {
    n = Math.max(MIN_TOPICS, Math.min(MAX_TOPICS, n | 0));
    const gap = RIM_GAP[n];
    const perSeg = gap + 1;
    const rimCount = n * perSeg;
    const R = (rimCount * TILE_PITCH) / (2 * Math.PI);
    const r1 = Math.max(HUB_RADIUS + 1.5, 0.92 / Math.sin(Math.PI / n));
    const K = Math.max(2, Math.round((R - r1) / TILE_PITCH));
    const sp = (R - r1) / K;
    const rimPitch = (2 * Math.PI * R) / rimCount;
    const tileSize = Math.min(1.5, 0.86 * Math.min(rimPitch, sp));

    const nodes = [];
    const add = (node) => {
      node.id = nodes.length;
      node.next = [];
      nodes.push(node);
      return node.id;
    };
    const link = (a, b) => {
      nodes[a].next.push(b);
      nodes[b].next.push(a);
    };

    const hub = add({ type: 'hub', cat: null, x: 0, z: 0, rotY: 0, ring: 'hub', spoke: null, idx: 0 });

    // Rim, walking clockwise on screen from the top. The tile at position 0
    // of each segment is the wedge space.
    const rimTheta = (i) => -Math.PI / 2 + (2 * Math.PI * i) / rimCount;
    const rollPos = gap >= 3 ? Math.ceil(gap / 2) : -1;
    const rim = [];
    for (let s = 0; s < n; s++) {
      for (let p = 0; p < perSeg; p++) {
        const i = s * perSeg + p;
        const theta = rimTheta(i);
        const type = p === 0 ? 'hq' : p === rollPos ? 'roll' : 'cat';
        rim.push(
          add({
            type,
            cat: p === 0 ? s : null,
            x: R * Math.cos(theta),
            z: R * Math.sin(theta),
            rotY: -(theta + Math.PI / 2),
            ring: 'rim',
            spoke: p === 0 ? s : null,
            idx: i,
            segment: s,
            pos: p,
          })
        );
      }
    }
    for (let i = 0; i < rim.length; i++) link(rim[i], rim[(i + 1) % rim.length]);

    // Spokes. spoke[s][j-1] is j steps out from the hub (j = 1..K).
    const spokes = [];
    const spokeRoll = K >= 3 ? Math.ceil(K / 2) : -1;
    for (let s = 0; s < n; s++) {
      const theta = rimTheta(s * perSeg);
      const ids = [];
      for (let j = 1; j <= K; j++) {
        const r = r1 + (j - 1) * sp;
        ids.push(
          add({
            type: j === spokeRoll ? 'roll' : 'cat',
            cat: null,
            x: r * Math.cos(theta),
            z: r * Math.sin(theta),
            rotY: -theta,
            ring: 'spoke',
            spoke: s,
            idx: j,
          })
        );
      }
      spokes.push(ids);
      link(hub, ids[0]);
      for (let j = 0; j < K - 1; j++) link(ids[j], ids[j + 1]);
      link(ids[K - 1], rim[s * perSeg]);
    }

    // Topic for every ordinary space: a rotating pattern, nudged so that no
    // two touching spaces share a topic.
    const clash = (id, c) => nodes[id].next.some((m) => nodes[m].cat === c);
    const settle = (id, want) => {
      let c = want % n;
      for (let t = 0; t < n && clash(id, c); t++) c = (c + 1) % n;
      nodes[id].cat = c;
    };
    for (let s = 0; s < n; s++) {
      for (let p = 1; p < perSeg; p++) {
        const id = rim[s * perSeg + p];
        if (nodes[id].type === 'cat') settle(id, s + p);
      }
    }
    for (let s = 0; s < n; s++) {
      for (let j = K; j >= 1; j--) {
        const id = spokes[s][j - 1];
        if (nodes[id].type === 'cat') settle(id, s + j + 1);
      }
    }

    return {
      n,
      gap,
      K,
      R,
      r1,
      tileSize,
      hubRadius: HUB_RADIUS,
      boardRadius: R + 2.3,
      hub,
      rim,
      spokes,
      nodes,
      hq: (c) => rim[c * perSeg],
    };
  }

  // Every space a piece can finish on after `steps` moves. Movement goes in
  // any direction along the board but may never turn straight back on itself
  // within a single move. The hub is a junction of every spoke: without every
  // wedge a piece may cross it (it counts as one step and can never be the
  // last), and with every wedge the move ends the moment the hub is reached.
  // Returns a Map of destination id -> the path of node ids to walk (start
  // not included).
  function destinations(layout, from, steps, canEnterHub) {
    const nodes = layout.nodes;
    const out = new Map();
    const walk = (node, prev, left, path) => {
      for (const nb of nodes[node].next) {
        if (nb === prev) continue;
        const isHub = nodes[nb].type === 'hub';
        const p = path.concat(nb);
        if (isHub && canEnterHub) {
          if (!out.has(nb)) out.set(nb, p);
        } else if (left === 1) {
          if (!isHub && !out.has(nb)) out.set(nb, p);
        } else {
          walk(nb, node, left - 1, p);
        }
      }
    };
    walk(from, -1, steps, []);
    return out;
  }

  // Fewest spaces from a node to the hub (ignores the no-reverse rule).
  function hubDistance(layout, from) {
    const dist = new Array(layout.nodes.length).fill(-1);
    const queue = [from];
    dist[from] = 0;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (id === layout.hub) return dist[id];
      for (const nb of layout.nodes[id].next) {
        if (dist[nb] < 0) {
          dist[nb] = dist[id] + 1;
          queue.push(nb);
        }
      }
    }
    return -1;
  }

  const api = { generate, destinations, hubDistance, MIN_TOPICS, MAX_TOPICS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WQLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
