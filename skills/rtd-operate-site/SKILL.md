---
name: rtd-operate-site
description: Operate the online railway time diagram maker (diagram-maker.html) in a browser, either by clicking the UI or by calling its JavaScript directly. Use when asked to import route/timetable data, change settings, restore passing times, draw or export the diagram on this site.
---

# Operating the railway time diagram maker

Pure front-end page (jQuery + Bootstrap, no build). Needs HTTP, not `file://`:

```bash
python -m http.server 8765    # in the repo root, then open http://localhost:8765/diagram-maker.html
```

UI text is Traditional Chinese. If the data is not in the site's format yet, use `rtd-data-format` first.

## Fastest way: call the page's JavaScript

Run these with a browser tool that evaluates JS in the page (e.g. `javascript_tool`). Everything is a top-level global (`ROUTE`, `TRAINS`, `SETTINGS`, functions). No DOM reading is needed: **the data lives in `ROUTE` / `TRAINS` / `SETTINGS`, tables are only a view.**

### Load data
```js
// everything at once (route + trains of both bounds + optional settings)
loadAllFromJSON(JSON.stringify(allData)); generateTimetable();

// or separately
applyRoute(loadRouteFromJSON(JSON.stringify(route))); generateTimetable();   // must come before trains
applyTrains(1, loadTrainFromJSON(JSON.stringify(trains1)), false);           // false = replace, true = append
applyTrains(2, loadTrainFromJSON(JSON.stringify(trains2)), false);
```
- `generateTimetable()` checks mileage (red toast + returns if kilo is missing / not increasing).
- Loaders never throw for bad times (invalid -> blank); a malformed JSON throws.
- Order matters: route first, then trains (`station_order` depends on the route).
- Fetching files from the server works too: `await (await fetch("data/JR香椎線/RouteInfo.json")).text()`.
- Or use the real UI flow: put a `File` (via `DataTransfer`) into the file input, then click the import button (below).

### Read / export data
```js
JSON.stringify(getAllDataJSON())        // route + trains + settings, same as the "匯出全部" file
JSON.stringify(ROUTE)                   // route JSON
JSON.stringify(getTrainDataJSON(1))     // trains JSON of bound 1 (2 = reverse)
JSON.stringify(SETTINGS)                // settings JSON
```
`downloadFile(name, text)` triggers a browser download; override it (`window.downloadFile = (n, t) => { captured = {n, t} }`) to capture export output from the real buttons.

### Edit data
```js
TRAINS[1][0].timetable[2].departure = "0615"; refreshTimetable(1);   // after any train edit
insertStation(index); renderRouteTable(); onRouteChanged();           // never splice ROUTE.stations by hand
deleteStation(index); renderRouteTable(); onRouteChanged();           // these shift station_order and track/topology
ROUTE.stations[3].name = "新駅"; onRouteChanged();
```
Times are `"hhmm"`/`"hhmmss"` strings; `""` = none. Keep `station_order` sorted.

### Overlay (疊圖): lay a section of one route onto another
```js
const data = getOverlayJSON(from, to);       // ROUTE.stations indices, from < to: trains of that section, times at every
                                             // station they pass (as drawn, to the second)
// ... load the other route and its trains ...
const r = applyOverlay(data, "overlay");     // or "keep": stations already timed keep their times
// r = { merged, added, skipped, stations: [names not on this route] }; throws Error(message) on a bad file
refreshTimetable(1); refreshTimetable(2);
```
Stations match by name, trains by train number (same bound), so a train already there is merged, not added twice; laid times get `pinned: true` and the solvers never move them (`unpinTrain(train)` clears it). UI: 匯入/匯出 > 疊圖 (`#OverlayFrom`, `#OverlayTo`, `#ExportOverlayBtn`, `#OverlayFile`, `#OverlayConflict`, `#ImportOverlayBtn`, result in `#OverlayResult`).

### Settings
Defaults live in `SETTINGS` (see `DATA_STRUCTURE.md` section 2 for every field).
```js
SETTINGS.pxPerKm = 30; SETTINGS.pxPerMin = 20; initSettingsUI();       // edit then refresh the UI
SETTINGS.startSec = 5*3600; SETTINGS.endSec = 24*3600;                  // seconds; max endSec 108000
SETTINGS.lines.primary.color = "#999999"; initSettingsUI();
applySettings(loadSettingsFromJSON(jsonText));                          // import a settings JSON: missing fields = defaults, not "keep current"
```
Train line colors: `SETTINGS.trainColors[n]` (index 0..10), change via the UI color inputs (`.train-color-input`) so the CSS variables update.

