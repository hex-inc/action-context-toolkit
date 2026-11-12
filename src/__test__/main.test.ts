import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { commentOnPullRequest } from "../actions/comment";

vi.mock("@actions/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@actions/core")>()),
  setOutput: vi.fn(),
  info: vi.fn(),
  setFailed: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@actions/exec", () => ({ exec: vi.fn() }));
vi.mock("../cli", () => ({ ensureHexCli: vi.fn() }));
vi.mock("../actions/comment", () => ({ commentOnPullRequest: vi.fn() }));

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
        "-vv",
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

test("does not publish when the preview command fails on a push event", async () => {
  vi.stubEnv("GITHUB_EVENT_NAME", "push");
  vi.stubEnv("GITHUB_REF_NAME", "main");
  vi.spyOn(process, "exit").mockImplementation(vi.fn<typeof process.exit>());
  const error = new Error("Preview command failed");
  vi.mocked(exec.exec).mockImplementation(async (_command, args) => {
    if (args?.includes("preview")) throw error;
    return 0;
  });

  await vi.importActual("../main");

  await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalledWith(error));
  expect(core.setOutput).not.toHaveBeenCalled();
  expect(exec.exec).not.toHaveBeenCalledWith(
    "hex",
    expect.arrayContaining(["publish"]),
  );
});

test("reports the CLI's JSON error when preview creation fails", async () => {
  vi.mocked(exec.exec).mockImplementation(async (_command, args, options) => {
    if (args?.includes("preview")) {
      options?.listeners?.stdout?.(
        Buffer.from(JSON.stringify({ error: "Could not upload context" })),
      );
      return 1;
    }
    return 0;
  });

  await vi.importActual("../main");

  await vi.waitFor(() =>
    expect(core.setFailed).toHaveBeenCalledWith(
      new Error("Could not upload context"),
    ),
  );
});

test("comments with the exit code when the CLI crashes without JSON output", async () => {
  vi.stubEnv("INPUT_COMMENT_ON_PR", "true");
  vi.mocked(exec.exec).mockImplementation(async (_command, args) => {
    if (args?.includes("preview")) return 1;
    return 0;
  });

  await vi.importActual("../main");

  await vi.waitFor(() =>
    expect(core.setFailed).toHaveBeenCalledWith(
      new Error("Hex context preview failed (exit code 1)."),
    ),
  );
  expect(commentOnPullRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      error: "Hex context preview failed (exit code 1).",
    }),
  );
});

test("comments with the preview error and still fails the action", async () => {
  vi.stubEnv("INPUT_COMMENT_ON_PR", "true");
  vi.mocked(exec.exec).mockImplementation(async (_command, args, options) => {
    if (args?.includes("preview")) {
      options?.listeners?.stdout?.(
        Buffer.from(JSON.stringify({ error: "Could not upload context" })),
      );
      return 1;
    }
    return 0;
  });

  await vi.importActual("../main");

  await vi.waitFor(() =>
    expect(core.setFailed).toHaveBeenCalledWith(
      new Error("Could not upload context"),
    ),
  );
  expect(commentOnPullRequest).toHaveBeenCalledWith(
    expect.objectContaining({ error: "Could not upload context" }),
  );
});

test("preserves the preview error when posting its comment fails", async () => {
  vi.stubEnv("INPUT_COMMENT_ON_PR", "true");
  vi.mocked(exec.exec).mockImplementation(async (_command, args, options) => {
    if (args?.includes("preview")) {
      options?.listeners?.stdout?.(
        Buffer.from(JSON.stringify({ error: "Could not upload context" })),
      );
      return 1;
    }
    return 0;
  });
  vi.mocked(commentOnPullRequest).mockRejectedValueOnce(
    new Error("GitHub unavailable"),
  );

  await vi.importActual("../main");

  await vi.waitFor(() =>
    expect(core.setFailed).toHaveBeenCalledWith(
      new Error("Could not upload context"),
    ),
  );
  expect(core.warning).toHaveBeenCalledWith(
    "Could not comment on the failed preview: Error: GitHub unavailable",
  );
});

