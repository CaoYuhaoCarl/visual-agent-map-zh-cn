detail 會在 Obsidian 中渲染，請依內容的形態選用下列語法，不要整頁都寫成段落或條列：

- 核心結論或關鍵定義：`> [!summary]` callout，1–3 句；補上 summary 沒寫到的理由或條件，不要逐字重複 summary。
- 風險、常見誤解、限制：`> [!warning]`。
- 待驗證的假設或開放問題：`> [!question]`。
- 實用技巧或例子：`> [!tip]` 或 `> [!example]`。
- 兩個以上的選項，或兩個以上的比較維度：Markdown 表格。
- 圖表：一個 ```mermaid``` 區塊，可用 Obsidian 支援的任何圖型，依內容形態選最貼合的一種：流程或因果用 flowchart（預設 TD，4 個節點以內的短鏈才用 LR），多方互動用 sequenceDiagram；時間演變用 timeline，排程用 gantt；比例用 pie；趨勢或數值比較用 xychart-beta；兩個維度的定位用 quadrantChart；階層用 mindmap 或 treemap-beta；實體關係用 erDiagram 或 classDiagram；狀態轉換用 stateDiagram-v2；數量流向用 sankey-beta。
- 使用者接下來要做的事、學習行動：`- [ ]` 任務清單。
- 整頁最關鍵的一兩個詞：`==highlight==`，每段最多一處。

規則：
1. 形態沒有對應的語法時，就寫一般段落；不要為了好看而硬套語法，每個語法都必須讓內容更容易理解。
2. 每個段落最多使用兩種特殊語法；callout 不得巢狀。
3. mermaid 每張圖最多 12 個節點、資料點或項目（pie 最多 8 塊、quadrantChart 最多 10 個點）；第一行寫圖型名稱，有 -beta 的要寫完整（例如 xychart-beta、sankey-beta）。只用文字標籤，標題與含括號或標點的標籤用雙引號包起來；不要寫以 click、link、callback、class、style、classDef 開頭的行，也不要用 :::、<<…>>、<br> 等 HTML 標籤、%%{}%% 或 --- 設定、URL、圖片與 ::icon 圖示。
4. 沒有內容的段落只寫「本次無新增內容」，不加 callout。
5. 不要輸出 Obsidian 不支援的語法（例如 :::、<details>、自訂 HTML）。
6. 有指定項目數量的段落，項目要寫成頂層清單或 #### 小標題，不要放進 callout 或表格。
7. detail 是給讀者看的內容：不要寫內部 ID（節點、證據、來源或報告的 ID）、審查意見，或對草稿與研究過程本身的評論。
8. detail 內的標題一律從三級標題（###）開始，往下依序用 ####，不跳級；不要用 # 或 ##。
9. 數學式只用在真正的公式：行內用 `$…$`（錢字號內側不留空白），獨立一行的公式用單獨成行的 `$$`；不要使用 `\(`、`\)`、`\[`、`\]`。
10. 帶數值的圖（pie、xychart-beta、sankey-beta、radar-beta 等）只能用來源中的數字，並在圖下方一行用與正文相同的引用方式註明出處；沒有來源數據就不要畫數據圖。概念性的 quadrantChart 標題要加「示意」。
