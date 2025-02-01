import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from convertir_csv_a_json import convertir_csv_a_json

class ManejadorCambios(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith('productos.csv'):
            print("Cambios detectados en el CSV. Actualizando JSON...")
            convertir_csv_a_json()
            print("JSON actualizado!")

def vigilar_cambios():
    event_handler = ManejadorCambios()
    observer = Observer()
    observer.schedule(event_handler, path='data/', recursive=False)
    observer.start()

    print("Vigilando cambios en productos.csv...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("Vigilancia detenida")
    
    observer.join()

if __name__ == "__main__":
    vigilar_cambios() 