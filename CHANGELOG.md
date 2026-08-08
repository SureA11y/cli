# Changelog

All notable changes to this package are documented here. This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0

Initial release as a standalone package.

The CLI previously shipped inside `@surea11y/core` as `bin/core.js`. It now lives in its own package, `surea11y`, so that `@surea11y/core` can ship with **zero runtime dependencies** — `jsdom` was only ever needed to parse HTML for the CLI, never by the engine itself. Using the library directly against a DOM you already have no longer pulls `jsdom` into your tree.

### For existing `@surea11y/core` CLI users

- Install `surea11y` instead of relying on `@surea11y/core`'s bin:
  ```sh
  npx surea11y scan ./index.html     # was: npx @surea11y/core scan ./index.html
  ```
- Every flag, output format, and exit code is unchanged. `--json`, `--locale`, `--rules`, `--exclude-rules`, `--tags`, `--context`, `--custom-rules`, `--write-baseline`, `--baseline`, `--html`, `--sarif` all behave exactly as before, and existing baseline files remain valid.
- SARIF output now reports the CLI's own version in `runs[].tool.driver.version`, and `informationUri` points at this repository rather than the engine's.
- Licensed MIT, matching the other `@surea11y` wrapper packages. The engine remains MPL-2.0.

### Requires

- Node.js `^20.19.0 || ^22.13.0 || >=24.0.0`
- `@surea11y/core` `^1.4.0` (installed automatically)
