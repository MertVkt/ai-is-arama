import { afterEach, describe, expect, test } from "bun:test";
import {
  CliError,
  buildListingUrl,
  htmlFetch,
  isAllowedByRobots,
  resetRateLimiter,
  resolveDetailTarget,
  slugify,
} from "../src/helpers";
import { validateSearchFlags } from "../src/commands/search";
import { parseErrorJSON, runCLI } from "./helpers";

const base = { page: 1, pages: 1 };

describe("validateSearchFlags", () => {
  test("requires at least one of position, city, filter", () => {
    expect(validateSearchFlags({ ...base })?.code).toBe("MISSING_REQUIRED");
    expect(validateSearchFlags({ ...base, keyword: "garson" })?.code).toBe("MISSING_REQUIRED");
  });

  test("accepts any two segments", () => {
    expect(validateSearchFlags({ ...base, position: "garson", city: "izmir" })).toBeNull();
    expect(validateSearchFlags({ ...base, city: "mugla", filter: "part-time" })).toBeNull();
    expect(validateSearchFlags({ ...base, position: "garson", filter: "part-time" })).toBeNull();
  });

  test("rejects three segments", () => {
    expect(validateSearchFlags({ ...base, position: "garson", city: "izmir", filter: "urgent" })?.code).toBe("INVALID_COMBINATION");
  });

  test("rejects bad page, pages and limit values", () => {
    expect(validateSearchFlags({ ...base, city: "izmir", page: 0 })?.code).toBe("INVALID_ARGUMENT");
    expect(validateSearchFlags({ ...base, city: "izmir", pages: 6 })?.code).toBe("INVALID_ARGUMENT");
    expect(validateSearchFlags({ ...base, city: "izmir", limit: 0 })?.code).toBe("INVALID_ARGUMENT");
  });

  test("rejects unknown filters", () => {
    expect(validateSearchFlags({ ...base, filter: "remote" })?.code).toBe("INVALID_ARGUMENT");
  });
});

describe("slugify and URL building", () => {
  test("Turkish-aware slugs", () => {
    expect(slugify("Muğla")).toBe("mugla");
    expect(slugify("İzmir")).toBe("izmir");
    expect(slugify("Satış Temsilcisi")).toBe("satis-temsilcisi");
    expect(slugify("Kadıköy")).toBe("kadikoy");
    expect(slugify("ÇAĞRI MERKEZİ")).toBe("cagri-merkezi");
    expect(slugify("Şef Garson")).toBe("sef-garson");
  });

  test("city comes before position, filters last, page as ?sy=", () => {
    expect(buildListingUrl({ position: "Garson", city: "Muğla" }).url).toBe("https://www.eleman.net/is-ilanlari/mugla/garson");
    expect(buildListingUrl({ city: "Bodrum", filter: "part-time" }, 3).url).toBe(
      "https://www.eleman.net/is-ilanlari/bodrum/yari-zamanli-part-time?sy=3"
    );
    expect(buildListingUrl({ position: "barista" }, 1).url).toBe("https://www.eleman.net/is-ilanlari/barista");
  });
});

describe("robots.txt guard", () => {
  test("allows the URL forms the CLI uses", () => {
    expect(isAllowedByRobots("https://www.eleman.net/is-ilanlari/mugla/garson")).toBe(true);
    expect(isAllowedByRobots("https://www.eleman.net/is-ilanlari/garson?sy=2")).toBe(true);
    expect(isAllowedByRobots("https://www.eleman.net/is-ilani/garson-i4802953")).toBe(true);
  });

  test("blocks disallowed forms", () => {
    expect(isAllowedByRobots("https://www.eleman.net/is_ilanlari.php")).toBe(false);
    expect(isAllowedByRobots("https://www.eleman.net/aday/basvuru_yap.php?ilan_id=4802953")).toBe(false);
    expect(isAllowedByRobots("https://www.eleman.net/is-ilanlari?t=arama&q=x")).toBe(false);
    expect(isAllowedByRobots("https://www.eleman.net/ilan/garson.html")).toBe(false);
    expect(isAllowedByRobots("https://www.eleman.net/arama_complete.php")).toBe(false);
  });

  test("htmlFetch refuses disallowed URLs without touching the network", async () => {
    await expect(htmlFetch("https://www.eleman.net/is_ilanlari.php")).rejects.toThrow(/robots\.txt/);
  });
});

