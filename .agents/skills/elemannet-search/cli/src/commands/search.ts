import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import {
  CliError,
  FILTER_SLUGS,
  MAX_PAGES,
  PER_PAGE,
  buildListingUrl,
  htmlFetch,
  matchesKeyword,
  parseListingPage,
  unknownSlugs,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchFlags {
  position?: string
  city?: string
  filter?: string
  keyword?: string
  page: number
  pages: number
  limit?: number
}

/** Validates flag combinations. Returns an error (message, code) or null. */
export function validateSearchFlags(flags: SearchFlags): { message: string; code: string } | null {
  if (!flags.position && !flags.city && !flags.filter) {
    return {
      message: "At least one of --position, --city or --filter is required (eleman.net has no robots-allowed free-text search)",
      code: "MISSING_REQUIRED",
    }
  }
  if (!Number.isInteger(flags.page) || flags.page < 1) return { message: "--page must be an integer >= 1", code: "INVALID_ARGUMENT" }
  if (!Number.isInteger(flags.pages) || flags.pages < 1 || flags.pages > MAX_PAGES) {
    return { message: `--pages must be an integer between 1 and ${MAX_PAGES}`, code: "INVALID_ARGUMENT" }
  }
  if (flags.limit !== undefined && (!Number.isInteger(flags.limit) || flags.limit < 1)) {
    return { message: "--limit must be an integer >= 1", code: "INVALID_ARGUMENT" }
  }
  if (flags.filter && !FILTER_SLUGS[flags.filter]) {
    return { message: `Unknown --filter '${flags.filter}'. Use one of: ${Object.keys(FILTER_SLUGS).join(", ")}`, code: "INVALID_ARGUMENT" }
  }
  const segments = [flags.position, flags.city, flags.filter].filter(Boolean).length
  if (segments > 2) {
    return {
      message: "eleman.net listing paths support at most two of --city, --position, --filter at once. Drop one and use --keyword to narrow client-side.",
      code: "INVALID_COMBINATION",
    }
  }
  return null
}

export const search = defineCommand({
  name: "search",
  description: "List job postings on eleman.net by position and/or city (path-based listing pages)",
  options: {
    position: option(z.string().optional(), {
      short: "p",
      description: "Position slug or name, e.g. garson, 'satış temsilcisi', barista",
    }),
    city: option(z.string().optional(), {
      short: "c",
      description: "City (il) or district (ilçe), e.g. izmir, muğla, bodrum, kadıköy",
    }),
    filter: option(z.string().optional(), {
      short: "f",
      description: `Listing filter: ${Object.keys(FILTER_SLUGS).join(", ")}`,
    }),
    keyword: option(z.string().optional(), {
      short: "k",
      description: "Client-side keyword filter applied to fetched cards (title, company, location, snippet)",
    }),
    page: option(z.coerce.number().default(1), {
      description: "First page to fetch (1-indexed, 30 postings per page)",
    }),
    pages: option(z.coerce.number().default(1), {
      description: `Number of consecutive pages to fetch (1-${MAX_PAGES})`,
    }),
    limit: option(z.coerce.number().optional(), {
      description: "Cap total results returned (client-side)",
    }),
    format: option(z.enum(["json", "table", "plain"]).default("json"), {
      description: "Output format: json, table, plain",
    }),
  },
  handler: async ({ flags, signal }) => {
    const problem = validateSearchFlags(flags)
    if (problem) {
      writeError(problem.message, problem.code)
      process.exit(1)
    }

    try {
      const opts = { position: flags.position, city: flags.city, filter: flags.filter }
      const { url: firstUrl, slugs } = buildListingUrl(opts, flags.page)

      let results: JobCard[] = []
      let totalPages: number | null = null
      let pageTitle: string | null = null
      const fetchedUrls: string[] = []
      let lastPage = flags.page

      for (let p = flags.page; p < flags.page + flags.pages; p++) {
        if (signal.aborted) return
        const url = p === flags.page ? firstUrl : buildListingUrl(opts, p).url
        const { html } = await htmlFetch(url)
        fetchedUrls.push(url)
        const parsed = parseListingPage(html)

        if (p === flags.page) {
          const unknown = unknownSlugs(slugs, parsed.canonical)
          if (unknown.length) {
            throw new CliError(
              `eleman.net does not recognise: ${unknown.join(", ")} (it fell back to ${parsed.canonical}). ` +
                "Try a simpler or more common Turkish position name (e.g. 'garson', 'satis-temsilcisi'), the il instead of a small ilçe, or drop the filter.",
              "UNKNOWN_SLUG"
            )
          }
          pageTitle = parsed.pageTitle
        }
        totalPages = parsed.totalPages ?? totalPages
        const ids = new Set(results.map((r) => r.id))
        results.push(...parsed.results.filter((r) => !ids.has(r.id)))
        lastPage = p
        if (parsed.results.length === 0 || (totalPages !== null && p >= totalPages)) break
      }

      if (flags.keyword) results = results.filter((r) => matchesKeyword(r, flags.keyword!))
      if (flags.limit !== undefined) results = results.slice(0, flags.limit)

      const output = {
        meta: {
          source: "eleman.net",
          listing: pageTitle,
          url: firstUrl,
          page: flags.page,
          lastPageFetched: lastPage,
          totalPages,
          perPage: PER_PAGE,
          count: results.length,
          fetched: fetchedUrls.length,
        },
        results,
      }

      if (flags.format === "json") console.log(JSON.stringify(output, null, 2))
      else if (flags.format === "table") outputTable(results, output.meta)
      else outputPlain(results)
    } catch (err) {
      const code = err instanceof CliError ? err.code : "API_ERROR"
      writeError(err instanceof Error ? err.message : String(err), code)
      process.exit(1)
    }
  },
})

function cell(text: string | null, width: number): string {
  const t = text ?? "-"
  return (t.length > width ? t.slice(0, width - 1) + "…" : t).padEnd(width)
}

function outputTable(results: JobCard[], meta: { listing: string | null; page: number; lastPageFetched: number; totalPages: number | null }): void {
  console.log(`# ${meta.listing ?? "eleman.net"} | pages ${meta.page}-${meta.lastPageFetched} of ${meta.totalPages ?? "?"} | ${results.length} results`)
  console.log(`${"id".padEnd(8)} ${"title".padEnd(38)} ${"company".padEnd(26)} location`)
  for (const r of results) {
    console.log(`${r.id.padEnd(8)} ${cell(r.title, 38)} ${cell(r.company, 26)} ${r.location ?? "-"}`)
  }
}

function outputPlain(results: JobCard[]): void {
  for (const r of results) {
    console.log(`id: ${r.id}`)
    console.log(`title: ${r.title}`)
    console.log(`company: ${r.company ?? "-"}`)
    console.log(`location: ${r.location ?? "-"}`)
    if (r.benefits) console.log(`benefits: ${r.benefits}`)
    if (r.badges.length) console.log(`badges: ${r.badges.join(", ")}`)
    console.log(`url: ${r.url}`)
    if (r.description) console.log(`snippet: ${r.description}`)
    console.log("")
  }
}
