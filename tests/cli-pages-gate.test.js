'use strict';

// --fail-on-severity, several pages (arguments and --urls), the outputs for
// several pages (one summary each, a JSON array, numbered HTML reports, one
// SARIF run, one JUnit file, a baseline that names each page), and the
// summary's severity order.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'surea11y.js');

let dir;
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-pages-'));
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function run(args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: dir });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
      status: err.status
    };
  }
}

function page(name, body) {
  fs.writeFileSync(
    path.join(dir, name),
    `<!doctype html><html lang="en"><head><title>${name} page</title></head><body><main><h1>${name}</h1>${body}</main></body></html>`
  );
  return name;
}

// One failure of each severity the catalog uses.
const SERIOUS = '<img src="x.png">'; // img-alt-present
const MODERATE = '<div aria-expanded="true">x</div>'; // aria-allowed-attr
const MINOR = '<h2></h2>'; // empty-heading
const ONLY = ['--rules', 'img-alt-present,aria-allowed-attr,empty-heading,aria-hidden-body'];

test('--fail-on-severity: a failure below the level is reported but does not fail the run', () => {
  page('mod.html', MODERATE + MINOR);
  const below = run(['scan', 'mod.html', ...ONLY, '--fail-on-severity', 'serious']);
  assert.equal(below.status, 0);
  assert.match(below.stdout, /aria-allowed-attr {2}\(moderate, .*below --fail-on-severity serious/);
  assert.match(below.stdout, /empty-heading {2}\(minor, .*below --fail-on-severity serious/);
  const at = run(['scan', 'mod.html', ...ONLY, '--fail-on-severity', 'moderate']);
  assert.equal(at.status, 1);
  assert.doesNotMatch(at.stdout, /aria-allowed-attr {2}\(moderate[^)]*below/);
  assert.equal(run(['scan', 'mod.html', ...ONLY]).status, 1, 'without the flag any failure fails');
});

test('--fail-on-severity: a value that is not a severity is a usage error', () => {
  page('a.html', SERIOUS);
  const r = run(['scan', 'a.html', '--fail-on-severity', 'high']);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /--fail-on-severity must be "critical", "serious", "moderate" or "minor", not "high"/
  );
  assert.equal(run(['scan', 'a.html', ...ONLY, '--fail-on-severity', 'SERIOUS']).status, 1);
});

test('the summary lists failing rules most severe first', () => {
  // aria-allowed-attr (moderate) before img-alt-present (serious) in the
  // catalog, empty-heading (minor) between them alphabetically.
  page('all.html', MINOR + MODERATE + SERIOUS);
  const { stdout } = run(['scan', 'all.html', ...ONLY]);
  const order = ['img-alt-present', 'aria-allowed-attr', 'empty-heading'].map((id) =>
    stdout.indexOf(`  ${id}  (`)
  );
  assert.ok(
    order.every((i) => i > 0),
    stdout
  );
  assert.deepEqual(
    order,
    order.slice().sort((a, b) => a - b)
  );
  // A critical failure comes first of all.
  fs.writeFileSync(
    path.join(dir, 'crit.html'),
    `<!doctype html><html lang="en"><head><title>C</title></head><body aria-hidden="true"><main><h1>C</h1>${MODERATE}</main></body></html>`
  );
  const crit = run(['scan', 'crit.html', ...ONLY]).stdout;
  assert.ok(crit.indexOf('  aria-hidden-body  (') < crit.indexOf('  aria-allowed-attr  ('), crit);
});

test('several pages: each is scanned, the run fails when any page does', () => {
  page('clean.html', '<p>Fine.</p>');
  page('broken.html', SERIOUS);
  const r = run(['scan', 'clean.html', 'broken.html', ...ONLY]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /surea11y scan: file:\/\/.*clean\.html/);
  assert.match(r.stdout, /surea11y scan: file:\/\/.*broken\.html/);
  assert.match(r.stdout, /2 pages scanned: 1 with failures\./);
  assert.equal(run(['scan', 'clean.html', 'clean.html', ...ONLY]).status, 0);
});

test('--urls adds the pages a file lists, skipping blank lines and comments', () => {
  page('one.html', '<p>1</p>');
  page('two.html', SERIOUS);
  fs.writeFileSync(
    path.join(dir, 'pages.txt'),
    '# the site\none.html\n\n  two.html  # with a problem\n'
  );
  const r = run(['scan', '--urls', 'pages.txt', ...ONLY]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /one\.html/);
  assert.match(r.stdout, /two\.html/);
  assert.match(r.stdout, /2 pages scanned: 1 with failures\./);
});

test('--urls: a missing or empty list is a usage error', () => {
  const missing = run(['scan', '--urls', 'nope.txt']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Could not read --urls file "nope.txt"/);
  fs.writeFileSync(path.join(dir, 'empty.txt'), '# nothing yet\n');
  const empty = run(['scan', '--urls', 'empty.txt']);
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /--urls "empty.txt" lists none/);
});

