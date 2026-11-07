import { afterEach, describe, expect, test } from "bun:test"
import { IskurSession, isAllowedByRobots, isBotCheck, isFetchable, runSearch } from "../src/helpers"

// All network access is mocked; nothing here touches esube.iskur.gov.tr.

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): string[] {
  const seen: string[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push(url)
    return handler(url, init)
  }) as unknown as typeof fetch
  return seen
}

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } })

describe("robots.txt guard", () => {
  test("only /Meslek/ViewMeslekDetayPopUp.aspx/ is disallowed", () => {
    expect(isAllowedByRobots("https://esube.iskur.gov.tr/Meslek/ViewMeslekDetayPopUp.aspx/123")).toBe(false)
    expect(isAllowedByRobots("https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx")).toBe(true)
    expect(isAllowedByRobots("https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=00009890180")).toBe(true)
  })

  test("other hosts are never fetchable", () => {
    expect(isFetchable("https://example.com/Istihdam/AcikIsIlanAra.aspx")).toBe(false)
  })

  test("request refuses a disallowed URL without a network call", async () => {
    const seen = mockFetch(() => html("x"))
    const s = new IskurSession(0)
    await expect(s.request("/Meslek/ViewMeslekDetayPopUp.aspx/1")).rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" })
    expect(seen).toEqual([])
  })

  test("a redirect to a disallowed URL is refused before it is requested", async () => {
    const seen = mockFetch(() => new Response("", { status: 302, headers: { Location: "/Meslek/ViewMeslekDetayPopUp.aspx/9" } }))
    const s = new IskurSession(0)
    await expect(s.request("/Istihdam/AcikIsIlanAra.aspx")).rejects.toMatchObject({ code: "ROBOTS_DISALLOWED" })
    expect(seen).toEqual(["https://esube.iskur.gov.tr/Istihdam/AcikIsIlanAra.aspx"])
  })

  test("an allowed redirect is followed with redirect: manual", async () => {
    const modes: Array<string | undefined> = []
    const seen = mockFetch((url, init) => {
      modes.push(init.redirect)
      return url.endsWith("/a") ? new Response("", { status: 302, headers: { Location: "/b" } }) : html("ok")
    })
    const s = new IskurSession(0)
    expect(await s.request("/a")).toBe("ok")
    expect(seen).toEqual(["https://esube.iskur.gov.tr/a", "https://esube.iskur.gov.tr/b"])
    expect(modes.every((m) => m === "manual")).toBe(true)
  })
})

describe("BLOCKED and retries", () => {
  for (const status of [403, 429]) {
    test(`HTTP ${status} stops at once with BLOCKED (no retry)`, async () => {
      const seen = mockFetch(() => html("nope", status))
      const s = new IskurSession(0)
      await expect(s.request("/Istihdam/AcikIsIlanAra.aspx")).rejects.toMatchObject({ code: "BLOCKED" })
      expect(seen.length).toBe(1)
    })
  }

  test("5xx is retried with backoff", async () => {
    let n = 0
    const seen = mockFetch(() => (++n === 1 ? html("err", 503) : html("ok")))
    const s = new IskurSession(0)
    expect(await s.request("/Istihdam/AcikIsIlanAra.aspx")).toBe("ok")
    expect(seen.length).toBe(2)
  })

  test("a captcha page is BLOCKED even when it mentions AcikIs", async () => {
    mockFetch(() => html('<form action="AcikIsIlanAra.aspx"><div class="g-recaptcha" data-sitekey="x"></div></form>'))
    const s = new IskurSession(0)
    await expect(s.request("/Istihdam/AcikIsIlanAra.aspx")).rejects.toMatchObject({ code: "BLOCKED" })
  })

  test("isBotCheck spots common challenge markers", () => {
    expect(isBotCheck("<title>Just a moment...</title>")).toBe(true)
    expect(isBotCheck("<script src='/cdn-cgi/challenge-platform/x'></script>")).toBe(true)
    expect(isBotCheck("<div id='ctl04_ctlGridAcikIslerListeDetail'></div>")).toBe(false)
  })
})

describe("search page sanity", () => {
  test("a page without the search form is an error, not an empty result", async () => {
    mockFetch(() => html("<html><body>Bakım çalışması</body></html>"))
    const s = new IskurSession(0)
    await expect(
      runSearch(s, { sector: "ozel", posted: "all" }, 1, 1),
    ).rejects.toMatchObject({ code: "PARSE_ERROR" })
  })
})
