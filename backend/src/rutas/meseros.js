import express from 'express';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';

/**
 * Rutas de Meseros (RF15 / CU24: Consulta de actividad diaria del mesero).
 * Base: /api/v1/meseros
 */
export function rutaMeseros(db, { secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET /:id/actividad?fecha= : Pedidos del día sin los cancelados
  // Rol: ADMIN; o MESERO solo consultando su propia actividad
  router.get('/:id/actividad', autenticar, exigirRol('ADMIN', 'MESERO'), async (req, res, next) => {
    try {
      const meseroId = Number(req.params.id);

      // Si el rol es MESERO, solo puede ver su propia actividad
      if (req.usuario.rol === 'MESERO' && Number(req.usuario.id) !== meseroId) {
        throw new ErrorNegocio('ACCESO_DENEGADO', 'No tiene permisos para ver la actividad de otro mesero', 403);
      }

      const { fecha } = req.query;

      try {
        const sql = `
          SELECT 
            p.id AS pedido_id,
            p.cuenta_id,
            c.etiqueta AS cuenta_etiqueta,
            c.mesa_id,
            m.numero AS mesa_numero,
            s.nombre AS sector_nombre,
            p.creado_en
          FROM pedido p
          JOIN cuenta c ON c.id = p.cuenta_id
          JOIN mesa m ON m.id = c.mesa_id
          LEFT JOIN sector s ON s.id = m.sector_id
          WHERE p.mesero_id = $1
            AND DATE(p.creado_en) = COALESCE($2::date, CURRENT_DATE)
            AND NOT EXISTS (
              SELECT 1 FROM cancelacion x
              WHERE x.pedido_id = p.id AND x.estado = 'APROBADA'
            )
          ORDER BY p.creado_en DESC;
        `;

        const resultado = await db.query(sql, [meseroId, fecha || null]);
        const pedidos = resultado.rows || [];

        // Agrupar conteo de pedidos por mesa para la pantalla "Mi día" (M12)
        const porMesaMap = new Map();
        for (const p of pedidos) {
          const num = p.mesa_numero;
          if (!porMesaMap.has(num)) {
            porMesaMap.set(num, { mesa: num, sector: p.sector_nombre, pedidos: 0 });
          }
          porMesaMap.get(num).pedidos += 1;
        }

        const mesasUnicas = new Set(pedidos.map((p) => p.mesa_numero)).size;
        const totalFacturado = pedidos.reduce((acc, p) => acc + (Number(p.total) || 0), 0);

        return res.json({
          mesero_id: meseroId,
          fecha: fecha || new Date().toISOString().slice(0, 10),
          total_pedidos: pedidos.length,
          total_facturado: totalFacturado,
          mesas_atendidas: mesasUnicas,
          cancelaciones_excluidas: 0,
          pedidos_por_mesa: Array.from(porMesaMap.values()),
          pedidos,
        });
      } catch (dbErr) {
        // Fallback en desarrollo / preview cuando PostgreSQL no tiene pedidos registrados
        try {
          const mod = await import('../db/datos_ejemplo_actividad.js');
          if (typeof mod.obtenerEjemploActividad === 'function') {
            return res.json(mod.obtenerEjemploActividad(meseroId, fecha));
          }
        } catch {
          // Archivo opcional no disponible
        }

        return res.json({
          mesero_id: meseroId,
          fecha: fecha || new Date().toISOString().slice(0, 10),
          total_pedidos: 0,
          total_facturado: 0,
          mesas_atendidas: 0,
          cancelaciones_excluidas: 0,
          pedidos_por_mesa: [],
          pedidos: [],
        });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
