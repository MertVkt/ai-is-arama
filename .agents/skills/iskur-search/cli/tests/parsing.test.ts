import { describe, test, expect } from "bun:test"
import { join } from "path"
import {
  buildFormFields,
  decodeBody,
  decodeHtml,
  extractHiddenFields,
  normalizeJobId,
  normalizeOccupationTerm,
  parseDetail,
  parseOccupations,
  parseSearchResults,
  resolveProvince,
  splitLocation,
  trDateToIso,
  validateCriteria,
  CliError,
} from "../src/helpers"

// Fixtures are trimmed copies of real esube.iskur.gov.tr responses (Nov 2026).
// ViewState values are replaced with placeholders; contact details are anonymised.
const fx = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text()

describe("parseSearchResults", () => {
  test("parses private-sector rows with Turkish characters intact", async () => {
    const page = parseSearchResults(await fx("search-ozel.html"))
    expect(page.total).toBe(193)
    expect(page.page).toBe(1)
    expect(page.totalPages).toBe(13)
    expect(page.results).toHaveLength(2)
    const [a, b] = page.results
    expect(a).toEqual({
      id: "00009890180",
      title: "Üç Boyutlu Ölçüm (Cmm) Operatörü",
      employer: null, // masked for anonymous visitors on private-sector ads
      sector: "Özel",
      period: "Daimi",
      workType: "Tam Zamanlı",
      openPositions: 1,
      applicationScope: "İlçe Geneli Başvuru",
      province: "KOCAELİ",
      district: "ÇAYIROVA",
      location: "İlçe Geneli Başvuru (KOCAELİ / ÇAYIROVA)",
      deadline: "2026-12-04",
      daysLeft: "26 Gün Kaldı",
      url: "https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009890180",
    })
    expect(b.id).toBe("00009890351")
    expect(b.province).toBe("BURSA")
    expect(b.district).toBe("NİLÜFER")
  })

  test("public-sector rows expose the employer name", async () => {
    const page = parseSearchResults(await fx("search-kamu.html"))
    expect(page.results).toHaveLength(1)
    const r = page.results[0]
    expect(r.employer).toBe("PINARHİSAR BELEDİYESİ")
    expect(r.sector).toBe("Kamu")
    expect(r.title).toBe("Greyder Operatörü")
    expect(r.deadline).toBe("2026-11-10")
  })

  test("empty result set gives zero rows and zero total", async () => {
    const page = parseSearchResults(await fx("search-empty.html"))
    expect(page.results).toEqual([])
    expect(page.total).toBe(0)
    expect(page.totalPages).toBe(0)
  })

  test("missing grid raises a parse error", () => {
    expect(() => parseSearchResults("<html><body>nope</body></html>")).toThrow(CliError)
  })
})

describe("extractHiddenFields", () => {
  test("reads ASP.NET hidden inputs", async () => {
    const f = extractHiddenFields(await fx("search-ozel.html"))
    expect(f["__VIEWSTATE"]).toBe("FIXTURE__VIEWSTATE")
    expect(f["__EVENTVALIDATION"]).toBe("FIXTURE__EVENTVALIDATION")
  })
  test("throws when __VIEWSTATE is missing", () => {
    expect(() => extractHiddenFields("<form></form>")).toThrow(/__VIEWSTATE/)
  })
})

describe("parseDetail", () => {
  test("private-sector ad: description, qualifications, occupation, education", async () => {
    const d = parseDetail(await fx("detail-ozel.html"), "00009890180")
    expect(d.sectionTitle).toBe("İş Tanımı")
    expect(d.description).toContain("- CMM ölçüm cihazı")
    expect(d.description).toContain("ornek@example.com")
    expect(d.qualifications).toContain("Teknik resim okuyabilen")
    expect(d.occupations).toEqual([{ name: "Üç Boyutlu Ölçüm (Cmm) Operatörü", experienceYears: null, experienceMonths: null }])
    expect(d.educationMin).toBe("Ortaöğretim (Lise ve Dengi)")
    expect(d.educationMax).toBeNull()
    expect(d.url).toBe("https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009890180")
  })

  test("public-sector ad: general terms section, experience years, education range", async () => {
    const d = parseDetail(await fx("detail-kamu.html"), "00009887077")
    expect(d.sectionTitle).toBe("Genel Hususlar ve Özel Şartlar")
    expect(d.description).toContain("TALEBE BAŞVURACAK ADAYLARIN DİKKATİNE")
    expect(d.occupations[0]).toEqual({ name: "Greyder Operatörü", experienceYears: 5, experienceMonths: null })
    expect(d.educationMin).toBe("Ortaöğretim (Lise ve Dengi)")
    expect(d.educationMax).toBe("Önlisans")
  })

  test("unknown ad maps to NOT_FOUND with the server message", async () => {
    try {
      parseDetail(await fx("detail-notfound.html"), "00000000001")
      throw new Error("expected throw")
    } catch (e) {
      expect(e).toBeInstanceOf(CliError)
      expect((e as CliError).code).toBe("NOT_FOUND")
      expect((e as CliError).message).toContain("Hata No")
    }
  })
})

