# secretcv.com URL Reference

All URL forms below were checked live on 2026-11-07 with the CLI's User-Agent.

## robots.txt (fetched 2026-11-07)

```
User-agent: *
Allow: /

Disallow: /banner/redirect/*
Disallow: /ilan-begen-iptal/*
Disallow: *hesabim*
Disallow: /is-ilanlari/ara
Disallow: /cikis-yap
Disallow: *kvkk-modal?ilanId=*
Disallow: *ara?k=*
Disallow: */?ilanId=*
Disallow: */?sf=*
Disallow: */?redirect=*
Disallow: */?k=*
Disallow: */?s=*
Disallow: */?b=*
Disallow: */?p=*
Disallow: */?o=*
Disallow: */?wtime=*
Disallow: */?parameters=*
Disallow: /qr-basvuru
Disallow: /yeniden-biz

Sitemap: https://www.secretcv.com/sitemap
```

The CLI copies these rules into `ROBOTS_DISALLOW` (cli/src/helpers.ts) and checks every URL before fetching. Redirects are not followed automatically: on a 3xx the CLI resolves the `Location` header against the current URL, checks it with the same guard **before** requesting it, and follows at most 3 hops. A disallowed hop stops with `ROBOTS_DISALLOWED`; more than 3 hops stops with `API_ERROR`. On top of that it applies a stricter policy of its own: **it never fetches a URL with a query string**, and only fetches `www.secretcv.com`.

## URL forms the CLI uses

| Form | Example | Used by |
|------|---------|---------|
| `/is-ilanlari/{x}-is-ilanlari` | `/is-ilanlari/izmir-is-ilanlari` | search (one filter) |
| `/is-ilanlari/{a}/{b}-is-ilanlari` | `/is-ilanlari/izmir/garson-is-ilanlari` | search (two filters) |
| `/ilan/{id}` | `/ilan/1883754` | detail by id (302 to the canonical posting URL) |
| `/{company-slug}/{title-slug}-is-ilanlari-{id}` | `/mge-akaryakit/bilgi-teknolojileri-uzmani-is-ilanlari-1883754` | detail by URL |

**Why these are allowed:** robots.txt starts with `Allow: /`. None of these paths match a Disallow rule: they contain no query string (so none of the `*/?x=*` rules apply), they do not start with `/is-ilanlari/ara`, and they do not contain `hesabim`. The listing paths are the same ones secretcv.com publishes in its own sitemaps (`/sitemap/arama-form`, `/sitemap/sehir-pozisyon`, `/sitemap/il-ilce`, `/sitemap/ilan-tipleri`), and posting URLs are the canonical `url` in each posting's JSON-LD.

## URL forms the CLI never uses

| Form | Reason |
|------|--------|
| `/is-ilanlari/ara?k=...` | Disallowed (`/is-ilanlari/ara`, `*ara?k=*`). This is the site's real search form. |
| `/is-ilanlari/ara...-is-ilanlari` | `Disallow: /is-ilanlari/ara` is a prefix rule, so any single-segment slug starting with `ara` (`arac-soforu`, `arastirma-gorevlisi`, `aranjor`) is disallowed too. The CLI refuses such a `--query` with `ROBOTS_DISALLOWED` and a message suggesting a synonym (`sofor`) or `--sector`. With a city/type/sector prefix the two-segment path is allowed, but if the site then treats the query as a free-text keyword, the keyword-only fallback is refused the same way. |
| `/is-ilanlari/.../?sf=N` | Disallowed (`*/?sf=*`). This is the only pagination mechanism, so the CLI is limited to page 1. |
| `/is-ilanlari/.../?s={sector}` | Disallowed (`*/?s=*`), even though `/sitemap/tum-sehir-sektor` lists such URLs. The CLI uses the clean path `/is-ilanlari/{sector}-is-ilanlari` instead. |
| `?l=50`, `?sr=4` (page size, sort) | Not disallowed, but the site answers 410 Gone and they are query strings, which our policy skips. |
| `/giris-yap?redirect=1&ilanId=...` | Apply/login link. Reported as `applyUrl` but never fetched. |
| `/banner/redirect/*` | Disallowed. Ad links inside listings are skipped by the parser. |

## Path grammar (observed)

The leaf segment always ends in `-is-ilanlari`. What a slug means is decided by the site:

| Slug kind | Badge `data-type` | Examples |
|-----------|-------------------|----------|
| City (il) | `sh` | `istanbul` (both sides), `istanbul-avrupa`, `istanbul-anadolu`, `izmir`, `mugla`, `afyon`, `kahramanmaras`, `mersin`, `kibris` |
| District (ilçe) | `ilc` | `mugla/bodrum`, `istanbul-anadolu/kadikoy` |
| Position | `p` | `garson`, `satis-danismani`, `bilgi-islem-sorumlusu` (3,290 in `/sitemap/arama-form`) |
| Work type | `it` | see table below |
| Sector | `s` | see list below |
| Anything else | `k` (keyword) | `yazilim-gelistirici`, `muhasebe`, `bilisim` |

Two-segment combinations that the site honours:

| Path | Result |
|------|--------|
| `{city}/{position}` | city AND position |
| `{type}/{position}` | type AND position |
| `{sector}/{position}` | sector AND position |
| `{type}/{city}` | type AND city |
| `{city}/{district}` | district |

Silently ignored (one filter is dropped, page shows the other): `{city}/{keyword}`, `{type}/{keyword}`, `{sector}/{keyword}`, `{city}/{type}`, `{city}/{sector}`, `{city}/{unknown}`. Three segments (`izmir/part-time/garson`, `mugla/bodrum/garson`) return 404.

The CLI reads the active-filter badges (`<span class="badge filter-badge ..." title="..." data-type="...">`) on every listing page to confirm what the site actually applied, and falls back to the keyword-only path plus a local city filter when the query was dropped.

