import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { ensureHexCli } from "./cli";
import { getExpectedEnvVars } from "./env";
import { getInputs } from "./inputs";
import { commentOnPullRequest } from "./actions/comment";
import { collectConversionDiagnostics } from "./conversion";
import {
  CliContextPreviewFailure,
  CliContextPreviewResult,
  CliSemanticProjectConversion,
} from "./types";

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

  let previewResult: CliContextPreviewResult;
  try {
    let previewStdout = "";
    const previewArgs = [
      "--profile",
      "ci",
      "context",
      "preview",
      "--json",
      "-vv",
    ];
    if (inputs.configFile) previewArgs.push("--config-path", inputs.configFile);
    const exitCode = await exec.exec("hex", previewArgs, {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          previewStdout += data.toString();
        },
      },
    });
    const output = JSON.parse(previewStdout) as
      | CliContextPreviewResult
      | CliContextPreviewFailure;
    if ("error" in output) throw new Error(output.error);
    if (exitCode !== 0)
      throw new Error(`Hex context preview failed (exit code ${exitCode}).`);
    if (!output.preview_id || !output.preview_link)
      throw new Error(
        `Unexpected output from hex context preview: ${previewStdout}`,
      );
    previewResult = output;
  } catch (error) {
    if (envVars.type === "pull_request" && inputs.commentOnPr) {
      try {
        await commentOnPullRequest({
          envVars,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (commentError) {
        core.warning(
          `Could not comment on the failed preview: ${commentError}`,
        );
      }
    }
    throw error;
  }
  const {
    preview_id: previewId,
    preview_link: previewLink,
    guides,
    semanticProjects,
    evalSuites,
  } = previewResult;
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
      let semanticProjectConversions: CliSemanticProjectConversion[] = [];
      let conversionDiagnosticsError: string | undefined;
      try {
        semanticProjectConversions = await collectConversionDiagnostics(
          inputs.configFile,
        );
      } catch (error) {
        conversionDiagnosticsError =
          error instanceof Error ? error.message : String(error);
        core.warning(
          `Could not collect conversion diagnostics: ${conversionDiagnosticsError}`,
        );
      }
      await commentOnPullRequest({
        envVars,
        previewId,
        previewLink,
        guides,
        semanticProjects,
        evalSuites,
        semanticProjectConversions,
        conversionDiagnosticsError,
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
