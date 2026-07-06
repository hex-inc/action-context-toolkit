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
  test("renders added, modified and deleted guides", () => {
    const body = generateCommentBody(
      envVars,
      "https://app.hex.tech/preview/1",
      {
        upserted: [
          {
            originalFilePath: "guide.md",
            hexFilePath: "guide.md",
            id: "id1",
            result: "created",
          },
          {
            originalFilePath: "another-guide.md",
            hexFilePath: "another-guide.md",
            id: "id2",
            result: "updated",
          },
        ],
        removed: ["deleted-guide.md"],
      },
    );
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Success - 1 guide added, 1 guide updated, 1 guide deleted. [Test changes in Hex](https://app.hex.tech/preview/1).


      | Guide | Status | 
      |-------|--------|
      | [guide.md](https://hex.tech/hex-inc/hex-inc/blob/1234567890/guide.md) | ⬆️ Added | 
      | [another-guide.md](https://hex.tech/hex-inc/hex-inc/blob/1234567890/another-guide.md) | ✏️ Modified | 
      | ~~\`deleted-guide.md\`~~ | ❌ Deleted |
      "
    `);
  });

  test("renders deleted-only guides", () => {
    const body = generateCommentBody(
      envVars,
      "https://app.hex.tech/preview/2",
      {
        upserted: [],
        removed: ["deleted-guide.md"],
      },
    );
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Success - 1 guide deleted. [Test changes in Hex](https://app.hex.tech/preview/2).


      | Guide | Status | 
      |-------|--------|
      | ~~\`deleted-guide.md\`~~ | ❌ Deleted |
      "
    `);
  });

  test("shows preview link when no guide changes", () => {
    const body = generateCommentBody(
      envVars,
      "https://app.hex.tech/preview/3",
      {
        upserted: [],
        removed: [],
      },
    );
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Context preview created. [Test changes in Hex](https://app.hex.tech/preview/3).
      "
    `);
  });

  test("shows preview link when guides is undefined", () => {
    const body = generateCommentBody(envVars, "https://app.hex.tech/preview/4");
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Context preview created. [Test changes in Hex](https://app.hex.tech/preview/4).
      "
    `);
  });

  test("renders warning column when a guide has warnings", () => {
    const body = generateCommentBody(
      envVars,
      "https://app.hex.tech/preview/5",
      {
        upserted: [
          {
            originalFilePath: "guides/warn.md",
            hexFilePath: "guides/warn.md",
            id: "id3",
            result: "updated",
            warnings: ["File is too large"],
          },
          {
            originalFilePath: "guides/ok.md",
            hexFilePath: "guides/ok.md",
            id: "id4",
            result: "created",
          },
        ],
        removed: [],
      },
    );
    expect(body).toContain("Warnings");
    expect(body).toContain("File is too large");
  });

  test("renders semantic models table", () => {
    const body = generateCommentBody(
      envVars,
      "https://app.hex.tech/preview/6",
      undefined,
      [
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
    );
    expect(body).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Context preview created. [Test changes in Hex](https://app.hex.tech/preview/6).

      **Semantic models**

      | Semantic model | Directory | Status |
      |----------------|-----------|--------|
      | Sales Model | semantic/sales | ✅ OK |
      | Broken Model | semantic/broken | ⚠️ 1 problem |
      "
    `);
  });

  test("renders guides and semantic models together", () => {
    const body = generateCommentBody(
      envVars,
      "https://app.hex.tech/preview/7",
      {
        upserted: [
          {
            originalFilePath: "guide.md",
            hexFilePath: "guide.md",
            id: "id1",
            result: "created",
          },
        ],
        removed: [],
      },
      [
        {
          dirPath: "semantic/sales",
          result: {
            semanticProject: { name: "Sales Model" },
            details: {},
          },
        },
      ],
    );
    expect(body).toContain("1 guide added");
    expect(body).toContain("Sales Model");
    expect(body).toContain("✅ OK");
  });
});
