#!/usr/bin/env python3
"""Compare IchaCalc talent modules to Chronicle /api/v1/wowdb/talent-trees."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TALENTS_DIR = ROOT / "modules" / "talents"
CHRONICLE_PATH = ROOT / "scripts" / "chronicle-talent-trees.json"

CLASS_MAP = {
    "warrior": "1",
    "paladin": "2",
    "hunter": "3",
    "rogue": "4",
    "priest": "5",
    "shaman": "7",
    "mage": "8",
    "warlock": "9",
    "druid": "11",
}

TREE_NAME_MAP = {
    "warrior": {"arms": "Arms", "fury": "Fury", "protection": "Protection"},
    "paladin": {"holy": "Holy", "protection": "Protection", "retribution": "Retribution"},
    "hunter": {
        "beastmastery": "Beast Mastery",
        "marksmanship": "Marksmanship",
        "survival": "Survival",
    },
    "rogue": {
        "assassination": "Assassination",
        "combat": "Combat",
        "subtlety": "Subtlety",
    },
    "priest": {"discipline": "Discipline", "holy": "Holy", "shadow": "Shadow"},
    "shaman": {
        "elemental": "Elemental",
        "enhancement": "Enhancement",
        "restoration": "Restoration",
    },
    "mage": {"arcane": "Arcane", "fire": "Fire", "frost": "Frost"},
    "warlock": {
        "affliction": "Affliction",
        "demonology": "Demonology",
        "destruction": "Destruction",
    },
    "druid": {
        "balance": "Balance",
        "feralCombat": "Feral Combat",
        "restoration": "Restoration",
    },
}


def parse_talent_file(path: Path):
    text = path.read_text(encoding="utf-8")
    trees = {}
    for tree_match in re.finditer(r"\n\s{2,4}(\w+): \{\n\s+name:", text):
        tree_key = tree_match.group(1)
        start = tree_match.start()
        chunk = text[start:]
        talents_match = re.search(r"talents: \[", chunk)
        if not talents_match:
            continue
        arr_start = start + talents_match.end()
        depth = 1
        i = arr_start
        while i < len(text) and depth:
            if text[i] == "[":
                depth += 1
            elif text[i] == "]":
                depth -= 1
            i += 1
        arr_text = text[arr_start : i - 1]
        talents = []
        for block in re.finditer(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", arr_text):
            b = block.group(0)
            tid = re.search(r"\bid:\s*(\d+)", b)
            if not tid:
                continue
            name = re.search(r'\bname:\s*"([^"]+)"', b)
            ranks = re.search(r"\branks:\s*(\d+)", b)
            row = re.search(r"\brow:\s*(\d+)", b)
            col = re.search(r"\bcol:\s*(\d+)", b)
            req = re.search(r"\brequires:\s*(\d+)", b)
            spell_ids = re.findall(r'"rank\d+":(\d+)', b)
            if not spell_ids:
                spell_ids = re.findall(r"(?<![\w])(\d{4,6})(?![\w])", b)
                # filter to spellIds array only
                m_arr = re.search(r"spellIds:\s*\[([\d,\s]+)\]", b)
                if m_arr:
                    spell_ids = [int(x.strip()) for x in m_arr.group(1).split(",") if x.strip()]
                else:
                    spell_ids = []
            talents.append(
                {
                    "id": int(tid.group(1)),
                    "name": name.group(1) if name else "?",
                    "ranks": int(ranks.group(1)) if ranks else 0,
                    "row": int(row.group(1)) if row else None,
                    "col": int(col.group(1)) if col else None,
                    "requires": int(req.group(1)) if req else None,
                    "spellIds": spell_ids if isinstance(spell_ids, list) else list(spell_ids),
                }
            )
        trees[tree_key] = talents
    return trees


def chronicle_tab(chronicle_classes, class_id, tab_name):
    tabs = chronicle_classes[class_id]["tabs"]
    for tab in tabs:
        if tab["name"].lower() == tab_name.lower():
            return tab
    return None


def compare_tree(class_key, tree_key, icha_talents, ch_tab):
    mismatches = []
    ch_talents = sorted(ch_tab["talents"], key=lambda t: t["tabIndex"])
    if len(icha_talents) != len(ch_talents):
        mismatches.append(
            {
                "type": "count",
                "icha": len(icha_talents),
                "chronicle": len(ch_talents),
            }
        )

    for idx, (icha, ch) in enumerate(zip(icha_talents, ch_talents)):
        ch_row = ch["tierID"] + 1
        ch_col = ch["columnIndex"] + 1
        ch_spells = ch.get("spellRanks") or []
        ch_req = None
        if ch.get("prereqTalent"):
            # prereqTalent uses DBC ids; map to local id by position in tree
            prereq_dbc = ch["prereqTalent"][0]
            for t in ch_talents:
                if t["id"] == prereq_dbc:
                    # find icha id at same tabIndex
                    pi = t["tabIndex"]
                    if pi < len(icha_talents):
                        ch_req = icha_talents[pi]["id"]
                    break
        if icha["name"] != ch["name"]:
            mismatches.append(
                {
                    "type": "name",
                    "index": idx,
                    "icha_id": icha["id"],
                    "icha": icha["name"],
                    "chronicle": ch["name"],
                }
            )
        if icha["ranks"] != ch["maxRank"]:
            mismatches.append(
                {
                    "type": "ranks",
                    "index": idx,
                    "name": icha["name"],
                    "icha": icha["ranks"],
                    "chronicle": ch["maxRank"],
                }
            )
        if icha["row"] != ch_row or icha["col"] != ch_col:
            mismatches.append(
                {
                    "type": "position",
                    "index": idx,
                    "name": icha["name"],
                    "icha": [icha["row"], icha["col"]],
                    "chronicle": [ch_row, ch_col],
                }
            )
        icha_spells = [int(s) for s in icha["spellIds"]]
        if icha_spells != ch_spells:
            mismatches.append(
                {
                    "type": "spellIds",
                    "index": idx,
                    "name": icha["name"],
                    "icha": icha_spells,
                    "chronicle": ch_spells,
                }
            )
        if icha.get("requires") != ch_req:
            if icha.get("requires") or ch_req:
                mismatches.append(
                    {
                        "type": "requires",
                        "index": idx,
                        "name": icha["name"],
                        "icha": icha.get("requires"),
                        "chronicle": ch_req,
                    }
                )

    if len(icha_talents) > len(ch_talents):
        for extra in icha_talents[len(ch_talents) :]:
            mismatches.append({"type": "extra_icha", "name": extra["name"], "id": extra["id"]})
    elif len(ch_talents) > len(icha_talents):
        for extra in ch_talents[len(icha_talents) :]:
            mismatches.append({"type": "missing_icha", "name": extra["name"], "tabIndex": extra["tabIndex"]})

    return mismatches


def main():
    chronicle = json.loads(CHRONICLE_PATH.read_text(encoding="utf-8"))
    classes = chronicle["classes"]
    report = {}

    for class_key, class_id in CLASS_MAP.items():
        path = TALENTS_DIR / f"{class_key}.js"
        icha_trees = parse_talent_file(path)
        class_report = {"match": True, "trees": {}}
        for tree_key, tab_name in TREE_NAME_MAP[class_key].items():
            icha = icha_trees.get(tree_key, [])
            ch_tab = chronicle_tab(classes, class_id, tab_name)
            if not ch_tab:
                class_report["trees"][tree_key] = {"error": "tab not found"}
                class_report["match"] = False
                continue
            mm = compare_tree(class_key, tree_key, icha, ch_tab)
            class_report["trees"][tree_key] = {
                "icha_count": len(icha),
                "chronicle_count": len(ch_tab["talents"]),
                "mismatch_count": len(mm),
                "mismatches": mm[:30],
            }
            if mm:
                class_report["match"] = False
        report[class_key] = class_report

    out = ROOT / "scripts" / "talent-audit-mismatches.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: {"match": v["match"], "trees": {tk: {"icha": tr["icha_count"], "chronicle": tr["chronicle_count"], "mismatches": tr["mismatch_count"]} for tk, tr in v["trees"].items()}} for k, v in report.items()}, indent=2))


if __name__ == "__main__":
    main()
