"""Decide whether the scheduled refresh should hit CMHA right now.

A game is "due" when:
  - it has no result yet, and
  - now >= (scheduled start, Calgary time) + 2 hours, and
  - it is less than 72 hours past that point (after that we stop retrying; the daily run still covers it).

Usage (GitHub Action):
  ONLY_IF_GAME_DUE=true python scripts/should_refresh.py   -> writes refresh=true/false to $GITHUB_OUTPUT
If ONLY_IF_GAME_DUE is not 'true' (daily or manual runs) the answer is always true.
NOW=2026-11-29T05:00:00Z overrides the clock, for testing.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Calgary time is hard-coded (UTC-7, UTC-6 in daylight time) rather than read from the machine's tz database,
# so the gate gives the same answer on any runner. DST: second Sunday of March 2:00 -> first Sunday of November 2:00.
def _nth_sunday(year, month, n):
    d = datetime(year, month, 1)
    d += timedelta(days=(6 - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def to_utc(local):
    """Naive Calgary wall-clock time -> aware UTC."""
    start = _nth_sunday(local.year, 3, 2) + timedelta(hours=2)
    end = _nth_sunday(local.year, 11, 1) + timedelta(hours=2)
    offset = 6 if start <= local < end else 7
    return (local + timedelta(hours=offset)).replace(tzinfo=timezone.utc)

DELAY = timedelta(hours=2)
GIVE_UP = timedelta(hours=72)
ROOT = Path(__file__).resolve().parent.parent


def parse_start(date_s, time_s):
    t = datetime.strptime(f"{date_s} {time_s.strip()}", "%Y-%m-%d %I:%M %p")
    return to_utc(t)


def due_games(schedule_text, now):
    due = []
    for line in schedule_text.splitlines():
        f = line.strip().split("|")
        if len(f) < 7 or not f[0].strip():
            continue
        n, date_s, time_s, result = f[0], f[1], f[2], f[6]
        if result.strip():
            continue                      # already has a result
        try:
            ready = parse_start(date_s, time_s) + DELAY
        except ValueError:
            continue
        if ready <= now < ready + GIVE_UP:
            due.append(int(n))
    return due


def main():
    only_if_due = os.environ.get("ONLY_IF_GAME_DUE", "").lower() == "true"
    now_env = os.environ.get("NOW")
    now = datetime.fromisoformat(now_env.replace("Z", "+00:00")) if now_env else datetime.now(timezone.utc)
    if not only_if_due:
        refresh, why = True, "scheduled/manual run, refreshing"
    else:
        due = due_games((ROOT / "data" / "schedule.txt").read_text(encoding="utf-8"), now)
        refresh = bool(due)
        why = f"games due for a result: {due}" if due else "no game is waiting on a result"
    print(f"refresh={'true' if refresh else 'false'}  ({why})")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as fh:
            fh.write(f"refresh={'true' if refresh else 'false'}\n")


if __name__ == "__main__":
    sys.exit(main())
