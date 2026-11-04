import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as exec from "@actions/exec";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { collectConversionDiagnostics } from "../conversion";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

vi.mock("@actions/exec", () => ({ getExecOutput: vi.fn() }));
let root: string;
const id = "019e6b7a-6409-7748-a39a-5dcd3f5ec862";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "toolkit-conversion-"));
  vi.mocked(exec.getExecOutput).mockImplementation(async (_command, args) => {
    const output = args![args!.indexOf("--output") + 1]!;
    await fs.writeFile(path.join(output, "partial.yml"), "id: accounts");
    return {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        exitCode: 0,
        stdout: "",
        stderr:
          "Encountered 1 problem: 1 warning. Project descriptions were dropped.",
      }),
    };
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

test("discovers the config at the repository root from a nested directory", async () => {
  await promisify(execFileCallback)("git", ["init", "-q", root]);
  await fs.mkdir(path.join(root, "nested"));
  vi.spyOn(process, "cwd").mockReturnValue(path.join(root, "nested"));
  await fs.writeFile(
    path.join(root, "hex_context.config.yml"),
    `semanticProjects:\n  - id: ${id}\n    path: source.yaml\n    convert:\n      from: ossie\n`,
  );
  const results = await collectConversionDiagnostics("");
  expect(results).toHaveLength(1);
  expect(exec.getExecOutput).toHaveBeenCalledWith(
    "hex",
    expect.arrayContaining([path.join(await fs.realpath(root), "source.yaml")]),
    expect.any(Object),
  );
});

test.each(["ossie", "dbt"])(
  "collects %s diagnostics with the configured dialect and cleans up",
  async (from) => {
    const configPath = path.join(root, "hex_context.config.yaml");
    const original = `semanticProjects:\n  - id: ${id}\n    path: source.yaml\n    convert:\n      from: ${from}\n      dialect: snowflake\n  - id: ${id}\n    path: native\n`;
    await fs.writeFile(configPath, original);

    const results = await collectConversionDiagnostics(configPath);

    expect(exec.getExecOutput).toHaveBeenCalledTimes(1);
    const args = vi.mocked(exec.getExecOutput).mock.calls[0]![1]!;
    expect(args).toEqual(
      expect.arrayContaining([
        "--from",
        from,
        "--dialect",
        "snowflake",
        "--input",
        path.join(root, "source.yaml"),
        "--json",
        "-vv",
      ]),
    );
    expect(args).not.toContain("--yes");
    const output = args[args.indexOf("--output") + 1]!;
    await expect(fs.stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(results).toEqual([
      expect.objectContaining({
        from,
        path: "source.yaml",
        exitCode: 0,
        stderr: expect.stringContaining("1 warning"),
      }),
    ]);
    expect(await fs.readFile(configPath, "utf8")).toBe(original);
  },
);

test("retains nonzero conversion diagnostics", async () => {
  const configPath = path.join(root, "hex_context.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      semanticProjects: [{ id, path: "source.yaml", convert: { from: "dbt" } }],
    }),
  );
  vi.mocked(exec.getExecOutput).mockResolvedValue({
    exitCode: 1,
    stderr: "",
    stdout: JSON.stringify({
      exitCode: 1,
      stdout: "partial output",
      stderr: "31 errors: .arr is unresolved",
    }),
  });
  expect(await collectConversionDiagnostics(configPath)).toEqual([
    expect.objectContaining({
      exitCode: 1,
      stderr: "31 errors: .arr is unresolved",
    }),
  ]);
});

test("cleans up when the CLI returns a setup error", async () => {
  const configPath = path.join(root, "hex_context.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      semanticProjects: [
        { id, path: "source.yaml", convert: { from: "ossie" } },
      ],
    }),
  );
  vi.mocked(exec.getExecOutput).mockResolvedValue({
    exitCode: 1,
    stderr: "",
    stdout: JSON.stringify({ error: "Tooling unavailable" }),
  });
  await expect(collectConversionDiagnostics(configPath)).rejects.toThrow(
    "Tooling unavailable",
  );
  const args = vi.mocked(exec.getExecOutput).mock.calls[0]![1]!;
  await expect(
    fs.stat(args[args.indexOf("--output") + 1]!),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("does not run a converter for native-only configs", async () => {
  const configPath = path.join(root, "hex_context.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({ semanticProjects: [{ id, path: "native" }] }),
  );
  expect(await collectConversionDiagnostics(configPath)).toEqual([]);
  expect(exec.getExecOutput).not.toHaveBeenCalled();
});
