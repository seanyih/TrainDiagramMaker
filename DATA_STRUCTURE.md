# 資料結構與匯入/匯出格式

本文件描述 `diagram-maker.html` 內部的資料結構、設定的讀取方式，以及 CSV / JSON 匯入匯出格式。

## 1. 資料流 (single source of truth)

```
匯入 (CSV/JSON) ──┐
                  ├─> ROUTE / TRAINS ──> renderRouteTable() / renderTimetable(bound)  (表格只是顯示)
表格輸入 (change) ─┘         │
                             ├─> drawDiagram()        (輸出圖片)
                             └─> 匯出 (CSV/JSON)
```

- 路線與列車資料**只存在** `program/data/DataStore.js` 的 `ROUTE` 和 `TRAINS`。
- 表格由資料重新渲染；使用者在表格上的每個修改 (`change` 事件) 立即寫回 `ROUTE` / `TRAINS`。
- 繪圖、匯出都只讀寫 `ROUTE` / `TRAINS`，不讀 DOM；待避時間計算 (第 7 節) 先寫在副本，採用後才取代 `TRAINS`。
- 新增/刪除車站時，`insertStation()` / `deleteStation()` 會同步平移所有列車停靠站的 `station_order`，並同步增刪 `ROUTE.track_layout`，因此列車資料與軌道配置永遠與路線一致。

## 2. 設定 `SETTINGS` (`program/program/globalvar.js`)

預設值只寫在 `globalvar.js`。基本設定頁的輸入框以 `data-setting="路徑"` 對應到 `SETTINGS` 的欄位 (例：`data-setting="lines.station.width"`)，
載入時由 `initSettingsUI()` 填入預設值，`change` 時由同一個 handler 寫回 (`program/setting/OutputSetting.js`)：
checkbox → boolean，`type="number"` 與數字選項的 select → number (空白、非數字、超出輸入框的 `min` / `max` 則還原)，其他 → string。

