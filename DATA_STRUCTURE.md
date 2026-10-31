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

- 路線與列車資料**只存在** `program/data/DataStore.js` 的 `ROUTE` 和 `TRAINS`。`TRAINS` 是目前運行型態的列車；其他運行型態的列車在 `OPMODES` (5.7)。整份檔案的基本資料在 `INFO` (6.2)。
- 表格由資料重新渲染；使用者在表格上的每個修改 (`change` 事件) 立即寫回 `ROUTE` / `TRAINS`。
- 繪圖、匯出都只讀寫 `ROUTE` / `TRAINS`，不讀 DOM；待避時間計算 (第 7 節) 先寫在副本，採用後才取代 `TRAINS`。
- 新增/刪除車站時，`insertStation()` / `deleteStation()` 會同步平移所有列車停靠站的 `station_order`，並同步增刪 `ROUTE.track_layout` 與 `ROUTE.topology`，因此列車資料、軌道配置與線路拓樸永遠與路線一致。

## 2. 設定 `SETTINGS` (`program/program/globalvar.js`)

預設值只寫在 `globalvar.js`。基本設定頁的輸入框以 `data-setting="路徑"` 對應到 `SETTINGS` 的欄位 (例：`data-setting="lines.station.width"`)，
載入時由 `initSettingsUI()` 填入預設值，`change` 時由同一個 handler 寫回 (`program/setting/OutputSetting.js`)：
checkbox → boolean，`type="number"` 與數字選項的 select → number (空白、非數字、超出輸入框的 `min` / `max` 則還原)，其他 → string。

