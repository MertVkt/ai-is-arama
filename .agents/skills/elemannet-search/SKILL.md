---
name: elemannet-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Turkey on eleman.net,
  or asks for blue-collar, retail, service, hospitality, restaurant, warehouse,
  security, cleaning, driver, sales or SME job listings in a Turkish city or district,
  even if they do not mention eleman.net by name. Also use it to fetch the full text
  of an eleman.net posting. Trigger phrases include: eleman.net, eleman.net'te iş ara,
  eleman net iş ilanları, iş ilanı ara, iş ara, iş bul, garson ilanı, garson iş ilanları,
  komi ilanı, aşçı ilanı, kasiyer ilanı, barista ilanı, depo elemanı ilanı, kurye ilanı,
  şoför ilanı, güvenlik görevlisi ilanı, temizlik personeli ilanı, satış temsilcisi ilanı,
  mağaza personeli, part time iş ilanları, yarı zamanlı iş, öğrenciye iş, emekliye iş,
  acil iş ilanları, maaşı açık ilanlar, engelli iş ilanları, staj ilanı, Bodrum'da iş,
  Muğla iş ilanları, İzmir'de iş, İstanbul iş ilanları, Ankara'da iş, Antalya'da iş,
  sezonluk otel işi, restoran işi, mavi yaka iş, jobs in Turkey, job search Turkey,
  waiter jobs Turkey, part-time jobs Istanbul, jobs in Bodrum, blue collar jobs Turkey,
  retail jobs Izmir, hospitality jobs Antalya.
context: fork
allowed-tools: Bash(bun run .agents/skills/elemannet-search/cli/src/cli.ts *)
---

# eleman.net Search Skill

Search live Turkish job listings on [eleman.net](https://www.eleman.net), a large Turkish job board that is strongest for blue-collar, retail, service, hospitality and SME jobs. No authentication needed.

**Language:** present all results to the user in **Turkish** (job titles, company names and locations stay exactly as the site writes them). Use English only if the user writes in English.

## Important: how search works on eleman.net

eleman.net's own free-text search (`/is-ilanlari?aranan=...`) is marked `noindex, nofollow` by the site and is not used. The CLI only reads the clean, crawlable **listing paths** (see `url-reference.md`):

- position: `/is-ilanlari/garson`
- city (il) or district (ilçe): `/is-ilanlari/izmir`, `/is-ilanlari/bodrum`
- any **two** of city, position, filter: `/is-ilanlari/mugla/garson`, `/is-ilanlari/bodrum/yari-zamanli-part-time`

So there is **no free keyword search**. Map the user's wish to a Turkish **position name** (`garson`, `asci`, `kasiyer`, `satis-temsilcisi`, `depo-elemani`...) plus a **city/district**, then narrow with `--keyword` (client-side filter over the fetched cards). If the site does not know a slug, the CLI exits with `UNKNOWN_SLUG`; retry with a more common Turkish position name or with the il instead of a small ilçe.

## Commands

### Search listings

```bash
bun run .agents/skills/elemannet-search/cli/src/cli.ts search [flags]
```

| Flag | Description |
|------|-------------|
| `--position` / `-p` | Position name or slug, e.g. `garson`, `"satış temsilcisi"`, `barista` (Turkish letters are slugified for you) |
| `--city` / `-c` | İl or ilçe, e.g. `izmir`, `muğla`, `bodrum`, `kadıköy`, `istanbul-avrupa` |
| `--filter` / `-f` | One of `part-time`, `full-time`, `urgent` (acil), `salary` (maaşı açık), `benefits` (yan haklı), `phone` (telefonla başvuru), `disabled` (engelli), `student`, `retired`, `intern` (staj) |
| `--keyword` / `-k` | Client-side filter: every word must appear in title, company, location, benefits or snippet |
| `--page` | First page (1-indexed, about 30 postings per page) |
| `--pages` | Pages to fetch in one call, 1 to 5 (default 1) |
| `--limit` | Cap results returned |
| `--format` | `json` (default), `table`, `plain` |

At least one of `--position`, `--city`, `--filter` is required, and at most two of them can be combined (the site supports only two path segments).

### Fetch full posting

```bash
bun run .agents/skills/elemannet-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric id from search (e.g. `4802953`); a full `https://www.eleman.net/is-ilani/...-i4802953` URL also works. Returns title, company, location, datePosted, validThrough, employment type, salary (when public), benefits (yan haklar), experience, gender, age range, openings, whether the employer takes phone applications, the apply link and the full description.

## How to use effectively

1. Translate the request into position + city. "Bodrum'da garson işi" becomes `-c bodrum -p garson`. "İzmir'de part time" becomes `-c izmir -f part-time`.
2. If a combination returns 0 results (small districts often do), widen: drop to the il (`-c mugla -p garson`), or search the district alone and use `--keyword garson`.
3. For broader recall, fetch more pages with `--pages 3` (max 5) and filter with `--keyword`.
4. Call `detail` for the 2 to 5 most relevant postings before advising the user; search cards do not carry dates or salary.
5. Applying: the `applyUrl` requires a logged-in eleman.net candidate account (özgeçmiş). Give the link to the user to open themselves; never try to fetch or submit it. If `phoneApplication` is true, tell the user the phone number is visible on the site after login.

## Examples

```bash
# Garson ilanları in Muğla
bun run .agents/skills/elemannet-search/cli/src/cli.ts search -c muğla -p garson --format table

# Everything in Bodrum, first 2 pages
bun run .agents/skills/elemannet-search/cli/src/cli.ts search -c bodrum --pages 2 --format table

# Part time jobs in İzmir
bun run .agents/skills/elemannet-search/cli/src/cli.ts search -c izmir -f part-time --format table

# Satış temsilcisi in İstanbul Avrupa, only Beşiktaş
bun run .agents/skills/elemannet-search/cli/src/cli.ts search -c istanbul-avrupa -p "satış temsilcisi" --pages 3 -k beşiktaş

# Full posting
bun run .agents/skills/elemannet-search/cli/src/cli.ts detail 4802953 --format plain
```

## Output and errors

`search` JSON: `{ meta: { listing, url, page, lastPageFetched, totalPages, perPage, count, fetched }, results: [{ id, title, company, location, benefits, badges, url, description }] }`. `badges` are the site's own markers such as `Maaş Bilgisi Olan`, `Acil İlan`, `Telefonla başvuru yapabilirsiniz.`

Errors go to stderr as `{ "error": "...", "code": "..." }` with exit code 1. Codes: `MISSING_REQUIRED`, `INVALID_ARGUMENT`, `INVALID_COMBINATION`, `UNKNOWN_SLUG`, `NOT_FOUND`, `ROBOTS_DISALLOWED`, `BLOCKED`, `API_ERROR`, `PARSE_ERROR`.

**`BLOCKED`** means eleman.net served a Cloudflare bot challenge. Do not retry and do not try to work around it: tell the user the portal is unavailable right now and fall back to WebSearch (e.g. `site:eleman.net garson bodrum`).

## Notes

- The CLI checks every URL against eleman.net's robots.txt before fetching (redirects are followed manually, at most 3 hops, and each `Location` is checked before it is requested), sends an identifiable User-Agent, waits 1.2 s between requests and fetches at most 5 pages per call.
- Locations like `Türkiye Geneli - Tüm ilçeler` mean a nationwide or remote posting that the site also lists under every city.
- Search cards have no posting date; use `detail` for `datePosted` and `validThrough`.
