import csv
import json
from collections import defaultdict
import os

# ----------------------------------------------------------------
# Sucursales — cada una tiene su propio CSV de origen y JSON de salida
# ----------------------------------------------------------------
SUCURSALES = {
    'leloir':   'productos-leloir',
    'castelar': 'productos-castelar',
    'pinamar':  'productos-pinamar',
}

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')


def convertir(nombre_base: str):
    """Convierte data/<nombre_base>.csv → data/<nombre_base>.json"""
    ruta_csv  = os.path.join(DATA_DIR, f'{nombre_base}.csv')
    ruta_json = os.path.join(DATA_DIR, f'{nombre_base}.json')

    if not os.path.exists(ruta_csv):
        print(f'  [!] No existe: {ruta_csv} — saltando.')
        return

    productos_por_categoria = defaultdict(list)

    with open(ruta_csv, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=',')
        print(f'  Columnas: {reader.fieldnames}')

        campos_requeridos = ['id', 'categoria', 'nombre', 'descripcion', 'precio', 'esVegano', 'sinTacc']

        for row in reader:
            # Validar campos
            faltantes = [c for c in campos_requeridos if c not in row]
            if faltantes:
                print(f'  [!] Fila incompleta (faltan {faltantes}): {row}')
                continue

            try:
                producto = {
                    'id':          int(row['id']),
                    'nombre':      row['nombre'].strip(),
                    'descripcion': row['descripcion'].strip(),
                    'precio':      int(row['precio']),
                    'esVegano':    row['esVegano'].strip().lower() == 'true',
                    'sinTacc':     row['sinTacc'].strip().lower() == 'true',
                }
                categoria = row['categoria'].strip()
                productos_por_categoria[categoria].append(producto)

            except ValueError as e:
                print(f'  [!] Error de valor en fila {row}: {e}')
            except Exception as e:
                print(f'  [!] Error inesperado en fila {row}: {e}')

    total = sum(len(v) for v in productos_por_categoria.values())
    print(f'  Productos procesados: {total}')
    print(f'  Categorías: {list(productos_por_categoria.keys())}')

    with open(ruta_json, 'w', encoding='utf-8') as f:
        json.dump(dict(productos_por_categoria), f, ensure_ascii=False, indent=2)

    print(f'  OK Guardado: {ruta_json}\n')


if __name__ == '__main__':
    print('=== Conversion CSV -> JSON por sucursal ===\n')
    for sucursal, nombre_base in SUCURSALES.items():
        print(f'>> {sucursal.upper()} ({nombre_base}.csv)')
        convertir(nombre_base)
    print('=== Listo ===')