| 欄位 | 預設 | 說明 |
|---|---|---|
| `defaultStopSec` | 60 | 預設停站秒數：新車站 (及匯入時缺少 `stopsec` 的車站) 的 `stopsec` 預設值 |
| `startSec` / `endSec` | 0 / 86400 | 圖上時間範圍 (秒)。UI 為 hhmm (`#starthhmm` / `#endhhmm`，獨立 handler) |
| `pxPerKm` / `pxPerMin` | 25 / 25 | 每公里 / 每分鐘像素 |
| `trainLineWidth` | 2 | 列車線寬，無 UI |
| `showTrainNumber` | true | 是否標示列車號 (顏色同列車線) |
| `trainNumberFontSize` | 20 | 列車號字型大小 |
| `pxPerTrainNumber` | 750 | 每行經多少像素 (垂直距離) 標一次列車號 |
| `minStationIntervalForTrainNumber` | 70 | 站距 (像素) 小於此值的區間不標列車號 |
| `trainNumberAvoidance.enabled` | true | 避讓總開關；關閉時列車號只放在區間內 (仍不跨越車站線)，可與任何線、文字重疊 |
| `trainNumberAvoidance.primaryTimeLines` | false | 是否避開整點線 |
| `trainNumberAvoidance.secondaryTimeLines` | false | 是否避開次要時間線；僅在 `lines.secondary.interval × pxPerMin ≥ 250` 時有效 (hard limit `MIN_PX_TO_AVOID_SECONDARY_LINES`，不足時 UI 停用、繪圖時也忽略) |
| `trainNumberAvoidance.margin` | 5 | 列車號與要避開的線、文字之間的最小距離 (px)，限 0~20 |
| `margin.{left,right,top,bottom}` | 100 | 圖表外框到圖片邊緣的距離 |
| `background.transparent` / `.color` | false / `#FFFFFF` | 背景。透明時不畫背景矩形 |
| `lines.{station,primary,secondary,outline}` | | `{ width, color }`：車站線、整點線、次要時間線、外框 |
| `lines.secondary.interval` | 10 | 次要時間線間隔 (分)：1, 5, 10, 15, 20, 30 |
| `stationText` | | `{ fontSize, color, gap }`：左側站名，靠右對齊 |
| `aliasText` | | `{ show, fontSize, color, gap }`：右側站名別名，靠左對齊 |
| `timeLabel.format` | `"standard"` | `standard` = hh:mm 固定大小；`sized` = hh 大、mm 小直接相接，同一基線 (向下對齊)；`simple` = 整點只標 hh、次要只標 mm |
| `timeLabel.formats.{standard,simple}` | | `{ fontSize, color }` |
| `timeLabel.formats.sized` | | `{ hourFontSize, hourColor, minuteFontSize, minuteColor }` (預設 25 / 15) |
| `timeLabel.zeroPad` | false | 小時是否補 0 (8:00 / 08:00) |
| `timeLabel.gap` | 10 | 時間文字頂端與圖表下緣的距離 |
| `timeLabel.secondaryLabel` | `"none"` | 次要時間線標記 `none` / `hhmm` / `mm`，只在 `interval >= 10` 時有效 (`simple` 格式一律只標 mm) |
| `passingTime.solver` | `"stn"` | 還原通過時間的求解器：`"greedy"` = 貪婪解法 (`restorePassingTimes()`，`PassingTime.js`)、`"stn"` = 離散決策 + 差分約束 (`restorePassingTimesSTN()`，`PassingTimeSTN.js`)。其他參數兩者共用 |
| `passingTime.minExtraPassingWaiting` | 30 | 還原通過時間：停站秒數 > 該站 `stopsec` + 此值的停靠，視為可能的待避 (≥ 0) |
| `passingTime.minTimeSeparation` | 60 | 最短時隔 (秒，≥ 0)：通過的列車比待避列車發車早 (或比終到列車到站晚) 這麼多秒；同一站連續通過的列車也至少相隔這麼多秒 |
| `passingTime.maxSearchDepth` | 3 | 從衝突位置往前、往後找待避站的最大站數 (≥ 1) |
| `passingTime.maxIteration` | 5 | 最大迴圈數 (≥ 0)，0 = 不限，直到衝突數不再減少 |
| `passingTime.maxAllowedConflict` | 0 | 衝突寬限 (≥ 0)：剩下的衝突數 ≤ 此值時停止 |
| `passingTime.estimatedSpeedLimitRatio` | 1.1 | 估計速度的放寬倍數 (≥ 1)：沒有設定最高速度的站間，以最快「停靠站到停靠站」平均速度 × 此值為上限 |
| `passingTime.maxPassingPointIncrease` | 2 | 最多增加的通過點數量 (≥ 0)：一個通過時刻造成新衝突時，同一班車最多再加幾個。只用於貪婪解法，UI 只在選擇貪婪解法時顯示 (`updateSettingsUI()`) |
| `passingTime.timeGranularity` | 5 | 通過時刻的最小單位 (秒，≥ 1)：三個功能推算出的時刻都是此值的倍數 |
| `passingTime.fineTune` | false | 還原通過時間時，一併解決時隔不足 (已有的通過時刻也可移動) |
| `passingTime.inaccurateArrival` | false | 還原通過時間時，忽略所有到站時刻，一併推算 (沒勾選時只推算空白的到站時刻，見 7.3) |
| `passingTime.imprecise` | false | 時刻精度不足：到發時刻經過取整，每個停靠站的到發可在取整前的範圍內移動，且至少停 `minDwell` (看起來像通過的也是)。與 `inaccurateArrival` 互斥 (UI 勾選其一時停用另一個；兩者皆為 true 時以此為準) |
| `passingTime.timetableGranularity` | 60 | 時刻表時刻的精度 (秒，≥ `timeGranularity`)；預設為只到分 |
| `passingTime.roundingMode` | `"auto"` | 取整的方式：`"round"` 四捨五入、`"floor"` 無條件捨去、`"ceil"` 無條件進位、`"auto"` 三種都算，取最好的 |
| `passingTime.minDwell` | 30 | 時刻精度不足時，每個停靠站最短的停車時間 (秒，≥ `timeGranularity`；範圍不夠時停到範圍允許的最長時間) |
| `passingTime.smooth` | true | 時刻精度不足時，求解後在範圍內平滑化運轉時間 (`smoothRuns()`，見 `ALGORITHM.md` 2.4)；不會增加衝突或時隔不足 |
| `passingTime.stopRules` | `[]` | 臨時停車規則 (見 7.4)：`{ bound: 0 (順逆行) \| 1 \| 2, number, color, name (null = 不限；number、name 為萬用字元), stations: "all" \| "cross" \| "overtake" \| "station", station: 站名 (stations == "station" 時，否則 null) }` |
| `trainColors` | | 長度 11 的陣列，index = 列車的 `train_color` (0 與 1 同色)。UI 為 `.train-color-input`，改變時同時更新 CSS 變數 `--color{n}` |

- `gap` 都是文字與圖表外框之間的距離。
- **文字超出檢查** `checkTextFit()`：在設定變更及輸出圖片時執行，超出則顯示黃色 toast (`#TextOverflowWarning`)。
  - 最長站名字數 × `stationText.fontSize` + `gap` > `margin.left`
  - (顯示別名時) 最長別名字數 × `aliasText.fontSize` + `gap` > `margin.right`
  - 時間文字高度 (最大字型大小) + `timeLabel.gap` > `margin.bottom`
- **時間文字預覽**：設定頁的 `#time-label-preview` 以和圖片相同的 `makeTimeLabel()` 畫出 8:00~9:00。
- **列車號放置** (`program/program/TrainNumber.js`)：
  - 區間以路線上**每一站**切分：列車通過但不停的站也算，所以號碼不會壓在中間的車站線上。
  - 從起點行經的垂直距離超過 `pxPerTrainNumber × n` 時，在該區間放一個號碼；之後 n 更新為 `floor(行經距離 / pxPerTrainNumber) + 1`，避免順延後連續擠在一起。
  - 站距小於 `minStationIntervalForTrainNumber` 的區間不放，號碼順延到下一個合格區間。
  - 號碼貼在列車線上方 (文字方向)，先試區間中點，再沿列車線前後交替平移 (每次半個字高)，直到文字框向外擴張 `trainNumberAvoidance.margin` 後，不碰到**其他列車**的線段、已放置的號碼，以及 (有勾選時) 整點線 / 次要時間線；文字框不可碰到區間兩端的車站線。找不到位置就取消這個號碼。
  - 平移的嘗試次數有上限 (區間長度 / 半個字高)，不會無窮迴圈；但避讓條件越多、間距越大，運算越久、放得下的號碼越少。
  - 碰撞以均勻格網 (`createSegmentGrid()`, 100px) 加速；文字寬度以 ASCII 0.6 em、全形 1 em 估算。
  - 所有列車線畫完後才放號碼，所以號碼可以避開順向與對向的所有列車。
