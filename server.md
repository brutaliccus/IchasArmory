# server.py - Main HTTP Server & API Gateway

## Overview

`server.py` is the main Python HTTP server that serves the IchaCalc application and provides backend API functionality. It handles HTTP file serving, proxies requests to other servers (armory proxy, bug report server), manages build sharing, and provides boss search/scraping functionality via web scraping.

**File Size:** 1,308 lines of code
**Type:** Python 3 HTTP Server
**Framework:** Built-in `http.server` module with `socketserver`

---

## Key Responsibilities

1. **HTTP File Serving** - Serve static files (HTML, CSS, JS, JSON)
2. **Server Orchestration** - Start and manage armory proxy and bug report servers
3. **Build Management** - Save/load character builds via file storage
4. **Boss Search** - Search boss database by name
5. **Boss Scraping** - Scrape boss stats from database.turtlecraft.gg
6. **API Proxying** - Proxy requests to armory API and bug report server
7. **CORS Handling** - Add CORS headers for local development

---

## Architecture Overview

```
server.py
├── Process Management
│   ├── Armory Proxy (port 8001) - armory_proxy.py
│   ├── Bug Report Server (port 3000) - server.js (Node.js)
│   └── HTTP Server (port 6100) - NoCacheHTTPRequestHandler
├── API Endpoints
│   ├── /builds (POST) - Save build
│   ├── /builds/:id (GET) - Load build
│   ├── /api/builds/:id (GET) - Load build (alias)
│   ├── /bosses/search?q=name - Search bosses
│   ├── /bosses/scrape?id=npcId - Scrape boss stats
│   ├── /api/armory/* - Proxy to armory server
│   ├── /bug-report (POST) - Proxy to bug report server
│   ├── /bug-reports (GET) - Proxy to bug report server
│   ├── /profiles/* (GET/POST/PATCH/DELETE) - Proxy to server.js
│   ├── /inbox/* (GET/PATCH/DELETE) - Proxy to server.js
│   ├── /share (POST) - Proxy to server.js
│   └── /auth/* (GET) - Proxy to server.js
└── Boss Scraping
    ├── search_bosses_by_name() - Search boss DB HTML
    ├── get_boss_page() - Fetch boss detail page
    ├── parse_boss_damage() - Extract stats from HTML
    └── scrape_boss() - Complete boss scraping workflow
```

---

## Major Sections

### 1. Configuration & Imports (Lines 1-32)

**Purpose:** Import modules and define port configuration

#### Ports
```python
HTTP_PORT = 6100        # Main HTTP server
PROXY_PORT = 8001       # Armory proxy server
BUG_REPORT_PORT = 3000  # Bug report server (Node.js)
```

#### Build Storage
```python
BUILDS_DIR = Path("builds")  # Directory for build JSON files
BUILD_ID_LENGTH = 6          # Length of random build IDs
```

#### Imports
```python
import http.server
import socketserver
import subprocess
import sys
import os
import signal
import time
import urllib.request
import json
import random
import string
import re
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from creature_attack_speeds import get_creature_attack_speed
```

---

### 2. Build Management Functions (Lines 34-70)

**Purpose:** Generate random build IDs and save/load builds

#### generate_build_id()
Generates a random 6-character alphanumeric ID:
```python
def generate_build_id():
    chars = string.ascii_letters + string.digits
    while True:
        build_id = ''.join(random.choices(chars, k=BUILD_ID_LENGTH))
        # Check if this ID already exists
        if not (BUILDS_DIR / f"{build_id}.json").exists():
            return build_id
```

**Example IDs:** `a7Xk9Q`, `Zm4pRt`, `H8dF3w`

#### validate_build_id(build_id)
Validates build ID format:
```python
def validate_build_id(build_id):
    if not build_id:
        return False
    return bool(re.match(r'^[a-zA-Z0-9]{6}$', build_id))
```

**Valid:** `aB12cD`, `XyZ789`
**Invalid:** `abc123x` (7 chars), `ab-123` (hyphen), `abcde` (5 chars)

#### save_build(build_data)
Saves build to JSON file:
```python
def save_build(build_data):
    build_id = generate_build_id()
    build_file = BUILDS_DIR / f"{build_id}.json"

    with open(build_file, 'w') as f:
        json.dump(build_data, f, separators=(',', ':'))  # Compact JSON

    return build_id
```

