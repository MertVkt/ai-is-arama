# İŞKUR e-Şube URL Reference

## Host and robots.txt

```
https://esube.iskur.gov.tr
```

robots.txt (checked Nov 2026):

```
User-agent: *
Allow: /
Disallow: /Meslek/ViewMeslekDetayPopUp.aspx/
```

The rule is copied into `ROBOTS_DISALLOW` (cli/src/helpers.ts). Every request URL, and every
redirect `Location` before it is followed (redirects are handled manually, at most 3 hops), is
checked against it and must be on `esube.iskur.gov.tr`; otherwise the CLI stops with
`ROBOTS_DISALLOWED`.

The CLI only uses the three paths below. None of them require login.

| Purpose | Method | Path |
|---------|--------|------|
| Job search form + results | GET, then form POST | `/Istihdam/AcikIsIlanAra.aspx` |
| Ad detail | GET | `/Istihdam/AcikIsIlanDetay.aspx?uiID={ilanNo}` |
| Occupation autocomplete | GET (JSON) | `/api/meslekuzmanlikapi/meslekuzmanlik/{term}` |

Responses are `text/html; charset=utf-8`. The CLI still honours a `windows-1254` /
`ISO-8859-9` charset if the server ever sends one.

## Search: ASP.NET WebForms postback

1. `GET /Istihdam/AcikIsIlanAra.aspx` and keep the session cookie.
2. Copy every hidden input (`__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__VIEWSTATEENCRYPTED`,
   `__EVENTVALIDATION`, ...).
3. `POST` the same URL as `application/x-www-form-urlencoded` with the hidden inputs, the
   search fields below and `__EVENTTARGET=ctl04$ctlAcikIsPageCommand$CommandItem_Search`.
4. For page N, POST again using the hidden inputs from the previous response with
   `__EVENTTARGET=ctl04$ctlDataPagerDetay$btnChangeCurrentPage` and
   `ctl04$ctlDataPagerDetay$txtCurrentPage=N`. The search fields must be sent again.

### Search fields

| CLI flag | Form field | Values |
|----------|-----------|--------|
| `--query` | `ctl04$ctlArananMetin2` | free text |
| `--sector` | `ctl04$IsyeriTuruRadios` | `ozelSektorRadio`, `kamuRadio` |
| (fixed) | `ctl04$ctlCalismaYeri` | `1` = Yurtiçi |
| `--il` | `ctl04$ctlIl` | province code (see below), empty = all |
| (unused) | `ctl04$ctlIlce` | district, loaded by AJAX per il |
| `--posted` | `ctl04$ctlIlanTarihi` | `1` all, `2` son 24 saat, `3` son 1 hafta, `4` son 15 gün |
| `--education` | `ctl04$ctlOgrenimDurum` | see table below |
| `--work-type` | `ctl04$ctlCalismaSekli` | `1` tam zamanlı, `2` kısmi zamanlı (özel) |
| `--period` | `ctl04$ctlCalismaPeryodu` | `2` daimi, `1` geçici (kamu) |
| `--ilan-turu` | `ctl04$ctlKisiselDurum` | `9` genel, `10` engelli, `13` eski hükümlü, `15` TMY (kamu) |
| `--employer` | `ctl04$ctlIsyeriUnvan` | text |
| `--ilan-no` | `ctl04$ctlIsgucuIstemiNo` | up to 11 digits |
| `--meslek-kodu` | `ctl04$ctlMeslek$ctlMeslek_MeslekKayitNo` | `PrmMeslekKayitNo` from the occupation API |

### Education codes (`ctl04$ctlOgrenimDurum`)

| CLI value | Code | Label |
|-----------|------|-------|
| `okur-yazar-olmayan` | 5 | Okur Yazar Olmayan |
| `okur-yazar` | 6 | Okur Yazar |
| `ilkokul` | 8 | İlkokul |
| `ilkogretim` | 4 | İlköğretim |
| `lise` | 3 | Ortaöğretim (Lise ve Dengi) |
| `onlisans` | 7 | Önlisans |
| `lisans` | 1 | Lisans |
| `yuksek-lisans` | 2 | Yüksek Lisans |
| `doktora` | 10 | Doktora |

### Province codes (`ctl04$ctlIl`)

Codes equal Turkish licence plate codes (1 Adana ... 81 Düzce), e.g. 6 Ankara, 7 Antalya,
16 Bursa, 34 İstanbul, 35 İzmir, 41 Kocaeli, 48 Muğla. Run the `iller` command for the full list.

## Results markup

Results are in `table#ctl04_ctlGridAcikIslerListeDetail`, 15 rows per page. Each row has:

- title link `a[id$="_flag_{ilanNo}"]` (text = occupation / title)
- `span[id$="_ctlIsverenDL"]` employer (private-sector rows show a "login to see" notice instead)
- `span[id$="_ctlIsverenTurDL"]` Özel / Kamu, `_ctlCalismaPeriyotDL`, `_ctlCalismaSekliDL`
- `span[id$="_Label9"]` open positions
- `span[id$="_ctlSonBasvuruTarihi"]` deadline `d.m.yyyy`, `_ctlSonBasvuruDL` days left
- a share link with `data-ilanno`, `data-sontarih` (`dd.mm.yyyy`), `data-il`
  (`İlçe Geneli Başvuru  (KOCAELİ / ÇAYIROVA)`), `data-acikissayi`, `data-isverentur`,
  `data-calismasekli`, `data-meslekler`

Pager: `Toplam Kayıt: N` and `input#ctl04_ctlDataPagerDetay_txtCurrentPage` followed by `/ totalPages`.
No results: the grid contains "Aradığınız kriterlere uygun kayıt bulunamadı."

## Detail page

`GET /Istihdam/AcikIsIlanDetay.aspx?uiID=00009890180` (11 digits, zero padded). Sections by id
prefix `ctl01_ctlIsIlanBilgileri_`:

| Id suffix | Content |
|-----------|---------|
| `baslik` | section heading ("İş Tanımı" for private, "Genel Hususlar ve Özel Şartlar" for kamu) |
| `ctlGenelSartlar` | description / general terms (HTML) |
| `ctlGenelSartlar2` | Nitelik ve Beceriler (HTML) |
| `ctlOzelSartlarText`, `ctlGenelSartlarManuel` | extra conditions |
| `repeaterMeslek_ctlNN_ctlMeslekLabel` | occupation, with `..DeneyimSuresiLabel` (years) and `..LabelAy` (months) |
| `ctlOgrenimAsgari`, `ctlOgrenimAzami` | min / max education |

The page does not include location, deadline or the employer. An unknown id returns HTTP 200
with an error text in `span#ctl01_ctlMessageBox_lblMessage` ("Object reference not set ...").

## Occupation API

`GET /api/meslekuzmanlikapi/meslekuzmanlik/yazılım` returns

```json
[{"PrmMeslekKayitNo":6440.0,"PrmMeslekUzmanlikKayitNo":null,"Meslek":"Yazılım Mühendisi"}]
```

The page lowercases the term and strips characters outside `[a-z0-9şŞıİçÇöÖüÜĞğ,-/() ]`
before calling it; minimum 3 characters.

## Other sources checked

- `www.iskur.gov.tr` links to the same e-Şube search and has an `/ilanlar/` news section for
  kamu memur / işçi announcements (PDF style notices, not structured listings).
- `acikisharita.iskur.gov.tr` (open jobs map) exists but was not evaluated.
- Kariyer Kapısı (`kariyerkapisi.cbiko.gov.tr`) could not be reached from the build
  environment (egress blocked), so it is not part of this skill.
