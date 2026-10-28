import express from 'express';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas de Categorías de la Carta (RF3).
 * Base: /api/v1/categorias
 */
export function rutaCategorias(db, { secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar } = crearMiddlewareAuth(secreto);

  // GET / : Categorías ordenadas por orden ASC
  // Accesible por cualquier usuario autenticado
  router.get('/', autenticar, async (req, res, next) => {
    try {
      try {
        const sql = `SELECT id, nombre, orden FROM categoria ORDER BY orden ASC, id ASC;`;
        const resultado = await db.query(sql);
        return res.json(resultado.rows || []);
      } catch (dbErr) {
        // Fallback en memoria si la BD no está conectada
        const cats = (estadoMemoria.categorias || []).slice().sort((a, b) => a.orden - b.orden);
        return res.json(cats);
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
