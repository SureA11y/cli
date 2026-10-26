'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'surea11y.js');

function run(args, opts = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf8', ...opts });
    return { stdout, status: 0 };
  } catch (err) {
    // execFileSync throws on non-zero exit; recover stdout/stderr/status instead of failing the test.
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
      status: err.status
    };
  }
}

let tmpDir;
test.before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
});
test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CLI: --help exits 0 and prints usage', () => {
  const { stdout, status } = run(['--help']);
  assert.equal(status, 0);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /surea11y scan/);
  assert.match(stdout, /--write-baseline/);
  assert.match(stdout, /--baseline/);
  assert.match(stdout, /--custom-rules/);
});

test('CLI: no arguments exits 2 (usage error) and still prints help', () => {
  const { stdout, status } = run([]);
  assert.equal(status, 2);
  assert.match(stdout, /Usage:/);
});

test('CLI: --version prints the package version', () => {
  const pkg = require('../package.json');
  const { stdout, status } = run(['--version']);
  assert.equal(status, 0);
  assert.equal(stdout.trim(), pkg.version);
});

test('CLI: scanning a missing file exits 2 with a clear error', () => {
  const { status, stderr } = run(['scan', path.join(tmpDir, 'does-not-exist.html')]);
  assert.equal(status, 2);
  assert.match(stderr, /No such file/);
});

test('CLI: scan exits 1 and reports fail occurrences for a page with real violations', () => {
  const file = path.join(tmpDir, 'has-failures.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );

  const { stdout, status } = run(['scan', file]);
  assert.equal(status, 1);
  assert.match(stdout, /img-alt-present/);
  assert.match(stdout, /FAIL/);
});

test('CLI: mixed-tier occurrences in a fail rule are not all printed as fail in the summary', () => {
  const file = path.join(tmpDir, 'mixed-tier-summary.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><button id="x">X</button></main></body></html>'
  );
  const rulesFile = path.join(tmpDir, 'custom-rules-mixed-tier.js');
  fs.writeFileSync(
    rulesFile,
    `module.exports = [{
      id: 'org-mixed-tier',
      runInPage(ctx) {
        const el = ctx.document.getElementById('x');
        const selector = ctx.helpers.buildSelector(el);
        const html = el.outerHTML;
        return {
          ruleId: ctx.rule.ruleId,
          outcome: 'fail',
          occurrences: [
            { selector, html, summary: 'FAIL_ONLY_SUMMARY', occurrenceOutcome: 'fail' },
            { selector, html, summary: 'CANTTELL_ONLY_SUMMARY', occurrenceOutcome: 'cantTell' }
          ]
        };
      }
    }];`
  );

  const { stdout, status } = run([
    'scan',
    file,
    '--custom-rules',
    rulesFile,
    '--rules',
    'org-mixed-tier'
  ]);
  assert.equal(status, 1);
  assert.match(
    stdout,
    /org-mixed-tier\s+\(.*1 fail occurrence\(s\), 1 needs-review occurrence\(s\)\)/
  );
  assert.match(stdout, /FAIL_ONLY_SUMMARY/);
  assert.doesNotMatch(stdout, /CANTTELL_ONLY_SUMMARY/);
  assert.match(stdout, /cantTell — needs human review \(1 rule\(s\)\): org-mixed-tier/);
});

test('CLI: aria-prohibited-attr mixed fail+cantTell page shows separated tier counts in summary output', () => {
  const file = path.join(tmpDir, 'aria-prohibited-attr-mixed.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><span id="roleless_canttell" aria-label="Custom label">Visible text</span><span id="roleless_fail" aria-label="icon-only"></span></body></html>'
  );

  const { stdout, status } = run(['scan', file, '--rules', 'aria-prohibited-attr']);
  assert.equal(status, 1);
  assert.match(
    stdout,
    /aria-prohibited-attr\s+\(.*1 fail occurrence\(s\), 1 needs-review occurrence\(s\)\)/
  );
  assert.match(stdout, /cantTell — needs human review \(1 rule\(s\)\): aria-prohibited-attr/);
});

test('CLI: scan exits 0 for a page with no fail outcomes', () => {
  const file = path.join(tmpDir, 'clean.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1></main></body></html>'
  );

  const { status } = run(['scan', file, '--tags', 'wcag2a']);
  assert.equal(status, 0);
});

test('CLI: --json prints a parseable result with the expected top-level shape', () => {
  const file = path.join(tmpDir, 'json-check.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );

  const { stdout, status } = run(['scan', file, '--json']);
  assert.equal(status, 1);

  const result = JSON.parse(stdout);
  assert.ok(Array.isArray(result.checksResults));
  assert.equal(result.engine.tag, 'a11ycore');
  const imgRule = result.checksResults.find((r) => r.ruleId === 'img-alt-present');
  assert.equal(imgRule.outcome, 'fail');
});

test('CLI: --rules scopes the scan to only the requested rule IDs', () => {
  const file = path.join(tmpDir, 'rules-filter.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"><button></button></body></html>'
  );

  const { stdout, status } = run(['scan', file, '--json', '--rules', 'img-alt-present']);
  assert.equal(status, 1);

  const result = JSON.parse(stdout);
  assert.equal(result.checksResults.length, 1);
  assert.equal(result.checksResults[0].ruleId, 'img-alt-present');
});

test('CLI: unknown command exits 2', () => {
  const { status, stderr } = run(['not-a-real-command']);
  assert.equal(status, 2);
  assert.match(stderr, /unknown command/);
});

test('CLI: --write-baseline writes a well-formed baseline file and exits 0 despite a fail', () => {
  const file = path.join(tmpDir, 'baseline-write.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'baseline-write.json');

  const { status } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--write-baseline',
    baselinePath
  ]);
  assert.equal(status, 0);

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  assert.equal(baseline.version, 1);
  assert.equal(baseline.entries.length, 1);
  assert.equal(baseline.entries[0].ruleId, 'img-alt-present');
  assert.match(baseline.entries[0].html, /<img/);
});

test('CLI: --baseline against an unchanged page treats every occurrence as known and exits 0', () => {
  const file = path.join(tmpDir, 'baseline-known.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'baseline-known.json');

  run(['scan', file, '--rules', 'img-alt-present', '--write-baseline', baselinePath]);
  const { status, stdout } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--baseline',
    baselinePath
  ]);

  assert.equal(status, 0);
  assert.match(stdout, /baseline: 1 known, 0 new/);
});

test('CLI: --baseline exits 1 when a new violation appears that is not in the baseline', () => {
  const file = path.join(tmpDir, 'baseline-new.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'baseline-new.json');
  run(['scan', file, '--rules', 'img-alt-present', '--write-baseline', baselinePath]);

  // Add a second, genuinely new violation (different src => different html snippet).
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"><img src="y.png"></body></html>'
  );
  const { status, stdout } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--baseline',
    baselinePath
  ]);

  assert.equal(status, 1);
  assert.match(stdout, /baseline: 1 known, 1 new/);
  assert.match(stdout, /NEW \(not in baseline/);
});

