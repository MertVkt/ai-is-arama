// Shared helpers for the İŞKUR e-Şube public job listing CLI.
//
// Source: https://esube.iskur.gov.tr (robots.txt allows everything except
// /Meslek/ViewMeslekDetayPopUp.aspx/; ROBOTS_DISALLOW below enforces that on
// every request).
// The search page is an ASP.NET WebForms page. A search is a normal form
// submission: GET the page, copy its hidden fields (__VIEWSTATE etc.), set the
// search fields and POST it back. No login, no captcha, no e-Devlet.

export const BASE_URL = "https://esube.iskur.gov.tr"
export const SEARCH_PATH = "/Istihdam/AcikIsIlanAra.aspx"
export const DETAIL_PATH = "/Istihdam/AcikIsIlanDetay.aspx"
export const OCCUPATION_API_PATH = "/api/meslekuzmanlikapi/meslekuzmanlik/"
export const USER_AGENT =
  "ai-job-search-iskur-cli/1.0 (open-source personal job search tool; polite, low volume)"

/** Delay between consecutive requests to the same host, in ms. */
export const REQUEST_DELAY_MS = 1200
/** Server page size (fixed by İŞKUR). */
export const PAGE_SIZE = 15
/** Hard caps so a single CLI call stays low volume. */
export const MAX_PAGE = 100
export const MAX_PAGES_PER_CALL = 5

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export class CliError extends Error {
  constructor(message: string, public code: string) {
    super(message)
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ccedil: "ç", Ccedil: "Ç", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
  ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
  hellip: "...", acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", ucirc: "û", Ucirc: "Û",
}

export function decodeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);?/g, (m, name: string) => NAMED_ENTITIES[name] ?? m)
}

/** HTML fragment to readable plain text, keeping list items and paragraphs on their own lines. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    // Drop source-formatting newlines between tags (keeps inline spaces like "<b>A:</b> B").
    .replace(/>[ \t]*\r?\n\s*</g, "><")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|ul|ol|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
  return decodeHtml(text)
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim()
}

export function cleanInline(html: string): string {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

/** Fold Turkish letters to ASCII and lowercase, for forgiving name matching. */
export function foldTr(s: string): string {
  return s
    .replace(/[İIı]/g, "i")
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o")
    .replace(/ş/g, "s").replace(/ü/g, "u").replace(/[âà]/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Decode a response body using the charset from Content-Type. İŞKUR serves
 * UTF-8 today, but older Turkish government pages use windows-1254 /
 * ISO-8859-9, so both are handled. Without a charset, UTF-8 is tried first and
 * windows-1254 is used if UTF-8 decoding produces replacement characters.
 */
export function decodeBody(buf: ArrayBuffer | Uint8Array, contentType: string | null): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const m = /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? "")
  let charset = m ? m[1].toLowerCase() : ""
  if (charset === "iso-8859-9" || charset === "latin5") charset = "windows-1254"
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      return new TextDecoder(charset as ConstructorParameters<typeof TextDecoder>[0]).decode(bytes)
    } catch {
      // unknown label: fall through to utf-8
    }
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes)
  if (!charset && utf8.includes("\uFFFD")) {
    return new TextDecoder("windows-1254").decode(bytes)
  }
  return utf8
}

// ---------------------------------------------------------------------------
// Lookup tables (values taken from the public search form)
// ---------------------------------------------------------------------------

