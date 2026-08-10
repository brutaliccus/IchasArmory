#!/usr/bin/env python3
"""
Set modules/shaman/data/dpsRaidBossStats.json iconUrl to ZAM encounter-journal art when available:
https://wow.zamimg.com/images/wow/journal/ui-ej-boss-{slug}.png

Run from repo root: python scripts/apply-zam-ej-icons-to-dps-boss-json.py
"""
from __future__ import annotations

import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
JSON_PATH = os.path.join(REPO_ROOT, "modules", "shaman", "data", "dpsRaidBossStats.json")

ssl._create_default_https_context = ssl._create_unverified_context
BASE = "https://wow.zamimg.com/images/wow/journal/ui-ej-boss-{}.png"

# Slugs that differ from slugify(boss name) or shared journal art.
# - AQ bug trio (Yauj / Vem / Kri): shared Buru the Gorger EJ art (same as npc 15370).
# - The Four Horsemen (canonical 16062 / Mograine stats): ui-ej-boss-four-horseman.png
SLUG_TRY_FIRST: dict[str, list[str]] = {
    "15276": ["twin-emperors"],
    "15275": ["twin-emperors"],
    "15543": ["buru-the-gorger"],
    "15544": ["buru-the-gorger"],
    "15511": ["buru-the-gorger"],
    "16062": ["four-horseman"],
    "57642": ["emperor-thaurissan", "sorcerer-thane-thaurissan"],
    "11380": ["jindo-the-godbreaker", "jindo-the-hexxer"],
    # Classic ZG / Hakkar: no ui-ej-boss-{name} on ZAM — thematic stand-ins (HTTP-checked).
    "14517": ["hex-lord-malacrass"],
    "14510": ["maexxna"],
    "14509": ["daakara"],
    "14515": ["high-priestess-kilnara"],
    "14834": ["hakar", "lady-vashj"],
    "14988": ["king-dred"],
    "15114": ["ghazan", "gahzrilla", "hydross-the-unstable"],
    # Turtle / Emerald / Karazhan crypts: no exact EJ file — stand-ins.
    "60747": ["valithria-dreamwalker"],
    # Solnius: large green dragonflight portrait (curated: Shade of Eranikus EJ art).
    "60748": ["shade-of-eranikus", "dragons-of-nightmare", "dresaron"],
    "61221": ["maexxna"],
    "61224": ["magtheridon"],
    "61223": ["baron-silverlaine"],
    "61222": ["prince-keleseth"],
    "61939": ["lord-godfrey"],
    "61946": ["kalecgos", "broodlord-lashlayer", "general-drakkisath"],
    "61958": ["shade-of-aran"],
    "59967": ["the-black-knight"],
    "59981": ["lord-jaraxxus"],
    "59961": ["ozruk", "krystallus", "princess-theradras"],
    "59991": ["supremelordkazzak"],
}

# Turtle-only / no ZAM journal: root-relative paths (Vite copies ./assets → /assets/…).
LOCAL_ICON_URL: dict[str, str] = {
    "52145": "/assets/images/incindis.png",
}


def slugify(name: str) -> str:
    s = name.lower().replace("'", "").replace("\u2019", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def url_ok(url: str) -> bool:
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=25) as r:
            if r.status == 200:
                return True
    except urllib.error.HTTPError:
        pass
    except Exception:
        pass
    try:
        req = urllib.request.Request(url)
        req.add_header("Range", "bytes=0-0")
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status in (200, 206)
    except Exception:
        return False


def load_bosses():
    code = r"""
import { raidDefinitions } from './modules/tank/raidDefinitions.js';
const rows = [];
for (const r of Object.values(raidDefinitions)) {
  for (const b of r.bosses) rows.push({ npcId: b.npcId, name: b.name });
}
console.log(JSON.stringify(rows));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", code],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout.strip())


def pick_slug(npc_id: str, name: str) -> str | None:
    candidates: list[str] = []
    if npc_id in SLUG_TRY_FIRST:
        candidates.extend(SLUG_TRY_FIRST[npc_id])
    candidates.append(slugify(name))
    seen: set[str] = set()
    for c in candidates:
        if not c or c in seen:
            continue
        seen.add(c)
        if url_ok(BASE.format(c)):
            return c
    return None


def main() -> int:
    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        print("Invalid JSON shape", file=sys.stderr)
        return 1

    bosses = load_bosses()
    set_count = 0
    clear_count = 0
    for b in bosses:
        sid = str(b["npcId"])
        name = b["name"]
        row = data.get(sid)
        if not isinstance(row, dict):
            continue
        if sid in LOCAL_ICON_URL:
            row["iconUrl"] = LOCAL_ICON_URL[sid]
            set_count += 1
            print(f"LOCAL {sid} {name} -> {LOCAL_ICON_URL[sid]}")
            continue
        slug = pick_slug(sid, name)
        cur = (row.get("iconUrl") or "").strip()
        if slug:
            url = BASE.format(slug)
            row["iconUrl"] = url
            set_count += 1
            print(f"OK {sid} {name} -> {slug}")
        else:
            # Keep hand-picked local or non-journal URLs; only clear stale ZAM journal links.
            if cur.startswith("https://wow.zamimg.com/images/wow/journal/"):
                row["iconUrl"] = ""
                clear_count += 1
            print(f"-- {sid} {name} (no ZAM EJ asset found)")

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Wrote {JSON_PATH}: {set_count} icon URLs set, {clear_count} cleared (no working URL).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
