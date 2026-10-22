# Mesa al día · Contexto para continuar el desarrollo

Documento de traspaso. Resume todo lo decidido hasta el 21/10/2026 para retomar el
trabajo en un chat nuevo sin el historial anterior.

## 1. El proyecto

- **Qué es:** sistema de gestión de comandas y control operativo de un restaurante (cliente-servidor, soporte móvil, comunicación en tiempo real) que coordina meseros, cocina, bar y caja.
- **Curso:** Ingeniería de Software I (22969 – C2), Grupo N° 02, marco ágil Scrum.
- **Equipo:** Simón Fernando Ruedas Santana (SR · Product Owner & Development) · Anderson Rincón Mantilla (AR · Development, Tester, Backend) · Miguel Angel Angulo Duarte (MA · Scrum Master, Development, Frontend). **El usuario del chat es Anderson.**
- **Repositorio:** `Anderzz0n/mesa_al_dia` (privado, rama `main`, GitHub conectado a Claude). Commits a nombre de Anderzz0n.
- **Requerimientos:** 14 RF y 25 CU del documento «Entrega 1B Parte 2» (PDF, **no está en el repo**; pedirlo al usuario si hace falta un detalle). Además se crea el **RF15** «Consulta de actividad diaria del mesero» (para CU24, que no tenía RF). Prioridades (5 = mayor): RF1:4, RF2:2, RF3:3, RF4:5, RF5:3, RF6:4, RF7:5, RF8:4, RF9:4, RF10:3, RF11:3, RF12:5, RF13:5, RF14:5, RF15:2.

## 2. Forma de trabajar (importante)

- El usuario quiere avanzar **despacio y entender cada código**: explicar cada concepto nuevo en lenguaje sencillo, un paso a la vez, y preguntar antes de decisiones de diseño relevantes.
- Responder en **español**. Respuestas concisas, sin repetir lo ya hecho.
- Probar lo que se escribe (el SQL se probó en PostgreSQL 16 con un clúster temporal: `initdb` como usuario `postgres`, `pg_ctl` con socket en `/tmp`, ejecutar los scripts y casos que deben fallar).
- Antes de crear o sobrescribir un archivo del repo, comprobar con `git log` y `git status` si ya hay trabajo previo de la sesión (un chat puede haber dejado commits o archivos sin commitear); leerlo antes de reemplazarlo.
- Cada paso cerrado = un **commit** con mensaje claro y push a `main`. Los commits terminan con:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y `Claude-Session: <url de la sesión>`.
- En un chat nuevo hay que volver a adjuntar el repositorio (`add_repo` con `Anderzz0n/mesa_al_dia`, acceso `push`) y clonarlo.

## 3. Plan (EDT): 89 tareas, 737 h, 7 sprints

Sprints (horas aprox.): S1 fundación y diseño (112) · S2 seguridad, sectores y tiempo real (104) · S3 menú, stock y cuentas (97) · S4 núcleo del pedido móvil (100) · S5 confirmación, caja y cancelaciones (107) · S6 flujos especiales y personalización (122) · S7 recomendación, pruebas y cierre (95).

Tareas del Sprint 1: 1.1 backlog · 1.3 riesgos · **2.1 SRS v2** · **2.2 arquitectura** · **2.3 modelo de datos (HECHA)** · **2.4 API y eventos (borrador hecho)** · **2.5 UI/UX móvil** · 3.1 repos (hecha de hecho) · **3.2 esqueleto backend** · **3.3 esqueleto frontend** · 3.4 BD y migraciones · 3.6 CI · 12.1 plan de pruebas.
El informe Word de la Entrega 2A (EDT, tablas por fase y por sprint, anexo con fichas de las 89 tareas) ya se entregó al usuario; no está en el repo. Las 28 h de ceremonias Scrum (4 h/sprint) y los puntos (derivados de las horas) son estimaciones propuestas, no verificadas.

