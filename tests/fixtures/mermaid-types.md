# Mermaid 圖型範例

Every block is a diagram type the sanitizer must keep as `mermaid`.

### flowchart TD

```mermaid
flowchart TD
  A["開始"] --> B["處理"]
  B --> C["結束"]
```

### graph LR

```mermaid
graph LR
  A["甲"] --> B["乙"]
```

### sequenceDiagram

```mermaid
sequenceDiagram
  participant U as 使用者
  participant S as 伺服器
  U->>S: 送出請求
  S-->>U: 回傳結果
```

### classDiagram

```mermaid
classDiagram
  Animal <|-- Dog
  Animal : 名稱
  Animal : 年齡
  Dog : 品種
```

### classDiagram-v2

```mermaid
classDiagram-v2
  Vehicle <|-- Car
  Vehicle : 輪數
  Car : 車門數
```

### stateDiagram

```mermaid
stateDiagram
  [*] --> 待處理
  待處理 --> 進行中
  進行中 --> [*]
```

### stateDiagram-v2

```mermaid
stateDiagram-v2
  [*] --> 閒置
  閒置 --> 執行中 : 開始
  執行中 --> 閒置 : 完成
```

### erDiagram

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ITEM : contains
```

### journey

```mermaid
journey
  title 我的一天
  section 早上
    起床: 3: 我
    通勤: 2: 我
  section 晚上
    晚餐: 5: 我
```

### gantt

```mermaid
gantt
  title 專案排程
  dateFormat YYYY-MM-DD
  section 階段一
  研究 : a1, 2026-01-01, 10d
  撰寫 : after a1, 7d
```

### pie

```mermaid
pie title 示意比例
  "甲" : 40
  "乙" : 35
  "丙" : 25
```

### quadrantChart

```mermaid
quadrantChart
  title 示意定位
  x-axis "低成本" --> "高成本"
  y-axis "低效益" --> "高效益"
  quadrant-1 "優先"
  quadrant-2 "規劃"
  quadrant-3 "暫緩"
  quadrant-4 "檢討"
  "方案甲": [0.3, 0.6]
  "方案乙": [0.7, 0.8]
```

### requirementDiagram

```mermaid
requirementDiagram
  requirement "需求一" {
    id: 1
    text: "系統必須可用"
    risk: low
    verifymethod: test
  }
  element "模組" {
    type: simulation
  }
  "模組" - satisfies -> "需求一"
```

### gitGraph

```mermaid
gitGraph
  commit
  branch develop
  checkout develop
  commit
  checkout main
  merge develop
```

### C4Context

```mermaid
C4Context
  title 系統脈絡圖
  Person(user, "使用者", "一般使用者")
  System(sys, "系統", "核心系統")
  Rel(user, sys, "使用")
```

### C4Container

```mermaid
C4Container
  title 容器圖
  Person(user, "使用者")
  Container(web, "網站", "React", "前端")
  Rel(user, web, "瀏覽")
```

### C4Component

```mermaid
C4Component
  title 元件圖
  Container(api, "API", "Node", "後端")
  Component(auth, "驗證", "模組", "登入")
  Rel(api, auth, "呼叫")
```

### C4Dynamic

```mermaid
C4Dynamic
  title 動態圖
  Person(user, "使用者")
  System(sys, "系統")
  Rel(user, sys, "登入")
```

### C4Deployment

```mermaid
C4Deployment
  title 部署圖
  Deployment_Node(srv, "伺服器", "Linux") {
    Container(app, "應用", "Node", "服務")
  }
```

### mindmap

```mermaid
mindmap
  root(("主題"))
    a["分支甲"]
      a1["細節一"]
    b["分支乙"]
      b1["細節二"]
```

### timeline

```mermaid
timeline
  title 發展歷程
  2020 : 起步
  2022 : 成長
  2024 : 成熟
```

### sankey-beta

(mermaid 11.13.0 sankey labels are ASCII only; CJK labels fail to parse.)

```mermaid
sankey-beta

SourceA,Result1,30
SourceA,Result2,20
SourceB,Result1,10
```

### xychart-beta

```mermaid
xychart-beta
  title "示意趨勢"
  x-axis ["一月", "二月", "三月"]
  y-axis "數量" 0 --> 100
  bar [20, 50, 80]
  line [20, 50, 80]
```

### block-beta

```mermaid
block-beta
  columns 2
  a["甲"] b["乙"]
  c["丙"] d["丁"]
```

### packet-beta

```mermaid
packet-beta
  0-15: "來源埠"
  16-31: "目的埠"
```

### kanban

```mermaid
kanban
  待辦
    t1[撰寫文件]
  進行中
    t2[審查程式]
```

### architecture-beta

```mermaid
architecture-beta
  group api(cloud)["API"]
  service db(database)["資料庫"] in api
  service srv(server)["伺服器"] in api
  db:L -- R:srv
```

### radar-beta

```mermaid
radar-beta
  axis a["速度"], b["品質"], c["成本"]
  curve s1["方案甲"]{4, 3, 2}
  curve s2["方案乙"]{2, 4, 5}
```

### treemap-beta

```mermaid
treemap-beta
"根"
    "分類甲"
        "項目一": 10
        "項目二": 20
    "分類乙"
        "項目三": 15
```

### venn-beta

```mermaid
venn-beta
  set A["甲"]
  set B["乙"]
  union A,B["共通"]
```

### ishikawa

```mermaid
ishikawa
  魚骨主題
    原因甲
      細項一
    原因乙
      細項二
```

### ishikawa-beta

```mermaid
ishikawa-beta
  魚骨主題
    原因甲
      細項一
    原因乙
      細項二
```
