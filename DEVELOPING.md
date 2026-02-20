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
- uses: hex/action-context-toolkit@<ref>
```

## Publishing a new version

To create a new release:

- Ensure the latest code we want to release is merged to `main`
- Create a new github release with `main` as the target branch (this will create release notes based on changes) and create a new tag with the appropriate semver
- Update the v1 tag by running:
```
git tag v1 --force
git push --tags --force
```