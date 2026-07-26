# Dataset 28567 verification evidence

檢查日期：2026-07-26

目前狀態：`APPROVED_FOR_V1_DESIGN`；本 Task 只完成候選來源的離線契約驗證，不升級 Source Registry，也不授權正式 adapter。

## Resource roles

| Role | Official resource | Contract evidence |
| --- | --- | --- |
| Dataset metadata | https://data.gov.tw/dataset/28567 | Dataset page identifies 公開發行公司基本資料, official provider, free access and 政府資料開放授權條款－第1版; exact commercial-use wording remains subject to registry review. |
| CSV candidate | https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv | Candidate CSV resource; this task stores only a minimized synthetic contract fixture, not an official response. |
| OpenAPI candidate | https://openapi.twse.com.tw/v1/opendata/t187ap03_P | Candidate JSON endpoint; payload must not be used to infer current emerging-company status. |
| OAS | https://openapi.twse.com.tw/v1/swagger.json | Endpoint/schema evidence only; payload semantics require separate verification. |

## Contract scope

The contract covers company code, company name and short name, industry, website, establishment date, paid-in capital, chairperson, general manager, tax ID and address. Dates normalize to `YYYY-MM-DD`; paid-in capital is a non-negative decimal; URLs must use HTTP(S); unknown fields are rejected.

The fixture is a one-row synthetic/minimized contract sample with no retained official company row and no personal-data fields. Its metadata records both candidate resource roles, URLs, HTTP/content-type placeholders for the contract, sampling date and minimization method.

## 94025 join restriction

28567 is enrichment data only. The coverage set is first built from 94025 company codes. A 28567 profile is joined only when its company code matches exactly one 94025 code. Missing matches are reported; duplicate profiles are classified as ambiguous and rejected. This dataset must not establish current emerging status, new listings, terminations or a complete market roster.

## Decision gate

Before any formal adapter is written, an independent reviewer must verify the dataset page, CSV/JSON endpoint correspondence, real HTTP metadata, hashes, row counts, schemas, field semantics, license evidence and attribution text. Until then, 28567 remains `APPROVED_FOR_V1_DESIGN` only.
