export const BASE_URL = "https://www.eleman.net"

/**
 * Honest, identifiable User-Agent. We do not pretend to be a browser.
 */
export const USER_AGENT =
  "ai-job-search-elemannet-cli/1.0 (personal job-search assistant; low volume; respects robots.txt)"

/** Delay between consecutive requests made by one CLI process. */
export const REQUEST_DELAY_MS = 1200

/** Hard cap on listing pages fetched by a single `search` call. */
export const MAX_PAGES = 5

/** eleman.net shows 30 postings per listing page (plus an occasional showcase card). */
export const PER_PAGE = 30

/**
 * Filter slugs that eleman.net exposes as clean listing paths
 * (https://www.eleman.net/is-ilanlari/<slug>). Verified live: each one has
 * its own canonical URL and does not fall back to the generic listing.
 */
export const FILTER_SLUGS: Record<string, string> = {
  "part-time": "yari-zamanli-part-time",
  "full-time": "tam-zamanli-full-time",
  urgent: "acil",
  salary: "maasi-acik",
  benefits: "yan-hakli",
  phone: "telefonlu",
  disabled: "engelli",
  student: "ogrenci",
  retired: "emekli",
  intern: "staj",
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export class CliError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// robots.txt guard
// ---------------------------------------------------------------------------

/**
 * Disallow rules from https://www.eleman.net/robots.txt (User-agent: *),
 * copied verbatim (file Last-Modified: 2025-12-29). Every URL the CLI fetches
 * is checked against these before the request goes out, including every
 * redirect hop.
 */
export const ROBOTS_DISALLOW = [
  "/*.asp$",
  "/*.html$",
  "/*.htm$",
  "*?t=arama*",
  "*?yazi=*",
  "*?uyelik_tipi=*",
  "*?tip=*",
  "*?ilan_id=*",
  "*?t=*",
  "*?wbtrck=*",
  "/favori.php",
  "/resim_goster.php",
  "/uye_yorum.php",
  "/dogrulama_kodu.php",
  "/basvuru_yap.php",
  "/cv_guncelle.php",
  "/eleman.php",
  "/is_ilanlari.php",
  "/firmalar.php",
  "/arama_complete.php",
]

function ruleToRegex(rule: string): RegExp {
  const anchored = rule.endsWith("$")
  const body = anchored ? rule.slice(0, -1) : rule
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp("^" + escaped + (anchored ? "$" : ""))
}

const ROBOTS_REGEXES = ROBOTS_DISALLOW.map(ruleToRegex)

/** True when the path (+ query) of the URL is not matched by any Disallow rule. */
export function isAllowedByRobots(url: string): boolean {
  const u = new URL(url, BASE_URL)
  const target = u.pathname + u.search
  return !ROBOTS_REGEXES.some((re) => re.test(target))
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

let lastRequestAt = 0

async function politeWait(): Promise<void> {
  const wait = lastRequestAt + REQUEST_DELAY_MS - Date.now()
  if (lastRequestAt > 0 && wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

/** Test hook: forget the last request time so unit tests do not sleep. */
export function resetRateLimiter(): void {
  lastRequestAt = 0
}

/**
 * Decode a response body using the declared charset. Older Turkish sites use
 * windows-1254 / ISO-8859-9; eleman.net is UTF-8 today, but we honour whatever
 * the Content-Type header or <meta charset> says.
 */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  let charset = contentType?.match(/charset=["']?([\w-]+)/i)?.[1]
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096))
    charset =
      head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
      head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1]
  }
  const label = (charset ?? "utf-8").toLowerCase()
  try {
    return new TextDecoder(label as ConstructorParameters<typeof TextDecoder>[0]).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
}

export function isBotChallenge(status: number, body: string): boolean {
  if (![403, 429, 503].includes(status) && !/<title>\s*Just a moment/i.test(body)) return false
  return /just a moment|cf-chl|challenge-platform|attention required|cf-browser-verification/i.test(body)
}

export interface FetchedPage {
  url: string
  status: number
  html: string
}

/** Redirects are followed by hand, at most this many hops per request. */
export const MAX_REDIRECTS = 3

/** Only www.eleman.net URLs that pass the robots.txt rules are ever requested. */
export function isFetchable(url: string): boolean {
  const u = new URL(url, BASE_URL)
  return u.protocol === "https:" && u.hostname === "www.eleman.net" && isAllowedByRobots(url)
}

function assertFetchable(url: string, redirectedFrom?: string): void {
  if (isFetchable(url)) return
  throw new CliError(
    redirectedFrom
      ? `Refusing to follow redirect from ${redirectedFrom} to ${url}: not a www.eleman.net URL allowed by robots.txt`
      : `Refusing to fetch ${url}: disallowed by eleman.net robots.txt (or not a www.eleman.net URL)`,
    "ROBOTS_DISALLOWED"
  )
}

/** One GET with redirect: "manual", retrying 429/5xx with backoff. */
async function requestOnce(url: string): Promise<{ response: Response; html: string }> {
  const maxRetries = 2
  let delay = 2000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await politeWait()
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr,en;q=0.8",
      },
      redirect: "manual",
    })
    const bytes = new Uint8Array(await response.arrayBuffer())
    const html = decodeBody(bytes, response.headers.get("content-type"))

    if (isBotChallenge(response.status, html)) {
      throw new CliError(
        "eleman.net is blocking automated requests with Cloudflare bot protection. Skip this portal or use the WebSearch fallback; do not retry.",
        "BLOCKED"
      )
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new CliError(`Request failed: ${response.status} ${response.statusText}`, "API_ERROR")
      }
      await new Promise((r) => setTimeout(r, delay))
      delay *= 2
      continue
    }
    return { response, html }
  }
  throw new CliError("Request failed after max retries", "API_ERROR")
}

