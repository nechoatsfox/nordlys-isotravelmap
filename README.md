# Nordlys — an isochrone atlas of southern Norway

A self-contained, dependency-free interactive map that answers one question:
**how far can you get from a southern-Norwegian city, door to door, by every
real means of travel?**

Pick an origin — Oslo, Bergen, Stavanger, Kristiansand, Arendal, Drammen or
Haugesund — and toggle flights, trains, coaches and driving. Optionally pick
a destination city to see the quickest and the slowest sensible route
highlighted on the map. The map paints continuous
travel-time bands ("isochrones") over real geography, computed live from a
hand-researched model of Norway's actual 2025–26 transport network.

## Running it

No build step, no dependencies:

```sh
cd norway-isochrones
python3 -m http.server 8000     # any static server works
# open http://localhost:8000
```

- **Hover** the map to read the travel time anywhere.
- **Click** anywhere for a suggested itinerary (legs, lines, durations).
- **Drag / scroll** to pan and zoom.
- Try Bergen with *only trains* enabled — the Bergensbanen appears as a
  string of pearls across the Hardangervidda.

## How it works

1. **Transport graph** (`data/network.js`) — ~70 real places (cities, towns,
   stations, airports) joined by ~170 edges, each one a real service or road
   with a researched duration and service frequency:
   - *rail*: Bergensbanen, Sørtoget (Sørlandsbanen), Arendalsbanen,
     Vestfoldbanen RE11, Jærbanen, Vossebanen R40, RE10/RE20, Flytoget,
     Flåmsbana, Bybanen line 1
   - *bus*: Kystbussen NW400, Konkurrenten NW192 / Vy VY190,
     Haukeliekspressen NW180, Valdresekspressen NW161, Vy VY1, AKT 100,
     Skyss 600/925/930, Flybussen airport links
   - *flight*: every real domestic route between OSL, BGO, SVG, KRS, TRF and
     HAU (block times; SAS / Norwegian / Widerøe)
   - *car*: real road routes (E18, E39, E134, Rv7, E16, Rv13, Rv52 …) with
     the E39 ferry crossings (Halhjem–Sandvikvåg 45 min, Mortavika–Arsvågen
     25 min) baked in — **Rogfast is not open** (forecast ~2033), so
     Bergen–Stavanger really is ~4½ h by road.

2. **Multimodal shortest paths** (`js/engine.js`) — Dijkstra over
   (place × line) states with a *planned-departure* waiting model:
   - your first boarding costs no wait (you time your departure, as classic
     isochrone maps assume);
   - each transfer to a different line costs 5 min + half the line's headway
     (capped at 40 min), so a 4-departures-a-day mountain coach really hurts
     to connect to;
   - every flight costs +70 min of check-in / security / exit, plus a small
     surcharge on low-frequency routes;
   - your car does not follow you onto a train — driving is allowed *to* the
     station or airport (park & ride) but not after boarding transit.

3. **Continuous field** — travel time at any point is the best over all
   reached places of *time(place) + local access*, where access distance is
   crow-fly × 1.32 (typical road circuity) at 58 km/h if driving is enabled,
   otherwise walking pace. Marching squares extracts the contour lines at
   30-minute intervals; the colour field underneath is the same data on an
   aurora-inspired ramp (green = near, violet/magenta = far).

4. **Geography** — Natural Earth 1:10 m coastlines (real fjords, real lakes),
   clipped and simplified by `tools/prepare_geo.py` into a 60 KB bundle.
   Custom canvas cartography: equirectangular projection with fixed
   cos 60° compression — affine in (lon, lat), so the raster field, vector
   coastlines and labels stay perfectly registered at any zoom.

## Validation

`node tools/validate.js` checks the model against 25 published journey-time
anchors (and full network connectivity from all six origins):

