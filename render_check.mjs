// Renders docs/index.html in jsdom and checks that the text is data-driven. Also simulates a finished season.
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const html = fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

function render(mutate) {
  let h = html;
  if (mutate) {
    h = h.replace(/(<script id="data" type="application\/json">)([\s\S]*?)(<\/script>)/, (m, a, json, c) => {
      const d = JSON.parse(json); mutate(d); return a + JSON.stringify(d).replace(/</g, '\\u003c') + c;
    });
  }
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const dom = new JSDOM(h, { runScripts: 'dangerously', virtualConsole: vc, url: 'http://localhost/' });
  return { w: dom.window, errors };
}
let bad = 0; const check = (name, ok, extra = '') => { console.log((ok ? 'ok    ' : 'FAIL  ') + name + (ok ? '' : ' ' + extra)); if (!ok) bad++; };

let { w, errors } = render();
const t = (id) => w.document.querySelector(id).textContent;
check('no script errors (current data)', errors.length === 0, errors.join('; '));
check('overview record line', /wins? and .* through \d+ games?/.test(t('#v-overview')), t('#v-overview').slice(0, 200));
check('footer as-of filled', /through game \d+, \w+/.test(t('footer')), t('footer'));
check('trends note has no hardcoded team names unless data says so', /started with/.test(t('#v-trends')) || !/Two of our losses/.test(t('#v-trends')));

({ w, errors } = render((d) => { d.sched.forEach((s) => { if (!s.res) { s.res = 'W'; s.gf = 3; s.ga = 2; } }); }));
check('no script errors (all games played)', errors.length === 0, errors.join('; '));
check('season-complete card', /Season complete/.test(w.document.querySelector('#v-overview').textContent));

({ w, errors } = render((d) => { d.sched.push({ n: 99, date: '2027-04-01', time: '7:00 PM', arena: 'GB', ha: 'H', opp: 'Newbies', res: 'W', gf: 4, ga: 1, gid: '' }); }));
check('extra played game without summary', errors.length === 0 && /2 games have no game summary/.test(w.document.querySelector('footer').textContent), errors.join('; ') + w.document.querySelector('footer').textContent);
if (bad) process.exit(1);
console.log('render checks passed');
