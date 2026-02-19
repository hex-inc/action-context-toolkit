import * as core from "@actions/core";
import { getExpectedEnvVars } from "./env";
import { getInputs } from "./inputs";
import { HexClient } from "./hex-client";
import { runGuidesAction } from "./actions/guides";

async function run() {
  const envVars = getExpectedEnvVars();
  const inputs = await getInputs();
  const hexClient = new HexClient(inputs.hexUrl, inputs.hexToken);
  await runGuidesAction({
    inputs,
    envVars,
    hexClient,
  });

  core.info("Finished running hex context toolkit");
}

void run();
