// GET /api/v1/salud
// Responde si el servidor está vivo y si puede hablar con la base de datos.
// Sirve para comprobar que todo está bien configurado y, más adelante, para
// que el despliegue (tarea 13.1) sepa si el sistema está funcionando.
import { Router } from 'express';

export function rutaSalud(db) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      await db.query('SELECT 1'); // la consulta más barata posible
      res.json({ estado: 'ok', base_de_datos: 'ok' });
    } catch {
      // 503 = "servicio no disponible": el servidor vive pero no puede trabajar
      res.status(503).json({ estado: 'degradado', base_de_datos: 'error' });
    }
  });

  return router;
}
