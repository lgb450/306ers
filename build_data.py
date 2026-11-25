"""Step 2: turn the analysis into the single JSON blob the page reads.

Reads  build/analysis.json, data/goalies.txt, data/arenas.json, data/recaps.json
Writes build/site-data.json
"""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA, BUILD = ROOT / "data", ROOT / "build"

a = json.loads((BUILD / "analysis.json").read_text())
roster, sched, goals, pens = a["roster"], a["sched"], a["goals"], a["pens"]
ARENAS = json.loads((DATA / "arenas.json").read_text())
RECAPS = json.loads((DATA / "recaps.json").read_text(encoding="utf-8"))

done_games = [s for s in sched if s["gid"] and s["res"]]
done_ns = [s["n"] for s in done_games]

# goalies (only those who have played)
goalies = []
for line in (DATA / "goalies.txt").read_text().splitlines():
    if not line.strip():
        continue
    n, name, gp, w, l, t, ga, gaa, so = line.split("|")
    if int(gp) > 0:
        goalies.append(dict(name=name, num=int(n), gp=int(gp), w=int(w), l=int(l), t=int(t), ga=int(ga), gaa=float(gaa), so=int(so)))

# ---- players
A1, A2, UG = Counter(), Counter(), Counter()
for g in goals:
    if g["side"] != "T":
        continue
    if not g["a"]:
        UG[g["scorer"]] += 1
    for i, nm in enumerate(g["a"]):
        (A1 if i == 0 else A2)[nm] += 1

players = []
for nm, r in roster.items():
    if r["gp"] == 0 and r["pts"] == 0:
        continue
    v, gs = a["ppg"][nm], a["gsc"][nm]
    streak = 0
    for x in reversed(v):
        if x > 0:
            streak += 1
        else:
            break
    since = 0
    for x in reversed(gs):
        if x == 0:
            since += 1
        else:
            break
    players.append(dict(name=nm, num=r["num"], gp=r["gp"], g=r["g"], a=r["a"], pts=r["pts"], pp=r["pp"], sh=r["sh"], pim=r["pim"],
                        a1=A1[nm], a2=A2[nm], ug=UG[nm], by=v, gby=gs, streak=streak, since=(since if r["g"] else None), last5=sum(v[-5:])))

# ---- assist matrix: passer>scorer -> [primary, secondary]
inv = Counter()
for g in goals:
    if g["side"] != "T":
        continue
    inv[g["scorer"]] += 2
    for x in g["a"]:
        inv[x] += 1
order = [n for n, _ in sorted(inv.items(), key=lambda kv: (-roster[kv[0]]["pts"], kv[0]))]
cells = {}
for g in goals:
    if g["side"] != "T":
        continue
    for i, p in enumerate(g["a"]):
        c = cells.setdefault(p + ">" + g["scorer"], [0, 0])
        c[0 if i == 0 else 1] += 1

trios = Counter()
for g in goals:
    if g["side"] == "T" and len(g["a"]) == 2:
        trios[tuple(sorted([g["scorer"]] + g["a"]))] += 1

# ---- hat tricks, period splits, special teams
hat = {"T": [], "O": []}
for s in done_games:
    c = Counter((g["side"], g["scorer"]) for g in goals if g["gid"] == s["gid"])
    for (side, nm), k in c.items():
        if k >= 3:
            hat[side].append(dict(n=s["n"], name=nm, goals=k, opp=s["opp"]))
per = {"T": Counter(), "O": Counter()}
for g in goals:
    per[g["side"]][g["per"]] += 1
spec = dict(
    ppF=sum(1 for g in goals if g["side"] == "T" and g["tag"] == "PPG"), ppA=sum(1 for g in goals if g["side"] == "O" and g["tag"] == "PPG"),
    shF=sum(1 for g in goals if g["side"] == "T" and g["tag"] == "SHG"), shA=sum(1 for g in goals if g["side"] == "O" and g["tag"] == "SHG"),
    penF=sum(1 for p in pens if p["side"] == "T"), penA=sum(1 for p in pens if p["side"] == "O"))

# ---- games with recaps (missing recap -> plain placeholder so a new game never breaks the build)
games, missing = [], []
for s in done_games:
    gl = [dict(side=g["side"], per=g["per"], time=g["time"], scorer=g["scorer"], a=g["a"], tag=g["tag"]) for g in goals if g["gid"] == s["gid"]]
    pl = [dict(side=p["side"], per=p["per"], time=p["time"], name=p["name"], inf=p["inf"]) for p in pens if p["gid"] == s["gid"]]
    r = RECAPS.get(str(s["n"]))
    if r is None:
        missing.append(s["n"])
        word = "Won" if s["res"] == "W" else "Lost"
        r = dict(head=f"{word} {s['gf']}-{s['ga']} against {s['opp']}", body="Recap not written yet. Add one to data/recaps.json.")
    games.append(dict(n=s["n"], gid=s["gid"], head=r["head"], body=r["body"], goals=gl, pens=pl))

out = dict(sched=sched, arenas=ARENAS, players=players, goalies=goalies, order=order, cells=cells,
           trios=[dict(p=list(k), n=v) for k, v in trios.most_common(8)], hat=hat,
           per={k: dict(v) for k, v in per.items()}, spec=spec, games=games, doneNs=done_ns)
(BUILD / "site-data.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print(f"site data: {len(players)} players, {len(games)} games with summaries")
if missing:
    print("  recaps missing for games:", ", ".join(map(str, missing)))
