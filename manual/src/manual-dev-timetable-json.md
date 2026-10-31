網站內部的列車資料存在 `program/data/DataStore.js` 的 `TRAINS`，依方向分成兩組：

```js
TRAINS = {
    1: [ train, train, ... ],   // 順行
    2: [ train, train, ... ]    // 逆行
}
```

列車 JSON 一次只包含一個方向，其中的 `timetable` 陣列**與內部的 `TRAINS[bound]` 結構、欄位名稱完全相同**。此格式也和 `crawler/crawler_routetime.py` 產生的檔案相同。

## 結構

```json
{
    "route_name": "ＪＲ香椎線",
    "bound": 1,
    "station_count": 16,
    "station_record": ["西戸崎", "海ノ中道", "雁ノ巣", "..."],
    "train_count": 84,
    "timetable": [
        {
            "train_number": "2721C",
            "settings": {
                "train_name": "普通",
                "train_color": 1
            },
            "origin": { "station_name": "", "departure": "" },
            "terminal": { "station_name": "", "arrival": "" },
            "timetable": [
                { "station_order": 0, "station_name": "西戸崎",   "arrival": "",     "departure": "0528" },
                { "station_order": 1, "station_name": "海ノ中道", "arrival": "0530", "departure": "0531" },
                { "station_order": 2, "station_name": "雁ノ巣",   "arrival": "0536", "departure": "0537" }
            ]
        }
    ]
}
```

### 外層欄位

| 欄位 | 說明 |
|---|---|
| `route_name` | 路線名。若目前路線沒有名稱，匯入時會取用此值 |
| `bound` | 方向，1 = 順行、2 = 逆行 |
| `station_count` | 該方向的車站數 |
| `station_record` | 該方向順序的站名列表。匯入時與目前車站依站名比對：相符的照常匯入，檔案多出的站略過，路線多出的站留白 (`station_order` 為此列表的 index) |
| `train_count` | 列車數 |
| `timetable` | 列車陣列 |

除了 `timetable` 和 `route_name`，外層欄位**只在匯出時產生，匯入時忽略**：方向由按下的匯入按鈕決定，站序以 `station_order` 為準。所以自行產生 JSON 時，最少只需要：

```json
{ "timetable": [ ... ] }
```

### 列車 (train)

