import { describe, test, expect, vi, afterEach } from "vitest";
import * as fileUtils from "../../fileUtils";
import { getGuidesFromLocal } from "../guides";
vi.mock("../../fileUtils");

const mockGetFilesInDir = (files: string[]) => {
  vi.mocked(fileUtils.getFilesInDir).mockImplementation(
    async function* (): AsyncGenerator<string> {
      for (const file of files) {
        yield file;
      }
    },
  );
};

describe("getGuidesFromLocal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("should get guides from local", async () => {
    mockGetFilesInDir(["guides/guide.md", "another/abc.md", "other.js"]);
    const guides = await getGuidesFromLocal({
      inputs: {
        guides: [
          {
            path: "guides/guide.md",
            hexFilePath: "guides/guide.md",
          },
          {
            path: "another/abc.md",
            hexFilePath: "custom_path.md",
          },
        ],
      },
    });
    expect(guides.matchingGuides.length).toBe(2);
    expect(guides.matchingGuides).toMatchInlineSnapshot(`
      [
        {
          "hexFilePath": "guides/guide.md",
          "originalFilePath": "guides/guide.md",
        },
        {
          "hexFilePath": "custom_path.md",
          "originalFilePath": "another/abc.md",
        },
      ]
    `);
  });

  test("should get guides from local with pattern", async () => {
    mockGetFilesInDir([
      "guides/users.md",
      "guides/arr.md",
      "another_folder/abc.md",
      "another_folder/def/guide.md",
      "another_folder/def/something.md",
      "not_guide/abc.md",
    ]);
    const guides = await getGuidesFromLocal({
      inputs: {
        guides: [
          { pattern: "guides/*.md" },
          {
            pattern: "another_folder/**/*.md",
            transform: { stripFolders: true },
          },
        ],
      },
    });
    expect(guides.matchingGuides.length).toBe(5);
    expect(guides.matchingGuides).toMatchInlineSnapshot(`
      [
        {
          "hexFilePath": "guides/users.md",
          "originalFilePath": "guides/users.md",
        },
        {
          "hexFilePath": "guides/arr.md",
          "originalFilePath": "guides/arr.md",
        },
        {
          "hexFilePath": "abc.md",
          "originalFilePath": "another_folder/abc.md",
        },
        {
          "hexFilePath": "guide.md",
          "originalFilePath": "another_folder/def/guide.md",
        },
        {
          "hexFilePath": "something.md",
          "originalFilePath": "another_folder/def/something.md",
        },
      ]
    `);
  });

  test("should fail if specific paths to guides are not found", async () => {
    mockGetFilesInDir(["guides/guide.md", "another/abc.md", "other.js"]);
    const guides = await getGuidesFromLocal({
      inputs: {
        guides: [
          { path: "guide-that-is-missing.md", hexFilePath: "guides/guide.md" },
        ],
      },
    });
    expect(guides.missingGuides.length).toBe(1);
    expect(guides.missingGuides).toMatchInlineSnapshot(`
      [
        "guide-that-is-missing.md",
      ]
    `);
  });
});
