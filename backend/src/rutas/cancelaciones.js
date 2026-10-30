// Rutas para consulta y resolución de cancelaciones de pedidos por Caja y Admin (RF8 · CU18, CU19).
import express from 'express';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  listarCancelaciones,
  resolverCancelacion,
} from '../servicios/cancelaciones.js';

export function rutaCancelaciones(db, { tiempoReal = null, secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Lista cancelaciones por resolver (SOLICITADA) o resueltas del día (APROBADA, RECHAZADA) (CU18)
  router.get(
    '/',
    autenticar,
    exigirRol('CAJA', 'ADMIN'),
    async (req, res, next) => {
      try {
        const { estado, fecha } = req.query;
        const resultado = await listarCancelaciones({
          estado,
          fecha,
          db,
        });
        return res.json(resultado);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /:id/resolucion : Aprueba o rechaza una cancelación solicitada, con declaración de preparados si aplica (CU18, CU19)
  router.post(
    '/:id/resolucion',
    autenticar,
    exigirRol('CAJA', 'ADMIN'),
    async (req, res, next) => {
      try {
        const cancelacionId = req.params.id;
        const { decision, preparados } = req.body || {};
        const respuesta = await resolverCancelacion({
          cancelacionId,
          decision,
          preparados,
          usuarioAutenticado: req.usuario,
          db,
          tiempoReal,
        });
        return res.json(respuesta);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
