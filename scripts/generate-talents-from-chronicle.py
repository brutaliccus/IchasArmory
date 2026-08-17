#!/usr/bin/env python3
"""Regenerate modules/talents/*.js from Chronicle /api/v1/wowdb/talent-trees."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TALENTS_DIR = ROOT / "modules" / "talents"
CHRONICLE_PATH = ROOT / "scripts" / "chronicle-talent-trees.json"
SPELLS_PATH = ROOT / "assets" / "spells.json"

CLASS_FILES = {
    "warrior": ("1", "warriorTalents"),
    "paladin": ("2", "paladinTalents"),
    "hunter": ("3", "hunterTalents"),
    "rogue": ("4", "rogueTalents"),
    "priest": ("5", "priestTalents"),
    "shaman": ("7", "shamanTalents"),
    "mage": ("8", "mageTalents"),
    "warlock": ("9", "warlockTalents"),
    "druid": ("11", "druidTalents"),
}

TREE_KEYS = {
    "warrior": ["arms", "fury", "protection"],
    "paladin": ["holy", "protection", "retribution"],
    "hunter": ["beastmastery", "marksmanship", "survival"],
    "rogue": ["assassination", "combat", "subtlety"],
    "priest": ["discipline", "holy", "shadow"],
    "shaman": ["elemental", "enhancement", "restoration"],
    "mage": ["arcane", "fire", "frost"],
    "warlock": ["affliction", "demonology", "destruction"],
    "druid": ["balance", "feralCombat", "restoration"],
}

COMPACT_FORMAT = {"hunter", "mage", "priest", "rogue", "warlock"}


def load_spells():
    if not SPELLS_PATH.exists():
        return {}
    data = json.loads(SPELLS_PATH.read_text(encoding="utf-8"))
    by_id = {}
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, dict) and "id" in v:
                by_id[int(v["id"])] = v
            elif k.isdigit() and isinstance(v, dict):
                by_id[int(k)] = v
    elif isinstance(data, list):
        for v in data:
            if isinstance(v, dict) and "id" in v:
                by_id[int(v["id"])] = v
    return by_id


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text).strip()


def extract_talent_objects(arr_text: str) -> list[dict]:
    talents = []
    pos = 0
    while pos < len(arr_text):
        while pos < len(arr_text) and arr_text[pos] != "{":
            pos += 1
        if pos >= len(arr_text):
            break
        depth = 0
        j = pos
        in_str = False
        esc = False
        while j < len(arr_text):
            c = arr_text[j]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
            else:
                if c == '"':
                    in_str = True
                elif c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        break
            j += 1
        block = arr_text[pos : j + 1]
        tid = re.search(r"\bid:\s*(\d+)", block)
        name = re.search(r'\bname:\s*"([^"]+)"', block)
        if tid and name:
            talents.append({"id": int(tid.group(1)), "name": name.group(1), "raw": block})
        pos = j + 1
    return talents


def parse_existing_file(path: Path):
    text = path.read_text(encoding="utf-8")
    trees: dict[str, dict] = {}
    for tree_match in re.finditer(r"\n\s{2,4}(\w+): \{\n\s+name:", text):
        tree_key = tree_match.group(1)
        start = tree_match.start()
        chunk = text[start:]
        header = re.search(r'name: "([^"]+)"', chunk)
        icon = re.search(r'icon: "([^"]+)"', chunk)
        talents_match = re.search(r"talents: \[", chunk)
        if not talents_match:
            continue
        arr_start = start + talents_match.end()
        depth = 1
        i = arr_start
        in_str = False
        esc = False
        while i < len(text) and depth:
            c = text[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
            else:
                if c == '"':
                    in_str = True
                elif c == "[":
                    depth += 1
                elif c == "]":
                    depth -= 1
            i += 1
        arr_text = text[arr_start : i - 1]
        talents = extract_talent_objects(arr_text)
        trees[tree_key] = {
            "treeName": header.group(1) if header else tree_key,
            "treeIcon": icon.group(1) if icon else "",
            "byName": {t["name"]: t for t in talents},
            "byId": {t["id"]: t for t in talents},
        }
    return text, trees


def assign_local_ids(ch_talents, existing_by_name, existing_ids):
    assigned = []
    used = set(existing_ids)
    next_id = max(existing_ids, default=0) + 1

    for ch in ch_talents:
        ex = existing_by_name.get(ch["name"])
        if ex:
            local_id = ex["id"]
        else:
            local_id = next_id
            while local_id in used:
                local_id += 1
            next_id = local_id + 1
        used.add(local_id)
        assigned.append((local_id, ch, ex))

    # Ensure sort order matches tabIndex order
    for i in range(len(assigned) - 1):
        if assigned[i][0] >= assigned[i + 1][0]:
            # bump later id
            new_id = assigned[i][0] + 1
            while new_id in used:
                new_id += 1
            old = assigned[i + 1][0]
            used.discard(old)
            used.add(new_id)
            assigned[i + 1] = (new_id, assigned[i + 1][1], assigned[i + 1][2])

    return assigned


def dbc_to_local_id(prereq_dbc, ch_talents, id_map):
    for t in ch_talents:
        if t["id"] == prereq_dbc:
            return id_map.get(t["tabIndex"])
    return None


def icon_from_texture(tex: str) -> str:
    return tex.lower().replace("\\", "/")


def spell_ids_obj(spells):
    if len(spells) == 1:
        return f'spellIds: {{"rank1":{spells[0]}}},'
    parts = ", ".join(f'"rank{i+1}":{s}' for i, s in enumerate(spells))
    return f"spellIds: {{{parts}}},"


def spell_ids_array(spells):
    return "spellIds: [\n                    " + ",\n                    ".join(str(s) for s in spells) + "\n                ],"


def fallback_description(name: str, spells_by_id, spell_ranks):
    sid = spell_ranks[0] if spell_ranks else None
    if sid and sid in spells_by_id:
        tip = strip_html(spells_by_id[sid].get("tooltip", "") or spells_by_id[sid].get("tooltip_html", ""))
        if tip:
            return tip
    return f"{name}."


def emit_talent_compact(local_id, ch, ex, requires, tree_idx, spells_by_id):
    icon = icon_from_texture(ch.get("iconTexture", ""))
    if ex:
        ex_raw = ex["raw"]
        ex_icon = re.search(r'icon: "([^"]+)"', ex_raw)
        if ex_icon:
            icon = ex_icon.group(1)
        desc_match = re.search(r"description: (\[[\s\S]*?\]|\"(?:\\.|[^\"\\])*\"),?\n\s+spellIds:", ex_raw)
        if desc_match:
            desc = desc_match.group(1)
        else:
            desc = json.dumps(fallback_description(ch["name"], spells_by_id, ch["spellRanks"]))
    else:
        desc = json.dumps(fallback_description(ch["name"], spells_by_id, ch["spellRanks"]))

    req_line = f"\n        requires: {requires}," if requires is not None else ""
    return f"""      {{
        id: {local_id},
        name: {json.dumps(ch['name'])},
        icon: {json.dumps(icon)},
        ranks: {ch['maxRank']},
        row: {ch['tierID'] + 1},
        col: {ch['columnIndex'] + 1},{req_line}
        description: {desc},
        {spell_ids_obj(ch['spellRanks'])}
      }}"""


def emit_talent_extended(local_id, ch, ex, requires, spells_by_id):
    icon = icon_from_texture(ch.get("iconTexture", ""))
    rank_descs = []
    full_desc = fallback_description(ch["name"], spells_by_id, ch["spellRanks"])
    if ex:
        ex_raw = ex["raw"]
        ex_icon = re.search(r'icon: "([^"]+)"', ex_raw)
        if ex_icon:
            icon = ex_icon.group(1)
        rd = re.search(r"rankDescriptions: \[([\s\S]*?)\]", ex_raw)
        if rd:
            rank_descs = re.findall(r'"((?:\\.|[^"\\])*)"', rd.group(1))
        fd = re.search(r'fullDescription: "((?:\\.|[^"\\])*)"', ex_raw)
        if fd:
            full_desc = fd.group(1)
        desc_match = re.search(r'description: "((?:\\.|[^"\\])*)"', ex_raw)
        base_desc = desc_match.group(1) if desc_match else full_desc
    else:
        base_desc = full_desc
        rank_descs = [full_desc] * ch["maxRank"]

    while len(rank_descs) < ch["maxRank"]:
        rank_descs.append(full_desc)
    rank_descs = rank_descs[: ch["maxRank"]]

    req_line = f"\n                requires: {requires}," if requires is not None else ""
    rank_lines = ",\n                    ".join(json.dumps(d) for d in rank_descs)
    return f"""            {{
                id: {local_id},
                name: {json.dumps(ch['name'])},
                icon: {json.dumps(icon)},
                ranks: {ch['maxRank']},
                row: {ch['tierID'] + 1},
                col: {ch['columnIndex'] + 1},{req_line}
                description: {json.dumps(base_desc)},
                
                fullDescription: {json.dumps(full_desc)},
                
                {spell_ids_array(ch['spellRanks'])}
                rankDescriptions: [
                    {rank_lines}
                ]
            }}"""


def generate_class(class_key, class_id, export_name, chronicle_classes, spells_by_id, skip_if_unchanged=True):
    src = TALENTS_DIR / f"{class_key}.js"
    _, existing = parse_existing_file(src)
    compact = class_key in COMPACT_FORMAT
    lines = [f"// {class_key.title()} talents for Turtle WoW", f"export const {export_name} = {{"]

    changed = False
    for tree_key in TREE_KEYS[class_key]:
        tab_name_map = {k: None for k in TREE_KEYS[class_key]}
        # find chronicle tab by name from existing tree header
        ex_tree = existing.get(tree_key, {})
        tree_name = ex_tree.get("treeName", tree_key)
        tree_icon = ex_tree.get("treeIcon", "")

        ch_tab = None
        for tab in chronicle_classes[class_id]["tabs"]:
            if tab["name"].lower() == tree_name.lower():
                ch_tab = tab
                break
        if not ch_tab:
            # fallback by order
            idx = TREE_KEYS[class_key].index(tree_key)
            ch_tab = chronicle_classes[class_id]["tabs"][idx]
            tree_name = ch_tab["name"]
            tree_icon = icon_from_texture(ch_tab.get("iconTexture", tree_icon))

        ch_talents = sorted(ch_tab["talents"], key=lambda t: t["tabIndex"])
        ex_by_name = ex_tree.get("byName", {})
        ex_ids = list(ex_tree.get("byId", {}).keys())
        assigned = assign_local_ids(ch_talents, ex_by_name, ex_ids)
        id_by_tab = {ch["tabIndex"]: lid for lid, ch, _ in assigned}

        if compact:
            indent_tree = "  "
            indent_inner = "    "
        else:
            indent_tree = "    "
            indent_inner = "        "

        lines.append(f"{indent_tree}{tree_key}: {{")
        lines.append(f'{indent_inner}name: {json.dumps(tree_name)},')
        lines.append(f'{indent_inner}icon: {json.dumps(tree_icon)},')
        lines.append(f"{indent_inner}talents: [")

        talent_blocks = []
        for local_id, ch, ex in assigned:
            requires = None
            if ch.get("prereqTalent"):
                requires = dbc_to_local_id(ch["prereqTalent"][0], ch_talents, id_by_tab)
            if compact:
                talent_blocks.append(emit_talent_compact(local_id, ch, ex, requires, TREE_KEYS[class_key].index(tree_key), spells_by_id))
            else:
                talent_blocks.append(emit_talent_extended(local_id, ch, ex, requires, spells_by_id))
            if not ex or ex["name"] != ch["name"]:
                changed = True

        lines.append(",\n".join(talent_blocks))
        lines.append(f"{indent_inner}],")
        lines.append(f"{indent_tree}}},")

    lines.append("};")
    lines.append("")
    new_text = "\n".join(lines)

    if skip_if_unchanged and class_key in {"rogue", "mage"}:
        return False, new_text

    old_text = src.read_text(encoding="utf-8")
    if new_text != old_text:
        src.write_text(new_text, encoding="utf-8")
        return True, new_text
    return False, new_text


def main():
    chronicle = json.loads(CHRONICLE_PATH.read_text(encoding="utf-8"))
    spells_by_id = load_spells()
    updated = []
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None
    for class_key, (class_id, export_name) in CLASS_FILES.items():
        if only and class_key not in only:
            continue
        if class_key in {"rogue", "mage"}:
            continue
        did, _ = generate_class(class_key, class_id, export_name, chronicle["classes"], spells_by_id, skip_if_unchanged=False)
        if did:
            updated.append(class_key)
    print("Updated:", ", ".join(updated) or "(none)")


if __name__ == "__main__":
    import sys
    main()