/** İl (province) codes used by the İŞKUR form. They match licence plate codes. */
export const PROVINCES: Array<{ code: number; name: string }> = [
  [1, "ADANA"], [2, "ADIYAMAN"], [3, "AFYONKARAHİSAR"], [4, "AĞRI"], [68, "AKSARAY"],
  [5, "AMASYA"], [6, "ANKARA"], [7, "ANTALYA"], [75, "ARDAHAN"], [8, "ARTVİN"],
  [9, "AYDIN"], [10, "BALIKESİR"], [74, "BARTIN"], [72, "BATMAN"], [69, "BAYBURT"],
  [11, "BİLECİK"], [12, "BİNGÖL"], [13, "BİTLİS"], [14, "BOLU"], [15, "BURDUR"],
  [16, "BURSA"], [17, "ÇANAKKALE"], [18, "ÇANKIRI"], [19, "ÇORUM"], [20, "DENİZLİ"],
  [21, "DİYARBAKIR"], [81, "DÜZCE"], [22, "EDİRNE"], [23, "ELAZIĞ"], [24, "ERZİNCAN"],
  [25, "ERZURUM"], [26, "ESKİŞEHİR"], [27, "GAZİANTEP"], [28, "GİRESUN"], [29, "GÜMÜŞHANE"],
  [30, "HAKKARİ"], [31, "HATAY"], [76, "IĞDIR"], [32, "ISPARTA"], [34, "İSTANBUL"],
  [35, "İZMİR"], [46, "KAHRAMANMARAŞ"], [78, "KARABÜK"], [70, "KARAMAN"], [36, "KARS"],
  [37, "KASTAMONU"], [38, "KAYSERİ"], [71, "KIRIKKALE"], [39, "KIRKLARELİ"], [40, "KIRŞEHİR"],
  [79, "KİLİS"], [41, "KOCAELİ"], [42, "KONYA"], [43, "KÜTAHYA"], [44, "MALATYA"],
  [45, "MANİSA"], [47, "MARDİN"], [33, "MERSİN"], [48, "MUĞLA"], [49, "MUŞ"],
  [50, "NEVŞEHİR"], [51, "NİĞDE"], [52, "ORDU"], [80, "OSMANİYE"], [53, "RİZE"],
  [54, "SAKARYA"], [55, "SAMSUN"], [56, "SİİRT"], [57, "SİNOP"], [58, "SİVAS"],
  [63, "ŞANLIURFA"], [73, "ŞIRNAK"], [59, "TEKİRDAĞ"], [60, "TOKAT"], [61, "TRABZON"],
  [62, "TUNCELİ"], [64, "UŞAK"], [65, "VAN"], [77, "YALOVA"], [66, "YOZGAT"], [67, "ZONGULDAK"],
].map(([code, name]) => ({ code: code as number, name: name as string }))

/** Resolve an il given as plate code ("35") or name ("izmir", "İzmir"). */
export function resolveProvince(input: string): { code: number; name: string } {
  const raw = input.trim()
  if (/^\d+$/.test(raw)) {
    const p = PROVINCES.find((x) => x.code === Number(raw))
    if (p) return p
    throw new CliError(`Unknown il code: ${raw} (valid: 1-81, see the 'iller' command)`, "INVALID_FLAG")
  }
  const key = foldTr(raw)
  const p = PROVINCES.find((x) => foldTr(x.name) === key)
  if (p) return p
  throw new CliError(`Unknown il: ${raw} (see the 'iller' command)`, "INVALID_FLAG")
}

export const SECTORS = { ozel: "ozelSektorRadio", kamu: "kamuRadio" } as const
export const POSTED = { all: "1", "24h": "2", "7d": "3", "15d": "4" } as const
export const EDUCATION = {
  "okur-yazar-olmayan": "5", "okur-yazar": "6", ilkokul: "8", ilkogretim: "4",
  lise: "3", onlisans: "7", lisans: "1", "yuksek-lisans": "2", doktora: "10",
} as const
/** Özel sektör only. */
export const WORK_TYPE = { tam: "1", kismi: "2" } as const
/** Kamu only. */
export const PERIOD = { daimi: "2", gecici: "1" } as const
/** Kamu only (İlan Türü). */
export const KAMU_ILAN_TURU = { genel: "9", engelli: "10", "eski-hukumlu": "13", tmy: "15" } as const

export interface SearchCriteria {
  query?: string
  sector: keyof typeof SECTORS
  il?: number
  occupationCode?: string
  posted: keyof typeof POSTED
  education?: keyof typeof EDUCATION
  workType?: keyof typeof WORK_TYPE
  period?: keyof typeof PERIOD
  ilanTuru?: keyof typeof KAMU_ILAN_TURU
  employer?: string
  ilanNo?: string
}

