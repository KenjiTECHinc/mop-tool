#!/usr/bin/env python3
"""Regenerate the database schema PNGs from the Mermaid blocks in the READMEs.

    python3 scripts/render-db-schema.py

Runs `npx -y @mermaid-js/mermaid-cli@11.12.0` (`mmdc -t dark -s 2`). That
release lays the eight tables out in a near-square grid; newer mmdc builds
stretch the same diagram taller. mmdc is not an npm dependency. Google Chrome
(or Chromium) and Noto Sans CJK TC must be installed so Traditional Chinese
does not render as tofu.

Writes docs/db-schema.png and docs/db-schema.zh-TW.png. The Mermaid source in
each README is rendered as-is.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BACKGROUND = "#1f2020"

MERMAID_CONFIG = {
    "themeVariables": {
        "fontFamily": '"Noto Sans CJK TC", sans-serif',
    },
    "er": {
        "useMaxWidth": False,
        "layoutDirection": "TB",
        "diagramPadding": 12,
    },
}


def find_chrome() -> str:
    override = os.environ.get("CHROME")
    if override:
        return override
    for name in ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit("Could not find Chrome or Chromium. Set CHROME to the executable.")


def extract_mermaid(readme: Path) -> str:
    match = re.search(r"```mermaid\n([\s\S]*?)```", readme.read_text())
    if not match:
        raise SystemExit(f"No mermaid fence in {readme.name}")
    body = match.group(1)
    return body if body.endswith("\n") else body + "\n"


def render(readme: Path, png: Path, work: Path, chrome: str) -> None:
    mmd = work / (png.stem + ".mmd")
    mmd.write_text(extract_mermaid(readme))
    config = work / "mermaid.json"
    puppeteer = work / "puppeteer.json"
    if not config.exists():
        config.write_text(json.dumps(MERMAID_CONFIG))
        puppeteer.write_text(
            json.dumps(
                {
                    "executablePath": chrome,
                    "args": ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
                }
            )
        )
    subprocess.run(
        [
            "npx",
            "-y",
            "@mermaid-js/mermaid-cli@11.12.0",
            "-i",
            str(mmd),
            "-o",
            str(png),
            "-t",
            "dark",
            "-b",
            BACKGROUND,
            "-s",
            "2",
            "-c",
            str(config),
            "-p",
            str(puppeteer),
        ],
        check=True,
    )


def main() -> None:
    chrome = find_chrome()
    DOCS.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="db-schema-") as tmp:
        work = Path(tmp)
        render(ROOT / "README.md", DOCS / "db-schema.png", work, chrome)
        render(ROOT / "README.zh-TW.md", DOCS / "db-schema.zh-TW.png", work, chrome)
    for stale in (DOCS / "db-schema.svg", DOCS / "db-schema.zh-TW.svg"):
        stale.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