- **透明背景**：列車線放在 `<g clip-path="url(#plot-area)">` 裡，由 SVG clipPath 裁切到圖表範圍內，不再用邊界的白色矩形遮蓋。列車線座標保持原值 (跨夜線段仍是完整座標)，只是顯示時被裁切。

## 3. 時刻格式

- 內部、JSON、CSV 一律為字串 `"hhmm"` 或 `"hhmmss"` (長度 4 或 6)。
- 輸入時由 `normalizeTime()` (`program/util/stc.js`) 統一：
  - 1~4 位數補到 4 位，5 位數補到 6 位 (`"935"` → `"0935"`, `"93500"` → `"093500"`)。
  - 非數字、分/秒 ≥ 60、超過 `2400` 視為不合法：表格中以紅底標示且**不寫入資料**；匯入時該格視為空白。
- 空字串 `""` 代表沒有該時刻。
- 不支援 28/30 小時制，跨夜直接寫時刻 (例：`2400` → `0001`)。

## 4. 路線資料 `ROUTE`

```js
ROUTE = {
	route_name: "ＪＲ香椎線",
	stations: [
		{ name: "西戸崎", kilo: 0,   stopsec: 60, alias: "" },
		{ name: "海ノ中道", kilo: 2.1, stopsec: 60, alias: "" },
		...
	],
	track_layout: {
		stations: ["double.3", "double.3", ...],   // length = stations.length
		sections: ["single", ...],                 // length = stations.length - 1
		max_speed_enabled: true,
		max_speed_all: 85,
		max_speeds: [85, null, ...]                // length = stations.length - 1
	}
}
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `route_name` | string | 路線名。只在 JSON 中出現；匯入列車 JSON 時若目前為空，會取用列車檔的 `route_name` |
| `stations[].name` | string | 站名 |
| `stations[].kilo` | number \| null | 累計里程。第一站固定為 0；`null` = 尚未輸入 |
| `stations[].stopsec` | number | 該站預設停站秒數：到站時刻空白時，以「發車 − `stopsec`」計算 (`arrivalTime()`) |
| `stations[].alias` | string | 站名別名 (目前未使用) |
| `track_layout.stations[i]` | string | 第 i 站的軌道類型 (見 4.3) |
| `track_layout.sections[i]` | string | 第 i 站與第 i+1 站之間 (站間) 的軌道類型 |
| `track_layout.max_speed_enabled` | boolean | `false` = 不設定最高速度 (「停用」勾選框)：`max_speeds` 全為 `null`，表格不顯示速度欄 |
| `track_layout.max_speed_all` | number \| null | 最後一次填入的「全線最高速度」，只用來還原輸入框 |
| `track_layout.max_speeds[i]` | number \| null | 同一站間的最高速度 (km/h)，`null` = 未填 |

`stations` 的順序即「順行」(bound 1) 的順序。

### 4.1 路線 JSON

與 `ROUTE` **完全相同**：`JSON.stringify(ROUTE)`。匯入時 `stopsec`、`alias`、`track_layout` 可省略。
`track_layout` 由 `loadTrackLayout()` 讀取：缺少的欄位、長度不足的部分、不認得的值都當作 `DEFAULT_TRACK` (`"quadruple"`)，最高速度不是正數時當作 `null`；超出站數的部分忽略。

### 4.2 路線 CSV

每站一列，無標題列：

```
站名,里程[,停站秒數][,別名]
```

- 匯出固定 4 欄；匯入接受 2~4 欄 (舊的 `站名,里程` 檔案可直接使用)。
- 第一站的里程一律當作 0。
- 匯入完成後自動執行「生成」(里程檢查 + 渲染時刻表)。
- CSV 不含軌道配置：匯入時保留目前的 `track_layout` (經 `loadTrackLayout()` 配合新的站數截斷或補上預設值)，與 `route_name` 相同。

### 4.3 軌道配置 `track_layout`

定義見 [icon/route/鐵道配置圖.md](icon/route/鐵道配置圖.md)。只存類型字串，不存選單 / 勾選框的狀態。程式在 `program/program/TrackLayout.js`。

| 類型 | UI | 線數 `lines` | 可追越 `bits` |
|---|---|---|---|
| `single` | 單線 | 1 | 0 |
| `double.0` ~ `double.3` | 複線 + 順行/逆行可追越 | 2 | 0 ~ 3 |
| `triple.1` ~ `triple.3` | 三線 + 順行/逆行可追越 (至少一個) | 3 | 1 ~ 3 |
| `quadruple` | 四線 | 4 | 3 |

- `parseTrack(track)` → `{ lines, bits }`；`makeTrack(lines, bits)` 為其反函式 (三線且 `bits == 0` 時改為 3)。
- `bits`：1 = 順行 (bound 1) 可追越，2 = 逆行可追越，3 = 雙向皆可。判斷方式：
  - 交會：`lines >= 2`
  - bound b 追越：`bits & b`
  - bound b 追越的同時交會：`lines >= 3 && bits & b`
  - 雙向同時追越並交會：`lines == 4`
- 預設 `DEFAULT_TRACK = "quadruple"` (不設限)，在 `DataStore.js`；`newTrackLayout(count)` 產生全線預設、未填最高速度的配置。
- 快速套用 (`applyTrackPreset(name)`，`[車站, 站間]`)：`single` = `[double.3, single]`、`double` = `[double.3, double.0]`、`doubleSingle` = `[double.3, double.3]`、`unlimited` = `[quadruple, quadruple]`。只改類型，不改最高速度。
- 車站增刪：`insertStation()` 新車站沿用上一站的類型、被切開的站間 (加在最後時為最後一個站間) 兩段都沿用原本的類型與最高速度；`deleteStation()` 刪除該站，前後兩個站間合併為上面那一個。
- 最高速度：`minRunSec(i)` = 站距 ÷ `max_speeds[i]`，四捨五入到秒 (缺少速度或里程、里程不遞增時為 `null`)。表格中以 `2m32s` 格式顯示在輸入框旁，改速度或里程時立即更新。
  - 輸入 0、負數、非數字 → 紅底、不寫入；小於 10 → 寫入，但顯示黃色 toast `#LowSpeedWarning`；空白 → `null`。
  - 「全線最高速度」(`#TrackSpeedAll`)：值存在 `max_speed_all`；填入合法的值即寫入所有站間 (空白只清空 `max_speed_all`，不動各站間)。
  - 「停用」(`#TrackSpeedAllDisabled`) = `!max_speed_enabled`：勾選時清空 `max_speed_all` 與所有 `max_speeds`，停用全線輸入框，表格不顯示速度欄；取消勾選後恢復顯示 (皆為空白)。
  - 匯入：`max_speed_enabled` 缺少時為 `true`；為 `false` 時忽略檔案中的速度。輸入框與勾選框的狀態由 `renderTrackTable()` 依資料更新。
