---
name: scrape
description: >
  Finds new job postings in Turkey matching your profile via installed portal-search
  CLIs (Secretcv, Eleman.net, İŞKUR, LinkedIn, freehire and any skills added with
  /add-portal), plus ready search links for Kariyer.net and Yenibiriş. Deduplicates
  across runs. Triggers on: iş ara, ilan bul, yeni ilanlar, iş ilanlarını tara,
  bana uygun iş var mı, job scrape, find jobs, search jobs, new jobs, /scrape
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(bun --version), Bash(bun run .agents/skills/*/cli/src/cli.ts *), WebFetch, WebSearch, Agent, AskUserQuestion
---

# Job Scraper

---

## How It Works

**Language:** present everything to the user in Turkish.

This skill searches job portals using the **installed portal-search CLIs** in
`.agents/skills/` (plus WebSearch as a fallback), using queries from your profile.
It deduplicates against previously seen jobs and the application tracker, and
presents new matches with a quick fit assessment.

## Invocation

The user triggers this skill by saying things like:
- "Find new jobs"
- "Scrape for jobs"
- "Any new positions?"
- "/scrape"

Optional arguments:
- A focus area, e.g. "/scrape muhasebe" or "/scrape yazılım"
- "broad" to run all search categories, e.g. "/scrape broad"

---

## Execution Steps

### Step 0: Load State

1. Read `job_scraper/seen_jobs.json` (create if missing - start with `{"seen": {}}`)
2. Read `job_search_tracker.csv` to extract already-applied companies+roles
3. Read `search-queries.md` (this directory) for the search strategy

### Step 1: Search

Read `search-queries.md` (this directory) for the search strategy. By default, run the top 3 priority query categories. If the user said "broad", run all categories. If the user specified a focus area (e.g. "data science"), prioritize queries from that category.

**Use the installed CLI tools as the primary search mechanism.** Fall back to `WebSearch` only for portals that do not have a CLI skill, or if `bun` is unavailable on the system.

#### 1a. Check bun availability

```bash
bun --version
```

If this fails (bun not installed), skip to **1c (WebSearch fallback)** for all portals and note the fallback in the Step 5 output.

#### 1b. Run CLI tools (primary — run these in parallel where possible)

Discover all installed portal CLI skills by reading every `SKILL.md` found under `.agents/skills/*/SKILL.md`. Each file documents that portal's exact CLI flags and usage examples. **Use each portal's own documented interface — do not guess flags.** This approach automatically includes any new portals added via `/add-portal` without requiring changes to this file.

For each installed portal skill:

1. Read its `SKILL.md` to find the correct `bun run …` invocation and supported flags.
2. Translate the query terms from `search-queries.md` into that portal's flag format (e.g. `-q` and `-c` for Secretcv, `-p`/`-c`/`-f`/`-k` for Eleman.net, `-q` and `--il` for İŞKUR, `-q` and `-l` for LinkedIn; whatever the portal's SKILL.md specifies).
3. Scope to recent postings where the portal supports it: `--jobage 14` for LinkedIn and freehire, `--posted 15d` for İŞKUR. Secretcv and Eleman.net have no recency filter: Secretcv search dates are approximate and Eleman.net cards carry no date, so check `datePosted`/`validThrough` with `detail` on the pre-filtered hits, or flag the job as "tarih bilinmiyor".
4. Cap results to ~20 per call using the portal's limit flag.
5. Use `--format json` for machine-readable output.

Run all portal CLI calls in parallel where possible using the Agent tool. Collect all `results` arrays into a single pool for Step 2, keeping each result tagged with its source portal skill (for Step 2 `detail` lookups).

If a CLI tool exits with a non-zero code, log the error message and continue — do not abort the whole search.

#### 1c. WebSearch fallback

Use `WebSearch` for:
- Portals listed in `search-queries.md` that do **not** have a corresponding directory under `.agents/skills/`
- Any portal whose CLI fails at runtime
- When bun is unavailable (Step 1a failed)

Use the site-specific query strings from `search-queries.md` directly as WebSearch queries for these portals.

#### 1d. Link-only portals: Kariyer.net and Yenibiriş

Kariyer.net (the largest board in Turkey) and Yenibiris.com sit behind bot protection (PerimeterX captcha and Cloudflare). **Never fetch them with WebFetch, curl or a CLI, and never try to work around the protection.** Instead:

1. Build ready-to-open search links from the user's queries and locations, and list them in the Step 5 output under a "Kendin bak" heading so the user can open them in their browser:
   - Kariyer.net: `https://www.kariyer.net/is-ilanlari/<il>-<anahtar+kelime>` (keyword only: `https://www.kariyer.net/is-ilanlari/<anahtar+kelime>`). Lowercase, Turkish letters folded to ASCII (ı->i, ğ->g, ü->u, ş->s, ö->o, ç->c), words joined with `+`, il and keyword separated by `-`. Istanbul sides: `istanbul+avrupa`, `istanbul+asya`. Example: `https://www.kariyer.net/is-ilanlari/izmir-muhasebe+uzmani`
   - Yenibiriş: `https://www.yenibiris.com/is-ilanlari/<anahtar-kelime>` (ASCII-folded, words joined with `-`). The city filter is applied on the page.
2. Optionally run `WebSearch` with `site:kariyer.net/is-ilani <query> <il>` to surface individual postings indexed by the search engine. Present them as links only; their details cannot be fetched automatically.
3. Tell the user once that if they find a posting there they like, they can paste its full text into `/apply`.

### Step 2: Fetch & Parse

For each promising result from Step 1:

**From CLI results:** Search output already includes title, company, location, date,
and URL. For jobs worth a deeper look, fetch full detail with that portal's `detail`
command (see its SKILL.md — do not guess flags) to extract **key requirements**,
**application deadline**, and a brief description snippet.

**From WebSearch results:** Use `WebFetch` on the posting URL and extract the same
fields manually. **Exception:** never WebFetch `kariyer.net` or `yenibiris.com` URLs. Keep them as link-only entries (title and URL from the search result, nothing else) and store them in Step 4 with `"status": "link_only"`.

For every candidate:
- Skip if the URL or company+title combo already exists in `seen_jobs.json`
- Skip if the company+role already appears in `job_search_tracker.csv`

### Step 3: Quick Fit Assessment

For each new job, do a rapid fit check (NOT the full evaluation from `04-job-evaluation.md` - just a quick signal):

- **High match**: Role directly involves your core skills
- **Medium match**: Role is adjacent to your experience
- **Low match**: Role requires significant skills you lack

### Step 4: Deduplicate & Store

1. Add ALL fetched jobs (new and skipped) to `seen_jobs.json` with structure:
```json
{
  "seen": {
    "<url_or_company_title_key>": {
      "title": "...",
      "company": "...",
      "url": "...",
      "first_seen": "YYYY-MM-DD",
      "fit": "high/medium/low",
      "status": "new/skipped/evaluated/ranked/expired/link_only"
    }
  }
}
```

`/rank` extends this schema additively: ranked entries also carry `rank_score` (0–100 overall score), `rank_verdict` (fit band, e.g. "strong fit"), and `rank_date` (ISO date of ranking). The `status` field is set to `"ranked"`. Do not drop these fields when re-writing entries.

2. Only present jobs NOT already in the seen list or tracker.

### Step 5: Present Results

Present new jobs in a table sorted by fit (high first):

```
## Yeni İlanlar - GG.AA.YYYY

X yeni ilan bulundu (Y yüksek, Z orta, W düşük uyum).

| # | Uyum | Pozisyon | Şirket | Konum | Son Başvuru | Kaynak | Link |
|---|------|----------|--------|-------|-------------|--------|------|
| 1 | Yüksek | ... | ... | ... | ... | Secretcv | [İlan](...) |

### Öne Çıkanlar
Her yüksek uyumlu ilan için 2-3 madde:
- Profilinle neden örtüşüyor
- Dikkat edilmesi gereken şartlar
- Varsa kırmızı bayraklar

### Kendin Bak (Kariyer.net, Yenibiriş)
- [Kariyer.net: <il> <anahtar kelime>](https://www.kariyer.net/is-ilanlari/...)
- [Yenibiriş: <anahtar kelime>](https://www.yenibiris.com/is-ilanlari/...)
```

After presenting, ask (in Turkish):
> "Detaylı değerlendirmemi istediğin ilan var mı? Numarasını yazman yeterli. Kariyer.net veya Yenibiriş'te beğendiğin bir ilan olursa metnini /apply ile yapıştırabilirsin."

If the user picks a number, invoke the **job-application-assistant** skill workflow (fit evaluation first, then CV + cover letter if approved).

If the run found many new jobs (roughly 8+), also suggest `/rank` - it batch-scores all new postings against the full fit framework and returns a ranked shortlist, which beats eyeballing a long table. (`/rank` sets the `ranked` and `expired` status values in `seen_jobs.json`; treat both as already-seen for dedup purposes.)

### Step 6: Update Tracker (Optional)

If the user decides to apply to any job, add a row to `job_search_tracker.csv`.

---

## Important Rules

1. **Never fabricate job postings.** Only present jobs from actual CLI search/detail output or WebSearch/WebFetch results.
2. **Respect deduplication.** Always check seen_jobs.json AND job_search_tracker.csv before presenting.
3. **Focus on configured geographic area.** Skip jobs that require relocation or are clearly outside commute range.
4. **Only open positions.** Skip postings with expired deadlines or those marked as closed.
5. **Be efficient with detail fetches.** Don't run `detail` or WebFetch on every search hit — pre-filter by title/snippet, then fetch only promising matches.
6. **Parallel searches.** Run portal CLI searches in parallel; use WebSearch only for gaps the CLIs don't cover.
