import { join } from "path";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");
const FIXTURES = join(import.meta.dir, "fixtures");

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCLI(args: string[]): Promise<CLIResult> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export async function fixture(name: string): Promise<string> {
  return Bun.file(join(FIXTURES, name)).text();
}

export function parseErrorJSON(result: CLIResult): { error: string; code: string } {
  return JSON.parse(result.stderr.split("\n").pop() ?? "{}");
}
