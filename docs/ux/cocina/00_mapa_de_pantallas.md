# Mesa al día · Rol COCINA · Mapa de pantallas y flujo (tarea 2.5)

Estado: **mapa y wireframes aprobados por Anderson el 21/10/2026** (con los ajustes de la sección «Decisiones»). Dispositivo base: pantalla grande o PC (1366 px de ancho, revisado también a 1920 px), con adaptación a tableta y celular (pantalla C8).
Los wireframes están en esta carpeta (HTML + CSS estático; abrir `index.html`) y se basan en `docs/02_api_y_eventos.md` y en las fichas de tareas del EDT (Entrega 2A).
Confirmado el 21/10/2026: el interruptor de la anticipada vive en C5b (la barra solo informa) y apagarlo pide confirmación; las cancelaciones por acusar van en una franja fija sobre el tablero, con la ventana de «Acusar recibo» (C3).

## Qué hace Cocina

- **Tablero de comandas (RF7):** ve las comandas que llegan (las anticipadas primero), confirma la recepción indicando cuántos ítems recibió (CU15), las pasa a *en preparación* y a *lista*, y acusa recibo de las cancelaciones (RF8).
- **Disponibilidad y stock (RF9, CU22):** cambia la cantidad de un producto o lo bloquea y habilita.
- **Panel de habilitación (RF6, CU12):** habilita o deshabilita opciones de personalización y gobierna la preparación anticipada (interruptor global y productos).
- **Productos preparados (RF10, CU19):** registra unidades ya preparadas y ve cuáles hay.
- **Ingreso y cierre de sesión (RF1, CU2, CU3).**

## Estructura base (todas las pantallas, salvo el ingreso)

- **Barra superior fija:** rol «Cocina», usuario, indicador de conexión (● en línea / ○ sin conexión), **indicador** «Anticipada: ACTIVA/APAGADA» (solo informa; lleva al panel donde se cambia) y «Cerrar sesión».
- **Pestañas:** Comandas · Disponibilidad · Habilitación · Preparados.
- **Avisos en tiempo real:** solo **avisos emergentes** sobre la pantalla actual, sin historial (igual que en el mesero). La única excepción es la cancelación, que **no se oculta sola** hasta que cocina acusa recibo.
- **Conexión:** franja «Reconectando…» y, si no se logra, bloqueo de acciones con aviso de que el tablero puede estar desactualizado.

## Pantallas

| # | Pantalla | Qué resuelve | Origen (RF/CU · tarea EDT) |
|---|---|---|---|
| C0 | Ingreso | Usuario y contraseña; errores `CREDENCIALES_INVALIDAS` y `USUARIO_INACTIVO` | CU2 |
| C1a | Tablero de comandas (inicio) | Tres columnas por estado (Enviadas · Recibidas · En preparación); anticipadas fijadas arriba de cada columna; tarjeta con ítems, modalidad, opciones, observación y «ya preparados»; tiempo transcurrido y marca de demora | RF7 · 8.2a |
| C1b | Listas de hoy | Filtro donde van las comandas al marcarse **Lista**; solo consulta | RF7 · 8.2a |
| C2 | Detalle y confirmación de recepción | Panel lateral: ítems completos, campo «ítems recibidos», botones de siguiente estado | CU15 · 8.3 |
| C3 | Cancelación por acusar | Aviso persistente y tarjeta destacada con «Acusar recibo» | RF8 · 9.4 |
| C4 | Disponibilidad y stock | Productos de cocina: cantidad (fijar o ajustar ±), interruptor de disponible, estados agotado y bloqueado | RF9, CU22 · 6.8 |
| C5a | Habilitación · Opciones | Interruptor por opción del catálogo único | CU12 · 8.2b |
| C5b | Habilitación · Preparación anticipada | Interruptor del área cocina (con confirmación al apagar) y productos de cocina habilitados para anticipada | RF6 · 8.2b, 9.3 |
| C6 | Preparados | Registrar unidades preparadas y ver las disponibles; aviso cuando un mesero toma una | RF10, CU19 · 9.6 |
| C7 | Estados especiales | Reconectando, sin conexión, avisos emergentes, sesión expirada, confirmar cerrar sesión y confirmar apagar anticipada | CU15, CU3 |
| C8 | Otros dispositivos | Cómo se adapta el tablero y la lista de stock a tableta (1024 px) y celular (390 px) | 2.5, 3.3 |

