import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, shingles, jaccard, minhash, titleAffixes, RULES } from '../src/index.js';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const rules = (r) => r.findings.map((f) => f.rule);
const site = (files) => { const d = mkdtempSync(join(tmpdir(), 'db-')); for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c); } return d; };
const page = (t, d, body, head = '') => `<!doctype html><html><head><title>${t}</title>${d ? `<meta name="description" content="${d}">` : ''}${head}</head><body><main>${body}</main></body></html>`;
const text = (seed, n) => { const v = 'amber birch cedar dune ember fern grove heath iris juniper kelp larch moss nettle oak pine quartz reed sage thyme umber vale willow yarrow'.split(' '); let x = seed; const o = []; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) % 2147483648; o.push(v[x % v.length]); } return o.join(' '); };

test('good fixture is clean at --fail-on info', () => { assert.deepEqual(check(fx('good')).findings, []); });
test('bad fixture reports every rule', () => { const r = rules(check(fx('bad'))); for (const k of Object.keys(RULES)) assert.ok(r.includes(k), k); });
test('helpers: shingles, jaccard, minhash, affixes', () => {
  assert.equal(shingles('a b c d e f', 5).size, 2); assert.equal(shingles('a b', 5).size, 1);
  assert.equal(jaccard(new Set([1, 2]), new Set([2, 3])), 1 / 3);
  const s = shingles(text(1, 300)); assert.deepEqual(Array.from(minhash(s)), Array.from(minhash(new Set(s))));
  assert.deepEqual(titleAffixes(['A | Site', 'B | Site', 'C | Site', 'D']), { suffix: ' | Site', prefix: null });
});
test('near-duplicate threshold option', () => {
  const b = text(7, 300); const c = b.split(' '); for (let i = 0; i < 300; i += 12) c[i] = 'zzz'; 
  const d = site({ 'a.html': page('A', '', `<p>${b}</p>`), 'b.html': page('B', '', `<p>${c.join(' ')}</p>`) });
  const sim = check(d, { threshold: 0.3, templateCheck: false });
  assert.ok(rules(sim).includes('near-duplicate-body'));
  assert.ok(!rules(check(d, { threshold: 0.99, templateCheck: false })).includes('near-duplicate-body'));
});
test('short bodies are ignored (minWords), noindex/canonicalised/ignored pages excluded', () => {
  const d = site({ 'a.html': page('A', '', '<p>same short text</p>'), 'b.html': page('B', '', '<p>same short text</p>') });
  assert.deepEqual(rules(check(d)), []);
  assert.ok(rules(check(d, { minWords: 2 })).includes('duplicate-body'));
  const e = site({ 'a.html': page('Same', 'd one', '<p>x</p>'), 'b.html': page('Same', 'd one', '<p>y</p>', '<meta name="robots" content="noindex">'), 'c.html': page('Same', 'd one', '<p>z</p>', '<link rel="canonical" href="/a.html">'), 'old/d.html': page('Same', '', '') });
  assert.deepEqual(rules(check(e, { ignore: ['/old/**'] })), []);
  assert.ok(rules(check(e)).includes('duplicate-title'));
});
test('scales: 300 pages with LSH stays fast and finds the planted pair', () => {
  const files = {}; for (let i = 0; i < 300; i++) files[`p${i}.html`] = page(`Page ${i}`, `Description number ${i}`, `<p>${text(i + 100, 120)}</p>`);
  files['p299.html'] = page('Page 299', 'x', `<p>${text(100, 120)}</p>`);
  const t = Date.now(); const r = check(site(files), { templateCheck: false });
  assert.ok(Date.now() - t < 10000); assert.ok(rules(r).includes('duplicate-body'));
});
test('allowlist with expiry', () => {
  const d = site({ 'a.html': page('Same', '', ''), 'b.html': page('Same', '', '') });
  const r = check(d, { now: new Date('2026-10-14') }, { allowlist: [{ rule: 'duplicate-title', match: 'Same', reason: 'A/B test', expires: '2026-12-01' }] });
  assert.equal(r.findings.length, 0); assert.equal(r.suppressed.length, 1);
});
test('CLI exit codes and formats', () => {
  const bin = new URL('../bin/duplicate-beacon.js', import.meta.url).pathname;
  const run = (...x) => spawnSync(process.execPath, [bin, ...x], { encoding: 'utf8' });
  assert.equal(run(fx('good'), '--fail-on', 'info').status, 0);
  assert.equal(run(fx('bad')).status, 1);
  assert.equal(run(fx('bad'), '--fail-on', 'none').status, 0);
  assert.equal(run('/nonexistent-dir-xyz').status, 2);
  assert.equal(run(fx('good'), '--threshold', '2').status, 2);
  const s = JSON.parse(run(fx('bad'), '--format', 'sarif', '--fail-on', 'none').stdout); assert.equal(s.version, '2.1.0');
  assert.match(run(fx('bad'), '--format', 'markdown', '--fail-on', 'none').stdout, /\| Severity \|/);
});
