#!/usr/bin/env python3
"""
One-off export: scrape Turtle DB for every boss in modules/tank/raidDefinitions.js
and write modules/shaman/data/dpsRaidBossStats.json (same shape as DPS sim expects).

Armor, resistances, swing speed, and **faction** (creature tag) come from the same
NPC pages as live `/bosses/scrape` — see `scrape_bosses.parse_npc_faction_tag_from_turtle_html`.
When the Faction: link is a reputation name, substring heuristics map to dragonkin /
humanoid / beast / etc.; remaining edge cases can be set in
`scripts/dps-boss-faction-overrides.json` (npc id string -> tag).

**iconUrl:** Non-empty `iconUrl` values already in `dpsRaidBossStats.json` are copied onto
the new scrape output per NPC id so manual portrait URLs are not wiped on regeneration.

Requires: requests, beautifulsoup4 (same as scrape_bosses.py / server.py).
Run from repo root: python scripts/export-dps-raid-boss-stats.py
Or: npm run gen:dps-boss-stats
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

# Repo root (parent of scripts/)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
OUT_PATH = os.path.join(REPO_ROOT, "modules", "shaman", "data", "dpsRaidBossStats.json")
FACTION_OVERRIDE_PATH = os.path.join(REPO_ROOT, "scripts", "dps-boss-faction-overrides.json")

sys.path.insert(0, REPO_ROOT)

from scrape_bosses import get_boss_page, parse_boss_damage  # noqa: E402
from creature_attack_speeds import get_creature_attack_speed  # noqa: E402


def load_faction_overrides() -> dict[str, str]:
    try:
        with open(FACTION_OVERRIDE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except OSError:
        return {}


def apply_faction_override(npc_id: int, row: dict, overrides: dict) -> None:
    oid = str(npc_id)
    raw = overrides.get(oid)
    if raw is None or str(raw).strip() == "":
        return
    row["faction"] = str(raw).strip().lower().replace(" ", "_")


def load_previous_boss_json() -> dict[str, dict]:
    """Existing file on disk (before this run overwrites it). Used to preserve hand-edited iconUrl."""
    try:
        with open(OUT_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def merge_preserved_icon_urls(by_id: dict[str, dict], previous: dict[str, dict]) -> None:
    """Keep non-empty iconUrl from previous JSON per npc id string key."""
    for sid, row in by_id.items():
        old = previous.get(sid)
        if not isinstance(old, dict):
            continue
        raw = old.get("iconUrl")
        if isinstance(raw, str) and raw.strip():
            row["iconUrl"] = raw.strip()


def load_raid_bosses_via_node() -> list[dict]:
    """Parse raidDefinitions.js using Node (single source of truth)."""
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


def row_for_npc(npc_id: int, fallback_name: str) -> dict:
    sid = str(npc_id)
    html = get_boss_page(sid)
    if not html:
        raise RuntimeError(f"No HTML for npc {npc_id}")

    boss_data = parse_boss_damage(html)
    name = (boss_data.get("name") or "").strip() or fallback_name
    level = boss_data.get("level")
    if level is None:
        level = 63

    armor = boss_data.get("armor")
    if armor is None:
        armor = 3731

    def resist(key: str) -> int:
        v = boss_data.get(key)
        return int(v) if v is not None else 0

    attack_speed = get_creature_attack_speed(npc_id)

    faction = (boss_data.get("faction") or "unknown").strip().lower().replace(" ", "_")
    if faction == "":
        faction = "unknown"

    return {
        "name": name,
        "level": int(level),
        "armor": int(armor),
        "attackSpeed": float(attack_speed),
        "resistance_nature": resist("resistance_nature"),
        "resistance_fire": resist("resistance_fire"),
        "resistance_frost": resist("resistance_frost"),
        "resistance_shadow": resist("resistance_shadow"),
        "resistance_arcane": resist("resistance_arcane"),
        "faction": faction,
        "iconUrl": "",
        "immune_physical": False,
        "immune_nature": False,
        "immune_fire": False,
        "immune_frost": False,
        "immune_shadow": False,
        "immune_arcane": False,
        "immune_holy": False,
    }


def main() -> int:
    bosses = load_raid_bosses_via_node()
    overrides = load_faction_overrides()
    previous_rows = load_previous_boss_json()
    by_id: dict[str, dict] = {}
    delay = float(os.environ.get("BOSS_SCRAPE_DELAY", "0.35"))

    for i, b in enumerate(bosses):
        npc_id = int(b["npcId"])
        name = str(b["name"])
        print(f"[{i + 1}/{len(bosses)}] Scraping {name} ({npc_id})...")
        try:
            row = row_for_npc(npc_id, name)
            apply_faction_override(npc_id, row, overrides)
            by_id[str(npc_id)] = row
        except Exception as e:
            print(f"  ERROR {npc_id} {name}: {e}", file=sys.stderr)
            row_err = {
                "name": name,
                "level": 63,
                "armor": 3731,
                "attackSpeed": float(get_creature_attack_speed(npc_id)),
                "faction": "unknown",
                "iconUrl": "",
                "immune_physical": False,
                "immune_nature": False,
                "immune_fire": False,
                "immune_frost": False,
                "immune_shadow": False,
                "immune_arcane": False,
                "immune_holy": False,
                "resistance_nature": 0,
                "resistance_fire": 0,
                "resistance_frost": 0,
                "resistance_shadow": 0,
                "resistance_arcane": 0,
            }
            apply_faction_override(npc_id, row_err, overrides)
            by_id[str(npc_id)] = row_err
        if i < len(bosses) - 1:
            time.sleep(delay)

    merge_preserved_icon_urls(by_id, previous_rows)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(by_id, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Wrote {len(by_id)} entries to {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
