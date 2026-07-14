import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HEX_CLI_RELEASES_URL = "https://github.com/hex-inc/hex-cli/releases";

async function getInstalledHexCliVersion() {
  const { exitCode } = await exec.getExecOutput(
    "sh",
    ["-c", "command -v hex >/dev/null 2>&1"],
    {
      ignoreReturnCode: true,
      silent: true,
    },
  );

  if (exitCode !== 0) {
    return null;
  }

  const versionOutput = await exec.getExecOutput("hex", ["--version"], {
    ignoreReturnCode: true,
    silent: true,
  });
  if (versionOutput.exitCode !== 0) {
    return null;
  }

  return versionOutput.stdout.trim().match(/^hex\s+(.+)$/)?.[1] ?? null;
}

export async function ensureHexCli(version: string) {
  const installedVersion = await getInstalledHexCliVersion();
  if (version !== "latest" && installedVersion === version) {
    core.info(
      `Hex CLI ${version} is already installed; skipping installation.`,
    );
    return;
  }

  const temporaryDirectory = process.env.RUNNER_TEMP ?? tmpdir();
  const installerPath = join(
    temporaryDirectory,
    `hex-installer-${process.pid}.sh`,
  );
  const installDirectory = join(temporaryDirectory, `hex-cli-${version}`);

  if (installedVersion) {
    core.info(
      `Hex CLI ${installedVersion} is installed, but ${version} is required; installing the required version.`,
    );
  } else {
    core.info(`Hex CLI was not found; installing version ${version}.`);
  }

  const installerUrl =
    version === "latest"
      ? `${HEX_CLI_RELEASES_URL}/latest/download/hex-installer.sh`
      : `${HEX_CLI_RELEASES_URL}/download/v${version}/hex-installer.sh`;

  try {
    await exec.exec("curl", [
      "--proto",
      "=https",
      "--tlsv1.2",
      "-fsSL",
      installerUrl,
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
