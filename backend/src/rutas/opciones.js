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
