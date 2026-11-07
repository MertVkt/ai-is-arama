# Search Queries for Job Scraper

<!-- SETUP: /setup bu dosyayı senin pozisyonlarına, becerilerine ve konumuna göre doldurur -->

## Search Sites

Directly searched (CLI tools in `.agents/skills/`):
- **Secretcv** (`secretcv-search`): general board, white-collar and mid-level roles. Flags: `-q` keyword, `-c` il, `-d` ilçe, `-t` type (e.g. `remote`), `-s` sector
- **Eleman.net** (`elemannet-search`): strong for retail, hospitality, service, blue-collar and SME roles. Flags: `-p` position, `-c` il/ilçe, `-f` filter (e.g. `part-time`), `-k` local keyword filter
- **İŞKUR** (`iskur-search`): official employment agency listings, private-sector and public-sector (kamu) worker jobs. Flags: `-q` keyword, `--il`, `--sector ozel|kamu`, `--posted 15d`, `--meslek-kodu`
- **LinkedIn** (`linkedin-search`): use location like `-l "İstanbul, Türkiye"` or `-l "Türkiye"`, plus `--jobage 14`; personal use only, keep volume low
- **freehire.dev** (`freehire-search`): tech roles only, use `--country TR` or `--remote`, plus `--jobage 14`

Link-only (bot-protected, never fetched automatically; see the scraper skill Step 1d):
- **Kariyer.net**: `https://www.kariyer.net/is-ilanlari/<il>-<anahtar+kelime>`
- **Yenibiriş**: `https://www.yenibiris.com/is-ilanlari/<anahtar-kelime>`

Enabled for this user: [YOUR_PORTALS]

Secondary (company career pages via search engine):
- `site:` searches for known target companies' career pages, e.g. `site:kariyer.<company>.com` or `site:<company>.com.tr kariyer`

## Query Categories

Queries are grouped by priority. Combine each query with the location terms below where the portal supports it. Write job titles the way Turkish postings write them (often Turkish, sometimes English for tech and corporate roles: "Yazılım Geliştirici" and "Software Developer" both appear). Include both forms when relevant.

### Priority 1: [YOUR_PRIMARY_ROLE_TYPE]

These match your strongest and most desired career direction.

```
"[YOUR_PRIMARY_JOB_TITLE_TR]" [YOUR_CITY]
"[YOUR_PRIMARY_JOB_TITLE_EN]" [YOUR_CITY]
"[YOUR_KEY_SKILL]" [YOUR_CITY]
```

### Priority 2: [YOUR_DOMAIN_EXPERTISE]

These match your sector or domain expertise.

```
[YOUR_DOMAIN_KEYWORD_1] [YOUR_CITY]
[YOUR_DOMAIN_KEYWORD_2] [YOUR_REGION]
```

### Priority 3: [YOUR_ADJACENT_ROLE_TYPE]

Adjacent roles you could move into.

```
"[YOUR_ADJACENT_TITLE_1]" [YOUR_CITY]
"[YOUR_ADJACENT_TITLE_2]" [YOUR_CITY]
```

### Priority 4: Uzaktan / Hibrit

Remote and hybrid roles, regardless of city.

```
"[YOUR_PRIMARY_JOB_TITLE_TR]" uzaktan
"[YOUR_PRIMARY_JOB_TITLE_EN]" remote Türkiye
```

## Location Filter

When evaluating results, check that the job location fits the user's commute and relocation preferences:
- [YOUR_CITY] / [YOUR_DISTRICT] and nearby ilçeler (ideal)
- [ACCEPTABLE_AREA_1] (acceptable)
- [BORDERLINE_AREA] (borderline, ~X dk)
- [TOO_FAR_AREA] (too far, unless remote or the user is open to relocating)
- Uzaktan (remote): [YOUR_REMOTE_PREFERENCE]

For Istanbul, Anadolu Yakası vs Avrupa Yakası matters for commute; treat the other side as borderline unless the user says otherwise.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag it as "tarih bilinmiyor".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries + custom focus-specific queries
