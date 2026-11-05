# Releasing

Publishing is automated: pushing a `v*` tag runs [`.github/workflows/release.yml`](./.github/workflows/release.yml), which verifies the tag, runs the checks, smoke-tests the packed tarball, and publishes to npm with provenance. The steps below are what has to be true *before* that tag exists.

## One-time setup: npm trusted publishing

The release workflow authenticates to npm via **trusted publishing** (OIDC) rather than a token — that's why it requests `id-token: write` and sets no `NODE_AUTH_TOKEN`. Trusted publishing is configured **per package** on npmjs.com, and it is not inherited from the org or from `@surea11y/core`.

On npmjs.com, under this package's *Settings → Trusted Publisher*, add:

| Field | Value |
|---|---|
| Provider | GitHub Actions |
| Organization / repository | `SureA11y/cli` |
| Workflow filename | `release.yml` |

**Symptom when it's missing** — the publish step fails with:

```
npm error code E404
npm error 404 Not Found - PUT https://registry.npmjs.org/@surea11y%2fcli
npm error 404  ... could not be found or you do not have permission to access it.
```

That `E404` on a `PUT` means *unauthenticated*, not *already published* — publishing over an existing version gives `E403` instead. This is exactly how the 1.0.0 release failed: the workflow was copied from `@surea11y/core`, whose trusted publisher was already configured, so the tag ran green everywhere except the final step and 1.0.0 ended up published by hand, without provenance.

Provenance cannot be added to a version after the fact, and npm will not let you republish one. If a version ships without it, the fix is to configure the publisher and let the *next* version go out through CI.

Any future package split out of the engine needs this same step before its first tag.

## Ordering constraint (read this first)

This package declares dependencies on `@surea11y/core` and `@surea11y/binding-base` (which merges scans under several widths and color schemes). **The versions it declares must already be on the npm registry**, or the release is unusable — `npm ci` fails in CI, and anyone who installs the CLI gets a broken tree.

The release workflow enforces this — it resolves both declared ranges against the registry and fails with a clear error — but it's cheaper to get the order right than to burn a tag. (For 1.0.0 this meant `@surea11y/core@1.4.0` had to publish first.)

## Checklist

1. **Publish the engine and binding-base.** `@surea11y/core` at the version matching this package's declared range must be live:

   ```sh
   npm view "@surea11y/core@$(node -p "require('./package.json').dependencies['@surea11y/core']")" version
   ```

   If that errors, stop and publish the engine first. Do the same for `@surea11y/binding-base`, which must be live at its declared range too:

   ```sh
   npm view "@surea11y/binding-base@$(node -p "require('./package.json').dependencies['@surea11y/binding-base']")" version
   ```

2. **Refresh and commit the lockfile.** Both workflows use `npm ci`, which requires an up-to-date `package-lock.json`. Regenerate it against the registry so it pins the engine version you just verified:

   ```sh
   rm -rf node_modules
   npm install
   git add package-lock.json && git commit -m "Update lockfile"
   ```

   If the range doesn't resolve yet, step 1 isn't done — the lockfile cannot be generated before the engine exists.

3. **Confirm the version and changelog.** `package.json` `version` and the top `CHANGELOG.md` heading must agree, and the tag will be that version prefixed with `v`.

4. **Run the checks locally.**

   ```sh
   npm run lint && npm run format:check && npm test
   ```

5. **Verify what actually ships.** `npm pack --dry-run` should list exactly `bin/surea11y.js`, `docs/CLI.md`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json` — nothing more, nothing missing.

6. **Tag and push.** The tag must match `package.json` exactly, so derive it rather than typing it:

   ```sh
   git tag "v$(node -p "require('./package.json').version")"
   git push origin main --tags
   ```

7. **Watch the release run.** It publishes only on a tag, and the publish step is the last one — a green tag run with a red final step means the package did *not* ship. See the trusted-publishing section above for the `E404` case.

   ```sh
   gh run list --limit 3
   ```

8. **Verify the published package** by installing it the way a user would, from a clean directory:

   ```sh
   cd "$(mktemp -d)" && npm init -y >/dev/null && npm install @surea11y/cli
   ./node_modules/.bin/surea11y --version
   ```

9. **Confirm provenance landed.** Empty output means the version published without an attestation — CI didn't do the publishing:

   ```sh
   npm view "@surea11y/cli@$(node -p "require('./package.json').version")" dist.attestations
   ```

## The `surea11y` package

[`surea11y`](https://github.com/SureA11y/surea11y) is what makes `npx surea11y` work: a small package whose `bin.js` requires `@surea11y/cli/bin/surea11y.js`. It has no tags or GitHub releases, and it is published by hand from its own repository, so nothing here releases it.

It doesn't need a release for each one of this package. Its `^` range gives a fresh install the newest 1.x of this package, so its version number can fall behind this one. Release it when:

- **This package has a new major version.** The range doesn't reach it, so `npx surea11y` stays on the old major with nothing said.
- **`bin/surea11y.js` moves, or an `exports` map hides it.** Either breaks `npx surea11y`, and within 1.x it reaches users as soon as this package publishes, so treat it as a breaking change: a major version, with `surea11y` released after it.
- **`engines` changes.** The two should declare the same Node versions.
- **Its README is out of date.** The npm page only changes on a publish.

## Developing against an unpublished engine

Normally `npm ci` is all you need. But when this package has to be tested against a version of `@surea11y/core` that isn't on the registry yet — the situation for every future split or engine change that lands here first — install the engine from a locally packed tarball:

```sh
(cd ../core && npm pack --pack-destination /tmp)
npm install /tmp/surea11y-core-<version>.tgz --no-save --no-package-lock
npm test
```

`--no-save --no-package-lock` is the point: `package.json` keeps declaring the real semver range, and no lockfile is written from a machine-specific path. Never commit a `file:` dependency or a lockfile built from one.
