-- =====================================================================
-- Mesa al día · Modelo de datos · PARTE 1: usuarios, mesas y sectores
-- Cubre: RF1 (usuarios/roles), RF2 (sectores y asignación), base de RF13
-- Motor: PostgreSQL 16
-- Convención: tablas y columnas en español, en minúscula y singular.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) ROL: catálogo de perfiles del sistema.
--    Es una tabla pequeña y casi estática. Cada usuario apunta a un rol.
-- ---------------------------------------------------------------------
CREATE TABLE rol (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(20) NOT NULL UNIQUE   -- no puede haber dos roles iguales
);

INSERT INTO rol (nombre) VALUES
    ('ADMIN'),    -- crea usuarios, sectores y asignaciones
    ('MESERO'),   -- toma pedidos desde el celular
    ('COCINA'),   -- recibe comandas de cocina, maneja stock
    ('BAR'),      -- recibe comandas de bar, maneja stock
    ('CAJA');     -- liquida cuentas, autoriza cancelaciones tardías


-- ---------------------------------------------------------------------
-- 2) USUARIO (RF1 · CU1, CU2)
--    - nombre_usuario es único: de ahí sale el mensaje "Usuario ya registrado".
--    - NUNCA se guarda la contraseña, solo su hash (resultado irreversible).
--    - activo = false permite el mensaje "Su usuario no está activo" sin
--      borrar al usuario (así se conserva el historial de sus pedidos).
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
    id               INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_usuario   VARCHAR(40)  NOT NULL UNIQUE,
    nombre_completo  VARCHAR(100) NOT NULL,
    contrasena_hash  VARCHAR(255) NOT NULL,
    rol_id           SMALLINT     NOT NULL REFERENCES rol(id),
    activo           BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en        TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- 3) SECTOR (RF2 · CU4)
--    Un sector es un grupo de mesas con nombre único ("Terraza", "Salón").
-- ---------------------------------------------------------------------
CREATE TABLE sector (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(40) NOT NULL UNIQUE      -- "nombre repetido" se rechaza aquí
);


-- ---------------------------------------------------------------------
-- 4) MESA (RF2, RF13)
--    - sector_id puede ser NULL: una mesa recién creada aún no tiene sector.
--    - La regla "un sector debe tener mínimo una mesa" NO se puede expresar
--      aquí con una restricción simple; la valida el backend (tarea 5.2).
--    - El estado de la mesa (disponible, ocupada...) NO se guarda: se calcula
--      a partir de sus cuentas (tarea 7.6). Así nunca queda desincronizado.
-- ---------------------------------------------------------------------
CREATE TABLE mesa (
    id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero     SMALLINT NOT NULL UNIQUE CHECK (numero > 0),
    sector_id  SMALLINT REFERENCES sector(id)
);


-- ---------------------------------------------------------------------
-- 5) ASIGNACION_SECTOR (RF2 · CU5, CU6)
--    Quién atiende qué sector, y durante cuánto tiempo.
--    En vez de modificar la fila cuando cambia la asignación (CU6), se CIERRA
--    la anterior (vigente_hasta = ahora) y se ABRE una nueva. Así queda el
--    registro de los cambios durante la jornada.
-- ---------------------------------------------------------------------
CREATE TABLE asignacion_sector (
    id             INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sector_id      SMALLINT    NOT NULL REFERENCES sector(id),
    mesero_id      INTEGER     NOT NULL REFERENCES usuario(id),
    vigente_desde  TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente_hasta  TIMESTAMPTZ,                       -- NULL = asignación vigente
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

-- Un sector solo puede tener UNA asignación vigente a la vez ("un sector,
-- un responsable"). Un mesero SÍ puede tener varias (varios sectores).
CREATE UNIQUE INDEX uq_sector_una_vigente
    ON asignacion_sector (sector_id) WHERE vigente_hasta IS NULL;


-- ---------------------------------------------------------------------
-- 6) REASIGNACION_MESA (RF2 · CU7)
--    Otro mesero atiende una mesa de forma temporal, SIN tocar el sector.
--    Al buscar "¿quién es el responsable de esta mesa?" (tarea 5.6):
--      1) si hay reasignación vigente -> ese mesero
--      2) si no -> el mesero asignado al sector de la mesa
-- ---------------------------------------------------------------------
CREATE TABLE reasignacion_mesa (
    id             INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mesa_id        SMALLINT    NOT NULL REFERENCES mesa(id),
    mesero_id      INTEGER     NOT NULL REFERENCES usuario(id),
    vigente_desde  TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente_hasta  TIMESTAMPTZ,                       -- NULL = reasignación vigente
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

CREATE UNIQUE INDEX uq_mesa_una_reasignacion_vigente
    ON reasignacion_mesa (mesa_id) WHERE vigente_hasta IS NULL;
