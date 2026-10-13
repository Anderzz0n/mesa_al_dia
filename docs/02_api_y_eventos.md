# Mesa al día · Diseño de la API y los eventos (tarea 2.4)

Borrador para revisión. Es un diseño, todavía no hay código de la aplicación.
Cada endpoint indica el rol que puede usarlo y el requerimiento (RF/CU) que cubre.

## 1. Cómo se comunican el cliente y el servidor

Hay **dos canales**, cada uno con un trabajo distinto:

| Canal | Para qué | Quién inicia |
|---|---|---|
| **API REST** (HTTP + JSON) | Las **acciones** y las **consultas**: crear un pedido, confirmar una comanda, consultar las mesas. | El cliente pide, el servidor responde. |
| **Eventos en tiempo real** (WebSocket) | Los **avisos**: «llegó una comanda», «se acabó la gaseosa». | El servidor empuja el aviso a quien corresponda, sin que el cliente pregunte. |

Regla de diseño: **toda acción pasa por REST** y el servidor emite un evento como consecuencia. El WebSocket solo avisa y nunca recibe órdenes. Así hay una sola puerta de entrada, y es más fácil de entender, de probar y de proteger.

## 2. Convenciones

- **Base:** `/api/v1`. Datos en JSON. Nombres de campos en español y `snake_case`, igual que la base de datos.
- **Autenticación:** `POST /auth/login` entrega un token. Todas las demás llamadas lo envían en la cabecera `Authorization: Bearer <token>`. El token trae el rol del usuario.
- **Inactividad (CU3):** el token vence tras un tiempo sin uso, y el servidor lo renueva en cada llamada.
- **Roles:** `ADMIN`, `MESERO`, `COCINA`, `BAR`, `CAJA`. Si el rol no puede usar un endpoint, responde `403`.
- **Errores:** siempre el mismo formato, y el `mensaje` es el texto que se muestra en pantalla.

```json
{ "codigo": "USUARIO_DUPLICADO", "mensaje": "Usuario ya registrado" }
```

| HTTP | Cuándo |
|---|---|
| 200 / 201 | Bien / creado |
| 400 | Faltan datos o tienen mal formato |
| 401 | Sin sesión o credenciales incorrectas |
| 403 | Rol sin permiso |
| 404 | No existe |
| 409 | Choca con el estado actual (duplicado, no disponible, ventana vencida) |
| 422 | Dato válido pero que rompe una regla de negocio |

## 3. Endpoints

### Acceso y usuarios (RF1)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `POST /auth/login` | todos | Usuario y contraseña → token y rol. Error `CREDENCIALES_INVALIDAS` o `USUARIO_INACTIVO`. | CU2 |
| `POST /auth/logout` | autenticado | Cierra la sesión. | CU3 |
| `GET /usuarios` | ADMIN | Lista usuarios. | CU1 |
| `POST /usuarios` | ADMIN | Crea usuario con rol. Error `USUARIO_DUPLICADO`. | CU1 |
| `PATCH /usuarios/{id}` | ADMIN | Cambia nombre, rol o `activo`. | CU1 |
| `POST /usuarios/{id}/restablecer-contrasena` | ADMIN | Restablecimiento asistido. | RF1 |

### Mesas, sectores y asignación (RF2)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /mesas` | todos | Mesas con su **estado** calculado (`v_estado_mesa`). | CU8 |
| `POST /mesas`, `PATCH /mesas/{id}` | ADMIN | Alta y edición de mesas. | |
| `GET /sectores` | ADMIN, MESERO | Sectores con sus mesas y responsable vigente. | |
| `POST /sectores` | ADMIN | Crea sector con nombre y mesas. Errores `SECTOR_NOMBRE_REPETIDO`, `SECTOR_SIN_MESAS`. | CU4 |
| `PATCH /sectores/{id}` | ADMIN | Cambia nombre o mesas. | |
| `PUT /sectores/{id}/asignacion` | ADMIN | Asigna o cambia el mesero del sector (cierra la anterior y abre otra). | CU5, CU6 |
| `POST /mesas/{id}/reasignaciones` | ADMIN, MESERO | Otro mesero atiende la mesa temporalmente. Error `SIN_MESEROS_DISPONIBLES`. | CU7 |
| `DELETE /mesas/{id}/reasignaciones/vigente` | ADMIN, MESERO | Termina la reasignación. | CU7 |
| `GET /meseros/{id}/actividad?fecha=` | ADMIN; MESERO solo la suya | Pedidos del día, sin los cancelados. | CU24 (RF15) |

