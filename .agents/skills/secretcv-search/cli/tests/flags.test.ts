import { afterEach, describe, expect, test } from "bun:test";
import {
  CliError,
  buildListingUrl,
  buildSearchPlan,
  htmlFetch,
  isAllowedByRobots,
  isFetchable,
  resetRateLimiter,
  resolveCity,
  resolveDetailTarget,
  resolveType,
  slugify,
} from "../src/helpers";
import { validateSearchFlags, type ValidationError } from "../src/commands/search";
import { parseErrorJSON, runCLI } from "./helpers";

const base = { page: 1 };
const code = (r: unknown) => (r as ValidationError).code;

describe("validateSearchFlags", () => {
  test("requires at least one filter", () => {
    expect(code(validateSearchFlags({ ...base }))).toBe("MISSING_REQUIRED");
  });

  test("accepts supported combinations", () => {
    for (const f of [
      { query: "garson" },
      { query: "garson", city: "izmir" },
      { query: "garson", type: "part-time" },
      { query: "garson", sector: "restorancilik" },
      { city: "muğla", district: "bodrum" },
      { city: "izmir", type: "remote" },
      { type: "remote" },
      { sector: "bilgisayar-bt-internet" },
    ]) {
      expect("code" in validateSearchFlags({ ...base, ...f })).toBe(false);
    }
  });

  test("rejects three-segment and unsupported combinations", () => {
    expect(code(validateSearchFlags({ ...base, query: "garson", city: "izmir", type: "remote" }))).toBe("INVALID_COMBINATION");
    expect(code(validateSearchFlags({ ...base, query: "garson", city: "mugla", district: "bodrum" }))).toBe("INVALID_COMBINATION");
    expect(code(validateSearchFlags({ ...base, district: "bodrum" }))).toBe("INVALID_COMBINATION");
    expect(code(validateSearchFlags({ ...base, city: "izmir", sector: "turizm" }))).toBe("INVALID_COMBINATION");
  });

  test("rejects page > 1 because paging is robots-disallowed", () => {
    expect(code(validateSearchFlags({ ...base, city: "izmir", page: 2 }))).toBe("PAGINATION_DISALLOWED");
    expect(code(validateSearchFlags({ ...base, city: "izmir", page: 0 }))).toBe("INVALID_ARGUMENT");
  });

  test("rejects bad limit, city, type and sector", () => {
    expect(code(validateSearchFlags({ ...base, city: "izmir", limit: 0 }))).toBe("INVALID_ARGUMENT");
    expect(code(validateSearchFlags({ ...base, city: "atlantis" }))).toBe("INVALID_ARGUMENT");
    expect(code(validateSearchFlags({ ...base, type: "weekend" }))).toBe("INVALID_ARGUMENT");
    expect(code(validateSearchFlags({ ...base, sector: "bilisim" }))).toBe("INVALID_ARGUMENT");
    expect(code(validateSearchFlags({ ...base, query: "!!!" }))).toBe("INVALID_ARGUMENT");
  });
});

describe("slugify and resolution", () => {
  test("Turkish-aware slugs", () => {
    expect(slugify("Muğla")).toBe("mugla");
    expect(slugify("İzmir")).toBe("izmir");
    expect(slugify("Yazılım Geliştirici")).toBe("yazilim-gelistirici");
    expect(slugify("ÇAĞRI MERKEZİ")).toBe("cagri-merkezi");
    expect(slugify("Kadıköy")).toBe("kadikoy");
    expect(slugify("  Şef  Garson ")).toBe("sef-garson");
  });

  test("city aliases and types", () => {
    expect(resolveCity("İstanbul")).toBe("istanbul");
    expect(resolveCity("Afyonkarahisar")).toBe("afyon");
    expect(resolveCity("İçel")).toBe("mersin");
    expect(resolveType("remote")).toBe("uzaktan-calisma");
    expect(resolveType("hibrit")).toBe("hibrit");
  });
});

