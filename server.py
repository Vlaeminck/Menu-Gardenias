"""
Gardenias — Servidor local con API para guardar precios.

Sirve los archivos estáticos del proyecto y expone:
  POST /api/save-prices  →  Guarda el JSON de una sucursal en data/

Uso:
  python server.py
  → Abre http://localhost:8080/admin.html

Presioná Ctrl+C para detener.
"""

import json
import os
import shutil
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')

VALID_FILES = {
    'leloir':   'productos-leloir.json',
    'castelar': 'productos-castelar.json',
    'pinamar':  'productos-pinamar.json',
}


class GardeniasHandler(SimpleHTTPRequestHandler):
    """Sirve archivos estáticos + endpoint API para guardar precios."""

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/save-prices':
            self._handle_save_prices()
        elif self.path == '/save-message':
            self._handle_save_message()
        else:
            self.send_error(404, 'Endpoint no encontrado')

    # -- Save Message (Legacy Support) --------------------------------------

    def _handle_save_message(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(content_length)
            message_data = json.loads(raw.decode('utf-8'))

            messages_file = os.path.join(DATA_DIR, 'messages.json')
            
            try:
                with open(messages_file, 'r', encoding='utf-8') as f:
                    messages = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                messages = []
            
            messages.append(message_data)
            
            with open(messages_file, 'w', encoding='utf-8') as f:
                json.dump(messages, f, ensure_ascii=False, indent=2)
            
            self._json_response(200, {
                'status': 'success', 
                'message': 'Mensaje guardado correctamente'
            })
        except Exception as e:
            self._json_response(500, {
                'status': 'error', 
                'message': str(e)
            })

    # ── Save Prices ──────────────────────────────────────────────

    def _handle_save_prices(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(content_length)
            payload = json.loads(raw.decode('utf-8'))

            branch = payload.get('branch', '')
            data   = payload.get('data')

            if branch not in VALID_FILES:
                self._json_response(400, {
                    'status': 'error',
                    'message': f'Sucursal inválida: {branch}'
                })
                return

            if not isinstance(data, dict):
                self._json_response(400, {
                    'status': 'error',
                    'message': 'Datos inválidos: se esperaba un objeto JSON'
                })
                return

            filename = VALID_FILES[branch]
            filepath = os.path.join(DATA_DIR, filename)

            # Crear backup antes de sobrescribir
            self._create_backup(filepath, filename)

            # Guardar nuevo JSON
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f'  [OK] Guardado: {filename}')

            self._json_response(200, {
                'status': 'success',
                'message': f'Precios de {branch} guardados correctamente',
                'file': filename
            })

        except json.JSONDecodeError:
            self._json_response(400, {
                'status': 'error',
                'message': 'JSON inválido en el body'
            })
        except Exception as e:
            print(f'  [ERROR] Error guardando: {e}')
            self._json_response(500, {
                'status': 'error',
                'message': str(e)
            })

    # ── Backup ───────────────────────────────────────────────────

    def _create_backup(self, filepath, filename):
        """Crea un backup del archivo actual antes de sobreescribir."""
        if not os.path.exists(filepath):
            return

        os.makedirs(BACKUP_DIR, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        name, ext = os.path.splitext(filename)
        backup_name = f'{name}_backup_{timestamp}{ext}'
        backup_path = os.path.join(BACKUP_DIR, backup_name)

        shutil.copy2(filepath, backup_path)
        print(f'  [BACKUP] {backup_name}')

        # Mantener solo los últimos 20 backups por sucursal
        self._cleanup_backups(name)

    def _cleanup_backups(self, name_prefix, keep=20):
        """Elimina backups viejos manteniendo los últimos `keep`."""
        if not os.path.exists(BACKUP_DIR):
            return

        backups = sorted([
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith(name_prefix) and '_backup_' in f
        ])

        if len(backups) > keep:
            for old in backups[:-keep]:
                os.remove(os.path.join(BACKUP_DIR, old))
                print(f'  [CLEANUP] Backup viejo eliminado: {old}')

    # ── Helpers ──────────────────────────────────────────────────

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json_response(self, status, data):
        self.send_response(status)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def end_headers(self):
        """Disable caching for JSON data files."""
        if self.path and self.path.startswith('/data/'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        """Silencia logs de archivos estaticos, solo muestra API."""
        try:
            msg = str(args[0]) if args else ''
            if '/api/' in msg or '/save-message' in msg:
                super().log_message(format, *args)
        except:
            pass


def run():
    server = HTTPServer(('', PORT), GardeniasHandler)
    print(f'\nGardenias Server')
    print(f'   http://localhost:{PORT}/src/auth/login.html  <- Panel de precios')
    print(f'   http://localhost:{PORT}/index.html   <- Menu publico')
    print(f'\n   Ctrl+C para detener\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor detenido')
        server.server_close()


if __name__ == '__main__':
    run()
