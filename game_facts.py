"""Helper for writing recaps: prints the key facts for every game with a summary.

    python scripts/game_facts.py          # all games
    python scripts/game_facts.py 14       # just game 14

Look at the lead changes, period scoring, hat tricks and special teams, then write the recap
in data/recaps.json (key is the game number from the schedule).
"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
a = json.loads((ROOT / "build" / "analysis.json").read_text())
goals, pens, sched = a["goals"], a["pens"], a["sched"]
only = int(sys.argv[1]) if len(sys.argv) > 1 else None
PERIOD = {"1st": 0, "2nd": 1, "3rd": 2}


def elapsed(per, t):
    m, s = map(int, t.split(":"))
    return PERIOD[per] * 1200 + 1200 - (m * 60 + s)     # clock counts down within a period


for s in sched:
    if not (s["gid"] and s["res"]) or (only and s["n"] != only):
        continue
    gl = sorted((g for g in goals if g["gid"] == s["gid"]), key=lambda g: elapsed(g["per"], g["time"]))
    us = them = lead = trail = 0
    by_period = {"T": Counter(), "O": Counter()}
    after = {}
    for g in gl:
        if g["side"] == "T":
            us += 1
        else:
            them += 1
        by_period[g["side"]][g["per"]] += 1
        lead, trail = max(lead, us - them), max(trail, them - us)
        after[g["per"]] = f"{us}-{them}"
    scorers = Counter((g["side"], g["scorer"]) for g in gl)
    hats = [f"{n} ({k})" for (side, n), k in scorers.items() if k >= 3]
    pp = {side: sum(1 for g in gl if g["side"] == side and g["tag"] == "PPG") for side in "TO"}
    sh = {side: sum(1 for g in gl if g["side"] == side and g["tag"] == "SHG") for side in "TO"}
    pn = {side: sum(1 for p in pens if p["gid"] == s["gid"] and p["side"] == side) for side in "TO"}
    print(f"Game {s['n']} vs {s['opp']}  {s['res']} {s['gf']}-{s['ga']}")
    print(f"  after periods (us-them): {after}   biggest lead {lead}, biggest deficit {trail}")
    print(f"  goals by period  us {dict(by_period['T'])}  them {dict(by_period['O'])}")
    print(f"  hat tricks: {hats or 'none'}   PP goals us/them {pp['T']}/{pp['O']}   SH goals us/them {sh['T']}/{sh['O']}   penalties us/them {pn['T']}/{pn['O']}")