| 欄位 | 預設 | 說明 |
|---|---|---|
| `defaultStopSec` | 60 | 預設停站秒數：新車站 (及匯入時缺少 `stopsec` 的車站) 的 `stopsec` 預設值 |
| `startSec` / `endSec` | 0 / 86400 | 圖上時間範圍 (秒)，最多到 108000 (3000，翌日 6 點)；超過 24 時的部分，列車線以一日為週期重複繪製。UI 為 hhmm (`#starthhmm` / `#endhhmm`，獨立 handler，不合法的輸入會還原) |
| `pxPerKm` / `pxPerMin` | 25 / 25 | 每公里 / 每分鐘像素 |
| `trainLineWidth` | 2 | 列車線寬 (px) |
| `trainLineWidthByColor` | 11 個 `null` | 依列車顏色 (`train_color`) 分別設定的線寬；`null` = 用 `trainLineWidth` |
| `trainLineType` | `"solid"` | 列車線的線型：`"solid"` \| `"dashed"` \| `"dotted"` |
| `trainLineTypeByColor` | 11 個 `""` | 依列車顏色分別設定的線型；`""` = 用 `trainLineType`。列車自己的 `settings.line_width` / `line_type` 優先於這兩組 |
| `showTrainNumber` | true | 是否標示列車號 (顏色同列車線) |
| `trainNumberFontSize` | 20 | 列車號字型大小 |
| `pxPerTrainNumber` | 750 | 每行經多少像素 (垂直距離) 標一次列車號 |
| `minStationIntervalForTrainNumber` | 70 | 站距 (像素) 小於此值的區間不標列車號 |
| `trainNumberAvoidance.enabled` | true | 避讓總開關；關閉時列車號只放在區間內 (仍不跨越車站線)，可與任何線、文字重疊 |
| `trainNumberAvoidance.primaryTimeLines` | false | 是否避開整點線 |
| `trainNumberAvoidance.secondaryTimeLines` | false | 是否避開次要時間線；僅在 `lines.secondary.interval × pxPerMin ≥ 250` 時有效 (hard limit `MIN_PX_TO_AVOID_SECONDARY_LINES`，不足時 UI 停用、繪圖時也忽略) |
| `trainNumberAvoidance.margin` | 5 | 列車號與要避開的線、文字之間的最小距離 (px)，限 0~20 |
| `connectTrainLines` | true | 每班列車畫成一條 `<polyline>` (跨日的列車，每一天各一條)；`false` = 每一段一條 `<line>`，包在一個 `<g>` 裡 (與舊版相同)。列車號的位置不受影響 |
| `layers.enabled` | false | 分圖層 (`LAYERS`，`Graphing.js`)，見下方「SVG 結構」 |
| `layers.trainByDirection` / `layers.trainByColor` | false / false | 列車線圖層再分方向 (`順行` / `逆行`) / 顏色 (`顏色{n}`，0 為 `未指定顏色`)；兩者皆是時方向之下再分顏色 |
| `oudiaStyle.enabled` | false | OuDia 樣式 (`program/program/OudiaStyle.js`)：時間線、車站線、圖框改用下列設定 (取代 `lines.*`，不用 `aliasText` 與時間文字的格式)。圖框 (`oudiaFrame()`) 包含站名欄 (寬 = 最長的「站名字數 × 字型大小 + 2 × gap」) 與第一站上方一行 (第一站站名字型大小 × 1.2)，都在 `margin` 之內；車站線從圖框左緣畫起，站名靠右、在車站線上方；時間只標整點的小時 (0~23)，在圖框上方、左對齊時間線，用 `timeLabel.formats.standard` 的字型大小、顏色與 `timeLabel.gap`。停車不到 60 秒 (或到站時刻空白) 的中途停車站只畫發車 (前一段直接連到發車時刻)。列車號從起點開始標。設定頁中不適用的項目加上 `.oudia-hide`，`#container-setting` 有 `.oudia-mode` 時隱藏 |
| `oudiaStyle.timeScale` | 1 | `OUDIA_TIME_SCALES` 的 index：`[點線, 細線, 粗線]` 的間隔 (分)，0~7 = `[1,5,30]` `[2,10,60]` `[5,10,60]` `[10,30,60]` `[15,15,60]` `[20,20,60]` `[30,30,60]` `[60,60,60]` (同 OuDia 的時間目盛)。粗線視為整點線、細線視為次要時間線 (列車號避讓)；id 同時間線，class 為 `timeline bold` / `thin` / `dotted` |
| `oudiaStyle.axisColor` / `.lineWidth` | `"#C0C0C0"` / 1 | 時間線、車站線、圖框的顏色、線寬；粗時間線與圖框 (含站名欄與圖之間的線) 為兩倍線寬，車站線一律為細線 |
| `oudiaStyle.stopMarks` | true | 停車駅明示：上述只畫發車的站，在發車點畫實心圓 (`<circle class="stop-mark">`，列車線的顏色，半徑 = 列車線寬 + 1.5)，在列車線的 `<g>` / 圖層內 |
| `oudiaStyle.showTrainName` | false | 列車號後加上 `train_name` (`trainLabel()`) |
| `margin.{left,right,top,bottom}` | 100 | 圖表外框到圖片邊緣的距離 |
| `background.transparent` / `.color` | false / `#FFFFFF` | 背景。透明時不畫背景矩形 |
| `lines.{station,secondaryStation,primary,secondary}` | | `{ width, color, type }`：車站線、次要車站線、整點線、次要時間線；`type` 為 `"solid"` \| `"dashed"` \| `"dotted"` |
| `lines.minute` | `{ enabled: false, width: 1.5, color: "#808080" }` | 分鐘時間線：沒有時間線的每一分鐘，畫成由上到下每公里 (`pxPerKm`) 一點的點線；`width` 是點的直徑 |
| `lines.outline` | | `{ top, bottom, left, right, color }`：外框四邊各自的線寬 (0 = 不畫)，固定為實線 |
| `lines.secondaryStation` | `{ 1.4, "#808080" }` | `{ width, color }`：次要車站 (`ROUTE.topology.secondary`) 的車站線 |
| `lines.secondary.interval` | 10 | 次要時間線間隔 (分)：1, 5, 10, 15, 20, 30 |
| `stationText` | | `{ fontSize, color, gap }`：左側站名，靠右對齊 |
| `aliasText` | | `{ show, fontSize, color, gap }`：右側站名別名，靠左對齊 |
| `secondaryStationText` / `secondaryAliasText` | `{ 16, "#808080", 10 }` | `{ fontSize, color, gap }`：次要車站的站名 / 別名 (別名是否顯示同樣看 `aliasText.show`)。設定頁沒有預覽 |
| `timeLabel.format` | `"standard"` | `standard` = hh:mm 固定大小；`sized` = hh 大、mm 小直接相接，同一基線 (向下對齊)；`simple` = 整點只標 hh、次要只標 mm |
| `timeLabel.formats.{standard,simple}` | | `{ fontSize, color }` |
| `timeLabel.formats.sized` | | `{ hourFontSize, hourColor, minuteFontSize, minuteColor }` (預設 25 / 15) |
| `timeLabel.zeroPad` | false | 小時是否補 0 (8:00 / 08:00) |
| `timeLabel.gap` | 10 | 時間文字頂端與圖表下緣的距離 |
| `timeLabel.overDay` | `"plain"` | 24 時以後的時間文字：`plain` (01:00) / `superscript` (01:00 ⁺¹，僅有小時的文字加上標，僅 mm 不加) / `extended` (25:00) |
| `timeLabel.secondaryLabel` | `"none"` | 次要時間線標記 `none` / `hhmm` / `mm`，只在 `interval >= 10` 時有效 (`simple` 格式一律只標 mm) |
| `footer.enabled` | false | 基本資料 footer (`makeFooter()`，`Graphing.js`)：一行文字，水平置中於頁面 (印刷模式為不含出血的頁面，否則為整張圖)，最後畫 (圖層 `layer-footer`) |
| `footer.text` | `"<title> \| <opmode> \| <sta_range> \| <time_range>"` | 內容，代碼由 `footerText(page)` 換成文字：`<title>` = `INFO.title`、`<sta_range>` = `起站 = 迄站` (`stationRange()`)、`<opmode>` = `opmodeName()`、`<time_range>` = `hhmm ~ hhmm` (`secToHhmm()`，印刷時為該頁的範圍，不含重疊)、`<index>` = 該運行型態的第幾頁、`<pages>` = 頁碼 (`startPage` 起，所有運行型態連續編號)。不是印刷模式時 `<index>` = 1、`<pages>` = `startPage`。其他文字 (含不認得的代碼) 照原樣 |
| `footer.fontSize` / `footer.color` | 16 / `"#000000"` | 字型大小 (px)、顏色 |
| `footer.base` / `footer.gap` | `"page"` / 20 | `gap` (px) 的基準：`"page"` = 基線在頁面下緣往上 `gap`；`"plot"` = 文字頂端在圖表下方的文字 (`textExtent().bottom`，時間文字等) 往下 `gap` |
| `footer.startPage` | 1 | 第一張圖的 `<pages>` |
| `stationRange` | `{ start: 0, end: null }` | 繪圖的區間範圍：畫出的第一站、最後一站的車站 index (`end` null = 最後一站)；`stationRange()` 會在不合法 (start ≥ end、超出車站數) 時改用全線。列車資料不受影響，超出的部分被裁切，也不放列車號 |
| `print.enabled` | false | 印刷模式 (`PrintLayout.js`)：啟用後設定頁以像素為單位的欄位 (`data-unit="px"`) 改以 mm 輸入與顯示，1 px = 25.4/ppi mm；資料仍以 px 存放 |
| `print.ppi` | 300 | 解析度 |
| `print.page` | `{ width: 210, height: 297 }` | 頁面大小 (mm)，不含出血 |
| `print.bleed` | `{ top, bottom, left, right }` 各 3 | 出血 (mm)，加在頁面之外；超出出血的圖面算超出 |
| `print.pageMinutes` | 60 | 每頁時間 (分鐘)：30、60、120、180、240；時間範圍依此切成多頁 |
| `print.overlap` | false | 每頁前後各多畫 10 分鐘 (`PRINT_OVERLAP_MIN`)，頁與頁重疊；第一頁從範圍開始前 10 分鐘畫起 (前一天的時刻標 `-1`) |
| `print.opmodes` | `"all"` | 列印 (「頁面預設」旁)：`"current"` = 只輸出目前的運行型態；`"all"` = 有多個運行型態 (5.7) 時輸出每一個，各放在 zip 中的一個資料夾 (`01_週一/`，名稱為 `opmodeName()`，`\/:*?"<>|` 換成 `_`)。每頁以 `drawDiagram(trains, svg, page)` 繪製，`page` 帶 footer 用的運行型態、頁序、頁碼、時間範圍與頁面 (不含出血) |
| `print.format` | `"pdf"` | 輸出格式：`"svg"` = 直接 SVG (文字不轉外框)、`"pdf"` = 向量文字 PDF、`"svgPath"` = 向量文字 SVG；向量文字指文字轉成外框 (`fonts/` 的 Noto Sans TC，缺字改用 Noto Sans JP) |
| `print.align.v` / `print.align.h` | `{ side: "top", base: "frame", offset: 20 }` / `{ side: "left", base: "text", offset: 10 }` | 圖面對齊。`side`：固定哪一側的 padding (`"top"` \| `"bottom"`、`"left"` \| `"right"`)；`base`：`offset` (mm) 算到圖框 (`"frame"`) 或含文字 (`"text"`)。另一側的 padding 由頁面大小與圖框大小算出 |
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
| `passingTime.interpolationSpeedRatio` | 1.2 | 跨線列車分岐站停靠點 (5.4) 可移動的範圍：前後兩段的平均速度比不超過此值 (≥ 1) |
| `passingTime.interpolationMaxError` | `null` | 秒 (≥ 0)；不是 `null` 時取代上一項，範圍為內插值 ± 此值。輸入框有 `data-nullable`：留白 = `null`。`mergeSettings()` 中預設為 `null` 的欄位接受數字 |
| `passingTime.stopRules` | `[]` | 臨時停車規則 (見 7.4)：`{ bound: 0 (順逆行) \| 1 \| 2, number, color, name (null = 不限；number、name 為萬用字元), stations: "all" \| "cross" \| "overtake" \| "station", station: 站名 (stations == "station" 時，否則 null) }` |
| `trainColors` | | 長度 11 的陣列，index = 列車的 `train_color` (0 與 1 同色)。UI 為 `.train-color-input`，改變時同時更新 CSS 變數 `--color{n}` |

