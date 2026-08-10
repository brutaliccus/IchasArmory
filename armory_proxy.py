#!/usr/bin/env python3
"""
Armory Proxy Server - Bypasses CORS restrictions for Turtle WoW armory data

This Flask server acts as a proxy between the calculator and the armory,
fetching character data and extracting item IDs automatically.

Usage:
    python armory_proxy.py

Then the calculator can make requests to:
    http://localhost:8001/api/armory?character=CharacterName&server=nordanaar
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import re
import json
import random
import string
from pathlib import Path

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

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

# Server URL mappings
SERVER_URLS = {
    'nordanaar': 'https://turtlecraft.gg/armory/Nordanaar',
    'telabim': 'https://turtlecraft.gg/armory/Tel%27Abim',
    'ambershire': 'https://turtlecraft.gg/armory/Ambershire'
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

@app.route('/api/armory', methods=['GET'])
@app.route('/armory-proxy', methods=['GET'])  # Legacy route for backwards compatibility
def get_armory_data():
    """
    Fetch character data from armory and extract item IDs, enchantments, class, and race

    Query parameters:
        character (required): Character name
        server (optional): Server name (nordanaar, telabim, ambershire). Default: nordanaar

    Returns:
        JSON object with:
            - success: boolean
            - itemIds: list of item IDs
            - enchantments: object mapping item IDs to enchant effect IDs
            - class: character class (lowercase)
            - race: character race (lowercase)
            - character: character name
            - server: server name
            - error: error message (if success=false)
    """
    character_name = request.args.get('character')
    server = request.args.get('server', 'nordanaar').lower()

    if not character_name:
        return jsonify({
            'success': False,
            'error': 'Character name is required'
        }), 400

    if server not in SERVER_URLS:
        return jsonify({
            'success': False,
            'error': f'Invalid server. Must be one of: {", ".join(SERVER_URLS.keys())}'
        }), 400

    # Capitalize first letter of character name
    formatted_name = character_name.capitalize()

    # Construct armory URL
    armory_url = f"{SERVER_URLS[server]}/{formatted_name}"

    try:
        # Fetch the armory page
        print(f"Fetching: {armory_url}")
        response = requests.get(armory_url, timeout=10)
        response.raise_for_status()

        # Parse the HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # Extract class, race, and enchantments from the wire:snapshot JSON data
        character_class = None
        character_race = None
        equipment_list = []  # List of items with enchants

        # Look for the wire:snapshot div which contains character data as JSON
        snapshot_div = soup.find('div', {'wire:snapshot': True})
        if snapshot_div:
            try:
                import json
                import html
                # HTML-decode the wire:snapshot attribute value
                wire_snapshot_raw = snapshot_div.get('wire:snapshot', '{}')
                wire_snapshot_decoded = html.unescape(wire_snapshot_raw)
                wire_data = json.loads(wire_snapshot_decoded)

                # The actual data structure is: wire_data['data']['character'][0]
                # (NOT in serverMemo - that was old structure)
                if 'data' in wire_data and 'character' in wire_data['data']:
                    char_data = wire_data['data']['character']
                    if isinstance(char_data, list) and len(char_data) > 0:
                        # Character is at character[0] (a dict, not nested list)
                        char_info = char_data[0]

                        if isinstance(char_info, dict):
                            # Extract race and class IDs
                            race_id = char_info.get('race')
                            class_id = char_info.get('class')

                            # Map to text IDs
                            if race_id in RACE_MAP:
                                character_race = RACE_MAP[race_id]
                            if class_id in CLASS_MAP:
                                character_class = CLASS_MAP[class_id]

                            print(f"Extracted from JSON - Race ID: {race_id} -> {character_race}, Class ID: {class_id} -> {character_class}")

                            # Extract equipment with full item data from armory
                            # Equipment can have two formats:
                            # Format 1: character[0].equipment[0] = [[item_dict], [item_dict], ...]
                            # Format 2: character[0].equipment[0] = {'0': [item_dict], '1': [item_dict], ...}
                            if 'equipment' in char_info:
                                equipment_outer = char_info['equipment']
                                if isinstance(equipment_outer, list) and len(equipment_outer) > 0:
                                    equipment_data = equipment_outer[0]

                                    # Handle dict format (keyed by slot number)
                                    if isinstance(equipment_data, dict):
                                        print(f"Found equipment dict with {len(equipment_data)} slots")
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
                                                        if enchant_id and enchant_id != 0:
                                                            print(f"Found item {item_id} ({item.get('name')}) with enchant {enchant_id}")

                                    # Handle list format
                                    elif isinstance(equipment_data, list):
                                        print(f"Found equipment list with {len(equipment_data)} items")
                                        for item_wrapper in equipment_data:
                                            # Each item is wrapped in a list: [item_dict, ...]
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
                                                        if enchant_id and enchant_id != 0:
                                                            print(f"Found item {item_id} ({item.get('name')}) with enchant {enchant_id}")
                            else:
                                print("No 'equipment' key found in character data")

            except Exception as e:
                print(f"Error parsing wire:snapshot JSON: {e}")

        # Build legacy format for backward compatibility
        item_ids = [item['itemId'] for item in equipment_list]
        enchantments = {item['itemId']: item['enchantId'] for item in equipment_list if item['enchantId']}

        print(f"Extracted {len(equipment_list)} equipped items")
        print(f"Found {len(enchantments)} enchantments")
        print(f"Class: {character_class}, Race: {character_race}")

        return jsonify({
            'success': True,
            'equipment': equipment_list,  # Full equipment data from armory
            'itemIds': item_ids,  # Legacy: just the IDs
            'enchantments': enchantments,  # Legacy: Maps item ID to enchant effect ID
            'class': character_class,
            'race': character_race,
            'character': formatted_name,
            'server': server
        })

    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to fetch armory data: {str(e)}'
        }), 500

    except Exception as e:
        print(f"Parsing error: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to parse armory data: {str(e)}'
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'armory-proxy'
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
    print("\nAPI endpoint: http://<your-ip>:{port}/api/armory")
    print("\nExample usage:")
    print(f"  http://<your-ip>:{port}/api/armory?character=Ichabaddie&server=nordanaar")
    print("\nCommand line options:")
    print("  --host=<ip>    Bind to specific IP (default: 0.0.0.0)")
    print("  --port=<port>  Use specific port (default: 8001)")
    print("  --debug        Enable debug mode")
    print("\nPress Ctrl+C to stop the server")
    print("=" * 60)

    app.run(host=host, port=port, debug=debug)