/** Validate cross-flag rules before any network call. Throws CliError. */
export function validateCriteria(c: SearchCriteria): void {
  if (c.sector === "kamu" && c.workType) {
    throw new CliError("--work-type only applies to --sector ozel (the form hides it for kamu)", "INVALID_FLAG")
  }
  if (c.sector === "ozel" && c.period) {
    throw new CliError("--period only applies to --sector kamu", "INVALID_FLAG")
  }
  if (c.sector === "ozel" && c.ilanTuru) {
    throw new CliError("--ilan-turu only applies to --sector kamu", "INVALID_FLAG")
  }
  if (c.occupationCode && !/^\d+$/.test(c.occupationCode)) {
    throw new CliError("--meslek-kodu must be a numeric code from the 'meslek' command", "INVALID_FLAG")
  }
  if (c.ilanNo && !/^\d{1,11}$/.test(c.ilanNo)) {
    throw new CliError("--ilan-no must be up to 11 digits", "INVALID_FLAG")
  }
}

/** Map criteria onto the WebForms field names of the search form. */
export function buildFormFields(c: SearchCriteria): Record<string, string> {
  return {
    "ctl04$ctlArananMetin2": c.query ?? "",
    "ctl04$IsyeriTuruRadios": SECTORS[c.sector],
    "ctl04$ctlCalismaYeri": "1", // Yurtiçi
    "ctl04$ctlIl": c.il !== undefined ? String(c.il) : "",
    "ctl04$ctlIlce": "",
    "ctl04$ctlIlanTarihi": POSTED[c.posted],
    "ctl04$ctlOgrenimDurum": c.education ? EDUCATION[c.education] : "",
    "ctl04$ctlCalismaSekli": c.workType ? WORK_TYPE[c.workType] : "",
    "ctl04$ctlCalismaPeryodu": c.period ? PERIOD[c.period] : "",
    "ctl04$ctlKisiselDurum": c.ilanTuru ? KAMU_ILAN_TURU[c.ilanTuru] : "",
    "ctl04$ctlIsyeriUnvan": c.employer ?? "",
    "ctl04$ctlIsgucuIstemiNo": c.ilanNo ?? "",
    "ctl04$ctlMeslek$ctlMeslek_TextBox": "",
    "ctl04$ctlMeslek$ctlMeslek_HiddenField": "",
    "ctl04$ctlMeslek$ctlMeslek_MeslekKayitNo": c.occupationCode ?? "",
    "ctl04$ctlMeslek$ctlMeslek_MeslekUzmanlikKayitNo": "",
  }
}

/** Accept "00009890180", "9890180" or a full AcikIsIlanDetay.aspx?uiID=... URL. */
export function normalizeJobId(input: string): string {
  const raw = input.trim()
  const fromUrl = /[?&]uiID=(\d+)/i.exec(raw)
  const digits = fromUrl ? fromUrl[1] : raw
  if (!/^\d{1,11}$/.test(digits)) {
    throw new CliError(`Not an İŞKUR ilan number or detail URL: ${input}`, "INVALID_ID")
  }
  return digits.padStart(11, "0")
}

export function detailUrl(id: string): string {
  return `${BASE_URL}${DETAIL_PATH}?uiID=${id}`
}

// ---------------------------------------------------------------------------
// robots.txt guard
// ---------------------------------------------------------------------------

/**
 * Disallow rules from https://esube.iskur.gov.tr/robots.txt (User-agent: *),
 * copied verbatim. Every URL the CLI requests (including each redirect hop)
 * is checked against these before the request goes out.
 */
export const ROBOTS_DISALLOW = ["/Meslek/ViewMeslekDetayPopUp.aspx/"]

/** True when the path (+ query) of the URL does not start with a Disallow prefix. */
export function isAllowedByRobots(url: string): boolean {
  const u = new URL(url, BASE_URL)
  const target = u.pathname + u.search
  return !ROBOTS_DISALLOW.some((rule) => target.startsWith(rule))
}

/** Only https://esube.iskur.gov.tr URLs that pass robots.txt are ever requested. */
export function isFetchable(url: string): boolean {
  const u = new URL(url, BASE_URL)
  return u.protocol === "https:" && u.hostname === "esube.iskur.gov.tr" && isAllowedByRobots(url)
}

function assertFetchable(url: string, redirectedFrom?: string): void {
  if (isFetchable(url)) return
  throw new CliError(
    redirectedFrom
      ? `Refusing to follow redirect from ${redirectedFrom} to ${url}: not an esube.iskur.gov.tr URL allowed by robots.txt`
      : `Refusing to fetch ${url}: disallowed by esube.iskur.gov.tr robots.txt (or not an esube.iskur.gov.tr URL)`,
    "ROBOTS_DISALLOWED",
  )
}

