#!/usr/bin/env python3
"""
Boss Scraper - Scrapes boss damage data from database.turtlecraft.gg

Usage:
    python scrape_bosses.py [boss_id]
    python scrape_bosses.py --search [boss_name]  # Search for boss ID by name
    python scrape_bosses.py --list [raid_name]    # List bosses in a raid
    
Bosses are accessed by ID: https://database.turtlecraft.gg/?npc=[ID] (legacy /npc/[ID] paths 404)
"""

import requests
from bs4 import BeautifulSoup
import re
import json
import sys
from urllib.parse import quote, urljoin

BASE_URL = "https://database.turtlecraft.gg"

# Turtle NPC pages show `<div>Faction: <a ...>Label</a></div>` (WoW faction / often aligns with creature family).
# Map recognized labels to canonical `faction` tags in dpsRaidBossStats.json (lowercase snake_case).
_FACTION_LINK_NORMALIZE = {
    "undead": "undead",
    "elemental": "elemental",
    "demon": "demon",
    "aberration": "aberration",
    "dragonkin": "dragonkin",
    "giant": "giant",
    "humanoid": "humanoid",
    "beast": "beast",
    "mechanical": "mechanical",
    "critter": "critter",
    "totem": "totem",
}

# Turtle often shows WoW reputation faction in the Faction: link (not creature type).
# Map substrings of the anchor text to canonical creature tags (longer / more specific first).
_FACTION_ANCHOR_SUBSTRING_TO_CREATURE = (
    ("brood of deathwing", "dragonkin"),
    ("dragonflight", "dragonkin"),
    ("deathwing", "dragonkin"),
    ("armies of c'thun", "aberration"),
    ("silithid", "beast"),
    ("qiraji", "humanoid"),
    ("dark iron", "humanoid"),
    ("dragonmaw", "humanoid"),
    ("gurubashi", "humanoid"),
    ("bloodscalp", "humanoid"),
    ("sandfury", "humanoid"),
    ("witherbark", "humanoid"),
    ("smolderthorn", "humanoid"),
    ("frostmane", "humanoid"),
    ("troll,", "humanoid"),
    ("orc,", "humanoid"),
    ("scourge", "undead"),
)


def parse_npc_faction_tag_from_turtle_html(html):
    """
    Best-effort faction/creature tag from Turtle NPC HTML.
    Unknown or non-matching labels -> 'unknown' (use scripts/dps-boss-faction-overrides.json to curate).
    """
    if not html:
        return "unknown"
    m = re.search(r"<div>\s*Faction:\s*<a[^>]*>([^<]+)</a>", html, re.IGNORECASE)
    if not m:
        return "unknown"
    raw = (m.group(1) or "").strip().lower()
    if raw in _FACTION_LINK_NORMALIZE:
        return _FACTION_LINK_NORMALIZE[raw]
    first = raw.split()[0].rstrip(",").lower()
    if first in _FACTION_LINK_NORMALIZE:
        return _FACTION_LINK_NORMALIZE[first]
    for needle, tag in _FACTION_ANCHOR_SUBSTRING_TO_CREATURE:
        if needle in raw:
            return tag
    return "unknown"


