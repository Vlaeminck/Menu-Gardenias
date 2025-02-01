import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs

class MessageHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/save-message':
            # Configurar headers CORS
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            # Leer y procesar datos
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            message_data = json.loads(post_data.decode('utf-8'))
            
            # Cargar mensajes existentes
            messages_file = 'data/messages.json'
            try:
                with open(messages_file, 'r', encoding='utf-8') as f:
                    messages = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                messages = []
            
            # Agregar nuevo mensaje
            messages.append(message_data)
            
            # Guardar mensajes actualizados
            try:
                with open(messages_file, 'w', encoding='utf-8') as f:
                    json.dump(messages, f, ensure_ascii=False, indent=2)
                response = {'status': 'success', 'message': 'Mensaje guardado correctamente'}
            except Exception as e:
                response = {'status': 'error', 'message': str(e)}
            
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()

def run(server_class=HTTPServer, handler_class=MessageHandler, port=8000):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f'Servidor iniciado en http://localhost:{port}')
    print('Presiona Ctrl+C para detener el servidor')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor detenido')
        httpd.server_close()

if __name__ == '__main__':
    run() 