#!/usr/bin/env python3
"""
Accounting App Server
Serves static files and provides a REST API to persist data in a JSON file.
Usage:
  python server.py [port] [data_file]
Defaults: port=8000, data_file=./data.json
The data file path can be changed at runtime via /api/config.
"""

import os, sys, json, http.server

# Resolve config/data files relative to CWD so the EXE works from any folder
CONFIG_FILE = os.path.join(os.getcwd(), 'config.json')

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_config(cfg):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

# Determine data file path: config > argv > env > default
cfg = load_config()
DATA_FILE = cfg.get('dataFile') or (
    sys.argv[2] if len(sys.argv) > 2 else os.environ.get('APP_DATA_FILE', 'data.json')
)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('APP_PORT', '8000'))
_SERVER_VERSION = 0  # incremented on each save for sync polling

def load_data():
    if not os.path.exists(DATA_FILE):
        return {}
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_data(data):
    global _SERVER_VERSION
    _SERVER_VERSION += 1
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        global DATA_FILE
        if self.path == '/api/debug':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'GET OK')
            return
        if self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps(load_data(), ensure_ascii=False).encode('utf-8'))
            return
        if self.path == '/api/config':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            cfg = load_config()
            self.wfile.write(json.dumps({
                'dataFile': os.path.abspath(DATA_FILE),
                'lastDataFileName': cfg.get('lastDataFileName', ''),
            }, ensure_ascii=False).encode('utf-8'))
            return
        if self.path == '/api/version':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps({'version': _SERVER_VERSION}).encode('utf-8'))
            return
        if self.path.startswith('/api/health'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps({
                'dataFileExists': os.path.exists(DATA_FILE),
                'dataFile': os.path.abspath(DATA_FILE),
            }, ensure_ascii=False).encode('utf-8'))
            return
        # GET-based config setter (fallback if POST fails)
        if self.path.startswith('/api/setconfig?') and 'dataFile=' in self.path:
            try:
                from urllib.parse import parse_qs
                qs = parse_qs(self.path.split('?', 1)[1])
                new_path = (qs.get('dataFile') or [None])[0]
                if new_path:
                    new_abs = os.path.abspath(new_path)
                    if os.path.isdir(new_abs):
                        raise Exception('المسار المحدد هو مجلد، وليس ملف')
                    config = load_config()
                    config['dataFile'] = new_abs
                    if new_abs != os.path.abspath(DATA_FILE):
                        old_data = load_data()
                        DATA_FILE = new_abs
                        save_data(old_data)
                    else:
                        DATA_FILE = new_abs
                    save_config(config)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'ok': True,
                    'dataFile': os.path.abspath(DATA_FILE),
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/debug':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'POST OK')
            return
        if self.path == '/api/data':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length else b'{}'
                data = json.loads(body.decode('utf-8'))
                save_data(data)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return
        if self.path == '/api/config':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length else b'{}'
                req = json.loads(body.decode('utf-8'))
                global DATA_FILE
                new_path = req.get('dataFile')
                config = load_config()
                if new_path:
                    new_abs = os.path.abspath(new_path)
                    if os.path.isdir(new_abs):
                        raise Exception('المسار المحدد هو مجلد، وليس ملف')
                    # Preserve data: copy current data to new path before switching
                    if new_abs != os.path.abspath(DATA_FILE):
                        old_data = load_data()
                        DATA_FILE = new_abs
                        save_data(old_data)
                    else:
                        DATA_FILE = new_abs
                if 'lastDataFileName' in req:
                    config['lastDataFileName'] = req['lastDataFileName']
                save_config(config)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'ok': True,
                    'dataFile': os.path.abspath(DATA_FILE),
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return
        if self.path == '/api/data/upload':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length else b'{}'
                data = json.loads(body.decode('utf-8'))
                save_data(data)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'ok': True,
                    'dataFile': os.path.abspath(DATA_FILE),
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return
        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    print(f'Server running at http://0.0.0.0:{PORT}')
    print(f'Data file: {os.path.abspath(DATA_FILE)}')
    print(f'Serving files from: {os.getcwd()}')
    httpd = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
