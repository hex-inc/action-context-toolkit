import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { ensureHexCli } from "./cli";
import { getExpectedEnvVars } from "./env";
import { getInputs } from "./inputs";
import { commentOnPullRequest } from "./actions/comment";
import { CliContextPreviewFailure, CliContextPreviewResult } from "./types";

const HEX_CLI_LOGIN_TOKEN_ENV = "HEX_CLI_LOGIN_TOKEN";

async function run() {
  const inputs = await getInputs();
  const envVars = getExpectedEnvVars();

  await ensureHexCli();

  process.env[HEX_CLI_LOGIN_TOKEN_ENV] = inputs.hexToken;

  await exec.exec("hex", [
    "auth",
    "login",
    "ci",
    "--hostname",
    inputs.hexUrl,
    "--token-from-env",
    "--update",
  ]);

  // Run hex context preview and capture JSON output.
  let previewStdout = "";
  const previewArgs = [
    "--profile",
    "ci",
    "context",
    "preview",
    "--json",
    "-vv",
  ];
  if (inputs.configFile) {
    previewArgs.push("--config-path", inputs.configFile);
  }

  const exitCode = await exec.exec("hex", previewArgs, {
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        previewStdout += data.toString();
      },
    },
  });

  let previewResult: CliContextPreviewResult | CliContextPreviewFailure;
  try {
    previewResult = JSON.parse(previewStdout);
  } catch {
    // The CLI prints JSON even when it fails, so missing JSON means it crashed.
    throw new Error(
      exitCode === 0
        ? `Unexpected output from hex context preview: ${previewStdout}`
        : `Hex context preview failed (exit code ${exitCode}).`,
    );
  }
  if ("error" in previewResult || exitCode !== 0) {
    const error =
      "error" in previewResult
        ? previewResult.error
        : `Hex context preview failed (exit code ${exitCode}).`;
    if (envVars.type === "pull_request" && inputs.commentOnPr) {
      try {
        await commentOnPullRequest({
          envVars,
          error,
          semanticProjectConversions: previewResult.semanticProjectConversions,
        });
      } catch (commentError) {
        core.warning(
          `Could not comment on the failed preview: ${commentError}`,
        );
      }
    }
    throw new Error(error);
  }
  const {
    preview_id: previewId,
    preview_link: previewLink,
    guides,
    semanticProjects,
    evalSuites,
    semanticProjectConversions,
  } = previewResult;

  if (!previewId || !previewLink) {
    throw new Error(
      `Unexpected output from hex context preview: ${previewStdout}`,
    );
  }
  core.setOutput("preview_id", previewId);
  core.setOutput("preview_link", previewLink);

  if (envVars.type === "push") {
    await exec.exec("hex", [
      "--profile",
      "ci",
      "context",
      "publish",
      previewId,
    ]);
  } else if (envVars.type === "pull_request") {
    core.info(`Context preview created. Preview link: ${previewLink}`);
    if (inputs.commentOnPr) {
      await commentOnPullRequest({
        envVars,
        previewId,
        previewLink,
        guides,
        semanticProjects,
        evalSuites,
        semanticProjectConversions,
      });
    } else {
      core.info(
        `ℹ️ Configure comment_on_pr: true to leave a preview link comment on your pull request.`,
      );
    }
  }
}

void run()
  .then(() => {
    core.info("Finished running hex context toolkit");
  })
  .catch((e) => {
    core.setFailed(e);
  });