- `gap` 都是文字與圖表外框之間的距離。
- **文字超出檢查** `checkTextFit()`：在設定變更及輸出圖片時執行，超出則顯示黃色 toast (`#TextOverflowWarning`)。次要車站改用 `secondaryStationText` / `secondaryAliasText` 計算 (`stationTextStyles(i)`)。
  - 任一站的站名字數 × `stationText.fontSize` + `gap` > `margin.left`
  - (顯示別名時) 任一站的別名字數 × `aliasText.fontSize` + `gap` > `margin.right`
  - 時間文字高度 (最大字型大小) + `timeLabel.gap` > `margin.bottom`
  - (footer 以圖表為基準時) 圖表下方的文字 + `footer.gap` + `footer.fontSize` > `margin.bottom`。印刷模式的版面 (`printLayout()`) 也把它算進下方的文字範圍
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
- **SVG 結構** (`drawDiagram()` / `drawTrain()`)：
  - 列車線的 x 座標是「展開」的：比前一點早的時刻視為隔天 (+1440 分)，所以一班車的所有點連續。整條線再平移 ±1 天各畫一次 (只畫有落在圖表範圍內的)。`connectTrainLines` 時每個平移各一條 `<polyline>` (去掉重複點)，否則為 `<g>` 包各段 `<line>`。列車號避讓用的線段 (`addSegment`) 兩者相同。
  - 分圖層時 (`layers.enabled`)，由下到上為 `LAYERS`：背景 (`layer-background`，透明時省略)、時間線 (`layer-time-lines`，含分鐘時間線)、車站線、列車線、列車號文字 (不顯示列車號時省略)、圖框、文字-車站、文字-時間、文字-基本資料 (`layer-footer`，不顯示 footer 時省略)。圖層是 `<g id data-name inkscape:groupmode="layer" inkscape:label>` (`makeLayer()`)；Illustrator 以最上層的 `<g>` 為圖層、`data-name` 為名稱。列車線與列車號圖層各自帶 `clip-path`。列車線子圖層的 id 為父圖層 id 加 `-{bound}` / `-color-{n}`，依方向、顏色排序後建立，所以列車的繪製順序會依子圖層分組。不分圖層時結構與舊版相同 (列車線與列車號共用一個 clip `<g>`)。
  - id：時間線 `timeline-{hhmm}` (`timeId()`；負的時刻為 `prev-{hhmm}`)、分鐘時間線 `minuteline-{hhmm}`、車站線 `stationline-{路線 index}`、列車線 `train-{bound}-{index}` (`trainId()`，跨日副本加 `-prev-day` / `-next-day`)。另有 class 與 `data-sec`、`data-station`、`data-kilo`、`data-train`、`data-bound`、`data-train-number`；列車號 `<text class="train-number" data-train>`。完整表格見說明書「設定 JSON」。
  - PDF 輸出 (`pdfSvgOps()`) 支援沒有 clip-path 的 `<g>`、`<polyline>` (miter limit 4，同 SVG) 與 `<circle>` (停車駅明示，填色與外框)。
- **OuDia 樣式下的列車號**：第一個列車號不受 `pxPerTrainNumber` 限制，放在第一個合格的區間，從區間的起點往後找位置 (`findTrainNumberPosition(..., fromStart)`)；該區間放不下時試下一個區間。之後同一般規則。

## 3. 時刻格式

- 內部、JSON、CSV 一律為字串 `"hhmm"` 或 `"hhmmss"` (長度 4 或 6)。
- 輸入時由 `normalizeTime()` (`program/util/stc.js`) 統一：
  - 1~4 位數補到 4 位，5 位數補到 6 位 (`"935"` → `"0935"`, `"93500"` → `"093500"`)。
  - 非數字、分/秒 ≥ 60、超過 `2400` 視為不合法：表格中以紅底標示且**不寫入資料**；匯入時該格視為空白。
