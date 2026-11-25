/*
 * Smoke test for the headless refresh. Starts a fake CMHA server that mimics the structure of the real
 * pages (including the awkward bits: repeated nested tables, doubled apostrophes, winner-first scores,
 * power-play and empty-net tags), runs scripts/refresh_cmha.mjs against it, and checks the output files.
 *
 *   node tests/refresh_smoke.mjs
 *
 * This proves the plumbing works. It does not prove CMHA's live pages still look the same; the Action
 * run itself (and the build's data checks) cover that.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const goal = (scorerLine, tag, clock, score) =>
  `<table><tr><td></td><td>${scorerLine}</td>${tag ? `<td>${tag}</td>` : ''}</tr>` +
  `<tr><td>${clock} ${score}</td><td>${clock}</td><td>${score}</td></tr></table>` +
  `<table><tr><td>${clock}</td><td>${score}</td></tr></table>`;                 // CMHA repeats a nested copy
const pen = (name, inf, clock) => `<table><tr><td></td><td>${name.replace(/'/g, "''")}${inf} ${name.replace(/'/g, "''")} ${inf} ${clock}</td><td>2:00</td></tr></table>`;

const pages = {
  '/team/4035/schedule/?season=1069': `<html><body><table>
    <tr><th>#</th><th>Date</th><th>Time</th><th>Arena</th><th>H/A</th><th>Opponent</th><th>Result</th><th>Score</th><th>Status</th></tr>
    <tr><td>1</td><td>Mon, Sep 21</td><td>9:15 PM</td><td><a href="/arena/6">GB</a></td><td>HOME</td><td><a href="/team/1/home/">Blackout</a></td><td>W</td><td>2 - 1</td><td><a href="/game/100/summary">Final</a></td></tr>
    <tr><td>2</td><td>Sun, Sep 27</td><td>2:45 PM</td><td><a href="/arena/1">SH</a></td><td>AWAY</td><td>Colts</td><td>L</td><td>1 - 0</td><td></td></tr>
    <tr><td>3</td><td>Sun, Jan 17</td><td>6:30 PM</td><td><a href="/arena/1">SH</a></td><td>AWAY</td><td>Smokin Guns</td><td></td><td></td><td><a href="/game/200/preview">Preview</a></td></tr>
    </table></body></html>`,
  '/game/100/summary': `<html><body>
    <table><tr><th>Team</th><th>1</th><th>2</th><th>3</th><th>T</th></tr><tr><td></td><td>Blackout</td><td>0</td><td>1</td><td>0</td><td>1</td></tr><tr><td></td><td>306ers</td><td>1</td><td>0</td><td>1</td><td>2</td></tr></table>
    ${goal('Vaughn Labelle (1) Matt Stephens, Adam Lamoureux', 'PPG', '13:30 | 1st', 'Blackout 0, 306ers 1BLACK 0, 306ER 1')}
    ${goal('Steve Holford (1) Unassisted', '', '5:00 | 2nd', 'Blackout 1, 306ers 1BLACK 1, 306ER 1')}
    ${goal('Mike Leibel (2) Empty Net Drew Anholt', '', '0:40 | 3rd', 'Blackout 1, 306ers 2BLACK 1, 306ER 2')}
    ${pen('Clifton O\'Brien', 'Slashing', '9:37 | 2nd')}
    ${pen('Mike Leibel', 'Hooking', '3:03 | 1st')}
    </body></html>`,
  '/team/4035/stats/?season=1069': `<html><body>
    <table><tr><th>#</th><th>Player</th><th>GP</th><th>G</th><th>A</th><th>PTS</th><th>PPGA</th><th>SH</th><th>PP</th><th>PIM</th></tr>
      <tr><td>16</td><td>Adam Lamoureux</td><td>10</td><td>7</td><td>11</td><td>18</td><td>1.80</td><td>0</td><td>1</td><td>4</td></tr></table>
    <table><tr><th>#</th><th>Player</th><th>GP</th><th>W</th><th>L</th><th>T</th><th>GA</th><th>GAA</th><th>SO</th></tr>
      <tr><td>1</td><td>Gavin Reynolds</td><td>10</td><td>6</td><td>4</td><td>0</td><td>70</td><td>7.00</td><td>0</td></tr></table>
    </body></html>`,
  '/arena/6': '<html><body><h2>Arena Information</h2><script>document.title = "George Blundun | CMHA";</script></body></html>',
  '/arena/1': '<html><body><h2>Arena Information</h2><script>document.title = "Stew Hendry | CMHA";</script></body></html>',
};

const server = http.createServer((req, res) => {
  const body = pages[req.url];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
  res.end(body || 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cmha-smoke-'));

// the runner is a separate process so it must be async here, or the server above could not answer it
const result = await new Promise((resolve) => {
  import('node:child_process').then(({ spawn }) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'refresh_cmha.mjs')], { env: { ...process.env, CMHA_BASE: base, CMHA_OUT: out } });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.on('close', (code) => resolve({ code, log }));
  });
});
server.close();

const expected = {
  // winner-first score on a loss is flipped back to us-first; the 1-0 loss has no summary so its gid is empty
  'schedule.txt': '1|2026-09-21|9:15 PM|GB|H|Blackout|W|2|1|100\n2|2026-09-27|2:45 PM|SH|A|Colts|L|0|1|\n3|2027-01-17|6:30 PM|SH|A|Smokin Guns||||200\n',
  'goals.txt': '100|T|1st|13:30|Vaughn Labelle|1|Matt Stephens/Adam Lamoureux|PPG\n100|O|2nd|5:00|Steve Holford|1||\n100|T|3rd|0:40|Mike Leibel|2|Drew Anholt|EN\n',
  'pens.txt': "100|2nd|9:37|Clifton O'Brien|Slashing|2:00\n100|1st|3:03|Mike Leibel|Hooking|2:00\n",
  'roster_stats.txt': '16|Adam Lamoureux|10|7|11|18|0|1|4\n',
  'goalies.txt': '1|Gavin Reynolds|10|6|4|0|70|7.00|0\n',
  'arenas.json': '{\n  "GB": "George Blundun",\n  "SH": "Stew Hendry"\n}\n',
};

let failures = 0;
if (result.code !== 0) { console.error('runner exited with', result.code); console.error(result.log); failures++; }
for (const [name, want] of Object.entries(expected)) {
  const file = path.join(out, name);
  const got = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '(missing)';
  if (got === want) console.log(`ok    ${name}`);
  else { failures++; console.log(`FAIL  ${name}\n  want: ${JSON.stringify(want)}\n  got:  ${JSON.stringify(got)}`); }
}
fs.rmSync(out, { recursive: true, force: true });
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('refresh smoke test passed');