test('CLI: --baseline pointing at a missing file exits 2 with a clear error', () => {
  const file = path.join(tmpDir, 'baseline-missing.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );

  const { status, stderr } = run([
    'scan',
    file,
    '--baseline',
    path.join(tmpDir, 'does-not-exist.json')
  ]);
  assert.equal(status, 2);
  assert.match(stderr, /Could not read baseline file/);
});

test('CLI: --baseline pointing at a file with invalid JSON exits 2 with a clear error', () => {
  const file = path.join(tmpDir, 'baseline-badjson.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'baseline-badjson.json');
  fs.writeFileSync(baselinePath, '{ not valid json');

  const { status, stderr } = run(['scan', file, '--baseline', baselinePath]);
  assert.equal(status, 2);
  assert.match(stderr, /not valid JSON/);
});

test('CLI: --baseline pointing at a file with an unsupported/missing version exits 2 with a clear error', () => {
  const file = path.join(tmpDir, 'baseline-badversion.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'baseline-badversion.json');
  fs.writeFileSync(baselinePath, JSON.stringify({ entries: [] })); // no version field

  const { status, stderr } = run(['scan', file, '--baseline', baselinePath]);
  assert.equal(status, 2);
  assert.match(stderr, /not a supported baseline/);
});

test('CLI: --baseline and --write-baseline together exits 2', () => {
  const file = path.join(tmpDir, 'baseline-combo.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );

  const { status, stderr } = run([
    'scan',
    file,
    '--baseline',
    'a.json',
    '--write-baseline',
    'b.json'
  ]);
  assert.equal(status, 2);
  assert.match(stderr, /cannot be used together/);
});

test('CLI: --json + --write-baseline augments the printed result with a write-mode baseline block', () => {
  const file = path.join(tmpDir, 'baseline-write-json.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'baseline-write-json.json');

  const { stdout, status } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--write-baseline',
    baselinePath,
    '--json'
  ]);
  assert.equal(status, 0);

  const result = JSON.parse(stdout);
  assert.ok(Array.isArray(result.checksResults));
  assert.equal(result.baseline.mode, 'write');
  assert.equal(result.baseline.path, baselinePath);
  assert.equal(result.baseline.entries, 1);
});

test('CLI: --json + --baseline augments the printed result with a baseline block', () => {
  const file = path.join(tmpDir, 'baseline-json.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'baseline-json.json');
  run(['scan', file, '--rules', 'img-alt-present', '--write-baseline', baselinePath]);

  const { stdout, status } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--baseline',
    baselinePath,
    '--json'
  ]);
  assert.equal(status, 0);

  const result = JSON.parse(stdout);
  assert.ok(Array.isArray(result.checksResults));
  assert.equal(result.baseline.mode, 'check');
  assert.equal(result.baseline.knownCount, 1);
  assert.equal(result.baseline.newCount, 0);
});

test('CLI: --html writes a self-contained HTML report to the given path', () => {
  const file = path.join(tmpDir, 'report-source.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const reportPath = path.join(tmpDir, 'report-output.html');

  const { status, stderr } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--html',
    reportPath
  ]);
  assert.equal(status, 1); // --html doesn't change gating: the scan still has a real fail
  assert.match(stderr, /Wrote HTML report to/);

  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /^<!doctype html>/);
  assert.match(report, /img-alt-present/);
  assert.doesNotMatch(report, /\ssrc=["']https?:/);
});

test('CLI: --html works alongside --json (both artifacts produced from the same scan)', () => {
  const file = path.join(tmpDir, 'report-both.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const reportPath = path.join(tmpDir, 'report-both-output.html');

  const { stdout, status } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--html',
    reportPath,
    '--json'
  ]);
  assert.equal(status, 1);

  const result = JSON.parse(stdout);
  assert.ok(Array.isArray(result.checksResults));
  assert.ok(fs.existsSync(reportPath));
});

test('CLI: --sarif writes a well-formed SARIF 2.1.0 log with an "error"-level result', () => {
  const file = path.join(tmpDir, 'sarif-source.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const sarifPath = path.join(tmpDir, 'sarif-output.sarif');

  const { status, stderr } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--sarif',
    sarifPath
  ]);
  assert.equal(status, 1); // --sarif doesn't change gating: the scan still has a real fail
  assert.match(stderr, /Wrote SARIF report to/);

  const sarif = JSON.parse(fs.readFileSync(sarifPath, 'utf8'));
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].tool.driver.name, 'surea11y');
  assert.equal(sarif.runs[0].results[0].ruleId, 'img-alt-present');
  assert.equal(sarif.runs[0].results[0].level, 'error');
});

test('CLI: --sarif combined with --baseline omits already-known fail occurrences', () => {
  const file = path.join(tmpDir, 'sarif-baseline.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const baselinePath = path.join(tmpDir, 'sarif-baseline.json');
  const sarifPath = path.join(tmpDir, 'sarif-baseline.sarif');

  run(['scan', file, '--rules', 'img-alt-present', '--write-baseline', baselinePath]);
  const { status } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--baseline',
    baselinePath,
    '--sarif',
    sarifPath
  ]);
  assert.equal(status, 0); // known, not new -- baseline gating still passes

  const sarif = JSON.parse(fs.readFileSync(sarifPath, 'utf8'));
  assert.equal(sarif.runs[0].results.length, 0);
});

test('CLI: --sarif works alongside --html and --json (all three artifacts from the same scan)', () => {
  const file = path.join(tmpDir, 'sarif-multi.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const sarifPath = path.join(tmpDir, 'sarif-multi.sarif');
  const reportPath = path.join(tmpDir, 'sarif-multi.html.report');

  const { stdout, status } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--sarif',
    sarifPath,
    '--html',
    reportPath,
    '--json'
  ]);
  assert.equal(status, 1);

  const result = JSON.parse(stdout);
  assert.ok(Array.isArray(result.checksResults));
  assert.ok(fs.existsSync(sarifPath));
  assert.ok(fs.existsSync(reportPath));
});

test('CLI: --custom-rules loads a runtime rule from a file exporting an array of descriptors', () => {
  const file = path.join(tmpDir, 'custom-rules-array.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><button onclick="go()">Go</button></main></body></html>'
  );
  const rulesFile = path.join(tmpDir, 'custom-rules-array.js');
  fs.writeFileSync(
    rulesFile,
    `module.exports = [{
      id: 'org-no-inline-onclick',
      meta: { title: 'No inline onclick handlers' },
      runInPage(ctx) {
        const els = ctx.helpers.queryAll('[onclick]');
        const occurrences = els.map((el) => ({
          selector: ctx.helpers.buildSelector(el),
          html: el.outerHTML,
          summary: 'Inline onclick handler found.'
        }));
        return { ruleId: ctx.rule.ruleId, outcome: occurrences.length ? 'fail' : 'pass', occurrences };
      }
    }];`
  );

  const { stdout, status } = run([
    'scan',
    file,
    '--custom-rules',
    rulesFile,
    '--rules',
    'org-no-inline-onclick',
    '--json'
  ]);
  assert.equal(status, 1);

  const result = JSON.parse(stdout);
  assert.equal(result.checksResults.length, 1);
  assert.equal(result.checksResults[0].ruleId, 'org-no-inline-onclick');
  assert.equal(result.checksResults[0].outcome, 'fail');
  assert.equal(result.checksResults[0].occurrences[0].selector, 'html > body > main > button');
});

test('CLI: --custom-rules accepts a file exporting a single descriptor object, not just an array', () => {
  const file = path.join(tmpDir, 'custom-rules-single.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1></main></body></html>'
  );
  const rulesFile = path.join(tmpDir, 'custom-rules-single.js');
  fs.writeFileSync(
    rulesFile,
    `module.exports = {
      id: 'org-always-pass',
      runInPage(ctx) {
        return { ruleId: ctx.rule.ruleId, outcome: 'pass', occurrences: [] };
      }
    };`
  );

  const { stdout, status } = run([
    'scan',
    file,
    '--custom-rules',
    rulesFile,
    '--rules',
    'org-always-pass',
    '--json'
  ]);
  assert.equal(status, 0);

  const result = JSON.parse(stdout);
  assert.equal(result.checksResults.length, 1);
  assert.equal(result.checksResults[0].ruleId, 'org-always-pass');
  assert.equal(result.checksResults[0].outcome, 'pass');
});

