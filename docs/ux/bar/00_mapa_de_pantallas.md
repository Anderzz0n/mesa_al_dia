# Mesa al día · Rol BAR · Mapa de pantallas y flujo (tarea 2.5)

Estado: **mapa aprobado por Anderson el 21/10/2026** (con las decisiones de la sección «Decisiones propias de Bar»). Dispositivo base: pantalla grande o PC (1366 px de ancho, revisado también a 1920 px), con adaptación a tableta y celular (pantalla B8).
Los wireframes se dibujan en esta carpeta (HTML + CSS estático; abrir `index.html`) con la misma convención que Cocina (`docs/ux/cocina/`) y se basan en `docs/02_api_y_eventos.md`.

Bar **reutiliza las pantallas de Cocina con `destino = BAR`**. Este documento solo recoge lo que es distinto y por qué. Para el resto (tablero kanban de tres columnas, «Listas de hoy», «Ya preparado», franja de cancelaciones, recuento de ítems con «Corregir recuento», alertas de demora) valen las decisiones de `docs/ux/cocina/00_mapa_de_pantallas.md`.

## Qué hace Bar

- **Tablero de comandas (RF7):** ve sus comandas (las anticipadas primero), confirma la recepción indicando cuántos ítems recibió (CU15), las pasa a *en preparación* y a *lista*, y acusa recibo de las cancelaciones (RF8).
- **Disponibilidad y stock (RF9, CU22):** cambia la cantidad de sus productos o los bloquea y habilita.
- **Panel de habilitación (RF6, CU12):** habilita o deshabilita opciones de personalización y gobierna **su propia** preparación anticipada (interruptor del área y productos).
- **Productos preparados (RF10, CU19):** registra unidades ya preparadas y ve cuáles hay.
- **Ingreso y cierre de sesión (RF1, CU2, CU3).**

## Estructura base

Igual que Cocina, con «Bar» como rol: barra superior fija (rol, usuario, «Anticipada: ACTIVA/APAGADA» del área, conexión, «Cerrar sesión»), pestañas **Comandas · Disponibilidad · Habilitación · Preparados**, solo avisos emergentes sin historial (la cancelación no se oculta hasta acusar recibo) y franja «Reconectando…» al perder la conexión.

## Pantallas

| # | Pantalla | Respecto a Cocina | Origen (RF/CU) |
|---|---|---|---|
| B0 | Ingreso | Tal cual, sin más cambio que el nombre del rol tras entrar | CU2 |
| B1a | Tablero de comandas (inicio) | Igual estructura. Tarjetas **compactas** (muchas comandas pequeñas), umbral de demora **propio del bar**, grupo «Ya preparado · **no preparar**» y nota SUPUESTO «El resto del combo va a Cocina» | RF7 |
| B1b | Listas de hoy | Tal cual (más larga: bar despacha más comandas) | RF7 |
| B2 | Detalle y confirmación de recepción | Tal cual; el combo muestra solo los componentes de bar | CU15 |
| B3 | Cancelación por acusar | Tal cual; solo llegan cancelaciones de pedidos con comanda de bar | RF8 |
| B4 | Disponibilidad y stock | Productos de bar. Casi todos llevan conteo por unidades y el gesto frecuente es «−1». Los combos no se listan (sin destino); sus componentes de bar sí. Se actualiza en vivo | RF9, CU22 |
| B5a | Habilitación · Opciones | Opciones de productos de bar, con etiqueta **«También en Cocina»** y confirmación al deshabilitar una opción compartida | CU12 |
| B5b | Habilitación · Preparación anticipada | **Interruptor propio del área bar** (con confirmación al apagar) y productos de bar habilitados | RF6 |
| B6 | Preparados | Productos preparados de bar; texto «productos» en lugar de «platos» | RF10, CU19 |
| B7 | Estados especiales | Igual que C7 (reconectando, sin conexión, avisos, sesión expirada, cerrar sesión, apagar anticipada) | CU15, CU3 |
| B8 | Otros dispositivos | Tal cual: tableta (1024 px) y celular (390 px) | 2.5, 3.3 |

## Flujo de navegación

```
B0 Ingreso → B1a Tablero
B1a ──┬─ tocar una tarjeta / «Confirmar recepción» → B2 Detalle (panel lateral) → vuelve a B1a
      ├─ filtro «Listas de hoy» → B1b
      └─ (en cualquier pantalla) aviso de cancelación → B3 → «Acusar recibo» → vuelve
Pestañas: Comandas (B1a/B1b) · Disponibilidad (B4) · Habilitación (B5a ⇄ B5b) · Preparados (B6)
Indicador «Anticipada» de la barra → B5b
Cerrar sesión → confirmación (B7) → B0
```

## Decisiones propias de Bar

