import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import { CliError, htmlFetch, parseDetailPage, resolveDetailTarget, writeError, type JobDetail } from "../helpers.js"

export const detail = defineCommand({
  name: "detail",
  description: "Fetch the full eleman.net posting by numeric id or /is-ilani/ URL",
  options: {
    format: option(z.enum(["json", "plain"]).default("json"), {
      description: "Output format: json, plain",
    }),
  },
  handler: async ({ positional, flags, signal }) => {
    if (signal.aborted) return
    const arg = positional[0]
    if (!arg) {
      writeError("Job id or URL is required (e.g. 4802953 or https://www.eleman.net/is-ilani/garson-i4802953)", "MISSING_REQUIRED")
      process.exit(1)
    }

    try {
      const { id, url } = resolveDetailTarget(arg)
      const page = await htmlFetch(url)
      if (signal.aborted) return
      if (!/\/is-ilani\//.test(page.url)) throw new CliError("Job not found (posting may have been removed)", "NOT_FOUND")
      const data = parseDetailPage(page.html, page.url, id)
      if (flags.format === "json") console.log(JSON.stringify(data, null, 2))
      else outputPlain(data)
    } catch (err) {
      const code = err instanceof CliError ? err.code : "API_ERROR"
      writeError(err instanceof Error ? err.message : String(err), code)
      process.exit(1)
    }
  },
})

function outputPlain(d: JobDetail): void {
  const rows: [string, string | null][] = [
    ["id", d.id],
    ["title", d.title],
    ["company", d.company],
    ["companyUrl", d.companyUrl],
    ["location", d.location],
    ["datePosted", d.datePosted],
    ["validThrough", d.validThrough],
    ["employmentType", d.employmentType],
    ["salary", d.salary],
    ["benefits", d.benefits],
    ["experience", d.experience],
    ["gender", d.gender],
    ["ageRange", d.ageRange],
    ["openings", d.openings],
    ["phoneApplication", d.phoneApplication ? "yes (number visible after login)" : "no"],
    ["applyUrl", d.applyUrl],
    ["url", d.url],
  ]
  for (const [k, v] of rows) console.log(`${k}: ${v ?? "-"}`)
  console.log("")
  if (d.description) console.log(d.description)
}
