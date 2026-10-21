# Mesa al día · Rol COCINA · Mapa de pantallas y flujo (tarea 2.5)

Estado: **aprobado por Anderson el 21/10/2026** (con los ajustes de la sección «Decisiones»).
Dispositivo: **pantalla grande o PC** (base 1366 px de ancho, revisado también a 1920 px), uso con mouse o táctil. La adaptación a tablet se dibuja en C08.
Los wireframes van en esta carpeta (HTML + CSS estático; abrir `index.html`) y se basan en `docs/02_api_y_eventos.md` y en las fichas de tareas del EDT (8.2a, 8.2b, 8.3, 9.3, 9.6, 6.4, 6.8).

## Estructura base

- **Barra superior fija** (todas las pantallas menos C00): nombre del rol, usuario, indicador de conexión (● en línea / ○ sin conexión), **interruptor de preparación anticipada** (visible siempre) y «Cerrar sesión».
- **Pestañas bajo la barra:** Comandas · Stock y productos · Opciones · Preparados.
- **Avisos en tiempo real:** solo avisos emergentes (igual que el mesero); no hay bandeja. El estado real siempre se ve en el tablero.
- **Conexión:** franja «Reconectando…» y, si se cae, el tablero se marca como posiblemente desactualizado; al reconectar se vuelve a pedir el estado por REST (`docs/02`, sección 4).

## Pantallas

| # | Pantalla | Qué resuelve | Origen |
|---|---|---|---|
| C0 | Ingreso | Usuario y contraseña; errores `CREDENCIALES_INVALIDAS` y `USUARIO_INACTIVO` | CU2 |
| C1a | Tablero de comandas (activas) | Franja de anticipadas arriba y tres columnas: Nuevas · Recibidas · En preparación; temporizador por comanda | RF7, RF6 |
| C1b | Tablero: listas y canceladas de hoy | Filtro que reemplaza la columna «Lista» y sirve de historial del día | RF7 |
| C2a | Detalle y confirmación de recepción | Panel lateral con los ítems, el bloque «Ya preparados · no cocinar» y el campo «ítems que veo» | RF7, CU15 |
| C2b | Detalle de una comanda en curso | Mismo panel con el botón que toca según el estado (iniciar preparación / marcar lista) | RF7 |
| C3 | Aviso de cancelación | Ventana sobre cualquier pantalla; pide «Acusar recibo» | RF8 |
| C4 | Stock y productos | Tabla de productos de cocina: cantidad, ajuste, disponible, anticipada; corrección silenciosa del servidor | RF9, CU22, RF6 |
| C5 | Opciones de personalización | Habilitar o deshabilitar opciones para todos; combinaciones prohibidas en solo lectura | CU12, RF3 |
| C6 | Preparados | Unidades disponibles y formulario para registrar nuevas | RF10, CU19 |
| C7 | Estados especiales | Reconectando, sin conexión, sesión expirada, avisos emergentes, confirmación al apagar la anticipada, diferencia en la confirmación | CU15 |
| C8 | Adaptación a otros dispositivos | Cómo cambia el tablero en tablet horizontal (1024 px) y vertical (768 px) | requisito de soporte multidispositivo |

## Flujo de navegación

```
C0 Ingreso → C1a Tablero ──(tocar comanda)──→ C2a Detalle (nueva: confirmar recepción)
                 │                              C2b Detalle (en curso: iniciar / marcar lista)
                 ├─ filtro «Listas hoy / Canceladas hoy» → C1b
                 ├─ pestaña Stock y productos → C4
                 ├─ pestaña Opciones → C5
                 └─ pestaña Preparados → C6
Sobre cualquier pantalla: C3 (cancelación) y C7 (conexión, avisos, confirmaciones)
«Cerrar sesión» → C0
```

## Decisiones tomadas