def search_bosses_by_name(query):
    """Search for bosses by name and return list of matches with IDs"""
    # Search URL format: https://database.turtlecraft.gg/?search=ragnaros#npcs
    search_url = f"{BASE_URL}/"
    params = {"search": query}
    
    try:
        response = requests.get(search_url, params=params, timeout=10)
        response.raise_for_status()
        html_content = response.text
        
        results = []
        
        # The NPC data is embedded in JavaScript Listview initialization
        # Look for: new Listview({template:'npc',...data:[{...}]})
        # Find the start of the data array and extract it properly (handling nested brackets)
        npc_data_start = html_content.find("template:'npc'")
        if npc_data_start == -1:
            print("No NPC Listview found in HTML")
        else:
            # Find data: [ after template:'npc'
            data_marker = html_content.find("data:", npc_data_start)
            if data_marker == -1:
                print("No data: field found")
            else:
                # Find the opening [
                bracket_start = html_content.find('[', data_marker)
                if bracket_start == -1:
                    print("No opening bracket found")
                else:
                    # Extract the array content by counting brackets
                    bracket_count = 0
                    bracket_end = bracket_start
                    in_string = False
                    string_char = None
                    
                    for i in range(bracket_start, len(html_content)):
                        char = html_content[i]
                        if char in ['"', "'"] and (i == 0 or html_content[i-1] != '\\'):
                            if not in_string:
                                in_string = True
                                string_char = char
                            elif char == string_char:
                                in_string = False
                                string_char = None
                        elif not in_string:
                            if char == '[':
                                bracket_count += 1
                            elif char == ']':
                                bracket_count -= 1
                                if bracket_count == 0:
                                    bracket_end = i
                                    break
                    
                    npc_data_str = html_content[bracket_start+1:bracket_end]
                    print(f"Found NPC Listview data (length: {len(npc_data_str)})")
                    
                    # Now find all id: patterns in this data string
                    id_pattern = r'id:\s*(\d+)'
                    for id_match in re.finditer(id_pattern, npc_data_str):
                        npc_id = id_match.group(1)
                        id_pos = id_match.start()
                        
                        # Look backwards to find name: field in the same object
                        # Go back up to 200 chars to find the name
                        chunk_start = max(0, id_pos - 200)
                        obj_chunk = npc_data_str[chunk_start:id_pos + 10]
                        
                        # Extract name from this chunk
                        name_match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", obj_chunk)
                        name = name_match.group(1) if name_match else f"NPC {npc_id}"
                        
                        # Extract classification (3 = Boss)
                        class_match = re.search(r"classification:\s*(\d+)", obj_chunk)
                        classification = int(class_match.group(1)) if class_match else 0
                        
                        # Extract level
                        level_match = re.search(r"minlevel:\s*(\d+)", obj_chunk)
                        minlevel = int(level_match.group(1)) if level_match else None
                        
                        # Classification 3 = Boss
                        is_boss = (classification == 3)
                        level_str = str(minlevel) if minlevel else '??'
                        
                        # Build URL directly: ?npc=ID
                        url = f"{BASE_URL}/?npc={npc_id}"
                        
                        results.append({
                            'id': npc_id,
                            'name': name,
                            'url': url,
                            'is_boss': is_boss,
                            'level': level_str,
                            'classification': classification
                        })
                        print(f"  Found: {name} (ID: {npc_id}, Classification: {classification}, Boss: {is_boss})")
        
        print(f"Found {len(results)} NPC results")
        
        # Return all results - let user choose (no boss filtering)
        return results
    except Exception as e:
        print(f"Error searching: {e}")
        import traceback
        traceback.print_exc()
        return []

def get_boss_page(boss_id):
    """Get the boss detail page"""
    # URL format: https://database.turtlecraft.gg/?npc=11502
    url = f"{BASE_URL}/"
    params = {"npc": boss_id}
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"Error fetching boss page: {e}")
        return None

