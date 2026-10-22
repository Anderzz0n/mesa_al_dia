# Mesa al día · Rol CAJA · Mapa de pantallas y flujo (tarea 2.5)

Estado: **mapa aprobado por Anderson el 22/10/2026** (decisiones D1–D7, D4 revisado, K6 y extras de la sección «Decisiones»). Dispositivo base: pantalla grande o PC (1366 px de ancho, revisado también a 1920 px), con adaptación a tableta y celular (pantalla K8). Supuesto: caja trabaja en un PC.
Los wireframes se dibujan en esta carpeta (HTML + CSS estático; abrir `index.html`) con la misma convención que Cocina y Bar (`wireframe.css` + `escritorio.css`) y se basan en `docs/02_api_y_eventos.md`. Prefijo **K** (la C ya es de Cocina).

## Qué hace Caja

- **Cobrar (RF14, CU16):** ve en una sola lista **todas** las cuentas `PENDIENTE` (ya consumieron y falta pagar), revisa el detalle y las marca como `PAGADA` (la casilla de pago). Registra el método de pago y, si hay, la propina.
- **Cancelaciones (RF8, CU17, CU18, CU19):** aprueba o rechaza las solicitudes tardías del mesero, y cancela directamente un pedido en cualquier momento mientras la cuenta no esté pagada. En ambos casos puede **registrar los productos que ya alcanzaron a prepararse**.
- **Resumen del día (Obj. 6):** cobrado, por cobrar, pedidos, cancelaciones y la lista de pedidos del día.
- **Consulta:** cuentas `ABIERTA` y pagadas de hoy, solo lectura.
- **Ingreso y cierre de sesión (RF1, CU2, CU3).**

## Estructura base (todas las pantallas, salvo el ingreso)

- **Barra superior fija:** rol «Caja», usuario, indicador de conexión (● en línea / ○ sin conexión) y «Cerrar sesión». **Sin** indicador de «Anticipada» (no es de Caja).
- **Pestañas:** Cuentas · Cancelaciones (con contador de solicitudes por resolver) · Resumen.
- **Avisos en tiempo real:** solo avisos emergentes, sin historial (igual que el resto). Los avisos perdidos en una desconexión no se reconstruyen: al reconectar se vuelve a consultar por REST. Franja «Reconectando…» y bloqueo de acciones sin conexión.
- **Hora del servidor** (`hora_servidor`) para cualquier tiempo transcurrido.

## Pantallas

| # | Pantalla | Qué resuelve | Origen (RF/CU) |
|---|---|---|---|
| K0 | Ingreso | Igual que C0 (usuario y contraseña; `CREDENCIALES_INVALIDAS`, `USUARIO_INACTIVO`) | CU2 |
| K1a | Cuentas · Por cobrar (inicio) | Tabla de **todas** las cuentas `PENDIENTE`, de todas las mesas, con total y comandas sin terminar | RF14 |
| K1b | Cuentas · Abiertas | Cuentas `ABIERTA` en solo consulta (para saber qué falta que el mesero marque) | RF14 |
| K1c | Cuentas · Pagadas de hoy | Con hora y usuario de cierre y método de pago; solo consulta | RF14 |
| K2 | Detalle de cuenta | Pedidos con mesero, comandas por área, ítems y total; acciones «Cobrar» y «Cancelar pedido» | RF14, RF8 |
| K3 | Cobrar la cuenta | Ventana: método de pago, propina opcional, calculadora «dividir en partes iguales» y confirmación; errores y resultado | CU16 |
| K4 | Cancelar un pedido (directa) | Ventana: motivo obligatorio y sección «Ya preparado» (opcional) | CU17, CU19 |
| K5a | Cancelaciones · Por resolver | Solicitudes de los meseros, las más antiguas primero | CU18 |
| K5b | Resolver una solicitud | Ventana: pedido, mesero, motivo, ítems, estado de las comandas, impacto en el total, sección «Ya preparado», Aprobar / Rechazar | CU18, CU19 |
| K5c | Cancelaciones · Resueltas de hoy | Solo consulta | CU18 |
| K6 | Resumen del día | Cuatro bloques y la tabla «Pedidos del día»; selector de fecha | Obj. 6 · tarea 10.4 |
| K7 | Estados especiales | Reconectando, sin conexión, avisos emergentes, sesión expirada, cerrar sesión y conflictos (otra pantalla ya resolvió o ya se pagó) | CU3, CU15 |
| K8 | Otros dispositivos | Tabla y ventanas en tableta (1024 px) y celular (390 px) | 2.5, 3.3 |

