![banner](docs/GuideSyncBanner.png)

# Hex Action context toolkit

An action to upload external sources of context to [Hex](https://hex.tech) for use in the Hex Agent for [self-serve analytics](https://learn.hex.tech/docs/explore-data/threads).

This action currently supports uploading guide files, unstructured context that helps agents interpret questions and respond appropriately. Read [the docs](https://learn.hex.tech/docs/agent-management/context-management/guides#when-to-use-the-guide-library) on how to best utilize guide files in your Hex workspace. You can learn more about the types of context you can add to Hex in our agent management [docs](https://learn.hex.tech/docs/agent-management/context-management/overview).

## Features

- Selectively upload documents in a larger repo
- Automatically publish and delete guides in Hex
- Preview and test guide changes on pull requests

## Usage

```yml
name: Publish Hex context

on:
  push:
    branches: ["main", "master"]
  pull_request:

permissions:
  contents: read
  pull-requests: write # Used to comment on pull_requests

jobs:
  publish_hex_context:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Upload guide files
        uses: hex-inc/action-context-toolkit@v2
        env:
          GITHUB_TOKEN: ${{ github.token }} # Used to comment on pull_requests
        with:
          config_file: hex_context.config.json
          token: ${{ secrets.HEX_API_TOKEN }} # Create a workspace token with the Guides write scope and set this in your repository settings
          # optional configuration
          publish: true # publish resources automatically on push (default true)
          hex_url: https://app.hex.tech # by default, this is https://app.hex.tech - change if you have a single tenant hosted stack
          comment_on_pr: true # To configure this, you must include a `GITHUB_TOKEN` in the env and ensure it has the pull-requests: write permission (see above).
```

Which references a `hex_context.config.json` file.

### Guides

You can define paths to your guides in the following ways:

- `path` - the path to a guide file
  - You can also specify `hexFilePath` if you want the path that shows up in Hex to be different to how your guides are structured in your repository
- `pattern` - matches a pattern - e.g. (`guides/*.md` - matches .md files in a guides folder or `guides/**/*.md` - matches .md files in the guides folder, including sub-directories)
  - You can also optionally specify a `transform` with `{ "stripFolders": true }` which will rewrite the path when uploaded to Hex to only include the file name (ignoring the folder path), e.g. folder1/folder2/guide.md -> guide.md

### Semantic projects

You can sync semantic project definitions from your repository. Each entry requires:

- `id` - the semantic project ID from your Hex workspace
- `path` - path to the directory containing the semantic model and view files

### Example config

```json
{
  "guides": [
    {
      "path": "path/to/my/guide.md"
    },
    {
      "path": "path_i_want_to_change.md",
      "hexFilePath": "path/that/will/show/up/in/hex.md"
    },
    {
      "pattern": "guides/*.md",
      "transform": {
        "stripFolders": true
      }
    },
    {
      "pattern": "guides/**/*.md"
    }
  ],
  "semanticProjects": [
    {
      "id": "<semantic-project-uuid>",
      "path": "path/to/dir"
    }
  ]
}
```

## Migrating from v1 to v2

The action now installs and uses the Hex CLI automatically, so no additional installation step is required.

The `publish_guides` and `delete_untracked_guides` inputs have been removed.

Publishing now always occurs on push events to your default branches (usually `main` or `master`). Existing workflows that omit `publish` or set it to `true` will continue to work unchanged. Setting `publish` to `false` is no longer supported.

Guide pruning is now always enabled. Existing workflows that omit `delete_untracked_guides` or set it to `true` continue to work unchanged. Setting `delete_untracked_guides` to `false` is no longer supported.
