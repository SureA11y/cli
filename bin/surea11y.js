#!/usr/bin/env node

'use strict';

/**
 * surea11y CLI — a thin wrapper around @surea11y/core for ad hoc/CI use.
 *
 * Static-HTML only: it does not execute page JavaScript, so client-rendered
 * content won't be scanned. For that, use a real browser via Puppeteer/
 * Playwright — see
 * https://github.com/SureA11y/core/blob/main/docs/INTEGRATION.md Pattern 2.
 *
 * Usage:
 *   surea11y scan <file-or-url> [options]
 *
 * See docs/CLI.md for the full option reference.
 */

const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const { buildBaselineEntries, matchBaseline } = require('@surea11y/core/baseline');
const { renderHtmlReport } = require('@surea11y/core/report');
const { renderSarifReport } = require('@surea11y/core/sarif');

// Piping output to `head`/`less`/etc. closes stdout early — without this,
// the next write throws an unhandled EPIPE and crashes with a raw stack
// trace instead of just stopping quietly, like well-behaved CLI tools do.
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') process.exit(0);
  throw err;
});

function printHelp() {
  process.stdout.write(`surea11y v${pkg.version}

Usage:
  surea11y scan <file-or-url> [options]

Options:
  --json                  Print the raw result object as JSON instead of a summary
  --locale <locale>       Locale for output text (default: en)
  --rules <ids>           Comma-separated rule IDs to run (only these)
  --exclude-rules <ids>   Comma-separated rule IDs to exclude
  --tags <tags>           Comma-separated tags to run (e.g. wcag2a,wcag2aa)
  --context <selector>    CSS selector to scope the scan to a subtree
  --custom-rules <path>   Load runtime custom rules from a JS file (repeatable)
  --write-baseline <path> Write every current "fail" occurrence to <path>; never fails the build
  --baseline <path>       Gate only on occurrences not already recorded in <path>
  --html <path>           Write a self-contained, browsable HTML report to <path>
  --sarif <path>          Write a SARIF 2.1.0 report to <path> (for GitHub Code Scanning etc.)
  -h, --help              Show this help
  -v, --version           Show the installed version

Exit codes:
  0  scan completed, no "fail" outcomes (or no *new* ones, with --baseline)
  1  scan completed, at least one "fail" outcome (or *new* one, with --baseline)
  2  usage error or the scan itself could not run (bad path/URL, network failure, etc.)

Examples:
  surea11y scan ./index.html
  surea11y scan https://example.com/ --tags wcag2a,wcag2aa
  surea11y scan ./index.html --json > result.json
  surea11y scan ./index.html --write-baseline baseline.json
  surea11y scan ./index.html --baseline baseline.json
  surea11y scan ./index.html --html report.html
  surea11y scan ./index.html --baseline baseline.json --sarif results.sarif
  surea11y scan ./index.html --custom-rules ./a11y-rules.js

See docs/CLI.md for the full reference (baseline/allowlist, HTML report, SARIF report, custom rules):
https://github.com/SureA11y/cli/blob/main/docs/CLI.md
`);
}

function parseArgs(argv) {
  const out = { _: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--json':
        out.json = true;
        break;
      case '--locale':
        out.locale = argv[++i];
        break;
      case '--rules':
        out.rules = argv[++i];
        break;
      case '--exclude-rules':
        out.excludeRules = argv[++i];
        break;
      case '--tags':
        out.tags = argv[++i];
        break;
      case '--context':
        out.context = argv[++i];
        break;
      case '--custom-rules':
        (out.customRules = out.customRules || []).push(argv[++i]);
        break;
      case '--baseline':
        out.baseline = argv[++i];
        break;
      case '--write-baseline':
        out.writeBaseline = argv[++i];
        break;
      case '--html':
        out.html = argv[++i];
        break;
      case '--sarif':
        out.sarif = argv[++i];
        break;
      case '-h':
      case '--help':
        out.help = true;
        break;
      case '-v':
      case '--version':
        out.version = true;
        break;
      default:
        out._.push(a);
    }
  }
  return out;
}

