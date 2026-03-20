import * as core from "@actions/core";
import fs from "fs/promises";
import path from "path";
import { ParsedConfig } from "../types";
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

    await parsedConfig.hexClient.applyOperationToChangeset(contextVersionId, {
      operation: {
        type: "upsert_guide",
        files,
      },
    });
  }

  core.info(`Successfully staged ${matchingGuides.length} guides to Hex`);

  return {
    contextVersionId,
    orgId,
  };
};

const addPruneGuidesToChangeset = async (
  parsedConfig: ParsedConfig,
  contextVersionId: string,
  matchingGuides: GuideWithPointer[],
) => {
  const hexPathsToRemovedPaths = matchingGuides.reduce(
    (acc, guide) => {
      acc[guide.hexFilePath] = guide.originalFilePath;
      return acc;
    },
    {} as Record<string, string>,
  );
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
    return removedGuides.result.removedGuideFilePaths.map(
      (filePath) => hexPathsToRemovedPaths[filePath],
    );
  } else {
    return [];
  }
};

export const runGuidesAction = async (parsedConfig: ParsedConfig) => {
  const guidesResult = await getGuidesFromLocal(parsedConfig);

  if (guidesResult.missingGuides.length > 0) {
    const missingGuidesMessage = `The following guides were defined in config but were not found: ${guidesResult.missingGuides.join(", ")}`;
    if (parsedConfig.envVars.type === "pull_request") {
      core.setFailed(missingGuidesMessage);
      return;
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
    return;
  }

  if (parsedConfig.envVars.type === "pull_request") {
    core.info(
      `Found ${guidesResult.matchingGuides.length} guides to upload to Hex`,
    );
  } else {
    core.info(`Uploading ${guidesResult.matchingGuides.length} guides to Hex`);
  }
  const { contextVersionId, orgId } = await uploadGuidesViaChangeset(
    parsedConfig,
    guidesResult.matchingGuides,
  );

  if (parsedConfig.inputs.deleteUntrackedGuides) {
    core.info("Checking if there are any untracked guides");
    const removedGuides = await addPruneGuidesToChangeset(
      parsedConfig,
      contextVersionId,
      guidesResult.matchingGuides,
    );
    core.info(`Deleting ${removedGuides.length} untracked guides from Hex`);
    core.info(
      `Removing the following guides from Hex: ${removedGuides.map((guide) => guide).join(", ")}`,
    );
  } else {
    core.info(
      "Not deleting untracked guides. Set delete_untracked_guides to true to delete untracked guides",
    );
  }

  if (parsedConfig.envVars.type === "pull_request") {
    // This is a preview, we don't need to publish
    // TODO include a github comment here
    core.info(
      `Preview link: ${parsedConfig.hexClient.getPreviewLink(orgId, contextVersionId)}`,
    );
    return;
  } else {
    if (!parsedConfig.inputs.publishGuides) {
      core.info(
        "Not publishing guides automatically. Set publish_guides to true to publish guide changes",
      );
    }

    await parsedConfig.hexClient.publishChangeset(contextVersionId, {
      updateLatestVersion: parsedConfig.inputs.publishGuides,
    });
    core.info(`Successfully applied changes to Hex`);
  }
};
