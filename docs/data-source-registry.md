# 資料來源登錄表

狀態：待人工審查。公開可讀不等於可任意重製或商業使用。`APPROVED` 才能建立正式 adapter；`PENDING` 不得介接；`REJECTED` 永久禁止。

| sourceId | 提供機關 | 資料集名稱 | endpoint | 用途 | 欄位 | 頻率 | 預期窗口 | 授權條款 | 商用 | 顯名 | 快照保存 | 實作 | 狀態 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `tpex-bond-issue` | 證券櫃檯買賣中心 | 轉(交)換債發行資料下載 | https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data | 國內轉換／交換債發行條件、餘額與事件 | Date、IssuerCode/Name、BondCode/Type、ShortName、Issue/Listing/MaturityDate、Issue/OutstandingAmount、CouponRate、Guaranteed/Description、Conversion/ExchangePriceAtIssuance、轉換期間、PutOptionDate/Price、Underwriter、Trustee、OutstandingChange、OfferingMethod | 每日 | 18:30 主同步；20:30、22:30、次日 08:00 條件式補抓 | data.gov.tw 資料集 11406；政府資料開放授權條款第 1 版 | 待人工確認 | 待人工確認精確文字 | 待人工確認 | 尚未介接 | `PENDING` |
| `tpex-company-basic` | 證券櫃檯買賣中心 | 興櫃公司基本資料 | https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R | 興櫃 Company 與 EmergingCompanyProfile | Date、SecuritiesCompanyCode、CompanyName/Abbreviation、Registration、IndustryCode、UnifiedBusinessNo.、成立／登錄日、地址、電話、網站、IssueShares | 每日 | 18:30；未更新時 20:30、22:30、次日 08:00 | data.gov.tw 資料集 28568；政府資料開放授權條款第 1 版 | 待人工確認 | 待人工確認精確文字 | 待人工確認 | 候選端點已核對 | `PENDING` |
| `tpex-company-revenue` | 證券櫃檯買賣中心 | 興櫃公司每月營業收入彙總表 | https://www.tpex.org.tw/openapi/v1/t187ap05_R | 月營收、月增、年增、累計年增及十二月趨勢 | 出表日期、資料年月、公司代號／名稱、產業、當月／上月／去年同期營收、月增率、年增率、累計營收、累計年增率、備註 | 每月 | 每月 1–11 日 08:30；11–15 日缺漏補抓；平時每週修正檢查 | data.gov.tw 資料集 94025；政府資料開放授權條款第 1 版 | 待人工確認 | 待人工確認精確文字 | 待人工確認 | 尚未介接 | `PENDING` |
| `tpex-emerging-eod` | 證券櫃檯買賣中心 | 興櫃股票當日行情表 | https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics | 興櫃盤後日均價、日高、日低、最後成交資訊、成交量 | Date、Time、SecuritiesCompanyCode、Average、Highest、Lowest、LatestPrice、TransactionVolume；不使用買賣報價欄位 | 每交易日 | 16:30 首抓；18:30 主同步；20:30、22:30、次日 08:00 條件式補抓 | data.gov.tw 資料集 11747；政府資料開放授權條款第 1 版 | 待人工確認 | 待人工確認，且固定標「盤後資料，非即時行情」 | 待人工確認 | 尚未介接 | `PENDING` |
| `tpex-listing-applications` | 證券櫃檯買賣中心 | 申請上櫃公司 | https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies | 興櫃公司申請上櫃進度與事件 | Date、公司代號／名稱、申請／審議／核准／掛牌日期、主辦承銷商、Note；OfferingPrice 暫不使用 | 每日或來源更新時 | 18:30；未更新時條件式補抓 | 櫃買 OpenAPI 與網站使用條款；對應開放授權證據待核 | 待人工確認 | 待人工確認 | 待人工確認 | 尚未介接 | `PENDING` |
| `twse-listing-applications` | 臺灣證券交易所 | 申請上市之本國公司 | https://openapi.twse.com.tw/v1/company/applylistingLocal | 興櫃公司申請上市進度與事件 | Code、Company、ApplicationDate、CommitteeDate、ApprovedDate、ListingDate、Underwriter、Note；實際回應值與鍵疑似錯位 | 不定期 | 18:30；資料日期未更新時條件式補抓 | data.gov.tw 資料集 11586；政府資料開放授權條款第 1 版 | 待人工確認 | 待人工確認 | 待人工確認 | 欄位對映未核定，不得介接 | `PENDING` |
| `manual-planned-bonds` | 專案人工維護 | 預計發債案件 | 專案內 `data/manual/planned-bond-issues.json` | 無合格 OpenAPI 時的預計發債事件 | id、issuerName/code、status、expectedEffectiveDate、suspended/supplement/withdrawn/revoked、officialAgency/Url/PublishedOn、createdOn、lastReviewedOn、reviewerNote | 人工 | 人工審核後提交 | 每筆官方來源各自適用條款 | 每筆待人工確認 | 每筆顯示官方機關及連結 | 只保存經審查的版本控管資料 | 尚未建立 | `PENDING` |

## REJECTED

| sourceId | 對象 | 拒絕原因 | 狀態 |
|---|---|---|---|
| `wrong-company-basic` | `/mopsfin_t187ap35_O` | 官方 Swagger 正式名稱為「上櫃公司股東行使提案權情形彙總表」，不是興櫃公司基本資料 | `REJECTED` |
| `bond-cb-daily-price` | `bond_cb_daily` | 券商買賣日報表，不是個別可轉債盤後價格來源 | `REJECTED` |
| `general-html-or-internal-api` | 一般網站 HTML、下載按鈕、未公開接口、逆向 API | 不是核准 OpenAPI；櫃買條款限制未經同意的自動抓取 | `REJECTED` |
| `unauthorized-market-data` | Yahoo、Yahoo Finance、CBAS、其他券商、代理轉抓、未授權金融 API | 永久禁止，且不可作 fallback | `REJECTED` |

## 尚無候選來源

- 個別可轉債盤後市場成交價格：無 APPROVED 候選，`Phase CB-EOD-PRICE` 必須跳過。
- 官方重大公告、IPO、承銷、競拍及抽籤：本次未核定精確端點、授權及欄位，不得建立 adapter；若納入後續 registry，須先走完整人工批准。
- 集保結算所月資料及金管會資料：尚未指定精確資料集；不得假裝每日資料或正式介接。

## 人工批准必要紀錄

每個來源轉為 `APPROVED` 前，必須記錄精確端點、正式資料集名、欄位與語意、更新頻率、資料日期、條款名稱及版本、商業使用、重製、修改、計算、快取、歷史保存、必要顯名、停止／撤回處理、核准人、日期及證據連結。任一項不明即維持 `PENDING`。
