import fs from "fs/promises";
import path from "path";

/**
 * Recursively yields all file paths under `dir`. Skips directories and symlinks
 * (only regular files are yielded). Paths are absolute if `dir` is absolute.
 */
export async function* getFilesInDir(dir: string, topLevelPath: string = dir): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* getFilesInDir(fullPath, topLevelPath);
    } else if (entry.isFile()) {
      yield path.relative(topLevelPath, fullPath);
    }
  }
}
