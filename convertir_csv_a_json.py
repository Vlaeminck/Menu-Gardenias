import csv
import json
from collections import defaultdict
import os

def convertir_csv_a_json():
    # Obtener la ruta absoluta del directorio actual
    directorio_actual = os.path.dirname(os.path.abspath(__file__))
    ruta_csv = os.path.join(directorio_actual, 'data', 'productos.csv')
    ruta_json = os.path.join(directorio_actual, 'data', 'productos.json')

    try:
        # Verificar si el archivo CSV existe
        if not os.path.exists(ruta_csv):
            print(f"Error: No se encuentra el archivo en: {ruta_csv}")
            return

        # Diccionario para agrupar productos por categoría
        productos_por_categoria = defaultdict(list)
        
        # Leer el CSV usando punto y coma como separador
        with open(ruta_csv, 'r', encoding='utf-8-sig') as file:
            # Usar ; como separador
            reader = csv.DictReader(file, delimiter=';')
            
            # Verificar las columnas
            print("\nColumnas encontradas:", reader.fieldnames)
            
            # Procesar cada fila
            for row in reader:
                print("\nProcesando fila:", row)
                
                # Verificar que todos los campos necesarios existen
                campos_requeridos = ['id', 'categoria', 'nombre', 'descripcion', 'precio', 'esVegano', 'sinTacc']
                for campo in campos_requeridos:
                    if campo not in row:
                        print(f"Error: Falta el campo '{campo}' en la fila {row}")
                        continue

                try:
                    producto = {
                        'id': int(row['id']),
                        'nombre': row['nombre'].strip(),
                        'descripcion': row['descripcion'].strip(),
                        'precio': int(row['precio']),
                        'esVegano': row['esVegano'].lower() == 'true',
                        'sinTacc': row['sinTacc'].lower() == 'true'
                    }
                    
                    categoria = row['categoria'].strip()
                    productos_por_categoria[categoria].append(producto)
                    print(f"Producto agregado: {producto['nombre']} en categoría {categoria}")
                
                except ValueError as e:
                    print(f"Error procesando valores en la fila {row}: {e}")
                except Exception as e:
                    print(f"Error inesperado procesando la fila {row}: {e}")

        # Verificar si se procesaron productos
        if not productos_por_categoria:
            print("Advertencia: No se procesaron productos")
        else:
            print(f"\nSe procesaron {sum(len(prods) for prods in productos_por_categoria.values())} productos")
            print("Categorías encontradas:", list(productos_por_categoria.keys()))

        # Guardar como JSON
        with open(ruta_json, 'w', encoding='utf-8') as file:
            json.dump(dict(productos_por_categoria), file, ensure_ascii=False, indent=2)
            print(f"\nArchivo JSON guardado exitosamente en: {ruta_json}")

    except Exception as e:
        print(f"Error general: {e}")

if __name__ == '__main__':
    print("Iniciando conversión de CSV a JSON...")
    convertir_csv_a_json()
    print("Proceso terminado") 