# eleman.net URL Reference

## Base URL

```
https://www.eleman.net
```

## robots.txt (fetched 2026-11-07, Last-Modified 2025-12-29)

```
User-agent: *
Disallow: /*.asp$
Disallow: /*.html$
Disallow: /*.htm$
Disallow: *?t=arama*
Disallow: *?yazi=*
Disallow: *?uyelik_tipi=*
Disallow: *?tip=*
Disallow: *?ilan_id=*
Disallow: *?t=*
Disallow: *?wbtrck=*
Disallow: /favori.php
Disallow: /resim_goster.php
Disallow: /uye_yorum.php
Disallow: /dogrulama_kodu.php
Disallow: /basvuru_yap.php
Disallow: /cv_guncelle.php
Disallow: /eleman.php
Disallow: /is_ilanlari.php
Disallow: /firmalar.php
Disallow: /arama_complete.php
```

No `Crawl-delay` and no `Sitemap` line (`/sitemap.xml` returns 404). These rules are copied into `cli/src/helpers.ts` (`ROBOTS_DISALLOW`) and every URL is checked against them before a request goes out. Redirects are not followed automatically: on a 3xx the CLI resolves the `Location` header against the current URL, checks it (robots.txt rules plus host must be `www.eleman.net`) **before** requesting it, and follows at most 3 hops. A disallowed hop stops with `ROBOTS_DISALLOWED`; more than 3 hops stops with `API_ERROR`.

## URL forms the CLI fetches

| Purpose | URL form | Why it is allowed |
|---------|----------|-------------------|
| Listing by one slug | `/is-ilanlari/{slug}` | Plain path, no `.php`/`.html`/`.asp`, no query. Matches no Disallow rule. Pages carry `<meta name="robots" content="all">` and a self canonical. |
| Listing by two slugs | `/is-ilanlari/{slug1}/{slug2}` | Same as above. |
| Next pages | `/is-ilanlari/{...}?sy={n}` | Only query param is `sy`. Disallow rules target `?t=`, `?tip=`, `?ilan_id=`, `?yazi=`, `?uyelik_tipi=`, `?wbtrck=`; `?sy=` matches none. The site itself links these in `<link rel="next">`. |
| Posting detail | `/is-ilani/{slug}-i{id}` | No file extension (the `/*.html$` rule does not apply), no query. Carries `robots: all`. |
| Detail by bare id | `/is-ilani/ilan-i{id}` | Any slug before `-i{id}` 301-redirects to the canonical posting URL. (`/is-ilani/i{id}` with no slug returns 404.) |

## URL forms the CLI deliberately does NOT use

