import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import {
  CliError,
  EDUCATION,
  IskurSession,
  KAMU_ILAN_TURU,
  MAX_PAGE,
  MAX_PAGES_PER_CALL,
  PAGE_SIZE,
  PERIOD,
  POSTED,
  WORK_TYPE,
  resolveProvince,
  runSearch,
  validateCriteria,
  writeError,
  type JobRow,
  type SearchCriteria,
} from "../helpers.js"

const enumKeys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

export const search = defineCommand({
  name: "search",
  description: "Search public İŞKUR open job listings (açık iş ilanları)",
  options: {
    query: option(z.string().optional(), {
      short: "q",
      description: "Free text: position, occupation, skill or company (e.g. 'yazılım', 'muhasebe')",
    }),
    il: option(z.string().optional(), {
      description: "Province: plate code (35) or name (izmir, İstanbul). See the 'iller' command",
    }),
    sector: option(z.enum(["ozel", "kamu"]).default("ozel"), {
      description: "İşyeri türü: ozel (private sector, default) or kamu (public sector)",
    }),
    "meslek-kodu": option(z.string().optional(), {
      description: "İŞKUR occupation code from the 'meslek' command (e.g. 6440 = Yazılım Mühendisi)",
    }),
    posted: option(z.enum(enumKeys(POSTED)).default("all"), {
      description: "İlan tarihi: all, 24h, 7d, 15d",
    }),
    education: option(z.enum(enumKeys(EDUCATION)).optional(), {
      description: "Öğrenim durumu: " + Object.keys(EDUCATION).join(", "),
    }),
    "work-type": option(z.enum(enumKeys(WORK_TYPE)).optional(), {
      description: "Çalışma şekli (ozel only): tam (full time) or kismi (part time)",
    }),
    period: option(z.enum(enumKeys(PERIOD)).optional(), {
      description: "Çalışma periyodu (kamu only): daimi or gecici",
    }),
    "ilan-turu": option(z.enum(enumKeys(KAMU_ILAN_TURU)).optional(), {
      description: "İlan türü (kamu only): genel, engelli, eski-hukumlu, tmy",
    }),
    employer: option(z.string().optional(), {
      description: "İşyeri ünvanı contains this text",
    }),
    "ilan-no": option(z.string().optional(), {
      description: "Exact İŞKUR ilan number",
    }),
    page: option(z.coerce.number().int().min(1).max(MAX_PAGE).default(1), {
      description: `Page number (1-indexed, ${PAGE_SIZE} results per page, max ${MAX_PAGE})`,
    }),
    pages: option(z.coerce.number().int().min(1).max(MAX_PAGES_PER_CALL).default(1), {
      description: `Number of consecutive pages to fetch (max ${MAX_PAGES_PER_CALL})`,
    }),
    limit: option(z.coerce.number().int().min(1).optional(), {
      description: "Cap total results returned by the CLI (client-side)",
    }),
    format: option(z.enum(["json", "table", "plain"]).default("json"), {
      description: "Output format: json, table, plain",
    }),
  },
  handler: async ({ flags, signal }) => {
    if (signal.aborted) return

    let criteria: SearchCriteria
    try {
      criteria = {
        query: flags.query?.trim() || undefined,
        sector: flags.sector,
        il: flags.il ? resolveProvince(flags.il).code : undefined,
        occupationCode: flags["meslek-kodu"]?.trim() || undefined,
        posted: flags.posted,
        education: flags.education,
        workType: flags["work-type"],
        period: flags.period,
        ilanTuru: flags["ilan-turu"],
        employer: flags.employer?.trim() || undefined,
        ilanNo: flags["ilan-no"]?.trim() || undefined,
      }
      validateCriteria(criteria)
    } catch (err) {
      const e = err instanceof CliError ? err : new CliError(String(err), "INVALID_FLAG")
      writeError(e.message, e.code)
      process.exit(1)
    }

    try {
      const session = new IskurSession()
      const { first, pages } = await runSearch(session, criteria, flags.page, flags.pages)
      if (signal.aborted) return

      let results: JobRow[] = pages.flatMap((p) => p.results)
      if (flags.limit !== undefined) results = results.slice(0, flags.limit)

      const output = {
        meta: {
          source: "esube.iskur.gov.tr",
          total: first.total,
          totalPages: first.totalPages,
          page: flags.page,
          pagesFetched: pages.map((p) => p.page),
          pageSize: PAGE_SIZE,
          returned: results.length,
          criteria: {
            query: criteria.query ?? null,
            sector: criteria.sector,
            il: criteria.il ?? null,
            meslekKodu: criteria.occupationCode ?? null,
            posted: criteria.posted,
          },
        },
        results,
      }

      if (flags.format === "json") {
        console.log(JSON.stringify(output, null, 2))
      } else if (flags.format === "table") {
        outputTable(output.meta.total, results)
      } else {
        outputPlain(results)
      }
    } catch (err) {
      const e = err instanceof CliError ? err : new CliError(err instanceof Error ? err.message : String(err), "API_ERROR")
      writeError(e.message, e.code)
      process.exit(1)
    }
  },
})

function cut(s: string | null | undefined, n: number): string {
  const v = s ?? "-"
  return (v.length > n ? v.slice(0, n - 1) + "…" : v).padEnd(n)
}

export function outputTable(total: number, results: JobRow[]): void {
  console.log(`Toplam: ${total}`)
  console.log(`${"ilanNo".padEnd(11)}  ${"meslek".padEnd(34)}  ${"il / ilçe".padEnd(26)}  ${"tür".padEnd(5)}  ${"şekil".padEnd(12)}  ${"poz".padStart(3)}  son başvuru`)
  for (const r of results) {
    const place = [r.province, r.district].filter(Boolean).join(" / ")
    console.log(
      `${r.id.padEnd(11)}  ${cut(r.title, 34)}  ${cut(place, 26)}  ${cut(r.sector, 5)}  ${cut(r.workType, 12)}  ${String(r.openPositions ?? "-").padStart(3)}  ${r.deadline ?? "-"}`,
    )
  }
}

function outputPlain(results: JobRow[]): void {
  for (const r of results) {
    console.log(`ilanNo: ${r.id}`)
    console.log(`meslek: ${r.title}`)
    console.log(`işveren: ${r.employer ?? "(gizli, giriş gerekir)"}`)
    console.log(`tür: ${[r.sector, r.period, r.workType].filter(Boolean).join(" / ") || "-"}`)
    console.log(`yer: ${r.location ?? "-"}`)
    console.log(`açık pozisyon: ${r.openPositions ?? "-"}`)
    console.log(`son başvuru: ${r.deadline ?? "-"}${r.daysLeft ? ` (${r.daysLeft})` : ""}`)
    console.log(`url: ${r.url}`)
    console.log("")
  }
}
