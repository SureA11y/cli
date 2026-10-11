# Changelog

All notable changes to this package are documented here. This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `--pack <name-or-path>` loads a pack (rules, a standard or a checklist, and their profiles and messages) by package name, resolved from the working directory's project, or by path, and `--profile <name>` runs a conformance profile, a pack's included. Repeat `--pack` for several packs. The summary names both. See [`docs/CLI.md`](./docs/CLI.md#packs), which has a small policy pack to copy and a page to scan with it.
- `--wcag <version>` runs the rules for a WCAG conformance target (`2.0`, `2.1` or `2.2`), at `--wcag-level <level>` (`A`, `AA`, the default, or `AAA`) and below, by the level each criterion has in that version. `--best-practices` adds the rules that test no WCAG criterion, or runs only those on its own. `--rules` and `--tags` add to a target's rules, and `--exclude-rules` applies after. See [`docs/CLI.md`](./docs/CLI.md#wcag-target-and-best-practices).
- `--compact` asks the engine for a smaller result: a rule that passed or did not apply keeps only its `ruleId`, `outcome` and `type`. The summary, exit code, baseline and reports are unchanged; a small page's `--json` goes from about 359 KB to 136 KB. See [`docs/CLI.md`](./docs/CLI.md#compact-results).

### Changed

- A scan that would check less than asked exits `2`, as a scan that checked nothing does, and writes no report or baseline: a pack that can't be found or loaded, a pack the engine skips (`skippedPacks`, such as one whose `core` range leaves out the installed core), and a `--profile` that wasn't applied, either because no such profile exists or because `--rules`, `--tags` or `--wcag` chose the rules in its place. A rule selection whose parts cancel each other (`--rules a --exclude-rules a`, or `--rules` and `--tags` with no rule in common) ran no rule and passed; it exits `2` too. The error says which.
- An error caused by another (a file that can't be loaded, say) shows the cause's first line, without Node's require stack.
- Messages are those of `@surea11y/core` 1.11, reworded to say plainly what is wrong and what to do (`This <img> has no alt attribute.`). Rule IDs and baselines are unchanged; a script that matches the summary's text needs the new wording.
- The `--help` and README examples target a conformance level with `--wcag 2.2`.
- `--sarif` writes `partialFingerprints['surea11y/violation/v2']` in place of `v1`, as core 1.11 does. `primaryLocationLineHash`, which GitHub Code Scanning matches alerts on, is unchanged; a tool that read `v1` sees each finding as new once.
- The contrast rules read a font size given as a keyword (`xx-large`) or a `calc()` as a browser does, where jsdom gave them 0px, so large text is held to its own threshold.

### Requires

- `@surea11y/core` `^1.11.1` (was `^1.10.0`): packs, the WCAG target, the best practices and compact results are 1.11's.

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
