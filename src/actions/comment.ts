import * as github from "@actions/github";
import * as core from "@actions/core";
import { GuideActionResult, ParsedConfig, UpsertedGuideResult } from "../types";

const HEX_COMMENT_IDENTIFIER = `<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->`;

const getOriginalFileLink = (
  parsedConfig: ParsedConfig,
  originalFilePath: string,
) => {
  return new URL(
    `${parsedConfig.envVars.owner}/${parsedConfig.envVars.repo}/blob/${parsedConfig.envVars.sha}/${originalFilePath}`,
    parsedConfig.envVars.baseUrl,
  ).toString();
};

const getTableHeaders = (showWarningColumn: boolean) => {
  return `| Guide | Status | ${showWarningColumn ? "Warnings | " : ""}
|-------|--------|${showWarningColumn ? "------|" : ""}`;
};

const replaceNewlinesWithBreaks = (text: string) => {
  return text.replace(/\n/g, "<br />");
};

const createUpsertGuideRow = (
  parsedConfig: ParsedConfig,
  guide: UpsertedGuideResult & { warnings: string[] },
  showWarningColumn: boolean,
) => {
  const guideColumn = `[${guide.originalFilePath}](${getOriginalFileLink(parsedConfig, guide.originalFilePath)})`;
  const statusColumn = guide.result === "created" ? "⬆️ Added" : "✏️ Modified";
  const warningsColumn =
    guide.warnings.length > 0
      ? `<details><summary>⚠️ Warnings (${guide.warnings.length})</summary><pre>${guide.warnings.map(replaceNewlinesWithBreaks).join("<br />")}</pre></details>`
      : "";

  return `| ${guideColumn} | ${statusColumn} | ${showWarningColumn ? `${warningsColumn} |` : ""}`;
};

const createDeletedGuideRow = (guide: string, showWarningColumn: boolean) => {
  return `| ~~\`${guide}\`~~ | ❌ Deleted |${showWarningColumn ? " |" : ""}`;
};

export const generateCommentBody = (
  parsedConfig: ParsedConfig,
  guideActionResult: GuideActionResult,
): string | null => {
  if (guideActionResult.type === "incomplete") {
    return null;
  } else if (
    guideActionResult.deletedGuides.length === 0 &&
    guideActionResult.upsertedGuides.length === 0
  ) {
    return null;
  }

  const warningsByOriginalFilePath = guideActionResult.warnings.reduce(
    (acc, warning) => {
      acc[warning.originalFilePath] = [
        ...(acc[warning.originalFilePath] || []),
        warning.message,
      ];
      return acc;
    },
    {} as Record<string, string[]>,
  );

  const numberOfAddedGuides = guideActionResult.upsertedGuides.filter(
    (guide) => guide.result === "created",
  ).length;
  const numberOfUpdatedGuides = guideActionResult.upsertedGuides.filter(
    (guide) => guide.result === "updated",
  ).length;
  const numberOfDeletedGuides = guideActionResult.deletedGuides.length;

  const upsertedGuidesWithWarnings = guideActionResult.upsertedGuides.map(
    (guide) => ({
      ...guide,
      warnings: warningsByOriginalFilePath[guide.originalFilePath] ?? [],
    }),
  );
  const hasAnyWarnings = upsertedGuidesWithWarnings.some(
    (guide) => guide.warnings.length > 0,
  );
  const markdownRows = [
    ...upsertedGuidesWithWarnings.map((guide) =>
      createUpsertGuideRow(parsedConfig, guide, hasAnyWarnings),
    ),
    ...guideActionResult.deletedGuides.map((guide) =>
      createDeletedGuideRow(guide, hasAnyWarnings),
    ),
  ];

  const markdownTable = `
${getTableHeaders(hasAnyWarnings)}
${markdownRows.join("\n")}`;

  const summary: string[] = [];
  if (numberOfAddedGuides > 0) {
    summary.push(
      `${numberOfAddedGuides === 1 ? "1 guide" : `${numberOfAddedGuides} guides`} added`,
    );
  }
  if (numberOfUpdatedGuides > 0) {
    summary.push(
      `${numberOfUpdatedGuides === 1 ? "1 guide" : `${numberOfUpdatedGuides} guides`} updated`,
    );
  }
  if (numberOfDeletedGuides > 0) {
    summary.push(
      `${numberOfDeletedGuides === 1 ? "1 guide" : `${numberOfDeletedGuides} guides`} deleted`,
    );
  }

  return `${HEX_COMMENT_IDENTIFIER}
🟢 Success - ${summary.join(", ")}. [Test changes in Hex](${parsedConfig.hexClient.getPreviewLink(guideActionResult.orgId, guideActionResult.contextVersionId)}).

${markdownTable}

`;
};

export const commentOnPullRequest = async (
  parsedConfig: ParsedConfig,
  guideActionResult: GuideActionResult,
) => {
  const { commentOnPr } = parsedConfig.inputs;
  if (!commentOnPr || parsedConfig.envVars.type !== "pull_request") {
    return;
  }
  if (!parsedConfig.envVars.token) {
    throw new Error(
      "GITHUB_TOKEN is not set, cannot comment on pull_requests. Please ensure the GITHUB_TOKEN environment variable is set.",
    );
  } else if (!parsedConfig.envVars.pullRequestNumber) {
    throw new Error(
      "Could not detect pull request number, cannot create comment on this pull request.",
    );
  }

  const body = generateCommentBody(parsedConfig, guideActionResult);

  if (!body) {
    core.info("No guide related changes, skipping comment");
    return;
  }

  const { owner, repo } = parsedConfig.envVars;

  const octokit = github.getOctokit(parsedConfig.envVars.token);
  let existingCommentId: number | undefined = undefined;

  for await (const { data: comments } of octokit.paginate.iterator(
    octokit.rest.issues.listComments,
    {
      owner,
      repo,
      issue_number: parsedConfig.envVars.pullRequestNumber,
      per_page: 100,
    },
  )) {
    const maybeHexComment = comments.find((comment) =>
      comment.body?.includes(HEX_COMMENT_IDENTIFIER),
    );
    if (maybeHexComment) {
      existingCommentId = maybeHexComment.id;
      break;
    }
  }

  if (existingCommentId) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      issue_number: parsedConfig.envVars.pullRequestNumber,
      comment_id: existingCommentId,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: parsedConfig.envVars.pullRequestNumber,
      body,
    });
  }
};
