"""
generar_csv_desde_json.py
Genera los archivos CSV de cada sucursal a partir de sus JSON.
Usar UNA SOLA VEZ para inicializar los CSV si no existen.
De ahí en adelante, editar el CSV y correr convertir_csv_a_json.py.
"""
import csv
import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

SUCURSALES = ['leloir', 'castelar', 'pinamar']
CAMPOS = ['id', 'categoria', 'nombre', 'descripcion', 'precio', 'esVegano', 'sinTacc']


def json_a_csv(nombre_base: str):
    ruta_json = os.path.join(DATA_DIR, f'productos-{nombre_base}.json')
    ruta_csv  = os.path.join(DATA_DIR, f'productos-{nombre_base}.csv')

    if not os.path.exists(ruta_json):
        print(f'  [!] No existe {ruta_json} — saltando.')
        return

    with open(ruta_json, 'r', encoding='utf-8') as f:
        data = json.load(f)

    filas = []
    for categoria, productos in data.items():
        for p in productos:
            filas.append({
                'id':          p['id'],
                'categoria':   categoria,
                'nombre':      p['nombre'],
                'descripcion': p.get('descripcion', ''),
                'precio':      p['precio'],
                'esVegano':    str(p.get('esVegano', False)).upper(),
                'sinTacc':     str(p.get('sinTacc', False)).upper(),
            })

    filas.sort(key=lambda x: x['id'])

    with open(ruta_csv, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=CAMPOS)
        writer.writeheader()
        writer.writerows(filas)

    print(f'  OK {ruta_csv} ({len(filas)} productos)')


if __name__ == '__main__':
    print('=== Generando CSVs desde JSON ===\n')
    for s in SUCURSALES:
        print(f'>> {s.upper()}')
        json_a_csv(s)
    print('\n=== Listo ===')
    print('Ahora podés editar cada CSV y regenerar el JSON con: python convertir_csv_a_json.py')
