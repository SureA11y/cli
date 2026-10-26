# Changelog

All notable changes to this package are documented here. This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- `--sitemap <url-or-file>` scans the pages a `sitemap.xml` lists, after any named on the command line or in `--urls`: a URL or a local file, plain or gzipped, a sitemap index followed one level down, relative locations resolved against the sitemap, each page once. `--max-pages <n>` limits how many of its pages are scanned (default `50`), and a line on stderr says when it cut the list. A sitemap that can't be read, isn't one or lists no page is a usage error (exit `2`), as is `--max-pages` without `--sitemap`. See [`docs/CLI.md`](./docs/CLI.md#from-a-sitemap).
- With no failing rule, the summary ends by saying that is not a claim the page conforms, and names what a person still checks, as core's HTML report does. `--json` is unchanged. See [`docs/CLI.md`](./docs/CLI.md#what-a-run-with-no-failure-means).
- Several pages per run: `surea11y scan a.html b.html https://example.com/`, and `--urls <file>` for a list, one path or URL per line, with `#` comments. The summary has a section per page and a closing count, and the run fails when any page does. `--json` prints an array, `--sarif` one run with every page's findings, `--junit` one file whose suites and class names carry the page, and `--html` a report per page (`report.html`, `report-2.html`...). `--write-baseline` records the page of each entry, so `--baseline` matches each page against its own; a baseline written for one page keeps working. A page that can't be scanned stops the run with exit `2`, naming it, before anything is written. Before, every path after the first was silently ignored. See [`docs/CLI.md`](./docs/CLI.md#several-pages).
- `--fail-on-severity <critical|serious|moderate|minor>`: only a failing rule at that severity or above fails the run, with `--baseline` only a new one. Every failure is still reported, and the summary marks those below the level. See [`docs/CLI.md`](./docs/CLI.md#failing-only-on-serious-problems).
- `--browser` scans each page in headless Chromium through Playwright, which you install in your project: the page's scripts run, so client-rendered content is scanned, with a real layout. The engine in the page is the browser bundle of the same `@surea11y/core` as static scans. Every option works, packs and custom rules included, and a page whose Content Security Policy forbids inline scripts is still scanned. Without Playwright or its Chromium, `--browser` exits `2` saying what to install. Frames inside the page are not scanned yet. See [`docs/CLI.md`](./docs/CLI.md#in-a-real-browser).

- `--wait-for <selector>` (with `--browser`) waits until an element matching the selector is shown before scanning, for apps that fetch their content after the page loads; `--wait-timeout <ms>` changes the 30-second limit. An element that never shows stops the run with exit `2`, naming the selector, instead of scanning a page whose content never arrived. See [`docs/CLI.md`](./docs/CLI.md#waiting-for-content).
- `--width <px>` and `--color-scheme <light|dark>` (with `--browser`) scan at another viewport width, such as `320` for a phone-sized layout, or in the dark color scheme, so the rules that measure the layout judge the page as it is drawn there. (The engine has no reflow rule yet; `--width 320` gives the other rules that layout.) The summary names the viewport and scheme the scan used, as the result's `engine.environment` records them. See [`docs/CLI.md`](./docs/CLI.md#width-and-color-scheme).
- Several widths or color schemes, comma-separated (`--width 1280,320 --color-scheme light,dark`), scan each page in every combination, loading it once, and merge the scans into one result, as `.conditions()` does in the test bindings: a rule's worst outcome, each finding once with the combinations it was seen in (`seen in:` in the summary, `conditions` in `--json`), and each scan's environment in `conditionRuns`. Reports and baselines take the merged result, so one baseline covers every combination. See [`docs/CLI.md`](./docs/CLI.md#several-widths-and-color-schemes).
- `--wait-for`, `--wait-timeout`, `--width`, `--color-scheme`, `--no-hooks` and `--live-regions` without `--browser` are a usage error (exit `2`): a static scan has no layout, scripts or color scheme to apply them to.
- Requires `@surea11y/core` 1.14.
- `--browser` results carry the steps to answer each question (`howToCheck`), which the engine in the page leaves out: the CLI adds them in Node with core's `addHowToCheck`, a pack rule's own included, before printing `--json` or the summary and writing any report, as a static scan already has them. See [`docs/CLI.md`](./docs/CLI.md#in-a-real-browser).
- `--browser` installs core's internals and listener hooks before each page loads, with Playwright's `addInitScript`, in every frame. The scan then reads names and roles components set through `ElementInternals` in private fields, and judges click handlers added from script: a `role="button"` with a click listener and no key listener fails `click-handler-keyboard-operable`. `--live-regions` also installs the live-region hook, so `live-region-announcements` asks about a status region the page adds after loading with its text already in it, or shows and fills at once; it is opt-in, since on an app at rest it would mostly see live regions rendered with their first content. The summary names the hooks the page ran (`hooks: internals, listeners`), as `engine.environment.internalsHook`, `.listenerHook` and `.liveRegionHook` record them. `--no-hooks` scans without the internals and listener hooks. See [`docs/CLI.md`](./docs/CLI.md#hooks).
- The summary counts the questions by review group, `needs review: likely fail: 1   likely pass: 0   needs a person: 3`, as core's `reviewGroupOf` and the HTML report group them, and lists the first five likely failures, most severe first, each with its lean's reason and caution. See [`docs/CLI.md`](./docs/CLI.md#questions-that-likely-fail).
- `--fail-on-lean` also fails the run (exit `1`) on a question that likely fails, the findings of core's `leaningFailures()`, at or above `--fail-on-severity`'s level when given; `--lean-fail-wcag-only` counts only those of rules mapped to a WCAG criterion, leaving out the best-practice rules'. With it, `--junit` reports such a rule as a failing test (`leanFailAs: 'failure'`) and `--sarif` such a finding as an `error` (`leanFailAs: 'error'`). `--write-baseline` then records the likely failures too, as entries marked `lean: 'fail'`, and `--baseline` gates only on new ones, with their own known, new and stale counts in the summary and in `--json`'s `baseline.leanFail`. See [`docs/CLI.md`](./docs/CLI.md#gating-on-likely-failures).
- `--migrate-baseline <path>` rewrites a baseline under the reason codes core gives now, with core's `migrateBaselineEntries`, accepting nothing new: against the pages given, each entry against its own page's scan, or with none, only the moves that need no scan. It never fails the build, and can't be given with `--baseline` or `--write-baseline`. See [`docs/CLI.md`](./docs/CLI.md#upgrading-a-baseline).
- The HTML, SARIF and JUnit reports get the packs the scan ran, so a pack rule's questions carry its steps.

### Changed

- The summary lists failing rules most severe first, then by rule, rather than in the catalog's order. `--json` and the reports keep the engine's order.
- `--lean-fail-wcag-only` without `--fail-on-lean`, and two of `--baseline`, `--write-baseline` and `--migrate-baseline` together, are usage errors (exit `2`).

### What changes with `@surea11y/core` 1.14

The CLI passes your options to the engine, so these show in scans without a change of their own:

- **No WCAG criterion passes.** A criterion passes only when its rules check all it asks, and none does yet, so where all its rules pass it is `cantTell`, for a person to check the rest. The summary's criteria block has no `pass` line.
- **Questions lean, and say how to answer them.** A `cantTell` occurrence can carry a `lean` (`toward`, `why`, `caution`) and carries `howToCheck`. The HTML report groups the questions as likely fails, likely passes and those that need a person; SARIF results carry `properties.lean` and `properties.howToCheck`.
- **New rules and questions**, among them `live-region-announcements` (4.1.3), `click-handler-keyboard-operable` and `image-of-text` (1.4.5), so a page can show questions, and failures, it didn't before.
- **Some reason codes moved** (`img-alt-present`'s `DEFAULT` is now `TEXT_ALTERNATIVE_MISSING`, and some codes are split by cause). A baseline written by 1.13 still matches such findings under 1.14; rewrite it with `--migrate-baseline` before 1.15. Code Scanning alerts for those findings close and come back as new.

## 1.3.0

Requires `@surea11y/core` 1.12.0.

### Added

- The summary lists the WCAG criteria the scan reports, grouped by outcome (`fail`, then `cantTell`, then `pass`, and a count of `notApplicable`), under the target the scan used, and marks a criterion the scan only partly checked, such as 1.4.3 under `--rules contrast-computable`. `--compact` shows counts only. A closing line says a passing criterion is not a conformance claim. The exit code and the `--json`, `--sarif`, `--junit` and `--html` outputs are unchanged. See [`docs/CLI.md`](./docs/CLI.md#criteria-in-the-summary).
- `--include-mode <and|or>` decides how `--rules` and `--tags` combine when both are given: `and`, the default, runs the rules that match both, and `or` those that match either, so `--tags forms --rules contrast-computable --include-mode or` runs every forms rule and the contrast check. Under `and`, those two have no rule in common, and the scan's exit `2` now suggests `--include-mode or`. See [`docs/CLI.md`](./docs/CLI.md#combining---rules-and---tags).
- `--wcag-level` works without `--wcag`: it sets the level of the criteria the scan reports, without changing which rules run, so `--rules contrast-computable --wcag-level AA` reports 1.4.3 and not the AAA 1.4.6. The summary shows the level as `WCAG level reported`. See [`docs/CLI.md`](./docs/CLI.md#the-level-of-a-scan-that-names-checks).

### Changed

- `--wcag-level` without `--wcag` no longer exits `2`, and the level is accepted in any case (`aa`).

### What changes with `@surea11y/core` 1.12

The CLI passes your options to the engine, so these show in scans without a change of their own:

- **An empty heading fails a scan with no selection.** `empty-heading`, a best practice, now fails a heading with no accessible name, where it asked about one, so `surea11y scan page.html` exits `1` on a page with `<h2></h2>`. `--wcag`, `--tags` and `--profile` scans don't run it.
- **`--rules`, non-WCAG `--tags` and `--best-practices` scans report their criteria.** `rulesResults` holds the criteria those rules belong to, so `--junit` has a suite per criterion where it had only "Other checks", and `--html` shows a criterion whose other checks weren't selected as "Partly checked".
- **JUnit suite names are the same in every locale** (`WCAG 4.1.2`); the title moves to the suite's `title` property. A CI dashboard that tracks tests by suite name shows them once as new.
- **SARIF:** a passing contrast rule writes no `note`, `artifactLocation.uri` is always a valid URI (a path with a space is percent-encoded), and a finding in a shadow tree is located through its hosts.
- **Four rules count towards more criteria**, as W3C's ACT rules map them: `input-image-alt-present` adds 4.1.2, `aria-roles-valid` 1.3.1, `link-name-present` 2.4.9 (AAA), and `meta-refresh-timing-absent` 2.2.4 and 3.2.5 (AAA).
- **A rule id in another case** (`--rules IMG-ALT-PRESENT`) selects the rule, where it exited `2`.

## 1.2.0

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