describe("URL building", () => {
  test("listing paths", () => {
    expect(buildListingUrl(["izmir"])).toBe("https://www.secretcv.com/is-ilanlari/izmir-is-ilanlari");
    expect(buildListingUrl(["izmir", "garson"])).toBe("https://www.secretcv.com/is-ilanlari/izmir/garson-is-ilanlari");
    expect(() => buildListingUrl(["a", "b", "c"])).toThrow();
  });

  test("search plans", () => {
    const empty = { query: null, city: null, district: null, type: null, sector: null };
    expect(buildSearchPlan({ ...empty, query: "garson", city: "izmir" })).toEqual({
      primary: "https://www.secretcv.com/is-ilanlari/izmir/garson-is-ilanlari",
      keywordFallback: "https://www.secretcv.com/is-ilanlari/garson-is-ilanlari",
    });
    expect(buildSearchPlan({ ...empty, type: "uzaktan-calisma", city: "izmir" }).primary).toBe(
      "https://www.secretcv.com/is-ilanlari/uzaktan-calisma/izmir-is-ilanlari"
    );
    expect(buildSearchPlan({ ...empty, city: "mugla", district: "bodrum" }).primary).toBe(
      "https://www.secretcv.com/is-ilanlari/mugla/bodrum-is-ilanlari"
    );
  });

  test("detail targets", () => {
    expect(resolveDetailTarget("1880918")).toEqual({ id: "1880918", url: "https://www.secretcv.com/ilan/1880918" });
    expect(
      resolveDetailTarget("https://www.secretcv.com/firma-adi-gizli/bilgi-islem-sorumlusu-is-ilanlari-1880918")
    ).toEqual({
      id: "1880918",
      url: "https://www.secretcv.com/firma-adi-gizli/bilgi-islem-sorumlusu-is-ilanlari-1880918",
    });
    expect(() => resolveDetailTarget("https://example.com/x-is-ilanlari-1")).toThrow(CliError);
    expect(() => resolveDetailTarget("abc")).toThrow(CliError);
  });
});

describe("robots.txt guard", () => {
  test("disallowed forms", () => {
    for (const p of [
      "/is-ilanlari/ara",
      "/is-ilanlari/ara?k=python",
      "/is-ilanlari/istanbul-is-ilanlari/?sf=2",
      "/is-ilanlari/istanbul-is-ilanlari/?p=3",
      "/is-ilanlari/istanbul-is-ilanlari/?s=turizm",
      "/banner/redirect/abc",
      "/hesabim/ayarlar",
    ]) {
      expect(isAllowedByRobots(`https://www.secretcv.com${p}`)).toBe(false);
    }
  });

  test("the forms we use are allowed and fetchable", () => {
    for (const p of [
      "/is-ilanlari/izmir/garson-is-ilanlari",
      "/is-ilanlari/yazilim-gelistirici-is-ilanlari",
      "/ilan/1880918",
      "/firma-adi-gizli/bilgi-islem-sorumlusu-is-ilanlari-1880918",
    ]) {
      expect(isFetchable(`https://www.secretcv.com${p}`)).toBe(true);
    }
  });

  test("query strings and other hosts are never fetched", () => {
    expect(isFetchable("https://www.secretcv.com/is-ilanlari/istanbul-is-ilanlari?l=50")).toBe(false);
    expect(isFetchable("https://example.com/is-ilanlari/izmir-is-ilanlari")).toBe(false);
  });
});

describe("htmlFetch", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetRateLimiter();
  });

  test("refuses disallowed URLs without a network call", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("");
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.secretcv.com/is-ilanlari/ara?k=x")).rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" });
    expect(called).toBe(false);
  });

  test("reports Cloudflare bot protection clearly", async () => {
    globalThis.fetch = (async () =>
      new Response("<html><title>Just a moment...</title><div id='cf-chl'></div></html>", { status: 403 })) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.secretcv.com/is-ilanlari/izmir-is-ilanlari")).rejects.toMatchObject({
      code: "BLOCKED",
      message: expect.stringMatching(/Cloudflare bot protection/),
    });
  });

  test("sends the honest User-Agent and maps 404 to NOT_FOUND", async () => {
    let ua = "";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      ua = (init.headers as Record<string, string>)["User-Agent"];
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.secretcv.com/ilan/1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(ua).toMatch(/^ai-job-search-secretcv-cli\//);
  });
});

