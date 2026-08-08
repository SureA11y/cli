# Releasing

Publishing is automated: pushing a `v*` tag runs [`.github/workflows/release.yml`](./.github/workflows/release.yml), which verifies the tag, runs the checks, smoke-tests the packed tarball, and publishes to npm with provenance. The steps below are what has to be true *before* that tag exists.

## Ordering constraint (read this first)

This package declares a dependency on `@surea11y/core`. **The engine version it declares must already be on the npm registry**, or the release is unusable — `npm ci` fails in CI, and anyone who installs the CLI gets a broken tree.

For 1.0.0 that means `@surea11y/core@1.4.0` publishes first. The release workflow enforces this (it resolves the declared range against the registry and fails with a clear error), but it's cheaper to get the order right than to burn a tag.

## Checklist

1. **Publish the engine.** `@surea11y/core` at the version matching this package's declared range must be live:

   ```sh
   npm view "@surea11y/core@$(node -p "require('./package.json').dependencies['@surea11y/core']")" version
   ```

   If that errors, stop and publish the engine first.

2. **Generate and commit the lockfile.** Both workflows use `npm ci`, which requires `package-lock.json`. Until step 1 is done the range doesn't resolve, so the lockfile can't be generated — this is the first moment it can be:

   ```sh
   rm -rf node_modules
   npm install
   git add package-lock.json && git commit -m "Add lockfile"
   ```

3. **Confirm the version and changelog.** `package.json` `version` and the top `CHANGELOG.md` heading must agree, and the tag will be that version prefixed with `v`.

4. **Run the checks locally.**

   ```sh
   npm run lint && npm run format:check && npm test
   ```

5. **Verify what actually ships.** `npm pack --dry-run` should list exactly `bin/surea11y.js`, `docs/CLI.md`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json` — nothing more, nothing missing.

6. **Tag and push.**

   ```sh
   git tag v1.0.0
   git push origin main --tags
   ```

7. **Verify the published package** by installing it the way a user would, from a clean directory:

   ```sh
   cd "$(mktemp -d)" && npm init -y >/dev/null && npm install @surea11y/cli
   ./node_modules/.bin/surea11y --version
   ```

## Local development before the engine is published

While `@surea11y/core@1.4.0` is unpublished, install it from a locally packed tarball. Keep `package.json` declaring the real range — never commit a `file:` dependency or a lockfile built from one.

```sh
(cd ../core && npm pack --pack-destination /tmp)
npm install /tmp/surea11y-core-1.4.0.tgz --no-save --no-package-lock
npm test
```