## 4. Estado actual

| Hecho | Dónde |
|---|---|
| Modelo de datos completo (PostgreSQL 16), probado | `db/01…04_*.sql` |
| Diseño de API REST y eventos, **revisado y aprobado por el usuario** | `docs/02_api_y_eventos.md` |
| Esqueleto del frontend (3.3): inicio con un acceso por rol, pantallas provisionales (`/mesero`, `/cocina`, `/bar`, `/caja`, `/admin`), proxy de Vite al backend e indicador de estado (API + WebSocket); verificado con backend apagado, sin BD y con BD | `frontend/` |
| Diseño de pantallas del **mesero** (2.5, parte 1): mapa y decisiones + 16 wireframes HTML/CSS con notas por pantalla (abrir `index.html`) | `docs/ux/mesero/` |
| Diseño de pantallas de **cocina** (2.5, parte 2): mapa, decisiones, brechas con `docs/02` y 12 wireframes para PC (C0–C8) con notas por pantalla (abrir `index.html`); aprobados el 21/10/2026 | `docs/ux/cocina/` |
| Diseño de pantallas de **bar** (2.5, parte 3): mapa, decisiones y 11 wireframes para PC (B0–B8) derivados de cocina con `destino = BAR`; pendiente de aprobación de Anderson (21/10/2026) | `docs/ux/bar/` |
| Esqueleto del backend (3.2): Express 5, `pg`, `/api/v1/salud`, errores `{codigo, mensaje}`, Socket.IO con salas (asignación **provisional** sin login) y 7 pruebas | `backend/` |

**Stack decidido (2.2):** JavaScript con Node.js 22, módulos ESM, Express 5 (REST), Socket.IO (eventos), `pg` (PostgreSQL 16), pruebas con `node:test`. Frontend: React 19 + Vite, una sola app con rutas por rol (`react-router-dom`), cliente `socket.io-client`.

**Pendiente (en orden sugerido):**
1. Migraciones a partir de `db/` (3.4) y CI (3.6; debe correr las pruebas de `backend/` y el build de `frontend/`).
2. Diseño de pantallas (2.5): **mesero, cocina y bar hechos** (bar a la espera de aprobación); faltan caja y admin, **un chat por rol**, siguiendo la convención de la sección 8, antes de construir el frontend real. Bar puede reutilizar las pantallas de cocina con `destino = BAR`.
2b. Al hacer las migraciones (3.4): en `parametro` sustituir `ANTICIPADA_ACTIVA` por `ANTICIPADA_ACTIVA_COCINA` y `ANTICIPADA_ACTIVA_BAR`, y sembrar `UMBRAL_DEMORA_COCINA_MINUTOS` y `UMBRAL_DEMORA_BAR_MINUTOS` (ya documentados en `docs/02`; valores iniciales supuestos: **20** min para cocina y **7** para bar; `permite_anticipada` ya existe en `producto`). Opcional: `CHECK` coherente con la regla de la anticipada por área.
3. En el Sprint 2 (RF1): login con token Bearer y reemplazar `salasPorDefecto` en `backend/src/tiempo_real.js` por salas según el rol (hoy cualquiera puede pedir cualquier sala) y hacer que el inicio del frontend lleve a cada usuario a su rol.
4. Pendientes menores: enlace de Jira, logo del producto, formalizar SRS v2 (tarea 2.1) con las correcciones de la sección 6.

## 5. Decisiones de diseño tomadas