## Flujo de navegación

```
C0 Ingreso → C1a Tablero
C1a ──┬─ tocar una tarjeta / «Confirmar recepción» → C2 Detalle (panel lateral) → vuelve a C1a
      ├─ filtro «Listas de hoy» → C1b
      └─ (en cualquier pantalla) aviso de cancelación → C3 → «Acusar recibo» → vuelve
Pestañas: Comandas (C1a/C1b) · Disponibilidad (C4) · Habilitación (C5a ⇄ C5b) · Preparados (C6)
Indicador «Anticipada» de la barra → C5b
Cerrar sesión → confirmación (C7) → C0
```

## Decisiones tomadas

1. **Tablero en columnas por estado (kanban).** Son **tres** columnas, no cuatro: cuando una comanda se marca **Lista** sale del tablero y pasa al filtro «Listas de hoy» (C1b). Después de `LISTA` no existe otro estado.
2. **Anticipadas** (`es_anticipada`): fijadas al inicio de cada columna, con borde grueso y etiqueta (`docs/02`: «las anticipadas van primero»).
3. **Ítems de combo, extras y observaciones** se muestran completos en la tarjeta: modalidad (mesa / llevar / anticipada), opciones, observación, componentes quitados y extras.
4. **Ítems con preparado asignado:** se **clasifican en un grupo aparte** dentro de la tarjeta, «Ya preparados — no cocinar», con borde punteado, y llevan además una etiqueta. Se eligió clasificar (y no solo marcar) porque en una cocina con prisa un detalle dentro de una línea se pasa por alto; un grupo separado se ve a primera vista.
5. **Cocina solo ve y edita lo suyo:** el tablero, el stock, los preparados y las habilitaciones se filtran por `destino = COCINA`.
6. **Acuse de cancelación:** la comanda cancelada queda **destacada, en una franja superior «Cancelaciones por acusar»**, hasta que cocina pulsa «Acusar recibo».
7. **Confirmación de recepción (CU15):** cocina **escribe cuántos ítems recibió**; la comparación con lo enviado la ve el **mesero** (`comanda.recibida` trae `coincide`), como pide la tarea 8.3 del EDT («el mesero detecta discrepancias»). Si no coincide, la comanda **queda confirmada igual** (la diferencia es una alarma, no un bloqueo) y cocina puede **corregir el recuento** mientras la comanda siga en `RECIBIDA`; el servidor recalcula `coincide` y vuelve a avisar al mesero (decisión de Anderson, 21/10/2026).
8. **Preparación anticipada:** el EDT la ubica en el *panel de habilitación* (8.2b) y dice que cocina habilita «la función **y los productos**» (9.3). Por eso el **control vive en C5b** (interruptor global + productos). La barra superior solo muestra un **indicador** que lleva a C5b; así no se apaga por accidente desde cualquier pantalla y se pide confirmación al apagarlo.
9. **Demora:** cada tarjeta muestra el tiempo transcurrido desde que se envió; si supera un umbral configurable se marca con encabezado oscuro (patrón, no color). No lo pide el SRS; se añadió a petición de Anderson porque no exige cambios estructurales (ver «Cambios propuestos a la API»).
10. **Historial:** el filtro «Listas de hoy» (C1b) es el único historial; consulta, sin acciones.
11. **Rechazo de comandas: NO se incluye.** Exigiría un estado nuevo (`RECHAZADA`), reglas para totales de la cuenta, stock y caja, y pantallas nuevas en mesero y caja, que ya se diseñó. Si se quiere después, la versión liviana sería un botón «Avisar problema» que solo envíe un aviso emergente al mesero (1 endpoint y 1 evento, sin estados nuevos). Queda pendiente de decisión.
12. **Adaptación a dispositivos:** diseño base de PC (1366 px). En tableta las columnas se estrechan; en celular las columnas pasan a un selector de estado con una columna visible y el panel de detalle ocupa toda la pantalla (C8).
13. **Mismo diseño para el bar:** el rol Bar usa las mismas pantallas con `destino = BAR`. *Actualizado el 21/10/2026:* se había previsto sin C5b («la anticipada es solo de cocina»), pero Anderson decidió que Bar también tiene preparación anticipada, **gobernada por área** (interruptor y productos propios). Por eso Bar sí tiene su B5b y el interruptor de cocina pasó de global a `ANTICIPADA_ACTIVA_COCINA`. Detalle en `docs/ux/bar/00_mapa_de_pantallas.md`.

