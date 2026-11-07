import { defineCommand, option } from "@bunli/core"
import { z } from "zod"
import {
  CliError,
  IskurSession,
  OCCUPATION_API_PATH,
  PROVINCES,
  foldTr,
  normalizeOccupationTerm,
  parseOccupations,
  writeError,
} from "../helpers.js"

export const iller = defineCommand({
  name: "iller",
  description: "List İŞKUR province (il) codes for --il (offline, no network)",
  options: {
    filter: option(z.string().optional(), { description: "Only provinces whose name contains this text" }),
    format: option(z.enum(["json", "table", "plain"]).default("json"), { description: "Output format: json, table, plain" }),
  },
  handler: async ({ flags }) => {
    const key = flags.filter ? foldTr(flags.filter) : ""
    const rows = [...PROVINCES].filter((p) => !key || foldTr(p.name).includes(key)).sort((a, b) => a.code - b.code)
    if (flags.format === "json") console.log(JSON.stringify(rows, null, 2))
    else for (const p of rows) console.log(`${String(p.code).padStart(2)}  ${p.name}`)
  },
})

export const meslek = defineCommand({
  name: "meslek",
  description: "Look up İŞKUR occupation codes (for search --meslek-kodu) via the public autocomplete API",
  options: {
    query: option(z.string().optional(), { short: "q", description: "At least 3 letters, e.g. 'yazılım', 'hemşire'" }),
    limit: option(z.coerce.number().int().min(1).optional(), { description: "Cap number of results" }),
    format: option(z.enum(["json", "table", "plain"]).default("json"), { description: "Output format: json, table, plain" }),
  },
  handler: async ({ flags, positional }) => {
    const term = normalizeOccupationTerm(flags.query ?? (positional[0] as string | undefined) ?? "")
    if (term.length < 3) {
      writeError("--query needs at least 3 letters (İŞKUR autocomplete minimum)", "INVALID_FLAG")
      process.exit(1)
    }
    try {
      const session = new IskurSession()
      const body = await session.request(OCCUPATION_API_PATH + encodeURIComponent(term), { accept: "application/json" })
      let json: unknown
      try {
        json = JSON.parse(body)
      } catch {
        throw new CliError("İŞKUR occupation API did not return JSON", "PARSE_ERROR")
      }
      let rows = parseOccupations(json)
      if (flags.limit !== undefined) rows = rows.slice(0, flags.limit)
      if (flags.format === "json") console.log(JSON.stringify(rows, null, 2))
      else for (const r of rows) console.log(`${String(r.code).padStart(6)}  ${r.name}`)
    } catch (err) {
      const e = err instanceof CliError ? err : new CliError(err instanceof Error ? err.message : String(err), "API_ERROR")
      writeError(e.message, e.code)
      process.exit(1)
    }
  },
})
