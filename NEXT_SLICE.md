# Next Slice: 線路拓樸編輯器

## 問題

鐵路系統通常是多條路線相互分支、直通而成的。然而，運行圖只能顯示單一線路的運行狀況。遇到分支，我們就只畫到重疊部分。問題就出在，如果列車沒有停靠分支的點，例如是信號場的話，我們必須手動算出分點，否則信號場~第一個停靠站之間的資訊就找不到了。

這次更新會順便解決掉另一個問題: 畫圖的時候可不可以像次要時間線一樣，畫次要車站線?

## UI

在路線資料子頁面下，開一個跟「軌道配置」類似的東西。

左欄會是很像git commit graph的東西，右欄會是給使用者調整的地方，和軌道配置一樣。graph一樣是用小svg湊成，在`icon/path/`下面。dimension一樣統一是W40，H50 px。

一開始，用`start`, `station`, `end` 湊出主要路線。

主要路線的隔壁全部加一欄是`add_branch`，整體初始狀況大概長這樣:

    start     add_branch
    station   add_branch
    ...       ...
    station   add_branch
    end       add_branch

當使用者點了一個add_branch之後，視為「有一條路線會從此分岐」。圖片變成:

```
start                add_branch
station              add_branch
...                  ...
station              add_branch
pass                 branch.add_station
pass                 branch.start
station_with_branch  branch.corner       add_branch
...       ...
station   add_branch
end       add_branch
```

如果在start添加一個branch，則會變成:

```
blank_placeholder    branch.add_station
blank_placeholder    branch.start
start_with_branch    branch.corner       add_branch
...       ...
station   add_branch
end       add_branch
```

為了美觀，在end添加一個branch，會變成:

```
start                add_branch
station              add_branch
...                  ...
station              add_branch
end_with_branch      branch.corner.T       add_branch
blank_placeholder    branch.start.T
blank_placeholder    branch.add_station
```

其中.T代表上下翻轉的版本。我沒有輸出，請在css裡寫就好。

如果一個分岐有很多個站點 (使用者按branch.add_station時) :

```
start                add_branch
station              add_branch
...                  ...
station              add_branch
pass                 branch.add_station
pass                 branch.start
pass                 branch.station
station_with_branch  branch.corner       add_branch
...       ...
station   add_branch
end       add_branch
```

我們不讓使用者在branch上繼續分岐，因為我們在畫運行圖的時候不會畫到branch上，直接將其視為兩個獨立分支，對本圖等價。

如果一個站有兩個分岐，會變成這樣:

```
start                add_branch
station              add_branch
...                  ...
station              add_branch
pass                 branch.add_station
pass                 branch.start
pass                 branch.pass         branch.add_station
pass                 branch.pass         branch.start
station_with_branch  branch.branch       branch.corner add_branch
...       ...
station   add_branch
end       add_branch
```

規則永遠是pass靠左側，車站靠右側，圖面看起來整潔。

最多允許使用者往同一個車站加三個branch。原因同上: 其實重要的是「分歧點到該站的距離」，而非實際路網拓樸。這張branch graph只是方便使用者整理、理解而已。單站有三個分岐應該足以涵蓋多數場景。

---

右欄部分:

一樣每一列顯示站名和里程。這裡各欄間不需要再用橫線隔開。每站都給使用者一個checkbox "次要車站"，選中後，繪圖時比照次要時間線辦理: 細部設計也加上次要車站線調整、次要站名與次要站名別名的配置。但預覽不需要。勾選checkbox同時`station`換成`signal`。起終點不能是次要車站 (畢竟外框會直接蓋掉)。有branch的話用`signal.branch`

branch上的車站，第一個輸入框輸入站名 (placeholder=站名)、第二個輸入框寫: XX站起 [] 公里。最右邊加一個X刪除branch上的車站。記得回頭修改graph。

主線上的車站不給X刪除，要刪除必須回到最上方表格。因為涉及多項數據更改。

## 匯出匯入

想一個辦法存這些資料。一樣全部進到routedata即可。建議儲存branch資料就足夠。一樣建立一個single source of truth在程式裡，後續要parse不用回來讀DOM。

## 計算

接下來在列車的「車次細項」裡面，加兩個欄位: 

    始發
    [從所有branch出去的車站，在時刻表上現有的始發站以前select]  [placeholder = XX發]
    終點
    [從所有branch出去的車站，在時刻表上現有的終點站以後select]  [placeholder = XX到]

在csv匯入中，會是列車顏色下面的四行: 始發站名、時刻、終點站名、時刻。json部分交由你設計。

這裡不一定要填真正的始發，只是要計算跨線列車的問題。比如說一班車從花蓮->宜蘭->瑞芳->台北。宜蘭線與縱貫線在八堵站分岐，但列車不停八堵。始發站可以填瑞芳，而不一定要填花蓮 (甚至填瑞芳的誤差更小!) 

填入後，系統自動計算瑞芳-台北之間，以距離內插算出通過八堵的時間點。

這個內插算出來的時間點不一定準確，僅能當作參考。因此，在"還原通過時間"的"細部設定"下，新增兩個參數: 第一個是"內插時間-距離誤差比"，也就是說當列車在這兩站之間的距離越遠、分岔點距離其中一個車站越遠，列車在分岔點直接使用直線連接的誤差就會越大。這點先設定為 "A站-分岔點B-C站"時，前後兩段的平均時速不相差超過20%。(default 1.2， >= 1)。這是一種模型，另一種是"內插最大時間誤差" (default null，>= 0，設定時會override前項)，直接指定時間點與內插值不超過多少，以防前面模型不準，可以手動調整。

直接使用內插時間繪圖時不受granularity箝制，但若要進行調整就受到箝制。


