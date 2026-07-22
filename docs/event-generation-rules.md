# V1 事件產生規則

> 本文件只定義未來實作規則，不授權事件功能、正式來源、資料同步或上線。來源須經四個循序核准階段；`SUSPENDED` 僅為獨立暫停狀態。

## 原則

- 只有 published snapshot 可產生公開事件。
- 官方事件、本站衍生事件、目前狀態與提醒窗口分開保存。
- 衍生事件固定標示：「本事件由本站依官方公開資料欄位自動整理」。
- 官方日期是 `Asia/Taipei` 的 `YYYY-MM-DD` 日曆日期；不先轉 UTC。計算時間使用 UTC ISO datetime。

## 事件與可靠性

| 事件 | 來源欄位 | 規則 |
|---|---|---|
| 新掛牌可轉債 | `listingDate` | 首次發布有效日期；不是首次被本站看到的日期 |
| 即將開始轉換 | `conversionStartDate` | 距離 1–30 日的窗口 |
| 正在轉換期間 | 起日、迄日 | `start <= today <= end`；狀態，不重複建每日事件 |
| 即將結束轉換 | `conversionEndDate` | 距離 1–30 日 |
| 到期 30／60／90 日 | `maturityDate` | 分開窗口；同日可同時屬較寬窗口，但 UI 只顯示最近門檻 |
| 賣回權日期接近 | `putDates[]` | 每個有效日期距離 1–30 日；同日去重 |
| 餘額變化 | `outstandingAmount`、`outstandingChangeDate` | 兩個完整成功 snapshot 且數值不同；缺異動日不公開事件，只記品質警示 |
| 已到期 | `maturityDate` | `today > maturityDate`；是日期衍生狀態，不代表已下櫃 |
| 可能下櫃 | snapshot 消失 | 不公開；只進 `awaiting_official_confirmation` 內部狀態 |
| 上市申請里程碑 | 11586 各日期 | 有效日期首次發布或官方修正 |

## 穩定鍵與修正

```text
entityId | eventKind | officialEffectiveDate | sourceId | ruleVersion
```

- 相同鍵重跑為冪等。
- 多來源指向同事件時可建立 presentation group，但每筆 attribution 保留。
- 官方日期修正建立 revision，舊事件標 `superseded`，不靜默刪除。
- 標題不參與唯一鍵，避免文字微調產生重複。
- `ruleVersion` 改變時先 dry-run 比較事件數，再由獨立 migration 決定是否重算。

## 日期與格式錯誤

- 不存在日期、混合時區、到期早於發行、轉換迄日早於起日：拒絕該 snapshot 發布。
- 可選日期缺失：不產生相應事件，不以發行日推測。
- ROC 日期只有 source fixture 證明格式後才能轉換。
- daylight-saving 不適用於臺北日曆日計算；`daysUntil` 以日曆日而非毫秒除法。

## 完整發布關卡

差異與事件可在 staging 計算，但只有 schema、正規化、完整性與 event validation 全部成功後，才隨 snapshot pointer 一起成為可見資料。失敗或 `PARTIAL` 不移動 pointer、不產生消失、歸零或公開部分事件。