**Datos**
- Una mesa pertenece a **un solo sector**. Un sector tiene un responsable vigente a la vez; un mesero puede tener varios sectores. Cambiar la asignación **cierra** la fila anterior (`vigente_hasta`) y abre otra. La reasignación temporal (CU7) es **por mesa** (RF2 dice «pedido» por error).
- Jerarquía: `mesa → cuenta → pedido → item_pedido → item_opcion`. **Cuenta** = lo que se paga; **pedido** = cada envío de productos a cocina/bar; agregar productos después crea un pedido nuevo.
- Estados de cuenta: `ABIERTA`, `PENDIENTE` (ya consumió y falta pagar; en proceso de pago), `PAGADA`. **Solo `ABIERTA` admite pedidos nuevos;** `PENDIENTE` se puede reabrir (volver a `ABIERTA`) mientras no esté pagada. El **pago es solo una casilla**: el proyecto no gestiona métodos de pago ni la caja física. Cuenta pagada trae `cerrada_en` y `cerrada_por`. No hay tabla de pagos.
- El estado de la mesa **no se guarda**: lo calcula la vista `v_estado_mesa` (con pedidos pendientes → ocupada → en proceso de pago → disponible). El total de la cuenta lo calcula `v_total_cuenta` (excluye pedidos con cancelación aprobada).
- `precio_unitario` y `precio_extra` se copian al ítem (foto del precio). `pedido.mesero_id` es el responsable en ese momento.
- Producto: `stock_cantidad` NULL = no se cuenta; `CHECK` impide stock 0 con `disponible = true`; sin negativos ni decimales. `destino` COCINA/BAR; los **combos** (`es_combo`) no tienen destino, sus componentes sí (`combo_componente`, con `removible`). En el pedido un combo es un ítem padre y sus componentes ítems hijos (`item_padre_id`, precio 0 los incluidos). La modalidad se guarda **por ítem**: el combo puede ir `LLEVAR` y cada componente puede ir `ANTICIPADA`.
- Opciones de personalización: catálogo **único** enlazado a productos (`producto_opcion`) para poder deshabilitar una opción para todos (RF3 pide tiempo real); combinaciones prohibidas en `restriccion_opcion` (par con `a < b`).
- Comandas: una por (pedido, destino, es_anticipada); la anticipada va aparte en cola prioritaria. `RECIBIDA` = confirmación de recepción de RF7 (`items_confirmados`). `item_pedido.comanda_id` (FK compuesta con `pedido_id`).
- Cancelación a nivel de **pedido completo**, motivo obligatorio. Ventana de **3 min desde el registro del pedido** (parámetro `VENTANA_CANCELACION_MINUTOS`). Mesero dentro de plazo → aprobada al instante; pasado el plazo → **solicita** y caja aprueba/rechaza (decisión del equipo; CU17 original decía que se deshabilitaba). Caja puede cancelar siempre; bloqueado si la cuenta está `PAGADA`.
- Preparados (RF10): una fila = una unidad; asignar = `UPDATE … WHERE estado = 'DISPONIBLE'` (si afecta 0 filas, otro mesero se la ganó); FK compuesta obliga a que el ítem sea del mismo producto.
- Interruptor de preparación anticipada **por área**: tabla `parametro` (`ANTICIPADA_ACTIVA_COCINA` y `ANTICIPADA_ACTIVA_BAR`; `db/02` aún trae el antiguo `ANTICIPADA_ACTIVA`, se cambia en las migraciones).
- Reglas que **valida el backend** (no caben en un CHECK): ventana de 3 min, cuenta no pagada al cancelar, modalidad permitida por producto, opción válida para el producto y sin combinaciones prohibidas, no agregar pedidos a una cuenta que no esté `ABIERTA` (pendiente o pagada → `CUENTA_NO_ABIERTA`), un combo no contiene combos, preparado asignado a pedido cancelado vuelve a disponible, un sector debe tener ≥1 mesa, pedidos cancelados fuera de la actividad del mesero (CU24).

**API y eventos** (`docs/02_api_y_eventos.md`)
- **Toda acción por REST**; el WebSocket **solo avisa** (el servidor emite eventos como consecuencia). Auth por token Bearer con rol; expira por inactividad. Errores `{codigo, mensaje}` con los textos del SRS. `POST /cuentas/{id}/pedidos` es una sola transacción (todo o nada). Stock inválido (CU22): el servidor **corrige en silencio** (negativo→0, decimal redondeado) y devuelve el valor guardado. Salas: `cocina`, `bar`, `caja`, `admin`, `meseros`, `mesero:{id}`. Al reconectar, el cliente re-consulta por REST.

