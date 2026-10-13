-- =====================================================================
-- Mesa al día · Modelo de datos · PARTE 4: comandas, cancelaciones,
--                                          productos preparados y pagos
-- Cubre: RF6 (cola prioritaria), RF7 (confirmación), RF8 (cancelación),
--        RF10 (preparados), RF13 (estado de mesa), RF14 (pago)
--        CU15, CU16, CU17, CU18, CU19, CU20, CU21
-- Requiere 01, 02 y 03.
-- ---------------------------------------------------------------------


CREATE TYPE estado_comanda      AS ENUM ('ENVIADA', 'RECIBIDA', 'EN_PREPARACION', 'LISTA', 'CANCELADA');
CREATE TYPE estado_cancelacion  AS ENUM ('SOLICITADA', 'APROBADA', 'RECHAZADA');
CREATE TYPE origen_preparado    AS ENUM ('REGISTRO_DIRECTO', 'CANCELACION');
CREATE TYPE estado_preparado    AS ENUM ('DISPONIBLE', 'ASIGNADO');
CREATE TYPE metodo_pago         AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');

INSERT INTO parametro (clave, valor, descripcion) VALUES
    ('VENTANA_CANCELACION_MINUTOS', '3',
     'Minutos desde el REGISTRO del pedido en que el mesero puede cancelar directamente (RF8)');


-- ---------------------------------------------------------------------
-- 1) COMANDA (RF7, RF6 · CU15)
--    Un pedido se divide en comandas: una por destino (COCINA/BAR) y, si
--    trae productos de preparación anticipada, otra aparte para esos (RF6:
--    "comanda diferenciada" en cola prioritaria). Por eso la clave única es
--    (pedido, destino, es_anticipada): como máximo 4 comandas por pedido.
--
--    Ciclo de vida:  ENVIADA -> RECIBIDA -> EN_PREPARACION -> LISTA
--                                  (o CANCELADA en cualquier punto)
--    RECIBIDA es la CONFIRMACIÓN DE RECEPCIÓN de RF7: cocina/bar la emiten y
--    el mesero la ve. items_confirmados es cuántos ítems dice haber recibido
--    el área; si no coincide con los enviados, hay un problema de sincronía
--    que el sistema debe avisar (RF7: "la información corresponde con la
--    enviada").
-- ---------------------------------------------------------------------
CREATE TABLE comanda (
    id                   INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id            INTEGER             NOT NULL REFERENCES pedido(id),
    destino              destino_preparacion NOT NULL,
    es_anticipada        BOOLEAN             NOT NULL DEFAULT FALSE,   -- cola prioritaria
    estado               estado_comanda      NOT NULL DEFAULT 'ENVIADA',
    enviada_en           TIMESTAMPTZ         NOT NULL DEFAULT now(),
    confirmada_en        TIMESTAMPTZ,
    confirmada_por       INTEGER             REFERENCES usuario(id),
    items_confirmados    SMALLINT            CHECK (items_confirmados >= 0),
    lista_en             TIMESTAMPTZ,
    cancelacion_acuse_en TIMESTAMPTZ,        -- cocina/bar acusan recibo de la cancelación (RF8)
    UNIQUE (pedido_id, destino, es_anticipada),
    UNIQUE (id, pedido_id),                  -- para la FK compuesta de item_pedido
    -- Si ya fue recibida (o avanzó), debe tener su confirmación registrada.
    CHECK (estado IN ('ENVIADA', 'CANCELADA') OR confirmada_en IS NOT NULL),
    CHECK ((estado = 'LISTA') = (lista_en IS NOT NULL))
);

CREATE INDEX ix_comanda_cola ON comanda (destino, estado);   -- el tablero de cocina/bar


-- Cada ítem sabe a qué comanda pertenece. NULL para el ítem "padre" de un
-- combo (el combo en sí no se cocina: se cocinan sus componentes).
-- La FK compuesta garantiza que la comanda sea del MISMO pedido que el ítem.
ALTER TABLE item_pedido ADD COLUMN comanda_id INTEGER;
ALTER TABLE item_pedido
    ADD FOREIGN KEY (comanda_id, pedido_id) REFERENCES comanda (id, pedido_id);
CREATE INDEX ix_item_pedido_comanda ON item_pedido (comanda_id);


-- ---------------------------------------------------------------------
-- 2) CANCELACION (RF8 · CU17, CU18)
--    Se cancela el PEDIDO completo. Flujo (decisión del equipo):
--      - Hasta 3 min desde el REGISTRO del pedido: el mesero cancela y queda
--        APROBADA al instante.
--      - Pasado ese tiempo: el mesero la SOLICITA y caja/personal autorizado
--        la aprueba o rechaza. Caja también puede cancelar directamente.
--    Si el pedido ya se preparó, caja puede crear un producto preparado
--    desde la cancelación (CU18 / CU19): bandera crear_preparado.
--    Qué reglas se validan en el backend (dependen de otras tablas):
--      * el tiempo transcurrido contra pedido.creado_en y el parámetro
--      * que la cuenta no esté PAGADA (CU18: si ya se liquidó, no se cancela)
-- ---------------------------------------------------------------------
CREATE TABLE cancelacion (
    id                INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id         INTEGER             NOT NULL REFERENCES pedido(id),
    motivo            VARCHAR(200)        NOT NULL CHECK (length(btrim(motivo)) > 0),  -- obligatorio
    solicitada_por    INTEGER             NOT NULL REFERENCES usuario(id),
    solicitada_en     TIMESTAMPTZ         NOT NULL DEFAULT now(),
    estado            estado_cancelacion  NOT NULL DEFAULT 'SOLICITADA',
    resuelta_por      INTEGER             REFERENCES usuario(id),
    resuelta_en       TIMESTAMPTZ,
    crear_preparado   BOOLEAN             NOT NULL DEFAULT FALSE,
    CHECK ((estado = 'SOLICITADA') = (resuelta_en IS NULL AND resuelta_por IS NULL))
);

