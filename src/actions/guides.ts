import * as core from "@actions/core";
import fs from "fs/promises";
import path from "path";
import {
  GuideActionResult,
  NoopGuideResult,
  ParsedConfig,
  UpsertedGuideResult,
  WarningGuideResult,
} from "../types";
import { getFilesInDir } from "../fileUtils";
import picomatch from "picomatch";
import { TransformSchema } from "../configSchema";
import { chunk } from "../utils";

type GuideWithPointer = {
  originalFilePath: string;
  hexFilePath: string;
};

type GuideFromLocalResult = {
  matchingGuides: GuideWithPointer[];
  missingGuides: string[];
};

const getMapForHexFilePathToOriginalFilePath = (
  matchingGuides: GuideWithPointer[],
) => {
  return matchingGuides.reduce(
    (acc, guide) => {
      acc[guide.hexFilePath] = guide.originalFilePath;
      return acc;
    },
    {} as Record<string, string>,
  );
};

export const getGuidesFromLocal = async (parsedConfig: {
  inputs: Pick<ParsedConfig["inputs"], "guides">;
}): Promise<GuideFromLocalResult> => {
  const guideMap: Map<string, { path: string; hexFilePath: string }> =
    new Map();
  const patternMap: Map<string, { transform?: TransformSchema }> = new Map();
  for (const guide of parsedConfig.inputs.guides) {
    if ("path" in guide) {
      const normalizedPath = path.normalize(guide.path);
      guideMap.set(normalizedPath, {
        path: normalizedPath,
        hexFilePath: guide.hexFilePath || normalizedPath,
      });
    } else if (guide.pattern) {
      patternMap.set(guide.pattern, {
        transform: guide.transform,
      });
    }
  }
  const guidesPathText = Array.from(guideMap.keys()).join(", ");
  const guidesPatternText = Array.from(patternMap.keys()).join(", ");
  core.info(
    `Looking for guides: ${guidesPathText ? `paths: ${guidesPathText}` : ""} ${guidesPatternText ? `patterns: ${guidesPatternText}` : ""}`,
  );

  const matchingGuides: GuideWithPointer[] = [];
  for await (const filePath of getFilesInDir(process.cwd())) {
    core.debug(`Checking if file ${filePath} matches any patterns`);
    const maybeGuideFromPath = guideMap.get(filePath);
    if (maybeGuideFromPath) {
      core.info(
        `Found guide at ${filePath}, using hex file path ${maybeGuideFromPath.hexFilePath}`,
      );
      matchingGuides.push({
        originalFilePath: filePath,
        hexFilePath: maybeGuideFromPath.hexFilePath,
      });
    } else {
      for (const [pattern, { transform }] of patternMap.entries()) {
        // This should match https://github.com/micromatch/picomatch, and have a rust equivalent https://docs.rs/satch/latest/satch/
        if (picomatch.isMatch(filePath, pattern)) {
          let hexFilePath = filePath;
          if (transform?.stripFolders) {
            hexFilePath = path.basename(filePath);
          }
          core.info(
            `Found guide at ${filePath}, using hex file path ${hexFilePath}`,
          );
          matchingGuides.push({
            originalFilePath: filePath,
            hexFilePath,
          });
          break;
        }
      }
    }
  }

  const foundGuides = new Set(
    matchingGuides.map((guide) => guide.originalFilePath),
  );
  const missingGuides = [...guideMap.keys()].filter(
    (guide) => !foundGuides.has(guide),
  );

  return {
    matchingGuides,
    missingGuides,
  };
};

const uploadGuidesViaChangeset = async (
  parsedConfig: ParsedConfig,
  matchingGuides: GuideWithPointer[],
) => {
  const { contextVersionId, orgId } =
    await parsedConfig.hexClient.createChangeset({
      externalSource: {
        source: "github",
        base: parsedConfig.envVars.baseUrl,
        owner: parsedConfig.envVars.owner,
        repo: parsedConfig.envVars.repo,
        commitHash: parsedConfig.envVars.sha,
        branch: parsedConfig.envVars.branch,
      },
    });
  core.info(
    `Guides: ${matchingGuides.map((guide) => (guide.hexFilePath === guide.originalFilePath ? `${guide.originalFilePath}` : `${guide.originalFilePath} (hex path: ${guide.hexFilePath})`)).join(", ")}`,
  );

  const chunkedFiles = chunk(matchingGuides, 20);

  const upsertedGuides: UpsertedGuideResult[] = [];
  const noops: NoopGuideResult[] = [];
  const warnings: WarningGuideResult[] = [];
  for (const chunk of chunkedFiles) {
    const files = await Promise.all(
      chunk.map(async (guide) => ({
        filePath: guide.hexFilePath,
        contents: await fs.readFile(guide.originalFilePath, "utf8"),
        externalSource: {
          source: "github" as const,
          base: parsedConfig.envVars.baseUrl,
          owner: parsedConfig.envVars.owner,
          repo: parsedConfig.envVars.repo,
          commitHash: parsedConfig.envVars.sha,
          branch: parsedConfig.envVars.branch,
          path: guide.originalFilePath,
        },
      })),
    );

    const result = await parsedConfig.hexClient.applyOperationToChangeset(
      contextVersionId,
      {
        operation: {
          type: "upsert_guide",
          files,
        },
      },
    );
    if (result.result.type === "upsert_guide") {
      const hexPathsToOriginalFilePaths =
        getMapForHexFilePathToOriginalFilePath(matchingGuides);
      upsertedGuides.push(
        ...result.result.files.map((f) => ({
          originalFilePath:
            hexPathsToOriginalFilePaths[f.filePath] ?? f.filePath,
          hexFilePath: f.filePath,
          result: f.result,
          id: f.id,
        })),
      );
      noops.push(
        ...result.result.noops.map((f) => ({
          originalFilePath:
            hexPathsToOriginalFilePaths[f.filePath] ?? f.filePath,
          hexFilePath: f.filePath,
        })),
      );
      warnings.push(
        ...result.result.warnings.map((f) => ({
          originalFilePath:
            hexPathsToOriginalFilePaths[f.filePath] ?? f.filePath,
          hexFilePath: f.filePath,
          message: f.message,
        })),
      );
    }
  }

  if (warnings.length > 0) {
    core.warning(`There were warnings in uploading some of your guides`);
    for (const warning of warnings) {
      core.warning(
        `${warning.originalFilePath}: ${warning.message.replace(/\n/g, "")}`,
      );
    }
  }
  if (upsertedGuides.length > 0) {
    core.info(
      `Successfully updated ${upsertedGuides.length} guides in Hex: ${upsertedGuides.map((guide) => guide.originalFilePath).join(", ")}. ${noops.length} guides had no changes.`,
    );
  } else {
    core.info(`No guides had any changes.`);
  }

  return {
    contextVersionId,
    orgId,
    upsertedGuides,
    noops,
    warnings,
  };
};