## 6. Correcciones al SRS (para la tarea 2.1)

1. Ventana de cancelación: contar desde el **registro** del pedido (RF8), no desde la confirmación (CU17/CU18); y el mesero puede **solicitar** tras los 3 min.
2. CU12 solo describe habilitar/deshabilitar opciones: separar tablero de comandas (RF7) de panel de habilitación de cocina/bar (CU12).
3. CU13: unificar como «agregar productos a cuenta existente».
4. CU24 sin RF: crear RF15.
5. RF11 repite RF8 en dependencias: retirar.
6. RF13: estados disponible, ocupada, con pedidos pendientes, en proceso de pago.
7. CU18: el Mesero también es actor (solicita); conectarlo en el diagrama.
8. RF2 dice «reasignar un pedido»: debe decir «mesa».
9. CU22: el texto dice corregir valores inválidos; se decidió corregir en silencio.
10. RF4/CU13: una cuenta `PENDIENTE` (en proceso de pago) ya no admite pedidos nuevos; se puede desmarcar mientras no esté pagada.
11. CU10/CU11: un combo puede pedirse para llevar, usando los empaques de sus componentes, y cada componente puede pedirse anticipado (verificar redacción en el SRS).
12. RF6: según `db/02`, RF6 habla de que **cocina** habilita o deshabilita la preparación anticipada según su capacidad. Se decidió (Anderson, 21/10/2026) que **cada área (cocina y bar) gobierna la suya**: interruptor y productos por destino. Corregir el texto del SRS y contrastarlo con el PDF cuando esté disponible.

## 7. Cómo ejecutar el modelo de datos

```bash
psql -d mesa_al_dia -f db/01_seguridad_y_sectores.sql
psql -d mesa_al_dia -f db/02_menu_stock_personalizacion.sql
psql -d mesa_al_dia -f db/03_cuentas_y_pedidos.sql
psql -d mesa_al_dia -f db/04_comandas_cancelaciones_preparados.sql
```

## 8. Diseño de pantallas (tarea 2.5)

**Hecho: roles MESERO, COCINA y BAR** en `docs/ux/mesero/`, `docs/ux/cocina/` y `docs/ux/bar/` (mapa y decisiones en `00_mapa_de_pantallas.md` de cada carpeta). **Faltan** caja y admin, un chat por rol. Cada rol repite el proceso: proponer mapa de pantallas → aprobación → wireframes → capturas → commit.

**Convención de los wireframes** (reutilizar para los demás roles):
- HTML + CSS estático, sin React ni scripts; se abren con doble clic. Carpeta `docs/ux/<rol>/` con `index.html`, `vista_general.html` (iframes), `wireframe.css` (se puede copiar de `docs/ux/mesero/`) y un archivo por pantalla (`m01_nombre.html`, …; variantes `a`/`b`).
- Celular vertical de 390 px, solo escala de grises; **estados por patrón, no por color** (libre blanco, ocupada gris, pendiente rayada, pago oscuro). Botones de al menos 48 px y acciones principales abajo (pulgar).
- Dentro de cada pantalla: círculo oscuro numerado = remite a la nota «Por qué está así» al pie; borde punteado con etiqueta = aparece solo en ese caso; **SUPUESTO / POR CONFIRMAR** = lo que no está en la API o el SRS. Los botones enlazan a la pantalla siguiente.
- Probar con Chromium headless a 390 px (Playwright está en `/opt/pw-browsers`) y revisar desbordes horizontales y enlaces rotos antes del commit.

