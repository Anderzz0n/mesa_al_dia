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
- **Inactividad (CU3):** el token vence tras un tiempo sin uso, y el servidor lo renueva en cada llamada. **Excepción para las pantallas fijas (`COCINA` y `BAR`):** mientras su WebSocket siga conectado cuenta como uso y el servidor renueva el token, para que el tablero no se cierre solo en pleno servicio aunque nadie lo toque (propuesta del diseño de Cocina, por confirmar).
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
| `GET /productos?categoria=&disponible=&destino=` | todos | Menú. Cada producto trae opciones, componentes (si es combo), empaques y `permite_anticipada`. `destino=COCINA` o `BAR` filtra por área; los combos no tienen destino, así que no salen con ese filtro (se ven por sus componentes). Cocina y bar usan el filtro de su área. | |
| `GET /productos/recomendados` | MESERO | Más pedidos en la franja actual. Vacío si no hay histórico. | CU23 |
| `POST /productos`, `PATCH /productos/{id}` | ADMIN | Alta y edición del catálogo. | |
| `PATCH /productos/{id}/stock` | COCINA, BAR (solo productos de su destino) | Cuerpo `{ "cantidad": 10 }` o `{ "ajuste": -2 }`. El servidor **corrige** negativos a 0 y redondea decimales, y devuelve el valor guardado. Si queda en 0, el producto pasa a no disponible. Error `DESTINO_NO_PERMITIDO` si el producto es del otro destino. | CU22 |
| `PATCH /productos/{id}/disponibilidad` | COCINA, BAR (solo productos de su destino) | Bloqueo o habilitación manual. Error `DESTINO_NO_PERMITIDO` igual que arriba. | CU22 |
| `PATCH /productos/{id}/anticipada` | COCINA, BAR (solo productos de su destino) | Cuerpo `{ "permite_anticipada": true }`: habilita o deshabilita un producto para la preparación anticipada (columna `producto.permite_anticipada`). El EDT (tarea 9.3) dice que cocina habilita «la función y los productos»; el diseño de Bar extiende lo mismo a su área. Error `DESTINO_NO_PERMITIDO` si el producto es del otro destino. Emite `producto.disponibilidad`. | RF6 |
| `GET /opciones?destino=` | todos | Catálogo de opciones, sus restricciones y los productos que usan cada una (`usada_en`, con el `destino` de cada producto, para que Cocina y Bar puedan marcar las opciones compartidas con la otra área). `destino=COCINA` o `BAR` deja solo las opciones de productos de esa área. | CU10, CU12 |
| `PATCH /opciones/{id}` | COCINA, BAR, ADMIN | Habilita o deshabilita una opción. El catálogo es único, así que el cambio vale para todos los productos que la usan; la pantalla de cocina y bar solo muestra las de su área y marca con «También en Cocina/Bar» las que usa también el otro destino (apagarla pide confirmación). Emite `opcion.disponibilidad`. | CU12 |
| `GET /parametros` | todos | Valores actuales de los parámetros que las pantallas necesitan: `ANTICIPADA_ACTIVA_COCINA`, `ANTICIPADA_ACTIVA_BAR`, `VENTANA_CANCELACION_MINUTOS`, `UMBRAL_DEMORA_COCINA_MINUTOS` y `UMBRAL_DEMORA_BAR_MINUTOS`. Sirve para conocer el estado al abrir la pantalla o al reconectar; después los cambios llegan por evento (`anticipada.estado`). Cocina y bar usan el umbral de su área. | RF6 |
| `PATCH /parametros/anticipada` | COCINA, BAR | Cuerpo `{ "destino": "COCINA" \| "BAR", "activa": true }`: interruptor de la preparación anticipada **de un área**. Cada rol mueve solo el suyo (`DESTINO_NO_PERMITIDO` si no). Emite `anticipada.estado`. | RF6, CU12 |

`UMBRAL_DEMORA_COCINA_MINUTOS` y `UMBRAL_DEMORA_BAR_MINUTOS` son parámetros nuevos: minutos desde que se envió una comanda a partir de los cuales el tablero de esa área la marca como demorada (no lo pide el SRS; es una mejora del diseño de Cocina). Son dos porque una bebida tarda menos que un plato y con un valor único la alerta quedaría mal calibrada en una de las dos áreas. **Valores iniciales (supuestos, ajustables por el equipo): 20 minutos para cocina y 7 para bar.** La preparación anticipada también es **por área**: `ANTICIPADA_ACTIVA_COCINA` y `ANTICIPADA_ACTIVA_BAR` sustituyen al antiguo `ANTICIPADA_ACTIVA`. Hay que sembrar estas cuatro claves en `parametro` (migraciones, tarea 3.4).

