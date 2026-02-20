import * as core from "@actions/core";
import fs from "fs/promises";
import path from "path";
import { ParsedConfig } from "../types";
import { getFilesInDir } from "../fileUtils";
import picomatch from "picomatch";
import { TransformSchema } from "../configSchema";

type LoadedGuide = {
  path: string;
  hexFilePath: string;
  content: string;
};

export const getGuidesFromLocal = async (parsedConfig: {
  inputs: Pick<ParsedConfig["inputs"], "guides">;
}): Promise<LoadedGuide[]> => {
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

  const loadedGuides: LoadedGuide[] = [];
  for await (const filePath of getFilesInDir(process.cwd())) {
    core.debug(`Checking if file ${filePath} matches any patterns`);
    const content = await fs.readFile(filePath, "utf8");
    const maybeGuideFromPath = guideMap.get(filePath);
    if (maybeGuideFromPath) {
      core.info(
        `Found guide at ${filePath}, using hex file path ${maybeGuideFromPath.hexFilePath}`,
      );
      loadedGuides.push({
        path: filePath,
        hexFilePath: maybeGuideFromPath.hexFilePath,
        content,
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
          loadedGuides.push({
            path: filePath,
            hexFilePath,
            content,
          });
          break;
        }
      }
    }
  }
  return loadedGuides;
};

export const uploadAndMaybePublishGuides = async (
  parsedConfig: ParsedConfig,
  loadedGuides: LoadedGuide[],
) => {
  core.info(`Uploading ${loadedGuides.length} guides to Hex as draft guides`);
  core.info(
    `Guides: ${loadedGuides.map((guide) => (guide.hexFilePath === guide.path ? `${guide.path}` : `${guide.path} (hex path: ${guide.hexFilePath})`)).join(", ")}`,
  );
  const files = loadedGuides.map((guide) => ({
    filePath: guide.path,
    contents: guide.content,
    externalSource: {
      source: "github" as const,
      base: parsedConfig.envVars.baseUrl,
      owner: parsedConfig.envVars.owner,
      repo: parsedConfig.envVars.repo,
      commitHash: parsedConfig.envVars.sha,
      branch: parsedConfig.envVars.branch,
      path: guide.hexFilePath,
    },
  }));
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

  if (parsedConfig.inputs.publishGuides) {
    core.info("Publishing guides");
    await parsedConfig.hexClient.publishDraftGuides({
      orgGuideFileIds: upsertedGuides.files.map((guide) => guide.id),
    });
    core.info("Successfully published guides");
  } else {
    core.info(
      "Not publishing guides automatically. Set publish_guides to true to publish guides",
    );
  }
};

export const deleteUntrackedGuides = async (
  parsedConfig: ParsedConfig,
  loadedGuides: LoadedGuide[],
) => {
  const draftGuides = await parsedConfig.hexClient.getDraftGuides({
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

  const untrackedGuides = draftGuides.files.filter(
    (guide) => !loadedGuideHexFilePaths.has(guide.filePath),
  );
  if (untrackedGuides.length > 0) {
    core.info(`Deleting ${untrackedGuides.length} untracked guides from Hex`);
    core.info(
      `Removing the following guides from Hex: ${untrackedGuides.map((guide) => guide.filePath).join(", ")}`,
    );
    const results = await Promise.allSettled(
      untrackedGuides.map((guide) =>
        parsedConfig.hexClient.deleteGuide(guide.id),
      ),
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
  } else {
    core.info("No untracked guides found");
  }
};

export const runGuidesAction = async (parsedConfig: ParsedConfig) => {
  const loadedGuides = await getGuidesFromLocal(parsedConfig);
  if (loadedGuides.length === 0) {
    core.info("No guides found");
    return;
  }
  await uploadAndMaybePublishGuides(parsedConfig, loadedGuides);

  if (parsedConfig.inputs.deleteUntrackedGuides) {
    await deleteUntrackedGuides(parsedConfig, loadedGuides);
  }
};
