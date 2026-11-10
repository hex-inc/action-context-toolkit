import { describe, test, expect, vi } from "vitest";
import * as github from "@actions/github";
import { generateCommentBody, commentOnPullRequest } from "../comment";
import { ExpectedEnvVars } from "../../env";

vi.mock("@actions/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@actions/github")>();
  return { ...actual, getOctokit: vi.fn(actual.getOctokit) };
});

const envVars: ExpectedEnvVars = {
  baseUrl: "https://hex.tech",
  owner: "hex-inc",
  repo: "hex-inc",
  sha: "1234567890",
  branch: "main",
  token: "1234567890",
  type: "pull_request",
  pullRequestNumber: 123,
};

describe("generateCommentBody", () => {
  test("renders added and modified guides", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "1",
      previewLink: "https://app.hex.tech/preview/1",
      guides: [
        {
          name: "guide.md",
          result: "created",
        },
        {
          name: "another-guide.md",
          result: "updated",
        },
      ],
      semanticProjects: [],
      evalSuites: [],
    });
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Success. [Test changes or run evals in Hex](https://app.hex.tech/preview/1).

      **Guides**

      1 added, 1 updated

      | Guide | Status | 
      |-------|--------|
      | \`guide.md\` | ⬆️ Added | 
      | \`another-guide.md\` | ✏️ Modified | 

      <details><summary>ℹ️ Use the <a href="https://learn.hex.tech/docs/api-integrations/cli">Hex CLI</a> to test these changes</summary>

      - Create a test thread \`hex thread create <prompt> --preview-id 1\`
      - Run evals against this preview \`hex eval run --suite-id <suite-id> --preview-id 1\`

      </details>"
    `);
  });

  test("does not generate a comment when changes are empty", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "3",
      previewLink: "https://app.hex.tech/preview/3",
      guides: [],
      semanticProjects: [],
      evalSuites: [],
    });
    expect(body).toBeNull();
  });

  test("does not generate a comment when changes are undefined", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "4",
      previewLink: "https://app.hex.tech/preview/4",
      guides: undefined,
      semanticProjects: undefined,
      evalSuites: undefined,
    });
    expect(body).toBeNull();
  });

  test("renders warning column when a guide has warnings", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "5",
      previewLink: "https://app.hex.tech/preview/5",
      guides: [
        {
          name: "guides/warn.md",
          result: "updated",
          warnings: ["File is too large"],
        },
        {
          name: "guides/ok.md",
          result: "created",
        },
      ],
      semanticProjects: [],
      evalSuites: [],
    });
    expect(body).toContain("Warnings");
    expect(body).toContain("File is too large");
  });

  test("renders semantic projects table", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "6",
      previewLink: "https://app.hex.tech/preview/6",
      guides: undefined,
      semanticProjects: [
        {
          dirPath: "semantic/sales",
          result: {
            semanticProject: { name: "Sales Model" },
            details: { contents: { datasets: [{}, {}] } },
          },
        },
        {
          dirPath: "semantic/broken",
          result: {
            semanticProject: { name: "Broken Model" },
            details: { problems: [{}] },
          },
        },
      ],
      evalSuites: [],
    });
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Success. [Test changes or run evals in Hex](https://app.hex.tech/preview/6).

      **Semantic Projects**

      | Name | Status |
      |------|--------|
      | Sales Model | ✅ OK |
      | Broken Model | ⚠️ 1 problem |

      <details><summary>ℹ️ Use the <a href="https://learn.hex.tech/docs/api-integrations/cli">Hex CLI</a> to test these changes</summary>

      - Create a test thread \`hex thread create <prompt> --preview-id 6\`
      - Run evals against this preview \`hex eval run --suite-id <suite-id> --preview-id 6\`

      </details>"
    `);
  });

  test("renders guides, semantic projects, and eval suites together", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "7",
      previewLink: "https://app.hex.tech/preview/7",
      guides: [
        {
          name: "guide.md",
          result: "created",
        },
      ],
      semanticProjects: [
        {
          dirPath: "semantic/sales",
          result: {
            semanticProject: { name: "Sales Model" },
            details: {},
          },
        },
      ],
      evalSuites: [
        {
          path: "eval-suites/eval-suite.md",
          result: {
            previewId: "1234567890",
            evalSuite: {
              id: "1234567890",
              publicIdentifier: "eval-suite-123",
            },
            evalSuiteVersion: {
              id: "1234567890",
            },
            result: "created",
          },
        },
      ],
    });
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Success. [Test changes or run evals in Hex](https://app.hex.tech/preview/7).

      **Guides**

      1 added

      | Guide | Status | 
      |-------|--------|
      | \`guide.md\` | ⬆️ Added | 

      **Semantic Projects**

      | Name | Status |
      |------|--------|
      | Sales Model | ✅ OK |

      **Eval Suites**

      | Name | Status |
      |------|--------|
      | eval-suite-123 | ⬆️ Added |

      <details><summary>ℹ️ Use the <a href="https://learn.hex.tech/docs/api-integrations/cli">Hex CLI</a> to test these changes</summary>

      - Create a test thread \`hex thread create <prompt> --preview-id 7\`
      - Run evals against this preview \`hex eval run --suite-id <suite-id> --preview-id 7\`

      </details>"
    `);
  });

  test("shows an escaped preview error without success links", () => {
    const body = generateCommentBody({
      envVars,
      error: "Upload <failed> & stopped",
    });
    expect(body).toContain("🔴 Context preview failed.");
    expect(body).toContain(
      "<details><summary>Preview error</summary>\n\n<pre>Upload &lt;failed&gt; &amp; stopped</pre>",
    );
    expect(body).not.toContain("🟢 Success");
    expect(body).not.toContain("hex thread create");
  });

  test("bounds long preview errors", () => {
    const body = generateCommentBody({
      envVars,
      error: "Failure details ".repeat(1000),
    });
    expect(body).toContain(
      "… Truncated. See the action logs for full diagnostics.",
    );
    expect(body!.length).toBeLessThan(6500);
  });

  test("bounds the whole comment when its resource summary is long", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "1",
      previewLink: "https://app.hex.tech/preview/1",
      guides: Array.from({ length: 3000 }, (_, i) => ({
        name: `guide-${i}.md`,
        result: "created",
      })),
    });
    expect(body!.length).toBeLessThanOrEqual(60000);
    expect(body).toContain(
      "… Comment truncated. See the action logs for full diagnostics.",
    );
  });

  test("keeps successful conversion details collapsed", () => {
    const body = generateCommentBody({
      envVars,
      previewId: "1",
      previewLink: "https://app.hex.tech/preview/1",
      semanticProjects: [
        {
          dirPath: "semantic/manifest.json",
          result: { semanticProject: { name: "acme_analytics" }, details: {} },
        },
      ],
      evalSuites: [
        {
          path: "eval-suites/analytics.md",
          result: {
            previewId: "1",
            evalSuite: { id: "suite-id", publicIdentifier: "analytics" },
            evalSuiteVersion: { id: "suite-version-id" },
            result: "updated",
          },
        },
      ],
      semanticProjectConversions: [
        {
          id: "1",
          path: "semantic/manifest.json",
          from: "dbt",
          to: "hex",
          steps: [
            {
              from: "dbt",
              to: "ossie",
              stdout: "Imported model",
              stderr: "Import warning",
              exitCode: 0,
            },
            {
              from: "ossie",
              to: "hex",
              stdout: "",
              stderr: "Export warning",
              exitCode: 0,
            },
          ],
        },
        {
          id: "2",
          path: "semantic/finance.ossie.yaml",
          from: "ossie",
          to: "hex",
          steps: [
            { from: "ossie", to: "hex", stdout: "", stderr: "", exitCode: 0 },
          ],
        },
      ],
    });
    expect(body)
      .toBe(`<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
🟢 Success. [Test changes or run evals in Hex](https://app.hex.tech/preview/1).

**Semantic Projects**

| Name | Status |
|------|--------|
| acme_analytics | ✅ OK |

**Eval Suites**

| Name | Status |
|------|--------|
| analytics | ✏️ Modified |

**Semantic Project Conversions**

<ul>
<li><details><summary>acme_analytics (dbt → hex)</summary>
<ul>
<li><details><summary>dbt → ossie</summary>

<pre>stdout:
Imported model

stderr:
Import warning</pre>

</details></li>
<li><details><summary>ossie → hex</summary>

<pre>Export warning</pre>

</details></li>
</ul>
</details></li>
<li><details><summary><code>semantic/finance.ossie.yaml</code> (ossie → hex)</summary>
<ul>
<li><details><summary>ossie → hex</summary>

<pre>No converter output.</pre>

</details></li>
</ul>
</details></li>
</ul>

---

<details><summary>ℹ️ Use the <a href="https://learn.hex.tech/docs/api-integrations/cli">Hex CLI</a> to test these changes</summary>

- Create a test thread \`hex thread create <prompt> --preview-id 1\`
- Run evals against this preview \`hex eval run --suite-id <suite-id> --preview-id 1\`

</details>`);
  });

  test("expands the failed conversion and its failed step's diagnostics", () => {
    const body = generateCommentBody({
      envVars,
      error: "Could not convert manifest.json (exit code 1):\n31 errors",
      semanticProjectConversions: [
        {
          id: "1",
          path: "manifest.json",
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
              stderr: "31 errors: unresolved field .arr",
              exitCode: 1,
            },
          ],
        },
      ],
    });
    expect(body).toContain("🔴 Context preview failed.");
    expect(body).toContain(
      "<li><details open><summary>❌ <b><code>manifest.json</code></b> (dbt → hex, exit code 1)</summary>",
    );
    expect(body).toContain("<li><details><summary>dbt → ossie</summary>");
    expect(body).toContain(
      "<li><details open><summary>❌ Failed (exit code 1): ossie → hex",
    );
    expect(body).toContain("<pre>31 errors: unresolved field .arr</pre>");
    expect(body).not.toContain("Preview error");
    expect(body).not.toContain("🟢 Success");
    expect(body).not.toContain("hex thread create");
  });

  test("escapes converter text and bounds long comments", () => {
    const body = generateCommentBody({
      envVars,
      error: "<failure>",
      semanticProjectConversions: Array.from({ length: 20 }, () => ({
        id: "1",
        path: "<model>.yaml",
        from: "ossie",
        to: "hex",
        steps: [
          {
            from: "ossie",
            to: "hex",
            stdout: "",
            stderr: "<diagnostic>&".repeat(1000),
            exitCode: 1,
          },
        ],
      })),
    });
    expect(body).toContain("&lt;model&gt;");
    expect(body).toContain("&lt;diagnostic&gt;&amp;");
    expect(body).not.toContain("<diagnostic>");
    expect(body!.length).toBeLessThanOrEqual(60000);
    expect(body).toContain("truncated");
  });
});