/** Redirects are followed by hand, at most this many hops per request. */
export const MAX_REDIRECTS = 3

// ---------------------------------------------------------------------------
// HTTP session (cookies + politeness)
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class IskurSession {
  private cookies = new Map<string, string>()
  private lastRequestAt = 0

  constructor(private delayMs = REQUEST_DELAY_MS) {}

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.delayMs - Date.now()
    if (this.lastRequestAt > 0 && wait > 0) await sleep(wait)
    this.lastRequestAt = Date.now()
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }

  private storeCookies(res: Response): void {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []
    for (const c of list) {
      const [pair] = c.split(";")
      const eq = pair.indexOf("=")
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }

  async request(path: string, init: { method?: string; form?: Record<string, string>; accept?: string } = {}): Promise<string> {
    const startUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`
    assertFetchable(startUrl)
    let url = startUrl
    let method = init.method ?? (init.form ? "POST" : "GET")
    let form = init.form
    for (let hop = 0; ; hop++) {
      const res = await this.send(url, method, form, init.accept)
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location")
        if (!location) throw new CliError(`İŞKUR redirect ${res.status} without a Location header`, "API_ERROR")
        if (hop >= MAX_REDIRECTS) {
          throw new CliError(`Too many redirects (more than ${MAX_REDIRECTS}) starting at ${startUrl}; stopping.`, "API_ERROR")
        }
        const next = new URL(location, url).toString()
        assertFetchable(next, url)
        url = next
        // 301/302/303 turn a POST into a GET (browser behaviour); 307/308 keep it.
        if (res.status !== 307 && res.status !== 308) {
          method = "GET"
          form = undefined
        }
        continue
      }
      if (res.status === 403 || res.status === 429) {
        throw new CliError(`İŞKUR refused the request (HTTP ${res.status}). Not retrying; try again later.`, "BLOCKED")
      }
      if (!res.ok) {
        throw new CliError(`İŞKUR request failed: HTTP ${res.status} ${res.statusText}`, "API_ERROR")
      }
      const text = decodeBody(await res.arrayBuffer(), res.headers.get("content-type"))
      if (isBotCheck(text)) {
        throw new CliError("İŞKUR answered with a bot check / captcha page. This CLI does not bypass it.", "BLOCKED")
      }
      return text
    }
  }

  /**
   * One HTTP exchange (redirect: "manual"). Retries with exponential backoff
   * only on network errors and 5xx; 403/429 are returned at once so the
   * caller reports BLOCKED without retrying.
   */
  private async send(url: string, method: string, form: Record<string, string> | undefined, accept?: string): Promise<Response> {
    const maxRetries = 3
    let backoff = 2000
    for (let attempt = 0; ; attempt++) {
      await this.throttle()
      const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept: accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
      }
      const ck = this.cookieHeader()
      if (ck) headers["Cookie"] = ck
      let body: string | undefined
      if (form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        body = new URLSearchParams(form).toString()
      }
      let res: Response
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30000)
      try {
        res = await fetch(url, { method, headers, body, redirect: "manual", signal: ctrl.signal })
      } catch (err) {
        clearTimeout(timer)
        if (attempt < maxRetries) {
          await sleep(backoff)
          backoff *= 2
          continue
        }
        throw new CliError(`Network error contacting İŞKUR: ${err instanceof Error ? err.message : String(err)}`, "NETWORK_ERROR")
      }
      clearTimeout(timer)
      this.storeCookies(res)
      if (res.status >= 500 && attempt < maxRetries) {
        await sleep(backoff)
        backoff *= 2
        continue
      }
      return res
    }
  }
}

/**
 * Captcha / bot-challenge markers. Checked on every response body, whatever
 * else the page contains (a challenge page can still mention the search page).
 */
const BOT_CHECK_RE =
  /g-recaptcha|recaptcha\/api|hcaptcha|h-captcha|captcha|cf-challenge|challenge-platform|cf-chl|cf-browser-verification|<title>\s*(just a moment|attention required)/i

export function isBotCheck(body: string): boolean {
  return BOT_CHECK_RE.test(body)
}

// ---------------------------------------------------------------------------
// Parsing: search form + results
// ---------------------------------------------------------------------------

/** Read ASP.NET hidden fields (__VIEWSTATE, __EVENTVALIDATION, ...) from a page. */
export function extractHiddenFields(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<input\b[^>]*type="hidden"[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const tag = m[0]
    const name = /\bname="([^"]*)"/.exec(tag)?.[1]
    if (!name) continue
    const value = /\bvalue="([^"]*)"/.exec(tag)?.[1] ?? ""
    out[decodeHtml(name)] = decodeHtml(value)
  }
  if (!out["__VIEWSTATE"]) {
    throw new CliError("İŞKUR search page did not contain a __VIEWSTATE field; the page layout may have changed.", "PARSE_ERROR")
  }
  return out
}

/**
 * The GET of the search page must carry the search form. Anything else (an
 * error page, a maintenance notice) is an error, never an empty result.
 */
export function assertSearchForm(html: string): void {
  if (!html.includes("ctl04$ctlArananMetin2") && !html.includes("ctl04_ctlArananMetin2")) {
    const msg = extractServerMessage(html)
    throw new CliError(
      msg ? `İŞKUR did not return the search form: ${msg}` : "İŞKUR did not return the search form; the page layout may have changed.",
      "PARSE_ERROR",
    )
  }
}

/** Server-side error text shown in the page message box, if any. */
export function extractServerMessage(html: string): string | null {
  const m = /_ctlMessageBox_lblMessage"[^>]*>([\s\S]*?)<\/span>/.exec(html)
  const text = m ? cleanInline(m[1]) : ""
  return text || null
}

export interface JobRow {
  id: string
  title: string
  employer: string | null
  sector: string | null
  period: string | null
  workType: string | null
  openPositions: number | null
  applicationScope: string | null
  province: string | null
  district: string | null
  location: string | null
  deadline: string | null
  daysLeft: string | null
  url: string
}

export interface SearchPage {
  total: number
  page: number
  totalPages: number
  results: JobRow[]
}

function attr(chunk: string, name: string): string | null {
  const m = new RegExp(`\\bdata-${name}='([^']*)'`).exec(chunk) ?? new RegExp(`\\bdata-${name}="([^"]*)"`).exec(chunk)
  if (!m) return null
  const v = decodeHtml(m[1]).replace(/\s+/g, " ").trim()
  return v || null
}