- 空字串 `""` 代表沒有該時刻。
- 時刻表不支援 24 時以後，跨夜直接寫時刻 (例：`2400` → `0001`)；繪圖範圍可到 3000，見 `startSec` / `endSec`。

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
	},
	topology: {
		secondary: [false, false, true, ...],      // length = stations.length
		branches: [[], [], [ { stations: [{ name: "千早", kilo: 1.2 }, ...] } ], ...]   // length = stations.length
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
| `topology.secondary[i]` | boolean | 第 i 站是否為次要車站 (見 4.4)。起終點永遠是 `false` |
| `topology.branches[i]` | array | 從第 i 站分岐的路線，最多 `MAX_BRANCHES` (3) 條，順序即線路拓樸圖由左到右 |
| `topology.branches[i][b].stations[]` | `{ name, kilo }` | 分岐上的車站。`kilo` = 與分岐站 (第 i 站) 的距離 (> 0)，`null` = 未填；依 `kilo` 由近到遠排序，`null` 在最後 |

`stations` 的順序即「順行」(bound 1) 的順序。

### 4.1 路線 JSON

與 `ROUTE` **完全相同**：`JSON.stringify(ROUTE)`。匯入時 `stopsec`、`alias`、`track_layout`、`topology` 可省略。
`track_layout` 由 `loadTrackLayout()` 讀取：缺少的欄位、長度不足的部分、不認得的值都當作 `DEFAULT_TRACK` (`"quadruple"`)，最高速度不是正數時當作 `null`；超出站數的部分忽略。
`topology` 由 `loadTopology()` 讀取：缺少的部分當作非次要車站、沒有分岐；起終點的 `secondary` 一律為 `false`；`kilo` 不是正數時當作 `null`，`name` 轉成字串；沒有車站的分岐移除，每站超過 3 條的分岐忽略；分岐上的車站重新排序。

### 4.2 路線 CSV

每站一列，無標題列：

```
站名,里程[,停站秒數][,別名]
```

- 匯出固定 4 欄；匯入接受 2~4 欄 (舊的 `站名,里程` 檔案可直接使用)。
- 第一站的里程一律當作 0。
- 匯入完成後自動執行「生成」(里程檢查 + 渲染時刻表)。
- CSV 不含軌道配置與線路拓樸：匯入時 `track_layout`、`topology` 重設為預設值 (`newTrackLayout()` / `newTopology()`)；`route_name` 則保留目前的。

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

### 4.4 線路拓樸 `topology`

整理從各站分岐出去的路線 (分岐點不一定是停靠站，例如信號場)，以及次要車站。分岐不會畫在運行圖上，只用來推算跨線列車通過分岐站的時刻 (見 5.4)。程式在 `program/ui/topologyInput.js` (表格)、`program/handler/TopologyHandler.js` (`loadTopology()`)。

- **次要車站** (`secondary[i]`)：繪圖時比照次要時間線，車站線用 `lines.secondaryStation`，站名 / 別名用 `secondaryStationText` / `secondaryAliasText` (`stationTextStyles(i)`，`Graphing.js`)。起終點不可勾選 (外框會蓋過車站線)；`deleteStation()` 刪掉最後一站時，新的最後一站設為 `false`。
- **分岐** (`branches[i]`)：新增時就有一個車站 (`newBranchStation()`，站名空白、`kilo` = `null`)；新增的車站放在最遠端；刪掉分岐的最後一個車站時整條分岐移除。`kilo` 輸入 0、負數、非數字 → 紅底、不寫入；改 `kilo` 後重新排序 (`sortBranchStations()`)，順序有變才重新渲染 (否則保留焦點)。
- 主線車站不能在此刪除 (要回到路線資料表格)。主線車站改名、改里程、增刪時重新渲染 (`renderRouteTable()` 會呼叫 `renderTopologyTable()`)。
- 不能在分岐上再分岐：運行圖不畫分岐，分岐上的分岐等同於另一條從同一站分岐的路線。

#### 線路拓樸圖

`renderTopologyTable()` 由上而下每列 50px，左欄是 `icon/path/` 的 40×50 圖片橫向排列 (第 1 欄主線、第 b+2 欄第 b 條分岐)，不畫列與列之間的橫線。圖名以 `.T` 結尾者為上下翻轉 (`.flip`)，沒有獨立的檔案。

- 主線車站：`start` / `end` / `station` / `signal` (次要車站)，有分岐時加上 `_with_branch`。其右依序為各分岐的 `branch.branch` (最後一條為 `branch.corner`)，未滿 3 條時最右側是 `add_branch` (點擊新增分岐)。
- 分岐畫在分岐站的上方 (最後一站則在下方，整組上下顛倒，`branch.start` / `branch.corner` / `branch.branch` 改用 `.T`)。每條分岐由遠到近為：`branch.add_station` (點擊在末端新增車站)、`branch.start` (最遠的站)、`branch.station`…；左側較早的分岐在這些列顯示 `branch.pass`，主線欄顯示 `pass` (起終點為 `blank_placeholder`)。
- 右欄：主線車站顯示站名、里程與「次要車站」勾選框；分岐車站為站名輸入框、「XX站起 [ ] 公里」與刪除鈕；`branch.add_station` 的列空白。

## 5. 列車資料 `TRAINS`

```js
TRAINS = {                      // the current operation mode's (5.7)
	1: [ train, train, ... ],   // 順行
	2: [ train, train, ... ]    // 逆行
}

train = {
	train_number: "2721C",
	settings: {
		train_name: "普通",
		train_color: 1,         // 0~10, index of SETTINGS.trainColors
		line_width: null,       // px, null = follow SETTINGS (optional)
		line_type: null         // "solid" | "dashed" | "dotted", null = follow SETTINGS (optional)
	},
	origin: { station_name: "", departure: "" },   // a branch station it comes from (5.4), "" = none
	terminal: { station_name: "", arrival: "" },   // a branch station it goes to
	hidden: true,               // optional: not running (5.6)
	timetable: [                // only stations the train stops at / passes, sorted by station_order
		{ station_order: 0, station_name: "西戸崎", arrival: "0528", departure: "0529" },
		{ station_order: 1, station_name: "海ノ中道", arrival: "053215", departure: "053215", pinned: true },   // pinned: optional
		...
	]
}
```

| 欄位 | 說明 |
|---|---|
| `station_order` | 該方向車站列表中的 index。bound 1 = `ROUTE.stations` 的 index；bound 2 = 反轉後的 index (`stationCount - 1 - routeIndex`)。用 `boundStations(bound)` 取得該方向的車站列表 |
| `station_name` | 冗餘欄位，方便閱讀 JSON。由 `refreshStopNames()` 依路線自動更新 (車站改名/增刪/匯入時) |
| `arrival` / `departure` | 見第 3 節。兩者皆空的停靠站會被移除；只有發車時刻的停靠站，到站時刻保持空白 (代表不知道)，畫圖、計算時才以 `arrivalTime()` 算出 (= 發車 − 該站 `stopsec`)，不寫回資料 |
| `origin` / `terminal` | 跨線列車 (5.4)：分岐上的站名 (`ROUTE.topology.branches` 的車站) 與發車 / 到達時刻，`""` = 無。匯入時缺少則為空白，時刻經 `normalizeTime()`，不合法則為空白 |
| `hidden` | 選填，`true` = 隱藏 (5.6)。只有 `true` 時才存在；JSON 匯入匯出保留，CSV 不保存 |
| `pinned` | 停靠站的選填欄位，`true` = 釘選 (疊圖 5.5 疊加的時刻)：還原通過時間 (7.3) 不移動、不改寫。只有 `true` 時才存在 (`addStop(..., pinned)`)；JSON 匯入匯出保留，CSV 不保存。車次細項的「解除釘選」(`unpinTrain()`) 刪除整班車的此欄。時刻表中以 `.pinned-time-input` (底線) 標示 |

繪圖只使用有 `departure` 的停靠站 (加上 5.4 的分岐站停靠點)，並略過隱藏的列車 (5.6)。

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

- `timetable` 陣列與內部 `TRAINS[bound]` 結構、欄位名稱完全相同。匯出、匯入的都是目前的運行型態 (5.7)。
- 外層的 `route_name`, `bound`, `station_count`, `train_count` 只在匯出時由 `ROUTE` / `TRAINS` 產生，**匯入時忽略** (方向由按下的匯入按鈕決定)。
- 若有 `station_record`，匯入時會與目前該方向的車站名稱比對 (`loadTrainFromJSON(text, bound, stations)`；全部資料 JSON 則與同檔案中的路線比對) (最長共同子序列)：站名相符的照常匯入，檔案多出的站其時刻略過，路線多出的站留白；`station_order` 是 `station_record` 的 index。站序對調不處理 (只會保留其中一邊)。沒有 `station_record` 時，`station_order` 直接當作該方向的 index。
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
| N+3 ~ N+6 (可省略) | `origin.station_name`、`origin.departure`、`terminal.station_name`、`terminal.arrival` |

匯出一律輸出 N+3 ~ N+6 列 (空白也輸出)。

到發時刻 (`匯出CSV` / `匯入` 於「到發時刻」列)：每班車兩欄 `[到站, 發車]`；車次、列車名、顏色、始發與終點的列寫在第一欄，第二欄留空：

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

### 5.4 跨線列車 (`program/program/BranchTrain.js`)

從分岐駛入 (`origin`) 或駛出 (`terminal`) 的列車，在分岐站 J 有一個**分岐站停靠點**：以距離內插的通過時刻 (到 = 發)，**不存進 `timetable`**，需要時由 `junctionStops(train, bound)` 計算 (同空白的到站時刻)。

- 車次細項 (`optionsIO.js`) 的選單：`branchChoices(train, bound, end)` = 分岐站在該車第一個有發車時刻的停靠站「以前或同站」(終點：最後一個「以後或同站」) 的分岐車站 (依站名去重)。已選的站不再符合時仍保留，標示「(不適用)」，不推算。時刻輸入經 `normalizeTime()`，不合法 → 紅底、不寫入。
- 只有 J 在第一個停靠站之前 (終點：最後一個之後) 才產生停靠點；J 本身就是停靠站時時刻已知。站名重複時取第一個符合的分岐車站。缺少時刻、分岐車站或里程時不產生。
- 內插：始發站 O 的發車 a、第一個停靠站 S 的到站 c (`arrivalTime()`，跨夜時 O 往前推一天)，`d1` = O 到 J 的分岐里程、`d2` = |J − S| 的路線里程：`t = a + (c − a)·d1/(d1 + d2)`。終點同理 (最後一站的發車 → 終點站的到達)。
- 可移動範圍 `[min, max]` (`junctionRange()`)：前後兩段平均速度比不超過 `interpolationSpeedRatio` (r)：`[a + T·d1/(d1 + r·d2), a + T·r·d1/(r·d1 + d2)]`，`T = c − a`；`interpolationMaxError` 不是 `null` 時改為 `t ± error` (限在 a ~ c 之間)。
- **在路線上沒有停靠站的列車** (`timetable` 為空或沒有發車時刻，`passingJunctions()`)：`origin` 與 `terminal` 都有效、且始發的分岐站在終點的分岐站之前 (該方向的 `station_order`) 時，兩個分岐站都產生停靠點：始發站發車 a、終點站到達 c (跨夜時 c 加一天)，總距離 `d = origin 分岐里程 + 兩分岐站間的路線里程 + terminal 分岐里程`，各點 `t = a + (c − a)·d1/d`，範圍以 `junctionRange(a, c, d1, d − d1)` 計算。時刻以始發的發車為基準 (跨夜同上)。
- `isBlankTrain()`：無車次、無停靠站、無 `origin` / `terminal` 才算空白列車 (附加匯入時移除)。
- 繪圖：`trainStops(train, bound)` = 停靠點 + `timetable`，`drawTrain()` 用它畫線 (時刻取到秒，不對齊 `timeGranularity`)。
- 還原通過時間 (7.3)：停靠點是列車的第一 (最後) 站，記在模型的 `t.junctions` (`{ k, time, min, max }`)。

### 5.5 疊圖 (`program/program/Overlay.js`, `program/handler/OverlayHandler.js`)

匯入/匯出頁的「疊圖」：把本路線一段的列車匯出，疊加到共用這段的另一條路線 (例：縱貫線算好通過時刻後，新竹–北新竹疊到內灣線)。

**匯出** (`getOverlayJSON(from, to)`，`from` < `to` 為 `ROUTE.stations` 的 index；UI 選單 `#OverlayFrom` / `#OverlayTo` 由 `renderOverlayStations()` 在 `onRouteChanged()` 與載入時產生，選反時對調)：

```js
{
	type: "rtd-overlay", version: 1,
	route_name: ROUTE.route_name,
	stations: [{ name, kilo }, ...],          // ROUTE.stations[from..to]
	train_count: n,
	trains: [{
		train_number, settings,               // as in TRAINS
		direction: 1 | 2,                     // 1 = along `stations`, 2 = against (= the bound it had)
		stops: [{ station_name, arrival, departure, passing }, ...]   // in its direction of travel, >= 2
	}]
}
```

- `trainTimesAt(train, bound)`：列車從第一個到最後一個繪圖點 (含 5.4 的分岐站停靠點) 之間每一站的時刻 (秒，跨夜展開同 `stopTimes()`)，停靠點之間依里程直線內插，與 `drawTrain()` 畫的線相同。
- 時刻表上的停靠站保留原字串 (空白的到站仍空白)；其他站 `arrival = departure` = 線上的時刻，取到秒 (`overlayTime()`)，不對齊 `timeGranularity`。`passing` 只供參考。區段內不到兩站的列車不匯出。

**疊加** (`applyOverlay(data, conflict)`，`conflict` = `"overlay"` 以疊圖為準 / `"keep"` 保留現有時刻，`#OverlayConflict`)：

1. 車站以站名對應 (`ROUTE.stations` 中第一個同名的站)；對應到的站少於兩個，或順序不是單調遞增 / 遞減時拋出錯誤 (UI 顯示於 `#OverlayResult`)。
2. 每班車的方向 = 對應到的站在本路線的順序 (只對應到一站時用 `direction` 與區段的方向)。
3. 找同一班車 (`findOverlayTrain()`)：同方向、同車次 (有多班時取同站同時刻的、否則第一個時刻最接近的)；沒有車次時取同站同時刻的無車次列車。找到 → 合併；找不到且對應到兩站以上 → 新增在該方向最後；否則略過。
4. 合併 / 新增的時刻都設 `pinned: true`。`"overlay"`：已有的停靠站換成疊圖的時刻 (疊圖空白的欄位保留原值)；`"keep"`：已有的停靠站不動。
5. 疊圖中位在對應區段前 (後) 的車站若是本路線分岐上的車站，且列車沒有 `origin` (`terminal`)，填入該站與其發車 (到達) 時刻。
6. 回傳 `{ merged, added, skipped, stations: [本路線沒有的站名] }`。同一檔案再疊加一次不會改變資料。

### 5.6 隱藏的列車 (`hidden`)

代表這班車暫時不行駛：

- 車次細項 (`optionsIO.js`) 車次右側的眼睛 (`#offcanvas-train-visible`，`icon/eye.svg` / `icon/eye-slash.svg`) 切換。時刻表中整班車灰底 (`.hidden-train`)，色條變灰 (不改 `train_color`)。
- 時刻表上方的「不顯示隱藏的列車」(`.hide-hidden-trains`，兩個方向共用，不存進設定)：開啟時隱藏的列車不放進表格 (`trainInTable()`)，方向鍵跳過它們；`data-train` 仍是 `TRAINS` 的 index。
- 略過隱藏列車的：繪圖 (`drawDiagram()`，含印刷；`train-{bound}-{index}` 的 index 不變)、還原通過時間的模型 (`createPassingModel()`，不改寫它們)、疊圖匯出、OuDia 匯出。自動補全、臨時停車規則、JSON / CSV 匯出照常包含。

### 5.7 運行型態 (`OPMODES`)

一份檔案 (一次改點) 可以有多個運行型態 (OuDia 的ダイヤ)，例如平日、假日，各有自己的列車；路線與設定共用。

```js
OPMODES = [
	{ title: "", description: "", days: ["tue", "wed", "thu"], trains: { 1: [...], 2: [...] } },
	...
]
currentOpmode = 1               // OPMODES[currentOpmode].trains === TRAINS
```

| 欄位 | 說明 |
|---|---|
| `title` | 標題，`""` = 以 `days` 命名 |
| `description` | 描述 (備註) |
| `days` | 運行日的 token，依 `OPMODE_DAYS` 的順序：`mon` ~ `sun`、`hol` (假日)。只用來命名，存 token 而不存文字，換 UI 語言時名稱跟著換 |
| `trains` | 同 `TRAINS`。目前的運行型態就是 `TRAINS` 這個物件本身 |

- 列車物件**不在運行型態之間共用** (複製、匯入都會 `structuredClone`)：每個運行型態的待避時間計算結果可以不同，改一個運行型態不影響其他的。
- 所有讀寫 `TRAINS` 的功能 (表格、繪圖、匯入匯出單一方向、待避時間計算、疊圖) 只處理目前的運行型態，所以還原通過時間不會看到其他運行型態的列車。副本的指紋含 `TRAINS`，切換運行型態後副本失效 (不顯示採用 / 捨棄，`updateDraftUI()`)，切回來又有效。
- 車站增刪與改名 (`shiftStops()`、`deleteStation()`、`refreshStopNames()`) 改所有運行型態的列車 (`allTrains(bound)`)。
- 操作 (`DataStore.js`)：`selectOpmode(i)` (把 `TRAINS` 換成第 i 個)、`setOpmodes(modes)` (全部取代，第一個成為目前的)、`addOpmode(copy)` (空白 = 每方向一班空白列車，或複製目前的，加在最後)、`deleteOpmode(i)`。匯入一律經過 `applyOpmodes(modes)` (`TimetableHandler.js`，同時更新表格與選單)。
- 名稱 `opmodeName(mode, i)` (`opmodeInput.js`) = `title`，或 `opmodeDaysName(days)`：七天 `每日`、一~五 `平日`、六日 + 假日 `假日`，其餘連續三天以上寫成 `週二至四`、否則 `週一、三`，有假日時加上 `、假日`；都沒有時為 `運行型態 n`。
- 同一班車：`trainKey(train)` 相同 (`hidden` 以外的欄位全部相同)。

UI (`program/ui/opmodeInput.js`)：

- 時刻表兩頁、輸出圖片頁上方與「還原通過時間」下方的「運行型態」選單 (`.opmode-select`，`renderOpmodeSelects()`) 切換目前的運行型態 (`switchOpmode(i)`)；輸出圖片頁已有圖時重畫。
- 「編輯」(以及匯入/匯出頁的「編輯運行型態」) 打開 `#OpmodeModal`：每個運行型態一列，可選為目前的、改標題 (留白時 placeholder 顯示依運行日的名稱)、運行日 (一 ~ 日、假日)、描述，顯示兩方向的列車數；刪除要按兩次 (只剩一個時不能刪)。下方「新增空白運行型態」「複製目前的運行型態」，新增後切換過去。
- 基本設定 > 基本資料有同樣的表格 (沒有選為目前的圓圈)。兩個表格都是 `.opmode-table` (`renderOpmodeTable(skip)`)，改標題、描述時不重畫輸入框所在的表格 (保留焦點)；進入基本設定頁時重畫。
- 車次細項的「運行型態」(`#offcanvas-opmodes`，只有一個運行型態時隱藏)：每個運行型態一個勾選框，有同一班車時勾選 (目前的運行型態固定勾選、不可改；那班車隱藏時標示「(隱藏)」，沒有同一班車、但有同車次的列車時標示「(另有同車次、時刻不同的列車)」)。勾選 = 複製這班車到該運行型態 (`copyTrainToOpmode()`：放在「這班車之前、最近一班該運行型態也有的車」之後，沒有則放在最前面；不帶 `hidden`)；取消 = 刪除該運行型態中所有同一班車 (`removeTrainFromOpmode()`；該方向沒有列車時留一班空白列車)。
- 匯入單一方向的列車 (CSV / JSON) 匯入到目前的運行型態。

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
    "info": { "title": "", "description": "", "effective_date": "" },
    "route": { ...路線 JSON (4.1)... },
    "trains": {
        "1": { ...列車 JSON (5.1)，順行... },
        "2": { ...列車 JSON (5.1)，逆行... }
    },
    "settings": { ...設定 JSON (6.1)... }
}
```

有多個運行型態，或唯一的運行型態有標題、描述或運行日時，加上 `opmodes`，`trains` 則是所有運行型態中**不重複**的列車 (完全相同的列車只存一次，依第一次出現的順序)：

```json
{
    "info": { ... },
    "route": { ... },
    "trains": { "1": { ...列車 JSON，timetable = 不重複的列車... }, "2": { ... } },
    "opmodes": [
        { "title": "週一", "description": "", "days": ["mon"], "trains": { "1": [0, 1, 2, ...], "2": [0, 1, ...] } },
        ...
    ],
    "settings": { ... }
}
```

- `info` = 整份檔案的基本資料 `INFO` (`DataStore.js`)，一律放在最前面：`title` 標題、`description` 描述、`effective_date` 時刻表啟用日。都是字串，不檢查格式；啟用日在 UI (基本設定 > 基本資料，`renderInfo()`) 是三個輸入框 (yyyy / mm / dd，斜線在框外)，存成 `"2025/03/15"`，全部空白時為 `""`，輸入的斜線會被去掉。匯入時缺少 `info` (或其中的欄位) 則為空白。
- `opmodes[].trains[bound]` = 該運行型態的列車在 `trains[bound].timetable` 中的 index，依該運行型態的順序。同一個 index 可以出現在多個運行型態 (宜蘭線週一 ~ 週日 5 個運行型態：1040 班 → 不重複 228 班，檔案約 1/4)。
- 匯出 (`getAllDataJSON(all)`)：「運行型態」選單 (`#ExportAllOpmodes`) 選擇所有運行型態，或只有目前的 (`all = false`)。只有一個運行型態且沒有標題、描述、運行日時，除了 `info` 之外與舊格式相同 (不去除重複的列車)。
- 匯入 (`loadAllFromJSON(text, only)`)：選擇檔案後 (`#AllFile` 的 `change`) 若有 `opmodes`，顯示 `#AllOpmode` 選單：「全部 (n 個運行型態)」或其中一個 (`only` = index，名稱後附描述)。`loadOpmodes()` 依 index 複製列車 (不合法的 index 略過；`days` 只保留認得的 token)，取代所有運行型態。沒有 `opmodes` 但有 `trains` 時，取代成一個運行型態 (缺少的方向保留目前運行型態的列車)；兩者都沒有時運行型態不變。舊版程式讀取新格式時只會讀到 `trains` (所有不重複的列車)。
- 每一部分的格式與單獨匯出時相同，匯入 (`loadAllFromJSON()`) 時拆開後交給 `loadSettingsFromJSON()` / `loadRouteFromJSON()` / `loadTrainFromJSON()` (`station_record` 與檔案中的路線比對；沒有 `route` 時與目前的路線比對)。
- 順序：設定 → 路線 → 列車 (路線缺少 `stopsec` 時使用匯入後的 `defaultStopSec`)。
- 缺少 `settings` → 全部使用預設；缺少 `route` 或某個方向的 `trains` → 保留目前資料。
- 列車一律取代 (不看「匯入列車資料時」選單)。
- 任何部分解析失敗則不套用任何變更 (設定會還原)。