| URL | Reason |
|-----|--------|
| `/is-ilanlari?aranan={text}&arandi=e` (the site's free-text search form) | Not literally disallowed, but the site marks these result pages `noindex, nofollow`, signalling they are not meant for automated consumption. Skipped to stay within the spirit of the rules. This is why there is no free keyword search. |
| `/is_ilanlari.php`, `?t=arama...` | Explicitly disallowed (old search endpoints). |
| `/arama_complete.php`, `/arama-complete.php` | Autocomplete. The underscore form is disallowed; the hyphen variant is treated the same. |
| `/aday/basvuru_yap.php?ilan_id={id}` | Apply page. Disallowed by `*?ilan_id=*` and needs login. The CLI only **prints** it as `applyUrl` for the user to open; it never fetches it. |
| `/is_ilanlari_pozisyonlar.php`, `/is_ilanlari_sehirler.php` | Index pages of all slugs. Allowed, but not needed at runtime; used once by hand to confirm slug formats. |

## Slugs

Slugs are lowercase ASCII with Turkish letters folded (`ç→c ğ→g ı→i İ→i ö→o ş→s ü→u`) and spaces as `-`. The CLI does this for you (`slugify`).

The order of two slugs does not matter for the server (`garson/mugla` and `mugla/garson` share a canonical), but the CLI always emits `{city}/{position}` or `{city|position}/{filter}`.

### Cities and districts

All 81 il slugs (`istanbul`, `ankara`, `izmir`, `mugla`, `antalya`...) plus `istanbul-anadolu`, `istanbul-avrupa`, and district slugs (`bodrum`, `kadikoy`, `karsiyaka`, `besiktas`...). Combining `il/ilce` (`mugla/bodrum`) canonicalises to the ilçe alone.

### Positions

Around 500 position slugs, listed at `https://www.eleman.net/is_ilanlari_pozisyonlar.php`. Common ones: `garson`, `komi`, `asci`, `asci-yardimcisi`, `barista`, `kasiyer`, `satis-temsilcisi`, `satis-danismani`, `magaza`, `depo-elemani`, `forklift-operatoru`, `kurye`, `sofor`, `guvenlik-gorevlisi`, `temizlik-gorevlisi`, `on-muhasebe-elemani`, `sekreter`, `cagri-merkezi`, `operator`, `tekniker`, `teknisyen`, `usta`, `tornaci`, `vasifsiz-eleman`. Sector-like slugs also work: `restoran`, `otel`, `gida`, `lojistik`, `insaat`, `perakende`, `yiyecek-icecek`, `muhasebe`.

### Filters (`--filter`)

| Flag value | Slug | Meaning |
|------------|------|---------|
| `part-time` | `yari-zamanli-part-time` | Yarı zamanlı |
| `full-time` | `tam-zamanli-full-time` | Tam zamanlı |
| `urgent` | `acil` | Acil ilan |
| `salary` | `maasi-acik` | Maaş bilgisi açık |
| `benefits` | `yan-hakli` | Yan haklı |
| `phone` | `telefonlu` | Telefonla başvuru |
| `disabled` | `engelli` | Engelli adaylara uygun |
| `student` | `ogrenci` | Öğrenciye uygun |
| `retired` | `emekli` | Emekliye uygun |
| `intern` | `staj` | Staj |

Slugs that look plausible but are **not** recognised (they fall back to the generic list): `uzaktan`, `remote`, `evden-calisma`, `hafta-sonu`, `gunluk`, `sezonluk`, `part-time` (use `yari-zamanli-part-time`), `yazilim-gelistirici`.

## Path depth limit

At most two segments are honoured. A third segment 301-redirects and drops it (`/is-ilanlari/mugla/bodrum/garson` → `/is-ilanlari/mugla/bodrum`). The CLI rejects three-way combinations with `INVALID_COMBINATION`.

## Unknown slug fallback

An unknown slug still returns HTTP 200 with the generic listing (or the other, known segment). The CLI detects this by checking that every requested slug appears in the page's `<link rel="canonical">` and exits with `UNKNOWN_SLUG` instead of returning misleading results.

## Pagination

- About 30 postings per page, plus at most one coloured showcase card (`renkli-vitrin-ilan`) on page 1.
- Page count: the pager is a `<select>` of `<option value=".../is-ilanlari/...?sy=N">`; from page 2 on, the `<title>` also contains `[N Sayfadan X. Sayfa]`.
- Pages beyond the last return 200 with zero cards.
- Empty combinations show "Sonuç Bulunamadı" with zero cards.

## Card extraction (listing pages)

Each card starts with `<div class="c-box__body ilan_listeleme_bol ...">`.

| Field | Source |
|-------|--------|
| `id`, `url` | `a[href]` matching `/is-ilani/{slug}-i{id}` (showcase cards have no `id="ilan_id_..."` attribute, so the href is used) |
| `title` | text of `h3.c-showcase-box__title` before `div.ilantik-grubu` |
| `badges` | `div.ilantik[title]` inside `ilantik-grubu` |
| `company` | `span.c-showcase-box__subtitle` text before the location icon (`hgi-location-01` or, on showcase cards, `icon-map-marker`) |
| `location` | subtitle text after the location icon, e.g. `İstanbul Anadolu - Kadıköy` |
| `benefits` | span after the `hgi-eraser-add` icon |
| `description` | last `span.c-showcase-box__text` (truncated snippet) |

Cards do not contain a posting date or salary amount.

## Detail extraction

- `<script type="application/ld+json">` with `"@type":"JobPosting"`: title, datePosted, validThrough, employmentType, hiringOrganization (name, url), jobBenefits, baseSalary.
- Visible location line after `icon-map-marker` in the header (more precise than the JSON-LD).
- `span.is_ilani_ozellik_kutusu` boxes: `Maaş: ...`, `Yan Haklar: ...`, `Deneyim: ...`, `Kişi Sayısı: ...`, `20 - 40 arası` (age), `Kadın veya Erkek`, employment type.
- Full description: first child `div` of `div.d-information` (`<br>` converted to newlines).
- `div.ilantik[title="Telefonla başvuru yapabilirsiniz."]` sets `phoneApplication: true` (the number itself is only shown after login).

## Encoding

eleman.net serves `text/html; charset=utf-8`. The CLI still decodes from raw bytes using the declared charset (header first, then `<meta charset>`), so a switch to `windows-1254` / `ISO-8859-9` would decode correctly.

## Bot protection

The site is behind Cloudflare. As of 2026-11-07, plain requests with an honest User-Agent get 200. If a challenge page appears (`Just a moment...`, `cf-chl`, `challenge-platform`), the CLI exits with code `BLOCKED` and does not retry.