test('several pages: one page that cannot be scanned stops the run, naming it, and writes nothing', () => {
  page('ok.html', '<p>ok</p>');
  const r = run(['scan', 'ok.html', 'gone.html', '--html', 'r.html', ...ONLY]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Error: gone\.html: No such file/);
  assert.equal(fs.existsSync(path.join(dir, 'r.html')), false);
});

test('several pages: --json prints an array, one result per page', () => {
  page('j1.html', '<p>1</p>');
  page('j2.html', SERIOUS);
  const r = run(['scan', 'j1.html', 'j2.html', '--json', ...ONLY]);
  const results = JSON.parse(r.stdout);
  assert.ok(Array.isArray(results));
  assert.deepEqual(
    results.map((x) => path.basename(x.url)),
    ['j1.html', 'j2.html']
  );
  assert.ok(!Array.isArray(JSON.parse(run(['scan', 'j1.html', '--json', ...ONLY]).stdout)));
});

test('several pages: --html writes one report per page', () => {
  page('h1.html', SERIOUS);
  page('h2.html', MODERATE);
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  run(['scan', 'h1.html', 'h2.html', '--html', 'out/report.html', ...ONLY]);
  const first = fs.readFileSync(path.join(dir, 'out', 'report.html'), 'utf8');
  const second = fs.readFileSync(path.join(dir, 'out', 'report-2.html'), 'utf8');
  assert.match(first, /surea11y scan report — h1\.html/);
  assert.match(second, /surea11y scan report — h2\.html/);
});

test('several pages: --sarif writes one run holding every page', () => {
  page('s1.html', SERIOUS);
  page('s2.html', SERIOUS + MODERATE);
  run(['scan', 's1.html', 's2.html', '--sarif', 'a.sarif', ...ONLY]);
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'a.sarif'), 'utf8'));
  assert.equal(log.runs.length, 1);
  const uris = log.runs[0].results.map((r) =>
    path.basename(r.locations[0].physicalLocation.artifactLocation.uri)
  );
  assert.deepEqual([...new Set(uris)].sort(), ['s1.html', 's2.html']);
  const rules = log.runs[0].tool.driver.rules.map((r) => r.id);
  assert.equal(rules.length, new Set(rules).size, 'each rule listed once');
  assert.ok(rules.includes('aria-allowed-attr'), 'a rule only the second page failed is listed');
});

