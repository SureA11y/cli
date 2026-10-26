#!/usr/bin/env node

'use strict';

/**
 * surea11y CLI — a thin wrapper around @surea11y/core for ad hoc/CI use.
 *
 * By default it scans static HTML in jsdom, without running the page's
 * JavaScript. --browser scans in headless Chromium through Playwright (which
 * the user installs), so client-rendered content is scanned as rendered.
 *
 * Usage:
 *   surea11y scan <file-or-url>... [options]
 *
 * See docs/CLI.md for the full option reference.
 */

const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const {
  buildBaselineEntries,
  matchBaseline,
  migrateBaselineEntries
} = require('@surea11y/core/baseline');
const { renderHtmlReport } = require('@surea11y/core/report');
const { renderSarifReport } = require('@surea11y/core/sarif');
const { renderJunitReport } = require('@surea11y/core/junit');

// Piping output to `head`/`less`/etc. closes stdout early — without this,
// the next write throws an unhandled EPIPE and crashes with a raw stack
// trace instead of just stopping quietly, like well-behaved CLI tools do.
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') process.exit(0);
  throw err;
});

// The engine's own package.json is a supported export, and reading it doesn't
// load the rule catalog, so --help can name the engine release cheaply.
function getCoreVersion() {
  try {
    return require('@surea11y/core/package.json').version || null;
  } catch {
    return null;
  }
}

function printHelp() {
  const coreVersion = getCoreVersion();
  process.stdout
    .write(`surea11y v${pkg.version}${coreVersion ? ` (@surea11y/core v${coreVersion})` : ''}

Usage:
  surea11y scan <file-or-url>... [options]

Options:
  --urls <file>           Also scan each path or URL listed in <file>, one per line (# starts a comment)
  --sitemap <url-or-file> Also scan the pages a sitemap.xml lists (a sitemap index is followed)
  --max-pages <n>         With --sitemap: scan at most <n> of its pages (default: 50)
  --browser               Scan in headless Chromium, running the page's scripts (needs playwright installed)
  --wait-for <selector>   With --browser: wait until an element matching <selector> is shown, then scan
  --wait-timeout <ms>     With --wait-for: how long to wait (default: 30000)
  --width <px>            With --browser: the viewport width (default: 1280; 320 for a phone-sized layout);
                          several, comma-separated (1280,320), scan the page at each
  --color-scheme <s>      With --browser: emulate the user's light or dark color scheme; light,dark scans
                          in both. Several widths or schemes scan every combination, one merged result
  --no-hooks              With --browser: don't install core's internals and listener hooks before
                          the page's scripts (installed by default)
  --live-regions          With --browser: also install core's live-region hook, for status messages
                          the page shows after it loads (with --wait-for)
  --fail-on-severity <s>  Exit 1 only for a failing rule of severity <s> or above: critical, serious,
                          moderate or minor (default: any failure)
  --fail-on-lean          Also exit 1 for a question that likely fails (its lean points to fail)
  --lean-fail-wcag-only   With --fail-on-lean: only the likely failures of rules mapped to a WCAG criterion
  --json                  Print the raw result object as JSON instead of a summary (an array for several pages)
  --locale <locale>       Locale for output text (default: en)
  --rules <ids>           Comma-separated rule IDs to run (only these)
  --exclude-rules <ids>   Comma-separated rule IDs to exclude
  --tags <tags>           Comma-separated tags to run (e.g. wcag2a,wcag2aa)
  --include-mode <mode>   How --rules and --tags combine: and (default, rules matching both) or or (either)
  --wcag <version>        Run the rules for a WCAG target: 2.0, 2.1 or 2.2, at --wcag-level and below
  --wcag-level <level>    The --wcag target's level: A, AA (default) or AAA; without --wcag,
                          the level of the criteria reported, without changing which rules run
  --best-practices        Also run the best-practice rules, which test no WCAG criterion (alone: only those)
  --context <selector>    CSS selector to scope the scan to a subtree
  --custom-rules <path>   Load runtime custom rules from a JS file (repeatable)
  --pack <name-or-path>   Load a pack (rules, a standard, its profiles), by package name or file (repeatable)
  --profile <name>        Run a conformance profile (e.g. en301549-v4.1.1, or a pack's own)
  --write-baseline <path> Write every current "fail" occurrence to <path> (with --fail-on-lean, every
                          likely failure too); never fails the build
  --baseline <path>       Gate only on occurrences not already recorded in <path>
  --migrate-baseline <path>
                          Rewrite the baseline at <path> under the reason codes core gives now, against
                          the pages given (or, with none, only the moves that need no scan)
  --html <path>           Write a self-contained, browsable HTML report to <path> (several pages:
                          <path>, then <name>-2.<ext>, <name>-3.<ext>...)
  --sarif <path>          Write a SARIF 2.1.0 report to <path> (for GitHub Code Scanning etc.)
  --junit <path>          Write a JUnit XML report to <path> (for GitLab, Azure DevOps, Jenkins, CircleCI)
  --compact               Keep pass/notApplicable results to their rule, outcome and type (a smaller --json)
  -h, --help              Show this help
  -v, --version           Show the installed version

Exit codes:
  0  scan completed, no "fail" outcomes (or no *new* ones, with --baseline; or none at
     --fail-on-severity's level), and with --fail-on-lean no likely failures, on every page
  1  scan completed, at least one "fail" outcome (or *new* one, with --baseline; at or
     above --fail-on-severity's level), or with --fail-on-lean a likely failure, on any page
  2  usage error or the scan itself could not run (bad path/URL, network failure,
     a --rules/--tags list naming no rule or tag, or a selection that runs no
     rule, a --context selector that is invalid or matches nothing, a custom
     rule or a pack the engine could not run, a --profile that was not
     applied, --browser without playwright, etc.)

Examples:
  surea11y scan ./index.html
  surea11y scan ./index.html ./about.html --urls more-pages.txt
  surea11y scan --sitemap https://example.com/sitemap.xml --max-pages 20
  surea11y scan https://app.example.com/ --browser
  surea11y scan https://app.example.com/orders --browser --wait-for "#orders-table"
  surea11y scan ./index.html --browser --width 320 --color-scheme dark
  surea11y scan ./index.html --fail-on-severity serious
  surea11y scan ./index.html --fail-on-lean --lean-fail-wcag-only --junit a11y.junit.xml
  surea11y scan https://app.example.com/ --browser --no-hooks
  surea11y scan https://example.com/ --wcag 2.2 --wcag-level AA
  surea11y scan ./index.html --tags forms --rules contrast-computable --include-mode or
  surea11y scan ./index.html --rules contrast-computable --wcag-level AA
  surea11y scan ./index.html --json > result.json
  surea11y scan ./index.html --write-baseline baseline.json
  surea11y scan ./index.html --baseline baseline.json
  surea11y scan ./index.html --fail-on-lean --write-baseline baseline.json
  surea11y scan ./index.html --migrate-baseline baseline.json
  surea11y scan ./index.html --html report.html
  surea11y scan ./index.html --baseline baseline.json --sarif results.sarif
  surea11y scan ./index.html --junit a11y.junit.xml
  surea11y scan ./index.html --custom-rules ./a11y-rules.js
  surea11y scan ./index.html --pack ./acme-policy-pack.js --profile acme-web-2026

See docs/CLI.md for the full reference (baseline/allowlist, HTML, SARIF and JUnit reports, custom rules, packs):
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
      case '--include-mode':
        out.includeMode = argv[++i];
        break;
      case '--context':
        out.context = argv[++i];
        break;
      case '--custom-rules':
        (out.customRules = out.customRules || []).push(argv[++i]);
        break;
      case '--pack':
        (out.packs = out.packs || []).push(argv[++i]);
        break;
      case '--profile':
        out.profile = argv[++i];
        break;
      case '--wcag':
        out.wcag = argv[++i];
        break;
      case '--wcag-level':
        out.wcagLevel = argv[++i];
        break;
      case '--best-practices':
        out.bestPractices = true;
        break;
      case '--compact':
        out.compact = true;
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
      case '--junit':
        out.junit = argv[++i];
        break;
      case '--urls':
        out.urls = argv[++i];
        break;
      case '--sitemap':
        out.sitemap = argv[++i];
        break;
      case '--max-pages':
        out.maxPages = argv[++i];
        break;
      case '--browser':
        out.browser = true;
        break;
      case '--no-hooks':
        out.noHooks = true;
        break;
      case '--live-regions':
        out.liveRegions = true;
        break;
      case '--wait-for':
        out.waitFor = argv[++i];
        break;
      case '--wait-timeout':
        out.waitTimeout = argv[++i];
        break;
      case '--width':
        out.width = argv[++i];
        break;
      case '--color-scheme':
        out.colorScheme = argv[++i];
        break;
      case '--fail-on-severity':
        out.failOnSeverity = argv[++i];
        break;
      case '--fail-on-lean':
        out.failOnLean = true;
        break;
      case '--lean-fail-wcag-only':
        out.leanFailWcagOnly = true;
        break;
      case '--migrate-baseline':
        out.migrateBaseline = argv[++i];
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

// An error's message, and its cause's first line: Node's message for a module
// it can't find carries its require stack after it.
function formatError(err) {
  const base = err && err.message ? err.message : String(err);
  // An error whose message already says what its cause did.
  if (err && err.causeIncluded) return base;
  const cause =
    err && err.cause && err.cause.message
      ? err.cause.message.split('\n')[0]
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

function buildEngineOptions(args, customRules, packs) {
  const engineOptions = {};
  if (args.profile) engineOptions.profile = args.profile;
  if (packs && packs.length) engineOptions.packs = packs;
  if (args.locale) engineOptions.locale = args.locale;
  if (args.compact) engineOptions.output = { detail: 'findings' };
  if (customRules && customRules.length) engineOptions.customRules = customRules;
  // A --wcag target carries its own level; without one, --wcag-level gives
  // the level of the criteria reported, whichever rules run.
  if (args.wcagLevel && !args.wcag) engineOptions.wcagLevel = args.wcagLevel;
  if (usesRunOnly(args)) return engineOptions;
  if (args.includeMode) engineOptions.includeMode = args.includeMode;
  if (args.rules || args.excludeRules) {
    engineOptions.rules = {};
    if (args.rules) engineOptions.rules.include = args.rules;
    if (args.excludeRules) engineOptions.rules.exclude = args.excludeRules;
  }
  if (args.tags) engineOptions.tags = { include: args.tags };
  return engineOptions;
}

function usesRunOnly(args) {
  return Boolean(args.wcag || args.bestPractices);
}

function splitList(value) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

// A WCAG target and the best practices exist only in runOnly, and a runOnly
// filter makes the engine ignore engineOptions' rule and tag lists, so with
// either of them --rules, --exclude-rules and --tags move here too.
function buildRunOnly(args) {
  if (!usesRunOnly(args)) return null;
  const runOnly = {};
  if (args.wcag) runOnly.wcag = { version: args.wcag, level: args.wcagLevel || 'AA' };
  if (args.bestPractices) runOnly.bestPractices = true;
  if (args.rules) runOnly.includeRuleIds = splitList(args.rules);
  if (args.tags) runOnly.tags = splitList(args.tags);
  if (args.excludeRules) runOnly.excludeRuleIds = splitList(args.excludeRules);
  if (args.includeMode) runOnly.includeMode = args.includeMode;
  return runOnly;
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

// Loads one --pack: a file (a path, or a name ending in .js) relative to the
// working directory, or a package installed there (or next to the CLI). The
// engine checks the pack itself; a pack it can't run is reported after the
// scan (findScanProblem).
function loadPack(spec) {
  const isPath = /^[./\\]/.test(spec) || /\.[cm]?js$/.test(spec) || path.isAbsolute(spec);
  let resolved;
  try {
    resolved = isPath
      ? require.resolve(path.resolve(process.cwd(), spec))
      : require.resolve(spec, { paths: [process.cwd(), __dirname] });
  } catch (err) {
    throw new Error(
      isPath
        ? `Could not find pack "${spec}"`
        : `Could not find pack "${spec}"; install it in this project (npm install ${spec})`,
      { cause: err }
    );
  }
  let pack;
  try {
    pack = require(resolved);
  } catch (err) {
    throw new Error(`Could not load pack "${spec}"`, { cause: err });
  }
  if (pack && typeof pack === 'object' && pack.default && typeof pack.default === 'object') {
    pack = pack.default;
  }
  if (!pack || typeof pack !== 'object' || typeof pack.name !== 'string') {
    throw new Error(
      `Pack "${spec}" must export a pack ({ name, version, namespace, core, ... }). See docs/CLI.md#packs.`
    );
  }
  return pack;
}