- 計算只使用類型字串，圖片只是顯示 (下節)。

#### 軌道配置圖

`renderTrackTable()` (`program/ui/trackLayoutInput.js`) 由上而下每站、每個站間各一列 (共 2N−1 列，每列固定高 70px)。左欄圖片 (`icon/route/`)：

- 車站：`{類型}.sta.svg`；站間：`{類型}.svg`。皆為 40×50，放在列的中間 (上下各留 10px)。
- 相鄰兩列之間放 40×20 的轉換圖，跨在兩列的分隔線上 (上一列的最後 10px + 下一列的最初 10px)。
- 轉換圖由 `trackTransition(上, 下)` 查 `TRACK_TRANSITIONS` (列 = 上方類型、欄 = 下方類型，順序同 `TRACK_TYPES`)。表格空白時查對稱的格子，並上下翻轉 (`.flip` = `scaleY(-1)`)。

## 5. 列車資料 `TRAINS`

```js
TRAINS = {
	1: [ train, train, ... ],   // 順行
	2: [ train, train, ... ]    // 逆行
}

train = {
	train_number: "2721C",
	settings: {
		train_name: "普通",
		train_color: 1          // 0~10, index of SETTINGS.trainColors
	},
	timetable: [                // only stations the train stops at / passes, sorted by station_order
		{ station_order: 0, station_name: "西戸崎", arrival: "0528", departure: "0529" },
		...
	]
}
```

| 欄位 | 說明 |
|---|---|
| `station_order` | 該方向車站列表中的 index。bound 1 = `ROUTE.stations` 的 index；bound 2 = 反轉後的 index (`stationCount - 1 - routeIndex`)。用 `boundStations(bound)` 取得該方向的車站列表 |
| `station_name` | 冗餘欄位，方便閱讀 JSON。由 `refreshStopNames()` 依路線自動更新 (車站改名/增刪/匯入時) |
| `arrival` / `departure` | 見第 3 節。兩者皆空的停靠站會被移除；只有發車時刻的停靠站，到站時刻保持空白 (代表不知道)，畫圖、計算時才以 `arrivalTime()` 算出 (= 發車 − 該站 `stopsec`)，不寫回資料 |

繪圖只使用有 `departure` 的停靠站。

### 5.1 列車 JSON

```js
{
	route_name: ROUTE.route_name,
	bound: 1 | 2,
	station_count: 16,
	station_record: ["西戸崎", "海ノ中道", ...],   // station names in this bound's order
	train_count: 84,
	timetable: TRAINS[bound]                     // identical to the internal train objects
}
```

- `timetable` 陣列與內部 `TRAINS[bound]` 結構、欄位名稱完全相同。
- 外層的 `route_name`, `bound`, `station_count`, `station_record`, `train_count` 只在匯出時由 `ROUTE` / `TRAINS` 產生，**匯入時忽略** (方向由按下的匯入按鈕決定，站序以 `station_order` 為準)。
- 此格式與 `crawler/crawler_routetime.py` 產生的檔案相同。

### 5.2 列車 CSV

一班車佔一欄 (發車時刻) 或兩欄 (到站, 發車)。無站名欄、無標題欄。設 N = 路線車站數，車站順序為**該方向**的順序 (逆行表第一列時刻 = 路線最後一站)。

發車時刻 (`匯出CSV` 於「發車時刻」列 / `匯入` 於「發車時刻」列)：

| 列 | 內容 |
|---|---|
| 0 | 車次 |
| 1 ~ N | 各站發車時刻 (未停靠留白) |
| N+1 (可省略) | 列車名 |
| N+2 (可省略) | 顏色 (0~10) |

