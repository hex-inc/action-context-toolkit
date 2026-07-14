import * as core from "@actions/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getInputs } from "../inputs";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  getBooleanInput: vi.fn(),
}));

const stringInputs: Record<string, string> = {};
const booleanInputs: Record<string, boolean> = {};

beforeEach(() => {
  Object.assign(stringInputs, {
    config_file: "hex_context.config.json",
    token: "token",
    hex_url: "https://app.hex.tech",
    cli_version: "1.2026.07.09",
    publish: "",
  });
  Object.assign(booleanInputs, {
    publish_guides: true,
    delete_untracked_guides: true,
    comment_on_pr: false,
  });

  vi.mocked(core.getInput).mockImplementation(
    (name) => stringInputs[name] ?? "",
  );
  vi.mocked(core.getBooleanInput).mockImplementation(
    (name) => booleanInputs[name] ?? false,
  );
});

describe("getInputs", () => {
  test("normalizes a prefixed CLI version", async () => {
    stringInputs.cli_version = "v1.2026.07.09";

    await expect(getInputs()).resolves.toMatchObject({
      cliVersion: "1.2026.07.09",
    });
  });

  test("supports the latest CLI version", async () => {
    stringInputs.cli_version = "latest";

    await expect(getInputs()).resolves.toMatchObject({ cliVersion: "latest" });
  });

  test("rejects an invalid CLI version", async () => {
    stringInputs.cli_version = "next";

    await expect(getInputs()).rejects.toThrow("Invalid Hex CLI version");
  });

  test("supports the deprecated publish_guides input", async () => {
    booleanInputs.publish_guides = false;

    await expect(getInputs()).resolves.toMatchObject({ publish: false });
  });
});