def parse_boss_damage(html):
    """Extract damage range, armor, and resistances from boss page HTML"""
    soup = BeautifulSoup(html, 'html.parser')
    
    boss_data = {
        'name': None,
        'level': None,
        'minDamage': None,
        'maxDamage': None,
        'attackSpeed': None,
        'armor': None,
        'resistance_nature': None,
        'resistance_fire': None,
        'resistance_frost': None,
        'resistance_shadow': None,
        'resistance_arcane': None
    }
    
    # Extract boss name from h1
    name_elem = soup.find('h1')
    if name_elem:
        # Remove " - NPCs" suffix if present
        name_text = name_elem.get_text().strip()
        boss_data['name'] = name_text.split(' - ')[0].strip()
    
    # Look for the "Quick Facts" table
    # The table contains: Level, Damage, etc.
    tables = soup.find_all('table')
    
    for table in tables:
        # Check if this is the Quick Facts table
        table_text = table.get_text()
        
        # Look for damage in the table text
        # Format: "Damage: 2,098.95 - 2,782.5" (with commas as thousands separators)
        # Pattern: Damage: followed by numbers with optional commas and decimals
        damage_match = re.search(r'Damage[:\s]+([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)', table_text, re.IGNORECASE)
        if damage_match:
            # Remove commas and convert to float, then to int
            min_dmg_str = damage_match.group(1).replace(',', '')
            max_dmg_str = damage_match.group(2).replace(',', '')
            boss_data['minDamage'] = int(float(min_dmg_str))
            boss_data['maxDamage'] = int(float(max_dmg_str))
            break
        
        # Also try parsing row by row
        rows = table.find_all('tr')
        for row in rows:
            row_text = row.get_text()
            if 'damage' in row_text.lower():
                # Try to find damage range with commas
                damage_match = re.search(r'([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)', row_text)
                if damage_match:
                    min_dmg_str = damage_match.group(1).replace(',', '')
                    max_dmg_str = damage_match.group(2).replace(',', '')
                    boss_data['minDamage'] = int(float(min_dmg_str))
                    boss_data['maxDamage'] = int(float(max_dmg_str))
                    break
        
        if boss_data['minDamage']:
            break
    
    # If not found in tables, try general page text
    if not boss_data['minDamage']:
        page_text = soup.get_text()
        # Try with commas
        damage_match = re.search(r'Damage[:\s]+([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)', page_text, re.IGNORECASE)
        if damage_match:
            min_dmg_str = damage_match.group(1).replace(',', '')
            max_dmg_str = damage_match.group(2).replace(',', '')
            boss_data['minDamage'] = int(float(min_dmg_str))
            boss_data['maxDamage'] = int(float(max_dmg_str))
    
    # Extract level from table
    page_text = soup.get_text()
    level_match = re.search(r'Level[:\s]+(\d+|\?\?)', page_text, re.IGNORECASE)
    if level_match:
        level_str = level_match.group(1)
        if level_str == '??':
            boss_data['level'] = 63  # ?? bosses are typically level 63
        else:
            boss_data['level'] = int(level_str)
    
    # Extract attack speed if available (might not be in Quick Facts)
    speed_match = re.search(r'Attack\s+Speed[:\s]+([\d,]+\.?\d*)', page_text, re.IGNORECASE)
    if speed_match:
        speed_str = speed_match.group(1).replace(',', '')
        boss_data['attackSpeed'] = float(speed_str)
    else:
        # Default attack speed for bosses is usually 2.0
        boss_data['attackSpeed'] = 2.0
    
    # Extract armor
    # Look for "Armor:" or "ArmorModifier:" in tables or page text
    armor_patterns = [
        r'Armor[:\s]+([\d,]+)',
        r'ArmorModifier[:\s]+([\d,]+)',
        r'armor_modifier[:\s]+([\d,]+)',
    ]
    for pattern in armor_patterns:
        armor_match = re.search(pattern, page_text, re.IGNORECASE)
        if armor_match:
            armor_str = armor_match.group(1).replace(',', '')
            boss_data['armor'] = int(armor_str)
            break
    
    # Extract resistances (Nature, Fire, Frost, Shadow, Arcane)
    # Look for "Nature Resistance:", "Resist Nature:", "ResistNature:", etc.
    resistance_patterns = {
        'resistance_nature': [
            r'Nature\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Nature[:\s]+([\d,]+)',
            r'ResistNature[:\s]+([\d,]+)',
            r'resistance_nature[:\s]+([\d,]+)',
            r'nature_resist[:\s]+([\d,]+)',
            r'Nature\s+Resist[:\s]+([\d,]+)',
        ],
        'resistance_fire': [
            r'Fire\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Fire[:\s]+([\d,]+)',
            r'ResistFire[:\s]+([\d,]+)',
            r'resistance_fire[:\s]+([\d,]+)',
            r'fire_resist[:\s]+([\d,]+)',
            r'Fire\s+Resist[:\s]+([\d,]+)',
        ],
        'resistance_frost': [
            r'Frost\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Frost[:\s]+([\d,]+)',
            r'ResistFrost[:\s]+([\d,]+)',
            r'resistance_frost[:\s]+([\d,]+)',
            r'frost_resist[:\s]+([\d,]+)',
            r'Frost\s+Resist[:\s]+([\d,]+)',
        ],
        'resistance_shadow': [
            r'Shadow\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Shadow[:\s]+([\d,]+)',
            r'ResistShadow[:\s]+([\d,]+)',
            r'resistance_shadow[:\s]+([\d,]+)',
            r'shadow_resist[:\s]+([\d,]+)',
            r'Shadow\s+Resist[:\s]+([\d,]+)',
        ],
        'resistance_arcane': [
            r'Arcane\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Arcane[:\s]+([\d,]+)',
            r'ResistArcane[:\s]+([\d,]+)',
            r'resistance_arcane[:\s]+([\d,]+)',
            r'arcane_resist[:\s]+([\d,]+)',
            r'Arcane\s+Resist[:\s]+([\d,]+)',
        ],
    }
    
    for resistance_key, patterns in resistance_patterns.items():
        for pattern in patterns:
            resist_match = re.search(pattern, page_text, re.IGNORECASE)
            if resist_match:
                resist_str = resist_match.group(1).replace(',', '')
                boss_data[resistance_key] = int(resist_str)
                break

    boss_data["faction"] = parse_npc_faction_tag_from_turtle_html(html)
    
    return boss_data

