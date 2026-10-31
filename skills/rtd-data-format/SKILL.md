---
name: rtd-data-format
description: Prepare railway route data and timetables (JSON/CSV) so they can be imported into the online railway time diagram maker (diagram-maker.html). Use when asked to organize, convert, clean or validate route / station / train timetable data for this site.
---

# Preparing data for the railway time diagram maker

The site draws x-t train diagrams. It imports three kinds of data: **route**, **trains per direction**, **settings**.
Full spec: `DATA_STRUCTURE.md` at the repo root (sections 3-5). This skill is the short, agent-oriented version.

## Rules for the agent

- **Work only from explicit data** (a timetable page, a CSV, a PDF the user gave, a crawler output). Do not invent times, mileage or stations.
- If something required is missing, **ask the user**. Required: station names, cumulative mileage (kilo), train times.
- Optional and safe to omit (defaults apply): `stopsec`, `alias`, `track_layout`, `topology`, `settings`.
- Never fill in seconds that the source does not have. Never guess an arrival time from a departure time; leave `""`.
- Track layout and topology are fiddly: read the appendices, and prefer asking the human (see below).
- Output UTF-8 JSON. Do not rename fields.

## Deliverables

| File | Content |
|---|---|
| `route.json` | Route JSON (below) |
| `trains-1.json` | Trains of bound 1 (順行, follows route order) |
| `trains-2.json` | Trains of bound 2 (逆行, reverse order) |

Or one `AllData.json` = `{ "route": {...}, "trains": { "1": {...}, "2": {...} }, "settings": {...} }` (settings optional).

### Several operation modes (weekday / holiday, each day of the week...)
When the timetable differs by day, deliver one file set per day type (e.g. `mon/trains-1.json`, `sat/trains-1.json`), or one `AllData.json` with `opmodes`:
- `trains[bound].timetable` holds each **distinct** train once (identical trains of several days are written once).
- `opmodes: [{ "title": "", "description": "", "days": ["mon", ...], "trains": { "1": [indices], "2": [indices] } }]`: the indices point into `trains[bound].timetable`, in that day's timetable order; the same index may appear in several modes.
- `days` tokens: `mon` `tue` `wed` `thu` `fri` `sat` `sun` `hol` (holidays). A blank `title` is named after the days (平日, 假日, 週二至四...), so prefer tokens to typed day names.
- Trains with the same number but different times on different days are simply two entries.

## Route JSON

```json
{
  "route_name": "JR香椎線",
  "stations": [
    { "name": "西戸崎", "kilo": 0,   "stopsec": 60, "alias": "" },
    { "name": "海ノ中道", "kilo": 2.1, "stopsec": 60, "alias": "" }
  ],
  "track_layout": { ... },   // optional, Appendix A
  "topology": { ... }        // optional, Appendix B
}
```

- `stations` in bound-1 order. `kilo` = cumulative km, first station `0`, **strictly increasing** (the site refuses to generate otherwise).
- `stopsec`: default dwell seconds, used when a stop has a departure but no arrival. Omit to use the site default (60).
- `alias`: text shown on the right of the diagram; usually `""`.
- Station names must be unique enough for matching: trains refer to stations by `station_order`, names are informational.
- Loop lines (e.g. Yamanote): the diagram is linear. Split into one run from the first to the first return to the terminal station.

Route CSV alternative (no header): `name,kilo[,stopsec][,alias]` per line. CSV carries no track layout or topology.

## Train JSON (one file per bound)

```json
{
  "route_name": "JR香椎線",
  "bound": 1,
  "station_count": 16,
  "station_record": ["西戸崎", "..."],
  "train_count": 84,
  "timetable": [
    {
      "train_number": "2721C",
      "settings": { "train_name": "普通", "train_color": 1 },
      "origin":   { "station_name": "", "departure": "" },
      "terminal": { "station_name": "", "arrival": "" },
      "timetable": [
        { "station_order": 0, "station_name": "西戸崎", "arrival": "0528", "departure": "0529" }
      ]
    }
  ]
}
```

`timetable` (outer array) and `station_record` are read on import: stops are matched to the route's stations by name (longest common subsequence), so extra stations in the file are skipped and missing ones left blank; `station_order` indexes `station_record`. `bound`, `station_count`, `train_count`, `route_name` are informational (still emit them correctly).

### `station_order`
Index into **that bound's** station list.
- bound 1: index in `route.stations`.
- bound 2: index in the **reversed** list: `stationCount - 1 - routeIndex`. The first stop of a bound-2 train at the route's last station has `station_order: 0`.
- Entries sorted by `station_order` ascending. List only stations the train stops at or passes through with a known time.
- Stations the train skips without a known time: omit.