test("updates the existing preview comment instead of creating another", async () => {
  const actual =
    await vi.importActual<typeof import("@actions/github")>("@actions/github");
  const octokit = actual.getOctokit("test-token");
  const createComment = vi.fn().mockResolvedValue({});
  const updateComment = vi.fn().mockResolvedValue({});
  vi.spyOn(octokit.rest.issues, "createComment").mockImplementation(
    createComment,
  );
  vi.spyOn(octokit.rest.issues, "updateComment").mockImplementation(
    updateComment,
  );
  const previousBody = generateCommentBody({
    envVars,
    previewId: "1",
    previewLink: "https://app.hex.tech/preview/1",
    guides: [{ name: "guide.md", result: "created" }],
    semanticProjects: undefined,
    evalSuites: undefined,
  });
  vi.spyOn(octokit.paginate, "iterator").mockImplementation(
    vi.fn().mockReturnValue(
      (async function* () {
        yield { data: [{ id: 123, body: previousBody }] };
      })(),
    ),
  );
  vi.mocked(github.getOctokit).mockReturnValue(octokit);

  await commentOnPullRequest({
    envVars: { ...envVars, type: "pull_request" },
    previewId: "2",
    previewLink: "https://app.hex.tech/preview/2",
    guides: [{ name: "guide.md", result: "updated" }],
    semanticProjects: undefined,
    evalSuites: undefined,
  });

  expect(updateComment).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: envVars.owner,
      repo: envVars.repo,
      issue_number: envVars.pullRequestNumber,
      comment_id: 123,
      body: expect.stringContaining("https://app.hex.tech/preview/2"),
    }),
  );
  expect(createComment).not.toHaveBeenCalled();
});

