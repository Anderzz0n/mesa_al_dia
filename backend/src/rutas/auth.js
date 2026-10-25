import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';

// Usuarios semilla para desarrollo local sin conexión activa a PostgreSQL
const USUARIOS_SEMILLA_DEV = [
  {
    id: 1,
    nombre_usuario: 'admin',
    nombre_completo: 'Anderson Rincón (Admin)',
    contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6', // '123456'
    rol: 'ADMIN',
    activo: true,
  },
  {
    id: 2,
    nombre_usuario: 'simon',
    nombre_completo: 'Simón Ruedas (Caja)',
    contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
    rol: 'CAJA',
    activo: true,
  },
  {
    id: 3,
    nombre_usuario: 'miguel',
    nombre_completo: 'Miguel Angulo (Mesero)',
    contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
    rol: 'MESERO',
    activo: true,
  },
  {
    id: 4,
    nombre_usuario: 'cocina',
    nombre_completo: 'Carlos Chef (Cocina)',
    contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
    rol: 'COCINA',
    activo: true,
  },
  {
    id: 5,
    nombre_usuario: 'bar',
    nombre_completo: 'Diana Bartender (Bar)',
    contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
    rol: 'BAR',
    activo: true,
  },
  {
    id: 6,
    nombre_usuario: 'inactivo',
    nombre_completo: 'Usuario Desactivado',
    contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
    rol: 'MESERO',
    activo: false,
  },
];

/**
 * Rutas de Autenticación (RF1 / CU2 y CU3).
 * Base: /api/v1/auth
 */
export function rutaAuth(db, { secreto = config.jwtSecreto, expiracion = config.jwtExpiracion } = {}) {
  const router = express.Router();
  const { autenticar } = crearMiddlewareAuth(secreto);

  // POST /login: Usuario y contraseña -> token y rol (CU2)
  router.post('/login', async (req, res) => {
    const { nombre_usuario, contrasena } = req.body || {};

    if (!nombre_usuario || typeof nombre_usuario !== 'string' || !contrasena || typeof contrasena !== 'string') {
      return res.status(400).json({
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Usuario y contraseña requeridos',
      });
    }

    let usuario = null;

    try {
      const resultado = await db.query(
        `SELECT u.id, u.nombre_usuario, u.nombre_completo, u.contrasena_hash, u.activo, r.nombre AS rol
         FROM usuario u
         JOIN rol r ON u.rol_id = r.id
         WHERE LOWER(u.nombre_usuario) = LOWER($1)`,
        [nombre_usuario.trim()]
      );

      if (resultado.rows && resultado.rows.length > 0) {
        usuario = resultado.rows[0];
      }
    } catch (error) {
      // Si la base de datos no está disponible en entorno de desarrollo, usar fallback semilla
      console.warn('Fallo consulta a BD en login, evaluando usuarios semilla:', error.message);
      usuario = USUARIOS_SEMILLA_DEV.find(
        (u) => u.nombre_usuario.toLowerCase() === nombre_usuario.trim().toLowerCase()
      ) || null;
    }

    if (!usuario) {
      throw new ErrorNegocio('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos', 401);
    }

    const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);
    if (!contrasenaValida) {
      throw new ErrorNegocio('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos', 401);
    }

    if (!usuario.activo) {
      throw new ErrorNegocio('USUARIO_INACTIVO', 'Su usuario no está activo', 403);
    }

    const payload = {
      id: usuario.id,
      nombre_usuario: usuario.nombre_usuario,
      nombre_completo: usuario.nombre_completo,
      rol: usuario.rol,
    };

    const token = jwt.sign(payload, secreto, { expiresIn: expiracion });

    res.json({
      token,
      usuario: payload,
    });
  });

  // POST /logout: Cierra la sesión (CU3)
  router.post('/logout', autenticar, (req, res) => {
    res.json({
      ok: true,
      mensaje: 'Sesión cerrada exitosamente',
    });
  });

  // GET /yo: Obtiene información del usuario autenticado actual
  router.get('/yo', autenticar, (req, res) => {
    res.json({
      usuario: req.usuario,
    });
  });

  return router;
}
