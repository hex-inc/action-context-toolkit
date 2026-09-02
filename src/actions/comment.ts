import * as github from "@actions/github";
import * as core from "@actions/core";
import { ExpectedEnvVars } from "../env";
import {
  CliEvalSuiteResult,
  CliGuideResult,
  CliSemanticProjectResult,
} from "../types";

const HEX_COMMENT_IDENTIFIER = `<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->`;
const ADDED = "⬆️ Added";
const UPDATED = "✏️ Modified";
const DELETED = "❌ Deleted";
const NO_CHANGE = "No change";

const replaceNewlinesWithBreaks = (text: string) =>
  text.replace(/\n/g, "<br />");

export const generateCommentBody = (params: {
  envVars: ExpectedEnvVars;
  previewId: string;
  previewLink: string;
  guides: CliGuideResult[] | undefined;
  semanticProjects: CliSemanticProjectResult[] | undefined;
  evalSuites: CliEvalSuiteResult[] | undefined;
}): string | null => {
  // envVars not used rn, but hoping to in the near future
  const { previewId, previewLink, guides, semanticProjects, evalSuites } =
    params;

  // Two \n before the table header restores the double blank line from the original format.
  let guidesSection = "";
  if (guides && guides.length > 0) {
    const added = guides?.filter((g) => g.result === "created").length ?? 0;
    const updated = guides?.filter((g) => g.result === "updated").length ?? 0;
    const deleted = guides?.filter((g) => g.result === "deleted").length ?? 0;
    const warnings = guides.reduce(
      (acc, g) => acc + (g.warnings?.length ?? 0),
      0,
    );
    const heading = getGuidesHeading({
      added,
      updated,
      deleted,
      warnings,
    });
    const hasAnyWarnings = warnings > 0;
    const tableHeaders = getGuidesTableHeaders(hasAnyWarnings);
    const tableRows = guides.map((guide) =>
      generateGuideRow({
        result: guide,
        hasAnyWarnings,
      }),
    );
    guidesSection = `\n${heading}\n\n${tableHeaders}\n${tableRows.join("\n")}\n`;
  }

  let semanticProjectsSection = "";
  if (semanticProjects && semanticProjects.length > 0) {
    const heading = getSemanticProjectsHeading();
    const tableHeaders = getSemanticProjectsTableHeaders();
    const tableRows = semanticProjects.map((sp) =>
      getSemanticProjectResultRow({ result: sp }),
    );
    semanticProjectsSection = `\n${heading}\n\n${tableHeaders}\n${tableRows.join("\n")}\n`;
  }

  let evalSuitesSection = "";
  if (evalSuites && evalSuites.length > 0) {
    const heading = getEvalSuitesHeading();
    const tableHeaders = getEvalSuitesTableHeaders();
    const tableRows = evalSuites.map((es) =>
      getEvalSuiteResultRow({ result: es }),
    );
    evalSuitesSection = `\n${heading}\n\n${tableHeaders}\n${tableRows.join("\n")}\n`;
  }

  if (
    guidesSection === "" &&
    semanticProjectsSection === "" &&
    evalSuitesSection === ""
  ) {
    return null;
  }

  const topLine = `🟢 Success. [Test changes or run evals in Hex](${previewLink}).`;

  const bottomLine = `<details><summary>ℹ️ Use the <a href="https://learn.hex.tech/docs/api-integrations/cli">Hex CLI</a> to test these changes</summary>

- Create a test thread \`hex thread create <prompt> --preview-id ${previewId}\`
- Run evals against this preview \`hex eval run --suite-id <suite-id> --preview-id ${previewId}\`

</details>`;

  return `${HEX_COMMENT_IDENTIFIER}
${topLine}
${guidesSection}${semanticProjectsSection}${evalSuitesSection}
${bottomLine}`;
};

export const commentOnPullRequest = async (params: {
  envVars: ExpectedEnvVars & { type: "pull_request" };
  previewId: string;
  previewLink: string;
  guides: CliGuideResult[] | undefined;
  semanticProjects: CliSemanticProjectResult[] | undefined;
  evalSuites: CliEvalSuiteResult[] | undefined;
}) => {
  const {
    envVars,
    previewId,
    previewLink,
    guides,
    semanticProjects,
    evalSuites,
  } = params;

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
    previewId,
    previewLink,
    guides,
    semanticProjects,
    evalSuites,
  });
  if (!body) {
    return;
  }
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

function getGuidesHeading(params: {
  added: number;
  updated: number;
  deleted: number;
  warnings: number;
}): string {
  const addedStr = params.added > 0 ? `${params.added} added` : "";
  const updatedStr = params.updated > 0 ? `${params.updated} updated` : "";
  const deletedStr = params.deleted > 0 ? `${params.deleted} deleted` : "";
  const warningsStr =
    params.warnings > 0 ? maybePluralizePhrase(params.warnings, "warning") : "";
  const strs = [addedStr, updatedStr, deletedStr, warningsStr].filter(Boolean);
  return `
**Guides**

${strs.join(", ")}
`.trim();
}

const getGuidesTableHeaders = (showWarningColumn: boolean) => {
  return `| Guide | Status | ${showWarningColumn ? "Warnings | " : ""}
|-------|--------|${showWarningColumn ? "------|" : ""}`;
};

const generateGuideRow = (params: {
  result: CliGuideResult;
  hasAnyWarnings: boolean;
}) => {
  const { result, hasAnyWarnings } = params;

  const guideColumn = `\`${result.name}\``;

  let statusColumn: string;
  if (result.result === "created") {
    statusColumn = ADDED;
  } else if (result.result === "updated") {
    statusColumn = UPDATED;
  } else if (result.result === "deleted") {
    statusColumn = DELETED;
  } else {
    statusColumn = NO_CHANGE;
  }

  const warningsColumn = hasAnyWarnings
    ? result.warnings && result.warnings.length > 0
      ? `<details><summary>⚠️ Warnings (${result.warnings.length})</summary><pre>${result.warnings.map(replaceNewlinesWithBreaks).join("<br />")}</pre></details>`
      : ""
    : "";
  return `| ${guideColumn} | ${statusColumn} | ${hasAnyWarnings ? `${warningsColumn} |` : ""}`;
};

function getSemanticProjectsHeading(): string {
  return "**Semantic Projects**";
}

const getSemanticProjectsTableHeaders = () =>
  `| Name | Status |
|------|--------|`;

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
  return `| ${result.semanticProject.name} | ${status} |`;
};

function getEvalSuitesHeading(): string {
  return "**Eval Suites**";
}

const getEvalSuitesTableHeaders = () =>
  `| Name | Status |
|------|--------|`;

const getEvalSuiteResultRow = (params: { result: CliEvalSuiteResult }) => {
  const { result } = params.result;
  const status =
    result.result === "created"
      ? ADDED
      : result.result === "updated"
        ? UPDATED
        : NO_CHANGE;

  return `| ${result.evalSuite.publicIdentifier} | ${status} |`;
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