## Flujo de navegación

```
K0 Ingreso → K1a Por cobrar
K1a ─ tocar una fila → K2 Detalle ─┬─ «Cobrar» → K3 → vuelve a K1a
                                   └─ «Cancelar pedido» → K4 → vuelve a K2
Pestañas: Cuentas (K1a ⇄ K1b ⇄ K1c) · Cancelaciones (K5a ⇄ K5c) · Resumen (K6)
K5a ─ tocar una fila → K5b → vuelve a K5a
Aviso emergente de solicitud nueva → K5a · de cuenta nueva por cobrar → K1a
Cerrar sesión → confirmación (K7) → K0
```

## Qué se reutiliza de Cocina y Bar, qué cambia y qué es nuevo

- **Se reutiliza:** barra superior, pestañas, subpestañas, tablas (`.tbl`), ventanas modales, avisos emergentes, notas «Por qué está así», círculos numerados y las pantallas de ingreso, estados especiales y otros dispositivos.
- **Cambia:** no hay tablero kanban, stock, habilitación ni preparados; la barra pierde el indicador «Anticipada»; las pestañas son Cuentas · Cancelaciones · Resumen.
- **Nuevo:** tablas de cuentas, detalle de cuenta, las tres ventanas (cobrar, cancelar, resolver) y el resumen.

## Decisiones tomadas

1. **D1 · Caja liquida solo cuentas `PENDIENTE`.** Así la cola de Caja es exactamente «por cobrar». Una cuenta `ABIERTA` se ve en K1b (solo consulta), con el texto «Pide al mesero que la marque pendiente de pago». Error nuevo `CUENTA_NO_PENDIENTE` al intentar liquidar otra.
2. **D2 · Caja no reabre una cuenta `PENDIENTE`;** sigue siendo acción del mesero (decisión ya tomada). La pantalla dice «Pide al mesero reabrirla».
3. **D3 · Cobro bloqueado si hay solicitudes de cancelación sin resolver** en esa cuenta (error `CANCELACIONES_POR_RESOLVER`), porque el total aún puede cambiar. Si solo hay comandas sin terminar, **se advierte, no se bloquea** (el cliente puede pagar mientras se sirve lo último).
4. **D4 (revisado) · Preparados dentro de la cancelación.** El servidor no sabe qué se alcanzó a preparar, así que lo declara Caja. La sección «Ya preparado» está **siempre disponible** (opcional, cerrada por defecto) en K4 y K5b: lista los ítems del pedido, cada uno con un contador de 0 hasta su cantidad (combos por componente; se excluyen los ítems que ya usaban un preparado, que vuelven solos a `DISPONIBLE`). Se envía como `preparados: [{item_id, cantidad}]` y reemplaza al booleano `crear_preparado`. No es un selector de todo el menú: `producto_preparado` con `origen = CANCELACION` exige `cancelacion_id`, y `POST /preparados` es de Cocina y Bar sobre su destino.
5. **Regla de stock al cancelar (SUPUESTO nuevo):** hoy ningún documento dice qué pasa con el stock. Propuesta: al aprobarse una cancelación se devuelve el stock de los ítems con `stock_cantidad` no nulo, **salvo las unidades registradas como preparado** (existen físicamente). No cambia `disponible`. Emite `producto.disponibilidad`. Requiere confirmación del equipo.
6. **D5 · Eventos:** nuevo `cuenta.estado` a `caja` y `meseros` (para que la lista «Por cobrar» se actualice); `pedido.cancelado` y `cancelacion.rechazada` también a `caja` (para que el total que Caja mira no quede viejo); `cancelacion.solicitada` trae además solicitante y cuenta.
7. **D6 · Inactividad:** Caja **no** tiene la excepción de Cocina y Bar (maneja dinero y es una estación compartida). La sesión expira por inactividad (CU3). Las listas son consultas REST, así que al volver a entrar no se pierde nada. **POR CONFIRMAR** con el equipo.
8. **D7 · Sin `pendiente_en`:** la cuenta no guarda cuándo pasó a `PENDIENTE`. La cola se ordena por `abierta_en` y la columna se rotula «Abierta desde» (SUPUESTO).
9. **K6 · Resumen del día** (definido aquí, no estaba en el SRS): cuatro bloques —Cobrado (cuentas pagadas del día, total, propinas y desglose por método), Por cobrar (cuentas `PENDIENTE` y `ABIERTA` ahora; solo para hoy), Pedidos (registrados, activos, cancelados y valor cancelado) y Cancelaciones (aprobadas, rechazadas y por resolver)— más la tabla «Pedidos del día» (hora, mesa, cuenta, mesero, estado y total). Selector de fecha, hoy por defecto, sin fechas futuras. Se dejan fuera «por mesero» y «más vendidos» (se pueden añadir sin tocar la estructura). **POR CONFIRMAR:** el «día» es el día calendario; un restaurante que cierre pasada la medianoche podría necesitar otro corte.
10. **Extras de caja (decididos el 22/10/2026):**
    - **Dividir en partes iguales:** calculadora «Total ÷ N» dentro de K3; no guarda nada.
    - **Propina:** columna `propina` en `cuenta` y campo opcional en la liquidación; el resumen la suma. Sin porcentajes sugeridos (evita un parámetro nuevo).
    - **`metodo_pago` ligero:** columna en `cuenta` (`EFECTIVO`, `TARJETA`, `OTRO`) que se elige al cobrar; el resumen la desglosa. **Es una excepción a la decisión «el pago es solo una casilla»** (anotada en `db/04`: «el proyecto NO gestiona métodos de pago»): no hay tabla de pagos ni pagos parciales, solo la etiqueta del método. Anderson la aprobó porque el equipo la había pensado; **POR CONFIRMAR con el equipo / Product Owner** y falta decidir si en las migraciones es `NOT NULL` solo para cuentas pagadas.
    - **Aplazado:** descuentos (cambian la definición del total y exigen reglas de control).
    - **No se hace:** dividir por ítems o personas (obligaría a partir pedidos; el mesero ya puede abrir varias cuentas en una mesa).
    - **Pagos reales** (tabla `pago`, parciales, turnos): no ahora. Se pueden agregar después de forma aditiva, porque el único punto que marca una cuenta como pagada es la liquidación; lo costoso sería migrar, rediseñar K3 y K6 y definir qué pasa con una cancelación tras un pago parcial. Cambiaría el alcance del EDT (737 h): lo debe aprobar el Product Owner.
