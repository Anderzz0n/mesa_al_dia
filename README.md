# Mesa al día

Sistema de gestión de comandas y control operativo gastronómico (cliente-servidor, soporte móvil y comunicación en tiempo real) para coordinar meseros, cocina, bar y caja.

Proyecto de Ingeniería de Software I (22969 – C2) · Grupo N° 02.

## Estado

Fase de diseño: modelo de datos completo (tarea 2.3 del EDT). Siguiente: diseño de la API y los eventos (2.4).

## Estructura

```
db/    Modelo de datos en PostgreSQL 16 (scripts numerados, se ejecutan en orden)
```

## Modelo de datos

| Archivo | Contenido | Requerimientos |
|---|---|---|
| `db/01_seguridad_y_sectores.sql` | roles, usuarios, mesas, sectores, asignaciones, reasignación de mesas | RF1, RF2 |
| `db/02_menu_stock_personalizacion.sql` | productos, combos, stock, empaques, opciones de personalización | RF3, RF5, RF6, RF9 |
| `db/03_cuentas_y_pedidos.sql` | cuentas, pedidos, ítems, opciones elegidas, total de cuenta | RF4, RF12, CU9–CU14, CU25 |
| `db/04_comandas_cancelaciones_preparados_pagos.sql` | comandas y confirmación de recepción, cancelaciones, productos preparados, pagos, estado de mesa | RF6, RF7, RF8, RF10, RF13, RF14, CU15–CU21 |

Ejecutar en orden sobre una base vacía:

```bash
psql -d mesa_al_dia -f db/01_seguridad_y_sectores.sql
psql -d mesa_al_dia -f db/02_menu_stock_personalizacion.sql
psql -d mesa_al_dia -f db/03_cuentas_y_pedidos.sql
psql -d mesa_al_dia -f db/04_comandas_cancelaciones_preparados_pagos.sql
```