### 6.3 OuDia 檔案 (`program/handler/OudHandler.js`)

匯入：`#OudFile` → `#OudDia` 選ダイヤ (有多份時第一個選項為「全部」) → `#ImportOudBtn`，每份ダイヤ成為一個運行型態 (標題 = `DiaName`)。匯出：`.export-oud-btn[data-format=oud|oud2]` (`oudText()`，見下)，每個運行型態成為一份ダイヤ。

格式：一行一個 `key=value`，`Name.` 開始一個節點、單獨的 `.` 結束。`Rosen.` 內有 `Eki.` (車站，順序 = 下り)、`Ressyasyubetsu.` (種別，依序為 index)、`Dia.` (每份ダイヤ，內有 `Kudari.` / `Nobori.` 的 `Ressya.`)。列車的 `EkiJikoku=` 以逗號分隔、依該方向的站序 (同 `station_order`)，每格為空白 (運行なし) 或 `駅扱[;時刻][$番線]`，駅扱 1 = 停車、2 = 通過、3 = 經由なし，時刻為 `發`、`着/`、`着/發` (`hmm` ~ `hhmmss`)。顏色 `00BBGGRR`。

| OuDia | 轉換為 |
|---|---|
| `Ekimei` / `Ekikibo_Ippan` | `name` / `topology.secondary` (起終點除外) |
| 站距 | 每個站間取兩方向中較大的「最短運轉時間」(優先用兩站都停車的列車，其次任何有時刻的列車，再其次 `DiagramDgrYZahyouKyoriDefault`，預設 60 秒；`NextEkiDistance` > 0 時用它)，1 分 = 1 km 累加為 `kilo` (取到 0.01) |
| `Kudari` / `Nobori` | bound 1 / 2 |
| 停車 | `arrival` / `departure`；只有著 → `departure = arrival`；只有發 → `arrival` 空白。每段的第一、最後一站空白的 `arrival` = `departure` |
| 通過、有時刻 | `arrival = departure` (通過時刻)；沒有時刻的通過不加入 |
| 第一站之後的運行なし / 經由なし | 列車拆成兩班 (同車次) |
| `Ressyabangou` / `Ressyamei` + `Gousuu` | `train_number` / `train_name` = `列車名 號數号`，沒有列車名時為種別名 |
| 種別 | 有用到的種別依 (`DiagramSenColor`, `DiagramSenStyle`, `DiagramSenIsBold`) 分組，依 index 順序配到 `train_color` 1~10；線型 實線 / 破線 / 點線 / 一點鎖線 → `solid` / `dashed` / `dotted` / `dashed`，粗線 → 線寬 `trainLineWidth × 2`；超過 10 組時配到 RGB 距離最近的組 |
| `DispProp` 的第一個 `DiaBackColor`、`DiaJikuColor`；`KitenJikoku` | 見下 |

