#!/usr/bin/env python3
"""
Armory Proxy Server - Fetches character gear from Chronicle Classic (default) or Turtle WoW (rollback).

Usage:
    python armory_proxy.py

Environment:
    ARMORY_UPSTREAM=chronicle|turtle  (default: chronicle)

API:
    http://localhost:8001/api/armory?character=CharacterName&server=nzoth
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import re
import json
import random
import string
import os
from pathlib import Path
from urllib.parse import quote

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

ARMORY_UPSTREAM = os.environ.get('ARMORY_UPSTREAM', 'chronicle').lower()

# Build storage configuration
BUILDS_DIR = Path("builds")
BUILD_ID_LENGTH = 6

# Ensure builds directory exists
BUILDS_DIR.mkdir(exist_ok=True)

def generate_build_id():
    """Generate a random 6-character build ID"""
    chars = string.ascii_letters + string.digits
    while True:
        build_id = ''.join(random.choices(chars, k=BUILD_ID_LENGTH))
        # Check if this ID already exists
        if not (BUILDS_DIR / f"{build_id}.json").exists():
            return build_id

def validate_build_id(build_id):
    """Validate build ID format (alphanumeric, 6 chars)"""
    if not build_id:
        return False
    return bool(re.match(r'^[a-zA-Z0-9]{6}$', build_id))

def save_build(build_data):
    """Save build data and return build ID"""
    build_id = generate_build_id()
    build_file = BUILDS_DIR / f"{build_id}.json"

    with open(build_file, 'w') as f:
        json.dump(build_data, f, separators=(',', ':'))

    return build_id

def load_build(build_id):
    """Load build data by ID"""
    if not validate_build_id(build_id):
        return None

    build_file = BUILDS_DIR / f"{build_id}.json"

    if not build_file.exists():
        return None

    with open(build_file, 'r') as f:
        return json.load(f)

# Turtle WoW server URL mappings (ARMORY_UPSTREAM=turtle rollback)
SERVER_URLS = {
    'nordanaar': 'https://turtlecraft.gg/armory/Nordanaar',
    'telabim': 'https://turtlecraft.gg/armory/Tel%27Abim',
    'ambershire': 'https://turtlecraft.gg/armory/Ambershire'
}

# Chronicle Classic realms (default upstream)
CHRONICLE_REALMS = {
    'nzoth': "N'Zoth",
    'cthun': "C'Thun (Hardcore)",
    'cthun-hc': "C'Thun (Hardcore)",
    'yshaarj': "Y'Shaarj",
}

CHRONICLE_API_BASE = 'https://octo.chronicleclassic.com/api/v1/armory'
CHRONICLE_HEADERS = {
    'Origin': 'https://chronicleclassic.com',
    'Referer': 'https://chronicleclassic.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 IchaCalc-Armory-Proxy/1.0',
}

# Combat-log gear index → IchaCalc slot (skip shirt index 3 and tabard last)
CHRONICLE_GEAR_SLOTS = [
    'head', 'neck', 'shoulder', None,  # shirt
    'chest', 'waist', 'legs', 'feet', 'wrist', 'hands',
    'ring1', 'ring2', 'trinket1', 'trinket2', 'back',
    'mainhand', 'offhand', 'ranged', None,  # tabard
]

CHRONICLE_INVENTORY_TYPE_BY_SLOT = {
    'head': 1,
    'neck': 2,
    'shoulder': 3,
    'chest': 5,
    'waist': 6,
    'legs': 7,
    'feet': 8,
    'wrist': 9,
    'hands': 10,
    'ring1': 11,
    'ring2': 12,
    'trinket1': 13,
    'trinket2': 14,
    'back': 15,
    'mainhand': 16,
    'offhand': 17,
    'ranged': 18,
}

CHRONICLE_CLASS_MAP = {
    'WARRIOR': 'warrior',
    'PALADIN': 'paladin',
    'HUNTER': 'hunter',
    'ROGUE': 'rogue',
    'PRIEST': 'priest',
    'SHAMAN': 'shaman',
    'MAGE': 'mage',
    'WARLOCK': 'warlock',
    'DRUID': 'druid',
}

CHRONICLE_RACE_MAP = {
    'Human': 'human',
    'Orc': 'orc',
    'Dwarf': 'dwarf',
    'Night Elf': 'nightelf',
    'Undead': 'undead',
    'Tauren': 'tauren',
    'Gnome': 'gnome',
    'Troll': 'troll',
    'High Elf': 'highelf',
    'Blood Elf': 'bloodelf',
    'Goblin': 'goblin',
}

# Slot mapping from armory to calculator
SLOT_MAPPING = {
    'Head': 'head',
    'Neck': 'neck',
    'Shoulder': 'shoulder',
    'Back': 'back',
    'Chest': 'chest',
    'Wrist': 'wrist',
    'Hands': 'hands',
    'Waist': 'waist',
    'Pants': 'legs',
    'Feet': 'feet',
    'Ring': ['ring1', 'ring2'],
    'Trinket': ['trinket1', 'trinket2'],
    'Mainhand': 'mainhand',
    'Offhand': 'offhand',
    'Ranged': 'ranged'
}


# Turtle WoW race/class ID mappings
RACE_MAP = {
    1: 'human',
    2: 'orc',
    3: 'dwarf',
    4: 'nightelf',
    5: 'undead',
    6: 'tauren',
    7: 'gnome',
    8: 'troll',
    10: 'highelf'  # High Elf (custom TWoW race)
}

CLASS_MAP = {
    1: 'warrior',
    2: 'paladin',
    3: 'hunter',
    4: 'rogue',
    5: 'priest',
    7: 'shaman',
    8: 'mage',
    9: 'warlock',
    11: 'druid'
}


def get_valid_servers():
    if ARMORY_UPSTREAM == 'turtle':
        return SERVER_URLS
    return CHRONICLE_REALMS


def map_chronicle_class(class_name):
    if not class_name:
        return None
    return CHRONICLE_CLASS_MAP.get(str(class_name).upper())


def map_chronicle_race(race_name):
    if not race_name:
        return None
    return CHRONICLE_RACE_MAP.get(str(race_name).strip())


def parse_chronicle_gear(gear):
    """Map Chronicle gear[] by combat-log index; use item_id (not transmog_id)."""
    equipment_list = []
    if not isinstance(gear, list):
        return equipment_list

    for idx, item in enumerate(gear):
        if idx >= len(CHRONICLE_GEAR_SLOTS):
            break
        slot = CHRONICLE_GEAR_SLOTS[idx]
        if not slot:
            continue
        if not isinstance(item, dict):
            continue

        item_id = item.get('item_id') or item.get('itemId')
        if not item_id:
            continue

        enchant_id = item.get('enchant_id') or item.get('enchantId')
        equipment_list.append({
            'itemId': item_id,
            'enchantId': enchant_id if enchant_id else None,
            'slot': slot,
            'inventoryType': CHRONICLE_INVENTORY_TYPE_BY_SLOT.get(slot),
            'name': item.get('item_name') or item.get('name'),
            'icon': item.get('item_icon') or item.get('icon'),
        })
        if enchant_id:
            print(f"Chronicle: item {item_id} in {slot} enchant {enchant_id}")

    return equipment_list


def fetch_chronicle_armory(character_name, server_key):
    realm = CHRONICLE_REALMS.get(server_key)
    if not realm:
        return None, f'Invalid server. Must be one of: {", ".join(sorted(set(CHRONICLE_REALMS.keys())))}'

    search_url = f"{CHRONICLE_API_BASE}/search?q={quote(character_name)}&realm={quote(realm)}"
    print(f"Chronicle search: {search_url}")
    search_resp = requests.get(search_url, headers=CHRONICLE_HEADERS, timeout=15)
    search_resp.raise_for_status()
    search_data = search_resp.json()
    players = search_data.get('players') or []

    target_lower = character_name.lower()
    match = next((p for p in players if str(p.get('name', '')).lower() == target_lower), None)
    if not match and players:
        match = players[0]
    if not match:
        return None, f'Character "{character_name}" not found on {realm}'

    player_id = match.get('id')
    player_realm = match.get('realm_name') or realm
    char_url = f"{CHRONICLE_API_BASE}/{quote(player_realm)}/{quote(player_id)}"
    print(f"Chronicle character: {char_url}")
    char_resp = requests.get(char_url, headers=CHRONICLE_HEADERS, timeout=15)
    char_resp.raise_for_status()
    char_data = char_resp.json()

    equipment_list = parse_chronicle_gear(char_data.get('gear') or [])
    character_class = map_chronicle_class(char_data.get('class'))
    character_race = map_chronicle_race(char_data.get('race'))
    display_name = char_data.get('name') or match.get('name') or character_name

    return {
        'success': True,
        'equipment': equipment_list,
        'itemIds': [item['itemId'] for item in equipment_list],
        'enchantments': {item['itemId']: item['enchantId'] for item in equipment_list if item.get('enchantId')},
        'class': character_class,
        'race': character_race,
        'character': display_name,
        'server': server_key,
    }, None


def fetch_turtle_armory(character_name, server_key):
    if server_key not in SERVER_URLS:
        return None, f'Invalid server. Must be one of: {", ".join(SERVER_URLS.keys())}'

    formatted_name = character_name.capitalize()
    armory_url = f"{SERVER_URLS[server_key]}/{formatted_name}"

    print(f"Fetching Turtle armory: {armory_url}")
    response = requests.get(armory_url, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, 'html.parser')

    character_class = None
    character_race = None
    equipment_list = []

    snapshot_div = soup.find('div', {'wire:snapshot': True})
    if snapshot_div:
        try:
            import html
            wire_snapshot_raw = snapshot_div.get('wire:snapshot', '{}')
            wire_snapshot_decoded = html.unescape(wire_snapshot_raw)
            wire_data = json.loads(wire_snapshot_decoded)

            if 'data' in wire_data and 'character' in wire_data['data']:
                char_data = wire_data['data']['character']
                if isinstance(char_data, list) and len(char_data) > 0:
                    char_info = char_data[0]

                    if isinstance(char_info, dict):
                        race_id = char_info.get('race')
                        class_id = char_info.get('class')

                        if race_id in RACE_MAP:
                            character_race = RACE_MAP[race_id]
                        if class_id in CLASS_MAP:
                            character_class = CLASS_MAP[class_id]

                        if 'equipment' in char_info:
                            equipment_outer = char_info['equipment']
                            if isinstance(equipment_outer, list) and len(equipment_outer) > 0:
                                equipment_data = equipment_outer[0]

                                if isinstance(equipment_data, dict):
                                    for slot_key, item_wrapper in equipment_data.items():
                                        if isinstance(item_wrapper, list) and len(item_wrapper) > 0:
                                            item = item_wrapper[0]
                                            if isinstance(item, dict):
                                                item_id = item.get('itemEntry')
                                                enchant_id = item.get('enchantments', 0)
                                                inventory_type = item.get('inventory_type')

                                                if item_id:
                                                    equipment_list.append({
                                                        'itemId': item_id,
                                                        'enchantId': enchant_id if enchant_id != 0 else None,
                                                        'inventoryType': inventory_type,
                                                        'name': item.get('name'),
                                                        'icon': item.get('icon')
                                                    })

                                elif isinstance(equipment_data, list):
                                    for item_wrapper in equipment_data:
                                        if isinstance(item_wrapper, list) and len(item_wrapper) > 0:
                                            item = item_wrapper[0]
                                            if isinstance(item, dict):
                                                item_id = item.get('itemEntry')
                                                enchant_id = item.get('enchantments', 0)
                                                inventory_type = item.get('inventory_type')

                                                if item_id:
                                                    equipment_list.append({
                                                        'itemId': item_id,
                                                        'enchantId': enchant_id if enchant_id != 0 else None,
                                                        'inventoryType': inventory_type,
                                                        'name': item.get('name'),
                                                        'icon': item.get('icon')
                                                    })

        except Exception as e:
            print(f"Error parsing wire:snapshot JSON: {e}")

    item_ids = [item['itemId'] for item in equipment_list]
    enchantments = {item['itemId']: item['enchantId'] for item in equipment_list if item['enchantId']}

    print(f"Turtle: {len(equipment_list)} items, {len(enchantments)} enchants, class={character_class}, race={character_race}")

    return {
        'success': True,
        'equipment': equipment_list,
        'itemIds': item_ids,
        'enchantments': enchantments,
        'class': character_class,
        'race': character_race,
        'character': formatted_name,
        'server': server_key,
    }, None


@app.route('/api/armory', methods=['GET'])
@app.route('/armory-proxy', methods=['GET'])
def get_armory_data():
    character_name = (request.args.get('character') or '').strip()
    valid_servers = get_valid_servers()
    default_server = 'nordanaar' if ARMORY_UPSTREAM == 'turtle' else 'nzoth'
    server = (request.args.get('server') or default_server).lower()

    if not character_name:
        return jsonify({'success': False, 'error': 'Character name is required'}), 400

    if server not in valid_servers:
        return jsonify({
            'success': False,
            'error': f'Invalid server. Must be one of: {", ".join(sorted(valid_servers.keys()))}'
        }), 400

    formatted_name = character_name[0].upper() + character_name[1:].lower() if character_name else character_name

    try:
        if ARMORY_UPSTREAM == 'turtle':
            payload, error = fetch_turtle_armory(formatted_name, server)
        else:
            payload, error = fetch_chronicle_armory(formatted_name, server)

        if error:
            return jsonify({'success': False, 'error': error}), 404 if 'not found' in error.lower() else 400

        return jsonify(payload)

    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return jsonify({'success': False, 'error': f'Failed to fetch armory data: {str(e)}'}), 500

    except Exception as e:
        print(f"Parsing error: {e}")
        return jsonify({'success': False, 'error': f'Failed to parse armory data: {str(e)}'}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'armory-proxy',
        'upstream': ARMORY_UPSTREAM,
    })


if __name__ == '__main__':
    import sys

    # Default configuration
    host = '0.0.0.0'  # Listen on all interfaces (for Raspberry Pi)
    port = 8001
    debug = False

    # Parse command line arguments
    for arg in sys.argv[1:]:
        if arg.startswith('--host='):
            host = arg.split('=')[1]
        elif arg.startswith('--port='):
            port = int(arg.split('=')[1])
        elif arg == '--debug':
            debug = True

    print("=" * 60)
    print("Armory Proxy Server Starting...")
    print("=" * 60)
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"Debug: {debug}")
    print(f"Upstream: {ARMORY_UPSTREAM}")
    print("\nAPI endpoint: http://<your-ip>:{port}/api/armory")
    print("\nExample usage:")
    print(f"  http://<your-ip>:{port}/api/armory?character=Ichabaddie&server=nzoth")
    print("\nCommand line options:")
    print("  --host=<ip>    Bind to specific IP (default: 0.0.0.0)")
    print("  --port=<port>  Use specific port (default: 8001)")
    print("  --debug        Enable debug mode")
    print("\nPress Ctrl+C to stop the server")
    print("=" * 60)

    app.run(host=host, port=port, debug=debug)
