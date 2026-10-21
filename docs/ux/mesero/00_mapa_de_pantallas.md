# Mesa al día · Rol MESERO · Mapa de pantallas y flujo (tarea 2.5)

Estado: **aprobado por Anderson el 20/10/2026** (con los ajustes de la sección «Decisiones»). Dispositivo: celular vertical (~390 px), uso a una mano.
Los wireframes están en esta carpeta (HTML + CSS estático; abrir `index.html`) y se basan en `docs/02_api_y_eventos.md`.

## Estructura base

- **Barra superior:** título de la pantalla e indicador de conexión (● en línea / ○ sin conexión).
- **Barra inferior fija (pulgar):** Mesas · Preparados · Mi día.
- **Avisos en tiempo real:** solo como **avisos emergentes** sobre la pantalla actual. **No hay historial ni bandeja de avisos** (el SRS no lo pide); el estado real siempre se ve en M1, M3 y M4.
- **Estados de conexión (CU15):** no son una pantalla. Franja «Reconectando…» sobre cualquier pantalla y, si tras **30 s** no se logra reconectar, bloqueo «Acérquese personalmente».

## Pantallas

La numeración conserva el hueco de **M10** (era el historial de avisos, eliminado), para no renombrar archivos.

| # | Pantalla | Qué resuelve | Origen |
|---|---|---|---|
| M0 | Ingreso | Usuario y contraseña; errores `CREDENCIALES_INVALIDAS` y `USUARIO_INACTIVO` | CU2 |
| M1 | Mis mesas (inicio) | Filtro por sector; cuadrícula de mesas con sus 4 estados; mesas reasignadas marcadas | RF13, CU8 |
| M2 | Mesa | Cuentas vivas de la mesa, «Nueva cuenta», «Reasignar mesa» | CU9, CU14 |
| M3 | Cuenta | Pedidos con estado de comanda, total, «Agregar productos», «Marcar pendiente de pago» / «Reabrir cuenta», cancelar por pedido | CU13, RF4 |
| M4 | Menú (tomar pedido) | Categorías, recomendados, agotados en gris, barra del pedido en curso | CU10, CU23, RF3 |
| M5a | Personalizar producto | Opciones, observación, modalidad, cantidad, «Usar un preparado» | CU10, CU11 |
| M5b | Personalizar combo | Modalidad (mesa/llevar), quitar componentes, «Anticipada» por componente, extras | CU10, CU11 |
| M6 | Resumen y envío | Revisar ítems y enviar; error si algo se agotó | CU25 |
| M7 | Elegir preparado | Unidades ya preparadas del producto; vacío → «No hay platos ya preparados» | CU20, CU21 |
| M8a | Cancelar pedido | Motivo obligatorio, dentro de 3 min (cancela al instante) | CU17 |
| M8b | Solicitar cancelación | Motivo obligatorio, pasados 3 min (autoriza caja) | CU18 |
| M9a / M9b | Reasignar mesa / Mesa reasignada | Reasignación temporal elegida por el servidor y cómo terminarla | CU7 |
| M11 | Preparados (pestaña) | Consulta de preparados disponibles (el mesero **no** los crea, solo los asigna) | CU20 |
| M12 | Mi día (pestaña) | Número de pedidos por mesa del día, sin cancelados | RF15, CU24 |
| M13 | Estados especiales | Reconectando, sin conexión, avisos emergentes, pedido enviado, confirmar «pendiente de pago» y «reabrir» | CU15 |

## Flujo de navegación

```
M0 Ingreso → M1 Mis mesas → M2 Mesa → M3 Cuenta
                                         │
           ┌─────────────────────────────┤
           ▼                             ▼
  M4 Menú → M5a/M5b Personalizar → M6 Resumen → (enviado) → M3 Cuenta
             └→ M7 Elegir preparado
  M3 → M8a/M8b Cancelar o solicitar        M2 → M9a Reasignar → M9b
  Barra inferior: Mesas (M1) · Preparados (M11) · Mi día (M12)
```

«Agregar productos» y «tomar pedido nuevo» usan la misma pantalla M4; solo cambia la cuenta destino.

## Decisiones tomadas

1. **CU7:** el servidor elige al mesero que recibe la mesa; el mesero solo pulsa «Reasignar» (sin selector). Si más adelante se quiere elegir, hará falta un endpoint nuevo (lista de meseros disponibles).
2. **RF15 (Mi día):** se muestra el número de pedidos por mesa, sin los cancelados.
3. **CU15:** espera de **30 s** antes de pedir que se acerque personalmente. Debe ser una **constante única de configuración** del frontend.
4. **Preparados:** el mesero no los registra (eso es de cocina/bar), solo los asigna. La opción `crear_preparado` de la cancelación **no** aparece para el mesero.
5. **Etiqueta de cuenta (CU14):** numérica («Cuenta 1», «Cuenta 2», …).
6. **Preparados** va como pestaña propia para consultarlos sin abrir un pedido.
7. **Cuenta `PENDIENTE` = en proceso de pago:** ya **no admite pedidos nuevos** (solo `ABIERTA` los admite). Cambia la regla anterior, que solo bloqueaba las pagadas. Las cancelaciones siguen bloqueadas solo con la cuenta `PAGADA`. Una cuenta `PENDIENTE` se puede **reabrir** (desmarcar, vuelve a `ABIERTA`) mientras no esté pagada.
8. **Combos para llevar:** un combo puede pedirse «Llevar»; cada componente usa el empaque que ya tiene definido. No se crea ningún empaque nuevo para el combo. Además, **cada componente puede pedirse «Anticipada»** por separado (el combo no se anticipa entero).
9. **Sin historial de avisos:** se eliminó la pantalla M10 y la campana. Solo avisos emergentes.
10. **Atajos de motivo** («Cliente cambió de idea», «Error al tomar», «Otro») en M8a/M8b: aprobados como atajos opcionales.
11. **Mesa cedida:** solo se abre para terminar la reasignación (M9b).
12. **`GET /cuentas/{id}` devuelve la hora de registro de cada pedido** (`registrado_en`, que sale de `pedido.creado_en`) y la hora del servidor (`hora_servidor`). Con eso la app dibuja la cuenta regresiva de 3 min y decide «Cancelar» o «Solicitar», sin depender del reloj del celular; el servidor sigue decidiendo.
13. **Combo «Llevar» ⇒ sin componentes anticipados:** cada ítem guarda una sola modalidad (mesa, llevar o anticipada), así que cuando el combo es «Llevar» los botones «Anticipada» se desactivan (aprobado por Anderson el 20/10/2026).

## Pendientes a confirmar (no bloquean)

- Que el campo `etiqueta` de la cuenta admita guardar un número (como texto está bien).
- Si «Preparación anticipada» está apagada (`anticipada.estado`), los botones de anticipada se deshabilitan (M5a y M5b).
- Duración de los avisos emergentes (supuesto: unos 8 s).
