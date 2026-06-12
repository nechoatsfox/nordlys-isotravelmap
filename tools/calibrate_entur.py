#!/usr/bin/env python3
"""Calibrate data/network.js against live Entur journey-planner data.

For every scheduled edge (rail / bus) the tool asks Entur's national journey
planner (https://api.entur.io/journey-planner/v3/graphql, open data, NLOD)
for direct services between the two node coordinates on a reference weekday,
then derives:

  minutes  = fastest direct in-vehicle time
  headway  = search window / number of direct departures

Car, walk and flight edges are left untouched (Entur does no car routing,
and flight block times are stable).

The app itself stays fully static — run this occasionally and commit the
refreshed network.js. Dry-run by default; pass --write to update the file.

Usage:
  python3 tools/calibrate_entur.py                 # report only
  python3 tools/calibrate_entur.py --write         # update network.js
  python3 tools/calibrate_entur.py --mode rail     # restrict to one mode
  python3 tools/calibrate_entur.py --edge oslo:drammen
"""
import argparse
import datetime as dt
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

API = "https://api.entur.io/journey-planner/v3/graphql"
CLIENT_NAME = "nechoatsfox-nordlys"
SEARCH_WINDOW_MIN = 960          # 06:00–22:00 service day
SLEEP_BETWEEN_CALLS = 0.3        # stay polite (limit is 2000 req / 2 min)

# our mode -> Entur transportModes (long-distance buses are "coach" at
# Entur; Bybanen is "tram" but sits on a rail edge in our model)
ENTUR_MODES = {
    "rail": ["rail", "tram"],
    "bus": ["bus", "coach"],
}

NETWORK = Path(__file__).resolve().parent.parent / "data" / "network.js"

NODE_RE = re.compile(
    r'\{ id: "([a-z_]+)",\s*name: "[^"]+",\s*lat: ([\d.]+), lon: ([\d.]+)')
EDGE_RE = re.compile(
    r'^(\s*)\["([a-z_]+)", "([a-z_]+)", "([a-z]+)", (\d+), (\d+), "([^"]*)"\],\s*$')

QUERY = """
query($from: Location!, $to: Location!, $dt: DateTime!, $modes: Modes!) {
  trip(from: $from, to: $to, dateTime: $dt, modes: $modes,
       numTripPatterns: 20, searchWindow: %d) {
    tripPatterns {
      expectedStartTime
      legs { mode duration line { publicCode name } }
    }
  }
}
""" % SEARCH_WINDOW_MIN


def next_tuesday_6am():
    d = dt.date.today()
    d += dt.timedelta(days=(1 - d.weekday()) % 7 or 7)
    return d.isoformat() + "T06:00:00+02:00"


def entur_trip(frm, to, modes, when):
    body = json.dumps({
        "query": QUERY,
        "variables": {
            "from": {"coordinates": {"latitude": frm[0], "longitude": frm[1]}},
            "to": {"coordinates": {"latitude": to[0], "longitude": to[1]}},
            "dt": when,
            "modes": {"accessMode": "foot", "egressMode": "foot",
                      "transportModes": [{"transportMode": m} for m in modes]},
        },
    }).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Content-Type": "application/json",
        "ET-Client-Name": CLIENT_NAME,
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    if out.get("errors"):
        raise RuntimeError(out["errors"][0].get("message", "graphql error"))
    return out["data"]["trip"]["tripPatterns"]


def direct_services(patterns):
    """Group direct (single transit leg) patterns by line publicCode.

    Returns {publicCode: {"min": fastest minutes, "deps": set of departure
    times, "name": line name}}.
    """
    services = {}
    for p in patterns:
        transit = [l for l in p["legs"] if l["mode"] != "foot"]
        if len(transit) != 1:
            continue
        leg = transit[0]
        code = (leg["line"] or {}).get("publicCode") or "?"
        name = (leg["line"] or {}).get("name") or ""
        minutes = round(leg["duration"] / 60)
        s = services.setdefault(code, {"min": minutes, "deps": set(), "name": name})
        s["min"] = min(s["min"], minutes)
        s["deps"].add(p["expectedStartTime"])
    return services


def match_codes(line_name, services):
    """Codes whose publicCode appears in our edge's line string (NW400,
    RE11, VY190 ...) — used to tell apart parallel edges on the same pair."""
    low = line_name.lower()
    return [c for c in services if c != "?" and c.lower() in low]


