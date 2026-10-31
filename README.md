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

## Requisitos previos

Para ejecutar el proyecto en tu computadora necesitas:
1. **Node.js**: Versión 20 o 22 LTS ([descargar en nodejs.org](https://nodejs.org/)).
2. **Git**: Para clonar el repositorio ([descargar en git-scm.com](https://git-scm.com/)).
3. *(Opcional)* **PostgreSQL** 14+: Si deseas persistencia en base de datos relacional. Si no lo tienes instalado, el sistema arranca **automáticamente en modo memoria** con datos semilla de prueba.

---

## Cómo ejecutar el proyecto (Paso a paso)

### 1. Clonar el repositorio
Abre tu terminal (PowerShell, CMD, Git Bash o Terminal de macOS/Linux) y escribe:
```bash
git clone https://github.com/Anderzz0n/mesa_al_dia.git
cd mesa_al_dia
```

### 2. Instalar dependencias
Instala todas las dependencias del proyecto (backend y frontend) ejecutando un solo comando en la raíz:
```bash
npm install
```

### 3. Configurar variables de entorno (Opcional)
Puedes copiar el archivo de ejemplo para configurar tus variables:
```bash
# En Windows (PowerShell):
Copy-Item .env.example .env

# En Linux / macOS / Git Bash:
cp .env.example .env
```
> **Nota:** Si dejas `DATABASE_URL` vacío o no creas el archivo `.env`, el servidor funcionará sin problemas utilizando el **modo en memoria**.

### 4. Iniciar la aplicación
Ejecuta el servidor en modo desarrollo:
```bash
npm run dev
```

El servidor levantará la API de Express y el frontend de React en el mismo puerto:
👉 **Abre en tu navegador:** `http://localhost:3000`

---

## Usuarios de prueba preconfigurados

Todos los usuarios tienen la contraseña: `123456`

| Rol | Usuario | Contraseña | Pantallas y funcionalidades |
|---|---|---|---|
| **Administrador** | `admin` | `123456` | Gestión de menú, parámetros operativos, supervisión y sectores |
| **Mesero** | `miguel` | `123456` | Pedidos móviles, apertura de cuentas, personalización y comandas |
| **Caja** | `simon` | `123456` | Cobro, división de cuentas, cancelaciones y balance diario |
| **Cocina** | `cocina` | `123456` | Tablero Kanban de cocina, tiempos de preparación y cancelaciones |
| **Bar** | `bar` | `123456` | Tablero Kanban de bebidas |

---

## Comandos adicionales

* **Ejecutar pruebas automatizadas:**
  ```bash
  npm test
  ```
* **Verificar sintaxis y calidad de código:**
  ```bash
  npm run lint
  ```
* **Compilar y ejecutar en modo producción:**
  ```bash
  npm run build
  npm start
  ```
* **Acceso desde celulares en la misma red Wi-Fi:**
  ```bash
  node server.js --host 0.0.0.0
  ```

---

## Posibles problemas y soluciones

1. **Error: Puerto 3000 ya en uso (`EADDRINUSE`)**
   * *Causa:* Otra aplicación está usando el puerto 3000.
   * *Solución:* Inicia el servidor en otro puerto pasando el parámetro `-p`:
     ```bash
     node server.js -p 3001
     ```
     Y abre `http://localhost:3001`.

2. **Error en PowerShell: "La ejecución de scripts está deshabilitada en este sistema"**
   * *Causa:* Política de seguridad por defecto de Windows PowerShell.
   * *Solución:* Ejecuta PowerShell como administrador y corre:
     ```powershell
     Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
     ```
     O bien utiliza la terminal de **Git Bash**.

3. **`node` o `npm` no se reconoce como un comando**
   * *Causa:* Node.js no está instalado o no se añadió a la variable de entorno PATH.
   * *Solución:* Descarga e instala Node.js desde [nodejs.org](https://nodejs.org/) asegurándote de marcar la opción "Add to PATH", y luego reinicia la terminal.

4. **Error de conexión a PostgreSQL (`ECONNREFUSED 5432`)**
   * *Causa:* Se especificó una variable `DATABASE_URL` pero el servicio local de PostgreSQL no está encendido.
   * *Solución:* Si no tienes PostgreSQL o no deseas usarlo por ahora, borra o comenta la línea `DATABASE_URL` en tu archivo `.env`. El sistema continuará en modo memoria de forma transparente.