**File Location:** `builds/a7Xk9Q.json`

**Build Data Format:**
```json
{
    "class": "warrior",
    "race": "orc",
    "characterName": "Tankadin",
    "server": "nordanaar",
    "attackerLevel": 63,
    "gear": {
        "head": {"id": 12345, "name": "Epic Helmet"},
        "neck": {"id": 12346, "name": "Epic Necklace"}
    },
    "enchants": {
        "head": {"id": 67890, "name": "+8 Stamina"}
    },
    "talents": {
        "holy": {},
        "protection": {},
        "retribution": {}
    },
    "buffs": [
        {"id": "motw", "name": "Mark of the Wild"}
    ]
}
```

#### load_build(build_id)
Loads build from JSON file:
```python
def load_build(build_id):
    if not validate_build_id(build_id):
        return None

    build_file = BUILDS_DIR / f"{build_id}.json"

    if not build_file.exists():
        return None

    with open(build_file, 'r') as f:
        return json.load(f)
```

---

### 3. Process Management & Cleanup (Lines 72-141)

**Purpose:** Start/stop child processes and handle shutdown

#### cleanup(signum, frame)
Terminates child processes on exit:
```python
def cleanup(signum, frame):
    print("\nShutting down servers...")
    if armory_process:
        armory_process.terminate()
        armory_process.wait()
    if bug_report_process:
        bug_report_process.terminate()
        bug_report_process.wait()
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, cleanup)   # Ctrl+C
signal.signal(signal.SIGTERM, cleanup)  # kill command
```

#### Start Armory Proxy Server
```python
print("=" * 60)
print("ICHA EHP Calculator - Starting All Services")
print("=" * 60)
print(f"\n[1/2] Starting Armory Proxy Server on port {PROXY_PORT}...")

try:
    armory_process = subprocess.Popen(
        [sys.executable, "armory_proxy.py", f"--port={PROXY_PORT}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    time.sleep(2)  # Wait for startup

    # Check if it started successfully
    if armory_process.poll() is not None:
        stdout, stderr = armory_process.communicate()
        exit_code = armory_process.returncode
        print(f"ERROR: Armory proxy failed to start! (exit code: {exit_code})")
        sys.exit(1)

    print(f"✓ Armory Proxy Server running on port {PROXY_PORT}")
except Exception as e:
    print(f"ERROR: Failed to start armory proxy: {e}")
    sys.exit(1)
```

**Armory Proxy Purpose:**
- Proxies requests to https://armory.turtle-wow.org
- Adds CORS headers
- Handles character imports

---

### 4. Port Checking & Bug Report Server (Lines 143-256)

**Purpose:** Check port availability and start bug report server

#### Port Utility Functions
```python
def is_port_in_use(port):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', port))
            return False
        except OSError:
            return True

def find_available_port(start_port, max_attempts=10):
    import socket
    for i in range(max_attempts):
        port = start_port + i
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('localhost', port))
                return port
            except OSError:
                continue
    return None
```

#### Start Bug Report Server (Node.js)
```python
BUG_REPORT_PORT = 3000
print(f"\n[2/3] Starting Bug Report Server on port {BUG_REPORT_PORT}...")

try:
    # Check if Node.js is available
    node_check = subprocess.run(['node', '--version'], capture_output=True, text=True)
    if node_check.returncode != 0:
        print("WARNING: Node.js not found. Bug report server will not start.")
        bug_report_process = None
    else:
        # Check if port 3000 is available
        if is_port_in_use(BUG_REPORT_PORT):
            available_port = find_available_port(BUG_REPORT_PORT + 1, max_attempts=20)
            if available_port:
                BUG_REPORT_PORT = available_port
                print(f"Using alternative port {BUG_REPORT_PORT}")
            else:
                print("ERROR: Could not find an available port")
                bug_report_process = None
                BUG_REPORT_PORT = None

        if BUG_REPORT_PORT:
            # Set PORT environment variable for server.js
            env = os.environ.copy()
            env['PORT'] = str(BUG_REPORT_PORT)

            bug_report_process = subprocess.Popen(
                ['node', 'server.js'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env=env,
                cwd=os.path.dirname(os.path.abspath(__file__))
            )

            time.sleep(3)  # Wait for startup

            if bug_report_process.poll() is not None:
                print("WARNING: Bug report server failed to start")
                bug_report_process = None
            else:
                print(f"✓ Bug Report Server running on port {BUG_REPORT_PORT}")
except FileNotFoundError:
    print("WARNING: Node.js not found. Bug report server will not start.")
    bug_report_process = None
except Exception as e:
    print(f"WARNING: Failed to start bug report server: {e}")
    bug_report_process = None
```