## Cambios propuestos a `docs/02_api_y_eventos.md` (APLICADOS el 21/10/2026)

Ya están en `docs/02`. Al aplicarlos se añadió también: `GET /parametros` para **todos** los roles (el mesero lo necesita para saber si la anticipada está activa), `acuse=pendiente` en `GET /comandas` (alimenta la franja de cancelaciones), `usada_en` en `GET /opciones`, `estado_anterior` en `pedido.cancelado`, el error `DESTINO_NO_PERMITIDO` y la regla de qué cuenta como «ítem» en CU15 (una línea tal como la ve cocina; un combo cuenta una vez). La excepción de inactividad para cocina y bar quedó como propuesta **por confirmar** con el equipo. Falta sembrar `UMBRAL_DEMORA_MINUTOS` en `parametro` (migraciones, tarea 3.4). Texto original de la propuesta:

1. `GET /productos` y `GET /preparados`: filtro `destino=`; y que `PATCH …/stock` y `PATCH …/disponibilidad` devuelvan error si el producto no es del destino del usuario.
2. `GET /comandas`: parámetro `fecha=` (para «Listas de hoy»), y que cada comanda traiga `enviada_en` y la respuesta `hora_servidor` (igual que `GET /cuentas/{id}`), para calcular el tiempo transcurrido sin depender del reloj del equipo.
3. Contenido de cada ítem de la comanda: `modalidad`, `opciones`, `observacion`, `componentes_quitados`, `extras` y `es_preparado` (si usa `preparado_id`).
4. Nuevo `PATCH /productos/{id}/anticipada` (COCINA): habilita o deshabilita un producto para preparación anticipada (hoy solo existe el interruptor global y el `PATCH /productos/{id}` de ADMIN).
5. Nuevo parámetro `UMBRAL_DEMORA_MINUTOS` en la tabla `parametro` (sin cambios de estructura).
6. `POST /comandas/{id}/confirmacion`: incluir `coincide` en la respuesta para que cocina sepa si debe recontar.

## Pendientes por confirmar (no bloquean)

- **Expiración por inactividad (RF1, CU3):** una pantalla de cocina está siempre encendida. Si la sesión expira por inactividad, el tablero se cerraría solo. Supuesto: cocina queda exenta mientras lleguen eventos. Hay que confirmarlo con el equipo.
- **Preparados:** no hay forma de dar de baja una unidad preparada (por ejemplo, si se echó a perder). Supuesto: fuera de alcance.
- **Ítems preparados y el conteo de CU15:** resuelto en `docs/02`: cuentan, y un «ítem» es una línea tal como la ve cocina (un combo cuenta una vez).
- **«Ítems recibidos»:** ¿cuenta líneas o unidades? Supuesto: líneas, como en el aviso del mesero («3 de 3»).
- **Motivo de la cancelación:** el evento `pedido.cancelado` no lo trae; supuesto: se muestra solo si el servidor lo incluye.
- **Duración de los avisos emergentes:** unos 8 s (igual que en el mesero).
- **Valor del umbral de demora:** valor inicial supuesto de **20 minutos** para cocina (7 para bar), definido por Anderson el 21/10/2026; el equipo puede ajustarlo (es un parámetro). Los tiempos de los ejemplos de C1a y C8 respetan ese valor.
- El **SRS completo (RF/CU) no está disponible**: los dos archivos recibidos eran el informe de la Entrega 2A (EDT) y la plantilla en blanco de la Entrega 1B. Las decisiones se verificaron contra `docs/02` y las fichas del EDT.