### Menú, personalización y stock (RF3, RF9)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /categorias` | todos | Categorías ordenadas. | |
| `GET /productos?categoria=&disponible=` | todos | Menú. Cada producto trae opciones, componentes (si es combo) y empaques. | |
| `GET /productos/recomendados` | MESERO | Más pedidos en la franja actual. Vacío si no hay histórico. | CU23 |
| `POST /productos`, `PATCH /productos/{id}` | ADMIN | Alta y edición del catálogo. | |
| `PATCH /productos/{id}/stock` | COCINA, BAR | Cuerpo `{ "cantidad": 10 }` o `{ "ajuste": -2 }`. El servidor **corrige** negativos a 0 y redondea decimales, y devuelve el valor guardado. Si queda en 0, el producto pasa a no disponible. | CU22 |
| `PATCH /productos/{id}/disponibilidad` | COCINA, BAR | Bloqueo o habilitación manual. | CU22 |
| `GET /opciones` | todos | Catálogo de opciones y sus restricciones. | CU10 |
| `PATCH /opciones/{id}` | COCINA, BAR, ADMIN | Habilita o deshabilita una opción. | CU12 |
| `PATCH /parametros/anticipada` | COCINA | Interruptor global de la preparación anticipada. | RF6, CU12 |

### Cuentas y pedidos (RF4, RF12)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /mesas/{id}/cuentas` | MESERO, CAJA | Cuentas vivas de la mesa con su total. | CU9, CU13 |
| `POST /mesas/{id}/cuentas` | MESERO | Crea una cuenta (`etiqueta`). Sirve para mesa libre u ocupada. | CU9, CU14 |
| `GET /cuentas/{id}` | MESERO, CAJA | Pedidos, ítems, opciones y total. | |
| `PATCH /cuentas/{id}` | MESERO | Marca la cuenta como `PENDIENTE` (ya consumió y falta pagar). | RF4 |
| `POST /cuentas/{id}/pedidos` | MESERO | **Envía un pedido.** Valida todo, descuenta stock, resuelve el mesero responsable, crea las comandas y emite `comanda.nueva`. Ver cuerpo abajo. | CU10, CU11, CU13, CU25 |
| `GET /pedidos/{id}` | MESERO, CAJA, COCINA, BAR | Detalle del pedido. | |

Cuerpo de `POST /cuentas/{id}/pedidos`:

```json
{
  "items": [
    { "producto_id": 7, "cantidad": 1, "modalidad": "LLEVAR",
      "opciones": [12, 15], "observacion": "sin servilleta" },
    { "producto_id": 20, "cantidad": 1,
      "componentes_quitados": [9], "extras": [{ "producto_id": 4, "cantidad": 1 }] },
    { "producto_id": 3, "cantidad": 1, "preparado_id": 55 }
  ]
}
```

- `modalidad`: `MESA` por defecto, `LLEVAR` o `ANTICIPADA`.
- Combos: `componentes_quitados` y `extras`.
- `preparado_id`: usa una unidad ya preparada (CU21). Error `PREPARADO_NO_DISPONIBLE` si otro mesero se la ganó.
- Todo el pedido se guarda **o no se guarda nada** (una sola transacción).

### Comandas (RF7)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /comandas?destino=&estado=` | COCINA, BAR (su destino) | Tablero. Las anticipadas van primero. | CU12 |
| `POST /comandas/{id}/confirmacion` | COCINA, BAR | Confirma la recepción con `{ "items_confirmados": n }`. | CU15 |
| `PATCH /comandas/{id}` | COCINA, BAR | Cambia el estado a `EN_PREPARACION` o `LISTA`. | |
| `POST /comandas/{id}/acuse-cancelacion` | COCINA, BAR | Acusa recibo de una cancelación. | RF8 |

### Cancelaciones (RF8)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `POST /pedidos/{id}/cancelaciones` | MESERO, CAJA | Cuerpo `{ "motivo": "...", "crear_preparado": false }`. **MESERO:** solo dentro de 3 minutos desde el registro del pedido; si no, `VENTANA_CANCELACION_VENCIDA`. **CAJA:** en cualquier momento. Error `CUENTA_PAGADA` si ya se liquidó. | CU17, CU18 |

