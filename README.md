# Menú Gardenias Deli & Market

Este repositorio contiene el menú digital interactivo y el panel de administración de precios para las sucursales de **Gardenias Deli & Market** (Parque Leloir, Castelar y Pinamar).

El sistema se divide en dos partes principales:
1. **Menú Público**: La interfaz que ven los clientes, donde pueden seleccionar la sucursal, navegar por las categorías de productos, y ver información de precios y dietas (Veggie, Sin TACC).
2. **Panel de Administración**: Un panel protegido por contraseña que permite a los administradores actualizar precios, crear secciones, reordenarlas y publicar avisos temporales sin necesidad de tocar código.

---

## 🛠 Tecnologías Utilizadas

El proyecto está construido con un stack frontend ligero y una base de datos en tiempo real:

- **HTML5, CSS3, Vanilla JavaScript**: Para una interfaz rápida, sin dependencias pesadas y fácil de mantener.
- **Firebase Authentication**: Gestiona el inicio de sesión seguro para el panel de administración.
- **Firebase Realtime Database**: Almacena de forma instantánea y en la nube el catálogo de productos de cada sucursal (`/sucursales/leloir`, `/sucursales/castelar`, `/sucursales/pinamar`).
- **Archivos JSON**: Se mantienen copias locales de los productos a modo de respaldo y estructura inicial.

---

## 🔐 Firebase y Base de Datos

El proyecto depende de la configuración de Firebase alojada en el código. Firebase provee dos servicios críticos:

1. **Autenticación (Auth)**: 
   - El acceso al panel se realiza mediante correo electrónico y contraseña.
   - El estado de la sesión está protegido; si un usuario no está logueado, es redirigido automáticamente fuera del `/dashboard`.

2. **Base de Datos (Realtime Database)**:
   - Los datos se guardan bajo el nodo `/sucursales/`.
   - Si la base de datos de Firebase estuviese vacía en un primer despliegue, el sistema intentará descargar automáticamente la información desde los archivos locales `.json` de la carpeta `/data/` y luego poblará Firebase.

---

## ⚙️ Funcionalidades del Panel de Administración

Al ingresar como administrador, el usuario tiene acceso a un tablero integral con las siguientes herramientas:

- **Pestañas por Sucursal**: Permite cambiar entre el menú de Parque Leloir, Castelar o Pinamar. Los cambios aplicados son independientes para cada ubicación.
- **Edición en Línea**: Se pueden cambiar los precios directamente escribiendo en las celdas. Se resalta en amarillo cualquier campo modificado antes de guardarlo.
- **Ajuste Masivo de Precios (%)**: Un botón para aumentar o disminuir el precio de todos los productos de una categoría (o de todo el menú) aplicando un porcentaje.
- **Gestión de Categorías**:
  - **Crear**: Agrega nuevas secciones. (Se inyecta un ítem base para evitar que Firebase elimine categorías vacías).
  - **Eliminar y Renombrar**: Botones en la cabecera de cada sección para organizarlas.
  - **Reordenar (Arrastrar y Soltar)**: Usando el ícono de los "puntos" a la izquierda, se pueden arrastrar las categorías para cambiar el orden en el que las ve el cliente.
  - **Ocultar/Mostrar**: Un interruptor (switch) permite ocultar categorías enteras temporalmente.
  - **Transferir**: Permite copiar una categoría completa (con sus productos y precios) hacia la base de datos de otra sucursal.
- **Gestión de Dietas (Veggie / GF)**: Botones interactivos (switches) al lado de cada producto.
- **Avisos Pop-up**: Un botón para activar un mensaje temporal (ej. "Cerrado por vacaciones") que saltará en la pantalla de inicio al cliente que entre a esa sucursal específica.
- **Exportación / Respaldo**: Botón para descargar el `.json` exacto que se está visualizando y guardar copias de seguridad locales.

---

## 🚀 Despliegue y Desarrollo Local

Para correr el proyecto localmente (debido a políticas de CORS y peticiones fetch locales):
1. No se puede abrir directamente `index.html` haciendo doble clic.
2. Es necesario correr un servidor local. Se incluye el script `INICIAR_SERVIDOR.bat` en la raíz, que utiliza NodeJS u otro paquete para levantar la aplicación en `http://localhost:8080`.
3. Todo el desarrollo se puede testear directamente en el navegador de manera instantánea.