function isUrl(s) {
  return /^https?:\/\//i.test(s);
}

function formatError(err) {
  const base = err && err.message ? err.message : String(err);
  const cause =
    err && err.cause && err.cause.message
      ? err.cause.message
      : err && err.cause
        ? String(err.cause)
        : '';
  return cause ? `${base}: ${cause}` : base;
}

async function loadHtml(target) {
  if (isUrl(target)) {
    const res = await fetch(target);
    if (!res.ok) {
      throw new Error(`Fetching ${target} failed: HTTP ${res.status} ${res.statusText}`);
    }
    return { html: await res.text(), url: target };
  }

  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) {
    throw new Error(`No such file: ${resolved}`);
  }
  return { html: fs.readFileSync(resolved, 'utf8'), url: `file://${resolved}` };
}

function buildEngineOptions(args, customRules) {
  const engineOptions = {};
  if (args.locale) engineOptions.locale = args.locale;
  if (args.rules || args.excludeRules) {
    engineOptions.rules = {};
    if (args.rules) engineOptions.rules.include = args.rules;
    if (args.excludeRules) engineOptions.rules.exclude = args.excludeRules;
  }
  if (args.tags) engineOptions.tags = { include: args.tags };
  if (customRules && customRules.length) engineOptions.customRules = customRules;
  return engineOptions;
}

// Loads one --custom-rules file. Rules run in the same process as the scan, so
// runInPage/applicability may be real functions rather than source strings --
// full descriptor contract in the engine's docs/ENGINE_OPTIONS.md. Validated
// here so a typo fails as a usage error instead of silently dropping a rule.
function loadCustomRulesFile(customRulesPath) {
  const resolved = path.resolve(process.cwd(), customRulesPath);

  let loaded;
  try {
    loaded = require(resolved);
  } catch (err) {
    throw new Error(`Could not load custom rules file "${customRulesPath}": ${formatError(err)}`, {
      cause: err
    });
  }

  const descriptors = Array.isArray(loaded) ? loaded : [loaded];

  for (const d of descriptors) {
    const hasId = d && typeof d === 'object' && typeof d.id === 'string' && d.id.trim();
    const hasRunInPage =
      d &&
      (typeof d.runInPage === 'function' ||
        (typeof d.runInPage === 'string' && d.runInPage.trim()));
    if (!hasId || !hasRunInPage) {
      throw new Error(
        `Custom rules file "${customRulesPath}" must export a rule descriptor ({ id, runInPage, ... }) or an array of them. See docs/CLI.md#custom-rules.`
      );
    }
  }

  return descriptors;
}

