import * as core from "@actions/core";

export type Inputs = {
  hexToken: string;
  hexUrl: string;
  cliVersion: string;
  configFile: string;
  publish: boolean;
  commentOnPr: boolean;
};

export const getInputs = async (): Promise<Inputs> => {
  const configFile = core.getInput("config_file");
  const hexToken = core.getInput("token");
  const hexUrl = core.getInput("hex_url");
  const cliVersion = core.getInput("cli_version");
  const publish = getBooleanInputWithDeprecatedFallback(
    "publish",
    "publish_guides",
  );
  const deleteUntrackedGuides = core.getBooleanInput("delete_untracked_guides");
  const commentOnPr = core.getBooleanInput("comment_on_pr");

  const errors: string[] = [];

  if (hexToken === "") {
    errors.push(
      "A token is required. Please check the 'token' input and ensure the secret is set in your repository settings.",
    );
  }

  try {
    new URL(hexUrl);
  } catch {
    errors.push(
      `Invalid hex URL: ${hexUrl}, expected a valid URL (e.g. https://app.hex.tech)`,
    );
  }

  if (!configFile.endsWith(".json")) {
    errors.push(`Expected a .json config file, got: ${configFile}`);
  }

  if (
    cliVersion !== "latest" &&
    !/^v?\d+\.\d{4}\.\d{2}\.\d{2}$/.test(cliVersion)
  ) {
    errors.push(
      `Invalid Hex CLI version: ${cliVersion}. Expected latest or a version such as 1.2026.07.09.`,
    );
  }

  if (!deleteUntrackedGuides) {
    errors.push(
      "delete_untracked_guides: false is no longer supported. The Hex CLI always prunes guides when previewing from a config file.",
    );
  }

  if (errors.length > 0) {
    throw new Error(`Error with inputs:\n${errors.join("\n")}`);
  }

  return {
    hexToken,
    hexUrl,
    cliVersion: cliVersion.replace(/^v/, ""),
    configFile,
    publish,
    commentOnPr,
  };
};

const getBooleanInputWithDeprecatedFallback = (
  input: string,
  deprecatedInput: string,
) => {
  return core.getInput(input) === ""
    ? core.getBooleanInput(deprecatedInput)
    : core.getBooleanInput(input);
};