### Cuentas y pedidos (RF4, RF12)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /mesas/{id}/cuentas` | MESERO, CAJA | Cuentas vivas de la mesa con su total. | CU9, CU13 |
| `POST /mesas/{id}/cuentas` | MESERO | Crea una cuenta (`etiqueta`). Sirve para mesa libre u ocupada. | CU9, CU14 |
| `GET /cuentas/{id}` | MESERO, CAJA | Pedidos, ítems, opciones y total. Cada pedido trae `registrado_en` y la respuesta trae `hora_servidor`: la app los usa para la cuenta regresiva de la ventana de 3 min y para mostrar «Cancelar» o «Solicitar cancelación» (el servidor sigue decidiendo). | |
| `PATCH /cuentas/{id}` | MESERO | Cuerpo `{ "estado": "PENDIENTE" }`: marca la cuenta en proceso de pago (ya consumió y falta pagar); desde ahí ya no admite pedidos nuevos. Cuerpo `{ "estado": "ABIERTA" }`: la reabre (desmarca). Error `CUENTA_PAGADA` si ya se liquidó. | RF4 |
| `POST /cuentas/{id}/pedidos` | MESERO | **Envía un pedido.** Valida todo, descuenta stock, resuelve el mesero responsable, crea las comandas y emite `comanda.nueva`. **Solo acepta cuentas `ABIERTA`:** si está `PENDIENTE` o `PAGADA`, error `CUENTA_NO_ABIERTA`. Ver cuerpo abajo. | CU10, CU11, CU13, CU25 |
| `GET /pedidos/{id}` | MESERO, CAJA, COCINA, BAR | Detalle del pedido. | |

Cuerpo de `POST /cuentas/{id}/pedidos`:

```json
{
  "items": [
    { "producto_id": 7, "cantidad": 1, "modalidad": "LLEVAR",
      "opciones": [12, 15], "observacion": "sin servilleta" },
    { "producto_id": 20, "cantidad": 1,
      "modalidad": "MESA", "componentes_quitados": [9], "componentes_anticipados": [10],
      "extras": [{ "producto_id": 4, "cantidad": 1 }] },
    { "producto_id": 3, "cantidad": 1, "preparado_id": 55 }
  ]
}
```

- `modalidad`: `MESA` por defecto, `LLEVAR` o `ANTICIPADA`. `ANTICIPADA` solo se acepta si el producto tiene `permite_anticipada` **y** el interruptor de su área (`ANTICIPADA_ACTIVA_COCINA` o `ANTICIPADA_ACTIVA_BAR`, según el `destino` del producto) está activo; si no, `MODALIDAD_NO_PERMITIDA`. En un combo la regla se aplica a cada componente según su área. El mesero ve la opción «Anticipada» de un producto solo cuando se cumplen las dos condiciones.
- Combos: `modalidad` (`MESA` o `LLEVAR`; la heredan sus componentes), `componentes_quitados`, `componentes_anticipados` (los componentes que salen por la cola anticipada; cada uno se guarda como ítem hijo con modalidad `ANTICIPADA`) y `extras`. Con `LLEVAR` no se aceptan `componentes_anticipados` (cada ítem guarda una sola modalidad) → `MODALIDAD_NO_PERMITIDA` (decisión del equipo).
- `preparado_id`: usa una unidad ya preparada (CU21). Error `PREPARADO_NO_DISPONIBLE` si otro mesero se la ganó.
- Todo el pedido se guarda **o no se guarda nada** (una sola transacción).

