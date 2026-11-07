import { describe, test, expect } from "bun:test";
import {
  decodeBody,
  extractCanonical,
  matchesKeyword,
  parseDetailPage,
  parseListingPage,
  unknownSlugs,
} from "../src/helpers";
import { fixture } from "./helpers";

describe("parseListingPage", () => {
  test("parses regular cards with company, location, benefits and snippet", async () => {
    const page = parseListingPage(await fixture("listing-garson-p1.html"));
    expect(page.results.length).toBe(4);
    const first = page.results[0];
    expect(first.id).toBe("4802953");
    expect(first.title).toBe("Garson - Çiftehavuzlar Şube");
    expect(first.company).toBe("Pelit Pastacılık ve Gıda");
    expect(first.location).toBe("İstanbul Anadolu - Kadıköy");
    expect(first.benefits).toBe("Yemek, Yol Yardım Desteği");
    expect(first.url).toBe("https://www.eleman.net/is-ilani/garson-ciftehavuzlar-sube-i4802953");
    expect(first.description).toContain("Pelit Pastaneleri");
  });

  test("reads total pages from the pager <select>", async () => {
    const page = parseListingPage(await fixture("listing-garson-p1.html"));
    expect(page.totalPages).toBe(6);
    expect(page.canonical).toBe("https://www.eleman.net/is-ilanlari/garson");
  });

  test("reads total pages from the '[N Sayfadan X. Sayfa]' title on later pages", async () => {
    const page = parseListingPage(await fixture("listing-garson-p6.html"));
    expect(page.totalPages).toBe(6);
    expect(page.results.length).toBe(2);
  });

  test("parses the showcase (renkli vitrin) card that has no id attribute", async () => {
    const page = parseListingPage(await fixture("listing-barista.html"));
    const showcase = page.results.find((r) => r.id === "4802002");
    expect(showcase).toBeDefined();
    expect(showcase!.company).toBe("New Jersey Coffee House Yenibatı");
    expect(showcase!.location).toBe("Ankara");
    expect(showcase!.badges).toContain("Maaş Bilgisi Olan");
    expect(showcase!.badges).toContain("Telefonla başvuru yapabilirsiniz.");
  });

  test("keeps Turkish characters intact", async () => {
    const listing = parseListingPage(await fixture("listing-barista.html"));
    const detail = parseDetailPage(await fixture("detail-4802953.html"), "u", "0");
    const all = JSON.stringify(listing.results) + JSON.stringify(detail);
    for (const ch of ["ğ", "ü", "ş", "ı", "ö", "ç", "İ", "Ş", "Ç"]) {
      expect(all).toContain(ch);
    }
    expect(all).not.toContain("�");
    expect(all).not.toMatch(/Ã|Ä±|Å/); // classic UTF-8-read-as-Latin-1 mojibake
  });

  test("returns no results for the 'Sonuç Bulunamadı' page", async () => {
    const page = parseListingPage(await fixture("listing-empty.html"));
    expect(page.results).toEqual([]);
    expect(page.totalPages).toBeNull();
  });
});

describe("unknown slug detection", () => {
  test("flags a slug that fell back to the generic listing", async () => {
    const html = await fixture("listing-unknown-slug.html");
    expect(unknownSlugs(["xqzzy-nonsense"], extractCanonical(html))).toEqual(["xqzzy-nonsense"]);
  });

  test("accepts slugs present in the canonical in either order", () => {
    const canonical = "https://www.eleman.net/is-ilanlari/mugla/garson";
    expect(unknownSlugs(["garson", "mugla"], canonical)).toEqual([]);
    expect(unknownSlugs(["mugla", "xyz"], "https://www.eleman.net/is-ilanlari/mugla")).toEqual(["xyz"]);
  });
});

describe("matchesKeyword", () => {
  test("matches all words, Turkish-case-insensitively", async () => {
    const page = parseListingPage(await fixture("listing-garson-p1.html"));
    const hits = page.results.filter((r) => matchesKeyword(r, "KADIKÖY garson"));
    expect(hits.map((r) => r.id)).toContain("4802953");
    expect(page.results.filter((r) => matchesKeyword(r, "zzzz")).length).toBe(0);
  });
});

describe("parseDetailPage", () => {
  test("parses a full-time posting with JSON-LD and visible facts", async () => {
    const d = parseDetailPage(await fixture("detail-4802953.html"), "u", "0");
    expect(d.id).toBe("4802953");
    expect(d.title).toBe("Garson - Çiftehavuzlar Şube");
    expect(d.company).toBe("Pelit Pastacılık ve Gıda");
    expect(d.companyUrl).toBe("https://www.eleman.net/firma/pelit-pastacilik-ve-gida-f1207068");
    expect(d.location).toBe("İstanbul Anadolu - Kadıköy");
    expect(d.datePosted).toBe("2026-11-07");
    expect(d.validThrough).toBe("2027-11-07");
    expect(d.employmentType).toBe("Tam Zamanlı");
    expect(d.experience).toBe("1-2 Yıl");
    expect(d.ageRange).toBe("20 - 40 arası");
    expect(d.benefits).toBe("Yemek, Yol Yardım Desteği");
    expect(d.phoneApplication).toBe(false);
    expect(d.applyUrl).toBe("https://www.eleman.net/aday/basvuru_yap.php?ilan_id=4802953");
    expect(d.description).toContain("Sorumluluklar\n- Misafirleri güler yüzle karşılamak");
    expect(d.description).not.toContain("<br");
  });

  test("parses salary, openings, gender and part-time", async () => {
    const d = parseDetailPage(await fixture("detail-4801036.html"), "u", "0");
    expect(d.salary).toBe("150 TL");
    expect(d.openings).toBe("2");
    expect(d.gender).toBe("Kadın veya Erkek");
    expect(d.employmentType).toBe("Part Time (Yarı Zamanlı)");
    expect(d.location).toBe("İstanbul Anadolu - Çekmeköy");
  });

  test("flags phone applications", async () => {
    const d = parseDetailPage(await fixture("detail-4800784.html"), "u", "0");
    expect(d.phoneApplication).toBe(true);
    expect(d.title).toBe("VIP GARSON");
  });
});

describe("decodeBody", () => {
  test("decodes windows-1254 bodies declared in Content-Type", () => {
    const bytes = new Uint8Array([0x47, 0xfd, 0xf0, 0xfe, 0xdd, 0xd0, 0xde]); // "GığşİĞŞ"
    expect(decodeBody(bytes, "text/html; charset=windows-1254")).toBe("GığşİĞŞ");
  });

  test("decodes ISO-8859-9 bodies declared only in <meta>", () => {
    const head = new TextEncoder().encode('<meta charset="iso-8859-9">');
    const bytes = new Uint8Array([...head, 0xe7, 0xfc, 0xf6]);
    expect(decodeBody(bytes, "text/html")).toBe('<meta charset="iso-8859-9">çüö');
  });

  test("defaults to UTF-8", () => {
    const bytes = new TextEncoder().encode("Muğla İş İlanları");
    expect(decodeBody(bytes, null)).toBe("Muğla İş İlanları");
  });
});
