import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Crea middlewares de autenticación y autorización basados en JWT.
 * @param {string} secreto - Clave secreta para verificar tokens JWT.
 */
export function crearMiddlewareAuth(secreto = config.jwtSecreto) {
  return {
    /**
     * Exige cabecera Authorization: Bearer <token> válida.
     */
    autenticar(req, res, siguiente) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          codigo: 'NO_AUTENTICADO',
          mensaje: 'Debe iniciar sesión para acceder a este recurso',
        });
      }

      const token = authHeader.slice(7).trim();
      try {
        const decodificado = jwt.verify(token, secreto);
        req.usuario = decodificado;
        siguiente();
      } catch (error) {
        return res.status(401).json({
          codigo: 'NO_AUTENTICADO',
          mensaje: 'Sesión no válida o expirada',
        });
      }
    },

    /**
     * Middleware de autorización por rol: verifica que el usuario autenticado
     * tenga uno de los roles permitidos.
     * @param {...string} rolesPermitidos - Lista de roles permitidos ('ADMIN', 'MESERO', etc.)
     */
    exigirRol(...rolesPermitidos) {
      return (req, res, siguiente) => {
        if (!req.usuario) {
          return res.status(401).json({
            codigo: 'NO_AUTENTICADO',
            mensaje: 'Debe iniciar sesión para acceder a este recurso',
          });
        }

        if (!rolesPermitidos.includes(req.usuario.rol)) {
          return res.status(403).json({
            codigo: 'ACCESO_DENEGADO',
            mensaje: 'No tiene permisos para realizar esta acción',
          });
        }

        siguiente();
      };
    },
  };
}
