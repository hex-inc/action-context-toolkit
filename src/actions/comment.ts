import * as github from "@actions/github";
import { ParsedConfig } from "../types";

const HEX_COMMENT_IDENTIFIER = `<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->`;

export const commentOnPullRequest = async (parsedConfig: ParsedConfig) => {
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
      "Could not detect pull request number, cannot comment on pull_requests.",
    );
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

  // TODO expand this more
  const body = HEX_COMMENT_IDENTIFIER;

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