**Decisiones de UX del mesero que afectan al sistema:**
- Cuenta `PENDIENTE` bloquea pedidos nuevos (`CUENTA_NO_ABIERTA`, ya anotado en `docs/02`) y se puede reabrir. Combos: «Llevar» (modalidad del combo, heredada) y «Anticipada» **por componente** (`componentes_anticipados`, anotado en `docs/02`). `GET /cuentas/{id}` devuelve `registrado_en` por pedido y `hora_servidor`. Reasignación (CU7) elegida solo por el servidor. Etiqueta de cuenta numérica. Espera de 30 s para CU15 como **constante única** del frontend.
- **No hay historial de avisos** (solo avisos emergentes); los avisos perdidos en una desconexión no se reconstruyen, al reconectar se consulta el estado por REST. El estado real siempre se ve en las pantallas de mesas, cuenta y menú.
- Pestañas del mesero: Mesas · Preparados (solo consulta; se asigna dentro del pedido) · Mi día (pedidos por mesa, sin cancelados).

Combo «Llevar» ⇒ no admite componentes anticipados (cada ítem guarda una sola modalidad; decidido). **Pendiente por confirmar:** duración de los avisos emergentes (supuesto ~8 s).

### Rol COCINA (hecho el 21/10/2026, `docs/ux/cocina/`)

**Convención para roles de PC** (caja y admin probablemente también): marco fluido con tope en 1366 px (mínimo 1100), `wireframe.css` (base compartida, copia de la del mesero) más `escritorio.css` (lo propio de PC: barra superior, pestañas, kanban, tablas, interruptores, panel lateral, ventanas y la sección de miniaturas); mismas notas «Por qué está así». Una pantalla de «otros dispositivos» (C8) muestra tableta (1024 px) y celular (390 px). Probar con Playwright a 1366 y 1920 px; para la vista general con iframes usar una ventana alta, porque la captura de página completa no pinta los iframes fuera de pantalla.

**Decisiones de UX de cocina que afectan al sistema:**
- Tablero kanban de **tres columnas** (Enviadas · Recibidas · En preparación); al marcar `LISTA` la comanda sale al filtro «Listas de hoy». Las anticipadas van arriba de cada columna. Pestañas: Comandas · Disponibilidad · Habilitación (Opciones | Preparación anticipada) · Preparados.
- Cocina ve el detalle completo de la comanda (modalidad, opciones, observación, componentes quitados, extras, mesero). Los ítems con `preparado_id` van en un bloque aparte «Ya preparado · no cocinar».
- **Interruptor de la anticipada en C5b**; la barra superior solo informa y apagarlo pide confirmación. Cocina solo ve y edita lo de destino `COCINA`.
- Cancelaciones: franja fija «Cancelaciones por acusar» sobre el tablero y ventana de «Acusar recibo»; «Más tarde» no pierde el aviso. Es el único aviso emergente que no se oculta solo.
- CU15: cocina escribe cuántos ítems ve (no se le muestra el total enviado); si no coincide, el servidor responde `coincide: false`, cocina ve un aviso y el mesero recibe la diferencia. La comanda queda confirmada igual (la diferencia es una alarma, no un bloqueo) y cocina puede **corregir el recuento** mientras siga en `RECIBIDA`: el servidor recalcula `coincide` y emite otra vez `comanda.recibida`, que sustituye el aviso anterior del mesero; después de `EN_PREPARACION`, error `COMANDA_NO_CONFIRMABLE`.
- Alertas de demora por temporizador desde `enviada_en` (encabezado oscuro; umbral configurable). **Rechazar comandas queda fuera de alcance** (exige estado nuevo, stock y totales).