番線、駅作業、運用、路線外發着、分岐駅設定、コメント 等不匯入。OuDia 的功能比較見 `design_doc/OUDIA.md` (本機文件)。

- 讀檔：`decodeOud()` 先試 UTF-8 (`.oud2`)，失敗則 Shift_JIS (`.oud`)；`parseOud()` 轉成 `{ name, values: { key: [值...] }, children }` 的樹。選檔時解析並列出ダイヤ，沒有車站 (少於 2 站) 或ダイヤ時顯示紅色 toast。
- `convertOud(root, diaIndices)` (一個 index 或陣列) → `{ route, opmodes, colors, background, axis, startSec, merged, split }`，種別的顏色分組與站距 (`oudSectionSeconds()`) 以所有選擇的ダイヤ一起計算；`applyOud()` 套用：路線 (`applyRoute()`)、運行型態一律取代 (`applyOpmodes()`)、`trainColors` / `trainLineTypeByColor` / `trainLineWidthByColor` 的 1~10 (先清空樣式，`trainColors[0]` = `[1]`)、`background.color`、`oudiaStyle.axisColor`、`startSec` = 起點時刻、`endSec` = 起點 + 24 時 (最多 `MAX_END_SEC`)。
- `kilo` 是推算的 (`oudSectionSeconds()`，1 分 = 1 km)、`stopsec` = `defaultStopSec`；匯入後一律顯示黃色 toast `#ImportOudWarning` 說明，並列出種別合併到同一顏色槽、列車被拆開的次數。
- 匯出 (`oudText(second)`)：每個運行型態一份ダイヤ (`DiaName` = 標題，或依運行日的名稱，都沒有時為 `ダイヤ`)；種別與「有停車時間的站」以所有運行型態的列車計算，隱藏的列車不匯出。`.oud` 為 `FileType=OuDia.1.02`、Shift_JIS (`encodeShiftJIS()`，表由瀏覽器的解碼器反推；無法表示的字改為 `?` 並顯示黃色 toast `#ExportOudWarning`)；`.oud2` 為 `OuDiaSecond.1.17`、UTF-8 含 BOM，並寫出每站的 `NextEkiDistance` = 站間 km × 60 (秒)，再匯入時 `kilo` 不變。換行 CRLF。
    - 車站：`Ekikibo` 依 `topology.secondary`；有任何停車的到站時刻 (≠ 發車) 的站為 `Jikokukeisiki_Hatsuchaku`，否則 `Jikokukeisiki_Hatsu`。
    - 種別：每個用到的 `train_color` 一個 (依顏色編號排序)，`DiagramSenColor` 為該顏色、線型依 `trainLineTypeByColor`、線寬 ≥ `trainLineWidth × 2` 為粗線。該顏色的列車 `train_name` 全部相同時，以它為種別名、列車不寫 `Ressyamei`；否則種別名為「顏色n」(0 為「未指定」)，`train_name` 的「名稱 N号」拆成 `Ressyamei` / `Gousuu`。
    - `EkiJikoku`：每站一格，第一站之前、最後一站之後為空白；中間沒有停靠的站為 `2` (通過、無時刻)；`arrival = departure` 的中途站為 `2;發`；最後一站 `1;著/`；有停車時間 `1;著/發`；否則 `1;發`。時刻寫成 OuDia 的 `hmm[ss]` (小時不補 0、取 24 的餘數)。`line_width` / `line_type`、`pinned`、軌道配置、拓樸的分岐不匯出。
    - `KitenJikoku` = `startSec`；`DispProp` 的 `DiaBackColor` = `background.color`、`DiaJikuColor` = `oudiaStyle.axisColor`。

