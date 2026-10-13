-- =====================================================================
-- Mesa al día · Modelo de datos · PARTE 2: menú, stock, personalización
-- Cubre: RF3 (personalización), RF5 (empaques), RF6 (anticipada, parte
--        estática), RF9 (disponibilidad/stock)
-- Requiere haber ejecutado antes 01_seguridad_y_sectores.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- TIPOS ENUM: listas CERRADAS de valores que no van a crecer.
-- (A diferencia de "rol", que es tabla porque puede ampliarse y se consulta.)
-- ---------------------------------------------------------------------
CREATE TYPE destino_preparacion AS ENUM ('COCINA', 'BAR');
CREATE TYPE tipo_opcion         AS ENUM ('EXCLUSION', 'SUSTITUCION', 'ADICIONAL', 'PREFERENCIA');
--   EXCLUSION    = "sin cebolla"            SUSTITUCION = "cambiar papas por ensalada"
--   ADICIONAL    = "extra queso"            PREFERENCIA = "término medio"


-- ---------------------------------------------------------------------
-- 1) PARAMETRO: ajustes globales del sistema (clave -> valor).
--    RF6 pide que cocina pueda habilitar/deshabilitar TEMPORALMENTE la
--    preparación anticipada según su capacidad: es un interruptor global.
-- ---------------------------------------------------------------------
CREATE TABLE parametro (
    clave        VARCHAR(40)  PRIMARY KEY,
    valor        VARCHAR(100) NOT NULL,
    descripcion  VARCHAR(200)
);

INSERT INTO parametro (clave, valor, descripcion) VALUES
    ('ANTICIPADA_ACTIVA', 'true', 'Interruptor global de preparación anticipada (RF6)');


-- ---------------------------------------------------------------------
-- 2) CATEGORIA: agrupa el menú para navegarlo ("Entradas", "Bebidas"...).
-- ---------------------------------------------------------------------
CREATE TABLE categoria (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(40) NOT NULL UNIQUE,
    orden   SMALLINT    NOT NULL DEFAULT 0       -- posición al mostrar el menú
);


-- ---------------------------------------------------------------------
-- 3) PRODUCTO (RF3, RF5, RF6, RF9)
--    - precio es NUMERIC(10,2): decimal EXACTO. Nunca FLOAT para dinero
--      (0.1 + 0.2 en float no da 0.3 exacto).
--    - destino decide a dónde viaja la comanda: cocina o bar.
--    - permite_llevar / permite_anticipada: capacidades del producto
--      (RF5 y RF6). El mesero solo ve esas opciones si están en true.
--    - DISPONIBILIDAD, dos columnas que trabajan juntas (RF9 / CU22):
--        disponible      -> interruptor que ve el mesero (bloqueo manual)
--        stock_cantidad  -> unidades restantes; NULL = no se cuenta
--      Regla del CU22: si el stock llega a 0 el producto queda "no
--      disponible". La restricción CHECK lo garantiza en la base de datos,
--      aunque el backend tuviera un error.
-- ---------------------------------------------------------------------
CREATE TABLE producto (
    id                  INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre              VARCHAR(80)         NOT NULL UNIQUE,
    descripcion         VARCHAR(200),
    categoria_id        SMALLINT            NOT NULL REFERENCES categoria(id),
    precio              NUMERIC(10,2)       NOT NULL CHECK (precio >= 0),
    es_combo            BOOLEAN             NOT NULL DEFAULT FALSE,
    destino             destino_preparacion,       -- NULL solo en los combos
    permite_llevar      BOOLEAN             NOT NULL DEFAULT FALSE,
    permite_anticipada  BOOLEAN             NOT NULL DEFAULT FALSE,
    disponible          BOOLEAN             NOT NULL DEFAULT TRUE,
    stock_cantidad      INTEGER             CHECK (stock_cantidad >= 0),   -- sin negativos
    CONSTRAINT ck_stock_cero_no_disponible
        CHECK (stock_cantidad IS NULL OR stock_cantidad > 0 OR disponible = FALSE),
    -- Un combo mezcla productos de cocina y de bar, así que NO tiene destino
    -- propio: cada componente viaja a su destino. Un producto normal sí lo tiene.
    CONSTRAINT ck_destino_segun_combo
        CHECK ((es_combo AND destino IS NULL) OR (NOT es_combo AND destino IS NOT NULL))
);
-- INTEGER (no NUMERIC) para el stock: así tampoco existen decimales.


