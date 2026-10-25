-- Migración 002: Menú, stock, combos y personalizaciones
-- Cubre: RF3 (personalización), RF5 (empaques), RF6 (anticipada por área), RF9 (stock)

DO $$ BEGIN
    CREATE TYPE destino_preparacion AS ENUM ('COCINA', 'BAR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_opcion AS ENUM ('EXCLUSION', 'SUSTITUCION', 'ADICIONAL', 'PREFERENCIA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS parametro (
    clave        VARCHAR(40)  PRIMARY KEY,
    valor        VARCHAR(100) NOT NULL,
    descripcion  VARCHAR(200)
);

-- Sembrado de parámetros operativos del sistema
INSERT INTO parametro (clave, valor, descripcion) VALUES
    ('ANTICIPADA_ACTIVA_COCINA', 'true', 'Interruptor de preparación anticipada de Cocina (RF6)'),
    ('ANTICIPADA_ACTIVA_BAR', 'true', 'Interruptor de preparación anticipada de Bar (RF6)'),
    ('UMBRAL_DEMORA_COCINA_MINUTOS', '20', 'Minutos para alertar demora en comanda de cocina'),
    ('UMBRAL_DEMORA_BAR_MINUTOS', '7', 'Minutos para alertar demora en comanda de bar')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS categoria (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(40) NOT NULL UNIQUE,
    orden   SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS producto (
    id                  INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(80)         NOT NULL UNIQUE,
    descripcion         VARCHAR(200),
    categoria_id        SMALLINT            NOT NULL REFERENCES categoria(id),
    precio              NUMERIC(10,2)       NOT NULL CHECK (precio >= 0),
    es_combo            BOOLEAN             NOT NULL DEFAULT FALSE,
    destino             destino_preparacion,
    permite_llevar      BOOLEAN             NOT NULL DEFAULT FALSE,
    permite_anticipada  BOOLEAN             NOT NULL DEFAULT FALSE,
    disponible          BOOLEAN             NOT NULL DEFAULT TRUE,
    stock_cantidad      INTEGER             CHECK (stock_cantidad >= 0),
    CONSTRAINT ck_stock_cero_no_disponible
        CHECK (stock_cantidad IS NULL OR stock_cantidad > 0 OR disponible = FALSE),
    CONSTRAINT ck_destino_segun_combo
        CHECK ((es_combo AND destino IS NULL) OR (NOT es_combo AND destino IS NOT NULL)),
    CONSTRAINT ck_combo_sin_stock_propio
        CHECK (NOT es_combo OR stock_cantidad IS NULL)
);

CREATE TABLE IF NOT EXISTS combo_componente (
    combo_id     INTEGER  NOT NULL REFERENCES producto(id),
    producto_id  INTEGER  NOT NULL REFERENCES producto(id),
    cantidad     SMALLINT NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
    removible    BOOLEAN  NOT NULL DEFAULT FALSE,
    PRIMARY KEY (combo_id, producto_id),
    CHECK (combo_id <> producto_id)
);

CREATE TABLE IF NOT EXISTS empaque (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS producto_empaque (
    producto_id  INTEGER  NOT NULL REFERENCES producto(id),
    empaque_id   SMALLINT NOT NULL REFERENCES empaque(id),
    cantidad     SMALLINT NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
    PRIMARY KEY (producto_id, empaque_id)
);

CREATE TABLE IF NOT EXISTS opcion (
    id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre        VARCHAR(60)   NOT NULL UNIQUE,
    tipo          tipo_opcion   NOT NULL,
    precio_extra  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_extra >= 0),
    disponible    BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS producto_opcion (
    producto_id  INTEGER NOT NULL REFERENCES producto(id),
    opcion_id    INTEGER NOT NULL REFERENCES opcion(id),
    PRIMARY KEY (producto_id, opcion_id)
);

CREATE TABLE IF NOT EXISTS restriccion_opcion (
    opcion_a_id  INTEGER NOT NULL REFERENCES opcion(id),
    opcion_b_id  INTEGER NOT NULL REFERENCES opcion(id),
    PRIMARY KEY (opcion_a_id, opcion_b_id),
    CHECK (opcion_a_id < opcion_b_id)
);