到發時刻 (`匯出CSV` / `匯入` 於「到發時刻」列)：每班車兩欄 `[到站, 發車]`；車次、列車名、顏色列寫在第一欄，第二欄留空：

```
2721C,,2723C,
0528,0529,0606,0607
...
普通,,普通,
1,,1,
```

- 不支援含逗號或換行的欄位 (無引號處理)。
- 匯入時會移除檔尾空行與 UTF-8 BOM，接受 `\r\n` 換行。
- 註：gitbook 操作手冊描述的是舊版格式 (車次/列車名/顏色在最上面三列)，程式目前的格式是車次在第一列、列車名與顏色在最後兩列。

### 5.3 匯入方式

匯入/匯出頁的「匯入列車資料時」選單：

- `取代該方向現有列車` (預設)：`TRAINS[bound]` 換成檔案內容。
- `附加至該方向現有列車之後`：先移除空白列車 (無車次且無時刻)，再把檔案內容接在後面。

檔案類型由副檔名判斷：`.json` 為 JSON，其他視為 CSV。JSON 可由任一列車匯入按鈕匯入。

## 6. 設定 JSON 與全部資料 JSON

### 6.1 設定 JSON

匯出內容即 `SETTINGS` 本身 (欄位見第 2 節)。匯入 (`loadSettingsFromJSON()`) 以 `DEFAULT_SETTINGS` (`globalvar.js` 載入時複製的預設值) 為基準逐欄合併：

- 檔案中缺少的欄位、型別與預設不同的欄位 → 使用預設值，不報錯 (相容舊版檔案)。
- 預設中沒有的欄位 → 忽略。
- 「未出現」代表預設，而不是保留目前的值。
- 預設為空陣列的欄位 (`passingTime.stopRules`) → 直接採用檔案中的陣列 (不是陣列則為 `[]`)，元素不逐欄檢查。

匯入後由 `applySettings()` 寫回 `SETTINGS`，並以 `initSettingsUI()`、`renderStopRules()` 更新設定頁 (含 `#starthhmm` / `#endhhmm`、列車顏色與 CSS 變數 `--color{n}`)。

### 6.2 全部資料 JSON

```json
{
    "route": { ...路線 JSON (4.1)... },
    "trains": {
        "1": { ...列車 JSON (5.1)，順行... },
        "2": { ...列車 JSON (5.1)，逆行... }
    },
    "settings": { ...設定 JSON (6.1)... }
}
```

- 每一部分的格式與單獨匯出時相同，匯入 (`loadAllFromJSON()`) 時拆開後交給 `loadSettingsFromJSON()` / `loadRouteFromJSON()` / `loadTrainFromJSON()`。
- 順序：設定 → 路線 → 列車 (路線缺少 `stopsec` 時使用匯入後的 `defaultStopSec`)。
- 缺少 `settings` → 全部使用預設；缺少 `route` 或某個方向的 `trains` → 保留目前資料。
- 列車一律取代 (不看「匯入列車資料時」選單)。
- 任何部分解析失敗則不套用任何變更 (設定會還原)。

## 7. 待避時間計算 (基本設定 > 待避時間計算)

演算法的詳細說明見 [ALGORITHM.md](ALGORITHM.md) (自動補全、模型與衝突) 與 [ALGORITHM_STN_PROPOSAL.md](ALGORITHM_STN_PROPOSAL.md) 第 7 節 (還原通過時間)；使用者手冊為 `manual/src/manual-ops-passing-time.md`。

兩個推算、調整通過時刻的功能。結果都先寫在**副本**中，可預覽，按「採用」後才取代 `TRAINS`。

### 7.1 副本 `DRAFTS` (`program/data/Draft.js`)

```js
DRAFTS = { autofill: draft | null, passing: draft | null }
draft = { trains: { 1: [...], 2: [...] }, fingerprint: "..." }   // trains: structuredClone(TRAINS)
```

- `newDraft()` 複製 `TRAINS`，並記下 `fingerprint` = `JSON.stringify([ROUTE, TRAINS])`。
- `validDraft(name)`：路線或時刻表在計算後有任何變動 (指紋不同) 時捨棄副本並回傳 `null`。採用、預覽、再次自動補全前都會檢查，失效時顯示紅色 toast `#DraftInvalid`，因此不會蓋掉使用者之後的修改。採用其中一個副本後，另一個也會因此失效。
- 採用：`.adopt-draft-btn` → modal `#AdoptDraftModal` → `adoptDraft(name)`：`TRAINS[1]`、`TRAINS[2]` 換成副本，釋放副本。
- 捨棄：`.discard-draft-btn`。預覽：輸出圖片頁的 `.preview-draft-btn` (有副本時才顯示) 以 `drawDiagram(draft.trains)` 繪圖，`#OutputSource` 標示目前顯示的是預覽。
- 新增的通過時刻是 `arrival == departure` 的停靠站，寫入原本空白的格子 (還原通過時間勾選微調時，已有的通過時刻也可能被調整)。
- 空白的到站時刻不會被填入 `TRAINS` (畫圖用 `arrivalTime()` 即時計算)，所以「空白」一直代表「不知道」，還原通過時間會把它當作不準確的到站時刻。

### 7.2 自動補全 (`program/program/RunTimeAutofill.js`)

把基準車次 (golden) 的運轉時間套用到同方向、符合條件的列車：