test("passes per-step conversions from the single preview command to the PR comment", async () => {
  vi.stubEnv("INPUT_COMMENT_ON_PR", "true");
  const semanticProjectConversions = [
    {
      id: "project-id",
      path: "semantic/manifest.json",
      from: "dbt",
      to: "hex",
      steps: [
        {
          from: "dbt",
          to: "ossie",
          stdout: "Imported",
          stderr: "Import warning",
          exitCode: 0,
        },
        {
          from: "ossie",
          to: "hex",
          stdout: "Exported",
          stderr: "Export warning",
          exitCode: 0,
        },
      ],
    },
  ];
  vi.mocked(exec.exec).mockImplementation(async (_command, args, options) => {
    if (args?.includes("preview")) {
      options?.listeners?.stdout?.(
        Buffer.from(
          JSON.stringify({
            preview_id: "1",
            preview_link: "https://app.hex.tech/preview/1",
            semanticProjectConversions,
          }),
        ),
      );
    }
    return 0;
  });
  await vi.importActual("../main");
  await vi.waitFor(() =>
    expect(core.info).toHaveBeenCalledWith(
      "Finished running hex context toolkit",
    ),
  );
  expect(commentOnPullRequest).toHaveBeenCalledWith(
    expect.objectContaining({ semanticProjectConversions }),
  );
  expect(exec.exec).toHaveBeenCalledTimes(2);
});

test("includes failed conversion steps in the PR comment while failing the action", async () => {
  vi.stubEnv("INPUT_COMMENT_ON_PR", "true");
  const error = "Could not convert dbt: unresolved field .arr";
  const semanticProjectConversions = [
    {
      id: "project-id",
      path: "semantic/manifest.json",
      from: "dbt",
      to: "hex",
      steps: [
        {
          from: "dbt",
          to: "ossie",
          stdout: "Imported",
          stderr: "",
          exitCode: 0,
        },
        {
          from: "ossie",
          to: "hex",
          stdout: "",
          stderr: "Unresolved field .arr",
          exitCode: 1,
        },
      ],
    },
  ];
  vi.mocked(exec.exec).mockImplementation(async (_command, args, options) => {
    if (args?.includes("preview")) {
      options?.listeners?.stdout?.(
        Buffer.from(JSON.stringify({ error, semanticProjectConversions })),
      );
      return 1;
    }
    return 0;
  });
  await vi.importActual("../main");
  await vi.waitFor(() =>
    expect(core.setFailed).toHaveBeenCalledWith(new Error(error)),
  );
  expect(commentOnPullRequest).toHaveBeenCalledWith(
    expect.objectContaining({ error, semanticProjectConversions }),
  );
  expect(core.setOutput).not.toHaveBeenCalled();
  expect(exec.exec).toHaveBeenCalledTimes(2);
});

test.each(["push", "pull_request"])(
  "accepts a successful preview with partial conversion output on %s",
  async (event) => {
    vi.stubEnv("GITHUB_EVENT_NAME", event);
    vi.stubEnv("GITHUB_REF_NAME", "main");
    vi.stubEnv("INPUT_COMMENT_ON_PR", "true");
    const semanticProjectConversions = [
      {
        id: "project-id",
        path: "model.ossie.yaml",
        from: "ossie",
        to: "hex",
        steps: [
          {
            from: "ossie",
            to: "hex",
            stdout: "",
            stderr:
              "Failed.\nConverted model.ossie.yaml -> out/revenue/.\nEncountered 2 problems: 2 errors.",
            exitCode: 1,
            usable: true,
          },
        ],
      },
    ];
    vi.mocked(exec.exec).mockImplementation(async (_command, args, options) => {
      if (args?.includes("preview")) {
        options?.listeners?.stdout?.(
          Buffer.from(
            JSON.stringify({
              preview_id: "1",
              preview_link: "https://app.hex.tech/preview/1",
              semanticProjectConversions,
            }),
          ),
        );
      }
      return 0;
    });

    await vi.importActual("../main");

    await vi.waitFor(() =>
      expect(core.info).toHaveBeenCalledWith(
        "Finished running hex context toolkit",
      ),
    );
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith("preview_id", "1");
    expect(core.setOutput).toHaveBeenCalledWith(
      "preview_link",
      "https://app.hex.tech/preview/1",
    );
    if (event === "push") {
      expect(exec.exec).toHaveBeenCalledWith("hex", [
        "--profile",
        "ci",
        "context",
        "publish",
        "1",
      ]);
      expect(commentOnPullRequest).not.toHaveBeenCalled();
    } else {
      expect(commentOnPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({ semanticProjectConversions }),
      );
      expect(exec.exec).not.toHaveBeenCalledWith(
        "hex",
        expect.arrayContaining(["publish"]),
      );
    }
  },
);