**Bug Report Server Purpose:**
- Handles bug report submissions
- Stores bug reports with screenshots
- Provides profile/authentication API
- Manages inbox/sharing system

---

### 5. HTTP Request Handler (Lines 261-280)

**Purpose:** Custom HTTP handler with CORS and cache disabling

#### NoCacheHTTPRequestHandler
```python
class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def get_bug_report_port(self):
        global BUG_REPORT_PORT
        return BUG_REPORT_PORT

    def get_bug_report_process(self):
        global bug_report_process
        return bug_report_process

    def end_headers(self):
        # Disable caching
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')

        # Enable CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

        super().end_headers()

    def do_OPTIONS(self):
        # Handle CORS preflight requests
        self.send_response(200)
        self.end_headers()
```

**Key Features:**
- Disables caching for development
- Adds CORS headers for local API calls
- Handles OPTIONS preflight requests

---

### 6. POST Request Handling (Lines 409-508)

**Purpose:** Handle POST requests for builds, bug reports, profiles

#### Build Save Endpoint
```python
def do_POST(self):
    if self.path == '/builds' or self.path == '/api/builds':
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            build_data = json.loads(post_data.decode('utf-8'))

            # Save build and get ID
            build_id = save_build(build_data)

            # Return success response
            response = json.dumps({
                'success': True,
                'buildId': build_id
            }).encode()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response)
        except Exception as e:
            error_msg = json.dumps({
                'success': False,
                'error': f'Failed to save build: {str(e)}'
            }).encode()

            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(error_msg)
```

**Request:**
```bash
POST /builds
Content-Type: application/json

{
  "class": "warrior",
  "race": "orc",
  "gear": {...},
  "talents": {...},
  "buffs": [...]
}
```

**Response:**
```json
{
  "success": true,
  "buildId": "a7Xk9Q"
}
```

#### Proxy to Bug Report Server
```python
elif self.path == '/bug-report' or self.path.startswith('/profiles') or self.path.startswith('/share'):
    br_process = self.get_bug_report_process()
    br_port = self.get_bug_report_port()

    if br_process and br_port and br_process.poll() is None:
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            # Forward to bug report server
            proxy_url = f'http://localhost:{br_port}{self.path}'

            # Prepare headers
            headers = {}
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'content-length', 'connection']:
                    headers[header] = value

            # Forward request
            response = requests.post(
                proxy_url,
                data=post_data,
                headers=headers,
                timeout=30
            )

            # Send response back to client
            self.send_response(response.status_code)
            for header, value in response.headers.items():
                if header.lower() not in ['content-encoding', 'transfer-encoding', 'connection']:
                    self.send_header(header, value)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response.content)
        except Exception as e:
            # Return error response
            error_msg = json.dumps({
                'success': False,
                'error': f'Failed to submit: {str(e)}'
            }).encode()

            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(error_msg)
```

---

### 7. GET Request Handling (Lines 510-995)

**Purpose:** Handle GET requests for builds, bosses, armory, files

#### Boss Search Endpoint
```python
if parsed_path.startswith('/bosses/search'):
    try:
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(self.path)
        query_params = parse_qs(parsed.query)
        boss_name = query_params.get('q', [''])[0]

        if not boss_name:
            error_msg = json.dumps({
                'success': False,
                'error': 'Missing query parameter: q'
            }).encode()
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error_msg)
            return

        # Search for bosses
        results = search_bosses_by_name(boss_name)

        response = json.dumps({
            'success': True,
            'results': results,
            'query': boss_name,
            'count': len(results)
        }).encode()

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(response)
        return
    except Exception as e:
        error_msg = json.dumps({
            'success': False,
            'error': f'Failed to search bosses: {str(e)}'
        }).encode()
        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(error_msg)
        return
```

