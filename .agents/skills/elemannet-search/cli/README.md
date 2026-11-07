# elemannet-cli

CLI for searching jobs on [eleman.net](https://www.eleman.net), a Turkish job board strong in blue-collar, retail, service and SME jobs.

**Base URL**: `https://www.eleman.net/`
**Authentication**: None required.
**Format**: Server-rendered HTML. Listing cards are parsed from the HTML; detail pages are parsed from the embedded schema.org `JobPosting` JSON-LD plus the visible fact boxes.
**Politeness**: honest User-Agent (`ai-job-search-elemannet-cli/1.0 ...`), 1.2 s between requests, max 5 pages per `search`, robots.txt rules enforced in code. See `../url-reference.md`.

---

## Installation

```bash
cd .agents/skills/elemannet-search/cli
bun install
```

Dependencies: `@bunli/core`, `zod` (dev: `typescript`, `@types/bun`). No lifecycle scripts.

---

## Commands

| Command | Description |
|---------|-------------|
| `search` | List postings by position and/or city (path-based listing pages) |
| `detail` | Fetch one full posting |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

---

## `search`

**URL**: `GET https://www.eleman.net/is-ilanlari/{slug}[/{slug}][?sy={page}]`

```bash
bun run src/cli.ts search [flags]
```

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--position` / `-p` | string | none | Position name or slug (`garson`, `"satış temsilcisi"`) |
| `--city` / `-c` | string | none | İl or ilçe (`izmir`, `muğla`, `bodrum`) |
| `--filter` / `-f` | string | none | `part-time`, `full-time`, `urgent`, `salary`, `benefits`, `phone`, `disabled`, `student`, `retired`, `intern` |
| `--keyword` / `-k` | string | none | Client-side filter over title, company, location, benefits, snippet (all words must match, Turkish case rules) |
| `--page` | number | `1` | First page (1-indexed) |
| `--pages` | number | `1` | Consecutive pages to fetch (1 to 5) |
| `--limit` | number | none | Cap results (client-side) |
| `--format` | string | `json` | `json`, `table`, `plain` |

Rules: at least one of `--position`, `--city`, `--filter`; at most two of them together.

There is no free-text search: the site's own search results are `noindex, nofollow`, so the CLI sticks to the crawlable listing paths. Use `--keyword` to narrow.

### Examples

```bash
bun run src/cli.ts search -c muğla -p garson --format table
bun run src/cli.ts search -c bodrum --pages 2
bun run src/cli.ts search -c izmir -f part-time --limit 10
bun run src/cli.ts search -p garson --pages 3 -k karşıyaka
```

### Response shape

```json
{
  "meta": {
    "source": "eleman.net",
    "listing": "Bodrum iş ilanları & En Yeni Bodrum İş Fırsatları | Eleman.net",
    "url": "https://www.eleman.net/is-ilanlari/bodrum",
    "page": 1,
    "lastPageFetched": 1,
    "totalPages": 2,
    "perPage": 30,
    "count": 30,
    "fetched": 1
  },
  "results": [
    {
      "id": "4802755",
      "title": "Elektrik Teknik Elemanı",
      "company": "Cömert Elektrik A. Ş.",
      "location": "Muğla - Bodrum",
      "benefits": "Yemek, Yol Yardım Desteği, Servis",
      "badges": ["Maaş Bilgisi Olan", "Telefonla başvuru yapabilirsiniz."],
      "url": "https://www.eleman.net/is-ilani/elektrik-teknik-elemani-i4802755",
      "description": "TEKNİK SAHA PERSONELİ ARANIYOR Cömert Elektrik A.Ş. ..."
    }
  ]
}
```

**Field notes:**
- `id`: numeric string, pass to `detail`.
- `company`, `location`, `benefits`, `description`: may be `null`.
- `badges`: the site's markers (`Maaş Bilgisi Olan`, `Acil İlan`, `Telefonla başvuru yapabilirsiniz.`, `Şehit Yakını / Terör Mağduru İş İlanı`...).
- `totalPages`: `null` when the listing is empty.
- Cards carry no date or salary; use `detail`.

---

## `detail`

**URL**: `GET https://www.eleman.net/is-ilani/{slug}-i{id}`

```bash
bun run src/cli.ts detail <id|url> [--format json|plain]
```

Accepts `4802953`, `i4802953`, or a full `/is-ilani/` URL. A bare id is fetched as `/is-ilani/ilan-i{id}`, which the site 301-redirects to the canonical URL.

### Response shape

```json
{
  "id": "4802755",
  "title": "Elektrik Teknik Elemanı",
  "company": "Cömert Elektrik A. Ş.",
  "companyUrl": "https://www.eleman.net/firma/comert-elektrik-a-s-f2132493",
  "location": "Muğla - Bodrum",
  "datePosted": "2026-11-06",
  "validThrough": "2026-12-06",
  "employmentType": "Tam Zamanlı",
  "salary": "30.000 TL - 80.000 TL",
  "benefits": "Yemek, Yol Yardım Desteği, Servis",
  "experience": "3-4 Yıl",
  "gender": "Erkek",
  "ageRange": "20 - 45 arası",
  "openings": "5",
  "phoneApplication": true,
  "applyUrl": "https://www.eleman.net/aday/basvuru_yap.php?ilan_id=4802755",
  "url": "https://www.eleman.net/is-ilani/elektrik-teknik-elemani-i4802755",
  "description": "TEKNİK SAHA PERSONELİ ARANIYOR\n..."
}
```

**Field notes:**
- `datePosted`, `validThrough`: `YYYY-MM-DD` from JSON-LD. Some employers set `validThrough` a year out.
- `salary`: only when the employer made it public.
- `applyUrl`: needs a logged-in eleman.net candidate account. It is disallowed for crawlers by robots.txt (`*?ilan_id=*`), so the CLI prints it but never requests it.
- `phoneApplication`: employer accepts phone applications; the number is only visible after login.
- `description`: full text with line breaks preserved.

---

## Error codes

| Code | Meaning |
|------|---------|
| `MISSING_REQUIRED` | No position/city/filter, or no id for `detail` |
| `INVALID_ARGUMENT` | Bad number, unknown `--filter`, malformed id or non-eleman.net URL |
| `INVALID_COMBINATION` | More than two of position/city/filter |
| `UNKNOWN_SLUG` | Site did not recognise a slug and fell back to another listing |
| `NOT_FOUND` | Posting does not exist or was removed |
| `ROBOTS_DISALLOWED` | Target URL or a redirect hop is disallowed by robots.txt or off www.eleman.net (checked before the hop is requested) |
| `BLOCKED` | Cloudflare bot challenge. Do not retry; use a WebSearch fallback |
| `API_ERROR` | Other HTTP failure |
| `PARSE_ERROR` | Page did not look like a posting |

---

## Tests

```bash
bun test          # offline: fixtures in tests/fixtures + flag validation + robots guard
bun run typecheck
```

Fixtures are trimmed copies of real pages (head, a few cards, pager; detail body and JSON-LD only), captured 2026-11-07.
