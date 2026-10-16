# @surea11y/cli

Command-line WCAG 2.2 accessibility scanner for static HTML — baseline gating, HTML, SARIF and JUnit reports, custom rules. Powered by [`@surea11y/core`](https://github.com/SureA11y/core), the deterministic engine that tells you what it *can't* tell you.

```sh
npx @surea11y/cli scan ./index.html
npx @surea11y/cli scan https://example.com/ --wcag 2.2
```

## Install

```sh
npm install -g @surea11y/cli          # globally
npm install --save-dev @surea11y/cli  # or per-project, for CI
```

Requires Node.js `^20.19.0 || ^22.13.0 || >=24.0.0`.

## What it does

```
$ surea11y scan ./index.html

surea11y scan: file:///path/to/index.html
  engine: @surea11y/core 1.12.0
  pass: 15   fail: 4   cantTell: 4   notApplicable: 111

  occurrences by tier: fail: 4   cantTell: 5

FAIL (4 rule(s)):

  button-name-present  (serious, 1 fail occurrence(s))
    - html > body > main > button
      This button has no accessible name.
      hint: Give the button visible text, or name it with aria-label, so screen
      reader users know what it does.

  contrast-enhanced  (serious, 1 fail occurrence(s))
    - html > body > main > p
      Element has insufficient color contrast (AAA) of 2.85:1 (foreground:
      #999999, background: #ffffff, font size: 16px, font weight: normal).
      Expected contrast ratio of 7:1 (normal text).
      hint: Change the text color, the background color, or both, so the
      contrast ratio reaches at least 7:1.

  contrast-minimum  (serious, 1 fail occurrence(s))
    - html > body > main > p
      Element has insufficient color contrast of 2.85:1 (foreground: #999999,
      background: #ffffff, font size: 16px, font weight: normal). Expected
      contrast ratio of 4.5:1 (normal text).
      hint: Change the text color, the background color, or both, so the
      contrast ratio reaches at least 4.5:1.

  img-alt-present  (serious, 1 fail occurrence(s))
    - html > body > main > img
      This <img> has no alt attribute.
      hint: Add an alt attribute that says what the image shows, or alt="" if
      the image is purely decorative.

cantTell — needs human review (4 rule(s)): contrast-computable, link-name-quality,
manual-review, page-title-patterns

criteria (WCAG 2.2):
  fail       1.1.1 Non-text content: text alternatives; 1.4.3 Contrast: minimum;
             1.4.6 Contrast: enhanced; 4.1.2 Name, role, value: accessible name
  cantTell   2.1.1 Keyboard; 2.4.2 Page titled; 2.4.3 Focus order; 2.4.4 Link
             Purpose (In Context); 2.4.7 Focus visible; 2.4.9 Link Purpose (Link Only)
  pass       1.3.1 Info and Relationships; 2.2.2 Pause, Stop, Hide; 2.4.1 Bypass
             Blocks; 3.1.1 Language of page; 4.1.2 Name, role, value: ARIA validity
  notApplicable: 19
  A criterion that passes here means the checks that ran found nothing in it, not
  that the page conforms.
```

The `criteria` block reads the same scan by WCAG criterion, the way people usually ask ("does it fail 1.4.3?"). A criterion that only some of its checks decided, because the scan selected the others out (`--rules`, `--tags`), is marked `(partly checked: 1 of 2 checks not selected)`. `--compact` shows the block as counts. A passing criterion means the checks that ran found nothing, not that the page meets it: most criteria need a person to check them.

That last line is the point of the engine: rules that *cannot* be settled from static markup are reported as `cantTell` and routed to a human, instead of being silently dropped or guessed at. `cantTell` never affects the exit code.

Exit code `0` = clean, `1` = at least one `fail` (the CI-gating case), `2` = usage error or the scan couldn't run, including a scan that would have checked nothing or less than asked (a `--rules`/`--tags` typo, a `--context` selector that matches nothing, a custom rule or a pack that didn't run, a `--profile` that wasn't applied).

## What it can and can't scan

The CLI reads **static HTML only** — a local file, or the raw body of an HTTP(S) GET — and never executes page JavaScript. Client-rendered content won't be captured, and geometry-dependent rules report `notApplicable` (there's no real CSS layout under jsdom).

For client-rendered pages, drive a real browser and call the engine directly against the live DOM — see [`INTEGRATION.md`](https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md) Pattern 2, or use one of the ready-made bindings (Playwright, Puppeteer, Cypress, Selenium, WebdriverIO).

## Common uses

