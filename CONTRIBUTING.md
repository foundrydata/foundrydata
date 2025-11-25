# Contributing to FoundryData

Contributions are welcome — issues, small fixes, and feature PRs all help improve the project. This document focuses on the release process for maintainers so that versions, changelog, and published packages stay in sync.

---

## Development workflow

- Use Node.js 20+.
- Install dependencies from the repository root:

  ```bash
  npm install
  ```

- Before opening a PR, run the standard validation pipeline:

  ```bash
  npm run task-ready
  # equivalent to: lint + typecheck + build + test
  ```

---

## Release process (maintainers)

FoundryData uses Semantic Versioning (MAJOR.MINOR.PATCH) and a small release helper wired to `npm run release`. Releases are prepared locally, then tagged and published to npm.

### 1. Pick the version

- Decide on the next version according to SemVer:
  - PATCH (x.y.z → x.y.(z+1)): bug fixes and internal improvements.
  - MINOR (x.y.z → x.(y+1).0): backward‑compatible features or notable behavior improvements.
  - MAJOR ((x).y.z → (x+1).0.0): breaking changes in the public API/behavior.

You will pass this version as `--version` to the release helper.

### 2. Ensure the tree is clean and green

From the repository root:

```bash
npm run task-ready
```

This runs linting, type checking, build, and tests across all workspaces. Fix any failures before proceeding. The release helper also requires a clean Git working tree (no uncommitted changes) unless you run in `--dry-run` mode.

### 3. Preview the release (dry run)

Use the release helper in dry‑run mode to see what would change without touching any files:

```bash
npm run release -- --version <VERSION> \
  --note "Short summary of the release" \
  --dry-run
```

You can repeat `--note` multiple times to add several bullets. Dry‑run mode prints the planned manifest updates and changelog heading without writing to disk or running npm commands.

### 4. Prepare the release

When the dry run looks correct, run the real preparation:

```bash
npm run release -- --version <VERSION> \
  --note "Core: <change>" \
  --note "CLI: <change>"
```

This will:

- Align the `version` field in:
  - `package.json` (monorepo root)
  - `packages/core/package.json`
  - `packages/shared/package.json`
  - `packages/cli/package.json`
- Update internal dependency ranges so workspace packages depend on each other via `^<VERSION>`.
- Insert a new entry for `<VERSION>` into `docs/CHANGELOG.md` under the `## [Unreleased]` section.
- Run `npm install --package-lock-only` to refresh `package-lock.json`.
- Run `npm run build` (unless you pass `--skip-build`).

Review the resulting Git diff (versions, changelog, lockfile) and tweak release notes if necessary by re‑running the helper with the same version and updated `--note` values.

### 5. Commit and tag

Once you are satisfied with the diff:

```bash
git add .
git commit -m "chore: release v<VERSION>"
git tag v<VERSION>
git push origin main --tags
```

Adapt the branch name (`main`) if your default branch differs.

### 6. Publish packages to npm

Publishing is done from each package directory. Ensure you are logged in (`npm login`) and have the correct permissions, then from the repository root:

```bash
cd packages/shared   && npm publish --access public
cd ../core           && npm publish --access public
cd ../cli            && npm publish --access public
```

If/when `json-schema-reporter` becomes part of the public surface, you can publish it as well:

```bash
cd ../reporter && npm publish --access public
```

---

## CI considerations

- CI should run `npm run task-ready` on pull requests and on the default branch.
- You can optionally add a CI job that runs the release helper in dry‑run mode for a known version to catch regressions in the tooling itself, but the actual release (version bump, changelog edit, tagging, and npm publish) is intended to be run by a maintainer from a local clone.***
