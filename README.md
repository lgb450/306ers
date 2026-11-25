# 306ers Hockey

A one-page stats site for the 306ers (Division 4, Calgary Men's Hockey Association), built entirely from the public CMHA pages.

Tabs: **Overview**, **Player Stats**, **Connections** (who assists whom), **Trends**, **Game Recaps**, **Schedule**.

The site is a single self-contained file, `docs/index.html`. There is no server and no framework. Open the file in a browser, or publish `docs/` with GitHub Pages.

## Quick start

You need Python 3.8 or newer. There are no packages to install.

```
python scripts/build.py
```

That reads everything in `data/`, checks it, and writes `docs/index.html`. Open that file in a browser.

## Publishing with GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to Settings, then Pages.
3. Set the source to the `main` branch and the `/docs` folder.

## Updating after each game

### Automatic (GitHub Actions)

`.github/workflows/refresh.yml` keeps the site current with no manual work:

- Every 30 minutes it checks the schedule. A game is **due** once its start time plus 2 hours has passed (Calgary time, daylight saving handled) and it still has no result. Only then does it fetch from CMHA.
- If the score is not posted yet, it tries again 30 minutes later, and keeps trying for 72 hours.
- Once a day it refreshes regardless, which picks up stat corrections and rescheduled games.
- It rebuilds the site, and commits `data/` and `docs/` only if something changed. If the build checks fail (see below) it commits nothing and the run shows red in the Actions tab.

To use it: push the repo, then in the Actions tab open "Refresh stats from CMHA" and press **Run workflow** once to confirm it works. Settings, Actions, General, Workflow permissions must allow read and write.

Things to know:

- GitHub runs scheduled jobs on a best-effort basis, so a run can start several minutes late.
- On a public repo GitHub pauses scheduled workflows after 60 days with no repo activity. Press **Run workflow** (or push any change) to wake it up. The season's own commits normally keep it alive.
- A new game gets a plain placeholder recap until you add one to `data/recaps.json`.
- `node tests/refresh_smoke.mjs` and `python -m unittest discover tests` check the refresh plumbing and the due-game timing locally (`npm ci` first).

### Manual (fallback)

1. Open any page on https://cmhahockey.com in a browser.
2. Open the developer console (F12, or Cmd+Option+J on a Mac) and paste the contents of `scripts/scrape_cmha.js`.
3. Wait about 15 seconds. The browser downloads six files: `schedule.txt`, `goals.txt`, `pens.txt`, `roster_stats.txt`, `goalies.txt` and `arenas.json`. Allow multiple downloads if asked.
4. Move them into `data/`, replacing the old ones.
5. Run `python scripts/game_facts.py` to see the key facts for each game, then add a recap for the new game in `data/recaps.json` (the key is the game number from the schedule).
6. Run `python scripts/build.py`, then commit and push.

If a game has no recap yet, the site shows a plain placeholder line and the build prints a reminder, so nothing breaks.

## What the build checks

`scripts/analyze.py` refuses to produce a site if the data does not reconcile:

- every game's goal log adds up to the final score on the schedule, and
- every skater's goals, assists, points, power-play goals, short-handed goals and penalty minutes, rebuilt from the game logs, match the CMHA team stats page.

If a check fails, the build stops and tells you which game or player is off.

## Folder layout

```
data/
  schedule.txt       one line per game: number, date, time, arena, home/away, opponent, result, goals for, goals against, game id
  goals.txt          one line per goal: game id, T (us) or O (opponent), period, time, scorer, season goal count, assists, PPG/SHG/EN tag
  pens.txt           one line per penalty: game id, period, time, player, infraction, minutes
  roster_stats.txt   the CMHA skater table
  goalies.txt        the CMHA goalie table
  arenas.json        arena code to rink name
  recaps.json        the written game recaps (edit by hand)
scripts/
  build.py           runs the three steps below
  analyze.py         loads and verifies the data, computes per-player numbers
  build_data.py      assembles the numbers the page reads
  build_site.py      embeds them in the page template
  game_facts.py      prints facts to help write recaps
  scrape_cmha.js     browser console script that refreshes data/
src/template.html    the page itself (HTML, CSS and JavaScript)
docs/index.html      the built site (generated; commit it so GitHub Pages can serve it)
build/               intermediate files (ignored by git)
```

## Notes on the data

- CMHA does not publish who dressed for each game, so the Player Stats "By game" boxes show points only. A white box can mean no points or a night off.
- A game with no summary page on CMHA (game 2, a 1-0 win over the Colts) counts in the record and schedule but not in the goal-by-goal analysis.
- The game summaries do not include shots on goal, so there is no shot or save-percentage data.
- A goalie has to be on the CMHA goalie table to appear in the Goalies section.

## Changing the look

All colors are CSS variables at the top of `src/template.html`. The palette comes from the team logo: green `#087838` and gold `#F8C008`. The page has a light and a dark theme. After editing the template, run `python scripts/build.py` again.

## Ideas for later

- Standings and playoff math (needs the CMHA standings page)
- BenchApp check-ins for a "who is in" view and goalie coverage
- Lineup and line suggestions from the connection data
- Past seasons, using the season number in the CMHA URLs
