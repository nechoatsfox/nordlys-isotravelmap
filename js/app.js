/* Nordlys — application wiring. */
"use strict";

(() => {
  const ORIGINS = ["oslo", "bergen", "stavanger", "kristiansand", "arendal", "drammen", "haugesund"];

  const MODE_DEFS = [
    { id: "flight", name: "Fly", no: "flight", icon: '<svg viewBox="0 0 24 24"><path d="M10.5 13.5 3 11l1.5-1.5 6 .8 5-5.3a1.7 1.7 0 0 1 2.4 2.4l-5.3 5 .8 6L12 20l-2.5-7.5Z"/><path d="m4.5 19.5 3-3"/></svg>' },
    { id: "rail", name: "Tog", no: "train & tram", icon: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14M9 19l-2 2.5M15 19l2 2.5"/><circle cx="9" cy="13" r=".5"/><circle cx="15" cy="13" r=".5"/></svg>' },
    { id: "bus", name: "Buss", no: "coach & bus", icon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="14" rx="3"/><path d="M4 11h16"/><circle cx="8.5" cy="18.5" r="1.5"/><circle cx="15.5" cy="18.5" r="1.5"/></svg>' },
    { id: "car", name: "Bil", no: "driving", icon: '<svg viewBox="0 0 24 24"><path d="M5 12 6.7 7.6A2 2 0 0 1 8.6 6.3h6.8a2 2 0 0 1 1.9 1.3L19 12M5 12h14a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-2.5A1.5 1.5 0 0 1 4 12h1Z"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/></svg>' },
  ];

  const state = {
    origin: "oslo",
    dest: null,
    modes: new Set(["flight", "rail", "bus", "car"]),
    result: null,
  };

  Engine.init(window.NETWORK);

  /* ---- panel: city chips ---- */

  const citiesEl = document.getElementById("cities");
  for (const id of ORIGINS) {
    const node = window.NETWORK.nodes.find(n => n.id === id);
    const b = document.createElement("button");
    b.className = "chip" + (id === state.origin ? " active" : "");
    b.textContent = node.name;
    b.onclick = () => {
      state.origin = id;
      if (state.dest === id) state.dest = null;
      citiesEl.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      b.classList.add("active");
      syncDestChips();
      recompute();
    };
    citiesEl.appendChild(b);
  }

  /* ---- panel: destination chips ---- */

  const destsEl = document.getElementById("dests");
  const destChips = new Map();
  for (const id of ORIGINS) {
    const node = window.NETWORK.nodes.find(n => n.id === id);
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = node.name;
    b.onclick = () => {
      state.dest = state.dest === id ? null : id;
      syncDestChips();
      updateDestination();
    };
    destChips.set(id, b);
    destsEl.appendChild(b);
  }

  function syncDestChips() {
    for (const [id, b] of destChips) {
      b.classList.toggle("active", id === state.dest);
      b.classList.toggle("disabled", id === state.origin);
    }
  }
  syncDestChips();

  /* ---- panel: mode toggles ---- */

  const modesEl = document.getElementById("modes");
  for (const m of MODE_DEFS) {
    const d = document.createElement("div");
    d.className = "mode on";
    d.innerHTML = `<span class="ic">${m.icon}</span><span class="tx">${m.name}<small>${m.no}</small></span>`;
    d.onclick = () => {
      if (state.modes.has(m.id)) {
        if (state.modes.size === 1) return; // keep at least one
        state.modes.delete(m.id);
        d.classList.remove("on"); d.classList.add("off");
      } else {
        state.modes.add(m.id);
        d.classList.add("on"); d.classList.remove("off");
      }
      recompute();
    };
    modesEl.appendChild(d);
  }

  /* ---- legend ---- */

  (function drawLegend() {
    const c = document.getElementById("legendbar");
    const g = c.getContext("2d");
    const img = g.createImageData(c.width, c.height);
    for (let x = 0; x < c.width; x++) {
      const t = (x / c.width) * 600;
      // reuse engine-agnostic ramp via a tiny duplicate: sample renderer colors
      const col = sampleRamp(t);
      for (let y = 0; y < c.height; y++) {
        const i = (y * c.width + x) * 4;
        img.data[i] = col[0]; img.data[i + 1] = col[1];
        img.data[i + 2] = col[2]; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const ticks = document.getElementById("legendticks");
    ["0", "2 h", "4 h", "6 h", "8 h", "10 h+"].forEach(t => {
      const s = document.createElement("span");
      s.textContent = t;
      ticks.appendChild(s);
    });
  })();

  function sampleRamp(t) {
    const RAMP = [
      [0, [244, 255, 250]], [30, [185, 255, 221]], [60, [124, 255, 196]],
      [120, [47, 217, 166]], [180, [31, 179, 176]], [240, [47, 134, 201]],
      [300, [74, 95, 208]], [360, [111, 73, 189]], [420, [147, 55, 155]],
      [480, [168, 47, 111]], [560, [126, 45, 78]], [660, [70, 38, 60]],
    ];
    let i = 0;
    while (i < RAMP.length - 1 && RAMP[i + 1][0] < t) i++;
    const [t0, c0] = RAMP[i], [t1, c1] = RAMP[Math.min(i + 1, RAMP.length - 1)];
    const f = t1 === t0 ? 0 : Math.min(1, (t - t0) / (t1 - t0));
    return c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
  }

  /* ---- map static layers ---- */

  Renderer.setGeo(window.GEO_DATA);

  const majors = ORIGINS.map(id => window.NETWORK.nodes.find(n => n.id === id));
  const minors = window.NETWORK.nodes.filter(n => !ORIGINS.includes(n.id) && n.kind !== "station");
  Renderer.setLabels(majors, minors);

  function networkLayers() {
    const layers = [];
    for (const mode of ["rail", "bus", "flight"]) {
      if (!state.modes.has(mode)) continue;
      const seen = new Set();
      const lines = [];
      for (const e of Engine.edges) {
        if (e.mode !== mode) continue;
        const key = e.a < e.b ? e.a + ":" + e.b : e.b + ":" + e.a;
        if (seen.has(key)) continue;
        seen.add(key);
        const A = Engine.nodes[e.a], B = Engine.nodes[e.b];
        lines.push([[A.lat, A.lon], [B.lat, B.lon]]);
      }
      layers.push({ mode, lines });
    }
    return layers;
  }

  /* ---- recompute pipeline ---- */

  const LEVELS = [];
  for (let m = 30; m <= 600; m += 30) LEVELS.push(m);

  function recompute() {
    const t0 = performance.now();
    state.result = Engine.shortestTimes(state.origin, state.modes);
    const field = Engine.computeField(state.result, state.modes, Renderer.GRID);
    const segs = Engine.isolines(field, Renderer.GRID.cols, Renderer.GRID.rows, LEVELS);
    Renderer.setField(field);
    Renderer.setIsolines(LEVELS, segs);
    Renderer.setNetwork(networkLayers());
    const o = window.NETWORK.nodes.find(n => n.id === state.origin);
    Renderer.setOrigin(o);
    const ms = Math.round(performance.now() - t0);
    const reached = state.result.time.filter(t => isFinite(t)).length;
    document.getElementById("statnote").textContent =
      `${reached} places · ${Engine.edges.length} timetable segments · computed in ${ms} ms`;
    updateDestination();
  }

  /* ---- destination: quickest vs slowest route ---- */

  function updateDestination() {
    if (!state.dest || state.dest === state.origin) {
      Renderer.setHighlight(null);
      clearReadout();
      return;
    }
    const di = Engine.nodeIdx(state.dest);
    const destNode = Engine.nodes[di];

    // candidates: the multimodal optimum, plus each ground mode on its own
    // (flight alone can't reach an airport, so it only appears via the optimum)
    const candidates = [];
    if (isFinite(state.result.time[di])) {
      candidates.push({ time: state.result.time[di], legs: Engine.routeTo(state.result, di) });
    }
    for (const m of state.modes) {
      if (m === "flight") continue;
      const r = Engine.shortestTimes(state.origin, new Set([m]));
      if (isFinite(r.time[di])) {
        candidates.push({ time: r.time[di], legs: Engine.routeTo(r, di) });
      }
    }

    if (!candidates.length) {
      Renderer.setHighlight({ dest: destNode });
      readout.innerHTML = `<div class="readout-idle">${destNode.name} is not reachable with the selected modes.</div>`;
      return;
    }

    candidates.sort((a, b) => a.time - b.time);
    const fast = candidates[0];
    const slow = candidates[candidates.length - 1];
    const distinct = slow.time - fast.time > 1;

    Renderer.setHighlight({
      dest: destNode,
      fast: highlightLegs(fast.legs),
      slow: distinct ? highlightLegs(slow.legs) : null,
    });

    let html = `<div class="route-head"><span class="route-dest">→ ${destNode.name}</span></div>`;
    html += routeGroup("Quickest", "raskest", fast, "fast");
    if (distinct) html += routeGroup("Slowest", "tregest", slow, "slow");
    readout.innerHTML = html;
  }

  function highlightLegs(legs) {
    return legs.map(l => ({
      mode: l.mode,
      pts: l.path.map(i => [Engine.nodes[i].lat, Engine.nodes[i].lon]),
    }));
  }

  function routeGroup(title, no, cand, cls) {
    return `<div class="rg ${cls}"><div class="rg-head">` +
      `<span class="rg-title">${title} <i>${no}</i></span>` +
      `<span class="rg-time">${fmt(cand.time)}</span></div>` +
      legsHtml(cand.legs) + `</div>`;
  }

  /* ---- hover / click readout ---- */

  const tooltip = document.getElementById("tooltip");
  const readout = document.getElementById("readout");

  function fmt(min) {
    if (!isFinite(min)) return "—";
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  }

  Renderer.canvas.addEventListener("pointermove", e => {
    if (!state.result) return;
    const [lat, lon] = Renderer.unproject(e.clientX, e.clientY);
    const r = Engine.timeAt(state.result, state.modes, lat, lon);
    if (!isFinite(r.minutes) || r.minutes > 780) { tooltip.hidden = true; return; }
    const near = Engine.nodes[r.node];
    tooltip.hidden = false;
    tooltip.style.left = (e.clientX + 16) + "px";
    tooltip.style.top = (e.clientY + 14) + "px";
    tooltip.innerHTML = `${fmt(r.minutes)}<span class="place">via ${near.name}${r.accessKm > 1 ? " + " + r.accessKm.toFixed(0) + " km" : ""}</span>`;
  });
  Renderer.canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });

  let downXY = null;
  Renderer.canvas.addEventListener("pointerdown", e => { downXY = [e.clientX, e.clientY]; });
  Renderer.canvas.addEventListener("pointerup", e => {
    if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 4) return;
    showRoute(e.clientX, e.clientY);
  });

  const MODE_LABEL = { rail: "tog", bus: "buss", flight: "fly", car: "bil", walk: "gange" };

  function legsHtml(legs) {
    let html = "";
    for (const l of legs) {
      const from = Engine.nodes[l.from], to = Engine.nodes[l.to];
      html += `<div class="leg"><span class="lmode">${MODE_LABEL[l.mode] || l.mode}</span>` +
        `<span class="ldesc">${from.name} → ${to.name}` +
        (l.mode === "car" || l.mode === "walk" ? "" : `<br><i style="opacity:.7">${l.line}</i>`) +
        `</span><span class="ltime">${fmt(l.min)}</span></div>`;
    }
    if (legs.some(l => l.mode === "flight")) {
      html += `<div class="leg"><span class="lmode">info</span>` +
        `<span class="ldesc" style="opacity:.65">includes 70 min check-in, security &amp; exit</span></div>`;
    }
    return html;
  }

  function showRoute(x, y) {
    const [lat, lon] = Renderer.unproject(x, y);
    const r = Engine.timeAt(state.result, state.modes, lat, lon);
    if (!isFinite(r.minutes)) return;
    const legs = Engine.routeTo(state.result, r.node) || [];
    const near = Engine.nodes[r.node];
    let html = `<div class="route-head"><span class="route-dest">→ ${near.name}</span>` +
      `<span class="route-time">${fmt(r.minutes)}</span></div>`;
    if (!legs.length) {
      html += `<div class="leg"><span class="lmode">start</span><span class="ldesc">You are here.</span></div>`;
    }
    html += legsHtml(legs);
    if (r.accessKm > 1) {
      html += `<div class="leg"><span class="lmode">${state.modes.has("car") ? "bil" : "gange"}</span>` +
        `<span class="ldesc">${near.name} → destination (~${r.accessKm.toFixed(0)} km local)</span>` +
        `<span class="ltime">${fmt(r.minutes - state.result.time[r.node])}</span></div>`;
    }
    readout.innerHTML = html;
  }

  function clearReadout() {
    readout.innerHTML = `<div class="readout-idle">Hover the map to read travel times.<br>Click anywhere for a suggested route.</div>`;
  }

  recompute();
})();