- 條件：車次、線條顏色 (`train_color`)、列車名，勾選的條件以 AND 連接 (至少勾一個)。車次與列車名為萬用字元：`*` = 任意長度、`.` = 任一字元，其餘照字面完整比對 (`wildcardRegExp()`)。基準車次以 `findTrainByNumber()` 找，先找順行。
- 只填目標列車**兩個停靠站之間的空白站**，且基準車次在該站有時刻：運行區間、已有的時刻都不變；與基準車次沒有重疊的列車不會改變。
- 時刻：基準車次的純運轉時間 (不含停站) 累計為 `clock`，按目標列車在前後兩站的實際時刻等比例縮放：`前站發 + (後站到 − 前站發) × (clock[k] − clock[前]) / (clock[後] − clock[前])`。運轉時間與基準車次相同時，即「前站發車 + 基準車次的 offset」。只有一端在基準車次的範圍內時，從那一端加減基準車次的運轉時間；結果不在兩站時刻之間的不填。
- 「會改變的車次」即時列出會被改變的列車 (`computeAutofill()`)；除了基準車次以外的列車全部會改變時顯示「所有」。
- 確認後套用到 `DRAFTS.autofill` (沒有或已失效時新建)；之後再確認會疊加在同一個副本上，`draft.changed` 記錄改過的列車。

### 7.3 還原通過時間 (`program/program/PassingTime.js` / `PassingTimeSTN.js`，依 `solver`)

**模型** (`createPassingModel()`)：每班車在其運行區間的每一站都有時刻 (停靠站之間依里程直線內插，與圖上的線相同)，以該方向的 `station_order` 為 index。元素 (element) = 車站 `2r` 與站間 `2r+1` (`r` 為 `ROUTE.stations` 的 index)。列車在車站內的時間為到站 ~ 發車，但起站只算發車、終點站只算到站。

**衝突** (`detectConflicts()`)：

| 情形 | 條件 | 計入 |
|---|---|---|
| 追越 | 同方向兩車進入與離開元素的順序不同，且該方向不可追越 (`bits & bound == 0`) | 追越衝突 |
| 追越時交會 | 複線可追越，但後車通過前車的期間有對向列車在該元素內 | 追越衝突 |
| 雙向同時追越 | 三線、雙向皆可追越，但兩方向被追越的列車在該元素內的時間重疊 | 兩方向各一個追越衝突 |
| 交會 | 單線，兩對向列車同時在該元素內 | 交會衝突 |
| 時隔不足 (只在勾選 `fineTune` 時) | 同方向兩車在同一站「進站」(通過或到站；起站不算) 或「出站」(通過或發車；終點站不算) 的時間差 < `minTimeSeparation`；只在進站 (出站) 的那個站間不能追越時檢查 | 時隔不足 |

- 起站、終點站不算車站內的追越。時刻相同不算追越或交會。
- 追越以「沿路線掃過去，保持列車依抵達順序排列」偵測：每個元素用插入排序換成離開順序，每次交換即一組追越，O(列車數 + 追越數)；交會以時間排序的掃描線找出；時隔不足在掃描中檢查相鄰的列車。

**不準確的到站時刻** (詳見 `ALGORITHM.md` 2.1)：勾選 `inaccurateArrival` 時所有停靠站 (起站、`arrival == departure` 除外)，沒勾選時到站時刻空白的停靠站，到站時刻視為不準確：先設為「發車 − `stopsec`」，再以 golden (同方向、同一對相鄰停靠站之間沒有衝突的最短運轉時間) 推算：運轉時間比 golden 長超過 `minExtraPassingWaiting + 60` 秒的，改為提早到站 (待避)。求解時這些到站時刻可在「最早到站 (兩方向較短的 golden，或最短運轉時間)」與「發車 − `stopsec`」之間移動；結束時寫入副本 (原本空白、結果仍是「發車 − `stopsec`」的保持空白)，結果列顯示「修改 n 個到站時刻」(寫入的數量)。採用後，寫入的到站時刻就和使用者填的一樣被當作準確的 (要重新推算請勾選「到站時間不準確」)。

**解決**：「求解器」下拉選單 (`passingTime.solver`) 選擇，兩者共用模型、衝突定義與其他參數，結果都放在 `DRAFTS.passing`。

- **貪婪解法** (`restorePassingTimes(trains, true, fineTune, onRound, onDone)`，詳見 `ALGORITHM.md` 第 4–6 節)：一次解決一個衝突，候選的通過時刻為待避列車發車前 / 到站後 `minTimeSeparation`，只在衝突消失且受影響的衝突總數減少時採用 (可再加最多 `maxPassingPointIncrease` 個點)；勾選 `fineTune` 時先還原、再逐一移動通過時刻解決時隔不足。
- **離散決策 + 差分約束** (`restorePassingTimesSTN(trains, fineTune, onRound, onDone)`，詳見 `ALGORITHM_STN_PROPOSAL.md` 第 7 節)，每一輪：
   1. 每個追越 / 交會衝突提出一個候選：讓 x 通過附近的車站 s，y 在 s 待避 (停站秒數 > `stopsec + minExtraPassingWaiting`，或在 s 始發 / 終到)，s 要能追越 (同向) 或交會 (對向)，距離衝突不超過 `maxSearchDepth` 站；依「放得下最短時隔 → 距離近 → 時刻變動小」取同一對列車在該站還沒試過的。勾選 `fineTune` 時，時隔不足的兩車 (沒有其他衝突的) 在該站加入通過時刻。
   2. 所有可移動的通過時刻一起以差分約束 (`t_j − t_i ≥ c`) 求解：最高速度、各站列車的先後順序、提案 (y 的停車期間，可能時前後留 `minTimeSeparation`)，勾選 `fineTune` 時再加上相鄰列車的 `minTimeSeparation`。不可行的約束不採用，被拒絕的提案還原。
   3. 每個通過時刻取最接近目前時刻的可行值。重新偵測；衝突數 ≤ `maxAllowedConflict`、達到 `maxIteration`、或連續 3 輪沒有更好時停止。
   4. 最後移除新通過時刻中，與前後時刻的直線相差 < `timeGranularity` 的 (移除後衝突、時隔不足變多則保留)，`writePassingTimes()` 寫進副本。

