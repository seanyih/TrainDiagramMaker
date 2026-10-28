# Appendix A: `route.track_layout`

Describes the number of tracks at each station and in each section, and optional max speeds. It is used only by "還原通過時間" (restoring passing times for overtakes / crossings). **Plain diagram drawing does not need it.**

**Recommendation: do not guess it.** Real track layouts (which stations can overtake, which sections are single track) are hard to get right from text sources. Either omit it (defaults to unlimited, which is safe) or ask the human to key it in on the site's route page (軌道配置). Only write it when the user gives explicit information.

```json
"track_layout": {
  "stations": ["double.3", "double.3", "single"],  // length = station count
  "sections": ["single", "double.0"],              // length = station count - 1 (between station i and i+1)
  "max_speed_enabled": true,
  "max_speed_all": 85,                             // only restores the input box
  "max_speeds": [85, null]                         // km/h per section, length = station count - 1
}
```

All fields optional. Missing / short / unknown values = `"quadruple"` (no limit). `max_speed_enabled: false` ignores all speeds. Speeds must be > 0 or `null`.

## Types

| Type                                 | Tracks | Overtaking allowed                                          |
| ------------------------------------ | ------ | ----------------------------------------------------------- |
| `single`                             | 1      | no (cannot even cross, except at a station of another type) |
| `double.0`                           | 2      | none (crossing only)                                        |
| `double.1`                           | 2      | bound 1 trains can be overtaken                             |
| `double.2`                           | 2      | bound 2 trains can be overtaken                             |
| `double.3`                           | 2      | both bounds                                                 |
| `triple.1` / `triple.2` / `triple.3` | 3      | bound 1 / bound 2 / both                                    |
| `quadruple`                          | 4      | both, simultaneously                                        |

"Overtaking allowed for bound b" = a train of bound b may wait at this place and be passed by a following train of the same bound.

## Meaning of positions

- `stations[i]` is the layout at station i (the station's own tracks: a station with a passing loop is `double.3` even if the line is single track).
- `sections[i]` is the layout between station i and i+1. Overtaking in a section is only meaningful for `triple` / `quadruple`.

## Typical presets

| Real line                                             | stations    | sections    |
| ----------------------------------------------------- | ----------- | ----------- |
| Single-track line with passing loops at every station | `double.3`  | `single`    |
| Double track, overtake only at stations               | `double.3`  | `double.0`  |
| Double track, overtake anywhere                       | `double.3`  | `double.3`  |
| Unlimited (default)                                   | `quadruple` | `quadruple` |

Station index convention: indices follow `route.stations` (bound-1 order) for both bounds. `.1` and `.2` refer to the direction of travel (1 = bound 1).
