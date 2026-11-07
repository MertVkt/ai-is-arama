---
name: iskur-search
version: 1.0.0
description: >
  Make sure to use this skill whenever the user wants to search Turkish job listings on
  İŞKUR (Türkiye İş Kurumu), the official Turkish public employment agency, or asks about
  government-registered job vacancies in Turkey, even if they don't name İŞKUR explicitly.
  Covers private-sector (özel sektör) ads and public-sector worker hiring (kamu işçi alımı)
  published on esube.iskur.gov.tr, filterable by il (province), occupation, education and date.
  Trigger phrases include: İŞKUR ilanları, İŞKUR iş ilanları, İŞKUR'da iş ara, iskur ilan,
  açık iş ilanları, devlet iş ilanı, kamu iş ilanı, kamu işçi alımı, belediye iş ilanı,
  işçi alım ilanları, e-şube iş ilanları, iş kurumu ilanları, iş ara, iş ilanı ara,
  İzmir iş ilanları, İstanbul iş ilanları, Ankara iş ilanları, il bazında iş ilanı,
  yazılım iş ilanı, mühendis iş ilanı, muhasebe iş ilanı, tam zamanlı iş, yarı zamanlı iş,
  son başvuru tarihi, ilan no, iskur jobs, Turkish employment agency jobs, Turkey job search,
  government jobs Turkey, public sector jobs Turkey, jobs in Istanbul, jobs in Izmir,
  jobs in Ankara, job vacancies Turkey, find a job in Turkey.
context: fork
allowed-tools: Bash(bun run .agents/skills/iskur-search/cli/src/cli.ts *)
---

# İŞKUR Search Skill

Search live public job listings ("Açık İş İlanları") from İŞKUR e-Şube, the job board of
Türkiye İş Kurumu (Turkish Employment Agency). No account and no login are used: the CLI
submits the same public search form a visitor uses and reads the result table. It never
logs in, never uses e-Devlet and never tries to get past a captcha or bot check.

**Always present results to the user in Turkish** (job titles, places and dates are already
Turkish in the data; write your summary, column headers and advice in Turkish too).

## When to use this skill

Invoke this skill when the user wants to:

- Search İŞKUR job ads by keyword (pozisyon, meslek, beceri, firma)
- Filter by il (province), occupation code, education level, posting date
- See public-sector worker ads (kamu işçi alımı: belediyeler, kamu kurumları)
- Read the full text of one İŞKUR ad (iş tanımı, nitelikler, öğrenim şartı)
- Find an İŞKUR occupation code or a province code

## Commands

### Search job ads

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q` : free text, e.g. `yazılım`, `muhasebe`, `forklift`
- `--il <code|name>` : province as plate code (`35`) or name (`izmir`, `İstanbul`)
- `--sector ozel|kamu` : `ozel` (private sector, default) or `kamu` (public sector)
- `--meslek-kodu <code>` : İŞKUR occupation code from the `meslek` command
- `--posted all|24h|7d|15d` : posting date window (default `all`)
- `--education <level>` : `okur-yazar-olmayan`, `okur-yazar`, `ilkokul`, `ilkogretim`, `lise`, `onlisans`, `lisans`, `yuksek-lisans`, `doktora`
- `--work-type tam|kismi` : full or part time (ozel only)
- `--period daimi|gecici` : permanent or temporary (kamu only)
- `--ilan-turu genel|engelli|eski-hukumlu|tmy` : public ad type (kamu only)
- `--employer <text>` : employer name contains text (names are only shown for kamu ads)
- `--ilan-no <number>` : one exact ad number
- `--page <n>` : page number, 15 results per page (server fixed), max 100
- `--pages <n>` : fetch n consecutive pages in one call (max 5)
- `--limit <n>` : cap results the CLI outputs
- `--format json|table|plain`

### Full ad detail

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts detail <ilanNo|url> [--summary on|off] [--format json|table|plain]
```

Accepts `00009890180`, `9890180` or the full `AcikIsIlanDetay.aspx?uiID=...` URL. Returns the
job description, qualifications, occupation with required experience and education range.
With `--summary on` (default) it also looks the ad up by number to add location, deadline,
sector, work type and open positions, because the public detail page does not show them.