function spanBySuffix(chunk: string, suffix: string): string | null {
  const m = new RegExp(`<span id="[^"]*_${suffix}"[^>]*>([\\s\\S]*?)</span>`).exec(chunk)
  if (!m) return null
  const v = cleanInline(m[1])
  return v || null
}

/** "04.12.2026" or "4.12.2026" to "2026-12-04". */
export function trDateToIso(s: string | null): string | null {
  if (!s) return null
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim())
  if (!m) return s
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

/** "İlçe Geneli Başvuru  (KOCAELİ / ÇAYIROVA)" to its parts. */
export function splitLocation(raw: string | null): { scope: string | null; province: string | null; district: string | null } {
  if (!raw) return { scope: null, province: null, district: null }
  const m = /^(.*?)\s*\((?:Çalışma Yeri:\s*)?([^/()]+?)(?:\s*\/\s*([^()]+?))?\s*\)\s*$/.exec(raw)
  if (!m) return { scope: raw, province: null, district: null }
  return { scope: m[1].trim() || null, province: m[2].trim() || null, district: m[3]?.trim() || null }
}

const MASKED_EMPLOYER = /Sisteme Üye Girişi/i

export function parseSearchResults(html: string): SearchPage {
  const gridStart = html.indexOf('id="ctl04_ctlGridAcikIslerListeDetail"')
  if (gridStart === -1) {
    const msg = extractServerMessage(html)
    throw new CliError(msg ? `İŞKUR returned an error: ${msg}` : "Could not find the results grid in the İŞKUR response.", msg ? "API_ERROR" : "PARSE_ERROR")
  }
  const gridEnd = html.indexOf('id="ctl04_ctlDataPagerDetay"', gridStart)
  const grid = html.slice(gridStart, gridEnd === -1 ? undefined : gridEnd)

  // Each job row starts with the title link whose id contains "_flag_<ilanNo>".
  const parts = grid.split(/(?=<a onclick="PopupJobDetails\()/)
  const results: JobRow[] = []
  for (const chunk of parts.slice(1)) {
    const id = /_flag_(\d+)"/.exec(chunk)?.[1] ?? attr(chunk, "ilanno")
    if (!id) continue
    const titleHtml = /_flag_\d+"[^>]*>([\s\S]*?)<\/a>/.exec(chunk)?.[1] ?? ""
    const title = cleanInline(titleHtml) || attr(chunk, "meslekler") || ""
    const employerRaw = spanBySuffix(chunk, "ctlIsverenDL")
    const location = attr(chunk, "il") ?? spanBySuffix(chunk, "ctlCalismaYeriDL")
    const loc = splitLocation(location)
    const positions = spanBySuffix(chunk, "Label9") ?? attr(chunk, "acikissayi")
    results.push({
      id,
      title,
      employer: employerRaw && !MASKED_EMPLOYER.test(employerRaw) ? employerRaw : null,
      sector: spanBySuffix(chunk, "ctlIsverenTurDL") ?? attr(chunk, "isverentur"),
      period: spanBySuffix(chunk, "ctlCalismaPeriyotDL"),
      workType: spanBySuffix(chunk, "ctlCalismaSekliDL") ?? attr(chunk, "calismasekli"),
      openPositions: positions && /^\d+$/.test(positions) ? Number(positions) : null,
      applicationScope: loc.scope,
      province: loc.province,
      district: loc.district,
      location,
      deadline: trDateToIso(attr(chunk, "sontarih") ?? spanBySuffix(chunk, "ctlSonBasvuruTarihi")),
      daysLeft: spanBySuffix(chunk, "ctlSonBasvuruDL"),
      url: detailUrl(id),
    })
  }

  const totalMatch = /Toplam Kayıt:\s*([\d.]+)/.exec(html)
  const pageMatch = /ctlDataPagerDetay_txtCurrentPage"[^>]*\bvalue="(\d+)"|name="ctl04\$ctlDataPagerDetay\$txtCurrentPage" type="text" value="(\d+)"/.exec(html)
  const pagesMatch = /id="ctl04_ctlDataPagerDetay_txtCurrentPage"[^>]*\/>\s*\/\s*(\d+)/.exec(html)
  const total = totalMatch ? Number(totalMatch[1].replace(/\./g, "")) : results.length
  const page = pageMatch ? Number(pageMatch[1] ?? pageMatch[2]) : 1
  const totalPages = pagesMatch ? Number(pagesMatch[1]) : results.length > 0 ? 1 : 0
  return { total, page, totalPages, results }
}

// ---------------------------------------------------------------------------
// Parsing: detail page
// ---------------------------------------------------------------------------

/** Inner HTML of the element with the given id, honouring nested tags of the same name. */
export function innerHtmlById(html: string, id: string): string | null {
  const open = new RegExp(`<([a-zA-Z0-9]+)\\b[^>]*\\bid="${id.replace(/[$]/g, "\\$")}"[^>]*>`).exec(html)
  if (!open) return null
  const tag = open[1].toLowerCase()
  const start = open.index + open[0].length
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
  re.lastIndex = start
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[0].endsWith("/>")) continue
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(start, m.index)
  }
  return html.slice(start)
}

