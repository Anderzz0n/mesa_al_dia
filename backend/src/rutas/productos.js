import express from 'express';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas de Productos del Menú y Catálogo (RF3 / RF9).
 * Base: /api/v1/productos
 */
export function rutaProductos(db, { secreto = config.jwtSecreto, tiempoReal = null } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET /recomendados : Productos recomendados en la franja horaria actual (CU23)
  router.get('/recomendados', autenticar, async (req, res, next) => {
    try {
      // Si no hay histórico aún, devuelve array vacío
      return res.json([]);
    } catch (err) {
      next(err);
    }
  });

  // GET / : Lista de productos con opciones, componentes y cálculo de disponibilidad
  router.get('/', autenticar, async (req, res, next) => {
    try {
      const { categoria, disponible, destino } = req.query;

      try {
        // Consulta SQL con PostgreSQL
        let sql = `
          SELECT 
            p.id,
            p.nombre,
            p.descripcion,
            p.categoria_id,
            c.nombre AS categoria_nombre,
            p.precio,
            p.es_combo,
            p.destino,
            p.permite_llevar,
            p.permite_anticipada,
            p.disponible,
            p.stock_cantidad
          FROM producto p
          JOIN categoria c ON c.id = p.categoria_id
          WHERE 1=1
        `;
        const params = [];

        if (categoria) {
          params.push(categoria);
          sql += ` AND (p.categoria_id = $${params.length}::int OR c.nombre ILIKE $${params.length})`;
        }

        if (disponible !== undefined) {
          params.push(disponible === 'true');
          sql += ` AND p.disponible = $${params.length}`;
        }

        if (destino) {
          params.push(destino.toUpperCase());
          // Los combos no tienen destino (destino IS NULL); si se filtra por COCINA o BAR, quedan excluidos
          sql += ` AND p.destino = $${params.length}::destino_preparacion`;
        }

        sql += ` ORDER BY c.orden ASC, p.nombre ASC;`;

        const resultado = await db.query(sql, params);
        const filas = resultado.rows || [];

        // Consultar opciones asociadas a los productos
        const sqlOpciones = `
          SELECT 
            po.producto_id,
            o.id,
            o.nombre,
            o.tipo,
            o.precio_extra,
            o.disponible
          FROM producto_opcion po
          JOIN opcion o ON o.id = po.opcion_id
          ORDER BY o.nombre ASC;
        `;
        const resOpciones = await db.query(sqlOpciones);
        const opcionesPorProducto = new Map();
        for (const op of resOpciones.rows || []) {
          if (!opcionesPorProducto.has(op.producto_id)) {
            opcionesPorProducto.set(op.producto_id, []);
          }
          opcionesPorProducto.get(op.producto_id).push({
            id: op.id,
            nombre: op.nombre,
            tipo: op.tipo,
            precio_extra: Number(op.precio_extra),
            disponible: op.disponible,
          });
        }

        // Consultar componentes de combos
        const sqlComponentes = `
          SELECT 
            cc.combo_id,
            cc.producto_id,
            h.nombre,
            cc.cantidad,
            cc.removible,
            h.disponible,
            h.destino
          FROM combo_componente cc
          JOIN producto h ON h.id = cc.producto_id
          ORDER BY h.nombre ASC;
        `;
        const resComponentes = await db.query(sqlComponentes);
        const componentesPorCombo = new Map();
        for (const comp of resComponentes.rows || []) {
          if (!componentesPorCombo.has(comp.combo_id)) {
            componentesPorCombo.set(comp.combo_id, []);
          }
          componentesPorCombo.get(comp.combo_id).push({
            producto_id: comp.producto_id,
            nombre: comp.nombre,
            cantidad: comp.cantidad,
            removible: comp.removible,
            disponible: comp.disponible,
            destino: comp.destino,
          });
        }

        const productosFinales = filas.map((p) => {
          const ops = opcionesPorProducto.get(p.id) || [];
          const comps = p.es_combo ? componentesPorCombo.get(p.id) || [] : [];

          // Cálculo de disponibilidad:
          // Un combo está disponible si su propio flag es true Y todos sus componentes no removibles están disponibles
          let disponibleCalculado = p.disponible;
          if (p.es_combo) {
            const noRemovibles = comps.filter((c) => !c.removible);
            disponibleCalculado = p.disponible && noRemovibles.every((c) => c.disponible);
          } else if (p.stock_cantidad !== null && p.stock_cantidad <= 0) {
            disponibleCalculado = false;
          }

          return {
            id: p.id,
            nombre: p.nombre,
            descripcion: p.descripcion,
            categoria_id: p.categoria_id,
            categoria_nombre: p.categoria_nombre,
            precio: Number(p.precio),
            es_combo: p.es_combo,
            destino: p.destino,
            permite_llevar: p.permite_llevar,
            permite_anticipada: p.permite_anticipada,
            disponible: p.disponible,
            disponible_calculado: disponibleCalculado,
            stock_cantidad: p.stock_cantidad,
            opciones: ops,
            ...(p.es_combo ? { componentes: comps } : {}),
          };
        });

        return res.json(productosFinales);
      } catch (dbErr) {
        // Fallback en memoria compartido
        let lista = (estadoMemoria.productos || []).map((p) => {
          const cat = (estadoMemoria.categorias || []).find((c) => c.id === p.categoria_id);
          const opsIds = (estadoMemoria.productoOpciones || [])
            .filter((po) => po.producto_id === p.id)
            .map((po) => po.opcion_id);
          const ops = (estadoMemoria.opciones || []).filter((o) => opsIds.includes(o.id));

          let comps = [];
          if (p.es_combo) {
            const ccList = (estadoMemoria.comboComponentes || []).filter((c) => c.combo_id === p.id);
            comps = ccList.map((cc) => {
              const prodHijo = (estadoMemoria.productos || []).find((ph) => ph.id === cc.producto_id);
              return {
                producto_id: cc.producto_id,
                nombre: prodHijo?.nombre || 'Componente',
                cantidad: cc.cantidad,
                removible: cc.removible,
                disponible: prodHijo?.disponible ?? true,
                destino: prodHijo?.destino || null,
              };
            });
          }

          let disponibleCalculado = p.disponible;
          if (p.es_combo) {
            const noRemovibles = comps.filter((c) => !c.removible);
            disponibleCalculado = p.disponible && noRemovibles.every((c) => c.disponible);
          } else if (p.stock_cantidad !== null && p.stock_cantidad <= 0) {
            disponibleCalculado = false;
          }

          return {
            ...p,
            categoria_nombre: cat?.nombre || '',
            disponible_calculado: disponibleCalculado,
            opciones: ops,
            ...(p.es_combo ? { componentes: comps } : {}),
          };
        });

        // Aplicar filtros
        if (categoria) {
          lista = lista.filter(
            (p) => String(p.categoria_id) === String(categoria) || p.categoria_nombre.toLowerCase() === String(categoria).toLowerCase()
          );
        }

        if (disponible !== undefined) {
          const dispBool = disponible === 'true';
          lista = lista.filter((p) => p.disponible === dispBool);
        }

        if (destino) {
          const destUpper = destino.toUpperCase();
          lista = lista.filter((p) => p.destino === destUpper);
        }

        return res.json(lista);
      }
    } catch (err) {
      next(err);
    }
  });

  // POST / : Alta de producto o combo (RF3 / CU11)
  // Rol: ADMIN
  router.post('/', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const {
        nombre,
        descripcion,
        categoria_id,
        precio,
        es_combo = false,
        destino,
        permite_llevar = false,
        permite_anticipada = false,
        disponible = true,
        stock_cantidad = null,
        opciones = [],
        componentes = [],
      } = req.body;

      if (
        !nombre ||
        !nombre.trim() ||
        precio === undefined ||
        precio === null ||
        isNaN(precio) ||
        Number(precio) < 0 ||
        !categoria_id
      ) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Nombre, categoría y precio válido (>= 0) son obligatorios', 400);
      }

      const esComboBool = Boolean(es_combo);

      if (esComboBool) {
        if (destino !== null && destino !== undefined) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'Un combo no puede tener destino de preparación directo', 400);
        }
        if (stock_cantidad !== null && stock_cantidad !== undefined) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'Un combo no puede tener stock propio', 400);
        }
        if (!Array.isArray(componentes) || componentes.length === 0) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'Un combo debe contener al menos un producto componente', 400);
        }
      } else {
        const destUpper = String(destino || '').toUpperCase();
        if (!['COCINA', 'BAR'].includes(destUpper)) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'El destino de un producto individual debe ser COCINA o BAR', 400);
        }
      }

      try {
        // Verificar nombre duplicado en PostgreSQL
        const existeSql = `SELECT id FROM producto WHERE LOWER(nombre) = LOWER($1);`;
        const resExiste = await db.query(existeSql, [nombre.trim()]);
        if (resExiste.rows && resExiste.rows.length > 0) {
          throw new ErrorNegocio('PRODUCTO_NOMBRE_REPETIDO', 'Ya existe un producto con ese nombre', 409);
        }

        const insertSql = `
          INSERT INTO producto (
            nombre, descripcion, categoria_id, precio, es_combo, destino,
            permite_llevar, permite_anticipada, disponible, stock_cantidad
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id, nombre, descripcion, categoria_id, precio, es_combo, destino, permite_llevar, permite_anticipada, disponible, stock_cantidad;
        `;
        const destValor = esComboBool ? null : String(destino).toUpperCase();
        const resInsert = await db.query(insertSql, [
          nombre.trim(),
          descripcion || null,
          Number(categoria_id),
          Number(precio),
          esComboBool,
          destValor,
          Boolean(permite_llevar),
          Boolean(permite_anticipada),
          Boolean(disponible),
          stock_cantidad !== null && stock_cantidad !== undefined ? Number(stock_cantidad) : null,
        ]);
        const nuevo = resInsert.rows[0];

        // Asociar opciones
        if (Array.isArray(opciones) && opciones.length > 0) {
          for (const opId of opciones) {
            await db.query(
              `INSERT INTO producto_opcion (producto_id, opcion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
              [nuevo.id, Number(opId)]
            );
          }
        }

        // Asociar componentes si es combo
        if (esComboBool && Array.isArray(componentes)) {
          for (const comp of componentes) {
            await db.query(
              `INSERT INTO combo_componente (combo_id, producto_id, cantidad, removible) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;`,
              [nuevo.id, Number(comp.producto_id), Number(comp.cantidad || 1), Boolean(comp.removible)]
            );
          }
        }

        return res.status(201).json({
          ...nuevo,
          precio: Number(nuevo.precio),
          opciones: opciones || [],
          ...(esComboBool ? { componentes } : {}),
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;
        if (dbErr.code === '23505') {
          throw new ErrorNegocio('PRODUCTO_NOMBRE_REPETIDO', 'Ya existe un producto con ese nombre', 409);
        }

        // Fallback en memoria
        const nombreRepetido = (estadoMemoria.productos || []).some(
          (p) => p.nombre.toLowerCase() === nombre.trim().toLowerCase()
        );
        if (nombreRepetido) {
          throw new ErrorNegocio('PRODUCTO_NOMBRE_REPETIDO', 'Ya existe un producto con ese nombre', 409);
        }

        const nuevoId = Math.max(0, ...(estadoMemoria.productos || []).map((p) => p.id)) + 1;
        const destValor = esComboBool ? null : String(destino).toUpperCase();
        const nuevoProducto = {
          id: nuevoId,
          nombre: nombre.trim(),
          descripcion: descripcion || null,
          categoria_id: Number(categoria_id),
          precio: Number(precio),
          es_combo: esComboBool,
          destino: destValor,
          permite_llevar: Boolean(permite_llevar),
          permite_anticipada: Boolean(permite_anticipada),
          disponible: Boolean(disponible),
          stock_cantidad: stock_cantidad !== null && stock_cantidad !== undefined ? Number(stock_cantidad) : null,
        };

        if (!estadoMemoria.productos) estadoMemoria.productos = [];
        estadoMemoria.productos.push(nuevoProducto);

        if (Array.isArray(opciones) && opciones.length > 0) {
          if (!estadoMemoria.productoOpciones) estadoMemoria.productoOpciones = [];
          for (const opId of opciones) {
            estadoMemoria.productoOpciones.push({ producto_id: nuevoId, opcion_id: Number(opId) });
          }
        }

        if (esComboBool && Array.isArray(componentes)) {
          if (!estadoMemoria.comboComponentes) estadoMemoria.comboComponentes = [];
          for (const comp of componentes) {
            estadoMemoria.comboComponentes.push({
              combo_id: nuevoId,
              producto_id: Number(comp.producto_id),
              cantidad: Number(comp.cantidad || 1),
              removible: Boolean(comp.removible),
            });
          }
        }

        return res.status(201).json({
          ...nuevoProducto,
          opciones: opciones || [],
          ...(esComboBool ? { componentes } : {}),
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id : Edición de producto / combo (RF3)
  // Rol: ADMIN
  router.patch('/:id', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const {
        nombre,
        descripcion,
        categoria_id,
        precio,
        permite_llevar,
        permite_anticipada,
        disponible,
        stock_cantidad,
        opciones,
      } = req.body;

      try {
        const prodActualRes = await db.query(`SELECT * FROM producto WHERE id = $1;`, [id]);
        if (!prodActualRes.rows || prodActualRes.rows.length === 0) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }
        const prodActual = prodActualRes.rows[0];

        // Validar unicidad de nombre si cambió
        if (nombre && nombre.trim().toLowerCase() !== prodActual.nombre.toLowerCase()) {
          const resNom = await db.query(
            `SELECT id FROM producto WHERE LOWER(nombre) = LOWER($1) AND id <> $2;`,
            [nombre.trim(), id]
          );
          if (resNom.rows && resNom.rows.length > 0) {
            throw new ErrorNegocio('PRODUCTO_NOMBRE_REPETIDO', 'Ya existe un producto con ese nombre', 409);
          }
        }

        const nuevoNombre = nombre ? nombre.trim() : prodActual.nombre;
        const nuevaDesc = descripcion !== undefined ? descripcion : prodActual.descripcion;
        const nuevaCat = categoria_id !== undefined ? Number(categoria_id) : prodActual.categoria_id;
        const nuevoPrecio = precio !== undefined ? Number(precio) : Number(prodActual.precio);
        const nuevoLlevar = permite_llevar !== undefined ? Boolean(permite_llevar) : prodActual.permite_llevar;
        const nuevaAnticipada =
          permite_anticipada !== undefined ? Boolean(permite_anticipada) : prodActual.permite_anticipada;
        const nuevoDisp = disponible !== undefined ? Boolean(disponible) : prodActual.disponible;
        const nuevoStock = prodActual.es_combo
          ? null
          : stock_cantidad !== undefined
          ? stock_cantidad === null
            ? null
            : Number(stock_cantidad)
          : prodActual.stock_cantidad;

        const updateSql = `
          UPDATE producto
          SET nombre = $1, descripcion = $2, categoria_id = $3, precio = $4,
              permite_llevar = $5, permite_anticipada = $6, disponible = $7, stock_cantidad = $8
          WHERE id = $9
          RETURNING *;
        `;
        const resUpdate = await db.query(updateSql, [
          nuevoNombre,
          nuevaDesc,
          nuevaCat,
          nuevoPrecio,
          nuevoLlevar,
          nuevaAnticipada,
          nuevoDisp,
          nuevoStock,
          id,
        ]);
        const actualizado = resUpdate.rows[0];

        // Opciones
        if (Array.isArray(opciones)) {
          await db.query(`DELETE FROM producto_opcion WHERE producto_id = $1;`, [id]);
          for (const opId of opciones) {
            await db.query(`INSERT INTO producto_opcion (producto_id, opcion_id) VALUES ($1, $2);`, [
              id,
              Number(opId),
            ]);
          }
        }

        // Emisión de evento en tiempo real si cambió la disponibilidad
        if (disponible !== undefined && tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', { producto_id: id, disponible: nuevoDisp });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', { producto_id: id, disponible: nuevoDisp });
          if (actualizado.destino) {
            tiempoReal.emitir(actualizado.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              disponible: nuevoDisp,
            });
          }
        }

        return res.json({
          ...actualizado,
          precio: Number(actualizado.precio),
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;
        if (dbErr.code === '23505') {
          throw new ErrorNegocio('PRODUCTO_NOMBRE_REPETIDO', 'Ya existe un producto con ese nombre', 409);
        }

        // Fallback en memoria
        const idx = (estadoMemoria.productos || []).findIndex((p) => p.id === id);
        if (idx === -1) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }
        const prod = estadoMemoria.productos[idx];

        if (nombre && nombre.trim().toLowerCase() !== prod.nombre.toLowerCase()) {
          const repetido = (estadoMemoria.productos || []).some(
            (p) => p.id !== id && p.nombre.toLowerCase() === nombre.trim().toLowerCase()
          );
          if (repetido) {
            throw new ErrorNegocio('PRODUCTO_NOMBRE_REPETIDO', 'Ya existe un producto con ese nombre', 409);
          }
        }

        if (nombre) prod.nombre = nombre.trim();
        if (descripcion !== undefined) prod.descripcion = descripcion;
        if (categoria_id !== undefined) prod.categoria_id = Number(categoria_id);
        if (precio !== undefined) prod.precio = Number(precio);
        if (permite_llevar !== undefined) prod.permite_llevar = Boolean(permite_llevar);
        if (permite_anticipada !== undefined) prod.permite_anticipada = Boolean(permite_anticipada);
        if (disponible !== undefined) prod.disponible = Boolean(disponible);
        if (!prod.es_combo && stock_cantidad !== undefined) {
          prod.stock_cantidad = stock_cantidad === null ? null : Number(stock_cantidad);
        }

        if (Array.isArray(opciones)) {
          estadoMemoria.productoOpciones = (estadoMemoria.productoOpciones || []).filter(
            (po) => po.producto_id !== id
          );
          for (const opId of opciones) {
            estadoMemoria.productoOpciones.push({ producto_id: id, opcion_id: Number(opId) });
          }
        }

        if (disponible !== undefined && tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', { producto_id: id, disponible: prod.disponible });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', { producto_id: id, disponible: prod.disponible });
          if (prod.destino) {
            tiempoReal.emitir(prod.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              disponible: prod.disponible,
            });
          }
        }

        return res.json(prod);
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/stock : Ajuste de stock con corrección silenciosa de valores inválidos (CU22 / RF9)
  // Rol: COCINA, BAR, ADMIN
  router.patch('/:id/stock', autenticar, exigirRol('ADMIN', 'COCINA', 'BAR'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { cantidad, ajuste } = req.body;

      if (cantidad === undefined && ajuste === undefined) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Debe especificar cantidad o ajuste', 400);
      }

      try {
        const prodRes = await db.query(`SELECT * FROM producto WHERE id = $1;`, [id]);
        if (!prodRes.rows || prodRes.rows.length === 0) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }
        const prod = prodRes.rows[0];

        // Validar área de preparación
        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          if (prod.es_combo || prod.destino !== req.usuario.rol) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        // Si es combo, no admite stock directo
        if (prod.es_combo) {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Los combos no admiten control de stock directo', 403);
        }

        // Corrección silenciosa (CU22): redondear decimales y negativos a 0
        let stockFinal = 0;
        if (cantidad !== undefined) {
          const num = Math.round(Number(cantidad));
          stockFinal = num < 0 ? 0 : num;
        } else {
          const actual = prod.stock_cantidad === null ? 0 : Number(prod.stock_cantidad);
          const adj = Math.round(Number(ajuste));
          stockFinal = Math.max(0, actual + adj);
        }

        // Si queda en 0, pasa automáticamente a no disponible
        let dispFinal = prod.disponible;
        if (stockFinal === 0) {
          dispFinal = false;
        } else if (stockFinal > 0 && prod.stock_cantidad === 0 && !prod.disponible) {
          dispFinal = true;
        }

        const updateRes = await db.query(
          `UPDATE producto
           SET stock_cantidad = $1, disponible = $2
           WHERE id = $3
           RETURNING id, nombre, stock_cantidad, disponible, destino;`,
          [stockFinal, dispFinal, id]
        );
        const actualizado = updateRes.rows[0];

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', {
            producto_id: id,
            stock_cantidad: stockFinal,
            disponible: dispFinal,
          });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', {
            producto_id: id,
            stock_cantidad: stockFinal,
            disponible: dispFinal,
          });
          if (actualizado.destino) {
            tiempoReal.emitir(actualizado.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              stock_cantidad: stockFinal,
              disponible: dispFinal,
            });
          }
        }

        return res.json({
          id: actualizado.id,
          nombre: actualizado.nombre,
          stock_cantidad: actualizado.stock_cantidad,
          disponible: actualizado.disponible,
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        // Fallback en memoria
        const prod = (estadoMemoria.productos || []).find((p) => p.id === id);
        if (!prod) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }

        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          if (prod.es_combo || prod.destino !== req.usuario.rol) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        if (prod.es_combo) {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Los combos no admiten control de stock directo', 403);
        }

        let stockFinal = 0;
        if (cantidad !== undefined) {
          const num = Math.round(Number(cantidad));
          stockFinal = num < 0 ? 0 : num;
        } else {
          const actual = prod.stock_cantidad === null ? 0 : Number(prod.stock_cantidad);
          const adj = Math.round(Number(ajuste));
          stockFinal = Math.max(0, actual + adj);
        }

        let dispFinal = prod.disponible;
        if (stockFinal === 0) {
          dispFinal = false;
        } else if (stockFinal > 0 && prod.stock_cantidad === 0 && !prod.disponible) {
          dispFinal = true;
        }

        prod.stock_cantidad = stockFinal;
        prod.disponible = dispFinal;

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', {
            producto_id: id,
            stock_cantidad: stockFinal,
            disponible: dispFinal,
          });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', {
            producto_id: id,
            stock_cantidad: stockFinal,
            disponible: dispFinal,
          });
          if (prod.destino) {
            tiempoReal.emitir(prod.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              stock_cantidad: stockFinal,
              disponible: dispFinal,
            });
          }
        }

        return res.json({
          id: prod.id,
          nombre: prod.nombre,
          stock_cantidad: prod.stock_cantidad,
          disponible: prod.disponible,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/disponibilidad : Bloqueo o habilitación manual (RF9 / CU22)
  // Rol: COCINA, BAR, ADMIN
  router.patch('/:id/disponibilidad', autenticar, exigirRol('ADMIN', 'COCINA', 'BAR'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { disponible } = req.body;

      if (disponible === undefined) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'El campo disponible es requerido', 400);
      }

      try {
        const prodRes = await db.query(`SELECT * FROM producto WHERE id = $1;`, [id]);
        if (!prodRes.rows || prodRes.rows.length === 0) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }
        const prod = prodRes.rows[0];

        // Validar área de preparación (los combos solo los bloquea ADMIN)
        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          if (prod.es_combo || prod.destino !== req.usuario.rol) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        const dispBool = Boolean(disponible);

        // Validación de restricción: stock 0 no puede estar disponible
        if (dispBool && prod.stock_cantidad !== null && Number(prod.stock_cantidad) <= 0) {
          throw new ErrorNegocio(
            'DATOS_INVALIDOS',
            'Un producto con stock en cero no puede habilitarse sin recargar stock',
            422
          );
        }

        const updateRes = await db.query(
          `UPDATE producto
           SET disponible = $1
           WHERE id = $2
           RETURNING id, nombre, disponible, stock_cantidad, destino;`,
          [dispBool, id]
        );
        const actualizado = updateRes.rows[0];

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', { producto_id: id, disponible: dispBool });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', { producto_id: id, disponible: dispBool });
          if (actualizado.destino) {
            tiempoReal.emitir(actualizado.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              disponible: dispBool,
            });
          }
        }

        return res.json({
          id: actualizado.id,
          nombre: actualizado.nombre,
          disponible: actualizado.disponible,
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        // Fallback en memoria
        const prod = (estadoMemoria.productos || []).find((p) => p.id === id);
        if (!prod) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }

        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          if (prod.es_combo || prod.destino !== req.usuario.rol) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        const dispBool = Boolean(disponible);
        if (dispBool && prod.stock_cantidad !== null && Number(prod.stock_cantidad) <= 0) {
          throw new ErrorNegocio(
            'DATOS_INVALIDOS',
            'Un producto con stock en cero no puede habilitarse sin recargar stock',
            422
          );
        }

        prod.disponible = dispBool;

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', { producto_id: id, disponible: dispBool });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', { producto_id: id, disponible: dispBool });
          if (prod.destino) {
            tiempoReal.emitir(prod.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              disponible: dispBool,
            });
          }
        }

        return res.json({
          id: prod.id,
          nombre: prod.nombre,
          disponible: prod.disponible,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id/anticipada : Habilita o deshabilita la preparación anticipada para un producto (RF6)
  // Rol: COCINA, BAR, ADMIN
  router.patch('/:id/anticipada', autenticar, exigirRol('ADMIN', 'COCINA', 'BAR'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { permite_anticipada } = req.body;

      if (permite_anticipada === undefined) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'El campo permite_anticipada es requerido', 400);
      }

      try {
        const prodRes = await db.query(`SELECT * FROM producto WHERE id = $1;`, [id]);
        if (!prodRes.rows || prodRes.rows.length === 0) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }
        const prod = prodRes.rows[0];

        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          if (prod.es_combo || prod.destino !== req.usuario.rol) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        const antBool = Boolean(permite_anticipada);
        const updateRes = await db.query(
          `UPDATE producto
           SET permite_anticipada = $1
           WHERE id = $2
           RETURNING id, nombre, permite_anticipada, destino;`,
          [antBool, id]
        );
        const actualizado = updateRes.rows[0];

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', { producto_id: id, permite_anticipada: antBool });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', { producto_id: id, permite_anticipada: antBool });
          if (actualizado.destino) {
            tiempoReal.emitir(actualizado.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              permite_anticipada: antBool,
            });
          }
        }

        return res.json({
          id: actualizado.id,
          nombre: actualizado.nombre,
          permite_anticipada: actualizado.permite_anticipada,
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        const prod = (estadoMemoria.productos || []).find((p) => p.id === id);
        if (!prod) {
          throw new ErrorNegocio('PRODUCTO_NO_ENCONTRADO', 'Producto no encontrado', 404);
        }

        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          if (prod.es_combo || prod.destino !== req.usuario.rol) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        const antBool = Boolean(permite_anticipada);
        prod.permite_anticipada = antBool;

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'producto.disponibilidad', { producto_id: id, permite_anticipada: antBool });
          tiempoReal.emitir('meseros', 'producto.disponibilidad', { producto_id: id, permite_anticipada: antBool });
          if (prod.destino) {
            tiempoReal.emitir(prod.destino.toLowerCase(), 'producto.disponibilidad', {
              producto_id: id,
              permite_anticipada: antBool,
            });
          }
        }

        return res.json({
          id: prod.id,
          nombre: prod.nombre,
          permite_anticipada: prod.permite_anticipada,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
