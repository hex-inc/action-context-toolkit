import * as github from "@actions/github";
import * as core from "@actions/core";
import { ExpectedEnvVars } from "../env";
import { CliGuideResult, CliSemanticProjectResult } from "../types";

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

const getSemanticProjectsTableHeaders = () =>
  `| Name | Directory | Status |
|------|-----------|--------|`;

const replaceNewlinesWithBreaks = (text: string) =>
  text.replace(/\n/g, "<br />");

export const generateCommentBody = (params: {
  envVars: ExpectedEnvVars;
  previewLink: string;
  guides: CliGuideResult[] | undefined;
  semanticProjects: CliSemanticProjectResult[] | undefined;
}) => {
  // envVars not used rn, but hoping to in the near future
  const { previewLink, guides, semanticProjects } = params;

  const numberOfAddedGuides =
    guides?.filter((g) => g.result === "created").length ?? 0;
  const numberOfUpdatedGuides =
    guides?.filter((g) => g.result === "updated").length ?? 0;
  const numberOfDeletedGuides =
    guides?.filter((g) => g.result === "deleted").length ?? 0;

  const summary: string[] = [];
  if (numberOfAddedGuides > 0)
    summary.push(`${maybePluralizePhrase(numberOfAddedGuides, "guide")} added`);
  if (numberOfUpdatedGuides > 0)
    summary.push(
      `${maybePluralizePhrase(numberOfUpdatedGuides, "guide")} updated`,
    );
  if (numberOfDeletedGuides > 0)
    summary.push(
      `${maybePluralizePhrase(numberOfDeletedGuides, "guide")} deleted`,
    );

  if (semanticProjects && semanticProjects.length > 0) {
    summary.push(
      `${maybePluralizePhrase(semanticProjects.length, "semantic project")}`,
    );
  }

  const summaryLine =
    summary.length > 0
      ? `🟢 Success - ${summary.join(", ")}. [Test changes in Hex](${previewLink}).`
      : `🟢 Context preview created. [Test changes in Hex](${previewLink}).`;

  // Two \n before the table header restores the double blank line from the original format.
  let guidesSection = "";
  if (guides && guides.length > 0) {
    const hasAnyWarnings = guides.some((g) => (g.warnings?.length ?? 0) > 0);
    const tableHeaders = getTableHeaders(hasAnyWarnings);
    const tableRows = guides.map((guide) =>
      generateGuideRow({
        result: guide,
        hasAnyWarnings,
      }),
    );
    guidesSection = `\n\n${tableHeaders}\n${tableRows.join("\n")}\n`;
  }

  let semanticProjectsSection = "";
  if (semanticProjects && semanticProjects.length > 0) {
    const tableHeaders = getSemanticProjectsTableHeaders();
    const tableRows = semanticProjects.map((sp) =>
      getSemanticProjectResultRow({ result: sp }),
    );
    semanticProjectsSection = `\n\n${tableHeaders}\n${tableRows.join("\n")}\n`;
  }

  return `${HEX_COMMENT_IDENTIFIER}
${summaryLine}
${guidesSection}${semanticProjectsSection}`;
};

export const commentOnPullRequest = async (params: {
  envVars: ExpectedEnvVars & { type: "pull_request" };
  previewLink: string;
  guides: CliGuideResult[] | undefined;
  semanticProjects: CliSemanticProjectResult[] | undefined;
}) => {
  const { envVars, previewLink, guides, semanticProjects } = params;

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

  const body = generateCommentBody({
    envVars,
    previewLink,
    guides,
    semanticProjects,
  });
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

const generateGuideRow = (params: {
  result: CliGuideResult;
  hasAnyWarnings: boolean;
}) => {
  const { result, hasAnyWarnings } = params;

  const guideColumn = `\`${result.name}\``;

  let statusColumn: string;
  if (result.result === "created") {
    statusColumn = "⬆️ Added";
  } else if (result.result === "updated") {
    statusColumn = "✏️ Modified";
  } else if (result.result === "deleted") {
    statusColumn = "❌ Deleted";
  } else {
    statusColumn = "No change";
  }

  const warningsColumn = hasAnyWarnings
    ? result.warnings && result.warnings.length > 0
      ? `<details><summary>⚠️ Warnings (${result.warnings.length})</summary><pre>${result.warnings.map(replaceNewlinesWithBreaks).join("<br />")}</pre></details>`
      : ""
    : "";
  return `| ${guideColumn} | ${statusColumn} | ${hasAnyWarnings ? `${warningsColumn} |` : ""}`;
};

const getSemanticProjectResultRow = (params: {
  result: CliSemanticProjectResult;
}) => {
  const result = params.result.result;

  const problemCount = result.details.problems?.length ?? 0;
  const warningCount = result.details.warnings?.length ?? 0;
  const status =
    problemCount > 0
      ? `⚠️ ${problemCount} ${problemCount === 1 ? "problem" : "problems"}`
      : warningCount > 0
        ? `⚠️ ${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`
        : "✅ OK";
  return `| ${result.semanticProject.name} | ${result.dirPath} | ${status} |`;
};

function maybePluralize(
  length: number,
  singular: string,
  plural: string = singular + "s",
): string {
  return length === 1 ? singular : plural;
}

function maybePluralizePhrase(
  length: number,
  singular: string,
  plural?: string,
): string {
  return `${length} ${maybePluralize(length, singular, plural)}`;
}
