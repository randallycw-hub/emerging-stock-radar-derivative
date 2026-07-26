# Dataset 11586 evidence and contract fixture

## Current registry stage

`APPROVED_FOR_V1_DESIGN`. This Task 4 commit does not upgrade the Source Registry. The fixture and tests provide implementation evidence to be reviewed by Task 8; they do not authorize a production adapter or production publication.

## Source roles

| Role | Evidence |
| --- | --- |
| Dataset metadata and license | Government Data Open Platform dataset 11586, `https://data.gov.tw/dataset/11586` |
| OAS / Swagger | TWSE OAS document, `https://openapi.twse.com.tw/v1/swagger.json` |
| Candidate CSV resource | `https://www.twse.com.tw/staticFiles/product/publication/11586.csv` |
| Candidate OpenAPI endpoint | `https://openapi.twse.com.tw/v1/company/applylistingLocal` |
| Primary resource | `NOT_SELECTED`; CSV and OpenAPI are comparison-only in this Task |

The exact dataset-page-to-resource evidence and licensing language remain a manual review item. No live request is made by the default tests.

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

No `fetch`, adapter, fallback, repository, D1, API route, scheduler or published snapshot is used.