test('CLI: --custom-rules is repeatable and merges rules from every file', () => {
  const file = path.join(tmpDir, 'custom-rules-repeat.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1></main></body></html>'
  );
  const ruleAFile = path.join(tmpDir, 'custom-rules-repeat-a.js');
  const ruleBFile = path.join(tmpDir, 'custom-rules-repeat-b.js');
  fs.writeFileSync(
    ruleAFile,
    `module.exports = [{ id: 'org-rule-a', runInPage(ctx) { return { ruleId: ctx.rule.ruleId, outcome: 'pass', occurrences: [] }; } }];`
  );
  fs.writeFileSync(
    ruleBFile,
    `module.exports = [{ id: 'org-rule-b', runInPage(ctx) { return { ruleId: ctx.rule.ruleId, outcome: 'pass', occurrences: [] }; } }];`
  );

  const { stdout, status } = run([
    'scan',
    file,
    '--custom-rules',
    ruleAFile,
    '--custom-rules',
    ruleBFile,
    '--rules',
    'org-rule-a,org-rule-b',
    '--json'
  ]);
  assert.equal(status, 0);

  const result = JSON.parse(stdout);
  const ruleIds = result.checksResults.map((r) => r.ruleId).sort();
  assert.deepEqual(ruleIds, ['org-rule-a', 'org-rule-b']);
});

test('CLI: --custom-rules colliding with a built-in rule id overrides it, surfaced via overriddenBuiltinIds', () => {
  const file = path.join(tmpDir, 'custom-rules-override.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const rulesFile = path.join(tmpDir, 'custom-rules-override.js');
  fs.writeFileSync(
    rulesFile,
    `module.exports = [{
      id: 'img-alt-present',
      runInPage(ctx) { return { ruleId: ctx.rule.ruleId, outcome: 'pass', occurrences: [] }; }
    }];`
  );

  const { stdout, status } = run([
    'scan',
    file,
    '--custom-rules',
    rulesFile,
    '--rules',
    'img-alt-present',
    '--json'
  ]);
  assert.equal(status, 0); // the overriding custom rule always passes, unlike the real built-in rule

  const result = JSON.parse(stdout);
  assert.deepEqual(result.overriddenBuiltinIds, ['img-alt-present']);
});

test('CLI: --custom-rules pointing at a missing file exits 2 with a clear error', () => {
  const file = path.join(tmpDir, 'custom-rules-missing.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1></main></body></html>'
  );

  const { status, stderr } = run([
    'scan',
    file,
    '--custom-rules',
    path.join(tmpDir, 'does-not-exist.js')
  ]);
  assert.equal(status, 2);
  assert.match(stderr, /Could not load custom rules file/);
});

test('CLI: --custom-rules pointing at a file with a malformed export exits 2 with a clear error', () => {
  const file = path.join(tmpDir, 'custom-rules-malformed.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1></main></body></html>'
  );
  const rulesFile = path.join(tmpDir, 'custom-rules-malformed.js');
  fs.writeFileSync(rulesFile, 'module.exports = { notAnId: true };');

  const { status, stderr } = run(['scan', file, '--custom-rules', rulesFile]);
  assert.equal(status, 2);
  assert.match(stderr, /must export a rule descriptor/);
});

test('CLI: --custom-rules whose module itself throws on require exits 2 with a clear error', () => {
  const file = path.join(tmpDir, 'custom-rules-throws.html');
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1></main></body></html>'
  );
  const rulesFile = path.join(tmpDir, 'custom-rules-throws.js');
  fs.writeFileSync(rulesFile, "throw new Error('boom during require');");

  const { status, stderr } = run(['scan', file, '--custom-rules', rulesFile]);
  assert.equal(status, 2);
  assert.match(stderr, /Could not load custom rules file/);
  assert.match(stderr, /boom during require/);
});

function writeSimplePage(name) {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(
    file,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><img src="x.png"></main></body></html>'
  );
  return file;
}

test('CLI: --help names the installed engine release', () => {
  const corePkg = require('@surea11y/core/package.json');
  const { stdout, status } = run(['--help']);
  assert.equal(status, 0);
  assert.match(
    stdout.split('\n')[0],
    new RegExp(`@surea11y/core v${corePkg.version.replace(/\./g, '\\.')}`)
  );
});

test('CLI: the summary and --json name the engine release that produced the result', () => {
  const corePkg = require('@surea11y/core/package.json');
  const file = writeSimplePage('engine-version.html');

  const summary = run(['scan', file]);
  assert.match(
    summary.stdout,
    new RegExp(`engine: @surea11y/core ${corePkg.version.replace(/\./g, '\\.')}`)
  );

  const json = run(['scan', file, '--json']);
  assert.equal(JSON.parse(json.stdout).engine.version, corePkg.version);
});

test('CLI: --rules naming no known rule exits 2 instead of running nothing', () => {
  const file = writeSimplePage('run-only-rules.html');
  const { status, stdout, stderr } = run(['scan', file, '--rules', 'img-alt-presnet']);
  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /Error: --rules: no rule named "img-alt-presnet"\. No rule ran\./);
});

test('CLI: --tags naming no known tag exits 2 instead of running nothing', () => {
  const file = writeSimplePage('run-only-tags.html');
  const { status, stderr } = run(['scan', file, '--tags', 'wcag2.2aa']);
  assert.equal(status, 2);
  assert.match(stderr, /Error: --tags: no tag named "wcag2\.2aa"\. No rule ran\./);
});

test('CLI: --rules with one unknown id beside a known one still scans, with a warning', () => {
  const file = writeSimplePage('run-only-partial.html');
  const { status, stdout, stderr } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present,img-alt-presnet',
    '--json'
  ]);
  assert.equal(status, 1);
  assert.match(stderr, /img-alt-presnet/);
  assert.deepEqual(
    JSON.parse(stdout).checksResults.map((r) => r.ruleId),
    ['img-alt-present']
  );
});

test('CLI: --context matching no element exits 2 rather than reporting a clean scan', () => {
  const file = writeSimplePage('context-unmatched.html');
  const html = path.join(tmpDir, 'context-unmatched-report.html');
  const { status, stdout, stderr } = run([
    'scan',
    file,
    '--context',
    '#no-such-scope',
    '--json',
    '--html',
    html
  ]);
  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.match(
    stderr,
    /Error: --context "#no-such-scope" matched no element, so nothing was scanned/
  );
  assert.equal(fs.existsSync(html), false);
});

test('CLI: --context matching an element scans only that subtree', () => {
  const file = writeSimplePage('context-matched.html');
  const { status, stdout } = run(['scan', file, '--context', 'main', '--json']);
  assert.equal(status, 1);
  assert.deepEqual(JSON.parse(stdout).contextMatch, { elementCount: 1, unmatchedSelectors: [] });
});

test('CLI: --context with an invalid selector exits 2 naming the flag', () => {
  const file = writeSimplePage('context-invalid.html');
  const { status, stderr } = run(['scan', file, '--context', '[[']);
  assert.equal(status, 2);
  assert.match(stderr, /Error: --context: "\[\[" is not a valid CSS selector/);
});

test('CLI: --custom-rules that the engine skips exit 2 and name each rule and why', () => {
  const file = writeSimplePage('custom-rules-skipped.html');
  const rulesFile = path.join(tmpDir, 'custom-rules-skipped.js');
  fs.writeFileSync(
    rulesFile,
    `const run = (ctx) => ({ ruleId: ctx.rule.ruleId, outcome: 'pass', occurrences: [] });
    module.exports = [
      { id: 'org-twice', runInPage: run },
      { id: 'org-twice', runInPage: run },
      { id: 'org-bad-meta', meta: { deprecated: true }, runInPage: run }
    ];`
  );

  const { status, stdout, stderr } = run(['scan', file, '--custom-rules', rulesFile, '--json']);
  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /Error: 2 custom rule\(s\) from --custom-rules did not run:/);
  assert.match(stderr, /- "org-twice": another custom rule already has this id/);
  assert.match(stderr, /- "org-bad-meta": invalid meta/);
});

