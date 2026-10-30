// Rutas para el ciclo de vida, confirmación y gestión de comandas (RF7 · CU15, RF6, RF8).
import express from 'express';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  listarComandas,
  confirmarRecepcionComanda,
  cambiarEstadoComanda,
  acusarCancelacionComanda,
} from '../servicios/comandas.js';

export function rutaComandas(db, { tiempoReal = null, secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Lista de comandas para tablero kanban de Cocina y Bar con filtros (RF7)
  router.get(
    '/',
    autenticar,
    exigirRol('COCINA', 'BAR', 'ADMIN'),
    async (req, res, next) => {
      try {
        const { destino, estado, fecha, acuse } = req.query;
        const resultado = await listarComandas({
          destino,
          estado,
          fecha,
          acuse,
          usuarioAutenticado: req.usuario,
          db,
        });
        return res.json(resultado);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /:id/confirmacion : Confirmación de recepción y detección de discrepancia de ítems (RF7 · CU15)
  router.post(
    '/:id/confirmacion',
    autenticar,
    exigirRol('COCINA', 'BAR', 'ADMIN'),
    async (req, res, next) => {
      try {
        const comandaId = req.params.id;
        const { items_confirmados } = req.body || {};
        const respuesta = await confirmarRecepcionComanda({
          comandaId,
          itemsConfirmados: items_confirmados,
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

  // PATCH /:id : Transición de estado a EN_PREPARACION o LISTA (RF7)
  router.patch(
    '/:id',
    autenticar,
    exigirRol('COCINA', 'BAR', 'ADMIN'),
    async (req, res, next) => {
      try {
        const comandaId = req.params.id;
        const { estado } = req.body || {};
        const respuesta = await cambiarEstadoComanda({
          comandaId,
          nuevoEstado: estado,
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

  // POST /:id/acuse-cancelacion : Acuse de recibo de comanda cancelada (RF8)
  router.post(
    '/:id/acuse-cancelacion',
    autenticar,
    exigirRol('COCINA', 'BAR', 'ADMIN'),
    async (req, res, next) => {
      try {
        const comandaId = req.params.id;
        const respuesta = await acusarCancelacionComanda({
          comandaId,
          usuarioAutenticado: req.usuario,
          db,
        });
        return res.json(respuesta);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
