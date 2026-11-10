import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { ensureHexCli } from "./cli";
import { ExpectedEnvVars, getExpectedEnvVars } from "./env";
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
  const previewArgs = ["--profile", "ci", "context", "preview", "--json"];
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
    if (exitCode === 0) {
      throw new Error(
        `Unexpected output from hex context preview: ${previewStdout}`,
      );
    } else {
      throw new Error(`Hex context preview failed (exit code ${exitCode}).`);
    }
  }
  if ("error" in previewResult) {
    return failPreview({
      error: previewResult.error,
      envVars,
      commentOnPr: inputs.commentOnPr,
    });
  }
  if (exitCode !== 0) {
    return failPreview({
      error: `Hex context preview failed (exit code ${exitCode}).`,
      envVars,
      commentOnPr: inputs.commentOnPr,
    });
  }
  const {
    preview_id: previewId,
    preview_link: previewLink,
    guides,
    semanticProjects,
    evalSuites,
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
      });
    } else {
      core.info(
        `ℹ️ Configure comment_on_pr: true to leave a preview link comment on your pull request.`,
      );
    }
  }
}

async function failPreview(params: {
  error: string;
  envVars: ExpectedEnvVars;
  commentOnPr: boolean;
}): Promise<never> {
  const { error, envVars, commentOnPr } = params;
  if (envVars.type === "pull_request" && commentOnPr) {
    try {
      await commentOnPullRequest({ envVars, error });
    } catch (commentError) {
      core.warning(`Could not comment on the failed preview: ${commentError}`);
    }
  }
  throw new Error(error);
}

void run()
  .then(() => {
    core.info("Finished running hex context toolkit");
  })
  .catch((e) => {
    // `setFailed` sets exit code 1 and lets Node flush logs before exiting.
    core.setFailed(e);
  });