**Cambios a `docs/02` (aplicados el 21/10/2026):** `GET /parametros` para todos los roles (estado inicial de la anticipada; el mesero también lo usa), `GET /comandas` con `fecha`, `acuse=pendiente`, varios estados, `hora_servidor` y detalle completo (`es_preparado`, mesero, `enviada_en`, `total_items`), filtro `destino=` en productos, opciones (con `usada_en`) y preparados, error `DESTINO_NO_PERMITIDO` (403) si cocina o bar tocan productos del otro destino, `PATCH /productos/{id}/anticipada` para COCINA (escribe `producto.permite_anticipada`, que ya existía; el EDT 9.3 dice que cocina habilita «la función y los productos»), parámetro `UMBRAL_DEMORA_MINUTOS`, `coincide` en la respuesta de la confirmación y `estado_anterior` en `pedido.cancelado`. En CU15 un «ítem» es una línea tal como la ve cocina (un combo cuenta una vez; los ya preparados cuentan).

**Pendientes de cocina:** confirmar con el equipo la excepción de inactividad (con el WebSocket conectado, el token de COCINA y BAR se renueva; ya está escrita en `docs/02` como propuesta); qué ve cocina de una comanda formada solo por ítems ya preparados; dar de baja un preparado echado a perder; cortes de la adaptación (supuesto: PC ≥ 1280 px, tableta 768–1279, celular < 768).

**SRS:** el texto de RF y CU («Entrega 1B Parte 2» completa) sigue sin estar en el repo; el archivo recibido en el chat de cocina era la plantilla en blanco. Las reglas de cocina se tomaron de `docs/02`, `db/04` y las fichas del EDT (Entrega 2A).

### Rol BAR (hecho el 21/10/2026, `docs/ux/bar/`; pendiente de aprobación)

Reutiliza las pantallas de Cocina con `destino = BAR`; el mapa (`docs/ux/bar/00_mapa_de_pantallas.md`) solo recoge lo distinto. 11 wireframes B0–B8 (B1a/b, B5a/b), probados a 1366 y 1920 px, con las mismas convenciones de PC.

**Decisiones de Bar que afectan al sistema** (aplicadas en `docs/02`):
- **Bar sí tiene preparación anticipada**, gobernada **por área**: interruptor por destino (`PATCH /parametros/anticipada` con `{destino, activa}`), `PATCH /productos/{id}/anticipada` para COCINA y BAR sobre sus productos, y regla del servidor: un ítem va `ANTICIPADA` solo si el producto lo permite **y** el interruptor de su área está activo (en combos, por componente). La pantalla del mesero no cambia; su opción «Anticipada» depende del área del producto.
- **Umbral de demora por área** (`UMBRAL_DEMORA_COCINA_MINUTOS` y `UMBRAL_DEMORA_BAR_MINUTOS`).
- **Permisos por destino también en comandas:** `confirmacion`, `PATCH`, `acuse-cancelacion` y `GET` con otro `destino` dan `DESTINO_NO_PERMITIDO`.
- **Eventos por área:** `anticipada.estado` (con `destino`), `producto/opcion.disponibilidad` y `preparado.nuevo/asignado` llegan también a la sala del área; `pedido.cancelado` solo a las áreas con comandas del pedido; `usada_en` trae el destino de cada producto.
- **Opciones compartidas:** etiqueta «También en Cocina» y confirmación al apagarlas (el catálogo es único).
- Bar mantiene el flujo de tres pasos, tarjetas compactas y «Ya preparado · no preparar».

**Pendientes de bar:** aprobación de Anderson de los wireframes (ya aprobó «No hay productos ya preparados» en lugar del literal «platos», y que C5a de Cocina muestre «También en Bar», hecho el 21/10/2026); revisar m05b del mesero para el caso de un componente removible no disponible (el combo se ofrece y el componente solo puede pedirse quitado); texto de RF6 del SRS sin contrastar con el PDF (ver la corrección 12 de la sección 6). Resueltos el 21/10/2026: umbrales de demora (20 min cocina, 7 min bar, supuestos) y combos (su disponibilidad se deriva de sus componentes; solo ADMIN los bloquea; el destino de una opción de combo es el de sus componentes).
