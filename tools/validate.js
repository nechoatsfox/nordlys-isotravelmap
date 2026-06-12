#!/usr/bin/env node
/* Validates the network model against published journey-time anchors. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = { window: {}, console, performance: { now: () => Date.now() } };
vm.createContext(ctx);
for (const f of ["data/network.js", "js/engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}
const Engine = ctx.Engine || vm.runInContext("Engine", ctx);
Engine.init(ctx.window.NETWORK);

const fmt = m => isFinite(m) ? `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}` : "unreachable";

// [origin, dest, modes, expected minutes, tolerance, label]
const CASES = [
  ["oslo", "bergen", ["rail"], 391, 25, "Bergensbanen 6h31"],
  ["oslo", "kristiansand", ["rail"], 265, 20, "Sørtoget 4h26"],
  ["oslo", "stavanger", ["rail"], 466, 30, "Sørtoget 7h46"],
  ["oslo", "tonsberg", ["rail"], 75, 12, "RE11 1h13"],
  ["oslo", "skien", ["rail"], 143, 20, "RE11 ~2h20"],
  ["oslo", "arendal", ["rail"], 245, 35, "Sørtoget+Arendalsbanen ~4h"],
  ["oslo", "bergen", ["flight", "rail"], 210, 30, "fly: Flytoget+OSL proc+55m+Bybanen ~3h30"],
  ["oslo", "stavanger", ["flight", "rail", "bus"], 205, 30, "fly via Sola ~3h25"],
  ["oslo", "kristiansand", ["car"], 235, 25, "E18 drive 3h55"],
  ["oslo", "bergen", ["car"], 405, 35, "Rv7 drive ~6h45"],
  ["oslo", "stavanger", ["car"], 425, 40, "E18+E39 drive ~7h"],
  ["bergen", "stavanger", ["car"], 275, 30, "E39 2 ferries ~4h35"],
  ["bergen", "stavanger", ["bus"], 285, 30, "Kystbussen 4h45"],
  ["bergen", "stavanger", ["flight", "rail", "bus"], 200, 30, "BGO-SVG fly ~3h20"],
  ["oslo", "kristiansand", ["bus"], 270, 25, "NW192/VY190 4h30"],
  ["oslo", "arendal", ["bus"], 210, 25, "bus Oslo-Arendal 3h30"],
  ["kristiansand", "stavanger", ["bus"], 225, 25, "VY190 3h45"],
  ["kristiansand", "stavanger", ["car"], 178, 20, "E39 ~3h"],
  ["kristiansand", "arendal", ["car"], 49, 12, "E18 ~55m"],
  ["oslo", "haugesund", ["bus"], 480, 45, "Haukeliekspressen ~8h"],
  ["oslo", "geilo", ["rail"], 208, 20, "Bergensbanen 3h28"],
  ["oslo", "geilo", ["car"], 190, 25, "Rv7 ~3h15"],
  ["drammen", "bergen", ["rail"], 356, 30, "Bergensbanen from Drammen"],
  ["arendal", "bergen", ["flight", "rail", "bus"], 280, 60, "bus to KRS + Widerøe BGO-KRS"],
];

let fail = 0;
for (const [o, d, modes, exp, tol, label] of CASES) {
  const set = new Set([...modes, "walk"]);
  const res = Engine.shortestTimes(o, set);
  const t = res.time[Engine.nodeIdx(d)];
  const ok = isFinite(t) && Math.abs(t - exp) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${o}→${d} [${modes}] = ${fmt(t)} (expect ~${fmt(exp)}±${tol}m) ${label}`);
  if (!ok && isFinite(t)) {
    const legs = Engine.routeTo(res, Engine.nodeIdx(d)) || [];
    for (const l of legs) console.log(`    ${l.mode} ${Engine.nodes[l.from].id}→${Engine.nodes[l.to].id} ${l.min}m ${l.line}`);
  }
}

// connectivity: every node reachable with all modes from every origin city
for (const o of ["oslo", "bergen", "stavanger", "kristiansand", "arendal", "drammen"]) {
  const res = Engine.shortestTimes(o, new Set(["rail", "bus", "flight", "car", "walk"]));
  const un = Engine.nodes.filter((n, i) => !isFinite(res.time[i])).map(n => n.id);
  if (un.length) { fail++; console.log(`✗ unreachable from ${o}: ${un.join(", ")}`); }
}

console.log(fail ? `\n${fail} FAILURES` : "\nall checks passed");
process.exit(fail ? 1 : 0);
