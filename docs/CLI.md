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
| `--tags <tags>` | Comma-separated tags — e.g. `--tags wcag2a,wcag2aa` to target a conformance level (see [`WCAG_CONFORMANCE.md`](https://github.com/SureA11y/core/blob/main/docs/WCAG_CONFORMANCE.md)). |
| `--context <selector>` | Scope the scan to one CSS-selected subtree. |
| `--custom-rules <path>` | Load runtime custom rules from a local JS file. Repeatable. See [Custom rules](#custom-rules) below. |
| `--write-baseline <path>` | Write every current `fail` occurrence to `<path>`; never fails the build. See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md). |
| `--baseline <path>` | Gate only on occurrences not already recorded in `<path>`. See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md). |
| `--html <path>` | Write a self-contained, browsable HTML report to `<path>`. See [`REPORT.md`](https://github.com/SureA11y/core/blob/main/docs/REPORT.md). |
| `--sarif <path>` | Write a SARIF 2.1.0 report to `<path>` (e.g. for GitHub Code Scanning). See [`SARIF.md`](https://github.com/SureA11y/core/blob/main/docs/SARIF.md). |
| `-h`, `--help` | Show usage. |
| `-v`, `--version` | Show the installed version. |

These map directly onto `engineOptions`/`runOnly` (see [`ENGINE_OPTIONS.md`](https://github.com/SureA11y/core/blob/main/docs/ENGINE_OPTIONS.md)) — `--rules`/`--exclude-rules` become `engineOptions.rules.include`/`.exclude`, `--tags` becomes `engineOptions.tags.include`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Scan completed, no `fail` outcomes. |
| `1` | Scan completed, at least one `fail` outcome — the CI-gating case. |
| `2` | Usage error, or the scan itself couldn't run (bad path/URL, network failure, missing `jsdom`). |

`cantTell` outcomes never affect the exit code — they're printed as a "needs human review" summary, consistent with the manual/`cantTell` mental model in [`TROUBLESHOOTING.md`](https://github.com/SureA11y/core/blob/main/docs/TROUBLESHOOTING.md#should-i-treat-canttell-as-a-failure). If you need `cantTell`-aware gating, use `--json` and inspect `checksResults` yourself, or call the library directly (see [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md#ci-gating-a-build-on-the-result)).

With `--baseline`, exit code `1` means at least one *new* (not-yet-baselined) `fail` occurrence, not any `fail` occurrence — see [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md).

## Baseline / allowlist

For an existing, imperfect site, gating on every `fail` on day one is often an adoption blocker. `--write-baseline`/`--baseline` let you accept the current state once and gate CI only on genuinely new violations from then on:

```sh
surea11y scan ./dist/index.html --write-baseline baseline.json   # once, commit the file
surea11y scan ./dist/index.html --baseline baseline.json         # in CI, from then on
```

See [`BASELINE.md`](https://github.com/SureA11y/core/blob/main/docs/BASELINE.md) for the matching semantics, file format, and known limitations.

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
- Works alongside every other flag, including `--rules`/`--exclude-rules`/`--tags` (which can target your custom rule's `id` exactly like a built-in one) and `--baseline`/`--html`/`--sarif`.

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

## In CI

```sh
npx @surea11y/cli scan ./dist/index.html || exit 1
```

Or, since the exit code already reflects pass/fail, just let the command's own exit code propagate — most CI systems fail the step automatically on a non-zero exit. See [`CI_INTEGRATIONS.md`](https://github.com/SureA11y/core/blob/main/docs/CI_INTEGRATIONS.md) for ready-to-paste GitHub Actions and Bitbucket Pipelines templates, including a SARIF-upload example.

## A note on dependencies

This CLI depends on `jsdom` (to parse fetched/read HTML into a DOM) and on `@surea11y/core` (the engine). That split is the whole point of shipping the CLI separately: `@surea11y/core` itself has **zero runtime dependencies**, so using the library directly against a DOM you already have — jsdom, a real browser, Playwright, whatever — never pulls in `jsdom` a second time. Install `@surea11y/cli` when you want the command; install `@surea11y/core` when you want the API.
