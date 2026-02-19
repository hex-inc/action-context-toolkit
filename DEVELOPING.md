# Developing locally

`npm install`

Note that you must run `npm run build` + check in changes to `dist/index.js`.

Scripts:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run format`

## Testing the action

To test this action e2e, you can reference this action in your own github action workflow, and point it to a specific commit hash. e.g.

```yml
- uses: hex/github-context-toolkit@<commit_hash>
```

## Publishing a new version

Tagging a new release - this section is in progress
