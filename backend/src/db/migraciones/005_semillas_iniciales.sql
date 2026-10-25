-- Migración 005: Semillas iniciales para desarrollo y pruebas locales
-- Inserta usuarios, sectores, mesas, categorías, productos y opciones básicas.

-- 1. Sectores iniciales
INSERT INTO sector (nombre) VALUES
    ('Salón Principal'),
    ('Terraza Exterior'),
    ('Barra de Coctelería')
ON CONFLICT (nombre) DO NOTHING;

-- 2. Mesas iniciales (12 mesas distribuidas por sector)
INSERT INTO mesa (numero, sector_id)
SELECT n,
       CASE
         WHEN n <= 6 THEN (SELECT id FROM sector WHERE nombre = 'Salón Principal')
         WHEN n <= 10 THEN (SELECT id FROM sector WHERE nombre = 'Terraza Exterior')
         ELSE (SELECT id FROM sector WHERE nombre = 'Barra de Coctelería')
       END
FROM generate_series(1, 12) AS n
ON CONFLICT (numero) DO NOTHING;

-- 3. Categorías de la carta
INSERT INTO categoria (nombre, orden) VALUES
    ('Entradas', 1),
    ('Platos Fuertes', 2),
    ('Bebidas', 3),
    ('Postres', 4),
    ('Combos', 5)
ON CONFLICT (nombre) DO NOTHING;

-- 4. Empaques para llevar
INSERT INTO empaque (nombre) VALUES
    ('Caja hamburguesa térmica'),
    ('Vaso para bebidas con tapa'),
    ('Bolsa de papel kraft')
ON CONFLICT (nombre) DO NOTHING;

-- 5. Productos base
INSERT INTO producto (nombre, descripcion, categoria_id, precio, es_combo, destino, permite_llevar, permite_anticipada, disponible, stock_cantidad)
VALUES
    ('Hamburguesa Clásica', 'Carne de res 150g con queso cheddar, lechuga y tomate',
     (SELECT id FROM categoria WHERE nombre = 'Platos Fuertes'), 22000, FALSE, 'COCINA', TRUE, TRUE, TRUE, 50),
    ('Papas Francesas Medianas', 'Porción de papas crujientes con sal marina',
     (SELECT id FROM categoria WHERE nombre = 'Entradas'), 8000, FALSE, 'COCINA', TRUE, TRUE, TRUE, 100),
    ('Cerveza Artesanal IPA', 'Botella 330ml estilo Indian Pale Ale',
     (SELECT id FROM categoria WHERE nombre = 'Bebidas'), 12000, FALSE, 'BAR', FALSE, TRUE, TRUE, 48),
    ('Limonada Natural', 'Vaso 400ml preparado con limón fresco',
     (SELECT id FROM categoria WHERE nombre = 'Bebidas'), 7000, FALSE, 'BAR', TRUE, TRUE, TRUE, NULL),
    ('Combo Almuerzo Ejecutivo', 'Hamburguesa Clásica + Papas Francesas + Gaseosa o Bebida',
     (SELECT id FROM categoria WHERE nombre = 'Combos'), 28000, TRUE, NULL, TRUE, FALSE, TRUE, NULL)
ON CONFLICT (nombre) DO NOTHING;

-- 6. Componentes del combo
INSERT INTO combo_componente (combo_id, producto_id, cantidad, removible)
VALUES
    ((SELECT id FROM producto WHERE nombre = 'Combo Almuerzo Ejecutivo'),
     (SELECT id FROM producto WHERE nombre = 'Hamburguesa Clásica'), 1, FALSE),
    ((SELECT id FROM producto WHERE nombre = 'Combo Almuerzo Ejecutivo'),
     (SELECT id FROM producto WHERE nombre = 'Papas Francesas Medianas'), 1, TRUE),
    ((SELECT id FROM producto WHERE nombre = 'Combo Almuerzo Ejecutivo'),
     (SELECT id FROM producto WHERE nombre = 'Limonada Natural'), 1, TRUE)
ON CONFLICT (combo_id, producto_id) DO NOTHING;

-- 7. Opciones de personalización
INSERT INTO opcion (nombre, tipo, precio_extra, disponible) VALUES
    ('Término Medio', 'PREFERENCIA', 0, TRUE),
    ('Término Tres Cuartos', 'PREFERENCIA', 0, TRUE),
    ('Término Bien Cocido', 'PREFERENCIA', 0, TRUE),
    ('Adición de Tocineta Ahumada', 'ADICIONAL', 4000, TRUE),
    ('Hierbabuena Fresca', 'ADICIONAL', 0, TRUE),
    ('Sin Sal', 'EXCLUSION', 0, TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- 8. Restricciones de opciones (incompatibilidades)
-- Ordenadas asegurando opcion_a_id < opcion_b_id
INSERT INTO restriccion_opcion (opcion_a_id, opcion_b_id)
SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id)
FROM opcion a, opcion b
WHERE a.nombre = 'Término Medio' AND b.nombre = 'Término Tres Cuartos'
ON CONFLICT (opcion_a_id, opcion_b_id) DO NOTHING;

INSERT INTO restriccion_opcion (opcion_a_id, opcion_b_id)
SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id)
FROM opcion a, opcion b
WHERE a.nombre = 'Término Medio' AND b.nombre = 'Término Bien Cocido'
ON CONFLICT (opcion_a_id, opcion_b_id) DO NOTHING;

-- 9. Usuarios de prueba con contraseñas hash (clave provisional en desarrollo: '123456')
-- Hash bcrypt para '123456': $2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6
INSERT INTO usuario (nombre_usuario, nombre_completo, contrasena_hash, rol_id, activo) VALUES
    ('admin', 'Anderson Rincón (Admin)', '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6', (SELECT id FROM rol WHERE nombre = 'ADMIN'), TRUE),
    ('simon', 'Simón Ruedas (Caja)', '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6', (SELECT id FROM rol WHERE nombre = 'CAJA'), TRUE),
    ('miguel', 'Miguel Angulo (Mesero)', '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6', (SELECT id FROM rol WHERE nombre = 'MESERO'), TRUE),
    ('cocina', 'Carlos Chef (Cocina)', '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6', (SELECT id FROM rol WHERE nombre = 'COCINA'), TRUE),
    ('bar', 'Diana Bartender (Bar)', '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6', (SELECT id FROM rol WHERE nombre = 'BAR'), TRUE)
ON CONFLICT (nombre_usuario) DO NOTHING;
