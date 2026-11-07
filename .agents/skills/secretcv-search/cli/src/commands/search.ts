import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import {
  CliError,
  PER_PAGE,
  TYPE_SLUGS,
  araPrefixMessage,
  buildSearchPlan,
  htmlFetch,
  looseIncludes,
  parseListingPage,
  queryApplied,
  resolveCity,
  resolveSector,
  resolveType,
  slugify,
  writeError,
  type AppliedFilter,
  type JobCard,
  type ResolvedSearch,
} from "../helpers.js"

export interface SearchFlags {
  query?: string
  city?: string
  district?: string
  type?: string
  sector?: string
  page: number
  limit?: number
}

export interface ValidationError {
  error: string
  code: string
}

/**
 * Validate flags and resolve them to secretcv.com slugs. Returns either the
 * resolved search or a structured error (never throws).
 */
export function validateSearchFlags(flags: SearchFlags): ResolvedSearch | ValidationError {
  const err = (error: string, code: string): ValidationError => ({ error, code })

  if (flags.district && !flags.city) {
    return err("--district requires --city (e.g. --city mugla --district bodrum)", "INVALID_COMBINATION")
  }
  if (!flags.query && !flags.city && !flags.type && !flags.sector) {
    return err("Provide at least one of --query, --city, --type, --sector", "MISSING_REQUIRED")
  }
  if (!Number.isInteger(flags.page) || flags.page < 1) {
    return err("--page must be a positive integer", "INVALID_ARGUMENT")
  }
  if (flags.page > 1) {
    return err(
      "Only page 1 is available: secretcv.com paginates with ?sf=N, which its robots.txt disallows. Narrow the search (add --city, --type or a more specific --query) instead.",
      "PAGINATION_DISALLOWED"
    )
  }
  if (flags.limit !== undefined && (!Number.isInteger(flags.limit) || flags.limit < 1)) {
    return err("--limit must be a positive integer", "INVALID_ARGUMENT")
  }

  const query = flags.query ? slugify(flags.query) : null
  if (flags.query && !query) return err("--query has no usable letters or digits", "INVALID_ARGUMENT")

  const city = flags.city ? resolveCity(flags.city) : null
  if (flags.city && !city) {
    return err(
      `Unknown city "${flags.city}". Use an il name such as istanbul, ankara, izmir, mugla (for an ilçe use --city <il> --district <ilçe>).`,
      "INVALID_ARGUMENT"
    )
  }
  const type = flags.type ? resolveType(flags.type) : null
  if (flags.type && !type) {
    return err(`Unknown --type "${flags.type}". Valid: ${Object.keys(TYPE_SLUGS).join(", ")}`, "INVALID_ARGUMENT")
  }
  const sector = flags.sector ? resolveSector(flags.sector) : null
  if (flags.sector && !sector) {
    return err(`Unknown --sector "${flags.sector}". See url-reference.md for the sector slug list.`, "INVALID_ARGUMENT")
  }
  const district = flags.district ? slugify(flags.district) : null
  if (flags.district && !district) return err("--district has no usable letters", "INVALID_ARGUMENT")

  if (district) {
    if (!city) return err("--district requires --city (e.g. --city mugla --district bodrum)", "INVALID_COMBINATION")
    if (query || type || sector) {
      return err(
        "--district cannot be combined with --query, --type or --sector (secretcv.com returns 404 for three path segments). Search the district alone, or use --city with --query.",
        "INVALID_COMBINATION"
      )
    }
  }

  const prefixes = [city, type, sector].filter(Boolean).length
  if (query && prefixes > 1) {
    return err(
      "With --query, use at most one of --city, --type, --sector (secretcv.com only honours two path segments).",
      "INVALID_COMBINATION"
    )
  }
  if (!query && !district && prefixes > 1 && !(city && type && !sector)) {
    return err(
      "Without --query, the only supported pairs are --city + --district and --type + --city.",
      "INVALID_COMBINATION"
    )
  }

  // The single-segment path /is-ilanlari/{query}-is-ilanlari matches robots.txt
  // "Disallow: /is-ilanlari/ara" when the slug starts with "ara". Refuse it up
  // front. (With a city/type/sector prefix the first URL is allowed; a keyword
  // fallback to the single-segment path is refused by htmlFetch with the same message.)
  if (query && query.startsWith("ara") && !city && !type && !sector) {
    return err(araPrefixMessage(query), "ROBOTS_DISALLOWED")
  }

  return { query, city, district, type, sector }
}

export interface SearchOutput {
  meta: {
    total: number
    page: number
    perPage: number
    hasMore: boolean
    url: string
    appliedFilters: AppliedFilter[]
    warnings: string[]
  }
  results: JobCard[]
}

