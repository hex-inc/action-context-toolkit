import { describe, test, expect, vi, afterEach } from "vitest";
import * as fileUtils from "../../fileUtils";
import { getGuidesFromLocal } from "../guides";
import fs from "fs/promises";

vi.mock("../../fileUtils");
vi.mock("fs/promises");

const mockGetFilesInDir = (files: string[]) => {
  vi.mocked(fileUtils.getFilesInDir).mockImplementation(
    async function* (): AsyncGenerator<string> {
      for (const file of files) {
        yield file;
      }
    },
  );

  vi.mocked(fs.readFile).mockImplementation(async (path: any): Promise<any> => {
    return `Content of ${path}`;
  });
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
    expect(guides.length).toBe(2);
    expect(guides).toMatchInlineSnapshot(`
      [
        {
          "content": "Content of guides/guide.md",
          "hexFilePath": "guides/guide.md",
          "path": "guides/guide.md",
        },
        {
          "content": "Content of another/abc.md",
          "hexFilePath": "custom_path.md",
          "path": "another/abc.md",
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
    expect(guides.length).toBe(5);
    expect(guides).toMatchInlineSnapshot(`
      [
        {
          "content": "Content of guides/users.md",
          "hexFilePath": "guides/users.md",
          "path": "guides/users.md",
        },
        {
          "content": "Content of guides/arr.md",
          "hexFilePath": "guides/arr.md",
          "path": "guides/arr.md",
        },
        {
          "content": "Content of another_folder/abc.md",
          "hexFilePath": "abc.md",
          "path": "another_folder/abc.md",
        },
        {
          "content": "Content of another_folder/def/guide.md",
          "hexFilePath": "guide.md",
          "path": "another_folder/def/guide.md",
        },
        {
          "content": "Content of another_folder/def/something.md",
          "hexFilePath": "something.md",
          "path": "another_folder/def/something.md",
        },
      ]
    `);
  });
});
