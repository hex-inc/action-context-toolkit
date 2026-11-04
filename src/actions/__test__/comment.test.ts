import { describe, test, expect } from "vitest";
import { generateCommentBody } from "../comment";
import { ExpectedEnvVars } from "../../env";

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
});
