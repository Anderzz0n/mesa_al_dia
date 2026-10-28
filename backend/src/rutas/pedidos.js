// Rutas para la gestión y consulta de pedidos (RF12 / CU13).
import express from 'express';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { obtenerPedidoPorId } from '../servicios/pedidos.js';

export function rutaPedidos(db, { secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

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

  return router;
}
