# secretcv-cli

CLI for searching jobs on [secretcv.com](https://www.secretcv.com) (Turkey).

**Base URL**: `https://www.secretcv.com/`
**Authentication**: None required.
**Format**: Server-rendered HTML. Listing cards are parsed from the page; posting details come from the page's `JobPosting` JSON-LD plus its attribute table. The CLI emits clean JSON.
**Politeness**: honest User-Agent (`ai-job-search-secretcv-cli/1.0 ...`), 1.2 s between requests, at most 2 requests per `search`, robots.txt checked before every request, no query-string URLs at all. See `../url-reference.md`.

---

## Installation

```bash
cd .agents/skills/secretcv-search/cli
bun install
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search listings by position/keyword, city, district, work type or sector |
| `detail` | Fetch one posting by numeric id or URL |

All commands accept `--format` (`search`: `json|table|plain`, `detail`: `json|plain`; default `json`).
Errors go to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

---

## `search`

```bash
bun run src/cli.ts search [flags]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--query` / `-q` | string | | Position or keyword (`garson`, `"yazılım geliştirici"`) |
| `--city` / `-c` | string | | İl (`istanbul`, `istanbul-avrupa`, `izmir`, `muğla`) |
| `--district` / `-d` | string | | İlçe, needs `--city`, not combinable with `--query` |
| `--type` / `-t` | string | | `remote`, `home-office`, `hybrid`, `full-time`, `part-time`, `intern`, `new-grad`, `blue-collar`, `seasonal`, `project`, `flexible`, `live-in`, `disabled`, `ex-convict`, `veteran-family` |
| `--sector` / `-s` | string | | Sector slug (`bilgisayar-bt-internet`, `restorancilik` ...) |
| `--page` | number | `1` | Only `1` (pagination is `?sf=N`, disallowed by robots.txt) |
| `--limit` | number | | Cap results (client-side) |
| `--format` | string | `json` | `json`, `table`, `plain` |

Valid combinations: `query`; `query` + one of `city|type|sector`; `city`; `type`; `sector`; `city` + `district`; `type` + `city`.

### Response shape

```json
{
  "meta": {
    "total": 25,
    "page": 1,
    "perPage": 20,
    "hasMore": true,
    "url": "https://www.secretcv.com/is-ilanlari/izmir/garson-is-ilanlari",
    "appliedFilters": [
      { "type": "sh", "label": "İzmir" },
      { "type": "p", "label": "Garson" }
    ],
    "warnings": []
  },
  "results": [
    {
      "id": "1874094",
      "title": "Barista - Starbucks İzmir Narlıdere",
      "company": "Starbucks",
      "location": "İzmir",
      "districts": "Narlıdere",
      "postedText": "2 gün önce",
      "date": "2026-11-05",
      "url": "https://www.secretcv.com/..."
    }
  ]
}
```

- `appliedFilters[].type`: `sh` city, `ilc` district, `p` position, `k` keyword, `it` work type, `s` sector. This is what the site really applied.
- `warnings`: set when a query was a free-text keyword and a second filter had to be applied locally (or could not be applied).
- `date`: approximate ISO date derived from the relative `postedText`.

---

## `detail`

```bash
bun run src/cli.ts detail <id|url> [--format json|plain]
```

A bare id is fetched as `/ilan/{id}`, which redirects to the canonical posting URL.

### Response shape

```json
{
  "id": "1883754",
  "title": "Bilgi Teknolojileri Uzmanı",
  "company": "Mge Akaryakıt",
  "companyUrl": "https://www.secretcv.com/firma/mge-akaryakit-is-ilanlari",
  "location": "Muğla",
  "districts": null,
  "employmentType": "Tam Zamanlı",
  "sector": "Bilgisayar / BT / Internet",
  "education": "Yüksek Okul (Mezun), Üniversite (Mezun), ...",
  "referenceNo": null,
  "foreignNationalsAccepted": "Hayır",
  "datePosted": "2026-11-05",
  "deadline": "2027-01-01",
  "applyUrl": "https://www.secretcv.com/giris-yap?redirect=1&ilanId=1883754",
  "applyRequiresLogin": true,
  "applyPhone": null,
  "url": "https://www.secretcv.com/mge-akaryakit/bilgi-teknolojileri-uzmani-is-ilanlari-1883754",
  "description": "İş Açıklaması:\n\n..."
}
```

`applyPhone` is the employer's published application phone line when the posting lists one.

---

## Error codes

| Code | Meaning |
|------|---------|
| `MISSING_REQUIRED` | No filter given / no id given |
| `INVALID_ARGUMENT` | Unknown city, type or sector; bad number |
| `INVALID_COMBINATION` | Filter combination the site cannot express by path |
| `PAGINATION_DISALLOWED` | `--page` above 1 |
| `ROBOTS_DISALLOWED` | URL or a redirect hop blocked by robots.txt or our no-query-string policy (checked before the hop is requested); also a `--query` slug starting with `ara` |
| `NOT_FOUND` | 404/410, usually an expired posting |
| `BLOCKED` | Cloudflare challenge page. Skip the portal or use WebSearch; do not retry. |
| `PARSE_ERROR` | Page layout not recognised |
| `API_ERROR` | Other HTTP failure |

## Tests

```bash
bun test          # offline: parsing fixtures + flag/robots validation (fetch is mocked)
bun run typecheck
```

Fixtures in `tests/fixtures/` are trimmed copies of real pages captured 2026-11-07, with scripts, images and phone numbers removed.
