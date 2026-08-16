#!/usr/bin/env python3
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

try:
    from scrape_bosses import parse_npc_faction_tag_from_turtle_html
except ImportError:
    def parse_npc_faction_tag_from_turtle_html(html):
        return "unknown"

# Define the ports
HTTP_PORT = 6100
PROXY_PORT = 8001

# Build storage configuration
BUILDS_DIR = Path("builds")
BUILD_ID_LENGTH = 6

# Global process references for cleanup
armory_process = None
bug_report_process = None

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

def cleanup(signum, frame):
    """Clean up child processes on exit"""
    print("\nShutting down servers...")
    if armory_process:
        armory_process.terminate()
        armory_process.wait()
    if bug_report_process:
        bug_report_process.terminate()
        bug_report_process.wait()
    sys.exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

# Start the armory proxy server in a subprocess
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

    # Give it a moment to start
    time.sleep(2)

    # Check if it started successfully
    if armory_process.poll() is not None:
        # Process died, get the error output
        stdout, stderr = armory_process.communicate()
        exit_code = armory_process.returncode
        print(f"ERROR: Armory proxy failed to start! (exit code: {exit_code})")
        print(f"\nCommand: {sys.executable} armory_proxy.py --port={PROXY_PORT}")
        print(f"Working directory: {os.getcwd()}")
        print("\nStdout:")
        print(stdout if stdout else "(empty)")
        print("\nStderr:")
        print(stderr if stderr else "(empty)")

        # Try running the proxy directly to see what happens
        print("\nAttempting direct execution for diagnostics...")
        try:
            result = subprocess.run(
                [sys.executable, "armory_proxy.py", "--help"],
                capture_output=True,
                text=True,
                timeout=5
            )
            print(f"Direct test exit code: {result.returncode}")
            print(f"Direct test output: {result.stdout}")
            print(f"Direct test errors: {result.stderr}")
        except Exception as test_e:
            print(f"Direct test failed: {test_e}")

        print("\nMake sure requirements are installed: pip install -r requirements.txt")
        sys.exit(1)

    print(f"✓ Armory Proxy Server running on port {PROXY_PORT}")

except Exception as e:
    print(f"ERROR: Failed to start armory proxy: {e}")
    print("Make sure requirements are installed: pip install -r requirements.txt")
    sys.exit(1)

# Helper functions for port checking
def is_port_in_use(port):
    """Check if a port is already in use"""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('127.0.0.1', port))
            return False
        except OSError:
            return True

def find_available_port(start_port, max_attempts=10):
    """Find an available port starting from start_port"""
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

# Start the bug report server
BUG_REPORT_PORT = 3000
print(f"\n[2/3] Starting Bug Report Server on port {BUG_REPORT_PORT}...")

