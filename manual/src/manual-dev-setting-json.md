設定 JSON 就是 `program/program/globalvar.js` 中的 `SETTINGS` 物件本身（`JSON.stringify(SETTINGS)`）。基本設定頁的每個輸入框都以 `data-setting="路徑"` 對應到 `SETTINGS` 的欄位（例：`data-setting="lines.station.width"`），預設值只寫在 `globalvar.js`。

## 預設值

```json
{
    "defaultStopSec": 60,
    "startSec": 0,
    "endSec": 86400,
    "pxPerKm": 25,
    "pxPerMin": 25,
    "trainLineWidth": 2,
    "trainLineWidthByColor": [null, null, null, null, null, null, null, null, null, null, null],
    "showTrainNumber": true,
    "trainNumberFontSize": 20,
    "pxPerTrainNumber": 750,
    "minStationIntervalForTrainNumber": 70,
    "trainNumberAvoidance": {
        "enabled": true,
        "primaryTimeLines": false,
        "secondaryTimeLines": false,
        "margin": 5
    },
    "connectTrainLines": true,
    "layers": { "enabled": false, "trainByDirection": false, "trainByColor": false },
    "margin": { "left": 100, "right": 100, "top": 100, "bottom": 100 },
    "background": { "transparent": false, "color": "#FFFFFF" },
    "lines": {
        "station":   { "width": 2,   "color": "#000000" },
        "secondaryStation": { "width": 1.4, "color": "#808080" },
        "primary":   { "width": 2,   "color": "#000000" },
        "secondary": { "width": 1.4, "color": "#808080", "interval": 10 },
        "minute":    { "enabled": false, "width": 1.5, "color": "#808080" },
        "outline":   { "top": 2, "bottom": 2, "left": 2, "right": 2, "color": "#000000" }
    },
    "stationText": { "fontSize": 20, "color": "#000000", "gap": 10 },
    "aliasText": { "show": false, "fontSize": 20, "color": "#000000", "gap": 10 },
    "secondaryStationText": { "fontSize": 16, "color": "#808080", "gap": 10 },
    "secondaryAliasText": { "fontSize": 16, "color": "#808080", "gap": 10 },
    "timeLabel": {
        "format": "standard",
        "zeroPad": false,
        "overDay": "plain",
        "gap": 10,
        "secondaryLabel": "none",
        "formats": {
            "standard": { "fontSize": 20, "color": "#000000" },
            "sized":    { "hourFontSize": 25, "hourColor": "#000000", "minuteFontSize": 15, "minuteColor": "#000000" },
            "simple":   { "fontSize": 20, "color": "#000000" }
        }
    },
    "passingTime": {
        "minExtraPassingWaiting": 30,
        "minTimeSeparation": 60,
        "maxSearchDepth": 3,
        "maxIteration": 5,
        "maxAllowedConflict": 0,
        "estimatedSpeedLimitRatio": 1.1,
        "maxPassingPointIncrease": 2,
        "timeGranularity": 5,
        "fineTune": false,
        "inaccurateArrival": false,
        "imprecise": false,
        "timetableGranularity": 60,
        "roundingMode": "auto",
        "minDwell": 30,
        "smooth": true,
        "interpolationSpeedRatio": 1.2,
        "interpolationMaxError": null,
        "stopRules": [
            { "bound": 2, "number": null, "color": null, "name": null, "stations": "station", "station": "中道信号場" }
        ]
    },
    "trainColors": ["#4650E3", "#4650E3", "#25D9F2", "#19F278", "#9AF20B", "#F28800", "#F23F00", "#DB06F2", "#000000", "#787878", "#693600"]
}
```

## 欄位說明

長度單位皆為像素 (px)，時間單位為秒，顏色為 `#RRGGBB`。

