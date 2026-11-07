import { describe, test, expect } from "bun:test"
import { runCLI, parseJSON } from "./helpers"

// Flag validation runs before any network request, so these tests are offline.
// The `iller` command is fully offline as well.

function errorCode(stderr: string): string | undefined {
  const line = stderr.split("\n").find((l) => l.startsWith("{"))
  return line ? (JSON.parse(line) as { code: string }).code : undefined
}

describe("search flag validation (offline)", () => {
  test("unknown il fails with INVALID_FLAG", async () => {
    const r = await runCLI(["search", "--il", "Atlantis"])
    expect(r.exitCode).toBe(1)
    expect(errorCode(r.stderr)).toBe("INVALID_FLAG")
  })

  test("--work-type with --sector kamu is rejected", async () => {
    const r = await runCLI(["search", "--sector", "kamu", "--work-type", "tam"])
    expect(r.exitCode).toBe(1)
    expect(errorCode(r.stderr)).toBe("INVALID_FLAG")
  })

  test("--period with the default ozel sector is rejected", async () => {
    const r = await runCLI(["search", "--period", "daimi"])
    expect(r.exitCode).toBe(1)
    expect(errorCode(r.stderr)).toBe("INVALID_FLAG")
  })

  test("non-numeric --meslek-kodu is rejected", async () => {
    const r = await runCLI(["search", "--meslek-kodu", "yazilim"])
    expect(r.exitCode).toBe(1)
    expect(errorCode(r.stderr)).toBe("INVALID_FLAG")
  })

  test("enum flags reject unknown values", async () => {
    for (const args of [["--sector", "devlet"], ["--posted", "1y"], ["--education", "phd"], ["--page", "0"], ["--pages", "50"]]) {
      const r = await runCLI(["search", ...args])
      expect(r.exitCode).not.toBe(0)
    }
  })
})

describe("detail and meslek validation (offline)", () => {
  test("detail without id fails with MISSING_REQUIRED", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(errorCode(r.stderr)).toBe("MISSING_REQUIRED")
  })

  test("detail with a non-numeric id fails with INVALID_ID", async () => {
    const r = await runCLI(["detail", "not-an-id"])
    expect(r.exitCode).toBe(1)
    expect(errorCode(r.stderr)).toBe("INVALID_ID")
  })

  test("meslek needs at least 3 letters", async () => {
    const r = await runCLI(["meslek", "--query", "ya"])
    expect(r.exitCode).toBe(1)
    expect(errorCode(r.stderr)).toBe("INVALID_FLAG")
  })
})

describe("iller (offline)", () => {
  test("lists all 81 provinces", async () => {
    const rows = parseJSON<Array<{ code: number; name: string }>>(await runCLI(["iller"]))
    expect(rows).toHaveLength(81)
    expect(rows[0]).toEqual({ code: 1, name: "ADANA" })
  })

  test("filter is Turkish-insensitive", async () => {
    const rows = parseJSON<Array<{ code: number; name: string }>>(await runCLI(["iller", "--filter", "istanbul"]))
    expect(rows).toEqual([{ code: 34, name: "İSTANBUL" }])
  })
})
