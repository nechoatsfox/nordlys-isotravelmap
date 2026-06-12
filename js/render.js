/* Nordlys — map renderer.
 * Custom canvas cartography: no map library. The projection is a plain
 * equirectangular with a fixed cos(60°) x-compression, which is affine in
 * (lon, lat) — so the precomputed field raster can be blitted with a single
 * scaled drawImage and stays perfectly registered with the vector layers.
 */
"use strict";

const Renderer = (() => {

  const COS = Math.cos(60.2 * Math.PI / 180);
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  // view: geographic center + pixels per degree latitude
  const HOME = { lat: 59.85, lon: 8.05 };
  let view = { lat: HOME.lat, lon: HOME.lon, scale: 0 };

  // ---- geographic field grid (set by app) ----
  const GRID = { w: 4.4, s: 57.55, e: 14.2, n: 62.9, step: 0.022 };
  GRID.cols = Math.round((GRID.e - GRID.w) / GRID.step);
  GRID.rows = Math.round((GRID.n - GRID.s) / (GRID.step * 1 /* lat step = step */));
  GRID.toLatLon = (c, r) => [GRID.n - r * GRID.step, GRID.w + c * GRID.step / 1];

  // Field raster uses lon-step = step/COS horizontally? No: keep square in
  // degrees but the affine blit handles aspect, so just use equal deg steps.

  const fieldCanvas = document.createElement("canvas");
  fieldCanvas.width = GRID.cols;
  fieldCanvas.height = GRID.rows;
  const fieldCtx = fieldCanvas.getContext("2d");

  /* ---- color ramp -------------------------------------------------------- */

  const RAMP = [
    [0,   [244, 255, 250, 235]],
    [30,  [185, 255, 221, 220]],
    [60,  [124, 255, 196, 205]],
    [120, [47, 217, 166, 185]],
    [180, [31, 179, 176, 168]],
    [240, [47, 134, 201, 152]],
    [300, [74, 95, 208, 138]],
    [360, [111, 73, 189, 124]],
    [420, [147, 55, 155, 110]],
    [480, [168, 47, 111, 95]],
    [560, [126, 45, 78, 70]],
    [660, [70, 38, 60, 36]],
    [780, [40, 30, 50, 0]],
  ];

  function rampColor(t) {
    if (!isFinite(t) || t >= 780) return [0, 0, 0, 0];
    let i = 0;
    while (i < RAMP.length - 1 && RAMP[i + 1][0] < t) i++;
    const [t0, c0] = RAMP[i], [t1, c1] = RAMP[Math.min(i + 1, RAMP.length - 1)];
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    return [
      c0[0] + (c1[0] - c0[0]) * f,
      c0[1] + (c1[1] - c0[1]) * f,
      c0[2] + (c1[2] - c0[2]) * f,
      c0[3] + (c1[3] - c0[3]) * f,
    ];
  }

  /* ---- projection -------------------------------------------------------- */

  function project(lat, lon) {
    return [
      W / 2 + (lon - view.lon) * view.scale * COS,
      H / 2 + (view.lat - lat) * view.scale,
    ];
  }
  function unproject(x, y) {
    return [
      view.lat - (y - H / 2) / view.scale,
      view.lon + (x - W / 2) / (view.scale * COS),
    ];
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (!view.scale) view.scale = Math.min(W / 9.2 / COS, H / 4.2);
    needsDraw = true;
  }

  /* ---- layers ------------------------------------------------------------ */

  let landPath = null, lakePath = null, swedenPath = null;
  let isoSegs = [];          // [{level, segs:[[ [lat,lon],[lat,lon] ]...]}]
  let networkLayers = [];    // [{mode, pts:[[lat,lon],...] or arc}]
  let cities = [];           // big labels
  let places = [];           // minor labels
  let origin = null;         // {lat, lon, name}
  let needsDraw = true;
  let pulseT = 0;

  function buildPath(polys) {
    // store raw polygons; path is rebuilt per-frame in screen space
    return polys;
  }

  function tracePolys(polys) {
    const p = new Path2D();
    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = project(ring[i][1], ring[i][0]);
          if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
        }
        p.closePath();
      }
    }
    return p;
  }

  function setGeo(geo) {
    landPath = buildPath(geo.land.norway);
    swedenPath = buildPath([...(geo.land.sweden || []), ...(geo.land.denmark || [])]);
    lakePath = buildPath(geo.lakes || []);
    needsDraw = true;
  }

  function setField(field) {
    const img = fieldCtx.createImageData(GRID.cols, GRID.rows);
    const d = img.data;
    for (let i = 0; i < field.length; i++) {
      const c = rampColor(field[i]);
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3];
    }
    fieldCtx.putImageData(img, 0, 0);
    needsDraw = true;
  }

  function setIsolines(levels, segsPerLevel) {
    isoSegs = levels.map((L, i) => ({
      level: L,
      segs: segsPerLevel[i].map(seg => seg.map(([c, r]) =>
        [GRID.n - r * GRID.step, GRID.w + c * GRID.step])),
    }));
    needsDraw = true;
  }

  function setNetwork(layers) { networkLayers = layers; needsDraw = true; }
  function setLabels(majors, minors) { cities = majors; places = minors; needsDraw = true; }
  function setOrigin(o) { origin = o; needsDraw = true; }

  /* ---- drawing ----------------------------------------------------------- */

  function drawSea() {
    const g = ctx.createRadialGradient(W * 0.45, H * 0.42, H * 0.1, W * 0.45, H * 0.42, H * 0.95);
    g.addColorStop(0, "#0c1230");
    g.addColorStop(0.6, "#080d22");
    g.addColorStop(1, "#05081a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // graticule
    ctx.strokeStyle = "rgba(120,150,230,0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lon = 2; lon <= 16; lon++) {
      const [x] = project(60, lon);
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let lat = 56; lat <= 64; lat++) {
      const [, y] = project(lat, 8);
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSea();

    // neighbour land, barely-there
    if (swedenPath) {
      ctx.fillStyle = "#101630";
      ctx.fill(tracePolys(swedenPath), "evenodd");
    }

    if (!landPath) return;
    const land = tracePolys(landPath);

    // land base
    ctx.fillStyle = "#212a55";
    ctx.fill(land, "evenodd");

    // travel-time field, clipped to Norwegian land
    ctx.save();
    ctx.clip(land, "evenodd");
    const [x0, y0] = project(GRID.n, GRID.w);
    const [x1, y1] = project(GRID.s, GRID.e);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.92;
    ctx.drawImage(fieldCanvas, x0, y0, x1 - x0, y1 - y0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // isolines (inside land clip)
    for (const iso of isoSegs) {
      const hour = iso.level % 60 === 0;
      ctx.strokeStyle = hour ? "rgba(240,250,255,0.34)" : "rgba(200,220,255,0.12)";
      ctx.lineWidth = hour ? 1.1 : 0.7;
      ctx.beginPath();
      for (const seg of iso.segs) {
        const [ax, ay] = project(seg[0][0], seg[0][1]);
        const [bx, by] = project(seg[1][0], seg[1][1]);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
    ctx.restore();

    // lakes punched on top
    if (lakePath) {
      ctx.fillStyle = "#0c1230";
      ctx.fill(tracePolys(lakePath), "evenodd");
    }

    // coastline glow
    ctx.strokeStyle = "rgba(150,190,255,0.45)";
    ctx.lineWidth = 0.9;
    ctx.stroke(land);

    drawNetwork();
    drawLabels();
    drawOrigin();
  }

  function drawNetwork() {
    for (const layer of networkLayers) {
      if (layer.mode === "flight") {
        for (const [a, b] of layer.lines) {
          const [ax, ay] = project(a[0], a[1]);
          const [bx, by] = project(b[0], b[1]);
          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          const dx = bx - ax, dy = by - ay;
          const len = Math.hypot(dx, dy);
          const cx = mx - dy / len * len * 0.18, cy = my + dx / len * len * 0.18;
          ctx.strokeStyle = "rgba(140,200,255,0.20)";
          ctx.lineWidth = 1;
          ctx.setLineDash([1.5, 5]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(cx, cy, bx, by);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        ctx.strokeStyle = layer.mode === "rail"
          ? "rgba(190,210,255,0.30)" : "rgba(150,170,220,0.13)";
        ctx.lineWidth = layer.mode === "rail" ? 1.2 : 1;
        if (layer.mode === "bus") ctx.setLineDash([2, 4]);
        ctx.beginPath();
        for (const [a, b] of layer.lines) {
          const [ax, ay] = project(a[0], a[1]);
          const [bx, by] = project(b[0], b[1]);
          ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawLabels() {
    ctx.textAlign = "left";
    // minor places
    if (view.scale > 150) {
      ctx.font = "400 10px Inter, sans-serif";
      for (const p of places) {
        const [x, y] = project(p.lat, p.lon);
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        ctx.fillStyle = p.kind === "airport" ? "rgba(140,200,255,0.75)" : "rgba(170,185,220,0.55)";
        ctx.beginPath();
        ctx.arc(x, y, p.kind === "airport" ? 2.4 : 1.7, 0, 7);
        ctx.fill();
        ctx.fillStyle = p.kind === "airport" ? "rgba(140,200,255,0.6)" : "rgba(160,175,210,0.5)";
        ctx.fillText(p.kind === "airport" ? "✈ " + p.name : p.name, x + 5, y + 3);
      }
    }
    // major cities
    for (const c of cities) {
      const [x, y] = project(c.lat, c.lon);
      ctx.fillStyle = "rgba(235,242,255,0.95)";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(235,242,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 7);
      ctx.stroke();
      ctx.font = "600 14px Fraunces, Georgia, serif";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 6;
      ctx.fillText(c.name, x + 10, y + 5);
      ctx.shadowBlur = 0;
    }
  }

  function drawOrigin() {
    if (!origin) return;
    const [x, y] = project(origin.lat, origin.lon);
    const ph = (pulseT % 2400) / 2400;
    for (const off of [0, 0.5]) {
      const p = (ph + off) % 1;
      ctx.strokeStyle = `rgba(124,255,196,${0.5 * (1 - p)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 6 + p * 34, 0, 7);
      ctx.stroke();
    }
    ctx.fillStyle = "#7cffc4";
    ctx.shadowColor = "#7cffc4";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ---- interaction ------------------------------------------------------- */

  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener("pointerdown", e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (dragging) {
      view.lon -= (e.clientX - lastX) / (view.scale * COS);
      view.lat += (e.clientY - lastY) / view.scale;
      lastX = e.clientX; lastY = e.clientY;
      needsDraw = true;
    }
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0014);
    const [lat, lon] = unproject(e.clientX, e.clientY);
    view.scale = Math.max(60, Math.min(900, view.scale * f));
    const [x2, y2] = project(lat, lon);
    view.lon += (x2 - e.clientX) / (view.scale * COS);
    view.lat -= (y2 - e.clientY) / view.scale;
    needsDraw = true;
  }, { passive: false });

  function loop(t) {
    pulseT = t;
    draw();           // pulse animates continuously; draw is cheap (<2ms)
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(loop);

  return {
    GRID, setGeo, setField, setIsolines, setNetwork, setLabels, setOrigin,
    project, unproject, canvas,
    get view() { return view; },
  };
})();
