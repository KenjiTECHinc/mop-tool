#!/usr/bin/env python3
"""Redraw the database schema figures from the Mermaid blocks in the READMEs.

GitHub's phone app shows an erDiagram fence as source text, and Mermaid's own
layout is too wide to read when an image is scaled to a phone. This script
renders each entity with @mermaid-js/mermaid-cli and stacks the tables top to
bottom. A relationship between neighbors is drawn on the gap. Every other
relationship is written above the child table in the same notation as the
Mermaid source (`users ||--o{ user_id`), so the long edges do not stretch the
figure sideways.

Outputs (repo root):
  docs/db-schema.svg
  docs/db-schema.png
  docs/db-schema.zh-TW.svg
  docs/db-schema.zh-TW.png

Requires mmdc, Google Chrome, and a Noto Sans CJK font (TC) so Traditional
Chinese does not render as tofu. Example:

  MMDC=/path/to/mmdc CHROME=/usr/bin/google-chrome-stable \\
    python3 scripts/render-db-schema.py

mmdc is not a project dependency. Install it with
`npx --yes @mermaid-js/mermaid-cli` when you need to regenerate the figures.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

PREFERRED_ORDER = [
    "users",
    "sessions",
    "projects",
    "project_members",
    "tickets",
    "comments",
    "audit_log",
    "pending_actions",
]

ENTITY_RE = re.compile(r"^[ \t]*([A-Za-z_][\w]*)[ \t]*\{([^}]*)\}", re.M)
REL_RE = re.compile(
    r'^[ \t]*([A-Za-z_][\w]*)[ \t]+(\|\||\|o|o\{|\|\{)[ \t]*--[ \t]*(\|\||\|o|o\{|\|\{)[ \t]+([A-Za-z_][\w]*)[ \t]*:[ \t]*"([^"]*)"[ \t]*$',
    re.M,
)

# Layout in CSS pixels. The PNG is a Chrome screenshot of this SVG.
PAD = 16
CAPTION_ROW = 28
LINK_GAP = 72
GAP_EMPTY = 28
MARK = 18
FONT = 16

MERMAID_CONFIG = {
    "theme": "base",
    "themeVariables": {
        "fontFamily": '"Noto Sans CJK TC", "Noto Sans CJK SC", sans-serif',
        "fontSize": "18px",
        "darkMode": False,
        "background": "#ffffff",
        "primaryColor": "#eef3fb",
        "primaryTextColor": "#1a1a1a",
        "primaryBorderColor": "#3d4a5c",
        "lineColor": "#243044",
        "secondaryColor": "#ffffff",
        "tertiaryColor": "#ffffff",
        "textColor": "#1a1a1a",
    },
    "er": {
        "useMaxWidth": False,
        "diagramPadding": 8,
        "entityPadding": 12,
        "fontSize": 18,
    },
}


def find_tool(env_name: str, candidates: list[str]) -> str:
    override = os.environ.get(env_name)
    if override:
        return override
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    raise SystemExit(f"Could not find {env_name}. Looked for: {', '.join(candidates)}")


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[16:24]
    return struct.unpack(">II", data)


def xml_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def extract_mermaid(readme: str) -> str:
    match = re.search(r"```mermaid\n([\s\S]*?)```", readme)
    if not match:
        raise SystemExit("No mermaid fence in README")
    body = match.group(1)
    return body if body.endswith("\n") else body + "\n"


def parse_diagram(source: str) -> tuple[list[tuple[str, str]], list[dict]]:
    entities = [(name, body) for name, body in ENTITY_RE.findall(source)]
    if not entities:
        raise SystemExit("No entities in mermaid source")
    rels = []
    for src, left, right, dst, label in REL_RE.findall(source):
        rels.append(
            {
                "src": src,
                "left": left,
                "right": right,
                "dst": dst,
                "label": label,
            }
        )
    if not rels:
        raise SystemExit("No relationships in mermaid source")
    known = {name for name, _ in entities}
    for rel in rels:
        if rel["src"] not in known or rel["dst"] not in known:
            raise SystemExit(f"Relationship references an unknown entity: {rel}")
    return entities, rels


def order_entities(names: list[str]) -> list[str]:
    seen = set(names)
    ordered = [name for name in PREFERRED_ORDER if name in seen]
    ordered.extend(name for name in names if name not in ordered)
    return ordered


def render_entity_svgs(workdir: Path, entities: list[tuple[str, str]], mmdc: str, chrome: str) -> dict[str, dict]:
    config_path = workdir / "mermaid.json"
    puppeteer_path = workdir / "puppeteer.json"
    config_path.write_text(json.dumps(MERMAID_CONFIG))
    puppeteer_path.write_text(
        json.dumps(
            {
                "executablePath": chrome,
                "args": ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
            }
        )
    )
    rendered = {}
    for name, body in entities:
        mmd_path = workdir / f"{name}.mmd"
        svg_path = workdir / f"{name}.svg"
        mmd_path.write_text(f"erDiagram\n  {name} {{{body}}}\n")
        subprocess.run(
            [
                mmdc,
                "-i",
                str(mmd_path),
                "-o",
                str(svg_path),
                "-c",
                str(config_path),
                "-p",
                str(puppeteer_path),
                "-b",
                "white",
                "-s",
                "1",
            ],
            check=True,
        )
        raw = svg_path.read_text()
        if "<script" in raw:
            raise SystemExit(f"Unexpected script in mermaid SVG for {name}")
        element_id = f"ent_{name}"
        raw = raw.replace("my-svg", element_id)
        view = re.search(r'viewBox="([^"]+)"', raw)
        if not view:
            raise SystemExit(f"No viewBox for {name}")
        min_x, min_y, width, height = (float(part) for part in view.group(1).split())
        start = raw.find(">") + 1
        end = raw.rfind("</svg>")
        rendered[name] = {
            "inner": raw[start:end],
            "min_x": min_x,
            "min_y": min_y,
            "w": width,
            "h": height,
            "id": element_id,
        }
    return rendered


def caption(rel: dict) -> str:
    return f'{rel["src"]} {rel["left"]}--{rel["right"]} {rel["label"]}'


def estimate_width(text: str) -> float:
    width = 0.0
    for char in text:
        width += FONT * (1.0 if ord(char) > 0x2E80 else 0.42)
    return width


def layout(order: list[str], rendered: dict[str, dict], rels: list[dict]) -> dict:
    index = {name: i for i, name in enumerate(order)}
    for rel in rels:
        rel["src_i"] = index[rel["src"]]
        rel["dst_i"] = index[rel["dst"]]
        rel["adjacent"] = rel["dst_i"] == rel["src_i"] + 1
        rel["caption"] = caption(rel)

    column_width = max(rendered[name]["w"] for name in order)
    # Captions sit to the right of a center connector, so the column has to
    # be wide enough for half a table plus the longest caption.
    longest = max(estimate_width(rel["caption"]) for rel in rels)
    column_width = max(column_width, (longest + 28) * 2)
    column_left = PAD
    incoming: dict[str, list[dict]] = {name: [] for name in order}
    for rel in rels:
        incoming[rel["dst"]].append(rel)
    for name in order:
        incoming[name].sort(key=lambda rel: (not rel["adjacent"], rel["src_i"], rel["label"]))

    y = float(PAD)
    placed = {}
    for name in order:
        group = incoming[name]
        adjacent = next((rel for rel in group if rel["adjacent"]), None)
        distant = [rel for rel in group if not rel["adjacent"]]
        if name != order[0]:
            if adjacent:
                rows = [adjacent, *distant]
                band = max(LINK_GAP, 12 + len(rows) * CAPTION_ROW)
                adjacent["link_top"] = y
                y += band
                adjacent["link_bot"] = y
                block = len(rows) * CAPTION_ROW
                text_y = adjacent["link_top"] + (band - block) / 2 + CAPTION_ROW / 2
                for slot, rel in enumerate(rows):
                    rel["text_y"] = text_y + slot * CAPTION_ROW
                    rel["beside"] = True
            elif distant:
                y += 6
                for rel in distant:
                    rel["text_y"] = y + CAPTION_ROW / 2
                    rel["beside"] = False
                    y += CAPTION_ROW
                y += 8
            else:
                y += GAP_EMPTY
        box = rendered[name]
        x = column_left + (column_width - box["w"]) / 2
        placed[name] = {"x": x, "y": y, "w": box["w"], "h": box["h"], "cx": x + box["w"] / 2}
        y += box["h"]

    height = y + PAD
    width = column_left + column_width + PAD
    return {"placed": placed, "width": width, "height": height, "column_left": column_left}


def outward_vector(direction: str) -> tuple[float, float]:
    return {"left": (-1, 0), "right": (1, 0), "up": (0, -1), "down": (0, 1)}[direction]


def perpendicular(dx: float, dy: float) -> tuple[float, float]:
    return -dy, dx


def mark_elements(kind: str, x: float, y: float, outward: str) -> str:
    """Crow's-foot mark. (x, y) is the point on the entity border."""
    ox, oy = outward_vector(outward)
    px, py = perpendicular(ox, oy)
    parts: list[str] = []

    def point(along: float, side: float) -> tuple[float, float]:
        return (x + ox * along + px * side, y + oy * along + py * side)

    def line(a: tuple[float, float], b: tuple[float, float]) -> None:
        parts.append(
            f'<line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" />'
        )

    def circle(along: float, radius: float) -> None:
        cx, cy = point(along, 0)
        parts.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{radius}" fill="#ffffff" />')

    # along=0 sits on the entity border. along=MARK is the outer tip, where the line attaches.
    if kind == "||":
        line(point(4, -5), point(4, 5))
        line(point(11, -5), point(11, 5))
    elif kind == "|o":
        line(point(2, -4.5), point(2, 4.5))
        circle(11, 3.5)
    elif kind == "o{":
        foot = point(7, 0)
        line(foot, point(0, -6.5))
        line(foot, point(0, 0))
        line(foot, point(0, 6.5))
        circle(12.2, 3.5)
    elif kind == "|{":
        line(point(2, -4.5), point(2, 4.5))
        foot = point(7, 0)
        line(foot, point(0, -6.5))
        line(foot, point(0, 0))
        line(foot, point(0, 6.5))
    else:
        line(point(2, 0), point(MARK - 2, 0))
    return "".join(parts)