### Comandas (RF7)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /comandas?destino=&estado=&fecha=&acuse=` | COCINA, BAR (su destino; `DESTINO_NO_PERMITIDO` si piden otro) | Tablero. Las anticipadas van primero y, dentro de cada grupo, las más antiguas primero. `estado` admite varios valores separados por coma (el tablero pide `ENVIADA,RECIBIDA,EN_PREPARACION`). `fecha=hoy` o `AAAA-MM-DD` filtra por `enviada_en` y alimenta «Listas de hoy» (`estado=LISTA&fecha=hoy`). `acuse=pendiente` devuelve solo las `CANCELADA` sin acuse de recibo y alimenta la franja «Cancelaciones por acusar». Ver el detalle de cada comanda abajo. | CU12 |
| `POST /comandas/{id}/confirmacion` | COCINA, BAR (solo comandas de su destino) | Confirma la recepción con `{ "items_confirmados": n }`. Responde `{ "items_enviados": n, "items_confirmados": n, "coincide": true \| false }`. Si no coincide, **la comanda queda confirmada igual** (no se bloquea la cocina): cocina ve el aviso de diferencia y el mesero la recibe en `comanda.recibida`. **Corregir el recuento:** mientras la comanda siga en `RECIBIDA` (aún no pasa a `EN_PREPARACION`), cocina puede volver a llamar a este endpoint con el número bien contado; el servidor reemplaza `items_confirmados`, recalcula `coincide` y emite otra vez `comanda.recibida`, que **sustituye** el aviso anterior del mesero. No se guarda historial de los recuentos anteriores. Una vez en `EN_PREPARACION` o después, ya no se puede: error `COMANDA_NO_CONFIRMABLE`. | CU15 |
| `PATCH /comandas/{id}` | COCINA, BAR (solo comandas de su destino) | Cambia el estado a `EN_PREPARACION` o `LISTA`. | |
| `POST /comandas/{id}/acuse-cancelacion` | COCINA, BAR (solo comandas de su destino) | Acusa recibo de una cancelación. El acuse es **por comanda**: cada área acusa la suya. | RF8 |

Las cuatro acciones de arriba devuelven `DESTINO_NO_PERMITIDO` (403) si la comanda es del otro área: un usuario de bar no puede confirmar, avanzar ni acusar una comanda de cocina, y viceversa.

Estados de una comanda (`estado_comanda` en `db/04`): `ENVIADA` → `RECIBIDA` (confirmación de recepción, CU15) → `EN_PREPARACION` → `LISTA`. Pasa a `CANCELADA` cuando se aprueba la cancelación de su pedido. Después de `LISTA` no hay otro estado.

**Qué trae cada comanda en `GET /comandas`** (lo que cocina y bar necesitan para trabajar sin pedir nada más) y la respuesta trae además `hora_servidor`, para calcular el tiempo transcurrido sin depender del reloj del equipo:

```json
{
  "hora_servidor": "2026-10-21T14:30:00-05:00",
  "comandas": [{
    "id": 22, "destino": "COCINA", "es_anticipada": false, "estado": "ENVIADA",
    "mesa": 2, "cuenta": "Cuenta 1", "mesero": { "id": 7, "nombre": "..." },
    "enviada_en": "...", "confirmada_en": null, "lista_en": null,
    "cancelacion_acuse_en": null, "total_items": 3,
    "items": [
      { "producto": "Producto B", "cantidad": 2, "modalidad": "LLEVAR",
        "opciones": ["opción 1", "opción 2"], "observacion": "sin servilleta",
        "es_preparado": false },
      { "producto": "Combo C", "cantidad": 1, "modalidad": "MESA", "es_preparado": false,
        "componentes": [ { "producto": "componente 1", "quitado": false },
                         { "producto": "componente 3", "quitado": true } ],
        "extras": [ { "producto": "Producto D", "cantidad": 1 } ] },
      { "producto": "Producto E", "cantidad": 1, "modalidad": "MESA", "es_preparado": true }
    ]
  }]
}
```

- `es_preparado: true` marca los ítems tomados de los productos ya preparados (`preparado_id`): la pantalla los separa en el bloque «Ya preparado · no cocinar».
- **Qué cuenta como «ítem» en CU15:** una línea de la comanda tal como la ve cocina: cada producto suelto, cada combo (una sola línea, con sus componentes) y cada ítem ya preparado. `total_items` y `items_enviados` usan esta misma regla, y el recuento que escribe cocina (`items_confirmados`) se compara contra ella.
- Un combo aparece en la comanda de cocina solo con los componentes de cocina que no van por la cola anticipada; los demás van en las comandas de bar o anticipada correspondientes. Lo mismo vale al revés para la comanda de bar: trae solo los componentes de bar.

### Cancelaciones (RF8)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `POST /pedidos/{id}/cancelaciones` | MESERO, CAJA | Cuerpo `{ "motivo": "...", "crear_preparado": false }` (motivo obligatorio). **MESERO dentro de 3 minutos** desde el registro del pedido: queda `APROBADA` al instante. **MESERO pasados los 3 minutos:** queda `SOLICITADA`, a la espera de caja. **CAJA:** en cualquier momento, queda `APROBADA`. Errores `CUENTA_PAGADA` (ya se liquidó) y `CANCELACION_YA_EXISTE`. | CU17, CU18 |
| `GET /cancelaciones?estado=SOLICITADA` | CAJA | Solicitudes pendientes de autorización. | CU18 |
| `POST /cancelaciones/{id}/resolucion` | CAJA | Cuerpo `{ "decision": "APROBAR" \| "RECHAZAR", "crear_preparado": false }`. Si se rechaza, el mesero puede volver a solicitarla. Si el pedido ya estaba preparado, caja puede marcar `crear_preparado` para que se registre como producto preparado disponible. | CU18, CU19 |

