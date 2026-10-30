// Rutas para la gestión y consulta de pedidos y cancelaciones (RF12, RF8 / CU13, CU17, CU18).
import express from 'express';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { obtenerPedidoPorId, listarPedidosDelDia } from '../servicios/pedidos.js';
import { procesarCancelacionPedido } from '../servicios/cancelaciones.js';

export function rutaPedidos(db, { tiempoReal = null, secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Lista de pedidos con filtros para vista de resumen de Caja y Admin (K6 / Obj 6)
  router.get(
    '/',
    autenticar,
    exigirRol('CAJA', 'ADMIN', 'MESERO'),
    async (req, res, next) => {
      try {
        const { fecha } = req.query || {};
        const resultado = await listarPedidosDelDia({ fecha, db });
        return res.json(resultado);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /:id : Consulta del detalle completo de un pedido con sus ítems, comanda y mesero
  router.get(
    '/:id',
    autenticar,
    exigirRol('MESERO', 'CAJA', 'COCINA', 'BAR', 'ADMIN'),
    async (req, res, next) => {
      try {
        const pedido = await obtenerPedidoPorId(req.params.id, db);
        return res.json({
          hora_servidor: new Date().toISOString(),
          pedido,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /:id/cancelaciones : Cancela directamente o solicita cancelación de un pedido (RF8 · CU17, CU18)
  router.post(
    '/:id/cancelaciones',
    autenticar,
    exigirRol('MESERO', 'CAJA', 'ADMIN'),
    async (req, res, next) => {
      try {
        const pedidoId = req.params.id;
        const { motivo, preparados } = req.body || {};

        const cancelacion = await procesarCancelacionPedido({
          pedidoId,
          motivo,
          usuarioAutenticado: req.usuario,
          preparados,
          db,
          tiempoReal,
        });

        return res.status(201).json({
          hora_servidor: new Date().toISOString(),
          cancelacion,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