/**
 * Fetch a page. Redirects are never followed automatically: on a 3xx the
 * Location is resolved against the current URL and checked with isFetchable
 * BEFORE it is requested. At most MAX_REDIRECTS hops are followed.
 */
export async function htmlFetch(url: string): Promise<FetchedPage> {
  assertFetchable(url)
  let current = url
  for (let hop = 0; ; hop++) {
    const { response, html } = await requestOnce(current)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new CliError(`Redirect ${response.status} without a Location header`, "API_ERROR")
      if (hop >= MAX_REDIRECTS) {
        throw new CliError(`Too many redirects (more than ${MAX_REDIRECTS}) starting at ${url}; stopping.`, "API_ERROR")
      }
      const next = new URL(location, current).toString()
      assertFetchable(next, current)
      current = next
      continue
    }
    if (response.status === 404) throw new CliError("Job not found", "NOT_FOUND")
    if (!response.ok) throw new CliError(`Request failed: ${response.status} ${response.statusText}`, "API_ERROR")
    return { url: current, status: response.status, html }
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ")
}

export function cleanText(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** HTML fragment to readable multi-line plain text (keeps <br> / </p> breaks). */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
  return decodeHtmlEntities(stripTags(withBreaks))
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Turkish-aware slug, matching eleman.net's own URL slugs:
 * "Satış Temsilcisi" -> "satis-temsilcisi", "Muğla" -> "mugla", "İzmir" -> "izmir".
 */
export function slugify(text: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" }
  return text
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// ---------------------------------------------------------------------------
// Listing (search) URLs and parsing
// ---------------------------------------------------------------------------

export interface SearchOptions {
  position?: string
  city?: string
  filter?: string
}

/**
 * Build the path-based listing URL. eleman.net accepts at most two slug
 * segments after /is-ilanlari (a third segment 301-redirects and drops it).
 */
export function buildListingUrl(opts: SearchOptions, page = 1): { url: string; slugs: string[] } {
  const slugs: string[] = []
  if (opts.city) slugs.push(slugify(opts.city))
  if (opts.position) slugs.push(slugify(opts.position))
  if (opts.filter) {
    const f = FILTER_SLUGS[opts.filter]
    if (!f) {
      throw new CliError(
        `Unknown --filter '${opts.filter}'. Use one of: ${Object.keys(FILTER_SLUGS).join(", ")}`,
        "INVALID_ARGUMENT"
      )
    }
    slugs.push(f)
  }
  if (slugs.some((s) => !s)) throw new CliError("Empty --position or --city after normalisation", "INVALID_ARGUMENT")
  if (slugs.length > 2) {
    throw new CliError(
      "eleman.net listing paths support at most two of --city, --position, --filter at once. Drop one (e.g. use --keyword for client-side narrowing).",
      "INVALID_COMBINATION"
    )
  }
  let url = `${BASE_URL}/is-ilanlari${slugs.length ? "/" + slugs.join("/") : ""}`
  if (page > 1) url += `?sy=${page}`
  return { url, slugs }
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  benefits: string | null
  badges: string[]
  url: string
  description: string | null
}

export interface ListingPage {
  canonical: string | null
  pageTitle: string | null
  totalPages: number | null
  results: JobCard[]
}

export function extractCanonical(html: string): string | null {
  return html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] ?? null
}

/**
 * eleman.net silently serves the generic /is-ilanlari listing (or the
 * single known segment) for slugs it does not know. Detect that by checking
 * that every requested slug is present in the canonical URL.
 */
export function unknownSlugs(requested: string[], canonical: string | null): string[] {
  if (!canonical) return []
  const path = new URL(canonical, BASE_URL).pathname
  const segs = path.replace(/^\/is-ilanlari\/?/, "").split("/").filter(Boolean)
  return requested.filter((s) => !segs.includes(s))
}

export function parseListingPage(html: string): ListingPage {
  const canonical = extractCanonical(html)
  const pageTitle = html.match(/<title>([^<]*)<\/title>/i)?.[1]
  let totalPages: number | null = null
  const fromTitle = pageTitle?.match(/\[(\d+) Sayfadan/)
  if (fromTitle) totalPages = parseInt(fromTitle[1], 10)
  // Pager is a <select> of <option value=".../is-ilanlari/...?sy=N"> plus prev/next links.
  const syNums = [...html.matchAll(/(?:href|value)="[^"]*\/is-ilanlari[^"?]*\?sy=(\d+)"/g)].map((m) => parseInt(m[1], 10))
  // The "[N Sayfadan X. Sayfa]" title (pages >= 2) is authoritative; pager
  // links are only a fallback because an out-of-range page links to itself.
  if (totalPages === null && syNums.length) totalPages = Math.max(...syNums)
  // No pager at all on a non-empty first page means a single page of results.
  if (totalPages === null && html.includes("ilan_listeleme_bol")) totalPages = 1

  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/<div class="c-box__body ilan_listeleme_bol/).slice(1)
  for (const raw of chunks) {
    // Card ends where the next sibling box starts; trim to avoid bleeding into sidebars.
    const chunk = raw.split(/<\/a>\s*(?:<\/div>|$)/)[0] ?? raw
    const link = chunk.match(/href="(https:\/\/www\.eleman\.net\/is-ilani\/[^"]*-i(\d+))"/)
    if (!link) continue
    const [, url, id] = link
    if (seen.has(id)) continue

    const h3 = chunk.match(/<h3[^>]*>([\s\S]*?)(?:<div class="ilantik-grubu"|<\/h3>)/i)
    const title = h3 ? cleanText(h3[1]) : ""
    if (!title) continue
    seen.add(id)

    const badges = [...chunk.matchAll(/<div class="ilantik[^"]*" title="([^"]+)"/g)].map((m) => decodeHtmlEntities(m[1]))

    let company: string | null = null
    let location: string | null = null
    // Subtitle ends right before the benefits/snippet text spans. It may contain
    // a nested <span> (showcase cards), so cut at the next c-showcase-box__text.
    const subStart = chunk.indexOf('<span class="c-showcase-box__subtitle">')
    if (subStart >= 0) {
      const rest = chunk.slice(subStart + '<span class="c-showcase-box__subtitle">'.length)
      const stop = rest.search(/<span\s+class="c-showcase-box__text/)
      const subHtml = stop >= 0 ? rest.slice(0, stop) : rest
      // Regular card:  <i hgi-corporate></i> Company <br> <i hgi-location-01></i> City - District
      // Showcase card: Company - <i icon-map-marker></i> <span>City</span>
      const locIcon = subHtml.search(/<i[^>]*(?:hgi-location-01|icon-map-marker)[^>]*>/)
      const before = locIcon >= 0 ? subHtml.slice(0, locIcon) : subHtml
      const after = locIcon >= 0 ? subHtml.slice(locIcon) : ""
      company = cleanText(before.replace(/<i[^>]*><\/i>/g, "")).replace(/\s*-\s*$/, "") || null
      location = after ? cleanText(after.replace(/<i[^>]*><\/i>/g, "")).replace(/\s*-\s*$/, "") || null : null
    }

    const benefitsMatch = chunk.match(/hgi-eraser-add"><\/i>\s*<span[^>]*>([\s\S]*?)<\/span>/i)
    const benefits = benefitsMatch ? cleanText(benefitsMatch[1]) || null : null

    const texts = [...chunk.matchAll(/<span\s+class="c-showcase-box__text\s*"[^>]*>([\s\S]*?)<\/span>/gi)]
    const description = texts.length ? cleanText(texts[texts.length - 1][1]) || null : null

    results.push({ id, title, company, location, benefits, badges, url, description })
  }
  return { canonical, pageTitle: pageTitle ? decodeHtmlEntities(pageTitle).trim() : null, totalPages, results }
}

export function matchesKeyword(card: JobCard, keyword: string): boolean {
  const needle = keyword.toLocaleLowerCase("tr-TR")
  const hay = [card.title, card.company, card.location, card.description, card.benefits]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR")
  return needle
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface JobDetail {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  datePosted: string | null
  validThrough: string | null
  employmentType: string | null
  salary: string | null
  benefits: string | null
  experience: string | null
  gender: string | null
  ageRange: string | null
  openings: string | null
  phoneApplication: boolean
  applyUrl: string
  url: string
  description: string | null
}

/** Accepts 4802953, i4802953, or a full eleman.net /is-ilani/ URL. */
export function resolveDetailTarget(idOrUrl: string): { id: string; url: string } {
  const trimmed = idOrUrl.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    const u = new URL(trimmed)
    if (!/(^|\.)eleman\.net$/i.test(u.hostname)) {
      throw new CliError("Only eleman.net posting URLs are supported", "INVALID_ARGUMENT")
    }
    const m = u.pathname.match(/^\/is-ilani\/(?:[^/]*-)?i(\d+)\/?$/)
    if (!m) throw new CliError("Not an eleman.net posting URL (expected /is-ilani/<slug>-i<id>)", "INVALID_ARGUMENT")
    return { id: m[1], url: `${BASE_URL}${u.pathname}` }
  }
  const m = trimmed.match(/^i?(\d+)$/i)
  if (!m) throw new CliError(`Invalid job id '${idOrUrl}'. Use the numeric id from search (e.g. 4802953) or the posting URL.`, "INVALID_ARGUMENT")
  // A bare /is-ilani/i<id> 404s, but any slug before -i<id> 301-redirects to the canonical URL.
  return { id: m[1], url: `${BASE_URL}/is-ilani/ilan-i${m[1]}` }
}

function parseJsonLoose(raw: string): any {
  try {
    return JSON.parse(raw)
  } catch {
    // Some generators leave raw control characters inside strings.
    return JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " "))
  }
}

export function extractJobPosting(html: string): any | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!m[1].includes("JobPosting")) continue
    try {
      const data = parseJsonLoose(m[1].trim())
      const list = Array.isArray(data) ? data : [data]
      const jp = list.find((d: any) => d && d["@type"] === "JobPosting")
      if (jp) return jp
    } catch {
      // fall through to HTML parsing
    }
  }
  return null
}

