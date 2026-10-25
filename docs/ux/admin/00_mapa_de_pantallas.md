# Mesa al día · Rol ADMINISTRADOR · Mapa de pantallas y flujo (tarea 2.5)

Estado: **Propuesta para revisión y aprobación de Anderson (23/10/2026)**.  
Dispositivo base: Pantalla grande o PC (1366 px de ancho, revisado también a 1920 px), con adaptación a tableta y celular (pantalla A7).  
Convención: Los wireframes se dibujan en esta carpeta (`docs/ux/admin/`) en HTML + CSS estático (`wireframe.css` + `escritorio.css`, copiados de Caja) con notas explicativas al pie por pantalla y prefijo **A** (A0 a A7). Se basan en `docs/00_contexto_para_continuar.md`, `docs/02_api_y_eventos.md` y los scripts `db/01_*.sql` a `db/04_*.sql`.

---

## Qué hace el Administrador

1. **Gestión de Personal y Acceso (RF1, CU1, CU2, CU3):**
   - Alta de empleados con su rol (`ADMIN`, `MESERO`, `COCINA`, `BAR`, `CAJA`).
   - Edición de datos, activación/desactivación de cuentas (baja lógica: `activo = false`).
   - Restablecimiento asistido de contraseña temporal o forzada.
2. **Sectores, Mesas y Asignación (RF2, CU4, CU5, CU6, CU7):**
   - Configuración de la distribución física: creación de sectores y registro de mesas (número, sector).
   - Asignación de mesero responsable por sector (cierra asignación previa y abre una nueva con vigencia).
   - Consulta de mesas en tiempo real y reasignación temporal de mesa por ausencia/sobrecarga (CU7).
3. **Catálogo de Menú y Personalización (RF3, RF9, CU10, CU12):**
   - Alta y edición de productos, precios, categorías y destino (`COCINA` o `BAR`).
   - Configuración de combos (componentes fijos, componentes removibles, extras).
   - Catálogo único de opciones de personalización, precios extra y restricciones (combinaciones prohibidas).
   - Habilitación/bloqueo de productos y combos (solo Admin puede bloquear un combo directamente).
4. **Supervisión, Actividad y Reportes (RF15, CU24, Obj. 6):**
   - **Actividad diaria del mesero:** consulta detallada de pedidos despachados por cada mesero en una fecha, excluyendo pedidos cancelados.
   - **Resumen del día:** vista global de ventas, recaudación, métodos de pago, pedidos y cancelaciones (compartido con Caja).
5. **Parámetros del Sistema (RF6, RF8):**
   - Consulta y ajuste de parámetros operativos: ventana de cancelación (3 min), umbrales de demora de cocina (20 min) y bar (7 min).
   - Visualización del estado de los interruptores de preparación anticipada de cada área.

---

## Estructura base (todas las pantallas, salvo el ingreso)

- **Barra superior fija:** Rol «Administrador», nombre del usuario, indicador de conexión en tiempo real (● en línea / ○ sin conexión) y botón «Cerrar sesión».
- **Pestañas principales (5):**
  1. **Personal** (Usuarios y accesos)
  2. **Sectores y Mesas** (Sectores, mesas y asignación de meseros)
  3. **Menú** (Productos, combos, opciones y restricciones)
  4. **Supervisión** (Actividad de meseros y resumen del día)
  5. **Configuración** (Parámetros del sistema)
- **Avisos en tiempo real:** Avisos emergentes en esquina inferior derecha (`sector.asignacion`, cambios de estado de mesas, desconexión). Sin historial persistente (reconsulta por REST tras reconectar).

---

## Inventario de Pantallas

