本章給想自行產生資料（例如寫爬蟲、從其他 API 轉換）或參與開發的人參考。一般使用者使用 [CSV 格式](manual-format-route-csv.html)即可。

網站內部的路線資料只有一份（`program/data/DataStore.js` 的 `ROUTE`），表格、繪圖、匯出都讀寫這份資料。路線 JSON 就是 `JSON.stringify(ROUTE)`，**匯出的內容和內部結構完全相同**。

## 結構

```json
{
    "route_name": "ＪＲ香椎線",
    "stations": [
        { "name": "西戸崎",   "kilo": 0,   "stopsec": 60, "alias": "" },
        { "name": "海ノ中道", "kilo": 2.1, "stopsec": 60, "alias": "" },
        { "name": "雁ノ巣",   "kilo": 6.5, "stopsec": 60, "alias": "" }
    ],
    "track_layout": {
        "stations": ["double.3", "double.3", "double.3"],
        "sections": ["single", "single"],
        "max_speed_enabled": true,
        "max_speed_all": 85,
        "max_speeds": [85, null]
    },
    "topology": {
        "secondary": [false, true, false],
        "branches": [[], [], [{ "stations": [{ "name": "奈多", "kilo": 0.9 }] }]]
    }
}
```

| 欄位                   | 型別             | 必填  | 說明                                                  |
| -------------------- | -------------- | --- | --------------------------------------------------- |
| `route_name`         | string         | 否   | 路線名。目前不顯示在圖上，只會在 JSON 中保存                           |
| `stations`           | array          | 是   | 車站列表，**陣列順序即順行 (bound 1) 的站序**                      |
| `stations[].name`    | string         | 是   | 站名                                                  |
| `stations[].kilo`    | number \| null | 是   | 累計里程（公里）。第一站匯入時一律設為 0；`null` 代表尚未輸入                 |
| `stations[].stopsec` | number         | 否   | 該站預設停站秒數。省略時使用設定中的 `defaultStopSec`。                |
| `stations[].alias`   | string         | 否   | 站名別名，設定 `aliasText.show` 為 `true` 時畫在圖的右側。省略時為 `""` |
| `track_layout`       | object         | 否   | 軌道配置，見下節。省略時全線為 `"quadruple"`（不設限）                 |
| `topology`           | object         | 否   | 線路拓樸（次要車站、分岐），見[線路拓樸](#線路拓樸)。省略時沒有次要車站與分岐            |

## 軌道配置

`track_layout` 記錄每個車站、每個站間的軌道類型（操作方式見[軌道配置](manual-ops-track.html)）。只存類型字串，不存網頁上選單與勾選框的狀態。

| 欄位 | 長度 | 說明 |
|---|---|---|
| `track_layout.stations[i]` | 站數 | 第 i 站的類型 |
| `track_layout.sections[i]` | 站數 − 1 | 第 i 站與第 i+1 站之間的類型 |
| `track_layout.max_speed_enabled` | — | `false` 代表不設定最高速度（網頁上勾選「停用」），此時 `max_speeds` 全為 `null`。省略時為 `true` |
| `track_layout.max_speed_all` | — | 網頁上「全線最高速度」輸入框的值（km/h）；`null` 代表未填 |
| `track_layout.max_speeds[i]` | 站數 − 1 | 同一站間的最高速度（km/h，數字）；`null` 代表未填。`max_speed_enabled` 為 `false` 時匯入會忽略 |

| 類型 | 網頁上的設定 | 交會 | 順行追越 | 逆行追越 | 追越的同時交會 |
|---|---|---|---|---|---|
| `single` | 單線 | ✕ | ✕ | ✕ | ✕ |
| `double.0` | 複線 | ○ | ✕ | ✕ | ✕ |
| `double.1` | 複線 + 順行可追越 | ○ | ○ | ✕ | ✕ |
| `double.2` | 複線 + 逆行可追越 | ○ | ✕ | ○ | ✕ |
| `double.3` | 複線 + 順行、逆行可追越 | ○ | ○ | ○ | ✕ |
| `triple.1` | 三線 + 順行可追越 | ○ | ○ | ✕ | 順行 |
| `triple.2` | 三線 + 逆行可追越 | ○ | ✕ | ○ | 逆行 |
| `triple.3` | 三線 + 順行、逆行可追越 | ○ | ○ | ○ | 順行或逆行（不可同時） |
| `quadruple` | 四線 | ○ | ○ | ○ | 雙向同時 |

* 後綴數字是追越的方向：1 = 順行、2 = 逆行、3 = 雙向。三線沒有 `triple.0`。
* 匯入時，缺少的欄位、長度不足的部分、不認得的值都當作 `"quadruple"`；最高速度不是正數時當作 `null`；超出站數的部分忽略。
* 路線 CSV 沒有軌道配置，匯入 CSV 時軌道配置會重設為預設值。

## 線路拓樸

`topology` 記錄次要車站，以及從各站分岐出去的路線。

| 欄位 | 長度 | 說明 |
|---|---|---|
| `topology.secondary[i]` | 站數 | 第 i 站是否為次要車站（以次要車站線、次要站名繪製，見[設定檔案格式](manual-dev-setting-json.html)）。起終點一律為 `false` |
| `topology.branches[i]` | 站數 | 從第 i 站分岐的路線，最多 3 條 |
| `topology.branches[i][b].stations[]` | — | 分岐上的車站 `{ name, kilo }`。`kilo` 是與分岐站（第 i 站）的距離（公里，正數），`null` 代表未填 |

* 分岐上的車站依 `kilo` 由近到遠排序，`null` 排在最後。
* 匯入時，缺少的部分當作非次要車站、沒有分岐；`kilo` 不是正數時當作 `null`；沒有車站的分岐移除，每站超過 3 條的分岐忽略。
* 路線 CSV 沒有線路拓樸，匯入 CSV 時線路拓樸會重設為預設值（沒有次要車站與分岐）。

## 匯入規則

* 由副檔名判斷：`.json` 結尾當作 JSON，其他當作 CSV。檔頭的 UTF-8 BOM 會被移除。
* 匯入後整份取代目前的路線，然後自動執行「生成」（檢查里程、重新渲染時刻表）。
* `kilo` 必須嚴格遞增，否則「生成」會失敗並以紅底標示該格（資料仍會匯入）。
* 匯入路線不會清除列車資料。列車以 `station_order`（站序 index）對應車站，站數改變時請一併更新列車資料。
* 若目前路線沒有 `route_name`，匯入列車 JSON 時會取用列車檔中的 `route_name`。

## 與 CSV 的對應

路線 CSV 每站一列、無標題列，欄位順序與 JSON 相同：

```
name,kilo[,stopsec][,alias]
```

匯出 CSV 固定輸出 4 欄；匯入接受 2 ~ 4 欄。CSV 不處理引號，欄位中不能含有逗號或換行。

## 全部資料 JSON

「匯出全部」產生的檔案中，`route` 欄位就是上述的路線 JSON，詳見[設定檔案格式(json)](manual-dev-setting-json.html#全部資料-json)。

## 相關程式

| 檔案                                    | 內容                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `program/data/DataStore.js`           | `ROUTE`、`newStation()`、`newTrackLayout()`、`newTopology()`、`insertStation()`、`deleteStation()` |
| `program/handler/RouteInfoHandler.js` | `applyRoute()`、`loadRouteFromJSON()`、`loadRouteFromCSV()`、`getRouteDataCSV()` |
| `program/handler/TrackLayoutHandler.js` | `loadTrackLayout()`                                                          |
| `program/handler/TopologyHandler.js`  | `loadTopology()`                                                              |
| `program/ui/topologyInput.js`         | 線路拓樸表格：`renderTopologyTable()`                                          |
| `program/program/TrackLayout.js`      | 軌道類型、轉換圖對照表、快速套用：`parseTrack()`、`makeTrack()`、`trackTransition()`、`applyTrackPreset()`、`minRunSec()` |
| `program/ui/createTimetable.js`       | `checkkilo()`、`generateTimetable()`                                           |