const addPruneGuidesToChangeset = async (
  parsedConfig: ParsedConfig,
  contextVersionId: string,
  matchingGuides: GuideWithPointer[],
): Promise<string[]> => {
  const removedGuides = await parsedConfig.hexClient.applyOperationToChangeset(
    contextVersionId,
    {
      operation: {
        type: "prune_guides",
        guideFilePaths: matchingGuides.map((guide) => guide.hexFilePath),
        externalSource: {
          source: "github",
          base: parsedConfig.envVars.baseUrl,
          owner: parsedConfig.envVars.owner,
          repo: parsedConfig.envVars.repo,
        },
      },
    },
  );
  if (removedGuides.result.type === "prune_guides") {
    return removedGuides.result.removedGuides.map(
      (guide) => guide?.externalSource?.path ?? guide.hexFilePath,
    );
  } else {
    return [];
  }
};

export const runGuidesAction = async (
  parsedConfig: ParsedConfig,
): Promise<GuideActionResult> => {
  const guidesResult = await getGuidesFromLocal(parsedConfig);

  if (guidesResult.missingGuides.length > 0) {
    const missingGuidesMessage = `The following guides were defined in config but were not found: ${guidesResult.missingGuides.join(", ")}`;
    if (parsedConfig.envVars.type === "pull_request") {
      core.setFailed(missingGuidesMessage);
      return {
        type: "incomplete",
      };
    } else {
      core.warning(missingGuidesMessage);
      if (guidesResult.matchingGuides.length > 0) {
        core.info(
          "Continuing with guide upload, but some guides may be missing",
        );
      }
    }
  }

  if (guidesResult.matchingGuides.length === 0) {
    core.info("No guides found");
    return {
      type: "incomplete",
    };
  }

  if (parsedConfig.envVars.type === "pull_request") {
    core.info(
      `Found ${guidesResult.matchingGuides.length} guides to upload to Hex`,
    );
  } else {
    core.info(`Uploading ${guidesResult.matchingGuides.length} guides to Hex`);
  }
  const { contextVersionId, orgId, upsertedGuides, noops, warnings } =
    await uploadGuidesViaChangeset(parsedConfig, guidesResult.matchingGuides);
  let deletedGuides: string[] = [];

  if (parsedConfig.inputs.deleteUntrackedGuides) {
    core.info("Checking if there are any untracked guides");
    const removedGuides = await addPruneGuidesToChangeset(
      parsedConfig,
      contextVersionId,
      guidesResult.matchingGuides,
    );
    deletedGuides = removedGuides;
    core.info(
      `Removing the following ${removedGuides.length} guides from Hex: ${removedGuides.map((guide) => guide).join(", ")}`,
    );
  } else {
    core.info(
      "Not deleting untracked guides. Set delete_untracked_guides to true to delete untracked guides",
    );
  }

  if (parsedConfig.envVars.type === "push") {
    if (!parsedConfig.inputs.publishGuides) {
      core.info(
        "Not publishing guides automatically. Set publish_guides to true to publish guide changes",
      );
    } else {
      await parsedConfig.hexClient.publishChangeset(contextVersionId, {
        updateLatestVersion: parsedConfig.inputs.publishGuides,
      });
      core.info(`Successfully applied changes to Hex`);
    }
  } else {
    core.info(
      `Preview changes in Hex: ${parsedConfig.hexClient.getPreviewLink(orgId, contextVersionId)}`,
    );
  }
  return {
    type: "complete",
    orgId,
    contextVersionId,
    upsertedGuides,
    noops,
    warnings,
    deletedGuides,
  };
};