| 欄位 | 預設 | 說明 |
|---|---|---|
| `defaultStopSec` | 60 | 預設停站秒數：新車站（及匯入時缺少停站時間的車站）的 `stopsec` 預設值 |
| `startSec` / `endSec` | 0 / 86400 | 圖上時間範圍，最多到 108000 (3000)。UI 為 hhmm（`#starthhmm` / `#endhhmm`） |
| `pxPerKm` / `pxPerMin` | 25 / 25 | 每公里 / 每分鐘的像素 |
| `trainLineWidth` | 2 | 列車線寬 (px) |
| `trainLineWidthByColor` | 11 個 `null` | 依列車顏色分別設定的線寬，`null` = 用 `trainLineWidth` |
| `trainLineType` | `"solid"` | 列車線線型：`"solid"` / `"dashed"` / `"dotted"` |
| `trainLineTypeByColor` | 11 個 `""` | 依列車顏色分別設定的線型，`""` = 用 `trainLineType` |
| `showTrainNumber` | true | 是否標示列車號（顏色同列車線） |
| `trainNumberFontSize` | 20 | 列車號字型大小 |
| `pxPerTrainNumber` | 750 | 每行經多少像素（垂直距離）標一次列車號 |
| `minStationIntervalForTrainNumber` | 70 | 站距小於此值的區間不標列車號 |
| `trainNumberAvoidance.enabled` | true | 避讓總開關；關閉時列車號仍不跨越車站線，但可與其他線、文字重疊 |
| `trainNumberAvoidance.primaryTimeLines` | false | 是否避開整點線 |
| `trainNumberAvoidance.secondaryTimeLines` | false | 是否避開次要時間線；僅在 `lines.secondary.interval × pxPerMin ≥ 250` 時有效 |
| `trainNumberAvoidance.margin` | 5 | 列車號與要避開的線、文字之間的最小距離，限 0 ~ 20 |
| `connectTrainLines` | true | 同一班列車畫成單一一條 `<polyline>` (跨日的列車每一天各一條)；`false` = 每一段各一條 `<line>`，包在一個 `<g>` 裡 |
| `layers.enabled` | false | 分圖層：背景、時間線、車站線、列車線、列車號文字、圖框、文字-車站、文字-時間 (由下到上) |
| `layers.trainByDirection` | false | 列車線圖層再分「順行」、「逆行」 |
| `layers.trainByColor` | false | 列車線圖層再依 `train_color` 分 (與上一項都勾選時，方向之下再分顏色) |
| `margin.{left,right,top,bottom}` | 100 | 圖表外框到圖片邊緣的距離 |
| `background.transparent` / `.color` | false / `#FFFFFF` | 背景；透明時不畫背景 |
| `lines.{station,secondaryStation,primary,secondary}` | | `{ width, color, type }`：車站線、次要車站線、整點線、次要時間線；`type` = `"solid"` / `"dashed"` / `"dotted"` |
| `lines.minute` | | 分鐘時間線：沒有時間線的每一分鐘，以每公里一點的點線繪製，`width` 為點的直徑，`enabled` 預設關閉 |
| `lines.outline` | | `{ top, bottom, left, right, color }`：外框四邊各自的線寬，固定為實線 |
| `lines.secondary.interval` | 10 | 次要時間線間隔（分）：1、5、10、15、20、30 |
| `lines.secondaryStation` | | `{ width, color }`：次要車站的車站線（路線 JSON 的 `topology.secondary`） |
| `stationText` | | `{ fontSize, color, gap }`：左側站名，靠右對齊 |
| `aliasText` | | `{ show, fontSize, color, gap }`：右側站名別名，靠左對齊 |
| `secondaryStationText` / `secondaryAliasText` | | `{ fontSize, color, gap }`：次要車站的站名 / 別名；別名是否顯示同樣看 `aliasText.show` |
| `timeLabel.format` | `"standard"` | `standard` = hh:mm 固定大小；`sized` = hh 大、mm 小；`simple` = 整點只標 hh、次要只標 mm |
| `timeLabel.formats.{standard,simple}` | | `{ fontSize, color }` |
| `timeLabel.formats.sized` | | `{ hourFontSize, hourColor, minuteFontSize, minuteColor }` |
| `timeLabel.zeroPad` | false | 小時是否補 0（8:00 / 08:00） |
| `timeLabel.gap` | 10 | 時間文字頂端與圖表下緣的距離 |
| `timeLabel.overDay` | `"plain"` | 24 時以後的時間文字：`plain` / `superscript`（+1 上標）/ `extended`（25:00） |
| `timeLabel.secondaryLabel` | `"none"` | 次要時間線標記 `none` / `hhmm` / `mm`，只在 `interval >= 10` 時有效（`simple` 格式一律只標 mm） |
| `print.enabled` | false | 印刷模式 (`PrintLayout.js`)：啟用後設定頁以像素為單位的欄位 (`data-unit="px"`) 改以 mm 輸入與顯示，1 px = 25.4/ppi mm；資料仍以 px 存放 |
| `print.ppi` | 300 | 解析度 |
| `print.page` | `{ width: 210, height: 297 }` | 頁面大小 (mm)，不含出血 |
| `print.bleed` | `{ top, bottom, left, right }` 各 3 | 出血 (mm)，加在頁面之外；超出出血的圖面算超出 |
| `print.pageMinutes` | 60 | 每頁時間 (分鐘)：30、60、120、180、240；時間範圍依此切成多頁 |
| `print.overlap` | false | 每頁前後各多畫 10 分鐘 (`PRINT_OVERLAP_MIN`)，頁與頁重疊；第一頁從範圍開始前 10 分鐘畫起 (前一天的時刻標 `-1`) |
| `print.format` | `"pdf"` | 輸出格式：`"svg"` = 直接 SVG (文字不轉外框)、`"pdf"` = 向量文字 PDF、`"svgPath"` = 向量文字 SVG；向量文字指文字轉成外框 (`fonts/` 的 Noto Sans TC，缺字改用 Noto Sans JP) |
| `print.align.v` / `print.align.h` | `{ side: "top", base: "frame", offset: 20 }` / `{ side: "left", base: "text", offset: 10 }` | 圖面對齊。`side`：固定哪一側的 padding (`"top"` \| `"bottom"`、`"left"` \| `"right"`)；`base`：`offset` (mm) 算到圖框 (`"frame"`) 或含文字 (`"text"`)。另一側的 padding 由頁面大小與圖框大小算出 |
| `passingTime.solver` | `"stn"` | 還原通過時間的求解器：`"greedy"` = 貪婪解法、`"stn"` = 離散決策 + 差分約束 |
| `passingTime.minExtraPassingWaiting` | 30 | 還原通過時間：停站秒數超過該站預設停站時間 + 此值，視為可能的待避 |
| `passingTime.minTimeSeparation` | 60 | 最短時隔（秒）：同一站前後兩列車的最短間隔 |
| `passingTime.maxSearchDepth` | 3 | 從衝突位置往前、往後找待避站的最大站數 |
| `passingTime.maxIteration` | 5 | 最大迴圈數，0 = 不限（直到衝突數不再減少） |
| `passingTime.maxAllowedConflict` | 0 | 衝突寬限：剩下的衝突數不超過此值時停止 |
| `passingTime.estimatedSpeedLimitRatio` | 1.1 | 估計速度的放寬倍數（≥ 1）：沒有設定最高速度的站間，以最快列車的平均速度乘上此值為上限 |
| `passingTime.maxPassingPointIncrease` | 2 | 最多增加的通過點數量：一個通過時刻造成新衝突時，同一班車最多再加幾個（只用於貪婪解法） |
| `passingTime.timeGranularity` | 5 | 通過時刻的最小單位（秒）：推算出的時刻都是此值的倍數 |
| `passingTime.fineTune` | false | 還原通過時間時，一併解決時隔不足（已有的通過時刻也可能被調整） |
| `passingTime.inaccurateArrival` | false | 還原通過時間時，忽略所有到站時刻並一併推算（沒勾選時只推算到站時刻空白的停靠站） |
| `passingTime.imprecise` | false | 時刻精度不足：時刻表的到發時刻經過取整（例如只到分），計算時每個停靠站的到發都可在取整前的範圍內調整，且至少停 `minDwell` 秒。不能與 `inaccurateArrival` 同時使用 |
| `passingTime.timetableGranularity` | 60 | 時刻表時刻的精度（秒），預設為只到分；不可小於 `timeGranularity` |
| `passingTime.roundingMode` | `"auto"` | 取整的方式：`"round"` 四捨五入、`"floor"` 無條件捨去、`"ceil"` 無條件進位、`"auto"` 自動判斷 |
| `passingTime.minDwell` | 30 | 時刻精度不足時，每個停靠站最短的停車時間（秒）；不可小於 `timeGranularity` |
| `passingTime.smooth` | true | 時刻精度不足時，計算後在可能的範圍內平滑化運轉時間 |
| `passingTime.interpolationSpeedRatio` | 1.2 | 跨線列車通過分岐站的內插時刻可移動的範圍（≥ 1）：分岐站前後兩段的平均速度相差不超過此倍數 |
| `passingTime.interpolationMaxError` | `null` | 不是 `null` 時取代上一項：內插時刻可移動的秒數（≥ 0）。UI 留白 = `null` |
| `passingTime.stopRules` | `[]` | 臨時停車規則。`bound`：0 = 順逆行、1 = 順行、2 = 逆行；`number`、`color`、`name`：車次、線條顏色、列車名的條件，`null` 為不限（車次、列車名可用萬用字元）；`stations`：`"all"` 所有車站、`"cross"` 可交會的站、`"overtake"` 可追越的站、`"station"` 指定站名 `station` |
| `trainColors` | | 長度 11 的陣列，index = 列車的 `train_color`。index 0 與 1 同色 |

