import * as core from "@actions/core";
import fs from "fs/promises";
import path from "path";
import { ParsedConfig } from "../types";
import { getFilesInDir } from "../fileUtils";
import picomatch from "picomatch";
import { TransformSchema } from "../configSchema";

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

export const uploadGuides = async (
  parsedConfig: ParsedConfig,
  matchingGuides: GuideWithPointer[],
): Promise<{ guideFileIds: string[] }> => {
  core.info(`Uploading ${matchingGuides.length} guides to Hex as draft guides`);
  core.info(
    `Guides: ${matchingGuides.map((guide) => (guide.hexFilePath === guide.originalFilePath ? `${guide.originalFilePath}` : `${guide.originalFilePath} (hex path: ${guide.hexFilePath})`)).join(", ")}`,
  );
  const files = await Promise.all(
    matchingGuides.map(async (guide) => ({
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
  if (core.isDebug()) {
    core.debug(
      `Files with configuration: ${JSON.stringify(files.map((file) => ({ filePath: file.filePath, externalSource: file.externalSource })))}`,
    );
  }

  // We may need to batch this call in the future
  const upsertedGuides = await parsedConfig.hexClient.upsertDraftGuides({
    files,
  });
  core.info(
    `Successfully uploaded ${upsertedGuides.files.length} guides to Hex as draft guides`,
  );

  return {
    guideFileIds: upsertedGuides.files.map((guide) => guide.id),
  };
};

export const publishGuides = async (
  parsedConfig: ParsedConfig,
  guideFileIds: string[],
) => {
  core.info("Publishing guides");

  await parsedConfig.hexClient.publishDraftGuides({
    orgGuideFileIds: guideFileIds,
  });
  core.info("Successfully published guides");
};

export const deleteUntrackedGuides = async (
  parsedConfig: ParsedConfig,
  loadedGuides: GuideWithPointer[],
): Promise<{ deletedGuideFileIds: string[] }> => {
  const draftGuides = await parsedConfig.hexClient.getAllDraftGuides({
    externalSource: {
      source: "github",
      base: parsedConfig.envVars.baseUrl,
      owner: parsedConfig.envVars.owner,
      repo: parsedConfig.envVars.repo,
    },
  });

  const loadedGuideHexFilePaths = new Set(
    loadedGuides.map((guide) => guide.hexFilePath),
  );

  const untrackedGuides = draftGuides.filter(
    (guide) => !loadedGuideHexFilePaths.has(guide.filePath),
  );
  if (untrackedGuides.length > 0) {
    core.info(`Deleting ${untrackedGuides.length} untracked guides from Hex`);
    core.info(
      `Removing the following guides from Hex: ${untrackedGuides.map((guide) => guide.filePath).join(", ")}`,
    );
    const results = await Promise.allSettled(
      untrackedGuides.map(async (guide) => {
        await parsedConfig.hexClient.deleteGuide(guide.id);

        return guide.id;
      }),
    );
    if (results.some((result) => result.status === "rejected")) {
      core.error(
        `Failed to delete the following guides: ${results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason)
          .join(", ")}`,
      );
    } else {
      core.info("Successfully deleted untracked guides");
    }
    return {
      deletedGuideFileIds: results
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((id) => id !== null),
    };
  } else {
    core.info("No untracked guides found");
    return { deletedGuideFileIds: [] };
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
      `Found ${guidesResult.matchingGuides.length} guides to upload to Hex as draft guides`,
    );
    core.info("Guide dry-run is not supported for pull requests yet, no-op");
    return;
  }

  const { guideFileIds } = await uploadGuides(
    parsedConfig,
    guidesResult.matchingGuides,
  );
  let deletedGuideFileIds: string[] = [];

  if (parsedConfig.inputs.deleteUntrackedGuides) {
    core.info("Checking if there are any untracked guides");
    const result = await deleteUntrackedGuides(
      parsedConfig,
      guidesResult.matchingGuides,
    );
    deletedGuideFileIds = result.deletedGuideFileIds;
  } else {
    core.info(
      "Not deleting untracked guides. Set delete_untracked_guides to true to delete untracked guides",
    );
  }

  if (parsedConfig.inputs.publishGuides) {
    await publishGuides(parsedConfig, [
      ...guideFileIds,
      ...deletedGuideFileIds,
    ]);
  } else {
    core.info(
      "Not publishing guides automatically. Set publish_guides to true to publish guide changes",
    );
  }
};