try:
    # Check if Node.js is available
    node_check = subprocess.run(['node', '--version'], capture_output=True, text=True)
    if node_check.returncode != 0:
        print("WARNING: Node.js not found. Bug report server will not start.")
        print("Install Node.js to enable bug reporting functionality.")
        bug_report_process = None
    else:
        # Check if port 3000 is already in use
        if is_port_in_use(BUG_REPORT_PORT):
            print(f"WARNING: Port {BUG_REPORT_PORT} is already in use.")
            print("Attempting to find an available alternative port...")
            # Try to find an available port (start checking from 3001)
            available_port = find_available_port(BUG_REPORT_PORT + 1, max_attempts=20)
            if available_port:
                BUG_REPORT_PORT = available_port
                print(f"Using alternative port {BUG_REPORT_PORT} for bug report server.")
            else:
                print("ERROR: Could not find an available port after checking 20 ports.")
                print("Bug reporting will not be available.")
                bug_report_process = None
                BUG_REPORT_PORT = None
        
        if BUG_REPORT_PORT:
            # Set PORT environment variable for server.js
            env = os.environ.copy()
            env['PORT'] = str(BUG_REPORT_PORT)
            
            # Verify the port is still available before starting
            if is_port_in_use(BUG_REPORT_PORT):
                print(f"ERROR: Port {BUG_REPORT_PORT} became unavailable. Trying another port...")
                available_port = find_available_port(BUG_REPORT_PORT + 1, max_attempts=20)
                if available_port:
                    BUG_REPORT_PORT = available_port
                    env['PORT'] = str(BUG_REPORT_PORT)
                    print(f"Using port {BUG_REPORT_PORT} instead.")
                else:
                    print("ERROR: Could not find an available port.")
                    bug_report_process = None
                    BUG_REPORT_PORT = None
            
            if BUG_REPORT_PORT:
                print(f"Starting bug report server on port {BUG_REPORT_PORT}...")
                bug_report_process = subprocess.Popen(
                    ['node', 'server.js'],
                    stdout=sys.stdout,
                    stderr=sys.stderr,
                    text=True,
                    bufsize=1,
                    env=env,
                    cwd=os.path.dirname(os.path.abspath(__file__))
                )
                
                # Give it a moment to start
                time.sleep(3)
                
                # Check if it started successfully
                if bug_report_process.poll() is not None:
                    exit_code = bug_report_process.returncode
                    print(f"WARNING: Bug report server failed to start (exit code: {exit_code})")
                    print("Bug reporting will not be available.")
                    print("  (Node stderr was printed above — check for EADDRINUSE or missing modules.)")
                    bug_report_process = None
                    BUG_REPORT_PORT = None
                else:
                    print(f"✓ Bug Report Server running on port {BUG_REPORT_PORT}")

except FileNotFoundError:
    print("WARNING: Node.js not found. Bug report server will not start.")
    print("Install Node.js to enable bug reporting functionality.")
    bug_report_process = None
    BUG_REPORT_PORT = None
except Exception as e:
    print(f"WARNING: Failed to start bug report server: {e}")
    print("Bug reporting will not be available.")
    bug_report_process = None
    BUG_REPORT_PORT = None

# Start the HTTP server
print(f"\n[3/3] Starting HTTP Server on port {HTTP_PORT}...")

# Domain migration: old domain serves redirect page, new domain serves the app
OLD_DOMAIN = 'ichasarmory.freiverse.com'
NEW_DOMAIN = 'ichasarmory.quest'
REDIRECT_PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'redirect.html')

