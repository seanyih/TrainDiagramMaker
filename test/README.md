# 資料庫頁面的測試

只需要 Python 3 與 Edge / Chrome (headless，不用安裝任何套件)。需要網路 (頁面從 CDN 載入 jQuery)。

## 看網頁：一行指令

```bash
python test/database_dev.py
```

找到資料庫 repo (旁邊的 `RTD_data_database` 或 `RTD_data`，要有 `tools/build.py`)、重新 build，然後同時開網站 (8765) 與資料 (8766)，最後逐一檢查該回 200 的網址。開啟 http://localhost:8765/zh/database/ 。

出現 404 時它會直接說原因，常見的有：

| 訊息 | 原因 |
|---|---|
| `zh/database/index.html does not exist` | 網站 repo 不在 `feat/database` 分支 |
| `Cannot find the data repo` | 資料 repo 不在 `feat/database` 分支，或資料夾不在旁邊 (`--data <資料夾>` 指定) |
| `Port 8765 is taken by another program` | 別的資料夾 / 分支的舊 server 還開著 (Windows 上兩個 server 可以同時佔用同一個 port，請求會隨機被其中一個接走，另一個回 404) |

兩個 port 固定：`program/util/database.js` 在 localhost 時讀 `http://localhost:8766`。

## 檢查：一行指令

```bash
python test/database_check.py
```

約 1 分鐘，每項印 `PASS` / `FAIL` 與原因，有失敗時結束代碼為 1。

| 分組 | 檢查 |
|---|---|
| static | 頁面載入的檔案都存在、各頁都連到資料庫、script 的載入順序 (用到的函式有先定義) |
| data | `build.py` 成功；故意寫錯的資料 (未知公司 / 地區 / 標籤、日期、檔案不存在、跑出路線資料夾、兩個 latest…) 會被拒絕並說明原因；`release.py` 新增版本後 latest 正確、`build.py` 接受；`dist/` 完整 (每個版本的檔案存在且格式對、路徑符合網站的 `DB_LINE_ID` / `DB_FILE`、工作中的檔案沒有外洩、搜尋索引與路線檔一致) |
| http | 每個頁面與資料檔都回 200；資料有 CORS；不存在或想跳出資料夾的路徑回 404 |
| browser | 在 headless Edge 實際渲染頁面，與 `dist/` 比對：每個國家、地區、種類、公司的篩選結果；文字搜尋 (站名、公司、`臺` = `台`、查無結果)；路線頁的版本數、標籤數、下載鈕數、開始製作的連結；錯誤的 id；開始製作後編輯器真的匯入了 (路線 / 全部資料)；不合法的 `?db=` 被拒絕；console 沒有 JavaScript 錯誤 |

選項：

```bash
python test/database_check.py -k browser          # 只跑名稱或分組含 browser 的
python test/database_check.py --no-browser        # 不用瀏覽器 (約 3 秒)
python test/database_check.py --all-lines         # 路線頁每一條都渲染 (預設每國抽 3 條)
python test/database_check.py --data C:\web\RTD_data_database
python test/database_check.py --show-dom "/zh/database/?c=jp&r=kyushu"   # 印出瀏覽器看到的 DOM 與 console，除錯用
```

注意：

- Git Bash 會把 `"/zh/..."` 這種單純的路徑改寫成 Windows 路徑，`--show-dom` 前請先 `export MSYS_NO_PATHCONV=1`。
- Windows 的 Edge 會在 `&` 截斷沒加引號的網址 (篩選條件會悄悄消失)。`render()` 已加引號，自己呼叫 Edge 時要注意。
- 沒有測到：一頁超過 50 條時的分批載入 (目前最多 31 條)、下載鈕實際存檔 (只檢查檔案可取得)。