### Lookups

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts iller [--filter <text>]          # province codes, offline
bun run .agents/skills/iskur-search/cli/src/cli.ts meslek --query <3+ letters>      # occupation codes
```

---

## How to use effectively

**Free text first, occupation code for precision.** `--query` matches position, occupation,
skill and company text and can be broad (a query for `yazılım` also returns other technical
roles). When the user wants one exact occupation, look up its code with `meslek` and pass
`--meslek-kodu`.

**Natural workflow: `search` then `detail`.**
1. `search` to list ads and their `id` (ilan no).
2. `detail <id>` for the full text of the ones the user cares about.

**Private vs public sector.** The two are separate searches on İŞKUR. Use `--sector kamu`
for public-sector worker ads (often few, short deadlines, kura based). Run both when the user
asks generally about "İŞKUR ilanları".

**Employer names.** İŞKUR hides the employer name of private-sector ads from visitors who are
not logged in (`employer: null`). Public-sector ads show it. Tell the user that the employer
name is visible after logging in to e-Şube themselves; do not try to log in.

**Applying.** Applications happen on esube.iskur.gov.tr after the user logs in (or via e-Devlet,
İŞKUR offices, Alo 170). Give the ad URL and let the user apply; never apply for them.

**Be polite to the server.** Each search is 2 requests plus 1 per extra page, with a delay
between requests. Prefer `--limit` and narrow filters over fetching many pages.

---

## Usage examples

### Software jobs in İzmir, newest week

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts search -q yazılım --il izmir --posted 7d --format table
```

### Exact occupation nationwide

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts meslek -q "yazılım müh" --format table
bun run .agents/skills/iskur-search/cli/src/cli.ts search --meslek-kodu 6440 --format table
```

### Public-sector worker ads in Ankara

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts search --sector kamu --il 6 --format table
```

### Part-time jobs for university graduates in İstanbul, pages 1-2

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts search --il istanbul --work-type kismi --education lisans --pages 2 --format table
```

### Read one ad

```bash
bun run .agents/skills/iskur-search/cli/src/cli.ts detail 00009890180 --format plain
```

---

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. Data processing, passing ids to `detail` |
| `table` | Quick overview: ilan no, meslek, il / ilçe, tür, çalışma şekli, pozisyon, son başvuru |
| `plain` | Reading one ad (`detail`) or a readable list |

Search result fields: `id`, `title`, `employer`, `sector`, `period`, `workType`,
`openPositions`, `applicationScope` (İl/İlçe/Ülke Geneli Başvuru), `province`, `district`,
`location`, `deadline` (ISO date), `daysLeft`, `url`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits
with code `1`. Codes: `INVALID_FLAG`, `INVALID_ID`, `MISSING_REQUIRED`, `NOT_FOUND`,
`BLOCKED` (HTTP 403 or 429, or a captcha / bot check page; the CLI stops on the first such
response without retrying, so report it to the user and do not rerun it in a loop),
`ROBOTS_DISALLOWED`, `NETWORK_ERROR`, `PARSE_ERROR`, `API_ERROR`.

---

## Notes

- Source: `https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx` (public, robots.txt allows it).
  See `url-reference.md` for the form fields and codes.
- Every request URL, including each redirect hop, is checked against robots.txt (the only
  disallowed prefix is `/Meslek/ViewMeslekDetayPopUp.aspx/`) and must be on
  `esube.iskur.gov.tr`, otherwise the CLI stops with `ROBOTS_DISALLOWED`. Redirects are
  followed by hand, at most 3 hops.
- Retries: only network errors and HTTP 5xx are retried (up to 3 times, exponential backoff).
  HTTP 403/429 and captcha pages are `BLOCKED` at once. A search page that lacks the search
  form is reported as `PARSE_ERROR`, never as an empty result.
- Only domestic (Yurtiçi) ads are searched. İlçe filtering is not exposed.
- `daysLeft` is the server's countdown text at fetch time; `deadline` is the stable value.
- The detail page has no location or deadline; that is why `detail` does a lookup by ilan no.
- Kariyer Kapısı (kariyerkapisi.cbiko.gov.tr, civil-servant hiring) is not covered by this skill.