**Request:**
```bash
GET /bosses/search?q=ragnaros
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "11502",
      "name": "Ragnaros",
      "url": "https://database.turtlecraft.gg/?npc=11502",
      "is_boss": true,
      "level": "??",
      "classification": 3
    }
  ],
  "query": "ragnaros",
  "count": 1
}
```

#### Boss Scrape Endpoint
```python
elif parsed_path.startswith('/bosses/scrape'):
    try:
        parsed = urlparse(self.path)
        query_params = parse_qs(parsed.query)
        boss_id = query_params.get('id', [''])[0]

        if not boss_id:
            error_msg = json.dumps({
                'success': False,
                'error': 'Missing query parameter: id'
            }).encode()
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error_msg)
            return

        # Scrape boss data
        boss_data = scrape_boss(boss_id)

        if not boss_data:
            error_msg = json.dumps({
                'success': False,
                'error': 'Failed to scrape boss data'
            }).encode()
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error_msg)
            return

        response = json.dumps({
            'success': True,
            'boss': boss_data
        }).encode()

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(response)
        return
    except Exception as e:
        error_msg = json.dumps({
            'success': False,
            'error': f'Failed to scrape boss: {str(e)}'
        }).encode()
        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(error_msg)
        return
```

**Request:**
```bash
GET /bosses/scrape?id=11502
```

**Response:**
```json
{
  "success": true,
  "boss": {
    "id": "ragnaros",
    "npcId": 11502,
    "name": "Ragnaros",
    "level": 63,
    "minDamage": 3000,
    "maxDamage": 4500,
    "attackSpeed": 2.0,
    "armor": 3731,
    "resistance_fire": 300,
    "resistance_nature": 0,
    "faction": "elemental"
  }
}
```

`faction` is a lowercase creature-type tag parsed from the NPC page (e.g. `undead`, `demon`); unmapped labels become `unknown`.

#### Build Load Endpoint
```python
elif parsed_path.startswith('/builds/') or parsed_path.startswith('/api/builds/'):
    # Extract build ID from either /builds/ID or /api/builds/ID
    parts = parsed_path.split('/')
    build_id = parts[-1] if parts[-1] else parts[-2]

    try:
        build_data = load_build(build_id)

        if build_data is None:
            error_msg = json.dumps({
                'success': False,
                'error': 'Build not found'
            }).encode()

            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error_msg)
        else:
            response = json.dumps({
                'success': True,
                'build': build_data
            }).encode()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(response)
    except Exception as e:
        error_msg = json.dumps({
            'success': False,
            'error': f'Failed to load build: {str(e)}'
        }).encode()

        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(error_msg)
```

---

### 8. Boss Search Function (Lines 997-1103)

**Purpose:** Search boss database HTML for NPCs by name

#### search_bosses_by_name(query)
```python
BOSS_DB_URL = "https://database.turtlecraft.gg"

def search_bosses_by_name(query):
    search_url = f"{BOSS_DB_URL}/"
    params = {"search": query}

    try:
        response = requests.get(search_url, params=params, timeout=10)
        response.raise_for_status()
        html_content = response.text

        results = []

        # Find NPC data embedded in JavaScript Listview
        npc_data_start = html_content.find("template:'npc'")
        if npc_data_start == -1:
            return []

        # Find data: [ after template:'npc'
        data_marker = html_content.find("data:", npc_data_start)
        if data_marker == -1:
            return []

        # Find opening bracket [
        bracket_start = html_content.find('[', data_marker)
        if bracket_start == -1:
            return []

        # Extract array by counting brackets
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

        # Find all id: patterns in this data string
        id_pattern = r'id:\s*(\d+)'
        for id_match in re.finditer(id_pattern, npc_data_str):
            npc_id = id_match.group(1)
            id_pos = id_match.start()

            # Look backwards to find name: field in the same object
            chunk_start = max(0, id_pos - 200)
            obj_chunk = npc_data_str[chunk_start:id_pos + 10]

            # Extract name
            name_match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", obj_chunk)
            name = name_match.group(1) if name_match else f"NPC {npc_id}"

            # Extract classification (3 = Boss)
            class_match = re.search(r"classification:\s*(\d+)", obj_chunk)
            classification = int(class_match.group(1)) if class_match else 0

            # Extract level
            level_match = re.search(r"minlevel:\s*(\d+)", obj_chunk)
            minlevel = int(level_match.group(1)) if level_match else None

            is_boss = (classification == 3)
            level_str = str(minlevel) if minlevel else '??'

            # Build URL: ?npc=ID
            url = f"{BOSS_DB_URL}/?npc={npc_id}"

            results.append({
                'id': npc_id,
                'name': name,
                'url': url,
                'is_boss': is_boss,
                'level': level_str,
                'classification': classification
            })

        return results
    except Exception as e:
        sys.stderr.write(f"[BOSS SEARCH] Error: {e}\n")
        return []
```

