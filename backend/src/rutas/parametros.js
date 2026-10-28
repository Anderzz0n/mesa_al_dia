import express from 'express';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria } from '../db/memoria.js';

/**
 * Rutas de Parámetros Operativos del Sistema (RF6 / RF8).
 * Base: /api/v1/parametros
 */
export function rutaParametros(db, { secreto = config.jwtSecreto, tiempoReal = null } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Valores actuales de parámetros para todas las pantallas
  router.get('/', autenticar, async (req, res, next) => {
    try {
      try {
        const sql = `SELECT clave, valor FROM parametro;`;
        const resultado = await db.query(sql);
        const filas = resultado.rows || [];

        const mapa = {
          ANTICIPADA_ACTIVA_COCINA: true,
          ANTICIPADA_ACTIVA_BAR: true,
          VENTANA_CANCELACION_MINUTOS: 3,
          UMBRAL_DEMORA_COCINA_MINUTOS: 20,
          UMBRAL_DEMORA_BAR_MINUTOS: 7,
        };

        for (const fila of filas) {
          if (fila.clave === 'ANTICIPADA_ACTIVA_COCINA' || fila.clave === 'ANTICIPADA_ACTIVA_BAR') {
            mapa[fila.clave] = fila.valor === 'true';
          } else if (
            fila.clave === 'VENTANA_CANCELACION_MINUTOS' ||
            fila.clave === 'UMBRAL_DEMORA_COCINA_MINUTOS' ||
            fila.clave === 'UMBRAL_DEMORA_BAR_MINUTOS'
          ) {
            mapa[fila.clave] = Number(fila.valor);
          } else {
            mapa[fila.clave] = fila.valor;
          }
        }

        return res.json(mapa);
      } catch (dbErr) {
        // Fallback en memoria
        const p = estadoMemoria.parametros || {};
        return res.json({
          ANTICIPADA_ACTIVA_COCINA: p.ANTICIPADA_ACTIVA_COCINA === 'true',
          ANTICIPADA_ACTIVA_BAR: p.ANTICIPADA_ACTIVA_BAR === 'true',
          VENTANA_CANCELACION_MINUTOS: Number(p.VENTANA_CANCELACION_MINUTOS || 3),
          UMBRAL_DEMORA_COCINA_MINUTOS: Number(p.UMBRAL_DEMORA_COCINA_MINUTOS || 20),
          UMBRAL_DEMORA_BAR_MINUTOS: Number(p.UMBRAL_DEMORA_BAR_MINUTOS || 7),
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /anticipada : Interruptor de preparación anticipada por área (RF6 / CU12)
  // Rol: COCINA, BAR, ADMIN
  router.patch('/anticipada', autenticar, exigirRol('ADMIN', 'COCINA', 'BAR'), async (req, res, next) => {
    try {
      const { destino, activa } = req.body;

      if (!destino || activa === undefined) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Destino (COCINA o BAR) y activa (booleano) son requeridos', 400);
      }

      const destUpper = String(destino).toUpperCase();
      if (!['COCINA', 'BAR'].includes(destUpper)) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Destino debe ser COCINA o BAR', 400);
      }

      // Validar DESTINO_NO_PERMITIDO: Cocina y Bar solo gobiernan su propia área
      if (req.usuario.rol === 'COCINA' && destUpper !== 'COCINA') {
        throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
      }
      if (req.usuario.rol === 'BAR' && destUpper !== 'BAR') {
        throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
      }

      const claveParam = `ANTICIPADA_ACTIVA_${destUpper}`;
      const activaBool = Boolean(activa);
      const valorStr = String(activaBool);

      try {
        await db.query(
          `INSERT INTO parametro (clave, valor) VALUES ($1, $2)
           ON CONFLICT (clave) DO UPDATE SET valor = $2;`,
          [claveParam, valorStr]
        );
      } catch (dbErr) {
        // Fallback en memoria
        if (!estadoMemoria.parametros) estadoMemoria.parametros = {};
        estadoMemoria.parametros[claveParam] = valorStr;
      }

      // Emisión de evento en tiempo real a todas las áreas
      if (tiempoReal) {
        tiempoReal.emitir('admin', 'anticipada.estado', { destino: destUpper, activa: activaBool });
        tiempoReal.emitir('meseros', 'anticipada.estado', { destino: destUpper, activa: activaBool });
        tiempoReal.emitir('cocina', 'anticipada.estado', { destino: destUpper, activa: activaBool });
        tiempoReal.emitir('bar', 'anticipada.estado', { destino: destUpper, activa: activaBool });
      }

      return res.json({
        destino: destUpper,
        activa: activaBool,
      });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:clave : Modificación de parámetros operativos generales (RF8)
  // Rol: ADMIN
  router.patch('/:clave', autenticar, exigirRol('ADMIN'), async (req, res, next) => {
    try {
      const clave = String(req.params.clave).toUpperCase();
      const { valor } = req.body;

      if (valor === undefined || valor === null) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'El valor es requerido', 400);
      }

      // Validación de parámetros enteros positivos
      if (
        clave === 'VENTANA_CANCELACION_MINUTOS' ||
        clave === 'UMBRAL_DEMORA_COCINA_MINUTOS' ||
        clave === 'UMBRAL_DEMORA_BAR_MINUTOS'
      ) {
        const num = Number(valor);
        if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'El parámetro debe ser un entero positivo mayor a 0', 400);
        }
      }

      const valorStr = String(valor);

      try {
        await db.query(
          `INSERT INTO parametro (clave, valor) VALUES ($1, $2)
           ON CONFLICT (clave) DO UPDATE SET valor = $2;`,
          [clave, valorStr]
        );
      } catch (dbErr) {
        if (!estadoMemoria.parametros) estadoMemoria.parametros = {};
        estadoMemoria.parametros[clave] = valorStr;
      }

      return res.json({
        clave,
        valor: isNaN(Number(valor)) ? valorStr : Number(valor),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