- 最高速度：有設定的站間用 `minRunSec()`；沒有設定的，以時刻表中通過該站間的最快「停靠站到停靠站」平均速度 (不計 `arrival == departure` 的通過點，避免之前推算的時刻逐次放寬上限) × `estimatedSpeedLimitRatio` 估計。(差分約束) 時刻表本身比上限快的區段，上限等比例放寬。
- 通過時刻都對齊 `timeGranularity` 的倍數。
- 勾選 `fineTune` 時，時刻表中已有的通過時刻 (`arrival == departure`) 也可以移動 (結果列顯示「調整 n 個」)；沒勾選時只填原本空白的格子。
- 以 `setTimeout` 讓出瀏覽器 (貪婪解法約每 50 ms (`ROUND_SLICE`)，差分約束每一輪)，每一輪後更新 dashboard (迴圈數、追越 | 交會 (| 時隔不足) 衝突數、上一圈消除的衝突數)；結束後隱藏 dashboard，結果列顯示最終衝突數與新增 / 調整的通過時刻數。
- 離散決策 + 差分約束在東海道新幹線 (有最高速度)：勾選微調時追越 178 → 0、時隔不足 450 → 0，新增 556 個通過時刻，約 0.06 秒；不勾選時追越 178 → 0，新增 195 個。
- 貪婪解法在東海道新幹線：勾選微調時追越 0、時隔不足剩 2，新增 491 個；不勾選時新增 210 個。
- 原本獨立的「通過時間微調」按鈕與 `DRAFTS.finetune` 已移除，由勾選「同時進行通過時間微調」取代 (兩種求解器皆可)。

**時刻精度不足** (`imprecise`，詳見 `ALGORITHM.md` 2.3)：勾選後 UI 顯示 `#pt-imprecise-fields` (發車時刻精度、精度的處理方式、最小停車時間)，並停用「到站時間不準確」(反之亦然，`updateSettingsUI()`)；兩個精度欄位的 `min` 隨 `timeGranularity` 更新。

- 求解器多一個參數 `rounding` (`restorePassingTimes(..., onDone, rounding)`、`restorePassingTimesSTN(..., onDone, rounding)` → `createPassingModel(trains, headway, rounding)`)：沒勾選時為 `null`。`onDone(counts, written, m)`。
- 每個停靠站 (包括「到 = 發」的) 的到、發都在取整前的範圍內移動，至少停 `minDwell`；建模後先以差分約束放到可行的位置 (範圍、停車、最高速度、各站順序)，再照常求解。
- `roundingMode == "auto"` 時 `runPassingTime()` 依序以四捨五入、無條件捨去、無條件進位各算一次 (各用一個新副本)，取 (追越 + 交會) × 10⁶ + 時隔不足最小、再取 `runTimeSpread(m)` 最小的結果 (同分取前者)，結果列加上「精度的處理方式：…」。
- 勾選「平滑化運轉時間」(`smooth`，`#pt-smooth`) 時，求解後、寫入前以 `smoothRuns(m)` 在範圍內調整，使各班車的運轉時間接近該段的目標 (目標與時刻一起求：從各車可能的範圍出發、不受被墊時間的列車影響、兩方向可行時一致)，停車時間可以變長，只保留沒有讓衝突、時隔不足變多的列車。
- 寫入副本時 vague 停靠站的到、發全部寫入，結果列顯示「調整 n 個停靠站時刻」(與原本字串不同的個數)。

### 7.4 臨時停車規則 (`passingTime.stopRules`)

「還原通過時間」標題旁的「臨時停車規則」展開左右兩欄 (`#PassingTimeStopRules`)：

- 左欄：方向 (順逆行 / 順行 / 逆行)、車次 / 線條顏色 / 列車名 (勾選的條件 AND，都不勾 = 所有列車；車次、列車名的萬用字元同自動補全，勾選但空白時以紅底拒絕)、車站 (`所有車站` / `所有可交會的站` / `所有可追越的站` / 路線中的各站)，按「新增規則」加入 `SETTINGS.passingTime.stopRules`。
- 右欄 (`renderStopRules()`)：每條規則一列，第一行粗體為規則的敘述 (`stopRuleTitle()`，例如「所有逆行列車都可以在中道信号場臨時停車」)，第二、三行為目前符合的車次 (全部符合時寫「所有」) 與車站 (所有車站寫「所有」；可交會 / 可追越的站列出站名，`bound == 0` 時任一方向可追越即列出)；右側 × 刪除。
- 指定的車站以**站名**儲存，路線改名後需重新新增。車站選單、規則列表在展開、匯入設定、`onRouteChanged()` 時重新渲染。
- 規則隨設定 JSON 匯出匯入。演算法見 `ALGORITHM.md` 2.2：符合規則的列車可以在允許的站 (沒有自己的停靠站、不是起訖站) 臨時停車，讓另一班車交會或追越；停車的時刻以 golden 的速度 (多停一次另加 60 秒) 推算自然的到、發，並優先讓時刻表上有餘裕的列車停車，通過的列車盡量不移動。結果寫成到、發不同的停靠站，結果列顯示「臨時停車 n 次」。