test("writes the failed preview's diagnostics to a new PR comment", async () => {
  const createComment = vi.fn().mockResolvedValue({});
  const actual =
    await vi.importActual<typeof import("@actions/github")>("@actions/github");
  const octokit = actual.getOctokit("test-token");
  vi.spyOn(octokit.rest.issues, "createComment").mockImplementation(
    createComment,
  );
  vi.spyOn(octokit.paginate, "iterator").mockImplementation(
    vi.fn().mockReturnValue(
      (async function* () {
        yield { data: [] };
      })(),
    ),
  );
  vi.mocked(github.getOctokit).mockReturnValue(octokit);
  await commentOnPullRequest({
    envVars: { ...envVars, type: "pull_request" },
    error: "Conversion failed",
    semanticProjectConversions: [
      {
        id: "1",
        path: "manifest.json",
        from: "dbt",
        to: "hex",
        steps: [
          {
            from: "ossie",
            to: "hex",
            stdout: "",
            stderr: "Unresolved .arr",
            exitCode: 1,
          },
        ],
      },
    ],
  });
  expect(createComment).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: envVars.owner,
      repo: envVars.repo,
      issue_number: envVars.pullRequestNumber,
      body: expect.stringContaining("❌ Failed (exit code 1): ossie → hex"),
    }),
  );
});