11. **El total que ve Caja** excluye los pedidos con cancelación aprobada; precios y extras son la foto del momento del pedido.
12. **Estado de comandas en K2:** se consulta al abrir la cuenta y al pulsar «Actualizar» (SUPUESTO: `comanda.estado` no llega a Caja, para no añadir tráfico). El servidor revalida al cobrar.

## Permisos y eventos de Caja: revisión de huecos

- Caja usa `GET /mesas/{id}/cuentas`, `GET /cuentas/{id}`, `GET /pedidos/{id}`, `GET /mesas`, `GET /cancelaciones`, `GET /resumen-diario`, `GET /parametros` (para la ventana de 3 min) y las acciones de cancelación y liquidación. No toca productos ni comandas.
- Huecos encontrados y cerrados (ver «Cambios a `docs/02`»): no existía una lista de cuentas de todas las mesas; no había evento de cuenta; `GET /cancelaciones` no definía su contenido; faltaban errores de `liquidacion` y `resolucion`; `pedido.cancelado` y `cancelacion.rechazada` no llegaban a Caja; `crear_preparado` era un solo booleano por pedido.

## Cambios a `docs/02_api_y_eventos.md`

Se aplican en un commit aparte (lista completa en ese commit): `GET /cuentas`, contenido de `GET /cuentas/{id}` y `GET /cancelaciones`, `liquidacion` (precondición, `metodo_pago`, `propina`, errores), `resolucion` y cancelación con `preparados`, regla de stock, eventos (`cuenta.estado` y destinos nuevos), `GET /resumen-diario`, errores nuevos y la frase de inactividad de Caja. **Pendiente para las migraciones (3.4):** columnas `propina` y `metodo_pago` en `cuenta`, y `preparados` con `origen = CANCELACION`; no se tocó `db/` en este paso.

## Pendientes por confirmar (no bloquean)

- Inactividad de Caja (D6), regla de stock al cancelar (decisión 5), `metodo_pago` (decisión 10) y corte del «día» del resumen (decisión 9).
- Etiqueta «Abierta desde» en lugar de «Pendiente desde» (D7).
- Estado de comandas sin evento hacia Caja (decisión 12).
- **SRS:** el texto de RF14, CU16, CU18, CU19, el Obj. 6 y la ficha 10.4 no está en el repo; las decisiones salen de `docs/02`, `db/03-04` y la conversación con Anderson. Contrastarlas cuando esté el PDF.
- Duración de los avisos emergentes (~8 s) y cortes de la adaptación (PC ≥ 1280 px, tableta 768–1279, celular < 768), como en Cocina y Bar.
