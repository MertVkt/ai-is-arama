import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import { CliError, htmlFetch, parseDetailPage, resolveDetailTarget, writeError, type JobDetail } from "../helpers.js"

export const detail = defineCommand({
  name: "detail",
  description: "Fetch the full secretcv.com job posting by numeric id or URL",
  options: {
    format: option(z.enum(["json", "plain"]).default("json"), {
      description: "Output format: json, plain",
    }),
  },
  handler: async ({ positional, flags, signal }) => {
    if (signal.aborted) return

    const arg = positional[0]
    if (!arg) {
      writeError("Job id or URL is required", "MISSING_REQUIRED")
      process.exit(1)
    }

    try {
      const target = resolveDetailTarget(arg)
      const page = await htmlFetch(target.url)
      if (signal.aborted) return
      const data = parseDetailPage(page.html, page.url, target.id)
      if (flags.format === "json") console.log(JSON.stringify(data, null, 2))
      else outputPlain(data)
    } catch (err) {
      if (err instanceof CliError) {
        writeError(err.code === "NOT_FOUND" ? "Job not found (it may have expired)" : err.message, err.code)
      } else {
        writeError(err instanceof Error ? err.message : String(err), "API_ERROR")
      }
      process.exit(1)
    }
  },
})

function outputPlain(d: JobDetail): void {
  console.log(`id: ${d.id}`)
  console.log(`title: ${d.title}`)
  console.log(`company: ${d.company ?? "-"}`)
  console.log(`location: ${d.location ?? "-"}`)
  console.log(`districts: ${d.districts ?? "-"}`)
  console.log(`employmentType: ${d.employmentType ?? "-"}`)
  console.log(`sector: ${d.sector ?? "-"}`)
  console.log(`education: ${d.education ?? "-"}`)
  console.log(`datePosted: ${d.datePosted ?? "-"}`)
  console.log(`deadline: ${d.deadline ?? "-"}`)
  console.log(`applyUrl: ${d.applyUrl ?? "-"}${d.applyRequiresLogin ? " (requires secretcv.com login)" : ""}`)
  if (d.applyPhone) console.log(`applyPhone: ${d.applyPhone}`)
  console.log(`url: ${d.url}`)
  console.log("")
  if (d.description) console.log(d.description)
}