test('CLI: --junit writes a JUnit XML report with a failing testcase per failing rule', () => {
  const file = writeSimplePage('junit-source.html');
  const junitPath = path.join(tmpDir, 'junit-output.xml');

  const { status, stderr } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--junit',
    junitPath
  ]);
  assert.equal(status, 1); // --junit doesn't change gating: the scan still has a real fail
  assert.match(stderr, /Wrote JUnit report to/);

  const xml = fs.readFileSync(junitPath, 'utf8');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<testsuites name="surea11y" tests="1" failures="1"/);
  assert.match(xml, /<testcase classname="wcag-1\.1\.1" name="img-alt-present"/);
  assert.match(xml, /<failure type="fail"/);
});

test('CLI: --junit combined with --baseline reports known failures as skipped, not failing', () => {
  const file = writeSimplePage('junit-baseline.html');
  const baselinePath = path.join(tmpDir, 'junit-baseline.json');
  const junitPath = path.join(tmpDir, 'junit-baseline.xml');

  run(['scan', file, '--rules', 'img-alt-present', '--write-baseline', baselinePath]);
  const { status } = run([
    'scan',
    file,
    '--rules',
    'img-alt-present',
    '--baseline',
    baselinePath,
    '--junit',
    junitPath
  ]);
  assert.equal(status, 0);

  const xml = fs.readFileSync(junitPath, 'utf8');
  assert.match(xml, /failures="0"/);
  assert.match(xml, /<skipped message="1 known failure/);
});

// --- packs and profiles ------------------------------------------------------------

const PACK_PAGE =
  '<!doctype html><html lang="en"><head><title>T</title></head><body><main><img src="a.png"></main></body></html>';

// A pack as a plain object (definePack only checks it): one rule of its own,
// and a checklist profile whose one item groups core's img-alt-present.
const PACK_SOURCE = `module.exports = {
  name: '@acme/a11y-rules',
  version: '1.0.0',
  namespace: 'acme',
  core: '*',
  title: 'Acme policy',
  rules: [{
    id: 'acme-no-images',
    meta: { title: 'No images', tags: ['house-rules'] },
    runInPage(ctx) {
      const imgs = ctx.helpers.queryAll('img');
      return imgs.length
        ? { outcome: 'fail', occurrences: imgs.map((el) => ({ selector: ctx.helpers.buildSelector(el), summary: 'An image.' })) }
        : { outcome: 'pass' };
    }
  }],
  profiles: { 'acme-1': { tags: ['wcag2a', 'wcag2aa'] } },
  rollups: [{ id: 'acme-images', title: 'Images', checksIds: ['img-alt-present'] }]
};`;

const CLI_DOC = fs.readFileSync(path.join(__dirname, '..', 'docs', 'CLI.md'), 'utf8');
const ACME_POLICY_PACK = CLI_DOC.match(/```js\n(\/\/ acme-policy-pack\.js\n[\s\S]*?)```/)[1];

function linkCore(project) {
  fs.mkdirSync(path.join(project, 'node_modules', '@surea11y'), { recursive: true });
  fs.symlinkSync(
    path.dirname(require.resolve('@surea11y/core/package.json')),
    path.join(project, 'node_modules', '@surea11y', 'core')
  );
}

function packFiles(name) {
  const page = path.join(tmpDir, `${name}.html`);
  fs.writeFileSync(page, PACK_PAGE);
  const pack = path.join(tmpDir, `${name}-pack.js`);
  fs.writeFileSync(pack, PACK_SOURCE);
  return { page, pack };
}

test('CLI: --help lists --pack and --profile', () => {
  const { stdout } = run(['--help']);
  assert.match(stdout, /--pack <name-or-path>/);
  assert.match(stdout, /--profile <name>/);
});

test('CLI: --pack runs the pack rules, and the result names it', () => {
  const { page, pack } = packFiles('pack-rules');
  const { stdout, status } = run(['scan', page, '--pack', pack, '--json']);
  assert.equal(status, 1);
  const result = JSON.parse(stdout);
  assert.deepEqual(result.engine.packs, ['@acme/a11y-rules@1.0.0']);
  assert.equal(result.checksResults.find((r) => r.ruleId === 'acme-no-images').outcome, 'fail');
});

test("CLI: --profile runs a pack's profile, its items included, and the summary names both", () => {
  const { page, pack } = packFiles('pack-profile');
  const json = JSON.parse(
    run(['scan', page, '--pack', pack, '--profile', 'acme-1', '--json']).stdout
  );
  assert.equal(json.engine.profile, 'acme-1');
  const item = json.rulesResults.find((r) => r.ruleId === 'acme-images');
  assert.equal(item.outcome, 'fail');
  const { stdout } = run(['scan', page, '--pack', pack, '--profile', 'acme-1']);
  assert.match(stdout, /profile: acme-1/);
  assert.match(stdout, /packs: @acme\/a11y-rules@1\.0\.0/);
});

test('CLI: a --profile that was not applied is a usage error (exit 2)', () => {
  const { page } = packFiles('profile-missing');
  const { stderr, status } = run(['scan', page, '--profile', 'acme-1']);
  assert.equal(status, 2);
  assert.match(stderr, /--profile "acme-1" was not applied/);
  assert.match(stderr, /a pack's profile needs --pack/);
});

test('CLI: a --pack the engine could not run, or could not find, is a usage error (exit 2)', () => {
  const { page } = packFiles('pack-invalid');
  const invalid = path.join(tmpDir, 'pack-invalid-pack.js');
  fs.writeFileSync(
    invalid,
    "module.exports = { name: 'old', version: '1.0.0', namespace: 'old', core: '^99.0.0' };"
  );
  const skipped = run(['scan', page, '--pack', invalid]);
  assert.equal(skipped.status, 2);
  assert.match(
    skipped.stderr,
    /1 pack\(s\) from --pack did not run:\n {2}- "old": .*supports core/
  );
  const missing = run(['scan', page, '--pack', './no-such-pack.js']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Could not find pack "\.\/no-such-pack\.js": Cannot find module/);
});

test('CLI: --pack by package name resolves from the working directory, and its profile runs', () => {
  const project = path.join(tmpDir, 'pack-by-name');
  const packDir = path.join(project, 'node_modules', '@acme', 'a11y-policy');
  fs.mkdirSync(packDir, { recursive: true });
  linkCore(project);
  fs.writeFileSync(
    path.join(packDir, 'package.json'),
    JSON.stringify({ name: '@acme/a11y-policy', version: '1.0.0', main: 'index.js' })
  );
  fs.writeFileSync(path.join(packDir, 'index.js'), ACME_POLICY_PACK);
  fs.writeFileSync(
    path.join(project, 'page.html'),
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><video src="a.mp4" autoplay></video></main></body></html>'
  );

  const { stdout, status } = run(
    ['scan', 'page.html', '--pack', '@acme/a11y-policy', '--profile', 'acme-web-2026', '--json'],
    { cwd: project }
  );
  assert.equal(status, 1);
  const result = JSON.parse(stdout);
  assert.deepEqual(result.engine.packs, ['@acme/a11y-policy@1.0.0']);
  assert.equal(result.engine.profile, 'acme-web-2026');
  assert.equal(result.checksResults.find((r) => r.ruleId === 'acme-no-autoplay').outcome, 'fail');
  assert.equal(result.rulesResults.find((r) => r.ruleId === 'acme-media').outcome, 'fail');
});

test('CLI: a --pack name not installed in the project exits 2 and says how to install it', () => {
  const page = writeSimplePage('pack-not-installed.html');
  const { status, stderr } = run(['scan', page, '--pack', '@acme/not-installed']);
  assert.equal(status, 2);
  assert.match(
    stderr,
    /Could not find pack "@acme\/not-installed"; install it in this project \(npm install @acme\/not-installed\)/
  );
});

test('CLI: a --pack the engine skips writes no report or baseline', () => {
  const { page } = packFiles('pack-skipped-outputs');
  const pack = path.join(tmpDir, 'pack-skipped-outputs-old.js');
  fs.writeFileSync(
    pack,
    "module.exports = { name: 'old', version: '1.0.0', namespace: 'old', core: '^99.0.0' };"
  );
  const sarif = path.join(tmpDir, 'pack-skipped.sarif');
  const baseline = path.join(tmpDir, 'pack-skipped-baseline.json');
  const { status, stdout } = run([
    'scan',
    page,
    '--pack',
    pack,
    '--sarif',
    sarif,
    '--write-baseline',
    baseline,
    '--json'
  ]);
  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.equal(fs.existsSync(sarif), false);
  assert.equal(fs.existsSync(baseline), false);
});

test('CLI: --profile names a profile in any case, as the engine does', () => {
  const page = writeSimplePage('profile-case.html');
  const { stdout, status } = run(['scan', page, '--profile', 'WCAG22-AA', '--json']);
  assert.equal(status, 1);
  assert.equal(JSON.parse(stdout).engine.profile, 'wcag22-aa');
});

// --- WCAG target, best practices, compact results ---------------------------------

const TARGET_PAGE =
  '<!doctype html><html lang="en"><head><title>T</title></head><body><main><img src="a.png"></main><div>Outside</div></body></html>';

function scanIds(name, args) {
  const page = path.join(tmpDir, `${name}.html`);
  fs.writeFileSync(page, TARGET_PAGE);
  const { stdout, stderr, status } = run(['scan', page, ...args, '--json']);
  return {
    status,
    stderr,
    ids: stdout ? JSON.parse(stdout).checksResults.map((r) => r.ruleId) : []
  };
}

test('CLI: --help lists --wcag, --wcag-level, --include-mode, --best-practices and --compact', () => {
  const { stdout } = run(['--help']);
  assert.match(stdout, /--include-mode <mode>/);
  assert.match(stdout, /--wcag <version>/);
  assert.match(stdout, /--wcag-level <level>/);
  assert.match(stdout, /--best-practices/);
  assert.match(stdout, /--compact/);
});

test('CLI: --wcag runs the rules of a WCAG target, by version and level', () => {
  const aa22 = scanIds('wcag-22-aa', ['--wcag', '2.2']);
  assert.equal(aa22.status, 1);
  assert.ok(aa22.ids.includes('img-alt-present'));
  assert.ok(aa22.ids.includes('target-size-minimum'));
  assert.ok(!aa22.ids.includes('duplicate-id'));
  assert.ok(!aa22.ids.includes('region'));

  const a21 = scanIds('wcag-21-a', ['--wcag', '2.1', '--wcag-level', 'A']);
  assert.ok(a21.ids.includes('duplicate-id'));
  assert.ok(!a21.ids.includes('target-size-minimum'));
  assert.ok(a21.ids.length < aa22.ids.length);
});

test('CLI: --best-practices alone runs only the best-practice rules', () => {
  const { ids } = scanIds('best-practices-only', ['--best-practices']);
  assert.ok(ids.includes('region'));
  assert.ok(!ids.includes('img-alt-present'));
});

test('CLI: --wcag with --best-practices, --tags and --exclude-rules combines them', () => {
  const both = scanIds('wcag-bp', ['--wcag', '2.2', '--best-practices']);
  assert.ok(both.ids.includes('region'));
  assert.ok(both.ids.includes('img-alt-present'));

  const tagged = scanIds('wcag-tags', ['--wcag', '2.2', '--tags', 'best-practice']);
  assert.ok(tagged.ids.includes('region'));

  const excluded = scanIds('wcag-exclude', [
    '--wcag',
    '2.2',
    '--best-practices',
    '--exclude-rules',
    'region,img-alt-present'
  ]);
  assert.ok(!excluded.ids.includes('region'));
  assert.ok(!excluded.ids.includes('img-alt-present'));
});

test('CLI: --best-practices beside --profile adds its rules and keeps the profile', () => {
  const page = writeSimplePage('profile-best-practices.html');
  const { stdout } = run(['scan', page, '--profile', 'wcag22-aa', '--best-practices', '--json']);
  const result = JSON.parse(stdout);
  assert.equal(result.engine.profile, 'wcag22-aa');
  assert.ok(result.checksResults.some((r) => r.ruleId === 'region'));
});

test('CLI: an invalid --wcag or --wcag-level, or a level without a version, exits 2 naming the flag', () => {
  const version = scanIds('wcag-bad-version', ['--wcag', '3.0']);
  assert.equal(version.status, 2);
  assert.match(version.stderr, /Error: --wcag must be "2\.0", "2\.1" or "2\.2", not "3\.0"\./);

  const level = scanIds('wcag-bad-level', ['--wcag', '2.2', '--wcag-level', 'B']);
  assert.equal(level.status, 2);
  assert.match(level.stderr, /Error: --wcag-level must be "A", "AA" or "AAA", not "B"\./);

  const alone = scanIds('wcag-level-alone', ['--wcag-level', 'B']);
  assert.equal(alone.status, 2);
  assert.match(alone.stderr, /Error: --wcag-level must be "A", "AA" or "AAA", not "B"\./);
});

// --- --include-mode and --wcag-level without --wcag ---------------------------------

const CONTRAST_PAGE =
  '<!doctype html><html lang="en"><head><title>T</title></head><body><main><p style="color:#767676;background:#fff">Grey text</p></main></body></html>';

function scanContrastPage(name, args) {
  const page = path.join(tmpDir, `${name}.html`);
  fs.writeFileSync(page, CONTRAST_PAGE);
  const { stdout, stderr, status } = run(['scan', page, ...args, '--json']);
  const result = stdout ? JSON.parse(stdout) : null;
  return {
    status,
    stderr,
    result,
    ids: result ? result.checksResults.map((r) => r.ruleId) : [],
    rollups: result ? result.rulesResults.map((r) => r.ruleId) : []
  };
}

test('CLI: --include-mode or runs the rules --tags select plus the ones --rules name', () => {
  // contrast-computable carries no forms tag: under the default 'and', the two
  // have no rule in common and nothing runs, which exits 2 with a hint.
  const and = scanContrastPage('include-mode-and', [
    '--tags',
    'forms',
    '--rules',
    'contrast-computable'
  ]);
  assert.equal(and.status, 2);
  assert.match(
    and.stderr,
    /no rule in common \(--include-mode or runs the rules that match either\)/
  );

  const forms = scanContrastPage('include-mode-forms', ['--tags', 'forms']);
  const or = scanContrastPage('include-mode-or', [
    '--tags',
    'forms',
    '--rules',
    'contrast-computable',
    '--include-mode',
    'or'
  ]);
  assert.ok(or.ids.includes('contrast-computable'));
  assert.equal(or.ids.length, forms.ids.length + 1, 'the forms rules, plus contrast-computable');
});

test('CLI: --include-mode works beside --wcag too, where the lists go into runOnly', () => {
  const { ids } = scanContrastPage('include-mode-wcag', [
    '--best-practices',
    '--tags',
    'forms',
    '--rules',
    'contrast-computable',
    '--include-mode',
    'or'
  ]);
  assert.ok(ids.includes('contrast-computable'));
  assert.ok(ids.includes('region'));
});

test('CLI: an --include-mode other than and or or exits 2 naming the flag', () => {
  const { status, stderr } = scanContrastPage('include-mode-bad', [
    '--tags',
    'forms',
    '--include-mode',
    'xor'
  ]);
  assert.equal(status, 2);
  assert.match(stderr, /Error: --include-mode must be "and" or "or", not "xor"\./);
});

test('CLI: --wcag-level without --wcag gives the level of the criteria reported, without changing what runs', () => {
  // contrast-computable checks 1.4.3 (AA) and 1.4.6 (AAA).
  const every = scanContrastPage('wcag-level-every', ['--rules', 'contrast-computable']);
  assert.deepEqual(every.rollups, ['wcag-1.4.3-contrast-minimum', 'wcag-1.4.6-contrast-enhanced']);

  const aa = scanContrastPage('wcag-level-aa', [
    '--rules',
    'contrast-computable',
    '--wcag-level',
    'aa'
  ]);
  assert.equal(aa.result.engine.wcagLevel, 'AA');
  assert.deepEqual(aa.rollups, ['wcag-1.4.3-contrast-minimum']);
  assert.deepEqual(aa.ids, ['contrast-computable']);

  const page = path.join(tmpDir, 'wcag-level-summary.html');
  fs.writeFileSync(page, CONTRAST_PAGE);
  const { stdout } = run(['scan', page, '--rules', 'contrast-computable', '--wcag-level', 'AA']);
  assert.match(stdout, /WCAG level reported: AA/);
});

test('CLI: --rules naming no known rule beside --wcag still exits 2 naming the flag', () => {
  const { status, stderr } = scanIds('wcag-rules-typo', [
    '--wcag',
    '2.2',
    '--rules',
    'img-alt-presnt'
  ]);
  assert.equal(status, 2);
  assert.match(stderr, /Error: --rules: no rule named "img-alt-presnt"\. No rule ran\./);
});

test('CLI: --profile beside --wcag is not applied, and exits 2 saying why', () => {
  const { status, stderr } = scanIds('profile-and-wcag', [
    '--profile',
    'wcag22-aa',
    '--wcag',
    '2.2'
  ]);
  assert.equal(status, 2);
  assert.match(
    stderr,
    /--profile "wcag22-aa" was not applied: --wcag chose the rules in its place, so give one or the other/
  );
});

test('CLI: --compact keeps pass and notApplicable results short, and the reports unchanged', () => {
  const page = writeSimplePage('compact.html');
  const full = path.join(tmpDir, 'compact-full.sarif');
  const compact = path.join(tmpDir, 'compact-compact.sarif');
  const fullRun = run(['scan', page, '--json', '--sarif', full]);
  const compactRun = run(['scan', page, '--compact', '--json', '--sarif', compact]);
  assert.equal(compactRun.status, fullRun.status);

  const result = JSON.parse(compactRun.stdout);
  assert.equal(result.engine.outputDetail, 'findings');
  const passed = result.checksResults.find((r) => r.outcome === 'pass');
  assert.deepEqual(Object.keys(passed).sort(), ['outcome', 'ruleId', 'type']);
  assert.ok(compactRun.stdout.length < fullRun.stdout.length / 2);
  assert.equal(fs.readFileSync(compact, 'utf8'), fs.readFileSync(full, 'utf8'));
});

test('CLI: the pack example in docs/CLI.md prints the output it shows', () => {
  const project = path.join(tmpDir, 'docs-pack-example');
  fs.mkdirSync(project);
  linkCore(project);
  fs.writeFileSync(path.join(project, 'acme-policy-pack.js'), ACME_POLICY_PACK);
  const page = CLI_DOC.match(/cat > page\.html <<'HTML'\n([\s\S]*?)\nHTML\n/)[1];
  fs.writeFileSync(path.join(project, 'page.html'), page + '\n');
  const expected = CLI_DOC.match(
    /```\n(surea11y scan: file:\/\/\/path\/to\/page\.html\n[\s\S]*?)```/
  )[1];

  const { stdout, status } = run(
    ['scan', './page.html', '--pack', './acme-policy-pack.js', '--profile', 'acme-web-2026'],
    { cwd: project }
  );
  assert.equal(status, 1);
  // The doc names the core it was written against; any later core prints its own.
  const anyCore = (text) => text.replace(/(engine: @surea11y\/core )\S+/, '$1x.y.z');
  assert.equal(
    anyCore(stdout.replace(/file:\/\/\S*\/page\.html/, 'file:///path/to/page.html')).trim(),
    anyCore(expected).trim()
  );
});

test('CLI: a rule selection that cancels itself out exits 2 rather than passing', () => {
  const { status, ids, stderr } = scanIds('selection-cancels', [
    '--rules',
    'img-alt-present',
    '--exclude-rules',
    'img-alt-present'
  ]);
  assert.equal(status, 2);
  assert.deepEqual(ids, []);
  assert.match(stderr, /Error: No rule ran: .*Nothing was checked\./);
});

// --- core 1.12: criteria in the terminal, and the level of the criteria reported ------

const CRITERIA_PAGE =
  '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1><img src="a.png"><p style="color:#999;background:#fff">Grey text</p><button></button></main></body></html>';

function scanCriteriaPage(name, args) {
  const page = path.join(tmpDir, `${name}.html`);
  fs.writeFileSync(page, CRITERIA_PAGE);
  return run(['scan', page, ...args]);
}

function criteriaBlock(stdout) {
  const start = stdout.indexOf('criteria (');
  return start === -1 ? '' : stdout.slice(start, stdout.indexOf('\n\n', start));
}

test('CLI: the summary lists the WCAG criteria by outcome, fail before cantTell before pass, and says passing is no conformance claim', () => {
  const { stdout } = scanCriteriaPage('criteria-wcag', ['--wcag', '2.2']);
  const block = criteriaBlock(stdout);
  assert.match(block, /^criteria \(WCAG 2\.2 AA\):\n/);
  const at = (label) => block.search(new RegExp(`\\n  ${label} +\\S`));
  // Core 1.14 passes no WCAG criterion yet; a pass line, when one comes, follows cantTell.
  assert.ok(at('fail') > 0 && at('fail') < at('cantTell'), block);
  assert.ok(at('pass') === -1 || at('cantTell') < at('pass'), block);
  assert.match(block, /\n {2}fail +1\.1\.1 [^\n]*1\.4\.3 /);
  assert.match(block, /\n {2}notApplicable: \d+\n/);
  assert.match(block, /not that the page conforms\.$/);
});

test('CLI: a --rules scan at --wcag-level AA lists 1.4.3 as partly checked, and no 1.4.6', () => {
  const { stdout } = scanCriteriaPage('criteria-rules', [
    '--rules',
    'contrast-computable',
    '--wcag-level',
    'AA'
  ]);
  const block = criteriaBlock(stdout);
  assert.match(block, /1\.4\.3 [^\n]*\(partly checked: 1 of 2 checks not selected\)/);
  assert.doesNotMatch(block, /1\.4\.6/);
});

test('CLI: --compact shows the criteria as counts, and --json carries no summary', () => {
  const compact = scanCriteriaPage('criteria-compact', ['--wcag', '2.2', '--compact']);
  assert.match(
    criteriaBlock(compact.stdout),
    /\n {2}fail: \d+ {3}cantTell: \d+( {3}pass: \d+)? {3}notApplicable: \d+\n/
  );

  const json = scanCriteriaPage('criteria-json', ['--wcag', '2.2', '--json']);
  assert.doesNotMatch(json.stdout, /criteria \(/);
  assert.ok(Array.isArray(JSON.parse(json.stdout).rulesResults));
});

test('CLI: --rules contrast-computable --wcag-level AA writes a JUnit suite for 1.4.3 and none for 1.4.6', () => {
  const junitPath = path.join(tmpDir, 'criteria-junit.xml');
  const { status } = scanCriteriaPage('criteria-junit', [
    '--rules',
    'contrast-computable',
    '--wcag-level',
    'aa',
    '--junit',
    junitPath
  ]);
  assert.equal(status, 0, 'the scan has questions, not failures');
  const xml = fs.readFileSync(junitPath, 'utf8');
  assert.match(xml, /<testsuite[^>]* name="WCAG 1\.4\.3"/);
  assert.doesNotMatch(xml, /name="WCAG 1\.4\.6"/);
});

test('CLI: --wcag-level AAAA exits 2 naming the flag', () => {
  const { status, stderr } = scanCriteriaPage('criteria-level-bad', [
    '--rules',
    'contrast-computable',
    '--wcag-level',
    'AAAA'
  ]);
  assert.equal(status, 2);
  assert.match(stderr, /Error: --wcag-level must be "A", "AA" or "AAA", not "AAAA"\./);
});

test('CLI: an empty heading fails a scan with no selection, and not a --wcag one', () => {
  const page = path.join(tmpDir, 'empty-heading.html');
  fs.writeFileSync(
    page,
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>Hi</h1><h2></h2></main></body></html>'
  );
  const unscoped = run(['scan', page, '--json']);
  const failed = JSON.parse(unscoped.stdout)
    .checksResults.filter((r) => r.outcome === 'fail')
    .map((r) => r.ruleId);
  assert.ok(failed.includes('empty-heading'), JSON.stringify(failed));
  assert.equal(unscoped.status, 1);

  const wcag = run(['scan', page, '--wcag', '2.2', '--json']);
  assert.ok(!JSON.parse(wcag.stdout).checksResults.some((r) => r.ruleId === 'empty-heading'));
});

// --- core 1.14: questions that likely fail, gating on them, and baselines ---------------

// heading-order (a best practice, minor) and invalid-field-error-message
// (3.3.1, serious) both lean fail here; neither fails.
const LEAN_PAGE = `<!doctype html><html lang="en"><head><title>Sign up</title></head><body><main>
<h1>Sign up</h1><h3>Your details</h3>
<label for="email">Email</label><input id="email" aria-invalid="true" aria-errormessage="email-error">
<p id="email-error" hidden>Enter an email address.</p>
</main></body></html>`;

const LEAN_RULES = ['--rules', 'heading-order,invalid-field-error-message'];

function leanPage(name, html = LEAN_PAGE) {
  const page = path.join(tmpDir, `${name}.html`);
  fs.writeFileSync(page, html);
  return page;
}

test('CLI: --help lists the 1.14 options', () => {
  const { stdout } = run(['--help']);
  for (const flag of [
    '--no-hooks',
    '--fail-on-lean',
    '--lean-fail-wcag-only',
    '--migrate-baseline'
  ]) {
    assert.ok(stdout.includes(flag), flag);
  }
});

test('CLI: the summary counts the questions by review group and lists the likely failures with their reason', () => {
  const page = leanPage('lean-summary');
  const { stdout, status } = run(['scan', page]);
  assert.equal(status, 0, 'questions do not fail the run');
  assert.match(
    stdout,
    /\n {2}needs review: likely fail: 2 {3}likely pass: 0 {3}needs a person: \d+\n/
  );
  assert.match(
    stdout,
    /LIKELY FAIL — confirm \(2 occurrence\(s\)\):\n {2}- invalid-field-error-message \(serious\): #email\n {4}[^\n]+\n {4}why: [^\n]+\n {2}- heading-order \(minor\): html > body > main > h3\n {4}[^\n]+\n {4}why: The heading skips a level/
  );
  assert.doesNotMatch(stdout, /--fail-on-lean:/);
});

test('CLI: a page with no question prints no review groups', () => {
  const page = leanPage(
    'lean-none',
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"></body></html>'
  );
  const { stdout } = run(['scan', page, '--rules', 'img-alt-present']);
  assert.doesNotMatch(stdout, /needs review:|LIKELY FAIL/);
});

test('CLI: --fail-on-lean exits 1 on a likely failure; --lean-fail-wcag-only counts only WCAG rules', () => {
  const page = leanPage('lean-gate');
  assert.equal(run(['scan', page, ...LEAN_RULES]).status, 0);
  const gated = run(['scan', page, ...LEAN_RULES, '--fail-on-lean']);
  assert.equal(gated.status, 1);
  assert.match(gated.stdout, /--fail-on-lean: 2 of them fail the run/);

  const wcagOnly = run(['scan', page, ...LEAN_RULES, '--fail-on-lean', '--lean-fail-wcag-only']);
  assert.equal(wcagOnly.status, 1);
  assert.match(wcagOnly.stdout, /--fail-on-lean: 1 of them fails the run/);
  const bestPracticeOnly = run([
    'scan',
    page,
    '--rules',
    'heading-order',
    '--fail-on-lean',
    '--lean-fail-wcag-only'
  ]);
  assert.equal(bestPracticeOnly.status, 0);
});

test('CLI: --fail-on-lean follows --fail-on-severity', () => {
  const page = leanPage('lean-severity');
  const args = ['scan', page, ...LEAN_RULES, '--fail-on-lean', '--fail-on-severity'];
  assert.equal(run([...args, 'serious']).status, 1);
  assert.equal(run([...args, 'critical']).status, 0);
  const minorOnly = run([
    'scan',
    page,
    '--rules',
    'heading-order',
    '--fail-on-lean',
    '--fail-on-severity',
    'moderate'
  ]);
  assert.equal(minorOnly.status, 0);
});

test('CLI: --fail-on-lean over several pages counts the pages with likely failures', () => {
  const lean = leanPage('lean-pages-1');
  const clean = leanPage(
    'lean-pages-2',
    '<!doctype html><html lang="en"><head><title>T</title></head><body><main><h1>T</h1></main></body></html>'
  );
  const r = run(['scan', lean, clean, ...LEAN_RULES, '--fail-on-lean']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /2 pages scanned: 1 with failures or likely failures\./);
});

test('CLI: --lean-fail-wcag-only without --fail-on-lean exits 2', () => {
  const { status, stderr } = run(['scan', leanPage('lean-wcag-alone'), '--lean-fail-wcag-only']);
  assert.equal(status, 2);
  assert.match(stderr, /Error: --lean-fail-wcag-only needs --fail-on-lean\./);
});

test('CLI: --fail-on-lean makes JUnit fail and SARIF raise the likely failures', () => {
  const page = leanPage('lean-reports');
  const junit = path.join(tmpDir, 'lean.junit.xml');
  const sarif = path.join(tmpDir, 'lean.sarif');
  const levels = () =>
    JSON.parse(fs.readFileSync(sarif, 'utf8'))
      .runs[0].results.map((r) => `${r.ruleId}:${r.level}`)
      .sort();

  run(['scan', page, ...LEAN_RULES, '--junit', junit, '--sarif', sarif]);
  assert.doesNotMatch(fs.readFileSync(junit, 'utf8'), /type="leanFail"/);
  assert.deepEqual(levels(), ['heading-order:warning', 'invalid-field-error-message:warning']);

  run(['scan', page, ...LEAN_RULES, '--fail-on-lean', '--junit', junit, '--sarif', sarif]);
  assert.equal((fs.readFileSync(junit, 'utf8').match(/type="leanFail"/g) || []).length, 2);
  assert.deepEqual(levels(), ['heading-order:error', 'invalid-field-error-message:error']);

  run([
    'scan',
    page,
    ...LEAN_RULES,
    '--fail-on-lean',
    '--lean-fail-wcag-only',
    '--junit',
    junit,
    '--sarif',
    sarif
  ]);
  assert.equal((fs.readFileSync(junit, 'utf8').match(/type="leanFail"/g) || []).length, 1);
  assert.deepEqual(levels(), ['heading-order:warning', 'invalid-field-error-message:error']);
});

test('CLI: --write-baseline --fail-on-lean records the likely failures, and --baseline accepts them', () => {
  const page = leanPage('lean-baseline');
  const baseline = path.join(tmpDir, 'lean-baseline.json');
  const plain = run(['scan', page, ...LEAN_RULES, '--write-baseline', baseline]);
  assert.equal(plain.status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(baseline, 'utf8')).entries, []);

  const written = run(
    ['scan', page, ...LEAN_RULES, '--fail-on-lean', '--write-baseline', baseline],
    {
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  assert.equal(written.status, 0);
  const entries = JSON.parse(fs.readFileSync(baseline, 'utf8')).entries;
  assert.deepEqual(entries.map((e) => [e.ruleId, e.lean]).sort(), [
    ['heading-order', 'fail'],
    ['invalid-field-error-message', 'fail']
  ]);

  const known = run(['scan', page, ...LEAN_RULES, '--fail-on-lean', '--baseline', baseline]);
  assert.equal(known.status, 0);
  assert.match(known.stdout, /baseline likely failures: 2 known, 0 new, 0 stale/);

  // A second skipped heading is new.
  const changed = leanPage('lean-baseline', LEAN_PAGE.replace('</main>', '<h5>More</h5></main>'));
  const fresh = run(['scan', changed, ...LEAN_RULES, '--fail-on-lean', '--baseline', baseline]);
  assert.equal(fresh.status, 1);
  assert.match(fresh.stdout, /baseline likely failures: 2 known, 1 new, 0 stale/);
  assert.match(
    fresh.stdout,
    /NEW likely failures \(not in baseline, 1 occurrence\(s\)\):\n {2}- heading-order: /
  );
  const json = JSON.parse(
    run(['scan', changed, ...LEAN_RULES, '--fail-on-lean', '--baseline', baseline, '--json']).stdout
  );
  assert.equal(json.baseline.leanFail.newCount, 1);
  assert.equal(json.baseline.leanFail.knownCount, 2);

  // Only heading-order's new finding is new, and --lean-fail-wcag-only leaves it out.
  const wcagOnly = run([
    'scan',
    changed,
    ...LEAN_RULES,
    '--fail-on-lean',
    '--lean-fail-wcag-only',
    '--baseline',
    baseline
  ]);
  assert.equal(wcagOnly.status, 0);
  assert.match(wcagOnly.stdout, /baseline likely failures: 2 known, 0 new/);

  // Without --fail-on-lean, the likely failures don't count and the entries are left out.
  const without = run(['scan', changed, ...LEAN_RULES, '--baseline', baseline]);
  assert.equal(without.status, 0);
  assert.doesNotMatch(without.stdout, /baseline likely failures/);
});

const OLD_BASELINE = {
  version: 1,
  generatedAt: '2026-10-01T00:00:00.000Z',
  entries: [
    {
      ruleId: 'img-alt-present',
      reasonCode: 'DEFAULT',
      selector: 'html > body > img',
      html: '<img src="x.png">'
    },
    {
      ruleId: 'area-alt-present',
      reasonCode: 'DEFAULT',
      selector: 'html > body > map > area',
      html: '<area href="/a" alt="" shape="rect" coords="0,0,10,10">'
    }
  ]
};

test('CLI: --migrate-baseline without a page makes the moves that need no scan', () => {
  const file = path.join(tmpDir, 'migrate-noscan.json');
  fs.writeFileSync(file, JSON.stringify(OLD_BASELINE));
  const r = run(['scan', '--migrate-baseline', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(r.status, 0);
  const migrated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(migrated.generatedAt, OLD_BASELINE.generatedAt);
  assert.deepEqual(
    migrated.entries.map((e) => e.reasonCode),
    ['TEXT_ALTERNATIVE_MISSING', 'DEFAULT'],
    "area-alt-present's code was split, so it needs the finding"
  );
});

test("CLI: --migrate-baseline against a scan takes each finding's code, and accepts nothing new", () => {
  const page = leanPage(
    'migrate-page',
    '<!doctype html><html lang="en"><head><title>T</title></head><body><img src="x.png"><img src="m.png" alt="Map" usemap="#m"><map name="m"><area href="/a" alt="" shape="rect" coords="0,0,10,10"></map><img src="z.png"></body></html>'
  );
  const file = path.join(tmpDir, 'migrate-scan.json');
  fs.writeFileSync(file, JSON.stringify(OLD_BASELINE));
  const rules = ['--rules', 'img-alt-present,area-alt-present'];
  const r = run(['scan', page, ...rules, '--migrate-baseline', file]);
  assert.equal(r.status, 0, 'never fails the build');
  assert.match(r.stdout, /img-alt-present/);
  const migrated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(
    migrated.entries.map((e) => e.reasonCode),
    ['TEXT_ALTERNATIVE_MISSING', 'TEXT_ALTERNATIVE_EMPTY']
  );
  // The second image without alt is still new against it.
  const check = JSON.parse(run(['scan', page, ...rules, '--baseline', file, '--json']).stdout);
  assert.equal(check.baseline.knownCount, 2);
  assert.equal(check.baseline.newCount, 1);
});

test('CLI: --migrate-baseline with --baseline or --write-baseline, or a missing file, exits 2', () => {
  const page = leanPage('migrate-usage');
  const file = path.join(tmpDir, 'migrate-usage.json');
  fs.writeFileSync(file, JSON.stringify(OLD_BASELINE));
  const both = run(['scan', page, '--migrate-baseline', file, '--baseline', file]);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /--baseline and --migrate-baseline cannot be used together/);
  const write = run(['scan', page, '--migrate-baseline', file, '--write-baseline', file]);
  assert.equal(write.status, 2);
  assert.match(write.stderr, /--write-baseline and --migrate-baseline cannot be used together/);
  const missing = run(['scan', '--migrate-baseline', path.join(tmpDir, 'nope.json')]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Could not read baseline file/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), OLD_BASELINE);
});

test('CLI: --no-hooks without --browser exits 2: a static scan runs no page script', () => {
  const { status, stderr } = run(['scan', leanPage('no-hooks-static'), '--no-hooks']);
  assert.equal(status, 2);
  assert.match(stderr, /--no-hooks needs --browser/);
});

test('CLI: --migrate-baseline over several pages migrates each entry against its own page', () => {
  const dir = path.join(tmpDir, 'migrate-pages');
  fs.mkdirSync(dir);
  const area = '<area href="/a" alt="" shape="rect" coords="0,0,10,10">';
  fs.writeFileSync(
    path.join(dir, 'a.html'),
    `<!doctype html><html lang="en"><head><title>A</title></head><body><img src="m.png" alt="Map" usemap="#m"><map name="m">${area}</map></body></html>`
  );
  fs.writeFileSync(
    path.join(dir, 'b.html'),
    '<!doctype html><html lang="en"><head><title>B</title></head><body><img src="b.png" alt="B"></body></html>'
  );
  const entry = { ruleId: 'area-alt-present', reasonCode: 'DEFAULT', selector: 'area', html: area };
  const file = path.join(dir, 'baseline.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      entries: [
        { ...entry, page: 'a.html' },
        { ...entry, page: 'b.html' }
      ]
    })
  );
  const r = run(
    ['scan', 'a.html', 'b.html', '--rules', 'area-alt-present', '--migrate-baseline', file],
    {
      cwd: dir
    }
  );
  assert.equal(r.status, 0);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(file, 'utf8')).entries.map((e) => [e.page, e.reasonCode]),
    [
      ['a.html', 'TEXT_ALTERNATIVE_EMPTY'],
      ['b.html', 'DEFAULT']
    ]
  );
});
