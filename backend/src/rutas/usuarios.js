import express from 'express';
import bcrypt from 'bcryptjs';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';
import { ErrorNegocio } from '../errores.js';

const ROLES_VALIDOS = new Set(['ADMIN', 'MESERO', 'COCINA', 'BAR', 'CAJA']);

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
      } catch (_dbErr) {
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
          creado_en: u.creado_en || new Date().toISOString(),
        }));

        return res.json(saneados);
      }
    } catch (err) {
      next(err);
    }
  });

  // POST / : Registra un nuevo usuario en el sistema (ADMIN) (CU1 / RF1)
  router.post('/', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const { nombre_usuario, nombre_completo, rol, contrasena } = req.body || {};

      if (
        !nombre_usuario ||
        typeof nombre_usuario !== 'string' ||
        nombre_usuario.trim().length < 3 ||
        nombre_usuario.trim().length > 40
      ) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          'El nombre de usuario debe tener entre 3 y 40 caracteres',
          400
        );
      }

      if (
        !nombre_completo ||
        typeof nombre_completo !== 'string' ||
        nombre_completo.trim().length < 3 ||
        nombre_completo.trim().length > 100
      ) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          'El nombre completo debe tener entre 3 y 100 caracteres',
          400
        );
      }

      const rolNormalizado = typeof rol === 'string' ? rol.trim().toUpperCase() : '';
      if (!ROLES_VALIDOS.has(rolNormalizado)) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          `Rol inválido. Roles permitidos: ${[...ROLES_VALIDOS].join(', ')}`,
          400
        );
      }

      if (!contrasena || typeof contrasena !== 'string' || contrasena.length < 6) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          'La contraseña debe tener al menos 6 caracteres',
          400
        );
      }

      const contrasenaHash = await bcrypt.hash(contrasena, 10);
      const usuarioLimpio = nombre_usuario.trim();
      const nombreLimpio = nombre_completo.trim();

      try {
        // Verificar existencia previa en base de datos
        const existente = await db.query(
          'SELECT id FROM usuario WHERE LOWER(nombre_usuario) = LOWER($1)',
          [usuarioLimpio]
        );
        if (existente.rows && existente.rows.length > 0) {
          throw new ErrorNegocio('USUARIO_DUPLICADO', 'El nombre de usuario ya está registrado', 409);
        }

        const rolRes = await db.query('SELECT id FROM rol WHERE UPPER(nombre) = $1', [rolNormalizado]);
        if (!rolRes.rows || rolRes.rows.length === 0) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'Rol no encontrado en la base de datos', 400);
        }
        const rolId = rolRes.rows[0].id;

        const insercion = await db.query(
          `INSERT INTO usuario (nombre_usuario, nombre_completo, contrasena_hash, rol_id, activo)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id, nombre_usuario, nombre_completo, creado_en, activo`,
          [usuarioLimpio, nombreLimpio, contrasenaHash, rolId]
        );

        const nuevo = insercion.rows[0];
        return res.status(201).json({
          id: nuevo.id,
          nombre_usuario: nuevo.nombre_usuario,
          nombre_completo: nuevo.nombre_completo,
          rol: rolNormalizado,
          activo: nuevo.activo,
          creado_en: nuevo.creado_en,
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        // Fallback en memoria
        const duplicadoMemoria = estadoMemoria.usuarios.some(
          (u) => u.nombre_usuario.toLowerCase() === usuarioLimpio.toLowerCase()
        );
        if (duplicadoMemoria) {
          throw new ErrorNegocio('USUARIO_DUPLICADO', 'El nombre de usuario ya está registrado', 409);
        }

        const nuevoId = Math.max(0, ...estadoMemoria.usuarios.map((u) => u.id)) + 1;
        const creadoEn = new Date().toISOString();
        const nuevoEnMemoria = {
          id: nuevoId,
          nombre_usuario: usuarioLimpio,
          nombre_completo: nombreLimpio,
          contrasena_hash: contrasenaHash,
          rol: rolNormalizado,
          activo: true,
          creado_en: creadoEn,
        };
        estadoMemoria.usuarios.push(nuevoEnMemoria);

        return res.status(201).json({
          id: nuevoEnMemoria.id,
          nombre_usuario: nuevoEnMemoria.nombre_usuario,
          nombre_completo: nuevoEnMemoria.nombre_completo,
          rol: nuevoEnMemoria.rol,
          activo: nuevoEnMemoria.activo,
          creado_en: nuevoEnMemoria.creado_en,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id : Modifica un usuario existente (ADMIN) (CU1 / RF1)
  // Permite editar nombre_completo, rol, activo
  router.patch('/:id', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const idUsuario = Number(req.params.id);
      if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'ID de usuario inválido', 400);
      }

      const { nombre_completo, rol, activo } = req.body || {};

      if (nombre_completo === undefined && rol === undefined && activo === undefined) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          'Debe especificar al menos un campo a modificar (nombre_completo, rol, activo)',
          400
        );
      }

      // Reglas de protección de la propia cuenta del administrador logueado
      if (req.usuario?.id === idUsuario) {
        if (activo === false) {
          throw new ErrorNegocio(
            'ACCION_NO_PERMITIDA',
            'No puede desactivar su propia cuenta de administrador',
            422
          );
        }
        if (rol !== undefined && rol.trim().toUpperCase() !== 'ADMIN') {
          throw new ErrorNegocio(
            'ACCION_NO_PERMITIDA',
            'No puede remover su propio rol de administrador',
            422
          );
        }
      }

      let rolNormalizado;
      if (rol !== undefined) {
        rolNormalizado = typeof rol === 'string' ? rol.trim().toUpperCase() : '';
        if (!ROLES_VALIDOS.has(rolNormalizado)) {
          throw new ErrorNegocio(
            'DATOS_INVALIDOS',
            `Rol inválido. Roles permitidos: ${[...ROLES_VALIDOS].join(', ')}`,
            400
          );
        }
      }

      if (nombre_completo !== undefined) {
        if (
          typeof nombre_completo !== 'string' ||
          nombre_completo.trim().length < 3 ||
          nombre_completo.trim().length > 100
        ) {
          throw new ErrorNegocio(
            'DATOS_INVALIDOS',
            'El nombre completo debe tener entre 3 y 100 caracteres',
            400
          );
        }
      }

      try {
        // Verificar que el usuario exista
        const existe = await db.query(
          `SELECT u.id, u.nombre_usuario, u.nombre_completo, r.nombre AS rol, u.activo
           FROM usuario u
           JOIN rol r ON u.rol_id = r.id
           WHERE u.id = $1`,
          [idUsuario]
        );

        if (!existe.rows || existe.rows.length === 0) {
          throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Usuario no encontrado', 404);
        }

        const actual = existe.rows[0];
        let rolId = null;
        if (rolNormalizado) {
          const rolRes = await db.query('SELECT id FROM rol WHERE UPPER(nombre) = $1', [rolNormalizado]);
          rolId = rolRes.rows[0].id;
        }

        const updates = [];
        const params = [];
        let cont = 1;

        if (nombre_completo !== undefined) {
          updates.push(`nombre_completo = $${cont++}`);
          params.push(nombre_completo.trim());
        }
        if (rolId !== null) {
          updates.push(`rol_id = $${cont++}`);
          params.push(rolId);
        }
        if (activo !== undefined) {
          updates.push(`activo = $${cont++}`);
          params.push(Boolean(activo));
        }

        params.push(idUsuario);
        const sqlUpdate = `
          UPDATE usuario
          SET ${updates.join(', ')}
          WHERE id = $${cont}
          RETURNING id, nombre_usuario, nombre_completo, activo, (SELECT nombre FROM rol WHERE id = usuario.rol_id) AS rol
        `;

        const resUpdate = await db.query(sqlUpdate, params);
        return res.json(resUpdate.rows[0]);
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        // Fallback en memoria
        const idx = estadoMemoria.usuarios.findIndex((u) => u.id === idUsuario);
        if (idx === -1) {
          throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Usuario no encontrado', 404);
        }

        const user = estadoMemoria.usuarios[idx];
        if (nombre_completo !== undefined) {
          user.nombre_completo = nombre_completo.trim();
        }
        if (rolNormalizado) {
          user.rol = rolNormalizado;
        }
        if (activo !== undefined) {
          user.activo = Boolean(activo);
        }

        return res.json({
          id: user.id,
          nombre_usuario: user.nombre_usuario,
          nombre_completo: user.nombre_completo,
          rol: user.rol,
          activo: user.activo,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/restablecer-contrasena : Restablecimiento asistido por administrador (RF1 / CU1)
  router.post('/:id/restablecer-contrasena', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const idUsuario = Number(req.params.id);
      if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'ID de usuario inválido', 400);
      }

      const { nueva_contrasena } = req.body || {};
      if (
        !nueva_contrasena ||
        typeof nueva_contrasena !== 'string' ||
        nueva_contrasena.length < 6
      ) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          'La nueva contraseña debe tener al menos 6 caracteres',
          400
        );
      }

      const contrasenaHash = await bcrypt.hash(nueva_contrasena, 10);

      try {
        const existe = await db.query('SELECT id FROM usuario WHERE id = $1', [idUsuario]);
        if (!existe.rows || existe.rows.length === 0) {
          throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Usuario no encontrado', 404);
        }

        await db.query('UPDATE usuario SET contrasena_hash = $1 WHERE id = $2', [
          contrasenaHash,
          idUsuario,
        ]);

        return res.json({
          ok: true,
          mensaje: 'Contraseña restablecida exitosamente',
        });
      } catch (dbErr) {
        if (dbErr instanceof ErrorNegocio) throw dbErr;

        // Fallback en memoria
        const user = estadoMemoria.usuarios.find((u) => u.id === idUsuario);
        if (!user) {
          throw new ErrorNegocio('USUARIO_NO_ENCONTRADO', 'Usuario no encontrado', 404);
        }

        user.contrasena_hash = contrasenaHash;
        return res.json({
          ok: true,
          mensaje: 'Contraseña restablecida exitosamente',
        });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