function featureBoxes(html: string): string[] {
  return [...html.matchAll(/class="is_ilani_ozellik_kutusu"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1]))
}

function nonEmpty(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
}

export function parseDetailPage(html: string, fallbackUrl: string, fallbackId: string): JobDetail {
  const jp = extractJobPosting(html)
  const canonical = extractCanonical(html) ?? fallbackUrl
  const id = canonical.match(/-i(\d+)$/)?.[1] ?? fallbackId

  const h1Span = html.match(/<h1[^>]*>\s*<span[^>]*title="([^"]*)"/i)?.[1]
  const title = nonEmpty(jp?.title ? decodeHtmlEntities(jp.title) : null) ?? (h1Span ? decodeHtmlEntities(h1Span) : "")
  if (!title) throw new CliError("Failed to parse job posting HTML", "PARSE_ERROR")

  const companyHtml = html.match(/class="h5 u-text-ilan-altbaslik"[^>]*>([\s\S]*?)<\/p>/i)?.[1]
  const company = nonEmpty(jp?.hiringOrganization?.name) ?? (companyHtml ? cleanText(companyHtml) || null : null)
  const companyUrl = nonEmpty(jp?.hiringOrganization?.url) ?? companyHtml?.match(/href="([^"]+)"/)?.[1] ?? null

  // Visible location line: "İstanbul Anadolu - Kadıköy"
  const locHtml = html.match(/icon-map-marker"><\/i>\s*<span>([\s\S]*?)<\/span>\s*<\/span>\s*<\/span>/i)?.[1]
  let location = locHtml ? cleanText(locHtml) || null : null
  if (!location) {
    const addr = Array.isArray(jp?.jobLocation?.address) ? jp.jobLocation.address[0] : jp?.jobLocation?.address
    location = nonEmpty(addr?.addressLocality)
  }

  const datePosted = nonEmpty(jp?.datePosted)?.slice(0, 10) ?? null
  const validThrough = nonEmpty(jp?.validThrough)?.slice(0, 10) ?? null

  const feats = featureBoxes(html)
  const feat = (re: RegExp) => {
    const f = feats.find((x) => re.test(x))
    return f ? f.replace(re, "").replace(/^\s*:\s*/, "").trim() || null : null
  }
  const salary = feat(/^Maaş:?/) ?? (nonEmpty(jp?.baseSalary?.value?.value) ? `${jp.baseSalary.value.value} TL` : null)
  const benefits = feat(/^Yan Haklar:?/) ?? nonEmpty(jp?.jobBenefits)
  const experience = feat(/^Deneyim:?/)
  const openings = feat(/^Kişi Sayısı:?/)
  const ageRange = feats.find((x) => /^\d+\s*-\s*\d+ arası$/.test(x)) ?? null
  const gender = feats.find((x) => /^(Kadın|Erkek)/.test(x)) ?? null
  const employmentType =
    nonEmpty(jp?.employmentType) ??
    feats.find((x) => /(Zamanlı|Part Time|Dönemsel|Stajyer|Serbest)/i.test(x)) ??
    null

  let description: string | null = null
  const vis = html.match(/<div class="d-information">\s*<div[^>]*>([\s\S]*?)<\/div>/i)
  if (vis) description = htmlToText(vis[1]) || null
  if (!description && jp?.description) description = htmlToText(decodeHtmlEntities(jp.description)) || null

  const phoneApplication = /title="Telefonla başvuru yapabilirsiniz\."/.test(html)

  return {
    id,
    title,
    company,
    companyUrl,
    location,
    datePosted,
    validThrough,
    employmentType,
    salary,
    benefits,
    experience,
    gender,
    ageRange,
    openings,
    phoneApplication,
    // Requires a logged-in eleman.net candidate account. Robots disallows
    // crawling it (*?ilan_id=*), so the CLI only prints it and never fetches it.
    applyUrl: `${BASE_URL}/aday/basvuru_yap.php?ilan_id=${id}`,
    url: canonical,
    description,
  }
}