**Classification Values:**
- 0 = Normal
- 1 = Elite
- 2 = Rare Elite
- 3 = Boss
- 4 = Rare

---

### 9. Boss Scraping Functions (Lines 1105-1276)

**Purpose:** Extract boss stats from database page HTML

#### get_boss_page(boss_id)
```python
def get_boss_page(boss_id):
    url = f"{BOSS_DB_URL}/"
    params = {"npc": boss_id}
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"Error fetching boss page: {e}")
        return None
```

#### parse_boss_damage(html)
Extracts stats from HTML using BeautifulSoup and regex:

```python
def parse_boss_damage(html):
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

    # Extract name
    name_elem = soup.find('h1')
    if name_elem:
        name_text = name_elem.get_text().strip()
        boss_data['name'] = name_text.split(' - ')[0].strip()

    # Extract damage range
    page_text = soup.get_text()
    damage_match = re.search(r'Damage[:\s]+([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)', page_text, re.IGNORECASE)
    if damage_match:
        min_dmg_str = damage_match.group(1).replace(',', '')
        max_dmg_str = damage_match.group(2).replace(',', '')
        boss_data['minDamage'] = int(float(min_dmg_str))
        boss_data['maxDamage'] = int(float(max_dmg_str))

    # Extract level
    level_match = re.search(r'Level[:\s]+(\d+|\?\?)', page_text, re.IGNORECASE)
    if level_match:
        level_str = level_match.group(1)
        if level_str == '??':
            boss_data['level'] = 63  # Boss level
        else:
            boss_data['level'] = int(level_str)

    # Extract attack speed
    speed_match = re.search(r'Attack\s+Speed[:\s]+([\d,]+\.?\d*)', page_text, re.IGNORECASE)
    if speed_match:
        speed_str = speed_match.group(1).replace(',', '')
        boss_data['attackSpeed'] = float(speed_str)
    else:
        boss_data['attackSpeed'] = 2.0  # Default

    # Extract armor
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

    # Extract resistances
    resistance_patterns = {
        'resistance_nature': [
            r'Nature\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Nature[:\s]+([\d,]+)',
            r'ResistNature[:\s]+([\d,]+)',
        ],
        'resistance_fire': [
            r'Fire\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Fire[:\s]+([\d,]+)',
            r'ResistFire[:\s]+([\d,]+)',
        ],
        'resistance_frost': [
            r'Frost\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Frost[:\s]+([\d,]+)',
            r'ResistFrost[:\s]+([\d,]+)',
        ],
        'resistance_shadow': [
            r'Shadow\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Shadow[:\s]+([\d,]+)',
            r'ResistShadow[:\s]+([\d,]+)',
        ],
        'resistance_arcane': [
            r'Arcane\s+Resistance[:\s]+([\d,]+)',
            r'Resist\s+Arcane[:\s]+([\d,]+)',
            r'ResistArcane[:\s]+([\d,]+)',
        ],
    }

    for resistance_key, patterns in resistance_patterns.items():
        for pattern in patterns:
            resist_match = re.search(pattern, page_text, re.IGNORECASE)
            if resist_match:
                resist_str = resist_match.group(1).replace(',', '')
                boss_data[resistance_key] = int(resist_str)
                break

    return boss_data
```

Before `return`, the live `server.py` also sets `boss_data['faction']` using `parse_npc_faction_tag_from_turtle_html(html)` (imported from `scrape_bosses.py`): a lowercase creature tag when the Turtle “Faction” link matches a known label, else `unknown`.

#### scrape_boss(boss_id)
Complete scraping workflow:

