import express from 'express';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas de Sectores y Asignación de meseros (RF2 / CU4, CU5, CU6).
 * Base: /api/v1/sectores
 */
export function rutaSectores(db, { tiempoReal = null, secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Sectores con sus mesas y responsable vigente (ADMIN, MESERO)
  router.get('/', autenticar, exigirRol('ADMIN', 'MESERO'), async (req, res, next) => {
    try {
      try {
        const sql = `
          SELECT 
            s.id,
            s.nombre,
            a.mesero_id AS responsable_id,
            u.nombre_completo AS responsable_nombre,
            a.vigente_desde AS responsable_desde,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', m.id,
                  'numero', m.numero,
                  'estado', COALESCE(em.estado, 'DISPONIBLE'),
                  'mesero_actual', CASE 
                    WHEN u_reas.id IS NOT NULL THEN u_reas.nombre_completo
                    ELSE u.nombre_completo
                  END,
                  'reasignada', (rm.id IS NOT NULL)
                ) ORDER BY m.numero
              ) FILTER (WHERE m.id IS NOT NULL),
              '[]'::json
            ) AS mesas
          FROM sector s
          LEFT JOIN mesa m ON m.sector_id = s.id
          LEFT JOIN v_estado_mesa em ON em.mesa_id = m.id
          LEFT JOIN asignacion_sector a ON a.sector_id = s.id AND a.vigente_hasta IS NULL
          LEFT JOIN usuario u ON u.id = a.mesero_id
          LEFT JOIN reasignacion_mesa rm ON rm.mesa_id = m.id AND rm.vigente_hasta IS NULL
          LEFT JOIN usuario u_reas ON u_reas.id = rm.mesero_id
          GROUP BY s.id, s.nombre, a.mesero_id, u.nombre_completo, a.vigente_desde
          ORDER BY s.id ASC;
        `;

        const resultado = await db.query(sql);
        const sectores = resultado.rows.map((row) => ({
          id: row.id,
          nombre: row.nombre,
          total_mesas: Array.isArray(row.mesas) ? row.mesas.length : 0,
          mesas: row.mesas || [],
          responsable_vigente: row.responsable_id
            ? {
                id: row.responsable_id,
                nombre_completo: row.responsable_nombre,
                vigente_desde: row.responsable_desde,
              }
            : null,
        }));

        return res.json(sectores);
      } catch (dbErr) {
        // Fallback en memoria si PostgreSQL no responde
        const sectores = estadoMemoria.sectores.map((s) => {
          const asig = estadoMemoria.asignacionesSector.find((a) => a.sector_id === s.id && !a.vigente_hasta);
          const mesasSector = estadoMemoria.mesas
            .filter((m) => m.sector_id === s.id)
            .map((m) => ({
              id: m.id,
              numero: m.numero,
              estado: m.estado || 'DISPONIBLE',
              mesero_actual: asig ? asig.mesero_nombre : null,
              reasignada: false,
            }));

          return {
            id: s.id,
            nombre: s.nombre,
            total_mesas: mesasSector.length,
            mesas: mesasSector,
            responsable_vigente: asig
              ? {
                  id: asig.mesero_id,
                  nombre_completo: asig.mesero_nombre,
                  vigente_desde: asig.vigente_desde,
                }
              : null,
          };
        });

        return res.json(sectores);
      }
    } catch (err) {
      next(err);
    }
  });

  // POST / : Crea sector con nombre y mesas (CU4 / ADMIN)
  router.post('/', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const { nombre, mesas } = req.body || {};

      if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'El nombre del sector es requerido', 400);
      }

      if (!Array.isArray(mesas) || mesas.length === 0) {
        throw new ErrorNegocio('SECTOR_SIN_MESAS', 'El sector debe tener al menos una mesa', 422);
      }

      const nombreLimpio = nombre.trim();

      try {
        // Verificar si existe el nombre
        const rep = await db.query(
          'SELECT id FROM sector WHERE LOWER(nombre) = LOWER($1)',
          [nombreLimpio]
        );
        if (rep.rows && rep.rows.length > 0) {
          throw new ErrorNegocio('SECTOR_NOMBRE_REPETIDO', 'Ya existe un sector con ese nombre', 409);
        }

        let sectorCreado = null;
        await db.transaccion(async (cliente) => {
          const ins = await cliente.query(
            'INSERT INTO sector (nombre) VALUES ($1) RETURNING id, nombre',
            [nombreLimpio]
          );
          sectorCreado = ins.rows[0];

          // Asociar mesas por ID o por número
          await cliente.query(
            `UPDATE mesa SET sector_id = $1
             WHERE id = ANY($2::int[]) OR numero = ANY($2::int[])`,
            [sectorCreado.id, mesas.map(Number)]
          );
        });

        return res.status(201).json({
          id: sectorCreado.id,
          nombre: sectorCreado.nombre,
          mesas,
        });
      } catch (err) {
        if (err instanceof ErrorNegocio) throw err;
        if (err.code === '23505') {
          throw new ErrorNegocio('SECTOR_NOMBRE_REPETIDO', 'Ya existe un sector con ese nombre', 409);
        }

        // Fallback en memoria
        if (estadoMemoria.sectores.some((s) => s.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
          throw new ErrorNegocio('SECTOR_NOMBRE_REPETIDO', 'Ya existe un sector con ese nombre', 409);
        }

        const nuevoSector = {
          id: estadoMemoria.sectores.length + 1,
          nombre: nombreLimpio,
        };
        estadoMemoria.sectores.push(nuevoSector);

        mesas.forEach((mNum) => {
          const mesaExistente = estadoMemoria.mesas.find((m) => m.id === Number(mNum) || m.numero === Number(mNum));
          if (mesaExistente) {
            mesaExistente.sector_id = nuevoSector.id;
          }
        });

        return res.status(201).json({
          id: nuevoSector.id,
          nombre: nuevoSector.nombre,
          mesas,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id : Cambia nombre o mesas del sector (ADMIN)
  router.patch('/:id', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const sectorId = Number(req.params.id);
      const { nombre, mesas } = req.body || {};

      if (mesas !== undefined && (!Array.isArray(mesas) || mesas.length === 0)) {
        throw new ErrorNegocio('SECTOR_SIN_MESAS', 'El sector debe tener al menos una mesa', 422);
      }

      try {
        const existe = await db.query('SELECT id, nombre FROM sector WHERE id = $1', [sectorId]);
        if (!existe.rows || existe.rows.length === 0) {
          throw new ErrorNegocio('SECTOR_NO_ENCONTRADO', 'Sector no encontrado', 404);
        }

        if (nombre) {
          const rep = await db.query(
            'SELECT id FROM sector WHERE LOWER(nombre) = LOWER($1) AND id <> $2',
            [nombre.trim(), sectorId]
          );
          if (rep.rows && rep.rows.length > 0) {
            throw new ErrorNegocio('SECTOR_NOMBRE_REPETIDO', 'Ya existe un sector con ese nombre', 409);
          }
        }

        await db.transaccion(async (cliente) => {
          if (nombre) {
            await cliente.query('UPDATE sector SET nombre = $1 WHERE id = $2', [nombre.trim(), sectorId]);
          }

          if (mesas !== undefined) {
            // Desasociar mesas actuales del sector
            await cliente.query('UPDATE mesa SET sector_id = NULL WHERE sector_id = $1', [sectorId]);
            // Asociar nuevas mesas
            await cliente.query(
              `UPDATE mesa SET sector_id = $1
               WHERE id = ANY($2::int[]) OR numero = ANY($2::int[])`,
              [sectorId, mesas.map(Number)]
            );
          }
        });

        return res.json({
          id: sectorId,
          nombre: nombre ? nombre.trim() : existe.rows[0].nombre,
          mesas,
        });
      } catch (err) {
        if (err instanceof ErrorNegocio) throw err;
        if (err.code === '23505') {
          throw new ErrorNegocio('SECTOR_NOMBRE_REPETIDO', 'Ya existe un sector con ese nombre', 409);
        }

        // Fallback en memoria
        const s = estadoMemoria.sectores.find((item) => item.id === sectorId);
        if (!s) {
          throw new ErrorNegocio('SECTOR_NO_ENCONTRADO', 'Sector no encontrado', 404);
        }

        if (nombre) {
          const limpio = nombre.trim();
          if (estadoMemoria.sectores.some((item) => item.nombre.toLowerCase() === limpio.toLowerCase() && item.id !== sectorId)) {
            throw new ErrorNegocio('SECTOR_NOMBRE_REPETIDO', 'Ya existe un sector con ese nombre', 409);
          }
          s.nombre = limpio;
        }

        if (mesas !== undefined) {
          estadoMemoria.mesas.forEach((m) => {
            if (m.sector_id === sectorId) m.sector_id = null;
            if (mesas.includes(m.id) || mesas.includes(m.numero)) {
              m.sector_id = sectorId;
            }
          });
        }

        return res.json({
          id: s.id,
          nombre: s.nombre,
          mesas,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PUT /:id/asignacion : Asigna o cambia el mesero responsable del sector (CU5, CU6 / ADMIN)
  router.put('/:id/asignacion', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const sectorId = Number(req.params.id);
      const { mesero_id: meseroId } = req.body || {};

      let sectorNombre = `Sector ${sectorId}`;
      let meseroNombre = null;
      let meseroAnteriorId = null;

      try {
        const resSector = await db.query('SELECT id, nombre FROM sector WHERE id = $1', [sectorId]);
        if (!resSector.rows || resSector.rows.length === 0) {
          throw new ErrorNegocio('SECTOR_NO_ENCONTRADO', 'Sector no encontrado', 404);
        }
        sectorNombre = resSector.rows[0].nombre;

        if (meseroId) {
          const resUsuario = await db.query(
            `SELECT u.id, u.nombre_completo FROM usuario u
             JOIN rol r ON u.rol_id = r.id
             WHERE u.id = $1 AND r.nombre = 'MESERO' AND u.activo = TRUE`,
            [Number(meseroId)]
          );
          if (!resUsuario.rows || resUsuario.rows.length === 0) {
            throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Mesero no encontrado o inactivo', 404);
          }
          meseroNombre = resUsuario.rows[0].nombre_completo;
        }

        await db.transaccion(async (cliente) => {
          // Cerrar asignación anterior
          const cierre = await cliente.query(
            `UPDATE asignacion_sector
             SET vigente_hasta = now()
             WHERE sector_id = $1 AND vigente_hasta IS NULL
             RETURNING mesero_id`,
            [sectorId]
          );
          if (cierre.rows && cierre.rows.length > 0) {
            meseroAnteriorId = cierre.rows[0].mesero_id;
          }

          // Si se especificó un nuevo mesero, registrar asignación
          if (meseroId) {
            await cliente.query(
              `INSERT INTO asignacion_sector (sector_id, mesero_id, vigente_desde)
               VALUES ($1, $2, now())`,
              [sectorId, Number(meseroId)]
            );
          }
        });
      } catch (err) {
        if (err instanceof ErrorNegocio) throw err;

        // Fallback en memoria
        const s = estadoMemoria.sectores.find((item) => item.id === sectorId);
        if (!s) {
          throw new ErrorNegocio('SECTOR_NO_ENCONTRADO', 'Sector no encontrado', 404);
        }
        sectorNombre = s.nombre;

        const meserosActivos = estadoMemoria.usuarios.filter((u) => u.rol === 'MESERO' && u.activo);

        if (meseroId) {
          const m = meserosActivos.find((u) => u.id === Number(meseroId));
          if (!m) {
            throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Mesero no encontrado o inactivo', 404);
          }
          meseroNombre = m.nombre_completo;
        }

        estadoMemoria.asignacionesSector.forEach((a) => {
          if (a.sector_id === sectorId && !a.vigente_hasta) {
            a.vigente_hasta = new Date().toISOString();
            meseroAnteriorId = a.mesero_id;
          }
        });

        if (meseroId) {
          estadoMemoria.asignacionesSector.push({
            id: estadoMemoria.asignacionesSector.length + 1,
            sector_id: sectorId,
            mesero_id: Number(meseroId),
            mesero_nombre: meseroNombre,
            vigente_desde: new Date().toISOString(),
            vigente_hasta: null,
          });
        }
      }

      // Notificar eventos por WebSocket
      const payloadEvento = {
        tipo: 'asignacion_sector',
        sector_id: sectorId,
        sector_nombre: sectorNombre,
        mesero_id: meseroId ? Number(meseroId) : null,
        mesero_nombre: meseroNombre,
      };

      tiempoReal?.emitir('admin', 'sector.asignacion', payloadEvento);
      tiempoReal?.emitir('meseros', 'sector.asignacion', payloadEvento);
      if (meseroId) {
        tiempoReal?.emitir(`mesero:${meseroId}`, 'sector.asignacion', payloadEvento);
      }
      if (meseroAnteriorId && meseroAnteriorId !== Number(meseroId)) {
        tiempoReal?.emitir(`mesero:${meseroAnteriorId}`, 'sector.asignacion', payloadEvento);
      }

      res.json({
        ok: true,
        mensaje: meseroId ? 'Mesero asignado exitosamente al sector' : 'Asignación de sector liberada',
        sector_id: sectorId,
        mesero_id: meseroId ? Number(meseroId) : null,
        mesero_nombre: meseroNombre,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