export interface JobDetail {
  id: string
  url: string
  sectionTitle: string | null
  description: string | null
  qualifications: string | null
  extraConditions: string | null
  occupations: Array<{ name: string; experienceYears: number | null; experienceMonths: number | null }>
  educationMin: string | null
  educationMax: string | null
}

const P = "ctl01_ctlIsIlanBilgileri_"

export function parseDetail(html: string, id: string): JobDetail {
  if (!html.includes(`${P}ctlPanelMeslek`) && !html.includes(`${P}ctlGenelSartlar`)) {
    const msg = extractServerMessage(html)
    throw new CliError(
      msg ? `Job ad ${id} not found or no longer public (İŞKUR said: ${msg})` : `Job ad ${id} not found`,
      "NOT_FOUND",
    )
  }
  const section = (suffix: string): string | null => {
    const inner = innerHtmlById(html, P + suffix)
    if (inner === null) return null
    const t = htmlToText(inner)
    return t || null
  }
  const titleCell = /id="ctl01_ctlIsIlanBilgileri_baslik"[^>]*>([^<]*)/.exec(html)?.[1]
  const extra = [section("ctlOzelSartlarText"), section("ctlGenelSartlarManuel")].filter(Boolean).join("\n\n")

  const occupations: JobDetail["occupations"] = []
  const occRe = new RegExp(`${P}repeaterMeslek_(ctl\\d+)_ctlMeslekLabel">([^<]*)<`, "g")
  let m: RegExpExecArray | null
  while ((m = occRe.exec(html))) {
    const row = m[1]
    const num = (suffix: string) => {
      const v = new RegExp(`${P}repeaterMeslek_${row}_${suffix}">([^<]*)<`).exec(html)?.[1]?.trim()
      return v && /^\d+$/.test(v) ? Number(v) : null
    }
    occupations.push({
      name: cleanInline(m[2]),
      experienceYears: num("ctlMeslekDeneyimSuresiLabel"),
      experienceMonths: num("ctlMeslekDeneyimSuresiLabelAy"),
    })
  }

  return {
    id,
    url: detailUrl(id),
    sectionTitle: titleCell ? cleanInline(titleCell) || null : null,
    description: section("ctlGenelSartlar"),
    qualifications: section("ctlGenelSartlar2"),
    extraConditions: extra || null,
    occupations,
    educationMin: section("ctlOgrenimAsgari"),
    educationMax: section("ctlOgrenimAzami"),
  }
}

