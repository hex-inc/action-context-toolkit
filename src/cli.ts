import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HEX_CLI_INSTALLER_URL = "https://hex.tech/install.sh";

export async function ensureHexCli() {
  const { exitCode } = await exec.getExecOutput(
    "sh",
    ["-c", "command -v hex >/dev/null 2>&1"],
    {
      ignoreReturnCode: true,
      silent: true,
    },
  );

  if (exitCode === 0) {
    core.info("Hex CLI is already installed; skipping installation.");
    return;
  }

  const temporaryDirectory = process.env.RUNNER_TEMP ?? tmpdir();
  const installerPath = join(
    temporaryDirectory,
    `hex-installer-${process.pid}.sh`,
  );
  const installDirectory = join(temporaryDirectory, "hex-cli");

  core.info("Hex CLI was not found; installing it now.");

  try {
    await exec.exec("curl", [
      "--proto",
      "=https",
      "--tlsv1.2",
      "-fsSL",
      HEX_CLI_INSTALLER_URL,
      "-o",
      installerPath,
    ]);

    process.env.HEX_INSTALL_DIR = installDirectory;
    process.env.HEX_NO_MODIFY_PATH = "1";
    process.env.HEX_DISABLE_UPDATE = "1";
    await exec.exec("sh", [installerPath]);
  } finally {
    await rm(installerPath, { force: true });
  }

  core.addPath(installDirectory);
}
