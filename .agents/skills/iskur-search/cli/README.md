# iskur-cli

CLI for the public open job listings ("Açık İş İlanları") of [İŞKUR e-Şube](https://esube.iskur.gov.tr),
the job board of Türkiye İş Kurumu.

**Base URL**: `https://esube.iskur.gov.tr`
**Authentication**: None. The CLI never logs in and never uses e-Devlet.
**Format**: HTML (ASP.NET WebForms). The CLI submits the public search form, parses the result
table and emits clean JSON.

---

## Installation

```bash
cd .agents/skills/iskur-search/cli
bun install
```

---

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search open job ads |
| `detail` | Full detail for one ad |
| `iller` | Province codes for `--il` (offline) |
| `meslek` | Occupation codes for `--meslek-kodu` |

All commands accept `--format json|table|plain` (default: `json`).
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

---

## `search`

**Endpoint**: `GET` then form `POST` to `/Istihdam/AcikIsIlanAra.aspx` (ViewState postback)

```bash
bun run src/cli.ts search [flags]
```

| Flag | Description |
|------|-------------|
| `--query`, `-q` | Free text (position, occupation, skill, company) |
| `--il` | Province plate code or name (`35`, `izmir`) |
| `--sector` | `ozel` (default) or `kamu` |
| `--meslek-kodu` | Occupation code from `meslek` |
| `--posted` | `all` (default), `24h`, `7d`, `15d` |
| `--education` | `okur-yazar-olmayan`, `okur-yazar`, `ilkokul`, `ilkogretim`, `lise`, `onlisans`, `lisans`, `yuksek-lisans`, `doktora` |
| `--work-type` | `tam` / `kismi` (ozel only) |
| `--period` | `daimi` / `gecici` (kamu only) |
| `--ilan-turu` | `genel`, `engelli`, `eski-hukumlu`, `tmy` (kamu only) |
| `--employer` | Employer name contains |
| `--ilan-no` | Exact ad number |
| `--page` | Page (1-indexed, 15 per page, max 100) |
| `--pages` | Consecutive pages to fetch (max 5) |
| `--limit` | Cap output rows |

Output:

```json
{
  "meta": { "source": "esube.iskur.gov.tr", "total": 193, "totalPages": 13, "page": 1,
            "pagesFetched": [1], "pageSize": 15, "returned": 15, "criteria": { } },
  "results": [
    {
      "id": "00009890180",
      "title": "Üç Boyutlu Ölçüm (Cmm) Operatörü",
      "employer": null,
      "sector": "Özel",
      "period": "Daimi",
      "workType": "Tam Zamanlı",
      "openPositions": 1,
      "applicationScope": "İlçe Geneli Başvuru",
      "province": "KOCAELİ",
      "district": "ÇAYIROVA",
      "location": "İlçe Geneli Başvuru (KOCAELİ / ÇAYIROVA)",
      "deadline": "2026-12-04",
      "daysLeft": "27 Gün Kaldı",
      "url": "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009890180"
    }
  ]
}
```

`employer` is `null` for private-sector ads because İŞKUR only shows it to logged-in users.

---

## `detail`

**Endpoint**: `GET /Istihdam/AcikIsIlanDetay.aspx?uiID={id}`

```bash
bun run src/cli.ts detail 00009890180 --format plain
bun run src/cli.ts detail "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009887077"
```

Returns `description`, `qualifications`, `extraConditions`, `occupations[]` (with experience),
`educationMin`, `educationMax`, `url`, and `summary` (the matching search row, found by ilan no,
with location, deadline, sector and positions). `--summary off` skips that lookup.

---

## `iller` and `meslek`

```bash
bun run src/cli.ts iller --filter izm
bun run src/cli.ts meslek --query "yazılım müh" --format table
```

`meslek` calls `GET /api/meslekuzmanlikapi/meslekuzmanlik/{term}`, the same autocomplete the
public form uses.

---

## Politeness

- Honest User-Agent: `ai-job-search-iskur-cli/1.0 (...)`
- At least 1.2 s between requests, at most 3 retries with backoff on 5xx/network errors only
- HTTP 403/429 or a captcha / bot-check page stops at once with code `BLOCKED` (no retry); nothing is bypassed
- robots.txt guard on every request URL and redirect hop (`ROBOTS_DISALLOWED`), redirects followed manually (max 3)
- Hard caps: 5 pages per call, page 100 max

## Tests

```bash
bun test          # offline: fixture parsing + flag validation
bun run typecheck
```

Fixtures in `tests/fixtures/` are trimmed real responses with ViewState removed and contact
details anonymised.
