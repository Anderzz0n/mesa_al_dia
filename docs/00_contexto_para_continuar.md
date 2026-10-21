# Mesa al día · Contexto para continuar el desarrollo

Documento de traspaso. Resume todo lo decidido hasta el 20/10/2026 para retomar el
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
| Esqueleto del backend (3.2): Express 5, `pg`, `/api/v1/salud`, errores `{codigo, mensaje}`, Socket.IO con salas (asignación **provisional** sin login) y 7 pruebas | `backend/` |

**Stack decidido (2.2):** JavaScript con Node.js 22, módulos ESM, Express 5 (REST), Socket.IO (eventos), `pg` (PostgreSQL 16), pruebas con `node:test`. Frontend: React 19 + Vite, una sola app con rutas por rol (`react-router-dom`), cliente `socket.io-client`.

**Pendiente (en orden sugerido):**
1. Migraciones a partir de `db/` (3.4) y CI (3.6; debe correr las pruebas de `backend/` y el build de `frontend/`).
2. Diseño de pantallas (2.5): **mesero hecho**; faltan cocina, bar, caja y admin, **un chat por rol**, siguiendo la convención de la sección 8, antes de construir el frontend real.
3. En el Sprint 2 (RF1): login con token Bearer y reemplazar `salasPorDefecto` en `backend/src/tiempo_real.js` por salas según el rol (hoy cualquiera puede pedir cualquier sala) y hacer que el inicio del frontend lleve a cada usuario a su rol.
4. Pendientes menores: enlace de Jira, logo del producto, formalizar SRS v2 (tarea 2.1) con las correcciones de la sección 6.

## 5. Decisiones de diseño tomadas

**Datos**
- Una mesa pertenece a **un solo sector**. Un sector tiene un responsable vigente a la vez; un mesero puede tener varios sectores. Cambiar la asignación **cierra** la fila anterior (`vigente_hasta`) y abre otra. La reasignación temporal (CU7) es **por mesa** (RF2 dice «pedido» por error).
- Jerarquía: `mesa → cuenta → pedido → item_pedido → item_opcion`. **Cuenta** = lo que se paga; **pedido** = cada envío de productos a cocina/bar; agregar productos después crea un pedido nuevo.
- Estados de cuenta: `ABIERTA`, `PENDIENTE` (ya consumió y falta pagar; en proceso de pago), `PAGADA`. **Solo `ABIERTA` admite pedidos nuevos.** El **pago es solo una casilla**: el proyecto no gestiona métodos de pago ni la caja física. Cuenta pagada trae `cerrada_en` y `cerrada_por`. No hay tabla de pagos.
- El estado de la mesa **no se guarda**: lo calcula la vista `v_estado_mesa` (con pedidos pendientes → ocupada → en proceso de pago → disponible). El total de la cuenta lo calcula `v_total_cuenta` (excluye pedidos con cancelación aprobada).
- `precio_unitario` y `precio_extra` se copian al ítem (foto del precio). `pedido.mesero_id` es el responsable en ese momento.
- Producto: `stock_cantidad` NULL = no se cuenta; `CHECK` impide stock 0 con `disponible = true`; sin negativos ni decimales. `destino` COCINA/BAR; los **combos** (`es_combo`) no tienen destino, sus componentes sí (`combo_componente`, con `removible`). En el pedido un combo es un ítem padre y sus componentes ítems hijos (`item_padre_id`, precio 0 los incluidos).
- Opciones de personalización: catálogo **único** enlazado a productos (`producto_opcion`) para poder deshabilitar una opción para todos (RF3 pide tiempo real); combinaciones prohibidas en `restriccion_opcion` (par con `a < b`).
- Comandas: una por (pedido, destino, es_anticipada); la anticipada va aparte en cola prioritaria. `RECIBIDA` = confirmación de recepción de RF7 (`items_confirmados`). `item_pedido.comanda_id` (FK compuesta con `pedido_id`).
- Cancelación a nivel de **pedido completo**, motivo obligatorio. Ventana de **3 min desde el registro del pedido** (parámetro `VENTANA_CANCELACION_MINUTOS`). Mesero dentro de plazo → aprobada al instante; pasado el plazo → **solicita** y caja aprueba/rechaza (decisión del equipo; CU17 original decía que se deshabilitaba). Caja puede cancelar siempre; bloqueado si la cuenta está `PAGADA`.
- Preparados (RF10): una fila = una unidad; asignar = `UPDATE … WHERE estado = 'DISPONIBLE'` (si afecta 0 filas, otro mesero se la ganó); FK compuesta obliga a que el ítem sea del mismo producto.
- Interruptor global de preparación anticipada: tabla `parametro` (`ANTICIPADA_ACTIVA`).
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
10. RF4/CU13: una cuenta `PENDIENTE` (en proceso de pago) ya no admite pedidos nuevos.
11. CU10/CU11: un combo puede pedirse para llevar, usando los empaques de sus componentes (verificar redacción en el SRS).

