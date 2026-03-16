import * as core from "@actions/core";

export type ExpectedEnvVars = {
  baseUrl: string;
  owner: string;
  repo: string;
  sha: string;
  branch: string;
  token: string | undefined;
} & (
  | {
      type: "push";
      pullRequestNumber?: undefined;
    }
  | {
      type: "pull_request";
      pullRequestNumber: number | undefined;
    }
);

// This should all be set by the Github Action environment
export const getExpectedEnvVars = (): ExpectedEnvVars => {
  const isPushEvent = process.env["GITHUB_EVENT_NAME"] === "push";
  const isPullRequestEvent =
    process.env["GITHUB_EVENT_NAME"] === "pull_request";

  if (!isPushEvent && !isPullRequestEvent) {
    throw new Error(
      "This action can only be run on a push or pull request event",
    );
  }

  // Expected format: hex/action-context-toolkit
  const ownerAndRepo = process.env["GITHUB_REPOSITORY"];
  const baseUrl = process.env["GITHUB_SERVER_URL"];
  const sha = process.env["GITHUB_SHA"];
  const branch = isPullRequestEvent
    ? process.env["GITHUB_HEAD_REF"]
    : process.env["GITHUB_REF_NAME"];
  const token = process.env["GITHUB_TOKEN"];

  if (!ownerAndRepo) {
    throw new Error("GITHUB_REPOSITORY is not set");
  }
  if (!baseUrl) {
    throw new Error("GITHUB_SERVER_URL is not set");
  }
  if (!sha) {
    throw new Error("GITHUB_SHA is not set");
  }
  if (!branch) {
    throw new Error("GITHUB_REF_NAME is not set");
  }

  const [owner, repo] = ownerAndRepo.split("/");
  if (!owner || !repo) {
    throw new Error(
      "GITHUB_REPOSITORY is not in the expected format (expected: owner/repo)",
    );
  }
  if (isPullRequestEvent) {
    let pullRequestNumber: number | undefined = undefined;
    try {
      const rawEvent = process.env["GITHUB_EVENT"];
      if (rawEvent) {
        const event = JSON.parse(rawEvent);
        pullRequestNumber = event.pull_request.number;
      }
    } catch (e) {
      core.warning(
        `Could not extract pull request number from github environment`,
      );
    }

    return {
      baseUrl,
      token,
      owner,
      repo,
      sha,
      branch,
      type: "pull_request",
      pullRequestNumber,
    };
  } else {
    return {
      baseUrl,
      token,
      owner,
      repo,
      sha,
      branch,
      type: "push",
    };
  }
};
