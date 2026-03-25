import { ExpectedEnvVars } from "./env";
import { HexClient } from "./hex-client";
import { Inputs } from "./inputs";

export type ParsedConfig = {
  inputs: Inputs;
  envVars: ExpectedEnvVars;
  hexClient: HexClient;
};

export type UpsertedGuideResult = {
  originalFilePath: string;
  hexFilePath: string;
  id: string;
  result: "created" | "updated";
};

export type NoopGuideResult = {
  originalFilePath: string;
  hexFilePath: string;
};

export type WarningGuideResult = {
  originalFilePath: string;
  hexFilePath: string;
  message: string;
};

export type GuideActionResult =
  | {
      type: "incomplete";
    }
  | {
      type: "complete";
      orgId: string;
      contextVersionId: string;
      upsertedGuides: UpsertedGuideResult[];
      noops: NoopGuideResult[];
      warnings: WarningGuideResult[];
      deletedGuides: string[];
    };
