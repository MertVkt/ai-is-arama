import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import {
  CliError,
  DETAIL_PATH,
  IskurSession,
  normalizeJobId,
  parseDetail,
  runSearch,
  writeError,
  type JobDetail,
  type JobRow,
} from "../helpers.js"

type DetailOutput = JobDetail & { summary: JobRow | null }

export const detail = defineCommand({
  name: "detail",
  description: "Full detail for one İŞKUR job ad (ilan number or detail URL)",
  options: {
    summary: option(z.enum(["on", "off"]).default("on"), {
      description:
        "on (default): also look the ad up by ilan number to add location, deadline, sector and positions (2-5 extra requests). off: detail page only",
    }),
    format: option(z.enum(["json", "table", "plain"]).default("json"), {
      description: "Output format: json, table, plain",
    }),
  },
  handler: async ({ positional, flags, signal }) => {
    if (signal.aborted) return
    const raw = positional[0] as string | undefined
    if (!raw) {
      writeError("İlan number or detail URL is required, e.g. detail 00009890180", "MISSING_REQUIRED")
      process.exit(1)
    }

    try {
      const id = normalizeJobId(raw)
      const session = new IskurSession()
      const html = await session.request(`${DETAIL_PATH}?uiID=${id}`)
      const parsed = parseDetail(html, id)

      let summary: JobRow | null = null
      if (flags.summary === "on") {
        // The detail page omits location, deadline and sector, so look the ad up
        // in the public search by its number: private sector first, then public.
        for (const sector of ["ozel", "kamu"] as const) {
          const { pages } = await runSearch(session, { sector, posted: "all", ilanNo: id }, 1, 1)
          summary = pages[0]?.results.find((r) => r.id === id) ?? null
          if (summary) break
        }
      }
      if (signal.aborted) return

      const data: DetailOutput = { ...parsed, summary }
      if (flags.format === "json") console.log(JSON.stringify(data, null, 2))
      else if (flags.format === "table") outputTable(data)
      else outputPlain(data)
    } catch (err) {
      const e = err instanceof CliError ? err : new CliError(err instanceof Error ? err.message : String(err), "API_ERROR")
      writeError(e.message, e.code)
      process.exit(1)
    }
  },
})

function occupationLine(d: DetailOutput): string {
  return (
    d.occupations
      .map((o) => {
        const exp = [o.experienceYears ? `${o.experienceYears} yıl` : "", o.experienceMonths ? `${o.experienceMonths} ay` : ""]
          .filter(Boolean)
          .join(" ")
        return exp ? `${o.name} (deneyim: ${exp})` : o.name
      })
      .join("; ") || "-"
  )
}

function outputTable(d: DetailOutput): void {
  const s = d.summary
  console.log(`İlan No:       ${d.id}`)
  console.log(`Meslek:        ${occupationLine(d)}`)
  console.log(`İşveren:       ${s?.employer ?? (s ? "(gizli, giriş gerekir)" : "-")}`)
  console.log(`Tür:           ${s ? [s.sector, s.period, s.workType].filter(Boolean).join(" / ") : "-"}`)
  console.log(`Yer:           ${s?.location ?? "-"}`)
  console.log(`Açık Pozisyon: ${s?.openPositions ?? "-"}`)
  console.log(`Son Başvuru:   ${s?.deadline ?? "-"}${s?.daysLeft ? ` (${s.daysLeft})` : ""}`)
  console.log(`Öğrenim:       ${[d.educationMin, d.educationMax].filter(Boolean).join(" - ") || "-"}`)
  console.log(`URL:           ${d.url}`)
}

function outputPlain(d: DetailOutput): void {
  outputTable(d)
  for (const [label, body] of [
    [d.sectionTitle ?? "İş Tanımı", d.description],
    ["Nitelik ve Beceriler", d.qualifications],
    ["Ek Şartlar", d.extraConditions],
  ] as const) {
    if (!body) continue
    console.log("")
    console.log(`## ${label}`)
    console.log(body)
  }
}
