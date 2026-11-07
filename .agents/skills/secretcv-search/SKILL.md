---
name: secretcv-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Turkish job listings on secretcv.com,
  find open positions in a Turkish city or district, look for remote, hybrid, part-time or
  internship jobs in Turkey, or read the full text of a secretcv.com posting, even if they
  do not mention secretcv by name. Trigger phrases include: iş ilanı ara, iş ilanları,
  secretcv'de ilan bul, secretcv iş ilanı, secretcv ilanları, İstanbul'da yazılım işi,
  İzmir'de garson ilanı, Ankara iş ilanları, Bodrum'da iş, uzaktan çalışma ilanı,
  evden çalışma işi, home office iş, hibrit iş ilanı, yarı zamanlı iş, part time iş,
  staj ilanı, yeni mezun ilanı, mavi yaka iş, ilan detayı, bu ilanı aç, iş bul,
  açık pozisyonlar, eleman aranıyor, find jobs in Turkey, Turkish job search,
  jobs in Istanbul, jobs in Izmir, jobs in Ankara, remote jobs Turkey, secretcv search,
  secretcv job posting, software developer jobs Istanbul.
context: fork
allowed-tools: Bash(bun run .agents/skills/secretcv-search/cli/src/cli.ts *)
---

# secretcv.com Search Skill

