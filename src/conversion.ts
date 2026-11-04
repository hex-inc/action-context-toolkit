import * as exec from "@actions/exec";
import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";
import { CliSemanticProjectConversion } from "./types";

const execFile = promisify(execFileCallback);
const CONFIG_FILENAMES = [
  "hex_context.config.json",
  "hex_context.config.yaml",
  "hex_context.config.yml",
];

export async function collectConversionDiagnostics(
  configFile: string,
): Promise<CliSemanticProjectConversion[]> {
  const configPath = await findConfig(configFile);
  if (!configPath) return [];
  const contents = await fs.readFile(configPath, "utf8");
  const config: unknown = configPath.endsWith(".json")
    ? JSON.parse(contents)
    : parse(contents);
  if (!isRecord(config) || !Array.isArray(config.semanticProjects)) return [];

  const conversions: CliSemanticProjectConversion[] = [];
  for (const project of config.semanticProjects) {
    if (!isRecord(project) || !isRecord(project.convert)) continue;
    const { id, path: sourcePath, convert } = project;
    if (
      typeof id !== "string" ||
      typeof sourcePath !== "string" ||
      (convert.from !== "ossie" && convert.from !== "dbt")
    ) {
      throw new Error("Invalid semantic project conversion in context config.");
    }
    const output = await fs.mkdtemp(
      path.join(os.tmpdir(), "hex-action-convert-"),
    );
    try {
      const args = [
        "context",
        "semantic-project",
        "convert",
        "--from",
        convert.from,
        "--to",
        "hex",
        "--input",
        path.resolve(path.dirname(configPath), sourcePath),
        "--output",
        output,
        "--json",
        "-vv",
      ];
      if (typeof convert.dialect === "string")
        args.push("--dialect", convert.dialect);
      const command = await exec.getExecOutput("hex", args, {
        ignoreReturnCode: true,
      });
      const result: unknown = JSON.parse(command.stdout);
      if (
        !isRecord(result) ||
        typeof result.stdout !== "string" ||
        typeof result.stderr !== "string" ||
        typeof result.exitCode !== "number"
      ) {
        throw new Error(
          isRecord(result) && typeof result.error === "string"
            ? result.error
            : "Unexpected output from semantic project conversion.",
        );
      }
      conversions.push({
        id,
        path: sourcePath,
        from: convert.from,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: command.exitCode || result.exitCode,
      });
    } finally {
      await fs.rm(output, { recursive: true, force: true });
    }
  }
  return conversions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

async function findConfig(configFile: string): Promise<string | undefined> {
  if (configFile) return path.resolve(configFile);
  const { stdout } = await execFile("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
  });
  for (const name of CONFIG_FILENAMES) {
    const candidate = path.join(stdout.trim(), name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT") throw error;
    }
  }
  return undefined;
}
