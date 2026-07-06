import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { getExpectedEnvVars } from "./env";
import { getInputs } from "./inputs";
import { commentOnPullRequest } from "./actions/comment";
import { CliPreviewResult } from "./types";

const HEX_CLI_LOGIN_TOKEN_ENV = "HEX_CLI_LOGIN_TOKEN";

async function run() {
  const inputs = await getInputs();
  const envVars = getExpectedEnvVars();

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

  // Run hex guide preview and capture JSON output.
  let previewStdout = "";
  await exec.exec(
    "hex",
    [
      "--profile",
      "ci",
      "guide",
      "preview",
      "--json",
      "--config-path",
      inputs.configFile,
    ],
    {
      listeners: {
        stdout: (data: Buffer) => {
          previewStdout += data.toString();
        },
      },
    },
  );

  const previewResult = JSON.parse(previewStdout) as CliPreviewResult;
  const { previewId, previewLink, upsertedGuides, removedGuides } =
    previewResult;

  if (!previewId || !previewLink) {
    throw new Error(
      `Unexpected output from hex guide preview: ${previewStdout}`,
    );
  }

  if (envVars.type === "push") {
    if (inputs.publish) {
      await exec.exec("hex", [
        "--profile",
        "ci",
        "guide",
        "publish",
        previewId,
      ]);
    } else {
      core.info(
        "Not publishing guides automatically. Set publish to true to publish on push.",
      );
    }
  } else if (envVars.type === "pull_request") {
    core.info(`Guide preview created. Preview link: ${previewLink}`);
    if (inputs.commentOnPr) {
      await commentOnPullRequest(
        envVars,
        previewLink,
        upsertedGuides,
        removedGuides,
      );
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
    process.exit(1);
  });
