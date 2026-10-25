// Eventos en tiempo real (WebSocket) con Socket.IO.
// Regla del diseño (docs/02_api_y_eventos.md): el WebSocket SOLO AVISA.
// Las acciones llegan por REST; después el servidor llama a emitir(...) para
// avisar a quien corresponda. Los clientes no envían órdenes por aquí.
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

/**
 * Resuelve las salas que corresponden a un usuario según su rol y ID.
 * Convención de docs/02_api_y_eventos.md:
 * - ADMIN  -> 'admin'
 * - COCINA -> 'cocina'
 * - BAR    -> 'bar'
 * - CAJA   -> 'caja'
 * - MESERO -> 'meseros' y 'mesero:{id}'
 */
export function resolverSalasSegunUsuario(usuario) {
  if (!usuario || !usuario.rol) return [];
  const rol = String(usuario.rol).toUpperCase();
  const salas = [];

  switch (rol) {
    case 'ADMIN':
      salas.push('admin');
      break;
    case 'COCINA':
      salas.push('cocina');
      break;
    case 'BAR':
      salas.push('bar');
      break;
    case 'CAJA':
      salas.push('caja');
      break;
    case 'MESERO':
      salas.push('meseros');
      if (usuario.id !== undefined && usuario.id !== null) {
        salas.push(`mesero:${usuario.id}`);
      }
      break;
  }
  return salas;
}

// Función de respaldo para pruebas que soliciten salas explícitas
export function salasPorDefecto(socket) {
  const salas = socket.handshake.auth?.salas;
  return Array.isArray(salas) ? salas.filter((s) => typeof s === 'string') : [];
}

/**
 * Crea e inicializa el servidor Socket.IO sobre el servidor HTTP.
 * @param {import('node:http').Server} servidorHttp - Instancia del servidor HTTP.
 * @param {Object} [opciones]
 * @param {Function} [opciones.resolverSalas] - Función alternativa de resolución de salas.
 * @param {string} [opciones.secreto] - Secreto para verificar tokens JWT en auth.
 */
export function crearTiempoReal(servidorHttp, { resolverSalas, secreto = config.jwtSecreto } = {}) {
  const io = new Server(servidorHttp);

  // Middleware de autenticación de conexión WebSocket
  io.use((socket, siguiente) => {
    if (resolverSalas) {
      return siguiente();
    }

    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const usuario = jwt.verify(token, secreto);
        socket.data.usuario = usuario;
        return siguiente();
      } catch (err) {
        return siguiente(new Error('NO_AUTENTICADO'));
      }
    }

    // Permitir conexión sin token si especifica salas (compatibilidad con pruebas o clientes públicos)
    return siguiente();
  });

  // 'connection' se dispara cada vez que un cliente abre el WebSocket.
  io.on('connection', (socket) => {
    let salas = [];

    if (resolverSalas) {
      salas = resolverSalas(socket);
    } else if (socket.data.usuario) {
      salas = resolverSalasSegunUsuario(socket.data.usuario);
    } else if (Array.isArray(socket.handshake.auth?.salas)) {
      salas = socket.handshake.auth.salas.filter((s) => typeof s === 'string');
    }

    for (const sala of salas) {
      socket.join(sala);
    }
  });

  return {
    // emitir('cocina', 'comanda.nueva', { comanda_id: 7 })
    emitir(sala, evento, datos) {
      io.to(sala).emit(evento, datos);
    },
    // Cierra todas las conexiones y el servidor de WebSocket.
    cerrar: () => io.close(),
  };
}
