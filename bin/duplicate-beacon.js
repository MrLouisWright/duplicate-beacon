#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP, UsageError, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'duplicate-beacon', version: pkg.version, configKey: 'duplicateBeacon', rules: RULES,
  tagline: 'detect duplicate and near-duplicate titles, descriptions and page bodies',
  usage: 'Usage: duplicate-beacon [site-dir] [options]',
  help: `${SITE_HELP}Checks
      --threshold <0-1>        Similarity for near-duplicate bodies (default 0.9)
      --min-words <n>          Ignore bodies shorter than n words (default 50)
      --ignore <globs>         Pages to leave out of the comparison
      --no-template-check      Do not report boilerplate-heavy pages
`,
  options: { ...SITE_OPTIONS, threshold: { type: 'string' }, 'min-words': { type: 'string' }, ignore: { type: 'string', multiple: true }, 'no-template-check': { type: 'boolean' } },
  run: async ({ dir, values: o, config, configFile }) => {
    let t; if (o.threshold != null) { t = Number(o.threshold); if (!(t > 0 && t <= 1)) throw new UsageError('--threshold must be between 0 and 1'); }
    let mw; if (o['min-words'] != null) { mw = Number(o['min-words']); if (!(mw >= 1)) throw new UsageError('--min-words must be a positive number'); }
    return check(dir, { cli: o, threshold: t, minWords: mw, ignore: splitList(o.ignore), templateCheck: o['no-template-check'] ? false : undefined, toolVersion: pkg.version }, config, configFile);
  },
});