所有 `gap` 都是文字與圖表外框之間的距離。

## 匯入規則

匯入時（`loadSettingsFromJSON()`）以 `DEFAULT_SETTINGS`（`globalvar.js` 載入時複製的預設值）為基準逐欄合併：

* 檔案中**缺少的欄位、型別與預設不同的欄位** → 使用預設值，不報錯（相容舊版檔案）。
* 預設中**沒有的欄位** → 忽略。
* 「未出現」代表使用預設值，而**不是保留目前的值**。所以只寫部分欄位的檔案，其他欄位會被重設為預設。
* JSON 無法解析時，不做任何變更。

因此自行產生設定檔時，只需要寫想改的欄位，例如：

```json
{
    "pxPerKm": 10,
    "startSec": 18000,
    "endSec": 86400,
    "showTrainNumber": false
}
```

## 全部資料 JSON

「匯出全部」產生的檔案把路線、兩個方向的列車和設定放在一起：

```json
{
    "route": { "...": "路線 JSON" },
    "trains": {
        "1": { "...": "列車 JSON，順行" },
        "2": { "...": "列車 JSON，逆行" }
    },
    "settings": { "...": "設定 JSON" }
}
```

* 每一部分的格式與單獨匯出時相同，見[路線資料檔案格式(json)](manual-dev-route-json.html)、[時刻表資料檔案格式(json)](manual-dev-timetable-json.html)。匯入時（`loadAllFromJSON()`）拆開後交給各自的讀取函式。
* 套用順序：設定 → 路線 → 列車（路線缺少 `stopsec` 時使用匯入後的 `defaultStopSec`）。
* 缺少 `settings` → 設定全部使用預設；缺少 `route` 或某個方向的 `trains` → 保留目前資料。
* 列車一律取代，不看「匯入列車資料時」選單。
* 任何部分解析失敗，則不套用任何變更（設定會還原）。