### Draw and extract the SVG
```js
$("#nav-output").click(); drawDiagram();                      // draws into <svg id="output">
const svg = document.getElementById("output");
svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
svg.outerHTML                                                  // the SVG text; save it as .svg
```
Or click `#OutputBtn`, then `#DownloadSVGBtn` (downloads `TrainDiagram.svg`).
Big data (e.g. 東海道新幹線, ~550 trains): the SVG is huge and screenshots time out. Shrink `startSec` / `endSec` / `pxPerKm` before screenshotting.
`checkTextFit()` runs on every draw and shows a yellow toast if text overflows the margins; widen `SETTINGS.margin.left/right/bottom` or shrink fonts.

### Restore passing times / auto-fill (待避時間計算)
Results go into a **draft** (copy of `TRAINS`), not `TRAINS`, until adopted.
```js
// restore passing times (uses SETTINGS.passingTime.*, solver "stn" by default)
$("#PassingTimeBtn").click();              // async (setTimeout slices); wait until it finishes
// poll: $("#PassingTimeBtn").prop("disabled") == false && DRAFTS.passing
$("#PassingTimeResult").text()             // summary: remaining conflicts only
PASSING_REPORT.report                      // details (also shown by #PassingTimeReportBtn 詳細結果): conflicts (one line each),
                                           // written (added / moved passing times, temp stops, stop times), stats.stages
                                           // (why the solver stopped), limits, diagnoses (why each conflict is left)
$('.preview-draft-btn[data-draft="passing"]').click();   // preview the draft on the output tab
adoptDraft("passing"); refreshTimetable(1); refreshTimetable(2);  // adopt (the UI does this after a modal)

// auto-fill blank stations from a reference ("golden") train
$("#AutofillGolden").val("2721C").trigger("input");      // plus #AutofillByNumber / #AutofillNumber etc.
$("#AutofillBtn").click();                               // fills DRAFTS.autofill; adopt with adoptDraft("autofill")
```
A draft is dropped automatically if ROUTE / TRAINS change after it was made. Settings relevant here: `SETTINGS.passingTime.{solver, fineTune, inaccurateArrival, imprecise, timetableGranularity, roundingMode, minDwell, timeGranularity, minTimeSeparation}`. Use `imprecise` when the source timetable is rounded to minutes ("時刻精度不足"); it is mutually exclusive with `inaccurateArrival`. Track layout limits where overtaking is possible, so set it first (see `rtd-data-format` appendix A).

## UI map (clicking)

Left side bar (all ids are `#nav-*`; each shows `#container-*`):

| Button | Container | What is there |
|---|---|---|
| `#nav-inex` 匯入/匯出 | `#container-inex` | Import/export of route (`#RouteInfoFile` + `#ImportRouteInfoBtn`, `.export-route-btn`), trains per bound (file inputs + import buttons, `.export-train-btn[data-bound][data-format]`), settings (`#ImportSettingBtn`), all data (`#AllFile` + `#ImportAllBtn`, `.export-all-btn`). `#ImportTrainMode` = replace / append |
| `#nav-setting` 基本設定 | `#container-setting` | Every `data-setting="path"` input maps to `SETTINGS`; sections: 線條, 車站文字, 時間文字, 列車號, 列車號避讓, 自動補全, 還原通過時間 (with 臨時停車規則) |
| `#nav-route` 路線資料 | `#container-route` | Three stacked tables: route (`#RouteInfotbody`, 生成 = `#GenerateTimetableBtn`), 軌道配置 (`#container`'s track table), 線路拓樸 (`#Topologytbody`) |
| `#nav-timetable-1` / `-2` 時刻表(順/逆行) | `#container-timetable-N` | Editable timetable, 車次細項 offcanvas (name, color, origin/terminal branch station) |
| `#nav-output` 輸出圖片 | `#container-output` | `#OutputBtn` 輸出結果, `#DownloadSVGBtn`, preview buttons for drafts, `<svg id="output">` |

Typical flow by hand: 匯入/匯出 -> import route (auto "generate") -> import trains of each bound -> 基本設定 -> 輸出圖片 -> 輸出結果 -> 下載SVG圖檔.

Setting inputs: set the value, then dispatch `change` (`$(el).val(x).trigger("change")`); invalid values (out of `min`/`max`) are reverted. Toasts report results (blue success, red failure, yellow warning); the failure reason for generate is in `#GenerateTimetableFailedReason`.

## Pitfalls
- Edited JS files can be cached by the browser; after changing source, hard-reload.
- Long scripts that time out keep running in the background and keep mutating state; reload the page before re-checking.
- Do not read data back from table DOM; read `ROUTE` / `TRAINS`.
- Bound 2 trains use reversed `station_order`.
- `startSec`/`endSec` UI inputs are `hhmm` (`#starthhmm`, `#endhhmm`); in JS use seconds.
- User-facing text on the page is Traditional Chinese; keep messages to the user in the user's language.