describe("text and encoding helpers", () => {
  test("decodeHtml handles numeric and named entities", () => {
    expect(decodeHtml("T&#252;m&#252; &amp; &#214;nlisans &ccedil;")).toBe("Tümü & Önlisans ç")
  })

  test("decodeBody honours windows-1254 and iso-8859-9 charsets", () => {
    // "İŞĞıçö" in windows-1254
    const bytes = new Uint8Array([0xdd, 0xde, 0xd0, 0xfd, 0xe7, 0xf6])
    expect(decodeBody(bytes, "text/html; charset=windows-1254")).toBe("İŞĞıçö")
    expect(decodeBody(bytes, "text/html; charset=ISO-8859-9")).toBe("İŞĞıçö")
    // no charset and invalid UTF-8: falls back to windows-1254
    expect(decodeBody(bytes, "text/html")).toBe("İŞĞıçö")
  })

  test("decodeBody reads UTF-8", () => {
    const bytes = new TextEncoder().encode("Açık İş İlanları")
    expect(decodeBody(bytes, "text/html; charset=utf-8")).toBe("Açık İş İlanları")
  })

  test("trDateToIso and splitLocation", () => {
    expect(trDateToIso("4.12.2026")).toBe("2026-12-04")
    expect(splitLocation("Ülke Geneli Başvuru  (İZMİR / URLA) ")).toEqual({ scope: "Ülke Geneli Başvuru", province: "İZMİR", district: "URLA" })
    expect(splitLocation("İl Geneli Başvuru (ANKARA)")).toEqual({ scope: "İl Geneli Başvuru", province: "ANKARA", district: null })
  })

  test("parseOccupations truncates float codes", () => {
    expect(parseOccupations([{ PrmMeslekKayitNo: 6440.0, PrmMeslekUzmanlikKayitNo: null, Meslek: "Yazılım Mühendisi" }])).toEqual([
      { code: 6440, specializationCode: null, name: "Yazılım Mühendisi" },
    ])
    expect(parseOccupations({ not: "an array" })).toEqual([])
  })

  test("normalizeOccupationTerm keeps Turkish letters", () => {
    expect(normalizeOccupationTerm("Yazılım Müh!")).toBe("yazılım müh")
  })
})

describe("input normalisation and validation", () => {
  test("resolveProvince by code, by name and by ASCII-folded name", () => {
    expect(resolveProvince("35").name).toBe("İZMİR")
    expect(resolveProvince("İstanbul").code).toBe(34)
    expect(resolveProvince("izmir").code).toBe(35)
    expect(resolveProvince("sanliurfa").code).toBe(63)
    expect(resolveProvince("ığdır").code).toBe(76)
    expect(() => resolveProvince("99")).toThrow(CliError)
    expect(() => resolveProvince("Atlantis")).toThrow(CliError)
  })

  test("normalizeJobId accepts short ids and detail URLs", () => {
    expect(normalizeJobId("9890180")).toBe("00009890180")
    expect(normalizeJobId("https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009887077&isyeriTuru=Kamu")).toBe("00009887077")
    expect(() => normalizeJobId("abc")).toThrow(CliError)
  })

  test("validateCriteria rejects sector-specific flags on the wrong sector", () => {
    expect(() => validateCriteria({ sector: "kamu", posted: "all", workType: "tam" })).toThrow(/work-type/)
    expect(() => validateCriteria({ sector: "ozel", posted: "all", period: "daimi" })).toThrow(/period/)
    expect(() => validateCriteria({ sector: "ozel", posted: "all", ilanTuru: "genel" })).toThrow(/ilan-turu/)
    expect(() => validateCriteria({ sector: "ozel", posted: "all", occupationCode: "abc" })).toThrow(/meslek-kodu/)
    expect(() => validateCriteria({ sector: "kamu", posted: "7d", period: "gecici" })).not.toThrow()
  })

  test("buildFormFields maps onto WebForms field names", () => {
    const f = buildFormFields({ query: "yazılım", sector: "kamu", il: 6, posted: "7d", education: "lisans", period: "daimi", occupationCode: "6440" })
    expect(f["ctl04$ctlArananMetin2"]).toBe("yazılım")
    expect(f["ctl04$IsyeriTuruRadios"]).toBe("kamuRadio")
    expect(f["ctl04$ctlIl"]).toBe("6")
    expect(f["ctl04$ctlIlanTarihi"]).toBe("3")
    expect(f["ctl04$ctlOgrenimDurum"]).toBe("1")
    expect(f["ctl04$ctlCalismaPeryodu"]).toBe("2")
    expect(f["ctl04$ctlMeslek$ctlMeslek_MeslekKayitNo"]).toBe("6440")
    expect(f["ctl04$ctlCalismaYeri"]).toBe("1")
  })
})