## 相關程式

| 檔案 | 內容 |
|---|---|
| `program/program/globalvar.js` | `SETTINGS`、`DEFAULT_SETTINGS` |
| `program/handler/SettingHandler.js` | `loadSettingsFromJSON()`、`mergeSettings()`、`applySettings()` |
| `program/handler/AllDataHandler.js` | `getAllDataJSON()`、`loadAllFromJSON()` |
| `program/setting/OutputSetting.js` | `initSettingsUI()`、`checkTextFit()`、設定頁輸入框的讀寫 |

## SVG 的 id

輸出的 SVG 中，時間線、車站線、列車線都有 id 與 `data-*` 屬性，可用 `document.getElementById()` 或 `querySelectorAll()` 抓取位置 (例如做互動式的瀏覽器)。

| 元素 | id | class | 其他屬性 |
|---|---|---|---|
| 時間線 | `timeline-{hhmm}` (例：`timeline-0830`；24 時以後為 `timeline-2530`；印刷模式重疊到前一天的為 `timeline-prev-2350`) | `timeline primary` (整點) / `timeline secondary` | `data-sec`：從第一天 0:00 起算的秒數 |
| 分鐘時間線 | `minuteline-{hhmm}` | `minuteline` | `data-sec` |
| 車站線 | `stationline-{i}`，i = 路線車站 index | `stationline` (次要車站加 `secondary`) | `data-station`：站名，`data-kilo`：里程 |
| 列車線 | `train-{bound}-{i}`，i = 該方向列車的 index；跨日的副本為 `…-prev-day` / `…-next-day` | `train-line` | `data-train`：不含副本後綴的 id，`data-bound`，`data-train-number` |
| 列車號 | | `train-number` | `data-train`：所屬列車線的 id |

`connectTrainLines` 為 true 時列車線是 `<polyline>` (`points` 即列車經過的各點)，否則是包著各段 `<line>` 的 `<g>`。
分圖層時，圖層是帶有 `id` (`layer-time-lines` 等)、`data-name` 與 `inkscape:groupmode="layer"` 的 `<g>`；列車線的子圖層為 `layer-train-lines-1`、`layer-train-lines-color-3`、`layer-train-lines-1-color-3` 等。
