'use strict';

// --sitemap and --max-pages: the pages a sitemap lists, local or served, a
// sitemap index followed, gzip read, the list cut at --max-pages with a note,
// and the usage errors. Also the closing line that a run with no failure is
// not a conformance claim.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const CLI = path.join(__dirname, '..', 'bin', 'surea11y.js');

let dir;
let server;
let origin;
const served = new Map();

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-sitemap-'));
  server = http.createServer((req, res) => {
    const body = served.get(req.url);
    if (body === undefined) {
      res.writeHead(404).end();
      return;
    }
    const type = req.url.endsWith('.gz')
      ? 'application/gzip'
      : req.url.endsWith('.xml')
        ? 'application/xml'
        : 'text/html';
    res.writeHead(200, { 'content-type': type }).end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function run(args) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' }, (err, stdout, stderr) =>
      resolve({ stdout, stderr, status: err ? err.code : 0 })
    );
  });
}

const html = (title, body = '') =>
  `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;

const urlset = (locs) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs
    .map((l) => `<url><loc>${l}</loc></url>`)
    .join('')}</urlset>`;

const RULES = ['--rules', 'img-alt-present'];

test('--sitemap scans the pages a local sitemap lists, relative to it, each once', async () => {
  fs.mkdirSync(path.join(dir, 'site'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'site', 'a.html'), html('A'));
  fs.writeFileSync(path.join(dir, 'site', 'b.html'), html('B', '<img src="x.png">'));
  fs.writeFileSync(path.join(dir, 'site', 'sitemap.xml'), urlset(['a.html', 'b.html', 'a.html']));
  const r = await run(['scan', '--sitemap', 'site/sitemap.xml', ...RULES, '--json']);
  assert.equal(r.status, 1, r.stderr);
  const results = JSON.parse(r.stdout);
  assert.deepEqual(
    results.map((p) => [path.basename(new URL(p.url).pathname), p.checksResults[0].outcome]),
    [
      ['a.html', 'notApplicable'],
      ['b.html', 'fail']
    ]
  );
});

test('--sitemap follows a sitemap index, reads gzip, and --max-pages cuts the list with a note', async () => {
  for (const n of [1, 2, 3, 4, 5]) served.set(`/p${n}.html`, html(`P${n}`));
  served.set('/pages-1.xml', urlset([`${origin}/p1.html`, '/p2.html']));
  served.set('/pages-2.xml.gz', zlib.gzipSync(urlset(['p3.html', 'p4.html', 'p5.html'])));
  served.set(
    '/sitemap.xml',
    `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>/pages-1.xml</loc></sitemap><sitemap><loc>${origin}/pages-2.xml.gz</loc></sitemap></sitemapindex>`
  );
  const all = await run(['scan', '--sitemap', `${origin}/sitemap.xml`, ...RULES, '--json']);
  assert.equal(all.status, 0, all.stderr);
  assert.deepEqual(
    JSON.parse(all.stdout).map((p) => p.url),
    [1, 2, 3, 4, 5].map((n) => `${origin}/p${n}.html`)
  );
  assert.doesNotMatch(all.stderr, /sitemap:/);

  const cut = await run([
    'scan',
    '--sitemap',
    `${origin}/sitemap.xml`,
    '--max-pages',
    '2',
    ...RULES,
    '--json'
  ]);
  assert.equal(cut.status, 0, cut.stderr);
  assert.equal(JSON.parse(cut.stdout).length, 2);
  assert.match(cut.stderr, /sitemap: 5 pages listed, scanning the first 2 \(--max-pages 2\)\./);
});

test('--sitemap and --max-pages: what they refuse', async () => {
  fs.writeFileSync(path.join(dir, 'empty.xml'), urlset([]));
  fs.writeFileSync(path.join(dir, 'feed.xml'), '<?xml version="1.0"?><rss></rss>');
  fs.writeFileSync(path.join(dir, 'broken.xml'), '<urlset><url>');
  fs.writeFileSync(path.join(dir, 'one.html'), html('One'));
  const cases = [
    [['--sitemap', 'empty.xml'], /--sitemap "empty.xml" lists no pages/],
    [['--sitemap', 'feed.xml'], /is not a sitemap: its root is <rss>/],
    [['--sitemap', 'broken.xml'], /is not a sitemap: it is not well-formed XML/],
    [['--sitemap', 'missing.xml'], /Could not read --sitemap "missing.xml": No such file/],
    [['--sitemap', `${origin}/nothing.xml`], /HTTP 404/],
    [['one.html', '--max-pages', '3'], /--max-pages needs --sitemap/],
    [['--sitemap', 'empty.xml', '--max-pages', '0'], /--max-pages must be a whole number above 0/]
  ];
  for (const [flags, message] of cases) {
    const r = await run(['scan', ...flags]);
    assert.equal(r.status, 2, flags.join(' '));
    assert.match(r.stderr, message, flags.join(' '));
  }
});

test('with no failure, the summary ends by saying that is not a conformance claim', async () => {
  fs.writeFileSync(path.join(dir, 'clean.html'), html('Clean', '<img src="x.png" alt="Logo">'));
  fs.writeFileSync(path.join(dir, 'broken.html'), html('Broken', '<img src="x.png">'));
  const clean = await run(['scan', 'clean.html', ...RULES]);
  assert.equal(clean.status, 0);
  assert.match(
    clean.stdout,
    /No rule failed, which is not a claim that the page conforms: the automated rules found nothing definite\./
  );
  const two = await run(['scan', 'clean.html', 'clean.html', 'one.html', ...RULES]);
  assert.match(two.stdout, /which is not a claim that these pages conform/);
  const failing = await run(['scan', 'clean.html', 'broken.html', ...RULES]);
  assert.doesNotMatch(failing.stdout, /No rule failed/);
  const nothing = await run(['scan', 'one.html', ...RULES]);
  assert.doesNotMatch(nothing.stdout, /No rule failed/, 'nothing applied: nothing to qualify');
  const json = await run(['scan', 'clean.html', ...RULES, '--json']);
  assert.doesNotThrow(() => JSON.parse(json.stdout), 'JSON output stays JSON');
});
