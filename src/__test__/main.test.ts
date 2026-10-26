import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

vi.mock("@actions/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actions/core")>()),
  setOutput: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@actions/exec", () => ({ exec: vi.fn() }));
vi.mock("../cli", () => ({ ensureHexCli: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("INPUT_TOKEN", "test-token");
  vi.stubEnv("INPUT_HEX_URL", "https://app.hex.tech");
  vi.stubEnv("INPUT_COMMENT_ON_PR", "false");
  vi.stubEnv("HEX_CLI_LOGIN_TOKEN", "");
  vi.stubEnv("GITHUB_EVENT_NAME", "pull_request");
  vi.stubEnv("GITHUB_REPOSITORY", "hex-inc/example");
  vi.stubEnv("GITHUB_SERVER_URL", "https://github.com");
  vi.stubEnv("GITHUB_SHA", "test-sha");
  vi.stubEnv("GITHUB_HEAD_REF", "test-branch");
  vi.stubEnv("GITHUB_REF", "refs/pull/1/merge");
  vi.mocked(exec.exec).mockImplementation(async (_command, args, options) => {
    if (args?.includes("preview")) {
      options?.listeners?.stdout?.(
        Buffer.from(
          JSON.stringify({
            preview_id: "1",
            preview_link: "https://app.hex.tech/preview/1",
          }),
        ),
      );
    }
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test.each(["", "custom.json", "custom.yaml", "custom.yml"])(
  "runs a preview with config_file=%j",
  async (configFile) => {
    vi.stubEnv("INPUT_CONFIG_FILE", configFile);

    await vi.importActual("../main");

    await vi.waitFor(() => {
      expect(core.info).toHaveBeenCalledWith(
        "Finished running hex context toolkit",
      );
    });
    expect(exec.exec).toHaveBeenCalledWith(
      "hex",
      [
        "--profile",
        "ci",
        "context",
        "preview",
        "--json",
        ...(configFile ? ["--config-path", configFile] : []),
      ],
      expect.any(Object),
    );
  },
);

test("rejects an explicit config path with an unsupported extension", async () => {
  vi.stubEnv("INPUT_CONFIG_FILE", "custom.txt");
  const { getInputs } =
    await vi.importActual<typeof import("../inputs")>("../inputs");

  await expect(getInputs()).rejects.toThrow(
    "Expected a .json, .yml or .yaml config file, got: custom.txt",
  );
});