## 7. 待避時間計算 (基本設定 > 待避時間計算)

演算法的詳細說明見 [ALGORITHM.md](ALGORITHM.md) (自動補全、模型與衝突) 與 [ALGORITHM_STN_PROPOSAL.md](ALGORITHM_STN_PROPOSAL.md) 第 7 節 (還原通過時間)；使用者手冊為 `manual/src/manual-ops-passing-time.md`。

兩個推算、調整通過時刻的功能。結果都先寫在**副本**中，可預覽，按「採用」後才取代 `TRAINS`。

### 7.1 副本 `DRAFTS` (`program/data/Draft.js`)

```js
DRAFTS = { autofill: draft | null, passing: draft | null }
draft = { trains: { 1: [...], 2: [...] }, fingerprint: "..." }   // trains: structuredClone(TRAINS)
```

- `newDraft()` 複製 `TRAINS` (目前的運行型態)，並記下 `fingerprint` = `JSON.stringify([ROUTE, TRAINS])`。
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

**結果**：按鈕下方 (`#PassingTimeResult`) 只顯示最終衝突數；其餘 (寫入的數量、停機條件、實際最值、無法解決的原因) 由 `passingReport()` (`PassingReport.js`) 從最後的模型產生，存在 `PASSING_REPORT` (`passingTimeInput.js`)，計算完成後出現「詳細結果」(`#PassingTimeReportBtn`) 展開 `#PassingTimeReport`。求解器在模型的 `m.stats` 記錄每一段的停機條件、採用的最遠搜尋距離與差分約束的提案。
   4. 最後移除新通過時刻中，與前後時刻的直線相差 < `timeGranularity` 的 (移除後衝突、時隔不足變多則保留)，`writePassingTimes()` 寫進副本。

- **跨線列車的分岐站停靠點** (5.4)：模型中是固定的端點 (`fixed == 1`)，記在 `t.junctions`。差分約束中，範圍內有 `timeGranularity` 的倍數時是一個節點，E / L = 對齊後的 `[min, max]`；待避的列車 y 在此始發 (終到) 時，提案的範圍上限 (下限) 用 `max` (`min`)。不需移動時保持內插值 (不對齊 grid；從它往後推的時刻才對齊)；移動後對齊 grid，`writePassingTimes()` 才把它寫成分岐站的通過時刻 (計入 `added`)。貪婪解法不移動它。