# Custom handler that disables caching and proxies armory API
class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def _is_old_domain(self):
        """Check if this request is for the old domain"""
        host = self.headers.get('Host', '') or ''
        x_fwd = self.headers.get('X-Forwarded-Host', '') or ''
        return OLD_DOMAIN in host or OLD_DOMAIN in x_fwd

    def _handle_old_domain_redirect(self):
        """Serve redirect page for bare root, 301 redirect for everything else.
        Build share URLs (/?b=ID, /?build=...) get an immediate 301 so the
        build loads on the new domain without the user seeing the splash page."""
        parsed_path = self.path.split('?')[0]
        query = ('?' + self.path.split('?', 1)[1]) if '?' in self.path else ''

        # Root with no query params: show the splash redirect page
        if (parsed_path == '/' or parsed_path == '') and not query:
            try:
                with open(REDIRECT_PAGE, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(content)
            except FileNotFoundError:
                self.send_response(301)
                self.send_header('Location', f'https://{NEW_DOMAIN}/')
                self.end_headers()
            return True

        # Everything else (including /?b=ID build share links): 301 preserving path + query
        self.send_response(301)
        self.send_header('Location', f'https://{NEW_DOMAIN}{parsed_path}{query}')
        self.send_header('Cache-Control', 'max-age=86400')
        self.end_headers()
        return True

    def get_bug_report_port(self):
        """Get the current bug report server port"""
        global BUG_REPORT_PORT
        return BUG_REPORT_PORT
    
    def get_bug_report_process(self):
        """Get the current bug report server process"""
        global bug_report_process
        return bug_report_process

    def _proxy_headers_to_node(self, skip_content_length=False):
        """Forward client headers to Node; set X-Forwarded-* so Express trust proxy matches public URL."""
        skip = {'host', 'connection'}
        if skip_content_length:
            skip.add('content-length')
        headers = {}
        for header, value in self.headers.items():
            if header.lower() not in skip:
                headers[header] = value
        client_host = self.headers.get('Host')
        if client_host:
            headers['X-Forwarded-Host'] = client_host
        xf = self.headers.get('X-Forwarded-Proto')
        headers['X-Forwarded-Proto'] = xf if xf else 'https'
        return headers

    # Regex to identify Vite-hashed bundles (e.g. app-BIZ2xlzs.js, styles-abc12345.css)
    _VITE_HASH_RE = re.compile(r'-[a-zA-Z0-9]{8,}\.(js|css|woff2?|ttf|eot|svg|png|jpg|ico)$')

    def end_headers(self):
        path = getattr(self, 'path', '') or ''
        # Vite-hashed assets in /_app/ get a 1-year immutable cache
        if '/_app/' in path and self._VITE_HASH_RE.search(path):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        else:
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        if self._is_old_domain():
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            return
        # Handle CORS preflight requests
        self.send_response(200)
        self.end_headers()

    def do_DELETE(self):
        if self._is_old_domain():
            self._handle_old_domain_redirect()
            return
        # Handle DELETE requests - proxy to bug report server
        if self.path.startswith('/profiles/') or self.path.startswith('/inbox/') or self.path.startswith('/user-gear-plans/'):
            br_process = self.get_bug_report_process()
            br_port = self.get_bug_report_port()
            if br_process and br_port and br_process.poll() is None:
                try:
                    # Forward to bug report server
                    proxy_url = f'http://localhost:{br_port}{self.path}'

                    headers = self._proxy_headers_to_node(skip_content_length=True)

                    # Forward the request
                    response = requests.delete(
                        proxy_url,
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
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to process DELETE request: {str(e)}'
                    }).encode()

                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
            else:
                error_msg = json.dumps({
                    'success': False,
                    'error': 'Server is not available'
                }).encode()

                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
        else:
            self.send_response(404)
            self.end_headers()

    def do_PATCH(self):
        if self._is_old_domain():
            self._handle_old_domain_redirect()
            return
        # Handle PATCH requests - proxy to bug report server
        if (self.path.startswith('/bug-reports/') and '/status' in self.path) or \
           self.path.startswith('/profiles/') or self.path.startswith('/inbox/'):
            br_process = self.get_bug_report_process()
            br_port = self.get_bug_report_port()
            if br_process and br_port and br_process.poll() is None:
                try:
                    # Read the request body
                    content_length = int(self.headers.get('Content-Length', 0))
                    patch_data = self.rfile.read(content_length)
                    
                    # Forward to bug report server
                    proxy_url = f'http://localhost:{br_port}{self.path}'
                    
                    headers = self._proxy_headers_to_node(skip_content_length=True)
                    
                    # Forward the request
                    response = requests.patch(
                        proxy_url,
                        data=patch_data,
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
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to update bug report status: {str(e)}'
                    }).encode()
                    
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
            else:
                error_msg = json.dumps({
                    'success': False,
                    'error': 'Bug report server is not available'
                }).encode()
                
                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self._is_old_domain():
            self._handle_old_domain_redirect()
            return
        # Handle auth/profile/share requests - proxy to bug report server (server.js)
        if self.path == '/bug-report' or self.path.startswith('/profiles') or self.path.startswith('/share') or self.path.startswith('/gear-plans') or self.path.startswith('/user-gear-plans') or self.path.startswith('/community-gear-plans'):
            br_process = self.get_bug_report_process()
            br_port = self.get_bug_report_port()
            if br_process and br_port and br_process.poll() is None:
                try:
                    # Read the request body
                    content_length = int(self.headers.get('Content-Length', 0))
                    post_data = self.rfile.read(content_length)

                    # Forward to bug report server using requests for proper multipart handling
                    proxy_url = f'http://localhost:{br_port}{self.path}'
                    
                    # Get Content-Type header
                    content_type = self.headers.get('Content-Type', 'application/json')
                    
                    headers = self._proxy_headers_to_node(skip_content_length=True)
                    
                    # Forward the request
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
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to submit bug report: {str(e)}'
                    }).encode()
                    
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
            else:
                error_msg = json.dumps({
                    'success': False,
                    'error': 'Bug report server is not available'
                }).encode()
                
                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
        
        # Handle build save requests
        elif self.path == '/builds' or self.path == '/api/builds':
            try:
                # Read the request body
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                build_data = json.loads(post_data.decode('utf-8'))

                # Save the build and get ID
                build_id = save_build(build_data)

                # Send response
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
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self._is_old_domain():
            self._handle_old_domain_redirect()
            return

        # Parse path to remove query parameters for routing
        parsed_path = self.path.split('?')[0]

        # Debug: log all API and boss requests
        if parsed_path.startswith('/api/') or parsed_path.startswith('/bosses/') or parsed_path.startswith('/auth/'):
            print(f"[REQUEST] GET {self.path}")

        # Handle auth routes - proxy to server.js
        if parsed_path.startswith('/auth/'):
            br_process = self.get_bug_report_process()
            br_port = self.get_bug_report_port()
            print(f"[AUTH DEBUG] process={br_process}, port={br_port}, poll={br_process.poll() if br_process else 'N/A'}")
            if br_process and br_port and br_process.poll() is None:
                try:
                    proxy_url = f'http://localhost:{br_port}{self.path}'
                    print(f"[AUTH PROXY] Proxying auth request to {proxy_url}")

                    headers = self._proxy_headers_to_node()

                    # Forward the request
                    response = requests.get(
                        proxy_url,
                        headers=headers,
                        timeout=30,
                        allow_redirects=False  # Don't follow redirects, let the client handle them
                    )

                    # Send response back to client
                    self.send_response(response.status_code)
                    for header, value in response.headers.items():
                        if header.lower() not in ['content-encoding', 'transfer-encoding', 'connection']:
                            self.send_header(header, value)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()

                    # Only write body if there is one
                    if response.content:
                        self.wfile.write(response.content)
                    return
                except Exception as e:
                    print(f"[AUTH PROXY ERROR] {e}")
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to process auth request: {str(e)}'
                    }).encode()

                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
                    return
            else:
                error_msg = json.dumps({
                    'success': False,
                    'error': 'Auth server is not available'
                }).encode()

                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
                return

        # Handle user/profiles/inbox routes - proxy to server.js
        if parsed_path.startswith('/user') or parsed_path.startswith('/profiles') or parsed_path.startswith('/inbox') or parsed_path.startswith('/gear-plans') or parsed_path.startswith('/user-gear-plans') or parsed_path.startswith('/community-gear-plans'):
            br_process = self.get_bug_report_process()
            br_port = self.get_bug_report_port()
            print(f"[API DEBUG] process={br_process}, port={br_port}, poll={br_process.poll() if br_process else 'N/A'}")
            if br_process and br_port and br_process.poll() is None:
                try:
                    proxy_url = f'http://localhost:{br_port}{self.path}'
                    print(f"[API PROXY] Proxying API request to {proxy_url}")

                    headers = self._proxy_headers_to_node()

                    # Forward the request
                    response = requests.get(
                        proxy_url,
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
                    return
                except Exception as e:
                    print(f"[API PROXY ERROR] {e}")
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to process API request: {str(e)}'
                    }).encode()

                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
                    return
            else:
                error_msg = json.dumps({
                    'success': False,
                    'error': 'API server is not available'
                }).encode()

                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
                return

        # Handle boss search requests (using /bosses/ not /api/bosses/ to route to port 6100, not 8001)
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
                    self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(response)
                return
                
            except Exception as e:
                import traceback
                error_trace = traceback.format_exc()
                # Log to stderr which systemd/journald should capture
                sys.stderr.write(f"[BOSS SEARCH ERROR] {str(e)}\n{error_trace}\n")
                error_msg = json.dumps({
                    'success': False,
                    'error': f'Failed to search bosses: {str(e)}',
                    'traceback': error_trace if '--debug' in sys.argv else None
                }).encode()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
                return
        
        # Handle boss scrape requests
        elif parsed_path.startswith('/bosses/scrape'):
            try:
                print(f"[BOSS SCRAPE] Path received: {self.path}")
                from urllib.parse import parse_qs, urlparse
                parsed = urlparse(self.path)
                query_params = parse_qs(parsed.query)
                boss_id = query_params.get('id', [''])[0]
                print(f"[BOSS SCRAPE] Boss ID: {boss_id}")
                
                if not boss_id:
                    error_msg = json.dumps({
                        'success': False,
                        'error': 'Missing query parameter: id'
                    }).encode()
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
                    return
                
                # Scrape boss data
                print(f"[BOSS SCRAPE] Calling scrape_boss with ID: {boss_id}")
                boss_data = scrape_boss(boss_id)
                
                if not boss_data:
                    error_msg = json.dumps({
                        'success': False,
                        'error': 'Failed to scrape boss data'
                    }).encode()
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
                    return
                
                response = json.dumps({
                    'success': True,
                    'boss': boss_data
                }).encode()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(response)
                return
                
            except Exception as e:
                print(f"[BOSS SCRAPE] Error: {e}")
                import traceback
                traceback.print_exc()
                error_msg = json.dumps({
                    'success': False,
                    'error': f'Failed to scrape boss: {str(e)}'
                }).encode()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
                return
        
        # Handle build load requests
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
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
                else:
                    response = json.dumps({
                        'success': True,
                        'build': build_data
                    }).encode()

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(response)

            except Exception as e:
                error_msg = json.dumps({
                    'success': False,
                    'error': f'Failed to load build: {str(e)}'
                }).encode()

                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)

        # Handle bug report screenshot requests - proxy to bug report server (must come before /bug-reports)
        elif parsed_path.startswith('/bug-reports/') and parsed_path != '/bug-reports/':
            br_process = self.get_bug_report_process()
            br_port = self.get_bug_report_port()
            if br_process and br_port and br_process.poll() is None:
                try:
                    proxy_url = f'http://localhost:{br_port}{self.path}'
                    print(f"[BUG REPORTS PROXY] Proxying screenshot request to {proxy_url}")
                    with urllib.request.urlopen(proxy_url, timeout=10) as response:
                        data = response.read()
                        self.send_response(200)
                        # Determine content type from file extension
                        if self.path.endswith('.png'):
                            self.send_header('Content-Type', 'image/png')
                        elif self.path.endswith('.jpg') or self.path.endswith('.jpeg'):
                            self.send_header('Content-Type', 'image/jpeg')
                        elif self.path.endswith('.gif'):
                            self.send_header('Content-Type', 'image/gif')
                        elif self.path.endswith('.webp'):
                            self.send_header('Content-Type', 'image/webp')
                        else:
                            self.send_header('Content-Type', 'application/octet-stream')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(data)
                except urllib.error.HTTPError as e:
                    self.send_response(e.code)
                    self.end_headers()
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to fetch screenshot: {str(e)}'
                    }).encode()
                    self.wfile.write(error_msg)
            else:
                self.send_response(503)
                self.end_headers()

        # Proxy /bug-reports requests to the bug report server (list endpoint)
        elif parsed_path == '/bug-reports' or parsed_path == '/bug-reports/':
            br_process = self.get_bug_report_process()
            br_port = self.get_bug_report_port()
            if br_process and br_port and br_process.poll() is None:
                try:
                    # Preserve query parameters from original request
                    query_string = self.path.split('?', 1)[1] if '?' in self.path else ''
                    proxy_url = f'http://localhost:{br_port}/bug-reports' + (f'?{query_string}' if query_string else '')
                    print(f"[BUG REPORTS PROXY] Proxying to {proxy_url}")
                    req = urllib.request.Request(proxy_url)
                    with urllib.request.urlopen(req, timeout=10) as response:
                        data = response.read()
                        # Ensure we have valid data
                        if data:
                            try:
                                # Try to parse as JSON to validate
                                json.loads(data.decode('utf-8'))
                                self.send_response(200)
                                self.send_header('Content-Type', 'application/json; charset=utf-8')
                                self.send_header('Access-Control-Allow-Origin', '*')
                                self.send_header('Content-Length', str(len(data)))
                                # Prevent caching of bug reports
                                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
                                self.send_header('Pragma', 'no-cache')
                                self.send_header('Expires', '0')
                                self.end_headers()
                                self.wfile.write(data)
                            except json.JSONDecodeError as e:
                                print(f"[BUG REPORTS PROXY ERROR] Invalid JSON from bug report server: {e}")
                                print(f"[BUG REPORTS PROXY ERROR] Response data (first 200 chars): {data[:200]}")
                                error_msg = json.dumps({
                                    'success': False,
                                    'error': 'Invalid response from bug report server'
                                }).encode()
                                self.send_response(500)
                                self.send_header('Content-Type', 'application/json')
                                self.send_header('Access-Control-Allow-Origin', '*')
                                self.end_headers()
                                self.wfile.write(error_msg)
                        else:
                            error_msg = json.dumps({
                                'success': False,
                                'error': 'Empty response from bug report server'
                            }).encode()
                            self.send_response(500)
                            self.send_header('Content-Type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(error_msg)
                except urllib.error.URLError as e:
                    print(f"[BUG REPORTS PROXY ERROR] Failed to connect to bug report server on port {br_port}: {e}")
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to connect to bug report server on port {br_port}: {str(e)}'
                    }).encode()
                    self.send_response(503)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
                except Exception as e:
                    print(f"[BUG REPORTS PROXY ERROR] Unexpected error: {e}")
                    error_msg = json.dumps({
                        'success': False,
                        'error': f'Failed to fetch bug reports: {str(e)}'
                    }).encode()
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(error_msg)
            else:
                print(f"[BUG REPORTS PROXY] Bug report server not available. Process: {br_process}, Port: {br_port}")
                error_msg = json.dumps({
                    'success': False,
                    'error': 'Bug report server is not available'
                }).encode()
                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)

        # Proxy /api/armory requests to the armory proxy server
        elif self.path.startswith('/api/armory'):
            try:
                # Forward the request to localhost:8001
                proxy_url = f'http://localhost:{PROXY_PORT}{self.path}'

                with urllib.request.urlopen(proxy_url, timeout=10) as response:
                    data = response.read()

                    # Send successful response
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(data)

            except urllib.error.URLError as e:
                # Proxy error
                error_msg = json.dumps({
                    'success': False,
                    'error': f'Proxy error: {str(e)}'
                }).encode()

                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)

            except Exception as e:
                # Other errors
                error_msg = json.dumps({
                    'success': False,
                    'error': f'Server error: {str(e)}'
                }).encode()

                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(error_msg)
        else:
            # Static file serving.
            # Priority: dist/ (Vite production build) → project root (dev / fallback)
            script_dir = os.path.dirname(os.path.abspath(__file__))
            dist_dir = os.path.join(script_dir, 'dist')

            # Pre-compressed gzip serving for large JSON files.
            # spells.json: 14.5 MB → 1 MB (14x).  Item JSONs: ~7 MB → ~730 KB (10x).
            # Serve the .gz file directly when the browser accepts gzip encoding.
            if parsed_path.endswith('.json'):
                accept_encoding = self.headers.get('Accept-Encoding', '')
                if 'gzip' in accept_encoding:
                    gz_rel = parsed_path.lstrip('/') + '.gz'
                    # Search dist/ then project root
                    search_dirs = [dist_dir, script_dir] if os.path.isdir(dist_dir) else [script_dir]
                    gz_path = None
                    for base in search_dirs:
                        candidate = os.path.join(base, gz_rel)
                        if os.path.isfile(candidate):
                            gz_path = candidate
                            break
                    if gz_path:
                        try:
                            file_size = os.path.getsize(gz_path)
                            self.send_response(200)
                            self.send_header('Content-Type', 'application/json')
                            self.send_header('Content-Encoding', 'gzip')
                            self.send_header('Content-Length', str(file_size))
                            self.send_header('Vary', 'Accept-Encoding')
                            self.end_headers()
                            with open(gz_path, 'rb') as f:
                                while True:
                                    chunk = f.read(65536)
                                    if not chunk:
                                        break
                                    self.wfile.write(chunk)
                            return
                        except Exception as e:
                            print(f"[Server] Error serving gzip file {gz_path}: {e}")
                            # Fall through to normal serving

            # SPA routes: /gear-planner and /gp serve the same shell as /
            if parsed_path in ('/gear-planner', '/gp', '/gear-planner/', '/gp/'):
                self.path = '/index.html'

            # Production serves dist/ only; keep selected root data files reachable
            # (icon catalog is not part of the Vite app graph).
            if parsed_path == '/data/wow-icons.json':
                icon_path = os.path.join(script_dir, 'data', 'wow-icons.json')
                if os.path.isfile(icon_path):
                    try:
                        with open(icon_path, 'rb') as f:
                            data = f.read()
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', str(len(data)))
                        self.send_header('Cache-Control', 'public, max-age=86400')
                        self.end_headers()
                        self.wfile.write(data)
                        return
                    except Exception as e:
                        print(f"[Server] Error serving wow-icons.json: {e}")

            # Serve all static files (including JSON) through SimpleHTTPRequestHandler.
            # This sets proper Content-Length, streams efficiently, and handles MIME types.
            # Check dist/ first (Vite production build), fall back to project root.
            if os.path.isdir(dist_dir) and os.path.isfile(os.path.join(dist_dir, 'index.html')):
                self.directory = dist_dir
            else:
                self.directory = script_dir
            super().do_GET()

