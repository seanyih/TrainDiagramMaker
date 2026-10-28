# Appendix B: `route.topology`

Records (1) **branch lines** leaving the main line and (2) **secondary stations**. It is only needed when some trains run through from / onto a branch line (cross-line trains), or when the user wants minor stations drawn in a lighter style.

Branches are **not drawn**. They only let the site interpolate the time a cross-line train passes the junction station. If the data is incomplete, the train simply has no junction point; nothing breaks.

```json
"topology": {
  "secondary": [false, false, true, false],          // length = station count
  "branches": [                                       // length = station count
    [],
    [],
    [ { "stations": [ { "name": "千早", "kilo": 1.2 }, { "name": "箱崎", "kilo": 3.5 } ] } ],
    []
  ]
}
```

- `secondary[i]`: station i is drawn as a minor station (signal station etc.). The first and last stations are always `false`.
- `branches[i]`: list of lines branching **at station i** (the junction is a main-line station; it does not need to be a stop of the train, e.g. a signal box counts, add it to the main line with `secondary: true`). Max 3 per station.
- `branches[i][b].stations[]`: stations on the branch, `kilo` = distance (km, > 0) from the junction station i, sorted near to far. `null` = unknown (the site then cannot interpolate).
- Branches cannot branch again. Treat a sub-branch as another branch from the same junction.
- Names in `origin.station_name` / `terminal.station_name` of trains must equal a branch station `name`. If the same name appears twice, the first match wins.

## How to build it from explicit data

1. Identify trains whose first/last station is not on the route (the crawler output records these in `origin` / `terminal`).
2. For each distinct such station, find **which main-line station is the junction** and the **distance along the branch** from the junction to that station. Sources: Wikipedia (station list with 営業キロ), the line's own mileage tables.
3. Group stations of the same branch together, sorted by distance.
4. Junction not obvious (e.g. through-running that goes via an intermediate line, or a junction at a signal box that is missing from the route), or mileage unavailable: **stop and ask the user**. Do not guess; do not spend a long time searching.
5. If a junction is not a station of the route, ask the user whether to add it to the route as a station (and mark it `secondary`). Adding it changes `station_order`s of every train, so do this before generating train files.

## Mileage tip

`kilo` on a branch is measured from the junction, not from the branch's own origin. If a source gives cumulative km on the branch line, subtract the junction's value.