| # | Pantalla | Qué resuelve | Origen (RF/CU) |
|---|---|---|---|
| **A0** | Ingreso | Usuario, contraseña y validaciones (`CREDENCIALES_INVALIDAS`, `USUARIO_INACTIVO`). | CU2 |
| **A1a** | Personal · Lista de usuarios | Tabla de usuarios: nombre, login, rol, estado (activo/inactivo), fecha de creación; botones «Nuevo usuario», «Editar» y «Restablecer clave». | RF1, CU1 |
| **A1b** | Personal · Modal usuario | Ventana modal para crear o editar usuario (nombre, login, rol, contraseña / restablecimiento asistido). Errores `USUARIO_DUPLICADO`. | CU1 |
| **A2a** | Sectores y Mesas · Sectores y asignación | Lista de sectores con sus mesas asignadas y mesero responsable vigente. Acción directa «Asignar mesero» (abre selector modal). | RF2, CU4, CU5, CU6 |
| **A2b** | Sectores y Mesas · Modal sector | Crear / editar sector: nombre y selector múltiple de mesas. Reglas: `SECTOR_NOMBRE_REPETIDO`, `SECTOR_SIN_MESAS`. | CU4 |
| **A2c** | Sectores y Mesas · Mesas y reasignación | Tabla completa de mesas con sector, estado actual (`v_estado_mesa`) y acción de reasignación temporal de mesa (CU7). | CU7, CU8 |
| **A3a** | Menú · Productos y combos | Tabla de productos por categoría y destino (`COCINA`/`BAR`), precio, disponibilidad, stock e indicador de combos. Acciones «Nuevo producto», «Editar» y «Bloquear/Habilitar». | RF3, RF9 |
| **A3b** | Menú · Modal producto o combo | Formulario modal: nombre, categoría, precio, destino, stock contable opcional, flag `permite_anticipada`. Si es combo: gestión de componentes (fijos/removibles). | RF3, CU11 |
| **A3c** | Menú · Opciones y restricciones | Catálogo único de opciones, precio extra, productos que la usan (`usada_en`), interruptor de disponibilidad y tabla de combinaciones prohibidas (`restriccion_opcion`). | RF3, CU10, CU12 |
| **A4a** | Supervisión · Actividad del mesero | Consulta de actividad diaria (CU24, RF15): selector de mesero y fecha, resumen de pedidos activos, mesas atendidas y detalle de pedidos sin cancelados. | RF15, CU24 |
| **A4b** | Supervisión · Resumen diario | Cuatro bloques (cobrado con desglose de métodos, por cobrar, pedidos, cancelaciones) y tabla de pedidos del día con filtro de fecha. | Obj. 6 |
| **A5** | Configuración · Parámetros | Panel de parámetros del sistema: ventana de cancelación (minutos), umbrales de demora de cocina y bar, y estado de interruptores de anticipada. | RF6, RF8 |
| **A6** | Estados especiales | Desconexión, reconexión, avisos emergentes, sesión expirada por inactividad y modal de confirmación de salida. | CU3, CU15 |
| **A7** | Otros dispositivos | Adaptación responsiva de tablas y formularios a tableta (1024 px) y celular (390 px). | Multidispositivo |

---

## Flujo de navegación

```
A0 Ingreso ──► A1a Personal (pantalla de inicio del administrador)
 │
 ├──► Pestaña Personal (A1a) ──► «Nuevo usuario» / «Editar» ──► Modal A1b
 │
 ├──► Pestaña Sectores y Mesas:
 │     ├── Subpestaña Sectores (A2a) ──► «Nuevo sector» / «Editar» ──► Modal A2b
 │     │                              ──► «Asignar mesero» ──► Modal de asignación
 │     └── Subpestaña Mesas (A2c) ────► «Reasignar mesa» ──► Modal CU7
 │
 ├──► Pestaña Menú:
 │     ├── Subpestaña Productos (A3a) ──► «Nuevo producto» ──► Modal A3b
 │     └── Subpestaña Opciones (A3c) ──► «Nueva opción» / «Restricción»
 │
 ├──► Pestaña Supervisión:
 │     ├── Subpestaña Actividad mesero (A4a) [Selector de mesero y fecha]
 │     └── Subpestaña Resumen diario (A4b) [Idéntico a K6 con selector de fecha]
 │
 ├──► Pestaña Configuración (A5) [Parámetros operativos]
 │
 └──► Barra superior ──► «Cerrar sesión» ──► Modal confirmación (A6) ──► A0
```

---

## Decisiones de diseño propuestas para el Administrador

1. **D1 · Inicio en «Personal»:** Al ingresar, Admin aterriza en la lista de usuarios (A1a), ya que la administración de personal y accesos es su responsabilidad primaria.
2. **D2 · Baja lógica de usuarios y productos:** Ningún usuario ni producto se elimina con `DELETE` físico para no romper integridad histórica con pedidos, asignaciones ni comandas. Se gestionan mediante el interruptor `activo` (usuarios) y `disponible` (productos).
3. **D3 · Los combos solo los bloquea Admin:** En Cocina y Bar los combos no aparecen para bloquear porque no tienen destino físico directo. Solo Admin tiene la potestad de deshabilitar el combo como producto global en A3a/A3b.
4. **D4 · Asignación de sectores con historial:** La asignación de mesero a sector se hace con vigencia (`vigente_desde`, `vigente_hasta`). Asignar un nuevo mesero cierra la fila anterior automáticamente (`PUT /sectores/{id}/asignacion`).
5. **D5 · Resumen diario compartido con Caja:** La pantalla A4b reutiliza la misma estructura de 4 bloques y tabla de pedidos de K6 (`GET /resumen-diario`), permitiendo a Admin auditar la recaudación sin intervenir en la caja operativa.
6. **D6 · Sesión con expiración:** Admin no tiene la excepción de Cocina/Bar (pantallas operativas fijas). Su sesión expira por inactividad según CU3 por motivos de seguridad.
7. **D7 · Restablecimiento asistido de contraseña:** En A1b, Admin no puede ver contraseñas anteriores (almacenadas como hash), pero puede ingresar una nueva contraseña temporal para el usuario.