# Boss scraping functions (from scrape_bosses.py)
BOSS_DB_URL = "https://octowow.st/db"

def search_bosses_by_name(query):
    """Search for bosses by name and return list of matches with IDs"""
    search_url = f"{BOSS_DB_URL}/"
    params = {"search": query}
    
    try:
        sys.stderr.write(f"[BOSS SEARCH] Searching for: '{query}'\n")
        response = requests.get(search_url, params=params, timeout=10)
        response.raise_for_status()
        html_content = response.text
        
        results = []
        
        # The NPC data is embedded in JavaScript Listview initialization
        # Find the start of the data array and extract it properly (handling nested brackets)
        npc_data_start = html_content.find("template:'npc'")
        if npc_data_start == -1:
            sys.stderr.write("[BOSS SEARCH] No NPC Listview found in HTML\n")
        else:
            # Find data: [ after template:'npc'
            data_marker = html_content.find("data:", npc_data_start)
            if data_marker == -1:
                sys.stderr.write("[BOSS SEARCH] No data: field found\n")
            else:
                # Find the opening [
                bracket_start = html_content.find('[', data_marker)
                if bracket_start == -1:
                    sys.stderr.write("[BOSS SEARCH] No opening bracket found\n")
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
                    sys.stderr.write(f"[BOSS SEARCH] Found NPC Listview data (length: {len(npc_data_str)})\n")
                    
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
                        url = f"{BOSS_DB_URL}/?npc={npc_id}"
                        
                        results.append({
                            'id': npc_id,
                            'name': name,
                            'url': url,
                            'is_boss': is_boss,
                            'level': level_str,
                            'classification': classification
                        })
                        sys.stderr.write(f"[BOSS SEARCH] Found: {name} (ID: {npc_id}, Classification: {classification}, Boss: {is_boss})\n")
        
        sys.stderr.write(f"[BOSS SEARCH] Total results: {len(results)}\n")
        # Return all results - let user choose (no boss filtering)
        return results
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        sys.stderr.write(f"[BOSS SEARCH] Error searching bosses: {e}\n{error_trace}\n")
        return []

