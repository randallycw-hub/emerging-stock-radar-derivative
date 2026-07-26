# Dataset 28567 resource adoption decision

決策日期：2026-07-26

## 決策摘要

CSV 與 OpenAPI 分開評估。CSV 的官方資料集對應、欄位語意、最小 fixture、schema、mapping、identity 與 94025 coverage join 規則可供人工 amendment 審查，因此建議 CSV resource 單獨升級為 `VERIFIED_FOR_IMPLEMENTATION`。資料集 28567 本身仍維持 `APPROVED_FOR_V1_DESIGN`，本文件不授予 production 使用權。

OpenAPI `/opendata/t187ap03_P` 回應雖為 HTTP 200，但實際 payload 無法通過嚴格 JSON parsing。它不得作正式 ingestion、fallback 或 published snapshot；resource-level 建議標記為 `SUSPENDED`，僅保留 schema/operation drift 比較證據。

## Dataset and resource evidence

- Dataset page: https://data.gov.tw/dataset/28567
- Dataset name: 公開發行公司基本資料
- Provider shown on page: 金融監督管理委員會證券期貨局；資料集標題標示證交所
- License: 政府資料開放授權條款-第1版
- Charge: 免費
- Update frequency: 每1日
- OAS URL: https://openapi.twse.com.tw/v1/swagger.json

### CSV primary resource recommendation

- URL: `https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv`
- HTTP status: 200
- Content-Type: `text/csv`
- Response SHA-256: `0fdeb487bfb2b832841de2963ccdcb610a8399d06e19521a2c7e0e3a53eb92bb`
- Data row count: 299
- Fixture: `tests/fixtures/source-verification/28567/csv-minimal.csv`
- Metadata: `tests/fixtures/source-verification/28567/metadata.json`

The CSV fields are sufficient for the approved enrichment scope: company code/name/short name, industry, website, establishment date, paid-in capital, chairperson, general manager, tax ID and address. Dates normalize to `YYYY-MM-DD`; monetary values are non-negative decimals; unknown fields, malformed URLs, duplicate identities and invalid dates are rejected.

### OpenAPI suspended resource

- URL: `https://openapi.twse.com.tw/v1/opendata/t187ap03_P`
- HTTP status: 200
- Content-Type: `application/json`
- Response SHA-256: `688fa2c68e53d56c70744d1cb222afcadd4eb1192399dee879ed81e7b6ec75ee`
- Observed object count: 299
- Strict JSON parse: failed

The HTTP status does not establish payload reliability. The malformed response must never become an ingest path or fallback. A future schema-drift comparator may inspect a separately captured response, but no normalized row may be produced from this resource.

### Swagger/OAS role

- URL: `https://openapi.twse.com.tw/v1/swagger.json`
- HTTP status: 200
- Response SHA-256: `2c2cecccb7a220ac9e263228a7659aa49b1ada5aea397650e601ad3dfcc48043`
- Operation: `/opendata/t187ap03_P`

Swagger/OAS proves endpoint and schema documentation only. It does not prove payload semantic correctness, authorize ingestion, authorize fallback, or authorize production publication.

## Enrichment and identity restrictions

The 94025 fixture creates the coverage set first. 28567 profiles are joined only by an exact `companyCode` match against that set. Missing codes are reported as unmatched; multiple 28567 profiles for one code are reported as ambiguous and excluded from `matched`. No 28567-only row can enter the enrichment output.

28567 must never be used to assert `isEmerging`, `currentlyEmerging`, `emergingStatus`, `marketStatus` or `listingStatus`, and must not announce new or terminated emerging companies. It is an enrichment source, not a complete current emerging-company roster.

## Resource and dataset status recommendation

| Scope | Recommendation | Permitted use |
| --- | --- | --- |
| CSV resource | `VERIFIED_FOR_IMPLEMENTATION` candidate | Sole future primary resource after manual registry amendment |
| OpenAPI resource | `SUSPENDED` | Schema/operation drift comparison only; no ingest or fallback |
| Dataset 28567 | `APPROVED_FOR_V1_DESIGN` | Design and verification only; no production publication |

## Remaining risks and approval gate

The CSV still requires manual confirmation that the current resource remains the exact dataset resource and that attribution text is acceptable. Daily schema drift, row-count changes and identity anomalies require monitoring after adapter implementation. The malformed OpenAPI response requires provider-side clarification and remains suspended.

This recommendation should proceed to a separate Source Registry amendment review. This document itself does not modify the Registry, create an adapter, or approve production.
