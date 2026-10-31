import express from 'express';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas de Opciones de Personalización y Restricciones (RF3).
 * Base: /api/v1/opciones
 */
export function rutaOpciones(db, { secreto = config.jwtSecreto, tiempoReal = null } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Catálogo de opciones con restricciones y productos que la usan (usada_en)
  router.get('/', autenticar, async (req, res, next) => {
    try {
      const { destino } = req.query;

      try {
        const sqlOpciones = `
          SELECT id, nombre, tipo, precio_extra, disponible
          FROM opcion
          ORDER BY id ASC;
        `;
        const resOpciones = await db.query(sqlOpciones);
        const opciones = resOpciones.rows || [];

        // Restricciones bidireccionales
        const sqlRestricciones = `
          SELECT opcion_a_id, opcion_b_id FROM restriccion_opcion;
        `;
        const resRestricciones = await db.query(sqlRestricciones);
        const mapaRestricciones = new Map();
        for (const r of resRestricciones.rows || []) {
          if (!mapaRestricciones.has(r.opcion_a_id)) mapaRestricciones.set(r.opcion_a_id, []);
          if (!mapaRestricciones.has(r.opcion_b_id)) mapaRestricciones.set(r.opcion_b_id, []);
          mapaRestricciones.get(r.opcion_a_id).push(r.opcion_b_id);
          mapaRestricciones.get(r.opcion_b_id).push(r.opcion_a_id);
        }

        // Productos que usan cada opción (usada_en)
        const sqlUsadaEn = `
          SELECT 
            po.opcion_id,
            p.id AS producto_id,
            p.nombre AS producto_nombre,
            p.destino
          FROM producto_opcion po
          JOIN producto p ON p.id = po.producto_id
          ORDER BY p.nombre ASC;
        `;
        const resUsadaEn = await db.query(sqlUsadaEn);
        const mapaUsadaEn = new Map();
        for (const u of resUsadaEn.rows || []) {
          if (!mapaUsadaEn.has(u.opcion_id)) mapaUsadaEn.set(u.opcion_id, []);
          mapaUsadaEn.get(u.opcion_id).push({
            id: u.producto_id,
            nombre: u.producto_nombre,
            destino: u.destino,
          });
        }

        let listaFinal = opciones.map((o) => {
          const restr = mapaRestricciones.get(o.id) || [];
          const usada = mapaUsadaEn.get(o.id) || [];
          return {
            id: o.id,
            nombre: o.nombre,
            tipo: o.tipo,
            precio_extra: Number(o.precio_extra),
            disponible: o.disponible,
            restricciones: restr,
            usada_en: usada,
          };
        });

        // Filtrado por destino si se especifica (COCINA o BAR)
        if (destino) {
          const destUpper = destino.toUpperCase();
          listaFinal = listaFinal.filter((o) =>
            o.usada_en.some((p) => p.destino === destUpper)
          );
        }

        return res.json(listaFinal);
      } catch (dbErr) {
        // Fallback en memoria compartido
        const opciones = estadoMemoria.opciones || [];
        const restricciones = estadoMemoria.restriccionesOpciones || [];
        const productoOpciones = estadoMemoria.productoOpciones || [];
        const productos = estadoMemoria.productos || [];

        const mapaRestricciones = new Map();
        for (const r of restricciones) {
          if (!mapaRestricciones.has(r.opcion_a_id)) mapaRestricciones.set(r.opcion_a_id, []);
          if (!mapaRestricciones.has(r.opcion_b_id)) mapaRestricciones.set(r.opcion_b_id, []);
          mapaRestricciones.get(r.opcion_a_id).push(r.opcion_b_id);
          mapaRestricciones.get(r.opcion_b_id).push(r.opcion_a_id);
        }

        const mapaUsadaEn = new Map();
        for (const po of productoOpciones) {
          const prod = productos.find((p) => p.id === po.producto_id);
          if (prod) {
            if (!mapaUsadaEn.has(po.opcion_id)) mapaUsadaEn.set(po.opcion_id, []);
            mapaUsadaEn.get(po.opcion_id).push({
              id: prod.id,
              nombre: prod.nombre,
              destino: prod.destino,
            });
          }
        }

        let listaFinal = opciones.map((o) => {
          const restr = mapaRestricciones.get(o.id) || [];
          const usada = mapaUsadaEn.get(o.id) || [];
          return {
            id: o.id,
            nombre: o.nombre,
            tipo: o.tipo,
            precio_extra: Number(o.precio_extra || 0),
            disponible: o.disponible,
            restricciones: restr,
            usada_en: usada,
          };
        });

        if (destino) {
          const destUpper = destino.toUpperCase();
          listaFinal = listaFinal.filter((o) =>
            o.usada_en.some((p) => p.destino === destUpper)
          );
        }

        return res.json(listaFinal);
      }
    } catch (err) {
      next(err);
    }
  });

  // GET /restricciones : Listado de restricciones de opciones con nombres (RF3 / A3c)
  router.get('/restricciones', autenticar, async (req, res, next) => {
    try {
      try {
        const sql = `
          SELECT 
            r.opcion_a_id, 
            r.opcion_b_id, 
            COALESCE(r.motivo, 'Opciones mutuamente excluyentes') AS motivo,
            oa.nombre AS opcion_a_nombre, 
            oa.tipo AS opcion_a_tipo,
            ob.nombre AS opcion_b_nombre,
            ob.tipo AS opcion_b_tipo
          FROM restriccion_opcion r
          JOIN opcion_personalizacion oa ON oa.id = r.opcion_a_id
          JOIN opcion_personalizacion ob ON ob.id = r.opcion_b_id
          ORDER BY oa.nombre ASC, ob.nombre ASC;
        `;
        const resQuery = await db.query(sql);
        const filas = (resQuery.rows || []).map((r) => ({
          id: `${r.opcion_a_id}-${r.opcion_b_id}`,
          opcion_a_id: Number(r.opcion_a_id),
          opcion_a_nombre: r.opcion_a_nombre,
          opcion_a_tipo: r.opcion_a_tipo,
          opcion_b_id: Number(r.opcion_b_id),
          opcion_b_nombre: r.opcion_b_nombre,
          opcion_b_tipo: r.opcion_b_tipo,
          motivo: r.motivo,
          activo: true,
        }));
        return res.json(filas);
      } catch (dbErr) {
        // Fallback en memoria
        const restricciones = estadoMemoria.restriccionesOpciones || [];
        const opciones = estadoMemoria.opciones || [];

        const lista = restricciones.map((r, idx) => {
          const opA = opciones.find((o) => o.id === r.opcion_a_id) || { id: r.opcion_a_id, nombre: `Opción ${r.opcion_a_id}` };
          const opB = opciones.find((o) => o.id === r.opcion_b_id) || { id: r.opcion_b_id, nombre: `Opción ${r.opcion_b_id}` };
          return {
            id: r.id || `${r.opcion_a_id}-${r.opcion_b_id}`,
            opcion_a_id: Number(r.opcion_a_id),
            opcion_a_nombre: opA.nombre,
            opcion_a_tipo: opA.tipo || 'PREFERENCIA',
            opcion_b_id: Number(r.opcion_b_id),
            opcion_b_nombre: opB.nombre,
            opcion_b_tipo: opB.tipo || 'PREFERENCIA',
            motivo: r.motivo || 'Opciones mutuamente excluyentes',
            activo: r.activo !== false,
          };
        });

        return res.json(lista);
      }
    } catch (err) {
      next(err);
    }
  });

  // POST /restricciones : Registra una restricción / combinación prohibida (RF3 / CU9)
  // Rol: ADMIN
  router.post('/restricciones', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const { opcion_a_id, opcion_b_id, motivo } = req.body || {};
      const a = Number(opcion_a_id);
      const b = Number(opcion_b_id);

      if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Debe especificar dos identificadores de opción válidos', 400);
      }

      if (a === b) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'No se puede restringir una opción consigo misma', 400);
      }

      const minId = Math.min(a, b);
      const maxId = Math.max(a, b);
      const motivoFinal = motivo && motivo.trim() ? motivo.trim().slice(0, 150) : 'Opciones mutuamente excluyentes';

      try {
        // Verificar existencia de ambas opciones
        const resA = await db.query('SELECT id, nombre, tipo FROM opcion_personalizacion WHERE id = $1', [minId]);
        const resB = await db.query('SELECT id, nombre, tipo FROM opcion_personalizacion WHERE id = $1', [maxId]);

        if (resA.rows.length === 0 || resB.rows.length === 0) {
          throw new ErrorNegocio('OPCION_NO_ENCONTRADA', 'Una o ambas opciones no existen en el catálogo', 404);
        }

        // Verificar si ya existe
        const resExiste = await db.query(
          'SELECT 1 FROM restriccion_opcion WHERE opcion_a_id = $1 AND opcion_b_id = $2',
          [minId, maxId]
        );
        if (resExiste.rows.length > 0) {
          throw new ErrorNegocio('RESTRICCION_DUPLICADA', 'La restricción entre estas opciones ya existe', 409);
        }

        await db.query(
          'INSERT INTO restriccion_opcion (opcion_a_id, opcion_b_id, motivo) VALUES ($1, $2, $3)',
          [minId, maxId, motivoFinal]
        );

        const nueva = {
          id: `${minId}-${maxId}`,
          opcion_a_id: minId,
          opcion_a_nombre: resA.rows[0].nombre,
          opcion_a_tipo: resA.rows[0].tipo,
          opcion_b_id: maxId,
          opcion_b_nombre: resB.rows[0].nombre,
          opcion_b_tipo: resB.rows[0].tipo,
          motivo: motivoFinal,
          activo: true,
        };

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'restriccion.creada', nueva);
          tiempoReal.emitir('meseros', 'restriccion.creada', nueva);
        }

        return res.status(201).json(nueva);
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        // Fallback en memoria
        const opciones = estadoMemoria.opciones || [];
        const opA = opciones.find((o) => o.id === minId);
        const opB = opciones.find((o) => o.id === maxId);

        if (!opA || !opB) {
          throw new ErrorNegocio('OPCION_NO_ENCONTRADA', 'Una o ambas opciones no existen en el catálogo', 404);
        }

        if (!estadoMemoria.restriccionesOpciones) {
          estadoMemoria.restriccionesOpciones = [];
        }

        const yaExiste = estadoMemoria.restriccionesOpciones.some(
          (r) => r.opcion_a_id === minId && r.opcion_b_id === maxId
        );
        if (yaExiste) {
          throw new ErrorNegocio('RESTRICCION_DUPLICADA', 'La restricción entre estas opciones ya existe', 409);
        }

        const nueva = {
          id: `${minId}-${maxId}`,
          opcion_a_id: minId,
          opcion_a_nombre: opA.nombre,
          opcion_a_tipo: opA.tipo || 'PREFERENCIA',
          opcion_b_id: maxId,
          opcion_b_nombre: opB.nombre,
          opcion_b_tipo: opB.tipo || 'PREFERENCIA',
          motivo: motivoFinal,
          activo: true,
        };

        estadoMemoria.restriccionesOpciones.push(nueva);

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'restriccion.creada', nueva);
          tiempoReal.emitir('meseros', 'restriccion.creada', nueva);
        }

        return res.status(201).json(nueva);
      }
    } catch (err) {
      next(err);
    }
  });

  // DELETE /restricciones/:a/:b (o /restricciones/:id) : Elimina una restricción de opciones (RF3)
  // Rol: ADMIN
  async function manejarEliminacionRestriccion(req, res, next) {
    try {
      let a;
      let b;

      if (req.params.a && req.params.b) {
        a = Number(req.params.a);
        b = Number(req.params.b);
      } else if (req.params.id && req.params.id.includes('-')) {
        const partes = req.params.id.split('-');
        a = Number(partes[0]);
        b = Number(partes[1]);
      } else if (req.query.opcion_a_id && req.query.opcion_b_id) {
        a = Number(req.query.opcion_a_id);
        b = Number(req.query.opcion_b_id);
      } else {
        const idNum = Number(req.params.id);
        const restr = (estadoMemoria.restriccionesOpciones || []).find((r) => r.id === idNum || r.id === req.params.id);
        if (restr) {
          a = restr.opcion_a_id;
          b = restr.opcion_b_id;
        }
      }

      if (!a || !b || isNaN(a) || isNaN(b)) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificadores de restricción inválidos', 400);
      }

      const minId = Math.min(a, b);
      const maxId = Math.max(a, b);

      try {
        const resDel = await db.query(
          'DELETE FROM restriccion_opcion WHERE opcion_a_id = $1 AND opcion_b_id = $2 RETURNING *',
          [minId, maxId]
        );
        if (resDel.rows.length === 0) {
          throw new ErrorNegocio('RESTRICCION_NO_ENCONTRADA', 'Restricción no encontrada', 404);
        }

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'restriccion.eliminada', { opcion_a_id: minId, opcion_b_id: maxId });
          tiempoReal.emitir('meseros', 'restriccion.eliminada', { opcion_a_id: minId, opcion_b_id: maxId });
        }

        return res.json({ mensaje: 'Restricción eliminada exitosamente', opcion_a_id: minId, opcion_b_id: maxId });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        const lista = estadoMemoria.restriccionesOpciones || [];
        const idx = lista.findIndex(
          (r) =>
            (r.opcion_a_id === minId && r.opcion_b_id === maxId) ||
            r.id === req.params.id ||
            r.id === `${minId}-${maxId}`
        );

        if (idx === -1) {
          throw new ErrorNegocio('RESTRICCION_NO_ENCONTRADA', 'Restricción no encontrada', 404);
        }

        lista.splice(idx, 1);

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'restriccion.eliminada', { opcion_a_id: minId, opcion_b_id: maxId });
          tiempoReal.emitir('meseros', 'restriccion.eliminada', { opcion_a_id: minId, opcion_b_id: maxId });
        }

        return res.json({ mensaje: 'Restricción eliminada exitosamente', opcion_a_id: minId, opcion_b_id: maxId });
      }
    } catch (err) {
      next(err);
    }
  }

  router.delete('/restricciones/:a/:b', autenticar, exigirRol('ADMIN'), manejarEliminacionRestriccion);
  router.delete('/restricciones/:id', autenticar, exigirRol('ADMIN'), manejarEliminacionRestriccion);

  // POST / : Crea una nueva opción en el catálogo único (RF3 / CU10)
  // Rol: ADMIN
  router.post('/', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const { nombre, tipo = 'PREFERENCIA', precio_extra = 0, disponible = true } = req.body || {};
      if (!nombre || !nombre.trim()) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'El nombre de la opción es obligatorio', 400);
      }

      const nombreLimpio = nombre.trim();
      const precioNum = Math.max(0, Number(precio_extra || 0));

      try {
        const resExiste = await db.query(
          'SELECT id FROM opcion_personalizacion WHERE LOWER(nombre) = LOWER($1)',
          [nombreLimpio]
        );
        if (resExiste.rows.length > 0) {
          throw new ErrorNegocio('OPCION_DUPLICADA', 'Ya existe una opción con este nombre', 409);
        }

        const resInsert = await db.query(
          `INSERT INTO opcion_personalizacion (nombre, tipo, precio_extra, disponible)
           VALUES ($1, $2, $3, $4)
           RETURNING id, nombre, tipo, precio_extra, disponible`,
          [nombreLimpio, tipo, precioNum, Boolean(disponible)]
        );
        const creada = resInsert.rows[0];

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'opcion.creada', creada);
        }

        return res.status(201).json({
          ...creada,
          precio_extra: Number(creada.precio_extra),
          restricciones: [],
          usada_en: [],
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        if (!estadoMemoria.opciones) estadoMemoria.opciones = [];
        const yaExiste = estadoMemoria.opciones.some(
          (o) => o.nombre.toLowerCase() === nombreLimpio.toLowerCase()
        );
        if (yaExiste) {
          throw new ErrorNegocio('OPCION_DUPLICADA', 'Ya existe una opción con este nombre', 409);
        }

        const nuevoId = (estadoMemoria.opciones.reduce((max, o) => Math.max(max, o.id), 0) || 0) + 1;
        const nueva = {
          id: nuevoId,
          nombre: nombreLimpio,
          tipo,
          precio_extra: precioNum,
          disponible: Boolean(disponible),
          restricciones: [],
          usada_en: [],
        };

        estadoMemoria.opciones.push(nueva);

        if (tiempoReal) {
          tiempoReal.emitir('admin', 'opcion.creada', nueva);
        }

        return res.status(201).json(nueva);
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id : Habilita o deshabilita una opción (RF3 / CU12)
  // Rol: ADMIN, COCINA, BAR
  router.patch('/:id', autenticar, exigirRol('ADMIN', 'COCINA', 'BAR'), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { disponible, nombre, tipo, precio_extra } = req.body;

      try {
        const resOp = await db.query(`SELECT * FROM opcion WHERE id = $1;`, [id]);
        if (!resOp.rows || resOp.rows.length === 0) {
          throw new ErrorNegocio('OPCION_NO_ENCONTRADA', 'Opción no encontrada', 404);
        }
        const opcionActual = resOp.rows[0];

        // Si es rol COCINA o BAR, validar DESTINO_NO_PERMITIDO si la opción no corresponde a su área
        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          const resDest = await db.query(
            `SELECT 1 FROM producto_opcion po
             JOIN producto p ON p.id = po.producto_id
             WHERE po.opcion_id = $1 AND p.destino = $2::destino_preparacion;`,
            [id, req.usuario.rol]
          );
          if (!resDest.rows || resDest.rows.length === 0) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        const nuevoDisp = disponible !== undefined ? Boolean(disponible) : opcionActual.disponible;
        const nuevoNombre = req.usuario.rol === 'ADMIN' && nombre ? nombre.trim() : opcionActual.nombre;
        const nuevoTipo = req.usuario.rol === 'ADMIN' && tipo ? tipo : opcionActual.tipo;
        const nuevoPrecioExtra =
          req.usuario.rol === 'ADMIN' && precio_extra !== undefined
            ? Number(precio_extra)
            : Number(opcionActual.precio_extra);

        const resUpdate = await db.query(
          `UPDATE opcion
           SET disponible = $1, nombre = $2, tipo = $3, precio_extra = $4
           WHERE id = $5
           RETURNING *;`,
          [nuevoDisp, nuevoNombre, nuevoTipo, nuevoPrecioExtra, id]
        );
        const actualizada = resUpdate.rows[0];

        if (disponible !== undefined && tiempoReal) {
          tiempoReal.emitir('admin', 'opcion.disponibilidad', { opcion_id: id, disponible: nuevoDisp });
          tiempoReal.emitir('meseros', 'opcion.disponibilidad', { opcion_id: id, disponible: nuevoDisp });
          tiempoReal.emitir('cocina', 'opcion.disponibilidad', { opcion_id: id, disponible: nuevoDisp });
          tiempoReal.emitir('bar', 'opcion.disponibilidad', { opcion_id: id, disponible: nuevoDisp });
        }

        return res.json({
          ...actualizada,
          precio_extra: Number(actualizada.precio_extra),
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        // Fallback en memoria
        const op = (estadoMemoria.opciones || []).find((o) => o.id === id);
        if (!op) {
          throw new ErrorNegocio('OPCION_NO_ENCONTRADA', 'Opción no encontrada', 404);
        }

        if (req.usuario.rol === 'COCINA' || req.usuario.rol === 'BAR') {
          const prodsQueLaUsan = (estadoMemoria.productoOpciones || [])
            .filter((po) => po.opcion_id === id)
            .map((po) => (estadoMemoria.productos || []).find((p) => p.id === po.producto_id))
            .filter(Boolean);

          const tieneDestino = prodsQueLaUsan.some((p) => p.destino === req.usuario.rol);
          if (!tieneDestino) {
            throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
          }
        }

        if (disponible !== undefined) op.disponible = Boolean(disponible);
        if (req.usuario.rol === 'ADMIN') {
          if (nombre) op.nombre = nombre.trim();
          if (tipo) op.tipo = tipo;
          if (precio_extra !== undefined) op.precio_extra = Number(precio_extra);
        }

        if (disponible !== undefined && tiempoReal) {
          tiempoReal.emitir('admin', 'opcion.disponibilidad', { opcion_id: id, disponible: op.disponible });
          tiempoReal.emitir('meseros', 'opcion.disponibilidad', { opcion_id: id, disponible: op.disponible });
          tiempoReal.emitir('cocina', 'opcion.disponibilidad', { opcion_id: id, disponible: op.disponible });
          tiempoReal.emitir('bar', 'opcion.disponibilidad', { opcion_id: id, disponible: op.disponible });
        }

        return res.json(op);
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