function printSummary(result, baselineMatch) {
  function getOccurrenceOutcome(ruleResult, occurrence) {
    const occurrenceOutcome =
      occurrence &&
      (occurrence.occurrenceOutcome === 'fail' || occurrence.occurrenceOutcome === 'cantTell'
        ? occurrence.occurrenceOutcome
        : occurrence.outcome === 'fail' || occurrence.outcome === 'cantTell'
          ? occurrence.outcome
          : null);
    if (occurrenceOutcome) return occurrenceOutcome;
    return (
      ruleResult &&
      (ruleResult.outcome === 'fail' || ruleResult.outcome === 'cantTell'
        ? ruleResult.outcome
        : null)
    );
  }

  const byOutcome = { pass: 0, fail: 0, cantTell: 0, notApplicable: 0 };
  for (const r of result.checksResults) {
    if (Object.prototype.hasOwnProperty.call(byOutcome, r.outcome)) byOutcome[r.outcome] += 1;
  }
  const occurrenceTierCounts = { fail: 0, cantTell: 0 };
  for (const r of result.checksResults) {
    if (!Array.isArray(r.occurrences)) continue;
    for (const occ of r.occurrences) {
      const tier = getOccurrenceOutcome(r, occ);
      if (tier === 'fail' || tier === 'cantTell') occurrenceTierCounts[tier] += 1;
    }
  }

  process.stdout.write(`\nsurea11y scan: ${result.url || '(no url)'}\n`);
  process.stdout.write(
    `  pass: ${byOutcome.pass}   fail: ${byOutcome.fail}   cantTell: ${byOutcome.cantTell}   notApplicable: ${byOutcome.notApplicable}\n\n`
  );
  process.stdout.write(
    `  occurrences by tier: fail: ${occurrenceTierCounts.fail}   cantTell: ${occurrenceTierCounts.cantTell}\n\n`
  );

  const fails = result.checksResults.filter((r) => r.outcome === 'fail');
  if (fails.length) {
    process.stdout.write(`FAIL (${fails.length} rule(s)):\n`);
    for (const r of fails) {
      const failOccurrences = (r.occurrences || []).filter(
        (occ) => getOccurrenceOutcome(r, occ) === 'fail'
      );
      const cantTellOccurrences = (r.occurrences || []).filter(
        (occ) => getOccurrenceOutcome(r, occ) === 'cantTell'
      );
      process.stdout.write(
        `\n  ${r.ruleId}  (${r.severity}, ${failOccurrences.length} fail occurrence(s)${cantTellOccurrences.length ? `, ${cantTellOccurrences.length} needs-review occurrence(s)` : ''})\n`
      );
      for (const occ of failOccurrences.slice(0, 5)) {
        process.stdout.write(`    - ${occ.selector || '(no selector)'}\n      ${occ.summary}\n`);
        if (occ.hint) process.stdout.write(`      hint: ${occ.hint}\n`);
      }
      if (failOccurrences.length > 5) {
        process.stdout.write(`    ... and ${failOccurrences.length - 5} more\n`);
      }
    }
    process.stdout.write('\n');
  }

  const cantTellRuleIds = new Set();
  for (const r of result.checksResults) {
    if (!Array.isArray(r.occurrences)) continue;
    if ((r.occurrences || []).some((occ) => getOccurrenceOutcome(r, occ) === 'cantTell')) {
      cantTellRuleIds.add(r.ruleId);
    }
  }
  const cantTells = Array.from(cantTellRuleIds);
  if (cantTells.length) {
    process.stdout.write(
      `cantTell — needs human review (${cantTells.length} rule(s)): ${cantTells.join(', ')}\n\n`
    );
  }

  if (baselineMatch) {
    process.stdout.write(
      `baseline: ${baselineMatch.knownCount} known, ${baselineMatch.newCount} new, ${baselineMatch.staleCount} stale (no longer detected)\n`
    );
    if (baselineMatch.newCount) {
      process.stdout.write(`\nNEW (not in baseline, ${baselineMatch.newCount} occurrence(s)):\n`);
      for (const occ of baselineMatch.newOccurrences.slice(0, 5)) {
        process.stdout.write(
          `  - ${occ.ruleId}: ${occ.selector || '(no selector)'}\n    ${occ.summary}\n`
        );
      }
      if (baselineMatch.newOccurrences.length > 5) {
        process.stdout.write(`  ... and ${baselineMatch.newOccurrences.length - 5} more\n`);
      }
    }
    process.stdout.write('\n');
  }
}

function loadBaselineFile(baselinePath) {
  let raw;
  try {
    raw = fs.readFileSync(baselinePath, 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read baseline file "${baselinePath}": ${formatError(err)}. Run with --write-baseline ${baselinePath} first to create one.`,
      { cause: err }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Baseline file "${baselinePath}" is not valid JSON: ${formatError(err)}`, {
      cause: err
    });
  }

  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(
      `Baseline file "${baselinePath}" is not a supported baseline (expected { version: 1, entries: [...] }). Regenerate it with --write-baseline.`
    );
  }

  return parsed;
}