-- Un pedido tiene a lo sumo UNA cancelación que no haya sido rechazada
-- (si la rechazan, se puede volver a solicitar).
CREATE UNIQUE INDEX uq_cancelacion_activa
    ON cancelacion (pedido_id) WHERE estado <> 'RECHAZADA';


-- ---------------------------------------------------------------------
-- 3) PRODUCTO_PREPARADO (RF10 · CU19, CU20, CU21)
--    Una fila = UNA unidad ya preparada y disponible para vender.
--    - Nace por registro directo de cocina/bar, o desde una cancelación.
--    - Asignarla a un pedido (CU21) = llenar item_asignado_id. Para evitar
--      que dos meseros tomen la misma unidad a la vez, el backend hace:
--        UPDATE ... SET item_asignado_id = X WHERE id = Y AND estado = 'DISPONIBLE'
--      y si no actualizó ninguna fila, alguien se la ganó.
--    - La FK compuesta (item_asignado_id, producto_id) obliga a que el ítem
--      sea del MISMO producto que la unidad preparada.
--    - Si se cancela el pedido que la usó, vuelve a DISPONIBLE (backend).
-- ---------------------------------------------------------------------
ALTER TABLE item_pedido ADD UNIQUE (id, producto_id);   -- necesario para la FK compuesta

CREATE TABLE producto_preparado (
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

CREATE INDEX ix_preparado_disponible ON producto_preparado (producto_id) WHERE estado = 'DISPONIBLE';


-- ---------------------------------------------------------------------
-- 4) PAGO (RF14 · CU16)
--    Cada fila es un pago registrado por caja contra UNA cuenta. Puede haber
--    varios por cuenta (pago dividido). La cuenta pasa a PAGADA cuando lo
--    pagado cubre el total (lo decide el backend, en una transacción, junto
--    con cuenta.cerrada_en). metodo_pago es un supuesto del diseño: el SRS
--    no lo define, pero ayuda al resumen diario económico.
-- ---------------------------------------------------------------------
CREATE TABLE pago (
    id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cuenta_id  INTEGER       NOT NULL REFERENCES cuenta(id),
    cajero_id  INTEGER       NOT NULL REFERENCES usuario(id),
    monto      NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    metodo     metodo_pago   NOT NULL,
    pagado_en  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX ix_pago_cuenta ON pago (cuenta_id);
CREATE INDEX ix_pago_fecha  ON pago (pagado_en);   -- resumen diario


-- ---------------------------------------------------------------------
-- 5) VISTAS
--    a) v_total_cuenta se REDEFINE: ahora excluye los pedidos cancelados
--       (los que tienen una cancelación APROBADA).
--    b) v_estado_mesa DERIVA el estado de cada mesa (RF13, tarea 7.6) a
--       partir de sus cuentas y comandas, por prioridad:
--         1. CON_PEDIDOS_PENDIENTES : hay comandas sin terminar (no LISTA ni CANCELADA)
--         2. OCUPADA                : hay una cuenta ABIERTA
--         3. EN_PROCESO_DE_PAGO     : solo quedan cuentas PENDIENTES (falta pagar)
--         4. DISPONIBLE             : no hay cuentas sin pagar (CU16: solo así se libera)
-- ---------------------------------------------------------------------
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

CREATE VIEW v_estado_mesa AS
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