test('several pages: --junit writes one file, suites named after their page', () => {
  page('u1.html', SERIOUS);
  page('u2.html', '<img src="x.png" alt="Logo">');
  run(['scan', 'u1.html', 'u2.html', '--junit', 'a.xml', ...ONLY]);
  const xml = fs.readFileSync(path.join(dir, 'a.xml'), 'utf8');
  assert.equal((xml.match(/<testsuites\b/g) || []).length, 1);
  assert.match(xml, /<testsuite name="u1\.html — WCAG 1\.1\.1"/);
  assert.match(xml, /<testsuite name="u2\.html — WCAG 1\.1\.1"/);
  assert.match(xml, /<testcase classname="u1\.html\/wcag-1\.1\.1" name="img-alt-present"/);
  const suites = [...xml.matchAll(/<testsuite name="[^"]*" tests="(\d+)" failures="(\d+)"/g)];
  const root = /<testsuites name="surea11y" tests="(\d+)" failures="(\d+)"/.exec(xml);
  assert.equal(
    Number(root[1]),
    suites.reduce((n, m) => n + Number(m[1]), 0)
  );
  assert.equal(
    Number(root[2]),
    suites.reduce((n, m) => n + Number(m[2]), 0)
  );
  assert.equal(Number(root[2]), 1);
});

test('several pages: the baseline names each page, so one page cannot hide another', () => {
  page('b1.html', SERIOUS);
  page('b2.html', '<p>clean for now</p>');
  run(['scan', 'b1.html', 'b2.html', '--write-baseline', 'base.json', ...ONLY]);
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'base.json'), 'utf8'));
  assert.deepEqual(
    base.entries.map((e) => [e.page, e.ruleId]),
    [['b1.html', 'img-alt-present']]
  );
  // b2 now has the same failure, at the same selector: new on b2, known on b1.
  page('b2.html', SERIOUS);
  const r = run(['scan', 'b1.html', 'b2.html', '--baseline', 'base.json', ...ONLY]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /2 pages scanned: 1 with new failures\./);
});

test('a baseline written for one page still applies to that page', () => {
  page('solo.html', SERIOUS);
  run(['scan', 'solo.html', '--write-baseline', 'solo.json', ...ONLY]);
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'solo.json'), 'utf8'));
  assert.equal(base.entries[0].page, undefined, 'a single page writes no page, as before');
  assert.equal(run(['scan', 'solo.html', '--baseline', 'solo.json', ...ONLY]).status, 0);
});

test('--baseline with --fail-on-severity: only new failures at the level fail the run', () => {
  page('g.html', '<p>x</p>');
  run(['scan', 'g.html', '--write-baseline', 'g.json', ...ONLY]);
  page('g.html', MINOR);
  assert.equal(run(['scan', 'g.html', '--baseline', 'g.json', ...ONLY]).status, 1);
  assert.equal(
    run(['scan', 'g.html', '--baseline', 'g.json', ...ONLY, '--fail-on-severity', 'serious'])
      .status,
    0
  );
});

test('the browser-only options need --browser, and valid values', () => {
  page('opts.html', '<p>x</p>');
  const without = run(['scan', 'opts.html', '--width', '320', '--color-scheme', 'dark']);
  assert.equal(without.status, 2);
  assert.match(without.stderr, /--width, --color-scheme need --browser/);
  assert.match(run(['scan', 'opts.html', '--wait-for', '#x']).stderr, /--wait-for needs --browser/);
  const cases = [
    [
      ['--width', '0'],
      /--width must be a whole number above 0, or several separated by commas, not "0"/
    ],
    [['--width', 'wide'], /--width must be a whole number above 0, .* not "wide"/],
    [['--width', '1280,'], /--width must be a whole number above 0, .* not "1280,"/],
    [['--width', '1280,0'], /--width must be a whole number above 0, .* not "1280,0"/],
    [
      ['--color-scheme', 'sepia'],
      /--color-scheme must be "light", "dark" or "light,dark", not "sepia"/
    ],
    [['--color-scheme', 'light,sepia'], /--color-scheme must be .* not "light,sepia"/],
    [['--wait-timeout', '500'], /--wait-timeout needs --wait-for/],
    [['--wait-for', '#x', '--wait-timeout', '0'], /--wait-timeout must be a whole number above 0/],
    [['--wait-for', '  '], /--wait-for needs a selector/]
  ];
  for (const [flags, message] of cases) {
    const r = run(['scan', 'opts.html', '--browser', ...flags]);
    assert.equal(r.status, 2, flags.join(' '));
    assert.match(r.stderr, message);
  }
});