async function runScan(args) {
  const target = args._[0];
  if (!target) {
    process.stderr.write('Error: scan requires a file path or URL. See --help.\n');
    process.exitCode = 2;
    return;
  }

  if (args.baseline && args.writeBaseline) {
    process.stderr.write(
      'Error: --baseline and --write-baseline cannot be used together in the same run. See --help.\n'
    );
    process.exitCode = 2;
    return;
  }

  let baselineFile = null;
  if (args.baseline) {
    try {
      baselineFile = loadBaselineFile(args.baseline);
    } catch (err) {
      process.stderr.write(`Error: ${formatError(err)}\n`);
      process.exitCode = 2;
      return;
    }
  }

  let customRules = [];
  if (args.customRules && args.customRules.length) {
    try {
      for (const customRulesPath of args.customRules) {
        customRules = customRules.concat(loadCustomRulesFile(customRulesPath));
      }
    } catch (err) {
      process.stderr.write(`Error: ${formatError(err)}\n`);
      process.exitCode = 2;
      return;
    }
  }

  let html, url;
  try {
    ({ html, url } = await loadHtml(target));
  } catch (err) {
    process.stderr.write(`Error: ${formatError(err)}\n`);
    process.exitCode = 2;
    return;
  }

  let JSDOM;
  try {
    ({ JSDOM } = require('jsdom'));
  } catch {
    process.stderr.write(
      'Error: the surea11y CLI requires jsdom. It is a dependency of this package, so a missing jsdom means a broken install — try reinstalling with `npm install -g @surea11y/cli` (or `npm install` in your project).\n'
    );
    process.exitCode = 2;
    return;
  }

  // Deferred so `--help`/`--version` don't load the full rule catalog.
  const { runDomRulesInPage } = require('@surea11y/core');

  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;

  let result;
  try {
    result = runDomRulesInPage(
      url,
      args.context || null,
      buildEngineOptions(args, customRules),
      null
    );
  } finally {
    dom.window.close();
  }

  if (args.html) {
    fs.writeFileSync(
      args.html,
      renderHtmlReport(result, { title: `surea11y scan report — ${target}` })
    );
    process.stderr.write(`Wrote HTML report to: ${args.html}\n`);
  }

  if (args.sarif) {
    fs.writeFileSync(
      args.sarif,
      renderSarifReport(result, {
        toolVersion: pkg.version,
        informationUri: (pkg.homepage || '').replace(/#.*$/, ''),
        baselineEntries: baselineFile ? baselineFile.entries : undefined
      })
    );
    process.stderr.write(`Wrote SARIF report to: ${args.sarif}\n`);
  }

  if (args.writeBaseline) {
    const entries = buildBaselineEntries(result);
    const payload = { version: 1, generatedAt: new Date().toISOString(), entries };
    fs.writeFileSync(args.writeBaseline, JSON.stringify(payload, null, 2) + '\n');

    if (args.json) {
      process.stdout.write(
        JSON.stringify(
          {
            ...result,
            baseline: { mode: 'write', path: args.writeBaseline, entries: entries.length }
          },
          null,
          2
        ) + '\n'
      );
    } else {
      printSummary(result);
    }
    process.stderr.write(
      `Wrote ${entries.length} occurrence(s) to baseline: ${args.writeBaseline}\n`
    );
    process.exitCode = 0;
    return;
  }

  if (baselineFile) {
    const match = matchBaseline(result, baselineFile.entries);

    if (args.json) {
      process.stdout.write(
        JSON.stringify({ ...result, baseline: { mode: 'check', ...match } }, null, 2) + '\n'
      );
    } else {
      printSummary(result, match);
    }
    process.exitCode = match.newCount > 0 ? 1 : 0;
    return;
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    printSummary(result);
  }

  const hasFail = result.checksResults.some((r) => r.outcome === 'fail');
  process.exitCode = hasFail ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (args.help || args._.length === 0) {
    printHelp();
    process.exitCode = args._.length === 0 && !args.help ? 2 : 0;
    return;
  }

  const [command, ...rest] = args._;
  if (command !== 'scan') {
    process.stderr.write(
      `Error: unknown command "${command}". Only "scan" is supported. See --help.\n`
    );
    process.exitCode = 2;
    return;
  }

  args._ = rest;
  await runScan(args);
}

main().catch((err) => {
  process.stderr.write(`Error: ${formatError(err)}\n`);
  process.exitCode = 2;
});