describe("resolveDetailTarget", () => {
  test("accepts numeric ids, i-prefixed ids and posting URLs", () => {
    expect(resolveDetailTarget("4802953")).toEqual({ id: "4802953", url: "https://www.eleman.net/is-ilani/ilan-i4802953" });
    expect(resolveDetailTarget("i4802953").id).toBe("4802953");
    expect(resolveDetailTarget("https://www.eleman.net/is-ilani/garson-ciftehavuzlar-sube-i4802953")).toEqual({
      id: "4802953",
      url: "https://www.eleman.net/is-ilani/garson-ciftehavuzlar-sube-i4802953",
    });
  });

  test("rejects other sites and junk", () => {
    expect(() => resolveDetailTarget("https://www.kariyer.net/is-ilani/x-123")).toThrow(CliError);
    expect(() => resolveDetailTarget("garson")).toThrow(/Invalid job id/);
  });
});

describe("bot protection", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetRateLimiter();
  });

  test("reports a Cloudflare challenge clearly as BLOCKED", async () => {
    globalThis.fetch = (async () =>
      new Response("<html><title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/x'></script></html>", {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "text/html; charset=utf-8" },
      })) as unknown as typeof fetch;

    const err = await htmlFetch("https://www.eleman.net/is-ilanlari/garson").catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe("BLOCKED");
    expect(err.message).toMatch(/Cloudflare bot protection/);
  });
});

describe("htmlFetch redirects (manual, guarded)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetRateLimiter();
  });

  const redirect = (location: string, status = 301) => new Response("", { status, headers: { Location: location } });

  test("follows an allowed redirect (bare-id detail) and reports the final URL", async () => {
    const seen: Array<{ url: string; redirect: string | undefined }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, redirect: init.redirect });
      if (url.endsWith("/is-ilani/ilan-i4802953")) return redirect("/is-ilani/garson-i4802953");
      return new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }) as unknown as typeof fetch;
    const page = await htmlFetch("https://www.eleman.net/is-ilani/ilan-i4802953");
    expect(page.url).toBe("https://www.eleman.net/is-ilani/garson-i4802953");
    expect(page.html).toBe("<html>ok</html>");
    expect(seen.map((s) => s.url)).toEqual([
      "https://www.eleman.net/is-ilani/ilan-i4802953",
      "https://www.eleman.net/is-ilani/garson-i4802953",
    ]);
    expect(seen.every((s) => s.redirect === "manual")).toBe(true);
  });

  test("refuses a disallowed redirect target without requesting it", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      return redirect("/is_ilanlari.php");
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.eleman.net/is-ilanlari/garson")).rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" });
    expect(seen).toEqual(["https://www.eleman.net/is-ilanlari/garson"]);
  });

  test("refuses a redirect to another host without requesting it", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(url);
      return redirect("https://example.com/is-ilanlari/garson", 302);
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.eleman.net/is-ilanlari/garson")).rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" });
    expect(seen).toEqual(["https://www.eleman.net/is-ilanlari/garson"]);
  });

  test("stops after 3 hops", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      return redirect(`/is-ilanlari/slug${n}`);
    }) as unknown as typeof fetch;
    await expect(htmlFetch("https://www.eleman.net/is-ilanlari/garson")).rejects.toMatchObject({
      code: "API_ERROR",
      message: expect.stringMatching(/Too many redirects/),
    });
    expect(n).toBe(4); // the original request plus 3 followed hops
  });
});

describe("CLI flag errors (no network)", () => {
  test("search without position/city/filter exits 1 with MISSING_REQUIRED", async () => {
    const r = await runCLI(["search", "--keyword", "garson"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("MISSING_REQUIRED");
  });

  test("three segments exit 1 with INVALID_COMBINATION", async () => {
    const r = await runCLI(["search", "--position", "garson", "--city", "izmir", "--filter", "urgent"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("INVALID_COMBINATION");
  });

  test("detail without an argument exits 1 with MISSING_REQUIRED", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("MISSING_REQUIRED");
  });

  test("detail with a foreign URL exits 1 with INVALID_ARGUMENT", async () => {
    const r = await runCLI(["detail", "https://example.com/is-ilani/x-i1"]);
    expect(r.exitCode).toBe(1);
    expect(parseErrorJSON(r).code).toBe("INVALID_ARGUMENT");
  });
});