def scrape_boss(boss_id):
    """Scrape a single boss by ID"""
    if not boss_id or not boss_id.isdigit():
        print(f"Invalid boss ID: {boss_id}")
        return None
    
    html = get_boss_page(boss_id)
    if not html:
        return None
    
    boss_data = parse_boss_damage(html)
    
    # Use the numeric ID as the key, but create a clean slug for the id field
    if boss_data['name']:
        boss_data['id'] = re.sub(r'[^a-z0-9]+', '', boss_data['name'].lower())
    else:
        boss_data['id'] = f"boss_{boss_id}"
    
    # Store the original NPC ID
    npc_id = int(boss_id)
    boss_data['npcId'] = npc_id
    
    # Always use database attack speed (authoritative source)
    try:
        from creature_attack_speeds import get_creature_attack_speed
        database_attack_speed = get_creature_attack_speed(npc_id)
        scraped_attack_speed = boss_data.get('attackSpeed', 2.0)
        boss_data['attackSpeed'] = database_attack_speed
        if database_attack_speed != scraped_attack_speed:
            print(f"[BOSS SCRAPE] NPC {npc_id}: Using database attack speed {database_attack_speed}s (scraped: {scraped_attack_speed}s)")
    except ImportError:
        # Fallback if module not available (e.g., when running standalone)
        print(f"[BOSS SCRAPE] Warning: creature_attack_speeds module not found, using scraped/default attack speed")
    
    return boss_data

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python scrape_bosses.py [boss_id]              # Scrape boss by ID")
        print("  python scrape_bosses.py --search [boss_name]   # Search for boss ID by name")
        print("  python scrape_bosses.py --export [boss_id]     # Export as JSON for tankSimulator.js")
        print("\nExample:")
        print("  python scrape_bosses.py 11502                  # Scrape boss ID 11502")
        print("  python scrape_bosses.py --search Ragnaros      # Find Ragnaros ID")
        return
    
    if sys.argv[1] == '--search':
        if len(sys.argv) < 3:
            print("Please provide a boss name to search for")
            return
        
        boss_name = ' '.join(sys.argv[2:])
        print(f"Searching for: {boss_name}")
        results = search_bosses_by_name(boss_name)
        
        if results:
            # Filter to show bosses first
            bosses = [r for r in results if r.get('is_boss')]
            others = [r for r in results if not r.get('is_boss')]
            
            if bosses:
                print(f"\nFound {len(bosses)} boss(es) (level ??):")
                for i, result in enumerate(bosses, 1):
                    print(f"  {i}. {result['name']} (ID: {result['id']})")
                    print(f"     URL: {result['url']}")
            
            if others:
                print(f"\nFound {len(others)} other NPC(s):")
                for i, result in enumerate(others, 1):
                    print(f"  {i}. {result['name']} (ID: {result['id']})")
            
            if bosses:
                print(f"\n[OK] Use this ID to scrape: python scrape_bosses.py {bosses[0]['id']}")
            elif results:
                print(f"\n[WARNING] No level ?? bosses found. Use ID to scrape: python scrape_bosses.py {results[0]['id']}")
        else:
            print("No NPCs found")
    
    elif sys.argv[1] == '--export':
        if len(sys.argv) < 3:
            print("Please provide a boss ID to export")
            return
        
        boss_id = sys.argv[2]
        boss_data = scrape_boss(boss_id)
        if boss_data:
            # Format for tankSimulator.js
            js_format = {
                'id': boss_data['id'],
                'name': boss_data['name'],
                'level': boss_data.get('level', 63),
                'minDamage': boss_data.get('minDamage', 0),
                'maxDamage': boss_data.get('maxDamage', 0),
                'attackSpeed': boss_data.get('attackSpeed', 2.0)
            }
            print("\n// Add this to bossDatabase array in tankSimulator.js:")
            print(json.dumps(js_format, indent=4))
        else:
            print("Failed to scrape boss data")
    
    else:
        # Assume it's a boss ID
        boss_id = sys.argv[1]
        print(f"Scraping boss ID: {boss_id}")
        boss_data = scrape_boss(boss_id)
        if boss_data:
            print("\nBoss Data:")
            print(json.dumps(boss_data, indent=2))
            
            if boss_data.get('minDamage') and boss_data.get('maxDamage'):
                print("\n[OK] Damage range found!")
                print(f"   Use: python scrape_bosses.py --export {boss_id}")
            else:
                print("\n[WARNING] Damage range not found. You may need to check the page manually.")
        else:
            print("Failed to scrape boss data")

if __name__ == "__main__":
    main()

