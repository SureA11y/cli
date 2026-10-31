'use strict';

// `surea11y procedures` and `scan --manual-checks` (docs/CLI.md "Procedures"):
// how a person assesses each requirement by hand, from core, as a reference
// or a worksheet. With a core that has no procedures (before 1.15), both say
// which core they need and exit 2, and the rest of these tests skip.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const core = require('@surea11y/core');

const CLI = path.join(__dirname, '..', 'bin', 'surea11y.js');
const reads = typeof core.renderProcedures === 'function';
const skip = reads ? false : 'this core has no procedures (core 1.15 does)';

// Its output and its status, whatever it exits with.
function run(args) {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

let tmp;
test.before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-procedures-'));
  fs.writeFileSync(
    path.join(tmp, 'page.html'),
    '<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Shop</h1><img src="a.png"></main></body></html>'
  );
  fs.writeFileSync(
    path.join(tmp, 'other.html'),
    '<!doctype html><html lang="en"><head><title>About</title></head><body><main><h1>About</h1></main></body></html>'
  );
  // A pack whose standard restates two criteria and has one of its own, with
  // a profile; and one that gives no procedures.
  const standard = (procedures) => `
const { definePack } = require(${JSON.stringify(require.resolve('@surea11y/core/pack'))});
module.exports = definePack({
  name: 'city-pack', version: '1.0.0', namespace: 'city', core: '*',
  standard: {
    key: 'city', standard: 'City Standard', versions: ['1.0'], ruleTag: 'city',
    mappingsFor: () => [],
    profiles: { 'city-1.0': { version: '1.0', tags: ['wcag2a'] } },
    ${procedures}
  }
});`;
  fs.writeFileSync(
    path.join(tmp, 'city.js'),
    standard(`procedures: { '1.0': {
      '1': { title: 'Images', wcag: '1.1.1' },
      '2': { title: 'Contrast', wcag: '1.4.3' },
      '3': { title: 'Forms', facets: [{ id: 'text-version', label: 'Each form has a text version',
        steps: ['Find each form.'], passWhen: 'Each has one.', failWhen: 'One has none, which fails {{requirement}}.' }] }
    } },`)
  );
  fs.writeFileSync(path.join(tmp, 'bare.js'), standard(''));
});
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const file = (name) => path.join(tmp, name);
const page = (name) => new JSDOM(fs.readFileSync(file(name), 'utf8')).window.document;

test('with a core that has no procedures, both say which core they need', { skip: reads }, () => {
  const p = run(['procedures']);
  assert.equal(p.status, 2);
  assert.match(p.stderr, /procedures needs @surea11y\/core 1\.15\.0 or later; this one is /);
  const s = run(['scan', file('page.html'), '--manual-checks', file('m.html')]);
  assert.equal(s.status, 2);
  assert.match(s.stderr, /--manual-checks needs @surea11y\/core 1\.15\.0/);
  assert.ok(!fs.existsSync(file('m.html')));
});

