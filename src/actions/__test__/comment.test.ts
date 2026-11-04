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
  test("nests each conversion's steps under the project named in the table", () => {
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

**Semantic Project Conversions**

<ul>
<li>✅ <b>acme_analytics</b> (dbt → hex)
<ul>
<li><details><summary>✅ Converted: dbt → ossie</summary>

<pre>stdout:
Imported model

stderr:
Import warning</pre>

</details></li>
<li><details><summary>✅ Converted: ossie → hex</summary>

<pre>Export warning</pre>

</details></li>
</ul>
</li>
<li>✅ <b><code>semantic/finance.ossie.yaml</code></b> (ossie → hex)
<ul>
<li><details><summary>✅ Converted: ossie → hex</summary>

<pre>No converter output.</pre>

</details></li>
</ul>
</li>
</ul>

---

<details><summary>ℹ️ Use the <a href="https://learn.hex.tech/docs/api-integrations/cli">Hex CLI</a> to test these changes</summary>

- Create a test thread \`hex thread create <prompt> --preview-id 1\`
- Run evals against this preview \`hex eval run --suite-id <suite-id> --preview-id 1\`

</details>`);
  });

  test("expands a failed step and omits the success links and repeated error", () => {
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
      "<li>❌ <b><code>manifest.json</code></b> (dbt → hex, exit code 1)",
    );
    expect(body).toContain("<li><details><summary>✅ Converted: dbt → ossie");
    expect(body).toContain(
      "<li><details open><summary>❌ Failed (exit code 1): ossie → hex",
    );
    expect(body).not.toContain("Preview error");
    expect(body).not.toContain("🟢 Success");
    expect(body).not.toContain("hex thread create");
  });

  test("shows the preview error when no conversion step failed", () => {
    const body = generateCommentBody({ envVars, error: "Upload <failed>" });
    expect(body).toContain("🔴 Context preview failed.");
    expect(body).toContain(
      "<details><summary>Preview error</summary>\n\n<pre>Upload &lt;failed&gt;</pre>",
    );
    expect(body).not.toContain("Semantic Project Conversions");
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
