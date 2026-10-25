-- Migración 001: Seguridad, usuarios, mesas y sectores
-- Cubre: RF1 (usuarios/roles), RF2 (sectores y asignación), base de RF13

CREATE TABLE IF NOT EXISTS rol (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(20) NOT NULL UNIQUE
);

INSERT INTO rol (nombre) VALUES
    ('ADMIN'),
    ('MESERO'),
    ('COCINA'),
    ('BAR'),
    ('CAJA')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS usuario (
    id               INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_usuario   VARCHAR(40)  NOT NULL UNIQUE,
    nombre_completo  VARCHAR(100) NOT NULL,
    contrasena_hash  VARCHAR(255) NOT NULL,
    rol_id           SMALLINT     NOT NULL REFERENCES rol(id),
    activo           BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sector (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS mesa (
    id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero     SMALLINT NOT NULL UNIQUE CHECK (numero > 0),
    sector_id  SMALLINT REFERENCES sector(id)
);

CREATE TABLE IF NOT EXISTS asignacion_sector (
    id             INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sector_id      SMALLINT    NOT NULL REFERENCES sector(id),
    mesero_id      INTEGER     NOT NULL REFERENCES usuario(id),
    vigente_desde  TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente_hasta  TIMESTAMPTZ,
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sector_una_vigente
    ON asignacion_sector (sector_id) WHERE vigente_hasta IS NULL;

CREATE TABLE IF NOT EXISTS reasignacion_mesa (
    id             INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mesa_id        SMALLINT    NOT NULL REFERENCES mesa(id),
    mesero_id      INTEGER     NOT NULL REFERENCES usuario(id),
    vigente_desde  TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente_hasta  TIMESTAMPTZ,
    motivo         VARCHAR(200),
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mesa_una_vigente
    ON reasignacion_mesa (mesa_id) WHERE vigente_hasta IS NULL;

CREATE OR REPLACE VIEW v_sector_vigente AS
SELECT s.id AS sector_id,
       s.nombre AS sector_nombre,
       a.mesero_id,
       u.nombre_completo AS mesero_nombre,
       a.vigente_desde
FROM sector s
LEFT JOIN asignacion_sector a ON a.sector_id = s.id AND a.vigente_hasta IS NULL
LEFT JOIN usuario u           ON u.id = a.mesero_id;
