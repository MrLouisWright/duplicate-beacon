// duplicate-beacon: duplicate and near-duplicate titles, descriptions and page bodies across a built static site. Louis Wright, MIT.
import { contentPages, runBeacon, finder, SITE_OPTIONS, SITE_HELP, siteOptions, robotsDirectives, isNoindex, canonicalOf, matchAny } from './site.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { SITE_OPTIONS, SITE_HELP, siteOptions };

export const RULES = {
  'duplicate-body': { severity: 'high', title: 'Pages have identical main content' },
  'duplicate-title': { severity: 'high', title: 'Pages share the same <title>' },
  'near-duplicate-body': { severity: 'medium', title: 'Pages have near-identical main content (similarity at or above the threshold)' },
  'duplicate-description': { severity: 'medium', title: 'Pages share the same meta description' },
  'near-duplicate-title': { severity: 'low', title: 'Titles are identical once the shared site-name suffix/prefix is removed' },
  'near-duplicate-description': { severity: 'low', title: 'Meta descriptions are near-identical (template text with one word changed)' },
  'title-equals-description': { severity: 'low', title: 'Meta description just repeats the title' },
  'duplicate-template-heavy': { severity: 'info', title: 'Most of the page text is boilerplate shared with many other pages' },
};

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[\s\u00a0]+/g, ' ').replace(/[“”"'’‘]/g, '').trim();
const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** k-word shingles of a text as a Set of strings. */
export function shingles(text, k = 5) {
  const w = words(text); const out = new Set();
  if (w.length < k) { if (w.length) out.add(w.join(' ')); return out; }
  for (let i = 0; i <= w.length - k; i++) out.add(w.slice(i, i + k).join(' '));
  return out;
}
export function jaccard(a, b) { if (!a.size && !b.size) return 1; let n = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a]; for (const x of s) if (l.has(x)) n++; return n / (a.size + b.size - n); }

function fnv(str, seed) { let h = (2166136261 ^ seed) >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return h >>> 0; }
export function minhash(set, n = 64) { const sig = new Uint32Array(n).fill(0xffffffff); for (const s of set) for (let i = 0; i < n; i++) { const h = fnv(s, i * 0x9e3779b1); if (h < sig[i]) sig[i] = h; } return sig; }

/** Common prefix/suffix (site name like " | Acme") shared by most titles. */
export function titleAffixes(titles) {
  const count = (re) => { const m = new Map(); for (const t of titles) { const x = re.exec(t)?.[0]; if (x) m.set(x, (m.get(x) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1])[0]; };
  const suf = count(/\s*[|\-–—:·•]\s*[^|\-–—:·•]+$/); const pre = count(/^[^|\-–—:·•]+\s*[|\-–—:·•]\s*/);
  const min = Math.max(2, Math.ceil(titles.length * 0.3));
  return { suffix: suf && suf[1] >= min ? suf[0] : null, prefix: pre && pre[1] >= min ? pre[0] : null };
}
const group = (items, key) => { const m = new Map(); for (const it of items) { const k = key(it); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(it); } return [...m.values()].filter((g) => g.length > 1); };
const list = (g) => g.slice(0, 5).map((p) => p.path).join(', ') + (g.length > 5 ? `, … (${g.length} pages)` : '');

export function analyze(site, opts = {}, config = {}) {
  const { findings, add } = finder(RULES);
  const threshold = opts.threshold ?? config.threshold ?? 0.9;
  const minWords = opts.minWords ?? config.minWords ?? 50;
  const ignore = [...(config.ignore || []), ...(opts.ignore || [])];
  const all = contentPages(site);
  // pages that consolidate elsewhere (canonical to another page) or are noindex do not compete
  const pages = all.filter((p) => { if (matchAny(ignore, p.path) || matchAny(ignore, p.file)) return false; if (isNoindex(robotsDirectives(site, p))) return false; const c = canonicalOf(site, p).url; if (c) { const t = site.find(c); if ((t && t !== p) || (!t && site.origin && c.origin !== site.origin)) return false; } return true; });
  const data = pages.map((p) => ({ p, title: p.doc.title ?? '', desc: p.doc.metaContent('description') ?? '', body: p.doc.mainText, full: p.doc.text }));
  const pg = (d) => d.p;
  // titles
  for (const g of group(data, (d) => norm(d.title))) add('duplicate-title', g[0].title, `${g.length} pages share the title "${g[0].title}": ${list(g.map(pg))}`, 'Give each page a unique, descriptive <title>.', { file: g[1].p.file });
  const aff = titleAffixes(data.map((d) => d.title));
  const core = (t) => { let s = t; if (aff.suffix && s.endsWith(aff.suffix)) s = s.slice(0, -aff.suffix.length); if (aff.prefix && s.startsWith(aff.prefix)) s = s.slice(aff.prefix.length); return norm(s); };
  if (aff.suffix || aff.prefix) for (const g of group(data, (d) => core(d.title))) { if (new Set(g.map((d) => norm(d.title))).size > 1) add('near-duplicate-title', core(g[0].title), `${g.length} titles differ only in the site name: ${g.map((d) => `"${d.title}"`).slice(0, 3).join(', ')}`, 'Make the topic part of each title unique.', { file: g[1].p.file }); }
  // descriptions
  for (const g of group(data, (d) => norm(d.desc))) add('duplicate-description', g[0].desc.slice(0, 80), `${g.length} pages share the meta description "${g[0].desc.slice(0, 80)}${g[0].desc.length > 80 ? '…' : ''}": ${list(g.map(pg))}`, 'Write a unique description for each page, or remove it and let search engines generate one.', { file: g[1].p.file });
  const dd = data.filter((d) => words(d.desc).length >= 6).map((d) => ({ ...d, ds: shingles(d.desc, 2) }));
  const seenD = new Set(); for (const d of dd) seenD.add(norm(d.desc));
  for (let i = 0; i < dd.length; i++) for (let j = i + 1; j < dd.length && j < i + 400; j++) { const a = dd[i]; const b = dd[j]; if (norm(a.desc) === norm(b.desc)) continue; const s = jaccard(a.ds, b.ds); if (s >= (config.descriptionThreshold ?? 0.6)) add('near-duplicate-description', `${a.p.path} ~ ${b.p.path}`, `Descriptions of ${a.p.path} and ${b.p.path} are ${Math.round(s * 100)}% similar`, 'Rewrite them so each describes its own page.', { file: b.p.file }); }
  for (const d of data) if (d.desc && norm(d.desc) === norm(d.title)) add('title-equals-description', d.p.path, `Meta description of ${d.p.path} is the same as its title`, 'Write a one- or two-sentence summary instead of repeating the title.', { file: d.p.file });
  // bodies
  const bodies = data.filter((d) => words(d.body).length >= minWords);
  const exact = group(bodies, (d) => norm(d.body));
  const inExact = new Set(); for (const g of exact) { g.forEach((d) => inExact.add(d)); add('duplicate-body', g[0].p.path, `${g.length} pages have identical main content: ${list(g.map(pg))}`, 'Consolidate them into one page, or point duplicates at the original with rel=canonical (or noindex them).', { file: g[1].p.file }); }
  const sh = bodies.map((d) => ({ d, s: shingles(d.body) })); for (const x of sh) x.sig = minhash(x.s);
  const B = 16; const R = 4; const cand = new Set();
  for (let b = 0; b < B; b++) { const buckets = new Map(); sh.forEach((x, i) => { const k = Array.from(x.sig.slice(b * R, b * R + R)).join(','); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); }); for (const ids of buckets.values()) if (ids.length > 1 && ids.length < 200) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) cand.add(ids[i] * 1e6 + ids[j]); }
  let near = 0; const dupSet = new Set(inExact);
  for (const c of [...cand].sort((a, b) => a - b)) { const x = sh[Math.floor(c / 1e6)]; const y = sh[c % 1e6]; if (inExact.has(x.d) && inExact.has(y.d) && norm(x.d.body) === norm(y.d.body)) continue; const s = jaccard(x.s, y.s); if (s >= threshold) { near++; dupSet.add(x.d); dupSet.add(y.d); add('near-duplicate-body', `${x.d.p.path} ~ ${y.d.p.path}`, `${x.d.p.path} and ${y.d.p.path} are ${Math.round(s * 100)}% similar`, 'Merge them, differentiate the content, or canonicalise one to the other.', { file: y.d.p.file }); } }
  // boilerplate
  if (data.length >= 3 && (opts.templateCheck ?? config.templateCheck ?? true)) {
    const freq = new Map(); const fs = data.map((d) => { const s = shingles(d.full); for (const x of s) freq.set(x, (freq.get(x) || 0) + 1); return s; });
    const common = Math.max(3, Math.ceil(data.length * (config.templateShare ?? 0.3)));
    data.forEach((d, i) => { const s = fs[i]; if (s.size < 20 || dupSet.has(d)) return; let n = 0; for (const x of s) if (freq.get(x) >= common) n++; const r = n / s.size; if (r >= (config.templateRatio ?? 0.8)) add('duplicate-template-heavy', d.p.path, `${Math.round(r * 100)}% of ${d.p.path} is text shared with at least 30% of pages`, 'Add substantial unique content, or noindex the page.', { file: d.p.file }); });
  }
  return { findings, info: { compared: pages.length, nearDuplicates: near }, summary: `${all.length} page(s); ${pages.length} compared (noindex and canonicalised pages excluded)` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'duplicate-beacon', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '👯', defaultFile: 'index.html' };
  return runBeacon(tool, dir, { ...opts, UsageError }, config, configFile, analyze, buildReport);
}
