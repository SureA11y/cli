# CLI

`@surea11y/cli` provides `surea11y`, a small command-line scanner (`bin/surea11y.js`) for ad hoc scans and CI, on top of the [`@surea11y/core`](https://github.com/SureA11y/core) library API described in [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md).

```sh
npx @surea11y/cli scan ./index.html
npx @surea11y/cli scan https://example.com/
npx @surea11y/cli scan ./index.html ./about.html --urls more-pages.txt
npx @surea11y/cli scan https://app.example.com/ --browser
npx @surea11y/cli procedures --wcag-level AA --checklist -o audit.html
```

Or install it once:

```sh
npm install -g @surea11y/cli          # globally
npm install --save-dev @surea11y/cli  # or per-project, for CI
```

## What it can and can't scan

By default the CLI reads **static HTML** — a local file, or the raw response of an HTTP(S) GET request — and never executes page JavaScript. That means client-rendered content (anything your framework injects after page load) won't be captured, and geometry-dependent rules like `target-size-minimum` will report `notApplicable` (no real CSS layout — see [`LIMITATIONS.md`](https://github.com/SureA11y/core/blob/main/docs/LIMITATIONS.md)). It is the fast path for static and server-rendered pages.

With `--browser`, it opens each page in headless Chromium instead, runs its scripts, and scans what renders, with a real layout. See [In a real browser](#in-a-real-browser) below.

## Options

| Flag | Meaning |
|---|---|
| `<file-or-url>...` | The pages to scan: one or more local files or HTTP(S) URLs. See [Several pages](#several-pages) below. |
| `--urls <file>` | Also scan each path or URL listed in `<file>`, one per line; blank lines and `#` comments are skipped. |
| `--sitemap <url-or-file>` | Also scan the pages a `sitemap.xml` lists, following a sitemap index. See [From a sitemap](#from-a-sitemap) below. |
| `--max-pages <n>` | With `--sitemap`: scan at most `<n>` of its pages (default `50`). |
| `--browser` | Scan each page in headless Chromium, running its scripts, through Playwright, which you install. See [In a real browser](#in-a-real-browser) below. |
| `--wait-for <selector>` | With `--browser`: wait until an element matching `<selector>` is on the page and shown, then scan. See [Waiting for content](#waiting-for-content) below. |
| `--wait-timeout <ms>` | With `--wait-for`: how long to wait, in milliseconds (default `30000`). |
| `--width <px>` | With `--browser`: the viewport width (default `1280`; `320` lays the page out at the width WCAG 1.4.10 Reflow uses). Several, comma-separated (`1280,320`), scan the page at each. See [Width and color scheme](#width-and-color-scheme) below. |
| `--color-scheme <light\|dark>` | With `--browser`: emulate the user's light or dark color scheme (`prefers-color-scheme`); `light,dark` scans in both. |
| `--no-hooks` | With `--browser`: don't install core's internals and listener hooks before the page's scripts, which a browser scan does by default. See [Hooks](#hooks) below. |
| `--live-regions` | With `--browser`: also install core's live-region hook before the page's scripts, so status messages the page shows after it loads are checked (`@surea11y/core` 1.14.0). See [Hooks](#hooks) below. |
| `--fail-on-severity <severity>` | Exit `1` only for a failing rule of this severity or above: `critical`, `serious`, `moderate` or `minor`. Every failure is still reported. See [Failing only on serious problems](#failing-only-on-serious-problems) below. |
| `--fail-on-lean` | Also exit `1` for a question that likely fails: a `cantTell` finding whose lean points to fail. `--sarif` and `--junit` then report such findings as errors and failures. See [Questions that likely fail](#questions-that-likely-fail) below. |
| `--lean-fail-wcag-only` | With `--fail-on-lean`: count only the likely failures of rules mapped to a WCAG criterion in the scan's target, leaving out the best-practice rules'. |
| `--json` | Print the raw result object (see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md)) instead of a human-readable summary; for several pages, an array of them. |
| `--locale <locale>` | Output text locale (default `en`) — see [`I18N.md`](https://github.com/SureA11y/core/blob/main/docs/I18N.md). |
| `--rules <ids>` | Comma-separated rule IDs — only run these. |
| `--exclude-rules <ids>` | Comma-separated rule IDs — never run these. |
| `--tags <tags>` | Comma-separated tags — e.g. `--tags wcag2a,wcag2aa` for the WCAG 2.0 A and AA criteria, or `--tags best-practice` (see [`WCAG_CONFORMANCE.md`](https://github.com/SureA11y/core/blob/main/docs/WCAG_CONFORMANCE.md)). |
| `--include-mode <mode>` | How `--rules` and `--tags` combine when both are given: `and` (the default) runs only the rules that match both, `or` those that match either. See [Combining --rules and --tags](#combining---rules-and---tags) below. |
| `--wcag <version>` | Run the rules for a WCAG conformance target: `2.0`, `2.1` or `2.2`, at `--wcag-level` and below. See [WCAG target and best practices](#wcag-target-and-best-practices) below. |
| `--wcag-level <level>` | The `--wcag` target's level: `A`, `AA` (the default) or `AAA`. Without `--wcag`, the level of the criteria the scan reports, without changing which rules run. See [The level of a scan that names checks](#the-level-of-a-scan-that-names-checks) below. |
| `--best-practices` | Also run the best-practice rules, which test no WCAG criterion (`region`, `heading-order`, ...). On its own, it runs only those. |
| `--context <selector>` | Scope the scan to one CSS-selected subtree. A selector that matches no element, or that isn't valid CSS, exits `2`: nothing would be scanned. |
| `--custom-rules <path>` | Load runtime custom rules from a local JS file. Repeatable. See [Custom rules](#custom-rules) below. |
| `--pack <name-or-path>` | Load a pack: rules, a standard or a checklist, and their profiles, from a package installed in the project or a local file. Repeatable. See [Packs](#packs) below. |
| `--profile <name>` | Run a conformance profile, such as `en301549-v4.1.1` or a pack's own. A profile that isn't applied exits `2`. See [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md#conformance-profiles). |
| `--write-baseline <path>` | Write every current `fail` occurrence to `<path>`, and with `--fail-on-lean` every likely failure too; never fails the build. See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md). |
| `--baseline <path>` | Gate only on occurrences not already recorded in `<path>` (with `--fail-on-lean`, likely failures too). See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md). |
| `--migrate-baseline <path>` | Rewrite the baseline at `<path>` under the reason codes core gives now, against the pages given, or, with none, only the moves that need no scan; never fails the build and accepts nothing new. See [Upgrading a baseline](#upgrading-a-baseline) below. |
| `--html <path>` | Write a self-contained, browsable HTML report to `<path>`; for several pages, one each: `<path>`, then `<name>-2.<ext>`, `<name>-3.<ext>`... See [`REPORT.md`](https://github.com/SureA11y/core/blob/main/docs/REPORT.md). |
| `--sarif <path>` | Write a SARIF 2.1.0 report to `<path>` (e.g. for GitHub Code Scanning). See [`SARIF.md`](https://github.com/SureA11y/core/blob/main/docs/SARIF.md). |
| `--junit <path>` | Write a JUnit XML report to `<path>` (for the test views of GitLab, Azure DevOps, Jenkins, CircleCI). See [JUnit report](#junit-report) below. |
| `--manual-checks <path>` | Write the worksheet of what the scan leaves to a person: the checks no rule decides in full, for the standard scanned. See [Manual checks](#manual-checks) below. |
| `--compact` | Keep each `pass` and `notApplicable` result to its rule, outcome and type: a smaller `--json`, and the same reports. See [Compact results](#compact-results) below. |
| `-h`, `--help` | Show usage. |
| `-v`, `--version` | Show the installed version of the CLI. `--help` and the summary also name the `@surea11y/core` release that ran the scan, and `--json` has it as `engine.version`. |

These map directly onto `engineOptions`/`runOnly` (see [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md)) — `--rules`/`--exclude-rules` become `engineOptions.rules.include`/`.exclude`, `--tags` becomes `engineOptions.tags.include`, `--profile` and `--pack` become `engineOptions.profile` and `.packs`, and `--compact` becomes `engineOptions.output.detail: 'findings'`, `--include-mode` becomes `engineOptions.includeMode`, and `--wcag-level` without `--wcag` becomes `engineOptions.wcagLevel`. `--wcag` and `--best-practices` become `runOnly.wcag` and `runOnly.bestPractices`; beside either of them, `--rules`, `--exclude-rules`, `--tags` and `--include-mode` go into `runOnly` too (`includeRuleIds`, `excludeRuleIds`, `tags`, `includeMode`), since the engine reads its rule and tag lists from one place or the other.

A `--rules` or `--tags` list in which nothing names a known rule or tag exits `2` (for example `--tags wcag2.2aa`, where the tag is `wcag22aa`): run as given, it would check nothing and pass. An unknown entry beside known ones is ignored with a warning on stderr, as is an unknown `--exclude-rules` entry. A selection whose parts all name rules but cancel each other, an include that `--exclude-rules` takes away or `--rules` and `--tags` with no rule in common, runs no rule and exits `2` too.

## WCAG target and best practices

`--wcag` selects rules by conformance target, by the level each criterion has in that version:

```sh
surea11y scan ./dist/index.html --wcag 2.2                    # WCAG 2.2, Level A and AA
surea11y scan ./dist/index.html --wcag 2.1 --wcag-level A     # WCAG 2.1, Level A
surea11y scan ./dist/index.html --wcag 2.2 --best-practices   # and the best practices
```

4.1.1 Parsing, which WCAG 2.2 removed, is part of a `2.1` target and not of a `2.2` one. `--best-practices` adds the rules that name no WCAG criterion; a finding from one is good practice, not a WCAG failure, and no WCAG rollup counts it. `--rules` and `--tags` add to a target's rules, and `--exclude-rules` applies after. Beside `--profile`, `--best-practices` adds its rules and the profile still applies; `--wcag`, `--rules` and `--tags` choose the rules in a profile's place, so `--profile` with any of them exits `2`. A version other than `2.0`, `2.1` or `2.2` or a level other than `A`, `AA` or `AAA` exits `2`. `--wcag-level` on its own sets the level of the criteria reported; see [The level of a scan that names checks](#the-level-of-a-scan-that-names-checks).

`--tags` still selects by the tags rules carry, as before; see [`WCAG_CONFORMANCE.md`](https://github.com/SureA11y/core/blob/main/docs/WCAG_CONFORMANCE.md) for the tag sets.

## Combining --rules and --tags

Given both, `--rules` and `--tags` select the rules that match both by default, which is right for narrowing a tag set down to a few of its rules. To say "this area, plus these checks" instead, pass `--include-mode or`, which runs the rules that match either. A team that owns a design system's form components, say, can check every rule about forms and the contrast check too, in one CI step:

```sh
surea11y scan ./dist/form.html --tags forms --rules contrast-computable --include-mode or
```

Without `--include-mode or`, that scan runs no rule, since `contrast-computable` isn't tagged `forms`, and it exits `2` with a hint to use it: a scan of no rules would otherwise pass. The same holds for a WCAG level tag beside a best practice: `--tags wcag2a --rules region`. It works beside `--wcag` and `--best-practices` too. A mode other than `and` or `or` exits `2`. A `--wcag` target doesn't need it: its rules are always added to what `--rules` and `--tags` select.

## The level of a scan that names checks

A scan that names checks rather than a target reports the WCAG criteria those checks belong to, at every level. `contrast-computable` checks 1.4.3 (AA) and 1.4.6 (AAA), so a scan of it alone reports both, and a site that meets AA can show a failing AAA criterion it never aimed for. Without `--wcag`, `--wcag-level` gives the level of the criteria reported, without changing which rules run:

```sh
surea11y scan ./dist/index.html --rules contrast-computable --wcag-level AA
```

This reports 1.4.3 alone; `contrast-computable` still runs and reports. The summary says `WCAG level reported: AA`, and `--json` has it as `engine.wcagLevel`. It applies to any scan without `--wcag`: on a full scan, a `--tags` selection or a `--profile`, criteria above the level are left out of the report while their checks still run. Any case is accepted (`aa`); a level other than `A`, `AA` or `AAA` exits `2`. `--junit` and `--sarif` follow the level too: the scan above writes a `WCAG 1.4.3` JUnit suite and no `WCAG 1.4.6`. Needs `@surea11y/core` 1.12.0 or later.

## Criteria in the summary

After the rules, the summary lists the WCAG criteria the scan reports, grouped by outcome, `fail` first:

```
criteria (WCAG 2.2 AA):
  fail       1.1.1 Non-text content: text alternatives
  cantTell   1.4.3 Contrast: minimum (partly checked: 1 of 2 checks not selected); 2.4.2 Page titled
  notApplicable: 15
  A criterion that passes here means the checks that ran found nothing in it, not that the page conforms.
```

The heading names the target from the scan (`--wcag`, `--wcag-level`, or what a profile implies). A criterion is *partly checked* when the scan selected some of its checks out, as `--rules contrast-computable` does for 1.4.3, whose other check is `contrast-minimum`: its outcome covers only the checks that ran. `notApplicable` criteria are counted, not listed, and `--compact` shows the whole block as counts. With `@surea11y/core` 1.14, a criterion passes only when its rules check all it asks, and none does yet, so no criterion is listed under `pass`: where every rule of a criterion passes, it is `cantTell`, for a person to check the rest. Titles follow `--locale`. A pack's own checklist items are left out of the block; the HTML report shows them. The block never changes the exit code, and `--json` has the same data in `rulesResults`.

## What a run with no failure means

Exit `0` with no `fail` says the automated rules found nothing definite on the pages scanned. It is not a claim that they conform to WCAG, and the summary ends by saying so when nothing failed. A person still checks:

- the `cantTell` findings, which the summary lists as needing human review;
- that everything works with the keyboard alone;
- how a screen reader reads the page;
- the content itself: that text alternatives, headings, labels and link text say what they should.

The [known limitations](https://github.com/SureA11y/core/blob/main/docs/LIMITATIONS.md) list what no rule covers.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Scan completed, no `fail` outcomes on any page (none at or above `--fail-on-severity`'s level, when given), and with `--fail-on-lean` no likely failures. `--write-baseline` and `--migrate-baseline` exit `0` whatever the scan found. |
| `1` | Scan completed, at least one `fail` outcome on some page (at or above `--fail-on-severity`'s level, when given), or with `--fail-on-lean` a likely failure — the CI-gating case. |
| `2` | Usage error, or the scan itself couldn't run (bad path/URL, network failure, missing `jsdom`, `--browser` without Playwright or Chromium, a `--urls` file that can't be read or lists nothing, a `--sitemap` that can't be read, isn't a sitemap or lists nothing, `--max-pages` without `--sitemap`, a `--wait-for` element that never showed, a browser-only option without `--browser`, `--lean-fail-wcag-only` without `--fail-on-lean`, two of `--baseline`, `--write-baseline` and `--migrate-baseline` together, a baseline file that can't be read), or it would have checked nothing or less than asked: a `--rules`/`--tags` list naming no known rule or tag, a selection whose parts cancel out so that no rule runs (`--rules img-alt-present --exclude-rules img-alt-present`), a `--context` selector that is invalid or matches no element, a custom rule the engine could not run, a pack that can't be found or loaded or that the engine skipped, or a `--profile` that wasn't applied. No report or baseline is written. |

`cantTell` outcomes don't affect the exit code — they're printed as a "needs human review" summary, consistent with the manual/`cantTell` mental model in [`TROUBLESHOOTING.md`](https://github.com/SureA11y/core/blob/main/docs/TROUBLESHOOTING.md#should-i-treat-canttell-as-a-failure) — unless `--fail-on-lean` is given, and then only those that likely fail count (see [Questions that likely fail](#questions-that-likely-fail)). For other `cantTell`-aware gating, use `--json` and inspect `checksResults` yourself, or call the library directly (see [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md#ci-gating-a-build-on-the-result)).

With `--baseline`, exit code `1` means at least one *new* (not-yet-baselined) `fail` occurrence, not any `fail` occurrence, and with `--fail-on-lean` at least one new likely failure — see [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md).

With several pages, one that can't be scanned stops the run with `2`, naming the page, and nothing is written.

## Failing only on serious problems

Every rule result has a severity: `critical`, `serious`, `moderate` or `minor` (a profile can set its own). `--fail-on-severity` makes only failures at that level or above fail the run, so a team can start by blocking on serious problems while the rest are still reported and fixed over time:

```sh
surea11y scan ./dist/index.html --fail-on-severity serious
```

A failing rule below the level is still listed, with "below --fail-on-severity serious, does not fail the run" next to it, and is in every report and in `--json` as usual. With `--baseline`, only *new* failures at the level count. With `--fail-on-lean`, so do only the likely failures of rules at the level or above. `fail` keeps its meaning, a definite violation; the option only chooses which ones stop the build. The summary lists failing rules most severe first.

## Questions that likely fail

A `cantTell` finding is a question for a person: the engine couldn't prove the answer from the page. Some questions have evidence that points one way, and the engine says so with a **lean** (`toward: 'fail'` or `'pass'`, `why`, and sometimes a `caution` saying what could make it wrong); the outcome stays `cantTell`. Each question also carries `howToCheck`: the steps to answer it, and what a person sees if it passes or fails. See core's [`LEANS.md`](https://github.com/SureA11y/core/blob/main/docs/LEANS.md).

The summary counts the questions by review group, as core's HTML report groups them (`reviewGroupOf`), and lists the first five that likely fail, most severe first, each with its lean's reason:

```
  occurrences by tier: fail: 0   cantTell: 4
  needs review: likely fail: 2   likely pass: 0   needs a person: 2

LIKELY FAIL — confirm (2 occurrence(s)):
  - invalid-field-error-message (serious): #email
    This field is marked invalid, but the error message aria-errormessage names is hidden.
    why: The error message tied to the field is hidden, so the error is probably not told.
  - heading-order (minor): html > body > main > h3
    This heading jumps from level 1 to level 3, skipping a level.
    why: The heading skips a level after the one before it.
```

*Likely fail* is a question whose evidence points to a failure, *likely pass* one whose evidence points to a pass, and *needs a person* one with no evidence either way. A likely failure is still a question: a reviewer who checks it and finds it passes is right.

### Gating on likely failures

By default, questions never fail the run. `--fail-on-lean` makes the likely failures fail it too, exit `1`, without failing on every question:

```sh
surea11y scan ./dist/index.html --fail-on-lean
surea11y scan ./dist/index.html --fail-on-lean --lean-fail-wcag-only --junit a11y.junit.xml --sarif a11y.sarif
```

- The findings it counts are core's `leaningFailures(result)`: those of a rule whose every WCAG criterion is outside the scan's target are left out. The best-practice rules' facts lean fail without condition (a skipped heading level in `heading-order`), so `--lean-fail-wcag-only` counts only the likely failures of rules mapped to a WCAG criterion in the target (`{ wcagOnly: true }`). Above, `--fail-on-lean` counts both findings, and with `--lean-fail-wcag-only` only `invalid-field-error-message`'s (3.3.1).
- With `--fail-on-severity`, only the likely failures of rules at that severity or above count.
- `--junit` reports a rule with a likely failure as a failing test (`leanFailAs: 'failure'`), saying why it likely fails, the lean's caution and the steps to confirm it, and `--sarif` raises each likely failure to `error` (`leanFailAs: 'error'`). Both follow `--lean-fail-wcag-only` (`leanFailWcagOnly`). Without `--fail-on-lean`, they report questions as before: skipped tests, and SARIF results below `error`.
- The summary says how many of the likely failures listed fail the run (`--fail-on-lean: 1 of them fails the run`), and with several pages the closing line counts the pages "with failures or likely failures".
- New leans arrive in minor releases of core, so an upgrade can turn a build red with nothing changed on the page. Accept the likely failures a page has with a baseline, below, or pin core's version.

### Likely failures in a baseline

Given with `--fail-on-lean`, `--write-baseline` also records each likely failure that `--fail-on-lean` would count, as an entry marked `"lean": "fail"` after the failures (`buildBaselineEntries(result, { leanFail: true })`), and `--baseline` then gates only on new ones (`matchBaseline(result, entries, { leanFail: true })`):

```sh
surea11y scan ./dist/index.html --fail-on-lean --write-baseline baseline.json   # once, commit the file
surea11y scan ./dist/index.html --fail-on-lean --baseline baseline.json         # in CI
```

```
baseline: 0 known, 0 new, 0 stale (no longer detected)
baseline likely failures: 2 known, 0 new, 0 stale (no longer detected)
```

An entry marked `lean: 'fail'` matches only a finding that still leans fail, with the same identity; a plain entry only a failure. The summary lists the new likely failures, and `--json` has the counts in `baseline.leanFail` (`{ total, knownCount, newCount, newOccurrences, staleCount }`); with `--lean-fail-wcag-only`, `newOccurrences` and `newCount` hold only those it counts. Without `--fail-on-lean`, such entries are ignored, and `--write-baseline` writes failures only. `--sarif` and `--junit` read them too: under `--fail-on-lean` a known likely failure stays a `warning` in SARIF and a skipped test in JUnit. See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md#findings-that-lean-fail).

## Several pages

Give several paths or URLs, or list them in a file with `--urls`, and each page is scanned in turn:

```sh
surea11y scan ./dist/index.html ./dist/about.html
surea11y scan --urls pages.txt --sarif a11y.sarif --junit a11y.junit.xml
```

```text
# pages.txt
./dist/index.html
./dist/pricing.html
https://staging.example.com/account   # behind the build, scanned live
```

- The summary has a section per page, then a line such as `3 pages scanned: 1 with failures.` The run fails when any page does.
- `--json` prints an array, one result per page, in the order given.
- `--sarif` writes one file with one run holding every page's findings; each finding names its page as its location, as with one page. (GitHub code scanning refuses a file with several runs of one tool.)
- `--junit` writes one file. Each page's suites are named after the page (`dist/about.html — WCAG 1.1.1`), and its test cases' class names too (`dist/about.html/wcag-1.1.1`), so a CI's test history keeps pages apart.
- `--html` writes one report per page: `report.html`, `report-2.html`, ...
- `--write-baseline` records each entry with its page: a URL as given, a file by its path relative to the working directory, so the baseline matches in another checkout. `--baseline` then matches each page against its own entries, so a known failure on one page doesn't hide the same one on another. An entry with no page, from a baseline written for one page, applies to whatever page is scanned.

### From a sitemap

`--sitemap` scans the pages a site's `sitemap.xml` lists, after any pages named on the command line or in `--urls`:

```sh
surea11y scan --sitemap https://example.com/sitemap.xml
surea11y scan --sitemap ./dist/sitemap.xml --max-pages 200 --sarif a11y.sarif
```

- It takes a URL or a local file, plain or gzipped (`sitemap.xml.gz`).
- A sitemap index is followed to the sitemaps it names, one level down, as the sitemap protocol allows.
- A relative `<loc>` resolves against the sitemap's own address, so a local sitemap of relative paths scans the files beside it.
- A page listed twice, or also named on the command line, is scanned once.
- `--max-pages` limits how many of its pages are scanned, in the sitemap's order: 50 by default, so a large site doesn't run for hours. When it cuts the list, a line on stderr says so (`sitemap: 312 pages listed, scanning the first 50 (--max-pages 50).`).
- With `--browser`, each page opens in Chromium as usual.
- A sitemap that can't be read, isn't one (another root than `<urlset>` or `<sitemapindex>`, or XML that isn't well-formed), or lists no page stops the run with exit `2` before anything is scanned.

## In a real browser

```sh
npm install --save-dev playwright      # once, in your project
npx playwright install chromium        # and its browser
surea11y scan https://app.example.com/ --browser
```

`--browser` opens each page in headless Chromium through [Playwright](https://playwright.dev/), lets its scripts run, waits for its fonts and images, and scans what renders. Client-rendered content is scanned, and the rules that measure the layout (`target-size-minimum`, `text-spacing-content-loss`, ...) can decide. Local files open as `file://` pages.

- Playwright is not a dependency of the CLI: install it in your project, where the CLI finds it. Without it, or without its Chromium, `--browser` exits `2` saying what to install. `CHROMIUM_EXECUTABLE_PATH` points it at another Chromium build.
- The engine in the page is the browser bundle of the same `@surea11y/core` the CLI uses for static scans, so both modes judge with one engine version; only how the page is rendered differs.
- Every option works as in a static scan, packs and custom rules included: packs are loaded into the page as core's `packScript`, and custom rules as their source.
- Each question (`cantTell` finding) gets the steps to answer it, `howToCheck`, as in a static scan. The engine in the page leaves them out to stay small; the CLI adds them in Node with core's `addHowToCheck`, with your packs' rules' steps too, before printing `--json` or the summary and writing any report.
- Core's internals and listener hooks are installed before the page loads, unless you pass `--no-hooks`, and the live-region hook with `--live-regions`. See [Hooks](#hooks).
- The engine is loaded by evaluating it, not with a script tag, so a page whose Content Security Policy forbids inline scripts is still scanned. A custom rule given as a function is passed as source and needs `eval`, which such a policy may forbid; the engine then skips it and says so, and the run exits `2`.
- Only the top document is scanned; frames inside it are not, for now. For more control over the browser (logging in, clicking through a flow, every frame), use a binding such as `@surea11y/playwright` in your own test.

### Hooks

Some of what a page does can't be read once it has run: listeners it added from script, `ElementInternals` a component keeps in a private field, what its live regions were given. Core has an opt-in hook for each, a script that must run before the page's own. `--browser` installs the internals and listener hooks with Playwright's `addInitScript`, which runs them in every frame before the page's scripts, since the CLI is an audit tool and core's hooks are meant for test and audit runs; `--live-regions` adds the live-region hook. `--no-hooks` leaves out the internals and listener hooks.

- **Internals** (`internalsHookScript()`): reads names, states and roles a custom element sets through `ElementInternals` kept in a private field (`this.#internals.ariaLabel = 'Close'`). The name rules (`button-name-present`, `binary-control-name-present` and the other `*-name-present` rules, `empty-heading`) and `aria-required-attr` then decide what they asked about (`name_internals`, `state_internals`), and an element whose role is set only there is checked like any other with that role.
- **Listener** (`listenerHookScript()`): records the click, key, focus, pointer and paste listeners the page adds from script. `click-handler-keyboard-operable` then judges an element given a click listener from script, and fails a control in the tab order that no key or focus listener serves (`CLICK_HANDLER_NO_KEY_LISTENER`): a `<div role="button" tabindex="0">` that Enter and Space do nothing on, which without the hook isn't seen at all. `mouse-only-event-handlers`, `password-paste-enabled`, `widget-keyboard-focusable`, `css-focus-indicator-suppressed`, `focus-order-semantics` and `skip-link` lean differently with what it saw.
- **Live region, with `--live-regions`** (`liveRegionHookScript()`): records what the page's live regions are given from the load event on. `live-region-announcements` (4.1.3) then also asks about a region added with its text already in it (`LIVE_REGION_INSERTED_WITH_CONTENT`, a toast inserted as `<div role="status">Saved</div>`) or shown and filled at once (`LIVE_REGION_SHOWN_AND_FILLED`), which screen readers commonly don't announce, and leans fail for a region behind a modal dialog that was given text while the dialog was open. It's off by default: the CLI doesn't use the page, so on an app that renders after it loads, the hook would mostly see live regions rendered with their first content ("Loading…", "3 items in cart"), the app at rest rather than a status message. Turn it on for a page that shows a status message by itself after loading, and use `--wait-for` to wait for it. It only observes the page; `--no-hooks` doesn't turn it off.

The result records each hook the page ran in `engine.environment.internalsHook`, `.listenerHook` and `.liveRegionHook`: `'early'` when installed before the page's scripts, as here, `'late'` after, or absent without it. The summary names them (`hooks: internals, listeners`, and `live regions` with `--live-regions`; `(late)` after one installed late). Only an early hook proves that something is missing, such as a key listener. Core's [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md#seeing-listeners-added-from-script-the-listener-hook) says what each hook does, and its [binding authors' guide](https://github.com/SureA11y/core/blob/main/docs/BINDING_AUTHORS_GUIDE.md#what-each-hook-changes) lists every reason code each one decides or changes.

The page can notice them: `addEventListener`, `removeEventListener`, the `on…` setters and `attachInternals` are wrapped (the page gets the same results and errors), and each hook keeps its record under a global symbol any script in the page can read. The page is the scan's own, opened for it and closed after, so this changes nothing anyone uses. Scan with `--no-hooks` to see the page as it runs without them, for a page whose scripts break when those methods are wrapped, or to compare. A static scan runs no page script, so it has no hooks, and `--no-hooks` or `--live-regions` without `--browser` exits `2`.

### Waiting for content

The scan starts once the page has loaded and its fonts and images have arrived. An app that fetches its data after that (a table of orders, search results, a dashboard) may not have drawn it yet, and a scan then checks an empty page and passes. Name an element that is only there once the content is, and the scan waits for it:

```sh
surea11y scan https://app.example.com/orders --browser --wait-for "#orders-table"
surea11y scan https://app.example.com/search?q=shoes --browser --wait-for "[data-results-loaded]" --wait-timeout 60000
```

The scan starts when an element matching the selector is on the page and shown: not `display: none`, `visibility: hidden` or empty. It waits up to 30 seconds, or `--wait-timeout` milliseconds. If the element never shows, the run stops with exit `2`, naming the selector, rather than scanning a page whose content never arrived; nothing is written. With several pages, every page waits for the same selector, so give one that all of them share (a loaded marker, for instance), or scan pages with different content in separate runs.

### Width and color scheme

A page can look different on a phone or in dark mode, and so can its problems: text that reads well on white can fail contrast on a dark background, and a control that is big enough at 1280 pixels can shrink, or text be cut off, at 320. `--width` sets the viewport's width and `--color-scheme` the `prefers-color-scheme` the page sees, and the rules that measure the layout (contrast, target size, text cut off when spacing grows) judge the page as it is drawn there:

```sh
surea11y scan https://example.com/ --browser --width 320              # a narrow, phone-sized screen
surea11y scan https://example.com/ --browser --color-scheme dark      # the dark theme
surea11y scan https://example.com/ --browser --width 320 --color-scheme dark --html dark-mobile.html
```

The default is 1280 × 720 in the light scheme. 320 pixels is the width WCAG 1.4.10 (Reflow) asks content to work at, but the engine has no rule for reflow itself yet (content that needs scrolling in two directions): `--width 320` gives the other rules that layout, and the HTML report lets a person check the rest. The summary names what the scan used (`browser: 320×720, dark color scheme`), and the result records it in `engine.environment.viewport` and `.colorScheme`.

### Several widths and color schemes

Give `--width` or `--color-scheme` several values, comma-separated, and each page is scanned in every combination of them, then reported as one result:

```sh
surea11y scan https://example.com/ --browser --width 1280,320 --color-scheme light,dark   # four scans
```

The page is loaded once; for each combination the viewport and scheme are changed and the page scanned again, so each extra combination costs a scan, not another page load. The scans are merged the way `.conditions()` merges them in the test bindings:

- A rule's outcome is its worst across the scans, so a contrast failure only in dark mode fails the rule, and the run.
- Each finding is listed once per element, rule and reason, with the combinations it was seen in. The summary prints them (`seen in: dark, width 1280, dark, width 320`), and `--json` gives them as the occurrence's `conditions`.
- The summary lists each scan's viewport and scheme, and the result's `conditionRuns` holds each scan's name and `engine.environment`.
- A combination is named by what varies: `dark`, `width 320`, or `dark, width 320` when both do.

`--html`, `--sarif`, `--junit` and `--earl` report the merged result, one per page as before. One baseline covers every combination, since a finding is listed once however many combinations it was seen in, and matched as any other (by its rule, reason and the element's markup). A single width and scheme is one scan, as before, with no `conditionRuns`.


## Baseline / allowlist

For an existing, imperfect site, gating on every `fail` on day one is often an adoption blocker. `--write-baseline`/`--baseline` let you accept the current state once and gate CI only on genuinely new violations from then on:

```sh
surea11y scan ./dist/index.html --write-baseline baseline.json   # once, commit the file
surea11y scan ./dist/index.html --baseline baseline.json         # in CI, from then on
```

See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md) for the matching semantics, file format, and known limitations. To accept the likely failures a page has as well, see [Likely failures in a baseline](#likely-failures-in-a-baseline).

### Upgrading a baseline

A finding's identity includes its reason code, and a minor release of core can give a finding a new one: `img-alt-present`'s missing `alt` was `DEFAULT` in 1.13 and is `TEXT_ALTERNATIVE_MISSING` in 1.14. A baseline written by the release before still matches such a finding, for one minor release, through core's table of moves; it needs updating before the next (see [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md#upgrading)). Regenerating it with `--write-baseline` writes every finding under its current code, but also accepts whatever the upgrade newly reports. `--migrate-baseline` rewrites the codes and accepts nothing new:

```sh
surea11y scan ./dist/index.html --migrate-baseline baseline.json   # against a scan of the page
surea11y scan --migrate-baseline baseline.json                     # without one
```

It rewrites the file in place with core's `migrateBaselineEntries`, keeping every other entry, field and the rest of the file as they were, and says on stderr how many entries changed. Given the pages, it scans them first, and an entry whose code was split in two takes the code its finding has now: an entry that names a page is migrated against that page's scan, and one that names none against the only page scanned. Without pages, it makes only the moves it can tell without the finding, a code the rule no longer gives that moved to a single new one. Like `--write-baseline`, it never fails the build: the summary or `--json` is printed for the pages scanned, and the run exits `0`. It can't be given with `--baseline` or `--write-baseline`. Commit the rewritten file, and look at its diff.

## Packs

A pack brings rules, variants of core's rules, a standard or an organisation's checklist, and their profiles and messages, from a package of its own: a national standard such as RGAA, or your organisation's accessibility policy (see [`PACKS.md`](https://github.com/SureA11y/core/blob/main/docs/PACKS.md), and [Packs in `ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md#packs--rules-and-standards-from-outside-core) for the reference). `--pack` loads one by package name, resolved from the working directory's project, or by path; `--profile` runs one of its profiles:

```sh
npm install --save-dev @acme/a11y-policy                                   # a pack published as a package
surea11y scan ./dist/index.html --pack @acme/a11y-policy --profile acme-web-2026
surea11y scan ./dist/index.html --pack ./acme-policy-pack.js --profile acme-web-2026
```

Repeat `--pack` to scan with several packs. Without its profile, a pack's rules run only when selected, with `--rules` or by a tag.

### Example: a policy pack

`acme-policy-pack.js` is a small pack: a house rule, a checklist profile (WCAG 2.2 A and AA, `region`, and the house rule) and two checklist items. It loads `@surea11y/core/pack`, which is installed beside the CLI when you install `@surea11y/cli` in the project:

```js
// acme-policy-pack.js
'use strict';

// A small pack: one house rule, a checklist profile and two checklist items.
// A real pack is a package of its own; `npx surea11y-pack new <folder>` writes one.

const { definePack, wcagTags } = require('@surea11y/core/pack');

module.exports = definePack({
  name: '@acme/a11y-policy',
  title: 'Acme web policy',
  version: '1.0.0',
  namespace: 'acme',
  core: '^1.11.1',
  rules: [
    {
      id: 'acme-no-autoplay',
      meta: {
        title: 'Videos do not play sound on their own',
        description: 'A video that starts with sound talks over a screen reader.',
        tags: ['acme'],
        defaultSeverity: 'serious'
      },
      runInPage(ctx) {
        // defaultMuted reflects the muted attribute where muted isn't set from it yet (jsdom).
        const loud = [...ctx.document.querySelectorAll('video[autoplay]')].filter((v) => !(v.muted || v.defaultMuted));
        return loud.length
          ? {
              outcome: 'fail',
              occurrences: loud.map((v) =>
                ctx.helpers.reportOccurrence(v, { summary: 'This video plays with sound as the page opens.', hint: 'Remove autoplay, or add muted.' })
              )
            }
          : { outcome: 'pass', occurrences: [] };
      }
    }
  ],
  profiles: {
    'acme-web-2026': { tags: wcagTags('2.2', ['A', 'AA']), rules: ['region', 'acme-no-autoplay'] }
  },
  rollups: [
    { id: 'acme-images', title: 'Images have a text alternative', checksIds: ['img-alt-present'] },
    { id: 'acme-media', title: 'Media stays quiet until asked', checksIds: ['acme-no-autoplay'] }
  ]
});
```

Scan a page with it:

```sh
cat > page.html <<'HTML'
<!doctype html>
<html lang="en">
<head><title>Home</title></head>
<body>
  <main>
    <h1>Home</h1>
    <video src="intro.mp4" autoplay></video>
    <video src="loop.mp4" autoplay muted></video>
    <img src="logo.png">
  </main>
</body>
</html>
HTML
npx surea11y scan ./page.html --pack ./acme-policy-pack.js --profile acme-web-2026
```

```
surea11y scan: file:///path/to/page.html
  engine: @surea11y/core 1.14.0
  WCAG level reported: AA
  profile: acme-web-2026
  packs: @acme/a11y-policy@1.0.0
  pass: 9   fail: 2   cantTell: 5   notApplicable: 99

  occurrences by tier: fail: 2   cantTell: 7
  needs review: likely fail: 0   likely pass: 0   needs a person: 7

FAIL (2 rule(s)):

  acme-no-autoplay  (serious, 1 fail occurrence(s))
    - html > body > main > video:nth-of-type(1)
      This video plays with sound as the page opens.
      hint: Remove autoplay, or add muted.

  img-alt-present  (serious, 1 fail occurrence(s))
    - html > body > main > img
      This <img> has no alt attribute.
      hint: Add an alt attribute that says what the image shows, or alt="" if the image is purely decorative.

cantTell — needs human review (5 rule(s)): manual-review, media-alternative-transcript-evidence, no-autoplay-audio, page-title-patterns, video-caption

criteria (WCAG 2.2 AA):
  fail       1.1.1 Non-text content: text alternatives
  cantTell   1.2.1 Audio-only and video-only (prerecorded): transcript; 1.2.2 Captions (Prerecorded); 1.3.1 Info and Relationships; 1.3.4 Orientation; 1.3.5 Identify Input Purpose; 1.4.1 Use of Color; 1.4.2 Audio Control; 1.4.3 Contrast: minimum; 1.4.4 Resize Text; 1.4.5 Images of Text; 1.4.12 Text Spacing; 2.1.1 Keyboard; 2.2.1 Timing Adjustable; 2.2.2 Pause, Stop, Hide; 2.4.1 Bypass Blocks; 2.4.2 Page titled; 2.4.3 Focus order; 2.4.6 Headings and Labels; 2.4.7 Focus visible; 2.5.8 Target size: minimum; 3.1.1 Language of page; 3.1.2 Language of Parts; 3.3.1 Error Identification; 3.3.2 Labels or Instructions; 3.3.8 Accessible Authentication (Minimum); 4.1.2 Name, role, value: accessible name; 4.1.2 Name, role, value: ARIA validity; 4.1.3 Status Messages
  notApplicable: 3
  A criterion that passes here means the checks that ran found nothing in it, not that the page conforms.
```

The pack's own rules appear like core's, with ids that start with its namespace (`acme-no-autoplay`). The checklist's items (`acme-images`, `acme-media`) are in `--json`'s `rulesResults`, each one result, and the HTML, SARIF and JUnit reports list them. For a pack of your own, `npx surea11y-pack new <folder>` (from `@surea11y/core`) writes a package that works as generated, with its tests, docs and lint.

### When a pack doesn't run

The summary names the profile and the packs that ran, and `--json` has them as `engine.profile` and `engine.packs`. A scan exits `2`, with no report or baseline written, when it would check less than asked:

- a pack that can't be found (a package name not installed in the project, or a path with no file) or can't be loaded;
- a pack the engine skips, listed with its reason (the engine's `skippedPacks`): its `core` range leaves out the installed core, it isn't a valid pack, or it doesn't fit with core (a rule id outside its namespace, a variant of a rule core doesn't have);
- a `--profile` that wasn't applied: no such profile (a pack's profile needs its `--pack`), or `--rules`, `--tags` or `--wcag` chose the rules in its place.

## Custom rules

For an org-specific check that isn't (and shouldn't be) one of the built-in rules — an internal design-system convention, a company style-guide requirement — `--custom-rules <path>` registers your own rule(s) for that one scan, on top of every built-in rule:

```sh
surea11y scan ./dist/index.html --custom-rules ./a11y-rules.js
```

`a11y-rules.js` exports either a single rule descriptor or an array of them, using the same shape as a built-in rule module:

```js
// a11y-rules.js
module.exports = [
  {
    id: 'org-no-inline-onclick',
    meta: { title: 'No inline onclick handlers', defaultSeverity: 'moderate' },
    runInPage(ctx) {
      const els = ctx.helpers.queryAll('[onclick]');
      const occurrences = els.map((el) => ({
        selector: ctx.helpers.buildSelector(el),
        html: el.outerHTML,
        summary: 'Inline onclick handler found.',
        hint: 'Move event handling into an external script.'
      }));
      return {
        ruleId: ctx.rule.ruleId,
        outcome: occurrences.length ? 'fail' : 'pass',
        occurrences
      };
    }
  }
];
```

- `<path>` is a **local file**, `require()`d directly by the CLI — never a URL. (Unlike the scan target, which does accept a URL: fetching and executing remote code as a rule would be a very different, much riskier trust model than running a file you already have on disk.)
- Because the CLI runs your rule in the same Node process as the scan, `runInPage`/`applicability` can be plain functions — no `fn.toString()` string-source workaround needed (that's only required for callers, like a browser-automation binding, whose `engineOptions` crosses a serialization boundary). See [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md) for the full descriptor contract (`meta` defaulting, the `ctx` shape, etc.) — it's identical here.
- Repeat the flag to load rules from more than one file: `--custom-rules ./a.js --custom-rules ./b.js`.
- A custom rule's `id` colliding with a built-in one **overrides** that built-in for the scan, surfaced via a `console.warn` and the result's top-level `overriddenBuiltinIds` array — see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md).
- The file itself is validated at load time (must export a descriptor, or array of descriptors, each with a string `id` and a function-or-source-string `runInPage`) — a malformed export exits `2` with a clear error rather than silently scanning with one fewer rule than expected.
- A rule the engine then declines to run — an `id` another custom rule already has, a composite rule's `id`, or a `meta` that fails validation — also exits `2`, listing each such rule and why (the engine's `skippedCustomRules`).
- Works alongside every other flag, including `--rules`/`--exclude-rules`/`--tags` (which can target your custom rule's `id` exactly like a built-in one) and `--baseline`/`--html`/`--sarif`/`--junit`.

## HTML report

For a browsable view of a scan's results — hero summary, WCAG rollup grouped by conformance level, and a searchable/filterable occurrence table — rather than raw JSON or a terminal summary:

```sh
surea11y scan ./dist/index.html --html report.html
```

Open `report.html` directly from disk; no server, no external assets. The findings that need review are grouped as likely fails, likely passes and those that need a person, each with the steps to check it. Works alongside any other output mode. See [`REPORT.md`](https://github.com/SureA11y/core/blob/main/docs/REPORT.md).

## SARIF report

For GitHub Code Scanning or another SARIF-consuming dashboard:

```sh
surea11y scan ./dist/index.html --sarif results.sarif
```

Works alongside any other output mode, and alongside `--baseline` (already-known `fail` occurrences are omitted from the SARIF output rather than re-reported). Each question's result carries its lean in `properties.lean` and its steps in `properties.howToCheck`; with `--fail-on-lean`, a likely failure is an `error` (see [Gating on likely failures](#gating-on-likely-failures)). See [`SARIF.md`](https://github.com/SureA11y/core/blob/main/docs/SARIF.md).

## JUnit report

For CI systems that show JUnit XML in their own test views (GitLab's merge request test widget, Azure DevOps' Tests tab, Jenkins, CircleCI):

```sh
surea11y scan ./dist/index.html --junit a11y.junit.xml
```

Each WCAG criterion becomes a test suite, named `WCAG 1.4.3` in every locale (the translated title is the suite's `title` property), and each rule a test case: a `fail` rule is a failing test, a `cantTell` rule a skipped one (it needs human review, so it never turns the report red), and `notApplicable` rules are left out. With `--baseline`, a rule whose every failure is already recorded in the baseline is reported as skipped, not failing. A `--rules` or `--tags` scan has a suite for each criterion its rules belong to. With `--wcag-level`, criteria above the level get no suite. With `--fail-on-lean`, a rule with a likely failure is a failing test, saying why it likely fails and how to confirm it (see [Gating on likely failures](#gating-on-likely-failures)). The report never changes the exit code. See [`JUNIT.md`](https://github.com/SureA11y/core/blob/main/docs/JUNIT.md) for the full mapping.

For example, in GitLab CI:

```yaml
a11y:
  script:
    - npx @surea11y/cli scan ./dist/index.html --junit a11y.junit.xml
  artifacts:
    when: always
    reports:
      junit: a11y.junit.xml
```

`when: always` keeps the report when the scan fails the job, which is when you want to read it.

## Manual checks

A scan decides what rules can decide. `--manual-checks <path>` writes, next to it, the rest: a worksheet of the checks no rule decides in full, for a person to do by hand, with the steps for each, what passes and what fails, and a result and notes to record. With [`--html`](#html-report), the team has both halves of the assessment from one run:

```sh
surea11y scan https://example.com/ --wcag 2.2 --html report.html --manual-checks manual-checks.html
```

- **What it lists:** the procedures whose facets no rule decides in full (core's `procedureChecklist` with `automation: ['manual', 'partial']`), each once, grouped by WCAG's principles and guidelines, or by a pack's own groups.
- **For which standard:** the one scanned. A pack's profile (`--pack … --profile en301549-v4.1.1`) gives that standard and version, under its own numbers, where the pack gives procedures. Otherwise it is WCAG, at the version and level of `--wcag` and `--wcag-level`, or of `--profile`'s target, and WCAG 2.2 A and AA by default. A pack that gives no procedures, such as `@surea11y/pack-en301549` 1.1.0, gets WCAG's, with a note on stderr.
- **In which language:** `--locale`'s, where core has it.
- **Several pages:** one worksheet per page, numbered as `--html`'s are (`manual-checks.html`, `manual-checks-2.html`…), each titled with its page. A worksheet keeps its results in the browser under its title, so each page's results stay apart.
- **The worksheet:** open it from disk, record each result (passes, fails, does not apply, not checked) and notes, and download them as JSON, with each requirement's result rolled up from its checks, or as CSV. Results are kept in the browser until cleared. A path ending in `.md` writes Markdown instead, with a task item per check.

It never changes the exit code. It needs `@surea11y/core` 1.15 or later, which has the procedures; with an older core, the run stops before scanning (exit `2`) and says so. See core's [`PROCEDURES.md`](https://github.com/SureA11y/core/blob/main/docs/PROCEDURES.md#rendering-them) for the worksheet in full.

## Procedures: how to assess by hand

`surea11y procedures` writes how a person assesses each requirement of a standard by hand, with no scan: a reference to read, or a worksheet to work through (`--checklist`). It needs `@surea11y/core` 1.15 or later.

```sh
# How to assess every WCAG 2.2 A and AA criterion, as a page
surea11y procedures --wcag 2.2 --wcag-level AA -o wcag-22-aa.html

# A worksheet for a manual audit, titled for it
surea11y procedures --wcag-level AA --checklist --title "Audit: example.com" -o audit.html

# Only what no rule decides in full, as Markdown for a repository
surea11y procedures --wcag-level AA --automation manual,partial -o left-to-a-person.md

# What needs a screen reader, for a session with a person who uses one
surea11y procedures --wcag-level AA --tools screen-reader -o screen-reader-session.html

# One criterion, in French, with the steps a scan's questions give
surea11y procedures 1.4.12 --locale fr --variants -o 1.4.12.html

# A pack's standard, under its own numbers: by its profile, or by key and version
surea11y procedures --pack @surea11y/pack-en301549 --profile en301549-v4.1.1 --checklist -o en-301-549.html
surea11y procedures --pack @surea11y/pack-en301549 --standard en301549 --standard-version V3.2.1 -o en-v3.html

# The data, for a tool of your own
surea11y procedures --wcag-level A --checklist --json > checklist.json
```

| Flag | Meaning |
|---|---|
| `[requirement]` | One requirement only: a WCAG criterion (`1.4.3`), `best-practice`, or a pack's requirement with `--standard`. |
| `--checklist` | A worksheet: each procedure once, with a result and notes to record. Without it, a reference: every requirement and each of its facets. |
| `--wcag <version>` | WCAG `2.0`, `2.1` or `2.2` (the default). |
| `--wcag-level <level>` | Up to level `A`, `AA` or `AAA`; every level by default. |
| `--standard <key>` | A pack's standard, by key (`en301549`) or name (`"EN 301 549"`), with `--pack`; or `best-practice`. Not with `--wcag` or `--profile`. |
| `--standard-version <version>` | With `--standard`: its version; by default the latest that has procedures. |
| `--profile <name>` | A pack's profile, for its standard and version, with `--pack`. |
| `--pack <name-or-path>` | A pack, for its standard and its rules' steps. Repeatable. See [Packs](#packs). |
| `--automation <list>` | Only facets that rules decide in full, in part or not at all: `full`, `partial`, `manual`, comma-separated. |
| `--tools <list>` | Only procedures that need one of `keyboard`, `pointer`, `screen-reader`, `zoom`, `contrast-theme`, `devtools`. |
| `--rules <ids>` | Only what these rules test. |
| `--locale <locale>` | The page's language, and the procedures' where they are translated; English otherwise, marked as such on the page. |
| `--format <format>` | `html` (the default) or `markdown`; an output path ending in `.md` or `.markdown` gives Markdown. |
| `-o`, `--output <path>` | Write to `<path>`; standard output otherwise. |
| `--title <text>` | The page's title and heading. |
| `--variants` | Also show, under each facet of a reference, the steps a scan's question gives for it. |
| `--no-record` | A worksheet with no results to record. |
| `--json` | The procedures as JSON (what core's `listProcedures`, `procedureChecklist` or `proceduresFor` gives) instead of a page. |

The page opens from disk, with nothing loaded from elsewhere, and is itself accessible: core holds it to its own rules. A scan's options (`--browser`, `--html` and the others) are a usage error here, as `procedures`' own are on `scan`. It exits `0` when it wrote the procedures, and `2` for a usage error, a standard, version or requirement core has no procedures for (a pack's standard needs its pack, and a pack that gives procedures), or a core without them.

## Compact results

`--compact` asks the engine for a smaller result (`engineOptions.output.detail: 'findings'`): every `fail` and `cantTell` result stays whole, and a rule that passed or did not apply keeps only its `ruleId`, `outcome` and `type` (and its `margin` or `error`, if it has one). With `--pack`, every result stays whole, and with `--custom-rules` the custom rules' results do, since core's catalog can't fill them back in. For a `--json` result kept as a CI artifact:

```sh
surea11y scan ./dist/index.html --compact --json > result.json
```

The summary, the exit code, the baseline and the HTML, SARIF and JUnit reports are the same as without it, and `--json` has `engine.outputDetail: 'findings'`. On a small page, `--json` goes from about 359 KB to 136 KB. See `engine.outputDetail` in [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md).

## In CI

```sh
npx @surea11y/cli scan ./dist/index.html || exit 1
```

Or, since the exit code already reflects pass/fail, just let the command's own exit code propagate — most CI systems fail the step automatically on a non-zero exit. See [`CI_INTEGRATIONS.md`](https://github.com/SureA11y/core/blob/main/docs/CI_INTEGRATIONS.md) for ready-to-paste GitHub Actions and Bitbucket Pipelines templates, including a SARIF-upload example.

## A note on dependencies

This CLI depends on `jsdom` (to parse fetched/read HTML into a DOM), on `@surea11y/core` (the engine), and on `@surea11y/binding-base`, which has no dependencies of its own and merges the scans of one page under several widths and color schemes as the test bindings' `.conditions()` does. `--browser` also needs `playwright`, which you install yourself; the CLI never installs a browser. That split is the whole point of shipping the CLI separately: `@surea11y/core` itself has **zero runtime dependencies**, so using the library directly against a DOM you already have — jsdom, a real browser, Playwright, whatever — never pulls in `jsdom` a second time. Install `@surea11y/cli` when you want the command; install `@surea11y/core` when you want the API.
