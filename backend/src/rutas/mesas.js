import express from 'express';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas de Mesas y Reasignación temporal (RF2 / CU7 y CU8).
 * Base: /api/v1/mesas
 */
export function rutaMesas(db, { tiempoReal = null, secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Lista de mesas con estado calculado y asignación de mesero (CU8)
  router.get('/', autenticar, async (req, res, next) => {
    try {
      const sql = `
        SELECT 
          m.id,
          m.numero,
          m.sector_id,
          s.nombre AS sector_nombre,
          COALESCE(em.estado, 'DISPONIBLE') AS estado,
          u_tit.id AS mesero_titular_id,
          u_tit.nombre_completo AS mesero_titular_nombre,
          rm.id AS reasignacion_id,
          rm.mesero_id AS reasignacion_mesero_id,
          u_reas.nombre_completo AS reasignacion_mesero_nombre,
          rm.motivo AS reasignacion_motivo,
          rm.vigente_desde AS reasignacion_desde
        FROM mesa m
        LEFT JOIN sector s ON s.id = m.sector_id
        LEFT JOIN v_estado_mesa em ON em.mesa_id = m.id
        LEFT JOIN asignacion_sector a ON a.sector_id = m.sector_id AND a.vigente_hasta IS NULL
        LEFT JOIN usuario u_tit ON u_tit.id = a.mesero_id
        LEFT JOIN reasignacion_mesa rm ON rm.mesa_id = m.id AND rm.vigente_hasta IS NULL
        LEFT JOIN usuario u_reas ON u_reas.id = rm.mesero_id
        ORDER BY m.numero ASC;
      `;

      const resultado = await db.query(sql);
      const mesas = resultado.rows.map((row) => ({
        id: row.id,
        numero: row.numero,
        sector_id: row.sector_id,
        sector_nombre: row.sector_nombre,
        estado: row.estado || 'DISPONIBLE',
        mesero_titular: row.mesero_titular_id
          ? { id: row.mesero_titular_id, nombre_completo: row.mesero_titular_nombre }
          : null,
        mesero_actual: row.reasignacion_mesero_id
          ? { id: row.reasignacion_mesero_id, nombre_completo: row.reasignacion_mesero_nombre }
          : row.mesero_titular_id
          ? { id: row.mesero_titular_id, nombre_completo: row.mesero_titular_nombre }
          : null,
        reasignacion: row.reasignacion_id
          ? {
              id: row.reasignacion_id,
              mesero_id: row.reasignacion_mesero_id,
              mesero_nombre: row.reasignacion_mesero_nombre,
              motivo: row.reasignacion_motivo,
              vigente_desde: row.reasignacion_desde,
            }
          : null,
      }));

      res.json(mesas);
    } catch (error) {
      // Fallback para entornos sin conexión activa a BD
      const mesas = estadoMemoria.mesas.map((m) => {
        const sector = estadoMemoria.sectores.find((s) => s.id === m.sector_id);
        const asig = estadoMemoria.asignacionesSector.find((a) => a.sector_id === m.sector_id && !a.vigente_hasta);
        const reas = estadoMemoria.reasignacionesMesa.find((r) => r.mesa_id === m.id && !r.vigente_hasta);

        const titular = asig ? { id: asig.mesero_id, nombre_completo: asig.mesero_nombre } : null;
        const actual = reas ? { id: reas.mesero_id, nombre_completo: reas.mesero_nombre } : titular;

        return {
          id: m.id,
          numero: m.numero,
          sector_id: m.sector_id,
          sector_nombre: sector ? sector.nombre : null,
          estado: 'DISPONIBLE',
          mesero_titular: titular,
          mesero_actual: actual,
          reasignacion: reas
            ? {
                id: reas.id,
                mesero_id: reas.mesero_id,
                mesero_nombre: reas.mesero_nombre,
                motivo: reas.motivo,
                vigente_desde: reas.vigente_desde,
              }
            : null,
        };
      });

      res.json(mesas);
    }
  });

  // POST / : Alta de mesa (ADMIN)
  router.post('/', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const { numero, sector_id } = req.body || {};
      const num = Number(numero);
      if (!numero || isNaN(num) || num <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Número de mesa debe ser un entero positivo', 400);
      }

      try {
        const resultado = await db.query(
          'INSERT INTO mesa (numero, sector_id) VALUES ($1, $2) RETURNING id, numero, sector_id',
          [num, sector_id || null]
        );
        tiempoReal?.emitir('meseros', 'mesa.estado', { mesa_id: resultado.rows[0].id, numero: num, estado: 'DISPONIBLE' });
        return res.status(201).json(resultado.rows[0]);
      } catch (err) {
        if (err.code === '23505') {
          throw new ErrorNegocio('MESA_NUMERO_REPETIDO', 'Ya existe una mesa con ese número', 409);
        }
        // Fallback en memoria si la BD no está disponible
        if (estadoMemoria.mesas.some((m) => m.numero === num)) {
          throw new ErrorNegocio('MESA_NUMERO_REPETIDO', 'Ya existe una mesa con ese número', 409);
        }
        const nuevaMesa = { id: estadoMemoria.mesas.length + 1, numero: num, sector_id: sector_id || null, estado: 'DISPONIBLE' };
        estadoMemoria.mesas.push(nuevaMesa);
        tiempoReal?.emitir('meseros', 'mesa.estado', { mesa_id: nuevaMesa.id, numero: num, estado: 'DISPONIBLE' });
        return res.status(201).json(nuevaMesa);
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id : Edición de mesa (ADMIN)
  router.patch('/:id', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const mesaId = Number(req.params.id);
      const { numero, sector_id } = req.body || {};

      try {
        const campos = [];
        const valores = [];
        let contador = 1;

        if (numero !== undefined) {
          const num = Number(numero);
          if (isNaN(num) || num <= 0) {
            throw new ErrorNegocio('DATOS_INVALIDOS', 'Número de mesa debe ser un entero positivo', 400);
          }
          campos.push(`numero = $${contador++}`);
          valores.push(num);
        }

        if (sector_id !== undefined) {
          campos.push(`sector_id = $${contador++}`);
          valores.push(sector_id || null);
        }

        if (campos.length === 0) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'Debe proporcionar datos a actualizar', 400);
        }

        valores.push(mesaId);
        const sql = `UPDATE mesa SET ${campos.join(', ')} WHERE id = $${contador} RETURNING id, numero, sector_id`;
        const resDb = await db.query(sql, valores);

        if (!resDb.rows || resDb.rows.length === 0) {
          throw new ErrorNegocio('MESA_NO_ENCONTRADA', 'Mesa no encontrada', 404);
        }

        return res.json(resDb.rows[0]);
      } catch (err) {
        if (err.code === '23505') {
          throw new ErrorNegocio('MESA_NUMERO_REPETIDO', 'Ya existe una mesa con ese número', 409);
        }
        if (err instanceof ErrorNegocio) throw err;

        // Fallback en memoria
        const idx = estadoMemoria.mesas.findIndex((m) => m.id === mesaId);
        if (idx === -1) {
          throw new ErrorNegocio('MESA_NO_ENCONTRADA', 'Mesa no encontrada', 404);
        }
        if (numero !== undefined) {
          const num = Number(numero);
          if (estadoMemoria.mesas.some((m) => m.numero === num && m.id !== mesaId)) {
            throw new ErrorNegocio('MESA_NUMERO_REPETIDO', 'Ya existe una mesa con ese número', 409);
          }
          estadoMemoria.mesas[idx].numero = num;
        }
        if (sector_id !== undefined) {
          estadoMemoria.mesas[idx].sector_id = sector_id;
        }
        return res.json(estadoMemoria.mesas[idx]);
      }
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/reasignaciones : Reasignación temporal de mesa a otro mesero (CU7 / ADMIN, MESERO)
  router.post('/:id/reasignaciones', autenticar, exigirRol('ADMIN', 'MESERO'), async (req, res, next) => {
    try {
      const mesaId = Number(req.params.id);
      const { motivo = 'Apoyo en turno', mesero_id: meseroSolicitado } = req.body || {};

      let mesa = null;
      let meseroTitularId = null;
      let meseroActualId = null;
      let candidato = null;

      try {
        // Consultar mesa y asignación vigente
        const resMesa = await db.query(
          `SELECT m.id, m.numero, m.sector_id,
                  a.mesero_id AS titular_id,
                  rm.mesero_id AS reasignado_id
           FROM mesa m
           LEFT JOIN asignacion_sector a ON a.sector_id = m.sector_id AND a.vigente_hasta IS NULL
           LEFT JOIN reasignacion_mesa rm ON rm.mesa_id = m.id AND rm.vigente_hasta IS NULL
           WHERE m.id = $1`,
          [mesaId]
        );

        if (!resMesa.rows || resMesa.rows.length === 0) {
          throw new ErrorNegocio('MESA_NO_ENCONTRADA', 'Mesa no encontrada', 404);
        }

        mesa = resMesa.rows[0];
        meseroTitularId = mesa.titular_id;
        meseroActualId = mesa.reasignado_id || mesa.titular_id;

        if (meseroSolicitado) {
          const resUsuario = await db.query(
            `SELECT u.id, u.nombre_completo FROM usuario u
             JOIN rol r ON u.rol_id = r.id
             WHERE u.id = $1 AND r.nombre = 'MESERO' AND u.activo = TRUE`,
            [meseroSolicitado]
          );
          if (!resUsuario.rows || resUsuario.rows.length === 0) {
            throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Mesero no encontrado o inactivo', 404);
          }
          candidato = resUsuario.rows[0];
        } else {
          // El servidor elige un mesero disponible distinto al que atiende actualmente
          const resCandidatos = await db.query(
            `SELECT u.id, u.nombre_completo FROM usuario u
             JOIN rol r ON u.rol_id = r.id
             WHERE r.nombre = 'MESERO' AND u.activo = TRUE
               AND ($1::int IS NULL OR u.id <> $1)
             ORDER BY u.id ASC`,
            [meseroActualId || null]
          );

          if (!resCandidatos.rows || resCandidatos.rows.length === 0) {
            throw new ErrorNegocio('SIN_MESEROS_DISPONIBLES', 'No hay meseros disponibles', 409);
          }
          candidato = resCandidatos.rows[0];
        }

        // Registrar reasignación cerrando la anterior si existe
        await db.transaccion(async (cliente) => {
          await cliente.query(
            `UPDATE reasignacion_mesa SET vigente_hasta = now()
             WHERE mesa_id = $1 AND vigente_hasta IS NULL`,
            [mesaId]
          );

          const ins = await cliente.query(
            `INSERT INTO reasignacion_mesa (mesa_id, mesero_id, motivo, vigente_desde)
             VALUES ($1, $2, $3, now())
             RETURNING id, mesa_id, mesero_id, motivo, vigente_desde`,
            [mesaId, candidato.id, motivo]
          );
          mesa.nuevaReasignacion = ins.rows[0];
        });
      } catch (err) {
        if (err instanceof ErrorNegocio) throw err;

        // Fallback en memoria
        const m = estadoMemoria.mesas.find((item) => item.id === mesaId);
        if (!m) {
          throw new ErrorNegocio('MESA_NO_ENCONTRADA', 'Mesa no encontrada', 404);
        }
        mesa = m;

        const asig = estadoMemoria.asignacionesSector.find((a) => a.sector_id === m.sector_id && !a.vigente_hasta);
        const reasActual = estadoMemoria.reasignacionesMesa.find((r) => r.mesa_id === m.id && !r.vigente_hasta);
        const actualId = reasActual ? reasActual.mesero_id : asig ? asig.mesero_id : null;

        const meserosActivos = estadoMemoria.usuarios.filter((u) => u.rol === 'MESERO' && u.activo);

        if (meseroSolicitado) {
          candidato = meserosActivos.find((u) => u.id === Number(meseroSolicitado)) || null;
          if (!candidato) {
            throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Mesero no encontrado o inactivo', 404);
          }
        } else {
          candidato = meserosActivos.find((u) => u.id !== actualId) || null;
          if (!candidato) {
            throw new ErrorNegocio('SIN_MESEROS_DISPONIBLES', 'No hay meseros disponibles', 409);
          }
        }

        // Cerrar previa y agregar nueva
        estadoMemoria.reasignacionesMesa.forEach((r) => {
          if (r.mesa_id === mesaId && !r.vigente_hasta) {
            r.vigente_hasta = new Date().toISOString();
          }
        });

        const nueva = {
          id: estadoMemoria.reasignacionesMesa.length + 1,
          mesa_id: mesaId,
          mesero_id: candidato.id,
          mesero_nombre: candidato.nombre_completo,
          motivo,
          vigente_desde: new Date().toISOString(),
          vigente_hasta: null,
        };
        estadoMemoria.reasignacionesMesa.push(nueva);
        mesa.nuevaReasignacion = nueva;
      }

      // Notificar eventos WebSocket
      const payloadEvento = {
        tipo: 'reasignacion_mesa',
        mesa_id: mesaId,
        numero: mesa.numero,
        mesero_id: candidato.id,
        mesero_nombre: candidato.nombre_completo,
        motivo,
      };

      tiempoReal?.emitir('admin', 'sector.asignacion', payloadEvento);
      tiempoReal?.emitir('meseros', 'sector.asignacion', payloadEvento);
      tiempoReal?.emitir(`mesero:${candidato.id}`, 'sector.asignacion', payloadEvento);
      if (meseroTitularId && meseroTitularId !== candidato.id) {
        tiempoReal?.emitir(`mesero:${meseroTitularId}`, 'sector.asignacion', payloadEvento);
      }

      res.status(201).json({
        ok: true,
        mensaje: 'Mesa reasignada exitosamente',
        reasignacion: {
          id: mesa.nuevaReasignacion?.id,
          mesa_id: mesaId,
          mesero_id: candidato.id,
          mesero_nombre: candidato.nombre_completo,
          motivo,
          vigente_desde: mesa.nuevaReasignacion?.vigente_desde || new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id/reasignaciones/vigente : Terminar la reasignación temporal de una mesa (CU7)
  router.delete('/:id/reasignaciones/vigente', autenticar, exigirRol('ADMIN', 'MESERO'), async (req, res, next) => {
    try {
      const mesaId = Number(req.params.id);

      try {
        const resultado = await db.query(
          `UPDATE reasignacion_mesa
           SET vigente_hasta = now()
           WHERE mesa_id = $1 AND vigente_hasta IS NULL
           RETURNING id, mesero_id`,
          [mesaId]
        );

        const meseroPrevioId = resultado.rows?.[0]?.mesero_id;

        const payloadEvento = {
          tipo: 'termino_reasignacion',
          mesa_id: mesaId,
        };
        tiempoReal?.emitir('admin', 'sector.asignacion', payloadEvento);
        tiempoReal?.emitir('meseros', 'sector.asignacion', payloadEvento);
        if (meseroPrevioId) {
          tiempoReal?.emitir(`mesero:${meseroPrevioId}`, 'sector.asignacion', payloadEvento);
        }

        return res.json({
          ok: true,
          mensaje: 'Reasignación de mesa terminada exitosamente',
        });
      } catch (err) {
        // Fallback en memoria
        let meseroPrevioId = null;
        estadoMemoria.reasignacionesMesa.forEach((r) => {
          if (r.mesa_id === mesaId && !r.vigente_hasta) {
            r.vigente_hasta = new Date().toISOString();
            meseroPrevioId = r.mesero_id;
          }
        });

        const payloadEvento = {
          tipo: 'termino_reasignacion',
          mesa_id: mesaId,
        };
        tiempoReal?.emitir('admin', 'sector.asignacion', payloadEvento);
        tiempoReal?.emitir('meseros', 'sector.asignacion', payloadEvento);
        if (meseroPrevioId) {
          tiempoReal?.emitir(`mesero:${meseroPrevioId}`, 'sector.asignacion', payloadEvento);
        }

        return res.json({
          ok: true,
          mensaje: 'Reasignación de mesa terminada exitosamente',
        });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