1. **Bar sí tiene preparación anticipada** (decisión de Anderson, 21/10/2026: el requisito lo permite y la clave de comanda `(pedido, destino, es_anticipada)` ya lo prevé). Cada área gobierna la suya: **interruptor por destino** (`ANTICIPADA_ACTIVA_COCINA` y `ANTICIPADA_ACTIVA_BAR`) y productos habilitados por su propia área. Por eso Bar tiene B5b, el indicador en la barra superior y las divisiones «Anticipadas / Normales» del tablero.
2. **Regla del servidor:** un ítem puede ir `ANTICIPADA` solo si el producto lo permite (`permite_anticipada`) **y** el interruptor del área de ese producto está activo. En un combo vale para cada componente según su área. La pantalla del mesero no cambia; su opción «Anticipada» aparece o desaparece según el interruptor del área del producto.
3. **Umbral de demora por área** (decisión de Anderson): `UMBRAL_DEMORA_COCINA_MINUTOS` y `UMBRAL_DEMORA_BAR_MINUTOS`. Una bebida tarda menos que un plato; con un valor único la alerta quedaría mal calibrada en una de las dos áreas. La pantalla es idéntica; cada rol lee el suyo.
4. **Opciones compartidas:** el catálogo de opciones es único, así que una opción usada por un producto de bar y uno de cocina aparece en ambas pantallas y apagarla la apaga para las dos áreas. Se marca con «También en Cocina» (y «También en Bar» en Cocina) y deshabilitarla pide confirmación. Requiere que `usada_en` traiga el destino de cada producto.
5. **Stock en vivo:** `producto.disponibilidad` y `opcion.disponibilidad` llegan también a la sala del área, para que la tabla de B4 se actualice cuando un pedido descuenta stock o cuando otra pantalla cambia algo.
6. **Combos:** no tienen destino, así que no salen en `GET /productos?destino=BAR`; sus componentes de bar sí, como productos normales. La comanda de bar trae solo los componentes de bar y se añade la nota SUPUESTO «El resto del combo va a Cocina» (la API hoy no lo manda).
7. **Cancelaciones por área:** `cancelacion_acuse_en` es por comanda, así que cada área acusa la suya. `pedido.cancelado` llega solo a las áreas con comandas afectadas (un pedido solo de comida no tiene comanda de bar).
8. **Permisos por destino:** las acciones sobre comandas (`confirmacion`, `PATCH`, `acuse-cancelacion`, y `GET` con otro `destino`) devuelven `DESTINO_NO_PERMITIDO` si la comanda es del otro área; antes `docs/02` solo lo limitaba para productos.
9. **Preparados por área:** `preparado.nuevo` y `preparado.asignado` van a la sala del área del producto (antes iban siempre a `cocina`) para que Bar sepa cuándo un mesero toma una unidad.
10. **Lenguaje de Bar:** «Ya preparado · no preparar» (no «no cocinar») y «productos» en lugar de «platos».
11. **Flujo de tres pasos se mantiene** (Enviadas → Recibidas → En preparación): CU15 exige la confirmación, también para una bebida.

## Cambios a `docs/02_api_y_eventos.md` (APLICADOS el 21/10/2026)

1. `GET /parametros`: devuelve `ANTICIPADA_ACTIVA_COCINA`, `ANTICIPADA_ACTIVA_BAR`, `UMBRAL_DEMORA_COCINA_MINUTOS` y `UMBRAL_DEMORA_BAR_MINUTOS`.
2. `PATCH /parametros/anticipada` con `{destino, activa}`; COCINA y BAR mueven solo el suyo.
3. `PATCH /productos/{id}/anticipada` para COCINA y BAR (solo productos de su destino).
4. Regla de la modalidad `ANTICIPADA` (producto + interruptor del área).
5. Acciones sobre comandas restringidas al destino del rol (`DESTINO_NO_PERMITIDO`).
6. `anticipada.estado` lleva `destino` y va a `meseros` y a la sala de esa área.
7. `producto.disponibilidad` y `opcion.disponibilidad` también a la sala del área.
8. `preparado.nuevo` / `preparado.asignado` a la sala del área del producto.
9. `pedido.cancelado` solo a las áreas con comandas afectadas.
10. `usada_en` (en `GET /opciones`) incluye el `destino` de cada producto.

**Pendiente para las migraciones (3.4):** sembrar en `parametro` las dos claves de anticipada (en lugar de `ANTICIPADA_ACTIVA`) y las dos de umbral de demora. No se tocó `db/` en este paso.

## Pendientes por confirmar (no bloquean)

- **Combos:** nadie de cocina o bar puede tocar la disponibilidad del combo en sí (sin destino, `DESTINO_NO_PERMITIDO`; solo ADMIN), y `docs/02` no dice qué pasa con el combo cuando se bloquea un componente. Afecta también a Cocina.
- **«El resto del combo va a Cocina»:** la API no lo manda hoy; la nota es un SUPUESTO.
- **Opciones usadas solo por combos:** no aparecen en ninguna pantalla de área (caso raro).
- **Valores de los umbrales de demora:** los define el equipo.
- **Texto de RF6 del SRS:** no está en el repo; se confirmó el alcance de la anticipada por decisión de Anderson, no contra el SRS.
- Los pendientes generales de Cocina (excepción de inactividad, baja de preparados, avisos de ~8 s, cortes de adaptación) valen también para Bar.