```python
def scrape_boss(boss_id):
    if not boss_id or not boss_id.isdigit():
        return None

    html = get_boss_page(boss_id)
    if not html:
        return None

    boss_data = parse_boss_damage(html)

    # Generate ID from name
    if boss_data['name']:
        boss_data['id'] = re.sub(r'[^a-z0-9]+', '', boss_data['name'].lower())
    else:
        boss_data['id'] = f"boss_{boss_id}"

    npc_id = int(boss_id)
    boss_data['npcId'] = npc_id

    # Get attack speed from database (authoritative source)
    database_attack_speed = get_creature_attack_speed(npc_id)
    scraped_attack_speed = boss_data.get('attackSpeed', 2.0)

    boss_data['attackSpeed'] = database_attack_speed

    if database_attack_speed != scraped_attack_speed:
        print(f"[BOSS SCRAPE] NPC {npc_id}: Using database attack speed {database_attack_speed}s (scraped: {scraped_attack_speed}s)")
    else:
        print(f"[BOSS SCRAPE] NPC {npc_id}: Attack speed {database_attack_speed}s")

    return boss_data
```

**Attack Speed Priority:**
1. Database (`creature_attack_speeds.py`) - Always used (authoritative)
2. Scraped from HTML - Only used for logging/comparison

---

### 10. Server Startup (Lines 1278-1308)

**Purpose:** Start HTTP server and display startup info

#### ReusableTCPServer
```python
class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True  # Allow port reuse (prevent "Address already in use")
```

#### Server Startup
```python
try:
    with ReusableTCPServer(("", HTTP_PORT), NoCacheHTTPRequestHandler) as httpd:
        hostname = "localhost"

        print(f"✓ HTTP Server running on port {HTTP_PORT}")
        print("\n" + "=" * 60)
        print("All services running!")
        print("=" * 60)
        print(f"\nCalculator:   http://{hostname}:{HTTP_PORT}")
        print(f"Proxy API:    http://{hostname}:{PROXY_PORT}/api/armory")
        if bug_report_process:
            print(f"Bug Reports:  http://{hostname}:{BUG_REPORT_PORT}/bug-report")
        print("\nOpen the calculator URL in your browser.")
        print("Press Ctrl+C to stop all servers.")
        print("=" * 60 + "\n")

        # Start server (blocking)
        httpd.serve_forever()

except OSError as e:
    print(f"\nERROR: Could not start HTTP server on port {HTTP_PORT}")
    print(f"Error: {e}")
    print(f"Port {HTTP_PORT} may already be in use.")
    cleanup(None, None)
```

**Startup Output:**
```
============================================================
ICHA EHP Calculator - Starting All Services
============================================================

[1/2] Starting Armory Proxy Server on port 8001...
✓ Armory Proxy Server running on port 8001

[2/3] Starting Bug Report Server on port 3000...
✓ Bug Report Server running on port 3000

[3/3] Starting HTTP Server on port 6100...
✓ HTTP Server running on port 6100

============================================================
All services running!
============================================================

Calculator:   http://localhost:6100
Proxy API:    http://localhost:8001/api/armory
Bug Reports:  http://localhost:3000/bug-report

Open the calculator URL in your browser.
Press Ctrl+C to stop all servers.
============================================================
```

---

## API Endpoints Summary

### Build Management
- **POST /builds** - Save build, returns build ID
- **GET /builds/:id** - Load build by ID
- **GET /api/builds/:id** - Load build by ID (alias)

### Boss Database
- **GET /bosses/search?q=name** - Search bosses by name
- **GET /bosses/scrape?id=npcId** - Scrape boss stats

### Armory Proxy
- **GET /api/armory/\*** - Proxy to armory.turtle-wow.org

### Bug Report Server Proxy
- **POST /bug-report** - Submit bug report
- **GET /bug-reports** - List bug reports
- **GET /bug-reports/:id** - Get bug report screenshot
- **PATCH /bug-reports/:id/status** - Update bug report status

### Profile/Auth Server Proxy (server.js)
- **GET /auth/discord** - Discord OAuth login
- **GET /auth/logout** - Logout
- **GET /user** - Get current user
- **GET /profiles** - List user profiles
- **POST /profiles** - Create profile
- **PATCH /profiles/:id/set-default** - Mark one profile default (clears `isDefault` on others). Registered **before** `PATCH /profiles/:id` so the `set-default` path is never handled as a generic profile id. Profile id matching uses string comparison so numeric ids in JSON still match URL params.
- **PATCH /profiles/:id** - Update profile
- **DELETE /profiles/:id** - Delete profile
- **POST /share** - Share build with user
- **GET /inbox** - Get inbox messages
- **PATCH /inbox/:id** - Mark message as read
- **DELETE /inbox/:id** - Delete inbox message