test('procedures: WCAG as a reference, to stdout or a file', { skip }, () => {
  const out = run(['procedures', '--wcag', '2.2', '--wcag-level', 'AA']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^<!doctype html>/);
  const d = new JSDOM(out.stdout).window.document;
  assert.equal(d.title, 'WCAG 2.2: how to assess each requirement');
  const list = core.listProcedures({ version: '2.2', levels: ['A', 'AA'] });
  assert.equal(d.querySelectorAll('article.req').length, list.requirements.length);
  assert.equal(out.stdout, core.renderProcedures(list, {}));

  const md = run(['procedures', '--wcag-level', 'A', '-o', file('wcag.md')]);
  assert.equal(md.status, 0);
  assert.match(md.stderr, /Wrote procedures to: .*wcag\.md/);
  assert.match(
    fs.readFileSync(file('wcag.md'), 'utf8'),
    /^# WCAG 2\.2: how to assess each requirement\n/
  );
  const forced = run(['procedures', '--format', 'markdown']);
  assert.match(forced.stdout, /^# WCAG 2\.2/);
});

test('procedures --checklist: a worksheet, filtered, in a locale', { skip }, () => {
  const r = run([
    'procedures',
    '--checklist',
    '--wcag-level',
    'AA',
    '--automation',
    'manual,partial',
    '--locale',
    'fr',
    '--title',
    'Audit de example.com',
    '-o',
    file('audit.html')
  ]);
  assert.equal(r.status, 0, r.stderr);
  const d = page('audit.html');
  assert.equal(d.documentElement.lang, 'fr');
  assert.equal(d.title, 'Audit de example.com');
  const checklist = core.procedureChecklist({
    levels: ['A', 'AA'],
    automation: ['manual', 'partial'],
    locale: 'fr'
  });
  assert.equal(d.querySelectorAll('article.item').length, checklist.items.length);
  assert.ok(d.querySelector('fieldset.record'));
  // Without results to record.
  run(['procedures', '--checklist', '--no-record', '-o', file('plain.html')]);
  assert.equal(page('plain.html').querySelector('fieldset.record'), null);
  // Filters by tool and rule.
  run([
    'procedures',
    '--tools',
    'screen-reader',
    '--rules',
    'img-alt-present',
    '-o',
    file('f.html')
  ]);
  assert.match(page('f.html').querySelector('header').textContent, /A screen reader/);
});

test('procedures <requirement>: one requirement, with finding steps', { skip }, () => {
  const r = run(['procedures', '1.4.12', '--locale', 'es', '--variants']);
  assert.equal(r.status, 0, r.stderr);
  const d = new JSDOM(r.stdout).window.document;
  assert.equal(d.title, 'Cómo evaluar WCAG 1.4.12 Text Spacing');
  assert.ok(d.querySelector('details.variants'));
  const json = JSON.parse(run(['procedures', '1.4.3', '--json']).stdout);
  assert.deepEqual(json, core.proceduresFor('1.4.3'));
});

test('procedures: a pack’s standard, by key or by its profile', { skip }, () => {
  const byKey = run(['procedures', '--pack', file('city.js'), '--standard', 'city', '--checklist']);
  assert.equal(byKey.status, 0, byKey.stderr);
  const d = new JSDOM(byKey.stdout).window.document;
  assert.equal(d.title, 'City Standard 1.0: manual checklist');
  assert.match(d.body.textContent, /One has none, which fails City Standard 3\./);
  const byProfile = run([
    'procedures',
    '--pack',
    file('city.js'),
    '--profile',
    'city-1.0',
    '--checklist'
  ]);
  assert.equal(byProfile.stdout, byKey.stdout);
  const json = JSON.parse(
    run(['procedures', '--pack', file('city.js'), '--standard', 'City Standard', '--json']).stdout
  );
  assert.deepEqual(
    json.requirements.map((r) => r.id),
    ['1', '2', '3']
  );
  const one = run(['procedures', '3', '--pack', file('city.js'), '--standard', 'city', '--json']);
  assert.equal(JSON.parse(one.stdout).title, 'Forms');
});

test('procedures: what it can’t give is a usage error', { skip }, () => {
  const cases = [
    [
      ['procedures', '--standard', 'nope'],
      /core has no procedures for standard "nope" \(a pack's standard needs its pack/
    ],
    [['procedures', '--wcag', '3.0'], /core has no procedures for standard "wcag" version "3\.0"/],
    [['procedures', '9.9.9'], /core has no procedures for requirement "9\.9\.9"/],
    [
      ['procedures', '--pack', file('bare.js'), '--profile', 'city-1.0'],
      /"city-pack" gives no procedures/
    ],
    [
      ['procedures', '--profile', 'city-1.0'],
      /--profile "city-1\.0" is no profile of a pack given with --pack/
    ],
    [['procedures', '--wcag-level', 'AAAA'], /--wcag-level must be "A", "AA" or "AAA"/],
    [
      ['procedures', '--automation', 'some'],
      /--automation takes full, partial, manual, not "some"/
    ],
    [['procedures', '--tools', 'telescope'], /--tools takes keyboard, .*, not "telescope"/],
    [['procedures', '--format', 'pdf'], /--format must be "html" or "markdown"/],
    [
      ['procedures', '--standard', 'city', '--wcag', '2.2'],
      /--standard can not be given with --wcag/
    ],
    [['procedures', '--standard-version', 'V1'], /--standard-version goes with --standard/],
    [['procedures', '1.4.3', '--checklist'], /a single requirement takes no --checklist/],
    [['procedures', '1.4.3', '2.4.7'], /at most one requirement/],
    [['procedures', '--browser'], /--browser is an option of scan, not of procedures/],
    [['procedures', '--html', 'x.html'], /--html is an option of scan, not of procedures/],
    [
      ['scan', file('page.html'), '--checklist'],
      /--checklist is an option of procedures, not of scan/
    ],
    [
      ['scan', file('page.html'), '-o', 'x.html'],
      /--output is an option of procedures, not of scan/
    ]
  ];
  for (const [args, message] of cases) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, message, args.join(' '));
  }
});

