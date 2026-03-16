import { ExpectedEnvVars } from "./env";
import { HexClient } from "./hex-client";
import { Inputs } from "./inputs";

export type ParsedConfig = {
  inputs: Inputs;
  envVars: ExpectedEnvVars;
  hexClient: HexClient;
};

// TODO
export type GuidesActionResult = {};
