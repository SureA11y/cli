'use strict';

// --browser: the page opened in headless Chromium through Playwright, with
// core's own browser bundle as the engine. Skipped where Playwright or its
// Chromium is not installed; CHROMIUM_EXECUTABLE_PATH points at another
// Chromium build.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'surea11y.js');

let skip = false;
try {
  const { chromium } = require('playwright');
  const exe = process.env.CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
  if (!exe || !fs.existsSync(exe)) skip = 'no Chromium build (set CHROMIUM_EXECUTABLE_PATH)';
} catch {
  skip = 'playwright not installed';
}

function run(args, cwd) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], { cwd, encoding: 'utf8' }, (err, stdout, stderr) =>
      resolve({ stdout, stderr, status: err ? err.code : 0 })
    );
  });
}

let dir;
test.before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-browser-'));
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

// The image is added by the page's script: jsdom never sees it.
const CLIENT_RENDERED = `<!doctype html><html lang="en"><head><title>App</title></head>
<body><main id="root"></main>
<script>document.getElementById('root').innerHTML = '<h1>App</h1><img src="logo.png">';</script>
</body></html>`;

test(
  '--browser scans the page as its scripts render it, with the same core',
  { skip },
  async () => {
    fs.writeFileSync(path.join(dir, 'app.html'), CLIENT_RENDERED);
    const rules = ['--rules', 'img-alt-present', '--json'];
    const staticScan = JSON.parse((await run(['scan', 'app.html', ...rules], dir)).stdout);
    const browser = await run(['scan', 'app.html', '--browser', ...rules], dir);
    assert.equal(browser.status, 1, browser.stderr);
    const browserScan = JSON.parse(browser.stdout);
    assert.equal(staticScan.checksResults[0].outcome, 'notApplicable');
    assert.equal(browserScan.checksResults[0].outcome, 'fail');
    assert.equal(browserScan.engine.version, staticScan.engine.version);
    assert.equal(browserScan.engine.version, require('@surea11y/core/package.json').version);
  }
);

test(
  '--browser takes the scan options: --context, --wcag, --fail-on-severity',
  { skip },
  async () => {
    fs.writeFileSync(
      path.join(dir, 'parts.html'),
      '<!doctype html><html lang="en"><head><title>Parts</title></head><body><main><h1>P</h1><div id="a"><img src="a.png"></div><div id="b"><img src="b.png" alt="B"></div></main></body></html>'
    );
    const scoped = JSON.parse(
      (
        await run(
          ['scan', 'parts.html', '--browser', '--context', '#b', '--wcag', '2.2', '--json'],
          dir
        )
      ).stdout
    );
    assert.equal(scoped.checksResults.find((r) => r.ruleId === 'img-alt-present').outcome, 'pass');
    assert.equal(scoped.engine.wcagVersion, '2.2');
    const gated = await run(
      [
        'scan',
        'parts.html',
        '--browser',
        '--rules',
        'img-alt-present',
        '--fail-on-severity',
        'critical'
      ],
      dir
    );
    assert.equal(gated.status, 0, gated.stderr);
    assert.match(gated.stdout, /below --fail-on-severity critical/);
  }
);

test('--browser runs packs and custom rules in the page', { skip }, async () => {
  fs.writeFileSync(path.join(dir, 'p.html'), CLIENT_RENDERED);
  fs.writeFileSync(
    path.join(dir, 'pack.js'),
    `module.exports = {
      name: '@acme/a11y-rules', version: '1.0.0', namespace: 'acme', core: '*', title: 'Acme',
      rules: [{
        id: 'acme-no-images',
        meta: { title: 'No images', tags: ['house-rules'] },
        runInPage(ctx) {
          const imgs = ctx.helpers.queryAll('img');
          return imgs.length
            ? { outcome: 'fail', occurrences: imgs.map((el) => ({ selector: ctx.helpers.buildSelector(el), summary: 'An image.' })) }
            : { outcome: 'pass' };
        }
      }]
    };`
  );
  fs.writeFileSync(
    path.join(dir, 'rules.js'),
    `module.exports = [{
      id: 'org-has-root',
      meta: { title: 'Has a #root' },
      runInPage(ctx) {
        return { ruleId: ctx.rule.ruleId, outcome: ctx.document.getElementById('root') ? 'pass' : 'fail', occurrences: [] };
      }
    }];`
  );
  const r = await run(
    ['scan', 'p.html', '--browser', '--pack', './pack.js', '--custom-rules', 'rules.js', '--json'],
    dir
  );
  const result = JSON.parse(r.stdout);
  assert.deepEqual(result.engine.packs, ['@acme/a11y-rules@1.0.0']);
  assert.equal(result.checksResults.find((c) => c.ruleId === 'acme-no-images').outcome, 'fail');
  assert.equal(result.checksResults.find((c) => c.ruleId === 'org-has-root').outcome, 'pass');
});

test(
  '--browser scans a page whose Content Security Policy forbids inline scripts',
  { skip },
  async (t) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/missing') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        return res.end('<p>gone</p>');
      }
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Security-Policy': "script-src 'self'"
      });
      res.end(
        '<!doctype html><html lang="en"><head><title>Strict</title></head><body><main><h1>S</h1><img src="x.png"></main></body></html>'
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const ok = await run(['scan', `${base}/`, '--browser', '--rules', 'img-alt-present'], dir);
    assert.equal(ok.status, 1, ok.stderr);
    assert.match(ok.stdout, /img-alt-present {2}\(serious/);
    const missing = await run(['scan', `${base}/missing`, '--browser'], dir);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /HTTP 404/);
  }
);

test('--browser scans several pages in one browser', { skip }, async () => {
  fs.writeFileSync(path.join(dir, 'b1.html'), CLIENT_RENDERED);
  fs.writeFileSync(
    path.join(dir, 'b2.html'),
    '<!doctype html><html lang="en"><head><title>B2</title></head><body><main><h1>B2</h1></main></body></html>'
  );
  const r = await run(
    ['scan', 'b1.html', 'b2.html', '--browser', '--rules', 'img-alt-present'],
    dir
  );
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /2 pages scanned: 1 with failures\./);
});

// A copy of the CLI whose node_modules has everything but Playwright.
test('--browser without Playwright says what to install', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-nopw-'));
  try {
    fs.mkdirSync(path.join(project, 'bin'));
    fs.copyFileSync(CLI, path.join(project, 'bin', 'surea11y.js'));
    fs.copyFileSync(path.join(__dirname, '..', 'package.json'), path.join(project, 'package.json'));
    const modules = path.join(__dirname, '..', 'node_modules');
    fs.mkdirSync(path.join(project, 'node_modules'));
    for (const name of fs.readdirSync(modules)) {
      if (name === 'playwright' || name === 'playwright-core' || name === '.bin') continue;
      fs.symlinkSync(path.join(modules, name), path.join(project, 'node_modules', name));
    }
    fs.writeFileSync(path.join(project, 'a.html'), CLIENT_RENDERED);
    const r = await new Promise((resolve) =>
      execFile(
        'node',
        [path.join(project, 'bin', 'surea11y.js'), 'scan', 'a.html', '--browser'],
        // NODE_PATH cleared: a Playwright installed globally would be found.
        { cwd: project, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } },
        (err, stdout, stderr) => resolve({ stderr, status: err ? err.code : 0 })
      )
    );
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--browser needs Playwright, which is not installed/);
    assert.match(r.stderr, /npm install playwright/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
