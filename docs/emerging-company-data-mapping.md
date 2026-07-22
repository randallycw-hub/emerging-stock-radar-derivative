# 興櫃公司資料涵蓋與欄位對映

> 本文件目前僅為設計 mapping。資料來源必須依 `CANDIDATE` → `APPROVED_FOR_V1_DESIGN` → `VERIFIED_FOR_IMPLEMENTATION` → `APPROVED_FOR_PRODUCTION` 四個階段循序核准；`SUSPENDED` 是獨立暫停狀態。本輪不授權來源啟用、功能實作、遠端資源或上線。

## 涵蓋集合

V1 在完整興櫃名錄核准前，以資料集 94025 某一 `資料年月` 內成功發布的公司代號集合建立 `EmergingCoverageMembership`。名稱固定為「興櫃月營收資料涵蓋公司」，不宣稱是當前完整名錄或市場身分。

```ts
interface EmergingCoverageMembership {
  companyCode: string;
  revenueYearMonth: string;
  sourceId: "data-gov-94025";
  publishedSnapshotId: string;
  attribution: SourceAttribution;
}
```

只有完整成功的 94025 snapshot 可更新當期集合。公司在下一期消失只記錄資料品質差異，不產生終止興櫃事件。

## 94025 月營收 mapping

| 官方欄位 | 內部欄位 | 規則 |
|---|---|---|
| 出表日期 | `sourcePublishedOn` | ROC／西元格式經 fixture 驗證後轉 `YYYY-MM-DD` |
| 資料年月 | `yearMonth` | 正規化 `YYYY-MM`；不可由出表日期推測 |
| 公司代號 | `companyCode` | trim；必要；同月唯一 |
| 公司名稱 | `companyName` | trim；不作永久主鍵 |
| 產業別 | `industryName` | 官方文字；不自行分類 |
| 營業收入-當月營收 | `currentMonthRevenue` | 非負 decimal 字串，保存官方單位 |
| 營業收入-上月營收 | `previousMonthRevenue` | 非負 decimal 字串 |
| 營業收入-去年當月營收 | `priorYearMonthRevenue` | 非負 decimal 字串 |
| 營業收入-上月比較增減(%) | `monthOverMonthPercent` | signed decimal 字串；不自行重算覆蓋 |
| 營業收入-去年同月增減(%) | `yearOverYearPercent` | signed decimal 字串 |
| 累計營業收入-當月累計營收 | `cumulativeRevenue` | 非負 decimal 字串 |
| 累計營業收入-去年累計營收 | `priorYearCumulativeRevenue` | 非負 decimal 字串 |
| 累計營業收入-前期比較增減(%) | `cumulativeYearOverYearPercent` | signed decimal 字串 |

`備註` 不進 V1 published model。最近十二個月趨勢只是依 `yearMonth` 排序已發布月資料，必須顯示可用月份與缺月，不插值、不預測。

## 28567 公司基本資料 mapping

| 官方欄位 | 內部欄位 | V1 使用 |
|---|---|---|
| 出表日期 | `sourcePublishedOn` | 是 |
| 公司代號 | `companyCode` | 是，與 94025 精確連接 |
| 公司名稱／公司簡稱 | `name`／`shortName` | 是 |
| 產業別 | `industryName` | 是 |
| 住址 | `address` | 是 |
| 營利事業統一編號 | `taxId` | 是，輔助穩定識別 |
| 董事長／總經理 | `chairperson`／`generalManager` | 是 |
| 成立日期 | `establishedOn` | 是 |
| 實收資本額 | `paidInCapital` | 是，非負 decimal 與明確單位 |
| 網址 | `websiteUrl` | 是，只接受 http/https |

其他發言人、Email、電話、過戶機構、會計師、股數等欄位不進 V1 白名單。

## 合併規則

1. 先取得已發布 94025 涵蓋集合。
2. 28567 只為集合中的 `companyCode` 建立 profile。
3. 同一 code 在 28567 出現多筆、名稱與統編衝突或 code 空白時拒絕自動合併，記錄 `IDENTITY_AMBIGUOUS`。
4. 不能用 28567 判定目前興櫃、最新登錄或終止興櫃。
5. 11586 申請上市資料同樣以 code 關聯；無唯一配對時只保留隔離紀錄，不公開到公司頁。
6. 債券發行人 code 可連結既有公司；非涵蓋集合發行人只建最小 `BondIssuerProfile`，不建立興櫃公司頁。

## 頁面標示

`/emerging` 顯示最新成功的資料年月、涵蓋公司數與來源，但標題不得使用「完整名單」。詳細頁逐區塊顯示各自資料集、資料日期與擷取時間；缺 profile 時仍可顯示月營收，但不得用空白或 fixture 補值。
