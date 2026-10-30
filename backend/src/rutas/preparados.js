import { Router } from 'express';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { ErrorNegocio } from '../errores.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas para gestión y consulta de productos preparados (RF10 · CU19, CU20, CU21).
 */
export function rutaPreparados(db, { tiempoReal = null, secreto = config.jwtSecreto } = {}) {
  const router = Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  /**
   * GET /api/v1/preparados?producto_id=&destino=
   * Consulta las unidades de productos ya preparados disponibles.
   * Accesible para cualquier usuario autenticado (MESERO, COCINA, BAR, ADMIN y CAJA).
   */
  router.get('/', autenticar, async (req, res, siguiente) => {
    try {
      const horaServidor = new Date().toISOString();
      const productoIdFiltro = req.query.producto_id ? Number(req.query.producto_id) : null;
      const destinoFiltro = req.query.destino ? req.query.destino.toUpperCase() : null;

      try {
        let sql = `
          SELECT pp.id, pp.producto_id, p.nombre AS producto_nombre, p.destino, p.precio,
                 pp.registrado_en, pp.origen, pp.estado
          FROM producto_preparado pp
          JOIN producto p ON p.id = pp.producto_id
          WHERE pp.estado = 'DISPONIBLE'
        `;
        const params = [];

        if (productoIdFiltro) {
          params.push(productoIdFiltro);
          sql += ` AND pp.producto_id = $${params.length}`;
        }

        if (destinoFiltro) {
          params.push(destinoFiltro);
          sql += ` AND p.destino = $${params.length}`;
        }

        sql += ` ORDER BY pp.registrado_en ASC`;

        const resultado = await db.query(sql, params);
        const ahoraMs = new Date(horaServidor).getTime();

        const preparados = resultado.rows.map((row) => {
          const regMs = new Date(row.registrado_en).getTime();
          const minutos = Math.max(0, Math.floor((ahoraMs - regMs) / 60000));
          return {
            id: row.id,
            producto_id: row.producto_id,
            producto_nombre: row.producto_nombre,
            destino: row.destino,
            precio: Number(row.precio),
            registrado_en: row.registrado_en,
            minutos_preparado: minutos,
            origen: row.origen,
            estado: row.estado,
          };
        });

        return res.json({
          hora_servidor: horaServidor,
          preparados,
          total: preparados.length,
        });
      } catch (errorDb) {
        if (errorDb instanceof ErrorNegocio) throw errorDb;

        // Fallback en memoria
        const ahoraMs = new Date(horaServidor).getTime();
        let lista = (estadoMemoria.productosPreparados || []).filter((pp) => pp.estado === 'DISPONIBLE');

        if (productoIdFiltro) {
          lista = lista.filter((pp) => pp.producto_id === productoIdFiltro);
        }

        const preparados = lista
          .map((pp) => {
            const prod = (estadoMemoria.productos || []).find((p) => p.id === pp.producto_id);
            if (!prod) return null;
            if (destinoFiltro && prod.destino !== destinoFiltro) return null;

            const regMs = new Date(pp.registrado_en).getTime();
            const minutos = Math.max(0, Math.floor((ahoraMs - regMs) / 60000));

            return {
              id: pp.id,
              producto_id: pp.producto_id,
              producto_nombre: prod.nombre,
              destino: prod.destino,
              precio: Number(prod.precio),
              registrado_en: pp.registrado_en,
              minutos_preparado: minutos,
              origen: pp.origen,
              estado: pp.estado,
            };
          })
          .filter(Boolean)
          .sort((a, b) => new Date(a.registrado_en) - new Date(b.registrado_en));

        return res.json({
          hora_servidor: horaServidor,
          preparados,
          total: preparados.length,
        });
      }
    } catch (err) {
      siguiente(err);
    }
  });

  /**
   * POST /api/v1/preparados
   * Registra una o más unidades de un producto ya preparado (CU19).
   * Solo COCINA, BAR y ADMIN.
   */
  router.post('/', autenticar, exigirRol('COCINA', 'BAR', 'ADMIN'), async (req, res, siguiente) => {
    try {
      const { producto_id, cantidad = 1 } = req.body;
      const prodId = Number(producto_id);
      const cant = Number(cantidad);

      if (isNaN(prodId) || prodId <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de producto inválido', 400);
      }

      if (isNaN(cant) || cant < 1 || !Number.isInteger(cant)) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'La cantidad debe ser un número entero mayor o igual a 1', 400);
      }

      const rolUsuario = req.usuario.rol;
      const horaServidor = new Date().toISOString();

      try {
        const resProd = await db.query(
          `SELECT id, nombre, destino, es_combo, disponible FROM producto WHERE id = $1`,
          [prodId]
        );

        if (resProd.rows.length === 0) {
          throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', 'El producto no existe', 404);
        }

        const prod = resProd.rows[0];

        if (prod.es_combo) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'Los combos no se pueden registrar directamente como producto preparado', 422);
        }

        // Control de área (CU12, CU19)
        if (rolUsuario === 'COCINA' && prod.destino !== 'COCINA') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }
        if (rolUsuario === 'BAR' && prod.destino !== 'BAR') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }

        const unidadesCreadas = [];
        for (let i = 0; i < cant; i++) {
          const resIns = await db.query(
            `INSERT INTO producto_preparado (producto_id, origen, registrado_por, registrado_en, estado)
             VALUES ($1, 'REGISTRO_DIRECTO', $2, $3, 'DISPONIBLE')
             RETURNING id, producto_id, origen, registrado_en, estado`,
            [prodId, req.usuario.id, horaServidor]
          );
          unidadesCreadas.push({
            ...resIns.rows[0],
            producto_nombre: prod.nombre,
            destino: prod.destino,
          });
        }

        // Notificar en tiempo real a meseros y al área correspondiente
        tiempoReal?.emitir(['meseros', prod.destino.toLowerCase()], 'preparado.nuevo', {
          producto_id: prod.id,
          producto_nombre: prod.nombre,
          destino: prod.destino,
          cantidad: cant,
          preparados: unidadesCreadas,
          registrado_en: horaServidor,
        });

        return res.status(201).json({
          mensaje: 'Unidades preparadas registradas exitosamente',
          cantidad: cant,
          unidades: unidadesCreadas,
        });
      } catch (errorDb) {
        if (errorDb instanceof ErrorNegocio) throw errorDb;

        // Fallback en memoria
        const prod = (estadoMemoria.productos || []).find((p) => p.id === prodId);
        if (!prod) {
          throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', 'El producto no existe', 404);
        }

        if (prod.es_combo) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'Los combos no se pueden registrar directamente como producto preparado', 422);
        }

        if (rolUsuario === 'COCINA' && prod.destino !== 'COCINA') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }
        if (rolUsuario === 'BAR' && prod.destino !== 'BAR') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }

        if (!estadoMemoria.productosPreparados) estadoMemoria.productosPreparados = [];

        const unidadesCreadas = [];
        for (let i = 0; i < cant; i++) {
          const nuevoId = (estadoMemoria.productosPreparados.reduce((max, pp) => Math.max(max, pp.id), 0) || 0) + 1;
          const unidadObj = {
            id: nuevoId,
            producto_id: prod.id,
            producto_nombre: prod.nombre,
            destino: prod.destino,
            origen: 'REGISTRO_DIRECTO',
            cancelacion_id: null,
            registrado_por: req.usuario.id,
            registrado_en: horaServidor,
            estado: 'DISPONIBLE',
            item_asignado_id: null,
            asignado_en: null,
          };
          estadoMemoria.productosPreparados.push(unidadObj);
          unidadesCreadas.push(unidadObj);
        }

        tiempoReal?.emitir(['meseros', prod.destino.toLowerCase()], 'preparado.nuevo', {
          producto_id: prod.id,
          producto_nombre: prod.nombre,
          destino: prod.destino,
          cantidad: cant,
          preparados: unidadesCreadas,
          registrado_en: horaServidor,
        });

        return res.status(201).json({
          mensaje: 'Unidades preparadas registradas exitosamente',
          cantidad: cant,
          unidades: unidadesCreadas,
        });
      }
    } catch (err) {
      siguiente(err);
    }
  });

  /**
   * POST /api/v1/preparados/:id/baja (o DELETE /api/v1/preparados/:id)
   * Da de baja o descarta una unidad de producto preparado echada a perder (Hueco 3 / RF10).
   * Solo COCINA, BAR y ADMIN.
   */
  const manejarBajaPreparado = async (req, res, siguiente) => {
    try {
      const preparadoId = Number(req.params.id);
      if (isNaN(preparadoId) || preparadoId <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de preparado inválido', 400);
      }

      const { motivo } = req.body || {};
      const rolUsuario = req.usuario.rol;

      try {
        const resPrep = await db.query(
          `SELECT pp.id, pp.producto_id, pp.estado, p.destino, p.nombre AS producto_nombre
           FROM producto_preparado pp
           JOIN producto p ON p.id = pp.producto_id
           WHERE pp.id = $1`,
          [preparadoId]
        );

        if (resPrep.rows.length === 0) {
          throw new ErrorNegocio('PREPARADO_NO_ENCONTRADO', 'Producto preparado no encontrado', 404);
        }

        const prep = resPrep.rows[0];

        // Control de área (CU12, CU19)
        if (rolUsuario === 'COCINA' && prep.destino !== 'COCINA') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }
        if (rolUsuario === 'BAR' && prep.destino !== 'BAR') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }

        if (prep.estado !== 'DISPONIBLE') {
          throw new ErrorNegocio('PREPARADO_NO_DISPONIBLE', 'Solo se pueden dar de baja unidades en estado disponible', 409);
        }

        await db.query(
          `UPDATE producto_preparado SET estado = 'DESCARTADO' WHERE id = $1`,
          [preparadoId]
        );

        tiempoReal?.emitir(['meseros', prep.destino.toLowerCase(), 'admin'], 'preparado.descartado', {
          id: prep.id,
          producto_id: prep.producto_id,
          producto_nombre: prep.producto_nombre,
          destino: prep.destino,
          motivo: motivo || 'Descartado por área',
        });

        return res.json({
          mensaje: 'Unidad preparada descartada exitosamente',
          id: prep.id,
          estado: 'DESCARTADO',
        });
      } catch (errorDb) {
        if (errorDb instanceof ErrorNegocio) throw errorDb;

        // Fallback en memoria
        const prep = (estadoMemoria.productosPreparados || []).find((p) => p.id === preparadoId);
        if (!prep) {
          throw new ErrorNegocio('PREPARADO_NO_ENCONTRADO', 'Producto preparado no encontrado', 404);
        }

        const prod = (estadoMemoria.productos || []).find((p) => p.id === prep.producto_id);
        const destino = prod ? prod.destino : 'COCINA';

        if (rolUsuario === 'COCINA' && destino !== 'COCINA') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }
        if (rolUsuario === 'BAR' && destino !== 'BAR') {
          throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
        }

        if (prep.estado !== 'DISPONIBLE') {
          throw new ErrorNegocio('PREPARADO_NO_DISPONIBLE', 'Solo se pueden dar de baja unidades en estado disponible', 409);
        }

        prep.estado = 'DESCARTADO';

        tiempoReal?.emitir(['meseros', destino.toLowerCase(), 'admin'], 'preparado.descartado', {
          id: prep.id,
          producto_id: prep.producto_id,
          producto_nombre: prod?.nombre || 'Producto',
          destino,
          motivo: motivo || 'Descartado por área',
        });

        return res.json({
          mensaje: 'Unidad preparada descartada exitosamente',
          id: prep.id,
          estado: 'DESCARTADO',
        });
      }
    } catch (err) {
      siguiente(err);
    }
  };

  router.post('/:id/baja', autenticar, exigirRol('COCINA', 'BAR', 'ADMIN'), manejarBajaPreparado);
  router.delete('/:id', autenticar, exigirRol('COCINA', 'BAR', 'ADMIN'), manejarBajaPreparado);

  return router;
}