- 最高速度：有設定的站間用 `minRunSec()`；沒有設定的，以時刻表中通過該站間的最快「停靠站到停靠站」平均速度 (不計 `arrival == departure` 的通過點，避免之前推算的時刻逐次放寬上限) × `estimatedSpeedLimitRatio` 估計。(差分約束) 時刻表本身比上限快的區段，上限等比例放寬。
- 通過時刻都對齊 `timeGranularity` 的倍數。
- **釘選的停靠站** (`pinned`，5.5)：建模時保持原時刻，不設 `vague` (精度不足)、`loose` (到站不準確)，也不是 `fixed == 2` (微調可移動)，所以 `writePassingTimes()` 不會改寫。
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
| `program/data/DataStore.js` | `INFO`, `ROUTE`, `TRAINS`, `OPMODES`, `currentOpmode`, `OPMODE_DAYS`, `newOpmode()`, `selectOpmode()`, `setOpmodes()`, `addOpmode()`, `deleteOpmode()`, `allTrains()`, `trainKey()`, `copyTrainToOpmode()`, `removeTrainFromOpmode()`, `DEFAULT_TRACK`, `MAX_BRANCHES`, `newStation()`, `newTrackLayout()`, `newTopology()`, `newBranchStation()`, `sortBranchStations()`, `newTrain()`, `boundStations()`, `findStop()`, `addStop()`, `setStopTime()`, `insertStation()`, `deleteStation()`, `refreshStopNames()`, `arrivalTime()`, `stopTimes()`, `isBlankTrain()` |
| `program/ui/addStationInput.js` | `renderRouteTable()` (同時呼叫 `renderTrackTable()`, `renderTopologyTable()`), `onRouteChanged()`, 路線表格事件 |
| `program/ui/trackLayoutInput.js` | `renderTrackTable()`, 軌道配置表格事件、快速套用按鈕 |
| `program/ui/topologyInput.js` | `renderTopologyTable()`, `topologyRows()`, 線路拓樸表格事件 (新增分岐 / 車站、刪除車站、次要車站) |
| `program/handler/TopologyHandler.js` | `loadTopology()` (路線 JSON 匯入時讀取 `topology`) |
| `program/program/TrackLayout.js` | `TRACK_TYPES`, `TRACK_TRANSITIONS`, `TRACK_PRESETS`, `parseTrack()`, `makeTrack()`, `trackTransition()`, `applyTrackPreset()`, `minRunSec()` |
| `program/handler/TrackLayoutHandler.js` | `loadTrackLayout()` (路線 JSON 匯入時讀取 `track_layout`) |
| `program/ui/createTimetable.js` | `renderTimetable(bound)`, `checkkilo()`, `generateTimetable()`, `hideHiddenTrains`, `trainInTable()` |
| `program/ui/addTrainInput.js` | 時刻表事件 (新增/刪除列車、車次、時刻輸入) |
| `program/ui/opmodeInput.js` | 運行型態的選單、`#OpmodeModal` 與基本資料的表格、車次細項的運行型態：`OPMODE_DAY_NAMES`, `opmodeDaysName()`, `opmodeName()`, `renderOpmodeSelects()`, `switchOpmode()`, `onOpmodeChanged()`, `renderOpmodeTable(skip)`, `renderTrainOpmodes()`；基本資料 `renderInfo()` |
| `program/ui/optionsIO.js` | 列車細項 (隱藏、列車名、顏色、始發、終點) offcanvas：`renderTrainVisible()`, `renderBranchEnd()` |
| `program/program/BranchTrain.js` | 跨線列車：`branchStations()`, `branchChoices()`, `junctionRange()`, `junctionStops()`, `passingJunctions()`, `trainStops()` |
| `program/program/Overlay.js` | 疊圖：`trainTimesAt()`, `overlayTime()`, `getOverlayJSON()`, `applyOverlay()`, `findOverlayTrain()`, `unpinTrain()` |
| `program/handler/OverlayHandler.js` | 疊圖 UI：`renderOverlayStations()`, 匯出 / 疊加按鈕, 車次細項的 `renderPinnedCount()` / 解除釘選 |
| `program/handler/RouteInfoHandler.js` | 路線匯入/匯出：`applyRoute()`, `getRouteDataCSV()`, `loadRouteFromCSV()`, `loadRouteFromJSON()` |
| `program/handler/TimetableHandler.js` | 列車匯入/匯出：`applyTrains()`, `applyOpmodes()`, `getTrainDataJSON(bound, trains)`, `loadTrainFromJSON()`, `matchStationRecord()`, `getTrainDataCSV()`, `loadTrainFromCSV()` |
| `program/handler/SettingHandler.js` | 設定匯入/匯出：`loadSettingsFromJSON()`, `mergeSettings()`, `applySettings()` |
| `program/handler/AllDataHandler.js` | 全部資料匯入/匯出：`getAllDataJSON(all)`, `loadAllFromJSON(text, only)`, `loadOpmodes()`, `loadOpmodeDays()` |
| `program/setting/OutputSetting.js` | `initSettingsUI()`, `updateSettingsUI()`, `renderTimeLabelPreview()`, `checkTextFit()` |
| `program/program/Graphing.js` | `drawDiagram(trains = TRAINS, o, page)`, `footerText()`, `makeFooter()`, `drawTrain()`, `LAYERS`, `makeLayer()`, `trainId()`, `timeId()`, `timeToX()`, `makeTimeLabel()`, `timeLabelHeight()`, `stationTextStyles()` |
| `program/program/TrainNumber.js` | `placeTrainNumbers()`, `findTrainNumberPosition()`, `createSegmentGrid()`, `addSegment()`, `someSegment()`, `segmentHitsBox()` |
| `program/data/Draft.js` | `DRAFTS`, `newDraft()`, `validDraft()`, `adoptDraft()` |
| `program/program/RunTimeAutofill.js` | `wildcardRegExp()`, `findTrainByNumber()`, `computeAutofill()`, `applyAutofill()` |
| `program/program/PassingTime.js` | `createPassingModel()`, `detectConflicts()`, `writePassingTimes()`；貪婪解法 `solveConflict()`, `addHeadwayCandidates()`, `restorePassingTimes()`；兩個求解器共用的分岐站換邊 `junctionMove()` 與整段重排 `rerouteConflict()` / `rerouteCandidate()` (見 `ALGORITHM.md` 4.4)；未使用的 `plainConflicts()` |
| `program/program/PassingTimeSTN.js` | 離散決策 + 差分約束：`restorePassingTimesSTN()`, `solveNetwork()`, `addProposals()`, `addHeadwayPoints()`, `prunePassingTimes()` |
| `program/program/PassingReport.js` | 還原通過時間的詳細結果：`passingReport()` (衝突清單、`passingLimits()`、`diagnoseConflict()`)，見 `ALGORITHM.md` 第 8 節 |
| `program/ui/passingTimeInput.js` | 待避時間計算的表單、dashboard、採用 / 捨棄 / 預覽 (`updateDraftUI()`, `checkedDraft()`) |
| `program/util/common.js` | `escapeHTML()`, `downloadFile()`, `readImportFile()`, `parseCSV()` |
| `program/util/stc.js` | 時刻字串轉換：`normalizeTime()`, `toSec()`, `toStr()`, `deductSec()`, `tohhmmss()` |

HTML 中 script 載入順序：`globalvar.js` → `DataStore.js` → `Draft.js` → util → UI (`opmodeInput.js` 在 `optionsIO.js` 之後) → 核心程式 → handler → setting → 設定/全部資料 handler，最後呼叫一次 `renderRouteTable()` / `renderTimetable()` / `renderOpmodeSelects()` / `initSettingsUI()`。
