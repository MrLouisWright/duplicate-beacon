# duplicate-beacon

> Detect duplicate and near-duplicate titles, meta descriptions and page bodies across your built static site.

Duplicate content splits ranking signals and makes search engines pick a URL for you. It usually comes from templates: every product page titled "Widgets | Acme", one meta description pasted into twenty pages, a print or AMP copy of every article, tag pages that are 95% the same. `duplicate-beacon` compares every built page with every other one, skipping pages that are `noindex` or already canonicalised elsewhere, and reports each group with the files, severity and a **concrete fix**.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Titles:** exact duplicates, and titles that only differ by the site name once the common ` | Brand` suffix or prefix is removed.
- **Meta descriptions:** exact duplicates, near-duplicates (template text with a word swapped), and descriptions that just repeat the title.
- **Bodies:** identical main content, and near-duplicates using 5-word shingles with MinHash/LSH candidate search and exact Jaccard similarity (`--threshold`, default 0.9). Navigation, header, footer and aside are left out of the main-content comparison.
- **Boilerplate:** pages whose text is mostly shared with many other pages (info).
- Scales to thousands of pages without quadratic body comparisons.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides, GitHub Action with job summary.

### Scope

duplicate-beacon compares pages inside one build. Canonical tag correctness is covered by canonical-beacon and repeated H1s by heading-beacon.

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `duplicate-body` | high | Pages have identical main content |
| `duplicate-title` | high | Pages share the same <title> |
| `near-duplicate-body` | medium | Pages have near-identical main content (similarity at or above the threshold) |
| `duplicate-description` | medium | Pages share the same meta description |
| `near-duplicate-title` | low | Titles are identical once the shared site-name suffix/prefix is removed |
| `near-duplicate-description` | low | Meta descriptions are near-identical (template text with one word changed) |
| `title-equals-description` | low | Meta description just repeats the title |
| `duplicate-template-heavy` | info | Most of the page text is boilerplate shared with many other pages |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx duplicate-beacon dist
npx duplicate-beacon dist --threshold 0.85 --fail-on medium
npx duplicate-beacon public --ignore "/tags/**,/page/*" --min-words 80
npx duplicate-beacon out --format json > duplicates.json
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
duplicate-beacon — /workspace/duplicate-beacon/test/fixtures/bad
11 page(s); 11 compared (noindex and canonicalised pages excluded)

HIGH     b.html 2 pages share the title "Widgets | Acme": /a.html, /b.html [duplicate-title]
         ↳ fix: Give each page a unique, descriptive <title>.
HIGH     b.html 2 pages have identical main content: /a.html, /b.html [duplicate-body]
         ↳ fix: Consolidate them into one page, or point duplicates at the original with rel=canonical (or noindex them).
MEDIUM   b.html 2 pages share the meta description "Buy widgets online from Acme today at low prices.": /a.html, /b.html [duplicate-description]
         ↳ fix: Write a unique description for each page, or remove it and let search engines generate one.
MEDIUM   c.html /a.html and /c.html are 94% similar [near-duplicate-body]
```

## Options

```text
duplicate-beacon 1.0.0 — detect duplicate and near-duplicate titles, descriptions and page bodies

Usage: duplicate-beacon [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Checks
      --threshold <0-1>        Similarity for near-duplicate bodies (default 0.9)
      --min-words <n>          Ignore bodies shorter than n words (default 50)
      --ignore <globs>         Pages to leave out of the comparison
      --no-template-check      Do not report boilerplate-heavy pages

Common
  -c, --config <file>     JSON config (default: .duplicate-beacon.json or "duplicateBeacon" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.duplicate-beacon.json` (or a `"duplicateBeacon"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "duplicate-body": "low"
  },
  "allowlist": [
    {
      "rule": "duplicate-title",
      "subject": "/variants/*",
      "reason": "Colour variants share a title until the PIM migration",
      "expires": "2027-03-31"
    }
  ],
  "threshold": 0.9,
  "minWords": 50,
  "ignore": [
    "/tags/**"
  ]
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.duplicate-beacon.json` can live at your repository root. Other keys: `threshold`, `minWords`, `ignore`, `descriptionThreshold` (default 0.6), `"templateCheck": false`, `templateShare` (default 0.3) and `templateRatio` (default 0.8).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  duplicate-beacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/duplicate-beacon@v1
        with:
          path: dist
          fail-on: high
          sarif: duplicate-beacon.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: duplicate-beacon.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, shingles, jaccard } from "duplicate-beacon";
const report = check("dist", { threshold: 0.85 });
jaccard(shingles(a), shingles(b)); // 0..1
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Licence

MIT © Louis Wright. See [LICENSE](LICENSE).
