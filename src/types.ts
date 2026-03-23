import { ExpectedEnvVars } from "./env";
import { HexClient } from "./hex-client";
import { Inputs } from "./inputs";

export type ParsedConfig = {
  inputs: Inputs;
  envVars: ExpectedEnvVars;
  hexClient: HexClient;
};

export type GuideActionResult =
  | {
      type: "incomplete";
    }
  | {
      type: "complete";
      orgId: string;
      upsertedGuides: { filePath: string; id: string }[];
      noops: { filePath: string }[];
      warnings: { filePath: string; message: string }[];
      deletedGuides: string[];
    };