```sh
# Target a WCAG version and level (AA unless --wcag-level says otherwise)
surea11y scan ./dist/index.html --wcag 2.2

# The same, and the best-practice rules, which test no WCAG criterion
surea11y scan ./dist/index.html --wcag 2.2 --best-practices

# A design-system team's forms check: every forms rule, plus the contrast check
surea11y scan ./dist/form.html --tags forms --rules contrast-computable --include-mode or

# One check, judged at AA: reports 1.4.3, not the AAA 1.4.6 the same check covers
surea11y scan ./dist/index.html --rules contrast-computable --wcag-level AA

# Machine-readable output, in full or compact
surea11y scan ./dist/index.html --json > result.json
surea11y scan ./dist/index.html --compact --json > result.json

# Accept today's violations, gate CI only on new ones
surea11y scan ./dist/index.html --write-baseline baseline.json   # once, commit it
surea11y scan ./dist/index.html --baseline baseline.json         # in CI, from then on

# Browsable HTML report, and SARIF for GitHub Code Scanning
surea11y scan ./dist/index.html --html report.html --sarif results.sarif

# JUnit XML for the test views of GitLab, Azure DevOps, Jenkins and CircleCI
surea11y scan ./dist/index.html --junit a11y.junit.xml

# Your own org-specific rules
surea11y scan ./dist/index.html --custom-rules ./a11y-rules.js

# A standard or your organisation's checklist, from a pack, with its profile
surea11y scan ./dist/index.html --pack ./acme-policy-pack.js --profile acme-web-2026
```

Full flag reference, custom-rule contract, packs, and CI recipes: [`docs/CLI.md`](./docs/CLI.md). Its [Packs](./docs/CLI.md#packs) section has `acme-policy-pack.js`, a small pack to copy, with a page and the command that scans it.

## Do you need this package?

You need it when you want **a command instead of code**. Two examples.

### You want the CLI

A marketing site built to static HTML. The CI step is one shell line; there's no test file anywhere.

```yaml
# .github/workflows/a11y.yml
- run: npm run build
- run: npx @surea11y/cli scan ./dist/index.html --wcag 2.2
```

The scan exits `1` if anything fails, which fails the step. You wrote no JavaScript, so you needed the command.

### You don't

A dashboard whose chart only exists after you click "Load report". You're already writing a Playwright test, so call the engine directly:

```js
const { A11yCoreBuilder } = require('@surea11y/playwright');

test('dashboard is accessible after loading', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Load report' }).click();

  const results = await new A11yCoreBuilder({ page }).analyze();
  expect(results.checksResults.filter((r) => r.outcome === 'fail')).toEqual([]);
});
```

No `@surea11y/cli` here. This is also CI — but the CLI would be *useless* for it, because it never executes page JavaScript. Point `surea11y scan` at that URL and it sees the page before the click ever happens: no chart, nothing to check.

### The dividing line

It isn't local vs. CI — both examples are CI. It's:

- **Is what you want to scan present in the HTML the server sends?** The CLI works, and it's the cheap path: no browser to launch.
- **Does it only appear after JavaScript runs?** You need a real browser, so you need the library or a binding, and the CLI can't help.

That second case is why "use the CLI for pipelines" is a misleading shorthand — plenty of pipelines are the second example.

Either way you're running the same engine. [`@surea11y/core`](https://github.com/SureA11y/core) has **zero runtime dependencies** and evaluates whatever DOM you hand it, so if you already have a browser or a jsdom instance, you don't pay for `jsdom` twice. This package is the one that brings `jsdom` along, because turning fetched HTML into a DOM is what a CLI has to do. Splitting the two is what keeps that promise true.

## Part of the SureA11y family

One engine, several front ends. If the dividing line above pointed you away from
the CLI, install the one matching your setup instead — each pulls in
`@surea11y/core` for you.

| Your setup | Install |
|---|---|
| **Playwright** | [`@surea11y/playwright`](https://github.com/SureA11y/playwright#readme) |
| **Puppeteer** | [`@surea11y/puppeteer`](https://github.com/SureA11y/puppeteer#readme) |
| **Selenium** | [`@surea11y/selenium`](https://github.com/SureA11y/selenium#readme) |
| **Cypress** | [`@surea11y/cypress`](https://github.com/SureA11y/cypress#readme) |
| **WebdriverIO** | [`@surea11y/webdriverio`](https://github.com/SureA11y/webdriverio#readme) |
| **Jest** or **Vitest** component tests | [`@surea11y/test-matchers`](https://github.com/SureA11y/test-matchers#readme) |
| Your own script, against a DOM you already have | [`@surea11y/core`](https://github.com/SureA11y/core#readme) |

## Local development

```sh
npm install
npm test
```

To run against a local, unpublished `@surea11y/core` — when you're changing the
engine and the CLI together — pack it and install it without saving, so
`package.json` keeps declaring its normal semver range:

```sh
(cd ../core && npm pack --pack-destination /tmp)
npm install /tmp/surea11y-core-<version>.tgz --no-save --no-package-lock
npm test
```

Never commit a `file:` dependency. Note that `npm link` is not a substitute
here: it exposes the whole working directory and so ignores core's `files`
allowlist, which can resolve paths that won't exist in the published package.

See [`RELEASE.md`](./RELEASE.md) for the publish checklist and the cross-repo
ordering constraint.

## License

[MIT](./LICENSE). The engine, [`@surea11y/core`](https://github.com/SureA11y/core), is MPL-2.0.
