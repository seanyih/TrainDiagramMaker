# 資料庫

網站「資料庫」頁面 (`zh/database/`) 讀取的路線 & 運行圖資料。本資料夾原樣發布 (網址 `/database/…`)，沒有 build。
工作中的檔案 (爬蟲、helper、還沒發布的資料) 在 `../workspace/` (不進 git，見該資料夾的 README)。

## 結構

```
catalog.json                     國家、地區、公司 (手寫)
<國家>/order.txt                 路線的順序 (手寫，一行一個路線 id，# 之後是註解)
<國家>/catalog.json              搜尋頁的路線列表 (由 tools/build_catalog.py 產生，不要手改)
<國家>/<路線>/info.json          路線的名稱、公司、種類與版本列表 (手寫)
<國家>/<路線>/releases/          各版本的檔案 (發布後不再修改、刪除：已發布的連結會失效)
tools/                           helper (見下)
```

路線 id = 資料夾名稱 (小寫英數與 `-`)，網址為 `zh/database/line.html?id=<國家>/<路線>`。

### catalog.json

```json
{
	"countries": [
		{
			"id": "jp",
			"flag": "🇯🇵",
			"name": { "zh": "日本", "en": "Japan", "ja": "日本" },
			"regions": [ { "id": "kanto", "name": { "zh": "關東", "en": "Kanto", "ja": "関東" } } ],
			"companies": [ { "id": "jr-east", "name": { "zh": "JR東日本", "en": "JR East", "ja": "JR東日本" } } ]
		}
	]
}
```

- `id` = 國家資料夾名稱。陣列的順序即搜尋頁的國家順序。`regions` 可為空 (例如台灣，不分區)。
- 名稱是各語言的對照，網站依頁面語言顯示，缺少時用 `zh`。

### info.json

```json
{
	"name": { "zh": "縱貫線北段", "en": "Western Trunk Line (North)", "ja": "縦貫線北段" },
	"section": { "zh": "基隆 – 新竹", "en": "Keelung – Hsinchu", "ja": "基隆 – 新竹" },
	"companies": ["tra"],
	"types": ["railway"],
	"regions": [],
	"route": [
		{ "date": "2026-10-03", "title": "新增平鎮車站", "kind": "route", "tags": ["complete"], "files": { "json": "releases/route-2026-10-03.json" }, "latest": true }
	],
	"all": [
		{ "date": "2026-07-01", "title": "2026年7月改點", "kind": "all", "tags": ["solved"], "latest": true, "description": "（選填）展開後顯示的說明", "files": { "json": "releases/all-2026-07-01.json", "svg": "releases/all-2026-07-01.svg.zip", "pdf": "releases/all-2026-07-01.pdf.zip" } }
	]
}
```

| 欄位 | 說明 |
|---|---|
| `name` / `section` | 路線名、區間 (搜尋結果的標題、副標)，各語言對照 (`zh` 必填)。搜尋比對這兩者的所有語言與公司名，`臺` = `台` |
| `companies` | `catalog.json` 中該國的公司 id，可多個 (跨公司的路線) |
| `types` | `hsr` 高鐵、`railway` 鐵路、`narrow` 窄軌鐵路、`metro` 地鐵、`lrt` 輕軌、`other` 其他 |
| `regions` | `catalog.json` 中該國的地區 id，可多個 |
| `route[]` | 路線資料的版本：`kind` = `route`，`files.json` = 路線 JSON |
| `all[]` | 全部資料的版本：`kind` = `all` (全部資料 JSON) 或 `timetable` (只有列車)；`files` 可有 `json`、`svg` (SVG 的 zip)、`pdf` (印刷模式輸出的 zip) |
| `date` / `title` | 版本的日期 (生效日，`yyyy-mm-dd`) 與標題。標題一行放不下時，超出的部分收進說明，點 `···` 展開 |
| `description` | 選填，較長的說明 (純文字，換行保留)。有的話標題旁顯示 `···`，點了展開，同 GitHub 的 commit 列表 |
| `tags` | `route`：`mileage` 里程、`track` 軌道配置、`topology` 線路拓樸、`complete` 完整 (三者皆有，只寫這個)；`all`：`arrival` 到站時刻、`solved` 計算完成 (已含到站時刻，只寫 `solved`) |
| `latest` | 手動指定顯示在最上方、帶「latest」標記的版本 (每段可有多個，例如同日的一般版與還原通過時間版)；都沒有時用日期最新的 (同日全部)。「開始製作」用路線資料的第一個 |

> **注意：`description` 只給人類使用。** Agent 不要讀取、寫入或依據 `description` 行動；若想使用，請建議由人類來處理。

`files` 的路徑相對於路線資料夾。

## helper

在 repo 根目錄執行 (只需 Python 3)：

| 指令 | 用途 |
|---|---|
| `python database/tools/build_catalog.py [國家…]` | 檢查每個 `info.json` (未知的公司、地區、種類、標籤、日期格式…)，依 `order.txt` 的順序產生 `<國家>/catalog.json`。`order.txt` 沒列到的路線放最後並提示。有錯時不寫入，結束代碼 1 |
| `python database/tools/check_releases.py [國家…]` | `releases/` 裡有、但 `info.json` 沒列到的檔案；以及 `info.json` 列了、但不存在的檔案 |
| `python database/tools/check_versions.py 2026-07-01 [--section route\|all] [--country tw]` | 最新版本的日期早於指定日期的路線 (路線資料、全部資料分開看；沒有版本的顯示 `none`) |
| `python database/tools/count_files.py [--limit-mb 50]` | 會被 push / 部署的檔案數 (Cloudflare Pages 上限 20,000) 與超過 100 MB (GitHub 上限)、25 MiB (Cloudflare Pages 單檔上限) 的檔案 |
| `python database/tools/merge_route.py route.json all.json [--out 輸出檔]` | 把路線 JSON 的改動 (增刪車站、軌道配置、線路拓樸、路線名稱) 合進全部資料 JSON：依站名重新對應所有列車的 `station_order` 與 `station_record`，已不存在的車站的停靠略過 (改名視為刪除 + 新增，要先在全部資料裡處理)。沒有 `--out` 時直接覆寫全部資料 JSON |

## 發布流程

1. 在 `workspace/<國家>/<路線>/` 整理好檔案 (見 `workspace/README.md`)。
2. 複製到 `database/<國家>/<路線>/releases/`，檔名 `<route|all>-<日期>.<副檔名>` (例 `all-2026-07-01.json`、`all-2026-07-01.svg.zip`)。
3. 新路線：建立資料夾與 `info.json`，把 id 加進 `order.txt`；新的公司、地區加到 `catalog.json`。
4. 在 `info.json` 的 `route` / `all` 加上版本 (要成為最上方的版本時，移動 `latest`)。
5. `python database/tools/check_releases.py` 確認沒有漏列，`python database/tools/build_catalog.py` 重新產生搜尋列表。
6. `python -m http.server 8765` 後開 `http://localhost:8765/zh/database/` 確認，commit、push。
