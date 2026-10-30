# Mesa al día

Sistema de gestión de comandas y control operativo gastronómico (cliente-servidor, soporte móvil y comunicación en tiempo real) para coordinar meseros, cocina, bar y caja.

Proyecto de Ingeniería de Software I (22969 – C2) · Grupo N° 02.

## Estado

- **Sprint 1 (Fundación y Diseño):** 100% Completado. Modelo de datos, arquitectura y wireframes para todos los roles.
- **Sprint 2 (Seguridad, Sectores, Usuarios y Tiempo Real):** 100% Completado. Auth JWT, roles, bajas lógicas, asignación de mesas y supervisión.
- **Sprint 3 (Menú, Personalización, Stock y Cuentas):** 100% Completado. Catálogo, combos, stock, anticipada y apertura de cuentas.
- **Sprint 4 (Núcleo del Pedido Móvil):** 100% Completado. Flujo móvil M2–M6, personalización de productos y combos, modalidades llevar y anticipada, y asignación de preparados (M7, M11).
- **Sprint 5 (Confirmación, Caja y Cancelaciones):** 100% Completado. Tableros Kanban de Cocina y Bar con recuento CU15 y cancelaciones urgentes RF8; gestión y descarte de preparados (Hueco 3); pantalla operativa de Caja K0–K6 con liquidación y división equitativa, resolución de cancelaciones con preparados y resumen del día.
- **Suite de Pruebas:** 73 de 73 pruebas automatizadas superadas (`node --test`), frontend compilado con Vite y linter sin errores.

## Estructura

```
backend/  API REST (Express) y eventos en tiempo real (Socket.IO), Node.js 22
frontend/ Aplicación web (React + Vite), una sola app con pantallas por rol
db/       Modelo de datos en PostgreSQL 16 (scripts numerados, se ejecutan en orden)
docs/     Documentos de diseño
```

Para retomar el trabajo en un chat nuevo: [`docs/00_contexto_para_continuar.md`](docs/00_contexto_para_continuar.md).

Diseño de la API y los eventos: [`docs/02_api_y_eventos.md`](docs/02_api_y_eventos.md).

## Modelo de datos

| Archivo | Contenido | Requerimientos |
|---|---|---|
| `db/01_seguridad_y_sectores.sql` | roles, usuarios, mesas, sectores, asignaciones, reasignación de mesas | RF1, RF2 |
| `db/02_menu_stock_personalizacion.sql` | productos, combos, stock, empaques, opciones de personalización | RF3, RF5, RF6, RF9 |
| `db/03_cuentas_y_pedidos.sql` | cuentas (el pago es solo la casilla de cuenta pagada), pedidos, ítems, opciones elegidas, total de cuenta | RF4, RF12, RF14, CU9–CU14, CU16, CU25 |
| `db/04_comandas_cancelaciones_preparados.sql` | comandas y confirmación de recepción, cancelaciones, productos preparados, estado de mesa | RF6, RF7, RF8, RF10, RF13, CU15, CU17–CU21 |

Ejecutar en orden sobre una base vacía:

```bash
psql -d mesa_al_dia -f db/01_seguridad_y_sectores.sql
psql -d mesa_al_dia -f db/02_menu_stock_personalizacion.sql
psql -d mesa_al_dia -f db/03_cuentas_y_pedidos.sql
psql -d mesa_al_dia -f db/04_comandas_cancelaciones_preparados.sql
```

## Backend

```bash
cd backend
npm install
cp .env.example .env   # ajusta PUERTO y DATABASE_URL
npm run dev            # servidor con recarga automática
npm test               # pruebas (no necesitan PostgreSQL)
```

## Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (en el celular: npm run dev -- --host)
```

Funciona solo, sin backend: el inicio mostrará «Sin conexión con el servidor». Con el backend corriendo en el puerto 3000, Vite reenvía `/api` y `/socket.io` hacia él (otra dirección con la variable `BACKEND_URL`).