Profile JSON responses on `server.js` (`GET/POST/PATCH` profile success and `DELETE` profile success) set `Cache-Control: no-store` so intermediaries and browsers do not serve stale build lists after saves.

---

## Data Flow Examples

### Saving a Build
```
1. Client: POST /builds with build JSON
2. server.py: generate_build_id() → "a7Xk9Q"
3. server.py: save_build() → writes builds/a7Xk9Q.json
4. server.py: returns {"success": true, "buildId": "a7Xk9Q"}
5. Client: receives build ID, generates share URL
```

### Loading a Build
```
1. Client: GET /builds/a7Xk9Q
2. server.py: validate_build_id("a7Xk9Q")
3. server.py: load_build("a7Xk9Q") → reads builds/a7Xk9Q.json
4. server.py: returns {"success": true, "build": {...}}
5. Client: loadBuildData(build)
```

### Boss Search & Scrape
```
1. Client: GET /bosses/search?q=ragnaros
2. server.py: search_bosses_by_name("ragnaros")
3. server.py: requests.get("https://database.turtlecraft.gg/?search=ragnaros")
4. server.py: parses HTML, extracts NPC list
5. server.py: returns [{"id": "11502", "name": "Ragnaros", ...}]
6. Client: displays boss list
7. User: selects "Ragnaros"
8. Client: GET /bosses/scrape?id=11502
9. server.py: scrape_boss("11502")
10. server.py: requests.get("https://database.turtlecraft.gg/?npc=11502")
11. server.py: parse_boss_damage(html) → extracts stats
12. server.py: get_creature_attack_speed(11502) → 2.0
13. server.py: returns {"success": true, "boss": {...}}
14. Client: populates boss stats in simulation panel
```

---

## Related Files

- **armory_proxy.py** - Armory API proxy server (port 8001)
- **server.js** - Bug report, profile & static file server (Node.js, port 3000). Uses `compression` middleware for gzip and `express.static` with 1-hour cache headers for all assets (HTML is no-cache).
- **creature_attack_speeds.py** - Attack speed database
- **builds/** - Directory for saved build JSON files
- **requirements.txt** - Python dependencies (requests, beautifulsoup4)
- **package.json** - Node.js dependencies for server.js

---

## Running the Server

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies (for server.js)
npm install

# Start all servers
python server.py

# Server will listen on:
# - Port 6100 (HTTP server)
# - Port 8001 (Armory proxy)
# - Port 3000 (Bug report server)
```

---

## Error Handling

### Port Already in Use
If port 6100 is in use, server exits with error message.

### Armory Proxy Failed to Start
If armory_proxy.py fails, server exits with error and diagnostic info.

### Bug Report Server Failed to Start
If server.js fails or Node.js is not installed, server continues without bug reporting functionality.

### Boss Scraping Errors
If boss scraping fails, returns 500 error with error message.

### Build Not Found
If build ID doesn't exist, returns 404 error.

---

## Domain Migration

**Old domain:** `ichasarmory.freiverse.com`
**New domain:** `ichasarmory.quest`

The server implements host-based routing for domain migration:

- **Old domain, root (`/`):** Serves `redirect.html` — a splash page with 5-second auto-redirect to the new domain.
- **Old domain, any other path:** Returns a `301 Permanent Redirect` to `https://ichasarmory.quest{path}?{query}`, preserving build links, profile URLs, etc.
- **New domain:** Normal app operation.

Host detection checks both `Host` and `X-Forwarded-Host` headers (for nginx reverse proxy).

The `discord.env` callback URL is updated to `https://ichasarmory.quest/auth/callback`. **Reminder:** Update the redirect URI in the Discord Developer Portal as well.

### Nginx Configuration

Both domains should be configured in nginx to proxy to port 6100. The server.py handles domain differentiation internally. Example:

```nginx
server {
    server_name ichasarmory.quest ichasarmory.freiverse.com;
    location / {
        proxy_pass http://127.0.0.1:6100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After setting up DNS for `ichasarmory.quest`, run `certbot --nginx -d ichasarmory.quest` to get SSL.
