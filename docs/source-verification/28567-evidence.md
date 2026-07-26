# Dataset 28567 verification evidence

檢查日期：2026-07-26

目前狀態：`APPROVED_FOR_V1_DESIGN`；本 Task 只完成候選來源的證據補正與離線契約驗證，不升級 Source Registry，也不授權正式 adapter。

## Resource roles

| Role | Official resource | Contract evidence |
| --- | --- | --- |
| Dataset metadata | https://data.gov.tw/dataset/28567 | Page identifies 公開發行公司基本資料, lists the official provider, daily update, free access and 政府資料開放授權條款－第1版. It lists the CSV resource and OAS URL. |
| CSV candidate | https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv | HTTP 200, `text/csv`, SHA-256 `0fdeb487bfb2b832841de2963ccdcb610a8399d06e19521a2c7e0e3a53eb92bb`, 299 data rows. |
| OpenAPI candidate | https://openapi.twse.com.tw/v1/opendata/t187ap03_P | HTTP 200, `application/json`, SHA-256 `688fa2c68e53d56c70744d1cb222afcadd4eb1192399dee879ed81e7b6ec75ee`, 299 object-shaped records by brace count; the response is not parseable as strict JSON. |
| OAS | https://openapi.twse.com.tw/v1/swagger.json | HTTP 200, `application/json`, SHA-256 `2c2cecccb7a220ac9e263228a7659aa49b1ada5aea397650e601ad3dfcc48043`; contains `/opendata/t187ap03_P`. Endpoint/schema evidence only. |

## Contract scope

The contract covers company code, company name and short name, industry, website, establishment date, paid-in capital, chairperson, general manager, tax ID and address. Dates normalize to `YYYY-MM-DD`; paid-in capital is a non-negative decimal; URLs must use HTTP(S); unknown fields are rejected.

The fixture is a one-row minimized contract sample derived from the official CSV field shape; it does not retain a full official response or personal-data fields. Its metadata records both candidate resource roles, HTTP status, content type, response hashes, row counts, OAS operation, sampling date and minimization method. The OpenAPI response was observed to have balanced object delimiters but failed strict JSON parsing, so it cannot be mapped or used as fallback.

## 94025 join restriction

28567 is enrichment data only. The coverage set is first built from 94025 company codes. A 28567 profile is joined only when its company code matches exactly one 94025 code. Missing matches are reported; duplicate profiles are classified as ambiguous and rejected. This dataset must not establish current emerging status, new listings, terminations or a complete market roster.

## Decision gate

Before any formal adapter is written, an independent reviewer must verify the dataset page, CSV endpoint correspondence, real HTTP metadata, hashes, row counts, schemas, field semantics, license evidence and attribution text. The CSV and OpenAPI resources remain separately evaluated; the malformed OpenAPI payload is comparison-only and never a fallback. Until manual registry amendment, 28567 remains `APPROVED_FOR_V1_DESIGN` only.
