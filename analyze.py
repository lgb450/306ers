"""Step 1: load the raw CMHA data, verify it, and compute per-player numbers.

Reads  data/*.txt
Writes build/analysis.json
Exits non-zero if the data does not reconcile (so a bad scrape never reaches the site).
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

# ---- load -----------------------------------------------------------------
roster = {}
for line in (DATA / "roster_stats.txt").read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    n, name, gp, g, a, pts, sh, pp, pim = line.split("|")
    roster[name] = dict(num=int(n), gp=int(gp), g=int(g), a=int(a), pts=int(pts), sh=int(sh), pp=int(pp), pim=int(pim))
R = set(roster)

sched = []
for line in (DATA / "schedule.txt").read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    n, date, tm, arena, ha, opp, res, gf, ga, gid = line.split("|")
    sched.append(dict(n=int(n), date=date, time=tm, arena=arena, ha=ha, opp=opp, res=res,
                      gf=int(gf) if gf else None, ga=int(ga) if ga else None, gid=gid))

goals = []
for line in (DATA / "goals.txt").read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    gid, side, per, time, scorer, _season_count, assists, tag = line.split("|")
    goals.append(dict(gid=gid, side=side, per=per, time=time, scorer=scorer,
                      a=[x for x in assists.split("/") if x], tag=tag))

pens = []
for line in (DATA / "pens.txt").read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    gid, per, time, name, inf, _mins = line.split("|")
    pens.append(dict(gid=gid, per=per, time=time, name=name, inf=inf, side="T" if name in R else "O"))

# ---- verify ---------------------------------------------------------------
problems = []
summarised = [s for s in sched if s["gid"] and s["res"]]   # completed games that have a summary page
for s in summarised:
    gf = sum(1 for g in goals if g["gid"] == s["gid"] and g["side"] == "T")
    ga = sum(1 for g in goals if g["gid"] == s["gid"] and g["side"] == "O")
    if (gf, ga) != (s["gf"], s["ga"]):
        problems.append(f"game {s['n']}: goal log says {gf}-{ga}, schedule says {s['gf']}-{s['ga']}")

for g in goals:
    for nm in [g["scorer"]] + g["a"]:
        if g["side"] == "T" and nm not in R:
            problems.append(f"306ers goal involves a name not on the roster: {nm} (game id {g['gid']})")
        if g["side"] == "O" and nm in R:
            problems.append(f"opponent goal involves a rostered player: {nm} (game id {g['gid']})")

G, A, A1, A2, PP, SH, PIM = (Counter() for _ in range(7))
for g in goals:
    if g["side"] != "T":
        continue
    G[g["scorer"]] += 1
    PP[g["scorer"]] += g["tag"] == "PPG"
    SH[g["scorer"]] += g["tag"] == "SHG"
    for i, nm in enumerate(g["a"]):
        A[nm] += 1
        (A1 if i == 0 else A2)[nm] += 1
for p in pens:
    if p["side"] == "T":
        PIM[p["name"]] += 2
for nm, r in roster.items():
    got = (G[nm], A[nm], G[nm] + A[nm], PP[nm], SH[nm], PIM[nm])
    want = (r["g"], r["a"], r["pts"], r["pp"], r["sh"], r["pim"])
    if got != want:
        problems.append(f"{nm}: game logs give G/A/PTS/PP/SH/PIM {got}, CMHA stats page says {want}")

print(f"verify: {len(problems)} problem(s)")
for p in problems:
    print("  -", p)

# ---- per-player game-by-game points ---------------------------------------
ppg = {nm: [] for nm in roster}
gsc = {nm: [] for nm in roster}
for s in summarised:
    pts, gl = Counter(), Counter()
    for g in goals:
        if g["gid"] == s["gid"] and g["side"] == "T":
            pts[g["scorer"]] += 1
            gl[g["scorer"]] += 1
            for x in g["a"]:
                pts[x] += 1
    for nm in roster:
        ppg[nm].append(pts[nm])
        gsc[nm].append(gl[nm])

json.dump(dict(roster=roster, sched=sched, goals=goals, pens=pens, ppg=ppg, gsc=gsc),
          open(BUILD / "analysis.json", "w"))
if problems:
    sys.exit(1)
