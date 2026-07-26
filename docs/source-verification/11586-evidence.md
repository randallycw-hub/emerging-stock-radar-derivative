# Dataset 11586 evidence and contract fixture

## Current registry stage

`APPROVED_FOR_V1_DESIGN`. This Task 4 commit does not upgrade the Source Registry. The fixture and tests provide implementation evidence to be reviewed by Task 8; they do not authorize a production adapter or production publication.

## Source roles

| Role | Evidence |
| --- | --- |
| Dataset metadata and license | Government Data Open Platform dataset 11586, `https://data.gov.tw/dataset/11586` |
| OAS / Swagger | TWSE OAS document, `https://openapi.twse.com.tw/v1/swagger.json` |
| Candidate CSV resource | `https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data` |
| Candidate OpenAPI endpoint | `https://openapi.twse.com.tw/v1/company/applylistingLocal` |
| Primary resource | `NOT_SELECTED`; CSV and OpenAPI are comparison-only in this Task |

The dataset page was checked on 2026-07-26 and states provider `金融監督管理委員會證券期貨局`, license `政府資料開放授權條款-第1版`, and free charge. It lists the CSV resource and the TWSE Swagger URL. The CSV GET returned HTTP 200, `text/csv;charset=utf-8`, 695 data rows, and response hash `sha256:8e7b9d81b54701dc75e3f0550cecd0f2d2968ddd09346935d46ed7108d58fd75`.

The OpenAPI GET returned HTTP 200, `application/json`, 695 records, and response hash `sha256:f15a53807561b1da17355d899c5a030beaac714905e8b249882a6329350ea3fd`. Swagger returned HTTP 200, `application/json`, and contains the `/company/applylistingLocal` operation; its response hash was `sha256:2c2cecccb7a220ac9e263228a7659aa49b1ada5aea397650e601ad3dfcc48043`.

The live OpenAPI response is not semantically aligned with its property names: the first record currently has `Code=1`, `Company=7843`, `ApplicationDate=英柏得`, `Chairman=1150724`, and `AmountofCapital =林傳生`. This is a field-shift/misalignment risk, so the endpoint is not eligible for `VERIFIED_FOR_IMPLEMENTATION`. The minimal Fixture remains an offline canonical contract sample and must not be described as a raw copy of the live response.

## Fixture files and metadata

- CSV fixture: `tests/fixtures/source-verification/11586/csv-minimal.csv`, two minimized rows.
- OpenAPI fixture: `tests/fixtures/source-verification/11586/openapi-minimal.json`, the same two rows.
- Metadata: `tests/fixtures/source-verification/11586/metadata.json`.
- Captured content type, row count, source/fixture SHA-256 and UTC review timestamps are recorded separately for both resources.
- The fixture contains company application milestones only. The raw `underwritingPrice` field is retained solely to prove the exclusion rule and is never emitted by the normalized model.
- No personal data is retained; the metadata privacy review lists excluded identity and contact fields.

## Raw-to-domain mapping

| Raw canonical field | Normalized field | Rule |
| --- | --- | --- |
| `sourceRecordId` | `sourceRecordId` | Stable TWSE record identity; required. |
| `companyCode` | `companyCode` | Trimmed non-placeholder text; required. |
| `companyName` | `companyName` | Trimmed non-placeholder text; required. |
| `applicationDate` | `applicationDate` | ROC, compact Gregorian or ISO date to `YYYY-MM-DD`. |
| `chairmanName` | `chairmanName` | Optional text; blank becomes `""`. |
| `applicationCapitalThousandsTwd` | `applicationCapitalThousandsTwd` | Non-negative decimal text; blank becomes `""`. |
| `listingReviewDate` | `listingReviewDate` | Optional calendar date. |
| `boardApprovalDate` | `boardApprovalDate` | Optional calendar date. |
| `listingContractApprovalOrFilingDate` | `listingContractApprovalOrFilingDate` | Optional calendar date. |
| `listingDate` | `listingDate` | Optional calendar date. |
| `underwriters` | `underwriters` | Pipe-separated names; blank becomes an empty array. |
| `underwritingPrice` | not emitted | Explicitly excluded from the normalized contract. |
| `note` | `note` | Preserved as a source note. |

Dates are calendar dates in Asia/Taipei semantics and are not converted through UTC.

## Contract checks

`tests/source-verification/source-11586.test.mjs` verifies:

1. CSV and OpenAPI canonical field parity.
2. Exact mapping of company, application and listing milestones.
3. JSON semantic field shifts are detected by resource comparison.
4. Blank optional dates and non-monotonic chronology are handled deterministically.
5. Duplicate company/application identities and unknown fields are rejected.
6. Fixture metadata, SHA-256 and row count integrity are verified offline.
7. Live endpoint evidence records the observed JSON field-shift risk; no adapter may consume it until manually resolved.

No `fetch`, adapter, fallback, repository, D1, API route, scheduler or published snapshot is used.
