-- Migración 003: Cuentas, pedidos e ítems
-- Cubre: RF4 (cuentas por mesa), RF12 (pedidos móviles), CU9, CU10, CU11, CU13, CU14, CU25

DO $$ BEGIN
    CREATE TYPE estado_cuenta AS ENUM ('ABIERTA', 'PENDIENTE', 'PAGADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE modalidad_atencion AS ENUM ('MESA', 'LLEVAR', 'ANTICIPADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS cuenta (
    id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mesa_id      SMALLINT      NOT NULL REFERENCES mesa(id),
    etiqueta     VARCHAR(40)   NOT NULL,
    estado       estado_cuenta NOT NULL DEFAULT 'ABIERTA',
    abierta_en   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    cerrada_en   TIMESTAMPTZ,
    cerrada_por  INTEGER       REFERENCES usuario(id),
    metodo_pago  VARCHAR(20)   CHECK (metodo_pago IS NULL OR metodo_pago IN ('EFECTIVO', 'TARJETA', 'OTRO')),
    propina      INTEGER       NOT NULL DEFAULT 0 CHECK (propina >= 0),
    CHECK ((estado = 'PAGADA') = (cerrada_en IS NOT NULL)),
    CHECK ((estado = 'PAGADA') = (cerrada_por IS NOT NULL)),
    CHECK ((estado = 'PAGADA') = (metodo_pago IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cuenta_etiqueta_viva
    ON cuenta (mesa_id, etiqueta) WHERE estado <> 'PAGADA';

CREATE INDEX IF NOT EXISTS ix_cuenta_mesa ON cuenta (mesa_id);

CREATE TABLE IF NOT EXISTS pedido (
    id         INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cuenta_id  INTEGER     NOT NULL REFERENCES cuenta(id),
    mesero_id  INTEGER     NOT NULL REFERENCES usuario(id),
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pedido_cuenta ON pedido (cuenta_id);
CREATE INDEX IF NOT EXISTS ix_pedido_mesero_fecha ON pedido (mesero_id, creado_en);

CREATE TABLE IF NOT EXISTS item_pedido (
    id               INTEGER            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id        INTEGER            NOT NULL REFERENCES pedido(id),
    producto_id      INTEGER            NOT NULL REFERENCES producto(id),
    cantidad         SMALLINT           NOT NULL CHECK (cantidad >= 1),
    precio_unitario  NUMERIC(10,2)      NOT NULL CHECK (precio_unitario >= 0),
    modalidad        modalidad_atencion NOT NULL DEFAULT 'MESA',
    observacion      VARCHAR(200),
    item_padre_id    INTEGER,
    UNIQUE (id, pedido_id),
    FOREIGN KEY (item_padre_id, pedido_id) REFERENCES item_pedido (id, pedido_id)
);

CREATE INDEX IF NOT EXISTS ix_item_pedido_pedido ON item_pedido (pedido_id);

CREATE TABLE IF NOT EXISTS item_opcion (
    item_id       INTEGER       NOT NULL REFERENCES item_pedido(id),
    opcion_id     INTEGER       NOT NULL REFERENCES opcion(id),
    precio_extra  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_extra >= 0),
    PRIMARY KEY (item_id, opcion_id)
);