| Journey | Model | Published |
|---|---|---|
| Oslo → Bergen, rail | 6 h 36 | 6 h 31–7 h 05 (Vy Bergensbanen) |
| Oslo → Kristiansand, rail | 4 h 25 | 4 h 26 fastest (Go-Ahead Sørtoget) |
| Oslo → Stavanger, rail | 7 h 43 | ~7 h 46 (Sørtoget) |
| Oslo → Tønsberg, rail | 1 h 15 | 1 h 13 (RE11, post-2025 double track) |
| Oslo → Kristiansand, coach | 4 h 30 | 4 h 18–4 h 30 (VY190 / NW192) |
| Bergen → Stavanger, coach | 4 h 45 | 4 h 20–5 h 25 (Kystbussen, 2 ferries) |
| Bergen → Stavanger, car | 4 h 35 | ~4 h 30–5 h (E39 + 2 ferries) |
| Oslo → Bergen, car | 6 h 42 | ~7 h (Rv7 Hardangervidda) |
| Oslo → Haugesund, coach | 7 h 50 | ~8 h–8 h 30 (Haukeliekspressen) |
| Oslo → Bergen, door-to-door by air | 3 h 32 | Flytoget 20 m + processes + 55 m block + Bybanen 45 m |

## Data sources

Researched June 2026. The figures come from the operators that feed
[Entur's national stops & timetable dataset](https://developer.entur.org/stops-and-timetable-data)
(the Entur API itself is not called at runtime — the model is a calibrated
snapshot, not live):

- **Rail**: Vy (Bergensbanen F4, RE10/RE11, R40), Go-Ahead Nordic (Sørtoget,
  Jærbanen, Arendalsbanen R50), Bane NOR & Jernbanedirektoratet line data,
  Flytoget (19–22 min, every 10 min), torp.no (Torp station shuttle).
- **Tram/metro**: Skyss — Bybanen line 1 Byparken–Flesland 44–45 min,
  5–10 min headway.
- **Coach**: nor-way.no (Kystbussen NW400 incl. both E39 ferries,
  Konkurrenten NW192, Haukeliekspressen NW180, Valdresekspressen NW161),
  vy.no / vybuss (VY190 4 h 18 Oslo–Kristiansand, VY1), AKT (line 100 coast,
  line 35 Kjevik), flybussen.no (Bergen ~30 min, Stavanger 25–30 min).
- **Flights**: route maps & schedules via flightsfrom.com / flightconnections
  — OSL–BGO ~55 min block ≈20×/day, OSL–SVG ~13×/day, OSL–KRS ~5×/day,
  BGO–SVG ~14–20×/day (Widerøe/SAS), BGO–KRS ~4–5×/day (Widerøe),
  TRF–BGO 2–3×/day (Widerøe); no direct SVG–KRS service exists.
- **Roads & ferries**: Statens vegvesen route structure; E39 ferries
  Halhjem–Sandvikvåg (45 min, ~every 20 min) and Mortavika–Arsvågen (25 min,
  ~every 15 min); Rogfast completion forecast 2033 (Wikipedia/tunnelbuilder);
  drive-time cross-checks from visitbergen.com, fjordtours, travelmath,
  Nye Veier (Kristiansand–Stavanger ~3 h 05 today).
- **Coastline / lakes**: [Natural Earth](https://www.naturalearthdata.com/)
  1:10 m (public domain).

### Honest limitations

- Times are *typical good-day* figures; winter mountain passes (E134
  Haukelifjell, Rv7 Hardangervidda) can close or run in convoy.
- Local access around each node is crow-fly × 1.32 — real fjord detours can
  be worse than that, so a few shores look closer than they drive.
- Night trains and seasonal express-boat routes (Kystekspressen etc.) are
  not modelled; intermediate timetable points are interpolated (±10 min)
  between verified end-to-end anchors.

## Project layout

```
index.html            shell & panel
css/style.css         the look
js/engine.js          Dijkstra, waiting model, field, marching squares
js/render.js          canvas cartography (projection, layers, interaction)
js/app.js             UI wiring
data/network.js       researched transport graph  ← the data
data/geo.js           Natural Earth geometry bundle
tools/prepare_geo.py  rebuilds data/geo.js from Natural Earth GeoJSON
tools/validate.js     checks the model against published times
```
