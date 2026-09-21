# CB source review quarantine

These offline parsers and the filing candidate review CLI are research only.
They must not be imported by production application, ingestion, refresh, or
publication code. They do not grant source approval, download market data, or
publish filing identity matches. The CLI emits `publishable: false` and stores
results in the ignored `.cache/cb-filing-review` directory.

The prior untracked implementation was relocated here on 2026-09-21 to keep
unapproved source references outside production roots without relaxing the
production source registry or quarantine tests. Unit tests remain in tests/.

Before any production integration, verify resource-specific reuse permission,
add the normal reviewed source contract, and independently verify CB identities.