/** Run a search. All network access goes through htmlFetch (robots guard, delay, block detection). */
export async function runSearch(r: ResolvedSearch, limit?: number): Promise<SearchOutput> {
  const plan = buildSearchPlan(r)
  const warnings: string[] = []

  let url = plan.primary
  let page = parseListingPage((await htmlFetch(url)).html)

  if (r.query && !queryApplied(page.appliedFilters, r.query)) {
    if (plan.keywordFallback) {
      // The query is not a known position slug, so secretcv.com dropped it from the
      // two-segment path. Fetch the keyword-only path and apply the other filter locally.
      url = plan.keywordFallback
      page = parseListingPage((await htmlFetch(url)).html)
      if (r.city) {
        const cityWord = r.city.replace(/-(anadolu|avrupa)$/, "").replace(/-/g, " ")
        const before = page.results.length
        page.results = page.results.filter((j) => looseIncludes(j.location, cityWord) || looseIncludes(j.districts, cityWord))
        warnings.push(
          `"${r.query}" is a free-text keyword on secretcv.com, so the city filter was applied locally to the first ${before} keyword results (meta.total counts all cities).`
        )
      } else {
        warnings.push(
          `"${r.query}" is a free-text keyword on secretcv.com and cannot be combined with --type/--sector by URL. Results are keyword-only; check each posting's employmentType/sector with detail.`
        )
      }
    }
    if (!queryApplied(page.appliedFilters, r.query)) {
      warnings.push(`secretcv.com did not apply "${r.query}" as a filter; results may be unrelated.`)
    }
  }

  let results = page.results
  if (limit !== undefined) results = results.slice(0, limit)

  return {
    meta: {
      total: page.total,
      page: 1,
      perPage: PER_PAGE,
      hasMore: page.hasNextPage,
      url,
      appliedFilters: page.appliedFilters,
      warnings,
    },
    results,
  }
}

export const search = defineCommand({
  name: "search",
  description: "Search job listings on secretcv.com (Turkey) via robots.txt-allowed listing paths",
  options: {
    query: option(z.string().optional(), {
      short: "q",
      description: "Position or keyword, e.g. 'yazılım geliştirici', garson, muhasebe",
    }),
    city: option(z.string().optional(), {
      short: "c",
      description: "City (il), e.g. istanbul, istanbul-avrupa, ankara, izmir, muğla",
    }),
    district: option(z.string().optional(), {
      short: "d",
      description: "District (ilçe) inside --city, e.g. bodrum, kadıköy (cannot be combined with --query)",
    }),
    type: option(z.string().optional(), {
      short: "t",
      description: `Work type: ${Object.keys(TYPE_SLUGS).join(", ")}`,
    }),
    sector: option(z.string().optional(), {
      short: "s",
      description: "Sector slug, e.g. bilgisayar-bt-internet, restorancilik, bankacilik-finans",
    }),
    page: option(z.coerce.number().default(1), {
      description: "Page number. Only 1 is supported (paging is disallowed by robots.txt)",
    }),
    limit: option(z.coerce.number().optional(), {
      description: "Cap total results returned (client-side, max 20 per search)",
    }),
    format: option(z.enum(["json", "table", "plain"]).default("json"), {
      description: "Output format: json, table, plain",
    }),
  },
  handler: async ({ flags, signal }) => {
    const resolved = validateSearchFlags(flags)
    if ("code" in resolved && "error" in resolved) {
      writeError(resolved.error, resolved.code)
      process.exit(1)
    }
    if (signal.aborted) return

    try {
      const output = await runSearch(resolved as ResolvedSearch, flags.limit)
      if (signal.aborted) return
      if (flags.format === "json") {
        console.log(JSON.stringify(output, null, 2))
      } else if (flags.format === "table") {
        outputTable(output)
      } else {
        outputPlain(output)
      }
    } catch (err) {
      if (err instanceof CliError) writeError(err.message, err.code)
      else writeError(err instanceof Error ? err.message : String(err), "API_ERROR")
      process.exit(1)
    }
  },
})

function pad(s: string, n: number): string {
  return s.length > n ? s.substring(0, n - 1) + "…" : s.padEnd(n)
}

function outputTable(out: SearchOutput): void {
  console.log(`total: ${out.meta.total}  shown: ${out.results.length}  url: ${out.meta.url}`)
  for (const w of out.meta.warnings) console.log(`warning: ${w}`)
  console.log(`${pad("id", 8)} ${pad("title", 40)} ${pad("company", 26)} ${pad("location", 18)} posted`)
  for (const r of out.results) {
    console.log(
      `${pad(r.id, 8)} ${pad(r.title, 40)} ${pad(r.company ?? "-", 26)} ${pad(r.location ?? "-", 18)} ${r.date ?? "-"}`
    )
  }
}

function outputPlain(out: SearchOutput): void {
  for (const w of out.meta.warnings) console.log(`warning: ${w}\n`)
  for (const r of out.results) {
    console.log(`id: ${r.id}`)
    console.log(`title: ${r.title}`)
    console.log(`company: ${r.company ?? "-"}`)
    console.log(`location: ${r.location ?? "-"}`)
    console.log(`districts: ${r.districts ?? "-"}`)
    console.log(`posted: ${r.postedText ?? "-"} (${r.date ?? "-"})`)
    console.log(`url: ${r.url}`)
    console.log("")
  }
}
