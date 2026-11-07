export const BASE_URL = "https://www.secretcv.com"

/**
 * Honest, identifiable User-Agent. We do not pretend to be a browser.
 */
export const USER_AGENT =
  "ai-job-search-secretcv-cli/1.0 (personal job-search assistant; low volume; respects robots.txt)"

/** Delay between consecutive requests made by one CLI process. */
export const REQUEST_DELAY_MS = 1200

/**
 * Hard cap on listing pages fetched by a single `search` call. A search makes
 * one request, plus at most one fallback request (see buildSearchPlan).
 */
export const MAX_REQUESTS_PER_SEARCH = 2

/** secretcv.com shows 20 postings per listing page. */
export const PER_PAGE = 20

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
 * Disallow rules from https://www.secretcv.com/robots.txt (User-agent: *),
 * copied verbatim (fetched 2026-11-07). Every URL the CLI fetches is checked
 * against these before the request goes out, including every redirect hop.
 */
export const ROBOTS_DISALLOW = [
  "/banner/redirect/*",
  "/ilan-begen-iptal/*",
  "*hesabim*",
  "/is-ilanlari/ara",
  "/cikis-yap",
  "*kvkk-modal?ilanId=*",
  "*ara?k=*",
  "*/?ilanId=*",
  "*/?sf=*",
  "*/?redirect=*",
  "*/?k=*",
  "*/?s=*",
  "*/?b=*",
  "*/?p=*",
  "*/?o=*",
  "*/?wtime=*",
  "*/?parameters=*",
  "/qr-basvuru",
  "/yeniden-biz",
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

/**
 * Our own policy is stricter than robots.txt: the CLI only fetches clean
 * secretcv.com paths with no query string at all (search, sort and paging
 * parameters are either disallowed or answered with 410 Gone).
 */
export function isFetchable(url: string): boolean {
  const u = new URL(url, BASE_URL)
  return u.hostname === "www.secretcv.com" && u.search === "" && isAllowedByRobots(url)
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

/**
 * robots.txt has the prefix rule "Disallow: /is-ilanlari/ara" (meant for the
 * search form), so any single-segment listing slug starting with "ara"
 * ("arac-soforu", "arastirma-gorevlisi", "aranjor") is disallowed too.
 */
export function collidesWithAraPrefix(url: string): boolean {
  return new URL(url, BASE_URL).pathname.startsWith("/is-ilanlari/ara")
}

export function araPrefixMessage(slug: string): string {
  return (
    `The listing slug "${slug}" starts with "ara", so its URL collides with secretcv.com's robots.txt prefix rule ` +
    `"Disallow: /is-ilanlari/ara" (meant for the site's search form) and is never fetched. ` +
    `Use a synonym that does not start with "ara" (e.g. "şoför" instead of "araç şoförü", "akademisyen" instead of "araştırma görevlisi") or browse with --sector / --city.`
  )
}

function assertFetchable(url: string, redirectedFrom?: string): void {
  if (isFetchable(url)) return
  if (collidesWithAraPrefix(url)) {
    const slug = new URL(url, BASE_URL).pathname.split("/")[2]?.replace(/-is-ilanlari$/, "") ?? ""
    throw new CliError(araPrefixMessage(slug), "ROBOTS_DISALLOWED")
  }
  if (redirectedFrom) {
    throw new CliError(
      `Refusing to follow redirect from ${redirectedFrom} to ${url}: only clean secretcv.com paths allowed by robots.txt are fetched`,
      "ROBOTS_DISALLOWED"
    )
  }
  throw new CliError(
    `Refusing to fetch ${url}: only clean secretcv.com paths allowed by robots.txt are fetched`,
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
    const html = await response.text()

    if (isBotChallenge(response.status, html)) {
      throw new CliError(
        "secretcv.com is blocking automated requests with Cloudflare bot protection. Skip this portal or use the WebSearch fallback; do not retry.",
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
    if (response.status === 404 || response.status === 410) throw new CliError("Not found", "NOT_FOUND")
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

/** Named entities seen on secretcv.com (posting bodies use Latin-1 names for Turkish letters). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  uuml: "ü", Uuml: "Ü", ouml: "ö", Ouml: "Ö", ccedil: "ç", Ccedil: "Ç",
  acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û",
  auml: "ä", Auml: "Ä", eacute: "é", Eacute: "É", egrave: "è", agrave: "à",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', sbquo: ",", bdquo: '"',
  ndash: "-", mdash: "-", hellip: "...", bull: "•", middot: "·", deg: "°",
  laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™", euro: "€",
  gbreve: "ğ", Gbreve: "Ğ", scedil: "ş", Scedil: "Ş", inodot: "ı", Idot: "İ",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ")
}

/** Strip tags, decode entities and collapse whitespace. */
export function cleanText(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Turkish-aware slug: "Yazılım Geliştirici" -> "yazilim-gelistirici". */
export function slugify(text: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" }
  return text
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Accent- and case-insensitive containment check for Turkish text. */
export function looseIncludes(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false
  const h = slugify(haystack).replace(/-/g, " ")
  const n = slugify(needle).replace(/-/g, " ")
  return n.length > 0 && h.includes(n)
}

// ---------------------------------------------------------------------------
// Filter vocabularies (all verified live as clean listing paths)
// ---------------------------------------------------------------------------

/** City (il) slugs from https://www.secretcv.com/sitemap/il-ilce, plus the istanbul umbrella. */
export const CITY_SLUGS = new Set([
  "adana", "adiyaman", "afyon", "agri", "aksaray", "amasya", "ankara", "antalya", "ardahan", "artvin",
  "aydin", "balikesir", "bartin", "batman", "bayburt", "bilecik", "bingol", "bitlis", "bolu", "burdur",
  "bursa", "canakkale", "cankiri", "corum", "denizli", "diyarbakir", "duzce", "edirne", "elazig",
  "erzincan", "erzurum", "eskisehir", "gaziantep", "giresun", "gumushane", "hakkari", "hatay", "igdir",
  "isparta", "istanbul", "istanbul-anadolu", "istanbul-avrupa", "izmir", "kahramanmaras", "karabuk",
  "karaman", "kars", "kastamonu", "kayseri", "kibris", "kilis", "kirikkale", "kirklareli", "kirsehir",
  "kocaeli", "konya", "kutahya", "malatya", "manisa", "mardin", "mersin", "mugla", "mus", "nevsehir",
  "nigde", "ordu", "osmaniye", "rize", "sakarya", "samsun", "sanliurfa", "siirt", "sinop", "sirnak",
  "sivas", "tekirdag", "tokat", "trabzon", "tunceli", "usak", "van", "yalova", "yozgat", "zonguldak",
])

/** Common spellings that secretcv.com slugs differently. */
export const CITY_ALIASES: Record<string, string> = {
  afyonkarahisar: "afyon",
  icel: "mersin",
  "mersin-icel": "mersin",
  maras: "kahramanmaras",
  "k-maras": "kahramanmaras",
  urfa: "sanliurfa",
  antep: "gaziantep",
  izmit: "kocaeli",
  adapazari: "sakarya",
  "istanbul-avrupa-yakasi": "istanbul-avrupa",
  "istanbul-anadolu-yakasi": "istanbul-anadolu",
  "kktc": "kibris",
}

/**
 * Work-type ("ilan tipi") slugs from https://www.secretcv.com/sitemap/ilan-tipleri.
 * English aliases on the left, secretcv slug on the right.
 */
export const TYPE_SLUGS: Record<string, string> = {
  remote: "uzaktan-calisma",
  "home-office": "home-office",
  hybrid: "hibrit",
  "full-time": "tam-zamanli",
  "part-time": "part-time",
  intern: "staj",
  "new-grad": "yeni-mezun",
  "blue-collar": "mavi-yaka",
  seasonal: "donemsel",
  project: "proje-bazli",
  flexible: "esnek-calisma",
  "live-in": "yatili",
  disabled: "engelli",
  "ex-convict": "eski-hukumlu",
  "veteran-family": "sehit-yakini-teror-magduru",
}

/** Sector slugs from https://www.secretcv.com/sitemap/tum-sehir-sektor (used here as clean paths). */
export const SECTOR_SLUGS = new Set([
  "acik-hava-reklamciligi", "ajans", "akaryakit-petrol-ve-urunleri", "aluminyum",
  "ambalaj-ve-kagit", "asansor-ve-yuruyen-merdivenler", "aydinlatma", "bankacilik-finans",
  "barter", "belgelendirme-marka-patent", "beyaz-esya", "bilgisayar-bt-internet",
  "bina-ve-tesis-yonetimi", "bioteknik", "buro-makineleri", "cagri-merkezi", "cam-ve-seramik",
  "catering", "cevre", "cimento", "dagitim", "danismanlik", "dayanikli-tuketim-mallari",
  "demir-celik", "denizcilik", "deri-ayakkabi", "dernek-ve-vakif", "diger", "dis-ticaret",
  "e-ticaret", "egitim", "eglence", "elektrik-ve-elektronik", "endustri", "enerji", "faktoring",
  "fuar-ve-organizasyon", "gayrimenkul", "gemi-yat-tersane", "gida", "gumrukleme",
  "guvenlik-hizmetleri", "guvenlik-sistemleri", "halkla-iliskiler", "havacilik", "hayvancilik",
  "hizli-tuketim-mallari", "hizmet-isletme-servisi", "holding", "hukuk", "ilac", "imalat",
  "insaat", "insan-kaynaklari", "is-sagligi-ve-guvenligi", "isik-ses-ve-goruntu-sistemleri",
  "isitma-sogutma-iklimlendirme", "ithalat-ihracat", "kamu", "kargo-kurye", "kimya",
  "kirtasiyecilik", "kiymetli-maden", "kozmetik", "kuyumculuk-pirlanta",
  "leasing-finansal-kiralama", "lojistik", "madencilik", "magazacilik-perakendecilik", "makine",
  "mali-denetim-vergi", "mali-musavirlik", "matbaacilik-baski", "medikal", "medya",
  "mekanik-tesisat", "metal-sanayi", "mimarlik", "mobilya-dekorasyon", "motosiklet", "muhendislik",
  "musteri-iliskileri", "network-marketing", "ofis-malzemeleri", "optik", "otelcilik", "otomasyon",
  "otomotiv", "oyuncak", "pazar-piyasa-arastirma", "plastik", "proje-ve-taahhut", "rehabilitasyon",
  "reklamcilik", "restorancilik", "saglik-hastane", "sanat", "savunma-guvenlik", "sigortacilik",
  "sivil-toplum-kurulusu", "sosyal-servisler", "spor", "su-urunleri", "sut-ve-sut-urunleri",
  "tanitim-ve-promosyon-urunleri", "tarim-ve-orman-urunleri-ziraat", "tekstil",
  "tekstil-boya-ve-kimyasallari", "telekomunikasyon-ve-network", "tercume-hizmetleri",
  "tibbi-malzeme", "toptancilik", "turizm", "ulasim", "uretim-ve-endustriyel-urunler",
  "yapi-malzemeleri", "yatirim-menkul-d-borsacilik", "yatirim-menkul-degerler", "yayincilik",
  "yumurtacilik-tavukculuk",
])

export function resolveCity(input: string): string | null {
  const slug = slugify(input)
  const resolved = CITY_ALIASES[slug] ?? slug
  return CITY_SLUGS.has(resolved) ? resolved : null
}

export function resolveType(input: string): string | null {
  const slug = slugify(input)
  if (TYPE_SLUGS[slug]) return TYPE_SLUGS[slug]
  return Object.values(TYPE_SLUGS).includes(slug) ? slug : null
}

export function resolveSector(input: string): string | null {
  const slug = slugify(input)
  return SECTOR_SLUGS.has(slug) ? slug : null
}

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

/** Build a clean listing URL from one or two path segments. */
export function buildListingUrl(segments: string[]): string {
  if (segments.length < 1 || segments.length > 2) {
    throw new CliError("A listing path takes one or two segments", "INVALID_COMBINATION")
  }
  const head = segments.slice(0, -1)
  const leaf = `${segments[segments.length - 1]}-is-ilanlari`
  return `${BASE_URL}/is-ilanlari/${[...head, leaf].join("/")}`
}

export interface SearchInput {
  query?: string
  city?: string
  district?: string
  type?: string
  sector?: string
}

export interface ResolvedSearch {
  query: string | null
  city: string | null
  district: string | null
  type: string | null
  sector: string | null
}

export interface SearchPlan {
  /** URL fetched first. */
  primary: string
  /**
   * Fetched only when the primary page shows that secretcv.com ignored the
   * query (it was a free-text keyword, not a known position slug).
   */
  keywordFallback: string | null
}

/**
 * Map resolved filters onto the path forms secretcv.com honours (verified live):
 *   {x}                  x = city | position | type | sector | keyword
 *   {city}/{position}    {type}/{position}    {sector}/{position}
 *   {type}/{city}        {city}/{district}
 * Three segments return 404. Any other pair silently drops one filter.
 */
export function buildSearchPlan(r: ResolvedSearch): SearchPlan {
  const q = r.query
  if (q) {
    const prefix = r.city ?? r.type ?? r.sector
    if (!prefix) return { primary: buildListingUrl([q]), keywordFallback: null }
    return { primary: buildListingUrl([prefix, q]), keywordFallback: buildListingUrl([q]) }
  }
  if (r.city && r.district) return { primary: buildListingUrl([r.city, r.district]), keywordFallback: null }
  if (r.type && r.city) return { primary: buildListingUrl([r.type, r.city]), keywordFallback: null }
  const single = r.city ?? r.type ?? r.sector
  if (!single) throw new CliError("Nothing to search for", "MISSING_REQUIRED")
  return { primary: buildListingUrl([single]), keywordFallback: null }
}

export function extractJobId(input: string): string | null {
  const m = input.match(/-is-ilanlari-(\d+)\/?$/) ?? input.match(/^\/?(?:ilan\/)?(\d+)$/)
  return m ? m[1] : null
}

/** Accept a numeric id or any secretcv.com posting URL. */
export function resolveDetailTarget(input: string): { id: string; url: string } {
  const trimmed = input.trim()
  if (/^https?:\/\//.test(trimmed)) {
    const u = new URL(trimmed)
    if (!/(^|\.)secretcv\.com$/.test(u.hostname)) {
      throw new CliError("Only secretcv.com posting URLs are supported", "INVALID_ARGUMENT")
    }
    const id = extractJobId(u.pathname)
    if (!id) throw new CliError("Could not find a posting id in that URL", "INVALID_ARGUMENT")
    return { id, url: `${BASE_URL}${u.pathname.replace(/\/$/, "")}` }
  }
  const id = extractJobId(trimmed)
  if (!id) throw new CliError("Expected a numeric posting id or a secretcv.com posting URL", "INVALID_ARGUMENT")
  // /ilan/{id} answers with a 302 to the canonical posting URL.
  return { id, url: `${BASE_URL}/ilan/${id}` }
}

// ---------------------------------------------------------------------------
// Listing page parsing
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  districts: string | null
  postedText: string | null
  date: string | null
  url: string
}

export interface AppliedFilter {
  /** sh = city, ilc = district, p = position, k = keyword, it = work type, s = sector */
  type: string
  label: string
}

export interface ListingPage {
  total: number
  results: JobCard[]
  appliedFilters: AppliedFilter[]
  hasNextPage: boolean
}

/**
 * Convert "Bugün", "3 gün önce", "1 ay 9 gün önce" into an approximate ISO
 * date relative to `now` (months count as 30 days).
 */
export function relativeToIsoDate(text: string, now: Date = new Date()): string | null {
  const t = text.toLocaleLowerCase("tr")
  let days = 0
  if (/bugün/.test(t)) days = 0
  else if (/dün/.test(t)) days = 1
  else {
    const units: Array<[RegExp, number]> = [
      [/(\d+)\s*yıl/, 365],
      [/(\d+)\s*ay/, 30],
      [/(\d+)\s*hafta/, 7],
      [/(\d+)\s*gün/, 1],
    ]
    let matched = false
    for (const [re, mult] of units) {
      const m = t.match(re)
      if (m) {
        days += parseInt(m[1], 10) * mult
        matched = true
      }
    }
    if (!matched) return null
  }
  const d = new Date(now.getTime() - days * 86400000)
  return d.toISOString().slice(0, 10)
}

export function parseTotal(html: string): number {
  const m = html.match(/([\d.]+)\s*İş İlanı Listelendi/)
  return m ? parseInt(m[1].replace(/\./g, ""), 10) || 0 : 0
}

export function parseAppliedFilters(html: string): AppliedFilter[] {
  const out: AppliedFilter[] = []
  const re = /class="badge filter-badge[^"]*"\s+title="([^"]*)"\s+data-type="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    out.push({ type: m[2], label: decodeHtmlEntities(m[1]).trim() })
  }
  return out
}

export function parseListingPage(html: string, now: Date = new Date()): ListingPage {
  const results: JobCard[] = []
  const chunks = html.split(/<div class="cv-job-box job-list[^"]*">/).slice(1)
  for (const chunk of chunks) {
    const card = chunk.split(/<div class="cv-job-box /)[0]
    const titleMatch = card.match(/<a href="([^"]+)" title="([^"]*)"\s+class="title[^"]*"[^>]*>([\s\S]*?)<\/a>/)
    if (!titleMatch) continue
    const url = decodeHtmlEntities(titleMatch[1])
    const id = extractJobId(new URL(url, BASE_URL).pathname)
    if (!id) continue
    const title = cleanText(titleMatch[3]) || decodeHtmlEntities(titleMatch[2]).trim()

    // Company sits between the title link and the city span. Hidden-company
    // cards print plain text ("Firma Adı Gizli") there instead of a link.
    const afterTitle = card.slice((titleMatch.index ?? 0) + titleMatch[0].length)
    const companyZone = afterTitle.split(/<span class="city/)[0]
    const companyLink = companyZone.match(/class="company[^"]*"[^>]*>([\s\S]*?)<\/a>/)
    const company = (companyLink ? cleanText(companyLink[1]) : cleanText(companyZone)) || null

    const cityMatch = card.match(/bi-geo-alt-fill"><\/i>([\s\S]*?)<\/span>/)
    const location = cityMatch ? cleanText(cityMatch[1]) || null : null
    const distMatch = card.match(/bi-building"><\/i>([\s\S]*?)<\/span>/)
    const districts = distMatch ? cleanText(distMatch[1]) || null : null
    const postedMatch = card.match(/İlan Tarihi:\s*([^<]+)</)
    const postedText = postedMatch ? cleanText(postedMatch[1]) : null

    results.push({
      id,
      title,
      company,
      location,
      districts,
      postedText,
      date: postedText ? relativeToIsoDate(postedText, now) : null,
      url: url.startsWith("http") ? url : `${BASE_URL}${url}`,
    })
  }

  return {
    total: parseTotal(html),
    results,
    appliedFilters: parseAppliedFilters(html),
    hasNextPage: /title="Sonraki Sayfa"/.test(html) && !/page-link disabled"[^>]*title="Sonraki Sayfa"/.test(html),
  }
}

/** True when the page's active-filter badges show the query was applied (as position or keyword). */
export function queryApplied(filters: AppliedFilter[], querySlug: string): boolean {
  return filters.some((f) => (f.type === "p" || f.type === "k") && slugify(f.label) === querySlug)
}

// ---------------------------------------------------------------------------
// Detail page parsing
// ---------------------------------------------------------------------------

export interface JobDetail {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  districts: string | null
  employmentType: string | null
  sector: string | null
  education: string | null
  referenceNo: string | null
  foreignNationalsAccepted: string | null
  datePosted: string | null
  deadline: string | null
  applyUrl: string | null
  applyRequiresLogin: boolean
  applyPhone: string | null
  url: string
  description: string | null
}

function findJobPosting(html: string): any {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (!m[1].includes("JobPosting")) continue
    try {
      const data = JSON.parse(m[1])
      const items = Array.isArray(data) ? data : [data]
      const job = items.find((d: any) => d && d["@type"] === "JobPosting")
      if (job) return job
    } catch {
      // ignore malformed blocks
    }
  }
  return null
}

/** Label/value rows of the "content-job-table" cards. */
export function parseAttributeTable(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<span class="title">([\s\S]*?)<\/span>\s*<\/div>\s*<div class="col-6">\s*<span class="desc">([\s\S]*?)<\/span>\s*<\/div>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const label = cleanText(m[1])
    if (label && !(label in out)) out[label] = cleanText(m[2])
  }
  return out
}

/** Readable plain text from the posting body, keeping paragraphs and bullet lists. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<span class="cj-title[^"]*">([\s\S]*?)<\/span>/gi, (_, h) => `\n\n${cleanText(h)}:\n`)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|ul|ol|h\d)>/gi, "\n")
    .replace(/<\/li>/gi, "")
    .replace(/<[^>]+>/g, " ")
  const lines = decodeHtmlEntities(text)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
  // Drop blank lines between consecutive bullets, and collapse blank runs.
  const kept = lines.filter((l, i) => {
    if (l !== "") return true
    const prev = lines.slice(0, i).reverse().find((x) => x !== "")
    const next = lines.slice(i + 1).find((x) => x !== "")
    if (prev?.startsWith("- ") && next?.startsWith("- ")) return false
    return i > 0 && lines[i - 1] !== ""
  })
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const tr = value.match(/^(\d{2})[-.](\d{2})[-.](\d{4})/)
  return tr ? `${tr[3]}-${tr[2]}-${tr[1]}` : null
}

export function parseDetailPage(html: string, fetchedUrl: string, fallbackId: string): JobDetail {
  const job = findJobPosting(html)
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const title = (job?.title ? decodeHtmlEntities(String(job.title)).trim() : "") || (h1 ? cleanText(h1[1]) : "")
  if (!title || (!job && !/class="cv-card content-job"/.test(html))) {
    throw new CliError("Failed to parse job posting HTML", "PARSE_ERROR")
  }

  const attrs = parseAttributeTable(html)
  const canonical = typeof job?.url === "string" ? job.url : fetchedUrl
  const id = extractJobId(new URL(canonical, BASE_URL).pathname) ?? fallbackId

  let description: string | null = null
  const body = html.match(/<div class="cv-card content-job">([\s\S]*?)<div class="buttons/)
  if (body) {
    const withoutHeading = body[1].replace(/<h2 class="cj-title">[\s\S]*?<\/h2>/, "")
    description = htmlToText(withoutHeading) || null
  }
  if (!description && typeof job?.description === "string") {
    description = cleanText(job.description) || null
  }

  let applyUrl: string | null = null
  const apply = html.match(/<a href="([^"]+)"[^>]*title="İşe Başvur"/)
  if (apply) applyUrl = decodeHtmlEntities(apply[1])
  const applyRequiresLogin = !!applyUrl && /\/giris-yap\b/.test(applyUrl)

  const addr = job?.jobLocation?.address ?? {}
  const company = job?.hiringOrganization?.name
    ? decodeHtmlEntities(String(job.hiringOrganization.name)).trim()
    : (attrs["Firma Adı"]?.replace(/\s*İş İlanları$/, "") || null)

  const nonEmpty = (v: string | undefined | null) => (v && v !== "-" ? v : null)

  return {
    id,
    title,
    company: company || null,
    companyUrl: typeof job?.hiringOrganization?.url === "string" ? job.hiringOrganization.url : null,
    location: nonEmpty(attrs["Şehirler"]) ?? nonEmpty(addr.addressLocality ? String(addr.addressLocality) : null),
    districts: nonEmpty(attrs["İlçeler"]),
    employmentType: nonEmpty(attrs["İstihdam Türü"]) ?? nonEmpty(job?.employmentType ? String(job.employmentType) : null),
    sector: nonEmpty(attrs["Sektör"]),
    education: nonEmpty(attrs["Eğitim Seviyesi"]),
    referenceNo: nonEmpty(attrs["Referans No"]),
    foreignNationalsAccepted: nonEmpty(attrs["Yabancı Uyruklu Çalışabilir"]),
    datePosted: toIsoDate(job?.datePosted) ?? toIsoDate(attrs["İlan Tarihi"]),
    deadline: toIsoDate(job?.validThrough),
    applyUrl,
    applyRequiresLogin,
    applyPhone: nonEmpty(attrs["Başvuru İçin Sabit Telefon"] ?? attrs["Başvuru İçin Telefon"]),
    url: canonical,
    description,
  }
}
