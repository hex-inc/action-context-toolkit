import * as core from "@actions/core";
import fs from "fs/promises";
import { z } from "zod";
import { guideSchema, configSchema } from "./configSchema";

const errors: { message: string; details?: unknown }[] = [];

export type Inputs = {
  guides: z.infer<typeof guideSchema>[];
  hexToken: string;
  hexUrl: string;
  publishGuides: boolean;
  deleteUntrackedGuides: boolean;
};

export const getInputs = async (): Promise<Inputs> => {
  const configFile = core.getInput("config_file");
  const hexToken = core.getInput("hex_token");
  const hexUrl = core.getInput("hex_url");
  const publishGuides = core.getBooleanInput("publish_guides");
  const deleteUntrackedGuides = core.getBooleanInput("delete_untracked_guides");

  if (!configFile.endsWith(".json")) {
    errors.push({
      message: `Expected a .json config file, got: ${configFile}`,
    });
  }

  try {
    new URL(hexUrl);
  } catch (error) {
    errors.push({
      message: `Invalid hex URL: ${hexUrl}, expected a valid URL (e.g. https://app.hex.tech)`,
      details: error,
    });
  }

  let guides: z.infer<typeof guideSchema>[] = [];
  let unparsedConfigFile: string | null = null;
  if (!configFile.endsWith(".json")) {
    errors.push({
      message: `Expected a .json config file, got: ${configFile}`,
    });
  } else {
    unparsedConfigFile = await fs
      .readFile(configFile, "utf8")
      .catch((error) => {
        errors.push({
          message: `Error reading config file at ${configFile}`,
          details: error,
        });
        return null;
      });
  }

  try {
    if (unparsedConfigFile) {
      const parsedJson = JSON.parse(unparsedConfigFile);
      const parsedConfig = configSchema.parse(parsedJson);

      guides = parsedConfig.guides || [];
    }
  } catch (error) {
    errors.push({
      message: `Error parsing config file: ${configFile}`,
      details: error,
    });
  }

  if (guides.length === 0) {
    errors.push({ message: `No guides found in config file: ${configFile}` });
  }

  if (errors.length > 0) {
    throw new Error(`Error with inputs: ${JSON.stringify(errors, null, 2)}`);
  }

  return {
    hexToken,
    hexUrl,
    guides,
    publishGuides,
    deleteUntrackedGuides,
  };
};
