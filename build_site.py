"""Step 3: embed the data into the page template.

Reads  src/template.html, build/site-data.json
Writes docs/index.html   (docs/ is what GitHub Pages serves)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
template = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
data = (ROOT / "build" / "site-data.json").read_text(encoding="utf-8").replace("<", "\\u003c")
assert "__DATA__" in template, "template.html lost its __DATA__ placeholder"
out = ROOT / "docs" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(template.replace("__DATA__", data), encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
