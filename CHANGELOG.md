# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Exact and site-name-only duplicate titles.
- Exact and near-duplicate meta descriptions; descriptions repeating the title.
- Identical and near-duplicate main content (5-word shingles, MinHash/LSH, Jaccard threshold).
- Boilerplate-heavy pages; noindex and canonicalised pages excluded.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