Search live Turkish job listings on [secretcv.com](https://www.secretcv.com) and read full postings. No account needed. The CLI only fetches URLs that secretcv.com's robots.txt allows, sends an honest User-Agent, waits 1.2 s between requests, and makes at most 2 page requests per search. Redirects are never followed blindly: each `Location` is checked against robots.txt and the no-query-string policy before it is requested, and at most 3 hops are followed.

**Always present results to the user in Turkish** (titles, companies and cities are already Turkish; write your summary, labels and advice in Turkish too).

## When to use this skill

- Find jobs by position or keyword, optionally in one city (il)
- Browse a city, a district (ilçe), a sector, or a work type (uzaktan, hibrit, part-time, staj, yeni mezun ...)
- Get the full description, company, location, dates and apply link of one posting

## Commands

### Search

```bash
bun run .agents/skills/secretcv-search/cli/src/cli.ts search [flags]
```

| Flag | Meaning |
|------|---------|
| `--query` / `-q` | Position or keyword, e.g. `"yazılım geliştirici"`, `garson`, `muhasebe` |
| `--city` / `-c` | İl, e.g. `istanbul`, `istanbul-avrupa`, `istanbul-anadolu`, `ankara`, `izmir`, `muğla` |
| `--district` / `-d` | İlçe inside `--city`, e.g. `bodrum`, `kadıköy` (only with `--city`, no `--query`) |
| `--type` / `-t` | `remote`, `home-office`, `hybrid`, `full-time`, `part-time`, `intern`, `new-grad`, `blue-collar`, `seasonal`, `project`, `flexible`, `live-in`, `disabled`, `ex-convict` (eski hükümlü), `veteran-family` (şehit yakını / terör mağduru) (Turkish slugs like `uzaktan-calisma`, `hibrit`, `staj`, `eski-hukumlu` also work) |
| `--sector` / `-s` | Sector slug, e.g. `bilgisayar-bt-internet`, `restorancilik`, `bankacilik-finans` (full list in url-reference.md) |
| `--limit` | Cap results (max 20 per search) |
| `--page` | Only `1` is accepted (see Limitations) |
| `--format` | `json` (default), `table`, `plain` |

Supported combinations (secretcv.com honours at most two path segments):

- `--query` alone, or `--query` plus **one** of `--city`, `--type`, `--sector`
- `--city`, `--type` or `--sector` alone
- `--city` + `--district`
- `--type` + `--city`

Anything else exits with `INVALID_COMBINATION`.

### Detail

```bash
bun run .agents/skills/secretcv-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric id from search results (e.g. `1883754`), or pass the full posting URL. A bare id is fetched as `/ilan/{id}`, which secretcv.com answers with a 302 to the canonical posting URL. Returns title, company, location, districts, employment type, sector, education level, posting date, deadline (`validThrough`), apply URL and the full description.

## How keyword search works (read this)

secretcv.com's own search form (`/is-ilanlari/ara?k=...`) is **disallowed** by robots.txt, so this skill does not use it. Instead it uses clean listing paths like `/is-ilanlari/{slug}-is-ilanlari`:

- If the slug is a known **position** (e.g. `garson`, `satis-danismani`), the site filters by that position, and it can be combined with a city, type or sector.
- If it is not a known position, the site treats it as a **free-text keyword** (e.g. `yazilim-gelistirici`, `muhasebe`). Keyword paths cannot be combined with a city by URL, so when you pass `--query` + `--city` and the query turns out to be a keyword, the CLI fetches the keyword-only page and filters by city locally. `meta.warnings` says so, and `meta.total` then counts all cities.
- Keyword matching is loose: a search for `yazılım geliştirici` also returns IT support, technical service and some unrelated roles. Read titles and use `detail` before recommending anything.
- **Queries starting with "ara" are refused.** robots.txt has the prefix rule `Disallow: /is-ilanlari/ara` (meant for the search form), so the listing path for any slug starting with `ara` (`araç şoförü` becomes `arac-soforu`, `araştırma görevlisi` becomes `arastirma-gorevlisi`) is disallowed too. The CLI exits with `ROBOTS_DISALLOWED` and says so explicitly. Use a synonym that does not start with "ara" (`şoför`, `sürücü`, `akademisyen`) or browse with `--sector` (e.g. `lojistik`, `egitim`) or `--city`. With `--city`/`--type`/`--sector` the two-segment URL is allowed, but if the site treats the query as a free-text keyword the keyword-only fallback is refused with the same error.
- Very specific tech keywords (`python`, `react`) often return 0 results. Try broader Turkish terms (`yazılım`, `yazılım geliştirici`, `bilgi işlem`, `bilgi teknolojileri`) or `--sector bilgisayar-bt-internet`.

Always check `meta.appliedFilters` (types: `sh` city, `ilc` district, `p` position, `k` keyword, `it` work type, `s` sector) and `meta.warnings` in JSON output to know what the site really applied.

## Workflow

1. `search` with the user's position/keyword and city (`--format json`).
2. If `total` is 0 or results look off, retry with a broader Turkish term or a sector.
3. `detail <id>` for the postings worth a closer look.
4. Summarise for the user **in Turkish**: unvan, firma, şehir/ilçe, çalışma şekli, ilan tarihi, son başvuru, link.

## Examples

```bash
# İzmir'de garson ilanları
bun run .agents/skills/secretcv-search/cli/src/cli.ts search -q garson -c izmir --format table

# İstanbul'da yazılım işi (keyword, city filtered locally)
bun run .agents/skills/secretcv-search/cli/src/cli.ts search -q "yazılım geliştirici" -c istanbul --format json

# Uzaktan çalışma ilanları
bun run .agents/skills/secretcv-search/cli/src/cli.ts search -t remote --format table

# İzmir'de uzaktan çalışma
bun run .agents/skills/secretcv-search/cli/src/cli.ts search -t remote -c izmir --format table

# Bodrum'daki ilanlar
bun run .agents/skills/secretcv-search/cli/src/cli.ts search -c muğla -d bodrum --format table

# IT sektörü
bun run .agents/skills/secretcv-search/cli/src/cli.ts search -s bilgisayar-bt-internet --format table

# İlan detayı
bun run .agents/skills/secretcv-search/cli/src/cli.ts detail 1883754 --format plain
```

## Output

JSON search output: `{ meta: { total, page, perPage, hasMore, url, appliedFilters, warnings }, results: [{ id, title, company, location, districts, postedText, date, url }] }`. `date` is approximate, computed from the relative "İlan Tarihi: 3 gün önce" text; use `detail` for the exact `datePosted`.

Errors go to stderr as `{ "error": "...", "code": "..." }` with exit code 1. Codes: `MISSING_REQUIRED`, `INVALID_ARGUMENT`, `INVALID_COMBINATION`, `PAGINATION_DISALLOWED`, `ROBOTS_DISALLOWED`, `NOT_FOUND`, `BLOCKED`, `PARSE_ERROR`, `API_ERROR`.

## Limitations

- **Only the first 20 results per search.** secretcv.com paginates with `/?sf=N`, which robots.txt disallows (`*/?sf=*`), and the page-size switch (`?l=50`) answers 410. Narrow the search (city, type, more specific position) instead of paging. `meta.hasMore` tells you more exist.
- No sort control (the sort parameter is a query string too); results come in the site's default relevance order.
- Three filters at once (e.g. position + city + remote) are not possible by URL.
- Applying requires a secretcv.com login: `applyUrl` points to the login page with the posting id (`applyRequiresLogin: true`). The CLI never opens it; give the user the posting `url` to apply in the browser.
- **If the CLI reports `BLOCKED`** (Cloudflare bot protection), treat secretcv.com as unavailable for this session and fall back to WebSearch. Do not retry and do not try to work around it.