def route_path(rel: dict, placed: dict[str, dict]) -> str:
    src = placed[rel["src"]]
    dst = placed[rel["dst"]]
    x = src["cx"]
    y1 = src["y"] + src["h"] + MARK
    y2 = dst["y"] - MARK
    return f'<path d="M {x:.2f} {y1:.2f} L {x:.2f} {y2:.2f}" />'


def build_svg(order: list[str], rendered: dict[str, dict], rels: list[dict], title: str, description: str) -> str:
    layout_info = layout(order, rendered, rels)
    placed = layout_info["placed"]
    width = layout_info["width"]
    height = layout_info["height"]
    chunks = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{width:.2f}" height="{height:.2f}" viewBox="0 0 {width:.2f} {height:.2f}" '
            f'role="img" style="background-color:#ffffff">'
        ),
        f"<title>{xml_escape(title)}</title>",
        f"<desc>{xml_escape(description)}</desc>",
        f'<rect width="100%" height="100%" fill="#ffffff"/>',
        '<g fill="none" stroke="#243044" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">',
    ]
    for rel in rels:
        if rel["adjacent"]:
            chunks.append(route_path(rel, placed))
    chunks.append("</g>")
    chunks.append('<g fill="none" stroke="#243044" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">')
    for rel in rels:
        if not rel["adjacent"]:
            continue
        src = placed[rel["src"]]
        dst = placed[rel["dst"]]
        chunks.append(mark_elements(rel["left"], src["cx"], src["y"] + src["h"], "down"))
        chunks.append(mark_elements(rel["right"], dst["cx"], dst["y"], "up"))
    chunks.append("</g>")
    for name in order:
        box = placed[name]
        info = rendered[name]
        tx = box["x"] - info["min_x"]
        ty = box["y"] - info["min_y"]
        chunks.append(f'<g id="{info["id"]}" transform="translate({tx:.2f} {ty:.2f})">')
        chunks.append(info["inner"])
        chunks.append("</g>")
    label_style = (
        'font-family="Noto Sans CJK TC, Noto Sans CJK SC, sans-serif" '
        f'font-size="{FONT}" fill="#1a1a1a" stroke="#ffffff" stroke-width="5" dominant-baseline="middle" '
        'paint-order="stroke" stroke-linejoin="round"'
    )
    column_left = layout_info["column_left"]
    for rel in rels:
        if rel["beside"]:
            src = placed[rel["src"]]
            label_x = src["cx"] + 16
        else:
            label_x = column_left
        chunks.append(
            f'<text x="{label_x:.2f}" y="{rel["text_y"]:.2f}" {label_style}>{xml_escape(rel["caption"])}</text>'
        )
    chunks.append("</svg>")
    return "\n".join(chunks)