// The engine throws with a `code` when an option can't mean what was asked:
// a --rules or --tags list that names no rule or tag (INVALID_RUN_ONLY), or a
// --context selector the DOM can't parse (INVALID_CONTEXT_SELECTOR). Its
// messages name the engine option; name the flag the user typed instead.
function describeEngineError(err) {
  const message = formatError(err);
  if (err && err.code === 'INVALID_RUN_ONLY') {
    if (/^runOnly\.wcag\.version\b/.test(message)) {
      return message.replace(/^runOnly\.wcag\.version\b/, '--wcag');
    }
    if (/^runOnly\.wcag\.level\b/.test(message)) {
      return message.replace(/^runOnly\.wcag\.level\b/, '--wcag-level');
    }
    return `${message
      .replace(/^(engineOptions\.rules\.include|runOnly\.includeRuleIds)\b/, '--rules')
      .replace(/^(engineOptions\.tags\.include|runOnly\.tags)\b/, '--tags')} No rule ran.`;
  }
  if (err && err.code === 'INVALID_CONTEXT_SELECTOR') {
    return message.replace(/^contextSelector\b/, '--context');
  }
  return message;
}

// A scan can complete without having checked what was asked for. Each case
// below would otherwise look like a clean result and pass a CI gate, so they
// are errors (exit 2), like a custom rules file that fails validation.
function findScanProblem(result, args) {
  const contextMatch = result && result.contextMatch;
  if (args.context && contextMatch && contextMatch.elementCount === 0) {
    return `--context "${args.context}" matched no element, so nothing was scanned. Check the selector against the page.`;
  }

  if (result && Array.isArray(result.checksResults) && result.checksResults.length === 0) {
    const hint =
      args.rules && args.tags && args.includeMode !== 'or'
        ? ' (--include-mode or runs the rules that match either)'
        : '';
    return `No rule ran: what --rules, --tags or --wcag include, --exclude-rules excludes, or --rules and --tags have no rule in common${hint}. Nothing was checked.`;
  }

  const skippedPacks = (result && result.skippedPacks) || [];
  if (skippedPacks.length) {
    const lines = skippedPacks.map(
      (s) => `  - ${s.name ? `"${s.name}"` : '(no name)'}: ${s.reason}`
    );
    return `${skippedPacks.length} pack(s) from --pack did not run:\n${lines.join('\n')}\nSee docs/CLI.md#packs.`;
  }

  const appliedProfile = result && result.engine && result.engine.profile;
  // The engine matches profile names in any case and reports its own spelling.
  if (
    args.profile &&
    !(appliedProfile && appliedProfile.toLowerCase() === args.profile.toLowerCase())
  ) {
    const selectors = [
      ['--rules', args.rules],
      ['--tags', args.tags],
      ['--wcag', args.wcag]
    ]
      .filter(([, given]) => given)
      .map(([flag]) => flag);
    if (selectors.length) {
      return `--profile "${args.profile}" was not applied: ${selectors.join(' and ')} chose the rules in its place, so give one or the other. Nothing was scanned against it.`;
    }
    return `--profile "${args.profile}" was not applied: no such profile${args.packs && args.packs.length ? ' in core or the packs given' : " in core (a pack's profile needs --pack)"}. Nothing was scanned against it.`;
  }

  const skipped = (result && result.skippedCustomRules) || [];
  if (skipped.length) {
    const lines = skipped.map((s) => `  - ${s.id ? `"${s.id}"` : '(no id)'}: ${s.reason}`);
    return `${skipped.length} custom rule(s) from --custom-rules did not run:\n${lines.join('\n')}\nSee docs/CLI.md#custom-rules.`;
  }

  return null;
}