### Times
- Strings, `"hhmm"` or `"hhmmss"`. `""` = no time. Max `"2400"`. Invalid values are dropped on import.
- **Past midnight**: write the wall-clock time (`"0005"`), keep entries in route order; the site unwraps the day automatically. Do not write `"2405"`.
- Each stop needs a `departure` to be drawn. Rules:

| Situation | `arrival` | `departure` |
|---|---|---|
| Normal stop, both known | as published | as published |
| Only departure known | `""` (**unknown**, site derives `departure - stopsec`) | time |
| Arrival == departure published (e.g. both `0541`) | `"0541"` | `"0541"` (keep as is; do not add 30 s) |
| Pass-through with a known time | time | same time |
| First stop of the train | `""` | departure |
| Last stop of the train | arrival | **same as arrival** (needed so the stop is drawn) |

- If the source only has minute precision, that is fine. The site has a "時刻精度不足" setting to handle it; do not fake seconds.

### Train fields
- `train_number`: string, may be empty.
- `settings.train_name`: string, e.g. `"普通"`, `"快速"`.
- `settings.train_color`: integer 0-10, index into the site's 11-color palette (0 and 1 share a color). Pick one color per train type; ask the user if they care.
- `hidden`: optional, `true` = the train does not run for now (not drawn, left out of restoring passing times). Omit it unless the user asks.

### Cross-line (through-running) trains
A train that comes from, or continues onto, a branch line which is **not** a station of this route:
- Put only the stops on this route in `timetable`.
- `origin = { station_name, departure }`: the branch station the train comes from and its departure time. `terminal = { station_name, arrival }`: the branch station it goes to and the arrival time. `""` = none.
- `station_name` must **exactly match** a station in `route.topology.branches[i][*].stations[*].name` (Appendix B); otherwise no junction point is produced (silently ignored).
- The site interpolates the time it passes the junction by distance. This needs `kilo` for the branch stations (distance from the junction) and the origin must be before the train's first stop on this route (terminal: after the last).
- It does not have to be the real start / end: prefer the branch station **nearest to the junction** that has a published time (less interpolation error). Other branch stops are not needed.
- A train that runs through this route **without stopping at any of its stations** (e.g. an express joining from one branch and leaving onto another): `timetable: []` with both `origin` and `terminal` set. The site interpolates both junction times between `origin.departure` and `terminal.arrival` by distance. The origin's junction must come before the terminal's in this bound's order. Do not invent passing times for it.

### Pinned stops (optional)
A stop may carry `"pinned": true`: its times are exact (to the second) and the passing-time solvers never move them. The site sets it on times laid onto a route by its overlay feature (疊圖, `DATA_STRUCTURE.md` 5.5). Only write it when the user asks or the times come from such an overlay; omit it otherwise. CSV cannot carry it.

## Train CSV (alternative)

One train per column. Rows: `N = station count`, station order = that bound's order.
- Departure-only file: row 0 = train number, rows 1..N = departure per station (`""` = not stopping), then optional: train name, color, origin name, origin departure, terminal name, terminal arrival.
- Arrival+departure file: two columns per train (`[arrival, departure]`), identification rows (number, name, color, origin/terminal) are written in the first of the two columns, the second left empty.
- No quoting: fields must not contain commas/newlines. Details: `DATA_STRUCTURE.md` 5.2.

## Settings JSON
Not needed for data prep. Missing fields = defaults. Do not hand-write it unless asked; export it from the site (see `rtd-operate-site`).

## Validate before delivering

Check in code (a few lines of Python/JS), not by eye:
1. `kilo[0] == 0`, strictly increasing, no `null`.
2. Every `station_order` is in `[0, stationCount)`, sorted ascending, no duplicates in one train.
3. All times match `^\d{4}(\d{2})?$`, minutes/seconds < 60, hours <= 24.
4. Within a train, times are non-decreasing in route order except for one midnight wrap.
5. Every stop has a `departure` (last stop: `departure == arrival`).
6. For bound 2 trains: first listed stop's `station_order` is small when the train starts at the route's last station. A bound-2 train with large first `station_order` is probably indexed the wrong way.
7. `origin`/`terminal` names exist in `topology.branches`. An empty `timetable` is only allowed with both `origin` and `terminal`.
8. Optionally load it in the site (`rtd-operate-site`) and confirm the diagram has no zig-zag lines.

Then tell the user what was assumed or left blank (for example "mileage taken from Wikipedia", "track layout omitted").

## Appendices
- [Appendix A: track layout](appendix-track-layout.md)
- [Appendix B: line topology](appendix-topology.md)
