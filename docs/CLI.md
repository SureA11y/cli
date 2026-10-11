# CLI

`@surea11y/cli` provides `surea11y`, a small command-line scanner (`bin/surea11y.js`) for ad hoc scans and CI, on top of the [`@surea11y/core`](https://github.com/SureA11y/core) library API described in [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md).

```sh
npx @surea11y/cli scan ./index.html
npx @surea11y/cli scan https://example.com/
```

Or install it once:

```sh
npm install -g @surea11y/cli          # globally
npm install --save-dev @surea11y/cli  # or per-project, for CI
```

## What it can and can't scan

The CLI reads **static HTML only** — a local file, or the raw response of an HTTP(S) GET request — and never executes page JavaScript. That means client-rendered content (anything your framework injects after page load) won't be captured, and geometry-dependent rules like `target-size-minimum` will report `notApplicable` (no real CSS layout — see [`LIMITATIONS.md`](https://github.com/SureA11y/core/blob/main/docs/LIMITATIONS.md)). If you need either of those, drive a real browser yourself and use `runa11yCoreInPage` from `@surea11y/core` directly — see [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md) Pattern 2. The CLI is the fast path for static/server-rendered pages and CI; the library is what you reach for beyond that.

## Options

| Flag | Meaning |
|---|---|
| `--json` | Print the raw result object (see [`OUTPUT_SCHEMA.md`](https://github.com/SureA11y/core/blob/main/docs/OUTPUT_SCHEMA.md)) instead of a human-readable summary. |
| `--locale <locale>` | Output text locale (default `en`) — see [`I18N.md`](https://github.com/SureA11y/core/blob/main/docs/I18N.md). |
| `--rules <ids>` | Comma-separated rule IDs — only run these. |
| `--exclude-rules <ids>` | Comma-separated rule IDs — never run these. |
| `--tags <tags>` | Comma-separated tags — e.g. `--tags wcag2a,wcag2aa` for the WCAG 2.0 A and AA criteria, or `--tags best-practice` (see [`WCAG_CONFORMANCE.md`](https://github.com/SureA11y/core/blob/main/docs/WCAG_CONFORMANCE.md)). |
| `--wcag <version>` | Run the rules for a WCAG conformance target: `2.0`, `2.1` or `2.2`, at `--wcag-level` and below. See [WCAG target and best practices](#wcag-target-and-best-practices) below. |
| `--wcag-level <level>` | The `--wcag` target's level: `A`, `AA` (the default) or `AAA`. |
| `--best-practices` | Also run the best-practice rules, which test no WCAG criterion (`region`, `heading-order`, ...). On its own, it runs only those. |
| `--context <selector>` | Scope the scan to one CSS-selected subtree. A selector that matches no element, or that isn't valid CSS, exits `2`: nothing would be scanned. |
| `--custom-rules <path>` | Load runtime custom rules from a local JS file. Repeatable. See [Custom rules](#custom-rules) below. |
| `--pack <name-or-path>` | Load a pack: rules, a standard or a checklist, and their profiles, from a package installed in the project or a local file. Repeatable. See [Packs](#packs) below. |
| `--profile <name>` | Run a conformance profile, such as `en301549-v4.1.1` or a pack's own. A profile that isn't applied exits `2`. See [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md#conformance-profiles). |
| `--write-baseline <path>` | Write every current `fail` occurrence to `<path>`; never fails the build. See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md). |
| `--baseline <path>` | Gate only on occurrences not already recorded in `<path>`. See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md). |
| `--html <path>` | Write a self-contained, browsable HTML report to `<path>`. See [`REPORT.md`](https://github.com/SureA11y/core/blob/main/docs/REPORT.md). |
| `--sarif <path>` | Write a SARIF 2.1.0 report to `<path>` (e.g. for GitHub Code Scanning). See [`SARIF.md`](https://github.com/SureA11y/core/blob/main/docs/SARIF.md). |
| `--junit <path>` | Write a JUnit XML report to `<path>` (for the test views of GitLab, Azure DevOps, Jenkins, CircleCI). See [JUnit report](#junit-report) below. |
| `--compact` | Keep each `pass` and `notApplicable` result to its rule, outcome and type: a smaller `--json`, and the same reports. See [Compact results](#compact-results) below. |
| `-h`, `--help` | Show usage. |
| `-v`, `--version` | Show the installed version of the CLI. `--help` and the summary also name the `@surea11y/core` release that ran the scan, and `--json` has it as `engine.version`. |

These map directly onto `engineOptions`/`runOnly` (see [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md)) — `--rules`/`--exclude-rules` become `engineOptions.rules.include`/`.exclude`, `--tags` becomes `engineOptions.tags.include`, `--profile` and `--pack` become `engineOptions.profile` and `.packs`, and `--compact` becomes `engineOptions.output.detail: 'findings'`. `--wcag` and `--best-practices` become `runOnly.wcag` and `runOnly.bestPractices`; beside either of them, `--rules`, `--exclude-rules` and `--tags` go into `runOnly` too (`includeRuleIds`, `excludeRuleIds`, `tags`), since the engine reads its rule and tag lists from one place or the other.

A `--rules` or `--tags` list in which nothing names a known rule or tag exits `2` (for example `--tags wcag2.2aa`, where the tag is `wcag22aa`): run as given, it would check nothing and pass. An unknown entry beside known ones is ignored with a warning on stderr, as is an unknown `--exclude-rules` entry. A selection whose parts all name rules but cancel each other, an include that `--exclude-rules` takes away or `--rules` and `--tags` with no rule in common, runs no rule and exits `2` too.

## WCAG target and best practices

`--wcag` selects rules by conformance target, by the level each criterion has in that version:

```sh
surea11y scan ./dist/index.html --wcag 2.2                    # WCAG 2.2, Level A and AA
surea11y scan ./dist/index.html --wcag 2.1 --wcag-level A     # WCAG 2.1, Level A
surea11y scan ./dist/index.html --wcag 2.2 --best-practices   # and the best practices
```

4.1.1 Parsing, which WCAG 2.2 removed, is part of a `2.1` target and not of a `2.2` one. `--best-practices` adds the rules that name no WCAG criterion; a finding from one is good practice, not a WCAG failure, and no WCAG rollup counts it. `--rules` and `--tags` add to a target's rules, and `--exclude-rules` applies after. Beside `--profile`, `--best-practices` adds its rules and the profile still applies; `--wcag`, `--rules` and `--tags` choose the rules in a profile's place, so `--profile` with any of them exits `2`. A version other than `2.0`, `2.1` or `2.2`, a level other than `A`, `AA` or `AAA`, or `--wcag-level` without `--wcag` exits `2`.

`--tags` still selects by the tags rules carry, as before; see [`WCAG_CONFORMANCE.md`](https://github.com/SureA11y/core/blob/main/docs/WCAG_CONFORMANCE.md) for the tag sets.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Scan completed, no `fail` outcomes. |
| `1` | Scan completed, at least one `fail` outcome — the CI-gating case. |
| `2` | Usage error, or the scan itself couldn't run (bad path/URL, network failure, missing `jsdom`), or it would have checked nothing or less than asked: a `--rules`/`--tags` list naming no known rule or tag, a selection whose parts cancel out so that no rule runs (`--rules img-alt-present --exclude-rules img-alt-present`), a `--context` selector that is invalid or matches no element, a custom rule the engine could not run, a pack that can't be found or loaded or that the engine skipped, or a `--profile` that wasn't applied. No report or baseline is written. |

`cantTell` outcomes never affect the exit code — they're printed as a "needs human review" summary, consistent with the manual/`cantTell` mental model in [`TROUBLESHOOTING.md`](https://github.com/SureA11y/core/blob/main/docs/TROUBLESHOOTING.md#should-i-treat-canttell-as-a-failure). If you need `cantTell`-aware gating, use `--json` and inspect `checksResults` yourself, or call the library directly (see [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md#ci-gating-a-build-on-the-result)).

With `--baseline`, exit code `1` means at least one *new* (not-yet-baselined) `fail` occurrence, not any `fail` occurrence — see [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md).

## Baseline / allowlist

For an existing, imperfect site, gating on every `fail` on day one is often an adoption blocker. `--write-baseline`/`--baseline` let you accept the current state once and gate CI only on genuinely new violations from then on:

```sh
surea11y scan ./dist/index.html --write-baseline baseline.json   # once, commit the file
surea11y scan ./dist/index.html --baseline baseline.json         # in CI, from then on
```

See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md) for the matching semantics, file format, and known limitations.

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
  engine: @surea11y/core 1.11.1
  profile: acme-web-2026
  packs: @acme/a11y-policy@1.0.0
  pass: 7   fail: 2   cantTell: 6   notApplicable: 91

  occurrences by tier: fail: 2   cantTell: 8

FAIL (2 rule(s)):

  acme-no-autoplay  (serious, 1 fail occurrence(s))
    - html > body > main > video:nth-of-type(1)
      This video plays with sound as the page opens.
      hint: Remove autoplay, or add muted.

  img-alt-present  (serious, 1 fail occurrence(s))
    - html > body > main > img
      This <img> has no alt attribute.
      hint: Add an alt attribute that says what the image shows, or alt="" if the image is purely decorative.

cantTell — needs human review (6 rule(s)): contrast-computable, manual-review, media-alternative-transcript-evidence, no-autoplay-audio, page-title-patterns, video-caption
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

Open `report.html` directly from disk; no server, no external assets. Works alongside any other output mode. See [`REPORT.md`](https://github.com/SureA11y/core/blob/main/docs/REPORT.md).

## SARIF report

For GitHub Code Scanning or another SARIF-consuming dashboard:

```sh
surea11y scan ./dist/index.html --sarif results.sarif
```

Works alongside any other output mode, and alongside `--baseline` (already-known `fail` occurrences are omitted from the SARIF output rather than re-reported). See [`SARIF.md`](https://github.com/SureA11y/core/blob/main/docs/SARIF.md).

## JUnit report

For CI systems that show JUnit XML in their own test views (GitLab's merge request test widget, Azure DevOps' Tests tab, Jenkins, CircleCI):

```sh
surea11y scan ./dist/index.html --junit a11y.junit.xml
```

Each WCAG criterion becomes a test suite and each rule a test case: a `fail` rule is a failing test, a `cantTell` rule a skipped one (it needs human review, so it never turns the report red), and `notApplicable` rules are left out. With `--baseline`, a rule whose every failure is already recorded in the baseline is reported as skipped, not failing. The report never changes the exit code. See [`JUNIT.md`](https://github.com/SureA11y/core/blob/main/docs/JUNIT.md) for the full mapping.

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

This CLI depends on `jsdom` (to parse fetched/read HTML into a DOM) and on `@surea11y/core` (the engine). That split is the whole point of shipping the CLI separately: `@surea11y/core` itself has **zero runtime dependencies**, so using the library directly against a DOM you already have — jsdom, a real browser, Playwright, whatever — never pulls in `jsdom` a second time. Install `@surea11y/cli` when you want the command; install `@surea11y/core` when you want the API.
