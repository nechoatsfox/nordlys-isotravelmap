/* Nordlys — transport network for southern Norway.
 *
 * Hand-built from published 2025–26 data. Edge durations are calibrated so
 * end-to-end journey times match published timetables (sources in README):
 *   rail   Vy (Bergensbanen, Vestfoldbanen, RE10/RE11, Vossebanen R40),
 *          Go-Ahead Nordic (Sørtoget, Jærbanen, Arendalsbanen R50),
 *          Flytoget, Flåmsbana, Bybanen (Skyss)
 *   bus    Kystbussen NW400, Konkurrenten NW192 / Vy VY190,
 *          Haukeliekspressen NW180, Valdresekspressen NW161, Vy VY1,
 *          AKT line 100, Skyss Hardanger lines, Flybussen
 *   flight SAS / Norwegian / Widerøe domestic routes (block times)
 *   car    real road routes; E39 ferry crossings (Halhjem–Sandvikvåg 45 min,
 *          Mortavika–Arsvågen 25 min) baked into the segment + avg wait.
 *
 * Edge format: [from, to, mode, minutes, headwayMinutes, lineName]
 * headway ≈ service span / departures per day (used for transfer waits).
 */
"use strict";

window.NETWORK = {

  nodes: [
    // ---- selectable origins (Haugesund lives in the Haugalandet block) ----
    { id: "oslo",         name: "Oslo",         lat: 59.913, lon: 10.752, kind: "city" },
    { id: "bergen",       name: "Bergen",       lat: 60.393, lon: 5.324,  kind: "city" },
    { id: "stavanger",    name: "Stavanger",    lat: 58.970, lon: 5.733,  kind: "city" },
    { id: "kristiansand", name: "Kristiansand", lat: 58.146, lon: 7.996,  kind: "city" },
    { id: "arendal",      name: "Arendal",      lat: 58.461, lon: 8.766,  kind: "city" },
    { id: "drammen",      name: "Drammen",      lat: 59.744, lon: 10.204, kind: "city" },

    // ---- airports ----
    { id: "osl_ap", name: "Oslo lufthavn",  lat: 60.194, lon: 11.100, kind: "airport" },
    { id: "bgo_ap", name: "Flesland",       lat: 60.293, lon: 5.218,  kind: "airport" },
    { id: "svg_ap", name: "Sola",           lat: 58.877, lon: 5.638,  kind: "airport" },
    { id: "krs_ap", name: "Kjevik",         lat: 58.204, lon: 8.085,  kind: "airport" },
    { id: "trf_ap", name: "Torp",           lat: 59.187, lon: 10.259, kind: "airport" },
    { id: "hau_ap", name: "Karmøy",         lat: 59.345, lon: 5.208,  kind: "airport" },

    // ---- Bergensbanen / Hallingdal / Valdres / Sogn ----
    { id: "honefoss",    name: "Hønefoss",    lat: 60.169, lon: 10.256, kind: "town" },
    { id: "nesbyen",     name: "Nesbyen",     lat: 60.568, lon: 9.103,  kind: "town" },
    { id: "gol",         name: "Gol",         lat: 60.700, lon: 8.948,  kind: "town" },
    { id: "al",          name: "Ål",          lat: 60.631, lon: 8.561,  kind: "town" },
    { id: "geilo",       name: "Geilo",       lat: 60.534, lon: 8.206,  kind: "town" },
    { id: "finse",       name: "Finse",       lat: 60.603, lon: 7.500,  kind: "town" },
    { id: "myrdal",      name: "Myrdal",      lat: 60.734, lon: 7.123,  kind: "town" },
    { id: "voss",        name: "Voss",        lat: 60.630, lon: 6.441,  kind: "town" },
    { id: "dale",        name: "Dale",        lat: 60.589, lon: 5.819,  kind: "town" },
    { id: "flam",        name: "Flåm",        lat: 60.863, lon: 7.113,  kind: "town" },
    { id: "laerdal",     name: "Lærdal",      lat: 61.100, lon: 7.481,  kind: "town" },
    { id: "sogndal",     name: "Sogndal",     lat: 61.231, lon: 7.103,  kind: "town" },
    { id: "fagernes",    name: "Fagernes",    lat: 60.986, lon: 9.238,  kind: "town" },
    { id: "eidfjord",    name: "Eidfjord",    lat: 60.467, lon: 7.072,  kind: "town" },
    { id: "norheimsund", name: "Norheimsund", lat: 60.371, lon: 6.146,  kind: "town" },

    // ---- Hardanger / Haugalandet / Sunnhordland ----
    { id: "odda",        name: "Odda",        lat: 60.069, lon: 6.545, kind: "town" },
    { id: "roldal",      name: "Røldal",      lat: 59.830, lon: 6.820, kind: "town" },
    { id: "etne",        name: "Etne",        lat: 59.664, lon: 5.939, kind: "town" },
    { id: "haugesund",   name: "Haugesund",   lat: 59.413, lon: 5.268, kind: "town" },
    { id: "stord",       name: "Stord",       lat: 59.780, lon: 5.500, kind: "town" },
    { id: "os",          name: "Os",          lat: 60.184, lon: 5.470, kind: "town" },

    // ---- E134 / Telemark interior ----
    { id: "kongsberg",    name: "Kongsberg",    lat: 59.668, lon: 9.650, kind: "town" },
    { id: "notodden",     name: "Notodden",     lat: 59.561, lon: 9.258, kind: "town" },
    { id: "bo",           name: "Bø",           lat: 59.413, lon: 9.057, kind: "town" },
    { id: "seljord",      name: "Seljord",      lat: 59.486, lon: 8.629, kind: "town" },
    { id: "haukeligrend", name: "Haukeligrend", lat: 59.748, lon: 7.190, kind: "town" },

    // ---- Vestfold / Grenland coast ----
    { id: "tonsberg",   name: "Tønsberg",   lat: 59.267, lon: 10.408, kind: "town" },
    { id: "torp",       name: "Torp st.",   lat: 59.166, lon: 10.258, kind: "station" },
    { id: "sandefjord", name: "Sandefjord", lat: 59.131, lon: 10.217, kind: "town" },
    { id: "larvik",     name: "Larvik",     lat: 59.053, lon: 10.035, kind: "town" },
    { id: "porsgrunn",  name: "Porsgrunn",  lat: 59.141, lon: 9.656,  kind: "town" },
    { id: "skien",      name: "Skien",      lat: 59.209, lon: 9.609,  kind: "town" },

    // ---- Sørlandet coast & Sørlandsbanen interior ----
    { id: "kragero",     name: "Kragerø",     lat: 58.869, lon: 9.412, kind: "town" },
    { id: "risor",       name: "Risør",       lat: 58.720, lon: 9.230, kind: "town" },
    { id: "tvedestrand", name: "Tvedestrand", lat: 58.622, lon: 8.931, kind: "town" },
    { id: "grimstad",    name: "Grimstad",    lat: 58.340, lon: 8.594, kind: "town" },
    { id: "lillesand",   name: "Lillesand",   lat: 58.249, lon: 8.377, kind: "town" },
    { id: "nelaug",      name: "Nelaug",      lat: 58.660, lon: 8.629, kind: "station" },
    { id: "drangedal",   name: "Drangedal",   lat: 59.100, lon: 9.075, kind: "town" },
    { id: "gjerstad",    name: "Gjerstad",    lat: 58.872, lon: 9.011, kind: "station" },
    { id: "mandal",      name: "Mandal",      lat: 58.029, lon: 7.452, kind: "town" },
    { id: "lyngdal",     name: "Lyngdal",     lat: 58.139, lon: 7.085, kind: "town" },
    { id: "flekkefjord", name: "Flekkefjord", lat: 58.297, lon: 6.661, kind: "town" },
    { id: "moi",         name: "Moi",         lat: 58.456, lon: 6.546, kind: "town" },

    // ---- Jæren / Rogaland ----
    { id: "egersund", name: "Egersund", lat: 58.451, lon: 6.000, kind: "town" },
    { id: "bryne",    name: "Bryne",    lat: 58.735, lon: 5.647, kind: "town" },
    { id: "sandnes",  name: "Sandnes",  lat: 58.852, lon: 5.735, kind: "town" },

    // ---- Østfold / Innlandet (context east of Oslo) ----
    { id: "moss",        name: "Moss",        lat: 59.434, lon: 10.658, kind: "town" },
    { id: "fredrikstad", name: "Fredrikstad", lat: 59.218, lon: 10.930, kind: "town" },
    { id: "sarpsborg",   name: "Sarpsborg",   lat: 59.284, lon: 11.110, kind: "town" },
    { id: "halden",      name: "Halden",      lat: 59.124, lon: 11.387, kind: "town" },
    { id: "eidsvoll",    name: "Eidsvoll",    lat: 60.329, lon: 11.262, kind: "town" },
    { id: "hamar",       name: "Hamar",       lat: 60.795, lon: 11.068, kind: "town" },
    { id: "lillehammer", name: "Lillehammer", lat: 61.115, lon: 10.466, kind: "town" },
    { id: "gjovik",      name: "Gjøvik",      lat: 60.796, lon: 10.692, kind: "town" },
    { id: "elverum",     name: "Elverum",     lat: 60.882, lon: 11.563, kind: "town" },
    { id: "kongsvinger", name: "Kongsvinger", lat: 60.191, lon: 12.001, kind: "town" },

    // ---- Central Norway: Innlandet north / Dovrebanen ----
    { id: "dombas",    name: "Dombås",    lat: 62.073, lon: 9.124,  kind: "town" },
    { id: "oppdal",   name: "Oppdal",    lat: 62.593, lon: 9.691,  kind: "town" },
    { id: "roros",    name: "Røros",     lat: 62.574, lon: 11.386, kind: "town" },
    { id: "tynset",   name: "Tynset",    lat: 62.278, lon: 10.776, kind: "town" },

    // ---- Trøndelag ----
    { id: "trondheim",  name: "Trondheim",          lat: 63.430, lon: 10.395, kind: "city" },
    { id: "hell",       name: "Hell",               lat: 63.445, lon: 10.877, kind: "station" },
    { id: "steinkjer",  name: "Steinkjer",           lat: 64.014, lon: 11.496, kind: "town" },
    { id: "namsos",     name: "Namsos",             lat: 64.467, lon: 11.497, kind: "town" },
    { id: "trd_ap",     name: "Trondheim lufthavn", lat: 63.457, lon: 10.924, kind: "airport" },

    // ---- Møre og Romsdal ----
    { id: "andalsnes",     name: "Åndalsnes",     lat: 62.563, lon: 7.689,  kind: "town" },
    { id: "molde",         name: "Molde",         lat: 62.739, lon: 7.159,  kind: "city" },
    { id: "alesund",       name: "Ålesund",       lat: 62.472, lon: 6.155,  kind: "city" },
    { id: "kristiansund_n", name: "Kristiansund", lat: 63.110, lon: 7.728,  kind: "town" },
    { id: "aes_ap",        name: "Vigra",         lat: 62.560, lon: 6.110,  kind: "airport" },
    { id: "mol_ap",        name: "Molde lufthavn",lat: 62.745, lon: 7.262,  kind: "airport" },

    // ---- Nordland ----
    { id: "bronnoysund",  name: "Brønnøysund",  lat: 65.474, lon: 12.214, kind: "town" },
    { id: "mosjoen",      name: "Mosjøen",      lat: 65.835, lon: 13.189, kind: "town" },
    { id: "sandnessjoen", name: "Sandnessjøen", lat: 66.011, lon: 12.633, kind: "town" },
    { id: "mo_i_rana",    name: "Mo i Rana",    lat: 66.313, lon: 14.142, kind: "town" },
    { id: "fauske",       name: "Fauske",       lat: 67.259, lon: 15.393, kind: "town" },
    { id: "bodo",         name: "Bodø",         lat: 67.282, lon: 14.404, kind: "city" },
    { id: "svolvaer",     name: "Svolvær",      lat: 68.234, lon: 14.566, kind: "town" },
    { id: "narvik",       name: "Narvik",       lat: 68.438, lon: 17.427, kind: "town" },
    { id: "bod_ap",       name: "Bodø lufthavn",    lat: 67.268, lon: 14.365, kind: "airport" },
    { id: "evenes_ap",    name: "Evenes",           lat: 68.491, lon: 16.678, kind: "airport" },
    { id: "svj_ap",       name: "Svolvær lufthavn", lat: 68.243, lon: 14.669, kind: "airport" },

    // ---- Troms ----
    { id: "harstad",  name: "Harstad",         lat: 68.798, lon: 16.541, kind: "town" },
    { id: "finnsnes", name: "Finnsnes",         lat: 69.231, lon: 17.977, kind: "town" },
    { id: "tromso",   name: "Tromsø",           lat: 69.650, lon: 18.956, kind: "city" },
    { id: "tos_ap",   name: "Tromsø lufthavn",  lat: 69.683, lon: 18.919, kind: "airport" },

    // ---- Finnmark ----
    { id: "alta",       name: "Alta",                   lat: 69.969, lon: 23.271, kind: "town" },
    { id: "hammerfest", name: "Hammerfest",             lat: 70.663, lon: 23.683, kind: "town" },
    { id: "kirkenes",   name: "Kirkenes",               lat: 69.726, lon: 30.044, kind: "town" },
    { id: "alf_ap",     name: "Alta lufthavn",          lat: 69.977, lon: 23.371, kind: "airport" },
    { id: "hft_ap",     name: "Hammerfest lufthavn",    lat: 70.680, lon: 23.669, kind: "airport" },
    { id: "kkn_ap",     name: "Kirkenes lufthavn",      lat: 69.726, lon: 29.891, kind: "airport" },
  ],

  edges: [
    /* ================= RAIL ================= */

    // Bergensbanen (Vy F4): Oslo–Bergen 6h31 total, 4–5 dep/day
    ["oslo", "drammen", "rail", 35, 210, "Bergensbanen"],
    ["drammen", "honefoss", "rail", 53, 150, "Bergensbanen"],
    ["honefoss", "nesbyen", "rail", 67, 150, "Bergensbanen"],
    ["nesbyen", "gol", "rail", 11, 150, "Bergensbanen"],
    ["gol", "al", "rail", 17, 120, "Bergensbanen"],
    ["al", "geilo", "rail", 18, 120, "Bergensbanen"],
    ["geilo", "finse", "rail", 36, 100, "Bergensbanen"],
    ["finse", "myrdal", "rail", 26, 85, "Bergensbanen"],
    ["myrdal", "voss", "rail", 42, 65, "Bergensbanen"],
    ["voss", "bergen", "rail", 67, 50, "Bergensbanen"],

    // Vossebanen local (Vy R40, 19 dep/day)
    ["voss", "dale", "rail", 30, 60, "R40 Vossebanen"],
    ["dale", "bergen", "rail", 41, 65, "R40 Vossebanen"],

    // Flåmsbana (Myrdal–Flåm, ~9 dep/day)
    ["myrdal", "flam", "rail", 55, 75, "Flåmsbana"],

    // Sørlandsbanen / Sørtoget (Go-Ahead): Oslo–Kristiansand 4h26, –Stavanger 7h46
    ["oslo", "drammen", "rail", 35, 200, "Sørtoget"],
    ["drammen", "kongsberg", "rail", 34, 40, "Sørtoget"],
    ["kongsberg", "bo", "rail", 46, 125, "Sørtoget"],
    ["bo", "drangedal", "rail", 28, 135, "Sørtoget"],
    ["drangedal", "gjerstad", "rail", 24, 160, "Sørtoget"],
    ["gjerstad", "nelaug", "rail", 30, 155, "Sørtoget"],
    ["nelaug", "kristiansand", "rail", 57, 125, "Sørtoget"],
    ["kristiansand", "moi", "rail", 84, 130, "Sørtoget"],
    ["moi", "egersund", "rail", 34, 150, "Sørtoget"],
    ["egersund", "bryne", "rail", 35, 200, "Sørtoget"],
    ["bryne", "sandnes", "rail", 15, 200, "Sørtoget"],
    ["sandnes", "stavanger", "rail", 13, 200, "Sørtoget"],

    // Arendalsbanen (R50 shuttle timed with Sørtoget at Nelaug)
    ["nelaug", "arendal", "rail", 37, 125, "Arendalsbanen"],

    // Jærbanen locals (Go-Ahead, 15–30 min headway)
    ["egersund", "bryne", "rail", 38, 40, "Jærbanen"],
    ["bryne", "sandnes", "rail", 16, 25, "Jærbanen"],
    ["sandnes", "stavanger", "rail", 14, 25, "Jærbanen"],

    // Vestfoldbanen (Vy RE11, hourly; Oslo–Tønsberg 1h13)
    ["oslo", "drammen", "rail", 33, 60, "RE11 Vestfoldbanen"],
    ["drammen", "tonsberg", "rail", 36, 60, "RE11 Vestfoldbanen"],
    ["tonsberg", "torp", "rail", 15, 60, "RE11 Vestfoldbanen"],
    ["torp", "sandefjord", "rail", 4, 60, "RE11 Vestfoldbanen"],
    ["sandefjord", "larvik", "rail", 12, 55, "RE11 Vestfoldbanen"],
    ["larvik", "porsgrunn", "rail", 11, 55, "RE11 Vestfoldbanen"],
    ["porsgrunn", "skien", "rail", 8, 55, "RE11 Vestfoldbanen"],

    // Airport rail, Oslo (Flytoget every 10 min + Vy regionals)
    ["oslo", "osl_ap", "rail", 20, 10, "Flytoget"],
    ["drammen", "oslo", "rail", 34, 60, "RE10/Flytoget"],
    ["osl_ap", "eidsvoll", "rail", 8, 60, "RE10 Dovrebanen"],
    ["oslo", "osl_ap", "rail", 23, 60, "RE10 Dovrebanen"],
    ["eidsvoll", "hamar", "rail", 33, 55, "RE10 Dovrebanen"],
    ["hamar", "lillehammer", "rail", 45, 60, "RE10 Dovrebanen"],

    // Østfoldbanen (RE20, ~half-hourly)
    ["oslo", "moss", "rail", 30, 60, "RE20 Østfoldbanen"],
    ["moss", "fredrikstad", "rail", 24, 50, "RE20 Østfoldbanen"],
    ["fredrikstad", "sarpsborg", "rail", 11, 50, "RE20 Østfoldbanen"],
    ["sarpsborg", "halden", "rail", 18, 50, "RE20 Østfoldbanen"],

    // Gjøvikbanen, Kongsvingerbanen, Rørosbanen
    ["oslo", "gjovik", "rail", 123, 60, "Gjøvikbanen"],
    ["oslo", "kongsvinger", "rail", 72, 40, "Kongsvingerbanen"],
    ["hamar", "elverum", "rail", 24, 145, "Rørosbanen"],

    // Bybanen line 1, Bergen sentrum–Flesland (5–10 min headway, 44 min)
    ["bergen", "bgo_ap", "rail", 45, 8, "Bybanen 1"],

    /* ================= CENTRAL + NORTHERN RAIL ================= */

    // Dovrebanen long-distance Vy (Oslo–Trondheim ~6h37)
    // oslo→lillehammer covered by existing RE10 Dovrebanen edges
    ["lillehammer", "dombas",    "rail",  85, 130, "Dovrebanen Vy"],
    ["dombas",      "oppdal",    "rail",  62, 130, "Dovrebanen Vy"],
    ["oppdal",      "trondheim", "rail", 118, 120, "Dovrebanen Vy"],

    // Rørosbanen (Hamar–Trondheim via Røros, ~5h35, 2–3 dep/day)
    ["hamar",  "tynset",    "rail",  97, 360, "Rørosbanen"],
    ["tynset", "roros",     "rail",  52, 360, "Rørosbanen"],
    ["roros",  "trondheim", "rail", 158, 360, "Rørosbanen"],

    // Trønderbanen locals (Trondheim–Steinkjer, ~30 min headway)
    ["trondheim", "hell",      "rail", 26, 30, "Trønderbanen"],
    ["hell",      "steinkjer", "rail", 49, 35, "Trønderbanen"],

    // Trondheim Lufthavn Værnes: Hell station is adjacent
    ["hell", "trd_ap", "walk", 5, 0, "Værnes gangbro"],

    // Raumabanen Vy (Dombås–Åndalsnes, 1h57, 4 dep/day)
    ["dombas", "andalsnes", "rail", 117, 240, "Raumabanen Vy"],

    // Nordlandsbanen Vy (Trondheim–Bodø, ~9h50, 2/day)
    ["trondheim", "steinkjer",  "rail",  75, 270, "Nordlandsbanen Vy"],
    ["steinkjer", "mosjoen",    "rail", 185, 390, "Nordlandsbanen Vy"],
    ["mosjoen",   "mo_i_rana",  "rail",  82, 390, "Nordlandsbanen Vy"],
    ["mo_i_rana", "fauske",     "rail", 140, 390, "Nordlandsbanen Vy"],
    ["fauske",    "bodo",       "rail",  32, 360, "Nordlandsbanen Vy"],

    /* ================= AIRPORT GROUND LINKS (bus / walk) ================= */

    ["bergen", "bgo_ap", "bus", 30, 30, "Flybussen Bergen"],
    ["stavanger", "svg_ap", "bus", 31, 15, "Flybussen Stavanger"],
    ["kristiansand", "krs_ap", "bus", 22, 50, "AKT 35 Kjevik"],
    ["haugesund", "hau_ap", "bus", 25, 80, "Flybussen Haugesund"],
    ["torp", "trf_ap", "walk", 12, 0, "Torp shuttle"],

    // Trondheim Lufthavn Værnes (rail via hell→trd_ap walk above; also bus/car)
    ["trondheim", "trd_ap", "bus", 35, 15, "Flybussen Trondheim"],
    ["trondheim", "trd_ap", "car", 35,  0, "E14"],

    // Ålesund Vigra
    ["alesund", "aes_ap", "bus", 25, 30, "Flybussen Ålesund"],
    ["alesund", "aes_ap", "car", 25,  0, "Fv60"],

    // Molde
    ["molde", "mol_ap", "bus", 12, 30, "Flybussen Molde"],
    ["molde", "mol_ap", "car", 12,  0, "Fv62"],

    // Bodø (airport is central)
    ["bodo", "bod_ap", "bus",  8, 20, "Flybussen Bodø"],
    ["bodo", "bod_ap", "car",  8,  0, "Sentrum"],

    // Harstad/Narvik Evenes — distant from both cities
    ["harstad", "evenes_ap", "bus",  65, 45, "Flybussen Harstad"],
    ["narvik",  "evenes_ap", "bus",  85, 90, "Flybussen Narvik"],
    ["harstad", "evenes_ap", "car",  65,  0, "E10"],
    ["narvik",  "evenes_ap", "car",  75,  0, "E10"],

    // Svolvær
    ["svolvaer", "svj_ap", "bus",  5, 30, "Shuttle Svolvær"],
    ["svolvaer", "svj_ap", "car",  5,  0, "Sentrum"],

    // Tromsø (central airport)
    ["tromso", "tos_ap", "bus", 10, 15, "Flybussen Tromsø"],
    ["tromso", "tos_ap", "car",  8,  0, "Langnesveien"],

    // Alta
    ["alta", "alf_ap", "bus",  8, 20, "Flybussen Alta"],
    ["alta", "alf_ap", "car",  8,  0, "E6"],

    // Hammerfest
    ["hammerfest", "hft_ap", "bus",  8, 30, "Flybussen Hammerfest"],
    ["hammerfest", "hft_ap", "car",  8,  0, "E69"],

    // Kirkenes
    ["kirkenes", "kkn_ap", "bus", 10, 30, "Flybussen Kirkenes"],
    ["kirkenes", "kkn_ap", "car", 10,  0, "E6"],

    /* ================= FLIGHTS (block times) ================= */

    ["osl_ap", "bgo_ap", "flight", 55, 50, "OSL–BGO (SAS/Norwegian)"],
    ["osl_ap", "svg_ap", "flight", 52, 80, "OSL–SVG (SAS/Norwegian)"],
    ["osl_ap", "krs_ap", "flight", 50, 200, "OSL–KRS (SAS/Norwegian)"],
    ["osl_ap", "hau_ap", "flight", 50, 170, "OSL–HAU (Norwegian)"],
    ["bgo_ap", "svg_ap", "flight", 40, 70, "BGO–SVG (Widerøe/SAS)"],
    ["bgo_ap", "krs_ap", "flight", 55, 220, "BGO–KRS (Widerøe)"],
    ["trf_ap", "bgo_ap", "flight", 52, 400, "TRF–BGO (Widerøe)"],

    // ===== FROM OSLO =====
    ["osl_ap", "trd_ap",    "flight",  50,  60, "OSL–TRD (SAS/Norwegian)"],
    ["osl_ap", "aes_ap",    "flight",  55,  90, "OSL–AES (SAS/Norwegian)"],
    ["osl_ap", "mol_ap",    "flight",  55, 180, "OSL–MOL (Widerøe)"],
    ["osl_ap", "bod_ap",    "flight",  90,  90, "OSL–BOO (Norwegian/SAS)"],
    ["osl_ap", "tos_ap",    "flight", 100,  75, "OSL–TOS (SAS/Norwegian)"],
    ["osl_ap", "evenes_ap", "flight",  95, 120, "OSL–EVE (SAS/Norwegian)"],
    ["osl_ap", "alf_ap",    "flight", 125, 180, "OSL–ALF (SAS)"],
    ["osl_ap", "hft_ap",    "flight", 130, 240, "OSL–HFT (Widerøe/SAS)"],
    ["osl_ap", "kkn_ap",    "flight", 140, 120, "OSL–KKN (SAS/Norwegian)"],

    // ===== FROM BERGEN =====
    ["bgo_ap", "trd_ap", "flight",  55,  90, "BGO–TRD (SAS)"],
    ["bgo_ap", "aes_ap", "flight",  40, 180, "BGO–AES (Widerøe)"],
    ["bgo_ap", "bod_ap", "flight",  80, 180, "BGO–BOO (Norwegian)"],
    ["bgo_ap", "tos_ap", "flight",  95, 240, "BGO–TOS (SAS)"],

    // ===== FROM STAVANGER =====
    ["svg_ap", "trd_ap", "flight",  55, 120, "SVG–TRD (SAS)"],
    ["svg_ap", "bod_ap", "flight",  90, 240, "SVG–BOO (Widerøe)"],

    // ===== INTRA-NORTH — Widerøe + SAS regional =====
    ["trd_ap", "aes_ap",    "flight",  35,  90, "TRD–AES (Widerøe)"],
    ["trd_ap", "mol_ap",    "flight",  35, 120, "TRD–MOL (Widerøe)"],
    ["trd_ap", "bod_ap",    "flight",  55,  90, "TRD–BOO (Norwegian/SAS)"],
    ["trd_ap", "tos_ap",    "flight",  80, 120, "TRD–TOS (Norwegian/SAS)"],
    ["bod_ap", "tos_ap",    "flight",  40,  90, "BOO–TOS (Norwegian/SAS)"],
    ["bod_ap", "evenes_ap", "flight",  35, 120, "BOO–EVE (Widerøe)"],
    ["bod_ap", "svj_ap",    "flight",  25, 120, "BOO–SVJ (Widerøe)"],
    ["evenes_ap", "tos_ap", "flight",  35,  90, "EVE–TOS (Widerøe)"],
    ["evenes_ap", "svj_ap", "flight",  20, 120, "EVE–SVJ (Widerøe)"],
    ["tos_ap", "svj_ap",    "flight",  35, 120, "TOS–SVJ (Widerøe)"],
    ["tos_ap", "alf_ap",    "flight",  40,  90, "TOS–ALF (Widerøe/SAS)"],
    ["tos_ap", "hft_ap",    "flight",  50, 120, "TOS–HFT (Widerøe)"],
    ["tos_ap", "kkn_ap",    "flight",  45,  90, "TOS–KKN (Widerøe/SAS)"],
    ["alf_ap", "hft_ap",    "flight",  30, 120, "ALF–HFT (Widerøe)"],
    ["alf_ap", "kkn_ap",    "flight",  45, 120, "ALF–KKN (Widerøe)"],

    /* ================= EXPRESS COACHES ================= */

    // Kystbussen NW400 Bergen–Stavanger (4h20–5h25, up to 14/day, 2 ferries incl.)
    ["bergen", "stord", "bus", 115, 120, "Kystbussen NW400"],
    ["stord", "haugesund", "bus", 65, 120, "Kystbussen NW400"],
    ["haugesund", "stavanger", "bus", 125, 140, "Kystbussen NW400"],

    // Konkurrenten NW192 / Vy VY190 Oslo–Kristiansand (4h18–4h30, ~hourly daytime)
    ["oslo", "risor", "bus", 165, 60, "VY190/NW192 Sørlandsekspressen"],
    ["risor", "tvedestrand", "bus", 20, 60, "VY190/NW192 Sørlandsekspressen"],
    ["tvedestrand", "arendal", "bus", 25, 60, "VY190/NW192 Sørlandsekspressen"],
    ["arendal", "grimstad", "bus", 20, 60, "VY190/NW192 Sørlandsekspressen"],
    ["grimstad", "lillesand", "bus", 15, 60, "VY190/NW192 Sørlandsekspressen"],
    ["lillesand", "kristiansand", "bus", 25, 60, "VY190/NW192 Sørlandsekspressen"],

    // VY190 continuation Kristiansand–Stavanger (~3h45)
    ["kristiansand", "mandal", "bus", 35, 150, "VY190 kyst"],
    ["mandal", "lyngdal", "bus", 30, 150, "VY190 kyst"],
    ["lyngdal", "flekkefjord", "bus", 30, 150, "VY190 kyst"],
    ["flekkefjord", "sandnes", "bus", 96, 215, "VY190 kyst"],
    ["sandnes", "stavanger", "bus", 20, 150, "VY190 kyst"],

    // AKT 100 coastal locals Kristiansand–Arendal (every ~30 min)
    ["kristiansand", "lillesand", "bus", 37, 30, "AKT 100"],
    ["lillesand", "grimstad", "bus", 21, 30, "AKT 100"],
    ["grimstad", "arendal", "bus", 25, 30, "AKT 100"],

    // Haukeliekspressen NW180 Oslo–Haugesund (~8h-8h30, few/day)
    ["oslo", "kongsberg", "bus", 90, 240, "Haukeliekspressen NW180"],
    ["kongsberg", "notodden", "bus", 40, 240, "Haukeliekspressen NW180"],
    ["notodden", "seljord", "bus", 40, 200, "Haukeliekspressen NW180"],
    ["seljord", "haukeligrend", "bus", 90, 240, "Haukeliekspressen NW180"],
    ["haukeligrend", "roldal", "bus", 55, 240, "Haukeliekspressen NW180"],
    ["roldal", "etne", "bus", 78, 190, "Haukeliekspressen NW180"],
    ["etne", "haugesund", "bus", 77, 185, "Haukeliekspressen NW180"],
    ["roldal", "odda", "bus", 45, 280, "Skyss 930 (korr. Seljestad)"],

    // Vy VY1 Oslo–Notodden (2h10)
    ["oslo", "notodden", "bus", 124, 75, "VY1"],

    // Valdresekspressen NW161 (Oslo–Fagernes ~3h, some continue to Sogn)
    ["oslo", "honefoss", "bus", 70, 120, "Valdresekspressen NW161"],
    ["honefoss", "fagernes", "bus", 105, 120, "Valdresekspressen NW161"],
    ["fagernes", "laerdal", "bus", 100, 300, "Valdresekspressen NW161"],
    ["laerdal", "sogndal", "bus", 55, 300, "Valdresekspressen NW161"],

    // Skyss Hardanger (Bergen–Norheimsund–Odda ~3h)
    ["bergen", "norheimsund", "bus", 80, 95, "Skyss 925"],
    ["norheimsund", "odda", "bus", 77, 180, "Skyss 930"],

    // Skyss 600 Bergen–Os (frequent local)
    ["bergen", "os", "bus", 38, 10, "Skyss 600"],

    /* ================= ROADS (car; ferries baked in where noted) ========= */

    // E18 Oslo → Kristiansand (3h55 total; Oslo–Arendal ~3h10)
    ["oslo", "drammen", "car", 30, 0, "E18"],
    ["drammen", "tonsberg", "car", 40, 0, "E18"],
    ["tonsberg", "sandefjord", "car", 18, 0, "E18"],
    ["sandefjord", "larvik", "car", 12, 0, "E18"],
    ["larvik", "porsgrunn", "car", 20, 0, "E18"],
    ["porsgrunn", "skien", "car", 12, 0, "Rv36"],
    ["porsgrunn", "kragero", "car", 35, 0, "E18"],
    ["kragero", "risor", "car", 25, 0, "E18"],
    ["porsgrunn", "risor", "car", 40, 0, "E18"],
    ["risor", "tvedestrand", "car", 14, 0, "E18"],
    ["tvedestrand", "arendal", "car", 16, 0, "E18"],
    ["arendal", "grimstad", "car", 15, 0, "E18"],
    ["grimstad", "lillesand", "car", 12, 0, "E18"],
    ["lillesand", "kristiansand", "car", 18, 0, "E18"],

    // E39 Kristiansand → Stavanger (~3h)
    ["kristiansand", "mandal", "car", 30, 0, "E39"],
    ["mandal", "lyngdal", "car", 25, 0, "E39"],
    ["lyngdal", "flekkefjord", "car", 25, 0, "E39"],
    ["flekkefjord", "moi", "car", 25, 0, "E39"],
    ["moi", "egersund", "car", 35, 0, "Fv44"],
    ["moi", "sandnes", "car", 55, 0, "E39"],
    ["egersund", "bryne", "car", 40, 0, "Fv44 Jæren"],
    ["bryne", "sandnes", "car", 18, 0, "E39"],
    ["sandnes", "stavanger", "car", 18, 0, "E39"],

    // E39 north: Stavanger → Haugesund → Bergen (ferries baked in)
    ["stavanger", "haugesund", "car", 110, 0, "E39 + ferje Mortavika–Arsvågen"],
    ["haugesund", "stord", "car", 55, 0, "E39 Bømlafjordtunnelen"],
    ["stord", "os", "car", 80, 0, "E39 + ferje Sandvikvåg–Halhjem"],
    ["os", "bergen", "car", 30, 0, "E39"],

    // E134 Drammen → Haugesund over Haukelifjell
    ["drammen", "kongsberg", "car", 35, 0, "E134"],
    ["kongsberg", "notodden", "car", 30, 0, "E134"],
    ["notodden", "seljord", "car", 55, 0, "E134"],
    ["notodden", "bo", "car", 35, 0, "Rv36"],
    ["bo", "seljord", "car", 30, 0, "Rv36"],
    ["bo", "skien", "car", 50, 0, "Rv36"],
    ["bo", "drangedal", "car", 40, 0, "Fv38"],
    ["drangedal", "kragero", "car", 45, 0, "Fv38"],
    ["seljord", "haukeligrend", "car", 75, 0, "E134"],
    ["haukeligrend", "roldal", "car", 50, 0, "E134"],
    ["roldal", "odda", "car", 45, 0, "Rv13 Seljestad"],
    ["roldal", "etne", "car", 75, 0, "E134"],
    ["etne", "haugesund", "car", 45, 0, "E134"],
    ["etne", "stord", "car", 60, 0, "E39/Fv"],

    // Rv7 / Hardanger / E16: Oslo → Bergen (~6h45–7h)
    ["oslo", "honefoss", "car", 50, 0, "E16"],
    ["honefoss", "nesbyen", "car", 80, 0, "Rv7 Hallingdal"],
    ["nesbyen", "gol", "car", 22, 0, "Rv7"],
    ["gol", "al", "car", 20, 0, "Rv7"],
    ["al", "geilo", "car", 18, 0, "Rv7"],
    ["geilo", "eidfjord", "car", 80, 0, "Rv7 Hardangervidda"],
    ["eidfjord", "norheimsund", "car", 60, 0, "Rv7 + Hardangerbrua"],
    ["norheimsund", "bergen", "car", 75, 0, "Rv7 Kvamskogen"],
    ["eidfjord", "voss", "car", 60, 0, "Rv13 + Hardangerbrua"],
    ["odda", "eidfjord", "car", 55, 0, "Rv13"],
    ["odda", "norheimsund", "car", 95, 0, "Fv49 Jondalstunnelen"],
    ["voss", "bergen", "car", 80, 0, "E16"],
    ["voss", "dale", "car", 30, 0, "E16"],
    ["dale", "bergen", "car", 50, 0, "E16"],
    ["voss", "flam", "car", 60, 0, "E16 Gudvanga"],
    ["flam", "laerdal", "car", 30, 0, "E16 Lærdalstunnelen"],
    ["laerdal", "sogndal", "car", 55, 0, "Rv5 + ferje Mannheller"],
    ["laerdal", "fagernes", "car", 110, 0, "E16 Filefjell"],
    ["gol", "laerdal", "car", 80, 0, "Rv52 Hemsedalsfjellet"],
    ["gol", "fagernes", "car", 55, 0, "Fv51 Golsfjellet"],
    ["fagernes", "honefoss", "car", 105, 0, "E16 Valdres"],
    ["kongsberg", "geilo", "car", 130, 0, "Fv40 Numedal"],

    // Airport access by car
    ["oslo", "osl_ap", "car", 35, 0, "E6"],
    ["bergen", "bgo_ap", "car", 25, 0, "Fv580"],
    ["stavanger", "svg_ap", "car", 20, 0, "Rv509"],
    ["sandnes", "svg_ap", "car", 20, 0, "Fv443"],
    ["kristiansand", "krs_ap", "car", 16, 0, "Rv41"],
    ["sandefjord", "trf_ap", "car", 10, 0, "Fv303"],
    ["tonsberg", "trf_ap", "car", 20, 0, "E18"],
    ["haugesund", "hau_ap", "car", 20, 0, "Fv47"],

    // Østfold / Innlandet roads
    ["oslo", "moss", "car", 45, 0, "E6"],
    ["moss", "fredrikstad", "car", 30, 0, "Rv110"],
    ["fredrikstad", "sarpsborg", "car", 15, 0, "Rv109"],
    ["sarpsborg", "halden", "car", 25, 0, "E6/Rv21"],
    ["moss", "tonsberg", "car", 65, 0, "Ferje Moss–Horten + E18"],
    ["osl_ap", "eidsvoll", "car", 15, 0, "E6"],
    ["eidsvoll", "hamar", "car", 45, 0, "E6"],
    ["hamar", "lillehammer", "car", 45, 0, "E6"],
    ["hamar", "elverum", "car", 30, 0, "Rv25"],
    ["hamar", "gjovik", "car", 35, 0, "Rv4 via Mjøsbrua"],
    ["gjovik", "lillehammer", "car", 45, 0, "Fv250"],
    ["oslo", "gjovik", "car", 110, 0, "Rv4"],
    ["oslo", "kongsvinger", "car", 80, 0, "Rv2"],
    ["kongsvinger", "elverum", "car", 75, 0, "Rv2/Rv20"],
    ["honefoss", "gjovik", "car", 100, 0, "Fv33"],

    /* ================= ROADS — CENTRAL + NORTHERN NORWAY ================= */

    // E6: Lillehammer → Trondheim
    ["lillehammer", "dombas",    "car",  88, 0, "E6"],
    ["dombas",      "oppdal",    "car",  57, 0, "E6"],
    ["oppdal",      "trondheim", "car",  90, 0, "E6"],

    // E6/E14: Trondheim area
    ["trondheim", "hell",      "car", 30, 0, "E14"],
    ["trondheim", "steinkjer", "car", 75, 0, "E6"],
    ["steinkjer", "namsos",    "car", 65, 0, "E6/Rv17"],

    // E6: Trondheim → Bodø → Narvik
    ["steinkjer",  "mosjoen",   "car", 195, 0, "E6"],
    ["mosjoen",    "mo_i_rana", "car",  90, 0, "E6"],
    ["mo_i_rana",  "fauske",    "car", 140, 0, "E6"],
    ["fauske",     "bodo",      "car",  35, 0, "E6"],
    ["fauske",     "narvik",    "car", 165, 0, "E6"],

    // E6/E10/Rv83: northern Norway
    ["narvik",   "harstad",  "car", 100, 0, "E10/Rv83 + Rombaksbrua"],
    ["narvik",   "svolvaer", "car", 155, 0, "E10 Lofotentunnelen"],
    ["narvik",   "tromso",   "car", 265, 0, "E6/E8"],
    ["harstad",  "finnsnes", "car",  75, 0, "E10/Rv83"],
    ["harstad",  "tromso",   "car", 165, 0, "E10/Rv83/E8"],
    ["finnsnes", "tromso",   "car",  95, 0, "E8"],
    ["tromso",   "alta",     "car", 400, 0, "E6/E8"],
    ["alta",     "hammerfest","car", 160, 0, "E69/E6"],
    ["alta",     "kirkenes", "car", 390, 0, "E6"],

    // Rv17 Kystriksveien (coastal Nordland)
    ["mosjoen",      "bronnoysund",  "car", 155, 0, "Rv17 Kystriksveien"],
    ["bronnoysund",  "sandnessjoen", "car",  85, 0, "Rv17"],
    ["sandnessjoen", "mo_i_rana",    "car",  80, 0, "Rv17/E6"],

    // E136 / E39: Åndalsnes – Molde – Ålesund – Trondheim
    ["andalsnes",      "dombas",         "car", 115, 0, "Rv15"],
    ["andalsnes",      "molde",          "car",  75, 0, "E136/E39"],
    ["andalsnes",      "alesund",        "car", 100, 0, "E136/E39"],
    ["molde",          "alesund",        "car",  80, 0, "E39 Atlanterhavstunnelen"],
    ["molde",          "kristiansund_n", "car",  80, 0, "E39 Fannefjordtunnelen"],
    ["kristiansund_n", "trondheim",      "car", 185, 0, "E39"],
    ["molde",          "trondheim",      "car", 200, 0, "E39"],

    /* ================= EXPRESS COACHES — CENTRAL + NORTHERN ================= */

    // Lavprisekspressen NW100 Oslo–Trondheim (~6h30)
    ["oslo",        "hamar",       "bus", 128, 90,  "Lavprisekspressen NW100"],
    ["hamar",       "lillehammer", "bus",  47, 90,  "Lavprisekspressen NW100"],
    ["lillehammer", "oppdal",      "bus", 120, 120, "Lavprisekspressen NW100"],
    ["oppdal",      "trondheim",   "bus", 130, 90,  "Lavprisekspressen NW100"],

    // Trondheim–Ålesund express (~4h30)
    ["trondheim", "andalsnes", "bus", 195, 180, "Nettbuss/Tide Trondheim–Ålesund"],
    ["andalsnes", "alesund",   "bus", 100, 120, "Nettbuss/Tide E136–E39"],

    // Northern Norway (where no rail exists north of Bodø)
    ["tromso",   "finnsnes",   "bus", 100, 180, "Troms fylkestrafikk 300"],
    ["finnsnes", "harstad",    "bus",  90, 180, "Troms fylkestrafikk 300"],
    ["narvik",   "harstad",    "bus", 150, 180, "Nor-Way / lokalt"],
    ["tromso",   "alta",       "bus", 380, 240, "Lavprisekspressen NW50"],
    ["alta",     "hammerfest", "bus", 165, 180, "FFR / Boreal"],
    ["alta",     "kirkenes",   "bus", 420, 300, "Nor-Way NW50 Finnmark"],
  ],
};
