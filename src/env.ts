export type ExpectedEnvVars = {
  baseUrl: string;
  owner: string;
  repo: string;
  sha: string;
  branch: string;
};

// This should all be set by the Github Action environment
export const getExpectedEnvVars = (): ExpectedEnvVars => {
  const isPushEvent = process.env["GITHUB_EVENT_NAME"] === "push";

  // In the future we will support other event types, but different event types map environments differently
  if (!isPushEvent) {
    throw new Error("This action can only be run on a push event");
  }

  // Expected format: hex/action-context-toolkit
  const ownerAndRepo = process.env["GITHUB_REPOSITORY"];
  const baseUrl = process.env["GITHUB_SERVER_URL"];
  const sha = process.env["GITHUB_SHA"];
  const branch = process.env["GITHUB_REF_NAME"]; // This is the branch name, when run in a pull request

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

  return {
    baseUrl,
    owner,
    repo,
    sha,
    branch,
  };
};
