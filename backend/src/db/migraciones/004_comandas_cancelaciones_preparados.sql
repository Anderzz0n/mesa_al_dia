-- Migración 004: Comandas, cancelaciones, preparados y vistas derivadas
-- Cubre: RF6 (cola prioritaria), RF7 (confirmación), RF8 (cancelaciones), RF10 (preparados), RF13 (estados de mesa)

DO $$ BEGIN
    CREATE TYPE estado_comanda AS ENUM ('ENVIADA', 'RECIBIDA', 'EN_PREPARACION', 'LISTA', 'CANCELADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_cancelacion AS ENUM ('SOLICITADA', 'APROBADA', 'RECHAZADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE origen_preparado AS ENUM ('REGISTRO_DIRECTO', 'CANCELACION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_preparado AS ENUM ('DISPONIBLE', 'ASIGNADO', 'DESCARTADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

INSERT INTO parametro (clave, valor, descripcion) VALUES
    ('VENTANA_CANCELACION_MINUTOS', '3', 'Minutos desde el registro para cancelar directamente sin aprobación')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS comanda (
    id                   INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id            INTEGER             NOT NULL REFERENCES pedido(id),
    destino              destino_preparacion NOT NULL,
    es_anticipada        BOOLEAN             NOT NULL DEFAULT FALSE,
    estado               estado_comanda      NOT NULL DEFAULT 'ENVIADA',
    enviada_en           TIMESTAMPTZ         NOT NULL DEFAULT now(),
    confirmada_en        TIMESTAMPTZ,
    confirmada_por       INTEGER             REFERENCES usuario(id),
    items_confirmados    SMALLINT            CHECK (items_confirmados >= 0),
    lista_en             TIMESTAMPTZ,
    cancelacion_acuse_en TIMESTAMPTZ,
    UNIQUE (pedido_id, destino, es_anticipada),
    UNIQUE (id, pedido_id),
    CHECK (estado IN ('ENVIADA', 'CANCELADA') OR confirmada_en IS NOT NULL),
    CHECK (estado <> 'LISTA' OR lista_en IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_comanda_cola ON comanda (destino, estado);

DO $$ BEGIN
    ALTER TABLE item_pedido ADD COLUMN comanda_id INTEGER;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE item_pedido
        ADD FOREIGN KEY (comanda_id, pedido_id) REFERENCES comanda (id, pedido_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS ix_item_pedido_comanda ON item_pedido (comanda_id);

CREATE TABLE IF NOT EXISTS cancelacion (
    id              INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id       INTEGER             NOT NULL REFERENCES pedido(id),
    motivo          VARCHAR(200)        NOT NULL CHECK (length(btrim(motivo)) > 0),
    solicitada_por  INTEGER             NOT NULL REFERENCES usuario(id),
    solicitada_en   TIMESTAMPTZ         NOT NULL DEFAULT now(),
    estado          estado_cancelacion  NOT NULL DEFAULT 'SOLICITADA',
    resuelta_por    INTEGER             REFERENCES usuario(id),
    resuelta_en     TIMESTAMPTZ,
    CHECK ((estado = 'SOLICITADA') = (resuelta_en IS NULL AND resuelta_por IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cancelacion_activa
    ON cancelacion (pedido_id) WHERE estado <> 'RECHAZADA';

DO $$ BEGIN
    ALTER TABLE item_pedido ADD UNIQUE (id, producto_id);
EXCEPTION
    WHEN duplicate_table THEN null;
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS producto_preparado (
    id                INTEGER           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id       INTEGER           NOT NULL REFERENCES producto(id),
    origen            origen_preparado  NOT NULL DEFAULT 'REGISTRO_DIRECTO',
    cancelacion_id    INTEGER           REFERENCES cancelacion(id),
    registrado_por    INTEGER           NOT NULL REFERENCES usuario(id),
    registrado_en     TIMESTAMPTZ       NOT NULL DEFAULT now(),
    estado            estado_preparado  NOT NULL DEFAULT 'DISPONIBLE',
    item_asignado_id  INTEGER,
    asignado_en       TIMESTAMPTZ,
    FOREIGN KEY (item_asignado_id, producto_id) REFERENCES item_pedido (id, producto_id),
    CHECK ((estado = 'ASIGNADO') = (item_asignado_id IS NOT NULL)),
    CHECK ((estado = 'ASIGNADO') = (asignado_en IS NOT NULL)),
    CHECK ((origen = 'CANCELACION') = (cancelacion_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ix_preparado_disponible
    ON producto_preparado (producto_id) WHERE estado = 'DISPONIBLE';

CREATE OR REPLACE VIEW v_total_cuenta AS
SELECT c.id AS cuenta_id,
       COALESCE(SUM(i.cantidad * (i.precio_unitario + COALESCE(o.extra, 0))), 0) AS total
FROM cuenta c
LEFT JOIN pedido p       ON p.cuenta_id = c.id
                        AND NOT EXISTS (SELECT 1 FROM cancelacion x
                                        WHERE x.pedido_id = p.id AND x.estado = 'APROBADA')
LEFT JOIN item_pedido i  ON i.pedido_id = p.id
LEFT JOIN LATERAL (SELECT SUM(precio_extra) AS extra
                   FROM item_opcion WHERE item_id = i.id) o ON TRUE
GROUP BY c.id;

CREATE OR REPLACE VIEW v_estado_mesa AS
SELECT m.id AS mesa_id,
       m.numero,
       CASE
         WHEN EXISTS (SELECT 1 FROM cuenta c
                      JOIN pedido p  ON p.cuenta_id = c.id
                      JOIN comanda k ON k.pedido_id = p.id
                      WHERE c.mesa_id = m.id AND c.estado <> 'PAGADA'
                        AND k.estado NOT IN ('LISTA', 'CANCELADA'))      THEN 'CON_PEDIDOS_PENDIENTES'
         WHEN EXISTS (SELECT 1 FROM cuenta c
                      WHERE c.mesa_id = m.id AND c.estado = 'ABIERTA')   THEN 'OCUPADA'
         WHEN EXISTS (SELECT 1 FROM cuenta c
                      WHERE c.mesa_id = m.id AND c.estado = 'PENDIENTE') THEN 'EN_PROCESO_DE_PAGO'
         ELSE 'DISPONIBLE'
       END AS estado
FROM mesa m;
