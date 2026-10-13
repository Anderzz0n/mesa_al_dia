-- =====================================================================
-- Mesa al día · Modelo de datos · PARTE 3: cuentas, pedidos e ítems
-- Cubre: RF4 (varias cuentas por mesa), RF12 (pedidos móviles), RF3/RF5/RF6
--        (lo que el mesero ELIGE: opciones, modalidad), CU9, CU10, CU11,
--        CU13, CU14, CU25
-- Requiere 01 y 02.
--
-- Jerarquía:   mesa ──< cuenta ──< pedido ──< item_pedido ──< item_opcion
--   cuenta = lo que se paga (un comensal o grupo en la mesa)
--   pedido = cada ENVÍO de productos a cocina/bar dentro de una cuenta
--   item   = un producto pedido, con su cantidad, modalidad y opciones
-- Así, agregar productos después (CU13) crea un pedido NUEVO sin tocar los
-- ya enviados.
-- ---------------------------------------------------------------------


CREATE TYPE estado_cuenta AS ENUM ('ABIERTA', 'PENDIENTE', 'PAGADA');
--   ABIERTA   = en atención (el comensal aún puede pedir)
--   PENDIENTE = ya consumió y falta pagar (RF4). Es lo que RF13 llama
--               "en proceso de pago" a nivel de mesa.
--   PAGADA    = cerrada
CREATE TYPE modalidad_atencion AS ENUM ('MESA', 'LLEVAR', 'ANTICIPADA');   -- CU11


-- ---------------------------------------------------------------------
-- 1) CUENTA (RF4 · CU9, CU14)
--    - Muchas cuentas por mesa, cada una con su propio estado.
--    - etiqueta identifica la cuenta ("Comensal 1", "Juan"...). El índice de
--      abajo impide dos cuentas VIVAS con la misma etiqueta en la misma mesa
--      (RF4: "identificar de manera diferenciada"). Una cuenta ya PAGADA
--      libera su etiqueta.
-- ---------------------------------------------------------------------
CREATE TABLE cuenta (
    id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mesa_id     SMALLINT      NOT NULL REFERENCES mesa(id),
    etiqueta    VARCHAR(40)   NOT NULL,
    estado      estado_cuenta NOT NULL DEFAULT 'ABIERTA',
    abierta_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    cerrada_en  TIMESTAMPTZ,
    cerrada_por INTEGER       REFERENCES usuario(id),        -- quien en caja la marcó como pagada
    -- El "pago" es solo esta casilla: la cuenta PAGADA siempre trae cuándo y quién.
    CHECK ((estado = 'PAGADA') = (cerrada_en IS NOT NULL)),
    CHECK ((estado = 'PAGADA') = (cerrada_por IS NOT NULL))
);

CREATE UNIQUE INDEX uq_cuenta_etiqueta_viva
    ON cuenta (mesa_id, etiqueta) WHERE estado <> 'PAGADA';
CREATE INDEX ix_cuenta_mesa ON cuenta (mesa_id);   -- acelera "cuentas de esta mesa"


-- ---------------------------------------------------------------------
-- 2) PEDIDO (CU25, CU13)
--    Un envío a cocina/bar. mesero_id es el responsable EN ESE MOMENTO
--    (según sector o reasignación, tarea 5.6): se guarda como foto, porque
--    después la asignación puede cambiar y el historial no debe cambiar
--    con ella. De aquí sale también la actividad diaria (CU24).
-- ---------------------------------------------------------------------
CREATE TABLE pedido (
    id         INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cuenta_id  INTEGER     NOT NULL REFERENCES cuenta(id),
    mesero_id  INTEGER     NOT NULL REFERENCES usuario(id),
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_pedido_cuenta ON pedido (cuenta_id);
CREATE INDEX ix_pedido_mesero_fecha ON pedido (mesero_id, creado_en);   -- CU24


-- ---------------------------------------------------------------------
-- 3) ITEM_PEDIDO (CU10, CU11, CU13)
--    - precio_unitario es una FOTO del precio al pedir: si mañana sube el
--      precio del producto, las cuentas de hoy no cambian.
--    - modalidad: cada ítem la lleva por separado (CU11). Que el producto
--      permita llevar/anticipada lo valida el backend, porque depende de
--      OTRA tabla (producto) y un CHECK solo ve su propia fila.
--    - observacion: texto libre para lo que las opciones no cubren (RF3).
--    - COMBOS: el combo se guarda como un ítem "padre" y sus componentes como
--      ítems "hijos" (item_padre_id). Los componentes incluidos van con
--      precio_unitario = 0 (ya están en el precio del combo); un producto
--      extra agregado al combo va con su propio precio. Un componente quitado
--      (removible) simplemente no se inserta.
--      La comanda se arma con los ítems que NO son combo, así cada
--      componente viaja a su destino (cocina o bar).
--    - La clave foránea COMPUESTA (item_padre_id, pedido_id) obliga a que el
--      padre sea del MISMO pedido que el hijo.
-- ---------------------------------------------------------------------
CREATE TABLE item_pedido (
    id               INTEGER            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id        INTEGER            NOT NULL REFERENCES pedido(id),
    producto_id      INTEGER            NOT NULL REFERENCES producto(id),
    cantidad         SMALLINT           NOT NULL CHECK (cantidad >= 1),
    precio_unitario  NUMERIC(10,2)      NOT NULL CHECK (precio_unitario >= 0),
    modalidad        modalidad_atencion NOT NULL DEFAULT 'MESA',
    observacion      VARCHAR(200),
    item_padre_id    INTEGER,
    UNIQUE (id, pedido_id),                                   -- necesario para la FK compuesta
    FOREIGN KEY (item_padre_id, pedido_id) REFERENCES item_pedido (id, pedido_id)
);

CREATE INDEX ix_item_pedido_pedido ON item_pedido (pedido_id);
CREATE INDEX ix_item_pedido_producto ON item_pedido (producto_id);   -- recomendaciones (RF11)


-- ---------------------------------------------------------------------
-- 4) ITEM_OPCION (CU10): las opciones de personalización elegidas.
--    Foto del precio extra, por la misma razón que en item_pedido.
-- ---------------------------------------------------------------------
CREATE TABLE item_opcion (
    item_id       INTEGER       NOT NULL REFERENCES item_pedido(id),
    opcion_id     INTEGER       NOT NULL REFERENCES opcion_personalizacion(id),
    precio_extra  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_extra >= 0),
    PRIMARY KEY (item_id, opcion_id)
);
-- Que la opción pertenezca al producto (producto_opcion) y que no haya
-- combinaciones prohibidas (restriccion_opcion) lo valida el backend.


-- ---------------------------------------------------------------------
-- 5) V_TOTAL_CUENTA: el total NO se guarda, se calcula. Un valor guardado
--    podría quedar desactualizado (CU13: "el valor de la cuenta se actualiza").
--    Una VISTA es una consulta con nombre que se usa como si fuera tabla.
--    (La Parte 4 la redefinirá para excluir lo cancelado.)
-- ---------------------------------------------------------------------
CREATE VIEW v_total_cuenta AS
SELECT c.id AS cuenta_id,
       COALESCE(SUM(i.cantidad * (i.precio_unitario + COALESCE(o.extra, 0))), 0) AS total
FROM cuenta c
LEFT JOIN pedido p       ON p.cuenta_id = c.id
LEFT JOIN item_pedido i  ON i.pedido_id = p.id
LEFT JOIN LATERAL (SELECT SUM(precio_extra) AS extra
                   FROM item_opcion WHERE item_id = i.id) o ON TRUE
GROUP BY c.id;
