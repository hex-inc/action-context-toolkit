import * as core from "@actions/core";

export type Inputs = {
  hexToken: string;
  hexUrl: string;
  configFile: string;
  publish: boolean;
  commentOnPr: boolean;
};

export const getInputs = async (): Promise<Inputs> => {
  const configFile = core.getInput("config_file");
  const hexToken = core.getInput("token");
  const hexUrl = core.getInput("hex_url");
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

  if (!deleteUntrackedGuides) {
    errors.push(
      "delete_untracked_guides: false is no longer supported. The Hex CLI always prunes guides when previewing from a config file.",
    );
  }

  if (errors.length > 0) {
    throw new Error(`Error with inputs:\n${errors.join("\n")}`);
  }

  return { hexToken, hexUrl, configFile, publish, commentOnPr };
};

const getBooleanInputWithDeprecatedFallback = (
  input: string,
  deprecatedInput: string,
) => {
  return core.getInput(input) === ""
    ? core.getBooleanInput(deprecatedInput)
    : core.getBooleanInput(input);
};