## 7. Cómo ejecutar el modelo de datos

```bash
psql -d mesa_al_dia -f db/01_seguridad_y_sectores.sql
psql -d mesa_al_dia -f db/02_menu_stock_personalizacion.sql
psql -d mesa_al_dia -f db/03_cuentas_y_pedidos.sql
psql -d mesa_al_dia -f db/04_comandas_cancelaciones_preparados.sql
```

## 8. Diseño de pantallas (tarea 2.5)

**Hecho: rol MESERO** en `docs/ux/mesero/` (mapa y decisiones en `00_mapa_de_pantallas.md`). **Faltan** cocina, bar, caja y admin, un chat por rol. Cada rol repite el proceso: proponer mapa de pantallas → aprobación → wireframes → capturas → commit.

**Convención de los wireframes** (reutilizar para los demás roles):
- HTML + CSS estático, sin React ni scripts; se abren con doble clic. Carpeta `docs/ux/<rol>/` con `index.html`, `vista_general.html` (iframes), `wireframe.css` (se puede copiar de `docs/ux/mesero/`) y un archivo por pantalla (`m01_nombre.html`, …; variantes `a`/`b`).
- Celular vertical de 390 px, solo escala de grises; **estados por patrón, no por color** (libre blanco, ocupada gris, pendiente rayada, pago oscuro). Botones de al menos 48 px y acciones principales abajo (pulgar).
- Dentro de cada pantalla: círculo oscuro numerado = remite a la nota «Por qué está así» al pie; borde punteado con etiqueta = aparece solo en ese caso; **SUPUESTO / POR CONFIRMAR** = lo que no está en la API o el SRS. Los botones enlazan a la pantalla siguiente.
- Probar con Chromium headless a 390 px (Playwright está en `/opt/pw-browsers`) y revisar desbordes horizontales y enlaces rotos antes del commit.

**Decisiones de UX del mesero que afectan al sistema:**
- Cuenta `PENDIENTE` bloquea pedidos nuevos (`CUENTA_NO_ABIERTA`, ya anotado en `docs/02`). Combos pueden pedirse «Llevar» (la modalidad va en el ítem padre; backend por definir). Reasignación (CU7) elegida solo por el servidor. Etiqueta de cuenta numérica. Espera de 30 s para CU15 como **constante única** del frontend.
- **No hay historial de avisos** (solo avisos emergentes); los avisos perdidos en una desconexión no se reconstruyen, al reconectar se consulta el estado por REST. El estado real siempre se ve en las pantallas de mesas, cuenta y menú.
- Pestañas del mesero: Mesas · Preparados (solo consulta; se asigna dentro del pedido) · Mi día (pedidos por mesa, sin cancelados).

**Pendientes por confirmar con el SRS o el backend:** hora de registro del pedido en `GET /cuentas/{id}` (para «Cancelar» vs «Solicitar»); si una cuenta `PENDIENTE` marcada por error puede volver a `ABIERTA`; si «Anticipada» aplica a combos; duración de los avisos emergentes (supuesto ~8 s).