describe("htmlFetch redirects (manual, guarded)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetRateLimiter();
  });

  const redirect = (location: string, status = 302) => new Response("", { status, headers: { Location: location } });

  test("follows an allowed relative redirect and reports the final URL", async () => {
    const seen: Array<{ url: string; redirect: string | undefined }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, redirect: init.redirect });
      if (url.endsWith("/ilan/1880918")) return redirect("/firma-adi-gizli/bilgi-islem-sorumlusu-is-ilanlari-1880918");
      return new Response("<html>ok</html>", { status: 200 });
    }) as unknown as typeof fetch;
    const page = await htmlFetch("https://www.secretcv.com/ilan/1880918");
    expect(page.url).toBe("https://www.secretcv.com/firma-adi-gizli/bilgi-islem-sorumlusu-is-ilanlari-1880918");
    expect(page.html).toBe("<html>ok</html>");
    expect(seen.map((s) => s.url)).toEqual([
      "https://www.secretcv.com/ilan/1880918",
      "https://www.secretcv.com/firma-adi-gizli/bilgi-islem-sorumlusu-is-ilanlari-1880918",
    ]);
    expect(seen.every((s) => s.redirect === "manual")).toBe(true);
  });

  test("refuses a disallowed redirect target without requesting it", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      return redirect("/giris-yap?redirect=1&ilanId=1");
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.secretcv.com/ilan/1")).rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" });
    expect(seen).toEqual(["https://www.secretcv.com/ilan/1"]);
  });

  test("refuses a redirect to another host without requesting it", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      return redirect("https://example.com/x-is-ilanlari-1", 301);
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.secretcv.com/ilan/1")).rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" });
    expect(seen).toEqual(["https://www.secretcv.com/ilan/1"]);
  });

  test("stops after 3 hops", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      return redirect(`/ilan/${n + 1}`);
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.secretcv.com/ilan/1")).rejects.toMatchObject({
      code: "API_ERROR",
      message: expect.stringMatching(/Too many redirects/),
    });
    expect(n).toBe(4); // the original request plus 3 followed hops
  });
});

describe('"ara" prefix collision', () => {
  test("query slugs starting with ara are refused with an explicit message", () => {
    for (const q of ["araç şoförü", "araştırma görevlisi"]) {
      const r = validateSearchFlags({ ...base, query: q }) as ValidationError;
      expect(r.code).toBe("ROBOTS_DISALLOWED");
      expect(r.error).toMatch(/\/is-ilanlari\/ara/);
      expect(r.error).toMatch(/şoför/);
      expect(r.error).toMatch(/--sector/);
    }
  });

  test("htmlFetch explains the collision for a keyword path", async () => {
    await expect(htmlFetch("https://www.secretcv.com/is-ilanlari/arac-soforu-is-ilanlari")).rejects.toMatchObject({
      code: "ROBOTS_DISALLOWED",
      message: expect.stringMatching(/collides with .*Disallow: \/is-ilanlari\/ara/),
    });
  });

  test("ex-convict and veteran-family types resolve", () => {
    expect(resolveType("ex-convict")).toBe("eski-hukumlu");
    expect(resolveType("veteran-family")).toBe("sehit-yakini-teror-magduru");
  });
});

describe("CLI flag errors (no network)", () => {
  test("search without filters", async () => {
    const r = await runCLI(["search"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("MISSING_REQUIRED");
  });

  test("search --page 2", async () => {
    const r = await runCLI(["search", "--city", "izmir", "--page", "2"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("PAGINATION_DISALLOWED");
  });

  test("detail without id", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("MISSING_REQUIRED");
  });

  test("detail with a foreign URL", async () => {
    const r = await runCLI(["detail", "https://example.com/a-is-ilanlari-1"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("INVALID_ARGUMENT");
  });
});
