# Changelog

All notable changes to this package are documented here. This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `--pack <name-or-path>` loads a pack (rules, a standard or a checklist, and their profiles and messages) by package name or path, and `--profile <name>` runs a conformance profile, a pack's included. The summary names both. A pack that can't be found, loaded or run, packs the installed core ignores, and a profile that isn't applied exit `2`. Packs need `@surea11y/core` 1.11 or later. See [`docs/CLI.md`](./docs/CLI.md#packs).

### Changed

- An error caused by another (a file that can't be loaded, say) shows the cause's first line, without Node's require stack.

## 1.1.0

### Added

- `--junit <path>` writes a JUnit XML report, for the test views of GitLab, Azure DevOps, Jenkins and CircleCI, from the same scan as the other outputs. With `--baseline`, failures already recorded in the baseline are reported as skipped tests. It never changes the exit code. See [`docs/CLI.md`](./docs/CLI.md#junit-report).
- `--help` and the scan summary name the `@surea11y/core` release that ran the scan. `--version` still prints only the CLI's version.

### Changed

- A scan that would check nothing, or less than asked, exits `2` instead of passing:
  - a `--rules` or `--tags` list in which nothing names a known rule or tag (such a list used to select no rule, and the run exited `0`);
  - a `--context` selector that matches no element (the engine used to scan the whole page instead) or isn't valid CSS;
  - a `--custom-rules` rule the engine skips, such as one whose `id` another custom rule already has or whose `meta` fails validation (it used to be dropped with only a warning).

  The error names the flag, and no report or baseline is written.

### Requires

- `@surea11y/core` `^1.10.0` (was `^1.4.0`): the checks above rely on what 1.10.0 reports.

## 1.0.0

Initial release as a standalone package.

The CLI previously shipped inside `@surea11y/core` as `bin/core.js`. It now lives in its own package, `@surea11y/cli`, so that `@surea11y/core` can ship with **zero runtime dependencies** — `jsdom` was only ever needed to parse HTML for the CLI, never by the engine itself. Using the library directly against a DOM you already have no longer pulls `jsdom` into your tree.

### For existing `@surea11y/core` CLI users

- Install `@surea11y/cli` instead of relying on `@surea11y/core`'s bin. The command itself is still `surea11y`:
  ```sh
  npx @surea11y/cli scan ./index.html     # was: npx @surea11y/core scan ./index.html
  ```
- Every flag, output format, and exit code is unchanged. `--json`, `--locale`, `--rules`, `--exclude-rules`, `--tags`, `--context`, `--custom-rules`, `--write-baseline`, `--baseline`, `--html`, `--sarif` all behave exactly as before, and existing baseline files remain valid.
- SARIF output now reports the CLI's own version in `runs[].tool.driver.version`, and `informationUri` points at this repository rather than the engine's.
- Licensed MIT, matching the other `@surea11y` wrapper packages. The engine remains MPL-2.0.

### Requires

- Node.js `^20.19.0 || ^22.13.0 || >=24.0.0`
- `@surea11y/core` `^1.4.0` (installed automatically)