| 欄位 | 型別 | 說明 |
|---|---|---|
| `train_number` | string | 車次，可為 `""`。會標示在圖上 |
| `settings.train_name` | string | 列車名，可為 `""` |
| `settings.train_color` | number | 線條顏色 0 ~ 10，對應設定中 `trainColors` 的 index。0 與 1 同色（顏色 1） |
| `settings.line_width` | number | 此列車的線寬 (px)，優先於設定。可省略 / `null` = 依設定 |
| `settings.line_type` | string | 此列車的線型：`"solid"` / `"dashed"` / `"dotted"`。可省略 / `null` = 依設定 |
| `origin` | object | 跨線列車的始發：`{ station_name, departure }`，分岐上的站名與發車時刻，`""` 表示無。可省略 |
| `terminal` | object | 跨線列車的終點：`{ station_name, arrival }`，分岐上的站名與到達時刻，`""` 表示無。可省略 |
| `hidden` | boolean | `true` = [隱藏](manual-ops-timetable.html#隱藏列車)：不畫進圖中，也不參與還原通過時間。可省略（`false`）。CSV 不保存此欄 |
| `timetable` | array | 停靠站列表，只包含有時刻的車站，依 `station_order` 由小到大排序 |

`origin` / `terminal` 的站名對應路線 JSON 的 `topology.branches` 中的車站（見[線路拓樸](manual-dev-route-json.html#線路拓樸)）。分岐站在第一個停靠站以前（終點：最後一個停靠站以後）時，以距離內插出通過分岐站的時刻畫圖；這個時刻不寫進 `timetable`。

在本路線不停任何車站的列車，`timetable` 可以是空陣列，`origin` 與 `terminal` 都要填：兩個分岐站的時刻以 `origin.departure` 到 `terminal.arrival` 之間的距離內插（距離 = 始發站到分岐站 + 兩分岐站間的路線里程 + 分岐站到終點站）。始發的分岐站必須在終點的分岐站之前（該方向的順序）。

### 停靠站 (stop)

| 欄位 | 型別 | 說明 |
|---|---|---|
| `station_order` | number | 該方向車站列表中的 index（從 0 開始），見下方說明 |
| `station_name` | string | 站名，冗餘欄位，方便人閱讀。匯入時忽略，由程式依路線自動更新 |
| `arrival` | string | 到站時刻，`""` 表示無 |
| `departure` | string | 發車時刻，`""` 表示無 |
| `pinned` | boolean | `true` = 釘選：[還原通過時間](manual-ops-passing-time.html#釘選的時刻)不移動這個時刻。[疊圖](manual-ops-import-export.html#疊圖)疊加的時刻會設定。可省略（`false`）。CSV 不保存此欄 |

## station_order 與方向

`station_order` 是**該方向**的站序：

* 順行 (bound 1)：等於路線 `stations` 的 index。
* 逆行 (bound 2)：等於路線反轉後的 index，也就是 `stationCount - 1 - routeIndex`。逆行的 `station_order: 0` 是路線的最後一站。

站名不參與對應，所以匯入列車前請先確認路線資料的站數和順序正確。新增/刪除車站時，程式會自動平移所有列車的 `station_order`。

## 時刻格式

* 字串 `"hhmm"` 或 `"hhmmss"`（長度 4 或 6），例如 `"0528"`、`"052830"`。
* 匯入時由 `normalizeTime()`（`program/util/stc.js`）整理：1 ~ 3 位數補到 4 位、5 位數補到 6 位（`"935"` → `"0935"`）。
* 非數字、分或秒 ≥ 60、超過 `2400` 的時刻不合法，匯入時視為空白。
* 不支援 28 / 30 小時制，跨夜直接寫時刻（例：`"0015"`）。
* `arrival` 和 `departure` 都是空的停靠站會被移除。

## 繪圖時的處理

* 只有 `departure` 的停靠站，`arrival` 保持 `""`；畫圖與計算時以 `arrivalTime()` 算出 `departure - 該站 stopsec`，不會寫回資料。
* 繪圖只使用**有 `departure` 的停靠站**。終點站請把抵達時刻寫在 `departure`（或兩者都寫），否則最後一段不會畫出。
* 通過站可以把 `arrival` 和 `departure` 設成相同時刻。

## 匯入方式

匯入/匯出頁的「匯入列車資料時」選單：

* 取代（預設）：`TRAINS[bound]` 換成檔案內容。
* 附加：先移除空白列車（無車次、無停靠站、無始發與終點），再把檔案內容接在後面。

JSON 可由該方向任一個列車匯入按鈕匯入（「發車時刻」或「到發時刻」皆可）。

## 疊圖檔案

「匯入/匯出 > 疊圖」匯出的檔案（`getOverlayJSON()`，`program/program/Overlay.js`）：

```json
{
    "type": "rtd-overlay",
    "version": 1,
    "route_name": "臺鐵 縱貫線北段 (基隆-竹南)",
    "stations": [ { "name": "北新竹", "kilo": 105.2 }, { "name": "新竹", "kilo": 106.6 } ],
    "train_count": 311,
    "trains": [
        {
            "train_number": "2005",
            "settings": { "train_name": "區間快", "train_color": 2 },
            "direction": 1,
            "stops": [
                { "station_name": "北新竹", "arrival": "0637", "departure": "0637", "passing": true },
                { "station_name": "新竹", "arrival": "0640", "departure": "0642", "passing": false }
            ]
        }
    ]
}
```

* `stations`：匯出的區段，路線順序。
* `direction`：1 = 沿 `stations` 的順序行駛，2 = 反向。`stops` 依行駛順序排列，至少兩站。
* `stops`：時刻表上的停靠站保留原本的 `arrival` / `departure`（空白的到站仍是空白）；其他車站（通過、內插的分岐站、兩停靠站之間的直線）`arrival` = `departure` = 圖上列車線的時刻，到秒。`passing` 只供參考。
* 疊加（`applyOverlay(data, conflict)`）時站名對應路線車站、車次對應列車，見[疊圖](manual-ops-import-export.html#疊圖)。

## 與 CSV 的對應

CSV 格式請見[時刻表資料檔案格式(csv)](manual-format-timetable-csv.html)。簡要來說：一班車佔一欄（發車時刻）或兩欄（到站、發車），第 0 列為車次，第 1 ~ N 列為各站時刻（該方向順序），第 N+1、N+2 列為列車名與顏色，第 N+3 ~ N+6 列為始發站名、發車時刻、終點站名、到達時刻（皆可省略）。CSV 不處理引號，欄位中不能含有逗號或換行。

## 相關程式

| 檔案 | 內容 |
|---|---|
| `program/data/DataStore.js` | `TRAINS`、`newTrain()`、`boundStations()`、`addStop()`、`setStopTime()`、`refreshStopNames()`、`arrivalTime()` |
| `program/handler/TimetableHandler.js` | `applyTrains()`、`getTrainDataJSON()`、`loadTrainFromJSON()`、`getTrainDataCSV()`、`loadTrainFromCSV()` |
| `program/util/stc.js` | `normalizeTime()` 等時刻字串轉換 |
| `crawler/crawler_routetime.py` | 產生相同格式的爬蟲範例 |
