# Mesa al día

Sistema de gestión de comandas y control operativo gastronómico (cliente-servidor, soporte móvil y comunicación en tiempo real) para coordinar meseros, cocina, bar y caja.

Proyecto de Ingeniería de Software I (22969 – C2) · Grupo N° 02.

## Estado

Modelo de datos completo (2.3), diseño de API y eventos revisado (2.4) y esqueleto del backend en Node.js (3.2): API REST con Express, eventos en tiempo real con Socket.IO y acceso a PostgreSQL. Siguiente: migraciones (3.4), CI (3.6) y esqueleto del frontend (3.3).

## Estructura

```
backend/  API REST (Express) y eventos en tiempo real (Socket.IO), Node.js 22
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
