import * as github from "@actions/github";
import * as core from "@actions/core";
import { ExpectedEnvVars } from "../env";
import { CliGuideResult, CliSemanticModelResult } from "../types";

const HEX_COMMENT_IDENTIFIER = `<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->`;

const getOriginalFileLink = (
  envVars: ExpectedEnvVars,
  originalFilePath: string,
) => {
  return new URL(
    `${envVars.owner}/${envVars.repo}/blob/${envVars.sha}/${originalFilePath}`,
    envVars.baseUrl,
  ).toString();
};

const getTableHeaders = (showWarningColumn: boolean) => {
  return `| Guide | Status | ${showWarningColumn ? "Warnings | " : ""}
|-------|--------|${showWarningColumn ? "------|" : ""}`;
};

const getSemanticModelsTableHeaders = () =>
  `| Semantic model | Directory | Status |
|----------------|-----------|--------|`;

const replaceNewlinesWithBreaks = (text: string) =>
  text.replace(/\n/g, "<br />");

export const generateCommentBody = (
  envVars: ExpectedEnvVars,
  previewLink: string,
  guides?: CliGuideResult,
  semanticModels?: CliSemanticModelResult[],
): string => {
  const upserted = guides?.upserted ?? [];
  const removed = guides?.removed ?? [];

  const numberOfAdded = upserted.filter((g) => g.result === "created").length;
  const numberOfUpdated = upserted.filter((g) => g.result === "updated").length;
  const numberOfDeleted = removed.length;

  const summary: string[] = [];
  if (numberOfAdded > 0)
    summary.push(
      `${numberOfAdded === 1 ? "1 guide" : `${numberOfAdded} guides`} added`,
    );
  if (numberOfUpdated > 0)
    summary.push(
      `${numberOfUpdated === 1 ? "1 guide" : `${numberOfUpdated} guides`} updated`,
    );
  if (numberOfDeleted > 0)
    summary.push(
      `${numberOfDeleted === 1 ? "1 guide" : `${numberOfDeleted} guides`} deleted`,
    );

  const hasAnyWarnings = upserted.some((g) => (g.warnings?.length ?? 0) > 0);

  const rows: string[] = [
    ...upserted.map((guide) => {
      const guideColumn = `[${guide.originalFilePath}](${getOriginalFileLink(envVars, guide.originalFilePath)})`;
      const statusColumn =
        guide.result === "created" ? "⬆️ Added" : "✏️ Modified";
      const warningsColumn = hasAnyWarnings
        ? guide.warnings && guide.warnings.length > 0
          ? `<details><summary>⚠️ Warnings (${guide.warnings.length})</summary><pre>${guide.warnings.map(replaceNewlinesWithBreaks).join("<br />")}</pre></details>`
          : ""
        : "";
      return `| ${guideColumn} | ${statusColumn} | ${hasAnyWarnings ? `${warningsColumn} |` : ""}`;
    }),
    ...removed.map(
      (filePath) =>
        `| ~~\`${filePath}\`~~ | ❌ Deleted |${hasAnyWarnings ? " |" : ""}`,
    ),
  ];

  const hasChanges = upserted.length > 0 || removed.length > 0;
  const summaryLine =
    summary.length > 0
      ? `🟢 Success - ${summary.join(", ")}. [Test changes in Hex](${previewLink}).`
      : `🟢 Context preview created. [Test changes in Hex](${previewLink}).`;

  // Two \n before the table header restores the double blank line from the original format.
  const guidesSection = hasChanges
    ? `\n\n${getTableHeaders(hasAnyWarnings)}\n${rows.join("\n")}\n`
    : "";

  const semanticModelsSection =
    semanticModels && semanticModels.length > 0
      ? `\n**Semantic models**\n\n${getSemanticModelsTableHeaders()}\n${semanticModels
          .map((sm) => {
            const problemCount = sm.result.details.problems?.length ?? 0;
            const warningCount = sm.result.details.warnings?.length ?? 0;
            const status =
              problemCount > 0
                ? `⚠️ ${problemCount} ${problemCount === 1 ? "problem" : "problems"}`
                : warningCount > 0
                  ? `⚠️ ${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`
                  : "✅ OK";
            return `| ${sm.result.semanticProject.name} | ${sm.dirPath} | ${status} |`;
          })
          .join("\n")}\n`
      : "";

  return `${HEX_COMMENT_IDENTIFIER}
${summaryLine}
${guidesSection}${semanticModelsSection}`;
};

export const commentOnPullRequest = async (
  envVars: ExpectedEnvVars & { type: "pull_request" },
  previewLink: string,
  guides?: CliGuideResult,
  semanticModels?: CliSemanticModelResult[],
) => {
  if (!envVars.token) {
    throw new Error(
      "GITHUB_TOKEN is not set, cannot comment on pull requests. Please ensure the GITHUB_TOKEN environment variable is set.",
    );
  }
  if (!envVars.pullRequestNumber) {
    throw new Error(
      "Could not detect pull request number, cannot create comment on this pull request.",
    );
  }

  const body = generateCommentBody(
    envVars,
    previewLink,
    guides,
    semanticModels,
  );
  const { owner, repo } = envVars;
  const octokit = github.getOctokit(envVars.token);

  let existingCommentId: number | undefined = undefined;

  for await (const { data: comments } of octokit.paginate.iterator(
    octokit.rest.issues.listComments,
    {
      owner,
      repo,
      issue_number: envVars.pullRequestNumber,
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
      issue_number: envVars.pullRequestNumber,
      comment_id: existingCommentId,
      body,
    });
    core.info("Updated existing Hex context preview comment on pull request.");
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: envVars.pullRequestNumber,
      body,
    });
    core.info("Created Hex context preview comment on pull request.");
  }
};
