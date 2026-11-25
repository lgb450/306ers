"""Run the whole build: verify data -> compute -> write docs/index.html.

    python scripts/build.py
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for step in ("analyze.py", "build_data.py", "build_site.py"):
    print(f"--- {step}")
    result = subprocess.run([sys.executable, str(HERE / step)])
    if result.returncode != 0:
        sys.exit(f"{step} failed (exit {result.returncode}). The site was not rebuilt from bad data.")
print("done. Open docs/index.html in a browser.")