def get_boss_page(boss_id):
    """Get the boss detail page"""
    url = f"{BOSS_DB_URL}/"
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
    
    name_elem = soup.find('h1')
    if name_elem:
        name_text = name_elem.get_text().strip()
        boss_data['name'] = name_text.split(' - ')[0].strip()
    
    tables = soup.find_all('table')
    for table in tables:
        table_text = table.get_text()
        damage_match = re.search(r'Damage[:\s]+([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)', table_text, re.IGNORECASE)
        if damage_match:
            min_dmg_str = damage_match.group(1).replace(',', '')
            max_dmg_str = damage_match.group(2).replace(',', '')
            boss_data['minDamage'] = int(float(min_dmg_str))
            boss_data['maxDamage'] = int(float(max_dmg_str))
            break
    
    if not boss_data['minDamage']:
        page_text = soup.get_text()
        damage_match = re.search(r'Damage[:\s]+([\d,]+\.?\d*)\s*[-–]\s*([\d,]+\.?\d*)', page_text, re.IGNORECASE)
        if damage_match:
            min_dmg_str = damage_match.group(1).replace(',', '')
            max_dmg_str = damage_match.group(2).replace(',', '')
            boss_data['minDamage'] = int(float(min_dmg_str))
            boss_data['maxDamage'] = int(float(max_dmg_str))
    
    page_text = soup.get_text()
    level_match = re.search(r'Level[:\s]+(\d+|\?\?)', page_text, re.IGNORECASE)
    if level_match:
        level_str = level_match.group(1)
        if level_str == '??':
            boss_data['level'] = 63
        else:
            boss_data['level'] = int(level_str)
    
    speed_match = re.search(r'Attack\s+Speed[:\s]+([\d,]+\.?\d*)', page_text, re.IGNORECASE)
    if speed_match:
        speed_str = speed_match.group(1).replace(',', '')
        boss_data['attackSpeed'] = float(speed_str)
    else:
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
        return None
    
    html = get_boss_page(boss_id)
    if not html:
        return None
    
    boss_data = parse_boss_damage(html)
    
    if boss_data['name']:
        boss_data['id'] = re.sub(r'[^a-z0-9]+', '', boss_data['name'].lower())
    else:
        boss_data['id'] = f"boss_{boss_id}"
    
    npc_id = int(boss_id)
    boss_data['npcId'] = npc_id
    
    # Always use database attack speed (authoritative source)
    # Database values take precedence over scraped HTML values
    database_attack_speed = get_creature_attack_speed(npc_id)
    scraped_attack_speed = boss_data.get('attackSpeed', 2.0)
    
    boss_data['attackSpeed'] = database_attack_speed
    
    if database_attack_speed != scraped_attack_speed:
        print(f"[BOSS SCRAPE] NPC {npc_id}: Using database attack speed {database_attack_speed}s (scraped: {scraped_attack_speed}s)")
    else:
        print(f"[BOSS SCRAPE] NPC {npc_id}: Attack speed {database_attack_speed}s (matches scraped value)")
    
    return boss_data

Handler = NoCacheHTTPRequestHandler

# Custom TCPServer with SO_REUSEADDR enabled
class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

try:
    with ReusableTCPServer(("", HTTP_PORT), Handler) as httpd:
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

        # Start the HTTP server and keep it running
        httpd.serve_forever()

except OSError as e:
    print(f"\nERROR: Could not start HTTP server on port {HTTP_PORT}")
    print(f"Error: {e}")
    print(f"Port {HTTP_PORT} may already be in use.")
    cleanup(None, None)