1. **Tablero kanban** con tres columnas activas por estado: Nuevas (`ENVIADA`) · Recibidas (`RECIBIDA`) · En preparación (`EN_PREPARACION`). Al marcarse `LISTA`, la comanda **sale del tablero** y pasa al filtro «Listas hoy» (decisión de Anderson).
2. **Anticipadas:** franja superior fija sobre las columnas (cola prioritaria de RF6). Dentro de cada columna, las más antiguas primero.
3. **Cocina ve todo el contenido de la comanda:** mesa, cuenta, mesero responsable, hora, y por ítem su modalidad (mesa / llevar / anticipada), opciones, observación, componentes quitados de un combo, extras y componentes anticipados.
4. **Ítems con producto preparado (`preparado_id`):** van en un **bloque aparte dentro de la comanda**, «Ya preparados · no cocinar». Se eligió esta opción sobre marcarlos en línea o no enviarlos a cocina porque separa visualmente lo que se cocina de lo que solo hay que entregar, y cocina sigue sabiendo que una unidad suya sale en ese pedido.
5. **Productos de cada área:** cocina solo ve y edita los productos con destino `COCINA` (los combos no tienen destino; sus componentes sí).
6. **Acuse de cancelación:** la comanda cancelada queda **destacada en el tablero** hasta que cocina acuse recibo; después pasa a «Canceladas hoy». La ventana C3 se puede cerrar con «Más tarde» sin perder el aviso.
7. **Alertas por demora:** cada comanda muestra un temporizador desde `enviada_en`. Dos umbrales (atención y demora) como **constantes únicas del frontend**; se marcan por patrón (borde grueso, franja rayada), no por color.
8. **Historial del día:** el filtro «Listas hoy / Canceladas hoy» reemplaza a un historial aparte. Hace falta el parámetro `fecha` en `GET /comandas`.
9. **CU15 (diferencia):** cocina escribe cuántos ítems ve; si no coincide con los enviados se muestra un aviso y se puede confirmar igual. El mesero recibe `coincide: false` (`comanda.recibida`).
10. **Interruptor de anticipada** en la barra superior, con confirmación al apagarlo porque afecta a todos los meseros.
11. **Soporte multidispositivo:** diseño base de PC; en pantallas más pequeñas las columnas pasan a pestañas y el detalle ocupa toda la pantalla (C8).
12. **Botones y texto grandes** (cocina se mira de lejos y puede ser táctil): botones de al menos 48 px de alto.

## Fuera de alcance (propuesto)

- **Rechazar una comanda** («no puedo prepararla»): requiere un estado nuevo, devolver stock, avisar al mesero y a caja, y cambiar totales de la cuenta. Es un cambio estructural grande; no se dibuja. Si falta un ingrediente, cocina lo bloquea en C4 y el mesero cancela el pedido por el flujo normal.
- **Sonido al llegar una comanda:** no está en el SRS ni en la API; se anota como mejora.

## Brechas entre las pantallas y `docs/02` (por resolver)

1. **Estado inicial del interruptor de anticipada:** `docs/02` solo tiene `PATCH /parametros/anticipada` y el evento `anticipada.estado`; falta una lectura (`GET /parametros`).
2. **`GET /comandas`:** falta el filtro `fecha`, y cada comanda debe traer el detalle completo (decisión 3), `ya_preparado` por ítem, `enviada_en`, `cancelacion_acuse_en` y el mesero responsable.
3. **Anticipada por producto:** la ficha 9.3 del EDT dice que cocina habilita «la función y los productos»; la API solo tiene el interruptor global. Se dibuja una columna «Anticipada» en C4 como SUPUESTO; si se confirma hace falta un `PATCH /productos/{id}/anticipada` para COCINA.
4. **`GET /productos`:** falta el filtro `destino=` y que el servidor impida a cocina tocar productos de bar.
5. **Sesión por inactividad:** la pantalla de cocina se queda abierta sin que nadie la toque; si el token expira por inactividad, cocina quedaría sin tablero en pleno servicio. Hay que decidir cómo se renueva (por ejemplo con la actividad del WebSocket).
6. **`items_confirmados`:** definir si cuenta líneas o unidades, y si los ítems «ya preparados» entran en el conteo.
7. **`GET /opciones`:** para mostrar «usada en» (C5) debería traer los productos que usan cada opción.
8. **`pedido.cancelado`** no incluye el motivo; C3 no lo muestra.

## Pendientes a confirmar (no bloquean)

- Valores de los umbrales de demora (supuesto: 10 min atención, 20 min demora).
- Qué ve cocina de una comanda formada solo por ítems «ya preparados».
- Duración de los avisos emergentes (supuesto: unos 8 s, igual que el mesero).
- El SRS original («Entrega 1B Parte 2» con el texto de RF y CU) no está en el repo; las reglas de cocina se tomaron de `docs/02`, `db/04` y las fichas del EDT.