test(
  'scan --manual-checks: the worksheet of what the scan leaves to a person, per page',
  { skip },
  () => {
    const r = run([
      'scan',
      file('page.html'),
      file('other.html'),
      '--wcag',
      '2.1',
      '--wcag-level',
      'A',
      '--manual-checks',
      file('manual.html')
    ]);
    // The page fails (an image with no alt): the scan's own exit code.
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Wrote manual checks to: .*manual\.html/);
    assert.match(r.stderr, /Wrote manual checks to: .*manual-2\.html/);
    const d = page('manual.html');
    assert.equal(d.title, `WCAG 2.1: manual checklist — ${file('page.html')}`);
    assert.equal(page('manual-2.html').title, `WCAG 2.1: manual checklist — ${file('other.html')}`);
    // What no rule decides in full, at the levels scanned.
    const left = core.procedureChecklist({
      version: '2.1',
      levels: ['A'],
      automation: ['manual', 'partial']
    });
    assert.equal(d.querySelectorAll('article.item').length, left.items.length);
    assert.match(d.querySelector('header').textContent, /Levels: A/);
    assert.ok(d.querySelector('fieldset.record'));
  }
);

test(
  'scan --manual-checks follows the profile: a pack’s standard, or its WCAG target',
  { skip },
  () => {
    const city = run([
      'scan',
      file('page.html'),
      '--pack',
      file('city.js'),
      '--profile',
      'city-1.0',
      '--manual-checks',
      file('city.md'),
      '--locale',
      'de'
    ]);
    assert.ok([0, 1].includes(city.status), city.stderr);
    assert.match(
      fs.readFileSync(file('city.md'), 'utf8'),
      /^# City Standard 1\.0: manuelle Checkliste — /
    );

    // A pack with no procedures: WCAG, with a note.
    const bare = run([
      'scan',
      file('page.html'),
      '--pack',
      file('bare.js'),
      '--profile',
      'city-1.0',
      '--manual-checks',
      file('bare.html')
    ]);
    assert.ok([0, 1].includes(bare.status), bare.stderr);
    assert.match(
      bare.stderr,
      /Note: --manual-checks lists WCAG 2\.2's: the pack "city-pack" gives no procedures\./
    );
    assert.match(page('bare.html').title, /^WCAG 2\.2: manual checklist — /);

    // A WCAG profile: its version and level.
    const wcag = run([
      'scan',
      file('page.html'),
      '--profile',
      'wcag22-aa',
      '--manual-checks',
      file('p.html')
    ]);
    assert.ok([0, 1].includes(wcag.status), wcag.stderr);
    assert.match(page('p.html').querySelector('header').textContent, /Levels: A, AA/);
  }
);

test('--help names the procedures command and --manual-checks', () => {
  const { stdout } = run(['--help']);
  assert.match(stdout, /surea11y procedures \[requirement\] \[options\]/);
  assert.match(stdout, /--manual-checks <path>/);
  assert.match(stdout, /Procedures options/);
});
