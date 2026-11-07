import { createCLI } from "@bunli/core"
import { search } from "./commands/search.js"
import { detail } from "./commands/detail.js"
import { iller, meslek } from "./commands/lookups.js"

const cli = await createCLI({
  name: "iskur-cli",
  version: "0.1.0",
  description: "CLI for public İŞKUR (Türkiye İş Kurumu) open job listings",
})

cli.command(search)
cli.command(detail)
cli.command(iller)
cli.command(meslek)

await cli.run()
