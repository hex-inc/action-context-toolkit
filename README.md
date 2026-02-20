# Hex Context Toolkit

Upload external context to Hex. Supports uploading guide files

Usage:

```yml
name: Publish hex context

on:
  push:
    branches: [ 'master' ]

jobs:
  publish_hex_context:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v6
    - name: Upload guide files
      uses: hex/github-context-toolkit@v1
      with:
        config_file: hex_context.config.json
        token: ${{ secrets.HEX_API_TOKEN }} # Set this in your repository settings
        # optional configuration
        publish_guides: true # publish guides automatically (default true)
        delete_untracked_guides: true # removes guides from hex that were also deleted in your repository (default true)
        hex_url: https://app.hex.tech # by default, is https://app.hex.tech - change if you have a single tenant hosted stack
```

Which references a `hex_context.config.json` file

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
      "pattern": "guides/*.md" // matches md files in a guides folder
    },
    {
      "pattern": "**/*.md", // all .md files in your repo
      "transform": {
        "useFileStem": true // will rewrite the path to only include the file name (ignoring the folder path), e.g. folder1/folder2/guide.md -> guide.md
      }
    }
  ]
}
```