// The WCAG criterion a rollup decides, from its normative mapping, or null
// for anything else (a pack's standard or checklist item).
function wcagCriterion(rollup) {
  const mappings =
    rollup && rollup.meta && Array.isArray(rollup.meta.normativeMappings)
      ? rollup.meta.normativeMappings
      : [];
  const wcag = mappings.find((m) => m && m.standard === 'WCAG' && m.requirement);
  if (!wcag || (rollup.meta && rollup.meta.standard)) return null;
  return wcag.requirement;
}

// Prints the WCAG criteria the scan reports, grouped by outcome, fail first.
// A criterion some of whose checks the scan didn't select is marked as
// partly checked. With compact, only the counts. Nothing here is a
// conformance claim, and the last line says so.
function printCriteria(result, { compact = false } = {}) {
  const rollups = (Array.isArray(result.rulesResults) ? result.rulesResults : [])
    .map((r) => ({ rollup: r, criterion: wcagCriterion(r) }))
    .filter((e) => e.criterion);
  if (!rollups.length) return;

  const engine = result.engine || {};
  const target = ['WCAG', engine.wcagVersion, engine.wcagLevel].filter(Boolean).join(' ');
  const order = ['fail', 'cantTell', 'pass', 'notApplicable'];
  const groups = {};
  for (const e of rollups) (groups[e.rollup.outcome] = groups[e.rollup.outcome] || []).push(e);
  const byNumber = (a, b) => a.criterion.localeCompare(b.criterion, 'en', { numeric: true });

  process.stdout.write(`criteria (${target}):\n`);
  if (compact) {
    process.stdout.write(
      `  ${order
        .filter((o) => groups[o])
        .map((o) => `${o}: ${groups[o].length}`)
        .join('   ')}\n`
    );
  } else {
    for (const outcome of order.slice(0, 3)) {
      if (!groups[outcome]) continue;
      const names = groups[outcome].sort(byNumber).map(({ rollup, criterion }) => {
        const contributors =
          (rollup.data && rollup.data.details && rollup.data.details.contributors) || [];
        const notSelected = contributors.filter((c) => c && c.notSelected).length;
        const partly = notSelected
          ? ` (partly checked: ${notSelected} of ${contributors.length} checks not selected)`
          : '';
        return `${criterion} ${rollup.title || rollup.ruleId}${partly}`;
      });
      process.stdout.write(`  ${outcome.padEnd(10)} ${names.join('; ')}\n`);
    }
    if (groups.notApplicable)
      process.stdout.write(`  notApplicable: ${groups.notApplicable.length}\n`);
  }
  process.stdout.write(
    '  A criterion that passes here means the checks that ran found nothing in it, not that the page conforms.\n\n'
  );
}

// The review groups of the occurrences that need review, as core's HTML
// report names them.
const REVIEW_GROUPS = [
  ['leanFail', 'likely fail'],
  ['leanPass', 'likely pass'],
  ['open', 'needs a person']
];

// The likely failures that fail the run under --fail-on-lean: core's
// leaningFailures (with --lean-fail-wcag-only, those of rules mapped to a
// WCAG criterion in the target), at or above --fail-on-severity's level.
function gatingLeaningFailures(result, args) {
  const { leaningFailures } = require('@surea11y/core');
  const severities = severityOf(result);
  return leaningFailures(result, { wcagOnly: Boolean(args.leanFailWcagOnly) }).filter((f) =>
    countsForGate(severities[f.ruleId], args.failOnSeverity)
  );
}

function severityOf(result) {
  return Object.fromEntries(result.checksResults.map((r) => [r.ruleId, r.severity]));
}

