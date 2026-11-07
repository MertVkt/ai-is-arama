import { describe, expect, test } from "bun:test";
import {
  decodeHtmlEntities,
  htmlToText,
  parseDetailPage,
  parseListingPage,
  queryApplied,
  relativeToIsoDate,
} from "../src/helpers";
import { fixture } from "./helpers";

const NOW = new Date("2026-11-07T12:00:00Z");

describe("parseListingPage", () => {
  test("city listing: total, cards and Turkish characters", async () => {
    const page = parseListingPage(await fixture("listing-istanbul.html"), NOW);
    expect(page.total).toBe(2397);
    expect(page.results.length).toBe(3);
    expect(page.hasNextPage).toBe(true);
    const first = page.results[0];
    expect(first).toMatchObject({
      id: "1884516",
      title: "Depo Personeli",
      company: "Loya Mağazacılık",
      location: "İstanbul Avrupa",
      postedText: "1 gün önce",
      date: "2026-11-06",
      url: "https://www.secretcv.com/loya-magazacilik/depo-personeli-is-ilanlari-1884516",
    });
    expect(first.districts).toContain("Küçükç");
    expect(page.appliedFilters).toEqual([
      { type: "sh", label: "İstanbul Anadolu" },
      { type: "sh", label: "İstanbul Avrupa" },
    ]);
  });

  test("sponsored showcase links are not counted as cards", async () => {
    const page = parseListingPage(await fixture("listing-istanbul.html"), NOW);
    expect(page.results.map((r) => r.id)).not.toContain("1875812");
  });

  test("keyword listing: hidden company, ad box skipped, keyword badge", async () => {
    const page = parseListingPage(await fixture("listing-keyword-yazilim-gelistirici.html"), NOW);
    expect(page.total).toBe(116);
    expect(page.results.length).toBe(4);
    const hidden = page.results.find((r) => r.id === "1880918");
    expect(hidden?.company).toBe("Firma Adı Gizli");
    expect(hidden?.title).toBe("Bilgi İşlem Sorumlusu");
    for (const r of page.results) {
      expect(r.title).not.toMatch(/[<>]|&[a-z]+;/);
      expect(r.company).not.toBeNull();
    }
    expect(page.appliedFilters).toEqual([{ type: "k", label: "Yazilim Gelistirici" }]);
    expect(queryApplied(page.appliedFilters, "yazilim-gelistirici")).toBe(true);
  });

  test("empty keyword result", async () => {
    const page = parseListingPage(await fixture("listing-empty-keyword.html"), NOW);
    expect(page.total).toBe(0);
    expect(page.results).toEqual([]);
    expect(page.hasNextPage).toBe(false);
  });

  test("detects a query the site silently dropped from a two-segment path", async () => {
    const page = parseListingPage(await fixture("listing-dropped-query.html"), NOW);
    expect(queryApplied(page.appliedFilters, "yazilim-uzmani")).toBe(true);
    expect(queryApplied(page.appliedFilters, "python")).toBe(false);
  });
});

describe("relativeToIsoDate", () => {
  test("Turkish relative dates", () => {
    expect(relativeToIsoDate("Bugün", NOW)).toBe("2026-11-07");
    expect(relativeToIsoDate("Dün", NOW)).toBe("2026-11-06");
    expect(relativeToIsoDate("3 gün önce", NOW)).toBe("2026-11-04");
    expect(relativeToIsoDate("1 ay 9 gün önce", NOW)).toBe("2026-09-29");
    expect(relativeToIsoDate("bilinmiyor", NOW)).toBeNull();
  });
});

describe("parseDetailPage", () => {
  test("hidden-company posting: fields from JSON-LD and attribute table", async () => {
    const url = "https://www.secretcv.com/firma-adi-gizli/bilgi-islem-sorumlusu-is-ilanlari-1880918";
    const d = parseDetailPage(await fixture("detail-1880918.html"), url, "1880918");
    expect(d).toMatchObject({
      id: "1880918",
      title: "Bilgi İşlem Sorumlusu",
      company: "Firma Adı Gizli",
      location: "İstanbul Avrupa",
      employmentType: "Tam Zamanlı",
      datePosted: "2026-10-18",
      deadline: "2026-12-05",
      applyUrl: "https://www.secretcv.com/giris-yap?redirect=1&ilanId=1880918",
      applyRequiresLogin: true,
      url,
    });
    expect(d.districts).toBe("Avcılar, Beylikdüzü, Büyükçekmece, Esenyurt");
    expect(d.sector).toContain("Üretim");
    expect(d.description).toContain("İş Açıklaması:");
    expect(d.description).toContain("- Arıza tespiti yapmak");
    expect(d.description).not.toMatch(/&[a-z]+;|<[a-z]/);
  });

  test("named entities in posting body decode to Turkish letters", async () => {
    const url = "https://www.secretcv.com/mge-akaryakit/bilgi-teknolojileri-uzmani-is-ilanlari-1883754";
    const d = parseDetailPage(await fixture("detail-1883754.html"), url, "1883754");
    expect(d.company).toBe("Mge Akaryakıt");
    expect(d.companyUrl).toBe("https://www.secretcv.com/firma/mge-akaryakit-is-ilanlari");
    expect(d.sector).toBe("Bilgisayar / BT / Internet");
    expect(d.foreignNationalsAccepted).toBe("Hayır");
    expect(d.description).toContain("Sorumluluklar");
    expect(d.description).toContain("güvenliğini");
    expect(d.description).not.toMatch(/- [^\n]+\n\n- /);
  });

  test("throws PARSE_ERROR on a non-posting page", () => {
    expect(() => parseDetailPage("<html><body>nothing</body></html>", "https://www.secretcv.com/x", "1")).toThrow(
      /Failed to parse/
    );
  });
});

describe("text helpers", () => {
  test("decodeHtmlEntities handles Latin-1 names and numeric refs", () => {
    expect(decodeHtmlEntities("g&ouml;rev &uuml;r&uuml;n &ccedil;alışma &Uuml;st")).toBe("görev ürün çalışma Üst");
    expect(decodeHtmlEntities("Carter&#039;s &#x130;zmir &#287;")).toBe("Carter's İzmir ğ");
    expect(decodeHtmlEntities("&unknown;")).toBe("&unknown;");
  });

  test("htmlToText keeps bullets on consecutive lines", () => {
    expect(htmlToText("<p>Giriş</p><ul><li>bir</li> <li>iki</li></ul>")).toBe("Giriş\n\n- bir\n- iki");
  });
});
