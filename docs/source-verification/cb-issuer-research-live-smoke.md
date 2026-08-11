# CB issuer research final live-smoke evidence

Retrieval timestamp: `2026-08-11T05:41:43.350Z`

Provider: Financial Supervisory Commission, Securities and Futures Bureau.

License: Taiwan Open Government Data License, version 1.0 (OGL 1.0); both datasets are free to use subject to attribution.

Metadata pages:

- Listed monthly revenue: https://data.gov.tw/dataset/18420
- OTC monthly revenue: https://data.gov.tw/dataset/56510

The one-shot smoke issued one concurrent manual-redirect GET to each exact URL. It used the central request policy, a 2,000,000-byte cap, fatal UTF-8 decoding, the strict reviewed 14-field CSV parser, signed current-month revenue normalization, exact four-digit issuer-code joins, and code-bound official-name aliases. It made no retry, fallback, alternate URL, browser request, cookie, authentication request, or third-party request. No response body or row was printed or stored.

Active-CB context: reviewed generation `generations/d9560508d9dceb87`, 385 active bonds and 310 unique exact issuer codes.

## Independent resource results

| Evidence | Listed | OTC |
| --- | --- | --- |
| Source ID | `data-gov-18420-listed-monthly-revenue` | `data-gov-56510-otc-monthly-revenue` |
| Resource ID | `data-gov-18420-listed-monthly-revenue-csv` | `data-gov-56510-otc-monthly-revenue-csv` |
| Requested/final URL | `https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv` / exact | `https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv` / exact |
| HTTP / MIME | 200 / `text/csv` | 200 / `text/csv` |
| Response bytes | 199675 | 165766 |
| SHA-256 | `839a3526663292df8db574f0dbbca0690ff22d2cbb3175fe9a471256f2163f8a` | `75531b69ce9daf23d48f9aaac7908e833c49fdf2bcc8fbf69599ca41187fa79c` |
| Strict row count | 1069 | 890 |
| Newest revenue month | `2026-07` | `2026-07` |
| Newest source-published date | `2026-08-11` | `2026-08-11` |
| Active issuer evidence | 159 matched; 150 missing; 1 name conflict | 147 matched; 161 missing; 2 name conflicts |
| Duplicate source identities | 0 | 0 |
| Warnings | none | none |
| Independent outcome | PASS | PASS |

Overall result for both resources: PASS.

The newest source period/date is not later than retrieval. Every match and name conflict above was evaluated with exact issuer code plus a code-bound official alias; there was no name-only join and no market borrowing. Missing coverage is explicit and is not interpreted as a listing, delisting, or other market-status event.

## Signed current-month revenue correction

The first one-shot smoke at `2026-08-11T05:21:18.716Z` failed both sources because the official data included negative current-month revenue values. A separate controller-authorized diagnostic capture proved that all 14 headers remained exact and identified `currentMonthRevenue must be non-negative` as the only reported contract rejection. The source contract was corrected under tests to preserve official signed current-month revenue without widening comparative or cumulative revenue. The final smoke above is the only post-correction final-smoke invocation.

## Residual aggregate limitation

The compact final-smoke result intentionally retained no company codes or response body. It proves complete per-resource exact-code coverage partitions and name-conflict counts, but it cannot retrospectively prove that the same exact issuer code did not appear in both resources. The production snapshot builder still rejects such a code as `CROSS_MARKET_CONFLICT`; this evidence does not claim that count is zero. A future smoke revision should emit a redacted cross-market overlap count before fetching again.
A formal refresh must inspect the runtime diagnostics. Before website publication, every cross-market conflict must be excluded from issuer records and surfaced as an explicit diagnostic rather than borrowed from either market.

## Approval boundary

Each resource passed URL, status, MIME, size, UTF-8, exact schema, signed value, time plausibility, duplicate identity, and per-resource exact-code/name checks independently. Runtime use is limited to issuer-research monthly revenue. Failure remains isolated by market, prior published data may be marked stale, and one market must never borrow from the other. Absence and conflict must remain explicit.

Attribution in the product must identify the provider, dataset, OGL 1.0, source-published month/date, and site retrieval time. Full source notes, raw CSV, company names used only for validation, and response bodies are not publication artifacts.