### 7.5 輸出圖片的預覽

- 預覽副本時 `#OutputSource` 標示預覽，`#DownloadPreviewSVGBtn` 出現 (存成 `TrainDiagram-preview.svg`)，`#DownloadSVGBtn` 停用，避免把預覽存成正式檔名；按「輸出結果」後恢復。

## 8. 相關函式一覽

| 檔案 | 函式 / 變數 |
|---|---|
| `program/program/globalvar.js` | `SETTINGS`, `DEFAULT_SETTINGS` |
| `program/data/DataStore.js` | `ROUTE`, `TRAINS`, `DEFAULT_TRACK`, `newStation()`, `newTrackLayout()`, `newTrain()`, `boundStations()`, `findStop()`, `addStop()`, `setStopTime()`, `insertStation()`, `deleteStation()`, `refreshStopNames()`, `arrivalTime()`, `stopTimes()`, `isBlankTrain()` |
| `program/ui/addStationInput.js` | `renderRouteTable()` (同時呼叫 `renderTrackTable()`), `onRouteChanged()`, 路線表格事件 |
| `program/ui/trackLayoutInput.js` | `renderTrackTable()`, 軌道配置表格事件、快速套用按鈕 |
| `program/program/TrackLayout.js` | `TRACK_TYPES`, `TRACK_TRANSITIONS`, `TRACK_PRESETS`, `parseTrack()`, `makeTrack()`, `trackTransition()`, `applyTrackPreset()`, `minRunSec()` |
| `program/handler/TrackLayoutHandler.js` | `loadTrackLayout()` (路線 JSON / CSV 匯入時讀取 `track_layout`) |
| `program/ui/createTimetable.js` | `renderTimetable(bound)`, `checkkilo()`, `generateTimetable()` |
| `program/ui/addTrainInput.js` | 時刻表事件 (新增/刪除列車、車次、時刻輸入) |
| `program/ui/optionsIO.js` | 列車細項 (列車名、顏色) offcanvas |
| `program/handler/RouteInfoHandler.js` | 路線匯入/匯出：`applyRoute()`, `getRouteDataCSV()`, `loadRouteFromCSV()`, `loadRouteFromJSON()` |
| `program/handler/TimetableHandler.js` | 列車匯入/匯出：`applyTrains()`, `getTrainDataJSON()`, `loadTrainFromJSON()`, `getTrainDataCSV()`, `loadTrainFromCSV()` |
| `program/handler/SettingHandler.js` | 設定匯入/匯出：`loadSettingsFromJSON()`, `mergeSettings()`, `applySettings()` |
| `program/handler/AllDataHandler.js` | 全部資料匯入/匯出：`getAllDataJSON()`, `loadAllFromJSON()` |
| `program/setting/OutputSetting.js` | `initSettingsUI()`, `updateSettingsUI()`, `renderTimeLabelPreview()`, `checkTextFit()` |
| `program/program/Graphing.js` | `drawDiagram(trains = TRAINS)`, `drawTrain()`, `timeToX()`, `makeTimeLabel()`, `timeLabelHeight()` |
| `program/program/TrainNumber.js` | `placeTrainNumbers()`, `findTrainNumberPosition()`, `createSegmentGrid()`, `addSegment()`, `someSegment()`, `segmentHitsBox()` |
| `program/data/Draft.js` | `DRAFTS`, `newDraft()`, `validDraft()`, `adoptDraft()` |
| `program/program/RunTimeAutofill.js` | `wildcardRegExp()`, `findTrainByNumber()`, `computeAutofill()`, `applyAutofill()` |
| `program/program/PassingTime.js` | `createPassingModel()`, `detectConflicts()`, `writePassingTimes()`；貪婪解法 `solveConflict()`, `addHeadwayCandidates()`, `restorePassingTimes()`；未使用的 `plainConflicts()` |
| `program/program/PassingTimeSTN.js` | 離散決策 + 差分約束：`restorePassingTimesSTN()`, `solveNetwork()`, `addProposals()`, `addHeadwayPoints()`, `prunePassingTimes()` |
| `program/ui/passingTimeInput.js` | 待避時間計算的表單、dashboard、採用 / 捨棄 / 預覽 (`updateDraftUI()`, `checkedDraft()`) |
| `program/util/common.js` | `escapeHTML()`, `downloadFile()`, `readImportFile()`, `parseCSV()` |
| `program/util/stc.js` | 時刻字串轉換：`normalizeTime()`, `toSec()`, `toStr()`, `deductSec()`, `tohhmmss()` |

HTML 中 script 載入順序：`globalvar.js` → `DataStore.js` → `Draft.js` → util → UI → 核心程式 → handler → setting → 設定/全部資料 handler，最後呼叫一次 `renderRouteTable()` / `renderTimetable()` / `initSettingsUI()`。
