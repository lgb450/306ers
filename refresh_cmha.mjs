/*
 * Headless version of the CMHA refresh, used by the GitHub Action.
 *
 * It runs scripts/scrape_cmha.js (the same file you can paste into a browser console) inside jsdom,
 * so there is only one copy of the parsing logic. Writes the six data files into data/.
 *
 *   npm ci && node scripts/refresh_cmha.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CMHA_BASE || 'https://cmhahockey.com';

const dom = new JSDOM('<!doctype html><html><head><title>refresh</title></head><body></body></html>', {
  url: BASE + '/',
  runScripts: 'outside-only',
});
const { window } = dom;

// jsdom has no fetch, so give the script one that resolves relative URLs against the CMHA site.
window.fetch = async (url) => {
  const res = await fetch(new URL(url, BASE), { headers: { 'user-agent': '306ers-stats-refresh (GitHub Action)' } });
  if (!res.ok) throw new Error(`CMHA returned ${res.status} for ${url}`);
  return res;
};
window.__NO_DOWNLOAD = true;                       // return the files instead of triggering browser downloads

window.eval(fs.readFileSync(path.join(ROOT, 'scripts', 'scrape_cmha.js'), 'utf8'));
const files = await window.__cmhaRun;

// Guard against a layout change on CMHA silently wiping the data.
const lines = (name) => files[name].split('\n').filter(Boolean).length;
if (lines('schedule.txt') < 1) throw new Error('Scrape returned no schedule rows. CMHA may have changed its page layout.');
if (lines('roster_stats.txt') < 1) throw new Error('Scrape returned no skaters. CMHA may have changed its page layout.');

const OUT = process.env.CMHA_OUT || path.join(ROOT, 'data');     // CMHA_OUT lets the smoke test write somewhere harmless
fs.mkdirSync(OUT, { recursive: true });
for (const [name, text] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), text, 'utf8');
}
console.log(`Wrote ${Object.keys(files).length} files to data/ ` +
            `(${lines('schedule.txt')} games, ${lines('goals.txt')} goals, ${lines('pens.txt')} penalties, ${lines('roster_stats.txt')} skaters).`);