function printSummary(
  result,
  baselineMatch,
  { compact = false, failOnSeverity = null, failOnLean = false, ...args } = {}
) {
  const { reviewGroupOf } = require('@surea11y/core');
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
  if (result.engine && result.engine.version) {
    process.stdout.write(`  engine: @surea11y/core ${result.engine.version}\n`);
  }
  if (result.engine && result.engine.wcagLevel) {
    process.stdout.write(`  WCAG level reported: ${result.engine.wcagLevel}\n`);
  }
  // A browser scan's viewport and color scheme, as the engine recorded them.
  // With several widths or color schemes, each scan's, by the name its
  // findings list under "seen in".
  const environment = result.engine && result.engine.environment;
  if (Array.isArray(result.conditionRuns) && result.conditionRuns.length > 1) {
    process.stdout.write(`  browser: ${result.conditionRuns.length} scans, merged\n`);
    for (const run of result.conditionRuns) {
      const env = run.environment || {};
      const view = env.viewport ? `${env.viewport.width}×${env.viewport.height}` : '?';
      process.stdout.write(
        `    ${run.condition}: ${view}${env.colorScheme ? `, ${env.colorScheme} color scheme` : ''}\n`
      );
    }
  } else if (environment && environment.layout && environment.viewport) {
    process.stdout.write(
      `  browser: ${environment.viewport.width}×${environment.viewport.height}${environment.colorScheme ? `, ${environment.colorScheme} color scheme` : ''}\n`
    );
  }
  // The hooks a browser scan had, as the engine saw them.
  if (
    environment &&
    (environment.internalsHook || environment.listenerHook || environment.liveRegionHook)
  ) {
    const hooks = [
      environment.internalsHook &&
        `internals${environment.internalsHook === 'late' ? ' (late)' : ''}`,
      environment.listenerHook &&
        `listeners${environment.listenerHook === 'late' ? ' (late)' : ''}`,
      environment.liveRegionHook &&
        `live regions${environment.liveRegionHook === 'late' ? ' (late)' : ''}`
    ].filter(Boolean);
    process.stdout.write(`  hooks: ${hooks.join(', ')}\n`);
  }
  if (result.engine && result.engine.profile) {
    process.stdout.write(`  profile: ${result.engine.profile}\n`);
  }
  if (result.engine && Array.isArray(result.engine.packs) && result.engine.packs.length) {
    process.stdout.write(`  packs: ${result.engine.packs.join(', ')}\n`);
  }
  process.stdout.write(
    `  pass: ${byOutcome.pass}   fail: ${byOutcome.fail}   cantTell: ${byOutcome.cantTell}   notApplicable: ${byOutcome.notApplicable}\n\n`
  );
  const leanFails = [];
  const reviewCounts = { leanFail: 0, leanPass: 0, open: 0 };
  for (const r of result.checksResults) {
    for (const occ of Array.isArray(r.occurrences) ? r.occurrences : []) {
      const group = reviewGroupOf(r, occ);
      if (!Object.prototype.hasOwnProperty.call(reviewCounts, group)) continue;
      reviewCounts[group] += 1;
      if (group === 'leanFail') leanFails.push({ check: r, occ });
    }
  }
  process.stdout.write(
    `  occurrences by tier: fail: ${occurrenceTierCounts.fail}   cantTell: ${occurrenceTierCounts.cantTell}\n`
  );
  if (occurrenceTierCounts.cantTell) {
    process.stdout.write(
      `  needs review: ${REVIEW_GROUPS.map(([group, label]) => `${label}: ${reviewCounts[group]}`).join('   ')}\n`
    );
  }
  process.stdout.write('\n');

  // Most severe first, then by rule.
  const fails = result.checksResults
    .filter((r) => r.outcome === 'fail')
    .sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) || a.ruleId.localeCompare(b.ruleId)
    );
  if (fails.length) {
    process.stdout.write(`FAIL (${fails.length} rule(s)):\n`);
    for (const r of fails) {
      const failOccurrences = (r.occurrences || []).filter(
        (occ) => getOccurrenceOutcome(r, occ) === 'fail'
      );
      const cantTellOccurrences = (r.occurrences || []).filter(
        (occ) => getOccurrenceOutcome(r, occ) === 'cantTell'
      );
      const belowGate = !countsForGate(r.severity, failOnSeverity)
        ? `; below --fail-on-severity ${failOnSeverity}, does not fail the run`
        : '';
      process.stdout.write(
        `\n  ${r.ruleId}  (${r.severity}, ${failOccurrences.length} fail occurrence(s)${cantTellOccurrences.length ? `, ${cantTellOccurrences.length} needs-review occurrence(s)` : ''}${belowGate})\n`
      );
      for (const occ of failOccurrences.slice(0, 5)) {
        process.stdout.write(`    - ${occ.selector || '(no selector)'}\n      ${occ.summary}\n`);
        if (occ.hint) process.stdout.write(`      hint: ${occ.hint}\n`);
        if (Array.isArray(occ.conditions)) {
          process.stdout.write(`      seen in: ${occ.conditions.join(', ')}\n`);
        }
      }
      if (failOccurrences.length > 5) {
        process.stdout.write(`    ... and ${failOccurrences.length - 5} more\n`);
      }
    }
    process.stdout.write('\n');
  }

  // The questions whose evidence points to a failure, most severe first, each
  // with its lean's reason: the ones to check first.
  if (leanFails.length) {
    leanFails.sort(
      (a, b) =>
        severityRank(b.check.severity) - severityRank(a.check.severity) ||
        a.check.ruleId.localeCompare(b.check.ruleId)
    );
    process.stdout.write(`LIKELY FAIL — confirm (${leanFails.length} occurrence(s)):\n`);
    for (const { check, occ } of leanFails.slice(0, 5)) {
      process.stdout.write(
        `  - ${check.ruleId} (${check.severity}): ${occ.selector || '(no selector)'}\n    ${occ.summary}\n`
      );
      if (occ.lean && occ.lean.why) process.stdout.write(`    why: ${occ.lean.why}\n`);
      if (occ.lean && occ.lean.caution) process.stdout.write(`    caution: ${occ.lean.caution}\n`);
    }
    if (leanFails.length > 5) {
      process.stdout.write(`  ... and ${leanFails.length - 5} more\n`);
    }
    if (failOnLean && !baselineMatch) {
      const gating = gatingLeaningFailures(result, { failOnSeverity, ...args }).length;
      process.stdout.write(
        `  --fail-on-lean: ${gating} of them fail${gating === 1 ? 's' : ''} the run\n`
      );
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

  printCriteria(result, { compact });

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
    const lean = baselineMatch.leanFail;
    if (lean) {
      process.stdout.write(
        `baseline likely failures: ${lean.knownCount} known, ${lean.newCount} new, ${lean.staleCount} stale (no longer detected)\n`
      );
      if (lean.newCount) {
        process.stdout.write(
          `\nNEW likely failures (not in baseline, ${lean.newCount} occurrence(s)):\n`
        );
        for (const occ of lean.newOccurrences.slice(0, 5)) {
          process.stdout.write(
            `  - ${occ.ruleId}: ${occ.selector || '(no selector)'}\n    ${occ.summary}\n`
          );
        }
        if (lean.newOccurrences.length > 5) {
          process.stdout.write(`  ... and ${lean.newOccurrences.length - 5} more\n`);
        }
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

// Severities from least to most severe; --fail-on-severity gates on its level
// and those above it.
const SEVERITIES = ['minor', 'moderate', 'serious', 'critical'];

function severityRank(severity) {
  return SEVERITIES.indexOf(String(severity || '').toLowerCase());
}

// Whether a failing rule of this severity fails the run.
function countsForGate(severity, threshold) {
  if (!threshold) return true;
  return severityRank(severity) >= severityRank(threshold);
}

// The pages a sitemap lists, in its order: the <loc> of each <url>, and of
// each <url> in the sitemaps a sitemap index names, followed one level down
// (the depth the protocol allows), gzipped or not. Reading stops once `max`
// pages are found; `listed` counts every page seen, to say what was cut.
// Relative locations resolve against the sitemap's own address.
const SITEMAP_DEFAULT_MAX_PAGES = 50;

async function readSitemapText(source) {
  let bytes;
  if (isUrl(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Fetching ${source} failed: HTTP ${res.status} ${res.statusText}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } else {
    const resolved = path.resolve(process.cwd(), source);
    if (!fs.existsSync(resolved)) throw new Error(`No such file: ${resolved}`);
    bytes = fs.readFileSync(resolved);
  }
  // A gzipped sitemap (sitemap.xml.gz) starts with gzip's magic bytes.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = require('zlib').gunzipSync(bytes);
  return bytes.toString('utf8');
}

async function readSitemap(source, max) {
  const { JSDOM } = require('jsdom');
  const base = isUrl(source)
    ? source
    : require('url').pathToFileURL(path.resolve(process.cwd(), source)).href;
  const parse = (text, where) => {
    let doc;
    try {
      doc = new JSDOM(text, { contentType: 'text/xml' }).window.document;
    } catch {
      throw new Error(`${where} is not a sitemap: it is not well-formed XML`);
    }
    const root = doc.documentElement;
    if (
      !root ||
      root.localName === 'parsererror' ||
      doc.getElementsByTagName('parsererror').length
    ) {
      throw new Error(`${where} is not a sitemap: it is not well-formed XML`);
    }
    const locs = (parentName) =>
      Array.from(doc.getElementsByTagNameNS('*', 'loc'))
        .filter((loc) => loc.parentElement && loc.parentElement.localName === parentName)
        .map((loc) => loc.textContent.trim())
        .filter(Boolean);
    if (root.localName === 'sitemapindex') return { sitemaps: locs('sitemap'), pages: [] };
    if (root.localName === 'urlset') return { sitemaps: [], pages: locs('url') };
    throw new Error(
      `${where} is not a sitemap: its root is <${root.localName}>, not <urlset> or <sitemapindex>`
    );
  };
  // A local sitemap's pages are files: given as paths, as on the command line.
  const resolve = (loc, from) => {
    try {
      const url = new URL(loc, from);
      return url.protocol === 'file:' ? require('url').fileURLToPath(url) : url.href;
    } catch {
      return loc;
    }
  };
  const top = parse(await readSitemapText(source), `--sitemap "${source}"`);
  const pages = [];
  let listed = 0;
  const take = (list, from) => {
    for (const loc of list) {
      listed += 1;
      if (pages.length < max) pages.push(resolve(loc, from));
    }
  };
  take(top.pages, base);
  for (const child of top.sitemaps) {
    const url = resolve(child, base);
    const sub = parse(await readSitemapText(url), `The sitemap ${url}`);
    take(sub.pages, url);
  }
  return { pages, listed };
}

// With no failing rule anywhere and something checked, the summary ends by
// saying that is not a conformance claim, as core's HTML report does: what
// the rules can't judge is left to a person.
function printNotConformance(results) {
  const checks = [].concat(...results.map((r) => r.checksResults || []));
  if (checks.some((r) => r.outcome === 'fail')) return;
  if (!checks.some((r) => r.outcome === 'pass' || r.outcome === 'cantTell')) return;
  const pages = results.length > 1 ? 'these pages conform' : 'the page conforms';
  process.stdout.write(
    `No rule failed, which is not a claim that ${pages}: the automated rules found nothing definite. ` +
      'A person still checks the cantTell findings, keyboard use, how a screen reader reads the page, and the content itself.\n'
  );
}

// The pages to scan: the paths and URLs given, then those listed in --urls,
// one per line, skipping blank lines and # comments, then those --sitemap
// lists, up to --max-pages. A page named twice is scanned once.
async function collectTargets(args) {
  const targets = args._.slice();
  if (args.urls) {
    let text;
    try {
      text = fs.readFileSync(path.resolve(process.cwd(), args.urls), 'utf8');
    } catch (err) {
      throw new Error(`Could not read --urls file "${args.urls}": ${formatError(err)}`, {
        cause: err
      });
    }
    for (const line of text.split(/\r?\n/)) {
      const entry = line.replace(/#.*$/, '').trim();
      if (entry) targets.push(entry);
    }
  }
  if (args.sitemap) {
    let sitemap;
    try {
      sitemap = await readSitemap(args.sitemap, args.maxPages);
    } catch (err) {
      throw new Error(`Could not read --sitemap "${args.sitemap}": ${formatError(err)}`, {
        cause: err
      });
    }
    if (!sitemap.listed) throw new Error(`--sitemap "${args.sitemap}" lists no pages`);
    if (sitemap.listed > sitemap.pages.length) {
      process.stderr.write(
        `sitemap: ${sitemap.listed} pages listed, scanning the first ${sitemap.pages.length} (--max-pages ${args.maxPages}).\n`
      );
    }
    targets.push(...sitemap.pages);
  }
  return [...new Set(targets)];
}

// How a page is named in a baseline written for several pages: a URL as
// given, a file by its path relative to the working directory, so the
// baseline matches on another machine or checkout.
function pageKey(target) {
  if (isUrl(target)) return target;
  return path
    .relative(process.cwd(), path.resolve(process.cwd(), target))
    .split(path.sep)
    .join('/');
}

// The HTML report's file for the nth page (from 1): the path given for the
// first, then <name>-2.<ext>, <name>-3.<ext>...
function numberedPath(file, n) {
  if (n === 1) return file;
  const ext = path.extname(file);
  return `${file.slice(0, file.length - ext.length)}-${n}${ext}`;
}

// The static scanner: the page's HTML in jsdom, no scripts run.
function createStaticScanner(engineOptions, runOnly, args) {
  let JSDOM;
  try {
    ({ JSDOM } = require('jsdom'));
  } catch {
    throw new Error(
      'the surea11y CLI requires jsdom. It is a dependency of this package, so a missing jsdom means a broken install — try reinstalling with `npm install -g @surea11y/cli` (or `npm install` in your project).'
    );
  }
  // Deferred so `--help`/`--version` don't load the full rule catalog.
  const { runDomRulesInPage } = require('@surea11y/core');
  return {
    async scan(target) {
      const { html, url } = await loadHtml(target);
      const dom = new JSDOM(html, { url, pretendToBeVisual: true });
      global.window = dom.window;
      global.document = dom.window.document;
      try {
        return runDomRulesInPage(url, args.context || null, engineOptions, runOnly);
      } finally {
        dom.window.close();
      }
    },
    async close() {}
  };
}

// A browser scan's viewport: --width's, or this, by 720 pixels.
const DEFAULT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

// The browser scanner: each page opened in headless Chromium through
// Playwright, which the user installs. The engine is core's own browser
// bundle, from the same @surea11y/core as the static scan, so both modes
// judge with one engine. Packs go in as core's packScript, custom rules as
// their source (functions can't cross into the page). Every frame but the top
// one is left out for now.
//
// Core's hooks are installed as init scripts, which run in every frame before
// the page's own scripts (see hookScripts below). The engine in the page
// gives no howToCheck; it is added here, in Node.
async function createBrowserScanner(engineOptions, runOnly, args, customRules, packs) {
  let chromium;
  try {
    const resolved = require.resolve('playwright', { paths: [process.cwd(), __dirname] });
    ({ chromium } = require(resolved));
  } catch {
    throw new Error(
      '--browser needs Playwright, which is not installed. Install it in this project with `npm install playwright` and its browser with `npx playwright install chromium`.'
    );
  }
  const bundle = fs.readFileSync(require.resolve('@surea11y/core/browser'), 'utf8');
  const packSource = packs.length ? require('@surea11y/core/pack').packScript(packs) : null;
  const pageOptions = { ...engineOptions };
  if (customRules.length) {
    pageOptions.customRules = customRules.map((rule) => ({
      ...rule,
      runInPage: typeof rule.runInPage === 'function' ? rule.runInPage.toString() : rule.runInPage,
      ...(typeof rule.applicability === 'function'
        ? { applicability: rule.applicability.toString() }
        : {})
    }));
  }
  if (packs.length) pageOptions.packs = packs.map((p) => `${p.name}@${p.version}`);
  // core's internals and listener hooks, run in each page before its own
  // scripts, so the scan reads the names custom elements set through private
  // ElementInternals and the listeners the page adds from script. The page
  // is the scan's own, so wrapping attachInternals and addEventListener
  // changes nothing anyone uses; --no-hooks leaves them out. Each only where
  // the installed core has it (the listener hook from 1.14.0).
  // The live-region hook only with --live-regions: the CLI doesn't use the
  // page, so it would mostly see an app render its live regions with their
  // first content, which is the app at rest, not a status message.
  const core = require('@surea11y/core');
  const hookScripts = (args.noHooks ? [] : [core.internalsHookScript, core.listenerHookScript])
    .concat(args.liveRegions ? [core.liveRegionHookScript] : [])
    .filter((script) => typeof script === 'function')
    .map((script) => script());

  // Every combination of the widths and color schemes asked for, widths
  // first; one, the default 1280 pixels and the browser's scheme, without
  // either.
  const conditions = [];
  for (const width of args.width || [DEFAULT_WIDTH]) {
    for (const colorScheme of args.colorScheme || [null]) conditions.push({ width, colorScheme });
  }
  // Each combination is named by what varies: 'dark', 'width 320',
  // 'dark, width 320'.
  const conditionName = (c) =>
    [
      args.colorScheme && args.colorScheme.length > 1 ? c.colorScheme : null,
      args.width && args.width.length > 1 ? `width ${c.width}` : null
    ]
      .filter(Boolean)
      .join(', ');
  // The merge comes from @surea11y/binding-base, the bindings' own, so the
  // CLI and .conditions() in a test report a page the same way.
  let mergeConditionResults = null;
  if (conditions.length > 1) {
    ({ mergeConditionResults } = require('@surea11y/binding-base'));
    if (typeof mergeConditionResults !== 'function') {
      throw new Error(
        'Several widths or color schemes need @surea11y/binding-base 1.6.0 or later.'
      );
    }
  }

  let browser;
  try {
    browser = await chromium.launch(
      process.env.CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
        : {}
    );
  } catch (err) {
    throw new Error(
      `--browser could not start Chromium (${formatError(err).split('\n')[0]}). Install it with \`npx playwright install chromium\`.`,
      { cause: err }
    );
  }
  return {
    async scan(target) {
      const url = isUrl(target)
        ? target
        : (() => {
            const resolved = path.resolve(process.cwd(), target);
            if (!fs.existsSync(resolved)) throw new Error(`No such file: ${resolved}`);
            return require('url').pathToFileURL(resolved).href;
          })();
      const [first, ...rest] = conditions;
      const page = await browser.newPage({
        viewport: { width: first.width, height: VIEWPORT_HEIGHT },
        ...(first.colorScheme ? { colorScheme: first.colorScheme } : {})
      });
      try {
        for (const content of hookScripts) await page.addInitScript({ content });
        const response = await page.goto(url, { waitUntil: 'load' });
        if (response && !response.ok() && isUrl(target)) {
          throw new Error(
            `Fetching ${target} failed: HTTP ${response.status()} ${response.statusText()}`
          );
        }
        // Content an app fetches after the load event: scanning before it
        // arrives would pass what was never checked, so running out of time
        // is an error, not a scan.
        if (args.waitFor) {
          const timeout = args.waitTimeout || 30000;
          try {
            await page.waitForSelector(args.waitFor, { state: 'visible', timeout });
          } catch (err) {
            if (err && err.name === 'TimeoutError') {
              throw Object.assign(
                new Error(
                  `--wait-for "${args.waitFor}" found no visible element within ${timeout} ms. Check the selector, or give it more time with --wait-timeout.`,
                  { cause: err }
                ),
                { causeIncluded: true }
              );
            }
            throw Object.assign(
              new Error(
                `--wait-for "${args.waitFor}" is not a valid selector: ${formatError(err).split('\n')[0]}`,
                { cause: err }
              ),
              { causeIncluded: true }
            );
          }
        }
        // Evaluated rather than added as script tags, so a page's Content
        // Security Policy can't block the engine.
        await page.evaluate(bundle);
        if (packSource) await page.evaluate(packSource);
        if (!rest.length) return await scanPage(page);
        // Several widths or color schemes: the page loaded once, then each
        // combination set on it and scanned, merged into one result.
        const runs = [{ condition: conditionName(first), result: await scanPage(page) }];
        for (const condition of rest) {
          await page.setViewportSize({ width: condition.width, height: VIEWPORT_HEIGHT });
          if (condition.colorScheme)
            await page.emulateMedia({ colorScheme: condition.colorScheme });
          runs.push({ condition: conditionName(condition), result: await scanPage(page) });
        }
        return mergeConditionResults(runs);
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    }
  };

  async function scanPage(page) {
    await page.evaluate(() => window.a11ycore.waitForPageReady());
    const outcome = await page.evaluate(
      ({ context, options, only }) => {
        // The style sheets the page can't read are fetched first where the
        // bundle can (core 1.14 and later); an older one scans as it is.
        const engine = window.a11ycore;
        const scan = engine.runa11yCoreInPageAsync
          ? () => engine.runa11yCoreInPageAsync(location.href, context, options, only)
          : () => engine.runa11yCoreInPage(location.href, context, options, only);
        return Promise.resolve()
          .then(scan)
          .then(
            (result) => ({ result }),
            (err) => ({ error: { message: String(err && err.message), code: err && err.code } })
          );
      },
      { context: args.context || null, options: pageOptions, only: runOnly }
    );
    if (outcome.error) {
      const err = new Error(outcome.error.message);
      err.code = outcome.error.code;
      err.fromEngine = true;
      throw err;
    }
    return core.addHowToCheck(outcome.result, { packs });
  }
}

// SARIF for several pages: one run, the results of every page (each already
// names its page as its artifact), with the rules they use. GitHub code
// scanning refuses a file with several runs of one tool.
function mergeSarif(texts) {
  const logs = texts.map((t) => JSON.parse(t));
  const merged = logs[0];
  const run = merged.runs[0];
  const ruleIds = new Set((run.tool.driver.rules || []).map((r) => r.id));
  for (const log of logs.slice(1)) {
    const other = log.runs[0];
    for (const rule of other.tool.driver.rules || []) {
      if (!ruleIds.has(rule.id)) {
        ruleIds.add(rule.id);
        (run.tool.driver.rules = run.tool.driver.rules || []).push(rule);
      }
    }
    run.results = run.results.concat(other.results || []);
  }
  return JSON.stringify(merged, null, 2) + '\n';
}

function xmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// JUnit for several pages: one <testsuites>, each page's suites named after
// the page ("about.html — WCAG 1.1.1") and its testcases' classnames too
// ("about.html/wcag-1.1.1"), so a CI's test history keeps the pages apart.
function mergeJunit(texts, pages) {
  const totals = { tests: 0, failures: 0, errors: 0, skipped: 0 };
  const suites = [];
  texts.forEach((xml, i) => {
    const root = /<testsuites\b([^>]*)>/.exec(xml);
    for (const key of Object.keys(totals)) {
      const m = new RegExp(`\\b${key}="(\\d+)"`).exec(root ? root[1] : '');
      totals[key] += m ? Number(m[1]) : 0;
    }
    const prefix = xmlAttr(pages[i]);
    const body = xml.slice(
      xml.indexOf('>', xml.indexOf('<testsuites')) + 1,
      xml.lastIndexOf('</testsuites>')
    );
    suites.push(
      body
        .replace(/<testsuite name="/g, `<testsuite name="${prefix} — `)
        .replace(/<testcase classname="/g, `<testcase classname="${prefix}/`)
        .replace(/^\n+|\n+$/g, '')
    );
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="surea11y" tests="${totals.tests}" failures="${totals.failures}" errors="${totals.errors}" skipped="${totals.skipped}" time="0">`,
    ...suites,
    '</testsuites>',
    ''
  ].join('\n');
}

// --baseline, --write-baseline and --migrate-baseline each say what the run
// does with a baseline, so only one can be given.
function checkBaselineModes(args) {
  const given = [
    ['--baseline', args.baseline],
    ['--write-baseline', args.writeBaseline],
    ['--migrate-baseline', args.migrateBaseline]
  ].filter(([, value]) => value !== undefined);
  if (given.length < 2) return true;
  const flags = given.map(([flag]) => flag);
  process.stderr.write(
    `Error: ${flags.slice(0, -1).join(', ')} and ${flags[flags.length - 1]} cannot be used together in the same run. See --help.\n`
  );
  process.exitCode = 2;
  return false;
}

// Rewrites a baseline under the reason codes core gives now
// (migrateBaselineEntries), keeping everything else in the file. Each entry
// is migrated against the result of its page: an entry naming a page against
// that page's, one naming none against the only page scanned. With no
// result, only the moves core can tell without the finding are made. Nothing
// new is accepted.
function migrateBaselineFile(file, pages) {
  const baseline = loadBaselineFile(file);
  const resultFor = (entry) => {
    const page =
      entry && entry.page
        ? pages.find((p) => p.page === entry.page)
        : pages.length === 1
          ? pages[0]
          : null;
    return page ? page.result : null;
  };
  const groups = new Map();
  baseline.entries.forEach((entry, i) => {
    const result = resultFor(entry);
    if (!groups.has(result)) groups.set(result, []);
    groups.get(result).push(i);
  });
  const entries = baseline.entries.slice();
  for (const [result, indexes] of groups) {
    const migrated = migrateBaselineEntries(
      indexes.map((i) => baseline.entries[i]),
      result || undefined
    );
    indexes.forEach((i, n) => {
      entries[i] = migrated[n];
    });
  }
  const changed = entries.filter(
    (e, i) => e && baseline.entries[i] && e.reasonCode !== baseline.entries[i].reasonCode
  ).length;
  fs.writeFileSync(file, JSON.stringify({ ...baseline, entries }, null, 2) + '\n');
  process.stderr.write(
    `Migrated ${changed} of ${entries.length} baseline entr${entries.length === 1 ? 'y' : 'ies'} to the current reason codes${pages.length ? '' : ' (no scan: only the moves that need none)'}: ${file}\n`
  );
}

async function runScan(args) {
  // --max-pages limits what --sitemap adds: a whole number above 0.
  if (args.maxPages !== undefined) {
    if (!args.sitemap) {
      process.stderr.write('Error: --max-pages needs --sitemap. See --help.\n');
      process.exitCode = 2;
      return;
    }
    if (!/^\d+$/.test(String(args.maxPages)) || Number(args.maxPages) < 1) {
      process.stderr.write(
        `Error: --max-pages must be a whole number above 0, not "${args.maxPages}". See --help.\n`
      );
      process.exitCode = 2;
      return;
    }
    args.maxPages = Number(args.maxPages);
  } else if (args.sitemap) {
    args.maxPages = SITEMAP_DEFAULT_MAX_PAGES;
  }
  let targets;
  try {
    targets = await collectTargets(args);
  } catch (err) {
    process.stderr.write(`Error: ${formatError(err)}\n`);
    process.exitCode = 2;
    return;
  }
  // A baseline can be migrated without a scan: only the moves that need no
  // finding are made then.
  if (!targets.length && args.migrateBaseline) {
    if (!checkBaselineModes(args)) return;
    try {
      migrateBaselineFile(args.migrateBaseline, []);
    } catch (err) {
      process.stderr.write(`Error: ${formatError(err)}\n`);
      process.exitCode = 2;
      return;
    }
    process.exitCode = 0;
    return;
  }
  if (!targets.length) {
    process.stderr.write(
      `Error: scan requires a file path or URL${args.urls ? ` (--urls "${args.urls}" lists none)` : ''}. See --help.\n`
    );
    process.exitCode = 2;
    return;
  }
  const several = targets.length > 1;

  // Checked here, since without --wcag the engine would only warn and ignore
  // a level it can't use. Any case is accepted, as the engine accepts it.
  if (args.wcagLevel !== undefined) {
    const level = String(args.wcagLevel).toUpperCase();
    if (!['A', 'AA', 'AAA'].includes(level)) {
      process.stderr.write(
        `Error: --wcag-level must be "A", "AA" or "AAA", not "${args.wcagLevel}". See --help.\n`
      );
      process.exitCode = 2;
      return;
    }
    args.wcagLevel = level;
  }

  if (args.failOnSeverity !== undefined) {
    const level = String(args.failOnSeverity).toLowerCase();
    if (!SEVERITIES.includes(level)) {
      process.stderr.write(
        `Error: --fail-on-severity must be "critical", "serious", "moderate" or "minor", not "${args.failOnSeverity}". See --help.\n`
      );
      process.exitCode = 2;
      return;
    }
    args.failOnSeverity = level;
  }

  // Options that only a browser can honour: without --browser, a static scan
  // would quietly measure nothing of what they ask.
  const browserOnly = [
    ['--wait-for', args.waitFor],
    ['--wait-timeout', args.waitTimeout],
    ['--width', args.width],
    ['--color-scheme', args.colorScheme],
    ['--no-hooks', args.noHooks],
    ['--live-regions', args.liveRegions]
  ].filter(([, given]) => given !== undefined);
  if (browserOnly.length && !args.browser) {
    process.stderr.write(
      `Error: ${browserOnly.map(([flag]) => flag).join(', ')} ${browserOnly.length > 1 ? 'need' : 'needs'} --browser: a static scan has no layout, scripts or color scheme. See --help.\n`
    );
    process.exitCode = 2;
    return;
  }
  if (args.liveRegions && typeof require('@surea11y/core').liveRegionHookScript !== 'function') {
    process.stderr.write(
      `Error: --live-regions needs @surea11y/core 1.14.0 or later (installed: ${require('@surea11y/core/package.json').version}).\n`
    );
    process.exitCode = 2;
    return;
  }
  if (args.waitTimeout !== undefined && args.waitFor === undefined) {
    process.stderr.write('Error: --wait-timeout needs --wait-for. See --help.\n');
    process.exitCode = 2;
    return;
  }
  // Several widths or color schemes, comma-separated, each checked; the scan
  // runs every combination of them.
  if (args.width !== undefined) {
    const widths = String(args.width)
      .split(',')
      .map((w) => w.trim());
    const bad = widths.find((w) => !/^\d+$/.test(w) || Number(w) < 1);
    if (bad !== undefined) {
      process.stderr.write(
        `Error: --width must be a whole number above 0, or several separated by commas, not "${args.width}". See --help.\n`
      );
      process.exitCode = 2;
      return;
    }
    args.width = [...new Set(widths.map(Number))];
  }
  for (const [flag, key, min] of [['--wait-timeout', 'waitTimeout', 1]]) {
    if (args[key] === undefined) continue;
    const n = Number(args[key]);
    if (!/^\d+$/.test(String(args[key])) || n < min) {
      process.stderr.write(
        `Error: ${flag} must be a whole number above 0, not "${args[key]}". See --help.\n`
      );
      process.exitCode = 2;
      return;
    }
    args[key] = n;
  }
  if (args.waitFor !== undefined && !String(args.waitFor).trim()) {
    process.stderr.write('Error: --wait-for needs a selector. See --help.\n');
    process.exitCode = 2;
    return;
  }
  if (args.colorScheme !== undefined) {
    const schemes = String(args.colorScheme)
      .split(',')
      .map((c) => c.trim().toLowerCase());
    if (schemes.some((c) => !['light', 'dark'].includes(c))) {
      process.stderr.write(
        `Error: --color-scheme must be "light", "dark" or "light,dark", not "${args.colorScheme}". See --help.\n`
      );
      process.exitCode = 2;
      return;
    }
    args.colorScheme = [...new Set(schemes)];
  }

  if (args.includeMode !== undefined && !['and', 'or'].includes(args.includeMode)) {
    process.stderr.write(
      `Error: --include-mode must be "and" or "or", not "${args.includeMode}". See --help.\n`
    );
    process.exitCode = 2;
    return;
  }

  if (args.leanFailWcagOnly && !args.failOnLean) {
    process.stderr.write('Error: --lean-fail-wcag-only needs --fail-on-lean. See --help.\n');
    process.exitCode = 2;
    return;
  }

  if (!checkBaselineModes(args)) return;

  let baselineFile = null;
  if (args.baseline || args.migrateBaseline) {
    try {
      // Read now, so a file that can't be migrated stops the run before the scan.
      if (args.migrateBaseline) loadBaselineFile(args.migrateBaseline);
      else baselineFile = loadBaselineFile(args.baseline);
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

  let packs = [];
  if (args.packs && args.packs.length) {
    try {
      packs = args.packs.map(loadPack);
    } catch (err) {
      process.stderr.write(`Error: ${formatError(err)}\n`);
      process.exitCode = 2;
      return;
    }
  }

  const engineOptions = buildEngineOptions(args, customRules, packs);
  const runOnly = buildRunOnly(args);

  let scanner;
  try {
    scanner = args.browser
      ? await createBrowserScanner(engineOptions, runOnly, args, customRules, packs)
      : createStaticScanner(engineOptions, runOnly, args);
  } catch (err) {
    process.stderr.write(`Error: ${formatError(err)}\n`);
    process.exitCode = 2;
    return;
  }

  // Every page is scanned before anything is written, so a page that can't be
  // scanned leaves no partial reports or baseline behind.
  const pages = [];
  try {
    for (const target of targets) {
      const where = several ? `${target}: ` : '';
      let result;
      try {
        result = await scanner.scan(target);
      } catch (err) {
        const known = err && (err.code || err.fromEngine);
        process.stderr.write(
          `Error: ${where}${known ? describeEngineError(err) : formatError(err)}\n`
        );
        process.exitCode = 2;
        return;
      }
      const scanProblem = findScanProblem(result, args);
      if (scanProblem) {
        process.stderr.write(`Error: ${where}${scanProblem}\n`);
        process.exitCode = 2;
        return;
      }
      pages.push({ target, page: pageKey(target), result });
    }
  } finally {
    await scanner.close();
  }

  // A baseline entry written for several pages names its page; one without a
  // page (a baseline written for a single page) applies to whatever is scanned.
  const entriesFor = (page) =>
    baselineFile ? baselineFile.entries.filter((e) => !e.page || e.page === page) : undefined;

  if (args.html) {
    pages.forEach(({ target, result }, i) => {
      const file = numberedPath(args.html, i + 1);
      fs.writeFileSync(
        file,
        renderHtmlReport(result, { title: `surea11y scan report — ${target}`, packs })
      );
      process.stderr.write(`Wrote HTML report to: ${file}\n`);
    });
  }

  if (args.sarif) {
    const texts = pages.map(({ result, page }) =>
      renderSarifReport(result, {
        toolVersion: pkg.version,
        informationUri: (pkg.homepage || '').replace(/#.*$/, ''),
        baselineEntries: entriesFor(page),
        packs,
        ...(args.failOnLean
          ? { leanFailAs: 'error', leanFailWcagOnly: Boolean(args.leanFailWcagOnly) }
          : {})
      })
    );
    fs.writeFileSync(args.sarif, several ? mergeSarif(texts) : texts[0]);
    process.stderr.write(`Wrote SARIF report to: ${args.sarif}\n`);
  }

  if (args.junit) {
    const texts = pages.map(({ result, page }) =>
      renderJunitReport(result, {
        baselineEntries: entriesFor(page),
        packs,
        ...(args.failOnLean
          ? { leanFailAs: 'failure', leanFailWcagOnly: Boolean(args.leanFailWcagOnly) }
          : {})
      })
    );
    fs.writeFileSync(
      args.junit,
      several
        ? mergeJunit(
            texts,
            pages.map((p) => p.page)
          )
        : texts[0]
    );
    process.stderr.write(`Wrote JUnit report to: ${args.junit}\n`);
  }

  const printJson = (values) =>
    process.stdout.write(JSON.stringify(several ? values : values[0], null, 2) + '\n');

  if (args.migrateBaseline) {
    try {
      migrateBaselineFile(args.migrateBaseline, pages);
    } catch (err) {
      process.stderr.write(`Error: ${formatError(err)}\n`);
      process.exitCode = 2;
      return;
    }
    if (args.json) printJson(pages.map(({ result }) => result));
    else for (const { result } of pages) printSummary(result, undefined, args);
    process.exitCode = 0;
    return;
  }

  if (args.writeBaseline) {
    // With --fail-on-lean, the likely failures too, as entries marked
    // lean: 'fail', so that --baseline accepts those the pages have now.
    const perPage = pages.map(({ result, page }) => {
      const entries = buildBaselineEntries(result, { leanFail: Boolean(args.failOnLean) });
      return several ? entries.map((e) => ({ ...e, page })) : entries;
    });
    const entries = [].concat(...perPage);
    const payload = { version: 1, generatedAt: new Date().toISOString(), entries };
    fs.writeFileSync(args.writeBaseline, JSON.stringify(payload, null, 2) + '\n');

    if (args.json) {
      printJson(
        pages.map(({ result }, i) => ({
          ...result,
          baseline: { mode: 'write', path: args.writeBaseline, entries: perPage[i].length }
        }))
      );
    } else {
      for (const { result } of pages) printSummary(result, undefined, args);
    }
    const leanCount = entries.filter((e) => e.lean === 'fail').length;
    process.stderr.write(
      args.failOnLean
        ? `Wrote ${entries.length - leanCount} failure(s) and ${leanCount} likely failure(s) to baseline: ${args.writeBaseline}\n`
        : `Wrote ${entries.length} occurrence(s) to baseline: ${args.writeBaseline}\n`
    );
    process.exitCode = 0;
    return;
  }

  let gated = 0;
  const outputs = pages.map(({ result, page }) => {
    if (baselineFile) {
      const match = matchBaseline(result, entriesFor(page), {
        leanFail: Boolean(args.failOnLean)
      });
      const severities = severityOf(result);
      let gating = match.newOccurrences.filter((o) =>
        countsForGate(severities[o.ruleId], args.failOnSeverity)
      ).length;
      if (match.leanFail) {
        // Only the new likely failures --fail-on-lean gates on: with
        // --lean-fail-wcag-only, those of rules mapped to a WCAG criterion.
        const gatingRules = new Set(gatingLeaningFailures(result, args).map((f) => f.ruleId));
        const newOccurrences = match.leanFail.newOccurrences.filter((o) =>
          gatingRules.has(o.ruleId)
        );
        match.leanFail = {
          ...match.leanFail,
          total: match.leanFail.knownCount + newOccurrences.length,
          newCount: newOccurrences.length,
          newOccurrences
        };
        gating += newOccurrences.length;
      }
      if (gating) gated += 1;
      return { result, match, json: { ...result, baseline: { mode: 'check', ...match } } };
    }
    const failing =
      result.checksResults.some(
        (r) => r.outcome === 'fail' && countsForGate(r.severity, args.failOnSeverity)
      ) ||
      (args.failOnLean && gatingLeaningFailures(result, args).length > 0);
    if (failing) gated += 1;
    return { result, match: undefined, json: result };
  });

  if (args.json) {
    printJson(outputs.map((o) => o.json));
  } else {
    for (const o of outputs) printSummary(o.result, o.match, args);
    if (several) {
      process.stdout.write(
        `${pages.length} pages scanned: ${gated} ${args.baseline ? 'with new failures' : 'with failures'}${args.failOnLean ? ' or likely failures' : ''}${args.failOnSeverity ? ` at ${args.failOnSeverity} or above` : ''}.\n`
      );
    }
    printNotConformance(pages.map((p) => p.result));
  }
  process.exitCode = gated > 0 ? 1 : 0;
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
