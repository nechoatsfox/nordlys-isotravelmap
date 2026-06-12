/* Nordlys — travel-time engine.
 *
 * Multimodal shortest paths over a hand-built graph of real timetable and
 * road data, then a continuous travel-time field over the map:
 *   t(p) = min over reachable nodes n of  t(n) + access(p, n)
 *
 * Waiting model (planned departure convention, like classic isochrone maps):
 *  - your FIRST boarding of scheduled transit costs no wait (you plan for it)
 *  - every transfer to a different line costs 5 min + min(headway/2, 40)
 *  - flights additionally cost 70 min of airport process time
 *    (check-in/security before, deboard/exit after)
 *  - staying on the same line through stops costs nothing extra
 */
"use strict";

const Engine = (() => {

  const TRANSFER_PENALTY = 5;          // min, changing vehicles
  const MAX_HEADWAY_WAIT = 40;         // min, cap on expected transfer wait
  const FLIGHT_PROCESS = 70;           // min, check-in + security + exit
  const ACCESS_PENALTY = 4;            // min, parking / finding the door
  const CIRCUITY = 1.32;               // crow-fly -> road distance factor
  const SPEED_CAR_LOCAL = 58;          // km/h off-graph local driving
  const SPEED_WALK = 4.8;              // km/h

  const KM_PER_DEG_LAT = 111.32;

  let nodes = [], edges = [], adj = [];
  let nodeIndex = new Map();

  function init(network) {
    nodes = network.nodes;
    nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
    edges = [];
    adj = nodes.map(() => []);
    for (const e of network.edges) {
      const [a, b, mode, min, headway, line] = e;
      const ia = nodeIndex.get(a), ib = nodeIndex.get(b);
      if (ia === undefined || ib === undefined) {
        console.warn("unknown node in edge", e);
        continue;
      }
      const id = edges.length;
      edges.push({ a: ia, b: ib, mode, min, headway: headway || 0, line: line || mode });
      adj[ia].push(id);
      adj[ib].push(id);
    }
  }

  function dist(lat1, lon1, lat2, lon2) {
    const dy = (lat2 - lat1) * KM_PER_DEG_LAT;
    const dx = (lon2 - lon1) * KM_PER_DEG_LAT * Math.cos((lat1 + lat2) * 0.5 * Math.PI / 180);
    return Math.hypot(dx, dy);
  }

  /* ---- Dijkstra over (node, lastLine) states ---------------------------- */

  class Heap {
    constructor() { this.a = []; }
    push(k, v) {
      const a = this.a; a.push([k, v]);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    }
    get size() { return this.a.length; }
  }

  const SCHEDULED = new Set(["rail", "bus", "flight", "ferry"]);

  /**
   * @param originId  node id
   * @param modes     Set of enabled modes among rail,bus,flight,car
   * @returns { time: Float64Array per node, via: best predecessor info per node }
   */
  function shortestTimes(originId, modes) {
    const origin = nodeIndex.get(originId);
    const best = new Map();              // stateKey -> cost
    const bestAtNode = new Float64Array(nodes.length).fill(Infinity);
    const arrival = new Array(nodes.length).fill(null); // {edge, prevNode, prevState}
    const stateInfo = new Map();         // stateKey -> {node, line, prevKey, edge}

    const startKey = origin + "|·|0";
    best.set(startKey, 0);
    stateInfo.set(startKey, { node: origin, line: "·", transit: false, prevKey: null, edge: null });
    bestAtNode[origin] = 0;
    const heap = new Heap();
    heap.push(0, startKey);

    while (heap.size) {
      const [cost, key] = heap.pop();
      if (cost > best.get(key)) continue;
      const st = stateInfo.get(key);
      const u = st.node;

      for (const eid of adj[u]) {
        const e = edges[eid];
        if (!modes.has(e.mode === "ferry" ? "car" : e.mode)) continue;
        // your car does not follow you onto a train/bus/plane
        if (e.mode === "car" && st.transit) continue;
        const v = e.a === u ? e.b : e.a;

        let c = e.min;
        let newLine = st.line;
        let newTransit = st.transit;
        if (SCHEDULED.has(e.mode)) {
          if (st.line !== e.line) {
            if (e.mode === "flight") {
              // airport process absorbs the wait; infrequent routes cost a
              // little extra schedule inconvenience
              c += FLIGHT_PROCESS + Math.min(e.headway / 4, 25);
            } else if (st.transit) {
              // transferring between scheduled ground services
              c += TRANSFER_PENALTY + Math.min(e.headway / 2, MAX_HEADWAY_WAIT);
            }
          }
          newLine = e.line;
          newTransit = true;
        } else {
          newLine = e.mode; // car / walk
        }

        const nk = v + "|" + newLine + "|" + (newTransit ? 1 : 0);
        const nc = cost + c;
        if (nc >= (best.get(nk) ?? Infinity)) continue;
        best.set(nk, nc);
        stateInfo.set(nk, { node: v, line: newLine, transit: newTransit, prevKey: key, edge: eid });
        if (nc < bestAtNode[v]) {
          bestAtNode[v] = nc;
          arrival[v] = nk;
        }
        heap.push(nc, nk);
      }
    }

    return { time: bestAtNode, arrivalKey: arrival, stateInfo };
  }

  /* ---- route reconstruction --------------------------------------------- */

  function routeTo(result, nodeIdx) {
    const key = result.arrivalKey[nodeIdx];
    if (!key) return null;
    const legs = [];
    let k = key;
    while (k) {
      const st = result.stateInfo.get(k);
      if (st.edge !== null && st.edge !== undefined) {
        const e = edges[st.edge];
        const prev = result.stateInfo.get(st.prevKey);
        legs.push({ from: prev.node, to: st.node, mode: e.mode, min: e.min, line: e.line });
      }
      k = st.prevKey;
    }
    legs.reverse();
    // merge consecutive legs on the same line / same road mode
    const merged = [];
    for (const l of legs) {
      const last = merged[merged.length - 1];
      if (last && last.line === l.line && last.mode === l.mode) {
        last.to = l.to; last.min += l.min;
      } else {
        merged.push({ ...l });
      }
    }
    return merged;
  }

  /* ---- continuous field --------------------------------------------------
   * Grid in map pixel space; proj/unproj provided by the renderer.
   */
  function computeField(result, modes, grid) {
    const { cols, rows, toLatLon } = grid;
    const field = new Float32Array(cols * rows);
    const vAccess = modes.has("car") ? SPEED_CAR_LOCAL : SPEED_WALK;
    const reach = [];
    for (let i = 0; i < nodes.length; i++) {
      if (result.time[i] < Infinity) {
        reach.push([nodes[i].lat, nodes[i].lon, result.time[i], i]);
      }
    }
    const cosLat = Math.cos(60.2 * Math.PI / 180);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [lat, lon] = toLatLon(c, r);
        let bestT = Infinity;
        for (let k = 0; k < reach.length; k++) {
          const n = reach[k];
          const dy = (lat - n[0]) * KM_PER_DEG_LAT;
          const dx = (lon - n[1]) * KM_PER_DEG_LAT * cosLat;
          const d = Math.sqrt(dx * dx + dy * dy) * CIRCUITY;
          const t = n[2] + (d / vAccess) * 60 + (d > 0.8 ? ACCESS_PENALTY : 0);
          if (t < bestT) bestT = t;
        }
        field[r * cols + c] = bestT;
      }
    }
    return field;
  }

  /** nearest node + its travel time + local access for an arbitrary point */
  function timeAt(result, modes, lat, lon) {
    const vAccess = modes.has("car") ? SPEED_CAR_LOCAL : SPEED_WALK;
    let bestT = Infinity, bestN = -1, bestD = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (result.time[i] === Infinity) continue;
      const d = dist(lat, lon, nodes[i].lat, nodes[i].lon) * CIRCUITY;
      const t = result.time[i] + (d / vAccess) * 60 + (d > 0.8 ? ACCESS_PENALTY : 0);
      if (t < bestT) { bestT = t; bestN = i; bestD = d; }
    }
    return { minutes: bestT, node: bestN, accessKm: bestD };
  }

  /* ---- marching squares: isoline segments at given levels --------------- */

  function isolines(field, cols, rows, levels) {
    const out = levels.map(() => []);
    for (let li = 0; li < levels.length; li++) {
      const L = levels[li];
      const segs = out[li];
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = field[r * cols + c],       b = field[r * cols + c + 1];
          const d = field[(r + 1) * cols + c], e = field[(r + 1) * cols + c + 1];
          if (!isFinite(a) && !isFinite(b) && !isFinite(d) && !isFinite(e)) continue;
          let idx = 0;
          if (a < L) idx |= 1;
          if (b < L) idx |= 2;
          if (e < L) idx |= 4;
          if (d < L) idx |= 8;
          if (idx === 0 || idx === 15) continue;
          const top    = [c + frac(a, b, L), r];
          const right  = [c + 1, r + frac(b, e, L)];
          const bottom = [c + frac(d, e, L), r + 1];
          const left   = [c, r + frac(a, d, L)];
          const T = MS_TABLE[idx];
          for (let s = 0; s < T.length; s += 2) {
            segs.push([pick(T[s], top, right, bottom, left),
                       pick(T[s + 1], top, right, bottom, left)]);
          }
        }
      }
    }
    return out;
  }

  function frac(v0, v1, L) {
    if (!isFinite(v0)) v0 = 1e9;
    if (!isFinite(v1)) v1 = 1e9;
    const t = (L - v0) / (v1 - v0);
    return Math.max(0, Math.min(1, t));
  }
  function pick(i, t, r, b, l) { return [t, r, b, l][i]; }
  // edge order: 0 top, 1 right, 2 bottom, 3 left
  const MS_TABLE = {
    1: [3, 0], 2: [0, 1], 3: [3, 1], 4: [1, 2], 5: [3, 0, 1, 2],
    6: [0, 2], 7: [3, 2], 8: [2, 3], 9: [0, 2], 10: [0, 1, 2, 3],
    11: [1, 2], 12: [1, 3], 13: [0, 1], 14: [3, 0],
  };

  return {
    init, shortestTimes, computeField, isolines, timeAt, routeTo, dist,
    get nodes() { return nodes; },
    get edges() { return edges; },
    nodeIdx: id => nodeIndex.get(id),
  };
})();
