import * as github from "@actions/github";
import * as core from "@actions/core";
import { ExpectedEnvVars } from "../env";
import {
  CliConversionStep,
  CliEvalSuiteResult,
  CliGuideResult,
  CliSemanticProjectResult,
  CliSemanticProjectConversion,
} from "../types";

const HEX_COMMENT_IDENTIFIER = `<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->`;
const ADDED = "⬆️ Added";
const UPDATED = "✏️ Modified";
const DELETED = "❌ Deleted";
const NO_CHANGE = "No change";
const MAX_COMMENT_LENGTH = 60000;
const MAX_DIAGNOSTICS_LENGTH = 6000;

type CommentParams = {
  envVars: ExpectedEnvVars;
  guides?: CliGuideResult[];
  semanticProjects?: CliSemanticProjectResult[];
  evalSuites?: CliEvalSuiteResult[];
  semanticProjectConversions?: CliSemanticProjectConversion[];
} & (
  | { previewId: string; previewLink: string; error?: never }
  | { error: string; previewId?: never; previewLink?: never }
);

const replaceNewlinesWithBreaks = (text: string) =>
  text.replace(/\n/g, "<br />");

export const generateCommentBody = (params: CommentParams): string | null => {
  // envVars not used rn, but hoping to in the near future
  const {
    previewId,
    previewLink,
    guides,
    semanticProjects,
    evalSuites,
    semanticProjectConversions,
    error,
  } = params;
  const hasError = error !== undefined;

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

  // Raw HTML lists: Markdown list items cannot hold multi-line <pre> output.
  let conversionsSection = "";
  if (semanticProjectConversions && semanticProjectConversions.length > 0) {
    const heading = getConversionsHeading();
    const items = semanticProjectConversions.map((conversion) =>
      getConversionItem({ conversion, semanticProjects }),
    );
    conversionsSection = `\n${heading}\n\n<ul>\n${items.join("\n")}\n</ul>\n`;
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

  // A failed conversion step already shows the diagnostics the CLI's error repeats.
  let errorSection = "";
  const conversionFailed = semanticProjectConversions?.some((conversion) =>
    conversion.steps.some((step) => step.exitCode !== 0),
  );
  if (hasError && !conversionFailed) {
    errorSection = `\n<details><summary>Preview error</summary>\n\n<pre>${escapeHtml(limitDiagnostics(error))}</pre>\n\n</details>\n`;
  }

  if (
    guidesSection === "" &&
    semanticProjectsSection === "" &&
    conversionsSection === "" &&
    evalSuitesSection === "" &&
    !hasError
  ) {
    return null;
  }

  const topLine = hasError
    ? "🔴 Context preview failed."
    : `🟢 Success. [Test changes or run evals in Hex](${previewLink}).`;

  const bottomLine = !hasError
    ? `<details><summary>ℹ️ Use the <a href="https://learn.hex.tech/docs/api-integrations/cli">Hex CLI</a> to test these changes</summary>

- Create a test thread \`hex thread create <prompt> --preview-id ${previewId}\`
- Run evals against this preview \`hex eval run --suite-id <suite-id> --preview-id ${previewId}\`

</details>`
    : "";

  // Separate the expandable conversion blocks from the expandable CLI tips.
  const separator = conversionsSection && bottomLine ? "---\n\n" : "";

  const body = `${HEX_COMMENT_IDENTIFIER}
${topLine}
${guidesSection}${semanticProjectsSection}${conversionsSection}${evalSuitesSection}${errorSection}
${separator}${bottomLine}`;
  return body.length <= MAX_COMMENT_LENGTH
    ? body
    : `${body.slice(0, MAX_COMMENT_LENGTH - 150)}\n\n… Comment truncated. See the action logs for full diagnostics.`;
};

export const commentOnPullRequest = async (
  params: CommentParams & {
    envVars: ExpectedEnvVars & { type: "pull_request" };
  },
) => {
  const { envVars } = params;

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

  const body = generateCommentBody(params);
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function limitDiagnostics(text: string): string {
  return text.length <= MAX_DIAGNOSTICS_LENGTH
    ? text
    : `${text.slice(0, MAX_DIAGNOSTICS_LENGTH)}\n… Truncated. See the action logs for full diagnostics.`;
}

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

function getConversionsHeading(): string {
  return "**Semantic Project Conversions**";
}

/**
 * A list item naming the converted project, with a nested list holding one
 * collapsible block per converter step. A failed step starts expanded so its
 * diagnostics are visible without a click.
 *
 * The project is named as it appears in the Semantic Projects table. A
 * project that failed to convert was never uploaded, so it is named by its
 * configured path instead.
 */
function getConversionItem(params: {
  conversion: CliSemanticProjectConversion;
  semanticProjects: CliSemanticProjectResult[] | undefined;
}): string {
  const { conversion, semanticProjects } = params;
  const uploaded = semanticProjects?.find(
    (project) => project.dirPath === conversion.path,
  );
  const name = uploaded
    ? `<b>${escapeHtml(uploaded.result.semanticProject.name)}</b>`
    : `<b><code>${escapeHtml(conversion.path)}</code></b>`;
  const outcomes = conversion.steps.map(getStepOutcome);
  const failedStep = conversion.steps.find(
    (_, index) => outcomes[index] === "failed",
  );
  const omitted = conversion.steps.reduce(
    (count, step) => count + (step.problems?.error ?? 0),
    0,
  );
  const route = `${escapeHtml(conversion.from)} → ${escapeHtml(conversion.to)}`;
  const heading = failedStep
    ? `❌ ${name} (${route}, exit code ${failedStep.exitCode})`
    : outcomes.includes("partial")
      ? `⚠️ ${name} (${route}, ${omitted > 0 ? `${omitted} definition${omitted === 1 ? "" : "s"} omitted` : "definitions omitted"})`
      : `✅ ${name} (${route})`;
  const steps = conversion.steps.map((step, index) => {
    const outcome = outcomes[index];
    const status =
      outcome === "converted"
        ? "✅ Converted"
        : outcome === "partial"
          ? `⚠️ Converted with ${step.problems?.error ?? "some"} errors`
          : `❌ Failed (exit code ${step.exitCode})`;
    const details = outcome === "converted" ? "<details>" : "<details open>";
    // The blank lines let <pre> start its own HTML block, so output containing blank lines stays verbatim.
    return `<li>${details}<summary>${status}: ${escapeHtml(step.from)} → ${escapeHtml(step.to)}</summary>\n\n<pre>${escapeHtml(limitDiagnostics(formatStepOutput(step)))}</pre>\n\n</details></li>`;
  });
  return `<li>${heading}\n<ul>\n${steps.join("\n")}\n</ul>\n</li>`;
}

/**
 * A converter may exit nonzero after omitting definitions it could not convert
 * while still writing the rest, which the CLI reports as usable and syncs.
 * Older CLIs omit `usable`, so a nonzero exit is a failure for them.
 */
function getStepOutcome(
  step: CliConversionStep,
): "converted" | "partial" | "failed" {
  if (step.exitCode === 0) return "converted";
  return step.usable ? "partial" : "failed";
}

/** Label the streams only when both carry output; converters usually write to one. */
function formatStepOutput(step: { stdout: string; stderr: string }): string {
  const { stdout, stderr } = step;
  if (stdout && stderr) return `stdout:\n${stdout}\n\nstderr:\n${stderr}`;
  return stdout || stderr || "No converter output.";
}

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
