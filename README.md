# Train Diagram Maker

簡單、快速、現代化的列車運行圖 (列車的時間–距離圖) 繪製器。純前端網頁，所有計算都在瀏覽器中完成。

## Features

### 免費！

- 永久、所有功能免費
- 無水印
- 所有程式碼開源 ([MIT License](LICENSE))

### 簡單

- 支援手動輸入，也可以用 Excel 整理後匯入 (CSV / JSON)
- 必填資料只有站名、里程、時刻
- 不需要精確的時刻表，旅客時刻表就夠了
- 直觀的 UI 設計
- 完整的官方操作手冊

### 快速

- **不必安裝、不必更新、不連伺服器**：基於網頁的程式，所有計算都在本地完成
- **即時輸出**：借助現代的網頁渲染，即時看到結果
- **幾乎所有參數都可調整**：快速畫出想要的樣子
- **印刷模式**：直接產生 PDF 檔 (mm 比例尺、出血、頁碼)，從時刻表到書籍只要 30 秒
- **相容 OuDia / OuDiaSecond**：直接匯入 `.oud` / `.oud2`，也能再匯出回 `.oud` 檔
- **運行型態**：平日和假日班表不同？直接複製一版，決定哪些車哪些天開
- **疊圖**：把重疊路段的資料複製到另一條路線上
- **單一檔案**：匯入、匯出只需一個檔案，從路線到繪製設定全包

### 現代化

- **向量圖檔 (SVG)**：AI 能讀、無限放大不失真、可透明背景，支援 PowerPoint、Illustrator 等軟體
- **OuDia 樣式**：以前的設計，也能用現代的格式輸出
- **有結構的 SVG**：提供 id 與圖層，手動編輯、嵌入網頁都能輕鬆提取單一列車
- **列車號不重疊**：自動計算列車號碼、列車名的標記位置
- **自動補全**：輸入一班列車的時刻，自動套用到其他車次
- **待避計算**：依軌道配置自動算出快車通過的時間，消除旅客時刻表的不準確
- **停靠時間計算**：旅客時刻表精度不夠？程式幫您算
- **臨時停車**：自動推算列車到號誌站的時刻
- **AI 友善**：網站原生 [skills](skills/)，從整理資料到直接呼叫函式都寫好

## Project Structure

純前端：jQuery + Bootstrap，沒有 build、沒有框架、沒有 npm。每個語言一個資料夾，不含介面文字的程式則共用。

```
├── index.html              依瀏覽器語言轉到 zh/ …
├── 404.html
├── robots.txt              SEO
├── _redirects, _headers    Cloudflare Pages 設定
│
├── zh/                     繁體中文 (之後的語言用相同的結構)
│   ├── index.html          首頁
│   ├── diagram-maker.html  編輯器
│   ├── program/            含介面文字的程式 (表格 UI、待避計算的詳細結果)
│   └── manual/             操作手冊：src/*.md → *.html
│
├── program/                共用程式
│   ├── data/               資料 (ROUTE, TRAINS, 運行型態) 與待避計算的副本
│   ├── program/            設定、繪圖、列車號、OuDia 樣式、軌道配置、跨線列車、自動補全、待避計算、印刷
│   ├── handler/            匯入匯出 (CSV / JSON / OuDia / 疊圖)
│   ├── setting/            設定頁的綁定與預覽
│   ├── ui/                 共用的 UI (分頁切換、語言選單…)
│   └── util/               時刻轉換、SVG / PDF / zip 輸出、文字轉外框
├── manual/                 手冊的產生器 build.py 與共用 CSS
├── icon/                   介面圖示、軌道配置圖、線路拓樸圖
├── fonts/                  印刷用字體 (Noto Sans TC / JP, OFL)
├── bootstrap/
├── skills/                 給 AI agent 的 skills (整理資料、操作網站)
├── DATA_STRUCTURE.md       資料結構、設定、匯入匯出格式
└── ALGORITHM.md            自動補全與待避時間計算的演算法
```

本地執行 (需用 HTTP 開啟)：

```bash
python -m http.server 8765
```

開啟 `http://localhost:8765/`。修改手冊後執行 `python manual/build.py` (需 `pip install markdown`)。
