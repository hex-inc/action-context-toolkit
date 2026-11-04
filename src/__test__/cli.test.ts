import { afterEach, expect, test, vi } from "vitest";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { rm } from "node:fs/promises";
import { ensureHexCli } from "../cli";

vi.mock("@actions/core", () => ({ info: vi.fn(), addPath: vi.fn() }));
vi.mock("@actions/exec", () => ({
  getExecOutput: vi.fn(),
  exec: vi.fn().mockResolvedValue(0),
}));
vi.mock("node:fs/promises", () => ({ rm: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

test("reuses the pinned CLI version", async () => {
  vi.mocked(exec.getExecOutput).mockResolvedValue({
    exitCode: 0,
    stdout: "hex 1.2026.08.20\n",
    stderr: "",
  });

  await ensureHexCli();

  expect(exec.exec).not.toHaveBeenCalled();
  expect(core.addPath).not.toHaveBeenCalled();
});

test.each(["missing", "outdated"])(
  "installs when the CLI is %s",
  async (state) => {
    vi.stubEnv("RUNNER_TEMP", "/tmp/toolkit-cli-test");
    vi.stubEnv("HEX_INSTALL_DIR", "");
    vi.stubEnv("HEX_NO_MODIFY_PATH", "");
    vi.stubEnv("HEX_DISABLE_UPDATE", "");
    if (state === "missing") {
      vi.mocked(exec.getExecOutput).mockRejectedValue(new Error("not found"));
    } else {
      vi.mocked(exec.getExecOutput).mockResolvedValue({
        exitCode: 0,
        stdout: "hex 1.2026.07.01\n",
        stderr: "",
      });
    }

    await ensureHexCli();

    expect(exec.exec).toHaveBeenCalledWith(
      "curl",
      expect.arrayContaining([
        "https://github.com/hex-inc/hex-cli/releases/download/v1.2026.08.20/hex-installer.sh",
      ]),
    );
    expect(exec.exec).toHaveBeenCalledWith("sh", [
      `/tmp/toolkit-cli-test/hex-installer-${process.pid}.sh`,
    ]);
    expect(rm).toHaveBeenCalledWith(
      `/tmp/toolkit-cli-test/hex-installer-${process.pid}.sh`,
      { force: true },
    );
    expect(core.addPath).toHaveBeenCalledWith("/tmp/toolkit-cli-test/hex-cli");
  },
);