def screenshot(svg_path: Path, png_path: Path, width: float, height: float, chrome: str, scale: float) -> None:
    svg = svg_path.read_text()
    if svg.startswith("<?xml"):
        svg = svg.split("\n", 1)[1]
    html = (
        "<!doctype html><html><head><meta charset=\"utf-8\">"
        "<style>html,body{margin:0;background:#ffffff}</style></head>"
        f'<body style="width:{width:.0f}px;height:{height:.0f}px">{svg}</body></html>'
    )
    with tempfile.TemporaryDirectory(prefix="db-schema-shot-") as tmp:
        html_path = Path(tmp) / "schema.html"
        html_path.write_text(html)
        subprocess.run(
            [
                chrome,
                "--headless",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--hide-scrollbars",
                "--default-background-color=FFFFFFFF",
                f"--force-device-scale-factor={scale}",
                f"--screenshot={png_path}",
                f"--window-size={max(1, math.ceil(width))},{max(1, math.ceil(height))}",
                html_path.as_uri(),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def choose_scale(width: float, height: float) -> float:
    for scale in (4, 3.5, 3, 2.5, 2):
        if width * scale >= 1600 and height * scale <= 15800:
            return scale
    for scale in (3, 2):
        if height * scale <= 15800:
            return scale
    return 2


def render_readme(readme_path: Path, svg_out: Path, png_out: Path, title: str, description: str, mmdc: str, chrome: str) -> None:
    source = extract_mermaid(readme_path.read_text())
    entities, rels = parse_diagram(source)
    order = order_entities([name for name, _ in entities])
    with tempfile.TemporaryDirectory(prefix="db-schema-") as tmp:
        rendered = render_entity_svgs(Path(tmp), entities, mmdc, chrome)
        svg = build_svg(order, rendered, rels, title, description)
        svg_out.write_text(svg)
        width = float(re.search(r'width="([0-9.]+)"', svg).group(1))
        height = float(re.search(r'height="([0-9.]+)"', svg).group(1))
        scale = choose_scale(width, height)
        screenshot(svg_out, png_out, width, height, chrome, scale)
        pixel_w, pixel_h = png_size(png_out)
        print(f"{png_out.name} {pixel_w}x{pixel_h} scale {scale} bytes {png_out.stat().st_size}")
        print(f"{svg_out.name} {width:.0f}x{height:.0f} css bytes {svg_out.stat().st_size}")


def main() -> None:
    mmdc = find_tool("MMDC", ["mmdc"])
    chrome = find_tool(
        "CHROME",
        ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"],
    )
    DOCS.mkdir(exist_ok=True)
    render_readme(
        ROOT / "README.md",
        DOCS / "db-schema.svg",
        DOCS / "db-schema.png",
        "MOPs SQLite schema",
        "Entity-relationship diagram of users, sessions, projects, project members, tickets, comments, audit_log, and pending_actions.",
        mmdc,
        chrome,
    )
    render_readme(
        ROOT / "README.zh-TW.md",
        DOCS / "db-schema.zh-TW.svg",
        DOCS / "db-schema.zh-TW.png",
        "MOPs SQLite 結構",
        "users、sessions、projects、project_members、tickets、comments、audit_log、pending_actions 的實體關係圖。",
        mmdc,
        chrome,
    )


if __name__ == "__main__":
    main()