-- ---------------------------------------------------------------------
-- 3b) COMBO_COMPONENTE (RF3: "configuraciones que involucren diferentes
--     componentes del menú")
--     Un combo ES un producto (tiene precio y se pide como cualquier otro)
--     con es_combo = TRUE, más una lista de los productos que lo componen.
--     - removible = TRUE: el mesero puede quitar ese componente al pedir.
--     - Agregar un producto extra a un combo no se guarda aquí (aquí solo va
--       la receta base): se registra en el pedido (Parte 3).
--     - Un combo no puede contener otros combos: lo valida el backend.
--     - Disponibilidad: un combo se ofrece solo si él y sus componentes
--       obligatorios están disponibles (regla del backend, tarea 6.4).
-- ---------------------------------------------------------------------
CREATE TABLE combo_componente (
    combo_id     INTEGER  NOT NULL REFERENCES producto(id),
    producto_id  INTEGER  NOT NULL REFERENCES producto(id),
    cantidad     SMALLINT NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
    removible    BOOLEAN  NOT NULL DEFAULT FALSE,
    PRIMARY KEY (combo_id, producto_id),
    CHECK (combo_id <> producto_id)             -- un combo no se contiene a sí mismo
);


-- ---------------------------------------------------------------------
-- 4) EMPAQUE y PRODUCTO_EMPAQUE (RF5)
--    Un producto "para llevar" necesita empaques (caja, vaso, bolsa...) y
--    el sistema los asigna solo. Un producto usa varios empaques y un
--    empaque sirve a varios productos: relación muchos-a-muchos. Se
--    resuelve con una tabla intermedia, que además guarda la cantidad.
-- ---------------------------------------------------------------------
CREATE TABLE empaque (
    id      SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE producto_empaque (
    producto_id  INTEGER  NOT NULL REFERENCES producto(id),
    empaque_id   SMALLINT NOT NULL REFERENCES empaque(id),
    cantidad     SMALLINT NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
    PRIMARY KEY (producto_id, empaque_id)       -- no se repite el par
);


-- ---------------------------------------------------------------------
-- 5) OPCION_PERSONALIZACION (RF3 · CU10)
--    Catálogo ÚNICO de opciones ("sin cebolla", "extra queso"...). Se define
--    una vez y se enlaza a muchos productos. Por qué compartido: RF3 exige
--    que cocina/bar actualicen las opciones en tiempo real; si se acaba la
--    cebolla, se desactiva UNA opción y desaparece de todos los productos.
-- ---------------------------------------------------------------------
CREATE TABLE opcion_personalizacion (
    id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo          tipo_opcion   NOT NULL,
    nombre        VARCHAR(60)   NOT NULL,
    precio_extra  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_extra >= 0),
    disponible    BOOLEAN       NOT NULL DEFAULT TRUE,
    UNIQUE (tipo, nombre)
);

-- Qué opciones se ofrecen en qué producto (muchos-a-muchos).
CREATE TABLE producto_opcion (
    producto_id  INTEGER NOT NULL REFERENCES producto(id),
    opcion_id    INTEGER NOT NULL REFERENCES opcion_personalizacion(id),
    PRIMARY KEY (producto_id, opcion_id)
);

-- Combinaciones NO autorizadas (RF3): pares de opciones que no pueden ir
-- juntas, p. ej. "término crudo" + "bien cocido". Se guarda siempre el par
-- con el id menor primero (opcion_a_id < opcion_b_id), así (1,2) y (2,1)
-- no pueden registrarse como dos filas distintas.
CREATE TABLE restriccion_opcion (
    opcion_a_id  INTEGER NOT NULL REFERENCES opcion_personalizacion(id),
    opcion_b_id  INTEGER NOT NULL REFERENCES opcion_personalizacion(id),
    PRIMARY KEY (opcion_a_id, opcion_b_id),
    CHECK (opcion_a_id < opcion_b_id)
);