def round5(v):
    return max(5, 5 * round(v / 5))


def headway_from_deps(deps):
    """Average spacing between observed departures. More robust than
    window/count because the API caps results at 20 trip patterns."""
    if len(deps) < 2:
        return 480
    ts = sorted(dt.datetime.fromisoformat(d) for d in deps)
    span = (ts[-1] - ts[0]).total_seconds() / 60
    return round5(min(480, span / (len(ts) - 1)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--write", action="store_true", help="update network.js in place")
    ap.add_argument("--mode", choices=["rail", "bus"], help="calibrate one mode only")
    ap.add_argument("--edge", help="calibrate one pair only, e.g. oslo:drammen")
    args = ap.parse_args()

    src = NETWORK.read_text()
    nodes = {m[1]: (float(m[2]), float(m[3])) for m in NODE_RE.finditer(src)}
    lines = src.splitlines(keepends=True)

    # collect calibratable edges, grouped by (from, to, mode)
    groups = {}
    for i, line in enumerate(lines):
        m = EDGE_RE.match(line)
        if not m:
            continue
        frm, to, mode = m[2], m[3], m[4]
        if mode not in ENTUR_MODES or (args.mode and mode != args.mode):
            continue
        if args.edge and args.edge not in (f"{frm}:{to}", f"{to}:{frm}"):
            continue
        groups.setdefault((frm, to, mode), []).append(
            {"lineno": i, "indent": m[1], "min": int(m[5]),
             "headway": int(m[6]), "line": m[7]})

    when = next_tuesday_6am()
    print(f"calibrating {sum(len(v) for v in groups.values())} edges "
          f"against Entur for {when[:10]}\n")

    changed = 0
    for (frm, to, mode), edges in sorted(groups.items()):
        try:
            patterns = entur_trip(nodes[frm], nodes[to], ENTUR_MODES[mode], when)
        except Exception as e:
            print(f"  !  {mode:5} {frm}→{to}: query failed ({e})")
            continue
        time.sleep(SLEEP_BETWEEN_CALLS)
        services = direct_services(patterns)
        if not services:
            print(f"  ?  {mode:5} {frm}→{to}: no direct service found, kept as-is")
            continue

        for e in edges:
            if len(edges) == 1:
                codes = match_codes(e["line"], services)
                if not codes and re.search(r"(NW|VY|FX)\d+", e["line"]):
                    # edge models a named express that Entur doesn't run
                    # direct here (pickup restrictions, junction stops) —
                    # don't let a slow local overwrite it
                    print(f"  ?  {mode:5} {frm}→{to} [{e['line']}]: express "
                          f"not direct, only {sorted(services)}, kept as-is")
                    continue
                pool = ({c: services[c] for c in codes} if codes else services)
                # fastest service wins; slow locals on the same pair
                # (school buses, city lines) don't count toward headway
                new_min = min(s["min"] for s in pool.values())
                comparable = {c: s for c, s in pool.items()
                              if s["min"] <= new_min * 1.4}
                deps = set().union(*(s["deps"] for s in comparable.values()))
                label = ", ".join(f'{c} {s["name"]}' for c, s in comparable.items())
            else:
                codes = match_codes(e["line"], services)
                if not codes:
                    print(f"  ?  {mode:5} {frm}→{to} [{e['line']}]: "
                          f"can't match a line among {sorted(services)}, kept as-is")
                    continue
                new_min = min(services[c]["min"] for c in codes)
                deps = set().union(*(services[c]["deps"] for c in codes))
                label = ", ".join(f'{c} {services[c]["name"]}' for c in codes)

            new_head = headway_from_deps(deps)
            mark = " " if (new_min == e["min"] and new_head == e["headway"]) else "*"
            print(f"  {mark}  {mode:5} {frm}→{to:14} "
                  f"{e['min']:4} → {new_min:4} min   "
                  f"headway {e['headway']:4} → {new_head:4}   ({label})")
            if mark == "*":
                changed += 1
                lines[e["lineno"]] = (
                    f'{e["indent"]}["{frm}", "{to}", "{mode}", '
                    f'{new_min}, {new_head}, "{e["line"]}"],\n')

    print(f"\n{changed} edges differ from Entur")
    if args.write and changed:
        NETWORK.write_text("".join(lines))
        print(f"wrote {NETWORK} — re-run tools/validate.js to check anchors")
    elif changed:
        print("dry run — pass --write to update network.js")


if __name__ == "__main__":
    main()