El servidor decide si aplica la ventana de 3 minutos (parámetro `VENTANA_CANCELACION_MINUTOS`); la app solo muestra el botón «Cancelar» o «Solicitar cancelación» según corresponda.

### Productos preparados (RF10)

| Método y ruta | Rol | Qué hace | CU |
|---|---|---|---|
| `GET /preparados?producto_id=&destino=` | MESERO, COCINA, BAR | Unidades disponibles, una por fila, con `producto` y `registrado_en` (la pantalla de cocina las agrupa por producto). `destino=` filtra por área; cocina y bar usan el suyo. Lista vacía → mensaje «No hay platos ya preparados». | CU20 |
| `POST /preparados` | COCINA, BAR (solo productos de su destino) | Registra unidades preparadas (`producto_id`, `cantidad` entera, mínimo 1). Error si no es un producto del menú o si es del otro destino (`DESTINO_NO_PERMITIDO`). | CU19 |

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
| `comanda.recibida` | `mesero:{id}` | Cocina/bar confirman, o corrigen su recuento mientras la comanda sigue en `RECIBIDA` (llega otra vez y sustituye la anterior) | `items_enviados`, `items_confirmados`, `coincide` |
| `comanda.estado` | `mesero:{id}` | Pasa a en preparación o lista | comanda y estado |
| `cancelacion.solicitada` | `caja` | El mesero solicita una cancelación tardía | cancelación, pedido, mesa, motivo |
| `pedido.cancelado` | solo las áreas (`cocina` y/o `bar`) que tienen comandas del pedido, y `mesero:{id}` | Se aprueba una cancelación | pedido, comandas afectadas con el **estado en que estaba cada una** (`estado_anterior`; cocina lo usa para saber si debe dejar de prepararla). No incluye el motivo. |
| `cancelacion.rechazada` | `mesero:{id}` | Caja rechaza la solicitud | cancelación, pedido |
| `producto.disponibilidad` | `meseros` y la sala del área del producto (`cocina` o `bar`) | Cambia stock, disponibilidad o `permite_anticipada` | producto, `disponible`, `stock_cantidad`, `permite_anticipada` |
| `opcion.disponibilidad` | `meseros`, `cocina` y `bar` (según las áreas cuyos productos usan la opción) | Se habilita o deshabilita una opción | opción, `disponible` |
| `anticipada.estado` | `meseros` y la sala del área (`cocina` o `bar`) | Cocina o bar cambian el interruptor de su área | `destino`, `activa` |
| `mesa.estado` | `meseros`, `caja` | Cambia el estado de una mesa | mesa, estado |
| `preparado.nuevo` / `preparado.asignado` | `meseros` y la sala del área del producto (`cocina` o `bar`) | Se registra o se usa un preparado | preparado, producto; si se asigna, aviso al área (cocina o bar) para no repetirlo |
| `sector.asignacion` | `admin`, `mesero:{id}` | Cambia una asignación | sector, mesero |

**Pérdida de conexión (CU15):** si el WebSocket se cae, el cliente muestra el aviso, reintenta y, al reconectar, **vuelve a pedir el estado por REST** (mesas, comandas, menú) para ponerse al día de lo que se perdió. Si no logra reconectar, el mesero «debe acercarse personalmente», como dice el caso de uso. Cocina y bar, que están físicamente en el sitio, solo ven el aviso de «sin conexión» y no pueden cambiar nada hasta reconectar; al volver, vuelven a pedir `GET /comandas` (en curso, listas de hoy y cancelaciones por acusar), productos, opciones y `GET /parametros`.

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
| `DESTINO_NO_PERMITIDO` | 403 | Esto no es de su área (producto, comanda o interruptor del otro destino; texto propuesto, no está en el SRS) |
| `COMANDA_NO_CONFIRMABLE` | 409 | La comanda ya no admite confirmación (texto propuesto; no está en el SRS) |
| `CANCELACION_YA_EXISTE` | 409 | Este pedido ya tiene una cancelación en curso o aprobada |
| `CUENTA_PAGADA` | 409 | La cuenta ya fue liquidada |
| `CUENTA_NO_ABIERTA` | 409 | La cuenta ya no admite pedidos nuevos (en proceso de pago o pagada) |
| `ERROR_ENVIO` | 503 | No se pudo enviar el pedido: reintente o acérquese |
