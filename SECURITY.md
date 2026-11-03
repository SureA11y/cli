# Security policy

## Scope

`@surea11y/cli` provides the `surea11y` command, a wrapper around the [`@surea11y/core`](https://github.com/SureA11y/core) engine. The engine itself reads a DOM and returns structured findings — see [its security policy](https://github.com/SureA11y/core/blob/main/SECURITY.md) for that half. This package adds the parts an engine deliberately doesn't have: file I/O, network access, and a plugin loader. Those are what's worth a security-conscious look here.

- **Fetching a URL.** `surea11y scan <url>` issues a plain HTTP(S) GET and reads the response body. It follows whatever redirects the platform `fetch` follows, and sends no credentials, cookies, or custom headers. Point it at an internal URL and it will reach that host from wherever you run it — the usual SSRF caveat applies if you ever wire the target argument up to untrusted input. The same goes for `--urls` and `--sitemap`: every page a list or a sitemap names is fetched, whatever its host.

- **Scanned HTML is parsed, never executed.** The fetched or read HTML is handed to jsdom without script execution enabled, so a scanned page's own JavaScript never runs, and no subresources (scripts, images, stylesheets, fonts) are requested. This is also why the CLI can't see client-rendered content — the limitation and the security property are the same fact.

- **`--browser` runs the page.** With `--browser`, each page opens in headless Chromium through the Playwright you install, its scripts run and it loads its subresources, as in any browser. Core's hooks are installed in the page before its scripts; they are meant for test and audit runs (see [`docs/CLI.md`](./docs/CLI.md#hooks)). Scan only pages you would open in a browser on that machine.

- **`--custom-rules` is arbitrary code execution, by design.** The path you pass is `require()`d directly into the CLI's own process, with no sandbox, and its `runInPage` runs with full Node privileges. That is the intended contract — it's how a rule gets to be a real function instead of a serialized string — but it means a custom rules file is exactly as trusted as any other script you'd run. It only ever accepts a **local path, never a URL**, specifically so that scanning a remote page can't cause remote code to be fetched and run. Treat a rules file from a third party the way you'd treat a build plugin.

- **`--pack` is code too.** A pack, given by package name or local path, is `require()`d into the CLI's process in the same way, and its rules run in the scan. Install and load packs you trust, as you would any dependency.

- **Files the CLI writes.** `--html`, `--sarif`, `--junit`, `--manual-checks`, `--write-baseline` and `procedures -o` write to paths you supply, overwriting them without prompting, and `--migrate-baseline` rewrites the baseline in place. The HTML report, the SARIF log and the JUnit report embed markup snippets from the scanned page; if that page contained secrets, the report now contains them too — worth remembering before attaching one to a public CI artifact or uploading it to a shared dashboard.

- **Dependencies.** This package depends on `jsdom` (to parse HTML into a DOM), `@surea11y/core` (the engine, which itself has zero runtime dependencies) and `@surea11y/binding-base` (shared helpers, with no dependencies of its own). `playwright`, for `--browser`, is one you install yourself. Installing the CLI is the only thing that pulls `jsdom` into a tree — that separation is the reason this package exists.

## Reporting a vulnerability

If you find a security issue, please report it privately rather than opening a public issue — email rumoroso.a11y@gmail.com with a description and, if possible, a minimal reproduction.

You can expect an acknowledgement within five working days. This is a solo-maintained project, so please allow 90 days from that acknowledgement before public disclosure, and get in touch again if you haven't heard back.

There is no bug bounty program.

## Supported versions

Only the latest published version on npm receives security fixes. See [`CHANGELOG.md`](./CHANGELOG.md) for release history.
