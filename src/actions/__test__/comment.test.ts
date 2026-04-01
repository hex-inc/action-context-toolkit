import { HexClient } from "../../hex-client";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { GuideActionResult, ParsedConfig } from "../../types";
import { generateCommentBody } from "../comment";

const parsedConfig: ParsedConfig = {
  inputs: {
    commentOnPr: true,
    hexToken: "1234567890",
    hexUrl: "https://hex.tech",
    publishGuides: true,
    deleteUntrackedGuides: true,
    guides: [],
  },
  envVars: {
    baseUrl: "https://hex.tech",
    owner: "hex-inc",
    repo: "hex-inc",
    sha: "1234567890",
    branch: "main",
    token: "1234567890",
    type: "pull_request",
    pullRequestNumber: 123,
  },
  hexClient: new HexClient("https://example.com", "invalid-token"),
};

describe("generateCommentBody", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
  });

  test("should generate comment body with added, modified and deleted guides", () => {
    const guideActionResult: GuideActionResult = {
      type: "complete",
      orgId: "1234567890",
      contextVersionId: "1234567890",
      upsertedGuides: [
        {
          originalFilePath: "guide.md",
          hexFilePath: "guide.md",
          id: "1234567890",
          result: "created",
        },
        {
          originalFilePath: "another-guide.md",
          hexFilePath: "another-guide.md",
          id: "1234567890",
          result: "updated",
        },
      ],
      noops: [],
      warnings: [],
      deletedGuides: ["deleted-guide.md"],
    };
    const commentBody = generateCommentBody(parsedConfig, guideActionResult);
    expect(commentBody).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Success - 1 guide added, 1 guide updated, 1 guide deleted. [Test changes in Hex](https://example.com/1234567890/context-studio/workbench?preview=ask-preview&previewId=1234567890&createdAt=1774958400000).


      | Guide | Status | 
      |-------|--------|
      | [guide.md](https://hex.tech/hex-inc/hex-inc/blob/1234567890/guide.md) | ⬆️ Added | 
      | [another-guide.md](https://hex.tech/hex-inc/hex-inc/blob/1234567890/another-guide.md) | ✏️ Modified | 
      | ~~\`deleted-guide.md\`~~ | ❌ Deleted |

      "
    `);
  });

  test("should generate comment body with deleted only guides", () => {
    const guideActionResult: GuideActionResult = {
      type: "complete",
      orgId: "1234567890",
      contextVersionId: "1234567890",
      upsertedGuides: [],
      noops: [],
      warnings: [],
      deletedGuides: ["deleted-guide.md"],
    };
    const commentBody = generateCommentBody(parsedConfig, guideActionResult);
    expect(commentBody).toMatchInlineSnapshot(`
      "<!-- hex-context-toolkit-comment-37a4e83 do not modify / remove this comment -->
      🟢 Success - 1 guide deleted. [Test changes in Hex](https://example.com/1234567890/context-studio/workbench?preview=ask-preview&previewId=1234567890&createdAt=1774958400000).


      | Guide | Status | 
      |-------|--------|
      | ~~\`deleted-guide.md\`~~ | ❌ Deleted |

      "
    `);
  });

  test("should not generate comment body if there are no guides", () => {
    const guideActionResult: GuideActionResult = {
      type: "complete",
      orgId: "1234567890",
      contextVersionId: "1234567890",
      upsertedGuides: [],
      noops: [
        {
          originalFilePath: "guide.md",
          hexFilePath: "guide.md",
        },
        {
          originalFilePath: "another-guide.md",
          hexFilePath: "another-guide.md",
        },
      ],
      warnings: [],
      deletedGuides: [],
    };

    const commentBody = generateCommentBody(parsedConfig, guideActionResult);
    expect(commentBody).toBeNull();
  });
});
