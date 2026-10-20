# Mesa al día · Rol MESERO · Mapa de pantallas y flujo (tarea 2.5)

Estado: **aprobado por Anderson el 20/10/2026**. Dispositivo: celular vertical (~390 px), uso a una mano.
Los wireframes se dibujan en esta carpeta (HTML + CSS estático) y se basan en `docs/02_api_y_eventos.md`.

## Estructura base

- **Barra superior:** sector activo, indicador de conexión y campana de avisos (con contador).
- **Barra inferior fija (pulgar):** Mesas · Preparados · Mi día.
- **Estados de conexión (CU15):** no son una pantalla. Franja «Reconectando…» sobre cualquier pantalla y, si tras **30 s** no se logra reconectar, bloqueo «Acérquese personalmente».

## Pantallas

| # | Pantalla | Qué resuelve | Origen |
|---|---|---|---|
| M0 | Ingreso | Usuario y contraseña; errores `CREDENCIALES_INVALIDAS` y `USUARIO_INACTIVO` | CU2 |
| M1 | Mis mesas (inicio) | Filtro por sector; cuadrícula de mesas con sus 4 estados; mesas reasignadas a mí marcadas | RF13, CU8 |
| M2 | Mesa | Cuentas vivas de la mesa, «Nueva cuenta», «Reasignar mesa» | CU9, CU14 |
| M3 | Cuenta | Pedidos con estado de comanda, total, «Agregar productos», «Marcar pendiente de pago», cancelar por pedido | CU13, RF4 |
| M4 | Menú (tomar pedido) | Categorías, recomendados, agotados en gris, barra del pedido en curso | CU10, CU23, RF3 |
| M5 | Personalizar producto | Opciones, observación, modalidad, cantidad; en combos, quitar componentes y extras | CU10, CU11 |
| M6 | Resumen y envío | Revisar ítems y enviar; error si algo se agotó | CU25 |
| M7 | Elegir preparado | Unidades ya preparadas del producto; vacío → «No hay platos ya preparados» | CU20, CU21 |
| M8 | Cancelar pedido | Motivo obligatorio; versión «Cancelar» (≤ 3 min) y «Solicitar cancelación» (> 3 min) | CU17, CU18 |
| M9 | Reasignar mesa | Reasignación temporal y cómo terminarla | CU7 |
| M10 | Avisos | Historial de la campana; los avisos nuevos salen como aviso emergente | RF7, RF3 |
| M11 | Preparados (pestaña) | Consulta de preparados disponibles (el mesero **no** los crea, solo los asigna) | CU20 |
| M12 | Mi día (pestaña) | Número de pedidos por mesa del día, sin cancelados | RF15, CU24 |

## Flujo de navegación

```
M0 Ingreso → M1 Mis mesas → M2 Mesa → M3 Cuenta
                                         │
           ┌─────────────────────────────┤
           ▼                             ▼
  M4 Menú → M5 Personalizar → M6 Resumen → (enviado) → M3 Cuenta
             └→ M7 Elegir preparado
  M3 → M8 Cancelar / Solicitar          M2 → M9 Reasignar
  Barra inferior: Mesas (M1) · Preparados (M11) · Mi día (M12)
  Campana: M10 Avisos
```

«Agregar productos» y «tomar pedido nuevo» usan la misma pantalla M4; solo cambia la cuenta destino.

## Decisiones tomadas en este chat

1. **CU7:** el servidor elige al mesero que recibe la mesa; el mesero solo pulsa «Reasignar» (sin selector). Si más adelante se quiere elegir, hará falta un endpoint nuevo (lista de meseros disponibles).
2. **RF15 (Mi día):** se muestra el número de pedidos por mesa, sin los cancelados.
3. **CU15:** espera de **30 s** antes de pedir que se acerque personalmente. Debe ser una **constante única de configuración** del frontend, para poder cambiarla sin tocar nada más.
4. **Preparados:** el mesero no los registra (eso es de cocina/bar), solo los asigna a un pedido. La opción `crear_preparado` de la cancelación **no** aparece para el mesero.
5. **Etiqueta de cuenta (CU14):** numérica («Cuenta 1», «Cuenta 2», …).
6. **Preparados** va como pestaña propia para consultarlos sin abrir un pedido.

## Pendientes a confirmar (no bloquean el dibujo)

- Que `GET /cuentas/{id}` devuelva la **hora de registro** de cada pedido, para decidir en la app si muestra «Cancelar» o «Solicitar cancelación».
- Que el campo `etiqueta` de la cuenta admita guardar un número (como texto está bien).
- Si «Preparación anticipada» está apagada (`anticipada.estado`), la modalidad ANTICIPADA se oculta o se deshabilita en M5.
