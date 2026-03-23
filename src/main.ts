import * as core from "@actions/core";
import { getExpectedEnvVars } from "./env";
import { getInputs } from "./inputs";
import { HexClient } from "./hex-client";
import { runGuidesAction } from "./actions/guides";
import { commentOnPullRequest } from "./actions/comment";

async function run() {
  const envVars = getExpectedEnvVars();
  const inputs = await getInputs();
  const hexClient = new HexClient(inputs.hexUrl, inputs.hexToken);
  const parsedConfig = {
    inputs,
    envVars,
    hexClient,
  };
  const guideResults = await runGuidesAction(parsedConfig);

  if (parsedConfig.inputs.commentOnPr) {
    await commentOnPullRequest(parsedConfig, guideResults);
  } else {
    core.info(
      `ℹ️ Configure your GitHub action to leave a comment on your pull request which will include a summary of the any guide changes, as well as a preview of changes.
Learn how to configure from our docs https://learn.hex.tech/docs/agent-management/context-management/guides#add-github-action`,
    );
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
