#!/usr/bin/env python3
"""Query Entur for northern Norway corridor connections.

For a predefined set of town pairs (rail and bus only — flights and car are
hand-tuned), prints network.js edge definitions with real-timetable times
and headways. Use the output to review and adjust the hard-coded values in
data/network.js, or run calibrate_entur.py --write for ongoing refreshes.

Usage:
  python3 tools/build_north.py              # print all edges
  python3 tools/build_north.py --mode rail  # rail only
  python3 tools/build_north.py --mode bus   # bus only
"""
import argparse
import datetime as dt
import json
import sys
import time
import urllib.request
from pathlib import Path

API = "https://api.entur.io/journey-planner/v3/graphql"
CLIENT_NAME = "nechoatsfox-nordlys"
SEARCH_WINDOW_MIN = 960
SLEEP_BETWEEN = 0.3

# Pairs to query: (from_id, to_id, mode)
PAIRS = [
    # Dovrebanen
    ("lillehammer", "dombas",    "rail"),
    ("dombas",      "oppdal",    "rail"),
    ("oppdal",      "trondheim", "rail"),
    # Rørosbanen
    ("hamar",   "tynset",    "rail"),
    ("tynset",  "roros",     "rail"),
    ("roros",   "trondheim", "rail"),
    # Trønderbanen
    ("trondheim", "hell",      "rail"),
    ("hell",      "steinkjer", "rail"),
    # Raumabanen
    ("dombas", "andalsnes", "rail"),
    # Nordlandsbanen
    ("trondheim", "steinkjer",  "rail"),
    ("steinkjer", "mosjoen",    "rail"),
    ("mosjoen",   "mo_i_rana",  "rail"),
    ("mo_i_rana", "fauske",     "rail"),
    ("fauske",    "bodo",       "rail"),
    # Northern buses
    ("oslo",       "hamar",       "bus"),
    ("hamar",      "lillehammer", "bus"),
    ("lillehammer","oppdal",      "bus"),
    ("oppdal",     "trondheim",   "bus"),
    ("trondheim",  "andalsnes",   "bus"),
    ("andalsnes",  "alesund",     "bus"),
    ("tromso",     "finnsnes",    "bus"),
    ("finnsnes",   "harstad",     "bus"),
    ("tromso",     "alta",        "bus"),
    ("alta",       "hammerfest",  "bus"),
]

ENTUR_MODES = {
    "rail": ["rail", "tram"],
    "bus":  ["bus", "coach"],
}

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


def load_nodes():
    import re
    network_path = Path(__file__).resolve().parent.parent / "data" / "network.js"
    src = network_path.read_text()
    pat = re.compile(r'\{ id: "([a-z_]+)",\s*name: "[^"]+",\s*lat: ([\d.]+), lon: ([\d.]+)')
    return {m[1]: (float(m[2]), float(m[3])) for m in pat.finditer(src)}


def entur_trip(frm_coord, to_coord, modes, when):
    body = json.dumps({
        "query": QUERY,
        "variables": {
            "from": {"coordinates": {"latitude": frm_coord[0], "longitude": frm_coord[1]}},
            "to":   {"coordinates": {"latitude": to_coord[0],  "longitude": to_coord[1]}},
            "dt": when,
            "modes": {
                "accessMode": "foot", "egressMode": "foot",
                "transportModes": [{"transportMode": m} for m in modes],
            },
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
    services = {}
    for p in patterns:
        transit = [leg for leg in p["legs"] if leg["mode"] != "foot"]
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


def headway(deps):
    if len(deps) < 2:
        return 480
    ts = sorted(dt.datetime.fromisoformat(d) for d in deps)
    span = (ts[-1] - ts[0]).total_seconds() / 60
    raw = min(480, span / (len(ts) - 1))
    return max(5, 5 * round(raw / 5))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mode", choices=["rail", "bus"])
    args = ap.parse_args()

    nodes = load_nodes()
    when = next_tuesday_6am()
    print(f"// Entur calibration output — {when[:10]}\n")

    for frm, to, mode in PAIRS:
        if args.mode and mode != args.mode:
            continue
        if frm not in nodes or to not in nodes:
            print(f"// SKIP {frm}→{to}: node not in network.js", file=sys.stderr)
            continue

        try:
            patterns = entur_trip(nodes[frm], nodes[to], ENTUR_MODES[mode], when)
        except Exception as e:
            print(f'// ERROR {mode} {frm}→{to}: {e}')
            time.sleep(SLEEP_BETWEEN)
            continue

        time.sleep(SLEEP_BETWEEN)
        svcs = direct_services(patterns)

        if not svcs:
            print(f'// NO DIRECT SERVICE {mode} {frm}→{to}')
            continue

        best = min(svcs.values(), key=lambda s: s["min"])
        h = headway(best["deps"])
        line_name = best["name"] or mode
        print(f'    ["{frm}", "{to}", "{mode}", {best["min"]}, {h}, "{line_name}"],')


if __name__ == "__main__":
    main()