### Productos preparados (RF10)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /preparados?producto_id=` | MESERO, COCINA, BAR | Unidades disponibles. Lista vacía → mensaje «No hay platos ya preparados». | CU20 |
| `POST /preparados` | COCINA, BAR | Registra unidades preparadas (`producto_id`, `cantidad`). Error si no es un producto del menú. | CU19 |

(La asignación a un pedido se hace dentro de `POST /cuentas/{id}/pedidos`, con `preparado_id`.)

### Caja (RF14)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `POST /cuentas/{id}/liquidacion` | CAJA | Marca la cuenta como `PAGADA` (la casilla de pago). La mesa se libera cuando no le quedan cuentas sin pagar. | CU16 |
| `GET /resumen-diario?fecha=` | CAJA, ADMIN | Pedidos del día y totales. | Obj. 6 |

## 4. Eventos en tiempo real

Al abrir el WebSocket con su token, cada cliente entra **automáticamente a las salas que le corresponden**: `cocina`, `bar`, `caja`, `admin`, `meseros` (todos los meseros) y `mesero:{id}` (solo ese mesero).

| Evento | Se envía a | Cuándo | Contenido principal |
|---|---|---|---|
| `comanda.nueva` | `cocina` o `bar` | Se envía un pedido | comanda, mesa, cuenta, ítems, si es anticipada |
| `comanda.recibida` | `mesero:{id}` | Cocina/bar confirman | `items_enviados`, `items_confirmados`, `coincide` |
| `comanda.estado` | `mesero:{id}` | Pasa a en preparación o lista | comanda y estado |
| `pedido.cancelado` | `cocina`/`bar`, `mesero:{id}` | Se aprueba una cancelación | pedido, comandas afectadas |
| `producto.disponibilidad` | `meseros` | Cambia stock o disponibilidad | producto, `disponible`, `stock_cantidad` |
| `opcion.disponibilidad` | `meseros` | Se habilita o deshabilita una opción | opción, `disponible` |
| `anticipada.estado` | `meseros`, `cocina` | Cocina cambia el interruptor | `activa` |
| `mesa.estado` | `meseros`, `caja` | Cambia el estado de una mesa | mesa, estado |
| `preparado.nuevo` / `preparado.asignado` | `meseros`, `cocina` | Se registra o se usa un preparado | preparado, producto; si se asigna, aviso a cocina para no repetirlo |
| `sector.asignacion` | `admin`, `mesero:{id}` | Cambia una asignación | sector, mesero |

**Pérdida de conexión (CU15):** si el WebSocket se cae, el cliente muestra el aviso, reintenta y, al reconectar, **vuelve a pedir el estado por REST** (mesas, comandas, menú) para ponerse al día de lo que se perdió. Si no logra reconectar, el mesero «debe acercarse personalmente», como dice el caso de uso.

## 5. Errores de negocio principales

| `codigo` | HTTP | Mensaje (del SRS) |
|---|---|---|
| `CREDENCIALES_INVALIDAS` | 401 | Usuario o contraseña incorrectos |
| `USUARIO_INACTIVO` | 403 | Su usuario no está activo |
| `USUARIO_DUPLICADO` | 409 | Usuario ya registrado |
| `SECTOR_NOMBRE_REPETIDO` | 409 | Ya existe un sector con ese nombre |
| `SECTOR_SIN_MESAS` | 422 | El sector debe tener al menos una mesa |
| `SIN_MESEROS_DISPONIBLES` | 409 | No hay meseros disponibles |
| `PRODUCTO_NO_DISPONIBLE` | 409 | El producto no está disponible |
| `OPCION_NO_PERMITIDA` / `COMBINACION_NO_PERMITIDA` | 422 | La modificación solicitada no está habilitada |
| `MODALIDAD_NO_PERMITIDA` | 422 | El producto no permite la modalidad seleccionada |
| `PREPARADO_NO_DISPONIBLE` | 409 | El producto preparado ya no está disponible |
| `VENTANA_CANCELACION_VENCIDA` | 409 | Pasaron más de 3 minutos: acérquese a caja |
| `CUENTA_PAGADA` | 409 | La cuenta ya fue liquidada |
| `ERROR_ENVIO` | 503 | No se pudo enviar el pedido: reintente o acérquese |
