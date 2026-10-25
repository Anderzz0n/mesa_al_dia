import express from 'express';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas de Gestión de Usuarios (RF1 / CU1).
 * Base: /api/v1/usuarios
 */
export function rutaUsuarios(db, { secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Lista usuarios del restaurante (ADMIN)
  // Admite filtros opcionales: ?rol=MESERO&activo=true
  router.get('/', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const { rol, activo } = req.query;

      try {
        let sql = `
          SELECT u.id, u.nombre_usuario, u.nombre_completo, r.nombre AS rol, u.activo, u.creado_en
          FROM usuario u
          JOIN rol r ON u.rol_id = r.id
          WHERE 1=1
        `;
        const params = [];
        let cont = 1;

        if (rol) {
          sql += ` AND UPPER(r.nombre) = UPPER($${cont++})`;
          params.push(rol.trim());
        }

        if (activo !== undefined) {
          sql += ` AND u.activo = $${cont++}`;
          params.push(activo === 'true' || activo === true);
        }

        sql += ' ORDER BY u.id ASC';

        const resultado = await db.query(sql, params);
        return res.json(resultado.rows || []);
      } catch (dbErr) {
        // Fallback en memoria compartido
        let lista = [...estadoMemoria.usuarios];

        if (rol) {
          lista = lista.filter((u) => u.rol.toUpperCase() === rol.trim().toUpperCase());
        }

        if (activo !== undefined) {
          const actBool = activo === 'true' || activo === true;
          lista = lista.filter((u) => u.activo === actBool);
        }

        const saneados = lista.map((u) => ({
          id: u.id,
          nombre_usuario: u.nombre_usuario,
          nombre_completo: u.nombre_completo,
          rol: u.rol,
          activo: u.activo,
        }));

        return res.json(saneados);
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
