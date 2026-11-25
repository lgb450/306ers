/*
 * Refresh the data files from the public CMHA site.
 *
 * HOW TO RUN
 *   1. In a browser, open any page on https://cmhahockey.com (the team's stats page is fine).
 *   2. Open the developer console (F12 or Cmd+Option+J) and paste this whole file, then press Enter.
 *   3. Wait about 15 seconds. The browser downloads six files:
 *        schedule.txt  goals.txt  pens.txt  roster_stats.txt  goalies.txt  arenas.json
 *      (If it asks to allow multiple downloads, allow them.)
 *   4. Move them into the repo's data/ folder, replacing the old ones, then run: python scripts/build.py
 *
 * It must run on cmhahockey.com itself because the pages are read with same-site requests.
 * To use it for another team or season, change CFG below. teamId and season are the numbers in the
 * team's stats URL, e.g. https://cmhahockey.com/team/4035/stats/?season=1069
 */
window.__cmhaRun = (async () => {      // the promise is exposed so scripts/refresh_cmha.mjs can run this same file headlessly
  const CFG = {
    teamId: 4035,
    season: 1069,
    teamName: '306ers',   // exactly as CMHA spells it in game summaries
    startYear: 2026,      // calendar year the season starts in (Sep-Dec games use it, Jan-Aug use the next year)
  };

  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  const norm = (s) => s.replace(/''/g, "'");                         // CMHA doubles apostrophes in some names
  const getDoc = async (url) => new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html');
  const tableRows = (t) => [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => clean(c.textContent)));
  const ORDER = { '1st': 0, '2nd': 1, '3rd': 2 };

  // ---------- schedule ----------
  const sdoc = await getDoc(`/team/${CFG.teamId}/schedule/?season=${CFG.season}`);
  const games = [];
  const arenaIds = {};
  for (const tr of sdoc.querySelectorAll('table tr')) {
    const c = [...tr.querySelectorAll('td')].map((td) => clean(td.textContent));
    if (c.length < 9 || !/^\d+$/.test(c[0])) continue;                 // skips the repeated header rows
    const hrefs = [...tr.querySelectorAll('a')].map((a) => a.getAttribute('href') || '');
    const gl = hrefs.map((h) => h.match(/\/game\/(\d+)\/(summary|preview)/)).find(Boolean);
    const ar = hrefs.map((h) => h.match(/\/arena\/(\d+)/)).find(Boolean);
    const dm = c[1].match(/([A-Z][a-z]{2}) (\d+)$/);
    const month = MONTHS[dm[1]];
    const year = month >= 9 ? CFG.startYear : CFG.startYear + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(+dm[2]).padStart(2, '0')}`;
    let gf = '', ga = '';
    const sm = c[7].match(/(\d+)\s*-\s*(\d+)/);
    if (sm) {                                                          // CMHA lists the score winner-first
      const [x, y] = [sm[1], sm[2]];
      if (c[6] === 'L') { gf = y; ga = x; } else { gf = x; ga = y; }
    }
    if (ar) arenaIds[c[3]] = ar[1];
    games.push({ n: c[0], date, time: c[2], arena: c[3], ha: c[4] === 'HOME' ? 'H' : 'A', opp: c[5], res: c[6], gf, ga,
                 gid: gl ? gl[1] : '', kind: gl ? gl[2] : '' });
  }
  const scheduleTxt = games.map((g) => [g.n, g.date, g.time, g.arena, g.ha, g.opp, g.res, g.gf, g.ga, g.gid].join('|')).join('\n') + '\n';

  // ---------- game summaries: goals and penalties ----------
  const goalLines = [];
  const penLines = [];
  for (const g of games) {
    if (!(g.res && g.gid && g.kind === 'summary')) continue;
    const doc = await getDoc(`/game/${g.gid}/summary`);
    const tables = [...doc.querySelectorAll('table')].map(tableRows);
    let a = 0, b = 0, teamA = null, teamB = null;
    for (const t of tables) {
      if (t.length >= 2 && t[0].length >= 2 && /\(\d+\)/.test(t[0][1]) && /\|/.test(t[1][1] || '')) {
        // a goal: "Scorer (season goal #) Assist, Assist"  /  "13:30 | 1st"  /  "Team 0, Team 1"
        const m = t[0][1].match(/^(.*?) \((\d+)\) (.*)$/);
        const tm = t[1][1].match(/^(\d+:\d+) \| (\w+)$/);
        const sc = t[1][2].match(/^(.*?) (\d+), (.*?) (\d+)(?=[A-Z]{2,}|$)/);
        if (!m || !tm || !sc) throw new Error(`Could not read a goal in game ${g.n}: ${t[0].join(' / ')}`);
        let rest = m[3];
        let tag = t[0][2] || '';
        if (/^Empty Net /.test(rest)) { rest = rest.replace(/^Empty Net /, ''); tag = tag ? tag + '+EN' : 'EN'; }
        const assists = rest === 'Unassisted' ? [] : rest.split(', ');
        if (teamA === null) { teamA = sc[1]; teamB = sc[3]; }
        const nA = +sc[2], nB = +sc[4];
        const side = nA > a ? teamA : nB > b ? teamB : '?';             // whichever team's score just went up scored
        a = nA; b = nB;
        goalLines.push([g.gid, side === CFG.teamName ? 'T' : 'O', tm[2], tm[1], norm(m[1]), m[2], assists.map(norm).join('/'), tag].join('|'));
      } else if (t.length === 1 && t[0].length === 3 && /\d+:\d+ \| \w+$/.test(t[0][1])) {
        // a penalty: the cell repeats "NameInfraction Name Infraction 3:03 | 1st", so split on the repeat
        const s = t[0][1];
        const mt = s.match(/(\d+:\d+) \| (\w+)$/);
        const rest = s.slice(0, mt.index).trim();
        let name = null, inf = null;
        for (let k = 0; k < rest.length && !name; k++) {
          if (rest[k] !== ' ') continue;
          const A = rest.slice(0, k), B = rest.slice(k + 1);
          if (B.length !== A.length + 1) continue;
          for (let j = 0; j < B.length; j++) {
            if (B[j] === ' ' && B.slice(0, j) + B.slice(j + 1) === A) { name = B.slice(0, j); inf = B.slice(j + 1); break; }
          }
        }
        if (!name) throw new Error(`Could not read a penalty in game ${g.n}: ${s}`);
        penLines.push([g.gid, mt[2], mt[1], norm(name), norm(inf), t[0][2]].join('|'));
      }
    }
  }
  const goalsTxt = goalLines.join('\n') + '\n';
  const pensTxt = penLines.join('\n') + '\n';

  // ---------- team stats page: skaters and goalies ----------
  const stdoc = await getDoc(`/team/${CFG.teamId}/stats/?season=${CFG.season}`);
  let rosterTxt = '', goaliesTxt = '';
  for (const t of stdoc.querySelectorAll('table')) {
    const rows = tableRows(t);
    const head = rows[0].join('|');
    const body = rows.slice(1).filter((r) => r.length >= 9);
    if (/\|PIM$/.test(head)) {                                        // #|Player|GP|G|A|PTS|PPGA|SH|PP|PIM
      rosterTxt = body.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[7], r[8], r[9]].join('|')).join('\n') + '\n';
    } else if (/\|GAA\|/.test(head)) {                                // #|Player|GP|W|L|T|GA|GAA|SO
      goaliesTxt = body.map((r) => r.slice(0, 9).join('|')).join('\n') + '\n';
    }
  }

  // ---------- arena names ----------
  const arenas = {};
  for (const [code, id] of Object.entries(arenaIds)) {
    const txt = (await getDoc(`/arena/${id}`)).documentElement.textContent;
    const nm = txt.match(/document\.title = "(.*?) \| CMHA"/);
    arenas[code] = nm ? nm[1] : code;
  }
  const arenasJson = JSON.stringify(arenas, null, 2) + '\n';

  const files = {
    'schedule.txt': scheduleTxt, 'goals.txt': goalsTxt, 'pens.txt': pensTxt,
    'roster_stats.txt': rosterTxt, 'goalies.txt': goaliesTxt, 'arenas.json': arenasJson,
  };

  // ---------- quick sanity report ----------
  const played = games.filter((g) => g.res);
  console.log(`CMHA refresh: ${games.length} games, ${played.length} played, ${goalLines.length} goals, ${penLines.length} penalties, ` +
              `${rosterTxt.split('\n').filter(Boolean).length} skaters, ${Object.keys(arenas).length} arenas.`);

  if (window.__NO_DOWNLOAD) return files;                              // used when testing; normal runs download
  for (const [name, text] of Object.entries(files)) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log('Done. Move the downloaded files into the repo data/ folder, then run: python scripts/build.py');
})();