// ---------------------------------------------------------------------------
// High-level flows
// ---------------------------------------------------------------------------

const SEARCH_EVENT = "ctl04$ctlAcikIsPageCommand$CommandItem_Search"
const GOTO_PAGE_EVENT = "ctl04$ctlDataPagerDetay$btnChangeCurrentPage"

/**
 * Run a search and return the requested pages. Request count: 1 GET + 1 POST,
 * plus 1 POST per extra page. All requests are throttled by the session.
 */
export async function runSearch(
  session: IskurSession,
  criteria: SearchCriteria,
  startPage: number,
  pages: number,
): Promise<{ first: SearchPage; pages: SearchPage[] }> {
  const fields = buildFormFields(criteria)
  const formPage = await session.request(SEARCH_PATH)
  assertSearchForm(formPage)
  let hidden = extractHiddenFields(formPage)
  let html = await session.request(SEARCH_PATH, {
    form: { ...hidden, ...fields, __EVENTTARGET: SEARCH_EVENT, __EVENTARGUMENT: "" },
  })
  let current = parseSearchResults(html)
  const first = current
  const out: SearchPage[] = []
  let target = startPage
  for (let i = 0; i < pages; i++, target++) {
    if (target > current.totalPages) break
    if (current.page !== target) {
      hidden = extractHiddenFields(html)
      html = await session.request(SEARCH_PATH, {
        form: {
          ...hidden,
          ...fields,
          __EVENTTARGET: GOTO_PAGE_EVENT,
          __EVENTARGUMENT: "",
          "ctl04$ctlDataPagerDetay$txtCurrentPage": String(target),
        },
      })
      current = parseSearchResults(html)
      if (current.page !== target) {
        throw new CliError(`İŞKUR did not move to page ${target} (got page ${current.page}).`, "API_ERROR")
      }
    }
    out.push(current)
  }
  return { first, pages: out }
}

export interface OccupationHit {
  code: number
  specializationCode: number | null
  name: string
}

export function parseOccupations(json: unknown): OccupationHit[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((x) => x && typeof x === "object" && typeof (x as any).Meslek === "string")
    .map((x: any) => ({
      code: Math.trunc(Number(x.PrmMeslekKayitNo)),
      specializationCode: x.PrmMeslekUzmanlikKayitNo == null ? null : Math.trunc(Number(x.PrmMeslekUzmanlikKayitNo)),
      name: String(x.Meslek).trim(),
    }))
}

/** Same normalisation the İŞKUR page applies before calling its occupation autocomplete API. */
export function normalizeOccupationTerm(term: string): string {
  return term.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9şŞıİçÇöÖüÜĞğ,\-/() ]/g, "").trim()
}