Legacy city slugs redirect: `k-maras` to `kahramanmaras`, `mersin-icel` to `mersin`. The CLI maps common aliases (`afyonkarahisar`, `icel`, `urfa`, `antep`, `izmit`, `adapazari`, `kktc`) itself.

## Work types (`/sitemap/ilan-tipleri`)

| CLI `--type` | Slug |
|--------------|------|
| `remote` | `uzaktan-calisma` |
| `home-office` | `home-office` |
| `hybrid` | `hibrit` |
| `full-time` | `tam-zamanli` |
| `part-time` | `part-time` |
| `intern` | `staj` |
| `new-grad` | `yeni-mezun` |
| `blue-collar` | `mavi-yaka` |
| `seasonal` | `donemsel` |
| `project` | `proje-bazli` |
| `flexible` | `esnek-calisma` |
| `live-in` | `yatili` |
| `disabled` | `engelli` |
| `ex-convict` | `eski-hukumlu` |
| `veteran-family` | `sehit-yakini-teror-magduru` |

## Sectors (from `/sitemap/tum-sehir-sektor`, used as clean paths)

acik-hava-reklamciligi, ajans, akaryakit-petrol-ve-urunleri, aluminyum, ambalaj-ve-kagit, asansor-ve-yuruyen-merdivenler, aydinlatma, bankacilik-finans, barter, belgelendirme-marka-patent, beyaz-esya, bilgisayar-bt-internet, bina-ve-tesis-yonetimi, bioteknik, buro-makineleri, cagri-merkezi, cam-ve-seramik, catering, cevre, cimento, dagitim, danismanlik, dayanikli-tuketim-mallari, demir-celik, denizcilik, deri-ayakkabi, dernek-ve-vakif, diger, dis-ticaret, e-ticaret, egitim, eglence, elektrik-ve-elektronik, endustri, enerji, faktoring, fuar-ve-organizasyon, gayrimenkul, gemi-yat-tersane, gida, gumrukleme, guvenlik-hizmetleri, guvenlik-sistemleri, halkla-iliskiler, havacilik, hayvancilik, hizli-tuketim-mallari, hizmet-isletme-servisi, holding, hukuk, ilac, imalat, insaat, insan-kaynaklari, is-sagligi-ve-guvenligi, isik-ses-ve-goruntu-sistemleri, isitma-sogutma-iklimlendirme, ithalat-ihracat, kamu, kargo-kurye, kimya, kirtasiyecilik, kiymetli-maden, kozmetik, kuyumculuk-pirlanta, leasing-finansal-kiralama, lojistik, madencilik, magazacilik-perakendecilik, makine, mali-denetim-vergi, mali-musavirlik, matbaacilik-baski, medikal, medya, mekanik-tesisat, metal-sanayi, mimarlik, mobilya-dekorasyon, motosiklet, muhendislik, musteri-iliskileri, network-marketing, ofis-malzemeleri, optik, otelcilik, otomasyon, otomotiv, oyuncak, pazar-piyasa-arastirma, plastik, proje-ve-taahhut, rehabilitasyon, reklamcilik, restorancilik, saglik-hastane, sanat, savunma-guvenlik, sigortacilik, sivil-toplum-kurulusu, sosyal-servisler, spor, su-urunleri, sut-ve-sut-urunleri, tanitim-ve-promosyon-urunleri, tarim-ve-orman-urunleri-ziraat, tekstil, tekstil-boya-ve-kimyasallari, telekomunikasyon-ve-network, tercume-hizmetleri, tibbi-malzeme, toptancilik, turizm, ulasim, uretim-ve-endustriyel-urunler, yapi-malzemeleri, yatirim-menkul-d-borsacilik, yatirim-menkul-degerler, yayincilik, yumurtacilik-tavukculuk

## Page structure

### Listing page (20 cards)

| Field | Source |
|-------|--------|
| total | `"<n> İş İlanı Listelendi"` in `.total-job-text` (dot thousands, e.g. `2.397`) |
| card | `<div class="cv-job-box job-list ...">` (ad boxes are `cv-job-box cv-ads` and are skipped) |
| title, url | `<a href="..." title="..." class="title lh-title">` |
| id | trailing digits of the URL (`...-is-ilanlari-1884516`) |
| company | `<a class="company">`, or plain text such as `Firma Adı Gizli` |
| location | text after `bi-geo-alt-fill` |
| districts | text after `bi-building` (truncated by the site with `...`) |
| posted | `İlan Tarihi: Bugün / 3 gün önce / 1 ay 9 gün önce` |
| next page exists | `title="Sonraki Sayfa"` link not disabled |

The "Sponsorlu İlanlar" showcase (`.sponsored-job`) is not a card and is ignored.

### Posting page

| Field | Source |
|-------|--------|
| title, company, companyUrl, datePosted, deadline, canonical url | `<script type="application/ld+json">` with `"@type": "JobPosting"` (`validThrough` is the deadline) |
| employmentType, sector, education, location, districts, referenceNo, foreignNationalsAccepted | `.content-job-table` rows (`İstihdam Türü`, `Sektör`, `Eğitim Seviyesi`, `Şehirler`, `İlçeler`, `Referans No`, `Yabancı Uyruklu Çalışabilir`) |
| description | `.cv-card.content-job` body (sections `İş Açıklaması`, `İstenen Yetenek ve Uzmanlıklar`), HTML converted to text with bullets |
| applyUrl | `<a ... title="İşe Başvur">` (login redirect) |

Posting bodies encode Turkish letters as Latin-1 named entities (`&uuml;`, `&ouml;`, `&ccedil;`); ğ, ş, ı, İ arrive as raw UTF-8. The parser decodes both.
