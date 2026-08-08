# surea11y

Command-line WCAG 2.2 accessibility scanner for static HTML — baseline gating, HTML and SARIF reports, custom rules. Powered by [`@surea11y/core`](https://github.com/SureA11y/core), the deterministic engine that tells you what it *can't* tell you.

```sh
npx surea11y scan ./index.html
npx surea11y scan https://example.com/ --tags wcag2a,wcag2aa
```

## Install

```sh
npm install -g surea11y          # globally
npm install --save-dev surea11y  # or per-project, for CI
```

Requires Node.js `^20.19.0 || ^22.13.0 || >=24.0.0`.

## What it does

```
$ surea11y scan ./index.html

surea11y scan: file:///path/to/index.html
  pass: 6   fail: 3   cantTell: 4   notApplicable: 112

  occurrences by tier: fail: 3   cantTell: 5

FAIL (3 rule(s)):

  contrast-minimum  (serious, 1 fail occurrence(s))
    - html > body > main > p
      Element has insufficient color contrast of 2.85:1 (foreground: #999999,
      background: #ffffff, font size: 0px, font weight: normal). Expected
      contrast ratio of 4.5:1 (normal text).

  img-alt-present  (serious, 1 fail occurrence(s))
    - html > body > main > img
      Missing alt attribute on <img>.
      hint: Add an alt attribute (use alt="" only for decorative images).

cantTell — needs human review (4 rule(s)): contrast-computable, link-name-quality,
manual-review, page-title-patterns
```

That last line is the point of the engine: rules that *cannot* be settled from static markup are reported as `cantTell` and routed to a human, instead of being silently dropped or guessed at. `cantTell` never affects the exit code.

Exit code `0` = clean, `1` = at least one `fail` (the CI-gating case), `2` = usage error or the scan couldn't run.

## What it can and can't scan

The CLI reads **static HTML only** — a local file, or the raw body of an HTTP(S) GET — and never executes page JavaScript. Client-rendered content won't be captured, and geometry-dependent rules report `notApplicable` (there's no real CSS layout under jsdom).

For client-rendered pages, drive a real browser and call the engine directly against the live DOM — see [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md) Pattern 2, or use one of the ready-made bindings (Playwright, Puppeteer, Cypress, Selenium, WebdriverIO).

## Common uses

```sh
# Target a conformance level
surea11y scan ./dist/index.html --tags wcag2a,wcag2aa

# Machine-readable output
surea11y scan ./dist/index.html --json > result.json

# Accept today's violations, gate CI only on new ones
surea11y scan ./dist/index.html --write-baseline baseline.json   # once, commit it
surea11y scan ./dist/index.html --baseline baseline.json         # in CI, from then on

# Browsable HTML report, and SARIF for GitHub Code Scanning
surea11y scan ./dist/index.html --html report.html --sarif results.sarif

# Your own org-specific rules
surea11y scan ./dist/index.html --custom-rules ./a11y-rules.js
```

Full flag reference, custom-rule contract, and CI recipes: [`docs/CLI.md`](./docs/CLI.md).

## CLI vs. library

Install **`surea11y`** (this package) when you want the command. It depends on `jsdom` to turn HTML into a DOM, and on `@surea11y/core` for the rules.

Install **[`@surea11y/core`](https://github.com/SureA11y/core)** when you want the API. It has **zero runtime dependencies** and evaluates whatever DOM you hand it — so if you already have a browser or a jsdom instance, you don't pay for `jsdom` twice. Splitting the CLI out of the engine is what keeps that promise true.

## Local development

`@surea11y/core` 1.4.0 is not on the registry yet, so install it from a locally packed tarball. `package.json` keeps declaring `^1.4.0` — never commit a `file:` dependency.

```sh
(cd ../core && npm pack --pack-destination /tmp)
npm install /tmp/surea11y-core-1.4.0.tgz --no-save --no-package-lock
npm test
```

Once core 1.4.0 publishes, a plain `npm install` is enough. See [`RELEASE.md`](./RELEASE.md) for the publish checklist and the cross-repo ordering constraint.

## License

[MIT](./LICENSE). The engine, [`@surea11y/core`](https://github.com/SureA11y/core), is MPL-2.0.
