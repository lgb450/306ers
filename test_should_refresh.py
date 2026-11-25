import sys, unittest
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from should_refresh import due_games

def utc(s): return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)

SCHED = (
    "13|2026-11-22|8:00 PM|GB|A|Ducks|L|7|10|15968\n"
    "14|2026-11-28|7:30 PM|OP|H|Colts||||15969\n"      # 19:30 MST = 02:30 UTC Nov 29, due 04:30 UTC
    "31|2027-03-14|10:00 PM|SH|A|Blackout||||99\n"     # MDT starts Mar 14 2027: 04:00 UTC Mar 15, due 06:00 UTC
)

class Gate(unittest.TestCase):
    def test_before_due(self):
        self.assertEqual(due_games(SCHED, utc("2026-11-29T04:29:00")), [])
    def test_at_due(self):
        self.assertEqual(due_games(SCHED, utc("2026-11-29T04:30:00")), [14])
    def test_retries_while_result_missing(self):
        self.assertEqual(due_games(SCHED, utc("2026-12-01T12:00:00")), [14])
    def test_gives_up_after_72h(self):
        self.assertEqual(due_games(SCHED, utc("2026-12-02T04:31:00")), [])
    def test_result_present_not_due(self):
        s = SCHED.replace("14|2026-11-28|7:30 PM|OP|H|Colts||||15969", "14|2026-11-28|7:30 PM|OP|H|Colts|W|5|2|15969")
        self.assertEqual(due_games(s, utc("2026-11-29T05:00:00")), [])
    def test_dst_game(self):
        self.assertEqual(due_games(SCHED, utc("2027-03-15T05:59:00")), [])
        self.assertEqual(due_games(SCHED, utc("2027-03-15T06:00:00")), [31])
    def test_empty_and_blank_lines(self):
        self.assertEqual(due_games("\n\n", utc("2026-11-29T05:00:00")), [])

if __name__ == "__main__":
    unittest.main()
